import path from "node:path";
import { readJson } from "../json-file.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { commandJson } from "../process-json.mjs";
import { evalResumeWorkerStatus } from "../recovery/eval-worker-status.mjs";
import { executionSnapshotBinding } from "../recovery/snapshot-observation.mjs";
import { controlOperationInventory, readEvents } from "../runner-events.mjs";
import { evalRuntimeEnv, runtimeBin } from "./runtime-environment.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Observe scope, execution and continuation status without asserting settlement. */
export async function runnerControlStatus({ evalRoot, executionId = null, signal }) {
  const root = path.resolve(evalRoot), manifest = await readJson(path.join(root, "manifest.json"));
  const selected = manifest.executions.filter(execution => executionId === null || execution.id === executionId);
  if (executionId !== null && !selected.length) fail(`unknown execution: ${executionId}`, "execution_unknown");
  const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest);
  let journal;
  try {
    const events = await readEvents(path.join(root, "events.jsonl"));
    journal = controlOperationInventory(events, manifest.run_id);
    if (executionId !== null) {
      journal.operations = journal.operations.filter(operation => operation.execution_id === executionId);
      journal.unresolved_operations = journal.unresolved_operations.filter(id => journal.operations.some(operation => operation.operation_id === id));
    }
  } catch (error) { journal = { unavailable: true, error: errorRecord(error) }; }
  let inventory = null;
  if (executionId === null) {
    if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
    try {
      signal?.throwIfAborted();
      inventory = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "status", "--scope-id", manifest.run_id], { cwd: root, env: { ...env, DD_FLOW_BIN: manifest.runtime_control_bin }, signal });
      if (inventory.scope_id !== manifest.run_id || typeof inventory.dispatch_blocked !== "boolean" || !Array.isArray(inventory.processes)) fail("Runtime returned an invalid scope inventory", "runtime_scope_inventory_invalid");
    } catch (error) { inventory = { scope_id: manifest.run_id, unavailable: true, error: errorRecord(error) }; }
  }
  const executions = await Promise.all(selected.map(async execution => {
    const attempt = path.join(root, "executions", execution.id), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
    try {
      const { binding: managed } = await executionSnapshotBinding(root, execution.id);
      signal?.throwIfAborted();
      const receipt = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest), signal });
      if (receipt.scope?.run_id !== managed.run_id) fail("RUN control returned another scope", "execution_scope_invalid");
      return { execution: execution.id, run_id: managed.run_id, receipt };
    } catch (error) { return { execution: execution.id, unavailable: true, error: errorRecord(error) }; }
  }));
  // These are independent read snapshots, never aggregate settlement proof.
  const continuations = executionId === null ? await evalResumeWorkerStatus(root) : [];
  return { root, run_id: manifest.run_id, scope: executionId === null ? "eval" : "execution", execution_id: executionId,
    observation_complete: !inventory?.unavailable && !journal.unavailable && executions.every(item => !item.unavailable) && continuations.every(item => !item.unavailable), inventory, executions, journal, continuations };
}
