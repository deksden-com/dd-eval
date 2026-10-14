import test from 'node:test';
import assert from 'node:assert/strict';
import { causalNodes, nativeBindingFields, validateNativeFailureEvidence, verifyCapturedNativeFailure, hasVerifiedNativeFailure } from '../lib/native-failure-evidence.mjs';
import { classifyInterruption, isInfrastructureFailure, failureDiagnostic, failureAttribution, buildReport, executionEvidence } from '../lib/runner.mjs';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { snapshotTreeHash } from '../lib/case-acceptance.mjs';
import { resolveBoundSnapshot } from '../lib/recovery-safety.mjs';

const binding = Object.fromEntries(nativeBindingFields.map(key => [key, key === 'generation' ? 1 : key === 'stage_cycle' ? '' : key]));
binding.schema_id = 'dd-flow/native-work-failure@1';
binding.harness_id = 'zcode-acp';
const failure = (b = binding) => ({ code: 'harness_adapter_failed', details: { controller: { error: { code: 'fanout_child_failed', details: { failures: [{ status: 'failed', work_id: b.work_id, terminal_turn_id: b.terminal_turn_id, native_binding: b, provider_error: { code: 'model_request_failed', attribution: { reason: 'unknown' }, message: 'secret' } }] } } } } });

test('managed shell transport failure survives nested diagnostics without reclassifying authored usage', () => {
  const transport = { code: 'wrapper', details: { controller: { error: { code: 'invocation_scope_unproven', details: {
    reason: 'managed_shell_context_missing', phase: 'prepare', effect: 'no_effect', recoverable: false,
    cause: { code: 'usage', parameter: 'project-root', reason: 'missing_required_option' }
  } } } } };
  assert.equal(isInfrastructureFailure(transport), true);
  assert.equal(isInfrastructureFailure(failureDiagnostic(transport)), true);
  assert.equal(failureDiagnostic(transport).details.controller.error.details.reason, 'managed_shell_context_missing');
  const usage = { code: 'wrapper', details: { controller: { error: transport.details.controller.error.details.cause } } };
  assert.equal(isInfrastructureFailure(usage), false);
  assert.equal(isInfrastructureFailure(failureDiagnostic(usage)), false);
});

test('native attribution needs independent facts, never a receipt-shaped claim', async () => {
  const error = failure();
  assert.equal(validateNativeFailureEvidence(error).status, 'unconfirmed');
  assert.equal(validateNativeFailureEvidence(error, [{ ...binding, outcome: 'failed' }]).status, 'confirmed');
  for (const key of ['run_id','stage','parent_work_id']) {
    const contradictory = failure(); contradictory.details.controller.error.details[key] = 'foreign';
    assert.equal(validateNativeFailureEvidence(contradictory, [{ ...binding, outcome: 'failed' }]).status, 'unconfirmed', key);
  }
  for (const key of nativeBindingFields) assert.equal(validateNativeFailureEvidence(error, [{ ...binding, [key]: key === 'generation' ? 2 : 'foreign', outcome: 'failed' }]).status, 'unconfirmed', key);
  const foreignController = failure(); foreignController.details.controller.controller_id = 'foreign';
  assert.equal(validateNativeFailureEvidence(foreignController, [{ ...binding, outcome: 'failed' }]).status,'unconfirmed');
  assert.equal(isInfrastructureFailure(error), false);
  assert.equal(isInfrastructureFailure({ ...error, native_failure_verified: true }), false);
  assert.equal(hasVerifiedNativeFailure(error), false);
  assert.equal((await verifyCapturedNativeFailure({ evalRoot: '/unavailable', result: error })).status, 'unconfirmed');
});

test('causal traversal deduplicates, bounds, rejects cycles and excludes cleanup', () => {
  const node = { code: 'provider_account' };
  assert.equal(causalNodes({ cause: node, details: { cause: node }, cleanup_error: { code: 'provider_quota_exhausted' } }).nodes.length, 2);
  node.cause = node;
  assert.equal(causalNodes(node).incomplete, true);
  assert.equal(isInfrastructureFailure(node), false);
  const error = { code: 'wrapper' }; let current = error;
  for (let i = 0; i < 20; i++) current = current.cause = { code: 'wrapper' };
  current.code = 'provider_account';
  assert.equal(causalNodes(error).incomplete, true);
  assert.equal(classifyInterruption(error).retryable, false);
  let shared = { code: 'leaf' };
  for (let i = 0; i < 12; i++) shared = { code: 'wrapper', cause: shared, details: { cause: shared, primary_error: shared, error: shared, controller: { error: shared } } };
  assert.equal((JSON.stringify(failureDiagnostic(shared)).match(/"code":"wrapper"/g) ?? []).length,12,'diagnostics visit each shared causal node only once');
  assert.equal(isInfrastructureFailure(shared),false,'the infrastructure predicate also deduplicates shared causal nodes');
  let wrapped = { code: 'storage_write_failed' };
  for (let i = 0; i < 12; i++) wrapped = { code: 'wrapper', cause: wrapped };
  assert.equal(isInfrastructureFailure(wrapped),true,'classification and infrastructure share the 12-hop causal boundary');
});

test('typed account, unavailable and budget share infrastructure classification through all cause branches', () => {
  for (const code of ['provider_account', 'provider_unavailable', 'provider_timeout', 'agy_provider_account', 'agy_provider_timeout']) {
    for (const wrap of [cause => ({ cause }), cause => ({ details: { cause } }), cause => ({ details: { primary_error: cause } }), cause => ({ details: { controller: { error: cause } } }), cause => ({ details: { error: cause } })]) {
      const error = { code: 'harness_adapter_failed', ...wrap({ code, message: 'secret' }) };
      assert.equal(isInfrastructureFailure(error), true);
      assert.equal(failureAttribution(error), 'evaluation_infrastructure');
      assert.equal(isInfrastructureFailure(failureDiagnostic(error)), true);
      assert.ok(!JSON.stringify(failureDiagnostic(error)).includes('secret'));
    }
  }
  const conflicting = { code: 'harness_adapter_failed', cause: { code: 'provider_account' }, details: { primary_error: { code: 'provider_quota_exhausted' } } };
  assert.equal(isInfrastructureFailure(conflicting), false);
  assert.equal(classifyInterruption(conflicting).source, 'unknown');
  assert.equal(classifyInterruption({ code: 'work_checks_failed', message: 'HTTP429 quota' }).source, 'runner');
  assert.equal(isInfrastructureFailure({ code: 'work_checks_failed', cleanup_error: { code: 'provider_account' } }), false);
});

test('safe nested fanout diagnostic retains binding but never native prose', () => {
  const diagnostic = failureDiagnostic(failure());
  assert.equal(diagnostic.details.controller.error.details.failures[0].native_binding.work_session_id, binding.work_session_id);
  assert.ok(!JSON.stringify(diagnostic).includes('secret'));
  assert.equal(diagnostic.details.controller.error.details.failures[0].provider_error.code, 'model_request_failed');
});

const baseBinding = binding;
for (const nativeHarness of ['zcode-acp','codex-desktop']) test(`${nativeHarness}: owned frozen registries plus independent terminal journal grant validity, stale journal does not`, async () => {
  const binding = {...baseBinding,harness_id:nativeHarness};
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'native083-')));
  const execution = 'e2e', snapshot = path.join(root, 'recovery', 'capture'), runtime = path.join(snapshot, 'runtime');
  const runRoot = path.join(runtime, 'projects', binding.project_id, 'runs', binding.run_id);
  const originalRuntime = path.join(root,'executions',execution,'dd-flow-home');
  const originalProject = path.join(root,'executions',execution,'project');
  const journalRelative = path.join('projects',binding.project_id,'runs',binding.run_id,'controllers',binding.controller_id,'session-1','adapter.events.jsonl');
  const session = { id: binding.parent_provider_session_id, journal: path.join(originalRuntime,journalRelative) };
  const settlement = { settled: true };
  try {
    await mkdir(path.dirname(path.join(runtime,journalRelative)), { recursive: true });
    await mkdir(path.join(snapshot,'workspace'), { recursive: true });
    await mkdir(path.join(root,'executions',execution), { recursive: true });
    await writeFile(path.join(root,'manifest.json'),JSON.stringify({runtime_recovery_home:path.join(root,'recovery')}));
    await writeFile(path.join(root,'executions',execution,'managed-runtime.json'),JSON.stringify({schema_id:'dd-eval/managed-runtime@1',run_id:binding.run_id,runtime_root:originalRuntime,project_root:originalProject}));
    const db = new DatabaseSync(path.join(runtime,'db.sqlite'));
    db.exec(`CREATE TABLE run_recovery_guards(recovery_id,run_id,status,generation,project_id,settlement_json); CREATE TABLE run_controls(control_id,recovery_id,run_id,project_id);
      CREATE TABLE run_controllers(controller_id,project_id,run_id,generation,state_json); CREATE TABLE work_sessions(id,work_id,session_id,status);
      CREATE TABLE works(work_id,parent_work_id,project_id,run_id,status); CREATE TABLE sessions(session_id,project_id,provider_session_id,harness,parent_session_id,provider_parent_session_id);
      CREATE TABLE stage_work_memberships(project_id,run_id,work_id,stage,attempt,cycle);`);
    db.prepare('INSERT INTO run_recovery_guards VALUES(?,?,?,?,?,?)').run('R',binding.run_id,'sealed',1,binding.project_id,JSON.stringify(settlement));
    db.prepare('INSERT INTO run_controls VALUES(?,?,?,?)').run('C','R',binding.run_id,binding.project_id);
    db.prepare('INSERT INTO run_controllers VALUES(?,?,?,?,?)').run(binding.controller_id,binding.project_id,binding.run_id,1,JSON.stringify({stage:binding.stage,current_session:0,sessions:[session]}));
    db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(binding.work_session_id,binding.work_id,'child-store','failed');
    db.prepare('INSERT INTO works VALUES(?,?,?,?,?)').run(binding.work_id,binding.parent_work_id,binding.project_id,binding.run_id,'failed');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('child-store',binding.project_id,binding.provider_session_id,binding.harness_id,'parent-store',binding.parent_provider_session_id);
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('parent-store',binding.project_id,binding.parent_provider_session_id,binding.harness_id,null,null);
    db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?,?)').run(binding.project_id,binding.run_id,binding.work_id,binding.stage,binding.stage_attempt_id,binding.stage_cycle); db.close();
    const providerError = nativeHarness === 'zcode-acp' ? {} : failure(binding).details.controller.error.details.failures[0].provider_error;
    const rawNativeError = { ...providerError, reason: 'не типизированная причина', headers: { authorization: 'secret' }, message: 'secret' };
    await writeFile(path.join(runRoot,'timeline.jsonl'),JSON.stringify({run_id:binding.run_id,stage:binding.stage,type:'native_child_reconciliation',reconciled:[{outcome:'failed',native_binding:binding}],observations:{harness_id:binding.harness_id,parent_session_id:binding.parent_provider_session_id,children:[{status:'failed',session_id:binding.provider_session_id,parent_session_id:binding.parent_provider_session_id,terminal_turn_id:binding.terminal_turn_id,provider_error:providerError}]}})+'\n');
    await writeFile(path.join(runtime,path.dirname(journalRelative),'daemon.json'),JSON.stringify({sessions:[{provider_session_id:binding.parent_provider_session_id,root_provider_session_id:binding.parent_provider_session_id,adapter_session_id:'native-root'}]}));
    const journal = nativeHarness === 'codex-desktop' ? [
      {kind:'outbound',payload:{id:1,method:'thread/read',params:{threadId:binding.provider_session_id}}},
      {kind:'inbound',payload:{id:1,result:{thread:{id:binding.provider_session_id,turns:[{id:binding.terminal_turn_id,status:'failed',error:rawNativeError}]}}}}
    ] : [
      {kind:'outbound',payload:{id:1,method:'zcode/session/subagents',params:{sessionId:'native-root'}}},
      {kind:'inbound',payload:{id:1,result:{ended:{items:[{childSessionId:binding.provider_session_id,status:'failed',startedAt:1,endedAt:2}]}}}},
      {kind:'outbound',payload:{id:2,method:'zcode/session/retainedTerminal',params:{sessionId:binding.provider_session_id,startedAt:1,endedAt:2}}},
      {kind:'inbound',payload:{id:2,result:{sessionId:binding.provider_session_id,available:true,terminal_turn_id:binding.terminal_turn_id,startedAt:1,endedAt:2,provider_error:rawNativeError}}}];
    await writeFile(path.join(runtime,journalRelative),journal.map(JSON.stringify).join('\n')+'\n');
    const manifest = {schema_id:'dd-flow/eval-run-snapshot@5',purpose:'recovery',stage_entry:null,run_id:binding.run_id,project_id:binding.project_id,recovery_id:'R',project_root:originalProject,dd_flow_home:originalRuntime,consistency:'sealed_writer_barrier_required',workspace:{sha256:snapshotTreeHash(path.join(snapshot,'workspace'))},runtime_sha256:snapshotTreeHash(runtime)};
    const bytes = JSON.stringify(manifest); await writeFile(path.join(snapshot,'snapshot.json'),bytes);
    const result = { ...failure(binding),execution,state:'failed',run_id:binding.run_id,stage:'specify',recovery:{snapshot,manifest:path.join(snapshot,'snapshot.json'),manifest_sha256:createHash('sha256').update(bytes).digest('hex'),control_id:'C',generation:1,recovery_id:'R',settlement} };
    result.details.controller.error.details.failures[0].provider_error = providerError;
    await resolveBoundSnapshot({evalRoot:root,execution,result,checkpoint:result.recovery,purpose:'recovery'});
    const verified = await verifyCapturedNativeFailure({evalRoot:root,result});
    assert.equal(verified.status,'confirmed',JSON.stringify(verified));
    assert.equal(isInfrastructureFailure(result),true);
    assert.equal(classifyInterruption(result).retryable,false);
    assert.equal(classifyInterruption(result).category,'native_execution_failed','actual stage comes from captured controller, not entry stage');
    assert.equal(executionEvidence(result).failure.attribution,'evaluation_infrastructure');
    const report = buildReport({root,manifest:{run_id:'EVAL-test',executions:[{id:execution}]},state:'completed_with_failures',results:[result]});
    assert.equal(report.run_validity,'invalid_infrastructure_flow');
    assert.equal(report.executions[0].failure.category,'native_execution_failed');
    assert.equal(isInfrastructureFailure(structuredClone(result)),false,'serialized flags are not authority');
    const carrier = result.details.controller.error.details;
    carrier.stage = null;
    assert.equal(isInfrastructureFailure(result),false,'null scope is not the absence of an optional carrier field');
    carrier.stage = 'foreign';
    assert.equal(isInfrastructureFailure(result),false,'changed carrier scope invalidates authority');
    delete carrier.stage;
    result.details.controller.generation = binding.generation + 1;
    assert.equal(isInfrastructureFailure(result),false,'changed wrapper controller invalidates authority');
    delete result.details.controller.generation;
    carrier.failures[0].native_binding.schema_id = 'foreign';
    assert.equal(isInfrastructureFailure(result),false,'changed binding contract invalidates authority');
    carrier.failures[0].native_binding.schema_id = 'dd-flow/native-work-failure@1';
    result.execution = 'foreign';
    assert.equal(isInfrastructureFailure(result),false,'execution relocation invalidates authority');
    result.execution = execution;
    result.recovery.settlement.settled = false;
    assert.equal(isInfrastructureFailure(result),false,'changed settlement invalidates authority');
    result.recovery.settlement.settled = true;
    result.run_id = 'foreign';
    assert.equal(isInfrastructureFailure(result),false,'verified identity cannot survive mutation');
    result.run_id = binding.run_id;
    result.recovery.settlement.circular = result.recovery.settlement;
    assert.equal(hasVerifiedNativeFailure(result),false,'unserializable signature never grants authority');
    delete result.recovery.settlement.circular;
    await writeFile(path.join(runtime,journalRelative),'');
    assert.equal((await verifyCapturedNativeFailure({evalRoot:root,result})).status,'unconfirmed');
    assert.equal(isInfrastructureFailure(result),false);
  } finally { await rm(root,{recursive:true,force:true}); }
});
