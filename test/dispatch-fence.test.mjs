import test from "node:test";
import assert from "node:assert/strict";
import { captureDispatchGuard, cancelPendingDispatch } from "../lib/dispatch-fence.mjs";
import { promptSessionWithBridge } from "../lib/dd-codex.mjs";

test("cancel during native preparation fences dispatch, preserves foreign owners and permits explicit resume", async () => {
  const owner = {}, other = {};
  const guard = captureDispatchGuard(owner), foreign = captureDispatchGuard(other);
  let release;
  const prepared = new Promise(resolve => { release = resolve; });
  const methods = [];
  const bridge = { request: async method => { methods.push(method); await prepared; return { thread: { status: { type: "idle" } } }; } };
  const pending = promptSessionWithBridge(bridge, { sessionId: "owned", cwd: process.cwd(), prompt: "test", assertDispatch: guard });
  cancelPendingDispatch(owner);
  release();
  await assert.rejects(pending, { code: "operation_cancelled" });
  assert.deepEqual(methods, ["thread/read"]);
  assert.doesNotThrow(foreign);
  assert.doesNotThrow(captureDispatchGuard(owner));
});
