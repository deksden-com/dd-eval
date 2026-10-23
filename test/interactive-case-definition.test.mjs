import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { loadCase, initialFlowBoundary, validateCaseBlueprint, interactionFixtureManifest } from '../lib/runner.mjs';
import { readBaselineAdmissionPolicy } from '../lib/baseline-admission.mjs';

test('interactive case binds original scope, explicit finish, independent review and clean-fixture limits', async t => {
  const loaded = await loadCase('interactive-authored-minimal');
  assert.deepEqual(initialFlowBoundary(loaded), { flow: 'interactive', stage: 'preflight' });
  const blueprint = validateCaseBlueprint(JSON.parse(await readFile(path.join(loaded.root, 'entry-pack-source/stage-context.json'))), loaded);
  assert.deepEqual(Object.keys(blueprint.stages), loaded.value.flow.contour);
  assert.equal(loaded.assessment.status, 'accepted');
  for (const stage of [...loaded.value.flow.contour, 'e2e']) {
    const scope = loaded.assessment.scopes[stage]; assert(scope.note.includes('does not test dirty-index'));
    for (const dimension of ['outcome', 'flow']) assert.equal(scope[dimension].reduce((sum, criterion) => sum + criterion.weight, 0), 1);
    assert(scope.golden.required_outcomes.length);
  }
  const fixtures = await interactionFixtureManifest(loaded.root, [{ stage: 'preflight', terminal_stage: 'integration' }], null, loaded.value.flow.contour);
  assert(fixtures);
  const interaction = JSON.parse(await readFile(path.join(loaded.root, 'entry-pack-source/interactions/interactive.json')));
  assert.equal(interaction.mode, 'required'); assert.equal(interaction.responses[0].input_kind, 'finish');
  const policy = await readBaselineAdmissionPolicy({ caseRoot: loaded.root, definition: loaded.value.baseline_admission });
  const root = await mkdtemp(path.join(os.tmpdir(), 'interactive-case-source-')); t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  execFileSync('git', ['clone', '--quiet', '--no-checkout', path.resolve(loaded.inputCheckpoint.value.source.repository), project]);
  execFileSync('git', ['-C', project, 'checkout', '--quiet', '--detach', loaded.inputCheckpoint.value.source.commit]);
  const before = execFileSync('git', ['-C', project, 'status', '--porcelain=v1', '-z']);
  assert.equal(await readFile(path.join(project, 'actual.ts'), 'utf8'), 'export const actual = 2; // existing user comment\n');
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(policy.commands[0].command, policy.commands[0].args, { cwd: project, env, encoding: 'utf8' });
  assert.match(output, /tests 1/); assert.match(output, /pass 1/);
  assert.deepEqual(execFileSync('git', ['-C', project, 'status', '--porcelain=v1', '-z']), before);
});
