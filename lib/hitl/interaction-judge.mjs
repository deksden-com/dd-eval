import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, readEvents, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { loadNativeContracts, loadCapacityPolicy } from "../capacity-policy.mjs";
import { profileSemanticHash } from "../execution-contract.mjs";
import { assertEvalAdmission } from "../execution/admission.mjs";
import { executionDispatchBarrier } from "../execution/dispatch-barrier.mjs";
import { executionBudget } from "../execution/execution-scheduling.mjs";
import { isObservationLoss } from "../operation-errors.mjs";
import { initializeCodexHome } from "../harness/runtime-setup.mjs";
import { callDriver, providerTurn } from "../harness/driver-call.mjs";
import { assertTargetSession } from "../harness/driver-bindings.mjs";
import { judgeCapacityPrompt } from "../judge/capacity.mjs";
import { assertJudgeVerdict, finishJudgeCleanup } from "../judge/cleanup.mjs";
import { frozenJudgeProfile, judgeRuntimeEnvironment } from "../judge/runtime-binding.mjs";
import { assertJudgeProfileBinding, judgeExecutionArgs, judgeTurnText, parseJsonResponse } from "../judge/judge-receipt.mjs";
import { hitlMatchContract, hitlCoverageContract, hitlCoveragePacketContract, buildHitlPacket, validateHitlPacket, validateGroundedHitl } from "../hitl-contract.mjs";
import { interactionJudgePrompt, retainedJudgeChain, retainedCoverageFilter } from "./judge-retained.mjs";
import { coverageDecision } from "./coverage-decision.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Issue or recover one bound HITL judgment without replaying an unknown turn. */
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
