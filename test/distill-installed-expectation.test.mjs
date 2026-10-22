import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveMemoryExecutionExpectation, readMemoryExecutionSnapshot } from '../lib/memory-runtime-setup.mjs';

test('installed distill expectation matches its completed six-stage RUN without allocating runtime state', {
  skip: !process.env.DD_EVAL_DISTILL_INSTALLED_CELL
}, async () => {
  const cell = process.env.DD_EVAL_DISTILL_INSTALLED_CELL; assert(path.isAbsolute(cell));
  const receipt = JSON.parse(await readFile(path.join(cell, 'mb-distill-receipt.json')));
  assert.equal(receipt.execution, 'fixture_lifecycle_completed');
  const runtimeRoot = path.join(cell, 'home'), projectRoot = path.join(cell, 'project');
  const bundle = JSON.parse(await readFile(path.join(receipt.first.run_root, 'execution-bundle/manifest.json')));
  const retainedEngine = JSON.parse(await readFile(path.join(receipt.first.run_root, 'execution-bundle', bundle.engine_manifest.path)));
  const version = retainedEngine.engine_version;
  const engine = JSON.parse(await readFile(path.join(runtimeRoot, 'engines/@deksden-com_dd-flow-cli', version, 'engine.json')));
  const { readSetupStatus } = await import(pathToFileURL(path.join(engine.snapshot_root, 'dist/services/setup.js')));
  const installation = readSetupStatus(runtimeRoot).installation; assert(installation);
  const counts = () => {
    const db = new DatabaseSync(path.join(runtimeRoot, 'db.sqlite'), { readOnly: true });
    try { return Object.fromEntries(['runs', 'sessions', 'works', 'audit_events'].map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])); }
    finally { db.close(); }
  };
  const before = counts();
  const expected = await resolveMemoryExecutionExpectation({ runtimeRoot, configHome: runtimeRoot, engine, installation, flow: 'mb-distill',
    selection: { profileFile: path.join(cell, 'profile.json') },
    scope: { requestId: receipt.first.request_id, projectRoot, workspace: receipt.first.workspace_root } });
  const observed = await readMemoryExecutionSnapshot({ runtimeRoot, resourceHome: runtimeRoot, projectRoot, runId: receipt.first.run_id, engine });
  assert.deepEqual(expected.contour, ['preflight', 'extract', 'review', 'promote', 'verify', 'finish']);
  assert.deepEqual(observed.settings, expected.settings);
  assert.deepEqual(observed.profiles, expected.profiles);
  assert.equal(expected.native_capacity, 'not_required');
  assert.deepEqual(counts(), before);
});
