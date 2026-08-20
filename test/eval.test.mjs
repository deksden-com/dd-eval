import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadCase, prepare, subjectTaskTitle, validateInput } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks.beta-vnext-plan-review");
const caseId = "sdlc-eval-2026-summer-task-priority";

test("the active suite declares its next canonical checkpoint chain", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.definition.schema_id, "dd-eval/case@4");
  assert.deepEqual(loaded.definition.checkpoint, { id: "cp-008-vnext-snapshot-readonly-beta-83" });
  assert.equal("compatibility" in loaded.definition, false);
  assert.deepEqual(Object.keys(loaded.definition.canonical_checkpoints), ["specify", "protocolize", "plan", "plan-review"]);
  const validated = await validateInput({ caseId, source, requireMode: "authoring" });
  assert.equal(validated.checkpoint.id, "cp-008-vnext-snapshot-readonly-beta-83");
  assert.equal(validated.checkpoint.memory_bank.engine.commit, "98100c85822dc5f55cfa547f054ee6cb39dfc067");
});

test("prepare task titles are deterministic and sortable", () => {
  assert.equal(
    subjectTaskTitle({ outputRoot: "/tmp/EVAL-006--case--focus", caseId, executionId: "plan-review", profile: { model: "gpt-5.6-luna", reasoning: "xhigh" } }),
    "E006 · sdlc-eval-2026-summer-task-priority · a01 · luna-xhigh · PLAN-REVIEW · subject"
  );
});

test("a scored run fails closed until its canonical checkpoints are accepted", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v3-"));
  const previousHome = process.env.DD_EVAL_HOME;
  process.env.DD_EVAL_HOME = root;
  try {
    await assert.rejects(
      prepare({ caseId, source, output: path.join(root, "run"), stageList: "specify" }),
      /canonical checkpoint is not accepted/
    );
  } finally {
    if (previousHome === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
