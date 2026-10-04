import assert from "node:assert/strict";
import { mkdtemp, writeFile, appendFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { waitForNativeDispatch } from "../lib/driver-recovery.mjs";

test("cancel qualification requires the exact native dispatch, not another Session or requested intent", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-dispatch-barrier-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = path.join(root, "native.jsonl");
  await writeFile(journal, [
    { kind: "native_dispatch", operation_id: "old", session_id: "root" },
    { kind: "native_dispatch", operation_id: "current", session_id: "other" },
    { kind: "requested", operation_id: "current", session_id: "root" },
  ].map(value => JSON.stringify(value)).join("\n") + "\n");
  const pending = waitForNativeDispatch({ journal, operationId: "current", sessionId: "root", pollMs: 1 });
  const proof = { operation_id: "current", provider_session_id: "root", native_request_id: "turn" };
  await appendFile(journal, JSON.stringify({ kind: "native_dispatch", payload: proof }) + "\n");
  assert.deepEqual(await pending, proof);
});

test("already-settled prompt cannot produce a false live-cancellation PASS", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-dispatch-early-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(waitForNativeDispatch({ journal: path.join(root, "missing"), operationId: "current",
    sessionId: "root", settled: () => true }), { code: "live_cancel_not_exercised" });
});
