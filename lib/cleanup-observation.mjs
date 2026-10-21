import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readRegularFile } from './regular-file.mjs';
import { assertRecoverySnapshotVersion } from './recovery-safety.mjs';
import { isStandardRunSnapshot } from './snapshot-version.mjs';

// Independent read snapshots grant neither productive nor finalization rights.
export async function cleanupObservation({ root, manifest, results, live, report, reportState }) {
  const canonicalRoot = await realpath(root);
  const executions = await Promise.all(manifest.executions.map(async execution => {
    const result = results.find(item => item.execution === execution.id);
    const observed = live?.executions?.find(item => item.execution === execution.id);
    const item = { execution: execution.id, physical: 'unknown', capture: 'unknown', reason: 'binding_unavailable', evidence_refs: [] };
    const attempt = path.join(root, 'executions', execution.id);
    if (path.dirname(attempt) !== path.join(root, 'executions')) return item;
    try {
      const bindingFile = path.join(attempt, 'managed-runtime.json');
      let binding;
      try { binding = JSON.parse(await readRegularFile(bindingFile)); }
      catch (error) {
        if (error.code === 'ENOENT' && result?.state === 'failed' && !result.run_id && !result.session_id && !result.lifecycle?.run_id && !result.recovery?.run_id) {
          return { ...item, physical: 'not_applicable', capture: 'not_applicable', reason: 'failed_before_native_binding' };
        }
        throw error;
      }
      const project = path.join(attempt, 'project'), runtime = path.join(attempt, 'dd-flow-home');
      if (binding.schema_id !== 'dd-eval/managed-runtime@1' || binding.project_root !== project || binding.runtime_root !== runtime
        || !binding.run_id || [result?.run_id, result?.lifecycle?.run_id, result?.recovery?.run_id].filter(value => value != null).some(value => value !== binding.run_id)
        || observed?.unavailable || observed?.run_id !== binding.run_id || observed.receipt?.scope?.run_id !== binding.run_id) return item;
      for (const file of [bindingFile, project, runtime]) if (await realpath(file) !== path.resolve(canonicalRoot, path.relative(root, file))) throw new Error('noncanonical_binding_path');
      const receipt = observed.receipt, control = receipt.control;
      item.evidence_refs.push(bindingFile);
      if (control && (control.current !== true || result?.recovery?.control_id && (result.recovery.control_id !== control.control_id
        || result.recovery.recovery_id !== control.recovery_id || result.recovery.generation !== control.generation))) return { ...item, reason: 'control_binding_changed' };
      // An unrequested control has settled:false even after normal completion;
      // it describes control settlement, not a physical liveness observation.
      item.physical = receipt.settled === true ? 'settled' : control && receipt.settled === false ? 'live' : 'unknown';
      item.capture = 'pending'; item.reason = 'capture_not_sealed';
      if (item.physical === 'settled' && !control && result?.state === 'candidate_ready' && result.candidate?.manifest && result.candidate.manifest_sha256) {
        const file = result.candidate.manifest, relative = path.relative(root, file);
        if (!path.isAbsolute(file) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
          || await realpath(file) !== path.resolve(canonicalRoot, relative)) throw new Error('candidate_path_unowned');
        const bytes = await readRegularFile(file), snapshot = JSON.parse(bytes), hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== result.candidate.manifest_sha256 || !isStandardRunSnapshot(snapshot)
          || !['candidate', 'stage_entry'].includes(snapshot.purpose) || snapshot.run_id !== binding.run_id
          || snapshot.project_root !== project || snapshot.dd_flow_home !== runtime) throw new Error('candidate_binding_invalid');
        return { ...item, capture: 'ready', reason: 'settled_candidate_verified', evidence_refs: [...item.evidence_refs, file], manifest_sha256: hash };
      }
      if (item.physical !== 'settled' || control?.admission !== 'sealed' || !control.control_id || !control.recovery_id
        || !Number.isSafeInteger(control.generation) || !control.capture_path) return item;
      const capture = control.capture_path, allowed = manifest.runtime_recovery_home ?? path.join(runtime, 'recovery');
      const relative = path.relative(allowed, capture);
      if (manifest.runtime_recovery_home && allowed !== path.join(root, 'recovery')) throw new Error('recovery_home_unowned');
      if (!path.isAbsolute(capture) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
        || await realpath(capture) !== path.resolve(await realpath(allowed), relative)) throw new Error('capture_path_unowned');
      const file = path.join(capture, 'snapshot.json');
      if (await realpath(file) !== path.join(await realpath(capture), 'snapshot.json')) throw new Error('capture_path_unowned');
      const bytes = await readRegularFile(file), snapshot = JSON.parse(bytes), hash = createHash('sha256').update(bytes).digest('hex');
      if (!(isStandardRunSnapshot(snapshot) || snapshot.schema_id === 'dd-flow/eval-run-snapshot@6') || snapshot.purpose !== 'recovery' || snapshot.run_id !== binding.run_id
        || snapshot.recovery_id !== control.recovery_id || snapshot.project_root !== project || snapshot.dd_flow_home !== runtime
        || result?.recovery?.manifest_sha256 && result.recovery.manifest_sha256 !== hash) throw new Error('capture_binding_invalid');
      await assertRecoverySnapshotVersion(await realpath(capture), snapshot);
      return { ...item, capture: 'ready', reason: 'sealed_capture_verified', evidence_refs: [...item.evidence_refs, file], manifest_sha256: hash,
        control_id: control.control_id, recovery_id: control.recovery_id, generation: control.generation };
    } catch (error) { return { ...item, capture: 'unknown', reason: error.code ?? error.message }; }
  }));
  const aggregate = (field, done) => {
    const applicable = executions.filter(item => item[field] !== 'not_applicable');
    return !applicable.length ? 'not_applicable' : applicable.every(item => item[field] === done) ? done
      : applicable.some(item => item[field] === 'unknown') ? 'unknown' : field === 'physical' ? 'live' : 'pending';
  };
  return { schema_id: 'dd-eval/cleanup-observation@1', physical: aggregate('physical', 'settled'), capture: aggregate('capture', 'ready'),
    finalization: reportState === 'settled' && (!manifest.profile?.judge?.enabled || ['completed', 'failed', 'not_run_profile_mismatch'].includes(report?.judge_status)) ? 'completed'
      : reportState === 'blocked' ? 'blocked' : report?.unavailable ? 'unknown' : 'pending',
    reason: 'independent_physical_capture_report_observations', executions };
}
