import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanupSidecars } from "../lib/eval-retirement.mjs";
import { sha256, writeJsonAtomic } from "../lib/runner-events.mjs";

test("cleanup status tolerates an unpublished attempt directory without accepting corrupt receipts", async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "cleanup-sidecar090-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "runner-attempts", sha256("pending")), file = path.join(directory, "attempt.json");
  await mkdir(directory, { recursive: true });
  assert.deepEqual(await cleanupSidecars(root), []);
  const saved = { schema_id: "dd-eval/resume-worker@1", intent: { kind: "cleanup", eval_root: root, request_id: "pending" }, status: "requested" };
  await writeJsonAtomic(file, saved);
  assert.deepEqual(await cleanupSidecars(root), [saved]);
  await writeFile(file, "{corrupt");
  await assert.rejects(cleanupSidecars(root), SyntaxError);
});
