import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonAtomic } from '../lib/runner-events.mjs';
import { recoverDriverReply, reconcileDriverReplies } from '../lib/driver-recovery.mjs';
import { inspectDaemonOperation, daemonOperationReady } from '../lib/daemon-operations.mjs';
import { commandJson } from '../lib/process-json.mjs';
import { pathToFileURL } from 'node:url';
import { ObservationClock } from '../lib/observation-clock.mjs';
import { callDriver } from '../lib/runner.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-operation-progress-'));
  const timers = [];
  t.after(async () => { for (const stop of timers) await stop(); await rm(root, { recursive: true, force: true }); });
  const id = 'original', digest = createHash('sha256').update(id).digest('hex');
  const directory = path.join(root, 'operations', digest);
  const requested = { operation_id: id, daemon_id: 'daemon', operation: 'session.create', params_sha256: 'params', owner_id: 'owner', generation: 1, requested_at: new Date().toISOString() };
  await writeJsonAtomic(path.join(directory, 'requested.json'), requested);
  await writeJsonAtomic(path.join(root, 'client-operations', `${digest}.json`), { operation_id: id, state: 'requested' });
  return { root, id, directory, requested, timers };
}

function publishProgress(directory, requested, timers, published = () => {}) {
  let sequence = 0, pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      const value = { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: ++sequence, phase: 'native_progress', observed_at: new Date().toISOString() };
      await writeJsonAtomic(path.join(directory, 'progress.json'), value);
      published(value);
    });
  }, 20);
  const stop = async () => { clearInterval(timer); await pending; };
  timers.push(stop);
  return stop;
}

async function driverFixture(t) {
  const retained = await fixture(t);
  await rm(path.join(retained.root, 'client-operations', `${createHash('sha256').update(retained.id).digest('hex')}.json`));
  return retained;
}

test('retained native success does not authorize work before settlement', async t => {
  const { root, id, directory } = await fixture(t);
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'native' } });
  await assert.rejects(reconcileDriverReplies(root), { code: 'operation_observation_lost' });
  await assert.rejects(recoverDriverReply(root, id, { timeoutMs: 5, pollMs: 1 }), error => error.code === 'operation_observation_lost' && error.details.native_outcome.session_id === 'native');
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  assert.deepEqual(await recoverDriverReply(root, id, { timeoutMs: 5, pollMs: 1 }), { session_id: 'native' });
});

test('historical unowned minimal receipts remain readable but owned and modern records require settlement', async t => {
  const { root, id, directory } = await fixture(t);
  await writeJsonAtomic(path.join(directory, 'requested.json'), { operation_id: id, operation: 'session.prompt', session_id: 'native' });
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'native' } });
  assert.deepEqual(await recoverDriverReply(root, id), { session_id: 'native' });
  for (const binding of [{ owner_id: 'owner' }, { generation: 0 }, { params_sha256: 'a'.repeat(64) }, { params_sha256: '' }]) {
    assert.equal(daemonOperationReady({ state: 'completed', operation: 'session.prompt', ...binding }), false);
  }
});

for (const replay of [false, true]) test(`an exhausted outer episode cannot receive a fresh uncertainty window (same-time replay: ${replay})`, async t => {
  const { root, id, directory, requested } = await fixture(t);
  let wall = Date.now(), mono = 0;
  const clockOptions = { wall: () => wall, monotonic: () => mono };
  const clock = new ObservationClock({ timeoutMs: 500, ...clockOptions });
  clock.sample('daemon:5', wall);
  if (replay) await writeJsonAtomic(path.join(directory, 'progress.json'), { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 6, phase: 'native_progress', observed_at: new Date(wall).toISOString() });
  wall += 500; mono += 500; clock.sample('daemon:5');
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', observation_clock: clock.state(), observation_progress_sequence: 5 });
  let reads = 0;
  await assert.rejects(recoverDriverReply(root, id, { pollMs: 1, clockOptions, nativeContracts: {
    readOperationWaiting: async () => { assert.equal(++reads, 1, 'an exhausted episode cannot start another polling window'); return false; }
  } }), { code: 'operation_observation_lost' });
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'late-exact' } });
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  assert.deepEqual(await recoverDriverReply(root, id, { clockOptions }), { session_id: 'late-exact' }, 'exact late outcome still wins over expired observation');
});

test('new timestamped progress may renew an exhausted quiet episode without replaying native work', async t => {
  const { root, id, directory, requested } = await fixture(t);
  const wall = Date.now(), clockOptions = { wall: () => wall, monotonic: () => 0 };
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', observation_progress_sequence: 5,
    observation_clock: { policy: 'operation-progress@1', timeout_ms: 500, started_at: wall - 2000, cursor: 'daemon:5', observed_at: wall - 1000,
      elapsed_ms: 500, uncertainty_elapsed_ms: 0, gaps: 0, observation_lost: false } });
  await writeJsonAtomic(path.join(directory, 'progress.json'), { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 6, phase: 'native_progress', observed_at: new Date(wall).toISOString() });
  let reads = 0;
  assert.deepEqual(await recoverDriverReply(root, id, { clockOptions, pollMs: 1, nativeContracts: {
    readOperationWaiting: async () => {
      if (++reads === 2) {
        await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'original' } });
        await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
      }
      return false;
    }
  } }), { session_id: 'original' });
  assert.equal(reads, 2);
});

test('cancellation during asynchronous outcome authority read wins over retained success', async t => {
  const { root, id, directory } = await fixture(t);
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'native' } });
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  const abort = new AbortController(), reason = new Error('cancelled during authority read');
  await assert.rejects(recoverDriverReply(root, id, { signal: abort.signal, nativeContracts: {
    retainedDaemonReply: async () => { abort.abort(reason); return { ready: true }; }
  } }), error => error === reason);
});

test('outer observation retains its high-water despite a newer-timestamped rollback', async t => {
  const { root, id, directory, requested } = await driverFixture(t);
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  const executable = path.join(root, 'harness-runtime/bin/dd-droid.mjs');
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, `import {writeJsonAtomic} from ${JSON.stringify(new URL('../lib/runner-events.mjs', import.meta.url).href)};
import {readFile} from 'node:fs/promises';
const directory=${JSON.stringify(directory)},requested=${JSON.stringify(requested)};
await writeJsonAtomic(directory+'/progress.json',{...requested,schema_id:'dd-flow/operation-progress@1',sequence:5,phase:'native_progress',observed_at:new Date().toISOString()});
for(;;){if(JSON.parse(await readFile(${JSON.stringify(clientFile)})).observation_progress_sequence===5)break;await new Promise(resolve=>setTimeout(resolve,50));}let sequence=4;
for(;;){await writeJsonAtomic(directory+'/progress.json',{...requested,schema_id:'dd-flow/operation-progress@1',sequence:sequence===4?sequence--:sequence++,phase:'native_progress',observed_at:new Date().toISOString()});await new Promise(resolve=>setTimeout(resolve,100));}`);
  const abort = new AbortController();
  const invocation = callDriver({ harness: 'droid-cli' }, ['session', 'create', '--state-dir', root], {
    cwd: root, env: { DD_FLOW_CONFIG_HOME: root }, operationId: id, signal: abort.signal, timeoutMs: 30000
  });
  invocation.catch(() => {});
  t.after(() => abort.abort());
  let client;
  const deadline = performance.now() + 30000;
  try {
    for (;;) {
      try { client = JSON.parse(await readFile(clientFile)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (client?.observation_progress_sequence === 5 && client.observation_clock.elapsed_ms >= 500) break;
      assert.ok(performance.now() < deadline, 'outer observer did not retain both meaningful and rolled-back samples');
      await new Promise(resolve => setTimeout(resolve,50));
    }
  } finally { abort.abort(); }
  await assert.rejects(invocation, { name: 'AbortError' });
  assert.equal(client.observation_progress_sequence, 5);
  assert.equal(client.observation_clock.cursor, 'daemon:5');
});

test('recovery carries the persisted outer quiet window instead of a fresh grant', async t => {
  const { root, id } = await fixture(t);
  let wall = Date.now(), mono = 0;
  const clockOptions = { wall: () => wall, monotonic: () => mono };
  const clock = new ObservationClock({ timeoutMs: 3000, ...clockOptions });
  clock.sample('daemon:5', wall);
  wall += 1500; mono += 1500; clock.sample('daemon:5');
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', observation_clock: clock.state() });
  const reason = new Error('do not wait in this deterministic restoration check');
  await assert.rejects(recoverDriverReply(root, id, { signal: AbortSignal.abort(reason), clockOptions }), error => error === reason);
  const client = JSON.parse(await readFile(clientFile));
  assert.equal(client.recovery_observation_clock.timeout_ms, 3000);
  assert.equal(client.recovery_observation_clock.elapsed_ms, 1500);
  assert.equal(client.recovery_observation_clock.cursor, 'daemon:5');
});

test('outer observation freezes caller incarnation before its first progress read', async t => {
  const { root, id, directory, requested } = await driverFixture(t);
  await writeJsonAtomic(path.join(root, 'daemon.json'), { daemon_id: 'expected' });
  await writeJsonAtomic(path.join(directory, 'progress.json'), { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 1, phase: 'native_progress', observed_at: new Date().toISOString() });
  const executable = path.join(root, 'harness-runtime/bin/dd-droid.mjs');
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, 'setInterval(()=>{},1000);');
  await assert.rejects(callDriver({ harness: 'droid-cli' }, ['session', 'create', '--state-dir', root], {
    cwd: root, env: { DD_FLOW_CONFIG_HOME: root }, operationId: id, timeoutMs: 1000
  }), { code: 'operation_binding_conflict' });
  const client = JSON.parse(await readFile(path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`)));
  assert.equal(client.daemon_binding, undefined);
});

test('failed recovery cannot downgrade selected authority to historical readiness', async t => {
  const { root, id, directory } = await driverFixture(t);
  const executable = path.join(root, 'harness-runtime/bin/dd-droid.mjs');
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, `import {writeJsonAtomic} from ${JSON.stringify(new URL('../lib/runner-events.mjs', import.meta.url).href)};
await writeJsonAtomic(${JSON.stringify(path.join(directory, 'result.json'))},{state:'completed',result:{session_id:'native'}});
await writeJsonAtomic(${JSON.stringify(path.join(directory, 'settlement.json'))},{state:'settled'});
console.log('lost native reply');`);
  await assert.rejects(callDriver({ harness: 'droid-cli' }, ['session', 'create', '--state-dir', root], {
    cwd: root, env: { DD_FLOW_CONFIG_HOME: root }, operationId: id,
    nativeContracts: { retainedDaemonReply: async () => { throw Object.assign(new Error('fenced'), { code: 'operation_cancelled' }); } }
  }), error => error.code === 'operation_cancelled' && error.details.observation_error.code === 'harness_adapter_invalid');
  const client = JSON.parse(await readFile(path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`)));
  assert.equal(client.state, 'requested');
});

test('resume recovers its original durable reply without a second native call', async t => {
  const { root, id, directory, requested } = await driverFixture(t);
  await writeJsonAtomic(path.join(directory, 'requested.json'), { ...requested, operation: 'session.resume' });
  const executable = path.join(root, 'harness-runtime/bin/dd-droid.mjs'), calls = path.join(root, 'calls');
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, `import {writeJsonAtomic} from ${JSON.stringify(new URL('../lib/runner-events.mjs', import.meta.url).href)};
import {appendFile} from 'node:fs/promises';await appendFile(${JSON.stringify(calls)},process.env.DD_EVAL_OPERATION_ID+'\\n');
await writeJsonAtomic(${JSON.stringify(path.join(directory, 'result.json'))},{state:'completed',result:{provider_session_id:'native',resumed:true}});
await writeJsonAtomic(${JSON.stringify(path.join(directory, 'settlement.json'))},{state:'settled'});console.log('lost reply');`);
  assert.deepEqual(await callDriver({ harness: 'droid-cli' }, ['session', 'resume', '--session-id', 'native', '--state-dir', root], {
    cwd: root, env: { DD_FLOW_CONFIG_HOME: root }, operationId: id
  }), { provider_session_id: 'native', resumed: true });
  assert.equal(await readFile(calls, 'utf8'), `${id}\n`);
});

test('ledger reconciliation cannot import a result from another caller incarnation', async t => {
  const { root, id, directory } = await fixture(t);
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', expected_daemon_id: 'foreign-daemon' });
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'native' } });
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  await assert.rejects(reconcileDriverReplies(root), { code: 'operation_binding_conflict' });
  assert.equal(JSON.parse(await readFile(clientFile, 'utf8')).state, 'requested');
});

test('new operation progress extends recovery until exact outcome and settlement', async t => {
  const { root, id, directory, requested, timers } = await fixture(t);
  let wall = Date.now(), mono = 0;
  const stop = publishProgress(directory, requested, timers, value => { wall = Date.parse(value.observed_at); mono += 200; });
  const result = recoverDriverReply(root, id, { timeoutMs: 500, pollMs: 10, clockOptions: { wall: () => wall, monotonic: () => mono } });
  result.catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 800));
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'once' } });
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'not_required' });
  assert.deepEqual(await result, { session_id: 'once' });
  assert.ok(mono > 500, 'observed progress outlives the quiet window');
  await stop();
});

test('foreign and future progress fail closed instead of granting time', async t => {
  const { root, id, directory, requested } = await fixture(t);
  const progress = { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 1, phase: 'native_progress', observed_at: new Date().toISOString() };
  for (const change of [{ daemon_id: 'foreign' }, { observed_at: new Date(Date.now() + 10000).toISOString() }, { sequence: 0 }]) {
    await writeJsonAtomic(path.join(directory, 'progress.json'), { ...progress, ...change });
    await assert.rejects(inspectDaemonOperation(root, id), { code: 'operation_progress_invalid' });
  }
});

test('recovery restart cannot treat decreasing durable sequence as fresh progress', async t => {
  const { root, id, directory, requested } = await fixture(t);
  const clock = new ObservationClock({ timeoutMs: 500 });
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', recovery_observation_clock: { ...clock.state(), cursor: 'daemon:5', observed_at: Date.now() } });
  await writeJsonAtomic(path.join(directory, 'progress.json'), { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 3, phase: 'native_progress', observed_at: new Date().toISOString() });
  await assert.rejects(recoverDriverReply(root, id, { timeoutMs: 500, pollMs: 10, signal: AbortSignal.timeout(200) }));
  const client = JSON.parse(await readFile(clientFile, 'utf8'));
  assert.equal(client.recovery_progress_sequence, 5);
  assert.equal(client.recovery_observation_clock.cursor, 'daemon:5');
});

test('outer high-water survives recovery even when its event was too old to advance the clock', async t => {
  const { root, id, directory, requested } = await fixture(t);
  const clock = new ObservationClock({ timeoutMs: 500 });
  const clientFile = path.join(root, 'client-operations', `${createHash('sha256').update(id).digest('hex')}.json`);
  await writeJsonAtomic(clientFile, { operation_id: id, state: 'requested', observation_progress_sequence: 5, observation_clock: clock.state() });
  await writeJsonAtomic(path.join(directory, 'progress.json'), { ...requested, schema_id: 'dd-flow/operation-progress@1', sequence: 3, phase: 'native_progress', observed_at: new Date().toISOString() });
  await assert.rejects(recoverDriverReply(root, id, { pollMs: 10, signal: AbortSignal.timeout(200) }));
  const client = JSON.parse(await readFile(clientFile));
  assert.equal(client.recovery_progress_sequence, 5);
});

test('outer CLI observes correlated progress rather than output keepalives', async t => {
  // The bounded durable reader is exercised above; isolate outer subprocess
  // observation from host fsync scheduling without manufacturing poll activity.
  let snapshot, sequence = 0;
  const timer = setInterval(() => { snapshot = { cursor: ++sequence, observed_at: Date.now() }; }, 20);
  t.after(() => clearInterval(timer));
  const result = await commandJson(process.execPath, ['-e', 'setTimeout(()=>console.log(JSON.stringify({session_id:"once"})),1800)', '--'], {
    timeoutMs: 1000,
    operationProgress: () => snapshot
  });
  assert.deepEqual(result, { session_id: 'once' });
});

test('authoritative runtime capacity waiting suspends recovery, expired or dead owner does not', { skip: !process.env.DD_FLOW_SOURCE_ROOT && 'set DD_FLOW_SOURCE_ROOT for selected runtime proof' }, async t => {
  const { root, id, directory, requested } = await fixture(t);
  const nativeContracts = { ...await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'dist/harness-runtime/lib/operation-progress.mjs')).href), ...await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'dist/harness-runtime/lib/daemon-observation.mjs')).href) };
  await writeJsonAtomic(path.join(root, 'daemon.json'), { daemon_id: 'daemon', pid: process.pid, resource_process: { id: 'resource-process' }, config: { runtime_owner: { owner_id: 'owner' } } });
  const waiting = { ...requested, schema_id: 'dd-flow/operation-waiting@1', state: 'provider_capacity', observed_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 20000).toISOString(), process_id: 'resource-process' };
  await writeJsonAtomic(path.join(directory, 'admission-wait.json'), waiting);
  assert.equal(await nativeContracts.readOperationWaiting(root, id), true);
  const result = recoverDriverReply(root, id, { timeoutMs: 150, pollMs: 10, nativeContracts });
  await new Promise(resolve => setTimeout(resolve, 400));
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'once' } });
  assert.deepEqual(await result, { session_id: 'once' });
  await writeJsonAtomic(path.join(directory, 'admission-wait.json'), { ...waiting, lease_expires_at: new Date(Date.now() - 1).toISOString() });
  assert.equal(await nativeContracts.readOperationWaiting(root, id), false);
  await writeJsonAtomic(path.join(directory, 'admission-wait.json'), waiting);
  await writeJsonAtomic(path.join(root, 'daemon.json'), { daemon_id: 'daemon', pid: 2147483647, resource_process: { id: 'resource-process' }, config: { runtime_owner: { owner_id: 'owner' } } });
  assert.equal(await nativeContracts.readOperationWaiting(root, id), false);
  await writeJsonAtomic(path.join(root, 'operation-fence.json'), { daemon_id: 'daemon', generation: 2 });
  await assert.rejects(recoverDriverReply(root, id, { timeoutMs: 150, nativeContracts }), { code: 'operation_cancelled' });
});
