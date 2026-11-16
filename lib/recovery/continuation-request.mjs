import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { registerRunHome, registryEnvironment } from "../homes.mjs";
import { assertControlResumeSource, evalRun, validateControlResumeInput, prepareRunnerContinuation } from "../runner.mjs";
import { hashJson, readEvents, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { errorRecord, reportedError } from "../operation-errors.mjs";
import { processSnapshot } from "../process-snapshot.mjs";
import { ensureWorker, evalResumeWorkerFile, preparedManifest, runnerFile, continuationTerminal } from "./worker-attempt.mjs";
import { workerLiveness } from "./eval-worker-status.mjs";
import { recoveryObservationBudget, withRecoveryObservation } from "../recovery-observation-budget.mjs";
import { cleanupBinding, cleanupSidecars, retireEval } from "../eval-retirement.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));

/** Ordinary run/resume use the same physical owner as operator continuation. */
export async function requestEvalRun({ profileFile, expectedInputs }) {
  const prepared = await evalRun({ profileFile, prepareOnly: true, expectedInputs });
  return requestRunnerContinuation({ evalRoot: prepared.root, kind: "run" });
}

/** Retain and dispatch one idempotent run, resume or cleanup request. */
export async function requestRunnerContinuation({ evalRoot, kind = "resume", requestId = randomUUID(), deferReason, maintenanceHome, maintenanceBin, inlineCleanup = false, cleanupCall, cleanupOrigin = "operator", deferSpawn = false }) {
  if (!["run", "resume", "cleanup"].includes(kind)) fail("Invalid runner attempt kind", "control_request_invalid");
  validateControlResumeInput({ requestId, waitMs: 0 });
  const root = path.resolve(evalRoot), { bytes, manifest } = await preparedManifest(root);
  const file = runnerFile(root, requestId);
  const intent = { eval_root: root, run_id: manifest.run_id, request_id: requestId, kind, manifest_sha256: sha256(bytes) };
  let retained;
  try { retained = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (retained && retained.schema_id !== "dd-eval/resume-worker@1") fail("Unknown retained attempt schema", "control_request_invalid");
  const legacyCleanup = kind === "cleanup" && deferReason === undefined && maintenanceHome === undefined && maintenanceBin === undefined
    && (retained && retained.intent?.goal === undefined || !Object.hasOwn(manifest, "runtime_control_bin") && !Object.hasOwn(manifest, "runtime_resource_home"));
  if (kind === "cleanup" && !legacyCleanup) {
    if (deferReason !== undefined && (typeof deferReason !== "string" || !deferReason.trim() || Buffer.byteLength(deferReason) > 4096)) fail("Cleanup reason must contain 1..4096 UTF-8 bytes", "control_request_invalid");
    const binding = await cleanupBinding(root, manifest, { maintenanceHome, maintenanceBin });
    if (!["operator", "automatic", "prelaunch"].includes(cleanupOrigin)) fail("Invalid cleanup origin", "control_request_invalid");
    Object.assign(intent, { origin: cleanupOrigin, mode: deferReason === undefined ? "reconcile" : "defer", goal: "local_retirement", target_binding_digest: hashJson(binding),
      maintenance_home: binding.maintenance_home, maintenance_bin: binding.maintenance_bin, ...(deferReason === undefined ? {} : { defer_reason: deferReason }) });
  }
  if (retained) {
    if (hashJson(retained.intent) !== hashJson(intent)) fail("Attempt request identifies another intent", "control_request_conflict");
    if (continuationTerminal(retained) && !inlineCleanup) return { root, run_id: manifest.run_id, accepted: true, pending: retained.status !== "completed", result: retained.result ?? null, continuation: { file, status: retained.status } };
  }
  if (kind !== "cleanup") {
    await prepareRunnerContinuation(manifest, await readEvents(path.join(root, "events.jsonl")));
  }
  await registerRunHome(root, registryEnvironment(manifest));
  await mkdir(path.dirname(file), { recursive: true });
  await withRunnerLock(file, async () => {
    let existing;
    try { existing = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing) {
      if (hashJson(existing.intent) !== hashJson(intent)) fail("Attempt request identifies another intent", "control_request_conflict");
    } else await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent, status: "requested" });
  });
  if (kind === "cleanup" && (deferReason !== undefined || inlineCleanup)) {
    // The observer lock serializes defer with the beginning of a physical stop.
    // Never promise to keep alive a process another accepted request is stopping.
    if (deferReason !== undefined) {
      const stopping = (await cleanupSidecars(root)).find(saved => saved.intent.request_id !== requestId && saved.intent.mode !== "defer" && ["requested", "observing", "settling", "completed"].includes(saved.status));
      if (stopping) {
        const result = { code: "stop_already_in_progress", request_id: stopping.intent.request_id, receipt: stopping.result ?? null };
        await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent, status: "completed", result });
        return { root, accepted: true, result };
      }
    }
    return withRunnerLock(`${root}.resume-observer`, async () => {
      const previous = await read(file), budget = recoveryObservationBudget(previous);
      let result;
      try {
        budget.timeout();
        result = await withRecoveryObservation(budget, () => retireEval({ evalRoot: root, intent, ...(cleanupCall ? { call: cleanupCall } : {}) }));
      } catch (error) {
        const exhausted = budget.exhausted();
        if (error.code === "recovery_observation_budget_exhausted" && previous.error)
          error.cause ??= previous.error.code === error.code ? previous.error.cause : previous.error;
        try {
          await withRunnerLock(file, () => writeJsonAtomic(file, { ...previous, status: exhausted ? "recovery_blocked" : "settling", error: errorRecord(error),
            recovery_observation: { ...budget.state(), observer_started: false }, updated_at: new Date().toISOString() }));
        } catch (publicationError) { error.cleanup_error ??= errorRecord(publicationError); }
        throw error;
      }
      budget.observe(result);
      const complete = deferReason !== undefined || result.physical_stopped === true;
      await withRunnerLock(file, () => writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent, status: complete ? "completed" : "settling", result,
        recovery_observation: { ...budget.state(), observer_started: false }, updated_at: new Date().toISOString() }));
      return { root, run_id: manifest.run_id, accepted: true, result };
    });
  }
  const current = await read(file);
  if (deferSpawn) return { root, run_id: manifest.run_id, accepted: true, pending: true, continuation: { file, status: current.status } };
  const terminal = continuationTerminal(current);
  const live = current.owner_pid ? workerLiveness(current, await processSnapshot()).state === "alive" : false;
  if (!terminal && !live) await ensureWorker(file, root, requestId, registryEnvironment(manifest));
  return { root, run_id: manifest.run_id, accepted: true, pending: current.status !== "completed", continuation: { file, status: current.status } };
}

/** Accept experiment continuation outside the captured journal. The child owns
 * observation; a caller's wait budget never owns or cancels productive work. */
export async function requestEvalResume({ evalRoot, requestId, fromRequestId, waitMs = 0 }) {
  validateControlResumeInput({ requestId, waitMs });
  const deadline = performance.now() + (waitMs || 60_000), signal = AbortSignal.timeout(waitMs || 60_000), progress = { accepted: false };
  try { return await acceptAndObserve({ evalRoot, requestId, fromRequestId, waitMs }, signal, progress); }
  catch (error) {
    if (!(signal.aborted && ["AbortError", "TimeoutError"].includes(error.name)) && !(error.code === "runner_lock_timeout" && performance.now() >= deadline)) throw error;
    return { root: path.resolve(evalRoot), request_id: requestId, source_request_id: fromRequestId, ok: progress.accepted, accepted: progress.accepted ? true : null, runtime_accepted: null,
      pending: true, observation_timed_out: true, continuation: { file: evalResumeWorkerFile(evalRoot, requestId), status: "admission_unknown" } };
  }
}

async function acceptAndObserve({ evalRoot, requestId, fromRequestId, waitMs }, signal, progress) {
  const deadline = performance.now() + waitMs, root = path.resolve(evalRoot);
  const { bytes: manifestBytes, manifest } = await preparedManifest(root);
  const source = assertControlResumeSource(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, requestId, fromRequestId);
  if (!path.isAbsolute(manifest.runtime_control_bin ?? "") || !path.isAbsolute(manifest.runtime_resource_home ?? "")) fail("EVAL continuation requires its retained runtime identities", "runtime_scope_identity_missing");
  const intent = { eval_root: root, run_id: manifest.run_id, request_id: requestId, source_request_id: fromRequestId, request_sequence: source.control?.request_sequence ?? source.resume.request_sequence, manifest_sha256: sha256(manifestBytes) };
  const file = evalResumeWorkerFile(root, requestId);
  let retained;
  try { retained = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (retained && (retained.schema_id !== "dd-eval/resume-worker@1" || hashJson(retained.intent) !== hashJson(intent))) fail("Resume request already identifies another experiment continuation", "control_request_conflict");
  if (!retained) await prepareRunnerContinuation(manifest);
  signal.throwIfAborted();
  await registerRunHome(root, registryEnvironment(manifest));
  await mkdir(path.dirname(file), { recursive: true });
  await withRunnerLock(file, async () => {
    let saved;
    try { saved = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (saved) {
      if (saved.schema_id !== "dd-eval/resume-worker@1" || hashJson(saved.intent) !== hashJson(intent)) fail("Resume request already identifies another experiment continuation", "control_request_conflict");
    } else { signal.throwIfAborted(); await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent, status: "requested" }); }
  }, { signal, timeoutMs: waitMs || 60_000 });
  progress.accepted = true;
  signal.throwIfAborted();
  const saved = await read(file);
  if (saved.status !== "completed") {
    await ensureWorker(file, root, requestId, registryEnvironment(manifest));
  }
  for (;;) {
    const current = await read(file), scope = current.scope_result;
    if (current.status === "failed" && !scope) throw reportedError(current.error, "EVAL continuation failed");
    if (!waitMs || scope?.pending === false || ["failed", "completed", "superseded", "recovery_blocked"].includes(current.status) || performance.now() >= deadline) {
      return { ...scope, root, run_id: manifest.run_id, request_id: requestId, source_request_id: fromRequestId, ok: true, accepted: true, runtime_accepted: scope?.receipt ? true : null,
        pending: scope?.pending !== false, ...(waitMs && scope?.pending !== false && performance.now() >= deadline ? { observation_timed_out: true } : {}),
        continuation: { file, status: current.status, owner_pid: current.owner_pid ?? null, process_id: current.process_id ?? null, error: current.error ?? null, result: current.result ?? null } };
    }
    await delay(Math.min(50, Math.max(0, deadline - performance.now())));
  }
}
