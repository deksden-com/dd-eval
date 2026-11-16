import { homesFile, registerRunHome, registryEnvironment } from "./homes.mjs";
import { browserCapabilitySource } from "./browser-capabilities.mjs";
import { withPriorEvalRetirement, cleanupSidecars, priorEvalOwners, retirementEligible, cleanupInventory, prepareLaunchResources } from "./eval-retirement.mjs";
import { protocolizeMaterializationEvidence } from "./materialization-evidence.mjs";
import { prepareQualificationOwner, finishQualificationOwner, qualificationProbeEnvironment } from "./qualification-owner.mjs";
import { causalNodes, verifyCapturedNativeFailure } from "./native-failure-evidence.mjs";
import { isInfrastructureFailure } from "./evidence/failure-classification.mjs";
export { classifyInterruption, isInfrastructureFailure } from "./evidence/failure-classification.mjs";
import { executionCleanupPending } from "./recovery/execution-cleanup.mjs";
import { captureRecoveryEvidence, failureCaptureState } from "./recovery/capture-evidence.mjs";
export { captureRecoveryEvidence } from "./recovery/capture-evidence.mjs";
import { hasRetainedRetirementProof, resolveRetiredTechnicalNotes } from "./recovery/cleanup-observation.mjs";
export { scopeResourcesPending, resolveRetiredTechnicalNotes, statusCleanupState, projectStoppedControl } from "./recovery/cleanup-observation.mjs";
import { executionSnapshotBinding } from "./recovery/snapshot-observation.mjs";
import { selectRecoverySource, recoverySourceFromEvents, recoveryOperationId } from "./recovery/recovery-source.mjs";
export { selectRecoverySource, recoverySourceFromEvents, recoveryOperationId } from "./recovery/recovery-source.mjs";
import { verifySnapshot } from './recovery/entry-snapshot.mjs';
import { restoreStageSnapshot } from './recovery/stage-restore.mjs';
export { restoreStageSnapshot } from './recovery/stage-restore.mjs';
import { assertExecutionEngine } from './recovery/fork-inputs.mjs';
export { runnerCheckpoints, assertExecutionEngine } from './recovery/fork-inputs.mjs';
import { isStageRunSnapshot } from './recovery/snapshot-version.mjs';
export { verifySnapshot } from './recovery/entry-snapshot.mjs';
import { isInstalledFlow, installedProfileSelection as memoryProfileSelection } from './installed-flows.mjs';
import { observedCompletionScope, assertCompletionScopes, projectRunCompletion, reportSchemaFor, isTerminalRunState } from "./completion-scope.mjs";
import { readBaselineAdmissionPolicy, runBaselineAdmission, verifyBaselineAdmission } from "./baseline-admission.mjs";
import { enrichFailureEvidence } from "./evidence/failure-enrichment.mjs";
export { enrichFailureEvidence } from "./evidence/failure-enrichment.mjs";
export { failureDiagnostic } from "./evidence/failure-diagnostic.mjs";
import { selectCheckResources, checkResourceEnvironment } from "./check-resources.mjs";
import { assertCheckpointEngine, assertCheckpointLaunchable, verifyEngineArtifact } from "./engine-admission.mjs";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, lstat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, canonicalJson, completeOperation, hashJson, readEvents, recordControllerEvent, recordOperation, recordOperationError, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { stages, validateEntry as validateStageEntry } from "./entry-pack.mjs";
import { commandJson, commandText } from "./process-json.mjs";
import { validateObservationDuration } from "./observation-clock.mjs";
import { isObservationLoss, isManagedWait, isConclusiveManagedFailure, isConclusiveHitlFailure, errorRecord } from "./operation-errors.mjs";
import { promptJudgeWithCapacity } from "./judge-capacity.mjs";
import { loadCapacityPolicy, loadNativeContracts } from "./capacity-policy.mjs";
import { assertJudgeCleanup, assertJudgeVerdict, observeJudgeCleanup, finishJudgeCleanup } from "./judge-cleanup.mjs";
import { technicalNotes, recordTechnicalNote, publishSubjectTechnicalNotes } from './technical-notes.mjs';
export { publishSubjectTechnicalNotes, projectSubjectTechnicalNotes } from './technical-notes.mjs';
import { reconcileQualificationPreparation } from "./qualification-recovery.mjs";
import { prepareSupplementalJudge, assertSupplementalEvidence, validateJudgeSupplement, supplementalEngineIdentity } from "./judge-supplement.mjs";
import { inspectDaemonOperation } from "./daemon-operations.mjs";
import { recoveryHistory, reportMarkdown, buildEvidencePacket, buildReport, failureEvidenceRevision } from "./evidence/report-projections.mjs";
export { interactionCoverageSummary, recoveryHistory, reportMarkdown, executionEvidence, failureAttribution, buildEvidencePacket, buildReport, failureEvidenceRevision } from "./evidence/report-projections.mjs";
import { validateJudgeResult, finalJudgeScope, assertFinalJudgeScope, finalJudgePrompt } from "./judge/final-judge-contract.mjs";
export { validateJudgeResult, finalJudgeScope, assertFinalJudgeScope, finalJudgePrompt } from "./judge/final-judge-contract.mjs";
import { judgeTurnText, assertJudgeProfileBinding, parseJsonResponse, judgeExecutionArgs } from "./judge/judge-receipt.mjs";
import { judgeHarnessRoots, frozenJudgeProfile, judgeRuntimeEnvironment } from "./judge/runtime-binding.mjs";
export { judgeRuntimeEnvironment } from "./judge/runtime-binding.mjs";
export { judgeTurnText, assertJudgeProfileBinding } from "./judge/judge-receipt.mjs";
import { operationContext } from "./operation-context.mjs";
import { validateEntryPack, flowStageCatalog, inheritedFlowStages, initialFlowBoundary, validateCaseBlueprint, materializeCaseStageSlice, continuationStage } from "./flow-boundaries.mjs";
export { validateEntryPack, inheritedFlowStages, initialFlowBoundary, validateCaseBlueprint, materializeCaseStageSlice, continuationStage } from "./flow-boundaries.mjs";
import { validateHarnessProfile, nativeOnlyRunProfile, validateRunProfile } from "./profile-validation.mjs";
export { validateHarnessProfile, nativeOnlyRunProfile, validateRunProfile } from "./profile-validation.mjs";
import { reconcileDriverReplies, recoverDriverReply, driverObservationClock } from "./driver-recovery.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { withSleepInhibitor } from "./sleep-inhibitor.mjs";
import { resolveEvidenceJournals } from "./evidence/evidence-journals.mjs";
import { attachModelAttribution } from "./evidence/execution-conformance.mjs";
export { executionConformance } from "./evidence/execution-conformance.mjs";
export { resolveEvidenceJournals } from "./evidence/evidence-journals.mjs";
import { modelProgressPump } from "./harness/model-progress.mjs";
import { provisionCapacityCodexHome } from "./harness/capacity-codex-home.mjs";
import { prepareRuntimeHarnessConfig, initializeCodexHome } from "./harness/runtime-setup.mjs";
import { boundedCapacityContinuation, qualifiedCapacityProbe } from "./harness/capacity-qualification.mjs";
export { boundedCapacityContinuation, qualifiedCapacityProbe } from "./harness/capacity-qualification.mjs";
import { candidateMatches, freezeCandidateLocked, subjectHistoryEvents } from "./evidence/run-candidate.mjs";
export { buildRunCandidate, frozenCandidate, subjectHistoryEvents } from "./evidence/run-candidate.mjs";
import { latestObservedStage } from "./evidence/stage-attribution.mjs";
export { latestObservedStage, failureStageAttribution } from "./evidence/stage-attribution.mjs";
import { driverFor, assertObservedProfile, assertObservedRuntime, driverProfileArgs, driverRuntimeArgs, harnessConfigKey, driverAdapterInvocation, assertTargetSession, argValue, boundedPromptArgs } from "./harness/driver-bindings.mjs";
export { assertObservedProfile, assertObservedRuntime, driverProfileArgs, driverRuntimeArgs, driverAdapterInvocation, assertTargetSession, boundedPromptArgs } from "./harness/driver-bindings.mjs";
import { snapshotTreeHash } from "./recovery/snapshot-tree.mjs";
import { ignoreEvalLocalState, prepareTaskInput, materializeTaskInput } from "./cases/task-input.mjs";
export { prepareTaskInput, materializeTaskInput } from "./cases/task-input.mjs";
import { definitionSelection, loadedDefinitionInputs, committedDefinitionIdentity, assertRetainedRunDefinition } from "./cases/definition-identity.mjs";
export { definitionSelection, committedDefinitionIdentity, assertRetainedRunDefinition } from "./cases/definition-identity.mjs";
import { relative, contained } from "./contained-path.mjs";
import { selectedEntries, qualificationTargets, assertQualificationSelection, prepareQualificationCell, recordQualificationCell, qualificationCoverage, writeQualificationSummary } from "./cases/canonical-qualification.mjs";
export { selectedEntries, assertQualificationSelection } from "./cases/canonical-qualification.mjs";
import { directNativeChildren, capacityCodexChildren } from "./harness/native-children.mjs";
export { directNativeChildren, capacityCodexChildren } from "./harness/native-children.mjs";
import { cancelOwnedDaemon } from "./daemon-control.mjs";
import { executionState } from "./execution/execution-state.mjs";
import { validateControlManifest } from "./execution/control-request.mjs";
export { runnerControlRequest } from "./execution/control-request.mjs";
export { runnerControlReconcile } from "./execution/control-reconcile.mjs";
export { runnerControlResume } from "./execution/control-resume.mjs";
export { runnerControlStatus } from "./execution/control-status.mjs";
import { profileConfigHome, resolveRunContract } from "./execution/run-contract-resolution.mjs";
import { executionDispatchBarrier, withExecutionAdmissionSignal } from "./execution/dispatch-barrier.mjs";
export { executionDispatchBarrier, withExecutionAdmissionSignal } from "./execution/dispatch-barrier.mjs";
import { terminalExecution, infrastructureQueueStopped, cancelInfrastructureQueue } from "./execution/infrastructure-stop.mjs";
import { reconcileFlow, collectFlowStatistics } from "./execution/flow-observation.mjs";
import { engineTarget, runtimeEngineIdentity, verifyEngineSnapshot, captureEngineSnapshot, materializeEngineArtifact, retainedEngineArtifacts, inheritedForkEngine } from "./execution/engine-snapshot.mjs";
import { installRuntimeShim } from "./execution/runtime-shim.mjs";
import { provisionRuntimeEngine } from "./execution/runtime-provision.mjs";
export { provisionRuntimeEngine } from "./execution/runtime-provision.mjs";
export { installRuntimeShim } from "./execution/runtime-shim.mjs";
import { assertTerminalReconciliation, managedCompletionEvidence, publishExecutionStatistics } from "./execution/completion-evidence.mjs";
export { assertTerminalReconciliation, managedCompletionEvidence, publishExecutionStatistics } from "./execution/completion-evidence.mjs";
import { selectionNeedsEntryPack, prepareFocusedEntries, validateExecutionDescriptorShape, validateExecutionDescriptors } from "./execution/selection.mjs";
export { selectionNeedsEntryPack, prepareFocusedEntries, validateExecutionDescriptors } from "./execution/selection.mjs";
import { assertManagedContract } from "./execution/managed-contract.mjs";
import { evalHome, evalRuntimeEnv, runtimeBin, runtimeEnv } from "./execution/runtime-environment.mjs";
export { evalHome, evalRuntimeEnv } from "./execution/runtime-environment.mjs";
import { restoredRoots, stageRecord } from "./execution/flow-status.mjs";
export { restoredRoots, stageSessionMode } from "./execution/flow-status.mjs";
import { appendRunEventOnce, storedExecutionResults, runResultRevision, terminalOperation, subjectSessionFor, preparedContextFor } from "./execution/result-projection.mjs";
export { appendRunEventOnce, storedExecutionResults, runResultRevision } from "./execution/result-projection.mjs";
import { assertEvalAdmission, assertEvalExecutionDispatch, validateControlResumeInput } from "./execution/admission.mjs";
export { assertEvalExecutionDispatch, validateControlResumeInput, assertControlResumeSource } from "./execution/admission.mjs";
import { observeManagedRun } from "./managed-flow-client.mjs";
import { loadDelegationInstructions } from "./delegation-instructions.mjs";
import { resolveExecutionContract, validateExecutionContract, materializeExecutionContract, contractProfile, profileSemanticHash, assertExpectedExecutionInputs, executionContextHash } from "./execution-contract.mjs";
import { qualifiedNativeFanoutCapacity, qualifiedCoordinator, assertProfileCapacity } from "./execution/profile-capacity.mjs";
export { qualifiedNativeFanoutCapacity, qualifiedCoordinator, assertProfileCapacity } from "./execution/profile-capacity.mjs";
import { mapLimited, createHarnessPermits, executionBudget } from "./execution/execution-scheduling.mjs";
export { Semaphore, createHarnessPermits, executionBudget } from "./execution/execution-scheduling.mjs";
import { attachCaseAcceptance } from "./cases/acceptance-receipts.mjs";
import { prepareDeclaredManagedTools } from "./cases/managed-tools.mjs";
export { declaredManagedTools, prepareDeclaredManagedTools } from "./cases/managed-tools.mjs";
import { nextRevision, canonicalLocator, manifestHash, writeCanonicalState, canonicalEntry } from "./cases/canonical-state.mjs";
import { canonicalSourcePreflight, prepareCanonicalFlowSource } from "./cases/source-validation.mjs";
export { assertSourceTag, assertBlankMemoryProject, assertProjectFlowPack, prepareCanonicalFlowSource } from "./cases/source-validation.mjs";
import { fixturesValidate } from "./cases/fixture-validation.mjs";
import { createBootstrapEntry } from "./cases/canonical-bootstrap.mjs";
import { prepareCaseManagedRun } from "./cases/managed-run.mjs";
export { prepareCaseManagedRun } from "./cases/managed-run.mjs";
import { canonicalEntries, canonicalCandidatePack } from "./cases/canonical-pack.mjs";
export { canonicalEntries } from "./cases/canonical-pack.mjs";
import { canonicalState, assertCanonicalDefinition, canonicalResumeLock } from "./cases/canonical-recovery.mjs";
export { migrateLegacyCanonicalResumeLock } from "./cases/canonical-recovery.mjs";
import { materializeCanonicalInput, prepareE2EInput } from "./cases/materialize-input.mjs";
export { materializeCanonicalInput, prepareE2EInput } from "./cases/materialize-input.mjs";
import { runnerEntry } from "./cases/runner-entry.mjs";
export { fixturesValidate } from "./cases/fixture-validation.mjs";
import { loadCase } from "./cases/load-case.mjs";
export { loadCase } from "./cases/load-case.mjs";
import { loadProfile, loadRunProfile, retainedRunProfile } from "./cases/profile-loading.mjs";
export { loadProfile, loadRunProfile } from "./cases/profile-loading.mjs";
import { hitlQualificationHome } from "./hitl/qualification-home.mjs";
import { qualifyCoverageFilter } from "./hitl/coverage-qualification.mjs";
export { qualifyCoverageFilter } from "./hitl/coverage-qualification.mjs";
import { reassessHitlQualification } from "./hitl/qualification-reassessment.mjs";
export { reassessHitlQualification } from "./hitl/qualification-reassessment.mjs";
import { hitlQualificationInputs, assertHitlQualification } from "./hitl/qualification-inputs.mjs";
export { hitlQualificationInputs, assertHitlQualification } from "./hitl/qualification-inputs.mjs";
import { hitlQualificationContract, qualificationComparison, qualificationMismatch } from "./hitl/qualification-contract.mjs";
import { interactionJudgePrompt, retainedJudgeChain, retainedCoverageFilter, qualificationSample } from "./hitl/judge-retained.mjs";
export { interactionJudgePrompt, retainedCoverageFilter } from "./hitl/judge-retained.mjs";
import { hitlMatchContract, hitlCoverageContract, hitlCoveragePacketContract, buildHitlPacket, validateHitlPacket, validateGroundedHitl } from "./hitl-contract.mjs";
import { assertCoveragePolicy, observeJev, jevCoveredVerdict, verifyJevReceipt } from "./hitl-coverage.mjs";
import { validateSemanticConfig, semanticFingerprint, semanticQuestion, semanticMetrics, observeSemantic, markSemanticFallback, semanticFastPathAnswer, verifySemanticReceipt } from "./semantic-decisions.mjs";
import { materializeQualificationContext } from "./hitl/qualification-context.mjs";
export { materializeQualificationContext } from "./hitl/qualification-context.mjs";
import { verifyRetainedHitl, hitlEvidenceFor, mergeRetainedHitl } from "./hitl/hitl-retained.mjs";
import { readRegularFile } from "./regular-file.mjs";
import { readJson, parseJsonBytes } from "./json-file.mjs";
export { readJson } from "./json-file.mjs";
import { interactionFixture, interactiveInputKind, authorizeHitl, executionStages, interactionFixtureManifest, fixtureHash } from "./hitl/interaction-fixtures.mjs";
export { interactiveInputKind, authorizeHitl, interactionFixtureManifest } from "./hitl/interaction-fixtures.mjs";
import { resolveHitlJudgment, hitlResponseDelimiter } from "./hitl/resolve-judgment.mjs";
export { resolveHitlJudgment } from "./hitl/resolve-judgment.mjs";
import { materializeHitlAnswer, acceptedHitlAnswer, hitlProof } from "./hitl/answer-evidence.mjs";
export { hitlProof } from "./hitl/answer-evidence.mjs";
import { interactionCleanupPending } from "./hitl/interaction-cleanup.mjs";
export { interactionCleanupPending } from "./hitl/interaction-cleanup.mjs";
import { materializeOperationalDecision } from "./operational-decision.mjs";
export { readRegularFile } from "./regular-file.mjs";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
export async function admitContractProfiles(contract, projectRoot, runtimeRoot) {
  const doctors = [];
  for (const id of contract.admission_profile_ids) {
    const checked = contractProfile(contract, id);
    const doctor = await callDriver(checked, ["doctor", "--cwd", projectRoot, "--model", checked.model, "--reasoning", checked.reasoning], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    assertObservedProfile(doctor, checked, "execution contract doctor");
    doctors.push({ profile_id: id, profile_sha256: contract.profile_sha256[id], doctor });
  }
  return doctors;
}



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

export async function canonicalResume({ buildRoot, detachTurns = false }) {
  const root = path.resolve(buildRoot);
  return await canonicalResumeLock(root, async () => await canonicalResumeUnlocked({ buildRoot: root, detachTurns }));
}

async function canonicalResumeUnlocked({ buildRoot, detachTurns = false }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  await verifyBaselineAdmission({ reference: state.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: state.check_resources, projectRoot: state.materialized_input?.project_root });
  const retainedEngine = await verifyEngineSnapshot(evalHome(), state.engine);
  await assertCheckpointEngine(loaded.inputCheckpoint, { ...retainedEngine.manifest, snapshot_root: retainedEngine.root }, loaded.value.case_acceptance);
  if (state.status !== "awaiting_reference_resume") fail(`canonical build is ${state.status}, not awaiting reference resume`, "canonical_transition_invalid");
  if (state.reference.session_id && !state.reference.managed) fail("Legacy reference Sessions require explicit migration before managed continuation", "reference_migration_required");
  const retainedProfile = state.reference.run_profile ?? state.reference.coverage_profile;
  const runProfile = retainedProfile ? { file: state.profile_file, value: retainedProfile, coveragePolicy: state.reference.coverage_policy ?? null, semanticFingerprint: state.reference.semantic_dependency_sha256 ?? null } : await loadRunProfile(state.profile_file);
  const attempt = path.join(root, "reference"), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  if (runProfile.coveragePolicy && state.reference.coverage_policy_sha256 && hashJson(runProfile.coveragePolicy) !== state.reference.coverage_policy_sha256) fail("Reference coverage policy changed", "coverage_policy_invalid");
  runProfile.executionContract = state.reference.execution_contract ?? (state.reference.run_id ? null : await resolveRunContract(runProfile, loaded.value.flow.contour, loaded));
  let profile;
  if (runProfile.executionContract) profile = contractProfile(runProfile.executionContract, runProfile.value.subject.profile_id);
  else {
    const retained = await commandJson(runtimeBin(runtimeRoot), ["run", "status", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const snapshot = retained.index?.execution_profile;
    const effective = snapshot?.agent_profiles?.[snapshot.settings?.execution?.agent_profile_id];
    if (!effective?.model || !effective.reasoning || !effective.harness) fail("Legacy reference has no frozen Subject profile evidence", "execution_contract_missing");
    profile = { ...effective, harness: harnessConfigKey(effective.harness) };
  }
  const stage = state.current_stage;
  const entry = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage, flowStageCatalog(loaded.value.flow.contour));
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [{ stage, terminal_stage: stage }], runProfile, flowContour: loaded.value?.flow?.contour ?? stages });
  const events = path.join(root, "build", "events.jsonl");
  const save = async (type, data) => writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type, data });
  if (!state.reference.run_id) {
    state.reference.execution_contract = runProfile.executionContract;
    await save("dev.dd.eval.reference.profiles_frozen", { execution_contract_sha256: runProfile.executionContract.semantic_sha256 });
    const routing = path.join(attempt, "execution-routing.json");
    await writeJsonAtomic(routing, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
    const restored = await restoreStageSnapshot({ home: evalHome(), entry, stage, projectRoot, runtimeRoot, authoringEngine: state.engine, executionRoutingFile: routing, executionContract: runProfile.executionContract,flowId:initialFlowBoundary(loaded).flow });
    await materializeExecutionContract(runtimeRoot, runProfile.executionContract);
    await admitContractProfiles(runProfile.executionContract, projectRoot, runtimeRoot);
    await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
    let runId = restored.run_id;
    if (!runId) {
      const prepared = await prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId: `reference:${root}`, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot, checkResourceEnvironment(state.check_resources)), projectRoot, slug: "reference-subject", executionRoutingFile: routing });
      runId = prepared.run_id;
    }
    if (typeof runId !== "string") fail("Reference preparation omitted its logical RUN", "controller_receipt_invalid");
    state.reference = { ...state.reference, run_profile: runProfile.value, execution_contract: runProfile.executionContract, managed: true, run_id: runId, contexts: {}, answered_pauses: {},
      ...(runProfile.value.interaction_judge?.verdict_contract === hitlCoverageContract ? { coverage_profile: runProfile.value, coverage_policy: runProfile.coveragePolicy ?? null, coverage_policy_sha256: hashJson(runProfile.coveragePolicy ?? null), semantic_dependency_sha256: runProfile.semanticFingerprint ?? null } : {}) };
    await save("dev.dd.eval.reference.run_prepared", { stage, run_id: runId });
  }
  if (!state.reference.managed) fail("Legacy reference RUN requires explicit migration", "reference_migration_required");
  await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { execution: runProfile.value.subject.execution });
  const runId = state.reference.run_id;
  await assertManagedContract({ runtimeRoot, projectRoot, runId, contract: runProfile.executionContract });
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  await assertCheckpointEngine(loaded.inputCheckpoint, resolved.selection?.selected, loaded.value.case_acceptance);
  const contextFor = async (requested, attemptNumber = 1) => {
    if (requested !== stage) return null;
    const key = `${requested}:${attemptNumber ?? 1}`;
    const prior = state.reference.contexts?.[key];
    if (prior) {
      if (sha256(await readFile(prior.file)) !== prior.sha256) fail("Retained reference context changed", "context_checksum_mismatch");
      return prior;
    }
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", runId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    const capacityProfile = selected?.delegation?.mode === "native" ? qualifiedCoordinator(selected.coordinator, runProfile.executionContract, profile) : profile;
    const nativeCapacity = qualifiedNativeFanoutCapacity(requested, selected, capacityProfile, loaded.value.flow.contour);
    if (nativeCapacity !== null) await recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots: nativeCapacity });
    await materializeTaskInput(loaded.root, blueprint, requested, projectRoot);
    const file = path.join(attempt, "stage-context", `${requested}-${attemptNumber ?? 1}.json`);
    const slice = await materializeCaseStageSlice({ blueprint, stage: requested, roots: restoredRoots({ status }, projectRoot, runtimeRoot), output: file }, loaded);
    const reference = { file, sha256: sha256(await readFile(file)), slice };
    state.reference.contexts = { ...state.reference.contexts, [key]: reference };
    await save("dev.dd.eval.reference.context_prepared", { stage: requested, attempt: attemptNumber, context_file: file, materialized_context_sha256: reference.sha256, ...slice });
    return reference;
  };
  const first = await contextFor(stage);
  if (!state.reference.context_package) {
    const file = path.join(attempt, "managed-context.json");
    await writeJsonAtomic(file, { schema_id: "dd-flow/managed-context@1", stages: { [stage]: { file: first.file, sha256: first.sha256 } } });
    state.reference.context_package = file;
    await save("dev.dd.eval.reference.launch_prepared", { run_id: runId, context_package: file });
  }
  const answerFor = async (record, _run, controller) => {
    const pause = record.pause;
    const prior = state.reference.answered_pauses?.[pause.id];
    if (prior) {
      if (prior.receipt_file) await verifyRetainedHitl({ data: prior, expectedStage: record.stage, expectedPauseId: pause.id, expectedScope: `reference:${sha256(root)}`, expectedProfileSha256: runProfile.executionContract?.profile_sha256?.[runProfile.executionContract.roles.interaction_judge] ?? null, legacy: !prior.verdict_contract });
      else await acceptedHitlAnswer({ answerFile: prior.answer_file, answerSha256: prior.answer_sha256 }); // Historical reference journals lacked Judge proof references.
      return prior.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, record.stage, state.interaction_fixtures?.[record.stage]?.interaction_fixture_sha256);
    const rounds = Object.values(state.reference.answered_pauses ?? {}).filter(item => item.stage === record.stage).length;
    const question = await authorizeHitl({ fixture, stage: record.stage, pause, rounds });
    const context = await contextFor(record.stage, record.attempt);
    if (!context) fail("Reference HITL crossed its unapproved boundary", "reference_boundary_unapproved");
    const judged = await interactionJudge({ runProfile, fixture, question, attempt, stage: record.stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: context.file, controller, hitlBinding: { stage: record.stage, pause_id: pause.id, round: rounds + 1, scope_id: `reference:${sha256(root)}` } });
    const proof = await hitlProof(judged, `reference:${sha256(root)}`);
    const exchange = resolveHitlJudgment({ fixture, judgment: { ...judged, proof }, question, stage: record.stage });
    const answerFile = await materializeHitlAnswer({ attempt, stage: record.stage, round: rounds + 1, answer: exchange.answer });
    const evidence = { stage: record.stage, round: rounds + 1, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: sha256(exchange.answer), pause_id: pause.id, ...proof };
    state.reference.answered_pauses = { ...state.reference.answered_pauses, [pause.id]: evidence };
    await save("dev.dd.eval.reference.hitl.matched", { ...evidence, pause_id: pause.id, judge_session_id: judged.session_id, receipt_file: judged.receipt_file });
    return answerFile;
  };
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot, checkResourceEnvironment(state.check_resources)), projectRoot, runId,
    requestId: `reference:${sha256(root)}`, controllerId: state.reference.controller_id,
    contextFile: state.reference.context_package, stopAfter: loaded.value.flow.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor, observeOnce: detachTurns,
    beforeDispatch: () => assertManagedContract({ runtimeRoot, projectRoot, runId, contract: runProfile.executionContract }),
    onEvent: async (event, controller) => {
      state.reference.controller_id = controller.controller_id;
      state.reference.session_id = controller.sessions.at(-1)?.session_id ?? null;
      if (event.sequence > (state.reference.event_cursor ?? 0)) {
        state.reference.event_cursor = event.sequence;
        await save("dev.dd.eval.reference.controller_event", { controller_id: controller.controller_id, ...event });
      }
    }
  });
  state.reference.controller_id = observed.controller.controller_id;
  state.reference.session_id = observed.controller.sessions.at(-1)?.session_id ?? null;
  if (observed.boundary?.stage !== stage) {
    if (!detachTurns) fail("Reference controller did not capture its review boundary", "stage_boundary_incomplete");
    await save("dev.dd.eval.reference.observing", { stage, controller_id: observed.controller.controller_id });
    return { build: root, state, next: { kind: "wait_reference_turn", stage, controller_id: observed.controller.controller_id } };
  }
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId });
  if (lifecycle.stage_status !== "done" || sha256(await readFile(observed.boundary.manifest)) !== observed.boundary.manifest_sha256) fail("Reference capture does not match a completed stage", "stage_boundary_incomplete");
  const fixture = await interactionFixture(loaded.root, stage, state.interaction_fixtures?.[stage]?.interaction_fixture_sha256);
  if (fixture.mode === "required" && !Object.values(state.reference.answered_pauses ?? {}).some(item => item.stage === stage)) fail(`required HITL did not occur at ${stage}`, "required_hitl_missing");
  state.reference.boundary = observed.boundary;
  state.status = "waiting_for_reference_review";
  state.completed_stage = stage;
  state.context_receipt = { semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256 };
  await save("dev.dd.eval.reference.stage_done", { stage, run_id: runId, controller_id: observed.controller.controller_id, boundary: observed.boundary });
  return { build: root, state, lifecycle, next: { kind: "reference_review", message: `Review ${stage}, then run canonical boundary accept.` } };
}

export async function canonicalBoundaryAccept({ buildRoot, stage, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (state.status !== "waiting_for_reference_review" || state.completed_stage !== stage || state.current_stage !== stage) fail("canonical build is not waiting for this stage review", "canonical_transition_invalid");
  const review = path.resolve(reviewFile), reviewBytes = await readRegularFile(review);
  if (!reviewBytes.toString("utf8").trim()) fail("canonical boundary review must be a non-empty file", "canonical_review_required");
  const reviewHash = sha256(reviewBytes);
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId: state.reference.run_id });
  if (lifecycle.stage_status !== "done") fail("Reference stage is no longer complete", "reference_boundary_changed");
  const successor = continuationStage(lifecycle, stage, loaded.value.flow.contour);
  if (!state.reference.managed || !state.reference.controller_id) fail("Legacy reference boundaries require explicit migration", "reference_migration_required");
  const boundary = state.reference.boundary;
  if (boundary?.stage !== stage || typeof boundary.manifest !== "string" || sha256(await readFile(boundary.manifest)) !== boundary.manifest_sha256) fail("Reference boundary receipt changed", "snapshot_checksum_mismatch");
  const captured = await readJson(boundary.manifest);
  if (captured.run_id !== state.reference.run_id || captured.boundary_capture?.controller_id !== state.reference.controller_id || captured.boundary_capture?.operation_id !== boundary.operation_id || captured.boundary_capture?.boundary_key !== boundary.boundary_key || captured.stage_entry !== (successor ?? null)) fail("Reference capture belongs to another boundary", "snapshot_contract_mismatch");
  const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  if (status.controller?.controller_id !== state.reference.controller_id || !(successor ? status.controller.status === "waiting_for_context" : ["completed", "stop_target_reached"].includes(status.controller.status))) fail("Reference controller no longer holds the review boundary", "reference_boundary_changed");
  if (!successor) {
    state.status = "entries_captured";
    state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review: review, sha256: reviewHash, at: now() }];
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage } });
    return { build: root, state, next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)}` } };
  }
  const snapshotRoot = path.dirname(boundary.manifest);
  const snapshot = { kind: "run", locator: canonicalLocator(evalHome(), snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "snapshot.json")), run_id: state.reference.run_id };
  await verifySnapshot(evalHome(), { snapshot }, successor);
  const entry = canonicalEntry({ caseId: loaded.value.id, revision: state.revision, stage: successor, snapshot, blueprint, flowContour: loaded.value.flow.contour });
  const entryPath = path.join(root, "entries", `${successor}.json`); await writeJsonAtomic(entryPath, entry);
  // The prior turn is terminal before a boundary may be accepted.  Its marker
  // must not leak into the successor: a fresh-session handoff otherwise looks
  // like an interrupted in-flight turn and the runner safely refuses to send
  // the successor launcher.
  state.entries[successor] = path.relative(root, entryPath); state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review, sha256: reviewHash, at: now() }]; state.current_stage = successor; state.completed_stage = null; state.status = "awaiting_reference_resume"; state.reference = { ...state.reference, active_turn: null, pending_pause_id: null };
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage, successor, snapshot: snapshot.locator } });
  return { build: root, state, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
}

export async function canonicalQualificationRecover({ buildRoot, receiptFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (!["entries_captured", "qualifying"].includes(state.status)) fail(`canonical build is ${state.status}, not recoverable for qualification`, "canonical_transition_invalid");
  const sourceFile = path.resolve(receiptFile); const source = await readJson(sourceFile);
  if (!isObject(source?.result) || !Array.isArray(source.result.executions) || typeof source.profile_file !== "string") fail("qualification recovery requires a runner qualification receipt", "qualification_receipt_invalid");
  const profile = await loadRunProfile(source.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification receipt belongs to another case", "canonical_profile_mismatch");
  assertQualificationSelection(profile.value.selection, loaded.value.flow.contour);
  const pack = await canonicalCandidatePack(root, state, blueprint); const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow); const byId = new Map(targets.map((execution) => [execution.id, execution]));
  const recoveryId = `REC-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const recovered = [];
  const pendingCells = [], seen = new Set();
  for (const result of source.result.executions) {
    const execution = byId.get(result?.execution);
    if (!execution || typeof result.state !== "string" || seen.has(execution.id)) fail("qualification receipt has an unknown, duplicate or invalid execution", "qualification_receipt_invalid");
    seen.add(execution.id);
    if (result.state !== "candidate_ready") continue;
    const input = { root, state, pack, profile, subject, execution, result, qualificationId: recoveryId, source: { kind: "explicit_recovery", receipt: sourceFile } };
    pendingCells.push({ input, prepared: prepareQualificationCell(input) });
  }
  // Read retained receipts before writing the first recovered cell. A corrupt
  // later receipt must not leave an unrecorded partial recovery behind.
  const coverage = await qualificationCoverage({ root, state, pack, profile, subject, targets });
  for (const { input, prepared } of pendingCells) {
    const record = await recordQualificationCell(input, prepared);
    const execution = input.execution;
    coverage[execution.id] = { ...coverage[execution.id], valid: true, record };
    recovered.push(execution.id);
  }
  state.status = "entries_captured"; state.qualification = null;
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_recovered", data: { state: state.status, recovery_id: recoveryId, source_receipt: sourceFile, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
  return { build: root, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id), next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
}

export async function canonicalQualify({ buildRoot, profileFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  // A failed qualification is evidence about the runner, not a reason to
  // discard an otherwise accepted canonical chain.  Preserve that attempt,
  // then permit a corrected runner to qualify the same entries again.
  if (state.status !== "entries_captured") fail(`canonical build is ${state.status}, not ready to qualify`, "canonical_transition_invalid");
  const profile = await loadRunProfile(profileFile ?? state.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification profile belongs to another case", "canonical_profile_mismatch");
  assertQualificationSelection(profile.value.selection, loaded.value.flow.contour);
  const candidatePack = await canonicalCandidatePack(root, state, blueprint); const packFile = path.join(root, "entry-pack.json");
  const validated = { case_id: state.case_id, revision: state.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries: Object.fromEntries(Object.entries(candidatePack.entries).map(([key, file]) => [key, { file }])) };
  const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow); let coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets }); const pending = Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution); const qualificationId = `QUAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const output = path.join(root, "qualification", qualificationId);
  const preparedInputs = pending.length ? await prepareEvalInputs({ runProfile: profile, profile: subject, loaded, validated, executions: pending, suppliedPack: candidatePack }) : null;
  await writeJsonAtomic(packFile, candidatePack);
  if (pending.length === 0) {
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage });
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, reused: targets.map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  }
  state.status = "qualifying"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_started", data: { state: state.status, qualification_id: qualificationId } });
  try {
    const result = await executeEval({ runProfile: profile, profile: subject, loaded, validated, root: output, runId: qualificationId, kind: "qualification", executions: pending, preparedInputs });
    for (const resultExecution of result.executions) {
      const execution = targets.find((target) => target.id === resultExecution.execution);
      if (execution && resultExecution.state === "candidate_ready") await recordQualificationCell({ root, state, pack: candidatePack, profile, subject, execution, result: resultExecution, qualificationId });
    }
    coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets });
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions: result.executions });
    const qualified = summary.qualified;
    const receipt = { schema_id: "dd-eval/qualification-attempt@1", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, result, created_at: now() };
    await writeJsonAtomic(path.join(output, "receipt.json"), receipt);
    if (!qualified) {
      state.status = "entries_captured";
      state.qualification = null;
      state.qualification_failure = { receipt: path.relative(root, path.join(output, "receipt.json")), sha256: hashJson(receipt), id: qualificationId };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_incomplete", data: { state: state.status, qualification_id: qualificationId, failures: result.executions.filter((execution) => execution.state !== "candidate_ready").map((execution) => ({ execution: execution.execution, code: execution.code })), pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
      return { build: root, state, receipt, next: { kind: "retry_qualification", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
    }
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, executed: pending.map((execution) => execution.id), reused: targets.filter((target) => !pending.some((execution) => execution.id === target.id)).map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  } catch (error) {
    state.status = "package_gap"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_failed", data: { state: state.status, error: error instanceof Error ? error.message : String(error) } }); throw error;
  }
}


export async function canonicalAccept({ buildRoot, entry: entryName, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (state.status !== "waiting_for_entry_review") fail("canonical build is not waiting for entry reviews", "canonical_transition_invalid");
  const catalog = flowStageCatalog(loaded.value.flow.contour);
  if (!catalog.includes(entryName)) fail("unknown canonical entry", "canonical_entry_unknown");
  const receiptFile = path.join(root, state.qualification?.receipt ?? ""); if (!(await exists(receiptFile))) fail("canonical entry acceptance requires a qualification receipt", "qualification_receipt_missing");
  const receipt = await readJson(receiptFile); if (receipt.schema_id !== "dd-eval/qualification-receipt@2" || receipt.status !== "qualified") fail("canonical entry acceptance requires successful qualification", "qualification_not_successful");
  const review = path.resolve(reviewFile), reviewBytes = await readRegularFile(review);
  if (!reviewBytes.toString("utf8").trim()) fail("canonical entry review must be a non-empty file", "canonical_review_required");
  state.entry_reviews = { ...(state.entry_reviews ?? {}), [entryName]: { review, sha256: sha256(reviewBytes), at: now() } };
  const allAccepted = catalog.every((key) => state.entry_reviews[key]);
  if (!allAccepted) {
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.entry_accepted", data: { state: state.status, entry: entryName } });
    return { build: root, state, next: { kind: "entry_review", remaining: catalog.filter((key) => !state.entry_reviews[key]) } };
  }
  const entries = await canonicalEntries(root, state, catalog);
  const reviewContents = {};
  for (const [key, value] of Object.entries(state.entry_reviews)) {
    const bytes = key === entryName ? reviewBytes : await readRegularFile(value.review);
    if (sha256(bytes) !== value.sha256) fail(`Accepted review changed: ${key}`, "canonical_review_changed");
    reviewContents[key] = bytes;
  }
  const pack = await canonicalCandidatePack(root, state, blueprint, entries); pack.entries = Object.fromEntries(stages.map((key) => [key, `${key}.json`])); pack.status = "accepted"; pack.accepted_at = now(); pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  const destination = path.join(loaded.root, "stage-entries", state.revision); await mkdir(destination, { recursive: true });
  await writeJsonAtomic(path.join(destination, "stage-context.json"), blueprint);
  for (const key of stages) await writeJsonAtomic(path.join(destination, `${key}.json`), entries[key]);
  await writeJsonAtomic(path.join(destination, "entry-pack.json"), pack);
  const reviews = path.join(loaded.root, "checkpoint-reviews", state.revision); await mkdir(reviews, { recursive: true });
  for (const [key, bytes] of Object.entries(reviewContents)) await writeFile(path.join(reviews, `${key}.md`), bytes);
  const caseFile = path.join(loaded.root, "case.json"); const caseValue = { ...loaded.value, entry_pack: path.relative(loaded.root, path.join(destination, "entry-pack.json")) }; await writeJsonAtomic(caseFile, caseValue);
  state.status = "promoted_pending_commit"; state.promoted_entry_pack = path.relative(loaded.root, path.join(destination, "entry-pack.json"));
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.promoted", data: { state: state.status, entry_pack: state.promoted_entry_pack } });
  return { build: root, state, next: { kind: "git_commit", message: "Review, commit and push the promoted case definition before scored execution." } };
}

export async function canonicalStatus({ buildRoot }) {
  const root = path.resolve(buildRoot);
  const state = await readJson(path.join(root, "build", "state.json"));
  const events = await readEvents(path.join(root, "build", "events.jsonl"));
  return { build: root, state, journal: reduceEvents(events) };
}

/** Add the exact engine artifact to a pre-engine-snapshot canonical build.
 * This is an explicit, one-time migration; normal qualification never falls
 * back to a globally installed engine. */
export async function canonicalEngineCapture({ buildRoot }) {
  const { root, state } = await canonicalState(buildRoot);
  if (state.status !== "entries_captured") fail("engine capture is allowed only after the canonical chain is complete and before qualification", "canonical_transition_invalid");
  if (state.engine) fail("canonical build already has an engine snapshot", "canonical_engine_already_captured");
  const runId = state.reference?.run_id;
  if (typeof runId !== "string") fail("canonical build has no reference RUN for engine capture", "canonical_state_invalid");
  const projectsRoot = path.join(root, "reference", "dd-flow-home", "projects");
  const projects = await readdir(projectsRoot, { withFileTypes: true });
  const matching = projects.filter((item) => item.isDirectory()).map((item) => path.join(projectsRoot, item.name, "runs", runId, "engine-binding.json"));
  const bindingFile = (await Promise.all(matching.map(async (file) => (await exists(file)) ? file : null))).find(Boolean);
  if (!bindingFile) fail("reference RUN engine binding is missing", "canonical_engine_missing");
  const binding = await readJson(bindingFile);
  const bound = binding?.engine;
  if (!bound?.snapshot_root || !bound?.package_name || !bound?.package_version || !bound?.engine_version || !bound?.integrity_checksum) fail("reference RUN has no valid engine binding", "canonical_engine_missing");
  const sourceManifest = await readJson(path.join(bound.snapshot_root, "engine.json"));
  if (sourceManifest?.integrity?.checksum !== bound.integrity_checksum) fail("reference engine does not match the immutable RUN binding", "canonical_engine_mismatch");
  const engine = await captureEngineSnapshot({ root, home: evalHome(), selected: sourceManifest });
  for (const locator of Object.values(state.entries)) {
    const file = path.join(root, locator);
    const entry = await readJson(file);
    await writeJsonAtomic(file, { ...entry, engine });
  }
  state.engine = engine;
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.engine_captured", data: { engine } });
  return { build: root, state, engine, next: { kind: "canonical_qualify", message: "Run canonical qualify with this case's qualification profile." } };
}

/** Qualification owns installation; productive daemon startup only checks. */
export async function qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install = false, execution } = {}) {
  // Inspect only selected routes, not every installed profile. Cross-harness
  // reviewers inherit qualified hooks from this source workspace snapshot.
  const selected = [];
  for (const route of [execution, ...Object.values(execution?.stage_overrides ?? {})].filter(Boolean)) {
    for (const id of [route.agent_profile_id, route.delegation?.agent_profile_id].filter(Boolean)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail("Invalid execution hook profile id", "agent_profile_invalid");
      const value = await readJson(path.join(runtimeRoot, "agent-profiles", `${id}.json`));
      if (value.schema_id !== "dd-flow/agent-profile@1" || value.id !== id) fail("Execution hook profile identity mismatch", "agent_profile_invalid");
      selected.push(value);
    }
  }
  const agy = selected.find(value => value.harness === "agy");
  if (profile.harness !== "antigravity-cli" && !agy) return null;
  if (agy) profile = { ...agy, harness: "antigravity-cli" };
  const env = runtimeEnv(runtimeRoot), adapter = await driverAdapterInvocation(profile, { env });
  const invoke = action => commandJson(adapter.executable, [...adapter.prefix, "hooks", action, "--project-root", projectRoot], { cwd: projectRoot, env });
  const installation = install ? await invoke("install") : null;
  const qualification = await invoke("check");
  if (qualification.ok !== true || qualification.workspaceHooksPath !== path.join(path.resolve(projectRoot), ".agents", "hooks.json") || !/^[a-f0-9]{64}$/.test(qualification.workspaceHooksSha256 ?? "") || installation && (installation.ok !== true || installation.workspaceHooksSha256 !== qualification.workspaceHooksSha256)) fail("AGY workspace hooks did not retain their qualified identity", "workspace_hooks_unqualified");
  const receipt = { schema_id: "dd-eval/workspace-hook-qualification@1", project_root: projectRoot, profile_id: profile.id, installation, qualification };
  if (install) await writeJsonAtomic(path.join(runtimeRoot, "workspace-hook-qualification", `${sha256(projectRoot)}.json`), receipt);
  return receipt;
}

const deliveredModelProgress = new Map();
export async function callDriver(profile, args, options) {
  if (options.timeoutMs !== undefined && options.timeoutMs !== null) validateObservationDuration(options.timeoutMs);
  const requestedOperation = args[1] && !args[1].startsWith("--") ? args.slice(0, 2).join(".") : args[0];
  let nativeContracts = options.nativeContracts;
  // A materializing resume and an observational alias have different launch
  // authority. Resolve that distinction from the selected engine before gates.
  if (requestedOperation === "session.resume" && !nativeContracts?.canonicalNativeOperation
    || requestedOperation === "session.start" && !nativeContracts?.nativeOperationWait) {
    nativeContracts = await loadNativeContracts(options.env?.DD_FLOW_CONFIG_HOME ?? options.env?.DD_FLOW_HOME, { requireProgress: true });
  }
  if (nativeContracts?.canonicalNativeOperation !== undefined && typeof nativeContracts.canonicalNativeOperation !== "function") fail("Selected native operation contract is incompatible", "native_contract_unsupported");
  const operation = nativeContracts?.canonicalNativeOperation ? nativeContracts.canonicalNativeOperation(profile.harness, requestedOperation) : requestedOperation;
  if (typeof operation !== "string" || !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)?$/.test(operation)) fail("Selected native contract returned an invalid operation", "native_contract_unsupported");
  const materializing = ["session.create", "session.start", "session.prompt", "session.fork", "session.resume"].includes(operation);
  if (materializing && options.env?.DD_FLOW_CONFIG_HOME && (nativeContracts?.native_tree_settlement_contract !== "native-tree-settlement@2" || typeof nativeContracts.nativeTreeReadiness !== "function")) {
    nativeContracts = await loadNativeContracts(options.env.DD_FLOW_CONFIG_HOME, { requireTreeSettlement: true });
  }
  if (materializing || operation === "daemon.start") await executionDispatchBarrier(operation);
  const adapter = await driverAdapterInvocation(profile, options);
  // Historical control reads keep their pinned semantics. Productive start
  // needs the selected native wait ABI: Droid waits for work, Codex for ACK.
  const phase = nativeContracts?.nativeOperationWait ? nativeContracts.nativeOperationWait(profile.harness, operation)
    : operation === "session.prompt" ? "native-work" : "control";
  if (!["native-work", "control"].includes(phase)) fail("Selected native wait contract returned an invalid phase", "native_contract_unsupported");
  const command = driverProfileArgs(profile, await driverRuntimeArgs(args, { ...options, profile }), operation);
  let ownedEnv = options.env;
  if (options.env?.DD_FLOW_RUNTIME_OWNER) {
    const owner = JSON.parse(options.env.DD_FLOW_RUNTIME_OWNER);
    const executable = adapter.prefix[0] ?? adapter.executable;
    if (owner.adapter_executable && owner.adapter_executable !== executable) fail("Judge adapter differs from its frozen runtime owner", "harness_runtime_binding_conflict");
    ownedEnv = { ...options.env, DD_FLOW_RUNTIME_OWNER: JSON.stringify({ ...owner, adapter_executable: executable }) };
  }
  const operationId = options.operationId ?? randomUUID();
  const stateIndex = command.indexOf("--state-dir");
  let clientFile, clientRecord, operationProgressSnapshot;
  if (stateIndex >= 0 && materializing) {
    const root = command[stateIndex + 1]; await mkdir(root, { recursive: true });
    clientFile = path.join(root, "client-operations", `${sha256(operationId)}.json`);
    clientRecord = { operation_id: operationId, parent_operation_id: operationContext.getStore()?.operationId ?? null, command: operation.split("."), requested_at: now(), request_sha256: hashJson(command), state: "requested", ...(options.capacityContinuation ? { capacity_continuation: options.capacityContinuation } : {}) };
    const daemon = await readJson(path.join(root, "daemon.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    clientRecord.expected_daemon_id = daemon?.daemon_id ?? daemon?.config?.daemonId ?? null;
    await withRunnerLock(path.join(root, "client-ledger"), async () => {
      await reconcileDriverReplies(root, { nativeContracts });
      await writeJsonAtomic(clientFile, clientRecord);
    });
  }
  const modelJournal = argValue(args, "--journal");
  const progressKey = `${modelJournal ?? "none"}:${operationContext.getStore()?.executionId ?? "native"}`;
  if (!deliveredModelProgress.has(progressKey)) deliveredModelProgress.set(progressKey, new Set());
  const modelProgress = modelProgressPump({ journal: modelJournal, context: operationContext.getStore(), notify: options.onModelProgress, delivered: deliveredModelProgress.get(progressKey) });
  let observationError = null;
  const pollModels = () => modelProgress.poll().catch(error => { observationError = error; });
  await pollModels();
  if (observationError) throw Object.assign(new Error("model observations could not be read before dispatch", { cause: observationError }), { code: "model_observation_storage_failed", details: { phase: "prepare", effect: "no_effect", operation_id: operationId } });
  const modelTimer = setInterval(() => { void pollModels(); }, 2000); modelTimer.unref?.();
  const invoke = async () => {
    const env = { ...process.env };
    if (options.env?.DD_FLOW_CONFIG_HOME && !options.env?.DD_FLOW_HOME) {
      // commandJson merges ambient variables; explicit undefined survives that
      // merge and Node omits the key, instead of resurrecting foreign ownership.
      for (const key of Object.keys(env)) if (key.startsWith("DD_FLOW_")) env[key] = undefined;
    }
    Object.assign(env, ownedEnv, { DD_EVAL_OPERATION_ID: operationId });
    // The native boundary owns productive inactivity. The disposable CLI
    // observes only setup/control phases, never a competing work deadline.
    const productive = phase === "native-work";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    try {
        const receipt = await commandJson(adapter.executable, [...adapter.prefix, ...command], { cwd: options.cwd, env, signal: options.signal, phase: productive ? "native-work" : "control", startupMs: productive ? null : options.startupMs ?? options.timeoutMs ?? 120_000, timeoutMs: productive ? null : options.timeoutMs ?? 30_000,
          operationProgress: clientFile ? async clock => {
            const original = await inspectDaemonOperation(command[stateIndex + 1], operationId).catch(error => { if (error.code === "operation_not_found") return null; throw error; });
            if (original) {
              if (clientRecord.expected_daemon_id && original.daemon_id !== clientRecord.expected_daemon_id
                || original.operation && original.operation !== operation) throw Object.assign(new Error("operation differs from frozen caller identity"), { code: "operation_binding_conflict" });
              const binding = Object.fromEntries(["operation_id", "daemon_id", "operation", "params_sha256", "owner_id", "generation"].map(key => [key, original[key] ?? null]));
              if (clientRecord.daemon_binding && Object.entries(clientRecord.daemon_binding).some(([key, value]) => binding[key] !== value)) throw Object.assign(new Error("operation binding changed during CLI observation"), { code: "operation_binding_conflict" });
              clientRecord.daemon_binding ??= binding;
              if (original.progress && original.progress.sequence > (clientRecord.observation_progress_sequence ?? 0)) {
                clientRecord.observation_progress_sequence = original.progress.sequence;
                operationProgressSnapshot = { cursor: `${original.progress.daemon_id}:${original.progress.sequence}`, observed_at: Date.parse(original.progress.observed_at) };
              }
            }
            const contracts = nativeContracts;
            const waiting = original && contracts?.readOperationWaiting && await contracts.readOperationWaiting(command[stateIndex + 1], operationId, clientRecord.daemon_binding);
            if (waiting) contracts.suspendOperationClock(clock);
            else clock.sample(operationProgressSnapshot);
            await withRunnerLock(path.join(command[stateIndex + 1], "client-ledger"), async () => {
              const current = await readJson(clientFile);
              if (!["completed", "failed"].includes(current.state)) await writeJsonAtomic(clientFile, { ...current, daemon_binding: clientRecord.daemon_binding, observation_progress_sequence: clientRecord.observation_progress_sequence ?? 0, observation_clock: clock.state() });
            });
            return waiting ? { suspended: true } : operationProgressSnapshot;
          } : null });
        if (args[0] === "doctor" && options.validateRuntime !== false) assertObservedRuntime(receipt, profile, "harness doctor");
        return receipt;
    } catch (error) {
      // Missing/invalid native transport output is not a provider verdict.
      // Scope this mapping to driver operations, not semantic utility errors.
      if (error.code === "flow_reconciliation_failed") error.code = "harness_adapter_invalid";
      error.details = { ...error.details, operation_id: error.details?.operation_id ?? operationId, observer_operation_id: operationId };
      throw error;
    } finally { if (progress) clearInterval(progress); }
  };
  const invocation = clientFile ? withSleepInhibitor(invoke, { report: event => {
    void appendFile(path.join(command[stateIndex + 1], "host-events.jsonl"), `${JSON.stringify({ kind: "sleep_inhibitor", observed_at: now(), operation_id: operationId, ...event })}\n`).catch(() => {});
  } }) : invoke();
  try {
    let receipt;
    try { receipt = await invocation; }
    catch (error) {
      if (!clientFile || !(nativeContracts?.isObservationLoss ?? isObservationLoss)(error)) throw error;
      try { receipt = await recoverDriverReply(command[stateIndex + 1], operationId, { signal: options.signal, nativeContracts }); }
      catch (recovery) {
        // Native terminal remains authoritative; unknown reconciliation must
        // retain the original observer/cleanup evidence rather than erase it.
        recovery.details = { ...recovery.details, observation_error: errorRecord(error) };
        if (isObservationLoss(recovery)) {
          recovery.cause ??= error;
        }
        throw recovery;
      }
    }
    clearInterval(modelTimer);
    await pollModels();
    await pollModels(); // Drain a poll which may have started before the adapter reply.
    if (observationError) throw Object.assign(new Error(`model progress could not be persisted: ${observationError.message}`, { cause: observationError }), { code: "model_observation_storage_failed", details: { operation_id: operationId, native_outcome: receipt, observation_error: errorRecord(observationError) } });
    options.signal?.throwIfAborted();
    try { assertTargetSession(receipt, profile, args); }
    catch (error) { error.details = { ...error.details, operation_id: operationId, native_outcome: receipt }; throw error; }
    if (clientFile) {
      try { await writeJsonAtomic(clientFile, { ...clientRecord, state: "completed", finished_at: now(), result: receipt }); }
      catch (error) { throw Object.assign(new Error("native reply could not be persisted to client ledger", { cause: error }), { code: "native_outcome_observation_failed", retryable: false, details: { operation_id: operationId, phase: "client_ledger_publication", native_outcome: receipt, observation_error: errorRecord(error) } }); }
    }
    return receipt;
  } catch (error) {
    // Only the daemon can establish a terminal provider failure. A CLI crash,
    // invalid reply or spawn failure can leave dispatch uncertain.
    if (clientFile) await reconcileDriverReplies(command[stateIndex + 1], { nativeContracts }).catch(() => {});
    throw error;
  } finally { clearInterval(modelTimer); }
}

/** Qualify one changed harness profile by observing it and exercising its native child path once. */
export async function harnessCompatibilityQualify({ profileId, projectRoot = process.cwd() }) {
  const loaded = await loadProfile(profileId); const profile = loaded.value; const project = path.resolve(projectRoot);
  const original = await readFile(loaded.file); const beforeSha256 = sha256(original);
  const receiptRoot = path.join(evalHome(), "conformance", "harness-compatibility", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const runtimeRoot = path.join(receiptRoot, "runtime");
  await provisionRuntimeEngine(project, runtimeRoot);
  const options = { cwd: project, env: { DD_FLOW_CONFIG_HOME: runtimeRoot }, validateRuntime: false };
  const observedReceipt = await callDriver(profile, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  const observed = observedReceipt?.observed_runtime;
  if (!isObject(observed)) fail("harness doctor did not report observed_runtime", "harness_runtime_unobservable");
  if (JSON.stringify(profile.runtime ?? null) === JSON.stringify(observed)) return { profile_id: profile.id, status: "already_qualified", observed_runtime: observed };
  // Reuse the native-child conformance path. It is a small real smoke, not a
  // second launcher protocol with subtly different lifecycle semantics.
  const smoke = await harnessCapacityCheck({ profileId, maximum: 1, projectRoot: project, writeProfile: false, runtimeRoot });
  if (!smoke.qualified) {
    const error = new Error("harness compatibility smoke did not qualify the changed runtime");
    error.code = "harness_compatibility_smoke_failed";
    error.details = { profile_id: profile.id, observed_runtime: observed, smoke_receipt: smoke.receipt_file, failure: smoke.failure ?? null };
    throw error;
  }
  const afterReceipt = await callDriver({ ...profile, runtime: null }, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  if (JSON.stringify(afterReceipt?.observed_runtime ?? null) !== JSON.stringify(observed)) fail("harness runtime changed during qualification", "harness_runtime_changed");
  const current = await readFile(loaded.file);
  if (sha256(current) !== beforeSha256) fail("harness profile changed during qualification; inspect and retry", "harness_profile_changed");
  const next = { ...profile, runtime: observed };
  delete next.subagent_capacity;
  await writeJsonAtomic(loaded.file, next);
  await mkdir(receiptRoot, { recursive: true });
  await writeJsonAtomic(path.join(receiptRoot, "receipt.json"), { schema_id: "dd-eval/harness-compatibility@1", profile_id: profile.id, previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke, qualified_at: now() });
  return { profile_id: profile.id, status: "qualified", previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke_receipt: path.join(receiptRoot, "receipt.json") };
}


async function finalizeRunProjection({ root, manifest, loaded, results, permits = null, cleanupOnly = false, authorizeFinalization = null, judgeNativeContracts }) {
  const eventsFile = path.join(root, "events.jsonl");
  const manifestBytes = await readRegularFile(path.join(root, "manifest.json"));
  if (hashJson(JSON.parse(manifestBytes)) !== hashJson(manifest)) fail("Finalization manifest changed", "runner_definition_drift");
  const manifestSha = sha256(manifestBytes);
  let projectedEvents = await readEvents(eventsFile);
  results = storedExecutionResults(projectedEvents, manifest);
  for (const result of results) {
    if (result.state !== "failed" || result.recovery?.recovery_id) continue;
    const before = failureEvidenceRevision(result);
    result.attempt ??= path.join(root, "executions", result.execution);
    await enrichFailureEvidence({ root, manifest, result, events: projectedEvents });
    result.recovery = await captureRecoveryEvidence({ root, manifest, result });
    if (result.recovery?.recovery_id && result.incomplete_evidence?.missing === "Waiting for the managed controller's sealed recovery capture") result.incomplete_evidence = null;
    else if (!result.incomplete_evidence) result.incomplete_evidence = { snapshot: null, missing: "Waiting for the managed controller's sealed recovery capture", failure: result.recovery?.capture_error ?? null };
    if (failureEvidenceRevision(result) === before) continue;
    const execution = manifest.executions.find(item => item.id === result.execution);
    const origin = executionState(projectedEvents, manifest.run_id, execution).operation_id;
    if (sha256(await readRegularFile(path.join(root, "manifest.json"))) !== manifestSha) fail("Cleanup manifest changed before ingestion", "runner_definition_drift");
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: result.execution, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: { ...result, execution_operation_id: origin } });
  }
  projectedEvents = await readEvents(eventsFile);
  results = storedExecutionResults(projectedEvents, manifest);
  for (const result of results) if (result.state === "failed") await verifyCapturedNativeFailure({ evalRoot: root, result });
  const resultHash = runResultRevision(projectedEvents, manifest);
  const historyEvents = subjectHistoryEvents(projectedEvents, manifest), historyHash = hashJson(historyEvents);
  await attachModelAttribution(root, manifest, results);
  const completed = results.every((result) => result.state === "candidate_ready");
  let interactionUnsettled = true, interactionEvidenceUnavailable = false, interactionEvidenceError = null;
  try { interactionUnsettled = await interactionCleanupPending(eventsFile, manifest.run_id, projectedEvents, results); }
  catch (error) {
    interactionEvidenceUnavailable = true;
    interactionEvidenceError = errorRecord(error);
    await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'interaction_evidence_unavailable', message: `Execution outcome retained; Interaction Judge evidence cannot be verified (${interactionEvidenceError.code}): ${interactionEvidenceError.message}`, phase: 'interaction_evidence', consequence: 'none' });
  }
  let sourceInventory, sourcePhysical;
  let executionUnsettled = await executionCleanupPending(root, manifest, results, undefined, async (runId, notes) => {
    await publishSubjectTechnicalNotes(eventsFile, manifest.run_id, runId, notes);
  }, (inventory, proof) => { sourceInventory = inventory; sourcePhysical = proof; });
  // A retained scope retirement can establish physical stop without a clean
  // native receipt. It cannot grant capture, finalization or Judge authority.
  let retiredScope = sourceInventory && !sourcePhysical?.binding_unconfirmed
    && await hasRetainedRetirementProof({ root, manifest, live: { inventory: sourceInventory }, maintenance: await cleanupSidecars(root) });
  if (retiredScope) {
    sourcePhysical = { ...sourcePhysical, pending: false, retiredScope: true };
    executionUnsettled = false;
    interactionUnsettled = false;
  }
  const sourceNotes = technicalNotes(await readEvents(eventsFile));
  const resolvedNotes = resolveRetiredTechnicalNotes(sourceNotes, sourceInventory, manifest.run_id, sourcePhysical);
  for (const note of resolvedNotes.filter((note, index) => note.state === 'resolved' && sourceNotes[index]?.state === 'open')) await recordTechnicalNote(eventsFile, manifest.run_id, note, true);
  const subjectResourcesPending = resolvedNotes.some(note => note.source_run_id && note.state === 'open' && note.consequence === 'cleanup_pending');
  const unsettled = !retiredScope && (executionUnsettled || interactionUnsettled || subjectResourcesPending);
  const captureObservations = [];
  const captureStates = await Promise.all(results.map(result => failureCaptureState(root, manifest, result, undefined, value => captureObservations.push(value))));
  const capturePending = captureStates.includes("pending");
  const recoveryBlocked = captureStates.includes("blocked") || interactionEvidenceUnavailable;
  const pending = results.length !== manifest.executions.length || results.some((result) => !["candidate_ready", "failed", "cancelled"].includes(result.state));
  // A blocked observer is not a settlement receipt. Keep it distinct from a
  // live pending cleanup so neither candidate freezing nor Judge can consume
  // mutable or incompletely captured artifacts.
  const canFinalize = !pending && !capturePending && !recoveryBlocked;
  await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'execution_cleanup_pending', message: 'Execution result retained; owned resource retirement is unconfirmed', phase: 'cleanup', consequence: 'cleanup_pending', resource_identity: root }, !unsettled);
  if (canFinalize) await attachCaseAcceptance(root, manifest, results);
  const executionSummary = completed ? "completed" : results.some((result) => result.state === "failed") ? "failed" : results.some((result) => result.state === "cancelled") ? "cancelled" : "running";
  let cleanupState = unsettled ? "pending" : "settled";
  await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'assessment_evidence_unavailable', message: 'Execution outcome retained; mandatory assessment evidence is not ready', phase: 'capture', resource_identity: root, consequence: 'none' }, !capturePending && !recoveryBlocked);
  let state = manifest.profile?.schema_id === "dd-eval/run-profile@2"
    ? projectRunCompletion({ manifest, results, pending })
    : completed ? "completed" : pending ? "awaiting_provider" : executionSummary === "failed" ? "completed_with_failures" : executionSummary === "cancelled" ? "cancelled" : "awaiting_provider";
  const contractInvalid = Boolean(manifest.execution_contract) && results.some(result => result.experiment_conformance?.state === "mismatched");
  for (const result of results) if (manifest.execution_contract) {
    await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'model_attribution_limited', message: 'Execution model attribution is incomplete or mismatched; Judge is diagnostic and does not certify the experiment profile', phase: 'assessment', resource_identity: result.execution, consequence: 'none' }, result.experiment_conformance?.state === 'matched');
  }
  if (contractInvalid && !pending && !recoveryBlocked) state = "completed_with_failures";
  let candidate = null; let judge = null; let judgeError = null; let judgeCleanup = null;
  let retainedJudgeStatus = null;
  if (cleanupOnly && canFinalize && await exists(path.join(root, "reports", "report.json"))) {
    const previous = await readJson(path.join(root, "reports", "report.json"));
    const { file: _file, immutable_hash, ...content } = previous.candidate ?? {};
    if (previous.run_id === manifest.run_id && immutable_hash && hashJson(content) === immutable_hash && candidateMatches(previous.candidate, manifest, results)) {
      candidate = previous.candidate;
      judge = previous.judge?.candidate_sha256 === immutable_hash ? previous.judge : null;
      if (judge && manifest.execution_contract) {
        try { assertJudgeProfileBinding(judge, contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id)); }
        catch (error) { judge = null; judgeError = errorRecord(error); }
      }
      retainedJudgeStatus = previous.judge_status;
      judgeError ??= previous.judge_error ?? null;
      if (judge) {
        try { judgeCleanup = await observeJudgeCleanup(path.dirname(candidate.file === path.join(root, "candidate.json") ? path.join(root, "judge", "result.json") : path.join(root, "judge", "revisions", candidate.immutable_hash, "result.json")), judge, { nativeContracts: judgeNativeContracts }); judgeError = null; retainedJudgeStatus = "completed"; }
        catch (error) { judgeError = errorRecord(error); retainedJudgeStatus = "failed"; judgeCleanup = { ...error.details?.cleanup, status: error.details?.cleanup?.status === "failed" ? "failed" : "unknown", error: judgeError }; }
      }
    }
  }
  if (canFinalize && !cleanupOnly) {
    const frozen = await withRunnerLock(`${root}.candidate`, () => withRunnerLock(eventsFile, async () => {
      const current = await readEvents(eventsFile);
      if (runResultRevision(current, manifest) !== resultHash || hashJson(subjectHistoryEvents(current, manifest)) !== historyHash) return null;
      return freezeCandidateLocked({ root, manifest, results });
    }));
    if (!frozen) return finalizeRunProjection({ root, manifest, loaded, results, permits, cleanupOnly, authorizeFinalization, judgeNativeContracts });
    candidate = frozen.candidate;
    if (frozen.created) await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.candidate.frozen", data: { state: candidate.outcome, candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file } });
    if (manifest.profile?.judge?.enabled) {
      const file = candidate.file === path.join(root, "candidate.json")
        ? path.join(root, "judge", "result.json")
        : path.join(root, "judge", "revisions", candidate.immutable_hash, "result.json");
      if (authorizeFinalization && !(await exists(file))) await authorizeFinalization();
      try {
        judge = await (await exists(file) ? readJson(file) : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: manifest.profile.judge.profile_id, candidate, permits, results, historyEvents }));
        if (manifest.execution_contract) assertJudgeProfileBinding(judge, contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id));
        if (judge.candidate_sha256 !== candidate.immutable_hash || judge.profile_id !== manifest.profile.judge.profile_id) fail("Retained Judge differs from this candidate/profile", "judge_evidence_mismatch");
        judgeCleanup = await observeJudgeCleanup(path.dirname(file), judge, { nativeContracts: judgeNativeContracts });
      } catch (error) { judgeError = errorRecord(error); judge ??= error.details?.retained_verdict?.verdict ?? null; judgeCleanup = { ...error.details?.cleanup, status: error.details?.cleanup?.status === "failed" ? "failed" : "unknown", error: judgeError }; }
      if (judge && !judgeError) {
        await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.final_judge.completed", data: { judge_profile: judge.profile_id, judge_session_id: judge.session_id, candidate_sha256: judge.candidate_sha256 } });
      }
    }
  }
  // A normal finalization may have dispatched a new Judge after the earlier
  // inventory read. Recheck the old all-role retirement proof before using it
  // in the report; a changed owner or turn invalidates that proof.
  if (retiredScope && !cleanupOnly && canFinalize && manifest.profile?.judge?.enabled) {
    let freshInventory, freshPhysical;
    const freshPending = await executionCleanupPending(root, manifest, results, undefined, undefined,
      (inventory, proof) => { freshInventory = inventory; freshPhysical = proof; });
    retiredScope = Boolean(freshInventory && !freshPhysical?.binding_unconfirmed
      && await hasRetainedRetirementProof({ root, manifest, live: { inventory: freshInventory }, maintenance: await cleanupSidecars(root) }));
    if (!retiredScope) {
      const interactionPending = await interactionCleanupPending(eventsFile, manifest.run_id, await readEvents(eventsFile), results).catch(() => true);
      cleanupState = freshPending || interactionPending ? "pending" : "settled";
      await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'execution_cleanup_pending', message: 'Execution result retained; owned resource retirement is unconfirmed', phase: 'cleanup', consequence: 'cleanup_pending', resource_identity: root }, cleanupState === "settled");
    }
  }
  let judgeStatus = judge && !judgeError ? "completed" : judgeError ? "failed" : retainedJudgeStatus ?? (!manifest.profile?.judge?.enabled ? "not_requested" : cleanupOnly ? "not_run_cleanup_only" : !canFinalize ? "not_run_incomplete_evidence" : "in_progress");
  if (judge && judgeCleanup?.status !== 'settled' && !retiredScope) cleanupState = 'pending';
  if (judgeCleanup) await recordTechnicalNote(eventsFile, manifest.run_id, { code: 'judge_cleanup_pending', message: 'Judge result retained; resource retirement is separate', phase: 'cleanup',
    source_operation_id: `${manifest.run_id}:judge:${candidate?.immutable_hash}`, resource_identity: judgeCleanup.state_dir ?? null, consequence: 'cleanup_pending' }, judgeCleanup.status === 'settled' || Boolean(retiredScope));
  if (state === "completed" && judgeStatus === "failed") state = "completed_with_failures";
  if (state === "completed" && manifest.profile?.judge?.enabled && ["in_progress","not_run_cleanup_only"].includes(judgeStatus)) state = "awaiting_provider";
  if (!["awaiting_provider", "awaiting_cleanup"].includes(state)) {
    await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed", guard: prior => runResultRevision(prior, manifest) === resultHash, data: { state, judge_status: judgeStatus, result_revision: resultHash, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  }
  const published = await withRunnerLock(eventsFile, async () => {
    if (sha256(await readRegularFile(path.join(root, "manifest.json"))) !== manifestSha) fail("Finalization manifest changed before publication", "runner_definition_drift");
    const reportEvents = await readEvents(eventsFile);
    if (runResultRevision(reportEvents, manifest) !== resultHash || hashJson(subjectHistoryEvents(reportEvents, manifest)) !== historyHash) return null;
    const projection = reduceEvents(reportEvents);
    await mkdir(path.join(root, "reports"), { recursive: true });
    const report = buildReport({ root, manifest, state, executionState: executionSummary, cleanupState, results, candidate, judge, judgeStatus, judgeError, judgeCleanup, events: reportEvents });
    await writeJsonAtomic(path.join(root, "reports", "report.json"), report);
    await writeFile(path.join(root, "reports", "report.md"), reportMarkdown(report));
    await writeJsonAtomic(path.join(root, "state.json"), projection);
    return { state, execution_state: executionSummary, cleanup_state: cleanupState,
      cleanup_observation: { capture: capturePending ? 'pending' : captureStates.includes('blocked') ? 'unknown' : 'ready',
        interaction_evidence: interactionEvidenceUnavailable ? 'unavailable' : 'available',
        errors: [...captureObservations.filter(item => item.error), ...(interactionEvidenceError ? [{ phase: 'interaction_evidence', error: interactionEvidenceError }] : [])] }, candidate, judge, report, results };
  });
  return published ?? finalizeRunProjection({ root, manifest, loaded, results, permits, cleanupOnly, authorizeFinalization, judgeNativeContracts });
}

async function judgeCapacityPrompt({ profile, capacityPolicy, nativeContracts, sessionId, daemonArgs, root, journal, prompt, packetFiles, packetHashes, judgeEnv, permits, admit, deadline = null, recoverOnly = false }) {
  const options = { cwd: root, env: judgeEnv, nativeContracts };
  const check = async () => {
    await admit();
    for (const [file, hash] of packetHashes) if (hashJson(await readJson(file)) !== hash) fail("Judge packet changed during capacity continuation", "judge_packet_changed");
  };
  return await promptJudgeWithCapacity({ policy: capacityPolicy, nativeContracts, ownerIdentity: { profile, packetHashes, runtime: judgeEnv.DD_FLOW_CONFIG_HOME, owner: judgeEnv.DD_FLOW_RUNTIME_OWNER }, sessionId, packetFiles, originalPrompt: prompt, admit: check, deadline, recoverOnly,
    stateFile: path.join(root, `capacity-${hashJson([sessionId, prompt])}.json`),
    observationClock: operationId => driverObservationClock(argValue(daemonArgs, "--state-dir"), operationId),
    recover: operationId => recoverDriverReply(argValue(daemonArgs, "--state-dir"), operationId, { nativeContracts }),
    requireSettlement: Boolean(JSON.parse(judgeEnv.DD_FLOW_RUNTIME_OWNER).budget),
    validateInspection: (observed, { operationId, overload }) => nativeContracts.nativeTreeReadiness(observed, { sessionId, operationId, ...(overload.request_proof?.kind === "stream_request" ? { requestProof: overload.request_proof } : { turnId: overload.turn_id }), allowDescendants: false }) === "ready"
      && directNativeChildren(observed, sessionId, nativeContracts).length === 0 && observed.settlement?.state !== "pending"
      && (!JSON.parse(judgeEnv.DD_FLOW_RUNTIME_OWNER).budget || observed.settlement?.state === "settled" && observed.settlement.operation_ids?.includes(operationId))
      && (observed.settlement?.state !== "settled" || observed.settlement.operation_ids?.includes(operationId)),
    onBackoff: event => appendFile(path.join(argValue(daemonArgs, "--state-dir"), "host-events.jsonl"), `${JSON.stringify({ kind: "judge_capacity_continuation", status: "waiting", observed_at: now(), ...event })}\n`),
    inspect: turnId => callDriver(profile, ["session", "inspect", ...daemonArgs, "--session-id", sessionId, ...(turnId ? ["--turn-id", turnId] : []), "--cwd", root, ...judgeExecutionArgs(profile), "--journal", journal], options),
    dispatch: (text, capacity, beforeDispatch) => {
      const invoke = async () => {
        await check(); // A queued permit cannot outlive cancellation or packet identity.
        await beforeDispatch();
        return await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", root, ...judgeExecutionArgs(profile), "--prompt", text, "--journal", journal], { ...options, operationId: capacity.operation_id, capacityContinuation: capacity });
      };
      return permits ? permits.use(profile, invoke) : invoke();
    } });
}
async function finalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null, historyEvents = [] }) {
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  const operationId = `${runId}:judge:${candidate.immutable_hash}`;
  const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId, traceId: runId,
    operationId, operation: "final_judge", action: () => performFinalJudge({ root, runId, manifest, loaded, profileId, candidate, permits, results, historyEvents }) });
  const result = receipt.result ?? receipt;
  assertJudgeProfileBinding(result, await frozenJudgeProfile(manifest.execution_contract, profileId));
  return result;
}
async function performFinalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null, supplemental = null, frozenProfile = null, runtimeRoots = null, historyEvents = [] }) {
  assertEvalAdmission(await readEvents(path.join(root, "events.jsonl")));
  if (typeof profileId !== "string") fail("judge.profile_id is required when judgment is enabled", "judge_profile_missing");
  const profile = frozenProfile ?? await frozenJudgeProfile(manifest.execution_contract, profileId);
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  if (!["dd-eval/run-candidate@2", "dd-eval/run-candidate@3"].includes(candidate.schema_id) || candidate.run_id !== (supplemental?.manifest.run_id ?? runId) || typeof candidate.immutable_hash !== "string") fail("Final Judge requires a frozen run candidate", "candidate_checkpoint_missing");
  const judgeRoot = supplemental ? supplemental.root : candidate.file === path.join(root, "candidate.json") || !candidate.file
    ? path.join(root, "judge")
    : path.join(root, "judge", "revisions", candidate.immutable_hash);
  await mkdir(judgeRoot, { recursive: true });
  if (await exists(path.join(judgeRoot, "result.json"))) {
    const retained = await readJson(path.join(judgeRoot, "result.json"));
    if (retained.candidate_sha256 !== candidate.immutable_hash) fail("Retained Judge verdict differs from this candidate", "judge_evidence_mismatch");
    assertJudgeProfileBinding(retained, profile);
    await assertJudgeVerdict(judgeRoot, retained);
    return retained;
  }
  const intentFile = path.join(judgeRoot, "native-intent.json");
  const nativeIntent = { profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, candidate_sha256: candidate.immutable_hash };
  if (await exists(intentFile)) {
    const retained = await readJson(intentFile);
    assertJudgeProfileBinding(retained, profile);
    if (retained.candidate_sha256 !== candidate.immutable_hash) fail("Retained Judge create intent changed", "judge_evidence_mismatch");
  } else await writeJsonAtomic(intentFile, nativeIntent);
  const candidateFile = path.join(judgeRoot, "candidate.json"); const assessmentFile = path.join(judgeRoot, "assessment.json"); const evidenceFile = path.join(judgeRoot, "evidence.json");
  const retainedEvidence = await exists(evidenceFile);
  const materializedResults = !supplemental && !retainedEvidence && results ? await Promise.all(results.map(async result => { result.materialization = await protocolizeMaterializationEvidence(root, result); return result; })) : results;
  const evidence = supplemental || retainedEvidence ? await readJson(evidenceFile) : materializedResults ? buildEvidencePacket({ manifest, results: materializedResults, candidate, events: historyEvents }) : await readJson(path.join(root, "reports", "report.json"));
  if (!supplemental && retainedEvidence && (evidence.candidate_sha256 !== candidate.immutable_hash || candidate.subject_history_sha256 && evidence.subject_history?.sha256 !== candidate.subject_history_sha256)) fail("Retained Judge evidence differs from the frozen candidate/history", "judge_evidence_mismatch");
  if (!supplemental) { await writeJsonAtomic(candidateFile, candidate); await writeJsonAtomic(assessmentFile, loaded.assessment); if (!retainedEvidence) await writeJsonAtomic(evidenceFile, evidence); }
  const scope = supplemental?.originalReceipt.result.scope ?? finalJudgeScope(manifest, results);
  const diagnosticAttribution = (results ?? []).some(result => manifest.execution_contract && result.experiment_conformance?.state !== 'matched');
  const prompt = finalJudgePrompt({ assessmentFile, candidateFile, evidenceFile, scope, assessment: loaded.assessment })
    + (diagnosticAttribution ? " Model attribution is incomplete or mismatched in the execution evidence. This assessment is diagnostic: evaluate the preserved execution facts, do not certify model/profile conformance or model comparisons. Missing outbound-model evidence is unknown, not proof of a different model; a proven mismatch remains a mismatch regardless of your quality verdict." : "")
    + (supplemental ? " This is an independent supplemental assessment. Distinguish observations, source inferences and hypotheses; assess relevance/severity against the retained original rubric. The candidate is a derived path-mapped view, not a new Subject execution. Strings prefixed provenance-only are historical metadata, never filesystem permission. Use only the owned evidence paths in these packets. Do not execute migrations, repair the product, resume a Subject or change the historical EVAL." : "");
  const journal = path.join(judgeRoot, supplemental ? "native-events.jsonl" : "events.jsonl"); const daemonState = path.join(judgeRoot, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(judgeRoot, "codex-home"); const roots = runtimeRoots ?? await judgeHarnessRoots(root, results); const judgeEnv = judgeRuntimeEnvironment({ runtimeRoot: roots.runtimeRoot, daemonState, profile, codexHome, budget: executionBudget(runId, manifest.profile), resourceHome: manifest.runtime_resource_home });
  const admit = async () => {
    assertEvalAdmission(await readEvents(path.join(root, "events.jsonl")));
    if (supplemental) { await assertSupplementalEvidence(supplemental); await supplemental.assertRuntime?.(); }
  };
  await admit();
  const nativeContracts = await loadNativeContracts(roots.runtimeRoot, { requireProgress: true, requireTreeSettlement: true });
  const capacityPolicy = await loadCapacityPolicy(roots.runtimeRoot);
  if (profile.harness === "codex-desktop") await initializeCodexHome({ ...roots, codexHome });
  let primaryError = null;
  try {
    await admit();
    await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", judgeRoot, "--journal", journal], { cwd: judgeRoot, env: judgeEnv, nativeContracts });
    const create = async (operationId) => {
      const invoke = async () => {
        await admit();
        return providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", judgeRoot, ...judgeExecutionArgs(profile), "--journal", journal], { cwd: judgeRoot, env: judgeEnv, nativeContracts, ...(operationId ? { operationId } : {}) });
      };
      return permits ? permits.use(profile, invoke) : invoke();
    };
    let created;
    {
      const operationId = `${supplemental?.key ?? `${runId}:judge:${candidate.immutable_hash}`}:session.create`;
      let retained;
      try { retained = await inspectDaemonOperation(daemonState, operationId); }
      catch (error) { if (error.code !== "operation_not_found") throw error; }
      created = retained ? await recoverDriverReply(daemonState, operationId, { nativeContracts }) : await create(operationId);
    }
    const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Final Judge did not create a Session", "driver_protocol");
    const response = await judgeCapacityPrompt({ profile, capacityPolicy, nativeContracts, sessionId, daemonArgs, root: judgeRoot, journal, prompt, packetFiles: [assessmentFile, candidateFile, evidenceFile], packetHashes: [[assessmentFile, hashJson(loaded.assessment)], [candidateFile, hashJson(await readJson(candidateFile))], [evidenceFile, hashJson(evidence)]], judgeEnv, permits, admit });
    await admit();
    const result = validateJudgeResult(parseJsonResponse(judgeTurnText(response, profile), "Final Judge"), loaded.assessment); const receipt = { schema_id: "dd-eval/final-judge-receipt@1", profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, session_id: sessionId, candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result, created_at: now(), ...(supplemental ? { assessment_key: supplemental.key, original_eval_id: supplemental.manifest.run_id, supplement_sha256: supplemental.identity.supplement_sha256 } : {}) };
    await writeJsonAtomic(path.join(judgeRoot, "result.json"), receipt);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId, type: "dev.dd.eval.final_judge.result_ready", data: { operation_id: supplemental ? `${runId}:judge` : `${runId}:judge:${candidate.immutable_hash}`, result: receipt } });
    return receipt;
  } catch (error) { primaryError = error; throw error; }
  finally {
    await finishJudgeCleanup({ root: judgeRoot, profileId: profile.id, primaryError, nativeContracts, stop: operationId => callDriver(profile, ["daemon", "stop", ...daemonArgs, ...(primaryError && !isObservationLoss(primaryError) ? ["--cancel-tree"] : [])], { cwd: judgeRoot, env: judgeEnv, nativeContracts, operationId }) });
  }
}
async function coverageDecision({ runProfile, fixture, packet, root, evalRunId, runtimeRoot }) {
  if (runProfile.value.semantic_decisions?.enabled) return semanticCoverageDecision({ runProfile, fixture, packet, root, evalRunId, runtimeRoot });
  const policy = runProfile.coveragePolicy;
  if (!policy) return { judgment: null, filter: { requested_mode: "disabled", reason: "judge_only" } };
  await assertCoveragePolicy(policy, hitlQualificationHome());
  const admit = async () => { await executionDispatchBarrier("hitl.coverage", { record: false }); };
  const file = path.join(root, "result.json");
  if (await exists(file)) {
    const receipt = await readJson(file);
    if (receipt.decision_source !== "jev") return { judgment: null, filter: null };
    if (receipt.policy_sha256 !== hashJson(policy) || receipt.interaction_fixture_sha256 !== fixture.sha256 || (receipt.eval_run_id ?? null) !== evalRunId) fail("Retained coverage policy/fixture/EVAL changed", "judge_evidence_mismatch");
    const verdict = await verifyJevReceipt(root, receipt, packet);
    return { judgment: { decision_source: "jev", packet, packet_file: path.join(root, "packet.json"), receipt_file: file, verdict, coverage_filter: receipt.coverage_filter ?? null, reused: true }, filter: receipt.coverage_filter ?? null };
  }
  // Once native fallback owns a task, HTTP must not be dispatched again.
  if (await exists(path.join(root, "native-intent.json"))) return { judgment: null, filter: null };
  const observation = await withExecutionAdmissionSignal(async signal => observeJev({ root, packet, policy, binding: packet.hitl_binding ?? null, evalRunId, admit, beforeDispatch: () => executionDispatchBarrier("hitl.coverage"), signal, capacityPolicy: await exists(path.join(root, "jev-observation.json")) ? null : await loadCapacityPolicy(runtimeRoot) }));
  const verdict = jevCoveredVerdict(packet, observation, policy);
  const filter = { requested_mode: policy.mode, observation_file: observation.file ?? null, state: observation.state, latency_ms: observation.latency_ms ?? null, usage: observation.response?.usage ?? null, reason: observation.reason ?? (policy.mode === "shadow" ? "shadow" : verdict ? "covered" : "probability_fallback") };
  if (!verdict) return { judgment: null, filter };
  await admit();
  const observationRecord = await readJson(observation.file);
  const answer = verdict.response_ids.map(id => packet.responses.find(response => response.id === id).answer).join(hitlResponseDelimiter);
  const receipt = { schema_id: "dd-eval/hitl-coverage-route@1", decision_source: "jev", eval_run_id: evalRunId, stage: packet.stage,
    interaction_fixture_sha256: fixture.sha256, packet_sha256: hashJson(packet), policy, policy_sha256: hashJson(policy), observation_sha256: hashJson(observationRecord),
    qualification_bytes: (await readRegularFile(path.join(hitlQualificationHome(), "coverage", `${policy.qualification_sha256}.json`))).toString("utf8"),
    verdict, coverage_filter: filter, delimiter: "dd-eval/hitl-response-delimiter@1", answer_sha256: sha256(answer), created_at: now() };
  await withRunnerLock(file, async () => {
    await admit();
    if (await exists(file) || await exists(path.join(root, "native-intent.json"))) fail("Coverage route already belongs to another decision", "judge_evidence_mismatch");
    if (hashJson(await readJson(path.join(root, "packet.json"))) !== hashJson(packet)) fail("Coverage input changed before publication", "judge_evidence_mismatch");
    await writeJsonAtomic(file, receipt);
  });
  await verifyJevReceipt(root, receipt, packet);
  return { judgment: { decision_source: "jev", packet, packet_file: path.join(root, "packet.json"), receipt_file: file, verdict, coverage_filter: filter }, filter };
}

async function semanticCoverageDecision({ runProfile, fixture, packet, root, evalRunId, runtimeRoot }) {
  const policy = validateSemanticConfig(runProfile.value.semantic_decisions);
  const file = path.join(root, "result.json");
  if (await exists(file)) {
    const receipt = await readJson(file);
    if (receipt.decision_source !== "semantic_decision") return { judgment: null, filter: null };
    if (receipt.policy_sha256 !== hashJson(policy) || receipt.dependency_sha256 !== runProfile.semanticFingerprint
      || receipt.interaction_fixture_sha256 !== fixture.sha256 || (receipt.eval_run_id ?? null) !== evalRunId) fail("Retained semantic route scope/configuration changed", "judge_evidence_mismatch");
    const verdict = await verifySemanticReceipt(root, receipt, packet);
    return { judgment: { decision_source: "semantic_decision", packet, packet_file: path.join(root, "packet.json"), receipt_file: file, verdict, coverage_filter: receipt.coverage_filter, reused: true }, filter: receipt.coverage_filter };
  }
  if (await exists(path.join(root, "native-intent.json"))) return { judgment: null, filter: null };
  if (!packet.hitl_binding) return { judgment: null, filter: { requested_mode: "semantic_decision", reason: "unbound_task" } };
  const context = operationContext.getStore();
  let executionOwner = null;
  if (context?.eventsFile && context.executionId) {
    const manifest = await readJson(path.join(path.dirname(context.eventsFile), "manifest.json"));
    const execution = manifest.executions.find(item => item.id === context.executionId);
    if (!execution) fail("Semantic task lost its execution identity", "execution_generation_stale");
    executionOwner = executionState(await readEvents(context.eventsFile), manifest.run_id, execution);
  }
  const sourceBinding = { packet_sha256: hashJson(packet), fixture_sha256: fixture.sha256,
    operation_id: executionOwner?.operation_id ?? null, generation: executionOwner?.generation ?? null };
  const admit = async () => {
    await executionDispatchBarrier("hitl.semantic-decision", { record: false });
    if (!/^[a-f0-9]{64}$/.test(runProfile.semanticFingerprint ?? "") || await semanticFingerprint(policy) !== runProfile.semanticFingerprint)
      fail("Retained semantic decision dependencies changed", "semantic_definition_drift");
  };
  return withExecutionAdmissionSignal(async signal => {
    const observation = await observeSemantic({ root, request: semanticQuestion(packet), config: policy,
      binding: packet.hitl_binding, sourceBinding, evalRunId, admit, beforeDispatch: () => executionDispatchBarrier("hitl.semantic-decision"), signal, fingerprint: runProfile.semanticFingerprint,
      loadRetryPolicy: () => loadCapacityPolicy(runtimeRoot), skipReason: packet.responses.length !== 1 || packet.unavailable_sources?.length ? "bundle_or_context_ineligible" : null });
    const answers = observation.state === "completed" ? semanticFastPathAnswer(observation.response, policy) : null;
    const covered = answers?.length === 1 && answers[0].id === "uncovered" && answers[0].value === false;
    const reason = observation.reason ?? (covered ? "covered" : answers ? "task_result_insufficient" : "confidence_fallback");
    const metrics = semanticMetrics(observation);
    const filter = { requested_mode: "semantic_decision", provider: policy.provider, model: policy.model,
      min_confidence: policy.min_confidence, observation_file: observation.file, state: observation.state,
      ...metrics, latency_ms: metrics.http_latency_ms, usage: observation.response?.metadata?.usage ?? null,
      confidence: observation.response?.answers?.[0]?.confidence ?? null, attempts: observation.attempts ?? [], reason };
    if (!covered) {
      await markSemanticFallback(root, observation, reason, { admit, signal, fingerprint: runProfile.semanticFingerprint });
      return { judgment: null, filter };
    }
    const verdict = validateGroundedHitl({ schema_id: hitlCoverageContract, status: "covered", response_ids: [packet.responses[0].id], uncovered_questions: [] }, packet);
    const record = await readJson(observation.file);
    const receipt = { schema_id: "dd-eval/hitl-coverage-route@2", decision_source: "semantic_decision", eval_run_id: evalRunId, stage: packet.stage,
      interaction_fixture_sha256: fixture.sha256, packet_sha256: hashJson(packet), policy, policy_sha256: hashJson(policy),
      dependency_sha256: runProfile.semanticFingerprint, source_binding: sourceBinding, observation_sha256: hashJson(record), verdict,
      coverage_filter: filter, delimiter: "dd-eval/hitl-response-delimiter@1", answer_sha256: sha256(packet.responses[0].answer), created_at: now() };
    await withRunnerLock(file, async () => {
      await admit(); signal?.throwIfAborted();
      if (await exists(file) || await exists(path.join(root, "native-intent.json"))) fail("Semantic route already belongs to another decision", "judge_evidence_mismatch");
      if (hashJson(await readJson(path.join(root, "packet.json"))) !== hashJson(packet)) fail("Semantic input changed before publication", "judge_evidence_mismatch");
      await writeJsonAtomic(file, receipt);
    }, { signal });
    await verifySemanticReceipt(root, receipt, packet);
    return { judgment: { decision_source: "semantic_decision", packet, packet_file: path.join(root, "packet.json"), receipt_file: file, verdict, coverage_filter: filter }, filter };
  });
}

export async function interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile, projectRoot, runtimeRoot, contextFile = null, permits = null, evalRunId = null, runtimeBudget = null, controller = null, resourceHome = null, qualificationTimeoutMs = null, hitlBinding = null, expectedPacket = null, qualificationIntent = null }) {
  const compact = runProfile.value.interaction_judge?.verdict_contract === hitlCoverageContract;
  if (hitlBinding !== null && (!isObject(hitlBinding) || hitlBinding.stage !== stage || ![hitlBinding.pause_id, hitlBinding.scope_id].every(value => typeof value === "string" && value.trim()) || !Number.isSafeInteger(hitlBinding.round) || hitlBinding.round < 1)) fail("HITL issuance scope/round binding is invalid", "judge_context_invalid");
  // Compatibility input no longer limits productive Judge work.
  const deadline = null;
  const judgeId = runProfile.value.interaction_judge?.profile_id;
  if (typeof judgeId !== "string") fail(`HITL at ${stage} requires interaction_judge.profile_id`, "interaction_judge_missing");
  let profile;
  const nativeProfile = async () => profile ??= runProfile.qualificationJudgeProfile ?? await frozenJudgeProfile(runProfile.executionContract, judgeId, { standalone: !evalRunId && !hitlBinding });
  const root = path.join(attempt, "interaction-judge", `${stage}-${hitlBinding ? hashJson(hitlBinding).slice(0, 20) : randomUUID().slice(0, 8)}`); await mkdir(root, { recursive: true });
  let filter = null;
  if (compact && hitlBinding && await exists(path.join(root, "packet.json"))) {
    const retained = validateHitlPacket(await readJson(path.join(root, "packet.json")));
    if (retained.schema_id !== hitlCoveragePacketContract || retained.question !== question || retained.stage !== stage || hashJson(retained.hitl_binding) !== hashJson(hitlBinding) || hashJson(retained.responses) !== hashJson(fixture.responses)
      || expectedPacket && hashJson(retained) !== hashJson(expectedPacket)) fail("Retained coverage input changed", "judge_evidence_mismatch");
    const decision = await coverageDecision({ runProfile, fixture, packet: retained, root, evalRunId, runtimeRoot });
    if (decision.judgment) return decision.judgment;
    filter = decision.filter;
  }
  // A published native verdict is reused for this pause; an unknown paid Turn is never repeated.
  if (hitlBinding && await exists(path.join(root, "packet.json")) && (!compact || await exists(path.join(root, "result.json")) || await exists(path.join(root, "native-intent.json")))) {
    await nativeProfile();
    const packet = await readJson(path.join(root, "packet.json"));
    validateHitlPacket(packet);
    if (expectedPacket !== null && hashJson(packet) !== hashJson(validateHitlPacket(expectedPacket))) fail("HITL frozen input packet changed", "judge_context_invalid");
    const responses = fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer }));
    if (packet.question !== question || packet.stage !== stage || hashJson(packet.hitl_binding) !== hashJson(hitlBinding) || hashJson(packet.responses) !== hashJson(responses)) fail("Retained HITL pause packet changed", "judge_evidence_mismatch");
    if (!await exists(path.join(root, "result.json"))) {
      const packetFile = path.join(root, "packet.json");
      if (!await exists(path.join(root, "native-intent.json"))) fail("Existing Judge task has no retained native create intent", "judge_outcome_unknown");
      const retainedIntent = await readJson(path.join(root, "native-intent.json"));
      assertJudgeProfileBinding(retainedIntent, profile);
      const retainedFilter = compact ? retainedCoverageFilter(retainedIntent, packet) : null;
      const { sessionId, prompt } = await retainedJudgeChain(root, packetFile);
      const daemonState = path.join(root, "daemon"), daemonArgs = ["--state-dir", daemonState];
      const judgeEnv = judgeRuntimeEnvironment({ runtimeRoot, daemonState, profile, codexHome: path.join(root, "codex-home"), budget: runtimeBudget ?? (evalRunId ? executionBudget(evalRunId, runProfile.value) : null), controller, resourceHome });
      const nativeContracts = await loadNativeContracts(runtimeRoot), capacityPolicy = await loadCapacityPolicy(runtimeRoot);
      const result = await judgeCapacityPrompt({ profile, capacityPolicy, nativeContracts, sessionId, daemonArgs, root, journal: path.join(root, "events.jsonl"), prompt, packetFiles: [packetFile], packetHashes: [[packetFile, hashJson(packet)]], judgeEnv, recoverOnly: true,
        admit: async () => { if (evalRunId) assertEvalAdmission(await readEvents(path.join(path.dirname(path.dirname(attempt)), "events.jsonl"))); } });
      assertTargetSession(result, profile, ["session", "prompt", "--session-id", sessionId]);
      const verdict = validateGroundedHitl(parseJsonResponse(judgeTurnText(result, profile), "Interaction Judge"), packet);
      await writeJsonAtomic(path.join(root, "result.json"), { schema_id: "dd-eval/interaction-judge-receipt@1", profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, session_id: sessionId, stage, interaction_fixture_sha256: fixture.sha256, packet_sha256: hashJson(packet), verdict, created_at: now(), ...(compact ? { decision_source: "interaction_judge", eval_run_id: evalRunId, coverage_filter: retainedFilter } : {}) });
      await finishJudgeCleanup({ root, profileId: profile.id, nativeContracts, stop: operationId => callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: root, env: judgeEnv, nativeContracts, operationId, timeoutMs: 60_000 }) });
    }
    const receipt = await readJson(path.join(root, "result.json"));
    if (evalRunId || receipt.profile_sha256) assertJudgeProfileBinding(receipt, profile);
    if (receipt.schema_id !== "dd-eval/interaction-judge-receipt@1" || receipt.stage !== stage || typeof receipt.session_id !== "string" || !receipt.session_id.trim() || receipt.profile_id !== profile.id || receipt.packet_sha256 !== hashJson(packet) || receipt.interaction_fixture_sha256 !== fixture.sha256 || compact && (receipt.eval_run_id ?? null) !== evalRunId) fail("Retained HITL verdict binding changed", "judge_evidence_mismatch");
    const verdict = validateGroundedHitl(receipt.verdict, packet, { stored: true });
    const { chain } = await retainedJudgeChain(root, path.join(root, "packet.json"), receipt.session_id);
    const paid = chain.turns.at(-1);
    if (paid.state !== "completed") fail("Published HITL verdict has no completed paid Turn", "judge_outcome_unknown");
    assertTargetSession(paid.result, profile, ["session", "prompt", "--session-id", receipt.session_id]);
    if (hashJson(validateGroundedHitl(parseJsonResponse(judgeTurnText(paid.result, profile), "Interaction Judge"), packet)) !== hashJson(verdict)) fail("Published HITL verdict differs from its original paid Turn", "judge_evidence_mismatch");
    await assertJudgeVerdict(root, receipt);
    return { profile: profile.id, session_id: receipt.session_id, packet_file: path.join(root, "packet.json"), packet, receipt_file: path.join(root, "result.json"), verdict, reused: true, ...(compact ? { coverage_filter: receipt.coverage_filter ?? null } : {}) };
  }
  const subjectContext = contextFile ? await readJson(contextFile) : null;
  const packet = compact && await exists(path.join(root, "packet.json")) ? await readJson(path.join(root, "packet.json")) : await buildHitlPacket({ stage, question, subjectContext, responses: fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer })), readRegularFile, verdictContract: compact ? hitlCoverageContract : hitlMatchContract });
  if (hitlBinding) packet.hitl_binding = hitlBinding;
  validateHitlPacket(packet);
  if (expectedPacket !== null && hashJson(packet) !== hashJson(validateHitlPacket(expectedPacket))) fail("HITL frozen input packet changed", "judge_context_invalid");
  const packetFile = path.join(root, "packet.json"); await writeJsonAtomic(packetFile, packet);
  if (compact) {
    const decision = await coverageDecision({ runProfile, fixture, packet, root, evalRunId, runtimeRoot });
    if (decision.judgment) return decision.judgment;
    filter = decision.filter ?? filter;
  }
  await nativeProfile();
    await withRunnerLock(path.join(root, "native-intent.json"), async () => {
      await executionDispatchBarrier("hitl.native-fallback");
      if (await exists(path.join(root, "native-intent.json"))) fail("Native coverage dispatch has unknown outcome", "judge_outcome_unknown");
      await writeJsonAtomic(path.join(root, "native-intent.json"), { profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, packet_sha256: hashJson(packet), created_at: now(), filter });
    });
  const prompt = interactionJudgePrompt(packetFile, packet);
  const journal = path.join(root, "events.jsonl"); const daemonState = path.join(root, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(root, "codex-home"); const judgeEnv = judgeRuntimeEnvironment({ runtimeRoot, daemonState, profile, codexHome, budget: runtimeBudget ?? (evalRunId ? executionBudget(evalRunId, runProfile.value) : null), controller, resourceHome });
  const nativeContracts = await loadNativeContracts(runtimeRoot, { requireProgress: true, requireTreeSettlement: true });
  const capacityPolicy = await loadCapacityPolicy(runtimeRoot);
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
  // A crash before this barrier cannot have dispatched a native create. The
  // qualification owner holds the existing archive-wide lock throughout.
  let preparedIntent;
  if (qualificationIntent) {
    if (path.dirname(qualificationIntent) !== path.join(attempt, "native-intents")) fail("Qualification intent has foreign ownership", "definition_qualification_invalid");
    preparedIntent = await readJson(qualificationIntent);
    if (preparedIntent.schema_id !== "dd-eval/qualification-intent@2" || preparedIntent.state !== "prepared"
      || hashJson(preparedIntent.identity) !== preparedIntent.native_key || preparedIntent.identity.question !== question
      || preparedIntent.identity.stage !== stage || hashJson(preparedIntent.identity.responses) !== hashJson(packet.responses)) fail("Qualification dispatch intent changed", "definition_qualification_invalid");
    preparedIntent = { ...preparedIntent, judge_root: root, profile_id: profile.id, packet_sha256: hashJson(packet) };
    await writeJsonAtomic(qualificationIntent, preparedIntent);
  }
  let primaryError = null;
  try {
    await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", root, "--journal", journal], { cwd: root, env: judgeEnv, nativeContracts });
    const create = async () => {
      if (qualificationIntent) await writeJsonAtomic(qualificationIntent, { ...preparedIntent, state: "dispatch_intent" });
      return await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", root, ...judgeExecutionArgs(profile), "--journal", journal], { cwd: root, env: judgeEnv, nativeContracts });
    };
    const created = permits ? await permits.use(profile, create) : await create(); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Interaction Judge did not create a Session", "driver_protocol");
    const result = await judgeCapacityPrompt({ profile, capacityPolicy, nativeContracts, sessionId, daemonArgs, root, journal, prompt, packetFiles: [packetFile], packetHashes: [[packetFile, hashJson(packet)]], judgeEnv, permits, deadline,
      admit: async () => { if (evalRunId) assertEvalAdmission(await readEvents(path.join(path.dirname(path.dirname(attempt)), "events.jsonl"))); } });
    const verdict = validateGroundedHitl(parseJsonResponse(judgeTurnText(result, profile), "Interaction Judge"), packet);
    const receipt = { schema_id: "dd-eval/interaction-judge-receipt@1", profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, session_id: sessionId, stage, interaction_fixture_sha256: fixture.sha256, packet_sha256: hashJson(packet), verdict, created_at: now(), ...(compact ? { decision_source: "interaction_judge", eval_run_id: evalRunId, coverage_filter: filter } : {}) };
    const receiptFile = path.join(root, "result.json"); await writeJsonAtomic(receiptFile, receipt);
    return { profile: profile.id, session_id: sessionId, packet_file: packetFile, packet, receipt_file: receiptFile, verdict, raw: result, ...(compact ? { coverage_filter: filter } : {}) };
  } catch (error) { primaryError = error; throw error; }
  finally {
    await finishJudgeCleanup({ root, profileId: profile.id, primaryError, nativeContracts, stop: operationId => callDriver(profile, ["daemon", "stop", ...daemonArgs, ...(primaryError && !isObservationLoss(primaryError) ? ["--cancel-tree"] : [])], { cwd: root, env: judgeEnv, nativeContracts, operationId, timeoutMs: 60_000 }) });
  }
}


async function cancelExecutionTree({ root, manifest, execution, profile, sessionId, launchUnwound = false }) {
  const attempt = path.join(root, "executions", execution.id), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  const managedFile = path.join(attempt, "managed-runtime.json");
  if (await exists(managedFile)) {
    const { binding: managed } = await executionSnapshotBinding(root, execution.id);
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    const options = { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) };
    const scope = ["--run", managed.run_id, "--project-root", projectRoot];
    const requestId = `eval-stop:${sha256(current.operation_id)}`;
    try {
      return await commandJson(runtimeBin(runtimeRoot), ["run", "control", "stop", ...scope, "--request-id", requestId, "--wait-ms", "1000"], options);
    } catch (error) {
      if (error.code !== "run_control_in_progress") throw error;
      const retained = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", ...scope], options);
      if (retained.control?.current !== true || retained.control.requested_mode !== "stop"
        || retained.control.control_id !== error.details?.control_id) throw error;
      // Fatal RUN stop and EVAL cancellation share the current stop owner.
      // The engine alone verifies whether a retained starting/running owner is
      // dead; reuse this stop request rather than creating a new budget.
      if (["starting", "running", "failed"].includes(retained.worker?.status)) return await commandJson(runtimeBin(runtimeRoot),
        ["run", "control", "reconcile", ...scope, "--control-id", retained.control.control_id, "--request-id", requestId], options);
      return retained;
    }
  }
  const stateDir = path.join(attempt, "drivers", "daemon");
  if (!(await exists(path.join(stateDir, "daemon.json")))) {
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    return { settled: !current.started || launchUnwound, reason: !current.started || launchUnwound ? "no_native_daemon_dispatched" : "native_creation_unconfirmed" };
  }
  const canonicalRoot = await realpath(root);
  if (path.dirname(attempt) !== path.join(root, "executions")) fail("Legacy cancellation execution is outside its retained EVAL directory", "execution_scope_invalid");
  for (const target of [projectRoot, runtimeRoot, stateDir, path.join(stateDir, "daemon.json")]) {
    if (await realpath(target) !== path.resolve(canonicalRoot, path.relative(root, target))) fail("Legacy cancellation target is outside its retained execution", "execution_scope_invalid");
  }
  const nativeContracts = await loadNativeContracts(runtimeRoot, { requireTreeSettlement: true }).catch(() => null);
  return cancelOwnedDaemon({ stateDir, projectRoot, sessionId, nativeContracts,
    inspect: () => callDriver(profile, ["session", "inspect", "--state-dir", stateDir, "--session-id", sessionId], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest), nativeContracts }),
    stop: () => callDriver(profile, ["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) }) });
}

/** Reattach and explicit recovery must settle the same known HITL refusal as
 * initial launch. Unknown exceptions never gain terminal/replay authority. */
export async function settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) {
  if (!isConclusiveHitlFailure(error)) return {};
  const events = await readEvents(path.join(root, "events.jsonl"));
  let hitl = [], evidenceError;
  try { hitl = await hitlEvidenceFor(events, execution.id, manifest.run_id, manifest.execution_contract); }
  catch (failure) { evidenceError = errorRecord(failure); }
  if (error.hitl) hitl.push(error.hitl);
  let control;
  try { control = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: subjectSessionFor(events, execution.id), launchUnwound: true }); }
  catch (cleanupError) { control = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
  return { hitl, control, ...(evidenceError ? { evidence_error: evidenceError } : {}) };
}

async function providerTurn(profile, args, options, permits = null) {
  const invoke = async () => {
    const bounded = boundedPromptArgs(profile, args);
    // The harness owns productive-turn liveness.  A second runner watchdog
    // races native child events and can convert host sleep into a false abort.
    const receipt = await callDriver(profile, bounded, options);
    if (args[0] === "session" && args[1] === "prompt") await executionDispatchBarrier("continuation");
    if (profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && receipt?.result?.status === "ERROR") {
      const contracts = options.nativeContracts ?? await loadNativeContracts(options.env?.DD_FLOW_CONFIG_HOME);
      throw contracts.agyTerminalFailure(receipt.result, { provider_session_id: receipt.result.conversation_id || receipt.provider_session_id || null,
        observed_at: receipt.terminal_metadata?.observed_at ?? null, operation_id: options.operationId ?? null, journal_locator: argValue(args, "--journal") });
    }
    if (args[0] === "session" && args[1] === "prompt") assertObservedProfile(receipt, profile, "provider Turn");
    return receipt;
  };
  return permits ? permits.use(profile, invoke) : invoke();
}


async function recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots }) {
  const bin = "dd-flow";
  return await commandJson(bin, ["run", "capacity", "record", runId, "--available-slots", String(availableSlots), "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
}



async function stopCapacityDaemon({ profile, daemon, projectRoot, nativeContracts }) {
  try { return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env, nativeContracts }); }
  catch (error) {
    if (error?.code !== "tree_not_settled") throw error;
    return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs, "--cancel-tree"], { cwd: projectRoot, env: daemon.env, nativeContracts });
  }
}

export async function harnessCapacityCheck({ profileId, maximum, projectRoot = null, writeProfile = true, runtimeRoot: suppliedRuntimeRoot = null }) {
  const max = Number(maximum);
  if (!Number.isInteger(max) || max < 1 || max > 15) fail("--max must be an integer from 1 through 15", "capacity_check_invalid");
  const loaded = await loadProfile(profileId); const profile = loaded.value;
  const root = path.join(evalHome(), "conformance", "native-subagents", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const attempt = path.join(root, "attempt");
  await mkdir(attempt, { recursive: true });
  // A technical probe must not leave provider service files in the definition checkout.
  const project = path.resolve(projectRoot ?? path.join(attempt, "project"));
  if (projectRoot === null) await mkdir(project, { recursive: true });
  const runtimeRoot = suppliedRuntimeRoot ?? path.join(root, "runtime");
  if (!path.isAbsolute(runtimeRoot)) fail("Qualification runtime must be absolute", "harness_config_missing");
  if (suppliedRuntimeRoot === null) await provisionRuntimeEngine(project, runtimeRoot);
  const runtimeArtifact = path.dirname(path.dirname(await realpath(path.join(runtimeRoot, "harness-runtime"))));
  const engine = await readJson(path.join(runtimeArtifact, "engine.json"));
  await verifyEngineArtifact(engine, runtimeArtifact);
  const renderer = await loadDelegationInstructions(runtimeRoot);
  const nativeContracts = await loadNativeContracts(runtimeRoot, { requireProgress: true, requireTreeSettlement: true });
  const capacityPolicy = await loadCapacityPolicy(runtimeRoot);
  const capacityPrompt = renderer.renderCapacityInstructions({ maximum: max, harness: profile.harness });
  const continuationPrompt = "Continue the previously started capacity probe in this same Session. Do not restart fanout or create another child wave. Report the native direct children accepted by that probe.";
  // Qualification is intentionally outside dd-flow. Supplying a flow home
  // would activate adapter lifecycle forwarding and turn a technical child
  // probe into a synthetic RUN/Work interaction.
  const journal = path.join(attempt, "events.jsonl"); const daemon = { daemonArgs: ["--state-dir", path.join(attempt, "daemon"), ...(["grok-acp", "antigravity-cli", "opencode-server", "droid-cli", "droid"].includes(profile.harness) ? ["--no-flow"] : [])], journal, env: { DD_FLOW_CONFIG_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) } };
  const runtimeOwner = await prepareQualificationOwner({ home: evalHome(), caseId: `conformance:${profile.id}`, runtimeRoot,
    resourceHome: path.resolve(runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME), registryFile: homesFile(),
    engine: runtimeEngineIdentity(engine), perHarness: { [harnessConfigKey(profile.harness)]: max + 1 } });
  Object.assign(daemon.env, qualificationProbeEnvironment({ owner: runtimeOwner, runtimeRoot, stateDir: argValue(daemon.daemonArgs, "--state-dir") }));
  let rootSessionId = null; let promptReceipt = null; let inspected = null; let cleanup = null; let failure = null;
  const driverOptions = { cwd: project, env: daemon.env, nativeContracts };
  try {
    if (profile.harness === "codex-desktop") await provisionCapacityCodexHome(daemon.env.CODEX_HOME);
    await callDriver(profile, ["daemon", "start", ...daemon.daemonArgs, "--cwd", project, "--journal", journal], driverOptions);
    const created = await providerTurn(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], driverOptions);
    rootSessionId = created.provider_session_id ?? created.session_id;
    if (typeof rootSessionId !== "string") fail("capacity root has no provider session ID", "driver_protocol");
    const probe = async (ordinal = 0, capacity = null, beforeDispatch = async () => {}, text = ordinal === 0 ? capacityPrompt : continuationPrompt) => {
      await beforeDispatch();
      return providerTurn(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", rootSessionId, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", text, "--journal", journal], { ...driverOptions, ...(capacity ? { operationId: capacity.operation_id, capacityContinuation: capacity } : {}) });
    };
    const inspect = turnId => callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", rootSessionId, ...(turnId ? ["--turn-id", turnId] : []), "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], driverOptions);
    promptReceipt = await boundedCapacityContinuation({ policy: capacityPolicy, nativeContracts, ownerIdentity: { profile, maximum: max, runtimeRoot }, originalPrompt: capacityPrompt, continuationPrompt, sessionId: rootSessionId, attempt: probe, inspect,
        stateFile: path.join(attempt, "capacity-chain.json"), recover: operationId => recoverDriverReply(argValue(daemon.daemonArgs, "--state-dir"), operationId, { nativeContracts }),
        observationClock: operationId => driverObservationClock(argValue(daemon.daemonArgs, "--state-dir"), operationId),
        children: async observed => [...directNativeChildren(observed, rootSessionId, nativeContracts), ...(profile.harness === "codex-desktop" ? await capacityCodexChildren(daemon.env.CODEX_HOME, rootSessionId, nativeContracts) : [])] });
    inspected = await inspect().catch(() => null);
  } catch (error) {
    failure = errorRecord(error);
  } finally {
    cleanup = await stopCapacityDaemon({ profile, daemon, projectRoot: project, nativeContracts }).catch((error) => ({ stopped: false, error: errorRecord(error) }));
    try {
      const retired = await finishQualificationOwner(runtimeOwner, failure ?? (cleanup.stopped === true ? null : { code: "capacity_cleanup_unconfirmed", message: "Capacity daemon stop was not confirmed" }));
      cleanup.scope_retirement = { owner: runtimeOwner.root, physical_stopped: retired.result.physical_stopped, native_settled: retired.result.native_settled };
    } catch (error) { cleanup.scope_retirement = { owner: runtimeOwner.root, error: errorRecord(error) }; failure ??= errorRecord(error); }
  }
  const observedChildren = directNativeChildren(inspected ?? promptReceipt, rootSessionId, nativeContracts);
  const children = profile.harness === "codex-desktop" ? await capacityCodexChildren(daemon.env.CODEX_HOME, rootSessionId, nativeContracts) : observedChildren;
  if (children.some(child => child.provenance === "parent_mismatch")) failure ??= { code: "native_child_parent_mismatch", message: "Capacity evidence contains foreign parentage" };
  const count = (status) => children.filter((child) => child.parent_session_id === rootSessionId && child.status === status).length;
  const receipt = {
    schema_id: "dd-eval/subagent-capacity@1", profile_id: profile.id, harness: profile.harness,
    requested: max, started: children.filter(child => child.parent_session_id === rootSessionId).length, completed: count("completed"), failed_after_start: count("failed"), cancelled_after_start: count("cancelled"), capacity: children.filter(child => child.parent_session_id === rootSessionId).length,
    root_session_id: rootSessionId, children, cleanup, ...(failure ? { failure } : {}), recorded_at: now()
  };
  const receiptFile = path.join(root, "capacity.json"); await writeJsonAtomic(receiptFile, receipt);
  const qualified = qualifiedCapacityProbe(receipt);
  if (writeProfile && qualified) await writeJsonAtomic(loaded.file, { ...profile, subagent_capacity: receipt.capacity });
  return { root, receipt_file: receiptFile, ...receipt, qualified, profile_updated: writeProfile && qualified };
}

async function assertInteractionJudgePreflight({ caseRoot, executions, runProfile, flowContour = stages }) {
  const policies = await Promise.all(executionStages(executions, flowContour).map(async (stage) => [stage, await interactionFixture(caseRoot, stage)]));
  if (policies.some(([, fixture]) => fixture.mode !== "forbidden") && typeof runProfile.value.interaction_judge?.profile_id !== "string") {
    fail("selected stages permit HITL but interaction_judge.profile_id is missing", "interaction_judge_missing");
  }
}

export async function reconcileHitlQualification({ intentFile }) {
  return reconcileQualificationPreparation({ intentFile, home: hitlQualificationHome() });
}
/** Explicit, non-scored Judge qualification; preflight itself never creates Sessions. */
export async function qualifyHitlDefinition({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile);
  const loaded = await loadCase(runProfile.value.case_id);
  const definition = await committedDefinitionIdentity(repoRoot, await definitionSelection(loaded, runProfile), loadedDefinitionInputs(loaded, runProfile));
  const input = await hitlQualificationInputs({ loaded, runProfile, definition });
  if (!input) fail("case does not declare a HITL qualification corpus", "definition_qualification_not_required");
  await mkdir(hitlQualificationHome(), { recursive: true });
  // Shared lock also fences overlapping corpus revisions from paying twice
  // for the same case. Different Subject harnesses share the same Judge tasks.
  return withRunnerLock(path.join(hitlQualificationHome(), "qualification"), async () => {
    const assessed = await reassessHitlQualification(input);
    for (const result of assessed.results) if (result.samples.length && !result.passed && !result.samples.every(sample => sample.comparison.semantic_review_required)) {
      const sample = result.samples.find(sample => !sample.comparison.passed), item = input.corpus.items.find(item => item.id === result.id);
      throw Object.assign(new Error(`Retained Judge verdict differs from current expectation: ${item.id}`), { code: "definition_qualification_mismatch", details: qualificationMismatch(input, item, result.stage, sample.assessment_observed, sample.comparison, sample.receipt_file) });
    }
    if (!assessed.missing.length && await exists(path.join(input.root, "receipt.json"))) return { status: "passed", native_calls: 0, ...(await assertHitlQualification({ loaded, runProfile, definition })), ...(runProfile.coveragePolicy ? { coverage: await qualifyCoverageFilter(input, assessed.results, runProfile.coveragePolicy) } : {}) };
    const attempt = path.join(input.root, `operation-${randomUUID()}`);
    const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    const results = assessed.results;
    let runtimeOwner = null, primaryError = null;
    await mkdir(attempt, { recursive: true });
    try {
      if (assessed.missing.length) {
        await mkdir(projectRoot, { recursive: true });
        await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        input.provenance.engine = runtimeEngineIdentity(await provisionRuntimeEngine(projectRoot, runtimeRoot));
        await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        runtimeOwner = await prepareQualificationOwner({ home: evalHome(), caseId: loaded.value.id, runtimeRoot,
          resourceHome: path.resolve(runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME), registryFile: homesFile(),
          engine: input.provenance.engine, perHarness: executionBudget("qualification", runProfile.value).per_harness });
        for (const item of input.corpus.items.filter(item => assessed.missing.includes(item.id))) {
          const stage = item.stage ?? input.corpus.stage;
          const context = await materializeQualificationContext({ qualified: input, item, caseRoot: loaded.root, output: path.join(attempt, "contexts", `${sha256(item.id)}.json`) });
          const qualificationIntent = path.join(attempt, "native-intents", `${sha256(item.id)}.json`);
          await writeJsonAtomic(qualificationIntent, { schema_id: "dd-eval/qualification-intent@2", state: "prepared", id: item.id, native_key: input.tasks[item.id].key, identity: input.tasks[item.id].identity, provenance: input.provenance });
          let judgment;
          try { judgment = await interactionJudge({ runProfile: { ...nativeOnlyRunProfile(runProfile), qualificationJudgeProfile: input.profile }, fixture: input.fixtures[stage], question: item.question, attempt, stage, projectRoot, runtimeRoot, contextFile: context?.path ?? null, qualificationIntent, runtimeBudget: runtimeOwner.budget, resourceHome: runtimeOwner.resourceHome }); }
          catch (error) {
            const retained = error.details?.retained_verdict;
            if (retained?.verdict?.verdict) {
              const observed = retained.verdict.verdict;
              const comparison = await qualificationComparison(input, item, observed, retained.receipt_file);
              const result = results.find(result => result.id === item.id);
              try { result.samples.push(await qualificationSample({ id: item.id, observed, receipt_file: retained.receipt_file, cleanup: { status: "failed", error: errorRecord(error) } }, attempt, input.profile, input.fixtures[stage].sha256)); }
              catch (sampleError) { error.details = { ...error.details, native_observation_error: errorRecord(sampleError) }; }
              error.details = { ...error.details, ...(comparison.passed ? {} : { semantic_mismatch: { code: "definition_qualification_mismatch", message: `Judge verdict differs from authored expectation: ${item.id}`,
                details: qualificationMismatch(input, item, stage, observed, comparison, retained.receipt_file) } }) };
            }
            throw error;
          }
          const observed = judgment.verdict;
          const comparison = await qualificationComparison(input, item, observed, judgment.receipt_file);
          const cleanup = await observeJudgeCleanup(path.dirname(judgment.receipt_file), await readJson(judgment.receipt_file));
          const result = results.find(result => result.id === item.id);
          result.samples.push(await qualificationSample({ id: item.id, observed, comparison, receipt_file: judgment.receipt_file, cleanup }, attempt, input.profile, input.fixtures[stage].sha256)); result.passed = comparison.passed;
          if (!comparison.passed && !comparison.semantic_review_required) throw Object.assign(new Error(`Judge verdict requires assessment: ${item.id}`), { code: "definition_qualification_mismatch", details: qualificationMismatch(input, item, stage, observed, comparison, judgment.receipt_file, judgment.packet_file) });
        }
        // Keep retained runtime/daemon ownership until ordinary scoped cleanup
        // has proved local retirement; archived qualification keys stay intact.
      }
      if (results.some(result => !result.passed)) throw Object.assign(new Error("Compact coverage needs bound semantic adjudication; native observations are retained, do not repeat them"), { code: "definition_qualification_review_required", details: { review_required: results.filter(result => !result.passed).map(result => {
        const item = input.corpus.items.find(item => item.id === result.id), sample = result.samples[0];
        return { id: item.id, receipt_file: sample.receipt_file, verdict: sample.assessment_observed ?? sample.observed, remaining_decisions: item.coverage_expectation.remaining_decisions,
          review_file: path.join(path.dirname(sample.receipt_file), "coverage-reviews", `${hashJson(item.coverage_expectation)}.json`) };
      }) } });
      const content = { schema_id: hitlQualificationContract, key: input.key, status: "passed", identity: input.identity, results, operation: attempt, cleanup: results.every(result => result.samples.every(sample => sample.cleanup?.status === 'settled')) ? 'settled' : 'pending', provenance: input.provenance };
      const receipt = { ...content, immutable_hash: hashJson(content) };
      await mkdir(input.root, { recursive: true });
      await writeJsonAtomic(path.join(input.root, "receipt.json"), receipt);
      return { status: "passed", key: input.key, receipt_file: path.join(input.root, "receipt.json"), native_calls: assessed.missing.length, reused_cases: results.length - assessed.missing.length, results,
        ...(runProfile.coveragePolicy ? { coverage: await qualifyCoverageFilter(input, results, runProfile.coveragePolicy) } : {}) };
    } catch (error) {
      primaryError = error;
      await mkdir(attempt, { recursive: true });
      await writeJsonAtomic(path.join(attempt, "failure.json"), { schema_id: hitlQualificationContract, key: input.key, identity: input.identity, provenance: input.provenance, operation: attempt, status: "failed", results, error: errorRecord(error) });
      throw error;
    } finally {
      if (runtimeOwner) {
        try { await finishQualificationOwner(runtimeOwner, primaryError); }
        catch (error) { if (primaryError) primaryError.cleanup_error ??= errorRecord(error); else throw error; }
      }
    }
  });
}

export async function evalPreflight({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile);
  if (memoryProfileSelection(runProfile.value.subject)?.delegation === 'native') throw Object.assign(new Error('Native preparation requires an authorized execution, not provider-free preflight'), { code: 'native_preparation_pending', details: { effect: 'no_effect', provider_sessions_created: 0 } });
  const loaded = await loadCase(runProfile.value.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  const definition = await committedDefinitionIdentity(repoRoot, await definitionSelection(loaded, runProfile), loadedDefinitionInputs(loaded, runProfile));
  const executions = selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage, case_contour: loaded.value.flow.contour });
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

export async function evalRun({ profileFile, prepareOnly = false, expectedInputs }) {
  const runProfile = await loadRunProfile(profileFile);
  const loaded = await loadCase(runProfile.value.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  const executions = selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage, case_contour: loaded.value.flow.contour });
  runProfile.executionContract = await resolveRunContract(runProfile, executionStages(executions, loaded.value.flow.contour), loaded);
  const profile = contractProfile(runProfile.executionContract, runProfile.value.subject.profile_id);
  if (expectedInputs !== undefined) {
    const guardedExecutions = selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage, case_contour: loaded.value.flow.contour });
    assertExpectedExecutionInputs(expectedInputs, { profile: runProfile.value, contract: runProfile.executionContract,
      checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 },
      fixtures: await interactionFixtureManifest(loaded.root, guardedExecutions, null, loaded.value.flow.contour),
      contextSha256: executionContextHash(validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded), executionStages(guardedExecutions, loaded.value.flow.contour)) });
  }
  const definition = await committedDefinitionIdentity(repoRoot, await definitionSelection(loaded, runProfile), loadedDefinitionInputs(loaded, runProfile));
  await assertHitlQualification({ loaded, runProfile, definition });
  assertFinalJudgeScope({ profile: runProfile.value, executions, assessment: loaded.assessment });
  const needsEntryPack = selectionNeedsEntryPack(executions);
  if (needsEntryPack && typeof loaded.value.entry_pack !== "string") fail("focused or segment execution requires an accepted entry pack");
  const validated = needsEntryPack ? await fixturesValidate({ caseId: runProfile.value.case_id }) : null;
  return executeEval({ runProfile, profile, loaded, validated, definition, executions, prepareOnly, expectedInputs });
}

/** Prepare (and optionally dispatch) a derived EVAL from a sealed dd-flow
 * stage boundary. The source EVAL is never opened for writing. */
export async function runnerFork({ evalRoot, executionId = "e2e", from, output, engineVersion, integrityChecksum = null, requestId, start = false }) {
  const sourceRoot = path.resolve(evalRoot), root = path.resolve(output);
  if (typeof from !== "string" || !/^[a-z][a-z0-9-]*-[a-f0-9]{64}$/.test(from) || !path.isAbsolute(output)) fail("fork checkpoint or output is invalid", "fork_input_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId ?? "")) fail("fork requires a stable request ID", "fork_input_invalid");
  if (typeof engineVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+.-]{0,127}$/.test(engineVersion) || (integrityChecksum !== null && !/^[a-f0-9]{64}$/.test(integrityChecksum))) fail("fork engine selection is invalid", "fork_input_invalid");
  if (root === sourceRoot || root.startsWith(`${sourceRoot}${path.sep}`) || sourceRoot.startsWith(`${root}${path.sep}`)) fail("fork output must not overlap source EVAL", "fork_path_conflict");
  const snapshot = path.resolve(sourceRoot, "executions", executionId, "boundaries", from);
  const intentFile = path.join(root, ".fork-intent.json"), receiptFile = path.join(root, "fork.json");
  const retainedReceipt = async freshIntent => {
    if (!(await exists(receiptFile))) return null;
    const receipt = await readJson(receiptFile), retained = receipt?.intent;
    const sameRequest = retained?.request_id === requestId && retained?.source_eval === sourceRoot
      && retained?.source_execution === executionId && retained?.snapshot === snapshot
      && retained?.engine_version === engineVersion && (retained?.integrity_checksum ?? null) === integrityChecksum;
    if (!sameRequest || freshIntent && hashJson(retained) !== hashJson(freshIntent)) fail("fork output belongs to another request", "fork_request_conflict");
    return receipt;
  };
  // A completed fork is authoritative. Its source checkpoint may already have
  // been archived, so replay must not reopen source manifest/snapshot bytes.
  const replay = await retainedReceipt(null);
  if (replay) return start ? await startForkedExecution({ root, receipt: replay }) : replay;
  const source = await readJson(path.join(sourceRoot, "manifest.json"));
  const execution = source.executions?.find(item => item.id === executionId);
  if (!execution) fail(`source EVAL has no execution: ${executionId}`, "execution_unknown");
  const snapshotBytes = await readFile(path.join(snapshot, "snapshot.json"));
  const snapshotManifest = JSON.parse(snapshotBytes);
  if (!isStageRunSnapshot(snapshotManifest) || snapshotManifest.purpose !== "stage_entry" || typeof snapshotManifest.stage_entry !== "string") fail("fork requires a supported stage-entry checkpoint", "fork_checkpoint_invalid");
  const registryFile = homesFile(), resourceHome = process.env.DD_FLOW_RESOURCE_HOME ?? source.runtime_resource_home;
  if (typeof resourceHome !== 'string' || !path.isAbsolute(resourceHome)) fail('Fork requires an absolute resource home', 'runtime_scope_identity_missing');
  const intent = { schema_id: "dd-eval/runner-fork-intent@1", request_id: requestId, source_eval: sourceRoot, source_execution: executionId, snapshot, snapshot_sha256: sha256(snapshotBytes), engine_version: engineVersion, integrity_checksum: integrityChecksum, target_stage: snapshotManifest.stage_entry, eval_registry_file: registryFile, runtime_resource_home: resourceHome };
  const loaded = await loadCase(source.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  await assertRetainedRunDefinition(source, loaded);
  const inheritedStages = inheritedFlowStages(snapshotManifest.stage_entry, loaded.value.flow.contour);
  const derivedExecution = { ...execution, id: executionId, stage: snapshotManifest.stage_entry };
  const contour = loaded.value.flow.contour;
  if (contour.indexOf(derivedExecution.stage) < 0 || contour.indexOf(derivedExecution.stage) > contour.indexOf(derivedExecution.terminal_stage)) fail("Fork checkpoint is beyond the retained execution target", "fork_checkpoint_invalid");
  if (execution.completion_scope) derivedExecution.completion_scope = { ...execution.completion_scope,
    entry_stage: derivedExecution.stage, case_contour: [...contour], requested_full_case: derivedExecution.stage === contour[0]
      && derivedExecution.terminal_stage === loaded.value.flow.terminal_stage };
  const interactionFixtures = await interactionFixtureManifest(loaded.root, [derivedExecution], source, loaded.value.flow.contour);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [derivedExecution], runProfile: { value: source.profile }, flowContour: loaded.value.flow.contour });
  assertProfileCapacity(source.subject_profile, [derivedExecution], source.execution_contract);
  const sourceEvents = await readEvents(path.join(sourceRoot, "events.jsonl"));
  const baselineAdmission = sourceEvents.findLast(event => event.executionid === executionId && event.type === "dev.dd.eval.execution.context_prepared" && event.data?.baseline_admission)?.data.baseline_admission;
  const baselineEvidence = await verifyBaselineAdmission({ reference: baselineAdmission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: source.check_resources });
  const inheritedEngine = await inheritedForkEngine({ sourceRoot, executionId, engineVersion, integrityChecksum });
  // All read-only preparation precedes even the lifecycle lock's directory.
  await mkdir(path.dirname(root), { recursive: true });
  const receipt = await withRunnerLock(`${root}.lifecycle`, async () => {
    const retained = await retainedReceipt(intent);
    if (retained) return retained;
    if (await exists(root) && (await readdir(root)).length) {
      const recorded = await readJson(intentFile).catch(() => null);
      if (!recorded || hashJson(recorded.intent) !== hashJson(intent)) fail("fork output must be empty", "fork_output_not_empty");
      const allowed = new Set([".fork-intent.json", "fork-tools", "control-runtime", "executions", "manifest.json", "events.jsonl"]);
      const unknown = (await readdir(root)).filter(name => !allowed.has(name));
      if (unknown.length) fail("fork retry requires inspection because output has unowned data", "fork_retry_inspect_required");
      await Promise.all(["fork-tools", "control-runtime", "executions", "manifest.json", "events.jsonl"].map(name => rm(path.join(root, name), { recursive: true, force: true })));
    }
    // Register only after every caller-controlled input and retained source
    // artifact has been accepted.  Invalid fork arguments must not leak a
    // ghost EVAL home into the shared registry.
    await registerRunHome(root, registryEnvironment({ eval_registry_file: registryFile }));
    await mkdir(root, { recursive: true });
    await writeJsonAtomic(intentFile, { schema_id: "dd-eval/runner-fork-intent@1", intent });
    const toolsRoot = path.join(root, "fork-tools"); const managedRoot = path.join(root, "executions", executionId);
    const runId = `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    await mkdir(toolsRoot, { recursive: true });
    // `dd-flow run fork` installs the bytes of its own executable into the
    // restored private home before binding the RUN.  Pick that executable by
    // immutable artifact identity; never substitute the ambient router.
    // Do not route the fork through the operator's global CLI.  Apart from
    // potentially selecting different bytes, an older router may not even
    // implement `run fork`.  The verified retained engine is the only
    // executable authorized to restore this checkpoint.
    const engine = inheritedEngine.manifest;
    await installRuntimeShim(toolsRoot, engine, { resourceHome, registryFile });
    const operational = source.profile.operational_decision ? await materializeOperationalDecision({ declaration: source.profile.operational_decision, projectRoot: path.join(managedRoot, "project"), runtimeRoot: toolsRoot, evalId: runId, executionId, sourceRoot: path.join(snapshot, "project"), output: path.join(toolsRoot, "operational-decision.json") }) : null;
    const fork = await commandJson(path.join(inheritedEngine.root, engine.entrypoint), ["run", "fork", "--from", snapshot, "--output", managedRoot, "--engine-version", engineVersion, "--request-id", requestId, ...(integrityChecksum ? ["--integrity-checksum", integrityChecksum] : []), ...(operational ? ["--operational-decision-file", operational.file] : [])], { cwd: root, env: runtimeEnv(toolsRoot, { DD_FLOW_RESOURCE_HOME: resourceHome, DD_EVAL_REGISTRY_FILE: registryFile, DD_FLOW_RECOVERY_HOME: path.join(root, "recovery") }) });
    if (fork.status !== "ready" || fork.fork?.target_stage !== snapshotManifest.stage_entry) fail("dd-flow fork did not produce the requested ready stage", "fork_prepare_failed");
    await ignoreEvalLocalState(fork.fork.project_root);
    // The restored home now binds the selected artifact, but it still lacks a
    // runtime shim.  Install that shim directly from the exact artifact.
    const boundRoot = fork.fork.engine?.snapshot_root;
    if (typeof boundRoot !== "string" || !path.isAbsolute(boundRoot)) fail("Fork did not publish its bound engine artifact", "fork_engine_mismatch");
    const managedEngine = await readJson(path.join(boundRoot, "engine.json"));
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(engine))) fail("Fork bound an engine other than the selected artifact", "fork_engine_mismatch");
    await installRuntimeShim(fork.fork.dd_flow_home, managedEngine, { resourceHome, registryFile });
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(fork.fork.engine)) || managedEngine.package_version !== engineVersion || (integrityChecksum && runtimeEngineIdentity(managedEngine).integrity_checksum !== integrityChecksum)) fail("fork runtime differs from its requested or bound engine", "fork_engine_mismatch");
    await verifyEngineArtifact(managedEngine);
    if (source.execution_contract) {
      await materializeExecutionContract(fork.fork.dd_flow_home, source.execution_contract);
      await assertManagedContract({ runtimeRoot: fork.fork.dd_flow_home, projectRoot: fork.fork.project_root, runId: fork.fork.run_id, contract: source.execution_contract });
    }
    for (const workspace of new Set([fork.fork.project_root, fork.fork.workspace_root].filter(Boolean))) await qualifyWorkspaceHooks(source.subject_profile, workspace, fork.fork.dd_flow_home, { install: true, execution: source.profile.subject.execution });
    await writeJsonAtomic(path.join(managedRoot, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: fork.fork.run_id, run_home: fork.fork.run_home, project_root: fork.fork.project_root, runtime_root: fork.fork.dd_flow_home, runtime_budget: executionBudget(runId, source.profile) });
    const baselineRoot = path.join(managedRoot, "baseline-admission");
    await mkdir(baselineRoot, { recursive: true });
    const retainedBaseline = { ...baselineAdmission, file: path.join(baselineRoot, "receipt.json") };
    await cp(baselineAdmission.file, retainedBaseline.file);
    for (const check of baselineEvidence.checks.filter(check => check.log)) {
      const file = contained(path.dirname(baselineAdmission.file), check.log, "baseline log");
      if (sha256(await readFile(file)) !== check.log_sha256) fail("Inherited baseline log changed", "baseline_admission_evidence_mismatch");
      const destination = contained(baselineRoot, check.log, "baseline log");
      await mkdir(path.dirname(destination), { recursive: true }); await cp(file, destination);
    }
    await verifyBaselineAdmission({ reference: retainedBaseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: source.check_resources });
    const controlRoot = path.join(root, "control-runtime");
    await mkdir(controlRoot, { recursive: true });
    const controlEngine = await materializeEngineArtifact({ source: managedEngine, sourceRoot: managedEngine.snapshot_root, runtimeRoot: controlRoot });
    await installRuntimeShim(controlRoot, controlEngine, { resourceHome, registryFile });
    const manifest = { ...source, kind: "derived", run_id: runId, eval_registry_file: registryFile, runtime_resource_home: resourceHome, runtime_control_bin: runtimeBin(controlRoot), runtime_recovery_home: path.join(root, "recovery"), evidence_contract: "dd-eval/evaluator-evidence@2", interaction_fixtures: interactionFixtures, created_at: now(), executions: [derivedExecution], derived_from: { source_eval: sourceRoot, source_execution: executionId, checkpoint: snapshot, checkpoint_sha256: intent.snapshot_sha256, inherited_stages: inheritedStages, engine: runtimeEngineIdentity(managedEngine), baseline_admission: retainedBaseline } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId, executionId, type: "dev.dd.eval.fork.ready", data: { intent, fork, engine: runtimeEngineIdentity(engine) } });
    const receipt = { ok: true, schema_id: "dd-eval/runner-fork@1", status: "ready", intent, root, run_id: runId, execution: executionId, fork, next_command: `dd-eval runner fork --eval ${JSON.stringify(sourceRoot)} --execution ${executionId} --from ${from} --output ${JSON.stringify(root)} --engine-version ${engineVersion} --request-id ${requestId}${integrityChecksum ? ` --integrity-checksum ${integrityChecksum}` : ""} --start true` };
    await writeJsonAtomic(receiptFile, receipt);
    return receipt;
  });
  return start ? await startForkedExecution({ root, receipt }) : receipt;
}

/** List Stage-entry manifest candidates. The selected engine must still
 * verify payloads, Git custody and compatibility before admitting a fork. */
async function startForkedExecution({ root, receipt }) {
  // Fork preparation owns a different lock. Release it before the ordinary
  // detached continuation owner acquires lifecycle admission.
  const { requestRunnerContinuation } = await import("./eval-resume-worker.mjs");
  const continuation = await requestRunnerContinuation({ evalRoot: root, kind: "run", requestId: `fork:${receipt.run_id}` });
  const updated = { ...receipt, status: "accepted", continuation };
  await writeJsonAtomic(path.join(root, "fork.json"), updated);
  return updated;
}

async function preparedForkRun({ root, manifest, execution, loaded }) {
  const receipt = await readJson(path.join(root, "fork.json"));
  const fork = receipt.fork?.fork;
  const attempt = path.join(root, "executions", execution.id);
  const projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  if (receipt.run_id !== manifest.run_id || receipt.execution !== execution.id || receipt.fork?.status !== "ready" || fork?.target_stage !== execution.stage || fork?.project_root !== projectRoot || fork?.dd_flow_home !== runtimeRoot || receipt.intent?.snapshot_sha256 !== manifest.derived_from?.checkpoint_sha256) fail("Prepared fork does not match its EVAL manifest", "fork_prepare_failed");
  const { binding: managed } = await executionSnapshotBinding(root, execution.id, { run_id: fork.run_id });
  if (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile))) fail("Prepared fork runtime scope changed", "execution_scope_invalid");
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
  const engine = resolved.selection?.selected;
  await assertExecutionEngine(manifest, loaded.inputCheckpoint, engine);
  // A stage-entry restore preserves historical runtime bytes. Refresh the
  // mutable harness routing in the new execution home before dispatch so
  // adapter calls cannot point back into the source EVAL.
  await prepareRuntimeHarnessConfig(runtimeRoot);
  if (manifest.execution_contract) await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
  await assertManagedContract({ runtimeRoot, projectRoot, runId: fork.run_id, contract: manifest.execution_contract });
  for (const workspace of new Set([projectRoot, fork.workspace_root].filter(Boolean))) await qualifyWorkspaceHooks(manifest.subject_profile, workspace, runtimeRoot, { execution: manifest.profile.subject.execution });
  let baseline = manifest.derived_from.baseline_admission;
  const retained = await verifyBaselineAdmission({ reference: baseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources });
  if (retained.schema_id === 'dd-eval/baseline-admission@3') {
    const outputRoot = path.join(attempt, 'fork-world-readiness');
    const file = path.join(outputRoot, 'receipt.json');
    if (await exists(file)) baseline = { file, sha256: sha256(await readFile(file)), project_root: projectRoot };
    else baseline = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot, checkpoint: loaded.inputCheckpoint, inheritedBaseline: baseline,
      runtimeScope: { bin: runtimeBin(runtimeRoot), home: runtimeRoot, resourceHome: manifest.runtime_resource_home, budget: executionBudget(manifest.run_id, manifest.profile), operationId: `${manifest.run_id}:${execution.id}:fork-readiness` }, checkResources: manifest.check_resources });
    await verifyBaselineAdmission({ reference: baseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources, projectRoot });
  }
  return { run_id: fork.run_id, run_home: fork.run_home, workspace_root: fork.workspace_root, engine, baseline_admission: baseline };
}

async function prepareEvalInputs({ runProfile, profile, loaded, validated, executions: suppliedExecutions, suppliedPack }) {
  validateRunProfile(runProfile?.value);
  validateHarnessProfile(profile);
  if (loaded?.value?.id !== runProfile.value.case_id || profile.id !== runProfile.value.subject.profile_id) fail("EVAL input profiles belong to another case or subject", "control_input_invalid");
  const executions = suppliedExecutions ?? selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage, case_contour: loaded.value.flow.contour });
  const executionContract = runProfile.executionContract ?? await resolveRunContract(runProfile, executionStages(executions, loaded.value.flow.contour), loaded);
  validateExecutionContract(executionContract);
  runProfile.executionContract = executionContract;
  validateExecutionDescriptors(executions, loaded.value.flow.contour);
  assertCompletionScopes(runProfile.value, executions, loaded.value.flow);
  assertFinalJudgeScope({ profile: runProfile.value, executions, assessment: loaded.assessment });
  assertProfileCapacity(profile, executions, executionContract);
  const interactionFixtures = await interactionFixtureManifest(loaded.root, executions, null, loaded.value.flow.contour);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions, runProfile, flowContour: loaded.value.flow.contour });
  const directBlueprint = executions.some(execution => execution.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
  const packBytes = validated ? (suppliedPack ? Buffer.from(`${JSON.stringify(suppliedPack, null, 2)}\n`) : await readRegularFile(validated.entry_pack)) : null;
  const pack = packBytes ? validateEntryPack(parseJsonBytes(packBytes, validated.entry_pack), loaded.value.id, loaded.value.flow) : null;
  const packRoot = validated ? path.dirname(validated.entry_pack) : null;
  const blueprint = pack ? validateCaseBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")), loaded) : null;
  const entryPackManifest = validated ? { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(packBytes) } : null;
  const focusedEntries = await prepareFocusedEntries(executions, pack, packRoot);
  return { executions, interactionFixtures, directBlueprint, blueprint, pack, packRoot, entryPackManifest, focusedEntries, executionContract };
}

export async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored", executions: suppliedExecutions = null, prepareOnly = false, preparedInputs = null, expectedInputs }) {
  const registryFile = homesFile();
  const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(evalHome(), "runs", runId); const events = path.join(root, "events.jsonl");
  const prepared = preparedInputs ?? await prepareEvalInputs({ runProfile, profile, loaded, validated, executions: suppliedExecutions });
  const { executions, interactionFixtures, entryPackManifest, pack, packRoot, executionContract } = prepared;
  if (expectedInputs !== undefined) assertExpectedExecutionInputs(expectedInputs, { profile: runProfile.value, contract: executionContract,
    checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, fixtures: interactionFixtures,
    contextSha256: executionContextHash(prepared.directBlueprint ?? prepared.blueprint, executionStages(executions, loaded.value?.flow?.contour ?? stages)) });
  await registerRunHome(root, registryEnvironment({ eval_registry_file: registryFile }));
  await mkdir(path.dirname(root), { recursive: true });
  // Read admission only after an existing initial owner finishes publication,
  // but release lifecycle ownership before cross-EVAL retirement can wait.
  await withRunnerLock(`${path.resolve(root)}.lifecycle`, async () => assertEvalAdmission(await readEvents(events)));
  const controlRoot = path.join(path.resolve(root), "control-runtime");
  await provisionRuntimeEngine(loaded.root, controlRoot, { controlOnly: true, resourceHome: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME) });
  const launchResources = !prepareOnly ? await prepareLaunchResources(root) : null;
  if (!prepareOnly) await withPriorEvalRetirement({ caseId: loaded.value.id, resourceHome: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), excludeRoot: root, launchResources,
    maintenanceHome: controlRoot, maintenanceBin: runtimeBin(controlRoot) }, () => writeJsonAtomic(path.join(root, "launch-reservation.json"), {
      schema_id: "dd-eval/launch-reservation@1", run_id: runId, root, resource_home: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), resource_bindings: launchResources, created_at: now()
    }));
  // Initial and resumed observers share ownership through final projection;
  // publishing a manifest must not expose an unlocked, launchable queue.
  let result, primaryError;
  try {
  result = await withRunnerLock(`${path.resolve(root)}.lifecycle`, async () => {
    assertEvalAdmission(await readEvents(events));
    // Operator control must survive an update/removal of the ambient CLI.
    // Reuse the same isolated engine installation as productive RUNs, without
    // requiring provider configuration for this control-only home.
    const controlBin = runtimeBin(controlRoot);
    const manifest = { schema_id: "dd-eval/runner-manifest@1", eval_registry_file: registryFile, flow: structuredClone(loaded.value.flow), runtime_resource_home: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), kind, run_id: runId, case_id: loaded.value.id, entry_pack: entryPackManifest, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, ...(definition ? { definition } : {}), ...(loaded.value.case_acceptance ? { case_acceptance: loaded.value.case_acceptance } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions };
    manifest.execution_contract = executionContract;
    manifest.check_resources = selectCheckResources(manifest.runtime_resource_home);
    await mkdir(manifest.check_resources.playwright_browsers_path, { recursive: true });
    manifest.stage_context_sha256 = executionContextHash(prepared.directBlueprint ?? prepared.blueprint, executionStages(executions, loaded.value.flow.contour));
    manifest.runtime_control_bin = controlBin;
    if (runProfile.value.semantic_decisions?.enabled) manifest.semantic_dependency_sha256 = runProfile.semanticFingerprint ?? await semanticFingerprint(runProfile.value.semantic_decisions);
    if (runProfile.coveragePolicy) {
      manifest.hitl_coverage_policy = runProfile.coveragePolicy;
      manifest.hitl_coverage_policy_sha256 = hashJson(runProfile.coveragePolicy);
    }
    manifest.runtime_recovery_home = path.join(path.resolve(root), "recovery");
    manifest.evidence_contract = "dd-eval/evaluator-evidence@2";
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
    if (prepareOnly) return { root, run_id: runId, state: "planned" };
    return executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared, admission: preparedQueueAdmission });
  });
  return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    if (!prepareOnly) {
      try {
        const manifest = await readJson(path.join(root, "manifest.json"));
        if (retirementEligible(manifest, await readEvents(events))) {
          const { requestRunnerContinuation } = await import("./eval-resume-worker.mjs");
          await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId: `auto-cleanup:initial:${runId}`, cleanupOrigin: "automatic" });
        }
      } catch (error) {
        if (primaryError) primaryError.cleanup_error ??= errorRecord(error);
        else if (result) result.cleanup_error ??= errorRecord(error);
        else if (error.code !== "ENOENT") throw error;
      }
    }
  }
}


const preparedQueueAdmission = Symbol("fresh productive admission");
async function executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared = null, admission }) {
    if (admission !== preparedQueueAdmission) fail("Prepared queue requires a fresh productive barrier", "execution_scope_invalid");
    const reservation = await readJson(path.join(root, "launch-reservation.json"));
    if (reservation.run_id !== manifest.run_id || reservation.root !== root || reservation.resource_home !== manifest.runtime_resource_home) fail("Launch reservation belongs to another EVAL", "execution_scope_invalid");
    const directBlueprint = prepared ? prepared.directBlueprint : manifest.executions.some(execution => execution.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
    const focusedBlueprint = prepared ? prepared.blueprint : pack ? validateCaseBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")), loaded) : null;
    if (!prepared) {
      await interactionFixtureManifest(loaded.root, manifest.executions, manifest, loaded.value?.flow?.contour ?? stages);
      await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile, flowContour: loaded.value?.flow?.contour ?? stages });
    }
    const permits = createHarnessPermits(runProfile);
    const focusedEntries = prepared?.focusedEntries ?? (manifest.kind === "derived" ? {} : await prepareFocusedEntries(manifest.executions, pack, packRoot));
    let stopAfterInfrastructureFailure = false;
    const results = await mapLimited(manifest.executions, runProfile.value.concurrency.global, execution => launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : focusedBlueprint, pack, packRoot, preparedEntry: focusedEntries[execution.id], permits, onInfrastructureFailure: () => { stopAfterInfrastructureFailure = true; } }), () => !stopAfterInfrastructureFailure);
    await cancelInfrastructureQueue({ root, manifest });
    const finalized = await finalizeRunProjection({ root, manifest, loaded, results, permits });
    return { run_id: manifest.run_id, root, executions: finalized.results, judge_status: finalized.report.judge_status, ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation };
}

export async function launchEvalExecution({ root, manifest, execution, loaded, blueprint, pack = null, packRoot = null, preparedEntry = null, permits, onInfrastructureFailure = () => {} }) {
    const runId = manifest.run_id, events = path.join(root, "events.jsonl"), home = evalHome(), profile = manifest.execution_contract ? contractProfile(manifest.execution_contract, manifest.profile.subject.profile_id) : manifest.subject_profile, runProfile = retainedRunProfile(manifest);
    const opId = `${runId}:${execution.id}:launch`;
    if (manifest.kind !== "derived" && execution.mode !== "e2e" && !preparedEntry) {
      assertEvalExecutionDispatch(await readEvents(events), runId, execution, opId);
      preparedEntry = (await prepareFocusedEntries([execution], pack, packRoot))[execution.id];
    }
    const startedAt = now();
    // Keep the evidence variables in the execution scope.  The operation
    // wrapper deliberately rethrows so that this catch can write a durable
    // failed-execution record; declarations inside its callback are otherwise
    // unavailable precisely on an early terminal failure.
    const failureAttempt = path.join(root, "executions", execution.id);
    let attempt = failureAttempt;
    let projectRoot = null;
    let runtimeRoot = null;
    let lifecycle = null;
    const boundaries = [];
    const hitl = [];
    let launcher = null;
    let prompted = null;
    let restored;
    try {
      const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, beforeStart: latest => assertEvalExecutionDispatch(latest, runId, execution, opId), action: async () => {
      await executionDispatchBarrier("execution.prepare");
      if (manifest.kind !== "derived" && await exists(failureAttempt)) fail("Unstarted execution already has preparation artifacts; reconcile their ownership before launch", "execution_preparation_unproven");
      attempt = failureAttempt; projectRoot = path.join(attempt, "project"); runtimeRoot = path.join(attempt, "dd-flow-home");
      await interactionFixtureManifest(loaded.root, [execution], manifest, loaded.value?.flow?.contour ?? stages);
      if (manifest.kind === "derived") {
        restored = await preparedForkRun({ root, manifest, execution, loaded });
      } else {
      const baselineScope = { bin: runtimeBin(runtimeRoot), home: runtimeRoot, resourceHome: manifest.runtime_resource_home, budget: executionBudget(runId, runProfile.value), operationId: opId };
      const executionRoutingFile = path.join(attempt, "execution-routing.json");
      await writeJsonAtomic(executionRoutingFile, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
      if (!manifest.execution_contract) fail("New execution requires a retained execution contract", "execution_contract_missing");
      await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
      const memory = isInstalledFlow(loaded.value?.flow?.id);
      let entry;
      if (execution.mode === "e2e") {
        restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        restored.engine = await provisionRuntimeEngine(projectRoot, runtimeRoot, { resourceHome: manifest.runtime_resource_home });
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine, loaded.value.case_acceptance);
        restored.managed_tools = await prepareDeclaredManagedTools({ checkpoint: loaded.inputCheckpoint, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot });
        const operational = await materializeOperationalDecision({ declaration: runProfile.value.operational_decision, projectRoot, runtimeRoot, evalId: runId, executionId: execution.id, commitOwnedProfile: true, flowId: initialFlowBoundary(loaded).flow });
        if (operational?.materialized_commit) restored.materialized_commit = operational.materialized_commit;
        const admission = await admitContractProfiles(manifest.execution_contract, projectRoot, runtimeRoot);
        await writeJsonAtomic(path.join(attempt, "harness-admission.json"), admission);
        restored.workspace_hooks = await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
        if (!memory) {
          restored.baseline_admission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint, beforeCommand: id => executionDispatchBarrier(`baseline:${id}`), runtimeScope: baselineScope, checkResources: manifest.check_resources });
          await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        }
        entry = { snapshot: { kind: "bootstrap", run_id: null } };
      } else {
        entry = preparedEntry;
        restored = await restoreStageSnapshot({ home, entry, stage: execution.stage, projectRoot, runtimeRoot, executionRoutingFile, executionContract: manifest.execution_contract, resourceHome: manifest.runtime_resource_home, operational: { declaration: runProfile.value.operational_decision, evalId: runId, executionId: execution.id },flowId:initialFlowBoundary(loaded).flow });
        await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
        await admitContractProfiles(manifest.execution_contract, projectRoot, runtimeRoot);
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine, loaded.value.case_acceptance);
        restored.managed_tools = await prepareDeclaredManagedTools({ checkpoint: loaded.inputCheckpoint, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot });
        const baselineProject = path.join(attempt, "baseline-project");
        await prepareE2EInput({ projectRoot: baselineProject, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        for (const workspace of new Set([projectRoot, restored.workspace_root, baselineProject].filter(Boolean))) await qualifyWorkspaceHooks(profile, workspace, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
        restored.baseline_admission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot: baselineProject, outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint, beforeCommand: id => executionDispatchBarrier(`baseline:${id}`), runtimeScope: baselineScope, checkResources: manifest.check_resources });
      }
      if (!restored.run_id) {
        const prepared = await prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId: `eval:${runId}:${execution.id}`, bin: runtimeBin(runtimeRoot), env: evalRuntimeEnv(runtimeRoot, manifest), projectRoot, slug: "eval-subject", executionRoutingFile });
        restored = { ...restored, run_id: prepared.run_id, run_home: prepared.run_root };
        if (memory && execution.mode === 'e2e') restored.baseline_admission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint, beforeCommand: id => executionDispatchBarrier(`baseline:${id}`), runtimeScope: baselineScope, checkResources: manifest.check_resources });
      }
      await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
      await assertManagedContract({ runtimeRoot, projectRoot, runId: restored.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
      }
      await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: restored.run_id, run_home: restored.run_home, project_root: projectRoot, runtime_root: runtimeRoot, resource_home: manifest.runtime_resource_home, runtime_budget: executionBudget(runId, runProfile.value) });
      for (const note of restored.baseline_admission?.technical_notes ?? []) await recordTechnicalNote(events, runId, { ...note, source_operation_id: opId, consequence: 'cleanup_pending' });
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { execution: runProfile.value.subject.execution });
      const managedResult = await observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, boundaries, hitl,
        onProgress: value => { lifecycle = value.lifecycle ?? lifecycle; prompted = value.driver ?? prompted; } });
      lifecycle = managedResult.lifecycle; prompted = managedResult.driver;
      return managedResult;
      }});
      const completed = result.result ?? result;
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, execution_operation_id: opId, result: completed } });
      return completed;
    } catch (error) {
      // An RPC timeout only says this client did not observe the native
      // operation. Keep the execution recoverable and let runner resume
      // reconcile the durable RUN/session rather than manufacturing a failed
      // flow result or sending a duplicate prompt.
      const observedEvents = await readEvents(events);
      const decision = executionState(observedEvents, runId, execution);
      if (["operation_in_progress", "operation_observation_lost", "operation_terminal"].includes(error?.code)) return decision.result;
      if (decision.cancellation?.effective || decision.operation_id !== opId) {
        if (decision.operation_id === opId && !decision.cancellation.settled) {
          let receipt;
          try { receipt = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: subjectSessionFor(observedEvents, execution.id), launchUnwound: true }); }
          catch (cleanupError) { receipt = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
            ...(receipt.settled ? { id: `execution-cancelled:${hashJson([runId, execution.id, opId, decision.generation])}`, deduplicate: true } : {}),
            type: receipt.settled ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancellation_unconfirmed",
            data: { execution: execution.id, execution_operation_id: opId, execution_generation: decision.generation, receipt } });
        }
        return executionState(await readEvents(events), runId, execution).result;
      }
      if (isManagedWait(error)) {
        // The RUN arbiter owns drain/settlement. Do not strengthen a pause to
        // cancellation, fail its operation, capture a candidate, or start Judge.
        const suspended = { execution: execution.id, state: "awaiting_provider", ...errorRecord(error), control: error.details?.controller ?? null, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
          type: "dev.dd.eval.execution.awaiting_provider", data: { ...suspended, execution_operation_id: opId } });
        return suspended;
      }
      let failureStatistics = null;
      const failedRunId = error.lifecycle?.run_id ?? lifecycle?.run_id ?? restored?.run_id ?? (error.code === "snapshot_policy_unconfirmed" ? error.details?.run_id : null) ?? null;
      if (typeof failedRunId === "string" && typeof projectRoot === "string" && typeof runtimeRoot === "string") {
        try {
          failureStatistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: failedRunId });
          failureStatistics.observation = await resolveEvidenceJournals({ driver: prompted ?? { controller: error.details?.controller }, statistics: failureStatistics, attempt });
        } catch (statisticsError) {
          failureStatistics = { unavailable: true, error: errorRecord(statisticsError) };
        }
      }
      const evidence = { attempt: failureAttempt, run_id: failedRunId, session_id: subjectSessionFor(observedEvents, execution.id), stage: observedEvents.findLast((event) => event.executionid === execution.id && event.type === "dev.dd.eval.execution.context_prepared")?.data?.stage ?? execution.stage, lifecycle: error.lifecycle ?? lifecycle ?? null, boundaries, hitl, launcher, driver: prompted ?? null, statistics: failureStatistics };
      if (!isObservationLoss(error) && await exists(path.join(attempt, "managed-runtime.json"))) {
        try { evidence.control = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: evidence.session_id, launchUnwound: true }); }
        catch (cleanupError) { evidence.control = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
      }
      if (isObservationLoss(error)) {
        const uncertain = { ...evidence, execution: execution.id, execution_operation_id: opId, state: "awaiting_provider", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), started_at: startedAt, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.awaiting_provider", data: uncertain });
        return uncertain;
      }
      const failure = { ...evidence, execution: execution.id, state: "failed", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), ...(error?.hitl ? { hitl: [...hitl, error.hitl] } : {}), started_at: startedAt, finished_at: now() };
      if (causalNodes(failure).nodes.some(node => node.details?.failures?.some(child => child.native_binding))) {
        failure.recovery = await captureRecoveryEvidence({ root, manifest, result: failure });
        await verifyCapturedNativeFailure({ evalRoot: root, result: failure });
      }
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure, execution_operation_id: opId } });
      if (runProfile.value.failure_policy.stop_run_on_infrastructure_error && isInfrastructureFailure(failure)) onInfrastructureFailure();
      return failure;
    }
}

async function supplementalJudge({ evalRoot, profileId, supplementFile, outputRoot }) {
  const originalRoot = await realpath(evalRoot), originalManifest = await readJson(path.join(originalRoot, "manifest.json"));
  const selectedDeclaration = await loadProfile(profileId ?? originalManifest.profile?.judge?.profile_id ?? "");
  const selectedId = selectedDeclaration.value.id;
  const supplement = validateJudgeSupplement(await readJson(supplementFile));
  const sourceRoots = await judgeHarnessRoots(originalRoot, [{ attempt: path.join(originalRoot, "executions", supplement.boundary.execution_id) }]);
  const selectedContract = await resolveExecutionContract({ runProfile: { subject: { profile_id: selectedId } }, loadProfile: async id => id === selectedId ? selectedDeclaration : loadProfile(id), configHome: profileConfigHome() });
  const selectedProfile = contractProfile(selectedContract, selectedId);
  const boundEngine = await supplementalEngineIdentity(originalRoot, supplement);
  const allEngines = (await retainedEngineArtifacts(path.join(sourceRoots.runtimeRoot, "engines"), { engineVersion: boundEngine.engine_version, integrityChecksum: boundEngine.integrity_checksum }))
    .filter(item => item.manifest.package_name === boundEngine.package_name && item.manifest.package_version === boundEngine.package_version);
  if (allEngines.length !== 1) fail("Supplemental Judge requires one retained exact engine artifact", "judge_runtime_missing");
  const sourceEngine = allEngines[0]; await verifyEngineArtifact(sourceEngine.manifest, sourceEngine.root);
  const harnessConfig = await readRegularFile(path.join(sourceRoots.runtimeRoot, "harnesses.json"));
  const runtimeBinding = { engine_sha256: sourceEngine.manifest.integrity.checksum, harness_config_sha256: sha256(harnessConfig), adapter_tree_sha256: snapshotTreeHash(path.join(sourceRoots.runtimeRoot, "harness-runtime")) };
  const boundProfile = Object.fromEntries(["id", "harness", "provider", "model", "reasoning", "mode", "permission"].map(key => [key, selectedProfile[key]]));
  const prepared = await prepareSupplementalJudge({ evalRoot: originalRoot, supplementFile, outputRoot, profile: { ...boundProfile, execution_profile_sha256: profileSemanticHash(selectedProfile), runtime_binding: runtimeBinding } });
  if (hashJson(await supplementalEngineIdentity(originalRoot, supplement)) !== hashJson(boundEngine)) fail("Frozen RUN engine changed during preparation", "judge_packet_changed");
  const root = prepared.root, runId = `ASSESSMENT-${prepared.key}`, runtimeRoot = path.join(root, "runtime");
  return withRunnerLock(path.join(root, "judge-owner"), async () => {
    await assertSupplementalEvidence(prepared);
    const manifestFile = path.join(root, 'manifest.json');
    const retainedOwner = await exists(manifestFile) ? await readJson(manifestFile) : null;
    const assessmentResourceHome = retainedOwner?.runtime_resource_home ?? process.env.DD_FLOW_RESOURCE_HOME ?? path.join(root, 'resources');
    const assessmentRegistryFile = retainedOwner ? homesFile(registryEnvironment(retainedOwner)) : homesFile();
    const eventsFile = path.join(root, "events.jsonl"), operationId = `${runId}:judge`;
    const existing = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    const publishReport = async receipt => {
      await assertSupplementalEvidence(prepared);
      const cleanup = await observeJudgeCleanup(root, receipt);
      await writeJsonAtomic(path.join(root, "report.json"), { schema_id: "dd-eval/supplemental-judge-report@1", assessment_key: prepared.key, original_eval_id: originalManifest.run_id,
        original: prepared.originalReceipt, supplemental: receipt, cleanup: cleanup.status === 'settled' ? "settled" : "unconfirmed", judge_status: "completed", judge_cleanup: cleanup, historical_evidence: "unchanged", created_at: now() });
    };
    if (existing?.terminal === "completed") { await publishReport(existing.result); return { root, assessment_key: prepared.key, reused: true, receipt: existing.result }; }
    if (existing?.terminal) fail("Supplemental assessment is terminal; its failed attempt is not replayed", "operation_terminal");
    const projectRoot = path.join(root, "judge-workspace"); await mkdir(projectRoot, { recursive: true });
    const privateEngineFile = path.join(engineTarget(runtimeRoot, sourceEngine.manifest), "engine.json");
    const engine = await exists(privateEngineFile) ? await readJson(privateEngineFile) : await materializeEngineArtifact({ source: sourceEngine.manifest, sourceRoot: sourceEngine.root, runtimeRoot });
    const engineDirectory = await realpath(path.dirname(privateEngineFile));
    if (engine.integrity?.checksum !== runtimeBinding.engine_sha256 || ["package_name", "package_version", "engine_version", "entrypoint"].some(key => engine[key] !== sourceEngine.manifest[key])
      || !engineDirectory.startsWith(await realpath(runtimeRoot) + path.sep) || await realpath(engine.snapshot_root) !== engineDirectory) fail("Supplemental engine escaped its exact owned artifact", "judge_runtime_missing");
    await verifyEngineArtifact(engine);
    await installRuntimeShim(runtimeRoot, engine, { resourceHome: assessmentResourceHome, registryFile: assessmentRegistryFile });
    if (!await exists(path.join(runtimeRoot, "harness-runtime"))) {
      await cp(path.join(sourceRoots.runtimeRoot, "harness-runtime"), path.join(runtimeRoot, "harness-runtime"), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    }
    if (!await exists(path.join(runtimeRoot, "harnesses.json"))) {
      await writeFile(path.join(runtimeRoot, "harnesses.json"), harnessConfig, { flag: "wx", mode: 0o600 });
    }
    prepared.assertRuntime = async () => {
      if (hashJson(await readJson(privateEngineFile)) !== hashJson(engine)) fail("Supplemental engine manifest changed", "judge_packet_changed");
      await verifyEngineArtifact(engine);
      if (sha256(await readRegularFile(path.join(runtimeRoot, "harnesses.json"))) !== runtimeBinding.harness_config_sha256
        || snapshotTreeHash(path.join(runtimeRoot, "harness-runtime")) !== runtimeBinding.adapter_tree_sha256) fail("Supplemental native tooling changed", "judge_packet_changed");
    };
    await prepared.assertRuntime();
    await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const manifest = { ...originalManifest, eval_registry_file: assessmentRegistryFile, run_id: runId, executions: [], subject_disabled: true, original_eval_id: originalManifest.run_id,
      runtime_resource_home: assessmentResourceHome, runtime_recovery_home: path.join(root, "recovery"), runtime_control_bin: runtimeBin(runtimeRoot) };
    if (retainedOwner && !Object.hasOwn(retainedOwner, 'eval_registry_file')) delete manifest.eval_registry_file;
    if (await exists(manifestFile) && hashJson(await readJson(manifestFile)) !== hashJson(manifest)) fail("Supplemental owner manifest changed", "judge_output_conflict");
    if (!await exists(manifestFile)) await writeJsonAtomic(manifestFile, manifest);
    const args = { root, runId, manifest, loaded: { assessment: prepared.assessment }, profileId: selectedProfile.id, candidate: prepared.candidate,
      supplemental: prepared, frozenProfile: selectedProfile, runtimeRoots: { projectRoot, runtimeRoot } };
    const record = { eventsFile, source: "dd-eval://supplemental-judge", runId, traceId: runId, operationId, operation: "supplemental_judge" };
    let receipt;
    if (existing?.started) {
      // The output lock established that no prior observer owns this attempt.
      // Native session.create and capacity-chain recover their original IDs.
      try { receipt = await performFinalJudge(args); await completeOperation({ ...record, result: receipt }); }
      catch (error) { if (!isObservationLoss(error)) await recordOperationError({ ...record, error }); throw error; }
    } else receipt = (await recordOperation({ ...record, action: () => performFinalJudge(args) })).result;
    await publishReport(receipt);
    return { root, assessment_key: prepared.key, receipt };
  });
}

export async function evalJudge({ evalRoot, profileId = null, supplementFile = null, outputRoot = null }) {
  if (Boolean(supplementFile) !== Boolean(outputRoot)) fail("--supplement and --output must be supplied together", "usage");
  if (supplementFile) return supplementalJudge({ evalRoot, profileId, supplementFile, outputRoot });
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const selected = profileId ?? manifest.profile?.judge?.profile_id;
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results });
  if (!finalized.candidate) return { root, status: "awaiting_provider", reason: "subject execution is still active or unknown" };
  const resultFile = finalized.candidate.file === path.join(root, "candidate.json")
    ? path.join(root, "judge", "result.json")
    : path.join(root, "judge", "revisions", finalized.candidate.immutable_hash, "result.json");
  const receipt = await (await exists(resultFile)
    ? readJson(resultFile)
    : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate: finalized.candidate, results: finalized.results, historyEvents: subjectHistoryEvents(await readEvents(path.join(root, "events.jsonl")), manifest) }));
  if (receipt.candidate_sha256 !== finalized.candidate.immutable_hash) fail("Retained Judge differs from this candidate", "judge_evidence_mismatch");
  if (manifest.execution_contract) assertJudgeProfileBinding(receipt, await frozenJudgeProfile(manifest.execution_contract, selected));
  else if (profileId && profileId !== manifest.profile?.judge?.profile_id) fail("Legacy verdict cannot be reused under different requested settings", "judge_profile_contract_missing");
  await assertJudgeVerdict(path.dirname(resultFile), receipt);
  await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, receipt };
}

async function observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, controllerId = null, terminalOnly = false, boundaries = [], hitl = [], onProgress = () => {}, beforeObserve = async () => {} }) {
  await interactionFixtureManifest(loaded.root, [execution], manifest, loaded.value?.flow?.contour ?? stages);
  const contexts = new Map(), hitlRounds = new Map();
  const beforeDispatch = async () => {
    if (terminalOnly) fail("Terminal reconciliation cannot dispatch new work", "reconcile_not_terminal");
    await assertManagedContract({ runtimeRoot, projectRoot, runId: restored.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.dispatch_accepted",
      data: { operation: "managed_flow", execution_operation_id: opId },
      beforeAppend: prior => assertEvalExecutionDispatch(prior, runId, execution, opId) });
  };
  const retained = (await readEvents(events)).filter(event => event.executionid === execution.id);
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.execution.context_prepared")) {
    const bytes = await readFile(data.context_file);
    if (sha256(bytes) !== data.materialized_context_sha256) fail("Retained context bytes changed", "context_checksum_mismatch");
    contexts.set(`${data.stage}:${data.attempt ?? 1}`, { stage: data.stage, file: data.context_file, sha256: data.materialized_context_sha256,
      slice: { semantic_package_sha256: data.semantic_package_sha256, context_slice_sha256: data.context_slice_sha256 } });
  }
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.hitl.matched")) {
    await verifyRetainedHitl({ data, expectedScope: execution.id, expectedEvalId: runId, expectedProfileSha256: manifest.execution_contract?.profile_sha256?.[manifest.profile.interaction_judge?.profile_id] ?? null, legacy: !data.verdict_contract });
    hitlRounds.set(data.stage, Math.max(hitlRounds.get(data.stage) ?? 0, data.round));
  }
  if (controllerId) hitl.push(...await hitlEvidenceFor(retained, execution.id, runId, manifest.execution_contract));
  const contextFor = async (stage, attemptNumber = null) => {
    const key = `${stage}:${attemptNumber ?? 1}`;
    if (contexts.has(key)) return contexts.get(key);
    await beforeDispatch();
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", restored.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    const capacityProfile = selected?.delegation?.mode === "native" ? qualifiedCoordinator(selected.coordinator, manifest.execution_contract, profile) : profile;
    const nativeCapacity = qualifiedNativeFanoutCapacity(stage, selected, capacityProfile, loaded.value?.flow?.contour ?? stages);
    if (nativeCapacity !== null) await recordFanoutCapacity({ projectRoot, runtimeRoot, runId: restored.run_id, availableSlots: nativeCapacity });
    const roots = restoredRoots({ status }, projectRoot, runtimeRoot);
    let capabilityBaseline = null;
    if (restored.baseline_admission?.file) {
      const bytes = await readFile(restored.baseline_admission.file);
      if (sha256(bytes) !== restored.baseline_admission.sha256) fail('Baseline capability source changed', 'baseline_admission_evidence_mismatch');
      capabilityBaseline = JSON.parse(bytes);
    }
    const capabilitySource = await browserCapabilitySource({ baseline: capabilityBaseline, runRoot: roots.run });
    await materializeTaskInput(loaded.root, blueprint, stage, projectRoot);
    const file = path.join(attempt, "stage-context", `${stage}-${attemptNumber ?? 1}.json`);
    const slice = await materializeCaseStageSlice({ blueprint, stage, roots, output: file, runtimeSources: capabilitySource ? [capabilitySource] : [] }, loaded);
    const reference = { stage, file, sha256: sha256(await readFile(file)), slice };
    contexts.set(key, reference);
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.context_prepared", data: { stage, attempt: attemptNumber, context_file: file, runtime_engine: runtimeEngineIdentity(restored.engine), baseline_admission: restored.baseline_admission ?? null, semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: reference.sha256 } });
    return reference;
  };
  const first = contexts.get(`${execution.stage}:1`) ?? (controllerId ? fail("Retained initial stage context is missing", "stage_context_missing") : await contextFor(execution.stage));
  const packageFile = path.join(attempt, "managed-context.json");
  if (!controllerId) await writeJsonAtomic(packageFile, { schema_id: "dd-flow/managed-context@1", stages: { [execution.stage]: { file: first.file, sha256: first.sha256 } } });
  const answerFor = async (record, _run, controller) => {
    const stage = record.stage, pause = record.pause;
    const prior = (await readEvents(events)).find(event => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data.pause_id === pause.id);
    if (prior) {
      await verifyRetainedHitl({ data: prior.data, expectedStage: stage, expectedPauseId: pause.id, expectedScope: execution.id, expectedEvalId: runId, expectedProfileSha256: manifest.execution_contract?.profile_sha256?.[manifest.profile.interaction_judge?.profile_id] ?? null, legacy: !prior.data.verdict_contract });
      hitlRounds.set(stage, Math.max(hitlRounds.get(stage) ?? 0, prior.data.round));
      return prior.data.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, stage, fixtureHash(manifest, stage));
    const rounds = hitlRounds.get(stage) ?? 0;
    const question = await authorizeHitl({ fixture, stage, pause, rounds });
    const reference = [...contexts.values()].findLast(item => item.stage === stage) ?? await contextFor(stage, record.attempt);
    await beforeDispatch();
    const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: reference.file, permits, evalRunId: runId, controller, resourceHome: manifest.runtime_resource_home, hitlBinding: { stage, pause_id: pause.id, round: rounds + 1, scope_id: execution.id } });
    await beforeDispatch();
    const proof = await hitlProof(judgment, execution.id);
    const exchange = resolveHitlJudgment({ fixture, judgment: { ...judgment, proof }, question, stage });
    const acceptedReceipt = await readJson(judgment.receipt_file);
    if (!['jev', 'semantic_decision'].includes(acceptedReceipt.decision_source)) {
      const cleanup = await observeJudgeCleanup(path.dirname(judgment.receipt_file), acceptedReceipt);
      await recordTechnicalNote(events, runId, { code: 'interaction_judge_cleanup_pending', message: 'Canonical answer retained; Interaction Judge resources await retirement', phase: 'cleanup',
        resource_identity: path.dirname(judgment.receipt_file), consequence: 'cleanup_pending' }, cleanup.status === 'settled');
    }
    const round = rounds + 1, answerFile = await materializeHitlAnswer({ attempt, stage, round, answer: exchange.answer });
    hitlRounds.set(stage, round);
    hitl.push({ ...exchange, round, pause_id: pause.id, answer_file: answerFile, answer_sha256: sha256(exchange.answer), ...proof });
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.hitl.matched", data: { stage, round, pause_id: pause.id, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: sha256(exchange.answer), ...proof }, beforeAppend: prior => {
      assertEvalExecutionDispatch(prior, runId, execution, opId);
      return !prior.some(event => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data.pause_id === pause.id);
    } });
    return answerFile;
  };
  await beforeObserve();
  const flowId = loaded.value.flow?.id ?? 'sdlc';
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: evalRuntimeEnv(runtimeRoot, manifest, { DD_FLOW_RUNTIME_BUDGET: JSON.stringify(executionBudget(runId, runProfile.value)) }), projectRoot, runId: restored.run_id,
    requestId: `eval:${sha256(`${runId}:${execution.id}:launch`)}`, controllerId, contextFile: packageFile, stopAfter: execution.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor, flow: flowId,
    interactiveInputFor: flowId === 'interactive' ? async (record, run, controller) => {
      const intakeFile = await answerFor(record, run, controller);
      const matched = (await readEvents(events)).find(event => event.executionid === execution.id && event.type === 'dev.dd.eval.hitl.matched' && event.data.pause_id === record.pause.id);
      if (!matched) fail('Interactive input lacks its retained HITL authorization', 'interactive_input_kind_invalid');
      const fixture = await interactionFixture(loaded.root, record.stage, fixtureHash(manifest, record.stage));
      return { kind: interactiveInputKind(fixture, matched.data.response_ids), intakeFile };
    } : undefined,
    onTechnicalNotes: notes => publishSubjectTechnicalNotes(events, runId, restored.run_id, notes),
    beforeDispatch,
    onEvent: async (event, controller) => {
      await recordControllerEvent({ eventsFile: events, runId, executionId: execution.id, controllerId: controller.controller_id, event });
      if (event.type === "session_created") await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.subject.session_created", data: { ...event.data, controller_id: controller.controller_id }, beforeAppend: prior => !prior.some(item => item.executionid === execution.id && item.type === "dev.dd.eval.subject.session_created" && item.data.controller_id === controller.controller_id && item.data.session_id === event.data.session_id) });
      if (event.type === "boundary_captured") {
        boundaries.push(event.data);
      }
    }
  });
  onProgress({ driver: observed });
  if (observed.pending_input) throw Object.assign(new Error("Interactive input was retained but delivery needs reconciliation"), { code: "interactive_input_delivery_pending", details: { controller: observed.controller, input: observed.pending_input, effect: 'unknown' } });
  if (observed.pending_answer) throw Object.assign(new Error("Managed RUN is waiting for an authorized user answer"), { code: "managed_run_waiting_for_user", details: { controller: observed.controller, pause: observed.pending_answer } });
  const currentStage = observed.controller.stage;
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: currentStage, runId: restored.run_id,
    onTechnicalNotes: notes => publishSubjectTechnicalNotes(events, runId, restored.run_id, notes) });
  onProgress({ lifecycle });
  const launchOperationId = `${runId}:${execution.id}:launch`;
  const completion = await managedCompletionEvidence({ execution, observed, lifecycle, runId: restored.run_id, operationId: opId, launchOperationId });
  const completedStages = new Set((lifecycle.status.index?.stage_runs ?? []).filter(stage => stage.status === 'done').map(stage => stage.stage));
  const missingInteractions = [];
  for (const stage of executionStages([execution], loaded.value?.flow?.contour ?? stages)) {
    if (!completedStages.has(stage)) continue;
    const fixture = await interactionFixture(loaded.root, stage, fixtureHash(manifest, stage));
    if (fixture.mode === 'required' && (hitlRounds.get(stage) ?? 0) === 0) missingInteractions.push(stage);
  }
  if (missingInteractions.length) {
    completion.incomplete_evidence = { ...(completion.incomplete_evidence ?? {}), missing: 'Required HITL was not observed for completed Stages', failure: { code: 'required_hitl_missing', stages: missingInteractions } };
    await recordTechnicalNote(events, runId, { code: 'required_hitl_missing', message: 'Accepted execution retained; required interaction evidence is missing', phase: 'assessment_capture', source_operation_id: opId, consequence: 'none' });
  }
  if (!completion.candidate) await recordTechnicalNote(events, runId, { code: 'assessment_snapshot_unavailable', message: 'Accepted terminal execution retained; its assessment snapshot is unavailable or invalid', phase: 'assessment_capture', source_operation_id: opId, consequence: 'none' });
  const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: restored.run_id });
  if (statistics.observation?.unavailable) await recordTechnicalNote(events, runId, { code: 'statistics_observation_unavailable', message: 'Accepted execution retained; optional statistics are unavailable', phase: 'observation', source_operation_id: opId, consequence: 'none' });
  statistics.controller = observed.controller;
  await publishExecutionStatistics(path.join(attempt, "statistics.json"), statistics, { eventsFile: events, runId, operationId: opId });
  const result = { execution: execution.id, execution_operation_id: opId, ...(launchOperationId !== opId ? { execution_launch_operation_id: launchOperationId } : {}), stage: currentStage, attempt, session_id: observed.controller.sessions.at(-1)?.session_id ?? null, run_id: restored.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256, launcher: null, driver: observed, lifecycle, boundaries, hitl, ...completion, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
  if (execution.completion_scope) {
    result.stage_outcome = lifecycle.stage_status;
    result.completion_scope = observedCompletionScope(execution, result);
  }
  return result;
}

export async function recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery = null, terminalOnly = false }) {
  const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
  if (await exists(path.join(attempt, "managed-runtime.json"))) {
    const { binding: managed } = await executionSnapshotBinding(root, execution.id);
    const env = evalRuntimeEnv(runtimeRoot, manifest);
    const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env });
    const engine = resolved.selection?.selected;
    await assertExecutionEngine(manifest, loaded.inputCheckpoint, engine);
    const prepared = preparedContextFor(events, execution.id, execution.stage);
    await verifyBaselineAdmission({ reference: prepared.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources, projectRoot });
    const opId = `${manifest.run_id}:${execution.id}:launch`;
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
    const controller = status.controller;
    if (!controller?.controller_id || controller.run_id !== managed.run_id || controller.request_id !== `eval:${sha256(opId)}`) fail("Retained managed controller does not match the execution launch", "controller_owner_changed");
    if (managed.runtime_budget && (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile)) || hashJson(controller.runtime_budget) !== hashJson(managed.runtime_budget))) fail("Retained controller has different experiment concurrency limits", "runtime_budget_conflict");
    const dispatchId = operationContext.getStore()?.operationId ?? executionState(events, manifest.run_id, execution).operation_id;
    let beforeObserve;
    if (recovery) {
      if (terminalOnly) fail("Terminal reconciliation cannot resume a controller", "reconcile_not_terminal");
      if (recovery.run_id !== managed.run_id || typeof recovery.control_id !== "string" || sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("Managed recovery evidence does not match its retained RUN", "recovery_evidence_invalid");
      const controlStatus = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
      const control = controlStatus.control;
      const resumeRequestId = `eval-resume:${sha256(dispatchId)}`;
      if (control?.current !== true || control.control_id !== recovery.control_id || control.recovery_id !== recovery.recovery_id || control.capture_path !== recovery.snapshot) fail("Managed recovery source is stale", "recovery_source_stale");
      if (controlStatus.settled !== true && controlStatus.resume_operation?.request_id !== resumeRequestId) fail("Managed controller is not settled for this recovery", "recovery_capture_pending");
      beforeObserve = async () => {
        assertEvalExecutionDispatch(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution, dispatchId);
        await assertManagedContract({ runtimeRoot, projectRoot, runId: managed.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
        const resumed = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "resume", "--run", managed.run_id, "--project-root", projectRoot, "--from", recovery.control_id, "--request-id", resumeRequestId, "--wait-ms", "1000"], { cwd: projectRoot, env });
        if (resumed.controller?.controller_id !== controller.controller_id) fail("Managed recovery changed its logical controller", "controller_owner_changed");
      };
    }
    if (terminalOnly && !["completed", "stop_target_reached"].includes(controller.status) && !isConclusiveManagedFailure({ details: { controller } })) fail("Managed controller has no completed capture", "reconcile_not_terminal");
    const runProfile = retainedRunProfile(manifest);
    const result = await observeManagedExecution({ events: path.join(root, "events.jsonl"), runId: manifest.run_id, manifest, execution, loaded, blueprint, profile, runProfile,
      permits: createHarnessPermits(runProfile), attempt, projectRoot, runtimeRoot, restored: { run_id: managed.run_id, engine, baseline_admission: prepared.baseline_admission },
      opId: dispatchId, startedAt: prepared.started_at, controllerId: controller.controller_id, terminalOnly, beforeObserve });
    return { ...result, recovered: true };
  }
  fail("Recovery requires a managed execution binding", "execution_migration_required");
}

/** Read-only continuation admission. Terminal operations need cleanup, not new-launch inputs. */
export async function prepareRunnerContinuation(manifest, events = null, evalRoot = null) {
  if (!manifest || !Array.isArray(manifest.executions) || !manifest.executions.length) fail("Invalid EVAL manifest", "control_input_invalid");
  // Cleanup needs retained operation identities, not current launch profiles
  // or a newly valid productive manifest. Keep that decision identical for
  // detached and in-process continuation.
  if (events) {
    const stopped = await infrastructureQueueStopped(events, manifest, evalRoot);
    if (manifest.executions.every(execution => {
      if (!execution?.id) return false;
      const state = executionState(events, manifest.run_id, execution);
      return terminalExecution(events, manifest, execution) || stopped && !state.started
        && state.operation_id === `${manifest.run_id}:${execution.id}:launch` && state.result.state === "awaiting_provider";
    })) return null;
  }
  if (manifest.schema_id !== "dd-eval/runner-manifest@1" || typeof manifest.case_id !== "string") fail("Invalid productive EVAL manifest", "control_input_invalid");
  validateExecutionDescriptorShape(manifest.executions);
  if (!isObject(manifest.profile) || !isObject(manifest.subject_profile)) fail("Productive EVAL manifest lacks its retained profiles", "control_input_invalid");
  validateRunProfile(manifest.profile);
  validateHarnessProfile(manifest.subject_profile);
  if (manifest.execution_contract) validateExecutionContract(manifest.execution_contract);
  if (manifest.case_id !== manifest.profile.case_id || manifest.profile.subject.profile_id !== manifest.subject_profile.id) fail("EVAL profile scope differs from its manifest", "control_input_invalid");
  const loaded = await loadCase(manifest.case_id);
  validateExecutionDescriptors(manifest.executions, loaded.value.flow.contour);
  assertCompletionScopes(manifest.profile, manifest.executions, loaded.value.flow);
  assertFinalJudgeScope({ profile: manifest.profile, executions: manifest.executions, assessment: loaded.assessment });
  await assertRetainedRunDefinition(manifest, loaded);
  const entry = await runnerEntry(manifest, loaded);
  const directBlueprint = manifest.executions.some(execution => execution.mode === "e2e") ? entry.pack ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : entry.blueprint : null;
  const unstarted = manifest.executions.filter(execution => !events || !terminalOperation(events, `${manifest.run_id}:${execution.id}:launch`)?.started);
  const focusedEntries = manifest.kind === "derived" ? {} : await prepareFocusedEntries(unstarted, entry.pack, entry.packRoot);
  assertProfileCapacity(manifest.subject_profile, manifest.executions, manifest.execution_contract);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile: { value: manifest.profile }, flowContour: loaded.value?.flow?.contour ?? stages });
  return { loaded, ...entry, directBlueprint, focusedEntries };
}

export async function runnerRecover({ evalRoot, executionId = null, fromRecoveryId }) {
  return withRunnerLock(`${path.resolve(evalRoot)}.lifecycle`, () => recoverLocked({ evalRoot, executionId, fromRecoveryId }));
}

export async function runnerRecoveryInspect({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json"));
  const events = await readEvents(path.join(root, "events.jsonl"));
  const results = storedExecutionResults(events, manifest).filter(result => !executionId || result.execution === executionId);
  if (executionId && results.length === 0) fail(`unknown execution ${executionId}`, "execution_not_found");
  return { root, run_id: manifest.run_id, executions: results.map(result => ({ execution: result.execution, state: result.state, recovery: result.recovery ?? null, operations: Object.entries(reduceEvents(events).operations).filter(([id]) => id.startsWith(`${manifest.run_id}:${result.execution}:launch:recover:`)).map(([operation_id, operation]) => ({ operation_id, ...operation })) })) };
}

async function recoverLocked({ evalRoot, executionId = null, fromRecoveryId }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile; const blueprint = (await runnerEntry(manifest, loaded)).blueprint;
  await assertRetainedRunDefinition(manifest, loaded);
  const recoveryEvents = await readEvents(path.join(root, "events.jsonl"));
  if (reduceEvents(recoveryEvents).state === "finished") fail("Finished EVAL cannot create a recovery generation", "execution_terminal");
  const prior = storedExecutionResults(recoveryEvents, manifest);
  const source = recoverySourceFromEvents(recoveryEvents, executionId, fromRecoveryId)
    ?? selectRecoverySource(prior, executionId, fromRecoveryId);
  const selected = manifest.executions.filter((execution) => execution.id === source.execution && source.state === "failed");
  if (selected.length === 0 && source.recovery?.resumed_at) return { root, run_id: manifest.run_id, reused: true, executions: prior };
  if (selected.length === 0) fail(executionId ? `execution ${executionId} has no failed recovery candidate` : "no failed execution is eligible for recovery", "recovery_not_eligible");
  const recovered = [];
  for (const execution of selected) {
    // Keep using the explicit sealed source. `prior` reflects the newest
    // projection and can instead be a failed retry with only recovery_parent_id.
    const failure = source.execution === execution.id ? source : prior.find((result) => result.execution === execution.id);
    const recovery = failure?.recovery;
    if (typeof recovery?.recovery_id !== "string" || typeof recovery?.run_id !== "string") fail(`execution ${execution.id} has no sealed recovery evidence`, "recovery_evidence_missing");
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    if (sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("recovery manifest checksum mismatch", "recovery_evidence_invalid");
    const managed = await exists(path.join(attempt, "managed-runtime.json"));
    if (!managed) fail("Legacy execution requires explicit migration before productive recovery", "execution_migration_required");
    const operationId = recoveryOperationId(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution.id, recovery.recovery_id);
    let receipt;
    try { receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.recover`, action: async () => {
      const events = await readEvents(path.join(root, "events.jsonl"));
      const result = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery });
      return { ...result, recovery: { ...recovery, resumed_at: now() } };
    } }); } catch (error) {
      if (isObservationLoss(error) || ["managed_run_controlled", "operation_in_progress", "operation_terminal"].includes(error.code)) throw error;
      const failed = { ...errorRecord(error), execution: execution.id, execution_operation_id: operationId, attempt, stage: error.hitl?.stage ?? execution.stage, state: "failed", code: error.code ?? "execution_failed", error: error.message, recovery_parent_id: recovery.recovery_id,
        ...await settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) };
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: failed });
      receipt = { result: failed };
    }
    recovered.push(receipt.result ?? receipt);
  }
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, run_id: manifest.run_id, executions: finalized.results, recovered, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

async function retainedFinalJudgeCleanup(root, manifest, results) {
  // Interaction, qualification and supplemental attempts retain separate owners;
  // ordinary EVAL cleanup never discovers or starts their runtimes.
  const reportFile = path.join(root, "reports", "report.json");
  if (!manifest.profile?.judge?.enabled || !await exists(reportFile)) return null;
  const report = await readJson(reportFile), candidate = report.candidate;
  if (!candidate) return null;
  const { file, immutable_hash, ...content } = candidate;
  if (report.run_id !== manifest.run_id || hashJson(content) !== immutable_hash || !candidateMatches(candidate, manifest, results)
    || ![path.join(root, "candidate.json"), path.join(root, "candidate-revisions", `${immutable_hash}.json`)].includes(file)) fail("Judge cleanup candidate is not owned by this EVAL", "judge_evidence_mismatch");
  const judgeRoot = file === path.join(root, "candidate.json") ? path.join(root, "judge") : path.join(root, "judge", "revisions", immutable_hash);
  if (!await exists(path.join(judgeRoot, "result.json"))) return null;
  const verdict = await readJson(path.join(judgeRoot, "result.json"));
  // Cleanup is ownership recovery, not admission for a new model call.
  let profile = verdict.profile_snapshot ?? (manifest.execution_contract ? contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id) : null);
  if (!profile) {
    const state = await readJson(path.join(judgeRoot, "daemon", "daemon.json"));
    const adapter = path.basename(state.config?.runtime_owner?.adapter_executable ?? "");
    const harness = { "dd-codex.mjs": "codex-desktop", "dd-zcode.mjs": "zcode-acp", "dd-grok.mjs": "grok-acp", "dd-agy.mjs": "antigravity-cli", "dd-opencode.mjs": "opencode-server", "dd-droid.mjs": "droid-cli" }[adapter];
    if (!harness) fail("Legacy Judge cleanup has no retained adapter identity", "judge_cleanup_ownership_unknown");
    profile = { id: verdict.profile_id, harness };
  }
  if (verdict.profile_id !== profile.id || verdict.candidate_sha256 !== immutable_hash) fail("Judge cleanup verdict differs from its retained candidate/profile", "judge_evidence_mismatch");
  return { root: judgeRoot, verdict, profile };
}

async function retryFinalJudgeCleanup({ target, root, manifest, results }) {
  const stateDir = path.join(target.root, "daemon"), state = await readJson(path.join(stateDir, "daemon.json"));
  const owner = state.config?.runtime_owner;
  const execution = results.find(result => owner?.dd_flow_home === path.join(root, "executions", result.execution, "dd-flow-home"));
  const adapter = typeof owner?.dd_flow_home === "string" ? path.join(owner.dd_flow_home, "harness-runtime", "bin", driverFor(target.profile)) : null;
  if (!execution || owner?.schema_id !== "dd-flow/runtime-owner@1" || owner.role !== "judge" || owner.owner_id !== `judge:${sha256(stateDir)}`
    || owner.state_dir !== stateDir || owner.dd_flow_bin !== runtimeBin(owner.dd_flow_home) || owner.adapter_executable !== adapter
    || owner.resource_home !== manifest.runtime_resource_home || owner.budget?.scope_id !== manifest.run_id || state.config?.cwd !== target.root
    || state.config.ddFlowHome && state.config.ddFlowHome !== owner.dd_flow_home || state.config.ddFlowBin && state.config.ddFlowBin !== owner.dd_flow_bin) fail("Retained Judge has no matching runtime ownership", "judge_cleanup_ownership_unknown");
  const canonicalRoot = await realpath(root);
  for (const file of [target.root, stateDir, path.join(stateDir, "daemon.json"), path.join(target.root, "result.json"), owner.dd_flow_home, adapter]) {
    if (await realpath(file) !== path.resolve(canonicalRoot, path.relative(root, file))) fail("Judge cleanup path escaped its retained EVAL owner", "judge_cleanup_ownership_unknown");
  }
  const pin = execution.runtime_engine;
  if (!pin?.package_version || !/^[a-f0-9]{64}$/.test(pin.integrity_checksum ?? "")) fail("Judge cleanup has no retained engine identity", "judge_cleanup_ownership_unknown");
  const engines = (await retainedEngineArtifacts(path.join(owner.dd_flow_home, "engines"), { engineVersion: pin.package_version, integrityChecksum: pin.integrity_checksum }))
    .filter(engine => hashJson(runtimeEngineIdentity(engine.manifest)) === hashJson(pin));
  if (engines.length !== 1) fail("Judge cleanup cannot resolve its exact retained engine", "judge_cleanup_ownership_unknown");
  await verifyEngineArtifact(engines[0].manifest, engines[0].root);
  if (snapshotTreeHash(path.join(owner.dd_flow_home, "harness-runtime")) !== snapshotTreeHash(path.join(engines[0].root, "dist", "harness-runtime"))) fail("Judge cleanup adapter differs from its retained engine", "judge_cleanup_ownership_unknown");
  const nativeContracts = await loadNativeContracts(owner.dd_flow_home, { engineRoot: engines[0].root, requireTreeSettlement: true });
  return finishJudgeCleanup({ root: target.root, profileId: target.profile.id, nativeContracts, stop: operationId => callDriver(target.profile,
    ["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"], { cwd: target.root, operationId, timeoutMs: 60_000,
      env: { DD_FLOW_CONFIG_HOME: owner.dd_flow_home, DD_FLOW_RESOURCE_HOME: owner.resource_home, DD_FLOW_RUNTIME_OWNER: JSON.stringify(owner), CODEX_HOME: path.join(target.root, "codex-home") } }) });
}

/** Recognition of already coherent terminal cleanup. No writes, control
 * reconciliation, capture ingestion, or paid Judge dispatch. */
export async function runnerCleanupReceipt({ evalRoot, expectedManifestSha256, signal, detailed = false }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    signal?.throwIfAborted();
    const bytes = await readFile(path.join(root, "manifest.json"));
    if (sha256(bytes) !== expectedManifestSha256) fail("Cleanup manifest changed", "runner_definition_drift");
    const manifest = JSON.parse(bytes), events = await readEvents(eventsFile);
    assertEvalAdmission(events);
    const revision = runResultRevision(events, manifest), results = storedExecutionResults(events, manifest);
    const pending = reason => detailed ? { root, run_id: manifest.run_id, cleanup_state: "pending", recognition: "pending", reason } : null;
    const terminal = events.findLast(event => event.runid === manifest.run_id && event.type === "dev.dd.eval.completed" && event.data?.result_revision === revision);
    if (!terminal || !isTerminalRunState(terminal.data.state) || results.some(result => !["candidate_ready", "failed", "cancelled"].includes(result.state))
      || (await Promise.all(results.map(result => failureCaptureState(root, manifest, result, signal)))).some(state => state !== "ready")) return pending("terminal_projection_pending");
    // A late snapshot can become readable before it has been ingested into the
    // retained failure and report. Recognition is read-only and cannot perform
    // that ingestion on behalf of the cleanup owner.
    if (results.some(result => result.state === "failed" && result.recovery?.capture_error)) return pending("capture_ingestion_pending");
    const report = await readJson(path.join(root, "reports", "report.json"));
    const identities = values => values?.map(result => ({ execution: result.execution, state: result.state }));
    if (report.schema_id !== reportSchemaFor(manifest) || report.run_id !== manifest.run_id || report.state !== terminal.data.state || report.cleanup_state !== "settled" || report.judge_status === "in_progress" || hashJson(identities(report.executions)) !== hashJson(identities(results)) || hashJson(report.execution_history) !== hashJson(recoveryHistory(events, manifest, results))) return pending("report_projection_pending");
    let inventory, physical;
    const physicalPending = await executionCleanupPending(root, manifest, results, signal, undefined,
      (currentInventory, proof) => { inventory = currentInventory; physical = proof; });
    const retiredScope = inventory && !physical?.binding_unconfirmed
      && await hasRetainedRetirementProof({ root, manifest, live: { inventory }, maintenance: await cleanupSidecars(root) });
    if (physicalPending && !retiredScope) return pending("physical_settlement_unconfirmed");
    const judge = await retainedFinalJudgeCleanup(root, manifest, results);
    if (report.judge_status === "completed" && !judge) return pending("judge_cleanup_unconfirmed");
    if (judge) {
      // A validated all-role physical retirement proof is not a native clean
      // verdict. Keep content custody, without requiring a lost stop ACK.
      if (retiredScope) await assertJudgeVerdict(judge.root, judge.verdict);
      else await assertJudgeCleanup(judge.root, judge.verdict);
    }
    signal?.throwIfAborted();
    // Receipt priority does not revive a spent observer or change a generation.
    if (runResultRevision(await readEvents(eventsFile), manifest) !== revision) return pending("result_revision_changed");
    return { root, run_id: manifest.run_id, state: report.state, execution_state: report.execution_state, cleanup_state: "settled", cleanup_observation: { capture: "ready" }, judge_status: report.judge_status, executions: results };
  }, { signal, timeoutMs: 120_000 });
}

export async function runnerCleanup({ evalRoot, requestId = null, expectedManifestSha256 = null }) {
  const root = path.resolve(evalRoot);
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const bytes = await readFile(path.join(root, "manifest.json"));
    if (expectedManifestSha256 !== null && sha256(bytes) !== expectedManifestSha256) fail("Cleanup manifest changed", "runner_definition_drift");
    const events = await readEvents(path.join(root, "events.jsonl"));
    assertEvalAdmission(events); // A captured operator journal remains frozen; reconcile its runtime scope separately.
    const manifest = JSON.parse(bytes);
    let results = storedExecutionResults(events, manifest);
    const stranded = requestId === null ? [] : (await Promise.all(results.filter(result => result.state === "awaiting_provider").map(async result =>
      await exists(path.join(root, "executions", result.execution, "managed-runtime.json")) ? result : null))).filter(Boolean);
    if (stranded.length) {
      validateControlResumeInput({ requestId, waitMs: 0 });
      const loaded = await loadCase(manifest.case_id);
      for (const result of stranded) {
        const execution = manifest.executions.find(item => item.id === result.execution);
        // Reuse the retained engine/baseline/controller ownership checks and
        // terminal-only dispatch fence. A live unknown outcome is not failure.
        try { await recoverExecution({ root, events, manifest, execution, loaded, blueprint: {}, profile: manifest.subject_profile, terminalOnly: true }); }
        catch (error) {
          if (error.code === "reconcile_not_terminal" || isObservationLoss(error)) continue;
          if (!isConclusiveManagedFailure(error)) throw error;
          await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
            type: "dev.dd.eval.execution.failed", data: { ...result, ...errorRecord(error), state: "failed", error: error.message, driver: { controller: error.details.controller }, finished_at: now() } });
        }
      }
      results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
    }
    const judgeTarget = await retainedFinalJudgeCleanup(root, manifest, results);
    let judgeNativeContracts;
    if (!results.some(result => result.state === "failed") && !judgeTarget) fail("Cleanup requires a retained failed execution or Judge attempt", "cleanup_not_required");
    if (requestId !== null) {
      validateControlResumeInput({ requestId, waitMs: 0 });
      if (judgeTarget) {
        let inventory, physical;
        await executionCleanupPending(root, manifest, results, undefined, undefined,
          (currentInventory, proof) => { inventory = currentInventory; physical = proof; });
        const retiredScope = inventory && !physical?.binding_unconfirmed
          && await hasRetainedRetirementProof({ root, manifest, live: { inventory }, maintenance: await cleanupSidecars(root) });
        try {
          if (retiredScope) await assertJudgeVerdict(judgeTarget.root, judgeTarget.verdict);
          else await assertJudgeCleanup(judgeTarget.root, judgeTarget.verdict);
        }
        catch (error) {
          if (error.code !== "judge_cleanup_unconfirmed") throw error;
          const cleanup = await retryFinalJudgeCleanup({ target: judgeTarget, root, manifest, results });
          judgeNativeContracts = { nativeShutdownConfirmed: cleanup.validateShutdown };
        }
      }
      for (const result of results.filter(item => item.state === "failed")) {
        const attempt = path.join(root, "executions", result.execution), project = path.join(attempt, "project"), home = path.join(attempt, "dd-flow-home");
        const bindingFile = path.join(attempt, "managed-runtime.json");
        if (!(await exists(bindingFile))) continue;
        const { binding: managed } = await executionSnapshotBinding(root, result.execution, result);
        const scope = ["--run", managed.run_id, "--project-root", project], options = { cwd: project, env: evalRuntimeEnv(home, manifest) };
        const status = await commandJson(runtimeBin(home), ["run", "control", "status", ...scope], options);
        if (status.settled === true) continue;
        if (!status.control?.current || !status.control.control_id) fail("Cleanup requires an existing RUN control", "run_control_missing");
        await commandJson(runtimeBin(home), ["run", "control", "reconcile", ...scope, "--control-id", status.control.control_id, "--request-id", sha256(JSON.stringify([manifest.run_id, result.execution, requestId]))], options);
      }
    }
    const finalized = await finalizeRunProjection({ root, manifest, loaded: null, results, cleanupOnly: true, judgeNativeContracts });
    return { root, run_id: manifest.run_id, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation, state: finalized.state, judge_status: finalized.report.judge_status, executions: finalized.results };
  });
}

/** Finish a scored observer after cleanup without admitting any Subject work. */
export async function runnerFinalizeSettled({ evalRoot, expectedManifestSha256, authorizeFinalization = null, technicalOnly = false }) {
  const root = path.resolve(evalRoot);
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const bytes = await readFile(path.join(root, "manifest.json"));
    if (sha256(bytes) !== expectedManifestSha256) fail("Finalization manifest changed", "runner_definition_drift");
    const manifest = JSON.parse(bytes), events = await readEvents(path.join(root, "events.jsonl"));
    assertEvalAdmission(events);
    if (!manifest.executions.every(execution => terminalExecution(events, manifest, execution))) fail("Scored finalization requires terminal Subject operations", "operation_in_progress");
    const loaded = await loadCase(manifest.case_id);
    // Like ordinary terminal resume, report an already-failed execution even
    // when definition drift caused that failure. No productive admission here.
    const authorize = typeof authorizeFinalization === "function" ? authorizeFinalization
      : async () => fail("New scored finalization requires current observer admission", "finalization_authority_required");
    const finalized = await finalizeRunProjection({ root, manifest, loaded, results: storedExecutionResults(events, manifest), authorizeFinalization: authorize, cleanupOnly: technicalOnly });
    return { root, run_id: manifest.run_id, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation, state: finalized.state, judge_status: finalized.report.judge_status, executions: finalized.results };
  });
}

export async function runnerResume({ evalRoot, resumeRequestId = null, expectedManifestSha256 = null }) {
  const root = path.resolve(evalRoot);
  const { events, manifestBytes, manifest, prepared } = await withRunnerLock(`${root}.lifecycle`, async () => {
  const events = await readEvents(path.join(root, "events.jsonl"));
  // Validate the same retained admission before a maintenance fence can create
  // files or call an engine. Repeat it under lifecycle ownership below.
  const projection = reduceEvents(events);
  if (projection.state === "finished") fail("Finished EVAL cannot resume productive work", "execution_terminal");
  assertEvalAdmission(events);
  if (resumeRequestId !== null && projection.resume?.request_id !== resumeRequestId) fail("EVAL continuation requires its current applied resume", "control_request_stale");
  const manifestBytes = await readFile(path.join(root, "manifest.json"));
  if (expectedManifestSha256 !== null && sha256(manifestBytes) !== expectedManifestSha256) fail("EVAL continuation manifest changed", "runner_definition_drift");
  const manifest = JSON.parse(manifestBytes);
  const prepared = await prepareRunnerContinuation(manifest, events, root);
  return { events, manifestBytes, manifest, prepared };
  });
  // Cross-EVAL fences precede lifecycle locks. Never wait for another cleanup
  // worker while holding a lifecycle lock it may need to retire.
  let admission;
  if (prepared && manifest.executions.some(execution => {
    const current = executionState(events, manifest.run_id, execution);
    return !current.started && !terminalExecution(events, manifest, execution);
  })) {
    const launchResources = await prepareLaunchResources(root);
    await withPriorEvalRetirement({ caseId: manifest.case_id, resourceHome: manifest.runtime_resource_home, excludeRoot: root, env: registryEnvironment(manifest), launchResources,
      maintenanceHome: path.join(root, "control-runtime"), maintenanceBin: manifest.runtime_control_bin }, () => writeJsonAtomic(path.join(root, "launch-reservation.json"), {
        schema_id: "dd-eval/launch-reservation@1", run_id: manifest.run_id, root, resource_home: manifest.runtime_resource_home, resource_bindings: launchResources, admitted_at: now()
      }));
    admission = preparedQueueAdmission;
  }
  // The initial owner may still be publishing the retained manifest/queue.
  // This lock protects that read; it does not admit productive execution.
  return withRunnerLock(`${path.resolve(evalRoot)}.lifecycle`, () => runnerResumeLocked({ evalRoot, resumeRequestId, expectedManifestSha256: sha256(manifestBytes), admission }));
}

async function runnerResumeLocked({ evalRoot, resumeRequestId, expectedManifestSha256, admission }) {
  const admitted = await readEvents(path.join(path.resolve(evalRoot), "events.jsonl"));
  if (reduceEvents(admitted).state === "finished") fail("Finished EVAL cannot resume productive work", "execution_terminal");
  assertEvalAdmission(admitted);
  if (resumeRequestId !== null && reduceEvents(admitted).resume?.request_id !== resumeRequestId) fail("EVAL continuation requires its current applied resume", "control_request_stale");
  const root = path.resolve(evalRoot), manifestBytes = await readFile(path.join(root, "manifest.json"));
  if (expectedManifestSha256 !== null && sha256(manifestBytes) !== expectedManifestSha256) fail("EVAL continuation manifest changed", "runner_definition_drift");
  const manifest = JSON.parse(manifestBytes);
  // A replacement observer must retain the prior owner's infrastructure stop,
  // before validating or admitting any of its still-unstarted queue entries.
  await cancelInfrastructureQueue({ root, manifest });
  const prepared = await prepareRunnerContinuation(manifest, await readEvents(path.join(root, "events.jsonl")), root);
  const loaded = prepared?.loaded ?? await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  const { blueprint, pack, packRoot } = prepared ?? await runnerEntry(manifest, loaded);
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  const runProfile = retainedRunProfile(manifest);
  if (manifest.executions.every(execution => {
    const current = executionState(events, manifest.run_id, execution);
    return !current.started && current.result.state === "awaiting_provider";
  })) {
    if (!prepared) { await assertRetainedRunDefinition(manifest, loaded); assertProfileCapacity(profile, manifest.executions, manifest.execution_contract); }
    return executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared, admission });
  }
  let queuePrepared = Boolean(prepared), stopQueue = false, permits, directBlueprint;
  for (const execution of manifest.executions) {
    const current = executionState(events, manifest.run_id, execution);
    if (current.result.state === "cancelled" && current.cancellation?.settled) { results.push(current.result); continue; }
    const operationId = current.operation_id;
    const operation = terminalOperation(events, operationId); const completed = operation?.terminal === "completed" ? operation.result : null;
    if (completed) { results.push(completed); continue; }
    if (operation?.terminal === "failed") {
      // A conclusive failure only needs cleanup/capture projection. Recovery
      // remains explicit and must allocate its own productive operation.
      results.push(storedExecutionResults(events, manifest).find(result => result.execution === execution.id));
      continue;
    }
    if (operation?.terminal) fail(`execution ${execution.id} operation is already ${operation.terminal}; recovery must create an explicit recovery operation`, "operation_terminal");
    if (!queuePrepared) {
      await assertRetainedRunDefinition(manifest, loaded);
      queuePrepared = true;
    }
    if (!operation?.started && operationId === `${manifest.run_id}:${execution.id}:launch`) {
      if (stopQueue) {
        await cancelInfrastructureQueue({ root, manifest });
        events = await readEvents(path.join(root, "events.jsonl"));
        results.push(executionState(events, manifest.run_id, execution).result); continue;
      }
      if (!permits) {
        if (!prepared) { assertProfileCapacity(profile, manifest.executions, manifest.execution_contract); await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile, flowContour: loaded.value?.flow?.contour ?? stages }); }
        directBlueprint = prepared ? prepared.directBlueprint : manifest.executions.some(item => item.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
        permits = createHarnessPermits(runProfile); queuePrepared = true;
      }
      results.push(await launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : blueprint, pack, packRoot, preparedEntry: prepared?.focusedEntries?.[execution.id], permits, onInfrastructureFailure: () => { stopQueue = true; } }));
      events = await readEvents(path.join(root, "events.jsonl"));
      continue;
    }
    let recovery;
    try { recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); }
    catch (error) {
      if (["operation_in_progress", "operation_terminal"].includes(error.code)) throw error;
      if (!isObservationLoss(error) && !isManagedWait(error) && !isConclusiveManagedFailure(error) && !isConclusiveHitlFailure(error)) throw error;
      await recordOperationError({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reattach`, error });
      if (isObservationLoss(error) || isManagedWait(error)) throw error;
      recovery = { execution: execution.id, execution_operation_id: operationId, attempt: path.join(root, "executions", execution.id), stage: error.hitl?.stage ?? execution.stage, state: "failed", ...errorRecord(error), error: error.message, driver: { controller: error.details?.controller ?? null }, finished_at: now(),
        ...await settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) };
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: recovery });
      results.push(recovery);
      events = await readEvents(path.join(root, "events.jsonl"));
      continue;
    }
    results.push(recovery);
    if (recovery.state === "candidate_ready") await completeOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.${operationId.endsWith(":launch") ? "launch" : "recover"}`, result: recovery });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.awaiting_provider", data: { state: "awaiting_provider", execution: execution.id, recovery } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest).map((result, index) => result.state === "awaiting_provider" ? results[index] : result);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results: reconciled });
  return { root, run_id: manifest.run_id, executions: finalized.results, judge_status: finalized.report.judge_status, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation };
}

export async function runnerReconcile({ evalRoot }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  let blueprint;
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id, loaded.value.flow);
    blueprint = validateCaseBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")), loaded);
  } else blueprint = validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded);
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  for (const execution of manifest.executions) {
    const launchId = `${manifest.run_id}:${execution.id}:launch`; const launched = terminalOperation(events, launchId);
    const completed = launched?.terminal === "completed" ? launched.result : null;
    if (completed) { results.push(completed); continue; }
    if (launched?.terminal !== "failed") fail(`execution ${execution.id} is not eligible for terminal reconciliation`, "reconcile_not_eligible");
    const operationId = `${launchId}:reconcile`;
    // An early inspection must not consume the one durable reconciliation operation.
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: null }); const currentStage = latestObservedStage(lifecycle.status, execution.stage, loaded.value.flow.contour);
    assertTerminalReconciliation(execution, currentStage, stageRecord(lifecycle, currentStage));
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reconcile`, action: async () => {
      return await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, terminalOnly: true });
    } });
    const result = receipt.result ?? receipt; results.push(result);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, result, reconciled: true } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results: reconciled });
  return { root, run_id: manifest.run_id, executions: reconciled, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

export async function runnerCancel({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl"), manifest = await readJson(path.join(root, "manifest.json"));
  validateControlManifest(manifest);
  const selected = manifest.executions.filter(execution => !executionId || execution.id === executionId);
  if (!selected.length) fail(`unknown execution: ${executionId}`, "execution_unknown");
  if (typeof manifest.runtime_resource_home !== "string" || !path.isAbsolute(manifest.runtime_resource_home)) fail("EVAL manifest must retain its absolute resource registry home", "runtime_scope_identity_missing");
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  let scopeFence = null, cancelRequest = null;
  if (!executionId) {
    cancelRequest = await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
      type: "dev.dd.eval.cancel_requested", data: { state: "cancelling", scope_id: manifest.run_id } });
    const bin = manifest.runtime_control_bin;
    try {
      scopeFence = await commandJson(bin, ["runtime", "scope", "fence", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeFence.scope_id !== manifest.run_id || scopeFence.dispatch_blocked !== true) fail("Runtime did not confirm the EVAL dispatch fence", "runtime_scope_fence_invalid");
    } catch (error) { scopeFence = { scope_id: manifest.run_id, dispatch_blocked: false, error: errorRecord(error) }; }
  }
  const cancelled = [];
  for (const execution of selected) {
    const events = await readEvents(eventsFile), current = executionState(events, manifest.run_id, execution);
    if (["candidate_ready", "cancelled"].includes(current.result.state)) {
      cancelled.push({ execution: execution.id, settled: true, already_terminal: current.result.state }); continue;
    }
    const sessionId = subjectSessionFor(events, execution.id);
    const data = { state: "cancelling", execution: execution.id, session_id: sessionId };
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
      type: "dev.dd.eval.execution.cancel_requested", data, beforeAppend: prior => {
        const state = executionState(prior, manifest.run_id, execution);
        data.execution_generation = state.generation; data.execution_operation_id = state.operation_id;
      } });
    let receipt;
    try { receipt = await cancelExecutionTree({ root, manifest, execution, profile: manifest.subject_profile, sessionId }); }
    catch (error) { receipt = { settled: false, cleanup_error: errorRecord(error) }; }
    cancelled.push({ execution: execution.id, session_id: sessionId, settled: receipt.settled === true && receipt.native_settled !== false, receipt, event_data: data });
  }
  let scopeInventory = null;
  if (!executionId) {
    const bin = manifest.runtime_control_bin;
    try {
      scopeInventory = await commandJson(bin, ["runtime", "scope", "stop", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeInventory.scope_id !== manifest.run_id || !Array.isArray(scopeInventory.nodes) || typeof scopeInventory.settled !== "boolean"
        || scopeInventory.settled && scopeInventory.nodes.some(node => node.settled !== true || node.native_settled === false)) fail("Runtime scope stop receipt is invalid", "runtime_scope_inventory_invalid");
    } catch (error) { scopeInventory = { scope_id: manifest.run_id, settled: false, nodes: null, error: errorRecord(error) }; }
  }
  // Publish closure only after all selected scopes have proved settlement.
  // An EVAL-wide cleanup failure must not leave per-execution cancelled events.
  for (const item of cancelled.filter(item => item.event_data)) {
    item.settled &&= scopeFence?.dispatch_blocked !== false && (executionId !== null || scopeInventory?.settled === true);
    const data = item.event_data; delete item.event_data;
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: item.execution, traceId: manifest.run_id,
      ...(item.settled ? { id: `execution-cancelled:${hashJson([manifest.run_id, item.execution, data.execution_operation_id, data.execution_generation])}`, deduplicate: true } : {}),
      type: item.settled ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancellation_unconfirmed",
      data: { ...data, state: item.settled ? "cancelled" : "cancellation_unconfirmed", receipt: item.receipt } });
  }
  const projectionEvents = await readEvents(eventsFile);
  const results = storedExecutionResults(projectionEvents, manifest);
  // Control never enters candidate capture or assessment: those may start a
  // provider, and neither case/profile availability is required to cancel.
  const terminal = results.every(result => ["candidate_ready", "failed", "cancelled"].includes(result.state));
  // A process state alone does not prove remote native-tree settlement.
  // Retained scope resources require their own shutdown evidence.
  const settled = cancelled.every(item => item.settled) && scopeFence?.dispatch_blocked !== false
    && (executionId !== null || scopeInventory?.settled === true);
  const priorScope = reduceEvents(projectionEvents).cancellation;
  const scopeRequired = executionId !== null && terminal && !(priorScope?.scope_id === manifest.run_id
    && priorScope.scope_fence?.scope_id === manifest.run_id && priorScope.scope_fence.dispatch_blocked === true && priorScope.scope_inventory?.scope_id === manifest.run_id
    && priorScope.scope_inventory.settled === true && Array.isArray(priorScope.scope_inventory.nodes)
    && priorScope.scope_inventory.nodes.every(node => node.settled === true && node.native_settled !== false));
  const state = !settled || scopeRequired ? "cancellation_unconfirmed" : !terminal ? "awaiting_provider"
    : results.every(result => result.state === "candidate_ready") ? "completed"
    : results.some(result => result.state === "failed") ? "completed_with_failures" : "cancelled";
  if (scopeRequired) await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
    type: "dev.dd.eval.scope_settlement_required", data: { state, code: "scope_settlement_required", cleanup_blocked: true, execution: executionId } });
  if (terminal && settled && !scopeRequired) {
    const revision = runResultRevision(projectionEvents, manifest);
    await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed",
      guard: prior => runResultRevision(prior, manifest) === revision,
      data: { state, result_revision: revision, executions: results.map(result => ({ execution: result.execution, state: result.state })) } });
  }
  if (!executionId) await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
    type: "dev.dd.eval.cancel_observed", data: { state, scope_id: manifest.run_id, request_sequence: cancelRequest.data.sequence, scope_fence: scopeFence, scope_inventory: scopeInventory, cancelled } });
  return { root, run_id: manifest.run_id, cancelled, state, ...(scopeRequired ? { code: "scope_settlement_required", cleanup_blocked: true } : {}), ...(scopeFence ? { scope_fence: scopeFence, scope_inventory: scopeInventory } : {}) };
}

export { runnerStatus } from "./evidence/runner-status.mjs";
