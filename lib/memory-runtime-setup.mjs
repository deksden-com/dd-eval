import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { commandJson } from './process-json.mjs';
import { verifyEngineArtifact } from './engine-admission.mjs';
import { isInstalledFlow } from './installed-flows.mjs';
const admittedSnapshots = new WeakSet();
export const isCliAdmittedExecutionSnapshot = snapshot => admittedSnapshots.has(snapshot);
const installedModules = new Map();

async function executionModules(engine, runtimeRoot) {
  const digest = engine?.integrity?.checksum ?? engine?.integrity_checksum;
  if (!path.isAbsolute(runtimeRoot ?? '') || !path.isAbsolute(engine?.snapshot_root ?? '') || !/^[a-f0-9]{64}$/.test(digest ?? '')) fail('Memory execution has no exact installed owner');
  const key = JSON.stringify([path.resolve(runtimeRoot), path.resolve(engine.snapshot_root), digest]);
  if (!installedModules.has(key)) {
    const admission = (async () => {
      // Qualify immutable code once at this private installation/import
      // boundary. Subsequent observations use the CLI's retained owner binding.
      await verifyEngineArtifact(engine);
      const load = file => import(pathToFileURL(path.join(engine.snapshot_root, 'dist', file)).href);
      return { source: await load('services/installed-flow-source.js'), generic: await load('services/generic-execution.js'),
        profiles: await load('services/operator-profiles.js'), contracts: await load('services/hybrid-contracts.js'),
        context: await load('runtime/context.js'), runs: await load('services/runs.js') };
    })();
    installedModules.set(key, admission);
    admission.catch(() => installedModules.delete(key));
  }
  return installedModules.get(key);
}

/** Resolve expected settings from admitted operator input and installed canon,
 * before a RUN exists. Never infer expectations from the observed RUN. */
export async function resolveMemoryExecutionExpectation({ runtimeRoot, configHome = runtimeRoot, installation, engine, selection, scope, flow: flowId = 'mb-init' }) {
  // Expectation/readback support is independent of public case/profile routing;
  // it does not advertise a scored runner or manufacture interactive user turns.
  if (!isInstalledFlow(flowId) && !['mb-fix', 'review-fix', 'interactive'].includes(flowId)) fail('Unsupported installed-canon workflow');
  const modules = await executionModules(engine, runtimeRoot);
  const source = flowId === 'interactive'
    ? (await import(pathToFileURL(path.join(engine.snapshot_root, 'dist/services/project-flow-source.js')).href)).PreparedProjectFlowSource.fromProject({ projectRoot: scope.projectRoot, workspace: scope.workspace, flowId })
    : modules.source.PreparedInstalledFlowSource.fromInstalledRelease(runtimeRoot, installation.manifest_sha256, flowId);
  const flow = source.resolveRegisteredFlow();
  let settings = modules.profiles.readOperatorProfiles(configHome);
  const root = selection.profileFile ? modules.profiles.readOperatorProfileInput(selection.profileFile) : selection.profile;
  const stageProfiles = Object.create(null);
  for (const assignment of selection.stageProfiles ?? []) {
    const index = assignment.indexOf('='), stage = assignment.slice(0, index), id = assignment.slice(index + 1);
    if (index < 1 || !id.trim() || Object.hasOwn(stageProfiles, stage)) fail('Memory stage profile must be a unique stage=profile assignment');
    flow.stage(stage); stageProfiles[stage] = id;
  }
  const declared = { rootProfile: root, stageProfiles, workProfiles: selection.workProfiles ?? [],
    execution: 'managed', stageSessionMode: 'new_session',
    delegation: { mode: selection.delegation ?? 'external', max_parallel: selection.maxParallel ?? 1 } };
  let snapshot;
  if (declared.delegation.mode === 'external') {
    snapshot = modules.generic.FrozenGenericExecution.prepare(flow, settings, declared, scope).snapshot();
  } else {
    // Native physical capacity is independently admitted by the actual CLI
    // request. Resolve only semantic selection here; invent no receipt and
    // never disguise native selection as an externally prepared execution.
    if (typeof root !== 'string') {
      const profile = modules.profiles.prepareOperatorProfile(root);
      const existing = settings.profiles.find(entry => entry.id === profile.id);
      const revision = modules.contracts.hybridDigest(profile);
      if (Object.hasOwn(settings.aliases, profile.id) || existing && existing.revision !== revision) fail('Memory operation profile conflicts with operator settings');
      const { revision: _revision, ...content } = structuredClone(settings);
      if (!existing) content.profiles.push({ id: profile.id, revision, profile });
      settings = { ...content, revision: modules.contracts.hybridDigest(content) };
      declared.rootProfile = profile.id;
    }
    const profiles = new Map();
    const resolve = id => {
      const profile = modules.profiles.prepareOperatorProfile(modules.profiles.resolveOperatorProfile(settings, id));
      profiles.set(profile.id, { id: profile.id, revision: modules.contracts.hybridDigest(profile), profile });
      return profile.id;
    };
    const rootId = resolve(declared.rootProfile);
    const routes = Object.fromEntries(flow.descriptor.stages.map(stage => [stage.id, resolve(stageProfiles[stage.id] ?? rootId)]));
    const works = [...new Set(declared.workProfiles.map(resolve))];
    snapshot = { profiles: [...profiles.values()], settings: { schema_id: 'dd-flow/execution-settings@1', flow_id: flow.descriptor.id,
      descriptor_sha256: flow.sha256, execution: 'managed', attached_session_receipt: null, stage_session_mode: 'new_session',
      delegation: { mode: 'native', max_parallel: declared.delegation.max_parallel, native_capacity_receipt: null },
      profiles: [...profiles.values()].map(({ id, revision }) => ({ id, revision })), root_profile: rootId, stage_profiles: routes, work_profiles: works } };
  }
  return { settings: snapshot.settings, profiles: snapshot.profiles, aliases: Object.fromEntries(Object.entries(settings.aliases).filter(([, id]) => snapshot.profiles.some(entry => entry.id === id))), contour: flow.descriptor.stages.map(stage => stage.id),
    native_capacity: declared.delegation.mode === 'native' ? 'requires_cli_admission' : 'not_required',
    engine_artifact_sha256: engine.integrity?.checksum ?? engine.integrity_checksum };
}

/** The installed CLI validates bundle, SQL anchors and scoped physical
 * receipts. Read-existing mode cannot initialize a store or dispatch work. */
export async function readMemoryExecutionSnapshot({ runtimeRoot, resourceHome, projectRoot, runId, engine }) {
  const modules = await executionModules(engine, runtimeRoot);
  const { createContext } = modules.context;
  const { readFlowRunExecutionBundle } = modules.runs;
  const context = createContext({ ...process.env, DD_FLOW_HOME: runtimeRoot, DD_FLOW_RESOURCE_HOME: resourceHome }, 'read_existing');
  try {
    const bundle = readFlowRunExecutionBundle(context, { projectRoot, runId });
    if (!bundle || bundle.engine().manifest().integrity.checksum !== (engine.integrity?.checksum ?? engine.integrity_checksum)) fail('Memory RUN engine differs from its admitted execution owner');
    const snapshot = bundle.execution.snapshot();
    admittedSnapshots.add(snapshot);
    return snapshot;
  } finally { context.db.close(); }
}

const fail = (message, details = { effect: 'no_effect' }) => { throw Object.assign(new Error(message), { code: 'memory_setup_invalid', details }); };
export function validateMemorySetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['canonSource', 'trustFile', 'channel'].includes(key))
    || ![value.canonSource, value.trustFile].every(item => typeof item === 'string' && path.isAbsolute(item))
    || value.channel !== undefined && !['stable', 'preview', 'development'].includes(value.channel)) fail('Memory setup requires explicit absolute canon source and trust file');
  return value;
}
export function validateMemoryUpgradeSetup(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) fail('Upgrade setup requires old and target canon');
  const {baseline,...target}=value;
  validateMemorySetup(baseline);validateMemorySetup(target);
  return value;
}
function validateMemorySetupInput({projectRoot,runtimeRoot,declaration,checkpoint}) {
  validateMemorySetup(declaration);
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot) || !checkpoint?.flow_pack || checkpoint.flow_pack.delivery !== 'installed_canon'
    || !/^[a-f0-9]{40}$/.test(checkpoint.flow_pack.commit ?? '') || typeof checkpoint.flow_pack.memory_bank_version !== 'string' || typeof checkpoint.flow_pack.engine?.version !== 'string') fail('Memory setup requires its private runtime and installed-canon checkpoint');
  const relative = path.relative(projectRoot, runtimeRoot);
  if (relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) fail('Memory setup Home must be outside the product workspace');
}

/** Populate independent old-canon custody before selecting the target. Both
 * commands remain ordinary setup with stable request identities; no synthetic
 * installation, bootstrap or old RUN metadata is written by Eval. */
export async function setupMemoryUpgradeRuntime(input) {
  validateMemoryUpgradeSetup(input.declaration);
  const {baseline,...target}=input.declaration;
  const old={...input,declaration:baseline,checkpoint:{flow_pack:input.checkpoint?.baseline_flow_pack},requestId:`${input.requestId}.baseline`};
  const next={...input,declaration:target,update:true};
  validateMemorySetupInput(old);validateMemorySetupInput(next);
  const installed=await setupMemoryRuntime(old);
  try {return {...await setupMemoryRuntime(next),baseline_installation:installed.installation};}
  catch(error) {error.details={...error.details,target_effect:error.details?.effect??'unknown',effect:'partial',baseline_manifest_sha256:installed.installation.manifest_sha256};throw error;}
}

/** Setup owns signatures, archive validation, activation and exact replay.
 * This client checks case identity, never manufactures a trusted selection. */
export async function setupMemoryRuntime({ bin, env, projectRoot, runtimeRoot, declaration, checkpoint, requestId, update = false }) {
  validateMemorySetupInput({projectRoot,runtimeRoot,declaration,checkpoint});
  const scoped = { ...env, DD_FLOW_HOME: runtimeRoot, DD_FLOW_CONFIG_HOME: runtimeRoot };
  const result = await commandJson(bin, ['setup', ...(update ? ['update'] : []), '--canon-source', declaration.canonSource, '--trust-file', declaration.trustFile,
    '--request-id', requestId, '--skip-agent-setup', '--non-interactive', ...(declaration.channel ? ['--channel', declaration.channel] : [])], { cwd: projectRoot, env: scoped });
  const installation = result?.request_installation ?? result?.installation;
  const manifest = installation?.manifest;
  if (result?.installation_readiness !== 'installed' || manifest?.canon?.commit !== checkpoint.flow_pack.commit
    || manifest.canon.version !== checkpoint.flow_pack.memory_bank_version || manifest?.engine?.version !== checkpoint.flow_pack.engine?.version)
    fail('Installed Memory canon/engine does not match the pinned case checkpoint', {
      effect: result?.installation_readiness === 'installed' ? 'committed' : 'unknown',
      runtime_root: runtimeRoot,
      request_id: requestId
    });
  return { ...result, installation };
}
