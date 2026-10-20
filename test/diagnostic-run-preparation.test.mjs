import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import {initialFlowBoundary,prepareCaseManagedRun,prepareE2EInput,validateRunProfile} from '../lib/runner.mjs';
import {materializeOperationalDecision} from '../lib/operational-decision.mjs';

test('diagnostic profiles reuse installed canon setup without Memory mutation/native routing',async()=>{
  const schema=new Ajv2020({strict:false}).compile(JSON.parse(await readFile(new URL('../schemas/run-profile.v1.schema.json',import.meta.url))));
  const profile={schema_id:'dd-eval/run-profile@1',id:'diagnostic',case_id:'diagnostic-case',subject:{profile_id:'subject',
    memory_setup:{canonSource:'/release',trustFile:'/trust'},diagnostic:{profile:'local',maxParallel:64}},
    selection:{focused_stages:[],segment:null,e2e:true,repetitions:1},judge:{enabled:false},concurrency:{global:1},
    failure_policy:{stop_execution_on_unexpected_hitl:true,stop_execution_on_unmatched_hitl:true}};
  assert(schema(profile),JSON.stringify(schema.errors));assert.equal(validateRunProfile(profile),profile);
  const ajv=new Ajv2020({strict:false});ajv.addSchema(JSON.parse(await readFile(new URL('../schemas/run-profile.v1.schema.json',import.meta.url))));
  const modern=ajv.compile(JSON.parse(await readFile(new URL('../schemas/run-profile.v2.schema.json',import.meta.url))));
  assert(modern({...profile,schema_id:'dd-eval/run-profile@2'}),JSON.stringify(modern.errors));
  for(const subject of [{...profile.subject,memory_init:{profile:'local'}},{...profile.subject,memory_upgrade:{profile:'local'}},
    {...profile.subject,execution:{}},{...profile.subject,memory_setup:undefined},
    ...[{maxParallel:65},{delegation:'native'},{allowLiveProbe:true},{nativeConfigHome:'/native'},{profileFile:'/other'}]
      .map(change=>({...profile.subject,diagnostic:{...profile.subject.diagnostic,...change}}))]) {
    const changed=JSON.parse(JSON.stringify({...profile,subject}));
    assert.equal(schema(changed),false,JSON.stringify(changed));assert.throws(()=>validateRunProfile(changed));
    assert.equal(modern({...changed,schema_id:'dd-eval/run-profile@2'}),false);
  }
});

for(const flow of ['mb-audit','project-review']) for(const withBank of [false,true]) test(`${flow} materializes original product without a flow overlay (bank: ${withBank})`,async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'diagnostic-materialize-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),target=path.join(root,'project');await mkdir(source);
  const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
  git('-c','init.templateDir=','init','--quiet','--initial-branch=main');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
  await writeFile(path.join(source,'code.js'),'export const actual = 1;\n');
  if(withBank) {await mkdir(path.join(source,'.memory-bank/dd-flow'),{recursive:true});await writeFile(path.join(source,'.memory-bank/index.md'),'Original legacy facts\n');await writeFile(path.join(source,'.memory-bank/dd-flow/legacy.txt'),'Original project pack\n');}
  git('add','.');git('commit','--quiet','-m','original product');const commit=git('rev-parse','HEAD');
  const inputCheckpoint={value:{source:{repository:source,commit},flow_pack:{delivery:'installed_canon',repository:path.join(root,'canon-not-an-overlay')}}};
  const result=await prepareE2EInput({projectRoot:target,inputCheckpoint,flowId:flow});
  assert.equal(result.source_commit,commit);assert.equal(execFileSync('git',['-C',target,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
  assert.equal(await readFile(path.join(target,'code.js'),'utf8'),'export const actual = 1;\n');
  if(withBank) {
    assert.equal(await readFile(path.join(target,'.memory-bank/index.md'),'utf8'),'Original legacy facts\n');
    assert.equal(await readFile(path.join(target,'.memory-bank/dd-flow/legacy.txt'),'utf8'),'Original project pack\n');
  } else await assert.rejects(readFile(path.join(target,'.memory-bank/index.md')),{code:'ENOENT'});
});

for(const flow of ['mb-audit','project-review']) test(`${flow} case prepares original intake without a Git mutation policy or SDLC materialization`,async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'case-diagnostic-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'entry-pack-source'),projectRoot=path.join(root,'project');await mkdir(source);await mkdir(projectRoot);
  const intake=Buffer.from('Inspect actual code. Do not repair the project.\r\n'),intakeFile=path.join(source,'request.txt');await writeFile(intakeFile,intake);
  await writeFile(path.join(projectRoot,'code.js'),'export const actual = 1;\n');
  const digest=createHash('sha256').update(intake).digest('hex');
  const calls=path.join(root,'calls.jsonl'),bin=path.join(root,'cli.mjs');
  const flowPack={delivery:'installed_canon',commit:'b'.repeat(40),memory_bank_version:'fixture',engine:{version:'fixture'}};
  const setup={installation_readiness:'installed',installation:{manifest:{canon:{commit:flowPack.commit,version:'fixture'},engine:{version:'fixture'}}}};
  await writeFile(bin,`import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
console.log(JSON.stringify(args[0]==='setup'?${JSON.stringify(setup)}:{run_id:'RUN-diagnostic',flow_id:${JSON.stringify(flow)},action:${JSON.stringify(`flow_${flow.replaceAll('-','_')}_prepared`)},request_id:args[args.indexOf('--request-id')+1]}));`);
  const contour=flow==='mb-audit'?['preflight','audit','review','report']:['preflight','analyze','review','report'];
  const loaded={root,inputCheckpoint:{value:{flow_pack:flowPack}},value:{flow:{id:flow,contour,terminal_stage:'report'}}};
  assert.deepEqual(initialFlowBoundary(loaded),{flow,stage:'preflight'});
  const blueprint={stages:{preflight:{task_input:[{role:'initial_user_request',source:'request.txt',path:'.dd-eval/request.txt',sha256:digest}]}}};
  const runProfile={value:{subject:{memory_setup:{canonSource:path.join(root,'release'),trustFile:path.join(root,'trust')},diagnostic:{profile:'local'}}}};
  const input={loaded,blueprint,runProfile,scopeId:'owned-execution',projectRoot,bin,env:{DD_FLOW_HOME:path.join(root,'runtime')},executionRoutingFile:path.join(root,'unused-routing')};
  for(const change of [{maxParallel:65},{delegation:'native'},{allowLiveProbe:true}]) {
    await assert.rejects(prepareCaseManagedRun({...input,runProfile:{value:{subject:{...runProfile.value.subject,diagnostic:{profile:'local',...change}}}}}));
    await assert.rejects(readFile(calls),{code:'ENOENT'});
  }
  assert.equal(await materializeOperationalDecision({flowId:flow,projectRoot,runtimeRoot:path.join(root,'runtime')}),null);
  assert.equal((await prepareCaseManagedRun(input)).run_id,'RUN-diagnostic');
  const commands=(await readFile(calls,'utf8')).trim().split('\n').map(value=>JSON.parse(value));
  assert.equal(commands.length,2);assert.equal(commands[0][0],'setup');assert.deepEqual(commands[1].slice(0,2),['flow',flow]);
  const args=commands[1];assert.equal(args[args.indexOf('--intake-file')+1],intakeFile);
  assert(args[args.indexOf('--request-id')+1].startsWith('diagnostic-'));
  for(const flag of ['--git-route','--workspace-root','--integration-branch','--execution-routing-file'])assert(!args.includes(flag));
  assert.equal(await readFile(path.join(projectRoot,'code.js'),'utf8'),'export const actual = 1;\n');
  await assert.rejects(readFile(path.join(projectRoot,'.memory-bank/index.md')),{code:'ENOENT'});
});
