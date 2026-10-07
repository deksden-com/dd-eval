import path from "node:path";
import { pathToFileURL } from "node:url";
import { realpath } from "node:fs/promises";
import { verifyEngineArtifact } from "./engine-admission.mjs";
import { readRegularFile } from "./regular-file.mjs";
import { hashJson, sha256, writeJsonAtomic } from "./runner-events.mjs";

/** Load only from the selected, content-verified engine, never active source. */
export async function loadOperationalContract(runtimeRoot) {
  try {
    const adapters = await realpath(path.join(runtimeRoot, "harness-runtime"));
    const root = path.resolve(adapters, "../..");
    if (adapters !== path.join(root, "dist", "harness-runtime")) throw new Error("Unbound engine runtime");
    const engine = JSON.parse(await readRegularFile(path.join(root, "engine.json")));
    const checksum = await verifyEngineArtifact(engine, root);
    const contract = await import(`${pathToFileURL(path.join(root, "dist", "services", "vnext-execution-profile.js")).href}?artifact=${checksum}`);
    if (contract.RUN_OPERATIONAL_DECISION_CONTRACT !== "run-operational-decision@1" || typeof contract.validateRunOperationalDecision !== "function" || typeof contract.validateVnextExecutionProfile !== "function") throw new Error("Unsupported operational contract");
    return contract;
  } catch (cause) {
    throw Object.assign(new Error("Selected engine lacks the operational decision contract", { cause }), { code: "operational_contract_unsupported" });
  }
}

export function operationalDecisionFor(declaration, { projectRoot, evalId, executionId }) {
  if (!declaration) return null;
  if (!declaration.acceptance?.source || !declaration.acceptance?.reference) throw Object.assign(new Error("Launch definition must declare acceptance; preflight cannot invent it"), { code: "operational_decision_invalid" });
  const bytes = JSON.stringify(declaration);
  return { ...declaration, declaration: { bytes, sha256: sha256(bytes) }, scope: { project_root: path.resolve(projectRoot), eval_id: evalId, execution_id: executionId } };
}

export async function materializeOperationalDecision({ declaration, projectRoot, runtimeRoot, evalId, executionId, sourceRoot = projectRoot, output = null }) {
  const file = path.join(sourceRoot, ".memory-bank", "dd-flow", "project-execution.json");
  const profile = JSON.parse(await readRegularFile(file));
  // Ordinary retained @2/@3 flows still use their selected engine's admission.
  // Only the new explicit decision requires this additional shared contract.
  if (!declaration && ["dd-flow/project-execution@2", "dd-flow/project-execution@3"].includes(profile.schema_id) && !profile.operational_decision) return null;
  const contract = await loadOperationalContract(runtimeRoot);
  const decision = operationalDecisionFor(declaration, { projectRoot, evalId, executionId });
  if (decision) {
    contract.validateRunOperationalDecision(decision, profile);
    const policyFile = path.resolve(sourceRoot, decision.policy.path);
    const relative = path.relative(await realpath(sourceRoot), await realpath(policyFile));
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || sha256(await readRegularFile(policyFile)) !== decision.policy.sha256) throw Object.assign(new Error("Declared operational policy bytes do not match the owned input"), { code: "operational_decision_policy_changed" });
    profile.operational_decision = decision;
  }
  contract.validateVnextExecutionProfile(profile);
  if (output) { if (!decision) throw Object.assign(new Error("New imported execution requires its own declaration"), { code: "operational_decision_invalid" }); await writeJsonAtomic(output, decision); }
  else if (decision) await writeJsonAtomic(file, profile);
  return { decision, declaration_sha256: declaration ? hashJson(declaration) : null, file: output ?? file };
}
