import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { cancelOwnedDaemon } from '../lib/daemon-control.mjs';
import { writeJsonAtomic } from '../lib/runner-events.mjs';
import { assertDaemonReplaceable } from '../lib/driver-recovery.mjs';

test('settled cancellation and replacement ignore only PIDs born after retained shutdown', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-control-reused-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = { pid: process.pid, config: { cwd: root }, sessions: ['owned'], active_tree: false,
    shutdown_state: 'clean', shutdown: { result: { clean: true } }, stopped_at: '2020-01-01T00:00:00Z' };
  const offline = async () => { throw Object.assign(new Error('offline'), { code: 'daemon_not_running' }); };
  await writeJsonAtomic(path.join(root, 'daemon.json'), state);
  await assertDaemonReplaceable(root);
  assert.equal((await cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: offline })).settled, true);
  for (const patch of [{ stopped_at: undefined }, { stopped_at: 'corrupt' }, { shutdown_state: 'running' }, { active_tree: true }]) {
    await writeJsonAtomic(path.join(root, 'daemon.json'), { ...state, ...patch });
    await assert.rejects(assertDaemonReplaceable(root), { code: 'operation_observation_lost' });
    await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: offline }), { code: 'cancellation_unconfirmed' });
  }
  assert.equal(process.kill(process.pid, 0), true);
});

test('cancel uses retained identity and native stop without status, start, or profile checks', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-control-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJsonAtomic(path.join(root, 'daemon.json'), { pid: process.pid, config: { cwd: root, model: 'fallback-model' }, sessions: ['owned'] });
  let stops = 0;
  const stop = async () => { stops++; return { stopped: true, settled: true, clean: false }; };
  assert.equal((await cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop })).settled, true);
  await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'foreign', stop }), { code: 'session_identity_mismatch' });
  assert.equal(stops, 1);
  await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: async () => { throw Object.assign(new Error('offline'), { code: 'daemon_not_running' }); } }), { code: 'cancellation_unconfirmed' });
});
