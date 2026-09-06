import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertObservedRuntime, assertProfileCapacity, driverAdapterInvocation, driverProfileArgs, driverRuntimeArgs, loadProfile } from '../lib/runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

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
    for (const harness of ['droid-cli', 'droid']) {
      const profile = { harness };
      assert.deepEqual(await driverAdapterInvocation(profile, { cwd: home, env: { DD_FLOW_HOME: home } }), { executable: '/bin/echo', prefix: [] });
      const args = await driverRuntimeArgs(['daemon', 'start'], { cwd: home, env: { DD_FLOW_HOME: home, DD_FLOW_BIN: '/bin/echo' }, profile });
      assert.deepEqual(args, ['daemon', 'start', '--dd-flow-bin', '/bin/echo', '--dd-flow-home', home, '--project-root', home, '--droid-bin', '/bin/false']);
      const fallback = await driverAdapterInvocation(profile, { cwd: home });
      assert.equal(fallback.executable, process.execPath);
      assert.deepEqual(fallback.prefix, [path.join(root, 'bin/dd-droid.mjs')]);
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Droid technical capacity launches without flow integration', async () => {
  const source = await readFile(path.join(root, 'lib/runner.mjs'), 'utf8');
  const helper = source.match(/export async function harnessCapacityCheck[\s\S]*?\n}\n\n\/\*\* Ask the current coordinator/)[0];
  assert.match(helper, /\["grok-acp", "antigravity-cli", "opencode-server", "droid-cli", "droid"\]\.includes\(profile.harness\) \? \["--no-flow"\]/);
  assert.doesNotMatch(helper, /DD_FLOW_HOME/);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin['dd-droid'], './bin/dd-droid.mjs');
});

test('config-only Judge uses the configured adapter/runtime without enabling flow lifecycle', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'dd-judge-config-'));
  try {
    await writeFile(path.join(home, 'harnesses.json'), JSON.stringify({ harnesses: { 'codex-desktop': { adapter_command: '/bin/echo', runtime_command: '/bin/false' } } }));
    const options = { cwd: home, env: { DD_FLOW_CONFIG_HOME: home, PATH: '/unavailable-path', CODEX_HOME: path.join(home, 'codex-home') }, profile: { harness: 'codex-desktop' } };
    assert.deepEqual(await driverAdapterInvocation(options.profile, options), { executable: '/bin/echo', prefix: [] });
    assert.deepEqual(await driverRuntimeArgs(['daemon', 'start'], options), ['daemon', 'start', '--codex-bin', '/bin/false']);
    assert.deepEqual(await driverRuntimeArgs(['doctor'], options), ['doctor', '--codex-bin', '/bin/false']);
    assert.equal(options.env.DD_FLOW_HOME, undefined);
    const source = await readFile(path.join(root, 'lib/runner.mjs'), 'utf8');
    const final = source.slice(source.indexOf('async function finalJudge('), source.indexOf('async function interactionJudge('));
    const interaction = source.slice(source.indexOf('async function interactionJudge('), source.indexOf('export function validateHitlMatch'));
    assert.match(final, /DD_FLOW_CONFIG_HOME: roots\.runtimeRoot/);
    assert.match(interaction, /DD_FLOW_CONFIG_HOME: runtimeRoot/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
