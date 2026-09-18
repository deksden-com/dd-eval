import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { addHome, listHomes, removeHome, registerRunHome, homesFile } from '../lib/homes.mjs';

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
