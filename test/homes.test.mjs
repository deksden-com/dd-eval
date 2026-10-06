import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { addHome, listHomes, removeHome, registerRunHome, homesFile, registryEnvironment } from '../lib/homes.mjs';

test('homes reject malformed inputs and unknown removal before creating a registry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-homes-input-')), env = { HOME: root };
  const rejected = error => error.code === 'usage' && error.details?.phase === 'prepare' && error.details?.effect === 'no_effect' && error.details?.recoverable === true;
  try {
    for (const id of [undefined, 42, '', ' ', 'SRC-missing', path.join(root, 'missing')]) await assert.rejects(removeHome(id, env), rejected);
    for (const [directory, label] of [[undefined, undefined], [42, undefined], [' ', undefined], [root, 42], [root, {}], [path.join(root, 'missing'), undefined]]) await assert.rejects(addHome(directory, label, env), rejected);
    await writeFile(path.join(root, 'file'), 'retained');
    await assert.rejects(addHome(path.join(root, 'file'), undefined, env), rejected);
    await assert.rejects(stat(path.join(root, '.dd-eval')), { code: 'ENOENT' });
    const cli = path.resolve(import.meta.dirname, '../bin/dd-eval.mjs');
    await assert.rejects(promisify(execFile)(process.execPath, [cli, 'homes', 'remove', '--id', 'SRC-missing'], { env: { ...process.env, ...env } }), error => error.code === 2 && JSON.parse(error.stderr).details?.effect === 'no_effect');
    await assert.rejects(stat(path.join(root, '.dd-eval')), { code: 'ENOENT' });
    const home = await addHome(root, 'valid', env);
    const before = await readFile(homesFile(env), 'utf8');
    await assert.rejects(addHome(root, { invalid: true }, env), rejected);
    await assert.rejects(removeHome('SRC-missing', env), rejected);
    assert.equal(await readFile(homesFile(env), 'utf8'), before);
    assert.equal((await removeHome(home.root, env)).disabled, true);
    assert.equal((await removeHome(home.id, env)).disabled, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('homes deduplicate physical paths, serialize writes, retain removal and preserve corruption', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-homes-')), env = { HOME: root, DD_EVAL_HOME: path.join(root, 'other') };
  try {
    const dirs = ['a','b','c'].map(n => path.join(root,n)); await Promise.all(dirs.map(d => mkdir(d)));
    await Promise.all(dirs.map(d => addHome(d, undefined, env)));
    assert.equal((await listHomes(env)).homes.length, 3);
    await symlink(dirs[0], path.join(root,'alias'));
    const first = await addHome(path.join(root,'alias'), undefined, env);
    assert.equal((await listHomes(env)).homes.length, 3);
    await removeHome(first.id, env);
    await registerRunHome(path.join(dirs[0], 'runs', 'EVAL-1'), env);
    assert.equal((await listHomes(env)).homes.find(h => h.id === first.id).disabled, true);
    await registerRunHome(path.join(dirs[1], 'forks', 'plan-review-label'), env);
    assert.equal((await listHomes(env)).homes.find(h => h.label === 'b').disabled, false);
    await addHome(dirs[0], undefined, env);
    assert.equal((await listHomes(env)).homes.find(h => h.id === first.id).disabled, false);
    assert.equal(homesFile(env), path.join(root,'.dd-eval','homes.json'));
    await writeFile(homesFile(env), 'broken');
    await assert.rejects(addHome(dirs[0], undefined, env));
    assert.equal(await readFile(homesFile(env),'utf8'),'broken');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('private registry is explicit, atomic and independent of the working registry', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-private-homes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const globalEnv = { HOME: root }, privateFile = path.join(root, 'candidate registry', 'homes.json');
  await mkdir(path.dirname(homesFile(globalEnv)), { recursive: true });
  const canary = '{working registry must not be read or rewritten';
  await writeFile(homesFile(globalEnv), canary);
  const env = { ...globalEnv, DD_EVAL_REGISTRY_FILE: privateFile };
  const dirs = ['a', 'b', 'c'].map(name => path.join(root, 'candidate', name));
  await Promise.all(dirs.map(directory => mkdir(directory, { recursive: true })));
  assert.deepEqual(await listHomes(env), { schema_version: 1, homes: [] });
  await Promise.all(dirs.map(directory => addHome(directory, undefined, env)));
  assert.equal((await listHomes(env)).homes.length, 3);
  const first = (await listHomes(env)).homes[0];
  await removeHome(first.id, env);
  await registerRunHome(path.join(first.root, 'runs', 'EVAL-private'), env);
  assert.equal((await listHomes(env)).homes.find(home => home.id === first.id).disabled, true);
  const cli = path.resolve(import.meta.dirname, '../bin/dd-eval.mjs');
  const reply = await promisify(execFile)(process.execPath, [cli, 'homes', 'list'], { env: { ...process.env, ...env } });
  assert.equal(JSON.parse(reply.stdout).homes.length, 3);
  assert.equal(await readFile(homesFile(globalEnv), 'utf8'), canary);
  await writeFile(privateFile, '{broken');
  await assert.rejects(registerRunHome(path.join(root, 'candidate', 'runs', 'EVAL-next'), env));
  assert.equal(await readFile(privateFile, 'utf8'), '{broken');
  assert.equal(await readFile(homesFile(globalEnv), 'utf8'), canary);
});

test('invalid registry selection fails before creating a home and never falls back', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-private-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const selected of ['', ' ', 'relative.json', './homes.json', 'bad\0file', null, 42]) {
    const env = { HOME: root, DD_EVAL_REGISTRY_FILE: selected };
    assert.throws(() => homesFile(env), error => error.code === 'usage' && error.details.effect === 'no_effect');
    await assert.rejects(registerRunHome(path.join(root, 'new', 'runs', 'EVAL-invalid'), env), { code: 'usage' });
  }
  await assert.rejects(stat(path.join(root, 'new')), { code: 'ENOENT' });
  await assert.rejects(stat(path.join(root, '.dd-eval')), { code: 'ENOENT' });
});

test('retained registry wins over ambient selection; historical records use the original default', () => {
  const retained = path.join(os.tmpdir(), 'retained registry.json');
  const env = { HOME: os.tmpdir(), DD_EVAL_REGISTRY_FILE: 'invalid ambient selection' };
  assert.equal(homesFile(registryEnvironment({ eval_registry_file: retained }, env)), retained);
  assert.equal(homesFile(registryEnvironment({}, env)), path.join(os.tmpdir(), '.dd-eval', 'homes.json'));
  for (const value of [undefined, null, '', 'relative']) assert.throws(() => registryEnvironment({ eval_registry_file: value }, env), { code: 'usage' });
});
