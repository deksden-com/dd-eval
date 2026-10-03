import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { commandText } from "./process-json.mjs";
import { runtimeMaintenance } from "./runtime-maintenance.mjs";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";
import { errorRecord } from "./operation-errors.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]").replace(/((?:password|token|secret|api_key)[=:]\s*)[^\s&]+/gi, "$1[redacted]");
export async function readBaselineAdmissionPolicy({ caseRoot, definition }) {
  if (!definition?.file || path.isAbsolute(definition.file) || definition.file.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(definition.sha256 ?? "")) fail("Case requires a pinned baseline admission definition", "baseline_admission_missing");
  const bytes = await readFile(path.join(caseRoot, definition.file));
  if (hash(bytes) !== definition.sha256) fail("Baseline admission definition differs from its pin", "baseline_admission_definition_mismatch");
  const policy = JSON.parse(bytes);
  if (policy.schema_id !== "dd-eval/baseline-admission-policy@1" || !Array.isArray(policy.commands) || !policy.commands.length) fail("Invalid baseline admission policy", "baseline_admission_invalid");
  for (const item of policy.commands) {
    if (!/^[a-z0-9-]+$/.test(item.id ?? "") || typeof item.command !== "string" || !Array.isArray(item.args) || item.args.some(arg => typeof arg !== "string") || !Number.isInteger(item.timeout_ms) || item.timeout_ms < 1 || item.timeout_ms > 600000) fail("Invalid baseline admission command", "baseline_admission_invalid");
  }
  return policy;
}

export async function runBaselineAdmission({ caseRoot, definition, projectRoot, outputRoot, checkpoint, beforeCommand = async () => {}, runtimeScope = null }) {
  const policy = await readBaselineAdmissionPolicy({ caseRoot, definition });
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
  let cleanup;
  let armCommandTimeout;
  const settle = () => cleanup ??= stopProcessGroup(child, 5000);
  const completed = new Promise((resolve, reject) => {
    let output = "", timedOut = false;
    let timer;
    armCommandTimeout = () => { timer = setTimeout(() => { timedOut = true; void settle().catch(cleanup => reject(Object.assign(new Error(`Baseline ${item.id} timed out and cleanup is unconfirmed`), { code: 'baseline_timeout', details: { command: item.command, timeout_ms: item.timeout_ms }, cleanup_error: errorRecord(cleanup) }))); }, item.timeout_ms); };
    if (!runtimeScope) armCommandTimeout();
    const append = chunk => { output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut }); });
  });
  // Registration can still be in flight when timeout rejects completion.
  void completed.catch(() => {});
  const env = runtimeScope ? { DD_FLOW_HOME: runtimeScope.home, DD_FLOW_RESOURCE_HOME: runtimeScope.resourceHome } : {};
  let maintenance;
  const call = async args => {
    maintenance ??= await runtimeMaintenance({ ddFlowBin: runtimeScope.bin, ddFlowHome: runtimeScope.home, resourceHome: runtimeScope.resourceHome, cwd, env });
    const options = {};
    for (let i = 1; i < args.length; i += 2) options[args[i].replace(/^--/, "")] = args[i + 1];
    return await maintenance.call(args[0], options);
  };
  let record, primary;
  const observe = async () => {
    const result = await completed;
    if (result.code !== 0) primary = Object.assign(new Error(`Baseline ${item.id} failed`), { code: result.timed_out ? 'baseline_timeout' : 'baseline_command_failed', details: { command: item.command, exit_code: result.code, timed_out: result.timed_out } });
    return result;
  };
  try {
    if (!runtimeScope) return await observe();
    const processId = `PROC-${randomUUID()}`, operation = `${runtimeScope.operationId}:${item.id}`;
    const owns = candidate => {
      if (!candidate || candidate.id !== processId || typeof candidate.lease_token !== "string" || !candidate.lease_token || candidate.kind !== "eval-baseline" || candidate.owner_id !== runtimeScope.budget.scope_id || candidate.operation_id !== operation || candidate.project_id || candidate.run_id || candidate.work_id || candidate.check_id) return false;
      try {
        const metadata = JSON.parse(candidate.metadata_json);
        return metadata?.dd_flow_home === path.resolve(runtimeScope.home) && metadata.role === "probe" && metadata.owner_pid === process.pid && hashJson(metadata.budget) === hashJson(runtimeScope.budget);
      } catch { return false; }
    };
    let registered;
    try { registered = await call(["register", "--id", processId, "--kind", "eval-baseline", "--owner", runtimeScope.budget.scope_id, "--role", "probe", "--operation", operation, "--budget-json", JSON.stringify(runtimeScope.budget), "--owner-pid", String(process.pid)]); }
    catch (error) {
      // Read-only recovery of timeout-after-COMMIT; never repeat registration.
      if (error.details?.cleanup_unconfirmed) throw error;
      const candidate = (await call(["status"]).catch(() => null))?.processes?.find(process => process.id === processId);
      if (!owns(candidate)) throw error;
      registered = { ok: true, process: candidate };
    }
    const candidate = registered?.process;
    if (registered?.ok !== true || !owns(candidate)) fail("Baseline registration omitted its exact retained binding", "process_maintenance_receipt_invalid");
    // Do not adopt or finalize an unrelated registration returned by the CLI.
    record = candidate;
    if (!child.pid) fail("Baseline process registration failed", "process_ownership_unknown");
    const confirmation = await call(["confirm", "--id", record.id, "--lease-token", record.lease_token, "--pid", String(child.pid), "--process-group-id", String(child.pid)]), confirmed = confirmation?.process;
    if (confirmation?.ok !== true || !owns(confirmed) || confirmed.lease_token !== record.lease_token || confirmed.pid !== child.pid || confirmed.state !== "running" || !Number.isFinite(Date.parse(confirmed.lease_expires_at)) || Date.parse(confirmed.lease_expires_at) <= Date.now() || !/^[a-f0-9]{64}$/.test(confirmed.registration_sha256 ?? "")) fail("Baseline confirmation omitted its committed owner/expiry", "process_maintenance_receipt_invalid");
    const admitted = await call(["check-admission", "--id", record.id, "--lease-token", record.lease_token]);
    if (admitted?.ok !== true || admitted.admitted !== true || admitted.process_id !== record.id) fail("Baseline admission omitted its exact process binding", "process_maintenance_receipt_invalid");
    child.stdin.on("error", () => {});
    // The policy bounds the productive command, not CLI owner admission.
    // The blocked gate remains subject to the retained scope's stop fence.
    armCommandTimeout();
    child.stdin.end(JSON.stringify({ command: item.command, args: item.args }));
    return await observe();
  } catch (error) { primary = error; throw error; }
  finally {
    try {
      await settle();
      if (record) await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]);
    } catch (error) { if (primary) { primary.cleanup_error ??= errorRecord(error); throw primary; } throw error; }
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
