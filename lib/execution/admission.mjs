import { reduceEvents, controlOperationInventory } from "../runner-events.mjs";
import { executionState, assertExecutionDispatch } from "./execution-state.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/**
 * Reject productive dispatch after EVAL control, cancellation or generation changes.
 * @param {object[]} events Ordered retained EVAL events.
 * @param {string} runId EVAL run identifier.
 * @param {object} execution Selected execution descriptor.
 * @param {string} operationId Operation requesting dispatch.
 * @returns {void} Throws a coded error when dispatch is no longer admitted.
 */
export function assertEvalExecutionDispatch(events, runId, execution, operationId) {
  if (reduceEvents(events).state === "finished") fail("Finished EVAL no longer accepts productive dispatch", "execution_terminal");
  assertEvalAdmission(events);
  return assertExecutionDispatch(executionState(events, runId, execution), operationId);
}

/**
 * Check EVAL-wide cancellation and operator control before productive work.
 * @param {object[]} events Ordered retained EVAL events.
 * @returns {void} Throws if cancellation or control blocks admission.
 */
export function assertEvalAdmission(events) {
  const state = reduceEvents(events);
  if (state.cancellation) fail("EVAL cancellation no longer admits productive dispatch", "runtime_scope_stopped");
  if (state.control) fail("EVAL operator control blocks productive dispatch", "managed_run_controlled");
}

/** Validate a stable control-resume request identifier and bounded wait. */
export function validateControlResumeInput({ requestId, waitMs = 0 }) {
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 60_000) fail("waitMs must be an integer between 0 and 60000", "control_request_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId ?? "")) fail("Resume requires a stable request ID", "control_request_invalid");
}

/** Bind a resume request to the current operator pause or stop operation. */
export function assertControlResumeSource(events, runId, requestId, fromRequestId) {
  const state = reduceEvents(events);
  if (state.state === "finished") fail("Finished EVAL cannot release productive admission", "execution_terminal");
  controlOperationInventory(events, runId);
  const applied = !state.control && state.resume?.request_id === requestId && state.resume.source_request_id === fromRequestId;
  if (!fromRequestId || state.cancellation || !applied && (state.control?.request_id !== fromRequestId || !["pause", "stop"].includes(state.control.mode))) fail("Resume requires the current operator request", "control_request_stale");
  return state;
}
