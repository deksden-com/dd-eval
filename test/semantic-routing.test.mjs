import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Ajv from "ajv/dist/2020.js";
import { interactionJudge, loadRunProfile, loadCase, hitlQualificationInputs, nativeOnlyRunProfile, validateRunProfile, interactionCoverageSummary } from "../lib/runner.mjs";
import { buildHitlPacket, hitlCoverageContract } from "../lib/hitl-contract.mjs";
import { semanticFingerprint } from "../lib/semantic-decisions.mjs";
import { hashJson, writeJsonAtomic } from "../lib/runner-events.mjs";

const profileFile = "cases/sdlc-eval-2026-summer-task-priority/run-profiles/specify-luna-openai-decisions.json";
const json = async file => JSON.parse(await readFile(file));

test("profile@2 schema and runtime admit the same decision settings and preserve native qualification keys", async () => {
  const runProfile = await loadRunProfile(profileFile);
  runProfile.qualificationJudgeProfile = { ...await json(`profiles/${runProfile.value.interaction_judge.profile_id}.json`), provider: 'openai', mode: 'agent', permission: 'allow' };
  const ajv = new Ajv({ strict: false });
  ajv.addSchema(await json("schemas/run-profile.v1.schema.json"));
  const check = ajv.compile(await json("schemas/run-profile.v2.schema.json"));
  assert.equal(check(runProfile.value), true, JSON.stringify(check.errors));
  for (const settings of [null, { enabled: false, model: "extra" }, { ...runProfile.value.semantic_decisions, max_retries: 3 },
    { ...runProfile.value.semantic_decisions, model: "wrong" }, { ...runProfile.value.semantic_decisions, min_confidence: .5 }]) {
    const invalid = { ...runProfile.value, semantic_decisions: settings };
    assert.equal(check(invalid), false); assert.throws(() => validateRunProfile(invalid));
  }
  const conflict = structuredClone(runProfile.value); conflict.interaction_judge.coverage_policy = "legacy.json";
  assert.equal(check(conflict), false); assert.throws(() => validateRunProfile(conflict));
  assert.throws(() => validateRunProfile({ ...runProfile.value, schema_id: "dd-eval/run-profile@1" }));
  const native = nativeOnlyRunProfile(runProfile);
  assert.deepEqual(native.value.semantic_decisions, { enabled: false }); assert.equal(native.coveragePolicy, null);
  const loaded = await loadCase(runProfile.value.case_id);
  const keys = await Promise.all([runProfile, native].map(profile => hitlQualificationInputs({ loaded, runProfile: profile, definition: {} })));
  assert.equal(keys[0].key, keys[1].key);
  assert.deepEqual(keys[0].corpus, keys[1].corpus);
});

test("shared semantic HITL issues exact bytes without a scored signal, then replays without HTTP", async t => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), "semantic-route-"));
  t.after(() => rm(attempt, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch, previousKey = process.env.OPENAI_DECISIONS_API_KEY;
  t.after(() => { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_DECISIONS_API_KEY; else process.env.OPENAI_DECISIONS_API_KEY = previousKey; });
  process.env.OPENAI_DECISIONS_API_KEY = "mock-secret-never-persist";
  const profile = path.join(attempt, "judge.json");
  await writeJsonAtomic(profile, { id: "native-unused", harness: "codex-desktop", model: "unused", reasoning: "high" });
  const config = { enabled: true, provider: "openai-decisions", model: "gpt-6-luna", min_confidence: .93, max_retries: 2 };
  const runProfile = { value: { semantic_decisions: config, interaction_judge: { profile_id: profile, verdict_contract: hitlCoverageContract } }, semanticFingerprint: await semanticFingerprint(config) };
  const binding = { stage: "specify", round: 1, pause_id: "pause", scope_id: "canonical-reference" };
  const packet = await buildHitlPacket({ stage: "specify", question: "Which default?", responses: [{ id: "canonical", topic: "default", applicability: "default", answer: "Normal\r\nunchanged" }], verdictContract: hitlCoverageContract });
  packet.hitl_binding = binding;
  const root = path.join(attempt, "interaction-judge", `specify-${hashJson(binding).slice(0, 20)}`);
  await writeJsonAtomic(path.join(root, "packet.json"), packet);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: "gpt-6-luna", answers: [{ name: "uncovered", type: "predicate", probability: .07 }], usage: { input_tokens: 10 } }); };
  const options = { attempt, fixture: { sha256: "a".repeat(64), responses: packet.responses }, runProfile, question: packet.question, stage: "specify", hitlBinding: binding, runtimeRoot: "/no-native-runtime", projectRoot: "/no-project" };
  const first = await interactionJudge(options), replay = await interactionJudge(options);
  assert.equal(first.decision_source, "semantic_decision"); assert.equal(replay.reused, true); assert.equal(calls, 1);
  const receipt = await json(first.receipt_file), observation = await json(path.join(root, "semantic-observation.json"));
  assert.deepEqual(receipt.source_binding, { packet_sha256: hashJson(packet), fixture_sha256: options.fixture.sha256, operation_id: null, generation: null });
  assert.equal(receipt.session_id, undefined); assert.equal(receipt.profile_id, undefined);
  assert.ok(!JSON.stringify(observation).includes("mock-secret-never-persist"));
  assert.equal(first.coverage_filter.attempts.length, 1); assert.ok(first.coverage_filter.latency_ms >= 0);
  const summary = interactionCoverageSummary({ profile: runProfile.value }, [{ execution: "e", hitl: [{ ...binding, verdict: first.verdict, decision_source: first.decision_source, coverage_filter: first.coverage_filter }] }]);
  assert.equal(summary.requested_mode, "semantic_decision"); assert.equal(summary.decisions[0].native, null);
  assert.equal(summary.decisions[0].http.provider, config.provider);
  await assert.rejects(interactionJudge({ ...options, fixture: { ...options.fixture, sha256: "b".repeat(64) } }), { code: "judge_evidence_mismatch" });
  // Crash before route publication must still preserve exact fixture ownership.
  await rm(first.receipt_file);
  await assert.rejects(interactionJudge({ ...options, fixture: { ...options.fixture, sha256: "b".repeat(64) } }), { code: "judge_evidence_mismatch" });
  assert.equal(calls, 1);
});
