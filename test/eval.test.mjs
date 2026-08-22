import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { comparePrepare, loadCase, prepare, scoreEvaluation, subjectContinuation, subjectTaskTitle, validateInput } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks.beta-vnext-plan-review");
const caseId = "sdlc-eval-2026-summer-task-priority";

test("the active suite declares its next canonical checkpoint chain", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.definition.schema_id, "dd-eval/case@5");
  assert.equal(loaded.assessment.schema_id, "dd-eval/assessment@1");
  assert.deepEqual(loaded.definition.checkpoint, { id: "cp-011-lossless-executable-plan-beta-85" });
  assert.equal("compatibility" in loaded.definition, false);
  assert.deepEqual(Object.keys(loaded.definition.canonical_checkpoints), ["specify", "protocolize", "plan", "plan-review"]);
  const validated = await validateInput({ caseId, source, requireMode: "authoring" });
  assert.equal(validated.checkpoint.id, "cp-011-lossless-executable-plan-beta-85");
  assert.equal(validated.checkpoint.memory_bank.engine.commit, "0306ac68da9190d6ccfa099a257a5e8b91ef9f69");
});

test("each evaluated Subject profile has its own protected starter set", async () => {
  const loaded = await loadCase(caseId);
  const registry = JSON.parse(await readFile(path.join(import.meta.dirname, "..", "cases", caseId, "starter-sessions.json"), "utf8"));
  assert.equal(registry.schema_id, "dd-eval/starter-sessions@2");
  for (const profile of loaded.definition.profiles.subject) {
    assert.ok(loaded.definition.priming.subject_baselines[profile]);
    assert.deepEqual(Object.keys(registry.subjects[profile].sessions), ["specify", "protocolize", "plan", "plan-review"]);
  }
});

test("prepare task titles are deterministic and sortable", () => {
  assert.equal(
    subjectTaskTitle({ outputRoot: "/tmp/EVAL-006--case--focus", caseId, executionId: "plan-review", profile: { model: "gpt-5.6-luna", reasoning: "xhigh" } }),
    "E006 · sdlc-eval-2026-summer-task-priority · a01 · luna-xhigh · PLAN-REVIEW · subject"
  );
});

test("a feature-worktree prompt separates the workspace from stable project identity", () => {
  const prompt = subjectContinuation({
    stage: "plan", projectRoot: "/eval/project", workspaceRoot: "/eval/workspace", ddFlowHome: "/eval/dd-flow-home", flowRunId: "RUN-001", packet: "packet", focused: true
  });
  assert.match(prompt, /Рабочий каталог восстановленной стадии: \/eval\/workspace/);
  assert.match(prompt, /--project-root '\/eval\/project'/);
  assert.match(prompt, /не заменяй его рабочим каталогом/);
});

test("a scored run fails closed when its canonical runtime snapshots are absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v3-"));
  const previousHome = process.env.DD_EVAL_HOME;
  process.env.DD_EVAL_HOME = root;
  try {
    await assert.rejects(
      prepare({ caseId, source, output: path.join(root, "run"), stageList: "specify" }),
      /(canonical checkpoint is not accepted|runtime snapshot is missing)/
    );
  } finally {
    if (previousHome === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});

test("outcome gates stay independent from flow and efficiency", async () => {
  const loaded = await loadCase(caseId);
  const assessment = loaded.assessment.scopes.specify;
  const result = scoreEvaluation({
    run_validity: "valid",
    outcome: assessment.outcome.map((criterion) => ({ id: criterion.id, score: criterion.id === "gaps" ? 2 : 4 })),
    flow: assessment.flow.map((criterion) => ({ id: criterion.id, score: 4 })),
    findings: []
  }, assessment);
  assert.equal(result.outcome.verdict, "fail");
  assert.equal(result.flow.score, 1);
});

test("Grand Judge preparation anonymizes completed eval roots", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dd-eval-comparison-"));
  const previousHome = process.env.DD_EVAL_HOME;
  process.env.DD_EVAL_HOME = home;
  try {
    const roots = ["one", "two"].map((name) => path.join(home, name));
    for (const root of roots) {
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, "report.json"), JSON.stringify({ schema_id: "dd-eval/report@2", run_id: path.basename(root), case_id: caseId, methodology: {}, executions: [] }));
      await writeFile(path.join(root, "manifest.json"), JSON.stringify({ schema_id: "dd-eval/run-manifest@1" }));
    }
    const prepared = await comparePrepare({ evalRoots: roots.join(","), output: path.join(home, "comparison") });
    assert.deepEqual(prepared.candidates, ["A", "B"]);
  } finally {
    if (previousHome === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});
