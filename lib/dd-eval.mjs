import { spawn } from "node:child_process";
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

export async function loadCase(caseId) {
  assertId(caseId, "case id");
  const caseDir = path.join(repoRoot, "cases", caseId);
  const definition = await readJson(path.join(caseDir, "case.json"));
  if (definition.id !== caseId) fail(`case id mismatch: ${definition.id}`);
  const checkpoint = await readJson(
    path.join(repoRoot, "checkpoints", `${definition.checkpoint}.json`)
  );
  return { caseDir, definition, checkpoint };
}

async function loadProfile(profileId) {
  assertId(profileId, "profile id");
  const profile = await readJson(path.join(repoRoot, "profiles", `${profileId}.json`));
  if (profile.id !== profileId) fail(`profile id mismatch: ${profile.id}`);
  return profile;
}

export async function validateInput({ caseId, source }) {
  const loaded = await loadCase(caseId);
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

export async function prepare({ caseId, profileId, track = "planning", source, output }) {
  const context = await validateInput({ caseId, source });
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
          review_prompt: path.join(relativeCase, trackDefinition.review_prompt)
        }
      }, null, 2)}\n`
    );
    return { output: outputRoot, runManifest, inputCommit, inputTree };
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}

export function defaultSource() {
  return process.env.DD_TASKS_REPO || path.resolve(repoRoot, "..", "dd-tasks");
}
