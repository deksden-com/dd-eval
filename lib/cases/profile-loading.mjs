import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../json-file.mjs";
import { validateHarnessProfile } from "../profile-validation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Load a harness profile by repository ID or explicit file path and validate it. */
export async function loadProfile(fileOrId) {
  const file = fileOrId.includes("/") || fileOrId.endsWith(".json") ? path.resolve(fileOrId) : path.join(repoRoot, "profiles", `${fileOrId}.json`);
  const value = await readJson(file);
  validateHarnessProfile(value, file);
  return { file, value };
}

/** Reconstruct the frozen run profile without consulting mutable definitions. */
export function retainedRunProfile(manifest) {
  return { value: manifest.profile, coveragePolicy: manifest.hitl_coverage_policy ?? null,
    executionContract: manifest.execution_contract ?? null,
    semanticFingerprint: manifest.semantic_dependency_sha256 ?? null };
}
