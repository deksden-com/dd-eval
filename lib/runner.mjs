import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, canonicalJson, hashJson, readEvents, recordOperation, reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { materializeStageSlice, stages, validateEntry as validateStageEntry, validateStageBlueprint } from "./entry-pack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageSet = new Set(stages);
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

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
  if (value.id !== caseId || typeof value.assessment !== "string" || typeof value.entry_pack !== "string") fail("case requires id, assessment and one entry_pack pointer");
  if (!["authoring", "ready"].includes(value.status)) fail("case.status must be authoring or ready");
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
  if (!isObject(value) || value.schema_id !== "dd-eval/run-profile@1") fail("run profile must use dd-eval/run-profile@1");
  if (typeof value.id !== "string" || typeof value.case_id !== "string" || !isObject(value.subject) || typeof value.subject.profile_id !== "string") fail("run profile requires id, case_id and subject.profile_id");
  if (!isObject(value.modes) || !Array.isArray(value.modes.focused) || typeof value.modes.e2e !== "boolean") fail("run profile modes require focused[] and e2e");
  if (!isObject(value.judge) || typeof value.judge.enabled !== "boolean" || !isObject(value.concurrency) || !Number.isInteger(value.concurrency.global) || value.concurrency.global < 1) fail("run profile judge/concurrency is invalid");
  return { file: pathName, value };
}

export async function fixturesValidate({ caseId, revision }) {
  const loaded = await loadCaseV6(caseId); const pointer = loaded.value.entry_pack;
  const packFile = revision ? path.join(loaded.root, "stage-entries", revision, "entry-pack.json") : contained(loaded.root, pointer, "entry_pack");
  const pack = validateEntryPack(await readJson(packFile), caseId);
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
export async function canonicalBuild({ profileFile }) {
  const profile = await loadRunProfile(profileFile); const loaded = await loadCaseV6(profile.value.case_id);
  const source = path.join(loaded.root, "entry-pack-source"); const blueprint = validateStageBlueprint(await readJson(path.join(source, "stage-context.json")));
  const home = evalHome(); const canonicalRoot = path.join(home, "canonical", loaded.value.id); const revision = nextRevision(await readdir(canonicalRoot, { withFileTypes: true }).then((list) => list.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).catch(() => []));
  const root = path.join(canonicalRoot, revision); await mkdir(root, { recursive: true }); const events = path.join(root, "build", "events.jsonl");
  const state = { schema_id: "dd-eval/canonical-build-state@1", case_id: loaded.value.id, revision, status: "planned", profile: profile.value.id, blueprint_sha256: hashJson(blueprint), created_at: now() };
  await writeJsonAtomic(path.join(root, "build", "state.json"), state); await appendEvent(events, { source: "dd-eval://runner", runId: revision, type: "dev.dd.eval.canonical.planned", data: state });
  return { ...state, build: root, next: { kind: "reference_entry", message: "Canonical reference execution is not yet captured. Use the runner reference operation after the stage snapshot is supplied." } };
}

export async function canonicalStatus({ buildRoot }) {
  const root = path.resolve(buildRoot);
  const state = await readJson(path.join(root, "build", "state.json"));
  const events = await readEvents(path.join(root, "build", "events.jsonl"));
  return { build: root, state, journal: reduceEvents(events) };
}

async function copySnapshot(home, locator, destination) {
  const source = contained(home, locator, "snapshot locator"); if (!(await exists(source))) fail(`snapshot is missing: ${source}`, "snapshot_missing");
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true }); return destination;
}
async function materializeTaskInput(caseRoot, blueprint, stage, projectRoot) {
  const slice = blueprint.stages?.[stage];
  for (const item of slice?.task_input ?? []) {
    if (typeof item.source !== "string") fail(`stage ${stage} task input ${item.role} has no entry-pack source`);
    const source = contained(path.join(caseRoot, "entry-pack-source"), item.source, "task input source");
    const destination = path.resolve(projectRoot, item.path);
    if (!(destination === projectRoot || destination.startsWith(`${projectRoot}${path.sep}`))) fail(`task input escapes restored project: ${item.path}`);
    await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination, { force: true });
  }
}
function driverFor(profile) { return profile.harness === "codex-desktop" ? "dd-codex.mjs" : profile.harness === "zcode-acp" ? "dd-zcode.mjs" : profile.harness === "grok-acp" ? "dd-grok.mjs" : profile.harness === "opencode-server" ? "dd-opencode.mjs" : profile.harness === "antigravity-cli" ? "dd-agy.mjs" : fail(`unsupported harness: ${profile.harness}`); }
async function callDriver(profile, args, options) {
  const { spawn } = await import("node:child_process"); const executable = process.execPath; const script = path.join(repoRoot, "bin", driverFor(profile));
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...args, "--json"], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.on("close", (code) => { if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `driver exited ${code}`), { code: "driver_failed" })); try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(new Error(`driver returned invalid JSON: ${error.message}`)); } });
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
function entryLauncher({ stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile }) {
  const prefix = `DD_FLOW_HOME=${JSON.stringify(runtimeRoot)} dd-flow stage start`;
  const shared = `--stage ${stage} --project-root ${JSON.stringify(projectRoot)} --context-file ${JSON.stringify(contextFile)} --context-sha256 ${contextSha256} --require-session-binding --json`;
  return entry.snapshot.run_id === null ? `${prefix} --bootstrap --subject eval-subject ${shared}` : `${prefix} ${entry.snapshot.run_id} ${shared}`;
}
function selectedEntries(runProfile) { const keys = new Set(runProfile.modes.focused); if (runProfile.modes.e2e) keys.add("e2e"); for (const key of keys) if (key !== "e2e" && !stageSet.has(key)) fail(`unknown focused stage: ${key}`); return [...keys]; }

export async function evalRun({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile); const profile = (await loadProfile(runProfile.value.subject.profile_id)).value; const validated = await fixturesValidate({ caseId: runProfile.value.case_id });
  const loaded = await loadCaseV6(runProfile.value.case_id); if (loaded.value.status !== "ready") fail("case is not ready for scored execution");
  const home = evalHome(); const runId = `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = path.join(home, "runs", runId); const events = path.join(root, "events.jsonl");
  const manifest = { schema_id: "dd-eval/runner-manifest@1", run_id: runId, case_id: loaded.value.id, entry_pack: { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(await readFile(validated.entry_pack)) }, profile: runProfile.value, subject_profile: profile, created_at: now(), executions: selectedEntries(runProfile.value).map((entry) => ({ id: entry, mode: entry === "e2e" ? "e2e" : "focused", stage: entry === "e2e" ? "specify" : entry })) };
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
  const pack = validateEntryPack(await readJson(validated.entry_pack), loaded.value.id); const packRoot = path.dirname(validated.entry_pack); const blueprint = validateStageBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")));
  const results = [];
  for (const execution of manifest.executions) {
    const opId = `${runId}:${execution.id}:launch`; const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, action: async () => {
      const entryFile = contained(packRoot, pack.entries[execution.id], "entry"); const entry = validateStageEntry(await readJson(entryFile), execution.stage);
      const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
      await copySnapshot(home, entry.snapshot.project.locator, projectRoot); await copySnapshot(home, entry.snapshot.runtime.locator, runtimeRoot);
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      const runRoot = entry.snapshot.run_home_rel ? contained(runtimeRoot, entry.snapshot.run_home_rel, "snapshot.run_home_rel") : runtimeRoot;
      const workspaceRoot = entry.snapshot.workspace_rel ? contained(runtimeRoot, entry.snapshot.workspace_rel, "snapshot.workspace_rel") : projectRoot;
      const contextFile = path.join(attempt, "stage-context.json"); const slice = await materializeStageSlice({ blueprint, stage: execution.stage, roots: { project: projectRoot, workspace: workspaceRoot, run: runRoot }, output: contextFile });
      const contextSha256 = sha256(await readFile(contextFile)); const launcher = entryLauncher({ stage: execution.stage, entry, projectRoot, runtimeRoot, contextFile, contextSha256, profile });
      await writeFile(path.join(attempt, "launcher.md"), `${launcher}\n`); const journal = path.join(attempt, "drivers", "subject.events.jsonl");
      const daemonState = path.join(attempt, "drivers", "daemon"); const daemonArgs = profile.harness === "codex-desktop" ? ["--state-dir", daemonState] : [];
      if (profile.harness === "codex-desktop") await callDriver(profile, ["daemon", "start", ...daemonArgs, "--cwd", projectRoot, "--journal", journal], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
      const created = await callDriver(profile, ["session", "create", ...daemonArgs, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
      const sessionId = created.provider_session_id ?? created.session_id; if (typeof sessionId !== "string") fail("driver did not return provider_session_id", "driver_protocol");
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.subject.session_created", data: { session_id: sessionId, harness: profile.harness } });
      const prompted = await callDriver(profile, ["session", "prompt", ...daemonArgs, "--session-id", sessionId, "--cwd", projectRoot, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", launcher, "--journal", journal], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
      const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: entry.snapshot.run_id });
      if (profile.harness === "codex-desktop") await callDriver(profile, ["daemon", "stop", ...daemonArgs], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
      if (lifecycle.stage_status !== "done") {
        const code = lifecycle.stage_status === "paused" ? "registered_hitl_requires_interaction_judge" : "incomplete_subject_turn";
        throw Object.assign(new Error(`Subject turn ended without successful ${execution.stage} finish (${lifecycle.stage_status ?? "stage missing"})`), { code, lifecycle });
      }
      return { execution: execution.id, stage: execution.stage, attempt, session_id: sessionId, run_id: lifecycle.run_id, semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: contextSha256, launcher, driver: prompted, lifecycle, state: "candidate_ready" };
    }}); results.push(result.result ?? result);
  }
  const state = reduceEvents(await readEvents(events)); await writeJsonAtomic(path.join(root, "state.json"), state); return { run_id: runId, root, executions: results, state: state.state };
}

export async function runnerStatus({ evalRoot }) { const root = path.resolve(evalRoot); const events = await readEvents(path.join(root, "events.jsonl")); return { root, ...reduceEvents(events), manifest: await readJson(path.join(root, "manifest.json")) }; }
