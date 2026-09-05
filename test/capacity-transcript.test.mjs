import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { capacityCodexChildren } from "../lib/runner.mjs";

test("capacity reads native leaf completion, not a parent textual claim", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "capacity-transcript-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "sessions"));
  const records = [{ type: "session_meta", payload: { id: "child", parent_thread_id: "root" } }, { type: "event_msg", payload: { type: "task_complete" } }];
  const file = path.join(root, "sessions", "child.jsonl");
  await writeFile(file, records.map(JSON.stringify).join("\n"));
  assert.equal((await capacityCodexChildren(root, "root"))[0].status, "completed");
  records.push({ type: "event_msg", payload: { type: "task_started" } });
  await writeFile(file, records.map(JSON.stringify).join("\n"));
  assert.equal((await capacityCodexChildren(root, "root"))[0].status, "unknown");
});
