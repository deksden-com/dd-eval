import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertProfile, createSession, forkSession, observedProfile, promptSession } from "../lib/dd-zcode.mjs";

test("ZCode observed profiles fail closed on drift", () => {
  const observed = observedProfile({ settings: { model: { current: { providerId: "anthropic", modelId: "GLM-5.3" } }, thoughtLevel: { current: "high" }, mode: { current: "yolo" } } });
  assert.deepEqual(assertProfile({ provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" }, observed), {
    status: "matched",
    requested: { provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" },
    observed
  });
  assert.throws(() => assertProfile({ provider: "anthropic", model: "GLM-5.3", reasoning: "low", mode: "yolo" }, observed), /profile mismatch/);
});

test("dd-zcode controls create, prompt and fork through ACP with an append-only journal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-zcode-test-"));
  try {
    const server = path.join(root, "fake-acp.mjs");
    const journal = path.join(root, "evidence", "journal.jsonl");
    await writeFile(server, `
      import readline from "node:readline";
      let profile = { provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
      let running = false;
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
        else if (method === "session/prompt") { if (params.prompt?.[0]?.text === "background") running = true; send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } } } }); result = { stopReason: "end_turn" }; }
        else if (method === "session/fork") result = { forkedSessionId: "native-fork" };
        send({ jsonrpc: "2.0", id, result });
      });
    `);
    const common = { bin: server, cwd: root, journal, prompt: "prime", provider: "anthropic", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
    const created = await createSession(common);
    assert.equal(created.provider_session_id, "native-root");
    const notifications = [];
    const prompted = await promptSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", prompt: "work", onNotification: (event) => notifications.push(event) });
    assert.equal(prompted.turn.stopReason, "end_turn");
    assert.equal(notifications.length, 1);
    await assert.rejects(
      () => promptSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", prompt: "background" }),
      /background ZCode subagents cannot outlive/
    );
    const forked = await forkSession({ ...common, sessionId: "native-root", adapterSessionId: "adapter-1", target: { kind: "latestCheckpoint" } });
    assert.equal(forked.provider_session_id, "native-fork");
    const lines = (await readFile(journal, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(lines.length > 10);
    assert.ok(lines.every((line) => Number.isInteger(line.order) && line.order > 0 && typeof line.kind === "string"));
    assert.ok(lines.some((line) => line.kind === "outbound" && line.payload?.method === "session/set_mode" && line.payload.params?.sessionId === "adapter-1"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
