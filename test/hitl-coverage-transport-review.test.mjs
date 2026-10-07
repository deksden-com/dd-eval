import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { observeJev, coverageTransport, jevPromptHash } from "../lib/hitl-coverage.mjs";
import { buildHitlPacket, hitlCoverageContract } from "../lib/hitl-contract.mjs";
import { withRunnerLock } from "../lib/runner-lock.mjs";
import { setTimeout as delay } from "node:timers/promises";

const policy = { schema_id: "dd-eval/hitl-coverage-policy@1", mode: "shadow", requested_model: "typesafe/jev-1.13", resolved_model: "typesafe/jev-1.13-20260917", provider: "TypeSafe", projection_version: "dd-eval/hitl-coverage-input@1", prompt_sha256: jevPromptHash, transport_version: coverageTransport, max_uncovered_probability: null, qualification_sha256: null };
const packet = () => buildHitlPacket({ stage: "specify", question: "May closed tasks change priority?", responses: [{ id: "canonical", topic: "priority", applicability: "specify", answer: "Yes." }], verdictContract: hitlCoverageContract });
const response = () => Response.json({ id: "decision", model: policy.resolved_model, provider: policy.provider, answers: { uncovered: { type: "noul", noul: .1 } } });

test("first qualification observation creates its nested storage before dispatch and reuses receipt", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "jev-first-observation-"));
  try {
    const root = path.join(parent, "coverage-observations", "classifier", "request"); let calls = 0;
    const options = { root, packet: await packet(), policy, binding: { native_key: "native", repetition: 0 }, key: "not-retained", fetchImpl: async () => { calls++; return response(); } };
    const first = await observeJev(options), replay = await observeJev(options);
    assert.equal(first.state, "completed"); assert.equal(replay.probability, .1); assert.equal(calls, 1);
    assert.equal((await readFile(first.file, "utf8")).includes("not-retained"), false);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("failed HTTP observation is durable and never retried for the same binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-failed-observation-"));
  try {
    let calls = 0;
    const options = { root, packet: await packet(), policy, binding: null, key: "secret", fetchImpl: async () => { calls++; return new Response("private error", { status: 503 }); } };
    const first = await observeJev(options), before = await readFile(first.file, "utf8");
    assert.equal(first.state, "failed"); assert.equal(first.reason, "http_503");
    assert.equal((await observeJev(options)).state, "failed"); assert.equal(calls, 1);
    assert.equal(await readFile(first.file, "utf8"), before); assert.equal(before.includes("private error"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cancellation during dispatch takes priority and a live unknown owner cannot redispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-cancel-observation-"));
  try {
    const controller = new AbortController(); let calls = 0, dispatched;
    const started = new Promise(resolve => { dispatched = resolve; });
    const options = { root, packet: await packet(), policy, binding: null, key: "secret", fetchImpl: async (_url, { signal }) => {
      calls++; dispatched(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } };
    const pending = observeJev({ ...options, signal: controller.signal });
    await started; controller.abort(new Error("operator stopped")); await assert.rejects(pending, /operator stopped/);
    assert.equal(JSON.parse(await readFile(path.join(root, "jev-observation.json"))).state, "dispatched");
    await assert.rejects(observeJev(options), error => error.code === "judge_outcome_unknown"); assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid policy and refused admission never dispatch HTTP", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "jev-admission-"));
  try {
    const root = path.join(parent, "new"); let calls = 0;
    const options = { root, packet: await packet(), policy, binding: null, key: "secret", fetchImpl: async () => { calls++; return response(); } };
    await assert.rejects(observeJev({ ...options, policy: { ...policy, provider: "wrong" } }), error => error.code === "coverage_policy_invalid");
    await assert.rejects(access(root), error => error.code === "ENOENT");
    await assert.rejects(observeJev({ ...options, admit: async () => { throw new Error("generation revoked"); } }), /generation revoked/);
    assert.equal(calls, 0); await assert.rejects(access(path.join(root, "jev-observation.json")), error => error.code === "ENOENT");
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("cancellation interrupts waiting for an existing observation writer lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-locked-cancellation-"));
  let release;
  try {
    let acquired; const locked = new Promise(resolve => { acquired = resolve; });
    const writer = withRunnerLock(path.join(root, "jev-observation.json"), async () => { acquired(); await new Promise(resolve => { release = resolve; }); });
    await locked;
    const controller = new AbortController(); let calls = 0;
    const pending = observeJev({ root, packet: await packet(), policy, binding: null, key: "secret", signal: controller.signal, fetchImpl: async () => { calls++; return response(); } });
    const settled = pending.then(() => "completed", error => error.name);
    controller.abort();
    assert.equal(await Promise.race([settled, delay(500).then(() => "still waiting for writer")]), "AbortError");
    assert.equal(calls, 0); release(); await writer;
  } finally { release?.(); await rm(root, { recursive: true, force: true }); }
});
