import test from "node:test";
import assert from "node:assert/strict";
import { promptJudgeWithCapacity } from "../lib/judge-capacity.mjs";
import { judgeTurnText } from "../lib/runner.mjs";

function overload(operationId, turnId = "turn-1", sessionId = "session-1", providerError = { codexErrorInfo: "serverOverloaded" }) {
  return Object.assign(new Error("Codex overloaded"), { code: "turn_interrupted", details: {
    operation_id: operationId, provider_session_id: sessionId, turn_id: turnId, native_turn_id: turnId, terminal_status: "failed", provider_error: providerError
  } });
}

function harness({ outcomes, inspect = call => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [call.capacity.operation_id] } }), admit = () => {}, pauses = [5_000, 15_000], deadline = null } = {}) {
  let time = 0;
  const calls = [];
  const input = { codex: true, sessionId: "session-1", packetFiles: ["/packet.json"], originalPrompt: "original prompt", pauses, deadline,
    clock: () => time, wait: async ms => { time += ms; }, admit,
    inspect: async () => inspect(calls.at(-1)),
    dispatch: async (prompt, capacity) => {
      calls.push({ prompt, capacity });
      const outcome = outcomes[calls.length - 1];
      if (outcome === "overload") throw overload(capacity.operation_id, `turn-${calls.length}`);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    } };
  return { calls, input, time: () => time };
}

test("Judge continues only the same Session with bounded fresh operations", async () => {
  const fixture = harness({ outcomes: ["overload", "overload", { assistant_text: "{}" }], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }) });
  const backoffs = [];
  fixture.input.onBackoff = event => { backoffs.push(event); };
  assert.deepEqual(await promptJudgeWithCapacity(fixture.input), { assistant_text: "{}" });
  assert.equal(fixture.calls.length, 3);
  assert.equal(fixture.calls[0].prompt, "original prompt");
  assert.match(fixture.calls[1].prompt, /\/packet\.json/);
  assert.deepEqual(fixture.calls.map(call => call.capacity.ordinal), [0, 1, 2]);
  assert.equal(new Set(fixture.calls.map(call => call.capacity.operation_id)).size, 3);
  assert.ok(fixture.calls.every(call => call.capacity.root_operation_id === fixture.calls[0].capacity.operation_id));
  assert.deepEqual(backoffs.map(event => [event.continuation, event.wait_ms, event.predecessor_turn_id]), [[1, 5_000, "turn-1"], [2, 15_000, "turn-2"]]);
  assert.equal(fixture.time(), 20_000);
});

test("Judge preserves the overload chain after three failed turns", async () => {
  const fixture = harness({ outcomes: ["overload", "overload", "overload"], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }) });
  await assert.rejects(promptJudgeWithCapacity(fixture.input), error => error.code === "turn_interrupted" && error.details.capacity_continuation.attempts === 3 && error.details.capacity_continuation.stop_reason === "attempts_exhausted");
  assert.equal(fixture.calls.length, 3);
});

test("quota after overload is terminal, and invalid native identity never retries", async () => {
  const quota = Object.assign(new Error("quota"), { code: "provider_quota_exhausted" });
  const fixture = harness({ outcomes: ["overload", quota], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }) });
  await assert.rejects(promptJudgeWithCapacity(fixture.input), error => error === quota && error.details.capacity_continuation.attempts === 2);
  assert.equal(fixture.calls.length, 2);
  const foreign = harness({ outcomes: [overload("op", "turn", "foreign"), { assistant_text: "{}" }] });
  await assert.rejects(promptJudgeWithCapacity(foreign.input), { code: "turn_interrupted" });
  assert.equal(foreign.calls.length, 1);
});

test("Judge refuses unproven settlement and excessive Retry-After", async () => {
  const unsettled = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: () => ({ provider_session_id: "session-1", settled: false }) });
  await assert.rejects(promptJudgeWithCapacity(unsettled.input), { code: "judge_capacity_settlement_unproven" });
  assert.equal(unsettled.calls.length, 1);
  const tooLate = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }) });
  tooLate.input.dispatch = async (prompt, capacity) => { tooLate.calls.push({ prompt, capacity }); throw overload(capacity.operation_id, "turn-1", "session-1", { codexErrorInfo: "serverOverloaded", retryAfter: 31 }); };
  await assert.rejects(promptJudgeWithCapacity(tooLate.input), { code: "retry_after_exceeds_budget" });
  assert.equal(tooLate.calls.length, 1);
  const budget = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: () => ({ provider_session_id: "session-1", settled: true, settlement: { state: "not_required" } }) });
  budget.input.requireSettlement = true;
  await assert.rejects(promptJudgeWithCapacity(budget.input), { code: "judge_capacity_settlement_unproven" });
  assert.equal(budget.calls.length, 1);
});

test("Judge binds settlement to its own dispatch when native error omits operation ID", async () => {
  const native = overload("unused");
  delete native.details.operation_id;
  const fixture = harness({ outcomes: [native, { assistant_text: "{}" }] });
  fixture.input.requireSettlement = true;
  assert.deepEqual(await promptJudgeWithCapacity(fixture.input), { assistant_text: "{}" });
  assert.equal(fixture.calls.length, 2);
  const foreign = harness({ outcomes: [overload("foreign-operation"), { assistant_text: "{}" }] });
  foreign.input.requireSettlement = true;
  await assert.rejects(promptJudgeWithCapacity(foreign.input), { code: "judge_capacity_settlement_unproven" });
  assert.equal(foreign.calls.length, 1);
});

test("structured Retry-After can extend but not reset the bounded backoff", async () => {
  const fixture = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }) });
  fixture.input.dispatch = async (prompt, capacity) => {
    fixture.calls.push({ prompt, capacity });
    if (fixture.calls.length === 1) throw overload(capacity.operation_id, "turn-1", "session-1", { codexErrorInfo: "serverOverloaded", retryAfter: 7 });
    return { assistant_text: "{}" };
  };
  await promptJudgeWithCapacity(fixture.input);
  assert.equal(fixture.time(), 7_000);
});

test("admission during delay and an expired deadline prevent the next turn", async () => {
  let admitted = 0;
  const cancelled = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }), admit: () => { if (++admitted > 3) throw Object.assign(new Error("cancelled"), { code: "runtime_scope_stopped" }); } });
  await assert.rejects(promptJudgeWithCapacity(cancelled.input), { code: "runtime_scope_stopped" });
  assert.equal(cancelled.calls.length, 1);
  const expired = harness({ outcomes: ["overload", { assistant_text: "{}" }], inspect: last => ({ provider_session_id: "session-1", settled: true, settlement: { state: "settled", operation_ids: [last.capacity.operation_id] } }), deadline: 4_000 });
  await assert.rejects(promptJudgeWithCapacity(expired.input), { code: "retry_after_exceeds_budget" });
  assert.equal(expired.calls.length, 1);
});

test("Judge rejects stale history or a failed current Turn as output", () => {
  const profile = { harness: "codex-desktop" };
  assert.equal(judgeTurnText({ turn_id: "new", turn: { id: "new", status: "completed" }, assistant_text: "new JSON" }, profile), "new JSON");
  assert.throws(() => judgeTurnText({ turn_id: "new", turn: { id: "old", status: "completed" }, assistant_text: "stale JSON" }, profile), { code: "judge_turn_identity_invalid" });
  assert.throws(() => judgeTurnText({ turn_id: "new", turn: { id: "new", status: "failed" }, assistant_text: "partial JSON" }, profile), { code: "judge_turn_identity_invalid" });
});
