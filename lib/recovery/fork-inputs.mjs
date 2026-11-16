import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { assertCheckpointEngine } from "../engine-admission.mjs";
import { readJson } from "../json-file.mjs";
import { sha256 } from "../runner-events.mjs";
import { isStageRunSnapshot } from "./snapshot-version.mjs";

/** List stage-entry checkpoints; manifest-only results still require engine verification. */
export async function runnerCheckpoints({ evalRoot, executionId = "e2e" }) {
  const root = path.resolve(evalRoot), directory = path.join(root, "executions", executionId, "boundaries");
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
  const checkpoints = [];
  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name, "snapshot.json");
    try {
      const manifest = await readJson(file);
      if (isStageRunSnapshot(manifest) && manifest.purpose === "stage_entry" && typeof manifest.stage_entry === "string") checkpoints.push({ id: entry.name, stage: manifest.stage_entry, run_id: manifest.run_id, created_at: manifest.created_at ?? null, manifest_sha256: sha256(await readFile(file)), verification: "manifest_only", forkability: "requires_engine_verification" });
    } catch { /* a damaged capture is not an eligible checkpoint */ }
  }
  return { root, execution: executionId, checkpoints };
}

/** Admit a fork engine against its explicit pin, preserving checkpoint semantics. */
export async function assertExecutionEngine(manifest, inputCheckpoint, engine) {
  if (manifest.kind !== "derived") return assertCheckpointEngine(inputCheckpoint, engine, manifest.case_acceptance);
  const pin = manifest.derived_from?.engine;
  if (!pin?.package_version || pin.engine_version !== pin.package_version || !/^[a-f0-9]{64}$/.test(pin.integrity_checksum ?? "")) throw Object.assign(new Error("Derived EVAL must pin its upgraded engine"), { code: "fork_engine_mismatch" });
  if (engine?.package_name !== pin.package_name) throw Object.assign(new Error("Derived EVAL engine package changed"), { code: "fork_engine_mismatch" });
  return assertCheckpointEngine({ ...inputCheckpoint, value: { ...inputCheckpoint.value, flow_pack: { ...inputCheckpoint.value.flow_pack, engine: { version: pin.package_version, artifact_sha256: pin.integrity_checksum } } } }, engine, manifest.case_acceptance);
}
