import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { validateHarnessProfile, validateRunProfile } from "../profile-validation.mjs";
import { contained } from "../contained-path.mjs";
import { validateCoveragePolicy, assertCoveragePolicy } from "../hitl-coverage.mjs";
import { hitlQualificationHome } from "../hitl/qualification-home.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { semanticFingerprint } from "../semantic-decisions.mjs";
import { loadCase } from "./load-case.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Load a harness profile by repository ID or explicit file path and validate it. */
export async function loadProfile(fileOrId) {
  const file = fileOrId.includes("/") || fileOrId.endsWith(".json") ? path.resolve(fileOrId) : path.join(repoRoot, "profiles", `${fileOrId}.json`);
  const value = await readJson(file);
  validateHarnessProfile(value, file);
  return { file, value };
}

/** Load a RUN profile and bind its qualified coverage and semantic policies. */
export async function loadRunProfile(file) {
  const pathName = path.resolve(file); const value = await readJson(pathName);
  validateRunProfile(value);
  let coveragePolicy = null;
  if (value.interaction_judge?.coverage_policy) {
    const loaded = await loadCase(value.case_id);
    const policyFile = contained(loaded.root, value.interaction_judge.coverage_policy, "coverage policy");
    const physical = await realpath(policyFile), base = await realpath(loaded.root);
    if (!physical.startsWith(base + path.sep)) throw Object.assign(new Error("Coverage policy escaped definition"), { code: "coverage_policy_invalid" });
    coveragePolicy = validateCoveragePolicy(JSON.parse(await readRegularFile(policyFile)));
    await assertCoveragePolicy(coveragePolicy, hitlQualificationHome(), loaded.value.hitl_qualification?.coverage?.sha256 ?? null);
  }
  return { file: pathName, value, coveragePolicy, semanticFingerprint: value.semantic_decisions?.enabled ? await semanticFingerprint(value.semantic_decisions) : null };
}

/** Reconstruct the frozen run profile without consulting mutable definitions. */
export function retainedRunProfile(manifest) {
  return { value: manifest.profile, coveragePolicy: manifest.hitl_coverage_policy ?? null,
    executionContract: manifest.execution_contract ?? null,
    semanticFingerprint: manifest.semantic_dependency_sha256 ?? null };
}
