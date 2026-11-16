import { recoverExecution } from "./recovery/execution-recovery.mjs";
export { recoverExecution, runnerRecover } from "./recovery/execution-recovery.mjs";
import { observeManagedExecution } from "./execution/managed-observer.mjs";
import { homesFile, registerRunHome, registryEnvironment } from "./homes.mjs";
import { withPriorEvalRetirement, priorEvalOwners, retirementEligible, prepareLaunchResources } from "./eval-retirement.mjs";
import { causalNodes, verifyCapturedNativeFailure } from "./evidence/native-failure.mjs";
import { isInfrastructureFailure } from "./evidence/failure-classification.mjs";
export { classifyInterruption, isInfrastructureFailure } from "./evidence/failure-classification.mjs";
export { runnerCleanupReceipt } from "./recovery/cleanup-receipt.mjs";
import { cancelExecutionTree, settleConclusiveHitlFailure } from "./recovery/execution-cleanup.mjs";
export { settleConclusiveHitlFailure } from "./recovery/execution-cleanup.mjs";
import { captureRecoveryEvidence } from "./recovery/capture-evidence.mjs";
export { captureRecoveryEvidence } from "./recovery/capture-evidence.mjs";
export { scopeResourcesPending, resolveRetiredTechnicalNotes, statusCleanupState, projectStoppedControl } from "./recovery/cleanup-observation.mjs";
import { preparedForkRun } from "./recovery/eval-fork.mjs";
export { runnerFork } from "./recovery/eval-fork.mjs";
export { runnerRecoveryInspect } from "./recovery/recovery-source.mjs";
export { selectRecoverySource, recoverySourceFromEvents, recoveryOperationId } from "./recovery/recovery-source.mjs";
import { verifySnapshot } from './recovery/entry-snapshot.mjs';
import { restoreStageSnapshot } from './recovery/stage-restore.mjs';
export { restoreStageSnapshot } from './recovery/stage-restore.mjs';
export { runnerCheckpoints, assertExecutionEngine } from './recovery/fork-inputs.mjs';
export { verifySnapshot } from './recovery/entry-snapshot.mjs';
import { isInstalledFlow } from './installed-flows.mjs';
import { runBaselineAdmission } from "./baseline-admission.mjs";
import { finalizeRunProjection } from "./evidence/finalization.mjs";
export { enrichFailureEvidence } from "./evidence/failure-enrichment.mjs";
export { failureDiagnostic } from "./evidence/failure-diagnostic.mjs";
import { selectCheckResources } from "./check-resources.mjs";
import { assertCheckpointEngine, assertCheckpointLaunchable } from "./engine-admission.mjs";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, completeOperation, hashJson, readEvents, recordOperation, recordOperationError, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { stages } from "./entry-pack.mjs";
import { commandJson } from "./process-json.mjs";
import { isObservationLoss, isManagedWait, isConclusiveManagedFailure, isConclusiveHitlFailure, errorRecord } from "./operation-errors.mjs";
import { loadNativeContracts } from "./capacity-policy.mjs";
import { recordTechnicalNote } from './technical-notes.mjs';
export { publishSubjectTechnicalNotes, projectSubjectTechnicalNotes } from './technical-notes.mjs';
export { reconcileHitlQualification } from "./hitl/preparation-recovery.mjs";
export { interactionCoverageSummary, recoveryHistory, reportMarkdown, executionEvidence, failureAttribution, buildEvidencePacket, buildReport, failureEvidenceRevision } from "./evidence/report-projections.mjs";
import { assertFinalJudgeScope } from "./judge/final-judge-contract.mjs";
export { validateJudgeResult, finalJudgeScope, assertFinalJudgeScope, finalJudgePrompt } from "./judge/final-judge-contract.mjs";
export { judgeRuntimeEnvironment } from "./judge/runtime-binding.mjs";
export { judgeTurnText, assertJudgeProfileBinding } from "./judge/judge-receipt.mjs";
import { initialFlowBoundary, validateCaseBlueprint } from "./flow-boundaries.mjs";
export { validateEntryPack, inheritedFlowStages, initialFlowBoundary, validateCaseBlueprint, materializeCaseStageSlice, continuationStage } from "./flow-boundaries.mjs";
export { validateHarnessProfile, nativeOnlyRunProfile, validateRunProfile } from "./profile-validation.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { resolveEvidenceJournals } from "./evidence/evidence-journals.mjs";
export { executionConformance } from "./evidence/execution-conformance.mjs";
export { resolveEvidenceJournals } from "./evidence/evidence-journals.mjs";
import { prepareRuntimeHarnessConfig } from "./harness/runtime-setup.mjs";
export { boundedCapacityContinuation, qualifiedCapacityProbe } from "./harness/qualification.mjs";
import { subjectHistoryEvents } from "./evidence/run-candidate.mjs";
export { buildRunCandidate, frozenCandidate, subjectHistoryEvents } from "./evidence/run-candidate.mjs";
export { latestObservedStage, failureStageAttribution } from "./evidence/stage-attribution.mjs";
import { qualifyWorkspaceHooks } from "./harness/workspace-hooks.mjs";
export { qualifyWorkspaceHooks } from "./harness/workspace-hooks.mjs";
import { assertObservedProfile, driverAdapterInvocation } from "./harness/driver-bindings.mjs";
export { assertObservedProfile, assertObservedRuntime, driverProfileArgs, driverRuntimeArgs, driverAdapterInvocation, assertTargetSession, boundedPromptArgs } from "./harness/driver-bindings.mjs";
import { materializeTaskInput } from "./cases/task-input.mjs";
export { prepareTaskInput, materializeTaskInput } from "./cases/task-input.mjs";
import { definitionSelection, loadedDefinitionInputs, committedDefinitionIdentity, assertRetainedRunDefinition } from "./cases/definition-identity.mjs";
export { definitionSelection, committedDefinitionIdentity, assertRetainedRunDefinition } from "./cases/definition-identity.mjs";
import { relative, contained } from "./contained-path.mjs";
import { selectedEntries, qualificationTargets, assertQualificationSelection, recordQualificationCell, qualificationCoverage, writeQualificationSummary } from "./cases/canonical-qualification.mjs";
export { selectedEntries, assertQualificationSelection } from "./cases/canonical-qualification.mjs";
export { directNativeChildren, capacityCodexChildren } from "./harness/native-children.mjs";
export { harnessCompatibilityQualify, harnessCapacityCheck } from "./harness/qualification.mjs";
import { callDriver, admitContractProfiles } from "./harness/driver-call.mjs";
export { callDriver, admitContractProfiles } from "./harness/driver-call.mjs";
import { prepareEvalInputs } from "./execution/eval-inputs.mjs";
import { executionState } from "./execution/execution-state.mjs";
import { prepareRunnerContinuation } from "./execution/continuation-admission.mjs";
export { prepareRunnerContinuation } from "./execution/continuation-admission.mjs";
export { runnerControlRequest } from "./execution/control-request.mjs";
export { runnerControlReconcile } from "./execution/control-reconcile.mjs";
export { runnerControlResume } from "./execution/control-resume.mjs";
export { runnerControlStatus } from "./execution/control-status.mjs";
import { resolveRunContract } from "./execution/run-contract-resolution.mjs";
import { executionDispatchBarrier } from "./execution/dispatch-barrier.mjs";
export { executionDispatchBarrier, withExecutionAdmissionSignal } from "./execution/dispatch-barrier.mjs";
import { terminalExecution, cancelInfrastructureQueue } from "./execution/infrastructure-stop.mjs";
import { collectFlowStatistics } from "./execution/flow-observation.mjs";
import { runtimeEngineIdentity } from "./execution/engine-snapshot.mjs";
import { installRuntimeShim } from "./execution/runtime-shim.mjs";
import { provisionRuntimeEngine } from "./execution/runtime-provision.mjs";
export { provisionRuntimeEngine } from "./execution/runtime-provision.mjs";
export { installRuntimeShim } from "./execution/runtime-shim.mjs";
export { assertTerminalReconciliation, managedCompletionEvidence, publishExecutionStatistics } from "./execution/completion-evidence.mjs";
import { selectionNeedsEntryPack, prepareFocusedEntries, validateExecutionDescriptors } from "./execution/selection.mjs";
export { selectionNeedsEntryPack, prepareFocusedEntries, validateExecutionDescriptors } from "./execution/selection.mjs";
import { assertManagedContract } from "./execution/managed-contract.mjs";
import { evalHome, evalRuntimeEnv, runtimeBin, runtimeEnv } from "./execution/runtime-environment.mjs";
export { evalHome, evalRuntimeEnv } from "./execution/runtime-environment.mjs";
export { restoredRoots, stageSessionMode } from "./execution/flow-observation.mjs";
import { storedExecutionResults, terminalOperation, subjectSessionFor } from "./execution/result-projection.mjs";
export { appendRunEventOnce, storedExecutionResults, runResultRevision } from "./execution/result-projection.mjs";
import { assertEvalAdmission, assertEvalExecutionDispatch, validateControlResumeInput } from "./execution/admission.mjs";
export { assertEvalExecutionDispatch, validateControlResumeInput, assertControlResumeSource } from "./execution/admission.mjs";
import { materializeExecutionContract, contractProfile, assertExpectedExecutionInputs, executionContextHash } from "./execution-contract.mjs";
import { assertProfileCapacity } from "./execution/profile-capacity.mjs";
export { qualifiedNativeFanoutCapacity, qualifiedCoordinator, assertProfileCapacity } from "./execution/profile-capacity.mjs";
import { mapLimited, createHarnessPermits, executionBudget } from "./execution/execution-scheduling.mjs";
export { Semaphore, createHarnessPermits, executionBudget } from "./execution/execution-scheduling.mjs";
import { prepareDeclaredManagedTools } from "./cases/managed-tools.mjs";
export { declaredManagedTools, prepareDeclaredManagedTools } from "./cases/managed-tools.mjs";
import { writeCanonicalState } from "./cases/canonical-state.mjs";
export { assertSourceTag, assertBlankMemoryProject, assertProjectFlowPack, prepareCanonicalFlowSource } from "./cases/source-validation.mjs";
import { fixturesValidate } from "./cases/fixture-validation.mjs";
import { prepareCaseManagedRun } from "./cases/managed-run.mjs";
export { prepareCaseManagedRun } from "./cases/managed-run.mjs";
import { canonicalCandidatePack } from "./cases/canonical-pack.mjs";
export { canonicalEntries } from "./cases/canonical-pack.mjs";
export { canonicalBuild } from "./cases/canonical-build.mjs";
export { canonicalAccept } from "./cases/canonical-entry-acceptance.mjs";
export { canonicalBoundaryAccept } from "./cases/canonical-boundary.mjs";
export { canonicalQualificationRecover } from "./cases/qualification-recovery.mjs";
export { canonicalStatus, canonicalEngineCapture } from "./cases/canonical-operations.mjs";
import { canonicalState, assertCanonicalDefinition } from "./cases/canonical-recovery.mjs";
export { migrateLegacyCanonicalResumeLock } from "./cases/canonical-recovery.mjs";
import { prepareE2EInput } from "./cases/materialize-input.mjs";
export { materializeCanonicalInput, prepareE2EInput } from "./cases/materialize-input.mjs";
export { fixturesValidate } from "./cases/fixture-validation.mjs";
import { loadCase, runnerEntry } from "./cases/load-case.mjs";
export { loadCase } from "./cases/load-case.mjs";
import { loadProfile, loadRunProfile, retainedRunProfile } from "./cases/profile-loading.mjs";
export { loadProfile, loadRunProfile } from "./cases/profile-loading.mjs";
export { qualifyCoverageFilter } from "./hitl/coverage-qualification.mjs";
export { reassessHitlQualification } from "./hitl/qualification-reassessment.mjs";
import { assertHitlQualification } from "./hitl/qualification-inputs.mjs";
export { hitlQualificationInputs, assertHitlQualification } from "./hitl/qualification-inputs.mjs";
export { interactionJudgePrompt, retainedCoverageFilter } from "./hitl/judge-retained.mjs";
export { interactionJudge } from "./hitl/interaction-judge.mjs";
import { semanticFingerprint } from "./semantic-decisions.mjs";
export { materializeQualificationContext } from "./hitl/qualification-context.mjs";
import { readJson } from "./json-file.mjs";
export { readJson } from "./json-file.mjs";
import { executionStages, interactionFixtureManifest, assertInteractionJudgePreflight } from "./hitl/interaction-fixtures.mjs";
export { interactiveInputKind, authorizeHitl, interactionFixtureManifest } from "./hitl/interaction-fixtures.mjs";
export { resolveHitlJudgment } from "./hitl/resolve-judgment.mjs";
export { hitlProof } from "./hitl/answer-evidence.mjs";
export { interactionCleanupPending } from "./hitl/interaction-cleanup.mjs";
import { materializeOperationalDecision } from "./operational-decision.mjs";
export { readRegularFile } from "./regular-file.mjs";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
export { canonicalResume } from "./cases/canonical-resume.mjs";

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


export { qualifyHitlDefinition } from "./hitl/qualification-run.mjs";

export { evalPreflight } from "./execution/eval-preflight.mjs";

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

export { evalJudge } from "./judge/eval-judge.mjs";

export { runnerCleanup } from "./recovery/eval-cleanup.mjs";

export { runnerFinalizeSettled } from "./evidence/finalization.mjs";

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

export { runnerReconcile } from "./recovery/execution-recovery.mjs";

export { runnerCancel } from "./execution/control-request.mjs";

export { runnerStatus } from "./evidence/runner-status.mjs";
