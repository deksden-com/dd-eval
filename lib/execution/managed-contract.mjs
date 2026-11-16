import { commandJson } from "../process-json.mjs";
import { readMemoryExecutionSnapshot } from "../memory-runtime-setup.mjs";
import { validateExecutionContract, assertExecutionPolicy, assertRunExecutionContract } from "../execution-contract.mjs";
import { runtimeBin, runtimeEnv } from "./runtime-environment.mjs";

/** Read the execution evidence using the appropriate retained engine contract. */
export async function readManagedContractEvidence({ runtimeRoot, projectRoot, runId, resourceHome = runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME, contract }) {
  if (contract.generic_execution) {
    const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { ...runtimeEnv(runtimeRoot), DD_FLOW_RESOURCE_HOME: resourceHome } });
    const engine = resolved.selection?.selected;
    if ((engine?.integrity?.checksum ?? engine?.integrity_checksum) !== contract.generic_execution.engine_artifact_sha256) throw Object.assign(new Error("Memory execution engine differs from its expected artifact"), { code: "profile_contract_mismatch" });
    return { frozen_execution: await readMemoryExecutionSnapshot({ runtimeRoot, resourceHome, projectRoot, runId, engine }) };
  }
  const observed = await commandJson(runtimeBin(runtimeRoot), ["run", "status", runId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  return observed.index ?? observed;
}

/** Enforce the frozen execution contract before managed work is dispatched. */
export async function assertManagedContract({ runtimeRoot, projectRoot, runId, resourceHome, contract }) {
  if (!contract) return; // Legacy RUN retains its own frozen profile authority.
  validateExecutionContract(contract);
  for (const profile of Object.values(contract.profiles)) assertExecutionPolicy(profile);
  assertRunExecutionContract(await readManagedContractEvidence({ runtimeRoot, projectRoot, runId, resourceHome, contract }), contract);
}
