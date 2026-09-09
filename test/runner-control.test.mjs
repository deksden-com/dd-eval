import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { executeEval, runnerControlReconcile, runnerControlRequest, runnerControlResume, runnerControlStatus, runnerResume, launchEvalExecution, loadCase, assertEvalExecutionDispatch } from '../lib/runner.mjs';
import { appendEvent, controlOperationInventory, readEvents, recordOperation, reduceEvents } from '../lib/runner-events.mjs';
import { commandJson, commandText } from '../lib/process-json.mjs';
import { withRunnerLock } from '../lib/runner-lock.mjs';
import { evalResumeWorkerFile, requestEvalResume } from '../lib/eval-resume-worker.mjs';
import { processSnapshot } from '../lib/process-snapshot.mjs';

test('initial EVAL waits for the lifecycle owner and rechecks control before publishing its queue', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-initial-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let started, finished = false;
  await withRunnerLock(`${root}.lifecycle`, async () => {
    started = executeEval({ root, runId: 'EVAL-initial' }).catch(error => { finished = true; return error; });
    await delay(50);
    assert.equal(finished, false);
    await assert.rejects(readFile(path.join(root, 'manifest.json')), { code: 'ENOENT' });
    await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId: 'EVAL-initial', type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  });
  assert.equal((await started).code, 'managed_run_controlled');
  await assert.rejects(readFile(path.join(root, 'manifest.json')), { code: 'ENOENT' });
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).length, 1);
});

test('runner resume routes an unstarted execution through launch without rewriting its manifest', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-resume-queue-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const execution = { id: 'queued', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' };
  const manifest = { run_id: 'EVAL-resume-queue', case_id: loaded.value.id, executions: [execution], input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, definition: { commit: await commandText('git', ['rev-parse', 'HEAD']) }, runtime_resource_home: path.join(root, 'resources'), subject_profile: { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' }, profile: { concurrency: { global: 1, per_harness: {} }, interaction_judge: { profile_id: 'fixture' }, judge: { enabled: false }, failure_policy: { stop_run_on_infrastructure_error: false } } };
  const bytes = JSON.stringify(manifest), file = path.join(root, 'manifest.json'); await writeFile(file, bytes);
  const retained = path.join(root, 'executions', execution.id, 'retained'); await mkdir(path.dirname(retained), { recursive: true }); await writeFile(retained, 'fixture blocks before provider preparation');
  const [first, duplicate] = await Promise.allSettled([runnerResume({ evalRoot: root }), runnerResume({ evalRoot: root })]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(duplicate.status, 'rejected');
  assert.equal(duplicate.reason.code, 'operation_terminal');
  const result = first.value;
  assert.equal(result.executions[0].code, 'execution_preparation_unproven');
  assert.equal(await readFile(file, 'utf8'), bytes);
  assert.equal(await readFile(retained, 'utf8'), 'fixture blocks before provider preparation');
  const events = await readEvents(path.join(root, 'events.jsonl'));
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.equal(events.find(event => event.type === 'dev.dd.eval.operation.started').data.operation_id, `${manifest.run_id}:queued:launch`);
  await assert.rejects(runnerResume({ evalRoot: root }), { code: 'operation_terminal' });
});

for (const real of [false, true]) test(`resume cannot observe the initial EVAL queue until its owner finishes projection (real CLI: ${real})`, { skip: real && !process.env.DD_EVAL_TEST_FLOW_CLI, timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-initial-resume-'));
  const previousBin = process.env.DD_FLOW_BIN;
  const ambient = path.join(root, 'ambient.mjs');
  await writeFile(ambient, `import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2), target=path.join(process.env.DD_FLOW_HOME,'engine');
if(args[0]==='engine'&&args[1]==='install'){
  fs.mkdirSync(path.join(target,'dist/harness-runtime'),{recursive:true});
  fs.copyFileSync(fileURLToPath(import.meta.url),path.join(target,'cli.mjs'));
  console.log(JSON.stringify({ok:true}));
}else if(args[0]==='engine'&&args[1]==='resolve') console.log(JSON.stringify({selection:{selected:{snapshot_root:target,entrypoint:'cli.mjs',package_version:'fixture'}}}));
else if(args[0]==='version') console.log(JSON.stringify({version:'frozen'}));
else throw Error('fixture must not dispatch');`);
  if (real) await writeFile(ambient, `import {spawnSync} from 'node:child_process';
const cli=${JSON.stringify(path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI))};
const script=cli.endsWith('.js')||cli.endsWith('.mjs');
const result=spawnSync(script?process.execPath:cli,[...(script?[cli]:[]),...process.argv.slice(2)],{stdio:'inherit'});
if(result.error)throw result.error; process.exit(result.status??1);`);
  process.env.DD_FLOW_BIN = ambient;
  t.after(async () => {
    if (previousBin === undefined) delete process.env.DD_FLOW_BIN; else process.env.DD_FLOW_BIN = previousBin;
    await rm(root, { recursive: true, force: true });
  });
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const execution = { id: 'queued', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' };
  const profile = { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' };
  const runProfile = { value: { concurrency: { global: 1, per_harness: {} }, interaction_judge: { profile_id: 'fixture' }, judge: { enabled: false }, failure_policy: { stop_run_on_infrastructure_error: false } } };
  const retained = path.join(root, 'executions', execution.id, 'retained');
  await mkdir(path.dirname(retained), { recursive: true }); await writeFile(retained, 'block before provider preparation');
  let initial, resumed, finished = false;
  await withRunnerLock(path.join(root, 'events.jsonl'), async () => {
    initial = executeEval({ root, runId: 'EVAL-initial-resume', loaded, profile, runProfile, executions: [execution] }).catch(error => error);
    const deadline = performance.now() + (real ? 30_000 : 3000);
    while (!await readFile(path.join(root, 'manifest.json')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
      assert.ok(performance.now() < deadline, 'initial manifest is published'); await delay(10);
    }
    resumed = runnerResume({ evalRoot: root }).then(value => { finished = true; return value; }, error => { finished = true; return error; });
    await delay(50);
    assert.equal(finished, false);
  });
  const result = await initial;
  assert.equal(result.executions[0].code, 'execution_preparation_unproven');
  assert.equal((await resumed).code, 'operation_terminal');
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.equal(await readFile(retained, 'utf8'), 'block before provider preparation');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.runtime_control_bin, path.join(root, 'control-runtime/bin/dd-flow'));
  const env = { DD_FLOW_HOME: path.join(root, 'control-runtime') };
  const before = await commandJson(manifest.runtime_control_bin, ['version'], { cwd: root, env });
  await writeFile(ambient, 'throw Error("ambient CLI was replaced");');
  assert.deepEqual(await commandJson(manifest.runtime_control_bin, ['version'], { cwd: root, env }), before);
  if (real) {
    const status = await runnerControlStatus({ evalRoot: root });
    assert.equal(status.run_id, 'EVAL-initial-resume');
    assert.notEqual(status.inventory.unavailable, true);
    assert.equal(status.inventory.scope_id, 'EVAL-initial-resume');
  } else assert.deepEqual(before, { version: 'frozen' });
});

test('runner resume waits for the lifecycle owner and rechecks operator control before loading a case', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-resume-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let resumed, finished = false;
  await withRunnerLock(`${root}.lifecycle`, async () => {
    resumed = runnerResume({ evalRoot: root }).catch(error => { finished = true; return error; });
    await delay(50);
    assert.equal(finished, false);
    await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId: 'EVAL-owner', type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  });
  assert.equal((await resumed).code, 'managed_run_controlled');
});

test('runner resume refuses an unapplied request without loading a case or dispatching', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-resume-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(runnerResume({ evalRoot: root, resumeRequestId: 'unapplied' }), { code: 'control_request_stale' });
  assert.deepEqual(await readEvents(path.join(root, 'events.jsonl')), []);
});

test('runner resume pins the accepted manifest before loading its execution profile', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-resume-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'manifest.json'), '{}');
  await assert.rejects(runnerResume({ evalRoot: root, expectedManifestSha256: 'a'.repeat(64) }), { code: 'runner_definition_drift' });
  assert.deepEqual(await readEvents(path.join(root, 'events.jsonl')), []);
});

for (const phase of ['started', 'observation_lost', 'completed', 'failed']) test(`shared execution launch does not replay or cancel a retained ${phase} operation`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-shared-launch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-shared', execution = { id: 'queued', stage: 'specify', mode: 'e2e' }, eventsFile = path.join(root, 'events.jsonl');
  const operation = { operation_id: `${runId}:queued:launch`, operation: 'execution.queued.launch' };
  const append = (phase, extra = {}) => appendEvent(eventsFile, { source: 'fixture', runId, executionId: execution.id, type: `dev.dd.eval.operation.${phase}`, data: { ...operation, ...extra } });
  await append('requested'); await append('started');
  const accepted = { execution: execution.id, state: 'candidate_ready', candidate: { retained: true } };
  if (phase !== 'started') await append(phase, phase === 'completed' ? { result: accepted } : { error: { code: 'fixture_error' } });
  const before = await readEvents(eventsFile);
  const result = await launchEvalExecution({ root, manifest: { run_id: runId }, execution, loaded: {}, blueprint: {} });
  assert.equal(result.state, phase === 'completed' ? 'candidate_ready' : phase === 'failed' ? 'failed' : 'awaiting_provider');
  if (phase === 'completed') assert.deepEqual(result, accepted);
  const after = await readEvents(eventsFile);
  assert.deepEqual(after.filter(event => event.type.startsWith('dev.dd.eval.operation.')), before);
  assert.ok(after.every(event => !['dev.dd.eval.execution.failed', 'dev.dd.eval.execution.cancel_requested'].includes(event.type)));
});

test('shared queued launch preserves unproven preparation artifacts instead of overwriting them', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-unproven-launch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const execution = { id: 'queued', stage: 'specify', mode: 'e2e' }, manifest = { run_id: 'EVAL-unproven', executions: [execution], profile: { failure_policy: { stop_run_on_infrastructure_error: false } } };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const retained = path.join(root, 'executions', execution.id, 'retained'); await mkdir(path.dirname(retained), { recursive: true }); await writeFile(retained, 'do not overwrite');
  const input = { root, manifest, execution, loaded: {}, blueprint: {} };
  assert.equal((await launchEvalExecution(input)).code, 'execution_preparation_unproven');
  assert.equal((await launchEvalExecution(input)).code, 'execution_preparation_unproven');
  assert.equal(await readFile(retained, 'utf8'), 'do not overwrite');
  const events = await readEvents(path.join(root, 'events.jsonl'));
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
});

test('a controlled queued launch remains unstarted and dispatches once after resume', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-queued-control-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const eventsFile = path.join(root, 'events.jsonl'), runId = 'EVAL-queued', execution = { id: 'queued' }, operationId = `${runId}:queued:launch`;
  const control = await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'pause', request_id: 'pause' } });
  let calls = 0;
  const operation = { eventsFile, source: 'fixture', runId, executionId: execution.id, operationId, operation: 'execution.queued.launch', beforeStart: events => assertEvalExecutionDispatch(events, runId, execution, operationId), action: async () => ({ calls: ++calls }) };
  await assert.rejects(recordOperation(operation), { code: 'managed_run_controlled' });
  await assert.rejects(recordOperation({ ...operation, beforeStart: () => false }), { code: 'operation_not_admitted' });
  let events = await readEvents(eventsFile);
  assert.equal(calls, 0);
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 0);
  assert.equal(controlOperationInventory(events, runId).operations[0].disposition, 'dispatch_after_resume');
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.resume_applied', data: { request_id: 'resume', source_request_id: 'pause', request_sequence: control.data.sequence, release: { scope_id: runId, source_request_id: 'pause', request_id: 'resume', generation: 1, current: true, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64) } } });
  assert.equal((await recordOperation(operation)).reused, false);
  assert.equal((await recordOperation(operation)).reused, true);
  assert.equal(calls, 1);
  events = await readEvents(eventsFile);
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.equal(controlOperationInventory(events, runId).operations[0].disposition, 'reuse');
});

test('operator resume applies one exact runtime release and cannot clear a newer stop', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-apply-resume-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-release', eventsFile = path.join(root, 'events.jsonl'), cli = path.join(root, 'flow'), statusFile = path.join(root, 'status.json'), calls = path.join(root, 'calls');
  await writeFile(cli, `#!${process.execPath}\nconst fs=require('node:fs');if(process.argv.slice(2,5).join(' ')!=='runtime scope status')throw Error('unexpected mutation');fs.appendFileSync(${JSON.stringify(calls)},'status\\n');console.log(fs.readFileSync(${JSON.stringify(statusFile)},'utf8'));`);
  await chmod(cli, 0o700);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'), executions: [{ id: 'queued' }] }));
  const requested = await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const release = { scope_id: runId, source_request_id: 'stop', request_id: 'resume', generation: 1, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64), current: true };
  const status = { scope_id: runId, control: null, fence: null, dispatch_blocked: false, release, resume: { status: 'released', request_id: 'resume', generation: 1, capture_key: release.capture_key, current: true } };
  const input = { evalRoot: root, requestId: 'resume', fromRequestId: 'stop' }, before = await readFile(eventsFile, 'utf8');
  for (const changed of [{ current: false }, { request_id: 'foreign' }, { source_request_id: 'foreign' }, { capture_key: 'wrong' }]) {
    await writeFile(statusFile, JSON.stringify({ ...status, release: { ...release, ...changed } }));
    await assert.rejects(runnerControlResume(input), { code: 'runtime_scope_release_unproven' });
    assert.equal(await readFile(eventsFile, 'utf8'), before);
  }
  await writeFile(statusFile, JSON.stringify(status));
  assert.deepEqual((({ state, applied, reused }) => ({ state, applied, reused }))(await runnerControlResume(input)), { state: 'planned', applied: true, reused: false });
  const applied = await readEvents(eventsFile);
  assert.equal(applied.length, 2);
  assert.equal(applied[1].data.request_sequence, requested.data.sequence);
  assert.equal(reduceEvents(applied).control, undefined);
  assert.throws(() => reduceEvents([requested, { ...applied[1], data: { ...applied[1].data, release: { ...release, current: false } } }]), { code: 'journal_conflict' });
  assert.equal(reduceEvents([requested, { type: 'dev.dd.eval.cancel_requested', data: { state: 'cancelling', sequence: 2 } }, applied[1]]).control.request_id, 'stop');
  assert.equal((await runnerControlResume(input)).reused, true);
  assert.equal((await readEvents(eventsFile)).length, 2);
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'new-stop' } });
  const stopped = await readEvents(eventsFile);
  assert.equal(reduceEvents([...stopped, applied[1]]).control.request_id, 'new-stop');
  await assert.rejects(runnerControlResume(input), { code: 'control_request_stale' });
  assert.equal((await readEvents(eventsFile)).length, 3);
  assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, 6);
});

test('control reconciliation reuses only confirmed outcomes and retains lost or suspended operations', () => {
  const events = [];
  const add = (id, phase, data = {}) => events.push({ runid: 'EVAL-ledger', executionid: 'one', type: `dev.dd.eval.operation.${phase}`, data: { operation_id: id, operation: `fixture.${id}`, sequence: events.length + 1, ...data } });
  add('queued', 'requested');
  for (const id of ['lost', 'suspended', 'done', 'failed']) { add(id, 'requested'); add(id, 'started'); }
  add('lost', 'observation_lost', { error: { code: 'transport_lost' } });
  add('suspended', 'suspended');
  add('done', 'completed', { result: { accepted: true } });
  add('failed', 'failed', { error: { code: 'failure' } });
  const inventory = controlOperationInventory(events, 'EVAL-ledger');
  assert.deepEqual(inventory.operations.map(item => [item.operation_id, item.disposition]), [['queued', 'dispatch_after_resume'], ['lost', 'reconcile'], ['suspended', 'reconcile'], ['done', 'reuse'], ['failed', 'explicit_recovery']]);
  assert.deepEqual(inventory.unresolved_operations, ['lost', 'suspended', 'failed']);
  add('lost', 'completed', { result: { reconciled: true } });
  assert.equal(controlOperationInventory(events, 'EVAL-ledger').operations.find(item => item.operation_id === 'lost').disposition, 'reuse');
  assert.throws(() => controlOperationInventory(events, 'EVAL-foreign'), { code: 'journal_conflict' });
  const restarted = structuredClone(events);
  restarted.push({ runid: 'EVAL-ledger', executionid: 'one', type: 'dev.dd.eval.operation.started', data: { operation_id: 'done', operation: 'fixture.done', sequence: restarted.length + 1 } });
  assert.throws(() => controlOperationInventory(restarted, 'EVAL-ledger'), { code: 'journal_conflict' });
  add('done', 'completed', { result: { accepted: false } });
  assert.throws(() => controlOperationInventory(events, 'EVAL-ledger'), { code: 'journal_conflict' });
});

test('operator reconciliation completes the same lost operation from accepted evidence without dispatch', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-control-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const eventsFile = path.join(root, 'events.jsonl'), runId = 'EVAL-reconcile';
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, case_id: 'unavailable', executions: [{ id: 'one' }, { id: 'pending' }] }));
  const append = (type, data, executionId) => appendEvent(eventsFile, { source: 'fixture', runId, executionId, type: `dev.dd.eval.${type}`, data });
  for (const id of ['one', 'pending']) {
    const data = { operation_id: `${runId}:${id}:launch`, operation: `execution.${id}.launch` };
    await append('operation.requested', data, id);
    await append('operation.started', data, id);
    await append('operation.observation_lost', { ...data, error: { code: 'transport_lost' } }, id);
  }
  const accepted = { execution: 'one', state: 'candidate_ready', candidate: { manifest_sha256: 'accepted-evidence' } };
  await append('execution.candidate_ready', { execution_operation_id: `${runId}:one:launch`, result: accepted }, 'one');
  await append('control.requested', { mode: 'pause', request_id: 'pause' });
  const result = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'reconcile', '--eval', root, '--from', 'pause']));
  assert.equal(result.state, 'pause_requested');
  assert.deepEqual(result.reconciled, [`${runId}:one:launch`]);
  assert.deepEqual(result.journal.unresolved_operations, [`${runId}:pending:launch`]);
  const events = await readEvents(eventsFile);
  assert.deepEqual(reduceEvents(events).operations[`${runId}:one:launch`].result, accepted);
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 2);
  assert.deepEqual((await runnerControlReconcile({ evalRoot: root, requestId: 'pause' })).reconciled, []);
  assert.equal((await readEvents(eventsFile)).length, events.length);
  await append('control.requested', { mode: 'stop', request_id: 'stop' });
  await assert.rejects(runnerControlReconcile({ evalRoot: root, requestId: 'pause' }), { code: 'control_request_stale' });
});

test('operator reconciliation retains an accepted Judge result without another Judge turn', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-judge-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const eventsFile = path.join(root, 'events.jsonl'), runId = 'EVAL-judge-reconcile';
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, executions: [] }));
  const append = (type, data) => appendEvent(eventsFile, { source: 'fixture', runId, type: `dev.dd.eval.${type}`, data });
  const operationId = `${runId}:judge:${'a'.repeat(64)}`, unknownId = `${runId}:judge:${'b'.repeat(64)}`;
  for (const id of [operationId, unknownId]) {
    await append('operation.requested', { operation_id: id, operation: 'final_judge' });
    await append('operation.started', { operation_id: id, operation: 'final_judge' });
    await append('operation.observation_lost', { operation_id: id, operation: 'final_judge', error: { code: 'transport_lost' } });
  }
  const receipt = { schema_id: 'dd-eval/final-judge-receipt@1', profile_id: 'retained-profile', session_id: 'same-session', candidate_sha256: 'a'.repeat(64), result: { conclusion: 'accepted result' } };
  await append('final_judge.result_ready', { operation_id: operationId, result: receipt });
  await append('control.requested', { mode: 'stop', request_id: 'stop' });
  const result = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'reconcile', '--eval', root, '--from', 'stop']));
  assert.deepEqual(result.reconciled, [operationId]);
  assert.deepEqual(result.journal.unresolved_operations, [unknownId]);
  const events = await readEvents(eventsFile);
  assert.deepEqual(reduceEvents(events).operations[operationId].result, receipt);
  assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 2);
  assert.deepEqual((await runnerControlReconcile({ evalRoot: root, requestId: 'stop' })).reconciled, []);
  assert.equal((await readEvents(eventsFile)).length, events.length);
  await append('final_judge.result_ready', { operation_id: unknownId, result: receipt });
  const beforeConflict = await readFile(eventsFile, 'utf8');
  await assert.rejects(runnerControlReconcile({ evalRoot: root, requestId: 'stop' }), { code: 'journal_conflict' });
  assert.equal(await readFile(eventsFile, 'utf8'), beforeConflict);
});

for (const mode of ['release', 'pending', 'hang', 'unknown']) test(`operator resume bounded wait handles ${mode} without replaying preparation`, { timeout: 10_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-wait-resume-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-wait', eventsFile = path.join(root, 'events.jsonl'), cli = path.join(root, 'flow.mjs'), calls = path.join(root, 'calls');
  const release = { scope_id: runId, source_request_id: 'stop', request_id: 'resume', generation: 1, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64), current: true };
  const resume = { request_id: 'resume', generation: 1, capture_key: release.capture_key, current: true, status: 'preparing' };
  const prepared = { scope_id: runId, fence: null, control: { request_id: 'stop', generation: 1 }, dispatch_blocked: true, settled: false, drain: { capture: { journal: { artifact_key: release.capture_key } } }, resume };
  const released = { ...prepared, control: null, dispatch_blocked: false, release, resume: { ...resume, status: 'released' } };
  await writeFile(cli, `import fs from 'node:fs';
const calls = ${JSON.stringify(calls)}, mode = ${JSON.stringify(mode)};
const action = process.argv[4];
fs.appendFileSync(calls, action + '\\n');
const history = fs.readFileSync(calls, 'utf8').trim().split('\\n');
const prepared = ${JSON.stringify(prepared)};
if (mode === 'unknown' || mode === 'hang' && history.includes('resume') && action === 'status') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
else if (mode === 'release' && history.includes('resume') && history.filter(x => x === 'status').length >= 3) console.log(JSON.stringify(${JSON.stringify(released)}));
else console.log(JSON.stringify(history.includes('resume') ? prepared : { ...prepared, resume: null }));
`);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'), executions: [] }));
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const before = await readFile(eventsFile, 'utf8'), started = performance.now();
  const result = { ok: true, ...await runnerControlResume({ evalRoot: root, fromRequestId: 'stop', requestId: 'resume', waitMs: mode === 'release' ? 5000 : 1500 }) };
  assert.equal(result.ok, mode !== 'unknown');
  assert.equal(result.request_id, 'resume');
  assert.equal(result.source_request_id, 'stop');
  assert.equal(result.pending, mode !== 'release');
  assert.ok(performance.now() - started < 7000, 'CLI wait stays bounded');
  assert.equal((await readFile(calls, 'utf8')).trim().split('\n').filter(x => x === 'resume').length, mode === 'unknown' ? 0 : 1);
  if (mode === 'release') {
    assert.equal(result.applied, true);
    assert.equal(result.receipt.dispatch_blocked, false);
    assert.equal((await readEvents(eventsFile)).filter(e => e.type === 'dev.dd.eval.control.resume_applied').length, 1);
    assert.equal((await runnerControlResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'stop', waitMs: 1000 })).reused, true);
  } else {
    assert.equal(result.observation_timed_out, true);
    assert.equal(result.accepted, mode === 'unknown' ? null : true);
    if (mode === 'unknown') assert.equal(result.receipt, undefined);
    else assert.equal(result.receipt.dispatch_blocked, true);
    assert.equal(await readFile(eventsFile, 'utf8'), before);
  }
});

test('operator resume rejects invalid wait budgets before touching the EVAL', async () => {
  for (const waitMs of [-1, 60001, 0.5, NaN, Infinity, '100']) {
    await assert.rejects(runnerControlResume({ evalRoot: '/missing-eval', requestId: 'resume', fromRequestId: 'stop', waitMs }), { code: 'control_request_invalid' });
  }
  for (const waitMs of ['-1', '60001', '1.5', 'no', 'Infinity', '']) {
    const child = spawn(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'resume', '--eval', '/missing-eval', '--from', 'stop', '--request-id', 'resume', '--wait-ms', waitMs], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    const [code] = await once(child, 'close');
    assert.equal(code, 2);
    assert.equal(JSON.parse(stderr).code, 'control_request_invalid');
  }
});

test('operator resume deadline includes a locked journal and never appends after timeout', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-wait-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-lock', eventsFile = path.join(root, 'events.jsonl'), cli = path.join(root, 'flow.mjs');
  const release = { scope_id: runId, source_request_id: 'stop', request_id: 'resume', generation: 1, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64), current: true };
  const status = { scope_id: runId, control: null, fence: null, dispatch_blocked: false, release, resume: { status: 'released', request_id: 'resume', generation: 1, capture_key: release.capture_key, current: true } };
  await writeFile(cli, `console.log(JSON.stringify(${JSON.stringify(status)}));`);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'), executions: [] }));
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const before = await readFile(eventsFile, 'utf8');
  const input = { evalRoot: root, requestId: 'resume', fromRequestId: 'stop', waitMs: 500 };
  await withRunnerLock(eventsFile, async () => {
    const started = performance.now();
    const result = await runnerControlResume(input);
    assert.equal(result.pending, true);
    assert.equal(result.observation_timed_out, true);
    assert.ok(performance.now() - started < 2000, 'journal contention does not exceed observation budget');
    assert.equal(await readFile(eventsFile, 'utf8'), before);
  });
  await delay(50);
  assert.equal(await readFile(eventsFile, 'utf8'), before);
  assert.equal((await runnerControlResume({ ...input, waitMs: 2000 })).applied, true);
  assert.equal((await readEvents(eventsFile)).filter(e => e.type === 'dev.dd.eval.control.resume_applied').length, 1);
});

test('an aborted queued journal append cannot run after its predecessor releases', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-abort-queue-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl');
  const input = { source: 'fixture', runId: 'EVAL-queue', type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'first' } };
  let first;
  await withRunnerLock(file, async () => {
    first = appendEvent(file, input);
    await assert.rejects(appendEvent(file, { ...input, data: { mode: 'stop', request_id: 'aborted' } }, { signal: AbortSignal.timeout(50) }), { name: 'TimeoutError' });
  });
  await first;
  await appendEvent(file, { ...input, data: { mode: 'stop', request_id: 'last' } });
  assert.deepEqual((await readEvents(file)).map(event => event.data.request_id), ['first', 'last']);
});

test('background resume admission respects the caller deadline without a late queued launch', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-worker-deadline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: 'EVAL-deadline', runtime_control_bin: process.execPath, runtime_resource_home: path.join(root, 'resources'), executions: [] }));
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId: 'EVAL-deadline', type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const file = evalResumeWorkerFile(root, 'resume'); await mkdir(path.dirname(file), { recursive: true });
  await withRunnerLock(file, async () => {
    const started = performance.now();
    const receipt = await requestEvalResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'stop', waitMs: 50 });
    assert.equal(receipt.pending, true); assert.equal(receipt.accepted, null); assert.equal(receipt.observation_timed_out, true);
    assert.ok(performance.now() - started < 1000);
  });
  await delay(50);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test('background continuation never finalizes a foreign registration returned by its CLI', { timeout: 10_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-worker-foreign-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-foreign', cli = path.join(root, 'flow.mjs'), calls = path.join(root, 'calls');
  const release = { scope_id: runId, source_request_id: 'stop', request_id: 'resume', generation: 1, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64), current: true };
  const status = { scope_id: runId, control: null, fence: null, dispatch_blocked: false, release, resume: { status: 'released', request_id: 'resume', generation: 1, capture_key: release.capture_key, current: true } };
  await writeFile(cli, `import fs from 'node:fs'; const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},args.slice(0,3).join(' ')+'\\n');
if(args[1]==='scope'&&args[2]==='status') console.log(JSON.stringify(${JSON.stringify(status)}));
else if(args[1]==='process'&&args[2]==='register') console.log(JSON.stringify({process:{id:'foreign',lease_token:'foreign',kind:'eval-observer',owner_id:'another-eval',state:'running',pid:Number(args[args.indexOf('--pid')+1])}}));
else throw Error('foreign registration must not be used');`);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: runId, runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'), executions: [] }));
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  const receipt = await requestEvalResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'stop' });
  const deadline = performance.now() + 5000; let saved;
  for (;;) {
    saved = JSON.parse(await readFile(receipt.continuation.file, 'utf8'));
    if (saved.status === 'failed') break;
    assert.ok(performance.now() < deadline, 'foreign binding is rejected'); await delay(25);
  }
  assert.equal(saved.error.code, 'process_ownership_unknown');
  while ((await processSnapshot()).some(item => item.pid === saved.owner_pid)) { assert.ok(performance.now() < deadline); await delay(25); }
  assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n').filter(line => line.startsWith('runtime process')), ['runtime process register']);
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.operation.started').length, 0);
});

for (const outcome of ['invalid-engine', 'new-stop']) test(`background observer reattaches after managed observation loss and respects ${outcome}`, { timeout: 12_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-worker-reattach-'));
  const runId = 'EVAL-reattach', cli = path.join(root, 'flow.mjs'), calls = path.join(root, 'calls.jsonl');
  const workerFile = evalResumeWorkerFile(root, 'resume'), registered = path.join(root, 'registered.json');
  t.after(async () => {
    const record = await readFile(registered, 'utf8').then(JSON.parse).catch(() => null);
    const physical = record && (await processSnapshot()).find(item => item.pid === record.pid && item.started === record.pid_started_at && item.pgid === record.pid);
    if (physical && !physical.zombie) process.kill(-record.pid, 'SIGKILL');
    await rm(root, { recursive: true, force: true });
  });
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const execution = { id: 'retained', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' };
  const attempt = path.join(root, 'executions', execution.id), runtime = path.join(attempt, 'dd-flow-home'), project = path.join(attempt, 'project');
  await mkdir(project, { recursive: true }); await mkdir(path.join(runtime, 'bin'), { recursive: true });
  const manifest = { run_id: runId, case_id: loaded.value.id, runtime_control_bin: cli, runtime_resource_home: path.join(root, 'resources'), executions: [execution], subject_profile: { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' }, profile: { concurrency: { global: 1, per_harness: {} }, judge: { enabled: false } } };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(attempt, 'managed-runtime.json'), JSON.stringify({ schema_id: 'dd-eval/managed-runtime@1', run_id: 'RUN-retained', project_root: project, runtime_root: runtime }));
  const release = { scope_id: runId, source_request_id: 'stop', request_id: 'resume', generation: 1, capture_key: 'a'.repeat(64), journal_sha256: 'b'.repeat(64), current: true };
  const status = { scope_id: runId, control: null, fence: null, dispatch_blocked: false, release, resume: { status: 'released', request_id: 'resume', generation: 1, capture_key: release.capture_key, current: true } };
  await writeFile(cli, `import fs from 'node:fs';
import { processSnapshot } from ${JSON.stringify(new URL('../lib/process-snapshot.mjs', import.meta.url).href)};
const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
const value = name => args[args.indexOf(name)+1];
let result;
if(args[1]==='scope'&&args[2]==='status') result=${JSON.stringify(status)};
else if(args[1]==='process'&&args[2]==='register') {
  const pid=Number(value('--pid')), physical=(await processSnapshot()).find(item=>item.pid===pid);
  const record={id:'observer',lease_token:'owned',kind:'eval-observer',owner_id:${JSON.stringify(runId)},operation_id:value('--operation'),state:'running',pid,pid_started_at:physical.started,metadata_json:JSON.stringify({role:'observer',dd_flow_home:process.env.DD_FLOW_HOME,process_group_id:pid,budget:JSON.parse(value('--budget-json'))})};
  fs.writeFileSync(${JSON.stringify(registered)},JSON.stringify(record)); result={process:record};
} else if(args[1]==='process'&&['check-admission','finish'].includes(args[2])) result={ok:true};
else throw Error('unexpected command');
console.log(JSON.stringify(result));`);
  const engineCli = path.join(runtime, 'bin', 'dd-flow');
  await writeFile(engineCli, `#!${process.execPath}
const fs=require('node:fs'), args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args[0]!=='engine'||args[1]!=='resolve') throw Error('must not launch or stop a retained RUN');
console.log(JSON.stringify({ok:false,error:{code:fs.existsSync(${JSON.stringify(path.join(root, 'invalid-engine'))})?'input_checkpoint_engine_mismatch':'rpc_timeout',message:'fixture observation'}}));process.exit(1);
`);
  await chmod(engineCli, 0o700);
  const eventsFile = path.join(root, 'events.jsonl');
  await assert.rejects(recordOperation({ eventsFile, source: 'fixture', runId, executionId: execution.id, operationId: `${runId}:${execution.id}:launch`, operation: 'execution.retained.launch', action: async () => { throw Object.assign(new Error('lost'), { code: 'rpc_timeout' }); } }), { code: 'rpc_timeout' });
  await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'stop' } });
  await requestEvalResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'stop' });
  const deadline = performance.now() + 8000;
  const readCalls = async () => (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse);
  let saved;
  for (;;) {
    saved = JSON.parse(await readFile(workerFile, 'utf8'));
    assert.notEqual(saved.status, 'failed', JSON.stringify(saved.error));
    if (saved.status === 'observation_lost' && (await readCalls()).filter(args => args[0] === 'engine').length >= 2) break;
    assert.ok(performance.now() < deadline, 'same observer retries managed observation'); await delay(25);
  }
  assert.equal(saved.error.code, 'rpc_timeout');
  if (outcome === 'invalid-engine') await writeFile(path.join(root, 'invalid-engine'), 'changed');
  else await appendEvent(eventsFile, { source: 'fixture', runId, type: 'dev.dd.eval.control.requested', data: { mode: 'stop', request_id: 'new-stop' } });
  for (;;) {
    saved = JSON.parse(await readFile(workerFile, 'utf8'));
    if (['failed', 'superseded'].includes(saved.status) && !(await processSnapshot()).some(item => item.pid === saved.owner_pid)) break;
    assert.ok(performance.now() < deadline, 'observer exits on a conclusive error or newer stop'); await delay(25);
  }
  assert.equal(saved.status, outcome === 'invalid-engine' ? 'failed' : 'superseded');
  assert.equal(saved.error.code, outcome === 'invalid-engine' ? 'input_checkpoint_engine_mismatch' : 'managed_run_controlled');
  const observed = await readCalls();
  assert.equal(observed.filter(args => args[2] === 'register').length, 1);
  assert.equal(observed.filter(args => args[2] === 'finish').length, 1);
  assert.ok(observed.every(args => args[0] === 'runtime' || args[0] === 'engine'));
  assert.equal((await readEvents(eventsFile)).filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.equal((await readEvents(eventsFile)).filter(event => event.type === 'dev.dd.eval.operation.failed').length, 0);
});

for (const clientExit of ['normal', 'killed', 'observer-killed']) test(`real EVAL resume continues its queue through one active observer (${clientExit})`, { skip: !process.env.DD_EVAL_TEST_FLOW_CLI, timeout: 45_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-real-resume-'));
  const cli = path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI), runId = 'EVAL-prepare';
  const env = { DD_FLOW_HOME: path.join(root, 'control-runtime'), DD_FLOW_RESOURCE_HOME: path.join(root, 'resources'), DD_FLOW_ENGINE_MODE: '1' };
  const call = args => commandJson(cli, ['runtime', 'scope', ...args], { cwd: root, env });
  t.after(async () => { await call(['stop', '--scope-id', runId, '--request-id', 'cleanup']); await delay(1200); await rm(root, { recursive: true, force: true }); });
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const manifest = { run_id: runId, runtime_control_bin: cli, runtime_resource_home: env.DD_FLOW_RESOURCE_HOME, case_id: loaded.value.id, executions: [{ id: 'queued', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' }], input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, definition: { commit: await commandText('git', ['rev-parse', 'HEAD']) }, subject_profile: { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' }, profile: { concurrency: { global: 1, per_harness: {} }, interaction_judge: { profile_id: 'fixture' }, judge: { enabled: false }, failure_policy: { stop_run_on_infrastructure_error: false } } };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const retained = path.join(root, 'executions', 'queued', 'retained'); await mkdir(path.dirname(retained), { recursive: true }); await writeFile(retained, 'stop before provider preparation');
  await runnerControlRequest({ evalRoot: root, requestId: 'pause', mode: 'pause' });
  const deadline = performance.now() + 30_000;
  for (;;) {
    const status = await call(['status', '--scope-id', runId]);
    if (status.drain?.capture?.journal?.event_count === (await readEvents(path.join(root, 'events.jsonl'))).length) break;
    assert.ok(performance.now() < deadline, 'runtime captured the final operator journal'); await delay(100);
  }
  const clientArgs = ['bin/dd-eval.mjs', 'runner', 'control', 'resume', '--eval', root, '--from', 'pause', '--request-id', 'resume'];
  const workerFile = evalResumeWorkerFile(root, 'resume');
  if (clientExit !== 'killed') {
    const result = JSON.parse(await commandText(process.execPath, clientArgs));
    assert.equal(result.accepted, true); assert.equal(result.request_id, 'resume'); assert.equal(result.continuation.file, workerFile);
  } else {
    const client = spawn(process.execPath, [...clientArgs, '--wait-ms', '15000'], { stdio: 'ignore' });
    await once(client, 'spawn'); const closed = once(client, 'close');
    t.after(async () => { if (client.exitCode === null && client.signalCode === null) { client.kill('SIGKILL'); await closed; } });
    for (;;) {
      const saved = await readFile(workerFile, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (saved?.owner_pid) break;
      assert.ok(performance.now() < deadline, 'independent EVAL owner started'); await delay(25);
    }
    assert.equal(client.exitCode, null); assert.equal(client.signalCode, null);
    client.kill('SIGKILL'); await closed;
  }
  if (clientExit === 'observer-killed') {
    for (;;) {
      const saved = JSON.parse(await readFile(workerFile, 'utf8'));
      if (saved.scope_result?.pending === false) break;
      assert.ok(performance.now() < deadline, 'observer applied release'); await delay(10);
    }
    await withRunnerLock(`${root}.lifecycle`, async () => {
      let saved;
      for (;;) {
        saved = JSON.parse(await readFile(workerFile, 'utf8'));
        if (saved.process_id) break;
        assert.ok(performance.now() < deadline, 'observer registered before continuation'); await delay(10);
      }
      const inventory = await call(['status', '--scope-id', runId]);
      const owned = inventory.processes.find(record => record.id === saved.process_id);
      assert.equal(owned.kind, 'eval-observer'); assert.equal(owned.owner_id, runId); assert.equal(owned.pid, saved.owner_pid);
      assert.equal(JSON.parse(owned.metadata_json).process_group_id, saved.owner_pid);
      assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.operation.started').length, 0);
      process.kill(-saved.owner_pid, 'SIGKILL');
      while ((await processSnapshot()).some(item => item.pid === saved.owner_pid)) {
        assert.ok(performance.now() < deadline, 'killed observer exited'); await delay(25);
      }
    });
  }
  await assert.rejects(runnerControlResume({ evalRoot: root, requestId: 'stale', fromRequestId: 'other' }), { code: 'control_request_stale' });
  const resumed = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'resume', '--eval', root, '--from', 'pause', '--request-id', 'resume', '--wait-ms', '15000']));
  assert.equal(resumed.pending, false);
  assert.equal(resumed.receipt.dispatch_blocked, false);
  let worker;
  for (;;) {
    worker = JSON.parse(await readFile(workerFile, 'utf8'));
    assert.notEqual(worker.status, 'failed', JSON.stringify(worker.error));
    if (worker.status === 'completed') break;
    assert.ok(performance.now() < deadline, 'detached observer continued the EVAL queue'); await delay(100);
  }
  assert.equal(worker.result.executions[0].code, 'execution_preparation_unproven');
  assert.equal(await readFile(retained, 'utf8'), 'stop before provider preparation');
  const inventory = await call(['status', '--scope-id', runId]);
  const observers = inventory.processes.filter(item => item.kind === 'eval-observer');
  assert.equal(observers.length, clientExit === 'observer-killed' ? 2 : 1);
  assert.ok(observers.every(record => record.state === 'stopped'));
  assert.equal((await runnerControlStatus({ evalRoot: root })).continuations[0].last_recorded_status, 'completed');
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.equal((await runnerControlResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'pause' })).reused, true);
  assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.control.resume_applied').length, 1);
  await runnerControlRequest({ evalRoot: root, requestId: 'new-stop', mode: 'stop' });
  await assert.rejects(runnerControlResume({ evalRoot: root, requestId: 'resume', fromRequestId: 'pause' }), { code: 'control_request_stale' });
});

test('real EVAL stop drains its probe after client exit and preserves a neighboring EVAL', { skip: !process.env.DD_EVAL_TEST_FLOW_CLI, timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-real-control-'));
  const cli = path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI);
  const env = { DD_FLOW_HOME: path.join(root, 'control-runtime'), DD_FLOW_RESOURCE_HOME: path.join(root, 'resources'), DD_FLOW_ENGINE_MODE: '1' };
  const call = args => commandJson(cli, ['runtime', ...args], { cwd: root, env });
  const children = [];
  try {
    for (const scope of ['EVAL-selected', 'EVAL-neighbor']) {
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
      children.push(child); await once(child, 'spawn');
      const { process: record } = await call(['process', 'register', '--kind', 'eval-baseline', '--owner', scope, '--owner-pid', String(process.pid), '--role', 'probe', '--operation', 'baseline', '--budget-json', JSON.stringify({ schema_id: 'dd-flow/runtime-budget@1', scope_id: scope, per_harness: {} })]);
      await call(['process', 'confirm', '--id', record.id, '--lease-token', record.lease_token, '--pid', String(child.pid), '--process-group-id', String(child.pid)]);
    }
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: 'EVAL-selected', runtime_control_bin: cli, runtime_resource_home: env.DD_FLOW_RESOURCE_HOME, executions: [] }));
    const receipt = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'stop', '--eval', root, '--request-id', 'operator-stop']));
    assert.equal(receipt.state, 'stop_requested');
    const deadline = performance.now() + 15_000;
    while (children[0].exitCode === null && children[0].signalCode === null) {
      assert.ok(performance.now() < deadline, 'detached owner drains selected probe'); await delay(50);
    }
    assert.equal(children[1].exitCode, null); assert.equal(children[1].signalCode, null);
    process.kill(children[1].pid, 0);
    let status = await runnerControlStatus({ evalRoot: root });
    while (!status.inventory.worker?.snapshot?.drain?.capture?.journal) {
      assert.ok(performance.now() < deadline, 'detached owner captures the EVAL journal');
      await delay(100);
      status = await runnerControlStatus({ evalRoot: root });
    }
    assert.equal(status.inventory.control.dispatch_blocked, true);
    assert.equal(status.inventory.worker.status, 'running');
    assert.equal(status.inventory.worker.snapshot.drain.capture.journal.consistency, 'append_only_prefix');
    assert.deepEqual(status.inventory.worker.snapshot.drain.capture.manifest.execution_ids, []);
    await assert.rejects(runnerResume({ evalRoot: root }), { code: 'managed_run_controlled' });
    assert.equal((await readEvents(path.join(root, 'events.jsonl'))).filter(event => event.type === 'dev.dd.eval.control.requested').length, 1);
  } finally {
    const { processes } = await call(['process', 'status']);
    for (const record of processes.filter(record => record.kind === 'scope-control')) await call(['process', 'stop', '--id', record.id, '--lease-token', record.lease_token, '--grace-ms', '100']);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
    await rm(root, { recursive: true, force: true });
  }
});

test('EVAL operator requests fence before runtime and never use ordinary resume as an unfence', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-control-request-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'dd-flow'), eventsFile = path.join(root, 'events.jsonl'), resourceHome = path.join(root, 'resources');
  await writeFile(bin, `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
if(process.env.DD_FLOW_RESOURCE_HOME!==${JSON.stringify(resourceHome)})throw Error('resource drift');
if(!fs.readFileSync(${JSON.stringify(eventsFile)},'utf8').includes('dev.dd.eval.control.requested'))throw Error('missing durable intent');
const declaration=JSON.parse(value('--manifest-json'));
if(declaration.scope_id!=='EVAL-control'||JSON.stringify(declaration.execution_ids)!=='["queued"]'||declaration.manifest_sha256!==require('node:crypto').createHash('sha256').update(fs.readFileSync(declaration.manifest_path)).digest('hex'))throw Error('missing frozen queued execution');
console.log(JSON.stringify({scope_id:value('--scope-id'),control:{request_id:value('--request-id'),requested_mode:value('--mode'),generation:1,dispatch_blocked:true},settled:false}));
`); await chmod(bin, 0o700);
  const execution = { id: 'queued' };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ run_id: 'EVAL-control', runtime_control_bin: bin, runtime_resource_home: resourceHome, case_id: 'not-installed', executions: [execution] }));
  assert.equal((await runnerControlRequest({ evalRoot: root, requestId: 'one', mode: 'pause' })).state, 'pause_requested');
  await runnerControlRequest({ evalRoot: root, requestId: 'one', mode: 'pause' });
  const paused = await readEvents(eventsFile);
  assert.equal(paused.filter(event => event.type === 'dev.dd.eval.control.requested').length, 1);
  assert.throws(() => assertEvalExecutionDispatch(paused, 'EVAL-control', execution, 'EVAL-control:queued:launch'), { code: 'managed_run_controlled' });
  await assert.rejects(runnerResume({ evalRoot: root }), { code: 'managed_run_controlled' });
  await assert.rejects(runnerControlRequest({ evalRoot: root, requestId: 'one', mode: 'stop' }), { code: 'control_request_conflict' });
  const stopped = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'stop', '--eval', root, '--request-id', 'two']));
  assert.equal(stopped.state, 'stop_requested');
  await appendEvent(eventsFile, { source: 'fixture', runId: 'EVAL-control', type: 'dev.dd.eval.control.observed', data: { mode: 'pause', request_sequence: paused[0].data.sequence } });
  assert.equal(reduceEvents(await readEvents(eventsFile)).state, 'stop_requested');
  await assert.rejects(runnerControlRequest({ evalRoot: root, requestId: 'three', mode: 'pause' }), { code: 'control_request_conflict' });
});

test('control status resolves retained scope without provider probes or journal mutations', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-control-status-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resourceHome = path.join(root, 'retained-registry'), calls = path.join(root, 'calls.jsonl');
  const write = async (file, data) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data); };
  const cli = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.DD_FLOW_RESOURCE_HOME !== ${JSON.stringify(resourceHome)}) throw new Error('registry drift');
if (args[2] !== 'status') throw new Error('status attempted mutation');
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args)+'\\n');
if (args[0] === 'runtime') console.log(JSON.stringify({scope_id:'EVAL-status',dispatch_blocked:true,processes:[{id:'judge',metadata_json:JSON.stringify({role:'final_judge'})}]}));
else {
 const run = args[args.indexOf('--run')+1];
 console.log(JSON.stringify({scope:{run_id:run==='RUN-foreign'?'RUN-neighbor':run},control:{control_id:'CTL-one',generation:3,status:'requested'},settled:false}));
}
`;
  const bin = path.join(root, 'dd-flow');
  await write(bin, cli); await chmod(bin, 0o700);
  const manifest = { run_id: 'EVAL-status', runtime_control_bin: bin, runtime_resource_home: resourceHome,
    case_id: 'unavailable-case', subject_profile: { id: 'unavailable-profile' }, executions: [{ id: 'one' }, { id: 'foreign' }, { id: 'queued' }] };
  await write(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const journal = path.join(root, 'events.jsonl'); await write(journal, '');
  for (const id of ['one', 'foreign']) {
    const attempt = path.join(root, 'executions', id), projectRoot = path.join(attempt, 'project'), runtimeRoot = path.join(attempt, 'dd-flow-home');
    await mkdir(projectRoot, { recursive: true });
    await write(path.join(attempt, 'managed-runtime.json'), JSON.stringify({ schema_id: 'dd-eval/managed-runtime@1', project_root: projectRoot, runtime_root: runtimeRoot, run_id: `RUN-${id}` }));
    const executable = path.join(runtimeRoot, 'bin/dd-flow'); await write(executable, cli); await chmod(executable, 0o700);
  }
  const all = await runnerControlStatus({ evalRoot: root });
  assert.equal(all.scope, 'eval');
  assert.equal(all.observation_complete, false);
  assert.deepEqual(all.journal.operations, []);
  assert.equal(all.inventory.processes[0].id, 'judge');
  assert.equal(all.executions[0].receipt.control.generation, 3);
  assert.equal(all.executions[1].error.code, 'execution_scope_invalid');
  assert.equal(all.executions[2].unavailable, true);
  assert.equal(Object.hasOwn(all, 'settled'), false);
  const beforeSelected = (await readFile(calls, 'utf8')).trim().split('\n').length;
  const selected = JSON.parse(await commandText(process.execPath, ['bin/dd-eval.mjs', 'runner', 'control', 'status', '--eval', root, '--execution', 'one']));
  assert.equal(selected.scope, 'execution'); assert.equal(selected.inventory, null);
  assert.equal(selected.observation_complete, true); assert.equal(selected.executions.length, 1);
  assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, beforeSelected + 1);
  await assert.rejects(runnerControlStatus({ evalRoot: root, executionId: 'neighbor' }), { code: 'execution_unknown' });
  await write(path.join(root, 'manifest.json'), JSON.stringify({ ...manifest, executions: [] }));
  const empty = await runnerControlStatus({ evalRoot: root });
  assert.equal(empty.scope, 'eval');
  assert.equal(empty.observation_complete, true);
  assert.deepEqual(empty.executions, []);
  assert.equal(empty.inventory.processes[0].id, 'judge');
  assert.equal(Object.hasOwn(empty, 'settled'), false);
  await assert.rejects(runnerControlStatus({ evalRoot: root, executionId: 'one' }), { code: 'execution_unknown' });
  assert.equal(await readFile(journal, 'utf8'), '');
});
