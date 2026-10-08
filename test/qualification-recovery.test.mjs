import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { writeJsonAtomic, hashJson, sha256 } from "../lib/runner-events.mjs";
import { profileSemanticHash } from "../lib/execution-contract.mjs";
import { assertQualificationPreparationRecovery, reconcileQualificationPreparation } from "../lib/qualification-recovery.mjs";

for (const boundary of ["heartbeat", "admission"]) test(`pre-model ${boundary} reconciliation stops only exact owned resources and never rewrites native evidence`, async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), "qualification-reconciliation-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const operation = path.join(home, "a".repeat(64), "operation-offline"), root = path.join(operation, "interaction-judge/specify-offline"), stateDir = path.join(root, "daemon");
  const intentFile = path.join(operation, "native-intents", `${sha256("item")}.json`), stateFile = path.join(stateDir, "daemon.json");
  const profile = { id: "judge", harness: "codex-desktop", model: "gpt-6.1-sol", reasoning: "high" };
  const packet = { stage: "specify", question: "Offline?", responses: [], required_result: {}, subject_context: null };
  const identity = { judge: { harness: profile.harness, model: profile.model, reasoning: profile.reasoning }, ...packet, context_sha256: null };
  delete identity.subject_context;
  const intent = { id: "item", native_key: hashJson(identity), identity };
  const owner = { schema_id: "dd-flow/runtime-owner@1", owner_id: `judge:${sha256(stateDir)}`, operation_id: `judge:${sha256(stateDir)}`, role: "judge", state_dir: stateDir,
    dd_flow_home: path.join(operation, "dd-flow-home"), resource_home: path.join(home, "resources") };
  owner.dd_flow_bin = path.join(owner.dd_flow_home, "bin/dd-flow"); owner.adapter_executable = path.join(owner.dd_flow_home, "harness-runtime/bin/dd-codex.mjs");
  const records = ["codex-daemon", "codex-provider"].map((kind, index) => ({ id: kind, kind, owner_id: owner.owner_id, lease_token: `private-${index}`, pid: 1073741800 + index,
    pid_started_at: "Thu Oct 8 08:00:00 2026", project_id: null, run_id: null, work_id: null, check_id: null, operation_id: `${owner.operation_id}:${kind}${index === 0 ? ":daemon" : ""}`,
    metadata_json: JSON.stringify({ role: "judge", state_dir: stateDir, dd_flow_home: owner.dd_flow_home, adapter_executable: owner.adapter_executable,
      process_group_id: 1073741800 + index, owner_pid: 1073741800 }), state: "running", finished_at: null }));
  const binding = record => createHash("sha256").update(JSON.stringify([owner.resource_home, record.id, record.kind, record.owner_id, record.lease_token, record.pid, record.pid_started_at, record.project_id, record.run_id, record.work_id, record.check_id, record.operation_id, record.metadata_json])).digest("hex");
  const state = { daemon_id: "incarnation", pid: records[0].pid, provider_pid: records[1].pid, sessions: [], active_operation: null, active_tree: false,
    config: { cwd: root, resourceHome: owner.resource_home, runtime_owner: owner },
    resource_process: { id: records[0].id, lease_token: records[0].lease_token, registration_sha256: binding(records[0]) },
    provider_process: { id: records[1].id, lease_token: records[1].lease_token, registration_sha256: binding(records[1]) },
    shutdown: { schema_id: "dd-flow/daemon-shutdown@1", daemon_id: "incarnation", result: { clean: true }, tree_observed_at: new Date().toISOString(),
      required_phases: ["tree", "provider", "provider_resource", "daemon_resource"], phases: { tree: true, provider: true, provider_resource: true } } };
  await writeJsonAtomic(intentFile, intent); await writeJsonAtomic(path.join(root, "packet.json"), packet);
  await writeJsonAtomic(path.join(root, "native-intent.json"), { profile_id: profile.id, profile_sha256: profileSemanticHash(profile), profile_snapshot: profile, packet_sha256: hashJson(packet) });
  await writeJsonAtomic(stateFile, state);
  const saveOperation = async (id, kind, result) => {
    const dir = path.join(stateDir, "operations", sha256(id));
    await writeJsonAtomic(path.join(dir, "requested.json"), { operation_id: id, operation: kind, daemon_id: kind === "daemon.start" ? null : "incarnation", session_id: null });
    await writeJsonAtomic(path.join(dir, "result.json"), result);
  };
  const failedCreate = { state: "failed", error: { code: "process_ownership_unknown", details: { process_id: records[0].id,
    ...(boundary === "admission" ? { action: "admission", effect: "committed", native_dispatch_started: false } : {}) },
    ...(boundary === "heartbeat" ? { cause: { details: { hook_diagnostics: [{ action: "heartbeat", process_id: records[0].id, native_dispatch_started: false }] } } } : {}) } };
  await saveOperation("start", "daemon.start", { state: "completed", started_daemon_id: "incarnation", result: { daemon_id: "incarnation", pid: state.pid, cwd: root } });
  await saveOperation("create", "session.create", failedCreate);
  await saveOperation("stop", "daemon.stop", { state: "failed" });
  const calls = [];
  const invoke = async (bin, args, options) => {
    assert.equal(bin, owner.dd_flow_bin); assert.equal(options.env.DD_FLOW_RESOURCE_HOME, owner.resource_home);
    calls.push(args);
    if (args[2] === "status") return { ok: true, processes: structuredClone(records) };
    assert.equal(args[2], "stop");
    const record = records.find(record => record.id === args[4]); assert.ok(record); assert.equal(args[6], record.lease_token);
    record.state = "stopped"; record.finished_at = new Date().toISOString(); return { ok: true, process: { ...record } };
  };
  const reconcile = () => reconcileQualificationPreparation({ intentFile, home, invoke });
  const verify = () => assertQualificationPreparationRecovery({ intentFile, home, invoke });
  // Native/prompt uncertainty must fail BEFORE any process mutation.
  for (const kind of ["session.prompt", "session.resume", "session.fork", "session.create"]) {
    await saveOperation("create", kind, kind === "session.create" ? { ...failedCreate, state: "completed" } : failedCreate);
    await assert.rejects(reconcile(), { code: "definition_qualification_outcome_unknown" }); assert.equal(calls.length, 0);
  }
  if (boundary === "admission") for (const change of [{ native_dispatch_started: true }, { effect: "unknown" }, { action: "session.create" }, { process_id: "foreign" }]) {
    await saveOperation("create", "session.create", { ...failedCreate, error: { ...failedCreate.error, details: { ...failedCreate.error.details, ...change } } });
    await assert.rejects(reconcile(), { code: "definition_qualification_outcome_unknown" }); assert.equal(calls.length, 0);
  }
  await saveOperation("create", "session.create", failedCreate);
  const originalOwner = records[0].owner_id; records[0].owner_id = "foreign";
  await assert.rejects(reconcile(), { code: "definition_qualification_outcome_unknown" }); assert.equal(calls.filter(call => call[2] === "stop").length, 0);
  records[0].owner_id = originalOwner;
  const original = await readFile(stateFile), originalIntent = await readFile(intentFile);
  const receipt = await reconcile();
  assert.equal(receipt.status, "retired_before_model_dispatch"); assert.equal(await verify(), true);
  assert.deepEqual(await readFile(stateFile), original); assert.deepEqual(await readFile(intentFile), originalIntent);
  assert.ok(!JSON.stringify(receipt).includes("private-"));
  const stops = calls.filter(call => call[2] === "stop").length;
  assert.deepEqual(await reconcile(), receipt); assert.equal(calls.filter(call => call[2] === "stop").length, stops);
  records[0].state = "running"; await assert.rejects(verify(), { code: "definition_qualification_outcome_unknown" }); records[0].state = "stopped";
  await writeJsonAtomic(stateFile, { ...state, pid: process.pid }); await assert.rejects(verify(), { code: "definition_qualification_outcome_unknown" }); await writeJsonAtomic(stateFile, state);
  await writeJsonAtomic(path.join(root, "packet.json"), { ...packet, question: "Changed?" }); await assert.rejects(verify(), { code: "definition_qualification_outcome_unknown" }); await writeJsonAtomic(path.join(root, "packet.json"), packet);
  await saveOperation("new-turn", "session.prompt", { state: "completed" }); await assert.rejects(verify(), { code: "definition_qualification_outcome_unknown" });
});
