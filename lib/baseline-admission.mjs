import { baselineRunnerContract, verifyRunnerEvidenceCompatibility } from "./baseline/runner-contract.mjs";
export { verifyRunnerEvidenceCompatibility } from "./baseline/runner-contract.mjs";
import { executeBaselineCommand as execute, redactBaselineOutput as redact } from "./baseline/command-execution.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { commandText } from "./process-json.mjs";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { compactCheckDiagnostic } from "./check-diagnostic.mjs";
import { checkResourceEnvironment } from "./check-resources.mjs";
import { fixtureInputs, resolveFixtureAssessment, resolveFixtureValidation, verifyFixtureAssessment } from './fixture-assessment.mjs';
import { matrixComponentFingerprint } from './verification-components.mjs';
import { assessBrowserCapabilities } from './browser-capabilities.mjs';

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, ...(details ? { details } : {}) }); };
export function baselineExecutionSettled(check) {
  const proof = check.execution_settlement;
  if (proof === undefined) return check.cleanup === 'settled';
  return proof?.schema_id === 'dd-eval/baseline-execution-settlement@1' && proof.state === 'settled'
    && Number.isSafeInteger(proof.pid) && proof.pid > 0 && Number.isFinite(Date.parse(proof.observed_at))
    && (proof.process_id === null || typeof proof.process_id === 'string' && proof.process_id.length > 0
      && typeof proof.pid_started_at === 'string' && proof.pid_started_at.length > 0);
}
export async function readBaselineAdmissionPolicy({ caseRoot, definition }) {
  if (!definition?.file || path.isAbsolute(definition.file) || definition.file.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(definition.sha256 ?? "")) fail("Case requires a pinned baseline admission definition", "baseline_admission_missing");
  const bytes = await readFile(path.join(caseRoot, definition.file));
  if (hash(bytes) !== definition.sha256) fail("Baseline admission definition differs from its pin", "baseline_admission_definition_mismatch");
  const policy = JSON.parse(bytes);
  if (!["dd-eval/baseline-admission-policy@1", "dd-eval/baseline-admission-policy@2", 'dd-eval/baseline-admission-policy@3'].includes(policy.schema_id) || !Array.isArray(policy.commands) || !policy.commands.length) fail("Invalid baseline admission policy", "baseline_admission_invalid");
  const split = policy.schema_id.endsWith('@3');
  if (split && (!Array.isArray(policy.fixture_assessment?.commands) || !policy.fixture_assessment.commands.length || !Array.isArray(policy.fixture_assessment.inputs) || !policy.fixture_assessment.inputs.length || policy.fixture_assessment.inputs.some(input => typeof input !== 'string' || path.isAbsolute(input) || input.split('/').includes('..')) || !policy.commands.some(item => item.id === 'world-readiness'))) fail('Split baseline needs fixture inputs and world readiness', 'baseline_admission_invalid');
  if (split && policy.fixture_assessment.inputs_by_command && (typeof policy.fixture_assessment.inputs_by_command !== 'object' || Array.isArray(policy.fixture_assessment.inputs_by_command)
    || Object.entries(policy.fixture_assessment.inputs_by_command).some(([id, inputs]) => !policy.fixture_assessment.commands.some(item => item.id === id) || !Array.isArray(inputs) || !inputs.length || inputs.some(input => typeof input !== 'string' || path.isAbsolute(input) || input.split('/').includes('..'))))) fail('Invalid assessment group inputs', 'baseline_admission_invalid');
  const sliding = !policy.schema_id.endsWith("@1");
  const commands = [...policy.commands, ...(split ? policy.fixture_assessment.commands : [])];
  if (new Set(commands.map(item => item.id)).size !== commands.length) fail('Duplicate baseline command', 'baseline_admission_invalid');
  for (const item of commands) {
    const duration = sliding ? item.inactivity_timeout_ms : item.timeout_ms;
    if (!/^[a-z0-9-]+$/.test(item.id ?? "") || typeof item.command !== "string" || !Array.isArray(item.args) || item.args.some(arg => typeof arg !== "string") || !Number.isInteger(duration) || duration < 1 || duration > 600000 || (sliding ? "timeout_ms" : "inactivity_timeout_ms") in item) fail("Invalid baseline admission command", "baseline_admission_invalid");
  }
  return policy;
}

export async function runBaselineAdmission(options) {
  const policy = await readBaselineAdmissionPolicy(options);
  if (!policy.schema_id.endsWith('@3')) return runPolicy(options, policy);
  const { projectRoot, outputRoot, definition, checkpoint, checkResources } = options;
  try { if ((await readdir(outputRoot)).length) fail('Preserve the previous baseline attempt; select a fresh output directory', 'baseline_admission_attempt_exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const legacy = commands => ({ schema_id: 'dd-eval/baseline-admission-policy@2', commands });
  // Installation belongs to this materialized world, not a cached PASS.
  const bootstrap = policy.commands.filter(item => item.id !== 'world-readiness');
  const installed = bootstrap.length ? await runPolicy({ ...options, outputRoot: path.join(outputRoot, 'installation') }, legacy(bootstrap)) : null;
  let abi = null;
  if (options.engineRuntime?.bin ?? options.runtimeScope?.bin) {
    const bin = options.engineRuntime?.bin ?? options.runtimeScope.bin;
    let dist;
    try { dist = path.dirname(await realpath(path.join((options.engineRuntime ?? options.runtimeScope).home, 'harness-runtime'))); }
    catch { dist = path.dirname(await realpath(bin)); }
    try { abi = await matrixComponentFingerprint(path.dirname(dist)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      abi = checkpoint.value.flow_pack?.engine?.artifact_sha256;
      if (!/^[a-f0-9]{64}$/.test(abi ?? '')) fail('Legacy baseline needs exact installed engine identity', 'baseline_runner_abi_missing');
    }
  }
  const commonIdentity = { node: process.version, platform: process.platform, arch: process.arch, abi,
    executor: hash(await readFile(fileURLToPath(import.meta.url))),
    assessment_resolver: hash(await readFile(fileURLToPath(new URL('./fixture-assessment.mjs', import.meta.url)))),
    component_verifier: hash(await readFile(fileURLToPath(new URL('./verification-components.mjs', import.meta.url)))),
    database_environment: hash(process.env.DD_TASKS_TEST_ADMIN_URL ?? 'default-loopback') };
  let runtimeExecutor = null;
  if (options.runtimeScope) {
    let dist;
    try { dist = path.dirname(await realpath(path.join(options.runtimeScope.home, 'harness-runtime'))); }
    catch { dist = path.dirname(await realpath(options.runtimeScope.bin)); }
    // Explicit physical ownership inputs, not the entire engine/matrix ABI.
    const files = ['harness-runtime/lib/managed-daemon.mjs', 'harness-runtime/lib/lease-renewal.mjs', 'services/managed-processes.js', 'cli/runtime-maintenance-ingress.js'];
    runtimeExecutor = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(path.join(dist, file)))])));
  }
  const executionCommon = { node: process.version, platform: process.platform, arch: process.arch,
    executor: hash(execute.toString()), runtime_executor: runtimeExecutor, database_environment: commonIdentity.database_environment,
    check_resources: checkResourceEnvironment(checkResources),
    helpers: Object.fromEntries(await Promise.all(['process-json', 'harness/process-support', 'managed-daemon', 'runtime-maintenance', 'observation-clock', 'check-resources'].map(async name => [name, hash(await readFile(fileURLToPath(new URL(`./${name}.mjs`, import.meta.url))))]))) };
  const validationManifest = { abi, reader: hash(runPolicy.toString()), proof: hash(await readFile(fileURLToPath(new URL('./check-runner-proof.mjs', import.meta.url)))), resolver: commonIdentity.assessment_resolver };
  let compatibility;
  const probeInputs = ['check-evidence-probe','test-observation','source-diagnostic','runner-progress','browser-observation','playwright-observation','tool-diagnostic-runner','quality-runner','owned-process'].map(name => `scripts/${name}.mjs`);
  const probeIdentity = hashJson({ ...commonIdentity, requirement: checkpoint.value.preparation?.runner_evidence_probe,
    producer: await fixtureInputs(projectRoot, [...probeInputs, ...(checkpoint.value.preparation?.runner_evidence_probe?.path ? [checkpoint.value.preparation.runner_evidence_probe.path] : []), 'apps/web/package.json','pnpm-lock.yaml']) });
  // An intact technical probe is independent of quality/browser groups and of
  // current world bindings. Its original binding/evidence is never rewritten.
  let structured;
  try { structured = JSON.parse(await readFile(path.join(projectRoot, '.memory-bank/spec/engineering/code-check-profile.json'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (structured?.schema_id === 'dd-flow/code-check-profile@7' && Object.keys(structured.runner_evidence_by_alias ?? {}).length && checkpoint.value.preparation?.runner_evidence_probe) {
    const ref = await resolveFixtureAssessment({ identity: probeIdentity, assess: async evidence => {
      for (const item of policy.fixture_assessment.commands) {
        const runner = await baselineRunnerContract(item, { projectRoot, outputRoot: evidence, engineRuntime: options.engineRuntime ?? options.runtimeScope, checkpoint,
          before: await commandText('git', ['rev-parse','HEAD'], { cwd: projectRoot }), definition, checkResources });
        if (runner) return verifyRunnerEvidenceCompatibility({ projectRoot, outputRoot: evidence, api: runner.api, binding: runner.binding, runtimeScope: options.runtimeScope,
          requirement: checkpoint.value.preparation.runner_evidence_probe });
      }
      fail('No runner can prove declared producer compatibility', 'baseline_runner_abi_missing');
    } });
    compatibility = { ...(await verifyFixtureAssessment(ref, probeIdentity)).result, reuse: ref };
  }
  let assessment, assessmentIdentity;
  if (options.inheritedBaseline) {
    const old = await verifyBaselineAdmission({ reference: options.inheritedBaseline, definition, checkpoint, caseRoot: options.caseRoot, checkResources });
    assessmentIdentity = old.fixture_identity;
    assessment = await revalidateFixtureReference(old.fixture_assessment, old.fixture_identity, validationManifest, options.engineRuntime ?? options.runtimeScope);
  } else {
    const groups = [];
    for (const item of policy.fixture_assessment.commands) {
      const patterns = policy.fixture_assessment.inputs_by_command?.[item.id] ?? policy.fixture_assessment.inputs;
      const executionManifest = { ...executionCommon, inputs: await fixtureInputs(projectRoot, patterns), assessment: { command: item, inputs: patterns } };
      const identity = hash(JSON.stringify(executionManifest));
      const reference = await resolveFixtureValidation({ executionManifest, validationManifest,
        assess: evidence => runPolicy({ ...options, outputRoot: evidence, compatibility }, legacy([item])),
        validate: result => revalidateFixtureResult(result, options.engineRuntime ?? options.runtimeScope) });
      groups.push({ id: item.id, identity, reference });
    }
    assessment = groups.length === 1 ? groups[0].reference : { groups, source: groups.some(group => group.reference.source === 'executed') ? 'executed' : groups.some(group => group.reference.source === 'revalidated_fixture_assessment') ? 'revalidated_fixture_assessment' : 'reused_fixture_assessment' };
    assessmentIdentity = groups.length === 1 ? groups[0].identity : hash(JSON.stringify(groups.map(group => [group.id, group.identity])));
  }
  const readiness = await runPolicy({ ...options, outputRoot: path.join(outputRoot, 'readiness') }, legacy(policy.commands.filter(item => item.id === 'world-readiness')));
  const browserCapabilities = policy.fixture_assessment.commands.some(item => /browser/.test(item.id)) ? await assessBrowserCapabilities({ projectRoot, checkResources }) : undefined;
  const receipt = { schema_id: 'dd-eval/baseline-admission@3', policy_schema_id: policy.schema_id, status: 'passed', checkpoint_id: checkpoint.value.id, checkpoint_sha256: checkpoint.sha256,
    source_commit: checkpoint.value.source.commit, policy_sha256: definition.sha256, project_root: await realpath(projectRoot), fixture_identity: assessmentIdentity, fixture_assessment: assessment,
    installation: installed, world_readiness: readiness, check_resources: checkResources, ...(browserCapabilities ? { browser_capabilities: browserCapabilities } : {}), checks: [] };
  await mkdir(outputRoot, { recursive: true });
  const file = path.join(outputRoot, 'receipt.json'); await writeJsonAtomic(file, receipt);
  return { file, sha256: hash(await readFile(file)), status: 'passed', policy_sha256: definition.sha256, project_root: receipt.project_root,
    technical_notes: [...(installed?.technical_notes ?? []), ...(readiness?.technical_notes ?? [])] };
}
async function revalidateFixtureReference(reference, identity, validationManifest, engineRuntime) {
  if (reference.groups) {
    const groups = [];
    for (const group of reference.groups) groups.push({ ...group, reference: await revalidateFixtureReference(group.reference, group.identity, validationManifest, engineRuntime) });
    return { groups, source: groups.some(group => group.reference.source === 'revalidated_fixture_assessment') ? 'revalidated_fixture_assessment' : 'reused_fixture_assessment' };
  }
  const previous = await verifyFixtureAssessment(reference, identity);
  if (previous.schema_id !== 'dd-eval/fixture-assessment@2') fail('Legacy fixture has no independently bound execution manifest; select an affected cold assessment', 'baseline_execution_identity_missing');
  const execution = JSON.parse(await readFile(previous.execution.file));
  return resolveFixtureValidation({ executionManifest: execution.execution_manifest, validationManifest,
    assess: async () => { fail('Inherited fixture execution pointer is missing', 'baseline_execution_identity_missing'); },
    validate: result => revalidateFixtureResult(result, engineRuntime) });
}
async function revalidateFixtureResult(reference, engineRuntime) {
  const bytes = await readFile(reference.file);
  if (hash(bytes) !== reference.sha256) fail('Fixture execution receipt changed', 'baseline_admission_evidence_mismatch');
  const receipt = JSON.parse(bytes);
  if (receipt.status !== 'passed' || !receipt.checks?.length) fail('Fixture execution is not passed', 'baseline_admission_unconfirmed');
  let api;
  for (const check of receipt.checks) {
    if (check.exit_code !== 0 || !baselineExecutionSettled(check) || hash(await readFile(path.join(path.dirname(reference.file), check.log))) !== check.log_sha256) fail('Fixture execution is incomplete or changed', 'baseline_admission_evidence_mismatch');
    if (!check.runner_evidence_required) continue;
    if (!engineRuntime?.bin || !check.evidence_dir || !check.runner_binding) fail('Fixture runner readback unavailable', 'baseline_runner_abi_missing');
    if (!api) {
      let dist;
      try { dist = path.dirname(await realpath(path.join(engineRuntime.home, 'harness-runtime'))); }
      catch { dist = path.dirname(await realpath(engineRuntime.bin)); }
      api = await import(pathToFileURL(path.join(dist, 'services/check-runner-evidence.js')).href);
    }
    const read = api.readRunnerEvidenceDetailed(check.evidence_dir, check.runner_evidence_required, check.runner_binding);
    if (!api.runnerEvidencePass(read.evidence)) fail('Retained fixture runner proof rejected by current reader', 'baseline_runner_revalidation_failed', { check_id: check.id, diagnostics: read.diagnostics });
  }
  return { status: 'passed', receipt_sha256: reference.sha256 };
}
async function runPolicy({ caseRoot, definition, projectRoot, outputRoot, checkpoint, beforeCommand = async () => {}, runtimeScope = null, engineRuntime = runtimeScope, checkResources, compatibility: reusableCompatibility }, policy) {
  const resourceEnv = checkResourceEnvironment(checkResources);
  if (resourceEnv.PLAYWRIGHT_BROWSERS_PATH) await mkdir(resourceEnv.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  const before = await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  const sliding = policy.schema_id.endsWith("@2");
  const receipt = { schema_id: `dd-eval/baseline-admission@${sliding ? 2 : 1}`, policy_schema_id: policy.schema_id, checkpoint_id: checkpoint.value.id, checkpoint_sha256: checkpoint.sha256, policy_sha256: definition.sha256, source_commit: checkpoint.value.source.commit, materialized_commit: before, started_at: new Date().toISOString(), status: "running", checks: [] };
  if (checkResources !== undefined) receipt.check_resources = { playwright_browsers_path: resourceEnv.PLAYWRIGHT_BROWSERS_PATH };
  const file = path.join(outputRoot, "receipt.json");
  await writeJsonAtomic(file, receipt);
  try {
    let compatibility = reusableCompatibility;
    for (const authored of policy.commands) {
      const item = { ...authored, args: authored.args.map(arg => arg === '__DD_EVAL_WORLD_READINESS__' ? fileURLToPath(new URL('../bin/world-readiness.mjs', import.meta.url)) : arg) };
      await beforeCommand(item.id);
      const runner = await baselineRunnerContract(item, { projectRoot, outputRoot, engineRuntime, checkpoint, before, definition, checkResources });
      if (runner && compatibility === undefined) {
        compatibility = await verifyRunnerEvidenceCompatibility({ projectRoot, outputRoot, api: runner.api, binding: runner.binding, runtimeScope,
          requirement: checkpoint.value.preparation?.runner_evidence_probe,
          required: checkpoint.value.preparation?.runner_evidence_probe !== undefined });
        if (compatibility) receipt.runner_compatibility = compatibility;
      }
      const finalWorld = path.join(outputRoot, 'world-final.json');
      const result = await execute(item, projectRoot, runtimeScope, sliding, runner, { ...resourceEnv, ...(item.id === 'world-readiness' ? { DD_TASKS_TEST_WORLD_FINAL_RECEIPT: finalWorld } : {}) });
      const log = `${item.id}.log`;
      const output = redact(result.output);
      await writeFile(path.join(outputRoot, log), output);
      const detailed = runner?.api.readRunnerEvidenceDetailed?.(runner.root, runner.contract, runner.binding);
      const evidence = detailed ? detailed.evidence : runner ? runner.api.readRunnerEvidence(runner.root, runner.contract, runner.binding) : undefined;
      const passed = result.code === 0 && !result.timed_out && (!runner || runner.api.runnerEvidencePass(evidence));
      const outcome = runner ? runner.api.checkRepairDisposition({ status: result.timed_out ? "aborted" : passed ? "passed" : "failed", exit_code: result.code, candidate_root: projectRoot, runner_evidence: evidence, runner_evidence_required: runner.contract }) : passed ? "passed" : result.timed_out ? "settlement_required" : "unclassified";
      receipt.checks.push({ id: item.id, exit_code: result.code, timed_out: result.timed_out, outcome, execution_settlement: result.execution_settlement, cleanup: result.cleanup ?? 'settled', ...(result.technical_notes ? { technical_notes: result.technical_notes } : {}), ...(runner ? { runner_evidence_required: runner.contract, runner_evidence: evidence, runner_binding: runner.binding, runner_observation: runner.durations, evidence_dir: runner.root } : {}), ...(sliding ? { timeout_kind: "inactivity", inactivity_timeout_ms: item.inactivity_timeout_ms, native_outcome: result.timed_out ? "unknown" : "exited", observation: result.observation_lost ? "lost" : result.timed_out ? "quiet" : "terminal" } : {}), log, log_sha256: hash(output) });
      if (detailed) Object.assign(receipt.checks.at(-1), { runner_evidence_diagnostics: detailed.diagnostics,
        ...(detailed.diagnostics_truncated ? { runner_evidence_diagnostics_truncated: true } : {}) });
      if (item.id === 'world-readiness' && passed) {
        const worldBytes = await readFile(finalWorld), world = JSON.parse(worldBytes);
        const proof = output.split('\n').flatMap(line => { try { const value = JSON.parse(line); return value.schema_id === 'dd-eval/world-readiness@1' ? [value] : []; } catch { return []; } });
        const worldProject = typeof world.project_root === 'string' && path.isAbsolute(world.project_root) ? await realpath(world.project_root) : null;
        if (proof.length !== 1 || proof[0].ready !== true || world.state !== 'cleaned' || world.world_id !== proof[0].world_id || world.pid !== proof[0].owner_pid || worldProject !== await realpath(projectRoot) || !world.process_cleanup?.length || world.process_cleanup.some(item => item.settled !== true)) fail('World readiness/owned cleanup is not proven', 'baseline_readiness_unconfirmed');
        receipt.checks.at(-1).world_proof = { file: finalWorld, sha256: hash(worldBytes), world_id: world.world_id, project_root: worldProject };
      }
      await writeJsonAtomic(file, receipt);
      if (!passed) { receipt.status = "failed"; break; }
    }
    const dirty = await commandText("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: projectRoot });
    if (dirty || await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) !== before) receipt.status = "source_changed";
    if (receipt.status === "running") receipt.status = "passed";
    receipt.finished_at = new Date().toISOString();
    await writeJsonAtomic(file, receipt);
    if (receipt.status !== "passed") fail(`Pre-feature baseline admission ${receipt.status}; see ${file}`, "baseline_admission_failed", { receipt_file: file, checks: receipt.checks.map(compactCheckDiagnostic), product_repair_allowed: false });
    return { file, sha256: hash(await readFile(file)), status: receipt.status, policy_sha256: definition.sha256,
      technical_notes: receipt.checks.flatMap(check => (check.technical_notes ?? []).map(note => ({ ...note, resource_identity: check.execution_settlement?.process_id ?? String(check.execution_settlement?.pid ?? check.id) }))) };
  } catch (error) {
    if (!receipt.finished_at) {
      receipt.status = "failed";
      receipt.finished_at = new Date().toISOString();
      receipt.error = JSON.parse(JSON.stringify(errorRecord(error), (_key, value) => typeof value === "string" ? redact(value) : value));
      try { await writeJsonAtomic(file, receipt); }
      catch (persistence) { error.details = { ...error.details, baseline_receipt_error: errorRecord(persistence) }; }
    }
    throw error;
  }
}
export async function verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot = null, checkResources, projectRoot = null }) {
  if (!reference?.file || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("Execution has no retained baseline admission; use a new checkpoint", "baseline_admission_unconfirmed");
  const bytes = await readFile(reference.file);
  if (hash(bytes) !== reference.sha256) fail("Retained baseline admission was modified", "baseline_admission_evidence_mismatch");
  const receipt = JSON.parse(bytes);
  if (receipt.schema_id === 'dd-eval/baseline-admission@3') {
    const policy = await readBaselineAdmissionPolicy({ caseRoot, definition });
    if (policy.schema_id !== 'dd-eval/baseline-admission-policy@3' || receipt.status !== 'passed' || receipt.policy_sha256 !== definition.sha256 || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.project_root !== reference.project_root || projectRoot && await realpath(projectRoot) !== receipt.project_root || hashJson(checkResourceEnvironment(checkResources)) !== hashJson(checkResourceEnvironment(receipt.check_resources))) fail('Split baseline does not belong to this world', 'baseline_admission_unconfirmed');
    await verifyFixtureAssessment(receipt.fixture_assessment, receipt.fixture_identity);
    if (policy.fixture_assessment.commands.length > 1 && JSON.stringify(receipt.fixture_assessment.groups?.map(group => group.id)) !== JSON.stringify(policy.fixture_assessment.commands.map(item => item.id))) fail('Fixture assessment groups incomplete', 'baseline_admission_unconfirmed');
    const verifyPart = async (ref, commands) => {
      if (!ref || hash(await readFile(ref.file)) !== ref.sha256) fail('Split baseline evidence changed', 'baseline_admission_evidence_mismatch');
      const part = JSON.parse(await readFile(ref.file));
      if (part.status !== 'passed' || part.policy_sha256 !== definition.sha256 || part.checkpoint_sha256 !== checkpoint.sha256 || JSON.stringify(part.checks?.map(item => item.id)) !== JSON.stringify(commands.map(item => item.id)) || part.checks.some(item => item.exit_code !== 0 || item.outcome !== 'passed' || !baselineExecutionSettled(item))) fail('Split baseline commands incomplete', 'baseline_admission_unconfirmed');
      for (const check of part.checks) if (hash(await readFile(path.join(path.dirname(ref.file), check.log))) !== check.log_sha256) fail('Split baseline log changed', 'baseline_admission_evidence_mismatch');
      return part;
    };
    const bootstrap = policy.commands.filter(item => item.id !== 'world-readiness');
    if (bootstrap.length) await verifyPart(receipt.installation, bootstrap);
    const readiness = await verifyPart(receipt.world_readiness, policy.commands.filter(item => item.id === 'world-readiness'));
    const proof = readiness.checks[0]?.world_proof;
    if (!proof || proof.project_root !== receipt.project_root || hash(await readFile(proof.file)) !== proof.sha256) fail('World proof missing or changed', 'baseline_admission_unconfirmed');
    return receipt;
  }
  if (checkResources !== undefined && hashJson(checkResourceEnvironment(checkResources)) !== hashJson(checkResourceEnvironment(receipt.check_resources))) fail("Retained baseline check resources differ from execution", "baseline_admission_unconfirmed");
  if (caseRoot && definition?.file) {
    const policy = await readBaselineAdmissionPolicy({ caseRoot, definition });
    if (receipt.schema_id !== `dd-eval/baseline-admission@${policy.schema_id.endsWith("@2") ? 2 : 1}`) fail("Retained baseline receipt belongs to another policy contract", "baseline_admission_unconfirmed");
    if (!Array.isArray(receipt.checks) || receipt.checks.length !== policy.commands.length || receipt.checks.some((check, index) => check.id !== policy.commands[index].id || policy.schema_id.endsWith("@2") && check.inactivity_timeout_ms !== policy.commands[index].inactivity_timeout_ms)) fail("Retained baseline commands differ from their pinned policy", "baseline_admission_unconfirmed");
  }
  if (!["dd-eval/baseline-admission@1", "dd-eval/baseline-admission@2"].includes(receipt.schema_id) || receipt.schema_id.endsWith("@2") && (receipt.policy_schema_id !== "dd-eval/baseline-admission-policy@2" || receipt.checks?.some(check => check.timeout_kind !== "inactivity" || !Number.isInteger(check.inactivity_timeout_ms) || check.inactivity_timeout_ms < 1 || check.inactivity_timeout_ms > 600000 || !baselineExecutionSettled(check) || check.native_outcome !== "exited"))) fail("Retained baseline policy contract is invalid", "baseline_admission_unconfirmed");
  if (receipt.status !== "passed" || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.policy_sha256 !== definition?.sha256 || !receipt.checks?.length || receipt.checks.some(check => check.exit_code !== 0 || check.outcome !== undefined && check.outcome !== "passed" || check.runner_evidence?.failure_projection !== undefined || check.runner_evidence_required && (!check.runner_evidence?.completed || check.runner_evidence.observation_unknown || check.runner_evidence.failures?.length !== 0 || check.runner_evidence.counts?.failed !== 0 || hashJson(check.runner_evidence.binding) !== hashJson(check.runner_binding)))) fail("Retained baseline admission does not qualify this execution", "baseline_admission_unconfirmed");
  return receipt;
}
