import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { observeManagedRun } from "../lib/managed-flow-client.mjs";
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
if(args[1]==='status') result={index:{stage_runs:[{stage:'plan',status:'paused',pause:{id:'PAUSE-1'}}]}};
else if(args[1]==='drive' && args[2]==='launch') result={controller};
else if(args[1]==='drive' && args[2]==='context') {state.context=true;result={ok:true};}
else if(args[1]==='drive' && args[2]==='answer') {state.answer=fs.readFileSync(args[args.indexOf('--answer-file')+1],'utf8');result={ok:true};}
else if(args[1]==='drive' && args[2]==='status') {
  if(process.env.TEST_MANAGED_LOST==='1') {console.log(JSON.stringify({ok:false,error:{code:'rpc_timeout',message:'observer lost'}}));process.exit(1);}
  if(process.env.TEST_MANAGED_CONTROL==='1') {
    console.log(JSON.stringify({controller:{...controller,status:'control_requested'},events:[]}));process.exit(0);
  }
  if(process.env.TEST_MANAGED_REVIEW==='1') {
    result={controller:{...controller,status:'waiting_for_context'},events:[
      ...(process.env.TEST_MANAGED_CAPTURE==='0'?[]:[{sequence:1,type:'boundary_captured',data:{stage:'specify',manifest:'review-manifest'}}]),
      {sequence:2,type:'context_required',data:{stage:'protocolize',attempt:1}}]};
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
  if(state.step===1) result={controller:{...controller,status:'waiting_for_context'},events:[{sequence:1,type:'context_required',data:{stage:'plan',attempt:1}}]};
  else if(state.step===2) {
    if(!state.context) throw new Error('context missing');
    result={controller:{...controller,status:'waiting_for_user'},events:[{sequence:2,type:'session_created',data:{stage:'plan',session_id:'native'}}]};
  } else {
    if(state.answer!=='raw answer\\n') throw new Error('raw answer changed');
    result={controller:{...controller,status:'stop_target_reached'},events:[{sequence:3,type:'boundary_captured',data:{stage:'plan',manifest:'fixture-manifest'}}]};
  }
} else throw new Error('unexpected command '+JSON.stringify(args));
fs.writeFileSync(stateFile,JSON.stringify(state));console.log(JSON.stringify(result));
`;

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
    assert.equal(calls.length, 3);
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
