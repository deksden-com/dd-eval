import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { recoverExecution, captureRecoveryEvidence } from '../lib/runner.mjs';
import { appendEvent, readEvents, hashJson, recordOperation } from '../lib/runner-events.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';

test('unmanaged recovery and reconciliation require migration before creating runtime or provider state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'legacy-recovery-'));
  try {
    const input = { root, events: [], manifest: { run_id: 'EVAL-old' }, execution: { id: 'legacy', stage: 'plan' }, loaded: {}, blueprint: {}, profile: {} };
    await assert.rejects(recoverExecution(input), { code: 'execution_migration_required' });
    await assert.rejects(recoverExecution({ ...input, terminalOnly: true }), { code: 'execution_migration_required' });
    await assert.rejects(recoverExecution({ ...input, recovery: { recovery_id: 'REC-old' }, terminalOnly: true }), { code: 'execution_migration_required' });
    assert.deepEqual(await readdir(root), []);
    await mkdir(path.join(root, 'executions/legacy/project'), { recursive: true });
    await mkdir(path.join(root, 'executions/legacy/dd-flow-home'), { recursive: true });
    const capture = await captureRecoveryEvidence({ root, manifest: input.manifest, result: { execution: 'legacy', state: 'failed' } });
    assert.equal(capture.unavailable, true);
    assert.equal(capture.capture_error.code, 'execution_migration_required');
    assert.deepEqual(await readdir(path.join(root, 'executions/legacy')), ['dd-flow-home', 'project']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const waiting of [false, true]) test(`managed recovery retains capture, context and HITL without native replay (pending answer: ${waiting})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'managed-resume-'));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const write = async (relative, value) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  try {
    const execution = { id: 'e2e', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' };
    const attempt = path.join(root, 'executions/e2e'), projectRoot = path.join(attempt, 'project'), runtimeRoot = path.join(attempt, 'dd-flow-home');
    await mkdir(projectRoot, { recursive: true });
    await write('engine/runtime.txt', 'captured engine');
    const engine = { snapshot_root: path.join(root, 'engine'), package_name: 'fixture', package_version: '1', engine_version: '1', integrity_checksum: await engineArtifactDigest(path.join(root, 'engine')) };
    const checkpoint = { sha256: 'c'.repeat(64), value: { id: 'cp-test', source: { commit: 'd'.repeat(40) }, flow_pack: { engine: { version: '1', artifact_sha256: engine.integrity_checksum } } } };
    const definition = { sha256: 'b'.repeat(64) };
    const baseline = await write('baseline.json', { status: 'passed', checkpoint_sha256: checkpoint.sha256, checkpoint_id: checkpoint.value.id, source_commit: checkpoint.value.source.commit, policy_sha256: definition.sha256, checks: [{ exit_code: 0 }] });
    const contextFile = await write('context.json', { stage: 'specify', retained: true });
    const answerFile = await write('answer.md', 'unchanged answer\n');
    const receiptFile = await write('judge/receipt.json', { verdict: 'matched', session_id: 'judge-existing', profile_id: 'judge', interaction_fixture_sha256: 'f'.repeat(64) });
    await write('judge/packet.json', { question: 'A required question?' });
    const fixture = { schema_id: 'dd-eval/canonical-responses@1', stage: 'specify', mode: 'required', max_rounds: 1, responses: [{ id: 'answer', topic: 'scope', applicability: 'always', answer: 'unchanged answer\n' }] };
    await write('case/entry-pack-source/interactions/specify.json', fixture);
    const manifest = { run_id: 'EVAL-test', runtime_resource_home: path.join(root, 'resources'), profile: { concurrency: { global: 1, per_harness: {} } }, interaction_fixtures: { specify: { interaction_fixture_sha256: hashJson(fixture) } } };
    const opId = `${manifest.run_id}:${execution.id}:launch`;
    const controller = { controller_id: 'DRV-retained', request_id: `eval:${hash(opId)}`, run_id: 'RUN-retained', status: 'stop_target_reached', stage: 'specify', sessions: [{ session_id: 'native-retained', stopped: true }] };
    await write('executions/e2e/managed-runtime.json', { schema_id: 'dd-eval/managed-runtime@1', run_id: controller.run_id, project_root: projectRoot, runtime_root: runtimeRoot });
    const captureFile = await write('capture.json', { boundary_capture: { controller_id: controller.controller_id } });
    const boundary = { stage: 'specify', manifest: captureFile, manifest_sha256: hash(await readFile(captureFile)) };
    const recoveryManifest = await write('recovery/snapshot.json', { consistency: 'sealed_writer_barrier_required' });
    const control = { control_id: 'CTL-retained', recovery_id: 'REC-retained', current: true, admission: 'sealed', generation: 1, capture_path: path.dirname(recoveryManifest), settlement: { settled: true, nodes: [] } };
    const controllerEvents = [
      { sequence: 1, type: 'context_required', data: { stage: 'specify' } },
      { sequence: 2, type: 'context_accepted', data: { stage: 'specify' } },
      { sequence: 3, type: 'session_created', data: { session_id: 'native-retained', stage: 'specify' } },
      { sequence: 4, type: 'boundary_captured', data: boundary }
    ];
    const cli = await write('executions/e2e/dd-flow-home/bin/dd-flow', `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if ((args[0] === 'engine' || args[0] === 'run' && ['control','drive'].includes(args[1])) && process.env.DD_FLOW_RESOURCE_HOME !== ${JSON.stringify(manifest.runtime_resource_home)}) throw new Error('managed command changed resource registry');
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.jsonl'))}, JSON.stringify(args)+'\\n');
let result;
const pending = ${waiting} && !fs.existsSync(${JSON.stringify(path.join(root, 'answered'))});
const interrupted = fs.existsSync(${JSON.stringify(path.join(root, 'interrupt'))}) && !fs.existsSync(${JSON.stringify(path.join(root, 'resumed'))});
if (args[0] === 'engine' && args[1] === 'resolve') result = {selection:{selected:${JSON.stringify(engine)}}};
else if (args[0] === 'run' && args[1] === 'control' && args[2] === 'status') result = {settled:true,control:${JSON.stringify(control)}};
else if (args[0] === 'run' && args[1] === 'control' && args[2] === 'resume') {
  if(args[args.indexOf('--from')+1]!=='CTL-retained') throw new Error('wrong recovery control');
  fs.writeFileSync(${JSON.stringify(path.join(root, 'resumed'))},args[args.indexOf('--request-id')+1]);
  result={controller:${JSON.stringify(controller)}};
}
else if (args[0] === 'run' && args[1] === 'drive' && args[2] === 'status') {
  const after = args.includes('--after') ? Number(args[args.indexOf('--after')+1]) : 0;
  result = {controller:{...${JSON.stringify(controller)},status:interrupted?'recovery_required':pending?'waiting_for_user':'stop_target_reached'},events:${JSON.stringify(controllerEvents)}.filter(event=>event.sequence>after && (!pending || event.sequence<4))};
} else if (args[0] === 'run' && args[1] === 'drive' && args[2] === 'answer') {
  if(fs.readFileSync(args[args.indexOf('--answer-file')+1],'utf8')!=='unchanged answer\\n') throw new Error('accepted answer changed');
  fs.writeFileSync(${JSON.stringify(path.join(root, 'answered'))},'yes');result={ok:true};
} else if (args[0] === 'run' && args[1] === 'status') result = {index:{stage_runs:[{stage:'specify',status:pending?'paused':'done',pause:pending?{id:'PAUSE-retained'}:null}]}};
else if (args[0] === 'stat') result = {};
else throw new Error('unexpected productive command '+JSON.stringify(args));
console.log(JSON.stringify(result));
`);
    await chmod(cli, 0o700);
    const eventsFile = path.join(root, 'events.jsonl');
    const event = (type, data) => appendEvent(eventsFile, { source: 'dd-eval://runner', runId: manifest.run_id, executionId: execution.id, type: `dev.dd.eval.${type}`, data });
    await event('execution.context_prepared', { stage: 'specify', attempt: null, context_file: contextFile, materialized_context_sha256: hash(await readFile(contextFile)), semantic_package_sha256: 's', context_slice_sha256: 't', baseline_admission: { file: baseline, sha256: hash(await readFile(baseline)) } });
    await event('hitl.matched', { stage: 'specify', round: 1, pause_id: 'PAUSE-retained', answer_file: answerFile, answer_sha256: hash(await readFile(answerFile)), receipt_file: receiptFile, response_ids: ['answer'] });
    const input = { root, manifest, execution, loaded: { root: path.join(root, 'case'), value: { baseline_admission: definition }, inputCheckpoint: checkpoint }, blueprint: {}, profile: {} };
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await recoverExecution({ ...input, events: await readEvents(eventsFile) });
      assert.equal(result.state, 'candidate_ready');
      assert.equal(result.recovered, true);
      assert.deepEqual(result.candidate, boundary);
      assert.equal(result.hitl.length, 1);
      assert.equal(result.hitl[0].answer, 'unchanged answer\n');
      assert.equal(result.boundaries.length, 1);
    }
    const events = await readEvents(eventsFile);
    assert.equal(events.filter(event => event.type === 'dev.dd.eval.subject.session_created').length, 1);
    assert.equal(events.filter(event => event.type === 'dev.dd.eval.controller.event').length, 4);
    await write('interrupt', 'yes');
    const callsBeforeInvalidScope = await readFile(path.join(root, 'calls.jsonl'), 'utf8');
    for (const resourceHome of [undefined, 'relative-resources']) {
      const invalidManifest = { ...manifest, runtime_resource_home: resourceHome };
      const unavailable = await captureRecoveryEvidence({ root, manifest: invalidManifest, result: { execution: execution.id, attempt, state: 'failed', code: 'provider_failed' } });
      assert.equal(unavailable.unavailable, true);
      assert.equal(unavailable.capture_error.code, 'runtime_scope_identity_missing');
      await assert.rejects(recoverExecution({ ...input, manifest: invalidManifest, events }), { code: 'runtime_scope_identity_missing' });
      assert.equal(await readFile(path.join(root, 'calls.jsonl'), 'utf8'), callsBeforeInvalidScope);
    }
    const recovery = await captureRecoveryEvidence({ root, manifest, result: { execution: execution.id, attempt, state: 'failed', code: 'provider_failed' } });
    assert.equal(recovery.control_id, control.control_id);
    assert.equal(recovery.manifest_sha256, hash(await readFile(recoveryManifest)));
    await assert.rejects(recoverExecution({ ...input, events, recovery: { ...recovery, control_id: 'CTL-stale' } }), { code: 'recovery_source_stale' });
    const retainedContext = await readFile(contextFile);
    await writeFile(contextFile, 'corrupt before resume');
    await assert.rejects(recoverExecution({ ...input, events, recovery }), { code: 'context_checksum_mismatch' });
    assert.ok(!(await readFile(path.join(root, 'calls.jsonl'), 'utf8')).includes('"resume"'));
    await writeFile(contextFile, retainedContext);
    const operationId = `${opId}:recover:${recovery.recovery_id}`;
    const recovered = await recordOperation({ eventsFile, source: 'dd-eval://runner', runId: manifest.run_id, executionId: execution.id, operationId, operation: 'execution.e2e.recover',
      action: async () => recoverExecution({ ...input, events: await readEvents(eventsFile), recovery }) });
    assert.equal(recovered.result.state, 'candidate_ready');
    assert.equal(await readFile(path.join(root, 'resumed'), 'utf8'), `eval-resume:${hash(operationId)}`);
    const calls = (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter(args => args[2] === 'answer').length, waiting ? 1 : 0);
    assert.equal(calls.filter(args => args[1] === 'control' && args[2] === 'resume').length, 1);
    assert.ok(calls.every(args => args[0] === 'engine' || args[0] === 'stat' || (args[0] === 'run' && (args[1] === 'status' || ['status', 'answer', 'resume'].includes(args[2])))));
    await writeFile(contextFile, 'changed');
    await assert.rejects(recoverExecution({ ...input, events }), { code: 'context_checksum_mismatch' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
