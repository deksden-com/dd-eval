import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, canonicalJson, hashJson, readEvents, recordOperation, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { materializeStageSlice, semanticContextHash, stages, validateEntry as validateStageEntry, validateStageBlueprint, writeEntryPack } from "./entry-pack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageSet = new Set(stages);
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys, label) => { if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label} has unsupported fields`); return value; };

export function evalHome(value = process.env.DD_EVAL_HOME) {
  const home = value ?? path.join(process.env.HOME ?? ".", ".dd-eval");
  if (!path.isAbsolute(home)) fail("DD_EVAL_HOME must be absolute");
  return path.resolve(home);
}
export async function readJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { fail(`Invalid JSON: ${file}: ${error.message}`); } }
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
function relative(value, label) { if (typeof value !== "string" || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) fail(`${label} must be a non-empty contained relative path`); return value; }
function contained(root, value, label) { return path.resolve(root, relative(value, label)); }
function caseDir(caseId) { return contained(path.join(repoRoot, "cases"), caseId, "case id"); }

export async function loadCaseV6(caseId) {
  const root = caseDir(caseId); const value = await readJson(path.join(root, "case.json"));
  if (!isObject(value) || value.schema_id !== "dd-eval/case@6") fail(`${caseId} must use dd-eval/case@6`);
  if (value.id !== caseId || typeof value.assessment !== "string" || !Array.isArray(value.input)) fail("case requires id, assessment and ordered input");
  for (const item of value.input) {
    if (!isObject(item) || typeof item.role !== "string" || !item.role || typeof item.source !== "string" || !item.source || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) fail("case input item is invalid");
    const file = contained(root, item.source, "case input source"); if (!(await exists(file)) || sha256(await readFile(file)) !== item.sha256) fail(`case input checksum does not match: ${item.source}`, "case_input_checksum_mismatch");
  }
  if (!["authoring", "runnable"].includes(value.status)) fail("case.status must be authoring or runnable");
  if (value.status === "authoring" && value.entry_pack !== null) fail("an authoring case must not point at an active entry pack");
  if (value.status === "runnable" && typeof value.entry_pack !== "string") fail("a runnable case requires one active entry_pack pointer");
  if ("starter_sessions" in value || "canonical_checkpoints" in value || "priming" in value) fail("case@6 cannot contain starter or canonical Session fields");
  return { root, value, assessment: await readJson(contained(root, value.assessment, "assessment")) };
}

export async function loadProfile(fileOrId) {
  const file = fileOrId.includes("/") || fileOrId.endsWith(".json") ? path.resolve(fileOrId) : path.join(repoRoot, "profiles", `${fileOrId}.json`);
  const value = await readJson(file);
  if (!isObject(value) || typeof value.id !== "string" || typeof value.harness !== "string" || typeof value.model !== "string" || typeof value.reasoning !== "string") fail(`invalid harness profile: ${file}`);
  return { file, value };
}

export async function loadRunProfile(file) {
  const pathName = path.resolve(file); const value = await readJson(pathName);
  onlyKeys(value, ["schema_id", "id", "case_id", "subject", "selection", "judge", "interaction_judge", "concurrency", "failure_policy"], "run profile");
  if (value.schema_id !== "dd-eval/run-profile@1") fail("run profile must use dd-eval/run-profile@1");
  onlyKeys(value.subject, ["profile_id"], "run profile subject"); if (typeof value.id !== "string" || typeof value.case_id !== "string" || typeof value.subject.profile_id !== "string") fail("run profile requires id, case_id and subject.profile_id");
  onlyKeys(value.selection, ["focused_stages", "segment", "e2e", "repetitions"], "run profile selection");
  if (!Array.isArray(value.selection.focused_stages) || value.selection.focused_stages.some((stage) => typeof stage !== "string") || typeof value.selection.e2e !== "boolean" || !Number.isInteger(value.selection.repetitions) || value.selection.repetitions < 1 || !(value.selection.segment === null || (isObject(value.selection.segment) && typeof value.selection.segment.from === "string" && typeof value.selection.segment.to === "string"))) fail("run profile selection is invalid");
  onlyKeys(value.judge, ["enabled", "profile_id"], "run profile judge"); if (typeof value.judge.enabled !== "boolean" || (value.judge.enabled && typeof value.judge.profile_id !== "string")) fail("run profile judge is invalid");
  if (value.interaction_judge !== undefined) { onlyKeys(value.interaction_judge, ["profile_id"], "run profile interaction_judge"); if (typeof value.interaction_judge.profile_id !== "string") fail("run profile interaction_judge is invalid"); }
  onlyKeys(value.concurrency, ["global", "per_harness"], "run profile concurrency"); if (!Number.isInteger(value.concurrency.global) || value.concurrency.global < 1 || (value.concurrency.per_harness !== undefined && (!isObject(value.concurrency.per_harness) || Object.values(value.concurrency.per_harness).some((limit) => !Number.isInteger(limit) || limit < 1)))) fail("run profile concurrency is invalid");
  onlyKeys(value.failure_policy, ["stop_run_on_infrastructure_error", "stop_execution_on_unexpected_hitl", "stop_execution_on_unmatched_hitl"], "run profile failure_policy"); if (Object.values(value.failure_policy).some((setting) => typeof setting !== "boolean")) fail("run profile failure_policy is invalid");
  return { file: pathName, value };
}

export async function fixturesValidate({ caseId, revision }) {
  const loaded = await loadCaseV6(caseId); const pointer = loaded.value.entry_pack;
  if (!revision && typeof pointer !== "string") fail("an authoring case requires --revision for fixture validation");
  const packFile = revision ? path.join(loaded.root, "stage-entries", revision, "entry-pack.json") : contained(loaded.root, pointer, "entry_pack");
  const pack = validateEntryPack(await readJson(packFile), caseId);
  if (!revision && pack.status !== "accepted") fail("the active entry pack must be accepted");
  const packRoot = path.dirname(packFile); const blueprintFile = contained(packRoot, pack.stage_context, "stage_context"); const blueprint = validateStageBlueprint(await readJson(blueprintFile));
  const entries = {};
  for (const key of ["e2e", ...stages]) {
    const locator = pack.entries[key]; if (typeof locator !== "string") fail(`entry-pack misses ${key}`);
    const entry = validateStageEntry(await readJson(contained(packRoot, locator, `${key} entry`)), key === "e2e" ? "specify" : key);
    entries[key] = { file: locator, semantic_package_sha256: entry.semantic_package_sha256, context_slice_sha256: entry.context_slice_sha256 };
  }
  return { case_id: caseId, revision: pack.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries };
}

function validateEntryPack(value, caseId) {
  if (!isObject(value) || value.schema_id !== "dd-eval/entry-pack@1" || value.case_id !== caseId || !/^REV-\d+$/.test(value.revision ?? "")) fail("invalid entry-pack");
  if (typeof value.stage_context !== "string" || !isObject(value.entries) || typeof value.entries.e2e !== "string") fail("entry-pack has incomplete descriptors");
  for (const stage of stages) if (typeof value.entries[stage] !== "string") fail(`entry-pack misses focused ${stage}`);
  return value;
}

function nextRevision(existing) { const values = existing.filter((entry) => /^REV-\d+$/.test(entry)).map((entry) => Number(entry.slice(4))); return `REV-${String((values.length ? Math.max(...values) : 0) + 1).padStart(3, "0")}`; }
function nextStage(stage) { const index = stages.indexOf(stage); return index < 0 || index === stages.length - 1 ? null : stages[index + 1]; }
function canonicalLocator(home, target) { return path.relative(home, target).split(path.sep).join("/"); }
async function manifestHash(file) { return sha256(await readFile(file)); }
async function writeCanonicalState(root, state, event) {
  const file = path.join(root, "build", "state.json");
  await writeJsonAtomic(file, state);
  if (event) await appendEvent(path.join(root, "build", "events.jsonl"), event);
}
function canonicalEntry({ caseId, revision, stage, snapshot, blueprint }) {
  const slice = blueprint.stages[stage];
  return {
    schema_id: "dd-eval/stage-entry@1", case_id: caseId, revision,
    checkpoint_id: `STG-${stage.toUpperCase()}-ENTRY-${revision}`,
    stage, snapshot,
    semantic_package_sha256: semanticContextHash(slice), context_slice_sha256: hashJson(slice)
  };
}
async function createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot }) {
  const snapshotRoot = path.join(root, "stages", "specify", "bootstrap");
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const transientHome = path.join(root, "bootstrap-dd-flow-home");
  try {
    await provisionRuntimeEngine(sourceProjectRoot, transientHome);
    await commandJson(bin, ["run", "snapshot", "bootstrap", "create", "--project-root", sourceProjectRoot, "--output", snapshotRoot], { cwd: sourceProjectRoot, env: { DD_FLOW_HOME: transientHome } });
  }
  finally { await rm(transientHome, { recursive: true, force: true }); }
  const snapshot = { kind: "bootstrap", locator: canonicalLocator(home, snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "bootstrap.json")), run_id: null };
  const entry = canonicalEntry({ caseId: loaded.value.id, revision, stage: "specify", snapshot, blueprint });
  await writeJsonAtomic(path.join(root, "entries", "e2e.json"), entry);
  await writeJsonAtomic(path.join(root, "entries", "specify.json"), entry);
  return entry;
}
async function canonicalSourcePreflight(projectRoot) {
  const policyFile = path.join(projectRoot, ".memory-bank", "dd-flow", "project-workspace.json");
  const policy = await readJson(policyFile);
  const integrationBranch = policy?.schema_id === "dd-flow/project-workspace@1" && typeof policy.workspace?.integration_branch === "string" ? policy.workspace.integration_branch : null;
  if (!integrationBranch) fail(`canonical source has no valid workspace integration branch: ${policyFile}`, "canonical_workspace_policy_invalid");
  const [branch, dirty, head] = await Promise.all([
    commandText("git", ["branch", "--show-current"], { cwd: projectRoot }),
    commandText("git", ["status", "--porcelain"], { cwd: projectRoot }),
    commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot })
  ]);
  if (branch !== integrationBranch || dirty) {
    fail(`canonical source must be a clean ${integrationBranch} integration checkout`, "canonical_source_workspace_invalid");
  }
  return { integration_branch: integrationBranch, head };
}
export async function canonicalBuild({ profileFile, projectRoot }) {
  const profile = await loadRunProfile(profileFile); const loaded = await loadCaseV6(profile.value.case_id);
  const source = path.join(loaded.root, "entry-pack-source"); const blueprint = validateStageBlueprint(await readJson(path.join(source, "stage-context.json")));
  if (!projectRoot || !path.isAbsolute(projectRoot) || !(await exists(projectRoot))) fail("canonical build requires an existing absolute --project-root", "canonical_source_required");
  const sourcePreflight = await canonicalSourcePreflight(path.resolve(projectRoot));
  const home = evalHome(); const canonicalRoot = path.join(home, "canonical", loaded.value.id); const revision = nextRevision(await readdir(canonicalRoot, { withFileTypes: true }).then((list) => list.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).catch(() => []));
  const root = path.join(canonicalRoot, revision); await mkdir(root, { recursive: true }); const events = path.join(root, "build", "events.jsonl");
  try {
    await writeJsonAtomic(path.join(root, "stage-context.json"), blueprint);
    const entry = await createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot: path.resolve(projectRoot) });
    const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "awaiting_reference_resume", profile: profile.value.id, profile_file: profile.file, source_project_root: path.resolve(projectRoot), source_preflight: sourcePreflight, blueprint_sha256: hashJson(blueprint), current_stage: "specify", reference: { session_id: null, daemon_state: null, run_id: null }, entries: { e2e: "entries/e2e.json", specify: "entries/specify.json" }, created_at: now() };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.canonical.planned", data: { state: state.status, entry } });
    return { ...state, build: root, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function canonicalState(buildRoot) {
  const root = path.resolve(buildRoot); const state = await readJson(path.join(root, "build", "state.json"));
  if (state.schema_id !== "dd-eval/canonical-build-state@1" || typeof state.case_id !== "string" || typeof state.current_stage !== "string") fail("invalid canonical build state", "canonical_state_invalid");
  return { root, state, loaded: await loadCaseV6(state.case_id), blueprint: validateStageBlueprint(await readJson(path.join(root, "stage-context.json"))) };
}
async function referenceRoots(root, state, entry) {
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  if (!state.reference?.run_id) return { projectRoot, runtimeRoot, workspaceRoot: projectRoot, runRoot: null };
  const status = await commandJson(process.env.DD_FLOW_BIN ?? "dd-flow", ["run", "status", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const run = status.run ?? status.index?.run;
  if (!run?.run_home_path || !run?.workspace_root) fail("reference RUN has no workspace roots", "canonical_state_invalid");
  return { projectRoot, runtimeRoot, workspaceRoot: run.workspace_root, runRoot: run.run_home_path };
}
async function startReferenceDaemon(profile, roots, root) {
  const daemonState = path.join(root, "reference", "drivers", "daemon"); const journal = path.join(root, "reference", "drivers", "subject.events.jsonl");
  const daemonArgs = ["--state-dir", daemonState];
  const codexHome = path.join(root, "reference", "codex-home"); const env = { DD_FLOW_HOME: roots.runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {}) };
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, codexHome });
  const args = ["daemon", "start", ...daemonArgs, "--cwd", roots.projectRoot, "--journal", journal];
  try { await callDriver(profile, args, { cwd: roots.projectRoot, env }); }
  catch (error) {
    if (error?.code !== "driver_failed" || !String(error.message).includes("daemon did not become ready")) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await callDriver(profile, args, { cwd: roots.projectRoot, env });
  }
  return { daemonState, daemonArgs, journal, env };
}
async function restartIdleReferenceDaemon({ profile, daemon, roots, root, sessionId }) {
  const status = await callDriver(profile, ["daemon", "status", ...daemon.daemonArgs], { cwd: roots.projectRoot, env: daemon.env });
  if (status.active_operation !== "session.prompt") return daemon;
  const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
  if (provider.thread?.status?.type !== "idle") return daemon;
  await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: roots.projectRoot, env: daemon.env });
  return await startReferenceDaemon(profile, roots, root);
}
async function stopReferenceDaemon(root, state) {
  if (!state.reference?.session_id) return;
  const runProfile = await loadRunProfile(state.profile_file); const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home"); const daemonState = path.join(root, "reference", "drivers", "daemon");
  const env = { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(root, "reference", "codex-home") } : {}) };
  await callDriver(profile, ["daemon", "stop", "--state-dir", daemonState], { cwd: projectRoot, env });
}

export async function canonicalResume({ buildRoot }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "awaiting_reference_resume") fail(`canonical build is ${state.status}, not awaiting reference resume`, "canonical_transition_invalid");
  const runProfile = await loadRunProfile(state.profile_file);
  const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const stage = state.current_stage; const entry = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [{ stage, terminal_stage: stage }], runProfile });
  let roots;
  if (!state.reference.session_id) {
    await mkdir(path.join(root, "reference", "project"), { recursive: true });
    const restored = await restoreStageSnapshot({ home: evalHome(), entry, stage, projectRoot: path.join(root, "reference", "project"), runtimeRoot: path.join(root, "reference", "dd-flow-home") });
    await materializeTaskInput(loaded.root, blueprint, stage, restored.project_root);
    roots = { projectRoot: restored.project_root, runtimeRoot: path.join(root, "reference", "dd-flow-home"), workspaceRoot: restored.workspace_root, runRoot: restored.run_home };
  } else {
    roots = await referenceRoots(root, state, entry);
  }
  const contextFile = path.join(root, "reference", "stage-context", `${stage}.json`);
  const slice = await materializeStageSlice({ blueprint, stage, roots: { project: roots.projectRoot, workspace: roots.workspaceRoot, ...(roots.runRoot ? { run: roots.runRoot } : {}) }, output: contextFile });
  const contextSha256 = sha256(await readFile(contextFile));
  const launcher = entryLauncher({ stage, entry, projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, contextFile, contextSha256, profile });
  await mkdir(path.join(root, "reference", "launchers"), { recursive: true });
  await writeFile(path.join(root, "reference", "launchers", `${stage}.md`), `${launcher}\n`);
  let daemon = await startReferenceDaemon(profile, roots, root);
  const doctor = await callDriver(profile, ["doctor", "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env }); assertObservedProfile(doctor, profile, "reference harness doctor");
  await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.harness.preflight", data: { harness: profile.harness, receipt: doctor } });
  let sessionId = state.reference.session_id; const recovering = Boolean(sessionId);
  if (!sessionId) {
    const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
    assertObservedProfile(created, profile, "reference Subject Session");
    sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("reference driver did not return a provider Session", "driver_protocol");
    state.reference = { ...state.reference, session_id: sessionId, daemon_state: daemon.daemonState, stage_sessions: { ...(state.reference.stage_sessions ?? {}), [stage]: sessionId } };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.session_created", data: { state: "reference_running", stage, session_id: sessionId } });
  }
  let prompted = state.reference.last_turn; let lifecycle; let turnPrompt = launcher; let hitlRounds = Number(state.reference.hitl_rounds ?? 0);
  const driveReferenceFanout = async () => {
    try {
      return await driveFanout({ profile, attempt: path.join(root, "reference"), projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, runId: lifecycle.run_id, stage, eventsFile: path.join(root, "build", "events.jsonl"), event: { source: "dd-eval://runner", runId: state.revision } });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "fanout_failed";
      state.status = "failed";
      state.failure = { code, message: error instanceof Error ? error.message : String(error), stage, at: now() };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.fanout_failed", data: state.failure });
      await stopReferenceDaemon(root, state);
      throw error;
    }
  };
  const prepareHitlResume = async () => {
    const fixture = await interactionFixture(loaded.root, stage); const record = stageRecord(lifecycle, stage); const questionPath = record?.pause?.question_path;
    const samePendingPause = state.reference.pending_pause_id === record?.pause?.id;
    if (fixture.mode === "forbidden" || (hitlRounds >= fixture.max_rounds && !samePendingPause) || !questionPath) return null;
    const question = await readFile(questionPath, "utf8");
    const judged = lifecycle.judged_hitl ?? await interactionJudge({ runProfile, fixture, question, attempt: path.join(root, "reference"), stage, subjectProfile: profile, projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, contextFile });
    if (judged.verdict.status !== "matched" || judged.verdict.response_ids.length === 0 || judged.verdict.uncovered_questions.length > 0) return null;
    const responses = new Map(fixture.responses.map((response) => [response.id, response.answer])); const answer = judged.verdict.response_ids.map((id) => responses.get(id)).join("\n\n");
    if (!samePendingPause) {
      hitlRounds += 1;
      state.reference = { ...state.reference, hitl_rounds: hitlRounds, pending_pause_id: record.pause.id };
    }
    const answerFile = await materializeHitlAnswer({ attempt: path.join(root, "reference"), stage, round: hitlRounds, answer });
    const prompt = await resumePrompt({ lifecycle, stage, question, answerFile, runtimeRoot: roots.runtimeRoot, projectRoot: roots.projectRoot });
    await writeFile(path.join(root, "reference", "launchers", `${stage}-resume-${hitlRounds}.md`), `${prompt}\n`);
    await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.hitl.matched", data: { stage, round: hitlRounds, pause_id: record.pause.id, response_ids: judged.verdict.response_ids, judge_session_id: judged.session_id } });
    return prompt;
  };
  if (recovering) {
    try { lifecycle = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: state.reference.run_id ?? entry.snapshot.run_id }); }
    catch (error) {
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      const active = provider.thread?.status?.type !== "idle";
      if (active) return { build: root, state, next: { kind: "wait_reference_turn", stage, session_id: sessionId } };
      throw Object.assign(new Error("reference Session is idle without a reconcilable lifecycle; refusing to repeat its launcher"), { code: "reference_turn_unreconciled", cause: error });
    }
    state.reference = { ...state.reference, run_id: lifecycle.run_id };
    // A controller can restart after the provider has returned a material
    // question but before this process persisted the corresponding pause.  Use
    // the same semantic Judge path as a live turn; never replay the launcher
    // merely because that short bookkeeping window was interrupted.
    lifecycle = await registerJudgedTerminalQuestion({ root, revision: state.revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile });
    state.reference = { ...state.reference, run_id: lifecycle.run_id };
    const isAcceptedSuccessor = (state.accepted_boundaries ?? []).some((boundary) => nextStage(boundary.stage) === stage);
    if (isAcceptedSuccessor && stageSessionMode(lifecycle) === "new_session" && !state.reference.stage_sessions?.[stage]) {
      const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      const successorSession = created.provider_session_id ?? created.session_id;
      if (typeof successorSession !== "string") fail("reference driver did not create the required successor Session", "driver_protocol");
      state.reference = { ...state.reference, session_id: successorSession, stage_sessions: { ...(state.reference.stage_sessions ?? {}), [stage]: successorSession } };
      sessionId = successorSession;
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.successor_session_created", data: { stage, session_id: sessionId } });
    }
    if (lifecycle.stage_status === "done") turnPrompt = null;
    else if (lifecycle.stage_status === "paused") turnPrompt = await prepareHitlResume();
    else if (lifecycle.stage_status === "running") {
      const fanout = await driveReferenceFanout();
      if (fanout?.state === "awaiting_worker") return { build: root, state, lifecycle, next: { kind: "wait_reference_worker", stage } };
      if (!fanout?.continuation) throw Object.assign(new Error(`reference Session is idle with non-terminal ${stage} lifecycle and no fan-out continuation`), { code: "reference_turn_unreconciled" });
      turnPrompt = fanout.continuation;
    }
    else if (!lifecycle.stage_status && isAcceptedSuccessor && !state.reference.active_turn) turnPrompt = launcher;
    else {
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      if (provider.thread?.status?.type !== "idle") return { build: root, state, lifecycle, next: { kind: "wait_reference_turn", stage, session_id: sessionId } };
      throw Object.assign(new Error(`reference Session is idle with non-terminal ${stage} lifecycle; refusing to repeat its launcher`), { code: "reference_turn_unreconciled" });
    }
    if (turnPrompt) daemon = await restartIdleReferenceDaemon({ profile, daemon, roots, root, sessionId });
  }
  while (turnPrompt) {
    state.reference = { ...state.reference, active_turn: { stage, prompt_sha256: sha256(turnPrompt), dispatched_at: now() } };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.turn_dispatched", data: { stage, session_id: sessionId, prompt_sha256: state.reference.active_turn.prompt_sha256 } });
    prompted = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", turnPrompt, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env, onProgress: () => appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.progress", data: { state: "reference_running", stage } }) });
    state.reference = { ...state.reference, active_turn: null, last_turn: prompted, hitl_rounds: hitlRounds };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.turn_terminal", data: { stage, session_id: sessionId } });
    lifecycle = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: state.reference.run_id ?? entry.snapshot.run_id });
    state.reference = { ...state.reference, run_id: lifecycle.run_id };
    if (lifecycle.stage_status !== "paused") state.reference = { ...state.reference, pending_pause_id: null };
    lifecycle = await registerJudgedTerminalQuestion({ root, revision: state.revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile });
    if (lifecycle.stage_status === "paused") turnPrompt = await prepareHitlResume();
    else if (lifecycle.stage_status === "running") {
      const fanout = await driveReferenceFanout();
      if (fanout?.state === "awaiting_worker") return { build: root, state, lifecycle, next: { kind: "wait_reference_worker", stage } };
      turnPrompt = fanout?.continuation ?? null;
    } else turnPrompt = null;
  }
  state.reference = { ...state.reference, run_id: lifecycle.run_id, last_turn: prompted };
  if (lifecycle.stage_status === "done") {
    const fixture = await interactionFixture(loaded.root, stage);
    if (fixture.mode === "required" && hitlRounds === 0) fail(`required HITL did not occur at ${stage}`, "required_hitl_missing");
    state.status = "waiting_for_reference_review";
    state.completed_stage = stage;
    state.context_receipt = { semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256 };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.stage_done", data: { state: state.status, stage, run_id: lifecycle.run_id } });
    return { build: root, state, lifecycle, next: { kind: "reference_review", message: `Review ${stage}, then run canonical boundary accept.` } };
  }
  state.status = lifecycle.stage_status === "paused" ? "waiting_for_reference_hitl" : "failed";
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.stage_incomplete", data: { state: state.status, stage, lifecycle } });
  fail(`reference Subject did not finish ${stage} (${lifecycle.stage_status ?? "stage missing"})`, lifecycle.stage_status === "paused" ? "registered_hitl_requires_interaction_judge" : "incomplete_subject_turn");
}

export async function canonicalBoundaryAccept({ buildRoot, stage, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "waiting_for_reference_review" || state.completed_stage !== stage || state.current_stage !== stage) fail("canonical build is not waiting for this stage review", "canonical_transition_invalid");
  const review = path.resolve(reviewFile); if (!(await exists(review)) || !(await readFile(review, "utf8")).trim()) fail("canonical boundary review must be a non-empty file", "canonical_review_required");
  const successor = nextStage(stage);
  if (!successor) {
    await stopReferenceDaemon(root, state);
    state.status = "entries_captured";
    state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review: review, sha256: await manifestHash(review), at: now() }];
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage } });
    return { build: root, state, next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)}` } };
  }
  const snapshotRoot = path.join(root, "stages", successor, "snapshot");
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  await commandJson(process.env.DD_FLOW_BIN ?? "dd-flow", ["run", "snapshot", "create", state.reference.run_id, "--stage-entry", successor, "--project-root", projectRoot, "--output", snapshotRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const snapshot = { kind: "run", locator: canonicalLocator(evalHome(), snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "snapshot.json")), run_id: state.reference.run_id };
  const entry = canonicalEntry({ caseId: loaded.value.id, revision: state.revision, stage: successor, snapshot, blueprint });
  const entryPath = path.join(root, "entries", `${successor}.json`); await writeJsonAtomic(entryPath, entry);
  state.entries[successor] = path.relative(root, entryPath); state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review, sha256: await manifestHash(review), at: now() }]; state.current_stage = successor; state.completed_stage = null; state.status = "awaiting_reference_resume";
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage, successor, snapshot: snapshot.locator } });
  return { build: root, state, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
}

async function canonicalCandidatePack(root, state, blueprint) {
  const required = ["e2e", ...stages];
  if (required.some((key) => typeof state.entries?.[key] !== "string")) fail("canonical build has not captured every declared entry", "canonical_entries_incomplete");
  const e2e = validateStageEntry(await readJson(path.join(root, state.entries.e2e)), "specify");
  const entries = {};
  for (const stage of stages) entries[stage] = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage);
  const buildTrace = path.join(root, "build", "events.jsonl");
  const pack = await writeEntryPack({ caseDir: path.join(root, state.case_id), revision: state.revision, inputCheckpoint: { id: "reference-chain", sha256: state.blueprint_sha256 }, flow: { contour: stages, terminal_stage: stages.at(-1) }, stageBlueprint: blueprint, entries, e2e, authoring: { profile_id: state.profile, build_trace_sha256: await manifestHash(buildTrace) } });
  pack.entries = Object.fromEntries(["e2e", ...stages].map((key) => [key, state.entries[key]]));
  pack.hashes = { ...pack.hashes, e2e_sha256: hashJson(e2e), focused_entries: Object.fromEntries(Object.entries(entries).map(([stage, entry]) => [stage, hashJson(entry)])) };
  pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  return pack;
}

export async function canonicalQualify({ buildRoot, profileFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "entries_captured") fail(`canonical build is ${state.status}, not ready to qualify`, "canonical_transition_invalid");
  const profile = await loadRunProfile(profileFile ?? state.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification profile belongs to another case", "canonical_profile_mismatch");
  const requiredFocused = new Set(stages);
  if (!profile.value.selection.e2e || profile.value.selection.focused_stages.some((stage) => !stageSet.has(stage)) || profile.value.selection.focused_stages.length !== requiredFocused.size) fail("qualification profile must cover every focused stage and E2E", "qualification_profile_incomplete");
  const candidatePack = await canonicalCandidatePack(root, state, blueprint); const packFile = path.join(root, "entry-pack.json"); await writeJsonAtomic(packFile, candidatePack);
  const validated = { case_id: state.case_id, revision: state.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries: Object.fromEntries(Object.entries(candidatePack.entries).map(([key, file]) => [key, { file }])) };
  const subject = (await loadProfile(profile.value.subject.profile_id)).value; const qualificationId = `QUAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const output = path.join(root, "qualification", qualificationId);
  state.status = "qualifying"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_started", data: { state: state.status, qualification_id: qualificationId } });
  try {
    const result = await executeEval({ runProfile: profile, profile: subject, loaded, validated, root: output, runId: qualificationId, kind: "qualification" });
    const receipt = { schema_id: "dd-eval/qualification-receipt@1", qualification_id: qualificationId, status: "qualified", profile_file: profile.file, result, created_at: now() };
    await writeJsonAtomic(path.join(root, "qualification", "receipt.json"), receipt);
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId } });
    return { build: root, state, receipt, next: { kind: "entry_review", entries: ["e2e", ...stages] } };
  } catch (error) {
    state.status = "package_gap"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_failed", data: { state: state.status, error: error instanceof Error ? error.message : String(error) } }); throw error;
  }
}

export async function canonicalAccept({ buildRoot, entry: entryName, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "waiting_for_entry_review") fail("canonical build is not waiting for entry reviews", "canonical_transition_invalid");
  if (!["e2e", ...stages].includes(entryName)) fail("unknown canonical entry", "canonical_entry_unknown");
  const receiptFile = path.join(root, state.qualification?.receipt ?? ""); if (!(await exists(receiptFile))) fail("canonical entry acceptance requires a qualification receipt", "qualification_receipt_missing");
  const receipt = await readJson(receiptFile); if (receipt.status !== "qualified") fail("canonical entry acceptance requires successful qualification", "qualification_not_successful");
  const review = path.resolve(reviewFile); if (!(await exists(review)) || !(await readFile(review, "utf8")).trim()) fail("canonical entry review must be a non-empty file", "canonical_review_required");
  state.entry_reviews = { ...(state.entry_reviews ?? {}), [entryName]: { review, sha256: await manifestHash(review), at: now() } };
  const allAccepted = ["e2e", ...stages].every((key) => state.entry_reviews[key]);
  if (!allAccepted) {
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.entry_accepted", data: { state: state.status, entry: entryName } });
    return { build: root, state, next: { kind: "entry_review", remaining: ["e2e", ...stages].filter((key) => !state.entry_reviews[key]) } };
  }
  const pack = await canonicalCandidatePack(root, state, blueprint); pack.entries = Object.fromEntries(["e2e", ...stages].map((key) => [key, `${key}.json`])); pack.status = "accepted"; pack.accepted_at = now(); pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  const destination = path.join(loaded.root, "stage-entries", state.revision); await mkdir(destination, { recursive: true });
  await writeJsonAtomic(path.join(destination, "stage-context.json"), blueprint);
  for (const key of ["e2e", ...stages]) await writeJsonAtomic(path.join(destination, `${key}.json`), await readJson(path.join(root, state.entries[key])));
  await writeJsonAtomic(path.join(destination, "entry-pack.json"), pack);
  const reviews = path.join(loaded.root, "checkpoint-reviews", state.revision); await mkdir(reviews, { recursive: true });
  for (const [key, value] of Object.entries(state.entry_reviews)) await cp(value.review, path.join(reviews, `${key}.md`), { force: true });
  const caseFile = path.join(loaded.root, "case.json"); const caseValue = await readJson(caseFile); caseValue.status = "runnable"; caseValue.entry_pack = path.relative(loaded.root, path.join(destination, "entry-pack.json")); await writeJsonAtomic(caseFile, caseValue);
  state.status = "promoted_pending_commit"; state.promoted_entry_pack = path.relative(loaded.root, path.join(destination, "entry-pack.json"));
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.promoted", data: { state: state.status, entry_pack: state.promoted_entry_pack } });
  return { build: root, state, next: { kind: "git_commit", message: "Review, commit and push the promoted case definition before scored execution." } };
}

export async function canonicalStatus({ buildRoot }) {
  const root = path.resolve(buildRoot);
  const state = await readJson(path.join(root, "build", "state.json"));
  const events = await readEvents(path.join(root, "build", "events.jsonl"));
  return { build: root, state, journal: reduceEvents(events) };
}

async function verifySnapshot(home, entry, stage) {
  const root = contained(home, entry.snapshot.locator, "snapshot locator");
  const manifestFile = path.join(root, entry.snapshot.kind === "bootstrap" ? "bootstrap.json" : "snapshot.json");
  if (!(await exists(manifestFile))) fail(`snapshot manifest is missing: ${manifestFile}`, "snapshot_missing");
  const bytes = await readFile(manifestFile);
  if (sha256(bytes) !== entry.snapshot.manifest_sha256) fail(`snapshot manifest checksum does not match: ${manifestFile}`, "snapshot_checksum_mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (entry.snapshot.kind === "run") {
    if (manifest.schema_id !== "dd-flow/eval-run-snapshot@5" || manifest.purpose !== "stage_entry" || manifest.run_id !== entry.snapshot.run_id || manifest.stage_entry !== stage) fail("RUN snapshot does not match its stage entry", "snapshot_contract_mismatch");
  } else if (manifest.schema_id !== "dd-eval/bootstrap-snapshot@1" || manifest.stage !== "specify") {
    fail("bootstrap entry requires a dd-eval/bootstrap-snapshot@1 snapshot", "snapshot_contract_mismatch");
  }
  return { root, manifest };
}
async function restoreStageSnapshot({ home, entry, stage, projectRoot, runtimeRoot }) {
  const snapshot = await verifySnapshot(home, entry, stage);
  // The bootstrap restore owns initial project creation; a runner must not
  // depend on a provider creating this directory as a side effect.
  await mkdir(projectRoot, { recursive: true });
  if (entry.snapshot.kind === "bootstrap") {
    const restored = await commandJson(process.env.DD_FLOW_BIN ?? "dd-flow", ["run", "snapshot", "bootstrap", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    if (restored.target_stage !== "specify") fail("restored bootstrap does not target SPECIFY", "snapshot_restore_mismatch");
    await provisionRuntimeEngine(projectRoot, runtimeRoot);
    await mkdir(runtimeRoot, { recursive: true });
    // A bootstrap snapshot has no runtime project record by design. Register
    // the restored root before harness preparation: Codex-home initialization
    // needs that record, while the later bootstrap stage start remains the
    // sole operation that creates the RUN and starts SPECIFY.
    await commandJson(process.env.DD_FLOW_BIN ?? "dd-flow", ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null, snapshot: snapshot.root };
  }
  const restored = await commandJson(process.env.DD_FLOW_BIN ?? "dd-flow", ["run", "snapshot", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  if (restored.run_id !== entry.snapshot.run_id || restored.target_stage !== stage) fail("restored RUN does not match its stage entry", "snapshot_restore_mismatch");
  await provisionRuntimeEngine(projectRoot, runtimeRoot);
  return { ...restored, snapshot: snapshot.root };
}
async function provisionRuntimeEngine(projectRoot, runtimeRoot) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const global = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: {} });
  const selected = global.selection?.selected;
  if (!selected?.snapshot_root || !selected?.entrypoint || !selected?.package_version) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
  await commandJson(process.execPath, [path.join(selected.snapshot_root, selected.entrypoint), "engine", "install"], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const isolated = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  if (isolated.selection?.selected?.package_version !== selected.package_version) fail("isolated runtime did not resolve the selected dd-flow engine", "canonical_engine_install_failed");
  return isolated.selection.selected;
}
async function initializeCodexHome({ projectRoot, runtimeRoot, codexHome }) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const initialized = await commandJson(bin, ["codex", "home", "init", "--project-root", projectRoot, "--target-home", codexHome], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  if (initialized.ok === false) fail("could not initialize isolated Codex home", "hook_preflight_failed");
  return initialized;
}
async function materializeTaskInput(caseRoot, blueprint, stage, projectRoot) {
  const slice = blueprint.stages?.[stage];
  for (const item of slice?.task_input ?? []) {
    if (typeof item.source !== "string") fail(`stage ${stage} task input ${item.role} has no entry-pack source`);
    const source = contained(path.join(caseRoot, "entry-pack-source"), item.source, "task input source");
    const sourceBytes = await readFile(source); if (sha256(sourceBytes) !== item.sha256) fail(`stage ${stage} task input checksum does not match for ${item.role}`, "task_input_checksum_mismatch");
    const destination = path.resolve(projectRoot, item.path);
    if (!(destination === projectRoot || destination.startsWith(`${projectRoot}${path.sep}`))) fail(`task input escapes restored project: ${item.path}`);
    await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination, { force: true });
  }
}
function driverFor(profile) { return profile.harness === "codex-desktop" ? "dd-codex.mjs" : profile.harness === "zcode-acp" ? "dd-zcode.mjs" : profile.harness === "grok-acp" ? "dd-grok.mjs" : profile.harness === "opencode-server" ? "dd-opencode.mjs" : profile.harness === "antigravity-cli" ? "dd-agy.mjs" : fail(`unsupported harness: ${profile.harness}`); }
function assertObservedProfile(receipt, profile, label) {
  if (receipt?.harness && receipt.harness !== profile.harness) fail(`${label} returned harness ${receipt.harness}, expected ${profile.harness}`, "profile_drift");
  const observed = receipt?.observed_profile;
  if (!observed) return;
  if (observed.model && observed.model !== profile.model) fail(`${label} observed model ${observed.model}, expected ${profile.model}`, "profile_drift");
  if (observed.reasoning && observed.reasoning !== profile.reasoning) fail(`${label} observed reasoning ${observed.reasoning}, expected ${profile.reasoning}`, "profile_drift");
}
async function callDriver(profile, args, options) {
  const { spawn } = await import("node:child_process"); const executable = process.execPath; const script = path.join(repoRoot, "bin", driverFor(profile));
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...args, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", (error) => { if (progress) clearInterval(progress); reject(error); });
    child.on("close", (code) => { if (progress) clearInterval(progress); if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `driver exited ${code}`), { code: "driver_failed" })); try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(new Error(`driver returned invalid JSON: ${error.message}`)); } });
  });
}

async function commandJson(bin, args, options) {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `${bin} exited ${code}`), { code: "flow_reconciliation_failed" }));
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(Object.assign(new Error(`${bin} returned invalid JSON: ${error.message}`), { code: "flow_reconciliation_failed" })); }
    });
  });
}

async function commandJsonInput(bin, args, input, options) {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["pipe", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.stdin.end(input);
    child.on("close", (code) => {
      if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `${bin} exited ${code}`), { code: "flow_reconciliation_failed" }));
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(Object.assign(new Error(`${bin} returned invalid JSON: ${error.message}`), { code: "flow_reconciliation_failed" })); }
    });
  });
}

async function commandText(bin, args, options) {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `${bin} exited ${code}`), { code: "command_failed" })));
  });
}
async function committedDefinitionIdentity() {
  const dirty = await commandText("git", ["status", "--porcelain"], { cwd: repoRoot });
  if (dirty) fail("scored execution requires a clean committed dd-eval definition tree", "definition_tree_dirty");
  const [commit, tree] = await Promise.all([
    commandText("git", ["rev-parse", "HEAD"], { cwd: repoRoot }),
    commandText("git", ["rev-parse", "HEAD^{tree}"], { cwd: repoRoot })
  ]);
  return { repository: repoRoot, commit, tree };
}

async function reconcileFlow({ projectRoot, runtimeRoot, expectedStage, runId }) {
  const env = { DD_FLOW_HOME: runtimeRoot }; const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  let resolvedRunId = runId;
  if (!resolvedRunId) {
    const listed = await commandJson(bin, ["run", "list", "--project-root", projectRoot], { cwd: projectRoot, env });
    const runs = listed.runs ?? listed.items ?? listed.data ?? [];
    if (!Array.isArray(runs) || runs.length !== 1 || typeof runs[0]?.id !== "string") fail("bootstrap lifecycle did not yield exactly one RUN", "flow_reconciliation_failed");
    resolvedRunId = runs[0].id;
  }
  const status = await commandJson(bin, ["run", "status", resolvedRunId, "--project-root", projectRoot], { cwd: projectRoot, env });
  const stages = status.index?.stage_runs ?? status.run?.index?.stage_runs ?? [];
  const stage = Array.isArray(stages) ? stages.find((item) => item?.stage === expectedStage) : null;
  return { run_id: resolvedRunId, status, stage_status: stage?.status ?? null };
}

// A harness Turn can end with a user-facing question even when the model omitted
// the mechanical pause command.  The runner never guesses whether text is a
// question: an independent Interaction Judge must first match it to the
// declared fixture.  Only then do we persist the exact text as the stage pause.
async function registerJudgedTerminalQuestion({ root, revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile }) {
  if (lifecycle.stage_status !== "running" || typeof prompted?.assistant_text !== "string" || !prompted.assistant_text.trim()) return lifecycle;
  const fixture = await interactionFixture(loaded.root, stage);
  // A declared optional question is still a legitimate HITL boundary. The
  // Judge must match it before registration; only an undeclared question is
  // forbidden. "required" merely adds the later obligation that it occurred.
  if (fixture.mode === "forbidden") return lifecycle;
  const judgment = await interactionJudge({ runProfile, fixture, question: prompted.assistant_text, attempt: path.join(root, "reference"), stage, subjectProfile: profile, projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, contextFile });
  if (judgment.verdict.status !== "matched" || judgment.verdict.response_ids.length === 0 || judgment.verdict.uncovered_questions.length > 0) return lifecycle;
  const index = lifecycle.status?.index ?? lifecycle.status?.run?.index;
  const workId = index?.root_work_id;
  if (typeof workId !== "string" || !workId) fail("running stage has no root Work for a judged HITL pause", "flow_reconciliation_failed");
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  await commandJsonInput(bin, ["stage", "pause", lifecycle.run_id, "--stage", stage, "--work", workId, "--question-stdin", "--project-root", roots.projectRoot], prompted.assistant_text, { cwd: roots.projectRoot, env: { DD_FLOW_HOME: roots.runtimeRoot } });
  await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.reference.hitl.registered_from_judged_turn", data: { stage, work_id: workId, judge_session_id: judgment.session_id } });
  const reconciled = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: lifecycle.run_id });
  return { ...reconciled, judged_hitl: { verdict: judgment.verdict, session_id: judgment.session_id } };
}
function restoredRoots(lifecycle, projectRoot, runtimeRoot) {
  const run = lifecycle.status?.run ?? lifecycle.status?.index?.run;
  if (!run?.workspace_root || !run?.run_home_path) fail("flow status does not expose restored workspace roots", "flow_reconciliation_failed");
  return { project: projectRoot, workspace: run.workspace_root, run: run.run_home_path, runtime: runtimeRoot };
}
export function stageSessionMode(lifecycle) {
  // `dd-flow run status` exposes the persisted profile on `index`, whereas
  // the convenience `run` projection contains only its public summary.
  // Read both shapes so the runner obeys the actual run-level handoff policy.
  const profile = lifecycle.status?.index?.execution_profile ?? lifecycle.status?.run?.execution_profile;
  return profile?.settings?.stage_session_mode ?? "same_session";
}
async function collectFlowStatistics({ projectRoot, runtimeRoot, runId }) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow"; const env = { DD_FLOW_HOME: runtimeRoot };
  const [usage, sessions] = await Promise.all([
    commandJson(bin, ["stat", "usage", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env }),
    commandJson(bin, ["stat", "run", "sessions", "ls", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env })
  ]);
  return { collected_at: now(), usage, sessions };
}
async function captureCandidate({ projectRoot, runtimeRoot, runId, attempt }) {
  const output = path.join(attempt, "candidate");
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const manifestFile = path.join(output, "snapshot.json");
  const created = await exists(manifestFile) ? { reused: true } : await commandJson(bin, ["run", "snapshot", "create", runId, "--candidate", "--project-root", projectRoot, "--output", output], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const bytes = await readFile(manifestFile);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schema_id !== "dd-flow/eval-run-snapshot@5" || manifest.purpose !== "candidate" || manifest.run_id !== runId || manifest.stage_entry !== null) fail("candidate checkpoint does not match its completed RUN", "candidate_checkpoint_invalid");
  return { snapshot: output, manifest: manifestFile, manifest_sha256: sha256(bytes), created };
}
async function freezeRunCandidate({ root, runId, manifest, results }) {
  const candidates = results.map((result) => {
    if (result.state !== "candidate_ready" || !result.candidate?.manifest_sha256) fail(`cannot freeze failed or incomplete execution ${result.execution}`, "candidate_checkpoint_missing");
    return { execution: result.execution, stage: result.stage, run_id: result.run_id, session_id: result.session_id, checkpoint: result.candidate };
  });
  const candidate = { schema_id: "dd-eval/run-candidate@1", run_id: runId, manifest_sha256: hashJson(manifest), executions: candidates, frozen_at: now() };
  candidate.immutable_hash = hashJson(candidate);
  const file = path.join(root, "candidate.json"); await writeJsonAtomic(file, candidate);
  return { file, ...candidate };
}
export function entryLauncher({ stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile }) {
  const prefix = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} dd-flow stage start`;
  const shared = `--stage ${stage} --project-root ${JSON.stringify(projectRoot)} --context-file ${JSON.stringify(contextFile)} --context-sha256 ${contextSha256} --require-session-binding --json`;
  const command = entry.snapshot.run_id === null ? `${prefix} --bootstrap --subject eval-subject ${shared}` : `${prefix} ${entry.snapshot.run_id} ${shared}`;
  return [
    `Execute exactly one ${stage} Stage for this evaluation attempt.`,
    "Your first technical action must be this exact standalone lifecycle command:",
    `\`${command}\``,
    "Use the returned authoritative prompt and perform only this Stage. If `stage start` returns an `orchestration` object with kind `work_fanout`, stop immediately after that lifecycle command: the runner will either dispatch its declared child Work or return this same coordinator Session once to materialize an agent-owned graph, then continue it when Work settles. If it needs a material user answer, run the exact `stage pause` lifecycle command from that prompt before showing the question, then stop the Turn. Otherwise finish this Stage, then stop the Turn.",
    "The runner alone owns stage transitions and will send any successor-stage launcher in a later turn. Do not call a successor stage start, even if a normal dd-flow finish receipt shows a next command."
  ].join("\n");
}
function stageRecord(lifecycle, stage) {
  const records = lifecycle.status?.index?.stage_runs ?? lifecycle.status?.run?.index?.stage_runs ?? [];
  return Array.isArray(records) ? records.find((record) => record?.stage === stage) ?? null : null;
}
function hitlRoundsFor(events, executionId, stage) {
  return events.filter((event) => event.executionid === executionId && event.type === "dev.dd.eval.hitl.matched" && event.data?.stage === stage).length;
}

function executionEvidence(result) {
  const started = typeof result.started_at === "string" ? Date.parse(result.started_at) : Number.NaN;
  const finished = typeof result.finished_at === "string" ? Date.parse(result.finished_at) : Number.NaN;
  return {
    execution: result.execution,
    state: result.state,
    stage: result.stage ?? null,
    run_id: result.run_id ?? null,
    subject_session_id: result.session_id ?? null,
    stage_boundaries: result.boundaries ?? [],
    lifecycle: result.lifecycle ?? null,
    candidate: result.candidate ?? null,
    usage: result.statistics?.usage ?? null,
    sessions: result.statistics?.sessions ?? null,
    tool_evidence: result.driver?.evidence?.tool_calls ?? null,
    timing: { started_at: result.started_at ?? null, finished_at: result.finished_at ?? null, wall_clock_ms: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null },
    context_diagnostics: {
      observation_coverage: result.driver?.evidence?.tool_calls ? "partial" : "unavailable",
      declared_package_sha256: result.semantic_package_sha256 ?? null,
      materialized_context_sha256: result.materialized_context_sha256 ?? null,
      note: "Tool events are evidence for a Judge or analyst; the runner does not infer a context miss from an extra read alone."
    },
    artifacts: { attempt: result.attempt ?? null, driver_journal: result.attempt ? path.join(result.attempt, "drivers", "subject.events.jsonl") : null }
  };
}

function buildEvidencePacket({ manifest, results, candidate }) {
  return {
    schema_id: "dd-eval/evaluator-evidence@1",
    run_id: manifest.run_id,
    definition: manifest.definition ?? null,
    candidate_sha256: candidate.immutable_hash,
    executions: results.map(executionEvidence)
  };
}

function buildReport({ root, manifest, state, results, candidate = null, judge = null }) {
  const executions = results.map(executionEvidence);
  return {
    schema_id: "dd-eval/report@2", run_id: manifest.run_id, state,
    manifest: path.join(root, "manifest.json"),
    executions,
    observability: {
      sessions: executions.map(({ execution, subject_session_id, sessions }) => ({ execution, subject_session_id, reported_sessions: sessions })),
      usage: executions.map(({ execution, usage }) => ({ execution, usage })),
      tools: executions.map(({ execution, tool_evidence }) => ({ execution, tool_evidence })),
      timing: executions.map(({ execution, timing }) => ({ execution, ...timing })),
      context_diagnostics: executions.map(({ execution, context_diagnostics }) => ({ execution, ...context_diagnostics }))
    },
    ...(candidate ? { candidate } : {}), ...(judge ? { judge } : {})
  };
}
async function interactionFixture(caseRoot, stage) {
  const file = path.join(caseRoot, "entry-pack-source", "interactions", `${stage}.json`);
  if (!(await exists(file))) return { mode: "forbidden", max_rounds: 0, responses: [] };
  const value = await readJson(file);
  if (value.schema_id !== "dd-eval/canonical-responses@1" || value.stage !== stage || !Array.isArray(value.responses)) fail(`invalid interaction fixture for ${stage}`, "interaction_fixture_invalid");
  const responses = value.responses.map((response) => {
    if (typeof response?.id !== "string" || typeof response.answer !== "string") fail(`invalid interaction response for ${stage}`, "interaction_fixture_invalid");
    return response;
  });
  const mode = value.mode ?? "optional"; const maxRounds = value.max_rounds ?? 1;
  if (!["forbidden", "optional", "required"].includes(mode) || !Number.isInteger(maxRounds) || maxRounds < 0 || (mode === "required" && (maxRounds < 1 || responses.length === 0))) fail(`invalid interaction policy for ${stage}`, "interaction_fixture_invalid");
  return { mode, max_rounds: maxRounds, responses, file };
}
function parseJsonResponse(text, label) {
  const source = typeof text === "string" ? text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : "";
  try { return JSON.parse(source); } catch { fail(`${label} did not return one JSON object`, "judge_result_invalid"); }
}
function validateJudgeResult(value) {
  if (!isObject(value) || value.schema_id !== "dd-eval/judge-result@2" || typeof value.scope !== "string" || !["valid", "invalid_infrastructure_flow", "contaminated"].includes(value.run_validity) || !Array.isArray(value.outcome) || !Array.isArray(value.flow) || !Array.isArray(value.findings) || !isObject(value.golden) || typeof value.conclusion !== "string") fail("Final Judge returned an invalid contract", "judge_result_invalid");
  for (const criterion of [...value.outcome, ...value.flow]) if (!isObject(criterion) || typeof criterion.id !== "string" || typeof criterion.not_applicable !== "boolean" || (criterion.score !== null && (!Number.isInteger(criterion.score) || criterion.score < 0 || criterion.score > 4))) fail("Final Judge returned an invalid criterion", "judge_result_invalid");
  return value;
}
async function judgeHarnessRoots(root, results) {
  const attempts = (results ?? []).map((result) => result?.attempt).filter((attempt) => typeof attempt === "string");
  if (attempts.length === 0) for (const name of await readdir(path.join(root, "executions")).catch(() => [])) attempts.push(path.join(root, "executions", name));
  for (const attempt of attempts) {
    const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    if (await exists(projectRoot) && await exists(runtimeRoot)) return { projectRoot, runtimeRoot };
  }
  fail("Judge cannot prepare an isolated Codex home without an execution runtime", "judge_runtime_missing");
}
async function finalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null }) {
  if (typeof profileId !== "string") fail("judge.profile_id is required when judgment is enabled", "judge_profile_missing");
  const profile = (await loadProfile(profileId)).value; const judgeRoot = path.join(root, "judge"); await mkdir(judgeRoot, { recursive: true });
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  if (candidate.schema_id !== "dd-eval/run-candidate@1" || candidate.run_id !== runId || typeof candidate.immutable_hash !== "string") fail("Final Judge requires a frozen run candidate", "candidate_checkpoint_missing");
  const candidateFile = path.join(judgeRoot, "candidate.json"); const assessmentFile = path.join(judgeRoot, "assessment.json"); const evidenceFile = path.join(judgeRoot, "evidence.json");
  const evidence = results ? buildEvidencePacket({ manifest, results, candidate }) : await readJson(path.join(root, "reports", "report.json"));
  await writeJsonAtomic(candidateFile, candidate); await writeJsonAtomic(assessmentFile, loaded.assessment); await writeJsonAtomic(evidenceFile, evidence);
  const prompt = `You are the final SDLC eval Judge. Read ${JSON.stringify(assessmentFile)}, ${JSON.stringify(candidateFile)} and ${JSON.stringify(evidenceFile)}. Evaluate outcome quality first, then flow reliability; treat efficiency as evidence only. Do not reward cosmetic bureaucracy or unnecessary complexity. Reply with exactly one JSON object that conforms to dd-eval/judge-result@2, including a brief evidence-backed conclusion.`;
  const journal = path.join(judgeRoot, "events.jsonl"); const daemonState = path.join(judgeRoot, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(judgeRoot, "codex-home"); const judgeEnv = profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {};
  if (profile.harness === "codex-desktop") { const roots = await judgeHarnessRoots(root, results); await initializeCodexHome({ ...roots, codexHome }); }
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", judgeRoot, "--journal", journal], { cwd: judgeRoot, env: judgeEnv });
  try {
    const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Final Judge did not create a Session", "driver_protocol");
    const response = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits);
    const result = validateJudgeResult(parseJsonResponse(response.assistant_text, "Final Judge")); const receipt = { schema_id: "dd-eval/final-judge-receipt@1", profile_id: profile.id, session_id: sessionId, candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result, created_at: now() };
    await writeJsonAtomic(path.join(judgeRoot, "result.json"), receipt); return receipt;
  } finally {
    await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: judgeRoot, env: judgeEnv });
  }
}
async function interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile, projectRoot, runtimeRoot, contextFile = null, permits = null }) {
  const judgeId = runProfile.value.interaction_judge?.profile_id;
  if (typeof judgeId !== "string") fail(`HITL at ${stage} requires interaction_judge.profile_id`, "interaction_judge_missing");
  const profile = (await loadProfile(judgeId)).value; const root = path.join(attempt, "interaction-judge", `${stage}-${randomUUID().slice(0, 8)}`); await mkdir(root, { recursive: true });
  const subjectContext = contextFile ? await readJson(contextFile) : null;
  const packet = { schema_id: "dd-eval/interaction-judge-packet@1", stage, subject_context: subjectContext, question, responses: fixture.responses.map(({ id, intent, answer }) => ({ id, intent: intent ?? null, answer })), required_result: { schema_id: "dd-eval/hitl-match@1", status: "matched|unmatched", response_ids: [], uncovered_questions: [] } };
  const packetFile = path.join(root, "packet.json"); await writeJsonAtomic(packetFile, packet);
  const prompt = `You are the Interaction Judge. Read ${JSON.stringify(packetFile)}. Select only existing response IDs whose exact answer fully covers the question. Do not author, paraphrase, or strengthen a response. Reply with exactly one JSON object: {"schema_id":"dd-eval/hitl-match@1","status":"matched"|"unmatched","response_ids":[...],"uncovered_questions":[...],"rationale":"brief"}.`;
  const journal = path.join(root, "events.jsonl"); const daemonState = path.join(root, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(root, "codex-home"); const judgeEnv = profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {};
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", root, "--journal", journal], { cwd: root, env: judgeEnv });
  try {
    const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", root, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: root, env: judgeEnv }, permits); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Interaction Judge did not create a Session", "driver_protocol");
    const result = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", root, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: root, env: judgeEnv }, permits);
    const verdict = parseJsonResponse(result.assistant_text, "Interaction Judge");
    if (verdict.schema_id !== "dd-eval/hitl-match@1" || !["matched", "unmatched"].includes(verdict.status) || !Array.isArray(verdict.response_ids) || !Array.isArray(verdict.uncovered_questions) || typeof verdict.rationale !== "string" || (verdict.status === "matched" && verdict.response_ids.length === 0)) fail("Interaction Judge returned an invalid contract", "judge_result_invalid");
    const known = new Set(fixture.responses.map((response) => response.id)); if (verdict.response_ids.some((id) => !known.has(id))) fail("Interaction Judge selected an unknown response", "judge_result_invalid");
    return { profile: profile.id, session_id: sessionId, packet_file: packetFile, verdict, raw: result };
  } finally {
    await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: root, env: judgeEnv });
  }
}
async function materializeHitlAnswer({ attempt, stage, round, answer }) {
  const directory = path.join(attempt, "hitl-answers");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${stage}-resume-${round}.md`);
  await writeFile(file, answer, "utf8");
  return file;
}
async function resumePrompt({ lifecycle, stage, question, answerFile, runtimeRoot, projectRoot }) {
  const record = stageRecord(lifecycle, stage); const pause = record?.pause;
  if (!pause?.work_id) fail("paused Stage has no resumable Work", "hitl_pause_invalid");
  const command = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} dd-flow stage resume ${lifecycle.run_id} --stage ${stage} --work ${pause.work_id} --answer-stdin --project-root ${JSON.stringify(projectRoot)} --json < ${JSON.stringify(answerFile)}`;
  return ["A canonical user answer has been approved for the registered pause.", "Your first technical action must be this exact standalone lifecycle command. The final input redirection supplies the saved answer bytes; do not replace it with a pipe, quoted text, or another command:", `\`${command}\``, "Then follow the continuation returned by dd-flow. Continue the same Stage and Work; do not call stage start or repeat preparation.", "", `<user_question>\n${question}\n</user_question>`, ""].join("\n");
}
function selectedEntries(runProfile) {
  const selection = runProfile.selection; const entries = [];
  for (const stage of new Set(selection.focused_stages)) { if (!stageSet.has(stage)) fail(`unknown focused stage: ${stage}`); entries.push({ id: `focus-${stage}`, entry: stage, mode: "focused", stage, terminal_stage: stage }); }
  if (selection.segment !== null) {
    const from = selection.segment.from; const to = selection.segment.to;
    if (!stageSet.has(from) || !stageSet.has(to) || stages.indexOf(from) > stages.indexOf(to)) fail("selection.segment must name an ordered contour range");
    entries.push({ id: `segment-${from}-to-${to}`, entry: from, mode: "segment", stage: from, terminal_stage: to });
  }
  if (selection.e2e) entries.push({ id: "e2e", entry: "e2e", mode: "e2e", stage: "specify", terminal_stage: runProfile.case_terminal_stage ?? stages.at(-1) });
  return Array.from({ length: selection.repetitions }, (_, repetition) => entries.map((entry) => ({ ...entry, id: selection.repetitions === 1 ? entry.id : `${entry.id}-r${repetition + 1}` }))).flat();
}

async function mapLimited(items, limit, action, shouldStart = () => true) {
  const results = new Array(items.length); let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor; cursor += 1;
      if (index >= items.length) return;
      if (!shouldStart(items[index])) { results[index] = { execution: items[index].id, state: "cancelled", code: "run_stopped_by_infrastructure_error" }; continue; }
      results[index] = await action(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function isInfrastructureFailure(code) {
  return ["driver_failed", "profile_drift", "hook_preflight_failed", "flow_reconciliation_failed", "snapshot_missing", "snapshot_checksum_mismatch", "snapshot_restore_mismatch", "driver_protocol", "no_subagent_capacity"].includes(code);
}

export class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiting = []; }
  async acquire() {
    if (this.active < this.limit) { this.active += 1; return; }
    await new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) return next();
    this.active -= 1;
  }
}

export function createHarnessPermits(runProfile) {
  const limits = runProfile.value.concurrency.per_harness ?? {};
  const pools = new Map();
  const pool = (harness) => {
    if (!pools.has(harness)) pools.set(harness, new Semaphore(limits[harness] ?? 1));
    return pools.get(harness);
  };
  return {
    async use(profile, action) {
      const permit = pool(profile.harness); await permit.acquire();
      try { return await action(); } finally { permit.release(); }
    }
  };
}

async function providerTurn(profile, args, options, permits = null) {
  return permits ? permits.use(profile, () => callDriver(profile, args, options)) : callDriver(profile, args, options);
}

export function fanoutWorkerPrompt({ workId, startCommand }) {
  return [
    `Complete one already-declared Work: ${workId}.`,
    "Your first technical action must be this exact standalone lifecycle command:",
    `\`${startCommand}\``,
    "Use only the authoritative Work prompt returned by that command. Complete the assigned Work, write its required result, invoke its exact standalone work finish command, then stop. Do not start another Work, create a child agent, change dependencies, or treat a quiet sibling as failed.",
    "You cannot ask the user or pause the parent Stage. If a material fact is missing, record it through this Work's declared result/failure contract and stop; the coordinator owns any Stage HITL decision."
  ].join("\n");
}

export function fanoutWorkerRecoveryPrompt({ workId }) {
  return [
    `The previous finish attempt for ${workId} was not accepted; this Work is still running.`,
    "Do not claim completion. Read the failed check receipt and its stdout/stderr recorded by that finish attempt, fix the project-owned cause in this same Work, then reuse the exact standalone finish command from the authoritative Work prompt.",
    "If no receipt exists, inspect the Work status and follow the original Work prompt. Stop only after work finish returns its successful JSON result. Do not create another Work or child agent."
  ].join("\n");
}

function fanoutCoordinatorPrompt({ stage, status }) {
  const works = status.orchestration?.works ?? {};
  return [
    `All currently declared child Work for ${stage} has settled.`,
    `Completed: ${works.completed ?? 0}; failed: ${works.failed ?? 0}; cancelled: ${works.cancelled ?? 0}.`,
    "Continue the same Stage using its authoritative prompt and exact finish command already returned by dd-flow.",
    "Read the recorded child results and make the Stage's semantic decision yourself. If finishing creates a repair Work, stop after that command; the runner will execute the newly declared Work graph. Do not start a successor Stage."
  ].join("\n");
}

function fanoutGraphPreparationPrompt({ stage }) {
  return [
    `The ${stage} Stage has started, but its Work graph has not yet been materialized.`,
    "Continue the same Stage using the authoritative prompt already returned by dd-flow.",
    "Create only the Work items required by that prompt, with real depends_on edges only. Do not start a child yourself, run a capacity probe, finish the Stage, or start a successor Stage.",
    "After the Work graph is registered, stop this Turn. The runner will measure capacity, run ready Work in waves, and return this coordinator Session when the graph settles."
  ].join("\n");
}

async function fanoutStatus({ projectRoot, runtimeRoot, runId, stage }) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  return await commandJson(bin, ["stage", "fanout", "status", runId, "--stage", stage, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
}

async function fanoutDispatch({ projectRoot, runtimeRoot, runId, stage }) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  return await commandJson(bin, ["stage", "fanout", "dispatch", runId, "--stage", stage, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
}

async function recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots }) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  return await commandJson(bin, ["run", "capacity", "record", runId, "--available-slots", String(availableSlots), "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
}

async function startIsolatedWorkerDaemon({ profile, attempt, projectRoot, runtimeRoot, key }) {
  const stateDir = path.join(attempt, "drivers", "fanout", key, "daemon");
  const journal = path.join(attempt, "drivers", "fanout", key, "events.jsonl");
  const codexHome = path.join(attempt, "codex-home", "fanout", key);
  const env = { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {}) };
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
  const daemonArgs = ["--state-dir", stateDir];
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
  return { daemonArgs, journal, env };
}

async function stopIsolatedWorkerDaemon({ profile, daemon, projectRoot }) {
  try { await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env }); }
  catch { /* A failed or cancelled disposable worker must not hide the primary receipt. */ }
}

async function runCapacityProbe({ profile, attempt, projectRoot, runtimeRoot, probe, eventsFile, event }) {
  const size = Number(probe?.fanout_size); const hold = Number(probe?.probe_hold_seconds); const deadline = Number(probe?.cleanup_deadline_seconds);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(hold) || hold < 1 || !Number.isInteger(deadline) || deadline < hold) fail("invalid work-fanout capacity probe contract", "fanout_contract_invalid");
  const prompt = (number) => `This is capacity probe AGENT-${String(number).padStart(2, "0")}. Do not call tools, read files, create children, or explain. Wait exactly ${hold} seconds, then return exactly AGENT-${String(number).padStart(2, "0")}.`;
  const handles = new Map();
  const settled = new Set();
  const outcomes = [];
  const launches = [...Array(size)].map((_, index) => (async () => {
    const key = `probe-${String(index + 1).padStart(2, "0")}`;
    let daemon;
    try {
      daemon = await startIsolatedWorkerDaemon({ profile, attempt, projectRoot, runtimeRoot, key });
      const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
      const sessionId = created.provider_session_id ?? created.session_id;
      if (typeof sessionId !== "string") throw Object.assign(new Error("probe driver did not return a Session"), { code: "driver_protocol" });
      handles.set(key, { daemon, sessionId });
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.session_created", data: { key, session_id: sessionId } });
      const response = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt(index + 1), "--journal", daemon.journal, "--timeout", String(deadline)], { cwd: projectRoot, env: daemon.env });
      const expected = `AGENT-${String(index + 1).padStart(2, "0")}`;
      return { key, session_id: sessionId, completed: response?.assistant_text?.trim() === expected };
    } catch (error) { return { key, completed: false, error: error instanceof Error ? error.message : String(error) }; }
    finally { settled.add(key); if (daemon) await stopIsolatedWorkerDaemon({ profile, daemon, projectRoot }); }
  })().then((outcome) => {
    outcomes.push(outcome);
    return outcome;
  }));
  const all = Promise.all(launches);
  let timeoutId;
  const timeout = new Promise((resolve) => { timeoutId = setTimeout(resolve, deadline * 1000, "timeout"); });
  const result = await Promise.race([all, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  if (result === "timeout") {
    await Promise.all([...handles.entries()].filter(([key]) => !settled.has(key)).map(async ([key, handle]) => {
      try { await callDriver(profile, ["session", "cancel", ...handle.daemon.daemonArgs, "--session-id", handle.sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", handle.daemon.journal], { cwd: projectRoot, env: handle.daemon.env }); }
      catch { /* Some providers cannot cancel an already-terminal probe. */ }
      await stopIsolatedWorkerDaemon({ profile, daemon: handle.daemon, projectRoot });
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.cancelled", data: { key, session_id: handle.sessionId } });
    }));
  }
  const results = result === "timeout" ? outcomes : result;
  const availableSlots = results.filter((item) => item.completed).length;
  await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.completed", data: { requested: size, available_slots: availableSlots, deadline_seconds: deadline, results } });
  return availableSlots;
}

async function runFanoutWorker({ profile, attempt, projectRoot, runtimeRoot, work, eventsFile, event }) {
  const workId = String(work.work_id ?? ""); const startCommand = String(work.start_command ?? "");
  if (!workId || !startCommand) fail("ready fan-out Work lacks its exact start command", "fanout_contract_invalid");
  const key = `work-${workId}`;
  const daemon = await startIsolatedWorkerDaemon({ profile, attempt, projectRoot, runtimeRoot, key });
  try {
    const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
    const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("fan-out worker driver did not return a Session", "driver_protocol");
    await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.session_created", data: { work_id: workId, session_id: sessionId } });
    let response = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", fanoutWorkerPrompt({ workId, startCommand }), "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
    const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
    let observed = await commandJson(bin, ["work", "show", workId, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    if (observed.work?.status === "running") {
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.recovery_dispatched", data: { work_id: workId, session_id: sessionId, status: observed.work?.status ?? null } });
      response = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", fanoutWorkerRecoveryPrompt({ workId }), "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
      observed = await commandJson(bin, ["work", "show", workId, "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    }
    const usage = await commandJson(bin, ["session", "usage", "sync", "--project-root", projectRoot, "--session-id", sessionId], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    if (observed.work?.status !== "completed") {
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.incomplete", data: { work_id: workId, session_id: sessionId, status: observed.work?.status ?? null } });
      fail(`fan-out worker ${workId} ended without accepted work finish`, "incomplete_worker_turn");
    }
    await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.completed", data: { work_id: workId, session_id: sessionId, usage } });
    return { work_id: workId, session_id: sessionId, response, usage };
  } finally { await stopIsolatedWorkerDaemon({ profile, daemon, projectRoot }); }
}

/** Execute an engine-declared graph without deciding any semantic part of the Stage. */
async function driveFanout({ profile, attempt, projectRoot, runtimeRoot, runId, stage, eventsFile, event }) {
  let status = await fanoutStatus({ projectRoot, runtimeRoot, runId, stage });
  if (!status.orchestration) return null;
  for (;;) {
    const fanout = status.orchestration;
    if (fanout.capacity_required && fanout.capacity?.available_slots === null) {
      const availableSlots = await runCapacityProbe({ profile, attempt, projectRoot, runtimeRoot, probe: fanout.capacity.probe, eventsFile, event });
      await recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots });
      status = await fanoutStatus({ projectRoot, runtimeRoot, runId, stage });
      continue;
    }
    if (fanout.state === "dispatch_required") {
      await fanoutDispatch({ projectRoot, runtimeRoot, runId, stage });
      status = await fanoutStatus({ projectRoot, runtimeRoot, runId, stage });
      continue;
    }
    if (fanout.state === "coordinator_required") {
      return { state: "coordinator_required", status, continuation: fanoutGraphPreparationPrompt({ stage }) };
    }
    const capacity = fanout.capacity?.available_slots;
    if (fanout.capacity_required && (!Number.isInteger(capacity) || capacity < 1)) fail(`fan-out ${stage} has no available worker capacity`, "no_subagent_capacity");
    const ready = Array.isArray(fanout.works?.ready) ? fanout.works.ready : [];
    if (ready.length) {
      const wave = ready.slice(0, capacity ?? ready.length);
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.wave.started", data: { stage, work_ids: wave.map((work) => work.work_id), capacity: capacity ?? null } });
      await Promise.all(wave.map((work) => runFanoutWorker({ profile, attempt, projectRoot, runtimeRoot, work, eventsFile, event })));
      status = await fanoutStatus({ projectRoot, runtimeRoot, runId, stage });
      continue;
    }
    if (fanout.works?.running) return { state: "awaiting_worker", status };
    if (fanout.works?.created) fail(`fan-out ${stage} has created but non-ready Work after all active workers settled`, "fanout_graph_stalled");
    return { state: "children_settled", status, continuation: fanoutCoordinatorPrompt({ stage, status }) };
  }
}

async function assertInteractionJudgePreflight({ caseRoot, executions, runProfile }) {
  const requiredStages = new Set();
  for (const execution of executions) {
    const from = stages.indexOf(execution.stage); const to = stages.indexOf(execution.terminal_stage);
    for (let index = from; index <= to; index += 1) requiredStages.add(stages[index]);
  }
  const policies = await Promise.all([...requiredStages].map(async (stage) => [stage, await interactionFixture(caseRoot, stage)]));
  if (policies.some(([, fixture]) => fixture.mode !== "forbidden") && typeof runProfile.value.interaction_judge?.profile_id !== "string") {
    fail("selected stages permit HITL but interaction_judge.profile_id is missing", "interaction_judge_missing");
  }
}

export async function evalRun({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile); const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const loaded = await loadCaseV6(runProfile.value.case_id); if (loaded.value.status !== "runnable") fail("case is not runnable for scored execution");
  const definition = await committedDefinitionIdentity();
  const validated = await fixturesValidate({ caseId: runProfile.value.case_id });
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage }), runProfile });
  return executeEval({ runProfile, profile, loaded, validated, definition });
}

async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored" }) {
  const home = evalHome(); const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(home, "runs", runId); const events = path.join(root, "events.jsonl");
  const manifest = { schema_id: "dd-eval/runner-manifest@1", kind, run_id: runId, case_id: loaded.value.id, entry_pack: { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(await readFile(validated.entry_pack)) }, ...(definition ? { definition } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions: selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage }) };
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
  const pack = validateEntryPack(await readJson(validated.entry_pack), loaded.value.id); const packRoot = path.dirname(validated.entry_pack); const blueprint = validateStageBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")));
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile });
  const permits = createHarnessPermits(runProfile);
  let stopAfterInfrastructureFailure = false;
  const results = await mapLimited(manifest.executions, runProfile.value.concurrency.global, async (execution) => {
    const opId = `${runId}:${execution.id}:launch`;
    const startedAt = now();
    try {
      const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, action: async () => {
      const entryFile = contained(packRoot, pack.entries[execution.entry], "entry"); const entry = validateStageEntry(await readJson(entryFile), execution.stage);
      const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
      const restored = await restoreStageSnapshot({ home, entry, stage: execution.stage, projectRoot, runtimeRoot });
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      let currentStage = execution.stage;
      let currentEntry = entry;
      let contextFile = path.join(attempt, "stage-context.json"); let slice = await materializeStageSlice({ blueprint, stage: currentStage, roots: { project: projectRoot, workspace: restored.workspace_root, ...(restored.run_home ? { run: restored.run_home } : {}) }, output: contextFile });
      let contextSha256 = sha256(await readFile(contextFile)); let launcher = entryLauncher({ stage: currentStage, entry: currentEntry, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
      await writeFile(path.join(attempt, "launchers", `${currentStage}.md`), `${launcher}\n`); const journal = path.join(attempt, "drivers", "subject.events.jsonl");
      const daemonState = path.join(attempt, "drivers", "daemon"); const daemonArgs = ["--state-dir", daemonState];
      const codexHome = path.join(attempt, "codex-home"); const executionEnv = { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {}) };
      if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
      await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env: executionEnv });
      const doctor = await callDriver(profile, ["doctor", "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }); assertObservedProfile(doctor, profile, "harness doctor");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.harness.preflight", data: { harness: profile.harness, receipt: doctor } });
      const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }, permits);
      assertObservedProfile(created, profile, "Subject Session");
      const sessionId = created.provider_session_id ?? created.session_id; if (typeof sessionId !== "string") fail("driver did not return provider_session_id", "driver_protocol");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.session_created", data: { session_id: sessionId, harness: profile.harness } });
      let prompted; let lifecycle; const boundaries = []; const hitlRounds = new Map();
      try {
        for (;;) {
          prompted = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", launcher, "--journal", journal], { cwd: projectRoot, env: executionEnv, onProgress: () => appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.progress", data: { state: "running_subject", stage: currentStage } }) }, permits);
          lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: currentStage, runId: currentEntry.snapshot.run_id });
          if (lifecycle.stage_status === "running") {
            const fanout = await driveFanout({ profile, attempt, projectRoot, runtimeRoot, runId: lifecycle.run_id, stage: currentStage, eventsFile: events, event: { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId } });
            if (fanout?.state === "awaiting_worker") {
              throw Object.assign(new Error(`fan-out ${currentStage} still has a live worker; resume must observe that original worker`), { code: "fanout_worker_still_running" });
            }
            if (fanout?.continuation) {
              launcher = fanout.continuation;
              await writeFile(path.join(attempt, "launchers", `${currentStage}-after-fanout.md`), `${launcher}\n`);
              continue;
            }
          }
          if (lifecycle.stage_status === "paused") {
            const fixture = await interactionFixture(loaded.root, currentStage); const rounds = hitlRounds.get(currentStage) ?? 0;
            const record = stageRecord(lifecycle, currentStage); const questionPath = record?.pause?.question_path;
            if (fixture.mode === "forbidden" || rounds >= fixture.max_rounds || !questionPath) fail(`unexpected HITL at ${currentStage}`, "unexpected_hitl");
            const question = await readFile(questionPath, "utf8");
            const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage: currentStage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile, permits });
            if (judgment.verdict.status !== "matched" || judgment.verdict.response_ids.length === 0 || judgment.verdict.uncovered_questions.length > 0) fail(`Interaction Judge could not match HITL at ${currentStage}`, "unmatched_hitl");
            const responses = new Map(fixture.responses.map((response) => [response.id, response.answer])); const answer = judgment.verdict.response_ids.map((id) => responses.get(id)).join("\n\n");
            const nextRound = rounds + 1; hitlRounds.set(currentStage, nextRound);
            const answerFile = await materializeHitlAnswer({ attempt, stage: currentStage, round: nextRound, answer });
            launcher = await resumePrompt({ lifecycle, stage: currentStage, question, answerFile, runtimeRoot, projectRoot });
            await writeFile(path.join(attempt, "launchers", `${currentStage}-resume-${rounds + 1}.md`), `${launcher}\n`);
            await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.hitl.matched", data: { stage: currentStage, round: rounds + 1, pause_id: record.pause.id, response_ids: judgment.verdict.response_ids, judge_session_id: judgment.session_id } });
            continue;
          }
          if (lifecycle.stage_status !== "done" || !["e2e", "segment"].includes(execution.mode) || currentStage === execution.terminal_stage) break;
          const requiredFixture = await interactionFixture(loaded.root, currentStage);
          if (requiredFixture.mode === "required" && (hitlRounds.get(currentStage) ?? 0) === 0) fail(`required HITL did not occur at ${currentStage}`, "required_hitl_missing");
          boundaries.push({ stage: currentStage, run_id: lifecycle.run_id, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256 });
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.stage.boundary_captured", data: { stage: currentStage, run_id: lifecycle.run_id } });
          const successor = nextStage(currentStage); if (!successor) break;
          const roots = restoredRoots(lifecycle, projectRoot, runtimeRoot);
          currentStage = successor;
          currentEntry = { snapshot: { run_id: lifecycle.run_id } };
          await materializeTaskInput(loaded.root, blueprint, currentStage, projectRoot);
          contextFile = path.join(attempt, "stage-context", `${currentStage}.json`);
          slice = await materializeStageSlice({ blueprint, stage: currentStage, roots: { project: roots.project, workspace: roots.workspace, run: roots.run }, output: contextFile });
          contextSha256 = sha256(await readFile(contextFile)); launcher = entryLauncher({ stage: currentStage, entry: currentEntry, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
          await writeFile(path.join(attempt, "launchers", `${currentStage}.md`), `${launcher}\n`);
        }
      } finally {
        await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env: executionEnv });
      }
      if (lifecycle.stage_status !== "done") {
        const code = lifecycle.stage_status === "paused" ? "registered_hitl_requires_interaction_judge" : "incomplete_subject_turn";
        throw Object.assign(new Error(`Subject turn ended without successful ${currentStage} finish (${lifecycle.stage_status ?? "stage missing"})`), { code, lifecycle });
      }
      const terminalFixture = await interactionFixture(loaded.root, currentStage);
      if (terminalFixture.mode === "required" && (hitlRounds.get(currentStage) ?? 0) === 0) fail(`required HITL did not occur at ${currentStage}`, "required_hitl_missing");
      boundaries.push({ stage: currentStage, run_id: lifecycle.run_id, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256 });
        const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt });
        const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: lifecycle.run_id });
        await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
        return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher, driver: prompted, lifecycle, boundaries, candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
      }});
      const completed = result.result ?? result;
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, result: completed } });
      return completed;
    } catch (error) {
      const failure = { execution: execution.id, state: "failed", code: error?.code ?? "execution_failed", error: error instanceof Error ? error.message : String(error), started_at: startedAt, finished_at: now() };
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure } });
      if (runProfile.value.failure_policy.stop_run_on_infrastructure_error && isInfrastructureFailure(failure.code)) stopAfterInfrastructureFailure = true;
      return failure;
    }
  }, () => !stopAfterInfrastructureFailure);
  const finalState = results.every((result) => result.state === "candidate_ready") ? "completed" : "completed_with_failures";
  await appendEvent(events, { source: "dd-eval://runner", runId, traceId: runId, type: "dev.dd.eval.completed", data: { state: finalState, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  const candidate = finalState === "completed" ? await freezeRunCandidate({ root, runId, manifest, results }) : null;
  if (candidate) await appendEvent(events, { source: "dd-eval://runner", runId, traceId: runId, type: "dev.dd.eval.candidate.frozen", data: { state: "candidate_ready", candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file } });
  let judge = null;
  if (runProfile.value.judge.enabled && finalState === "completed") {
    judge = await finalJudge({ root, runId, manifest, loaded, profileId: runProfile.value.judge.profile_id, candidate, permits, results });
    await appendEvent(events, { source: "dd-eval://runner", runId, traceId: runId, type: "dev.dd.eval.final_judge.completed", data: { judge_profile: judge.profile_id, judge_session_id: judge.session_id, candidate_sha256: judge.candidate_sha256 } });
  }
  const state = reduceEvents(await readEvents(events)); const report = buildReport({ root, manifest, state: finalState, results, candidate, judge });
  await mkdir(path.join(root, "reports"), { recursive: true });
  await writeJsonAtomic(path.join(root, "reports", "report.json"), report);
  await writeFile(path.join(root, "reports", "report.md"), `# Eval ${runId}\n\n- State: ${finalState}\n- Executions: ${results.length}\n- Failed: ${results.filter((result) => result.state === "failed").length}\n- Cancelled: ${results.filter((result) => result.state === "cancelled").length}\n${judge ? `- Final Judge: ${judge.profile_id}\n` : "- Final Judge: not requested\n"}`);
  await writeJsonAtomic(path.join(root, "state.json"), state); return { run_id: runId, root, executions: results, ...(judge ? { judge } : {}), state: state.state };
}

export async function evalJudge({ evalRoot, profileId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCaseV6(manifest.case_id); const selected = profileId ?? manifest.profile?.judge?.profile_id;
  const candidate = await readJson(path.join(root, "candidate.json")); const receipt = await finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate });
  await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, traceId: manifest.run_id, type: "dev.dd.eval.final_judge.completed", data: { judge_profile: receipt.profile_id, judge_session_id: receipt.session_id, candidate_sha256: receipt.candidate_sha256 } });
  return { root, receipt };
}

function resultForOperation(events, operationId) {
  return events.find((event) => event.type === "dev.dd.eval.operation.completed" && event.data?.operation_id === operationId)?.data?.result ?? null;
}
function subjectSessionFor(events, executionId) {
  return events.find((event) => event.executionid === executionId && event.type === "dev.dd.eval.subject.session_created")?.data?.session_id ?? null;
}
function latestObservedStage(status, fallback) {
  const records = status?.index?.stage_runs ?? status?.run?.index?.stage_runs ?? [];
  const known = Array.isArray(records) ? records.filter((record) => stageSet.has(record?.stage)) : [];
  const unfinished = known.filter((record) => record.status !== "done").sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0];
  if (unfinished?.stage) return unfinished.stage;
  return known.sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0]?.stage ?? fallback;
}
async function promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt, journal }) {
  const daemonState = path.join(attempt, "drivers", "daemon"); const daemonArgs = ["--state-dir", daemonState];
  const env = { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) };
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome: path.join(attempt, "codex-home") });
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
  try { return await callDriver(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: projectRoot, env }); }
  finally { await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env }); }
}
async function recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }) {
  const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home"); const sessionId = subjectSessionFor(events, execution.id);
  if (typeof sessionId !== "string") fail(`execution ${execution.id} has no recorded Subject Session`, "resume_session_missing");
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: null });
  const currentStage = latestObservedStage(lifecycle.status, execution.stage);
  const record = stageRecord({ ...lifecycle, status: lifecycle.status }, currentStage);
  if (record?.status === "done" && currentStage === execution.terminal_stage) {
    const fixture = await interactionFixture(loaded.root, currentStage);
    if (fixture.mode === "required" && hitlRoundsFor(events, execution.id, currentStage) === 0) fail(`required HITL did not occur at ${currentStage}`, "required_hitl_missing");
    const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt }); const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: lifecycle.run_id }); await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
    return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, candidate, statistics, lifecycle, state: "candidate_ready", recovered: true };
  }
  if (record?.status === "paused") {
    const fixture = await interactionFixture(loaded.root, currentStage); const questionPath = record.pause?.question_path;
    if (fixture.mode === "forbidden" || !questionPath) fail(`unexpected HITL at ${currentStage}`, "unexpected_hitl");
    const question = await readFile(questionPath, "utf8"); const runProfile = { value: manifest.profile };
    const contextFile = path.join(attempt, "stage-context", `${currentStage}.json`);
    const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage: currentStage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: (await exists(contextFile)) ? contextFile : null });
    if (judgment.verdict.status !== "matched" || judgment.verdict.response_ids.length === 0 || judgment.verdict.uncovered_questions.length > 0) fail(`Interaction Judge could not match HITL at ${currentStage}`, "unmatched_hitl");
    const responses = new Map(fixture.responses.map((response) => [response.id, response.answer])); const answer = judgment.verdict.response_ids.map((id) => responses.get(id)).join("\n\n");
    const answerFile = await materializeHitlAnswer({ attempt, stage: currentStage, round: hitlRoundsFor(events, execution.id, currentStage) + 1, answer });
    const prompt = await resumePrompt({ lifecycle, stage: currentStage, question, answerFile, runtimeRoot, projectRoot });
    await promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
    return recoverExecution({ root, events: await readEvents(path.join(root, "events.jsonl")), manifest, execution, loaded, blueprint, profile });
  }
  if (record?.status === "running") {
    const fanout = await driveFanout({
      profile,
      attempt,
      projectRoot,
      runtimeRoot,
      runId: lifecycle.run_id,
      stage: currentStage,
      eventsFile: path.join(root, "events.jsonl"),
      event: { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id }
    });
    if (fanout?.continuation) {
      await promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt: fanout.continuation, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
      return recoverExecution({ root, events: await readEvents(path.join(root, "events.jsonl")), manifest, execution, loaded, blueprint, profile });
    }
    if (fanout?.state === "awaiting_worker") {
      return { execution: execution.id, attempt, session_id: sessionId, run_id: lifecycle.run_id, lifecycle, state: "awaiting_worker", recovered: true };
    }
  }
  if (record?.status === "done" && ["e2e", "segment"].includes(execution.mode)) {
    const successor = nextStage(currentStage); if (!successor || stages.indexOf(successor) > stages.indexOf(execution.terminal_stage)) fail(`execution ${execution.id} is beyond its terminal boundary`, "resume_state_invalid");
    const roots = restoredRoots(lifecycle, projectRoot, runtimeRoot); await materializeTaskInput(loaded.root, blueprint, successor, projectRoot);
    const contextFile = path.join(attempt, "stage-context", `${successor}.json`); const slice = await materializeStageSlice({ blueprint, stage: successor, roots: { project: roots.project, workspace: roots.workspace, run: roots.run }, output: contextFile }); const contextSha256 = sha256(await readFile(contextFile));
    const prompt = entryLauncher({ stage: successor, entry: { snapshot: { run_id: lifecycle.run_id } }, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
    await writeFile(path.join(attempt, "launchers", `${successor}.md`), `${prompt}\n`);
    await promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
    return recoverExecution({ root, events: await readEvents(path.join(root, "events.jsonl")), manifest, execution: { ...execution, stage: successor }, loaded, blueprint, profile });
  }
  const inspected = await callDriver(profile, ["session", "inspect", "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) } });
  return { execution: execution.id, attempt, session_id: sessionId, run_id: lifecycle.run_id, lifecycle, provider: inspected, state: "awaiting_provider", recovered: true };
}

export async function runnerResume({ evalRoot }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCaseV6(manifest.case_id); const profile = manifest.subject_profile; const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id); const blueprint = validateStageBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")));
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  for (const execution of manifest.executions) {
    const operationId = `${manifest.run_id}:${execution.id}:launch`; const completed = resultForOperation(events, operationId);
    if (completed) { results.push(completed); continue; }
    const recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); results.push(recovery);
    if (recovery.state === "candidate_ready") await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.operation.completed", data: { operation_id: operationId, operation: `execution.${execution.id}.launch`, status: "completed", result: recovery, recovered: true } });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.awaiting_provider", data: { state: "awaiting_provider", execution: execution.id, recovery } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const completed = results.every((result) => result.state === "candidate_ready");
  let candidate = null; let judge = null;
  if (completed) {
    candidate = await freezeRunCandidate({ root, runId: manifest.run_id, manifest, results });
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, traceId: manifest.run_id, type: "dev.dd.eval.candidate.frozen", data: { state: "candidate_ready", candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file, recovered: true } });
    if (manifest.profile?.judge?.enabled) {
      const existing = await exists(path.join(root, "judge", "result.json"));
      judge = existing ? await readJson(path.join(root, "judge", "result.json")) : await finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: manifest.profile.judge.profile_id, candidate, results });
    }
    const report = buildReport({ root, manifest, state: "completed", results, candidate, judge });
    await mkdir(path.join(root, "reports"), { recursive: true }); await writeJsonAtomic(path.join(root, "reports", "report.json"), report); await writeFile(path.join(root, "reports", "report.md"), `# Eval ${manifest.run_id}\n\n- State: completed\n- Executions: ${results.length}\n- Resumed: yes\n`);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, traceId: manifest.run_id, type: "dev.dd.eval.completed", data: { state: "completed", resumed: true, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  }
  return { root, run_id: manifest.run_id, executions: results, ...(candidate ? { candidate } : {}), ...(judge ? { judge } : {}), state: completed ? "completed" : "awaiting_provider" };
}

export async function runnerCancel({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const profile = manifest.subject_profile; const events = await readEvents(path.join(root, "events.jsonl")); const selected = manifest.executions.filter((execution) => !executionId || execution.id === executionId);
  if (selected.length === 0) fail(`unknown execution: ${executionId}`, "execution_unknown");
  const cancelled = [];
  for (const execution of selected) {
    const sessionId = subjectSessionFor(events, execution.id); if (typeof sessionId !== "string") continue;
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home"); const daemonState = path.join(attempt, "drivers", "daemon"); const daemonArgs = ["--state-dir", daemonState]; const env = { DD_FLOW_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) };
    const operationId = `${manifest.run_id}:${execution.id}:cancel`;
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.cancel`, action: async () => {
      await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", path.join(attempt, "drivers", "subject.events.jsonl")], { cwd: projectRoot, env });
      try { return await callDriver(profile, ["session", "cancel", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning], { cwd: projectRoot, env }); }
      finally { await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env }); }
    } });
    cancelled.push({ execution: execution.id, session_id: sessionId, receipt: receipt.result ?? receipt }); await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.cancelled", data: { state: "cancelled", execution: execution.id } });
  }
  return { root, run_id: manifest.run_id, cancelled };
}

export async function runnerStatus({ evalRoot }) { const root = path.resolve(evalRoot); const events = await readEvents(path.join(root, "events.jsonl")); return { root, ...reduceEvents(events), manifest: await readJson(path.join(root, "manifest.json")) }; }
