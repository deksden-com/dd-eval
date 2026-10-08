import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHitlPacket, hitlCoverageContract, validateHitlCoverage, hitlCoverageInput, interactionCoveragePrompt, interactionGroundedPrompt, canonicalExclusionRule } from "../lib/hitl-contract.mjs";
import { semanticQuestion } from "../lib/semantic-decisions.mjs";
import { coverageTransport, jevPromptHash, validateCoveragePolicy, jevRequest, requestJev, observeJev, calibrateJev, verifyCoverageQualification } from "../lib/hitl-coverage.mjs";
import { childEnvironment } from "../lib/process-json.mjs";
import { writeJsonAtomic, hashJson, sha256 } from "../lib/runner-events.mjs";
import { interactionJudge, loadRunProfile, loadCase, hitlQualificationInputs, buildReport, classifyInterruption } from "../lib/runner.mjs";
import { compareCoverageExpectation } from "../lib/hitl-corpus.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { settledJudge } from "./fixtures/judge-cleanup.mjs";
import { promptJudgeWithCapacity } from "../lib/judge-capacity.mjs";
import { interactionJudgePrompt } from "../lib/runner.mjs";
import { verifyRetainedHitl } from "../lib/hitl-retained.mjs";
import Ajv from "ajv/dist/2020.js";
import { resolveExecutionContract, profileSemanticHash } from "../lib/execution-contract.mjs";

const policy = { schema_id: "dd-eval/hitl-coverage-policy@1", mode: "shadow", requested_model: "typesafe/jev-1.13", resolved_model: "typesafe/jev-1.13-20260917", provider: "TypeSafe", projection_version: "dd-eval/hitl-coverage-input@1", prompt_sha256: jevPromptHash, transport_version: coverageTransport, max_uncovered_probability: null, qualification_sha256: null };
const packet = (question = "May closed tasks change priority?") => buildHitlPacket({ stage: "specify", question, responses: [{ id: "canonical", topic: "priority", applicability: "specify", answer: "Yes. No extra indicators." }], verdictContract: hitlCoverageContract });
const response = p => ({ id: "decision-1", model: policy.resolved_model, provider: policy.provider, answers: { uncovered: { type: "noul", noul: p } } });

test("every Judge/decision route shares explicit refusal semantics without masking independent gaps", async () => {
  const corpus = JSON.parse(await readFile(new URL("../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/qualification-coverage.json", import.meta.url)));
  const fixture = JSON.parse(await readFile(new URL("../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/specify.json", import.meta.url)));
  const item = corpus.items.find(item => item.id === "luna-cp190-exact");
  const p = await buildHitlPacket({ stage: "specify", question: item.question, responses: fixture.responses, verdictContract: hitlCoverageContract });
  for (const prompt of [interactionCoveragePrompt(p, "<packet>"), interactionGroundedPrompt("<packet>", "<checker>"), jevRequest(p, policy).questions.uncovered.instructions, semanticQuestion(p).questions[0].instructions]) {
    assert.ok(prompt.includes(canonicalExclusionRule));
    assert.match(prompt, /dependent parameters/);
    assert.match(prompt, /refusal of list sorting alone would not settle it/);
    assert.match(prompt, /Independent unanswered decisions and unidentified material references remain unresolved/);
  }
  assert.match(p.responses[0].answer, /не требование нового порядка задач или отдельного порядка UI-контрола/);
  const covered = { schema_id: hitlCoverageContract, status: "covered", response_ids: [p.responses[0].id], uncovered_questions: [] };
  assert.equal(compareCoverageExpectation(item, covered, { responses: p.responses }).passed, true);
  assert.equal(compareCoverageExpectation(item, { ...covered, status: "uncovered", response_ids: [], uncovered_questions: ["Каков порядок уровней приоритета в фиксированной шкале?"] }, { responses: p.responses }).passed, false, "wrong historical verdict is not waived by the oracle");
  const gap = corpus.items.find(item => item.id === "material-gap");
  assert.equal(compareCoverageExpectation(gap, covered, { responses: p.responses }).passed, false);
});

test("compact contract validates exact shape and never projects partial IDs", async () => {
  const p = await packet();
  const covered = { schema_id: hitlCoverageContract, status: "covered", response_ids: ["canonical"], uncovered_questions: [] };
  assert.deepEqual(validateHitlCoverage(covered, p), covered);
  for (const invalid of [{ ...covered, atoms: [] }, { ...covered, response_ids: [] }, { ...covered, response_ids: ["invented"] }, { ...covered, status: "uncovered" }, { ...covered, uncovered_questions: ["Need colors?"] }]) assert.throws(() => validateHitlCoverage(invalid, p));
  assert.equal(validateHitlCoverage({ ...covered, status: "ambiguous", response_ids: [], uncovered_questions: ["Which archive?"] }, p).status, "ambiguous");
  const input = hitlCoverageInput(p);
  assert.equal(input.question, p.question);
  assert.match(interactionCoveragePrompt(p, "/packet.json"), /uncovered_questions/);
  assert.throws(() => validateCoveragePolicy({ ...policy, url: "https://untrusted" }));
  assert.throws(() => validateCoveragePolicy({ ...policy, requested_model: "typesafe/jev-latest" }), { code: "coverage_policy_invalid" });
  const schema = new Ajv().compile(JSON.parse(await readFile(new URL("../schemas/hitl-coverage.v1.schema.json", import.meta.url))));
  assert.equal(schema(covered), true); assert.equal(schema({ ...covered, atoms: [] }), false);
  assert.equal(schema({ ...covered, status: "uncovered", response_ids: [] }), false);
  assert.equal(schema({ ...covered, status: "uncovered", response_ids: [], uncovered_questions: ["Need SMS?"] }), true);
});

test("JEV validates pinned response identity, probability, bytes and HTTP failures", async () => {
  const p = await packet(), request = jevRequest(p, policy);
  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(url, "https://openrouter.ai/api/alpha/decisions"); assert.equal(options.redirect, "error"); return Response.json(response(.1)); };
  assert.equal((await requestJev(request, policy, { key: "secret", fetchImpl })).probability, .1);
  assert.equal(calls, 1);
  assert.equal((await requestJev(request, policy, { key: "", fetchImpl })).reason, "missing_key");
  assert.equal((await requestJev(request, policy, { key: "secret", fetchImpl: async () => new Response("secret", { status: 429 }) })).reason, "http_429");
  for (const value of [{ ...response(.1), provider: "other" }, response(1.1), { ...response(.1), model: "latest" }]) assert.equal((await requestJev(request, policy, { key: "secret", fetchImpl: async () => Response.json(value) })).state, "failed");
  assert.equal((await requestJev(request, policy, { key: "secret", limits: { inactivityMs: 1000, requestBytes: 1, responseBytes: 1000 }, fetchImpl })).reason, "input_limit");
  assert.equal(calls, 1);
});

test("only network progress extends JEV inactivity; silence aborts and cancellation wins", async () => {
  const request = jevRequest(await packet(), policy), body = JSON.stringify(response(.1));
  const limits = { inactivityMs: 80, requestBytes: 65536, responseBytes: 65536 };
  const fetchImpl = async () => new Response(new ReadableStream({ async start(controller) {
    for (const part of [body.slice(0, 20), body.slice(20, 50), body.slice(50)]) { await delay(45); controller.enqueue(new TextEncoder().encode(part)); }
    controller.close();
  } }));
  assert.equal((await requestJev(request, policy, { key: "secret", limits, fetchImpl })).state, "completed", "productive body may outlive original window");
  const waiting = async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  assert.equal((await requestJev(request, policy, { key: "secret", limits, fetchImpl: waiting })).reason, "network_inactivity");
  const abort = new AbortController(); const pending = requestJev(request, policy, { key: "secret", limits, fetchImpl: waiting, signal: abort.signal });
  abort.abort(new Error("operator cancellation")); await assert.rejects(pending, /operator cancellation/);
  assert.equal((await requestJev(request, policy, { key: "secret", limits: { ...limits, responseBytes: 1 }, fetchImpl: async () => Response.json(response(.1)) })).reason, "output_limit");
});

test("JEV retains original observation, reuses it once and rejects drift", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-observation-"));
  try {
    const p = await packet(); let calls = 0;
    const options = { root, packet: p, policy, binding: null, key: "never-persist", fetchImpl: async () => { calls++; return Response.json(response(.12)); } };
    const first = await observeJev(options), second = await observeJev(options);
    assert.equal(first.probability, .12); assert.equal(second.probability, .12); assert.equal(calls, 1);
    assert.ok(!(await readFile(first.file, "utf8")).includes("never-persist"));
    await assert.rejects(observeJev({ ...options, binding: { pause: "different" } }), /another input/);
    const abort = new AbortController(); abort.abort(new Error("cancelled"));
    await assert.rejects(observeJev({ ...options, signal: abort.signal }), /cancelled/);
    const pending = JSON.parse(await readFile(first.file));
    pending.state = "dispatched";
    pending.owner_pid = process.pid;
    pending.owner_started = "a different physical process birth";
    await writeJsonAtomic(first.file, pending);
    assert.equal((await observeJev(options)).state, "unknown", "PID reuse must not authorize redispatch");
    assert.equal((await observeJev(options)).state, "unknown");
    assert.equal(calls, 1);
    await assert.rejects(observeJev({ ...options, evalRunId: "foreign-eval" }), /another input/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("qualification derives acceptance instead of trusting counters and requires distinct holdout", () => {
  const calibration = [{ id: "positive", expected: "covered", probabilities: [.1, .2, .3] }, { id: "negative", expected: "uncovered", probabilities: [.8, .9, .7] }];
  const heldout = Array.from({ length: 20 }, (_, n) => ({ id: `heldout-${n}`, expected: n < 10 ? "covered" : "uncovered", probabilities: n < 10 ? [.1, .2, .3] : [.6, .7, .8] }));
  const receipt = calibrateJev(calibration, heldout, policy);
  assert.equal(receipt.status, "passed"); assert.equal(receipt.threshold, .3);
  const cascade = { ...policy, mode: "cascade", max_uncovered_probability: .3, qualification_sha256: "a".repeat(64) };
  assert.equal(verifyCoverageQualification(receipt, cascade), receipt);
  assert.throws(() => verifyCoverageQualification({ ...receipt, heldout: heldout.map((s, n) => n === 19 ? { ...s, probabilities: [.1, .7, .8] } : s) }, cascade));
  assert.throws(() => calibrateJev(calibration, heldout.map((s, n) => n === 0 ? { ...s, id: "positive" } : s), policy));
});

test("non-owner environment strips OpenRouter after overrides", () => {
  assert.equal(childEnvironment({ OPENROUTER_API_KEY: "secret", KEEP_ME: "value" }).OPENROUTER_API_KEY, undefined);
  assert.equal(childEnvironment({ KEEP_ME: "value" }).KEEP_ME, "value");
});

test("coverage corpus freezes calibration and balanced holdout, separating semantic review from structural PASS", async () => {
  const runProfile = await loadRunProfile("cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-coverage-shadow.json");
  runProfile.qualificationJudgeProfile = { ...JSON.parse(await readFile(path.join('profiles', `${runProfile.value.interaction_judge.profile_id}.json`))), provider: 'openai', mode: 'agent', permission: 'allow' };
  const loaded = await loadCase(runProfile.value.case_id), qualified = await hitlQualificationInputs({ loaded, runProfile, definition: {} });
  assert.equal(qualified.corpus.items.length, 41); assert.equal(qualified.compact, true);
  const gap = qualified.corpus.items.find(item => item.id === "material-gap"), responses = qualified.fixtures.specify.responses;
  const observed = { schema_id: hitlCoverageContract, status: "uncovered", response_ids: [], uncovered_questions: ["How are concurrent writes resolved?"] };
  assert.equal(compareCoverageExpectation(gap, observed, { responses }).semantic_review_required, true);
  assert.equal(compareCoverageExpectation(gap, observed, { responses, review: { complete: true, covered_remaining_ids: ["concurrency"] } }).passed, true);
  assert.equal(compareCoverageExpectation(gap, { ...observed, status: "covered", response_ids: [responses[0].id], uncovered_questions: [] }, { responses }).passed, false);
});

test("qualified JEV fast path issues and replays original proof without a native runtime", async () => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), "jev-issuance-")), priorFetch = globalThis.fetch;
  const priorHome = process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, priorKey = process.env.OPENROUTER_API_KEY;
  try {
    process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = path.join(attempt, "qualification"); process.env.OPENROUTER_API_KEY = "secret";
    const calibration = [{ id: "yes", expected: "covered", probabilities: [.1, .2, .3] }, { id: "no", expected: "uncovered", probabilities: [.8, .9, .7] }];
    const heldout = Array.from({ length: 20 }, (_, n) => ({ id: `test-${n}`, expected: n < 10 ? "covered" : "uncovered", probabilities: n < 10 ? [.1, .2, .3] : [.8, .9, .7] }));
    const certificate = calibrateJev(calibration, heldout, policy);
    for (const sample of [...certificate.calibration, ...certificate.heldout]) {
      const frozenPacket = await packet(`May closed tasks change priority in independent scenario ${sample.id}?`);
      const certificatePacketFile = path.join(attempt, `${sample.id}-qualification-packet.json`);
      await writeJsonAtomic(certificatePacketFile, frozenPacket);
      sample.packet_file = certificatePacketFile; sample.packet_sha256 = hashJson(frozenPacket); sample.observations = [];
      for (const [index, probability] of sample.probabilities.entries()) {
        const file = path.join(attempt, "mock-original-observations", `${sample.id}-${index}.json`), raw = response(probability);
        await writeJsonAtomic(file, { schema_id: "dd-eval/jev-observation@1", state: "completed", identity: { packet_sha256: hashJson(frozenPacket), request_sha256: hashJson(jevRequest(frozenPacket, policy)), classifier_sha256: certificate.classifier_sha256 }, response: raw, response_sha256: hashJson(raw) });
        sample.observations.push({ file, sha256: sha256(await readFile(file)), probability });
      }
    }
    const bytes = JSON.stringify(certificate, null, 2) + "\n", digest = sha256(bytes);
    await writeJsonAtomic(path.join(process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, "coverage", `${digest}.json`), certificate);
    const cascade = { ...policy, mode: "cascade", max_uncovered_probability: certificate.threshold, qualification_sha256: digest };
    const profileFile = path.join(attempt, "profile.json");
    await writeFile(profileFile, JSON.stringify({ id: "no-native-access", harness: "codex-desktop", model: "test", reasoning: "high" }));
    const p = await packet(), binding = { stage: "specify", round: 1, pause_id: "pause", scope_id: "e2e" }; p.hitl_binding = binding;
    const root = path.join(attempt, "interaction-judge", `specify-${hashJson(binding).slice(0, 20)}`);
    await mkdir(root, { recursive: true }); await writeJsonAtomic(path.join(root, "packet.json"), p);
    let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(response(.1)); };
    const options = { attempt, fixture: { sha256: "a".repeat(64), responses: p.responses }, question: p.question, stage: "specify", hitlBinding: binding,
      runProfile: { value: { interaction_judge: { profile_id: profileFile, verdict_contract: hitlCoverageContract } }, coveragePolicy: cascade }, runtimeRoot: "/no-native-runtime", projectRoot: "/no-project-access" };
    const first = await interactionJudge(options), second = await interactionJudge(options);
    assert.equal(first.decision_source, "jev"); assert.equal(second.reused, true); assert.equal(calls, 1);
    const receipt = JSON.parse(await readFile(first.receipt_file)); assert.equal(receipt.session_id, undefined); assert.equal(receipt.profile_id, undefined);
    const answerFile = path.join(attempt, "answer.md"); await writeFile(answerFile, p.responses[0].answer);
    const anchored = { ...binding, response_ids: first.verdict.response_ids, decision_source: "jev", verdict_contract: hitlCoverageContract,
      receipt_file: first.receipt_file, answer_file: answerFile, receipt_sha256: sha256(await readFile(first.receipt_file)), packet_sha256: hashJson(p), answer_sha256: sha256(p.responses[0].answer) };
    assert.equal((await verifyRetainedHitl({ data: anchored })).cleanup, null);
    await assert.rejects(verifyRetainedHitl({ data: { ...anchored, judge_session_id: "fake" } }), /Session|provider/);
    await writeJsonAtomic(first.receipt_file, { ...receipt, qualification_bytes: "{}" });
    await assert.rejects(interactionJudge(options), /frozen qualification/); assert.equal(calls, 1);
    const duplicated = structuredClone(certificate);
    duplicated.heldout[0] = { ...duplicated.calibration[0], id: duplicated.heldout[0].id };
    const duplicateBytes = JSON.stringify(duplicated, null, 2) + "\n", duplicateHash = sha256(duplicateBytes);
    await writeJsonAtomic(path.join(process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, "coverage", `${duplicateHash}.json`), duplicated);
    const { assertCoveragePolicy } = await import("../lib/hitl-coverage.mjs");
    await assert.rejects(assertCoveragePolicy({ ...cascade, qualification_sha256: duplicateHash }, process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME), /repeats a semantic input/);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorHome === undefined) delete process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME; else process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = priorHome;
    if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = priorKey;
    await rm(attempt, { recursive: true, force: true });
  }
});

test("compact native replay retains its actual Session, final Turn and settled cleanup", async () => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), "compact-native-"));
  try {
    const p = await packet(), binding = { stage: "specify", round: 1, pause_id: "pause", scope_id: "e2e" }; p.hitl_binding = binding;
    const root = path.join(attempt, "interaction-judge", `specify-${hashJson(binding).slice(0, 20)}`), packetFile = path.join(root, "packet.json");
    await mkdir(root, { recursive: true }); await writeJsonAtomic(packetFile, p);
    const nativeProfile = { id: "native", harness: "codex-desktop", model: "test", reasoning: "high" };
    await writeJsonAtomic(path.join(attempt, "agent-profiles/native.json"), { ...nativeProfile, schema_id: "dd-flow/agent-profile@1", harness: "codex", provider: "openai", mode: "agent", permission: "allow" });
    const executionContract = await resolveExecutionContract({ runProfile: { subject: { profile_id: "native" }, interaction_judge: { profile_id: "native" } }, loadProfile: async () => ({ value: nativeProfile }), configHome: attempt });
    const verdict = { schema_id: hitlCoverageContract, status: "covered", response_ids: ["canonical"], uncovered_questions: [] };
    await settledJudge(root, { schema_id: "dd-eval/interaction-judge-receipt@1", decision_source: "interaction_judge", stage: "specify", profile_id: "native", profile_sha256: profileSemanticHash(executionContract.profiles.native), session_id: "session", interaction_fixture_sha256: "a".repeat(64), packet_sha256: hashJson(p), verdict });
    const prompt = interactionJudgePrompt(packetFile, p), stateFile = path.join(root, `capacity-${hashJson(["session", prompt])}.json`);
    await promptJudgeWithCapacity({ codex: false, sessionId: "session", packetFiles: [packetFile], originalPrompt: prompt, stateFile,
      dispatch: async (_text, _capacity, before) => { await before(); return { provider_session_id: "session", turn_id: "turn", turn: { id: "turn", status: "completed" }, assistant_text: JSON.stringify(verdict) }; } });
    const options = { attempt, fixture: { sha256: "a".repeat(64), responses: p.responses }, question: p.question, stage: "specify", hitlBinding: binding,
      runProfile: { executionContract, value: { interaction_judge: { profile_id: "native", verdict_contract: hitlCoverageContract } } }, runtimeRoot: "/no-runtime", projectRoot: "/no-project" };
    const replay = await interactionJudge(options); assert.equal(replay.reused, true); assert.equal(replay.session_id, "session");
    await writeJsonAtomic(stateFile, { ...(JSON.parse(await readFile(stateFile))), turns: [] });
    await assert.rejects(interactionJudge(options), /native|Turn|turn|chain/);
  } finally { await rm(attempt, { recursive: true, force: true }); }
});

test("unresolved coverage stays neutral, not infrastructure blame", () => {
  const manifest = { run_id: "test", case_id: "case", profile: { interaction_judge: { verdict_contract: hitlCoverageContract } }, executions: [] };
  const report = buildReport({ root: "/test", manifest, state: "completed_with_failures", results: [{ execution: "e", state: "failed", code: "hitl_coverage_unresolved" }] });
  assert.equal(report.schema_id, "dd-eval/report@3"); assert.equal(report.interaction_resolution, "unresolved"); assert.equal(report.run_validity, "valid");
  assert.equal(classifyInterruption({ code: "hitl_coverage_unresolved" }).source, "unknown");
});
