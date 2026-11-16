import path from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { hashJson, readEvents, recordOperation, writeJsonAtomic, appendEvent } from "../runner-events.mjs";
import { assertEvalAdmission } from "../execution/admission.mjs";
import { executionBudget } from "../execution/execution-scheduling.mjs";
import { profileSemanticHash } from "../execution-contract.mjs";
import { protocolizeMaterializationEvidence } from "../materialization-evidence.mjs";
import { buildEvidencePacket } from "../evidence/report-projections.mjs";
import { loadNativeContracts, loadCapacityPolicy } from "../capacity-policy.mjs";
import { isObservationLoss } from "../operation-errors.mjs";
import { inspectDaemonOperation } from "../daemon-operations.mjs";
import { callDriver, providerTurn } from "../harness/driver-call.mjs";
import { recoverDriverReply } from "../harness/driver-recovery.mjs";
import { initializeCodexHome } from "../harness/runtime-setup.mjs";
import { judgeCapacityPrompt } from "./capacity.mjs";
import { frozenJudgeProfile, judgeHarnessRoots, judgeRuntimeEnvironment } from "./runtime-binding.mjs";
import { assertJudgeProfileBinding, judgeExecutionArgs, judgeTurnText, parseJsonResponse } from "./judge-receipt.mjs";
import { validateJudgeResult, finalJudgeScope, finalJudgePrompt } from "./final-judge-contract.mjs";
import { assertSupplementalEvidence } from "./supplement.mjs";
import { assertJudgeVerdict, finishJudgeCleanup } from "./cleanup.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Run the final Judge under the durable EVAL operation identity. */
export async function finalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null, historyEvents = [] }) {
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  const operationId = `${runId}:judge:${candidate.immutable_hash}`;
  const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId, traceId: runId,
    operationId, operation: "final_judge", action: () => performFinalJudge({ root, runId, manifest, loaded, profileId, candidate, permits, results, historyEvents }) });
  const result = receipt.result ?? receipt;
  assertJudgeProfileBinding(result, await frozenJudgeProfile(manifest.execution_contract, profileId));
  return result;
}
/** Assess a frozen candidate, reusing retained verdict and cleanup evidence. */
export async function performFinalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null, supplemental = null, frozenProfile = null, runtimeRoots = null, historyEvents = [] }) {
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
