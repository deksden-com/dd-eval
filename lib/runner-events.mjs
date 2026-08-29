import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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
      try { return JSON.parse(line); }
      catch { throw new Error(`invalid runner event at ${file}:${index + 1}`); }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function appendEvent(file, input) {
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
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, "a");
  try { await handle.write(`${JSON.stringify(event)}\n`); }
  finally { await handle.close(); }
  return event;
}

export function reduceEvents(events) {
  const operations = new Map();
  let state = "planned";
  for (const event of events) {
    const data = event?.data ?? {};
    if (typeof data.state === "string") state = data.state;
    if (typeof data.operation_id !== "string") continue;
    const prior = operations.get(data.operation_id) ?? { id: data.operation_id, requested: false, started: false, terminal: null };
    if (event.type.endsWith(".requested")) prior.requested = true;
    if (event.type.endsWith(".started")) prior.started = true;
    if (event.type.endsWith(".completed") || event.type.endsWith(".failed") || event.type.endsWith(".cancelled")) {
      if (prior.terminal) throw new Error(`runner operation ${data.operation_id} has multiple terminal events`);
      prior.terminal = event.type.split(".").at(-1);
    }
    operations.set(data.operation_id, prior);
  }
  return { state, operations: Object.fromEntries([...operations].map(([id, value]) => [id, value])) };
}

export async function recordOperation({ eventsFile, source, runId, executionId, traceId, operationId, operation, subject = "runner", action }) {
  const existing = reduceEvents(await readEvents(eventsFile)).operations[operationId];
  if (existing?.terminal === "completed") return { reused: true, operation_id: operationId };
  if (existing?.started && !existing.terminal) throw new Error(`operation ${operationId} is already in progress; reconcile before retrying`);
  await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.requested", data: { operation_id: operationId, operation, status: "requested" } });
  await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation, status: "started" } });
  try {
    const result = await action();
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.completed", data: { operation_id: operationId, operation, status: "completed", result } });
    return { reused: false, operation_id: operationId, result };
  } catch (error) {
    await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.failed", data: { operation_id: operationId, operation, status: "failed", error: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}
