import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadCase,initialFlowBoundary,validateCaseBlueprint,interactionFixtureManifest,prepareE2EInput} from '../lib/runner.mjs';
import {readBaselineAdmissionPolicy} from '../lib/baseline-admission.mjs';

for(const flow of ['release','deploy','publish']) test(`authored ${flow} case preserves source and has one real isolated provider effect`,async t=>{
  const loaded=await loadCase(flow+'-authored-minimal'),contour=loaded.value.flow.contour;
  assert.deepEqual(initialFlowBoundary(loaded),{flow,stage:'preflight'});
  const blueprint=validateCaseBlueprint(JSON.parse(await readFile(path.join(loaded.root,'entry-pack-source/stage-context.json'))),loaded);
  assert.deepEqual(Object.keys(blueprint.stages),contour);
  assert.equal(loaded.assessment.status,'accepted');
  for(const stage of [...contour,'e2e']) {
    const scope=loaded.assessment.scopes[stage];
    assert(scope.note.includes('does not qualify remote'));
    for(const dimension of ['outcome','flow']) assert.equal(scope[dimension].reduce((sum,item)=>sum+item.weight,0),1);
    assert.equal(scope.golden.required_outcomes.length,3);
  }
  await interactionFixtureManifest(loaded.root,[{stage:'preflight',terminal_stage:'finish'}],null,contour);
  const root=await mkdtemp(path.join(os.tmpdir(),'delivery-case-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const project=path.join(root,'project'),target=path.join(root,'target');await mkdir(target);
  await prepareE2EInput({projectRoot:project,inputCheckpoint:loaded.inputCheckpoint,flowId:flow,integrationBranch:'main'});
  const git=(...args)=>execFileSync('git',['-C',project,...args]);
  const head=git('rev-parse','HEAD'),index=await readFile(path.join(project,'.git/index'));
  const baseline=await readBaselineAdmissionPolicy({caseRoot:loaded.root,definition:loaded.value.baseline_admission});
  const env={...process.env,DD_EVAL_DELIVERY_TARGET:target};delete env.NODE_TEST_CONTEXT;
  execFileSync(baseline.commands[0].command,baseline.commands[0].args,{cwd:project,env});
  // This is provider-program qualification only, not CLI authority/model proof.
  const call=action=>JSON.parse(execFileSync('node',['delivery.mjs',action,flow],{cwd:project,env,encoding:'utf8',stdio:['ignore','pipe','pipe']})||'null');
  assert.equal(call('result').status,'absent');
  call('execute');
  const observed=call('result');
  assert.equal(observed.status,'complete');assert.equal(observed.operation_id,'OPR-eval-'+flow);
  assert.equal(observed.artifact.sha256,createHash('sha256').update(await readFile(path.join(project,'candidate.tgz'))).digest('hex'));
  if(flow==='deploy') assert.equal(observed.rollback.status,'not_needed');
  assert.throws(()=>call('execute'));
  assert.deepEqual(git('rev-parse','HEAD'),head);assert.deepEqual(await readFile(path.join(project,'.git/index')),index);
  assert.equal(git('status','--porcelain').toString(),'');
});
