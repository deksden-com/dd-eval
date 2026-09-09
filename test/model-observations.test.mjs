import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, appendFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkObservedProfile, readModelObservations, modelAttribution, modelObservationFile } from '../lib/model-observations.mjs';
import { modelProgressPump } from '../lib/model-progress.mjs';
import { readEvents } from '../lib/runner-events.mjs';

async function fixture(t) { const root = await mkdtemp(path.join(os.tmpdir(), 'model-observations-')); t.after(() => rm(root, { recursive: true, force: true })); return { root, journal: path.join(root, 'native.jsonl') }; }

test('routing permits mixed profiles, unknown is never matched, integrity remains enforced', () => {
  assert.equal(checkObservedProfile({ model: 'sol' }, {}).status, 'incomplete');
  assert.equal(checkObservedProfile({ model: 'sol' }, { model: 'kimi' }).status, 'mixed');
  assert.throws(() => checkObservedProfile({ mode: 'safe' }, { mode: 'yolo' }), { code: 'profile_integrity_violation' });
  assert.throws(() => checkObservedProfile({ model: 'sol' }, { model: 'kimi' }, { strict: true }), { code: 'profile_integrity_violation' });
});

test('402 transitions and return are durable before progress, replay deduplicates journal across consumers', async t => {
  const { root, journal } = await fixture(t);
  for (const sessionId of ['root', 'child']) {
    const base = { journal, harness: 'droid-cli', sessionId, parentSessionId: sessionId === 'child' ? 'root' : null, requested: { model: 'sol' } };
    for (const [model, previous] of [['kimi', 'sol'], ['sol', 'kimi']]) {
      await appendFile(modelObservationFile(journal), `${JSON.stringify({ schema_id: 'dd-flow/model-observation@1', id: `${sessionId}:${model}`, harness: base.harness, session_id: sessionId, parent_session_id: base.parentSessionId, requested: base.requested, observed: { model }, previous_model: previous, kind: 'model_changed', evidence: 'response', reason: 'overage_reactive_402' })}\n`);
    }
  }
  const notifications = [], context = { eventsFile: path.join(root, 'events.jsonl'), runId: 'run', executionId: 'subject', operationId: 'run:subject:launch' };
  const notify = async (message, event) => { assert.ok((await readEvents(context.eventsFile)).some(row => row.id === event.id)); notifications.push({ message, id: event.id }); };
  await Promise.all([modelProgressPump({ journal, context, notify }).poll(), modelProgressPump({ journal, context, notify }).poll()]);
  assert.equal((await readEvents(context.eventsFile)).length, 4);
  assert.equal(new Set(notifications.map(item => item.id)).size, 4);
  assert.ok(notifications.some(item => /Child child: sol → kimi.*overage_reactive_402.*continues/.test(item.message)));
  const events = await readModelObservations(journal), summary = modelAttribution(events);
  assert.equal(summary.mixed, true); assert.equal(summary.transitions.length, 4);
  assert.equal(summary.usage_attribution, 'session_totals_unattributed_to_model');
  await appendFile(modelObservationFile(journal), `${JSON.stringify({ schema_id: 'dd-flow/model-observation@1', id: 'unavailable', harness: 'droid-cli', session_id: 'child', kind: 'model_observation_unavailable', evidence: 'unavailable' })}\n`);
  await appendFile(modelObservationFile(journal), '{"incomplete":');
  assert.equal((await readModelObservations(journal)).length, 5);
  assert.equal(modelAttribution(await readModelObservations(journal)).observation_completeness, 'incomplete');
});
