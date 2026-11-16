/** Normalize provider limits from typed terminal evidence. */
// Only typed native terminal evidence can authorize a new Codex turn. Message
// text, transient notifications and an unobserved adapter exit cannot.
export function terminalProviderOverload(error, expectedSessionId, policy) {
  const terminal = policy?.terminalProviderOverload ?? policy?.terminalCodexOverload;
  return terminal?.(error, expectedSessionId) ? (policy.normalizeProviderFailure ?? policy.normalizeCodexFailure)(error, expectedSessionId) : null;
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
export function providerLimitMetadata(error, policy = null) {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const details = current.details ?? {};
    if (/hook|lifecycle|storage|ownership/.test(current.code ?? "") || ["native_outcome_observation_failed", "model_observation_storage_failed"].includes(current.code)) return null;
    const retained = details.capacity_normalization;
    if (!policy && ["codex-overload-burst@1", "provider-overload-episode@1", "provider-recovery-episode@1"].includes(retained?.policy) && /^[a-f0-9]{64}$/.test(retained.engine_artifact_sha256 ?? "")
      && retained.session_id === details.provider_session_id && retained.turn_id === details.turn_id && details.native_turn_id === details.turn_id) return retained.provider_limit;
    const normalized = (policy?.normalizeProviderFailure ?? policy?.normalizeCodexFailure)?.(current);
    const native = normalized?.native_error ?? details.provider_error ?? null;
    const codexCode = current.code === "turn_interrupted" && details.terminal_status === "failed" &&
      typeof details.turn_id === "string" && details.turn_id && details.native_turn_id === details.turn_id &&
      typeof details.provider_session_id === "string" && details.provider_session_id
      ? normalized?.code ?? (typeof native?.codexErrorInfo === "string" ? native.codexErrorInfo : native?.codexErrorInfo?.code) : null;
    const code = current.code;
    const quota = codexCode === "usageLimitExceeded" || /(?:^|_)provider_quota_exhausted$/.test(code ?? "");
    const rate = codexCode === "rateLimitExceeded" || /(?:^|_)provider_rate_limited$/.test(code ?? "");
    const unknown = /(?:^|_)provider_limit_unknown$/.test(code ?? "");
    if (quota || rate || unknown) {
      const observedAt = utcTimestamp(details.observed_at);
      const resetCandidate = quota && codexCode === "usageLimitExceeded" ? utcTimestamp(native?.resets_at) : null;
      const duration = quota && /(?:^|_)agy_provider_quota_exhausted$/.test(code ?? "")
        ? /\bResets in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?\b(?=\s*(?:$|[.!;,)\]]))/i.exec(String(details.provider_result?.error ?? current.message ?? "")) : null;
      const seconds = duration ? Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0) : 0;
      const estimated = !resetCandidate && observedAt && seconds > 0 && Number.isSafeInteger(seconds) && Number(duration[2] ?? 0) < 60 && Number(duration[3] ?? 0) < 60 ? utcTimestamp(Date.parse(observedAt) + seconds * 1000, "milliseconds") : null;
      const resetAt = resetCandidate && observedAt && resetCandidate > observedAt ? resetCandidate : estimated;
      const retryValue = native?.retryAfter ?? native?.retry_after ?? native?.headers?.["retry-after"] ?? native?.headers?.["Retry-After"];
      const delta = typeof retryValue === "number" || typeof retryValue === "string" && /^\d+(?:\.\d+)?$/.test(retryValue);
      const retryAfterAt = delta ? observedAt ? utcTimestamp(Date.parse(observedAt) + Number(retryValue) * 1000, "milliseconds") : null
        : typeof retryValue === "string" ? utcTimestamp(retryValue) : null;
      return { category: quota ? "provider_quota" : rate ? "provider_rate_limit" : "provider_limit_unknown",
        observed_at: observedAt, provider_session_id: details.provider_session_id ?? null,
        reset_at: resetAt, reset_source: resetAt ? estimated ? "agy.result.error.relative_duration" : "codex.turn.error.resets_at" : null,
        reset_estimated: Boolean(estimated), reset_basis: estimated ? observedAt : null,
        retry_after_at: retryAfterAt };
    }
    current = current.cause ?? details.primary_error ?? details.cause
      ?? details.controller?.error ?? details.error;
  }
  return null;
}

