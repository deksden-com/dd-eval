import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { priorEvalOwners } from "../eval-retirement.mjs";
import { isInstalledFlow, installedProfileSelection as memoryProfileSelection } from "../installed-flows.mjs";
import { readBaselineAdmissionPolicy } from "../baseline-admission.mjs";
import { assertCheckpointEngine, assertCheckpointLaunchable } from "../engine-admission.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { assertFinalJudgeScope } from "../judge/final-judge-contract.mjs";
import { initialFlowBoundary, validateCaseBlueprint, materializeCaseStageSlice } from "../flow-boundaries.mjs";
import { qualifyWorkspaceHooks } from "../harness/workspace-hooks.mjs";
import { assertObservedProfile } from "../harness/driver-bindings.mjs";
import { prepareTaskInput, materializeTaskInput } from "../cases/task-input.mjs";
import { captureDefinitionIdentity } from "../cases/definition-identity.mjs";
import { callDriver } from "../harness/driver-call.mjs";
import { resolveRunContract } from "./run-contract-resolution.mjs";
import { runtimeEngineIdentity } from "./engine-snapshot.mjs";
import { provisionRuntimeEngine } from "./runtime-provision.mjs";
import { selectCaseExecutions, selectionNeedsEntryPack } from "./selection.mjs";
import { assertManagedContract } from "./managed-contract.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "./runtime-environment.mjs";
import { materializeExecutionContract, contractProfile, executionContextHash } from "../execution-contract.mjs";
import { assertProfileCapacity } from "./profile-capacity.mjs";
import { prepareDeclaredManagedTools } from "../cases/managed-tools.mjs";
import { prepareCaseManagedRun } from "../cases/managed-run.mjs";
import { prepareE2EInput } from "../cases/materialize-input.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { loadRunProfile } from "../cases/profile-loading.mjs";
import { assertHitlQualification } from "../hitl/qualification-inputs.mjs";
import { readJson } from "../json-file.mjs";
import { executionStages, interactionFixtureManifest, assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";
import { materializeOperationalDecision } from "../operational-decision.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Prepare and inspect an E2E execution without creating provider sessions. */
export async function evalPreflight({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile);
  if (memoryProfileSelection(runProfile.value.subject)?.delegation === 'native') throw Object.assign(new Error('Native preparation requires an authorized execution, not provider-free preflight'), { code: 'native_preparation_pending', details: { effect: 'no_effect', provider_sessions_created: 0 } });
  const loaded = await loadCase(runProfile.value.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  const definition = await captureDefinitionIdentity(loaded, runProfile);
  const executions = selectCaseExecutions(runProfile.value, loaded.value.flow);
  runProfile.executionContract = await resolveRunContract(runProfile, executionStages(executions, loaded.value.flow.contour), loaded);
  assertFinalJudgeScope({ profile: runProfile.value, executions, assessment: loaded.assessment });
  if (selectionNeedsEntryPack(executions)) fail("This preflight prepares E2E; focused entries use fixtures validate", "selection_invalid");
  const hitlQualification = await assertHitlQualification({ loaded, runProfile, definition });
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions, runProfile, flowContour: loaded.value.flow.contour });
  const profile = contractProfile(runProfile.executionContract, runProfile.value.subject.profile_id);
  assertProfileCapacity(profile, executions, runProfile.executionContract);
  const root = path.join(evalHome(), "conformance", "e2e-preflight", `${Date.now()}-${randomUUID().slice(0, 8)}`, runProfile.value.id);
  const projectRoot = path.join(root, "project"); const runtimeRoot = path.join(root, "dd-flow-home");
  await readBaselineAdmissionPolicy({ caseRoot: loaded.root, definition: loaded.value.baseline_admission });
  const blueprint = validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded);
  const initialStage = initialFlowBoundary(loaded).stage;
  const taskInputs = await prepareTaskInput(loaded.root, blueprint, initialStage, projectRoot);
  const profiles = runProfile.executionContract.admission_profile_ids.map(id => contractProfile(runProfile.executionContract, id));
  await mkdir(root, { recursive: true });
  try {
    const restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
    const engine = await provisionRuntimeEngine(projectRoot, runtimeRoot);
    await materializeExecutionContract(runtimeRoot, runProfile.executionContract);
    await assertCheckpointEngine(loaded.inputCheckpoint, engine, loaded.value.case_acceptance);
    const managedTools = await prepareDeclaredManagedTools({ checkpoint: loaded.inputCheckpoint, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot });
    const operational = await materializeOperationalDecision({ declaration: runProfile.value.operational_decision, projectRoot, runtimeRoot, evalId: `preflight:${runProfile.value.id}`, executionId: "e2e", commitOwnedProfile: true, flowId: initialFlowBoundary(loaded).flow });
    if (operational?.materialized_commit) restored.materialized_commit = operational.materialized_commit;
    const workspaceHooks = await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
    const baselineAdmission = { status: "not_run", policy_sha256: loaded.value.baseline_admission.sha256, reason: "Baseline runs in the actual execution workspace before Subject dispatch." };
    if (!isInstalledFlow(initialFlowBoundary(loaded).flow)) await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const executionRoutingFile = path.join(root, "execution-routing.json");
    await writeJsonAtomic(executionRoutingFile, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
    const prepared = await prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId: `preflight:${root}`, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, slug: "eval-preflight", executionRoutingFile });
    await assertManagedContract({ runtimeRoot, projectRoot, runId: prepared.run_id, contract: runProfile.executionContract });
    await materializeTaskInput(loaded.root, blueprint, initialStage, projectRoot, taskInputs);
    const contextFile = path.join(root, "stage-context.json");
    await materializeCaseStageSlice({ blueprint, stage: initialStage, roots: { project: projectRoot, workspace: restored.workspace_root }, output: contextFile }, loaded);
    const doctors = [];
    for (const checked of profiles) {
      const doctor = await callDriver(checked, ["doctor", "--cwd", projectRoot, "--model", checked.model, "--reasoning", checked.reasoning], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
      assertObservedProfile(doctor, checked, "preflight doctor"); doctors.push({ profile_id: checked.id, doctor });
    }
    await writeFile(path.join(root, "launcher.md"), "The managed controller owns Stage entry and supplies private context, integrity and response arguments directly to dd-flow. The Subject receives only the runtime-issued public lifecycle command.\n");
    const priorOwners = await priorEvalOwners({ caseId: loaded.value.id });
    const receipt = { ok: true, root, definition, profile_file: runProfile.file, prior_cleanup: priorOwners.map(item => ({ root: item.root, run_id: item.manifest.run_id, resource_home: item.manifest.runtime_resource_home, action: "retire_before_dispatch" })), execution_contract: runProfile.executionContract, interaction_fixtures: await interactionFixtureManifest(loaded.root, executions, null, loaded.value.flow.contour), stage_context_sha256: executionContextHash(blueprint, executionStages(executions, loaded.value.flow.contour)), input_checkpoint: loaded.inputCheckpoint.value, input_checkpoint_sha256: loaded.inputCheckpoint.sha256, engine: runtimeEngineIdentity(engine), baseline_admission: baselineAdmission, workspace_hooks: workspaceHooks, prepared_run: prepared, doctors, provider_sessions_created: 0, ...(hitlQualification ? { hitl_qualification: hitlQualification } : {}) };
    receipt.managed_tools = managedTools;
    await writeJsonAtomic(path.join(root, "receipt.json"), receipt); return receipt;
  } catch (error) { await writeJsonAtomic(path.join(root, "receipt.json"), { ok: false, root, definition, error: errorRecord(error) }); throw error; }
}

