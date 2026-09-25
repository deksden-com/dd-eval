import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, chmod, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { commandText } from '../lib/process-json.mjs';
import { hashJson, readEvents, appendEvent } from '../lib/runner-events.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { interactionFixtureManifest, assertExecutionEngine } from '../lib/runner.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// The detached owner remains observable while fixture startup/settlement runs;
// allow loaded CI hosts to finish without weakening the production deadline.
async function waitForState(runner, evalRoot, expected, timeoutMs = 30_000, ready = () => true) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await runner.runnerStatus({ evalRoot });
    if (expected.includes(status.state) && await ready(status)) return status;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${expected.join(', ')}; got ${status.state}; attempts=${JSON.stringify(status.runner_attempts)}`);
    await delay(50);
  }
}
const policy = stage => ({ schema_id: 'dd-eval/canonical-responses@1', stage, mode: 'forbidden', max_rounds: 0, responses: [] });
const write = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
};

async function setup(t, fault = null) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'eval-fork-'));
  // Detached continuation observers can finish one final attempt journal
  // write after publishing their terminal state. Retry only this test-owned
  // temporary cleanup; production cleanup remains fail-closed.
  t.after(async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { await rm(temp, { recursive: true, force: true }); return; }
      catch (error) {
        if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EBUSY') throw error;
        await delay(25);
      }
    }
    await rm(temp, { recursive: true, force: true });
  });
  const definition = path.join(temp, 'definition'), caseRoot = path.join(definition, 'cases/fixture');
  await cp(new URL('../lib', import.meta.url), path.join(definition, 'lib'), { recursive: true });
  const runner = await import(pathToFileURL(path.join(definition, 'lib/runner.mjs')));
  const stages = ['plan-review', 'code'];
  const execution = { id: 'e2e', mode: 'e2e', stage: 'plan-review', terminal_stage: 'code' };
  const checkpoint = { id: 'cp-test', source: { commit: 'a'.repeat(40) }, flow_pack: { commit: 'b'.repeat(40), path: '.memory-bank', engine: { version: 'old', commit: 'c'.repeat(40), repository: 'fixture', artifact_sha256: 'd'.repeat(64) } } };
  const cpFile = await write(path.join(definition, 'checkpoints/cp-test.json'), checkpoint);
  const checkpointHash = hash(await readFile(cpFile));
  await write(path.join(caseRoot, 'case.json'), { schema_id: 'dd-eval/case@7', id: 'fixture', assessment: 'assessment.json', input: [], entry_pack: null, input_checkpoint: { id: checkpoint.id, sha256: checkpointHash }, baseline_admission: { sha256: 'e'.repeat(64) }, flow: { contour: stages, terminal_stage: 'code' } });
  await write(path.join(caseRoot, 'assessment.json'), {});
  await write(path.join(caseRoot, 'entry-pack-source/stage-context.json'), { schema_id: 'dd-eval/stage-context-blueprint@1', stages: Object.fromEntries(stages.map(stage => [stage, { schema_id: 'dd-eval/stage-context@1', stage, objective: 'Fixture', task_input: [] }])) });
  for (const stage of stages) await write(path.join(caseRoot, `entry-pack-source/interactions/${stage}.json`), policy(stage));
  await commandText('git', ['init', '--quiet'], { cwd: definition });
  await commandText('git', ['add', 'cases', 'checkpoints'], { cwd: definition });
  await commandText('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture'], { cwd: definition });
  const commit = await commandText('git', ['rev-parse', 'HEAD'], { cwd: definition });
  const sourceRoot = path.join(temp, 'home/runs/source'), output = path.join(temp, 'home/forks/derived');
  const source = { schema_id: 'dd-eval/runner-manifest@1', kind: 'scored', run_id: 'EVAL-source', case_id: 'fixture', definition: { commit }, input_checkpoint: { id: checkpoint.id, sha256: checkpointHash }, executions: [execution], interaction_fixtures: Object.fromEntries(stages.map(stage => [stage, { interaction_fixture_sha256: hashJson(policy(stage)) }])), runtime_resource_home: path.join(temp, 'resources'), profile: { subject: {}, concurrency: { global: 1 }, judge: { enabled: false }, failure_policy: { stop_run_on_infrastructure_error: true } }, subject_profile: { id: 'fake', harness: 'zcode-acp', model: 'fake', reasoning: 'low', subagent_capacity: 5 } };
  const baselineFile = await write(path.join(sourceRoot, 'executions/e2e/baseline-admission/receipt.json'), { status: 'passed', checkpoint_id: checkpoint.id, checkpoint_sha256: checkpointHash, source_commit: checkpoint.source.commit, policy_sha256: 'e'.repeat(64), checks: [{ exit_code: 0 }] });
  Object.assign(source.profile, {
    schema_id: 'dd-eval/run-profile@1', id: 'fixture', case_id: 'fixture', subject: { profile_id: 'fake' },
    selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 },
    failure_policy: { stop_run_on_infrastructure_error: true, stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true }
  });
  await write(path.join(sourceRoot, 'manifest.json'), source);
  await appendEvent(path.join(sourceRoot, 'events.jsonl'), { source: 'fixture', runId: source.run_id, executionId: execution.id, type: 'dev.dd.eval.execution.context_prepared', data: { stage: 'plan-review', baseline_admission: { file: baselineFile, sha256: hash(await readFile(baselineFile)) } } });
  const from = `plan-${'f'.repeat(64)}`;
  await write(path.join(sourceRoot, 'executions/e2e/boundaries', from, 'snapshot.json'), { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'stage_entry', stage_entry: 'plan-review' });
  const configFile = path.join(temp, 'fake.json'), callsFile = path.join(temp, 'calls.jsonl');
  const engineRoot = path.join(temp, 'engine');
  await mkdir(path.join(engineRoot, 'dist/harness-runtime'), { recursive: true });
  const cli = await write(path.join(engineRoot, 'cli.cjs'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), {execFileSync} = require('node:child_process');
const c = JSON.parse(fs.readFileSync(${JSON.stringify(configFile)})), a = process.argv.slice(2);
const get = flag => a[a.indexOf(flag)+1];
fs.appendFileSync(c.calls, JSON.stringify(a)+'\\n');
const out = value => console.log(JSON.stringify(value));
const write = (file, value) => {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file, JSON.stringify(value));};
const project = path.join(c.output,'executions/e2e/project'), runHome=path.join(c.output,'executions/e2e/dd-flow-home/run');
const managedFile=c.output+'/executions/e2e/managed-runtime.json';
const runtimeProcess = () => { const pid=Number(a.includes('--pid')?get('--pid'):null)||process.pid, budget=a.includes('--budget-json')?JSON.parse(get('--budget-json')):{schema_id:'dd-flow/runtime-budget@1',scope_id:'x',per_harness:{}}; return {id:'PROC-fake',lease_token:'lease-fake',kind:'eval-observer',owner_id:(a.includes('--owner')?get('--owner'):null)||process.env.DD_EVAL_RUN_ID||'EVAL-fake',operation_id:(a.includes('--operation')?get('--operation'):null)||'',pid,pid_started_at:execFileSync('ps',['-o','lstart=','-p',String(pid)],{encoding:'utf8'}).trim(),state:'running',metadata_json:JSON.stringify({role:'observer',dd_flow_home:process.env.DD_FLOW_HOME,process_group_id:pid,budget})}; };
const controller = {controller_id:'DRV-fake',run_id:'RUN-fake',request_id:fs.existsSync(c.output+'/launch')?fs.readFileSync(c.output+'/launch','utf8'):'none',stage:'code',status:'stop_target_reached',sessions:[],runtime_budget:fs.existsSync(managedFile)?JSON.parse(fs.readFileSync(managedFile)).runtime_budget:null};
const captured = stage => {const file=c.output+'/capture-'+stage+'/snapshot.json';write(file,{purpose:'stage_entry',stage_entry:stage==='plan-review'?'code':'code-review'});return {stage,manifest:file,manifest_sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')};};
if(a[0]==='engine') out(a[1]==='resolve'?{selection:{selected:c.engine}}:{engine:c.engine});
else if(a[0]==='runtime' && a[1]==='process') out(a[2]==='status'?{processes:[]}:{process:runtimeProcess()});
else if(a[0]==='run' && a[1]==='fork') {
  fs.mkdirSync(project,{recursive:true});fs.mkdirSync(runHome,{recursive:true});execFileSync('git',['init','--quiet'],{cwd:project});
  out({ok:true,status:'ready',fork:{project_root:project,dd_flow_home:path.dirname(runHome),run_id:'RUN-fake',run_home:runHome,workspace_root:project,target_stage:'plan-review',engine:c.engine}});
} else if(a[0]==='run' && a[1]==='drive' && a[2]==='launch') {
  if(fs.existsSync(c.output+'/launch')) throw Error('duplicate controller launch');fs.writeFileSync(c.output+'/launch',get('--request-id'));out({controller});
} else if(a[0]==='run' && a[1]==='drive' && a[2]==='context') {
  if(get('--stage')!=='code') throw Error('wrong successor');fs.writeFileSync(c.output+'/code','yes');out({ok:true});
} else if(a[0]==='run' && a[1]==='drive' && a[2]==='status') {
  if(c.fault==='lost' && !fs.existsSync(c.output+'/lost')) {fs.writeFileSync(c.output+'/lost','yes');out({ok:false,error:{code:'rpc_timeout',message:'lost observer reply'}});return;}
  const done=fs.existsSync(c.output+'/code'), after=Number(get('--after')||0);
  const first={sequence:1,type:'boundary_captured',data:captured('plan-review')};
  if(['boundary','unsettled'].includes(c.fault) && !fs.existsSync(c.output+'/stopped')) fs.writeFileSync(c.fixture,'{}');
  const events=done?[first,{sequence:2,type:'context_required',data:{stage:'code',attempt:1}},{sequence:3,type:'boundary_captured',data:captured('code')}]:[first,{sequence:2,type:'context_required',data:{stage:'code',attempt:1}}];
  out({controller:{...controller,status:done?'stop_target_reached':'waiting_for_context'},events:events.filter(e=>e.sequence>after)});
} else if(a[0]==='run' && a[1]==='control') {
  if(a[2]==='stop') fs.writeFileSync(c.output+'/stopped','yes');
  const settled=c.fault!=='unsettled';const capture=c.output+'/recovery';write(capture+'/snapshot.json',{consistency:'sealed_writer_barrier_required'});
  out({settled,control:{current:true,control_id:'CTL-fake',recovery_id:'REC-fake',admission:'sealed',capture_path:capture,generation:1,settlement:{settled}}});
} else if(a[0]==='run' && a[1]==='list') out({runs:[{id:'RUN-fake'}]});
else if(a[0]==='run' && a[1]==='status') out({run:{workspace_root:project,run_root:runHome},index:{stage_runs:[{stage:'plan-review',status:'done'},{stage:'code',status:fs.existsSync(c.output+'/code')?'done':'pending'}]}});
else if(a[0]==='stat') out({});
else throw Error('unexpected command '+JSON.stringify(a));
`);
  await chmod(cli, 0o700);
  const engine = { package_name: 'fixture', package_version: 'new', engine_version: 'new', integrity_checksum: await engineArtifactDigest(engineRoot), snapshot_root: engineRoot, entrypoint: 'cli.cjs' };
  await write(path.join(engineRoot, 'engine.json'), { schema_id: 'dd-flow/engine-manifest@1', ...engine, integrity: { checksum: engine.integrity_checksum } });
  const retainedEngine = path.join(sourceRoot, 'executions/e2e/dd-flow-home/engines/fixture/new');
  await cp(engineRoot, retainedEngine, { recursive: true });
  await write(configFile, { output, engine, calls: callsFile, fault, fixture: path.join(caseRoot, 'entry-pack-source/interactions/plan-review.json') });
  const configHome = path.join(temp, 'config');
  await write(path.join(configHome, 'harnesses.json'), { schema_id: 'dd-flow/harness-config@1', harnesses: {} });
  for (const [key, value] of Object.entries({ HOME: temp, DD_FLOW_BIN: cli, DD_FLOW_CONFIG_HOME: configHome, DD_EVAL_HOME: path.join(temp, 'home') })) {
    const prior = process.env[key]; process.env[key] = value;
    t.after(() => { if(prior===undefined) delete process.env[key]; else process.env[key]=prior; });
  }
  return { temp, runner, sourceRoot, source, caseRoot, output, callsFile, engine, configFile, input: { evalRoot: sourceRoot, executionId: 'e2e', from, output, engineVersion: 'new', requestId: 'fork-test' } };
}

test('fork inherits pins, crosses a boundary and finalizes through ordinary EVAL exactly once', async t => {
  const f = await setup(t);
  const sourceBytes = await readFile(path.join(f.sourceRoot, 'manifest.json'));
  const [ready, repeatedReady] = await Promise.all([f.runner.runnerFork(f.input), f.runner.runnerFork(f.input)]);
  assert.equal(ready.status, 'ready');
  assert.equal(repeatedReady.run_id, ready.run_id);
  const preparedProject = path.join(f.output, 'executions/e2e/project');
  await write(path.join(preparedProject, '.dd-eval/task.md'), 'Retained eval task');
  await write(path.join(preparedProject, '.zcode/acp/future-service.json'), 'Provider service state');
  assert.equal(await commandText('git', ['status', '--porcelain'], { cwd: preparedProject }), '');
  const manifest = JSON.parse(await readFile(path.join(f.output, 'manifest.json')));
  assert.deepEqual(manifest.interaction_fixtures, f.source.interaction_fixtures);
  assert.deepEqual(manifest.definition, f.source.definition);
  assert.deepEqual(manifest.input_checkpoint, f.source.input_checkpoint);
  assert.equal(manifest.derived_from.engine.package_version, 'new');
  const [result, concurrent] = await Promise.all([f.runner.runnerFork({ ...f.input, start: true }), f.runner.runnerFork({ ...f.input, start: true })]);
  assert.equal(result.status, 'accepted');
  assert.equal(concurrent.status, 'accepted');
  const status = await waitForState(f.runner, f.output, ['completed'], 30_000);
  assert.equal(status.execution_results[0].boundaries.length, 2);
  assert.equal(status.execution_results[0].stage, 'code');
  assert.equal((await f.runner.runnerFork({ ...f.input, start: true })).status, 'accepted');
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(a => a[1] === 'drive' && a[2] === 'launch').length, 1);
  assert.equal(calls.filter(a => a[1] === 'fork').length, 1);
  assert.equal(calls.filter(a => a[1] === 'drive' && a[2] === 'context').length, 1);
  assert.deepEqual(await readFile(path.join(f.sourceRoot, 'manifest.json')), sourceBytes);
  assert.equal((await waitForState(f.runner, f.output, ['completed'])).state, 'completed');
});

test('completed fork replay does not require its archived source checkpoint', async t => {
  const f = await setup(t);
  const ready = await f.runner.runnerFork(f.input);
  await rm(f.sourceRoot, { recursive: true, force: true });
  const replay = await f.runner.runnerFork(f.input);
  assert.equal(replay.run_id, ready.run_id);
  assert.equal(replay.status, 'ready');
  await assert.rejects(f.runner.runnerFork({ ...f.input, requestId: 'another-request' }), { code: 'fork_request_conflict' });
});

test('boundary callback failure retains primary error, stops the RUN and finalizes failure', async t => {
  const f = await setup(t, 'boundary');
  const result = await f.runner.runnerFork({ ...f.input, start: true });
  assert.equal(result.status, 'accepted');
  const status = await waitForState(f.runner, f.output, ['completed_with_failures']);
  assert.equal(status.execution_results[0].code, 'interaction_fixture_invalid');
  assert.equal(status.execution_results[0].boundaries.length, 1);
  assert.equal(await readFile(path.join(f.output, 'stopped'), 'utf8'), 'yes');
  const events = await readEvents(path.join(f.output, 'events.jsonl'));
  assert.equal(events.filter(e => e.type === 'dev.dd.eval.completed').length, 1);
  assert.ok(events.some(e => e.type === 'dev.dd.eval.controller.event' && e.data.type === 'boundary_captured'));
  assert.equal(status.state, 'completed_with_failures');
  const calls = await readFile(f.callsFile, 'utf8');
  assert.ok(!calls.includes('"drive","context"'));
});

test('lost fork observer reattaches to the upgraded engine without another launch', async t => {
  const f = await setup(t, 'lost');
  const first = await f.runner.runnerFork({ ...f.input, start: true });
  assert.equal(first.status, 'accepted');
  const status = await waitForState(f.runner, f.output, ['completed']);
  assert.equal(status.execution_results[0].recovered, true);
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(a => a[1] === 'drive' && a[2] === 'launch').length, 1);
  assert.equal(calls.filter(a => a[1] === 'fork').length, 1);
});

test('failed fork stays pending until cleanup is confirmed, then finalizes without redispatch', async t => {
  const f = await setup(t, 'unsettled');
  const first = await f.runner.runnerFork({ ...f.input, start: true });
  assert.equal(first.status, 'accepted');
  // awaiting_provider is also an observer-startup state. Wait for the actual
  // failed RUN's stop request before changing the fixture's settlement reply.
  await waitForState(f.runner, f.output, ['awaiting_provider'], 10_000, async () => {
    try { await stat(path.join(f.output, 'stopped')); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
  const config = JSON.parse(await readFile(f.configFile));
  await write(f.configFile, { ...config, fault: null });
  const next = await f.runner.runnerFork({ ...f.input, start: true });
  assert.equal(next.status, 'accepted');
  await waitForState(f.runner, f.output, ['completed_with_failures']);
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(a => a[1] === 'drive' && a[2] === 'launch').length, 1);
});

test('missing or changed source pins fail before fork preparation or native dispatch', async t => {
  const f = await setup(t);
  for (const pins of [{}, { ...f.source.interaction_fixtures, code: { interaction_fixture_sha256: '0'.repeat(64) } }]) {
    await write(path.join(f.sourceRoot, 'manifest.json'), { ...f.source, interaction_fixtures: pins });
    await assert.rejects(f.runner.runnerFork({ ...f.input, start: true }), error => ['interaction_fixture_invalid', 'interaction_fixture_checksum_mismatch'].includes(error.code));
    await assert.rejects(readFile(f.callsFile), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(f.output, 'fork.json')), { code: 'ENOENT' });
    await assert.rejects(stat(path.dirname(f.output)), { code: 'ENOENT' });
  }
});

test('fork never substitutes an ambient engine when the requested retained artifact is absent', async t => {
  const f = await setup(t);
  await assert.rejects(f.runner.runnerFork({ ...f.input, engineVersion: 'not-retained' }), { code: 'fork_engine_artifact_missing' });
  await assert.rejects(readFile(f.callsFile), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(f.output, 'fork.json')), { code: 'ENOENT' });
  await assert.rejects(stat(path.dirname(f.output)), { code: 'ENOENT' });
});

test('invalid fork arguments do not register or create an output home', async t => {
  const f = await setup(t);
  await assert.rejects(f.runner.runnerFork({ ...f.input, engineVersion: 'bad engine version' }), { code: 'fork_input_invalid' });
  await assert.rejects(readFile(path.join(f.output, 'manifest.json')), { code: 'ENOENT' });
});

test('an explicit digest admits one installed upgrade artifact without router selection', async t => {
  const f = await setup(t);
  const sourceEngine = path.join(f.sourceRoot, 'executions/e2e/dd-flow-home/engines/fixture/new');
  await rm(sourceEngine, { recursive: true, force: true });
  const configHome = process.env.DD_FLOW_CONFIG_HOME;
  await cp(f.engine.snapshot_root, path.join(configHome, 'engines/fixture/new'), { recursive: true });
  const result = await f.runner.runnerFork({ ...f.input, integrityChecksum: f.engine.integrity_checksum, start: true });
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  await waitForState(f.runner, f.output, ['completed']);
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(a => a[1] === 'fork').length, 1);
});

test('prepared fork revalidates its complete stage range before launch', async t => {
  const f = await setup(t);
  await f.runner.runnerFork(f.input);
  const file = path.join(f.output, 'manifest.json'), manifest = JSON.parse(await readFile(file));
  delete manifest.interaction_fixtures.code;
  await write(file, manifest);
  await assert.rejects(f.runner.runnerFork({ ...f.input, start: true }), { code: 'interaction_fixture_invalid' });
  await assert.rejects(stat(path.join(f.output, 'runner-attempts')), { code: 'ENOENT' });
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  // Invalid retained inputs are rejected before creating a detached observer.
  assert.equal(calls.filter(args => args[1] === 'drive' && args[2] === 'launch').length, 0);
  assert.equal(calls.filter(args => args[1] === 'fork').length, 1);
});

test('derived engine pin admits only the selected upgraded bytes and preserves ordinary admission', async t => {
  const f = await setup(t);
  const checkpoint = { value: { flow_pack: { engine: { version: 'old', artifact_sha256: 'a'.repeat(64) } } } };
  const manifest = { kind: 'derived', derived_from: { engine: f.engine } };
  await assertExecutionEngine(manifest, checkpoint, f.engine);
  await assert.rejects(assertExecutionEngine({ kind: 'scored' }, checkpoint, f.engine), { code: 'input_checkpoint_engine_mismatch' });
  await assert.rejects(assertExecutionEngine({ kind: 'derived' }, checkpoint, f.engine), { code: 'fork_engine_mismatch' });
  await write(path.join(f.engine.snapshot_root, 'changed.txt'), 'changed');
  await assert.rejects(assertExecutionEngine(manifest, checkpoint, f.engine), { code: 'engine_artifact_mismatch' });
});

test('all remaining fixture pins can be checked without creating a RUN', async t => {
  const f = await setup(t);
  assert.deepEqual(await interactionFixtureManifest(f.caseRoot, f.source.executions, f.source), f.source.interaction_fixtures);
  await assert.rejects(readFile(f.callsFile), { code: 'ENOENT' });
  await assert.rejects(interactionFixtureManifest(f.caseRoot, [{ stage: 'unknown', terminal_stage: 'code' }], f.source), { code: 'selection_invalid' });
});
