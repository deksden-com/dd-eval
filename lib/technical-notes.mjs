import { appendEvent, hashJson } from './runner-events.mjs';
import { redactDiagnosticText } from './check-diagnostic.mjs';

export const isTechnicalNote = event => event.type?.startsWith('dev.dd.eval.technical_note.') === true;

/** Resource observations are a mutable appendix, never Subject/Judge input. */
export function technicalNotes(events) {
  const notes = new Map();
  for (const event of events.filter(isTechnicalNote)) {
    const note = event.data;
    if (!note?.key) continue;
    const previous = notes.get(note.key);
    notes.set(note.key, { ...previous, ...note, first_seen: previous?.first_seen ?? event.time,
      last_seen: event.time, state: event.type.endsWith('.resolved') ? 'resolved' : 'open' });
  }
  return [...notes.values()];
}

export async function recordTechnicalNote(eventsFile, runId, note, resolved = false) {
  const key = hashJson([runId, note.generation ?? null, note.source_operation_id ?? null, note.code, note.resource_identity ?? null]);
  try {
    await appendEvent(eventsFile, { source: 'dd-eval://runner', runId,
      type: `dev.dd.eval.technical_note.${resolved ? 'resolved' : 'recorded'}`,
      data: { ...note, key }, beforeAppend: events => {
        const previous = technicalNotes(events).find(item => item.key === key);
        if (!resolved && note.source_run_id && previous?.state === 'resolved' && previous.resolution_basis === 'scoped_physical_retirement'
          && previous.source_last_seen === note.source_last_seen) return false;
        return resolved ? previous?.state === 'open' : previous?.state !== 'open';
      } });
  } catch { process.stderr.write(`Technical note persistence unavailable: ${note.code}\n`); }
}

/** Publish valid subject notes with redacted messages and retained source identity. */
export async function publishSubjectTechnicalNotes(eventsFile, evalRunId, subjectRunId, notes) {
  for (const note of subjectTechnicalNotes(subjectRunId, notes)) await recordTechnicalNote(eventsFile, evalRunId, note, note.state === 'resolved');
}
function subjectTechnicalNotes(subjectRunId, notes) {
  return (Array.isArray(notes) ? notes : []).filter(note => note && note.run_id === subjectRunId && Number.isSafeInteger(note.generation) && ['open', 'resolved'].includes(note.state) && typeof note.id === 'string' && typeof note.code === 'string')
    .map(note => ({ code: note.code, message: redactDiagnosticText(String(note.message ?? '')).slice(0, 1000), phase: note.phase,
      harness: note.harness, generation: note.generation, stage: note.stage, work_id: note.work_id, source_run_id: subjectRunId,
      source_operation_id: `${subjectRunId}:${note.id}`, resource_identity: note.resource_identity ?? null, consequence: note.consequence, state: note.state,
      diagnostic_reference: note.diagnostic_reference, source_first_seen: note.first_seen, source_last_seen: note.last_seen,
      first_seen: note.first_seen, last_seen: note.last_seen }));
}
/** Project observed subject notes alongside retained EVAL notes without altering the journal. */
export function projectSubjectTechnicalNotes(events, evalRunId, observations) {
  const projected = [];
  for (const observation of observations) for (const note of subjectTechnicalNotes(observation.run_id, observation.receipt?.technical_notes ?? [])) projected.push({
    type: `dev.dd.eval.technical_note.${note.state === 'resolved' ? 'resolved' : 'recorded'}`, time: note.last_seen,
    data: { ...note, key: hashJson([evalRunId, note.generation ?? null, note.source_operation_id ?? null, note.code, note.resource_identity ?? null]) } });
  const saved = technicalNotes(events);
  return technicalNotes([...events, ...projected.filter(event => !saved.some(note => note.key === event.data.key && note.state === 'resolved'
    && note.resolution_basis === 'scoped_physical_retirement' && note.source_last_seen === event.data.source_last_seen))]);
}
