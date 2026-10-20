import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from 'node:crypto';
import { observeManagedRun, prepareManagedRun } from "../lib/managed-flow-client.mjs";

test('diagnostic preparation reuses public managed RUNs without mutation-route selectors', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-diagnostic-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  const bin=path.join(root,'cli.mjs'),calls=path.join(root,'calls.json'),intakeFile=path.join(root,'intake.md');
  const raw='Review actual implementation without repairs.\n';await writeFile(intakeFile,raw);
  for(const flow of ['mb-audit','project-review']) {
    const diagnostic={requestId:'diagnostic-request',intakeFile,intakeSha256:createHash('sha256').update(raw).digest('hex'),
      profile:'subject',stageProfiles:['review=critic'],workProfiles:['worker'],maxParallel:2};
    const receipt={run_id:'RUN-diagnostic',flow_id:flow,action:`flow_${flow.replaceAll('-','_')}_prepared`,request_id:diagnostic.requestId};
    const script=value=>`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2)));console.log(JSON.stringify(${JSON.stringify(value)}));`;
    await writeFile(bin,script(receipt));
    const input={bin,projectRoot:root,flow,diagnostic};
    assert.deepEqual(await prepareManagedRun(input),receipt);
    const args=JSON.parse(await readFile(calls));
    assert.deepEqual(args.slice(0,2),['flow',flow]);
    for(const flag of ['--prepare-only','--non-interactive','--request-id','--intake-file','--stage-profile','--work-profile'])assert(args.includes(flag));
    for(const flag of ['--git-route','--workspace-root','--integration-branch','--intake-sha256','launch','init','upgrade'])assert(!args.includes(flag));
    await rm(calls);
    for(const change of [{diagnostic:undefined},{memoryInit:{}},{memoryUpgrade:{}},{executionRoutingFile:'routing.json'},
      {flow:'sdlc'},{flow:'mb-init'},{diagnostic:{...diagnostic,gitRoute:'feature_worktree'}},
      {diagnostic:{...diagnostic,profileFile:'other'}},{diagnostic:{...diagnostic,intakeSha256:'0'.repeat(64)}},
      ...[0,65,1.5,null].map(maxParallel=>({diagnostic:{...diagnostic,maxParallel}}))]) {
      await assert.rejects(prepareManagedRun({...input,...change}),{code:'managed_flow_input_invalid'});
      await assert.rejects(readFile(calls),{code:'ENOENT'});
    }
    for(const change of [{flow_id:'sdlc'},{action:'flow_mb_init_prepared'},{request_id:'foreign'},{controller:{}}]) {
      await writeFile(bin,script({...receipt,...change}));
      await assert.rejects(prepareManagedRun(input),{code:'controller_receipt_invalid'});
    }
  }
});

test('Memory reconciles only an explicitly allocated original request, once, without replacement or dispatch', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'memory-reconcile-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bin=path.join(root,'cli.mjs'),calls=path.join(root,'calls.json');
  for(const flow of ['mb-init','mb-upgrade']) {
    const memory={workspaceRoot:root,requestId:'original',intakeFile:path.join(root,'intake'),intakeSha256:'a'.repeat(64),
      gitRoute:'integration_branch_direct',integrationBranch:'main',profile:'fast'};
    const input={bin,projectRoot:root,flow,[flow==='mb-init'?'memoryInit':'memoryUpgrade']:memory};
    const partial={code:'run_start_incomplete',message:'Reconcile original allocation',details:{
      effect:'partial',reason:'git_observation_failed',run_id:'RUN-original',request_id:'original',next_action:'reconcile_exact_request'}};
    const receipt={run_id:'RUN-original',flow_id:flow,action:flow==='mb-init'?'flow_mb_init_prepared':'flow_mb_upgrade_prepared',request_id:'original'};
    const install=async(error=partial,result=receipt,alwaysFail=false)=>{
      await rm(calls,{force:true});
      await writeFile(bin,`import fs from 'node:fs';const file=${JSON.stringify(calls)};
const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];calls.push(process.argv.slice(2));fs.writeFileSync(file,JSON.stringify(calls));
if(calls.length===1 || ${alwaysFail}) {console.log(JSON.stringify({ok:false,error:${JSON.stringify(error)}}));process.exit(1);}
console.log(JSON.stringify(${JSON.stringify(result)}));`);
    };
    await install();assert.deepEqual(await prepareManagedRun(input),receipt);
    const actual=JSON.parse(await readFile(calls));assert.equal(actual.length,2);assert.deepEqual(actual[0],actual[1]);
    assert(actual[0].includes('--prepare-only'));assert(!actual[0].includes('launch'));
    for(const change of [{effect:'no_effect'},{effect:'unknown'},{request_id:'foreign'},{run_id:''},
      {next_action:'start_new_request'},{authority_truncated:true}]) {
      await install({...partial,details:{...partial.details,...change}});
      await assert.rejects(prepareManagedRun(input),{code:'run_start_incomplete'});
      assert.equal(JSON.parse(await readFile(calls)).length,1);
    }
    await install({...partial,code:'command_observation_lost'});
    await assert.rejects(prepareManagedRun(input),{code:'command_observation_lost'});
    assert.equal(JSON.parse(await readFile(calls)).length,1);
    await install(partial,{...receipt,run_id:'RUN-replacement'});
    await assert.rejects(prepareManagedRun(input),{code:'controller_receipt_invalid'});
    await install(partial,receipt,true);
    await assert.rejects(prepareManagedRun(input),{code:'run_start_incomplete'});
    assert.equal(JSON.parse(await readFile(calls)).length,2);
  }
});

test('upgrade uses its public CLI with exact native selectors, never init or an implicit migration apply',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'managed-upgrade-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bin=path.join(root,'cli.mjs'),calls=path.join(root,'calls.json');
  const memoryUpgrade={workspaceRoot:root,requestId:'upgrade-request',intakeFile:path.join(root,'intake.txt'),intakeSha256:'a'.repeat(64),
    gitRoute:'integration_branch_direct',integrationBranch:'main',profile:'fast',stageProfiles:['diff-analysis=independent'],
    delegation:'native',allowLiveProbe:true,nativeConfigHome:path.join(root,'private-native'),maxParallel:2};
  const receipt={run_id:'RUN-upgrade',flow_id:'mb-upgrade',action:'flow_mb_upgrade_prepared',request_id:memoryUpgrade.requestId};
  const script=value=>`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2)));console.log(JSON.stringify(${JSON.stringify(value)}));`;
  await writeFile(bin,script(receipt));
  const input={bin,projectRoot:root,flow:'mb-upgrade',memoryUpgrade};
  assert.deepEqual(await prepareManagedRun(input),receipt);
  const args=JSON.parse(await readFile(calls));assert.equal(args[0],'upgrade');assert(args.includes('--prepare-only'));
  for(const value of ['native','--allow-live-probe',memoryUpgrade.nativeConfigHome,'diff-analysis=independent'])assert(args.includes(value));
  assert(!args.includes('init'));assert(!args.includes('apply'));assert(!args.includes('transition'));
  await rm(calls);
  for(const change of [{memoryUpgrade:undefined},{memoryInit:memoryUpgrade},{flow:'mb-init'},{flow:'sdlc'},
    {memoryUpgrade:{...memoryUpgrade,maxParallel:0}},{memoryUpgrade:{...memoryUpgrade,unexpected:true}}]) {
    await assert.rejects(prepareManagedRun({...input,...change}),{code:'managed_flow_input_invalid'});
    await assert.rejects(readFile(calls),{code:'ENOENT'});
  }
  for(const changed of [{flow_id:'mb-init'},{action:'flow_mb_init_prepared'},{request_id:'other'},{controller:{}}]) {
    await writeFile(bin,script({...receipt,...changed}));
    await assert.rejects(prepareManagedRun(input),{code:'controller_receipt_invalid'});
  }
});

test("Memory preparation uses public init without SDLC routing or Session dispatch", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-memory-prepare-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs'), calls = path.join(root, 'calls.json');
  const memoryInit = { workspaceRoot: root, requestId: 'memory-request', intakeFile: path.join(root, 'intake.txt'), intakeSha256: 'a'.repeat(64), gitRoute: 'integration_branch_direct', integrationBranch: 'main', profileFile: path.join(root, 'profile.json'), stageProfiles: ['review=independent'], workProfiles: ['worker'] };
  await writeFile(bin, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({run_id:'RUN-memory',flow_id:'mb-init',action:'flow_mb_init_prepared',request_id:'memory-request'}));`);
  const input = { bin, projectRoot: root, flow: 'mb-init', memoryInit };
  assert.equal((await prepareManagedRun(input)).run_id, 'RUN-memory');
  const args = JSON.parse(await readFile(calls));
  assert.equal(args[0], 'init'); assert(args.includes('--prepare-only')); assert(args.includes('--non-interactive'));
  assert(!args.includes('prepare-vnext-specify')); assert(!args.includes('--execution-routing-file'));
  assert(!args.includes('--max-parallel'));
  for (const limit of [1, 2, 256]) {
    await prepareManagedRun({ ...input, memoryInit: { ...memoryInit, maxParallel: limit } });
    const selected = JSON.parse(await readFile(calls));
    assert.equal(selected[selected.indexOf('--max-parallel') + 1], String(limit));
  }
  for (const value of ['memory-request', memoryInit.intakeFile, memoryInit.profileFile, 'review=independent', 'worker']) assert(args.includes(value));
  await prepareManagedRun({ ...input, memoryInit: { ...memoryInit, delegation: 'native', allowLiveProbe: true, nativeConfigHome: path.join(root, 'private-config'), maxParallel: 2 } });
  const nativeArgs = JSON.parse(await readFile(calls));
  assert.equal(nativeArgs[nativeArgs.indexOf('--delegation') + 1], 'native');
  assert.equal(nativeArgs[nativeArgs.indexOf('--native-config-home') + 1], path.join(root, 'private-config'));
  assert.equal(nativeArgs.filter(arg => arg === '--allow-live-probe').length, 1);
  await rm(calls);
  for (const maxParallel of [null, 0, -1, 1.5, 257, '2', NaN]) {
    await assert.rejects(prepareManagedRun({ ...input, memoryInit: { ...memoryInit, maxParallel } }), { code: 'managed_flow_input_invalid', details: { effect: 'no_effect' } });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
  for (const changed of [{ flow: 'unknown' }, { memoryInit: undefined }, { memoryInit: { ...memoryInit, unexpected: true } }, { memoryInit: { ...memoryInit, workProfiles: 'worker' } }, { flow: 'sdlc' }]) {
    await assert.rejects(prepareManagedRun({ ...input, ...changed }), { code: 'managed_flow_input_invalid' });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
  for (const receipt of [{ run_id: 'RUN', flow_id: 'sdlc' }, { run_id: 'RUN', flow_id: 'mb-init', action: 'flow_mb_init_prepared', request_id: 'other' }, { run_id: 'RUN', flow_id: 'mb-init', action: 'flow_mb_init_prepared', request_id: 'memory-request', controller: {} }]) {
    await writeFile(bin, `console.log(JSON.stringify(${JSON.stringify(receipt)}));`);
    await assert.rejects(prepareManagedRun(input), { code: 'controller_receipt_invalid' });
  }
});

for (const callback of ['onEvent', 'answerFor']) for (const retainedDetails of [false, true]) test(`callback ${callback} retains last observed owner without replacing primary error (${retainedDetails ? 'existing evidence' : 'new evidence'})`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs');
  const controller = { controller_id: 'DRV', status: callback === 'answerFor' ? 'waiting_for_user' : 'running', stage: 'plan', sessions: [{ session_id: 'native', journal: path.join(root, 'native.jsonl') }] };
  await writeFile(bin, `const args=process.argv.slice(2);console.log(JSON.stringify(args[1]==='status'?{index:{stage_runs:[{stage:'plan',status:'paused',pause:{id:'pause'}}]}}:${JSON.stringify({ controller, events: [{ sequence: 1, type: 'session_created', data: {} }] })}));`);
  const existingController = { controller_id: 'original-error-owner' }, existingObservation = { cursor: 42, provenance: 'existing' };
  const primary = Object.assign(new Error('callback failed'), { code: 'fixture_gap', details: { cause: { code: 'original' }, ...(retainedDetails ? { controller: existingController, observation: existingObservation } : {}) } });
  await assert.rejects(observeManagedRun({ bin, projectRoot: root, runId: 'RUN', controllerId: 'DRV', requestId: 'request', [callback]: async () => { throw primary; } }), error => {
    assert.equal(error, primary);
    assert.deepEqual(error.details.controller, retainedDetails ? existingController : controller);
    assert.equal(error.details.cause.code, 'original');
    assert.equal(error.details.observation.provenance, retainedDetails ? 'existing' : 'last_validated_observation');
    assert.equal(error.details.observation.cursor, retainedDetails ? 42 : callback === 'onEvent' ? 0 : 1);
    return true;
  });
});
import { recordOperation, readEvents, reduceEvents, completeOperation } from "../lib/runner-events.mjs";
import { executionState } from "../lib/execution-state.mjs";

const fixture = `import fs from 'node:fs';
const args=process.argv.slice(2), root=process.env.TEST_MANAGED_ROOT;
fs.appendFileSync(root+'/calls.jsonl',JSON.stringify(args)+'\\n');
const stateFile=root+'/state.json';
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)): {step:0};
const controller={controller_id:'DRV-fixture',stage:'plan',sessions:[{session_id:'native',stopped:true}]};
let result;
if(args[0]!=='run') throw new Error('eval must not call native adapters');
if(args[1]==='status') result={index:{stage_runs:[process.env.TEST_MANAGED_ANSWER_RACE?
  {stage:'plan',status:process.env.TEST_MANAGED_ANSWER_RACE,...(process.env.TEST_MANAGED_ANSWER_RACE==='paused'?{pause:{id:'PAUSE-1'}}:{})}:
  {stage:'plan',status:'paused',pause:{id:'PAUSE-1'}}]}};
else if(args[1]==='drive' && args[2]==='launch') result={controller};
else if(args[1]==='drive' && args[2]==='context') {state.context=true;result={ok:true};}
else if(args[1]==='drive' && args[2]==='answer') {state.answer=fs.readFileSync(args[args.indexOf('--answer-file')+1],'utf8');result={ok:true};}
else if(args[1]==='drive' && args[2]==='status') {
  if(process.env.TEST_MANAGED_LOST==='1') {console.log(JSON.stringify({ok:false,error:{code:'rpc_timeout',message:'observer lost'}}));process.exit(1);}
  if(process.env.TEST_MANAGED_CONTROL==='1') {
    console.log(JSON.stringify({controller:{...controller,status:'control_requested'},events:[]}));process.exit(0);
  }
  if(process.env.TEST_MANAGED_ANSWER_RACE) {
    result={controller:{...controller,status:'waiting_for_user'},events:process.env.TEST_MANAGED_ACCEPTED==='0'?[]:
      (Number(args[args.indexOf('--after')+1]) < 1 ? [{sequence:1,type:'answer_accepted',data:{pause_id:'PAUSE-1'}}] : [])};
    result.events = result.events.filter(e=>e.sequence>Number(args[args.indexOf('--after')+1]));
    console.log(JSON.stringify(result));process.exit(0);
  }
  if(process.env.TEST_MANAGED_REVIEW==='1') {
    result={controller:{...controller,status:'waiting_for_context'},events:[
      ...(process.env.TEST_MANAGED_CAPTURE==='0'?[]:[{sequence:1,type:'boundary_captured',data:{stage:'specify',manifest:'review-manifest'}}]),
      {sequence:2,type:'context_required',data:{stage:'protocolize',attempt:1}}]};
    result.events = result.events.filter(e=>e.sequence>Number(args[args.indexOf('--after')+1]));
    console.log(JSON.stringify(result));process.exit(0);
  }
  if(process.env.TEST_MANAGED_REATTACH==='1') {
    const after=Number(args[args.indexOf('--after')+1]);
    result={controller:{...controller,status:'stop_target_reached'},events:after===0?
      Array.from({length:100},(_,i)=>({sequence:i+1,type:i===0?'context_required':'session_created',data:{stage:'plan',attempt:1}})):
      [{sequence:101,type:'context_accepted',data:{stage:'plan'}},{sequence:102,type:'boundary_captured',data:{stage:'plan',manifest:'retained-manifest'}}]};
    console.log(JSON.stringify(result));process.exit(0);
  }
  state.step++;
  if(!state.context) result={controller:{...controller,status:'waiting_for_context'},events:[{sequence:1,type:'context_required',data:{stage:'plan',attempt:1}}]};
  else if(!state.answer) {
    if(!state.context) throw new Error('context missing');
    result={controller:{...controller,status:'waiting_for_user'},events:[{sequence:2,type:'session_created',data:{stage:'plan',session_id:'native'}}]};
  } else {
    if(state.answer!=='raw answer\\n') throw new Error('raw answer changed');
    result={controller:{...controller,status:'stop_target_reached'},events:[{sequence:3,type:'boundary_captured',data:{stage:'plan',manifest:'fixture-manifest'}}]};
  }
  result.events = result.events.filter(e=>e.sequence>Number(args[args.indexOf('--after')+1]));
} else throw new Error('unexpected command '+JSON.stringify(args));
fs.writeFileSync(stateFile,JSON.stringify(state));console.log(JSON.stringify(result));
`;

for (const status of ['running', 'recovery_required']) test(`repair continuation and primary cause survive managed observation (${status})`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-repair-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs');
  const continuation = { schema_id: 'dd-flow/continuation@1', kind: 'repair_required', work_id: 'WRK-repair', identity: 'intent', stage: 'code', attempt: 'try-001' };
  const error = { code: 'input_file_missing', message: 'Original objective missing', details: { phase: 'prepare', effect: 'no_effect', hook_event_id: 42, cause: { code: 'code_gate_failed' } } };
  await writeFile(bin, `console.log(JSON.stringify(${JSON.stringify({ controller: { controller_id: 'DRV-repair', stage: 'code', status, ...(status === 'recovery_required' ? { error } : {}) }, events: [{ sequence: 1, type: 'lifecycle_outcome', data: { error: { code: 'code_gate_failed', details: { continuation } } } }] })}));`);
  const events = [];
  const input = { bin, env: process.env, projectRoot: root, runId: 'RUN', controllerId: 'DRV-repair', observeOnce: true, onEvent: async event => events.push(event) };
  if (status === 'running') assert.equal((await observeManagedRun(input)).controller.status, 'running');
  else await assert.rejects(observeManagedRun(input), failure => {
    assert.equal(failure.code, error.code);
    assert.deepEqual(failure.details.controller.error, error);
    return true;
  });
  assert.deepEqual(events[0].data.error.details.continuation, continuation);
});

for (const status of ['running', 'control_requested', 'recovery_required']) test(`unknown native outcome cannot mask an issued owner fence (${status})`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-unknown-fence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs');
  const error = { code: 'operation_observation_lost', message: 'session.create reply lost', details: { native_outcome: { status: 'unknown', operation_id: 'OPR-existing' } } };
  const controller = { controller_id: 'DRV-existing', status, error,
    control: { control_id: 'CTL-existing', generation: 1, request_sequence: 61, settlement: { settled: false } } };
  await writeFile(bin, `if(process.argv[2]!=='run'||process.argv[3]!=='drive'||process.argv[4]!=='status')throw Error('duplicate dispatch');console.log(JSON.stringify(${JSON.stringify({ controller, events: [] })}));`);
  const input = { bin, env: process.env, projectRoot: root, runId: 'RUN', controllerId: controller.controller_id, observeOnce: true };
  if (status === 'running') assert.equal((await observeManagedRun(input)).controller.status, 'running');
  else await assert.rejects(observeManagedRun(input), failure => {
    assert.equal(failure.code, status === 'control_requested' ? 'managed_run_controlled' : 'managed_run_interrupted');
    assert.deepEqual(failure.details.controller, controller);
    return true;
  });
});

for (const slow of [false, true]) for (const unknown of [false, true]) test(`input preparation observes failure and never dispatches late input (slow: ${slow}, unknown: ${unknown})`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-input-fence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs'), stop = path.join(root, 'stopped');
  await writeFile(bin, `import fs from 'node:fs';
    const args=process.argv.slice(2), after=Number(args[args.indexOf('--after')+1]);
    if(args[2]!=='status') throw new Error('unexpected dispatch');
    const stopped=fs.existsSync(${JSON.stringify(stop)});
    console.log(JSON.stringify({controller:{controller_id:'DRV',stage:'plan',status:stopped?${JSON.stringify(unknown ? 'recovery_required' : 'control_requested')}:'waiting_for_context',...(stopped?{error:{code:${JSON.stringify(unknown ? 'operation_observation_lost' : 'write_transaction_failed')},message:'storage failed'}}:{})},
      events: stopped ? (after<2?[{sequence:2,type:'recovery_required',data:{}}]:[]) : (after<1?[{sequence:1,type:'context_required',data:{stage:'plan',attempt:1}}]:[])}));`);
  const delivered = []; let actions = 0;
  await assert.rejects(observeManagedRun({ bin, projectRoot: root, runId: 'RUN', controllerId: 'DRV', requestId: 'request', pollMs: 50,
    onEvent: event => { delivered.push(event.sequence); },
    contextFor: async () => { actions++; await writeFile(stop, 'yes'); return slow ? new Promise(() => {}) : { file: '/must-not-send', sha256: 'unused' }; },
    beforeDispatch: () => assert.fail('input crossed the stop fence'),
  }), { code: unknown ? 'managed_run_interrupted' : 'write_transaction_failed', message: 'storage failed' });
  assert.deepEqual(delivered, [1, 2]);
  assert.equal(actions, 1);
});

test('missing authorized HITL answer preserves the pause without sending a turn or answer', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-no-answer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs');
  await writeFile(bin, fixture);
  for (const answerFor of [undefined, async () => null]) {
    const result = await observeManagedRun({ bin,
      env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_ANSWER_RACE: 'paused', TEST_MANAGED_ACCEPTED: '0' },
      projectRoot: root, runId: 'RUN-fixture', controllerId: 'DRV-fixture', requestId: 'reattach', answerFor,
      beforeDispatch: async () => assert.fail('no answer is authorized') });
    assert.deepEqual(result.pending_answer, { pause_id: 'PAUSE-1' });
    assert.equal(result.controller.status, 'waiting_for_user');
  }
  const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(args => args[1] === 'status' || (args[1] === 'drive' && args[2] === 'status')));
});

test('accepted controller HITL can outlive model quiet windows without a native prompt', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-hitl-clock-')); t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs'); await writeFile(bin, fixture);
  const original = Date.now; let advance = 0;
  Date.now = () => original() + advance;
  t.after(() => { Date.now = original; });
  const result = await observeManagedRun({ bin, env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_ANSWER_RACE: 'paused', TEST_MANAGED_ACCEPTED: '0' },
    projectRoot: root, runId: 'RUN-fixture', controllerId: 'DRV-fixture', requestId: 'reattach', pollMs: 25,
    answerFor: async () => { advance = 8 * 60 * 60_000; await new Promise(resolve => setTimeout(resolve, 150)); return null; },
    beforeDispatch: () => assert.fail('no operator answer was accepted') });
  assert.equal(result.controller.status, 'waiting_for_user');
  const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(args => args[0] === 'run' && (args[1] === 'status' || args[2] === 'status')));
});

for (const stageStatus of ['running', 'done', 'paused', 'failed']) {
  for (const accepted of [true, false]) test(`HITL observation reconciles accepted answer: ${stageStatus}, accepted=${accepted}`, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'managed-answer-race-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const bin = path.join(root, 'cli.mjs');
    await writeFile(bin, fixture);
    const input = { bin, env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_ANSWER_RACE: stageStatus, TEST_MANAGED_ACCEPTED: accepted ? '1' : '0' },
      projectRoot: root, runId: 'RUN-fixture', controllerId: 'DRV-fixture', requestId: 'reattach', observeOnce: true,
      answerFor: async () => assert.fail('accepted answer must not be authored again'),
      beforeDispatch: async () => assert.fail('observation must not dispatch') };
    if (accepted && stageStatus !== 'failed') {
      assert.equal((await observeManagedRun(input)).controller.status, 'waiting_for_user');
    } else if (stageStatus !== 'paused') {
      await assert.rejects(observeManagedRun(input), { code: 'hitl_pause_invalid' });
    } else {
      let questions = 0;
      await assert.rejects(observeManagedRun({ ...input, answerFor: async () => { questions++; throw new Error('new question'); } }), /new question/);
      assert.equal(questions, 1);
    }
  });
}

test('operator control suspends the retained operation without terminal failure or replay', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-controlled-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs'), eventsFile = path.join(root, 'events.jsonl');
  await writeFile(bin, fixture);
  const runId = 'EVAL-control', execution = { id: 'one', stage: 'plan' }, operationId = `${runId}:one:launch`;
  const operation = { eventsFile, source: 'dd-eval://runner', runId, executionId: execution.id, operationId, operation: 'execution.one.launch' };
  const unexpected = async () => assert.fail('operator pause cannot dispatch, answer HITL or author context');
  await assert.rejects(recordOperation({ ...operation, action: () => observeManagedRun({ bin,
    env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_CONTROL: '1' }, projectRoot: root, runId: 'RUN-fixture',
    controllerId: 'DRV-fixture', requestId: 'retained', contextFor: unexpected, answerFor: unexpected, beforeDispatch: unexpected }) }), { code: 'managed_run_controlled' });
  const events = await readEvents(eventsFile), state = executionState(events, runId, execution);
  assert.equal(reduceEvents(events).operations[operationId].terminal, null);
  assert.equal(events.some(event => event.type.endsWith('.failed')), false);
  assert.equal(state.result.state, 'awaiting_provider');
  assert.equal(state.result.control.controller_id, 'DRV-fixture');
  assert.equal(state.result.code, 'managed_run_controlled');
  await assert.rejects(recordOperation({ ...operation, action: unexpected }), { code: 'operation_in_progress' });
  // A later reconciled boundary completes the SAME operation, not a retry.
  await completeOperation({ ...operation, result: { execution: execution.id, state: 'candidate_ready' } });
  assert.equal(executionState(await readEvents(eventsFile), runId, execution).result.state, 'candidate_ready');
  const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(0, 3), ['run', 'drive', 'status']);
});

for (const lost of [false, true]) test(`managed client observes the CLI and never owns provider turns (observer loss: ${lost})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "managed-client-"));
  try {
    const bin = path.join(root, "cli.mjs"), contextFile = path.join(root, "contexts.json"), answer = path.join(root, "answer.md");
    await writeFile(bin, fixture); await writeFile(contextFile, "{}"); await writeFile(answer, "raw answer\n");
    const events = []; let admissions = 0;
    const input = { bin, env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_LOST: lost ? "1" : "0" }, projectRoot: root, runId: "RUN-fixture", requestId: "test-launch", contextFile, stopAfter: "plan", captureRoot: path.join(root, "captures"), pollMs: 0,
      contextFor: async stage => { assert.equal(stage, "plan"); return { file: contextFile, sha256: "a".repeat(64) }; },
      answerFor: async stage => { assert.equal(stage.pause.id, "PAUSE-1"); return answer; },
      onEvent: async event => events.push(event.type), beforeDispatch: async () => { admissions++; } };
    if (lost) await assert.rejects(observeManagedRun(input), { code: "rpc_timeout" });
    else {
      const result = await observeManagedRun(input);
      assert.equal(result.controller.status, "stop_target_reached");
      assert.equal(result.boundary.stage, "plan");
      assert.deepEqual(events, ["context_required", "session_created", "boundary_captured"]);
      assert.equal(admissions, 3);
    }
    const calls = (await readFile(path.join(root, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(calls.filter(args => args[2] === "launch").length, 1);
    assert.ok(calls.every(args => args[0] === "run" && ["drive", "status"].includes(args[1])));
    if (lost) assert.equal(calls.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reattach drains historical pages without launch or context replay and checks owner', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-reattach-'));
  try {
    const bin = path.join(root, 'cli.mjs');
    await writeFile(bin, fixture);
    const unexpected = async () => assert.fail('reattach must not dispatch historical work');
    const input = { bin, env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_REATTACH: '1' }, projectRoot: root,
      runId: 'RUN-fixture', requestId: 'test-launch', controllerId: 'DRV-fixture', pollMs: 0,
      contextFor: unexpected, answerFor: unexpected, beforeDispatch: unexpected };
    const result = await observeManagedRun(input);
    assert.equal(result.cursor, 102);
    assert.equal(result.boundary.manifest, 'retained-manifest');
    await assert.rejects(observeManagedRun({ ...input, controllerId: 'DRV-other' }), { code: 'controller_owner_changed' });
    const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(args => args[1] === 'drive' && args[2] === 'status'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('manual boundary review leaves the same controller waiting without dispatch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-review-'));
  try {
    const bin = path.join(root, 'cli.mjs'); await writeFile(bin, fixture);
    const input = { bin, env: { TEST_MANAGED_ROOT: root, TEST_MANAGED_REVIEW: '1' }, projectRoot: root,
      runId: 'RUN-fixture', requestId: 'reference-launch', controllerId: 'DRV-fixture', pollMs: 0,
      contextFor: async stage => { assert.equal(stage, 'protocolize'); return null; },
      beforeDispatch: async () => assert.fail('manual review must not dispatch') };
    for (let retry = 0; retry < 2; retry++) {
      const result = await observeManagedRun(input);
      assert.equal(result.controller.controller_id, 'DRV-fixture');
      assert.equal(result.boundary.manifest, 'review-manifest');
      assert.deepEqual(result.pending_context, { stage: 'protocolize', attempt: 1 });
    }
    await assert.rejects(observeManagedRun({ ...input, env: { ...input.env, TEST_MANAGED_CAPTURE: '0' } }), { code: 'controller_boundary_missing' });
    const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 6); // Initial observation and post-callback fence for each call.
    assert.ok(calls.every(args => args[1] === 'drive' && args[2] === 'status'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('one observation detaches without cancelling and reattaches to the same controller', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-detach-'));
  try {
    const bin = path.join(root, 'cli.mjs'), contextFile = path.join(root, 'context.json'), answer = path.join(root, 'answer.md');
    await writeFile(bin, fixture); await writeFile(contextFile, '{}'); await writeFile(answer, 'raw answer\n');
    const input = { bin, env: { TEST_MANAGED_ROOT: root }, projectRoot: root, runId: 'RUN-fixture',
      requestId: 'detach-launch', contextFile, stopAfter: 'plan', captureRoot: path.join(root, 'captures'), pollMs: 0,
      contextFor: async () => ({ file: contextFile, sha256: 'a'.repeat(64) }), answerFor: async () => answer };
    const detached = await observeManagedRun({ ...input, observeOnce: true });
    assert.equal(detached.controller.controller_id, 'DRV-fixture');
    assert.equal(detached.cursor, 1);
    assert.equal(detached.boundary, null);
    const completed = await observeManagedRun({ ...input, controllerId: detached.controller.controller_id });
    assert.equal(completed.controller.status, 'stop_target_reached');
    const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter(args => args[2] === 'launch').length, 1);
    assert.ok(calls.every(args => args[0] === 'run' && ['drive', 'status'].includes(args[1])));
  } finally { await rm(root, { recursive: true, force: true }); }
});
