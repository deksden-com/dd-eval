import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setupMemoryRuntime, validateMemorySetup } from '../lib/memory-runtime-setup.mjs';

test('Memory setup delegates trust to CLI and binds private Home to checkpoint canon/engine', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project'); await mkdir(projectRoot);
  const bin = path.join(root, 'cli.mjs'), calls = path.join(root, 'calls.json'), runtimeRoot = path.join(root, 'runtime');
  const checkpoint = { flow_pack: { delivery: 'installed_canon', commit: 'a'.repeat(40), memory_bank_version: '1', engine: { version: 'engine-1' } } };
  const declaration = { canonSource: path.join(root, 'release'), trustFile: path.join(root, 'trust.json'), channel: 'development' };
  const receipt = { installation_readiness: 'installed', installation: { manifest: { canon: { commit: checkpoint.flow_pack.commit, version: '1' }, engine: { version: 'engine-1' } } } };
  const script = value => `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify({args:process.argv.slice(2),home:process.env.DD_FLOW_HOME,config:process.env.DD_FLOW_CONFIG_HOME})); console.log(JSON.stringify(${JSON.stringify(value)}));`;
  await writeFile(bin, script(receipt));
  const input = { bin, projectRoot, runtimeRoot, checkpoint, declaration, requestId: 'setup-fixture', env: { DD_FLOW_HOME: '/must-not-consume', DD_FLOW_CONFIG_HOME: '/must-not-consume' } };
  assert.deepEqual(await setupMemoryRuntime(input), receipt);
  const observed = JSON.parse(await readFile(calls));
  assert.equal(observed.home, runtimeRoot); assert.equal(observed.config, runtimeRoot);
  assert.equal(observed.args[0], 'setup'); assert(observed.args.includes('--skip-agent-setup')); assert(observed.args.includes('--non-interactive'));
  for (const value of [declaration.canonSource, declaration.trustFile, declaration.channel, input.requestId]) assert(observed.args.includes(value));
  await rm(calls);
  for (const changed of [{ runtimeRoot: projectRoot }, { runtimeRoot: undefined }, { declaration: { ...declaration, trustFile: 'relative' } }, { declaration: { ...declaration, profile: 'hidden-save' } }, { checkpoint: { flow_pack: { ...checkpoint.flow_pack, delivery: 'project_pack' } } }]) {
    await assert.rejects(setupMemoryRuntime({ ...input, ...changed }), { code: 'memory_setup_invalid' });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
  for (const value of [{ ...receipt, installation_readiness: 'degraded' }, { ...receipt, installation: { manifest: { ...receipt.installation.manifest, canon: { commit: 'b'.repeat(40), version: '1' } } } }, { ...receipt, installation: { manifest: { ...receipt.installation.manifest, engine: { version: 'other' } } } }]) {
    await writeFile(bin, script(value));
    await assert.rejects(setupMemoryRuntime(input), { code: 'memory_setup_invalid' });
  }
  assert.throws(() => validateMemorySetup({ ...declaration, channel: 'unknown' }), { code: 'memory_setup_invalid' });
});
