import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { cancelOwnedDaemon } from '../lib/daemon-control.mjs';
import { writeJsonAtomic } from '../lib/runner-events.mjs';

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
