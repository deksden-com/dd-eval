import { executionState } from "./execution-state.mjs";
import { hashJson } from "./journal-hash.mjs";

/** Reduce the ordered event journal and reject conflicting terminal outcomes. */
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
