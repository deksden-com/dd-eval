import { appendEvent, hashJson } from './runner-events.mjs';

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
