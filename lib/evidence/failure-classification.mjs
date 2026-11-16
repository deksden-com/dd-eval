import path from "node:path";
import { causalNodes, hasVerifiedNativeFailure, verifiedNativeFailureCause } from "../native-failure-evidence.mjs";
import { errorRecord, isObservationLoss } from "../operation-errors.mjs";

/** Classify a retained interruption without treating incomplete evidence as proof. */
export function classifyInterruption(error) {
  const record = errorRecord(error);
  if (record.code === "hitl_coverage_unresolved") return { category: "interaction_unresolved", source: "unknown", retryable: false, error: record };
  if (record.code === "provider_unavailable" && ["overload_retries_exhausted", "provider_retries_exhausted", "retry_after_exceeds_budget"].includes(record.details?.reason)) return { category: "provider_unavailable", source: "provider", retryable: false, error: record };
  if (["native_outcome_observation_failed", "native_topology_conflict", "native_topology_cycle", "native_item_completion_conflict", "model_observation_storage_failed"].includes(record.code)) return { category: "execution_failure", source: "runner", retryable: false, error: record };
  const causal = causalNodes(error); const known = causal.nodes.length ? causal.nodes : [record];
  if (causal.incomplete) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "causal_evidence_incomplete" };
  const primary = known.find(value => /hook|lifecycle|storage|ownership/.test(value.code ?? "") || isObservationLoss(value));
  if (primary) return { category: "execution_failure", source: "runner", retryable: false, error: record };
  const recoveryUnavailable = known.find(value => value.code === "provider_recovery_unavailable");
  if (recoveryUnavailable) return { category: "execution_blocked", source: "runner", retryable: false, error: record, evidence_reason: recoveryUnavailable.details?.reason ?? "native_continuation_unproven" };
  if (known.some(value => value.code === "provider_overload_evidence_unavailable")) return { category: "provider_unavailable", source: "provider", retryable: false, error: record, evidence_reason: "native_turn_identity_unavailable" };
  if (hasVerifiedNativeFailure(error)) {
    const nativeCause = verifiedNativeFailureCause(error);
    return { category: "native_execution_failed", source: nativeCause ? "network" : "unknown", retryable: false, error: record, ...(nativeCause ? { native_cause: nativeCause } : {}) };
  }
  const workFailure = known.find(value => ["work_failure_unresolved", "work_resolution_exhausted"].includes(value.code)
    && value.details?.source === "explicit_work_failure"
    && ["episode_id", "work_id", "work_session_id"].every(key => typeof value.details[key] === "string" && value.details[key].trim())
    && [value.details.result_ref, value.details.primary_reason].some(value => typeof value === "string" && value.trim()));
  if (workFailure && known.some(value => value.code && !["harness_adapter_failed", "driver_failed", "operation_failed", workFailure.code].includes(value.code))) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "causal_evidence_conflict" };
  if (workFailure) return { category: workFailure.code === "work_resolution_exhausted" ? "execution_blocked" : "work_failure", source: "subject", retryable: false, error: record, evidence_reason: "explicit_work_failure" };
  if (known.some(value => ["work_failure_unresolved", "work_resolution_exhausted"].includes(value.code))) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "work_failure_evidence_unconfirmed" };
  if (known.some(value => value.code === "fanout_child_failed")) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "native_failure_evidence_unconfirmed" };
  const native = known.find(value => value.code === "turn_interrupted" &&
    value.details?.terminal_status === "failed" && typeof value.details?.provider_session_id === "string" && value.details.provider_session_id &&
    typeof value.details?.turn_id === "string" && value.details.turn_id && value.details.native_turn_id === value.details.turn_id &&
    (typeof value.details?.provider_error?.codexErrorInfo === "string" || typeof value.details?.provider_error?.codexErrorInfo?.code === "string"));
  const nativeCodes = known.filter(value => value.code === "turn_interrupted" && value.details?.terminal_status === "failed").map(value => typeof value.details?.provider_error?.codexErrorInfo === "string" ? value.details.provider_error.codexErrorInfo : value.details?.provider_error?.codexErrorInfo?.code).filter(Boolean);
  if (new Set(nativeCodes).size > 1) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "causal_evidence_conflict" };
  const nativeCode = typeof native?.details.provider_error.codexErrorInfo === "string" ? native.details.provider_error.codexErrorInfo : native?.details.provider_error.codexErrorInfo?.code;
  if (nativeCode === "serverOverloaded") return { category: "provider_overloaded", source: "provider", retryable: false, error: record };
  if (known.some(value => value.code === "provider_capacity_transient" && value.details?.native_source === "opencode.v2.session.execution"
    && value.details.terminal_status === "failed" && typeof value.details.provider_session_id === "string" && value.details.provider_session_id
    && typeof value.details.turn_id === "string" && value.details.turn_id && value.details.native_turn_id === value.details.turn_id))
    return { category: "provider_overloaded", source: "provider", retryable: false, error: record };
  if (record.code === "retry_after_exceeds_budget" && record.details?.provider_error?.codexErrorInfo === "serverOverloaded") return { category: "provider_overloaded", source: "provider", retryable: false, error: record };
  if (nativeCode === "usageLimitExceeded") return { category: "provider_quota", source: "provider", retryable: false, error: record };
  if (nativeCode === "rateLimitExceeded") return { category: "provider_rate_limit", source: "provider", retryable: false, error: record };
  if (nativeCode === "sessionBudgetExceeded") return { category: "session_budget_exhausted", source: "provider", retryable: false, error: record };
  const wrappers = ["driver_failed", "operation_failed", "harness_adapter_failed"];
  const substantive = known.slice(1).filter(value => typeof value.code === "string" && !wrappers.includes(value.code));
  if (new Set(substantive.map(value => value.code)).size > 1 && wrappers.includes(record.code)) return { category: "execution_failure", source: "unknown", retryable: false, error: record, evidence_reason: "causal_evidence_conflict" };
  const nested = substantive[0];
  const code = (wrappers.includes(record.code) ? nested?.code ?? record.code : record.code).toLowerCase();
  const providerCode = /^(?:agy_)?provider_/.test(code);
  if (!providerCode && !["operation_failed", "driver_failed"].includes(code)) return { category: "execution_failure", source: "runner", retryable: Boolean(record.retryable), error: record };
  if (/(?:^|_)provider_quota_exhausted$/.test(code)) return { category: "provider_quota", source: "provider", retryable: false, error: record };
  if (/(?:^|_)provider_rate_limited$/.test(code)) return { category: "provider_rate_limit", source: "provider", retryable: true, error: record };
  if (/(?:^|_)provider_limit_unknown$/.test(code)) return { category: "provider_limit_unknown", source: "provider", retryable: false, error: record };
  if (/(?:^|_)provider_account$/.test(code)) return { category: "provider_account", source: "provider", retryable: false, error: record };
  if (/(?:^|_)provider_(?:timeout|unavailable)$/.test(code)) return { category: "provider_unavailable", source: "provider", retryable: true, error: record };
  return { category: "execution_failure", source: "runner", retryable: Boolean(record.retryable), error: record };
}

/** Check terminal finalization against the retained RUN and optional project binding. */
export function boundTerminalFinalization(receipt, runId, projectRoot = null) {
  return receipt?.schema_id === "dd-flow/terminal-finalization@1" && receipt.issuer === "dd-flow"
    && receipt.phase === "terminal_finalization" && typeof runId === "string" && receipt.run_id === runId
    && typeof receipt.controller_id === "string" && receipt.controller_id.length > 0
    && typeof receipt.project_root === "string" && path.isAbsolute(receipt.project_root)
    && (!projectRoot || receipt.project_root === projectRoot) && typeof receipt.error?.code === "string" && receipt.error.code.length > 0;
}

/** Read the RUN identity from retained execution evidence. */
export function executionRunId(result) {
  // Production failures retain the flow RUN in lifecycle; the EVAL manifest
  // run_id belongs to a different identity domain and is never a fallback.
  return result?.lifecycle?.run_id ?? result?.run_id ?? null;
}

/** Determine whether bounded causal evidence proves an infrastructure failure. */
export function isInfrastructureFailure(code, depth = 0, expectedRunId = null, seen = new Set()) {
  if (depth > 12) return false;
  if (code === "operation_observation_lost") return true;
  if (code && typeof code === "object") {
    if (seen.has(code)) return false;
    seen.add(code);
  }
  if (hasVerifiedNativeFailure(code)) return true;
  if (["native_inventory_invalid", "cancellation_unconfirmed", "scope_settlement_required", "accepted_intent_source_gap", "accepted_intent_source_invalid", "accepted_intent_contract_unsupported", "accepted_intent_review_stale"].includes(code)) return true;
  if (["runner_progress_invalid", "lint_gate_tool_failed", "lint_gate_invalid_output", "lint_gate_unavailable", "protocolize_draft_cleanup_failed", "opencode_auth_rejected", "opencode_configuration_invalid", "opencode_plugin_failed"].includes(code)) return true;
  if (["profile_contract_mismatch", "execution_contract_invalid", "execution_contract_missing", "execution_profile_not_frozen", "execution_policy_unsupported", "judge_profile_contract_missing", "judge_profile_contract_mismatch", "agent_profile_missing"].includes(code)) return true;
  if (["definition_qualification_mismatch", "judge_context_invalid", "judge_outcome_unknown", "judge_evidence_mismatch", "judge_cleanup_unconfirmed", "judge_cleanup_failed", "judge_cleanup_ownership_unknown", "judge_turn_identity_invalid", "judge_packet_changed", "judge_capacity_settlement_unproven", "capacity_chain_conflict", "capacity_chain_legacy"].includes(code)) return true;
  if (["native_outcome_observation_failed", "native_topology_invalid", "native_topology_conflict", "native_topology_cycle", "native_item_completion_conflict", "native_child_outcome_conflict", "native_child_turn_conflict", "native_child_parent_mismatch", "native_child_outcome_lost", "native_child_outcome_unavailable", "capacity_contract_unsupported", "native_contract_unsupported"].includes(code)) return true;
  if (["invocation_receipt_timeout", "native_hook_unproven", "capacity_policy_mismatch", "capacity_retry_metadata_invalid", "provider_overload_evidence_unavailable", "provider_recovery_unavailable", "provider_unavailable"].includes(code)) return true;
  if (code && typeof code === "object") {
    const causal = causalNodes(code);
    if (causal.incomplete) return false;
    expectedRunId ??= executionRunId(code);
    const runScopeConsistent = [code.run_id, code.lifecycle?.run_id].filter(value => value != null).every(value => value === expectedRunId);
    const finalization = code.recovery?.finalization ?? code.details?.finalization;
    const ownedFinalization = runScopeConsistent && boundTerminalFinalization(finalization, expectedRunId)
      && (!code.details?.controller?.controller_id || code.details.controller.controller_id === finalization.controller_id);
    const details = code.details ?? {}, assignment = details.lifecycle_assignment, scope = assignment?.scope, binding = details.native_hook_binding;
    const issued = runScopeConsistent && assignment?.issuer === "dd-flow" && typeof scope?.projectRoot === "string" && path.isAbsolute(scope.projectRoot) && [scope.daemonId, scope.rootSessionId].every(value => typeof value === "string" && value.length > 0) && (scope.runId === null || typeof scope.runId === "string") && Number.isInteger(scope.generation) && scope.generation >= 0 && (!expectedRunId || expectedRunId === scope.runId);
    const ownedHook = binding?.schema_id === "dd-flow/hook-request@1" && [binding.request_id, binding.daemon_id, binding.operation_id, binding.root_provider_session_id, binding.tool_call_id].every(value => typeof value === "string" && value.length > 0) && Number.isInteger(binding.turn_generation) && binding.turn_generation >= 0 && (!issued || (binding.daemon_id === scope.daemonId && binding.root_provider_session_id === scope.rootSessionId));
    const integrityCodes = ["native_hook_receipt_invalid", "native_hook_identity_conflict", "run_bundle_anchor_invalid", "run_bundle_authority_missing", "run_bundle_authority_invalid", "run_bundle_identity_invalid", "run_bundle_binding_incomplete",
      "workspace_route_changed", "workspace_route_conflict", "workspace_route_publication_failed", "workspace_route_invalid", "workspace_route_missing"];
    const ownedIntegrity = integrityCodes.includes(code.code) && (issued || typeof details.controller?.controller_id === "string" && Number.isSafeInteger(details.controller.generation) && runScopeConsistent && typeof expectedRunId === "string");
    const ownedAdmission = ownedIntegrity || (code.code === "invocation_ambiguous" && issued && (!binding || ownedHook)) || (code.code === "invocation_argument_mismatch" && issued && (!binding || ownedHook) && assignment.phase === "issuance" && typeof details.invocation_id === "string" && details.invocation_id.length > 0) || (["invocation_assignment_missing", "invocation_directory_mismatch"].includes(code.code) && issued && ownedHook);
    const interruption = classifyInterruption(code);
    if (interruption.evidence_reason === "causal_evidence_conflict") return false;
    if (!ownedFinalization && !ownedAdmission && interruption.evidence_reason === "explicit_work_failure") return false;
    if (!ownedFinalization && !ownedAdmission && causal.nodes.some(node => node.code === "fanout_child_failed")) return false;
    return ownedFinalization || ownedAdmission || ["provider_overloaded", "provider_quota", "provider_rate_limit", "provider_limit_unknown", "provider_account", "provider_unavailable", "session_budget_exhausted"].includes(interruption.category) || isInfrastructureFailure(code.code, depth, expectedRunId, seen) || [code.cause, code.details?.cause, code.details?.primary_error, code.details?.controller?.error, code.details?.error].some(child => isInfrastructureFailure(child, depth + 1, expectedRunId, seen));
  }
  if (["storage_write_failed", "stage_inputs_changed", "task_input_checksum_mismatch", "lifecycle_outcome_conflict", "lifecycle_outcome_unknown", "lifecycle_contract_invalid", "work_start_publication_failed", "journal_conflict", "invocation_outcome_pending", "invocation_storage_unprepared", "native_hook_timeout", "native_hook_failed", "native_hook_response_invalid", "hook_storage_unprepared", "codex_identity_missing", "invocation_receipt_missing", "invocation_identity_mismatch", "invocation_identity_conflict"].includes(code)) return true;
  if (code === "invocation_command_blocked") return true;
  if (["write_transaction_failed", "write_transaction_unowned", "write_transaction_unresolved", "write_transaction_async", "work_start_receipt_invalid", "work_start_projection_conflict", "harness_adapter_invalid", "harness_adapter_aborted"].includes(code)) return true;
  if (["harness_runtime_incompatible", "harness_runtime_mismatch", "harness_runtime_unobservable", "zcode_lifecycle_unqualified", "snapshot_policy_unsupported", "snapshot_policy_unconfirmed", "snapshot_policy_invalid", "snapshot_recovery_policy_frozen"].includes(code)) return true;
  // A confirmed native process exit is an interruption, not a business
  // verdict. Its partial effects still require the normal recovery barrier.
  if (["agy_terminal_result_missing", "opencode_provider_failed"].includes(code)) return true;
  if (["provider_capacity_transient", "provider_auth_failed", "opencode_native_hitl", "opencode_foreign_input", "opencode_capability_missing", "opencode_admission_rejected", "opencode_credentials_invalid", "opencode_credentials_unproven", "legacy_opencode_state"].includes(code)) return true;
  return ["driver_failed", "model_observation_storage_failed", "agy_provider_failed", "agy_provider_quota_exhausted", "agy_provider_rate_limited", "agy_provider_limit_unknown", "agy_provider_account", "provider_rate_limited", "provider_quota_exhausted", "provider_limit_unknown", "profile_drift", "profile_mismatch", "agy_profile_drift", "profile_integrity_violation", "session_identity_mismatch", "foreign_session", "droid_child_identity_invalid", "droid_hook_identity_invalid", "droid_turn_identity_mismatch", "hook_preflight_failed", "flow_reconciliation_failed", "snapshot_missing", "snapshot_checksum_mismatch", "snapshot_restore_mismatch", "driver_protocol", "subagent_capacity_unqualified", "interaction_fixture_invalid", "interaction_fixture_checksum_mismatch", "interaction_fixture_gap", "interaction_judge_ambiguous", "interaction_judge_missing", "judge_result_invalid", "subject_liveness_timeout", "harness_adapter_failed", "harness_adapter_timeout", "harness_adapter_output_limit", "invocation_unknown", "invocation_scope_unproven", "progress_callback_async"].includes(code);
}
