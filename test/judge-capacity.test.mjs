import test from "node:test";
import assert from "node:assert/strict";
import { promptJudgeWithCapacity, retryAfterMs } from "../lib/judge-capacity.mjs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    dispatch: async (prompt, capacity, authorizeDispatch) => {
      await authorizeDispatch();
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
  tooLate.input.dispatch = async (prompt, capacity, authorizeDispatch) => { await authorizeDispatch(); tooLate.calls.push({ prompt, capacity }); throw overload(capacity.operation_id, "turn-1", "session-1", { codexErrorInfo: "serverOverloaded", retryAfter: 31 }); };
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
  fixture.input.dispatch = async (prompt, capacity, authorizeDispatch) => {
    await authorizeDispatch();
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

test('Retry-After accepts capitalized headers, dates and bounded 0/30/>30 seconds', async () => {
  assert.equal(retryAfterMs({ headers: { 'Retry-After': '30' } }, () => 0), 30000);
  assert.equal(retryAfterMs({ headers: { 'Retry-After': ' 30 ' } }, () => 0), 30000);
  assert.equal(retryAfterMs({ headers: { 'RETRY-AFTER': 'Thu, 01 Jan 1970 00:00:30 GMT' } }, () => 0), 30000);
  assert.equal(retryAfterMs({ headers: { 'Retry-After': 'Thu, 01 Jan 1970 00:00:00 GMT' } }, () => 1), 0);
  assert.equal(retryAfterMs({ headers: { 'Retry-After': 'invalid' } }), 0);
  for (const seconds of [0, 30, 31]) {
    const fixture = harness({ outcomes: ['overload', {}] });
    fixture.input.dispatch = async (prompt, capacity, authorizeDispatch) => {
      await authorizeDispatch();
      fixture.calls.push({ prompt, capacity });
      if (!capacity.ordinal) throw overload(capacity.operation_id, 'turn-1', 'session-1', { codexErrorInfo: 'serverOverloaded', headers: { 'Retry-After': String(seconds) } });
      return {};
    };
    if (seconds > 30) { await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'retry_after_exceeds_budget' }); assert.equal(fixture.calls.length, 1); }
    else { await promptJudgeWithCapacity(fixture.input); assert.equal(fixture.time(), Math.max(5000, seconds * 1000)); }
  }
});

test('Judge re-inspects immediately after backoff and post-permit before dispatch', async () => {
  for (const during of ['backoff', 'permit']) {
    let active = false;
    const fixture = harness({ outcomes: ['overload', {}], inspect: call => ({ provider_session_id: 'session-1', settled: !active, settlement: { state: 'settled', operation_ids: [call.capacity.operation_id] } }) });
    if (during === 'backoff') { const wait = fixture.input.wait; fixture.input.wait = async ms => { await wait(ms); active = true; }; }
    else {
      const dispatch = fixture.input.dispatch;
      fixture.input.dispatch = async (prompt, capacity, beforeDispatch) => { if (capacity.ordinal) { active = true; await beforeDispatch(); } return dispatch(prompt, capacity, beforeDispatch); };
    }
    await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'judge_capacity_settlement_unproven' });
    assert.equal(fixture.calls.length, 1);
  }
});

test('durable Judge chain caches results, rejects changed identity, and never replays unknown dispatch', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'judge-capacity-chain-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = harness({ outcomes: ['overload', { assistant_text: '{}' }] });
  fixture.input.inspect = async () => ({ provider_session_id: 'session-1', settled: true, settlement: { state: 'settled', operation_ids: fixture.calls.map(call => call.capacity.operation_id) } });
  fixture.input.stateFile = path.join(dir, 'state.json');
  await promptJudgeWithCapacity(fixture.input);
  const saved = JSON.parse(await readFile(fixture.input.stateFile, 'utf8'));
  assert.deepEqual(saved.turns.map(turn => turn.ordinal), [0, 1]);
  assert.equal(saved.turns[1].predecessor_turn_id, 'turn-1');
  assert.deepEqual(await promptJudgeWithCapacity(fixture.input), { assistant_text: '{}' });
  assert.equal(fixture.calls.length, 2);
  await assert.rejects(promptJudgeWithCapacity({ ...fixture.input, originalPrompt: 'different' }), { code: 'capacity_chain_conflict' });
  saved.turns[1].state = 'dispatched'; delete saved.turns[1].result;
  await writeFile(fixture.input.stateFile, JSON.stringify(saved));
  await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'operation_observation_lost' });
  assert.equal(fixture.calls.length, 2);
  let recovered;
  fixture.input.recover = async operation => { recovered = operation; return { assistant_text: 'recovered' }; };
  assert.deepEqual(await promptJudgeWithCapacity(fixture.input), { assistant_text: 'recovered' });
  assert.equal(recovered, saved.turns[1].operation_id);
  assert.equal(fixture.calls.length, 2);
  const valid = JSON.parse(await readFile(fixture.input.stateFile, 'utf8'));
  for (const corrupt of [
    { ...valid, turns: [...valid.turns, { ...valid.turns[1], ordinal: 2 }, { ...valid.turns[1], ordinal: 3, state: 'prepared' }] },
    { ...valid, turns: valid.turns.map((turn, index) => index ? { ...turn, operation_id: 'foreign' } : turn) },
    { ...valid, turns: valid.turns.map((turn, index) => index ? turn : { ...turn, ordinal: 9 }) },
    { ...valid, turns: [null] }
  ]) {
    await writeFile(fixture.input.stateFile, JSON.stringify(corrupt));
    await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'capacity_chain_conflict' });
  }
});

test('unknown dispatched continuation is reconciled while its native turn is still active, not replayed', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'judge-capacity-active-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = harness({ outcomes: ['overload', {}] });
  fixture.input.stateFile = path.join(dir, 'state.json');
  fixture.input.inspect = async () => ({ provider_session_id: 'session-1', settled: true, settlement: { state: 'settled', operation_ids: fixture.calls.map(call => call.capacity.operation_id) } });
  await promptJudgeWithCapacity(fixture.input);
  const saved = JSON.parse(await readFile(fixture.input.stateFile, 'utf8'));
  saved.turns.at(-1).state = 'dispatched'; delete saved.turns.at(-1).result;
  await writeFile(fixture.input.stateFile, JSON.stringify(saved));
  fixture.input.inspect = async () => ({ provider_session_id: 'session-1', settled: false, settlement: { state: 'pending' } });
  fixture.input.recover = async operationId => { assert.equal(operationId, saved.turns.at(-1).operation_id); return { recovered: true }; };
  assert.deepEqual(await promptJudgeWithCapacity(fixture.input), { recovered: true });
  assert.equal(fixture.calls.length, 2);
});

test('cancellation while queued for a permit retains prepared intent, not an unknown native dispatch', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'judge-capacity-permit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let cancelled = false;
  const fixture = harness({ outcomes: ['overload', {}], admit: () => { if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'runtime_scope_stopped' }); } });
  fixture.input.stateFile = path.join(dir, 'state.json');
  const dispatch = fixture.input.dispatch;
  fixture.input.dispatch = async (prompt, capacity, authorizeDispatch) => {
    if (capacity.ordinal) { cancelled = true; await authorizeDispatch(); }
    return dispatch(prompt, capacity, authorizeDispatch);
  };
  await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'runtime_scope_stopped' });
  const saved = JSON.parse(await readFile(fixture.input.stateFile, 'utf8'));
  assert.equal(saved.turns.at(-1).state, 'prepared');
  assert.equal(fixture.calls.length, 1);
});

test('reattachment preserves the original absolute deadline and prepared backoff', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'judge-capacity-deadline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = harness({ outcomes: ['overload', {}], deadline: 6000 });
  fixture.input.stateFile = path.join(directory, 'chain.json');
  fixture.input.onBackoff = () => { throw Object.assign(new Error('observer lost'), { code: 'operation_observation_lost' }); };
  await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'operation_observation_lost' });
  const retained = JSON.parse(await readFile(fixture.input.stateFile, 'utf8'));
  assert.equal(retained.deadline, 6000);
  assert.equal(retained.turns[1].not_before, 5000);
  assert.equal(retained.turns[1].state, 'prepared');
  fixture.input.deadline = 100000;
  fixture.input.clock = () => 6001;
  await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'definition_qualification_timeout' });
  assert.equal(fixture.calls.length, 1);
});

test('cancellation during post-permit native inspection prevents dispatch', async () => {
  let cancelled = false;
  let inspections = 0;
  const fixture = harness({ outcomes: ['overload', {}], admit: () => {
    if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'runtime_scope_stopped' });
  }, inspect: call => {
    // Settlement after the first overload, pre-dispatch, then post-permit.
    if (++inspections === 3) cancelled = true;
    return { provider_session_id: 'session-1', settled: true, settlement: { state: 'settled', operation_ids: [call.capacity.operation_id] } };
  } });
  await assert.rejects(promptJudgeWithCapacity(fixture.input), { code: 'runtime_scope_stopped' });
  assert.equal(fixture.calls.length, 1);
});
