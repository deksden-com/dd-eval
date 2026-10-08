import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { interactionJudge, evalJudge } from '../lib/runner.mjs';
import { appendEvent, writeJsonAtomic } from '../lib/runner-events.mjs';
import { engineArtifactDigest } from '../lib/engine-admission.mjs';
import { resolveExecutionContract } from '../lib/execution-contract.mjs';

async function offlineRuntime(root, failureCode) {
  const home = path.join(root, 'executions/e/dd-flow-home'), engine = path.join(home, 'engines/offline'), native = path.join(engine, 'dist/harness-runtime'), lib = path.join(native, 'lib'), calls = path.join(root, 'calls.jsonl');
  await mkdir(lib, { recursive: true }); await mkdir(path.join(native, 'bin'));
  const errors = pathToFileURL(path.resolve('lib/operation-errors.mjs')).href;
  for (const [file, source] of [
    ['native-children.mjs', "export const NATIVE_CHILD_CONTRACT_VERSION='native-children@1';export const normalizeNativeChildren=()=>[];"],
    ['operation-errors.mjs', `export {OPERATION_ERROR_CONTRACT_VERSION,isObservationLoss} from ${JSON.stringify(errors)};`],
    ['dd-agy.mjs', 'export const agyTerminalFailure=()=>null;'],
    ['observation-clock.mjs', "export const OBSERVATION_CLOCK_CONTRACT_VERSION='operation-progress@1';"],
    ['adapter-timeouts.mjs', "export const NATIVE_OPERATION_WAIT_CONTRACT='native-operation-wait@1';export const nativeOperationWait=(_h,op)=>op==='session.prompt'?'native-work':'control';"]
  ]) await writeFile(path.join(lib, file), source);
  // Offline paid-action stand-in. It records actual production arguments and
  // retains an unknown original operation; it creates no daemon/provider child.
  await writeFile(path.join(native, 'bin/dd-agy.mjs'), `import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const args=process.argv.slice(2),state=args[args.indexOf('--state-dir')+1],id=process.env.DD_EVAL_OPERATION_ID,kind=args.slice(0,2).join('.'),code=${JSON.stringify(failureCode)};
const put=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
const ledger=path.join(state,'operations',createHash('sha256').update(id).digest('hex'));
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({kind,args,id,state})+'\\n');
if(kind==='daemon.start'){put(state+'/daemon.json',{daemon_id:'offline-daemon',pid:2147483647,shutdown_state:'running',active_tree:true,config:{cwd:args[args.indexOf('--cwd')+1]}});console.log('{}');}
else if(kind==='session.create')console.log(JSON.stringify({provider_session_id:'offline-session'}));
else if(kind==='session.prompt'){
 put(ledger+'/requested.json',{operation_id:id,operation:kind,session_id:'offline-session',daemon_id:'offline-daemon'});
 if(code==='judge_result_invalid'){const result={provider_session_id:'offline-session',assistant_text:'not JSON'};put(ledger+'/result.json',{state:'completed',result});console.log(JSON.stringify(result));}
 else{const client=path.join(state,'client-operations',createHash('sha256').update(id).digest('hex')+'.json'),saved=JSON.parse(fs.readFileSync(client));put(client,{...saved,recovery_observation_clock:{policy:'operation-progress@1',timeout_ms:30000,started_at:Date.now(),cursor:0,observed_at:null,elapsed_ms:0,uncertainty_elapsed_ms:120000,gaps:1,observation_lost:true}});console.log(JSON.stringify({ok:false,error:{code,message:'offline observer lost'}}));}
}
else if(kind==='daemon.stop'){
 if(!args.includes('--cancel-tree'))console.log(JSON.stringify({ok:false,error:{code:'tree_not_settled',message:'original operation is still unknown'}}));
 else{const saved=JSON.parse(fs.readFileSync(state+'/daemon.json'));put(state+'/daemon.json',{...saved,shutdown_state:'clean',active_tree:false,shutdown:{schema_id:'dd-flow/daemon-shutdown@1',daemon_id:saved.daemon_id,result:{clean:true},required_phases:['tree','provider_close','daemon_resource'],phases:{tree:true,provider_close:true,daemon_resource:true}}});const result={stopped:true,clean:true,shutdown_contract:'dd-flow/daemon-shutdown@1'};put(ledger+'/requested.json',{operation_id:id,operation:kind,daemon_id:saved.daemon_id});put(ledger+'/result.json',{state:'completed',result});console.log(JSON.stringify(result));}
}else throw Error('unexpected offline action '+kind);
`);
  await writeJsonAtomic(path.join(engine, 'engine.json'), { integrity: { checksum: await engineArtifactDigest(engine) } });
  await symlink('engines/offline/dist/harness-runtime', path.join(home, 'harness-runtime'));
  await writeJsonAtomic(path.join(home, 'harnesses.json'), { harnesses: { 'antigravity-cli': { runtime_command: '/bin/false' } } });
  const profileFile = path.join(root, 'profile.json');
  const declaration = { id: 'offline-observation-judge', harness: 'antigravity-cli', model: 'offline', reasoning: 'low' };
  await writeJsonAtomic(profileFile, declaration);
  await writeJsonAtomic(path.join(home, 'agent-profiles', `${declaration.id}.json`), { schema_id: 'dd-flow/agent-profile@1', ...declaration, harness: 'agy', provider: 'google', mode: 'agent', permission: 'allow' });
  const contract = await resolveExecutionContract({ runProfile: { subject: { profile_id: declaration.id }, interaction_judge: { profile_id: declaration.id }, judge: { enabled: true, profile_id: declaration.id } }, loadProfile: async () => ({ value: declaration }), configHome: home });
  await mkdir(path.join(root, 'executions/e/project'), { recursive: true });
  return { home, profileFile, calls, contract, profileId: declaration.id };
}

for (const caller of ['interaction', 'final']) for (const code of ['subject_liveness_timeout', 'operation_output_limit', 'judge_result_invalid']) test(`${caller} Judge cleanup distinguishes ${code} from cancellation authority`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-judge-observation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = await offlineRuntime(root, code), project = path.join(root, 'executions/e/project');
  let invoke;
  if (caller === 'interaction') invoke = () => interactionJudge({ attempt: root, projectRoot: project, runtimeRoot: runtime.home, stage: 'specify', question: 'Required default?', fixture: { sha256: 'a'.repeat(64), responses: [{ id: 'answer', answer: 'Canonical' }] }, runProfile: { executionContract: runtime.contract, value: { interaction_judge: { profile_id: runtime.profileId } } } });
  else {
    const manifest = { run_id: 'EVAL-offline-judge', execution_contract: runtime.contract, case_id: 'sdlc-eval-2026-summer-task-priority', executions: [{ id: 'e', stage: 'specify', terminal_stage: 'specify', mode: 'focused' }], subject_profile: {}, profile: { judge: { enabled: false }, concurrency: { per_harness: {} } }, runtime_resource_home: path.join(root, 'resources') };
    const result = { execution: 'e', state: 'failed', code: 'preflight_failed', stage: 'specify', attempt: path.join(root, 'executions/e') };
    await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
    for (const type of ['requested', 'started', 'completed']) await appendEvent(path.join(root, 'events.jsonl'), { source: 'offline', runId: manifest.run_id, executionId: 'e', type: `dev.dd.eval.operation.${type}`, data: { operation_id: `${manifest.run_id}:e:launch`, operation: 'execution.e.launch', ...(type === 'completed' ? { result } : {}) } });
    invoke = () => evalJudge({ evalRoot: root, profileId: runtime.profileId });
  }
  let primary;
  await assert.rejects(invoke, error => { primary = error; return error.code === (code === 'judge_result_invalid' ? code : 'operation_observation_lost'); });
  const calls = (await readFile(runtime.calls, 'utf8')).trim().split('\n').map(JSON.parse), stops = calls.filter(item => item.kind === 'daemon.stop'), prompt = calls.find(item => item.kind === 'session.prompt');
  assert.equal(stops.length, 1, JSON.stringify({ cleanup: primary.cleanup_error, calls })); assert.equal(calls.filter(item => item.kind === 'session.prompt').length, 1);
  assert.equal(stops[0].args.includes('--cancel-tree'), code === 'judge_result_invalid');
  const cleanup = JSON.parse(await readFile(path.join(path.dirname(stops[0].state), 'cleanup.json')));
  if (code === 'judge_result_invalid') assert.equal(cleanup.status, 'settled');
  else {
    assert.equal(cleanup.status, 'failed'); assert.equal(primary.cleanup_error.code, 'tree_not_settled');
    const clients = await readdir(path.join(prompt.state, 'client-operations'));
    const pending = await Promise.all(clients.map(async file => JSON.parse(await readFile(path.join(prompt.state, 'client-operations', file)))));
    assert.equal(pending.filter(item => item.state === 'requested').length, 1);
    assert.equal(primary.details.observation_error.code, code);
    await assert.rejects(readFile(path.join(path.dirname(prompt.state), 'result.json')), { code: 'ENOENT' });
    if (caller === 'final') {
      // The outer exact-candidate operation fence runs before Session creation.
      // Missing result.json is not permission to replay this paid Judge.
      await assert.rejects(invoke, { code: 'operation_observation_lost' });
      assert.deepEqual((await readFile(runtime.calls, 'utf8')).trim().split('\n').map(JSON.parse), calls);
    }
  }
});
