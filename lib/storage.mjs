import { lstat, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { evalHome, readJson } from "./runner.mjs";
import { reduceEvents, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { commandJson } from "./process-json.mjs";

async function exists(file) { try { await stat(file); return true; } catch { return false; } }
async function bytes(root) {
  let total = 0;
  const visit = async (file) => {
    let info; try { info = await lstat(file); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
    // Snapshots may contain a link to pruned external evidence. Count the link
    // itself; never let a historical dangling link hide every run in storage.
    if (!info.isDirectory() || info.isSymbolicLink()) { total += info.size; return; }
    for (const entry of await readdir(file)) await visit(path.join(file, entry));
  };
  if (await exists(root)) await visit(root);
  return total;
}
async function runRecords(home, caseId = null, { measure = false } = {}) {
  const root = path.join(home, "runs"); if (!(await exists(root))) return [];
  const output = [];
  for (const name of await readdir(root)) {
    const directory = path.join(root, name); const manifestFile = path.join(directory, "manifest.json");
    if (!(await exists(manifestFile))) continue;
    const manifest = await readJson(manifestFile); if (caseId && manifest.case_id !== caseId) continue;
    let state = "unknown"; let journal_error = null;
    const eventFile = path.join(directory, "events.jsonl");
    if (await exists(eventFile)) {
      try { state = reduceEvents((await readFile(eventFile, "utf8")).split("\n").filter(Boolean).map(JSON.parse)).state; }
      catch (error) { state = "journal_invalid"; journal_error = { code: error?.code ?? "journal_invalid", message: error instanceof Error ? error.message : String(error) }; }
    }
    output.push({ id: name, path: directory, case_id: manifest.case_id ?? null, kind: manifest.kind ?? null, state, ...(journal_error ? { journal_error } : {}), bytes: measure ? await bytes(directory) : null, created_at: manifest.created_at ?? null });
  }
  return output.sort((a, b) => a.id.localeCompare(b.id));
}

export async function storageList({ caseId = null } = {}) { const home = evalHome(); return { home, runs: await runRecords(home, caseId) }; }
export async function storageStatus() {
  const home = evalHome(); const runs = await runRecords(home);
  const canonicalRoot = path.join(home, "canonical");
  // Canonical engine snapshots contain full dependency trees. Traversing all
  // of them for a status lookup can take minutes and falsely looks hung.
  return { home, runs: { count: runs.length, bytes: null, measurement: "not_scanned", active: runs.filter((run) => !["completed", "completed_with_failures", "cancelled", "journal_invalid"].includes(run.state)).map((run) => run.id) }, canonical: { root: canonicalRoot, bytes: null, measurement: "not_scanned" } };
}
export async function gcPlan() {
  const home = evalHome(); const runs = await runRecords(home, null, { measure: true });
  // Interrupted executions retain their workspace, sessions and evidence until
  // recovery reaches completion. A failed projection is not disposal consent.
  const candidates = runs.filter((run) => ["completed", "cancelled"].includes(run.state)).map((run) => ({ path: run.path, bytes: run.bytes, reason: `terminal_${run.state}` }));
  const plan = { schema_id: "dd-eval/gc-plan@1", home, created_at: new Date().toISOString(), candidates, reclaimable_bytes: candidates.reduce((sum, item) => sum + item.bytes, 0) };
  const file = path.join(home, "tmp", `gc-plan-${Date.now()}-${randomUUID().slice(0, 8)}.json`); await writeJsonAtomic(file, plan);
  return { file, ...plan };
}
function invalidGcPlan(message) {
  return Object.assign(new Error(message), { code: "usage", details: { parameter: "plan", phase: "prepare", effect: "no_effect", recoverable: true } });
}

export async function prepareGcApply({ planFile }) {
  const home = evalHome();
  if (typeof planFile !== "string" || !planFile.trim()) throw invalidGcPlan("--plan requires a file path");
  let plan;
  try { plan = await readJson(path.resolve(planFile)); }
  catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM", "input_file_not_regular", "invalid_json"].includes(error.code)) throw invalidGcPlan(`Cannot read --plan: ${error.message}`);
    throw error;
  }
  if (!plan || plan.schema_id !== "dd-eval/gc-plan@1" || plan.home !== home || !Array.isArray(plan.candidates)) throw invalidGcPlan("invalid or foreign GC plan");
  const runsRoot = path.join(home, "runs");
  // Do not begin deletion until the *whole* externally supplied plan has
  // passed structural validation.  A typo in its last entry must not make the
  // command partially destructive.
  const targets = plan.candidates.map((item) => {
    if (!item || typeof item.path !== "string" || !Number.isFinite(item.bytes) || item.bytes < 0) throw invalidGcPlan("GC plan has an invalid candidate");
    const target = path.resolve(item.path);
    if (target === runsRoot || path.dirname(target) !== runsRoot) throw invalidGcPlan("GC plan must target one complete run");
    return { item, target };
  });
  if (new Set(targets.map(({ target }) => target)).size !== targets.length) throw invalidGcPlan("GC plan lists a run more than once");
  return { home, planFile: path.resolve(planFile), targets };
}

export async function gcApply(input, prepared) {
  const { home, planFile, targets } = prepared ?? await prepareGcApply(input); const deleted = [];
  const assertDisposable = async (target) => {
      let info;
      try { info = await lstat(target); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("GC target must be a directory, not a symbolic link");
      const current = (await runRecords(home)).find((run) => run.path === target);
      if (!current || !["completed", "cancelled"].includes(current.state)) throw new Error("GC target is no longer disposable; create a fresh plan");
      const manifest = await readJson(path.join(target, "manifest.json"));
      if (!path.isAbsolute(manifest.runtime_control_bin ?? "") || !path.isAbsolute(manifest.runtime_resource_home ?? "") || !manifest.run_id) throw new Error("GC cannot prove runtime ownership for this run");
      const inventory = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "status", "--scope-id", manifest.run_id], {
        cwd: target, env: { DD_FLOW_HOME: path.join(target, "control-runtime"), DD_FLOW_RESOURCE_HOME: manifest.runtime_resource_home }, signal: AbortSignal.timeout(30_000)
      });
      if (inventory.scope_id !== manifest.run_id || !Array.isArray(inventory.processes) || !Array.isArray(inventory.provider_turns)
        || inventory.provider_turns.length || inventory.processes.some(process => !["stopped", "failed"].includes(process.state))) throw new Error("GC target still has active or unknown runtime owners");
      return true;
  };
  // Validate every target before deleting any; recheck mutable ownership under
  // each lifecycle lock immediately before removal.
  for (const { target } of targets) await assertDisposable(target);
  try {
    for (const { item, target } of targets) {
      await withRunnerLock(`${target}.lifecycle`, async () => {
        if (!await assertDisposable(target)) return;
        await rm(target, { recursive: true, force: false }); deleted.push({ path: target, bytes: item.bytes });
      });
    }
  } catch (error) {
    // Even a failed recursive removal can have effects within its target.
    error.details = { ...error.details, effect: "unknown", deleted };
    throw error;
  }
  return { plan: path.resolve(planFile), deleted, reclaimed_bytes: deleted.reduce((sum, item) => sum + item.bytes, 0) };
}
