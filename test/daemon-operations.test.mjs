import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectDaemonOperation } from "../lib/daemon-operations.mjs";

test("operation inspection exposes productive outcome and settlement independently", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-operation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = "prompt-1", directory = path.join(root, "operations", createHash("sha256").update(id).digest("hex"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "requested.json"), JSON.stringify({ operation_id: id, operation: "session.prompt", session_id: "native" }));
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ state: "completed", result: { provider_session_id: "native", assistant_text: "done" } }));
  await writeFile(path.join(directory, "settlement.json"), JSON.stringify({ state: "pending", reason: "settlement_error" }));
  assert.deepEqual(await inspectDaemonOperation(root, id), {
    operation_id: id, operation: "session.prompt", session_id: "native", state: "completed",
    result: { provider_session_id: "native", assistant_text: "done" }, settlement: { state: "pending", reason: "settlement_error" }
  });
});
