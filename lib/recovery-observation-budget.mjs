import { AsyncLocalStorage } from "node:async_hooks";
export const recoveryObservationBudgetMs = 120_000;
const active = new AsyncLocalStorage();
export const withRecoveryObservation = (budget, action) => active.run(budget, action);
export function recoveryRpcSignal(signal) {
  const budget = active.getStore();
  if (!budget) return signal;
  const bounded = AbortSignal.timeout(budget.timeout());
  return signal ? AbortSignal.any([signal, bounded]) : bounded;
}

// Count only active local observation. A long scheduler gap neither proves a
// provider has progressed nor spends the budget; persisted remaining time lets
// a replacement observer continue rather than start another infinite wait.
export function recoveryObservationBudget(saved, monotonic = () => performance.now()) {
  const prior = saved?.recovery_observation?.remaining_ms;
  let remaining = Number.isFinite(prior) ? Math.max(0, Math.min(recoveryObservationBudgetMs, prior)) : saved?.recovery_observation == null ? recoveryObservationBudgetMs : 0;
  let last = monotonic();
  let pollIndex = Number.isSafeInteger(saved?.recovery_observation?.poll_index) ? Math.max(0, saved.recovery_observation.poll_index) : 0;
  const budget = {
    exhausted(active = true, reserveMs = 0) {
      const current = monotonic(), elapsed = current - last;
      last = current;
      if (active && elapsed >= 0 && elapsed <= 60_000) remaining = Math.max(0, remaining - elapsed);
      return remaining <= reserveMs;
    },
    state() { return { budget_ms: recoveryObservationBudgetMs, remaining_ms: Math.ceil(remaining), poll_index: pollIndex }; },
    timeout() {
      if (budget.exhausted()) throw Object.assign(new Error("Recovery observation budget exhausted"), { code: "recovery_observation_budget_exhausted" });
      return Math.max(1, Math.min(30_000, Math.ceil(remaining)));
    },
    nextDelay(reserveMs = 0) { return Math.min([1000, 2000, 5000, 10000][Math.min(pollIndex++, 3)], Math.max(0, Math.ceil(remaining) - reserveMs)); },
  };
  return budget;
}
