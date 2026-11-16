import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { childEnvironment } from "../process-json.mjs";
import { runtimeMaintenance, observeRuntimeLease } from "../runtime-maintenance.mjs";
import { hashJson } from "../runner-events.mjs";
import { stopProcessGroup } from "../managed-daemon.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { ObservationClock } from "../observation-clock.mjs";

const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, ...(details ? { details } : {}) }); };

/** Execute a baseline command with owned process, lease and settlement tracking. */
export async function executeBaselineCommand(item, cwd, runtimeScope, sliding, runner = null, resourceEnv = {}) {
  if (runtimeScope && (!path.isAbsolute(runtimeScope.bin ?? "") || !path.isAbsolute(runtimeScope.home ?? "") || !path.isAbsolute(runtimeScope.resourceHome ?? "") || !runtimeScope.budget?.scope_id || !runtimeScope.operationId)) fail("Baseline requires a retained runtime scope", "runtime_scope_identity_missing");
  const gate = `const {spawn}=require('node:child_process'); let input='';process.stdin.on('data',bytes=>{input+=bytes;});process.stdin.once('end',()=>{if(!input)process.exit(1);const item=JSON.parse(input);const child=spawn(item.command,item.args,{stdio:'inherit'});child.once('error',()=>process.exit(1));child.once('exit',(code)=>process.exit(code??1));});`;
  const child = spawn(runtimeScope ? process.execPath : item.command, runtimeScope ? ["-e", gate] : item.args, { cwd, env: childEnvironment({ ...runner?.env, ...resourceEnv }), detached: true, stdio: [runtimeScope ? "pipe" : "ignore", "pipe", "pipe"] });
  let cleanup;
  let armCommandTimeout;
  let lease, leaseFailure, progressFailure;
  let rejectCompleted;
  const settle = () => cleanup ??= stopProcessGroup(child, 5000);
  const completed = new Promise((resolve, reject) => {
    rejectCompleted = reject;
    let output = "", timedOut = false, observationLost = false;
    let timer, clock, cursor = 0, runnerPhase = "startup";
    const timeoutMs = sliding ? item.inactivity_timeout_ms : item.timeout_ms;
    const timeout = () => { timedOut = true; void settle().catch(cleanup => reject(Object.assign(new Error(`Baseline ${item.id} timed out and cleanup is unconfirmed`), { code: 'baseline_timeout', details: { command: item.command, timeout_ms: clock?.timeoutMs ?? timeoutMs, ...(runner ? { phase: runnerPhase, sequence: cursor } : {}) }, cleanup_error: errorRecord(cleanup) }))); };
    armCommandTimeout = () => {
      if (runner || sliding) {
        clock = new ObservationClock({ timeoutMs: runner ? runner.durations.startupMs : timeoutMs }); clock.sample(cursor);
        timer = setInterval(() => {
          try { if (runner) {
            for (const event of runner.api.readRunnerProgress(runner.progress, runner.binding.invocation_id, cursor)) { cursor = event.sequence; if (event.phase === "execution") runnerPhase = "execution"; clock.sample(cursor, Date.parse(event.at)); }
            clock.timeoutMs = runnerPhase === "execution" ? runner.durations.executionMs : runner.durations.startupMs;
          }
          if (clock.sample(cursor)) { observationLost = clock.observationLost; clearInterval(timer); timeout(); }
          } catch (error) { progressFailure = error; clearInterval(timer); void settle().catch(cleanup => { error.cleanup_error ??= errorRecord(cleanup); }).finally(() => reject(error)); }
        }, Math.min(1000, timeoutMs));
      }
      else timer = setTimeout(timeout, timeoutMs);
    };
    if (!runtimeScope) armCommandTimeout();
    const append = chunk => { if (!runner) { cursor += 1; clock?.sample(cursor, Date.now()); } output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); if (progressFailure) reject(progressFailure); else resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut, observation_lost: observationLost }); });
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
  let record, primary, observedResult;
  const observe = async () => {
    const result = await completed;
    if (leaseFailure) throw leaseFailure;
    if (result.code !== 0) primary = Object.assign(new Error(`Baseline ${item.id} failed`), { code: result.observation_lost ? 'operation_observation_lost' : result.timed_out ? 'baseline_timeout' : 'baseline_command_failed', details: { command: item.command, exit_code: result.code, timed_out: result.timed_out, observation_lost: result.observation_lost } });
    observedResult = result;
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
      if (observedResult && child.pid) observedResult.execution_settlement = { schema_id: 'dd-eval/baseline-execution-settlement@1', state: 'settled',
        pid: child.pid, process_id: record?.id ?? null, pid_started_at: record?.pid_started_at ?? null, observed_at: new Date().toISOString() };
      if (closingError) throw closingError;
      if (record) await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]);
    } catch (error) {
      if (primary) { primary.cleanup_error ??= errorRecord(error); throw primary; }
      if (observedResult?.execution_settlement) {
        observedResult.cleanup = 'pending';
        observedResult.technical_notes = [{ code: 'baseline_registry_retirement_pending', message: 'Physical execution stopped; registry retirement is unconfirmed', phase: 'cleanup' }];
      } else throw error;
    }
  }
}
