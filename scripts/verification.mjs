import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationSelection, contractDescriptor } from './verification-policy.mjs';
import { atomicJson, runJobs, withContractAttempt } from '../tools/verification-jobs.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const script = fileURLToPath(import.meta.url);
const optional = new Set([
  'selected real published engine exports the operational contract',
  'owned launch decision commits only its profile before baseline admission',
  'installed consumer retains actual CP247 legacy refusal without rewriting evidence',
  'installed consumer accepts actual producer failures and rejects retained legacy/foreign proof',
  'actual pinned dd-tasks zero checkpoint materializes blank with exact README bytes',
]);
const optionalControl = new Set([
  'resume cannot observe the initial EVAL queue until its owner finishes projection (real CLI: true)',
  'real EVAL resume continues its queue through one active observer (normal)',
  'real EVAL resume continues its queue through one active observer (killed)',
  'real EVAL resume continues its queue through one active observer (observer-killed)',
  'real EVAL stop drains its probe after client exit and preserves a neighboring EVAL',
]);

export function validateContractResult(result, descriptor, env = process.env) {
  assert.equal(result.status,'passed');
  assert.equal(result.execution_key,descriptor.execution_key);
  assert.equal(result.file,descriptor.files[0]);
  assert.equal(result.exit_code,0); assert.equal(result.signal,null);
  assert.equal(result.cleanup,'settled');
  const output = fs.readFileSync(result.log,'utf8');
  assert.equal(sha(output),result.log_sha256,'Retained verification report changed');
  const tests = Number(/^# tests (\d+)$/m.exec(output)?.[1]);
  assert.ok(tests > 0 && /^# fail 0$/m.test(output) && /^# cancelled 0$/m.test(output) && /^# todo 0$/m.test(output),'Incomplete TAP result');
  assert.ok(!/^\s*(?:not ok\b|Bail out!)/m.test(output) && !/^\s*ok .* # TODO\b/m.test(output),'Failed/incomplete TAP case');
  for(const field of ['tests','pass','fail','cancelled','skipped','todo']) {
    assert.equal([...output.matchAll(new RegExp(`^# ${field} (\\d+)$`,'gm'))].length,1,`Missing/duplicate TAP ${field}`);
  }
  const passed=Number(/^# pass (\d+)$/m.exec(output)?.[1]),skipCount=Number(/^# skipped (\d+)$/m.exec(output)?.[1]);
  assert.equal(passed+skipCount,tests,'TAP totals do not match');
  const plans=[...output.matchAll(/^1\.\.(\d+)$/gm)];
  assert.equal(plans.length,1,'Missing/duplicate TAP plan');
  const top=[...output.matchAll(/^ok (\d+) - /gm)].map(match=>Number(match[1]));
  assert.equal(top.length,Number(plans[0][1]),'TAP plan incomplete');
  assert.deepEqual(top,Array.from({length:top.length},(_,i)=>i+1),'Missing/duplicate TAP case');
  assert.equal(tests,result.tests);
  const skipped = output.split('\n').filter(line=>/^\s*ok \d+ - .* # SKIP/.test(line));
  assert.ok(skipped.every(line=>{
    const title=line.replace(/^\s*ok \d+ - /,'').replace(/ # SKIP.*$/,'');
    return optional.has(title) || result.file==='test/runner-control.test.mjs' && !env.DD_EVAL_TEST_FLOW_CLI && optionalControl.has(title);
  }),'Unexpected skipped contract');
  assert.equal(contractDescriptor(result.file,{env}).execution_key,descriptor.execution_key,'Contract changed during verification');
  return result;
}

async function worker(file, signal) {
  const job = JSON.parse(fs.readFileSync(file));
  assert.equal(job.schema_id,'dd-eval/verification-job@1');
  const current = contractDescriptor(job.descriptor.files[0]);
  assert.deepEqual(current,job.descriptor,'Foreign contract descriptor');
  const cache = job.cache;
  assert.ok(path.isAbsolute(cache)); fs.mkdirSync(cache,{recursive:true});
  const index = path.join(cache,`${current.execution_key}.json`);
  const attempt = await withContractAttempt(index,{
    signal, rerun:Boolean(job.rerun_reason),failedOnly:true,reason:job.rerun_reason,validationKey:current.validation_key,
    validate:result=>validateContractResult(result,current),
  },async ({root})=>{
    const logFile = path.join(root,'runner.tap'), log = fs.openSync(logFile,'wx',0o600);
    let results;
    try {
      results = await runJobs([{id:current.id,command:process.execPath,
        args:[...current.runner.args,current.files[0]],cwd:process.cwd(),
        stdio:['ignore',log,log],executionClass:current.execution_class}],{jobs:1,signal});
    } finally { fs.closeSync(log); }
    const result = results[0], output=fs.readFileSync(logFile,'utf8');
    const record = {file:current.files[0],execution_key:current.execution_key,validation_key:current.validation_key,
      status:result.status,exit_code:result.code,signal:result.signal,cleanup:result.status==='passed'?'settled':'unknown',
      tests:Number(/^# tests (\d+)$/m.exec(output)?.[1]),skipped:Number(/^# skipped (\d+)$/m.exec(output)?.[1]??0),
      log:logFile,log_sha256:sha(output),rerun_reason:job.rerun_reason??null};
    atomicJson(path.join(root,'contract.json'),record);
    validateContractResult(record,current);
    return record;
  });
  atomicJson(job.output,{...attempt.result,source:attempt.joined?'joined':attempt.reused?attempt.result.validation_key===current.validation_key?'reused':'revalidated':'executed',validation_key:current.validation_key,producer_attempt:attempt.attemptId});
}

export async function runVerification({mode='run',reason,env=process.env,signal}={}) {
  assert.ok(['run','rerun'].includes(mode));
  assert.ok(mode!=='rerun'||reason?.trim(),'Explicit rerun requires a reason');
  const selection=verificationSelection(null,{env});
  const budget=Number(env.DD_FLOW_VERIFICATION_JOBS??2);
  assert.ok([1,2].includes(budget),'DD_FLOW_VERIFICATION_JOBS must be 1 or 2');
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'dd-eval-scoped-')));
  const cache=env.DD_EVAL_VERIFICATION_CACHE_ROOT??path.join(os.userInfo().homedir,'.dd-eval','verification-receipts');
  const receipt={schema_id:'dd-eval/scoped-verification@2',status:'running',selection,results:[],budget,started_at:new Date().toISOString()};
  const save=()=>atomicJson(path.join(root,'receipt.json'),receipt);
  save();
  const descriptors=selection.required_contracts.map((descriptor,i)=>{
    const packet=path.join(root,`job-${i}.json`),output=path.join(root,`result-${i}.json`);
    atomicJson(packet,{schema_id:'dd-eval/verification-job@1',descriptor,cache,output,rerun_reason:mode==='rerun'?reason:null});
    return {id:descriptor.id,command:process.execPath,args:[script,'worker',packet],cwd:process.cwd(),env,
      executionClass:descriptor.execution_class};
  });
  try {
    const jobs=descriptors.length?await runJobs(descriptors,{jobs:budget,env,signal}):[];
    receipt.jobs=jobs;
    for(let i=0;i<jobs.length;i++) {
      const output=path.join(root,`result-${i}.json`);
      if(fs.existsSync(output))receipt.results.push(JSON.parse(fs.readFileSync(output)));
      else receipt.results.push({file:selection.files[i],status:'blocked',job:jobs[i]});
    }
    assert.ok(jobs.every(job=>job.status==='passed'),'Selected verification failed; preserve per-job reports');
    assert.equal(receipt.results.length,selection.files.length);
    for(let i=0;i<receipt.results.length;i++)validateContractResult(receipt.results[i],selection.required_contracts[i],env);
    receipt.status=selection.files.length?'passed':'not_required';
    receipt.finished_at=new Date().toISOString();
    receipt.summary={selected_files:selection.files.length,executed_files:receipt.results.filter(r=>r.source==='executed').length,
      reused_files:receipt.results.filter(r=>['reused','joined','revalidated'].includes(r.source)).length,
      executed_cases:receipt.results.filter(r=>r.source==='executed').reduce((n,r)=>n+r.tests,0),elapsed_ms:Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)};
    save(); return {status:receipt.status,report:root,...receipt.summary};
  } catch(error) {
    // A coordinator/cleanup failure must not hide independent finished reports.
    receipt.results=selection.files.map((file,i)=>{
      const output=path.join(root,`result-${i}.json`);
      try { return fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):{file,status:'blocked'}; }
      catch(reportError) { return {file,status:'blocked',report_error:String(reportError.message)}; }
    });
    receipt.status=signal?.aborted?'interrupted':'failed';receipt.error=String(error.stack??error);receipt.finished_at=new Date().toISOString();save();throw error;
  }
}

if(process.argv[1]===script) {
  const mode=process.argv[2];
  if(mode==='plan')process.stdout.write(JSON.stringify(verificationSelection(),null,2)+'\n');
  else {
    const controller=new AbortController();
    const abort=()=>controller.abort(new Error('Verification interrupted'));
    process.once('SIGINT',abort);process.once('SIGTERM',abort);
    try {
      if(mode==='worker')await worker(process.argv[3],controller.signal);
      else process.stdout.write(JSON.stringify(await runVerification({mode,reason:process.argv[3],signal:controller.signal}))+'\n');
    } finally {process.off('SIGINT',abort);process.off('SIGTERM',abort);}
  }
}
