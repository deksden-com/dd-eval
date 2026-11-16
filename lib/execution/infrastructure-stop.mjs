import path from "node:path";
import { appendEvent, readEvents } from "../runner-events.mjs";
import { verifyCapturedNativeFailure } from "../evidence/native-failure.mjs";
import { isInfrastructureFailure } from "../evidence/failure-classification.mjs";
import { executionState } from "./execution-state.mjs";
import { storedExecutionResults, terminalOperation } from "./result-projection.mjs";

/** Determine whether the current execution generation is terminal. */
export function terminalExecution(events, manifest, execution) {
  const state = executionState(events, manifest.run_id, execution);
  return Boolean(terminalOperation(events, state.operation_id)?.terminal || state.result.state === "cancelled" && state.cancellation?.settled);
}

/** Check the retained failure evidence and infrastructure-stop policy. */
export async function infrastructureQueueStopped(events, manifest, root) {
  const results = storedExecutionResults(events, manifest);
  if (root) for (const result of results) if (result.state === "failed") await verifyCapturedNativeFailure({ evalRoot: root, result });
  return manifest.profile?.failure_policy?.stop_run_on_infrastructure_error
    && Array.isArray(manifest.executions) && manifest.executions.every(execution => execution?.id)
    && results.some(result => result.state === "failed" && isInfrastructureFailure(result));
}

/** Cancel only unstarted executions after a verified infrastructure stop. */
export async function cancelInfrastructureQueue({ root, manifest }) {
  const eventsFile = path.join(root, "events.jsonl");
  if (!(await infrastructureQueueStopped(await readEvents(eventsFile), manifest, root))) return;
  for (const execution of manifest.executions) {
    const data = { execution: execution.id, state: "cancelled", code: "run_stopped_by_infrastructure_error" };
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
      type: "dev.dd.eval.execution.cancelled", data, beforeAppend: prior => {
        const state = executionState(prior, manifest.run_id, execution);
        if (state.started || state.operation_id !== `${manifest.run_id}:${execution.id}:launch` || state.result.state !== "awaiting_provider") return false;
        data.execution_operation_id = state.operation_id; data.execution_generation = state.generation;
      } });
  }
}
