import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, observationProjection } from "../lib/runner-events.mjs";

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

test("runner publishes a durable console observation after a committed event", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-observation-"));
  const eventsFile = path.join(root, "events.jsonl");
  await appendEvent(eventsFile, { source: "fixture", runId: "EVAL-001", executionId: "e2e", type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready" } });
  const observation = JSON.parse(await readFile(path.join(root, "observation.json"), "utf8"));
  assert.deepEqual(observation, { schema_id: "dd-eval/observation@1", run_id: "EVAL-001", observed_at: observation.observed_at, last_sequence: 1, state: "planned", executions: [{ id: "e2e", state: "candidate_ready", last_sequence: 1 }], candidate: false, judge: "unknown" });
});

test("observation projection uses the runner reducer and keeps execution facts separate", () => {
  const projection = observationProjection([{ runid: "EVAL-002", time: "2026-09-13T10:00:00.000Z", type: "dev.dd.eval.planned", data: { sequence: 1, state: "planned" } }, { runid: "EVAL-002", executionid: "one", time: "2026-09-13T10:00:01.000Z", type: "dev.dd.eval.execution.failed", data: { sequence: 2, state: "failed" } }]);
  assert.equal(projection.last_sequence, 2);
  assert.equal(projection.state, "planned");
  assert.deepEqual(projection.executions, [{ id: "one", state: "failed", last_sequence: 2 }]);
});
