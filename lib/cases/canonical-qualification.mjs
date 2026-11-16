export { selectedEntries, qualificationTargets, assertQualificationSelection } from "../execution/selection.mjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { contained } from "../contained-path.mjs";
import { parseJsonBytes } from "../json-file.mjs";
import { hashJson, writeJsonAtomic } from "../runner-events.mjs";
import { stages } from "../entry-pack.mjs";
import { qualificationTargets, assertQualificationSelection } from "../execution/selection.mjs";
import { prepareEvalInputs } from "../execution/eval-inputs.mjs";
import { executeEval } from "../execution/eval-run.mjs";
import { writeCanonicalState } from "./canonical-state.mjs";
import { canonicalState, assertCanonicalDefinition } from "./canonical-recovery.mjs";
import { canonicalCandidatePack } from "./canonical-pack.mjs";
import { loadProfile, loadRunProfile } from "./profile-loading.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

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

/** Construct a qualification cell bound to the selected inputs and result. */
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

/** Persist a prepared qualification cell and return its retained record. */
export async function recordQualificationCell(input, prepared = prepareQualificationCell(input)) {
  const { state } = input;
  const { file, relativeFile, receipt, inputSha256, qualificationId, source, execution } = prepared;
  await writeJsonAtomic(file, receipt);
  state.qualification_cells = { ...(state.qualification_cells ?? {}), [execution.id]: { receipt: relativeFile, sha256: sha256(await readFile(file)), input_sha256: inputSha256, qualification_id: qualificationId, source, accepted_at: now() } };
  return state.qualification_cells[execution.id];
}

/** Inspect retained qualification cells against the required targets. */
export async function qualificationCoverage({ root, state, pack, profile, subject, targets }) {
  const cells = {};
  for (const execution of targets) {
    const record = state.qualification_cells?.[execution.id] ?? null;
    const inputSha256 = qualificationCellIdentity({ state, pack, profile, subject, execution });
    cells[execution.id] = { execution, input_sha256: inputSha256, record, valid: await validQualificationCell({ root, record, identity: inputSha256 }) };
  }
  return cells;
}

/** Persist a qualification summary with its coverage and execution results. */
export async function writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions = [] }) {
  const cells = Object.fromEntries(Object.entries(coverage).map(([id, value]) => [id, { input_sha256: value.input_sha256, ...(value.record ? { receipt: value.record.receipt, sha256: value.record.sha256 } : {}) }]));
  const qualified = Object.values(coverage).every((cell) => cell.valid);
  const receipt = { schema_id: "dd-eval/qualification-receipt@2", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, cells, executions, created_at: now() };
  await writeJsonAtomic(path.join(root, "qualification", "receipt.json"), receipt);
  return { receipt, qualified };
}

/** Qualify accepted canonical entries, reusing valid retained cells. */
export async function canonicalQualify({ buildRoot, profileFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  // A failed qualification is evidence about the runner, not a reason to
  // discard an otherwise accepted canonical chain.  Preserve that attempt,
  // then permit a corrected runner to qualify the same entries again.
  if (state.status !== "entries_captured") fail(`canonical build is ${state.status}, not ready to qualify`, "canonical_transition_invalid");
  const profile = await loadRunProfile(profileFile ?? state.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification profile belongs to another case", "canonical_profile_mismatch");
  assertQualificationSelection(profile.value.selection, loaded.value.flow.contour);
  const candidatePack = await canonicalCandidatePack(root, state, blueprint); const packFile = path.join(root, "entry-pack.json");
  const validated = { case_id: state.case_id, revision: state.revision, entry_pack: packFile, blueprint_sha256: hashJson(blueprint), entries: Object.fromEntries(Object.entries(candidatePack.entries).map(([key, file]) => [key, { file }])) };
  const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow); let coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets }); const pending = Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution); const qualificationId = `QUAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const output = path.join(root, "qualification", qualificationId);
  const preparedInputs = pending.length ? await prepareEvalInputs({ runProfile: profile, profile: subject, loaded, validated, executions: pending, suppliedPack: candidatePack }) : null;
  await writeJsonAtomic(packFile, candidatePack);
  if (pending.length === 0) {
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage });
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, reused: targets.map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  }
  state.status = "qualifying"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_started", data: { state: state.status, qualification_id: qualificationId } });
  try {
    const result = await executeEval({ runProfile: profile, profile: subject, loaded, validated, root: output, runId: qualificationId, kind: "qualification", executions: pending, preparedInputs });
    for (const resultExecution of result.executions) {
      const execution = targets.find((target) => target.id === resultExecution.execution);
      if (execution && resultExecution.state === "candidate_ready") await recordQualificationCell({ root, state, pack: candidatePack, profile, subject, execution, result: resultExecution, qualificationId });
    }
    coverage = await qualificationCoverage({ root, state, pack: candidatePack, profile, subject, targets });
    const summary = await writeQualificationSummary({ root, state, profile, qualificationId, coverage, executions: result.executions });
    const qualified = summary.qualified;
    const receipt = { schema_id: "dd-eval/qualification-attempt@1", qualification_id: qualificationId, status: qualified ? "qualified" : "incomplete", profile_file: profile.file, result, created_at: now() };
    await writeJsonAtomic(path.join(output, "receipt.json"), receipt);
    if (!qualified) {
      state.status = "entries_captured";
      state.qualification = null;
      state.qualification_failure = { receipt: path.relative(root, path.join(output, "receipt.json")), sha256: hashJson(receipt), id: qualificationId };
      await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_incomplete", data: { state: state.status, qualification_id: qualificationId, failures: result.executions.filter((execution) => execution.state !== "candidate_ready").map((execution) => ({ execution: execution.execution, code: execution.code })), pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
      return { build: root, state, receipt, next: { kind: "retry_qualification", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
    }
    state.status = "waiting_for_entry_review"; state.qualification = { receipt: "qualification/receipt.json", sha256: hashJson(summary.receipt), id: qualificationId };
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_completed", data: { state: state.status, qualification_id: qualificationId, executed: pending.map((execution) => execution.id), reused: targets.filter((target) => !pending.some((execution) => execution.id === target.id)).map((target) => target.id) } });
    return { build: root, state, receipt: summary.receipt, next: { kind: "entry_review", entries: stages } };
  } catch (error) {
    state.status = "package_gap"; await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_failed", data: { state: state.status, error: error instanceof Error ? error.message : String(error) } }); throw error;
  }
}
