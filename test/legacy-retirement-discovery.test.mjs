import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp, realpath, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {addHome} from '../lib/homes.mjs';
import {appendEvent, readEvents, reduceEvents} from '../lib/runner-events.mjs';
import {priorEvalOwners} from '../lib/eval-retirement.mjs';

test('legacy conflicting journal does not become automatic retirement authority; registered and partial owners remain strict', async t => {
  const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'legacy-retirement-')));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const home=path.join(temp,'home'), root=path.join(home,'runs','EVAL-legacy');
  await mkdir(root,{recursive:true});
  const env={DD_EVAL_REGISTRY_FILE:path.join(temp,'homes.json')};
  await addHome(home,'fixture',env);
  const manifest={schema_id:'dd-eval/runner-manifest@1',kind:'scored',run_id:'EVAL-legacy',case_id:'fixture',executions:[{id:'e2e'}]};
  const file=path.join(root,'manifest.json'), journal=path.join(root,'events.jsonl');
  await writeFile(file,JSON.stringify(manifest));
  for(const type of ['started','failed']) await appendEvent(journal,{source:'dd-eval://runner',runId:manifest.run_id,executionId:'e2e',type:`dev.dd.eval.operation.${type}`,data:{operation_id:'EVAL-legacy:e2e:launch',error:{code:'original'}}});
  const valid=await readFile(journal,'utf8'), duplicate=JSON.parse(valid.trim().split('\n').at(-1));
  duplicate.id='conflicting-terminal'; duplicate.data.sequence++; duplicate.data.error={code:'other'};
  const conflicting=valid+JSON.stringify(duplicate)+'\n';
  await writeFile(journal,conflicting);
  const events=await readEvents(journal);
  assert.throws(()=>reduceEvents(events),{code:'journal_conflict'});
  const discover=()=>priorEvalOwners({caseId:'fixture',env});
  assert.deepEqual(await discover(),[]);
  assert.equal(await readFile(journal,'utf8'),conflicting,'discovery never repairs historical evidence');
  for(const binding of [{runtime_resource_home:path.join(temp,'other-resources')}, {runtime_resource_home:path.join(temp,'other-resources'),runtime_control_bin:path.join(temp,'cli.mjs')}, {kind:'qualification-owner'}]) {
    await writeFile(file,JSON.stringify({...manifest,...binding}));
    await assert.rejects(discover(),{code:'journal_conflict'});
  }
  await writeFile(file,JSON.stringify(manifest));
  await mkdir(path.join(root,'control-runtime'));
  await assert.rejects(discover(),{code:'journal_conflict'},'an existing control runtime is not legacy garbage');
  const registered={...manifest,runtime_resource_home:path.join(temp,'other-resources'),runtime_control_bin:path.join(temp,'cli.mjs')};
  await writeFile(file,JSON.stringify(registered)); await writeFile(journal,valid);
  assert.deepEqual((await discover()).map(item=>item.root),[root],'registered owners in another resource home remain discoverable');
  await writeFile(journal,valid.split('\n')[0]+'\n');
  assert.deepEqual(await discover(),[],'a live/nonterminal registered neighbour remains outside automatic retirement');
});
