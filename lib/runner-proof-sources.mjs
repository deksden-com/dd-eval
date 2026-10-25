import path from 'node:path';
import { createHash } from 'node:crypto';

// Prefetch only reports and sidecars referenced by runner contracts. Opaque
// debug artifacts remain catalogued/hash-checked by the surrounding reader.
export async function loadRunnerProofSources(matrix, proofs, readSource) {
  const invalid = (reason, report = null) => { throw Object.assign(new Error('Retained runner proof source is invalid'), { code: 'runner_proof_invalid', details: { reason, ...(report ? { report: String(report).slice(0, 256) } : {}) } }); };
  const bytes = new Map(), pending = [];
  for (const proof of proofs) {
    const receipt = proof.value;
    if (receipt?.runner_evidence_required && receipt.scope === 'aggregate') {
      pending.push({ root: path.posix.join(path.posix.dirname(proof.path), 'artifacts'), ref: { relative_path: receipt.runner_evidence_required.path }, report: true, depth: 0 });
    }
  }
  let consumed = 0, reports = 0;
  while (pending.length) {
    const item = pending.pop(), relative = item.ref?.relative_path;
    if (typeof relative !== 'string' || path.posix.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => ['', '.', '..'].includes(part))) invalid('unsafe_proof_path');
    const file = path.posix.join(item.root, relative), key = `run:${file}`;
    const source = matrix.sources.find(source => source.root === 'run' && source.path === file && source.role.startsWith('artifact:'));
    if (!source || item.ref.sha256 && item.ref.sha256 !== source.sha256) invalid('missing_or_changed_source', file);
    if (bytes.has(key)) continue;
    let value;
    try { value = await readSource(source); } catch { invalid('source_unavailable', file); }
    if (!Buffer.isBuffer(value)) invalid('source_not_bytes', file);
    consumed += value.length;
    if (value.length > (item.report ? 1024 * 1024 : 2 * 1024 * 1024) || consumed > 128 * 1024 * 1024) invalid('proof_budget_exceeded', file);
    if (createHash('sha256').update(value).digest('hex') !== source.sha256) invalid('source_checksum_mismatch', file);
    bytes.set(key, value);
    if (!item.report) continue;
    if (++reports > 64 || item.depth > 4) invalid('proof_budget_exceeded', file);
    let report;
    try { report = JSON.parse(value); } catch { invalid('report_json_invalid', file); }
    if (!report || typeof report !== 'object' || Array.isArray(report) || !Array.isArray(report.failures ?? []) || !Array.isArray(report.steps ?? [])) invalid('report_shape_invalid', file);
    const root = path.posix.dirname(file);
    for (const step of report.steps ?? []) if (step.report) pending.push({ root, ref: step.report, report: true, depth: item.depth + 1 });
    for (const failure of report.failures ?? []) {
      if (failure.child_evidence) continue; // Already covered by its bound step.
      const proof = failure.repair_evidence;
      for (const ref of [failure.diagnostic_artifact, proof?.native_artifact, proof?.worker_snapshot, proof?.native_result]) if (ref) pending.push({ root, ref, report: false, depth: item.depth });
    }
  }
  return bytes;
}
