import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stages = ["specify", "protocolize", "plan", "plan-review"];

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
async function committedDefinitionIdentity() {
  const options = { cwd: repoRoot };
  const dirty = await run("git", ["status", "--porcelain=v1"], options);
  if (dirty) fail("dd-eval definition must be committed and clean before preparing a scored run");
  return { commit: await run("git", ["rev-parse", "HEAD"], options), tree: await run("git", ["rev-parse", "HEAD^{tree}"], options) };
}

function requireMode(value = "authoring") { if (!["authoring", "scored"].includes(value)) fail("--require must be authoring or scored"); return value; }

function validateCase(definition, caseId) {
  record(definition, "case");
  if (definition.schema_id !== "dd-eval/case@5") fail("case must use dd-eval/case@5");
  if (definition.id !== caseId) fail(`case id mismatch: ${definition.id}`);
  id(definition.suite_id, "suite_id"); id(definition.id, "case id");
  record(definition.checkpoint, "case.checkpoint"); id(definition.checkpoint.id, "checkpoint id");
  if (Object.keys(definition.checkpoint).length !== 1) fail("case.checkpoint must contain only id");
  if ("compatibility" in definition) fail("case.compatibility is obsolete; use the input checkpoint");
  relative(definition.assessment, "case assessment");
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
    for (const key of ["subject_packet", "interactions"]) relative(entry[key], `stage ${stage} ${key}`);
    if (!Array.isArray(entry.candidate_files)) fail(`case.stages.${stage}.candidate_files must be an array`);
    relative(definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`);
  }
  record(definition.e2e, "case.e2e");
  for (const key of ["subject_packet", "interactions"]) relative(definition.e2e[key], `e2e ${key}`);
  if (definition.e2e.stop_boundary !== "plan_review_accepted") fail("e2e.stop_boundary must be plan_review_accepted");
  if (definition.priming !== undefined) {
    record(definition.priming, "case.priming");
    relative(definition.priming.controller_packet, "priming controller packet");
    id(definition.priming.canonical_subject_profile, "canonical subject profile");
    if (!definition.profiles.subject.includes(definition.priming.canonical_subject_profile)) fail("canonical subject profile must be an allowed subject profile");
    const baselines = record(definition.priming.subject_baselines, "subject baselines");
    for (const profile of definition.profiles.subject) relative(baselines[profile], `subject baseline ${profile}`);
  }
  relative(definition.judge_baseline, "judge baseline");
}

function validateCriteria(criteria, label) {
  if (!Array.isArray(criteria) || criteria.length === 0) fail(`${label} must be a non-empty array`);
  const ids = new Set();
  let total = 0;
  for (const criterion of criteria) {
    record(criterion, `${label} criterion`); id(criterion.id, `${label} criterion id`);
    if (ids.has(criterion.id)) fail(`${label} has duplicate criterion: ${criterion.id}`);
    ids.add(criterion.id);
    if (typeof criterion.weight !== "number" || criterion.weight <= 0 || !Number.isFinite(criterion.weight)) fail(`${label} criterion weight is invalid`);
    if (typeof criterion.essential !== "boolean") fail(`${label} criterion essential is invalid`);
    total += criterion.weight;
  }
  if (Math.abs(total - 1) > 0.000001) fail(`${label} weights must sum to 1`);
}

function validateAssessment(value, caseId) {
  record(value, "assessment");
  if (value.schema_id !== "dd-eval/assessment@1" || value.case_id !== caseId || value.status !== "accepted") fail("assessment must be accepted dd-eval/assessment@1 for this case");
  record(value.scopes, "assessment scopes");
  for (const scope of [...stages, "e2e"]) {
    const entry = record(value.scopes[scope], `assessment ${scope}`);
    if (typeof entry.note !== "string" || !entry.note.trim()) fail(`assessment ${scope} note is required`);
    validateCriteria(entry.outcome, `assessment ${scope} outcome`);
    validateCriteria(entry.flow, `assessment ${scope} flow`);
    const golden = record(entry.golden, `assessment ${scope} golden`);
    for (const key of ["required_outcomes", "accepted_strong_decisions", "accepted_alternatives", "known_risks"]) if (!Array.isArray(golden[key])) fail(`assessment ${scope} golden.${key} must be an array`);
  }
  return value;
}

async function loadProfile(profileId) { id(profileId, "profile id"); const profile = await readJson(path.join(repoRoot, "profiles", `${profileId}.json`)); if (profile.id !== profileId) fail(`profile id mismatch: ${profileId}`); return profile; }

export async function loadCase(caseId) {
  id(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId); const definition = await readJson(path.join(caseDir, "case.json")); validateCase(definition, caseId);
  await requireFile(repoRoot, "methodology/evaluation-methodology.md", "evaluation methodology");
  const assessment = validateAssessment(await requireJson(caseDir, definition.assessment, "case assessment"), caseId);
  const checkpoints = {};
  for (const stage of stages) {
    const entry = definition.stages[stage];
    await requireFile(caseDir, entry.subject_packet, `stage ${stage} subject packet`);
    await requireJson(caseDir, entry.interactions, `stage ${stage} interactions`);
    const checkpoint = await requireJson(caseDir, definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`);
    if (checkpoint.schema_id !== "dd-eval/canonical-stage-checkpoint@2" || checkpoint.stage !== stage || !["pending_capture", "accepted"].includes(checkpoint.status)) fail(`invalid canonical checkpoint ${stage}`);
    if (checkpoint.status === "accepted" && (typeof checkpoint.runtime_snapshot?.locator !== "string" || !record(checkpoint.subject, `checkpoint ${stage} subject`).checkpoint_session_id || !checkpoint.acceptance_review?.path)) fail(`accepted canonical checkpoint ${stage} is incomplete`);
    checkpoints[stage] = checkpoint;
  }
  await requireFile(caseDir, definition.e2e.subject_packet, "e2e subject packet");
  await requireJson(caseDir, definition.e2e.interactions, "e2e interactions");
  await requireJson(caseDir, definition.judge_baseline, "judge baseline");
  if (definition.priming) {
    await requireFile(caseDir, definition.priming.controller_packet, "priming controller packet");
    for (const profile of definition.profiles.subject) await requireJson(caseDir, definition.priming.subject_baselines[profile], `subject baseline ${profile}`);
  }
  return { caseDir, definition, assessment, checkpoints };
}

async function acceptedSubjectBaselines(loaded) {
  const priming = loaded.definition.priming;
  if (!priming) fail("subject priming is required for scored evaluation");
  const result = {};
  for (const profile of loaded.definition.profiles.subject) {
    const baseline = await requireJson(loaded.caseDir, priming.subject_baselines[profile], `subject baseline ${profile}`);
    if (baseline.schema_id !== "dd-eval/session-baseline@1" || baseline.role !== "subject" || baseline.profile !== profile || baseline.status !== "accepted" || typeof baseline.session_id !== "string" || !baseline.session_id.trim()) fail(`subject baseline is not accepted for ${profile}`);
    result[profile] = baseline;
  }
  return result;
}

async function loadStarterSessions(loaded, baselines) {
  const registry = await readJson(path.join(loaded.caseDir, "starter-sessions.json"));
  if (registry.schema_id !== "dd-eval/starter-sessions@2" || registry.case_id !== loaded.definition.id) fail("invalid starter session registry");
  const revisions = new Set(stages.map((stage) => loaded.checkpoints[stage].revision));
  if (revisions.size !== 1 || registry.revision !== [...revisions][0]) fail("starter session registry revision does not match canonical checkpoints");
  const subjects = record(registry.subjects, "starter session registry subjects");
  for (const profile of loaded.definition.profiles.subject) {
    const subject = record(subjects[profile], `starter subject ${profile}`);
    const sessions = record(subject.sessions, `starter sessions ${profile}`);
    for (const stage of stages) {
      const entry = record(sessions[stage], `starter session ${profile}/${stage}`);
      if (typeof entry.session_id !== "string" || !entry.session_id.trim()) fail(`starter session ${profile}/${stage} is missing`);
      const expectedParent = profile === loaded.definition.priming.canonical_subject_profile ? loaded.checkpoints[stage].subject.checkpoint_session_id : baselines[profile].session_id;
      if (entry.parent_session_id !== expectedParent) fail(`starter parent is invalid for ${profile}/${stage}`);
    }
  }
  return registry;
}

export async function validateInput({ caseId, source, requireMode: requiredMode = "authoring" }) {
  const mode = requireMode(requiredMode);
  const loaded = await loadCase(caseId); const sourceRoot = path.resolve(source);
  if (!(await stat(sourceRoot)).isDirectory()) fail(`source is not a directory: ${sourceRoot}`);
  const checkpointFile = path.join(repoRoot, "checkpoints", `${loaded.definition.checkpoint.id}.json`);
  const checkpoint = await readJson(checkpointFile);
  if (checkpoint.schema_version !== 1 || checkpoint.id !== loaded.definition.checkpoint.id) fail("case input checkpoint is invalid");
  if (!/^[a-f0-9]{40}$/.test(checkpoint.source?.commit ?? "") || typeof checkpoint.source?.tag !== "string" || !checkpoint.source.tag) fail("input checkpoint flow source is invalid");
  if (!/^[a-f0-9]{40}$/.test(checkpoint.memory_bank?.engine?.commit ?? "") || typeof checkpoint.memory_bank?.engine?.tag !== "string" || !checkpoint.memory_bank.engine.tag || typeof checkpoint.memory_bank?.dd_flow_cli !== "string" || !checkpoint.memory_bank.dd_flow_cli) fail("input checkpoint engine identity is invalid");
  const resolved = await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.tag}^{commit}`]);
  if (resolved !== checkpoint.source.commit) fail(`checkpoint tag resolved to ${resolved}, expected ${checkpoint.source.commit}`);
  const workspacePolicy = await readJson(path.join(sourceRoot, ".memory-bank", "dd-flow", "project-workspace.json"));
  if (workspacePolicy?.workspace?.next_stage_session !== loaded.definition.flow.handoff_mode) fail(`case flow.handoff_mode must match project workspace next_stage_session: ${workspacePolicy?.workspace?.next_stage_session ?? "missing"}`);
  if (mode === "scored") {
    for (const stage of stages) {
      if (loaded.checkpoints[stage].status !== "accepted") fail(`canonical checkpoint is not accepted for ${stage}`);
    }
  }
  const subjectBaselines = mode === "scored" ? await acceptedSubjectBaselines(loaded) : null;
  const starters = mode === "scored" ? await loadStarterSessions(loaded, subjectBaselines) : null;
  const judgeBaseline = mode === "scored" ? await acceptedJudgeBaseline(loaded) : null;
  if (mode === "scored") for (const stage of [...stages, "e2e"]) assessmentFor(loaded.assessment, stage);
  return { ...loaded, starters, subjectBaselines, judgeBaseline, sourceRoot, checkpoint, checkpointFile, sourceTree: await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.commit}^{tree}`]) };
}

async function acceptedJudgeBaseline(loaded) {
  const baseline = await requireJson(loaded.caseDir, loaded.definition.judge_baseline, "judge baseline");
  if (baseline.schema_id !== "dd-eval/session-baseline@1" || baseline.role !== "judge" || baseline.status !== "accepted" || typeof baseline.session_id !== "string" || !baseline.session_id.trim()) fail("judge baseline is not accepted");
  if (!loaded.definition.profiles.judge.includes(baseline.profile)) fail("judge baseline profile is not allowed by this case");
  return baseline;
}

function assessmentFor(assessment, scope) {
  const value = assessment.scopes?.[scope];
  if (!value) fail(`assessment scope is missing: ${scope}`);
  return value;
}

async function materializeProject(sourceRoot, checkpoint, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await run("git", ["clone", "--no-checkout", sourceRoot, target]);
  await run("git", ["checkout", "-B", "main", checkpoint.source.commit], { cwd: target });
  const commit = await run("git", ["rev-parse", "HEAD"], { cwd: target });
  if (commit !== checkpoint.source.commit) fail(`materialized commit mismatch: ${commit}`);
  const tree = await run("git", ["rev-parse", "HEAD^{tree}"], { cwd: target });
  const expectedTree = await run("git", ["-C", sourceRoot, "rev-parse", `${checkpoint.source.commit}^{tree}`]);
  if (tree !== expectedTree) fail(`materialized tree mismatch: ${tree}`);
  return { commit, tree };
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
export function subjectTaskTitle({ outputRoot, caseId, executionId, profile, attempt = 1 }) {
  const runNumber = path.basename(outputRoot).match(/^EVAL-(\d+)--/)?.[1];
  if (!runNumber) fail(`cannot derive eval number from output path: ${outputRoot}`);
  return `E${runNumber} · ${caseId} · a${String(attempt).padStart(2, "0")} · ${profile.model.replace(/^gpt-5\.6-/, "")}-${profile.reasoning} · ${executionId.toUpperCase()} · subject`;
}
async function copyPacket(caseDir, from, destination) { const source = await requireFile(caseDir, from, "packet"); await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination); return { path: destination, sha256: await materialHash(destination), source: from }; }
async function writePacket(destination, content, source) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, content); return { path: destination, sha256: await materialHash(destination), source }; }
function controllerBoundary(stage) { return `# Focused execution boundary\n\nThis execution measures only \`${stage}\`. Give the Subject the exact \`subject.md\` message after its normal priming. Add one harness-boundary sentence before that message: after successful \`stage finish\` for \`${stage}\`, stop and do not follow any returned next-stage directive; the Controller will sync and checkpoint first.\n\nAs soon as the Subject reports successful finish, run \`dd-eval sync\` and \`dd-eval checkpoint\`. If another stage was started or an artifact changed after the finished-stage receipt, classify the attempt as \`invalid_infrastructure_flow\`; never score it as a focused-stage candidate.\n`; }
function shell(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
export function subjectContinuation({ stage, projectRoot, workspaceRoot = projectRoot, ddFlowHome, flowRunId, intakeFile = null, packet, focused }) {
  const intake = stage === "specify" && intakeFile ? ` --intake-file ${shell(intakeFile)}` : "";
  const start = `DD_FLOW_HOME=${shell(ddFlowHome)} dd-flow stage start ${shell(flowRunId)} --stage ${shell(stage)} --project-root ${shell(projectRoot)} --require-session-binding${intake} --json`;
  const boundary = focused ? `\n\nПосле успешного \`stage finish\` для ${stage} остановись. Не запускай следующую стадию.` : "";
  return `Рабочий каталог восстановленной стадии: ${workspaceRoot}. Работай с файлами только там.\n\nПервым flow-действием выполни отдельной Bash-командой:\n\n\`${start}\`\n\n\`--project-root\` в этой команде — стабильный корень проекта; не заменяй его рабочим каталогом. Следуй returned prompt этой команды и используй тот же inline \`DD_FLOW_HOME\` для всех последующих \`dd-flow\` команд.${boundary}\n\n${packet}\n`;
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
  id(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId); const definition = await readJson(path.join(caseDir, "case.json")); validateCase(definition, caseId);
  if (!stages.includes(stage)) fail(`invalid stage: ${stage}`);
  const recordFilePath = path.resolve(recordFile); const checkpoint = await readJson(recordFilePath);
  if (checkpoint.schema_id !== "dd-eval/canonical-stage-checkpoint@2" || checkpoint.stage !== stage || checkpoint.status !== "pending_capture") fail("checkpoint record is not an acceptable pending capture");
  const snapshot = fromHome(evalHome(), checkpoint.runtime_snapshot?.locator);
  if (!(await exists(snapshot))) fail("checkpoint runtime snapshot is missing");
  if (!checkpoint.subject?.canonical_session_id || !checkpoint.subject?.checkpoint_session_id) fail("checkpoint Subject sessions are missing");
  const review = path.resolve(reviewFile ?? ""); if (!reviewFile || !(await exists(review))) fail("--review is required and must exist");
  const accepted = { ...checkpoint, status: "accepted", accepted_at: now(), acceptance_review: { path: path.relative(caseDir, review).split(path.sep).join("/"), sha256: await materialHash(review), accepted_at: now() } };
  const destination = inside(caseDir, relative(definition.canonical_checkpoints[stage], `canonical checkpoint ${stage}`));
  await writeJson(destination, accepted);
  return { checkpoint: destination, stage, status: "accepted" };
}

export async function setStarterSession({ caseId, stage, profileId, sessionId, parentSessionId }) {
  const loaded = await loadCase(caseId);
  if (!stages.includes(stage)) fail(`invalid stage: ${stage}`);
  if (!loaded.definition.profiles.subject.includes(profileId)) fail(`starter profile is not allowed: ${profileId}`);
  if (typeof sessionId !== "string" || !sessionId.trim()) fail("--session-id is required");
  const checkpoint = loaded.checkpoints[stage];
  if (checkpoint.status !== "accepted" || !checkpoint.subject?.checkpoint_session_id) fail(`canonical checkpoint is not accepted for ${stage}`);
  const baselines = await acceptedSubjectBaselines(loaded);
  const expectedParent = profileId === loaded.definition.priming.canonical_subject_profile ? checkpoint.subject.checkpoint_session_id : baselines[profileId].session_id;
  if (parentSessionId !== expectedParent) fail("--parent-session-id does not match the profile's protected source Session");
  const revisions = new Set(stages.map((item) => loaded.checkpoints[item].revision));
  if (revisions.size !== 1) fail("canonical checkpoints do not share one revision");
  const destination = path.join(loaded.caseDir, "starter-sessions.json");
  const registry = await exists(destination) ? await readJson(destination) : { schema_id: "dd-eval/starter-sessions@2", case_id: loaded.definition.id, revision: [...revisions][0], subjects: {} };
  if (registry.schema_id !== "dd-eval/starter-sessions@2" || registry.case_id !== loaded.definition.id || registry.revision !== [...revisions][0]) fail("existing starter session registry does not match this canonical chain");
  registry.subjects = record(registry.subjects, "starter session registry subjects");
  registry.subjects[profileId] = record(registry.subjects[profileId] ?? { sessions: {} }, `starter subject ${profileId}`);
  registry.subjects[profileId].sessions = record(registry.subjects[profileId].sessions, `starter sessions ${profileId}`);
  registry.subjects[profileId].sessions[stage] = { session_id: sessionId, parent_session_id: parentSessionId };
  await writeJson(destination, registry);
  return { case_id: loaded.definition.id, stage, profile: profileId, session_id: sessionId, registry: destination };
}

export async function prepare({ caseId, source, output = null, controllerProfileId, subjectProfileId, judgeProfileId, stageList, segment, e2e = false, scenario = null, engine = process.env.DD_FLOW_BIN || "dd-flow" }) {
  const context = await validateInput({ caseId, source, requireMode: "scored" }); const selected = selectedStages(stageList); const segmentStages = selectedSegment(segment); if (selected.length > 0 && segmentStages.length > 0) fail("use exactly one of --focus or --segment"); if (selected.length === 0 && segmentStages.length === 0 && !e2e) fail("select --focus, --segment, or --e2e");
  const executionKinds = segmentStages.length > 0 ? [segmentStages.join("+")] : selected;
  const checkpointByStage = new Map();
  for (const kind of [...executionKinds, ...(e2e ? ["e2e"] : [])]) {
    const stage = kind === "e2e" ? "specify" : kind.split("+")[0];
    if (!checkpointByStage.has(stage)) checkpointByStage.set(stage, await acceptedCheckpoint(context.caseDir, context.definition.canonical_checkpoints[stage], stage));
  }
  const definitionIdentity = await committedDefinitionIdentity();
  const scenarioReceipt = scenario ? { path: relative(scenario, "scenario"), sha256: await materialHash(await requireFile(context.caseDir, scenario, "scenario")) } : null;
  const defaults = context.definition.default_profiles ?? {};
  const profileIds = { controller: controllerProfileId ?? defaults.controller, subject: subjectProfileId ?? defaults.subject, judge: judgeProfileId ?? defaults.judge };
  for (const [role, profileId] of Object.entries(profileIds)) { if (!profileId) fail(`--${role}-profile is required because this case has no default`); if (!context.definition.profiles[role].includes(profileId)) fail(`${role} profile is not allowed by this case: ${profileId}`); }
  const profiles = Object.fromEntries(await Promise.all(Object.entries(profileIds).map(async ([role, profileId]) => [role, await loadProfile(profileId)])));
  const mode = e2e ? "e2e" : segment ? "segment" : "focus";
  const outputRoot = output ? path.resolve(output) : await allocateEvalOutput(caseId, mode);
  if (output && !path.resolve(outputRoot).startsWith(`${evalHome()}${path.sep}`)) fail("--output must be inside DD_EVAL_HOME");
  if (await exists(outputRoot)) fail(`output already exists: ${outputRoot}`);
  const runId = `eval-${randomUUID()}`; const executions = [...executionKinds, ...(e2e ? ["e2e"] : [])].map((kind) => ({ id: kind, kind, attempt: 1, status: "prepared", flow_run_id: null, run_home: null, dd_flow_home: null, project_root: null, workspace_root: null, sessions: [] }));
  const temporary = `${outputRoot}.tmp-${process.pid}`; const pendingCheckpoints = []; let published = false; await rm(temporary, { recursive: true, force: true });
  try {
    await mkdir(path.join(temporary, "executions"), { recursive: true }); const promptReceipts = {};
    for (const execution of executions) {
      const firstStage = execution.kind.includes("+") ? execution.kind.split("+")[0] : execution.kind;
      const definition = executionDefinition(context.definition, firstStage); const root = path.join(temporary, "executions", execution.id, "attempt-01"); const projectRoot = path.join(root, "project");
      execution.project_root = projectRoot; execution.input = await materializeProject(context.sourceRoot, context.checkpoint, projectRoot);
      const packetRoot = path.join(root, "prompts"); promptReceipts[execution.id] = { controller: await writePacket(path.join(packetRoot, "controller.md"), controllerBoundary(execution.kind), "generated:focused-boundary"), subject: await copyPacket(context.caseDir, definition.subject_packet, path.join(packetRoot, "subject.md")) };
      const checkpointStage = execution.kind === "e2e" ? "specify" : firstStage;
      const checkpoint = checkpointByStage.get(checkpointStage);
      execution.subject_starter_session_id = context.starters.subjects[profileIds.subject].sessions[checkpointStage].session_id;
      pendingCheckpoints.push({ execution, checkpoint, definition, checkpointStage });
    }
    for (const execution of executions) {
      execution.project_root = finalPath(execution.project_root, temporary, outputRoot);
      execution.run_home = finalPath(execution.run_home, temporary, outputRoot);
    }
    for (const receipts of Object.values(promptReceipts)) for (const receipt of Object.values(receipts)) receipt.path = finalPath(receipt.path, temporary, outputRoot);
    await rename(temporary, outputRoot); published = true;
    for (const { execution, checkpoint, definition, checkpointStage } of pendingCheckpoints) {
      const runtimeHome = path.join(path.dirname(execution.project_root), "dd-flow-home"); const restored = await restoreCheckpoint({ checkpoint, projectRoot: execution.project_root, runtimeHome, engine }); execution.flow_run_id = restored.run_id ?? null; execution.run_home = restored.run_home ?? null; execution.dd_flow_home = runtimeHome; execution.workspace_root = restored.workspace_root ?? execution.project_root;
      execution.subject_checkpoint = checkpoint.subject;
      if (!execution.flow_run_id || !execution.run_home) fail(`snapshot restore returned incomplete receipt for ${execution.kind}`);
      const staticPacket = await readFile(await requireFile(context.caseDir, definition.subject_packet, "packet"), "utf8");
      const intakeFile = checkpointStage === "specify" ? path.join(path.dirname(promptReceipts[execution.id].subject.path), "intake.md") : null;
      if (intakeFile) await writePacket(intakeFile, staticPacket, `${definition.subject_packet}:raw-intake`);
      promptReceipts[execution.id].subject = await writePacket(promptReceipts[execution.id].subject.path, subjectContinuation({ stage: checkpointStage, projectRoot: execution.project_root, workspaceRoot: execution.workspace_root, ddFlowHome: runtimeHome, flowRunId: execution.flow_run_id, intakeFile, packet: staticPacket, focused: execution.kind !== "e2e" }), `${definition.subject_packet}+generated-runtime-continuation`);
    }
    const profile_selection = Object.fromEntries(Object.entries(profileIds).map(([role, profileId]) => [role, { id: profileId, source: (role === "controller" ? controllerProfileId : role === "subject" ? subjectProfileId : judgeProfileId) ? "command_override" : "case_default" }]));
    const manifest = { schema_id: "dd-eval/run-manifest@1", run_id: runId, created_at: now(), definition: { suite_id: context.definition.suite_id, case_id: caseId, case_sha256: await materialHash(path.join(context.caseDir, "case.json")), assessment_sha256: await materialHash(path.join(context.caseDir, context.definition.assessment)), methodology_sha256: await materialHash(path.join(repoRoot, "methodology", "evaluation-methodology.md")), starter_sessions_sha256: await materialHash(path.join(context.caseDir, "starter-sessions.json")), eval_definition: definitionIdentity, input_checkpoint: { id: context.checkpoint.id, sha256: await materialHash(context.checkpointFile) }, source_tree: context.sourceTree }, scenario: scenarioReceipt, selection: { focused_stages: selected, segment: segment ?? null, e2e: Boolean(e2e) }, profiles, profile_selection, judge_baseline: context.judgeBaseline, executions, prompt_receipts: promptReceipts };
    const state = { schema_id: "dd-eval/run-state@1", run_id: runId, status: "prepared", updated_at: now(), executions: Object.fromEntries(executions.map((execution) => [execution.id, { status: "prepared", attempt: 1, incidents: [] }])) };
    await writeJson(path.join(outputRoot, "manifest.json"), manifest); await writeJson(path.join(outputRoot, "state.json"), state); await writeJson(path.join(outputRoot, "sessions.json"), { schema_id: "dd-eval/sessions@1", sessions: [] });
    const launch = await Promise.all(executions.map(async (execution) => {
      const continuation = promptReceipts[execution.id].subject;
      return {
        id: execution.id,
        next_action: "fork_subject",
        task_title: subjectTaskTitle({ outputRoot, caseId, executionId: execution.id, profile: profiles.subject, attempt: execution.attempt }),
        requested_profile: { id: profileIds.subject, model: profiles.subject.model, reasoning: profiles.subject.reasoning },
        project_root: execution.project_root,
        workspace_root: execution.workspace_root,
        run_home: execution.run_home,
        dd_flow_home: execution.dd_flow_home,
        flow_run_id: execution.flow_run_id,
        subject_starter_session_id: execution.subject_starter_session_id,
        continuation: { ...continuation, markdown: await readFile(continuation.path, "utf8") }
      };
    }));
    return { output: outputRoot, run_id: runId, executions: launch };
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
  execution.project_root = root; execution.flow_run_id = runId; execution.run_home = status.run?.run_home_path ?? execution.run_home; execution.workspace_root = status.run?.workspace_root ?? execution.workspace_root; execution.dd_flow_home ??= runtimeHome(execution);
  const stage = execution.kind === "e2e" ? "plan-review" : execution.kind; const stageState = status.index?.stage_runs?.find((item) => item.stage === stage)?.status ?? null; const pausedStage = status.index?.stage_runs?.find((item) => item.status === "paused") ?? null; const loaded = await loadCase(context.manifest.definition.case_id); const interactionScript = await requireJson(loaded.caseDir, executionDefinition(loaded.definition, execution.kind).interactions, "interaction script"); const pauseOrdinal = Number(String(pausedStage?.pause?.id ?? "").match(/^HITL-(\d+)$/)?.[1] ?? 0); const declared = pauseOrdinal > 0 && interactionScript.pauses?.some((pause) => pause.stage === pausedStage.stage && pause.after_pause === pauseOrdinal); const interaction = pausedStage?.pause ? { stage: pausedStage.stage, pause_id: pausedStage.pause.id, question_path: pausedStage.pause.question_path, declared: Boolean(declared) } : null; const lifecycle = context.state.executions[executionId]; lifecycle.flow = { status, sessions: sessionList, usage, interaction };
  lifecycle.status = stageState === "paused" || status.run?.status === "waiting_for_user" ? "waiting_for_user" : stageState === "done" ? "candidate_ready" : "running"; context.state.status = lifecycle.status === "waiting_for_user" ? "running" : context.state.status === "prepared" ? "running" : context.state.status;
  await writeJson(path.join(context.root, "manifest.json"), context.manifest); await saveState(context); return { ok: true, execution: executionId, status: lifecycle.status, ...(interaction ? { interaction } : {}), next_action: lifecycle.status === "waiting_for_user" ? declared ? "deliver_declared_interaction" : "deliver_observed_interaction" : lifecycle.status === "candidate_ready" ? "checkpoint" : "wait_for_subject" };
}

async function sourceFile(execution, descriptor) { record(descriptor, "candidate file"); if (!["project", "workspace", "run"].includes(descriptor.origin)) fail("candidate file origin must be project, workspace or run"); const root = descriptor.origin === "project" ? execution.project_root : descriptor.origin === "workspace" ? execution.workspace_root : execution.run_home; if (!root) fail(`candidate file origin is unavailable: ${descriptor.origin}`); return { source: inside(root, relative(descriptor.path, "candidate file path")), destination: path.join(descriptor.origin, descriptor.path) }; }

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

function scopeForExecution(execution) {
  if (execution.kind === "e2e") return "e2e";
  return execution.kind.includes("+") ? execution.kind.split("+").at(-1) : execution.kind;
}

function judgmentNumber(lifecycle) { return (lifecycle.judgments?.length ?? 0) + 1; }

export function judgeResultPath(evalRoot, executionId, attempt, judgment) {
  return path.join(path.resolve(evalRoot), "judge", executionId, `candidate-${String(attempt).padStart(2, "0")}`, `judge-${String(judgment).padStart(2, "0")}.result.json`);
}

export function judgeResultInstructions(resultPath) {
  return [
    "## Required Judge result",
    `Write one schema-valid JSON object to \`${resultPath}\`. This file is the only artifact you may create or modify.`,
    "Use the exact schema below. Score every listed outcome and flow criterion from 0 through 4; use `score: null, not_applicable: true` only with a rationale. Findings must state evidence and practical impact. Do not return weights or calculated totals.",
    "After writing and checking the JSON, stop. A Controller will accept that exact file deterministically.",
  ].join("\n");
}

export async function judgePrepare({ evalRoot, executionId, rejudge = false }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId];
  if (!lifecycle.candidate) fail("checkpoint is required before Judge preparation");
  if (lifecycle.status === "completed" && !rejudge) fail("candidate already has a judgment; use --rejudge for an immutable new judgment");
  if (!["candidate_ready", "completed"].includes(lifecycle.status)) fail("Judge can start only from candidate_ready or completed");
  const loaded = await loadCase(context.manifest.definition.case_id); const scope = scopeForExecution(execution); const assessment = assessmentFor(loaded.assessment, scope); const candidate = await readJson(path.join(context.root, lifecycle.candidate));
  const judgment = judgmentNumber(lifecycle); const resultContract = await readFile(path.join(repoRoot, "schemas", "judge-result.v2.schema.json"), "utf8");
  const methodology = await readFile(path.join(repoRoot, "methodology", "evaluation-methodology.md"), "utf8");
  const mechanical = lifecycle.flow ?? { status: "unavailable" };
  const resultPath = judgeResultPath(context.root, executionId, lifecycle.attempt, judgment);
  const packet = [
    "# Evaluation packet", "", await readFile(path.join(repoRoot, "prompts", "roles", "judge-prime.md"), "utf8"),
    "", "## Methodology", methodology,
    "", "## Scope note", assessment.note,
    "", "## Candidate receipt", "```json", JSON.stringify(candidate, null, 2), "```",
    "", "## Mechanical evidence", "This is tool-collected context. Do not repeat its checksum bookkeeping; assess its practical flow consequence only when it has one.", "```json", JSON.stringify(mechanical, null, 2), "```",
    "", "## Interaction evidence", "If the receipt includes `run/intake/hitl/...`, inspect the captured question/answer pair. An additional question is candidate behaviour: judge whether it was materially justified and whether the answer was already available.",
    "", "## Assessment", "```json", JSON.stringify(assessment, null, 2), "```",
    "", judgeResultInstructions(resultPath), "```json", resultContract.trim(), "```"
  ].join("\n");
  const packetPath = path.join(context.root, "judge", executionId, `candidate-${String(lifecycle.attempt).padStart(2, "0")}`, `judge-${String(judgment).padStart(2, "0")}.md`);
  const contextPath = path.join(path.dirname(packetPath), `judge-${String(judgment).padStart(2, "0")}.context.json`);
  await mkdir(path.dirname(packetPath), { recursive: true }); await writeFile(packetPath, packet);
  await writeJson(contextPath, { scope, judgment, result_path: resultPath, assessment_sha256: context.manifest.definition.assessment_sha256, methodology_sha256: context.manifest.definition.methodology_sha256, candidate: lifecycle.candidate });
  lifecycle.status = "judging"; context.state.status = "judging"; lifecycle.judge_packet = path.relative(context.root, packetPath); lifecycle.judge_context = path.relative(context.root, contextPath); lifecycle.pending_judgment = judgment;
  await saveState(context); return { ok: true, packet: packetPath, result: resultPath, sha256: await materialHash(packetPath), judgment };
}

function validateCriterionResults(values, criteria, label) {
  if (!Array.isArray(values) || values.length !== criteria.length) fail(`${label} must contain every criterion exactly once`);
  const expected = new Set(criteria.map((item) => item.id)); const seen = new Set();
  for (const value of values) {
    record(value, `${label} criterion`); if (!expected.has(value.id) || seen.has(value.id)) fail(`${label} has an unknown or duplicate criterion`); seen.add(value.id);
    if (value.score !== null && (!Number.isInteger(value.score) || value.score < 0 || value.score > 4)) fail(`${label} score must be 0..4 or null`);
    if (typeof value.not_applicable !== "boolean") fail(`${label} not_applicable is required`);
    if ((value.score === null) !== value.not_applicable) fail(`${label} score and not_applicable disagree`);
    if (!Array.isArray(value.evidence) || typeof value.rationale !== "string" || !value.rationale.trim()) fail(`${label} criterion needs evidence and rationale`);
  }
}

function validateJudgeResult(value, assessment, scope) {
  record(value, "Judge result"); if (value.schema_id !== "dd-eval/judge-result@2" || value.scope !== scope) fail("Judge result has an invalid schema or scope");
  if (!["valid", "invalid_infrastructure_flow", "contaminated"].includes(value.run_validity)) fail("Judge result has invalid run_validity");
  validateCriterionResults(value.outcome, assessment.outcome, "outcome"); validateCriterionResults(value.flow, assessment.flow, "flow");
  if (!Array.isArray(value.findings)) fail("Judge findings must be an array");
  for (const finding of value.findings) {
    record(finding, "Judge finding"); id(finding.id, "Judge finding id"); if (!["blocking", "material", "minor", "cosmetic"].includes(finding.severity)) fail("Judge finding severity is invalid");
    if (typeof finding.summary !== "string" || !finding.summary.trim() || !Array.isArray(finding.evidence) || typeof finding.impact !== "string" || !finding.impact.trim()) fail("Judge finding is incomplete");
  }
  const golden = record(value.golden, "Judge golden coverage"); for (const key of ["covered", "missed", "alternatives", "novel"]) if (!Array.isArray(golden[key])) fail(`Judge golden.${key} must be an array`);
  if (typeof value.conclusion !== "string" || !value.conclusion.trim()) fail("Judge conclusion is required");
}

export async function judgeAccept({ evalRoot, executionId, result }) {
  const context = await openEval(evalRoot); const execution = findExecution(context.manifest, executionId); const lifecycle = context.state.executions[executionId]; if (lifecycle.status !== "judging" || !lifecycle.judge_context) fail("Judge is not prepared");
  const loaded = await loadCase(context.manifest.definition.case_id); const scope = scopeForExecution(execution); const value = await readJson(path.resolve(result)); validateJudgeResult(value, assessmentFor(loaded.assessment, scope), scope);
  const judgeContext = await readJson(path.join(context.root, lifecycle.judge_context)); const judgment = lifecycle.pending_judgment;
  const accepted = { ...value, judgment, accepted_at: now(), assessment_sha256: judgeContext.assessment_sha256, methodology_sha256: judgeContext.methodology_sha256 };
  const destination = path.join(context.root, "evaluations", executionId, `candidate-${String(lifecycle.attempt).padStart(2, "0")}`, `judge-${String(judgment).padStart(2, "0")}.json`);
  if (await exists(destination)) fail("Judge result already accepted for this judgment"); await writeJson(destination, accepted);
  lifecycle.judgments ??= []; lifecycle.judgments.push(path.relative(context.root, destination)); lifecycle.evaluation = path.relative(context.root, destination); lifecycle.pending_judgment = null; lifecycle.status = "completed"; await saveState(context); return { ok: true, evaluation: lifecycle.evaluation, judgment };
}

function scoreVector(values, criteria) {
  const byId = new Map(values.map((value) => [value.id, value])); let earned = 0; let possible = 0; let essentialGap = false;
  const vector = criteria.map((criterion) => {
    const value = byId.get(criterion.id); const score = value?.score ?? null; const applicable = score !== null;
    if (applicable) { possible += criterion.weight; earned += criterion.weight * (score / 4); }
    if (criterion.essential && (!applicable || score < 3)) essentialGap = true;
    return { id: criterion.id, score, weight: criterion.weight, essential: criterion.essential };
  });
  return { score: possible === 0 ? null : earned / possible, vector, essential_gap: essentialGap };
}

export function scoreEvaluation(evaluation, assessment) {
  if (evaluation.run_validity !== "valid") return { outcome: { score: null, vector: [], verdict: evaluation.run_validity }, flow: { score: null, vector: [] }, verdict: evaluation.run_validity };
  const outcome = scoreVector(evaluation.outcome, assessment.outcome); const flow = scoreVector(evaluation.flow, assessment.flow); const blocking = evaluation.findings.some((finding) => finding.severity === "blocking");
  const outcomeVerdict = blocking || outcome.essential_gap || (outcome.score ?? 0) < 0.7 ? "fail" : (outcome.score ?? 0) >= 0.85 ? "pass" : "pass_with_findings";
  return { outcome: { ...outcome, verdict: outcomeVerdict }, flow, verdict: outcomeVerdict };
}

function efficiency(flow) {
  const usage = flow?.usage; const groups = Array.isArray(usage?.groups) ? usage.groups : []; const tokens = {};
  for (const group of groups) for (const [key, value] of Object.entries(group.tokens ?? {})) tokens[key] = tokens[key] === undefined ? value : tokens[key] === null || value === null ? null : tokens[key] + value;
  const sessions = Array.isArray(flow?.sessions?.sessions) ? flow.sessions.sessions.length : null;
  return { status: usage ? "available" : "unavailable", tokens: usage ? tokens : null, tool_calls: usage?.tool_calls ?? null, sessions, source: usage?.source ?? null };
}

function renderMarkdown(report) {
  const rows = report.executions.map((entry) => `| ${entry.id} | ${entry.outcome.verdict} | ${entry.outcome.score ?? "n/a"} | ${entry.flow.score ?? "n/a"} |`).join("\n");
  const findings = report.executions.flatMap((entry) => entry.findings.map((finding) => `- **${finding.severity} · ${entry.id} · ${finding.id}** — ${finding.summary}\n  - Impact: ${finding.impact}`)).join("\n") || "No Judge findings.";
  const detail = report.executions.map((entry) => `## ${entry.id}\n\n${entry.conclusion}\n\n### Outcome\n\n${entry.outcome.vector.map((item) => `- ${item.id}: ${item.score ?? "N/A"}/4`).join("\n")}\n\n### Flow reliability\n\n${entry.flow.vector.map((item) => `- ${item.id}: ${item.score ?? "N/A"}/4`).join("\n")}\n\n### Efficiency\n\n\`\`\`json\n${JSON.stringify(entry.efficiency, null, 2)}\n\`\`\``).join("\n\n");
  return `# ${report.case_id}\n\n## Executive summary\n\nThis report keeps outcome quality, flow reliability and efficiency separate. Efficiency never compensates for quality.\n\n## Stage matrix\n\n| Execution | Outcome verdict | Outcome | Flow |\n| --- | --- | ---: | ---: |\n${rows}\n\n## Material findings\n\n${findings}\n\n## Detailed analysis\n\n${detail}\n\n## Methodology and limitations\n\nMethodology hash: \`${report.methodology.sha256}\`. One run per profile is comparative evidence for this case, not a model-wide statistical claim.\n`;
}

export async function finalize({ evalRoot }) {
  const context = await openEval(evalRoot); const loaded = await loadCase(context.manifest.definition.case_id); const executions = [];
  for (const execution of context.manifest.executions) {
    const lifecycle = context.state.executions[execution.id]; if (!lifecycle.evaluation) fail(`execution has no accepted Judge result: ${execution.id}`);
    const evaluation = await readJson(path.join(context.root, lifecycle.evaluation)); const scope = scopeForExecution(execution); const assessment = assessmentFor(loaded.assessment, scope); const scored = scoreEvaluation(evaluation, assessment);
    const complete = Boolean(execution.project_root && execution.run_home && await exists(execution.project_root) && await exists(execution.run_home));
    executions.push({ id: execution.id, scope, ...scored, findings: evaluation.findings, golden: evaluation.golden, conclusion: evaluation.conclusion, evaluation: lifecycle.evaluation, evaluations: lifecycle.judgments ?? [lifecycle.evaluation], candidate: lifecycle.candidate, efficiency: efficiency(lifecycle.flow), evidence_completeness: complete ? "complete" : "limited" });
  }
  const report = { schema_id: "dd-eval/report@2", run_id: context.manifest.run_id, case_id: context.manifest.definition.case_id, generated_at: now(), methodology: { path: "methodology/evaluation-methodology.md", sha256: context.manifest.definition.methodology_sha256, assessment_sha256: context.manifest.definition.assessment_sha256 }, executions };
  await writeJson(path.join(context.root, "report.json"), report); await writeFile(path.join(context.root, "report.md"), renderMarkdown(report)); context.state.status = "completed"; await saveState(context); return { ok: true, report: path.join(context.root, "report.json") };
}

function parseList(value, label) { const values = value.split(",").map((item) => item.trim()).filter(Boolean); if (values.length < 2) fail(`${label} needs at least two comma-separated paths`); return values; }

export async function comparePrepare({ evalRoots, output }) {
  const roots = parseList(evalRoots, "--evals").map((value) => path.resolve(value)); const destination = path.resolve(output); if (await exists(destination)) fail("comparison output already exists");
  if (!destination.startsWith(`${evalHome()}${path.sep}`)) fail("comparison output must be inside DD_EVAL_HOME");
  const inputs = [];
  for (const root of roots) { const report = await readJson(path.join(root, "report.json")); const manifest = await readJson(path.join(root, "manifest.json")); if (report.schema_id !== "dd-eval/report@2") fail(`report is not dd-eval/report@2: ${root}`); inputs.push({ root, report, manifest }); }
  if (new Set(inputs.map((item) => item.report.case_id)).size !== 1) fail("Grand Judge comparison requires one case");
  const ordered = inputs.sort((left, right) => left.root.localeCompare(right.root)); const labels = ordered.map((item, index) => ({ label: String.fromCharCode(65 + index), root: item.root, report: item.report }));
  const packet = ["# Grand Judge comparison", "", await readFile(path.join(repoRoot, "prompts", "roles", "grand-judge-prime.md"), "utf8"), "", "## Methodology", await readFile(path.join(repoRoot, "methodology", "evaluation-methodology.md"), "utf8"), "", "## Required result", "```json", await readFile(path.join(repoRoot, "schemas", "comparison-result.v1.schema.json"), "utf8"), "```", "", ...labels.map((item) => `## Candidate ${item.label}\n\n\`\`\`json\n${JSON.stringify(item.report, null, 2)}\n\`\`\``)].join("\n");
  await mkdir(destination, { recursive: true }); await writeFile(path.join(destination, "judge-packet.md"), packet); await writeJson(path.join(destination, "identity.json"), { schema_id: "dd-eval/comparison-identities@1", candidates: labels.map((item) => ({ label: item.label, eval_root: item.root })) });
  return { ok: true, packet: path.join(destination, "judge-packet.md"), candidates: labels.map((item) => item.label) };
}

export async function compareAccept({ comparisonRoot, result }) {
  const root = path.resolve(comparisonRoot); const value = await readJson(path.resolve(result)); record(value, "comparison result");
  if (value.schema_id !== "dd-eval/comparison-result@1" || !Array.isArray(value.candidates) || !Array.isArray(value.golden_candidates) || typeof value.conclusion !== "string" || !value.conclusion.trim()) fail("comparison result is invalid");
  const destination = path.join(root, "comparison.json"); if (await exists(destination)) fail("comparison result already accepted"); await writeJson(destination, { ...value, accepted_at: now() }); return { ok: true, comparison: destination };
}

export function defaultSource() { return process.env.DD_TASKS_REPO || path.resolve(repoRoot, "..", "dd-tasks"); }
