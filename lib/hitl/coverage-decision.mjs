import path from "node:path";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, readEvents, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { operationContext } from "../operation-context.mjs";
import { loadCapacityPolicy } from "../capacity-policy.mjs";
import { executionState } from "../execution/execution-state.mjs";
import { executionDispatchBarrier, withExecutionAdmissionSignal } from "../execution/dispatch-barrier.mjs";
import { assertCoveragePolicy, observeJev, jevCoveredVerdict, verifyJevReceipt } from "../hitl-coverage.mjs";
import { validateSemanticConfig, semanticFingerprint, semanticQuestion, semanticMetrics, observeSemantic, markSemanticFallback, semanticFastPathAnswer, verifySemanticReceipt } from "../semantic-decisions.mjs";
import { hitlCoverageContract, validateGroundedHitl } from "../hitl-contract.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";
import { hitlResponseDelimiter } from "./resolve-judgment.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Select or reuse a bound semantic coverage decision before native fallback. */
export async function coverageDecision({ runProfile, fixture, packet, root, evalRunId, runtimeRoot }) {
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
