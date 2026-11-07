import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {isCandidateRunSnapshot,isStageRunSnapshot,isStandardRunSnapshot} from '../lib/snapshot-version.mjs';
import {verifySnapshot} from '../lib/runner.mjs';

test('snapshot version gate keeps independent workspace distinct from legacy and unborn-project formats',()=>{
  for(const kind of ['project','git_worktree']) assert(isStandardRunSnapshot({schema_id:'dd-flow/eval-run-snapshot@5',workspace:{kind}}));
  assert(isStandardRunSnapshot({schema_id:'dd-flow/eval-run-snapshot@7',workspace:{kind:'git_repository',state:'unborn'}}));
  for(const value of [null,{}, {schema_id:'dd-flow/eval-run-snapshot@6'},
    {schema_id:'dd-flow/eval-run-snapshot@5',workspace:{kind:'git_repository'}},
    ...['project','git_worktree',undefined].map(kind=>({schema_id:'dd-flow/eval-run-snapshot@7',workspace:{kind}}))]) assert(!isStandardRunSnapshot(value));
});

test('candidate Git evidence does not become a Stage entry or recovery capability',()=>{
  const sha='a'.repeat(64),ref={ref:`refs/dd-flow/work-results/${sha}`,commit:'b'.repeat(40)};
  const candidate={schema_id:'dd-flow/eval-run-snapshot@12',purpose:'candidate',stage_entry:null,workspace:{kind:'project'},work_git:{sha256:sha,refs:[ref]},payload_integrity:{schema_id:'dd-flow/framed-payload@1',project:sha,runtime:sha}};
  assert(isCandidateRunSnapshot(candidate));assert(!isStageRunSnapshot(candidate));assert(!isStandardRunSnapshot(candidate));
  for(const value of [{...candidate,purpose:'stage_entry',stage_entry:'code'}, {...candidate,work_git:null},
    {...candidate,work_git:{...candidate.work_git,refs:[ref,ref]}},{...candidate,payload_integrity:undefined},
    {...candidate,workspace:{kind:'git_worktree'}},{...candidate,stage_entry:'code'}]) assert(!isCandidateRunSnapshot(value));
});

test('Stage gate recognizes retained Work refs without treating them as recovery or candidate snapshots',()=>{
  const sha='a'.repeat(64),ref={ref:`refs/dd-flow/work-results/${sha}`,commit:'b'.repeat(40)};
  const legacy={schema_id:'dd-flow/eval-run-snapshot@10',purpose:'stage_entry',stage_entry:'code',workspace:{kind:'project'},work_git:{sha256:sha,refs:[ref]}};
  const current={...legacy,schema_id:'dd-flow/eval-run-snapshot@11',payload_integrity:{schema_id:'dd-flow/framed-payload@1',project:sha,runtime:sha}};
  const ordinary={...current};delete ordinary.work_git;
  for(const value of [legacy,current,ordinary,{...current,workspace:{kind:'git_worktree'},payload_integrity:{...current.payload_integrity,workspace:sha}}]) {
    assert(isStageRunSnapshot(value));assert(!isStandardRunSnapshot(value));
  }
  for(const value of [{...current,purpose:'recovery'},{...current,purpose:'candidate'},{...current,stage_entry:''},
    {...current,work_git:{...current.work_git,refs:[ref,ref]}},{...current,work_git:{...current.work_git,refs:[{...ref,commit:'fake'}]}},
    {...current,work_git:null},{...current,payload_integrity:undefined},{...current,payload_integrity:{...current.payload_integrity,workspace:sha}},
    {...current,workspace:{kind:'git_worktree'}},{...legacy,payload_integrity:current.payload_integrity}]) assert(!isStageRunSnapshot(value));
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
  const sha='a'.repeat(64),ref={ref:`refs/dd-flow/work-results/${sha}`,commit:'b'.repeat(40)};
  const retained={...valid,schema_id:'dd-flow/eval-run-snapshot@11',work_git:{sha256:sha,refs:[ref]},payload_integrity:{schema_id:'dd-flow/framed-payload@1',project:sha,runtime:sha,workspace:sha}};
  assert.equal((await read(retained)).manifest.schema_id,retained.schema_id);
  await assert.rejects(read({...retained,payload_integrity:undefined}),{code:'snapshot_contract_mismatch'});
  await assert.rejects(read({...retained,purpose:'candidate'}),{code:'snapshot_contract_mismatch'});
});
