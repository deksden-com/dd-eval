import path from "node:path";
import { stat } from "node:fs/promises";
import { acceptedManagedExecution } from "../completion-scope.mjs";
import { classifyInterruption, boundTerminalFinalization } from "../evidence/failure-classification.mjs";
import { evalRuntimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { isObservationLoss, errorRecord } from "../operation-errors.mjs";
import { commandJson } from "../process-json.mjs";
import { executionSnapshotBinding, observeBoundSnapshot } from "./snapshot-observation.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

// A physically settled owner is not a verified capture. Any failed capture
// closes finalization; pre-native failures have no recovery error and remain
// finalizable without inventing a RUN snapshot.
/** Classify capture readiness without treating cleanup as capture evidence. */
export async function failureCaptureState(root, manifest, result, signal, onObservation = () => {}) {
  signal?.throwIfAborted();
  if (result.state === 'candidate_ready' && acceptedManagedExecution(result)
    && (!result.candidate?.manifest_sha256 || result.incomplete_evidence)) return 'blocked';
  if (result.state !== "failed") return "ready";
  // A retained id proves only earlier capture, not current bytes or binding.
  // A missing id may only mean publication was late. The shared reader checks
  // managed binding itself and returns null only for a genuinely pre-native failure.
  const recovery = await captureRecoveryEvidence({ root, manifest, result, signal });
  onObservation({ execution: result.execution, phase: 'capture', error: recovery?.capture_error ?? null });
  signal?.throwIfAborted();
  if (!recovery?.capture_error) return "ready";
  return recovery.capture_error.code === "recovery_capture_pending" || isObservationLoss(recovery.capture_error) ? "pending" : "blocked";
}

/** Verify the retained managed capture and bind it to the settled controller. */
export async function captureRecoveryEvidence({ root, manifest, result, signal }) {
  signal?.throwIfAborted();
  const attempt = path.join(root, "executions", result.execution);
  const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
  let finalization;
  const interruption = classifyInterruption({ code: result.code, message: result.error, retryable: result.retryable, details: result.details });
  if (result.recovery_parent_id) interruption.recovery_parent_id = result.recovery_parent_id;
  // Attribution does not grant replay permission. A terminal failure may be
  // captured only through the engine's RUN/settled-writer barrier; resuming it
  // still requires the explicit recovery operation and exact captured identity.
  const knownRun = result.run_id || result.lifecycle?.run_id || result.recovery?.run_id;
  if (result.state !== "failed") return null;
  const hasBinding = await exists(path.join(attempt, "managed-runtime.json"));
  // Preparation may already have created both folders before baseline or
  // Session creation failed. Folder existence alone is not native authority.
  if (!knownRun && !result.session_id && !hasBinding) return null;
  if (!(await exists(projectRoot)) || !(await exists(runtimeRoot))) return knownRun || result.session_id || hasBinding
    ? { unavailable: true, interruption, capture_error: errorRecord(Object.assign(new Error("Retained RUN workspace or runtime is unavailable for capture verification"), { code: "recovery_evidence_invalid" })) }
    : null;
  try {
    if (await exists(path.join(attempt, "managed-runtime.json"))) {
      const { binding: managed } = await executionSnapshotBinding(root, result.execution, result);
      const status = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest), signal });
      if (status.scope?.run_id !== managed.run_id) fail("Managed RUN control readback belongs to another execution", "execution_scope_invalid");
      const control = status.control;
      if (status.scope?.run_id === managed.run_id && ["done", "failed", "cancelled"].includes(status.run_status)
        && boundTerminalFinalization(status.finalization, managed.run_id, projectRoot)) {
        finalization = status.finalization;
        result.run_id ??= managed.run_id;
      }
      if (status.scope?.run_id === managed.run_id && ["done", "failed", "cancelled"].includes(status.run_status)
        && status.settled !== true && status.control === null && status.worker === null && boundTerminalFinalization(finalization, managed.run_id, projectRoot)
        && finalization.status === "blocked" && finalization.owner === "absent" && ["missing", "recorded"].includes(finalization.capture)) {
        // This is a retained engine observation, not permission to start cleanup.
        result.run_id ??= managed.run_id;
        throw Object.assign(new Error("Terminal controller has no owner or control to finish capture and settlement"), { code: "recovery_blocked", details: { finalization } });
      }
      if (status.settled !== true || control?.current !== true || control.admission !== "sealed" || !control.capture_path || !control.recovery_id || !control.control_id) {
        if (status.worker?.status === "recovery_blocked" || status.worker?.status === "failed" && status.worker.snapshot?.status === "recovery_blocked" || status.worker?.error?.code === "recovery_observation_budget_exhausted")
          fail("Managed controller exhausted recovery observation without a sealed capture", "recovery_blocked");
        fail("Managed recovery capture is not yet sealed by its controller", "recovery_capture_pending");
      }
      const observed = await observeBoundSnapshot({ root, manifest, result, binding: managed, receipt: status }).catch(error => fail(`Managed capture binding cannot be verified: ${error.details?.reason ?? error.code ?? error.message}`, "recovery_evidence_invalid"));
      if (observed.capture !== "ready") fail(`Managed capture binding cannot be verified: ${observed.reason}`, "recovery_capture_pending");
      const manifestFile = path.join(control.capture_path, "snapshot.json");
      const snapshotSha = observed.manifest_sha256;
      const current = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest), signal });
      if (current.scope?.run_id !== managed.run_id || current.settled !== true || current.control?.current !== true
        || ["control_id", "recovery_id", "generation", "capture_path", "admission"].some(key => current.control[key] !== control[key])) fail("Managed capture changed before ingestion", "recovery_source_stale");
      const rechecked = await observeBoundSnapshot({ root, manifest, result, binding: managed, receipt: current }).catch(() => fail("Managed capture changed before ingestion", "recovery_source_stale"));
      if (rechecked.capture !== "ready" || rechecked.manifest_sha256 !== snapshotSha) fail("Managed capture changed before ingestion", "recovery_source_stale");
      return { recovery_id: control.recovery_id, control_id: control.control_id, generation: control.generation, run_id: managed.run_id, interruption,
        settlement: control.settlement, snapshot: control.capture_path, manifest: manifestFile, manifest_sha256: snapshotSha, consistency: observed.consistency, ...(finalization ? { finalization } : {}) };
    }
    fail("Recovery capture requires a managed execution binding", "execution_migration_required");
  } catch (error) {
    signal?.throwIfAborted();
    if (error.code === 'snapshot_binding_invalid' || error instanceof SyntaxError) error = Object.assign(new Error(`Managed capture binding cannot be verified: ${error.message}`), { code: 'recovery_evidence_invalid' });
    return { unavailable: true, interruption, capture_error: errorRecord(error), ...(finalization ? { finalization } : {}) };
  }
}
