import path from "node:path";
import { realpath, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyEngineArtifact } from "./engine-admission.mjs";

export async function loadNativeContracts(runtimeRoot, { requireProgress = false } = {}) {
  try {
    if (!path.isAbsolute(runtimeRoot ?? "")) throw new Error("Runtime home must be absolute");
    const adapters = await realpath(path.join(runtimeRoot, "harness-runtime"));
    const engineRoot = path.resolve(adapters, "../..");
    if (adapters !== path.join(engineRoot, "dist", "harness-runtime")) throw new Error("Adapters are not bound to an engine snapshot");
    const checksum = await verifyEngineArtifact(JSON.parse(await readFile(path.join(engineRoot, "engine.json"), "utf8")), engineRoot);
    const moduleUrl = name => `${pathToFileURL(path.join(adapters, "lib", name)).href}?artifact=${checksum}`;
    const children = await import(moduleUrl("native-children.mjs"));
    const errors = await import(moduleUrl("operation-errors.mjs"));
    const agy = await import(moduleUrl("dd-agy.mjs"));
    if (children.NATIVE_CHILD_CONTRACT_VERSION !== "native-children@1" || typeof children.normalizeNativeChildren !== "function" || !["operation-errors@1", "operation-errors@2"].includes(errors.OPERATION_ERROR_CONTRACT_VERSION) || typeof errors.isObservationLoss !== "function") throw new Error("Native contracts are incompatible");
    let progress, waits, operations, observation;
    if (requireProgress) {
      progress = await import(moduleUrl("observation-clock.mjs"));
      waits = await import(moduleUrl("adapter-timeouts.mjs"));
      operations = await import(moduleUrl("operation-progress.mjs"));
      observation = await import(moduleUrl("daemon-observation.mjs"));
      if (typeof observation.retainedDaemonReply !== "function") throw new Error("Selected runtime lacks original outcome authority");
      if (operations.OPERATION_PROGRESS_CONTRACT !== "dd-flow/operation-progress@1" || typeof operations.readOperationWaiting !== "function" || typeof operations.suspendOperationClock !== "function") throw new Error("Selected runtime lacks durable operation observation");
      if (progress.OBSERVATION_CLOCK_CONTRACT_VERSION !== "operation-progress@1" || errors.OPERATION_ERROR_CONTRACT_VERSION !== "operation-errors@2" || waits.NATIVE_OPERATION_WAIT_CONTRACT !== "native-operation-wait@1" || typeof waits.nativeOperationWait !== "function") throw new Error("Selected runtime lacks the qualified progress/error/wait contract");
    }
    if (typeof agy.agyTerminalFailure !== "function") throw new Error("AGY terminal contract is incompatible");
    return { normalizeNativeChildren: children.normalizeNativeChildren, isObservationLoss: errors.isObservationLoss, agyTerminalFailure: agy.agyTerminalFailure, engine_artifact_sha256: checksum, progress_contract: progress?.OBSERVATION_CLOCK_CONTRACT_VERSION ?? null, operation_error_contract: errors.OPERATION_ERROR_CONTRACT_VERSION, native_wait_contract: waits?.NATIVE_OPERATION_WAIT_CONTRACT ?? null, nativeOperationWait: waits?.nativeOperationWait, readOperationWaiting: operations?.readOperationWaiting, suspendOperationClock: operations?.suspendOperationClock, retainedDaemonReply: observation?.retainedDaemonReply };
  } catch (cause) { throw Object.assign(new Error("Selected engine has no verified native contracts", { cause }), { code: "native_contract_unsupported" }); }
}

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
