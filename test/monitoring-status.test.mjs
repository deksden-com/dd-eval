import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installRuntimeShim, projectStoppedControl } from '../lib/runner.mjs';
import { commandText } from '../lib/process-json.mjs';

test('runtime shim pins home and engine from a foreign cwd and environment', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-'$shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, 'engine'), home = path.join(root, 'home');
  await mkdir(path.join(engine, 'dist/harness-runtime'), { recursive: true });
  await writeFile(path.join(engine, 'cli.cjs'), 'console.log(JSON.stringify({home:process.env.DD_FLOW_HOME,engine:process.env.DD_FLOW_ENGINE_HOME,mode:process.env.DD_FLOW_ENGINE_MODE,args:process.argv.slice(2)}))');
  const shim = await installRuntimeShim(home, { snapshot_root: engine, entrypoint: 'cli.cjs' });
  const reply = JSON.parse(await commandText(shim, ['run', 'drive', 'status', '--run', 'RUN-test'], { cwd: os.tmpdir(), env: { DD_FLOW_HOME: '/foreign', DD_FLOW_ENGINE_HOME: '/foreign', DD_FLOW_ENGINE_MODE: '0' } }));
  assert.deepEqual(reply, { home, engine, mode: '1', args: ['run', 'drive', 'status', '--run', 'RUN-test'] });
});

test('physical stop is visible while recovery reconciliation remains pending', () => {
  const projection = { control: { mode: 'stop', request_id: 'stop-1' } };
  const drain = { scope_id: 'EVAL-1', generation: 2, physical_settled: true, capture: { pending_reasons: ['probe_reconciliation_required'], run_captures: [{ status: 'verified' }] } };
  const live = { inventory: { scope_id: 'EVAL-1', control: { request_id: 'stop-1', requested_mode: 'stop', generation: 2 }, drain } };
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1').recovery, 'pending');
  drain.capture.pending_reasons = [];
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1').recovery, 'ready');
  drain.generation = 1;
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1'), null);
  drain.generation = 2; drain.physical_settled = false;
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1'), null);
  assert.equal(projectStoppedControl(projection, { unavailable: true }, 'EVAL-1'), null);
});

test('private runtime shim retains resource, registry and config roots in a foreign shell', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-private-shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, 'engine'), home = path.join(root, 'home');
  const resources = path.join(root, 'resources'), registry = path.join(root, 'registry', 'homes.json'), canon = path.join(root, 'canon');
  await mkdir(path.join(engine, 'dist/harness-runtime'), { recursive: true });
  await writeFile(path.join(engine, 'cli.cjs'), 'console.log(JSON.stringify({home:process.env.DD_FLOW_HOME,config:process.env.DD_FLOW_CONFIG_HOME,resources:process.env.DD_FLOW_RESOURCE_HOME,registry:process.env.DD_EVAL_REGISTRY_FILE,canon:process.env.DD_MEMORYBANK}))');
  const keys = { DD_FLOW_RESOURCE_HOME: resources, DD_EVAL_REGISTRY_FILE: registry, DD_MEMORYBANK: canon };
  for (const [key, value] of Object.entries(keys)) {
    const before = process.env[key]; process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const shim = await installRuntimeShim(home, { snapshot_root: engine, entrypoint: 'cli.cjs' });
  const reply = JSON.parse(await commandText(shim, ['version'], { cwd: os.tmpdir(), env: Object.fromEntries(Object.keys(keys).map(key => [key, '/foreign'])) }));
  assert.deepEqual(reply, { home, config: home, resources, registry, canon });
});

test('private shim rejects invalid resource bindings before creating runtime state', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-invalid-shim-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = process.env.DD_FLOW_RESOURCE_HOME;
  process.env.DD_FLOW_RESOURCE_HOME = 'relative-resource-home';
  t.after(() => { if (before === undefined) delete process.env.DD_FLOW_RESOURCE_HOME; else process.env.DD_FLOW_RESOURCE_HOME = before; });
  const home = path.join(root, 'not-created');
  await assert.rejects(installRuntimeShim(home, { snapshot_root: root, entrypoint: 'missing.js' }), { code: 'runtime_scope_identity_missing' });
  await assert.rejects(stat(home), { code: 'ENOENT' });
});
