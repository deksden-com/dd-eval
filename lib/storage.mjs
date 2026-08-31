import { lstat, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { evalHome, readJson } from "./runner.mjs";
import { reduceEvents, writeJsonAtomic } from "./runner-events.mjs";

async function exists(file) { try { await stat(file); return true; } catch { return false; } }
function contained(root, candidate) { const absolute = path.resolve(candidate); if (!(absolute === root || absolute.startsWith(`${root}${path.sep}`))) throw new Error(`path escapes DD_EVAL_HOME: ${candidate}`); return absolute; }
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
  const candidates = runs.filter((run) => ["completed", "completed_with_failures", "cancelled"].includes(run.state)).map((run) => ({ path: run.path, bytes: run.bytes, reason: `terminal_${run.state}` }));
  const plan = { schema_id: "dd-eval/gc-plan@1", home, created_at: new Date().toISOString(), candidates, reclaimable_bytes: candidates.reduce((sum, item) => sum + item.bytes, 0) };
  const file = path.join(home, "tmp", `gc-plan-${Date.now()}-${randomUUID().slice(0, 8)}.json`); await writeJsonAtomic(file, plan);
  return { file, ...plan };
}
export async function gcApply({ planFile }) {
  const home = evalHome(); const plan = await readJson(path.resolve(planFile));
  if (plan.schema_id !== "dd-eval/gc-plan@1" || plan.home !== home || !Array.isArray(plan.candidates)) throw new Error("invalid or foreign GC plan");
  const runsRoot = path.join(home, "runs"); const deleted = [];
  for (const item of plan.candidates) {
    const target = contained(runsRoot, item.path);
    if (target === runsRoot) throw new Error("GC plan cannot delete the runs root");
    if (await exists(target)) { await rm(target, { recursive: true, force: false }); deleted.push({ path: target, bytes: item.bytes }); }
  }
  return { plan: path.resolve(planFile), deleted, reclaimed_bytes: deleted.reduce((sum, item) => sum + item.bytes, 0) };
}
