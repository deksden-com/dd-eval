import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReport, installRuntimeShim, projectStoppedControl, runnerStatus, runResultRevision, storedExecutionResults } from '../lib/runner.mjs';
import { appendEvent, readEvents, writeJsonAtomic } from '../lib/runner-events.mjs';
import { commandText } from '../lib/process-json.mjs';

test('status preserves durable run state while failed HITL readback remains unknown, never permission', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'status-hitl-readback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = 'EVAL-status', eventsFile = path.join(root, 'events.jsonl');
  const manifest = { run_id: runId, case_id: 'fixture', runtime_resource_home: path.join(root, 'resources'),
    executions: [{ id: 'e2e', mode: 'e2e', stage: 'specify' }], profile: { judge: { enabled: false }, interaction_judge: { verdict_contract: 'dd-eval/hitl-coverage@1' } } };
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  await appendEvent(eventsFile, { source: 'test', runId, executionId: 'e2e', type: 'dev.dd.eval.hitl.matched', data: {
    receipt_file: path.join(root, 'missing-receipt.json'), answer_file: path.join(root, 'missing-answer.md') } });
  await appendEvent(eventsFile, { source: 'test', runId, executionId: 'e2e', type: 'dev.dd.eval.execution.candidate_ready', data: {
    result: { execution: 'e2e', state: 'candidate_ready' } } });
  const events = await readEvents(eventsFile), results = storedExecutionResults(events, manifest);
  await writeJsonAtomic(path.join(root, 'reports/report.json'), buildReport({ root, manifest, results, state: 'finished', cleanupState: 'settled' }));
  await appendEvent(eventsFile, { source: 'test', runId, type: 'dev.dd.eval.completed', data: { state: 'finished', result_revision: runResultRevision(events, manifest) } });
  const status = await runnerStatus({ evalRoot: root });
  assert.equal(status.state, 'finished');
  assert.equal(status.cleanup_state, 'settled');
  assert.equal(status.interaction_resolution, 'unknown');
  assert.equal(status.interaction_coverage.verification.complete, false);
  assert.equal(status.execution_results[0].hitl_observation.unavailable, true);
  assert.equal(status.execution_results[0].hitl_observation.error.code, 'judge_evidence_mismatch');
});

test('runtime shim pins home and engine from a foreign cwd and environment', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-'$shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, 'engine'), home = path.join(root, 'home');
  await mkdir(path.join(engine, 'dist/harness-runtime'), { recursive: true });
  await writeFile(path.join(engine, 'cli.cjs'), 'console.log(JSON.stringify({home:process.env.DD_FLOW_HOME,engine:process.env.DD_FLOW_ENGINE_HOME,mode:process.env.DD_FLOW_ENGINE_MODE,args:process.argv.slice(2)}))');
  const shim = await installRuntimeShim(home, { snapshot_root: engine, entrypoint: 'cli.cjs' });
  const reply = JSON.parse(await commandText(shim, ['run', 'drive', 'status', '--run', 'RUN-test'], { cwd: os.tmpdir(), env: { DD_FLOW_HOME: '/foreign', DD_FLOW_ENGINE_HOME: '/foreign', DD_FLOW_ENGINE_MODE: '0' } }));
  assert.deepEqual(reply, { home, engine, mode: '1', args: ['run', 'drive', 'status', '--run', 'RUN-test'] });
});

test('physical stop is visible while recovery reconciliation remains pending', () => {
  const projection = { control: { mode: 'stop', request_id: 'stop-1' } };
  const drain = { scope_id: 'EVAL-1', generation: 2, physical_settled: true, capture: { pending_reasons: ['probe_reconciliation_required'], run_captures: [{ status: 'verified' }] } };
  const live = { inventory: { scope_id: 'EVAL-1', control: { request_id: 'stop-1', requested_mode: 'stop', generation: 2 }, drain } };
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1').recovery, 'pending');
  drain.capture.pending_reasons = [];
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1').recovery, 'ready');
  drain.generation = 1;
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1'), null);
  drain.generation = 2; drain.physical_settled = false;
  assert.equal(projectStoppedControl(projection, live, 'EVAL-1'), null);
  assert.equal(projectStoppedControl(projection, { unavailable: true }, 'EVAL-1'), null);
});
