import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, open, utimes, readdir, rm, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { withRunnerLock } from "../lib/runner-lock.mjs";
import { appendEvent, recordOperation, completeOperation, readEvents, reduceEvents, writeJsonAtomic, sha256 } from "../lib/runner-events.mjs";
import { requestRunnerContinuation } from "../lib/eval-resume-worker.mjs";
import { setTimeout as delay } from "node:timers/promises";

test("public cleanup retry retains an exhausted attempt and a new identity runs cleanup only", { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-cleanup-worker-"));
  try {
    const manifest = { run_id: "EVAL-test", executions: [{ id: "e" }], profile: { judge: { enabled: true } } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    for (const type of ["started", "failed"]) await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: manifest.run_id, executionId: "e", type: `dev.dd.eval.operation.${type}`, data: { operation_id: "EVAL-test:e:launch", error: { code: "preflight_failed", message: "before session" } } });
    const file = path.join(root, "runner-attempts", sha256("spent"), "attempt.json");
    await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent: { eval_root: root, run_id: manifest.run_id, request_id: "spent", kind: "cleanup", manifest_sha256: sha256(await readFile(path.join(root, "manifest.json"))) }, status: "recovery_blocked", recovery_observation: { remaining_ms: 0 } });
    assert.equal((await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId: "spent" })).continuation.status, "recovery_blocked");
    assert.equal(JSON.parse(await readFile(file)).recovery_observation.remaining_ms, 0);
    const fresh = await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId: "fresh" });
    let saved;
    const deadline = performance.now() + 10000;
    do {
      saved = JSON.parse(await readFile(fresh.continuation.file));
      if (saved.status === "failed") assert.fail(JSON.stringify(saved.error));
      if (performance.now() > deadline) assert.fail("cleanup owner did not exit");
      await delay(50);
    } while (saved.status !== "completed" || (await processSnapshot()).some(item => item.pid === saved.owner_pid && !item.zombie));
    assert.equal(saved.result.judge_status, "not_run_cleanup_only");
    assert.equal((await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId: "fresh" })).continuation.status, "completed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
import { commandJson } from "../lib/process-json.mjs";
import { recoverDriverReply, reconcileDriverReplies, assertDaemonReplaceable } from "../lib/driver-recovery.mjs";
import { operationContext } from "../lib/operation-context.mjs";
import { migrateLegacyCanonicalResumeLock, runnerResume, runnerCleanup } from "../lib/runner.mjs";
import { processSnapshot } from "../lib/process-snapshot.mjs";
import { recoveryObservationBudget, withRecoveryObservation } from "../lib/recovery-observation-budget.mjs";

test("cleanup leaves queued executions and Judge undispatched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-cleanup-only-"));
  try {
    const manifest = { run_id: "EVAL-test", executions: [{ id: "e" }, { id: "queued" }], profile: { judge: { enabled: true, profile_id: "must-not-run" } } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    for (const type of ["started", "failed"]) await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: manifest.run_id, executionId: "e", type: `dev.dd.eval.operation.${type}`, data: { operation_id: "EVAL-test:e:launch", error: { code: "preflight_failed", message: "before session" } } });
    const result = await runnerCleanup({ evalRoot: root, requestId: "cleanup-1" });
    assert.equal(result.execution_state, "failed");
    assert.equal(result.judge_status, "not_run_cleanup_only");
    const events = await readEvents(path.join(root, "events.jsonl"));
    assert.equal(events.filter(event => event.type === "dev.dd.eval.operation.started").length, 1);
    await assert.rejects(readFile(path.join(root, "candidate.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cleanup RPC is bounded while productive calls do not inherit its timeout", async () => {
  const budget = recoveryObservationBudget({ recovery_observation: { remaining_ms: 30 } });
  await assert.rejects(withRecoveryObservation(budget, () => commandJson(process.execPath, ["-e", "setTimeout(()=>{}, 10000)", "--"])), { name: "AbortError" });
  assert.deepEqual(await commandJson(process.execPath, ["-e", "console.log('{}')", "--"]), {});
  const backoff = recoveryObservationBudget(null);
  assert.deepEqual([backoff.nextDelay(),backoff.nextDelay(),backoff.nextDelay(),backoff.nextDelay()], [1000,2000,5000,10000]);
});

for (const enabled of [false, true]) test(`resume finalizes a pre-session failure without replay (Judge enabled: ${enabled})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-failed-resume-"));
  try {
    const manifest = { run_id: "EVAL-test", case_id: "sdlc-eval-2026-summer-task-priority", executions: [{ id: "e", stage: "specify", terminal_stage: "merge", mode: "e2e" }], subject_profile: {}, profile: { judge: { enabled, profile_id: "nonexistent-review-test-profile" } } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    for (const type of ["started", "failed"]) await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: manifest.run_id, executionId: "e", type: `dev.dd.eval.operation.${type}`, data: { operation_id: "EVAL-test:e:launch", error: { code: "preflight_failed", message: "before session" } } });
    const first = await runnerResume({ evalRoot: root });
    assert.equal(first.state, "completed_with_failures");
    assert.equal(first.execution_state, "failed");
    assert.equal(first.cleanup_state, "settled");
    assert.equal(first.judge_status, enabled ? "failed" : "not_requested");
    if (enabled) assert.equal(JSON.parse(await readFile(path.join(root, "reports/report.json"), "utf8")).judge_status, "failed");
    const before = await readEvents(path.join(root, "events.jsonl"));
    const second = await runnerResume({ evalRoot: root });
    assert.equal(second.candidate.immutable_hash, first.candidate.immutable_hash);
    assert.equal((await readEvents(path.join(root, "events.jsonl"))).length, before.length);
    assert.equal(second.executions[0].code, "preflight_failed");
    await runnerCleanup({ evalRoot: root, requestId: "already-clean" });
    const retained = JSON.parse(await readFile(path.join(root, "reports", "report.json")));
    assert.equal(retained.candidate.immutable_hash, first.candidate.immutable_hash);
    assert.equal(retained.judge_status, first.judge_status);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed execution waits for delayed capture, clears pending evidence, and freezes once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-late-capture-"));
  try {
    const attempt = path.join(root, "executions/e"), runtime = path.join(attempt, "dd-flow-home"), project = path.join(attempt, "project");
    await mkdir(path.join(runtime, "bin"), { recursive: true }); await mkdir(project);
    const statusFile = path.join(root, "control.json"), bin = path.join(runtime, "bin/dd-flow");
    await writeFile(bin, `#!/usr/bin/env node\nconsole.log(require('node:fs').readFileSync(${JSON.stringify(statusFile)},'utf8'))\n`); await chmod(bin, 0o700);
    await writeJsonAtomic(statusFile, { ok: true, settled: false });
    await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", project_root: project, runtime_root: runtime, run_id: "RUN-test" });
    const manifest = { run_id: "EVAL-test", runtime_resource_home: path.join(root, "resources"), case_id: "sdlc-eval-2026-summer-task-priority", executions: [{ id: "e", stage: "specify", terminal_stage: "merge", mode: "e2e" }], subject_profile: {}, profile: { judge: { enabled: false } } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    for (const type of ["started", "failed"]) await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: manifest.run_id, executionId: "e", type: `dev.dd.eval.operation.${type}`, data: { operation_id: "EVAL-test:e:launch", error: { code: "unexpected_hitl", message: "second question" } } });
    const pending = await runnerResume({ evalRoot: root });
    assert.equal(pending.state, "awaiting_provider");
    assert.equal(pending.execution_state, "failed");
    assert.equal(pending.cleanup_state, "pending");
    const capture = path.join(root, "capture"); await mkdir(capture); await writeJsonAtomic(path.join(capture, "snapshot.json"), { consistency: "sealed" });
    await writeJsonAtomic(statusFile, { ok: true, settled: true, control: { current: true, admission: "sealed", capture_path: capture, recovery_id: "REC-test", control_id: "CTRL-test" } });
    const final = await runnerResume({ evalRoot: root });
    assert.equal(final.state, "completed_with_failures");
    assert.equal(final.executions[0].incomplete_evidence, null);
    assert.equal(final.executions[0].code, "unexpected_hitl");
    assert.equal(final.executions[0].recovery.recovery_id, "REC-test");
    const count = (await readEvents(path.join(root, "events.jsonl"))).length;
    assert.equal((await runnerResume({ evalRoot: root })).candidate.immutable_hash, final.candidate.immutable_hash);
    assert.equal((await readEvents(path.join(root, "events.jsonl"))).length, count);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("canonical legacy lock migration reclaims only a proven dead owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "canonical-lock-migration-"));
  const file = path.join(root, "build", "canonical-resume.lock");
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ pid: 999_999, started_at: "never" }));
    await migrateLegacyCanonicalResumeLock(root);
    await assert.rejects(readFile(file), { code: "ENOENT" });

    await writeFile(file, "{");
    await assert.rejects(migrateLegacyCanonicalResumeLock(root), { code: "canonical_resume_active" });

    const self = (await processSnapshot()).find(item => item.pid === process.pid);
    assert.ok(self && !self.zombie);
    await writeFile(file, JSON.stringify({ pid: process.pid, started_at: self.started }));
    await assert.rejects(migrateLegacyCanonicalResumeLock(root), { code: "canonical_resume_active" });
    await writeFile(file, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
    await assert.rejects(migrateLegacyCanonicalResumeLock(root), { code: "canonical_resume_active" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery observer budget carries remaining observed time across replacement", () => {
  let time = 0;
  const first = recoveryObservationBudget(null, () => time);
  time += 20;
  assert.equal(first.exhausted(), false);
  const replacement = recoveryObservationBudget({ recovery_observation: first.state() }, () => time);
  time += 60_000;
  assert.equal(replacement.exhausted(), false);
  time += 60_000;
  assert.equal(replacement.exhausted(), true);
});

test("productive evaluation time does not spend the cleanup observation budget", () => {
  let time = 0;
  const budget = recoveryObservationBudget(null, () => time);
  for (let i = 0; i < 20; i++) {
    time += 30_000;
    assert.equal(budget.exhausted(false), false);
  }
  assert.equal(budget.state().remaining_ms, 120_000);
  time += 30_000;
  budget.exhausted();
  assert.equal(budget.state().remaining_ms, 90_000);
});
import { appendRunEventOnce, runResultRevision, recoveryHistory, assertTerminalReconciliation, selectRecoverySource, recoverySourceFromEvents, recoveryOperationId, recoveryPrompt, prepareRecoveryDelivery, isInfrastructureFailure } from "../lib/runner.mjs";

test("identical failures in successive recovery generations each finalize exactly once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recovery-projection-"));
  try {
    const eventsFile = path.join(root, "events.jsonl");
    const manifest = { run_id: "EVAL", executions: [{ id: "e", stage: "code" }] };
    const input = { source: "test", runId: "EVAL", executionId: "e" };
    const revisions = new Set();
    for (const operation_id of ["EVAL:e:launch", "EVAL:e:launch:recover:R1", "EVAL:e:launch:recover:R2"]) {
      await appendEvent(eventsFile, { ...input, type: "dev.dd.eval.operation.started", data: { operation_id } });
      assert.equal(reduceEvents(await readEvents(eventsFile)).state, "awaiting_provider");
      await appendEvent(eventsFile, { ...input, type: "dev.dd.eval.operation.failed", data: { operation_id, error: { code: "provider_failed", message: "same failure" } } });
      const result_revision = runResultRevision(await readEvents(eventsFile), manifest);
      assert.equal(revisions.has(result_revision), false); revisions.add(result_revision);
      const completion = { eventsFile, runId: "EVAL", type: "dev.dd.eval.completed", data: { state: "completed_with_failures", result_revision, executions: [{ execution: "e", state: "failed" }] } };
      assert.equal(await appendRunEventOnce(completion), true);
      assert.equal(await appendRunEventOnce(completion), false);
      assert.equal(reduceEvents(await readEvents(eventsFile)).state, "completed_with_failures");
    }
    assert.equal((await readEvents(eventsFile)).filter(event => event.type === "dev.dd.eval.completed").length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a productive recovery clears the previous terminal run projection", () => {
  assert.equal(isInfrastructureFailure("opencode_provider_failed"), true);
  const completed = { type: "dev.dd.eval.completed", data: { state: "completed_with_failures" } };
  const started = { type: "dev.dd.eval.operation.started", executionid: "e", data: { operation_id: "EVAL:e:launch:recover:R1:retry:1" } };
  assert.equal(reduceEvents([completed, started]).state, "awaiting_provider");
});

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
  const completed = recoveryPrompt({ recovery, stage: "plan", completed: true });
  assert.match(completed, /plan stage already completed/);
  assert.doesNotMatch(completed, /Continue only the unresolved/);
  assert.throws(() => recoveryPrompt({ recovery: { recovery_id: "R2" }, stage: "code" }), { code: "recovery_acceptance_missing" });
});

test("fan-out recovery acknowledges only and pins the return to ordinary runner dispatch", async () => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), "recovery-fanout-"));
  try {
    const input = { attempt, recovery: { recovery_id: "RCV-fanout", run_id: "RUN-1", generation: 1, accept_command: "dd-flow run recovery accept RUN-1 --recovery-id RCV-fanout" }, stage: "code", sessionId: "native-root", harness: "antigravity-cli", orchestration: { kind: "work_fanout", stage: "code", state: "awaiting_children", works: { created: 1, completed: 2 } } };
    const first = await prepareRecoveryDelivery(input);
    assert.equal(first.packet.coordinator_only, true);
    assert.match(first.packet.prompt, /After acceptance, stop this Turn immediately/);
    assert.match(first.packet.prompt, /Do not perform or finish child Work/);
    assert.match(first.packet.prompt, /runner will reconcile the current Work graph/);
    assert.doesNotMatch(first.packet.prompt, /Continue only the unresolved/);
    const again = await prepareRecoveryDelivery({ ...input, orchestration: { ...input.orchestration, state: "ready", works: { created: 1, completed: 3 } } });
    assert.equal(again.reused, true);
    assert.deepEqual(again.packet, first.packet);
    await assert.rejects(prepareRecoveryDelivery({ ...input, orchestration: null }), { code: "recovery_delivery_conflict" });
    await assert.rejects(prepareRecoveryDelivery({ ...input, orchestration: { kind: "work_fanout", stage: "plan-review" } }), { code: "fanout_contract_invalid" });
    for (const stage of ["plan-review", "code-review"]) {
      const packet = await prepareRecoveryDelivery({ ...input, stage, recovery: { ...input.recovery, recovery_id: `RCV-${stage}` }, orchestration: { kind: "work_fanout", stage } });
      assert.equal(packet.packet.coordinator_only, true);
    }
    for (const state of [{ paused: true }, { completed: true }]) {
      const packet = await prepareRecoveryDelivery({ ...input, ...state, recovery: { ...input.recovery, recovery_id: `RCV-${Object.keys(state)[0]}` } });
      assert.equal(packet.packet.coordinator_only, undefined);
      assert.doesNotMatch(packet.packet.prompt, /Continue only the unresolved/);
    }
  } finally { await rm(attempt, { recursive: true, force: true }); }
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

test("recovery retries retain the sealed source and allocate a new durable operation", () => {
  const run = "EVAL", execution = "e", recovery = "R2", base = `${run}:${execution}:launch:recover:${recovery}`;
  const sourceEvent = { type: "dev.dd.eval.execution.failed", executionid: execution, data: { execution, state: "failed", recovery: { recovery_id: recovery, run_id: "RUN-1" } } };
  const retryFailure = { type: "dev.dd.eval.execution.failed", executionid: execution, data: { execution, state: "failed", recovery_parent_id: recovery, code: "recovery_workspace_drift" } };
  assert.equal(recoverySourceFromEvents([sourceEvent, retryFailure], execution, recovery), sourceEvent.data);
  assert.equal(recoverySourceFromEvents([sourceEvent, sourceEvent, retryFailure], execution, recovery), sourceEvent.data);
  const superseding = { ...sourceEvent, data: { ...sourceEvent.data, recovery: { recovery_id: "R3" } } };
  assert.equal(recoverySourceFromEvents([sourceEvent, superseding], execution, recovery), null);
  assert.equal(recoverySourceFromEvents([sourceEvent, superseding, sourceEvent], execution, recovery), null);
  assert.equal(recoverySourceFromEvents([sourceEvent, superseding, sourceEvent], execution, "R3"), superseding.data);
  const failed = [{ type: "dev.dd.eval.operation.requested", data: { operation_id: base } }, { type: "dev.dd.eval.operation.started", data: { operation_id: base } }, { type: "dev.dd.eval.operation.failed", data: { operation_id: base, error: { code: "drift" } } }];
  assert.equal(recoveryOperationId(failed, run, execution, recovery), `${base}:retry:1`);
  const retried = [...failed, { type: "dev.dd.eval.operation.requested", data: { operation_id: `${base}:retry:1` } }, { type: "dev.dd.eval.operation.started", data: { operation_id: `${base}:retry:1` } }, { type: "dev.dd.eval.operation.failed", data: { operation_id: `${base}:retry:1`, error: { code: "drift" } } }];
  assert.equal(recoveryOperationId(retried, run, execution, recovery), `${base}:retry:2`);
  const pending = [...failed, { type: "dev.dd.eval.operation.started", data: { operation_id: `${base}:retry:1` } }];
  assert.equal(recoveryOperationId(pending, run, execution, recovery), `${base}:retry:1`);
  pending.push({ type: "dev.dd.eval.operation.completed", data: { operation_id: `${base}:retry:1`, result: { state: "candidate_ready" } } });
  assert.equal(recoveryOperationId(pending, run, execution, recovery), `${base}:retry:1`);
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
  emit("operation.started", { operation_id: `${second}:retry:1` }, 60);
  const retried = recoveryHistory(events, manifest, [])[0];
  assert.equal(retried.segments.at(-1).recovery_id, "R2");
  assert.equal(retried.segments.at(-1).operation_id, `${second}:retry:1`);
});

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}


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
  for (const formatted of [false, true]) {
  await writeFile(script, `console.error(JSON.stringify(${JSON.stringify({ error: record })},null,${formatted ? 2 : 0})); process.exitCode = 1;`);
  await assert.rejects(commandJson(script, []), error => {
    assert.equal(error.code, record.code); assert.equal(error.retryable, false);
    assert.deepEqual(error.details, record.details); assert.deepEqual(error.cause, record.cause); return true;
  });
  }
  await writeFile(script, `console.error(JSON.stringify(${JSON.stringify({ ok: false, code: record.code, error: record.message, details: record.details, retryable: true })})); process.exitCode = 1;`);
  await assert.rejects(commandJson(script, []), { code: record.code, message: record.message, retryable: true });
});

test("event enrichment cannot overwrite the journal-owned sequence", async t => {
  const file = path.join(await temporary(t), "events.jsonl");
  const input = { source: "test", runId: "run", type: "dev.dd.eval.execution.failed", data: { sequence: 999, code: "quota" } };
  const first = await appendEvent(file, input);
  const second = await appendEvent(file, { ...input, data: { ...first.data, recovery: { recovery_id: "R1" } } });
  assert.deepEqual([first.data.sequence, second.data.sequence], [1, 2]);
});
