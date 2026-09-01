import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { createSessionWithBridge, inspectSessionWithBridge, promptSessionWithBridge } from "../lib/dd-codex.mjs";
import { callDaemon } from "../lib/dd-codex-daemon.mjs";

test("Codex eval Sessions trust only the generated hook environment", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return { thread: { id: "thread-001" } }; } };
  await createSessionWithBridge(bridge, { cwd: "/tmp", model: "gpt-5.6-terra", reasoning: "high" });
  assert.deepEqual(calls, [{ method: "thread/start", params: {
    cwd: "/tmp", model: "gpt-5.6-terra", approvalPolicy: "never", sandbox: "danger-full-access", ephemeral: false,
    config: { bypass_hook_trust: true, "features.plugins": false }
  } }]);
});

test("Codex Session creation does not misreport the default reasoning before its first Turn", async () => {
  const bridge = { request: async () => ({ thread: { id: "thread-001", model: "gpt-5.6-luna", reasoningEffort: "high" } }) };
  const created = await createSessionWithBridge(bridge, { cwd: "/tmp", model: "gpt-5.6-luna", reasoning: "xhigh" });
  assert.deepEqual(created.observed_profile, { model: "gpt-5.6-luna" });
});

test("Codex Turn reports the applied reasoning rather than the requested value", async () => {
  const turnId = "turn-001";
  const bridge = {
    turns: new Map([[turnId, { status: "completed", value: { turn: { status: "completed" } } }]]),
    request: async (method) => method === "turn/start" ? { turn: { id: turnId } } : { thread: { id: "thread-001", model: "gpt-5.6-luna", reasoningEffort: "xhigh", status: { type: "idle" } } }
  };
  const result = await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply", model: "gpt-5.6-luna", reasoning: "xhigh" });
  assert.deepEqual(result.observed_profile, { model: "gpt-5.6-luna", reasoning: "xhigh" });
});

test("Codex adapter reads the terminal agent message when thread history is summarized", async () => {
  const turnId = "turn-001";
  const bridge = {
    turns: new Map([[turnId, { status: "completed", value: { turn: { items: [{ type: "agentMessage", text: '{"ok":true}' }] } } }]]),
    request: async (method) => method === "turn/start" ? { turn: { id: turnId } } : { thread: { id: "thread-001", itemsView: "notLoaded", status: { type: "idle" } } }
  };
  const result = await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply" });
  assert.equal(result.assistant_text, '{"ok":true}');
});

test("Codex adapter resumes an unloaded Session before a new Turn", async () => {
  const calls = [];
  const bridge = {
    turns: new Map([["turn-001", { status: "completed", value: { turn: { status: "completed" } } }]]),
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { id: "thread-001", status: { type: "notLoaded" } } };
      if (method === "turn/start") return { turn: { id: "turn-001" } };
      return { thread: { id: "thread-001" } };
    }
  };
  await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply", model: "gpt-5.6-terra" });
  assert.deepEqual(calls.slice(0, 2), [
    { method: "thread/read", params: { threadId: "thread-001", includeTurns: false } },
    { method: "thread/resume", params: { threadId: "thread-001", cwd: "/tmp", model: "gpt-5.6-terra", approvalPolicy: "never", sandbox: "danger-full-access", config: { bypass_hook_trust: true, "features.plugins": false } } }
  ]);
});

test("Codex adapter observes a live Session without hydrating its full history", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return { thread: { id: "thread-001", status: { type: "active" } } }; } };
  const result = await inspectSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001" });
  assert.equal(result.status.type, "active");
  assert.deepEqual(calls, [{ method: "thread/read", params: { threadId: "thread-001", includeTurns: false } }]);
});

test("Codex adapter fails closed when a persisted Turn was interrupted", async () => {
  const bridge = {
    turns: new Map(),
    request: async (method) => {
      if (method === "thread/read") return { thread: { id: "thread-001", status: { type: "idle" }, turns: [{ id: "turn-001", status: "interrupted" }] } };
      if (method === "turn/start") return { turn: { id: "turn-001" } };
      return {};
    }
  };
  await assert.rejects(() => promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply" }), { code: "turn_interrupted" });
});

test("Codex adapter keeps waiting for alternate active Turn spellings", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/dd-codex.mjs", import.meta.url), "utf8");
  assert.match(source, /isTerminalTurnStatus\(stored\.turn\.status\)/);
  assert.match(source, /\["completed", "failed", "interrupted", "cancelled"\]/);
});

test("Codex adapter does not mistake an idle Thread with a stale active Turn for a terminal one", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/dd-codex.mjs", import.meta.url), "utf8");
  assert.match(source, /hydrated\?\.turn && isTerminalTurnStatus\(hydrated\.turn\.status\)/);
});

test("Codex adapter falls back to the final message when hydrated Turn is still active", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/dd-codex.mjs", import.meta.url), "utf8");
  const occurrences = source.match(/hydrated\?\.turn && isTerminalTurnStatus\(hydrated\.turn\.status\)/g) ?? [];
  assert.equal(occurrences.length, 2);
});

test("Codex adapter clears a prior final-message fallback before a new Turn", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/dd-codex.mjs", import.meta.url), "utf8");
  assert.match(source, /await ensureThreadLoaded\(bridge, sessionId, options, cwd\);\n\s*\/\/ A final-message fallback[\s\S]*?bridge\.finalMessages\?\.delete\(sessionId\);\n\s*const started/);
});

test("Codex adapter hydrates one terminal Turn after an idle compact read", async () => {
  const turnId = "turn-001"; const calls = [];
  const bridge = {
    turns: new Map(),
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "turn/start") return { turn: { id: turnId } };
      if (method !== "thread/read") return {};
      return params.includeTurns ? { thread: { status: { type: "idle" }, turns: [{ id: turnId, status: "completed" }] } } : { thread: { status: { type: "idle" } } };
    }
  };
  await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply" });
  assert.deepEqual(calls.slice(0, 4).map(({ method, params }) => [method, params.includeTurns]), [
    ["thread/read", false], ["turn/start", undefined], ["thread/read", false], ["thread/read", true]
  ]);
});

test("Codex adapter accepts a final message only after app-server reports an idle Thread", async () => {
  const turnId = "turn-001";
  const bridge = {
    turns: new Map(),
    finalMessages: new Map(),
    request: async (method) => {
      if (method === "turn/start") {
        bridge.finalMessages.set("thread-001", { item: { type: "agentMessage", text: "done" }, completedAt: Date.now() - 1_000 });
        return { turn: { id: turnId } };
      }
      return { thread: { id: "thread-001", status: { type: "idle" }, turns: [] } };
    }
  };
  const result = await promptSessionWithBridge(bridge, { cwd: "/tmp", sessionId: "thread-001", prompt: "reply" });
  assert.equal(result.turn.turn.synthetic, true);
});

test("Codex adapter does not treat an intermediate agent message as terminal", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/dd-codex.mjs", import.meta.url), "utf8");
  assert.match(source, /final && stored\?\.threadStatus === "idle"/);
});

test("Codex adapter interrupts one explicitly identified Turn", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return {}; } };
  const { cancelSessionWithBridge } = await import("../lib/dd-codex.mjs");
  await cancelSessionWithBridge(bridge, { sessionId: "thread-001", turnId: "turn-001" });
  assert.deepEqual(calls, [{ method: "turn/interrupt", params: { threadId: "thread-001", turnId: "turn-001" } }]);
});

test("Codex adapter finds and interrupts the active Turn when only a Session is supplied", async () => {
  const calls = [];
  const bridge = { request: async (method, params) => { calls.push({ method, params }); return method === "thread/read" ? { thread: { turns: [{ id: "turn-done", status: "completed" }, { id: "turn-live", status: "inProgress" }] } } : {}; } };
  const { cancelSessionWithBridge } = await import("../lib/dd-codex.mjs");
  await cancelSessionWithBridge(bridge, { sessionId: "thread-001" });
  assert.deepEqual(calls, [
    { method: "thread/read", params: { threadId: "thread-001", includeTurns: true } },
    { method: "turn/interrupt", params: { threadId: "thread-001", turnId: "turn-live" } }
  ]);
});

test("daemon client fails promptly when a stopped daemon closes an active request", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dd-codex-test-"));
  const socket = path.join(directory, "daemon.sock");
  const server = net.createServer((connection) => connection.once("data", () => connection.destroy()));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  await assert.rejects(() => callDaemon(directory, "session.prompt", {}, 1_000), { code: "daemon_connection_closed" });
  await new Promise((resolve) => server.close(resolve));
});
