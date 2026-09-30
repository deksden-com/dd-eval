import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { assertJudgeCleanup, finishJudgeCleanup } from '../lib/judge-cleanup.mjs';

test('Judge verdict and lifecycle remain independently bound; cleanup reuse never repeats a turn', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'judge-cleanup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const verdict = { profile_id: 'offline', session_id: 'session', result: { valid: true } };
  await settledJudge(root, verdict);
  const bytes = await readFile(path.join(root, 'result.json'));
  await finishJudgeCleanup({ root, profileId: 'offline', stop: () => { throw new Error('must not replay'); } });
  assert.deepEqual(await readFile(path.join(root, 'result.json')), bytes);
  const cleanup = JSON.parse(await readFile(path.join(root, 'cleanup.json')));
  await writeFile(path.join(root, 'cleanup.json'), JSON.stringify({ ...cleanup, daemon_id: 'foreign' }));
  await assert.rejects(assertJudgeCleanup(root, verdict), { code: 'judge_cleanup_unconfirmed' });
  await assert.rejects(finishJudgeCleanup({ root, profileId: 'offline', stop: () => assert.fail('foreign incarnation must never receive a stop') }), { code: 'judge_evidence_mismatch' });
  assert.equal(JSON.parse(await readFile(path.join(root, 'cleanup.json'))).daemon_id, 'foreign');
  await writeFile(path.join(root, 'cleanup.json'), JSON.stringify({ ...cleanup, status: 'failed' }));
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
