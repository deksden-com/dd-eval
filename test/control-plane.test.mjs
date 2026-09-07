import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { waitForSettlement } from '../lib/session-settlement.mjs';

test('owned cancellation is attempted before diagnostic observation even at an expired deadline', async () => {
  const order = [];
  await assert.rejects(waitForSettlement({
    knownSessions: () => ['child', 'root'],
    cancel: async id => { order.push(`cancel:${id}`); if (id === 'child') throw new Error('child refused'); },
    observe: async () => { order.push('observe'); throw new Error('offline'); },
    timeoutMs: 0
  }), { code: 'tree_not_settled' });
  assert.deepEqual(order, ['cancel:child', 'cancel:root', 'observe']);
});
import { cancelOwnedDaemon } from '../lib/daemon-control.mjs';
import { durableDaemonDispatch } from '../lib/daemon-operations.mjs';
import { writeJsonAtomic } from '../lib/runner-events.mjs';
import { cancelSessionWithBridge as cancelZcode } from '../lib/dd-zcode.mjs';
import { cancelSessionWithBridge as cancelGrok } from '../lib/dd-grok.mjs';

test('failed observation and one failed cancellation do not strand other owned sessions', async () => {
  const calls = []; let pass = 0;
  const result = await waitForSettlement({
    knownSessions: () => ['broken', 'healthy'],
    observe: async () => { if (++pass === 1) throw new Error('diagnostic unavailable'); return { sessions: [], active: false }; },
    cancel: async id => { calls.push(id); if (id === 'broken') throw new Error('native cancel failed'); }
  });
  assert.deepEqual(calls, ['broken', 'healthy']);
  assert.equal(result.cleanup_errors.length, 2);
});

test('unavailable observation never counts as settlement', async () => {
  await assert.rejects(waitForSettlement({ knownSessions: () => [], observe: async () => { throw new Error('offline'); }, cancel: async () => {}, timeoutMs: 0 }), { code: 'tree_not_settled' });
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

test('concurrent stop requests join one cleanup even with different operation ids', async () => {
  let count = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const action = async () => { count++; await barrier; return { stopped: true, clean: true }; };
  const a = durableDaemonDispatch('/tmp/control-coalesce', { operation: 'daemon.stop', id: 'a', params: { cancelTree: true } }, action);
  const b = durableDaemonDispatch('/tmp/control-coalesce', { operation: 'daemon.stop', id: 'b', params: { cancelTree: true } }, action);
  release(); assert.deepEqual(await a, await b); assert.equal(count, 1);
});

for (const [name, cancel] of [['ZCode', cancelZcode], ['Grok', cancelGrok]]) {
  test(`${name} child cancel failure still cancels its sibling and root`, async () => {
    const calls = []; let snapshots = 0;
    const bridge = {
      notify(method) { calls.push(method); },
      async request(method, params) {
        if (method.endsWith('/resolve')) return { providerSessionId: 'root' };
        if (method.endsWith('/subagents') || method.endsWith('/list_running')) {
          return ++snapshots === 1 ? { running: [{ taskId: 'bad' }, { taskId: 'good' }], subagents: [{ sessionId: 'bad' }, { sessionId: 'good' }] } : { running: [], subagents: [] };
        }
        if (method.includes('cancelBackgroundTask') || method === '_x.ai/subagent/cancel') {
          const id = params.taskId ?? params.subagentId; calls.push(id);
          if (id === 'bad') throw new Error('child unavailable'); return { cancelled: true };
        }
        if (method.endsWith('/read')) return { projection: { status: 'idle' } };
        if (method.endsWith('/info')) return { status: 'cancelled' };
        throw new Error(`unexpected method ${method}`);
      }
    };
    const result = await cancel(bridge, { journal: '/tmp/control-test.jsonl', sessionId: 'root', liveSession: true });
    assert.deepEqual(calls, ['bad', 'good', 'session/cancel']);
    assert.equal(result.cancellations[0].cancelled, false);
    assert.equal(result.settled, true);
  });
}
