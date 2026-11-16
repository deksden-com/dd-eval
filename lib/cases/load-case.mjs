import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { sha256 } from "../runner-events.mjs";
import { contained } from "../contained-path.mjs";
import { validateEntryPack, validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { validateCanonicalResponseRefs } from "../canonical-response-refs.mjs";
import { validateCaseAcceptancePolicy } from "../case-acceptance.mjs";
import { loadInputCheckpoint } from "./input-checkpoint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

function caseDir(caseId) { return contained(path.join(repoRoot, "cases"), caseId, "case id"); }
/** Load a case only after validating its definition, inputs and pinned checkpoint. */
export async function loadCase(caseId) {
  const root = caseDir(caseId); const value = await readJson(path.join(root, "case.json"));
  if (!isObject(value) || value.schema_id !== "dd-eval/case@7") fail(`${caseId} must use dd-eval/case@7`);
  if (value.id !== caseId || typeof value.assessment !== "string" || !Array.isArray(value.input)) fail("case requires id, assessment and ordered input");
  validateCaseAcceptancePolicy(value.case_acceptance);
  for (const item of value.input) {
    if (!isObject(item) || typeof item.role !== "string" || !item.role || typeof item.source !== "string" || !item.source || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) fail("case input item is invalid");
    const file = contained(root, item.source, "case input source"); if (!(await exists(file)) || sha256(await readFile(file)) !== item.sha256) fail(`case input checksum does not match: ${item.source}`, "case_input_checksum_mismatch");
  }
  if (!(value.entry_pack === null || typeof value.entry_pack === "string")) fail("case.entry_pack must be a path or null");
  if ("starter_sessions" in value || "canonical_checkpoints" in value || "priming" in value) fail("case@7 cannot contain starter or canonical Session fields");
  const assessment = await validateCanonicalResponseRefs(root, await readJson(contained(root, value.assessment, "assessment")), value.flow?.contour ?? null);
  return { root, value, assessment, inputCheckpoint: await loadInputCheckpoint(value.input_checkpoint) };
}

/** Load the retained entry pack and blueprint, or the case's E2E blueprint. */
export async function runnerEntry(manifest, loaded) {
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id, loaded.value.flow);
    return { pack, packRoot: path.dirname(packFile), blueprint: validateCaseBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")), loaded) };
  }
  return { pack: null, packRoot: null, blueprint: validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) };
}
