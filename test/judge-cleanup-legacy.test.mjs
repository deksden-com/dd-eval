import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { loadNativeContracts } from '../lib/capacity-policy.mjs';
import { assertJudgeCleanup, assertJudgeCleanupCurrent, finishJudgeCleanup } from '../lib/judge-cleanup.mjs';

async function historicalJudge(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'judge-legacy-shutdown-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const verdict = { profile_id: 'offline', session_id: 'session', result: { valid: true } };
  await settledJudge(root, verdict);
  const stateFile = path.join(root, 'daemon/daemon.json');
  const state = JSON.parse(await readFile(stateFile));
  const runtime = state.config.ddFlowHome, engine = path.join(runtime, 'engines/test');
  const nativeFile = path.join(engine, 'dist/harness-runtime/lib/native-children.mjs');
  await writeFile(nativeFile, "export const NATIVE_CHILD_CONTRACT_VERSION='native-children@1';export const normalizeNativeChildren=()=>[];");
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  state.shutdown = { schema_id: 'dd-flow/daemon-shutdown@1', daemon_id: state.daemon_id, generation: 1,
    tree_observed_at: new Date().toISOString(), result: { clean: true },
    required_phases: ['tree', 'provider', 'provider_resource', 'daemon_resource'],
    phases: { tree: true, provider: true, provider_resource: true, daemon_resource: true } };
  await writeFile(stateFile, JSON.stringify(state));
  const cleanup = JSON.parse(await readFile(path.join(root, 'cleanup.json')));
  const operationFile = path.join(root, 'daemon/operations', createHash('sha256').update(cleanup.stop_operation_id).digest('hex'), 'result.json');
  const operation = { state: 'completed', result: { stopped: true, clean: true, settled: true, shutdown_contract: 'dd-flow/daemon-shutdown@1' } };
  await writeFile(operationFile, JSON.stringify(operation));
  return { root, verdict, runtime, state, stateFile, operation, operationFile, nativeFile };
}

test('retained @1 Judge evidence stays readable without granting new native dispatch or changing history', async t => {
  const f = await historicalJudge(t);
  await assert.rejects(loadNativeContracts(f.runtime, { requireTreeSettlement: true }), { code: 'native_contract_unsupported' });
  const files = ['result.json', 'cleanup.json', 'daemon/daemon.json', 'daemon/operation-fence.json'].map(name => path.join(f.root, name));
  const before = await Promise.all(files.map(file => readFile(file)));
  const reference = await assertJudgeCleanup(f.root, f.verdict);
  assert.equal(assertJudgeCleanupCurrent(reference), true);
  await finishJudgeCleanup({ root: f.root, profileId: f.verdict.profile_id, stop: () => assert.fail('never replay a historical stop or model Turn') });
  assert.deepEqual(await Promise.all(files.map(file => readFile(file))), before);
});

test('historical reader rejects incomplete, foreign, mismatched and unhashed shutdown evidence', async t => {
  const f = await historicalJudge(t);
  const variants = [
    { ...f.state, active_tree: true },
    { ...f.state, shutdown: { ...f.state.shutdown, schema_id: 'dd-flow/daemon-shutdown@unknown' } },
    { ...f.state, shutdown: { ...f.state.shutdown, daemon_id: 'foreign' } },
    { ...f.state, shutdown: { ...f.state.shutdown, generation: 2 } },
    { ...f.state, shutdown: { ...f.state.shutdown, tree_observed_at: 'unknown' } },
    { ...f.state, shutdown: { ...f.state.shutdown, result: { clean: false } } },
    { ...f.state, shutdown: { ...f.state.shutdown, result: { clean: true, native_settled: false } } },
    { ...f.state, shutdown: { ...f.state.shutdown, result: { clean: true, native_settlement: { confirmed: false } } } },
    { ...f.state, unclaimed_activity: true },
    { ...f.state, provider_process: { id: 'provider' }, shutdown: { ...f.state.shutdown, required_phases: ['tree', 'provider', 'daemon_resource'] } },
    { ...f.state, shutdown: { ...f.state.shutdown, phases: { ...f.state.shutdown.phases, provider_resource: false } } },
    { ...f.state, shutdown: { ...f.state.shutdown, required_phases: ['provider', 'daemon_resource'] } },
    { ...f.state, shutdown: { ...f.state.shutdown, required_phases: [...f.state.shutdown.required_phases, 'tree'] } },
    { ...f.state, pid: process.pid, stopped_at: new Date(Date.now() + 60_000).toISOString() }
  ];
  for (const state of variants) {
    await writeFile(f.stateFile, JSON.stringify(state));
    await assert.rejects(assertJudgeCleanup(f.root, f.verdict), { code: 'judge_cleanup_unconfirmed' });
  }
  await writeFile(f.stateFile, JSON.stringify(f.state));
  await writeFile(f.operationFile, JSON.stringify({ ...f.operation, result: { ...f.operation.result, shutdown_contract: 'dd-flow/daemon-shutdown@2' } }));
  await assert.rejects(assertJudgeCleanup(f.root, f.verdict), { code: 'judge_cleanup_unconfirmed' });
  await writeFile(f.operationFile, JSON.stringify(f.operation));
  await writeFile(f.nativeFile, 'unhashed replacement');
  await assert.rejects(assertJudgeCleanup(f.root, f.verdict), { code: 'judge_cleanup_unconfirmed' });
});
