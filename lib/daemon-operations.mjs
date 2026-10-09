import { createHash } from "node:crypto";
import { readRegularFile as readFile } from "./regular-file.mjs";
import path from "node:path";
import { open } from "node:fs/promises";
import { constants } from "node:fs";

function location(root, id) {
  if (typeof id !== "string" || !id) throw Object.assign(new Error("operation id is required"), { code: "operation_id_required" });
  return path.join(root, "operations", createHash("sha256").update(id).digest("hex"));
}
async function read(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

export async function inspectDaemonOperation(root, id) {
  const directory = location(root, id);
  const requested = await read(path.join(directory, "requested.json"));
  if (!requested) throw Object.assign(new Error("daemon operation is not recorded"), { code: "operation_not_found", details: { operation_id: id } });
  if (requested.operation_id !== id) throw Object.assign(new Error("daemon operation identity does not match"), { code: "operation_binding_conflict" });
  const settlement = await read(path.join(directory, "settlement.json"));
  const progress = await readDaemonProgress(directory, requested);
  const outcome = await read(path.join(directory, "result.json")) ?? await read(path.join(directory, "observation-lost.json")) ?? { state: "running" };
  for (const key of ["operation_id", "daemon_id", "operation", "params_sha256", "owner_id", "generation"]) {
    if (Object.hasOwn(outcome, key) && outcome[key] !== requested[key]) throw Object.assign(new Error("daemon outcome identity conflicts with request"), { code: "operation_binding_conflict" });
  }
  return { ...requested, ...outcome, ...(settlement ? { settlement } : {}), ...(progress ? { progress } : {}) };
}

async function readDaemonProgress(directory, requested) {
  let bytes;
  try {
    const file = await open(path.join(directory, "progress.json"), constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 16 * 1024) throw Object.assign(new Error("operation progress exceeds its regular-file limit"), { code: "operation_progress_invalid" });
      const buffer = Buffer.alloc(16 * 1024 + 1);
      const { bytesRead } = await file.read({ buffer, position: 0 });
      bytes = buffer.subarray(0, bytesRead);
    } finally { await file.close(); }
  }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const invalid = () => Object.assign(new Error("daemon operation progress is invalid or foreign"), { code: "operation_progress_invalid", details: { operation_id: requested.operation_id } });
  if (bytes.length > 16 * 1024) throw invalid();
  let value; try { value = JSON.parse(bytes.toString()); } catch { throw invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_id !== "dd-flow/operation-progress@1" || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !["accepted", "ownership_confirmed", "admission_confirmed", "native_dispatched", "native_progress", "native_outcome_retained", "settlement_started", "settlement_completed", "settlement_pending"].includes(value.phase)
    || !Number.isFinite(Date.parse(requested.requested_at)) || !Number.isFinite(Date.parse(value.observed_at))
    || Date.parse(value.observed_at) < Date.parse(requested.requested_at) || Date.parse(value.observed_at) > Date.now()) throw invalid();
  for (const key of ["operation_id", "daemon_id", "operation", "params_sha256", "owner_id", "generation"]) {
    if ((value[key] ?? null) !== (requested[key] ?? null)) throw invalid();
  }
  return value;
}

/** Historical unowned records remain readable; owned work requires a release. */
export function daemonOperationReady(receipt) {
  return receipt?.state === "completed" && (["settled", "not_required"].includes(receipt.settlement?.state)
    || !receipt.settlement && receipt.owner_id == null && receipt.generation == null && !Object.hasOwn(receipt, "params_sha256"));
}
