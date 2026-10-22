import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { cleanupObservation } from '../lib/cleanup-observation.mjs';
import { workerCleanupFailure } from '../lib/eval-resume-worker.mjs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { snapshotTreeHash } from '../lib/case-acceptance.mjs';
import { hashJson } from '../lib/runner-events.mjs';

test('actual RUN status uses only a current fenced EVAL retirement proof for physical stop', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cleanup-retired-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home'), resource = path.join(root, 'resources');
  for (const dir of [project, runtime, resource]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(attempt, 'managed-runtime.json'), JSON.stringify({ schema_id: 'dd-eval/managed-runtime@1', project_root: project, runtime_root: runtime, run_id: 'RUN-1' }));
  const manifest = { run_id: 'EVAL-096', executions: [{ id: 'e' }], runtime_resource_home: resource };
  const bytes = JSON.stringify(manifest); await writeFile(path.join(root, 'manifest.json'), bytes);
  const binding = { eval_root: root, run_id: manifest.run_id, manifest_sha256: createHash('sha256').update(bytes).digest('hex'), resource_home: resource };
  const inventory = { scope_id: manifest.run_id, dispatch_blocked: true, fence: { scope_id: manifest.run_id, generation: 1 }, processes: [], provider_turns: [] };
  const saved = { status: 'completed', intent: { kind: 'cleanup', mode: 'reconcile', manifest_sha256: binding.manifest_sha256, target_binding_digest: hashJson(binding) },
    result: { binding, inventory: structuredClone(inventory), physical_stopped: true, native_settled: false, receipt: { scope_id: manifest.run_id } } };
  const input = { root, manifest, results: [{ execution: 'e', state: 'failed', run_id: 'RUN-1' }], maintenance: [saved],
    live: { inventory, executions: [{ execution: 'e', run_id: 'RUN-1', receipt: { schema_id: 'dd-flow/run-control-receipt@1', scope: { run_id: 'RUN-1' }, settled: false,
      control: { current: true, control_id: 'CTL-1', recovery_id: 'REC-1', generation: 1, admission: 'draining' } } }] } };
  const stopped = await cleanupObservation(input);
  assert.equal(stopped.physical, 'settled'); assert.equal(stopped.capture, 'pending');
  assert.equal(stopped.executions[0].reason, 'native_settlement_pending', 'RUN receipt itself has no physical_stopped field');
  for (const replacement of [{ ...inventory, processes: [{ id: 'new-owner' }] }, { ...inventory, fence: { ...inventory.fence, generation: 2 } }, { ...inventory, unavailable: true }]) {
    input.live.inventory = replacement;
    assert.equal((await cleanupObservation(input)).physical, 'unknown', 'changed or missing inventory cannot reuse an old stop proof');
  }
  input.live.inventory = inventory;
  input.live.executions[0].receipt.control = null;
  const snapshotFile = path.join(root, 'candidate.json');
  const snapshot = JSON.stringify({ schema_id: 'dd-flow/eval-run-snapshot@7', purpose: 'candidate', run_id: 'RUN-1', project_root: project, dd_flow_home: runtime, workspace: { kind: 'git_repository' } });
  await writeFile(snapshotFile, snapshot);
  input.results[0] = { execution: 'e', state: 'candidate_ready', run_id: 'RUN-1', candidate: {
    manifest: snapshotFile, manifest_sha256: createHash('sha256').update(snapshot).digest('hex') } };
  saved.result.native_settled = true;
  saved.result.cleanup_state = 'settled';
  assert.equal((await cleanupObservation(input)).capture, 'pending', 'native flag alone cannot override an unrequested RUN control');
  saved.result.receipt.settled = true;
  saved.result.receipt.nodes = [{ settled: false }];
  assert.equal((await cleanupObservation(input)).capture, 'pending', 'every native node must actually settle');
  saved.result.receipt.nodes = [{ settled: true }];
  const retiredCandidate = await cleanupObservation(input);
  assert.equal(retiredCandidate.physical, 'settled');
  assert.equal(retiredCandidate.capture, 'ready', 'bound EVAL retirement proves native settlement without creating a RUN control');
  assert.equal(retiredCandidate.executions[0].reason, 'settled_candidate_verified');
  inventory.provider_turns.push({ operation_id: 'still-active' });
  saved.result.inventory.provider_turns.push({ operation_id: 'still-active' });
  assert.equal((await cleanupObservation(input)).capture, 'pending', 'even a matching retirement record cannot hide a current provider turn');
  inventory.provider_turns.pop(); saved.result.inventory.provider_turns.pop();
  saved.result.native_settled = false;
  assert.equal((await cleanupObservation(input)).capture, 'pending');
  saved.result.native_settled = true;
  input.results[0].candidate.manifest_sha256 = '0'.repeat(64);
  assert.equal((await cleanupObservation(input)).capture, 'unknown', 'settlement never blesses changed candidate bytes');
});

test('late sealed capture is visible independently of report; foreign proof never completes cleanup', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cleanup-observation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const attempt = path.join(root, 'executions/e'), project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home');
  const recovery = path.join(root, 'recovery'), capture = path.join(recovery, 'REC-1');
  for (const dir of [project, runtime, capture]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(attempt, 'managed-runtime.json'), JSON.stringify({ schema_id: 'dd-eval/managed-runtime@1', project_root: project, runtime_root: runtime, run_id: 'RUN-1' }));
  const snapshot = { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'recovery', run_id: 'RUN-1', recovery_id: 'REC-1', project_root: project, dd_flow_home: runtime };
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify(snapshot));
  const control = { current: true, control_id: 'CTRL-1', recovery_id: 'REC-1', generation: 1, admission: 'sealed', capture_path: capture };
  const input = { root, manifest: { executions: [{ id: 'e' }], runtime_recovery_home: recovery }, results: [{ execution: 'e', state: 'failed', run_id: 'RUN-1' }],
    live: { executions: [{ execution: 'e', run_id: 'RUN-1', receipt: { scope: { run_id: 'RUN-1' }, settled: true, control } }] }, report: null, reportState: 'pending' };
  const ready = await cleanupObservation(input);
  assert.equal(ready.physical, 'settled'); assert.equal(ready.capture, 'ready'); assert.equal(ready.finalization, 'pending');
  input.results[0].recovery = { run_id: 'FOREIGN-HISTORY' };
  const conflicting = await cleanupObservation(input);
  assert.equal(conflicting.physical, 'unknown'); assert.equal(conflicting.capture, 'unknown', 'matching current control cannot replace a foreign retained RUN');
  delete input.results[0].recovery;
  const normalBytes = JSON.stringify({ ...snapshot, purpose: 'candidate' });
  const normalFile = path.join(root, 'candidate-snapshot.json'); await writeFile(normalFile, normalBytes);
  const normal = { ...input, results: [{ ...input.results[0], state: 'candidate_ready', candidate: { manifest: normalFile, manifest_sha256: createHash('sha256').update(normalBytes).digest('hex') } }],
    live: { executions: [{ ...input.live.executions[0], receipt: { scope: { run_id: 'RUN-1' }, settled: true, control: null } }] } };
  assert.equal((await cleanupObservation(normal)).capture, 'ready', 'normal completion needs no recovery control');
  const diagnosticBytes=JSON.stringify({...snapshot,schema_id:'dd-flow/eval-run-snapshot@7',purpose:'candidate',workspace:{kind:'git_repository'}});
  await writeFile(normalFile,diagnosticBytes);
  normal.results[0].candidate.manifest_sha256=createHash('sha256').update(diagnosticBytes).digest('hex');
  assert.equal((await cleanupObservation(normal)).capture,'ready','diagnostic candidate uses the same physical settlement owner');
  await writeFile(path.join(capture,'snapshot.json'),JSON.stringify({...snapshot,schema_id:'dd-flow/eval-run-snapshot@7',workspace:{kind:'git_repository'}}));
  assert.equal((await cleanupObservation(input)).capture,'ready','diagnostic recovery retains the existing sealed-control gate');
  const unrequested = { ...normal, live: { executions: [{ ...normal.live.executions[0], receipt: {
    scope: { run_id: 'RUN-1' }, settled: false, control: null, state: 'not_requested', unsettled_reasons: ['control_not_requested']
  } }] } };
  const unrequestedObservation = await cleanupObservation(unrequested);
  assert.equal(unrequestedObservation.physical, 'unknown', 'absence of operator control is not evidence of a live process');
  assert.equal(unrequestedObservation.capture, 'pending', 'absence of control must not manufacture settlement or ready capture');
  const nativeUnknown = { ...input, live: { executions: [{ ...input.live.executions[0], receipt: { scope: { run_id: 'RUN-1' }, settled: false, physical_stopped: true, control } }] } };
  const stopped = await cleanupObservation(nativeUnknown);
  assert.equal(stopped.physical, 'settled', 'physical shutdown need not prove native outcome');
  assert.equal(stopped.capture, 'pending', 'unclean native outcome cannot manufacture a sealed capture');
  assert.equal(stopped.executions[0].reason, 'native_settlement_pending');
  delete nativeUnknown.live.executions[0].receipt.physical_stopped;
  assert.equal((await cleanupObservation(nativeUnknown)).physical, 'unknown', 'unsettled control does not prove live owners');
  nativeUnknown.live.executions[0].receipt.physical_stopped = true;
  nativeUnknown.live.executions[0].receipt.control = { ...control, current: false };
  assert.equal((await cleanupObservation(nativeUnknown)).physical, 'unknown', 'stopped receipt needs current generation binding');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const dir of ['project', 'runtime']) await mkdir(path.join(capture, dir));
  await writeFile(path.join(capture, 'project/README.md'), 'Original source');
  await writeFile(path.join(capture, 'project.index.patch'), '[]');
  await writeFile(path.join(capture, 'project.index.pack'), '');
  const database = new DatabaseSync(path.join(capture, 'runtime/db.sqlite'));
  database.exec("CREATE TABLE runs(id TEXT,project_id TEXT,flow_kind TEXT); INSERT INTO runs VALUES('RUN-1','PRJ-1','mb-init')");
  database.close();
  const unborn = { ...snapshot, schema_id: 'dd-flow/eval-run-snapshot@6', project_id: 'PRJ-1', stage_entry: null,
    workspace: { kind: 'project' }, project_sha256: snapshotTreeHash(path.join(capture, 'project')),
    project_git: { state: 'unborn', branch: 'main', head: null, bundle_sha256: null, index_format: 'entries@1',
      index_sha256: sha('[]'), index_objects_sha256: sha('') } };
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify(unborn));
  const memory = await cleanupObservation(input);
  assert.equal(memory.capture, 'ready', `genuine scoped Memory unborn recovery is readable: ${memory.executions[0].reason}`);
  for (const changed of [{ ...unborn, run_id: 'foreign' }, { ...unborn, purpose: 'candidate' },
    { ...unborn, project_git: { ...unborn.project_git, head: 'a'.repeat(40) } }]) {
    await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify(changed));
    assert.equal((await cleanupObservation(input)).capture, 'unknown');
  }
  const foreign = new DatabaseSync(path.join(capture, 'runtime/db.sqlite'));
  foreign.exec("UPDATE runs SET flow_kind='vnext_protocolize'"); foreign.close();
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify(unborn));
  assert.equal((await cleanupObservation(input)).capture, 'unknown', 'v6 SDLC is not Memory recovery');
  await writeFile(normalFile, JSON.stringify({ ...snapshot, schema_id: 'dd-flow/eval-run-snapshot@6', purpose: 'candidate' }));
  normal.results[0].candidate.manifest_sha256 = sha(await readFile(normalFile));
  assert.equal((await cleanupObservation(normal)).capture, 'unknown', 'unborn-project recovery is not a candidate');
  control.current = false;
  assert.equal((await cleanupObservation(input)).physical, 'unknown');
  control.current = true;
  await writeFile(path.join(capture, 'snapshot.json'), JSON.stringify({ ...snapshot, run_id: 'foreign' }));
  assert.equal((await cleanupObservation(input)).capture, 'unknown');
  input.manifest.executions.push({ id: 'other' });
  assert.equal((await cleanupObservation(input)).physical, 'unknown', 'all executions require proof');
});

test('pre-native failure needs no RUN cleanup and finally preserves primary failure', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cleanup-baseline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observed = await cleanupObservation({ root, manifest: { executions: [{ id: 'e' }] }, results: [{ execution: 'e', state: 'failed' }], live: {}, reportState: 'pending' });
  assert.equal(observed.physical, 'not_applicable'); assert.equal(observed.capture, 'not_applicable');
  const retained = await cleanupObservation({ root, manifest: { executions: [{ id: 'e' }] }, results: [{ execution: 'e', state: 'failed', recovery: { run_id: 'RUN-retained' } }], live: {}, reportState: 'pending' });
  assert.equal(retained.physical, 'unknown'); assert.equal(retained.capture, 'unknown', 'lost binding does not erase a retained native RUN');
  const failure = workerCleanupFailure({ status: 'recovery_blocked', error: { code: 'owner_lost' } }, Object.assign(new Error('finish failed'), { code: 'finish_failed' }));
  assert.equal(failure.status, undefined); assert.equal(failure.cleanup_error.code, 'finish_failed');
});
