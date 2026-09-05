import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { withRunnerLock } from "../lib/runner-lock.mjs";
import { recordOperation, completeOperation, readEvents, reduceEvents } from "../lib/runner-events.mjs";
import { commandJson } from "../lib/process-json.mjs";
import { waitForSettlement } from "../lib/session-settlement.mjs";
import { durableDaemonDispatch, inspectDaemonOperation } from "../lib/daemon-operations.mjs";
import { recoverDriverReply, reconcileDriverReplies, assertDaemonReplaceable } from "../lib/driver-recovery.mjs";
import { operationContext } from "../lib/operation-context.mjs";

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
