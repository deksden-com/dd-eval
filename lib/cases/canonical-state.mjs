import path from "node:path";
import { readFile } from "node:fs/promises";
import { appendEvent, hashJson, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { semanticContextHash, stages } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";

/** Choose the next canonical revision from retained revision names. */
export function nextRevision(existing) { const values = existing.filter((entry) => /^REV-\d+$/.test(entry)).map((entry) => Number(entry.slice(4))); return `REV-${String((values.length ? Math.max(...values) : 0) + 1).padStart(3, "0")}`; }
/** Store canonical locations relative to the EVAL home. */
export function canonicalLocator(home, target) { return path.relative(home, target).split(path.sep).join("/"); }
/** Hash the exact bytes of a retained snapshot manifest. */
export async function manifestHash(file) { return sha256(await readFile(file)); }
/** Persist canonical state and append its optional transition event. */
export async function writeCanonicalState(root, state, event) {
  const file = path.join(root, "build", "state.json");
  await writeJsonAtomic(file, state);
  if (event) await appendEvent(path.join(root, "build", "events.jsonl"), event);
}
/** Build a stage entry bound to its snapshot and semantic context. */
export function canonicalEntry({ caseId, revision, stage, snapshot, blueprint, flowContour = stages }) {
  const slice = blueprint.stages[stage];
  return {
    schema_id: "dd-eval/stage-entry@1", case_id: caseId, revision,
    checkpoint_id: `STG-${stage.toUpperCase()}-ENTRY-${revision}`,
    stage, snapshot,
    semantic_package_sha256: semanticContextHash(slice, flowStageCatalog(flowContour)), context_slice_sha256: hashJson(slice)
  };
}
