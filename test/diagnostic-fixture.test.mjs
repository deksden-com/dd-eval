import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('diagnostic product pins documentation contradictions without changing implementation or accepted DEF',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'diagnostic-product-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const project=path.join(root,'project'),bundle=fileURLToPath(new URL('./fixtures/diagnostic/mature-conformance-v1.bundle',import.meta.url));
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:'pipe'}).trim();
  git('clone','--no-checkout',bundle,project);git('-C',project,'checkout','--detach','fc3edfee4d6dc8b27a664bb5ee5e08cc58387817');
  assert.deepEqual(git('-C',project,'diff','--name-only','7f5fabdd0874935e8e6f6733c2ab5662cdaaee7b','HEAD').split('\n'),[
    '.memory-bank/spec/product/FEAT-001-safe-ledger.md','.memory-bank/spec/product/index.md']);
  const source=await readFile(path.join(project,'src/ledger.mjs'),'utf8');assert(source.includes("typeof event.id !== 'string'"));
  assert(!source.includes('amount'));assert(!source.includes('lock'));
  const feature=await readFile(path.join(project,'.memory-bank/spec/product/FEAT-001-safe-ledger.md'),'utf8');
  for(const claim of ['rejects negative','built-in lock','npm run migrate','ledger-migration.md'])assert(feature.includes(claim));
  assert.deepEqual(Object.keys(JSON.parse(await readFile(path.join(project,'package.json'))).scripts),['test']);
  await assert.rejects(readFile(path.join(project,'.memory-bank/spec/operations/ledger-migration.md')),{code:'ENOENT'});
  const def=await readFile(path.join(project,'.memory-bank/spec/engineering/DEF-UPGRADE-001.md'),'utf8');
  for(const fact of ["version: '1.2.7'","def_status: 'open'",'Accepted for this authored evaluation fixture','no locking or migration utility'])assert(def.includes(fact));
  assert.equal(git('-C',project,'status','--porcelain'),'');
});
