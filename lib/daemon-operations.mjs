import { createHash } from "node:crypto";
import { mkdir, readFile, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord, isObservationLoss, reportedError } from "./operation-errors.mjs";
import { assertDaemonOwnership } from "./managed-daemon.mjs";
import { readModelObservations, modelAttribution } from "./model-observations.mjs";

const productive = new Set(["session.create", "session.prompt", "session.start", "session.fork"]);
const controls = new Map();

async function controlDispatch(root, request, action) {
  const key = request.operation === "daemon.stop" ? `stop:${request.params?.cancelTree === true}` : `cancel:${request.params?.sessionId ?? ""}`;
  let pending = controls.get(root);
  if (!pending) { pending = new Map(); controls.set(root, pending); }
  if (pending.has(key)) return await pending.get(key);
  // Preserve the adapter's identity check for every distinct cancel target.
  // A stop arriving after cancel waits for its attempts before verification.
  const predecessors = key.startsWith("stop:") ? [...pending.values()] : [];
  const promise = (async () => { await Promise.allSettled(predecessors); return await action(); })();
  pending.set(key, promise);
  try { return await promise; }
  finally { pending.delete(key); if (!pending.size) controls.delete(root); }
}
function location(root, id) {
  if (typeof id !== "string" || !id) throw Object.assign(new Error("operation id is required"), { code: "operation_id_required" });
  return path.join(root, "operations", createHash("sha256").update(id).digest("hex"));
}
async function read(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

export async function inspectDaemonOperation(root, id) {
  const directory = location(root, id);
  const requested = await read(path.join(directory, "requested.json"));
  if (!requested) throw Object.assign(new Error("daemon operation is not recorded"), { code: "operation_not_found", details: { operation_id: id } });
  return { ...requested, ...(await read(path.join(directory, "result.json")) ?? await read(path.join(directory, "observation-lost.json")) ?? { state: "running" }) };
}

/** At-most-once dispatch and a durable terminal reply, including when the socket
 * observer disconnects. Recovery reads this receipt; it never resends a prompt. */
export async function durableDaemonDispatch(root, request, action) {
  if (request.operation === "operation.inspect") return await inspectDaemonOperation(root, request.params?.operationId);
  if (request.operation === "daemon.status") {
    const result = await action();
    if (!result?.config?.journal) return result;
    try { return { ...result, model_attribution: modelAttribution(await readModelObservations(result.config.journal)) }; }
    catch (error) { return { ...result, model_observation_error: errorRecord(error) }; }
  }
  if (["daemon.stop", "session.cancel"].includes(request.operation)) return await controlDispatch(root, request, action);
  if (!productive.has(request.operation)) return await action();
  assertDaemonOwnership();
  const directory = location(root, request.id), fingerprint = hashJson({ operation: request.operation, params: request.params ?? {} });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Publish a complete request atomically and exclusively. Writing directly with
  // wx exposes a partially written JSON document to a concurrent observer.
  const temporary = path.join(directory, `requested-${randomUUID()}.json`);
  await writeJsonAtomic(temporary, { schema_id: "dd-eval/daemon-operation@1", operation_id: request.id, operation: request.operation, session_id: request.params?.sessionId ?? null, params_sha256: fingerprint, requested_at: new Date().toISOString() });
  try {
    await link(temporary, path.join(directory, "requested.json"));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const saved = await inspectDaemonOperation(root, request.id);
    if (saved.params_sha256 !== fingerprint) throw Object.assign(new Error("operation id was reused with different parameters"), { code: "operation_conflict", details: { operation_id: request.id } });
    if (saved.state === "completed") return saved.result;
    if (saved.state === "failed") throw reportedError(saved.error, "provider operation failed");
    throw Object.assign(new Error("provider operation has no confirmed terminal result; inspect the existing operation instead of resending it"), { code: "operation_observation_lost", details: { operation_id: request.id, receipt_directory: directory } });
  } finally { await unlink(temporary); }
  let result;
  try { result = await action(); }
  catch (error) {
    const unknown = isObservationLoss(error);
    await writeJsonAtomic(path.join(directory, unknown ? "observation-lost.json" : "result.json"), { state: unknown ? "awaiting_provider" : "failed", observed_at: new Date().toISOString(), error: errorRecord(error) });
    throw error;
  }
  try { await writeJsonAtomic(path.join(directory, "result.json"), { state: "completed", finished_at: new Date().toISOString(), result }); }
  catch (cause) { throw Object.assign(new Error("provider returned but the durable reply could not be saved; do not resend the operation"), { code: "operation_observation_lost", cause, details: { operation_id: request.id, receipt_directory: directory } }); }
  return result;
}
