import path from "node:path";
import { validateEntry as validateStageEntry, writeEntryPack } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson } from "../runner-events.mjs";
import { manifestHash } from "./canonical-state.mjs";
import { loadCase } from "./load-case.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Load and validate every captured entry in the declared flow contour. */
export async function canonicalEntries(root, state, contour) {
  if (contour.some((key) => typeof state.entries?.[key] !== "string")) fail("canonical build has not captured every declared entry", "canonical_entries_incomplete");
  const entries = {};
  for (const stage of contour) entries[stage] = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage, flowStageCatalog(contour));
  return entries;
}

/** Materialize the candidate pack from retained, verified canonical entries. */
export async function canonicalCandidatePack(root, state, blueprint, preparedEntries) {
  const contour = (await loadCase(state.case_id)).value.flow.contour;
  const entries = preparedEntries ?? await canonicalEntries(root, state, contour);
  const buildTrace = path.join(root, "build", "events.jsonl");
  const inputCheckpoint = state.input_checkpoint;
  if (!isObject(inputCheckpoint) || typeof inputCheckpoint.id !== "string" || !/^[a-f0-9]{64}$/.test(inputCheckpoint.sha256 ?? "")) fail("canonical build has no verified input checkpoint", "canonical_state_invalid");
  const pack = await writeEntryPack({ caseDir: path.join(root, state.case_id), revision: state.revision, inputCheckpoint: { id: inputCheckpoint.id, sha256: inputCheckpoint.sha256 }, flow: { contour, terminal_stage: contour.at(-1), flow_commit: state.materialized_input?.flow_commit ?? null, flow_manifest_sha256: state.materialized_input?.flow_manifest_sha256 ?? null }, stageBlueprint: blueprint, entries, authoring: { profile_id: state.profile, build_trace_sha256: await manifestHash(buildTrace) } });
  pack.entries = Object.fromEntries(contour.map((key) => [key, state.entries[key]]));
  pack.hashes = { ...pack.hashes, focused_entries: Object.fromEntries(Object.entries(entries).map(([stage, entry]) => [stage, hashJson(entry)])) };
  pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  return pack;
}
