import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepare } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks");

test("prepare creates the same isolated input twice", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-"));
  try {
    const first = await prepare({ caseId: "EVAL-001-task-priority", source, output: path.join(root, "one") });
    const second = await prepare({ caseId: "EVAL-001-task-priority", source, output: path.join(root, "two") });
    assert.equal(first.inputTree, second.inputTree);
    assert.equal(first.inputCommit, second.inputCommit);
    const manifest = JSON.parse(await readFile(first.runManifest, "utf8"));
    assert.equal(manifest.checkpoint_id, "cp-002");
    assert.equal(manifest.input.tree, manifest.source.tree);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepare refuses a fabricated implementation predecessor state", async () => {
  await assert.rejects(
    prepare({
      caseId: "EVAL-001-task-priority",
      track: "implementation",
      source,
      output: path.join(tmpdir(), "dd-eval-must-not-exist")
    }),
    /not materializable yet/
  );
});
