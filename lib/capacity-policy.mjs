import path from "node:path";
import { realpath, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyEngineArtifact } from "./engine-admission.mjs";

// Per owner, from the exact retained engine, never from the active installation.
export async function loadCapacityPolicy(runtimeRoot) {
  try {
    if (!path.isAbsolute(runtimeRoot ?? "")) throw new Error("Runtime home must be absolute");
    const adapters = await realpath(path.join(runtimeRoot, "harness-runtime"));
    const engineRoot = path.resolve(adapters, "../..");
    if (adapters !== path.join(engineRoot, "dist", "harness-runtime")) throw new Error("Adapters are not bound to an engine snapshot");
    const engine = JSON.parse(await readFile(path.join(engineRoot, "engine.json"), "utf8"));
    const checksum = await verifyEngineArtifact(engine, engineRoot);
    const policy = await import(pathToFileURL(path.join(adapters, "lib", "codex-capacity-policy.mjs")).href);
    if (policy.CAPACITY_POLICY !== "codex-overload-burst@1" || ["terminalCodexOverload", "nativeItemsSettled", "capacityBackoff", "overloadBurst", "normalizeCodexFailure", "refusalObservation"].some(name => typeof policy[name] !== "function")) throw new Error("Capacity policy exports are incompatible");
    return { ...policy, engine_artifact_sha256: checksum };
  } catch (cause) {
    throw Object.assign(new Error("Selected engine has no verified capacity policy", { cause }), { code: "capacity_contract_unsupported" });
  }
}
