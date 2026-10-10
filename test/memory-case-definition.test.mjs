import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadCase, initialFlowBoundary, validateCaseBlueprint, prepareE2EInput, assertBlankMemoryProject, interactionFixtureManifest, resultCheckpointMode, latestObservedStage, buildRunCandidate, frozenCandidate, assertRetainedRunDefinition } from '../lib/runner.mjs';
import { commandText } from '../lib/process-json.mjs';
import { readBaselineAdmissionPolicy, runBaselineAdmission, verifyBaselineAdmission } from '../lib/baseline-admission.mjs';

const caseId = 'mb-init-dd-tasks-zero';
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const schema = async file => new Ajv2020({ allErrors: true }).compile(await json(new URL(`../schemas/${file}`, import.meta.url)));

test('Memory checkpoint and failure projection use frozen stage order, not SDLC order', async t => {
  const loaded = await loadCase(caseId), contour = loaded.value.flow.contour;
  for (const [index, stage] of contour.entries()) assert.deepEqual(resultCheckpointMode(stage, contour), index === contour.length - 1
    ? { purpose: 'candidate', stage_entry: null } : { purpose: 'stage_entry', stage_entry: contour[index + 1] });
  assert.throws(() => resultCheckpointMode('merge', contour), { code: 'selection_invalid' });
  assert.throws(() => resultCheckpointMode('preflight'), { code: 'selection_invalid' });
  const records = [{ stage: 'merge', status: 'running' }, { stage: 'compose', status: 'done' }, { stage: 'preflight', status: 'done' }, { stage: 'review', status: 'blocked' }, { stage: 'verify', status: 'done' }];
  const status = { index: { stage_runs: records } };
  assert.equal(latestObservedStage(status, 'preflight', contour), 'review');
  assert.equal(latestObservedStage({ run: { index: { stage_runs: contour.slice().reverse().map(stage => ({ stage, status: 'done' })) } } }, 'preflight', contour), 'finish');
  assert.equal(latestObservedStage({ index: { stage_runs: [{ stage: 'merge', status: 'running' }] } }, 'preflight', contour), 'preflight');
  assert.equal(latestObservedStage({ index: { stage_runs: [{ stage: 'code', status: 'running' }] } }, 'specify'), 'code');
  const manifest = { run_id: 'EVAL-memory-projection', flow: loaded.value.flow, executions: [{ id: 'subject' }] };
  const results = [{ execution: 'subject', stage: 'preflight', state: 'failed', lifecycle: { status }, attempt: '/test-only' }];
  const candidate = await buildRunCandidate({ runId: manifest.run_id, manifest, results });
  assert.equal(candidate.executions[0].reached_stage, 'review');
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-candidate-')); t.after(() => rm(root, { recursive: true, force: true }));
  const frozen = await frozenCandidate({ root, manifest, results });
  assert.equal(frozen.candidate.executions[0].reached_stage, 'review');
  assert.equal((await frozenCandidate({ root, manifest, results })).candidate.immutable_hash, frozen.candidate.immutable_hash);
  await assert.rejects(assertRetainedRunDefinition({ flow: { ...loaded.value.flow, contour: ['specify', 'merge'] } }, loaded), { code: 'runner_definition_drift' });
});

test('authored Memory case binds all six contexts and independent facts without claiming pack qualification', async () => {
  const loaded = await loadCase(caseId);
  assert.equal((await schema('case.v7.schema.json'))(loaded.value), true);
  assert.equal((await schema('assessment.v1.schema.json'))(loaded.assessment), true);
  const blueprint = await json(path.join(loaded.root, 'entry-pack-source/stage-context.json'));
  const validate = await schema('stage-context.v1.schema.json');
  assert.equal(validate(blueprint), true, JSON.stringify(validate.errors));
  assert.equal(validateCaseBlueprint(blueprint, loaded), blueprint);
  assert.deepEqual(initialFlowBoundary(loaded), { flow: 'mb-init', stage: 'preflight' });
  assert.equal(loaded.value.entry_pack, null);
  const executions = [{ stage: 'preflight', terminal_stage: 'finish' }];
  const fixtures = await interactionFixtureManifest(loaded.root, executions, null, loaded.value.flow.contour);
  assert.deepEqual(Object.keys(fixtures), loaded.value.flow.contour);
  assert.deepEqual(await interactionFixtureManifest(loaded.root, executions, { interaction_fixtures: fixtures }, loaded.value.flow.contour), fixtures);
  const focused = await interactionFixtureManifest(loaded.root, [{ stage: 'review', terminal_stage: 'review' }], null, loaded.value.flow.contour);
  assert.deepEqual(Object.keys(focused), ['review']);
  await assert.rejects(interactionFixtureManifest(loaded.root, executions), { code: 'selection_invalid' }, 'historical SDLC default must not infer Memory');
  await assert.rejects(interactionFixtureManifest(loaded.root, [{ stage: 'review', terminal_stage: 'discover' }], null, loaded.value.flow.contour), { code: 'selection_invalid' });
  await assert.rejects(interactionFixtureManifest(loaded.root, [{ stage: 'specify', terminal_stage: 'finish' }], null, loaded.value.flow.contour), { code: 'selection_invalid' });
  const baseline = await readBaselineAdmissionPolicy({ caseRoot: loaded.root, definition: loaded.value.baseline_admission });
  assert.deepEqual(baseline.commands.map(item => item.id), ['zero-checkpoint']);
  assert.deepEqual(Object.keys(blueprint.stages), loaded.value.flow.contour);
  assert.deepEqual(Object.keys(loaded.assessment.scopes), loaded.value.flow.contour);
  for (const [stage, context] of Object.entries(blueprint.stages)) {
    assert.equal(context.task_input.length, stage === 'preflight' ? 1 : 0);
    assert(context.sources.every(source => !source.path.includes('assessment') && !source.path.includes('context-oracle')));
    assert(loaded.assessment.scopes[stage].golden.required_outcomes.length > 0);
  }
  const illegal = structuredClone(blueprint); illegal.stages['../escape'] = illegal.stages.preflight;
  assert.equal(validate(illegal), false);
  const foreign = structuredClone(blueprint); foreign.stages.merge = { ...foreign.stages.finish, stage: 'merge' };
  assert.throws(() => validateCaseBlueprint(foreign, loaded), /unsupported stages/);
  const mismatch = structuredClone(blueprint); mismatch.stages.preflight.stage = 'discover';
  assert.throws(() => validateCaseBlueprint(mismatch, loaded), /expected preflight/);
  assert.equal(validate({ ...blueprint, stages: {} }), false);
  const entryValidator = await schema('stage-entry.v1.schema.json');
  const packSchema = await json(new URL('../schemas/entry-pack.v1.schema.json', import.meta.url));
  const entriesValidator = new Ajv2020().compile(packSchema.properties.entries);
  assert.equal(entriesValidator(Object.fromEntries(loaded.value.flow.contour.map(stage => [stage, `entries/${stage}.json`]))), true);
  assert.equal(entriesValidator({ '../foreign': 'entry.json' }), false);
  assert.equal(entriesValidator({}), false);
  for (const stage of loaded.value.flow.contour) {
    const entry = { schema_id: 'dd-eval/stage-entry@1', case_id: caseId, revision: 'REV-001', checkpoint_id: 'test-only', stage,
      snapshot: { kind: stage === 'preflight' ? 'bootstrap' : 'run', locator: 'test-only', manifest_sha256: 'a'.repeat(64), run_id: stage === 'preflight' ? null : 'RUN-test' },
      context_slice_sha256: 'b'.repeat(64), semantic_package_sha256: 'c'.repeat(64) };
    assert.equal(entryValidator(entry), true, JSON.stringify(entryValidator.errors));
    assert.equal(entryValidator({ ...entry, stage: '../foreign' }), false);
  }
});

test('actual pinned dd-tasks zero checkpoint materializes blank with exact README bytes', { skip: !process.env.DD_TASKS_SOURCE_ROOT }, async t => {
  const loaded = await loadCase(caseId);
  const repository = path.resolve(process.env.DD_TASKS_SOURCE_ROOT);
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-zero-case-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkpoint = structuredClone(loaded.inputCheckpoint);
  checkpoint.value.source.repository = repository;
  const result = await prepareE2EInput({ projectRoot: path.join(root, 'product'), inputCheckpoint: checkpoint, flowId: 'mb-init' });
  await assertBlankMemoryProject(result.project_root);
  const commit = checkpoint.value.source.commit;
  assert.equal(await commandText('git', ['rev-parse', 'HEAD'], { cwd: result.project_root }), commit);
  assert.equal(await commandText('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: result.project_root }), 'README.md');
  assert.equal(await readFile(path.join(result.project_root, 'README.md'), 'utf8'), await commandText('git', ['show', `${commit}:README.md`], { cwd: repository }) + '\n');
  assert.equal(await commandText('git', ['status', '--porcelain'], { cwd: result.project_root }), '');
  const futureHead = await commandText('git', ['rev-parse', 'HEAD'], { cwd: repository });
  if (futureHead !== commit) await assert.rejects(commandText('git', ['cat-file', '-e', futureHead], { cwd: result.project_root }), { code: 'command_failed' });
  assert.equal(await commandText('git', ['remote'], { cwd: result.project_root }), '');
  const input = { caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot: result.project_root, checkpoint };
  const accepted = await runBaselineAdmission({ ...input, outputRoot: path.join(root, 'baseline') });
  assert.equal(accepted.status, 'passed');
  await verifyBaselineAdmission({ reference: accepted, definition: input.definition, checkpoint, caseRoot: loaded.root });
  const original = await readFile(path.join(result.project_root, 'README.md'));
  await writeFile(path.join(result.project_root, 'README.md'), Buffer.concat([original, Buffer.from('\nUnaccepted future behavior.\n')]));
  await assert.rejects(runBaselineAdmission({ ...input, outputRoot: path.join(root, 'rejected-baseline') }), { code: 'baseline_admission_failed' });
  assert.equal((await readFile(path.join(result.project_root, 'README.md'), 'utf8')).endsWith('Unaccepted future behavior.\n'), true, 'admission must not repair product bytes');
});
