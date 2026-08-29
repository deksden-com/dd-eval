import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHistory, historyDigest, usageSnapshot } from "../lib/dd-opencode.mjs";

const messages = [{ info: { id: "u1", role: "user" }, parts: [{ id: "p1", type: "text", text: "hello" }] }, { info: { id: "a1", role: "assistant", providerID: "opencode", modelID: "big-pickle", mode: "build", finish: "stop", cost: 0.01, tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } } }, parts: [{ id: "tool-1", type: "tool", tool: "bash", state: { status: "completed", input: { command: "pwd" }, output: "/tmp" } }, { id: "p2", type: "text", text: "done" }] }];

test("OpenCode canonical history excludes volatile ids", () => {
  const changed = structuredClone(messages); changed[0].info.id = "different"; changed[0].parts[0].id = "different";
  assert.deepEqual(canonicalHistory(changed), canonicalHistory(messages)); assert.equal(historyDigest(changed), historyDigest(messages));
});

test("OpenCode usage includes reasoning, cache and tool calls", () => {
  assert.deepEqual(usageSnapshot(messages), { input_tokens: 10, output_tokens: 5, reasoning_tokens: 2, cached_input_tokens: 3, cache_write_tokens: 1, total_tokens: 21, tool_calls: { total: 1, failures: 0, by_tool: { bash: 1 } }, cost_usd: 0.01 });
});
