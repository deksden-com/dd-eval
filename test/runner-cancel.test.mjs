import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm, chmod, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runnerCancel, runnerStatus, executionDispatchBarrier, assertEvalExecutionDispatch } from '../lib/runner.mjs';
import { appendEvent, readEvents, reduceEvents, recordOperation } from '../lib/runner-events.mjs';

test('EVAL cancellation rejects a queued repetition before preparation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-queued-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-queued', executionId = 'repetition-2', eventsFile = path.join(root, 'events.jsonl');
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, executions: [{ id: executionId }] }));
  await appendEvent(eventsFile, { source: 'dd-eval://runner', runId, type: 'dev.dd.eval.cancel_requested', data: { state: 'cancelling' } });
  let prepared = false;
  await assert.rejects(recordOperation({ eventsFile, source: 'dd-eval://runner', runId, executionId, operationId: `${runId}:${executionId}:launch`, operation: 'launch', action: async () => {
    await executionDispatchBarrier('execution.prepare');
    prepared = true;
  } }), { code: 'runtime_scope_stopped' });
  assert.equal(prepared, false);
  assert.equal(reduceEvents(await readEvents(eventsFile)).state, 'cancelling');
});

test('only the current EVAL cancellation request can publish its observation', () => {
  const request = sequence => ({ type: 'dev.dd.eval.cancel_requested', data: { sequence, state: 'cancelling' } });
  const observed = (sequence, request_sequence, state) => ({ type: 'dev.dd.eval.cancel_observed', data: { sequence, request_sequence, state } });
  const events = [request(1), request(2), observed(3, 1, 'cancelled')];
  assert.equal(reduceEvents(events).state, 'cancelling');
  events.push(observed(4, 2, 'cancelled'), observed(5, 1, 'cancelling'));
  assert.equal(reduceEvents(events).state, 'cancelled');
  assert.equal(reduceEvents(events).cancellation.request_sequence, 2);
  assert.equal(reduceEvents([observed(1, 99, 'cancelled')]).state, 'planned');
});

test('managed handoff and recovery cannot bypass an EVAL-wide cancel intent', () => {
  const events = [{ type: 'dev.dd.eval.cancel_requested', data: { sequence: 1, state: 'cancelling' } }];
  for (const operation of ['EVAL:e2e:launch', 'EVAL:e2e:launch:recover:REC-one']) {
    assert.throws(() => assertEvalExecutionDispatch(events, 'EVAL', { id: 'e2e' }, operation), { code: 'runtime_scope_stopped' });
  }
});

test('cancel projects terminal results without loading case or starting configured Judge', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const oldBin = process.env.DD_FLOW_BIN;
  t.after(() => { if (oldBin === undefined) delete process.env.DD_FLOW_BIN; else process.env.DD_FLOW_BIN = oldBin; });
  const bin = path.join(root, 'dd-flow');
  const calls = path.join(root, 'calls.jsonl');
  await writeFile(bin, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify([...args,process.env.DD_FLOW_RESOURCE_HOME])+'\\n');\nconsole.log(JSON.stringify({scope_id:args[args.indexOf('--scope-id')+1],dispatch_blocked:true,settled:true,nodes:[]}));\n`);
  await chmod(bin, 0o755);
  process.env.DD_FLOW_BIN = bin;
  const manifest = { run_id: 'EVAL-cancel', runtime_control_bin: bin, runtime_resource_home: path.join(root, 'retained-resources'), case_id: 'missing-case', executions: [{ id: 'e2e', stage: 'specify' }], profile: { judge: { enabled: true, profile_id: 'missing-judge' } } };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  process.env.DD_FLOW_BIN = path.join(root, 'wrong-ambient-cli');
  const previousResources = process.env.DD_FLOW_RESOURCE_HOME;
  process.env.DD_FLOW_RESOURCE_HOME = path.join(root, 'wrong-ambient-registry');
  t.after(() => { if (previousResources === undefined) delete process.env.DD_FLOW_RESOURCE_HOME; else process.env.DD_FLOW_RESOURCE_HOME = previousResources; });
  const eventsFile = path.join(root, 'events.jsonl');
  for (const type of ['cancel_requested', 'cancelled']) await appendEvent(eventsFile, {
    source: 'dd-eval://runner', runId: manifest.run_id, executionId: 'e2e',
    type: `dev.dd.eval.execution.${type}`, data: { execution: 'e2e', state: type === 'cancelled' ? 'cancelled' : 'cancelling' }
  });
  for (let retry = 0; retry < 2; retry++) assert.equal((await runnerCancel({ evalRoot: root })).state, 'cancelled');
  assert.equal((await runnerStatus({ evalRoot: root })).state, 'cancelled');
  const events = await readEvents(eventsFile);
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.completed').length, 1);
  assert.equal(events.some(event => event.data?.operation === 'final_judge'), false);
  assert.equal((await readdir(root)).includes('judge'), false);
  assert.equal((await readdir(root)).includes('candidate.json'), false);
  const commands = (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(commands.length, 4);
  for (const args of commands) assert.equal(args.at(-1), manifest.runtime_resource_home);
  for (const args of commands.filter(args => args[2] === 'fence')) assert.deepEqual(args.slice(0, 7), ['runtime', 'scope', 'fence', '--scope-id', manifest.run_id, '--request-id', `eval-cancel:${manifest.run_id}`]);
  await writeFile(bin, `#!${process.execPath}\nconsole.log(JSON.stringify({scope_id:'EVAL-cancel',dispatch_blocked:true,settled:false,nodes:[{process_id:'judge-still-owned',settled:false}]}));\n`);
  const activeJudge = await runnerCancel({ evalRoot: root });
  assert.equal(activeJudge.state, 'cancelling');
  assert.equal(activeJudge.scope_inventory.nodes[0].process_id, 'judge-still-owned');
  await writeFile(bin, `#!${process.execPath}\nprocess.exit(1);\n`);
  const failedFence = await runnerCancel({ evalRoot: root });
  assert.equal(failedFence.state, 'cancelling');
  assert.equal(failedFence.scope_fence.dispatch_blocked, false);
  assert.equal(failedFence.cancelled[0].settled, true);
  assert.equal((await runnerStatus({ evalRoot: root })).state, 'cancelling');
  await appendEvent(eventsFile, { source: 'dd-eval://runner', runId: manifest.run_id,
    type: 'dev.dd.eval.completed', data: { state: 'completed' } });
  assert.equal((await runnerStatus({ evalRoot: root })).state, 'cancelling');
  assert.equal((await runnerCancel({ evalRoot: root, executionId: 'e2e' })).state, 'cancelled');
});
