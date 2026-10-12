import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { cleanupObservation } from '../lib/cleanup-observation.mjs';
import { workerCleanupFailure } from '../lib/eval-resume-worker.mjs';
import { createHash } from 'node:crypto';

test('late sealed capture is visible independently of report; foreign proof never completes cleanup', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cleanup-observation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home');
  const recovery = path.join(root, 'recovery'), capture = path.join(recovery, 'REC-1');
  for (const dir of [project, runtime, capture]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(attempt, 'managed-runtime.json'), JSON.stringify({ schema_id: 'dd-eval/managed-runtime@1', project_root: project, runtime_root: runtime, run_id: 'RUN-1' }));
  const snapshot = { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'recovery', run_id: 'RUN-1', recovery_id: 'REC-1', project_root: project, dd_flow_home: runtime };
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify(snapshot));
  const control = { current: true, control_id: 'CTRL-1', recovery_id: 'REC-1', generation: 1, admission: 'sealed', capture_path: capture };
  const input = { root, manifest: { executions: [{ id: 'e' }], runtime_recovery_home: recovery }, results: [{ execution: 'e', state: 'failed', run_id: 'RUN-1' }],
    live: { executions: [{ execution: 'e', run_id: 'RUN-1', receipt: { scope: { run_id: 'RUN-1' }, settled: true, control } }] }, report: null, reportState: 'pending' };
  const ready = await cleanupObservation(input);
  assert.equal(ready.physical, 'settled'); assert.equal(ready.capture, 'ready'); assert.equal(ready.finalization, 'pending');
  input.results[0].recovery = { run_id: 'FOREIGN-HISTORY' };
  const conflicting = await cleanupObservation(input);
  assert.equal(conflicting.physical, 'unknown'); assert.equal(conflicting.capture, 'unknown', 'matching current control cannot replace a foreign retained RUN');
  delete input.results[0].recovery;
  const normalBytes = JSON.stringify({ ...snapshot, purpose: 'candidate' });
  const normalFile = path.join(root, 'candidate-snapshot.json'); await writeFile(normalFile, normalBytes);
  const normal = { ...input, results: [{ ...input.results[0], state: 'candidate_ready', candidate: { manifest: normalFile, manifest_sha256: createHash('sha256').update(normalBytes).digest('hex') } }],
    live: { executions: [{ ...input.live.executions[0], receipt: { scope: { run_id: 'RUN-1' }, settled: true, control: null } }] } };
  assert.equal((await cleanupObservation(normal)).capture, 'ready', 'normal completion needs no recovery control');
  control.current = false;
  assert.equal((await cleanupObservation(input)).physical, 'unknown');
  control.current = true;
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify({ ...snapshot, run_id: 'foreign' }));
  assert.equal((await cleanupObservation(input)).capture, 'unknown');
  input.manifest.executions.push({ id: 'other' });
  assert.equal((await cleanupObservation(input)).physical, 'unknown', 'all executions require proof');
});

test('pre-native failure needs no RUN cleanup and finally preserves primary failure', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cleanup-baseline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observed = await cleanupObservation({ root, manifest: { executions: [{ id: 'e' }] }, results: [{ execution: 'e', state: 'failed' }], live: {}, reportState: 'pending' });
  assert.equal(observed.physical, 'not_applicable'); assert.equal(observed.capture, 'not_applicable');
  const retained = await cleanupObservation({ root, manifest: { executions: [{ id: 'e' }] }, results: [{ execution: 'e', state: 'failed', recovery: { run_id: 'RUN-retained' } }], live: {}, reportState: 'pending' });
  assert.equal(retained.physical, 'unknown'); assert.equal(retained.capture, 'unknown', 'lost binding does not erase a retained native RUN');
  const failure = workerCleanupFailure({ status: 'recovery_blocked', error: { code: 'owner_lost' } }, Object.assign(new Error('finish failed'), { code: 'finish_failed' }));
  assert.equal(failure.status, undefined); assert.equal(failure.cleanup_error.code, 'finish_failed');
});
