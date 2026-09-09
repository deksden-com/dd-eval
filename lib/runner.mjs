import { runBaselineAdmission, verifyBaselineAdmission } from "./baseline-admission.mjs";
import { assertCheckpointEngine, verifyEngineArtifact } from "./engine-admission.mjs";
import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, symlink, writeFile, access, appendFile, rename } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { appendEvent, canonicalJson, completeOperation, controlOperationInventory, hashJson, readEvents, readJsonLines, recordOperation, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { materializeStageSlice, semanticContextHash, stages, validateEntry as validateStageEntry, validateStageBlueprint, writeEntryPack } from "./entry-pack.mjs";
import { commandJson, commandText } from "./process-json.mjs";
import { isObservationLoss, errorRecord, reportedError } from "./operation-errors.mjs";
import { operationContext } from "./operation-context.mjs";
import { reconcileDriverReplies, recoverDriverReply, assertDaemonReplaceable } from "./driver-recovery.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { withSleepInhibitor } from "./sleep-inhibitor.mjs";
import { observationSummary } from "./observation-summary.mjs";
import { checkObservedProfile, readModelObservations, modelAttribution } from "./model-observations.mjs";
import { modelProgressPump } from "./model-progress.mjs";
import { cancelOwnedDaemon } from "./daemon-control.mjs";
import { executionState, assertExecutionDispatch, executionCleanupRequired } from "./execution-state.mjs";
import { observeManagedRun, prepareManagedRun } from "./managed-flow-client.mjs";

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
function evalRuntimeEnv(runtimeRoot, manifest, extra = {}) {
  if (typeof manifest.runtime_resource_home !== "string" || !path.isAbsolute(manifest.runtime_resource_home)) fail("EVAL manifest must retain its absolute resource registry home", "runtime_scope_identity_missing");
  return runtimeEnv(runtimeRoot, { ...extra, DD_FLOW_RESOURCE_HOME: manifest.runtime_resource_home });
}

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
  onlyKeys(value.subject, ["profile_id", "execution"], "run profile subject"); if (typeof value.id !== "string" || typeof value.case_id !== "string" || typeof value.subject.profile_id !== "string") fail("run profile requires id, case_id and subject.profile_id");
  if (value.subject.execution !== undefined && !isObject(value.subject.execution)) fail("subject.execution must reference a complete CLI execution routing policy");
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
export function continuationStage(lifecycle, completedStage) {
  const projected = lifecycle?.status?.continuation;
  if (!projected) fail(`dd-flow omitted continuation after ${completedStage}`, "flow_reconciliation_failed");
  if (projected.kind === "terminal") return null;
  if (!["start_stage", "continue_stage"].includes(projected.kind) || !stageSet.has(projected.stage)) {
    fail(`dd-flow did not expose a legal successor after ${completedStage}: ${projected.kind ?? "unknown"}`, "flow_reconciliation_failed");
  }
  return projected.stage;
}
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
    await assertCheckpointEngine(loaded.inputCheckpoint, selected);
    const engine = await captureEngineSnapshot({ root, home, selected });
    await commandJson("dd-flow", ["run", "snapshot", "bootstrap", "create", "--project-root", sourceProjectRoot, "--output", snapshotRoot], { cwd: sourceProjectRoot, env: runtimeEnv(transientHome) });
    const snapshot = { kind: "bootstrap", locator: canonicalLocator(home, snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "bootstrap.json")), run_id: null };
    const entry = canonicalEntry({ caseId: loaded.value.id, revision, stage: "specify", snapshot, blueprint });
    await writeJsonAtomic(path.join(root, "entries", "specify.json"), entry);
    return { entry, engine };
  }
  finally { await rm(transientHome, { recursive: true, force: true }); }
}
export async function assertSourceTag(projectRoot, source) {
  if (source.tag === undefined) return;
  if (typeof source.tag !== "string" || !source.tag) fail("source tag must be non-empty", "input_checkpoint_source_tag_mismatch");
  await commandText("git", ["check-ref-format", `refs/tags/${source.tag}`], { cwd: projectRoot });
  const commit = await commandText("git", ["rev-parse", "--verify", `refs/tags/${source.tag}^{commit}`], { cwd: projectRoot });
  if (commit !== source.commit) fail(`source tag ${source.tag} does not match pinned commit ${source.commit}`, "input_checkpoint_source_tag_mismatch");
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
  await assertSourceTag(projectRoot, inputCheckpoint.value.source);
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
  await assertSourceTag(projectRoot, source);
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
    const baselineAdmission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot: materializedInput.project_root, outputRoot: path.join(root, "baseline-admission"), checkpoint: loaded.inputCheckpoint });
    await writeJsonAtomic(path.join(root, "stage-context.json"), blueprint);
    const bootstrap = await createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot: materializedInput.project_root });
    const interactionFixtures = await interactionFixtureManifest(loaded.root, [{ stage: loaded.value.flow.contour[0], terminal_stage: loaded.value.flow.terminal_stage }]);
    const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "awaiting_reference_resume", profile: profile.value.id, profile_file: profile.file, source_project_root: path.resolve(projectRoot), source_preflight: sourcePreflight, definition, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256, file: loaded.inputCheckpoint.file, value: loaded.inputCheckpoint.value }, materialized_input: materializedInput, baseline_admission: baselineAdmission, engine: bootstrap.engine, blueprint_sha256: hashJson(blueprint), current_stage: "specify", reference: { session_id: null, daemon_state: null, run_id: null }, entries: { specify: "entries/specify.json" }, created_at: now() };
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


export async function canonicalResume({ buildRoot, detachTurns = false }) {
  const root = path.resolve(buildRoot);
  return await canonicalResumeLock(root, async () => await canonicalResumeUnlocked({ buildRoot: root, detachTurns }));
}

async function canonicalResumeUnlocked({ buildRoot, detachTurns = false }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  await verifyBaselineAdmission({ reference: state.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint });
  const retainedEngine = await verifyEngineSnapshot(evalHome(), state.engine);
  await assertCheckpointEngine(loaded.inputCheckpoint, { ...retainedEngine.manifest, snapshot_root: retainedEngine.root });
  if (state.status !== "awaiting_reference_resume") fail(`canonical build is ${state.status}, not awaiting reference resume`, "canonical_transition_invalid");
  if (state.reference.session_id && !state.reference.managed) fail("Legacy reference Sessions require explicit migration before managed continuation", "reference_migration_required");
  const runProfile = await loadRunProfile(state.profile_file);
  const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  const stage = state.current_stage;
  const entry = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [{ stage, terminal_stage: stage }], runProfile });
  const attempt = path.join(root, "reference"), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  const events = path.join(root, "build", "events.jsonl");
  const save = async (type, data) => writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type, data });
  if (!state.reference.run_id) {
    const routing = path.join(attempt, "execution-routing.json");
    await writeJsonAtomic(routing, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
    const restored = await restoreStageSnapshot({ home: evalHome(), entry, stage, projectRoot, runtimeRoot, authoringEngine: state.engine, executionRoutingFile: routing });
    let runId = restored.run_id;
    if (!runId) {
      const prepared = await prepareManagedRun({ bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, slug: "reference-subject", executionRoutingFile: routing });
      runId = prepared.run_id;
    }
    if (typeof runId !== "string") fail("Reference preparation omitted its logical RUN", "controller_receipt_invalid");
    state.reference = { ...state.reference, managed: true, run_id: runId, contexts: {}, answered_pauses: {} };
    await save("dev.dd.eval.reference.run_prepared", { stage, run_id: runId });
  }
  if (!state.reference.managed) fail("Legacy reference RUN requires explicit migration", "reference_migration_required");
  const runId = state.reference.run_id;
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  await assertCheckpointEngine(loaded.inputCheckpoint, resolved.selection?.selected);
  const contextFor = async (requested, attemptNumber = 1) => {
    if (requested !== stage) return null;
    const key = `${requested}:${attemptNumber ?? 1}`;
    const prior = state.reference.contexts?.[key];
    if (prior) {
      if (sha256(await readFile(prior.file)) !== prior.sha256) fail("Retained reference context changed", "context_checksum_mismatch");
      return prior;
    }
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", runId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    if (["plan", "plan-review", "code", "code-review"].includes(requested) && selected?.delegation?.mode === "native") {
      const coordinator = selected.coordinator;
      if (!coordinator || harnessConfigKey(coordinator.harness) !== harnessConfigKey(profile.harness) || coordinator.model !== profile.model || coordinator.reasoning !== profile.reasoning || !Number.isInteger(profile.subagent_capacity) || profile.subagent_capacity < 1) fail("Native capacity is not qualified for the reference stage profile", "subagent_capacity_unqualified");
      await recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots: profile.subagent_capacity });
    }
    await materializeTaskInput(loaded.root, blueprint, requested, projectRoot);
    const file = path.join(attempt, "stage-context", `${requested}-${attemptNumber ?? 1}.json`);
    const slice = await materializeStageSlice({ blueprint, stage: requested, roots: restoredRoots({ status }, projectRoot, runtimeRoot), output: file });
    const reference = { file, sha256: sha256(await readFile(file)), slice };
    state.reference.contexts = { ...state.reference.contexts, [key]: reference };
    await save("dev.dd.eval.reference.context_prepared", { stage: requested, attempt: attemptNumber, context_file: file, materialized_context_sha256: reference.sha256, ...slice });
    return reference;
  };
  const first = await contextFor(stage);
  if (!state.reference.context_package) {
    const file = path.join(attempt, "managed-context.json");
    await writeJsonAtomic(file, { schema_id: "dd-flow/managed-context@1", stages: { [stage]: { file: first.file, sha256: first.sha256 } } });
    state.reference.context_package = file;
    await save("dev.dd.eval.reference.launch_prepared", { run_id: runId, context_package: file });
  }
  const answerFor = async (record, _run, controller) => {
    const pause = record.pause;
    const prior = state.reference.answered_pauses?.[pause.id];
    if (prior) {
      await acceptedHitlAnswer({ answerFile: prior.answer_file, answerSha256: prior.answer_sha256 });
      return prior.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, record.stage, state.interaction_fixtures?.[record.stage]?.interaction_fixture_sha256);
    const rounds = Object.values(state.reference.answered_pauses ?? {}).filter(item => item.stage === record.stage).length;
    if (fixture.mode === "forbidden" || rounds >= fixture.max_rounds || !pause.question_path) fail(`unexpected reference HITL at ${record.stage}`, "unexpected_hitl");
    const question = await readFile(pause.question_path, "utf8");
    const context = await contextFor(record.stage, record.attempt);
    if (!context) fail("Reference HITL crossed its unapproved boundary", "reference_boundary_unapproved");
    const judged = await interactionJudge({ runProfile, fixture, question, attempt, stage: record.stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: context.file, controller });
    const exchange = resolveHitlJudgment({ fixture, judgment: judged, question, stage: record.stage });
    const answerFile = await materializeHitlAnswer({ attempt, stage: record.stage, round: rounds + 1, answer: exchange.answer });
    const evidence = { stage: record.stage, round: rounds + 1, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: sha256(exchange.answer) };
    state.reference.answered_pauses = { ...state.reference.answered_pauses, [pause.id]: evidence };
    await save("dev.dd.eval.reference.hitl.matched", { ...evidence, pause_id: pause.id, judge_session_id: judged.session_id, receipt_file: judged.receipt_file });
    return answerFile;
  };
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, runId,
    requestId: `reference:${sha256(root)}`, controllerId: state.reference.controller_id,
    contextFile: state.reference.context_package, stopAfter: loaded.value.flow.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor, observeOnce: detachTurns,
    onEvent: async (event, controller) => {
      state.reference.controller_id = controller.controller_id;
      state.reference.session_id = controller.sessions.at(-1)?.session_id ?? null;
      if (event.sequence > (state.reference.event_cursor ?? 0)) {
        state.reference.event_cursor = event.sequence;
        await save("dev.dd.eval.reference.controller_event", { controller_id: controller.controller_id, ...event });
      }
    }
  });
  state.reference.controller_id = observed.controller.controller_id;
  state.reference.session_id = observed.controller.sessions.at(-1)?.session_id ?? null;
  if (observed.boundary?.stage !== stage) {
    if (!detachTurns) fail("Reference controller did not capture its review boundary", "stage_boundary_incomplete");
    await save("dev.dd.eval.reference.observing", { stage, controller_id: observed.controller.controller_id });
    return { build: root, state, next: { kind: "wait_reference_turn", stage, controller_id: observed.controller.controller_id } };
  }
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId });
  if (lifecycle.stage_status !== "done" || sha256(await readFile(observed.boundary.manifest)) !== observed.boundary.manifest_sha256) fail("Reference capture does not match a completed stage", "stage_boundary_incomplete");
  const fixture = await interactionFixture(loaded.root, stage, state.interaction_fixtures?.[stage]?.interaction_fixture_sha256);
  if (fixture.mode === "required" && !Object.values(state.reference.answered_pauses ?? {}).some(item => item.stage === stage)) fail(`required HITL did not occur at ${stage}`, "required_hitl_missing");
  state.reference.boundary = observed.boundary;
  state.status = "waiting_for_reference_review";
  state.completed_stage = stage;
  state.context_receipt = { semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256 };
  await save("dev.dd.eval.reference.stage_done", { stage, run_id: runId, controller_id: observed.controller.controller_id, boundary: observed.boundary });
  return { build: root, state, lifecycle, next: { kind: "reference_review", message: `Review ${stage}, then run canonical boundary accept.` } };
}

export async function canonicalBoundaryAccept({ buildRoot, stage, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (state.status !== "waiting_for_reference_review" || state.completed_stage !== stage || state.current_stage !== stage) fail("canonical build is not waiting for this stage review", "canonical_transition_invalid");
  const review = path.resolve(reviewFile); if (!(await exists(review)) || !(await readFile(review, "utf8")).trim()) fail("canonical boundary review must be a non-empty file", "canonical_review_required");
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId: state.reference.run_id });
  if (lifecycle.stage_status !== "done") fail("Reference stage is no longer complete", "reference_boundary_changed");
  const successor = continuationStage(lifecycle, stage);
  if (!state.reference.managed || !state.reference.controller_id) fail("Legacy reference boundaries require explicit migration", "reference_migration_required");
  const boundary = state.reference.boundary;
  if (boundary?.stage !== stage || typeof boundary.manifest !== "string" || sha256(await readFile(boundary.manifest)) !== boundary.manifest_sha256) fail("Reference boundary receipt changed", "snapshot_checksum_mismatch");
  const captured = await readJson(boundary.manifest);
  if (captured.run_id !== state.reference.run_id || captured.boundary_capture?.controller_id !== state.reference.controller_id || captured.boundary_capture?.operation_id !== boundary.operation_id || captured.boundary_capture?.boundary_key !== boundary.boundary_key || captured.stage_entry !== (successor ?? null)) fail("Reference capture belongs to another boundary", "snapshot_contract_mismatch");
  const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  if (status.controller?.controller_id !== state.reference.controller_id || !(successor ? status.controller.status === "waiting_for_context" : ["completed", "stop_target_reached"].includes(status.controller.status))) fail("Reference controller no longer holds the review boundary", "reference_boundary_changed");
  if (!successor) {
    state.status = "entries_captured";
    state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review: review, sha256: await manifestHash(review), at: now() }];
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage } });
    return { build: root, state, next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)}` } };
  }
  const snapshotRoot = path.dirname(boundary.manifest);
  const snapshot = { kind: "run", locator: canonicalLocator(evalHome(), snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "snapshot.json")), run_id: state.reference.run_id };
  await verifySnapshot(evalHome(), { snapshot }, successor);
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
  await verifyEngineArtifact(manifest, root);
  return { root, manifest };
}
async function captureEngineSnapshot({ root, home, selected }) {
  if (!selected?.snapshot_root || !selected?.package_name || !selected?.package_version || !selected?.engine_version || !selected?.integrity?.checksum) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
  await verifyEngineArtifact(selected);
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
export async function restoreStageSnapshot({ home, entry, stage, projectRoot, runtimeRoot, authoringEngine = null, executionRoutingFile = null }) {
  const snapshot = await verifySnapshot(home, entry, stage);
  // The bootstrap restore owns project contents, but engine resolution needs
  // an existing cwd before restore starts.
  await mkdir(projectRoot, { recursive: true });
  const install = (destination) => authoringEngine
    ? materializeRuntimeEngine({ home, engine: authoringEngine, runtimeRoot: destination, projectRoot })
    : provisionRuntimeEngine(projectRoot, destination);
  if (entry.snapshot.kind === "bootstrap") {
    const engine = await install(runtimeRoot);
    const bin = runtimeBin(runtimeRoot); const env = runtimeEnv(runtimeRoot);
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
  // The import owns an empty destination. Its executable must live outside
  // that destination, which the CLI replaces with the captured runtime.
  await mkdir(path.dirname(runtimeRoot), { recursive: true });
  const toolsHome = await mkdtemp(path.join(path.dirname(runtimeRoot), ".restore-engine-"));
  try {
    const importer = await install(toolsHome);
    const restored = await commandJson(path.join(importer.snapshot_root, importer.entrypoint), ["run", "snapshot", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot, ...(executionRoutingFile ? ["--execution-routing-file", executionRoutingFile] : [])], { cwd: projectRoot, env: runtimeEnv(runtimeRoot, { DD_FLOW_ENGINE_MODE: "1", DD_FLOW_ENGINE_HOME: importer.snapshot_root }) });
    if (restored.run_id !== entry.snapshot.run_id || restored.target_stage !== stage) fail("restored RUN does not match its stage entry", "snapshot_restore_mismatch");
    const binding = await readJson(path.join(restored.run_home, "engine-binding.json"));
    const bound = binding.engine;
    if (bound?.package_name !== importer.package_name || bound?.package_version !== importer.package_version || bound?.engine_version !== importer.engine_version || bound?.integrity_checksum !== importer.integrity?.checksum) fail("stage-entry RUN is pinned to a different engine; create a compatible entry pack", "snapshot_engine_mismatch");
    const engine = await install(runtimeRoot);
    if (canonicalJson(runtimeEngineIdentity(engine)) !== canonicalJson(runtimeEngineIdentity(importer))) fail("selected engine changed during snapshot import", "snapshot_engine_mismatch");
    return { ...restored, snapshot: snapshot.root, engine };
  } finally { await rm(toolsHome, { recursive: true, force: true }); }
}
export async function provisionRuntimeEngine(projectRoot, runtimeRoot, { controlOnly = false } = {}) {
  if (controlOnly) await mkdir(runtimeRoot, { recursive: true });
  else await prepareRuntimeHarnessConfig(runtimeRoot);
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
  // The evaluation runtime must execute the adapters carried by its exact
  // engine snapshot.  Operator configuration still supplies only the native
  // harness binary, never a second copy of the adapter implementation.
  const bundledAdapters = path.join(selected.snapshot_root, "dist", "harness-runtime");
  if (!(await exists(bundledAdapters))) fail("canonical runtime has no bundled harness adapters", "canonical_engine_missing");
  const adapterRoot = path.join(runtimeRoot, "harness-runtime");
  await rm(adapterRoot, { recursive: true, force: true });
  await cp(bundledAdapters, adapterRoot, { recursive: true, force: true, verbatimSymlinks: true });
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
function driverFor(profile) { return profile.harness === "codex-desktop" ? "dd-codex.mjs" : profile.harness === "zcode-acp" ? "dd-zcode.mjs" : profile.harness === "grok-acp" ? "dd-grok.mjs" : profile.harness === "opencode-server" ? "dd-opencode.mjs" : profile.harness === "antigravity-cli" ? "dd-agy.mjs" : ["droid-cli", "droid"].includes(profile.harness) ? "dd-droid.mjs" : fail(`unsupported harness: ${profile.harness}`); }
function assertObservedProfile(receipt, profile, label) {
  if (receipt?.harness && receipt.harness !== profile.harness) fail(`${label} returned harness ${receipt.harness}, expected ${profile.harness}`, "profile_integrity_violation");
  const observed = receipt?.observed_profile ?? receipt?.evidence?.observed_profile ?? receipt?.profile?.observed;
  if (observed) checkObservedProfile(profile, observed);
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
  const configHome = env.DD_FLOW_CONFIG_HOME ?? env.DD_FLOW_HOME;
  if (profile?.harness && typeof configHome === "string" && path.isAbsolute(configHome)) {
    const config = await readJson(path.join(configHome, "harnesses.json"));
    const key = harnessConfigKey(profile.harness); const entry = config?.harnesses?.[key];
    if (!entry || typeof entry.runtime_command !== "string") fail(`Harness ${key} is not configured`, "harness_config_missing");
    const option = harnessRuntimeOption(profile.harness);
    if (!resolved.includes(option)) resolved.push(option, await absoluteExecutable(entry.runtime_command, cwd, launchEnv));
  }
  return resolved;
}
function harnessConfigKey(harness) { return ({ codex: "codex-desktop", zcode: "zcode-acp", grok: "grok-acp", agy: "antigravity-cli", opencode: "opencode-server", "codex-desktop": "codex-desktop", "zcode-acp": "zcode-acp", "grok-acp": "grok-acp", "antigravity-cli": "antigravity-cli", "opencode-server": "opencode-server", "droid-cli": "droid-cli", "droid": "droid-cli" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }
function harnessRuntimeOption(harness) { return ({ "codex-desktop": "--codex-bin", "zcode-acp": "--zcode-acp-bin", "grok-acp": "--grok-bin", "antigravity-cli": "--agy-bin", "opencode-server": "--opencode-bin", "droid-cli": "--droid-bin", "droid": "--droid-bin" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }
export async function driverAdapterInvocation(profile, { env = {} } = {}) {
  const configHome = env.DD_FLOW_CONFIG_HOME ?? env.DD_FLOW_HOME;
  if (typeof configHome !== "string" || !path.isAbsolute(configHome)) fail("Harness adapter requires an absolute retained runtime home", "harness_config_missing");
  const bundled = path.join(configHome, "harness-runtime", "bin", driverFor(profile));
  if (!(await exists(bundled))) fail("Selected runtime is missing its bundled harness adapter", "canonical_engine_missing");
  return { executable: process.execPath, prefix: [bundled] };
}
export function assertTargetSession(receipt, profile, args) {
  const expected = argValue(args, "--session-id");
  if (args[0] !== "session" || !["prompt", "inspect", "cancel", "resume", "status"].includes(args[1]) || !expected) return;
  const observed = receipt?.provider_session_id ?? receipt?.session_id;
  if (observed !== expected || (receipt?.harness && receipt.harness !== profile.harness)) {
    throw Object.assign(new Error("adapter response belongs to a different or unidentified Session"), { code: "session_identity_mismatch", details: { harness: profile.harness, expected_session_id: expected, observed_session_id: observed ?? null } });
  }
}
const deliveredModelProgress = new Map();
export async function callDriver(profile, args, options) {
  if ((args[0] === "session" && ["create", "start", "prompt", "fork"].includes(args[1])) || (args[0] === "daemon" && args[1] === "start")) await executionDispatchBarrier(args.slice(0, 2).join("."));
  const { spawn } = await import("node:child_process"); const adapter = await driverAdapterInvocation(profile, options);
  const command = driverProfileArgs(profile, await driverRuntimeArgs(args, { ...options, profile }));
  let ownedEnv = options.env;
  if (options.env?.DD_FLOW_RUNTIME_OWNER) {
    const owner = JSON.parse(options.env.DD_FLOW_RUNTIME_OWNER);
    const executable = adapter.prefix[0] ?? adapter.executable;
    if (owner.adapter_executable && owner.adapter_executable !== executable) fail("Judge adapter differs from its frozen runtime owner", "harness_runtime_binding_conflict");
    ownedEnv = { ...options.env, DD_FLOW_RUNTIME_OWNER: JSON.stringify({ ...owner, adapter_executable: executable }) };
  }
  const operationId = options.operationId ?? randomUUID();
  const stateIndex = command.indexOf("--state-dir");
  let clientFile, clientRecord;
  if (stateIndex >= 0 && args[0] === "session" && ["create", "start", "prompt", "fork"].includes(args[1])) {
    const root = command[stateIndex + 1]; await mkdir(root, { recursive: true });
    clientFile = path.join(root, "client-operations", `${sha256(operationId)}.json`);
    clientRecord = { operation_id: operationId, parent_operation_id: operationContext.getStore()?.operationId ?? null, command: args.slice(0, 2), requested_at: now(), request_sha256: hashJson(command), state: "requested" };
    await withRunnerLock(path.join(root, "client-ledger"), async () => {
      await reconcileDriverReplies(root);
      await writeJsonAtomic(clientFile, clientRecord);
    });
  }
  const modelJournal = argValue(args, "--journal");
  const progressKey = `${modelJournal ?? "none"}:${operationContext.getStore()?.executionId ?? "native"}`;
  if (!deliveredModelProgress.has(progressKey)) deliveredModelProgress.set(progressKey, new Set());
  const modelProgress = modelProgressPump({ journal: modelJournal, context: operationContext.getStore(), notify: options.onModelProgress, delivered: deliveredModelProgress.get(progressKey) });
  let observationError = null;
  const pollModels = () => modelProgress.poll().catch(error => { observationError = error; });
  await pollModels();
  if (observationError) throw Object.assign(new Error("model observations could not be read before dispatch"), { code: "model_observation_storage_failed" });
  const modelTimer = setInterval(() => { void pollModels(); }, 2000); modelTimer.unref?.();
  const invoke = () => new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (options.env?.DD_FLOW_CONFIG_HOME && !options.env?.DD_FLOW_HOME) {
      for (const key of Object.keys(env)) if (key.startsWith("DD_FLOW_")) delete env[key];
    }
    Object.assign(env, ownedEnv, { DD_EVAL_OPERATION_ID: operationId });
    const child = spawn(adapter.executable, [...adapter.prefix, ...command, "--json"], { cwd: options.cwd, env, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", (error) => { if (progress) clearInterval(progress); reject(error); });
    child.on("close", (code, signal) => {
      if (progress) clearInterval(progress);
      if (code !== 0) {
        let failure = null;
        try { failure = JSON.parse(stderr.trim() || stdout.trim()); } catch { /* Preserve opaque third-party failures. */ }
        const structured = failure?.error && typeof failure.error === "object" ? failure.error : failure;
        const message = structured?.message ?? (typeof failure?.error === "string" ? failure.error : null) ?? (stderr.trim() || stdout.trim() || `driver exited${signal ? ` by ${signal}` : ` ${code}`}`);
        return reject(reportedError({ ...structured, code: structured?.code ?? "driver_failed", message, details: { ...structured?.details, operation_id: operationId } }, "driver failed"));
      }
      try {
        const receipt = JSON.parse(stdout.trim());
        if (args[0] === "doctor" && options.validateRuntime !== false) assertObservedRuntime(receipt, profile, "harness doctor");
        resolve(receipt);
      } catch (error) { reject(error.code ? error : new Error(`driver returned invalid JSON: ${error.message}`)); }
    });
  });
  const invocation = clientFile ? withSleepInhibitor(invoke, { report: event => {
    void appendFile(path.join(command[stateIndex + 1], "host-events.jsonl"), `${JSON.stringify({ kind: "sleep_inhibitor", observed_at: now(), operation_id: operationId, ...event })}\n`).catch(() => {});
  } }) : invoke();
  try {
    let receipt;
    try { receipt = await invocation; }
    catch (error) {
      if (!clientFile || !isObservationLoss(error)) throw error;
      receipt = await recoverDriverReply(command[stateIndex + 1], operationId);
    }
    clearInterval(modelTimer);
    await pollModels();
    await pollModels(); // Drain a poll which may have started before the adapter reply.
    if (observationError) throw Object.assign(new Error(`model progress could not be persisted: ${observationError.message}`), { code: "model_observation_storage_failed" });
    assertTargetSession(receipt, profile, args);
    if (clientFile) await writeJsonAtomic(clientFile, { ...clientRecord, state: "completed", finished_at: now(), result: receipt });
    return receipt;
  } catch (error) {
    // Only the daemon can establish a terminal provider failure. A CLI crash,
    // invalid reply or spawn failure can leave dispatch uncertain.
    if (clientFile) await reconcileDriverReplies(command[stateIndex + 1]).catch(() => {});
    throw error;
  } finally { clearInterval(modelTimer); }
}

/** Qualify one changed harness profile by observing it and exercising its native child path once. */
export async function harnessCompatibilityQualify({ profileId, projectRoot = process.cwd() }) {
  const loaded = await loadProfile(profileId); const profile = loaded.value; const project = path.resolve(projectRoot);
  const original = await readFile(loaded.file); const beforeSha256 = sha256(original);
  const receiptRoot = path.join(evalHome(), "conformance", "harness-compatibility", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const runtimeRoot = path.join(receiptRoot, "runtime");
  await provisionRuntimeEngine(project, runtimeRoot);
  const options = { cwd: project, env: { DD_FLOW_CONFIG_HOME: runtimeRoot }, validateRuntime: false };
  const observedReceipt = await callDriver(profile, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  const observed = observedReceipt?.observed_runtime;
  if (!isObject(observed)) fail("harness doctor did not report observed_runtime", "harness_runtime_unobservable");
  if (JSON.stringify(profile.runtime ?? null) === JSON.stringify(observed)) return { profile_id: profile.id, status: "already_qualified", observed_runtime: observed };
  // Reuse the native-child conformance path. It is a small real smoke, not a
  // second launcher protocol with subtly different lifecycle semantics.
  const smoke = await harnessCapacityCheck({ profileId, maximum: 1, projectRoot: project, writeProfile: false, runtimeRoot });
  if (!smoke.qualified) {
    const error = new Error("harness compatibility smoke did not qualify the changed runtime");
    error.code = "harness_compatibility_smoke_failed";
    error.details = { profile_id: profile.id, observed_runtime: observed, smoke_receipt: smoke.receipt_file, failure: smoke.failure ?? null };
    throw error;
  }
  const afterReceipt = await callDriver({ ...profile, runtime: null }, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  if (JSON.stringify(afterReceipt?.observed_runtime ?? null) !== JSON.stringify(observed)) fail("harness runtime changed during qualification", "harness_runtime_changed");
  const current = await readFile(loaded.file);
  if (sha256(current) !== beforeSha256) fail("harness profile changed during qualification; inspect and retry", "harness_profile_changed");
  const next = { ...profile, runtime: observed };
  delete next.subagent_capacity;
  await writeJsonAtomic(loaded.file, next);
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
  return profile.harness === "codex-desktop" ? "codex" : profile.harness === "zcode-acp" ? "zcode" : profile.harness === "grok-acp" ? "grok" : profile.harness === "opencode-server" ? "opencode" : profile.harness === "antigravity-cli" ? "agy" : ["droid-cli", "droid"].includes(profile.harness) ? "droid" : fail(`unsupported merge-server harness: ${profile.harness}`, "merge_profile_invalid");
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
function candidateExecution(result) {
  return {
    execution: result.execution,
    stage: result.stage ?? null,
    run_id: result.run_id ?? null,
    session_id: result.session_id ?? null,
    outcome: result.state,
    reached_stage: result.lifecycle?.status ? latestObservedStage(result.lifecycle.status, result.stage) : result.state === "candidate_ready" ? result.stage ?? null : null,
    execution_operation_id: result.execution_operation_id ?? null,
    failure: result.state === "failed" ? { code: result.code ?? "execution_failed", message: result.error ?? null } : null,
    evidence_completeness: result.candidate?.manifest_sha256 ? "checkpointed" : result.attempt ? "partial" : "missing",
    checkpoint: result.candidate ?? null,
    incomplete_evidence: result.incomplete_evidence ?? null,
    recovery: result.recovery ?? null
  };
}
async function buildRunCandidate({ runId, manifest, results }) {
  const executions = results.map(candidateExecution);
  const candidate = {
    schema_id: "dd-eval/run-candidate@2",
    run_id: runId,
    manifest_sha256: hashJson(manifest),
    outcome: results.every((result) => result.state === "candidate_ready") ? "complete" : "incomplete",
    executions,
    frozen_at: now()
  };
  candidate.immutable_hash = hashJson(candidate);
  return candidate;
}
async function freezeRunCandidate({ root, runId, manifest, results }) {
  const candidate = await buildRunCandidate({ runId, manifest, results });
  const file = path.join(root, "candidate.json"); await writeJsonAtomic(file, candidate);
  return { file, ...candidate };
}
function candidateMatches(candidate, manifest, results) {
  if (candidate?.schema_id !== "dd-eval/run-candidate@2" || candidate.run_id !== manifest.run_id || candidate.manifest_sha256 !== hashJson(manifest)) return false;
  const expected = results.map(candidateExecution).sort((left, right) => left.execution.localeCompare(right.execution));
  const actual = (candidate.executions ?? []).map(value => ({ ...value, execution_operation_id: value.execution_operation_id ?? null })).sort((left, right) => left.execution.localeCompare(right.execution));
  return hashJson(actual) === hashJson(expected);
}
export async function frozenCandidate({ root, manifest, results }) {
  return withRunnerLock(`${root}.candidate`, () => freezeCandidateLocked({ root, manifest, results }));
}
async function freezeCandidateLocked({ root, manifest, results }) {
  const file = path.join(root, "candidate.json");
  if (await exists(file)) {
    const candidate = await readJson(file);
    const { immutable_hash, ...content } = candidate;
    if (hashJson(content) !== immutable_hash) fail("candidate checksum mismatch", "candidate_revision_invalid");
    if (!candidateMatches(candidate, manifest, results)) {
      const retained = [candidate];
      const revisionsRoot = path.join(root, "candidate-revisions");
      const revisions = await readdir(revisionsRoot).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const name of revisions.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
        const revision = await readJson(path.join(revisionsRoot, name));
        const { immutable_hash, ...content } = revision;
        if (hashJson(content) !== immutable_hash || name !== `${immutable_hash}.json`) fail("candidate revision checksum mismatch", "candidate_revision_invalid");
        if (candidateMatches(revision, manifest, results)) return { candidate: { file: path.join(revisionsRoot, name), ...revision }, created: false, revised: true };
        retained.push(revision);
      }
      const events = await readEvents(path.join(root, "events.jsonl"));
      if (!events.some(event => ["dev.dd.eval.operation.completed", "dev.dd.eval.operation.failed"].includes(event.type) && /:launch:(recover:|reconcile$)/.test(event.data?.operation_id ?? ""))) fail("existing candidate does not match completed executions", "candidate_revision_unauthorized");
      const next = await buildRunCandidate({ runId: manifest.run_id, manifest, results });
      const lastPublished = events.findLast(event => event.type === "dev.dd.eval.candidate.frozen" && retained.some(value => value.immutable_hash === event.data?.candidate_sha256));
      next.parent_candidate_sha256 = lastPublished?.data.candidate_sha256 ?? retained.sort((a, b) => a.frozen_at.localeCompare(b.frozen_at)).at(-1).immutable_hash;
      delete next.immutable_hash;
      next.immutable_hash = hashJson(next);
      const revision = path.join(root, "candidate-revisions", `${next.immutable_hash}.json`);
      await mkdir(path.dirname(revision), { recursive: true });
      if (!(await exists(revision))) await writeJsonAtomic(revision, next);
      return { candidate: { file: revision, ...next }, created: true, revised: true };
    }
    return { candidate: { file, ...candidate }, created: false };
  }
  return { candidate: await freezeRunCandidate({ root, runId: manifest.run_id, manifest, results }), created: true };
}
export async function appendRunEventOnce({ eventsFile, runId, type, data, guard = () => true }) {
  const comparable = value => { const copy = { ...(value ?? {}) }; delete copy.sequence; return canonicalJson(copy); };
  return Boolean(await appendEvent(eventsFile, { source: "dd-eval://runner", runId, traceId: runId, type, data,
    beforeAppend: prior => guard(prior) && !prior.some(event => event.type === type && comparable(event.data) === comparable(data)) }));
}
export function storedExecutionResults(events, manifest) {
  return manifest.executions.map(execution => executionState(events, manifest.run_id, execution).result);
}
export function runResultRevision(events, manifest) {
  return hashJson(manifest.executions.map(execution => {
    const { operation_id, generation, result } = executionState(events, manifest.run_id, execution);
    return { operation_id, generation, result };
  }));
}
async function attachModelAttribution(root, manifest, results) {
  for (const result of results) {
    result.attempt ??= path.join(root, "executions", result.execution);
    result.requested_profile = manifest.subject_profile ?? null;
    try { result.model_attribution = modelAttribution(await readModelObservations(path.join(result.attempt, "drivers", "subject.events.jsonl"))); }
    catch (error) { result.model_attribution = { ...modelAttribution([]), observation_error: errorRecord(error) }; }
  }
  return results;
}
async function finalizeRunProjection({ root, manifest, loaded, results, permits = null }) {
  const eventsFile = path.join(root, "events.jsonl");
  let projectedEvents = await readEvents(eventsFile);
  results = storedExecutionResults(projectedEvents, manifest);
  for (const result of results) {
    if (result.state !== "failed" || result.recovery?.recovery_id) continue;
    result.attempt ??= path.join(root, "executions", result.execution);
    await enrichFailureEvidence({ root, manifest, result, events: projectedEvents });
    result.recovery = await captureRecoveryEvidence({ root, manifest, result });
    if (!result.recovery?.recovery_id && !result.incomplete_evidence) result.incomplete_evidence = { snapshot: null, missing: "Waiting for the managed controller's sealed recovery capture", failure: result.recovery?.capture_error ?? null };
    const execution = manifest.executions.find(item => item.id === result.execution);
    const origin = executionState(projectedEvents, manifest.run_id, execution).operation_id;
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: result.execution, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: { ...result, execution_operation_id: origin } });
  }
  projectedEvents = await readEvents(eventsFile);
  results = storedExecutionResults(projectedEvents, manifest);
  const resultHash = runResultRevision(projectedEvents, manifest);
  await attachModelAttribution(root, manifest, results);
  const completed = results.every((result) => result.state === "candidate_ready");
  const unsettled = await Promise.all(results.filter(result => result.state === "failed").map(async result => {
    const attempt = path.join(root, "executions", result.execution);
    if (await exists(path.join(attempt, "managed-runtime.json"))) {
      try {
        const managed = await readJson(path.join(attempt, "managed-runtime.json"));
        if (managed.project_root !== path.join(attempt, "project") || managed.runtime_root !== path.join(attempt, "dd-flow-home") || typeof managed.run_id !== "string") return true;
        const status = await commandJson(runtimeBin(managed.runtime_root), ["run", "control", "status", "--run", managed.run_id, "--project-root", managed.project_root], { cwd: managed.project_root, env: evalRuntimeEnv(managed.runtime_root, manifest) });
        return status.settled !== true;
      } catch { return true; }
    }
    const dir = path.join(root, "executions", result.execution, "drivers", "daemon");
    if (!(await exists(path.join(dir, "daemon.json")))) return Boolean(result.session_id);
    const state = await readJson(path.join(dir, "daemon.json"));
    if (!(state.cleanup?.settled === true || (state.shutdown_state === "clean" && state.active_tree !== true))) return true;
    try { await assertDaemonReplaceable(dir); return false; } catch { return true; }
  }));
  const pending = unsettled.some(Boolean) || results.some((result) => ["awaiting_provider", "awaiting_native_children", "cancelling"].includes(result.state));
  const state = completed ? "completed" : pending ? "awaiting_provider" : results.some((result) => result.state === "failed") ? "completed_with_failures" : results.some((result) => result.state === "cancelled") ? "cancelled" : "awaiting_provider";
  let candidate = null; let judge = null;
  if (!pending) {
    const frozen = await withRunnerLock(`${root}.candidate`, () => withRunnerLock(eventsFile, async () => {
      if (runResultRevision(await readEvents(eventsFile), manifest) !== resultHash) return null;
      return freezeCandidateLocked({ root, manifest, results });
    }));
    if (!frozen) return finalizeRunProjection({ root, manifest, loaded, results, permits });
    candidate = frozen.candidate;
    if (frozen.created) await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.candidate.frozen", data: { state: candidate.outcome, candidate_sha256: candidate.immutable_hash, candidate_file: candidate.file } });
    if (manifest.profile?.judge?.enabled) {
      const file = candidate.file === path.join(root, "candidate.json")
        ? path.join(root, "judge", "result.json")
        : path.join(root, "judge", "revisions", candidate.immutable_hash, "result.json");
      try { judge = await (await exists(file) ? readJson(file) : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: manifest.profile.judge.profile_id, candidate, permits, results })); }
      catch (error) { if (error.code !== "operation_in_progress") throw error; }
      if (judge) await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.final_judge.completed", data: { judge_profile: judge.profile_id, judge_session_id: judge.session_id, candidate_sha256: judge.candidate_sha256 } });
    }
  }
  if (state !== "awaiting_provider") await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed", guard: prior => runResultRevision(prior, manifest) === resultHash, data: { state, result_revision: resultHash, executions: results.map((result) => ({ execution: result.execution, state: result.state })) } });
  const judgeStatus = judge ? "completed" : !manifest.profile?.judge?.enabled ? "not_requested" : pending ? "not_run_incomplete_execution" : "in_progress";
  const published = await withRunnerLock(eventsFile, async () => {
    const reportEvents = await readEvents(eventsFile);
    if (runResultRevision(reportEvents, manifest) !== resultHash) return null;
    const projection = reduceEvents(reportEvents);
    const report = buildReport({ root, manifest, state, results, candidate, judge, judgeStatus, events: reportEvents });
    await mkdir(path.join(root, "reports"), { recursive: true });
    await writeJsonAtomic(path.join(root, "reports", "report.json"), report);
    const models = results.map(result => `- ${result.execution}: requested ${result.requested_profile?.model ?? "unknown"}; observed ${result.model_attribution.models.join(", ") || "unknown"}; transitions ${result.model_attribution.transitions.length}; ${result.model_attribution.observation_completeness}`).join("\n");
    await writeFile(path.join(root, "reports", "report.md"), `# Eval ${manifest.run_id}\n\n- State: ${state}\n- Run validity: ${report.run_validity}\n- Final Judge: ${judge?.profile_id ?? judgeStatus}\n\n${models}\n`);
    await writeJsonAtomic(path.join(root, "state.json"), projection);
    return { state, candidate, judge, report, results };
  });
  return published ?? finalizeRunProjection({ root, manifest, loaded, results, permits });
}

function classifyInterruption(error) {
  const record = errorRecord(error); const text = `${record.code} ${record.message}`.toLowerCase();
  if (/quota|insufficient.?credit|billing|usage limit/.test(text)) return { category: "provider_quota", source: "provider", retryable: true, error: record };
  if (/rate.?limit|too many requests|\b429\b/.test(text)) return { category: "provider_rate_limit", source: "provider", retryable: true, error: record };
  if (/auth|unauthori[sz]ed|forbidden|account/.test(text)) return { category: "provider_account", source: "provider", retryable: false, error: record };
  if (/network|connection|econn|timeout|unavailable|\b5\d\d\b/.test(text)) return { category: "provider_unavailable", source: "provider", retryable: true, error: record };
  return { category: "execution_failure", source: "runner", retryable: Boolean(record.retryable), error: record };
}

async function enrichFailureEvidence({ root, manifest, result, events }) {
  const attempt = result.attempt ?? path.join(root, "executions", result.execution);
  const projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  result.session_id ??= subjectSessionFor(events, result.execution);
  result.boundaries ??= events.filter(event => event.executionid === result.execution && event.type === "dev.dd.eval.stage.boundary_captured").map(event => event.data);
  result.hitl ??= await hitlEvidenceFor(events, result.execution);
  try {
    result.lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: result.stage, runId: result.run_id ?? null });
    result.run_id = result.lifecycle.run_id;
    result.stage = latestObservedStage(result.lifecycle.status, result.stage);
    const prepared = preparedContextFor(events, result.execution, result.stage);
    for (const field of ["runtime_engine", "semantic_package_sha256", "context_slice_sha256", "materialized_context_sha256", "started_at"]) result[field] ??= prepared?.[field] ?? null;
    result.launcher ??= prepared?.launcher_file ?? null;
    result.statistics ??= await collectFlowStatistics({ projectRoot, runtimeRoot, runId: result.run_id });
  } catch (error) { result.evidence_error = errorRecord(error); }
}

export async function captureRecoveryEvidence({ root, manifest, result }) {
  const attempt = result.attempt ?? path.join(root, "executions", result.execution);
  const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
  const interruption = classifyInterruption({ code: result.code, message: result.error, retryable: result.retryable, details: result.details });
  if (result.recovery_parent_id) interruption.recovery_parent_id = result.recovery_parent_id;
  // Attribution does not grant replay permission. A terminal failure may be
  // captured only through the engine's RUN/settled-writer barrier; resuming it
  // still requires the explicit recovery operation and exact captured identity.
  if (result.state !== "failed" || isObservationLoss(result) || !(await exists(projectRoot)) || !(await exists(runtimeRoot))) return null;
  try {
    if (await exists(path.join(attempt, "managed-runtime.json"))) {
      const managed = await readJson(path.join(attempt, "managed-runtime.json"));
      if (managed.schema_id !== "dd-eval/managed-runtime@1" || managed.project_root !== projectRoot || managed.runtime_root !== runtimeRoot || typeof managed.run_id !== "string") fail("Managed execution scope is inconsistent", "execution_scope_invalid");
      const status = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
      const control = status.control;
      if (status.settled !== true || control?.current !== true || control.admission !== "sealed" || !control.capture_path || !control.recovery_id || !control.control_id) fail("Managed recovery capture is not yet sealed by its controller", "recovery_capture_pending");
      const manifestFile = path.join(control.capture_path, "snapshot.json");
      const snapshot = await readJson(manifestFile);
      return { recovery_id: control.recovery_id, control_id: control.control_id, generation: control.generation, run_id: managed.run_id, interruption,
        settlement: control.settlement, snapshot: control.capture_path, manifest: manifestFile, manifest_sha256: sha256(await readFile(manifestFile)), consistency: snapshot.consistency ?? "sealed_writer_barrier_required" };
    }
    fail("Recovery capture requires a managed execution binding", "execution_migration_required");
  } catch (error) {
    return { unavailable: true, interruption, capture_error: errorRecord(error) };
  }
}
export function entryLauncher({ stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile }) {
  // A Codex/ACP shell action does not inherit variables from an earlier action.
  // Give the engine its own immutable launcher identity on the very first
  // lifecycle call; generated later commands then retain that exact launcher.
  const prefix = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} DD_FLOW_BIN=${JSON.stringify(runtimeBin(runtimeRoot))} ${JSON.stringify(runtimeBin(runtimeRoot))} stage start`;
  // The context filename already carries stage and execution identity. Keeping
  // the response beside that exact file prevents later stages from replacing
  // evidence needed to reconstruct an earlier launch.
  const responseFile = `${contextFile}.stage-start-response.json`;
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

async function hitlEvidenceFor(events, executionId) {
  const matched = events.filter((event) => event.executionid === executionId && event.type === "dev.dd.eval.hitl.matched");
  return await Promise.all(matched.map(async ({ data }) => {
    const receipt = await readJson(data.receipt_file); const packet = await readJson(path.join(path.dirname(data.receipt_file), "packet.json")); const answer = await readFile(data.answer_file, "utf8");
    return { stage: data.stage, round: data.round, pause_id: data.pause_id, question: packet.question, interaction_fixture_sha256: receipt.interaction_fixture_sha256, judge_profile: receipt.profile_id, judge_session_id: receipt.session_id, receipt_file: data.receipt_file, verdict: receipt.verdict, response_ids: data.response_ids, delimiter: "dd-eval/hitl-response-delimiter@1", answer, answer_file: data.answer_file, answer_sha256: data.answer_sha256 };
  }));
}

export function executionEvidence(result) {
  const started = typeof result.started_at === "string" ? Date.parse(result.started_at) : Number.NaN;
  const finished = typeof result.finished_at === "string" ? Date.parse(result.finished_at) : Number.NaN;
  return {
    execution: result.execution,
    state: result.state,
    failure: result.state === "failed" ? { code: result.code ?? "execution_failed", message: result.error ?? null, attribution: failureAttribution(result.code) } : null,
    stage: result.stage ?? null,
    run_id: result.run_id ?? null,
    subject_session_id: result.session_id ?? null,
    stage_boundaries: result.boundaries ?? [],
    lifecycle: result.lifecycle ?? null,
    candidate: result.candidate ?? null,
    incomplete_evidence: result.incomplete_evidence ?? null,
    recovery: result.recovery ?? null,
    usage: result.statistics?.usage ?? null,
    observation: result.statistics?.observation ?? null,
    requested_profile: result.requested_profile ?? null,
    model_attribution: result.model_attribution ?? result.statistics?.observation?.model_attribution ?? modelAttribution([]),
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

export function failureAttribution(code) {
  if (isInfrastructureFailure(code)) return "evaluation_infrastructure";
  // Reconciliation proves that observations and flow state disagree. It does
  // not, by itself, say whether a harness, controller, or subject caused it.
  if (["fanout_reconciliation_required", "unbound_native_delegation_detected", "lifecycle_caller_mismatch"].includes(code)) return "undetermined";
  // A new code is evidence of an outcome, not proof of who caused it. Keep
  // attribution open unless the runner itself has a direct subject rule.
  if (["unexpected_hitl", "required_hitl_missing", "incomplete_subject_turn"].includes(code)) return "subject";
  return "undetermined";
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

export function recoveryHistory(events, manifest, results) {
  const operations = reduceEvents(events).operations;
  return manifest.executions.map(({ id }) => {
    const launchId = `${manifest.run_id}:${id}:launch`;
    const segments = Object.values(operations).filter(operation => operation.id === launchId || operation.id.startsWith(`${launchId}:recover:`)).map(operation => {
      const receipts = events.filter(event => event.data?.operation_id === operation.id);
      const start = receipts.find(event => event.type === "dev.dd.eval.operation.started");
      const end = receipts.find(event => ["dev.dd.eval.operation.completed", "dev.dd.eval.operation.failed", "dev.dd.eval.operation.cancelled"].includes(event.type));
      const duration = start && end ? Date.parse(end.time) - Date.parse(start.time) : NaN;
      return {
        operation_id: operation.id, recovery_id: operation.id === launchId ? null : operation.id.slice(`${launchId}:recover:`.length).replace(/:retry:\d+$/, ""),
        outcome: operation.terminal ?? "unknown", started_at: start?.time ?? null, finished_at: end?.time ?? null,
        wall_clock_ms: Number.isFinite(duration) && duration >= 0 ? duration : null,
        observation_lost: Boolean(operation.observation_lost), receipt_ids: receipts.map(event => event.id)
      };
    });
    const interruptions = new Map();
    for (const event of events.filter(event => event.executionid === id && event.type === "dev.dd.eval.execution.failed")) {
      // Capture adds evidence to the same failed segment; it is not another failure.
      const segment = event.data.execution_operation_id ?? (event.data.recovery_parent_id ? `${launchId}:recover:${event.data.recovery_parent_id}` : launchId);
      const prior = interruptions.get(segment);
      interruptions.set(segment, { operation_id: segment, observed_at: prior?.observed_at ?? event.time, code: prior?.code ?? event.data.code ?? "execution_failed", recovery_id: event.data.recovery?.recovery_id ?? prior?.recovery_id ?? null, receipt_ids: [...(prior?.receipt_ids ?? []), event.id] });
    }
    const latest = results.find(result => result.execution === id);
    const resumed = segments.some(segment => segment.recovery_id !== null) || Boolean(latest?.recovery?.resumed_at);
    const interrupted = interruptions.size > 0 || segments.some(segment => segment.outcome === "failed" || segment.observation_lost) || latest?.state === "failed";
    return {
      execution: id, reliability: latest?.state === "failed" ? "interrupted" : resumed || interrupted ? latest?.state === "candidate_ready" ? "recovered" : "interrupted" : "uninterrupted",
      recovery_count: segments.filter(segment => segment.recovery_id !== null).length,
      interruptions: [...interruptions.values()], segments,
      usage_accounting: { policy: "latest_run_measurement_only", collected_at: latest?.statistics?.collected_at ?? null, usage: latest?.statistics?.usage ?? null, note: "RUN measurements already cover physical session segments; do not sum successive snapshots or add parent-inclusive native counters." },
      timing: { active_ms: null, provider_wait_ms: null, coverage: "segment_wall_clock_only" }
    };
  });
}

function buildReport({ root, manifest, state, results, candidate = null, judge = null, judgeStatus = "not_requested", events = [] }) {
  const executions = results.map(executionEvidence);
  const history = recoveryHistory(events, manifest, results);
  const runValidity = results.some((result) => result.state === "failed" && isInfrastructureFailure(result.code)) ? "invalid_infrastructure_flow" : "valid";
  return {
    schema_id: "dd-eval/report@2", run_id: manifest.run_id, state, run_validity: runValidity,
    reliability: history.some(item => item.reliability === "interrupted") ? "interrupted" : history.some(item => item.reliability === "recovered") ? "recovered" : "uninterrupted",
    recovery_count: history.reduce((total, item) => total + item.recovery_count, 0),
    execution_history: history,
    recoveries: results.filter(result => result.recovery).map(result => ({ execution: result.execution, ...result.recovery })),
    manifest: path.join(root, "manifest.json"),
    executions,
    observability: {
      sessions: executions.map(({ execution, subject_session_id, sessions }) => ({ execution, subject_session_id, reported_sessions: sessions })),
      usage: executions.map(({ execution, usage }) => ({ execution, usage })),
      models: executions.map(({ execution, requested_profile, model_attribution }) => ({ execution, requested_profile, ...model_attribution })),
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
  fail("Judge cannot resolve its harness configuration without an execution runtime", "judge_runtime_missing");
}
function finalJudgeScope(manifest, results) {
  if (manifest.profile?.selection?.e2e === true) return "e2e";
  const scopes = (results ?? []).map((result) => result?.stage).filter((stage) => typeof stage === "string");
  if (scopes.length === 1) return scopes[0];
  fail("Final Judge requires one selected assessment scope", "judge_scope_missing");
}
export function finalJudgePrompt({ assessmentFile, candidateFile, evidenceFile, scope, assessment }) {
  const rubric = assessment?.scopes?.[scope];
  if (!isObject(rubric) || !Array.isArray(rubric.outcome) || !Array.isArray(rubric.flow)) fail(`Final Judge cannot render unknown assessment scope: ${scope}`, "judge_scope_missing");
  const field = (id) => `{"id":${JSON.stringify(id)},"score":0,"not_applicable":false,"rationale":"brief evidence-backed rationale","evidence":["artifact path or receipt"]}`;
  const contract = `{"schema_id":"dd-eval/judge-result@2","scope":${JSON.stringify(scope)},"run_validity":"valid","outcome":[${rubric.outcome.map((criterion) => field(criterion.id)).join(",")}],"flow":[${rubric.flow.map((criterion) => field(criterion.id)).join(",")}],"findings":[{"id":"finding-001","severity":"material","summary":"material defect","evidence":["artifact path"],"impact":"why it matters"}],"golden":{"covered":[],"missed":[],"alternatives":[],"novel":[]},"conclusion":"brief evidence-backed conclusion"}`;
  return `You are the final SDLC eval Judge. Read ${JSON.stringify(assessmentFile)}, ${JSON.stringify(candidateFile)} and ${JSON.stringify(evidenceFile)}. Use only those packets and artifact paths explicitly referenced by them. Do not search or read another eval, RUN, project, workspace, or host path; a source id or description inside a packet is not permission to derive an unlisted filesystem path. Evaluate outcome quality first, then flow reliability; treat efficiency as evidence only. Do not reward cosmetic bureaucracy or unnecessary complexity. If candidate.outcome is incomplete, assess only evidence-backed work that actually ran; mark criteria requiring an unreached stage as not_applicable rather than 0 or pass. Keep tooling/provider failures distinct from model behavior in findings. A failure code or attribution alone does not prove a subject violation: inspect the preserved launcher, controller duties and native observations. In particular, obeying a launcher instruction to stop for runner dispatch is not an abandonment of dispatch. Reply with exactly one JSON object — no Markdown. Its exact shape is ${contract}. Use scope ${JSON.stringify(scope)} exactly; keep every listed outcome and flow id exactly once. Use integer scores 0–4 for applicable criteria, or score null with not_applicable true. An empty findings array is valid; the displayed finding is only a shape example.`;
}
async function finalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null }) {
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  const operationId = `${runId}:judge:${candidate.immutable_hash}`;
  const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId, traceId: runId,
    operationId, operation: "final_judge", action: () => performFinalJudge({ root, runId, manifest, loaded, profileId, candidate, permits, results }) });
  return receipt.result ?? receipt;
}
async function performFinalJudge({ root, runId, manifest, loaded, profileId, candidate: suppliedCandidate = null, permits = null, results = null }) {
  assertEvalAdmission(await readEvents(path.join(root, "events.jsonl")));
  if (typeof profileId !== "string") fail("judge.profile_id is required when judgment is enabled", "judge_profile_missing");
  const profile = (await loadProfile(profileId)).value;
  const candidate = suppliedCandidate ?? await readJson(path.join(root, "candidate.json"));
  if (candidate.schema_id !== "dd-eval/run-candidate@2" || candidate.run_id !== runId || typeof candidate.immutable_hash !== "string") fail("Final Judge requires a frozen run candidate", "candidate_checkpoint_missing");
  const judgeRoot = candidate.file === path.join(root, "candidate.json") || !candidate.file
    ? path.join(root, "judge")
    : path.join(root, "judge", "revisions", candidate.immutable_hash);
  await mkdir(judgeRoot, { recursive: true });
  const candidateFile = path.join(judgeRoot, "candidate.json"); const assessmentFile = path.join(judgeRoot, "assessment.json"); const evidenceFile = path.join(judgeRoot, "evidence.json");
  const evidence = results ? buildEvidencePacket({ manifest, results, candidate }) : await readJson(path.join(root, "reports", "report.json"));
  await writeJsonAtomic(candidateFile, candidate); await writeJsonAtomic(assessmentFile, loaded.assessment); await writeJsonAtomic(evidenceFile, evidence);
  const scope = finalJudgeScope(manifest, results);
  const prompt = finalJudgePrompt({ assessmentFile, candidateFile, evidenceFile, scope, assessment: loaded.assessment });
  const journal = path.join(judgeRoot, "events.jsonl"); const daemonState = path.join(judgeRoot, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(judgeRoot, "codex-home"); const roots = await judgeHarnessRoots(root, results); const judgeEnv = judgeRuntimeEnvironment({ runtimeRoot: roots.runtimeRoot, daemonState, profile, codexHome, budget: executionBudget(runId, manifest.profile), resourceHome: manifest.runtime_resource_home });
  if (profile.harness === "codex-desktop") await initializeCodexHome({ ...roots, codexHome });
  await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", judgeRoot, "--journal", journal], { cwd: judgeRoot, env: judgeEnv });
  try {
    const created = await providerTurn(profile, ["session", "create", ...daemonArgs, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits); const sessionId = created.provider_session_id ?? created.session_id;
    if (typeof sessionId !== "string") fail("Final Judge did not create a Session", "driver_protocol");
    const response = await providerTurn(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", judgeRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", prompt, "--journal", journal], { cwd: judgeRoot, env: judgeEnv }, permits);
    const result = validateJudgeResult(parseJsonResponse(response.assistant_text, "Final Judge"), loaded.assessment); const receipt = { schema_id: "dd-eval/final-judge-receipt@1", profile_id: profile.id, session_id: sessionId, candidate_sha256: candidate.immutable_hash, evidence_sha256: hashJson(evidence), result, created_at: now() };
    await writeJsonAtomic(path.join(judgeRoot, "result.json"), receipt);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId, type: "dev.dd.eval.final_judge.result_ready", data: { operation_id: `${runId}:judge:${candidate.immutable_hash}`, result: receipt } });
    return receipt;
  } finally {
    await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: judgeRoot, env: judgeEnv });
  }
}
async function interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile, projectRoot, runtimeRoot, contextFile = null, permits = null, evalRunId = null, controller = null, resourceHome = null }) {
  const judgeId = runProfile.value.interaction_judge?.profile_id;
  if (typeof judgeId !== "string") fail(`HITL at ${stage} requires interaction_judge.profile_id`, "interaction_judge_missing");
  const profile = (await loadProfile(judgeId)).value; const root = path.join(attempt, "interaction-judge", `${stage}-${randomUUID().slice(0, 8)}`); await mkdir(root, { recursive: true });
  const subjectContext = contextFile ? await readJson(contextFile) : null;
  const packet = { schema_id: "dd-eval/interaction-judge-packet@1", stage, subject_context: subjectContext, question, responses: fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer })), required_result: { schema_id: "dd-eval/hitl-match@1", status: "matched|unmatched", classification: "covered_by_canonical_response|fixture_gap|unnecessary_question|out_of_scope|ambiguous", response_ids: [], covered_questions: [], uncovered_questions: [], rationale: "brief evidence-based explanation" } };
  const packetFile = path.join(root, "packet.json"); await writeJsonAtomic(packetFile, packet);
  const prompt = `You are the Interaction Judge. Read ${JSON.stringify(packetFile)}. Decompose the Subject's text into its atomic material decisions; explanations, options and recommendations are context, not separate questions. Match semantic meaning regardless of wording, order or grouping. Select only existing response IDs whose exact answer explicitly states or logically entails a listed covered decision. Descriptors help identify applicability but never add answer content. Never author, paraphrase or strengthen a response. Return matched only when every material decision is covered; then response_ids identify the answers to send. If some decisions are covered and some are not, return unmatched, list both covered_questions and uncovered_questions, and retain response_ids as evidence for the covered subset. If nothing is covered, response_ids must be empty. Reply with exactly one JSON object conforming to the required dd-eval/hitl-match@1 shape in the packet.`;
  const journal = path.join(root, "events.jsonl"); const daemonState = path.join(root, "daemon"); const daemonArgs = ["--state-dir", daemonState]; const codexHome = path.join(root, "codex-home"); const judgeEnv = judgeRuntimeEnvironment({ runtimeRoot, daemonState, profile, codexHome, budget: evalRunId ? executionBudget(evalRunId, runProfile.value) : null, controller, resourceHome });
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
  if (verdict.response_ids.some((id) => typeof id !== "string" || !id) || new Set(verdict.response_ids).size !== verdict.response_ids.length || verdict.covered_questions.some((value) => typeof value !== "string" || !value) || new Set(verdict.covered_questions).size !== verdict.covered_questions.length || verdict.uncovered_questions.some((value) => typeof value !== "string" || !value) || new Set(verdict.uncovered_questions).size !== verdict.uncovered_questions.length || verdict.covered_questions.some((value) => verdict.uncovered_questions.includes(value))) fail("Interaction Judge returned malformed arrays", "judge_result_invalid");
  const known = new Set(fixture.responses.map((response) => response.id)); if (verdict.response_ids.some((id) => !known.has(id))) fail("Interaction Judge selected an unknown response", "judge_result_invalid");
  const matched = verdict.status === "matched";
  if (matched !== (verdict.classification === "covered_by_canonical_response") || (matched && (verdict.response_ids.length === 0 || verdict.covered_questions.length === 0 || verdict.uncovered_questions.length > 0)) || (!matched && (verdict.uncovered_questions.length === 0 || (verdict.response_ids.length > 0 && verdict.covered_questions.length === 0)))) fail("Interaction Judge returned an inconsistent verdict", "judge_result_invalid");
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
async function acceptedHitlAnswer({ answerFile, answerSha256 = null }) {
  let bytes;
  try { bytes = await readFile(answerFile); }
  catch (error) { fail(`accepted HITL answer bytes are unavailable: ${error.message}`, "hitl_answer_missing"); }
  const actual = sha256(bytes);
  if (answerSha256 && actual !== answerSha256) {
    fail("accepted HITL answer checksum no longer matches its receipt", "hitl_answer_checksum_mismatch");
  }
  return { bytes, text: bytes.toString("utf8"), sha256: actual };
}
function heredocDelimiter(answer) {
  let delimiter = "DD_FLOW_ACCEPTED_HITL_ANSWER";
  while (answer.split("\n").includes(delimiter)) delimiter = `${delimiter}_X`;
  return delimiter;
}
async function resumePrompt({ lifecycle, stage, question, answerFile, answerSha256 = null, runtimeRoot, projectRoot }) {
  const record = stageRecord(lifecycle, stage); const pause = record?.pause;
  if (!pause?.work_id) fail("paused Stage has no resumable Work", "hitl_pause_invalid");
  const accepted = await acceptedHitlAnswer({ answerFile, answerSha256 });
  const delimiter = heredocDelimiter(accepted.text);
  const command = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} ${JSON.stringify(runtimeBin(runtimeRoot))} stage resume ${lifecycle.run_id} --stage ${stage} --work ${pause.work_id} --answer-stdin --project-root ${JSON.stringify(projectRoot)} --json <<'${delimiter}'\n${accepted.text}${accepted.text.endsWith("\n") ? "" : "\n"}${delimiter}`;
  return ["A canonical user answer has been approved for the registered pause.", `The accepted bytes have checksum ${accepted.sha256}. Your first technical action must be this exact standalone lifecycle command. Its heredoc contains those verified bytes; do not replace it with a file, a pipe, quoted text, or another command:`, `\`\`\`sh\n${command}\n\`\`\``, "Then follow the continuation returned by dd-flow. Continue the same Stage and Work; do not call stage start or repeat preparation.", "", `<user_question>\n${question}\n</user_question>`, ""].join("\n");
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
  // A confirmed native process exit is an interruption, not a business
  // verdict. Its partial effects still require the normal recovery barrier.
  if (["agy_terminal_result_missing", "opencode_provider_failed"].includes(code)) return true;
  return ["driver_failed", "model_observation_storage_failed", "agy_provider_failed", "agy_provider_quota_exhausted", "agy_provider_rate_limited", "agy_provider_account", "provider_rate_limited", "provider_quota_exhausted", "profile_drift", "profile_mismatch", "agy_profile_drift", "profile_integrity_violation", "session_identity_mismatch", "foreign_session", "droid_child_identity_invalid", "droid_hook_identity_invalid", "droid_turn_identity_mismatch", "hook_preflight_failed", "flow_reconciliation_failed", "snapshot_missing", "snapshot_checksum_mismatch", "snapshot_restore_mismatch", "driver_protocol", "subagent_capacity_unqualified", "interaction_fixture_invalid", "interaction_fixture_checksum_mismatch", "interaction_fixture_gap", "interaction_judge_ambiguous", "interaction_judge_missing", "judge_result_invalid", "subject_liveness_timeout"].includes(code);
}

export async function settleExecutionDaemon(stop, failure) {
  try { return await stop(false); }
  catch (error) {
    // Only the owned daemon can establish that its tree needs cancellation.
    // A lost observation never authorizes interrupting an unknown outcome.
    if (error?.code !== "tree_not_settled" || !failure || isObservationLoss(failure)) throw error;
    return await stop(true);
  }
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

export function executionBudget(runId, profile) {
  const limits = {};
  for (const [name, limit] of Object.entries(profile.concurrency.per_harness ?? {})) {
    const harness = harnessConfigKey(name);
    if (Object.hasOwn(limits, harness) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1024) fail("Experiment has invalid or duplicate harness limits", "runtime_budget_invalid");
    limits[harness] = limit;
  }
  return { schema_id: "dd-flow/runtime-budget@1", scope_id: runId, per_harness: Object.fromEntries(Object.entries(limits).sort(([left], [right]) => left.localeCompare(right))) };
}

export function judgeRuntimeEnvironment({ runtimeRoot, daemonState, profile, codexHome, budget = null, controller = null, resourceHome = null }) {
  if (budget && (typeof resourceHome !== "string" || !path.isAbsolute(resourceHome))) fail("EVAL Judge requires its retained resource registry home", "runtime_scope_identity_missing");
  resourceHome ??= runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME;
  const owner = { schema_id: "dd-flow/runtime-owner@1", owner_id: `judge:${sha256(daemonState)}`, role: "judge", operation_id: `judge:${sha256(daemonState)}`, state_dir: daemonState,
    dd_flow_home: runtimeRoot, dd_flow_bin: runtimeBin(runtimeRoot), resource_home: resourceHome,
    ...(controller?.project_id && controller?.run_id ? { project_id: controller.project_id, run_id: controller.run_id } : {}), ...(budget ? { budget } : {}) };
  return { DD_FLOW_CONFIG_HOME: runtimeRoot, DD_FLOW_RESOURCE_HOME: resourceHome, DD_FLOW_RUNTIME_OWNER: JSON.stringify(owner), ...(profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {}) };
}

export function boundedPromptArgs(profile, args) {
  return profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && !args.includes("--timeout")
    ? [...args, "--timeout", "600"]
    : args;
}

function argValue(args, name) { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] ?? null; }

export async function executionDispatchBarrier(operation) {
  const context = operationContext.getStore();
  if (!context?.executionId || !context.eventsFile || !context.operationId?.includes(":launch")) return;
  const manifest = await readJson(path.join(path.dirname(context.eventsFile), "manifest.json"));
  const execution = manifest.executions.find(item => item.id === context.executionId);
  if (!execution) fail("dispatch has no execution identity", "execution_generation_stale");
  await appendEvent(context.eventsFile, { source: "dd-eval://runner", runId: context.runId, executionId: context.executionId,
    type: "dev.dd.eval.execution.dispatch_accepted", data: { operation, execution_operation_id: context.operationId },
    beforeAppend: events => assertEvalExecutionDispatch(events, manifest.run_id, execution, context.operationId) });
}

export function assertEvalExecutionDispatch(events, runId, execution, operationId) {
  assertEvalAdmission(events);
  return assertExecutionDispatch(executionState(events, runId, execution), operationId);
}

function assertEvalAdmission(events) {
  const state = reduceEvents(events);
  if (state.cancellation) fail("EVAL cancellation no longer admits productive dispatch", "runtime_scope_stopped");
  if (state.control) fail("EVAL operator control blocks productive dispatch", "managed_run_controlled");
}

async function cancelExecutionTree({ root, manifest, execution, profile, sessionId, launchUnwound = false }) {
  const attempt = path.join(root, "executions", execution.id), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  const managedFile = path.join(attempt, "managed-runtime.json");
  if (await exists(managedFile)) {
    const managed = await readJson(managedFile);
    if (managed.schema_id !== "dd-eval/managed-runtime@1" || managed.project_root !== projectRoot || managed.runtime_root !== runtimeRoot || typeof managed.run_id !== "string") fail("Managed execution scope is inconsistent", "execution_scope_invalid");
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    return await commandJson(runtimeBin(runtimeRoot), ["run", "control", "stop", "--run", managed.run_id, "--project-root", projectRoot, "--request-id", `eval-stop:${sha256(current.operation_id)}`, "--wait-ms", "1000"], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
  }
  const stateDir = path.join(attempt, "drivers", "daemon");
  if (!(await exists(path.join(stateDir, "daemon.json")))) {
    const current = executionState(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution);
    return { settled: !current.started || launchUnwound, reason: !current.started || launchUnwound ? "no_native_daemon_dispatched" : "native_creation_unconfirmed" };
  }
  return cancelOwnedDaemon({ stateDir, projectRoot, sessionId,
    stop: () => callDriver(profile, ["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) }) });
}

async function providerTurn(profile, args, options, permits = null) {
  const invoke = async () => {
    const bounded = boundedPromptArgs(profile, args);
    // The harness owns productive-turn liveness.  A second runner watchdog
    // races native child events and can convert host sleep into a false abort.
    const receipt = await callDriver(profile, bounded, options);
    if (args[0] === "session" && args[1] === "prompt") await executionDispatchBarrier("continuation");
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

export function nativeChildFanoutPrompt({ stage, works, capacity }) {
  const assignments = works.map((work) => {
    const workId = String(work.work_id ?? "");
    const startCommand = String(work.start_command ?? "");
    if (!workId || !startCommand) fail("ready fan-out Work lacks its exact start command", "fanout_contract_invalid");
    const contextRule = work.launch_policy === "fresh_agent_required"
      ? "Start the child with an empty, non-inherited context if this harness supports that mode. A new Session ID alone is not evidence of an empty context."
      : "Use the current Session context only when the harness launch mechanism explicitly inherits it.";
    return [
      `Work ${workId}:`,
      "Give one direct native child agent this exact instruction:",
      contextRule,
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
  if (raw === "settled_by_root") return "settled_by_root";
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

/** A provider receipt is cumulative; only IDs absent at stage entry are new. */
export function nativeChildrenSince(children, baseline) {
  const known = baseline instanceof Set ? baseline : new Set(baseline ?? []);
  return children.filter((child) => !known.has(child.session_id));
}

async function stopCapacityDaemon({ profile, daemon, projectRoot }) {
  try { return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env }); }
  catch (error) {
    if (error?.code !== "tree_not_settled") throw error;
    return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs, "--cancel-tree"], { cwd: projectRoot, env: daemon.env });
  }
}

async function provisionCapacityCodexHome(codexHome) {
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const sourceHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? ".", ".codex");
  const sourceAuth = path.join(sourceHome, "auth.json");
  if (await exists(sourceAuth)) await symlink(sourceAuth, path.join(codexHome, "auth.json"));
}

export async function capacityCodexChildren(codexHome, rootSessionId) {
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
    const sessionId = records.find(record => record.type === "session_meta")?.payload?.id;
    // The leaf's last native lifecycle event is the completion authority.
    const lastLifecycle = records.filter(record => record.type === "event_msg" && ["task_started", "task_complete", "turn_aborted"].includes(record.payload?.type)).at(-1);
    if (sessionId && lastLifecycle?.payload.type === "task_complete") completed.add(sessionId);
    for (const record of records) {
      const meta = record?.type === "session_meta" ? record.payload : null;
      if (meta?.parent_thread_id === rootSessionId && typeof meta.id === "string") children.set(meta.id, { session_id: meta.id, parent_session_id: rootSessionId, status: "unknown", source: "codex.session_meta" });
    }
  }
  for (const child of children.values()) if (completed.has(child.session_id)) child.status = "completed";
  return [...children.values()].sort((left, right) => left.session_id.localeCompare(right.session_id));
}

/**
 * A bounded technical qualification. It intentionally creates no RUN, Stage
 * or Work: the only measured fact is an accepted native direct-child ID.
 */
export async function harnessCapacityCheck({ profileId, maximum, projectRoot = process.cwd(), writeProfile = true, runtimeRoot: suppliedRuntimeRoot = null }) {
  const max = Number(maximum);
  if (!Number.isInteger(max) || max < 1) fail("--max must be a positive integer", "capacity_check_invalid");
  const loaded = await loadProfile(profileId); const profile = loaded.value;
  const project = path.resolve(projectRoot);
  const root = path.join(evalHome(), "conformance", "native-subagents", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const attempt = path.join(root, "attempt");
  await mkdir(attempt, { recursive: true });
  const runtimeRoot = suppliedRuntimeRoot ?? path.join(root, "runtime");
  if (!path.isAbsolute(runtimeRoot)) fail("Qualification runtime must be absolute", "harness_config_missing");
  if (suppliedRuntimeRoot === null) await provisionRuntimeEngine(project, runtimeRoot);
  // Qualification is intentionally outside dd-flow. Supplying a flow home
  // would activate adapter lifecycle forwarding and turn a technical child
  // probe into a synthetic RUN/Work interaction.
  const journal = path.join(attempt, "events.jsonl"); const daemon = { daemonArgs: ["--state-dir", path.join(attempt, "daemon"), ...(["grok-acp", "antigravity-cli", "opencode-server", "droid-cli", "droid"].includes(profile.harness) ? ["--no-flow"] : [])], journal, env: { DD_FLOW_CONFIG_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) } };
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

export async function evalPreflight({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile);
  const loaded = await loadCase(runProfile.value.case_id);
  const definition = await committedDefinitionIdentity();
  const executions = selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage });
  if (selectionNeedsEntryPack(executions)) fail("This preflight prepares E2E; focused entries use fixtures validate", "selection_invalid");
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions, runProfile });
  const profile = (await loadProfile(runProfile.value.subject.profile_id)).value;
  assertProfileCapacity(profile, executions);
  const root = path.join(evalHome(), "conformance", "e2e-preflight", `${Date.now()}-${randomUUID().slice(0, 8)}`, runProfile.value.id);
  const projectRoot = path.join(root, "project"); const runtimeRoot = path.join(root, "dd-flow-home");
  await mkdir(root, { recursive: true });
  try {
    const restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint });
    const engine = await provisionRuntimeEngine(projectRoot, runtimeRoot);
    await assertCheckpointEngine(loaded.inputCheckpoint, engine);
    const baselineAdmission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot: path.join(root, "baseline-admission"), checkpoint: loaded.inputCheckpoint });
    await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const executionRoutingFile = path.join(root, "execution-routing.json");
    await writeJsonAtomic(executionRoutingFile, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
    const prepared = await prepareManagedRun({ bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, slug: "eval-preflight", executionRoutingFile });
    const blueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
    await materializeTaskInput(loaded.root, blueprint, "specify", projectRoot);
    const contextFile = path.join(root, "stage-context.json");
    await materializeStageSlice({ blueprint, stage: "specify", roots: { project: projectRoot, workspace: restored.workspace_root }, output: contextFile });
    const profiles = [...new Set([profile.id, runProfile.value.interaction_judge?.profile_id, ...(runProfile.value.judge?.enabled ? [runProfile.value.judge.profile_id] : [])].filter(Boolean))];
    const doctors = [];
    for (const id of profiles) {
      const checked = (await loadProfile(id)).value;
      const doctor = await callDriver(checked, ["doctor", "--cwd", projectRoot, "--model", checked.model, "--reasoning", checked.reasoning], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
      assertObservedProfile(doctor, checked, "preflight doctor"); doctors.push({ profile_id: id, doctor });
    }
    const launcher = entryLauncher({ stage: "specify", entry: { snapshot: { run_id: null } }, projectRoot, runtimeRoot, contextFile, contextSha256: sha256(await readFile(contextFile)), profile });
    await writeFile(path.join(root, "launcher.md"), `${launcher}\n`);
    const receipt = { ok: true, root, definition, profile_file: runProfile.file, input_checkpoint: loaded.inputCheckpoint.value, engine: runtimeEngineIdentity(engine), baseline_admission: baselineAdmission, prepared_run: prepared, doctors, provider_sessions_created: 0 };
    await writeJsonAtomic(path.join(root, "receipt.json"), receipt); return receipt;
  } catch (error) { await writeJsonAtomic(path.join(root, "receipt.json"), { ok: false, root, definition, error: errorRecord(error) }); throw error; }
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

export async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored", executions: suppliedExecutions = null }) {
  const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(evalHome(), "runs", runId); const events = path.join(root, "events.jsonl");
  await mkdir(path.dirname(root), { recursive: true });
  // Initial and resumed observers share ownership through final projection;
  // publishing a manifest must not expose an unlocked, launchable queue.
  return withRunnerLock(`${path.resolve(root)}.lifecycle`, async () => {
    assertEvalAdmission(await readEvents(events));
    const executions = suppliedExecutions ?? selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage });
    const entryPackManifest = validated ? { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(await readFile(validated.entry_pack)) } : null;
    const interactionFixtures = await interactionFixtureManifest(loaded.root, executions);
    // Operator control must survive an update/removal of the ambient CLI.
    // Reuse the same isolated engine installation as productive RUNs, without
    // requiring provider configuration for this control-only home.
    const controlRoot = path.join(path.resolve(root), "control-runtime");
    await provisionRuntimeEngine(loaded.root, controlRoot, { controlOnly: true });
    const controlBin = runtimeBin(controlRoot);
    const manifest = { schema_id: "dd-eval/runner-manifest@1", runtime_resource_home: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), kind, run_id: runId, case_id: loaded.value.id, entry_pack: entryPackManifest, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, ...(definition ? { definition } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions };
    manifest.runtime_control_bin = controlBin;
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
    const pack = validated ? validateEntryPack(await readJson(validated.entry_pack), loaded.value.id) : null; const packRoot = validated ? path.dirname(validated.entry_pack) : null;
    const directBlueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
    const focusedBlueprint = pack ? validateStageBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context"))) : null;
    await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile });
    const permits = createHarnessPermits(runProfile);
    let stopAfterInfrastructureFailure = false;
    const results = await mapLimited(manifest.executions, runProfile.value.concurrency.global, execution => launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : focusedBlueprint, pack, packRoot, permits, onInfrastructureFailure: () => { stopAfterInfrastructureFailure = true; } }), () => !stopAfterInfrastructureFailure);
    const finalized = await finalizeRunProjection({ root, manifest, loaded, results, permits });
    return { run_id: runId, root, executions: finalized.results, ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
  });
}

export async function launchEvalExecution({ root, manifest, execution, loaded, blueprint, pack = null, packRoot = null, permits, onInfrastructureFailure = () => {} }) {
    const runId = manifest.run_id, events = path.join(root, "events.jsonl"), home = evalHome(), profile = manifest.subject_profile, runProfile = { value: manifest.profile };
    const opId = `${runId}:${execution.id}:launch`;
    const startedAt = now();
    // Keep the evidence variables in the execution scope.  The operation
    // wrapper deliberately rethrows so that this catch can write a durable
    // failed-execution record; declarations inside its callback are otherwise
    // unavailable precisely on an early terminal failure.
    const failureAttempt = path.join(root, "executions", execution.id);
    let attempt = failureAttempt;
    let projectRoot = null;
    let runtimeRoot = null;
    let lifecycle = null;
    const boundaries = [];
    const hitl = [];
    let launcher = null;
    let prompted = null;
    try {
      const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, beforeStart: latest => assertEvalExecutionDispatch(latest, runId, execution, opId), action: async () => {
      await executionDispatchBarrier("execution.prepare");
      if (await exists(failureAttempt)) fail("Unstarted execution already has preparation artifacts; reconcile their ownership before launch", "execution_preparation_unproven");
      attempt = failureAttempt; projectRoot = path.join(attempt, "project"); runtimeRoot = path.join(attempt, "dd-flow-home");
      const baselineScope = { bin: manifest.runtime_control_bin, home: runtimeRoot, resourceHome: manifest.runtime_resource_home, budget: executionBudget(runId, runProfile.value), operationId: opId };
      const executionRoutingFile = path.join(attempt, "execution-routing.json");
      await writeJsonAtomic(executionRoutingFile, { schema_id: "dd-flow/execution-routing@1", execution: runProfile.value.subject.execution ?? { agent_profile_id: profile.id } });
      const profileHome = process.env.DD_FLOW_CONFIG_HOME ?? process.env.DD_FLOW_HOME ?? path.join(process.env.HOME ?? ".", ".dd-flow");
      const profileRoot = path.join(profileHome, "agent-profiles");
      if (!await exists(profileRoot)) fail("Managed execution requires full agent profiles in the CLI configuration home", "agent_profile_missing");
      await mkdir(runtimeRoot, { recursive: true });
      await cp(profileRoot, path.join(runtimeRoot, "agent-profiles"), { recursive: true, force: true });
      let entry; let restored;
      if (execution.mode === "e2e") {
        restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint });
        restored.engine = await provisionRuntimeEngine(projectRoot, runtimeRoot);
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine);
        restored.baseline_admission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint, beforeCommand: id => executionDispatchBarrier(`baseline:${id}`), runtimeScope: baselineScope });
        await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        entry = { snapshot: { kind: "bootstrap", run_id: null } };
      } else {
        const entryFile = contained(packRoot, pack.entries[execution.entry], "entry"); entry = validateStageEntry(await readJson(entryFile), execution.stage);
        restored = await restoreStageSnapshot({ home, entry, stage: execution.stage, projectRoot, runtimeRoot, executionRoutingFile });
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine);
        const baselineProject = path.join(attempt, "baseline-project");
        await prepareE2EInput({ projectRoot: baselineProject, inputCheckpoint: loaded.inputCheckpoint });
        restored.baseline_admission = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot: baselineProject, outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint, beforeCommand: id => executionDispatchBarrier(`baseline:${id}`), runtimeScope: baselineScope });
      }
      if (!restored.run_id) {
        const prepared = await prepareManagedRun({ bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, slug: "eval-subject", executionRoutingFile });
        restored = { ...restored, run_id: prepared.run_id, run_home: prepared.run_root };
      }
      await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: restored.run_id, project_root: projectRoot, runtime_root: runtimeRoot, runtime_budget: executionBudget(runId, runProfile.value) });
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      const managedResult = await observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, boundaries, hitl,
        onProgress: value => { lifecycle = value.lifecycle ?? lifecycle; prompted = value.driver ?? prompted; } });
      lifecycle = managedResult.lifecycle; prompted = managedResult.driver;
      return managedResult;
      }});
      const completed = result.result ?? result;
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, execution_operation_id: opId, result: completed } });
      return completed;
    } catch (error) {
      // An RPC timeout only says this client did not observe the native
      // operation. Keep the execution recoverable and let runner resume
      // reconcile the durable RUN/session rather than manufacturing a failed
      // flow result or sending a duplicate prompt.
      const observedEvents = await readEvents(events);
      const decision = executionState(observedEvents, runId, execution);
      if (["operation_in_progress", "operation_observation_lost", "operation_terminal"].includes(error?.code)) return decision.result;
      if (decision.cancellation?.effective || decision.operation_id !== opId) {
        if (decision.operation_id === opId && !decision.cancellation.settled) {
          let receipt;
          try { receipt = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: subjectSessionFor(observedEvents, execution.id), launchUnwound: true }); }
          catch (cleanupError) { receipt = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
            type: receipt.settled ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancelling",
            data: { execution: execution.id, execution_operation_id: opId, execution_generation: decision.generation, receipt } });
        }
        return executionState(await readEvents(events), runId, execution).result;
      }
      if (error?.code === "managed_run_controlled") {
        // The RUN arbiter owns drain/settlement. Do not strengthen a pause to
        // cancellation, fail its operation, capture a candidate, or start Judge.
        const suspended = { execution: execution.id, state: "awaiting_provider", ...errorRecord(error), control: error.details?.controller ?? null, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
          type: "dev.dd.eval.execution.awaiting_provider", data: { ...suspended, execution_operation_id: opId } });
        return suspended;
      }
      let failureStatistics = null;
      const failedRunId = error.lifecycle?.run_id ?? lifecycle?.run_id ?? null;
      if (typeof failedRunId === "string" && typeof projectRoot === "string" && typeof runtimeRoot === "string") {
        try {
          failureStatistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: failedRunId });
          failureStatistics.observation = await observationSummary(path.join(attempt, "drivers", "subject.events.jsonl"));
        } catch (statisticsError) {
          failureStatistics = { unavailable: true, error: errorRecord(statisticsError) };
        }
      }
      const evidence = { attempt: failureAttempt, session_id: subjectSessionFor(observedEvents, execution.id), stage: observedEvents.findLast((event) => event.executionid === execution.id && event.type === "dev.dd.eval.execution.context_prepared")?.data?.stage ?? execution.stage, lifecycle: error.lifecycle ?? lifecycle ?? null, boundaries, hitl, launcher, driver: prompted ?? null, statistics: failureStatistics };
      if (!isObservationLoss(error) && await exists(path.join(attempt, "managed-runtime.json"))) {
        try { evidence.control = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: evidence.session_id, launchUnwound: true }); }
        catch (cleanupError) { evidence.control = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
      }
      if (error?.code === "subject_liveness_timeout") {
        const failure = { ...evidence, execution: execution.id, state: "failed", code: "subject_liveness_timeout", error: error instanceof Error ? error.message : String(error), details: error.details ?? null, started_at: startedAt, finished_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure, execution_operation_id: opId } });
        if (runProfile.value.failure_policy.stop_run_on_infrastructure_error) onInfrastructureFailure();
        return failure;
      }
      if (isObservationLoss(error)) {
        const uncertain = { execution: execution.id, state: "awaiting_provider", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), started_at: startedAt, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.awaiting_provider", data: uncertain });
        return uncertain;
      }
      const failure = { ...evidence, execution: execution.id, state: "failed", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), ...(error?.hitl ? { hitl: [...hitl, error.hitl] } : {}), started_at: startedAt, finished_at: now() };
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure, execution_operation_id: opId } });
      if (runProfile.value.failure_policy.stop_run_on_infrastructure_error && isInfrastructureFailure(failure.code)) onInfrastructureFailure();
      return failure;
    }
}

export async function evalJudge({ evalRoot, profileId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const selected = profileId ?? manifest.profile?.judge?.profile_id;
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results });
  if (!finalized.candidate) return { root, status: "awaiting_provider", reason: "subject execution is still active or unknown" };
  const resultFile = finalized.candidate.file === path.join(root, "candidate.json")
    ? path.join(root, "judge", "result.json")
    : path.join(root, "judge", "revisions", finalized.candidate.immutable_hash, "result.json");
  const receipt = await (await exists(resultFile)
    ? readJson(resultFile)
    : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate: finalized.candidate, results }));
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
export function needsAttemptContext(record, prepared) {
  const number = /^try-(\d+)$/.exec(record?.attempt ?? "");
  return Boolean(number && Number(number[1]) > 1 && prepared?.attempt !== record.attempt);
}
function latestObservedStage(status, fallback) {
  const records = status?.index?.stage_runs ?? status?.run?.index?.stage_runs ?? [];
  const known = Array.isArray(records) ? records.filter((record) => stageSet.has(record?.stage)) : [];
  const unfinished = known.filter((record) => record.status !== "done").sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0];
  if (unfinished?.stage) return unfinished.stage;
  return known.sort((a, b) => stages.indexOf(b.stage) - stages.indexOf(a.stage))[0]?.stage ?? fallback;
}

export async function prepareRecoveryDelivery({ attempt, recovery, stage, sessionId, harness, paused = false, completed = false, orchestration = null }) {
  if (orchestration && (orchestration.kind !== "work_fanout" || orchestration.stage !== stage)) fail("recovery fan-out does not identify the retained stage", "fanout_contract_invalid");
  const coordinatorOnly = !paused && !completed && orchestration?.kind === "work_fanout";
  const prompt = recoveryPrompt({ recovery, stage, paused, completed, coordinatorOnly });
  const packet = {
    schema_id: "dd-eval/recovery-delivery@1", recovery_id: recovery.recovery_id,
    run_id: recovery.run_id, generation: recovery.generation, stage, paused, ...(completed ? { completed: true } : {}), ...(coordinatorOnly ? { coordinator_only: true } : {}),
    session: { harness_id: harness, session_id: sessionId },
    operation_id: `${recovery.recovery_id}:root-prompt:${sha256(`${harness}\0${sessionId}`)}`,
    prompt, prompt_sha256: sha256(prompt),
  };
  const file = path.join(attempt, "recovery-packets", `${sha256(recovery.recovery_id)}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  return withRunnerLock(file, async () => {
    if (await exists(file)) {
      const saved = await readJson(file);
      if (hashJson(saved) !== hashJson(packet)) fail("recovery delivery is already pinned to different packet bytes or identity", "recovery_delivery_conflict");
      return { file, packet: saved, sha256: hashJson(saved), reused: true };
    }
    await writeJsonAtomic(file, packet);
    return { file, packet, sha256: hashJson(packet), reused: false };
  });
}
export function recoveryPrompt({ recovery, stage, paused = false, completed = false, coordinatorOnly = false }) {
  if (typeof recovery.accept_command !== "string" || !recovery.accept_command.trim()) fail("recovery has no engine-generated acceptance command", "recovery_acceptance_missing");
  return [
    "This is an explicit interrupted-evaluation recovery, not a new assignment.",
    `Recovery identity: ${recovery.recovery_id} (generation ${recovery.generation ?? "unknown"}).`,
    "Your first technical action must be this exact standalone command in this same native Session. Do not perform any other tool call or work mutation until it succeeds:",
    recovery.accept_command,
    "If acceptance fails, stop and report the failure. Do not replace the identity arguments or start another Session.",
    `The provider interruption was classified as ${recovery.interruption?.category ?? "unknown"}.`,
    "Before productive work in an authorized continuation, inspect the retained RUN state, Work receipts, logs and partial artifacts. Preserve accepted work.",
    "Do not rerun a previously issued side-effecting command merely because its response was interrupted. Reconcile it first; only retry through the exact dd-flow lifecycle command when the prior outcome permits it.",
    completed ? `The ${stage} stage already completed. After acceptance, return control to the runner for the next legal stage. Preserve the completed Work and its result; do not repeat it or launch its successor yourself.`
      : paused ? "This Work is paused for a user answer. After acceptance, stop without productive work, inventing an answer, or issuing stage resume."
      : coordinatorOnly ? "After acceptance, stop this Turn immediately and return control to the runner. This is only the fan-out coordinator acknowledgement, not a child assignment. Do not perform or finish child Work, change files, run checks, cancel Work, or launch or message a child in this Turn. The runner will reconcile the current Work graph and send the next authoritative continuation with exact current Work start commands and unchanged launch policies."
      : `Continue only the unresolved ${stage} operation. Do not create undeclared Work or change requirements.`,
  ].join("\n");
}
export function assertTerminalReconciliation(execution, currentStage, record) {
  if (currentStage !== execution.terminal_stage || record?.status !== "done") fail(`execution ${execution.id} has not durably completed ${execution.terminal_stage}`, "reconcile_not_terminal");
}

async function observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, controllerId = null, terminalOnly = false, boundaries = [], hitl = [], onProgress = () => {}, beforeObserve = async () => {} }) {
  const contexts = new Map(), hitlRounds = new Map();
  const beforeDispatch = async () => {
    if (terminalOnly) fail("Terminal reconciliation cannot dispatch new work", "reconcile_not_terminal");
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.dispatch_accepted",
      data: { operation: "managed_flow", execution_operation_id: opId },
      beforeAppend: prior => assertEvalExecutionDispatch(prior, runId, execution, opId) });
  };
  const retained = (await readEvents(events)).filter(event => event.executionid === execution.id);
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.execution.context_prepared")) {
    const bytes = await readFile(data.context_file);
    if (sha256(bytes) !== data.materialized_context_sha256) fail("Retained context bytes changed", "context_checksum_mismatch");
    contexts.set(`${data.stage}:${data.attempt ?? 1}`, { stage: data.stage, file: data.context_file, sha256: data.materialized_context_sha256,
      slice: { semantic_package_sha256: data.semantic_package_sha256, context_slice_sha256: data.context_slice_sha256 } });
  }
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.hitl.matched")) {
    await acceptedHitlAnswer({ answerFile: data.answer_file, answerSha256: data.answer_sha256 });
    hitlRounds.set(data.stage, Math.max(hitlRounds.get(data.stage) ?? 0, data.round));
  }
  if (controllerId) hitl.push(...await hitlEvidenceFor(retained, execution.id));
  const contextFor = async (stage, attemptNumber = null) => {
    const key = `${stage}:${attemptNumber ?? 1}`;
    if (contexts.has(key)) return contexts.get(key);
    await beforeDispatch();
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", restored.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    if (["plan", "plan-review", "code", "code-review"].includes(stage) && selected?.delegation?.mode === "native") {
      const coordinator = selected.coordinator;
      if (!coordinator || harnessConfigKey(coordinator.harness) !== harnessConfigKey(profile.harness) || coordinator.model !== profile.model || coordinator.reasoning !== profile.reasoning || !Number.isInteger(profile.subagent_capacity) || profile.subagent_capacity < 1) fail("Native capacity is not qualified for the selected stage profile", "subagent_capacity_unqualified");
      await recordFanoutCapacity({ projectRoot, runtimeRoot, runId: restored.run_id, availableSlots: profile.subagent_capacity });
    }
    const roots = restoredRoots({ status }, projectRoot, runtimeRoot);
    await materializeTaskInput(loaded.root, blueprint, stage, projectRoot);
    const file = path.join(attempt, "stage-context", `${stage}-${attemptNumber ?? 1}.json`);
    const slice = await materializeStageSlice({ blueprint, stage, roots, output: file });
    const reference = { stage, file, sha256: sha256(await readFile(file)), slice };
    contexts.set(key, reference);
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.context_prepared", data: { stage, attempt: attemptNumber, context_file: file, runtime_engine: runtimeEngineIdentity(restored.engine), baseline_admission: restored.baseline_admission ?? null, semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: reference.sha256 } });
    return reference;
  };
  const first = contexts.get(`${execution.stage}:1`) ?? (controllerId ? fail("Retained initial stage context is missing", "stage_context_missing") : await contextFor(execution.stage));
  const packageFile = path.join(attempt, "managed-context.json");
  if (!controllerId) await writeJsonAtomic(packageFile, { schema_id: "dd-flow/managed-context@1", stages: { [execution.stage]: { file: first.file, sha256: first.sha256 } } });
  const answerFor = async (record, _run, controller) => {
    const stage = record.stage, pause = record.pause;
    const prior = (await readEvents(events)).find(event => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data.pause_id === pause.id);
    if (prior) {
      await acceptedHitlAnswer({ answerFile: prior.data.answer_file, answerSha256: prior.data.answer_sha256 });
      hitlRounds.set(stage, Math.max(hitlRounds.get(stage) ?? 0, prior.data.round));
      return prior.data.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, stage, fixtureHash(manifest, stage));
    const rounds = hitlRounds.get(stage) ?? 0;
    if (fixture.mode === "forbidden" || rounds >= fixture.max_rounds || !pause.question_path) fail(`unexpected HITL at ${stage}`, "unexpected_hitl");
    const question = await readFile(pause.question_path, "utf8");
    const reference = [...contexts.values()].findLast(item => item.stage === stage) ?? await contextFor(stage, record.attempt);
    await beforeDispatch();
    const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: reference.file, permits, evalRunId: runId, controller, resourceHome: manifest.runtime_resource_home });
    const exchange = resolveHitlJudgment({ fixture, judgment, question, stage });
    const round = rounds + 1, answerFile = await materializeHitlAnswer({ attempt, stage, round, answer: exchange.answer });
    hitlRounds.set(stage, round);
    hitl.push({ ...exchange, round, pause_id: pause.id, answer_file: answerFile, answer_sha256: sha256(exchange.answer) });
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.hitl.matched", data: { stage, round, pause_id: pause.id, response_ids: exchange.response_ids, judge_session_id: judgment.session_id, receipt_file: judgment.receipt_file, answer_file: answerFile, answer_sha256: sha256(exchange.answer) } });
    return answerFile;
  };
  await beforeObserve();
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: evalRuntimeEnv(runtimeRoot, manifest, { DD_FLOW_RUNTIME_BUDGET: JSON.stringify(executionBudget(runId, runProfile.value)) }), projectRoot, runId: restored.run_id,
    requestId: `eval:${sha256(`${runId}:${execution.id}:launch`)}`, controllerId, contextFile: packageFile, stopAfter: execution.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor,
    beforeDispatch,
    onEvent: async (event, controller) => {
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.controller.event", data: { controller_id: controller.controller_id, ...event }, beforeAppend: prior => !prior.some(item => item.executionid === execution.id && item.type === "dev.dd.eval.controller.event" && item.data.controller_id === controller.controller_id && item.data.sequence === event.sequence) });
      if (event.type === "session_created") await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.subject.session_created", data: { ...event.data, controller_id: controller.controller_id }, beforeAppend: prior => !prior.some(item => item.executionid === execution.id && item.type === "dev.dd.eval.subject.session_created" && item.data.controller_id === controller.controller_id && item.data.session_id === event.data.session_id) });
      if (event.type === "boundary_captured") {
        const fixture = await interactionFixture(loaded.root, event.data.stage, fixtureHash(manifest, event.data.stage));
        if (fixture.mode === "required" && (hitlRounds.get(event.data.stage) ?? 0) === 0) fail(`required HITL did not occur at ${event.data.stage}`, "required_hitl_missing");
        boundaries.push(event.data);
      }
    }
  });
  onProgress({ driver: observed });
  const currentStage = observed.controller.stage;
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: currentStage, runId: restored.run_id });
  onProgress({ lifecycle });
  if (currentStage !== execution.terminal_stage || lifecycle.stage_status !== "done" || observed.boundary?.stage !== currentStage) fail("Managed controller did not capture the requested completed boundary", "stage_boundary_incomplete");
  const candidate = observed.boundary;
  if (sha256(await readFile(candidate.manifest)) !== candidate.manifest_sha256) fail("Managed boundary manifest changed after publication", "snapshot_checksum_mismatch");
  const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: restored.run_id });
  statistics.controller = observed.controller;
  await writeJsonAtomic(path.join(attempt, "statistics.json"), statistics);
  return { execution: execution.id, stage: currentStage, attempt, session_id: observed.controller.sessions.at(-1)?.session_id ?? null, run_id: restored.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256, launcher: null, driver: observed, lifecycle, boundaries, hitl, candidate, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
}

export async function recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery = null, terminalOnly = false }) {
  const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
  if (await exists(path.join(attempt, "managed-runtime.json"))) {
    const managed = await readJson(path.join(attempt, "managed-runtime.json"));
    if (managed.schema_id !== "dd-eval/managed-runtime@1" || managed.project_root !== projectRoot || managed.runtime_root !== runtimeRoot || typeof managed.run_id !== "string") fail("Managed execution scope is inconsistent", "execution_scope_invalid");
    const env = evalRuntimeEnv(runtimeRoot, manifest);
    const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env });
    const engine = resolved.selection?.selected;
    await assertCheckpointEngine(loaded.inputCheckpoint, engine);
    const prepared = preparedContextFor(events, execution.id, execution.stage);
    await verifyBaselineAdmission({ reference: prepared.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint });
    const opId = `${manifest.run_id}:${execution.id}:launch`;
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
    const controller = status.controller;
    if (!controller?.controller_id || controller.run_id !== managed.run_id || controller.request_id !== `eval:${sha256(opId)}`) fail("Retained managed controller does not match the execution launch", "controller_owner_changed");
    if (managed.runtime_budget && (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile)) || hashJson(controller.runtime_budget) !== hashJson(managed.runtime_budget))) fail("Retained controller has different experiment concurrency limits", "runtime_budget_conflict");
    const dispatchId = operationContext.getStore()?.operationId ?? executionState(events, manifest.run_id, execution).operation_id;
    let beforeObserve;
    if (recovery) {
      if (terminalOnly) fail("Terminal reconciliation cannot resume a controller", "reconcile_not_terminal");
      if (recovery.run_id !== managed.run_id || typeof recovery.control_id !== "string" || sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("Managed recovery evidence does not match its retained RUN", "recovery_evidence_invalid");
      const controlStatus = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
      const control = controlStatus.control;
      const resumeRequestId = `eval-resume:${sha256(dispatchId)}`;
      if (control?.current !== true || control.control_id !== recovery.control_id || control.recovery_id !== recovery.recovery_id || control.capture_path !== recovery.snapshot) fail("Managed recovery source is stale", "recovery_source_stale");
      if (controlStatus.settled !== true && controlStatus.resume_operation?.request_id !== resumeRequestId) fail("Managed controller is not settled for this recovery", "recovery_capture_pending");
      beforeObserve = async () => {
        assertEvalExecutionDispatch(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution, dispatchId);
        const resumed = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "resume", "--run", managed.run_id, "--project-root", projectRoot, "--from", recovery.control_id, "--request-id", resumeRequestId, "--wait-ms", "1000"], { cwd: projectRoot, env });
        if (resumed.controller?.controller_id !== controller.controller_id) fail("Managed recovery changed its logical controller", "controller_owner_changed");
      };
    }
    if (terminalOnly && !["completed", "stop_target_reached"].includes(controller.status)) fail("Managed controller has no completed capture", "reconcile_not_terminal");
    const runProfile = { value: manifest.profile };
    const result = await observeManagedExecution({ events: path.join(root, "events.jsonl"), runId: manifest.run_id, manifest, execution, loaded, blueprint, profile, runProfile,
      permits: createHarnessPermits(runProfile), attempt, projectRoot, runtimeRoot, restored: { run_id: managed.run_id, engine, baseline_admission: prepared.baseline_admission },
      opId: dispatchId, startedAt: prepared.started_at, controllerId: controller.controller_id, terminalOnly, beforeObserve });
    return { ...result, recovered: true };
  }
  fail("Recovery requires a managed execution binding", "execution_migration_required");
}

async function runnerBlueprint(manifest, loaded) {
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id);
    return validateStageBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")));
  }
  return validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
}

export async function runnerRecover({ evalRoot, executionId = null, fromRecoveryId }) {
  return withRunnerLock(`${path.resolve(evalRoot)}.lifecycle`, () => recoverLocked({ evalRoot, executionId, fromRecoveryId }));
}

export async function runnerRecoveryInspect({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json"));
  const events = await readEvents(path.join(root, "events.jsonl"));
  const results = storedExecutionResults(events, manifest).filter(result => !executionId || result.execution === executionId);
  if (executionId && results.length === 0) fail(`unknown execution ${executionId}`, "execution_not_found");
  return { root, run_id: manifest.run_id, executions: results.map(result => ({ execution: result.execution, state: result.state, recovery: result.recovery ?? null, operations: Object.entries(reduceEvents(events).operations).filter(([id]) => id.startsWith(`${manifest.run_id}:${result.execution}:launch:recover:`)).map(([operation_id, operation]) => ({ operation_id, ...operation })) })) };
}

export function selectRecoverySource(results, executionId, fromRecoveryId) {
  if (typeof fromRecoveryId !== "string" || !fromRecoveryId.trim()) fail("recovery requires an explicit --from recovery id", "recovery_source_required");
  const matching = results.filter(result => (!executionId || result.execution === executionId) && result.recovery?.recovery_id === fromRecoveryId);
  if (matching.length !== 1) fail("recovery source is missing, superseded, or ambiguous; inspect the latest recovery evidence", "recovery_source_stale");
  const result = matching[0];
  if (result.state !== "failed" && !result.recovery.resumed_at) fail("the selected recovery source is not eligible for continuation", "recovery_not_eligible");
  return result;
}

/** A failed recovery attempt must not erase the sealed interruption that it
 * tried to continue.  The latest execution projection may contain only the
 * retry failure, so recover the explicit source from its append-only event. */
export function recoverySourceFromEvents(events, executionId, fromRecoveryId) {
  // Repeated capture receipts are evidence for one source. Only the latest
  // recovery per execution is eligible; an explicit old ID cannot bypass it.
  const latest = new Map();
  const retired = new Map();
  for (const event of events) {
    if (event.type !== "dev.dd.eval.execution.failed" || !event.data?.recovery?.recovery_id || (executionId && event.executionid !== executionId)) continue;
    const prior = latest.get(event.executionid)?.recovery;
    const incoming = event.data.recovery;
    const oldIds = retired.get(event.executionid) ?? new Set();
    if (oldIds.has(incoming.recovery_id) || (Number.isInteger(prior?.generation) && Number.isInteger(incoming.generation) && incoming.generation < prior.generation)) continue;
    if (prior && prior.recovery_id !== incoming.recovery_id) oldIds.add(prior.recovery_id);
    retired.set(event.executionid, oldIds);
    latest.set(event.executionid, event.data);
  }
  const matches = [...latest.values()].filter(data => data.recovery.recovery_id === fromRecoveryId);
  return matches.length === 1 ? matches[0] : null;
}

export function recoveryOperationId(events, runId, executionId, recoveryId) {
  const base = `${runId}:${executionId}:launch:recover:${recoveryId}`;
  const operations = reduceEvents(events).operations;
  const retries = Object.keys(operations).filter(id => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:retry:[1-9][0-9]*$`).test(id));
  const number = Math.max(0, ...retries.map(id => Number(id.slice(`${base}:retry:`.length))));
  const latest = number ? `${base}:retry:${number}` : base;
  if (!operations[latest]?.terminal || operations[latest].terminal === "completed") return latest;
  return `${base}:retry:${number + 1}`;
}

async function assertRetainedRunDefinition(manifest, loaded) {
  if (loaded.inputCheckpoint.sha256 !== manifest.input_checkpoint?.sha256) fail("recovery input checkpoint changed", "runner_definition_drift");
  if (!/^[a-f0-9]{40}$/.test(manifest.definition?.commit ?? "")) fail("recovery requires the original committed eval definition", "runner_definition_drift");
  const caseDifference = await commandText("git", ["-C", repoRoot, "diff", manifest.definition.commit, "--", path.relative(repoRoot, loaded.root)], { cwd: repoRoot });
  if (caseDifference.trim()) fail("recovery case files differ from their original committed definition", "runner_definition_drift");
  if (manifest.entry_pack && sha256(await readFile(contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"))) !== manifest.entry_pack.sha256) fail("recovery entry pack checksum mismatch", "runner_definition_drift");
}

async function recoverLocked({ evalRoot, executionId = null, fromRecoveryId }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile; const blueprint = await runnerBlueprint(manifest, loaded);
  await assertRetainedRunDefinition(manifest, loaded);
  const recoveryEvents = await readEvents(path.join(root, "events.jsonl"));
  const prior = storedExecutionResults(recoveryEvents, manifest);
  const source = recoverySourceFromEvents(recoveryEvents, executionId, fromRecoveryId)
    ?? selectRecoverySource(prior, executionId, fromRecoveryId);
  const selected = manifest.executions.filter((execution) => execution.id === source.execution && source.state === "failed");
  if (selected.length === 0 && source.recovery?.resumed_at) return { root, run_id: manifest.run_id, reused: true, executions: prior };
  if (selected.length === 0) fail(executionId ? `execution ${executionId} has no failed recovery candidate` : "no failed execution is eligible for recovery", "recovery_not_eligible");
  const recovered = [];
  for (const execution of selected) {
    // Keep using the explicit sealed source. `prior` reflects the newest
    // projection and can instead be a failed retry with only recovery_parent_id.
    const failure = source.execution === execution.id ? source : prior.find((result) => result.execution === execution.id);
    const recovery = failure?.recovery;
    if (typeof recovery?.recovery_id !== "string" || typeof recovery?.run_id !== "string") fail(`execution ${execution.id} has no sealed recovery evidence`, "recovery_evidence_missing");
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    if (sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("recovery manifest checksum mismatch", "recovery_evidence_invalid");
    const managed = await exists(path.join(attempt, "managed-runtime.json"));
    if (!managed) fail("Legacy execution requires explicit migration before productive recovery", "execution_migration_required");
    const operationId = recoveryOperationId(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution.id, recovery.recovery_id);
    let receipt;
    try { receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.recover`, action: async () => {
      const events = await readEvents(path.join(root, "events.jsonl"));
      const result = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery });
      return { ...result, recovery: { ...recovery, resumed_at: now() } };
    } }); } catch (error) {
      if (isObservationLoss(error) || ["managed_run_controlled", "operation_in_progress", "operation_terminal"].includes(error.code)) throw error;
      const failed = { execution: execution.id, execution_operation_id: operationId, attempt, stage: execution.stage, state: "failed", code: error.code ?? "execution_failed", error: error.message, recovery_parent_id: recovery.recovery_id };
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: failed });
      receipt = { result: failed };
    }
    recovered.push(receipt.result ?? receipt);
  }
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, run_id: manifest.run_id, executions: finalized.results, recovered, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

export async function runnerResume({ evalRoot, resumeRequestId = null, expectedManifestSha256 = null }) {
  return withRunnerLock(`${path.resolve(evalRoot)}.lifecycle`, () => runnerResumeLocked({ evalRoot, resumeRequestId, expectedManifestSha256 }));
}

async function runnerResumeLocked({ evalRoot, resumeRequestId, expectedManifestSha256 }) {
  const admitted = await readEvents(path.join(path.resolve(evalRoot), "events.jsonl"));
  assertEvalAdmission(admitted);
  if (resumeRequestId !== null && reduceEvents(admitted).resume?.request_id !== resumeRequestId) fail("EVAL continuation requires its current applied resume", "control_request_stale");
  const root = path.resolve(evalRoot), manifestBytes = await readFile(path.join(root, "manifest.json"));
  if (expectedManifestSha256 !== null && sha256(manifestBytes) !== expectedManifestSha256) fail("EVAL continuation manifest changed", "runner_definition_drift");
  const manifest = JSON.parse(manifestBytes); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  let blueprint, pack = null, packRoot = null;
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); pack = validateEntryPack(await readJson(packFile), loaded.value.id); packRoot = path.dirname(packFile);
    blueprint = validateStageBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")));
  } else blueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
  let events = await readEvents(path.join(root, "events.jsonl")); const results = [];
  const runProfile = { value: manifest.profile };
  let queuePrepared = false, stopQueue = false, permits, directBlueprint;
  for (const execution of manifest.executions) {
    const operationId = executionState(events, manifest.run_id, execution).operation_id;
    const operation = terminalOperation(events, operationId); const completed = operation?.terminal === "completed" ? operation.result : null;
    if (completed) { results.push(completed); continue; }
    if (operation?.terminal) fail(`execution ${execution.id} operation is already ${operation.terminal}; recovery must create an explicit recovery operation`, "operation_terminal");
    if (!operation?.started && operationId === `${manifest.run_id}:${execution.id}:launch`) {
      if (stopQueue) { results.push(executionState(events, manifest.run_id, execution).result); continue; }
      if (!queuePrepared) {
        await assertRetainedRunDefinition(manifest, loaded);
        assertProfileCapacity(profile, manifest.executions);
        await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile });
        directBlueprint = validateStageBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")));
        permits = createHarnessPermits(runProfile); queuePrepared = true;
      }
      results.push(await launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : blueprint, pack, packRoot, permits, onInfrastructureFailure: () => { stopQueue = true; } }));
      events = await readEvents(path.join(root, "events.jsonl"));
      continue;
    }
    const recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); results.push(recovery);
    if (recovery.state === "candidate_ready") await completeOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.${operationId.endsWith(":launch") ? "launch" : "recover"}`, result: recovery });
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
    // An early inspection must not consume the one durable reconciliation operation.
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: null }); const currentStage = latestObservedStage(lifecycle.status, execution.stage);
    assertTerminalReconciliation(execution, currentStage, stageRecord(lifecycle, currentStage));
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reconcile`, action: async () => {
      return await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, terminalOnly: true });
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
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl"), manifest = await readJson(path.join(root, "manifest.json"));
  const selected = manifest.executions.filter(execution => !executionId || execution.id === executionId);
  if (!selected.length) fail(`unknown execution: ${executionId}`, "execution_unknown");
  if (typeof manifest.runtime_resource_home !== "string" || !path.isAbsolute(manifest.runtime_resource_home)) fail("EVAL manifest must retain its absolute resource registry home", "runtime_scope_identity_missing");
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  let scopeFence = null, cancelRequest = null;
  if (!executionId) {
    cancelRequest = await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
      type: "dev.dd.eval.cancel_requested", data: { state: "cancelling", scope_id: manifest.run_id } });
    const bin = manifest.runtime_control_bin;
    try {
      scopeFence = await commandJson(bin, ["runtime", "scope", "fence", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeFence.scope_id !== manifest.run_id || scopeFence.dispatch_blocked !== true) fail("Runtime did not confirm the EVAL dispatch fence", "runtime_scope_fence_invalid");
    } catch (error) { scopeFence = { scope_id: manifest.run_id, dispatch_blocked: false, error: errorRecord(error) }; }
  }
  const cancelled = [];
  for (const execution of selected) {
    const events = await readEvents(eventsFile), current = executionState(events, manifest.run_id, execution);
    if (["candidate_ready", "cancelled"].includes(current.result.state)) {
      cancelled.push({ execution: execution.id, settled: true, already_terminal: current.result.state }); continue;
    }
    const sessionId = subjectSessionFor(events, execution.id);
    const data = { state: "cancelling", execution: execution.id, session_id: sessionId };
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
      type: "dev.dd.eval.execution.cancel_requested", data, beforeAppend: prior => {
        const state = executionState(prior, manifest.run_id, execution);
        data.execution_generation = state.generation; data.execution_operation_id = state.operation_id;
      } });
    let receipt;
    try { receipt = await cancelExecutionTree({ root, manifest, execution, profile: manifest.subject_profile, sessionId }); }
    catch (error) { receipt = { settled: false, cleanup_error: errorRecord(error) }; }
    cancelled.push({ execution: execution.id, session_id: sessionId, settled: receipt.settled === true, receipt });
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
      type: receipt.settled === true ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancelling",
      data: { ...data, state: receipt.settled === true ? "cancelled" : "cancelling", receipt } });
  }
  let scopeInventory = null;
  if (!executionId) {
    const bin = manifest.runtime_control_bin;
    try {
      scopeInventory = await commandJson(bin, ["runtime", "scope", "stop", "--scope-id", manifest.run_id, "--request-id", `eval-cancel:${manifest.run_id}`],
        { cwd: root, env: evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: bin }) });
      if (scopeInventory.scope_id !== manifest.run_id || !Array.isArray(scopeInventory.nodes) || typeof scopeInventory.settled !== "boolean"
        || scopeInventory.settled && scopeInventory.nodes.some(node => node.settled !== true)) fail("Runtime scope stop receipt is invalid", "runtime_scope_inventory_invalid");
    } catch (error) { scopeInventory = { scope_id: manifest.run_id, settled: false, nodes: null, error: errorRecord(error) }; }
  }
  const projectionEvents = await readEvents(eventsFile);
  const results = storedExecutionResults(projectionEvents, manifest);
  // Control never enters candidate capture or assessment: those may start a
  // provider, and neither case/profile availability is required to cancel.
  const terminal = results.every(result => ["candidate_ready", "failed", "cancelled"].includes(result.state));
  // A process state alone does not prove remote native-tree settlement.
  // Retained scope resources require their own shutdown evidence.
  const settled = cancelled.every(item => item.settled) && scopeFence?.dispatch_blocked !== false
    && (executionId !== null || scopeInventory?.settled === true);
  const state = !settled ? "cancelling" : !terminal ? "awaiting_provider"
    : results.every(result => result.state === "candidate_ready") ? "completed"
    : results.some(result => result.state === "failed") ? "completed_with_failures" : "cancelled";
  if (terminal && settled) {
    const revision = runResultRevision(projectionEvents, manifest);
    await appendRunEventOnce({ eventsFile, runId: manifest.run_id, type: "dev.dd.eval.completed",
      guard: prior => runResultRevision(prior, manifest) === revision,
      data: { state, result_revision: revision, executions: results.map(result => ({ execution: result.execution, state: result.state })) } });
  }
  if (!executionId) await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id,
    type: "dev.dd.eval.cancel_observed", data: { state, scope_id: manifest.run_id, request_sequence: cancelRequest.data.sequence, scope_fence: scopeFence, scope_inventory: scopeInventory, cancelled } });
  return { root, run_id: manifest.run_id, cancelled, state, ...(scopeFence ? { scope_fence: scopeFence, scope_inventory: scopeInventory } : {}) };
}

export async function runnerControlRequest({ evalRoot, requestId, mode }) {
  if (!["pause", "stop"].includes(mode) || typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) fail("Control requires pause or stop and a bounded request identity", "control_request_invalid");
  const root = path.resolve(evalRoot), manifestPath = path.join(root, "manifest.json"), manifestBytes = await readFile(manifestPath, "utf8"), manifest = JSON.parse(manifestBytes), eventsFile = path.join(root, "events.jsonl");
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: manifest.runtime_control_bin });
  const requested = await appendEvent(eventsFile, { id: `scope-control:${sha256(JSON.stringify([manifest.run_id, requestId]))}`, deduplicate: true, source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.requested", data: { mode, request_id: requestId, scope_id: manifest.run_id }, beforeAppend: events => {
    const prior = reduceEvents(events);
    if (prior.cancellation) fail("Terminal EVAL cancellation cannot be resumed by operator control", "runtime_scope_stopped");
    if (prior.control?.mode === "stop" && mode === "pause") fail("Pause cannot weaken an existing stop", "control_request_conflict");
  } });
  if (requested.data.mode !== mode) fail("Control request identity was reused for another mode", "control_request_conflict");
  const scopeManifest = { schema_id: "dd-flow/runtime-scope-manifest@1", scope_id: manifest.run_id, manifest_path: manifestPath, manifest_sha256: sha256(manifestBytes), execution_ids: manifest.executions.map(execution => execution.id) };
  const receipt = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "control", "--scope-id", manifest.run_id, "--request-id", requestId, "--mode", mode, "--manifest-json", JSON.stringify(scopeManifest)], { cwd: root, env });
  if (receipt.scope_id !== manifest.run_id || receipt.control?.request_id !== requestId || receipt.control?.requested_mode !== mode || receipt.control?.dispatch_blocked !== true || !Number.isSafeInteger(receipt.control.generation)) fail("Runtime control returned another scope or request", "runtime_scope_inventory_invalid");
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.observed", data: { mode, request_id: requestId, request_sequence: requested.data.sequence, receipt } });
  return { root, run_id: manifest.run_id, state: reduceEvents(await readEvents(eventsFile)).state, receipt };
}

/** Reconcile accepted late experiment results only. No provider observation,
 * capture, assessment, new operation, or productive resume occurs here. */
export async function runnerControlReconcile({ evalRoot, requestId }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const manifest = await readJson(path.join(root, "manifest.json"));
    const assertControl = events => {
      const state = reduceEvents(events);
      if (!requestId || state.cancellation || state.control?.request_id !== requestId || !["pause", "stop"].includes(state.control.mode)) fail("Reconciliation requires the current operator request", "control_request_stale");
      return state;
    };
    const events = await readEvents(eventsFile), requested = assertControl(events).control;
    const inventory = controlOperationInventory(events, manifest.run_id), reconciled = [];
    for (const operation of inventory.operations.filter(item => item.disposition === "reconcile")) {
      if (operation.operation === "final_judge" && operation.execution_id === null) {
        const acceptedJudge = source => {
          const matches = source.filter(event => event.type === "dev.dd.eval.final_judge.result_ready" && event.data?.operation_id === operation.operation_id);
          const result = matches.at(-1)?.data.result;
          if (!result) return null;
          if (result.schema_id !== "dd-eval/final-judge-receipt@1" || !/^[a-f0-9]{64}$/.test(result.candidate_sha256) || operation.operation_id !== `${manifest.run_id}:judge:${result.candidate_sha256}` || matches.some(event => hashJson(event.data.result) !== hashJson(result))) fail("Accepted Judge result changed its operation identity", "journal_conflict");
          return result;
        };
        const result = acceptedJudge(events);
        if (!result) continue;
        await completeOperation({ eventsFile, source: "dd-eval://runner", runId: manifest.run_id, operationId: operation.operation_id, operation: operation.operation, result, beforeAppend: latest => {
          controlOperationInventory(latest, manifest.run_id);
          if (assertControl(latest).control.request_sequence !== requested.request_sequence) fail("Operator request changed during reconciliation", "control_request_stale");
          if (hashJson(acceptedJudge(latest)) !== hashJson(result)) fail("Accepted Judge result changed during reconciliation", "journal_conflict");
        } });
        reconciled.push(operation.operation_id);
        continue;
      }
      const execution = manifest.executions.find(item => item.id === operation.execution_id);
      if (!execution) continue;
      const accepted = executionState(events, manifest.run_id, execution);
      if (accepted.operation_id !== operation.operation_id || accepted.cancellation?.effective || accepted.result.state !== "candidate_ready" || accepted.result.execution !== execution.id) continue;
      const resultHash = hashJson(accepted.result);
      await completeOperation({ eventsFile, source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, operationId: operation.operation_id, operation: operation.operation, result: accepted.result, beforeAppend: latest => {
        controlOperationInventory(latest, manifest.run_id);
        if (assertControl(latest).control.request_sequence !== requested.request_sequence) fail("Operator request changed during reconciliation", "control_request_stale");
        const current = executionState(latest, manifest.run_id, execution);
        if (current.operation_id !== accepted.operation_id || current.generation !== accepted.generation || current.cancellation?.effective || hashJson(current.result) !== resultHash) fail("Accepted execution changed during reconciliation", "execution_generation_stale");
      } });
      reconciled.push(operation.operation_id);
    }
    const latest = await readEvents(eventsFile), state = assertControl(latest);
    return { root, run_id: manifest.run_id, request_id: requestId, state: state.state, reconciled, journal: controlOperationInventory(latest, manifest.run_id) };
  });
}

export function validateControlResumeInput({ requestId, waitMs = 0 }) {
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 60_000) fail("waitMs must be an integer between 0 and 60000", "control_request_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId ?? "")) fail("Resume requires a stable request ID", "control_request_invalid");
}

export function assertControlResumeSource(events, runId, requestId, fromRequestId) {
  const state = reduceEvents(events);
  controlOperationInventory(events, runId);
  const applied = !state.control && state.resume?.request_id === requestId && state.resume.source_request_id === fromRequestId;
  if (!fromRequestId || state.cancellation || !applied && (state.control?.request_id !== fromRequestId || !["pause", "stop"].includes(state.control.mode))) fail("Resume requires the current operator request", "control_request_stale");
  return state;
}

export async function runnerControlResume({ evalRoot, requestId, fromRequestId, waitMs = 0 }) {
  validateControlResumeInput({ requestId, waitMs });
  const deadline = performance.now() + (waitMs || 60_000);
  const signal = AbortSignal.timeout(waitMs || 60_000);
  const handle = { root: path.resolve(evalRoot), request_id: requestId, source_request_id: fromRequestId };
  let result;
  try {
    for (;;) {
      signal.throwIfAborted();
      result = await runnerControlResumeOnce({ evalRoot, requestId, fromRequestId, signal, timeoutMs: Math.max(0, deadline - performance.now()) });
      if (result.applied || result.reused) return { ...result, ...handle, pending: false };
      if (!waitMs) return { ...result, ...handle, pending: true };
      await delay(Math.min(100, Math.max(0, deadline - performance.now())), undefined, { signal });
    }
  } catch (error) {
    if (!(signal.aborted && ["AbortError", "TimeoutError"].includes(error.name)) && !(error.code === "runner_lock_timeout" && performance.now() >= deadline)) throw error;
    // A lost CLI reply cannot establish whether its durable request was accepted.
    // The stable handle allows retry without claiming release or cancelling work.
    return { ...result, ...handle, ok: result !== undefined, accepted: result ? true : null, pending: true, observation_timed_out: true };
  }
}

async function runnerControlResumeOnce({ evalRoot, requestId, fromRequestId, signal, timeoutMs }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const manifest = await readJson(path.join(root, "manifest.json"));
    const assertSource = async () => assertControlResumeSource(await readEvents(eventsFile), manifest.run_id, requestId, fromRequestId);
    await assertSource();
    if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
    const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest);
    const status = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "status", "--scope-id", manifest.run_id], { cwd: root, env, signal });
    if (status.release && !status.control) {
      const release = status.release, resume = status.resume;
      if (status.scope_id !== manifest.run_id || status.fence || status.control || status.dispatch_blocked !== false || release.current !== true || release.scope_id !== manifest.run_id || release.source_request_id !== fromRequestId || release.request_id !== requestId || !Number.isSafeInteger(release.generation) || release.generation < 1 || !/^[a-f0-9]{64}$/.test(release.capture_key ?? "") || !/^[a-f0-9]{64}$/.test(release.journal_sha256 ?? "") || resume?.status !== "released" || resume.current !== true || resume.request_id !== requestId || resume.generation !== release.generation || resume.capture_key !== release.capture_key) fail("Scope resume requires its current matching release", "runtime_scope_release_unproven");
      const source = await assertSource();
      const applied = await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.resume_applied", data: { request_id: requestId, source_request_id: fromRequestId, request_sequence: source.control?.request_sequence ?? source.resume.request_sequence, release }, beforeAppend: latest => {
        controlOperationInventory(latest, manifest.run_id);
        const state = reduceEvents(latest);
        if (state.cancellation) fail("Cancellation superseded scope resume", "control_request_stale");
        if (!state.control && state.resume?.request_id === requestId && state.resume.source_request_id === fromRequestId) {
          if (hashJson(state.resume.release) !== hashJson(release)) fail("Applied scope release changed", "journal_conflict");
          return false;
        }
        if (state.control?.request_id !== fromRequestId || state.control.request_sequence !== source.control?.request_sequence) fail("Operator request changed before applying resume", "control_request_stale");
      } }, { signal });
      return { root, run_id: manifest.run_id, state: reduceEvents(await readEvents(eventsFile)).state, applied: Boolean(applied), reused: !applied, receipt: { scope_id: manifest.run_id, dispatch_blocked: false, settled: false, resume, release } };
    }
    const control = status.control, captureKey = status.drain?.capture?.journal?.artifact_key;
    if (status.scope_id !== manifest.run_id || status.fence || control?.request_id !== fromRequestId || !Number.isSafeInteger(control.generation) || !/^[a-f0-9]{64}$/.test(captureKey ?? "")) fail("Scope resume requires its retained current capture", "runtime_scope_capture_required");
    await assertSource();
    const receipt = status.resume?.current === true && status.resume.request_id === requestId && status.resume.generation === control.generation && status.resume.capture_key === captureKey
      ? { ...status, settled: false }
      : await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "resume", "--scope-id", manifest.run_id, "--request-id", requestId, "--generation", String(control.generation), "--capture-key", captureKey], { cwd: root, env, signal });
    if (receipt.scope_id !== manifest.run_id || receipt.resume?.request_id !== requestId || receipt.resume?.generation !== control.generation || receipt.resume?.capture_key !== captureKey || receipt.dispatch_blocked !== true || receipt.settled !== false) fail("Runtime resume returned another preparation identity", "runtime_scope_inventory_invalid");
    const state = await assertSource();
    // Keep the captured journal unchanged until the all-role release exists.
    // The durable runtime request, not this observing client, owns preparation.
    return { root, run_id: manifest.run_id, state: state.state, receipt };
  }, { timeoutMs, signal });
}

export async function runnerControlStatus({ evalRoot, executionId = null }) {
  const root = path.resolve(evalRoot), manifest = await readJson(path.join(root, "manifest.json"));
  const selected = manifest.executions.filter(execution => executionId === null || execution.id === executionId);
  if (executionId !== null && !selected.length) fail(`unknown execution: ${executionId}`, "execution_unknown");
  const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest);
  let journal;
  try {
    const events = await readEvents(path.join(root, "events.jsonl"));
    journal = controlOperationInventory(events, manifest.run_id);
    if (executionId !== null) {
      journal.operations = journal.operations.filter(operation => operation.execution_id === executionId);
      journal.unresolved_operations = journal.unresolved_operations.filter(id => journal.operations.some(operation => operation.operation_id === id));
    }
  } catch (error) { journal = { unavailable: true, error: errorRecord(error) }; }
  let inventory = null;
  if (executionId === null) {
    if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
    try {
      inventory = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "status", "--scope-id", manifest.run_id], { cwd: root, env: { ...env, DD_FLOW_BIN: manifest.runtime_control_bin } });
      if (inventory.scope_id !== manifest.run_id || typeof inventory.dispatch_blocked !== "boolean" || !Array.isArray(inventory.processes)) fail("Runtime returned an invalid scope inventory", "runtime_scope_inventory_invalid");
    } catch (error) { inventory = { scope_id: manifest.run_id, unavailable: true, error: errorRecord(error) }; }
  }
  const executions = await Promise.all(selected.map(async execution => {
    const attempt = path.join(root, "executions", execution.id), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
    try {
      if (path.dirname(attempt) !== path.join(root, "executions")) fail("Execution is outside its retained EVAL directory", "execution_scope_invalid");
      const managed = await readJson(path.join(attempt, "managed-runtime.json"));
      if (managed.schema_id !== "dd-eval/managed-runtime@1" || managed.project_root !== projectRoot || managed.runtime_root !== runtimeRoot || typeof managed.run_id !== "string" || !managed.run_id) fail("Managed execution scope is inconsistent", "execution_scope_invalid");
      const receipt = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
      if (receipt.scope?.run_id !== managed.run_id) fail("RUN control returned another scope", "execution_scope_invalid");
      return { execution: execution.id, run_id: managed.run_id, receipt };
    } catch (error) { return { execution: execution.id, unavailable: true, error: errorRecord(error) }; }
  }));
  // These are independent read snapshots, never aggregate settlement proof.
  const continuations = executionId === null ? await (await import("./eval-resume-worker.mjs")).evalResumeWorkerStatus(root) : [];
  return { root, run_id: manifest.run_id, scope: executionId === null ? "eval" : "execution", execution_id: executionId,
    observation_complete: !inventory?.unavailable && !journal.unavailable && executions.every(item => !item.unavailable) && continuations.every(item => !item.unavailable), inventory, executions, journal, continuations };
}

export async function runnerStatus({ evalRoot }) {
  const root = path.resolve(evalRoot), events = await readEvents(path.join(root, "events.jsonl")), manifest = await readJson(path.join(root, "manifest.json"));
  return { root, ...reduceEvents(events), manifest, execution_results: await attachModelAttribution(root, manifest, storedExecutionResults(events, manifest)) };
}
