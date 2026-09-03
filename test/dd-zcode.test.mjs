import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertProfile, cancelChildWithBridge, createSession, forkSession, latestAssistantText, observedProfile, promptProbeBatchWithBridge, promptSession, zcodeLifecycleEnvelope } from "../lib/dd-zcode.mjs";
import { callDaemon } from "../lib/dd-zcode-daemon.mjs";

test("ZCode daemon client permits a liveness-owned prompt without a wall-clock timer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-zcode-daemon-client-"));
  const socket = path.join(root, "daemon.sock");
  const net = await import("node:net");
  const server = net.createServer((client) => {
    client.once("data", (line) => {
      const request = JSON.parse(String(line));
      setTimeout(() => client.end(`${JSON.stringify({ schema_id: "dd-zcode/daemon-response@1", id: request.id, ok: true, result: { completed: true } })}\n`), 25);
    });
  });
  await new Promise((resolve, reject) => server.listen(socket, resolve).once("error", reject));
  try {
    const result = await callDaemon(root, "session.prompt", {}, null);
    assert.deepEqual(result, { completed: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("ZCode observed profiles fail closed on drift", () => {
  const observed = observedProfile({ settings: { model: { current: { providerId: "anthropic", modelId: "GLM-5.3" } }, thoughtLevel: { current: "high" }, mode: { current: "yolo" } } });
  assert.deepEqual(assertProfile({ provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" }, observed), {
    status: "matched",
    requested: { provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" },
    observed
  });
  assert.throws(() => assertProfile({ provider: "anthropic", model: "GLM-5.3", reasoning: "low", mode: "yolo" }, observed), /profile mismatch/);
});

test("ZCode probe output uses the final visible assistant message", () => {
  assert.equal(latestAssistantText({ messages: [
    { info: { role: "user" }, parts: [{ type: "text", text: "probe" }] },
    { info: { role: "assistant" }, parts: [{ type: "reasoning", text: "wait" }, { type: "text", text: "AGENT-07" }] },
  ] }), "AGENT-07");
  assert.equal(latestAssistantText({ messages: [] }), null);
});

test("ZCode probe batch starts all prepared Sessions before reading a result", async () => {
  const started = [];
  let release;
  const bothStarted = new Promise((resolve) => { release = resolve; });
  const bridge = {
    async request(method, params) {
      if (method === "session/prompt") {
        started.push(params.sessionId);
        if (started.length === 2) release();
        await bothStarted;
        return { stopReason: "end_turn" };
      }
      if (method === "zcode/session/read") return { messages: [{ info: { role: "assistant" }, parts: [{ type: "text", text: params.sessionId === "adapter-1" ? "AGENT-01" : "AGENT-02" }] }] };
      throw new Error(`unexpected method ${method}`);
    },
    async flush() {},
  };
  const receipt = await promptProbeBatchWithBridge(bridge, {
    journal: "/tmp/zcode-probe-batch.jsonl",
    probes: [
      { provider_session_id: "provider-1", adapter_session_id: "adapter-1", prompt: "first" },
      { provider_session_id: "provider-2", adapter_session_id: "adapter-2", prompt: "second" },
    ],
  });
  assert.deepEqual(started, ["adapter-1", "adapter-2"]);
  assert.deepEqual(receipt.results.map((item) => item.assistant_text), ["AGENT-01", "AGENT-02"]);
});

test("ZCode probe batch reserves time to read results after a Turn deadline", async () => {
  const timeouts = [];
  const bridge = {
    async request(method, params, timeout) {
      if (method === "session/prompt") {
        timeouts.push(timeout);
        return { stopReason: "end_turn" };
      }
      if (method === "zcode/session/read") {
        timeouts.push(timeout);
        return { messages: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "AGENT-01" }] }] };
      }
      throw new Error(`unexpected method ${method}`);
    },
    async flush() {},
  };
  const receipt = await promptProbeBatchWithBridge(bridge, {
    journal: "/tmp/zcode-probe-deadline.jsonl",
    timeoutMs: 180_000,
    probes: [{ provider_session_id: "provider-1", adapter_session_id: "adapter-1", prompt: "probe" }],
  });
  assert.equal(receipt.results[0].assistant_text, "AGENT-01");
  assert.equal(timeouts[0], 165_000);
  assert.equal(timeouts[1], 15_000);
});

test("dd-zcode controls create, prompt and fork through ACP with an append-only journal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-zcode-test-"));
  try {
    const server = path.join(root, "fake-acp.mjs");
    const journal = path.join(root, "evidence", "journal.jsonl");
    await writeFile(server, `
      import readline from "node:readline";
      let profile = { provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
      let running = false; let toolCall = 0;
      const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
      readline.createInterface({ input: process.stdin }).on("line", (line) => {
        const message = JSON.parse(line); if (message.id === undefined) return;
        const { id, method, params = {} } = message; let result = {};
        if (method === "initialize") result = { protocolVersion: 1 };
        else if (method === "session/new") result = { sessionId: "adapter-1" };
        else if (method === "zcode/session/resolve") result = { adapterSessionId: params.sessionId, providerSessionId: "native-root" };
        else if (method === "session/set_mode") profile.mode = params.modeId;
        else if (method === "session/setThoughtLevel") profile.reasoning = params.thoughtLevel;
        else if (method === "session/setModel") [profile.provider, profile.model] = params.modelId.split("\\\\");
        else if (method === "zcode/session/read") result = { settings: { model: { current: { providerId: profile.provider, modelId: profile.model } }, thoughtLevel: { current: profile.reasoning }, mode: { current: profile.mode } } };
        else if (method === "zcode/session/subagents") result = running ? { running: [{ agentId: "agent-bg" }], completed: [] } : { running: [], completed: [] };
        else if (method === "session/cancelBackgroundTask") { running = false; result = { cancelled: true }; }
        else if (method === "zcode/session/usage") result = { inputTokens: 12, outputTokens: 3 };
        else if (method === "session/prompt") {
          if (params.prompt?.[0]?.text === "silent") return;
          if (params.prompt?.[0]?.text === "background") running = true;
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "tool_call", toolCallId: "call-" + ++toolCall, title: "Bash: true", rawInput: { command: "true" }, _meta: { claudeCode: { toolName: "Bash" } } } } });
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } } } });
          result = { stopReason: "end_turn" };
        }
        else if (method === "session/fork") result = { forkedSessionId: "native-fork" };
        send({ jsonrpc: "2.0", id, result });
      });
    `);
    const common = { bin: server, cwd: root, journal, provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
    const created = await createSession(common);
    assert.equal(created.provider_session_id, "native-root");
    assert.deepEqual(created.evidence.tool_calls, { total: 0, failures: 0, by_tool: {} });
    assert.equal(created.evidence.read.projection, null);
    const notifications = [];
    const prompted = await promptSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", prompt: "work", onNotification: (event) => notifications.push(event) });
    assert.equal(prompted.turn.stopReason, "end_turn");
    assert.equal(notifications.length, 2);
    assert.deepEqual(prompted.evidence.tool_calls, { total: 1, failures: 0, by_tool: { Bash: 1 } });
    await assert.rejects(
      () => promptSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", prompt: "background" }),
      /background ZCode subagents cannot outlive/
    );
    await assert.rejects(
      () => promptSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", prompt: "silent", livenessTimeoutMs: 20 }),
      (error) => error.code === "subject_liveness_timeout"
    );
    const forked = await forkSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", target: { kind: "latestCheckpoint" } });
    assert.equal(forked.provider_session_id, "native-fork");
    const lines = (await readFile(journal, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(lines.length > 10);
    assert.ok(lines.every((line) => Number.isInteger(line.order) && line.order > 0 && typeof line.kind === "string"));
    assert.ok(lines.some((line) => line.kind === "outbound" && line.payload?.method === "session/set_mode" && line.payload.params?.sessionId === "adapter-1"));
  } catch (error) {
    try { error.message += `\n${await readFile(journal, "utf8")}`; } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lifecycle envelopes carry the verified ZCode profile and daemon identity", () => {
  assert.deepEqual(zcodeLifecycleEnvelope({ method: "session/update" }, { provider: "builtin:zai-coding-plan", model: "GLM-5.3", reasoning: "high", mode: "yolo", daemonId: "daemon-1" }, "native-root")._meta.ddZcode, {
    rootProviderSessionId: "native-root",
    observedProfile: { provider: "builtin:zai-coding-plan", model: "GLM-5.3", reasoning: "high", mode: "yolo" },
    daemonId: "daemon-1"
  });
});

test("child cancellation leaves the parent turn untouched", async () => {
  let polls = 0;
  const calls = [];
  const bridge = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "zcode/session/resolve") return { providerSessionId: "root" };
      if (method === "zcode/session/subagents") {
        polls += 1;
        return polls === 1 ? { running: [{ childSessionId: "child-1", agentId: "agent-1" }] } : { running: [] };
      }
      if (method === "session/cancelBackgroundTask") return { cancelled: true };
      throw new Error(`unexpected ${method}`);
    },
  };
  const result = await cancelChildWithBridge(bridge, {
    journal: "/tmp/dd-zcode-child-cancel-test.jsonl", cwd: "/tmp", sessionId: "root", adapterSessionId: "root",
    childSessionId: "child-1", liveSession: true,
  });
  assert.equal(result.child_session_id, "child-1");
  assert.ok(calls.some((call) => call.method === "session/cancelBackgroundTask" && call.params.taskId === "agent-1"));
  assert.ok(!calls.some((call) => call.method === "session/cancel"));
});
