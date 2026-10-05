import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import * as events from "../../lib/runner-events.mjs";
import { executionState } from "../../lib/execution-state.mjs";

// Only replace the paid action. Exercise the actual operation ledger and runner catch.
let nativeError, dispatches = 0;
mock.module(new URL("../../lib/runner-events.mjs", import.meta.url).href, {
  namedExports: { ...events, recordOperation: input => events.recordOperation({
    ...input, action: async () => { dispatches++; throw nativeError; },
  }) },
});
const { launchEvalExecution } = await import("../../lib/runner.mjs");
const receipts = [];
for (const code of process.argv.slice(2).length ? process.argv.slice(2) : ["subject_liveness_timeout", "command_observation_lost", "agy_provider_quota_exhausted"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-runner-launch-observation-"));
  const runId = "EVAL-observation", execution = { id: "e2e", mode: "e2e", stage: "specify" };
  const opId = `${runId}:${execution.id}:launch`, eventsFile = path.join(root, "events.jsonl");
  const manifest = { run_id: runId, subject_profile: { harness: "zcode" }, profile: { failure_policy: { stop_run_on_infrastructure_error: true } } };
  nativeError = Object.assign(new Error("native observer result"), {
    code, retryable: false, details: { native_outcome: code === "agy_provider_quota_exhausted" ? "failed" : "unknown", operation_id: opId },
    cause: Object.assign(new Error("socket closed"), { code: "socket_closed" }),
    cleanup_error: Object.assign(new Error("cleanup uncertain"), { code: "cleanup_unconfirmed" }),
  });
  dispatches = 0;
  let stops = 0;
  const input = { root, manifest, execution, onInfrastructureFailure: () => { stops++; } };
  const result = await launchEvalExecution(input);
  let journal = await events.readEvents(eventsFile), reduced = events.reduceEvents(journal);
  assert.equal(dispatches, 1);
  assert.equal(result.code, code);
  assert.equal(result.state, code === "agy_provider_quota_exhausted" ? "failed" : "awaiting_provider");
  assert.equal(result.cause.code, "socket_closed");
  assert.equal(result.cleanup_error.code, "cleanup_unconfirmed");
  if (code === "agy_provider_quota_exhausted") {
    assert.equal(result.state, "failed");
    assert.equal(stops, 1);
    assert.equal(reduced.operations[opId].terminal, "failed");
  } else {
    assert.equal(result.state, "awaiting_provider");
    assert.equal(result.execution_operation_id, opId);
    assert.equal(result.attempt, path.join(root, "executions", "e2e"));
    assert.equal(stops, 0);
    assert.equal(reduced.operations[opId].terminal, null);
    assert.equal(reduced.operations[opId].observation_lost.code, code);
    assert.ok(!journal.some(event => event.type === "dev.dd.eval.execution.failed"));
    const waiting = journal.findLast(event => event.type === "dev.dd.eval.execution.awaiting_provider");
    assert.equal(waiting.data.execution_operation_id, opId);
    assert.equal((await launchEvalExecution(input)).state, "awaiting_provider");
    assert.equal(dispatches, 1);
    await events.completeOperation({ eventsFile, source: "test", runId, executionId: execution.id,
      operationId: opId, operation: "execution.e2e.launch", result: { execution: "e2e", state: "candidate_ready", answer: "exact late native result" } });
    assert.equal((await launchEvalExecution(input)).answer, "exact late native result");
    assert.equal(dispatches, 1);
    journal = await events.readEvents(eventsFile);
    assert.equal(executionState(journal, runId, execution).result.state, "candidate_ready");
    assert.equal(journal.filter(event => event.type === "dev.dd.eval.operation.completed").length, 1);
  }
  receipts.push({ code, status: "PASS", dispatches, stops, state: result.state, root });
}
console.log(JSON.stringify({ status: "PASS", receipts }));
