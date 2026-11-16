import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifiedJudgeCleanupRuntime } from "../lib/judge/retained-cleanup.mjs";

test("retained Judge cleanup rejects a runtime without matching ownership", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-judge-owner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const judge = path.join(root, "judge");
  await mkdir(path.join(judge, "daemon"), { recursive: true });
  await writeFile(path.join(judge, "daemon", "daemon.json"), JSON.stringify({ config: { runtime_owner: { role: "judge" } } }));
  await assert.rejects(verifiedJudgeCleanupRuntime({ target: { root: judge, profile: {} }, root, manifest: {}, results: [] }), { code: "judge_cleanup_ownership_unknown" });
});
