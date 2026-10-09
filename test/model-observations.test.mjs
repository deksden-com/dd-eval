import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, appendFile, mkdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkObservedProfile, readModelObservations, modelAttribution, modelObservationFile } from '../lib/model-observations.mjs';
import { resolveEvidenceJournals } from '../lib/runner.mjs';
import { modelProgressPump } from '../lib/model-progress.mjs';
import { readEvents } from '../lib/runner-events.mjs';
import { pathToFileURL } from 'node:url';

test('qualified native routing preserves provenance while model, reasoning and permissions remain strict', () => {
  const requested = { provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'high', mode: 'agent', permission_mode: 'allow' };
  const observed = { ...requested, provider: 'cliproxyapi' };
  const policy = { strictFields: ['model', 'reasoning'], required: ['model', 'reasoning'] };
  const checked = checkObservedProfile(requested, observed, policy);
  assert.deepEqual(checked.changes, ['provider']);
  assert.equal(checked.observed.provider, 'cliproxyapi');
  for (const [key, value] of [['model', 'another-model'], ['reasoning', 'low'], ['mode', 'safe'], ['permission_mode', 'deny']]) {
    assert.throws(() => checkObservedProfile(requested, { ...observed, [key]: value }, policy), { code: 'profile_integrity_violation' });
  }
  assert.throws(() => checkObservedProfile(requested, { ...observed, model: null }, policy), { code: 'profile_integrity_violation' });
  assert.throws(() => checkObservedProfile(requested, observed, { strict: true }), { code: 'profile_integrity_violation' });
});

async function fixture(t) { const root = await mkdtemp(path.join(os.tmpdir(), 'model-observations-')); t.after(() => rm(root, { recursive: true, force: true })); return { root, journal: path.join(root, 'native.jsonl') }; }

test('canonical inventory suppresses guessed legacy paths and requires exact harness/session coverage', async t => {
  const { root, journal } = await fixture(t);
  await appendFile(journal, '');
  await appendFile(modelObservationFile(journal), `${JSON.stringify({ harness: 'zcode-acp', session_id: 'same', observed: { model: 'known' } })}\n`);
  const observations = { schema_id: 'dd-flow/run-observations@1', home: root, sources: [
    { path: 'native.jsonl', provenance: 'current', session: { harness_id: 'zcode-acp', session_id: 'same' } },
    { path: 'missing.jsonl', provenance: 'inherited', session: { harness_id: 'grok-acp', session_id: 'same' } }
  ], tools: { completeness: 'complete', outcome_completeness: 'complete' } };
  const resolved = await resolveEvidenceJournals({ attempt: path.join(root, 'attempt'), statistics: { usage: { observations } } });
  assert.equal(resolved.journals.length, 2);
  assert.ok(!resolved.journals.some(source => source.journal?.includes('subject.events')));
  assert.equal(resolved.attribution.observation_completeness, 'incomplete');
  assert.deepEqual(resolved.attribution.missing_sessions, [{ harness: 'grok-acp', session_id: 'same' }]);
  assert.equal(resolved.tools.status, 'complete', 'tool counters do not prove model coverage');
  const matching = await resolveEvidenceJournals({ statistics: { usage: { observations: { ...observations, sources: observations.sources.slice(0, 1) } } } });
  assert.equal(matching.attribution.observation_completeness, 'available_native_sources');
  assert.deepEqual(matching.attribution.missing_sessions, []);
  const malformed = await resolveEvidenceJournals({ attempt: root, statistics: { usage: { observations: { schema_id: 'future' } } } });
  assert.deepEqual(malformed.journals.map(item => item.reason), ['canonical_inventory_invalid']);
  for (const sources of [{ bad: 'not an array' }, [null], ['not a source']]) {
    const malformed = await resolveEvidenceJournals({ attempt: root, statistics: { usage: { observations: { schema_id: 'dd-flow/run-observations@1', home: root, sources } } } });
    assert.deepEqual(malformed.journals.map(item => item.reason), ['canonical_inventory_invalid']);
    assert.equal(malformed.attribution.observation_completeness, 'incomplete');
  }
});

test('canonical inventory carries inherited journals without adding legacy aggregates', async t => {
  const { root, journal } = await fixture(t);
  await appendFile(journal, '');
  const observations = { schema_id: 'dd-flow/run-observations@1', home: root, sources: [{ path: 'native.jsonl', provenance: 'inherited' }], tools: { total: 7, completeness: 'complete', outcome_completeness: 'complete', observed_sessions: 2, expected_sessions: 2 } };
  const result = await resolveEvidenceJournals({ statistics: { usage: { observations, legacy_tool_calls: { total: 99 } } } });
  assert.equal(result.tools.status, 'complete');
  assert.equal(result.tools.counters.total, 7);
  assert.equal(result.tools.legacy_counters.total, 99);
  assert.equal(result.journals[0].provenance, 'inherited');
  assert.equal(result.attribution.observation_completeness, 'incomplete');
  observations.sources.push({ path: '../outside.jsonl', provenance: 'inherited' });
  const rejected = await resolveEvidenceJournals({ statistics: { usage: { observations } } });
  assert.equal(rejected.tools.status, 'complete', 'an unavailable optional locator cannot erase complete authoritative coverage');
  assert.ok(rejected.journals.some(j => j.reason === 'journal_outside_published_home'));
});

test('asserting canonical sources require identities without discarding readable model evidence', async t => {
  const { root, journal } = await fixture(t);
  await appendFile(journal, '');
  await appendFile(modelObservationFile(journal), `${JSON.stringify({ harness: 'zcode-acp', session_id: 'same', observed: { model: 'known' } })}\n`);
  const resolve = source => resolveEvidenceJournals({ statistics: { usage: { observations: {
    schema_id: 'dd-flow/run-observations@1', home: root, sources: [{ path: 'native.jsonl', ...source }]
  } } } });
  for (const session of [undefined, null, 'invalid', [], {}, { session_id: 'same' }, { harness_id: 'zcode-acp' },
    { harness_id: '', session_id: 'same' }, { harness_id: 'zcode-acp', session_id: 1 }]) {
    const result = await resolve({ session });
    assert.equal(result.attribution.observation_completeness, 'incomplete');
    assert.deepEqual(result.attribution.models, ['known']);
    assert.deepEqual(result.attribution.missing_sessions, []);
    assert.equal(result.journals[0].status, 'available');
    assert.ok(result.journals.some(item => item.reason === 'canonical_session_identity_invalid'));
  }
  for (const source of [{ non_asserting: true }, { session: { non_asserting: true } }]) {
    const result = await resolve(source);
    assert.equal(result.attribution.observation_completeness, 'available_native_sources');
    assert.equal(result.journals.length, 1);
  }
});

test('controller state profile harness aliases preserve exact session identity', async t => {
  const { root, journal } = await fixture(t);
  await appendFile(journal, '');
  await appendFile(modelObservationFile(journal), `${JSON.stringify({ harness: 'zcode-acp', session_id: 'same', observed: { model: 'known' } })}\n`);
  const resolve = harness => resolveEvidenceJournals({ driver: { controller: { sessions: [
    { id: 'same', profile: { harness }, state_dir: root, journal }
  ] } } });
  const wrong = await resolve('grok');
  assert.equal(wrong.attribution.observation_completeness, 'incomplete');
  assert.deepEqual(wrong.attribution.missing_sessions, [{ harness: 'grok-acp', session_id: 'same' }]);
  const matching = await resolve('zcode');
  assert.equal(matching.attribution.observation_completeness, 'available_native_sources');
  assert.deepEqual(matching.attribution.missing_sessions, []);
  const unknown = await resolve('unknown');
  assert.equal(unknown.attribution.observation_completeness, 'incomplete');
  assert.deepEqual(unknown.attribution.models, ['known']);
  assert.ok(unknown.journals.some(item => item.reason === 'controller_session_identity_invalid'));
});

test('routing permits mixed profiles, unknown is never matched, integrity remains enforced', () => {
  assert.equal(checkObservedProfile({ model: 'sol' }, {}).status, 'incomplete');
  assert.equal(checkObservedProfile({ model: 'sol' }, { model: 'kimi' }).status, 'mixed');
  assert.throws(() => checkObservedProfile({ mode: 'safe' }, { mode: 'yolo' }), { code: 'profile_integrity_violation' });
  assert.throws(() => checkObservedProfile({ model: 'sol' }, { model: 'kimi' }, { strict: true }), { code: 'profile_integrity_violation' });
});

test('evidence resolver uses every published controller journal and reports missing observations', async t => {
  const { root, journal } = await fixture(t);
  const secondary = path.join(root, 'child', 'events.jsonl');
  await mkdir(path.dirname(secondary), { recursive: true });
  await appendFile(journal, ""); await appendFile(secondary, "");
  await appendFile(modelObservationFile(journal), `${JSON.stringify({ harness: 'zcode-acp', session_id: 'root', observed: { model: 'root-model' } })}\n`);
  await appendFile(modelObservationFile(secondary), `${JSON.stringify({ harness: 'zcode-acp', session_id: 'child', parent_session_id: 'root', observed: { model: 'child-model' } })}\n`);
  const resolved = await resolveEvidenceJournals({ attempt: path.join(root, 'attempt'), driver: { controller: { sessions: [{ session_id: 'root', journal }, { session_id: 'child', journal: secondary }, { session_id: 'missing', journal: path.join(root, 'missing', 'events.jsonl') }] } }, lifecycle: { untrusted: { journal_path: '/unrelated/private.jsonl' } } });
  assert.deepEqual(new Set(resolved.attribution.models), new Set(['child-model', 'root-model']));
  assert.equal(resolved.attribution.observation_completeness, 'incomplete');
  assert.equal(resolved.journals.filter(item => item.status === 'available').length, 2);
  assert.ok(resolved.journals.some(item => item.reason === 'journal_missing'));
  assert.equal(resolved.journals.length, 3);
  assert.equal(resolved.tools.status, 'partial');
  const failed = await resolveEvidenceJournals({ details: { controller: { sessions: [{ journal }, { journal }] } } });
  assert.equal(failed.journals.length, 1);
  assert.equal(failed.attribution.sessions.length, 1);

  const owned = path.join(root, 'daemon', 'owned.events.jsonl');
  await mkdir(path.dirname(owned), { recursive: true }); await appendFile(owned, '');
  const guarded = await resolveEvidenceJournals({ driver: { controller: { sessions: [
    { state_dir: path.join(root, 'daemon'), journal: owned },
    { state_dir: path.join(root, 'daemon'), journal },
  ] } } });
  assert.equal(guarded.journals.filter(item => item.status === 'available').length, 1);
  assert.ok(guarded.journals.some(item => item.reason === 'journal_outside_published_state_dir'));
  const escaped = path.join(root, 'daemon', 'escaped.jsonl');
  await symlink(journal, escaped);
  const linked = await resolveEvidenceJournals({ driver: { controller: { sessions: [{ state_dir: path.join(root, 'daemon'), journal: escaped }] } } });
  assert.equal(linked.journals[0].reason, 'journal_outside_published_state_dir');
  assert.equal(linked.journals[0].status, 'unavailable');
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

test('model attribution distinguishes a missing inspection from a missing attempt', () => {
  const base = { harness: 'grok-acp', session_id: 'child', parent_session_id: 'root', requested: { model: 'grok-4.7' } };
  const known = { ...base, observed: { model: 'grok-4.7' }, evidence: 'configured', source: { scope: 'configured', attempt_id: 'one' } };
  const inspect = { ...base, observed: {}, evidence: 'unavailable', source: { scope: 'configured', non_asserting: true } };
  assert.equal(modelAttribution([known, inspect], ['child']).observation_completeness, 'available_native_sources');
  assert.equal(modelAttribution([known, inspect], ['child', 'other']).observation_completeness, 'incomplete');
  const next = { ...inspect, source: { scope: 'configured', attempt_id: 'two' } };
  assert.equal(modelAttribution([known, next]).observation_completeness, 'incomplete');
});

test('typed model evidence preserves response gaps, optional omissions and account routing', () => {
  const known = { harness: 'antigravity-cli', session_id: 'root', observed: { provider: 'account-a', model: 'same' }, evidence: 'configured', source: { scope: 'configured', turn_id: 'one' } };
  const omitted = { ...known, observed: {}, evidence: 'unavailable', source: { channel: 'native.hook', scope: 'configured', non_asserting: true } };
  assert.equal(modelAttribution([known, omitted]).observation_completeness, 'available_native_sources');
  const responseUnknown = { ...omitted, source: { scope: 'response', turn_id: 'one' } };
  assert.equal(modelAttribution([known, responseUnknown]).observation_completeness, 'incomplete');
  const configuredMalformed = { ...known, observed: {}, kind: 'model_observation_unavailable' };
  assert.equal(modelAttribution([known, configuredMalformed]).observation_completeness, 'incomplete');
  const responseMalformed = { ...configuredMalformed, evidence: 'response', source: { scope: 'response', turn_id: 'one' } };
  assert.equal(modelAttribution([known, responseMalformed]).observation_completeness, 'incomplete');
  const routed = { ...known, observed: { provider: 'account-b', model: 'same' }, kind: 'model_changed' };
  const result = modelAttribution([known, routed]);
  assert.equal(result.mixed, true); assert.equal(result.transitions.length, 1);
  assert.deepEqual(result.providers, ['account-a', 'account-b']);
});

test('dd-eval model projection matches the selected dd-flow source across typed evidence corpus', { skip: !process.env.DD_FLOW_SOURCE_ROOT && 'set DD_FLOW_SOURCE_ROOT for cross-repository parity' }, async () => {
  const native = await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'src/harness-runtime/lib/model-observations.mjs')).href);
  const root = { harness: 'zcode-acp', session_id: 'root', requested: { model: 'same' }, observed: { provider: 'a', model: 'same' }, kind: 'model_observed', evidence: 'configured', source: { channel: 'native', scope: 'configured', attempt_id: 'one', turn_id: 'one' } };
  const corpus = [[], [root], [root, { ...root, observed: { model: 'same', provider: 'b' }, kind: 'model_changed' }],
    [root, { ...root, observed: {}, kind: 'model_observation_unavailable' }],
    [root, { ...root, observed: {}, evidence: 'response', source: { scope: 'response', turn_id: 'one' } }],
    [root, { ...root, observed: {}, evidence: 'unavailable', source: { channel: 'native.hook', scope: 'configured', non_asserting: true } }],
    [root, { ...root, observed: {}, evidence: 'unavailable', source: { scope: 'response', turn_id: 'two' } }],
    [root, { ...root, session_id: 'child', parent_session_id: 'root', observed: {}, evidence: 'unavailable' }]];
  for (const events of corpus) assert.deepEqual(modelAttribution(events, ['root', 'child']), native.modelAttribution(events, ['root', 'child']));
});
