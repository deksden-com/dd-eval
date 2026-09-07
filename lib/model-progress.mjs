import { appendEvent } from './runner-events.mjs';
import { readModelObservations } from './model-observations.mjs';

export function modelProgressMessage(event) {
  const who = `${event.parent_session_id ? 'Child' : 'Session'} ${event.session_id}`;
  if (event.kind === 'model_observation_unavailable') return `${who}: model observation unavailable; attribution is incomplete.`;
  return `${who}: ${event.previous_model} → ${event.observed.model}; reason: ${event.reason ?? 'unknown'}; execution continues.`;
}

// Persist before notifying. A new consumer may replay the same stable ID after
// restart; the runner journal deduplicates it, without promising exactly-once UI.
export function modelProgressPump({ journal, context, notify = message => process.stderr.write(`${message}\n`), delivered = new Set() }) {
  let active = null;
  const poll = () => active ??= (async () => {
    if (!journal) return;
    for (const observation of await readModelObservations(journal)) {
      if (delivered.has(observation.id)) continue;
      let event = observation;
      if (context?.eventsFile && context.executionId) event = await appendEvent(context.eventsFile, {
        id: `MODEL-${observation.id}`, deduplicate: true, source: 'dd-eval://model-observation',
        runId: context.runId, executionId: context.executionId, traceId: context.runId,
        type: `dev.dd.eval.${observation.kind}`,
        data: { observation, execution_operation_id: context.operationId }
      });
      if (observation.kind !== 'model_observed') {
        try { await notify(modelProgressMessage(observation), event); }
        catch { continue; } // UI delivery may retry; the observation is already durable.
      }
      delivered.add(observation.id);
    }
  })().finally(() => { active = null; });
  return { poll };
}
