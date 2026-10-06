export const RENEWAL_POLICY = { budgetMs: 30000, attemptMs: 5000 };
export function createRenewalState() { return { uncertainSince: null, attempt: 0, exhausted: false }; }
export function renewalRemaining(state) { const left = state.exhausted ? 0 : state.uncertainSince === null ? 30000 : Math.max(0, 30000 - (performance.now() - state.uncertainSince)); if (!left) state.exhausted = true; return left; }
export function renewalFailure(state) { state.uncertainSince ??= performance.now(); state.attempt++; return renewalRemaining(state); }
export function renewalDelay(state) { return Math.min(2000, 250 * 2 ** Math.min(3, Math.max(0, state.attempt - 1))); }
export function renewalConfirmed(state) { if (!renewalRemaining(state)) return false; state.uncertainSince = null; state.attempt = 0; return true; }
export function maintenanceRetryable(error) {
  let retryable = false;
  for (let depth = 0; error && depth < 8; depth++, error = error.cause ?? error.details?.cause) {
    if (error.details?.cleanup_unconfirmed === true || ['process_lease_lost', 'controller_lease_lost', 'process_maintenance_receipt_invalid', 'runtime_owner_mismatch'].includes(error.code)) return false;
    if (error.code === 'process_ownership_unknown' && error.details?.reason === 'physical_identity_unavailable' && ['process_confirmation', 'observer_registration'].includes(error.details.phase) && error.details.effect === 'no_effect' && error.details.native_dispatch_started === false) retryable = true;
    if (['SQLITE_BUSY', 'process_heartbeat_timeout', 'process_maintenance_timeout'].includes(error.code)) retryable = true;
  }
  return retryable;
}
