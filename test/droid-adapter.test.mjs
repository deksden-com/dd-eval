import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DroidRuntime, parseDroidTranscript, physicalUsage } from '../lib/dd-droid.mjs';

const counters = { inputTokens: 100, outputTokens: 40, cacheReadTokens: 200, cacheCreationTokens: 50, thinkingTokens: 15, factoryCredits: 12 };
const settings = { model: 'gpt-5.6-sol', reasoningEffort: 'high', autonomyMode: 'auto-high', tokenUsage: counters };
const jsonl = records => records.map(record => JSON.stringify(record)).join('\n') + '\n';
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dd-droid-adapter-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = { root_session_id: 'root' };
  const runtime = new DroidRuntime({ stateDir: dir, cwd: dir, home: path.join(dir, 'home'), journal: path.join(dir, 'events.jsonl'), daemonId: 'test', version: '0.212.0', provider: 'openai', model: 'gpt-5.6-sol', reasoning: 'high', mode: 'auto-high' }, state, async patch => Object.assign(state, patch));
  await mkdir(runtime.paths.bindings, { recursive: true });
  const sessions = path.join(runtime.paths.factory, 'sessions', 'workspace');
  await mkdir(sessions, { recursive: true });
  await writeFile(path.join(sessions, 'root.settings.json'), JSON.stringify(settings));
  const transcript = path.join(sessions, 'root.jsonl');
  const header = { type: 'session_start', id: 'root', cwd: dir };
  await writeFile(transcript, jsonl([header]));
  return { dir, runtime, state, transcript, header };
}

test('Droid usage includes each input cache once and does not add thinking twice', () => {
  const result = physicalUsage(counters);
  assert.equal(result.inputTokens, 350);
  assert.equal(result.uncachedInputTokens, 100);
  assert.equal(result.outputTokens, 40);
  assert.equal(result.reasoningTokens, 15);
  assert.equal(result.totalTokens, 390);
  assert.deepEqual(result.native, counters);
  assert.equal(physicalUsage({ ...counters, cacheReadTokens: undefined }), null);
  assert.equal(physicalUsage({ ...counters, outputTokens: -1 }), null);
  assert.equal(physicalUsage({ ...counters, inputTokens: NaN }), null);
  assert.equal(physicalUsage(null), null);
});

test('Droid transcript rejects foreign identity, deduplicates native tools and marks truncated data partial', () => {
  const records = [
    { type: 'session_start', id: 'root' },
    { type: 'message', message: { content: [{ type: 'tool_use', id: 'call-1', name: 'Execute' }] } },
    { type: 'message', message: { content: [{ type: 'tool_use', id: 'call-1', name: 'Execute' }, { type: 'tool_use', id: 'call-2', name: 'Read' }] } },
    { type: 'message', message: { content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: true }, { type: 'tool_result', tool_use_id: 'call-1', is_error: true }, { type: 'tool_result', tool_use_id: 'unseen', is_error: true }] } },
  ];
  const complete = parseDroidTranscript(jsonl(records), settings, 'root');
  assert.deepEqual(complete.tool_calls, { total: 2, failures: 1, by_tool: { Execute: 1, Read: 1 } });
  assert.equal(complete.complete, true);
  assert.equal(parseDroidTranscript(jsonl(records) + '{"type":', settings, 'root').complete, false);
  assert.throws(() => parseDroidTranscript(jsonl(records), settings, 'foreign'), { code: 'session_identity_mismatch' });
  assert.throws(() => parseDroidTranscript('{}\n', settings, 'root'), { code: 'session_identity_mismatch' });
});

test('Droid only resolves the submitted native turn, ignoring task-completion and child terminals', async t => {
  const { runtime } = await fixture(t);
  let resolved = 0;
  runtime.topology.set('child', { provider_session_id: 'child' });
  runtime.active = { operationId: 'op', requestId: 'request', turnId: 'expected-turn', text: '', saved: {}, resolve: () => resolved++, reject: assert.fail };
  const notification = (sessionId, turnId) => ({ method: 'droid.session_notification', params: { sessionId, notification: { type: 'agent_turn_completed', turnId, reason: 'completed' } } });
  await runtime.event(notification('root', 'task-completion:other'));
  await runtime.event(notification('child', 'expected-turn'));
  assert.equal(resolved, 0);
  assert.equal(runtime.active.outcome, undefined);
  await runtime.event(notification('root', 'expected-turn'));
  assert.equal(resolved, 1);
  assert.equal(runtime.active.outcome.turnId, 'expected-turn');
  const file = path.join(runtime.paths.bindings, createHash('sha256').update('op').digest('hex') + '.json');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).native_outcome.turnId, 'expected-turn');
  await assert.rejects(runtime.event(notification('unrelated', 'expected-turn')), { code: 'session_identity_mismatch' });
});

test('Droid recovery needs the exact persisted native outcome and a settled tree', async t => {
  const { runtime, transcript, header } = await fixture(t);
  await runtime.saveBinding({ operationId: 'op', saved: { operation: 'session.prompt', provider_session_id: 'root', turn_id: 'wanted', assistant_text: 'saved answer' } });
  assert.equal(await runtime.recoverOperation('missing'), null);
  await writeFile(transcript, jsonl([header, { type: 'agent_turn_outcome', turnId: 'other', reason: 'completed' }]));
  assert.equal(await runtime.recoverOperation('op'), null);
  await writeFile(transcript, jsonl([header, { type: 'agent_turn_outcome', turnId: 'wanted', reason: 'completed' }]));
  runtime.topology.set('child', { provider_session_id: 'child', parent_provider_session_id: 'root', status: 'running' });
  assert.equal(await runtime.recoverOperation('op'), null);
  runtime.topology.clear();
  const recovered = await runtime.recoverOperation('op');
  assert.equal(recovered.provider_session_id, 'root');
  assert.equal(recovered.turn_id, 'wanted');
  assert.equal(recovered.result.status, 'completed');
  assert.equal(recovered.assistant_text, 'saved answer');
  assert.equal(recovered.recovered_from, 'native.agent_turn_outcome');
});

test('Droid recovery keeps its operation when prompt completes during binding persistence', async t => {
  const { runtime, transcript, header } = await fixture(t);
  const current = { operationId: 'op', turnId: 'wanted', saved: { operation: 'session.prompt', provider_session_id: 'root', turn_id: 'wanted', assistant_text: 'saved answer' }, text: 'saved answer', resolve: outcome => { resolved = outcome; } };
  let resolved = null;
  await runtime.saveBinding(current);
  await writeFile(transcript, jsonl([header, { type: 'agent_turn_outcome', turnId: 'wanted', reason: 'completed' }]));
  runtime.inspect = async () => ({ settled: true, provider_session_id: 'root' });
  runtime.active = current;
  const save = runtime.saveBinding.bind(runtime);
  runtime.saveBinding = async (...args) => { await save(...args); runtime.active = null; };
  assert.equal(await runtime.recoverOperation('op'), null);
  assert.equal(resolved.turnId, 'wanted');
  assert.equal(runtime.active, null);
});

test('Droid validates native model, reasoning and mode rather than requested values', async t => {
  const { runtime } = await fixture(t);
  assert.deepEqual(runtime.profile(settings), { provider: 'openai', model: 'gpt-5.6-sol', reasoning: 'high', mode: 'auto-high' });
  for (const change of [{ model: 'fallback' }, { reasoningEffort: 'low' }, { autonomyMode: 'auto-low' }]) {
    assert.throws(() => runtime.profile({ ...settings, ...change }), { code: 'profile_drift' });
  }
  assert.throws(() => runtime.profile({}), { code: 'profile_drift' });
});

async function resumeFixture(t, resumeInput, { toolName = 'Task', childParent = 'root' } = {}) {
  const base = await fixture(t);
  const { runtime, transcript, header } = base;
  const folder = path.dirname(transcript);
  await writeFile(path.join(folder, 'child.jsonl'), jsonl([{ type: 'session_start', id: 'child', cwd: base.dir, callingSessionId: childParent, callingToolUseId: 'create-tool' }]));
  await writeFile(path.join(folder, 'child.settings.json'), JSON.stringify(settings));
  await writeFile(transcript, jsonl([header, { type: 'message', message: { role: 'assistant', content: [
    { type: 'tool_use', id: 'create-tool', name: 'Task', input: { subagent_type: 'dd-flow-worker', prompt: 'original Work' } },
    { type: 'tool_use', id: 'resume-tool', name: toolName, input: resumeInput },
    { type: 'text', text: 'resume child; this text is not native identity evidence' },
  ] } }]));
  const catalog = path.join(runtime.paths.factory, 'task-invocations.json');
  const first = { taskInvocationId: 'first-task', createdAt: 1, parentSessionId: 'root', parentToolUseId: 'create-tool', childSessionId: 'child', status: 'completed' };
  const second = { taskInvocationId: 'resumed-task', createdAt: 2, parentSessionId: 'root', parentToolUseId: 'resume-tool', childSessionId: 'child', status: 'running' };
  await writeFile(catalog, JSON.stringify({ invocations: [first, second] }));
  return { ...base, catalog, first, second };
}

test('Droid native Task resume remains one physical child and follows the latest invocation state', async t => {
  const { runtime, catalog, first, second } = await resumeFixture(t, { resume: 'child', subagent_type: 'dd-flow-worker' });
  const observed = await runtime.refreshTopology();
  assert.equal(observed.length, 1);
  assert.equal(observed[0].provider_session_id, 'child');
  assert.equal(observed[0].parent_provider_session_id, 'root');
  assert.equal(observed[0].status, 'running');
  assert.equal(observed[0].tool_use_id, 'create-tool');
  assert.equal(observed[0].latest_tool_use_id, 'resume-tool');
  assert.deepEqual(observed[0].task_invocation_ids, ['first-task', 'resumed-task']);
  assert.equal((await runtime.refreshTopology()).length, 1, 'repeated observation must not interpret prior resume as another child');
  await writeFile(catalog, JSON.stringify({ invocations: [first, { ...second, status: 'completed' }] }));
  assert.equal((await runtime.refreshTopology())[0].status, 'completed');
});

test('Droid refuses child reuse without matching native Task resume evidence', async t => {
  for (const scenario of [
    { label: 'missing resume', input: { prompt: 'resume child' } },
    { label: 'foreign resume', input: { resume: 'other-child' } },
    { label: 'non-Task tool', input: { resume: 'child' }, options: { toolName: 'Execute' } },
    { label: 'foreign parent', input: { resume: 'child' }, options: { childParent: 'other-root' } },
  ]) {
    await t.test(scenario.label, async childTest => {
      const { runtime } = await resumeFixture(childTest, scenario.input, scenario.options);
      await assert.rejects(runtime.refreshTopology(), { code: 'droid_child_identity_invalid' });
    });
  }
});
