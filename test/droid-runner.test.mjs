import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertObservedRuntime, assertProfileCapacity, callDriver, driverAdapterInvocation, driverProfileArgs, driverRuntimeArgs, judgeRuntimeEnvironment, loadProfile } from '../lib/runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('retired adapter implementations belong only to the selected CLI runtime', async () => {
  const retired = ['droid', 'codex', 'opencode', 'agy', 'grok', 'zcode'].flatMap(harness => [`bin/dd-${harness}.mjs`, `lib/dd-${harness}.mjs`, `lib/dd-${harness}-daemon.mjs`]);
  for (const file of [...retired, 'lib/droid-observation.mjs', 'lib/dispatch-fence.mjs', 'lib/session-settlement.mjs']) {
    await assert.rejects(readFile(path.join(root, file)), { code: 'ENOENT' });
  }
});

test('config-only adapter processes cannot inherit ambient Flow ownership', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'dd-config-isolation-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const keys = ['DD_FLOW_HOME', 'DD_FLOW_RUNTIME_OWNER', 'DD_FLOW_RUNTIME_BUDGET', 'DD_FLOW_ENGINE_HOME'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = 'foreign-ambient-identity';
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  await writeFile(path.join(home, 'harnesses.json'), JSON.stringify({ harnesses: { 'droid-cli': { runtime_command: '/bin/false' } } }));
  const adapter = path.join(home, 'harness-runtime/bin/dd-droid.mjs');
  await mkdir(path.dirname(adapter), { recursive: true });
  await writeFile(adapter, `console.log(JSON.stringify({env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('DD_FLOW_')))}));`);
  const profile = { harness: 'droid-cli' };
  const receipt = await callDriver(profile, ['doctor'], { cwd: home, env: { DD_FLOW_CONFIG_HOME: home }, validateRuntime: false });
  assert.deepEqual(receipt.env, { DD_FLOW_CONFIG_HOME: home });
  const owned = judgeRuntimeEnvironment({ runtimeRoot: home, daemonState: path.join(home, 'judge'), profile, resourceHome: path.join(home, 'resources') });
  const judge = await callDriver(profile, ['doctor'], { cwd: home, env: owned, validateRuntime: false });
  const owner = JSON.parse(judge.env.DD_FLOW_RUNTIME_OWNER);
  assert.equal(owner.role, 'judge'); assert.equal(owner.adapter_executable, adapter);
  assert.equal(judge.env.DD_FLOW_RESOURCE_HOME, owned.DD_FLOW_RESOURCE_HOME);
  for (const key of ['DD_FLOW_HOME', 'DD_FLOW_RUNTIME_BUDGET', 'DD_FLOW_ENGINE_HOME']) assert.equal(judge.env[key], undefined);
});

test('Droid profile pins native/protocol versions and requires capacity qualification', async () => {
  const { value: profile } = await loadProfile('droid-cli-openai-gpt-5-6-sol-high');
  assert.equal(profile.harness, 'droid-cli');
  assert.deepEqual(profile.runtime, { droid: '0.212.0', factory_protocol: '1.201.0', dd_harness_contract: 'dd-droid-harness@1' });
  assert.equal(profile.subagent_capacity, 15);
  assert.throws(() => assertProfileCapacity({ ...profile, subagent_capacity: undefined }, [{ stage: 'code', terminal_stage: 'code' }]), { code: 'subagent_capacity_unqualified' });
  assert.throws(() => assertObservedRuntime({ observed_runtime: { ...profile.runtime, droid: 'different' } }, profile, 'Droid'), { code: 'harness_runtime_mismatch' });
  assert.deepEqual(driverProfileArgs(profile, ['daemon', 'start']), ['daemon', 'start', '--provider', 'openai', '--model', 'gpt-5.6-sol', '--reasoning', 'high', '--mode', 'auto-high']);
});

test('Droid adapter and native runtime resolve separately from canonical configuration', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'dd-droid-routing-'));
  try {
    await writeFile(path.join(home, 'harnesses.json'), JSON.stringify({ harnesses: { 'droid-cli': { adapter_command: '/bin/echo', runtime_command: '/bin/false' } } }));
    const adapter = path.join(home, 'harness-runtime/bin/dd-droid.mjs');
    await mkdir(path.dirname(adapter), { recursive: true }); await writeFile(adapter, '');
    for (const harness of ['droid-cli', 'droid']) {
      const profile = { harness };
      assert.deepEqual(await driverAdapterInvocation(profile, { cwd: home, env: { DD_FLOW_HOME: home } }), { executable: process.execPath, prefix: [adapter] });
      const args = await driverRuntimeArgs(['daemon', 'start'], { cwd: home, env: { DD_FLOW_HOME: home, DD_FLOW_BIN: '/bin/echo' }, profile });
      assert.deepEqual(args, ['daemon', 'start', '--dd-flow-bin', '/bin/echo', '--dd-flow-home', home, '--project-root', home, '--droid-bin', '/bin/false']);
      await assert.rejects(driverAdapterInvocation(profile, { cwd: home }), { code: 'harness_config_missing' });
      await assert.rejects(driverAdapterInvocation(profile, { cwd: home, env: { DD_FLOW_CONFIG_HOME: 'relative' } }), { code: 'harness_config_missing' });
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('isolated runtime prefers the adapter bundled with its selected engine', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'dd-droid-bundled-'));
  try {
    const adapter = path.join(home, 'harness-runtime', 'bin', 'dd-droid.mjs');
    await mkdir(path.dirname(adapter), { recursive: true }); await writeFile(adapter, '');
    assert.deepEqual(
      await driverAdapterInvocation({ harness: 'droid-cli' }, { cwd: home, env: { DD_FLOW_HOME: home } }),
      { executable: process.execPath, prefix: [adapter] }
    );
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Droid technical capacity launches without flow integration', async () => {
  const source = await readFile(path.join(root, 'lib/runner.mjs'), 'utf8');
  const helper = source.match(/export async function harnessCapacityCheck[\s\S]*?\n}/)[0];
  assert.match(helper, /\["grok-acp", "antigravity-cli", "opencode-server", "droid-cli", "droid"\]\.includes\(profile.harness\) \? \["--no-flow"\]/);
  assert.doesNotMatch(helper, /DD_FLOW_HOME/);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.bin, { 'dd-eval': './bin/dd-eval.mjs' });
});

test('config-only Judge uses the configured adapter/runtime without enabling flow lifecycle', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'dd-judge-config-'));
  try {
    await writeFile(path.join(home, 'harnesses.json'), JSON.stringify({ harnesses: { 'codex-desktop': { adapter_command: '/bin/echo', runtime_command: '/bin/false' } } }));
    const adapter = path.join(home, 'harness-runtime/bin/dd-codex.mjs');
    await mkdir(path.dirname(adapter), { recursive: true }); await writeFile(adapter, '');
    const profile = { harness: 'codex-desktop' };
    const daemonState = path.join(home, 'judge-daemon');
    const budget = { schema_id: 'dd-flow/runtime-budget@1', scope_id: 'EVAL-test', per_harness: { 'codex-desktop': 1 } };
    const resourceHome = path.join(home, 'retained-resources');
    assert.throws(() => judgeRuntimeEnvironment({ runtimeRoot: home, daemonState, profile, budget }), { code: 'runtime_scope_identity_missing' });
    const env = judgeRuntimeEnvironment({ runtimeRoot: home, daemonState, profile, codexHome: path.join(home, 'codex-home'), budget, resourceHome, controller: { project_id: 'PRJ-test', run_id: 'RUN-test' } });
    assert.equal(env.DD_FLOW_RESOURCE_HOME, resourceHome);
    const options = { cwd: home, env: { ...env, PATH: '/unavailable-path' }, profile };
    assert.deepEqual(await driverAdapterInvocation(options.profile, options), { executable: process.execPath, prefix: [adapter] });
    assert.deepEqual(await driverRuntimeArgs(['daemon', 'start'], options), ['daemon', 'start', '--codex-bin', '/bin/false']);
    assert.deepEqual(await driverRuntimeArgs(['doctor'], options), ['doctor', '--codex-bin', '/bin/false']);
    assert.equal(options.env.DD_FLOW_HOME, undefined);
    assert.equal(env.DD_FLOW_CONFIG_HOME, home);
    assert.equal(env.CODEX_HOME, path.join(home, 'codex-home'));
    const owner = JSON.parse(env.DD_FLOW_RUNTIME_OWNER);
    assert.equal(owner.role, 'judge');
    assert.equal(owner.resource_home, resourceHome);
    assert.equal(owner.project_id, 'PRJ-test');
    assert.equal(owner.run_id, 'RUN-test');
    assert.equal(owner.dd_flow_home, home);
    assert.equal(owner.state_dir, daemonState);
    assert.deepEqual(owner.budget, budget);
    assert.equal(owner.work_id, undefined);
    const finalOwner = JSON.parse(judgeRuntimeEnvironment({ runtimeRoot: home, daemonState, profile, codexHome: path.join(home, 'codex-home') }).DD_FLOW_RUNTIME_OWNER);
    assert.equal(finalOwner.project_id, undefined);
    assert.equal(finalOwner.run_id, undefined);
    const source = await readFile(path.join(root, 'lib/runner.mjs'), 'utf8');
    const final = source.slice(source.indexOf('async function finalJudge('), source.indexOf('async function interactionJudge('));
    const interaction = source.slice(source.indexOf('async function interactionJudge('), source.indexOf('export function validateHitlMatch'));
    assert.match(final, /judgeRuntimeEnvironment\(\{ runtimeRoot: roots\.runtimeRoot,/);
    assert.match(interaction, /judgeRuntimeEnvironment\(\{ runtimeRoot,/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
