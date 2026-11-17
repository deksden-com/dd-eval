import path from "node:path";
import { stat, realpath } from "node:fs/promises";
import { callDriver } from "../harness/driver-call.mjs";
import { cancelOwnedDaemon } from "../harness/daemon-control.mjs";
import { loadNativeContracts } from "../capacity-policy.mjs";
import { sha256, readEvents } from "../runner-events.mjs";
import { executionState } from "../execution/execution-state.mjs";
import { subjectSessionFor } from "../execution/result-projection.mjs";
import { hitlEvidenceFor } from "../hitl/hitl-retained.mjs";
import { isConclusiveHitlFailure, errorRecord } from "../operation-errors.mjs";
import { assertDaemonReplaceable } from "../harness/driver-recovery.mjs";
import { cleanupInventory } from "../eval-retirement.mjs";
import { evalRuntimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { readJson } from "../json-file.mjs";
import { commandJson } from "../process-json.mjs";
import { observeScopeResources } from "./cleanup-observation.mjs";
import { executionSnapshotBinding, runPhysicalStopped } from "./snapshot-observation.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Observe cleanup without declaring physical or ownership evidence settled prematurely. */
export async function observeExecutionCleanup(root, manifest, results, { signal, onTechnicalNotes = async () => {} } = {}) {
  let physicalInventory, bindingUnconfirmed = false;
  const observePhysical = () => physicalInventory ??= cleanupInventory(root, manifest, {}, (bin, args, options) => commandJson(bin, args, { ...options, signal })).catch(() => null);
  const runPending = (await Promise.all(results.filter(result => ["candidate_ready", "failed", "cancelled"].includes(result.state)).map(async result => {
    const attempt = path.join(root, "executions", result.execution);
    if (await exists(path.join(attempt, "managed-runtime.json"))) {
      try {
        const { binding: managed } = await executionSnapshotBinding(root, result.execution, result);
        const status = await commandJson(runtimeBin(managed.runtime_root), ["run", "control", "status", "--run", managed.run_id, "--project-root", managed.project_root], { cwd: managed.project_root, env: evalRuntimeEnv(managed.runtime_root, manifest), signal });
        if (status.scope?.run_id === managed.run_id) await onTechnicalNotes(managed.run_id, status.technical_notes ?? []);
        const capture = result.recovery;
        if (status.scope?.run_id !== managed.run_id || capture?.control_id && (status.control?.current !== true || status.control.control_id !== capture.control_id || status.control.recovery_id !== capture.recovery_id || status.control.generation !== capture.generation)) {
          bindingUnconfirmed = true; return true;
        }
        if (result.state !== 'candidate_ready' && status.settled !== true) return true;
        if (status.physical_stopped === true) return false;
        const physical = await observePhysical();
        return !physical || !runPhysicalStopped({ receipt: status, binding: managed, inventory: physical.inventory, resourceHome: physical.binding.resource_home, scopeId: manifest.run_id });
      } catch { bindingUnconfirmed = true; return true; }
    }
    const dir = path.join(attempt, "drivers", "daemon");
    try {
      if (!(await exists(path.join(dir, "daemon.json")))) { bindingUnconfirmed ||= Boolean(result.session_id); return Boolean(result.session_id); }
      const state = await readJson(path.join(dir, "daemon.json"));
      if (!(state.cleanup?.settled === true || (state.shutdown_state === "clean" && state.active_tree !== true))) { bindingUnconfirmed = true; return true; }
      await assertDaemonReplaceable(dir); return false;
    } catch { bindingUnconfirmed = true; return true; }
  }))).some(Boolean);
  // runPhysicalStopped intentionally excludes other Judge scopes. EVAL cleanup
  // must also observe those resources, including a Judge with no verdict yet.
  if (!path.isAbsolute(manifest.runtime_control_bin ?? '')) return { pending: runPending };
  const physical = await observePhysical();
  const observed = await observeScopeResources(root, physical?.inventory, manifest.run_id);
  const pending = observed.pending || bindingUnconfirmed;
  return { pending, inventory: physical?.inventory, physical: { ...observed, binding_unconfirmed: bindingUnconfirmed, pending } };
}

/** Stop only the execution tree belonging to the retained EVAL. */
export async function cancelExecutionTree({ root, manifest, execution, profile, sessionId, launchUnwound = false }) {
  const attempt = path.join(root, "executions", execution.id), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  const managedFile = path.join(attempt, "managed-runtime.json");
  if (await exists(managedFile)) {
    const { binding: managed } = await executionSnapshotBinding(root, execution.id);
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    const options = { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) };
    const scope = ["--run", managed.run_id, "--project-root", projectRoot];
    const requestId = `eval-stop:${sha256(current.operation_id)}`;
    try {
      return await commandJson(runtimeBin(runtimeRoot), ["run", "control", "stop", ...scope, "--request-id", requestId, "--wait-ms", "1000"], options);
    } catch (error) {
      if (error.code !== "run_control_in_progress") throw error;
      const retained = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", ...scope], options);
      if (retained.control?.current !== true || retained.control.requested_mode !== "stop"
        || retained.control.control_id !== error.details?.control_id) throw error;
      // Fatal RUN stop and EVAL cancellation share the current stop owner.
      // The engine alone verifies whether a retained starting/running owner is
      // dead; reuse this stop request rather than creating a new budget.
      if (["starting", "running", "failed"].includes(retained.worker?.status)) return await commandJson(runtimeBin(runtimeRoot),
        ["run", "control", "reconcile", ...scope, "--control-id", retained.control.control_id, "--request-id", requestId], options);
      return retained;
    }
  }
  const stateDir = path.join(attempt, "drivers", "daemon");
  if (!(await exists(path.join(stateDir, "daemon.json")))) {
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    return { settled: !current.started || launchUnwound, reason: !current.started || launchUnwound ? "no_native_daemon_dispatched" : "native_creation_unconfirmed" };
  }
  const canonicalRoot = await realpath(root);
  if (path.dirname(attempt) !== path.join(root, "executions")) fail("Legacy cancellation execution is outside its retained EVAL directory", "execution_scope_invalid");
  for (const target of [projectRoot, runtimeRoot, stateDir, path.join(stateDir, "daemon.json")]) {
    if (await realpath(target) !== path.resolve(canonicalRoot, path.relative(root, target))) fail("Legacy cancellation target is outside its retained execution", "execution_scope_invalid");
  }
  const nativeContracts = await loadNativeContracts(runtimeRoot, { requireTreeSettlement: true }).catch(() => null);
  return cancelOwnedDaemon({ stateDir, projectRoot, sessionId, nativeContracts,
    inspect: () => callDriver(profile, ["session", "inspect", "--state-dir", stateDir, "--session-id", sessionId], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest), nativeContracts }),
    stop: () => callDriver(profile, ["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) }) });
}

/** Reattach and explicit recovery must settle the same known HITL refusal as
 * initial launch. Unknown exceptions never gain terminal/replay authority. */
export async function settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) {
  if (!isConclusiveHitlFailure(error)) return {};
  const events = await readEvents(path.join(root, "events.jsonl"));
  let hitl = [], evidenceError;
  try { hitl = await hitlEvidenceFor(events, execution.id, manifest.run_id, manifest.execution_contract); }
  catch (failure) { evidenceError = errorRecord(failure); }
  if (error.hitl) hitl.push(error.hitl);
  let control;
  try { control = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: subjectSessionFor(events, execution.id), launchUnwound: true }); }
  catch (cleanupError) { control = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
  return { hitl, control, ...(evidenceError ? { evidence_error: evidenceError } : {}) };
}
