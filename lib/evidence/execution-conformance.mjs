import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { conformanceExecutionContract, validateExecutionContract } from "../execution-contract.mjs";
import { readManagedContractEvidence } from "../execution/managed-contract.mjs";
import { parseJsonBytes } from "../json-file.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { executionSnapshotBinding } from "../recovery/snapshot-observation.mjs";
import { modelConformance } from "./model-conformance.mjs";
import { resolveEvidenceJournals } from "./evidence-journals.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Compare observed execution against its frozen contract using only owned RUN evidence. */
export async function executionConformance(result, contract, evalRoot) {
  if (!contract) return conformanceExecutionContract(null, null);
  validateExecutionContract(contract);
  let frozen;
  try {
    if (typeof evalRoot !== 'string' || !path.isAbsolute(evalRoot)) fail("Conformance requires its trusted EVAL root", "execution_scope_invalid");
    const { binding: managed } = await executionSnapshotBinding(evalRoot, result.execution, result);
    const relative = path.relative(managed.runtime_root, managed.run_home ?? "");
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("RUN profile evidence escaped runtime", "profile_contract_mismatch");
    if (await realpath(managed.run_home) !== path.resolve(await realpath(managed.runtime_root), relative)) fail("RUN profile evidence uses an unowned path", "profile_contract_mismatch");
    const profileFile = path.join(managed.run_home, 'run.json');
    if (!contract.generic_execution && ((await lstat(profileFile)).isSymbolicLink() || await realpath(profileFile) !== path.join(await realpath(managed.run_home), 'run.json')))
      fail("RUN profile evidence uses an unowned file", "profile_contract_mismatch");
    frozen = contract.generic_execution
      ? await readManagedContractEvidence({ runtimeRoot: managed.runtime_root, projectRoot: managed.project_root, runId: managed.run_id, resourceHome: managed.resource_home, contract })
      : parseJsonBytes(await readRegularFile(profileFile), profileFile);
  } catch (error) {
    return { state: "unknown", contract_sha256: contract.semantic_sha256, expected_profiles: contract.profiles, reason: "frozen_run_profiles_unavailable", error: errorRecord(error) };
  }
  return modelConformance(result, contract, frozen);
}

/** Attach retained journal attribution and contract conformance to each result. */
export async function attachModelAttribution(root, manifest, results) {
  for (const result of results) {
    result.attempt ??= path.join(root, "executions", result.execution);
    result.requested_profile = manifest.subject_profile ?? null;
    const evidence = await resolveEvidenceJournals(result);
    result.evidence_journals = evidence.journals;
    result.model_attribution = evidence.attribution;
    result.tool_evidence = evidence.tools;
    result.experiment_conformance = await executionConformance(result, manifest.execution_contract, root);
  }
  return results;
}
