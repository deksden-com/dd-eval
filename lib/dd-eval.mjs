import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedGitEnv = {
  GIT_AUTHOR_NAME: "dd-eval",
  GIT_AUTHOR_EMAIL: "dd-eval@example.invalid",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "dd-eval",
  GIT_COMMITTER_EMAIL: "dd-eval@example.invalid",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
};

function fail(message) {
  throw new Error(message);
}

async function run(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => (stdout += value));
    child.stderr.setEncoding("utf8").on("data", (value) => (stderr += value));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function assertId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value)) fail(`invalid ${label}: ${value}`);
}

export async function loadCase(caseId, checkpointId) {
  assertId(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId);
  const definition = await readJson(path.join(caseDir, "case.json"));
  if (definition.id !== caseId) fail(`case id mismatch: ${definition.id}`);
  const selectedCheckpoint = checkpointId || definition.checkpoint;
  const allowedCheckpoints = definition.materialization.checkpoints || [definition.checkpoint];
  if (!allowedCheckpoints.includes(selectedCheckpoint)) {
    fail(`checkpoint ${selectedCheckpoint} is not materializable for ${caseId}`);
  }
  const checkpoint = await readJson(
    path.join(repoRoot, "checkpoints", `${selectedCheckpoint}.json`)
  );
  return { caseDir, definition, checkpoint };
}

async function loadProfile(profileId) {
  assertId(profileId, "profile id");
  const profile = await readJson(path.join(repoRoot, "profiles", `${profileId}.json`));
  if (profile.id !== profileId) fail(`profile id mismatch: ${profile.id}`);
  return profile;
}

export async function validateInput({ caseId, checkpointId, source }) {
  const loaded = await loadCase(caseId, checkpointId);
  const sourceRoot = path.resolve(source);
  if (!(await stat(sourceRoot)).isDirectory()) fail(`source is not a directory: ${sourceRoot}`);
  const expected = loaded.checkpoint.source.commit;
  const resolved = await run("git", ["-C", sourceRoot, "rev-parse", `${loaded.checkpoint.source.tag}^{commit}`]);
  if (resolved !== expected) fail(`checkpoint tag resolved to ${resolved}, expected ${expected}`);
  const sourceTree = await run("git", ["-C", sourceRoot, "rev-parse", `${expected}^{tree}`]);
  const tracked = (await run("git", ["-C", sourceRoot, "ls-tree", "-r", "--name-only", expected]))
    .split("\n")
    .filter(Boolean);
  const forbidden = tracked.filter((name) =>
    name === ".env" ||
    (name.startsWith(".env.") && name !== ".env.example") ||
    name.startsWith(".tasks/") ||
    name.startsWith(".eval/") ||
    name.startsWith(".memory-bank/dd-eval/") ||
    name.startsWith(".scenario-runs/")
  );
  if (forbidden.length) fail(`source contains forbidden tracked paths: ${forbidden.join(", ")}`);
  return { ...loaded, sourceRoot, sourceTree };
}

export async function prepare({ caseId, checkpointId, profileId, track = "planning", source, output }) {
  const context = await validateInput({ caseId, checkpointId, source });
  if (!profileId) fail("profile id is required");
  const profile = await loadProfile(profileId);
  if (!context.definition.materialization.supported_tracks.includes(track)) {
    fail(`track ${track} is not materializable yet for ${caseId}`);
  }
  const outputRoot = path.resolve(output);
  try {
    await access(outputRoot);
    fail(`output already exists: ${outputRoot}`);
  } catch (error) {
    if (error.message.startsWith("output already exists")) throw error;
  }

  const stage = `${outputRoot}.tmp-${process.pid}`;
  const archive = `${stage}.tar`;
  const runManifest = `${outputRoot}.run.json`;
  await rm(stage, { recursive: true, force: true });
  await rm(archive, { force: true });
  try {
    await mkdir(stage, { recursive: true });
    await run("git", ["-C", context.sourceRoot, "archive", "--format=tar", "-o", archive, context.checkpoint.source.commit]);
    await run("tar", ["-xf", archive, "-C", stage]);
    await run("git", ["init", "-b", "main"], { cwd: stage });
    // The archive contains only tracked checkpoint files; force-add preserves
    // files such as a tracked .DS_Store even when the operator has a global ignore.
    await run("git", ["add", "-A", "-f"], { cwd: stage });
    await run("git", ["commit", "-m", context.definition.materialization.initial_commit_message], {
      cwd: stage,
      env: fixedGitEnv
    });
    const inputTree = await run("git", ["rev-parse", "HEAD^{tree}"], { cwd: stage });
    if (inputTree !== context.sourceTree) fail(`materialized tree mismatch: ${inputTree}`);
    const inputCommit = await run("git", ["rev-parse", "HEAD"], { cwd: stage });
    const remotes = await run("git", ["remote"], { cwd: stage });
    if (remotes) fail("materialized repository unexpectedly has a remote");
    await rename(stage, outputRoot);
    const relativeCase = path.relative(repoRoot, context.caseDir);
    const trackDefinition = context.definition.tracks[track];
    await writeFile(
      runManifest,
      `${JSON.stringify({
        schema_version: 1,
        case_id: caseId,
        profile,
        track,
        checkpoint_id: context.checkpoint.id,
        source: {
          repository: context.checkpoint.source.repository,
          tag: context.checkpoint.source.tag,
          commit: context.checkpoint.source.commit,
          tree: context.sourceTree
        },
        input: { commit: inputCommit, tree: inputTree, branch: "main" },
        operator_materials: {
          initial_prompt: path.join(relativeCase, trackDefinition.initial_prompt),
          clarification_packet: path.join(relativeCase, trackDefinition.clarification_packet),
          reference_specification: path.join(relativeCase, trackDefinition.reference_specification),
          reference_plan: path.join(relativeCase, trackDefinition.reference_plan),
          review_prompt: path.join(relativeCase, trackDefinition.review_prompt),
          controller_initial_prompt: trackDefinition.controller_initial_prompt
            ? path.join(relativeCase, trackDefinition.controller_initial_prompt)
            : null,
          controller_clarification_prompt: trackDefinition.controller_clarification_prompt
            ? path.join(relativeCase, trackDefinition.controller_clarification_prompt)
            : null
        }
      }, null, 2)}\n`
    );
    return { output: outputRoot, runManifest, inputCommit, inputTree };
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function summarizeJsonl(text) {
  const eventCounts = {};
  const toolCalls = {};
  const timestamps = [];
  let session = null;
  let totalTokenUsage = null;
  let compactions = 0;
  const models = new Set();
  const efforts = new Set();

  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      fail(`invalid JSONL at line ${index + 1}`);
    }
    const subtype = record.payload?.type;
    increment(eventCounts, subtype ? `${record.type}:${subtype}` : record.type);
    if (record.timestamp && Number.isFinite(Date.parse(record.timestamp))) timestamps.push(record.timestamp);
    if (record.type === "session_meta") {
      const value = record.payload || {};
      session = {
        id: value.session_id || value.id || null,
        started_at: value.timestamp || record.timestamp || null,
        cwd: value.cwd || null,
        originator: value.originator || null,
        cli_version: value.cli_version || null,
        source: value.source || null,
        thread_source: value.thread_source || null,
        model_provider: value.model_provider || null
      };
    }
    if (record.type === "turn_context") {
      if (record.payload?.model) models.add(record.payload.model);
      if (record.payload?.effort) efforts.add(record.payload.effort);
    }
    if (record.type === "response_item" && ["function_call", "custom_tool_call"].includes(subtype)) {
      increment(toolCalls, record.payload.name || "unknown");
    }
    if (record.type === "event_msg" && subtype === "token_count" && record.payload.info?.total_token_usage) {
      totalTokenUsage = record.payload.info.total_token_usage;
    }
    if (record.type === "compacted") compactions += 1;
  }

  const startedAt = session?.started_at || timestamps[0] || null;
  const completedAt = timestamps.at(-1) || null;
  return {
    session,
    models: [...models],
    reasoning_efforts: [...efforts],
    started_at: startedAt,
    completed_at: completedAt,
    elapsed_seconds: startedAt && completedAt ? (Date.parse(completedAt) - Date.parse(startedAt)) / 1000 : null,
    event_counts: eventCounts,
    tool_calls: toolCalls,
    compactions,
    token_usage: totalTokenUsage || { status: "unavailable" }
  };
}

export async function collect({ manifest, session, timeline, usage, flags, output }) {
  const runManifest = await readJson(path.resolve(manifest));
  const sessionPath = path.resolve(session);
  const jsonl = await readFile(sessionPath, "utf8");
  const sessionSummary = summarizeJsonl(jsonl);
  const flowTimeline = timeline ? await readJson(path.resolve(timeline)) : null;
  const flowUsage = usage ? await readJson(path.resolve(usage)) : null;
  const flowFlags = flags ? await readJson(path.resolve(flags)) : null;
  const stageElapsedMs = flowTimeline?.stages?.reduce((sum, stage) => sum + (stage.elapsed_ms || 0), 0) ?? null;
  const result = {
    schema_version: 1,
    collected_at: new Date().toISOString(),
    run_manifest: runManifest,
    session: {
      ...sessionSummary,
      transcript_path: sessionPath,
      transcript_sha256: createHash("sha256").update(jsonl).digest("hex")
    },
    flow_observability: {
      timeline: flowTimeline
        ? {
            schema_id: flowTimeline.schema_id,
            timing_status: flowTimeline.timing_status,
            summary: flowTimeline.summary,
            stages: flowTimeline.stages,
            sessions: flowTimeline.sessions
          }
        : { status: "unavailable" },
      usage: flowUsage
        ? {
            schema_id: flowUsage.schema_id,
            source: flowUsage.source,
            groups: flowUsage.groups,
            coverage: flowUsage.coverage,
            delta_count: flowUsage.deltas?.length || 0
          }
        : { status: "unavailable" },
      flags: flowFlags
        ? {
            resolution_status: flowFlags.resolution_status,
            snapshot_revision: flowFlags.snapshot_revision,
            snapshot_checksum: flowFlags.snapshot_checksum,
            flow_flags: flowFlags.flow_flags
          }
        : { status: "unavailable" },
      stage_elapsed_seconds: stageElapsedMs === null ? null : stageElapsedMs / 1000,
      unattributed_flow_seconds:
        flowTimeline?.summary?.elapsed_ms === undefined || stageElapsedMs === null
          ? null
          : (flowTimeline.summary.elapsed_ms - stageElapsedMs) / 1000
    }
  };
  await writeFile(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  return {
    output: path.resolve(output),
    session_id: sessionSummary.session?.id || null,
    elapsed_seconds: sessionSummary.elapsed_seconds,
    transcript_sha256: result.session.transcript_sha256
  };
}

export function defaultSource() {
  return process.env.DD_TASKS_REPO || path.resolve(repoRoot, "..", "dd-tasks");
}
