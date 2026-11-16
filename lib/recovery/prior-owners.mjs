import path from "node:path";
import { lstat, readFile, readdir } from "node:fs/promises";
import { executionState } from "../execution/execution-state.mjs";
import { listHomes } from "../homes.mjs";
import { readEvents, reduceEvents } from "../runner-events.mjs";

const read = async file => JSON.parse(await readFile(file, "utf8"));

const terminal = state => ["finished", "completed", "completed_with_failures", "failed", "cancelled", "stopped"].includes(state);
/** Decide retirement eligibility from retained terminal state, never age. */
export function retirementEligible(manifest, events) {
  const state = reduceEvents(events);
  if (state.control?.mode === "stop" || state.cancellation) return true;
  const current = (manifest.executions ?? []).map(execution => executionState(events, manifest.run_id, execution));
  // A terminal preparation failure can own reservations without ever creating
  // a Subject RUN. Eligibility grants only registry-scoped retirement.
  if (terminal(state.state) && current.every(item => !item.started && !item.result.run_id && !item.result.session_id)) return true;
  if (current.some(item => !["candidate_ready", "failed", "cancelled"].includes(item.result.state))) return false;
  return terminal(state.state) || current.length > 0 && current.every(item => ["failed", "cancelled"].includes(item.result.state));
}

/** Registry-scoped discovery, including historical homes with another resource DB. */
export async function priorEvalOwners({ caseId, excludeRoot = null, env = process.env }) {
  const output = [];
  for (const home of (await listHomes(env)).homes) {
    const roots = new Set(home.run_roots ?? []);
    for (const namespace of ["runs", "forks"]) {
      const directory = path.join(home.root, namespace);
      const names = await readdir(directory).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
      for (const name of names.filter(name => /^(EVAL|QUAL)-[A-Za-z0-9-]+$/.test(name))) roots.add(path.join(directory, name));
    }
    for (const root of [...roots].sort()) {
        if (root === excludeRoot) continue;
        let manifest;
        try { manifest = await read(path.join(root, "manifest.json")); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
        if (manifest.case_id !== caseId) continue;
        if (manifest.kind !== "qualification-owner" && !["runtime_resource_home", "runtime_control_bin", "runtime_control_home", "runtime_engine"].some(key => Object.hasOwn(manifest, key))) {
          // Legacy runs have no registered scope to retire. Their journals are
          // evidence, not admission authority; explicit legacy investigation is
          // still required. A retained control runtime must never be hidden.
          try { await lstat(path.join(root, "control-runtime")); }
          catch (error) { if (error.code === "ENOENT") continue; throw error; }
        }
        const events = await readEvents(path.join(root, "events.jsonl"));
        const eligible = retirementEligible(manifest, events);
        // Nonterminal neighbours remain active, never infer abandonment by age.
        if (eligible) output.push({ root, manifest });
    }
  }
  return output;
}
