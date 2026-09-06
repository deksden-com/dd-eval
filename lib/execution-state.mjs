/** The journal's cross-process append lock orders decisions. Provider replies
 * remain evidence even when an earlier cancellation owns the terminal result.
 * Explicit recovery/reconcile operations open a new generation; late replies
 * from an older operation cannot alter it. No second state registry is needed. */
export function executionState(events, runId, execution) {
  const launch = `${runId}:${execution.id}:launch`;
  let operationId = launch, generation = 0, cancellation = null;
  let result = { execution: execution.id, state: "awaiting_provider" };
  const started = new Set();
  const terminal = () => ["candidate_ready", "failed", "cancelled"].includes(result.state);
  for (const event of events) {
    if (event.executionid !== execution.id) continue;
    const data = event.data ?? {}, id = data.operation_id;
    const launchOperation = typeof id === "string" && (id === launch || id.startsWith(`${launch}:recover:`) || id === `${launch}:reconcile`);
    if (launchOperation && ["dev.dd.eval.operation.requested", "dev.dd.eval.operation.started", "dev.dd.eval.operation.completed"].includes(event.type) && !started.has(id)) {
      started.add(id);
      if (id !== launch) {
        operationId = id; generation++; cancellation = null;
        result = { execution: execution.id, state: "awaiting_provider" };
      }
    }
    const origin = data.execution_operation_id ?? (launchOperation ? id : data.recovery_parent_id ? `${launch}:recover:${data.recovery_parent_id}` : operationId);
    if (origin !== operationId || (data.execution_generation !== undefined && data.execution_generation !== generation)) continue;
    if (event.type === "dev.dd.eval.execution.cancel_requested") {
      cancellation ??= { event_id: event.id, effective: !terminal(), settled: false };
      if (cancellation.effective && !terminal()) result = { execution: execution.id, stage: execution.stage, state: "cancelling" };
    }
    if (event.type === "dev.dd.eval.execution.cancelled") {
      // Legacy journals may only contain the settlement event.
      cancellation ??= { event_id: event.id, effective: !terminal(), settled: false };
      cancellation.settled = true;
      if (cancellation.effective) result = { execution: execution.id, stage: execution.stage, state: "cancelled" };
    }
    if (cancellation?.effective) continue;
    const completed = launchOperation && id === operationId && event.type === "dev.dd.eval.operation.completed" ? data.result
      : event.type === "dev.dd.eval.execution.candidate_ready" ? data.result : null;
    if (completed && !terminal()) result = completed;
    const failed = event.type === "dev.dd.eval.execution.failed" ? { ...data, execution: execution.id, state: "failed" }
      : launchOperation && id === operationId && event.type === "dev.dd.eval.operation.failed"
        ? { execution: execution.id, stage: execution.stage, state: "failed", code: data.error?.code ?? "execution_failed", error: data.error?.message ?? null } : null;
    if (failed && !terminal()) result = failed;
    else if (failed && result.state === "failed" && failed.code === result.code) {
      // Later evidence enriches the accepted error; it never replaces its cause.
      result = { ...result, ...failed, code: result.code, error: result.error };
    }
  }
  return { operation_id: operationId, generation, cancellation, started: started.has(operationId), result };
}

export function assertExecutionDispatch(state, operationId) {
  if (state.operation_id !== operationId) throw Object.assign(new Error("late execution generation cannot dispatch work"), { code: "execution_generation_stale" });
  if (state.cancellation?.effective || ["candidate_ready", "failed", "cancelled"].includes(state.result.state)) {
    throw Object.assign(new Error("execution no longer accepts productive work"), { code: state.cancellation?.effective ? "execution_cancelled" : "execution_terminal" });
  }
}
