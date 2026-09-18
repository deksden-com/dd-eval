import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { appendEvent, readEvents, recordControllerEvent, recordOperationError, reduceEvents, sha256 } from '../lib/runner-events.mjs';
import { assertRetainedRunDefinition, loadCase, runnerResume, interactionFixtureManifest, prepareRunnerContinuation } from '../lib/runner.mjs';
import { workerLiveness, evalRunnerAttemptsStatus, requestRunnerContinuation, requestEvalResume } from '../lib/eval-resume-worker.mjs';
import { commandText } from '../lib/process-json.mjs';
import { withRunnerLock } from '../lib/runner-lock.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-reliability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

for (const execution of [
  { id: '../outside', mode: 'e2e', stage: 'specify', terminal_stage: 'merge' },
  { id: 'one', mode: 'unknown', stage: 'specify', terminal_stage: 'merge' },
  { id: 'one', mode: 'e2e', stage: 'unknown', terminal_stage: 'merge' },
  { id: 'one', mode: 'segment', stage: 'merge', terminal_stage: 'specify' }
]) test(`productive continuation rejects malformed execution before opening case: ${JSON.stringify(execution)}`, async () => {
  await assert.rejects(prepareRunnerContinuation({ schema_id: 'dd-eval/runner-manifest@1', case_id: 'absent', executions: [execution] }), { code: 'control_input_invalid' });
});

test('direct resume rejects malformed productive input without recording execution', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ schema_id: 'dd-eval/runner-manifest@1', run_id: 'EVAL', case_id: 'absent', executions: [{ id: 'subject', mode: 'unknown', stage: 'specify', terminal_stage: 'merge' }] }));
  await assert.rejects(runnerResume({ evalRoot: root }), { code: 'control_input_invalid' });
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).length, 0);
});

for (const status of ['failed', 'recovery_blocked']) test(`terminal observer receipt repairs its missing root event without executing (${status})`, async t => {
  const root = await fixture(t), request = 'retained';
  const directory = path.join(root, 'runner-attempts', sha256(request));
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'attempt.json');
  await writeFile(file, JSON.stringify({ schema_id: 'dd-eval/resume-worker@1', intent: { kind: 'run', eval_root: root, request_id: request, run_id: 'EVAL' }, status, process_id: 'retained-owner', error: { code: 'observer_failed' } }));
  const worker = new URL('../lib/eval-resume-worker.mjs', import.meta.url);
  for (let i = 0; i < 2; i++) await promisify(execFile)(process.execPath, [worker.pathname, file], { timeout: 5000 });
  const events = await readEvents(path.join(root, 'events.jsonl'));
  assert.equal(events.length, 1);
  assert.equal(events[0].data.error.code, 'observer_failed');
  assert.equal(reduceEvents(events).state, status);
});

test('controller replay is deduplicated independently of the EVAL sequence', async t => {
  const root = await fixture(t), file = path.join(root, 'events.jsonl');
  await appendEvent(file, { source: 'fixture', runId: 'EVAL', type: 'planned', data: {} });
  const input = { eventsFile: file, runId: 'EVAL', executionId: 'subject', controllerId: 'controller', event: { sequence: 1, type: 'session_created', data: { session_id: 'root' } } };
  await recordControllerEvent(input); await recordControllerEvent(input);
  await assert.rejects(recordControllerEvent({ ...input, event: { ...input.event, data: { session_id: 'changed' } } }), { code: 'journal_conflict' });
  await recordControllerEvent({ ...input, controllerId: 'successor' });
  const events = await readEvents(file);
  assert.equal(events.length, 3);
  assert.deepEqual(events.slice(1).map(event => [event.data.sequence, event.data.controller_sequence]), [[2, 1], [3, 1]]);
});

for (const [code, terminal] of [['provider_failed', 'failed'], ['rpc_timeout', null], ['managed_run_controlled', null], ['managed_run_waiting_for_user', null]]) {
  test(`reattach persists ${code} without converting an unknown outcome or wait into failure`, async t => {
    const root = await fixture(t), eventsFile = path.join(root, 'events.jsonl');
    await appendEvent(eventsFile, { source: 'fixture', runId: 'EVAL', executionId: 'subject', type: 'dev.dd.eval.operation.started', data: { operation_id: 'launch', operation: 'launch', status: 'started' } });
    await recordOperationError({ eventsFile, source: 'fixture', runId: 'EVAL', executionId: 'subject', operationId: 'launch', operation: 'launch', error: Object.assign(new Error('original cause'), { code }) });
    const state = reduceEvents(await readEvents(eventsFile)).operations.launch;
    assert.equal(state.terminal ?? null, terminal);
    assert.equal((await readEvents(eventsFile)).at(-1).data.error.message, 'original cause');
  });
}

test('started reattach checks definition before any engine call; untracked case input is drift', async t => {
  const root = await fixture(t), loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const manifest = { schema_id: 'dd-eval/runner-manifest@1', run_id: 'EVAL', case_id: loaded.value.id, executions: [{ id: 'subject', stage: 'specify', terminal_stage: 'merge', mode: 'e2e' }], input_checkpoint: { sha256: 'changed' }, definition: { commit: await commandText('git', ['rev-parse', 'HEAD']) },
    subject_profile: { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' },
    profile: { schema_id: 'dd-eval/run-profile@1', id: 'fixture', case_id: loaded.value.id, subject: { profile_id: 'fixture' }, selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 }, failure_policy: { stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true } } };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId: 'EVAL', executionId: 'subject', type: 'dev.dd.eval.operation.started', data: { operation_id: 'EVAL:subject:launch', operation: 'launch', status: 'started' } });
  await assert.rejects(runnerResume({ evalRoot: root }), { code: 'runner_definition_drift' });
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).length, 1);
  manifest.input_checkpoint.sha256 = loaded.inputCheckpoint.sha256;
  manifest.executions[0].terminal_stage = 'specify';
  const { interactionFixtureManifest } = await import('../lib/runner.mjs');
  manifest.interaction_fixtures = await interactionFixtureManifest(loaded.root, manifest.executions);
  await assertRetainedRunDefinition(manifest, loaded);
  const untracked = path.join(loaded.root, `.definition-probe-${path.basename(root)}.json`);
  await writeFile(untracked, '{}', { flag: 'wx' });
  try { await assert.rejects(assertRetainedRunDefinition(manifest, loaded), { code: 'runner_definition_drift' }); }
  finally { await rm(untracked); }
});

test('owner liveness distinguishes PID reuse, disappearance and missing identity', () => {
  const owner = { owner_pid: 12, owner_started_at: 'original' };
  assert.equal(workerLiveness(owner, [{ pid: 12, started: 'original', zombie: false }]).state, 'alive');
  assert.equal(workerLiveness(owner, [{ pid: 12, started: 'new', zombie: false }]).state, 'absent');
  assert.deepEqual(workerLiveness(owner, []), { state: 'absent', reason: 'owner_disappeared', exit: null });
  assert.equal(workerLiveness({ owner_pid: 12 }, []).state, 'unknown');
});

test('lock can reclaim a reused PID but never a live matching owner', async t => {
  const root = await fixture(t), file = path.join(root, 'owner'), lock = `${file}.lock`;
  await mkdir(lock); await writeFile(path.join(lock, 'owner-reused.json'), JSON.stringify({ pid: process.pid, started_at: 'another process lifetime' }));
  let acquired = false;
  await withRunnerLock(file, async () => {
    acquired = true;
    await assert.rejects(withRunnerLock(file, () => assert.fail('must not steal owner'), { timeoutMs: 20 }), { code: 'runner_lock_timeout' });
  });
  assert.equal(acquired, true);
});

test('ordinary resume survives caller exit and persists an admission failure with process identity and logs', { timeout: 15_000 }, async t => {
  const root = await fixture(t), cli = path.join(root, 'control.mjs');
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const executions = [{ id: 'e2e', mode: 'e2e', stage: 'merge', terminal_stage: 'merge' }];
  await writeFile(cli, `await new Promise(resolve => setTimeout(resolve, 300)); console.log(JSON.stringify({process:{id:'foreign'}}));`);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
    schema_id: 'dd-eval/runner-manifest@1', run_id: 'EVAL-test', case_id: loaded.value.id, executions,
    input_checkpoint: { sha256: loaded.inputCheckpoint.sha256 }, definition: { commit: await commandText('git', ['rev-parse', 'HEAD']) },
    interaction_fixtures: await interactionFixtureManifest(loaded.root, executions),
    runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'),
    subject_profile: { id: 'fake', harness: 'zcode-acp', model: 'fake', reasoning: 'low' },
    profile: { schema_id: 'dd-eval/run-profile@1', id: 'test', case_id: loaded.value.id, subject: { profile_id: 'fake' },
      selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 },
      failure_policy: { stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true } }
  }));
  const source = `import { requestRunnerContinuation } from ${JSON.stringify(new URL('../lib/eval-resume-worker.mjs', import.meta.url).href)}; console.log(JSON.stringify(await requestRunnerContinuation({evalRoot:${JSON.stringify(root)}})));`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', source], { timeout: 5000 });
  const receipt = JSON.parse(stdout), deadline = Date.now() + 8000;
  let status;
  for (;;) {
    status = (await evalRunnerAttemptsStatus(root))[0];
    if (status?.last_recorded_status === 'failed' && status.live_owner?.state === 'absent') break;
    assert.ok(Date.now() < deadline, JSON.stringify(status)); await delay(50);
  }
  assert.equal(status.error.code, 'process_ownership_unknown');
  const saved = JSON.parse(await readFile(receipt.continuation.file, 'utf8'));
  assert.ok(saved.owner_started_at);
  for (const file of ['stdout.log', 'stderr.log', 'events.jsonl']) assert.ok((await stat(path.join(status.attempt, file))).isFile());
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).length, 0);
});

test('invalid productive manifest is rejected before creating a continuation attempt', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: 'EVAL-test', executions: [] }));
  await assert.rejects(requestRunnerContinuation({ evalRoot: root }), { code: 'control_input_invalid' });
  await assert.rejects(stat(path.join(root, 'runner-attempts')), { code: 'ENOENT' });
  assert.deepEqual(await evalRunnerAttemptsStatus(root), []);
});

test('terminal continuation replay does not reopen productive input dependencies', async t => {
  const root = await fixture(t), requestId = 'completed';
  const bytes = JSON.stringify({ run_id: 'EVAL-test', case_id: 'removed-case' });
  await writeFile(path.join(root, 'manifest.json'), bytes);
  const file = path.join(root, 'runner-attempts', sha256(requestId), 'attempt.json');
  await mkdir(path.dirname(file), { recursive: true });
  const receipt = JSON.stringify({ status: 'completed', result: { state: 'completed' }, intent: {
    eval_root: root, run_id: 'EVAL-test', request_id: requestId, kind: 'resume', manifest_sha256: sha256(bytes)
  } });
  await writeFile(file, receipt);
  assert.equal((await requestRunnerContinuation({ evalRoot: root, requestId })).pending, false);
  assert.equal(await readFile(file, 'utf8'), receipt);
  await assert.rejects(requestRunnerContinuation({ evalRoot: root, requestId, kind: 'run' }), { code: 'control_request_conflict' });
});

test('operator continuation rejects invalid productive input without accepting an intent or changing the journal', async t => {
  const root = await fixture(t), runId = 'EVAL-input', eventsFile = path.join(root, 'events.jsonl');
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, runtime_control_bin: process.execPath, runtime_resource_home: path.join(root, 'resources'), executions: [] }));
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const before = await readFile(eventsFile, 'utf8');
  await assert.rejects(requestEvalResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'stop' }), { code: 'control_input_invalid' });
  await assert.rejects(stat(path.join(root, 'control-resumes')), { code: 'ENOENT' });
  await assert.rejects(stat(path.join(root, 'runner-attempts')), { code: 'ENOENT' });
  assert.equal(await readFile(eventsFile, 'utf8'), before);
});
