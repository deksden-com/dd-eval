import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { contractDescriptor, verificationSelection } from '../scripts/verification-policy.mjs';

const policyUrl = new URL('../scripts/verification-policy.mjs', import.meta.url).href;
const runnerUrl = new URL('../scripts/verification.mjs', import.meta.url).href;
const file = 'test/capacity-policy.test.mjs';
const write = (root, name, value) => { const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value); };
const git = (root,...args) => execFileSync('git',args,{cwd:root,stdio:'pipe',encoding:'utf8'}).trim();
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eval-verification104-'));
  git(root,'init','-q');git(root,'config','user.email','fixture@example.invalid');git(root,'config','user.name','Fixture');
  write(root,'package.json',JSON.stringify({type:'module',version:'1.0.0'}));
  write(root,file,"import test from 'node:test';test('small contract',()=>{});\n");
  write(root,'lib/capacity-policy.mjs','export const capacity = 1;\n');
  write(root,'test/fixtures/capacity-policy.mjs','export const fixture = 1;\n');
  write(root,'README.md','fixture\n');
  git(root,'add','.');git(root,'commit','-qm','initial fixture');
  return root;
}
const descriptor = root => contractDescriptor(file,{root,env:{}});

test('105: recovery receipt keys include the native fixture they execute', t => {
  const root = fixture(), contract = 'test/recovery-finalization105.test.mjs';
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  write(root, contract, "import './fixtures/capacity-policy.mjs';\n");
  const before = contractDescriptor(contract, {root,env:{}});
  assert.ok(before.inputs.includes('test/fixtures/capacity-policy.mjs'));
  write(root, 'test/fixtures/capacity-policy.mjs', 'export const fixture = 2;\n');
  assert.notEqual(contractDescriptor(contract, {root,env:{}}).execution_key, before.execution_key);
});

test('104: changed control and retained-recovery tests have owned source closures',t=>{
  const root=fixture();
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const contracts=['test/runner-control.test.mjs','test/managed-resume.test.mjs'];
  for(const contract of contracts)write(root,contract,"import test from 'node:test';test('control contract',()=>{});\n");
  write(root,'test/baseline-admission.test.mjs',"import test from 'node:test';test('runtime shim',()=>{});\n");
  write(root,'lib/runner.mjs','export const runner = 1;\n');
  write(root,'lib/engine-admission.mjs','export const admission = 1;\n');
  let selection=verificationSelection(null,{root,env:{}});
  assert.ok(contracts.every(contract=>selection.files.includes(contract)));
  const before=contractDescriptor(contracts[1],{root,env:{}});
  assert.ok(before.inputs.includes('lib/engine-admission.mjs'));
  assert.ok(before.inputs.includes('lib/cleanup-observation.mjs'));
  git(root,'add','.');git(root,'commit','-qm','control fixture');
  write(root,'lib/engine-admission.mjs','export const admission = 2;\n');
  selection=verificationSelection(null,{root,env:{}});
  assert.ok(contracts.every(contract=>selection.files.includes(contract)));
  assert.notEqual(contractDescriptor(contracts[1],{root,env:{}}).execution_key,before.execution_key);
  const baseline=contractDescriptor('test/baseline-admission.test.mjs',{root,env:{}});
  write(root,'lib/runner.mjs','export const runner = 2;\n');
  selection=verificationSelection(null,{root,env:{}});
  assert.ok(selection.files.includes('test/baseline-admission.test.mjs'));
  assert.notEqual(contractDescriptor('test/baseline-admission.test.mjs',{root,env:{}}).execution_key,baseline.execution_key);
});

test('104: meaningful inputs ignore version, documentation and neighboring fixture',()=>{
  const root=fixture(), initial=descriptor(root);
  write(root,'package.json',JSON.stringify({type:'module',version:'2.0.0'}));
  write(root,'README.md','different documentation\n');
  write(root,'test/fixtures/unrelated-neighbor.mjs','export const neighbor = true;\n');
  assert.equal(descriptor(root).execution_key,initial.execution_key);
  write(root,'lib/capacity-policy.mjs','export const capacity = 2;\n');
  assert.notEqual(descriptor(root).execution_key,initial.execution_key);
  write(root,'lib/capacity-policy.mjs','export const capacity = 1;\n');
  write(root,'test/fixtures/capacity-policy.mjs','export const fixture = 2;\n');
  assert.notEqual(descriptor(root).execution_key,initial.execution_key);
});

test('104: exact descriptors are checkout and commit independent',()=>{
  const root=fixture(), initial=descriptor(root);
  const clone=fs.mkdtempSync(path.join(os.tmpdir(),'eval-verification104-clone-'));
  git(clone,'clone','-q',root,'.');
  assert.deepEqual(descriptor(clone),initial);
  git(clone,'-c','user.name=Other','-c','user.email=other@example.invalid','commit','--allow-empty','-qm','different squash provenance');
  assert.notEqual(git(root,'rev-parse','HEAD'),git(clone,'rev-parse','HEAD'));
  assert.deepEqual(descriptor(clone),initial);
});

test('104: descriptor freezes the actual single-worker TAP execution command',()=>{
  const current=descriptor(fixture());
  assert.equal(current.runner.command,'node');
  assert.deepEqual(current.runner.args,['--test','--test-concurrency=1','--test-reporter=tap']);
});

test('104: TAP validation rejects missing, corrupt, failed and TODO evidence',()=>{
  const root=fixture();
  const tap='TAP version 13\n# Subtest: small contract\nok 1 - small contract\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  const log=path.join(root,'report.tap');
  const validate=(output,{hashOutput=output,remove=false,contract=file,environment={}}={})=>{
    write(root,'report.tap',output);
    if(remove)fs.unlinkSync(log);
    const result={status:'passed',execution_key:contractDescriptor(contract,{root,env:environment}).execution_key,file:contract,exit_code:0,signal:null,cleanup:'settled',tests:1,log,
      log_sha256:createHash('sha256').update(hashOutput).digest('hex')};
    const code=`import {validateContractResult} from ${JSON.stringify(runnerUrl)};import {contractDescriptor} from ${JSON.stringify(policyUrl)};const env=${JSON.stringify(environment)};validateContractResult(${JSON.stringify(result)},contractDescriptor(${JSON.stringify(contract)},{env}),env);`;
    return ()=>execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:root,stdio:'pipe'});
  };
  assert.doesNotThrow(validate(tap));
  assert.throws(validate(tap,{hashOutput:'different bytes'}));
  assert.throws(validate(tap,{remove:true}));
  assert.throws(validate(tap.replace('# fail 0','# fail 1')));
  assert.throws(validate(tap.replace('# todo 0','# todo 1')));
  assert.throws(validate(tap.replace('ok 1 - small contract','not ok 1 - small contract')));
  assert.throws(validate(tap.replace('1..1\n','')));
  assert.throws(validate(tap.replace('# pass 1','# pass 0')));
  write(root,'test/runner-control.test.mjs',"import test from 'node:test';test('control',()=>{});\n");
  const skipped=tap.replace('ok 1 - small contract','ok 1 - real EVAL resume continues its queue through one active observer (normal) # SKIP').replace('# pass 1','# pass 0').replace('# skipped 0','# skipped 1');
  assert.doesNotThrow(validate(skipped,{contract:'test/runner-control.test.mjs'}));
  assert.throws(validate(skipped));
  assert.throws(validate(skipped,{contract:'test/runner-control.test.mjs',environment:{DD_EVAL_TEST_FLOW_CLI:'fixture'}}));
  assert.throws(validate(skipped.replace('(normal)','(unknown)'),{contract:'test/runner-control.test.mjs'}));
});

test('104: actual isolated runner executes once then reuses after metadata-only edits',t=>{
  const root=fixture(), external=fs.mkdtempSync(path.join(os.tmpdir(),'eval-verification104-runtime-'));
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(external,{recursive:true,force:true});});
  write(root,'lib/capacity-policy.mjs','export const capacity = 2;\n');
  const env={...process.env,DD_FLOW_VERIFICATION_COORDINATION_HOME:path.join(external,'coordinator'),DD_EVAL_VERIFICATION_CACHE_ROOT:path.join(external,'cache')};
  delete env.DD_FLOW_VERIFICATION_SLOT;
  delete env.DD_FLOW_VERIFICATION_NESTED_SLOT;
  const run=()=>JSON.parse(execFileSync(process.execPath,[new URL('../scripts/verification.mjs',import.meta.url).pathname,'run'],{cwd:root,env,encoding:'utf8'}).trim());
  const first=run();
  assert.equal(first.status,'passed');assert.equal(first.executed_files,1);assert.equal(first.executed_cases,1);
  write(root,'README.md','only documentation changed\n');
  write(root,'package.json',JSON.stringify({type:'module',version:'1.0.1'}));
  const second=run();
  assert.equal(second.status,'passed');assert.equal(second.executed_files,0);assert.equal(second.reused_files,1);
});
