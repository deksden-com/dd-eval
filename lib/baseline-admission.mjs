import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { commandText } from "./process-json.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]").replace(/((?:password|token|secret|api_key)[=:]\s*)[^\s&]+/gi, "$1[redacted]");
export async function runBaselineAdmission({ caseRoot, definition, projectRoot, outputRoot, checkpoint }) {
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
    const result = await execute(item, projectRoot);
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
function execute(item, cwd) {
  return new Promise(resolve => {
    const child = spawn(item.command, item.args, { cwd, env: process.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", timedOut = false, escalation;
    const stop = signal => { if (!child.pid) return; try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; } };
    const timer = setTimeout(() => { timedOut = true; stop("SIGTERM"); escalation = setTimeout(() => stop("SIGKILL"), 5000); escalation.unref(); }, item.timeout_ms);
    const append = chunk => { output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); if (escalation) clearTimeout(escalation); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); if (escalation) clearTimeout(escalation); resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut }); });
  });
}

export async function verifyBaselineAdmission({ reference, definition, checkpoint }) {
  if (!reference?.file || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("Execution has no retained baseline admission; use a new checkpoint", "baseline_admission_unconfirmed");
  const bytes = await readFile(reference.file);
  if (hash(bytes) !== reference.sha256) fail("Retained baseline admission was modified", "baseline_admission_evidence_mismatch");
  const receipt = JSON.parse(bytes);
  if (receipt.status !== "passed" || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.policy_sha256 !== definition?.sha256 || !receipt.checks?.length || receipt.checks.some(check => check.exit_code !== 0)) fail("Retained baseline admission does not qualify this execution", "baseline_admission_unconfirmed");
  return receipt;
}
