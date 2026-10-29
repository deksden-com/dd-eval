import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { declaredManagedTools, prepareDeclaredManagedTools, failureStageAttribution, latestObservedStage, executionEvidence, enrichFailureEvidence } from '../lib/runner.mjs';
import { executionState } from '../lib/execution-state.mjs';

test('declared tools prepare once before caller dispatch and legacy checkpoints do nothing', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tools114-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'cli.mjs'), log = path.join(root, 'calls');
  await writeFile(bin, `import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),resource:process.env.DD_FLOW_RESOURCE_HOME})+'\\n');console.log(JSON.stringify({ok:true,tool:'wt',version:'0.72.0',bin:'/cache/wt',platform:'darwin-arm64',cache_root:process.env.DD_FLOW_RESOURCE_HOME+'/tools/wt',archive_sha256:'archive',binary_sha256:'binary'}));`);
  const input = { bin, env: { DD_FLOW_HOME: root, DD_FLOW_RESOURCE_HOME: path.join(root, 'resources') }, projectRoot: root };
  assert.deepEqual(await prepareDeclaredManagedTools({ ...input, checkpoint: { value: {} } }), []);
  for (const tools of [null, 'wt', ['other'], ['wt', 'wt']]) assert.throws(() => declaredManagedTools({ preparation: { managed_tools: tools } }), { code: 'input_checkpoint_invalid' });
  const receipts = await prepareDeclaredManagedTools({ ...input, checkpoint: { value: { preparation: { managed_tools: ['wt'] } } } });
  assert.equal(receipts[0].tool, 'wt');
  assert.deepEqual(JSON.parse((await readFile(log, 'utf8')).trim()), { args: ['tool', 'ensure', 'wt', '--json'], resource: input.env.DD_FLOW_RESOURCE_HOME });
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'managed-tools-preparation.json'))).managed_tools, receipts);
  await writeFile(bin, `console.log(JSON.stringify({ok:false,error:{code:'tool_unavailable',message:'offline'}}));process.exitCode=1;`);
  let dispatched = false;
  await assert.rejects(async () => { await prepareDeclaredManagedTools({ ...input, checkpoint: { value: { preparation: { managed_tools: ['wt'] } } } }); dispatched = true; });
  assert.equal(dispatched, false);
});

test('repeated failure enrichment and projection preserve failed next entry, not accepted predecessor', async () => {
  const status = { index: { stage_runs: [{ stage: 'specify', status: 'done' }] } };
  const events = [{ runid: 'EVAL', executionid: 'e', type: 'dev.dd.eval.execution.context_prepared', data: { stage: 'protocolize' } }];
  const result = { execution: 'e', stage: 'protocolize', state: 'failed', code: 'managed_run_interrupted', error: 'tool failed' };
  for (let index = 0; index < 2; index++) {
    await enrichFailureEvidence({ root: '/fixture', manifest: { run_id: 'EVAL' }, result, events }, {
      executionSnapshotBinding: async () => ({ binding: { run_id: 'RUN' } }), reconcileFlow: async () => ({ run_id: 'RUN', status }),
      hitlEvidenceFor: async () => [], collectFlowStatistics: async () => ({})
    });
    events.push({ runid: 'EVAL', executionid: 'e', type: 'dev.dd.eval.execution.failed', data: { ...result, sequence: index + 2 } });
  }
  const projected = executionState(events, 'EVAL', { id: 'e', stage: 'specify' }).result;
  assert.equal(projected.stage, 'protocolize');
  assert.equal(projected.last_completed_stage, 'specify');
  assert.equal(projected.pending_stage_entry, 'protocolize');
  assert.equal(executionEvidence(projected).pending_stage_entry, 'protocolize');
  assert.equal(status.index.stage_runs[0].status, 'done');
  assert.equal(latestObservedStage(status, 'protocolize'), 'specify');
  assert.equal(failureStageAttribution({ result, events: [], status }).stage, 'specify');
});

test('current bound controller entry wins over initial and late older-generation context', () => {
  const result = { execution: 'e', execution_operation_id: 'current', stage: 'specify' };
  const events = [
    { executionid: 'e', type: 'dev.dd.eval.execution.context_prepared', data: { stage: 'specify' } },
    { executionid: 'e', type: 'dev.dd.eval.controller.event', data: { execution_operation_id: 'current', type: 'stage_entered', data: { stage: 'code' } } },
    { executionid: 'e', type: 'dev.dd.eval.execution.context_prepared', data: { execution_operation_id: 'old', stage: 'plan' } },
    { executionid: 'e', type: 'dev.dd.eval.execution.context_prepared', data: { stage: 'specify' } }
  ];
  assert.equal(failureStageAttribution({ result, events, status: {} }).stage, 'code');
  assert.equal(failureStageAttribution({ result, events: events.slice(0, 1), status: { index: { stage_runs: [{ stage: 'code', status: 'running' }] } } }).stage, 'code');
});

test('tool preparation remains only at declared productive entry boundaries', async () => {
  const source = await readFile(new URL('../lib/runner.mjs', import.meta.url), 'utf8');
  const preflight = source.slice(source.indexOf('export async function evalPreflight('), source.indexOf('export async function evalRun('));
  assert(preflight.indexOf('await assertCheckpointEngine') < preflight.indexOf('await prepareDeclaredManagedTools'));
  assert(preflight.indexOf('await prepareDeclaredManagedTools') < preflight.indexOf('await prepareCaseManagedRun'));
  const provision = source.slice(source.indexOf('export async function provisionRuntimeEngine('), source.indexOf('async function prepareRuntimeHarnessConfig('));
  assert(!provision.includes('prepareDeclaredManagedTools'));
  assert.equal((source.match(/await prepareDeclaredManagedTools\(/g) ?? []).length, 3);
  const enrich = source.slice(source.indexOf('async function enrichFailureEvidence('), source.indexOf('export async function captureRecoveryEvidence('));
  assert(enrich.includes('Object.assign(result, failureStageAttribution('));
  assert(!enrich.includes('result.stage = latestObservedStage'));
});
