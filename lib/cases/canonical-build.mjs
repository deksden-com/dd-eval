import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { assertCheckpointEngine, assertCheckpointLaunchable } from "../engine-admission.mjs";
import { initialFlowBoundary, validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { selectCheckResources } from "../check-resources.mjs";
import { runBaselineAdmission } from "../baseline-admission.mjs";
import { materializeExecutionContract, contractProfile } from "../execution-contract.mjs";
import { evalHome, runtimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { resolveRunContract } from "../execution/run-contract-resolution.mjs";
import { interactionFixtureManifest } from "../hitl/interaction-fixtures.mjs";
import { qualifyWorkspaceHooks } from "../harness/workspace-hooks.mjs";
import { loadRunProfile } from "./profile-loading.mjs";
import { loadCase } from "./load-case.mjs";
import { canonicalSourcePreflight, prepareCanonicalFlowSource } from "./source-validation.mjs";
import { definitionSelection, loadedDefinitionInputs, committedDefinitionIdentity } from "./definition-identity.mjs";
import { materializeCanonicalInput } from "./materialize-input.mjs";
import { nextRevision, writeCanonicalState, canonicalEntry, canonicalLocator, manifestHash } from "./canonical-state.mjs";
import { captureEngineSnapshot } from "../execution/engine-snapshot.mjs";
import { isInstalledFlow } from "../installed-flows.mjs";
import { setupMemoryFlowRuntime } from "../memory-runtime-setup.mjs";
import { commandJson } from "../process-json.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Build a canonical reference from verified project, flow and runtime inputs. */
export async function canonicalBuild({ profileFile, projectRoot, flowRoot }) {
  const profile = await loadRunProfile(profileFile); const loaded = await loadCase(profile.value.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  const source = path.join(loaded.root, "entry-pack-source"); const blueprint = validateCaseBlueprint(await readJson(path.join(source, "stage-context.json")), loaded);
  if (!projectRoot || !path.isAbsolute(projectRoot) || !(await exists(projectRoot))) fail("canonical build requires an existing absolute --project-root", "canonical_source_required");
  const flowId = initialFlowBoundary(loaded).flow;
  const sourcePreflight = await canonicalSourcePreflight(path.resolve(projectRoot), loaded.inputCheckpoint, loaded.value.flow);
  const flowSource = await prepareCanonicalFlowSource(flowRoot ? path.resolve(flowRoot) : null, loaded.inputCheckpoint, flowId);
  // A canonical chain is evidence for one immutable eval definition.  Building
  // it from local edits would make the recorded input checkpoint insufficient
  // to reproduce the observed behavior.
  const definition = await committedDefinitionIdentity(repoRoot, await definitionSelection(loaded, profile), loadedDefinitionInputs(loaded, profile));
  const home = evalHome(); const canonicalRoot = path.join(home, "canonical", loaded.value.id); const revision = nextRevision(await readdir(canonicalRoot, { withFileTypes: true }).then((list) => list.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).catch(() => []));
  const root = path.join(canonicalRoot, revision); await mkdir(root, { recursive: true }); const events = path.join(root, "build", "events.jsonl");
  try {
    const materializedInput = await materializeCanonicalInput({ root, sourceProjectRoot: path.resolve(projectRoot), flowSource, inputCheckpoint: loaded.inputCheckpoint, flowId, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
    profile.executionContract = await resolveRunContract(profile, loaded.value.flow.contour, loaded);
    const subjectProfile = contractProfile(profile.executionContract, profile.value.subject.profile_id);
    const hookRuntime = path.join(root, "bootstrap-dd-flow-home");
    await assertCheckpointEngine(loaded.inputCheckpoint, await provisionRuntimeEngine(materializedInput.project_root, hookRuntime), loaded.value.case_acceptance);
    if (subjectProfile.harness === "antigravity-cli" || profile.value.subject.execution) {
      await materializeExecutionContract(hookRuntime, profile.executionContract);
      await qualifyWorkspaceHooks(subjectProfile, materializedInput.project_root, hookRuntime, { install: true, execution: profile.value.subject.execution });
    }
    const checkResources = selectCheckResources(runtimeEnv(hookRuntime).DD_FLOW_RESOURCE_HOME);
    const baselineAdmission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot: materializedInput.project_root, outputRoot: path.join(root, "baseline-admission"), checkpoint: loaded.inputCheckpoint,
      engineRuntime: { bin: runtimeBin(hookRuntime), home: hookRuntime }, checkResources });
    await writeJsonAtomic(path.join(root, "stage-context.json"), blueprint);
    const bootstrap = await createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot: materializedInput.project_root, runProfile: profile });
    const interactionFixtures = await interactionFixtureManifest(loaded.root, [{ stage: loaded.value.flow.contour[0], terminal_stage: loaded.value.flow.terminal_stage }], null, loaded.value.flow.contour);
    const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "awaiting_reference_resume", profile: profile.value.id, profile_file: profile.file, source_project_root: path.resolve(projectRoot), source_preflight: sourcePreflight, definition, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256, file: loaded.inputCheckpoint.file, value: loaded.inputCheckpoint.value }, materialized_input: materializedInput, baseline_admission: baselineAdmission, engine: bootstrap.engine, blueprint_sha256: hashJson(blueprint), current_stage: bootstrap.entry.stage, reference: { session_id: null, daemon_state: null, run_id: null }, entries: { [bootstrap.entry.stage]: `entries/${bootstrap.entry.stage}.json` }, created_at: now() };
    state.reference.execution_contract = profile.executionContract;
    state.check_resources = checkResources;
    state.reference = { ...state.reference, run_profile: profile.value, coverage_policy: profile.coveragePolicy ?? null,
      coverage_policy_sha256: hashJson(profile.coveragePolicy ?? null), semantic_dependency_sha256: profile.semanticFingerprint ?? null };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.canonical.planned", data: { state: state.status, entry: bootstrap.entry } });
    return { ...state, build: root, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** Create a canonical bootstrap snapshot in a temporary isolated runtime. */
async function createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot, runProfile }) {
  const initial = initialFlowBoundary(loaded);
  const snapshotRoot = path.join(root, "stages", initial.stage, "bootstrap");
  const transientHome = path.join(root, "bootstrap-dd-flow-home");
  try {
    const selected = await provisionRuntimeEngine(sourceProjectRoot, transientHome);
    await assertCheckpointEngine(loaded.inputCheckpoint, selected, loaded.value.case_acceptance);
    if (isInstalledFlow(initial.flow)) await setupMemoryFlowRuntime(initial.flow,{ bin: runtimeBin(transientHome), env: runtimeEnv(transientHome), projectRoot: sourceProjectRoot,
      runtimeRoot: transientHome, declaration: runProfile.value.subject.memory_setup, checkpoint: loaded.inputCheckpoint.value, requestId: `setup-${sha256(root)}` });
    const engine = await captureEngineSnapshot({ root, home, selected });
    await commandJson("dd-flow", ["run", "snapshot", "bootstrap", "create", "--project-root", sourceProjectRoot, "--output", snapshotRoot, ...(initial.flow === "sdlc" ? [] : ["--flow", initial.flow])], { cwd: sourceProjectRoot, env: runtimeEnv(transientHome) });
    const snapshot = { kind: "bootstrap", locator: canonicalLocator(home, snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "bootstrap.json")), run_id: null };
    const entry = canonicalEntry({ caseId: loaded.value.id, revision, stage: initial.stage, snapshot, blueprint, flowContour: loaded.value.flow.contour });
    await writeJsonAtomic(path.join(root, "entries", `${initial.stage}.json`), entry);
    return { entry, engine };
  }
  finally { await rm(transientHome, { recursive: true, force: true }); }
}
