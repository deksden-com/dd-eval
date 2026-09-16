import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
