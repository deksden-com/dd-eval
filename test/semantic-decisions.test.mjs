import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { hashJson, writeJsonAtomic, sha256 } from "../lib/runner-events.mjs";
import { buildHitlPacket, hitlCoverageContract } from "../lib/hitl-contract.mjs";
import { jevInstructions, jevRequest } from "../lib/hitl-coverage.mjs";
import { openaiDecisions } from "../lib/semantic-openai-decisions.mjs";
import { openrouterDecisions } from "../lib/semantic-openrouter-decisions.mjs";
import { validateSemanticConfig, validateSemanticRequest, semanticQuestion, semanticFingerprint, confidenceMeets,
  requestSemantic, observeSemantic, markSemanticFallback, verifySemanticObservation, verifySemanticReceipt,
  ownerEnvironment, semanticRetryAfter, semanticFastPathAnswer, semanticMetrics } from "../lib/semantic-decisions.mjs";
import { childEnvironment } from "../lib/process-json.mjs";

const config = { enabled: true, provider: "openai-decisions", model: "gpt-6-luna", min_confidence: .93, max_retries: 2 };
const jev = { ...config, provider: "openrouter-decisions", model: "typesafe/jev-1.13" };
const request = { schema_id: "dd-eval/semantic-questions@1", state: { question: "Is this resolved?" }, questions: [
  { id: "uncovered", type: "predicate", instructions: "Does a question remain?", criteria: { true: "Unresolved", false: "Resolved" } }
] };
const response = p => ({ model: "gpt-6-luna", answers: [{ type: "predicate", name: "uncovered", probability: p }], usage: { input_tokens: 4, output_tokens: 0, total_tokens: 4 } });
const binding = { stage: "specify", scope_id: "test-scope", round: 1, pause_id: "pause-1" };
const temporary = async fn => {
  const root = await mkdtemp(path.join(os.tmpdir(), "semantic-decision-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
};
const options = root => ({ root, request, config, binding, evalRunId: "EVAL-test", transport: { key: "credential-not-retained", random: () => 0, sleep: async () => {} } });

test("provider-neutral configuration and codecs preserve exact question meaning and keyed responses", async () => {
  assert.deepEqual(validateSemanticConfig(), { enabled: false });
  assert.deepEqual(validateSemanticConfig(config), config);
  for (const invalid of [null, { enabled: false, model: "unused" }, { ...config, provider: "other" }, { ...config, model: "latest" },
    { ...config, min_confidence: NaN }, { ...config, min_confidence: .5 }, { ...config, max_retries: 3 }])
    assert.throws(() => validateSemanticConfig(invalid), { code: "semantic_config_invalid" });
  assert.throws(() => validateSemanticRequest({ ...request, questions: [...request.questions, request.questions[0]] }));
  for (const invalid of [{ ...request, extra: true }, { ...request, state: { bad: NaN } }, { ...request, state: { bad: undefined } },
    { ...request, questions: [{ ...request.questions[0], criteria: { true: "yes", bad: "no" } }] }]) assert.throws(() => validateSemanticRequest(invalid), { code: "semantic_input_invalid" });
  const packet = await buildHitlPacket({ stage: "specify", question: "May closed tasks change?", responses: [
    { id: "canon", topic: "lifecycle", applicability: "specify", answer: "Yes." }
  ], verdictContract: hitlCoverageContract });
  const shared = semanticQuestion(packet), encoded = openrouterDecisions.encode(shared, jev.model);
  assert.equal(shared.questions[0].instructions, jevInstructions);
  assert.deepEqual(encoded, jevRequest(packet, { requested_model: jev.model }));
  const openai = openaiDecisions.encode(shared, config.model);
  assert.deepEqual(JSON.parse(openai.input), encoded.state);
  assert.equal(openai.questions[0].name, "uncovered");
  assert.ok(openai.questions[0].instructions.startsWith(jevInstructions));
  assert.equal(confidenceMeets(1 - .07, .93), true);
  assert.equal(confidenceMeets(.9299, .93), false);
  assert.equal(confidenceMeets(.5, .93), false);
  const two = { ...request, questions: [...request.questions, { ...request.questions[0], id: "__proto__" }] };
  const result = await requestSemantic(two, config, { key: "test", fetchImpl: async () => Response.json({ model: config.model,
    answers: [{ type: "predicate", name: "__proto__", probability: .01 }, { type: "predicate", name: "uncovered", probability: .5 }] }) });
  assert.equal(result.state, "completed");
  assert.deepEqual(result.response.answers.map(a => a.id), ["uncovered", "__proto__"]);
  assert.deepEqual(result.response.answers[0], { id: "uncovered", status: "uncertain", value: null, probability_true: .5, confidence: .5 });
  assert.equal(semanticFastPathAnswer(result.response, config), null);
  for (const raw of [{ ...response(.01), answers: [response(.01).answers[0], response(.01).answers[0]] },
    { ...response(.01), model: "wrong" }, response(1.1), { ...response(.01), answers: [{ type: "predicate", name: "other", probability: .01 }] }])
    assert.equal((await requestSemantic(request, config, { key: "test", fetchImpl: async () => Response.json(raw) })).state, "failed");
  const refusal = await requestSemantic(request, config, { key: "test", fetchImpl: async () => Response.json({ model: config.model, answers: [{ type: "refusal", name: "uncovered", message: "never retain" }] }) });
  assert.deepEqual(refusal.response.answers[0], { id: "uncovered", status: "refused", value: null, probability_true: null, confidence: null });
  assert.ok(!JSON.stringify(refusal).includes("never retain"));
});

test("JEV identity allows only its own release resolution and strips arbitrary provider fields", async () => {
  for (const returned of [jev.model, `${jev.model}-20260917`]) {
    const result = await requestSemantic(request, jev, { key: "test", fetchImpl: async () => Response.json({ model: returned, provider: "TypeSafe", id: "dec-1",
      answers: { uncovered: { type: "noul", noul: .03, explanation: "not retained" } }, usage: { input_tokens: 4, cost: .001, arbitrary: "private" }, secret: "private" }) });
    assert.equal(result.state, "completed");
    assert.equal(result.response.metadata.resolved_snapshot, returned === jev.model ? null : returned);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
  assert.throws(() => openrouterDecisions.decode({ model: "typesafe/jev-1.14-20260917", provider: "TypeSafe", id: "dec", answers: {} }, jev.model));
});

test("failed optional calls retain their phase/status without arbitrary provider errors or secrets", async () => {
  for (const [fetchImpl, reason, status, code] of [
    [async () => { throw Object.assign(new Error("private-key"), { cause: { code: "ECONNRESET" } }); }, "transport_failed", null, "ECONNRESET"],
    [async () => { throw Object.assign(new Error("private-key"), { code: "private-key" }); }, "transport_failed", null, null],
    [async () => new Response(new ReadableStream({ start(c) { c.error(new Error("private-key")); } })), "response_read_failed", 200, null],
    [async () => new Response("private-key"), "response_json_invalid", 200, null],
    [async () => Response.json({ model: "private-key", answers: [] }), "response_schema_invalid", 200, null]
  ]) {
    const result = await requestSemantic(request, config, { key: "private-key", fetchImpl });
    assert.equal(result.reason, reason); assert.equal(result.http_status, status); assert.equal(result.transport_code, code);
    assert.equal(result.retryable, true); assert.ok(!JSON.stringify(result).includes("private-key"));
  }
});

test("three-attempt durable budget, retained backoff and immutable settled decision", async () => temporary(async root => {
  let calls = 0; const waits = [];
  const input = options(root); input.transport.sleep = async ms => { waits.push(ms); };
  input.transport.fetchImpl = async () => ++calls < 3 ? new Response("temporary", { status: 503 }) : Response.json(response(.07));
  const saved = await observeSemantic(input);
  assert.equal(saved.state, "completed"); assert.equal(calls, 3);
  assert.deepEqual(saved.attempts.map(a => a.state), ["failed", "failed", "completed"]);
  assert.equal(saved.attempts[0].reason, "http_503");
  assert.equal(waits.length, 2); assert.ok(waits[0] <= 1000 && waits[0] > 0); assert.ok(waits[1] <= 3000 && waits[1] > 0);
  assert.ok(semanticFastPathAnswer(saved.response, config));
  const metrics = semanticMetrics(saved);
  assert.ok(metrics.http_latency_ms >= 0); assert.ok(metrics.backoff_ms >= 0);
  assert.equal(metrics.scheduled_backoff_ms, 4000); assert.equal(metrics.attempts, 3);
  const retained = await observeSemantic(input); assert.deepEqual(retained, saved); assert.equal(calls, 3);
  assert.ok(!(await readFile(saved.file, "utf8")).includes(input.transport.key));
  const fingerprint = await semanticFingerprint(config);
  verifySemanticObservation(saved, { request, config, binding, evalRunId: "EVAL-test", fingerprint });
  await assert.rejects(observeSemantic({ ...input, binding: { ...binding, round: 2 } }), { code: "judge_evidence_mismatch" });
  const fallback = await markSemanticFallback(root, saved, "task_insufficient", { fingerprint });
  assert.equal(fallback.state, "fallback_intended"); assert.deepEqual(fallback.response, saved.response);
  assert.equal((await observeSemantic(input)).state, "fallback_intended"); assert.equal(calls, 3);
}));

test("optional unavailability, exhausted/long retries and low-confidence need no resampling", async () => {
  for (const mode of ["disabled", "missing", "unbound", "ineligible", "auth", "quota", "exhausted", "long", "low", "refused"]) await temporary(async root => {
    let calls = 0; const input = options(root);
    input.transport.fetchImpl = async () => {
      calls++;
      if (mode === "auth") return new Response("credential-not-retained", { status: 401 });
      if (mode === "quota") return Response.json({ error: { code: "insufficient_quota", message: "credential-not-retained" } }, { status: 429 });
      if (mode === "exhausted" || mode === "long") return new Response("temporary", { status: 503, headers: mode === "long" ? { "retry-after": "11" } : {} });
      if (mode === "refused") return Response.json({ model: config.model, answers: [{ type: "refusal", name: "uncovered" }] });
      return Response.json(response(mode === "low" ? .2 : .01));
    };
    if (mode === "disabled") input.config = { enabled: false };
    if (mode === "missing") input.transport.key = "";
    if (mode === "unbound") input.binding = null;
    if (mode === "ineligible") input.skipReason = "bundle_or_context_ineligible";
    const saved = await observeSemantic(input);
    assert.equal(saved.state, ["low", "refused"].includes(mode) ? "completed" : mode === "disabled" ? "unavailable" : "fallback_intended");
    assert.equal(calls, ["disabled", "missing", "unbound", "ineligible"].includes(mode) ? 0 : mode === "exhausted" ? 3 : 1);
    if (mode === "low" || mode === "refused") {
      assert.equal(semanticFastPathAnswer(saved.response, config), null);
      await markSemanticFallback(root, saved, mode); assert.equal((await observeSemantic(input)).state, "fallback_intended");
    }
  });
  assert.equal(semanticRetryAfter("1.5"), 1500);
  assert.equal(semanticRetryAfter("Wed, 07 Oct 2026 00:00:03 GMT", Date.parse("2026-10-07T00:00:00Z")), 3000);
  assert.equal(semanticRetryAfter("-1"), null); assert.equal(semanticRetryAfter("garbage"), null);
});

test("live or uninspectable owner cannot be stolen; dead unknown attempt goes only to fallback", async () => temporary(async root => {
  let calls = 0, release; const input = options(root);
  input.transport.fetchImpl = async () => { calls++; await new Promise(resolve => { release = resolve; }); return Response.json(response(.01)); };
  const pending = observeSemantic(input);
  while (!release) await delay(5);
  await assert.rejects(observeSemantic(input), { code: "judge_outcome_unknown" });
  await assert.rejects(observeSemantic({ ...input, transport: { ...input.transport, snapshot: async () => { throw new Error("unavailable"); } } }), { code: "process_ownership_unknown" });
  const file = path.join(root, "semantic-observation.json"); const retained = JSON.parse(await readFile(file));
  retained.owner_started = "different birth"; retained.attempts[0].owner_started = "different birth";
  await writeJsonAtomic(file, retained);
  const handed = await observeSemantic(input);
  assert.equal(handed.state, "fallback_intended"); assert.equal(handed.attempts[0].state, "unknown"); assert.equal(calls, 1);
  release(); await assert.rejects(pending, /superseded/);
  assert.equal((await observeSemantic(input)).reason, "dispatch_outcome_unknown"); assert.equal(calls, 1);
}));

test("recovery retains failed attempt budget and backoff without repeating unknown paid call", async () => temporary(async root => {
  const input = options(root); let calls = 0;
  input.transport.fetchImpl = async () => { calls++; return Response.json(response(.01)); };
  const saved = await observeSemantic(input), retained = JSON.parse(await readFile(saved.file));
  retained.state = "backoff"; retained.owner_started = "dead owner"; delete retained.response; delete retained.response_sha256;
  retained.attempts[0] = { ...retained.attempts[0], state: "failed", reason: "http_503", retryable: true };
  delete retained.attempts[0].response; delete retained.attempts[0].response_sha256;
  retained.delay_ms = 1000; retained.not_before = new Date(Date.now() + 90_000).toISOString();
  await writeJsonAtomic(saved.file, retained); let waited = null; input.transport.sleep = async ms => { waited = ms; };
  const recovered = await observeSemantic(input);
  assert.equal(waited, 1000, "clock skew cannot extend retained backoff");
  assert.equal(recovered.attempts.length, 2); assert.equal(calls, 2); assert.equal(recovered.attempts[0].reason, "http_503");
  assert.equal(semanticMetrics(recovered).backoff_ms, null, "recovery must not fabricate the original partial wait");
}));

test("cancellation during HTTP/backoff does not launch fallback or publish late result", async () => {
  for (const mode of ["http", "backoff"]) await temporary(async root => {
    const input = options(root), abort = new AbortController(); let entered;
    const ready = new Promise(resolve => { entered = resolve; }); input.signal = abort.signal;
    if (mode === "http") input.transport.fetchImpl = async (_url, { signal }) => {
      entered(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    };
    else { input.transport.fetchImpl = async () => new Response("overload", { status: 503 }); input.transport.sleep = async (ms, value, opts) => { entered(); return delay(ms, value, opts); }; }
    const pending = observeSemantic(input); await ready; abort.abort(new Error("operator stop"));
    await assert.rejects(pending, /operator stop|aborted/);
    const retained = JSON.parse(await readFile(path.join(root, "semantic-observation.json")));
    assert.equal(retained.cancelled, true); assert.equal(retained.reason, "cancelled");
    await assert.rejects(observeSemantic({ ...input, signal: undefined }), { code: "execution_cancelled" });
    await assert.rejects(markSemanticFallback(root, { ...retained, file: path.join(root, "semantic-observation.json") }, "attempted fallback"), { code: "execution_cancelled" });
  });
});

test("only actual body progress extends inactivity and ordinary key does not leak", async () => {
  const text = JSON.stringify(response(.01)), limits = { inactivityMs: 70, requestBytes: 65536, responseBytes: 65536 };
  const productive = async () => new Response(new ReadableStream({ async start(controller) {
    for (const part of [text.slice(0, 20), text.slice(20, 50), text.slice(50)]) { await delay(40); controller.enqueue(new TextEncoder().encode(part)); }
    controller.close();
  } }));
  assert.equal((await requestSemantic(request, config, { key: "test", limits, fetchImpl: productive })).state, "completed");
  const silent = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  assert.equal((await requestSemantic(request, config, { key: "test", limits, fetchImpl: silent })).reason, "network_inactivity");
  assert.equal((await requestSemantic(request, config, { key: "test", limits: { ...limits, responseBytes: 1 }, fetchImpl: async () => Response.json(response(.01)) })).reason, "output_limit");
  const env = { OPENAI_API_KEY: "ordinary", OPENAI_DECISIONS_API_KEY: "decision", OPENROUTER_API_KEY: "router", PATH: process.env.PATH };
  assert.deepEqual(ownerEnvironment(config, null, env), { OPENAI_API_KEY: "ordinary", OPENAI_DECISIONS_API_KEY: "decision", PATH: process.env.PATH });
  assert.deepEqual(ownerEnvironment(jev, null, env), { OPENAI_API_KEY: "ordinary", OPENROUTER_API_KEY: "router", PATH: process.env.PATH });
  assert.deepEqual(ownerEnvironment({ enabled: false }, {}, env), { OPENAI_API_KEY: "ordinary", OPENROUTER_API_KEY: "router", PATH: process.env.PATH });
  const native = childEnvironment(env); assert.equal(native.OPENAI_DECISIONS_API_KEY, undefined); assert.equal(native.OPENROUTER_API_KEY, undefined); assert.equal(native.OPENAI_API_KEY, "ordinary");
});

test("host observation loss retains an unknown outcome and never resamples the provider", async () => temporary(async root => {
  const input = options(root), originalNow = Date.now; let calls = 0, wall = originalNow();
  input.transport.limits = { inactivityMs: 20, requestBytes: 65536, responseBytes: 65536 };
  input.transport.fetchImpl = async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  };
  // Two lost host-observation episodes are uncertainty, not provider silence.
  Date.now = () => wall += 120_001;
  try {
    const observation = await observeSemantic(input);
    assert.equal(observation.state, "fallback_intended");
    assert.equal(observation.reason, "observation_lost");
    assert.equal(observation.attempts[0].state, "unknown");
    assert.equal(calls, 1);
    assert.equal((await observeSemantic(input)).reason, "observation_lost");
    assert.equal(calls, 1);
  } finally { Date.now = originalNow; }
}));

test("retained route verification uses frozen fingerprint without HTTP and exact canonical bytes", async () => temporary(async root => {
  const packet = await buildHitlPacket({ stage: "specify", question: "Closed?", responses: [{ id: "canon", topic: "lifecycle", applicability: "specify", answer: "Да.\nExact bytes.\n" }], verdictContract: hitlCoverageContract,
    hitlBinding: binding });
  const actualBinding = packet.hitl_binding ?? binding;
  const sourceBinding = { packet_sha256: hashJson(packet), fixture_sha256: "b".repeat(64), operation_id: "op-1", generation: 1 };
  const observation = await observeSemantic({ ...options(root), request: semanticQuestion(packet), binding: actualBinding,
    sourceBinding,
    transport: { key: "test", fetchImpl: async () => Response.json(response(.01)) } });
  const stored = JSON.parse(await readFile(observation.file));
  // A historical proof is checked against its retained dependency hash, never current source.
  stored.identity.binding = packet.hitl_binding ?? null; stored.identity.dependency_sha256 = "a".repeat(64);
  await writeJsonAtomic(observation.file, stored);
  const verdict = { schema_id: hitlCoverageContract, status: "covered", response_ids: ["canon"], uncovered_questions: [] };
  const receipt = { schema_id: "dd-eval/hitl-coverage-route@2", decision_source: "semantic_decision", eval_run_id: "EVAL-test",
    packet_sha256: hashJson(packet), policy: config, policy_sha256: hashJson(config), dependency_sha256: stored.identity.dependency_sha256,
    source_binding: sourceBinding,
    interaction_fixture_sha256: sourceBinding.fixture_sha256,
    observation_sha256: hashJson(stored), verdict, answer_sha256: sha256(packet.responses[0].answer), delimiter: "dd-eval/hitl-response-delimiter@1" };
  assert.deepEqual(await verifySemanticReceipt(root, receipt, packet), verdict);
  await assert.rejects(verifySemanticReceipt(root, { ...receipt, answer_sha256: sha256("paraphrased") }, packet));
  await assert.rejects(verifySemanticReceipt(root, { ...receipt, session_id: "fake" }, packet));
}));
