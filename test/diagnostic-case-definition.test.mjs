import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {loadCase,initialFlowBoundary,validateCaseBlueprint} from '../lib/runner.mjs';
import {readBaselineAdmissionPolicy} from '../lib/baseline-admission.mjs';

for(const [id,flow,analysis] of [['mb-audit-authored-mature','mb-audit','audit'],['project-review-authored-mature','project-review','analyze']]) {
  test(`${id} separates pinned product input, stage context and hidden assessment`,async()=>{
    const loaded=await loadCase(id),value=loaded.value;
    const validate=async(name,input)=>{
      const schema=new Ajv2020({strict:false}).compile(JSON.parse(await readFile(new URL(`../schemas/${name}`,import.meta.url))));
      assert(schema(input),JSON.stringify(schema.errors));
    };
    await validate('case.v7.schema.json',value);await validate('assessment.v1.schema.json',loaded.assessment);
    assert.equal(value.entry_pack,null,'authored definitions are not accepted focused entries');
    assert.deepEqual(initialFlowBoundary(loaded),{stage:'preflight',flow});
    assert.deepEqual(value.flow.contour,['preflight',analysis,'review','report']);assert.equal(value.flow.terminal_stage,'report');
    const checkpoint=loaded.inputCheckpoint.value;
    assert.equal(checkpoint.id,'cp-diagnostic-authored-mature-e5-project-source-boundary');
    assert.equal(checkpoint.source.commit,'fc3edfee4d6dc8b27a664bb5ee5e08cc58387817');
    assert.equal(checkpoint.flow_pack.delivery,'installed_canon');assert.equal(checkpoint.state,'candidate_pending_preflight');
    assert.match(checkpoint.flow_pack.engine.artifact_sha256,/^[a-f0-9]{64}$/);
    const baseline=await readBaselineAdmissionPolicy({caseRoot:loaded.root,definition:value.baseline_admission});
    assert.equal(baseline.commands.length,1);assert.equal(baseline.commands[0].id,'pinned-read-only-product');
    assert(!baseline.commands[0].args.includes('--test'),'diagnostic admission must not execute product tests');
    const blueprint=JSON.parse(await readFile(path.join(loaded.root,'entry-pack-source/stage-context.json')));
    validateCaseBlueprint(blueprint,loaded);
    for(const [index,stage] of value.flow.contour.entries()) {
      const slice=blueprint.stages[stage];assert.equal(slice.stage,stage);assert.equal(slice.task_input.length,index===0?1:0);
      for(const source of slice.sources) {
        assert(['project','run'].includes(source.root));assert(!path.isAbsolute(source.path));
        assert(!source.path.includes('assessment'));assert(!source.path.includes('golden'));
      }
      assert.deepEqual(slice.accepted_decisions,[]);assert(loaded.assessment.scopes[stage]);
    }
    const raw=await readFile(path.join(loaded.root,value.input[0].source),'utf8');
    for(const answer of ['rejects negative','built-in lock','npm run migrate','ledger-migration.md'])assert(!raw.includes(answer));
    const e2e=loaded.assessment.scopes.e2e.golden.required_outcomes.map(item=>item.id);
    for(const expected of ['amount-conformance','writer-conformance','migration-conformance','missing-runbook','no-repair','independent-review','report-custody'])assert(e2e.includes(expected));
    const preflight=loaded.assessment.scopes.preflight.golden.required_outcomes.map(item=>item.id);
    assert(!preflight.includes('amount-conformance'),'preflight must not require downstream findings');
  });
}
