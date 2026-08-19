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
  assert.equal(loaded.definition.schema_id, "dd-eval/case@4");
  assert.deepEqual(loaded.definition.checkpoint, { id: "cp-002-vnext-plan-review-beta-65" });
  assert.equal("compatibility" in loaded.definition, false);
  assert.deepEqual(Object.keys(loaded.definition.canonical_checkpoints), ["specify", "protocolize", "plan", "plan-review"]);
  const validated = await validateInput({ caseId, source, requireMode: "scored" });
  assert.equal(validated.checkpoint.id, "cp-002-vnext-plan-review-beta-65");
  assert.equal(validated.checkpoint.memory_bank.engine.commit, "b277ff50b13bd98378866e673ad95ce8f64e068d");
  assert.equal(validated.starters.sessions.specify.session_id.length > 0, true);
  assert.equal(validated.judgeBaseline.status, "accepted");
  assert.equal(validated.judgeBaseline.role, "judge");
});

test("a scored run fails closed when its accepted snapshot is unavailable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v3-"));
  const previousHome = process.env.DD_EVAL_HOME;
  process.env.DD_EVAL_HOME = root;
  try {
    await assert.rejects(
      prepare({ caseId, source, output: path.join(root, "run"), stageList: "specify" }),
      /runtime snapshot is missing/
    );
  } finally {
    if (previousHome === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
