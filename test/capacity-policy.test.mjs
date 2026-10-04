import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadCapacityPolicy, loadNativeContracts } from '../lib/capacity-policy.mjs';
import { isObservationLoss } from '../lib/operation-errors.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { successfulPolicyFixture } from './fixtures/capacity-policy.mjs';
import { directNativeChildren } from '../lib/runner.mjs';

test('all-harness native contracts execute from exact installed bytes with conservative bootstrap parity', { skip: !process.env.DD_FLOW_SOURCE_ROOT && 'set DD_FLOW_SOURCE_ROOT for built runtime proof' }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-built-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, 'engines/selected');
  await mkdir(engine, { recursive: true });
  await cp(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'dist/harness-runtime'), path.join(engine, 'dist/harness-runtime'), { recursive: true });
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await symlink('engines/selected/dist/harness-runtime', path.join(root, 'harness-runtime'));
  const contracts = await loadNativeContracts(root, { requireProgress: true });
  assert.equal(contracts.native_wait_contract, 'native-operation-wait@1');
  assert.equal(contracts.nativeOperationWait('droid-cli', 'session.start'), 'native-work');
  assert.equal(contracts.nativeOperationWait('codex-desktop', 'session.start'), 'control');
  assert.equal(contracts.progress_contract, 'operation-progress@1');
  assert.equal(contracts.operation_error_contract, 'operation-errors@2');
  const preinitFailure = contracts.agyTerminalFailure({ status: 'ERROR', error: 'Individual quota reached' }, { provider_session_id: null, observed_at: '2026-10-01T16:18:41.330Z' });
  assert.deepEqual(directNativeChildren(null, null, contracts), []);
  assert.equal(preinitFailure.code, 'agy_provider_quota_exhausted');
  assert.equal(preinitFailure.details.provider_session_id, null);
  for (const code of ['rpc_timeout', 'native_timeout', 'native_outcome_unknown', 'native_backend_dead', 'native_backend_pipe_broken', 'bridge_exited', 'bridge_pipe_broken', 'daemon_timeout', 'turn_timeout', 'operation_observation_lost', 'daemon_connection_closed', 'harness_adapter_timeout', 'harness_adapter_output_limit', 'harness_adapter_invalid', 'harness_adapter_aborted', 'harness_adapter_failed', 'native_hook_failed', 'native_outcome_observation_failed', 'unknown']) assert.equal(contracts.isObservationLoss({ code }), isObservationLoss({ code }), code);
  for (const code of ['harness_adapter_timeout', 'harness_adapter_output_limit', 'harness_adapter_invalid']) assert.equal(contracts.isObservationLoss({ code }), true, code);
  for (const code of ['harness_adapter_aborted', 'harness_adapter_failed', 'native_hook_failed', 'native_outcome_observation_failed']) assert.equal(contracts.isObservationLoss({ code }), false, code);
  assert.equal(contracts.normalizeNativeChildren({ descendants: [{ session_id: 'child', parent_session_id: 'root', status: 'idle' }] }, 'root')[0].status, 'unknown');
  assert.equal(contracts.agyTerminalFailure({ status: 'ERROR', error: 'Individual quota reached' }).code, 'agy_provider_quota_exhausted');
  await writeFile(path.join(root, 'harness-runtime/lib/native-children.mjs'), '// tampered');
  await assert.rejects(loadNativeContracts(root), { code: 'native_contract_unsupported' });
  await writeFile(path.join(root, 'harness-runtime/lib/native-children.mjs'), "export const NATIVE_CHILD_CONTRACT_VERSION='native-children@0'; export function normalizeNativeChildren(){return []}");
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await assert.rejects(loadNativeContracts(root), { code: 'native_contract_unsupported' });
  await writeFile(path.join(root, 'harness-runtime/lib/native-children.mjs'), "export const NATIVE_CHILD_CONTRACT_VERSION='native-children@1';");
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await assert.rejects(loadNativeContracts(root), { code: 'native_contract_unsupported' });
  await assert.rejects(loadNativeContracts(path.join(root, 'missing')), { code: 'native_contract_unsupported' });
});

test('capacity policy is per-owner, verified from the pinned engine, with no ambient fallback', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const homes = [];
  for (const name of ['one', 'two']) {
    const home = path.join(root, name), engine = path.join(home, 'engines/pinned');
    const adapters = path.join(engine, 'dist/harness-runtime');
    await mkdir(path.join(adapters, 'lib'), { recursive: true });
    await writeFile(path.join(adapters, 'lib/codex-capacity-policy.mjs'), successfulPolicyFixture + `export const owner = '${name}';`);
    await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
    await symlink('engines/pinned/dist/harness-runtime', path.join(home, 'harness-runtime'));
    homes.push(home);
  }
  const policies = await Promise.all(homes.map(loadCapacityPolicy));
  assert.deepEqual(policies.map(policy => policy.owner), ['one', 'two']);
  assert.notEqual(policies[0].engine_artifact_sha256, policies[1].engine_artifact_sha256);
  await writeFile(path.join(homes[0], 'harness-runtime/lib/codex-capacity-policy.mjs'), successfulPolicyFixture + '// tampered');
  await assert.rejects(loadCapacityPolicy(homes[0]), { code: 'capacity_contract_unsupported' });
  assert.equal((await loadCapacityPolicy(homes[1])).owner, 'two');
  await assert.rejects(loadCapacityPolicy(path.join(root, 'missing')), { code: 'capacity_contract_unsupported' });
});

test('productive native and capacity imports reject unhashed symlink assets while allowing the runtime alias', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-contract-symlink-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, 'engines/selected'), lib = path.join(engine, 'dist/harness-runtime/lib');
  await mkdir(lib, { recursive: true });
  const children = "export const NATIVE_CHILD_CONTRACT_VERSION='native-children@1'; export function normalizeNativeChildren(){return []}";
  await writeFile(path.join(lib, 'native-children.mjs'), children);
  await writeFile(path.join(lib, 'operation-errors.mjs'), "export const OPERATION_ERROR_CONTRACT_VERSION='operation-errors@1'; export function isObservationLoss(){return false}");
  await writeFile(path.join(lib, 'dd-agy.mjs'), "export function agyTerminalFailure(){return null}");
  await writeFile(path.join(lib, 'codex-capacity-policy.mjs'), successfulPolicyFixture);
  const checksum = await engineArtifactDigest(engine);
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum } }));
  await symlink('engines/selected/dist/harness-runtime', path.join(root, 'harness-runtime'));
  assert.equal((await loadNativeContracts(root)).engine_artifact_sha256, checksum);
  assert.equal((await loadCapacityPolicy(root)).engine_artifact_sha256, checksum);
  const external = path.join(root, 'foreign.mjs');
  await writeFile(external, "globalThis.__review061_foreign_import = true; " + children);
  for (const [link, target, type] of [
    [path.join(lib, 'foreign.mjs'), external, 'file'],
    [path.join(lib, 'unhashed'), path.join(lib, 'native-children.mjs'), 'file'],
    [path.join(lib, 'unhashed'), root, 'dir'],
    [path.join(lib, 'unhashed'), lib, 'dir']
  ]) {
    await symlink(target, link, type);
    await assert.rejects(loadNativeContracts(root), { code: 'native_contract_unsupported' });
    await assert.rejects(loadCapacityPolicy(root), { code: 'capacity_contract_unsupported' });
    await rm(link);
  }
  // Even re-declaring the old digest cannot bind a native module outside the snapshot.
  await rm(path.join(lib, 'native-children.mjs'));
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await symlink(external, path.join(lib, 'native-children.mjs'));
  await assert.rejects(loadNativeContracts(root), { code: 'native_contract_unsupported' });
  assert.equal(globalThis.__review061_foreign_import, undefined);
});

test('built capacity asset executes from an installed engine snapshot, not the source checkout', { skip: !process.env.DD_FLOW_SOURCE_ROOT && 'set DD_FLOW_SOURCE_ROOT for built runtime proof' }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-built-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const relative = 'harness-runtime/lib/codex-capacity-policy.mjs';
  const bytes = await readFile(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'dist', relative));
  assert.deepEqual(bytes, await readFile(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'src', relative)));
  const engine = path.join(root, 'engines/selected'), adapters = path.join(engine, 'dist/harness-runtime');
  await mkdir(path.join(adapters, 'lib'), { recursive: true });
  await writeFile(path.join(adapters, 'lib/codex-capacity-policy.mjs'), bytes);
  await writeFile(path.join(engine, 'engine.json'), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await symlink('engines/selected/dist/harness-runtime', path.join(root, 'harness-runtime'));
  const policy = await loadCapacityPolicy(root);
  assert.equal(policy.CAPACITY_POLICY, 'codex-overload-burst@1');
  const error = { code: 'turn_interrupted', details: { provider_session_id: 'session', turn_id: 'turn', native_turn_id: 'turn', terminal_status: 'failed', provider_error: { codexErrorInfo: { code: 'serverOverloaded' } } } };
  assert.equal(policy.terminalCodexOverload(error, 'session'), true);
  assert.equal(policy.capacityBackoff(error, 10), 15000);
  assert.equal(policy.terminalCodexOverload({ code: 'ownership_lost', cause: error }, 'session'), false);
});
