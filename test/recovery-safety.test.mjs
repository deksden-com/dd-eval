import { processSnapshot } from "../lib/process-snapshot.mjs";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertDaemonReplaceable } from "../lib/driver-recovery.mjs";
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

test("candidate identity includes failure evidence and links revisions to their immediate predecessor", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recovery-candidate-evidence-"));
  try {
    const manifest = { run_id: "test" };
    const failure = { execution: "one", state: "failed", code: "quota", error: "quota", recovery: { recovery_id: "R1", manifest_sha256: "snapshot" } };
    const first = await frozenCandidate({ root, manifest, results: [failure] });
    await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: "test", type: "dev.dd.eval.operation.failed", data: { operation_id: "test:one:launch:recover:R1", error: { code: "recovery_owner_missing" } } });
    const second = await frozenCandidate({ root, manifest, results: [{ ...failure, code: "recovery_owner_missing", error: "no owner" }] });
    assert.notEqual(second.candidate.immutable_hash, first.candidate.immutable_hash);
    await appendEvent(path.join(root, "events.jsonl"), { source: "test", runId: "test", type: "dev.dd.eval.candidate.frozen", data: { candidate_sha256: second.candidate.immutable_hash } });
    const third = await frozenCandidate({ root, manifest, results: [{ ...failure, recovery: { ...failure.recovery, manifest_sha256: "different snapshot" } }] });
    assert.equal(third.candidate.parent_candidate_sha256, second.candidate.immutable_hash);
    assert.equal((await frozenCandidate({ root, manifest, results: [{ ...failure, recovery: { ...failure.recovery, manifest_sha256: "different snapshot" } }] })).created, false);
    const original = JSON.parse(await readFile(first.candidate.file, "utf8"));
    original.outcome = "complete"; await writeFile(first.candidate.file, JSON.stringify(original));
    await assert.rejects(frozenCandidate({ root, manifest, results: [failure] }), { code: "candidate_revision_invalid" });
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("retained process birth identity distinguishes a reused PID without signalling it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reused-process-"));
  const current = (await processSnapshot()).find(record => record.pid === process.pid);
  const save = owned => writeFile(path.join(root, "daemon.json"), JSON.stringify({ pid: process.pid, owned_processes: owned }));
  try {
    await save([{ ...current, started: "Mon Jan 1 00:00:00 2001" }]);
    await assertDaemonReplaceable(root);
    assert.equal(process.kill(process.pid, 0), true);
    await save([current]);
    await assert.rejects(assertDaemonReplaceable(root), { code: "operation_observation_lost" });
    await save([{ pid: process.pid }]);
    await assert.rejects(assertDaemonReplaceable(root), { code: "operation_observation_lost" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
