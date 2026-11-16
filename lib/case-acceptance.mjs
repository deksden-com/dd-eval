import { realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { finalReceiptIndex } from "./cases/final-receipt-index.mjs";
import { selectFailedCheckGate, failedCheckEvidence } from "./cases/failed-check-evidence.mjs";
export { selectFailedCheckGate } from "./cases/failed-check-evidence.mjs";
import { matrixRows, verifyFinalMatrix } from "./cases/final-matrix.mjs";
export { finalReceiptIndex } from "./cases/final-receipt-index.mjs";
import { digest, inside, ownedFile, optionalFile } from "./cases/frozen-evidence.mjs";
import { validateFrozenReceiptScope, validateScopedInputManifest } from "./cases/frozen-authority.mjs";
export { validateFrozenAcceptedIntent, validateFrozenReceiptScope } from "./cases/frozen-authority.mjs";
export { validateFinalCheckReceipts, validateVerificationMatrixAuthority } from './verification-matrix-checks.mjs';
import { resolveBoundSnapshot } from "./recovery/recovery-safety.mjs";
import { snapshotTreeHash } from "./recovery/snapshot-tree.mjs";
export { snapshotTreeHash } from "./recovery/snapshot-tree.mjs";
import { validateVerificationMatrix } from "./verification-matrix-schema.mjs";
export { validateVerificationMatrix, isVerificationMatrixTextSource, verificationMatrixFingerprint } from "./verification-matrix-schema.mjs";

const scn = ".memory-bank/scenarios/SCN-002-workspace-task-core.md";
const matrix = ".memory-bank/plans/verification-matrix.md";
const plan = ".memory-bank/protocol/PRT-007-task-priority-levels/plan.json";
const caseId = "sdlc-eval-2026-summer-task-priority";

export function validateCaseAcceptancePolicy(policy) {
  if (policy === undefined || policy === null) return;
  if (policy?.case_id !== caseId || !["task-priority@1", "task-priority@2", "task-priority@3", "task-priority@4"].includes(policy?.checker)) throw new Error("unsupported case acceptance policy");
}

export const usesGeneratedVerificationMatrix = policy => ["task-priority@3", "task-priority@4"].includes(policy?.checker);
export const usesFailedCheckEvidenceV4 = policy => policy?.checker === "task-priority@4";

/** Mechanical, case-local facts only. Semantic adequacy remains with Final Judge. */
export async function checkCaseAcceptance({ evalRoot, execution, result, policy }) {
  validateCaseAcceptancePolicy(policy);
  if (["task-priority@2", "task-priority@3", "task-priority@4"].includes(policy?.checker)) return checkCaseAcceptanceV2({ evalRoot, execution, result, policy });
  const base = { schema_id: "dd-eval/case-acceptance@1", checker: "task-priority@1", definition: policy };
  if (policy?.checker !== "task-priority@1" || policy?.case_id !== "sdlc-eval-2026-summer-task-priority" || result.state !== "candidate_ready" || result.stage !== "merge") {
    return { ...base, execution, status: "not_applicable", facts: {}, gaps: [] };
  }
  const checkpoint = result.candidate;
  try {
    const boundaries = await realpath(path.join(evalRoot, "executions", execution, "boundaries"));
    const snapshot = await realpath(path.dirname(checkpoint.manifest));
    if (!inside(boundaries, snapshot) || path.basename(checkpoint.manifest) !== "snapshot.json") throw new Error("candidate checkpoint is outside owned boundaries");
    const manifest = await ownedFile(snapshot, "snapshot.json");
    if (manifest.sha256 !== checkpoint.manifest_sha256) throw new Error("candidate snapshot manifest checksum differs");
    const data = JSON.parse(manifest.text);
    if (data.schema_id === "dd-flow/eval-run-snapshot@12") await resolveBoundSnapshot({evalRoot,execution,result,checkpoint,purpose:"candidate"});
    if (!['dd-flow/eval-run-snapshot@5','dd-flow/eval-run-snapshot@12'].includes(data.schema_id) || data.purpose !== "candidate" || data.stage_entry !== null || data.run_id !== result.run_id || data.workspace?.kind==='project') throw new Error("candidate snapshot identity differs");
    const workspace = path.join(snapshot, "workspace");
    if (!data.workspace?.sha256 || snapshotTreeHash(workspace) !== data.workspace.sha256 || !data.runtime_sha256 || snapshotTreeHash(path.join(snapshot, "runtime")) !== data.runtime_sha256) throw new Error("candidate snapshot payload checksum differs");
    const runtime = path.join(snapshot, "runtime", "projects", data.project_id, "runs", data.run_id);
    const gaps = [], consumed = [manifest];
    const scenario = await optionalFile(workspace, scn);
    if (!scenario) gaps.push("scenario_missing");
    else consumed.push(scenario);
    const status = scenario?.text.match(/^execution_status:\s*['"]?([a-z_]+)['"]?\s*$/m)?.[1] ?? null;
    if (status !== "accepted_local") gaps.push("scenario_not_accepted_local");
    const verification = await optionalFile(workspace, matrix);
    if (!verification) gaps.push("verification_matrix_missing");
    else consumed.push(verification);
    const row = verification?.text.split(/\r?\n/).find(line => line.startsWith("|") && line.includes("PRT-007-task-priority-levels") && line.includes("SCN-002-workspace-task-core"));
    if (!row) gaps.push("priority_matrix_row_missing");
    const columns = row?.split("|").slice(1, -1).map(value => value.trim()) ?? [];
    if (row && (columns.length < 12 || !/\bpass\b/.test(columns[6]) || !/accepted_local/.test(columns[7]))) gaps.push("priority_matrix_not_accepted");
    const evidenceRef = columns[10]?.match(/\.?memory-bank\/[^\s`|)]+\.md/)?.[0] ?? null;
    let curated = null;
    if (!evidenceRef) gaps.push("curated_evidence_ref_missing");
    else {
      curated = await optionalFile(workspace, evidenceRef);
      if (!curated) gaps.push("curated_evidence_missing");
      else consumed.push(curated);
    }
    const planned = await optionalFile(workspace, plan);
    if (!planned) gaps.push("priority_plan_missing");
    else consumed.push(planned);
    const declared = planned ? JSON.parse(planned.text).acceptance : null;
    if (!Array.isArray(declared) || !declared.length) gaps.push("priority_acceptance_missing");
    const receipts = [];
    for (const stage of ["05-code", "06-code-review"]) {
      const checks = path.join(runtime, stage, "checks");
      for (const name of await readdir(checks).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error))) {
        if (!/^RCP-\d+$/.test(name)) continue;
        const relative = path.join(stage, "checks", name, "receipt.json");
        const item = await optionalFile(runtime, relative);
        if (item) { consumed.push({ ...item, path: path.join("runtime", relative) }); receipts.push(JSON.parse(item.text)); }
      }
    }
    const byCheck = new Map();
    for (const receipt of receipts.sort((a, b) => String(a.finished_at ?? "").localeCompare(String(b.finished_at ?? "")))) {
      if (receipt.scope === "aggregate" && typeof receipt.declaration_id === "string") byCheck.set(receipt.declaration_id, receipt);
    }
    const criteria = [];
    for (const item of Array.isArray(declared) ? declared : []) {
      const refs = Array.isArray(item.check_refs) ? item.check_refs : [];
      const proof = Array.isArray(item.proof_limits) ? item.proof_limits : [];
      if (!item.criterion_id || !refs.length || !proof.length || !Array.isArray(item.expected_evidence) || !item.expected_evidence.length) gaps.push(`criterion_contract_incomplete:${item.criterion_id ?? "unknown"}`);
      const checks = refs.map(id => {
        const receipt = byCheck.get(id);
        if (!receipt || receipt.status !== "passed" || !receipt.input_hash || !receipt.verification_epoch) gaps.push(`criterion_check_unproven:${item.criterion_id ?? "unknown"}:${id}`);
        return { id, receipt_id: receipt?.id ?? null, status: receipt?.status ?? "missing", input_hash: receipt?.input_hash ?? null };
      });
      criteria.push({ id: item.criterion_id, checks, proof_limits: proof, expected_evidence: item.expected_evidence });
    }
    const content = Object.fromEntries(consumed.map(item => [item.path, item.sha256]));
    return { ...base, execution, status: gaps.length ? "failed" : "passed", checkpoint_manifest_sha256: manifest.sha256, facts: { scenario_status: status, matrix_row: row ?? null, curated_evidence_ref: evidenceRef, criteria, consumed_sha256: content }, gaps };
  } catch (error) {
    return { ...base, execution, status: "unavailable", checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null, facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message, ...(error.code === "runner_proof_invalid" ? { details: error.details } : {}) } };
  }
}

const sorted = values => [...values].sort();
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const unique = values => [...new Set(values)];
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const parseJson = file => JSON.parse(file.text);

/** The v2 checker follows only authorities retained in the candidate snapshot. */
async function checkCaseAcceptanceV2({ evalRoot, execution, result, policy }) {
  const generated = usesGeneratedVerificationMatrix(policy);
  const base = { schema_id: "dd-eval/case-acceptance@1", checker: policy.checker, definition: policy };
  if (usesFailedCheckEvidenceV4(policy) && result.state === "failed") {
    const selection = selectFailedCheckGate(result);
    if (!selection.reached) return { ...base, execution, status: "not_applicable", facts: {}, gaps: [] };
    if (selection.error) return { ...base, execution, status: "unavailable", facts: {}, gaps: [], evidence_error: { code: "check_gate_evidence_invalid", message: selection.error } };
    return failedCheckEvidence({ evalRoot, execution, result, base, selection });
  }
  if (generated && result.state === "failed" && result.recovery?.manifest_sha256) return failedCheckEvidence({ evalRoot, execution, result, base });
  if (result.state !== "candidate_ready" || result.stage !== "merge") return { ...base, execution, status: "not_applicable", facts: {}, gaps: [] };
  const checkpoint = result.candidate;
  try {
    const boundaries = await realpath(path.join(evalRoot, "executions", execution, "boundaries"));
    const resolved = usesFailedCheckEvidenceV4(policy) ? await resolveBoundSnapshot({ evalRoot, execution, result, checkpoint, purpose: "candidate" }) : null;
    const snapshot = resolved?.snapshot ?? await realpath(path.dirname(checkpoint.manifest));
    ensure(inside(boundaries, snapshot) && path.basename(checkpoint.manifest) === "snapshot.json", "candidate checkpoint is outside owned boundaries");
    const manifest = resolved?.manifest ?? await ownedFile(snapshot, "snapshot.json");
    ensure(manifest.sha256 === checkpoint.manifest_sha256, "candidate snapshot manifest checksum differs");
    const data = resolved?.data ?? parseJson(manifest);
    if (data.schema_id === "dd-flow/eval-run-snapshot@12" && !resolved) await resolveBoundSnapshot({evalRoot,execution,result,checkpoint,purpose:"candidate"});
    ensure(['dd-flow/eval-run-snapshot@5','dd-flow/eval-run-snapshot@12'].includes(data.schema_id) && data.purpose === "candidate" && data.stage_entry === null && data.run_id === result.run_id && data.workspace?.kind!=='project', "candidate snapshot identity differs");
    ensure(/^PRJ-[A-Za-z0-9-]+$/.test(data.project_id) && /^RUN-[A-Za-z0-9-]+$/.test(data.run_id), "candidate runtime identity is invalid");
    ensure(data.workspace?.sha256 === snapshotTreeHash(path.join(snapshot, "workspace")) && data.runtime_sha256 === snapshotTreeHash(path.join(snapshot, "runtime")), "candidate snapshot payload checksum differs");
    const runtime = `runtime/projects/${data.project_id}/runs/${data.run_id}`;
    const consumed = [{ ...manifest, path: "snapshot.json" }];
    const read = async relative => { const file = await ownedFile(snapshot, relative); consumed.push(file); return parseJson(file); };
    const optional = async relative => { const file = await optionalFile(snapshot, relative); if (file) consumed.push(file); return file; };
    const [specify, protocolize, batch, protocolReport, mergeReport, gate, accepted] = await Promise.all([
      read(`${runtime}/01-specify/specify.json`), read(`${runtime}/02-protocolize/protocolize-result.json`),
      read(`${runtime}/03-plan/code-work-batch.json`), read(`${runtime}/02-protocolize/stage-report.json`),
      read(`${runtime}/07-merge/stage-report.json`), read(`${runtime}/07-merge/merge-gate.json`), read(`${runtime}/07-merge/merge-gate-acceptance.json`)
    ]);
    const sources = batch.sources;
    const protocols = protocolReport.semantic?.acceptance;
    const merged = mergeReport.semantic?.merge;
    ensure(Array.isArray(sources) && sources.length && Array.isArray(protocols) && Array.isArray(merged?.protocols)
      && sources.length === protocols.length && unique(protocols).length === protocols.length
      && unique(sources.map(source => source.protocol_id)).length === sources.length
      && same(sources.map(source => source.protocol_id), protocols) && same(protocols, merged.protocols), "PLAN, PROTOCOLIZE and MERGE identities disagree");
    ensure(protocolize.schema_id === "dd-flow/vnext-protocolize-result@3" && Array.isArray(protocolize.delivery?.members)
      && protocolize.delivery.members.length === protocols.length && Array.isArray(protocolize.obligation_ownership), "PROTOCOLIZE ownership is unavailable");
    const acceptedAc = new Set(specify.acceptance_criteria?.map(item => item.id));
    ensure(acceptedAc.size > 0, "accepted SPECIFY criteria are unavailable");
    const finalMatrix = generated ? validateVerificationMatrix(await read(`${runtime}/${mergeReport.semantic?.verification_matrix?.json?.path}`)) : null;
    const ownership = new Map(protocolize.obligation_ownership.map(item => [item.obligation_id, item.member_keys]));
    const plans = [];
    const gaps = [];
    const coveredAc = new Set();
    for (const source of sources) {
      ensure(typeof source.protocol_id === "string" && /^PRT-[0-9]+-[A-Za-z0-9-]+$/.test(source.protocol_id), "PLAN protocol identity is invalid");
      const frozenPlans = finalMatrix?.sources.filter(item => item.role === `plan:${source.protocol_id}` && item.sha256 === source.sha256);
      if (generated) ensure(frozenPlans.length === 1, "frozen matrix PLAN source is missing or ambiguous");
      const relative = generated ? (frozenPlans[0].root === "run" ? `${runtime}/${frozenPlans[0].path}` : `workspace/${frozenPlans[0].path}`)
        : `workspace/.memory-bank/protocol/${source.protocol_id}/plan.json`;
      const file = await ownedFile(snapshot, relative); consumed.push(file);
      const value = parseJson(file);
      ensure(value.protocol_id === source.protocol_id && value.plan_id === source.plan_id && value.revision === source.revision && file.sha256 === source.sha256, "PLAN source identity or checksum differs");
      const index = protocols.indexOf(source.protocol_id);
      const memberKey = protocolize.delivery.members[index]?.key;
      ensure(typeof memberKey === "string", "PLAN member identity is unavailable");
      const criteria = value.acceptance?.filter(item => acceptedAc.has(item.criterion_id) && ownership.get(item.criterion_id)?.includes(memberKey));
      ensure(Array.isArray(value.acceptance), "PLAN acceptance catalog is unavailable");
      for (const item of criteria) coveredAc.add(item.criterion_id);
      plans.push({ protocol_id: source.protocol_id, criteria, ...(generated ? { source, value } : {}) });
    }
    if (!plans.some(item => item.criteria.length)) gaps.push("case_acceptance_missing");
    for (const id of acceptedAc) if (!coveredAc.has(id)) gaps.push(`criterion_missing:${id}`);

    const scenario = await optional(`workspace/${scn}`);
    if (!scenario) gaps.push("scenario_missing");
    const scenarioStatus = scenario?.text.match(/^execution_status:\s*['"]?([a-z_]+)['"]?\s*$/m)?.[1] ?? null;
    if (scenarioStatus !== "accepted_local") gaps.push("scenario_not_accepted_local");
    const verification = generated ? null : await optional(`workspace/${matrix}`);
    if (!generated) {
    if (!verification) gaps.push("verification_matrix_missing");
    }
    const rows = verification ? matrixRows(verification.text) : [];
    const matrixFacts = [];
    for (const item of generated ? [] : plans.filter(item => item.criteria.length)) {
      const matches = rows.filter(row => row.protocol_ids.includes(item.protocol_id) && row.scenario_ids.includes("SCN-002-workspace-task-core") && /^local(?:-|$)/.test(row.contour));
      if (!matches.length) { gaps.push(`priority_matrix_row_missing:${item.protocol_id}`); continue; }
      const signatures = unique(matches.map(row => JSON.stringify([row.gate, row.closure, row.evidence])));
      if (signatures.length > 1) gaps.push(`priority_matrix_ambiguous:${item.protocol_id}`);
      for (const row of matches) {
        if (row.gate !== "pass" || !/^accepted_local(?:_[a-z_]+)?$/.test(row.closure)) gaps.push(`priority_matrix_not_accepted:${item.protocol_id}`);
        if (!row.evidence) gaps.push(`curated_evidence_ref_missing:${item.protocol_id}`);
        else if (!await optional(`workspace/${row.evidence}`)) gaps.push(`curated_evidence_missing:${item.protocol_id}`);
      }
      matrixFacts.push({ protocol_id: item.protocol_id, rows: matches.map(row => row.raw) });
    }

    ensure(gate.schema_id === "dd-flow/merge-gate@2" && accepted.schema_id === "dd-flow/merge-gate-acceptance@2"
      && gate.run_id === data.run_id && accepted.run_id === data.run_id
      && same(gate.protocols ?? [], merged.protocols)
      && accepted.merge_request_id === merged.merge_request_id && accepted.work_id === merged.work_id
      && accepted.accepted_tree === merged.accepted_tree && accepted.gate_hash === gate.gate_hash
      && accepted.profile_hash === gate.profile_hash && Array.isArray(gate.checks) && Array.isArray(gate.acceptance_refs)
      && Array.isArray(accepted.receipts), "MERGE authority identity differs");
    const gateHash = digest(Buffer.from(JSON.stringify({ checks: gate.checks, acceptance_refs: sorted(gate.acceptance_refs) })));
    ensure(gateHash === gate.gate_hash, "MERGE gate checksum differs");
    const expectedBindings = unique([...gate.checks.map(check => check.canonical_ref ?? check.id), ...gate.acceptance_refs]);
    ensure(accepted.receipts.every(receipt => typeof receipt.id === "string" && typeof receipt.input_hash === "string"
      && Array.isArray(receipt.execution_refs) && Array.isArray(receipt.binding_refs))
      && unique(accepted.receipts.map(receipt => receipt.id)).length === accepted.receipts.length, "MERGE receipt catalog is ambiguous");
    const allBindings = accepted.receipts.flatMap(receipt => receipt.binding_refs ?? []);
    ensure(unique(allBindings).length === allBindings.length && same(expectedBindings, allBindings), "MERGE binding catalog differs");
    const receiptFiles = await finalReceiptIndex(snapshot, runtime);
    const byBinding = new Map();
    const verifiedReceipts = new Map();
    for (const saved of accepted.receipts) {
      const file = receiptFiles.get(saved.id);
      ensure(file, `MERGE execution receipt missing: ${saved.id}`);
      const frozen = await ownedFile(snapshot, file); consumed.push(frozen);
      let receipt = parseJson(frozen);
      const scopedAuthority = await validateFrozenReceiptScope(snapshot, data, receipt, file);
      if (scopedAuthority) { receipt = scopedAuthority.receipt; consumed.push(scopedAuthority); }
      const inputManifest = await validateScopedInputManifest(snapshot, file, receipt);
      if (inputManifest) consumed.push(inputManifest);
      verifiedReceipts.set(saved.id, { receipt, frozen });
      ensure(receipt.id === saved.id && receipt.status === "passed" && receipt.scope === "aggregate"
        && receipt.input_hash && receipt.input_hash === saved.input_hash && receipt.verification_epoch
        && Array.isArray(receipt.check_refs) && same(receipt.check_refs, saved.execution_refs ?? [])
        && Array.isArray(receipt.artifacts) && Array.isArray(receipt.required_artifacts)
        && receipt.required_artifacts.every(name => receipt.artifacts.some(artifact => artifact.path === name)), `MERGE execution receipt invalid: ${saved.id}`);
      for (const artifact of receipt.artifacts ?? []) {
        ensure(typeof artifact.path === "string" && typeof artifact.sha256 === "string", "MERGE check artifact invalid");
        const evidence = await ownedFile(snapshot, `${path.dirname(file)}/artifacts/${artifact.path}`); consumed.push(evidence);
        ensure(evidence.sha256 === artifact.sha256, "MERGE check artifact checksum differs");
      }
      for (const binding of saved.binding_refs) byBinding.set(binding, { id: saved.id, input_hash: saved.input_hash, status: receipt.status });
    }
    const generatedMatrix = generated ? await verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, accepted, plans, byBinding, verifiedReceipts }) : null;
    const criteria = [];
    for (const item of plans) for (const criterion of item.criteria) {
      const refs = Array.isArray(criterion.check_refs) ? criterion.check_refs : [];
      if (!refs.length || !criterion.proof_limits?.length || !criterion.expected_evidence?.length) gaps.push(`criterion_contract_incomplete:${criterion.criterion_id}`);
      const checks = refs.map(id => {
        if (generated && item.value.checks?.find(check => check.id === id)?.run_at === "release") {
          gaps.push(`criterion_not_due:${item.protocol_id}:${criterion.criterion_id}:${id}`);
          return { id, receipt_id: null, status: "not_due", input_hash: null };
        }
        const receipt = byBinding.get(`${item.protocol_id}/${id}`);
        if (!receipt) gaps.push(`criterion_final_binding_missing:${item.protocol_id}:${criterion.criterion_id}:${id}`);
        return { id, receipt_id: receipt?.id ?? null, status: receipt?.status ?? "missing", input_hash: receipt?.input_hash ?? null };
      });
      criteria.push({ protocol_id: item.protocol_id, id: criterion.criterion_id, checks, proof_limits: criterion.proof_limits, expected_evidence: criterion.expected_evidence });
    }
    const content = Object.fromEntries(consumed.sort((a, b) => a.path.localeCompare(b.path)).map(item => [item.path, item.sha256]));
    return { ...base, execution, status: gaps.length ? "failed" : "passed", checkpoint_manifest_sha256: manifest.sha256,
      facts: { scenario_status: scenarioStatus, matrix_rows: matrixFacts, criteria, consumed_sha256: content,
        ...(usesFailedCheckEvidenceV4(policy) ? { consumed_source: { purpose: "candidate", manifest: checkpoint.manifest, manifest_sha256: manifest.sha256 } } : {}),
        ...(generated ? { verification_matrix: generatedMatrix } : {}) }, gaps: unique(gaps) };
  } catch (error) {
    return { ...base, execution, status: "unavailable", checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null,
      facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message, ...(error.code === "runner_proof_invalid" ? { details: error.details } : {}) } };
  }
}
