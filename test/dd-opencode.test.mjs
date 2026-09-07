import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { canonicalHistory, historyDigest, usageSnapshot, OpenCodeClient } from "../lib/dd-opencode.mjs";

test("OpenCode waits for active child content but unchanged polls expire", async t => {
  let active = true, sequence = 0;
  const timers = new Set();
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST") { const timer = setTimeout(() => { timers.delete(timer); res.end(JSON.stringify({ info: { id: "current", role: "assistant", sessionID: "root" }, parts: [] })); }, 2_500); timers.add(timer); }
    else if (req.url.includes("/children")) res.end(req.url.includes("/root/") ? '[{"id":"child"}]' : '[]');
    else res.end(JSON.stringify([{ text: req.url.includes("/child/") && active ? String(sequence++) : "unchanged" }]));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { for (const timer of timers) clearTimeout(timer); server.closeAllConnections(); server.close(); });
  const client = new OpenCodeClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, password: "test", timeoutMs: 1_000 });
  assert.equal((await client.prompt("root", { prompt: "test" })).info.id, "current");
  active = false;
  await assert.rejects(client.prompt("root", { prompt: "test" }), error => error.code === "operation_observation_lost");
});

const messages = [{ info: { id: "u1", role: "user" }, parts: [{ id: "p1", type: "text", text: "hello" }] }, { info: { id: "a1", role: "assistant", providerID: "opencode", modelID: "big-pickle", mode: "build", finish: "stop", cost: 0.01, tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } } }, parts: [{ id: "tool-1", type: "tool", tool: "bash", state: { status: "completed", input: { command: "pwd" }, output: "/tmp" } }, { id: "p2", type: "text", text: "done" }] }];

test("OpenCode binds prompt results to new native messages and preserves HTTP-200 provider errors", async () => {
  const client = new OpenCodeClient({ baseUrl: "http://localhost", password: "test" });
  let reply = { info: { id: "new", sessionID: "root", role: "assistant" }, parts: [{ type: "text", text: "current" }] };
  client.messages = async () => [{ info: { id: "old", role: "assistant" }, parts: [] }];
  client.request = async method => method === "POST" ? reply : [];
  assert.equal((await client.prompt("root", { prompt: "test" })).parts[0].text, "current");
  const native = { name: "APIError", data: { message: "balance exhausted", statusCode: 402, isRetryable: false } };
  reply.info.error = native;
  await assert.rejects(client.prompt("root", { prompt: "test" }), error => error.code === "provider_quota_exhausted" && error.details.provider_error === native);
  delete reply.info.error;
  for (const invalid of [{}, { ...reply, info: { ...reply.info, id: "old" } }, { ...reply, info: { ...reply.info, sessionID: "foreign" } }]) {
    reply = invalid;
    await assert.rejects(client.prompt("root", { prompt: "test" }), error => error.code === "operation_observation_lost");
  }
});

test("OpenCode canonical history excludes volatile ids", () => {
  const changed = structuredClone(messages); changed[0].info.id = "different"; changed[0].parts[0].id = "different";
  assert.deepEqual(canonicalHistory(changed), canonicalHistory(messages)); assert.equal(historyDigest(changed), historyDigest(messages));
});

test("OpenCode usage includes reasoning, cache and tool calls", () => {
  assert.deepEqual(usageSnapshot(messages), { input_tokens: 10, output_tokens: 5, reasoning_tokens: 2, cached_input_tokens: 3, cache_write_tokens: 1, total_tokens: 21, tool_calls: { total: 1, failures: 0, by_tool: { bash: 1 } }, cost_usd: 0.01 });
});
