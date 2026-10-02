import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, realpath, writeFile, readFile, readdir, rm, unlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { hashJson } from '../lib/runner-events.mjs';
import { snapshotTreeHash } from '../lib/case-acceptance.mjs';
import { prepareSupplementalJudge, assertSupplementalEvidence, validateJudgeSupplement } from '../lib/judge-supplement.mjs';
import { parse, validateCommand } from '../lib/cli-input.mjs';
import { evalJudge, installRuntimeShim } from '../lib/runner.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { successfulPolicyFixture } from './fixtures/capacity-policy.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function put(root, name, value) { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; }
async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'judge-supplement-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'historical'), outputRoot = path.join(directory, 'assessment');
  const boundary = path.join(root, 'executions', 'e2e', 'boundaries', 'merge-frozen');
  await put(boundary, 'workspace/src/proof.sql', 'CREATE TYPE example AS ENUM (\'one\');\n');
  await put(boundary, 'runtime/receipt.json', { status: 'passed', proof_limits: ['fresh isolated world only'] });
  const snapshot = { schema_id: 'dd-flow/eval-run-snapshot@5', workspace: { sha256: snapshotTreeHash(path.join(boundary, 'workspace')) }, runtime_sha256: snapshotTreeHash(path.join(boundary, 'runtime')) };
  const snapshotFile = await put(boundary, 'snapshot.json', snapshot);
  const manifest = { run_id: 'EVAL-ORIGINAL', state: 'cancelled', case_id: 'original-case' };
  await put(root, 'manifest.json', manifest);
  await put(root, 'events.jsonl', 'historical terminal journal, do not rewrite\n');
  const content = { schema_id: 'dd-eval/run-candidate@2', run_id: manifest.run_id, manifest_sha256: hashJson(manifest), executions: [{ execution: 'e2e', checkpoint: { snapshot: boundary, manifest_sha256: sha(await readFile(snapshotFile)) } }] };
  const candidate = { ...content, immutable_hash: hashJson(content) };
  const evidence = { candidate_sha256: candidate.immutable_hash, execution: { snapshot: boundary, manifest_sha256: sha(await readFile(snapshotFile)) } };
  await put(root, 'judge/candidate.json', candidate);
  await put(root, 'judge/evidence.json', evidence);
  await put(root, 'judge/assessment.json', { schema_id: 'frozen-rubric', criteria: ['original-only'] });
  await put(root, 'judge/result.json', { candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result: { original: true } });
  const supplement = { schema_id: 'dd-eval/judge-supplement@1', original_eval_id: manifest.run_id, candidate_sha256: candidate.immutable_hash,
    boundary: { execution_id: 'e2e', name: 'merge-frozen', manifest_sha256: sha(await readFile(snapshotFile)) },
    sources: [{ root: 'workspace', path: 'src/proof.sql', sha256: sha(await readFile(path.join(boundary, 'workspace/src/proof.sql'))) }],
    author: 'offline investigation', claim: 'A repeated reset may retain a schema object', kind: 'source_inference', impact: 'migration proof scope', proof_limits: ['not runtime reproduced'] };
  const supplementFile = await put(directory, 'supplement.json', supplement);
  const profile = { id: 'judge', model: 'gpt-6-sol', reasoning: 'high', runtime: { commit: 'a'.repeat(40) } };
  return { directory, root, boundary, supplement, input: { evalRoot: root, supplementFile, outputRoot, profile } };
}

// Execute the public supplemental route with disposable CLI/native doubles;
// no native executable, network or historical case definition is consulted.
async function runtimeFixture(t, fault = null) {
  const f = await fixture(t), runtimeRoot = path.join(f.root, 'executions/e2e/dd-flow-home');
  const calls = path.join(f.directory, 'calls.jsonl'), settings = path.join(f.directory, 'settings.json');
  await put(f.directory, 'settings.json', { calls, fault, output: f.input.outputRoot });
  const engineRoot = path.join(runtimeRoot, 'engines/fixture/1');
  assert.ok(process.env.DD_FLOW_SOURCE_ROOT, 'set DD_FLOW_SOURCE_ROOT for exact built native contract fixtures');
  await cp(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'dist/harness-runtime'), path.join(engineRoot, 'dist/harness-runtime'), { recursive: true });
  await put(engineRoot, 'cli.cjs', `const fs=require('node:fs'); const a=process.argv.slice(2), c=JSON.parse(fs.readFileSync(${JSON.stringify(settings)}));
fs.appendFileSync(c.calls,JSON.stringify({flow:a})+'\\n');
if(a[0]==='codex' && c.fault==='changed-during-setup') fs.appendFileSync(c.output+'/assessment.json',' ');
console.log(JSON.stringify({ok:true}));`);
  await put(engineRoot, 'dist/harness-runtime/bin/dd-codex.mjs', `import fs from 'node:fs'; import path from 'node:path'; import {createHash} from 'node:crypto';
const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1],c=JSON.parse(fs.readFileSync(${JSON.stringify(settings)})),id=process.env.DD_EVAL_OPERATION_ID;
fs.appendFileSync(c.calls,JSON.stringify({native:a,operation_id:id})+'\\n');
const state=get('--state-dir'), session='judge-session'; let result={ready:true};
const write=(name,value)=>{fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,JSON.stringify(value));};
if(a[0]==='daemon' && a[1]==='start') write(state+'/daemon.json',{daemon_id:'fixture-daemon',pid:2147483647,config:{cwd:get('--cwd')},shutdown_state:'running',active_tree:false});
if(a[0]==='daemon' && a[1]==='stop') {const s=JSON.parse(fs.readFileSync(state+'/daemon.json'));write(state+'/daemon.json',{...s,shutdown_state:'clean',active_tree:false,shutdown:{schema_id:'dd-flow/daemon-shutdown@1',daemon_id:s.daemon_id,result:{clean:true},required_phases:['tree','provider_close','daemon_resource'],phases:{tree:true,provider_close:true,daemon_resource:true}}});result={stopped:true,clean:true,shutdown_contract:'dd-flow/daemon-shutdown@1'};const o=path.join(state,'operations',createHash('sha256').update(id).digest('hex'));write(o+'/requested.json',{operation_id:id,operation:'daemon.stop',daemon_id:s.daemon_id});write(o+'/result.json',{state:'completed',result});}
if(a[0]==='session') {
 result={provider_session_id:session};
 if(a[1]==='prompt') {
  const criterion=id=>({id,score:3,not_applicable:false,rationale:'offline evidence',evidence:[get('--cwd')+'/evidence.json']});
  result={...result,turn_id:'judge-turn',turn:{id:'judge-turn',status:'completed'},assistant_text:JSON.stringify({schema_id:'dd-eval/judge-result@2',scope:'e2e',run_validity:'valid',outcome:[criterion('proof')],flow:[criterion('reliability')],findings:[],golden:{covered:[],missed:[],alternatives:[],novel:[]},conclusion:'offline fixture'})};
 }
 if(['create','prompt'].includes(a[1])) {
  const root=path.join(state,'operations',createHash('sha256').update(id).digest('hex'));
  write(root+'/requested.json',{operation_id:id,operation:'session.'+a[1],session_id:session});write(root+'/result.json',{state:'completed',result});
  if(a[1]==='prompt' && c.fault==='lost-reply') {console.error(JSON.stringify({error:{code:'operation_observation_lost',message:'lost native reply'}}));process.exit(1);}
 }
}
console.log(JSON.stringify(result));`);
  await put(engineRoot, 'dist/harness-runtime/lib/codex-capacity-policy.mjs', successfulPolicyFixture);
  const engine = { schema_id: 'dd-flow/engine-manifest@1', package_name: 'fixture', package_version: '1', engine_version: '1', snapshot_root: engineRoot,
    package_root: engineRoot, entrypoint: 'cli.cjs', integrity: { checksum: await engineArtifactDigest(engineRoot) } };
  if (fault === 'escaped-engine-version') engine.package_version = engine.engine_version = '../../../../historical';
  await put(engineRoot, 'engine.json', engine);
  await installRuntimeShim(runtimeRoot, engine);
  // A legitimate home may retain unrelated engine versions after an upgrade.
  await put(runtimeRoot, 'engines/fixture/2/engine.json', { ...engine, package_version: '2', engine_version: '2' });
  await put(runtimeRoot, 'harnesses.json', { schema_id: 'dd-flow/harness-config@1', harnesses: { 'codex-desktop': { runtime_command: process.execPath } } });
  await mkdir(path.join(f.root, 'executions/e2e/project'), { recursive: true });
  const runId = 'RUN-fixture', relativeRun = 'projects/PRJ-fixture/runs/' + runId;
  await put(f.boundary, 'runtime/' + relativeRun + '/engine-binding.json', { schema_id: 'dd-flow/run-engine-binding@1', run_id: runId,
    engine: { package_name: engine.package_name, package_version: engine.package_version, engine_version: engine.engine_version, integrity_checksum: engine.integrity.checksum } });
  const snapshot = JSON.parse(await readFile(path.join(f.boundary, 'snapshot.json')));
  Object.assign(snapshot, { run_id: runId, dd_flow_home: runtimeRoot, source_status: { run: { run_root: path.join(runtimeRoot, relativeRun) } }, runtime_sha256: snapshotTreeHash(path.join(f.boundary, 'runtime')) });
  await put(f.boundary, 'snapshot.json', snapshot);
  const manifest = JSON.parse(await readFile(path.join(f.root, 'manifest.json')));
  manifest.profile = { concurrency: { global: 1, per_harness: { 'codex-desktop': 1 } }, selection: { e2e: true } };
  await put(f.root, 'manifest.json', manifest);
  const checkpoint = { snapshot: f.boundary, run_id: runId, manifest_sha256: sha(await readFile(path.join(f.boundary, 'snapshot.json'))) };
  const candidate = { schema_id: 'dd-eval/run-candidate@2', run_id: manifest.run_id, manifest_sha256: hashJson(manifest), executions: [{ execution: 'e2e', checkpoint }] };
  candidate.immutable_hash = hashJson(candidate);
  const evidence = { candidate_sha256: candidate.immutable_hash, checkpoint };
  await put(f.root, 'judge/candidate.json', candidate); await put(f.root, 'judge/evidence.json', evidence);
  await put(f.root, 'judge/assessment.json', { scopes: { e2e: { outcome: [{ id: 'proof' }], flow: [{ id: 'reliability' }] } } });
  await put(f.root, 'judge/result.json', { candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result: { scope: 'e2e' } });
  f.supplement.candidate_sha256 = candidate.immutable_hash; f.supplement.boundary.manifest_sha256 = checkpoint.manifest_sha256;
  await writeFile(f.input.supplementFile, JSON.stringify(f.supplement));
  const profileId = await put(f.directory, 'profile.json', { id: 'offline-judge', harness: 'codex-desktop', model: 'fixture', reasoning: 'high' });
  return { ...f, calls, engineRoot, invoke: () => evalJudge({ evalRoot: f.root, profileId, supplementFile: f.input.supplementFile, outputRoot: f.input.outputRoot }) };
}

test('public supplemental Judge executes only its owned runtime and rebuilds a missing report without native replay', async t => {
  const f = await runtimeFixture(t), before = snapshotTreeHash(f.root);
  const result = await f.invoke();
  assert.equal(result.receipt.session_id, 'judge-session');
  assert.equal(snapshotTreeHash(f.root), before);
  const calls = await readFile(f.calls, 'utf8'), records = calls.trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(row => row.native?.[0] === 'session' && row.native[1] === 'create').length, 1);
  assert.equal(records.filter(row => row.native?.[0] === 'session' && row.native[1] === 'prompt').length, 1);
  assert.ok(records.some(row => row.native?.[0] === 'daemon' && row.native[1] === 'stop'));
  await unlink(path.join(result.root, 'report.json'));
  const cached = await f.invoke(); assert.equal(cached.reused, true);
  assert.equal(await readFile(f.calls, 'utf8'), calls);
  const report = JSON.parse(await readFile(path.join(result.root, 'report.json')));
  assert.equal(report.supplemental.session_id, 'judge-session'); assert.equal(report.cleanup, 'settled');
  assert.equal(snapshotTreeHash(f.root), before);
});

test('supplemental Judge reattaches to a confirmed native reply without a second Session or prompt', async t => {
  const f = await runtimeFixture(t, 'lost-reply'), before = snapshotTreeHash(f.root);
  const initial = await f.invoke(); // callDriver can recover an already durable lost reply immediately.
  const chainFile = (await readdir(initial.root)).find(name => name.startsWith('capacity-') && name.endsWith('.json'));
  const chain = JSON.parse(await readFile(path.join(initial.root, chainFile)));
  chain.turns.at(-1).state = 'dispatched'; delete chain.turns.at(-1).result;
  await writeFile(path.join(initial.root, chainFile), JSON.stringify(chain));
  const eventsFile = path.join(initial.root, 'events.jsonl');
  const events = (await readFile(eventsFile, 'utf8')).trim().split('\n').map(JSON.parse)
    .filter(event => !['dev.dd.eval.operation.completed', 'dev.dd.eval.final_judge.result_ready'].includes(event.type));
  events.forEach((event, index) => { event.data.sequence = index + 1; });
  await writeFile(eventsFile, events.map(event => JSON.stringify(event)).join('\n') + '\n');
  await unlink(path.join(initial.root, 'report.json'));
  const resumed = await f.invoke(); assert.equal(resumed.receipt.session_id, 'judge-session');
  const records = (await readFile(f.calls, 'utf8')).trim().split('\n').map(JSON.parse);
  for (const command of ['create', 'prompt']) assert.equal(records.filter(row => row.native?.[0] === 'session' && row.native[1] === command).length, 1);
  assert.equal(snapshotTreeHash(f.root), before);
});

test('supplemental publication rechecks physical cleanup and retains the verdict when it becomes unconfirmed', async t => {
  const f = await runtimeFixture(t), result = await f.invoke();
  const calls = await readFile(f.calls, 'utf8'), originalKill = process.kill;
  let observations = 0;
  const probe = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid !== 2147483647 || signal !== 0) return originalKill(pid, signal);
    throw Object.assign(new Error('offline physical observation'), { code: ++observations === 2 ? 'EPERM' : 'ESRCH' });
  });
  await assert.rejects(f.invoke(), { code: 'judge_cleanup_unconfirmed' });
  probe.mock.restore();
  const report = JSON.parse(await readFile(path.join(result.root, 'report.json')));
  assert.equal(report.judge_status, 'failed'); assert.equal(report.cleanup, 'unconfirmed');
  assert.equal(report.judge_cleanup.status, 'unknown');
  assert.deepEqual(report.supplemental, result.receipt);
  assert.equal(await readFile(f.calls, 'utf8'), calls);
});

test('supplemental evidence drift during setup prevents native Session creation', async t => {
  const f = await runtimeFixture(t, 'changed-during-setup'), before = snapshotTreeHash(f.root);
  await assert.rejects(f.invoke(), { code: 'judge_packet_changed' });
  const records = (await readFile(f.calls, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(row => row.native?.[0] === 'session' || row.native?.[0] === 'daemon' && row.native[1] === 'start').length, 0);
  assert.equal(snapshotTreeHash(f.root), before);
});

test('supplemental engine metadata cannot select an overwrite target outside its private runtime', async t => {
  const f = await runtimeFixture(t, 'escaped-engine-version'), before = snapshotTreeHash(f.root);
  await assert.rejects(f.invoke(), /contained relative path/);
  assert.equal(snapshotTreeHash(f.root), before);
  await assert.rejects(readFile(f.calls), { code: 'ENOENT' });
});

test('unfinished supplemental assessment refuses an engine redirected to historical runtime', async t => {
  const f = await runtimeFixture(t), before = snapshotTreeHash(f.root);
  const result = await f.invoke(), calls = await readFile(f.calls, 'utf8');
  const privateEngine = path.join(result.root, 'runtime/engines/fixture/1/engine.json');
  const engine = JSON.parse(await readFile(privateEngine)); engine.snapshot_root = f.engineRoot;
  await writeFile(privateEngine, JSON.stringify(engine));
  // Disposable observer crash before its completion event; old EVAL is untouched.
  await writeFile(path.join(result.root, 'events.jsonl'), '');
  await assert.rejects(f.invoke(), { code: 'judge_runtime_missing' });
  assert.equal(await readFile(f.calls, 'utf8'), calls);
  assert.equal(snapshotTreeHash(f.root), before);
});

test('independent supplemental preparation freezes original rubric and all source bytes without touching a cancelled EVAL', async t => {
  const f = await fixture(t), original = snapshotTreeHash(f.root);
  const [first, identical] = await Promise.all([prepareSupplementalJudge(f.input), prepareSupplementalJudge(f.input)]);
  assert.equal(first.key, identical.key);
  assert.equal(first.assessment.schema_id, 'frozen-rubric');
  assert.equal(first.manifest.state, 'cancelled');
  await assertSupplementalEvidence(first);
  assert.equal(snapshotTreeHash(f.root), original);
  const view = JSON.parse(await readFile(path.join(first.root, 'evidence.json'), 'utf8'));
  assert.ok(view.supplement.sources.every(source => source.file.startsWith(first.root + path.sep)));
  assert.equal(view.supplement.kind, 'source_inference');
  assert.ok(first.sourceFiles.some(source => source.file.endsWith('runtime/receipt.json')));
  const different = await prepareSupplementalJudge({ ...f.input, outputRoot: path.join(f.directory, 'other'), profile: { ...f.input.profile, reasoning: 'xhigh' } });
  assert.notEqual(different.key, first.key);
  await assert.rejects(prepareSupplementalJudge({ ...f.input, profile: { ...f.input.profile, reasoning: 'xhigh' } }), { code: 'judge_output_conflict' });
  const nested = first.sourceFiles.find(source => source.file.endsWith('src/proof.sql'));
  await writeFile(nested.file, 'mutated copy');
  await assert.rejects(assertSupplementalEvidence(first), { code: 'judge_packet_changed' });
  assert.equal(snapshotTreeHash(f.root), original);
});

test('supplement source, candidate and frozen boundary mismatches fail before dispatch', async t => {
  const f = await fixture(t);
  for (const value of [
    { ...f.supplement, original_eval_id: 'foreign' },
    { ...f.supplement, boundary: { ...f.supplement.boundary, manifest_sha256: '0'.repeat(64) } },
    { ...f.supplement, sources: [{ ...f.supplement.sources[0], sha256: '0'.repeat(64) }] },
    { ...f.supplement, sources: [{ ...f.supplement.sources[0], path: '../outside' }] }
  ]) {
    await writeFile(f.input.supplementFile, JSON.stringify(value));
    await assert.rejects(prepareSupplementalJudge(f.input), { code: 'judge_supplement_invalid' });
  }
  await writeFile(f.input.supplementFile, JSON.stringify(f.supplement));
  await assert.rejects(prepareSupplementalJudge({ ...f.input, outputRoot: path.join(f.root, 'new-assessment') }), { code: 'judge_output_conflict' });
  await symlink(f.root, path.join(f.directory, 'symlink-old'));
  await assert.rejects(prepareSupplementalJudge({ ...f.input, outputRoot: path.join(f.directory, 'symlink-old', 'new-assessment') }), { code: 'judge_output_conflict' });
  assert.throws(() => validateJudgeSupplement({ ...f.supplement, kind: 'guaranteed_failure' }), { code: 'judge_supplement_invalid' });
  assert.throws(() => validateJudgeSupplement({ ...f.supplement, sources: [null] }), { code: 'judge_supplement_invalid' });
  const candidateFile = path.join(f.root, 'judge/candidate.json'), candidate = JSON.parse(await readFile(candidateFile, 'utf8'));
  await writeFile(candidateFile, JSON.stringify({ ...candidate, manifest_sha256: '0'.repeat(64) }));
  await assert.rejects(prepareSupplementalJudge(f.input), { code: 'judge_supplement_invalid' });
});

test('missing original assessment has no current case fallback', async t => {
  const f = await fixture(t);
  await unlink(path.join(f.root, 'judge/assessment.json'));
  await assert.rejects(prepareSupplementalJudge(f.input), { code: 'judge_assessment_missing' });
});

test('the complete frozen snapshot remains accessible through owned packet paths', async t => {
  const f = await fixture(t), prepared = await prepareSupplementalJudge(f.input);
  const view = JSON.parse(await readFile(path.join(prepared.root, 'candidate.json'), 'utf8'));
  const snapshot = view.executions[0].checkpoint.snapshot;
  assert.ok(snapshot.startsWith(prepared.root + path.sep), 'snapshot must not become provenance-only metadata');
  assert.equal(await readFile(path.join(snapshot, 'workspace/src/proof.sql'), 'utf8'), "CREATE TYPE example AS ENUM ('one');\n");
  await put(snapshot, 'workspace/undeclared.txt', 'extra evidence');
  await assert.rejects(assertSupplementalEvidence(prepared), { code: 'judge_packet_changed' });
});

test('a replaced copy directory cannot write through a symlink into historical evidence', async t => {
  const f = await fixture(t), prepared = await prepareSupplementalJudge(f.input);
  const source = prepared.sourceFiles.find(item => item.file.endsWith('src/proof.sql'));
  const sink = path.join(f.root, 'unrelated-empty-directory'); await mkdir(sink);
  await rm(path.dirname(source.file), { recursive: true });
  await symlink(sink, path.dirname(source.file));
  await assert.rejects(prepareSupplementalJudge(f.input), { code: 'judge_supplement_invalid' });
  await assert.rejects(readFile(path.join(sink, 'proof.sql')), { code: 'ENOENT' });
});

test('supplemental CLI accepts paired options and rejects incomplete or duplicate options before historical I/O', async t => {
  const f = await fixture(t);
  const command = ['runner', 'eval', 'judge', '--eval', f.root, '--supplement', f.input.supplementFile, '--output', f.input.outputRoot, '--profile', 'judge'];
  const parsed = parse(command); validateCommand(parsed);
  assert.equal(parsed.options.supplement, f.input.supplementFile);
  assert.equal(parsed.options.output, f.input.outputRoot);
  assert.throws(() => parse([...command, '--supplement', 'again']), { code: 'usage' });
  for (const partial of [{ supplementFile: f.input.supplementFile }, { outputRoot: f.input.outputRoot }]) {
    await assert.rejects(evalJudge({ evalRoot: path.join(f.directory, 'absent-historical'), ...partial }), { code: 'usage' });
  }
  const run = promisify(execFile), cli = path.resolve(import.meta.dirname, '../bin/dd-eval.mjs');
  const help = await run(process.execPath, [cli, 'runner', 'eval', 'judge', '--help']);
  assert.match(help.stdout, /--supplement <file> --output <new-assessment-root>/);
  await assert.rejects(run(process.execPath, [cli, 'runner', 'eval', 'judge', '--eval', f.root, '--supplement', f.input.supplementFile]), error => error.code === 2 && /must be supplied together/.test(error.stderr));
});
