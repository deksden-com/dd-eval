import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { readEvents, reduceEvents, writeJsonAtomic } from "../runner-events.mjs";
import { readJson } from "../json-file.mjs";
import { evalHome } from "../execution/runtime-environment.mjs";
import { captureEngineSnapshot } from "../execution/engine-snapshot.mjs";
import { canonicalState } from "./canonical-recovery.mjs";
import { writeCanonicalState } from "./canonical-state.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Read the canonical build state and its reduced event journal. */
export async function canonicalStatus({ buildRoot }) {
  const root = path.resolve(buildRoot);
  const state = await readJson(path.join(root, "build", "state.json"));
  const events = await readEvents(path.join(root, "build", "events.jsonl"));
  return { build: root, state, journal: reduceEvents(events) };
}

/** Add the exact engine artifact to a pre-engine-snapshot canonical build.
 * This is an explicit, one-time migration; normal qualification never falls
 * back to a globally installed engine. */
export async function canonicalEngineCapture({ buildRoot }) {
  const { root, state } = await canonicalState(buildRoot);
  if (state.status !== "entries_captured") fail("engine capture is allowed only after the canonical chain is complete and before qualification", "canonical_transition_invalid");
  if (state.engine) fail("canonical build already has an engine snapshot", "canonical_engine_already_captured");
  const runId = state.reference?.run_id;
  if (typeof runId !== "string") fail("canonical build has no reference RUN for engine capture", "canonical_state_invalid");
  const projectsRoot = path.join(root, "reference", "dd-flow-home", "projects");
  const projects = await readdir(projectsRoot, { withFileTypes: true });
  const matching = projects.filter((item) => item.isDirectory()).map((item) => path.join(projectsRoot, item.name, "runs", runId, "engine-binding.json"));
  const bindingFile = (await Promise.all(matching.map(async (file) => (await exists(file)) ? file : null))).find(Boolean);
  if (!bindingFile) fail("reference RUN engine binding is missing", "canonical_engine_missing");
  const binding = await readJson(bindingFile);
  const bound = binding?.engine;
  if (!bound?.snapshot_root || !bound?.package_name || !bound?.package_version || !bound?.engine_version || !bound?.integrity_checksum) fail("reference RUN has no valid engine binding", "canonical_engine_missing");
  const sourceManifest = await readJson(path.join(bound.snapshot_root, "engine.json"));
  if (sourceManifest?.integrity?.checksum !== bound.integrity_checksum) fail("reference engine does not match the immutable RUN binding", "canonical_engine_mismatch");
  const engine = await captureEngineSnapshot({ root, home: evalHome(), selected: sourceManifest });
  for (const locator of Object.values(state.entries)) {
    const file = path.join(root, locator);
    const entry = await readJson(file);
    await writeJsonAtomic(file, { ...entry, engine });
  }
  state.engine = engine;
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.engine_captured", data: { engine } });
  return { build: root, state, engine, next: { kind: "canonical_qualify", message: "Run canonical qualify with this case's qualification profile." } };
}

