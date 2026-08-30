import assert from "node:assert/strict";
import test from "node:test";
import { createSessionWithBridge, promptSessionWithBridge } from "../lib/dd-codex.mjs";

test("Codex eval Sessions trust only the generated hook environment", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return { thread: { id: "thread-001" } }; } };
  await createSessionWithBridge(bridge, { cwd: "/tmp", model: "gpt-5.6-terra", reasoning: "high" });
  assert.deepEqual(calls, [{ method: "thread/start", params: {
    cwd: "/tmp", model: "gpt-5.6-terra", approvalPolicy: "never", sandbox: "danger-full-access", ephemeral: false,
    config: { bypass_hook_trust: true, "features.plugins": false }
  } }]);
});

test("Codex adapter reads the terminal agent message when thread history is summarized", async () => {
  const turnId = "turn-001";
  const bridge = {
    turns: new Map([[turnId, { status: "completed", value: { turn: { items: [{ type: "agentMessage", text: '{"ok":true}' }] } } }]]),
    request: async (method) => method === "turn/start" ? { turn: { id: turnId } } : { thread: { id: "thread-001", itemsView: "notLoaded" } }
  };
  const result = await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply" });
  assert.equal(result.assistant_text, '{"ok":true}');
});
