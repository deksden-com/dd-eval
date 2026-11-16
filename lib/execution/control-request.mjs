import path from "node:path";
import { readFile } from "node:fs/promises";
import { evalRuntimeEnv } from "./runtime-environment.mjs";
import { commandJson } from "../process-json.mjs";
import { appendEvent, hashJson, readEvents, reduceEvents, sha256 } from "../runner-events.mjs";
import { readJson } from "../json-file.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { cancelExecutionTree } from "../recovery/execution-cleanup.mjs";
import { executionState } from "./execution-state.mjs";
import { appendRunEventOnce, runResultRevision, storedExecutionResults, subjectSessionFor } from "./result-projection.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Record and dispatch an idempotent pause or stop request for the EVAL scope. */
export async function runnerControlRequest({ evalRoot, requestId, mode }) {
  if (!["pause", "stop"].includes(mode) || typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) fail("Control requires pause or stop and a bounded request identity", "control_request_invalid");
  const root = path.resolve(evalRoot), manifestPath = path.join(root, "manifest.json"), manifestBytes = await readFile(manifestPath, "utf8"), manifest = JSON.parse(manifestBytes), eventsFile = path.join(root, "events.jsonl");
  validateControlManifest(manifest);
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: manifest.runtime_control_bin });
  const requested = await appendEvent(eventsFile, { id: `scope-control:${sha256(JSON.stringify([manifest.run_id, requestId]))}`, deduplicate: true, source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.requested", data: { mode, request_id: requestId, scope_id: manifest.run_id }, validateDuplicate: existing => {
    if (existing.data.mode !== mode) fail("Control request identity was reused for another mode", "control_request_conflict");
  }, beforeAppend: events => {
    const prior = reduceEvents(events);
    if (prior.cancellation) fail("Terminal EVAL cancellation cannot be resumed by operator control", "runtime_scope_stopped");
    if (prior.control?.mode === "stop" && mode === "pause") fail("Pause cannot weaken an existing stop", "control_request_conflict");
  } });
  if (requested.data.mode !== mode) fail("Control request identity was reused for another mode", "control_request_conflict");
  const scopeManifest = { schema_id: "dd-flow/runtime-scope-manifest@1", scope_id: manifest.run_id, manifest_path: manifestPath, manifest_sha256: sha256(manifestBytes), execution_ids: manifest.executions.map(execution => execution.id) };
  const receipt = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "control", "--scope-id", manifest.run_id, "--request-id", requestId, "--mode", mode, "--manifest-json", JSON.stringify(scopeManifest)], { cwd: root, env });
  if (receipt.scope_id !== manifest.run_id || receipt.control?.request_id !== requestId || receipt.control?.requested_mode !== mode || receipt.control?.dispatch_blocked !== true || !Number.isSafeInteger(receipt.control.generation)) fail("Runtime control returned another scope or request", "runtime_scope_inventory_invalid");
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.observed", data: { mode, request_id: requestId, request_sequence: requested.data.sequence, receipt } });
  return { root, run_id: manifest.run_id, state: reduceEvents(await readEvents(eventsFile)).state, receipt };
}

/** Validate retained execution identities before scope control. */
export function validateControlManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || typeof manifest.run_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(manifest.run_id)
    || !Array.isArray(manifest.executions) || !manifest.executions.length
    || manifest.executions.some(execution => !execution || typeof execution !== "object" || Array.isArray(execution)
      || typeof execution.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(execution.id))
    || new Set(manifest.executions.map(execution => execution.id)).size !== manifest.executions.length) {
    fail("Invalid retained EVAL control manifest", "control_input_invalid");
  }
}

/** Cancel the selected EVAL executions and retain scope settlement evidence. */
export async function runnerCancel({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl"), manifest = await readJson(path.join(root, "manifest.json"));
  validateControlManifest(manifest);
  const selected = manifest.executions.filter(execution => !executionId || execution.id === executionId);
  if (!selected.length) fail(`unknown execution: ${executionId}`, "execution_unknown");
  if (typeof manifest.runtime_resource_home !== "string" || !path.isAbsolute(manifest.runtime_resource_home)) fail("EVAL manifest must retain its absolute resource registry home", "runtime_scope_identity_missing");
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  let scopeFence = null, cancelRequest = null;
  if (!executionId) {
    cancelRequest = await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
      type: "dev.dd.eval.cancel_requested", data: { state: "cancelling", scope_id: manifest.run_id } });
    const bin = manifest.runtime_control_bin;
    try {
      scopeFence = await commandJson(bin, ["runtime", "scope", "fence", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeFence.scope_id !== manifest.run_id || scopeFence.dispatch_blocked !== true) fail("Runtime did not confirm the EVAL dispatch fence", "runtime_scope_fence_invalid");
    } catch (error) { scopeFence = { scope_id: manifest.run_id, dispatch_blocked: false, error: errorRecord(error) }; }
  }
  const cancelled = [];
  for (const execution of selected) {
    const events = await readEvents(eventsFile), current = executionState(events, manifest.run_id, execution);
    if (["candidate_ready", "cancelled"].includes(current.result.state)) {
      cancelled.push({ execution: execution.id, settled: true, already_terminal: current.result.state }); continue;
    }
    const sessionId = subjectSessionFor(events, execution.id);
    const data = { state: "cancelling", execution: execution.id, session_id: sessionId };
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
      type: "dev.dd.eval.execution.cancel_requested", data, beforeAppend: prior => {
        const state = executionState(prior, manifest.run_id, execution);
        data.execution_generation = state.generation; data.execution_operation_id = state.operation_id;
      } });
    let receipt;
    try { receipt = await cancelExecutionTree({ root, manifest, execution, profile: manifest.subject_profile, sessionId }); }
    catch (error) { receipt = { settled: false, cleanup_error: errorRecord(error) }; }
    cancelled.push({ execution: execution.id, session_id: sessionId, settled: receipt.settled === true && receipt.native_settled !== false, receipt, event_data: data });
  }
  let scopeInventory = null;
  if (!executionId) {
    const bin = manifest.runtime_control_bin;
    try {
      scopeInventory = await commandJson(bin, ["runtime", "scope", "stop", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeInventory.scope_id !== manifest.run_id || !Array.isArray(scopeInventory.nodes) || typeof scopeInventory.settled !== "boolean"
        || scopeInventory.settled && scopeInventory.nodes.some(node => node.settled !== true || node.native_settled === false)) fail("Runtime scope stop receipt is invalid", "runtime_scope_inventory_invalid");
    } catch (error) { scopeInventory = { scope_id: manifest.run_id, settled: false, nodes: null, error: errorRecord(error) }; }
  }
  // Publish closure only after all selected scopes have proved settlement.
  // An EVAL-wide cleanup failure must not leave per-execution cancelled events.
  for (const item of cancelled.filter(item => item.event_data)) {
    item.settled &&= scopeFence?.dispatch_blocked !== false && (executionId !== null || scopeInventory?.settled === true);
    const data = item.event_data; delete item.event_data;
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: item.execution, traceId: manifest.run_id,
      ...(item.settled ? { id: `execution-cancelled:${hashJson([manifest.run_id, item.execution, data.execution_operation_id, data.execution_generation])}`, deduplicate: true } : {}),
      type: item.settled ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancellation_unconfirmed",
      data: { ...data, state: item.settled ? "cancelled" : "cancellation_unconfirmed", receipt: item.receipt } });
  }
  const projectionEvents = await readEvents(eventsFile);
  const results = storedExecutionResults(projectionEvents, manifest);
  // Control never enters candidate capture or assessment: those may start a
  // provider, and neither case/profile availability is required to cancel.
  const terminal = results.every(result => ["candidate_ready", "failed", "cancelled"].includes(result.state));
  // A process state alone does not prove remote native-tree settlement.
  // Retained scope resources require their own shutdown evidence.
  const settled = cancelled.every(item => item.settled) && scopeFence?.dispatch_blocked !== false
    && (executionId !== null || scopeInventory?.settled === true);
  const priorScope = reduceEvents(projectionEvents).cancellation;
  const scopeRequired = executionId !== null && terminal && !(priorScope?.scope_id === manifest.run_id
    && priorScope.scope_fence?.scope_id === manifest.run_id && priorScope.scope_fence.dispatch_blocked === true && priorScope.scope_inventory?.scope_id === manifest.run_id
    && priorScope.scope_inventory.settled === true && Array.isArray(priorScope.scope_inventory.nodes)
    && priorScope.scope_inventory.nodes.every(node => node.settled === true && node.native_settled !== false));
  const state = !settled || scopeRequired ? "cancellation_unconfirmed" : !terminal ? "awaiting_provider"
    : results.every(result => result.state === "candidate_ready") ? "completed"
    : results.some(result => result.state === "failed") ? "completed_with_failures" : "cancelled";
  if (scopeRequired) await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
    type: "dev.dd.eval.scope_settlement_required", data: { state, code: "scope_settlement_required", cleanup_blocked: true, execution: executionId } });
  if (terminal && settled && !scopeRequired) {
    const revision = runResultRevision(projectionEvents, manifest);
    await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed",
      guard: prior => runResultRevision(prior, manifest) === revision,
      data: { state, result_revision: revision, executions: results.map(result => ({ execution: result.execution, state: result.state })) } });
  }
  if (!executionId) await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
    type: "dev.dd.eval.cancel_observed", data: { state, scope_id: manifest.run_id, request_sequence: cancelRequest.data.sequence, scope_fence: scopeFence, scope_inventory: scopeInventory, cancelled } });
  return { root, run_id: manifest.run_id, cancelled, state, ...(scopeRequired ? { code: "scope_settlement_required", cleanup_blocked: true } : {}), ...(scopeFence ? { scope_fence: scopeFence, scope_inventory: scopeInventory } : {}) };
}
