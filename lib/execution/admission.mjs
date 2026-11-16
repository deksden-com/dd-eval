import { reduceEvents } from "../runner-events.mjs";
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
