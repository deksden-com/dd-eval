import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
function evalHome(value = process.env.DD_EVAL_HOME) { const home = value || path.join(homedir(), ".dd-eval"); if (!path.isAbsolute(home)) fail("DD_EVAL_HOME must be an absolute path"); return path.resolve(home); }
function homeRelative(home, file) { const rel = path.relative(home, file); if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail(`path is outside DD_EVAL_HOME: ${file}`); return rel.split(path.sep).join("/"); }
function fromHome(home, locator) { return inside(home, relative(locator, "DD_EVAL_HOME locator")); }

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
async function filesBelow(root, prefix = "") {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(root, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}
async function requireFile(root, rel, label) { const file = inside(root, relative(rel, label)); if (!(await exists(file))) fail(`${label} is missing: ${rel}`); return file; }
async function requireJson(root, rel, label) { return readJson(await requireFile(root, rel, label)); }

function requireMode(value = "authoring") { if (!["authoring", "scored"].includes(value)) fail("--require must be authoring or scored"); return value; }

function validateCase(definition, caseId) {
  record(definition, "case");
  if (definition.schema_id !== "dd-eval/case@3") fail("case must use dd-eval/case@3");
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
  record(definition.canonical_checkpoints, "case.canonical_checkpoints");
  for (const stage of stages) {
    const entry = definition.stages[stage]; record(entry, `case.stages.${stage}`);
    for (const key of ["subject_packet", "judge_packet", "rubric", "expectations", "oracle", "interactions"]) relative(entry[key], `stage ${stage} ${key}`);
    if (!Array.isArray(entry.candidate_files)) fail(`case.stages.${stage}.candidate_files must be an array`);
    relative(definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`);
  }
  record(definition.e2e, "case.e2e");
  for (const key of ["subject_packet", "judge_packet", "rubric", "expectations", "oracle", "interactions"]) relative(definition.e2e[key], `e2e ${key}`);
  if (definition.e2e.stop_boundary !== "plan_review_accepted") fail("e2e.stop_boundary must be plan_review_accepted");
  if (definition.priming !== undefined) {
    record(definition.priming, "case.priming");
    relative(definition.priming.controller_packet, "priming controller packet");
    relative(definition.priming.subject_baseline, "subject baseline");
  }
  relative(definition.judge_baseline, "judge baseline");
}

async function loadProfile(profileId) { id(profileId, "profile id"); const profile = await readJson(path.join(repoRoot, "profiles", `${profileId}.json`)); if (profile.id !== profileId) fail(`profile id mismatch: ${profileId}`); return profile; }

export async function loadCase(caseId) {
  id(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId); const definition = await readJson(path.join(caseDir, "case.json")); validateCase(definition, caseId);
  const checkpoints = {};
  for (const stage of stages) {
    const entry = definition.stages[stage];
    for (const key of ["subject_packet", "judge_packet"]) await requireFile(caseDir, entry[key], `stage ${stage} ${key}`);
    for (const key of ["rubric", "expectations", "oracle", "interactions"]) await requireJson(caseDir, entry[key], `stage ${stage} ${key}`);
    const checkpoint = await requireJson(caseDir, definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`);
    if (checkpoint.schema_id !== "dd-eval/canonical-stage-checkpoint@2" || checkpoint.stage !== stage || !["pending_capture", "accepted"].includes(checkpoint.status)) fail(`invalid canonical checkpoint ${stage}`);
    if (checkpoint.status === "accepted" && (typeof checkpoint.runtime_snapshot?.locator !== "string" || !record(checkpoint.subject, `checkpoint ${stage} subject`).checkpoint_session_id || !checkpoint.acceptance_review?.path)) fail(`accepted canonical checkpoint ${stage} is incomplete`);
    checkpoints[stage] = checkpoint;
  }
  for (const key of ["subject_packet", "judge_packet"]) await requireFile(caseDir, definition.e2e[key], `e2e ${key}`);
  for (const key of ["rubric", "expectations", "oracle", "interactions"]) await requireJson(caseDir, definition.e2e[key], `e2e ${key}`);
  await requireJson(caseDir, definition.judge_baseline, "judge baseline");
  if (definition.priming) {
    await requireFile(caseDir, definition.priming.controller_packet, "priming controller packet");
    await requireJson(caseDir, definition.priming.subject_baseline, "subject baseline");
  }
  return { caseDir, definition, checkpoints };
}

async function loadStarterSessions(loaded) {
  const registry = await readJson(path.join(loaded.caseDir, "starter-sessions.json"));
  if (registry.schema_id !== "dd-eval/starter-sessions@1" || registry.case_id !== loaded.definition.id) fail("invalid starter session registry");
  const revisions = new Set(stages.map((stage) => loaded.checkpoints[stage].revision));
  if (revisions.size !== 1 || registry.revision !== [...revisions][0]) fail("starter session registry revision does not match canonical checkpoints");
  const sessions = record(registry.sessions, "starter session registry sessions");
  for (const stage of stages) {
    const entry = record(sessions[stage], `starter session ${stage}`);
    if (typeof entry.session_id !== "string" || !entry.session_id.trim()) fail(`starter session ${stage} is missing`);
  }
  return registry;
}

export async function validateInput({ caseId, source, requireMode: requiredMode = "authoring" }) {
  const mode = requireMode(requiredMode);
  const loaded = await loadCase(caseId); const sourceRoot = path.resolve(source);
  if (!(await stat(sourceRoot)).isDirectory()) fail(`source is not a directory: ${sourceRoot}`);
  const checkpoint = await readJson(path.join(repoRoot, "checkpoints", `${loaded.definition.checkpoint.id}.json`));
  if (checkpoint.source?.commit !== loaded.definition.checkpoint.commit) fail("case checkpoint does not match checkpoint record");
  const resolved = await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.tag}^{commit}`]);
  if (resolved !== checkpoint.source.commit) fail(`checkpoint tag resolved to ${resolved}, expected ${checkpoint.source.commit}`);
  const starters = mode === "scored" ? await loadStarterSessions(loaded) : null;
  const judgeBaseline = mode === "scored" ? await acceptedJudgeBaseline(loaded) : null;
  if (mode === "scored") for (const stage of [...stages, "e2e"]) await acceptedReferences(loaded.caseDir, executionDefinition(loaded.definition, stage), stage);
  return { ...loaded, starters, judgeBaseline, sourceRoot, checkpoint, sourceTree: await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.commit}^{tree}`]) };
}

async function acceptedJudgeBaseline(loaded) {
  const baseline = await requireJson(loaded.caseDir, loaded.definition.judge_baseline, "judge baseline");
  if (baseline.schema_id !== "dd-eval/session-baseline@1" || baseline.role !== "judge" || baseline.status !== "accepted" || typeof baseline.session_id !== "string" || !baseline.session_id.trim()) fail("judge baseline is not accepted");
  if (!loaded.definition.profiles.judge.includes(baseline.profile)) fail("judge baseline profile is not allowed by this case");
  return baseline;
}

async function acceptedReferences(caseDir, definition, stage) {
  const expectations = await requireJson(caseDir, definition.expectations, `${stage} expectations`);
  const oracle = await requireJson(caseDir, definition.oracle, `${stage} oracle`);
  for (const [kind, value] of [["expectations", expectations], ["oracle", oracle]]) {
    if (value.schema_id !== `dd-eval/${kind}@1` || value.status !== "accepted" || value.scope?.stage !== stage || !Array.isArray(kind === "oracle" ? value.findings : value.items)) fail(`${stage} ${kind} are not accepted`);
  }
  return { expectations, oracle };
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

function selectedStages(value) { if (!value) return []; const selected = value.split(",").filter(Boolean); if (new Set(selected).size !== selected.length || selected.some((stage) => !stages.includes(stage))) fail(`--focus must be a comma-separated subset of ${stages.join(",")}`); return selected; }
function selectedSegment(value) {
  if (!value) return [];
  const [first, last, ...rest] = value.split("..");
  const start = stages.indexOf(first); const end = stages.indexOf(last);
  if (rest.length > 0 || start < 0 || end < start) fail(`--segment must be start..end in ${stages.join(",")}`);
  return stages.slice(start, end + 1);
}
async function allocateEvalOutput(caseId, mode) {
  const home = evalHome(); const lock = path.join(home, ".sequence.lock");
  try { await mkdir(lock); } catch { fail("another dd-eval allocation is in progress"); }
  try {
    const sequenceFile = path.join(home, "sequence.json"); const current = await exists(sequenceFile) ? await readJson(sequenceFile) : { next: 1 };
    const number = Number.isInteger(current.next) && current.next > 0 ? current.next : 1;
    await writeJson(sequenceFile, { next: number + 1, updated_at: now() });
    return path.join(home, "attempts", "active", `EVAL-${String(number).padStart(3, "0")}--${caseId}--${mode}`);
  } finally { await rm(lock, { recursive: true, force: true }); }
}
function executionDefinition(definition, kind) { return kind === "e2e" ? definition.e2e : definition.stages[kind]; }
async function copyPacket(caseDir, from, destination) { const source = await requireFile(caseDir, from, "packet"); await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination); return { path: destination, sha256: await materialHash(destination), source: from }; }
async function writePacket(destination, content, source) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, content); return { path: destination, sha256: await materialHash(destination), source }; }
function controllerBoundary(stage) { return `# Focused execution boundary\n\nThis execution measures only \`${stage}\`. Give the Subject the exact \`subject.md\` message after its normal priming. Add one harness-boundary sentence before that message: after successful \`stage finish\` for \`${stage}\`, stop and do not follow any returned next-stage directive; the Controller will sync and checkpoint first.\n\nAs soon as the Subject reports successful finish, run \`dd-eval sync\` and \`dd-eval checkpoint\`. If another stage was started or an artifact changed after the finished-stage receipt, classify the attempt as \`invalid_infrastructure_flow\`; never score it as a focused-stage candidate.\n`; }
function shell(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
function subjectContinuation({ stage, projectRoot, ddFlowHome, flowRunId, intakeFile = null, packet, focused }) {
  const intake = stage === "specify" && intakeFile ? ` --intake-file ${shell(intakeFile)}` : "";
  const start = `DD_FLOW_HOME=${shell(ddFlowHome)} dd-flow stage start ${shell(flowRunId)} --stage ${shell(stage)} --project-root ${shell(projectRoot)}${intake} --json`;
  const boundary = focused ? `\n\nПосле успешного \`stage finish\` для ${stage} остановись. Не запускай следующую стадию.` : "";
  return `Работай только в текущем восстановленном проекте: ${projectRoot}.\n\nПервым flow-действием выполни отдельной Bash-командой:\n\n\`${start}\`\n\nСледуй returned prompt этой команды и используй тот же inline \`DD_FLOW_HOME\` для всех последующих \`dd-flow\` команд.${boundary}\n\n${packet}\n`;
}
async function restoreCheckpoint({ checkpoint, projectRoot, runtimeHome, engine }) {
  if (checkpoint.status !== "accepted") fail(`canonical checkpoint for ${checkpoint.stage} is pending capture`);
  const output = await run(engine, ["run", "snapshot", "restore", "--snapshot", checkpoint.snapshot, "--project-root", projectRoot, "--json"], { env: { DD_FLOW_HOME: runtimeHome } });
  let restored;
  try { restored = JSON.parse(output); } catch { fail(`dd-flow snapshot restore did not return JSON: ${output}`); }
  // RUN snapshots exclude engines. Re-materialize only the immutable snapshot
  // recorded by the checkpoint, never a same-version current build.
  const canonicalHome = checkpoint.engine_receipt?.dd_flow_home;
  if (typeof canonicalHome !== "string") fail(`canonical checkpoint ${checkpoint.stage} lacks its engine runtime`);
  // Checkpoints may refer only to the managed canonical store; do not let a
  // case record copy an arbitrary local directory into an execution runtime.
  homeRelative(evalHome(), canonicalHome);
  const binding = await readJson(path.join(restored.run_home, "engine-binding.json"));
  const identity = binding.engine;
  if (!identity || typeof identity.package_name !== "string" || typeof identity.package_version !== "string" || typeof identity.integrity_checksum !== "string" || typeof identity.snapshot_root !== "string") fail(`canonical checkpoint ${checkpoint.stage} has an invalid engine binding`);
  const source = path.join(canonicalHome, "engines", identity.package_name.replaceAll("/", "_"), identity.package_version);
  const destination = identity.snapshot_root;
  if (!(await exists(path.join(source, "engine.json")))) fail(`canonical engine snapshot is missing: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true });
  const manifestPath = path.join(destination, "engine.json");
  const manifest = await readJson(manifestPath);
  manifest.package_root = destination;
  manifest.snapshot_root = destination;
  await writeJson(manifestPath, manifest);
  if (manifest.integrity?.checksum !== identity.integrity_checksum) fail(`canonical engine checksum does not match RUN binding for ${checkpoint.stage}`);
  return restored;
}

async function acceptedCheckpoint(caseDir, file, executionId) {
  const checkpoint = await requireJson(caseDir, file, `canonical checkpoint ${executionId}`);
  if (checkpoint.schema_id !== "dd-eval/canonical-stage-checkpoint@2" || checkpoint.stage !== executionId || checkpoint.status !== "accepted") fail(`canonical checkpoint is not accepted for ${executionId}`);
  if (typeof checkpoint.runtime_snapshot?.locator !== "string") fail(`canonical checkpoint snapshot is missing for ${executionId}`);
  const snapshot = fromHome(evalHome(), checkpoint.runtime_snapshot.locator);
  if (!(await exists(snapshot))) fail(`runtime snapshot is missing: ${checkpoint.runtime_snapshot}`);
  checkpoint.snapshot = snapshot;
  return checkpoint;
}

export async function captureCanonicalCheckpoint({ caseId, stage, revision = "REV-001", projectRoot, flowRunId, runtimeHome, canonicalSubjectSessionId, checkpointSubjectSessionId, agentId = null, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const loaded = await loadCase(caseId);
  if (!stages.includes(stage)) fail(`invalid stage: ${stage}`);
  if (!/^REV-\d{3}$/.test(revision)) fail("--revision must use REV-NNN");
  for (const [name, value] of [["--canonical-subject-session", canonicalSubjectSessionId], ["--checkpoint-subject-session", checkpointSubjectSessionId]]) if (typeof value !== "string" || !value.trim()) fail(`${name} is required`);
  const home = evalHome(); const checkpointRoot = path.join(home, "canonical", loaded.definition.id, revision, "checkpoints", `${stage}-entry`);
  const archiveRoot = path.join(checkpointRoot, "snapshot"); const outputFile = path.join(checkpointRoot, "capture.json");
  if (await exists(archiveRoot)) fail(`checkpoint archive already exists: ${archiveRoot}`);
  if (await exists(outputFile)) fail(`checkpoint record already exists: ${outputFile}`);
  const receipt = await ddFlow(engine, ["run", "snapshot", "create", flowRunId, "--stage-entry", stage, "--project-root", path.resolve(projectRoot), "--output", archiveRoot], { env: { DD_FLOW_HOME: path.resolve(runtimeHome) } });
  if (receipt.target_stage !== undefined && receipt.target_stage !== stage && receipt.stage_entry !== stage) fail(`engine captured wrong stage entry: ${receipt.target_stage ?? receipt.stage_entry}`);
  const record = {
    schema_id: "dd-eval/canonical-stage-checkpoint@2",
    case_id: loaded.definition.id,
    revision,
    stage,
    status: "pending_capture",
    runtime_snapshot: { locator: homeRelative(home, archiveRoot), sha256: sha(JSON.stringify(receipt)) },
    subject: { canonical_session_id: canonicalSubjectSessionId, checkpoint_session_id: checkpointSubjectSessionId, agent_id: agentId },
    captured_at: now(),
    engine_receipt: receipt
  };
  await writeJson(outputFile, record);
  return { checkpoint: outputFile, archive: archiveRoot, stage, status: "pending_capture" };
}

export async function acceptCanonicalCheckpoint({ caseId, stage, recordFile, reviewFile }) {
  const loaded = await loadCase(caseId);
  if (!stages.includes(stage)) fail(`invalid stage: ${stage}`);
  const recordFilePath = path.resolve(recordFile); const checkpoint = await readJson(recordFilePath);
  if (checkpoint.schema_id !== "dd-eval/canonical-stage-checkpoint@2" || checkpoint.stage !== stage || checkpoint.status !== "pending_capture") fail("checkpoint record is not an acceptable pending capture");
  const snapshot = fromHome(evalHome(), checkpoint.runtime_snapshot?.locator);
  if (!(await exists(snapshot))) fail("checkpoint runtime snapshot is missing");
  if (!checkpoint.subject?.canonical_session_id || !checkpoint.subject?.checkpoint_session_id) fail("checkpoint Subject sessions are missing");
  const review = path.resolve(reviewFile ?? ""); if (!reviewFile || !(await exists(review))) fail("--review is required and must exist");
  const accepted = { ...checkpoint, status: "accepted", accepted_at: now(), acceptance_review: { path: path.relative(loaded.caseDir, review).split(path.sep).join("/"), sha256: await materialHash(review), accepted_at: now() } };
  const destination = await requireFile(loaded.caseDir, loaded.definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`);
  await writeJson(destination, accepted);
  return { checkpoint: destination, stage, status: "accepted" };
}

export async function setStarterSession({ caseId, stage, sessionId, parentSessionId }) {
  const loaded = await loadCase(caseId);
  if (!stages.includes(stage)) fail(`invalid stage: ${stage}`);
  if (typeof sessionId !== "string" || !sessionId.trim()) fail("--session-id is required");
  const checkpoint = loaded.checkpoints[stage];
  if (checkpoint.status !== "accepted" || !checkpoint.subject?.checkpoint_session_id) fail(`canonical checkpoint is not accepted for ${stage}`);
  if (parentSessionId !== checkpoint.subject.checkpoint_session_id) fail("--parent-session-id must equal the frozen checkpoint Session ID");
  const revisions = new Set(stages.map((item) => loaded.checkpoints[item].revision));
  if (revisions.size !== 1) fail("canonical checkpoints do not share one revision");
  const destination = path.join(loaded.caseDir, "starter-sessions.json");
  const registry = await exists(destination) ? await readJson(destination) : { schema_id: "dd-eval/starter-sessions@1", case_id: loaded.definition.id, revision: [...revisions][0], sessions: {} };
  if (registry.schema_id !== "dd-eval/starter-sessions@1" || registry.case_id !== loaded.definition.id || registry.revision !== [...revisions][0]) fail("existing starter session registry does not match this canonical chain");
  registry.sessions = record(registry.sessions, "starter session registry sessions");
  registry.sessions[stage] = { session_id: sessionId };
  await writeJson(destination, registry);
  return { case_id: loaded.definition.id, stage, session_id: sessionId, registry: destination };
}

export async function prepare({ caseId, source, output = null, controllerProfileId, subjectProfileId, judgeProfileId, stageList, segment, e2e = false, scenario = null, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const context = await validateInput({ caseId, source, requireMode: "scored" }); const selected = selectedStages(stageList); const segmentStages = selectedSegment(segment); if (selected.length > 0 && segmentStages.length > 0) fail("use exactly one of --focus or --segment"); if (selected.length === 0 && segmentStages.length === 0 && !e2e) fail("select --focus, --segment, or --e2e");
  const scenarioReceipt = scenario ? { path: relative(scenario, "scenario"), sha256: await materialHash(await requireFile(context.caseDir, scenario, "scenario")) } : null;
  const executionKinds = segmentStages.length > 0 ? [segmentStages.join("+")] : selected;
  const defaults = context.definition.default_profiles ?? {};
  const profileIds = { controller: controllerProfileId ?? defaults.controller, subject: subjectProfileId ?? defaults.subject, judge: judgeProfileId ?? defaults.judge };
  for (const [role, profileId] of Object.entries(profileIds)) { if (!profileId) fail(`--${role}-profile is required because this case has no default`); if (!context.definition.profiles[role].includes(profileId)) fail(`${role} profile is not allowed by this case: ${profileId}`); }
  const profiles = Object.fromEntries(await Promise.all(Object.entries(profileIds).map(async ([role, profileId]) => [role, await loadProfile(profileId)])));
  for (const [role, profile] of Object.entries(profiles)) {
    if (profile.runtime?.dd_flow_cli?.engine_commit && profile.runtime.dd_flow_cli.engine_commit !== context.definition.compatibility.engine_commit) fail(`${role} profile engine commit does not match the case`);
  }
  const mode = e2e ? "e2e" : segment ? "segment" : "focus";
  const outputRoot = output ? path.resolve(output) : await allocateEvalOutput(caseId, mode);
  if (output && !path.resolve(outputRoot).startsWith(`${evalHome()}${path.sep}`)) fail("--output must be inside DD_EVAL_HOME");
  if (await exists(outputRoot)) fail(`output already exists: ${outputRoot}`);
  const runId = `eval-${randomUUID()}`; const executions = [...executionKinds, ...(e2e ? ["e2e"] : [])].map((kind) => ({ id: kind, kind, attempt: 1, status: "prepared", flow_run_id: null, run_home: null, dd_flow_home: null, project_root: null, sessions: [] }));
  const temporary = `${outputRoot}.tmp-${process.pid}`; const pendingCheckpoints = []; let published = false; await rm(temporary, { recursive: true, force: true });
  try {
    await mkdir(path.join(temporary, "executions"), { recursive: true }); const promptReceipts = {};
    for (const execution of executions) {
      const firstStage = execution.kind.includes("+") ? execution.kind.split("+")[0] : execution.kind;
      const definition = executionDefinition(context.definition, firstStage); const root = path.join(temporary, "executions", execution.id, "attempt-01"); const projectRoot = path.join(root, "project");
      execution.project_root = projectRoot; execution.input = await materializeProject(context.sourceRoot, context.checkpoint, projectRoot);
      const packetRoot = path.join(root, "prompts"); promptReceipts[execution.id] = { controller: await writePacket(path.join(packetRoot, "controller.md"), controllerBoundary(execution.kind), "generated:focused-boundary"), subject: await copyPacket(context.caseDir, definition.subject_packet, path.join(packetRoot, "subject.md")), judge: await copyPacket(context.caseDir, definition.judge_packet, path.join(packetRoot, "judge.md")) };
      const checkpointStage = execution.kind === "e2e" ? "specify" : firstStage;
      const checkpoint = await acceptedCheckpoint(context.caseDir, context.definition.canonical_checkpoints[checkpointStage], checkpointStage);
      execution.subject_starter_session_id = context.starters.sessions[checkpointStage].session_id;
      pendingCheckpoints.push({ execution, checkpoint, definition, checkpointStage });
    }
    for (const execution of executions) {
      execution.project_root = finalPath(execution.project_root, temporary, outputRoot);
      execution.run_home = finalPath(execution.run_home, temporary, outputRoot);
    }
    for (const receipts of Object.values(promptReceipts)) for (const receipt of Object.values(receipts)) receipt.path = finalPath(receipt.path, temporary, outputRoot);
    await rename(temporary, outputRoot); published = true;
    for (const { execution, checkpoint, definition, checkpointStage } of pendingCheckpoints) {
      const runtimeHome = path.join(path.dirname(execution.project_root), "dd-flow-home"); const restored = await restoreCheckpoint({ checkpoint, projectRoot: execution.project_root, runtimeHome, engine }); execution.flow_run_id = restored.run_id ?? null; execution.run_home = restored.run_home ?? null; execution.dd_flow_home = runtimeHome;
      execution.subject_checkpoint = checkpoint.subject;
      if (!execution.flow_run_id || !execution.run_home) fail(`snapshot restore returned incomplete receipt for ${execution.kind}`);
      const staticPacket = await readFile(await requireFile(context.caseDir, definition.subject_packet, "packet"), "utf8");
      const intakeFile = checkpointStage === "specify" ? path.join(path.dirname(promptReceipts[execution.id].subject.path), "intake.md") : null;
      if (intakeFile) await writePacket(intakeFile, staticPacket, `${definition.subject_packet}:raw-intake`);
      promptReceipts[execution.id].subject = await writePacket(promptReceipts[execution.id].subject.path, subjectContinuation({ stage: checkpointStage, projectRoot: execution.project_root, ddFlowHome: runtimeHome, flowRunId: execution.flow_run_id, intakeFile, packet: staticPacket, focused: execution.kind !== "e2e" }), `${definition.subject_packet}+generated-runtime-continuation`);
    }
    const profile_selection = Object.fromEntries(Object.entries(profileIds).map(([role, profileId]) => [role, { id: profileId, source: (role === "controller" ? controllerProfileId : role === "subject" ? subjectProfileId : judgeProfileId) ? "command_override" : "case_default" }]));
    const manifest = { schema_id: "dd-eval/run-manifest@1", run_id: runId, created_at: now(), definition: { suite_id: context.definition.suite_id, case_id: caseId, case_sha256: await materialHash(path.join(context.caseDir, "case.json")), starter_sessions_sha256: await materialHash(path.join(context.caseDir, "starter-sessions.json")), checkpoint_id: context.checkpoint.id, checkpoint_commit: context.checkpoint.source.commit, source_tree: context.sourceTree, engine_commit: context.definition.compatibility.engine_commit, flow_pack_commit: context.definition.compatibility.flow_pack_commit }, scenario: scenarioReceipt, selection: { focused_stages: selected, segment: segment ?? null, e2e: Boolean(e2e) }, profiles, profile_selection, judge_baseline: context.judgeBaseline, executions, prompt_receipts: promptReceipts };
    const state = { schema_id: "dd-eval/run-state@1", run_id: runId, status: "prepared", updated_at: now(), executions: Object.fromEntries(executions.map((execution) => [execution.id, { status: "prepared", attempt: 1, incidents: [] }])) };
    await writeJson(path.join(outputRoot, "manifest.json"), manifest); await writeJson(path.join(outputRoot, "state.json"), state); await writeJson(path.join(outputRoot, "sessions.json"), { schema_id: "dd-eval/sessions@1", sessions: [] });
    return { output: outputRoot, run_id: runId, executions: executions.map(({ id: executionId, project_root, flow_run_id, subject_starter_session_id }) => ({ id: executionId, project_root, flow_run_id, subject_starter_session_id })) };
  } catch (error) { if (published) await rm(outputRoot, { recursive: true, force: true }); throw error; } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function openEval(evalRoot) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const state = await readJson(path.join(root, "state.json")); const sessions = await readJson(path.join(root, "sessions.json"));
  if (manifest.schema_id !== "dd-eval/run-manifest@1" || state.schema_id !== "dd-eval/run-state@1" || sessions.schema_id !== "dd-eval/sessions@1") fail("invalid prepared eval directory");
  return { root, manifest, state, sessions };
}
function findExecution(manifest, executionId) { const execution = manifest.executions.find((item) => item.id === executionId); if (!execution) fail(`unknown execution: ${executionId}`); return execution; }
async function saveState(context) { context.state.updated_at = now(); await writeJson(path.join(context.root, "state.json"), context.state); await writeJson(path.join(context.root, "sessions.json"), context.sessions); }

export async function addSession({ evalRoot, executionId, role, sessionId, parentSessionId, agentId = null }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); if (!/^(controller|subject_base|subject|judge)$/.test(role)) fail(`invalid role: ${role}`); if (typeof sessionId !== "string" || !sessionId.trim()) fail("--session-id is required");
  if (role === "subject") {
    if (!execution.subject_starter_session_id) fail(`execution ${executionId} has no starter Session`);
    if (parentSessionId !== execution.subject_starter_session_id) fail("Subject parent must equal the prepared starter Session ID");
    if (sessionId === execution.subject_starter_session_id) fail("Subject Session must be a fresh child of the starter Session");
  }
  if (role === "judge") {
    const baseline = context.manifest.judge_baseline;
    if (typeof baseline?.session_id !== "string" || !baseline.session_id.trim()) fail("prepared eval has no accepted Judge baseline");
    if (parentSessionId !== baseline.session_id) fail("Judge parent must equal the accepted Judge baseline Session ID");
    if (sessionId === baseline.session_id) fail("Judge Session must be a fresh child of the accepted Judge baseline Session");
  }
  if (context.sessions.sessions.some((item) => item.session_id === sessionId && item.execution_id === executionId && item.role === role)) return { ok: true, idempotent: true };
  context.sessions.sessions.push({ execution_id: executionId, role, session_id: sessionId, parent_session_id: parentSessionId ?? null, agent_id: agentId, recorded_at: now() }); await saveState(context); return { ok: true, idempotent: false };
}
async function ddFlow(engine, args, options = {}) { const output = await run(engine, [...args, "--json"], options); try { return JSON.parse(output); } catch { fail(`dd-flow did not return JSON: ${output}`); } }
function runtimeHome(execution) { if (execution.dd_flow_home) return execution.dd_flow_home; const marker = `${path.sep}projects${path.sep}`; const at = execution.run_home?.indexOf(marker) ?? -1; return at > 0 ? execution.run_home.slice(0, at) : null; }

export async function sync({ evalRoot, executionId, projectRoot, flowRunId, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const root = path.resolve(projectRoot); const runId = flowRunId ?? execution.flow_run_id; if (!runId) fail("--flow-run is required until the execution has an imported RUN"); const home = runtimeHome(execution); const options = home ? { env: { DD_FLOW_HOME: home } } : {};
  const status = await ddFlow(engine, ["run", "status", runId, "--project-root", root], options); const sessionList = await ddFlow(engine, ["stat", "run", "sessions", "ls", "--run", runId, "--project-root", root], options); let usage = null; try { usage = await ddFlow(engine, ["stat", "usage", "--run", runId, "--project-root", root], options); } catch { /* provider data may be unavailable */ }
  execution.project_root = root; execution.flow_run_id = runId; execution.run_home = status.run?.run_home_path ?? execution.run_home; execution.dd_flow_home ??= runtimeHome(execution);
  const stage = execution.kind === "e2e" ? "plan-review" : execution.kind; const stageState = status.index?.stage_runs?.find((item) => item.stage === stage)?.status ?? null; const pausedStage = status.index?.stage_runs?.find((item) => item.status === "paused") ?? null; const loaded = await loadCase(context.manifest.definition.case_id); const interactionScript = await requireJson(loaded.caseDir, executionDefinition(loaded.definition, execution.kind).interactions, "interaction script"); const pauseOrdinal = Number(String(pausedStage?.pause?.id ?? "").match(/^HITL-(\d+)$/)?.[1] ?? 0); const declared = pauseOrdinal > 0 && interactionScript.pauses?.some((pause) => pause.stage === pausedStage.stage && pause.after_pause === pauseOrdinal); const interaction = pausedStage?.pause ? { stage: pausedStage.stage, pause_id: pausedStage.pause.id, question_path: pausedStage.pause.question_path, declared: Boolean(declared) } : null; const lifecycle = context.state.executions[executionId]; lifecycle.flow = { status, sessions: sessionList, usage, interaction };
  lifecycle.status = stageState === "paused" || status.run?.status === "waiting_for_user" ? "waiting_for_user" : stageState === "done" ? "candidate_ready" : "running"; context.state.status = lifecycle.status === "waiting_for_user" ? "running" : context.state.status === "prepared" ? "running" : context.state.status;
  await writeJson(path.join(context.root, "manifest.json"), context.manifest); await saveState(context); return { ok: true, execution: executionId, status: lifecycle.status, ...(interaction ? { interaction } : {}), next_action: lifecycle.status === "waiting_for_user" ? declared ? "deliver_declared_interaction" : "deliver_observed_interaction" : lifecycle.status === "candidate_ready" ? "checkpoint" : "wait_for_subject" };
}

async function sourceFile(execution, descriptor) { record(descriptor, "candidate file"); if (!["project", "run"].includes(descriptor.origin)) fail("candidate file origin must be project or run"); const root = descriptor.origin === "project" ? execution.project_root : execution.run_home; if (!root) fail(`candidate file origin is unavailable: ${descriptor.origin}`); return { source: inside(root, relative(descriptor.path, "candidate file path")), destination: path.join(descriptor.origin, descriptor.path) }; }

export async function checkpoint({ evalRoot, executionId }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (lifecycle.status !== "candidate_ready") fail(`execution ${executionId} is not ready to checkpoint`);
  const definition = executionDefinition((await loadCase(context.manifest.definition.case_id)).definition, execution.kind); const destination = path.join(context.root, "candidates", executionId, `attempt-${String(lifecycle.attempt).padStart(2, "0")}`); if (await exists(destination)) fail(`candidate already checkpointed: ${executionId}`);
  const artifacts = [];
  for (const descriptor of definition.candidate_files) { const file = await sourceFile(execution, descriptor); if (!(await exists(file.source))) fail(`candidate artifact is missing: ${file.destination}`); const target = inside(destination, file.destination); await mkdir(path.dirname(target), { recursive: true }); await cp(file.source, target); artifacts.push({ path: file.destination.split(path.sep).join("/"), sha256: await materialHash(target), bytes: (await stat(target)).size }); }
  const hitlRoot = path.join(execution.run_home, "intake", "hitl");
  if (await exists(hitlRoot)) for (const rel of await filesBelow(hitlRoot)) {
    const source = inside(hitlRoot, rel); const target = inside(destination, path.join("run", "intake", "hitl", rel));
    await mkdir(path.dirname(target), { recursive: true }); await cp(source, target);
    artifacts.push({ path: path.join("run", "intake", "hitl", rel).split(path.sep).join("/"), sha256: await materialHash(target), bytes: (await stat(target)).size });
  }
  const candidate = { schema_id: "dd-eval/candidate@1", run_id: context.manifest.run_id, execution_id: executionId, attempt: lifecycle.attempt, captured_at: now(), flow_run_id: execution.flow_run_id, source: lifecycle.flow?.status ?? null, artifacts };
  await writeJson(path.join(destination, "candidate.json"), candidate); lifecycle.candidate = path.relative(context.root, path.join(destination, "candidate.json")); await saveState(context); return { ok: true, candidate: lifecycle.candidate };
}

export async function judgePrepare({ evalRoot, executionId }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (!lifecycle.candidate) fail("checkpoint is required before Judge preparation"); const loaded = await loadCase(context.manifest.definition.case_id); const definition = executionDefinition(loaded.definition, execution.kind); const candidate = await readJson(path.join(context.root, lifecycle.candidate));
  const references = await acceptedReferences(loaded.caseDir, definition, execution.kind);
  const packet = ["# Evaluation packet", "", await readFile(await requireFile(loaded.caseDir, definition.judge_packet, "Judge packet"), "utf8"), "", "## Candidate receipt", "```json", JSON.stringify(candidate, null, 2), "```", "", "## Interaction evidence", "If the receipt includes `run/intake/hitl/...`, inspect those captured question/answer pairs. Treat an additional question as candidate behavior, not an infrastructure failure: assess whether it was materially justified and whether its answer was already available in the Subject's received context.", "", "## Rubric", await readFile(await requireFile(loaded.caseDir, definition.rubric, "rubric"), "utf8"), "", "## Case expectations", JSON.stringify(references.expectations, null, 2), "", "## Accepted oracle", JSON.stringify(references.oracle, null, 2)].join("\n");
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
