import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { fixture, drainCleanups, drainFixtureProcesses, routes, stageReadinessMs } from '@cli/test/fixtures/controller-stage-fixture.ts';
import { createContext } from '@cli/src/runtime/context.ts';
import { getResourceDatabase } from '@cli/src/storage/database.ts';
import { packageSnapshotFiles } from '@cli/src/services/engines.ts';
import { worktrunkCacheRoot } from '@cli/src/services/tooling.ts';
import { listManagedSnapshots, requireWorkForkPreparation, forkManagedRun, observeManagedRun } from '../../lib/managed-flow-client.mjs';
import { isWorkRunSnapshot, isStageRunSnapshot } from '../../lib/snapshot-version.mjs';
import { commandJson } from '../../lib/process-json.mjs';
import { verifyEngineArtifact } from '../../lib/engine-admission.mjs';
import { executionBudget, managedCompletionEvidence, buildReport, buildRunCandidate } from '../../lib/runner.mjs';

const cleanups = [];
afterEach(({ task }) => drainCleanups(cleanups, task.result?.state === 'fail'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const treeHash = root => sha(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
  const file = path.join(e.parentPath, e.name); return path.relative(root, file) + ':' + sha(fs.readFileSync(file));
}).sort().join('\n'));
const acceptedState = (context, cursor) => cursor.accepted.map(({ work_id }) => ({
  work: context.db.get('SELECT work_id,status,result,completed_at,current_start_invocation_id FROM works WHERE work_id=?', [work_id]),
  sessions: context.db.all('SELECT id,work_id,status,result_receipt_json,completed_at FROM work_sessions WHERE work_id=? ORDER BY id', [work_id]),
  checks: context.db.all('SELECT id,status,command,exit_code FROM check_receipts WHERE work_id=? ORDER BY id', [work_id])
}));

it('automatic required Work point prepares publicly, retains prefix and completes the derived suffix through eval consumers', async () => {
  const cli = process.env.DD_EVAL_TEST_RECOVERY_CLI_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-work-consumer-')), output = path.join(root, 'target');
  cleanups.push(async failed => { if (!failed) fs.rmSync(root, { recursive: true, force: true }); });
  const keys = ['DD_FLOW_TEST_WORK_SNAPSHOT_AUTO', 'DD_FLOW_TEST_WORK_SNAPSHOT_MODE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.DD_FLOW_TEST_WORK_SNAPSHOT_AUTO = '1'; process.env.DD_FLOW_TEST_WORK_SNAPSHOT_MODE = 'isolated';
  let source;
  try {
    source = await fixture(cleanups, false, false, true, false, false,
      { ...routes[0], recoveryLintDouble: true, snapshotPolicy: 'required', captureRoot: path.join(root, 'points') },
      false, true, false, false, 'server');
  } finally { for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  const deadline = Date.now() + stageReadinessMs;
  for (;;) {
    const controller = source.context.db.get('SELECT status,last_error_json FROM run_controllers WHERE run_id=?', [source.runId]);
    if (controller?.last_error_json) throw new Error(controller.last_error_json);
    if (controller?.status === 'completed') break;
    if (Date.now() > deadline) throw new Error('Automatic Work source did not complete');
    await delay(100);
  }
  const run = source.context.db.get('SELECT project_root,index_json FROM runs WHERE id=?', [source.runId]);
  const points = await listManagedSnapshots({ bin: path.join(cli, 'dist/cli.js'), env: source.context.env, projectRoot: run.project_root, runId: source.runId });
  const point = points.find(point => point.kind === 'sequential' && point.available && point.continuation_supported
    && JSON.parse(fs.readFileSync(path.join(point.snapshot, 'snapshot.json'), 'utf8')).cursor.accepted.length === 2);
  expect(point).toBeDefined();
  const manifest = JSON.parse(fs.readFileSync(path.join(point.snapshot, 'snapshot.json'), 'utf8'));
  expect(isWorkRunSnapshot(manifest)).toBe(true); expect(isStageRunSnapshot(manifest)).toBe(false);
  expect(manifest.cursor.pending).toHaveLength(1);
  expect(JSON.parse(run.index_json).snapshot_policy).toBe('required');
  expect(source.calls().some(call => call.event === 'work_snapshot_requested')).toBe(false);
  expect(points.some(point => point.reason === 'terminal_evidence_only' && point.forkable === false)).toBe(true);
  const acceptedBefore = acceptedState(source.context, manifest.cursor), snapshotBefore = treeHash(point.snapshot);
  const graphIds = new Set(JSON.parse(fs.readFileSync(path.join(point.snapshot, manifest.graph.file), 'utf8')).works.map(work => work.key));
  const graphState = context => context.db.all('SELECT work_id,parent_work_id,task,depends_on_json,payload_json FROM works WHERE parent_work_id=? ORDER BY work_id',
    [manifest.cursor.parent_work_id]).filter(work => graphIds.has(work.work_id));
  const graphBefore = graphState(source.context);
  const files = [...packageSnapshotFiles(cli)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), digest = crypto.createHash('sha256');
  for (const [relative, file] of files) if (path.basename(relative) !== 'engine.json') digest.update(relative).update('\0').update(fs.readFileSync(file)).update('\0');
  const version = JSON.parse(fs.readFileSync(path.join(cli, 'package.json'), 'utf8')).version;
  const profile = { schema_id: 'dd-eval/run-profile@2', selection: { e2e: true }, judge: { enabled: false }, concurrency: { per_harness: { 'codex-desktop': 1 } } };
  const evalId = 'EVAL-O02a-real-consumer', budget = executionBudget(evalId, profile), resourceHome = path.join(root, 'resources');
  const sourceRoot = path.dirname(source.context.ddFlowHome);
  for (const file of ['adapter.mjs', 'mb-lint.mjs']) fs.copyFileSync(path.join(sourceRoot, file), path.join(root, file));
  fs.cpSync(path.join(sourceRoot, 'codex-home'), path.join(root, 'codex-home'), { recursive: true });
  const external = path.join(root, 'external-operation.json'), effect = { source_run_id: source.runId, operation_id: 'source-accepted-effect', applied: 1 };
  fs.writeFileSync(external, JSON.stringify(effect));
  const env = { ...source.context.env, DD_FLOW_HOME: path.join(root, 'invoker'), DD_FLOW_RESOURCE_HOME: resourceHome,
    DD_FLOW_RUNTIME_BUDGET: JSON.stringify(budget), DD_EVAL_REGISTRY_FILE: path.join(root, 'registry/homes.json'),
    DD_FLOW_TEST_ROOT: root, DD_FLOW_TEST_WORK_SNAPSHOT_AUTO: undefined, DD_FLOW_TEST_WORK_SNAPSHOT_MODE: 'isolated',
    DD_FLOW_TEST_WORK_BOUNDARY_CONTINUE: '1', DD_FLOW_TEST_WORK_FORK_EXTERNAL_FILE: external,
    CODEX_HOME: path.join(root, 'codex-home'), MB_LINT_BIN: path.join(root, 'mb-lint.mjs') };
  const input = { bin: path.join(cli, 'dist/cli.js'), env, cwd: root, snapshot: point.snapshot, output,
    engineVersion: version, integrityChecksum: digest.digest('hex'), requestId: 'eval-owned-request' };
  const corrupt = path.join(root, 'corrupt-snapshot'); fs.cpSync(point.snapshot, corrupt, { recursive: true });
  fs.appendFileSync(path.join(corrupt, manifest.graph.file), '\n');
  await expect(forkManagedRun({ ...input, snapshot: corrupt, output: path.join(root, 'corrupt-target'), requestId: 'corrupt-refusal', prepareOnly: true }))
    .rejects.toMatchObject({ code: 'work_snapshot_not_admissible' });
  expect(fs.existsSync(path.join(root, 'corrupt-target'))).toBe(false);
  await requireWorkForkPreparation({ ...input, projectRoot: root });
  const prepared = await forkManagedRun({ ...input, prepareOnly: true });
  expect(await verifyEngineArtifact(prepared.fork.engine)).toBe(input.integrityChecksum);
  expect(prepared.status).toBe('ready'); expect(prepared.controller_id).toBeUndefined();
  expect(prepared.execution).toEqual({ resource_home: resourceHome, budget });
  const frozen = new DatabaseSync(path.join(prepared.target.dd_flow_home, 'db.sqlite'), { readOnly: true });
  try {
    expect(frozen.prepare("SELECT 1 FROM run_controllers WHERE request_id='work-snapshot:eval-owned-request'").get()).toBeUndefined();
    expect(frozen.prepare("SELECT 1 FROM sessions WHERE status='active'").get()).toBeUndefined();
  } finally { frozen.close(); }
  expect(fs.existsSync(path.join(root, 'adapter-calls.jsonl'))).toBe(false);
  const targetEnv = { ...env, DD_FLOW_HOME: prepared.target.dd_flow_home, DD_FLOW_ENGINE_MODE: '1' };
  const target = createContext(targetEnv, 'read_existing');
  cleanups.push(async () => {
    const owner = target.db.get("SELECT status FROM run_controllers WHERE request_id='work-snapshot:eval-owned-request'");
    if (owner && !['completed', 'stop_target_reached', 'cancelled'].includes(owner.status)) await commandJson(input.bin,
      ['run', 'control', 'stop', '--run', source.runId, '--project-root', prepared.target.project_root, '--request-id', 'eval-fixture-cleanup', '--wait-ms', '10000'], { cwd: root, env: targetEnv });
    await drainFixtureProcesses(target, root); target.db.close?.(); getResourceDatabase(resourceHome).close?.();
  });
  // Test-owned fake-agent routing is prepared before any target controller.
  fs.writeFileSync(path.join(prepared.target.dd_flow_home, 'harnesses.json'), JSON.stringify({ schema_id: 'dd-flow/harness-config@1', harnesses: {
    'codex-desktop': { adapter_command: path.join(root, 'adapter.mjs'), runtime_command: process.execPath }
  } }));
  const cache = worktrunkCacheRoot({ ...source.context, ddFlowHome: prepared.target.dd_flow_home, env: targetEnv });
  fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.cpSync(worktrunkCacheRoot(source.context), cache, { recursive: true });
  for (const accepted of manifest.cursor.accepted) {
    expect(git(prepared.target.workspace_root, 'cat-file', '-t', accepted.git.commit).trim()).toBe('commit');
    expect(git(prepared.target.workspace_root, 'rev-parse', accepted.git.ref).trim()).toBe(accepted.git.commit);
  }
  await drainFixtureProcesses(source.context, sourceRoot);
  const sourceBefore = { index: source.context.db.get('SELECT index_json FROM runs WHERE id=?', [source.runId]).index_json,
    refs: git(run.project_root, 'show-ref'), indexHash: sha(fs.readFileSync(path.join(run.project_root, '.git/index'))) };
  const continued = await forkManagedRun(input);
  expect(continued.handle).toBe(prepared.handle);
  const observed = await observeManagedRun({ bin: input.bin, env: targetEnv,
    projectRoot: prepared.target.project_root, runId: source.runId, requestId: 'work-snapshot:eval-owned-request',
    controllerId: continued.controller.controller_id, pollMs: 100,
    beforeDispatch: () => { throw new Error('Retained full contexts must not create another launcher'); } });
  const status = await commandJson(input.bin, ['run', 'status', source.runId, '--project-root', prepared.target.project_root], { cwd: root, env: targetEnv });
  expect(status.run.status).toBe('done'); expect(status.index.snapshot_policy).toBe('required');
  expect(acceptedState(target, manifest.cursor)).toEqual(acceptedBefore);
  expect(graphState(target)).toEqual(graphBefore);
  expect(target.db.all("SELECT controller_id FROM run_controllers WHERE request_id='work-snapshot:eval-owned-request'")).toHaveLength(1);
  const bound = JSON.parse(target.db.get("SELECT manifest_json FROM run_controllers WHERE request_id='work-snapshot:eval-owned-request'").manifest_json);
  expect(bound.resource_home).toBe(resourceHome); expect(bound.budget).toEqual(budget);
  const calls = fs.readFileSync(path.join(root, 'adapter-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  expect(calls.filter(call => call.event === 'stage_packet' && call.stage === 'code')).toHaveLength(0);
  expect(calls.filter(call => call.event === 'child_work_completed' && call.stage === 'code')).toHaveLength(1);
  expect(calls.some(call => call.event === 'work_snapshot_agent_external_read' && call.effect.operation_id === effect.operation_id)).toBe(true);
  expect(JSON.parse(fs.readFileSync(external, 'utf8'))).toEqual(effect);
  const execution = { id: 'e2e', stage: 'code', terminal_stage: 'merge', inherited_scope: { stages: ['specify', 'protocolize', 'plan', 'plan-review'], works: manifest.cursor.accepted },
    controller_request_id: 'work-snapshot:eval-owned-request', completion_scope: { entry_stage: 'code', requested_stop_after: null,
      effective_terminal_stage: 'merge', case_entry_stage: 'specify', case_terminal_stage: 'merge', requested_full_case: false,
      case_contour: ['specify', 'protocolize', 'plan', 'plan-review', 'code', 'code-review', 'merge'] } };
  const lifecycle = { run_id: source.runId, stage_status: status.index.stage_runs.findLast(stage => stage.stage === 'merge').status, status };
  const completion = await managedCompletionEvidence({ execution, observed, lifecycle, runId: source.runId, operationId: `${evalId}:e2e:launch` });
  const derived = { kind: 'derived', run_id: evalId, case_id: 'provider-free-fixture', profile, executions: [execution],
    derived_from: { source_execution: 'e2e', checkpoint: point.snapshot, checkpoint_sha256: point.manifest_sha256,
      inherited_stages: execution.inherited_scope.stages, engine: prepared.fork.engine, work_cursor: manifest.cursor, fork_handle: prepared.handle } };
  const result = { execution: 'e2e', stage: 'merge', state: 'candidate_ready', driver: observed, lifecycle, run_id: source.runId,
    controller_request_id: execution.controller_request_id, execution_operation_id: `${evalId}:e2e:launch`, ...completion };
  const report = buildReport({ root, manifest: derived, state: 'completed', executionState: 'completed', results: [result] });
  const candidate = await buildRunCandidate({ runId: evalId, manifest: derived, results: [result] });
  expect(report.observability.derived_scope.full_original_e2e_pass).toBe(false);
  expect(report.completion_scope[0].target_reached).toBe(true); expect(report.completion_scope[0].full_case_completed).toBe(false);
  expect(report.judge_status).toBe('not_requested'); expect(candidate.derived_from.work_cursor).toEqual(manifest.cursor);
  await drainFixtureProcesses(target, root);
  const beforeReplay = fs.readFileSync(path.join(root, 'adapter-calls.jsonl'), 'utf8');
  expect((await forkManagedRun(input)).controller.controller_id).toBe(continued.controller.controller_id);
  expect((await forkManagedRun({ ...input, prepareOnly: true })).status).toBe('continuation_requested');
  await expect(forkManagedRun({ ...input, env: { ...env, DD_FLOW_RUNTIME_BUDGET: JSON.stringify({ ...budget, scope_id: 'conflicting' }) } })).rejects.toMatchObject({ code: 'work_continuation_request_conflict' });
  expect(fs.readFileSync(path.join(root, 'adapter-calls.jsonl'), 'utf8')).toBe(beforeReplay);
  expect(treeHash(point.snapshot)).toBe(snapshotBefore);
  expect(source.context.db.get('SELECT index_json FROM runs WHERE id=?', [source.runId]).index_json).toBe(sourceBefore.index);
  expect(git(run.project_root, 'show-ref')).toBe(sourceBefore.refs);
  expect(sha(fs.readFileSync(path.join(run.project_root, '.git/index')))).toBe(sourceBefore.indexHash);
  const evidence = process.env.DD_EVAL_TEST_RECOVERY_EVIDENCE_DIR;
  if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'principal.json'), JSON.stringify({ point, manifest, prepared, continued, observed, status, acceptedBefore,
    acceptedAfter: acceptedState(target, manifest.cursor), graphBefore, graphAfter: graphState(target), sourceBefore, snapshotBefore, report, candidate, calls, assertions: expect.getState().assertionCalls }, null, 2)); }
});
