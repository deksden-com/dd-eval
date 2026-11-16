import { compactCheckDiagnostic, redactDiagnosticText, boundFailureDiagnostic } from "../check-diagnostic.mjs";
import { nativeBindingFields } from "../native-failure-evidence.mjs";
import { errorRecord } from "../operation-errors.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Project bounded, redacted diagnostics from retained failure evidence. */
export function failureDiagnostic(result, depth = 0, traversal = { seen: new Set(), count: 0 }) {
  if (!result || depth > 12 || traversal.count >= 256 || traversal.seen.has(result)) return null;
  traversal.seen.add(result); traversal.count++;
  const raw = result;
  result = errorRecord({ code: raw.code, retryable: raw.retryable, message: typeof raw.message === "string" ? raw.message : typeof raw.error === "string" ? raw.error : undefined });
  const details = raw.details ?? {};
  const ids = value => Array.isArray(value) ? value.slice(0, 64).filter(item => typeof item === "string").map(item => redactDiagnosticText(item).slice(0, 4000)) : [];
  const keys = ["reason", "status", "source", "native_source", "journal", "journal_locator", "provider_session_id", "provider_error_scope", "turn_id", "native_turn_id", "terminal_status", "operation_id", "turn_generation", "observed_at", "invocation_id", "item_id", "stage", "qualification_key", "verdict_contract", "receipt_file", "packet_file", "field", "actual", "expected", "actual_provenance", "phase", "recoverable", "disposition", "cli_admission_barrier", "issued_invocation_id", "event_key", "refusal_key", "refusal_event_key", "hook_event_id", "native_dispatch_started", "native_pre_cli_refusal", "terminal_persisted", "settled", "possible_effects"];
  const compact = (value, names) => Object.fromEntries(names.filter(key => ["string", "number", "boolean"].includes(typeof value?.[key]) || value?.[key] === null).map(key => [key, typeof value[key] === "string" ? redactDiagnosticText(value[key]).slice(0, 4000) : value[key]]));
  const settlement = value => ({ ...compact(value, ["state", "confirmed", "reason", "capability", "source", "method", "daemon_id", "daemon_instance", "connection_id", "connection_epoch", "provider_session_id", "session_id", "generation", "turn_generation", "operation_id", "proof_locator", "proof_sha256"]),
    ...(isObject(value?.proof_locator) && /^[a-f0-9]{64}$/.test(value.proof_locator.sha256) ? { proof_locator: compact(value.proof_locator, ["sha256", "relative_path"]) } : {}) });
  const nativeFailure = value => ({ ...compact(value, ["type", "code", "codexErrorInfo", "willRetry", "source", "reason", "errorPhase", "exceptionKind", "providerId", "modelId", "providerKind", "transport", "retryable", "statusCode", "resets_at", "retryAfter", "retry_after", "retryAfterMs", "resetAt"]),
    ...(isObject(value?.codexErrorInfo) ? { codexErrorInfo: compact(value.codexErrorInfo, ["code"]) } : {}),
    ...(value?.attribution ? { attribution: compact(value.attribution, ["source", "reason", "errorPhase", "exceptionKind", "providerId", "modelId", "providerKind", "transport", "retryable", "statusCode", "resets_at", "retryAfter", "retry_after", "retryAfterMs", "resetAt"]) } : {}) });
  const native = details.native_outcome;
  const diagnostic = { code: typeof result.code === "string" ? redactDiagnosticText(result.code).slice(0, 512) : null, message: depth === 0 ? redactDiagnosticText(result.message ?? result.error ?? "").slice(0, 4000) || null : null,
    ...(typeof result.retryable === "boolean" ? { retryable: result.retryable } : {}),
    ...compact(raw, ["native_settled", "physical_stopped"]), ...(isObject(raw.native_settlement) ? { native_settlement: settlement(raw.native_settlement) } : {}),
    details: { ...compact(details, [...keys, "run_id", "parent_work_id", "work_id", "work_session_id", "episode_id", "result_ref", "primary_reason", "failed", "cancelled", "effect", "product_repair_allowed", "native_settled", "physical_stopped"]), ...(isObject(details.native_settlement) ? { native_settlement: settlement(details.native_settlement) } : {}), ...(details.uncovered_questions ? { uncovered_questions: ids(details.uncovered_questions) } : {}),
      ...(isObject(details.request_proof) ? { request_proof: compact(details.request_proof, ["kind", "daemon_instance", "connection_id", "operation_id", "turn_generation", "session_id", "outbound_position", "terminal_position"]) } : {}),
      ...(isObject(details.recovered_error_boundary) ? { recovered_error_boundary: {
        ...compact(details.recovered_error_boundary, ["error_step", "boundary_step"]),
        ...(isObject(details.recovered_error_boundary.receipt) ? { receipt: compact(details.recovered_error_boundary.receipt, ["ok", "outcome", "run_id", "stage", "work_id"]) } : {})
      } } : {}),
      ...(Array.isArray(details.checks) ? { checks: details.checks.slice(0, 64).map(compactCheckDiagnostic) } : {}),
      ...(Array.isArray(details.failures) ? { failures: details.failures.slice(0, 64).map(child => ({ ...compactCheckDiagnostic(child), ...compact(child, ["work_id", "status", "terminal_turn_id", "terminal_observed_at"]), ...(isObject(child?.native_binding) ? { native_binding: compact(child.native_binding, ["schema_id", ...nativeBindingFields]) } : {}), ...(isObject(child?.provider_error) ? { provider_error: nativeFailure(child.provider_error) } : {}) })) } : {}),
      ...(details.cause ? { cause: failureDiagnostic(details.cause, depth + 1, traversal) } : {}),
      ...(details.primary_error ? { primary_error: failureDiagnostic(details.primary_error, depth + 1, traversal) } : {}),
      ...(details.receipt_error ? { receipt_error: failureDiagnostic(details.receipt_error, depth + 1, traversal) } : {}),
      ...(isObject(details.error) ? { error: failureDiagnostic(details.error, depth + 1, traversal) } : {}),
      ...(details.controller ? { controller: { ...compact(details.controller, ["controller_id", "generation", "status"]), ...(details.controller.error ? { error: failureDiagnostic(details.controller.error, depth + 1, traversal) } : {}), ...(details.controller.cleanup_error ? { cleanup_error: failureDiagnostic(details.controller.cleanup_error, depth + 1, traversal) } : {}) } } : {}),
      ...(details.comparison && isObject(details.comparison) ? { comparison: {
        ...compact(details.comparison, ["passed", "mismatch_kind"]), missing_obligation_ids: ids(details.comparison.missing_obligation_ids),
        expected: { ...compact(details.comparison.expected, ["status", "classification"]), response_ids: ids(details.comparison.expected?.response_ids) },
        observed: { ...compact(details.comparison.observed, ["status", "classification"]), response_ids: ids(details.comparison.observed?.response_ids) },
        extra_atom_count: Array.isArray(details.comparison.extra_atoms) ? details.comparison.extra_atoms.length : 0 } } : {}),
      ...(details.semantic_mismatch ? { semantic_mismatch: failureDiagnostic(details.semantic_mismatch, depth + 1, traversal) } : {}),
      ...(details.source && typeof details.source === "object" ? { source: compact(details.source, ["kind", "path", "sha256", "session_id", "turn_id", "event_id"]) } : {}),
      ...(Array.isArray(details.violations) ? { violations: details.violations.slice(0, 64).map(value => typeof value === "string" ? redactDiagnosticText(value).slice(0, 4000) : compact(value, ["code", "reason", "field", "expected", "actual", "source"])) } : {}),
      ...(details.lifecycle_outcome ? { lifecycle_outcome: compact(details.lifecycle_outcome, ["phase", "effect", "recoverable", "disposition", "invocation_id", "operation_id", "native_receipt_id"]) } : {}),
      ...(details.lifecycle_assignment ? { lifecycle_assignment: { ...compact(details.lifecycle_assignment, ["issuer", "phase"]), scope: compact(details.lifecycle_assignment.scope, ["projectRoot", "daemonId", "rootSessionId", "runId", "generation"]) } } : {}),
      ...(details.native_hook_binding ? { native_hook_binding: compact(details.native_hook_binding, ["schema_id", "request_id", "daemon_id", "operation_id", "turn_generation", "provider_session_id", "root_provider_session_id", "tool_call_id"]) } : {}),
      ...(details.provider_result ? { provider_result: compact(details.provider_result, ["status", "error", "conversation_id"]) } : {}),
      ...(details.allowed ? { allowed: Array.isArray(details.allowed) ? ids(details.allowed) : compact(details.allowed, ["minimum", "maximum", "minLength", "pattern"]) } : {}),
      ...(details.provider_error ? { provider_error: { ...compact(details.provider_error, ["code", "codexErrorInfo", "willRetry", "resets_at", "retryAfter", "retry_after", "retryable", "statusCode", "observed_at", "turn_id"]),
        ...nativeFailure(details.provider_error),
        ...(details.provider_error.headers ? { headers: compact(details.provider_error.headers, ["retry-after", "Retry-After"]) } : {}),
        ...(typeof details.provider_error.codexErrorInfo === "object" && details.provider_error.codexErrorInfo ? { codexErrorInfo: compact(details.provider_error.codexErrorInfo, ["code"]) } : {}) } } : {}),
      ...(native ? { native_outcome: typeof native === "string" ? { status: redactDiagnosticText(native).slice(0, 128) } : { ...compact(native, ["status", "harness", "provider_session_id", "adapter_session_id", "turn_id", "terminal_turn_id", "terminal_status", "stop_reason", "completion_evidence", "settled", "native_settled", "physical_stopped"]), ...(isObject(native.native_settlement) ? { native_settlement: settlement(native.native_settlement) } : {}) } } : {}),
      ...(details.observation_error ? { observation_error: failureDiagnostic(details.observation_error, depth + 1, traversal) } : {}) },
    ...(raw.cause ? { cause: failureDiagnostic(raw.cause, depth + 1, traversal) } : {}),
    ...(raw.cleanup_error ? { cleanup_error: failureDiagnostic(raw.cleanup_error, depth + 1, traversal) } : {}) };
  return depth === 0 ? boundFailureDiagnostic(diagnostic) : diagnostic;
}
