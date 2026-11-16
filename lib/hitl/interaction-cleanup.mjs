import path from "node:path";
import { readJson } from "../json-file.mjs";
import { observeJudgeCleanup } from "../judge/cleanup.mjs";
import { recordTechnicalNote } from "../technical-notes.mjs";

/** Observe retained Interaction Judge cleanup and record scoped retirement notes. */
export async function interactionCleanupPending(eventsFile, runId, events, results = []) {
  let pending = false;
  const receipts = new Set(events.filter(event => event.type === 'dev.dd.eval.hitl.matched' && !['jev', 'semantic_decision'].includes(event.data?.decision_source))
    .map(event => event.data?.receipt_file).filter(file => typeof file === 'string'));
  for (const result of results) for (const item of result.hitl ?? []) if (typeof item.receipt_file === 'string') receipts.add(item.receipt_file);
  for (const file of receipts) {
    const verdict = await readJson(file), directory = path.dirname(file);
    if (['jev', 'semantic_decision'].includes(verdict.decision_source)) continue;
    const cleanup = await observeJudgeCleanup(directory, verdict);
    pending ||= cleanup.status !== 'settled';
    await recordTechnicalNote(eventsFile, runId, { code: 'interaction_judge_cleanup_pending', message: 'Canonical answer retained; Interaction Judge resources await retirement', phase: 'cleanup',
      resource_identity: directory, consequence: 'cleanup_pending' }, cleanup.status === 'settled');
  }
  return pending;
}
