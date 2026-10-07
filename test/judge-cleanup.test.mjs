import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import childProcess from 'node:child_process';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { assertJudgeCleanup, assertJudgeCleanupCurrent, finishJudgeCleanup } from '../lib/judge-cleanup.mjs';

test('all Judge cleanup consumers reject live/unknown identity but reuse a retired daemon with recycled PID', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'judge-reused-pid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const verdict = { profile_id: 'offline', session_id: 'session', result: { valid: true } };
  await settledJudge(root, verdict);
  const stateFile = path.join(root, 'daemon', 'daemon.json');
  const state = JSON.parse(await readFile(stateFile));
  const retired = { ...state, pid: process.pid, stopped_at: '2020-01-01T00:00:00Z' };
  await writeFile(stateFile, JSON.stringify(retired));
  const before = await Promise.all(['result.json', 'cleanup.json', 'daemon/daemon.json'].map(file => readFile(path.join(root, file))));
  const reference = await assertJudgeCleanup(root, verdict);
  assert.equal(assertJudgeCleanupCurrent(reference), true);
  await finishJudgeCleanup({ root, profileId: 'offline', stop: () => assert.fail('never signal the unrelated recycled PID') });
  assert.deepEqual(await Promise.all(['result.json', 'cleanup.json', 'daemon/daemon.json'].map(file => readFile(path.join(root, file)))), before);
  for (const stopped_at of [undefined, 'corrupt', new Date(Date.now() + 60_000).toISOString()]) {
    await writeFile(stateFile, JSON.stringify({ ...retired, stopped_at }));
    await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_cleanup_unconfirmed' });
    assert.throws(() => assertJudgeCleanupCurrent(reference), { code: 'judge_cleanup_unconfirmed' });
  }
  await writeFile(stateFile, JSON.stringify(retired));
  t.mock.method(childProcess, 'execFileSync', () => { throw Object.assign(new Error('ps failed'), { code: 'EIO' }); });
  await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_cleanup_unconfirmed' });
  assert.throws(() => assertJudgeCleanupCurrent(reference), { code: 'judge_cleanup_unconfirmed' });
});

test('Judge verdict and lifecycle remain independently bound; cleanup reuse never repeats a turn', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'judge-cleanup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const verdict = { profile_id: 'offline', session_id: 'session', result: { valid: true } };
  await settledJudge(root, verdict);
  const bytes = await readFile(path.join(root, 'result.json'));
  const publication = await assertJudgeCleanup(root, verdict);
  assert.equal(assertJudgeCleanupCurrent(publication), true);
  const afterVerdictFailure = Object.assign(new Error('result event write failed'), { code: 'EIO' });
  await finishJudgeCleanup({ root, profileId: 'offline', primaryError: afterVerdictFailure, stop: () => assert.fail('settled cleanup must not repeat') });
  assert.equal(afterVerdictFailure.details.retained_verdict.verdict.result.valid, true);
  assert.equal(afterVerdictFailure.cleanup_error, undefined);
  await writeFile(path.join(root, 'result.json'), JSON.stringify({ ...verdict, result: { valid: false } }));
  assert.throws(() => assertJudgeCleanupCurrent(publication), { code: 'judge_cleanup_unconfirmed' });
  await writeFile(path.join(root, 'result.json'), bytes);
  const stateFile = path.join(root, 'daemon', 'daemon.json'), stateBytes = await readFile(stateFile), state = JSON.parse(stateBytes);
  await writeFile(stateFile, JSON.stringify({ ...state, shutdown: { ...state.shutdown, phases: { ...state.shutdown.phases, provider_close: false } } }));
  await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_cleanup_unconfirmed' });
  assert.throws(() => assertJudgeCleanupCurrent(publication), { code: 'judge_cleanup_unconfirmed' });
  await writeFile(stateFile, stateBytes);
  await finishJudgeCleanup({ root, profileId: 'offline', stop: () => { throw new Error('must not replay'); } });
  assert.deepEqual(await readFile(path.join(root, 'result.json')), bytes);
  const cleanup = JSON.parse(await readFile(path.join(root, 'cleanup.json')));
  await writeFile(path.join(root, 'cleanup.json'), '{');
  await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_evidence_mismatch' });
  await writeFile(path.join(root, 'cleanup.json'), JSON.stringify({ ...cleanup, daemon_id: 'foreign' }));
  await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_cleanup_unconfirmed' });
  await assert.rejects(finishJudgeCleanup({ root, profileId: 'offline', stop: () => assert.fail('foreign incarnation must never receive a stop') }), { code: 'judge_evidence_mismatch' });
  assert.equal(JSON.parse(await readFile(path.join(root, 'cleanup.json'))).daemon_id, 'foreign');
  await writeFile(path.join(root, 'cleanup.json'), JSON.stringify({ ...cleanup, status: 'failed' }));
  await finishJudgeCleanup({ root, profileId: 'offline', stop: () => assert.fail('completed original stop proof must not send RPC to a dead bridge') });
  assert.equal(JSON.parse(await readFile(path.join(root, 'cleanup.json'))).stop_operation_id, cleanup.stop_operation_id);
  await writeFile(path.join(root, 'cleanup.json'), JSON.stringify({ ...cleanup, status: 'failed', stop_operation_id: 'judge-cleanup:unconfirmed' }));
  const error = Object.assign(new Error('EPERM'), { code: 'EPERM' });
  await assert.rejects(finishJudgeCleanup({ root, profileId: 'offline', stop: async () => { throw error; } }), failure => {
    assert.equal(failure.code, 'judge_cleanup_failed');
    assert.equal(failure.details.retained_verdict.verdict.result.valid, true);
    assert.equal(failure.details.cleanup_error.code, 'EPERM'); return true;
  });
  const primary = Object.assign(new Error('judge failed'), { code: 'native_failure' });
  await finishJudgeCleanup({ root, profileId: 'offline', primaryError: primary, stop: async () => { throw error; } });
  assert.equal(primary.code, 'native_failure'); assert.equal(primary.cleanup_error.code, 'EPERM');
  assert.deepEqual(await readFile(path.join(root, 'result.json')), bytes);
});
