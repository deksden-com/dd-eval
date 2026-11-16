import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { contained } from "../contained-path.mjs";
import { installedProfileSelection as memoryProfileSelection } from "../installed-flows.mjs";
import { readJson } from "../json-file.mjs";
import { commandText } from "../process-json.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Select case, profile and referenced inputs that determine an EVAL definition. */
export async function definitionSelection(loaded, profile) {
  const casePath = path.relative(repoRoot, loaded.root);
  const profilePath = path.relative(repoRoot, profile.file);
  const profileScope = profilePath.startsWith("..") || path.isAbsolute(profilePath) ? { external_file: profile.file } : [profilePath];
  const caseScope = [casePath, ...["run-profiles", "README.md", "diagnostics", "results", "checkpoint-reviews", "checkpoints", "stage-entries"].map(name => `:(exclude)${casePath}/${name}`)];
  const selected = [caseScope, profileScope, [path.relative(repoRoot, loaded.inputCheckpoint.file)]];
  if (memoryProfileSelection(profile.value.subject??{})?.profileFile) selected.push({ external_file: path.resolve(memoryProfileSelection(profile.value.subject).profileFile) });
  if (loaded.value.entry_pack) selected.push([path.join(casePath, path.dirname(loaded.value.entry_pack))]);
  for (const input of loaded.value.input) selected.push([path.join(casePath, input.source)]);
  for (const corpus of [loaded.value.hitl_qualification, loaded.value.hitl_qualification?.coverage]) {
    if (!corpus?.file) continue;
    selected.push([path.relative(repoRoot, contained(loaded.root, corpus.file, "qualification corpus"))]);
    const content = await readJson(contained(loaded.root, corpus.file, "qualification corpus"));
    for (const item of content.items ?? []) if (item.context_file) selected.push([path.relative(repoRoot, contained(loaded.root, item.context_file, "qualification context"))]);
  }
  const ids = new Set([profile.value.subject?.profile_id, profile.value.interaction_judge?.profile_id,
    profile.value.judge?.enabled ? profile.value.judge.profile_id : null]);
  for (const route of [profile.value.subject?.execution, ...Object.values(profile.value.subject?.execution?.stage_overrides ?? {})]) {
    if (route?.agent_profile_id) ids.add(route.agent_profile_id);
    if (route?.delegation?.agent_profile_id) ids.add(route.delegation.agent_profile_id);
  }
  for (const id of ids) if (id) selected.push([`profiles/${id}.json`]);
  return selected;
}

/** Return already-loaded input bytes that must match committed definition inputs. */
export function loadedDefinitionInputs(loaded, profile) {
  return [{ file: path.join(loaded.root, "case.json"), value: loaded.value },
    { file: contained(loaded.root, loaded.value.assessment, "assessment"), value: loaded.assessment },
    { file: loaded.inputCheckpoint.file, value: loaded.inputCheckpoint.value },
    { file: profile.file, value: profile.value }];
}

/** Bind the selected definition and loaded inputs to a committed repository state. */
export async function committedDefinitionIdentity(repository = repoRoot, selection = [], loadedInputs = []) {
  // Executable dependencies are shared; only the selected case/profile belong
  // to this run. Documentation, tests and other cases are not admission inputs.
  if (!Array.isArray(selection) || selection.some(scope => Array.isArray(scope)
    ? scope.some(item => typeof item !== "string" || !item)
    : !isObject(scope) || Object.keys(scope).length !== 1 || !path.isAbsolute(scope.external_file ?? ""))) fail("invalid selected definition dependencies", "runner_definition_drift");
  const scopes = [["lib", "bin", "prompts", "schemas", "package.json", "package-lock.json"], ...selection.filter(Array.isArray)];
  const commit = await commandText("git", ["rev-parse", "HEAD"], { cwd: repository });
  const assertLoadedInputs = async () => {
    for (const input of loadedInputs) if (hashJson(await readJson(input.file)) !== hashJson(input.value)) fail("loaded definition input changed before identity capture", "runner_definition_drift");
  };
  await assertLoadedInputs();
  const entries = new Set();
  const external = new Map();
  for (const scope of selection.filter(scope => !Array.isArray(scope))) {
    const checksum = sha256(await readRegularFile(scope.external_file));
    external.set(scope.external_file, checksum);
    entries.add(`external ${checksum}\t${scope.external_file}`);
  }
  for (const paths of scopes) {
    const dirty = await commandText("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: repository });
    if (dirty) fail("scored execution requires clean committed selected definition dependencies", "definition_tree_dirty");
    const files = await commandText("git", ["ls-files", "--stage", "--", ...paths], { cwd: repository });
    if (paths.length === 1 && await exists(path.join(repository, paths[0])) && !files) fail("selected definition input is not committed", "definition_tree_dirty");
    for (const entry of files.split("\n")) if (entry) {
      // Git binds a symlink's text, not the bytes followed by executable/input readers.
      if (entry.startsWith("120000 ")) fail("selected definition dependency cannot be a symlink", "definition_tree_dirty");
      entries.add(entry);
    }
  }
  const tree = await commandText("git", ["rev-parse", `${commit}^{tree}`], { cwd: repository });
  for (const paths of scopes) {
    if (await commandText("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: repository })) fail("selected definition dependencies changed during capture", "definition_tree_dirty");
  }
  if (await commandText("git", ["rev-parse", "HEAD"], { cwd: repository }) !== commit) fail("definition commit changed during capture", "runner_definition_drift");
  for (const [file, checksum] of external) if (sha256(await readRegularFile(file)) !== checksum) fail("external definition input changed during capture", "runner_definition_drift");
  await assertLoadedInputs();
  return { schema_id: "dd-eval/definition-dependencies@1", repository, commit, tree, selection,
    dependencies_sha256: sha256([...entries].sort().join("\n")) };
}
