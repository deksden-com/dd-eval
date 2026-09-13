import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { appendEvent, readEvents, recordControllerEvent, recordOperationError, reduceEvents } from '../lib/runner-events.mjs';
import { assertRetainedRunDefinition, loadCase, runnerResume } from '../lib/runner.mjs';
import { workerLiveness, evalRunnerAttemptsStatus } from '../lib/eval-resume-worker.mjs';
import { commandText } from '../lib/process-json.mjs';
import { withRunnerLock } from '../lib/runner-lock.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-reliability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

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
  const manifest = { run_id: 'EVAL', case_id: loaded.value.id, executions: [{ id: 'subject', stage: 'specify', mode: 'e2e' }], input_checkpoint: { sha256: 'changed' }, definition: { commit: await commandText('git', ['rev-parse', 'HEAD']) }, profile: {}, subject_profile: {} };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId: 'EVAL', executionId: 'subject', type: 'dev.dd.eval.operation.started', data: { operation_id: 'EVAL:subject:launch', operation: 'launch', status: 'started' } });
  await assert.rejects(runnerResume({ evalRoot: root }), { code: 'runner_definition_drift' });
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).length, 1);
  manifest.input_checkpoint.sha256 = loaded.inputCheckpoint.sha256;
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
  await writeFile(cli, `await new Promise(resolve => setTimeout(resolve, 300)); console.log(JSON.stringify({process:{id:'foreign'}}));`);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: 'EVAL', runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources') }));
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
