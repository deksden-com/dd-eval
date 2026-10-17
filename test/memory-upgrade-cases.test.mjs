import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readlink,stat,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import {loadCase,initialFlowBoundary,validateCaseBlueprint,prepareE2EInput} from '../lib/runner.mjs';
import {readBaselineAdmissionPolicy} from '../lib/baseline-admission.mjs';

for(const kind of ['minimal','mature']) test(`E4 ${kind} old-bank case retains real init lineage and named preservation inputs`,async t=>{
  const loaded=await loadCase(`mb-upgrade-authored-${kind}`);
  assert.deepEqual(initialFlowBoundary(loaded),{flow:'mb-upgrade',stage:'preflight'});
  for(const [file,value] of [['case.v7.schema.json',loaded.value],['assessment.v1.schema.json',loaded.assessment]]) {
    const schema=JSON.parse(await readFile(new URL(`../schemas/${file}`,import.meta.url)));
    const validate=new Ajv2020({allErrors:true}).compile(schema);
    assert.equal(validate(value),true,JSON.stringify(validate.errors));
  }
  const blueprint=JSON.parse(await readFile(path.join(loaded.root,'entry-pack-source/stage-context.json')));
  validateCaseBlueprint(blueprint,loaded);
  assert.deepEqual(Object.keys(blueprint.stages),loaded.value.flow.contour);
  assert.equal(loaded.inputCheckpoint.value.baseline_flow_pack.memory_bank_version,'4.1.2');
  assert.notEqual(loaded.inputCheckpoint.value.flow_pack.memory_bank_version,'4.1.2');
  const root=await mkdtemp(path.join(os.tmpdir(),'e4-upgrade-case-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await prepareE2EInput({projectRoot:path.join(root,'project'),inputCheckpoint:loaded.inputCheckpoint,flowId:'mb-upgrade',integrationBranch:'main'});
  const project=result.project_root;
  const original=JSON.parse(await readFile(path.join(project,'.memory-bank/dd-flow/manifest.json')));
  assert.equal(original.pack_version,'4.1.2','Materialization must not overlay the target canon');
  assert.match(await readFile(path.join(project,'.memory-bank/spec/engineering/DEF-UPGRADE-001.md'),'utf8'),/version: '1\.2\.7'/);
  assert((await stat(path.join(project,'scripts/check-local.sh'))).mode&0o111);
  assert.equal(await readlink(path.join(project,'scripts/check-current')),'check-local.sh');
  const policy=await readBaselineAdmissionPolicy({caseRoot:loaded.root,definition:loaded.value.baseline_admission});
  for(const command of policy.commands) {
    const checked=spawnSync(command.command,command.args,{cwd:project,encoding:'utf8',timeout:30000});
    assert.equal(checked.status,0,checked.stderr||checked.stdout);
  }
  assert(loaded.assessment.scopes.e2e.golden.required_outcomes.some(item=>item.statement.includes('DEF-UPGRADE-001')));
  assert(!JSON.stringify(blueprint).includes('finite-number'),'Judge-only expected facts must not leak into the context blueprint');
});
