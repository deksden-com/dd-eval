import { appendEvent, canonicalJson, hashJson } from "../runner-events.mjs";
import { executionState } from "./execution-state.mjs";

/**
 * Publish an event under the journal lock only when its current projection differs.
 * @param {object} input Event binding, data and optional guard evaluated under the lock.
 * @returns {Promise<boolean>} Whether an event was appended.
 */
export async function appendRunEventOnce({ eventsFile, runId, type, data, guard = () => true }) {
  const comparable = value => { const copy = { ...(value ?? {}) }; delete copy.sequence; return canonicalJson(copy); };
  return Boolean(await appendEvent(eventsFile, { source: "dd-eval://runner", runId, traceId: runId, type, data,
    beforeAppend: prior => {
      if (!guard(prior)) return false;
      // Completion is a current projection: A→blocked→A must publish the
      // restored state, while repeating the current A remains idempotent.
      if (type === "dev.dd.eval.completed") {
        const latest = prior.findLast(event => event.runid === runId && event.type === type);
        return !latest || comparable(latest.data) !== comparable(data);
      }
      return !prior.some(event => event.type === type && comparable(event.data) === comparable(data));
    } }));
}
/** Project the latest execution results from the ordered retained EVAL journal. */
export function storedExecutionResults(events, manifest) {
  return manifest.executions.map(execution => executionState(events, manifest.run_id, execution).result);
}

/** Hash the retained execution generation and results, including the frozen contract. */
export function runResultRevision(events, manifest) {
  const results = manifest.executions.map(execution => {
    const { operation_id, generation, result } = executionState(events, manifest.run_id, execution);
    return { operation_id, generation, result };
  });
  return hashJson(manifest.execution_contract ? { contract_sha256: manifest.execution_contract.semantic_sha256, results } : results);
}
