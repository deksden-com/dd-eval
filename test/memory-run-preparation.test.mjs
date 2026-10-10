import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareCaseManagedRun, validateRunProfile } from '../lib/runner.mjs';

test('run profile Memory selection is explicit and cannot silently drop SDLC routing', () => {
  const profile = { schema_id: 'dd-eval/run-profile@1', id: 'test', case_id: 'memory', subject: { profile_id: 'fixture', memory_init: { profile: 'local' } }, selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 }, failure_policy: { stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true } };
  assert.equal(validateRunProfile(profile), profile);
  for (const selection of [{}, { profile: '' }, { profile: 'local', profileFile: '/file' }, { profile: 'local', stageProfiles: 'review=local' }, { profile: 'local', requestId: 'foreign' }])
    assert.throws(() => validateRunProfile({ ...profile, subject: { ...profile.subject, memory_init: selection } }));
  assert.throws(() => validateRunProfile({ ...profile, subject: { ...profile.subject, execution: {} } }), /exclusive/);
});

test('case Memory preparation binds original intake, stable scope and declared policy to public CLI', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'case-memory-prepare-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'entry-pack-source'); await mkdir(source);
  const intake = Buffer.from('Initialize this project.\r\n  '), intakeFile = path.join(source, 'original.txt');
  const sha = createHash('sha256').update(intake).digest('hex'); await writeFile(intakeFile, intake);
  const bin = path.join(root, 'cli.mjs'), calls = path.join(root, 'calls.json');
  await writeFile(bin, `import fs from 'node:fs'; const args=process.argv.slice(2); fs.writeFileSync(${JSON.stringify(calls)},JSON.stringify(args)); console.log(JSON.stringify({run_id:'RUN-memory',flow_id:'mb-init',action:'flow_mb_init_prepared',request_id:args[args.indexOf('--request-id')+1]}));`);
  const loaded = { root, value: { flow: { id: 'mb-init', contour: ['preflight','discover','compose','verify','review','finish'], git_policy: { route: 'integration_branch_direct', integration_branch: 'main' } } } };
  const blueprint = { stages: { preflight: { task_input: [{ role: 'initial_user_request', source: 'original.txt', path: '.dd-eval/original.txt', sha256: sha }] } } };
  const runProfile = { value: { subject: { memory_init: { profileFile: path.join(root, 'operation-profile.json') } } } };
  const input = { loaded, blueprint, runProfile, scopeId: 'owned-execution', projectRoot: root, bin };
  assert.equal((await prepareCaseManagedRun(input)).run_id, 'RUN-memory');
  const args = JSON.parse(await readFile(calls)), option = key => args[args.indexOf(`--${key}`)+1];
  assert.equal(args[0], 'init'); assert.equal(option('intake-file'), intakeFile); assert.equal(option('intake-sha256'), sha);
  assert.equal(option('workspace-root'), root); assert.equal(option('integration-branch'), 'main');
  assert.equal(option('request-id'), `memory-${createHash('sha256').update(input.scopeId).digest('hex')}`);
  assert.deepEqual(await readFile(intakeFile), intake);
  await prepareCaseManagedRun(input); assert.deepEqual(JSON.parse(await readFile(calls)), args);
  await rm(calls);
  await writeFile(intakeFile, 'modified');
  await assert.rejects(prepareCaseManagedRun(input), { code: 'task_input_checksum_mismatch' });
  await assert.rejects(readFile(calls), { code: 'ENOENT' });
  await writeFile(intakeFile, intake);
  for (const changed of [
    { loaded: { ...loaded, value: { flow: { ...loaded.value.flow, git_policy: undefined } } } },
    { blueprint: { stages: { preflight: { task_input: [] } } } },
    { runProfile: { value: { subject: {} } } },
    { runProfile: { value: { subject: { ...runProfile.value.subject, execution: {} } } } }
  ]) {
    await assert.rejects(prepareCaseManagedRun({ ...input, ...changed }), { code: 'managed_flow_input_invalid' });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
});
