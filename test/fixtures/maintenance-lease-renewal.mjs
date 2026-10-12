/** Shared policy only; transports and owner-specific fences stay at callsites. */
export const RENEWAL_POLICY = Object.freeze({ startupMs: 120_000, budgetMs: 126_000, attemptMs: 5_000, safetyMs: 1_000 });
export function createRenewalState({ leaseExpiresAt = null } = {}) { return { uncertainSince: null, attempt: 0, exhausted: false, leaseExpiresAt }; }
export function renewalRemaining(state, now = performance.now(), wallNow = Date.now()) {
  const expiry = Date.parse(state.leaseExpiresAt ?? "");
  const budget = Number.isFinite(expiry) ? Math.max(0, expiry - wallNow - RENEWAL_POLICY.safetyMs) : state.leaseExpiresAt !== null ? 0 : RENEWAL_POLICY.budgetMs;
  const remaining = state.exhausted ? 0 : Number.isFinite(expiry) || state.uncertainSince === null ? budget : Math.max(0, budget - (now - state.uncertainSince));
  if (remaining === 0) state.exhausted = true;
  return remaining;
}
export function renewalFailure(state, now = performance.now()) { state.uncertainSince ??= now; state.attempt++; return renewalRemaining(state, now); }
export function renewalDelay(state) { return Math.min(2_000, 250 * 2 ** Math.min(3, Math.max(0, state.attempt - 1))); }
export function renewalConfirmed(state, now = performance.now(), leaseExpiresAt = null) {
  // Caller verifies exact owner/fence. A committed receipt, not elapsed time,
  // establishes the new authority horizon.
  if (leaseExpiresAt !== null) {
    const expiry = Date.parse(leaseExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now() + RENEWAL_POLICY.safetyMs) return false;
    state.leaseExpiresAt = leaseExpiresAt; state.exhausted = false;
  }
  if (!renewalRemaining(state, now)) return false;
  state.uncertainSince = null; state.attempt = 0; return true;
}
export function maintenanceRetryable(error) {
  let retryable = false;
  // Inspect only bounded typed causes from our maintenance transport, never text.
  for (let depth = 0; error && depth < 8; depth++, error = error.cause ?? error.details?.cause) {
    if (error.details?.cleanup_unconfirmed === true) return false;
    if (error.details?.effect === "unknown") return false;
    if (["process_lease_lost", "controller_lease_lost", "process_maintenance_receipt_invalid", "runtime_owner_mismatch"].includes(error.code)) return false;
    if (error.code === "process_ownership_unknown" && error.details?.reason === "physical_identity_unavailable" && ["process_confirmation", "observer_registration"].includes(error.details.phase) && error.details.effect === "no_effect" && error.details.native_dispatch_started === false) retryable = true;
    if (["process_heartbeat_timeout", "process_maintenance_timeout", "hook_deadline_exceeded", "native_hook_timeout", "SQLITE_BUSY", "SQLITE_LOCKED"].includes(error.code)) retryable = true;
    if (error.code === "ERR_SQLITE_ERROR" && [5, 6].includes((error.details?.sqlite_extended_code ?? error.sqlite_extended_code ?? error.errcode) & 255)) retryable = true;
  }
  return retryable;
}
