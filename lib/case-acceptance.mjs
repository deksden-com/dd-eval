import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir, stat } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
export function validateVerificationMatrix(value) {
  // Keep the independent checker runnable from a frozen definition without node_modules.
  const object = item => Boolean(item) && typeof item === "object" && !Array.isArray(item);
  const string = item => typeof item === "string" && item.length > 0;
  const strings = item => Array.isArray(item) && item.every(value => typeof value === "string");
  const shape = (item, required, optional = []) => object(item) && required.every(key => Object.hasOwn(item, key)) && Object.keys(item).every(key => [...required, ...optional].includes(key));
  const ref = item => shape(item, ["root", "path", "sha256"]) && ["run", "workspace"].includes(item.root) && string(item.path) && !path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes("..") && /^[a-f0-9]{64}$/.test(item.sha256);
  const check = item => shape(item, ["id", "canonical_ref", "declaration", "result", "disposition"], ["reason"]) && string(item.id) && string(item.canonical_ref) && object(item.declaration) && (item.result === null || object(item.result)) && ["retained", "not_run", "not_due", "unavailable"].includes(item.disposition) && (item.reason === undefined || typeof item.reason === "string");
  ensure(shape(value, ["schema_id", "header", "sources", "requirements", "criteria", "policy_checks"], ["semantic_assessment"]) && value.schema_id === "dd-flow/verification-matrix@1", "verification matrix schema differs");
  const header = value.header;
  ensure(shape(header, ["project_id", "run_id", "stage", "stage_attempt", "role", "completeness", "source_fingerprint"], ["review_cycle", "merge"])
    && [header.project_id, header.run_id, header.stage, header.stage_attempt].every(string) && ["input", "output"].includes(header.role)
    && ["skeleton", "declared", "execution", "final"].includes(header.completeness) && /^[a-f0-9]{64}$/.test(header.source_fingerprint)
    && (header.review_cycle === undefined || typeof header.review_cycle === "string"), "verification matrix header schema differs");
  if (header.merge !== undefined) ensure(shape(header.merge, ["merge_request_id", "work_id", "gate_hash", "profile_hash", "accepted_tree", "acceptance_ref"])
    && [header.merge.merge_request_id, header.merge.work_id, header.merge.accepted_tree].every(item => typeof item === "string") && /^[a-f0-9]{64}$/.test(header.merge.gate_hash)
    && (header.merge.profile_hash === null || typeof header.merge.profile_hash === "string") && ref(header.merge.acceptance_ref), "verification matrix MERGE schema differs");
  ensure(Array.isArray(value.sources) && value.sources.every(item => shape(item, ["role", "root", "path", "sha256"]) && string(item.role) && ref({ root: item.root, path: item.path, sha256: item.sha256 })), "verification matrix source schema differs");
  ensure(Array.isArray(value.requirements) && value.requirements.every(item => shape(item, ["protocol_id", "id", "statement", "plan_items"])
    && [item.protocol_id, item.id, item.statement].every(value => typeof value === "string") && Array.isArray(item.plan_items)
    && item.plan_items.every(plan => shape(plan, ["id", "check_refs", "work_ids"]) && typeof plan.id === "string" && strings(plan.check_refs) && strings(plan.work_ids))), "verification matrix requirement schema differs");
  ensure(Array.isArray(value.criteria) && value.criteria.every(item => shape(item, ["protocol_id", "criterion_id", "statement", "gate", "check_refs", "declaration", "checks"])
    && [item.protocol_id, item.criterion_id, item.statement].every(value => typeof value === "string") && (item.gate === null || typeof item.gate === "string")
    && strings(item.check_refs) && (item.declaration === null || object(item.declaration)) && Array.isArray(item.checks) && item.checks.every(check)), "verification matrix criterion schema differs");
  ensure(Array.isArray(value.policy_checks) && value.policy_checks.every(check) && (value.semantic_assessment === undefined || ref(value.semantic_assessment)), "verification matrix policy schema differs");
  return value;
}

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, target) => target === root || target.startsWith(root + path.sep);
export function snapshotTreeHash(root) {
  const hash = createHash("sha256");
  const visit = (dir, relative) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile()) { hash.update(name); hash.update(fs.readFileSync(file)); }
      else if (entry.isSymbolicLink()) { hash.update(name); hash.update("symlink:" + fs.readlinkSync(file)); }
    }
  };
  visit(root, "");
  return hash.digest("hex");
}

async function ownedFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("invalid snapshot-relative evidence path");
  const file = path.resolve(root, relative);
  if ((await lstat(file)).isSymbolicLink()) throw new Error("symlinked evidence file is not a frozen document");
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
  if (policy?.case_id !== caseId || !["task-priority@1", "task-priority@2", "task-priority@3"].includes(policy?.checker)) throw new Error("unsupported case acceptance policy");
}

/** Mechanical, case-local facts only. Semantic adequacy remains with Final Judge. */
export async function checkCaseAcceptance({ evalRoot, execution, result, policy }) {
  validateCaseAcceptancePolicy(policy);
  if (["task-priority@2", "task-priority@3"].includes(policy?.checker)) return checkCaseAcceptanceV2({ evalRoot, execution, result, policy });
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
    if (data.schema_id !== "dd-flow/eval-run-snapshot@5" || data.purpose !== "candidate" || data.stage_entry !== null || data.run_id !== result.run_id) throw new Error("candidate snapshot identity differs");
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
    return { ...base, execution, status: "unavailable", checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null, facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message } };
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
  const generated = policy.checker === "task-priority@3";
  const base = { schema_id: "dd-eval/case-acceptance@1", checker: policy.checker, definition: policy };
  if (result.state !== "candidate_ready" || result.stage !== "merge") return { ...base, execution, status: "not_applicable", facts: {}, gaps: [] };
  const checkpoint = result.candidate;
  try {
    const boundaries = await realpath(path.join(evalRoot, "executions", execution, "boundaries"));
    const snapshot = await realpath(path.dirname(checkpoint.manifest));
    ensure(inside(boundaries, snapshot) && path.basename(checkpoint.manifest) === "snapshot.json", "candidate checkpoint is outside owned boundaries");
    const manifest = await ownedFile(snapshot, "snapshot.json");
    ensure(manifest.sha256 === checkpoint.manifest_sha256, "candidate snapshot manifest checksum differs");
    const data = parseJson(manifest);
    ensure(data.schema_id === "dd-flow/eval-run-snapshot@5" && data.purpose === "candidate" && data.stage_entry === null && data.run_id === result.run_id, "candidate snapshot identity differs");
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
      const receipt = parseJson(frozen);
      verifiedReceipts.set(saved.id, { receipt, frozen });
      ensure(receipt.id === saved.id && (generated ? ["passed", "failed", "aborted"].includes(receipt.status) : receipt.status === "passed") && receipt.scope === "aggregate"
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
      if (generated && receipt.status !== "passed") gaps.push(`final_check_${receipt.status}:${saved.id}`);
    }
    const generatedMatrix = generated ? await verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, gate, accepted, plans, byBinding, verifiedReceipts, specify, protocolize, protocols }) : null;
    const criteria = [];
    for (const item of plans) for (const criterion of item.criteria) {
      const refs = Array.isArray(criterion.check_refs) ? criterion.check_refs : [];
      if (!refs.length || !criterion.proof_limits?.length || !criterion.expected_evidence?.length) gaps.push(`criterion_contract_incomplete:${criterion.criterion_id}`);
      const checks = refs.map(id => {
        const receipt = byBinding.get(`${item.protocol_id}/${id}`);
        if (!receipt) gaps.push(`criterion_final_binding_missing:${item.protocol_id}:${criterion.criterion_id}:${id}`);
        return { id, receipt_id: receipt?.id ?? null, status: receipt?.status ?? "missing", input_hash: receipt?.input_hash ?? null };
      });
      criteria.push({ protocol_id: item.protocol_id, id: criterion.criterion_id, checks, proof_limits: criterion.proof_limits, expected_evidence: criterion.expected_evidence });
    }
    const content = Object.fromEntries(consumed.sort((a, b) => a.path.localeCompare(b.path)).map(item => [item.path, item.sha256]));
    return { ...base, execution, status: gaps.length ? "failed" : "passed", checkpoint_manifest_sha256: manifest.sha256,
      facts: { scenario_status: scenarioStatus, matrix_rows: matrixFacts, criteria, consumed_sha256: content, ...(generated ? { verification_matrix: generatedMatrix } : {}) }, gaps: unique(gaps) };
  } catch (error) {
    return { ...base, execution, status: "unavailable", checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null,
      facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message } };
  }
}

async function verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, gate, accepted, plans, byBinding, verifiedReceipts, specify, protocolize, protocols }) {
  const index = await read(`${runtime}/run.json`);
  ensure(index.verification_matrix_contract === "dd-flow/verification-matrix@1", "RUN has no retained verification matrix contract");
  const binding = mergeReport.semantic?.verification_matrix;
  ensure(binding?.contract === index.verification_matrix_contract && binding.role === "output" && binding.completeness === "final", "MERGE final matrix binding is unavailable");
  const json = await ownedFile(snapshot, `${runtime}/${binding.json?.path}`);
  const markdown = await ownedFile(snapshot, `${runtime}/${binding.markdown?.path}`);
  ensure(json.sha256 === binding.json.sha256 && markdown.sha256 === binding.markdown.sha256, "MERGE matrix packet checksum differs");
  consumed.push(json, markdown);
  const matrix = validateVerificationMatrix(parseJson(json));
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
  for (const source of matrix.sources) {
    const relative = source.root === "run" ? `${runtime}/${source.path}` : `workspace/${source.path}`;
    const file = await ownedFile(snapshot, relative); consumed.push(file);
    ensure(file.sha256 === source.sha256, "matrix source checksum differs");
    sourceMap.set(`${source.root}:${source.path}`, source.sha256);
  }
  ensure(merged.acceptance_ref.root === "run" && merged.acceptance_ref.path === "07-merge/merge-gate-acceptance.json"
    && sourceMap.get(`run:${merged.acceptance_ref.path}`) === merged.acceptance_ref.sha256, "matrix final acceptance source is unavailable");
  for (const relative of ["01-specify/specify.json", "02-protocolize/protocolize-result.json", "02-protocolize/stage-report.json", "03-plan/code-work-batch.json", "07-merge/merge-gate.json"]) {
    const file = await ownedFile(snapshot, `${runtime}/${relative}`);
    ensure(sourceMap.get(`run:${relative}`) === file.sha256, "matrix retained authority source is unavailable");
  }
  for (const item of plans) ensure(matrix.sources.some(source => source.role === `plan:${item.protocol_id}` && source.sha256 === item.source.sha256),
    "matrix accepted PLAN source differs");
  const expectedCriteria = plans.flatMap(item => item.criteria.map(criterion => `${item.protocol_id}/${criterion.criterion_id}`));
  const effectiveStatements = new Map([...(specify.requirements ?? []), ...(specify.acceptance_criteria ?? [])].map(item => [item.id, item.statement]));
  for (const amendment of protocolize.obligation_amendments ?? []) effectiveStatements.set(amendment.target_id, amendment.replacement);
  const actualCriteria = matrix.criteria.map(item => `${item.protocol_id}/${item.criterion_id}`);
  ensure(unique(actualCriteria).length === actualCriteria.length && same(expectedCriteria, actualCriteria), "matrix criterion coverage differs");
  const expectedRequirements = plans.flatMap(item => {
    const member = protocolize.delivery.members[protocols.indexOf(item.protocol_id)].key;
    return (specify.requirements ?? []).filter(requirement => protocolize.obligation_ownership.some(owner => owner.obligation_id === requirement.id && owner.member_keys.includes(member)))
      .map(requirement => ({ protocol_id: item.protocol_id, id: requirement.id, statement: effectiveStatements.get(requirement.id), plan_items: (item.value.items ?? []).filter(planItem => planItem.requirement_refs?.includes(requirement.id)).map(planItem => ({ id: planItem.id, check_refs: sorted(unique(planItem.verification.check_refs)) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }));
  });
  const actualRequirements = matrix.requirements.map(row => ({ ...row, plan_items: row.plan_items.map(({ work_ids, ...item }) => item) }));
  ensure(same(actualRequirements.map(row => `${row.protocol_id}/${row.id}`), expectedRequirements.map(row => `${row.protocol_id}/${row.id}`))
    && unique(actualRequirements.map(row => `${row.protocol_id}/${row.id}`)).length === actualRequirements.length, "matrix requirement coverage differs");
  for (const row of actualRequirements) ensure(matrixCanonical(row) === matrixCanonical(expectedRequirements.find(item => item.protocol_id === row.protocol_id && item.id === row.id)), "matrix requirement PLAN linkage differs");
  const assertCheck = check => {
    const saved = byBinding.get(check.canonical_ref);
    ensure(saved, `matrix check has no accepted target binding: ${check.canonical_ref}`);
    const proof = verifiedReceipts.get(saved.id);
    ensure(check.disposition === "retained" && check.result?.id === saved.id && check.result.status === proof.receipt.status
      && check.result.input_hash === saved.input_hash && check.result.verification_epoch === proof.receipt.verification_epoch
      && same(check.result.check_refs ?? [], proof.receipt.check_refs), "matrix check result differs from frozen receipt");
    ensure([...sourceMap].some(([key, hash]) => key === `run:${path.relative(runtime, proof.frozen.path)}` && hash === proof.frozen.sha256), "matrix receipt source is unavailable");
  };
  const semanticRefs = new Set();
  for (const row of matrix.criteria) {
    const criterion = plans.find(item => item.protocol_id === row.protocol_id).criteria.find(item => item.criterion_id === row.criterion_id);
    ensure(row.statement === effectiveStatements.get(row.criterion_id) && row.gate === (criterion.gate ?? null)
      && same(row.check_refs, criterion.check_refs ?? []) && same(row.checks.map(item => item.id), criterion.check_refs ?? [])
      && unique(row.checks.map(item => item.id)).length === row.checks.length
      && matrixCanonical(row.declaration) === matrixCanonical(criterion), "matrix criterion declaration differs");
    for (const check of row.checks) {
      ensure(check.canonical_ref === `${row.protocol_id}/${check.id}`, "matrix criterion binding identity differs");
      const declaration = plans.find(item => item.protocol_id === row.protocol_id).value.checks?.find(item => item.id === check.id);
      if (declaration) ensure(matrixCanonical(check.declaration) === matrixCanonical({ ...declaration, canonical_ref: check.canonical_ref }), "matrix check declaration differs from accepted PLAN");
      semanticRefs.add(check.canonical_ref); assertCheck(check);
    }
  }
  const policyRefs = gate.checks.map(check => check.canonical_ref ?? check.id).filter(ref => !semanticRefs.has(ref));
  ensure(same(matrix.policy_checks.map(check => check.canonical_ref), policyRefs)
    && unique(matrix.policy_checks.map(check => check.canonical_ref)).length === matrix.policy_checks.length, "matrix policy-only gate coverage differs");
  for (const check of matrix.policy_checks) {
    const declaration = gate.checks.find(item => (item.canonical_ref ?? item.id) === check.canonical_ref);
    ensure(matrixCanonical(check.declaration) === matrixCanonical(declaration), "matrix policy declaration differs from frozen gate");
    assertCheck(check);
  }
  ensure(verificationMatrixFingerprint(matrix) === header.source_fingerprint, "matrix source fingerprint differs");
  return { contract: binding.contract, json: { path: json.path, sha256: json.sha256 }, markdown: { path: markdown.path, sha256: markdown.sha256 }, source_fingerprint: header.source_fingerprint };
}

export function verificationMatrixFingerprint(matrix) {
  const { source_fingerprint, ...header } = matrix.header;
  const facts = new Map([...matrix.criteria.flatMap(row => row.checks), ...matrix.policy_checks].map(check => [check.canonical_ref, check]));
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return digest(matrixCanonical({ header, sources: [...matrix.sources].sort((a, b) => compare(`${a.role}:${a.root}:${a.path}`, `${b.role}:${b.root}:${b.path}`)), facts: [...facts.values()].sort((a, b) => compare(a.canonical_ref, b.canonical_ref)) }));
}

function matrixCanonical(value) {
  const sorted = item => Array.isArray(item) ? item.map(sorted) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
  return JSON.stringify(sorted(value), null, 2) + "\n";
}

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

async function finalReceiptIndex(snapshot, runtime) {
  const result = new Map();
  const directoriesAt = async directory => {
    try {
      const info = await lstat(directory);
      ensure(info.isDirectory() && !info.isSymbolicLink() && inside(snapshot, await realpath(directory)), "receipt directory escaped frozen runtime");
      return await readdir(directory);
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  for (const stage of ["05-code", "06-code-review", "07-merge"]) {
    const root = path.join(snapshot, runtime, stage);
    const directories = [path.join(root, "checks")];
    for (const name of await directoriesAt(path.join(root, "works"))) {
      if (/^WRK-[A-Za-z0-9-]+$/.test(name)) directories.push(path.join(root, "works", name, "checks"));
    }
    for (const directory of directories) for (const name of await directoriesAt(directory)) {
      if (!/^RCP-[0-9]+$/.test(name)) continue;
      const relative = path.relative(snapshot, path.join(directory, name, "receipt.json"));
      const id = directory.endsWith(`${path.sep}checks`) && path.basename(path.dirname(directory)) === "works"
        ? name : directory.includes(`${path.sep}works${path.sep}`) ? `${path.basename(path.dirname(directory))}/${name}` : name;
      if (result.has(id)) throw new Error(`duplicate final receipt id: ${id}`);
      result.set(id, relative);
    }
  }
  return result;
}
