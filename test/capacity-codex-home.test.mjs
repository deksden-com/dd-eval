import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { provisionCapacityCodexHome } from '../lib/harness/capacity-codex-home.mjs';

test('capacity home retains routing but isolates hooks, plugins and storage', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-capacity-home-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), target = path.join(root, 'target');
  await mkdir(source);
  await writeFile(path.join(source, 'auth.json'), '{}');
  await writeFile(path.join(source, 'config.toml'), 'model_provider = "routing"\nsqlite_home = "/old"\n[features]\nhooks = true\nplugins = true\n');
  const previous = process.env.CODEX_HOME;
  t.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; });
  process.env.CODEX_HOME = source;
  await provisionCapacityCodexHome(target);
  assert.equal(await readlink(path.join(target, 'auth.json')), path.join(source, 'auth.json'));
  const config = await readFile(path.join(target, 'config.toml'), 'utf8');
  assert.match(config, /model_provider = "routing"/);
  assert.match(config, /hooks = false/);
  assert.match(config, /plugins = false/);
  assert.doesNotMatch(config, /sqlite_home/);
});
