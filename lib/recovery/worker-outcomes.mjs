import { errorRecord } from "../operation-errors.mjs";

/** Preserve a primary worker failure when cleanup itself also fails. */
export function workerCleanupFailure(saved, error) {
  return saved.error || ["recovery_blocked", "failed", "waiting_for_user", "superseded"].includes(saved.status)
    ? { cleanup_error: errorRecord(error) }
    : { status: "failed", error: errorRecord(error) };
}

// Physical retirement does not imply that a failed Subject's capture is ready.
const captureReady = result => ["ready", "not_applicable"].includes(result?.cleanup_observation?.capture);
/** Require capture reconciliation before accepting a terminal failed execution. */
export function needsFailureReconciliation(result) {
  return result?.execution_state === "failed" && allExecutionsTerminal(result) && !captureReady(result);
}
const allExecutionsTerminal = result => !["awaiting_provider", "awaiting_native_children", "cancelling"].includes(result?.state)
  && (result?.executions ?? []).every(execution => ["candidate_ready", "failed", "cancelled"].includes(execution.state));

/** Check the distinct completion criteria for retirement and reconciliation. */
export function cleanupGoalComplete(goal, result) {
  return goal === "local_retirement" ? result?.physical_stopped === true
    : result?.cleanup_state === "settled" && captureReady(result);
}
