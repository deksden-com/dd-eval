import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { addAbortListener } from "node:events";
import { withRunnerLock as withLock } from "./runner-lock.mjs";
import { isObservationLoss, isManagedWait, errorRecord } from "./operation-errors.mjs";
import { operationContext } from "./operation-context.mjs";

const appendQueues = new Map();

export function canonicalJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    return item;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJson(value) { return sha256(canonicalJson(value)); }

export async function recordControllerEvent({ eventsFile, runId, executionId, controllerId, event }) {
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) throw Object.assign(new Error("Invalid controller event sequence"), { code: "controller_receipt_invalid" });
  return appendEvent(eventsFile, { source: "dd-eval://runner", runId, executionId, type: "dev.dd.eval.controller.event",
    id: `controller:${hashJson([runId, executionId, controllerId, event.sequence])}`, deduplicate: true,
    validateDuplicate: existing => {
      if (hashJson([existing.data.type, existing.data.data]) !== hashJson([event.type, event.data])) throw Object.assign(new Error("Controller event changed after publication"), { code: "journal_conflict" });
    },
    data: { ...event, controller_id: controllerId, controller_sequence: event.sequence } });
}

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const payload = await open(temporary, "wx", 0o600);
    try { await payload.writeFile(`${JSON.stringify(value, null, 2)}\n`); await payload.sync(); }
    finally { await payload.close(); }
    await rename(temporary, file);
    const directory = await open(path.dirname(file), "r");
    try { await directory.sync(); }
    finally { await directory.close(); }
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export async function readJsonLines(file, label = "JSONL") {
  try {
    const source = await readFile(file, "utf8");
    return source.split("\n").filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`invalid ${label} record at ${file}:${index + 1}`); }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function readEvents(file) {
  const records = await readJsonLines(file, "runner event");
  return records.map((record, index) => {
    try { return validateRunnerEvent(record); }
    catch { throw new Error(`invalid runner event at ${file}:${index + 1}`); }
  });
}

export function validateRunnerEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.specversion !== "1.0" || typeof value.id !== "string" || typeof value.source !== "string" || typeof value.type !== "string" || typeof value.time !== "string" || !value.data || typeof value.data !== "object" || !Number.isInteger(value.data.sequence) || value.data.sequence < 1) {
    throw new Error("invalid normalized runner event");
  }
  return value;
}

export async function appendEvent(file, input, { signal } = {}) {
  signal?.throwIfAborted();
  const prior = appendQueues.get(file) ?? Promise.resolve();
  const current = prior.then(() => withLock(file, async () => {
    const events = await readEvents(file);
    signal?.throwIfAborted();
    // Internal callers can validate a dispatch or bind its generation under
    // the same cross-process lock that orders cancellation and completion.
    if (input.deduplicate && input.id) { const existing = events.find(event => event.id === input.id); if (existing) { input.validateDuplicate?.(existing); return existing; } }
    if (input.beforeAppend?.(events) === false) return null;
    const sequence = events.length + 1;
    const event = {
      specversion: "1.0",
      id: input.id ?? `EVT-${randomUUID()}`,
      source: input.source,
      type: input.type,
      time: input.time ?? new Date().toISOString(),
      subject: input.subject ?? "runner",
      datacontenttype: "application/json",
      runid: input.runId,
      executionid: input.executionId,
      traceid: input.traceId,
      spanid: input.spanId ?? randomUUID(),
      ...(input.parentSpanId ? { parentspanid: input.parentSpanId } : {}),
      data: { ...input.data, sequence }
    };
    const context = operationContext.getStore();
    if (context?.eventsFile === file && context.executionId === input.executionId && context.operationId && input.executionId) {
      event.data.execution_operation_id ??= context.operationId;
    }
    validateRunnerEvent(event);
    await mkdir(path.dirname(file), { recursive: true });
    const handle = await open(file, "a");
    try { signal?.throwIfAborted(); await handle.write(`${JSON.stringify(event)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    return event;
  }, { signal }));
  const tail = current.catch(() => {}); appendQueues.set(file, tail);
  let listener;
  try {
    return await (signal ? Promise.race([current, new Promise((_, reject) => {
      listener = addAbortListener(signal, () => reject(signal.reason));
    })]) : current);
  } finally {
    listener?.[Symbol.dispose]();
    // A timed-out queued append still owns its position until it observes abort.
    tail.then(() => { if (appendQueues.get(file) === tail) appendQueues.delete(file); });
  }
}

export function reduceEvents(events) {
  const operations = new Map();
  let state = "planned", cancellation = null, control = null, resume = null;
  for (const event of events) {
    const data = event?.data ?? {};
    if (event.type === "dev.dd.eval.cancel_requested") cancellation = { ...data, request_sequence: data.sequence };
    if (event.type === "dev.dd.eval.cancel_observed" && cancellation && data.request_sequence === cancellation.request_sequence) cancellation = data;
    if (event.type === "dev.dd.eval.control.requested") control = { ...data, request_sequence: data.sequence };
    if (event.type === "dev.dd.eval.control.observed" && control && data.request_sequence === control.request_sequence) control = { ...control, ...data };
    if (event.type === "dev.dd.eval.control.resume_applied" && !cancellation && control && data.source_request_id === control.request_id && data.request_sequence === control.request_sequence) {
      const release = data.release;
      if (typeof data.request_id !== "string" || !data.request_id || release?.scope_id !== event.runid || release.source_request_id !== control.request_id || release.request_id !== data.request_id || release.current !== true || !Number.isSafeInteger(release.generation) || release.generation < 1 || !/^[a-f0-9]{64}$/.test(release.capture_key ?? "") || !/^[a-f0-9]{64}$/.test(release.journal_sha256 ?? "")) throw Object.assign(new Error("Scope resume has no matching retained release"), { code: "journal_conflict" });
      resume = data; control = null;
    }
    if (["dev.dd.eval.planned", "dev.dd.eval.completed"].includes(event.type) && typeof data.state === "string") state = data.state;
    if (event.type === "dev.dd.eval.operation.started" && event.executionid && /:launch(?::recover:.*|:reconcile)?$/.test(data.operation_id ?? "")) state = "awaiting_provider";
    if (typeof data.operation_id !== "string") continue;
    const prior = operations.get(data.operation_id) ?? { id: data.operation_id, requested: false, started: false, terminal: null };
    if (event.type.endsWith(".requested")) prior.requested = true;
    if (event.type.endsWith(".started")) prior.started = true;
    if (event.type.endsWith(".observation_lost")) prior.observation_lost = data.error ?? { code: "observation_lost" };
    if (event.type.endsWith(".completed") || event.type.endsWith(".failed") || event.type.endsWith(".cancelled")) {
      const terminal = event.type.split(".").at(-1);
      const result = terminal === "completed" ? data.result : { error: data.error ?? null };
      const resultHash = hashJson({ terminal, result });
      if (prior.terminal && (prior.terminal !== terminal || prior.result_hash !== resultHash)) {
        throw Object.assign(new Error(`runner operation ${data.operation_id} has conflicting terminal events`), { code: "journal_conflict", operation_id: data.operation_id });
      }
      prior.terminal = terminal;
      prior.result = result;
      prior.result_hash = resultHash;
    }
    operations.set(data.operation_id, prior);
  }
  return { state: cancellation?.state ?? (control ? `${control.mode}_requested` : state), ...(cancellation ? { cancellation } : {}), ...(control ? { control } : {}), ...(resume ? { resume } : {}), operations: Object.fromEntries([...operations].map(([id, value]) => [id, value])) };
}

/** Experiment-owned reconciliation inventory. An interrupted observer is not
 * a completed operation, and a terminal failure is not permission to replay. */
export function controlOperationInventory(events, runId) {
  if (events.some((event, index) => event.runid !== runId || event.data.sequence !== index + 1)) throw Object.assign(new Error("control journal scope or sequence changed"), { code: "journal_conflict" });
  const ledger = events.filter(event => event.type.startsWith("dev.dd.eval.operation."));
  const owners = new Map();
  for (const event of ledger) {
    const id = event.data.operation_id, operation = event.data.operation, execution = event.executionid ?? null;
    if (typeof id !== "string" || !id || typeof operation !== "string" || !operation) throw Object.assign(new Error("control reconciliation requires retained operation identities"), { code: "journal_conflict" });
    const previous = owners.get(id);
    if (previous && (previous.operation !== operation || previous.execution_id !== execution)) throw Object.assign(new Error(`operation ${id} changed its owner`), { code: "journal_conflict", operation_id: id });
    const phase = event.type.slice("dev.dd.eval.operation.".length);
    if (!["requested", "started", "suspended", "observation_lost", "completed", "failed", "cancelled"].includes(phase) || !["requested", "started"].includes(phase) && !previous?.started || previous?.terminal && ["requested", "started"].includes(phase)) throw Object.assign(new Error(`operation ${id} has no valid dispatch history`), { code: "journal_conflict", operation_id: id });
    owners.set(id, { operation, execution_id: execution, started: previous?.started || phase === "started", terminal: previous?.terminal || ["completed", "failed", "cancelled"].includes(phase) });
  }
  const reduced = reduceEvents(ledger);
  const operations = Object.values(reduced.operations).map(item => {
    const status = item.terminal ?? (item.started ? "unknown" : "not_started");
    const owner = owners.get(item.id);
    return { operation_id: item.id, operation: owner.operation, execution_id: owner.execution_id, status,
      disposition: status === "completed" ? "reuse" : status === "not_started" ? "dispatch_after_resume" : status === "unknown" ? "reconcile" : "explicit_recovery",
      result_hash: item.result_hash ?? null };
  });
  return { sequence: events.at(-1)?.data.sequence ?? 0, operations, unresolved_operations: operations.filter(item => item.disposition === "reconcile" || item.disposition === "explicit_recovery").map(item => item.operation_id) };
}

export async function recordOperation({ eventsFile, source, runId, executionId, traceId, operationId, operation, subject = "runner", beforeStart, action }) {
  const existing = await withLock(`${eventsFile}.${operationId.replace(/[^a-zA-Z0-9._-]/g, "_")}`, async () => {
    const current = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    if (current?.terminal === "completed") return current;
    if (current?.terminal) throw Object.assign(new Error(`operation ${operationId} is already ${current.terminal}; use explicit recovery instead of replaying it`), { code: "operation_terminal", operation_id: operationId, terminal: current.terminal });
    if (current?.started && !current.terminal) {
      const error = new Error(current.observation_lost
        ? `operation ${operationId} has no confirmed outcome; reconcile its provider state before retrying`
        : `operation ${operationId} is already in progress; reconcile before retrying`);
      error.code = current.observation_lost ? "operation_observation_lost" : "operation_in_progress";
      error.operation_id = operationId;
      throw error;
    }
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.requested", data: { operation_id: operationId, operation, status: "requested" } });
    const started = await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation, status: "started" }, beforeAppend: beforeStart });
    if (!started) throw Object.assign(new Error("Operation start was not admitted"), { code: "operation_not_admitted", operation_id: operationId });
    return null;
  });
  if (existing) return { reused: true, operation_id: operationId, result: existing.result };
  try {
    const result = await operationContext.run({ operationId, eventsFile, runId, executionId }, action);
    await completeOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, result });
    return { reused: false, operation_id: operationId, result };
  } catch (error) {
    await recordOperationError({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, error });
    throw error;
  }
}

/** Launch and reattach must classify the same observed outcome identically. */
export async function recordOperationError({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, error }) {
    if (isManagedWait(error)) await appendEvent(eventsFile, { source, runId, executionId, traceId, subject,
      type: "dev.dd.eval.operation.suspended", data: { operation_id: operationId, operation, status: "suspended", error: errorRecord(error) } });
    else if (isObservationLoss(error)) await observationLost({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, error });
    else await failOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, error });
}

export async function completeOperation({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, result, beforeAppend }) {
  return await settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal: "completed", result, beforeAppend });
}

export async function failOperation({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, error }) {
  return await settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal: "failed", result: { error: errorRecord(error) } });
}

/** A lost observer response is deliberately non-terminal: replay could duplicate a provider Turn. */
export async function observationLost({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, error }) {
  return await withLock(`${eventsFile}.${operationId.replace(/[^a-zA-Z0-9._-]/g, "_")}`, async () => {
    const existing = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    if (existing?.terminal) return { reused: true, operation_id: operationId, result: existing.result };
    if (!existing?.started) throw Object.assign(new Error(`operation ${operationId} has no started receipt`), { code: "operation_not_started" });
    if (existing.observation_lost) return { reused: true, operation_id: operationId, observation_lost: existing.observation_lost };
    const recorded = errorRecord(error);
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.observation_lost", data: { operation_id: operationId, operation, status: "observation_lost", error: recorded } });
    return { reused: false, operation_id: operationId, observation_lost: recorded };
  });
}

async function settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal, result, beforeAppend }) {
  return await withLock(`${eventsFile}.${operationId.replace(/[^a-zA-Z0-9._-]/g, "_")}`, async () => {
    const existing = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    const expectedHash = hashJson({ terminal, result });
    if (existing?.terminal) {
      if (existing.terminal === terminal && existing.result_hash === expectedHash) return { reused: true, operation_id: operationId, result: existing.result };
      throw Object.assign(new Error(`runner operation ${operationId} has conflicting terminal result`), { code: "journal_conflict", operation_id: operationId });
    }
    if (!existing?.started) throw Object.assign(new Error(`operation ${operationId} has no started receipt`), { code: "operation_not_started" });
    const type = terminal === "completed" ? "dev.dd.eval.operation.completed" : "dev.dd.eval.operation.failed";
    const data = terminal === "completed"
      ? { operation_id: operationId, operation, status: terminal, result }
      : { operation_id: operationId, operation, status: terminal, error: result.error };
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type, data, beforeAppend: events => {
      if (beforeAppend?.(events) === false) throw Object.assign(new Error("operation reconciliation was superseded"), { code: "operation_reconciliation_stale" });
    } });
    return { reused: false, operation_id: operationId, result };
  });
}
