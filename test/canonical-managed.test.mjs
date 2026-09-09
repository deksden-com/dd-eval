import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { commandText } from '../lib/process-json.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';

test('public canonical resume and review retain one managed owner in a committed definition', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-managed-'));
  const repository = path.join(root, 'definition'), home = path.join(root, 'eval'), build = path.join(home, 'canonical', 'fixture', 'REV-001');
  const project = path.join(build, 'reference', 'project'), runtime = path.join(build, 'reference', 'dd-flow-home');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const write = async (file, value, options) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value), options); return file; };
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  try {
    await cp(new URL('../lib', import.meta.url), path.join(repository, 'lib'), { recursive: true });
    const engineRoot = path.join(home, 'engine'); await write(path.join(engineRoot, 'fixture.txt'), 'fixture engine');
    const digest = await engineArtifactDigest(engineRoot);
    const engine = { schema_id: 'dd-flow/engine-manifest@1', package_name: 'fixture', package_version: '1.0.0', engine_version: '1.0.0', integrity: { checksum: digest }, snapshot_root: engineRoot };
    await write(path.join(engineRoot, 'engine.json'), engine);
    const checkpoint = { id: 'cp-fixture', source: { commit: 'a'.repeat(40) }, flow_pack: { commit: 'b'.repeat(40), path: '.memory-bank', engine: { repository: 'fixture', commit: 'c'.repeat(40), version: '1.0.0', artifact_sha256: digest } } };
    const cpFile = await write(path.join(repository, 'checkpoints', 'cp-fixture.json'), checkpoint), cpHash = hash(await readFile(cpFile));
    const caseRoot = path.join(repository, 'cases', 'fixture');
    await write(path.join(caseRoot, 'assessment.json'), {});
    await write(path.join(caseRoot, 'case.json'), { schema_id: 'dd-eval/case@7', id: 'fixture', assessment: 'assessment.json', input: [], entry_pack: null, baseline_admission: { sha256: 'd'.repeat(64) }, input_checkpoint: { id: 'cp-fixture', sha256: cpHash }, flow: { contour: ['specify', 'protocolize'], terminal_stage: 'protocolize' } });
    await write(path.join(repository, 'profiles', 'fixture.json'), { id: 'fixture', harness: 'codex-desktop', model: 'fixture', reasoning: 'low' });
    const profileFile = await write(path.join(repository, 'run.json'), { schema_id: 'dd-eval/run-profile@1', id: 'fixture', case_id: 'fixture', subject: { profile_id: 'fixture' }, selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 }, failure_policy: { stop_run_on_infrastructure_error: true, stop_execution_on_unexpected_hitl: true, stop_execution_on_unmatched_hitl: true } });
    const blueprint = { schema_id: 'dd-eval/stage-context-blueprint@1', stages: Object.fromEntries(['specify', 'protocolize'].map(stage => [stage, { schema_id: 'dd-eval/stage-context@1', stage, objective: 'Fixture', task_input: [] }])) };
    await write(path.join(build, 'stage-context.json'), blueprint);
    await mkdir(project, { recursive: true });
    await commandText('git', ['init', '--quiet', '-b', 'main'], { cwd: project });
    const admission = await write(path.join(build, 'baseline.json'), { status: 'passed', checkpoint_sha256: cpHash, checkpoint_id: checkpoint.id, source_commit: checkpoint.source.commit, policy_sha256: 'd'.repeat(64), checks: [{ exit_code: 0 }] });
    await write(path.join(build, 'entries', 'specify.json'), { schema_id: 'dd-eval/stage-entry@1', case_id: 'fixture', revision: 'REV-001', checkpoint_id: 'fixture', stage: 'specify', snapshot: { kind: 'bootstrap', locator: 'bootstrap', manifest_sha256: 'e'.repeat(64), run_id: null }, semantic_package_sha256: 'f'.repeat(64), context_slice_sha256: 'f'.repeat(64) });
    const cli = `#!${process.execPath}
import fs from 'node:fs'; import path from 'node:path'; import {createHash} from 'node:crypto';
const root=${JSON.stringify(build)}, project=${JSON.stringify(project)}, engine=${JSON.stringify(engine)};
const args=process.argv.slice(2), file=root+'/transport.json';
fs.appendFileSync(root+'/calls.jsonl',JSON.stringify(args)+'\\n');
const s=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {stage:'specify',launched:false};
const boundary=()=>{const next=s.stage==='specify'?'protocolize':null, output=root+'/reference/boundaries/'+s.stage;fs.mkdirSync(output,{recursive:true});const manifest=output+'/snapshot.json';const value={schema_id:'dd-flow/eval-run-snapshot@5',run_id:'RUN-fixture',purpose:next?'stage_entry':'candidate',stage_entry:next,boundary_capture:{controller_id:'DRV-fixture',operation_id:s.stage,boundary_key:s.stage}};if(!fs.existsSync(manifest))fs.writeFileSync(manifest,JSON.stringify(value));return {stage:s.stage,manifest,manifest_sha256:createHash('sha256').update(fs.readFileSync(manifest)).digest('hex'),operation_id:s.stage,boundary_key:s.stage};};
const controller=()=>({controller_id:'DRV-fixture',status:s.stage==='specify'?'waiting_for_context':'stop_target_reached',stage:s.stage,sessions:[{session_id:'native-retained',stopped:s.stage!=='specify'}]});
let out;
if(args[0]==='engine')out={selection:{selected:engine}};
else if(args[0]==='run'&&args[1]==='status')out={run:{run_root:root+'/run',workspace_root:project},index:{stage_runs:[{stage:'specify',status:s.stageStatus??'done'},...(s.stage==='protocolize'?[{stage:'protocolize',status:'done'}]:[])]},continuation:s.stage==='specify'?{kind:'start_stage',stage:'protocolize'}:{kind:'terminal'}};
else if(args[1]==='drive'&&args[2]==='launch'){if(s.launched)throw Error('duplicate launch');s.launched=true;out={controller:controller()};}
else if(args[1]==='drive'&&args[2]==='context'){if(args[args.indexOf('--stage')+1]!=='protocolize')throw Error('wrong context');s.stage='protocolize';out={ok:true};}
else if(args[1]==='drive'&&args[2]==='status'){const after=Number(args[args.indexOf('--after')+1]??0);out={controller:controller(),events:[{sequence:s.stage==='specify'?1:3,type:'boundary_captured',data:boundary()},...(s.stage==='specify'?[{sequence:2,type:'context_required',data:{stage:'protocolize',attempt:1}}]:[])].filter(e=>e.sequence>after)};}
else throw Error('unexpected command '+JSON.stringify(args));
fs.writeFileSync(file,JSON.stringify(s));console.log(JSON.stringify(out));
`;
    await write(path.join(runtime, 'bin', 'dd-flow'), cli, { mode: 0o755 });
    const git = args => commandText('git', args, { cwd: repository });
    await git(['init', '--quiet', '-b', 'main']); await git(['add', '.']); await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture']);
    const state = { schema_id: 'dd-eval/canonical-build-state@1', case_id: 'fixture', revision: 'REV-001', status: 'awaiting_reference_resume', current_stage: 'specify', profile_file: profileFile, entries: { specify: 'entries/specify.json' }, definition: { commit: await git(['rev-parse', 'HEAD']), tree: await git(['rev-parse', 'HEAD^{tree}']) }, engine: { locator: 'engine', package_name: 'fixture', package_version: '1.0.0', engine_version: '1.0.0', integrity_checksum: digest }, baseline_admission: { file: admission, sha256: hash(await readFile(admission)) }, reference: { managed: true, run_id: 'RUN-fixture', contexts: {} } };
    await write(path.join(build, 'build', 'state.json'), state);
    const module = pathToFileURL(path.join(repository, 'lib', 'runner.mjs')).href;
    const invoke = expression => commandText(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(module)});console.log(JSON.stringify(await ${expression}));`], { cwd: root, env: { DD_EVAL_HOME: home } });
    const review = await write(path.join(root, 'review.md'), 'Reviewed fixture.');
    const resume = `m.canonicalResume({buildRoot:${JSON.stringify(build)}})`;
    const accept = stage => `m.canonicalBoundaryAccept({buildRoot:${JSON.stringify(build)},stage:${JSON.stringify(stage)},reviewFile:${JSON.stringify(review)}})`;
    assert.equal(JSON.parse(await invoke(resume)).state.status, 'waiting_for_reference_review');
    const retained = await json(path.join(build, 'build', 'state.json'));
    const manifest = retained.reference.boundary.manifest;
    const original = await readFile(manifest);
    await writeFile(manifest, '{}');
    await assert.rejects(invoke(accept('specify')), /Reference boundary receipt changed/);
    assert.equal((await json(path.join(build, 'build', 'state.json'))).current_stage, 'specify');
    await writeFile(manifest, original);
    const transportFile = path.join(build, 'transport.json');
    const transport = await json(transportFile);
    await write(transportFile, { ...transport, stageStatus: 'running' });
    await assert.rejects(invoke(accept('specify')), /Reference stage is no longer complete/);
    await write(transportFile, transport);
    assert.equal(JSON.parse(await invoke(accept('specify'))).state.current_stage, 'protocolize');
    assert.equal(JSON.parse(await invoke(resume)).state.completed_stage, 'protocolize');
    assert.equal(JSON.parse(await invoke(accept('protocolize'))).state.status, 'entries_captured');
    const calls = (await readFile(path.join(build, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter(args => args[2] === 'launch').length, 1);
    assert.equal(calls.filter(args => args[2] === 'context').length, 1);
    assert.ok(calls.every(args => !args.includes('snapshot') && !args.includes('session')));
    assert.equal((await json(path.join(build, 'build', 'state.json'))).reference.controller_id, 'DRV-fixture');
  } finally { await rm(root, { recursive: true, force: true }); }
});
