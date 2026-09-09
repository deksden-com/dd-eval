import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { commandText, commandJson } from "./process-json.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]").replace(/((?:password|token|secret|api_key)[=:]\s*)[^\s&]+/gi, "$1[redacted]");
export async function runBaselineAdmission({ caseRoot, definition, projectRoot, outputRoot, checkpoint, beforeCommand = async () => {}, runtimeScope = null }) {
  if (!definition?.file || path.isAbsolute(definition.file) || definition.file.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(definition.sha256 ?? "")) fail("Case requires a pinned baseline admission definition", "baseline_admission_missing");
  const bytes = await readFile(path.join(caseRoot, definition.file));
  if (hash(bytes) !== definition.sha256) fail("Baseline admission definition differs from its pin", "baseline_admission_definition_mismatch");
  const policy = JSON.parse(bytes);
  if (policy.schema_id !== "dd-eval/baseline-admission-policy@1" || !Array.isArray(policy.commands) || !policy.commands.length) fail("Invalid baseline admission policy", "baseline_admission_invalid");
  for (const item of policy.commands) {
    if (!/^[a-z0-9-]+$/.test(item.id ?? "") || typeof item.command !== "string" || !Array.isArray(item.args) || item.args.some(arg => typeof arg !== "string") || !Number.isInteger(item.timeout_ms) || item.timeout_ms < 1 || item.timeout_ms > 600000) fail("Invalid baseline admission command", "baseline_admission_invalid");
  }
  await mkdir(outputRoot, { recursive: true });
  const before = await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  const receipt = { schema_id: "dd-eval/baseline-admission@1", checkpoint_id: checkpoint.value.id, checkpoint_sha256: checkpoint.sha256, policy_sha256: definition.sha256, source_commit: checkpoint.value.source.commit, materialized_commit: before, started_at: new Date().toISOString(), status: "running", checks: [] };
  const file = path.join(outputRoot, "receipt.json");
  await writeJsonAtomic(file, receipt);
  for (const item of policy.commands) {
    await beforeCommand(item.id);
    const result = await execute(item, projectRoot, runtimeScope);
    const log = `${item.id}.log`;
    const output = redact(result.output);
    await writeFile(path.join(outputRoot, log), output);
    receipt.checks.push({ id: item.id, exit_code: result.code, timed_out: result.timed_out, log, log_sha256: hash(output) });
    await writeJsonAtomic(file, receipt);
    if (result.code !== 0) { receipt.status = "failed"; break; }
  }
  const dirty = await commandText("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: projectRoot });
  if (dirty || await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) !== before) receipt.status = "source_changed";
  if (receipt.status === "running") receipt.status = "passed";
  receipt.finished_at = new Date().toISOString();
  await writeJsonAtomic(file, receipt);
  if (receipt.status !== "passed") fail(`Pre-feature baseline admission ${receipt.status}; see ${file}`, "baseline_admission_failed");
  return { file, sha256: hash(await readFile(file)), status: receipt.status, policy_sha256: definition.sha256 };
}
async function execute(item, cwd, runtimeScope) {
  if (runtimeScope && (!path.isAbsolute(runtimeScope.bin ?? "") || !path.isAbsolute(runtimeScope.home ?? "") || !path.isAbsolute(runtimeScope.resourceHome ?? "") || !runtimeScope.budget?.scope_id || !runtimeScope.operationId)) fail("Baseline requires a retained runtime scope", "runtime_scope_identity_missing");
  const gate = `const {spawn}=require('node:child_process'); let input='';process.stdin.on('data',bytes=>{input+=bytes;});process.stdin.once('end',()=>{if(!input)process.exit(1);const item=JSON.parse(input);const child=spawn(item.command,item.args,{stdio:'inherit'});child.once('error',()=>process.exit(1));child.once('exit',(code)=>process.exit(code??1));});`;
  const child = spawn(runtimeScope ? process.execPath : item.command, runtimeScope ? ["-e", gate] : item.args, { cwd, env: process.env, detached: true, stdio: [runtimeScope ? "pipe" : "ignore", "pipe", "pipe"] });
  const completed = new Promise((resolve, reject) => {
    let output = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void stopProcessGroup(child, 5000).catch(reject); }, item.timeout_ms);
    const append = chunk => { output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut }); });
  });
  // Registration can still be in flight when timeout rejects completion.
  void completed.catch(() => {});
  if (!runtimeScope) return completed;
  const env = { DD_FLOW_HOME: runtimeScope.home, DD_FLOW_RESOURCE_HOME: runtimeScope.resourceHome };
  const call = args => commandJson(runtimeScope.bin, ["runtime", "process", ...args], { cwd, env });
  let record;
  try {
    const registered = await call(["register", "--kind", "eval-baseline", "--owner", runtimeScope.budget.scope_id, "--role", "probe", "--operation", `${runtimeScope.operationId}:${item.id}`, "--budget-json", JSON.stringify(runtimeScope.budget), "--owner-pid", String(process.pid)]);
    record = registered.process;
    if (!child.pid || !record?.id || !record.lease_token) fail("Baseline process registration failed", "process_ownership_unknown");
    await call(["confirm", "--id", record.id, "--lease-token", record.lease_token, "--pid", String(child.pid), "--process-group-id", String(child.pid)]);
    await call(["check-admission", "--id", record.id, "--lease-token", record.lease_token]);
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ command: item.command, args: item.args }));
    return await completed;
  } finally {
    await stopProcessGroup(child);
    if (record) await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]);
  }
}

export async function verifyBaselineAdmission({ reference, definition, checkpoint }) {
  if (!reference?.file || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("Execution has no retained baseline admission; use a new checkpoint", "baseline_admission_unconfirmed");
  const bytes = await readFile(reference.file);
  if (hash(bytes) !== reference.sha256) fail("Retained baseline admission was modified", "baseline_admission_evidence_mismatch");
  const receipt = JSON.parse(bytes);
  if (receipt.status !== "passed" || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.policy_sha256 !== definition?.sha256 || !receipt.checks?.length || receipt.checks.some(check => check.exit_code !== 0)) fail("Retained baseline admission does not qualify this execution", "baseline_admission_unconfirmed");
  return receipt;
}
