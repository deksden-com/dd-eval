import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareCaseManagedRun, validateRunProfile } from '../lib/runner.mjs';
import Ajv2020 from 'ajv/dist/2020.js';

test('run profile Memory selection is explicit and cannot silently drop SDLC routing', async () => {
  const schema = new Ajv2020({ strict: false }).compile(JSON.parse(await readFile(new URL('../schemas/run-profile.v1.schema.json', import.meta.url))));
  const profile = { schema_id: 'dd-eval/run-profile@1', id: 'test', case_id: 'memory', subject: { profile_id: 'fixture', memory_setup: { canonSource: '/fixture/release', trustFile: '/fixture/trust.json' }, memory_init: { profile: 'local' } }, selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 }, failure_policy: { stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true } };
  assert.equal(validateRunProfile(profile), profile);
  for (const maxParallel of [1, 2, 256]) {
    const selected = { ...profile, subject: { ...profile.subject, memory_init: { profile: 'local', maxParallel } } };
    assert.equal(validateRunProfile(selected), selected);
    assert.equal(schema(selected), true, JSON.stringify(schema.errors));
  }
  for (const maxParallel of [null, 0, -1, 1.5, 257, '2']) {
    const selected = { ...profile, subject: { ...profile.subject, memory_init: { profile: 'local', maxParallel } } };
    assert.throws(() => validateRunProfile(selected), { code: 'managed_flow_input_invalid' });
    assert.equal(schema(selected), false);
  }
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
  const bin = path.join(root, 'cli.mjs'), calls = path.join(root, 'calls.json'), setupCalls = path.join(root, 'setup-calls.txt');
  await writeFile(bin, `import fs from 'node:fs'; const args=process.argv.slice(2); fs.writeFileSync(${JSON.stringify(calls)},JSON.stringify(args)); console.log(JSON.stringify({run_id:'RUN-memory',flow_id:'mb-init',action:'flow_mb_init_prepared',request_id:args[args.indexOf('--request-id')+1]}));`);
  const flowPack = { delivery: 'installed_canon', commit: 'b'.repeat(40), memory_bank_version: '1', engine: { version: 'fixture' } };
  const setupReceipt = { installation_readiness: 'installed', installation: { manifest: { canon: { commit: flowPack.commit, version: '1' }, engine: { version: 'fixture' } } } };
  const originalCli = await readFile(bin, 'utf8');
  await writeFile(bin, `if (process.argv[2] === 'setup') { fs.appendFileSync(${JSON.stringify(setupCalls)}, 'setup'); console.log(JSON.stringify(${JSON.stringify(setupReceipt)})); } else { ${originalCli.replace("import fs from 'node:fs';", '')} }`,);
  await writeFile(bin, "import fs from 'node:fs';\n" + await readFile(bin, 'utf8'));
  const loaded = { root, inputCheckpoint: { value: { flow_pack: flowPack } }, value: { flow: { id: 'mb-init', contour: ['preflight','discover','compose','verify','review','finish'], git_policy: { route: 'integration_branch_direct', integration_branch: 'main' } } } };
  const blueprint = { stages: { preflight: { task_input: [{ role: 'initial_user_request', source: 'original.txt', path: '.dd-eval/original.txt', sha256: sha }] } } };
  const runProfile = { value: { subject: { memory_setup: { canonSource: path.join(root, 'release'), trustFile: path.join(root, 'trust.json') }, memory_init: { profileFile: path.join(root, 'operation-profile.json') } } } };
  const projectRoot = path.join(root, 'project'); await mkdir(projectRoot);
  const input = { loaded, blueprint, runProfile, scopeId: 'owned-execution', projectRoot, bin, env: { DD_FLOW_HOME: path.join(root, 'runtime') } };
  for (const maxParallel of [null, 0, -1, 1.5, 257, '2']) {
    await assert.rejects(prepareCaseManagedRun({ ...input, runProfile: { value: { subject: {
      ...runProfile.value.subject, memory_init: { ...runProfile.value.subject.memory_init, maxParallel }
    } } } }), { code: 'managed_flow_input_invalid' });
    await assert.rejects(readFile(setupCalls), { code: 'ENOENT' });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
  assert.equal((await prepareCaseManagedRun(input)).run_id, 'RUN-memory');
  const args = JSON.parse(await readFile(calls)), option = key => args[args.indexOf(`--${key}`)+1];
  assert.equal(args[0], 'init'); assert.equal(option('intake-file'), intakeFile); assert.equal(option('intake-sha256'), sha);
  assert.equal(option('workspace-root'), projectRoot); assert.equal(option('integration-branch'), 'main');
  assert.equal(option('request-id'), `memory-${createHash('sha256').update(input.scopeId).digest('hex')}`);
  assert.deepEqual(await readFile(intakeFile), intake);
  await prepareCaseManagedRun(input); assert.deepEqual(JSON.parse(await readFile(calls)), args);
  await prepareCaseManagedRun({ ...input, runProfile: { value: { subject: { ...runProfile.value.subject,
    memory_init: { ...runProfile.value.subject.memory_init, maxParallel: 2 }
  } } } });
  const parallelArgs = JSON.parse(await readFile(calls));
  assert.equal(parallelArgs[parallelArgs.indexOf('--max-parallel') + 1], '2');
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
