import path from "node:path";
import { readFile } from "node:fs/promises";
import { errorRecord } from "../operation-errors.mjs";
import { commandJson } from "../process-json.mjs";
import { processSnapshot } from "../process-snapshot.mjs";
import { hashJson, readEvents, sha256 } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { runtimeScopeManifest } from "../execution/control-request.mjs";
import { cleanupInventory } from "./cleanup-binding.mjs";
import { retirementEligible } from "./prior-owners.mjs";
import { conflictingStopReceipt } from "./eval-worker-status.mjs";

const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };

/** Maintenance sidecar only. Never unseals an EVAL journal or runs a Judge. */
export async function retireEval({ evalRoot, intent, call = commandJson }) {
  const root = path.resolve(evalRoot), bytes = await readFile(path.join(root, "manifest.json")), manifest = JSON.parse(bytes);
  if (intent.eval_root !== root || intent.run_id !== manifest.run_id || intent.goal !== "local_retirement" || !["defer", "reconcile"].includes(intent.mode)
    || !/^[a-f0-9]{64}$/.test(intent.target_binding_digest ?? "")) fail("Invalid retained cleanup intent", "control_request_invalid");
  if (sha256(bytes) !== intent.manifest_sha256) fail("Cleanup manifest changed", "runner_definition_drift");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    if (sha256(await readFile(path.join(root, "manifest.json"))) !== intent.manifest_sha256) fail("Cleanup manifest changed under lock", "runner_definition_drift");
    if (intent.origin && intent.origin !== "operator" && !retirementEligible(manifest, await readEvents(path.join(root, "events.jsonl")))) fail("EVAL is no longer eligible for retirement", "prior_cleanup_pending");
    const observed = await cleanupInventory(root, manifest, { maintenanceHome: intent.maintenance_home, maintenanceBin: intent.maintenance_bin }, call);
    if (hashJson(observed.binding) !== intent.target_binding_digest) fail("Cleanup binding changed", "control_request_conflict");
    const { inventory, invoke, stopProcess } = observed;
    if (intent.mode === "defer") {
      const conflict = await conflictingStopReceipt(root, intent.request_id);
      if (conflict) return conflict;
      return { root, run_id: manifest.run_id, cleanup_state: "pending", physical_stopped: null,
        cleanup_deferral: { reason: intent.defer_reason, inventory_sha256: hashJson(inventory), close_before_next_campaign: true }, inventory };
    }
    const processes = inventory.processes.some(record => record.kind === "run-controller") ? await processSnapshot() : [];
    const liveControllers = inventory.processes.filter(record => record.kind === "run-controller" && processes.some(item => item.pid === record.pid && item.started === record.pid_started_at && !item.zombie));
    let controlError;
    if (liveControllers.length && !inventory.fence && !["failed", "recovery_blocked"].includes(inventory.worker?.status)) {
      const scopeManifest = runtimeScopeManifest(path.join(root, "manifest.json"), manifest, intent.manifest_sha256);
      try {
        const control = await invoke("control", ["--request-id", intent.request_id, "--mode", "stop", "--manifest-json", JSON.stringify(scopeManifest)]);
        // Do not supersede the RUN drain worker with a terminal scope fence.
        // The same cleanup observer reads its progress on the next iteration.
        return { root, run_id: manifest.run_id, cleanup_state: "pending", physical_stopped: false, native_settled: false, reason: "scope_control_pending", control };
      } catch (error) { controlError = errorRecord(error); }
    }
    if (liveControllers.length) {
      // Existing physical owner API rechecks lease/PID birth. Never signal a PID
      // directly or call this before native drain has failed/been superseded.
      for (const record of liveControllers) await stopProcess(record);
    }
    const receipt = await invoke("stop", ["--request-id", intent.request_id]);
    if (receipt.scope_id !== manifest.run_id || !Array.isArray(receipt.nodes) || typeof receipt.settled !== "boolean"
      || receipt.settled && receipt.nodes.some(node => node.settled !== true)) fail("Invalid scope stop receipt", "runtime_scope_inventory_invalid");
    const after = (await cleanupInventory(root, manifest, { maintenanceHome: intent.maintenance_home, maintenanceBin: intent.maintenance_bin }, call)).inventory;
    const covered = new Set(receipt.nodes.map(node => node.process_id));
    const identity = record => hashJson(Object.fromEntries(["id", "lease_token", "pid", "pid_started_at", "kind", "owner_id", "operation_id", "project_id", "run_id", "work_id", "metadata_json"].map(key => [key, record[key] ?? null])));
    const prior = new Map(inventory.processes.map(record => [record.id, identity(record)]));
    const physical = receipt.physical_stopped === true && after.processes.every(record => covered.has(record.id) && prior.get(record.id) === identity(record));
    return { root, run_id: manifest.run_id, cleanup_state: receipt.settled === true && after.provider_turns.length === 0 ? "settled" : "pending",
      physical_stopped: physical, native_settled: receipt.settled === true, capture: "unmodified", binding: observed.binding, inventory: after, receipt, ...(controlError ? { control_error: controlError } : {}),
      storage: { state: "operator_verification_required", automatic_stop: false, reason: "No explicit last-consumer storage proof in process scope" } };
  });
}
