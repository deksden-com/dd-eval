import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recoverySettlement } from "../lib/driver-recovery.mjs";
import { frozenCandidate, storedExecutionResults, runnerRecoveryInspect } from "../lib/runner.mjs";
import { appendEvent } from "../lib/runner-events.mjs";

test("captured recovery supersedes the original launch failure and inspect is read-only", async () => {
  const manifest = { run_id: "test", executions: [{ id: "one" }] };
  const events = [
    { executionid: "one", type: "dev.dd.eval.operation.completed", data: { operation_id: "test:one:launch", result: { execution: "one", state: "failed" } } },
    { executionid: "one", type: "dev.dd.eval.execution.failed", data: { recovery: { recovery_id: "RCV-one" } } }
  ];
  assert.equal(storedExecutionResults(events, manifest)[0].recovery.recovery_id, "RCV-one");
  const root = await mkdtemp(path.join(os.tmpdir(), "recovery-inspect-"));
  try {
    await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
    const result = await runnerRecoveryInspect({ evalRoot: root });
    assert.equal(result.executions[0].recovery, null);
    await assert.rejects(runnerRecoveryInspect({ evalRoot: root, executionId: "missing" }), { code: "execution_not_found" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("candidate revisions require a completed recovery and are reused without another Judge input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recovery-candidate-"));
  try {
    const manifest = { run_id: "test" };
    const first = await frozenCandidate({ root, manifest, results: [{ execution: "one", state: "failed" }] });
    const input = { root, manifest, results: [{ execution: "one", state: "candidate_ready" }] };
    await assert.rejects(frozenCandidate(input), { code: "candidate_revision_unauthorized" });
    await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: "test", type: "dev.dd.eval.operation.completed", data: { operation_id: "test:one:launch:recover:RCV-one" } });
    const revision = await frozenCandidate(input);
    assert.equal(revision.candidate.parent_candidate_sha256, first.candidate.immutable_hash);
    const reused = await frozenCandidate(input);
    assert.equal(reused.created, false);
    assert.equal(reused.candidate.immutable_hash, revision.candidate.immutable_hash);
    assert.equal((await frozenCandidate({ root, manifest, results: [{ execution: "one", state: "failed" }] })).candidate.immutable_hash, first.candidate.immutable_hash);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery requires clean receipts for every dead daemon, not just a dead pid", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recovery-safety-"));
  const child = spawn(process.execPath, ["-e", ""]); const pid = child.pid; await once(child, "exit");
  const save = state => writeFile(path.join(root, "daemon.json"), JSON.stringify({ pid, daemon_id: "test", ...state }));
  try {
    await assert.rejects(recoverySettlement(root), { code: "recovery_settlement_unconfirmed" });
    await save({ shutdown_state: "running" });
    await assert.rejects(recoverySettlement(root), { code: "recovery_settlement_unconfirmed" });
    await save({ shutdown_state: "clean", active_tree: true });
    await assert.rejects(recoverySettlement(root), { code: "recovery_settlement_unconfirmed" });
    await save({ shutdown_state: "clean", pid: process.pid });
    await assert.rejects(recoverySettlement(root), { code: "operation_observation_lost" });
    await save({ shutdown_state: "clean", active_tree: false });
    assert.equal((await recoverySettlement(root)).settled, true);
    await mkdir(path.join(root, "fanout"));
    await writeFile(path.join(root, "fanout", "daemon.json"), JSON.stringify({ pid, shutdown_state: "cleanup_failed" }));
    await assert.rejects(recoverySettlement(root), { code: "recovery_settlement_unconfirmed" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
