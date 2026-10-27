import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildReport, interactionCoverageSummary, reportMarkdown, resolveHitlJudgment, retainedCoverageFilter, runnerStatus, finalJudgePrompt, hitlProof, executionEvidence } from "../lib/runner.mjs";
import { buildHitlPacket, hitlCoverageContract, validateGroundedHitl } from "../lib/hitl-contract.mjs";
import { hashJson, sha256, appendEvent, writeJsonAtomic } from "../lib/runner-events.mjs";
import { settledJudge } from "./fixtures/judge-cleanup.mjs";

const manifest = { run_id: "EVAL-test", case_id: "case", profile: { interaction_judge: { verdict_contract: hitlCoverageContract } }, hitl_coverage_policy: { mode: "shadow" }, executions: [{ id: "e2e" }] };
const verdict = status => ({ schema_id: hitlCoverageContract, status, response_ids: status === "covered" ? ["canonical"] : [], uncovered_questions: status === "covered" ? [] : ["Which SMS provider should be used?"] });
const result = (status, source = "interaction_judge") => ({ execution: "e2e", state: status === "covered" ? "candidate_ready" : "failed", ...(status !== "covered" ? { code: "hitl_coverage_unresolved" } : {}), hitl: [{ stage: "specify", verdict: verdict(status), decision_source: source, receipt_file: "/retained/result.json", ...(source === "interaction_judge" ? { judge_session_id: "native-session" } : {}), coverage_filter: { requested_mode: "shadow", state: "completed", reason: "shadow", observation_file: "/retained/jev-observation.json", latency_ms: 123, usage: { cost: .001 } } }], statistics: { usage: { input_tokens: 99 } } });

test("compact unresolved JSON and Markdown expose remaining questions without infrastructure blame", () => {
  const report = buildReport({ root: "/retained", manifest, results: [result("uncovered")], state: "completed_with_failures" });
  assert.equal(report.run_validity, "valid"); assert.equal(report.interaction_resolution, "unresolved");
  const decision = report.observability.interactions.decisions[0];
  assert.equal(decision.decision_source, "interaction_judge"); assert.equal(decision.requested_mode, "shadow"); assert.equal(decision.fallback_reason, "shadow");
  assert.deepEqual(decision.uncovered_questions, ["Which SMS provider should be used?"]);
  assert.deepEqual(decision.http.usage, { cost: .001 }); assert.equal(decision.native.usage, null);
  assert.deepEqual(report.observability.usage[0].usage, { input_tokens: 99 });
  const markdown = reportMarkdown(report);
  assert.match(markdown, /Resolution: unresolved/); assert.match(markdown, /Which SMS provider/); assert.match(markdown, /does not establish Subject, fixture or tooling blame/);
});

test("same status projection separates HTTP source, unknown usage and any unresolved decision", () => {
  const accepted = result("covered", "jev"); accepted.hitl[0].coverage_filter = null;
  const summary = interactionCoverageSummary(manifest, [accepted]);
  assert.equal(summary.resolution, "resolved"); assert.equal(summary.decisions[0].native, null);
  assert.equal(summary.decisions[0].http.usage, null); assert.equal(summary.decisions[0].fallback_reason, null);
  const negative = result("ambiguous"); delete negative.code;
  assert.equal(interactionCoverageSummary(manifest, [accepted, negative]).resolution, "unresolved");
  assert.equal(interactionCoverageSummary(manifest, []).resolution, "not_requested");
});

test("historical report@2 does not acquire compact fields or relabel old verdicts", () => {
  const historical = { ...manifest, profile: { interaction_judge: { profile_id: "legacy" } } };
  const report = buildReport({ root: "/retained", manifest: historical, results: [], state: "completed" });
  assert.equal(report.schema_id, "dd-eval/report@2"); assert.equal(report.interaction_resolution, undefined); assert.equal(report.observability.interactions, undefined);
  assert.equal(interactionCoverageSummary(historical, []), null); assert.doesNotMatch(reportMarkdown(report), /Interaction coverage/);
});

test("grounded legacy exchanges retain their actual status and receive the same audit", () => {
  const historical = { ...manifest, profile: { interaction_judge: { profile_id: "legacy" } } };
  const hitl = [{ stage: "specify", judge_session_id: "native", verdict: { schema_id: "dd-eval/hitl-match@3", status: "unmatched", uncovered_questions: ["storage choice"] } }];
  const summary = interactionCoverageSummary(historical, [{ hitl }]);
  assert.equal(summary.resolution, "unresolved");
  assert.equal(summary.decisions[0].status, "unmatched");
  assert.equal(summary.decisions[0].verdict_contract, "dd-eval/hitl-match@3");
  assert.equal(summary.decisions[0].decision_source, "interaction_judge");
  assert.equal(summary.decisions[0].http.usage, null);
  assert.equal(interactionCoverageSummary(historical, [{ hitl_observation: { unavailable: true } }]).resolution, "unknown");
  assert.equal(interactionCoverageSummary(historical, [{ code: "unmatched_hitl" }]).resolution, "unknown", "a missing requested receipt is not not_requested");
  const prompt = finalJudgePrompt({ assessmentFile: "/a", candidateFile: "/c", evidenceFile: "/e", scope: "e2e", assessment: { scopes: { e2e: { outcome: [], flow: [] } } } });
  assert.match(prompt, /regardless of coverage_filter or verdict contract/);
  assert.match(prompt, /Unissued canonical content.*not accepted Subject scope/);
});

test("rejected HITL has a verified audit packet without authorizing an answer", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-rejected-proof-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const responses = [{ id: "canonical", topic: "priority", applicability: "specify", answer: "Existing tasks have no_priority." }];
  const packet = await buildHitlPacket({ stage: "specify", question: "Which SMS provider?", responses, verdictContract: hitlCoverageContract });
  packet.hitl_binding = { stage: "specify", round: 1, pause_id: "pause", scope_id: "e2e" };
  const packetFile = path.join(root, "packet.json"), receiptFile = path.join(root, "result.json");
  await writeFile(packetFile, JSON.stringify(packet));
  const receipt = { schema_id: "dd-eval/interaction-judge-receipt@1", stage: "specify", profile_id: "judge", session_id: "session", packet_sha256: hashJson(packet), verdict: verdict("uncovered") };
  await writeFile(receiptFile, JSON.stringify(receipt));
  const judgment = { packet, receipt_file: receiptFile, profile: "judge", session_id: "session", verdict: receipt.verdict };
  const proof = await hitlProof(judgment, "e2e");
  assert.equal(proof.packet_file, packetFile);
  assert.throws(() => resolveHitlJudgment({ fixture: { responses }, judgment: { ...judgment, proof }, question: packet.question, stage: "specify" }), error => {
    assert.equal(error.code, "hitl_coverage_unresolved");
    assert.equal(error.hitl.answer, undefined);
    assert.deepEqual(error.hitl.verdict.response_ids, []);
    assert.equal(executionEvidence({ state: "failed", hitl: [error.hitl] }).hitl[0].packet_file, packetFile);
    return true;
  });
  await assert.rejects(hitlProof(judgment, "foreign"), { code: "judge_evidence_mismatch" });
  await assert.rejects(hitlProof({ ...judgment, verdict: verdict("covered") }, "e2e"), { code: "judge_evidence_mismatch" });
  await writeFile(packetFile, JSON.stringify({ ...packet, question: "changed" }));
  await assert.rejects(hitlProof(judgment, "e2e"), { code: "judge_evidence_mismatch" });
});

test("shared compact resolver preserves telemetry for covered and unresolved branches", async () => {
  const responses = [{ id: "canonical", topic: "priority", applicability: "specify", answer: "None are required." }];
  const packet = await buildHitlPacket({ stage: "specify", question: "Which SMS provider?", responses, verdictContract: hitlCoverageContract });
  const coverage_filter = { requested_mode: "shadow", reason: "http_503", state: "failed", usage: null };
  const input = { fixture: { responses, sha256: "a".repeat(64) }, question: packet.question, stage: "specify", judgment: { packet, receipt_file: "/retained/result.json", profile: "native", session_id: "session", coverage_filter, verdict: verdict("covered") } };
  assert.deepEqual(resolveHitlJudgment(input).coverage_filter, coverage_filter);
  assert.throws(() => resolveHitlJudgment({ ...input, judgment: { ...input.judgment, verdict: verdict("uncovered") } }), error => error.code === "hitl_coverage_unresolved" && error.hitl.coverage_filter === coverage_filter);
});

test("lost native verdict publication restores original bound filter without inventing a fallback reason", () => {
  const packet = { question: "Frozen question" }, filter = { requested_mode: "shadow", reason: "http_503", state: "failed", observation_file: "/retained/jev-observation.json", usage: null };
  assert.deepEqual(retainedCoverageFilter({ packet_sha256: hashJson(packet), filter }, packet), filter);
  assert.throws(() => retainedCoverageFilter({ packet_sha256: hashJson({ question: "Different pause" }), filter }, packet), error => error.code === "judge_evidence_mismatch");
  assert.throws(() => retainedCoverageFilter({ packet_sha256: hashJson(packet) }, packet), error => error.code === "judge_evidence_mismatch");
});

test("Markdown preserves actual flat model attribution and requested profile", () => {
  const observed = { ...result("covered"), requested_profile: { model: "gpt-6-luna" }, model_attribution: { models: ["gpt-6-luna"], transitions: [{ from: "start", to: "gpt-6-luna" }], observation_completeness: "complete" } };
  const report = buildReport({ root: "/retained", manifest, results: [observed], state: "completed" });
  assert.match(reportMarkdown(report), /e2e: requested gpt-6-luna; observed gpt-6-luna; transitions 1; complete/);
});

for (const verdictContract of [hitlCoverageContract, "dd-eval/hitl-match@3"]) test(`active status reads verified ${verdictContract} proof without changing historical events`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "coverage-active-status-")); t.after(() => rm(root, { recursive: true, force: true }));
  const eventsFile = path.join(root, "events.jsonl"), operationId = `${manifest.run_id}:e2e:launch`;
  const selectedManifest = { ...manifest, profile: { interaction_judge: { profile_id: "judge", verdict_contract: verdictContract } } };
  await writeJsonAtomic(path.join(root, "manifest.json"), selectedManifest);
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: "e2e", type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation: "execution.e2e.launch" } });
  const judgeRoot = path.join(root, "executions", "e2e", "interaction-judge", "specify"), binding = { stage: "specify", round: 1, pause_id: "pause", scope_id: "e2e" };
  await mkdir(judgeRoot, { recursive: true });
  const responses = [{ id: "canonical", topic: "priority", applicability: "specify", answer: "Unchanged canonical answer." }];
  const packet = await buildHitlPacket({ stage: "specify", question: "Which priority?", responses, verdictContract }); packet.hitl_binding = binding;
  await writeJsonAtomic(path.join(judgeRoot, "packet.json"), packet);
  const nativeVerdict = verdictContract === hitlCoverageContract ? verdict("covered") : validateGroundedHitl({ schema_id: verdictContract, atoms: [{ source_quote: packet.question, decision: "Priority", classification: "covered_by_canonical_response", reference_bindings: [], scope_evidence: [], answer_evidence: [{ response_id: "canonical", answer_quote: responses[0].answer }], rationale: "Supplied answer" }] }, packet);
  const receipt = { schema_id: "dd-eval/interaction-judge-receipt@1", stage: "specify", decision_source: "interaction_judge", eval_run_id: manifest.run_id, profile_id: "judge", session_id: "session", packet_sha256: hashJson(packet), verdict: nativeVerdict, ...(verdictContract === hitlCoverageContract ? { coverage_filter: { requested_mode: "shadow", reason: "missing_key", state: "unavailable", usage: null } } : {}) };
  await settledJudge(judgeRoot, receipt);
  const answerFile = path.join(judgeRoot, "answer.md"); await writeFile(answerFile, responses[0].answer);
  const evidence = { ...binding, eval_run_id: manifest.run_id, decision_source: "interaction_judge", judge_profile: "judge", judge_session_id: "session", response_ids: ["canonical"], verdict_contract: verdictContract, packet_sha256: hashJson(packet), receipt_file: path.join(judgeRoot, "result.json"), receipt_sha256: sha256(await readFile(path.join(judgeRoot, "result.json"))), answer_file: answerFile, answer_sha256: sha256(responses[0].answer) };
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: "e2e", type: "dev.dd.eval.hitl.matched", data: evidence });
  const status = await runnerStatus({ evalRoot: root });
  assert.equal(status.interaction_resolution, "resolved"); assert.equal(status.interaction_coverage.decisions.length, 1);
  assert.equal(status.interaction_coverage.decisions[0].fallback_reason, verdictContract === hitlCoverageContract ? "missing_key" : null);
  assert.equal(status.execution_results[0].hitl[0].answer, responses[0].answer);
  assert.equal(status.execution_results[0].hitl[0].packet_file, path.join(judgeRoot, "packet.json"));
  await writeFile(answerFile, "Corrupt answer");
  const journal = await readFile(eventsFile, "utf8"), unavailable = await runnerStatus({ evalRoot: root });
  assert.equal(unavailable.interaction_resolution, "unknown");
  assert.equal(unavailable.interaction_coverage.verification.complete, false);
  assert.equal(unavailable.execution_results[0].hitl_observation.error.code, "judge_evidence_mismatch");
  assert.equal(unavailable.execution_results[0].hitl, undefined);
  assert.equal(await readFile(eventsFile, "utf8"), journal);
});
