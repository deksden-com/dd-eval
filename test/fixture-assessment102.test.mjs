import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { commandText } from '../lib/process-json.mjs';
import { runBaselineAdmission, verifyBaselineAdmission } from '../lib/baseline-admission.mjs';
import { resolveFixtureAssessment, verifyFixtureAssessment } from '../lib/fixture-assessment.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('one fixture assessment qualifies two independently checked worlds; foreign world and changed evidence fail', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assessment102-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cache = path.join(root, 'cache'), old = process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME;
  process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME = cache;
  t.after(() => { if (old === undefined) delete process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME; else process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME = old; });
  const counter = path.join(root, 'count');
  const assessed = `const fs=require('node:fs');const f=${JSON.stringify(counter)};fs.writeFileSync(f,String(Number(fs.existsSync(f)?fs.readFileSync(f):0)+1));`;
  const ready = `const fs=require('node:fs'),crypto=require('node:crypto');const token=crypto.randomUUID().replaceAll('-','');const w={state:'cleaned',world_id:token,pid:process.pid,project_root:process.cwd(),process_cleanup:[{settled:true}]};fs.writeFileSync(process.env.DD_TASKS_TEST_WORLD_FINAL_RECEIPT,JSON.stringify(w));console.log(JSON.stringify({schema_id:'dd-eval/world-readiness@1',world_id:token,owner_pid:process.pid,ready:true}));`;
  const policy = { schema_id: 'dd-eval/baseline-admission-policy@3', commands: [{ id: 'world-readiness', command: process.execPath, args: ['-e', ready], inactivity_timeout_ms: 2000 }], fixture_assessment: { inputs: ['package.json'], commands: [{ id: 'quality', command: process.execPath, args: ['-e', assessed], inactivity_timeout_ms: 2000 }] } };
  const bytes = JSON.stringify(policy); await writeFile(path.join(root, 'policy.json'), bytes);
  const definition = { file: 'policy.json', sha256: sha(bytes) }, checkpoint = { sha256: 'a'.repeat(64), value: { id: 'cp102', source: { commit: 'b'.repeat(40) } } };
  const refs = [];
  for (const id of ['one', 'two']) {
    const projectRoot = path.join(root, id); await mkdir(projectRoot); await writeFile(path.join(projectRoot, 'package.json'), '{}');
    await commandText('git', ['init', '-q'], { cwd: projectRoot });
    await commandText('git', ['add', '.'], { cwd: projectRoot });
    await commandText('git', ['-c','user.name=test','-c','user.email=test@localhost','commit','-qm','base'], { cwd: projectRoot });
    const ref = await runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, `result-${id}`), checkpoint });
    const receipt = await verifyBaselineAdmission({ reference: ref, definition, checkpoint, caseRoot: root, projectRoot });
    assert.equal(receipt.fixture_assessment.source, id === 'one' ? 'executed' : 'reused_fixture_assessment');
    refs.push(ref);
    await assert.rejects(runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, `result-${id}`), checkpoint }), { code: 'baseline_admission_attempt_exists' });
  }
  assert.equal(await readFile(counter, 'utf8'), '1');
  const forkRoot = path.join(root, 'fork-project'); await mkdir(forkRoot);
  await writeFile(path.join(forkRoot, 'package.json'), '{"feature_changes":true}');
  await commandText('git', ['init','-q'], { cwd: forkRoot });
  await commandText('git', ['add','.'], { cwd: forkRoot });
  await commandText('git', ['-c','user.name=test','-c','user.email=test@localhost','commit','-qm','fork'], { cwd: forkRoot });
  const fork = await runBaselineAdmission({ caseRoot: root, definition, projectRoot: forkRoot, outputRoot: path.join(root, 'fork-evidence'), checkpoint, inheritedBaseline: refs[0] });
  const forkReceipt = await verifyBaselineAdmission({ reference: fork, definition, checkpoint, caseRoot: root, projectRoot: forkRoot });
  assert.equal(forkReceipt.fixture_assessment.source, 'reused_fixture_assessment');
  assert.equal(await readFile(counter, 'utf8'), '1', 'fork refreshes readiness, not assessment of the product after feature edits');
  await assert.rejects(verifyBaselineAdmission({ reference: refs[0], definition, checkpoint, caseRoot: root, projectRoot: refs[1].project_root }), { code: 'baseline_admission_unconfirmed' });
  const receipt = JSON.parse(await readFile(refs[0].file));
  const assessment = await verifyFixtureAssessment(receipt.fixture_assessment, receipt.fixture_identity);
  await writeFile(path.join(assessment.evidence_root, 'quality.log'), 'tampered');
  await assert.rejects(verifyBaselineAdmission({ reference: refs[1], definition, checkpoint, caseRoot: root }), /assessment/);
});
test('an unknown or failed assessment never silently restarts or falls back to older PASS', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'assessment-fail102-')); t.after(() => rm(home, { recursive: true, force: true }));
  let calls = 0;
  const input = { home, identity: 'c'.repeat(64), assess: async () => { calls++; throw new Error('original failure'); } };
  await assert.rejects(resolveFixtureAssessment(input), /original failure/);
  await assert.rejects(resolveFixtureAssessment(input), /assessment/);
  assert.equal(calls, 1);
});
test('concurrent worlds join one owned fixture assessment without duplicate execution', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'assessment-concurrent102-')); t.after(() => rm(home, { recursive: true, force: true }));
  let calls = 0;
  const input = { home, identity: 'd'.repeat(64), assess: async root => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); await writeFile(path.join(root, 'evidence.txt'), 'completed'); return { status: 'passed' }; } };
  const [one, two] = await Promise.all([resolveFixtureAssessment(input), resolveFixtureAssessment(input)]);
  assert.equal(calls, 1); assert.equal(one.file, two.file); assert.equal(one.sha256, two.sha256);
});
test('a quality-only fixture change reuses the unaffected browser assessment', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assessment-groups102-')); t.after(() => rm(root, { recursive: true, force: true }));
  const prior = process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME; process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME = path.join(root, 'cache');
  t.after(() => { if (prior === undefined) delete process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME; else process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME = prior; });
  const counts = path.join(root, 'counts.json');
  const step = id => ({ id, command: process.execPath, args: ['-e', `const fs=require('node:fs');const f=${JSON.stringify(counts)},v=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):{};v[${JSON.stringify(id)}]=(v[${JSON.stringify(id)}]??0)+1;fs.writeFileSync(f,JSON.stringify(v));`], inactivity_timeout_ms: 5000 });
  const ready = { id: 'world-readiness', command: process.execPath, args: ['-e', `const fs=require('node:fs'),token=require('node:crypto').randomUUID().replaceAll('-','');fs.writeFileSync(process.env.DD_TASKS_TEST_WORLD_FINAL_RECEIPT,JSON.stringify({state:'cleaned',world_id:token,pid:process.pid,project_root:process.cwd(),process_cleanup:[{settled:true}]}));console.log(JSON.stringify({schema_id:'dd-eval/world-readiness@1',world_id:token,owner_pid:process.pid,ready:true}));`], inactivity_timeout_ms: 5000 };
  const policy = { schema_id: 'dd-eval/baseline-admission-policy@3', commands: [ready], fixture_assessment: { inputs: ['quality.json','browser.json'], inputs_by_command: { quality: ['quality.json'], browser: ['browser.json'] }, commands: [step('quality'),step('browser')] } };
  const bytes = JSON.stringify(policy); await writeFile(path.join(root, 'policy.json'), bytes);
  const definition = { file: 'policy.json', sha256: sha(bytes) }, checkpoint = { sha256: 'e'.repeat(64), value: { id: 'grouped', source: { commit: 'f'.repeat(40) } } };
  for (const id of ['one','two']) {
    const projectRoot = path.join(root, id); await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, 'quality.json'), id); await writeFile(path.join(projectRoot, 'browser.json'), 'unchanged');
    await commandText('git', ['init','-q'], { cwd: projectRoot }); await commandText('git', ['add','.'], { cwd: projectRoot });
    await commandText('git', ['-c','user.name=test','-c','user.email=test@localhost','commit','-qm','variant'], { cwd: projectRoot });
    const reference = await runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, `result-${id}`), checkpoint });
    await verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot: root, projectRoot });
  }
  assert.deepEqual(JSON.parse(await readFile(counts)), { quality: 2, browser: 1 });
});
