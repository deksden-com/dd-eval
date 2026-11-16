import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as status from '../lib/eval-worker-status.mjs';
import * as worker from '../lib/eval-resume-worker.mjs';

test('status preserves worker exports and reports foreign or corrupt receipts without mutation', async t => {
  for (const name of ['workerLiveness', 'evalResumeWorkerStatus', 'evalRunnerAttemptsStatus']) assert.equal(worker[name], status[name]);
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-worker-status-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resumes = path.join(root, 'control-resumes'), attempts = path.join(root, 'runner-attempts');
  const valid = 'a'.repeat(64), foreign = 'b'.repeat(64), broken = 'c'.repeat(64);
  await mkdir(resumes); await mkdir(path.join(attempts, valid), { recursive: true });
  const receipt = { schema_id: 'dd-eval/resume-worker@1', intent: { eval_root: path.resolve(root), request_id: 'test' }, status: 'requested' };
  await writeFile(path.join(resumes, `${valid}.json`), JSON.stringify(receipt));
  await writeFile(path.join(resumes, `${foreign}.json`), JSON.stringify({ ...receipt, intent: { ...receipt.intent, eval_root: '/foreign' } }));
  await writeFile(path.join(resumes, `${broken}.json`), '{');
  const continuations = await status.evalResumeWorkerStatus(root);
  assert.equal(continuations[0].request_id, 'test');
  assert.equal(continuations[1].error.code, 'control_request_conflict');
  assert.equal(continuations[2].unavailable, true);
  const [attempt] = await status.evalRunnerAttemptsStatus(root);
  assert.equal(attempt.kind, 'control-resume');
  assert.equal(attempt.live_owner.state, 'unknown');
});
