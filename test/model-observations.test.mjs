import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkObservedProfile, observeModel, readModelObservations, modelAttribution, modelObservationFile } from '../lib/model-observations.mjs';
import { readDroidRoutingLog, parseDroidRoutingLine } from '../lib/droid-observation.mjs';
import { modelProgressPump } from '../lib/model-progress.mjs';
import { readEvents } from '../lib/runner-events.mjs';

async function fixture(t) { const root = await mkdtemp(path.join(os.tmpdir(), 'model-observations-')); t.after(() => rm(root, { recursive: true, force: true })); return { root, journal: path.join(root, 'native.jsonl') }; }
const line = (model, previous, session = 'child') => `[2026-09-07T00:00:00Z] INFO [Model-Router] Model transition | Context: ${JSON.stringify({ slot: 'main', sessionId: session, modelId: model, previousModelId: previous, reason: 'overage_reactive_402' })}\n`;

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
      const native = parseDroidRoutingLine(line(model, previous, sessionId).trim());
      await observeModel({ ...base, observed: { model }, previousModel: previous, reason: native.reason, source: { event_sha256: native.event_sha256 }, nativeTimestamp: native.native_timestamp });
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
  await appendFile(modelObservationFile(journal), '{"incomplete":');
  assert.equal((await readModelObservations(journal)).length, 4);
  await observeModel({ journal, harness: 'droid-cli', sessionId: 'child', source: 'missing', evidence: 'unavailable' });
  assert.equal((await readModelObservations(journal)).length, 5);
  assert.equal(modelAttribution(await readModelObservations(journal)).observation_completeness, 'incomplete');
});

test('bounded routing reader handles partial writes, restart, truncation, rotation and excludes other messages', async t => {
  const { root } = await fixture(t), file = path.join(root, 'routing.log'), first = line('kimi', 'sol');
  await writeFile(file, first.slice(0, -7));
  let read = await readDroidRoutingLog(file); assert.equal(read.events.length, 0);
  await appendFile(file, first.slice(-7)); read = await readDroidRoutingLog(file, read.cursor);
  assert.equal(read.events.length, 1); assert.equal(read.events[0].reason, 'overage_reactive_402');
  assert.equal((await readDroidRoutingLog(file, JSON.parse(JSON.stringify(read.cursor)))).events.length, 0);
  await rename(file, `${file}.old`); await writeFile(file, line('sol', 'kimi'));
  read = await readDroidRoutingLog(file, read.cursor); assert.equal(read.events[0].model, 'sol');
  await writeFile(file, '\n'); read = await readDroidRoutingLog(file, read.cursor); assert.equal(read.cursor.offset, 1);
  assert.equal(parseDroidRoutingLine('Authorization: never persisted'), null);
});
