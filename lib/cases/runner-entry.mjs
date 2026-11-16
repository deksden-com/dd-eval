import path from "node:path";
import { fileURLToPath } from "node:url";
import { contained } from "../contained-path.mjs";
import { validateEntryPack, validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Load the retained entry pack and blueprint, or the case's E2E blueprint. */
export async function runnerEntry(manifest, loaded) {
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id, loaded.value.flow);
    return { pack, packRoot: path.dirname(packFile), blueprint: validateCaseBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")), loaded) };
  }
  return { pack: null, packRoot: null, blueprint: validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) };
}
