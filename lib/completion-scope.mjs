export { selectedExecutionEntries, assertCompletionScopes } from "./execution/selection-scope.mjs";
import { createHash } from 'node:crypto';

const invalid = (message, code = "selection_invalid") => { throw Object.assign(new Error(message), { code }); };

/** The accepted controller/lifecycle receipts prove execution, not its snapshot. */
export function acceptedManagedExecution(result) {
  const controller = result.driver?.controller, lifecycle = result.lifecycle;
  const launch = result.execution_launch_operation_id ?? result.execution_operation_id;
  const index = lifecycle?.status?.index, run = lifecycle?.status?.run;
  const stage = index?.stage_runs?.findLast(item => item.stage === result.stage);
  return typeof result.execution_operation_id === 'string' && typeof result.run_id === 'string' && result.run_id.length > 0
    && typeof launch === 'string' && (result.execution_operation_id === launch || result.execution_operation_id.startsWith(`${launch}:recover:`) || result.execution_operation_id === `${launch}:reconcile`)
    && typeof controller?.controller_id === 'string' && controller.controller_id.length > 0
    && controller.request_id === `eval:${createHash('sha256').update(launch).digest('hex')}`
    && controller.run_id === result.run_id && lifecycle?.run_id === result.run_id
    && run?.id === result.run_id && index?.run_id === result.run_id && stage?.status === lifecycle.stage_status
    && typeof controller.project_id === 'string' && controller.project_id === run.project_id
    && (index.current_stage === undefined || index.current_stage === result.stage)
    && Number.isSafeInteger(controller.generation) && controller.generation >= 0
    && ['completed', 'stop_target_reached'].includes(controller.status) && controller.stage === result.stage
    && ['done', 'skipped'].includes(lifecycle.stage_status)
    && (result.stage_outcome === undefined || result.stage_outcome === lifecycle.stage_status);
}

export const isTerminalRunState = state => ["finished", "completed", "completed_with_failures", "cancelled"].includes(state);
export const isDisposableRunState = state => ["finished", "completed", "cancelled"].includes(state);
export const reportSchemaFor = manifest => manifest.profile?.schema_id === "dd-eval/run-profile@2" ? "dd-eval/report@4"
  : manifest.profile?.interaction_judge?.verdict_contract === "dd-eval/hitl-coverage@1" ? "dd-eval/report@3" : "dd-eval/report@2";

export function observedCompletionScope(execution, result) {
  if (!execution?.completion_scope) return null;
  const planned = execution.completion_scope;
  // A sealed snapshot is assessment evidence. Bound accepted controller/lifecycle
  // receipts can independently prove execution when that snapshot is unavailable.
  const reached = result.state === "candidate_ready" && result.stage === planned.effective_terminal_stage
    && ["done", "skipped"].includes(result.stage_outcome ?? result.lifecycle?.stage_status)
    && (Boolean(result.candidate?.manifest_sha256) || acceptedManagedExecution(result));
  const outcome = result.stage_outcome ?? result.lifecycle?.stage_status ?? null;
  const records = result.lifecycle?.status?.index?.stage_runs ?? result.lifecycle?.status?.stage_runs ?? [];
  return { ...planned, achieved_stage: result.stage ?? null, stage_outcome: outcome,
    target_reached: reached, full_case_completed: reached && outcome === "done" && planned.requested_full_case === true
      && Array.isArray(planned.case_contour) && planned.case_contour.every(stage => records.findLast(record => record.stage === stage)?.status === "done")
      && !records.some(record => record.status === "skipped")
      && !(result.boundaries ?? []).some(boundary => boundary.stage_outcome === "skipped"),
    completion_reason: reached && planned.requested_stop_after ? outcome === "skipped" ? "stop_after_skipped" : "stop_after_reached" : null };
}

export function finalAssessmentScope(manifest, results = []) {
  if (manifest.profile?.schema_id !== "dd-eval/run-profile@2") {
    if (manifest.profile?.selection?.e2e === true) return "e2e";
    if (results.length === 1 && typeof results[0].stage === "string") return results[0].stage;
    invalid("Final Judge requires one selected assessment scope", "judge_scope_missing");
  }
  const scopes = new Set((manifest.executions ?? []).map(execution => execution.completion_scope?.requested_full_case
    ? "e2e" : execution.terminal_stage));
  if (scopes.size !== 1 || ![...scopes][0]) invalid("Final Judge requires one authored assessment scope for the selected ranges", "judge_scope_missing");
  return [...scopes][0];
}

export function projectRunCompletion({ manifest, results, pending = false, recoveryBlocked = false }) {
  if (recoveryBlocked) return "recovery_blocked";
  if (pending) return "awaiting_provider";
  if (results.length && results.every(result => result.state === "candidate_ready")) {
    if (!manifest.profile?.selection?.stop_after) return "completed";
    if (!results.every(result => observedCompletionScope(manifest.executions.find(item => item.id === result.execution), result)?.target_reached)) {
      invalid("Stopped execution lacks its completed target evidence", "stage_boundary_incomplete");
    }
    return "finished";
  }
  return results.some(result => result.state === "failed") ? "completed_with_failures"
    : results.some(result => result.state === "cancelled") ? "cancelled" : "awaiting_provider";
}
