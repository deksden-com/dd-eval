import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addSession, loadCase, prepare, validateInput } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks.beta-vnext-plan-review");
const caseId = "sdlc-eval-2026-summer-task-priority";
const profile = "codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-8-0-beta-54";

test("the active suite accepts only the v2 case contract", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.definition.schema_id, "dd-eval/case@2");
  const validated = await validateInput({ caseId, source });
  assert.equal(validated.checkpoint.id, "cp-002-vnext-plan-review-beta-54");
});

test("prepare creates a self-contained focused SPECIFY execution", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v2-"));
  try {
    const result = await prepare({
      caseId, source, output: path.join(root, "run"), stageList: "specify",
      controllerProfileId: profile, subjectProfileId: profile, judgeProfileId: profile
    });
    assert.equal(result.executions.length, 1);
    const manifest = JSON.parse(await readFile(path.join(result.output, "manifest.json"), "utf8"));
    const state = JSON.parse(await readFile(path.join(result.output, "state.json"), "utf8"));
    assert.equal(manifest.schema_id, "dd-eval/run-manifest@1");
    assert.deepEqual(manifest.selection, { focused_stages: ["specify"], e2e: false });
    assert.equal(state.executions.specify.status, "prepared");
    assert.match(await readFile(path.join(result.output, "executions", "specify", "attempt-01", "prompts", "subject.md"), "utf8"), /оформим протокол/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session recording is idempotent and remains separate from flow state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v2-session-"));
  try {
    const prepared = await prepare({
      caseId, source, output: path.join(root, "run"), stageList: "specify",
      controllerProfileId: profile, subjectProfileId: profile, judgeProfileId: profile
    });
    const first = await addSession({ evalRoot: prepared.output, executionId: "specify", role: "subject", sessionId: "session-1" });
    const second = await addSession({ evalRoot: prepared.output, executionId: "specify", role: "subject", sessionId: "session-1" });
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
