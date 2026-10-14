import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../lib/runner-events.mjs';
import { readMemoryExecutionSnapshot } from '../lib/memory-runtime-setup.mjs';
import { resolveGenericExecutionContract, conformanceExecutionContract } from '../lib/execution-contract.mjs';

// Trusted synthetic fixture receipts exercise the installed owner's SQL and
// retained-byte validation. They are not provider/native physical qualification.
test('installed owner admits native retained authority; copying its JSON cannot forge admission', { skip: !process.env.DD_EVAL_MEMORY_DELIVERY_ROOT }, async t => {
  const delivery = process.env.DD_EVAL_MEMORY_DELIVERY_ROOT;
  const report = JSON.parse(await readFile(path.join(delivery, 'delivery-report.json')));
  const engine = JSON.parse(await readFile(path.join(report.snapshot, 'engine.json')));
  const load = file => import(pathToFileURL(path.join(report.snapshot, 'dist', file)).href);
  const { ResolvedFlowDescriptor } = await load('services/flow-descriptors.js');
  const { FrozenGenericExecution } = await load('services/generic-execution.js');
  const { RetainedExecutionBundle } = await load('services/execution-bundles.js');
  const { hybridDigest } = await load('services/hybrid-contracts.js');
  const { bundledHandlerContext, sdlcStageHandlers } = await load('services/stage-handlers.js');
  const { vnextStages } = await load('domain/stage-catalog.js');
  const { createContext } = await load('runtime/context.js');
  const { bindFlowRunExecutionBundle } = await load('services/runs.js');
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-native-owner-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project'), workspace = path.join(root, 'workspace'), home = path.join(root, 'home'), runRoot = path.join(root, 'run');
  await Promise.all([projectRoot, workspace, runRoot].map(directory => mkdir(directory)));
  const scope = { requestId: 'fixture-native-owner', projectRoot, workspace };
  const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const blobs = new Map();
  const put = (logical, bytes) => { blobs.set(logical, bytes); return { path: logical, sha256: sha256(bytes) }; };
  const stageSchema = engine.schema_registry.entries.find(entry => entry.name === 'stage-report');
  const stageSchemaBytes = await readFile(path.join(report.snapshot, stageSchema.path));
  const descriptor = { schema_id: 'dd-flow/flow-descriptor@1', id: 'sdlc', version: '1.0.0', origin: 'canon', entry_stage: 'specify', terminal_stages: ['merge'],
    stages: vnextStages.map(stage => ({ id: stage.id, directory: stage.directory,
      instruction: put(`instructions/${stage.id}.md`, Buffer.from(`Synthetic retained ${stage.id} fixture`)),
      result_schema: put(`schemas/${stage.id}.json`, stageSchemaBytes),
      entry_handler: sdlcStageHandlers[stage.id].entryId, finish_handler: sdlcStageHandlers[stage.id].finishId })),
    edges: vnextStages.flatMap(stage => stage.next.map((to, index) => ({ from: stage.id, to, on: index ? 'not-applicable' : 'accepted' }))) };
  const descriptorBytes = encode(descriptor), descriptorSha256 = sha256(descriptorBytes), handlers = bundledHandlerContext(new Map());
  const flow = ResolvedFlowDescriptor.admit(descriptorBytes, descriptorSha256, { ...handlers, blobs });
  const profile = JSON.parse(await readFile(path.resolve('profiles/memory-init-gpt-6-luna-xhigh.agent.json')));
  const revision = hybridDigest(profile);
  const operatorContent = { schema_id: 'dd-flow/profile-settings@1', profiles: [{ id: profile.id, revision, profile }], aliases: {}, default_profile: profile.id };
  const operators = { ...operatorContent, revision: hybridDigest(operatorContent) };
  const nativeFact = { ...scope, kind: 'native-capacity', harness: profile.harness, profileRevision: revision, capacity: 2 };
  const nativeReference = put('receipts/native-capacity.json', encode(nativeFact));
  // Expected semantic input is frozen independently, before any RUN exists.
  const execution = FrozenGenericExecution.prepare(flow, operators, { execution: 'managed', stageSessionMode: 'new_session',
    delegation: { mode: 'native', max_parallel: 2, nativeCapacityReceipt: nativeReference } }, scope, new Map([[nativeReference.sha256, nativeFact]]));
  const snapshot = execution.snapshot(), expectedSettings = structuredClone(snapshot.settings);
  expectedSettings.delegation.native_capacity_receipt = null;
  const expectation = { settings: expectedSettings, profiles: snapshot.profiles, aliases: {}, contour: descriptor.stages.map(stage => stage.id),
    native_capacity: 'requires_cli_admission', engine_artifact_sha256: engine.integrity.checksum };
  const contract = await resolveGenericExecutionContract({ runProfile: { subject: { profile_id: 'fixture-subject' } }, expectation, stages: expectation.contour,
    configHome: home, loadProfile: id => { if (id !== 'fixture-subject') throw Object.assign(new Error('missing declaration'), { code: 'ENOENT' });
      return { id, harness: 'codex-desktop', model: profile.model, reasoning: profile.reasoning, subagent_capacity: 2 }; } });
  const runId = 'RUN-001-fixture';
  const binding = { schema_id: 'dd-flow/run-engine-binding@1', run_id: runId, project_root: projectRoot, bound_at: '2026-10-11T00:00:00Z',
    source: 'run_creation', reason: 'Synthetic trusted fixture only', engine: { package_name: engine.package_name, package_version: engine.package_version,
      engine_version: engine.engine_version, integrity_checksum: engine.integrity.checksum, snapshot_root: engine.snapshot_root }, probe: { status: 'not_required', command: null } };
  const frozenProfiles = { ...operatorContent, profiles: snapshot.profiles };
  await writeFile(path.join(runRoot, 'engine-binding.json'), encode(binding));
  const bundle = { schema_id: 'dd-flow/execution-bundle@1', run_id: runId, flow_id: descriptor.id,
    descriptor: put('descriptor.json', descriptorBytes), execution_settings: put('execution.json', encode(execution.settings)),
    profile_settings: put('profiles.json', encode({ ...frozenProfiles, revision: hybridDigest(frozenProfiles) })),
    engine_binding: put('engine-binding.json', encode(binding)), engine_manifest: put('engine-manifest.json', encode(engine)), bootstrap_receipts: [],
    canon: { version: '1.0.0', commit: 'a'.repeat(40), archive_sha256: 'a'.repeat(64) }, project_pack: { sha256: 'a'.repeat(64), source_commit: 'a'.repeat(40) } };
  bundle.inventory = [...blobs].map(([logical, bytes]) => ({ path: logical, sha256: sha256(bytes) }));
  const admission = { runId, executionScope: scope, bundleProjectRoot: projectRoot, descriptorSha256, engineChecksum: engine.integrity.checksum,
    engineBindingSha256: bundle.engine_binding.sha256, engineManifestSha256: bundle.engine_manifest.sha256,
    descriptorContext: { ...handlers, blobs: new Map() }, bundleProvenance: { canon: bundle.canon, project_pack: bundle.project_pack },
    receipts: new Map([[nativeReference.sha256, nativeFact]]) };
  const bundleBytes = encode(bundle);
  let retained;
  try { retained = RetainedExecutionBundle.admit(bundleBytes, sha256(bundleBytes), blobs, admission); }
  catch (error) { error.message += `: ${JSON.stringify(error.details)}`; throw error; }
  const context = createContext({ ...process.env, DD_FLOW_HOME: home, DD_FLOW_RESOURCE_HOME: home });
  try {
    const now = context.now();
    context.db.run('INSERT INTO projects (id, root, created_at, updated_at) VALUES (?, ?, ?, ?)', ['PRJ-fixture', projectRoot, now, now]);
    const index = { schema_id: 'dd-flow/flow-run@3', run_id: runId, short_id: 'RUN-001', flow_kind: 'vnext_specify',
      subject: { id: 'fixture', title: 'Fixture' }, project: { id: 'PRJ-fixture', title: 'Fixture' }, workspace: { project_root: projectRoot, workspace_path: workspace, branch: 'fixture', base: 'main' },
      status: 'running', verdict: 'pending', next_action: null, stage_runs: [], sessions: [], runtime_revision: 0, started_at: now, created_at: now, updated_at: now };
    context.db.run('INSERT INTO runs (id, short_id, slug, project_id, project_root, workspace_root, flow_kind, subject_type, subject_id, status, verdict, runtime_path, run_dir, run_root, run_index_path, index_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [runId, 'RUN-001', 'fixture', 'PRJ-fixture', projectRoot, workspace, 'vnext_specify', 'fixture', 'fixture', 'running', 'pending', path.join(runRoot, 'runtime.json'), runRoot, runRoot, path.join(runRoot, 'index.json'), JSON.stringify(index), now, now]);
    bindFlowRunExecutionBundle(context, { projectRoot, runId, bundle: retained });
  } finally { context.db.close(); }
  const actual = await readMemoryExecutionSnapshot({ runtimeRoot: home, resourceHome: home, projectRoot, runId, engine });
  assert.equal(conformanceExecutionContract({ frozen_execution: actual }, contract).state, 'matched');
  assert.equal(conformanceExecutionContract({ frozen_execution: structuredClone(actual) }, contract).reason, 'native_capacity_not_cli_admitted');
  await writeFile(path.join(runRoot, 'execution-bundle', nativeReference.path), encode({ ...nativeFact, projectRoot: path.join(root, 'foreign') }));
  await assert.rejects(readMemoryExecutionSnapshot({ runtimeRoot: home, resourceHome: home, projectRoot, runId, engine }), { code: 'execution_bundle_invalid' });
});
