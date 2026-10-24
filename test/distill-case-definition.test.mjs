import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadCase, initialFlowBoundary, validateCaseBlueprint } from '../lib/runner.mjs';
import { readBaselineAdmissionPolicy } from '../lib/baseline-admission.mjs';

test('distill case binds both lenses, separate target, six stages and independent source/preservation criteria', async () => {
  const loaded = await loadCase('mb-distill-authored-mature');
  assert.deepEqual(initialFlowBoundary(loaded), { flow: 'mb-distill', stage: 'preflight' });
  const blueprint = validateCaseBlueprint(JSON.parse(await readFile(path.join(loaded.root, 'entry-pack-source/stage-context.json'))), loaded);
  assert.deepEqual(Object.keys(blueprint.stages), loaded.value.flow.contour);
  const request = await readFile(path.join(loaded.root, loaded.value.input[0].source), 'utf8');
  for (const marker of ['domain-04', 'process-09', '../distill-destination', '.memory-bank/mbb/distilled-practices.md']) assert(request.includes(marker));
  assert(!request.includes('DESTINATION-BOUNDARY-001'), 'The original document is an input to inspect, not a golden answer in the task');
  assert.equal(loaded.assessment.status, 'accepted');
  for (const stage of [...loaded.value.flow.contour, 'e2e']) {
    const scope = loaded.assessment.scopes[stage]; assert(scope);
    for (const dimension of ['outcome', 'flow']) assert.equal(scope[dimension].reduce((sum, item) => sum + item.weight, 0), 1);
    assert(scope.golden.required_outcomes.length);
  }
  assert(loaded.assessment.scopes.e2e.golden.required_outcomes.some(item => item.id === 'source-backed-truth' && item.statement.includes('id-only')));
  await readBaselineAdmissionPolicy({ caseRoot: loaded.root, definition: loaded.value.baseline_admission });
});

test('distill baseline seeds only its separate owned destination and never resets published or foreign data', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-distill-source-')); t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const loaded = await loadCase('mb-distill-authored-mature');
  const bundle = path.resolve('test/fixtures/diagnostic/mature-conformance-v1.bundle');
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-checkout', bundle, project]);
  execFileSync('git', ['-C', project, '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', loaded.inputCheckpoint.value.source.commit]);
  const before = execFileSync('git', ['-C', project, 'status', '--porcelain=v1', '-z']);
  const policy = await readBaselineAdmissionPolicy({ caseRoot: loaded.root, definition: loaded.value.baseline_admission });
  const command = policy.commands[0];
  const run = () => spawnSync(process.execPath, command.args, { cwd: project, encoding: 'utf8' });
  assert.equal(run().status, 0); assert.equal(run().status, 0);
  assert.deepEqual(execFileSync('git', ['-C', project, 'status', '--porcelain=v1', '-z']), before);
  const file = path.join(root, 'distill-destination/.memory-bank/mbb/distilled-practices.md');
  assert((await readFile(file, 'utf8')).includes('DESTINATION-BOUNDARY-001'));
  await writeFile(file, 'A published result must not be reset by baseline admission.\n');
  assert.notEqual(run().status, 0);
  assert.equal(await readFile(file, 'utf8'), 'A published result must not be reset by baseline admission.\n');
  await writeFile(path.join(root, 'distill-destination/.fixture-owner.json'), 'foreign');
  assert.notEqual(run().status, 0);
  assert.equal(await readFile(file, 'utf8'), 'A published result must not be reset by baseline admission.\n');
});
