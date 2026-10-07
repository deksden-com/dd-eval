const invalid = (message, code = "selection_invalid") => { throw Object.assign(new Error(message), { code }); };

export const isTerminalRunState = state => ["finished", "completed", "completed_with_failures", "cancelled"].includes(state);
export const isDisposableRunState = state => ["finished", "completed", "cancelled"].includes(state);
export const reportSchemaFor = manifest => manifest.profile?.schema_id === "dd-eval/run-profile@2" ? "dd-eval/report@4"
  : manifest.profile?.interaction_judge?.verdict_contract === "dd-eval/hitl-coverage@1" ? "dd-eval/report@3" : "dd-eval/report@2";

export function selectedExecutionEntries(profile, contour) {
  const selection = profile.selection, entries = [];
  const index = stage => contour.indexOf(stage);
  for (const stage of new Set(selection.focused_stages)) {
    if (index(stage) < 0) invalid(`unknown focused stage: ${stage}`);
    entries.push({ id: `focus-${stage}`, entry: stage, mode: "focused", stage, terminal_stage: stage });
  }
  if (selection.segment !== null) {
    const { from, to } = selection.segment;
    if (index(from) < 0 || index(to) < index(from)) invalid("selection.segment must name an ordered case contour range");
    entries.push({ id: `segment-${from}-to-${to}`, entry: from, mode: "segment", stage: from, terminal_stage: to });
  }
  if (selection.e2e) entries.push({ id: "e2e", entry: "e2e", mode: "e2e", stage: contour[0], terminal_stage: profile.case_terminal_stage ?? contour.at(-1) });
  for (const entry of entries) {
    const end = selection.stop_after ?? entry.terminal_stage;
    if (index(end) < index(entry.stage) || index(end) > index(entry.terminal_stage)) invalid(`stop_after is outside execution ${entry.id}`);
    entry.terminal_stage = end;
    if (profile.schema_id === "dd-eval/run-profile@2") entry.completion_scope = {
      entry_stage: entry.stage, requested_stop_after: selection.stop_after ?? null, effective_terminal_stage: end,
      case_entry_stage: contour[0], case_terminal_stage: profile.case_terminal_stage ?? contour.at(-1),
      case_contour: [...contour],
      requested_full_case: entry.stage === contour[0] && end === (profile.case_terminal_stage ?? contour.at(-1))
    };
  }
  return Array.from({ length: selection.repetitions }, (_, repetition) => entries.map(entry => ({ ...entry,
    id: selection.repetitions === 1 ? entry.id : `${entry.id}-r${repetition + 1}` }))).flat();
}

export function observedCompletionScope(execution, result) {
  if (!execution?.completion_scope) return null;
  const planned = execution.completion_scope;
  // The successful observation constructs this only after checking the target
  // lifecycle and sealed boundary. Do not infer success from an entry label.
  const reached = result.state === "candidate_ready" && result.stage === planned.effective_terminal_stage
    && ["done", "skipped"].includes(result.stage_outcome ?? result.lifecycle?.stage_status) && Boolean(result.candidate?.manifest_sha256);
  const outcome = result.stage_outcome ?? result.lifecycle?.stage_status ?? null;
  const records = result.lifecycle?.status?.index?.stage_runs ?? result.lifecycle?.status?.stage_runs ?? [];
  return { ...planned, achieved_stage: result.stage ?? null, stage_outcome: outcome,
    target_reached: reached, full_case_completed: reached && outcome === "done" && planned.requested_full_case === true
      && Array.isArray(planned.case_contour) && planned.case_contour.every(stage => records.findLast(record => record.stage === stage)?.status === "done")
      && !records.some(record => record.status === "skipped")
      && !(result.boundaries ?? []).some(boundary => boundary.stage_outcome === "skipped"),
    completion_reason: reached && planned.requested_stop_after ? outcome === "skipped" ? "stop_after_skipped" : "stop_after_reached" : null };
}

export function assertCompletionScopes(profile, executions, flow) {
  if (profile.schema_id !== "dd-eval/run-profile@2") return;
  for (const execution of executions) {
    const contour = flow.contour, scope = execution.completion_scope;
    const end = profile.selection.stop_after ?? (execution.mode === "focused" ? execution.stage
      : execution.mode === "segment" ? profile.selection.segment?.to : flow.terminal_stage);
    if (!scope || contour.indexOf(execution.stage) < 0 || contour.indexOf(end) < contour.indexOf(execution.stage)
      || execution.terminal_stage !== end || scope.entry_stage !== execution.stage || scope.effective_terminal_stage !== end
      || scope.case_entry_stage !== contour[0] || scope.case_terminal_stage !== flow.terminal_stage
      || scope.requested_stop_after !== (profile.selection.stop_after ?? null)
      || scope.requested_full_case !== (execution.stage === contour[0] && end === flow.terminal_stage)
      || JSON.stringify(scope.case_contour) !== JSON.stringify(contour)) invalid("Execution completion scope differs from its frozen selected case range", "control_input_invalid");
  }
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
