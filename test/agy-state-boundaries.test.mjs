import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate, setTimeout } from 'node:timers';
import process from 'node:process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ObservationClock } from '../lib/observation-clock.mjs';
import { Runtime as GrokRuntime } from '../lib/dd-grok-daemon.mjs';
import { Runtime as OpenCodeRuntime } from '../lib/dd-opencode-daemon.mjs';
import { DaemonRuntime as ZCodeRuntime } from '../lib/dd-zcode-daemon.mjs';
import { settledCodexSession } from '../lib/dd-codex-daemon.mjs';

test('Codex fallback keeps bundled terminal system-error settlement semantics', () => {
  assert.equal(settledCodexSession('systemError', { status: 'failed' }, false), true);
  assert.equal(settledCodexSession('systemError', { status: 'failed' }, true), false);
  assert.equal(settledCodexSession('systemError', null, false), false);
  assert.equal(settledCodexSession('systemError', { status: 'inProgress' }, false), false);
});

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
import { Runtime, prepare, retainedAgyState, startDaemon, stopDaemon, callDaemon } from '../lib/dd-agy-daemon.mjs';

test('provider exit finalization cannot overwrite an acknowledged clean stop', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agy-exit-stop-'));
  const fake = path.join(root, 'provider.mjs');
  await writeFile(fake, `console.log(JSON.stringify({event:'init',conversation_id:'root',init:{model:'gemini-3.1-pro-high',permission_mode:'always-proceed'}})); process.stdin.once('data',()=>process.exit(17));`);
  const r = new Runtime({ dir: root, state: path.join(root, 'daemon.json'), gemini: root }, { config: { daemonId: 'exit-test', cwd: root, bin: fake, model: 'gemini-3.1-pro-high', reasoning: 'high', mode: 'accept-edits', noFlow: true } });
  r.journal = async () => {};
  const persist = r.persist.bind(r);
  let release, entered;
  const pending = new Promise(resolve => { release = resolve; });
  const finalizing = new Promise(resolve => { entered = resolve; });
  r.persist = async patch => {
    if (patch?.provider_exit) { entered(); await pending; }
    return persist(patch);
  };
  let stopped = false, closing;
  try {
    await r.start();
    await assert.rejects(r.prompt('exit', () => {}), { code: 'agy_terminal_result_missing' });
    await finalizing;
    closing = r.close(true).then(async () => { stopped = true; await r.persist({ shutdown_state: 'clean', active_tree: false }); });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false, 'clean stop must wait for provider finalization');
    release();
    await closing;
    assert.equal(r.state.shutdown_state, 'clean');
    assert.equal(r.state.active_tree, false);
    assert.equal(r.state.provider_exit.code, 17);
  } finally {
    release();
    await closing;
    await r.abortProvider('test_cleanup');
    await r.persisting;
    await rm(root, { recursive: true, force: true });
  }
});

test('provider finalization failures block stop, cancellation, abort and replacement', async () => {
  for (const operation of [r => r.cancel(), r => r.close(true), r => r.close(false), r => r.abortProvider('test'), r => r.start()]) {
    const r = new Runtime({ state: '/unused' }, { config: {}, active_tree: false });
    const error = new Error('provider group settlement failed');
    r.child = {};
    r.exited = true;
    r.providerFinalization = Promise.reject(error);
    void r.providerFinalization.catch(() => {});
    r.persist = async () => assert.fail('failed finalization must not publish clean state');
    await assert.rejects(operation(r), failure => failure === error);
  }
});

test('clean cancellation and same-session restart preserve failure and admit only fresh work', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agy-restart-'));
  const stateDir = path.join(root, 'state'), fake = path.join(root, 'provider.mjs'), input = path.join(root, 'input.jsonl');
  const options = { stateDir, cwd: root, bin: fake, noFlow: true, entryPath: path.resolve('bin/dd-agy.mjs') };
  await writeFile(fake, `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('1'); process.exit(0); }
const emit = value => console.log(JSON.stringify(value));
emit({event:'init',conversation_id:'root',init:{model:'gemini-3.1-pro-high',permission_mode:'always-proceed'}});
if (args.includes('--conversation')) emit({event:'result',result:{conversation_id:'root',status:'ERROR',error:'injected failure'}});
process.stdin.setEncoding('utf8'); let buffer='';
process.stdin.on('data', chunk => { buffer+=chunk; let at;
  while ((at=buffer.indexOf('\\n'))>=0) {
    const message=JSON.parse(buffer.slice(0,at)); buffer=buffer.slice(at+1);
    const text=message.message.content; appendFileSync(${JSON.stringify(input)},JSON.stringify(text)+'\\n');
    if (text==='interrupt') {
      emit({event:'step_update',step_update:{conversation_id:'root',step_index:1,subagent_info:{subagents:[{conversation_id:'child'}]}}});
      emit({event:'result',result:{conversation_id:'root',status:'ERROR',error:'injected failure'}});
    } else emit({event:'result',result:{conversation_id:'root',status:'SUCCESS',response:text}});
  }
});
`);
  try {
    await startDaemon(options);
    await callDaemon(stateDir, 'session.prompt', { sessionId: 'root', prompt: 'warmup' });
    await assert.rejects(callDaemon(stateDir, 'session.prompt', { sessionId: 'root', prompt: 'interrupt' }), { code: 'agy_provider_failed' });
    await callDaemon(stateDir, 'hook.observe', { event: 'PreToolUse', payload: { conversationId: 'child', stepIdx: 1 } });
    await callDaemon(stateDir, 'hook.observe', { event: 'Stop', payload: { conversationId: 'root', fullyIdle: false } });
    await assert.rejects(stopDaemon({ stateDir }), { code: 'tree_not_settled' });
    await stopDaemon({ stateDir, cancelTree: true });
    const stopped = JSON.parse(await readFile(path.join(stateDir, 'daemon.json'), 'utf8'));
    assert.equal(stopped.shutdown_state, 'clean');
    assert.equal(stopped.descendants[0].tree_settled, false);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try { process.kill(stopped.pid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await startDaemon({ ...options, sessionId: 'root' });
    const inspected = await callDaemon(stateDir, 'session.inspect', { sessionId: 'root' });
    assert.equal(inspected.result.error, 'injected failure');
    assert.equal(inspected.descendants[0].status, 'unknown');
    assert.equal(inspected.descendants[0].tree_settled, true);
    assert.equal((await callDaemon(stateDir, 'session.prompt', { sessionId: 'root', prompt: 'ack' })).assistant_text, 'ack');
    await callDaemon(stateDir, 'hook.observe', { event: 'PreToolUse', payload: { conversationId: 'child', stepIdx: 2 } });
    await assert.rejects(callDaemon(stateDir, 'session.prompt', { sessionId: 'root', prompt: 'blocked' }), { code: 'tree_not_settled' });
    assert.deepEqual((await readFile(input, 'utf8')).trim().split('\n').map(JSON.parse), ['warmup', 'interrupt', 'ack']);
    assert.deepEqual(JSON.parse(await readFile(path.join(stateDir, 'daemon-history', stopped.daemon_id + '.json'), 'utf8')), stopped);
  } finally {
    try { await stopDaemon({ stateDir, cancelTree: true }); } catch { /* retain the original test failure */ }
    await rm(root, { recursive: true, force: true });
  }
});

test('no-flow probes retain native Stop observation without workspace or flow hooks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agy-observer-'));
  try {
    const paths = { dir: root, gemini: path.join(root, 'gemini'), runtime: path.join(root, 'runtime'), config: path.join(root, 'config'), temporary: path.join(root, 'temporary') };
    await prepare(paths, { noFlow: true, entryPath: '/test/dd-agy.mjs', projectRoot: root });
    const hooks = JSON.parse(await readFile(path.join(paths.config, 'hooks.json'), 'utf8'));
    const observer = hooks['dd-flow-observer'];
    assert.deepEqual(Object.keys(observer), ['Stop']);
    assert.match(observer.Stop[0].command, /hook handle --event Stop/);
    assert.doesNotMatch(observer.Stop[0].command, /--dd-flow-bin|--dd-flow-home/);
    await assert.rejects(stat(path.join(root, '.agents')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

function runtime() {
  const value = new Runtime({ state: '/unused' }, { config: { daemonId: 'test', cwd: '/tmp' } });
  value.init = { conversation_id: 'root' };
  value.persist = async () => {};
  value.journal = async () => {};
  value.start = async () => {};
  value.draining = Promise.resolve();
  return value;
}

test('verified daemon retirement scopes old tree flags without changing native outcomes', async () => {
  const previous = {
    daemon_id: 'retired', shutdown_state: 'clean', active_tree: false, turn_generation: 4,
    sessions: [{ provider_session_id: 'root' }], last_result: { status: 'ERROR', error: 'original failure' },
    session_observations: [['root', { last_step_index: 10, stop: { fullyIdle: false } }]],
    descendants: [{ provider_session_id: 'child', status: 'unknown', tree_settled: false, activity_generation: 4 }]
  };
  const original = JSON.parse(JSON.stringify(previous));
  const retained = retainedAgyState(previous, 'root');
  const r = runtime();
  r.state = retained;
  r.turnGeneration = retained.turn_generation;
  r.lastResult = retained.last_result;
  r.sessionObservations = new Map(retained.session_observations);
  r.descendants = new Map(retained.descendants.map(child => [child.provider_session_id, child]));
  assert.deepEqual(previous, original, 'the historical shutdown receipt stays immutable');
  assert.equal(r.descendants.get('child').status, 'unknown');
  assert.equal(r.descendants.get('child').settlement_evidence, 'prior_clean_daemon_shutdown');
  assert.equal(r.lastResult.error, 'original failure');
  assert.equal(r.receipt().settled, true);
  const writes = [];
  r.child = { stdin: { write: value => writes.push(value) } };
  const accepted = r.prompt('recovery acknowledgement', () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  await r.finishTurn({ conversation_id: 'root', status: 'SUCCESS', response: 'acknowledged' });
  assert.equal((await accepted).settled, true);
  assert.deepEqual(previous, original);
  r.observeStep({ conversation_id: 'child', step_index: 11, state: 'RUNNING' });
  await assert.rejects(r.prompt('must not overlap', () => {}), { code: 'tree_not_settled' });
  await r.observeHook('Stop', { conversationId: 'child', stepIdx: 11, fullyIdle: true });
  assert.equal(r.receipt().settled, true);
  r.observeStep({ conversation_id: 'root', step_index: 11, state: 'RUNNING' });
  await assert.rejects(r.prompt('unclaimed root activity', () => {}), { code: 'tree_not_settled' });
  const unclean = { ...previous, shutdown_state: 'running', active_tree: true };
  assert.deepEqual(retainedAgyState(unclean, 'root'), unclean);
  assert.deepEqual(retainedAgyState(previous, 'foreign'), {});
});

test('unclaimed root tool hooks invalidate restart admission', async () => {
  const r = runtime();
  r.lastResult = { status: 'SUCCESS' };
  await r.observeHook('PreToolUse', { conversationId: 'root', stepIdx: 1 });
  await assert.rejects(r.prompt('do not overlap root', () => {}), { code: 'tree_not_settled' });
});

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
