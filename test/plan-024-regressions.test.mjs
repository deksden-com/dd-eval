import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertTargetSession, continuationStage, storedExecutionResults } from "../lib/runner.mjs";

test("managed execution addresses the restored flow RUN, not the event EVAL ID", async () => {
  const source = await readFile(new URL("../lib/runner.mjs", import.meta.url), "utf8");
  const execution = source.slice(source.indexOf("async function executeEval("), source.indexOf("export async function evalJudge("));
  assert.match(execution, /observeManagedExecution\(/);
  const managed = source.slice(source.indexOf("async function observeManagedExecution("), source.indexOf("export async function recoverExecution("));
  assert.match(managed, /observeManagedRun\(\{[\s\S]*?runId: restored\.run_id/);
  assert.doesNotMatch(execution, /observeNativeChildren\(/);
  assert.doesNotMatch(source, /\["stage", "native", "observe"/);
  assert.doesNotMatch(source, /(?:async )?function (?:observeNativeChildren|fanoutStatus|fanoutDispatch|fanoutCoordinatorPrompt|fanoutGraphPreparationPrompt|failedChildPrompt)\(/);
});

test("CLI continuation permits a repair edge and rejects missing authority", () => {
  assert.equal(continuationStage({ status: { continuation: { kind: "continue_stage", stage: "code", attempt: "try-002" } } }, "merge"), "code");
  assert.equal(continuationStage({ status: { continuation: { kind: "start_stage", stage: "merge" } } }, "code"), "merge");
  assert.throws(() => continuationStage({}, "plan"), error => error.code === "flow_reconciliation_failed");
  assert.throws(() => continuationStage({ status: { continuation: { kind: "blocked", stage: "merge" } } }, "merge"), error => error.code === "flow_reconciliation_failed");
});

test("all targeted operations reject another native Session including cancellation", () => {
  const profile = { harness: "antigravity-cli" };
  for (const operation of ["prompt", "inspect", "cancel", "resume", "status"]) {
    const args = ["session", operation, "--session-id", "A"];
    assert.doesNotThrow(() => assertTargetSession({ provider_session_id: "A" }, profile, args));
    for (const response of [{ provider_session_id: "B" }, {}, { provider_session_id: "A", harness: "zcode-acp" }]) {
      assert.throws(() => assertTargetSession(response, profile, args), error => error.code === "session_identity_mismatch");
    }
  }
});

test("a failed launch survives cleanup and controller restart", () => {
  const manifest = { run_id: "E1", executions: [{ id: "e2e", stage: "specify" }] };
  const events = [
    { executionid: "e2e", type: "dev.dd.eval.execution.failed", data: { state: "failed", code: "provider_failed", error: "original", attempt: "/evidence" } },
    { executionid: "e2e", type: "dev.dd.eval.execution.cancelled", data: { state: "cancelled" } }
  ];
  assert.equal(storedExecutionResults(events, manifest)[0].state, "failed");
  assert.equal(storedExecutionResults(events, manifest)[0].error, "original");
  assert.equal(storedExecutionResults(events, manifest)[0].attempt, "/evidence");
});
