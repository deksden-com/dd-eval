import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { addAbortListener } from "node:events";
import { withRunnerLock as withLock } from "./runner-lock.mjs";
import { isObservationLoss, isManagedWait, errorRecord } from "./operation-errors.mjs";
import { operationContext } from "./operation-context.mjs";
import { executionState } from "./execution-state.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
let observerIdentity;

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
    if (source && !source.endsWith("\n")) throw Object.assign(new Error(`Uncommitted ${label} tail at ${file}`), { code: "journal_conflict" });
    return (source ? source.slice(0, -1).split("\n") : []).map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw Object.assign(new Error(`invalid ${label} record at ${file}:${index + 1}`), { code: "journal_conflict" }); }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function readEvents(file,{previewLegacySequences=false}={}) {
  const records = await readJsonLines(file, "runner event");
  let repair;
  try { repair=JSON.parse(await readFile(`${file}.repairs.json`,'utf8')); } catch(error) {if(error.code!=='ENOENT')throw error;}
  if(repair) {
    const source=await readFile(file);
    if(repair.schema_id!=='dd-eval/journal-sequence-repair@1'||repair.run_id!==records[0]?.runid||!Number.isSafeInteger(repair.prefix_bytes)||repair.prefix_bytes<0||repair.prefix_bytes>source.length||sha256(source.subarray(0,repair.prefix_bytes))!==repair.prefix_sha256||!Array.isArray(repair.corrections))throw Object.assign(new Error('Journal repair no longer matches its immutable source prefix'),{code:'journal_conflict'});
    for(const correction of repair.corrections) {
      const index=records.findIndex(record=>record.id===correction.event_id),record=records[index];
      if(!record||record.type!=='dev.dd.eval.execution.failed'||record.data.sequence!==correction.from||correction.to!==index+1)throw Object.assign(new Error('Journal sequence repair has invalid scope'),{code:'journal_conflict'});
      records[index]={...record,data:{...record.data,sequence:correction.to}};
    }
  } else if(previewLegacySequences) {
    for(let i=0;i<records.length;i++)if(records[i].type==='dev.dd.eval.execution.failed'&&records[i].data?.sequence>0&&records[i].data.sequence<=i)records[i]={...records[i],data:{...records[i].data,sequence:i+1}};
  }
  const ids = new Set();
  return records.map((record, index) => {
    try {
      validateRunnerEvent(record);
      if (record.data.sequence !== index + 1 || record.runid !== records[0].runid || ids.has(record.id)) throw new Error("scope, sequence or duplicate identity conflict");
      ids.add(record.id);
      return record;
    }
    catch (cause) { throw Object.assign(new Error(`invalid runner event at ${file}:${index + 1}`, { cause }), { code: "journal_conflict" }); }
  });
}

/** Legacy enrichment accidentally copied the previous event's sequence.
 * Preserve raw journal bytes/checksums; annotate only mechanically proven
 * ordering corrections under the append lock. No outcomes are rewritten. */
export async function repairLegacyEventSequences(file,runId,apply=false) {
  return withLock(file,async()=>{
    const raw=await readFile(file).catch(error=>{if(error.code==='ENOENT')return Buffer.alloc(0);throw error;});
    if(!raw.length)return {corrections:0,changed:false};
    const records=await readJsonLines(file,'runner event'),ids=new Set();
    const corrections=[];
    for(let i=0;i<records.length;i++) {
      const record=records[i];validateRunnerEvent(record);
      if(record.runid!==runId||ids.has(record.id))throw Object.assign(new Error('Legacy journal scope or identity is ambiguous'),{code:'journal_conflict'});ids.add(record.id);
      if(record.data.sequence===i+1)continue;
      if(record.type!=='dev.dd.eval.execution.failed'||record.data.sequence<1||record.data.sequence>i||records.some(event=>event.data?.request_sequence===i+1))throw Object.assign(new Error('Legacy sequence cannot be repaired without changing control evidence'),{code:'journal_conflict'});
      corrections.push({event_id:record.id,from:record.data.sequence,to:i+1});
    }
    if(!corrections.length)return {corrections:0,changed:false};
    let previous;try{previous=JSON.parse(await readFile(`${file}.repairs.json`,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous){await readEvents(file);return {corrections:previous.corrections.length,changed:false};}
    if(apply)await writeJsonAtomic(`${file}.repairs.json`,{schema_id:'dd-eval/journal-sequence-repair@1',run_id:runId,prefix_bytes:raw.length,prefix_sha256:sha256(raw),corrections,reason:'legacy_sequence_enrichment',observed_at:new Date().toISOString()});
    return {corrections:corrections.length,changed:apply};
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
    if (input.deduplicate && input.id) {
      const existing = events.find(event => event.id === input.id);
      if (existing) {
        input.validateDuplicate?.(existing);
        const { sequence: _sequence, execution_operation_id: _operation, ...data } = existing.data;
        const { sequence: _inputSequence, execution_operation_id: _inputOperation, ...incoming } = input.data ?? {};
        if (existing.runid !== input.runId || existing.executionid !== input.executionId || existing.source !== input.source || existing.type !== input.type || existing.subject !== (input.subject ?? "runner") || hashJson(data) !== hashJson(incoming)) throw Object.assign(new Error("Duplicate event identity has different scope or payload"), { code: "journal_conflict" });
        // The journal is authoritative.  A previous crash after fsync but
        // before observation.json must be repairable by an idempotent retry.
        await publishObservation(file, events);
        return existing;
      }
    }
    if (input.beforeAppend?.(events) === false) return null;
    if (events.length && events[0].runid !== input.runId || input.id && events.some(event => event.id === input.id)) throw Object.assign(new Error("Event scope or identity conflicts with journal"), { code: "journal_conflict" });
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
    await publishObservation(file, [...events, event]);
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
  let state = "planned", cancellation = null, control = null, resume = null, healthState = null;
  for (const event of events) {
    const data = event?.data ?? {};
    if (event.type === "dev.dd.eval.health.reconciled") healthState = typeof data.state === "string" ? data.state : null;
    else if (event.type !== "dev.dd.eval.observer.heartbeat") healthState = null;
    if (event.type === "dev.dd.eval.cancel_requested") cancellation = { ...data, request_sequence: data.sequence };
    if (event.type === "dev.dd.eval.cancel_observed" && cancellation && data.request_sequence === cancellation.request_sequence) cancellation = data;
    if (event.type === "dev.dd.eval.control.requested") control = { ...data, request_sequence: data.sequence };
    if (event.type === "dev.dd.eval.control.observed" && control && data.request_sequence === control.request_sequence) control = { ...control, ...data };
    if (event.type === "dev.dd.eval.control.resume_applied" && !cancellation && control && data.source_request_id === control.request_id && data.request_sequence === control.request_sequence) {
      const release = data.release;
      if (typeof data.request_id !== "string" || !data.request_id || release?.scope_id !== event.runid || release.source_request_id !== control.request_id || release.request_id !== data.request_id || release.current !== true || !Number.isSafeInteger(release.generation) || release.generation < 1 || !/^[a-f0-9]{64}$/.test(release.capture_key ?? "") || !/^[a-f0-9]{64}$/.test(release.journal_sha256 ?? "")) throw Object.assign(new Error("Scope resume has no matching retained release"), { code: "journal_conflict" });
      resume = data; control = null;
    }
    if (["dev.dd.eval.planned", "dev.dd.eval.completed", "dev.dd.eval.recovery_blocked", "dev.dd.eval.recovery_failed", "dev.dd.eval.scope_settlement_required"].includes(event.type) && typeof data.state === "string") state = data.state;
    if (event.type === "dev.dd.eval.operation.started" && event.executionid && /:launch(?::recover:.*|:reconcile)?$/.test(data.operation_id ?? "") && !operations.get(data.operation_id)?.started && !operations.get(data.operation_id)?.terminal) state = "awaiting_provider";
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
  return { state: cancellation?.state ?? (control ? `${control.mode}_requested` : healthState ?? state), ...(cancellation ? { cancellation } : {}), ...(control ? { control } : {}), ...(resume ? { resume } : {}), operations: Object.fromEntries([...operations].map(([id, value]) => [id, value])) };
}

/** A durable, read-only observation contract for local tooling.  It is written
 * by the runner after every committed root journal event, so consumers do not
 * need to reproduce the runner reducer or invoke a live status command. */
export function observationProjection(events) {
  const last = events.at(-1), executions = new Map();
  let reduced;
  try {reduced=reduceEvents(events);}catch(error) {
    if(error.code!=='journal_conflict'||last?.type!=='dev.dd.eval.health.reconciled'||last.data.health?.reason!=='journal_conflict'||last.data.state!=='unconfirmed'||last.data.basis_sequence!==events.length-1)throw error;
    return {schema_id:'dd-eval/observation@1',run_id:last.runid,observed_at:last.time,last_sequence:last.data.sequence,state:'unconfirmed',health:last.data.health,executions:[],pending_operations:null,journal_complete:false,candidate:null,judge:'unknown',last_progress_at:last.data.health.last_progress_at};
  }
  const current = new Map([...new Set(events.map(event => event.executionid).filter(Boolean))].map(id => [id, executionState(events, last?.runid, { id })]));
  for (const event of events) {
    if (!event.executionid) continue;
    const active = current.get(event.executionid);
    const launch = `${event.runid}:${event.executionid}:launch`;
    const origin = event.data.execution_operation_id ?? (typeof event.data.operation_id === "string" && (event.data.operation_id === launch || event.data.operation_id.startsWith(`${launch}:`)) ? event.data.operation_id : null);
    if (origin && origin !== active.operation_id || event.data.execution_generation !== undefined && event.data.execution_generation !== active.generation) continue;
    const prior = executions.get(event.executionid) ?? { id: event.executionid, state: "unknown", last_sequence: 0 };
    const explicit = typeof event.data.state === "string" ? event.data.state : null;
    const inferred = event.type.endsWith(".candidate_ready") ? "candidate_ready"
      : event.type.endsWith(".awaiting_provider") ? "awaiting_provider"
        : event.type.endsWith(".failed") ? "failed" : null;
    const detail = event.type === "dev.dd.eval.controller.event" ? event.data.data ?? {} : event.data;
    const next = { ...prior, ...(explicit || inferred ? { state: explicit ?? inferred } : {}),
      ...(typeof detail.stage === "string" ? { stage: detail.stage } : {}),
      ...(typeof detail.status === "string" ? { controller_status: detail.status } : {}),
      ...(detail.error ? { failure: detail.error, failure_stage: detail.stage ?? prior.stage ?? null } : {}),
      ...(detail.work_id ? { last_work_id: detail.work_id } : {}),
      ...(event.data.operation_id ? { last_operation_id: event.data.operation_id } : {}),
      last_sequence: event.data.sequence };
    // A later accepted stage entry proves the old refusal no longer blocks
    // this execution. Polls/heartbeats and a merely started operation do not.
    if (event.type === "dev.dd.eval.controller.event" && event.data.type === "stage_entered"
      && typeof detail.stage === "string" && detail.stage !== (prior.failure_stage ?? prior.stage) && prior.failure && !detail.error
      && !["failed", "cancelled"].includes(active.result.state)) {
      next.previous_failure = { stage: prior.failure_stage ?? prior.stage ?? null, error: prior.failure };
      delete next.failure;
      delete next.failure_stage;
    }
    executions.set(event.executionid, next);
  }
  return {
    schema_id: "dd-eval/observation@1",
    run_id: last?.runid ?? null,
    observed_at: last?.time ?? null,
    last_progress_at: events.findLast(event => !["dev.dd.eval.health.reconciled", "dev.dd.eval.observer.heartbeat"].includes(event.type))?.time ?? null,
    last_sequence: last?.data.sequence ?? 0,
    state: reduced.state,
    health: (() => {
      const saved = events.findLast(event => event.type === "dev.dd.eval.health.reconciled");
      if (!saved || events.slice(events.indexOf(saved) + 1).some(event => !["dev.dd.eval.health.reconciled", "dev.dd.eval.observer.heartbeat"].includes(event.type))) return null;
      return saved.data.health ?? null;
    })(),
    executions: [...executions.values()].map(execution => {
      const active = current.get(execution.id);
      // Reuse productive admission's generation/terminal rules: late status is
      // evidence, not permission to revive a failed or cancelled execution.
      return active.started || ["failed", "cancelled", "candidate_ready"].includes(active.result.state)
        ? { ...execution, state: active.result.state } : execution;
    }),
    pending_operations: Object.values(reduced.operations).filter(operation => operation.started && !operation.terminal).map(operation => ({ id: operation.id, observation_lost: operation.observation_lost ?? null })),
    candidate: events.some(event => event.type === "dev.dd.eval.candidate.frozen"),
    judge: events.some(event => event.type === "dev.dd.eval.final_judge.result_ready") ? "ready" : "unknown"
  };
}

export async function publishObservation(eventsFile, events) {
  if (path.basename(eventsFile) !== "events.jsonl") return;
  const directory = path.dirname(eventsFile), warningFile = path.join(directory, "observation-error.json");
  try {
    let value=observationProjection(events);
    let certificate;
    try{certificate=JSON.parse(await readFile(path.join(directory,'health.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(certificate?.schema_id==='dd-eval/health-certificate@1'&&certificate.run_id===value.run_id&&certificate.basis_sequence===value.last_sequence) {
      const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
      if(certificate.manifest_sha256===hashJson(manifest))value={...value,health:certificate.health,...(certificate.control_status?.physical_settled===true?{state:certificate.state,control_status:certificate.control_status}:{})};
    }
    await writeJsonAtomic(path.join(directory, "observation.json"), value);
    await unlink(warningFile).catch(error => { if (error.code !== "ENOENT") throw error; });
  } catch (error) {
    // The journal already committed. A display failure must not turn a
    // committed productive result into a retryable operation failure.
    const warning = { code: "observation_projection_failed", sequence: events.at(-1)?.data.sequence ?? 0, error: errorRecord(error) };
    try { await writeJsonAtomic(warningFile, warning); }
    catch { process.stderr.write(`${JSON.stringify(warning)}\n`); }
  }
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
    const owner = await (observerIdentity ??= processSnapshot().then(items => items.find(item => item.pid === process.pid && !item.zombie)));
    const started = await appendEvent(eventsFile, { source, runId, executionId, traceId, subject, type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation, status: "started", ...(owner ? { owner_pid:owner.pid, owner_started_at:owner.started } : {}) }, beforeAppend: beforeStart });
    if (!started) throw Object.assign(new Error("Operation start was not admitted"), { code: "operation_not_admitted", operation_id: operationId });
    return null;
  });
  if (existing) return { reused: true, operation_id: operationId, result: existing.result };
  try {
    const result = await operationContext.run({ operationId, eventsFile, runId, executionId }, action);
    await completeOperation({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, result });
    return { reused: false, operation_id: operationId, result };
  } catch (error) {
    try { await recordOperationError({ eventsFile, source, runId, executionId, traceId, subject, operationId, operation, error }); }
    catch (persistence) { process.stderr.write(`${JSON.stringify({ primary: errorRecord(error), persistence: errorRecord(persistence) })}\n`); }
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
