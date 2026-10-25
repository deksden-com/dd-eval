import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readRegularFile } from './regular-file.mjs';
import { assertRecoverySnapshotVersion } from './recovery-safety.mjs';
import { isStandardRunSnapshot } from './snapshot-version.mjs';

const invalid = (reason, code = 'snapshot_binding_invalid') => { throw Object.assign(new Error(reason), { code, details: { reason } }); };
const inside = (root, file) => file !== root && !path.relative(root, file).split(path.sep).includes('..') && !path.isAbsolute(path.relative(root, file));

export async function executionSnapshotBinding(root, execution, result) {
  const canonical = await realpath(root), attempt = path.join(root, 'executions', execution);
  if (path.dirname(attempt) !== path.join(root, 'executions')
    || result?.attempt != null && (typeof result.attempt !== 'string' || path.resolve(result.attempt) !== path.resolve(attempt))) invalid('execution_path_unowned', 'execution_scope_invalid');
  const file = path.join(attempt, 'managed-runtime.json');
  if ((await lstat(file)).isSymbolicLink() || await realpath(file) !== path.resolve(canonical, path.relative(root, file))) invalid('noncanonical_binding_path');
  const binding = JSON.parse(await readRegularFile(file));
  if (binding.schema_id !== 'dd-eval/managed-runtime@1' || typeof binding.run_id !== 'string' || !binding.run_id
    || binding.project_root !== path.join(attempt, 'project') || binding.runtime_root !== path.join(attempt, 'dd-flow-home')
    || [result?.run_id, result?.lifecycle?.run_id, result?.recovery?.run_id].filter(value => value != null).some(value => value !== binding.run_id)) invalid('execution_binding_invalid', 'execution_scope_invalid');
  for (const target of [file, binding.project_root, binding.runtime_root]) {
    const actual = await realpath(target).catch(error => invalid(`binding_path_unavailable:${error.code}`));
    if (actual !== path.resolve(canonical, path.relative(root, target))) invalid('noncanonical_binding_path');
  }
  return { binding, file };
}

// Snapshot publication and physical retirement are independent. Callers own
// current readback/fencing and admission; this reader never stops or resumes work.
export async function observeBoundSnapshot({ root, manifest, result, binding, receipt }) {
  if (receipt?.scope?.run_id !== binding.run_id) invalid('snapshot_scope_invalid');
  const control = receipt.control;
  if (control && (control.current !== true || result?.recovery?.control_id && (result.recovery.control_id !== control.control_id
    || result.recovery.recovery_id !== control.recovery_id || result.recovery.generation !== control.generation))) invalid('control_binding_changed');
  let file, expectedHash;
  if (!control && result?.state === 'candidate_ready' && result.candidate?.manifest && result.candidate.manifest_sha256) {
    file = result.candidate.manifest; expectedHash = result.candidate.manifest_sha256;
    if (!path.isAbsolute(file) || !inside(path.resolve(root), path.resolve(file))) invalid('candidate_path_unowned');
  } else {
    if (receipt.settled !== true) return { capture: 'pending', reason: 'native_settlement_pending' };
    if (control?.admission !== 'sealed' || !control.control_id || !control.recovery_id
      || !Number.isSafeInteger(control.generation) || control.generation <= 0 || !control.capture_path) return { capture: 'pending', reason: 'capture_not_sealed' };
    const allowed = manifest.runtime_recovery_home ?? path.join(binding.runtime_root, 'recovery');
    if (manifest.runtime_recovery_home && allowed !== path.join(root, 'recovery')) invalid('recovery_home_unowned');
    if (!path.isAbsolute(control.capture_path) || path.resolve(allowed) !== path.resolve(control.capture_path)
      && !inside(path.resolve(allowed), path.resolve(control.capture_path))) invalid('capture_path_unowned');
    file = path.join(control.capture_path, 'snapshot.json'); expectedHash = result?.recovery?.manifest_sha256;
  }
  const owner = await realpath(root), relative = path.relative(path.resolve(root), path.resolve(file)), resolved = path.resolve(owner, relative);
  if (!inside(owner, resolved)) invalid('snapshot_path_unowned');
  for (let current = resolved; current !== owner; current = path.dirname(current)) if ((await lstat(current)).isSymbolicLink()) invalid('snapshot_path_symlink');
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes;
  try {
    const before = await handle.stat(), limit = 2 * 1024 * 1024;
    if (!before.isFile() || before.size > limit) invalid('snapshot_not_bounded_regular_file');
    const buffer = Buffer.alloc(before.size + 1); let length = 0;
    for (;;) { const read = await handle.read(buffer, length, buffer.length - length, length); if (!read.bytesRead) break; length += read.bytesRead; if (length === buffer.length) invalid('snapshot_changed_during_read'); }
    const after = await handle.stat(), current = await lstat(resolved);
    if (length !== before.size || before.dev !== current.dev || before.ino !== current.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) invalid('snapshot_changed_during_read');
    bytes = buffer.subarray(0, length);
  } finally { await handle.close(); }
  const snapshot = JSON.parse(bytes), hash = createHash('sha256').update(bytes).digest('hex');
  if (expectedHash && expectedHash !== hash) invalid('snapshot_hash_changed');
  if (snapshot.run_id !== binding.run_id || snapshot.project_root !== binding.project_root || snapshot.dd_flow_home !== binding.runtime_root
    || receipt.scope.project_id && snapshot.project_id && receipt.scope.project_id !== snapshot.project_id) invalid('snapshot_binding_invalid');
  if (!control) {
    if (!isStandardRunSnapshot(snapshot) || !['candidate', 'stage_entry'].includes(snapshot.purpose)) invalid('candidate_binding_invalid');
    return { capture: 'ready', reason: 'settled_candidate_verified', evidence_refs: [file], manifest_sha256: hash };
  }
  if (!(isStandardRunSnapshot(snapshot) || snapshot.schema_id === 'dd-flow/eval-run-snapshot@6')
    || snapshot.purpose !== 'recovery' || snapshot.recovery_id !== control.recovery_id) invalid('capture_binding_invalid');
  if (snapshot.consistency !== 'sealed_writer_barrier_required' || snapshot.restorable !== 'same-runtime-or-explicit-restore') invalid('capture_consistency_invalid');
  await assertRecoverySnapshotVersion(path.dirname(resolved), snapshot);
  return { capture: 'ready', reason: 'sealed_capture_verified', evidence_refs: [file], manifest_sha256: hash,
    control_id: control.control_id, recovery_id: control.recovery_id, generation: control.generation,
    consistency: snapshot.consistency };
}

/** Same binding as engine managedProcessBinding; state/time alone is no proof.
 * A RUN stop excludes the EVAL observer and later Judge's separate resources. */
export function runPhysicalStopped({ receipt, binding, inventory, resourceHome, scopeId }) {
  if (receipt?.scope?.run_id !== binding.run_id) return false;
  if (receipt.control && receipt.control.current !== true) return false;
  if (receipt.physical_stopped === true) return true; // Retained explicit owner proof.
  if (receipt.settled !== true || receipt.control?.current !== true || receipt.control.admission !== 'sealed'
    || receipt.control.settlement?.settled !== true || !Array.isArray(receipt.control.settlement.process_bindings)
    || inventory?.unavailable || inventory?.ok === false || inventory?.scope_id !== scopeId || !scopeId
    || !Array.isArray(inventory?.processes) || !Array.isArray(inventory?.provider_turns)
    || typeof resourceHome !== 'string') return false;
  const records = [];
  for (const record of inventory.processes) {
    let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { return false; }
    if (metadata?.budget?.scope_id !== scopeId) return false;
    if (record.kind === 'eval-observer' && record.owner_id === scopeId && metadata.role === 'observer' && !record.run_id) continue;
    const evalRoot = path.dirname(path.dirname(path.dirname(binding.runtime_root)));
    if (metadata.role === 'judge' && typeof metadata.state_dir === 'string' && path.isAbsolute(metadata.state_dir)) {
      const parts = path.relative(evalRoot, metadata.state_dir).split(path.sep);
      const judgeRoot = parts[0] === 'judge' || parts[0] === 'executions' && parts[2] === 'interaction-judge';
      if (judgeRoot && !parts.includes('..') && record.owner_id === `judge:${createHash('sha256').update(metadata.state_dir).digest('hex')}`) continue; // Separate bound Judge cleanup authority.
    }
    if (record.kind === 'eval-baseline' && record.owner_id === scopeId && metadata.role === 'probe' && !record.run_id && ['stopped', 'failed'].includes(record.state)) continue;
    const homes = path.dirname(path.dirname(binding.runtime_root));
    if (record.run_id && typeof metadata.dd_flow_home === 'string' && path.isAbsolute(metadata.dd_flow_home)
      && metadata.dd_flow_home !== binding.runtime_root && path.basename(metadata.dd_flow_home) === 'dd-flow-home'
      && path.dirname(path.dirname(metadata.dd_flow_home)) === homes) continue;
    if (record.run_id !== binding.run_id && metadata.dd_flow_home !== binding.runtime_root) {
      if (!record.run_id) return false;
      continue;
    }
    if (record.kind === 'run-control' && record.owner_id === receipt.control.control_id && metadata.control_id === receipt.control.control_id) continue;
    records.push(record);
  }
  if (inventory.provider_turns.some(turn => !turn.run_id || turn.run_id === binding.run_id)) return false;
  return records.every(record => {
    let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { return false; }
    if (record.run_id !== binding.run_id || receipt.scope.project_id && record.project_id !== receipt.scope.project_id
      || metadata.dd_flow_home !== binding.runtime_root || !['stopped', 'failed'].includes(record.state)) return false;
    const registration = createHash('sha256').update(JSON.stringify([resourceHome, record.id, record.kind, record.owner_id, record.lease_token,
      record.pid, record.pid_started_at, record.project_id, record.run_id, record.work_id, record.check_id, record.operation_id, record.metadata_json])).digest('hex');
    return receipt.control.settlement.process_bindings.some(proof => proof.resource_home === resourceHome && proof.process_id === record.id && proof.registration_sha256 === registration);
  });
}
