import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { validateFinalCheckCoverage, validateCheckCompletion, validateFinalCheckReceipts, validateMatrixPlanProjection } from './verification-matrix-checks.mjs';
export { validateFinalCheckReceipts } from './verification-matrix-checks.mjs';
import { loadRunnerProofSources } from './runner-proof-sources.mjs';
import { browserCapabilityDiagnostic } from './browser-capabilities.mjs';
import { resolveBoundSnapshot, withFrozenRuntimeDatabase, assertRecoverySnapshotVersion } from "./recovery-safety.mjs";
import { snapshotTreeHash } from "./snapshot-tree.mjs";
export { snapshotTreeHash } from "./snapshot-tree.mjs";
import { validateVerificationMatrix, isVerificationMatrixTextSource, verificationMatrixFingerprint, matrixCanonical } from "./verification-matrix-schema.mjs";
export { validateVerificationMatrix, isVerificationMatrixTextSource, verificationMatrixFingerprint } from "./verification-matrix-schema.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, target) => target === root || target.startsWith(root + path.sep);

async function ownedFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("invalid snapshot-relative evidence path");
  const file = path.resolve(root, relative);
  for (let current = file; current !== path.resolve(root); current = path.dirname(current)) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error("symlinked evidence path is not a frozen document");
  }
  const actualRoot = await realpath(root), actual = await realpath(file);
  if (!inside(actualRoot, actual) || !(await stat(actual)).isFile()) throw new Error("evidence path escaped the frozen snapshot");
  const bytes = await readFile(actual);
  return { text: bytes.toString("utf8"), sha256: digest(bytes), path: relative };
}

async function optionalFile(root, relative) {
  try { return await ownedFile(root, relative); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

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
const ids = (value, kind) => [...String(value).matchAll(new RegExp(`(?<![A-Za-z0-9-])${kind}-[0-9]+-[A-Za-z0-9-]+(?![A-Za-z0-9-])`, "g"))].map(match => match[0]);

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
    const generatedMatrix = generated ? await verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, gate, accepted, plans, byBinding, verifiedReceipts, specify, protocolize, protocols }) : null;
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

/** A reached failed gate has receipts, not a successful MERGE acceptance.
 * Read only the existing sealed recovery capture and exact primary failures. */
export function selectFailedCheckGate(result) {
  const gates = new Set(["work_checks_failed", "code_gate_failed", "code_review_gate_failed", "merge_gate_failed"]);
  const found = [], seen = new Set();
  let invalid = false, remaining = 256;
  const visit = (node, ancestors, depth) => {
    if (!node || typeof node !== "object") return;
    if (depth > 12 || --remaining < 0 || seen.has(node)) { invalid = true; return; }
    seen.add(node);
    const readiness = node.code === "workspace_readiness_failed" && Array.isArray(node.details?.checks) && node.details.checks.length;
    if (gates.has(node.code) || readiness) {
      const enclosing = [...ancestors, node].reverse().find(item => Array.isArray(item.details?.failures) && item.details.failures.length);
      const workIds = unique([node.details?.work_id, enclosing?.details?.work_id].filter(value => typeof value === "string" && value));
      found.push({ code: node.code, failures: readiness ? node.details.checks.filter(item => item?.status !== "passed") : enclosing?.details.failures, readiness: Boolean(readiness), workIds });
    }
    const children = [node.cause, node.details?.cause, node.details?.primary_error, node.details?.controller?.error, node.details?.error].filter(Boolean);
    for (const child of new Set(children)) visit(child, [...ancestors, node], depth + 1);
    seen.delete(node);
  };
  visit(result, [], 0);
  if (!found.length) return { reached: false };
  if (invalid || found.length !== 1) return { reached: true, error: "check gate error chain is cyclic, truncated or ambiguous" };
  const selected = found[0];
  if (!selected.failures?.length || selected.failures.some(item => !item || typeof item.id !== "string" || !["failed", "aborted"].includes(item.status))) return { reached: true, error: "reached check gate has no proven terminal receipt identities" };
  if (selected.workIds.length > 1 || selected.workIds.length && selected.failures.some(item => item.work_id !== undefined ? item.work_id !== selected.workIds[0] : !item.id.startsWith(`${selected.workIds[0]}/`))) return { reached: true, error: "gate and enclosing failed receipts belong to different Work" };
  return { reached: true, ...selected };
}

async function failedCheckEvidence({ evalRoot, execution, result, base, selection = null }) {
  const checkpoint = result.recovery;
  const bound = { ...base, execution, checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null };
  try {
    const owner = selection ? null : await realpath(path.join(evalRoot, "executions", execution));
    ensure(checkpoint?.manifest && checkpoint.manifest_sha256, "reached check gate has no recovery capture");
    const resolved = selection ? await resolveBoundSnapshot({ evalRoot, execution, result, checkpoint, purpose: "recovery" }) : null;
    const snapshot = resolved?.snapshot ?? await realpath(path.dirname(checkpoint.manifest));
    if (!selection) ensure(inside(owner, snapshot) && path.basename(checkpoint.manifest) === "snapshot.json", "failure snapshot escaped execution ownership");
    const manifest = resolved?.manifest ?? await ownedFile(snapshot, "snapshot.json"), data = resolved?.data ?? parseJson(manifest);
    await assertRecoverySnapshotVersion(snapshot, data);
    ensure(manifest.sha256 === checkpoint.manifest_sha256 && data.purpose === "recovery"
      && data.stage_entry === null && data.run_id === result.run_id && data.recovery_id === checkpoint.recovery_id && data.consistency === "sealed_writer_barrier_required", "failure capture identity differs");
    ensure(/^PRJ-[A-Za-z0-9-]+$/.test(data.project_id) && /^RUN-[A-Za-z0-9-]+$/.test(data.run_id)
      && data.workspace?.sha256 === snapshotTreeHash(path.join(snapshot, "workspace")) && data.runtime_sha256 === snapshotTreeHash(path.join(snapshot, "runtime")), "failure snapshot payload checksum differs");
    const consumed = new Map([["snapshot.json", manifest.sha256]]), runtime = `runtime/projects/${data.project_id}/runs/${data.run_id}`;
    const browserEnvironment = await retainedBrowserEnvironment(snapshot, runtime, consumed);
    let primary = result;
    for (let depth = 0; depth < 6 && primary && !["work_checks_failed", "code_gate_failed", "code_review_gate_failed", "merge_gate_failed"].includes(primary.code); depth++) primary = primary.details?.controller?.error ?? primary.details?.primary_error ?? primary.details?.error ?? primary.cause;
    const failures = selection?.failures ?? primary?.details?.failures;
    if (!Array.isArray(failures) || !failures.length) return { ...bound, status: "not_applicable", facts: {}, gaps: [] };
    const receipts = await finalReceiptIndex(snapshot, runtime), checks = [], gaps = [];
    ensure(unique(failures.map(item => item.id)).length === failures.length, "failure receipt identity is ambiguous");
    for (const failed of failures) {
      const relative = receipts.get(failed.id); ensure(relative, `failed execution receipt missing: ${failed.id}`);
      const file = await ownedFile(snapshot, relative); let receipt = parseJson(file); consumed.set(relative, file.sha256);
      const scopedAuthority = await validateFrozenReceiptScope(snapshot, data, receipt, relative);
      if (scopedAuthority) { receipt = scopedAuthority.receipt; consumed.set(scopedAuthority.path, scopedAuthority.sha256); }
      const inputManifest = await validateScopedInputManifest(snapshot, relative, receipt);
      if (inputManifest) consumed.set(inputManifest.path, inputManifest.sha256);
      if (selection?.readiness) ensure(typeof failed.receipt_path === "string" && failed.receipt_path === receipt.receipt_path
        && receipt.gate === "readiness" && receipt.scope === "aggregate", "readiness wrapper receipt binding differs");
      if (selection) ensure((failed.work_id === undefined || failed.work_id === receipt.work_id)
        && (failed.local_id === undefined || failed.local_id === receipt.local_id)
        && (failed.gate === undefined || failed.gate === receipt.gate)
        && (failed.receipt_path === undefined || failed.receipt_path === receipt.receipt_path), "failed gate wrapper identity differs");
      ensure(receipt.id === failed.id && receipt.input_hash && (selection?.readiness || receipt.input_hash === failed.input_hash) && receipt.verification_epoch
        && ["failed", "aborted"].includes(receipt.status) && receipt.status === failed.status && receipt.finished_at
        && Array.isArray(receipt.artifacts) && Array.isArray(receipt.required_artifacts), "failed execution receipt identity differs");
      if (selection) {
        await withFrozenRuntimeDatabase(snapshot, db => {
          const run = db.prepare("SELECT id FROM runs WHERE id = ? AND project_id = ?").get(data.run_id, data.project_id);
          const saved = db.prepare("SELECT * FROM check_receipts WHERE id = ? AND project_id = ? AND run_id = ?").get(receipt.id, data.project_id, data.run_id);
          const work = receipt.work_id == null ? true : db.prepare("SELECT work_id FROM works WHERE work_id = ? AND project_id = ? AND run_id = ?").get(receipt.work_id, data.project_id, data.run_id);
          ensure(run && work && saved && ["work_id", "scope", "gate", "input_hash", "verification_epoch", "status", "finished_at", "receipt_path"].every(key => saved[key] === receipt[key])
            && (saved.fingerprint_scope ?? null) === (receipt.fingerprint_scope ?? null), "failed receipt lacks frozen RUN/Work authority");
        });
        const database = await ownedFile(snapshot, "runtime/db.sqlite"); consumed.set(database.path, database.sha256);
      }
      if (receipt.status === "failed") {
        const completion = await ownedFile(snapshot, `${path.dirname(relative)}/completion.json`);
        validateCheckCompletion(receipt, parseJson(completion)); consumed.set(completion.path, completion.sha256);
      }
      for (const artifact of receipt.artifacts) {
        const proof = await ownedFile(snapshot, `${path.dirname(relative)}/artifacts/${artifact.path}`);
        ensure(proof.sha256 === artifact.sha256, "claimed failed execution artifact checksum differs"); consumed.set(proof.path, proof.sha256);
      }
      const missing = receipt.required_artifacts.filter(name => !receipt.artifacts.some(artifact => artifact.path === name));
      const scopedMissing = receipt.fingerprint_scope === "check_inputs" && missing.length > 0
        && receipt.execution_failures?.some(failure => failure.code === "missing_required_artifact" && failure.message === missing.join(", "));
      if (receipt.status === "failed" && receipt.exit_code === 0) ensure((receipt.fingerprint_scope == null && missing.length || scopedMissing)
        || receipt.fingerprint_scope == null && Array.isArray(receipt.mutation_paths) && receipt.mutation_paths.length
        && /^[a-f0-9]{64}$/.test(receipt.before_fingerprint ?? "") && /^[a-f0-9]{64}$/.test(receipt.after_fingerprint ?? "")
        && receipt.before_fingerprint !== receipt.after_fingerprint
        || receipt.fingerprint_scope === "check_inputs" && receipt.before_fingerprint !== receipt.after_fingerprint
          && /^[a-f0-9]{64}$/.test(receipt.before_fingerprint ?? "") && /^[a-f0-9]{64}$/.test(receipt.after_fingerprint ?? "")
          && receipt.execution_failures?.some(failure => failure.code === "check_inputs_changed"), "zero-exit failed check has no proven contract violation");
      const missingEvidence = receipt.fingerprint_scope == null || scopedMissing ? missing : [];
      gaps.push(`check_execution_${receipt.status}:${receipt.id}`, ...missingEvidence.map(name => `check_expected_output_missing:${receipt.id}:${name}`));
      checks.push({ id: receipt.id, status: receipt.status, exit_code: receipt.exit_code, input_hash: receipt.input_hash, expected_output_gaps: missingEvidence, attribution: "undetermined", ...(browserEnvironment ? { browser_environment_diagnostics: (receipt.runner_evidence?.failures ?? []).slice(0, 64).map(failure => browserCapabilityDiagnostic(browserEnvironment.fact, failure)) } : {}), ...(selection && receipt.status === "aborted" ? { aborted_reason: receipt.abort_reason ?? receipt.error ?? null } : {}) });
    }
    return { ...bound, status: selection || checks.some(check => check.status === "failed") ? "failed" : "not_applicable", facts: { failed_checks: checks, ...(browserEnvironment ? { browser_environment: browserEnvironment } : {}), consumed_sha256: Object.fromEntries([...consumed].sort(([a], [b]) => a.localeCompare(b))), ...(selection ? { consumed_source: { purpose: "recovery", manifest: checkpoint.manifest, manifest_sha256: checkpoint.manifest_sha256, recovery_id: checkpoint.recovery_id } } : {}), interpretation: "Native check execution outcomes; product/infrastructure cause remains Judge assessment." }, gaps };
  } catch (error) { return { ...bound, status: "unavailable", facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message, ...(error.code === "runner_proof_invalid" ? { details: error.details } : {}) } }; }
}

async function retainedBrowserEnvironment(snapshot, runtime, consumed) {
  const index = await optionalFile(snapshot, `${runtime}/run.json`);
  if (!index) return null;
  const reference = parseJson(index).execution_profile?.stage_context_inputs?.code;
  if (!reference) return null;
  const context = await ownedFile(snapshot, `${runtime}/${reference.path}`);
  ensure(context.sha256 === reference.sha256, 'Browser environment context checksum differs');
  const sources = (parseJson(context).sources ?? []).filter(source => source.root === 'run' && source.role === 'browser_environment_capabilities');
  if (!sources.length) return null;
  ensure(sources.length === 1 && /^[a-f0-9]{64}$/.test(sources[0].sha256 ?? ''), 'Browser environment context is ambiguous');
  const filename = path.posix.basename(sources[0].path ?? ''), namedHash = filename.match(/^browser-capabilities(?:-([a-f0-9]{64}))?\.json$/);
  ensure(namedHash && (!namedHash[1] || namedHash[1] === sources[0].sha256), 'Browser environment path lacks its content binding');
  const proof = await ownedFile(snapshot, `${runtime}/environment/${filename}`);
  ensure(proof.sha256 === sources[0].sha256 && Buffer.byteLength(proof.text) <= 2 * 1024 * 1024, 'Browser environment fact checksum differs');
  consumed.set(index.path, index.sha256); consumed.set(context.path, context.sha256); consumed.set(proof.path, proof.sha256);
  return { fact: parseJson(proof), source: { path: proof.path, sha256: proof.sha256 } };
}

async function verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, gate, accepted, plans, byBinding, verifiedReceipts, specify, protocolize, protocols }) {
  const index = await read(`${runtime}/run.json`);
  ensure(index.verification_matrix_contract === "dd-flow/verification-matrix@1", "RUN has no retained verification matrix contract");
  ensure(index.final_check_coverage_contract === "dd-flow/final-check-coverage@1", "RUN has no final check coverage contract");
  const binding = mergeReport.semantic?.verification_matrix;
  ensure(binding?.coverage_contract === index.final_check_coverage_contract, "MERGE report has no bound final check coverage contract");
  ensure(binding?.contract === index.verification_matrix_contract && binding.role === "output" && binding.completeness === "final", "MERGE final matrix binding is unavailable");
  const json = await ownedFile(snapshot, `${runtime}/${binding.json?.path}`);
  const markdown = await ownedFile(snapshot, `${runtime}/${binding.markdown?.path}`);
  ensure(json.sha256 === binding.json.sha256 && markdown.sha256 === binding.markdown.sha256, "MERGE matrix packet checksum differs");
  consumed.push(json, markdown);
  const matrix = validateVerificationMatrix(parseJson(json));
  const intentDatabase = await validateFrozenAcceptedIntent(snapshot, data, index, matrix);
  if (intentDatabase) consumed.push(intentDatabase);
  const header = matrix.header;
  const stage = index.stage_runs?.find(item => item.stage === "merge");
  ensure(header.project_id === data.project_id && header.run_id === data.run_id && header.stage === "merge"
    && header.role === "output" && header.completeness === "final" && header.source_fingerprint === binding.source_fingerprint
    && header.stage_attempt === (stage?.attempt ?? stage?.stage_attempt), "MERGE matrix owning Stage identity differs");
  const merged = header.merge;
  ensure(merged?.merge_request_id === accepted.merge_request_id && merged.work_id === accepted.work_id
    && merged.gate_hash === accepted.gate_hash && merged.profile_hash === accepted.profile_hash
    && merged.accepted_tree === accepted.accepted_tree, "MERGE matrix accepted tree or gate differs");
  const sourceKeys = matrix.sources.map(source => `${source.role}:${source.root}:${source.path}`);
  ensure(unique(sourceKeys).length === sourceKeys.length, "matrix source catalog is ambiguous");
  const sourceMap = new Map();
  const sourceProofs = [];
  for (const source of matrix.sources) {
    const relative = source.root === "run" ? `${runtime}/${source.path}` : `workspace/${source.path}`;
    const file = await ownedFile(snapshot, relative); consumed.push(file);
    ensure(file.sha256 === source.sha256, "matrix source checksum differs");
    sourceMap.set(`${source.root}:${source.path}`, source.sha256);
    const textSource = isVerificationMatrixTextSource(source);
    sourceProofs.push({ ...source, value: source.role.startsWith("artifact:") ? {} : textSource ? { text: file.text } : parseJson(file) });
  }
  const runnerBytes = await loadRunnerProofSources(matrix, sourceProofs, async source => {
    const file = await ownedFile(snapshot, `${runtime}/${source.path}`);
    return Buffer.from(file.text);
  });
  validateVerificationMatrixAuthority(matrix, sourceProofs, mergeReport, runnerBytes);
  ensure(merged.acceptance_ref.root === "run" && merged.acceptance_ref.path === "07-merge/merge-gate-acceptance.json"
    && sourceMap.get(`run:${merged.acceptance_ref.path}`) === merged.acceptance_ref.sha256, "matrix final acceptance source is unavailable");
  for (const relative of ["01-specify/specify.json", "02-protocolize/protocolize-result.json", "02-protocolize/stage-report.json", "03-plan/code-work-batch.json", "07-merge/merge-gate.json"]) {
    const file = await ownedFile(snapshot, `${runtime}/${relative}`);
    ensure(sourceMap.get(`run:${relative}`) === file.sha256, "matrix retained authority source is unavailable");
  }
  for (const item of plans) ensure(matrix.sources.some(source => source.role === `plan:${item.protocol_id}` && source.sha256 === item.source.sha256),
    "matrix accepted PLAN source differs");
  const assertCheck = check => {
    if (check.declaration.run_at === "release") { ensure(check.disposition === "not_due" && check.result === null, "not-due check claims a target result"); return; }
    const saved = byBinding.get(check.canonical_ref);
    ensure(saved, `matrix check has no accepted target binding: ${check.canonical_ref}`);
    const proof = verifiedReceipts.get(saved.id);
    ensure(check.disposition === "retained" && check.result?.id === saved.id && check.result.status === proof.receipt.status
      && check.result.input_hash === saved.input_hash && check.result.verification_epoch === proof.receipt.verification_epoch
      && same(check.result.check_refs ?? [], proof.receipt.check_refs), "matrix check result differs from frozen receipt");
    ensure([...sourceMap].some(([key, hash]) => key === `run:${path.relative(runtime, proof.frozen.path)}` && hash === proof.frozen.sha256), "matrix receipt source is unavailable");
  };
  for (const row of matrix.criteria) {
    for (const check of row.checks) {
      assertCheck(check);
    }
  }
  for (const check of matrix.policy_checks) assertCheck(check);
  ensure(verificationMatrixFingerprint(matrix) === header.source_fingerprint, "matrix source fingerprint differs");
  return { contract: binding.contract, json: { path: json.path, sha256: json.sha256 }, markdown: { path: markdown.path, sha256: markdown.sha256 }, source_fingerprint: header.source_fingerprint };
}

/** A marked RUN must retain the exact original input inventory, independently
 * of the derived SPECIFY/PLAN. Historical unmarked RUNs keep their old contract. */
export async function validateFrozenAcceptedIntent(snapshot, data, index, matrix) {
  const contract = "dd-flow/accepted-intent@1", marker = index.accepted_intent_contract;
  ensure(marker === undefined || marker === contract, "unsupported accepted intent contract");
  const database = await optionalFile(snapshot, "runtime/db.sqlite");
  if (!database) { ensure(marker === undefined, "accepted intent has no frozen database authority"); return null; }
  let marked = false;
  await withFrozenRuntimeDatabase(snapshot, db => {
    const columns = db.prepare("PRAGMA table_info(runs)").all();
    if (!columns.some(column => column.name === "index_json")) { ensure(marker === undefined, "accepted intent has no frozen RUN authority"); return; }
    const run = db.prepare("SELECT index_json FROM runs WHERE project_id = ? AND id = ?").get(data.project_id, data.run_id);
    const saved = run && JSON.parse(run.index_json).accepted_intent_contract;
    ensure(saved === marker, "accepted intent contract differs from frozen RUN authority");
    if (marker === undefined) return;
    marked = true;
    const scope = [data.project_id, data.run_id];
    const answers = db.prepare("SELECT id, payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_resumed' AND json_extract(payload_json, '$.run_id') = ? ORDER BY id LIMIT 256").all(...scope);
    const entries = [{ role: "accepted_intake", suffix: "/intake/discussion.md" }, ...answers.flatMap(row => {
      const value = JSON.parse(row.payload_json), identity = `accepted_hitl:${String(row.id).padStart(12, "0")}:${value.pause_id}`;
      ensure(typeof value.answer_path === "string" && path.isAbsolute(value.answer_path) && typeof value.pause_id === "string", "accepted HITL answer authority is invalid");
      // Established engine pairing: the retained question Stage packet is the
      // question.md beside this exact delivered answer, never inferred prose.
      return [{ role: `${identity}:0-question`, file: path.join(path.dirname(value.answer_path), "question.md") }, { role: `${identity}:1-answer`, file: value.answer_path }];
    })];
    ensure(entries.length <= 256, "accepted intent source inventory exceeds bound");
    const expected = [];
    let total = 0;
    for (const entry of entries) {
      const rows = entry.suffix
        ? db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_packet' AND json_extract(payload_json, '$.run_id') = ? AND substr(json_extract(payload_json, '$.file'), -length(?)) = ? LIMIT 33").all(...scope, entry.suffix, entry.suffix)
        : db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_packet' AND json_extract(payload_json, '$.run_id') = ? AND json_extract(payload_json, '$.file') = ? LIMIT 33").all(...scope, entry.file);
      ensure(rows.length > 0 && rows.length <= 32 && rows.every(row => Buffer.byteLength(row.payload_json) <= 2 * 1024 * 1024), "accepted intent Stage packet custody is missing or unbounded");
      const packets = rows.map(row => JSON.parse(row.payload_json)), bytes = Buffer.from(packets[0].base64, "base64"), sha256 = digest(bytes);
      total += bytes.length;
      ensure(bytes.length > 0 && bytes.length <= 1024 * 1024 && total <= 16 * 1024 * 1024 && packets.every(packet => packet.sha256 === sha256 && packet.base64 === bytes.toString("base64")), "accepted intent Stage packet bytes differ");
      expected.push({ role: entry.role, root: "run", path: `07-merge/verification/sources/${sha256}/accepted-input.md`, sha256 });
    }
    const actual = matrix.sources.filter(source => source.role === "accepted_intake" || source.role.startsWith("accepted_hitl:"));
    const ordered = sources => sources.toSorted((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
    ensure(matrixCanonical(ordered(actual)) === matrixCanonical(ordered(expected)), "accepted intent source inventory differs from delivered frozen authority");
  });
  return marked ? database : null;
}


/** Shared technical authority for qualification and candidate acceptance.
 * Values come only from independently hash-checked retained source bytes. */
export function validateVerificationMatrixAuthority(matrix, proofs, report = null, runnerBytes = new Map()) {
  validateVerificationMatrix(matrix);
  ensure(verificationMatrixFingerprint(matrix) === matrix.header.source_fingerprint, "matrix source fingerprint differs");
  const catalog = new Map(), decoded = new Map();
  for (const source of matrix.sources) {
    const key = `${source.root}:${source.path}`;
    ensure(!catalog.has(key) || catalog.get(key) === source.sha256, "matrix source aliases disagree");
    catalog.set(key, source.sha256);
    const proof = proofs.find(item => item.root === source.root && item.path === source.path && item.sha256 === source.sha256);
    ensure(proof, `matrix retained source is unavailable: ${key}`);
    decoded.set(key, proof.value);
  }
  const required = relative => { const key = `run:${relative}`; ensure(decoded.has(key), `matrix retained authority source is unavailable: ${key}`); return decoded.get(key); };
  const specify = required("01-specify/specify.json"), protocolize = required("02-protocolize/protocolize-result.json"), protocolReport = required("02-protocolize/stage-report.json");
  if (matrix.header.completeness === "skeleton") return matrix;
  const batchSources = matrix.sources.filter(source => source.role === "code_work_batch" && source.root === "run");
  ensure(batchSources.length === 1, "matrix retained batch source is missing or ambiguous");
  const batchSource = batchSources[0], batch = decoded.get(`run:${batchSource.path}`);
  ensure(batchSource.path.endsWith(`/verification/sources/${batchSource.sha256}/code-work-batch.json`), "matrix batch is not bound to its retained revision");
  const expectedBatch = report?.semantic?.plan_review?.final_batch_checksum ?? report?.semantic?.batch_checksum;
  if (matrix.header.role === "output" && ["plan", "plan-review"].includes(matrix.header.stage)) ensure(/^[a-f0-9]{64}$/.test(expectedBatch ?? ""), "matrix owning Stage has no accepted batch checksum");
  if (expectedBatch) ensure(batchSource.sha256 === expectedBatch, "matrix batch differs from accepted Stage revision");
  if (matrix.header.completeness === "final") { required("03-plan/code-work-batch.json"); ensure(catalog.get("run:03-plan/code-work-batch.json") === batchSource.sha256, "matrix final canonical batch differs from retained revision"); }
  const protocols = protocolReport.semantic?.acceptance;
  ensure(Array.isArray(protocols) && protocols.length && unique(protocols).length === protocols.length && Array.isArray(batch?.sources)
    && batch.sources.length === protocols.length && same(batch.sources.map(source => source.protocol_id), protocols)
    && unique(batch.sources.map(source => source.protocol_id)).length === protocols.length
    && Array.isArray(protocolize.delivery?.members) && protocolize.delivery.members.length === protocols.length
    && Array.isArray(protocolize.obligation_ownership), "matrix batch and PROTOCOLIZE ownership differ");
  const acceptedCriteria = new Set((specify.acceptance_criteria ?? []).map(item => item.id));
  const plans = batch.sources.map(source => {
    const candidates = matrix.sources.filter(item => item.role === `plan:${source.protocol_id}`);
    ensure(candidates.length === 1 && candidates[0].root === "run" && candidates[0].sha256 === source.sha256
      && candidates[0].path.endsWith(`/verification/sources/${source.sha256}/plan.json`), "matrix accepted PLAN source differs");
    const value = decoded.get(`${candidates[0].root}:${candidates[0].path}`), member = protocolize.delivery.members[protocols.indexOf(source.protocol_id)].key;
    ensure(value?.protocol_id === source.protocol_id && value.plan_id === source.plan_id && value.revision === source.revision && Array.isArray(value.acceptance), "matrix PLAN revision differs from batch");
    return { protocol_id: source.protocol_id, value, criteria: value.acceptance.filter(item => acceptedCriteria.has(item.criterion_id) && protocolize.obligation_ownership.some(owner => owner.obligation_id === item.criterion_id && owner.member_keys.includes(member))) };
  });
  validateMatrixPlanProjection(matrix, { specify, protocolize, protocols, plans });
  if (matrix.header.completeness === "final") {
    const gate = required("07-merge/merge-gate.json"), semanticRefs = new Set(matrix.criteria.flatMap(row => row.checks.map(check => check.canonical_ref)));
    ensure(Array.isArray(gate.checks) && Array.isArray(gate.acceptance_refs), "matrix final gate declarations are unavailable");
    validateFinalCheckCoverage(matrix, plans.map(item => item.value), gate, decoded);
    validateFinalCheckReceipts(matrix, gate, decoded, runnerBytes);
    const policyRefs = gate.checks.map(check => check.canonical_ref ?? check.id).filter(ref => !semanticRefs.has(ref));
    ensure(same(matrix.policy_checks.map(check => check.canonical_ref), policyRefs)
      && unique(matrix.policy_checks.map(check => check.canonical_ref)).length === matrix.policy_checks.length, "matrix policy-only gate coverage differs");
    for (const check of matrix.policy_checks) {
      const declaration = gate.checks.find(item => (item.canonical_ref ?? item.id) === check.canonical_ref);
      ensure(matrixCanonical(check.declaration) === matrixCanonical(declaration), "matrix policy declaration differs from frozen gate");
    }
  }
  return matrix;
}

/** Coverage comes from accepted PLAN and retained policy, never the gate it checks. */

export async function validateFrozenReceiptScope(snapshot, data, receipt, relative = null) {
  ensure([undefined, null, "check_inputs"].includes(receipt.fingerprint_scope), "unsupported check fingerprint scope");
  const database = await optionalFile(snapshot, "runtime/db.sqlite");
  if (!database) {
    ensure(receipt.fingerprint_scope == null, "scoped receipt has no frozen database authority");
    return null;
  }
  let scopedDatabase = false, executionFailures = receipt.execution_failures ?? [];
  await withFrozenRuntimeDatabase(snapshot, db => {
    scopedDatabase = db.prepare("PRAGMA table_info(check_receipts)").all().some(column => column.name === "fingerprint_scope");
    if (!scopedDatabase) {
      ensure(receipt.fingerprint_scope == null, "scoped receipt has no persisted scope authority");
      return;
    }
    const saved = db.prepare("SELECT * FROM check_receipts WHERE id = ? AND project_id = ? AND run_id = ?").get(receipt.id, data.project_id, data.run_id);
    ensure(saved && (saved.fingerprint_scope ?? null) === (receipt.fingerprint_scope ?? null), "check fingerprint scope differs from frozen authority");
    ensure(["work_id", "scope", "gate", "command", "input_hash", "verification_epoch", "status", "exit_code", "workspace_fingerprint", "before_fingerprint", "after_fingerprint", "profile_hash", "started_at", "finished_at"].every(key => saved[key] === receipt[key]), "scoped receipt differs from frozen execution authority");
    if (receipt.fingerprint_scope === "check_inputs") ensure(saved.execution_contract_hash === receipt.execution_contract_hash
      && matrixCanonical(JSON.parse(saved.input_manifest_json ?? "null")) === matrixCanonical(receipt.input_manifest ?? null)
      && matrixCanonical(JSON.parse(saved.artifacts_json ?? "[]")) === matrixCanonical(receipt.artifacts ?? []), "scoped input manifest, artifacts or failures differ from frozen authority");
    if (receipt.fingerprint_scope === "check_inputs") {
      executionFailures = JSON.parse(saved.execution_failures_json ?? "[]");
      ensure(Array.isArray(executionFailures) && executionFailures.every(failure => failure && typeof failure.code === "string" && typeof failure.message === "string"), "scoped execution failures are invalid SQL authority");
    }
  });
  if (!scopedDatabase) return null;
  if (receipt.fingerprint_scope === "check_inputs" && (receipt.artifacts?.some(artifact => artifact.path === "engine-outcome.json") || receipt.required_artifacts?.includes("engine-outcome.json"))) {
    ensure(typeof relative === "string", "scoped engine outcome has no frozen owning receipt path");
    const claimed = receipt.artifacts?.find(artifact => artifact.path === "engine-outcome.json");
    const file = await ownedFile(snapshot, path.posix.join(path.posix.dirname(relative.replaceAll("\\", "/")), "artifacts/engine-outcome.json"));
    ensure(claimed && claimed.sha256 === file.sha256, "scoped engine outcome differs from retained artifact authority");
    const outcome = parseJson(file);
    ensure(outcome.schema_id === "dd-flow/check-execution-outcome@1"
      && ["id", "command", "input_hash", "verification_epoch", "fingerprint_scope"].every(key => outcome[key] === receipt[key])
      && (outcome.execution_contract_hash ?? null) === (receipt.execution_contract_hash ?? null)
      && matrixCanonical(outcome.input_manifest ?? null) === matrixCanonical(receipt.input_manifest ?? null)
      && matrixCanonical(outcome.execution_failures) === matrixCanonical(executionFailures), "scoped engine outcome conflicts with SQL execution authority");
  }
  // Mutable receipt annotations cannot replace (or poison) the retained outcome.
  return { ...database, receipt: { ...receipt, execution_failures: executionFailures } };
}

async function validateScopedInputManifest(snapshot, relative, receipt) {
  if (receipt.fingerprint_scope == null) return null;
  const manifest = receipt.input_manifest;
  ensure(manifest?.path === "inputs-before.json" && /^[a-f0-9]{64}$/.test(manifest.sha256 ?? "")
    && typeof manifest.truncated === "boolean", "scoped input manifest binding is invalid");
  const file = await ownedFile(snapshot, path.posix.join(path.posix.dirname(relative.replaceAll("\\", "/")), manifest.path));
  ensure(file.sha256 === manifest.sha256 && Buffer.byteLength(file.text) <= 1024 * 1024, "scoped input manifest is missing or changed");
  return file;
}


/** Validate native execution independently of its matrix projection. Binding refs
 * can differ from execution refs when an exact-input deterministic receipt is reused. */




function matrixRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headerLine = lines.findIndex(line => line.trim().startsWith("|") && line.includes("Capability / claim") && line.includes("Primary scenario"));
  const header = headerLine < 0 ? null : lines[headerLine].split("|").slice(1, -1).map(cell => cell.trim());
  ensure(header, "verification matrix header is unavailable");
  const column = name => { const at = header.indexOf(name); ensure(at >= 0, `verification matrix ${name} column is unavailable`); return at; };
  const [claim, scenario, contour, gate, closure, evidence] = ["Capability / claim", "Primary scenario", "Verification contour", "gate_status", "closure_state", "Later passport"].map(column);
  const parsed = [];
  for (const line of lines.slice(headerLine + 1)) {
    if (!line.trim().startsWith("|")) break;
    ensure(line.trim().endsWith("|"), "verification matrix row has unsupported pipe syntax");
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
    ensure(cells.length === header.length, "verification matrix row has ambiguous columns");
    if (!cells.every(cell => /^:?-+:?$/.test(cell))) parsed.push(cells);
  }
  return parsed.map(cells => ({
    protocol_ids: ids(cells[claim], "PRT"), scenario_ids: ids(cells[scenario], "SCN"), contour: cells[contour], gate: cells[gate], closure: cells[closure],
    evidence: cells[evidence].match(/\.memory-bank\/[A-Za-z0-9/_-]+\.md\b/)?.[0] ?? null, raw: cells
  }));
}

export async function finalReceiptIndex(snapshot, runtime) {
  const result = new Map();
  const workIds = new Set();
  const directoriesAt = async directory => {
    try {
      const info = await lstat(directory);
      ensure(info.isDirectory() && !info.isSymbolicLink() && inside(snapshot, await realpath(directory)), "receipt directory escaped frozen runtime");
      return await readdir(directory);
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  for (const stage of ["", "05-code", "06-code-review", "07-merge"]) {
    const root = path.join(snapshot, runtime, stage);
    const directories = [path.join(root, "checks"), ...(stage === "05-code" ? [path.join(root, "readiness", "checks")] : [])];
    for (const name of await directoriesAt(path.join(root, "works"))) {
      if (/^WRK-[A-Za-z0-9-]+$/.test(name)) directories.push(path.join(root, "works", name, "checks"));
    }
    for (const directory of directories) for (const name of await directoriesAt(directory)) {
      if (!/^RCP-[0-9]+$/.test(name)) continue;
      const relative = path.relative(snapshot, path.join(directory, name, "receipt.json"));
      const receipt = parseJson(await ownedFile(snapshot, relative));
      const work = directory.includes(`${path.sep}works${path.sep}`) ? path.basename(path.dirname(directory)) : null;
      const run = path.basename(runtime);
      const namespace = receipt.work_id ?? run;
      const id = receipt.id;
      ensure(typeof id === "string" && receipt.local_id === name && id === `${namespace}/${name}`
        && (work === null ? receipt.scope === "aggregate" : receipt.work_id === work)
        && ["work", "aggregate"].includes(receipt.scope)
        && (receipt.scope !== "work" || typeof receipt.work_id === "string")
        && (receipt.work_id === null || /^WRK-[A-Za-z0-9-]+$/.test(receipt.work_id))
        && ["work", "code", "readiness", "merge", "release"].includes(receipt.gate)
        && [undefined, null, "check_inputs"].includes(receipt.fingerprint_scope), "native receipt namespace, gate or owning path differs");
      if (result.has(id)) throw new Error(`duplicate final receipt id: ${id}`);
      if (receipt.work_id) workIds.add(receipt.work_id);
      result.set(id, relative);
    }
  }
  if (workIds.size && await optionalFile(snapshot, "runtime/db.sqlite")) {
    const runId = path.basename(runtime), projectId = path.basename(path.dirname(path.dirname(runtime)));
    await withFrozenRuntimeDatabase(snapshot, db => {
      // Old snapshots may predate retained Work authority; consumed proof still
      // follows its legacy contract. Modern catalogs cannot claim a foreign Work.
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='works'").get()) return;
      for (const workId of workIds) ensure(db.prepare("SELECT 1 FROM works WHERE work_id = ? AND project_id = ? AND run_id = ?").get(workId, projectId, runId), "receipt catalog contains a foreign Work");
    });
  }
  return result;
}
