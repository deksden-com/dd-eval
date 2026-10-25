import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { browserCapabilitySource, browserCapabilityDiagnostic } from '../lib/browser-capabilities.mjs';
import { hashJson } from '../lib/runner-events.mjs';
import { materializeStageSlice, semanticContextHash } from '../lib/entry-pack.mjs';

test('runtime browser facts exist, bind bytes and do not alter authored context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser-fact-'));
  try {
    assert.equal(await browserCapabilitySource({}), null);
    const baseline = { browser_capabilities: { schema_id: 'dd-eval/browser-capabilities@1', probe_executed: true, outcome: 'unsupported', identity: { platform: 'darwin', operation: { sequence: ['focus', 'ArrowDown', 'Enter'] } } } };
    const source = await browserCapabilitySource({ baseline, runRoot: root });
    assert.equal(source.root, 'run');
    assert.equal(JSON.parse(await readFile(path.join(root, source.path))).outcome, 'unsupported');
    assert.deepEqual(await browserCapabilitySource({ baseline, runRoot: root }), source);
    const changed = { browser_capabilities: { ...baseline.browser_capabilities, identity_sha256: 'a'.repeat(64), identity: { platform: 'linux', operation: { sequence: ['focus', 'ArrowDown', 'Enter'] } } } };
    const newer = await browserCapabilitySource({ baseline: changed, runRoot: root });
    assert.match(newer.path, /^environment\/browser-capabilities-[a-f0-9]{64}\.json$/);
    assert.equal(JSON.parse(await readFile(path.join(root, source.path))).identity.platform, 'darwin');
    assert.deepEqual(await browserCapabilitySource({ baseline: changed, runRoot: root }), newer);
    const context = { schema_id: 'dd-eval/stage-context@1', stage: 'code', objective: 'Build', task_input: [], sources: [] };
    const result = await materializeStageSlice({ blueprint: { stages: { code: context } }, stage: 'code', roots: { run: root, project: root }, output: path.join(root, 'context.json'), runtimeSources: [source] });
    assert.equal(result.semantic_package_sha256, semanticContextHash(context));
    const rendered = JSON.parse(await readFile(result.path));
    assert.equal(rendered.sources[0].path, path.join(root, source.path));
    assert.match(rendered.sources[0].reason, /not keyboard-only proof/);
    await writeFile(path.join(root, source.path), '{}');
    await assert.rejects(materializeStageSlice({ blueprint: { stages: { code: context } }, stage: 'code', roots: { run: root, project: root }, output: path.join(root, 'other.json'), runtimeSources: [source] }), /immutable stage source changed/);
    await assert.rejects(browserCapabilitySource({ baseline, runRoot: root }), /fact changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('only an independent unsupported proof for the exact browser and operation is a matching diagnostic', () => {
  const identity={platform:'darwin',os_release:'test',arch:'arm64',executable:'/owned/browser',executable_sha256:'b'.repeat(64),driver:'playwright',driver_version:'1',transport:'cdp',launch:{headless:true,args:[],locale:'en-US'},operation:{control:'native-select',sequence:['focus','ArrowDown','Enter'],initial:'none',expected:'low'}};
  const probe_sha256='a'.repeat(64),fact={schema_id:'dd-eval/browser-capabilities@1',probe_executed:true,outcome:'unsupported',identity,probe_sha256,identity_sha256:hashJson({...identity,probe_sha256})};
  const failure={code:'native_select_keyboard_mismatch',browser_identity:identity,browser_operation:identity.operation};
  assert.equal(browserCapabilityDiagnostic(fact,failure).status,'matching_unsupported_operation');
  for(const altered of [{...fact,outcome:'supported'},{...fact,outcome:'unknown',probe_executed:false},{...fact,probe_sha256:'c'.repeat(64)}]) assert.equal(browserCapabilityDiagnostic(altered,failure).attribution,'undetermined');
  for(const altered of [{code:'assertion'},{...failure,browser_identity:{...identity,platform:'linux'}},{...failure,browser_operation:{...identity.operation,sequence:['focus','End']}}]) assert.equal(browserCapabilityDiagnostic(fact,altered).attribution,'undetermined');
});
