import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectPackStagePublication } from '../lib/recovery/pack-stage-publication.mjs';
import { isStageRunSnapshot } from '../lib/recovery/snapshot-version.mjs';
import { acceptedPackVisit } from '../lib/flow-boundaries.mjs';
import { acceptedManagedExecution } from '../lib/completion-scope.mjs';
import { verifyBoundedForkAuthority } from '../lib/recovery/eval-fork.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture() {
  const digest='a'.repeat(64),run='RUN-1',project='PRJ-1',snapshot='/owned/snapshot';
  const visit={stage:'plan-review',visit:2,attempt:1,outcome:'accepted',result:'run://plan-review/2/result.json'};
  const previous={...visit,visit:1,outcome:'revise',result:'run://plan-review/1/result.json'};
  const next={stage:'code',visit:1},boundary={pack:{flow_id:'mb-sdlc',version:'1',sha256:digest},accepted:[previous,visit],cursor:next,next_stage:'code'};
  const key=sha(JSON.stringify({run_id:run,stage:visit.stage,pack_boundary:boundary})),controller='controller',operationId=`${controller}:boundary:${key}`;
  const input={action:'boundary_capture',run_id:run,stage:visit.stage,pack_boundary:boundary,stage_entry:'code',output:snapshot};
  const receipt={snapshot,manifest_sha256:digest};
  const operation={operation_id:operationId,controller_id:controller,input_hash:key,input_json:JSON.stringify(input),receipt_json:JSON.stringify(receipt),updated_at:'2026-11-25T00:00:00Z'};
  const catalog={schema_id:'dd-flow/snapshot-catalog@1',provenance:'capture',run_id:run,operation_id:operationId,input_sha256:sha(operation.input_json),receipt_sha256:sha(operation.receipt_json),entry:{snapshot_id:operationId,snapshot,manifest_sha256:digest,after_stage:visit.stage,stage_entry:'code',available:true,forkable:true,restorable:true}};
  const publication={schema_id:'dd-flow/stage-publication@1',project_id:project,run_id:run,operation,catalog};
  const manifest={schema_id:'dd-flow/eval-run-snapshot@19',purpose:'stage_entry',stage_entry:'code',run_id:run,project_id:project,project_root:'/source/project',
    consistency:'controller_boundary_writer_barrier@1',boundary_capture:{controller_id:controller,operation_id:operationId,boundary_key:key,observation:{settled:true,operation_id:operationId}},
    pack_stage_authority:{schema_id:'dd-flow/pack-stage-authority@1',boundary_sha256:sha(JSON.stringify(boundary)),...visit},
    stage_engine:{schema_id:'dd-flow/pack-stage-engine@1',pack_sha256:digest,engine_version:'1',engine_checksum:digest,engine_manifest_sha256:digest},
    pack_evidence:{schema_id:'dd-flow/pack-snapshot-evidence@1',publication:'published',run_id:run,project_id:project,code_input_sha256:digest},
    pack_stage_sql:{schema_id:'dd-flow/pack-stage-sql@1',sha256:digest},pack_stage_resource_capture:{schema_id:'dd-flow/pack-stage-resource-capture@1',receipt_sha256:digest},
    project_git:{index_format:'entries@1',index_sha256:digest},workspace:{kind:'git_worktree',index_format:'entries@1',index_sha256:digest}};
  return {publication,publicationSha256:sha(JSON.stringify(publication)),manifest,snapshot,snapshotSha256:digest,engineVersion:'1',engineChecksum:digest};
}

test('@19 publication binds selected visit, capture, catalog and engine',()=>{
  const input=fixture(); assert(isStageRunSnapshot(input.manifest));
  assert.equal(inspectPackStagePublication(input).authority.visit,2);
  for(const changed of [
    {...input,publicationSha256:'f'.repeat(64)}, {...input,engineChecksum:'f'.repeat(64)},
    {...input,manifest:{...input.manifest,assessment_only:true}}, {...input,manifest:{...input.manifest,pack_stage_authority:{...input.manifest.pack_stage_authority,visit:1}}},
    {...input,publication:{...input.publication,catalog:{...input.publication.catalog,entry:{...input.publication.catalog.entry,forkable:false}}}}
  ]) assert.throws(()=>inspectPackStagePublication(changed),{code:'fork_publication_invalid'});
});

test('pack completion resolves the last accepted repeated visit and rejects foreign or active state',()=>{
  const {manifest}=fixture(), a=manifest.pack_stage_authority;
  const visit={stage:a.stage,visit:a.visit,attempt:a.attempt,status:'done',outcome:a.outcome,result:a.result};
  const next={stage:'code',visit:1,attempt:1,status:'running'};
  const previous={...visit,visit:1,outcome:'revise',result:'run://plan-review/1/result.json'};
  const status={run:{id:manifest.run_id,project_id:manifest.project_id},index:{pack_state:{schema_id:'dd-flow/run-state@1',run_id:manifest.run_id,project_id:manifest.project_id,pack:{flow_id:'mb-sdlc',sha256:manifest.stage_engine.pack_sha256},visits:[previous,visit,next],cursor:{stage:'code',visit:1}}}};
  assert.equal(acceptedPackVisit(status,'plan-review').visit,2);
  assert.equal(acceptedPackVisit(status,'plan'),null);
  assert.equal(acceptedPackVisit({...status,run:{...status.run,id:'foreign'}},'plan-review'),null);
  assert.equal(acceptedPackVisit({...status,index:{pack_state:{...status.index.pack_state,cursor:{stage:'code',visit:2}}}},'plan-review'),null);
  status.index.run_id=manifest.run_id;
  const launch='EVAL:e2e:launch', lifecycle={run_id:manifest.run_id,status,stage_status:'done',stage_visit:{stage:visit.stage,visit:visit.visit,attempt:visit.attempt,outcome:visit.outcome,result:visit.result}};
  const result={run_id:manifest.run_id,stage:'plan-review',execution_operation_id:launch,lifecycle,
    driver:{controller:{controller_id:'controller',request_id:`eval:${sha(launch)}`,run_id:manifest.run_id,project_id:manifest.project_id,generation:0,status:'stop_target_reached',stage:'plan-review'}}};
  assert.equal(acceptedManagedExecution(result),true);
  assert.equal(acceptedManagedExecution({...result,lifecycle:{...lifecycle,stage_visit:{...lifecycle.stage_visit,visit:1}}}),false);
});

test('synthetic @19 target checks retained public receipt, source bytes and visit',async t=>{
  const input=fixture(), engineBytes='{"schema_id":"fixture-engine"}';
  input.manifest.stage_engine.engine_manifest_sha256=sha(engineBytes);
  const manifestBytes=JSON.stringify(input.manifest); input.snapshotSha256=sha(manifestBytes);
  const op=input.publication.operation, catalog=input.publication.catalog;
  op.receipt_json=JSON.stringify({snapshot:input.snapshot,manifest_sha256:input.snapshotSha256});
  catalog.receipt_sha256=sha(op.receipt_json); catalog.entry.manifest_sha256=input.snapshotSha256;
  input.publicationSha256=sha(JSON.stringify(input.publication));
  const authority=inspectPackStagePublication(input).authority;
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'pack-stage-target-'))); t.after(()=>rm(root,{recursive:true,force:true}));
  const home=path.join(root,'dd-flow-home'),project=path.join(root,'project'),runHome=path.join(home,'runs','RUN-1'),importId='00000000-0000-0000-0000-000000000000',retained=path.join(home,'stage-sources',importId);
  await Promise.all([mkdir(runHome,{recursive:true}),mkdir(project,{recursive:true}),mkdir(retained,{recursive:true})]);
  const intent={request_id:'fork',snapshot:input.snapshot,snapshot_sha256:input.snapshotSha256,engine_version:'1',integrity_checksum:input.engineChecksum,publication_sha256:input.publicationSha256,target_stage:'code',source_run_id:'RUN-1',pack_authority:authority};
  const lineageFile=path.join(runHome,'fork-lineage.json'),fork={schema_id:'dd-flow/run-fork@1',ok:true,status:'ready',intent:{...intent},fork:{project_root:project,dd_flow_home:home,run_id:'RUN-1',run_home:runHome,workspace_root:project,target_stage:'code',lineage_file:lineageFile,engine:{engine_version:'1',integrity_checksum:input.engineChecksum}}};
  const lineage={schema_id:'dd-flow/run-fork-lineage@1',request_id:'fork',source_snapshot:input.snapshot,source_snapshot_sha256:input.snapshotSha256,source_run_id:'RUN-1',target_stage:'code',inherited_engine:{schema_id:'dd-flow/run-engine-binding@1',run_id:'RUN-1',project_root:input.manifest.project_root,engine:{engine_version:'1',integrity_checksum:input.engineChecksum}}};
  const guard={schema_id:'dd-flow/import-guard@1',import_id:importId,status:'completed',source_manifest_sha256:input.snapshotSha256,runtime_home:home,project_root:project,workspace_root:project};
  const save=(file,value)=>writeFile(file,typeof value==='string'?value:JSON.stringify(value));
  await save(path.join(root,'fork.json'),fork);await save(lineageFile,lineage);await save(path.join(root,'.dd-flow-home.dd-flow-import.json'),guard);
  await save(path.join(retained,'snapshot.json'),manifestBytes);await save(path.join(retained,'stage-publication.json'),JSON.stringify(input.publication));await save(path.join(retained,'stage-engine-manifest.json'),engineBytes);
  const a=input.manifest.pack_stage_authority,visit={stage:a.stage,visit:a.visit,attempt:a.attempt,status:'done',outcome:a.outcome,result:a.result};
  const previous={...visit,visit:1,outcome:'revise',result:'run://plan-review/1/result.json'},next={stage:'code',visit:1,attempt:1,status:'running'};
  const state={schema_id:'dd-flow/run-state@1',run_id:'RUN-1',project_id:'PRJ-1',pack:{flow_id:'mb-sdlc',sha256:authority.pack_sha256},visits:[previous,visit,next],cursor:{stage:'code',visit:1}};
  const status={run:{id:'RUN-1',project_id:'PRJ-1',project_root:project,run_root:runHome},index:{run_id:'RUN-1',stage_runs:[],pack_state:state}};
  const request={managedRoot:root,fork,intent,projectId:'PRJ-1',status};
  assert.equal((await verifyBoundedForkAuthority(request)).pack.visit,2);
  await assert.rejects(verifyBoundedForkAuthority({...request,status:{...status,index:{...status.index,pack_state:{...state,cursor:{stage:'code',visit:2}}}}}),{code:'fork_authority_invalid'});
  await save(path.join(retained,'stage-publication.json'),'{}');
  await assert.rejects(verifyBoundedForkAuthority(request),{code:'fork_authority_invalid'});
});
