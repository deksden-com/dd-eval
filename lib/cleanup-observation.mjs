import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readRegularFile } from './regular-file.mjs';
import { retirementProofMatches } from './eval-retirement.mjs';
import { executionSnapshotBinding, observeBoundSnapshot, runPhysicalStopped } from './snapshot-observation.mjs';

// Reuse the all-role proof only against the current fenced inventory. This
// observation grants neither productive nor finalization rights.
export async function hasRetainedRetirementProof({ root, manifest, live, maintenance = [] }) {
  const canonicalRoot = await realpath(root);
  if (maintenance.length && !live?.inventory?.unavailable && Array.isArray(live?.inventory?.provider_turns) && live.inventory.provider_turns.length === 0) {
    try {
      const manifestSha256 = createHash('sha256').update(await readRegularFile(path.join(root, 'manifest.json'))).digest('hex');
      const resourceHome = await realpath(manifest.runtime_resource_home);
      return maintenance.some(saved => retirementProofMatches(saved, { root: canonicalRoot, manifest, manifestSha256, resourceHome, inventory: live.inventory }));
    } catch { /* Missing or foreign retirement evidence grants no physical conclusion. */ }
  }
  return false;
}

// Independent read snapshots grant neither productive nor finalization rights.
export async function cleanupObservation({ root, manifest, results, live, report, reportState, maintenance = [], retiredScope }) {
  retiredScope ??= await hasRetainedRetirementProof({ root, manifest, live, maintenance });
  const executions = await Promise.all(manifest.executions.map(async execution => {
    const result = results.find(item => item.execution === execution.id);
    const observed = live?.executions?.find(item => item.execution === execution.id);
    const item = { execution: execution.id, physical: 'unknown', capture: 'unknown', reason: 'binding_unavailable', evidence_refs: [] };
    const attempt = path.join(root, 'executions', execution.id);
    if (path.dirname(attempt) !== path.join(root, 'executions')) return item;
    try {
      const bindingFile = path.join(attempt, 'managed-runtime.json');
      let binding;
      try { ({ binding } = await executionSnapshotBinding(root, execution.id, result)); }
      catch (error) {
        if (error.code === 'ENOENT' && result?.state === 'failed' && !result.run_id && !result.session_id && !result.lifecycle?.run_id && !result.recovery?.run_id) {
          return { ...item, physical: 'not_applicable', capture: 'not_applicable', reason: 'failed_before_native_binding' };
        }
        throw error;
      }
      if (observed?.unavailable || observed?.run_id !== binding.run_id || observed.receipt?.scope?.run_id !== binding.run_id) return item;
      const receipt = observed.receipt, control = receipt.control;
      item.evidence_refs.push(bindingFile);
      if (control && (control.current !== true || result?.recovery?.control_id && (result.recovery.control_id !== control.control_id
        || result.recovery.recovery_id !== control.recovery_id || result.recovery.generation !== control.generation))) return { ...item, reason: 'control_binding_changed' };
      // An unrequested control has settled:false even after normal completion;
      // it describes control settlement, not a physical liveness observation.
      // Native settlement can remain unknown after every physical owner stopped.
      // In particular settled:false is not a positive process-liveness receipt.
      const resourceHome = typeof manifest.runtime_resource_home === 'string' ? await realpath(manifest.runtime_resource_home).catch(() => null) : null;
      item.physical = retiredScope || runPhysicalStopped({ receipt, binding, inventory: live?.inventory, resourceHome, scopeId: manifest.run_id }) ? 'settled' : 'unknown';
      const capture = await observeBoundSnapshot({ root, manifest, result, binding, receipt });
      return { ...item, ...capture, evidence_refs: [...item.evidence_refs, ...(capture.evidence_refs ?? [])] };
    } catch (error) { return { ...item, capture: 'unknown', reason: error.details?.reason ?? error.code ?? error.message }; }
  }));
  const aggregate = (field, done) => {
    const applicable = executions.filter(item => item[field] !== 'not_applicable');
    return !applicable.length ? 'not_applicable' : applicable.every(item => item[field] === done) ? done
      : applicable.some(item => item[field] === 'unknown') ? 'unknown' : field === 'physical' ? 'live' : 'pending';
  };
  return { schema_id: 'dd-eval/cleanup-observation@1', physical: aggregate('physical', 'settled'), capture: aggregate('capture', 'ready'),
    finalization: ['completed', 'completed_with_failures', 'finished', 'cancelled'].includes(report?.state) && report?.assessment_state !== 'pending' ? 'completed'
      : report?.unavailable ? 'unknown' : 'pending',
    reason: 'independent_physical_capture_report_observations', executions };
}
