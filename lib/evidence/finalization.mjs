import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";
import { readEvents, appendEvent, hashJson, sha256, reduceEvents, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { projectRunCompletion } from "../completion-scope.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { storedResultProjection, runResultRevision, appendRunEventOnce } from "../execution/result-projection.mjs";
import { assertEvalAdmission } from "../execution/admission.mjs";
import { terminalExecution } from "../execution/infrastructure-stop.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { failureCaptureState } from "../recovery/capture-evidence.mjs";
import { observeExecutionCleanup } from "../recovery/execution-cleanup.mjs";
import { hasObservedRetirementProof, resolveRetiredTechnicalNotes } from "../recovery/cleanup-observation.mjs";
import { interactionCleanupPending } from "../hitl/interaction-cleanup.mjs";
import { technicalNotes, recordTechnicalNote, publishSubjectTechnicalNotes } from "../technical-notes.mjs";
import { attachCaseAcceptance } from "../cases/acceptance-receipts.mjs";
import { finalJudge } from "../judge/final-assessment.mjs";
import { judgeRootForCandidate } from "../judge/verdict-path.mjs";
import { assertJudgeProfileBinding } from "../judge/judge-receipt.mjs";
import { observeJudgeCleanup } from "../judge/cleanup.mjs";
import { verifyCapturedNativeFailure } from "./native-failure.mjs";
import { refreshFailureEvidence } from "./failure-enrichment.mjs";
import { attachModelAttribution } from "./execution-conformance.mjs";
import { candidateMatches, freezeCandidateLocked, subjectHistoryEvents } from "./run-candidate.mjs";
import { buildReport, reportMarkdown } from "./report-projections.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Reconcile capture, retirement and assessment into a stable EVAL report. */
export async function finalizeRunProjection({ root, manifest, loaded, permits = null, cleanupOnly = false, authorizeFinalization = null, judgeNativeContracts }) {
  const eventsFile = path.join(root, "events.jsonl");
  const manifestBytes = await readRegularFile(path.join(root, "manifest.json"));
  if (hashJson(JSON.parse(manifestBytes)) !== hashJson(manifest)) fail("Finalization manifest changed", "runner_definition_drift");
  const manifestSha = sha256(manifestBytes);
  let projectedEvents = await readEvents(eventsFile);
  projectedEvents = await refreshFailureEvidence({ root, manifest, eventsFile, projectedEvents, manifestSha });
  const { results, revision: resultHash } = storedResultProjection(projectedEvents, manifest);
  for (const result of results) if (result.state === "failed") await verifyCapturedNativeFailure({ evalRoot: root, result });
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
  let { pending: executionUnsettled, inventory: sourceInventory, physical: sourcePhysical } = await observeExecutionCleanup(root, manifest, results, { onTechnicalNotes: async (runId, notes) => {
    await publishSubjectTechnicalNotes(eventsFile, manifest.run_id, runId, notes);
  } });
  // A retained scope retirement can establish physical stop without a clean
  // native receipt. It cannot grant capture, finalization or Judge authority.
  let retiredScope = await hasObservedRetirementProof(root, manifest, { inventory: sourceInventory, physical: sourcePhysical });
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
        try { judgeCleanup = await observeJudgeCleanup(judgeRootForCandidate(root, candidate), judge, { nativeContracts: judgeNativeContracts }); judgeError = null; retainedJudgeStatus = "completed"; }
        catch (error) { judgeError = errorRecord(error); retainedJudgeStatus = "failed"; judgeCleanup = { ...error.details?.cleanup, status: error.details?.cleanup?.status === "failed" ? "failed" : "unknown", error: judgeError }; }
      }
    }
  }
  if (canFinalize && !cleanupOnly) {
    const frozen = await withRunnerLock(`${root}.candidate`, () => withRunnerLock(eventsFile, async () => {
      const current = await readEvents(eventsFile);
      if (runResultRevision(current, manifest) !== resultHash || hashJson(subjectHistoryEvents(current, manifest)) !== historyHash) return null;
      return freezeCandidateLocked({ root, manifest, results, events: current });
    }));
    if (!frozen) return finalizeRunProjection({ root, manifest, loaded, permits, cleanupOnly, authorizeFinalization, judgeNativeContracts });
    candidate = frozen.candidate;
    if (frozen.created) await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.candidate.frozen", data: { state: candidate.outcome, candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file } });
    if (manifest.profile?.judge?.enabled) {
      const judgeRoot = judgeRootForCandidate(root, candidate);
      const file = path.join(judgeRoot, "result.json");
      if (authorizeFinalization && !(await exists(file))) await authorizeFinalization();
      try {
        judge = await (await exists(file) ? readJson(file) : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: manifest.profile.judge.profile_id, candidate, permits, results, historyEvents }));
        if (manifest.execution_contract) assertJudgeProfileBinding(judge, contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id));
        if (judge.candidate_sha256 !== candidate.immutable_hash || judge.profile_id !== manifest.profile.judge.profile_id) fail("Retained Judge differs from this candidate/profile", "judge_evidence_mismatch");
        judgeCleanup = await observeJudgeCleanup(judgeRoot, judge, { nativeContracts: judgeNativeContracts });
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
    const fresh = await observeExecutionCleanup(root, manifest, results);
    retiredScope = await hasObservedRetirementProof(root, manifest, fresh);
    if (!retiredScope) {
      const interactionPending = await interactionCleanupPending(eventsFile, manifest.run_id, await readEvents(eventsFile), results).catch(() => true);
      cleanupState = fresh.pending || interactionPending ? "pending" : "settled";
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
  return published ?? finalizeRunProjection({ root, manifest, loaded, permits, cleanupOnly, authorizeFinalization, judgeNativeContracts });
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
    const finalized = await finalizeRunProjection({ root, manifest, loaded, authorizeFinalization: authorize, cleanupOnly: technicalOnly });
    return { root, run_id: manifest.run_id, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation, state: finalized.state, judge_status: finalized.report.judge_status, executions: finalized.results };
  });
}
