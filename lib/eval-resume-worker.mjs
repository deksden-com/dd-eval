import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { assertControlResumeSource, runnerControlResume, runnerControlStatus, runnerResume, runnerCleanup, runnerCleanupReceipt, runnerFinalizeSettled } from "./runner.mjs";
import { appendEvent, hashJson, readEvents, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { runtimeMaintenance, observeRuntimeLease } from "./runtime-maintenance.mjs";
import { errorRecord, isObservationLoss } from "./operation-errors.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
import { workerCleanupFailure, needsFailureReconciliation, cleanupGoalComplete } from "./recovery/worker-attempt.mjs";
export { workerCleanupFailure, needsFailureReconciliation, cleanupGoalComplete } from "./recovery/worker-attempt.mjs";
import { evalResumeWorkerFile, attemptRoot, runnerFile, continuationTerminal } from "./recovery/worker-attempt.mjs";
export { evalResumeWorkerFile } from "./recovery/worker-attempt.mjs";
export { evalResumeWorkerStatus, workerLiveness, evalRunnerAttemptsStatus } from "./recovery/eval-worker-status.mjs";
import { recoveryObservationBudget, withRecoveryObservation } from "./recovery-observation-budget.mjs";
import { retireEval } from "./eval-retirement.mjs";

const entrypoint = fileURLToPath(import.meta.url);
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));

export { requestEvalRun, requestRunnerContinuation, requestEvalResume } from "./recovery/continuation-request.mjs";

async function runWorker(file) {
  const initial = await read(file), intent = initial.intent;
  if (intent?.kind === "cleanup" && (intent.goal !== undefined && !["native_settlement", "local_retirement"].includes(intent.goal)
    || intent.mode !== undefined && !["reconcile", "defer"].includes(intent.mode))) fail("Unknown cleanup contract", "control_request_invalid");
  const ordinary = ["run", "resume", "cleanup"].includes(intent?.kind);
  if (initial.schema_id !== "dd-eval/resume-worker@1" || !path.isAbsolute(intent?.eval_root ?? "") || file !== (ordinary ? runnerFile(intent.eval_root, intent.request_id) : evalResumeWorkerFile(intent.eval_root, intent.request_id))) fail("Invalid EVAL continuation identity", "control_request_invalid");
  const root = intent.eval_root;
  // This lock owns only experiment observation, never the managed RUN. A
  // duplicate child waits for the current owner and reuses its durable result.
  await withRunnerLock(`${root}.resume-observer`, async () => {
    let saved = await read(file), record = null, recordValidated = false, call, lease;
    const observation = recoveryObservationBudget(saved);
    const publishRootFailure = async () => {
      if (intent.kind === "cleanup") return;
      if (saved.status === "recovery_blocked" || saved.status === "failed" && (!ordinary || saved.process_id)) await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: intent.run_id, type: saved.status === "failed" ? "dev.dd.eval.recovery_failed" : "dev.dd.eval.recovery_blocked", id: `resume-worker:${intent.request_id}:${saved.status}`, deduplicate: true, data: { state: saved.status, request_id: intent.request_id, error: saved.error } });
    };
    await publishRootFailure();
    if (continuationTerminal(saved)) return;
    const self = (await processSnapshot()).find(item => item.pid === process.pid);
    if (!self || self.zombie || self.pgid !== process.pid) fail("EVAL observer requires its own detached process group", "process_ownership_unknown");
    const publish = async update => {
      if (update.status === "recovery_blocked") {
        const startedAt = new Date().toISOString();
        try {
          // Reserve the last second of the existing budget for read-only local
          // control receipts. This is diagnostics, never settlement proof.
          const timeout = Math.min(1000, observation.timeout());
          update.final_observation = { started_at: startedAt, ...(await withRecoveryObservation(observation, () => runnerControlStatus({ evalRoot: root, signal: AbortSignal.timeout(timeout) }))), finished_at: new Date().toISOString() };
        } catch (error) { update.final_observation = { started_at: startedAt, finished_at: new Date().toISOString(), unavailable: true, observation_complete: false, error: errorRecord(error) }; }
        observation.exhausted();
      }
      return withRunnerLock(file, async () => {
      const current = await read(file); // Never recreate a removed experiment.
      if (current.schema_id !== initial.schema_id || hashJson(current.intent) !== hashJson(intent)) fail("EVAL continuation intent changed", "control_request_conflict");
      saved = { ...current, ...update, recovery_observation: observation.state(), owner_pid: process.pid, owner_started_at: self.started, updated_at: new Date().toISOString() };
      await writeJsonAtomic(file, saved);
      await publishRootFailure();
      const directory = attemptRoot(root, intent.request_id);
      await mkdir(directory, { recursive: true });
      await appendFile(path.join(directory, "events.jsonl"), `${JSON.stringify({ at: saved.updated_at, status: saved.status, owner_pid: saved.owner_pid, owner_started_at: self.started, error: saved.error ?? null })}\n`, { mode: 0o600 });
      });
    };
    let heartbeatPending = null;
    const heartbeat = setInterval(() => {
      if (intent.kind === "cleanup") return;
      if (heartbeatPending) return;
      heartbeatPending = (async () => {
        const projection=(await import('./runner-events.mjs')).reduceEvents(await readEvents(path.join(root,'events.jsonl')));
        if(projection.control||projection.cancellation)await publish({heartbeat_at:new Date().toISOString()});
        else await appendEvent(path.join(root,"events.jsonl"), {source:"dd-eval://runner",runId:intent.run_id,type:"dev.dd.eval.observer.heartbeat",data:{owner_pid:process.pid,owner_started_at:self.started,request_id:intent.request_id}});
        const {reconcileEvalHealth} = await import("./recovery/runner-health.mjs");
        await reconcileEvalHealth({evalRoot:root,apply:true});
      })().catch(() => {}).finally(() => { heartbeatPending = null; });
    }, 30_000);
    heartbeat.unref();
    try {
      const bytes = await readFile(path.join(root, "manifest.json"));
      if (sha256(bytes) !== intent.manifest_sha256) fail("EVAL manifest changed before continuation", "runner_definition_drift");
      const manifest = JSON.parse(bytes), args = { evalRoot: root, requestId: intent.request_id, fromRequestId: intent.source_request_id };
      if (!ordinary) assertControlResumeSource(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, intent.request_id, intent.source_request_id);
      await publish({ status: "observing", error: null });
      const terminalCleanup = async () => {
        try {
          // One bounded recognition read is allowed after the mutable recovery
          // budget is spent. It cannot ingest, dispatch, or renew that budget.
          const result = await runnerCleanupReceipt({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256, detailed: true });
          if (result?.cleanup_state === "settled") return result;
          await publish({ cleanup_observation: result });
        } catch (error) { await publish({ cleanup_observation: { cleanup_state: "unknown", error: errorRecord(error) } }); }
        return null;
      };
      if (intent.kind === "cleanup") {
        for (;;) {
          if (observation.exhausted(true, 1000)) {
            // A Subject/Judge receipt cannot prove all-role local retirement.
            const result = intent.goal === "local_retirement" ? null : await terminalCleanup();
            if (result) { await publish({ status: "completed", result, error: null }); return; }
            await publish({ status: "recovery_blocked", error: { code: "recovery_observation_budget_exhausted", message: "Cleanup remains unconfirmed; a new explicit cleanup request is required" } });
            return;
          }
          const result = await withRecoveryObservation(observation, () => intent.goal === "local_retirement"
            ? retireEval({ evalRoot: root, intent })
            : runnerCleanup({ evalRoot: root, requestId: intent.request_id, expectedManifestSha256: intent.manifest_sha256 }));
          if (intent.goal === 'local_retirement' && result.physical_stopped === true) {
            // This owner can ingest already sealed evidence, never dispatch a
            // Subject or a missing Judge. Assessment after exit needs explicit
            // finalization authority, while cleanup remains independently done.
            try { result.projection = await runnerCleanup({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256 }); }
            catch (error) { result.projection_error = errorRecord(error); }
          }
          observation.observe(result);
          const complete = cleanupGoalComplete(intent.goal, result);
          await publish({ result, status: complete ? "completed" : "settling" });
          if (complete) return;
          if (intent.goal !== "local_retirement" && result.cleanup_observation?.capture === "unknown") {
            await publish({ status: "recovery_blocked", error: { code: "recovery_capture_unavailable", message: "Failed execution capture cannot be verified" } });
            return;
          }
          await delay(observation.nextDelay(1000));
        }
      }
      while (!ordinary) {
        if (observation.exhausted(true, 1000)) {
          // One final read of the existing native release precedes budget
          // failure. Local journal projection is allowed; no native mutation.
          let scope, observationError;
          try { scope = await runnerControlResume({ ...args, waitMs: 1000, observeOnlyRuntime: true }); }
          catch (error) { observationError = errorRecord(error); }
          if (scope?.pending === false) { await publish({ scope_result: scope, status: "released", error: null }); break; }
          await publish({ status: "recovery_blocked", error: { code: "recovery_observation_budget_exhausted", message: "Scope release has no confirmed settlement within the active observation budget", ...(observationError ? { cause: observationError } : {}) } });
          return;
        }
        const scope = await withRecoveryObservation(observation, () => runnerControlResume(args));
        observation.observe(scope);
        await publish({ scope_result: scope, status: scope.pending ? "observing" : "released" });
        if (!scope.pending) break;
        await delay(observation.nextDelay(1000));
      }
      // Registration before release would change its captured inventory. Only
      // now can this local writer acquire productive scope admission.
      const env = { DD_FLOW_HOME: path.join(root, "control-runtime"), DD_FLOW_RESOURCE_HOME: manifest.runtime_resource_home, DD_FLOW_BIN: manifest.runtime_control_bin, DD_FLOW_ENGINE_MODE: "1" };
      const maintenance = await runtimeMaintenance({ ddFlowBin: manifest.runtime_control_bin, ddFlowHome: env.DD_FLOW_HOME, resourceHome: env.DD_FLOW_RESOURCE_HOME, cwd: root, env });
      call = args => {
        const options = {};
        for (let i = 1; i < args.length; i += 2) options[args[i].replace(/^--/, "")] = args[i + 1];
        return maintenance.call(args[0], options);
      };
      const operation = `${manifest.run_id}:observer:${sha256(intent.request_id)}`;
      const budget = { schema_id: "dd-flow/runtime-budget@1", scope_id: manifest.run_id, per_harness: {} };
      const owns = candidate => {
        if (!candidate?.id || !candidate.lease_token || candidate.kind !== "eval-observer" || candidate.owner_id !== manifest.run_id || candidate.operation_id !== operation || !candidate.pid || !candidate.pid_started_at || candidate.project_id || candidate.run_id || candidate.work_id || candidate.check_id) return false;
        try {
          const metadata = JSON.parse(candidate.metadata_json);
          return metadata.role === "observer" && metadata.dd_flow_home === env.DD_FLOW_HOME && metadata.process_group_id === candidate.pid && hashJson(metadata.budget) === hashJson(budget);
        } catch { return false; }
      };
      const observerId = `PROC-${randomUUID()}`;
      const register = () => call(["register", "--id", observerId, "--kind", "eval-observer", "--owner", manifest.run_id, "--pid", String(process.pid), "--process-group-id", String(process.pid), "--operation", operation, "--role", "observer", "--budget-json", JSON.stringify(budget)]);
      try {
        record = (await register()).process;
      } catch (error) {
        // Registry visibility proves COMMIT, not retirement of the mutable
        // registration child. Never admit a second writer without exit proof.
        if (error.details?.cleanup_unconfirmed || error.code === "process_ownership_unconfirmed") throw error;
        const listed = await call(["status"]), processes = await processSnapshot();
        const matches = listed.processes?.filter(item => item.kind === "eval-observer" && item.owner_id === manifest.run_id && item.operation_id === operation && ["starting", "running", "stopping", "orphaned"].includes(item.state));
        if (matches?.length !== 1 || !owns(matches[0])) throw error;
        const prior = matches[0], physical = processes.find(item => item.pid === prior.pid && item.started === prior.pid_started_at.trim().replace(/\s+/g, " "));
        if (prior.pid === process.pid && physical && !physical.zombie && prior.state === "running") record = prior;
        else {
          // Never steal a live observer or treat an expired lease as death.
          if (physical && !physical.zombie || prior.pid === process.pid) throw error;
          await call(["stop", "--id", prior.id, "--lease-token", prior.lease_token]);
          record = (await register()).process;
        }
      }
      if (!owns(record) || record.pid !== process.pid || record.state !== "running" || record.pid_started_at.trim().replace(/\s+/g, " ") !== self.started) fail("Observer registration omitted its current physical owner", "process_ownership_unknown");
      recordValidated = true;
      lease = observeRuntimeLease(maintenance, record);
      await publish({ status: "continuing", process_id: record.id, owner_started_at: self.started, definition: manifest.definition, events_file: path.join(root, "events.jsonl"), stdout: path.join(attemptRoot(root, intent.request_id), "stdout.log"), stderr: path.join(attemptRoot(root, intent.request_id), "stderr.log") });
      let settleDelay = 1_000;
      let lastSettlingUpdate = 0;
      let cleanupPending = needsFailureReconciliation(saved.result);
      observation.exhausted(false);
      for (;;) {
        if (observation.exhausted(cleanupPending, 1000) && cleanupPending) {
          await terminalCleanup();
          await lease.admission();
          // Cleanup recognition requires physical settlement, but scored
          // finalization validates capture independently. A late sealed capture
          // may admit Judge while background resources still await retirement.
          const finalized = await runnerFinalizeSettled({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256,
            authorizeFinalization: () => lease.admission() });
          await publish({ status: "finishing", result: finalized, error: null }); break;
        }
        if (!cleanupPending) await lease.admission();
        try {
          let result = cleanupPending
            ? await withRecoveryObservation(observation, () => runnerCleanup({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256 }))
            : await runnerResume({ evalRoot: root, ...(!ordinary ? { resumeRequestId: intent.request_id } : {}), expectedManifestSha256: intent.manifest_sha256 });
          if (cleanupPending && captureReady(result)) {
            await lease.admission();
            result = await runnerFinalizeSettled({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256, authorizeFinalization: () => lease.admission() });
          }
          // Productive subject/Judge work has its own activity policy. Start
          // the recovery clock only once failure cleanup is actually pending.
          if (!cleanupPending) observation.exhausted(false);
          cleanupPending = needsFailureReconciliation(result);
          if (result.execution_state === "failed" && result.cleanup_observation?.capture === "unknown") {
            if (allExecutionsTerminal(result)) {
              await lease.admission();
              result = await runnerFinalizeSettled({ evalRoot: root, expectedManifestSha256: intent.manifest_sha256,
                authorizeFinalization: () => lease.admission() });
              await publish({ status: "finishing", result, error: null }); break;
            }
          }
          if (result.state === "recovery_blocked" && result.cleanup_state === "blocked") {
            const failed = result.executions?.find(item => item.recovery?.capture_error?.code === "recovery_blocked");
            await publish({ status: "recovery_blocked", result, error: failed ? errorRecord({ ...failed, message: failed.error }) : { code: "recovery_blocked", message: "Managed recovery is blocked" } });
            return;
          }
          if (cleanupPending) observation.observe(result);
          // A failed execution whose managed cleanup/capture is still pending
          // has no authorized new Subject dispatch, but it does need this same
          // observer to reconcile the already-issued control operation.
          // A managed RUN can have accepted dispatch but temporarily lack a
          // controller reply. The detached owner must reattach; publishing a
          // terminal worker receipt here strands fork --start at awaiting_provider.
          if (result.state === "awaiting_provider" || result.judge_status === "in_progress" || cleanupPending) {
            if (Date.now() - lastSettlingUpdate >= 5_000) {
              await publish({ status: "settling", result, error: null });
              lastSettlingUpdate = Date.now();
            }
            await delay(cleanupPending ? observation.nextDelay(1000) : settleDelay);
            settleDelay = settleDelay < 2_000 ? 2_000 : settleDelay < 5_000 ? 5_000 : 10_000;
            continue;
          }
          settleDelay = 250;
          await publish({ status: "finishing", result, error: null });
          break;
        } catch (error) {
          // Loss of observation does not end a RUN. Reattach through the shared
          // journal-aware path; neither restart a native turn nor retire its owner.
          if (!isObservationLoss(error) && error.code !== "runner_lock_timeout") throw error;
          await publish({ status: "observation_lost", error: errorRecord(error) });
          await delay(1000);
        }
      }
    } catch (error) {
      observation.exhausted();
      await publish({ status: observation.state().remaining_ms === 0 || error.code === "process_ownership_unconfirmed" || error.details?.cleanup_unconfirmed ? "recovery_blocked" : error.code === "managed_run_waiting_for_user" ? "waiting_for_user" : ["control_request_stale", "managed_run_controlled", "runtime_scope_controlled", "runtime_scope_stopped"].includes(error.code) ? "superseded" : "failed", error: errorRecord(error) });
    } finally {
      clearInterval(heartbeat);
      await heartbeatPending;
      const cleanupHandoff = intent.kind !== "cleanup" && (saved.status === "finishing" || saved.result?.execution_state === "failed" || saved.status === "failed" && !isObservationLoss(saved.error));
      const cleanupRequest = { evalRoot: root, kind: "cleanup", requestId: `auto-cleanup:${sha256(intent.request_id)}`, cleanupOrigin: "automatic" };
      let cleanupAccepted = false;
      if (cleanupHandoff) {
        try { await requestRunnerContinuation({ ...cleanupRequest, deferSpawn: true }); cleanupAccepted = true; }
        catch (error) { await publish({ cleanup_error: errorRecord(error) }); }
      }
      if (recordValidated) {
        try { await lease?.close(); await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]); }
        catch (error) { await publish(workerCleanupFailure(saved, error)); }
      }
      if (saved.status === "finishing") await publish({ status: "completed" });
      if (cleanupAccepted) {
        // Hand off only after this productive observer releases its registration.
        // Cleanup's worker is outside the target runtime scope and can retire it.
        try { await requestRunnerContinuation(cleanupRequest); }
        catch (error) { await publish({ cleanup_error: errorRecord(error) }); }
      }
    }
  }, { timeoutMs: 60_000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  const file = path.resolve(process.argv[2] ?? "");
  runWorker(file).catch(async error => {
    process.stderr.write(`${JSON.stringify(errorRecord(error))}\n`); process.exitCode = 1;
    // A duplicate observer that never acquired ownership cannot overwrite the
    // active owner's receipt merely because waiting for its lock timed out.
    if (error.code === "runner_lock_timeout") return;
    try {
      await withRunnerLock(file, async () => {
        const saved = await read(file);
        await writeJsonAtomic(file, { ...saved, status: "failed", error: errorRecord(error), updated_at: new Date().toISOString() });
      });
    } catch (persistError) { process.stderr.write(`${JSON.stringify({ persistence_error: errorRecord(persistError) })}\n`); }
  });
}
