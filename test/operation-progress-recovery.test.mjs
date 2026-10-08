import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonAtomic } from '../lib/runner-events.mjs';
import { recoverDriverReply, reconcileDriverReplies } from '../lib/driver-recovery.mjs';
import { inspectDaemonOperation } from '../lib/daemon-operations.mjs';
import { commandJson } from '../lib/process-json.mjs';
import { pathToFileURL } from 'node:url';
import { ObservationClock } from '../lib/observation-clock.mjs';

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

test('retained native success does not authorize work before settlement', async t => {
  const { root, id, directory } = await fixture(t);
  await writeJsonAtomic(path.join(directory, 'result.json'), { state: 'completed', result: { session_id: 'native' } });
  await assert.rejects(reconcileDriverReplies(root), { code: 'operation_observation_lost' });
  await assert.rejects(recoverDriverReply(root, id, { timeoutMs: 5, pollMs: 1 }), error => error.code === 'operation_observation_lost' && error.details.native_outcome.session_id === 'native');
  await writeJsonAtomic(path.join(directory, 'settlement.json'), { state: 'settled' });
  assert.deepEqual(await recoverDriverReply(root, id, { timeoutMs: 5, pollMs: 1 }), { session_id: 'native' });
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
