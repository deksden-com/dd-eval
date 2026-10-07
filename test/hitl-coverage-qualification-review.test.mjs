import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHitlPacket, hitlCoverageContract } from "../lib/hitl-contract.mjs";
import { coverageTransport, jevPromptHash, assertCoveragePolicy } from "../lib/hitl-coverage.mjs";
import { qualifyCoverageFilter, interactionJudge, hitlQualificationInputs, loadRunProfile } from "../lib/runner.mjs";
import { hashJson, sha256, writeJsonAtomic, appendEvent, readEvents } from "../lib/runner-events.mjs";
import { operationContext } from "../lib/operation-context.mjs";
import { compareCoverageExpectation } from "../lib/hitl-corpus.mjs";

const policy = { schema_id: "dd-eval/hitl-coverage-policy@1", mode: "shadow", requested_model: "typesafe/jev-1.13", resolved_model: "typesafe/jev-1.13-20260917", provider: "TypeSafe", projection_version: "dd-eval/hitl-coverage-input@1", prompt_sha256: jevPromptHash, transport_version: coverageTransport, max_uncovered_probability: null, qualification_sha256: null };
const responses = [{ id: "canonical", topic: "priority", applicability: "specify", answer: "Existing tasks support priority updates." }];
const makePacket = question => buildHitlPacket({ stage: "specify", question, responses, verdictContract: hitlCoverageContract });
async function corpus(root) {
  const items = Array.from({ length: 22 }, (_, n) => ({ id: `case-${n}`, partition: n < 2 ? "calibration" : "heldout", coverage_expectation: { status: n % 2 ? "uncovered" : "covered" } }));
  const tasks = {}, results = [];
  for (const [n, item] of items.entries()) {
    const packet = await makePacket(`${n % 2 ? "Need SMS" : "Update priority"} for unique scenario ${n}?`);
    const packetFile = path.join(root, item.id, "packet.json");
    await writeJsonAtomic(packetFile, packet);
    tasks[item.id] = { key: hashJson(packet) };
    results.push({ id: item.id, samples: [{ receipt_file: path.join(root, item.id, "result.json") }] });
  }
  return { input: { corpus: { items }, tasks, key: "native-qualified", provenance: { corpus_sha256: hashJson(items) } }, results };
}

test("authored duplicate semantic inputs are rejected before native qualification", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "coverage-input-review-")); t.after(() => rm(root, { recursive: true, force: true }));
  const runProfile = await loadRunProfile(new URL("../cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-coverage-shadow.json", import.meta.url).pathname);
  const { input } = await corpus(root);
  const items = input.corpus.items.map((item, n) => ({ ...item, question: `Unique scenario ${n}?`, classification: n % 2 ? "out_of_scope" : "covered_by_canonical_response", response_ids: n % 2 ? [] : ["canonical"],
    coverage_expectation: { status: n % 2 ? "uncovered" : "covered", response_ids: n % 2 ? [] : ["canonical"], remaining_decisions: n % 2 ? [{ id: "missing", description: "Extra decision" }] : [] } }));
  await writeJsonAtomic(path.join(root, "entry-pack-source/interactions/specify.json"), { schema_id: "dd-eval/canonical-responses@1", stage: "specify", mode: "optional", max_rounds: 1, responses });
  const file = path.join(root, "corpus.json");
  const inputs = async () => {
    await writeJsonAtomic(file, { schema_id: "dd-eval/hitl-coverage-corpus@1", stage: "specify", coverage_required: true, items });
    return hitlQualificationInputs({ loaded: { root, value: { id: "fixture", hitl_qualification: { coverage: { file: "corpus.json", sha256: sha256(await readFile(file)) } } } }, runProfile, definition: {} });
  };
  assert.equal((await inputs()).corpus.items.length, 22);
  items.at(-1).question = items[0].question;
  await assert.rejects(inputs(), error => error.code === "definition_qualification_invalid" && /distinct semantic inputs/.test(error.message));
});

test("fresh qualification runs the complete HTTP pipeline, freezes threshold before holdout and reuses every observation", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-qualification-review-"));
  const priorHome = process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, priorKey = process.env.OPENROUTER_API_KEY, priorFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = priorFetch; if (priorHome === undefined) delete process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME; else process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = priorHome; if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = priorKey; await rm(root, { recursive: true, force: true }); });
  process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = path.join(root, "qualification"); process.env.OPENROUTER_API_KEY = "synthetic-only";
  const { input, results } = await corpus(root);
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (++calls > 6) {
      const candidate = path.join(process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, "coverage-candidates", hashJson(Object.fromEntries(Object.entries(policy).filter(([key]) => !["mode", "max_uncovered_probability", "qualification_sha256"].includes(key)))), hashJson(input.corpus));
      assert.equal(JSON.parse(await readFile(path.join(candidate, "calibration-decision.json"))).threshold, .1);
    }
    return Response.json({ id: `decision-${calls}`, model: policy.resolved_model, provider: policy.provider, answers: { uncovered: { type: "noul", noul: request.state.question.startsWith("Need SMS") ? .9 : .1 } } });
  };
  const accepted = await qualifyCoverageFilter(input, results, policy);
  assert.equal(accepted.status, "passed"); assert.equal(calls, 66);
  assert.deepEqual(await qualifyCoverageFilter(input, results, policy), accepted); assert.equal(calls, 66);
  const changedJudge = { ...input, tasks: Object.fromEntries(Object.entries(input.tasks).map(([id]) => [id, { key: `changed-native-judge-${id}` }])) };
  assert.deepEqual(await qualifyCoverageFilter(changedJudge, results, policy), accepted); assert.equal(calls, 66, "native Judge task changes do not repeat unchanged JEV requests");
  await assertCoveragePolicy({ ...policy, mode: "cascade", qualification_sha256: accepted.qualification_sha256, max_uncovered_probability: accepted.threshold }, process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME, input.provenance.corpus_sha256);
  const renamed = { ...input, corpus: { items: input.corpus.items.map(item => ({ ...item, id: `renamed-${item.id}` })) }, tasks: Object.fromEntries(Object.entries(input.tasks).map(([id, value]) => [`renamed-${id}`, value])) };
  const renamedResults = results.map(result => ({ ...result, id: `renamed-${result.id}` }));
  await assert.rejects(qualifyCoverageFilter(renamed, renamedResults, { ...policy, requested_model: "typesafe/jev-1.14" }), { code: "coverage_calibration_invalid" });
  assert.equal(calls, 66, "case renaming cannot reuse a consumed heldout with a changed classifier");
  await writeJsonAtomic(path.join(root, "case-2", "packet.json"), JSON.parse(await readFile(path.join(root, "case-0", "packet.json"))));
  await assert.rejects(qualifyCoverageFilter(input, results, policy), { code: "coverage_calibration_invalid" });
  assert.equal(calls, 66, "duplicate calibration/heldout input is rejected before HTTP even with distinct IDs");
});

test("a negative classification mismatch is not hidden by missing semantic adjudication", () => {
  const item = { id: "negative", coverage_expectation: { status: "ambiguous", response_ids: [], remaining_decisions: [{ id: "reference", description: "Unknown antecedent" }] } };
  const comparison = compareCoverageExpectation(item, { schema_id: hitlCoverageContract, status: "uncovered", response_ids: [], uncovered_questions: ["Which reference?"] }, { responses });
  assert.equal(comparison.passed, false); assert.equal(comparison.shape_passed, false); assert.equal(comparison.semantic_review_required, false);
  assert.equal(comparison.mismatch_kind, "coverage_status_or_ids");
});

for (const mode of ["cancel", "stop", "pause"]) test(`${mode} aborts a progressing HTTP before native fallback or routing`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-owner-cancel-")), priorKey = process.env.OPENROUTER_API_KEY, priorFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = priorFetch; if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = priorKey; await rm(root, { recursive: true, force: true }); });
  process.env.OPENROUTER_API_KEY = "synthetic-only";
  const runId = "EVAL-review", executionId = "e2e", eventsFile = path.join(root, "events.jsonl"), profileFile = path.join(root, "profile.json");
  await writeJsonAtomic(path.join(root, "manifest.json"), { run_id: runId, executions: [{ id: executionId }] });
  await writeJsonAtomic(profileFile, { id: "native-unused", harness: "codex-desktop", model: "test", reasoning: "high" });
  const binding = { stage: "specify", pause_id: "pause", scope_id: "scope", round: 1 }, attempt = path.join(root, "executions", executionId);
  let calls = 0, signal, started;
  const dispatched = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async (_url, options) => {
    calls++; signal = options.signal;
    const stream = new ReadableStream({ start(controller) {
      const timer = setInterval(() => controller.enqueue(new TextEncoder().encode(" ")), 50);
      signal.addEventListener("abort", () => { clearInterval(timer); controller.error(signal.reason); }, { once: true });
    } });
    started(); return new Response(stream);
  };
  const operationId = `${runId}:${executionId}:launch`;
  const pending = operationContext.run({ runId, executionId, eventsFile, operationId }, () => interactionJudge({ attempt, fixture: { responses, sha256: "a".repeat(64) }, question: "Update priority?", stage: "specify", hitlBinding: binding, evalRunId: runId, runProfile: { value: { interaction_judge: { verdict_contract: hitlCoverageContract, profile_id: profileFile } }, coveragePolicy: policy }, runtimeRoot: "/no-native-runtime", projectRoot: "/no-project-access" }));
  const rejected = assert.rejects(pending, { code: mode === "cancel" ? "runtime_scope_stopped" : "managed_run_controlled" });
  await dispatched;
  await appendEvent(eventsFile, { source: "fixture", runId, type: mode === "cancel" ? "dev.dd.eval.cancel_requested" : "dev.dd.eval.control.requested", data: mode === "cancel" ? { state: "cancelling" } : { mode, request_id: "control" } });
  await rejected;
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
  const judgeRoot = path.join(attempt, "interaction-judge", `specify-${hashJson(binding).slice(0, 20)}`);
  for (const file of ["native-intent.json", "result.json"]) await assert.rejects(access(path.join(judgeRoot, file)), { code: "ENOENT" });
  const dispatches = (await readEvents(eventsFile)).filter(event => event.type === "dev.dd.eval.execution.dispatch_accepted");
  assert.equal(dispatches.length, 1, "read-only cancellation probes do not create dispatch/progress events");
});
