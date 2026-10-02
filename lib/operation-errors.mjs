// An observer losing its response does not establish that a provider Turn failed.
export function isObservationLoss(error) {
  return ["rpc_timeout", "native_timeout", "native_outcome_unknown", "native_backend_dead", "native_backend_pipe_broken", "bridge_exited", "bridge_pipe_broken", "daemon_timeout", "turn_timeout", "operation_observation_lost", "daemon_connection_closed", "harness_adapter_timeout", "harness_adapter_output_limit", "harness_adapter_invalid"].includes(error?.code);
}

export function isManagedWait(error) {
  return ["managed_run_controlled", "managed_run_waiting_for_user"].includes(error?.code);
}

export function isConclusiveManagedFailure(error) {
  return ["recovery_required", "capture_failed", "cancelled", "superseded"].includes(error?.details?.controller?.status);
}

function field(value, key) { try { return value?.[key]; } catch { return "[unreadable]"; } }
function text(value) { try { return String(value); } catch { return "[unreadable]"; } }
function boundedText(value, budget, limit = 16000) {
  let result = value.slice(0, limit);
  if (Buffer.byteLength(JSON.stringify(result)) > budget.remaining) result = result.slice(0, Math.max(0, Math.floor(budget.remaining / 6)));
  budget.remaining -= Buffer.byteLength(JSON.stringify(result));
  return result;
}
function jsonDiagnostic(value, depth, seen, budget) {
  if (depth >= 12 || budget.remaining <= 0 || budget.nodes-- <= 0) return "[truncated]";
  if (typeof value === "string") { const result = boundedText(value, budget); return result.length === value.length ? result : `${result}[truncated]`; }
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) { budget.remaining -= String(value).length + 1; return value; }
  if (typeof value !== "object") return "[unavailable]";
  if (seen.has(value)) return "[circular]";
  seen.add(value); budget.remaining -= 2;
  let result;
  try {
    if (Array.isArray(value)) {
      result = [];
      for (let i = 0; i < Math.min(value.length, 256); i++) {
        if (budget.remaining <= 0 || budget.nodes <= 0) { result.push("[truncated]"); break; }
        result.push(jsonDiagnostic(field(value, i), depth + 1, seen, budget));
      }
      if (value.length > 256) result.push("[truncated]");
    } else {
      const entries = [];
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (entries.length >= 256 || budget.remaining <= 0 || budget.nodes <= 0) { entries.push(["[truncated]", true]); break; }
        const name = boundedText(key, budget);
        entries.push([name, jsonDiagnostic(field(value, key), depth + 1, seen, budget)]);
      }
      result = Object.fromEntries(entries);
    }
  } catch { result = "[unreadable]"; }
  seen.delete(value); return result;
}

function record(error, depth, seen, budget, pending) {
  if (error && typeof error === "object") {
    if (seen.has(error)) return { code: "diagnostic_cycle", message: "[circular]" };
    seen.add(error);
  }
  const value = Object.fromEntries(["code", "message", "retryable", "exitCode", "details", "cause", "cleanup_error"].map(key => [key, field(error, key)]));
  const result = {
    code: boundedText(typeof value.code === "string" ? value.code : "operation_failed", budget),
    ...(typeof value.retryable === "boolean" ? { retryable: value.retryable } : {}),
    ...(typeof value.exitCode === "number" && Number.isFinite(value.exitCode) ? { exitCode: value.exitCode } : {}),
  };
  pending.push([result, typeof value.message === "string" ? value.message : text(error), value.details]);
  if (value.cause && value.cause !== "[unreadable]" && depth < 3) result.cause = record(value.cause, depth + 1, new Set(seen), budget, pending);
  if (value.cleanup_error && value.cleanup_error !== "[unreadable]" && depth < 3) result.cleanup_error = record(value.cleanup_error, depth + 1, new Set(seen), budget, pending);
  return result;
}

export function errorRecord(error) {
  const budget = { remaining: 65536, nodes: 2048 }, pending = [];
  // Reserve every typed code before messages and optional bulk details.
  const result = record(error, 0, new Set(), budget, pending);
  for (const [target, message] of pending) target.message = boundedText(message, budget);
  for (const [target, , value] of pending) if (value !== undefined) target.details = jsonDiagnostic(value, 0, new Set(), budget);
  return result;
}

// Only typed native terminal evidence can authorize a new Codex turn. Message
// text, transient notifications and an unobserved adapter exit cannot.
export function terminalCodexOverload(error, expectedSessionId, policy) {
  return policy?.terminalCodexOverload(error, expectedSessionId) ? policy.normalizeCodexFailure(error, expectedSessionId) : null;
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
    if (!policy && retained?.policy === "codex-overload-burst@1" && /^[a-f0-9]{64}$/.test(retained.engine_artifact_sha256 ?? "")
      && retained.session_id === details.provider_session_id && retained.turn_id === details.turn_id && details.native_turn_id === details.turn_id) return retained.provider_limit;
    const normalized = policy?.normalizeCodexFailure(current);
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

export function reportedError(value, fallback) {
  const record = errorRecord({ ...value, message: value.message ?? fallback });
  return Object.assign(new Error(record.message), record);
}
