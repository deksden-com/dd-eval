import { stages } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";

/**
 * Identify the latest known stage from a retained status and selected flow contour.
 * @param {object} status Retained flow status.
 * @param {string|null} fallback Stage to use when no known stage is observed.
 * @param {string[]} flowContour Ordered stage catalog.
 * @returns {string|null} Latest unfinished or completed stage, or the fallback.
 */
export function latestObservedStage(status, fallback, flowContour = stages) {
  const catalog = flowStageCatalog(flowContour);
  const records = status?.index?.stage_runs ?? status?.run?.index?.stage_runs ?? [];
  const known = Array.isArray(records) ? records.filter((record) => catalog.includes(record?.stage)) : [];
  const unfinished = known.filter((record) => record.status !== "done").sort((a, b) => catalog.indexOf(b.stage) - catalog.indexOf(a.stage))[0];
  if (unfinished?.stage) return unfinished.stage;
  return known.sort((a, b) => catalog.indexOf(b.stage) - catalog.indexOf(a.stage))[0]?.stage ?? fallback;
}

/**
 * Attribute a failure to a stage using generation-bound events and retained status.
 * @param {object} input Execution result, events, status and optional flow contour.
 * @returns {object} Current and last-completed stage, including pending entry.
 */
export function failureStageAttribution({ result, events, status, flowContour = stages }) {
  const catalog = flowStageCatalog(flowContour);
  const stageEvent = event => event.type === 'dev.dd.eval.execution.context_prepared'
    || event.type === 'dev.dd.eval.controller.event' && event.data?.type === 'stage_entered';
  const bound = result.execution_operation_id && events.some(event => event.executionid === result.execution
    && event.data?.execution_operation_id === result.execution_operation_id && stageEvent(event));
  const context = events.findLast(event => event.executionid === result.execution
    // Unbound legacy context is usable only before a generation has a bound context.
    && (!result.execution_operation_id || event.data?.execution_operation_id === result.execution_operation_id
      || !event.data?.execution_operation_id && !bound)
    && stageEvent(event)
    && catalog.includes(event.type === 'dev.dd.eval.controller.event' ? event.data?.data?.stage : event.data?.stage));
  const current = context && (context.type === 'dev.dd.eval.controller.event' ? context.data.data.stage : context.data.stage);
  const observed = latestObservedStage(status, result.stage, flowContour);
  const stage = current && (bound || catalog.indexOf(current) >= catalog.indexOf(observed)) ? current : observed;
  const records = (status?.index?.stage_runs ?? status?.run?.index?.stage_runs ?? []).filter(record => catalog.includes(record?.stage));
  const completed = records.filter(record => record.status === 'done').sort((a, b) => catalog.indexOf(b.stage) - catalog.indexOf(a.stage))[0]?.stage ?? null;
  return { stage, last_completed_stage: completed, pending_stage_entry: current === stage && !records.some(record => record.stage === stage) ? stage : null };
}
