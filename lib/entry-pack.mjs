import { cp, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, hashJson, sha256, writeJsonAtomic } from "./runner-events.mjs";

const stages = ["specify", "protocolize", "plan", "plan-review", "code", "code-review"];

function fail(message) { throw new Error(message); }
function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function nonempty(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string`); return value; }
function rel(value, label) { nonempty(value, label); if (path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) fail(`${label} must be a safe relative path`); return value; }

export { stages };

export function validateStageContext(value, expectedStage = null) {
  const context = object(value, "stage context");
  if (context.schema_id !== "dd-eval/stage-context@1") fail("stage context must use dd-eval/stage-context@1");
  if (expectedStage && context.stage !== expectedStage) fail(`stage context is for ${context.stage}, expected ${expectedStage}`);
  if (!stages.includes(context.stage)) fail(`unsupported stage context: ${context.stage}`);
  nonempty(context.objective, "stage context objective");
  if (!Array.isArray(context.task_input)) fail("stage context task_input must be an array");
  for (const item of context.task_input) {
    object(item, "stage task input"); nonempty(item.role, "stage task input role"); rel(item.path, "stage task input path"); rel(item.source, "stage task input source"); if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) fail("stage task input sha256 must be sha256");
  }
  for (const key of ["sources", "accepted_decisions", "dynamic_roles"]) if (!Array.isArray(context[key] ?? [])) fail(`stage context ${key} must be an array`);
  for (const source of context.sources ?? []) {
    object(source, "stage source"); nonempty(source.role, "stage source role");
    if (!["project", "workspace", "run"].includes(source.root)) fail(`stage source ${source.role} has invalid root`);
    rel(source.path, `stage source ${source.role} path`); nonempty(source.reason, `stage source ${source.role} reason`);
    if (source.required !== undefined && typeof source.required !== "boolean") fail(`stage source ${source.role} required must be boolean`);
  }
  return context;
}

export function validateStageBlueprint(value) {
  const blueprint = object(value, "stage context blueprint");
  if (blueprint.schema_id !== "dd-eval/stage-context-blueprint@1") fail("stage-context.json must use dd-eval/stage-context-blueprint@1");
  object(blueprint.stages, "stage context blueprint stages");
  const found = Object.keys(blueprint.stages);
  if (!found.length || found.some((stage) => !stages.includes(stage))) fail("stage context blueprint has unsupported stages");
  for (const stage of found) validateStageContext(blueprint.stages[stage], stage);
  return blueprint;
}

export function semanticContextHash(context) { return hashJson(validateStageContext(context)); }

export async function readStageBlueprint(caseDir) {
  const file = path.join(caseDir, "entry-pack-source", "stage-context.json");
  return validateStageBlueprint(JSON.parse(await readFile(file, "utf8")));
}

export async function materializeStageSlice({ blueprint, stage, roots, output }) {
  const source = validateStageContext(blueprint.stages?.[stage], stage);
  const resolve = async (entry) => {
    const root = roots[entry.root];
    if (!root) fail(`missing restored ${entry.root} root for ${entry.role}`);
    const target = path.resolve(root, entry.path);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) fail(`source escapes ${entry.root}: ${entry.path}`);
    try { await stat(target); }
    catch (error) { if (entry.required !== false && error?.code === "ENOENT") fail(`required stage source is missing for ${entry.role}: ${target}`); throw error; }
    return { ...entry, path: target };
  };
  const rendered = { ...source, task_input: source.task_input.map((entry) => ({ ...entry, path: path.resolve(roots.project, entry.path) })), sources: await Promise.all((source.sources ?? []).map(resolve)), roots: { project: roots.project, ...(roots.workspace ? { workspace: roots.workspace } : {}), ...(roots.run ? { run: roots.run } : {}) } };
  await mkdir(path.dirname(output), { recursive: true });
  const bytes = `${JSON.stringify(rendered, null, 2)}\n`;
  await writeJsonAtomic(output, rendered);
  return { path: output, sha256: sha256(bytes), semantic_package_sha256: semanticContextHash(source), context_slice_sha256: hashJson(source) };
}

export function validateEntry(value, expectedStage = null) {
  const entry = object(value, "stage entry");
  if (entry.schema_id !== "dd-eval/stage-entry@1") fail("stage entry must use dd-eval/stage-entry@1");
  if (expectedStage && entry.stage !== expectedStage) fail(`stage entry is for ${entry.stage}, expected ${expectedStage}`);
  if (!stages.includes(entry.stage)) fail(`unsupported stage entry: ${entry.stage}`);
  nonempty(entry.case_id, "stage entry case_id"); nonempty(entry.revision, "stage entry revision"); nonempty(entry.checkpoint_id, "stage entry checkpoint_id");
  const snapshot = object(entry.snapshot, "stage entry snapshot");
  if (!["bootstrap", "run"].includes(snapshot.kind)) fail("stage entry snapshot kind must be bootstrap or run");
  rel(snapshot.locator, "stage entry snapshot locator");
  if (!/^[a-f0-9]{64}$/.test(snapshot.manifest_sha256 ?? "")) fail("stage entry snapshot manifest_sha256 must be sha256");
  if (entry.stage === "specify" && snapshot.kind !== "bootstrap") fail("SPECIFY entry requires a bootstrap snapshot");
  if (entry.stage !== "specify" && snapshot.kind !== "run") fail(`${entry.stage} entry requires a RUN snapshot`);
  if (snapshot.kind === "bootstrap" && snapshot.run_id !== null) fail("bootstrap snapshot must not have a RUN");
  if (snapshot.kind === "run" && typeof snapshot.run_id !== "string") fail("RUN snapshot requires run_id");
  for (const key of ["semantic_package_sha256", "context_slice_sha256"]) if (!/^[a-f0-9]{64}$/.test(entry[key] ?? "")) fail(`stage entry ${key} must be sha256`);
  return entry;
}

export async function copySnapshot({ snapshotRoot, destination }) {
  const info = await stat(snapshotRoot);
  if (!info.isDirectory()) fail(`snapshot is not a directory: ${snapshotRoot}`);
  await cp(snapshotRoot, destination, { recursive: true, verbatimSymlinks: true });
}

export async function writeEntryPack({ caseDir, revision, inputCheckpoint, flow, stageBlueprint, entries, e2e, authoring, status = "candidate" }) {
  const accepted = {};
  for (const stage of Object.keys(entries)) {
    validateEntry(entries[stage], stage);
    accepted[stage] = { path: `${stage}.json`, sha256: hashJson(entries[stage]) };
  }
  const pack = {
    schema_id: "dd-eval/entry-pack@1", case_id: path.basename(caseDir), revision,
    title: "SDLC Entry Pack", input_checkpoint: inputCheckpoint, flow,
    authoring, stage_context: "stage-context.json",
    entries: { e2e: "e2e.json", ...Object.fromEntries(Object.keys(accepted).map((stage) => [stage, accepted[stage].path])) },
    hashes: { stage_context_sha256: hashJson(stageBlueprint), e2e_sha256: hashJson(e2e), focused_entries: Object.fromEntries(Object.entries(accepted).map(([stage, entry]) => [stage, entry.sha256])) },
    status, ...(status === "accepted" ? { accepted_at: new Date().toISOString() } : {})
  };
  pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  return pack;
}
