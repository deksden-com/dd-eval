import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, open, readFile, readdir, rm, stat, symlink, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, canonicalJson, completeOperation, hashJson, readEvents, readJsonLines, recordOperation, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { materializeStageSlice, semanticContextHash, stages, validateEntry as validateStageEntry, validateStageBlueprint, writeEntryPack } from "./entry-pack.mjs";
import { commandJson, commandText } from "./process-json.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageSet = new Set(stages);
const hitlResponseDelimiter = "\n\n";
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys, label) => { if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label} has unsupported fields`); return value; };
const runtimeBin = (runtimeRoot) => path.join(runtimeRoot, "bin", "dd-flow");
const runtimeEnv = (runtimeRoot, extra = {}) => ({ DD_FLOW_HOME: runtimeRoot, DD_FLOW_BIN: runtimeBin(runtimeRoot), DD_FLOW_RESOURCE_HOME: process.env.DD_FLOW_RESOURCE_HOME ?? path.join(evalHome(), "resources"), PATH: `${path.join(runtimeRoot, "bin")}${path.delimiter}${process.env.PATH ?? ""}`, ...extra });

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
  const engine = value.flow_pack.engine;
  if (!isObject(engine) || typeof engine.repository !== "string" || !engine.repository || typeof engine.commit !== "string" || !/^[a-f0-9]{40}$/.test(engine.commit) || typeof engine.version !== "string" || !engine.version) fail(`input checkpoint has no valid flow_pack engine: ${reference.id}`, "input_checkpoint_invalid");
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
  if (value.subagent_capacity !== undefined && (!Number.isInteger(value.subagent_capacity) || value.subagent_capacity < 1)) fail(`invalid subagent_capacity in harness profile: ${file}`);
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
  for (const key of ["stop_execution_on_unexpected_hitl", "stop_execution_on_unmatched_hitl"]) if (value.failure_policy[key] !== true) fail(`${key}=false is unsupported because the runner has no authorized continuation`, "run_profile_invalid");
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
/**
 * An E2E checkpoint names a project flow pack, not a bare canonical source.
 * Validate only its mechanical contract here; semantic policy remains the
 * responsibility of `dd-flow stage start` once the agent begins the stage.
 */
export async function assertProjectFlowPack(projectRoot, inputCheckpoint) {
  const flow = inputCheckpoint.value.flow_pack;
  const root = contained(projectRoot, flow.path, "input checkpoint flow_pack.path");
  const manifestFile = path.join(root, "manifest.json");
  const missing = [];
  const manifest = await readJson(manifestFile).catch(() => null);
  if (!manifest || manifest.schema_id !== "dd-flow/project-flow-pack-manifest@2") missing.push("manifest.json (dd-flow/project-flow-pack-manifest@2)");
  if (manifest?.pack_version !== flow.memory_bank_version || manifest?.canon_version_at_source_commit !== flow.memory_bank_version) missing.push(`manifest version ${flow.memory_bank_version}`);
  if (!Array.isArray(manifest?.included_files)) missing.push("manifest.included_files");
  else for (const entry of manifest.included_files) {
    try { if (!(await exists(contained(root, entry, "flow manifest included file")))) missing.push(entry); }
    catch { missing.push(String(entry)); }
  }
  for (const [file, schema] of [["project-execution.json", "dd-flow/project-execution@2"], ["project-workspace.json", "dd-flow/project-workspace@1"]]) {
    const value = await readJson(path.join(root, file)).catch(() => null);
    if (value?.schema_id !== schema) missing.push(`${file} (${schema})`);
  }
  if (missing.length) {
    const error = new Error(`input checkpoint ${inputCheckpoint.value.id} does not materialize a complete project flow pack: ${missing.join(", ")}`);
    error.code = "input_checkpoint_flow_pack_invalid";
    error.details = { checkpoint_id: inputCheckpoint.value.id, flow_pack_path: flow.path, missing };
    throw error;
  }
  return { root, manifest_sha256: sha256(await readFile(manifestFile)), memory_bank_version: manifest.pack_version };
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
  await assertProjectFlowPack(target, inputCheckpoint);
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
  await assertProjectFlowPack(projectRoot, inputCheckpoint);
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
    const interactionFixtures = await interactionFixtureManifest(loaded.root, [{ stage: loaded.value.flow.contour[0], terminal_stage: loaded.value.flow.terminal_stage }]);
    const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "awaiting_reference_resume", profile: profile.value.id, profile_file: profile.file, source_project_root: path.resolve(projectRoot), source_preflight: sourcePreflight, definition, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256, file: loaded.inputCheckpoint.file, value: loaded.inputCheckpoint.value }, materialized_input: materializedInput, engine: bootstrap.engine, blueprint_sha256: hashJson(blueprint), current_stage: "specify", reference: { session_id: null, daemon_state: null, run_id: null }, entries: { specify: "entries/specify.json" }, created_at: now() };
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
async function assertCanonicalDefinition(state) {
  const current = await committedDefinitionIdentity();
  if (state.definition?.commit !== current.commit || state.definition?.tree !== current.tree) {
    fail("canonical build belongs to a different committed dd-eval definition", "runner_definition_drift");
  }
}
async function referenceRoots(root, state, entry) {
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  if (!state.reference?.run_id) return { projectRoot, runtimeRoot, workspaceRoot: projectRoot, runRoot: null };
  const status = await commandJson("dd-flow", ["run", "status", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  const run = status.run ?? status.index?.run;
  if (!run?.run_root || !run?.workspace_root) fail("reference RUN has no registered workspace roots", "canonical_state_invalid");
  return { projectRoot, runtimeRoot, workspaceRoot: run.workspace_root, runRoot: run.run_root };
}
async function startReferenceDaemon(profile, roots, root) {
  const daemonState = path.join(root, "reference", "drivers", "daemon"); const journal = path.join(root, "reference", "drivers", "subject.events.jsonl");
  const daemonArgs = ["--state-dir", daemonState];
  const codexHome = path.join(root, "reference", "codex-home"); const env = runtimeEnv(roots.runtimeRoot, profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {});
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, codexHome });
  const args = ["daemon", "start", ...daemonArgs, "--cwd", roots.projectRoot, "--journal", journal];
  try { await callDriver(profile, args, { cwd: roots.projectRoot, env }); }
  catch (error) {
    if (String(error?.message ?? "").includes("daemon_state_terminal")) {
      // Daemon state is disposable transport state; its harness home retains
      // the durable provider Session needed by a recovered canonical Work.
      await rm(daemonState, { recursive: true, force: true });
      await callDriver(profile, args, { cwd: roots.projectRoot, env });
    } else {
      if (error?.code !== "driver_failed" || !String(error.message).includes("daemon did not become ready")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await callDriver(profile, args, { cwd: roots.projectRoot, env });
    }
  }
  return { daemonState, daemonArgs, journal, env };
}
async function restartIdleReferenceDaemon({ profile, daemon, roots, root, sessionId }) {
  const status = await callDriver(profile, ["daemon", "status", ...daemon.daemonArgs], { cwd: roots.projectRoot, env: daemon.env });
  if (status.active_operation !== "session.prompt") return daemon;
  // This path runs only after canonicalResumeLock has been acquired for a
  // recovery continuation. Its original prompt process is therefore gone;
  // an `active` bridge projection is stale and must not keep the daemon's
  // private operation slot occupied.
  await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: roots.projectRoot, env: daemon.env });
  return await startReferenceDaemon(profile, roots, root);
}
function providerTurnIsActive(provider) { return provider?.thread?.status?.type === "active"; }
// Desktop can leave a detached app-server subscription reporting `active`
// after the provider has interrupted its Turn.  `updatedAt` is persisted in
// epoch seconds; a stale active record is not evidence that the Turn is live.
function providerTurnIsLive(provider, activeTurn) {
  if (!providerTurnIsActive(provider)) return false;
  if (!activeTurn?.dispatched_at) return true;
  const updatedAt = Number(provider?.thread?.updatedAt ?? 0) * 1_000;
  return !updatedAt || Date.now() - updatedAt < 120_000;
}
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

async function failReferenceHitl(root, state, stage, error) {
  if (!error?.hitl) throw error;
  state.status = "failed"; state.failure = { code: error.code, message: error.message, stage, hitl: error.hitl, at: now() };
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.hitl.failed", data: state.failure });
  await stopReferenceDaemon(root, state);
  throw error;
}

export async function canonicalResume({ buildRoot, detachTurns = false }) {
  const root = path.resolve(buildRoot);
  return await canonicalResumeLock(root, async () => await canonicalResumeUnlocked({ buildRoot: root, detachTurns }));
}

async function canonicalResumeUnlocked({ buildRoot, detachTurns = false }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  // A pre-fix short-lived worker RPC can fail the controller while its
  // registered Work remains durable and resumable.  Re-enter only that narrow
  // state; all semantic or terminal failures stay fail-closed.
  if (state.status === "failed" && recoverableDriverCodes.has(state.failure?.code)) {
    const recoveredFailure = state.failure;
    state.status = "awaiting_reference_resume";
    state.failure = null;
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.fanout_recovery_authorized", data: { stage: state.current_stage, prior_failure: recoveredFailure } });
  }
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
    const fixture = await interactionFixture(loaded.root, stage, state.interaction_fixtures?.[stage]?.interaction_fixture_sha256); const record = stageRecord(lifecycle, stage); const questionPath = record?.pause?.question_path;
    if (fixture.mode === "forbidden" || !questionPath) return null;
    const question = await readFile(questionPath, "utf8");
    const answeredPause = state.reference.answered_pauses?.[record.pause.id];
    if (answeredPause) {
      if (!recovering) fail("the stage remained paused after its accepted HITL answer", "hitl_resume_not_applied");
      if (typeof answeredPause.answer_file !== "string" || !(await exists(answeredPause.answer_file))) fail("accepted HITL answer bytes are unavailable for recovery", "hitl_answer_missing");
      const prompt = await resumePrompt({ lifecycle, stage, question, answerFile: answeredPause.answer_file, runtimeRoot: roots.runtimeRoot, projectRoot: roots.projectRoot });
      await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.hitl.resume_retried", data: { stage, round: answeredPause.round, pause_id: record.pause.id, response_ids: answeredPause.response_ids, answer_file: answeredPause.answer_file, answer_sha256: answeredPause.answer_sha256 } });
      return prompt;
    }
    if (hitlRounds >= fixture.max_rounds) return null;
    const judged = lifecycle.judged_hitl ?? await interactionJudge({ runProfile, fixture, question, attempt: path.join(root, "reference"), stage, subjectProfile: profile, projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, contextFile });
    let exchange; try { exchange = resolveHitlJudgment({ fixture, judgment: judged, question, stage }); } catch (error) { return await failReferenceHitl(root, state, stage, error); } const answer = exchange.answer;
    const answered = new Set(state.reference.response_ids ?? []);
    hitlRounds += 1;
    const answerSha256 = sha256(answer);
    const answerFile = await materializeHitlAnswer({ attempt: path.join(root, "reference"), stage, round: hitlRounds, answer });
    state.reference = { ...state.reference, hitl_rounds: hitlRounds, pending_pause_id: record.pause.id, response_ids: [...new Set([...answered, ...exchange.response_ids])].sort(), answered_pauses: { ...(state.reference.answered_pauses ?? {}), [record.pause.id]: { round: hitlRounds, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: answerSha256, dispatched_at: now() } } };
    const prompt = await resumePrompt({ lifecycle, stage, question, answerFile, runtimeRoot: roots.runtimeRoot, projectRoot: roots.projectRoot });
    await writeFile(path.join(root, "reference", "launchers", `${stage}-resume-${hitlRounds}.md`), `${prompt}\n`);
    await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.hitl.matched", data: { stage, round: hitlRounds, pause_id: record.pause.id, response_ids: exchange.response_ids, judge_session_id: judged.session_id, receipt_file: judged.receipt_file, answer_file: answerFile, answer_sha256: answerSha256 } });
    return prompt;
  };
  if (recovering) {
    try { lifecycle = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: state.reference.run_id ?? entry.snapshot.run_id }); }
    catch (error) {
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      const active = providerTurnIsLive(provider, state.reference.active_turn);
      if (active) return { build: root, state, next: { kind: "wait_reference_turn", stage, session_id: sessionId } };
      throw Object.assign(new Error("reference Session is idle without a reconcilable lifecycle; refusing to repeat its launcher"), { code: "reference_turn_unreconciled", cause: error });
    }
    state.reference = { ...state.reference, run_id: lifecycle.run_id };
    // A controller can restart after the provider has returned a material
    // question but before this process persisted the corresponding pause.  Use
    // the same semantic Judge path as a live turn; never replay the launcher
    // merely because that short bookkeeping window was interrupted.
    try { lifecycle = await registerJudgedTerminalQuestion({ root, revision: state.revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile, interactionFixtureSha256: state.interaction_fixtures?.[stage]?.interaction_fixture_sha256 }); } catch (error) { return await failReferenceHitl(root, state, stage, error); }
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
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      if (providerTurnIsLive(provider, state.reference.active_turn)) return { build: root, state, lifecycle, next: { kind: "wait_reference_turn", stage, session_id: sessionId, turn_id: state.reference.active_turn?.turn_id ?? null } };
      const fanout = await driveReferenceFanout();
      if (fanout?.state === "awaiting_native_children") turnPrompt = nativeChildWaitPrompt({ stage });
      else if (fanout?.continuation) turnPrompt = fanout.continuation;
      else {
        // This resume owns the per-build lock, so no prompt command can still
        // be healthy here. A stale provider `active` projection must not
        // suppress recovery of the recorded Stage.
        if (!state.reference.active_turn) throw Object.assign(new Error(`reference Session is idle with non-terminal ${stage} lifecycle and no fan-out continuation`), { code: "reference_turn_unreconciled" });
        turnPrompt = interruptedStageContinuation(stage);
      }
    }
    else if (!lifecycle.stage_status && isAcceptedSuccessor && !state.reference.active_turn) turnPrompt = launcher;
    else {
      const provider = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      // See the running-stage recovery above: a resumed owner continues the
      // recorded Stage instead of trusting a stale bridge status.
      throw Object.assign(new Error(`reference Session is idle with non-terminal ${stage} lifecycle; refusing to repeat its launcher`), { code: "reference_turn_unreconciled" });
    }
    if (turnPrompt) daemon = await restartIdleReferenceDaemon({ profile, daemon, roots, root, sessionId });
  }
  while (turnPrompt) {
    const promptSha256 = sha256(turnPrompt);
    const priorDispatch = state.reference.last_dispatch;
    if (priorDispatch?.stage === stage && priorDispatch?.prompt_sha256 === promptSha256 && priorDispatch?.stage_status === lifecycle?.stage_status) {
      state.status = "failed";
      state.failure = { code: "reference_nonprogress_cycle", message: `refusing to dispatch the unchanged ${stage} continuation twice`, stage, prompt_sha256: promptSha256, at: now() };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.nonprogress", data: state.failure });
      fail(state.failure.message, state.failure.code);
    }
    state.reference = { ...state.reference, active_turn: { stage, prompt_sha256: promptSha256, dispatched_at: now() }, last_dispatch: { stage, prompt_sha256: promptSha256, stage_status: lifecycle?.stage_status ?? null, dispatched_at: now() } };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.turn_dispatched", data: { stage, session_id: sessionId, prompt_sha256: state.reference.active_turn.prompt_sha256 } });
    if (detachTurns) {
      const started = await callDriver(profile, ["session", "start", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", turnPrompt, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env });
      state.reference = { ...state.reference, active_turn: { ...state.reference.active_turn, turn_id: started.turn_id } };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.turn_started", data: { stage, session_id: sessionId, turn_id: started.turn_id } });
      return { build: root, state, next: { kind: "wait_reference_turn", stage, session_id: sessionId, turn_id: started.turn_id } };
    }
    prompted = await callDriver(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", sessionId, "--cwd", roots.projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", turnPrompt, "--journal", daemon.journal], { cwd: roots.projectRoot, env: daemon.env, onProgress: () => appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.progress", data: { state: "reference_running", stage } }) });
    state.reference = { ...state.reference, active_turn: null, last_turn: prompted, hitl_rounds: hitlRounds };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.turn_terminal", data: { stage, session_id: sessionId } });
    lifecycle = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: state.reference.run_id ?? entry.snapshot.run_id });
    state.reference = { ...state.reference, run_id: lifecycle.run_id };
    if (lifecycle.stage_status !== "paused") state.reference = { ...state.reference, pending_pause_id: null };
    try { lifecycle = await registerJudgedTerminalQuestion({ root, revision: state.revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile, interactionFixtureSha256: state.interaction_fixtures?.[stage]?.interaction_fixture_sha256 }); } catch (error) { return await failReferenceHitl(root, state, stage, error); }
    if (lifecycle.stage_status === "paused") turnPrompt = await prepareHitlResume();
    else if (lifecycle.stage_status === "running") {
      const fanout = await driveReferenceFanout();
      turnPrompt = fanout?.state === "awaiting_native_children" ? nativeChildWaitPrompt({ stage }) : fanout?.continuation ?? interruptedStageContinuation(stage);
    } else turnPrompt = null;
  }
  state.reference = { ...state.reference, run_id: lifecycle.run_id, last_turn: prompted };
  if (lifecycle.stage_status === "done") {
    const fixture = await interactionFixture(loaded.root, stage, state.interaction_fixtures?.[stage]?.interaction_fixture_sha256);
    if (fixture.mode === "required" && hitlRounds === 0) fail(`required HITL did not occur at ${stage}`, "required_hitl_missing");
    state.status = "waiting_for_reference_review";
    state.completed_stage = stage;
    state.context_receipt = { semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256 };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.stage_done", data: { state: state.status, stage, run_id: lifecycle.run_id } });
    return { build: root, state, lifecycle, next: { kind: "reference_review", message: `Review ${stage}, then run canonical boundary accept.` } };
  }
  state.status = lifecycle.stage_status === "paused" ? "waiting_for_reference_hitl" : "failed";
  state.failure = lifecycle.stage_status === "paused" ? null : { code: "incomplete_subject_turn", message: `reference Subject did not finish ${stage} (${lifecycle.stage_status ?? "stage missing"})`, stage, at: now() };
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.stage_incomplete", data: { state: state.status, stage, lifecycle } });
  fail(`reference Subject did not finish ${stage} (${lifecycle.stage_status ?? "stage missing"})`, lifecycle.stage_status === "paused" ? "registered_hitl_requires_interaction_judge" : "incomplete_subject_turn");
}

export async function canonicalBoundaryAccept({ buildRoot, stage, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
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
  await assertCanonicalDefinition(state);
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
  await assertCanonicalDefinition(state);
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
  await assertCanonicalDefinition(state);
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
  await prepareRuntimeHarnessConfig(runtimeRoot);
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
  await prepareRuntimeHarnessConfig(runtimeRoot);
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

/** Copy only portable harness configuration into an isolated flow home.
 * Runtime state (database, locks, runs, engines and logs) is never shared. */
async function prepareRuntimeHarnessConfig(runtimeRoot) {
  const sourceHome = process.env.DD_FLOW_CONFIG_HOME ?? process.env.DD_FLOW_HOME ?? path.join(process.env.HOME ?? ".", ".dd-flow");
  const sourceConfig = path.join(sourceHome, "harnesses.json");
  if (!await exists(sourceConfig)) fail(`Harness configuration is missing: ${sourceConfig}`, "harness_config_missing");
  const config = await readJson(sourceConfig);
  if (config?.schema_id !== "dd-flow/harness-config@1" || !isObject(config.harnesses)) fail(`Harness configuration is invalid: ${sourceConfig}`, "harness_config_invalid");
  await mkdir(runtimeRoot, { recursive: true });
  const targetConfig = path.join(runtimeRoot, "harnesses.json");
  await cp(sourceConfig, targetConfig, { force: true }); await chmod(targetConfig, 0o600);
  const sourceProfiles = path.join(sourceHome, "agent-profiles"); const targetProfiles = path.join(runtimeRoot, "agent-profiles");
  if (await exists(sourceProfiles)) await cp(sourceProfiles, targetProfiles, { recursive: true, force: true });
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
function assertCheckpointEngine(inputCheckpoint, engine) {
  const expected = inputCheckpoint?.value?.flow_pack?.engine?.version;
  if (!expected) return;
  if (engine?.package_version !== expected || engine?.engine_version !== expected) {
    fail(`runtime engine ${engine?.package_version ?? "unresolved"} does not match input checkpoint ${expected}`, "input_checkpoint_engine_mismatch");
  }
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
export function assertObservedRuntime(receipt, profile, label) {
  if (!profile.runtime) return receipt;
  const observed = receipt?.observed_runtime;
  if (!isObject(observed)) fail(`${label} did not report observed_runtime`, "harness_runtime_unobservable");
  const mismatches = Object.entries(profile.runtime).filter(([key, expected]) => observed[key] !== expected);
  if (mismatches.length) {
    const error = new Error(`${label} runtime differs from profile: ${mismatches.map(([key, expected]) => `${key}=${observed[key] ?? "missing"} (expected ${expected})`).join(", ")}`);
    error.code = "harness_runtime_mismatch";
    error.details = { profile_id: profile.id, expected: profile.runtime, observed, next_command: `dd-eval harness compatibility qualify --profile ${profile.id}` };
    throw error;
  }
  return receipt;
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
export async function driverRuntimeArgs(args, { cwd, env = {}, profile = null } = {}) {
  const daemonStart = args[0] === "daemon" && args[1] === "start";
  const doctor = args[0] === "doctor";
  if (!daemonStart && !doctor) return args;
  const resolved = [...args];
  const launchEnv = { ...process.env, ...env };
  if (daemonStart && typeof env.DD_FLOW_HOME === "string" && path.isAbsolute(env.DD_FLOW_HOME)) {
    if (!resolved.includes("--dd-flow-bin")) resolved.push("--dd-flow-bin", await absoluteExecutable(env.DD_FLOW_BIN ?? process.env.DD_FLOW_BIN ?? "dd-flow", cwd, launchEnv));
    if (!resolved.includes("--dd-flow-home")) resolved.push("--dd-flow-home", env.DD_FLOW_HOME);
    if (!resolved.includes("--project-root")) resolved.push("--project-root", cwd);
  }
  // Daemons survive their launcher. Resolve their exact native executable
  // from the copied harness configuration while the runner owns the setup.
  if (profile?.harness && typeof env.DD_FLOW_HOME === "string" && path.isAbsolute(env.DD_FLOW_HOME)) {
    const config = await readJson(path.join(env.DD_FLOW_HOME, "harnesses.json"));
    const key = harnessConfigKey(profile.harness); const entry = config?.harnesses?.[key];
    if (!entry || typeof entry.runtime_command !== "string") fail(`Harness ${key} is not configured`, "harness_config_missing");
    const option = harnessRuntimeOption(profile.harness);
    if (!resolved.includes(option)) resolved.push(option, await absoluteExecutable(entry.runtime_command, cwd, launchEnv));
  }
  return resolved;
}
function harnessConfigKey(harness) { return ({ "codex-desktop": "codex-desktop", "zcode-acp": "zcode-acp", "grok-acp": "grok-acp", "antigravity-cli": "antigravity-cli", "opencode-server": "opencode-server" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }
function harnessRuntimeOption(harness) { return ({ "codex-desktop": "--codex-bin", "zcode-acp": "--zcode-acp-bin", "grok-acp": "--grok-bin", "antigravity-cli": "--agy-bin", "opencode-server": "--opencode-bin" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }
export async function driverAdapterInvocation(profile, { cwd, env = {} } = {}) {
  if (typeof env.DD_FLOW_HOME === "string" && path.isAbsolute(env.DD_FLOW_HOME)) {
    const config = await readJson(path.join(env.DD_FLOW_HOME, "harnesses.json"));
    const key = harnessConfigKey(profile.harness); const entry = config?.harnesses?.[key];
    if (!entry || typeof entry.adapter_command !== "string") fail(`Harness ${key} is not configured`, "harness_config_missing");
    return { executable: await absoluteExecutable(entry.adapter_command, cwd, { ...process.env, ...env }), prefix: [] };
  }
  return { executable: process.execPath, prefix: [path.join(repoRoot, "bin", driverFor(profile))] };
}
async function callDriver(profile, args, options) {
  const { spawn } = await import("node:child_process"); const adapter = await driverAdapterInvocation(profile, options);
  const command = driverProfileArgs(profile, await driverRuntimeArgs(args, { ...options, profile }));
  return await new Promise((resolve, reject) => {
    const child = spawn(adapter.executable, [...adapter.prefix, ...command, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", (error) => { if (progress) clearInterval(progress); reject(error); });
    child.on("close", (code, signal) => {
      if (progress) clearInterval(progress);
      if (code !== 0) {
        let failure = null;
        try { failure = JSON.parse(stderr.trim() || stdout.trim()); } catch { /* Preserve opaque third-party failures. */ }
        const message = failure?.error || stderr.trim() || stdout.trim() || `driver exited${signal ? ` by ${signal}` : ` ${code}`}`;
        return reject(Object.assign(new Error(message), { code: failure?.code ?? "driver_failed", ...(failure?.details ? { details: failure.details } : {}) }));
      }
      try {
        const receipt = JSON.parse(stdout.trim());
        if (args[0] === "doctor" && options.validateRuntime !== false) assertObservedRuntime(receipt, profile, "harness doctor");
        resolve(receipt);
      } catch (error) { reject(error.code ? error : new Error(`driver returned invalid JSON: ${error.message}`)); }
    });
  });
}

/** Qualify one changed harness profile by observing it and exercising its native child path once. */
export async function harnessCompatibilityQualify({ profileId, projectRoot = process.cwd() }) {
  const loaded = await loadProfile(profileId); const profile = loaded.value; const project = path.resolve(projectRoot);
  const original = await readFile(loaded.file); const beforeSha256 = sha256(original);
  const observedReceipt = await callDriver(profile, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], { cwd: project, validateRuntime: false });
  const observed = observedReceipt?.observed_runtime;
  if (!isObject(observed)) fail("harness doctor did not report observed_runtime", "harness_runtime_unobservable");
  if (JSON.stringify(profile.runtime ?? null) === JSON.stringify(observed)) return { profile_id: profile.id, status: "already_qualified", observed_runtime: observed };
  // Reuse the native-child conformance path. It is a small real smoke, not a
  // second launcher protocol with subtly different lifecycle semantics.
  const smoke = await harnessCapacityCheck({ profileId, maximum: 1, projectRoot: project, writeProfile: false });
  if (!smoke.qualified) {
    const error = new Error("harness compatibility smoke did not qualify the changed runtime");
    error.code = "harness_compatibility_smoke_failed";
    error.details = { profile_id: profile.id, observed_runtime: observed, smoke_receipt: smoke.receipt_file, failure: smoke.failure ?? null };
    throw error;
  }
  const afterReceipt = await callDriver({ ...profile, runtime: null }, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], { cwd: project, validateRuntime: false });
  if (JSON.stringify(afterReceipt?.observed_runtime ?? null) !== JSON.stringify(observed)) fail("harness runtime changed during qualification", "harness_runtime_changed");
  const current = await readFile(loaded.file);
  if (sha256(current) !== beforeSha256) fail("harness profile changed during qualification; inspect and retry", "harness_profile_changed");
  const next = { ...profile, runtime: observed };
  delete next.subagent_capacity;
  await writeJsonAtomic(loaded.file, next);
  const receiptRoot = path.join(evalHome(), "conformance", "harness-compatibility", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  await mkdir(receiptRoot, { recursive: true });
  await writeJsonAtomic(path.join(receiptRoot, "receipt.json"), { schema_id: "dd-eval/harness-compatibility@1", profile_id: profile.id, previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke, qualified_at: now() });
  return { profile_id: profile.id, status: "qualified", previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke_receipt: path.join(receiptRoot, "receipt.json") };
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
async function registerJudgedTerminalQuestion({ root, revision, loaded, blueprint, runProfile, profile, stage, prompted, lifecycle, roots, contextFile, interactionFixtureSha256 }) {
  if (lifecycle.stage_status !== "running" || typeof prompted?.assistant_text !== "string" || !prompted.assistant_text.trim()) return lifecycle;
  const fixture = await interactionFixture(loaded.root, stage, interactionFixtureSha256);
  // A declared optional question is still a legitimate HITL boundary. The
  // Judge must match it before registration; only an undeclared question is
  // forbidden. "required" merely adds the later obligation that it occurred.
  if (fixture.mode === "forbidden") return lifecycle;
  const judgment = await interactionJudge({ runProfile, fixture, question: prompted.assistant_text, attempt: path.join(root, "reference"), stage, subjectProfile: profile, projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, contextFile });
  resolveHitlJudgment({ fixture, judgment, question: prompted.assistant_text, stage });
  const index = lifecycle.status?.index ?? lifecycle.status?.run?.index;
  const workId = index?.root_work_id;
  if (typeof workId !== "string" || !workId) fail("running stage has no root Work for a judged HITL pause", "flow_reconciliation_failed");
  await commandJson("dd-flow", ["stage", "pause", lifecycle.run_id, "--stage", stage, "--work", workId, "--question-stdin", "--project-root", roots.projectRoot], { cwd: roots.projectRoot, env: runtimeEnv(roots.runtimeRoot), input: prompted.assistant_text });
  await appendEvent(path.join(root, "build", "events.jsonl"), { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.reference.hitl.registered_from_judged_turn", data: { stage, work_id: workId, judge_session_id: judgment.session_id } });
  const reconciled = await reconcileFlow({ projectRoot: roots.projectRoot, runtimeRoot: roots.runtimeRoot, expectedStage: stage, runId: lifecycle.run_id });
  return { ...reconciled, judged_hitl: { verdict: judgment.verdict, session_id: judgment.session_id, profile: judgment.profile, receipt_file: judgment.receipt_file } };
}
export function restoredRoots(lifecycle, projectRoot, runtimeRoot) {
  const run = lifecycle.status?.run ?? lifecycle.status?.index?.run;
  if (!run?.workspace_root || !run?.run_root) fail("flow status does not expose registered workspace roots", "flow_reconciliation_failed");
  return { project: projectRoot, workspace: run.workspace_root, run: run.run_root, runtime: runtimeRoot };
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
  const directory = path.join(runtimeRoot, "agent-profiles");
  await mkdir(directory, { recursive: true });
  await writeJsonAtomic(path.join(directory, `${id}.json`), {
    schema_id: "dd-flow/agent-profile@1", id, harness,
    provider: profile.provider ?? profile.harness, model: profile.model,
    reasoning: profile.reasoning, mode: profile.mode ?? "agent", permission: "allow"
  });
  return { id, env: {} };
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
async function captureExecutionCandidate({ projectRoot, runtimeRoot, runId, attempt, stage }) {
  const candidate = await captureCandidate({ projectRoot, runtimeRoot, runId, attempt, stage });
  const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId });
  await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
  return { candidate, statistics };
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
export function storedExecutionResults(events, manifest) {
  return manifest.executions.map((execution) => {
    // A reconciliation is a distinct, read-only operation. It may supersede
    // a late runner failure only after the durable flow has reached its
    // terminal Stage; it never replays the original provider operation.
    const reconciled = resultForOperation(events, `${manifest.run_id}:${execution.id}:launch:reconcile`);
    if (reconciled) return reconciled;
    const launched = resultForOperation(events, `${manifest.run_id}:${execution.id}:launch`);
    if (launched) return launched;
    const cancelled = events.some((event) => event.executionid === execution.id && event.type === "dev.dd.eval.execution.cancelled");
    return cancelled ? { execution: execution.id, stage: execution.stage, state: "cancelled" } : { execution: execution.id, state: "awaiting_provider" };
  });
}
async function finalizeRunProjection({ root, manifest, loaded, results, permits = null }) {
  const eventsFile = path.join(root, "events.jsonl");
  const completed = results.every((result) => result.state === "candidate_ready");
  const pending = results.some((result) => result.state === "awaiting_provider" || result.state === "awaiting_native_children");
  const state = completed ? "completed" : pending ? "awaiting_provider" : results.some((result) => result.state === "failed") ? "completed_with_failures" : results.some((result) => result.state === "cancelled") ? "cancelled" : "awaiting_provider";
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
  if (state !== "awaiting_provider") await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed", data: { state, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  const judgeStatus = judge ? "completed" : !manifest.profile?.judge?.enabled ? "not_requested" : completed ? "not_run" : "not_run_incomplete_execution";
  const projection = reduceEvents(await readEvents(eventsFile)); const report = buildReport({ root, manifest, state, results, candidate, judge, judgeStatus });
  await mkdir(path.join(root, "reports"), { recursive: true });
  await writeJsonAtomic(path.join(root, "reports", "report.json"), report);
  await writeFile(path.join(root, "reports", "report.md"), `# Eval ${manifest.run_id}\n\n- State: ${state}\n- Run validity: ${report.run_validity}\n- Executions: ${results.length}\n- Failed: ${results.filter((result) => result.state === "failed").length}\n- Cancelled: ${results.filter((result) => result.state === "cancelled").length}\n${judge ? `- Final Judge: ${judge.profile_id}\n` : `- Final Judge: ${judgeStatus}\n`}`);
  await writeJsonAtomic(path.join(root, "state.json"), projection);
  return { state, candidate, judge, report };
}
export function entryLauncher({ stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile }) {
  // A Codex/ACP shell action does not inherit variables from an earlier action.
  // Give the engine its own immutable launcher identity on the very first
  // lifecycle call; generated later commands then retain that exact launcher.
  const prefix = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} DD_FLOW_BIN=${JSON.stringify(runtimeBin(runtimeRoot))} ${JSON.stringify(runtimeBin(runtimeRoot))} stage start`;
  const responseFile = path.join(path.dirname(contextFile), "stage-start-response.json");
  const shared = `--stage ${stage} --project-root ${JSON.stringify(projectRoot)} --context-file ${JSON.stringify(contextFile)} --context-sha256 ${contextSha256} --require-session-binding --response-file ${JSON.stringify(responseFile)} --json`;
  const command = entry.snapshot.run_id === null ? `${prefix} --bootstrap --subject eval-subject ${shared}` : `${prefix} ${entry.snapshot.run_id} ${shared}`;
  return [
    `Execute exactly one ${stage} Stage for this evaluation attempt.`,
    "Your first technical action must be this exact standalone lifecycle command:",
    `\`${command}\``,
    `The complete authoritative response is saved at ${JSON.stringify(responseFile)}. Read that file after the command; do not rerun \`stage start\` if the tool display truncates its output. Perform only this Stage. If the saved response has an \`orchestration\` object with kind \`work_fanout\`, stop immediately after reading it: the runner will either dispatch its declared child Work or return this same coordinator Session once to materialize an agent-owned graph, then continue it when Work settles. If it needs a material user answer, run the exact \`stage pause\` lifecycle command from that prompt before showing the question, then stop the Turn. Otherwise finish this Stage, then stop the Turn.`,
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

async function hitlEvidenceFor(events, executionId) {
  const matched = events.filter((event) => event.executionid === executionId && event.type === "dev.dd.eval.hitl.matched");
  return await Promise.all(matched.map(async ({ data }) => {
    const receipt = await readJson(data.receipt_file); const packet = await readJson(path.join(path.dirname(data.receipt_file), "packet.json")); const answer = await readFile(data.answer_file, "utf8");
    return { stage: data.stage, round: data.round, pause_id: data.pause_id, question: packet.question, interaction_fixture_sha256: receipt.interaction_fixture_sha256, judge_profile: receipt.profile_id, judge_session_id: receipt.session_id, receipt_file: data.receipt_file, verdict: receipt.verdict, response_ids: data.response_ids, delimiter: "dd-eval/hitl-response-delimiter@1", answer, answer_file: data.answer_file, answer_sha256: data.answer_sha256 };
  }));
}

function executionEvidence(result) {
  const started = typeof result.started_at === "string" ? Date.parse(result.started_at) : Number.NaN;
  const finished = typeof result.finished_at === "string" ? Date.parse(result.finished_at) : Number.NaN;
  return {
    execution: result.execution,
    state: result.state,
    failure: result.state === "failed" ? { code: result.code ?? "execution_failed", message: result.error ?? null, attribution: isInfrastructureFailure(result.code) ? "evaluation_infrastructure" : "subject" } : null,
    stage: result.stage ?? null,
    run_id: result.run_id ?? null,
    subject_session_id: result.session_id ?? null,
    stage_boundaries: result.boundaries ?? [],
    lifecycle: result.lifecycle ?? null,
    candidate: result.candidate ?? null,
    usage: result.statistics?.usage ?? null,
    sessions: result.statistics?.sessions ?? null,
    tool_evidence: result.driver?.evidence?.tool_calls ?? null,
    hitl: result.hitl ?? [],
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

function buildReport({ root, manifest, state, results, candidate = null, judge = null, judgeStatus = "not_requested" }) {
  const executions = results.map(executionEvidence);
  const runValidity = results.some((result) => result.state === "failed" && isInfrastructureFailure(result.code)) ? "invalid_infrastructure_flow" : "valid";
  return {
    schema_id: "dd-eval/report@2", run_id: manifest.run_id, state, run_validity: runValidity,
    manifest: path.join(root, "manifest.json"),
    executions,
    observability: {
      sessions: executions.map(({ execution, subject_session_id, sessions }) => ({ execution, subject_session_id, reported_sessions: sessions })),
      usage: executions.map(({ execution, usage }) => ({ execution, usage })),
      tools: executions.map(({ execution, tool_evidence }) => ({ execution, tool_evidence })),
      timing: executions.map(({ execution, timing }) => ({ execution, ...timing })),
      context_diagnostics: executions.map(({ execution, context_diagnostics }) => ({ execution, ...context_diagnostics }))
    },
    judge_status: judgeStatus, ...(candidate ? { candidate } : {}), ...(judge ? { judge } : {})
  };
}
async function interactionFixture(caseRoot, stage, expectedSha256 = null) {
  const file = path.join(caseRoot, "entry-pack-source", "interactions", `${stage}.json`);
  const value = (await exists(file)) ? await readJson(file) : { schema_id: "dd-eval/canonical-responses@1", stage, mode: "forbidden", max_rounds: 0, responses: [] };
  if (!isObject(value) || Object.keys(value).some((key) => !["schema_id", "stage", "mode", "max_rounds", "responses"].includes(key)) || value.schema_id !== "dd-eval/canonical-responses@1" || value.stage !== stage || !Array.isArray(value.responses)) fail(`invalid interaction fixture for ${stage}`, "interaction_fixture_invalid");
  const responses = value.responses.map((response) => {
    if (!isObject(response) || Object.keys(response).some((key) => !["id", "topic", "applicability", "answer"].includes(key)) || !response.id || !response.topic || !response.applicability || !response.answer || [response.id, response.topic, response.applicability, response.answer].some((item) => typeof item !== "string")) fail(`invalid interaction response for ${stage}`, "interaction_fixture_invalid");
    return response;
  });
  const mode = value.mode ?? "optional"; const maxRounds = value.max_rounds ?? 1;
  if (new Set(responses.map(({ id }) => id)).size !== responses.length || !["forbidden", "optional", "required"].includes(mode) || !Number.isInteger(maxRounds) || maxRounds < 0 || (mode === "forbidden" ? maxRounds !== 0 || responses.length !== 0 : maxRounds < 1 || responses.length === 0)) fail(`invalid interaction policy for ${stage}`, "interaction_fixture_invalid");
  const fixtureSha256 = hashJson(value);
  if (expectedSha256 && fixtureSha256 !== expectedSha256) fail(`interaction fixture changed after the run was planned: ${stage}`, "interaction_fixture_checksum_mismatch");
  return { mode, max_rounds: maxRounds, responses, file: (await exists(file)) ? file : null, sha256: fixtureSha256 };
}

async function interactionFixtureManifest(caseRoot, executions) {
  const selected = new Set();
  for (const execution of executions) {
    const from = stages.indexOf(execution.stage); const to = stages.indexOf(execution.terminal_stage);
    for (let index = from; index <= to; index += 1) selected.add(stages[index]);
  }
  return Object.fromEntries(await Promise.all([...selected].map(async (stage) => {
    const fixture = await interactionFixture(caseRoot, stage);
    return [stage, { interaction_fixture_sha256: fixture.sha256 }];
  })));
}

function fixtureHash(manifest, stage) {
  const value = manifest?.interaction_fixtures?.[stage]?.interaction_fixture_sha256;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`run manifest does not pin the interaction fixture for ${stage}`, "interaction_fixture_invalid");
  return value;
}
function parseJsonResponse(text, label) {
  const source = typeof text === "string" ? text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : "";
  try { return JSON.parse(source); } catch { fail(`${label} did not return one JSON object`, "judge_result_invalid"); }
}
export function validateJudgeResult(value, assessment) {
  const invalid = (message = "Final Judge returned an invalid contract") => fail(message, "judge_result_invalid");
  const exactKeys = (item, keys) => isObject(item) && Object.keys(item).every((key) => keys.includes(key)) && keys.every((key) => key in item);
  if (!exactKeys(value, ["schema_id", "scope", "run_validity", "outcome", "flow", "findings", "golden", "conclusion"]) || value.schema_id !== "dd-eval/judge-result@2" || !/^[a-z][a-z0-9-]*$/.test(value.scope) || !["valid", "invalid_infrastructure_flow", "contaminated"].includes(value.run_validity) || !Array.isArray(value.outcome) || !Array.isArray(value.flow) || !Array.isArray(value.findings) || typeof value.conclusion !== "string" || value.conclusion.length === 0) invalid();
  const scope = assessment?.scopes?.[value.scope];
  if (!isObject(scope) || !Array.isArray(scope.outcome) || !Array.isArray(scope.flow)) invalid(`Final Judge returned an unknown assessment scope: ${value.scope}`);
  for (const [group, expected] of [["outcome", scope.outcome], ["flow", scope.flow]]) {
    const actual = value[group]; const actualIds = actual.map((criterion) => criterion?.id); const expectedIds = expected.map((criterion) => criterion.id);
    if (new Set(actualIds).size !== actualIds.length || actualIds.length !== expectedIds.length || expectedIds.some((id) => !actualIds.includes(id))) invalid(`Final Judge did not cover the exact ${group} rubric for ${value.scope}`);
    for (const criterion of actual) {
      if (!exactKeys(criterion, ["id", "score", "not_applicable", "rationale", "evidence"]) || typeof criterion.id !== "string" || typeof criterion.not_applicable !== "boolean" || typeof criterion.rationale !== "string" || criterion.rationale.length === 0 || !Array.isArray(criterion.evidence)) invalid("Final Judge returned an invalid criterion");
      if (criterion.not_applicable ? criterion.score !== null : !Number.isInteger(criterion.score) || criterion.score < 0 || criterion.score > 4 || criterion.evidence.length === 0) invalid(`Final Judge returned an incomplete applicable criterion: ${criterion.id}`);
    }
  }
  if (!exactKeys(value.golden, ["covered", "missed", "alternatives", "novel"]) || Object.values(value.golden).some((items) => !Array.isArray(items))) invalid("Final Judge returned an invalid golden assessment");
  for (const finding of value.findings) if (!exactKeys(finding, ["id", "severity", "summary", "evidence", "impact"]) || !/^[a-z][a-z0-9-]*$/.test(finding.id ?? "") || !["blocking", "material", "minor", "cosmetic"].includes(finding.severity) || typeof finding.summary !== "string" || finding.summary.length === 0 || !Array.isArray(finding.evidence) || typeof finding.impact !== "string" || finding.impact.length === 0) invalid("Final Judge returned an invalid finding");
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
export function finalJudgePrompt({ assessmentFile, candidateFile, evidenceFile }) {
  return `You are the final SDLC eval Judge. Read ${JSON.stringify(assessmentFile)}, ${JSON.stringify(candidateFile)} and ${JSON.stringify(evidenceFile)}. Use only those packets and artifact paths explicitly referenced by them. Do not search or read another eval, RUN, project, workspace, or host path; a source id or description inside a packet is not permission to derive an unlisted filesystem path. Evaluate outcome quality first, then flow reliability; treat efficiency as evidence only. Do not reward cosmetic bureaucracy or unnecessary complexity. Reply with exactly one JSON object that conforms to dd-eval/judge-result@2, including a brief evidence-backed conclusion.`;
}
async function finalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null }) {
  if (typeof profileId !== "string") fail("judge.profile_id is required when judgment is enabled", "judge_profile_missing");
  const profile = (await loadProfile(profileId)).value; const judgeRoot = path.join(root, "judge"); await mkdir(judgeRoot, { recursive: true });
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  if (candidate.schema_id !== "dd-eval/run-candidate@1" || candidate.run_id !== runId || typeof candidate.immutable_hash !== "string") fail("Final Judge requires a frozen run candidate", "candidate_checkpoint_missing");
  const candidateFile = path.join(judgeRoot, "candidate.json"); const assessmentFile = path.join(judgeRoot, "assessment.json"); const evidenceFile = path.join(judgeRoot, "evidence.json");
  const evidence = results ? buildEvidencePacket({ manifest, results, candidate }) : await readJson(path.join(root, "reports", "report.json"));
  await writeJsonAtomic(candidateFile, candidate); await writeJsonAtomic(assessmentFile, loaded.assessment); await writeJsonAtomic(evidenceFile, evidence);
  const prompt = finalJudgePrompt({ assessmentFile, candidateFile, evidenceFile });
  const journal = path.join(judgeRoot, "events.jsonl"); const daemonState = path.join(judgeRoot, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(judgeRoot, "codex-home"); const judgeEnv = profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {};
  if (profile.harness === "codex-desktop") { const roots = await judgeHarnessRoots(root, results); await initializeCodexHome({ ...roots, codexHome }); }
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", judgeRoot, "--journal", journal], { cwd: judgeRoot, env: judgeEnv });
  try {
    const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Final Judge did not create a Session", "driver_protocol");
    const response = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits);
    const result = validateJudgeResult(parseJsonResponse(response.assistant_text, "Final Judge"), loaded.assessment); const receipt = { schema_id: "dd-eval/final-judge-receipt@1", profile_id: profile.id, session_id: sessionId, candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result, created_at: now() };
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
  const packet = { schema_id: "dd-eval/interaction-judge-packet@1", stage, subject_context: subjectContext, question, responses: fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer })), required_result: { schema_id: "dd-eval/hitl-match@1", status: "matched|unmatched", classification: "covered_by_canonical_response|fixture_gap|unnecessary_question|out_of_scope|ambiguous", response_ids: [], covered_questions: [], uncovered_questions: [], rationale: "brief evidence-based explanation" } };
  const packetFile = path.join(root, "packet.json"); await writeJsonAtomic(packetFile, packet);
  const prompt = `You are the Interaction Judge. Read ${JSON.stringify(packetFile)}. Decompose the Subject's text into its atomic material decisions; explanations, options and recommendations are context, not separate questions. Match semantic meaning regardless of wording, order or grouping. Select only existing response IDs whose exact answer explicitly states or logically entails every material decision requested. Descriptors help identify applicability but never add answer content. Never author, paraphrase or strengthen a response. If anything is uncovered, return unmatched and classify the likely cause. Reply with exactly one JSON object conforming to the required dd-eval/hitl-match@1 shape in the packet.`;
  const journal = path.join(root, "events.jsonl"); const daemonState = path.join(root, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(root, "codex-home"); const judgeEnv = profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {};
  if (profile.harness === "codex-desktop") await initializeCodexHome({ projectRoot, runtimeRoot, codexHome });
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", root, "--journal", journal], { cwd: root, env: judgeEnv });
  try {
    const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", root, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: root, env: judgeEnv }, permits); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Interaction Judge did not create a Session", "driver_protocol");
    const result = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", root, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: root, env: judgeEnv }, permits);
    const verdict = validateHitlMatch(parseJsonResponse(result.assistant_text, "Interaction Judge"), fixture);
    const receipt = { schema_id: "dd-eval/interaction-judge-receipt@1", profile_id: profile.id, session_id: sessionId, stage, interaction_fixture_sha256: fixture.sha256, packet_sha256: hashJson(packet), verdict, created_at: now() };
    const receiptFile = path.join(root, "result.json"); await writeJsonAtomic(receiptFile, receipt);
    return { profile: profile.id, session_id: sessionId, packet_file: packetFile, receipt_file: receiptFile, verdict, raw: result };
  } finally {
    await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: root, env: judgeEnv });
  }
}

export function validateHitlMatch(verdict, fixture) {
  const classifications = new Set(["covered_by_canonical_response", "fixture_gap", "unnecessary_question", "out_of_scope", "ambiguous"]);
  if (!isObject(verdict) || Object.keys(verdict).some((key) => !["schema_id", "status", "classification", "response_ids", "covered_questions", "uncovered_questions", "rationale"].includes(key)) || verdict.schema_id !== "dd-eval/hitl-match@1" || !["matched", "unmatched"].includes(verdict.status) || !classifications.has(verdict.classification) || !Array.isArray(verdict.response_ids) || !Array.isArray(verdict.covered_questions) || !Array.isArray(verdict.uncovered_questions) || typeof verdict.rationale !== "string" || !verdict.rationale) fail("Interaction Judge returned an invalid contract", "judge_result_invalid");
  if (verdict.response_ids.some((id) => typeof id !== "string" || !id) || new Set(verdict.response_ids).size !== verdict.response_ids.length || verdict.covered_questions.some((value) => typeof value !== "string" || !value) || verdict.uncovered_questions.some((value) => typeof value !== "string" || !value)) fail("Interaction Judge returned malformed arrays", "judge_result_invalid");
  const known = new Set(fixture.responses.map((response) => response.id)); if (verdict.response_ids.some((id) => !known.has(id))) fail("Interaction Judge selected an unknown response", "judge_result_invalid");
  const matched = verdict.status === "matched";
  if (matched !== (verdict.classification === "covered_by_canonical_response") || (matched && (verdict.response_ids.length === 0 || verdict.covered_questions.length === 0 || verdict.uncovered_questions.length > 0)) || (!matched && (verdict.response_ids.length > 0 || verdict.uncovered_questions.length === 0))) fail("Interaction Judge returned an inconsistent verdict", "judge_result_invalid");
  return verdict;
}

export function resolveHitlJudgment({ fixture, judgment, question, stage }) {
  const exchange = { stage, question, interaction_fixture_sha256: fixture.sha256, judge_profile: judgment.profile, judge_session_id: judgment.session_id, receipt_file: judgment.receipt_file, verdict: judgment.verdict };
  if (judgment.verdict.status !== "matched") {
    const code = judgment.verdict.classification === "fixture_gap" ? "interaction_fixture_gap" : judgment.verdict.classification === "ambiguous" ? "interaction_judge_ambiguous" : "unmatched_hitl";
    const error = new Error(`Interaction Judge could not match HITL at ${stage}: ${judgment.verdict.classification}`); error.code = code; error.hitl = exchange; throw error;
  }
  const responses = new Map(fixture.responses.map((response) => [response.id, response.answer]));
  return { ...exchange, response_ids: judgment.verdict.response_ids, delimiter: "dd-eval/hitl-response-delimiter@1", answer: judgment.verdict.response_ids.map((id) => responses.get(id)).join(hitlResponseDelimiter) };
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
  return ["driver_failed", "provider_rate_limited", "provider_quota_exhausted", "profile_drift", "hook_preflight_failed", "flow_reconciliation_failed", "snapshot_missing", "snapshot_checksum_mismatch", "snapshot_restore_mismatch", "driver_protocol", "subagent_capacity_unqualified", "interaction_fixture_invalid", "interaction_fixture_checksum_mismatch", "interaction_fixture_gap", "interaction_judge_ambiguous", "interaction_judge_missing", "judge_result_invalid", "subject_liveness_timeout"].includes(code);
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

export function boundedPromptArgs(profile, args) {
  return profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && !args.includes("--timeout")
    ? [...args, "--timeout", "600"]
    : args;
}

async function providerTurn(profile, args, options, permits = null) {
  const invoke = async () => {
    // AGY renews this timeout from native provider and child-hook activity.
    // Runner heartbeat alone can never keep an otherwise silent tree alive.
    const receipt = await callDriver(profile, boundedPromptArgs(profile, args), options);
    if (profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && receipt?.result?.status === "ERROR") {
      throw Object.assign(new Error(String(receipt.result.error ?? "Antigravity returned ERROR")), { code: "agy_provider_failed", details: { provider_result: receipt.result } });
    }
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
    "After the Work graph is registered, stop this Turn. The runner will ask this same coordinator Session to launch the ready Work through this harness's native child-agent mechanism."
  ].join("\n");
}

export function nativeChildFanoutPrompt({ stage, works, capacity }) {
  const assignments = works.map((work) => {
    const workId = String(work.work_id ?? "");
    const startCommand = String(work.start_command ?? "");
    if (!workId || !startCommand) fail("ready fan-out Work lacks its exact start command", "fanout_contract_invalid");
    return [
      `Work ${workId}:`,
      "Give one direct native child agent this exact instruction:",
      fanoutWorkerPrompt({ workId, startCommand })
    ].join("\n");
  });
  return [
    `Launch the next native-child wave for ${stage}.`,
    `The selected harness profile is qualified for ${capacity} simultaneous direct children; launch exactly these ${works.length} Work items now, and no other child agents.`,
    "Use this harness's native subagent/collaboration mechanism. Every child must be a direct child of this current Session; do not create a new root Session, fork, invoke an external runner, or ask a child to create descendants.",
    "Wait for every launched direct child to settle. A child failure is evidence for the coordinator, not a reason to cancel its siblings. Do not finish this Stage, repair it, or start a successor Stage in this Turn; return only after all launched children have settled.",
    "",
    ...assignments
  ].join("\n\n");
}

export function nativeChildWaitPrompt({ stage }) {
  return [
    `Native child Work for ${stage} is still running.`,
    "Do not create any Session, Work, or additional child agent. Wait for the existing direct children to settle, then return. Do not cancel siblings merely because one child failed and do not finish this Stage."
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

export function nativeCapacityPrompt(maximum) {
  return [
    "This is a technical native-subagent capacity qualification, not product work.",
    `Using this harness's native subagent mechanism, concurrently launch at most ${maximum} direct leaf children from this current Session.`,
    "Give each child a distinct number and the only task: return its number, with no project tools, files, dd-flow command, Work, Session, fork, or child agent.",
    "Do not create a new root Session or substitute any non-native mechanism. Do not retry, replace, or add children after a launch refusal. Wait for every child you did launch to settle, then return a compact summary."
  ].join("\n");
}

function childId(value) {
  for (const key of ["provider_session_id", "session_id", "sessionId", "childSessionId", "conversation_id", "conversationId", "id", "subagentId"]) {
    if (typeof value?.[key] === "string" && value[key]) return value[key];
  }
  return null;
}

function childParentId(value) {
  for (const key of ["parent_provider_session_id", "parent_session_id", "parentSessionId", "parentID", "parentId"]) {
    if (typeof value?.[key] === "string" && value[key]) return value[key];
  }
  return null;
}

function normalizedChildStatus(value, fallback = "unknown") {
  const raw = String(value?.status ?? value?.state ?? fallback).toLowerCase();
  if (["completed", "complete", "done", "idle", "success", "succeeded"].includes(raw)) return "completed";
  if (["failed", "error"].includes(raw)) return "failed";
  if (["cancelled", "canceled"].includes(raw)) return "cancelled";
  if (["running", "active", "pending"].includes(raw)) return "running";
  return fallback;
}

/** Normalize only provider-observed direct children.  Textual model claims are never input. */
export function directNativeChildren(receipt, rootSessionId) {
  const candidates = [];
  const add = (value, source, scopedParent = null, fallback = "unknown") => {
    const sessionId = childId(value); const parentSessionId = childParentId(value) ?? scopedParent;
    if (!sessionId || !parentSessionId || parentSessionId !== rootSessionId) return;
    candidates.push({ session_id: sessionId, parent_session_id: parentSessionId, status: normalizedChildStatus(value, fallback), source });
  };
  for (const value of receipt?.descendants ?? []) add(value, "adapter.descendants");
  for (const value of receipt?.children ?? []) add(value, "opencode.session.children");
  const zcode = receipt?.evidence?.subagents ?? receipt?.subagents;
  for (const value of zcode?.running ?? []) add(value, "zcode/session/subagents", rootSessionId, "running");
  for (const value of zcode?.completed ?? []) add(value, "zcode/session/subagents", rootSessionId, "completed");
  for (const value of zcode?.ended?.items ?? []) add(value, "zcode/session/subagents", rootSessionId, "completed");
  const unique = new Map();
  for (const child of candidates) {
    const previous = unique.get(child.session_id);
    if (!previous || previous.status === "unknown" || (previous.status === "running" && child.status !== "running")) unique.set(child.session_id, child);
  }
  return [...unique.values()].sort((left, right) => left.session_id.localeCompare(right.session_id));
}

async function stopCapacityDaemon({ profile, daemon, projectRoot }) {
  try { return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env }); }
  catch { return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs, "--cancel-tree"], { cwd: projectRoot, env: daemon.env }); }
}

async function provisionCapacityCodexHome(codexHome) {
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const sourceHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? ".", ".codex");
  const sourceAuth = path.join(sourceHome, "auth.json");
  if (await exists(sourceAuth)) await symlink(sourceAuth, path.join(codexHome, "auth.json"));
}

async function capacityCodexChildren(codexHome, rootSessionId) {
  const files = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(file);
    }
  };
  await collect(path.join(codexHome, "sessions"));
  const children = new Map(); const completed = new Set();
  for (const file of files) {
    const records = (await readFile(file, "utf8")).split("\n").flatMap((line) => { try { return line ? [JSON.parse(line)] : []; } catch { return []; } });
    for (const record of records) {
      const meta = record?.type === "session_meta" ? record.payload : null;
      if (meta?.parent_thread_id === rootSessionId && typeof meta.id === "string") children.set(meta.id, { session_id: meta.id, parent_session_id: rootSessionId, status: "unknown", source: "codex.session_meta" });
      const activity = record?.payload?.item;
      if (activity?.type === "SubAgentActivity" && activity.kind === "completed" && typeof activity.agent_thread_id === "string") completed.add(activity.agent_thread_id);
    }
  }
  for (const child of children.values()) if (completed.has(child.session_id)) child.status = "completed";
  return [...children.values()].sort((left, right) => left.session_id.localeCompare(right.session_id));
}

/**
 * A bounded technical qualification. It intentionally creates no RUN, Stage
 * or Work: the only measured fact is an accepted native direct-child ID.
 */
export async function harnessCapacityCheck({ profileId, maximum, projectRoot = process.cwd(), writeProfile = true }) {
  const max = Number(maximum);
  if (!Number.isInteger(max) || max < 1) fail("--max must be a positive integer", "capacity_check_invalid");
  const loaded = await loadProfile(profileId); const profile = loaded.value;
  const project = path.resolve(projectRoot);
  const root = path.join(evalHome(), "conformance", "native-subagents", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const attempt = path.join(root, "attempt");
  await mkdir(attempt, { recursive: true });
  // Qualification is intentionally outside dd-flow. Supplying a flow home
  // would activate adapter lifecycle forwarding and turn a technical child
  // probe into a synthetic RUN/Work interaction.
  const journal = path.join(attempt, "events.jsonl"); const daemon = { daemonArgs: ["--state-dir", path.join(attempt, "daemon"), ...(["grok-acp", "antigravity-cli", "opencode-server"].includes(profile.harness) ? ["--no-flow"] : [])], journal, env: profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {} };
  if (profile.harness === "codex-desktop") await provisionCapacityCodexHome(daemon.env.CODEX_HOME);
  let rootSessionId = null; let promptReceipt = null; let inspected = null; let cleanup = null; let failure = null;
  try {
    await callDriver(profile, ["daemon", "start", ...daemon.daemonArgs, "--cwd", project, "--journal", journal], { cwd: project, env: daemon.env });
    const created = await providerTurn(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: project, env: daemon.env });
    rootSessionId = created.provider_session_id ?? created.session_id;
    if (typeof rootSessionId !== "string") fail("capacity root has no provider session ID", "driver_protocol");
    promptReceipt = await providerTurn(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", rootSessionId, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", nativeCapacityPrompt(max), "--journal", journal], { cwd: project, env: daemon.env });
    inspected = await callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", rootSessionId, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: project, env: daemon.env }).catch(() => null);
  } catch (error) {
    failure = { code: error?.code ?? "capacity_check_failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    cleanup = await stopCapacityDaemon({ profile, daemon, projectRoot: project }).catch((error) => ({ stopped: false, error: error.message ?? String(error) }));
  }
  const observedChildren = directNativeChildren(inspected ?? promptReceipt, rootSessionId);
  const children = profile.harness === "codex-desktop" ? await capacityCodexChildren(daemon.env.CODEX_HOME, rootSessionId) : observedChildren;
  const count = (status) => children.filter((child) => child.status === status).length;
  const receipt = {
    schema_id: "dd-eval/subagent-capacity@1", profile_id: profile.id, harness: profile.harness,
    requested: max, started: children.length, completed: count("completed"), failed_after_start: count("failed"), cancelled_after_start: count("cancelled"), capacity: children.length,
    root_session_id: rootSessionId, children, cleanup, ...(failure ? { failure } : {}), recorded_at: now()
  };
  const receiptFile = path.join(root, "capacity.json"); await writeJsonAtomic(receiptFile, receipt);
  const qualified = !failure && cleanup?.stopped !== false && receipt.capacity > 0;
  if (writeProfile && qualified) await writeJsonAtomic(loaded.file, { ...profile, subagent_capacity: receipt.capacity });
  return { root, receipt_file: receiptFile, ...receipt, qualified, profile_updated: writeProfile && qualified };
}

/** Ask the current coordinator to execute an engine-declared graph with native children. */
async function driveFanout({ profile, attempt, projectRoot, runtimeRoot, runId, stage, eventsFile, event }) {
  let status = await fanoutStatus({ projectRoot, runtimeRoot, runId, stage });
  if (!status.orchestration) return null;
  for (;;) {
    const fanout = status.orchestration;
    if (fanout.capacity_required && fanout.capacity?.available_slots === null) {
      const availableSlots = profile.subagent_capacity;
      if (!Number.isInteger(availableSlots) || availableSlots < 1) {
        fail(`fan-out ${stage} requires a qualified subagent_capacity in profile ${profile.id}`, "subagent_capacity_unqualified");
      }
      await recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots });
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.capacity.recorded", data: { stage, available_slots: availableSlots, source: "harness_profile" } });
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
    if (fanout.capacity_required && (!Number.isInteger(capacity) || capacity < 1)) fail(`fan-out ${stage} has no qualified native child capacity`, "subagent_capacity_unqualified");
    const ready = Array.isArray(fanout.works?.ready) ? fanout.works.ready : [];
    if (ready.length) {
      const wave = ready.slice(0, capacity ?? ready.length);
      await appendEvent(eventsFile, { ...event, type: "dev.dd.eval.fanout.native_wave.requested", data: { stage, work_ids: wave.map((work) => work.work_id), capacity: capacity ?? null } });
      return { state: "native_children_required", status, continuation: nativeChildFanoutPrompt({ stage, works: wave, capacity: capacity ?? wave.length }) };
    }
    if (fanout.works?.running) return { state: "awaiting_native_children", status };
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

function executionMayFanOut(execution) {
  const from = stages.indexOf(execution.stage); const to = stages.indexOf(execution.terminal_stage);
  return ["plan-review", "code", "code-review"].some((stage) => stages.indexOf(stage) >= from && stages.indexOf(stage) <= to);
}

export function assertProfileCapacity(profile, executions) {
  if (!executions.some(executionMayFanOut)) return;
  if (Number.isInteger(profile.subagent_capacity) && profile.subagent_capacity > 0) return;
  const error = new Error(`selected contour may create native children but profile ${profile.id} has no qualified subagent capacity`);
  error.code = "subagent_capacity_unqualified";
  error.details = { profile_id: profile.id, next_command: `dd-eval harness capacity check --profile ${profile.id} --max 15 --project-root <project-root>` };
  throw error;
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
  assertProfileCapacity(profile, executions);
  return executeEval({ runProfile, profile, loaded, validated, definition, executions });
}

export function selectionNeedsEntryPack(executions) { return executions.some((execution) => execution.mode !== "e2e"); }

async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored", executions: suppliedExecutions = null }) {
  const home = evalHome(); const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(home, "runs", runId); const events = path.join(root, "events.jsonl");
  const executions = suppliedExecutions ?? selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage });
  const entryPackManifest = validated ? { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(await readFile(validated.entry_pack)) } : null;
  const interactionFixtures = await interactionFixtureManifest(loaded.root, executions);
  const manifest = { schema_id: "dd-eval/runner-manifest@1", kind, run_id: runId, case_id: loaded.value.id, entry_pack: entryPackManifest, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, ...(definition ? { definition } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions };
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
        assertCheckpointEngine(loaded.inputCheckpoint, restored.engine);
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
          const { candidate, statistics } = await captureExecutionCandidate({ projectRoot, runtimeRoot, runId: server.lifecycle.run_id, attempt, stage: "merge", journal: path.join(attempt, "drivers", "subject.events.jsonl") });
          return { execution: execution.id, stage: "merge", attempt, session_id: null, run_id: server.lifecycle.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher: null, driver: { merge_server: server.receipt }, lifecycle: server.lifecycle, boundaries: [], candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
        }
      }
      let created; let daemonStarted = false;
      try {
        const doctor = await callDriver(profile, ["doctor", "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }); assertObservedProfile(doctor, profile, "harness doctor");
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.harness.preflight", data: { harness: profile.harness, receipt: doctor } });
        await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env: executionEnv }); daemonStarted = true;
        created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: executionEnv }, permits);
        assertObservedProfile(created, profile, "Subject Session");
      } catch (error) {
        if (daemonStarted) await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env: executionEnv }).catch(() => {});
        throw error;
      }
      let sessionId = created.provider_session_id ?? created.session_id; if (typeof sessionId !== "string") fail("driver did not return provider_session_id", "driver_protocol");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.session_created", data: { session_id: sessionId, harness: profile.harness } });
      let prompted; let lifecycle; const boundaries = []; const hitlRounds = new Map(); const hitl = []; const settledFanout = new Set(); let subjectFailure = null;
      try {
        for (;;) {
          prompted = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", launcher, "--journal", journal], { cwd: projectRoot, env: executionEnv, onProgress: () => appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.progress", data: { state: "running_subject", stage: currentStage } }) }, permits);
          lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: currentStage, runId: currentEntry.snapshot.run_id });
          if (lifecycle.stage_status === "running") {
            const fanout = await driveFanout({ profile, attempt, projectRoot, runtimeRoot, runId: lifecycle.run_id, stage: currentStage, eventsFile: events, event: { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId } });
            if (fanout?.state === "awaiting_native_children") {
              launcher = nativeChildWaitPrompt({ stage: currentStage });
              await writeFile(path.join(attempt, "launchers", `${currentStage}-wait-for-native-children.md`), `${launcher}\n`);
              continue;
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
            const fixture = await interactionFixture(loaded.root, currentStage, fixtureHash(manifest, currentStage)); const rounds = hitlRounds.get(currentStage) ?? 0;
            const record = stageRecord(lifecycle, currentStage); const questionPath = record?.pause?.question_path;
            if (fixture.mode === "forbidden" || rounds >= fixture.max_rounds || !questionPath) fail(`unexpected HITL at ${currentStage}`, "unexpected_hitl");
            const question = await readFile(questionPath, "utf8");
            const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage: currentStage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile, permits });
            const exchange = resolveHitlJudgment({ fixture, judgment, question, stage: currentStage }); const answer = exchange.answer;
            const nextRound = rounds + 1; hitlRounds.set(currentStage, nextRound);
            const answerFile = await materializeHitlAnswer({ attempt, stage: currentStage, round: nextRound, answer });
            hitl.push({ ...exchange, round: nextRound, pause_id: record.pause.id, answer_file: answerFile, answer_sha256: sha256(answer) });
            launcher = await resumePrompt({ lifecycle, stage: currentStage, question, answerFile, runtimeRoot, projectRoot });
            await writeFile(path.join(attempt, "launchers", `${currentStage}-resume-${rounds + 1}.md`), `${launcher}\n`);
            await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.hitl.matched", data: { stage: currentStage, round: nextRound, pause_id: record.pause.id, response_ids: exchange.response_ids, judge_session_id: judgment.session_id, receipt_file: judgment.receipt_file, answer_file: answerFile, answer_sha256: sha256(answer) } });
            continue;
          }
          if (lifecycle.stage_status !== "done" || !["e2e", "segment"].includes(execution.mode) || currentStage === execution.terminal_stage) break;
          const requiredFixture = await interactionFixture(loaded.root, currentStage, fixtureHash(manifest, currentStage));
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
      } catch (error) {
        subjectFailure = error;
        throw error;
      } finally {
        const cancelTree = subjectFailure?.code === "daemon_timeout" && profile.harness === "antigravity-cli";
        try { await callDriver(profile, ["daemon", "stop", ...daemonArgs, ...(cancelTree ? ["--cancel-tree"] : [])], { cwd: projectRoot, env: executionEnv }); }
        catch (cleanupError) {
          if (!subjectFailure) throw cleanupError;
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.harness.cleanup_failed", data: { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError), code: cleanupError?.code ?? "cleanup_failed" } });
        }
      }
      if (lifecycle.stage_status !== "done") {
        const code = lifecycle.stage_status === "paused" ? "registered_hitl_requires_interaction_judge" : "incomplete_subject_turn";
        throw Object.assign(new Error(`Subject turn ended without successful ${currentStage} finish (${lifecycle.stage_status ?? "stage missing"})`), { code, lifecycle });
      }
      const terminalFixture = await interactionFixture(loaded.root, currentStage, fixtureHash(manifest, currentStage));
      if (terminalFixture.mode === "required" && (hitlRounds.get(currentStage) ?? 0) === 0) fail(`required HITL did not occur at ${currentStage}`, "required_hitl_missing");
      boundaries.push({ stage: currentStage, run_id: lifecycle.run_id, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256 });
        const { candidate, statistics } = await captureExecutionCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt, stage: currentStage, journal });
        return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher, driver: prompted, lifecycle, boundaries, hitl, candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
      }});
      const completed = result.result ?? result;
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, result: completed } });
      return completed;
    } catch (error) {
      // An RPC timeout only says this client did not observe the native
      // operation. Keep the execution recoverable and let runner resume
      // reconcile the durable RUN/session rather than manufacturing a failed
      // flow result or sending a duplicate prompt.
      if (error?.code === "daemon_timeout" && profile.harness === "antigravity-cli") {
        const failure = { execution: execution.id, state: "failed", code: "subject_liveness_timeout", error: error instanceof Error ? error.message : String(error), details: error.details ?? null, started_at: startedAt, finished_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure } });
        if (runProfile.value.failure_policy.stop_run_on_infrastructure_error) stopAfterInfrastructureFailure = true;
        return failure;
      }
      if (error?.code === "rpc_timeout" || error?.code === "daemon_timeout" || error?.code === "turn_timeout" || error?.code === "operation_observation_lost") {
        const uncertain = { execution: execution.id, state: "awaiting_provider", code: error.code, error: error instanceof Error ? error.message : String(error), started_at: startedAt, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.awaiting_provider", data: uncertain });
        return uncertain;
      }
      const failure = { execution: execution.id, state: "failed", code: error?.code ?? "execution_failed", error: error instanceof Error ? error.message : String(error), ...(error?.hitl ? { hitl: [error.hitl] } : {}), started_at: startedAt, finished_at: now() };
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
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const candidateFile = path.join(root, "candidate.json");
  if (!(await exists(candidateFile))) {
    await finalizeRunProjection({ root, manifest, loaded, results });
    return { root, status: "not_run_incomplete_execution", reason: "no frozen candidate exists because execution did not complete" };
  }
  const candidate = await readJson(candidateFile); const receipt = await finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate });
  await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, receipt };
}

function resultForOperation(events, operationId) {
  const operation = reduceEvents(events).operations[operationId];
  return operation?.terminal === "completed" ? operation.result : null;
}
function terminalOperation(events, operationId) {
  return reduceEvents(events).operations[operationId] ?? null;
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
  let daemonArgs = primaryArgs;
  let recoveryBridge = false;
  try {
    await callDriver(profile, ["daemon", "status", ...primaryArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
  } catch {
    const bridgeState = path.join(attempt, "drivers", "recovery", randomUUID()); daemonArgs = ["--state-dir", bridgeState]; recoveryBridge = true;
    await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env });
  }
  try { return await action({ daemonArgs, env }); }
  finally { if (recoveryBridge) await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env }); }
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
    const fixture = await interactionFixture(loaded.root, currentStage, fixtureHash(manifest, currentStage));
    if (fixture.mode === "required" && hitlRoundsFor(events, execution.id, currentStage) === 0) fail(`required HITL did not occur at ${currentStage}`, "required_hitl_missing");
    const { candidate, statistics } = await captureExecutionCandidate({ projectRoot, runtimeRoot, runId: lifecycle.run_id, attempt, stage: currentStage, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
    const prepared = preparedContextFor(events, execution.id, currentStage);
    return { execution: execution.id, stage: currentStage, attempt, session_id: sessionId, run_id: lifecycle.run_id, runtime_engine: prepared.runtime_engine ?? null, semantic_package_sha256: prepared.semantic_package_sha256 ?? null, context_slice_sha256: prepared.context_slice_sha256 ?? null, materialized_context_sha256: prepared.materialized_context_sha256 ?? null, launcher: prepared.launcher_file ?? null, driver: { recovery: true }, boundaries: events.filter((event) => event.executionid === execution.id && event.type === "dev.dd.eval.stage.boundary_captured").map((event) => event.data), hitl: await hitlEvidenceFor(events, execution.id), candidate, statistics, lifecycle, started_at: prepared.started_at, finished_at: now(), state: "candidate_ready", recovered: true };
  }
  if (record?.status === "paused") {
    const fixture = await interactionFixture(loaded.root, currentStage, fixtureHash(manifest, currentStage)); const questionPath = record.pause?.question_path; const rounds = hitlRoundsFor(events, execution.id, currentStage);
    if (fixture.mode === "forbidden" || !questionPath) fail(`unexpected HITL at ${currentStage}`, "unexpected_hitl");
    const question = await readFile(questionPath, "utf8"); const runProfile = { value: manifest.profile };
    const priorMatch = events.filter((event) => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data?.pause_id === record.pause.id).at(-1);
    let answerFile;
    if (priorMatch) {
      answerFile = priorMatch.data.answer_file;
      if (typeof answerFile !== "string" || !(await exists(answerFile))) fail("accepted HITL answer bytes are unavailable for recovery", "hitl_answer_missing");
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.hitl.resume_retried", data: { stage: currentStage, round: priorMatch.data.round, pause_id: record.pause.id, response_ids: priorMatch.data.response_ids, answer_file: answerFile, answer_sha256: priorMatch.data.answer_sha256 } });
    } else {
      if (rounds >= fixture.max_rounds) fail(`unexpected HITL at ${currentStage}`, "unexpected_hitl");
      const contextFile = path.join(attempt, "stage-context", `${currentStage}.json`);
      const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage: currentStage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: (await exists(contextFile)) ? contextFile : null });
      const exchange = resolveHitlJudgment({ fixture, judgment, question, stage: currentStage }); const answer = exchange.answer; const nextRound = rounds + 1;
      answerFile = await materializeHitlAnswer({ attempt, stage: currentStage, round: nextRound, answer });
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.hitl.matched", data: { stage: currentStage, round: nextRound, pause_id: record.pause.id, response_ids: exchange.response_ids, judge_session_id: judgment.session_id, receipt_file: judgment.receipt_file, answer_file: answerFile, answer_sha256: sha256(answer), recovered: true } });
    }
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
      event: { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id },
    });
    if (fanout?.continuation) {
      await promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt: fanout.continuation, journal: path.join(attempt, "drivers", "subject.events.jsonl") });
      return recoverExecution({ root, events: await readEvents(path.join(root, "events.jsonl")), manifest, execution, loaded, blueprint, profile });
    }
    if (fanout?.state === "awaiting_native_children") {
      await promptExistingSession({ profile, attempt, projectRoot, runtimeRoot, sessionId, prompt: nativeChildWaitPrompt({ stage: currentStage }), journal: path.join(attempt, "drivers", "subject.events.jsonl") });
      return recoverExecution({ root, events: await readEvents(path.join(root, "events.jsonl")), manifest, execution, loaded, blueprint, profile });
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
    const operationId = `${manifest.run_id}:${execution.id}:launch`; const operation = terminalOperation(events, operationId); const completed = operation?.terminal === "completed" ? operation.result : null;
    if (completed) { results.push(completed); continue; }
    if (operation?.terminal) fail(`execution ${execution.id} launch is already ${operation.terminal}; recovery must create an explicit recovery operation`, "operation_terminal");
    const recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); results.push(recovery);
    if (recovery.state === "candidate_ready") await completeOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.launch`, result: recovery });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.awaiting_provider", data: { state: "awaiting_provider", execution: execution.id, recovery } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest).map((result, index) => result.state === "awaiting_provider" ? results[index] : result);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results: reconciled });
  return { root, run_id: manifest.run_id, executions: reconciled, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

export async function runnerReconcile({ evalRoot }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  let blueprint;
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id);
    blueprint = validateStageBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")));
  } else blueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  for (const execution of manifest.executions) {
    const launchId = `${manifest.run_id}:${execution.id}:launch`; const launched = terminalOperation(events, launchId);
    const completed = launched?.terminal === "completed" ? launched.result : null;
    if (completed) { results.push(completed); continue; }
    if (launched?.terminal !== "failed") fail(`execution ${execution.id} is not eligible for terminal reconciliation`, "reconcile_not_eligible");
    const operationId = `${launchId}:reconcile`;
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reconcile`, action: async () => {
      const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
      const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: null }); const currentStage = latestObservedStage(lifecycle.status, execution.stage); const record = stageRecord({ ...lifecycle, status: lifecycle.status }, currentStage);
      if (currentStage !== execution.terminal_stage || record?.status !== "done") fail(`execution ${execution.id} has not durably completed ${execution.terminal_stage}`, "reconcile_not_terminal");
      return await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile });
    } });
    const result = receipt.result ?? receipt; results.push(result);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, result, reconciled: true } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
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
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.cancel_requested", data: { state: "cancelling", execution: execution.id, session_id: sessionId } });
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.cancel`, action: async () => {
      return await withExecutionDaemon({ profile, attempt, projectRoot, runtimeRoot, journal, action: async ({ daemonArgs, env }) => await callDriver(profile, ["session", "cancel", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env }) });
    } });
    const result = receipt.result ?? receipt;
    const settled = result?.settled === true;
    cancelled.push({ execution: execution.id, session_id: sessionId, settled, receipt: result });
    if (settled) await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.cancelled", data: { state: "cancelled", execution: execution.id, receipt: result } });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.cancelling", data: { state: "cancelling", execution: execution.id, receipt: result } });
  }
  const loaded = await loadCase(manifest.case_id); const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  if (cancelled.every((item) => item.settled)) await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, run_id: manifest.run_id, cancelled, state: cancelled.every((item) => item.settled) ? "cancelled" : "cancelling" };
}

export async function runnerStatus({ evalRoot }) { const root = path.resolve(evalRoot); const events = await readEvents(path.join(root, "events.jsonl")); return { root, ...reduceEvents(events), manifest: await readJson(path.join(root, "manifest.json")) }; }
