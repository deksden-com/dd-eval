import { reduceEvents } from "../runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/**
 * Select exactly one eligible recovery source from retained execution results.
 * @param {object[]} results Retained execution results.
 * @param {string|null} executionId Optional execution scope.
 * @param {string} fromRecoveryId Explicit recovery identifier.
 * @returns {object} Eligible source; throws if absent, ambiguous or stale.
 */
export function selectRecoverySource(results, executionId, fromRecoveryId) {
  if (typeof fromRecoveryId !== "string" || !fromRecoveryId.trim()) fail("recovery requires an explicit --from recovery id", "recovery_source_required");
  const matching = results.filter(result => (!executionId || result.execution === executionId) && result.recovery?.recovery_id === fromRecoveryId);
  if (matching.length !== 1) fail("recovery source is missing, superseded, or ambiguous; inspect the latest recovery evidence", "recovery_source_stale");
  const result = matching[0];
  if (result.state !== "failed" && !result.recovery.resumed_at) fail("the selected recovery source is not eligible for continuation", "recovery_not_eligible");
  return result;
}

/**
 * Find the latest non-superseded recovery source in the append-only history.
 * @param {object[]} events Retained EVAL events.
 * @param {string|null} executionId Optional execution scope.
 * @param {string} fromRecoveryId Explicit recovery identifier.
 * @returns {object|null} The unique retained source, or null.
 */
export function recoverySourceFromEvents(events, executionId, fromRecoveryId) {
  // Repeated capture receipts are evidence for one source. Only the latest
  // recovery per execution is eligible; an explicit old ID cannot bypass it.
  const latest = new Map();
  const retired = new Map();
  for (const event of events) {
    if (event.type !== "dev.dd.eval.execution.failed" || !event.data?.recovery?.recovery_id || (executionId && event.executionid !== executionId)) continue;
    const prior = latest.get(event.executionid)?.recovery;
    const incoming = event.data.recovery;
    const oldIds = retired.get(event.executionid) ?? new Set();
    if (oldIds.has(incoming.recovery_id) || (Number.isInteger(prior?.generation) && Number.isInteger(incoming.generation) && incoming.generation < prior.generation)) continue;
    if (prior && prior.recovery_id !== incoming.recovery_id) oldIds.add(prior.recovery_id);
    retired.set(event.executionid, oldIds);
    latest.set(event.executionid, event.data);
  }
  const matches = [...latest.values()].filter(data => data.recovery.recovery_id === fromRecoveryId);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Reuse the current recovery operation or choose the next retry after failure.
 * @param {object[]} events Retained operation history.
 * @param {string} runId EVAL run identifier.
 * @param {string} executionId Execution identifier.
 * @param {string} recoveryId Recovery source identifier.
 * @returns {string} Recovery operation identifier.
 */
export function recoveryOperationId(events, runId, executionId, recoveryId) {
  const base = `${runId}:${executionId}:launch:recover:${recoveryId}`;
  const operations = reduceEvents(events).operations;
  const retries = Object.keys(operations).filter(id => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:retry:[1-9][0-9]*$`).test(id));
  const number = Math.max(0, ...retries.map(id => Number(id.slice(`${base}:retry:`.length))));
  const latest = number ? `${base}:retry:${number}` : base;
  if (!operations[latest]?.terminal || operations[latest].terminal === "completed") return latest;
  return `${base}:retry:${number + 1}`;
}
