import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { stages, validateFlowContour } from "./entry-pack.mjs";
import { selectedExecutionEntries } from "./completion-scope.mjs";
import { flowStageCatalog } from "./flow-boundaries.mjs";
import { contained } from "./contained-path.mjs";
import { parseJsonBytes } from "./json-file.mjs";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

export function qualificationTargets(profile, flow) {
  // Qualification authoring covers every requested focused cell; the scored
  // stop target must not truncate that independent canonical contour.
  const { stop_after: _stopAfter, ...selection } = profile.value.selection;
  return selectedEntries({ ...profile.value, selection, case_terminal_stage: flow.terminal_stage, case_contour: flow.contour });
}
export function assertQualificationSelection(selection, flowContour = stages) {
  const required = new Set(flowStageCatalog(flowContour));
  if (!selection || selection.e2e || !Array.isArray(selection.focused_stages)
    || selection.focused_stages.some(stage => !required.has(stage))
    || selection.focused_stages.length !== required.size || new Set(selection.focused_stages).size !== required.size)
    fail("qualification must cover every focused stage exactly once and no E2E traversal", "qualification_profile_incomplete");
}

function qualificationCellIdentity({ state, pack, profile, subject, execution }) {
  const entry = { focused_entry: pack.hashes.focused_entries[execution.stage] };
  return hashJson({
    schema_id: "dd-eval/qualification-cell-input@1",
    case_id: state.case_id,
    revision: state.revision,
    input_checkpoint: state.input_checkpoint,
    flow: { commit: state.materialized_input?.flow_commit ?? null, manifest_sha256: state.materialized_input?.flow_manifest_sha256 ?? null },
    engine: state.engine,
    subject_profile: subject,
    run_profile: profile.value,
    execution: { id: execution.id, mode: execution.mode, stage: execution.stage, terminal_stage: execution.terminal_stage },
    entry
  });
}

async function validQualificationCell({ root, record, identity }) {
  if (!isObject(record) || record.input_sha256 !== identity || typeof record.receipt !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256 ?? "")) return false;
  const file = contained(root, record.receipt, "qualification cell receipt");
  if (!(await exists(file))) return false;
  const bytes = await readFile(file);
  if (sha256(bytes) !== record.sha256) return false;
  const receipt = parseJsonBytes(bytes, file);
  return receipt?.schema_id === "dd-eval/qualification-cell-receipt@1" && receipt?.status === "candidate_ready" && receipt?.input_sha256 === identity;
}

export function prepareQualificationCell({ root, state, pack, profile, subject, execution, result, qualificationId, source = "executed" }) {
  const inputSha256 = qualificationCellIdentity({ state, pack, profile, subject, execution });
  const relativeFile = path.join("qualification", "cells", execution.id, `${qualificationId}.json`);
  const receipt = {
    schema_id: "dd-eval/qualification-cell-receipt@1",
    status: "candidate_ready",
    qualification_id: qualificationId,
    source,
    execution: { id: execution.id, mode: execution.mode, stage: execution.stage, terminal_stage: execution.terminal_stage },
    input_sha256: inputSha256,
    result,
    created_at: now()
  };
  const file = contained(root, relativeFile, "qualification cell receipt");
  return { file, relativeFile, receipt, inputSha256, qualificationId, source, execution };
}

export async function recordQualificationCell(input, prepared = prepareQualificationCell(input)) {
  const { state } = input;
  const { file, relativeFile, receipt, inputSha256, qualificationId, source, execution } = prepared;
  await writeJsonAtomic(file, receipt);
  state.qualification_cells = { ...(state.qualification_cells ?? {}), [execution.id]: { receipt: relativeFile, sha256: sha256(await readFile(file)), input_sha256: inputSha256, qualification_id: qualificationId, source, accepted_at: now() } };
  return state.qualification_cells[execution.id];
}

export async function qualificationCoverage({ root, state, pack, profile, subject, targets }) {
  const cells = {};
  for (const execution of targets) {
    const record = state.qualification_cells?.[execution.id] ?? null;
    const inputSha256 = qualificationCellIdentity({ state, pack, profile, subject, execution });
    cells[execution.id] = { execution, input_sha256: inputSha256, record, valid: await validQualificationCell({ root, record, identity: inputSha256 }) };
  }
  return cells;
}

export async function writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions = [] }) {
  const cells = Object.fromEntries(Object.entries(coverage).map(([id, value]) => [id, { input_sha256: value.input_sha256, ...(value.record ? { receipt: value.record.receipt, sha256: value.record.sha256 } : {}) }]));
  const qualified = Object.values(coverage).every((cell) => cell.valid);
  const receipt = { schema_id: "dd-eval/qualification-receipt@2", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, cells, executions, created_at: now() };
  await writeJsonAtomic(path.join(root, "qualification", "receipt.json"), receipt);
  return { receipt, qualified };
}

export function selectedEntries(runProfile, flowContour = runProfile.case_contour ?? stages) {
  const catalog = runProfile.schema_id === "dd-eval/run-profile@2" ? validateFlowContour(flowContour) : flowStageCatalog(flowContour);
  if (runProfile.selection.e2e && runProfile.case_terminal_stage !== undefined && !catalog.includes(runProfile.case_terminal_stage)) fail("E2E terminal stage is outside its flow contour", "selection_invalid");
  return selectedExecutionEntries(runProfile, catalog);
}
