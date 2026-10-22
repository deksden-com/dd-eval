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
  const state = { pid: process.pid, daemon_id: 'daemon', config: { cwd: root }, sessions: ['owned'], active_tree: false,
    shutdown_state: 'clean', shutdown: { schema_id: 'dd-flow/daemon-shutdown@1', daemon_id: 'daemon', generation: 1, required_phases: ['tree', 'provider_close', 'daemon_resource'], phases: { tree: true, provider_close: true, daemon_resource: true }, result: { clean: true } }, stopped_at: '2020-01-01T00:00:00Z' };
  const offline = async () => { throw Object.assign(new Error('offline'), { code: 'daemon_not_running' }); };
  await writeJsonAtomic(path.join(root, 'daemon.json'), state);
  await writeJsonAtomic(path.join(root, 'operation-fence.json'), { daemon_id: 'daemon', generation: 1 });
  await assertDaemonReplaceable(root);
  assert.equal((await cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: offline })).settled, true);
  for (const patch of [{ stopped_at: undefined }, { stopped_at: 'corrupt' }, { shutdown_state: 'running' }, { active_tree: true }]) {
    await writeJsonAtomic(path.join(root, 'daemon.json'), { ...state, ...patch });
    await assert.rejects(assertDaemonReplaceable(root), { code: 'operation_observation_lost' });
    await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: offline }), { code: 'cancellation_unconfirmed' });
  }
  for (const shutdown of [{ ...state.shutdown, daemon_id: 'foreign' }, { ...state.shutdown, generation: 2 }, { ...state.shutdown, phases: { tree: false } }, { ...state.shutdown, required_phases: ['tree'] }, { ...state.shutdown, result: { clean: true, settled: false } }, { ...state.shutdown, result: { clean: true, native_settled: false } }, { ...state.shutdown, result: { clean: true, native_settlement: { confirmed: false } } }]) {
    await writeJsonAtomic(path.join(root, 'daemon.json'), { ...state, shutdown });
    await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: offline }), { code: 'cancellation_unconfirmed' });
  }
  await writeJsonAtomic(path.join(root, 'daemon.json'), state);
  for (const settled of [false, true]) {
    const receipt = await cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: async () => ({ daemon_id: 'daemon', shutdown_contract: 'dd-flow/daemon-shutdown@1', clean: true, settled }) });
    assert.equal(receipt.settled, settled, 'an explicit negative ACK cannot be overridden by clean=true');
  }
  assert.equal(process.kill(process.pid, 0), true);
});

test('cancel uses retained identity and native stop without status, start, or profile checks', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-control-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJsonAtomic(path.join(root, 'daemon.json'), { pid: process.pid, config: { cwd: root, model: 'fallback-model' }, sessions: ['owned'] });
  let stops = 0;
  const stop = async () => { stops++; return { stopped: true, settled: true, clean: false }; };
  const result = await cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop });
  assert.equal(result.settled, false);
  assert.equal(result.native_settled, false);
  assert.equal(result.physical_stopped, true);
  assert.equal(result.code, 'cancellation_unconfirmed');
  await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'foreign', stop }), { code: 'session_identity_mismatch' });
  assert.equal(stops, 1);
  await assert.rejects(cancelOwnedDaemon({ stateDir: root, projectRoot: root, sessionId: 'owned', stop: async () => { throw Object.assign(new Error('offline'), { code: 'daemon_not_running' }); } }), { code: 'cancellation_unconfirmed' });
});

test('fresh exact inspection can settle an unclean physical stop without a new provider request', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-cancel-native-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJsonAtomic(path.join(root, 'daemon.json'), { pid: process.pid, config: { cwd: root }, sessions: ['owned'], last_terminal_metadata: { operation_id: 'op' } });
  let inspections = 0;
  const nativeContracts = { nativeTreeReadiness: (receipt, binding) => {
    assert.deepEqual(binding, { sessionId: 'owned', operationId: 'op', turnId: undefined });
    return receipt.ready ? 'ready' : 'unproven';
  } };
  const input = { stateDir: root, projectRoot: root, sessionId: 'owned', nativeContracts, stop: async () => ({ stopped: true, settled: true, clean: false }) };
  assert.equal((await cancelOwnedDaemon({ ...input, inspect: async () => { inspections++; return { ready: false }; } })).settled, false);
  assert.equal((await cancelOwnedDaemon({ ...input, inspect: async () => { inspections++; return { ready: true }; } })).settled, true);
  assert.equal(inspections, 2);
  assert.equal((await cancelOwnedDaemon({ ...input, stop: async () => ({ clean: true, native_settled: false }) })).settled, false);
});
