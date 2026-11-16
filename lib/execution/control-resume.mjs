import path from "node:path";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { cleanupBinding, cleanupSidecars } from "../eval-retirement.mjs";
import { readJson } from "../json-file.mjs";
import { commandJson } from "../process-json.mjs";
import { appendEvent, controlOperationInventory, hashJson, readEvents, reduceEvents, sha256 } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { assertControlResumeSource, validateControlResumeInput } from "./admission.mjs";
import { terminalExecution } from "./infrastructure-stop.mjs";
import { evalRuntimeEnv } from "./runtime-environment.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Resume an operator-controlled scope using its retained release identity. */
export async function runnerControlResume({ evalRoot, requestId, fromRequestId, waitMs = 0, observeOnlyRuntime = false }) {
  validateControlResumeInput({ requestId, waitMs });
  const deadline = performance.now() + (waitMs || 60_000);
  const signal = AbortSignal.timeout(waitMs || 60_000);
  const handle = { root: path.resolve(evalRoot), request_id: requestId, source_request_id: fromRequestId };
  let result;
  try {
    for (;;) {
      signal.throwIfAborted();
      result = await runnerControlResumeOnce({ evalRoot, requestId, fromRequestId, signal, observeOnlyRuntime, timeoutMs: Math.max(0, deadline - performance.now()) });
      if (result.applied || result.reused) return { ...result, ...handle, pending: false };
      if (!waitMs || observeOnlyRuntime) return { ...result, ...handle, pending: true };
      await delay(Math.min(100, Math.max(0, deadline - performance.now())), undefined, { signal });
    }
  } catch (error) {
    if (!(signal.aborted && ["AbortError", "TimeoutError"].includes(error.name)) && !(error.code === "runner_lock_timeout" && performance.now() >= deadline)) throw error;
    // A lost CLI reply cannot establish whether its durable request was accepted.
    // The stable handle allows retry without claiming release or cancelling work.
    return { ...result, ...handle, ok: result !== undefined, accepted: result ? true : null, pending: true, observation_timed_out: true };
  }
}

async function runnerControlResumeOnce({ evalRoot, requestId, fromRequestId, signal, timeoutMs, observeOnlyRuntime }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const manifest = await readJson(path.join(root, "manifest.json"));
    const assertSource = async () => assertControlResumeSource(await readEvents(eventsFile), manifest.run_id, requestId, fromRequestId);
    await assertSource();
    if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
    const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest);
    const status = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "status", "--scope-id", manifest.run_id], { cwd: root, env, signal });
    // Automatic retirement must not erase an already-applied request's ACK.
    // This is historical observation only: its stopped scope stays fenced.
    const source = await assertSource(), terminalEvents = await readEvents(eventsFile);
    if (source.resume && status.fence?.scope_id === manifest.run_id && status.fence.dispatch_blocked === true
      && status.scope_id === manifest.run_id && status.dispatch_blocked === true
      && manifest.executions.length > 0 && manifest.executions.every(execution => terminalExecution(terminalEvents, manifest, execution))) {
      const release = source.resume.release, native = status.release, resume = status.resume;
      const boundRelease = release?.scope_id === manifest.run_id && release.request_id === requestId && release.source_request_id === fromRequestId
        && Number.isSafeInteger(release.generation) && release.generation >= 1 && release.current === true
        && /^[a-f0-9]{64}$/.test(release.capture_key ?? "") && /^[a-f0-9]{64}$/.test(release.journal_sha256 ?? "")
        && native && hashJson({ ...native, current: true }) === hashJson(release)
        && resume?.status === "released" && resume.request_id === requestId && resume.generation === release.generation && resume.capture_key === release.capture_key;
      const manifestSha = sha256(await readFile(path.join(root, "manifest.json")));
      const retained = (await cleanupSidecars(root)).find(item => item.intent.request_id === status.fence.request_id
        && item.intent.kind === "cleanup" && item.intent.mode === "reconcile" && item.intent.goal === "local_retirement"
        && item.intent.eval_root === root && item.intent.run_id === manifest.run_id
        && item.intent.manifest_sha256 === manifestSha);
      if (boundRelease && retained) {
        const binding = await cleanupBinding(root, manifest, { maintenanceHome: retained.intent.maintenance_home, maintenanceBin: retained.intent.maintenance_bin });
        if (hashJson(binding) === retained.intent.target_binding_digest) return { root, run_id: manifest.run_id, state: source.state,
          applied: false, reused: true, historical: true, receipt: { scope_id: manifest.run_id, historical: true, dispatch_blocked: true,
            settled: false, release: { ...release, current: false }, resume: { ...resume, current: false }, fence: status.fence } };
      }
    }
    if (status.release && !status.control) {
      const release = status.release, resume = status.resume;
      if (status.scope_id !== manifest.run_id || status.fence || status.control || status.dispatch_blocked !== false || release.current !== true || release.scope_id !== manifest.run_id || release.source_request_id !== fromRequestId || release.request_id !== requestId || !Number.isSafeInteger(release.generation) || release.generation < 1 || !/^[a-f0-9]{64}$/.test(release.capture_key ?? "") || !/^[a-f0-9]{64}$/.test(release.journal_sha256 ?? "") || resume?.status !== "released" || resume.current !== true || resume.request_id !== requestId || resume.generation !== release.generation || resume.capture_key !== release.capture_key) fail("Scope resume requires its current matching release", "runtime_scope_release_unproven");
      const source = await assertSource();
      const applied = await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.resume_applied", data: { request_id: requestId, source_request_id: fromRequestId, request_sequence: source.control?.request_sequence ?? source.resume.request_sequence, release }, beforeAppend: latest => {
        controlOperationInventory(latest, manifest.run_id);
        const state = reduceEvents(latest);
        if (state.cancellation) fail("Cancellation superseded scope resume", "control_request_stale");
        if (!state.control && state.resume?.request_id === requestId && state.resume.source_request_id === fromRequestId) {
          if (hashJson(state.resume.release) !== hashJson(release)) fail("Applied scope release changed", "journal_conflict");
          return false;
        }
        if (state.control?.request_id !== fromRequestId || state.control.request_sequence !== source.control?.request_sequence) fail("Operator request changed before applying resume", "control_request_stale");
      } }, { signal });
      return { root, run_id: manifest.run_id, state: reduceEvents(await readEvents(eventsFile)).state, applied: Boolean(applied), reused: !applied, receipt: { scope_id: manifest.run_id, dispatch_blocked: false, settled: false, resume, release } };
    }
    // The final bounded read may project an already committed matching release,
    // but never grants another native recovery/resume request.
    if (observeOnlyRuntime) return { root, run_id: manifest.run_id };
    const control = status.control, captureKey = status.drain?.capture?.journal?.artifact_key;
    if (status.scope_id !== manifest.run_id || status.fence || control?.request_id !== fromRequestId || !Number.isSafeInteger(control.generation) || !/^[a-f0-9]{64}$/.test(captureKey ?? "")) fail("Scope resume requires its retained current capture", "runtime_scope_capture_required");
    await assertSource();
    const receipt = status.resume?.current === true && status.resume.request_id === requestId && status.resume.generation === control.generation && status.resume.capture_key === captureKey
      ? { ...status, settled: false }
      : await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "resume", "--scope-id", manifest.run_id, "--request-id", requestId, "--generation", String(control.generation), "--capture-key", captureKey], { cwd: root, env, signal });
    if (receipt.scope_id !== manifest.run_id || receipt.resume?.request_id !== requestId || receipt.resume?.generation !== control.generation || receipt.resume?.capture_key !== captureKey || receipt.dispatch_blocked !== true || receipt.settled !== false) fail("Runtime resume returned another preparation identity", "runtime_scope_inventory_invalid");
    const state = await assertSource();
    // Keep the captured journal unchanged until the all-role release exists.
    // The durable runtime request, not this observing client, owns preparation.
    return { root, run_id: manifest.run_id, state: state.state, receipt };
  }, { timeoutMs, signal });
}
