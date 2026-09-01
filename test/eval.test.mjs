import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { canonicalBuild, capacityProbePrompt, committedDefinitionIdentity, driverProfileArgs, driverRuntimeArgs, entryLauncher, evalRun, fanoutSettledFingerprint, fanoutWorkerPrompt, fanoutWorkerRecoveryPrompt, fanoutWorkerTerminalState, fixturesValidate, isInfrastructureFailure, loadCaseV6, loadRunProfile, qualificationSucceeded, resultCheckpointMode, stageSessionMode, workerUsageSource } from "../lib/runner.mjs";

const caseId = "sdlc-eval-2026-summer-task-priority";
const root = path.resolve(import.meta.dirname, "..");
const buildProfile = path.join(root, "cases", caseId, "run-profiles", "build-entry-pack-reference-terra-high.json");
const qualificationProfile = path.join(root, "cases", caseId, "run-profiles", "qualify-entry-pack-terra-high.json");
const run = promisify(execFile);

test("active case exposes its accepted portable entry pack without Session starter state", async () => {
  const loaded = await loadCaseV6(caseId);
  assert.equal(loaded.value.schema_id, "dd-eval/case@6");
  assert.equal(loaded.value.status, "runnable");
  assert.match(loaded.value.entry_pack, /^stage-entries\/REV-117\/entry-pack\.json$/);
  assert.equal("starter_sessions" in loaded.value, false);
  assert.equal("canonical_checkpoints" in loaded.value, false);
  assert.equal("priming" in loaded.value, false);
  assert.equal(loaded.inputCheckpoint.value.id, "cp-048-task-priority-code-review-check-handoff");
  assert.equal(loaded.inputCheckpoint.value.source.commit, "403d8dfc9fccbc590aaf3b903fd97f45c3800f51");
  assert.equal(loaded.inputCheckpoint.value.flow_pack.commit, "403d8dfc9fccbc590aaf3b903fd97f45c3800f51");
  assert.deepEqual(loaded.value.flow.contour, ["specify", "protocolize", "plan", "plan-review", "code", "code-review", "merge"]);
});

test("fixture validation fails closed when an active pack predates the case contour", async () => {
  await assert.rejects(fixturesValidate({ caseId }), (error) => error?.code === "entry_pack_flow_mismatch");
  await assert.rejects(fixturesValidate({ caseId, revision: "REV-001" }), /not found|Invalid JSON/);
});

test("run profiles are explicit experiments rather than harness defaults", async () => {
  const reference = await loadRunProfile(buildProfile); const qualification = await loadRunProfile(qualificationProfile);
  assert.equal(reference.value.selection.e2e, false);
  assert.deepEqual(reference.value.selection.focused_stages, []);
  assert.equal(qualification.value.selection.focused_stages.length, 7);
  assert.equal(qualification.value.selection.e2e, false);
  assert.equal(reference.value.subject.profile_id, "codex-desktop-gpt-5-6-sol-high-dd-flow-main-86e4eba");
  assert.equal(qualification.value.subject.profile_id, "codex-desktop-gpt-5-6-terra-high-dd-flow-main-86e4eba");
});

test("ZCode diagnostics expose one focused profile for every flow stage", async () => {
  for (const stage of ["specify", "protocolize", "plan", "plan-review", "code", "code-review"]) {
    const profile = await loadRunProfile(path.join(root, "cases", caseId, "run-profiles", `diagnose-${stage}-zcode-glm-5-3-high.json`));
    assert.deepEqual(profile.value.selection, { focused_stages: [stage], segment: null, e2e: false, repetitions: 1 });
    assert.equal(profile.value.subject.profile_id, "zcode-acp-zai-glm-5-3-high");
  }
});

test("driver invocations preserve every declared harness profile field", () => {
  const profile = { harness: "zcode-acp", provider: "builtin:zai-coding-plan", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
  assert.deepEqual(driverProfileArgs(profile, ["session", "create", "--cwd", "/tmp"]), ["session", "create", "--cwd", "/tmp", "--provider", "builtin:zai-coding-plan", "--model", "GLM-5.3", "--reasoning", "high", "--mode", "yolo"]);
  assert.deepEqual(driverProfileArgs(profile, ["daemon", "start"]), ["daemon", "start"]);
  assert.deepEqual(driverProfileArgs(profile, ["session", "create", "--provider", "override"]), ["session", "create", "--provider", "override", "--model", "GLM-5.3", "--reasoning", "high", "--mode", "yolo"]);
});

test("execution daemon receives its explicit flow runtime contract", async () => {
  const prior = process.env.DD_FLOW_BIN; process.env.DD_FLOW_BIN = "/bin/false";
  try {
    const args = await driverRuntimeArgs(["daemon", "start", "--state-dir", "/tmp/daemon"], { cwd: "/tmp/project", env: { DD_FLOW_HOME: "/tmp/flow", DD_FLOW_BIN: "/bin/echo" } });
    assert.deepEqual(args, ["daemon", "start", "--state-dir", "/tmp/daemon", "--dd-flow-bin", "/bin/echo", "--dd-flow-home", "/tmp/flow", "--project-root", "/tmp/project"]);
    assert.deepEqual(await driverRuntimeArgs(["daemon", "stop"], { cwd: "/tmp/project", env: { DD_FLOW_HOME: "/tmp/flow" } }), ["daemon", "stop"]);
  } finally { if (prior === undefined) delete process.env.DD_FLOW_BIN; else process.env.DD_FLOW_BIN = prior; }
});

test("qualification cannot pass while any execution failed", () => {
  assert.equal(qualificationSucceeded({ state: "completed", executions: [{ state: "candidate_ready" }] }), true);
  assert.equal(qualificationSucceeded({ state: "completed_with_failures", executions: [{ state: "failed" }] }), false);
  assert.equal(qualificationSucceeded({ state: "completed", executions: [{ state: "failed" }] }), false);
});

test("focused result checkpoints preserve a legal successor entry", () => {
  assert.deepEqual(resultCheckpointMode("plan-review"), { purpose: "stage_entry", stage_entry: "code" });
  assert.deepEqual(resultCheckpointMode("code"), { purpose: "stage_entry", stage_entry: "code-review" });
  assert.deepEqual(resultCheckpointMode("code-review"), { purpose: "stage_entry", stage_entry: "merge" });
  assert.deepEqual(resultCheckpointMode("merge"), { purpose: "candidate", stage_entry: null });
});

test("resume reuses an in-flight immutable snapshot instead of treating it as a conflict", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /snapshot output already exists/i);
  assert.match(source, /await waitForFile\(manifestFile\)/);
});

test("successor Session mode reads the persisted execution profile from run status", () => {
  assert.equal(stageSessionMode({ status: { index: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } }), "new_session");
  assert.equal(stageSessionMode({ status: { run: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } }), "new_session");
  assert.equal(stageSessionMode({ status: { index: {} } }), "same_session");
});

test("new-session handoff is a flow invariant rather than an eval-profile option", () => {
  const lifecycle = { status: { index: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } };
  assert.equal(stageSessionMode(lifecycle), "new_session");
  assert.notEqual(stageSessionMode(lifecycle), "same_session");
});

test("E2E handoff keeps the current Subject Session replaceable", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /let sessionId = created\.provider_session_id/);
  assert.match(source, /sessionId = successorSessionId/);
});

test("stage launcher makes registered HITL pause the only way to ask a material question", () => {
  const launcher = entryLauncher({ stage: "specify", entry: { snapshot: { run_id: null } }, projectRoot: "/project", runtimeRoot: "/runtime", contextFile: "/context.json", contextSha256: "a".repeat(64), profile: {} });
  assert.match(launcher, /"\/runtime\/bin\/dd-flow" stage start/);
  assert.match(launcher, /run the exact `stage pause` lifecycle command/);
  assert.match(launcher, /Otherwise finish this Stage/);
});

test("fan-out workers cannot create nested HITL and zero capacity is infrastructure", () => {
  const prompt = fanoutWorkerPrompt({ workId: "WRK-001", startCommand: "dd-flow work start WRK-001 --json" });
  assert.match(prompt, /cannot ask the user or pause the parent Stage/);
  assert.equal(isInfrastructureFailure("no_subagent_capacity"), true);
});

test("capacity probe has an exact, disposable agent contract", () => {
  const prompt = capacityProbePrompt(7, 60);
  assert.match(prompt, /AGENT-07/);
  assert.match(prompt, /Do not call tools, read files, create children, or explain/);
  assert.match(prompt, /Wait exactly 60 seconds/);
  assert.match(prompt, /return exactly AGENT-07/);
});

test("ACP worker usage relies on the adapter's native usage ingestion", () => {
  assert.equal(workerUsageSource({ harness: "zcode-acp" }), "adapter_ingested");
  assert.equal(workerUsageSource({ harness: "codex-desktop" }), "session_sync");
});

test("fan-out worker recovery resumes the same Work after an unaccepted finish", () => {
  const prompt = fanoutWorkerRecoveryPrompt({ workId: "WRK-001" });
  assert.match(prompt, /still running/);
  assert.match(prompt, /failed check receipt/);
  assert.match(prompt, /Do not create another Work/);
});

test("fan-out recovery is reserved for a still-running Work", () => {
  const shouldRecover = (status) => status === "running";
  assert.equal(shouldRecover("running"), true);
  assert.equal(shouldRecover("failed"), false);
  assert.equal(shouldRecover("completed"), false);
});

test("fan-out distinguishes an explicit Work failure from a missing lifecycle finish", () => {
  assert.equal(fanoutWorkerTerminalState("completed"), "accepted");
  assert.equal(fanoutWorkerTerminalState("failed"), "settled_failure");
  assert.equal(fanoutWorkerTerminalState("cancelled"), "settled_failure");
  assert.equal(fanoutWorkerTerminalState("running"), "incomplete");
});

test("settled fan-out fingerprint changes when a repair Work changes the graph", () => {
  const before = fanoutSettledFingerprint({ stage: "code-review", status: { orchestration: { parent_work_id: "WRK-001", works: { created: 0, running: 0, completed: 5, failed: 0, cancelled: 0, ready: [] } } } });
  const after = fanoutSettledFingerprint({ stage: "code-review", status: { orchestration: { parent_work_id: "WRK-001", works: { created: 0, running: 0, completed: 6, failed: 0, cancelled: 0, ready: [] } } } });
  assert.notEqual(before, after);
  assert.equal(before, fanoutSettledFingerprint({ stage: "code-review", status: { orchestration: { parent_work_id: "WRK-001", works: { created: 0, running: 0, completed: 5, failed: 0, cancelled: 0, ready: [] } } } }));
});

test("scored run refuses an uncommitted eval definition before creating a provider Session", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "dd-eval-definition-"));
  try {
    await run("git", ["init", "--initial-branch=main", repository]);
    await run("git", ["-C", repository, "-c", "user.email=eval@example.invalid", "-c", "user.name=Eval", "commit", "--allow-empty", "-m", "initial"]);
    await writeFile(path.join(repository, "dirty"), "dirty\n");
    await assert.rejects(committedDefinitionIdentity(repository), /clean committed dd-eval definition tree/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("canonical build requires an explicit source project before it can capture the bootstrap boundary", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dd-eval-canonical-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    await assert.rejects(canonicalBuild({ profileFile: buildProfile }), /requires an existing absolute --project-root/);
  } finally {
    if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior;
    await rm(home, { recursive: true, force: true });
  }
});

test("canonical build rejects a feature checkout before it captures a bootstrap snapshot", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "dd-eval-source-"));
  try {
    await run("git", ["init", "--initial-branch=main", project]);
    await run("git", ["-C", project, "-c", "user.email=eval@example.invalid", "-c", "user.name=Eval", "commit", "--allow-empty", "-m", "initial"]);
    await run("git", ["-C", project, "checkout", "-b", "feature/eval"]);
    const policyDir = path.join(project, ".memory-bank", "dd-flow"); await mkdir(policyDir, { recursive: true });
    await writeFile(path.join(policyDir, "project-workspace.json"), JSON.stringify({ schema_id: "dd-flow/project-workspace@1", workspace: { integration_branch: "main" } }));
    await assert.rejects(canonicalBuild({ profileFile: buildProfile, projectRoot: project }), /detached at checkpoint or on main/);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("canonical build rejects a clean checkout whose product commit differs from the input checkpoint", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "dd-eval-source-"));
  try {
    await run("git", ["init", "--initial-branch=main", project]);
    await run("git", ["-C", project, "-c", "user.email=eval@example.invalid", "-c", "user.name=Eval", "commit", "--allow-empty", "-m", "initial"]);
    const policyDir = path.join(project, ".memory-bank", "dd-flow"); await mkdir(policyDir, { recursive: true });
    await writeFile(path.join(policyDir, "project-workspace.json"), JSON.stringify({ schema_id: "dd-flow/project-workspace@1", workspace: { integration_branch: "main" } }));
    await run("git", ["-C", project, "add", "."]);
    await run("git", ["-C", project, "-c", "user.email=eval@example.invalid", "-c", "user.name=Eval", "commit", "-m", "workspace policy"]);
    await assert.rejects(canonicalBuild({ profileFile: buildProfile, projectRoot: project, flowRoot: project }), /does not match input checkpoint/);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("canonical input does not require an empty overlay commit", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /const overlayChanged = Boolean/);
  assert.match(source, /if \(overlayChanged\) await commandText\("git"/);
});

test("failed canonical bootstrap leaves no partial revision", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "dd-eval-source-")); const home = await mkdtemp(path.join(tmpdir(), "dd-eval-home-")); const prior = process.env.DD_EVAL_HOME;
  try {
    await run("git", ["init", "--initial-branch=main", project]);
    await run("git", ["-C", project, "-c", "user.email=eval@example.invalid", "-c", "user.name=Eval", "commit", "--allow-empty", "-m", "initial"]);
    const policyDir = path.join(project, ".memory-bank", "dd-flow"); await mkdir(policyDir, { recursive: true });
    await writeFile(path.join(policyDir, "project-workspace.json"), JSON.stringify({ schema_id: "dd-flow/project-workspace@1", workspace: { integration_branch: "main" } }));
    process.env.DD_EVAL_HOME = home;
    await assert.rejects(canonicalBuild({ profileFile: buildProfile, projectRoot: project }));
    await assert.rejects(stat(path.join(home, "canonical", caseId, "REV-001")));
  } finally {
    if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior;
    await rm(project, { recursive: true, force: true }); await rm(home, { recursive: true, force: true });
  }
});

test("run profiles reject undeclared control fields rather than silently changing an experiment", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dd-eval-profile-")); const file = path.join(directory, "invalid.json");
  try {
    await writeFile(file, JSON.stringify({ schema_id: "dd-eval/run-profile@1", id: "invalid", case_id: caseId, subject: { profile_id: "subject" }, selection: { focused_stages: [], segment: null, e2e: false, repetitions: 1 }, judge: { enabled: false }, concurrency: { global: 1 }, failure_policy: {}, invented: true }));
    await assert.rejects(loadRunProfile(file), /unsupported fields/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
