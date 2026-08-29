import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addSession, checkpointForHarness, comparePrepare, efficiency, judgeResultInstructions, judgeResultPath, judgeResultTemplate, loadCase, prepare, profileMatches, scoreEvaluation, subjectContinuation, subjectSeedMode, subjectTaskTitle, syncLifecycleStatus, validateInput } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks");
const caseId = "sdlc-eval-2026-summer-task-priority";

test("the active suite declares its next canonical checkpoint chain", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.definition.schema_id, "dd-eval/case@5");
  assert.equal(loaded.assessment.schema_id, "dd-eval/assessment@1");
  const checkpoint = JSON.parse(await readFile(path.join(import.meta.dirname, "..", "checkpoints", `${loaded.definition.checkpoint.id}.json`), "utf8"));
  assert.equal(checkpoint.id, loaded.definition.checkpoint.id);
  assert.equal(loaded.definition.e2e.stop_boundary, "code_review_completed");
  assert.equal("compatibility" in loaded.definition, false);
  assert.deepEqual(Object.keys(loaded.definition.canonical_checkpoints), ["specify", "protocolize", "plan", "plan-review", "code", "code-review"]);
  const validated = await validateInput({ caseId, source, requireMode: "authoring" });
  assert.equal(validated.checkpoint.id, checkpoint.id);
  assert.equal(validated.checkpoint.memory_bank.engine.commit, checkpoint.memory_bank.engine.commit);
  assert.equal(loaded.definition.status, "authoring");
  assert.ok(loaded.definition.profiles.subject.includes("zcode-acp-zai-glm-5-3-flash-high"));
  assert.equal(loaded.definition.priming.subject_baselines["zcode-acp-zai-glm-5-3-flash-high"], "baselines/subject-zcode-acp-zai-glm-5-3-flash-high-rev061.json");
});

test("every registered starter belongs to the declared stage chain", async () => {
  const loaded = await loadCase(caseId);
  const registry = JSON.parse(await readFile(path.join(import.meta.dirname, "..", "cases", caseId, "starter-sessions.json"), "utf8"));
  assert.equal(registry.schema_id, "dd-eval/starter-sessions@3");
  for (const [stage, session] of Object.entries(registry.sessions)) {
    assert.ok(stage in loaded.definition.canonical_checkpoints, `starter stage is not declared: ${stage}`);
    assert.match(session.session_id, /^[0-9a-f-]{36}$/);
    assert.match(session.parent_session_id, /^[0-9a-f-]{36}$/);
    for (const [harness, alternate] of Object.entries(session.by_harness ?? {})) {
      assert.ok(["zcode-acp", "grok-acp"].includes(harness));
      assert.equal(alternate.harness, harness);
      assert.ok(alternate.session_id);
      assert.ok(alternate.parent_session_id);
    }
  }
});

test("the accepted ZCode baseline records native identity, exact profile and immutable evidence", async () => {
  const loaded = await loadCase(caseId);
  const relative = loaded.definition.priming.subject_baselines["zcode-acp-zai-glm-5-3-flash-high"];
  const baseline = JSON.parse(await readFile(path.join(loaded.caseDir, relative), "utf8"));
  assert.equal(baseline.status, "accepted");
  assert.equal(baseline.harness, "zcode-acp");
  assert.match(baseline.session_id, /^sess_/);
  assert.ok(baseline.adapter_session_id);
  assert.deepEqual(baseline.observed_profile, {
    provider: "builtin:zai-coding-plan", model: "GLM-5.3-Flash", reasoning: "high", mode: "yolo"
  });
  assert.equal(baseline.acceptance.evidence.workspace_clean, true);
  assert.equal(baseline.acceptance.evidence.session_idle, true);
  assert.equal(baseline.acceptance.evidence.child_sessions, 0);
});

test("prepare task titles are deterministic and sortable", () => {
  assert.equal(
    subjectTaskTitle({ outputRoot: "/tmp/EVAL-006--case--focus", caseId, executionId: "plan-review", profile: { model: "gpt-5.6-luna", reasoning: "xhigh" } }),
    "E006 · sdlc-eval-2026-summer-task-priority · a01 · luna-xhigh · PLAN-REVIEW · subject"
  );
});

test("Judge packet has one deterministic write-only result destination", () => {
  const result = judgeResultPath("/eval/run", "specify", 1, 2);
  assert.equal(result, "/eval/run/judge/specify/candidate-01/judge-02.result.json");
  assert.match(judgeResultInstructions(result), /only artifact you may create or modify/);
  assert.match(judgeResultInstructions(result), /judge-02\.result\.json/);
  assert.match(judgeResultInstructions(result), /exact lowercase scope/);
  assert.match(judgeResultInstructions(result), /lowercase kebab-case/);
});

test("Judge template mirrors the runtime result contract", async () => {
  const loaded = await loadCase(caseId);
  const value = judgeResultTemplate("specify", loaded.assessment.scopes.specify);
  assert.deepEqual(value.outcome.map((item) => item.id), loaded.assessment.scopes.specify.outcome.map((item) => item.id));
  assert.deepEqual(value.flow.map((item) => item.id), loaded.assessment.scopes.specify.flow.map((item) => item.id));
  assert.deepEqual(Object.keys(value.golden), ["covered", "missed", "alternatives", "novel"]);
});

test("Session registration rejects placeholder IDs before touching eval state", async () => {
  await assert.rejects(
    addSession({ evalRoot: "/missing", executionId: "specify", role: "subject", sessionId: "undefined" }),
    /real provider Session ID/
  );
});

test("a feature-worktree prompt separates the workspace from stable project identity", () => {
  const prompt = subjectContinuation({
    stage: "plan", projectRoot: "/eval/project", workspaceRoot: "/eval/workspace", ddFlowHome: "/eval/dd-flow-home", flowRunId: "RUN-001", packet: "packet"
  });
  assert.match(prompt, /Рабочий каталог восстановленной стадии: \/eval\/workspace/);
  assert.match(prompt, /--project-root '\/eval\/project'/);
  assert.match(prompt, /не заменяй его рабочим каталогом/);
  assert.match(prompt, /Controller сначала синхронизирует/);
});

test("a scored run fails closed when its canonical runtime snapshots are absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-v3-"));
  const previousHome = process.env.DD_EVAL_HOME;
  process.env.DD_EVAL_HOME = root;
  try {
    await assert.rejects(
      prepare({ caseId, source, output: path.join(root, "attempts", "active", "run"), stageList: "specify" }),
      /(case is not ready|canonical checkpoint is not accepted|runtime snapshot is missing)/
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

test("efficiency reports only the focused stage or selected segment", () => {
  const flow = { usage: { totals: { total_tokens: 42 }, sessions: [{ session_id: "focused" }], scope: { kind: "stage", stage: "code" } }, status: { index: { stage_runs: [
    { stage: "specify", started_at: "2026-01-01T00:00:00.000Z", completed_at: "2026-01-01T00:01:00.000Z" },
    { stage: "plan", started_at: "2026-01-01T00:02:00.000Z", completed_at: "2026-01-01T00:05:00.000Z" },
    { stage: "plan-review", started_at: "2026-01-01T00:05:00.000Z", completed_at: "2026-01-01T00:07:00.000Z" },
    { stage: "code", started_at: "2026-01-01T00:10:00.000Z", completed_at: "2026-01-01T00:20:00.000Z" }
  ] } } };
  assert.equal(efficiency(flow, "code").active_stage_ms, 600_000);
  assert.equal(efficiency(flow, "code").elapsed_ms, 600_000);
  assert.equal(efficiency(flow, "plan+plan-review").active_stage_ms, 300_000);
  assert.equal(efficiency(flow, "plan+plan-review").elapsed_ms, 300_000);
});

test("sync recognizes the current paused RUN status as a user wait", () => {
  assert.equal(syncLifecycleStatus({ profileStatus: "matched", stageStatus: "paused", runStatus: "paused" }), "waiting_for_user");
  assert.equal(syncLifecycleStatus({ profileStatus: "matched", stageStatus: null, runStatus: "waiting_for_user" }), "waiting_for_user");
  assert.equal(syncLifecycleStatus({ profileStatus: "matched", stageStatus: "done", runStatus: "completed" }), "candidate_ready");
});

test("ZCode root and child profile evidence matches without a Codex transcript", () => {
  const expected = { harness: "zcode-acp", provider: "builtin:zai-coding-plan", model: "GLM-5.3-Flash", reasoning: "high", mode: "yolo" };
  assert.equal(profileMatches(expected, { provider: expected.provider, model: expected.model, reasoning: expected.reasoning, mode: expected.mode }, "zcode-acp"), true);
  assert.equal(profileMatches(expected, { provider: expected.provider, model: expected.model, reasoning: "low", mode: expected.mode }, "zcode-acp"), false);
});

test("a read-only ZCode starter replays the restored entry instead of claiming a native fork", () => {
  assert.equal(subjectSeedMode({ harness: "zcode-acp", kind: "plan", starter: { seed_mode: "deterministic_replay" } }), "deterministic_replay");
  assert.equal(subjectSeedMode({ harness: "zcode-acp", kind: "plan", starter: {} }), "shared_stage_starter");
  assert.equal(subjectSeedMode({ harness: "zcode-acp", kind: "e2e" }), "clean_session");
});

test("a harness checkpoint keeps its own Session and runtime snapshot together", () => {
  const checkpoint = {
    stage: "plan",
    subject: { checkpoint_session_id: "codex-session" },
    runtime_snapshot: { locator: "canonical/codex" },
    subject_by_harness: { "zcode-acp": { checkpoint_session_id: "zcode-session" } },
    harness_evidence: { "zcode-acp": { runtime_snapshot: { locator: "canonical/zcode" } } }
  };
  const selected = checkpointForHarness(checkpoint, "zcode-acp");
  assert.equal(selected.subject.checkpoint_session_id, "zcode-session");
  assert.equal(selected.runtime_snapshot.locator, "canonical/zcode");
});

test("a primary ZCode canonical checkpoint is usable without a Codex extension", () => {
  const checkpoint = {
    harness: "zcode-acp",
    stage: "specify",
    subject: { checkpoint_session_id: "zcode-session" },
    runtime_snapshot: { locator: "canonical/zcode" }
  };
  const selected = checkpointForHarness(checkpoint, "zcode-acp");
  assert.equal(selected.subject.checkpoint_session_id, "zcode-session");
  assert.equal(selected.runtime_snapshot.locator, "canonical/zcode");
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
