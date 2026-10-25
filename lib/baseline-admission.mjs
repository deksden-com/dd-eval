import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { commandText, childEnvironment } from "./process-json.mjs";
import { runtimeMaintenance, observeRuntimeLease } from "./runtime-maintenance.mjs";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { ObservationClock } from "./observation-clock.mjs";
import { compactCheckDiagnostic } from "./check-diagnostic.mjs";
import { checkResourceEnvironment } from "./check-resources.mjs";
import { fixtureInputs, resolveFixtureAssessment, resolveFixtureValidation, verifyFixtureAssessment } from './fixture-assessment.mjs';
import { matrixComponentFingerprint } from './verification-components.mjs';
import { assessBrowserCapabilities } from './browser-capabilities.mjs';

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, ...(details ? { details } : {}) }); };
const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]").replace(/((?:password|token|secret|api_key)[=:]\s*)[^\s&]+/gi, "$1[redacted]");
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
    helpers: Object.fromEntries(await Promise.all(['process-json', 'managed-daemon', 'runtime-maintenance', 'observation-clock', 'check-resources'].map(async name => [name, hash(await readFile(fileURLToPath(new URL(`./${name}.mjs`, import.meta.url))))]))) };
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
  return { file, sha256: hash(await readFile(file)), status: 'passed', policy_sha256: definition.sha256, project_root: receipt.project_root };
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
    if (check.exit_code !== 0 || check.cleanup !== 'settled' || hash(await readFile(path.join(path.dirname(reference.file), check.log))) !== check.log_sha256) fail('Fixture execution is incomplete or changed', 'baseline_admission_evidence_mismatch');
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
      receipt.checks.push({ id: item.id, exit_code: result.code, timed_out: result.timed_out, outcome, ...(runner ? { runner_evidence_required: runner.contract, runner_evidence: evidence, runner_binding: runner.binding, runner_observation: runner.durations, evidence_dir: runner.root } : {}), ...(sliding ? { timeout_kind: "inactivity", inactivity_timeout_ms: item.inactivity_timeout_ms, native_outcome: result.timed_out ? "unknown" : "exited", observation: result.observation_lost ? "lost" : result.timed_out ? "quiet" : "terminal", cleanup: "settled" } : {}), log, log_sha256: hash(output) });
      if (detailed) Object.assign(receipt.checks.at(-1), { runner_evidence_diagnostics: detailed.diagnostics,
        ...(detailed.diagnostics_truncated ? { runner_evidence_diagnostics_truncated: true } : {}) });
      if (item.id === 'world-readiness' && passed) {
        const worldBytes = await readFile(finalWorld), world = JSON.parse(worldBytes);
        const proof = output.split('\n').flatMap(line => { try { const value = JSON.parse(line); return value.schema_id === 'dd-eval/world-readiness@1' ? [value] : []; } catch { return []; } });
        if (proof.length !== 1 || proof[0].ready !== true || world.state !== 'cleaned' || world.world_id !== proof[0].world_id || world.pid !== proof[0].owner_pid || world.project_root !== await realpath(projectRoot) || !world.process_cleanup?.length || world.process_cleanup.some(item => item.settled !== true)) fail('World readiness/owned cleanup is not proven', 'baseline_readiness_unconfirmed');
        receipt.checks.at(-1).world_proof = { file: finalWorld, sha256: hash(worldBytes), world_id: world.world_id, project_root: world.project_root };
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
    return { file, sha256: hash(await readFile(file)), status: receipt.status, policy_sha256: definition.sha256 };
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
/** Failure capability, not a second model qualification. Producer runs only in
 * its own output tree; the installed consumer rebuilds repair authority. */
export async function verifyRunnerEvidenceCompatibility({ projectRoot, outputRoot, api, binding, runtimeScope = null, required = true,
  requirement = { path: "scripts/check-evidence-probe.mjs", contract: "dd-tasks/check-evidence-probe@1" } }) {
  if (!required) return null;
  const failed = (reason, details = {}) => fail("Runner producer and installed engine failure contracts are incompatible", "runner_evidence_incompatible", { reason, ...details, product_repair_allowed: false });
  if (!requirement || typeof requirement.path !== "string" || path.isAbsolute(requirement.path) || requirement.path.includes("\\")
    || requirement.path.split("/").some(part => !part || part === "." || part === "..") || requirement.contract !== "dd-tasks/check-evidence-probe@1") failed("invalid_probe_requirement");
  projectRoot = await realpath(projectRoot);
  outputRoot = await realpath(outputRoot);
  const root = path.join(outputRoot, `runner-contract-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const entry = path.join(projectRoot, requirement.path);
  try {
    if (await realpath(entry) !== entry) failed("unsafe_producer_path");
  } catch (error) { if (error.code === "ENOENT") failed("missing_failure_probe", { expected: "dd-tasks/check-evidence-probe@1" }); throw error; }
  const result = await execute({ id: "runner-contract-probe", command: process.execPath,
    args: [entry, "--output", root, "--binding-json", JSON.stringify(binding)], inactivity_timeout_ms: 120000 }, projectRoot, runtimeScope, true);
  if (result.code !== 0 || result.timed_out) failed("producer_probe_failed", { exit_code: result.code, timed_out: result.timed_out, output: redact(result.output).slice(-4096) });
  const manifestFile = path.join(root, "probe.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); }
  catch { failed("missing_or_invalid_probe_manifest"); }
  const requiredCases = ["browser-window", "runtime-error", "runtime-typeerror", "compiler", "composite"];
  if (!manifest || typeof manifest !== "object" || manifest.schema_id !== requirement.contract || !Array.isArray(manifest.cases)
    || manifest.cases.some(item => !item || typeof item !== "object") || manifest.cases.length !== requiredCases.length
    || new Set(manifest.cases.map(item => item.id)).size !== requiredCases.length || requiredCases.some(id => !manifest.cases.some(item => item.id === id))) failed("probe_cases_missing");
  const inside = async relative => {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === ".." || !part)) failed("unsafe_probe_path");
    const file = path.join(root, relative);
    if (await realpath(file) !== file) failed("unsafe_probe_path");
    return file;
  };
  const cases = [];
  for (const item of manifest.cases) {
    const reportRoot = await inside(item.root), candidateRoot = await inside(item.candidate_root ?? manifest.candidate_root);
    if (item.expected !== "source_repair" || !item.binding || item.binding.input_hash !== binding.input_hash || item.binding.verification_epoch !== binding.verification_epoch
      || !api.runnerContractsValid({ "@check/probe": item.contract })) failed("invalid_probe_binding", { case_id: item.id });
    const read = api.readRunnerEvidenceDetailed ? api.readRunnerEvidenceDetailed(reportRoot, item.contract, item.binding)
      : { evidence: api.readRunnerEvidence(reportRoot, item.contract, item.binding), diagnostics: [] };
    const disposition = api.checkRepairDisposition({ status: "failed", exit_code: 1, runner_evidence: read.evidence, runner_evidence_required: item.contract, candidate_root: candidateRoot });
    if (disposition !== item.expected) failed("failure_capability_rejected", { case_id: item.id, expected: item.expected, observed: disposition, diagnostics: read.diagnostics });
    // Foreign invocation must never acquire authority merely because the
    // producer and consumer agree on a schema version.
    if (api.readRunnerEvidence(reportRoot, item.contract, { ...item.binding, invocation_id: `foreign:${item.binding.invocation_id}` })) failed("foreign_binding_accepted", { case_id: item.id });
    cases.push({ id: item.id, disposition });
  }
  return { schema_id: manifest.schema_id, status: "passed", producer_sha256: hash(await readFile(entry)), manifest: manifestFile, manifest_sha256: hash(await readFile(manifestFile)), cases };
}

async function baselineRunnerContract(item, { projectRoot, outputRoot, engineRuntime, checkpoint, before, definition, checkResources }) {
  let profile;
  try { profile = JSON.parse(await readFile(path.join(projectRoot, ".memory-bank/spec/engineering/code-check-profile.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (profile.schema_id !== "dd-flow/code-check-profile@7" || !profile.runner_evidence_by_alias || !Object.keys(profile.runner_evidence_by_alias).length) return null;
  if (!path.isAbsolute(engineRuntime?.bin ?? "") || !path.isAbsolute(engineRuntime?.home ?? "")) fail("Structured baseline requires its installed engine ABI", "baseline_runner_abi_missing");
  let engineDist;
  try { engineDist = path.dirname(await realpath(path.join(engineRuntime.home, "harness-runtime"))); }
  catch (error) { if (error.code !== "ENOENT") throw error; engineDist = path.dirname(await realpath(engineRuntime.bin)); }
  const api = await import(pathToFileURL(path.join(engineDist, "services/check-runner-evidence.js")).href);
  if (!api.runnerContractsValid(profile.runner_evidence_by_alias) || typeof api.runnerContractForArgv !== "function" || typeof api.readRunnerProgress !== "function" || typeof api.runnerObservationDurations !== "function") fail("Installed engine has no compatible baseline runner ABI", "baseline_runner_abi_missing");
  const selected = api.runnerContractForArgv(profile, item.command, item.args);
  if (!selected) return null;
  const root = path.join(outputRoot, `${item.id}-runner-${randomUUID()}`);
  await mkdir(path.dirname(path.join(root, selected.contract.path)), { recursive: true });
  const invocation = `BASELINE-${randomUUID()}`;
  const binding = { invocation_id: invocation, check_id: item.id, command: profile.aliases[selected.alias], input_hash: hashJson({ checkpoint: checkpoint.sha256, materialized_commit: before, policy: definition.sha256, profile, ...(checkResources === undefined ? {} : { check_resources: checkResources }) }), verification_epoch: hashJson({ checkpoint: checkpoint.sha256, materialized_commit: before }) };
  const progress = path.join(root, "runner-progress.jsonl");
  return { api, root, contract: selected.contract, binding, progress, durations: api.runnerObservationDurations(childEnvironment()), env: { DD_FLOW_EVIDENCE_DIR: root, DD_FLOW_CHECK_RUNNER_EVIDENCE_PATH: path.join(root, selected.contract.path), DD_FLOW_CHECK_RUNNER_PROGRESS_PATH: progress, DD_FLOW_CHECK_COMMAND: binding.command, DD_FLOW_CHECK_INVOCATION_ID: invocation, DD_FLOW_CHECK_ID: item.id, DD_FLOW_CHECK_INPUT_HASH: binding.input_hash, DD_FLOW_CHECK_VERIFICATION_EPOCH: binding.verification_epoch } };
}

async function execute(item, cwd, runtimeScope, sliding, runner = null, resourceEnv = {}) {
  if (runtimeScope && (!path.isAbsolute(runtimeScope.bin ?? "") || !path.isAbsolute(runtimeScope.home ?? "") || !path.isAbsolute(runtimeScope.resourceHome ?? "") || !runtimeScope.budget?.scope_id || !runtimeScope.operationId)) fail("Baseline requires a retained runtime scope", "runtime_scope_identity_missing");
  const gate = `const {spawn}=require('node:child_process'); let input='';process.stdin.on('data',bytes=>{input+=bytes;});process.stdin.once('end',()=>{if(!input)process.exit(1);const item=JSON.parse(input);const child=spawn(item.command,item.args,{stdio:'inherit'});child.once('error',()=>process.exit(1));child.once('exit',(code)=>process.exit(code??1));});`;
  const child = spawn(runtimeScope ? process.execPath : item.command, runtimeScope ? ["-e", gate] : item.args, { cwd, env: childEnvironment({ ...runner?.env, ...resourceEnv }), detached: true, stdio: [runtimeScope ? "pipe" : "ignore", "pipe", "pipe"] });
  let cleanup;
  let armCommandTimeout;
  let lease, leaseFailure, progressFailure;
  let rejectCompleted;
  const settle = () => cleanup ??= stopProcessGroup(child, 5000);
  const completed = new Promise((resolve, reject) => {
    rejectCompleted = reject;
    let output = "", timedOut = false, observationLost = false;
    let timer, clock, cursor = 0, runnerPhase = "startup";
    const timeoutMs = sliding ? item.inactivity_timeout_ms : item.timeout_ms;
    const timeout = () => { timedOut = true; void settle().catch(cleanup => reject(Object.assign(new Error(`Baseline ${item.id} timed out and cleanup is unconfirmed`), { code: 'baseline_timeout', details: { command: item.command, timeout_ms: clock?.timeoutMs ?? timeoutMs, ...(runner ? { phase: runnerPhase, sequence: cursor } : {}) }, cleanup_error: errorRecord(cleanup) }))); };
    armCommandTimeout = () => {
      if (runner || sliding) {
        clock = new ObservationClock({ timeoutMs: runner ? runner.durations.startupMs : timeoutMs }); clock.sample(cursor);
        timer = setInterval(() => {
          try { if (runner) {
            for (const event of runner.api.readRunnerProgress(runner.progress, runner.binding.invocation_id, cursor)) { cursor = event.sequence; if (event.phase === "execution") runnerPhase = "execution"; clock.sample(cursor, Date.parse(event.at)); }
            clock.timeoutMs = runnerPhase === "execution" ? runner.durations.executionMs : runner.durations.startupMs;
          }
          if (clock.sample(cursor)) { observationLost = clock.observationLost; clearInterval(timer); timeout(); }
          } catch (error) { progressFailure = error; clearInterval(timer); void settle().catch(cleanup => { error.cleanup_error ??= errorRecord(cleanup); }).finally(() => reject(error)); }
        }, Math.min(1000, timeoutMs));
      }
      else timer = setTimeout(timeout, timeoutMs);
    };
    if (!runtimeScope) armCommandTimeout();
    const append = chunk => { if (!runner) { cursor += 1; clock?.sample(cursor, Date.now()); } output += String(chunk); if (output.length > 2_000_000) output = output.slice(-2_000_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", error => { clearTimeout(timer); resolve({ code: 1, output: error.message, timed_out: false }); });
    child.once("close", code => { clearTimeout(timer); if (progressFailure) reject(progressFailure); else resolve({ code: timedOut ? 124 : code ?? 1, output, timed_out: timedOut, observation_lost: observationLost }); });
  });
  // Registration can still be in flight when timeout rejects completion.
  void completed.catch(() => {});
  const env = runtimeScope ? { DD_FLOW_HOME: runtimeScope.home, DD_FLOW_RESOURCE_HOME: runtimeScope.resourceHome } : {};
  let maintenance;
  const call = async args => {
    maintenance ??= await runtimeMaintenance({ ddFlowBin: runtimeScope.bin, ddFlowHome: runtimeScope.home, resourceHome: runtimeScope.resourceHome, cwd, env });
    const options = {};
    for (let i = 1; i < args.length; i += 2) options[args[i].replace(/^--/, "")] = args[i + 1];
    return await maintenance.call(args[0], options);
  };
  let record, primary;
  const observe = async () => {
    const result = await completed;
    if (leaseFailure) throw leaseFailure;
    if (result.code !== 0) primary = Object.assign(new Error(`Baseline ${item.id} failed`), { code: result.observation_lost ? 'operation_observation_lost' : result.timed_out ? 'baseline_timeout' : 'baseline_command_failed', details: { command: item.command, exit_code: result.code, timed_out: result.timed_out, observation_lost: result.observation_lost } });
    return result;
  };
  try {
    if (!runtimeScope) return await observe();
    const processId = `PROC-${randomUUID()}`, operation = `${runtimeScope.operationId}:${item.id}`;
    const owns = candidate => {
      if (!candidate || candidate.id !== processId || typeof candidate.lease_token !== "string" || !candidate.lease_token || candidate.kind !== "eval-baseline" || candidate.owner_id !== runtimeScope.budget.scope_id || candidate.operation_id !== operation || candidate.project_id || candidate.run_id || candidate.work_id || candidate.check_id) return false;
      try {
        const metadata = JSON.parse(candidate.metadata_json);
        return metadata?.dd_flow_home === path.resolve(runtimeScope.home) && metadata.role === "probe" && metadata.owner_pid === process.pid && hashJson(metadata.budget) === hashJson(runtimeScope.budget);
      } catch { return false; }
    };
    let registered;
    try { registered = await call(["register", "--id", processId, "--kind", "eval-baseline", "--owner", runtimeScope.budget.scope_id, "--role", "probe", "--operation", operation, "--budget-json", JSON.stringify(runtimeScope.budget), "--owner-pid", String(process.pid)]); }
    catch (error) {
      // Read-only recovery of timeout-after-COMMIT; never repeat registration.
      if (error.details?.cleanup_unconfirmed || error.code === "process_ownership_unconfirmed") throw error;
      const candidate = (await call(["status"]).catch(() => null))?.processes?.find(process => process.id === processId);
      if (!owns(candidate)) throw error;
      registered = { ok: true, process: candidate };
    }
    const candidate = registered?.process;
    if (registered?.ok !== true || !owns(candidate)) fail("Baseline registration omitted its exact retained binding", "process_maintenance_receipt_invalid");
    // Do not adopt or finalize an unrelated registration returned by the CLI.
    record = candidate;
    if (!child.pid) fail("Baseline process registration failed", "process_ownership_unknown");
    const confirmation = await call(["confirm", "--id", record.id, "--lease-token", record.lease_token, "--pid", String(child.pid), "--process-group-id", String(child.pid)]), confirmed = confirmation?.process;
    if (confirmation?.ok !== true || !owns(confirmed) || confirmed.lease_token !== record.lease_token || confirmed.pid !== child.pid || confirmed.state !== "running" || !Number.isFinite(Date.parse(confirmed.lease_expires_at)) || Date.parse(confirmed.lease_expires_at) <= Date.now() || !/^[a-f0-9]{64}$/.test(confirmed.registration_sha256 ?? "")) fail("Baseline confirmation omitted its committed owner/expiry", "process_maintenance_receipt_invalid");
    // Ownership/admission is independent of the command's @1/@2 clock policy.
    // Use one monitored grant; a second raw check would bypass its ACK budget.
    record = confirmed;
    lease = observeRuntimeLease(maintenance, record, { onFailure: error => {
      leaseFailure = error;
      void settle().catch(cleanup => { error.cleanup_error ??= errorRecord(cleanup); }).finally(() => rejectCompleted(error));
    } });
    await lease.admission();
    child.stdin.on("error", () => {});
    // The policy bounds the productive command, not CLI owner admission.
    // The blocked gate remains subject to the retained scope's stop fence.
    armCommandTimeout();
    child.stdin.end(JSON.stringify({ command: item.command, args: item.args }));
    return await observe();
  } catch (error) { primary = error; throw error; }
  finally {
    try {
      let closingError;
      try { await lease?.close(); } catch (error) { closingError = error; }
      // Even uncertain renewal drain cannot leave the owned gate/command
      // running. Do not finalize its lease without successful closing proof.
      await settle();
      if (closingError) throw closingError;
      if (record) await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]);
    } catch (error) { if (primary) { primary.cleanup_error ??= errorRecord(error); throw primary; } throw error; }
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
      if (part.status !== 'passed' || part.policy_sha256 !== definition.sha256 || part.checkpoint_sha256 !== checkpoint.sha256 || JSON.stringify(part.checks?.map(item => item.id)) !== JSON.stringify(commands.map(item => item.id)) || part.checks.some(item => item.exit_code !== 0 || item.outcome !== 'passed' || item.cleanup !== 'settled')) fail('Split baseline commands incomplete', 'baseline_admission_unconfirmed');
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
  if (!["dd-eval/baseline-admission@1", "dd-eval/baseline-admission@2"].includes(receipt.schema_id) || receipt.schema_id.endsWith("@2") && (receipt.policy_schema_id !== "dd-eval/baseline-admission-policy@2" || receipt.checks?.some(check => check.timeout_kind !== "inactivity" || !Number.isInteger(check.inactivity_timeout_ms) || check.inactivity_timeout_ms < 1 || check.inactivity_timeout_ms > 600000 || check.cleanup !== "settled" || check.native_outcome !== "exited"))) fail("Retained baseline policy contract is invalid", "baseline_admission_unconfirmed");
  if (receipt.status !== "passed" || receipt.checkpoint_sha256 !== checkpoint.sha256 || receipt.checkpoint_id !== checkpoint.value.id || receipt.source_commit !== checkpoint.value.source.commit || receipt.policy_sha256 !== definition?.sha256 || !receipt.checks?.length || receipt.checks.some(check => check.exit_code !== 0 || check.outcome !== undefined && check.outcome !== "passed" || check.runner_evidence?.failure_projection !== undefined || check.runner_evidence_required && (!check.runner_evidence?.completed || check.runner_evidence.observation_unknown || check.runner_evidence.failures?.length !== 0 || check.runner_evidence.counts?.failed !== 0 || hashJson(check.runner_evidence.binding) !== hashJson(check.runner_binding)))) fail("Retained baseline admission does not qualify this execution", "baseline_admission_unconfirmed");
  return receipt;
}
