import { appendEvent, canonicalJson, hashJson, reduceEvents } from "../runner-events.mjs";
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
const executionResults = (events, manifest) => manifest.executions.map(execution => {
  const { operation_id, generation, result } = executionState(events, manifest.run_id, execution);
  return { operation_id, generation, result };
});
const revisionOf = (manifest, results) => hashJson(manifest.execution_contract
  ? { contract_sha256: manifest.execution_contract.semantic_sha256, results } : results);

/** Project the latest execution results from the ordered retained EVAL journal. */
export function storedExecutionResults(events, manifest) {
  return manifest.executions.map(execution => executionState(events, manifest.run_id, execution).result);
}

/** Hash the retained execution generation and results, including the frozen contract. */
export function runResultRevision(events, manifest) {
  return revisionOf(manifest, executionResults(events, manifest));
}

/** Project results and their revision from one pass over the journal. */
export function storedResultProjection(events, manifest) {
  const records = executionResults(events, manifest);
  return { results: records.map(({ result }) => result), revision: revisionOf(manifest, records) };
}

/** Read the retained operation projection by its durable identifier. */
export function terminalOperation(events, operationId) {
  return reduceEvents(events).operations[operationId] ?? null;
}
/** Select the latest retained subject Session, including successor Sessions. */
export function subjectSessionFor(events, executionId) {
  // A configured stage transition may continue through a successor Session.
  // Recovery must address the latest Session for this execution, not the
  // original one that started it.
  const sessions = events.filter((event) => event.executionid === executionId
    && ["dev.dd.eval.subject.session_created", "dev.dd.eval.subject.successor_session_created"].includes(event.type)
    && typeof event.data?.session_id === "string");
  return sessions.at(-1)?.data.session_id ?? null;
}
/** Read the most recent prepared stage context and first operation start time. */
export function preparedContextFor(events, executionId, stage) {
  const prepared = events.filter((event) => event.executionid === executionId && event.type === "dev.dd.eval.execution.context_prepared" && event.data?.stage === stage).at(-1);
  const started = events.find((event) => event.executionid === executionId && event.type === "dev.dd.eval.operation.started")?.time ?? null;
  return { ...(prepared?.data ?? {}), started_at: started };
}
