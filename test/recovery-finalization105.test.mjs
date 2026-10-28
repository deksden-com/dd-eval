import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, chmod, writeFile, readFile, rm, realpath, rename, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { captureRecoveryEvidence, runnerCleanup, runnerCleanupReceipt, runnerFinalizeSettled, storedExecutionResults, runResultRevision, recoveryHistory, runnerControlStatus, recoverExecution, runnerCancel } from '../lib/runner.mjs';
import { appendEvent, readEvents, writeJsonAtomic, sha256 } from '../lib/runner-events.mjs';
import { observeBoundSnapshot } from '../lib/snapshot-observation.mjs';
import { installSuccessfulPolicy } from './fixtures/capacity-policy.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';

test('105 late capture with real RUN receipt separates cleanup ingestion from scored Judge admission without replay', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home');
  const resources = path.join(root, 'resources'), controlHome = path.join(root, 'control-runtime'), capture = path.join(root, 'recovery/RCV-1'), bin = path.join(runtime, 'bin/dd-flow'), controlBin = path.join(controlHome, 'bin/dd-flow');
  for (const directory of [project, resources, path.dirname(controlBin), capture, path.dirname(bin)]) await mkdir(directory, { recursive: true });
  const statusFile = path.join(root, 'status.json'), inventoryFile = path.join(root, 'inventory.json'), calls = path.join(root, 'calls.jsonl');
  await writeFile(bin, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');const action=args.slice(0,3).join(' ');if(action!=='run control status'&&action!=='runtime scope status')throw Error('Unexpected native action '+action);console.log(fs.readFileSync(action==='run control status'?${JSON.stringify(statusFile)}:${JSON.stringify(inventoryFile)},'utf8'));\n`);
  await chmod(bin, 0o700);
  await writeFile(controlBin, await readFile(bin)); await chmod(controlBin, 0o700);
  const manifest = { run_id: 'EVAL-105', case_id: 'sdlc-eval-2026-summer-task-priority', runtime_control_bin: controlBin, runtime_resource_home: resources, runtime_recovery_home: path.join(root, 'recovery'),
    executions: [{ id: 'e', stage: 'code', terminal_stage: 'merge', mode: 'e2e' }], profile: { judge: { enabled: true, profile_id: 'must-not-run' } } };
  const manifestFile = path.join(root, 'manifest.json'), eventsFile = path.join(root, 'events.jsonl');
  await writeJsonAtomic(manifestFile, manifest);
  await writeJsonAtomic(path.join(attempt, 'managed-runtime.json'), { schema_id: 'dd-eval/managed-runtime@1', project_root: project, runtime_root: runtime, run_id: 'RUN-1' });
  const failure = { execution: 'e', state: 'failed', stage: 'code', run_id: 'RUN-1', code: 'check_gate_blocked', error: 'original check error', started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-01T00:01:00.000Z',
    recovery: { unavailable: true, capture_error: { code: 'recovery_capture_pending', message: 'not yet published' } },
    incomplete_evidence: { snapshot: null, missing: "Waiting for the managed controller's sealed recovery capture" } };
  for (const type of ['started', 'failed']) await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, executionId: 'e', type: `dev.dd.eval.operation.${type}`, data: { operation_id: `${manifest.run_id}:e:launch`, error: { code: failure.code, message: failure.error } } });
  await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, executionId: 'e', type: 'dev.dd.eval.execution.failed', data: { ...failure, execution_operation_id: `${manifest.run_id}:e:launch` } });
  // This fixture exercises capture of a stopped local check, not a native
  // provider. A provider needs its own daemon shutdown proof and cannot be
  // represented by an invented PID alone.
  const record = { id: 'PROC-1', kind: 'fixture-check', owner_id: 'daemon', lease_token: 'lease', pid: 2147483647, pid_started_at: 'birth', project_id: 'PRJ-1', run_id: 'RUN-1', work_id: null, check_id: null, operation_id: 'session', metadata_json: JSON.stringify({ dd_flow_home: runtime, process_group_id: 2147483647, budget: { scope_id: manifest.run_id } }), state: 'stopped' };
  const signature = createHash('sha256').update(JSON.stringify([resources, record.id, record.kind, record.owner_id, record.lease_token, record.pid, record.pid_started_at, record.project_id, record.run_id, record.work_id, record.check_id, record.operation_id, record.metadata_json])).digest('hex');
  const inventory = { scope_id: manifest.run_id, processes: [record, { id: 'observer', owner_id: manifest.run_id, kind: 'eval-observer', run_id: null, metadata_json: JSON.stringify({ role: 'observer', budget: { scope_id: manifest.run_id } }), state: 'running' }], provider_turns: [] };
  await writeJsonAtomic(inventoryFile, inventory);
  const receipt = { schema_id: 'dd-flow/run-control-receipt@1', scope: { project_id: 'PRJ-1', run_id: 'RUN-1' }, settled: false,
    control: { current: true, control_id: 'CTL-1', recovery_id: 'RCV-1', generation: 1, admission: 'draining', capture_path: null } };
  await writeJsonAtomic(statusFile, receipt);
  const before = await runnerCleanup({ evalRoot: root });
  assert.equal(before.cleanup_state, 'settled', 'physical stop does not wait for capture');
  assert.equal(before.state, 'completed_with_failures', 'missing capture cannot strand the technical report');
  assert.equal(JSON.parse(await readFile(path.join(root, 'reports/report.json'))).assessment_state, 'unavailable');
  assert.equal(before.cleanup_observation.capture, 'pending', JSON.stringify(before.executions[0].recovery));
  assert.equal(before.executions[0].recovery.recovery_id, undefined);
  const scoredBefore = await runnerFinalizeSettled({ evalRoot: root,
    expectedManifestSha256: sha256(await readFile(manifestFile)), authorizeFinalization: async () => {} });
  assert.equal(scoredBefore.judge_status, 'not_run_incomplete_evidence', 'fresh finalization cannot admit Judge before capture readiness');
  assert.equal((await readEvents(eventsFile)).filter(event => event.data?.operation === 'final_judge').length, 0);
  await writeJsonAtomic(statusFile, { ...receipt, scope: { run_id: 'FOREIGN-RUN' } });
  assert.equal((await captureRecoveryEvidence({ root, manifest, result: failure })).capture_error.code, 'execution_scope_invalid', 'a foreign not-yet-sealed status is invalid, not a transient pending publication');
  receipt.settled = true; receipt.control.admission = 'sealed'; receipt.control.capture_path = capture;
  receipt.worker = { status: 'recovery_blocked', error: { code: 'recovery_observation_budget_exhausted' } };
  receipt.control.settlement = { settled: true, nodes: [], process_bindings: [{ resource_home: resources, process_id: record.id, registration_sha256: signature }] };
  await writeJsonAtomic(statusFile, receipt);
  await writeJsonAtomic(path.join(capture, 'snapshot.json'), { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'recovery', run_id: 'RUN-1', recovery_id: 'RCV-1', project_root: project, dd_flow_home: runtime, consistency: 'sealed_writer_barrier_required', restorable: 'same-runtime-or-explicit-restore' });
  const bytesBeforeRecognition = await readFile(eventsFile);
  const args = { evalRoot: root, expectedManifestSha256: sha256(await readFile(manifestFile)), detailed: true };
  assert.equal((await runnerCleanupReceipt(args)).recognition, 'pending');
  assert.deepEqual(await readFile(eventsFile), bytesBeforeRecognition, 'recognition cannot ingest or rewrite late evidence');
  const captured = await captureRecoveryEvidence({ root, manifest, result: failure });
  assert.equal(captured.recovery_id, 'RCV-1', 'capture itself does not require observer retirement');
  const settled = await runnerCleanup({ evalRoot: root });
  assert.equal(settled.cleanup_state, 'settled'); assert.equal(settled.state, 'completed_with_failures');
  assert.equal(settled.judge_status, 'not_run_cleanup_only');
  assert.equal(settled.executions[0].code, failure.code); assert.equal(settled.executions[0].finished_at, failure.finished_at);
  assert.equal(settled.executions[0].incomplete_evidence, null);
  const once = await readFile(eventsFile), report = await readFile(path.join(root, 'reports/report.json'));
  assert.equal((await runnerCleanup({ evalRoot: root })).cleanup_state, 'settled');
  assert.deepEqual(await readFile(eventsFile), once, 'same capture cannot append another failure/terminal event');
  assert.equal((await runnerCleanupReceipt(args)).cleanup_state, 'settled');
  assert.equal((await readEvents(eventsFile)).filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
  assert.ok((await readFile(calls, 'utf8')).trim().split('\n').every(line => { const args = JSON.parse(line); return ['run control status', 'runtime scope status'].includes(args.slice(0, 3).join(' ')) || args.slice(0, 2).join(' ') === 'run status'; }), 'only diagnostic reads are permitted; no prompt, stop or resume');
  record.state = 'running'; await writeJsonAtomic(inventoryFile, inventory);
  assert.equal((await runnerCleanupReceipt(args)).cleanup_state, 'pending', 'active owned child blocks physical recognition despite sealed capture');
  assert.deepEqual(await readFile(path.join(root, 'reports/report.json')), report, 'recognition never rewrites published report');
  const scored = await runnerFinalizeSettled({ ...args, authorizeFinalization: async () => {} });
  assert.equal(scored.cleanup_state, 'pending');
  assert.equal(scored.cleanup_observation.capture, 'ready');
  assert.equal(scored.judge_status, 'failed', 'ready capture admits Judge independently of cleanup recognition; missing fixture profile prevents a provider call');
  assert.equal((await readEvents(eventsFile)).filter(event => event.type === 'dev.dd.eval.operation.started' && event.data.operation_id === `${manifest.run_id}:e:launch`).length, 1, 'scored finalization never repeats Subject');
  record.state = 'stopped'; await writeJsonAtomic(inventoryFile, inventory);
  await writeJsonAtomic(statusFile, { ok: false, code: 'operation_observation_lost', error: 'readback disconnected' });
  const unknown = await runnerCleanup({ evalRoot: root });
  assert.equal(unknown.cleanup_state, 'pending', 'temporary observation loss is not proof that the bound capture is corrupt');
  assert.notEqual(unknown.state, 'recovery_blocked'); assert.equal(unknown.executions[0].code, failure.code);
  await writeJsonAtomic(statusFile, receipt);
  assert.equal((await runnerCleanup({ evalRoot: root })).cleanup_state, 'settled', 'fresh readback can recover the observation without native replay');
});

for (const changed of ['none', 'project', 'runtime', 'binding', 'attempt', 'run-type']) test(`105 recovery callers validate owned paths before any native read (${changed})`, async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-owned-')));
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-foreign-')));
  t.after(() => Promise.all([root, outside].map(file => rm(file, { recursive: true, force: true }))));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home');
  const capture = path.join(root, 'recovery/RCV-1'), bindingFile = path.join(attempt, 'managed-runtime.json'), calls = path.join(root, 'calls.jsonl');
  const resources = path.join(root, 'resources'), controlBin = path.join(root, 'control-runtime/bin/dd-flow'), scopeCalls = path.join(root, 'scope-calls.jsonl');
  for (const directory of [project, path.join(runtime, 'bin'), capture, resources, path.dirname(controlBin)]) await mkdir(directory, { recursive: true });
  const manifest = { run_id: 'EVAL-owned-105', executions: [{ id: 'e' }], profile: { judge: { enabled: false } }, runtime_recovery_home: path.join(root, 'recovery'), runtime_control_bin: controlBin, runtime_resource_home: resources };
  // Legacy explicit physical evidence isolates caller path validation here;
  // the native-shaped RUN/inventory settlement path is covered above.
  const receipt = { scope: { run_id: 'RUN-1' }, settled: true, physical_stopped: true,
    control: { current: true, admission: 'sealed', control_id: 'CTL-1', recovery_id: 'RCV-1', generation: 1, capture_path: capture } };
  const bin = path.join(runtime, 'bin/dd-flow');
  await writeFile(bin, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(calls)},'native-read\\n');console.log(${JSON.stringify(JSON.stringify(receipt))});\n`);
  await chmod(bin, 0o700);
  // Scope observation uses the canonical manifest executable independently of
  // the per-execution binding. It is not a read through a replaced native path.
  await writeFile(controlBin, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(scopeCalls)},JSON.stringify(process.argv.slice(2))+'\\n');console.log(${JSON.stringify(JSON.stringify({ scope_id: manifest.run_id, processes: [], provider_turns: [] }))});\n`);
  await chmod(controlBin, 0o700);
  await writeJsonAtomic(bindingFile, { schema_id: 'dd-eval/managed-runtime@1', run_id: 'RUN-1', project_root: project, runtime_root: runtime });
  await writeJsonAtomic(path.join(capture, 'snapshot.json'), { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'recovery', run_id: 'RUN-1', recovery_id: 'RCV-1', project_root: project, dd_flow_home: runtime, consistency: 'sealed_writer_barrier_required', restorable: 'same-runtime-or-explicit-restore' });
  const result = { execution: 'e', state: 'failed', run_id: 'RUN-1', code: 'provider_failed', error: 'original failure' };
  if (changed === 'attempt') result.attempt = outside;
  else if (changed === 'run-type') await writeJsonAtomic(bindingFile, { schema_id: 'dd-eval/managed-runtime@1', run_id: 123, project_root: project, runtime_root: runtime });
  else if (changed !== 'none') {
    const target = { project, runtime, binding: bindingFile }[changed], foreign = path.join(outside, path.basename(target));
    await rename(target, foreign); await symlink(foreign, target);
  }
  const captured = await captureRecoveryEvidence({ root, manifest, result });
  if (changed === 'none') assert.equal(captured.recovery_id, 'RCV-1');
  else assert.equal(captured.capture_error.code, ['attempt', 'run-type'].includes(changed) ? 'execution_scope_invalid' : 'recovery_evidence_invalid');
  const manifestFile = path.join(root, 'manifest.json'), eventsFile = path.join(root, 'events.jsonl');
  await writeJsonAtomic(manifestFile, manifest);
  await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, executionId: 'e', type: 'dev.dd.eval.execution.cancelled', data: changed === 'attempt' ? { attempt: outside } : {} });
  let events = await readEvents(eventsFile);
  await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, type: 'dev.dd.eval.completed', data: { state: 'cancelled', result_revision: runResultRevision(events, manifest) } });
  events = await readEvents(eventsFile); const results = storedExecutionResults(events, manifest);
  await writeJsonAtomic(path.join(root, 'reports/report.json'), { schema_id: 'dd-eval/report@2', run_id: manifest.run_id, state: 'cancelled', execution_state: 'cancelled', cleanup_state: 'settled', judge_status: 'not_requested', executions: results, execution_history: recoveryHistory(events, manifest, results) });
  const before = await readFile(eventsFile), recognized = await runnerCleanupReceipt({ evalRoot: root, expectedManifestSha256: sha256(await readFile(manifestFile)), detailed: true });
  // Cancelled-result projection deliberately drops arbitrary event.attempt.
  // It safely observes the canonical binding instead of the forged locator.
  assert.equal(recognized.cleanup_state, ['none', 'attempt'].includes(changed) ? 'settled' : 'pending');
  assert.deepEqual(await readFile(eventsFile), before, 'recognition never rewrites retained events');
  const nativeReads = await readFile(calls, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  assert.equal(nativeReads, changed === 'none' ? 'native-read\nnative-read\nnative-read\n' : changed === 'attempt' ? 'native-read\n' : '', 'only validated canonical bindings may execute a native read');
  assert.deepEqual((await readFile(scopeCalls, 'utf8')).trim().split('\n').map(JSON.parse),
    [['runtime', 'scope', 'status', '--scope-id', manifest.run_id, '--json']], 'independent scope observation is read-only and bound to this EVAL');
  if (changed !== 'none') {
    // Authorized late-capture cleanup enriches the failure before capture and
    // physical recognition. That earlier diagnostic path must share the guard.
    await writeFile(eventsFile, ''); await writeFile(calls, '');
    const operationId = `${manifest.run_id}:e:launch`;
    for (const type of ['started', 'failed']) await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, executionId: 'e', type: `dev.dd.eval.operation.${type}`, data: { operation_id: operationId, ...(type === 'failed' ? { error: { code: result.code, message: result.error } } : {}) } });
    await appendEvent(eventsFile, { source: 'test', runId: manifest.run_id, executionId: 'e', type: 'dev.dd.eval.execution.failed', data: { ...result, execution_operation_id: operationId } });
    const cleaned = await runnerCleanup({ evalRoot: root });
    assert.equal(cleaned.cleanup_state, 'pending');
    assert.equal(cleaned.cleanup_observation.capture, 'unknown', 'invalid binding blocks capture separately from physical cleanup');
    assert.equal(cleaned.executions[0].code, result.code, 'path rejection cannot replace the original subject failure');
    const bindingRejected = error => ['snapshot_binding_invalid', 'execution_scope_invalid'].includes(error.code);
    await assert.rejects(runnerCleanup({ evalRoot: root, requestId: 'owned-path-guard' }), bindingRejected, 'explicit control reconciliation also validates its binding before RPC');
    if (changed !== 'attempt') {
      const status = await runnerControlStatus({ evalRoot: root, executionId: 'e' });
      assert.equal(status.executions[0].unavailable, true, 'status cannot call a noncanonical runtime');
      await assert.rejects(recoverExecution({ root, events: await readEvents(eventsFile), manifest, execution: manifest.executions[0], loaded: null, blueprint: {}, profile: {}, terminalOnly: true }), bindingRejected);
      const cancelled = await runnerCancel({ evalRoot: root, executionId: 'e' });
      assert.equal(cancelled.state, 'cancellation_unconfirmed');
      assert.ok(bindingRejected(cancelled.cancelled[0].receipt.cleanup_error), 'destructive cancellation also rejects the replaced binding');
    }
    assert.equal(await readFile(calls, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }), '', 'failure enrichment cannot execute outside the retained binding');
  }
});

test('105 recovery capture cannot invent a missing writer barrier or restorable marker', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-barrier-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const capture = path.join(root, 'recovery/RCV-1'); await mkdir(capture, { recursive: true });
  const file = path.join(capture, 'snapshot.json'), binding = { run_id: 'RUN-1', project_root: path.join(root, 'project'), runtime_root: path.join(root, 'runtime') };
  const input = { root, manifest: { runtime_recovery_home: path.join(root, 'recovery') }, result: { state: 'failed' }, binding,
    receipt: { scope: { run_id: binding.run_id }, settled: true, control: { current: true, control_id: 'CTL-1', recovery_id: 'RCV-1', generation: 1, admission: 'sealed', capture_path: capture } } };
  const snapshot = { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'recovery', run_id: binding.run_id, recovery_id: 'RCV-1', project_root: binding.project_root, dd_flow_home: binding.runtime_root,
    consistency: 'sealed_writer_barrier_required', restorable: 'same-runtime-or-explicit-restore' };
  for (const changed of [{ consistency: undefined }, { consistency: 'sqlite_read_snapshot_files_copied_nonatomically' }, { restorable: undefined }, { restorable: false }, { restorable: true }]) {
    await writeJsonAtomic(file, { ...snapshot, ...changed });
    await assert.rejects(observeBoundSnapshot(input), error => error.code === 'snapshot_binding_invalid' && error.details.reason === 'capture_consistency_invalid');
  }
  await writeJsonAtomic(file, snapshot);
  assert.equal((await observeBoundSnapshot(input)).capture, 'ready');
});

for (const changed of ['none', 'project', 'runtime', 'daemon']) test(`105 legacy cancellation rejects aliases before inspect or stop (${changed})`, async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-legacy-')));
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'recovery105-legacy-foreign-')));
  t.after(() => Promise.all([root, outside].map(file => rm(file, { recursive: true, force: true }))));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home'), daemon = path.join(attempt, 'drivers/daemon');
  const calls = path.join(root, 'native-calls.jsonl'), engine = path.join(runtime, 'engines/test'), adapter = path.join(engine, 'dist/harness-runtime/bin/dd-codex.mjs');
  for (const directory of [project, daemon, path.join(root, 'resources')]) await mkdir(directory, { recursive: true });
  await installSuccessfulPolicy(runtime);
  await mkdir(path.dirname(adapter), { recursive: true });
  await writeFile(adapter, `import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(calls)},process.argv.slice(2,4).join(' ')+'\\n');console.log(JSON.stringify({ok:false,error:{code:'fixture_native_called',message:'offline control stub reached'}}));process.exitCode=1;\n`);
  await writeJsonAtomic(path.join(engine, 'engine.json'), { integrity: { checksum: await engineArtifactDigest(engine) } });
  await writeJsonAtomic(path.join(daemon, 'daemon.json'), { daemon_id: 'legacy-owned', config: { cwd: project }, sessions: [] });
  const manifest = { run_id: 'EVAL-legacy-105', executions: [{ id: 'e' }], subject_profile: { harness: 'codex-desktop' }, profile: { judge: { enabled: false } },
    runtime_resource_home: path.join(root, 'resources'), runtime_control_bin: path.join(root, 'control-runtime/bin/dd-flow') };
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  await appendEvent(path.join(root, 'events.jsonl'), { source: 'test', runId: manifest.run_id, executionId: 'e', type: 'dev.dd.eval.operation.started', data: { operation_id: `${manifest.run_id}:e:launch` } });
  if (changed !== 'none') {
    const target = { project, runtime, daemon }[changed], replacement = path.join(outside, path.basename(target));
    await rename(target, replacement); await symlink(replacement, target);
  }
  const cancelled = await runnerCancel({ evalRoot: root, executionId: 'e' });
  assert.equal(cancelled.state, 'cancellation_unconfirmed');
  assert.equal(cancelled.cancelled[0].receipt.cleanup_error.code, changed === 'none' ? 'fixture_native_called' : 'execution_scope_invalid');
  assert.equal(await readFile(calls, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }), changed === 'none' ? 'daemon stop\n' : '', 'only canonical execution paths can reach the native control stub');
});
