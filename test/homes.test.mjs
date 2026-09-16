import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addHome, listHomes, removeHome, registerRunHome, homesFile } from '../lib/homes.mjs';

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
