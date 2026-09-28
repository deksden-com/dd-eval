// An observer losing its response does not establish that a provider Turn failed.
export function isObservationLoss(error) {
  return ["rpc_timeout", "daemon_timeout", "turn_timeout", "operation_observation_lost", "daemon_connection_closed"].includes(error?.code);
}

export function isManagedWait(error) {
  return ["managed_run_controlled", "managed_run_waiting_for_user"].includes(error?.code);
}

export function isConclusiveManagedFailure(error) {
  return ["recovery_required", "capture_failed", "cancelled", "superseded"].includes(error?.details?.controller?.status);
}

export function errorRecord(error, depth = 0) {
  return {
    code: typeof error?.code === "string" ? error.code : "operation_failed",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(typeof error?.retryable === "boolean" ? { retryable: error.retryable } : {}),
    ...(error?.details !== undefined ? { details: error.details } : {}),
    ...(error?.cleanup_error !== undefined && depth < 3 ? { cleanup_error: errorRecord(error.cleanup_error, depth + 1) } : {}),
    ...(error?.cause && depth < 3 ? { cause: errorRecord(error.cause, depth + 1) } : {}),
  };
}

// Only typed native terminal evidence can authorize a new Codex turn. Message
// text, transient notifications and an unobserved adapter exit cannot.
export function terminalCodexOverload(error, expectedSessionId) {
  if (typeof expectedSessionId !== "string" || !expectedSessionId) return null;
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const details = current.details;
    if (current.code === "turn_interrupted" &&
        details?.terminal_status === "failed" &&
        details?.provider_session_id === expectedSessionId &&
        typeof details?.turn_id === "string" && details.turn_id && details.native_turn_id === details.turn_id &&
        details?.provider_error?.codexErrorInfo === "serverOverloaded") {
      return { session_id: expectedSessionId, turn_id: details.turn_id,
        operation_id: details.operation_id ?? null,
        provider_error: details.provider_error };
    }
    current = current.cause ?? details?.primary_error ?? details?.cause ?? details?.error;
  }
  return null;
}

function utcTimestamp(value, numericUnit = "auto") {
  const convert = number => number * (numericUnit === "milliseconds" || numericUnit === "auto" && number >= 1e12 ? 1 : 1000);
  const millis = typeof value === "number" && Number.isFinite(value)
    ? convert(value)
    : typeof value === "string" && /^\d+$/.test(value)
      ? convert(Number(value))
      : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(millis) && millis > 0 && millis <= 8.64e15 ? new Date(millis).toISOString() : null;
}

/** Report only reset metadata bound to this exact provider terminal outcome. */
export function providerLimitMetadata(error) {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const details = current.details ?? {};
    const native = details.provider_error ?? null;
    const codexCode = current.code === "turn_interrupted" && details.terminal_status === "failed" &&
      typeof details.turn_id === "string" && details.turn_id && details.native_turn_id === details.turn_id &&
      typeof details.provider_session_id === "string" && details.provider_session_id
      ? native?.codexErrorInfo : null;
    const code = current.code;
    const quota = codexCode === "usageLimitExceeded" || /(?:^|_)provider_quota_exhausted$/.test(code ?? "");
    const rate = codexCode === "rateLimitExceeded" || /(?:^|_)provider_rate_limited$/.test(code ?? "");
    const unknown = /(?:^|_)provider_limit_unknown$/.test(code ?? "");
    if (quota || rate || unknown) {
      const observedAt = utcTimestamp(details.observed_at);
      const resetCandidate = quota && codexCode === "usageLimitExceeded" ? utcTimestamp(native?.resets_at) : null;
      const resetAt = resetCandidate && observedAt && resetCandidate > observedAt ? resetCandidate : null;
      const retryValue = native?.retryAfter ?? native?.retry_after ?? native?.headers?.["retry-after"] ?? native?.headers?.["Retry-After"];
      const delta = typeof retryValue === "number" || typeof retryValue === "string" && /^\d+(?:\.\d+)?$/.test(retryValue);
      const retryAfterAt = delta ? observedAt ? utcTimestamp(Date.parse(observedAt) + Number(retryValue) * 1000, "milliseconds") : null
        : typeof retryValue === "string" ? utcTimestamp(retryValue) : null;
      return { category: quota ? "provider_quota" : rate ? "provider_rate_limit" : "provider_limit_unknown",
        observed_at: observedAt, provider_session_id: details.provider_session_id ?? null,
        reset_at: resetAt, reset_source: resetAt ? "codex.turn.error.resets_at" : null,
        retry_after_at: retryAfterAt };
    }
    current = current.cause ?? details.primary_error ?? details.cause ?? details.error;
  }
  return null;
}

export function reportedError(value, fallback) {
  const record = errorRecord({ ...value, message: value.message ?? fallback });
  return Object.assign(new Error(record.message), record);
}
