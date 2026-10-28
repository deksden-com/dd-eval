import { AsyncLocalStorage } from "node:async_hooks";
export const recoveryObservationBudgetMs = 120_000;
const active = new AsyncLocalStorage();
export const withRecoveryObservation = (budget, action) => active.run(budget, action);
export function recoveryRpcSignal(signal) {
  const budget = active.getStore();
  if (!budget) return signal;
  // The command owns its sliding inactivity clock. A second fixed deadline
  // cannot observe progress and used to abort a healthy original operation.
  budget.timeout(); // A spent observer cannot dispatch another command.
  return signal;
}
export function recoveryRpcActivity(operationId, cursor) {
  active.getStore()?.activity(operationId, cursor);
}

// Count only active local observation. A long scheduler gap neither proves a
// provider has progressed nor spends the budget; persisted remaining time lets
// a replacement observer continue rather than start another infinite wait.
export function recoveryObservationBudget(saved, monotonic = () => performance.now()) {
  const retained = saved?.recovery_observation;
  if (retained?.policy_id !== undefined && retained.policy_id !== "settlement-inactivity@1") throw Object.assign(new Error("Unknown retained observation policy"), { code: "recovery_observation_invalid" });
  if (retained?.policy_id && (retained.progress_markers !== undefined && (!Array.isArray(retained.progress_markers) || retained.progress_markers.some(marker => typeof marker !== "string")) || retained.observation_gaps !== undefined && (!Number.isSafeInteger(retained.observation_gaps) || retained.observation_gaps < 0) || retained.observer_started !== undefined && typeof retained.observer_started !== "boolean")) throw Object.assign(new Error("Malformed retained settlement observation"), { code: "recovery_observation_invalid" });
  const sliding = retained == null || retained.policy_id === "settlement-inactivity@1";
  const markers = new Set(retained?.progress_markers ?? []);
  if (retained?.activity_cursors !== undefined && (!retained.activity_cursors || typeof retained.activity_cursors !== 'object' || Array.isArray(retained.activity_cursors)))
    throw Object.assign(new Error('Malformed retained activity cursor map'), { code: 'recovery_observation_invalid' });
  const activity = new Map(Object.entries(retained?.activity_cursors ?? {}));
  const validCursor = cursor => typeof cursor === 'string' && cursor.length > 0 || Number.isSafeInteger(cursor) && cursor >= 0;
  if ([...activity].some(([id, cursor]) => !id || !validCursor(cursor)))
    throw Object.assign(new Error('Malformed retained activity cursor'), { code: 'recovery_observation_invalid' });
  let gaps = retained?.observation_gaps ?? 0;
  const prior = saved?.recovery_observation?.remaining_ms;
  let remaining = Number.isFinite(prior) ? Math.max(0, Math.min(recoveryObservationBudgetMs, prior)) : saved?.recovery_observation == null ? recoveryObservationBudgetMs : 0;
  if (sliding && retained && retained.observer_started !== false) gaps++;
  let last = monotonic();
  let pollIndex = Number.isSafeInteger(saved?.recovery_observation?.poll_index) ? Math.max(0, saved.recovery_observation.poll_index) : 0;
  const budget = {
    exhausted(active = true, reserveMs = 0) {
      const current = monotonic(), elapsed = current - last;
      last = current;
      if (active && elapsed >= 0 && elapsed <= 60_000) remaining = Math.max(0, remaining - elapsed);
      else if (active && sliding) gaps++;
      return remaining <= reserveMs;
    },
    observe(snapshot) {
      budget.exhausted();
      if (!sliding) return;
      const proof = settlementProgressMarkers(snapshot), advanced = proof.some(marker => !markers.has(marker));
      proof.forEach(marker => markers.add(marker));
      if (advanced) { remaining = recoveryObservationBudgetMs; gaps = 0; }
    },
    activity(operationId, cursor) {
      budget.exhausted();
      const prior = activity.get(operationId);
      if (!sliding || typeof operationId !== 'string' || !operationId || !validCursor(cursor) || cursor === prior
        || typeof cursor === 'number' && cursor <= (typeof prior === 'number' ? prior : 0)) return;
      activity.set(operationId, cursor); remaining = recoveryObservationBudgetMs; gaps = 0;
    },
    state() { return { ...(sliding ? { policy_id: "settlement-inactivity@1", observer_started: true, progress_markers: [...markers].sort(), activity_cursors: Object.fromEntries(activity), observation_gaps: gaps } : {}), budget_ms: recoveryObservationBudgetMs, remaining_ms: Math.ceil(remaining), poll_index: pollIndex }; },
    timeout() {
      if (budget.exhausted()) throw Object.assign(new Error("Recovery observation budget exhausted"), { code: "recovery_observation_budget_exhausted" });
      return Math.max(1, Math.min(30_000, Math.ceil(remaining)));
    },
    nextDelay(reserveMs = 0) { return Math.min([1000, 2000, 5000, 10000][Math.min(pollIndex++, 3)], Math.max(0, Math.ceil(remaining) - reserveMs)); },
  };
  return budget;
}

// Exact settlement snapshots have already passed their owner/generation
// validators. Only monotonic proof facts count, never repeated polling or output.
export function settlementProgressMarkers(snapshot) {
  const result = [];
  const visit = (value, prefix, depth) => {
    if (!value || typeof value !== "object" || depth > 12) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, prefix, depth + 1); return; }
    const identity = ["operation_id", "process_id", "session_id", "run_id", "control_id", "scope_id", "id"].map(key => typeof value[key] === "string" ? `${key}:${value[key]}` : "").filter(Boolean).join("|");
    const location = `${prefix}/${identity}`;
    for (const key of ["physical_settled", "physical_stopped", "native_settled", "settled", "retired", "published", "committed"]) if (value[key] === true) result.push(`${location}/${key}`);
    if (value.state === "settled") result.push(`${location}/state:settled`);
    if (["completed", "released", "sealed", "verified", "retired"].includes(String(value.status))) result.push(`${location}/status:${String(value.status)}`);
    for (const [key, item] of Object.entries(value)) if (!["recovery_observation", "error", "metadata", "capture_error"].includes(key)) visit(item, `${location}/${key}`, depth + 1);
  };
  visit(snapshot, "", 0);
  return [...new Set(result)].sort();
}
