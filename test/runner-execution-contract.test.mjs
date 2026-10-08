import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeJsonAtomic, appendEvent, readEvents, sha256 } from '../lib/runner-events.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { resolveExecutionContract } from '../lib/execution-contract.mjs';
import { executionConformance, statusCleanupState, runResultRevision, buildReport, driverProfileArgs, assertObservedProfile, recoverExecution, interactionFixtureManifest } from '../lib/runner.mjs';

test('conformance binds outbound intent to its controller profile, not any planned model', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ['subject', 'later']) await writeJsonAtomic(path.join(root, 'agent-profiles', `${id}.json`), {
    schema_id: 'dd-flow/agent-profile@1', id, harness: 'codex', provider: 'openai', model: 'old', reasoning: 'high', mode: 'agent', permission: 'allow'
  });
  const contract = await resolveExecutionContract({ configHome: root,
    runProfile: { subject: { profile_id: 'subject', execution: { agent_profile_id: 'subject', stage_overrides: { code: { agent_profile_id: 'later' } } } }, selection: { stop_after: 'specify' } },
    loadProfile: id => ({ id, harness: 'codex-desktop', model: id === 'subject' ? 'wanted' : 'later-model', reasoning: 'high' }) });
  const attempt = path.join(root, 'attempt'), runtime = path.join(attempt, 'runtime'), runHome = path.join(runtime, 'runs', 'RUN');
  await mkdir(runHome, { recursive: true });
  await writeJsonAtomic(path.join(attempt, 'managed-runtime.json'), { runtime_root: runtime, run_home: runHome });
  await writeJsonAtomic(path.join(runHome, 'run.json'), { execution_profile: { settings: { execution: contract.routing }, agent_profiles: contract.profiles } });
  const result = { attempt, driver: { controller: { sessions: [{ session_id: 'root', profile_id: 'subject' }] } },
    model_attribution: { sessions: [{ harness: 'codex-desktop', session_id: 'root', requested: { model: 'wanted', reasoning: 'high', permission_mode: 'allow' } }] } };
  assert.equal((await executionConformance(result, contract)).state, 'matched');
  result.model_attribution.sessions[0].requested.model = 'later-model';
  assert.equal((await executionConformance(result, contract)).state, 'mismatched');
  result.model_attribution.sessions[0].requested.model = 'wanted';
  result.model_attribution.sessions[0].requested.permission_mode = 'deny';
  assert.equal((await executionConformance(result, contract)).state, 'mismatched');
  result.model_attribution.sessions[0].requested.permission_mode = 'allow';
  result.model_attribution.sessions.push({ harness: 'codex-desktop', session_id: 'child', parent_session_id: 'root', requested: { model: 'wanted' } });
  assert.equal((await executionConformance(result, contract)).intent_evidence, 'available');
  result.model_attribution.sessions.push({ harness: 'codex-desktop', session_id: 'unmapped', requested: { model: 'wanted' } });
  assert.equal((await executionConformance(result, contract)).intent_evidence, 'unknown');
  assert.equal((await executionConformance(result, null)).state, 'unknown');
});

test('status settlement requires current terminal revision and matching report, not CLI/owner exit', () => {
  const manifest = { run_id: 'EVAL', case_id: 'fixture', profile: { judge: { enabled: false } }, executions: [{ id: 'e2e', stage: 'specify' }] };
  const results = [{ execution: 'e2e', state: 'failed' }];
  const events = [];
  const report = buildReport({ root: '/fixture', manifest, results, state: 'completed_with_failures', cleanupState: 'settled' });
  assert.equal(statusCleanupState({ report, events, manifest, results }), 'pending');
  events.push({ runid: 'EVAL', type: 'dev.dd.eval.completed', data: { state: report.state, result_revision: runResultRevision(events, manifest) } });
  assert.equal(statusCleanupState({ report, events, manifest, results }), 'settled');
  assert.equal(statusCleanupState({ report: { ...report, state: 'finished' }, events, manifest, results }), 'pending');
  assert.equal(statusCleanupState({ report: { ...report, cleanup_state: 'pending' }, events, manifest, results }), 'pending');
  assert.equal(statusCleanupState({ report: null, events, manifest, results }), 'pending');
});

test('effective policy is supplied explicitly at native admission boundary', () => {
  const profile = { harness: 'zcode-acp', model: 'wanted', reasoning: 'high', provider: 'openai', mode: 'agent', permission: 'deny' };
  const args = driverProfileArgs(profile, ['doctor', '--cwd', '/fixture']);
  for (const [key, value] of Object.entries(profile).filter(([key]) => key !== 'harness')) assert.equal(args[args.indexOf(`--${key}`) + 1], value);
  assert.equal(args.filter(arg => arg === '--permission').length, 1);
  assert.deepEqual(driverProfileArgs(profile, ['daemon', 'stop']), ['daemon', 'stop']);
  assert.throws(() => assertObservedProfile({ observed_profile: { permission_mode: 'allow' } }, profile, 'native'), { code: 'profile_integrity_violation' });
  assert.doesNotThrow(() => assertObservedProfile({ observed_profile: { permission_mode: 'deny', model: 'routed' } }, profile, 'native'));
  const agy = { ...profile, harness: 'antigravity-cli', permission: 'allow' };
  assert.doesNotThrow(() => assertObservedProfile({ profile: { observed: { permission_mode: 'always-proceed' } } }, agy, 'native'));
  assert.throws(() => assertObservedProfile({ profile: { observed: { permission_mode: 'ask' } } }, agy, 'native'), { code: 'profile_integrity_violation' });
  const unsupported = { ...agy, permission: 'deny' };
  assert.throws(() => driverProfileArgs(unsupported, ['session', 'prompt']), { code: 'execution_policy_unsupported' });
  assert.doesNotThrow(() => driverProfileArgs(unsupported, ['session', 'cancel']));
  assert.deepEqual(driverProfileArgs(unsupported, ['daemon', 'stop']), ['daemon', 'stop']);
});

test('recovery checks the retained RUN contract before resuming its native controller', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-recovery-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const execution = { id: 'e2e', stage: 'specify', terminal_stage: 'specify', mode: 'e2e' };
  const attempt = path.join(root, 'executions', execution.id), projectRoot = path.join(attempt, 'project');
  const runtimeRoot = path.join(attempt, 'dd-flow-home'), engineRoot = path.join(root, 'engine');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(engineRoot);
  const engine = { package_version: 'fixture', engine_version: 'fixture', snapshot_root: engineRoot,
    integrity: { checksum: await engineArtifactDigest(engineRoot) } };
  await writeJsonAtomic(path.join(root, 'agent-profiles', 'subject.json'), {
    schema_id: 'dd-flow/agent-profile@1', id: 'subject', harness: 'codex', provider: 'openai',
    model: 'old', reasoning: 'high', mode: 'agent', permission: 'allow'
  });
  const contract = await resolveExecutionContract({ configHome: root, runProfile: { subject: { profile_id: 'subject' } },
    loadProfile: id => ({ id, harness: 'codex-desktop', model: 'wanted', reasoning: 'high' }) });
  const policyFile = path.join(root, 'baseline.json');
  await writeJsonAtomic(policyFile, { schema_id: 'dd-eval/baseline-admission-policy@1',
    commands: [{ id: 'fixture', command: 'unused', args: [], timeout_ms: 1000 }] });
  const definition = { file: 'baseline.json', sha256: sha256(await readFile(policyFile)) };
  const checkpoint = { sha256: 'a'.repeat(64), value: { id: 'cp-fixture', source: { commit: 'b'.repeat(40) },
    flow_pack: { engine: { version: 'fixture', artifact_sha256: engine.integrity.checksum } } } };
  const baselineFile = path.join(root, 'baseline-receipt.json');
  await writeJsonAtomic(baselineFile, { schema_id: 'dd-eval/baseline-admission@1', status: 'passed',
    checkpoint_id: checkpoint.value.id, checkpoint_sha256: checkpoint.sha256, source_commit: checkpoint.value.source.commit,
    policy_sha256: definition.sha256, checks: [{ id: 'fixture', exit_code: 0 }] });
  const contextFile = path.join(root, 'context.json');
  await writeJsonAtomic(contextFile, {});
  const eventsFile = path.join(root, 'events.jsonl'), runId = 'EVAL-contract', opId = `${runId}:e2e:launch`;
  await appendEvent(eventsFile, { source: 'test', runId, executionId: execution.id, type: 'dev.dd.eval.operation.started', data: { operation_id: opId } });
  await appendEvent(eventsFile, { source: 'test', runId, executionId: execution.id, type: 'dev.dd.eval.execution.context_prepared',
    data: { stage: 'specify', context_file: contextFile, materialized_context_sha256: sha256(await readFile(contextFile)),
      baseline_admission: { file: baselineFile, sha256: sha256(await readFile(baselineFile)) } } });
  await writeJsonAtomic(path.join(attempt, 'managed-runtime.json'), { schema_id: 'dd-eval/managed-runtime@1',
    run_id: 'RUN', project_root: projectRoot, runtime_root: runtimeRoot });
  const recoveryFile = path.join(root, 'recovery.json');
  await writeJsonAtomic(recoveryFile, {});
  const recovery = { run_id: 'RUN', control_id: 'CTL', recovery_id: 'RCV', snapshot: '/fixture-capture',
    manifest: recoveryFile, manifest_sha256: sha256(await readFile(recoveryFile)) };
  const controller = { controller_id: 'CTRL', run_id: 'RUN', request_id: `eval:${sha256(opId)}`, status: 'recovery_required', sessions: [] };
  const callsFile = path.join(root, 'calls.jsonl'), cli = path.join(runtimeRoot, 'bin', 'dd-flow');
  await mkdir(path.dirname(cli), { recursive: true });
  const mismatchedRun = { execution_profile: { settings: { execution: contract.routing },
    agent_profiles: { subject: { ...contract.profiles.subject, model: 'wrong-model' } } } };
  await writeFile(cli, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(callsFile)},JSON.stringify(args)+'\\n');
const action=args.slice(0,3).join(' ');let result;
if(args[0]==='engine')result={selection:{selected:${JSON.stringify(engine)}}};
else if(action==='run drive status')result={controller:${JSON.stringify(controller)}};
else if(action==='run control status')result={settled:true,control:{current:true,control_id:'CTL',recovery_id:'RCV',capture_path:'/fixture-capture'}};
else if(args[0]==='run'&&args[1]==='status')result={index:${JSON.stringify(mismatchedRun)}};
else throw Error('Unexpected native dispatch: '+action);
console.log(JSON.stringify(result));\n`);
  await chmod(cli, 0o700);
  const loaded = { root, value: { baseline_admission: definition }, inputCheckpoint: checkpoint };
  const manifest = { run_id: runId, runtime_resource_home: path.join(root, 'resources'), execution_contract: contract,
    profile: { subject: { profile_id: 'subject' }, concurrency: { global: 1 } },
    interaction_fixtures: await interactionFixtureManifest(root, [execution]) };
  await assert.rejects(recoverExecution({ root, events: await readEvents(eventsFile), manifest, execution, loaded,
    blueprint: {}, profile: {}, recovery }), { code: 'profile_contract_mismatch' });
  const calls = (await readFile(callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(args => args[0] === 'run' && args[1] === 'status'));
  assert.ok(!calls.some(args => args.slice(0, 3).join(' ') === 'run control resume'));
});
