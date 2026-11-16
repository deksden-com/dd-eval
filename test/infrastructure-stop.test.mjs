import test from "node:test";
import assert from "node:assert/strict";
import { infrastructureQueueStopped, terminalExecution } from "../lib/execution/infrastructure-stop.mjs";

test("queue stops only for infrastructure failures under the retained policy", async () => {
  const execution = { id: "one", stage: "work" };
  const manifest = { run_id: "eval", executions: [execution], profile: { failure_policy: { stop_run_on_infrastructure_error: true } } };
  const failure = code => [{ executionid: "one", type: "dev.dd.eval.execution.failed", data: { code } }];
  assert.equal(await infrastructureQueueStopped([], manifest), false);
  assert.equal(await infrastructureQueueStopped(failure("provider_unavailable"), manifest), true);
  assert.equal(await infrastructureQueueStopped(failure("ordinary_failure"), manifest), false);
  manifest.profile.failure_policy.stop_run_on_infrastructure_error = false;
  assert.equal(await infrastructureQueueStopped(failure("provider_unavailable"), manifest), false);
  assert.equal(terminalExecution([], manifest, execution), false);
  assert.equal(terminalExecution([{ executionid: "one", type: "dev.dd.eval.execution.cancelled", data: {} }], manifest, execution), true);
});
