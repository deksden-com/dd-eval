import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addSession, loadCase, prepare, sync, validateInput } from "../lib/dd-eval.mjs";

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
    assert.equal(result.executions[0].project_root, path.join(result.output, "executions", "specify", "attempt-01", "project"));
    assert.match(await readFile(path.join(result.output, "executions", "specify", "attempt-01", "prompts", "subject.md"), "utf8"), /оформим протокол/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("case defaults select Luna Subject and Sol Judge, with explicit overrides recorded", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v2-profiles-"));
  try {
    const prepared = await prepare({ caseId, source, output: path.join(root, "default"), stageList: "specify" });
    const manifest = JSON.parse(await readFile(path.join(prepared.output, "manifest.json"), "utf8"));
    assert.equal(manifest.profiles.subject.model, "gpt-5.6-luna");
    assert.equal(manifest.profiles.judge.model, "gpt-5.6-sol");
    assert.equal(manifest.profile_selection.judge.source, "case_default");
    const overridden = await prepare({ caseId, source, output: path.join(root, "override"), stageList: "specify", judgeProfileId: profile });
    const overrideManifest = JSON.parse(await readFile(path.join(overridden.output, "manifest.json"), "utf8"));
    assert.equal(overrideManifest.profiles.judge.model, "gpt-5.6-luna");
    assert.equal(overrideManifest.profile_selection.judge.source, "command_override");
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

test("sync persists the discovered RUN location for checkpointing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v2-sync-"));
  try {
    const prepared = await prepare({ caseId, source, output: path.join(root, "run"), stageList: "specify" });
    const engine = path.join(root, "fake-dd-flow.mjs");
    await writeFile(engine, `#!/usr/bin/env node\nconst args = process.argv.slice(2).join(" ");\nif (args.startsWith("run status")) console.log(JSON.stringify({ run: { run_home_path: "/tmp/run", status: "done" }, index: { stage_runs: [{ stage: "specify", status: "done" }] } }));\nelse console.log(JSON.stringify({}));\n`);
    await chmod(engine, 0o755);
    await sync({ evalRoot: prepared.output, executionId: "specify", projectRoot: path.join(prepared.output, "executions", "specify", "attempt-01", "project"), flowRunId: "run-1", engine });
    const manifest = JSON.parse(await readFile(path.join(prepared.output, "manifest.json"), "utf8"));
    assert.equal(manifest.executions[0].flow_run_id, "run-1");
    assert.equal(manifest.executions[0].run_home, "/tmp/run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
