import path from "node:path";
import { stat } from "node:fs/promises";
import { assertDaemonReplaceable } from "../driver-recovery.mjs";
import { cleanupInventory } from "../eval-retirement.mjs";
import { evalRuntimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { readJson } from "../json-file.mjs";
import { commandJson } from "../process-json.mjs";
import { observeScopeResources } from "./cleanup-observation.mjs";
import { executionSnapshotBinding, runPhysicalStopped } from "./snapshot-observation.mjs";

async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Observe cleanup without declaring physical or ownership evidence settled prematurely. */
export async function executionCleanupPending(root, manifest, results, signal, onTechnicalNotes = async () => {}, onPhysicalObservation = () => {}) {
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
  if (!path.isAbsolute(manifest.runtime_control_bin ?? '')) return runPending;
  const physical = await observePhysical();
  const observed = await observeScopeResources(root, physical?.inventory, manifest.run_id);
  onPhysicalObservation(physical?.inventory, { ...observed, binding_unconfirmed: bindingUnconfirmed, pending: observed.pending || bindingUnconfirmed });
  return observed.pending || bindingUnconfirmed;
}
