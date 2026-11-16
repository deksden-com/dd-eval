const invalid = (message, code = "selection_invalid") => { throw Object.assign(new Error(message), { code }); };

/** Expand authored selections into concrete, bounded execution entries. */
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

/** Verify that retained completion scopes match the selected flow range. */
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
