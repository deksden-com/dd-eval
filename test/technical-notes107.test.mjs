import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile, chmod, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { technicalNotes, recordTechnicalNote } from '../lib/technical-notes.mjs';
import { readEvents, writeJsonAtomic, appendEvent } from '../lib/runner-events.mjs';
import { subjectHistoryEvents, runResultRevision, buildReport, frozenCandidate, buildEvidencePacket, interactionCleanupPending, scopeResourcesPending, publishSubjectTechnicalNotes, projectSubjectTechnicalNotes, resolveRetiredTechnicalNotes, reportMarkdown, runnerResume, managedCompletionEvidence, runnerFinalizeSettled, publishExecutionStatistics } from '../lib/runner.mjs';
import { hashJson, sha256 } from '../lib/runner-events.mjs';
import { observeManagedRun } from '../lib/managed-flow-client.mjs';
import { observedCompletionScope } from '../lib/completion-scope.mjs';
import { baselineExecutionSettled } from '../lib/baseline-admission.mjs';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { assertNativeResourceRetired } from '../lib/judge-cleanup.mjs';

test('technical notes resolve and deduplicate without changing semantic result/history', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notes107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl'), manifest = { run_id: 'EVAL-test', evidence_contract: 'dd-eval/evaluator-evidence@2', executions: [{ id: 'e2e' }] };
  const results = [{ execution: 'e2e', state: 'candidate_ready' }];
  const before = (await frozenCandidate({ root, manifest, results })).candidate;
  const evidence = hashJson(buildEvidencePacket({ manifest, results, candidate: before, events: [] }));
  const note = { code: 'cleanup_pending', message: 'Resource cleanup pending', phase: 'cleanup', consequence: 'cleanup_pending', source_operation_id: 'EVAL-test:e2e:launch' };
  const revision = runResultRevision([], manifest);
  await recordTechnicalNote(file, manifest.run_id, note);
  await recordTechnicalNote(file, manifest.run_id, note);
  await recordTechnicalNote(file, manifest.run_id, note, true);
  const events = await readEvents(file);
  assert.equal(events.length, 2);
  assert.equal(technicalNotes(events)[0].state, 'resolved');
  assert.deepEqual(subjectHistoryEvents(events, manifest), []);
  assert.equal(runResultRevision(events, manifest), revision);
  assert.equal((await frozenCandidate({ root, manifest, results })).candidate.immutable_hash, before.immutable_hash);
  assert.equal(hashJson(buildEvidencePacket({ manifest, results, candidate: before, events })), evidence);
  // Even a legacy correlation field must not put technical events into Judge history.
  events[0].data.operation_id = note.source_operation_id;
  assert.deepEqual(subjectHistoryEvents(events, manifest), []);
  const report = buildReport({ root, manifest, results: [], state: 'completed', executionState: 'completed', judgeStatus: 'completed', cleanupState: 'pending', events });
  assert.equal(report.state, 'completed');
  assert.equal(report.assessment_state, 'completed');
  assert.equal(report.technical_notes.length, 1);
});

test('baseline physical proof is separate from retirement bookkeeping; legacy unknown stays unproven', () => {
  assert.equal(baselineExecutionSettled({ cleanup: 'settled' }), true);
  assert.equal(baselineExecutionSettled({ cleanup: 'pending' }), false);
  const proof = { schema_id: 'dd-eval/baseline-execution-settlement@1', state: 'settled', process_id: 'PROC-test', pid: 42, pid_started_at: 'birth', observed_at: new Date().toISOString() };
  assert.equal(baselineExecutionSettled({ cleanup: 'pending', execution_settlement: proof }), true);
  assert.equal(baselineExecutionSettled({ cleanup: 'settled', execution_settlement: { ...proof, pid_started_at: null } }), false);
  assert.equal(baselineExecutionSettled({ cleanup: 'pending', execution_settlement: { ...proof, state: 'unknown' } }), false);
});

test('assessment waits only for a proven active capture owner, never cleanup alone', () => {
  const input = { root: '/owned', manifest: { run_id: 'EVAL-test', executions: [{ id: 'e2e' }] }, state: 'completed', executionState: 'completed', cleanupState: 'pending', judgeStatus: 'not_run_incomplete_evidence' };
  for (const owner of ['live', 'absent', 'unknown']) {
    const report = buildReport({ ...input, results: [{ execution: 'e2e', state: 'candidate_ready', recovery: { capture_error: { code: 'recovery_capture_pending' }, finalization: { owner } } }] });
    assert.equal(report.state, 'completed');
    assert.equal(report.execution_state, 'completed');
    assert.equal(report.assessment_state, owner === 'live' ? 'pending' : 'unavailable');
  }
});

for (const mode of ['missing', 'corrupt', 'interaction', 'required-interaction']) test(`accepted terminal controller survives ${mode} assessment evidence without Judge or candidate fabrication`, async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'accepted-capture107-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evalId = 'EVAL-accepted', operationId = `${evalId}:e:launch`, runId = 'RUN-accepted';
  const controller = { controller_id: 'DRV-accepted', project_id: 'PRJ-accepted', run_id: runId, request_id: `eval:${sha256(operationId)}`, generation: 1, status: 'completed', stage: 'merge', sessions: [] };
  const boundary = { stage: 'merge', manifest: path.join(root, 'snapshot.json'), manifest_sha256: '0'.repeat(64) };
  if (mode !== 'missing') {
    await writeJsonAtomic(boundary.manifest, { snapshot: true });
    if (mode !== 'corrupt') boundary.manifest_sha256 = sha256(await readFile(boundary.manifest));
  }
  const bin = path.join(root, 'flow.mjs');
  await writeFile(bin, `#!/usr/bin/env node\nconsole.log(JSON.stringify({controller:${JSON.stringify(controller)},events:${JSON.stringify(mode !== 'missing' ? [{ sequence: 1, type: 'boundary_captured', data: boundary }] : [])}}));\n`);
  await chmod(bin, 0o700);
  const observed = await observeManagedRun({ bin, env: {}, projectRoot: root, runId, requestId: controller.request_id, controllerId: controller.controller_id });
  const lifecycle = { run_id: runId, stage_status: 'done', status: { run: { id: runId, project_id: controller.project_id }, index: { run_id: runId, current_stage: 'merge', stage_runs: [{ stage: 'merge', status: 'done' }] } } };
  const execution = { id: 'e', stage: 'specify', terminal_stage: 'merge', mode: 'e2e' };
  const completion = await managedCompletionEvidence({ execution, observed, lifecycle, runId, operationId });
  if (['missing', 'corrupt'].includes(mode)) {
    assert.equal(completion.candidate, null);
    assert.equal(completion.incomplete_evidence.failure.code, mode === 'corrupt' ? 'snapshot_checksum_mismatch' : 'controller_boundary_missing');
  } else assert.deepEqual(completion.candidate, boundary);
  if (mode === 'required-interaction') completion.incomplete_evidence = { missing: 'Required HITL was not observed', failure: { code: 'required_hitl_missing', stages: ['specify'] } };
  const result = { execution: 'e', execution_operation_id: operationId, state: 'candidate_ready', run_id: runId, stage: 'merge', attempt: path.join(root, 'executions/e'), driver: observed, lifecycle, ...completion };
  const bounded = { ...execution, completion_scope: { entry_stage: 'specify', effective_terminal_stage: 'merge', requested_stop_after: 'merge',
    case_entry_stage: 'specify', case_terminal_stage: 'merge', case_contour: ['specify', 'merge'], requested_full_case: true } };
  assert.equal(observedCompletionScope(bounded, result).target_reached, true);
  for (const wrong of [{ run_id: 'RUN-foreign' }, { request_id: 'foreign' }, { status: 'running' }, { generation: -1 }]) {
    const foreign = { ...observed, controller: { ...controller, ...wrong } };
    await assert.rejects(managedCompletionEvidence({ execution, observed: foreign, lifecycle, runId, operationId }), { code: 'stage_boundary_incomplete' });
    assert.equal(observedCompletionScope(bounded, { ...result, candidate: null, driver: foreign }).target_reached, false);
  }
  for (const wrong of [{ ...lifecycle, status: { ...lifecycle.status, run: { ...lifecycle.status.run, id: 'RUN-foreign' } } },
    { ...lifecycle, status: { ...lifecycle.status, index: { ...lifecycle.status.index, stage_runs: [{ stage: 'merge', status: 'running' }] } } },
    { ...lifecycle, status: { ...lifecycle.status, index: { ...lifecycle.status.index, current_stage: 'code' } } }]) {
    await assert.rejects(managedCompletionEvidence({ execution, observed, lifecycle: wrong, runId, operationId }), { code: 'stage_boundary_incomplete' });
    assert.equal(observedCompletionScope(bounded, { ...result, candidate: null, lifecycle: wrong }).target_reached, false);
  }
  const recovered = { ...result, execution_operation_id: `${operationId}:recover:REC-1`, execution_launch_operation_id: operationId };
  assert.equal(observedCompletionScope(bounded, recovered).target_reached, true);
  assert.deepEqual((await managedCompletionEvidence({ execution, observed, lifecycle, runId, operationId: recovered.execution_operation_id, launchOperationId: operationId })).candidate, completion.candidate);
  const manifest = { run_id: evalId, case_id: 'sdlc-eval-2026-summer-task-priority', executions: [mode === 'missing' ? bounded : execution],
    profile: { ...(mode === 'missing' ? { schema_id: 'dd-eval/run-profile@2', selection: { stop_after: 'merge' } } : {}), judge: { enabled: true, profile_id: 'must-not-run' } } };
  const manifestFile = path.join(root, 'manifest.json'), eventsFile = path.join(root, 'events.jsonl');
  await writeJsonAtomic(manifestFile, manifest);
  for (const phase of ['started', 'completed']) await appendEvent(eventsFile, { source: 'test', runId: evalId, executionId: 'e', type: `dev.dd.eval.operation.${phase}`, data: { operation_id: operationId, ...(phase === 'completed' ? { result } : {}) } });
  await appendEvent(eventsFile, { source: 'test', runId: evalId, executionId: 'e', type: 'dev.dd.eval.execution.candidate_ready', data: { execution: 'e', execution_operation_id: operationId, result } });
  if (mode === 'interaction') await appendEvent(eventsFile, { source: 'test', runId: evalId, executionId: 'e', type: 'dev.dd.eval.hitl.matched', data: { receipt_file: path.join(root, 'missing-interaction/result.json') } });
  let judgeAdmissions = 0;
  const finalized = await runnerFinalizeSettled({ evalRoot: root, expectedManifestSha256: sha256(await readFile(manifestFile)), authorizeFinalization: async () => { judgeAdmissions++; throw new Error('Judge must not run'); } });
  assert.equal(finalized.execution_state, 'completed'); assert.equal(finalized.state, mode === 'missing' ? 'finished' : 'completed');
  assert.equal(finalized.judge_status, 'not_run_incomplete_evidence');
  const report = JSON.parse(await readFile(path.join(root, 'reports/report.json')));
  assert.equal(report.assessment_state, 'unavailable'); assert.equal(report.candidate, undefined);
  assert.equal(judgeAdmissions, 0);
  await assert.rejects(readFile(path.join(root, 'candidate.json')), { code: 'ENOENT' });
});

test('optional statistics companion publication cannot reject accepted inline observations', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optional-statistics107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl'), statistics = { usage: { tokens: 42 }, sessions: [] }, before = structuredClone(statistics);
  await publishExecutionStatistics(root, statistics, { eventsFile: file, runId: 'EVAL-test', operationId: 'EVAL-test:e:launch' });
  assert.deepEqual(statistics, before);
  assert.equal(technicalNotes(await readEvents(file))[0].code, 'statistics_publication_unavailable');
});

test('Interaction Judge cleanup debt is visible separately and never hidden by Subject stop', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'interaction-cleanup107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'interaction'), file = path.join(root, 'events.jsonl');
  const verdict = { profile_id: 'offline', session_id: 'judge-session', verdict: { status: 'matched' } };
  await settledJudge(directory, verdict);
  await rm(path.join(directory, 'cleanup.json'));
  const receipt = path.join(directory, 'result.json'), before = await readFile(receipt);
  assert.equal(await interactionCleanupPending(file, 'EVAL-test', [{ type: 'dev.dd.eval.hitl.matched', data: { receipt_file: receipt } }]), true);
  const notes = technicalNotes(await readEvents(file));
  assert.equal(notes[0].code, 'interaction_judge_cleanup_pending');
  assert.equal(notes[0].state, 'open');
  assert.deepEqual(await readFile(receipt), before);
  const inventory = { scope_id: 'EVAL-test', processes: [{ kind: 'eval-observer', owner_id: 'EVAL-test', state: 'running' }], provider_turns: [] };
  assert.equal(scopeResourcesPending(inventory, 'EVAL-test'), false);
  inventory.processes.push({ kind: 'native-provider', owner_id: 'judge:owned', state: 'running' });
  assert.equal(scopeResourcesPending(inventory, 'EVAL-test'), true);
});

test('terminal failed registry record cannot hide a live child in its owned PGID', () => {
  const record = { id: 'PROC-judge', kind: 'native-provider', owner_id: 'judge:owned', state: 'failed', pid: 100, pid_started_at: 'old-birth', metadata_json: JSON.stringify({ process_group_id: 100, role: 'judge' }) };
  const inventory = { scope_id: 'EVAL-test', processes: [record], provider_turns: [] };
  assert.equal(scopeResourcesPending(inventory, 'EVAL-test', { processes: [{ pid: 101, pgid: 100, ppid: 1, started: 'child-birth', zombie: false }], retiredIds: new Set([record.id]) }), true);
  assert.equal(scopeResourcesPending(inventory, 'EVAL-test', { processes: [] }), true, 'dead local Judge is not native retirement proof');
  assert.equal(scopeResourcesPending(inventory, 'EVAL-test', { processes: [], retiredIds: new Set([record.id]) }), false);
});

test('resource-only native retirement proof does not require a Judge verdict', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'no-verdict-retirement107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await settledJudge(root, { profile_id: 'offline', session_id: 'judge' });
  await rm(path.join(root, 'result.json'));
  assert.equal((await assertNativeResourceRetired(path.join(root, 'daemon'))).shutdown_state, 'clean');
});

test('bound Subject technical notes project into EVAL report/status without entering semantic evidence', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'subject-notes107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl'), runId = 'EVAL-test', source = 'RUN-test';
  const note = { id: 'source-note', run_id: source, code: 'native_cleanup_pending', message: 'Accepted Work retained', phase: 'cleanup', generation: 1, state: 'open', consequence: 'cleanup_pending', first_seen: new Date().toISOString(), last_seen: new Date().toISOString() };
  await publishSubjectTechnicalNotes(file, runId, source, [note, { ...note, id: 'foreign', run_id: 'RUN-foreign' }]);
  const events = await readEvents(file), manifest = { run_id: runId, executions: [] };
  assert.equal(technicalNotes(events).length, 1);
  assert.equal(technicalNotes(events)[0].source_run_id, source);
  const report = buildReport({ root, manifest, results: [], state: 'completed', events });
  assert.match(reportMarkdown(report), /native_cleanup_pending/);
  const current = projectSubjectTechnicalNotes(events, runId, [{ run_id: source, receipt: { technical_notes: [{ ...note, state: 'resolved' }] } }]);
  assert.equal(current[0].state, 'resolved');
  assert.deepEqual(subjectHistoryEvents(events, manifest), []);
  assert.equal(runResultRevision(events, manifest), runResultRevision([], manifest));
});

test('later exact retirement resolves source debt without resurrecting an unchanged engine warning', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'source-retirement107-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'events.jsonl'), scope = 'EVAL-test', source = 'RUN-test', directory = path.join(root, 'owned-daemon');
  const note = { id: 'debt', run_id: source, code: 'native_cleanup_pending', message: 'Result retained', phase: 'cleanup', generation: 1,
    resource_identity: directory, state: 'open', consequence: 'cleanup_pending', first_seen: '2026-10-26T10:00:00Z', last_seen: '2026-10-26T10:00:00Z' };
  await publishSubjectTechnicalNotes(file, scope, source, [note]);
  const recorded = technicalNotes(await readEvents(file));
  const record = { id: 'PROC-old', run_id: source, kind: 'native-provider', state: 'failed', pid: 123, pid_started_at: 'old-birth', started_at: '2026-10-26T09:00:00Z',
    metadata_json: JSON.stringify({ state_dir: directory, run_generation: 1, budget: { scope_id: scope }, process_group_id: 123 }) };
  const inventory = { scope_id: scope, processes: [record], provider_turns: [] };
  const proof = { pending: false, processes: [], retiredIds: new Set([record.id]) };
  const resolved = resolveRetiredTechnicalNotes(recorded, inventory, scope, proof);
  assert.equal(resolved[0].state, 'resolved');
  assert.equal(resolveRetiredTechnicalNotes(recorded, inventory, scope, { ...proof, retiredIds: new Set() })[0].state, 'open');
  assert.equal(resolveRetiredTechnicalNotes(recorded, inventory, scope, { ...proof, processes: [{ pid: 124, pgid: 123, zombie: false }] })[0].state, 'open');
  assert.equal(resolveRetiredTechnicalNotes(recorded, { ...inventory, processes: [{ ...record, started_at: '2026-10-26T11:00:00Z' }] }, scope, proof)[0].state, 'open', 'new incarnation at same path cannot resolve old debt');
  await recordTechnicalNote(file, scope, resolved[0], true);
  const before = await readFile(file);
  await publishSubjectTechnicalNotes(file, scope, source, [note]);
  assert.deepEqual(await readFile(file), before);
  assert.equal(projectSubjectTechnicalNotes(await readEvents(file), scope, [{ run_id: source, receipt: { technical_notes: [note] } }])[0].state, 'resolved');
  const globalNote = { code: 'execution_cleanup_pending', state: 'open', consequence: 'cleanup_pending', resource_identity: root };
  assert.equal(resolveRetiredTechnicalNotes([globalNote], inventory, scope, proof)[0].state, 'resolved');
  assert.equal(resolveRetiredTechnicalNotes([globalNote], { ...inventory, ok: false }, scope, proof)[0].state, 'open');
});

for (const fault of ['foreign-run', 'stale-control', 'stale-cleanup-only']) test(`empty physical scope cannot override unconfirmed RUN binding (${fault})`, async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'binding-retirement107-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home'), bin = path.join(runtime, 'bin/dd-flow');
  const resources = path.join(root, 'resources');
  for (const directory of [project, path.dirname(bin), resources, path.join(root, 'control-runtime')]) await mkdir(directory, { recursive: true });
  const status = { scope: { run_id: fault === 'foreign-run' ? 'RUN-foreign' : 'RUN-test' }, settled: false,
    ...(fault === 'stale-control' ? { control: { current: false, control_id: 'CTRL-new', recovery_id: 'REC-new', generation: 2 } } : {}) };
  const inventory = { scope_id: 'EVAL-test', ok: true, processes: [], provider_turns: [] };
  await writeFile(bin, `#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv[2]==='runtime'?${JSON.stringify(inventory)}:${JSON.stringify(status)}));\n`);
  await chmod(bin, 0o700);
  await writeJsonAtomic(path.join(attempt, 'managed-runtime.json'), { schema_id: 'dd-eval/managed-runtime@1', project_root: project, runtime_root: runtime, run_id: 'RUN-test' });
  const manifest = { run_id: 'EVAL-test', runtime_resource_home: resources, runtime_control_bin: bin, case_id: 'sdlc-eval-2026-summer-task-priority',
    executions: [{ id: 'e', stage: 'specify', terminal_stage: 'merge', mode: 'e2e' }], subject_profile: {}, profile: { judge: { enabled: false } } };
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  for (const phase of ['started', 'failed']) await appendEvent(path.join(root, 'events.jsonl'), { source: 'test', runId: manifest.run_id, executionId: 'e', type: `dev.dd.eval.operation.${phase}`,
    data: { operation_id: 'EVAL-test:e:launch', error: { code: 'original_failure', message: 'Retained failure' } } });
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'test', runId: manifest.run_id, executionId: 'e', type: 'dev.dd.eval.execution.failed',
    data: { execution_operation_id: 'EVAL-test:e:launch', code: 'original_failure', error: 'Retained failure', run_id: 'RUN-test',
      ...(fault === 'stale-control' ? { recovery: { control_id: 'CTRL-old', recovery_id: 'REC-old', generation: 1 } } : {}) } });
  const result = await runnerResume({ evalRoot: root });
  assert.equal(result.cleanup_state, fault === 'stale-cleanup-only' ? 'settled' : 'pending');
  assert.equal(result.executions[0].code, 'original_failure');
  assert.equal(result.candidate, undefined);
});
