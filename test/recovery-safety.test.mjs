import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recoverySettlement, authorizeRetainedDaemonResume } from "../lib/driver-recovery.mjs";
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

test("retained daemon restart fences identity and profile and archives its prior receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "retained-daemon-"));
  const child = spawn(process.execPath, ["-e", ""]); const pid = child.pid; await once(child, "exit");
  const config = { cwd: root, model: "fixed-model", noFlow: true };
  const previous = { daemon_id: "original", pid, shutdown_state: "clean", active_tree: false, sessions: [{ provider_session_id: "retained" }], config };
  try {
    await writeFile(path.join(root, "daemon.json"), JSON.stringify(previous));
    await assert.rejects(authorizeRetainedDaemonResume(root, previous, null, config), { code: "daemon_state_terminal" });
    await assert.rejects(authorizeRetainedDaemonResume(root, previous, "foreign", config), { code: "daemon_state_terminal" });
    await assert.rejects(authorizeRetainedDaemonResume(root, previous, "retained", { ...config, model: "changed" }), { code: "daemon_config_mismatch" });
    await assert.rejects(authorizeRetainedDaemonResume(root, { ...previous, shutdown_state: "unclean" }, "retained", config), { code: "daemon_state_terminal" });
    await authorizeRetainedDaemonResume(root, previous, "retained", config);
    await authorizeRetainedDaemonResume(root, previous, "retained", config);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "daemon-history", "original.json"), "utf8")), previous);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a clean adapter receipt cannot hide an active managed check or service", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "managed-recovery-"));
  const drivers = path.join(root, "drivers"); await mkdir(drivers);
  const child = spawn(process.execPath, ["-e", ""]); const pid = child.pid; await once(child, "exit");
  const cli = path.join(root, "registry.mjs");
  const record = { id: "check", state: "running", stdout_path: path.join(root, "check.log") };
  const writeRegistry = () => writeFile(cli, `process.stdout.write(${JSON.stringify(JSON.stringify({ ok: true, processes: [{ id: "daemon", state: "stopped" }, record] }))});`);
  try {
    await writeRegistry();
    await writeFile(path.join(drivers, "daemon.json"), JSON.stringify({ pid, shutdown_state: "clean", daemon_id: "daemon", resource_process: { id: "daemon" }, config: { cwd: root, resourceHome: root, ddFlowHome: root, ddFlowBin: cli } }));
    await assert.rejects(recoverySettlement(drivers), { code: "recovery_settlement_unconfirmed" });
    record.state = "stopped"; await writeRegistry();
    assert.equal((await recoverySettlement(drivers)).settled, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
