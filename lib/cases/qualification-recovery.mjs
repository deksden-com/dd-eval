import path from "node:path";
import { randomUUID } from "node:crypto";
import { readJson } from "../json-file.mjs";
import { loadRunProfile, loadProfile } from "./profile-loading.mjs";
import { canonicalState, assertCanonicalDefinition } from "./canonical-recovery.mjs";
import { writeCanonicalState } from "./canonical-state.mjs";
import { canonicalCandidatePack } from "./canonical-pack.mjs";
import { assertQualificationSelection, qualificationTargets, prepareQualificationCell, recordQualificationCell, qualificationCoverage } from "./canonical-qualification.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Restore accepted qualification cells from an explicitly selected receipt. */
export async function canonicalQualificationRecover({ buildRoot, receiptFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (!["entries_captured", "qualifying"].includes(state.status)) fail(`canonical build is ${state.status}, not recoverable for qualification`, "canonical_transition_invalid");
  const sourceFile = path.resolve(receiptFile); const source = await readJson(sourceFile);
  if (!isObject(source?.result) || !Array.isArray(source.result.executions) || typeof source.profile_file !== "string") fail("qualification recovery requires a runner qualification receipt", "qualification_receipt_invalid");
  const profile = await loadRunProfile(source.profile_file);
  if (profile.value.case_id !== state.case_id) fail("qualification receipt belongs to another case", "canonical_profile_mismatch");
  assertQualificationSelection(profile.value.selection, loaded.value.flow.contour);
  const pack = await canonicalCandidatePack(root, state, blueprint); const subject = (await loadProfile(profile.value.subject.profile_id)).value; const targets = qualificationTargets(profile, loaded.value.flow); const byId = new Map(targets.map((execution) => [execution.id, execution]));
  const recoveryId = `REC-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const recovered = [];
  const pendingCells = [], seen = new Set();
  for (const result of source.result.executions) {
    const execution = byId.get(result?.execution);
    if (!execution || typeof result.state !== "string" || seen.has(execution.id)) fail("qualification receipt has an unknown, duplicate or invalid execution", "qualification_receipt_invalid");
    seen.add(execution.id);
    if (result.state !== "candidate_ready") continue;
    const input = { root, state, pack, profile, subject, execution, result, qualificationId: recoveryId, source: { kind: "explicit_recovery", receipt: sourceFile } };
    pendingCells.push({ input, prepared: prepareQualificationCell(input) });
  }
  // Read retained receipts before writing the first recovered cell. A corrupt
  // later receipt must not leave an unrecorded partial recovery behind.
  const coverage = await qualificationCoverage({ root, state, pack, profile, subject, targets });
  for (const { input, prepared } of pendingCells) {
    const record = await recordQualificationCell(input, prepared);
    const execution = input.execution;
    coverage[execution.id] = { ...coverage[execution.id], valid: true, record };
    recovered.push(execution.id);
  }
  state.status = "entries_captured"; state.qualification = null;
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.qualification_recovered", data: { state: state.status, recovery_id: recoveryId, source_receipt: sourceFile, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id) } });
  return { build: root, recovered, pending: Object.values(coverage).filter((cell) => !cell.valid).map((cell) => cell.execution.id), next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)} --profile ${JSON.stringify(profile.file)}` } };
}
