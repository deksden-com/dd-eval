import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { ObservationClock } from '../lib/observation-clock.mjs';
import { Runtime as GrokRuntime } from '../lib/dd-grok-daemon.mjs';
import { Runtime as OpenCodeRuntime } from '../lib/dd-opencode-daemon.mjs';
import { DaemonRuntime as ZCodeRuntime } from '../lib/dd-zcode-daemon.mjs';

test('late observation honors native activity time and productive reservations survive disk failure', async () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 200, wall: () => time, monotonic: () => time });
  time = 150; assert.equal(clock.sample('activity', 100), false);
  time = 299; assert.equal(clock.sample('activity', 100), false);
  time = 300; assert.equal(clock.sample('activity', 100), true);
  for (const type of [GrokRuntime, OpenCodeRuntime, ZCodeRuntime]) {
    const value = Object.create(type.prototype);
    value.sessions = new Map(); value.active = null; value.activeProductive = null;
    value.persist = async () => { throw new Error('disk failure'); };
    let dispatched = false;
    await assert.rejects(value.productive('session.prompt', async () => { dispatched = true; }), /disk failure/);
    assert.equal(dispatched, false); assert.equal(value.active, null); assert.equal(value.activeProductive, null);
  }
});
import { Runtime } from '../lib/dd-agy-daemon.mjs';

function runtime() {
  const value = new Runtime({ state: '/unused' }, { config: { daemonId: 'test', cwd: '/tmp' } });
  value.init = { conversation_id: 'root' };
  value.persist = async () => {};
  value.journal = async () => {};
  value.start = async () => {};
  value.draining = Promise.resolve();
  return value;
}

test('idle child notifications preserve failure and new activity invalidates settlement', async () => {
  const r = runtime();
  for (const status of ['failed', 'cancelled', 'unknown']) {
    r.descendants.set('child', { provider_session_id: 'child', status });
    await r.observeHook('Stop', { conversationId: 'child', fullyIdle: true, terminationReason: 'error' });
    assert.equal(r.descendants.get('child').status, status);
    assert.equal(r.descendants.get('child').tree_settled, true);
  }
  r.lastResult = { status: 'SUCCESS' };
  assert.equal(r.receipt().settled, true);
  r.observeStep({ conversation_id: 'child', step_index: 10, state: 'RUNNING' });
  assert.equal(r.receipt().settled, false);
  await r.observeHook('Stop', { conversationId: 'child', fullyIdle: true });
  r.observeStep({ conversation_id: 'child', step_index: 10, state: 'RUNNING' });
  assert.equal(r.receipt().settled, true, 'duplicate step is not new activity');
  await r.observeHook('PreToolUse', { conversationId: 'child', stepIdx: 11 });
  assert.equal(r.receipt().settled, false);
  await r.observeHook('Stop', { conversationId: 'child', stepIdx: 10, fullyIdle: true });
  assert.equal(r.receipt().settled, false, 'a delayed old Stop cannot settle new child activity');
});

test('prompt reserves before persistence and releases reservation on persistence failure', async () => {
  const r = runtime(), writes = [];
  let release;
  r.persist = () => new Promise(resolve => { release = resolve; });
  r.child = { stdin: { write: value => writes.push(value) } };
  const first = r.prompt('one', () => {});
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(r.prompt('two', () => {}), { code: 'operation_in_progress' });
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  r.active.resolve({ settled: true }); r.active = null;
  await first;
  r.persist = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(r.prompt('three', () => {}), /disk unavailable/);
  assert.equal(r.active, null);
  assert.equal(writes.length, 1);
});
