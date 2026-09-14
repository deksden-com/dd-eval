import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, observationProjection, readEvents } from "../lib/runner-events.mjs";

test("journal rejects conflicting duplicate payload, scope, sequence and truncated tail", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-journal-conflict-")), file = path.join(root, "events.jsonl");
  const input = { id: "one", deduplicate: true, source: "fixture", runId: "EVAL", type: "dev.dd.eval.planned", data: { state: "planned" } };
  await appendEvent(file, input);
  const bytes = await readFile(file, "utf8");
  for (const change of [{ runId: "foreign" }, { data: { state: "failed" } }, { type: "dev.dd.eval.failed" }]) await assert.rejects(appendEvent(file, { ...input, ...change }), { code: "journal_conflict" });
  assert.equal(await readFile(file, "utf8"), bytes);
  for (const corrupt of [bytes.trimEnd(), bytes + bytes, bytes.replace('"sequence":1', '"sequence":2')]) {
    await writeFile(file, corrupt);
    await assert.rejects(readEvents(file), { code: "journal_conflict" });
  }
});

test("a failed projection does not undo a committed event and a duplicate repairs it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-projection-fault-"));
  const events = path.join(root, "events.jsonl"), projection = path.join(root, "observation.json");
  await mkdir(projection);
  const input = { id: "committed", deduplicate: true, source: "fixture", runId: "EVAL", type: "dev.dd.eval.completed", data: { state: "completed" } };
  assert.equal((await appendEvent(events, input)).id, "committed");
  assert.equal(JSON.parse(await readFile(path.join(root, "observation-error.json"))).code, "observation_projection_failed");
  await rmdir(projection);
  await appendEvent(events, input);
  assert.equal((await readFile(events, "utf8")).trim().split("\n").length, 1);
  assert.equal(JSON.parse(await readFile(projection)).state, "completed");
  await assert.rejects(readFile(path.join(root, "observation-error.json")), { code: "ENOENT" });
});

test("cleanup exhaustion replaces awaiting_provider and preserves execution failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-blocked-"));
  const eventsFile = path.join(root, "events.jsonl");
  await appendEvent(eventsFile, { source: "fixture", runId: "EVAL-003", type: "dev.dd.eval.planned", data: { state: "awaiting_provider" } });
  await appendEvent(eventsFile, { source: "fixture", runId: "EVAL-003", executionId: "e2e", type: "dev.dd.eval.execution.failed", data: { state: "failed" } });
  await appendEvent(eventsFile, { source: "fixture", runId: "EVAL-003", type: "dev.dd.eval.recovery_blocked", data: { state: "recovery_blocked" } });
  const observation = JSON.parse(await readFile(path.join(root, "observation.json"), "utf8"));
  assert.equal(observation.state, "recovery_blocked");
  assert.equal(observation.executions[0].state, "failed");
});

test("late observations cannot revive a terminal execution or contaminate explicit recovery", () => {
  const events = [];
  const add = (type, data, executionid = "e2e") => events.push({ runid: "EVAL", executionid, type: `dev.dd.eval.${type}`, data: { ...data, sequence: events.length + 1 } });
  const launch = "EVAL:e2e:launch", recovery = `${launch}:recover:one`;
  add("operation.started", { operation_id: launch });
  add("operation.failed", { operation_id: launch, error: { code: "storage_write_failed" } });
  add("execution.failed", { execution_operation_id: launch, state: "failed", code: "storage_write_failed" });
  add("completed", { state: "finished_with_failures" }, undefined);
  add("execution.awaiting_provider", { execution_operation_id: launch, state: "awaiting_provider" });
  add("operation.started", { operation_id: launch });
  let result = observationProjection(events);
  assert.equal(result.state, "finished_with_failures");
  assert.equal(result.executions[0].state, "failed");
  add("operation.started", { operation_id: recovery });
  add("controller.event", { execution_operation_id: recovery, data: { stage: "code", status: "running" } });
  add("controller.event", { execution_operation_id: launch, data: { stage: "plan", error: { code: "old_failure" } } });
  result = observationProjection(events);
  assert.equal(result.state, "awaiting_provider");
  assert.equal(result.executions[0].state, "awaiting_provider");
  assert.equal(result.executions[0].stage, "code");
  assert.equal(result.executions[0].failure, undefined);
});

test("runner publishes a durable console observation after a committed event", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-observation-"));
  const eventsFile = path.join(root, "events.jsonl");
  await appendEvent(eventsFile, { source: "fixture", runId: "EVAL-001", executionId: "e2e", type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready" } });
  const observation = JSON.parse(await readFile(path.join(root, "observation.json"), "utf8"));
  assert.deepEqual(observation, { schema_id: "dd-eval/observation@1", run_id: "EVAL-001", observed_at: observation.observed_at, last_sequence: 1, state: "planned", executions: [{ id: "e2e", state: "candidate_ready", last_sequence: 1 }], pending_operations: [], candidate: false, judge: "unknown" });
});

test("a duplicate retry repairs observation after a committed journal event", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-observation-repair-"));
  const eventsFile = path.join(root, "events.jsonl"), id = "repairable-event";
  await appendEvent(eventsFile, { id, deduplicate: true, source: "fixture", runId: "EVAL-REPAIR", type: "dev.dd.eval.planned", data: { state: "planned" } });
  await unlink(path.join(root, "observation.json"));
  await appendEvent(eventsFile, { id, deduplicate: true, source: "fixture", runId: "EVAL-REPAIR", type: "dev.dd.eval.planned", data: { state: "planned" } });
  assert.equal(JSON.parse(await readFile(path.join(root, "observation.json"), "utf8")).last_sequence, 1);
});

test("observation projection uses the runner reducer and keeps execution facts separate", () => {
  const projection = observationProjection([{ runid: "EVAL-002", time: "2026-09-13T10:00:00.000Z", type: "dev.dd.eval.planned", data: { sequence: 1, state: "planned" } }, { runid: "EVAL-002", executionid: "one", time: "2026-09-13T10:00:01.000Z", type: "dev.dd.eval.execution.failed", data: { sequence: 2, state: "failed" } }]);
  assert.equal(projection.last_sequence, 2);
  assert.equal(projection.state, "planned");
  assert.deepEqual(projection.executions, [{ id: "one", state: "failed", last_sequence: 2 }]);
});
