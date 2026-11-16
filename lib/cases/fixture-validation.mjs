import path from "node:path";
import { contained } from "../contained-path.mjs";
import { hashJson } from "../runner-events.mjs";
import { validateEntry as validateStageEntry } from "../entry-pack.mjs";
import { validateEntryPack, validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { loadCase } from "./load-case.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Validate an admitted entry pack and every stage context for a case. */
export async function fixturesValidate({ caseId, revision }) {
  const loaded = await loadCase(caseId); const pointer = loaded.value.entry_pack;
  if (!revision && typeof pointer !== "string") fail("fixture validation requires --revision when the case has no accepted entry pack");
  const packFile = revision ? path.join(loaded.root, "stage-entries", revision, "entry-pack.json") : contained(loaded.root, pointer, "entry_pack");
  const pack = validateEntryPack(await readJson(packFile), caseId, loaded.value.flow);
  if (JSON.stringify(pack.flow.contour) !== JSON.stringify(loaded.value.flow?.contour) || pack.flow.terminal_stage !== loaded.value.flow?.terminal_stage) fail("entry-pack flow does not match the case contour", "entry_pack_flow_mismatch");
  if (!revision && pack.status !== "accepted") fail("the active entry pack must be accepted");
  const packRoot = path.dirname(packFile); const blueprintFile = contained(packRoot, pack.stage_context, "stage_context"); const blueprint = validateCaseBlueprint(await readJson(blueprintFile), loaded);
  for (const stage of loaded.value.flow.contour) if (!blueprint.stages?.[stage]) fail(`stage context blueprint misses ${stage}`, "entry_pack_context_incomplete");
  const entries = {};
  for (const key of pack.flow.contour) {
    const locator = pack.entries[key]; if (typeof locator !== "string") fail(`entry-pack misses ${key}`);
    const entry = validateStageEntry(await readJson(contained(packRoot, locator, `${key} entry`)), key);
    entries[key] = { file: locator, semantic_package_sha256: entry.semantic_package_sha256, context_slice_sha256: entry.context_slice_sha256 };
  }
  return { case_id: caseId, revision: pack.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries };
}


