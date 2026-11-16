import { executeEval } from "./execution/eval-run.mjs";
export { launchEvalExecution } from "./execution/eval-launch.mjs";
export { recoverExecution, runnerRecover } from "./recovery/execution-recovery.mjs";
export { classifyInterruption, isInfrastructureFailure } from "./evidence/failure-classification.mjs";
export { runnerCleanupReceipt } from "./recovery/cleanup-receipt.mjs";
export { settleConclusiveHitlFailure } from "./recovery/execution-cleanup.mjs";
export { captureRecoveryEvidence } from "./recovery/capture-evidence.mjs";
export { scopeResourcesPending, resolveRetiredTechnicalNotes, statusCleanupState, projectStoppedControl } from "./recovery/cleanup-observation.mjs";
export { runnerFork } from "./recovery/eval-fork.mjs";
export { runnerRecoveryInspect } from "./recovery/recovery-source.mjs";
export { selectRecoverySource, recoverySourceFromEvents, recoveryOperationId } from "./recovery/recovery-source.mjs";
export { restoreStageSnapshot } from './recovery/stage-restore.mjs';
export { runnerCheckpoints, assertExecutionEngine } from './recovery/fork-inputs.mjs';
export { verifySnapshot } from './recovery/entry-snapshot.mjs';
export { enrichFailureEvidence } from "./evidence/failure-enrichment.mjs";
export { failureDiagnostic } from "./evidence/failure-diagnostic.mjs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { stages } from "./entry-pack.mjs";
export { publishSubjectTechnicalNotes, projectSubjectTechnicalNotes } from './technical-notes.mjs';
export { reconcileHitlQualification } from "./hitl/preparation-recovery.mjs";
export { interactionCoverageSummary, recoveryHistory, reportMarkdown, executionEvidence, failureAttribution, buildEvidencePacket, buildReport, failureEvidenceRevision } from "./evidence/report-projections.mjs";
export { validateJudgeResult, finalJudgeScope, assertFinalJudgeScope, finalJudgePrompt } from "./judge/final-judge-contract.mjs";
export { judgeRuntimeEnvironment } from "./judge/runtime-binding.mjs";
export { judgeTurnText, assertJudgeProfileBinding } from "./judge/judge-receipt.mjs";
export { validateEntryPack, inheritedFlowStages, initialFlowBoundary, validateCaseBlueprint, materializeCaseStageSlice, continuationStage } from "./flow-boundaries.mjs";
export { validateHarnessProfile, nativeOnlyRunProfile, validateRunProfile } from "./profile-validation.mjs";
export { executionConformance } from "./evidence/execution-conformance.mjs";
export { resolveEvidenceJournals } from "./evidence/evidence-journals.mjs";
export { boundedCapacityContinuation, qualifiedCapacityProbe } from "./harness/qualification.mjs";
export { buildRunCandidate, frozenCandidate, subjectHistoryEvents } from "./evidence/run-candidate.mjs";
export { latestObservedStage, failureStageAttribution } from "./evidence/stage-attribution.mjs";
export { qualifyWorkspaceHooks } from "./harness/workspace-hooks.mjs";
export { assertObservedProfile, assertObservedRuntime, driverProfileArgs, driverRuntimeArgs, driverAdapterInvocation, assertTargetSession, boundedPromptArgs } from "./harness/driver-bindings.mjs";
export { prepareTaskInput, materializeTaskInput } from "./cases/task-input.mjs";
export { definitionSelection, committedDefinitionIdentity, assertRetainedRunDefinition } from "./cases/definition-identity.mjs";
import { qualificationTargets, assertQualificationSelection, recordQualificationCell, qualificationCoverage, writeQualificationSummary } from "./cases/canonical-qualification.mjs";
export { selectedEntries, assertQualificationSelection } from "./cases/canonical-qualification.mjs";
export { directNativeChildren, capacityCodexChildren } from "./harness/native-children.mjs";
export { harnessCompatibilityQualify, harnessCapacityCheck } from "./harness/qualification.mjs";
export { callDriver, admitContractProfiles } from "./harness/driver-call.mjs";
import { prepareEvalInputs } from "./execution/eval-inputs.mjs";
export { prepareRunnerContinuation } from "./execution/continuation-admission.mjs";
export { runnerControlRequest } from "./execution/control-request.mjs";
export { runnerControlReconcile } from "./execution/control-reconcile.mjs";
export { runnerControlResume } from "./execution/control-resume.mjs";
export { runnerControlStatus } from "./execution/control-status.mjs";
export { executionDispatchBarrier, withExecutionAdmissionSignal } from "./execution/dispatch-barrier.mjs";
export { provisionRuntimeEngine } from "./execution/runtime-provision.mjs";
export { installRuntimeShim } from "./execution/runtime-shim.mjs";
export { assertTerminalReconciliation, managedCompletionEvidence, publishExecutionStatistics } from "./execution/completion-evidence.mjs";
export { selectionNeedsEntryPack, prepareFocusedEntries, validateExecutionDescriptors } from "./execution/selection.mjs";
export { evalHome, evalRuntimeEnv } from "./execution/runtime-environment.mjs";
export { restoredRoots, stageSessionMode } from "./execution/flow-observation.mjs";
export { appendRunEventOnce, storedExecutionResults, runResultRevision } from "./execution/result-projection.mjs";
export { assertEvalExecutionDispatch, validateControlResumeInput, assertControlResumeSource } from "./execution/admission.mjs";
export { qualifiedNativeFanoutCapacity, qualifiedCoordinator, assertProfileCapacity } from "./execution/profile-capacity.mjs";
export { Semaphore, createHarnessPermits, executionBudget } from "./execution/execution-scheduling.mjs";
export { declaredManagedTools, prepareDeclaredManagedTools } from "./cases/managed-tools.mjs";
import { writeCanonicalState } from "./cases/canonical-state.mjs";
export { assertSourceTag, assertBlankMemoryProject, assertProjectFlowPack, prepareCanonicalFlowSource } from "./cases/source-validation.mjs";
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
export { materializeCanonicalInput, prepareE2EInput } from "./cases/materialize-input.mjs";
export { fixturesValidate } from "./cases/fixture-validation.mjs";
export { loadCase } from "./cases/load-case.mjs";
import { loadProfile, loadRunProfile } from "./cases/profile-loading.mjs";
export { loadProfile, loadRunProfile } from "./cases/profile-loading.mjs";
export { qualifyCoverageFilter } from "./hitl/coverage-qualification.mjs";
export { reassessHitlQualification } from "./hitl/qualification-reassessment.mjs";
export { hitlQualificationInputs, assertHitlQualification } from "./hitl/qualification-inputs.mjs";
export { interactionJudgePrompt, retainedCoverageFilter } from "./hitl/judge-retained.mjs";
export { interactionJudge } from "./hitl/interaction-judge.mjs";
export { materializeQualificationContext } from "./hitl/qualification-context.mjs";
export { readJson } from "./json-file.mjs";
export { interactiveInputKind, authorizeHitl, interactionFixtureManifest } from "./hitl/interaction-fixtures.mjs";
export { resolveHitlJudgment } from "./hitl/resolve-judgment.mjs";
export { hitlProof } from "./hitl/answer-evidence.mjs";
export { interactionCleanupPending } from "./hitl/interaction-cleanup.mjs";
export { readRegularFile } from "./regular-file.mjs";
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
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

export { evalRun, executeEval } from "./execution/eval-run.mjs";

export { evalJudge } from "./judge/eval-judge.mjs";

export { runnerCleanup } from "./recovery/eval-cleanup.mjs";

export { runnerFinalizeSettled } from "./evidence/finalization.mjs";

export { runnerResume } from "./execution/eval-run.mjs";

export { runnerReconcile } from "./recovery/execution-recovery.mjs";

export { runnerCancel } from "./execution/control-request.mjs";

export { runnerStatus } from "./evidence/runner-status.mjs";
