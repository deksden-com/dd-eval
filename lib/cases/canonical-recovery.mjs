import path from "node:path";
import { fileURLToPath } from "node:url";
import { lstatSync, unlinkSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { processSnapshot } from "../process-snapshot.mjs";
import { commandText } from "../process-json.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { committedDefinitionIdentity } from "./definition-identity.mjs";
import { loadCase } from "./load-case.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Read and validate the retained canonical build and blueprint. */
export async function canonicalState(buildRoot) {
  const root = path.resolve(buildRoot); const state = await readJson(path.join(root, "build", "state.json"));
  if (state.schema_id !== "dd-eval/canonical-build-state@1" || typeof state.case_id !== "string" || typeof state.current_stage !== "string") fail("invalid canonical build state", "canonical_state_invalid");
  const loaded = await loadCase(state.case_id);
  return { root, state, loaded, blueprint: validateCaseBlueprint(await readJson(path.join(root, "stage-context.json")), loaded) };
}
/** Reject canonical continuation after relevant committed definitions drift. */
export async function assertCanonicalDefinition(state) {
  if (state.definition?.schema_id !== "dd-eval/definition-dependencies@1"
    && await commandText("git", ["status", "--porcelain"], { cwd: repoRoot })) fail("legacy canonical definition requires its clean committed tree", "definition_tree_dirty");
  const current = await committedDefinitionIdentity(repoRoot, state.definition?.selection);
  if (state.definition?.schema_id === "dd-eval/definition-dependencies@1"
    ? state.definition.dependencies_sha256 !== current.dependencies_sha256
    : state.definition?.commit !== current.commit || state.definition?.tree !== current.tree) {
    fail("canonical build belongs to a different committed dd-eval definition", "runner_definition_drift");
  }
}

/** Reclaim only a provably inactive legacy canonical lock. */
export async function migrateLegacyCanonicalResumeLock(root) {
  // Before runner-lock used a lock directory, canonical resume left one JSON
  // file at this exact path. Reclaim only an owner proven dead or PID-reused;
  // malformed and live owners remain a safe block.
  const legacy = path.join(root, "build", "canonical-resume.lock");
  let metadata;
  try { metadata = await stat(legacy); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  if (!metadata.isFile()) return;
  let owner;
  try { owner = JSON.parse(await readFile(legacy, "utf8")); }
  catch { fail("canonical resume has an unconfirmed legacy lock owner", "canonical_resume_active"); }
  if (!Number.isInteger(owner?.pid) || owner.pid < 1 || typeof owner.started_at !== "string" || !owner.started_at) fail("canonical resume has an unconfirmed legacy lock owner", "canonical_resume_active");
  const physical = (await processSnapshot()).find(item => item.pid === owner.pid);
  // Legacy started_at is an ISO acquisition timestamp, not OS process birth.
  // A present PID therefore cannot be reclaimed by comparing these strings.
  if (physical && !physical.zombie) fail("canonical resume is already in progress for this build", "canonical_resume_active");
  // Another migrator may have replaced the file while ps was running.
  let current;
  try { current = lstatSync(legacy); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!current.isFile() || current.ino !== metadata.ino || current.dev !== metadata.dev) return;
  unlinkSync(legacy);
}

/** Serialize canonical continuation while preserving legacy lock safety. */
export async function canonicalResumeLock(root, action) {
  try {
    await migrateLegacyCanonicalResumeLock(root);
    return await withRunnerLock(path.join(root, "build", "canonical-resume"), action);
  } catch (error) {
    if (error?.code === "runner_lock_timeout") fail("canonical resume is already in progress for this build", "canonical_resume_active");
    throw error;
  }
}
