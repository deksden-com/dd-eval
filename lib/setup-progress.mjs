export const SETUP_STARTUP_MS = 120_000;
export const setupPhases = new Set(['ingress_entered', 'imports_ready', 'probe_started', 'probe_completed', 'dependency_check_completed', 'transfer_progress', 'identity_digest_progress', 'identity_digest_completed', 'native_initialized', 'ready']);
export function setupObserver(operationId) {
  const startedAt = Date.now(); let sequence = 0; const markers = new Set();
  return value => {
    if (typeof operationId !== 'string' || markers.size >= 4096 || value?.kind !== 'setup_phase' || value.operation_id !== operationId || !setupPhases.has(value.phase)
      || !Number.isSafeInteger(value.sequence) || value.sequence <= sequence || value.sequence > 1_000_000
      || value.step !== null && !(typeof value.step === 'string' && value.step.length <= 4096 || Number.isSafeInteger(value.step) && value.step >= 0)
      || !Number.isFinite(Date.parse(value.observed_at)) || Date.parse(value.observed_at) < startedAt || Date.parse(value.observed_at) > Date.now()) return false;
    const marker = JSON.stringify([value.phase, value.step]);
    if (markers.has(marker)) return false;
    markers.add(marker); sequence = value.sequence; return true;
  };
}
export function observationDetails(clock, phase, pid) {
  return { reason: clock.observationLost ? 'observation_gap' : 'inactivity', phase, pid,
    timeout_ms: clock.timeoutMs, observation_lost: clock.observationLost, observation_clock: clock.state(), effect: 'unknown' };
}
