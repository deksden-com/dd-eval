import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { assertSourceTag, assertObservedRuntime, assertProfileCapacity, assertProjectFlowPack, boundedPromptArgs, canonicalBuild, committedDefinitionIdentity, directNativeChildren, driverAdapterInvocation, driverProfileArgs, driverRuntimeArgs, entryLauncher, evalRun, executionEvidence, failureAttribution, fanoutSettledFingerprint, fanoutWorkerPrompt, finalJudgePrompt, fixturesValidate, isInfrastructureFailure, loadCase, loadRunProfile, nativeCapacityPrompt, nativeChildFanoutPrompt, nativeChildrenSince, qualificationSucceeded, settleExecutionDaemon, resolveHitlJudgment, restoredRoots, resultCheckpointMode, selectionNeedsEntryPack, stageSessionMode, storedExecutionResults, validateHitlMatch, validateJudgeResult } from "../lib/runner.mjs";
import { appendEvent, readEvents } from "../lib/runner-events.mjs";
import { interactionJudgePrompt } from "../lib/runner.mjs";

const caseId = "sdlc-eval-2026-summer-task-priority";
const root = path.resolve(import.meta.dirname, "..");
const buildProfile = path.join(root, "cases", caseId, "run-profiles", "build-entry-pack-reference-sol-high.json");
const qualificationProfile = path.join(root, "cases", caseId, "run-profiles", "qualify-entry-pack-terra-high.json");
const run = promisify(execFile);

test("case pins its input checkpoint and exact engine without Session starter state", async () => {
  const loaded = await loadCase(caseId);
  assert.equal(loaded.value.schema_id, "dd-eval/case@7");
  assert.equal(loaded.value.entry_pack, null);
  assert.equal("starter_sessions" in loaded.value, false);
  assert.equal("canonical_checkpoints" in loaded.value, false);
  assert.equal("priming" in loaded.value, false);
  assert.equal(loaded.inputCheckpoint.value.id, "cp-097-task-priority-shared-runtime-flow-4-1-0-engine-0-9-0-beta-48");
  assert.equal(loaded.inputCheckpoint.value.source.commit, "924ef61752b642f06c2c326b444ed7a3239f20ff");
  assert.equal(loaded.inputCheckpoint.value.source.tag, "eval/cp-074-source-final");
  assert.equal(loaded.inputCheckpoint.value.flow_pack.commit, "dee7dba1ae721ac1c2b12d8d9c5f16e0bbee0c8b");
  assert.equal(loaded.inputCheckpoint.value.flow_pack.engine.version, "0.9.0-beta.48");
  assert.equal(loaded.inputCheckpoint.value.flow_pack.engine.commit, "ee8c219ce0fbc3943b6d3b1fcc5463c190469aaa");
  assert.equal(loaded.inputCheckpoint.value.flow_pack.engine.artifact_sha256, "8d2b23088f231a91f94d555c42853fd70c8b752ac0eb93d25104d864e8905654");
  assert.match(loaded.value.baseline_admission.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(loaded.value.flow.contour, ["specify", "protocolize", "plan", "plan-review", "code", "code-review", "merge"]);
});

test("source tag rejects a completed-product commit before materialization", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dd-eval-source-tag-"));
  const git = (...args) => run("git", args, { cwd: temporary });
  try {
    await git("init", "--quiet");
    await git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-m", "baseline");
    const baseline = (await git("rev-parse", "HEAD")).stdout.trim();
    await git("tag", "eval/baseline");
    await assertSourceTag(temporary, { tag: "eval/baseline", commit: baseline });
    await git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-m", "feature implemented");
    const completed = (await git("rev-parse", "HEAD")).stdout.trim();
    await assert.rejects(assertSourceTag(temporary, { tag: "eval/baseline", commit: completed }), error => error.code === "input_checkpoint_source_tag_mismatch");
    await assertSourceTag(temporary, { commit: baseline });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("project flow-pack preflight rejects a bare canonical flow before a Session can start", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dd-eval-flow-pack-"));
  const checkpoint = { value: { id: "cp-test", flow_pack: { path: ".memory-bank/dd-flow", memory_bank_version: "4.0.2" } } };
  try {
    await mkdir(path.join(temporary, ".memory-bank", "dd-flow"), { recursive: true });
    await writeFile(path.join(temporary, ".memory-bank", "dd-flow", "manifest.json"), JSON.stringify({ schema_id: "dd-flow/project-flow-pack-manifest@2", pack_version: "4.0.2", canon_version_at_source_commit: "4.0.2", included_files: [] }));
    await assert.rejects(assertProjectFlowPack(temporary, checkpoint), error => error.code === "input_checkpoint_flow_pack_invalid" && error.details.missing.some((item) => item.startsWith("project-execution.json")));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("runtime compatibility is owned by the selected harness profile", () => {
  const profile = { id: "example", runtime: { tool: "1.2.3", dd_harness_contract: "example@1" } };
  assert.doesNotThrow(() => assertObservedRuntime({ observed_runtime: profile.runtime }, profile, "doctor"));
  assert.throws(() => assertObservedRuntime({ observed_runtime: { tool: "1.2.4", dd_harness_contract: "example@1" } }, profile, "doctor"), error => error.code === "harness_runtime_mismatch" && /compatibility qualify/.test(error.details.next_command));
});

test("a contour that may fan out is refused before a Subject session without measured capacity", () => {
  const execution = { stage: "specify", terminal_stage: "merge" };
  assert.throws(() => assertProfileCapacity({ id: "harness", harness: "zcode-acp", subagent_capacity: null }, [execution]), error => error.code === "subagent_capacity_unqualified");
  assert.doesNotThrow(() => assertProfileCapacity({ id: "harness", harness: "zcode-acp", subagent_capacity: 2 }, [execution]));
});

test("AGY prompt liveness is bounded by native activity, not runner heartbeat", () => {
  const prompt = ["session", "prompt", "--session-id", "S-1"];
  assert.deepEqual(boundedPromptArgs({ harness: "antigravity-cli" }, prompt), [...prompt, "--timeout", "600"]);
  assert.deepEqual(boundedPromptArgs({ harness: "zcode-acp" }, prompt), prompt);
  assert.deepEqual(boundedPromptArgs({ harness: "antigravity-cli" }, [...prompt, "--timeout", "42"]), [...prompt, "--timeout", "42"]);
  assert.equal(isInfrastructureFailure("subject_liveness_timeout"), true);
});

test("owned cleanup uses tree evidence independently of failure attribution", async () => {
  for (const code of ["agy_provider_failed", "subject_liveness_timeout", "new_provider_failure"]) {
    const calls = [];
    const result = await settleExecutionDaemon(async cancel => {
      calls.push(cancel);
      if (!cancel) throw Object.assign(new Error("active tree"), { code: "tree_not_settled" });
      return "settled";
    }, { code });
    assert.equal(result, "settled");
    assert.deepEqual(calls, [false, true]);
  }
  for (const [failure, cleanupCode] of [
    [undefined, "tree_not_settled"],
    [{ code: "operation_observation_lost" }, "tree_not_settled"],
    [{ code: "agy_provider_failed" }, "daemon_connection_closed"],
    [{ code: "agy_provider_failed" }, "permission_denied"],
  ]) {
    const calls = [];
    await assert.rejects(settleExecutionDaemon(async cancel => {
      calls.push(cancel);
      throw Object.assign(new Error(cleanupCode), { code: cleanupCode });
    }, failure), error => error.code === cleanupCode);
    assert.deepEqual(calls, [false]);
  }
  const calls = [];
  await settleExecutionDaemon(async cancel => calls.push(cancel), { code: "agy_provider_failed" });
  assert.deepEqual(calls, [false]);
});

test("a case without an accepted entry pack cannot start focused fixtures", async () => {
  await assert.rejects(fixturesValidate({ caseId }), /requires --revision/);
  await assert.rejects(fixturesValidate({ caseId, revision: "REV-001" }), /not found|Invalid JSON/);
});

test("E2E starts from case input while focused and segment runs require an entry pack", () => {
  assert.equal(selectionNeedsEntryPack([{ mode: "e2e" }]), false);
  assert.equal(selectionNeedsEntryPack([{ mode: "e2e" }, { mode: "focused" }]), true);
  assert.equal(selectionNeedsEntryPack([{ mode: "segment" }]), true);
});

test("Final Judge must cover the selected rubric exactly with evidenced applicable scores", () => {
  const assessment = { scopes: { plan: { outcome: [{ id: "quality" }], flow: [{ id: "integrity" }] } } };
  const valid = { schema_id: "dd-eval/judge-result@2", scope: "plan", run_validity: "valid", outcome: [{ id: "quality", score: 4, not_applicable: false, rationale: "complete", evidence: ["plan.json"] }], flow: [{ id: "integrity", score: null, not_applicable: true, rationale: "not exercised", evidence: [] }], findings: [], golden: { covered: [], missed: [], alternatives: [], novel: [] }, conclusion: "ready" };
  assert.deepEqual(validateJudgeResult(valid, assessment), valid);
  assert.throws(() => validateJudgeResult({ ...valid, outcome: [] }, assessment), /exact outcome rubric/);
  assert.throws(() => validateJudgeResult({ ...valid, outcome: [{ ...valid.outcome[0], evidence: [] }] }, assessment), /incomplete applicable criterion/);
  assert.throws(() => validateJudgeResult({ ...valid, scope: "unknown" }, assessment), /unknown assessment scope/);
});

test("Final Judge receives a bounded evidence scope", () => {
  const prompt = finalJudgePrompt({ assessmentFile: "/eval/judge/assessment.json", candidateFile: "/eval/judge/candidate.json", evidenceFile: "/eval/judge/evidence.json", scope: "e2e", assessment: { scopes: { e2e: { outcome: [{ id: "quality" }], flow: [{ id: "integrity" }] } } } });
  assert.match(prompt, /Use only those packets and artifact paths explicitly referenced by them/);
  assert.match(prompt, /Do not search or read another eval, RUN, project, workspace, or host path/);
  assert.match(prompt, /"scope":"e2e"/);
  assert.match(prompt, /"id":"quality"/);
  assert.match(prompt, /"id":"integrity"/);
});

test("Codex default and mixed E2E differ only in explicit reviewer routing", async () => {
  const directory = path.join(root, "cases", caseId, "run-profiles");
  const baseline = (await loadRunProfile(path.join(directory, "e2e-inline-merge-luna-xhigh.json"))).value;
  const mixed = (await loadRunProfile(path.join(directory, "e2e-mixed-codex-luna-sol.json"))).value;
  for (const key of ["case_id", "selection", "judge", "interaction_judge", "concurrency", "failure_policy"]) assert.deepEqual(mixed[key], baseline[key]);
  assert.equal(mixed.subject.profile_id, baseline.subject.profile_id);
  assert.equal(mixed.subject.execution.agent_profile_id, baseline.subject.profile_id);
  assert.deepEqual(Object.keys(mixed.subject.execution.stage_overrides).sort(), ["code-review", "plan-review"]);
  for (const override of Object.values(mixed.subject.execution.stage_overrides)) {
    assert.deepEqual(override, { delegation: { mode: "external", agent_profile_id: mixed.judge.profile_id, max_parallel: 1 } });
  }
});

test("run profiles are explicit experiments rather than harness defaults", async () => {
  const reference = await loadRunProfile(buildProfile); const qualification = await loadRunProfile(qualificationProfile);
  assert.equal(reference.value.selection.e2e, false);
  assert.deepEqual(reference.value.selection.focused_stages, []);
  assert.equal(qualification.value.selection.focused_stages.length, 7);
  assert.equal(qualification.value.selection.e2e, false);
  assert.equal(reference.value.subject.profile_id, "codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11");
  assert.equal(qualification.value.subject.profile_id, "codex-desktop-gpt-5-6-terra-high-dd-flow-0-9-0-beta-11");
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
  assert.deepEqual(driverProfileArgs(profile, ["daemon", "start"]), ["daemon", "start", "--provider", "builtin:zai-coding-plan", "--model", "GLM-5.3", "--reasoning", "high", "--mode", "yolo"]);
  assert.deepEqual(driverProfileArgs(profile, ["session", "create", "--provider", "override"]), ["session", "create", "--provider", "override", "--model", "GLM-5.3", "--reasoning", "high", "--mode", "yolo"]);
});

test("execution daemon receives its explicit flow runtime contract", async () => {
  await mkdir("/tmp/flow", { recursive: true });
  await writeFile("/tmp/flow/harnesses.json", JSON.stringify({ schema_id: "dd-flow/harness-config@1", harnesses: {} }));
  const prior = process.env.DD_FLOW_BIN; process.env.DD_FLOW_BIN = "/bin/false";
  try {
    const args = await driverRuntimeArgs(["daemon", "start", "--state-dir", "/tmp/daemon"], { cwd: "/tmp/project", env: { DD_FLOW_HOME: "/tmp/flow", DD_FLOW_BIN: "/bin/echo" } });
    assert.deepEqual(args, ["daemon", "start", "--state-dir", "/tmp/daemon", "--dd-flow-bin", "/bin/echo", "--dd-flow-home", "/tmp/flow", "--project-root", "/tmp/project"]);
    assert.deepEqual(await driverRuntimeArgs(["daemon", "stop"], { cwd: "/tmp/project", env: { DD_FLOW_HOME: "/tmp/flow" } }), ["daemon", "stop"]);
  } finally { if (prior === undefined) delete process.env.DD_FLOW_BIN; else process.env.DD_FLOW_BIN = prior; }
});

test("ZCode daemon receives a resolved ACP executable", async () => {
  await mkdir("/tmp/flow-zcode", { recursive: true });
  await writeFile("/tmp/flow-zcode/harnesses.json", JSON.stringify({ schema_id: "dd-flow/harness-config@1", harnesses: { "zcode-acp": { adapter_command: "/bin/echo", runtime_command: "/bin/echo" } } }));
  const args = await driverRuntimeArgs(["daemon", "start", "--state-dir", "/tmp/daemon"], {
    cwd: "/tmp/project",
    env: { DD_FLOW_HOME: "/tmp/flow-zcode", DD_FLOW_BIN: "/bin/echo" },
    profile: { harness: "zcode-acp" },
  });
  assert.deepEqual(args, ["daemon", "start", "--state-dir", "/tmp/daemon", "--dd-flow-bin", "/bin/echo", "--dd-flow-home", "/tmp/flow-zcode", "--project-root", "/tmp/project", "--zcode-acp-bin", "/bin/echo"]);
});

test("isolated runner never substitutes a configured adapter for a missing engine bundle", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dd-eval-harness-"));
  try {
    await writeFile(path.join(home, "harnesses.json"), JSON.stringify({ schema_id: "dd-flow/harness-config@1", harnesses: { "zcode-acp": { adapter_command: "/bin/echo", runtime_command: "/bin/echo" } } }));
    await assert.rejects(driverAdapterInvocation({ harness: "zcode-acp" }, { cwd: "/tmp/project", env: { DD_FLOW_HOME: home } }), { code: "canonical_engine_missing" });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("qualification cannot pass while any execution failed", () => {
  assert.equal(qualificationSucceeded({ state: "completed", executions: [{ state: "candidate_ready" }] }), true);
  assert.equal(qualificationSucceeded({ state: "completed_with_failures", executions: [{ state: "failed" }] }), false);
  assert.equal(qualificationSucceeded({ state: "completed", executions: [{ state: "failed" }] }), false);
});

test("terminal reconciliation supersedes only the runner's failed launch receipt", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dd-eval-reconcile-")); const eventsFile = path.join(directory, "events.jsonl"); const manifest = { run_id: "EVAL-001", executions: [{ id: "e2e", stage: "specify" }] };
  await appendEvent(eventsFile, { source: "dd-eval://test", runId: manifest.run_id, executionId: "e2e", traceId: manifest.run_id, type: "dev.dd.eval.operation.failed", data: { operation_id: "EVAL-001:e2e:launch", operation: "execution.e2e.launch", status: "failed", error: { code: "runner_failure" } } });
  const recovered = { execution: "e2e", state: "candidate_ready", candidate: { manifest_sha256: "a".repeat(64) } };
  await appendEvent(eventsFile, { source: "dd-eval://test", runId: manifest.run_id, executionId: "e2e", traceId: manifest.run_id, type: "dev.dd.eval.operation.completed", data: { operation_id: "EVAL-001:e2e:launch:reconcile", operation: "execution.e2e.reconcile", status: "completed", result: recovered } });
  assert.deepEqual(storedExecutionResults(await readEvents(eventsFile), manifest), [recovered]);
});

test("focused result checkpoints preserve a legal successor entry", () => {
  assert.deepEqual(resultCheckpointMode("plan-review"), { purpose: "stage_entry", stage_entry: "code" });
  assert.deepEqual(resultCheckpointMode("code"), { purpose: "stage_entry", stage_entry: "code-review" });
  assert.deepEqual(resultCheckpointMode("code-review"), { purpose: "stage_entry", stage_entry: "merge" });
  assert.deepEqual(resultCheckpointMode("merge"), { purpose: "candidate", stage_entry: null });
});

test("eval does not retain a second execution snapshot controller", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.doesNotMatch(source, /async function (captureCandidate|captureExecutionCandidate|captureStageBoundary|captureIncompleteEvidence|waitForFile)\(/);
});

test("recovery resumes the latest successor Subject Session", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /dev\.dd\.eval\.subject\.successor_session_created/);
  assert.match(source, /sessions\.at\(-1\).*session_id/s);
});

test("recovery retains the logical CLI controller rather than restarting an eval daemon", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const recovery = source.slice(source.indexOf('export async function recoverExecution('), source.indexOf('async function runnerBlueprint('));
  assert.match(recovery, /\["run", "control", "resume"/);
  assert.match(recovery, /resumed\.controller\?\.controller_id !== controller\.controller_id/);
  assert.doesNotMatch(recovery, /withExecutionDaemon|callDriver\(|providerTurn\(/);
  assert.doesNotMatch(source, /async function withExecutionDaemon/);
});

test("normal, resumed, judged, and cancelled runs share one terminal projection", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.equal((source.match(/finalizeRunProjection\(\{/g) ?? []).length >= 4, true);
  assert.match(source, /await writeJsonAtomic\(path\.join\(root, "state\.json"\), projection\)/);
  assert.match(source, /existing candidate does not match completed executions/);
  assert.match(source, /state !== "awaiting_provider"/);
  assert.equal(storedExecutionResults([{ executionid: "e", type: "dev.dd.eval.execution.cancelled", data: {} }], { run_id: "r", executions: [{ id: "e" }] })[0].state, "cancelled");
});

test("provider interruption consumes the CLI-owned sealed recovery capture", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /function classifyInterruption\(error\)/);
  assert.doesNotMatch(source, /\["run", "recovery", "(?:begin|seal|capture)"/);
  assert.match(source, /control\.admission !== "sealed"/);
  assert.match(source, /path\.join\(control\.capture_path, "snapshot.json"\)/);
  assert.match(source, /export async function runnerRecover/);
  assert.match(source, /launch:recover:/);
  assert.match(source, /candidate-revisions/);
});

test("a terminal incomplete execution keeps an immutable evidence candidate for Judge", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /schema_id: "dd-eval\/run-candidate@2"/);
  assert.match(source, /outcome: results\.every\(\(result\) => result\.state === "candidate_ready"\) \? "complete" : "incomplete"/);
  assert.match(source, /If candidate\.outcome is incomplete, assess only evidence-backed work that actually ran/);
  assert.match(source, /if \(!finalized\.candidate\) return \{ root, status: "awaiting_provider"/);
});

test("a local engine override refreshes a same-version runtime snapshot", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /commandJson\(bin, \["engine", "install", "--force"\]/);
});

test("successor Session mode reads the persisted execution profile from run status", () => {
  assert.equal(stageSessionMode({ status: { index: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } }), "new_session");
  assert.equal(stageSessionMode({ status: { run: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } }), "new_session");
  assert.equal(stageSessionMode({ status: { index: {} } }), "same_session");
});

test("successor context uses the registered v2 RUN artifact root", () => {
  const roots = restoredRoots({ status: { run: { workspace_root: "/workspace", run_root: "/flow/projects/PRJ-001/runs/RUN-001" } } }, "/project", "/flow");
  assert.deepEqual(roots, { project: "/project", workspace: "/workspace", run: "/flow/projects/PRJ-001/runs/RUN-001", runtime: "/flow" });
  assert.throws(() => restoredRoots({ status: { run: { workspace_root: "/workspace", run_home_path: "/legacy" } } }, "/project", "/flow"), /registered workspace roots/);
});

test("canonical reference recovery also requires the registered v2 RUN artifact root", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const start = source.indexOf("async function canonicalResumeUnlocked");
  const end = source.indexOf("export async function canonicalBoundaryAccept", start);
  const implementation = source.slice(start, end);
  assert.match(implementation, /restoredRoots\(\{ status \}, projectRoot, runtimeRoot\)/);
  assert.doesNotMatch(implementation, /run_home_path/);
});

test("new-session handoff is a flow invariant rather than an eval-profile option", () => {
  const lifecycle = { status: { index: { execution_profile: { settings: { stage_session_mode: "new_session" } } } } };
  assert.equal(stageSessionMode(lifecycle), "new_session");
  assert.notEqual(stageSessionMode(lifecycle), "same_session");
});

test("E2E dispatch delegates Session handoff and fan-out to the CLI controller", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.doesNotMatch(source, /function (?:runServerMerge|materializeMergeAgentProfile|stageExecutor|mergeHarness)\b/);
  const execution = source.slice(source.indexOf("async function executeEval("), source.indexOf("export async function evalJudge("));
  assert.match(execution, /await observeManagedExecution/);
  assert.doesNotMatch(execution, /providerTurn\(|callDriver\(|driveFanout\(|runServerMerge\(|captureExecutionCandidate\(/);
  const managed = source.slice(source.indexOf("async function observeManagedExecution("), source.indexOf("export async function recoverExecution("));
  assert.match(managed, /await observeManagedRun/);
  assert.match(managed, /observed\.controller\.sessions/);
});

test("accepted boundary clears the terminal turn marker before a successor launch", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /state\.reference = \{ \.\.\.state\.reference, active_turn: null, pending_pause_id: null \}/);
});

test("stage launcher makes registered HITL pause the only way to ask a material question", () => {
  const launcher = entryLauncher({ stage: "specify", entry: { snapshot: { run_id: null } }, projectRoot: "/project", runtimeRoot: "/runtime", contextFile: "/context.json", contextSha256: "a".repeat(64), profile: {} });
  assert.match(launcher, /DD_FLOW_BIN="\/runtime\/bin\/dd-flow" "\/runtime\/bin\/dd-flow" stage start/);
  assert.match(launcher, /--response-file "\/context\.json\.stage-start-response\.json"/);
  assert.match(launcher, /do not rerun `stage start` if the tool display truncates its output/);
  assert.match(launcher, /run the exact `stage pause` lifecycle command/);
  assert.match(launcher, /Otherwise finish this Stage/);
});

test("native child packets cannot create nested HITL and unqualified capacity is infrastructure", () => {
  const prompt = fanoutWorkerPrompt({ workId: "WRK-001", startCommand: "dd-flow work start WRK-001 --json" });
  assert.match(prompt, /cannot ask the user or pause the parent Stage/);
  const packet = nativeChildFanoutPrompt({ stage: "code", capacity: 2, works: [{ work_id: "WRK-001", start_command: "dd-flow work start WRK-001 --json", launch_policy: "fresh_agent_required" }] });
  assert.match(packet, /direct child of this current Session/);
  assert.match(packet, /not a reason to cancel its siblings/);
  assert.match(packet, /empty, non-inherited context/);
  assert.equal(isInfrastructureFailure("subagent_capacity_unqualified"), true);
  assert.equal(isInfrastructureFailure("provider_rate_limited"), true);
  assert.equal(isInfrastructureFailure("provider_quota_exhausted"), true);
});

test("productive fan-out has no second execution loop in eval", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /nativeChildFanoutPrompt/);
  assert.doesNotMatch(source, /async function driveFanout/);
  const recovery = source.slice(source.indexOf('export async function recoverExecution('), source.indexOf('async function runnerBlueprint('));
  assert.match(recovery, /await observeManagedExecution/);
  assert.doesNotMatch(recovery, /nativeChildFanoutPrompt\(|promptExistingSession\(/);
});

test("a new fan-out stage ignores historical native children but keeps its new wave", () => {
  const children = [{ session_id: "old", status: "completed" }, { session_id: "new", status: "running" }];
  assert.deepEqual(nativeChildrenSince(children, new Set(["old"])), [{ session_id: "new", status: "running" }]);
});

test("reconciliation failures retain undetermined attribution for the Judge", () => {
  assert.equal(failureAttribution("fanout_reconciliation_required"), "undetermined");
  assert.equal(failureAttribution("provider_rate_limited"), "evaluation_infrastructure");
  assert.equal(failureAttribution("unexpected_hitl"), "subject");
  assert.equal(failureAttribution("future_unclassified_failure"), "undetermined");
  const prompt = finalJudgePrompt({ assessmentFile: "/assessment", candidateFile: "/candidate", evidenceFile: "/evidence", scope: "e2e", assessment: { scopes: { e2e: { outcome: [{ id: "outcome" }], flow: [{ id: "flow" }] } } } });
  assert.match(prompt, /stop for runner dispatch/);
});

test("failure evidence preserves reached boundaries, HITL, launcher, and observations", () => {
  const evidence = executionEvidence({
    execution: "e2e", state: "failed", code: "fanout_reconciliation_required", error: "native graph diverged",
    stage: "plan-review", run_id: "RUN-001", session_id: "SES-root", launcher: "stop for runner dispatch",
    boundaries: [{ stage: "specify", checkpoint: { manifest_sha256: "a".repeat(64) } }, { stage: "plan", checkpoint: { manifest_sha256: "b".repeat(64) } }],
    hitl: [{ stage: "specify", answer_sha256: "c".repeat(64) }],
    statistics: { usage: { total_tokens: 12 }, observation: { tool_calls: 3 }, sessions: [{ id: "SES-root" }] },
    driver: { evidence: { tool_calls: [{ id: "tool-1" }] }, journal: "/attempt/drivers/subject.events.jsonl" }, attempt: "/attempt"
  });
  assert.equal(evidence.failure.attribution, "undetermined");
  assert.equal(evidence.stage_boundaries.length, 2);
  assert.equal(evidence.hitl.length, 1);
  assert.deepEqual(evidence.usage, { total_tokens: 12 });
  assert.deepEqual(evidence.observation, { tool_calls: 3 });
  assert.equal(evidence.artifacts.driver_journal, "/attempt/drivers/subject.events.jsonl");
});

test("productive fan-out no longer creates an isolated worker root", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.doesNotMatch(source, /async function runFanoutWorker/);
  assert.doesNotMatch(source, /startIsolatedWorkerDaemon/);
});

test("worker failure remains primary when daemon cleanup also fails", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const execution = source.slice(source.indexOf("async function executeEval("), source.indexOf("export async function evalJudge("));
  assert.match(execution, /evidence\.control = \{ settled: false, cleanup_error: errorRecord\(cleanupError\) \}/);
  assert.match(execution, /\.\.\.errorRecord\(error\)/);
  assert.match(execution, /!isObservationLoss\(error\)/);
});

test("Interaction Judge accepts alternatives without dropping independent decisions", () => {
  const prompt = interactionJudgePrompt('/packet with "quotes".json');
  assert.ok(prompt.includes(JSON.stringify('/packet with "quotes".json')));
  assert.match(prompt, /Proposed options are not exhaustive or binding/);
  assert.match(prompt, /Do not require it to affirm a proposed option's assumptions or consequences/);
  assert.match(prompt, /independent question about delivery time remains uncovered/);
  assert.match(prompt, /Never author, paraphrase or strengthen a response/);
  assert.match(prompt, /Return matched only when every material decision is covered/);
});

test("HITL verdicts are strict, fail closed, and preserve exact response bytes", () => {
  const fixture = { sha256: "a".repeat(64), responses: [{ id: "one", answer: "first" }, { id: "two", answer: "second" }] };
  const verdict = validateHitlMatch({ schema_id: "dd-eval/hitl-match@1", status: "matched", classification: "covered_by_canonical_response", response_ids: ["two", "one"], covered_questions: ["Q1", "Q2"], uncovered_questions: [], rationale: "covered" }, fixture);
  const exchange = resolveHitlJudgment({ fixture, judgment: { profile: "judge", session_id: "session", receipt_file: "/receipt", verdict }, question: "Q1 and Q2", stage: "specify" });
  assert.equal(exchange.answer, "second\n\nfirst");
  assert.equal(exchange.delimiter, "dd-eval/hitl-response-delimiter@1");
  assert.throws(() => validateHitlMatch({ ...verdict, response_ids: ["one", "one"] }, fixture), /malformed arrays/);
  assert.throws(() => validateHitlMatch({ ...verdict, uncovered_questions: ["Q3"] }, fixture), /inconsistent verdict/);
  assert.throws(() => validateHitlMatch({ ...verdict, rationale: "" }, fixture), /invalid contract/);
  const gap = validateHitlMatch({ schema_id: "dd-eval/hitl-match@1", status: "unmatched", classification: "fixture_gap", response_ids: [], covered_questions: ["Q1"], uncovered_questions: ["Q2"], rationale: "missing" }, fixture);
  assert.throws(() => resolveHitlJudgment({ fixture, judgment: { verdict: gap }, question: "Q1 and Q2", stage: "specify" }), (error) => error.code === "interaction_fixture_gap" && error.hitl.verdict === gap);
  const partialGap = validateHitlMatch({ schema_id: "dd-eval/hitl-match@1", status: "unmatched", classification: "fixture_gap", response_ids: ["one"], covered_questions: ["Q1"], uncovered_questions: ["Q2"], rationale: "first answer covers only Q1" }, fixture);
  assert.throws(() => resolveHitlJudgment({ fixture, judgment: { verdict: partialGap }, question: "Q1 and Q2", stage: "specify" }), (error) => error.code === "interaction_fixture_gap" && error.hitl.verdict === partialGap);
  assert.throws(() => validateHitlMatch({ ...partialGap, covered_questions: ["Q1", "Q1"] }, fixture), /malformed arrays/);
  assert.throws(() => validateHitlMatch({ ...partialGap, uncovered_questions: ["Q1"] }, fixture), /malformed arrays/);
  assert.equal(isInfrastructureFailure("interaction_fixture_gap"), true);
});

test("HITL recovery enforces the same round, receipt, and evidence contract", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /rounds >= fixture\.max_rounds/);
  assert.match(source, /type: "dev\.dd\.eval\.hitl\.matched"[\s\S]*recovered: true/);
  assert.match(source, /hitl\.push\(\.\.\.await hitlEvidenceFor\(retained, execution\.id\)\)/);
});

test("canonical recovery reuses accepted HITL bytes without spending another round", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /answered_pauses/);
  const implementation = source.slice(source.indexOf("async function canonicalResumeUnlocked"), source.indexOf("export async function canonicalBoundaryAccept"));
  assert.match(implementation, /if \(prior\) \{\s+await acceptedHitlAnswer\(\{ answerFile: prior\.answer_file, answerSha256: prior\.answer_sha256 \}\);\s+return prior\.answer_file/);
  assert.match(source, /answer_file: answerFile/);
});

test("canonical mutations are bound to their committed eval definition", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /runner_definition_drift/);
  assert.match(source, /state\.definition\?\.commit !== current\.commit/);
  assert.match(source, /await assertCanonicalDefinition\(state\)/);
});

test("run profiles cannot request an unauthorized continuation after unmatched HITL", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dd-eval-profile-"));
  try {
    const value = JSON.parse(await readFile(path.join(root, "cases", caseId, "run-profiles", "e2e-inline-merge-luna-xhigh.json"), "utf8"));
    value.failure_policy.stop_execution_on_unmatched_hitl = false;
    const file = path.join(directory, "profile.json"); await writeFile(file, JSON.stringify(value));
    await assert.rejects(loadRunProfile(file), /no authorized continuation/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("capacity qualification counts only authoritative direct native children", () => {
  const prompt = nativeCapacityPrompt(7);
  assert.match(prompt, /at most 7 direct leaf children/);
  assert.match(prompt, /Do not retry, replace, or add children/);
  const children = directNativeChildren({ descendants: [
    { provider_session_id: "child-completed", parent_provider_session_id: "root", status: "completed" },
    { provider_session_id: "child-failed", parent_provider_session_id: "root", status: "failed" },
    { provider_session_id: "child-settled-by-root", parent_provider_session_id: "root", status: "settled_by_root" },
    { provider_session_id: "grandchild", parent_provider_session_id: "child-completed", status: "completed" }
  ] }, "root");
  assert.deepEqual(children.map((child) => child.session_id), ["child-completed", "child-failed", "child-settled-by-root"]);
  assert.equal(children[1].status, "failed");
  assert.equal(children[2].status, "settled_by_root");
  assert.deepEqual(
    directNativeChildren({ evidence: { subagents: { ended: { items: [{ childSessionId: "zcode-ended", status: "success" }] } } } }, "root"),
    [{ session_id: "zcode-ended", parent_session_id: "root", status: "completed", source: "zcode/session/subagents" }]
  );
});

test("capacity qualification stays outside the flow runtime", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const helper = source.match(/export async function harnessCapacityCheck[\s\S]*?\n}/);
  assert.ok(helper);
  assert.doesNotMatch(helper[0], /DD_FLOW_HOME/);
  assert.doesNotMatch(helper[0], /provisionCapacityRuntime/);
});

test("capacity Codex home links authentication without sharing Sessions", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const helper = source.match(/async function provisionCapacityCodexHome[\s\S]*?\n}/);
  assert.ok(helper);
  assert.match(helper[0], /symlink\(sourceAuth/);
  assert.doesNotMatch(helper[0], /sessions/);
});

test("capacity reads Codex native child metadata rather than model text", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const helper = source.match(/async function capacityCodexChildren[\s\S]*?\n}/);
  assert.ok(helper);
  assert.match(helper[0], /parent_thread_id === rootSessionId/);
  assert.doesNotMatch(helper[0], /SubAgentActivity/);
  assert.doesNotMatch(helper[0], /assistant_text/);
});

test("native packet contains the exact Work start command", () => {
  const packet = nativeChildFanoutPrompt({ stage: "plan-review", capacity: 1, works: [{ work_id: "WRK-001", start_command: "dd-flow work start WRK-001 --json" }] });
  assert.match(packet, /dd-flow work start WRK-001 --json/);
  assert.match(packet, /one direct native child agent/);
});

test("reference native-child recovery delegates to its retained CLI owner", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /nativeChildWaitPrompt/);
  assert.match(source, /awaiting_native_children/);
  const reference = source.slice(source.indexOf("async function canonicalResumeUnlocked"), source.indexOf("export async function canonicalBoundaryAccept"));
  assert.match(reference, /controllerId: state\.reference\.controller_id/);
  assert.doesNotMatch(reference, /driveFanout\(|providerTurn\(|callDriver\(/);
});

test("observer loss remains recoverable instead of producing a failed execution", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.match(source, /if \(isObservationLoss\(error\)\)/);
  assert.match(source, /state: "awaiting_provider", \.\.\.errorRecord\(error\)/);
  assert.match(source, /dev\.dd\.eval\.execution\.awaiting_provider/);
});

test("reference stage continuation is owned by the shared controller", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  const reference = source.slice(source.indexOf("async function canonicalResumeUnlocked"), source.indexOf("export async function canonicalBoundaryAccept"));
  assert.match(reference, /await observeManagedRun\(/);
  assert.match(reference, /if \(requested !== stage\) return null/);
  assert.doesNotMatch(reference, /interruptedStageContinuation|session.*prompt/);
});

test("canonical recovery does not infer liveness from provider timestamps", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.doesNotMatch(source, /function providerTurnIsLive\(/);
  assert.match(source, /reference_migration_required/);
});

test("canonical reference no longer owns a private daemon restart loop", async () => {
  const source = await readFile(path.join(root, "lib", "runner.mjs"), "utf8");
  assert.doesNotMatch(source, /function (?:restartIdleReferenceDaemon|startReferenceDaemon|stopReferenceDaemon)\(/);
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
