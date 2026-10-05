import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { commandText } from "./process-json.mjs";
import { runtimeMaintenance, observeRuntimeLease } from "./runtime-maintenance.mjs";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { ObservationClock } from "./observation-clock.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]").replace(/((?:password|token|secret|api_key)[=:]\s*)[^\s&]+/gi, "$1[redacted]");
export async function readBaselineAdmissionPolicy({ caseRoot, definition }) {
  if (!definition?.file || path.isAbsolute(definition.file) || definition.file.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(definition.sha256 ?? "")) fail("Case requires a pinned baseline admission definition", "baseline_admission_missing");
  const bytes = await readFile(path.join(caseRoot, definition.file));
  if (hash(bytes) !== definition.sha256) fail("Baseline admission definition differs from its pin", "baseline_admission_definition_mismatch");
  const policy = JSON.parse(bytes);
  if (!["dd-eval/baseline-admission-policy@1", "dd-eval/baseline-admission-policy@2"].includes(policy.schema_id) || !Array.isArray(policy.commands) || !policy.commands.length) fail("Invalid baseline admission policy", "baseline_admission_invalid");
  const sliding = policy.schema_id.endsWith("@2");
  for (const item of policy.commands) {
    const duration = sliding ? item.inactivity_timeout_ms : item.timeout_ms;
    if (!/^[a-z0-9-]+$/.test(item.id ?? "") || typeof item.command !== "string" || !Array.isArray(item.args) || item.args.some(arg => typeof arg !== "string") || !Number.isInteger(duration) || duration < 1 || duration > 600000 || (sliding ? "timeout_ms" : "inactivity_timeout_ms") in item) fail("Invalid baseline admission command", "baseline_admission_invalid");
  }
  return policy;
}

export async function runBaselineAdmission({ caseRoot, definition, projectRoot, outputRoot, checkpoint, beforeCommand = async () => {}, runtimeScope = null }) {
  const policy = await readBaselineAdmissionPolicy({ caseRoot, definition });
  await mkdir(outputRoot, { recursive: true });
  const before = await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  const sliding = policy.schema_id.endsWith("@2");
  const receipt = { schema_id: `dd-eval/baseline-admission@${sliding ? 2 : 1}`, policy_schema_id: policy.schema_id, checkpoint_id: checkpoint.value.id, checkpoint_sha256: checkpoint.sha256, policy_sha256: definition.sha256, source_commit: checkpoint.value.source.commit, materialized_commit: before, started_at: new Date().toISOString(), status: "running", checks: [] };
  const file = path.join(outputRoot, "receipt.json");
  await writeJsonAtomic(file, receipt);
  try {
    for (const item of policy.commands) {
      await beforeCommand(item.id);
      const result = await execute(item, projectRoot, runtimeScope, sliding);
      const log = `${item.id}.log`;
      const output = redact(result.output);
      await writeFile(path.join(outputRoot, log), output);
      receipt.checks.push({ id: item.id, exit_code: result.code, timed_out: result.timed_out, ...(sliding ? { timeout_kind: "inactivity", inactivity_timeout_ms: item.inactivity_timeout_ms, native_outcome: result.timed_out ? "unknown" : "exited", observation: result.observation_lost ? "lost" : result.timed_out ? "quiet" : "terminal", cleanup: "settled" } : {}), log, log_sha256: hash(output) });
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
  } catch (error) {
    if (!receipt.finished_at) {
      receipt.status = "failed";
      receipt.finished_at = new Date().toISOString();
      receipt.error = JSON.parse(JSON.stringify(errorRecord(error), (_key, value) => typeof value === "string" ? redact(value) : value));
      try { await writeJsonAtomic(file, receipt); }
      catch (persistence) { error.details = { ...error.details, baseline_receipt_error: errorRecord(persistence) }; }
    }
    throw error;
  }
}
async function execute(item, cwd, runtimeScope, sliding) {
  if (runtimeScope && (!path.isAbsolute(runtimeScope.bin ?? "") || !path.isAbsolute(runtimeScope.home ?? "") || !path.isAbsolute(runtimeScope.resourceHome ?? "") || !runtimeScope.budget?.scope_id || !runtimeScope.operationId)) fail("Baseline requires a retained runtime scope", "runtime_scope_identity_missing");
  const gate = `const {spawn}=require('node:child_process'); let input='';process.stdin.on('data',bytes=>{input+=bytes;});process.stdin.once('end',()=>{if(!input)process.exit(1);const item=JSON.parse(input);const child=spawn(item.command,item.args,{stdio:'inherit'});child.once('error',()=>process.exit(1));child.once('exit',(code)=>process.exit(code??1));});`;
  const child = spawn(runtimeScope ? process.execPath : item.command, runtimeScope ? ["-e", gate] : item.args, { cwd, env: process.env, detached: true, stdio: [runtimeScope ? "pipe" : "ignore", "pipe", "pipe"] });
  let cleanup;
  let armCommandTimeout;
  let lease, leaseFailure;
  let rejectCompleted;
  const settle = () => cleanup ??= stopProcessGroup(child, 5000);
  const completed = new Promise((resolve, reject) => {
    rejectCompleted = reject;
    let output = "", timedOut = false, observationLost = false;
    let timer, clock, cursor = 0;
    const timeoutMs = sliding ? item.inactivity_timeout_ms : item.timeout_ms;
    const timeout = () => { timedOut = true; void settle().catch(cleanup => reject(Object.assign(new Error(`Baseline ${item.id} timed out and cleanup is unconfirmed`), { code: 'baseline_timeout', details: { command: item.command, timeout_ms: timeoutMs }, cleanup_error: errorRecord(cleanup) }))); };
    armCommandTimeout = () => {
      if (sliding) { clock = new ObservationClock({ timeoutMs }); clock.sample(cursor); timer = setInterval(() => { if (clock.sample(cursor)) { observationLost = clock.observationLost; clearInterval(timer); timeout(); } }, Math.min(1000, timeoutMs)); }
      else timer = setTimeout(timeout, timeoutMs);
    };
    if (!runtimeScope) armCommandTimeout();
    const append = chunk => { cursor += 1; clock?.sample(cursor, Date.now()); output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut, observation_lost: observationLost }); });
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
    if (leaseFailure) throw leaseFailure;
    if (result.code !== 0) primary = Object.assign(new Error(`Baseline ${item.id} failed`), { code: result.observation_lost ? 'operation_observation_lost' : result.timed_out ? 'baseline_timeout' : 'baseline_command_failed', details: { command: item.command, exit_code: result.code, timed_out: result.timed_out, observation_lost: result.observation_lost } });
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
      if (error.details?.cleanup_unconfirmed || error.code === "process_ownership_unconfirmed") throw error;
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
    // Ownership/admission is independent of the command's @1/@2 clock policy.
    // Use one monitored grant; a second raw check would bypass its ACK budget.
    record = confirmed;
    lease = observeRuntimeLease(maintenance, record, { onFailure: error => {
      leaseFailure = error;
      void settle().catch(cleanup => { error.cleanup_error ??= errorRecord(cleanup); }).finally(() => rejectCompleted(error));
    } });
    await lease.admission();
    child.stdin.on("error", () => {});
    // The policy bounds the productive command, not CLI owner admission.
    // The blocked gate remains subject to the retained scope's stop fence.
    armCommandTimeout();
    child.stdin.end(JSON.stringify({ command: item.command, args: item.args }));
    return await observe();
  } catch (error) { primary = error; throw error; }
  finally {
    try {
      let closingError;
      try { await lease?.close(); } catch (error) { closingError = error; }
      // Even uncertain renewal drain cannot leave the owned gate/command
      // running. Do not finalize its lease without successful closing proof.
      await settle();
      if (closingError) throw closingError;
      if (record) await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]);
    } catch (error) { if (primary) { primary.cleanup_error ??= errorRecord(error); throw primary; } throw error; }
  }
}

export async function verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot = null }) {
  if (!reference?.file || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("Execution has no retained baseline admission; use a new checkpoint", "baseline_admission_unconfirmed");
  const bytes = await readFile(reference.file);
  if (hash(bytes) !== reference.sha256) fail("Retained baseline admission was modified", "baseline_admission_evidence_mismatch");
  const receipt = JSON.parse(bytes);
  if (caseRoot && definition?.file) {
    const policy = await readBaselineAdmissionPolicy({ caseRoot, definition });
    if (receipt.schema_id !== `dd-eval/baseline-admission@${policy.schema_id.endsWith("@2") ? 2 : 1}`) fail("Retained baseline receipt belongs to another policy contract", "baseline_admission_unconfirmed");
    if (!Array.isArray(receipt.checks) || receipt.checks.length !== policy.commands.length || receipt.checks.some((check, index) => check.id !== policy.commands[index].id || policy.schema_id.endsWith("@2") && check.inactivity_timeout_ms !== policy.commands[index].inactivity_timeout_ms)) fail("Retained baseline commands differ from their pinned policy", "baseline_admission_unconfirmed");
  }
  if (!["dd-eval/baseline-admission@1", "dd-eval/baseline-admission@2"].includes(receipt.schema_id) || receipt.schema_id.endsWith("@2") && (receipt.policy_schema_id !== "dd-eval/baseline-admission-policy@2" || receipt.checks?.some(check => check.timeout_kind !== "inactivity" || !Number.isInteger(check.inactivity_timeout_ms) || check.inactivity_timeout_ms < 1 || check.inactivity_timeout_ms > 600000 || check.cleanup !== "settled" || check.native_outcome !== "exited"))) fail("Retained baseline policy contract is invalid", "baseline_admission_unconfirmed");
  if (receipt.status !== "passed" || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.policy_sha256 !== definition?.sha256 || !receipt.checks?.length || receipt.checks.some(check => check.exit_code !== 0)) fail("Retained baseline admission does not qualify this execution", "baseline_admission_unconfirmed");
  return receipt;
}
