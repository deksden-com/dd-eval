import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {isStandardRunSnapshot} from '../lib/snapshot-version.mjs';
import {verifySnapshot} from '../lib/runner.mjs';

test('snapshot version gate keeps independent workspace distinct from legacy and unborn-project formats',()=>{
  for(const kind of ['project','git_worktree']) assert(isStandardRunSnapshot({schema_id:'dd-flow/eval-run-snapshot@5',workspace:{kind}}));
  assert(isStandardRunSnapshot({schema_id:'dd-flow/eval-run-snapshot@7',workspace:{kind:'git_repository',state:'unborn'}}));
  for(const value of [null,{}, {schema_id:'dd-flow/eval-run-snapshot@6'},
    {schema_id:'dd-flow/eval-run-snapshot@5',workspace:{kind:'git_repository'}},
    ...['project','git_worktree',undefined].map(kind=>({schema_id:'dd-flow/eval-run-snapshot@7',workspace:{kind}}))]) assert(!isStandardRunSnapshot(value));
});

test('focused entry verification accepts diagnostic snapshot version without widening purpose or RUN identity',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'diagnostic-entry-version-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const directory=path.join(root,'snapshot');await mkdir(directory);
  const valid={schema_id:'dd-flow/eval-run-snapshot@7',purpose:'stage_entry',stage_entry:'analyze',run_id:'RUN-1',workspace:{kind:'git_repository'}};
  const read=async value=>{
    const bytes=JSON.stringify(value);await writeFile(path.join(directory,'snapshot.json'),bytes);
    return verifySnapshot(root,{stage:'analyze',snapshot:{kind:'run',locator:'snapshot',run_id:'RUN-1',manifest_sha256:createHash('sha256').update(bytes).digest('hex')}},'analyze');
  };
  assert.equal((await read(valid)).manifest.schema_id,valid.schema_id);
  for(const change of [{purpose:'candidate'},{run_id:'foreign'},{stage_entry:'review'},
    {schema_id:'dd-flow/eval-run-snapshot@5'},{schema_id:'dd-flow/eval-run-snapshot@6'}, {workspace:{kind:'git_worktree'}}]) {
    await assert.rejects(read({...valid,...change}),{code:'snapshot_contract_mismatch'});
  }
});
