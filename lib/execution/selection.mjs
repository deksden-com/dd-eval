import { contained } from "../contained-path.mjs";
import { stages, validateEntry } from "../entry-pack.mjs";
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
