import path from "node:path";
import { realpath } from "node:fs/promises";
import { browserCapabilityDiagnostic } from "../browser-capabilities.mjs";
import { assertRecoverySnapshotVersion, resolveBoundSnapshot, withFrozenRuntimeDatabase } from "../recovery/recovery-safety.mjs";
import { snapshotTreeHash } from "../recovery/snapshot-tree.mjs";
import { validateCheckCompletion } from "../verification-matrix-checks.mjs";
import { finalReceiptIndex } from "./final-receipt-index.mjs";
import { ownedFile, optionalFile, inside } from "./frozen-evidence.mjs";
import { validateFrozenReceiptScope, validateScopedInputManifest } from "./frozen-authority.mjs";

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const parseJson = file => JSON.parse(file.text);
const unique = values => [...new Set(values)];

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

/** Verify failed check receipts and evidence from the frozen recovery capture. */
export async function failedCheckEvidence({ evalRoot, execution, result, base, selection = null }) {
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
