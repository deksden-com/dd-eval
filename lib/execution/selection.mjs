import { contained } from "../contained-path.mjs";
import { stages, validateEntry, validateFlowContour } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Identify selections that require an admitted stage-entry pack. */
export function selectionNeedsEntryPack(executions) { return executions.some((execution) => execution.mode !== "e2e"); }

/** Load and validate each selected focused entry, reading shared files once. */
export async function prepareFocusedEntries(executions, pack, packRoot) {
  const entries = {}, files = new Map();
  for (const execution of executions.filter(item => item.mode !== "e2e")) {
    if (!pack || !packRoot) fail("Focused execution requires an entry pack", "control_input_invalid");
    const file = contained(packRoot, pack.entries[execution.entry], "focused entry");
    if (!files.has(file)) files.set(file, await readJson(file));
    const catalog = flowStageCatalog(pack.flow?.contour ?? stages);
    entries[execution.id] = validateEntry(files.get(file), execution.stage, catalog);
  }
  return entries;
}

/** Validate safe identifiers and the minimal shape needed for a productive selection. */
export function validateExecutionDescriptorShape(executions) {
  if (!Array.isArray(executions) || !executions.length
    || executions.some(item => !item || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.id)
      || !["focused", "segment", "e2e"].includes(item.mode)
      || typeof item.stage !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.stage)
      || typeof item.terminal_stage !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.terminal_stage))
    || new Set(executions.map(item => item.id)).size !== executions.length) fail("Invalid productive EVAL executions", "control_input_invalid");
}

/** Require every selected execution to lie within its flow contour. */
export function validateExecutionDescriptors(executions, flowContour = stages) {
  validateExecutionDescriptorShape(executions);
  const catalog = flowStageCatalog(flowContour);
  if (executions.some(item => !catalog.includes(item.stage) || !catalog.includes(item.terminal_stage)
    || catalog.indexOf(item.terminal_stage) < catalog.indexOf(item.stage))) fail("Invalid productive EVAL executions", "control_input_invalid");
}

/** Select all focused qualification cells for the case's flow contour. */
export function qualificationTargets(profile, flow) {
  // Qualification authoring covers every requested focused cell; the scored
  // stop target must not truncate that independent canonical contour.
  const { stop_after: _stopAfter, ...selection } = profile.value.selection;
  return selectCaseExecutions({ ...profile.value, selection }, flow);
}
/** Require qualification to cover each focused stage exactly once. */
export function assertQualificationSelection(selection, flowContour = stages) {
  const required = new Set(flowStageCatalog(flowContour));
  if (!selection || selection.e2e || !Array.isArray(selection.focused_stages)
    || selection.focused_stages.some(stage => !required.has(stage))
    || selection.focused_stages.length !== required.size || new Set(selection.focused_stages).size !== required.size)
    fail("qualification must cover every focused stage exactly once and no E2E traversal", "qualification_profile_incomplete");
}

/** Select executions using the case's declared contour and terminal stage. */
export function selectCaseExecutions(profile, flow) {
  return selectedEntries({ ...profile, case_terminal_stage: flow.terminal_stage, case_contour: flow.contour });
}

/** Resolve selected execution entries within the case's flow contour. */
export function selectedEntries(runProfile, flowContour = runProfile.case_contour ?? stages) {
  const catalog = runProfile.schema_id === "dd-eval/run-profile@2" ? validateFlowContour(flowContour) : flowStageCatalog(flowContour);
  if (runProfile.selection.e2e && runProfile.case_terminal_stage !== undefined && !catalog.includes(runProfile.case_terminal_stage)) fail("E2E terminal stage is outside its flow contour", "selection_invalid");
  return selectedExecutionEntries(runProfile, catalog);
}

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
