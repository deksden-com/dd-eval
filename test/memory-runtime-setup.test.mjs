import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {verifyEngineArtifact} from '../lib/engine-admission.mjs';
import { setupMemoryRuntime, setupMemoryUpgradeRuntime, validateMemorySetup, resolveMemoryExecutionExpectation } from '../lib/memory-runtime-setup.mjs';

test('upgrade setup populates pinned old canon before target using separate public setup requests',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'upgrade-setup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const projectRoot=path.join(root,'project');await mkdir(projectRoot);await writeFile(path.join(projectRoot,'old-fact.md'),'Original facts.');
  const runtimeRoot=path.join(root,'runtime'),bin=path.join(root,'cli.mjs'),calls=path.join(root,'calls.jsonl');
  const declaration={canonSource:path.join(root,'target'),trustFile:path.join(root,'target-trust.json'),channel:'development',
    baseline:{canonSource:path.join(root,'old'),trustFile:path.join(root,'old-trust.json'),channel:'development'}};
  const pack=(commit,version)=>({delivery:'installed_canon',commit:commit.repeat(40),memory_bank_version:version,engine:{version:`engine-${version}`}});
  const checkpoint={flow_pack:pack('a','2'),baseline_flow_pack:pack('b','1')};
  const receipt=selected=>({installation_readiness:'installed',installation:{manifest_sha256:selected.commit.padEnd(64,'0'),
    manifest:{canon:{commit:selected.commit,version:selected.memory_bank_version},engine:{version:selected.engine.version}}}});
  const old=receipt(checkpoint.baseline_flow_pack),target=receipt(checkpoint.flow_pack);
  const script=(baseline=old,next=target)=>`import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({args,home:process.env.DD_FLOW_HOME,config:process.env.DD_FLOW_CONFIG_HOME})+'\\n');console.log(JSON.stringify(args[args.indexOf('--canon-source')+1]===${JSON.stringify(declaration.baseline.canonSource)}?${JSON.stringify(baseline)}:${JSON.stringify(next)}));`;
  await writeFile(bin,script());const input={bin,projectRoot,runtimeRoot,declaration,checkpoint,requestId:'upgrade-setup',env:{DD_FLOW_HOME:'/not-used'}};
  const result=await setupMemoryUpgradeRuntime(input);assert.deepEqual(result.installation,target.installation);assert.deepEqual(result.baseline_installation,old.installation);
  const observed=(await readFile(calls,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(observed.length,2);
  assert.equal(observed[0].args[1],'--canon-source','The baseline is a cold installation');
  assert.equal(observed[1].args[1],'update','The target updates the existing installation');
  for(const call of observed) {assert.equal(call.args[0],'setup');assert.equal(call.home,runtimeRoot);assert.equal(call.config,runtimeRoot);assert(call.args.includes('--skip-agent-setup'));}
  const option=(call,key)=>call.args[call.args.indexOf(`--${key}`)+1];
  assert.equal(option(observed[0],'canon-source'),declaration.baseline.canonSource);assert.equal(option(observed[0],'request-id'),'upgrade-setup.baseline');
  assert.equal(option(observed[1],'canon-source'),declaration.canonSource);assert.equal(option(observed[1],'request-id'),'upgrade-setup');
  await writeFile(bin,script({...target,request_installation:old.installation}));
  const replay=await setupMemoryUpgradeRuntime(input);
  assert.deepEqual(replay.baseline_installation,old.installation,'Bind the replayed request, not the newer active installation');
  assert.deepEqual(replay.installation,target.installation);
  await rm(calls);
  for(const change of [{checkpoint:{flow_pack:checkpoint.flow_pack}},{checkpoint:{...checkpoint,flow_pack:{}}},{declaration:{...declaration,baseline:undefined}},{runtimeRoot:projectRoot}]) {
    await assert.rejects(setupMemoryUpgradeRuntime({...input,...change}),{code:'memory_setup_invalid'});await assert.rejects(readFile(calls),{code:'ENOENT'});
  }
  await writeFile(bin,script({...old,installation_readiness:'degraded'}));
  await assert.rejects(setupMemoryUpgradeRuntime(input),{code:'memory_setup_invalid'});
  assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1,'No target installation after unresolved baseline');await rm(calls);
  await writeFile(bin,script(old,{...target,installation_readiness:'degraded'}));
  await assert.rejects(setupMemoryUpgradeRuntime(input),error=>error.details.effect==='partial' && error.details.target_effect==='unknown' && error.details.baseline_manifest_sha256===old.installation.manifest_sha256);
  assert.equal(await readFile(path.join(projectRoot,'old-fact.md'),'utf8'),'Original facts.');
});

test('Memory expectation refuses a foreign workflow before importing installed code',async()=>{
  await assert.rejects(resolveMemoryExecutionExpectation({flow:'sdlc'}),{code:'memory_setup_invalid'});
  await assert.rejects(resolveMemoryExecutionExpectation({flow:'unknown'}),{code:'memory_setup_invalid'});
});

test('installed diagnostic expectations explicitly match public managed/new-session launch defaults', {
  skip:!process.env.DD_EVAL_E5_CANDIDATE_ROOT || !process.env.DD_EVAL_E5_EXPECTATION_CELL
},async()=>{
  const candidate=process.env.DD_EVAL_E5_CANDIDATE_ROOT,cell=process.env.DD_EVAL_E5_EXPECTATION_CELL;
  assert(path.isAbsolute(candidate));assert(path.isAbsolute(cell));
  const runtimeRoot=path.join(cell,'dd-flow-home');
  const delivery=JSON.parse(await readFile(path.join(candidate,'setup-result.json')));
  const engineVersion=delivery.installation.manifest.engine.version;
  const engine=JSON.parse(await readFile(path.join(runtimeRoot,'engines/@deksden-com_dd-flow-cli',engineVersion,'engine.json')));
  await verifyEngineArtifact(engine);
  const {readSetupStatus}=await import(pathToFileURL(path.join(engine.snapshot_root,'dist/services/setup.js')));
  const installation=readSetupStatus(runtimeRoot).installation;assert(installation);
  for(const flow of ['mb-audit','project-review']) {
    const expected=await resolveMemoryExecutionExpectation({runtimeRoot,configHome:path.join(candidate,'router-home'),engine,installation,flow,
      selection:{profileFile:path.join(candidate,'operator-subject.json'),maxParallel:2},
      scope:{requestId:'diagnostic-expectation-test',projectRoot:path.join(cell,'project'),workspace:path.join(cell,'project')}});
    assert.equal(expected.settings.execution,'managed');assert.equal(expected.settings.stage_session_mode,'new_session');
    assert.deepEqual(expected.settings.delegation,{mode:'external',max_parallel:2,native_capacity_receipt:null});
    assert.deepEqual(expected.contour,['preflight',flow==='mb-audit'?'audit':'analyze','review','report']);
  }
});

test('exact authenticated installed CLI resolves external and native semantic selection without a physical receipt', { skip: !process.env.DD_EVAL_MEMORY_DELIVERY_ROOT }, async () => {
  const root = process.env.DD_EVAL_MEMORY_DELIVERY_ROOT;
  const setup = JSON.parse(await readFile(path.join(root, 'development-setup-response.json')));
  const report = JSON.parse(await readFile(path.join(root, 'delivery-report.json')));
  const engine = JSON.parse(await readFile(path.join(report.snapshot, 'engine.json')));
  const input = { runtimeRoot: report.home, installation: setup.installation, engine,
    selection: { profileFile: path.resolve('profiles/memory-init-gpt-6-luna-xhigh.agent.json'), maxParallel: 1 },
    scope: { requestId: 'readonly-contract-fixture', projectRoot: path.join(root, 'consumer'), workspace: path.join(root, 'consumer') } };
  const external = await resolveMemoryExecutionExpectation({ ...input, selection: { ...input.selection, delegation: 'external' } });
  const native = await resolveMemoryExecutionExpectation({ ...input, selection: { ...input.selection, delegation: 'native' } });
  assert.equal(external.settings.root_profile, 'memory-luna');
  assert.deepEqual(external.contour, ['preflight', 'discover', 'compose', 'verify', 'review', 'finish']);
  assert.deepEqual(native.profiles, external.profiles); assert.deepEqual(native.settings.stage_profiles, external.settings.stage_profiles);
  assert.equal(native.settings.delegation.mode, 'native'); assert.equal(native.settings.delegation.native_capacity_receipt, null);
  assert.equal(native.native_capacity, 'requires_cli_admission'); assert.equal(external.native_capacity, 'not_required');
});

test('Memory setup delegates trust to CLI and binds private Home to checkpoint canon/engine', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project'); await mkdir(projectRoot);
  const bin = path.join(root, 'cli.mjs'), calls = path.join(root, 'calls.json'), runtimeRoot = path.join(root, 'runtime');
  const checkpoint = { flow_pack: { delivery: 'installed_canon', commit: 'a'.repeat(40), memory_bank_version: '1', engine: { version: 'engine-1' } } };
  const declaration = { canonSource: path.join(root, 'release'), trustFile: path.join(root, 'trust.json'), channel: 'development' };
  const receipt = { installation_readiness: 'installed', installation: { manifest: { canon: { commit: checkpoint.flow_pack.commit, version: '1' }, engine: { version: 'engine-1' } } } };
  const script = value => `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify({args:process.argv.slice(2),home:process.env.DD_FLOW_HOME,config:process.env.DD_FLOW_CONFIG_HOME})); console.log(JSON.stringify(${JSON.stringify(value)}));`;
  await writeFile(bin, script(receipt));
  const input = { bin, projectRoot, runtimeRoot, checkpoint, declaration, requestId: 'setup-fixture', env: { DD_FLOW_HOME: '/must-not-consume', DD_FLOW_CONFIG_HOME: '/must-not-consume' } };
  assert.deepEqual(await setupMemoryRuntime(input), receipt);
  const observed = JSON.parse(await readFile(calls));
  assert.equal(observed.home, runtimeRoot); assert.equal(observed.config, runtimeRoot);
  assert.equal(observed.args[0], 'setup'); assert(observed.args.includes('--skip-agent-setup')); assert(observed.args.includes('--non-interactive'));
  for (const value of [declaration.canonSource, declaration.trustFile, declaration.channel, input.requestId]) assert(observed.args.includes(value));
  await rm(calls);
  for (const changed of [{ runtimeRoot: projectRoot }, { runtimeRoot: undefined }, { declaration: { ...declaration, trustFile: 'relative' } }, { declaration: { ...declaration, profile: 'hidden-save' } }, { checkpoint: { flow_pack: { ...checkpoint.flow_pack, delivery: 'project_pack' } } }]) {
    await assert.rejects(setupMemoryRuntime({ ...input, ...changed }), { code: 'memory_setup_invalid', details: { effect: 'no_effect' } });
    await assert.rejects(readFile(calls), { code: 'ENOENT' });
  }
  for (const value of [null, { ...receipt, installation_readiness: 'degraded' }, { ...receipt, installation: { manifest: { ...receipt.installation.manifest, canon: { commit: 'b'.repeat(40), version: '1' } } } }, { ...receipt, installation: { manifest: { ...receipt.installation.manifest, engine: { version: 'other' } } } }]) {
    await writeFile(bin, script(value));
    await assert.rejects(setupMemoryRuntime(input), {
      code: 'memory_setup_invalid',
      details: { effect: value?.installation_readiness === 'installed' ? 'committed' : 'unknown', runtime_root: runtimeRoot, request_id: input.requestId }
    });
  }
  assert.throws(() => validateMemorySetup({ ...declaration, channel: 'unknown' }), { code: 'memory_setup_invalid' });
});
