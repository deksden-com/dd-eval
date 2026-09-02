import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const appendQueues = new Map();
const lockWaitMs = 10;
const lockTimeoutMs = 30_000;

async function withLock(file, action) {
  const lock = `${file}.lock`;
  const deadline = Date.now() + lockTimeoutMs;
  for (;;) {
    try {
      await mkdir(lock);
      try { return await action(); }
      finally { await rm(lock, { recursive: true, force: true }); }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const age = Date.now() - (await stat(lock)).mtimeMs;
        if (age > lockTimeoutMs) await rm(lock, { recursive: true, force: true });
      } catch (nested) { if (nested?.code !== "ENOENT") throw nested; }
      if (Date.now() >= deadline) throw Object.assign(new Error(`timed out waiting for runner lock: ${lock}`), { code: "runner_lock_timeout" });
      await new Promise((resolve) => setTimeout(resolve, lockWaitMs));
    }
  }
}

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

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export async function readEvents(file) {
  try {
    const source = await readFile(file, "utf8");
    return source.split("\n").filter(Boolean).map((line, index) => {
      try { return validateRunnerEvent(JSON.parse(line)); }
      catch { throw new Error(`invalid runner event at ${file}:${index + 1}`); }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function validateRunnerEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.specversion !== "1.0" || typeof value.id !== "string" || typeof value.source !== "string" || typeof value.type !== "string" || typeof value.time !== "string" || !value.data || typeof value.data !== "object" || !Number.isInteger(value.data.sequence) || value.data.sequence < 1) {
    throw new Error("invalid normalized runner event");
  }
  return value;
}

export async function appendEvent(file, input) {
  const prior = appendQueues.get(file) ?? Promise.resolve();
  const current = prior.then(() => withLock(file, async () => {
    const events = await readEvents(file);
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
      data: { sequence, ...input.data }
    };
    validateRunnerEvent(event);
    await mkdir(path.dirname(file), { recursive: true });
    const handle = await open(file, "a");
    try { await handle.write(`${JSON.stringify(event)}\n`); }
    finally { await handle.close(); }
    return event;
  }));
  const tail = current.catch(() => {}); appendQueues.set(file, tail);
  try { return await current; }
  finally { if (appendQueues.get(file) === tail) appendQueues.delete(file); }
}

export function reduceEvents(events) {
  const operations = new Map();
  let state = "planned";
  for (const event of events) {
    const data = event?.data ?? {};
    if (["dev.dd.eval.planned", "dev.dd.eval.completed"].includes(event.type) && typeof data.state === "string") state = data.state;
    if (typeof data.operation_id !== "string") continue;
    const prior = operations.get(data.operation_id) ?? { id: data.operation_id, requested: false, started: false, terminal: null };
    if (event.type.endsWith(".requested")) prior.requested = true;
    if (event.type.endsWith(".started")) prior.started = true;
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
  return { state, operations: Object.fromEntries([...operations].map(([id, value]) => [id, value])) };
}

export async function recordOperation({ eventsFile, source, runId, executionId, traceId, operationId, operation, subject = "runner", action }) {
  const existing = await withLock(`${eventsFile}.${operationId.replace(/[^a-zA-Z0-9._-]/g, "_")}`, async () => {
    const current = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    if (current?.terminal === "completed") return current;
    if (current?.terminal) throw Object.assign(new Error(`operation ${operationId} is already ${current.terminal}; use explicit recovery instead of replaying it`), { code: "operation_terminal", operation_id: operationId, terminal: current.terminal });
    if (current?.started && !current.terminal) throw new Error(`operation ${operationId} is already in progress; reconcile before retrying`);
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.requested", data: { operation_id: operationId, operation, status: "requested" } });
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation, status: "started" } });
    return null;
  });
  if (existing) return { reused: true, operation_id: operationId, result: existing.result };
  try {
    const result = await action();
    await completeOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, result });
    return { reused: false, operation_id: operationId, result };
  } catch (error) {
    await failOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, error });
    throw error;
  }
}

export async function completeOperation({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, result }) {
  return await settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal: "completed", result });
}

export async function failOperation({ eventsFile, source, runId, executionId, traceId, subject = "runner", operationId, operation, error }) {
  return await settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal: "failed", result: { error: error instanceof Error ? error.message : String(error) } });
}

async function settleOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, terminal, result }) {
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
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type, data });
    return { reused: false, operation_id: operationId, result };
  });
}
