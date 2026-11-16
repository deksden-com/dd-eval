import { createHash } from "node:crypto";
import path from "node:path";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

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

export function isVerificationMatrixTextSource(source) {
  return source.role === "accepted_intake" || source.role.startsWith("accepted_hitl:");
}

export function verificationMatrixFingerprint(matrix) {
  const { source_fingerprint, ...header } = matrix.header;
  const facts = new Map([...matrix.criteria.flatMap(row => row.checks), ...matrix.policy_checks].map(check => [check.canonical_ref, check]));
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return digest(matrixCanonical({ header, sources: [...matrix.sources].sort((a, b) => compare(`${a.role}:${a.root}:${a.path}`, `${b.role}:${b.root}:${b.path}`)), facts: [...facts.values()].sort((a, b) => compare(a.canonical_ref, b.canonical_ref)) }));
}

export function matrixCanonical(value) {
  const sorted = item => Array.isArray(item) ? item.map(sorted) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
  return JSON.stringify(sorted(value), null, 2) + "\n";
}
