import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { fixture, drainCleanups, routes, stageReadinessMs } from '@cli/test/fixtures/controller-stage-fixture.ts';
import { listManagedSnapshots } from '../../lib/managed-flow-client.mjs';
import { isWorkRunSnapshot, isStageRunSnapshot } from '../../lib/snapshot-version.mjs';

const cleanups = [];
afterEach(({ task }) => drainCleanups(cleanups, task.result?.state === 'fail'));
it('observes an automatic required Work point through the public CLI registry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-work-consumer-'));
  cleanups.push(async failed => { if (!failed) fs.rmSync(root, { recursive: true, force: true }); });
  const previous = process.env.DD_FLOW_TEST_WORK_SNAPSHOT_AUTO;
  process.env.DD_FLOW_TEST_WORK_SNAPSHOT_AUTO = '1';
  let source;
  try {
    source = await fixture(cleanups, false, false, true, false, false,
      { ...routes[0], recoveryLintDouble: true, snapshotPolicy: 'required', captureRoot: path.join(root, 'points') },
      false, true, false, false, 'server');
  } finally {
    if (previous === undefined) delete process.env.DD_FLOW_TEST_WORK_SNAPSHOT_AUTO;
    else process.env.DD_FLOW_TEST_WORK_SNAPSHOT_AUTO = previous;
  }
  const deadline = Date.now() + stageReadinessMs;
  for (;;) {
    const controller = source.context.db.get('SELECT status,last_error_json FROM run_controllers WHERE run_id=?', [source.runId]);
    if (controller?.last_error_json) throw new Error(controller.last_error_json);
    if (controller?.status === 'completed') break;
    if (Date.now() > deadline) throw new Error('Automatic Work source did not complete');
    await delay(100);
  }
  const run = source.context.db.get('SELECT project_root,index_json FROM runs WHERE id=?', [source.runId]);
  const points = await listManagedSnapshots({ bin: path.join(process.env.DD_EVAL_RECOVERY_CLI_ROOT, 'dist/cli.js'),
    env: source.context.env, projectRoot: run.project_root, runId: source.runId });
  const point = points.find(point => point.kind === 'sequential' && point.available && point.continuation_supported
    && JSON.parse(fs.readFileSync(path.join(point.snapshot, 'snapshot.json'), 'utf8')).cursor.accepted.length === 2);
  expect(point).toBeDefined();
  const manifest = JSON.parse(fs.readFileSync(path.join(point.snapshot, 'snapshot.json'), 'utf8'));
  expect(isWorkRunSnapshot(manifest)).toBe(true);
  expect(isStageRunSnapshot(manifest)).toBe(false);
  expect(manifest.cursor.accepted.length).toBeGreaterThan(0);
  expect(manifest.cursor.pending).toHaveLength(1);
  expect(JSON.parse(run.index_json).snapshot_policy).toBe('required');
  expect(source.calls().some(call => call.event === 'work_snapshot_requested')).toBe(false);
  expect(points.some(point => point.reason === 'terminal_evidence_only' && point.forkable === false)).toBe(true);
});
