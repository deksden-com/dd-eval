import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { executionState, assertExecutionDispatch } from '../lib/execution-state.mjs';
import { appendEvent, readEvents } from '../lib/runner-events.mjs';
import { frozenCandidate, storedExecutionResults } from '../lib/runner.mjs';
const run = 'EVAL', execution = { id: 'e', stage: 'code' }, launch = `${run}:e:launch`;
const event = (kind, data = {}) => ({ type: `dev.dd.eval.${kind}`, executionid: 'e', data });
const complete = event('operation.completed', { operation_id: launch, result: { execution: 'e', state: 'candidate_ready' } });
const failure = event('operation.failed', { operation_id: launch, error: { code: 'integrity_failure', message: 'first cause' } });
const cancel = event('execution.cancel_requested');
const settled = event('execution.cancelled');

test('terminal outcome obeys the first accepted intent, retaining earlier fatal errors', () => {
  assert.equal(executionState([cancel, complete], run, execution).result.state, 'cancelling');
  assert.equal(executionState([cancel, complete, settled, failure], run, execution).result.state, 'cancelled');
  assert.equal(executionState([complete, cancel, settled], run, execution).result.state, 'candidate_ready');
  const fatal = executionState([failure, cancel, settled], run, execution);
  assert.equal(fatal.result.code, 'integrity_failure'); assert.equal(fatal.cancellation.settled, true);
  assert.throws(() => assertExecutionDispatch(executionState([cancel], run, execution), launch), { code: 'execution_cancelled' });
});

test('old generation replies cannot change or dispatch into an explicit recovery', () => {
  const recovery = `${launch}:recover:R1`;
  const events = [failure, event('operation.started', { operation_id: recovery }), complete,
    event('execution.failed', { code: 'late_error', execution_operation_id: launch })];
  const current = executionState(events, run, execution);
  assert.equal(current.result.state, 'awaiting_provider'); assert.equal(current.generation, 1);
  assert.throws(() => assertExecutionDispatch(current, launch), { code: 'execution_generation_stale' });
  assert.doesNotThrow(() => assertExecutionDispatch(current, recovery));
  events.push(event('operation.completed', { operation_id: recovery, result: { execution: 'e', state: 'candidate_ready' } }));
  assert.equal(executionState(events, run, execution).result.state, 'candidate_ready');
});

test('two processes racing cancel and completion produce one immutable candidate', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'execution-race-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl'), module = new URL('../lib/runner-events.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { appendEvent } from ${JSON.stringify(module)};
    process.send('ready');
    process.on('message', async () => {
      await appendEvent(${JSON.stringify(file)}, {source:'test',runId:'EVAL',executionId:'e',type:'dev.dd.eval.operation.completed',data:{operation_id:'EVAL:e:launch',result:{execution:'e',state:'candidate_ready'}}});
      process.disconnect();
    });`], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  await once(child, 'message');
  await appendEvent(file, { source: 'test', runId: run, executionId: 'e', type: cancel.type, data: {} });
  child.send('complete'); await once(child, 'exit');
  await appendEvent(file, { source: 'test', runId: run, executionId: 'e', type: settled.type, data: { receipt: { settled: true } } });
  const manifest = { run_id: run, executions: [execution] };
  const results = storedExecutionResults(await readEvents(file), manifest);
  const [a, b] = await Promise.all([frozenCandidate({ root, manifest, results }), frozenCandidate({ root, manifest, results })]);
  assert.equal(a.candidate.immutable_hash, b.candidate.immutable_hash);
  const bytes = await readFile(path.join(root, 'candidate.json'), 'utf8');
  await appendEvent(file, { source: 'test', runId: run, executionId: 'e', type: 'dev.dd.eval.execution.failed', data: { code: 'incomplete_subject_turn', execution_operation_id: launch } });
  await frozenCandidate({ root, manifest, results: storedExecutionResults(await readEvents(file), manifest) });
  assert.equal(await readFile(path.join(root, 'candidate.json'), 'utf8'), bytes);
});
