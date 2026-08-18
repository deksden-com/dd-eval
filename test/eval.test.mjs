import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadCase, prepare, validateInput } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks.beta-vnext-plan-review");
const caseId = "sdlc-eval-2026-summer-task-priority";

test("the active suite uses canonical stage checkpoints", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.definition.schema_id, "dd-eval/case@3");
  assert.deepEqual(Object.keys(loaded.definition.canonical_checkpoints), ["specify", "protocolize", "plan", "plan-review"]);
  const validated = await validateInput({ caseId, source });
  assert.equal(validated.checkpoint.id, "cp-002-vnext-plan-review-beta-58");
});

test("a scored run fails closed until its canonical checkpoint is captured", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v3-"));
  try {
    await assert.rejects(
      prepare({ caseId, source, output: path.join(root, "run"), stageList: "specify" }),
      /canonical checkpoint is not accepted/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
