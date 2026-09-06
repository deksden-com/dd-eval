import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, open, utimes, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { withRunnerLock } from "../lib/runner-lock.mjs";
import { recordOperation, completeOperation, readEvents, reduceEvents, writeJsonAtomic } from "../lib/runner-events.mjs";
import { commandJson } from "../lib/process-json.mjs";
import { waitForSettlement } from "../lib/session-settlement.mjs";
import { durableDaemonDispatch, inspectDaemonOperation } from "../lib/daemon-operations.mjs";
import { recoverDriverReply, reconcileDriverReplies, assertDaemonReplaceable } from "../lib/driver-recovery.mjs";
import { operationContext } from "../lib/operation-context.mjs";
import { recoveryHistory, assertTerminalReconciliation, selectRecoverySource, recoveryPrompt, prepareRecoveryDelivery, isInfrastructureFailure } from "../lib/runner.mjs";

test("atomic receipts flush file and directory and preserve the old receipt after a failed flush", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "receipt-flush-"));
  try {
    const file = path.join(root, "receipt.json"); await writeFile(file, '{"old":true}');
    const handle = await open(file, "r"); const prototype = Object.getPrototypeOf(handle); const sync = prototype.sync; await handle.close();
    let failFlush = true; const flushed = [];
    t.mock.method(prototype, "sync", async function () {
      const directory = (await this.stat()).isDirectory();
      flushed.push(directory ? "directory" : "file");
      if (failFlush && !directory) throw new Error("injected flush failure");
      return sync.call(this);
    });
    await assert.rejects(writeJsonAtomic(file, { next: true }), /injected flush failure/);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { old: true });
    assert.deepEqual(await readdir(root), ["receipt.json"]);
    failFlush = false; flushed.length = 0;
    await writeJsonAtomic(file, { next: true });
    assert.deepEqual(flushed, ["file", "directory"]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { next: true });
  } finally { t.mock.restoreAll(); await rm(root, { recursive: true, force: true }); }
});

test("recovery delivery pins exact prompt bytes and dispatch identity before use", async () => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), "recovery-delivery-"));
  try {
    const input = { attempt, recovery: { recovery_id: "RCV-1", run_id: "RUN-1", generation: 1, accept_command: "dd-flow run recovery accept RUN-1 --recovery-id RCV-1" }, stage: "code", sessionId: "native-root", harness: "codex-desktop" };
    const first = await prepareRecoveryDelivery(input);
    assert.equal(first.reused, false);
    assert.deepEqual(JSON.parse(await readFile(first.file, "utf8")), first.packet);
    const again = await prepareRecoveryDelivery(input);
    assert.equal(again.reused, true); assert.equal(again.sha256, first.sha256);
    assert.equal(again.packet.operation_id, first.packet.operation_id);
    await assert.rejects(prepareRecoveryDelivery({ ...input, sessionId: "different-root" }), { code: "recovery_delivery_conflict" });
    await assert.rejects(prepareRecoveryDelivery({ ...input, recovery: { ...input.recovery, accept_command: "changed command" } }), { code: "recovery_delivery_conflict" });
    assert.deepEqual(JSON.parse(await readFile(first.file, "utf8")), first.packet);
  } finally { await rm(attempt, { recursive: true, force: true }); }
});

test("recovery requires engine acceptance before productive work and preserves a paused Work", () => {
  assert.equal(isInfrastructureFailure("agy_terminal_result_missing"), true);
  const recovery = { recovery_id: "R2", generation: 2, accept_command: "dd-flow run recovery accept RUN-1 --recovery-id R2 --project-root /project --json" };
  const prompt = recoveryPrompt({ recovery, stage: "code" });
  assert.ok(prompt.indexOf(recovery.accept_command) < prompt.indexOf("Continue only the unresolved"));
  assert.match(prompt, /If acceptance fails, stop/);
  const paused = recoveryPrompt({ recovery, stage: "code", paused: true });
  assert.match(paused, /paused for a user answer/);
  assert.doesNotMatch(paused, /Continue only the unresolved/);
  assert.throws(() => recoveryPrompt({ recovery: { recovery_id: "R2" }, stage: "code" }), { code: "recovery_acceptance_missing" });
});

test("recovery selects exactly the requested current interruption, including idempotent repeats", () => {
  const failed = { execution: "e", state: "failed", recovery: { recovery_id: "R2" } };
  const other = { execution: "other", state: "failed", recovery: { recovery_id: "R3" } };
  assert.equal(selectRecoverySource([failed, other], null, "R2"), failed);
  assert.throws(() => selectRecoverySource([failed], "e", undefined), { code: "recovery_source_required" });
  for (const [execution, from] of [["e", "R1"], ["other", "R2"], [null, "unknown"]]) {
    assert.throws(() => selectRecoverySource([failed, other], execution, from), { code: "recovery_source_stale" });
  }
  assert.throws(() => selectRecoverySource([failed, { ...failed, execution: "duplicate" }], null, "R2"), { code: "recovery_source_stale" });
  assert.throws(() => selectRecoverySource([{ ...failed, state: "awaiting_provider" }], "e", "R2"), { code: "recovery_not_eligible" });
  const completed = { ...failed, state: "candidate_ready", recovery: { recovery_id: "R2", resumed_at: "2026-09-06T21:00:00Z" } };
  assert.equal(selectRecoverySource([completed], "e", "R2"), completed);
});

test("terminal reconciliation rejects every productive continuation state", () => {
  const execution = { id: "e", terminal_stage: "MERGE" };
  for (const status of ["running", "paused", "failed", undefined]) {
    assert.throws(() => assertTerminalReconciliation(execution, "MERGE", { status }), { code: "reconcile_not_terminal" });
  }
  assert.throws(() => assertTerminalReconciliation(execution, "CODE", { status: "done" }), { code: "reconcile_not_terminal" });
  assert.throws(() => assertTerminalReconciliation(execution, "MERGE", null), { code: "reconcile_not_terminal" });
  assert.doesNotThrow(() => assertTerminalReconciliation(execution, "MERGE", { status: "done" }));
});

test("recovery report preserves failed segments without counting capture or cumulative usage twice", () => {
  const events = [];
  const emit = (type, data, seconds) => events.push({ id: `event-${events.length}`, executionid: "e", type: `dev.dd.eval.${type}`, time: new Date(seconds * 1000).toISOString(), data });
  const launch = "EVAL:e:launch", first = `${launch}:recover:R1`, second = `${launch}:recover:R2`;
  for (const [operation_id, start, terminal] of [[launch, 0, "failed"], [first, 20, "failed"], [second, 40, "completed"]]) {
    emit("operation.started", { operation_id }, start);
    emit(`operation.${terminal}`, { operation_id, ...(terminal === "failed" ? { error: { code: "quota" } } : { result: { state: "candidate_ready" } }) }, start + 10);
    if (terminal === "failed") {
      const data = { code: "quota", ...(operation_id === first ? { recovery_parent_id: "R1" } : {}) };
      emit("execution.failed", data, start + 10);
      emit("execution.failed", { ...data, recovery: { recovery_id: operation_id === launch ? "R1" : "R2" } }, start + 11);
    }
  }
  const manifest = { run_id: "EVAL", executions: [{ id: "e" }] };
  const statistics = { collected_at: "latest", usage: { totals: { total_tokens: 120 }, coverage: { measured: 3 } } };
  const [report] = recoveryHistory(events, manifest, [{ execution: "e", state: "candidate_ready", statistics }]);
  assert.equal(report.reliability, "recovered");
  assert.equal(report.recovery_count, 2);
  assert.equal(report.interruptions.length, 2);
  assert.deepEqual(report.interruptions.map(item => item.receipt_ids.length), [2, 2]);
  assert.deepEqual(report.segments.map(item => item.outcome), ["failed", "failed", "completed"]);
  assert.deepEqual(report.segments.map(item => item.wall_clock_ms), [10000, 10000, 10000]);
  assert.deepEqual(report.usage_accounting.usage, statistics.usage);
  assert.equal(report.timing.active_ms, null);
  assert.equal(recoveryHistory(events, manifest, [{ execution: "e", state: "failed" }])[0].reliability, "interrupted");
  const pending = events.slice(0, -1);
  assert.equal(recoveryHistory(pending, manifest, [{ execution: "e", state: "awaiting_provider" }])[0].segments.at(-1).outcome, "unknown");
  assert.equal(recoveryHistory([], manifest, [{ execution: "e", state: "candidate_ready" }])[0].reliability, "uninterrupted");
});

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("stop waits for cancellation settlement, discovering new children without duplicate cancel", async () => {
  let observations = 0; const cancelled = [];
  await waitForSettlement({
    observe: async () => { observations++; return { active: observations < 4, sessions: observations < 2 ? ["root"] : observations < 4 ? ["child", "root"] : [] }; },
    cancel: async id => { cancelled.push(id); }, timeoutMs: 1000
  });
  assert.deepEqual(cancelled, ["root", "child"]); assert.equal(observations, 4);
});

test("unsettled stop fails rather than reporting clean or cancelling without authorization", async () => {
  await assert.rejects(waitForSettlement({ observe: async () => ({ sessions: ["root"], active: true }) }), { code: "tree_not_settled" });
  await assert.rejects(waitForSettlement({ observe: async () => ({ sessions: [], active: true }), cancel: async () => {}, timeoutMs: 10 }), { code: "tree_not_settled" });
});

test("daemon saves the terminal response before returning and never redispatches the same id", async t => {
  const root = await temporary(t); let calls = 0;
  const request = { id: "prompt-1", operation: "session.prompt", params: { sessionId: "native", prompt: "hello" } };
  assert.deepEqual(await durableDaemonDispatch(root, request, async () => { calls++; return { text: "done" }; }), { text: "done" });
  assert.equal((await inspectDaemonOperation(root, request.id)).state, "completed");
  assert.deepEqual(await durableDaemonDispatch(root, request, () => assert.fail("duplicate Turn")), { text: "done" });
  await assert.rejects(durableDaemonDispatch(root, { ...request, params: { prompt: "changed" } }, () => assert.fail("mismatched Turn")), { code: "operation_conflict" });
  assert.equal(calls, 1);
});

test("disconnecting the observer does not discard a daemon's late result", async t => {
  const root = await temporary(t); const request = { id: "prompt-2", operation: "session.prompt", params: {} };
  let finish; let started;
  const entered = new Promise(resolve => { started = resolve; });
  const pending = durableDaemonDispatch(root, request, () => { started(); return new Promise(resolve => { finish = resolve; }); });
  await entered;
  await assert.rejects(durableDaemonDispatch(root, request, () => assert.fail("second request")), { code: "operation_observation_lost" });
  finish({ text: "late" }); await pending;
  assert.deepEqual((await inspectDaemonOperation(root, request.id)).result, { text: "late" });
});

test("concurrent duplicate requests never read partial JSON or dispatch twice", async t => {
  const root = await temporary(t); let calls = 0;
  const request = { id: "race", operation: "session.prompt", params: { sessionId: "native" } };
  const results = await Promise.allSettled(Array.from({ length: 30 }, () => durableDaemonDispatch(root, request, async () => { calls++; return { text: "done" }; })));
  assert.equal(calls, 1);
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "operation_observation_lost");
  assert.equal((await inspectDaemonOperation(root, "race")).session_id, "native");
});

test("recovery consumes a late reply and unblocks the next request without replay", async t => {
  const root = await temporary(t), request = { id: "late", operation: "session.prompt", params: {} };
  await mkdir(path.join(root, "client-operations"));
  await writeFile(path.join(root, "client-operations", "late.json"), JSON.stringify({ operation_id: "late", state: "requested" }));
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = durableDaemonDispatch(root, request, () => { entered(); return new Promise(resolve => { finish = resolve; }); });
  await started;
  await assert.rejects(reconcileDriverReplies(root), { code: "operation_observation_lost" });
  const recovered = recoverDriverReply(root, "late", { timeoutMs: 1000, pollMs: 5 });
  finish({ text: "late" }); await pending;
  assert.deepEqual(await recovered, { text: "late" });
  await reconcileDriverReplies(root);
  await reconcileDriverReplies(root);
});

test("unknown dispatch remains blocked after a runner crash", async t => {
  const root = await temporary(t);
  await mkdir(path.join(root, "client-operations"));
  await writeFile(path.join(root, "client-operations", "unknown.json"), JSON.stringify({ operation_id: "unknown" }));
  await assert.rejects(reconcileDriverReplies(root), { code: "operation_observation_lost" });
  await assert.rejects(recoverDriverReply(root, "unknown", { timeoutMs: 5, pollMs: 1 }), { code: "operation_observation_lost" });
});

test("a live original daemon cannot be replaced merely because its socket failed", async t => {
  const root = await temporary(t);
  await writeFile(path.join(root, "daemon.json"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(assertDaemonReplaceable(root), { code: "operation_observation_lost" });
  await writeFile(path.join(root, "daemon.json"), JSON.stringify({ pid: 2147483647 }));
  await assertDaemonReplaceable(root);
});

test("parallel runner operations preserve their own parent ids", async t => {
  const eventsFile = path.join(await temporary(t), "events.jsonl");
  await Promise.all(["a", "b"].map(operationId => recordOperation({ eventsFile, source: "test", runId: "run", executionId: operationId, operationId, operation: "test", action: async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(operationContext.getStore().operationId, operationId);
    return operationId;
  } })));
  assert.equal(operationContext.getStore(), undefined);
});

test("host-aged locks never evict a live owner, and action errors are not acquisition errors", async t => {
  const file = path.join(await temporary(t), "events");
  await withRunnerLock(file, async () => {
    await utimes(`${file}.lock`, new Date(0), new Date(0));
    await assert.rejects(withRunnerLock(file, () => assert.fail("stole live lock"), { timeoutMs: 20 }), { code: "runner_lock_timeout" });
    assert.equal((await readdir(`${file}.lock`)).length, 1);
  });
  const original = Object.assign(new Error("action EEXIST"), { code: "EEXIST" });
  await assert.rejects(withRunnerLock(file, () => { throw original; }), error => error === original);
  assert.equal(await withRunnerLock(file, () => 42), 42);
});

test("a proven dead lock owner can be reclaimed without time-based eviction", async t => {
  const file = path.join(await temporary(t), "events");
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  const pid = Number(child.stdout);
  assert.ok(pid > 0);
  await mkdir(`${file}.lock`);
  await writeFile(path.join(`${file}.lock`, "owner-dead.json"), JSON.stringify({ pid }));
  assert.equal(await withRunnerLock(file, () => "recovered"), "recovered");
});

for (const code of ["operation_observation_lost", "daemon_connection_closed", "rpc_timeout", "daemon_timeout", "turn_timeout"]) {
  test(`${code} preserves an uncertain operation and accepts its late result exactly once`, async t => {
    const eventsFile = path.join(await temporary(t), "events.jsonl");
    const input = { eventsFile, source: "test", runId: "EVAL-test", executionId: "e2e", traceId: "test", operationId: "prompt", operation: "driver.prompt" };
    const error = Object.assign(new Error("observation gap"), { code, details: { last_activity_at: "2026-09-05T00:00:00Z" }, cause: Object.assign(new Error("socket closed"), { code: "socket_closed" }) });
    await assert.rejects(recordOperation({ ...input, action: () => { throw error; } }), { code });
    const state = reduceEvents(await readEvents(eventsFile)).operations.prompt;
    assert.equal(state.terminal, null);
    assert.deepEqual(state.observation_lost.details, error.details);
    assert.equal(state.observation_lost.cause.code, "socket_closed");
    await assert.rejects(recordOperation({ ...input, action: () => assert.fail("replayed") }), { code: "operation_observation_lost" });
    await completeOperation({ ...input, result: { answer: "late" } });
    const replay = await recordOperation({ ...input, action: () => assert.fail("replayed late terminal") });
    assert.equal(replay.result.answer, "late");
  });
}

test("subprocess structured errors retain details, retryability and provider cause", async t => {
  const root = await temporary(t);
  const script = path.join(root, "failure.mjs");
  const record = { code: "operation_observation_lost", message: "uncertain", retryable: false, details: { operation_id: "op-1" }, cause: { code: "socket_closed", message: "closed" } };
  await writeFile(script, `console.error(JSON.stringify(${JSON.stringify({ error: record })})); process.exitCode = 1;`);
  await assert.rejects(commandJson(script, []), error => {
    assert.equal(error.code, record.code); assert.equal(error.retryable, false);
    assert.deepEqual(error.details, record.details); assert.deepEqual(error.cause, record.cause); return true;
  });
});
