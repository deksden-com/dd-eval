import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, open, readFile, readdir, rm, stat, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, canonicalJson, completeOperation, hashJson, readEvents, recordOperation, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { materializeStageSlice, semanticContextHash, stages, validateEntry as validateStageEntry, validateStageBlueprint, writeEntryPack } from "./entry-pack.mjs";
import { commandJson, commandText } from "./process-json.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageSet = new Set(stages);
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys, label) => { if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label} has unsupported fields`); return value; };
const runtimeBin = (runtimeRoot) => path.join(runtimeRoot, "bin", "dd-flow");
const runtimeEnv = (runtimeRoot, extra = {}) => ({ DD_FLOW_HOME: runtimeRoot, DD_FLOW_BIN: runtimeBin(runtimeRoot), PATH: `${path.join(runtimeRoot, "bin")}${path.delimiter}${process.env.PATH ?? ""}`, ...extra });

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
function checkpointFile(id) { return contained(path.join(repoRoot, "checkpoints"), `${id}.json`, "input checkpoint id"); }

async function loadInputCheckpoint(reference) {
  if (!isObject(reference) || typeof reference.id !== "string" || !/^cp-[a-z0-9][a-z0-9-]*$/.test(reference.id) || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("case requires a valid input_checkpoint reference");
  const file = checkpointFile(reference.id);
  const bytes = await readFile(file).catch(() => fail(`input checkpoint is missing: ${reference.id}`, "input_checkpoint_missing"));
  const actual = sha256(bytes);
  if (actual !== reference.sha256) fail(`input checkpoint checksum does not match: ${reference.id}`, "input_checkpoint_checksum_mismatch");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!isObject(value) || value.id !== reference.id || !isObject(value.source) || typeof value.source.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.source.commit)) fail(`input checkpoint is invalid: ${reference.id}`, "input_checkpoint_invalid");
  if (!isObject(value.flow_pack) || typeof value.flow_pack.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.flow_pack.commit) || typeof value.flow_pack.path !== "string" || !value.flow_pack.path || path.isAbsolute(value.flow_pack.path) || value.flow_pack.path.split(/[\\/]/).includes("..")) fail(`input checkpoint has no valid flow_pack: ${reference.id}`, "input_checkpoint_invalid");
  return { file, sha256: actual, value };
}

export async function loadCase(caseId) {
  const root = caseDir(caseId); const value = await readJson(path.join(root, "case.json"));
  if (!isObject(value) || value.schema_id !== "dd-eval/case@7") fail(`${caseId} must use dd-eval/case@7`);
  if (value.id !== caseId || typeof value.assessment !== "string" || !Array.isArray(value.input)) fail("case requires id, assessment and ordered input");
  for (const item of value.input) {
    if (!isObject(item) || typeof item.role !== "string" || !item.role || typeof item.source !== "string" || !item.source || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) fail("case input item is invalid");
    const file = contained(root, item.source, "case input source"); if (!(await exists(file)) || sha256(await readFile(file)) !== item.sha256) fail(`case input checksum does not match: ${item.source}`, "case_input_checksum_mismatch");
  }
  if (!(value.entry_pack === null || typeof value.entry_pack === "string")) fail("case.entry_pack must be a path or null");
  if ("starter_sessions" in value || "canonical_checkpoints" in value || "priming" in value) fail("case@7 cannot contain starter or canonical Session fields");
  return { root, value, assessment: await readJson(contained(root, value.assessment, "assessment")), inputCheckpoint: await loadInputCheckpoint(value.input_checkpoint) };
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
  const loaded = await loadCase(caseId); const pointer = loaded.value.entry_pack;
  if (!revision && typeof pointer !== "string") fail("fixture validation requires --revision when the case has no accepted entry pack");
  const packFile = revision ? path.join(loaded.root, "stage-entries", revision, "entry-pack.json") : contained(loaded.root, pointer, "entry_pack");
  const pack = validateEntryPack(await readJson(packFile), caseId);
  if (JSON.stringify(pack.flow.contour) !== JSON.stringify(loaded.value.flow?.contour) || pack.flow.terminal_stage !== loaded.value.flow?.terminal_stage) fail("entry-pack flow does not match the case contour", "entry_pack_flow_mismatch");
  if (!revision && pack.status !== "accepted") fail("the active entry pack must be accepted");
  const packRoot = path.dirname(packFile); const blueprintFile = contained(packRoot, pack.stage_context, "stage_context"); const blueprint = validateStageBlueprint(await readJson(blueprintFile));
  for (const stage of loaded.value.flow.contour) if (!blueprint.stages?.[stage]) fail(`stage context blueprint misses ${stage}`, "entry_pack_context_incomplete");
  const entries = {};
  for (const key of pack.flow.contour) {
    const locator = pack.entries[key]; if (typeof locator !== "string") fail(`entry-pack misses ${key}`);
    const entry = validateStageEntry(await readJson(contained(packRoot, locator, `${key} entry`)), key);
    entries[key] = { file: locator, semantic_package_sha256: entry.semantic_package_sha256, context_slice_sha256: entry.context_slice_sha256 };
  }
  return { case_id: caseId, revision: pack.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries };
}

function validateEntryPack(value, caseId) {
  if (!isObject(value) || value.schema_id !== "dd-eval/entry-pack@1" || value.case_id !== caseId || !/^REV-\d+$/.test(value.revision ?? "")) fail("invalid entry-pack");
  if (typeof value.stage_context !== "string" || !isObject(value.entries)) fail("entry-pack has incomplete descriptors");
  if (!isObject(value.flow) || !Array.isArray(value.flow.contour) || value.flow.contour.length === 0 || value.flow.contour.some((stage) => !stageSet.has(stage))) fail("entry-pack has an invalid flow contour");
  for (const stage of value.flow.contour) if (typeof value.entries[stage] !== "string") fail(`entry-pack misses focused ${stage}`);
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
  const transientHome = path.join(root, "bootstrap-dd-flow-home");
  try {
    const selected = await provisionRuntimeEngine(sourceProjectRoot, transientHome);
    const engine = await captureEngineSnapshot({ root, home, selected });
    await commandJson("dd-flow", ["run", "snapshot", "bootstrap", "create", "--project-root", sourceProjectRoot, "--output", snapshotRoot], { cwd: sourceProjectRoot, env: runtimeEnv(transientHome) });
    const snapshot = { kind: "bootstrap", locator: canonicalLocator(home, snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "bootstrap.json")), run_id: null };
    const entry = canonicalEntry({ caseId: loaded.value.id, revision, stage: "specify", snapshot, blueprint });
    await writeJsonAtomic(path.join(root, "entries", "specify.json"), entry);
    return { entry, engine };
  }
  finally { await rm(transientHome, { recursive: true, force: true }); }
}
async function canonicalSourcePreflight(projectRoot, inputCheckpoint) {
  const policyFile = path.join(projectRoot, ".memory-bank", "dd-flow", "project-workspace.json");
  const policy = await readJson(policyFile);
  const integrationBranch = policy?.schema_id === "dd-flow/project-workspace@1" && typeof policy.workspace?.integration_branch === "string" ? policy.workspace.integration_branch : null;
  if (!integrationBranch) fail(`canonical source has no valid workspace integration branch: ${policyFile}`, "canonical_workspace_policy_invalid");
  const [branch, dirty, head] = await Promise.all([
    commandText("git", ["branch", "--show-current"], { cwd: projectRoot }),
    commandText("git", ["status", "--porcelain"], { cwd: projectRoot }),
    commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot })
  ]);
  const expectedCommit = inputCheckpoint?.value?.source?.commit;
  if (branch && branch !== integrationBranch) fail(`canonical source must be detached at checkpoint or on ${integrationBranch}`, "canonical_source_workspace_invalid");
  if (dirty) fail("canonical source must be clean", "canonical_source_workspace_invalid");
  if (typeof expectedCommit === "string") {
    if (head !== expectedCommit) fail(`canonical source HEAD does not match input checkpoint ${inputCheckpoint.value.id}`, "input_checkpoint_source_mismatch");
  } else if (branch !== integrationBranch) {
    fail(`canonical source must be a clean ${integrationBranch} integration checkout`, "canonical_source_workspace_invalid");
  }
  return { integration_branch: integrationBranch, head, input_checkpoint: { id: inputCheckpoint.value.id, sha256: inputCheckpoint.sha256, source_commit: expectedCommit } };
}
async function ignoreEvalLocalState(projectRoot) {
  const exclude = path.join(projectRoot, ".git", "info", "exclude");
  const prior = await readFile(exclude, "utf8").catch(() => "");
  if (!prior.split(/\r?\n/).includes(".dd-eval/")) await writeFile(exclude, `${prior}${prior.endsWith("\n") || !prior ? "" : "\n"}.dd-eval/\n`);
}
async function prepareCanonicalInput({ root, sourceProjectRoot, flowRoot, inputCheckpoint }) {
  if (!flowRoot || !path.isAbsolute(flowRoot) || !(await exists(flowRoot))) fail("canonical build requires an existing absolute --flow-root", "canonical_flow_source_required");
  const [flowHead, flowDirty] = await Promise.all([
    commandText("git", ["rev-parse", "HEAD"], { cwd: flowRoot }),
    commandText("git", ["status", "--porcelain"], { cwd: flowRoot })
  ]);
  const expected = inputCheckpoint.value.flow_pack;
  if (flowDirty || flowHead !== expected.commit) fail(`canonical flow source must be clean at input checkpoint flow commit ${expected.commit}`, "input_checkpoint_flow_mismatch");
  const sourceFlow = path.join(flowRoot, expected.path);
  const target = path.join(root, "input", "project");
  if (!(await exists(sourceFlow))) fail(`input checkpoint flow pack is missing: ${expected.path}`, "input_checkpoint_flow_missing");
  await commandText("git", ["clone", "--no-local", sourceProjectRoot, target], { cwd: root });
  // The product fact is pinned at the checkpoint, but the selected flow pack
  // is deliberately newer.  Materialize that pair as a clean local `main`
  // checkout: normal PROTOCOLIZE routing correctly refuses a dirty or
  // non-integration checkout and must not need an eval-only exception.
  await commandText("git", ["-C", target, "checkout", "-B", "main", inputCheckpoint.value.source.commit], { cwd: root });
  await rm(path.join(target, ".memory-bank", "dd-flow"), { recursive: true, force: true });
  await cp(sourceFlow, path.join(target, ".memory-bank", "dd-flow"), { recursive: true, verbatimSymlinks: true });
  const sourceCommit = await commandText("git", ["-C", target, "rev-parse", "HEAD"], { cwd: root });
  const sourceDate = await commandText("git", ["-C", target, "show", "-s", "--format=%aI", "HEAD"], { cwd: root });
  await commandText("git", ["-C", target, "add", expected.path], { cwd: root });
  const overlayChanged = Boolean(await commandText("git", ["-C", target, "status", "--porcelain", "--", expected.path], { cwd: root }));
  if (overlayChanged) await commandText("git", ["-C", target, "-c", "user.name=dd-eval", "-c", "user.email=eval@localhost", "commit", "--quiet", "-m", `dd-eval: materialize ${inputCheckpoint.value.id} flow pack`], { cwd: root, env: { GIT_AUTHOR_DATE: sourceDate, GIT_COMMITTER_DATE: sourceDate } });
  // Harnesses may create their private local state in the project directory.
  // It is not product evidence and must not make the normal Git policy fail.
  await ignoreEvalLocalState(target);
  const [materializedCommit, overlayManifest] = await Promise.all([
    commandText("git", ["-C", target, "rev-parse", "HEAD"], { cwd: root }),
    readFile(path.join(target, expected.path, "manifest.json"))
  ]);
  return {
    project_root: target,
    source_commit: sourceCommit,
    materialized_commit: materializedCommit,
    branch: "main",
    flow_root: flowRoot,
    flow_commit: flowHead,
    flow_pack_path: expected.path,
    flow_manifest_sha256: sha256(overlayManifest)
  };
}

async function prepareE2EInput({ projectRoot, inputCheckpoint }) {
  const source = inputCheckpoint.value.source; const flow = inputCheckpoint.value.flow_pack;
  if (typeof source.repository !== "string" || typeof flow.repository !== "string") fail("E2E input checkpoint requires source and flow repositories", "input_checkpoint_invalid");
  await mkdir(path.dirname(projectRoot), { recursive: true });
  await commandText("git", ["clone", "--no-checkout", source.repository, projectRoot], { cwd: path.dirname(projectRoot) });
  await commandText("git", ["-C", projectRoot, "checkout", "-B", "main", source.commit], { cwd: path.dirname(projectRoot) });
  if (source.repository !== flow.repository || source.commit !== flow.commit) {
    const flowRoot = path.join(path.dirname(projectRoot), "flow-source");
    try {
      await commandText("git", ["clone", "--no-checkout", flow.repository, flowRoot], { cwd: path.dirname(projectRoot) });
      await commandText("git", ["-C", flowRoot, "checkout", "--detach", flow.commit], { cwd: path.dirname(projectRoot) });
      const sourceFlow = path.join(flowRoot, flow.path); if (!(await exists(sourceFlow))) fail(`input checkpoint flow pack is missing: ${flow.path}`, "input_checkpoint_flow_missing");
      await rm(path.join(projectRoot, flow.path), { recursive: true, force: true });
      await cp(sourceFlow, path.join(projectRoot, flow.path), { recursive: true, verbatimSymlinks: true });
      const sourceDate = await commandText("git", ["-C", projectRoot, "show", "-s", "--format=%aI", "HEAD"], { cwd: projectRoot });
      await commandText("git", ["-C", projectRoot, "add", flow.path], { cwd: projectRoot });
      if (await commandText("git", ["-C", projectRoot, "status", "--porcelain", "--", flow.path], { cwd: projectRoot })) await commandText("git", ["-C", projectRoot, "-c", "user.name=dd-eval", "-c", "user.email=eval@localhost", "commit", "--quiet", "-m", `dd-eval: materialize ${inputCheckpoint.value.id} flow pack`], { cwd: projectRoot, env: { GIT_AUTHOR_DATE: sourceDate, GIT_COMMITTER_DATE: sourceDate } });
    } finally { await rm(flowRoot, { recursive: true, force: true }); }
  }
  if (!(await exists(path.join(projectRoot, flow.path)))) fail(`input checkpoint flow pack is missing: ${flow.path}`, "input_checkpoint_flow_missing");
  await ignoreEvalLocalState(projectRoot);
  return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null };
}
export async function canonicalBuild({ profileFile, projectRoot, flowRoot }) {
  const profile = await loadRunProfile(profileFile); const loaded = await loadCase(profile.value.case_id);
  const source = path.join(loaded.root, "entry-pack-source"); const blueprint = validateStageBlueprint(await readJson(path.join(source, "stage-context.json")));
  if (!projectRoot || !path.isAbsolute(projectRoot) || !(await exists(projectRoot))) fail("canonical build requires an existing absolute --project-root", "canonical_source_required");
  const sourcePreflight = await canonicalSourcePreflight(path.resolve(projectRoot), loaded.inputCheckpoint);
  // A canonical chain is evidence for one immutable eval definition.  Building
  // it from local edits would make the recorded input checkpoint insufficient
  // to reproduce the observed behavior.
  const definition = await committedDefinitionIdentity();
  const home = evalHome(); const canonicalRoot = path.join(home, "canonical", loaded.value.id); const revision = nextRevision(await readdir(canonicalRoot, { withFileTypes: true }).then((list) => list.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).catch(() => []));
  const root = path.join(canonicalRoot, revision); await mkdir(root, { recursive: true }); const events = path.join(root, "build", "events.jsonl");
  try {
    const materializedInput = await prepareCanonicalInput({ root, sourceProjectRoot: path.resolve(projectRoot), flowRoot: flowRoot ? path.resolve(flowRoot) : null, inputCheckpoint: loaded.inputCheckpoint });
    await writeJsonAtomic(path.join(root, "stage-context.json"), blueprint);
    const bootstrap = await createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot: materializedInput.project_root });
    const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "awaiting_reference_resume", profile: profile.value.id, profile_file: profile.file, source_project_root: path.resolve(projectRoot), source_preflight: sourcePreflight, definition, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256, file: loaded.inputCheckpoint.file, value: loaded.inputCheckpoint.value }, materialized_input: materializedInput, engine: bootstrap.engine, blueprint_sha256: hashJson(blueprint), current_stage: "specify", reference: { session_id: null, daemon_state: null, run_id: null }, entries: { specify: "entries/specify.json" }, created_at: now() };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.canonical.planned", data: { state: state.status, entry: bootstrap.entry } });
    return { ...state, build: root, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function canonicalState(buildRoot) {
  const root = path.resolve(buildRoot); const state = await readJson(path.join(root, "build", "state.json"));
  if (state.schema_id !== "dd-eval/canonical-build-state@1" || typeof state.case_id !== "string" || typeof state.current_stage !== "string") fail("invalid canonical build state", "canonical_state_invalid");
  return { root, state, loaded: await loadCase(state.case_id), blueprint: validateStageBlueprint(await readJson(path.join(root, "stage-context.json"))) };
}
async function referenceRoots(root, state, entry) {
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  if (!state.reference?.run_id) return { projectRoot, runtimeRoot, workspaceRoot: projectRoot, runRoot: null };
  const status = await commandJson("dd-flow", ["run", "status", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  const run = status.run ?? status.index?.run;
  if (!run?.run_home_path || !run?.workspace_root) fail("reference RUN has no workspace roots", "canonical_state_invalid");
  return { projectRoot, runtimeRoot, workspaceRoot: run.workspace_root, runRoot: run.run_home_path };
}
async function startReferenceDaemon(profile, roots, root) {
  const daemonState = path.join(root, "reference", "drivers", "daemon"); const journal = path.join(root, "reference", "drivers", "subject.events.jsonl");
  const daemonArgs = ["--state-dir", daemonState];
  const codexHome = path.join(root, "reference", "codex-home"); const env = runtimeEnv(roots.runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {});
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
  if (provider.thread?.status?.type === "active") return daemon;
  await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: roots.projectRoot, env: daemon.env });
  return await startReferenceDaemon(profile, roots, root);
}
function providerTurnIsActive(provider) { return provider?.thread?.status?.type === "active"; }
function interruptedStageContinuation(stage) {
  return `Resume the already-started ${stage} Stage. Do not run stage start again and do not recreate or erase any existing result. Inspect the current stage workspace, complete only outstanding semantic work, then use the exact finish command already present in its prompt. Stop the Turn after the Stage reaches its recorded terminal state.`;
}
async function stopReferenceDaemon(root, state) {
  if (!state.reference?.session_id) return;
  const runProfile = await loadRunProfile(state.profile_file); const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home"); const daemonState = path.join(root, "reference", "drivers", "daemon");
  const env = runtimeEnv(runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(root, "reference", "codex-home") } : {});
  await callDriver(profile, ["daemon", "stop", "--state-dir", daemonState], { cwd: projectRoot, env });
}

async function canonicalResumeLock(root, action) {
  const file = path.join(root, "build", "canonical-resume.lock");
  await mkdir(path.dirname(file), { recursive: true });
  for (;;) {
    try {
      const handle = await open(file, "wx");
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: now() })}\n`);
      } finally {
        await handle.close();
      }
      try {
        return await action();
      } finally {
        await rm(file, { force: true });
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner = {};
      try { owner = JSON.parse(await readFile(file, "utf8")); } catch {}
      const pid = Number(owner.pid);
      let alive = false;
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); alive = true; } catch (probe) { if (probe?.code === "EPERM") alive = true; }
      }
      if (alive) fail("canonical resume is already in progress for this build", "canonical_resume_active");
      await rm(file, { force: true });
    }
  }
}

export async function canonicalResume({ buildRoot }) {
  const root = path.resolve(buildRoot);
  return await canonicalResumeLock(root, async () => await canonicalResumeUnlocked({ buildRoot: root }));
}

async function canonicalResumeUnlocked({ buildRoot }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "awaiting_reference_resume") fail(`canonical build is ${state.status}, not awaiting reference resume`, "canonical_transition_invalid");
  const runProfile = await loadRunProfile(state.profile_file);
  const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const stage = state.current_stage; const entry = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [{ stage, terminal_stage: stage }], runProfile });
  let roots;
  if (!state.reference.session_id) {
    await mkdir(path.join(root, "reference", "project"), { recursive: true });
    const restored = await restoreStageSnapshot({ home: evalHome(), entry, stage, projectRoot: path.join(root, "reference", "project"), runtimeRoot: path.join(root, "reference", "dd-flow-home"), authoringEngine: state.engine });
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
      const active = providerTurnIsActive(provider);
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
      if (fanout?.continuation) turnPrompt = fanout.continuation;
      else {
        const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
        if (providerTurnIsActive(provider)) return { build: root, state, lifecycle, next: { kind: "wait_reference_turn", stage, session_id: sessionId } };
        if (!state.reference.active_turn) throw Object.assign(new Error(`reference Session is idle with non-terminal ${stage} lifecycle and no fan-out continuation`), { code: "reference_turn_unreconciled" });
        turnPrompt = interruptedStageContinuation(stage);
      }
    }
    else if (!lifecycle.stage_status && isAcceptedSuccessor && !state.reference.active_turn) turnPrompt = launcher;
    else {
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      if (providerTurnIsActive(provider)) return { build: root, state, lifecycle, next: { kind: "wait_reference_turn", stage, session_id: sessionId } };
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
      turnPrompt = fanout?.continuation ?? interruptedStageContinuation(stage);
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
  await commandJson("dd-flow", ["run", "snapshot", "create", state.reference.run_id, "--stage-entry", successor, "--project-root", projectRoot, "--output", snapshotRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  const snapshot = { kind: "run", locator: canonicalLocator(evalHome(), snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "snapshot.json")), run_id: state.reference.run_id };
  const entry = canonicalEntry({ caseId: loaded.value.id, revision: state.revision, stage: successor, snapshot, blueprint, engine: state.engine });
  const entryPath = path.join(root, "entries", `${successor}.json`); await writeJsonAtomic(entryPath, entry);
  // The prior turn is terminal before a boundary may be accepted.  Its marker
  // must not leak into the successor: a fresh-session handoff otherwise looks
  // like an interrupted in-flight turn and the runner safely refuses to send
  // the successor launcher.
  state.entries[successor] = path.relative(root, entryPath); state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review, sha256: await manifestHash(review), at: now() }]; state.current_stage = successor; state.completed_stage = null; state.status = "awaiting_reference_resume"; state.reference = { ...state.reference, active_turn: null, pending_pause_id: null };
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage, successor, snapshot: snapshot.locator } });
  return { build: root, state, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
}

async function canonicalCandidatePack(root, state, blueprint) {
  const contour = (await loadCase(state.case_id)).value.flow.contour;
  const required = contour;
  if (required.some((key) => typeof state.entries?.[key] !== "string")) fail("canonical build has not captured every declared entry", "canonical_entries_incomplete");
  const entries = {};
  for (const stage of contour) entries[stage] = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage);
  const buildTrace = path.join(root, "build", "events.jsonl");
  const inputCheckpoint = state.input_checkpoint;
  if (!isObject(inputCheckpoint) || typeof inputCheckpoint.id !== "string" || !/^[a-f0-9]{64}$/.test(inputCheckpoint.sha256 ?? "")) fail("canonical build has no verified input checkpoint", "canonical_state_invalid");
  const pack = await writeEntryPack({ caseDir: path.join(root, state.case_id), revision: state.revision, inputCheckpoint: { id: inputCheckpoint.id, sha256: inputCheckpoint.sha256 }, flow: { contour, terminal_stage: contour.at(-1), flow_commit: state.materialized_input?.flow_commit ?? null, flow_manifest_sha256: state.materialized_input?.flow_manifest_sha256 ?? null }, stageBlueprint: blueprint, entries, authoring: { profile_id: state.profile, build_trace_sha256: await manifestHash(buildTrace) } });
  pack.entries = Object.fromEntries(contour.map((key) => [key, state.entries[key]]));
  pack.hashes = { ...pack.hashes, focused_entries: Object.fromEntries(Object.entries(entries).map(([stage, entry]) => [stage, hashJson(entry)])) };
  pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  return pack;
}

function qualificationTargets(profile, terminalStage) {
  return selectedEntries({ ...profile.value, case_terminal_stage: terminalStage });
}

function qualificationCellIdentity({ state, pack, profile, subject, execution }) {
  const entry = { focused_entry: pack.hashes.focused_entries[execution.stage] };
  return hashJson({
    schema_id: "dd-eval/qualification-cell-input@1",
    case_id: state.case_id,
    revision: state.revision,
    input_checkpoint: state.input_checkpoint,
    flow: { commit: state.materialized_input?.flow_commit ?? null, manifest_sha256: state.materialized_input?.flow_manifest_sha256 ?? null },
    engine: state.engine,
    subject_profile: subject,
    run_profile: profile.value,
    execution: { id: execution.id, mode: execution.mode, stage: execution.stage, terminal_stage: execution.terminal_stage },
    entry
  });
}

async function validQualificationCell({ root, record, identity }) {
  if (!isObject(record) || record.input_sha256 !== identity || typeof record.receipt !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256 ?? "")) return false;
  const file = contained(root, record.receipt, "qualification cell receipt");
  if (!(await exists(file))) return false;
  const bytes = await readFile(file);
  if (sha256(bytes) !== record.sha256) return false;
  const receipt = JSON.parse(bytes.toString("utf8"));
  return receipt?.schema_id === "dd-eval/qualification-cell-receipt@1" && receipt?.status === "candidate_ready" && receipt?.input_sha256 === identity;
}

async function recordQualificationCell({ root, state, pack, profile, subject, execution, result, qualificationId, source = "executed" }) {
  const inputSha256 = qualificationCellIdentity({ state, pack, profile, subject, execution });
  const relativeFile = path.join("qualification", "cells", execution.id, `${qualificationId}.json`);
  const receipt = {
    schema_id: "dd-eval/qualification-cell-receipt@1",
    status: "candidate_ready",
    qualification_id: qualificationId,
    source,
    execution: { id: execution.id, mode: execution.mode, stage: execution.stage, terminal_stage: execution.terminal_stage },
    input_sha256: inputSha256,
    result,
    created_at: now()
  };
  const file = contained(root, relativeFile, "qualification cell receipt");
  await writeJsonAtomic(file, receipt);
  state.qualification_cells = { ...(state.qualification_cells ?? {}), [execution.id]: { receipt: relativeFile, sha256: sha256(await readFile(file)), input_sha256: inputSha256, qualification_id: qualificationId, source, accepted_at: now() } };
  return state.qualification_cells[execution.id];
}

async function qualificationCoverage({ root, state, pack, profile, subject, targets }) {
  const cells = {};
  for (const execution of targets) {
    const record = state.qualification_cells?.[execution.id] ?? null;
    const inputSha256 = qualificationCellIdentity({ state, pack, profile, subject, execution });
    cells[execution.id] = { execution, input_sha256: inputSha256, record, valid: await validQualificationCell({ root, record, identity: inputSha256 }) };
  }
  return cells;
}

async function writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions = [] }) {
  const cells = Object.fromEntries(Object.entries(coverage).map(([id, value]) => [id, { input_sha256: value.input_sha256, ...(value.record ? { receipt: value.record.receipt, sha256: value.record.sha256 } : {}) }]));
  const qualified = Object.values(coverage).every((cell) => cell.valid);
  const receipt = { schema_id: "dd-eval/qualification-receipt@2", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, cells, executions, created_at: now() };
  await writeJsonAtomic(path.join(root, "qualification", "receipt.json"), receipt);
  return { receipt, qualified };
}

export async function canonicalQualificationRecover({ buildRoot, receiptFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (!["entries_captured", "qualifying"].includes(state.status)) fail(`canonical build is ${state.status}, not recoverable for qualification`, "canonical_transition_invalid");
  const sourceFile = path.resolve(receiptFile); const source = await readJson(sourceFile);
  if (!isObject(source?.result) || !Array.isArray(source.result.executions) || typeof source.profile_file !== "string") fail("qualification recovery requires a runner qualification receipt", "qualification_receipt_invalid");
  const profile = await loadRunProfile(source.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification receipt belongs to another case", "canonical_profile_mismatch");
  const requiredFocused = new Set(stages);
  if (profile.value.selection.e2e || profile.value.selection.focused_stages.some((stage) => !stageSet.has(stage)) || profile.value.selection.focused_stages.length !== requiredFocused.size || new Set(profile.value.selection.focused_stages).size !== requiredFocused.size) fail("qualification receipt must cover every focused stage exactly once and no E2E traversal", "qualification_profile_incomplete");
  const pack = await canonicalCandidatePack(root, state, blueprint); const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow.terminal_stage); const byId = new Map(targets.map((execution) => [execution.id, execution]));
  const recoveryId = `REC-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const recovered = [];
  for (const result of source.result.executions) {
    const execution = byId.get(result?.execution);
    if (!execution || result?.state !== "candidate_ready") continue;
    await recordQualificationCell({ root, state, pack, profile, subject, execution, result, qualificationId: recoveryId, source: { kind: "explicit_recovery", receipt: sourceFile } });
    recovered.push(execution.id);
  }
  state.status = "entries_captured"; state.qualification = null;
  const coverage = await qualificationCoverage({ root, state, pack, profile, subject, targets });
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_recovered", data: { state: state.status, recovery_id: recoveryId, source_receipt: sourceFile, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
  return { build: root, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id), next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
}

export async function canonicalQualify({ buildRoot, profileFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  // A failed qualification is evidence about the runner, not a reason to
  // discard an otherwise accepted canonical chain.  Preserve that attempt,
  // then permit a corrected runner to qualify the same entries again.
  if (state.status !== "entries_captured") fail(`canonical build is ${state.status}, not ready to qualify`, "canonical_transition_invalid");
  const profile = await loadRunProfile(profileFile ?? state.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification profile belongs to another case", "canonical_profile_mismatch");
  const requiredFocused = new Set(stages);
  if (profile.value.selection.e2e || profile.value.selection.focused_stages.some((stage) => !stageSet.has(stage)) || profile.value.selection.focused_stages.length !== requiredFocused.size || new Set(profile.value.selection.focused_stages).size !== requiredFocused.size) fail("qualification profile must cover every focused stage exactly once and no E2E traversal", "qualification_profile_incomplete");
  const candidatePack = await canonicalCandidatePack(root, state, blueprint); const packFile = path.join(root, "entry-pack.json"); await writeJsonAtomic(packFile, candidatePack);
  const validated = { case_id: state.case_id, revision: state.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries: Object.fromEntries(Object.entries(candidatePack.entries).map(([key, file]) => [key, { file }])) };
  const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow.terminal_stage); let coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets }); const pending = Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution); const qualificationId = `QUAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const output = path.join(root, "qualification", qualificationId);
  if (pending.length === 0) {
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage });
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, reused: targets.map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  }
  state.status = "qualifying"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_started", data: { state: state.status, qualification_id: qualificationId } });
  try {
    const result = await executeEval({ runProfile: profile, profile: subject, loaded, validated, root: output, runId: qualificationId, kind: "qualification", executions: pending });
    for (const resultExecution of result.executions) {
      const execution = targets.find((target) => target.id === resultExecution.execution);
      if (execution && resultExecution.state === "candidate_ready") await recordQualificationCell({ root, state, pack: candidatePack, profile, subject, execution, result: resultExecution, qualificationId });
    }
    coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets });
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions: result.executions });
    const qualified = summary.qualified;
    const receipt = { schema_id: "dd-eval/qualification-attempt@1", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, result, created_at: now() };
    await writeJsonAtomic(path.join(output, "receipt.json"), receipt);
    if (!qualified) {
      state.status = "entries_captured";
      state.qualification = null;
      state.qualification_failure = { receipt: path.relative(root, path.join(output, "receipt.json")), sha256: hashJson(receipt), id: qualificationId };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_incomplete", data: { state: state.status, qualification_id: qualificationId, failures: result.executions.filter((execution) => execution.state !== "candidate_ready").map((execution) => ({ execution: execution.execution, code: execution.code })), pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
      return { build: root, state, receipt, next: { kind: "retry_qualification", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
    }
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, executed: pending.map((execution) => execution.id), reused: targets.filter((target) => !pending.some((execution) => execution.id === target.id)).map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  } catch (error) {
    state.status = "package_gap"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_failed", data: { state: state.status, error: error instanceof Error ? error.message : String(error) } }); throw error;
  }
}

export function qualificationSucceeded(result) {
  return result?.state === "completed" && Array.isArray(result.executions) && result.executions.every((execution) => execution?.state === "candidate_ready");
}

export async function canonicalAccept({ buildRoot, entry: entryName, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  if (state.status !== "waiting_for_entry_review") fail("canonical build is not waiting for entry reviews", "canonical_transition_invalid");
  if (!stages.includes(entryName)) fail("unknown canonical entry", "canonical_entry_unknown");
  const receiptFile = path.join(root, state.qualification?.receipt ?? ""); if (!(await exists(receiptFile))) fail("canonical entry acceptance requires a qualification receipt", "qualification_receipt_missing");
  const receipt = await readJson(receiptFile); if (receipt.schema_id !== "dd-eval/qualification-receipt@2" || receipt.status !== "qualified") fail("canonical entry acceptance requires successful qualification", "qualification_not_successful");
  const review = path.resolve(reviewFile); if (!(await exists(review)) || !(await readFile(review, "utf8")).trim()) fail("canonical entry review must be a non-empty file", "canonical_review_required");
  state.entry_reviews = { ...(state.entry_reviews ?? {}), [entryName]: { review, sha256: await manifestHash(review), at: now() } };
  const allAccepted = stages.every((key) => state.entry_reviews[key]);
  if (!allAccepted) {
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.entry_accepted", data: { state: state.status, entry: entryName } });
    return { build: root, state, next: { kind: "entry_review", remaining: stages.filter((key) => !state.entry_reviews[key]) } };
  }
  const pack = await canonicalCandidatePack(root, state, blueprint); pack.entries = Object.fromEntries(stages.map((key) => [key, `${key}.json`])); pack.status = "accepted"; pack.accepted_at = now(); pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  const destination = path.join(loaded.root, "stage-entries", state.revision); await mkdir(destination, { recursive: true });
  await writeJsonAtomic(path.join(destination, "stage-context.json"), blueprint);
  for (const key of stages) await writeJsonAtomic(path.join(destination, `${key}.json`), await readJson(path.join(root, state.entries[key])));
  await writeJsonAtomic(path.join(destination, "entry-pack.json"), pack);
  const reviews = path.join(loaded.root, "checkpoint-reviews", state.revision); await mkdir(reviews, { recursive: true });
  for (const [key, value] of Object.entries(state.entry_reviews)) await cp(value.review, path.join(reviews, `${key}.md`), { force: true });
  const caseFile = path.join(loaded.root, "case.json"); const caseValue = await readJson(caseFile); caseValue.entry_pack = path.relative(loaded.root, path.join(destination, "entry-pack.json")); await writeJsonAtomic(caseFile, caseValue);
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

/** Add the exact engine artifact to a pre-engine-snapshot canonical build.
 * This is an explicit, one-time migration; normal qualification never falls
 * back to a globally installed engine. */
export async function canonicalEngineCapture({ buildRoot }) {
  const { root, state } = await canonicalState(buildRoot);
  if (state.status !== "entries_captured") fail("engine capture is allowed only after the canonical chain is complete and before qualification", "canonical_transition_invalid");
  if (state.engine) fail("canonical build already has an engine snapshot", "canonical_engine_already_captured");
  const runId = state.reference?.run_id;
  if (typeof runId !== "string") fail("canonical build has no reference RUN for engine capture", "canonical_state_invalid");
  const projectsRoot = path.join(root, "reference", "dd-flow-home", "projects");
  const projects = await readdir(projectsRoot, { withFileTypes: true });
  const matching = projects.filter((item) => item.isDirectory()).map((item) => path.join(projectsRoot, item.name, "runs", runId, "engine-binding.json"));
  const bindingFile = (await Promise.all(matching.map(async (file) => (await exists(file)) ? file : null))).find(Boolean);
  if (!bindingFile) fail("reference RUN engine binding is missing", "canonical_engine_missing");
  const binding = await readJson(bindingFile);
  const bound = binding?.engine;
  if (!bound?.snapshot_root || !bound?.package_name || !bound?.package_version || !bound?.engine_version || !bound?.integrity_checksum) fail("reference RUN has no valid engine binding", "canonical_engine_missing");
  const sourceManifest = await readJson(path.join(bound.snapshot_root, "engine.json"));
  if (sourceManifest?.integrity?.checksum !== bound.integrity_checksum) fail("reference engine does not match the immutable RUN binding", "canonical_engine_mismatch");
  const engine = await captureEngineSnapshot({ root, home: evalHome(), selected: sourceManifest });
  for (const locator of Object.values(state.entries)) {
    const file = path.join(root, locator);
    const entry = await readJson(file);
    await writeJsonAtomic(file, { ...entry, engine });
  }
  state.engine = engine;
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.engine_captured", data: { engine } });
  return { build: root, state, engine, next: { kind: "canonical_qualify", message: "Run canonical qualify with this case's qualification profile." } };
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
function engineTarget(runtimeRoot, engine) {
  return path.join(runtimeRoot, "engines", engine.package_name.replace("/", "_"), engine.package_version);
}
async function verifyEngineSnapshot(home, engine) {
  const root = contained(home, engine.locator, "engine snapshot locator");
  const manifestFile = path.join(root, "engine.json");
  if (!(await exists(manifestFile))) fail(`engine snapshot manifest is missing: ${manifestFile}`, "engine_snapshot_missing");
  const manifest = await readJson(manifestFile);
  if (manifest?.schema_id !== "dd-flow/engine-manifest@1" || manifest.package_name !== engine.package_name || manifest.package_version !== engine.package_version || manifest.engine_version !== engine.engine_version || manifest.integrity?.checksum !== engine.integrity_checksum) fail("engine snapshot does not match its stage entry", "engine_snapshot_mismatch");
  return { root, manifest };
}
async function captureEngineSnapshot({ root, home, selected }) {
  if (!selected?.snapshot_root || !selected?.package_name || !selected?.package_version || !selected?.engine_version || !selected?.integrity?.checksum) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
  const destination = path.join(root, "engine");
  await cp(selected.snapshot_root, destination, { recursive: true, force: true, verbatimSymlinks: true });
  const manifestFile = path.join(destination, "engine.json");
  const manifest = await readJson(manifestFile);
  const rewritten = { ...manifest, package_root: destination, snapshot_root: destination };
  await writeJsonAtomic(manifestFile, rewritten);
  return {
    schema_id: "dd-eval/engine-snapshot@1",
    locator: canonicalLocator(home, destination),
    package_name: rewritten.package_name,
    package_version: rewritten.package_version,
    engine_version: rewritten.engine_version,
    integrity_checksum: rewritten.integrity?.checksum
  };
}
async function materializeRuntimeEngine({ home, engine, runtimeRoot, projectRoot }) {
  const source = await verifyEngineSnapshot(home, engine);
  const target = engineTarget(runtimeRoot, engine);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source.root, target, { recursive: true, force: true, verbatimSymlinks: true });
  const manifestFile = path.join(target, "engine.json");
  const manifest = await readJson(manifestFile);
  await writeJsonAtomic(manifestFile, { ...manifest, package_root: target, snapshot_root: target });
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const isolated = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const selected = isolated.selection?.selected;
  if (selected?.package_name !== engine.package_name || selected?.package_version !== engine.package_version || selected?.engine_version !== engine.engine_version || selected?.integrity?.checksum !== engine.integrity_checksum) fail("isolated runtime did not resolve the exact canonical engine snapshot", "canonical_engine_install_failed");
  await installRuntimeShim(runtimeRoot, selected);
  return selected;
}
async function restoreStageSnapshot({ home, entry, stage, projectRoot, runtimeRoot, authoringEngine = null }) {
  const snapshot = await verifySnapshot(home, entry, stage);
  // The bootstrap restore owns project contents, but engine resolution needs
  // an existing cwd before restore starts.
  await mkdir(projectRoot, { recursive: true });
  const engine = authoringEngine
    ? await materializeRuntimeEngine({ home, engine: authoringEngine, runtimeRoot, projectRoot })
    : await provisionRuntimeEngine(projectRoot, runtimeRoot);
  const bin = runtimeBin(runtimeRoot); const env = runtimeEnv(runtimeRoot);
  if (entry.snapshot.kind === "bootstrap") {
    const restored = await commandJson(bin, ["run", "snapshot", "bootstrap", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot], { cwd: projectRoot, env });
    if (restored.target_stage !== "specify") fail("restored bootstrap does not target SPECIFY", "snapshot_restore_mismatch");
    await mkdir(runtimeRoot, { recursive: true });
    // A bootstrap snapshot has no runtime project record by design. Register
    // the restored root before harness preparation: Codex-home initialization
    // needs that record, while the later bootstrap stage start remains the
    // sole operation that creates the RUN and starts SPECIFY.
    await commandJson("dd-flow", ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null, snapshot: snapshot.root, engine };
  }
  const restored = await commandJson(bin, ["run", "snapshot", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot], { cwd: projectRoot, env });
  if (restored.run_id !== entry.snapshot.run_id || restored.target_stage !== stage) fail("restored RUN does not match its stage entry", "snapshot_restore_mismatch");
  return { ...restored, snapshot: snapshot.root, engine };
}
async function provisionRuntimeEngine(projectRoot, runtimeRoot) {
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  // A beta/eval caller may deliberately supply the local CLI entrypoint.  Do
  // not ask that entrypoint to select an already-installed same-semver engine:
  // install its current bytes into the otherwise empty runtime first.  This is
  // the one explicit development override; normal runs retain package routing.
  if (process.env.DD_FLOW_BIN) {
    await commandJson(bin, ["engine", "install", "--force"], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    const isolated = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
    const selected = isolated.selection?.selected;
    if (!selected?.snapshot_root || !selected?.entrypoint || !selected?.package_version) fail("local dd-flow override did not install a compatible engine", "canonical_engine_install_failed");
    await installRuntimeShim(runtimeRoot, selected);
    return selected;
  }
  const global = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: {} });
  const selected = global.selection?.selected;
  if (!selected?.snapshot_root || !selected?.entrypoint || !selected?.package_version) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
  await commandJson(process.execPath, [path.join(selected.snapshot_root, selected.entrypoint), "engine", "install"], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const isolated = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  if (isolated.selection?.selected?.package_version !== selected.package_version || isolated.selection?.selected?.integrity?.checksum !== selected.integrity?.checksum) fail("isolated runtime did not resolve the selected dd-flow engine", "canonical_engine_install_failed");
  await installRuntimeShim(runtimeRoot, isolated.selection.selected);
  return isolated.selection.selected;
}

async function installRuntimeShim(runtimeRoot, selected) {
  if (!selected?.snapshot_root || !selected?.entrypoint) fail("canonical runtime has no executable dd-flow engine", "canonical_engine_missing");
  const executable = path.join(selected.snapshot_root, selected.entrypoint);
  const shim = runtimeBin(runtimeRoot);
  await mkdir(path.dirname(shim), { recursive: true });
  // The shim can be called directly from a provider tool shell. Re-export its
  // absolute identity so follow-up commands cannot fall back to global dd-flow.
  await writeFile(shim, `#!/bin/sh\nexport DD_FLOW_BIN=${JSON.stringify(shim)}\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(executable)} "$@"\n`, { mode: 0o755 });
  await chmod(shim, 0o755);
  return shim;
}
function runtimeEngineIdentity(engine) {
  return { package_name: engine.package_name, package_version: engine.package_version, engine_version: engine.engine_version, integrity_checksum: engine.integrity?.checksum ?? engine.integrity_checksum };
}
async function initializeCodexHome({ projectRoot, runtimeRoot, codexHome }) {
  const bin = "dd-flow";
  const initialized = await commandJson(bin, ["codex", "home", "init", "--project-root", projectRoot, "--target-home", codexHome], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  if (initialized.ok === false) fail("could not initialize isolated Codex home", "hook_preflight_failed");
  return initialized;
}
async function materializeTaskInput(caseRoot, blueprint, stage, projectRoot) {
  // Task input is runner-local context, never an untracked product change.
  // Every snapshot restore gets a fresh Git directory, so establish this
  // local-only exclusion after each materialization rather than relying on
  // the source checkout's .git/info/exclude.
  await ignoreEvalLocalState(projectRoot);
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
  for (const key of ["provider", "model", "reasoning", "mode"]) {
    if (profile[key] && observed[key] && observed[key] !== profile[key]) fail(`${label} observed ${key} ${observed[key]}, expected ${profile[key]}`, "profile_drift");
  }
}
export function driverProfileArgs(profile, args) {
  if (!['doctor', 'session'].includes(args[0]) && !(args[0] === 'daemon' && args[1] === 'start')) return args;
  const resolved = [...args];
  for (const key of ["provider", "model", "reasoning", "mode"]) {
    if (typeof profile[key] === "string" && profile[key] && !resolved.includes(`--${key}`)) resolved.push(`--${key}`, profile[key]);
  }
  return resolved;
}
async function absoluteExecutable(command, cwd, env = process.env) {
  if (path.isAbsolute(command)) return command;
  if (command.includes(path.sep)) return path.resolve(cwd, command);
  for (const directory of (env.PATH ?? process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory || ".", command);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* Continue scanning PATH. */ }
  }
  fail(`Executable is not available on PATH: ${command}`, "executable_not_found");
}
export async function driverRuntimeArgs(args, { cwd, env = {} } = {}) {
  if (args[0] !== "daemon" || args[1] !== "start" || typeof env.DD_FLOW_HOME !== "string" || !path.isAbsolute(env.DD_FLOW_HOME)) return args;
  const resolved = [...args];
  if (!resolved.includes("--dd-flow-bin")) resolved.push("--dd-flow-bin", await absoluteExecutable(env.DD_FLOW_BIN ?? process.env.DD_FLOW_BIN ?? "dd-flow", cwd, env));
  if (!resolved.includes("--dd-flow-home")) resolved.push("--dd-flow-home", env.DD_FLOW_HOME);
  if (!resolved.includes("--project-root")) resolved.push("--project-root", cwd);
  return resolved;
}
async function callDriver(profile, args, options) {
  const { spawn } = await import("node:child_process"); const executable = process.execPath; const script = path.join(repoRoot, "bin", driverFor(profile));
  const command = driverProfileArgs(profile, await driverRuntimeArgs(args, options));
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...command, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", (error) => { if (progress) clearInterval(progress); reject(error); });
    child.on("close", (code) => { if (progress) clearInterval(progress); if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `driver exited ${code}`), { code: "driver_failed" })); try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(new Error(`driver returned invalid JSON: ${error.message}`)); } });
  });
}

export async function committedDefinitionIdentity(repository = repoRoot) {
  const dirty = await commandText("git", ["status", "--porcelain"], { cwd: repository });
  if (dirty) fail("scored execution requires a clean committed dd-eval definition tree", "definition_tree_dirty");
  const [commit, tree] = await Promise.all([
    commandText("git", ["rev-parse", "HEAD"], { cwd: repository }),
    commandText("git", ["rev-parse", "HEAD^{tree}"], { cwd: repository })
  ]);
  return { repository, commit, tree };
}

async function reconcileFlow({ projectRoot, runtimeRoot, expectedStage, runId }) {
  const env = runtimeEnv(runtimeRoot); const bin = "dd-flow";
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
  await commandJson("dd-flow", ["stage", "pause", lifecycle.run_id, "--stage", stage, "--work", workId, "--question-stdin", "--project-root", roots.projectRoot], { cwd: roots.projectRoot, env: runtimeEnv(roots.runtimeRoot), input: prompted.assistant_text });
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
export function mergeMode(lifecycle) {
  const profile = lifecycle.status?.index?.execution_profile ?? lifecycle.status?.run?.execution_profile;
  return profile?.settings?.merge_mode ?? "same_session";
}
export function stageExecutor(stage, lifecycle) {
  return stage === "merge" && mergeMode(lifecycle) === "server" ? "merge_server" : "subject";
}
function mergeHarness(profile) {
  return profile.harness === "codex-desktop" ? "codex" : profile.harness === "zcode-acp" ? "zcode" : profile.harness === "grok-acp" ? "grok" : profile.harness === "opencode-server" ? "opencode" : profile.harness === "antigravity-cli" ? "agy" : fail(`unsupported merge-server harness: ${profile.harness}`, "merge_profile_invalid");
}
async function materializeMergeAgentProfile({ profile, runtimeRoot }) {
  const harness = mergeHarness(profile); const id = `eval-${profile.id}-merge`;
  const directory = path.join(runtimeRoot, "agent-profiles"); const adapterDir = path.join(runtimeRoot, "merge-adapters");
  await mkdir(directory, { recursive: true }); await mkdir(adapterDir, { recursive: true });
  const adapter = path.join(repoRoot, "bin", driverFor(profile)); const wrapper = path.join(adapterDir, `dd-${harness}`);
  await writeFile(wrapper, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(adapter)} "$@"\n`, "utf8"); await chmod(wrapper, 0o755);
  await writeJsonAtomic(path.join(directory, `${id}.json`), {
    schema_id: "dd-flow/agent-profile@1", id, harness,
    provider: profile.provider ?? profile.harness, model: profile.model,
    reasoning: profile.reasoning, mode: profile.mode ?? "agent", permission: "allow"
  });
  return { id, env: { [`DD_FLOW_${harness.toUpperCase()}_ADAPTER`]: wrapper } };
}
export async function runServerMerge({ profile, projectRoot, runtimeRoot, runId, env = {}, onProgress = null }) {
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: "merge", runId });
  if (mergeMode(lifecycle) !== "server") return null;
  const agent = await materializeMergeAgentProfile({ profile, runtimeRoot }); const bin = "dd-flow";
  const receipt = await commandJson(bin, ["merge", "serve", "--agent-profile", agent.id, "--once", "--max-parallel-projects", "1", "--progress-jsonl"], {
    cwd: projectRoot, env: { ...runtimeEnv(runtimeRoot), ...env, ...agent.env }, onProgress
  });
  const reconciled = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: "merge", runId });
  return { agent_profile_id: agent.id, receipt, lifecycle: reconciled };
}
async function collectFlowStatistics({ projectRoot, runtimeRoot, runId }) {
  const bin = "dd-flow"; const env = runtimeEnv(runtimeRoot);
  const [usage, sessions] = await Promise.all([
    commandJson(bin, ["stat", "usage", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env }),
    commandJson(bin, ["stat", "run", "sessions", "ls", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env })
  ]);
  return { collected_at: now(), usage, sessions };
}
export function resultCheckpointMode(stage) {
  const successor = nextStage(stage);
  return successor ? { purpose: "stage_entry", stage_entry: successor } : { purpose: "candidate", stage_entry: null };
}
async function waitForFile(file, attempts = 120, intervalMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await exists(file)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
async function captureCandidate({ projectRoot, runtimeRoot, runId, attempt, stage }) {
  const output = path.join(attempt, "candidate");
  const bin = "dd-flow";
  const manifestFile = path.join(output, "snapshot.json");
  const expected = resultCheckpointMode(stage);
  const modeArgs = expected.purpose === "candidate" ? ["--candidate"] : ["--stage-entry", expected.stage_entry];
  let created = { reused: true };
  if (!(await exists(manifestFile))) {
    try {
      created = await commandJson(bin, ["run", "snapshot", "create", runId, ...modeArgs, "--project-root", projectRoot, "--output", output], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    } catch (error) {
      // An interrupted controller can race the original immutable snapshot.
      // Reuse its manifest once available; never overwrite its output.
      if (!/snapshot output already exists/i.test(error.message) || !(await waitForFile(manifestFile))) throw error;
    }
  }
  const bytes = await readFile(manifestFile);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schema_id !== "dd-flow/eval-run-snapshot@5" || manifest.run_id !== runId || manifest.purpose !== expected.purpose || manifest.stage_entry !== expected.stage_entry) fail("result checkpoint does not match its completed Stage", "candidate_checkpoint_invalid");
  return { snapshot: output, manifest: manifestFile, manifest_sha256: sha256(bytes), created, ...expected };
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
function candidateMatches(candidate, manifest, results) {
  if (candidate?.schema_id !== "dd-eval/run-candidate@1" || candidate.run_id !== manifest.run_id || candidate.manifest_sha256 !== hashJson(manifest)) return false;
  const expected = results.map((result) => ({ execution: result.execution, stage: result.stage, run_id: result.run_id, session_id: result.session_id, manifest_sha256: result.candidate?.manifest_sha256 })).sort((left, right) => left.execution.localeCompare(right.execution));
  const actual = (candidate.executions ?? []).map((result) => ({ execution: result.execution, stage: result.stage, run_id: result.run_id, session_id: result.session_id, manifest_sha256: result.checkpoint?.manifest_sha256 })).sort((left, right) => left.execution.localeCompare(right.execution));
  return JSON.stringify(actual) === JSON.stringify(expected);
}
async function frozenCandidate({ root, manifest, results }) {
  const file = path.join(root, "candidate.json");
  if (await exists(file)) {
    const candidate = await readJson(file);
    if (!candidateMatches(candidate, manifest, results)) fail("existing candidate does not match completed executions", "candidate_checkpoint_conflict");
    return { candidate: { file, ...candidate }, created: false };
  }
  return { candidate: await freezeRunCandidate({ root, runId: manifest.run_id, manifest, results }), created: true };
}
async function appendRunEventOnce({ eventsFile, runId, type, data }) {
  const prior = await readEvents(eventsFile);
  const comparable = (value) => { const copy = { ...(value ?? {}) }; delete copy.sequence; return JSON.stringify(copy); };
  if (prior.some((event) => event.type === type && comparable(event.data) === comparable(data))) return false;
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId, traceId: runId, type, data });
  return true;
}
function storedExecutionResults(events, manifest) {
  return manifest.executions.map((execution) => resultForOperation(events, `${manifest.run_id}:${execution.id}:launch`) ?? { execution: execution.id, state: "awaiting_provider" });
}
async function finalizeRunProjection({ root, manifest, loaded, results, permits = null }) {
  const eventsFile = path.join(root, "events.jsonl");
  const completed = results.every((result) => result.state === "candidate_ready");
  const state = completed ? "completed" : results.some((result) => result.state === "failed") ? "completed_with_failures" : "awaiting_provider";
  let candidate = null; let judge = null;
  if (completed) {
    const frozen = await frozenCandidate({ root, manifest, results }); candidate = frozen.candidate;
    if (frozen.created) await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.candidate.frozen", data: { state: "candidate_ready", candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file } });
    if (manifest.profile?.judge?.enabled) {
      const file = path.join(root, "judge", "result.json");
      judge = await (await exists(file) ? readJson(file) : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: manifest.profile.judge.profile_id, candidate, permits, results }));
      await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.final_judge.completed", data: { judge_profile: judge.profile_id, judge_session_id: judge.session_id, candidate_sha256: judge.candidate_sha256 } });
    }
  }
  await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed", data: { state, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  const projection = reduceEvents(await readEvents(eventsFile)); const report = buildReport({ root, manifest, state, results, candidate, judge });
  await mkdir(path.join(root, "reports"), { recursive: true });
  await writeJsonAtomic(path.join(root, "reports", "report.json"), report);
  await writeFile(path.join(root, "reports", "report.md"), `# Eval ${manifest.run_id}\n\n- State: ${state}\n- Executions: ${results.length}\n- Failed: ${results.filter((result) => result.state === "failed").length}\n- Cancelled: ${results.filter((result) => result.state === "cancelled").length}\n${judge ? `- Final Judge: ${judge.profile_id}\n` : "- Final Judge: not requested\n"}`);
  await writeJsonAtomic(path.join(root, "state.json"), projection);
  return { state, candidate, judge, report };
}
export function entryLauncher({ stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile }) {
  // A Codex/ACP shell action does not inherit variables from an earlier action.
  // Give the engine its own immutable launcher identity on the very first
  // lifecycle call; generated later commands then retain that exact launcher.
  const prefix = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} DD_FLOW_BIN=${JSON.stringify(runtimeBin(runtimeRoot))} ${JSON.stringify(runtimeBin(runtimeRoot))} stage start`;
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
  const command = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} ${JSON.stringify(runtimeBin(runtimeRoot))} stage resume ${lifecycle.run_id} --stage ${stage} --work ${pause.work_id} --answer-stdin --project-root ${JSON.stringify(projectRoot)} --json < ${JSON.stringify(answerFile)}`;
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
  const invoke = async () => {
    const receipt = await callDriver(profile, args, options);
    if (args[0] === "session" && args[1] === "prompt") assertObservedProfile(receipt, profile, "provider Turn");
    return receipt;
  };
  return permits ? permits.use(profile, invoke) : invoke();
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
    "Do not send a prose completion message. Your next actions are: write the required result JSON, run the exact standalone work finish command from the authoritative Work prompt, then stop only after that command returns successful JSON.",
    "If a failed-check receipt exists, read its stdout/stderr and fix the project-owned cause in this same Work before finishing. If no receipt exists, use the original Work prompt's result contract. Do not create another Work or child agent."
  ].join("\n");
}

export function fanoutWorkerTerminalState(status) {
  if (status === "completed") return "accepted";
  if (status === "failed" || status === "cancelled") return "settled_failure";
  return "incomplete";
}

export function workerUsageSource(profile) {
  // ACP adapters ingest their own native cumulative snapshots with the exact
  // provider Session ID. `session usage sync` is a Codex-transcript command;
  // applying it to an ACP ID is both redundant and incorrectly fatal.
  return ["zcode-acp", "grok-acp"].includes(profile?.harness) ? "adapter_ingested" : "session_sync";
}

function fanoutCoordinatorPrompt({ stage, status }) {
  const works = status.orchestration?.works ?? {};
  return [
    `All currently declared child Work for ${stage} has settled.`,
    `Completed: ${works.completed ?? 0}; failed: ${works.failed ?? 0}; cancelled: ${works.cancelled ?? 0}.`,
    "Continue the same Stage using its authoritative prompt and exact finish command already returned by dd-flow.",
    "Read the recorded child results and make the Stage's semantic decision yourself. If stage finish returns repair_required or an exact repair command, execute that command in this same Turn before stopping: a rejected finish does not itself create a repair Work. If finishing creates a repair Work, stop after that command; the runner will execute the newly declared Work graph. Do not start a successor Stage."
  ].join("\n");
}

export function fanoutSettledFingerprint({ stage, status }) {
  const orchestration = status?.orchestration ?? {};
  const works = orchestration.works ?? {};
  return JSON.stringify({
    stage,
    parent_work_id: orchestration.parent_work_id ?? null,
    created: works.created ?? 0,
    running: works.running ?? 0,
    completed: works.completed ?? 0,
    failed: works.failed ?? 0,
    cancelled: works.cancelled ?? 0,
    ready: (Array.isArray(works.ready) ? works.ready : []).map((work) => work.work_id ?? work).sort()
  });
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
  const bin = "dd-flow";
  return await commandJson(bin, ["stage", "fanout", "status", runId, "--stage", stage, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
}

async function fanoutDispatch({ projectRoot, runtimeRoot, runId, stage }) {
  const bin = "dd-flow";
  return await commandJson(bin, ["stage", "fanout", "dispatch", runId, "--stage", stage, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
}

async function recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots }) {
  const bin = "dd-flow";
  return await commandJson(bin, ["run", "capacity", "record", runId, "--available-slots", String(availableSlots), "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
}

async function startIsolatedWorkerDaemon({ profile, attempt, projectRoot, runtimeRoot, key }) {
  const stateDir = path.join(attempt, "drivers", "fanout", key, "daemon");
  const journal = path.join(attempt, "drivers", "fanout", key, "events.jsonl");
  const codexHome = path.join(attempt, "codex-home", "fanout", key);
  const env = runtimeEnv(runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {});
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
  const daemonArgs = ["--state-dir", stateDir];
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
  return { daemonArgs, journal, env };
}

// ZCode can host several independent ACP Sessions in one bridge.  Its probe
// daemon deliberately has no dd-flow context: probe leaves are not RUN
// Sessions, Works, or usage sources.  Keeping this exceptional transport
// detail here preserves the same runner-level capacity contract for every
// harness while avoiding fifteen cold ACP processes for one measurement.
async function startZcodeProbeDaemon({ profile, attempt, projectRoot }) {
  const stateDir = path.join(attempt, "drivers", "fanout", "capacity-probe", "daemon");
  const journal = path.join(attempt, "drivers", "fanout", "capacity-probe", "events.jsonl");
  const daemonArgs = ["--state-dir", stateDir];
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--probe-mode", "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env: {} });
  return { daemonArgs, journal, env: {} };
}

async function stopIsolatedWorkerDaemon({ profile, daemon, projectRoot }) {
  try { await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env }); }
  catch { /* A failed or cancelled disposable worker must not hide the primary receipt. */ }
}

export function capacityProbePrompt(number, holdSeconds) {
  const agent = `AGENT-${String(number).padStart(2, "0")}`;
  return `This is capacity probe ${agent}. Do not call tools, read files, create children, or explain. Wait exactly ${holdSeconds} seconds, then return exactly ${agent}.`;
}

async function runZcodeCapacityProbe({ profile, attempt, projectRoot, probe, eventsFile, event }) {
  const size = Number(probe?.fanout_size); const hold = Number(probe?.probe_hold_seconds); const deadline = Number(probe?.cleanup_deadline_seconds);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(hold) || hold < 1 || !Number.isInteger(deadline) || deadline < hold) fail("invalid work-fanout capacity probe contract", "fanout_contract_invalid");
  const provisionStartedAt = Date.now();
  const daemon = await startZcodeProbeDaemon({ profile, attempt, projectRoot });
  const launches = [];
  try {
    for (let index = 0; index < size; index += 1) {
      const key = `probe-${String(index + 1).padStart(2, "0")}`;
      try {
        const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
        const sessionId = created.provider_session_id ?? created.session_id;
        const adapterSessionId = created.adapter_session_id ?? sessionId;
        if (typeof sessionId !== "string" || typeof adapterSessionId !== "string") throw Object.assign(new Error("probe driver did not return a Session"), { code: "driver_protocol" });
        launches.push({ key, index, session_id: sessionId, adapter_session_id: adapterSessionId });
        await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.session_provisioned", data: { key, session_id: sessionId } });
      } catch (error) {
        launches.push({ key, index, completed: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const provisionedAt = Date.now();
    const launched = launches.filter((launch) => typeof launch.session_id === "string");
    if (!launched.length) {
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.completed", data: { requested: size, available_slots: 0, deadline_seconds: deadline, provision_started_at: new Date(provisionStartedAt).toISOString(), provision_completed_at: new Date(provisionedAt).toISOString(), hold_seconds: hold, results: launches } });
      return 0;
    }
    const probesFile = path.join(attempt, "drivers", "fanout", "capacity-probe", "probes.json");
    await writeJsonAtomic(probesFile, launched.map((launch) => ({
      provider_session_id: launch.session_id,
      adapter_session_id: launch.adapter_session_id,
      prompt: capacityProbePrompt(launch.index + 1, hold),
    })));
    const promptedAt = Date.now();
    let response;
    try {
      response = await callDriver(profile, ["session", "probe-batch", ...daemon.daemonArgs, "--cwd", projectRoot, "--probes-file", probesFile, "--journal", daemon.journal, "--timeout", String(deadline)], { cwd: projectRoot, env: daemon.env });
    } catch (error) {
      response = { results: [], error: error instanceof Error ? error.message : String(error) };
    }
    const responses = new Map((Array.isArray(response?.results) ? response.results : []).map((result) => [result.provider_session_id, result]));
    const results = launches.map((launch) => {
      if (typeof launch.session_id !== "string") return launch;
      const result = responses.get(launch.session_id);
      const expected = `AGENT-${String(launch.index + 1).padStart(2, "0")}`;
      return { key: launch.key, session_id: launch.session_id, completed: result?.assistant_text?.trim() === expected, ...(result?.assistant_text ? { assistant_text: result.assistant_text } : {}), ...(response?.error ? { error: response.error } : {}) };
    });
    const availableSlots = results.filter((result) => result.completed).length;
    await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.completed", data: {
      requested: size,
      available_slots: availableSlots,
      deadline_seconds: deadline,
      provision_started_at: new Date(provisionStartedAt).toISOString(),
      provision_completed_at: new Date(provisionedAt).toISOString(),
      launch_completed_at: new Date(promptedAt).toISOString(),
      prompts_dispatched_at: new Date(promptedAt).toISOString(),
      provision_elapsed_ms: provisionedAt - provisionStartedAt,
      hold_seconds: hold,
      results,
    } });
    return availableSlots;
  } finally {
    await stopIsolatedWorkerDaemon({ profile, daemon, projectRoot });
  }
}

async function runCapacityProbe({ profile, attempt, projectRoot, runtimeRoot, probe, eventsFile, event }) {
  if (profile.harness === "zcode-acp") return await runZcodeCapacityProbe({ profile, attempt, projectRoot, probe, eventsFile, event });
  const size = Number(probe?.fanout_size); const hold = Number(probe?.probe_hold_seconds); const deadline = Number(probe?.cleanup_deadline_seconds);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(hold) || hold < 1 || !Number.isInteger(deadline) || deadline < hold) fail("invalid work-fanout capacity probe contract", "fanout_contract_invalid");
  const handles = new Map();
  const settled = new Set();
  const provisionStartedAt = Date.now();
  const launches = [];

  // A Session is not an agent turn.  Provision isolated drivers one at a time
  // so an ACP cold-start stampede cannot become the measured resource.  Only
  // the prompt batch below launches the fifteen disposable agents, and it is
  // deliberately concurrent.
  for (let index = 0; index < size; index += 1) {
    const key = `probe-${String(index + 1).padStart(2, "0")}`;
    let daemon;
    try {
      daemon = await startIsolatedWorkerDaemon({ profile, attempt, projectRoot, runtimeRoot, key });
      const created = await callDriver(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
      const sessionId = created.provider_session_id ?? created.session_id;
      if (typeof sessionId !== "string") throw Object.assign(new Error("probe driver did not return a Session"), { code: "driver_protocol" });
      handles.set(key, { daemon, sessionId });
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.session_provisioned", data: { key, session_id: sessionId } });
      launches.push({ key, daemon, session_id: sessionId, index });
    } catch (error) {
      if (daemon) await stopIsolatedWorkerDaemon({ profile, daemon, projectRoot });
      launches.push({ key, completed: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const provisionedAt = Date.now();
  const deadlineAt = provisionedAt + deadline * 1000;
  const outcomes = launches.filter((launch) => launch.completed === false);
  const prompted = launches.map((launch) => (async () => {
    if (!launch.daemon || !launch.session_id) return launch;
    try {
      const remainingSeconds = Math.max(1, Math.ceil((deadlineAt - Date.now()) / 1000));
      const response = await callDriver(profile, ["session", "prompt", ...launch.daemon.daemonArgs, "--session-id", launch.session_id, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", capacityProbePrompt(launch.index + 1, hold), "--journal", launch.daemon.journal, "--timeout", String(remainingSeconds)], { cwd: projectRoot, env: launch.daemon.env });
      const expected = `AGENT-${String(launch.index + 1).padStart(2, "0")}`;
      return { key: launch.key, session_id: launch.session_id, completed: response?.assistant_text?.trim() === expected };
    } catch (error) { return { key: launch.key, session_id: launch.session_id, completed: false, error: error instanceof Error ? error.message : String(error) }; }
    finally { settled.add(launch.key); await stopIsolatedWorkerDaemon({ profile, daemon: launch.daemon, projectRoot }); }
  })().then((outcome) => { outcomes.push(outcome); return outcome; }));
  const all = Promise.all(prompted);
  const promptedAt = Date.now();
  let timeoutId;
  const timeout = new Promise((resolve) => { timeoutId = setTimeout(resolve, Math.max(1, deadlineAt - promptedAt), "timeout"); });
  // A provider may return an eager marker despite the probe instruction. Start
  // this timer only after every launch attempt has created (or failed to
  // create) its Session, so the measured occupancy window is never shortened.
  const held = new Promise((resolve) => setTimeout(resolve, hold * 1000));
  const result = await Promise.race([Promise.all([all, held]).then(([outcomes]) => outcomes), timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  if (result === "timeout") {
    await Promise.all([...handles.entries()].filter(([key]) => !settled.has(key)).map(async ([key, handle]) => {
      try { await callDriver(profile, ["session", "cancel", ...handle.daemon.daemonArgs, "--session-id", handle.sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", handle.daemon.journal], { cwd: projectRoot, env: handle.daemon.env }); }
      catch { /* Some providers cannot cancel an already-terminal probe. */ }
      await stopIsolatedWorkerDaemon({ profile, daemon: handle.daemon, projectRoot });
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.cancelled", data: { key, session_id: handle.sessionId } });
    }));
    await Promise.allSettled(prompted);
  }
  const results = result === "timeout" ? outcomes : result;
  const availableSlots = results.filter((item) => item.completed).length;
  await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.probe.completed", data: {
    requested: size,
    available_slots: availableSlots,
    deadline_seconds: deadline,
    provision_started_at: new Date(provisionStartedAt).toISOString(),
    provision_completed_at: new Date(provisionedAt).toISOString(),
    launch_completed_at: new Date(promptedAt).toISOString(),
    prompts_dispatched_at: new Date(promptedAt).toISOString(),
    provision_elapsed_ms: provisionedAt - provisionStartedAt,
    hold_seconds: hold,
    results,
  } });
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
    let observed = await commandJson("dd-flow", ["work", "show", workId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    if (observed.work?.status === "running") {
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.recovery_dispatched", data: { work_id: workId, session_id: sessionId, status: observed.work?.status ?? null } });
      response = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", fanoutWorkerRecoveryPrompt({ workId }), "--journal", daemon.journal], { cwd: projectRoot, env: daemon.env });
      observed = await commandJson("dd-flow", ["work", "show", workId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    }
    const usage = workerUsageSource(profile) === "adapter_ingested"
      ? { status: "adapter_ingested", provider_session_id: sessionId, usage: response?.evidence?.usage ?? null }
      : await commandJson("dd-flow", ["session", "usage", "sync", "--project-root", projectRoot, "--session-id", sessionId], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const terminal = fanoutWorkerTerminalState(observed.work?.status);
    if (terminal === "settled_failure") {
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.worker.failed", data: { work_id: workId, session_id: sessionId, status: observed.work?.status ?? null, result: observed.work?.result ?? null } });
      fail(`fan-out worker ${workId} explicitly ${observed.work?.status}: ${String(observed.work?.result ?? "no failure reason recorded")}`, "fanout_worker_failed");
    }
    if (terminal !== "accepted") {
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
      // Do not turn one terminal worker failure into permission to interrupt
      // healthy siblings.  A wave owns all already-launched Work until each
      // reaches a receipt; only then can the parent report the failure.
      const settled = await Promise.allSettled(wave.map((work) => runFanoutWorker({ profile, attempt, projectRoot, runtimeRoot, work, eventsFile, event })));
      const rejected = settled.find((item) => item.status === "rejected");
      if (rejected?.status === "rejected") {
        const error = rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
        fail(error.message, error.code ?? "fanout_worker_failed");
      }
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
  const loaded = await loadCase(runProfile.value.case_id);
  const definition = await committedDefinitionIdentity();
  const executions = selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage });
  const needsEntryPack = selectionNeedsEntryPack(executions);
  if (needsEntryPack && typeof loaded.value.entry_pack !== "string") fail("focused or segment execution requires an accepted entry pack");
  const validated = needsEntryPack ? await fixturesValidate({ caseId: runProfile.value.case_id }) : null;
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions, runProfile });
  return executeEval({ runProfile, profile, loaded, validated, definition, executions });
}

export function selectionNeedsEntryPack(executions) { return executions.some((execution) => execution.mode !== "e2e"); }

async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored", executions: suppliedExecutions = null }) {
  const home = evalHome(); const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(home, "runs", runId); const events = path.join(root, "events.jsonl");
  const executions = suppliedExecutions ?? selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage });
  const entryPackManifest = validated ? { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(await readFile(validated.entry_pack)) } : null;
  const manifest = { schema_id: "dd-eval/runner-manifest@1", kind, run_id: runId, case_id: loaded.value.id, entry_pack: entryPackManifest, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, ...(definition ? { definition } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions };
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
  const pack = validated ? validateEntryPack(await readJson(validated.entry_pack), loaded.value.id) : null; const packRoot = validated ? path.dirname(validated.entry_pack) : null;
  const directBlueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
  const focusedBlueprint = pack ? validateStageBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context"))) : null;
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile });
  const permits = createHarnessPermits(runProfile);
  let stopAfterInfrastructureFailure = false;
  const results = await mapLimited(manifest.executions, runProfile.value.concurrency.global, async (execution) => {
    const opId = `${runId}:${execution.id}:launch`;
    const startedAt = now();
    try {
      const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, action: async () => {
      const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
      const blueprint = execution.mode === "e2e" ? directBlueprint : focusedBlueprint;
      let entry; let restored;
      if (execution.mode === "e2e") {
        restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint });
        restored.engine = await provisionRuntimeEngine(projectRoot, runtimeRoot);
        await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        entry = { snapshot: { kind: "bootstrap", run_id: null } };
      } else {
        const entryFile = contained(packRoot, pack.entries[execution.entry], "entry"); entry = validateStageEntry(await readJson(entryFile), execution.stage);
        restored = await restoreStageSnapshot({ home, entry, stage: execution.stage, projectRoot, runtimeRoot });
      }
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      let currentStage = execution.stage;
      let currentEntry = entry;
      let contextFile = path.join(attempt, "stage-context.json"); let slice = await materializeStageSlice({ blueprint, stage: currentStage, roots: { project: projectRoot, workspace: restored.workspace_root, ...(restored.run_home ? { run: restored.run_home } : {}) }, output: contextFile });
      let contextSha256 = sha256(await readFile(contextFile)); let launcher = entryLauncher({ stage: currentStage, entry: currentEntry, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
      await mkdir(path.join(attempt, "launchers"), { recursive: true });
      await writeFile(path.join(attempt, "launchers", `${currentStage}.md`), `${launcher}\n`); const journal = path.join(attempt, "drivers", "subject.events.jsonl");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.context_prepared", data: { stage: currentStage, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher_file: path.join("launchers", `${currentStage}.md`) } });
      const daemonState = path.join(attempt, "drivers", "daemon"); const daemonArgs = ["--state-dir", daemonState];
      const codexHome = path.join(attempt, "codex-home"); const executionEnv = runtimeEnv(runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {});
      if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
      if (stageExecutor(currentStage, { status: restored.status }) === "merge_server" && restored.run_id) {
        const server = await runServerMerge({ profile, projectRoot, runtimeRoot, runId: restored.run_id, env: executionEnv, onProgress: (progress) => appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.merge.server.progress", data: { stage: "merge", progress } }) });
        if (server) {
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.merge.server.completed", data: { stage: "merge", agent_profile_id: server.agent_profile_id, receipt: server.receipt } });
          if (server.lifecycle.stage_status !== "done") fail("merge-server returned without a completed MERGE stage", "merge_server_incomplete");
          const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId: server.lifecycle.run_id, attempt, stage: "merge" }); const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: server.lifecycle.run_id }); await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
          return { execution: execution.id, stage: "merge", attempt, session_id: null, run_id: server.lifecycle.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher: null, driver: { merge_server: server.receipt }, lifecycle: server.lifecycle, boundaries: [], candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
        }
      }
      await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env: executionEnv });
      const doctor = await callDriver(profile, ["doctor", "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }); assertObservedProfile(doctor, profile, "harness doctor");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.harness.preflight", data: { harness: profile.harness, receipt: doctor } });
      const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }, permits);
      assertObservedProfile(created, profile, "Subject Session");
      let sessionId = created.provider_session_id ?? created.session_id; if (typeof sessionId !== "string") fail("driver did not return provider_session_id", "driver_protocol");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.session_created", data: { session_id: sessionId, harness: profile.harness } });
      let prompted; let lifecycle; const boundaries = []; const hitlRounds = new Map(); const settledFanout = new Set();
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
              if (fanout.state === "children_settled") {
                const fingerprint = fanoutSettledFingerprint({ stage: currentStage, status: fanout.status });
                if (settledFanout.has(fingerprint)) {
                  throw Object.assign(new Error(`fan-out ${currentStage} made no progress after all child Work settled; stage finish neither completed nor declared a new repair Work`), { code: "fanout_stage_nonprogressing", stage: currentStage, fingerprint });
                }
                settledFanout.add(fingerprint);
              }
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
          if (stageExecutor(successor, lifecycle) === "merge_server") {
            const roots = restoredRoots(lifecycle, projectRoot, runtimeRoot); currentStage = successor; currentEntry = { snapshot: { run_id: lifecycle.run_id } };
            await materializeTaskInput(loaded.root, blueprint, currentStage, projectRoot); contextFile = path.join(attempt, "stage-context", `${currentStage}.json`);
            slice = await materializeStageSlice({ blueprint, stage: currentStage, roots: { project: roots.project, workspace: roots.workspace, run: roots.run }, output: contextFile }); contextSha256 = sha256(await readFile(contextFile));
            const server = await runServerMerge({ profile, projectRoot, runtimeRoot, runId: lifecycle.run_id, env: executionEnv, onProgress: (progress) => appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.merge.server.progress", data: { stage: "merge", progress } }) });
            if (!server || server.lifecycle.stage_status !== "done") fail("merge-server returned without a completed MERGE stage", "merge_server_incomplete");
            lifecycle = server.lifecycle; prompted = { merge_server: server.receipt }; launcher = null;
            await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.merge.server.completed", data: { stage: "merge", agent_profile_id: server.agent_profile_id, receipt: server.receipt } });
            break;
          }
          // Session handoff is a persisted flow invariant, not a convention for
          // the Subject to infer.  A clean successor Session must exist before
          // its standalone stage-start command can bind it to the RUN.
          if (stageSessionMode(lifecycle) === "new_session") {
            const createdSuccessor = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }, permits);
            assertObservedProfile(createdSuccessor, profile, "successor Subject Session");
            const successorSessionId = createdSuccessor.provider_session_id ?? createdSuccessor.session_id;
            if (typeof successorSessionId !== "string") fail("driver did not return provider_session_id for a required successor Session", "driver_protocol");
            sessionId = successorSessionId;
            await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.successor_session_created", data: { stage: successor, session_id: sessionId } });
          }
          const roots = restoredRoots(lifecycle, projectRoot, runtimeRoot);
          currentStage = successor;
          currentEntry = { snapshot: { run_id: lifecycle.run_id } };
          await materializeTaskInput(loaded.root, blueprint, currentStage, projectRoot);
          contextFile = path.join(attempt, "stage-context", `${currentStage}.json`);
          slice = await materializeStageSlice({ blueprint, stage: currentStage, roots: { project: roots.project, workspace: roots.workspace, run: roots.run }, output: contextFile });
          contextSha256 = sha256(await readFile(contextFile)); launcher = entryLauncher({ stage: currentStage, entry: currentEntry, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
          await writeFile(path.join(attempt, "launchers", `${currentStage}.md`), `${launcher}\n`);
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.context_prepared", data: { stage: currentStage, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher_file: path.join("launchers", `${currentStage}.md`) } });
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
        const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt, stage: currentStage });
        const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: lifecycle.run_id });
        await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
        return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher, driver: prompted, lifecycle, boundaries, candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
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
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results, permits });
  return { run_id: runId, root, executions: results, ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

export async function evalJudge({ evalRoot, profileId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const selected = profileId ?? manifest.profile?.judge?.profile_id;
  const candidate = await readJson(path.join(root, "candidate.json")); const receipt = await finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate });
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, receipt };
}

function resultForOperation(events, operationId) {
  const operation = reduceEvents(events).operations[operationId];
  return operation?.terminal === "completed" ? operation.result : null;
}
function subjectSessionFor(events, executionId) {
  // A configured stage transition may continue through a successor Session.
  // Recovery must address the latest Session for this execution, not the
  // original one that started it.
  const sessions = events.filter((event) => event.executionid === executionId
    && ["dev.dd.eval.subject.session_created", "dev.dd.eval.subject.successor_session_created"].includes(event.type)
    && typeof event.data?.session_id === "string");
  return sessions.at(-1)?.data.session_id ?? null;
}
function preparedContextFor(events, executionId, stage) {
  const prepared = events.filter((event) => event.executionid === executionId && event.type === "dev.dd.eval.execution.context_prepared" && event.data?.stage === stage).at(-1);
  const started = events.find((event) => event.executionid === executionId && event.type === "dev.dd.eval.operation.started")?.time ?? null;
  return { ...(prepared?.data ?? {}), started_at: started };
}
function latestObservedStage(status, fallback) {
  const records = status?.index?.stage_runs ?? status?.run?.index?.stage_runs ?? [];
  const known = Array.isArray(records) ? records.filter((record) => stageSet.has(record?.stage)) : [];
  const unfinished = known.filter((record) => record.status !== "done").sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0];
  if (unfinished?.stage) return unfinished.stage;
  return known.sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0]?.stage ?? fallback;
}
async function withExecutionDaemon({ profile, attempt, projectRoot, runtimeRoot, journal, action }) {
  // Prefer the original daemon state.  A controller may be resumed while its
  // first transport is still alive; creating a second daemon then risks two
  // writers addressing the same provider Session.  A disposable bridge is
  // only appropriate after the original state is known to be unavailable.
  const primaryState = path.join(attempt, "drivers", "daemon");
  const env = runtimeEnv(runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {});
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome: path.join(attempt, "codex-home") });
  const primaryArgs = ["--state-dir", primaryState];
  try {
    await callDriver(profile, ["daemon", "status", ...primaryArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
    return await action({ daemonArgs: primaryArgs, env });
  } catch {
    const bridgeState = path.join(attempt, "drivers", "recovery", randomUUID()); const bridgeArgs = ["--state-dir", bridgeState];
    await callDriver(profile, ["daemon", "start", ...bridgeArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
    try { return await action({ daemonArgs: bridgeArgs, env }); }
    finally { await callDriver(profile, ["daemon", "stop", ...bridgeArgs], { cwd: projectRoot, env }); }
  }
}
async function promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt, journal }) {
  return await withExecutionDaemon({ profile, attempt, projectRoot, runtimeRoot, journal, action: async ({ daemonArgs, env }) => await callDriver(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: projectRoot, env }) });
}
async function inspectExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, journal }) {
  return await withExecutionDaemon({ profile, attempt, projectRoot, runtimeRoot, journal, action: async ({ daemonArgs, env }) => await callDriver(profile, ["session", "inspect", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env }) });
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
    const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt, stage: currentStage }); const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: lifecycle.run_id }); await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
    const prepared = preparedContextFor(events, execution.id, currentStage);
    return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, runtime_engine: prepared.runtime_engine ?? null, semantic_package_sha256: prepared.semantic_package_sha256 ?? null, context_slice_sha256: prepared.context_slice_sha256 ?? null, materialized_context_sha256: prepared.materialized_context_sha256 ?? null, launcher: prepared.launcher_file ?? null, driver: { recovery: true }, boundaries: events.filter((event) => event.executionid === execution.id && event.type === "dev.dd.eval.stage.boundary_captured").map((event) => event.data), candidate, statistics, lifecycle, started_at: prepared.started_at, finished_at: now(), state: "candidate_ready", recovered: true };
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
  const inspected = await inspectExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
  return { execution: execution.id, attempt, session_id: sessionId, run_id: lifecycle.run_id, lifecycle, provider: inspected, state: "awaiting_provider", recovered: true };
}

export async function runnerResume({ evalRoot }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  let blueprint;
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id);
    blueprint = validateStageBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")));
  } else blueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  for (const execution of manifest.executions) {
    const operationId = `${manifest.run_id}:${execution.id}:launch`; const completed = resultForOperation(events, operationId);
    if (completed) { results.push(completed); continue; }
    const recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); results.push(recovery);
    if (recovery.state === "candidate_ready") await completeOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.launch`, result: recovery });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.awaiting_provider", data: { state: "awaiting_provider", execution: execution.id, recovery } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest).map((result, index) => result.state === "awaiting_provider" ? results[index] : result);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results: reconciled });
  return { root, run_id: manifest.run_id, executions: reconciled, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

export async function runnerCancel({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const profile = manifest.subject_profile; const events = await readEvents(path.join(root, "events.jsonl")); const selected = manifest.executions.filter((execution) => !executionId || execution.id === executionId);
  if (selected.length === 0) fail(`unknown execution: ${executionId}`, "execution_unknown");
  const cancelled = [];
  for (const execution of selected) {
    const sessionId = subjectSessionFor(events, execution.id); if (typeof sessionId !== "string") continue;
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home"); const journal = path.join(attempt, "drivers", "subject.events.jsonl");
    const operationId = `${manifest.run_id}:${execution.id}:cancel`;
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.cancel`, action: async () => {
      return await withExecutionDaemon({ profile, attempt, projectRoot, runtimeRoot, journal, action: async ({ daemonArgs, env }) => await callDriver(profile, ["session", "cancel", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env }) });
    } });
    cancelled.push({ execution: execution.id, session_id: sessionId, receipt: receipt.result ?? receipt }); await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.cancelled", data: { state: "cancelled", execution: execution.id } });
  }
  const loaded = await loadCase(manifest.case_id); const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, run_id: manifest.run_id, cancelled };
}

export async function runnerStatus({ evalRoot }) { const root = path.resolve(evalRoot); const events = await readEvents(path.join(root, "events.jsonl")); return { root, ...reduceEvents(events), manifest: await readJson(path.join(root, "manifest.json")) }; }
