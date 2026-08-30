import assert from "node:assert/strict";
import test from "node:test";
import { createSessionWithBridge } from "../lib/dd-codex.mjs";

test("Codex eval Sessions trust only the generated hook environment", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return { thread: { id: "thread-001" } }; } };
  await createSessionWithBridge(bridge, { cwd: "/tmp", model: "gpt-5.6-terra", reasoning: "high" });
  assert.deepEqual(calls, [{ method: "thread/start", params: {
    cwd: "/tmp", model: "gpt-5.6-terra", approvalPolicy: "never", sandbox: "danger-full-access", ephemeral: false,
    config: { bypass_hook_trust: true, "features.plugins": false }
  } }]);
});
