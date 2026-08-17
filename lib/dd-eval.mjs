import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stages = ["specify", "protocolize", "plan", "plan-review"];
const fixedGitEnv = {
  GIT_AUTHOR_NAME: "dd-eval", GIT_AUTHOR_EMAIL: "dd-eval@example.invalid", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "dd-eval", GIT_COMMITTER_EMAIL: "dd-eval@example.invalid", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
};

function fail(message) { throw new Error(message); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function now() { return new Date().toISOString(); }
function id(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value)) fail(`invalid ${label}: ${value}`); return value; }
function relative(value, label) { if (typeof value !== "string" || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) fail(`invalid relative ${label}: ${value}`); return value; }
function record(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`); return value; }

async function run(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: [options.stdin ?? "ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => (stdout += value));
    child.stderr.setEncoding("utf8").on("data", (value) => (stderr += value));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} failed (${code}): ${stderr.trim() || stdout.trim()}`)));
  });
}

async function readJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { fail(`invalid JSON ${file}: ${error.message}`); } }
async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, file); }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
function inside(root, rel) { const target = path.resolve(root, rel); const delta = path.relative(root, target); if (delta === "" || delta === ".." || delta.startsWith(`..${path.sep}`) || path.isAbsolute(delta)) fail(`path escapes its root: ${rel}`); return target; }
async function materialHash(file) { return sha(await readFile(file)); }
async function requireFile(root, rel, label) { const file = inside(root, relative(rel, label)); if (!(await exists(file))) fail(`${label} is missing: ${rel}`); return file; }

function validateCase(definition, caseId) {
  record(definition, "case");
  if (definition.schema_id !== "dd-eval/case@2") fail("case must use dd-eval/case@2");
  if (definition.id !== caseId) fail(`case id mismatch: ${definition.id}`);
  id(definition.suite_id, "suite_id"); id(definition.id, "case id");
  record(definition.checkpoint, "case.checkpoint"); id(definition.checkpoint.id, "checkpoint id");
  record(definition.compatibility, "case.compatibility");
  for (const key of ["engine_commit", "flow_pack_commit"]) if (!/^[a-f0-9]{40}$/.test(definition.compatibility[key] ?? "")) fail(`case.compatibility.${key} must be a full SHA`);
  record(definition.profiles, "case.profiles");
  for (const role of ["controller", "subject", "judge"]) {
    if (!Array.isArray(definition.profiles[role]) || definition.profiles[role].length === 0) fail(`case.profiles.${role} must be non-empty`);
    definition.profiles[role].forEach((value) => id(value, `${role} profile`));
  }
  if (definition.default_profiles !== undefined) {
    record(definition.default_profiles, "case.default_profiles");
    for (const role of ["controller", "subject", "judge"]) {
      const selected = definition.default_profiles[role];
      if (typeof selected !== "string" || !definition.profiles[role].includes(selected)) fail(`case.default_profiles.${role} must be an allowed profile`);
    }
  }
  record(definition.flow, "case.flow");
  if (!["same_session", "new_session"].includes(definition.flow.handoff_mode)) fail("case.flow.handoff_mode is invalid");
  if (!["off", "standard", "deep"].includes(definition.flow.plan_review_mode)) fail("case.flow.plan_review_mode is invalid");
  record(definition.stages, "case.stages");
  for (const stage of stages) {
    const entry = definition.stages[stage]; record(entry, `case.stages.${stage}`);
    for (const key of ["subject_packet", "judge_packet", "rubric", "oracle", "interactions"]) relative(entry[key], `stage ${stage} ${key}`);
    if (!Array.isArray(entry.candidate_files)) fail(`case.stages.${stage}.candidate_files must be an array`);
    if (stage === "specify") { if (entry.fixture !== null) fail("SPECIFY fixture must be null"); } else relative(entry.fixture, `stage ${stage} fixture`);
  }
  record(definition.e2e, "case.e2e");
  for (const key of ["subject_packet", "judge_packet", "rubric", "oracle", "interactions"]) relative(definition.e2e[key], `e2e ${key}`);
  if (definition.e2e.stop_boundary !== "plan_review_accepted") fail("e2e.stop_boundary must be plan_review_accepted");
  if (definition.priming !== undefined) {
    record(definition.priming, "case.priming");
    relative(definition.priming.controller_packet, "priming controller packet");
    for (const key of ["subject_baselines", "judge_baselines"]) if (!Array.isArray(definition.priming[key])) fail(`case.priming.${key} must be an array`);
  }
}

async function loadProfile(profileId) { id(profileId, "profile id"); const profile = await readJson(path.join(repoRoot, "profiles", `${profileId}.json`)); if (profile.id !== profileId) fail(`profile id mismatch: ${profileId}`); return profile; }

export async function loadCase(caseId) {
  id(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId); const definition = await readJson(path.join(caseDir, "case.json")); validateCase(definition, caseId);
  for (const stage of stages) {
    const entry = definition.stages[stage];
    for (const key of ["subject_packet", "judge_packet", "rubric", "oracle", "interactions"]) await requireFile(caseDir, entry[key], `stage ${stage} ${key}`);
    if (entry.fixture) await requireFile(caseDir, entry.fixture, `stage ${stage} fixture`);
  }
  for (const key of ["subject_packet", "judge_packet", "rubric", "oracle", "interactions"]) await requireFile(caseDir, definition.e2e[key], `e2e ${key}`);
  if (definition.priming) {
    await requireFile(caseDir, definition.priming.controller_packet, "priming controller packet");
    for (const [key, label] of [["subject_baselines", "subject baseline"], ["judge_baselines", "judge baseline"]]) for (const file of definition.priming[key]) await requireFile(caseDir, file, label);
  }
  return { caseDir, definition };
}

export async function validateInput({ caseId, source }) {
  const loaded = await loadCase(caseId); const sourceRoot = path.resolve(source);
  if (!(await stat(sourceRoot)).isDirectory()) fail(`source is not a directory: ${sourceRoot}`);
  const checkpoint = await readJson(path.join(repoRoot, "checkpoints", `${loaded.definition.checkpoint.id}.json`));
  if (checkpoint.source?.commit !== loaded.definition.checkpoint.commit) fail("case checkpoint does not match checkpoint record");
  const resolved = await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.tag}^{commit}`]);
  if (resolved !== checkpoint.source.commit) fail(`checkpoint tag resolved to ${resolved}, expected ${checkpoint.source.commit}`);
  return { ...loaded, sourceRoot, checkpoint, sourceTree: await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.commit}^{tree}`]) };
}

async function materializeProject(sourceRoot, checkpoint, target) {
  const archive = `${target}.tar`; await mkdir(target, { recursive: true });
  try {
    await run("git", ["-C", sourceRoot, "archive", "--format=tar", "-o", archive, checkpoint.source.commit]);
    await run("tar", ["-xf", archive, "-C", target]); await run("git", ["init", "-b", "main"], { cwd: target }); await run("git", ["add", "-A", "-f"], { cwd: target }); await run("git", ["commit", "-m", "eval-input"], { cwd: target, env: fixedGitEnv });
    const tree = await run("git", ["rev-parse", "HEAD^{tree}"], { cwd: target });
    const expectedTree = await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.commit}^{tree}`]);
    if (tree !== expectedTree) fail(`materialized tree mismatch: ${tree}`);
    return { commit: await run("git", ["rev-parse", "HEAD"], { cwd: target }), tree };
  } finally { await rm(archive, { force: true }); }
}

function finalPath(value, temporary, outputRoot) { return typeof value === "string" && value.startsWith(`${temporary}${path.sep}`) ? path.join(outputRoot, path.relative(temporary, value)) : value; }

function selectedStages(value) { if (!value) return []; const selected = value.split(",").filter(Boolean); if (new Set(selected).size !== selected.length || selected.some((stage) => !stages.includes(stage))) fail(`--stages must be a comma-separated subset of ${stages.join(",")}`); return selected; }
function executionDefinition(definition, kind) { return kind === "e2e" ? definition.e2e : definition.stages[kind]; }
async function copyPacket(caseDir, from, destination) { const source = await requireFile(caseDir, from, "packet"); await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination); return { path: destination, sha256: await materialHash(destination), source: from }; }
async function importFixture({ fixture, projectRoot, engine }) { const output = await run(engine, ["run", "fixture", "import", "--fixture", fixture, "--project-root", projectRoot, "--json"]); try { return JSON.parse(output); } catch { fail(`dd-flow fixture import did not return JSON: ${output}`); } }

async function acceptedFixture(file, executionId) {
  const fixture = await readJson(file);
  if (fixture.schema_id !== "dd-eval/stage-fixture@1" || fixture.status !== "accepted" || fixture.target_stage !== executionId) fail(`fixture is not accepted for ${executionId}`);
  return fixture;
}

export async function prepare({ caseId, source, output, controllerProfileId, subjectProfileId, judgeProfileId, stageList, e2e = false, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const context = await validateInput({ caseId, source }); const selected = selectedStages(stageList); if (selected.length === 0 && !e2e) fail("select at least one --stages value or --e2e");
  const defaults = context.definition.default_profiles ?? {};
  const profileIds = { controller: controllerProfileId ?? defaults.controller, subject: subjectProfileId ?? defaults.subject, judge: judgeProfileId ?? defaults.judge };
  for (const [role, profileId] of Object.entries(profileIds)) { if (!profileId) fail(`--${role}-profile is required because this case has no default`); if (!context.definition.profiles[role].includes(profileId)) fail(`${role} profile is not allowed by this case: ${profileId}`); }
  const profiles = Object.fromEntries(await Promise.all(Object.entries(profileIds).map(async ([role, profileId]) => [role, await loadProfile(profileId)])));
  for (const [role, profile] of Object.entries(profiles)) {
    if (profile.runtime?.dd_flow_cli?.engine_commit && profile.runtime.dd_flow_cli.engine_commit !== context.definition.compatibility.engine_commit) fail(`${role} profile engine commit does not match the case`);
  }
  const outputRoot = path.resolve(output); if (await exists(outputRoot)) fail(`output already exists: ${outputRoot}`);
  const runId = `eval-${randomUUID()}`; const executions = [...selected, ...(e2e ? ["e2e"] : [])].map((kind) => ({ id: kind, kind, attempt: 1, status: "prepared", flow_run_id: null, run_home: null, project_root: null, sessions: [] }));
  const temporary = `${outputRoot}.tmp-${process.pid}`; await rm(temporary, { recursive: true, force: true });
  try {
    await mkdir(path.join(temporary, "executions"), { recursive: true }); const promptReceipts = {};
    for (const execution of executions) {
      const definition = executionDefinition(context.definition, execution.kind); const root = path.join(temporary, "executions", execution.id, "attempt-01"); const projectRoot = path.join(root, "project");
      execution.project_root = projectRoot; execution.input = await materializeProject(context.sourceRoot, context.checkpoint, projectRoot);
      const packetRoot = path.join(root, "prompts"); promptReceipts[execution.id] = { subject: await copyPacket(context.caseDir, definition.subject_packet, path.join(packetRoot, "subject.md")), judge: await copyPacket(context.caseDir, definition.judge_packet, path.join(packetRoot, "judge.md")) };
      if (execution.kind !== "specify" && execution.kind !== "e2e") {
        const fixture = await requireFile(context.caseDir, definition.fixture, `fixture ${execution.kind}`); await acceptedFixture(fixture, execution.kind); const imported = await importFixture({ fixture, projectRoot, engine }); execution.flow_run_id = imported.run_id ?? null; execution.run_home = imported.run_home ?? imported.runtime_workspace ?? null;
        if (!execution.flow_run_id || !execution.run_home) fail(`fixture import returned incomplete receipt for ${execution.kind}`);
      }
    }
    for (const execution of executions) execution.project_root = finalPath(execution.project_root, temporary, outputRoot);
    for (const receipts of Object.values(promptReceipts)) for (const receipt of Object.values(receipts)) receipt.path = finalPath(receipt.path, temporary, outputRoot);
    const profile_selection = Object.fromEntries(Object.entries(profileIds).map(([role, profileId]) => [role, { id: profileId, source: (role === "controller" ? controllerProfileId : role === "subject" ? subjectProfileId : judgeProfileId) ? "command_override" : "case_default" }]));
    const manifest = { schema_id: "dd-eval/run-manifest@1", run_id: runId, created_at: now(), definition: { suite_id: context.definition.suite_id, case_id: caseId, case_sha256: await materialHash(path.join(context.caseDir, "case.json")), checkpoint_id: context.checkpoint.id, checkpoint_commit: context.checkpoint.source.commit, source_tree: context.sourceTree, engine_commit: context.definition.compatibility.engine_commit, flow_pack_commit: context.definition.compatibility.flow_pack_commit }, selection: { focused_stages: selected, e2e: Boolean(e2e) }, profiles, profile_selection, executions, prompt_receipts: promptReceipts };
    const state = { schema_id: "dd-eval/run-state@1", run_id: runId, status: "prepared", updated_at: now(), executions: Object.fromEntries(executions.map((execution) => [execution.id, { status: "prepared", attempt: 1, incidents: [] }])) };
    await writeJson(path.join(temporary, "manifest.json"), manifest); await writeJson(path.join(temporary, "state.json"), state); await writeJson(path.join(temporary, "sessions.json"), { schema_id: "dd-eval/sessions@1", sessions: [] }); await rename(temporary, outputRoot);
    return { output: outputRoot, run_id: runId, executions: executions.map(({ id: executionId, project_root, flow_run_id }) => ({ id: executionId, project_root, flow_run_id })) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function openEval(evalRoot) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const state = await readJson(path.join(root, "state.json")); const sessions = await readJson(path.join(root, "sessions.json"));
  if (manifest.schema_id !== "dd-eval/run-manifest@1" || state.schema_id !== "dd-eval/run-state@1" || sessions.schema_id !== "dd-eval/sessions@1") fail("invalid prepared eval directory");
  return { root, manifest, state, sessions };
}
function findExecution(manifest, executionId) { const execution = manifest.executions.find((item) => item.id === executionId); if (!execution) fail(`unknown execution: ${executionId}`); return execution; }
async function saveState(context) { context.state.updated_at = now(); await writeJson(path.join(context.root, "state.json"), context.state); await writeJson(path.join(context.root, "sessions.json"), context.sessions); }

export async function addSession({ evalRoot, executionId, role, sessionId, parentSessionId }) {
  const context = await openEval(evalRoot); findExecution(context.manifest, executionId); if (!/^(controller|subject_base|subject|judge_base|judge)$/.test(role)) fail(`invalid role: ${role}`); if (typeof sessionId !== "string" || !sessionId.trim()) fail("--session-id is required");
  if (context.sessions.sessions.some((item) => item.session_id === sessionId && item.execution_id === executionId && item.role === role)) return { ok: true, idempotent: true };
  context.sessions.sessions.push({ execution_id: executionId, role, session_id: sessionId, parent_session_id: parentSessionId ?? null, recorded_at: now() }); await saveState(context); return { ok: true, idempotent: false };
}
async function ddFlow(engine, args) { const output = await run(engine, [...args, "--json"]); try { return JSON.parse(output); } catch { fail(`dd-flow did not return JSON: ${output}`); } }

export async function sync({ evalRoot, executionId, projectRoot, flowRunId, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const root = path.resolve(projectRoot); const runId = flowRunId ?? execution.flow_run_id; if (!runId) fail("--flow-run is required until the execution has an imported RUN");
  const status = await ddFlow(engine, ["run", "status", runId, "--project-root", root]); const sessionList = await ddFlow(engine, ["stat", "run", "sessions", "ls", "--run", runId, "--project-root", root]); let usage = null; try { usage = await ddFlow(engine, ["stat", "usage", "--run", runId, "--project-root", root]); } catch { /* provider data may be unavailable */ }
  execution.project_root = root; execution.flow_run_id = runId; execution.run_home = status.run?.run_home_path ?? execution.run_home;
  const stage = execution.kind === "e2e" ? "plan-review" : execution.kind; const stageState = status.index?.stage_runs?.find((item) => item.stage === stage)?.status ?? null; const lifecycle = context.state.executions[executionId]; lifecycle.flow = { status, sessions: sessionList, usage };
  lifecycle.status = stageState === "paused" || status.run?.status === "waiting_for_user" ? "waiting_for_user" : stageState === "done" ? "candidate_ready" : "running"; context.state.status = lifecycle.status === "waiting_for_user" ? "running" : context.state.status === "prepared" ? "running" : context.state.status;
  await saveState(context); return { ok: true, execution: executionId, status: lifecycle.status, next_action: lifecycle.status === "waiting_for_user" ? "deliver_declared_interaction" : lifecycle.status === "candidate_ready" ? "checkpoint" : "wait_for_subject" };
}

async function sourceFile(execution, descriptor) { record(descriptor, "candidate file"); if (!["project", "run"].includes(descriptor.origin)) fail("candidate file origin must be project or run"); const root = descriptor.origin === "project" ? execution.project_root : execution.run_home; if (!root) fail(`candidate file origin is unavailable: ${descriptor.origin}`); return { source: inside(root, relative(descriptor.path, "candidate file path")), destination: path.join(descriptor.origin, descriptor.path) }; }

export async function checkpoint({ evalRoot, executionId }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (lifecycle.status !== "candidate_ready") fail(`execution ${executionId} is not ready to checkpoint`);
  const definition = executionDefinition((await loadCase(context.manifest.definition.case_id)).definition, execution.kind); const destination = path.join(context.root, "candidates", executionId, `attempt-${String(lifecycle.attempt).padStart(2, "0")}`); if (await exists(destination)) fail(`candidate already checkpointed: ${executionId}`);
  const artifacts = [];
  for (const descriptor of definition.candidate_files) { const file = await sourceFile(execution, descriptor); if (!(await exists(file.source))) fail(`candidate artifact is missing: ${file.destination}`); const target = inside(destination, file.destination); await mkdir(path.dirname(target), { recursive: true }); await cp(file.source, target); artifacts.push({ path: file.destination.split(path.sep).join("/"), sha256: await materialHash(target), bytes: (await stat(target)).size }); }
  const candidate = { schema_id: "dd-eval/candidate@1", run_id: context.manifest.run_id, execution_id: executionId, attempt: lifecycle.attempt, captured_at: now(), flow_run_id: execution.flow_run_id, source: lifecycle.flow?.status ?? null, artifacts };
  await writeJson(path.join(destination, "candidate.json"), candidate); lifecycle.candidate = path.relative(context.root, path.join(destination, "candidate.json")); await saveState(context); return { ok: true, candidate: lifecycle.candidate };
}

export async function judgePrepare({ evalRoot, executionId }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (!lifecycle.candidate) fail("checkpoint is required before Judge preparation"); const loaded = await loadCase(context.manifest.definition.case_id); const definition = executionDefinition(loaded.definition, execution.kind); const candidate = await readJson(path.join(context.root, lifecycle.candidate));
  const oracleFile = await requireFile(loaded.caseDir, definition.oracle, "oracle"); const oracle = await readJson(oracleFile); if (oracle.status !== "accepted") fail(`oracle is not accepted for ${executionId}`);
  const packet = ["# Evaluation packet", "", await readFile(await requireFile(loaded.caseDir, definition.judge_packet, "Judge packet"), "utf8"), "", "## Candidate receipt", "```json", JSON.stringify(candidate, null, 2), "```", "", "## Rubric", await readFile(await requireFile(loaded.caseDir, definition.rubric, "rubric"), "utf8"), "", "## Oracle", JSON.stringify(oracle, null, 2)].join("\n");
  const packetPath = path.join(context.root, "judge", executionId, `attempt-${String(lifecycle.attempt).padStart(2, "0")}.md`); await mkdir(path.dirname(packetPath), { recursive: true }); await writeFile(packetPath, packet); lifecycle.status = "judging"; context.state.status = "judging"; lifecycle.judge_packet = path.relative(context.root, packetPath); await saveState(context); return { ok: true, packet: packetPath, sha256: await materialHash(packetPath) };
}

function validateJudgeResult(value) { record(value, "Judge result"); if (value.schema_id !== "dd-eval/judge-result@1") fail("Judge result must use dd-eval/judge-result@1"); if (!["valid", "invalid_infrastructure_flow", "contaminated"].includes(value.run_validity)) fail("Judge result has invalid run_validity"); if (!Array.isArray(value.criteria) || !Array.isArray(value.hard_invariants)) fail("Judge result must include criteria and hard_invariants arrays"); for (const criterion of value.criteria) { record(criterion, "Judge criterion"); if (typeof criterion.id !== "string" || !["pass", "partial", "fail", "not_applicable"].includes(criterion.status)) fail("invalid Judge criterion"); } }

export async function judgeAccept({ evalRoot, executionId, result }) {
  const context = await openEval(evalRoot); findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (lifecycle.status !== "judging") fail("Judge is not prepared"); const value = await readJson(path.resolve(result)); validateJudgeResult(value);
  const destination = path.join(context.root, "evaluations", executionId, `attempt-${String(lifecycle.attempt).padStart(2, "0")}.json`); if (await exists(destination)) fail("Judge result already accepted for this attempt"); await writeJson(destination, value); lifecycle.evaluation = path.relative(context.root, destination); lifecycle.status = "completed"; await saveState(context); return { ok: true, evaluation: lifecycle.evaluation };
}

function score(evaluation, rubric) {
  if (evaluation.run_validity !== "valid") return { score: null, verdict: evaluation.run_validity, vector: [] };
  const values = new Map(evaluation.criteria.map((entry) => [entry.id, entry])); let earned = 0; let possible = 0; let essentialFailure = false;
  const vector = rubric.criteria.map((criterion) => { const finding = values.get(criterion.id); const status = finding?.status ?? "fail"; const points = status === "pass" ? 1 : status === "partial" ? 0.5 : 0; if (status !== "not_applicable") possible += criterion.weight; earned += status === "not_applicable" ? 0 : criterion.weight * points; if (criterion.essential && status === "fail") essentialFailure = true; return { id: criterion.id, status, weight: criterion.weight, points }; });
  const value = possible === 0 ? 1 : earned / possible; return { score: value, verdict: essentialFailure || value < rubric.thresholds.fail ? "fail" : value >= rubric.thresholds.pass ? "pass" : "pass_with_findings", vector };
}
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function renderMarkdown(report) { const rows = report.executions.map((entry) => `| ${entry.id} | ${entry.verdict} | ${entry.score ?? "n/a"} |`).join("\n"); return `# ${report.case_id}\n\n| Execution | Verdict | Score |\n| --- | --- | --- |\n${rows}\n`; }
function renderHtml(report) { const rows = report.executions.map((entry) => `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.verdict)}</td><td>${entry.score ?? "n/a"}</td></tr>`).join(""); return `<!doctype html><main><h1>${escapeHtml(report.case_id)}</h1><table><thead><tr><th>Execution</th><th>Verdict</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></main>`; }

export async function finalize({ evalRoot }) {
  const context = await openEval(evalRoot); const loaded = await loadCase(context.manifest.definition.case_id); const executions = [];
  for (const execution of context.manifest.executions) { const lifecycle = context.state.executions[execution.id]; if (!lifecycle.evaluation) fail(`execution has no accepted Judge result: ${execution.id}`); const evaluation = await readJson(path.join(context.root, lifecycle.evaluation)); const definition = executionDefinition(loaded.definition, execution.kind); const rubric = await readJson(await requireFile(loaded.caseDir, definition.rubric, "rubric")); executions.push({ id: execution.id, ...score(evaluation, rubric), evaluation: lifecycle.evaluation, candidate: lifecycle.candidate }); }
  const report = { schema_id: "dd-eval/report@1", run_id: context.manifest.run_id, case_id: context.manifest.definition.case_id, generated_at: now(), executions }; await writeJson(path.join(context.root, "report.json"), report); await writeFile(path.join(context.root, "report.md"), renderMarkdown(report)); await writeFile(path.join(context.root, "report.html"), renderHtml(report)); context.state.status = "completed"; await saveState(context); return { ok: true, report: path.join(context.root, "report.json") };
}

export function defaultSource() { return process.env.DD_TASKS_REPO || path.resolve(repoRoot, "..", "dd-tasks"); }
