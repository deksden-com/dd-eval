import path from "node:path";
import { pathToFileURL } from "node:url";

// The selected engine owns both adapter code and its instructions. Never fall
// back to another installation or a second copy in the eval package.
export async function loadDelegationInstructions(runtimeRoot) {
  if (typeof runtimeRoot !== "string" || !path.isAbsolute(runtimeRoot)) {
    throw Object.assign(new Error("Delegation instructions require the selected absolute runtime home"), { code: "delegation_contract_unsupported" });
  }
  const file = path.join(runtimeRoot, "harness-runtime", "lib", "delegation-instructions.mjs");
  try {
    const renderer = await import(pathToFileURL(file).href);
    if (["renderCapacityInstructions", "renderRecoveryProbeInstructions"].some(name => typeof renderer[name] !== "function")) throw new Error("Engine delegation exports are missing");
    return renderer;
  } catch (cause) {
    throw Object.assign(new Error(`Selected engine has no usable delegation instructions: ${file}`, { cause }), { code: "delegation_contract_unsupported" });
  }
}
