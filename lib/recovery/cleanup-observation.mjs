import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readRegularFile } from '../regular-file.mjs';
import { retirementProofMatches } from '../eval-retirement.mjs';
import { executionSnapshotBinding, observeBoundSnapshot, runPhysicalStopped } from './snapshot-observation.mjs';
import { hashJson } from '../runner-events.mjs';
import { processSnapshot } from '../process-snapshot.mjs';
import { assertNativeResourceRetired } from '../judge-cleanup.mjs';

/**
 * Match retained retirement proof against the current fenced inventory.
 * @param {object} input EVAL root, manifest, live inventory and maintenance records.
 * @returns {Promise<boolean>} Whether the retained proof matches; grants no admission rights.
 */
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

/**
 * Project independent physical, capture and report observations.
 * @param {object} input EVAL manifest, results, live inventory and report state.
 * @returns {Promise<object>} Cleanup observation; grants no finalization rights.
 */
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

/**
 * Determine whether owned scope resources lack physical retirement proof.
 * @param {object} inventory Scoped resource inventory.
 * @param {string} scopeId Expected EVAL scope.
 * @param {object} options Observed processes and proven retired resource IDs.
 * @returns {boolean} True when any resource is live or its status is unknown.
 */
export function scopeResourcesPending(inventory, scopeId, { processes = null, retiredIds = new Set() } = {}) {
  if (inventory?.scope_id !== scopeId || inventory.unavailable || inventory.ok === false
    || !Array.isArray(inventory.processes) || !Array.isArray(inventory.provider_turns)) return true;
  if (inventory.provider_turns.length) return true;
  return inventory.processes.some(record => {
    if (record.kind === 'eval-observer' && record.owner_id === scopeId) return false;
    if (!['stopped', 'failed'].includes(record.state) || !Array.isArray(processes)) return true;
    let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { return true; }
    const group = metadata.process_group_id;
    if (processes.some(item => !item.zombie && (item.pid === record.pid && (!record.pid_started_at || item.started === record.pid_started_at)
      || Number.isSafeInteger(group) && group > 0 && item.pgid === group))) return true;
    // Native children can survive a dead local bridge. Only its actual bound
    // shutdown proof retires that resource, including no-verdict Judges.
    if (metadata.state_dir || metadata.role === 'judge' || /daemon|provider/.test(record.kind)) return !retiredIds.has(record.id);
    return !(Number.isSafeInteger(group) && group > 0); // No owned tree boundary: unknown, not stopped.
  });
}
/**
 * Collect physical process observations and verify bound native retirement proofs.
 * @param {string} root EVAL root containing owned state directories.
 * @param {object} inventory Scoped resource inventory.
 * @param {string} scopeId Expected EVAL scope.
 * @returns {Promise<object>} Pending state, process snapshot and retired resource IDs.
 */
export async function observeScopeResources(root, inventory, scopeId) {
  const processes = await processSnapshot().catch(() => null), retiredIds = new Set();
  const canonicalRoot = await realpath(root), states = new Map();
  for (const record of inventory?.processes ?? []) {
    let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { continue; }
    if (!path.isAbsolute(metadata.state_dir ?? '')) continue;
    const directory = await realpath(metadata.state_dir).catch(() => null);
    if (!directory || path.relative(canonicalRoot, directory).split(path.sep).includes('..')) continue;
    if (!states.has(directory)) states.set(directory, await assertNativeResourceRetired(directory).catch(() => null));
    const state = states.get(directory), owner = state?.config?.runtime_owner;
    const binding = [state?.resource_process, state?.provider_process].find(item => item?.id === record.id && item.lease_token === record.lease_token);
    if (binding && owner?.budget?.scope_id === scopeId) retiredIds.add(record.id);
  }
  return { pending: scopeResourcesPending(inventory, scopeId, { processes, retiredIds }), processes, retiredIds };
}
/**
 * Resolve cleanup notes only when their bound resources have retirement proof.
 * @param {object[]} notes Existing technical notes.
 * @param {object} inventory Scoped resource inventory.
 * @param {string} scopeId Expected EVAL scope.
 * @param {object} proof Physical observations and retirement proof.
 * @returns {object[]} Projected notes; unproven notes remain unchanged.
 */
export function resolveRetiredTechnicalNotes(notes, inventory, scopeId, proof) {
  if (inventory?.scope_id !== scopeId || inventory.unavailable || inventory.ok === false || !Array.isArray(inventory.processes) || !Array.isArray(inventory.provider_turns)) return notes;
  return notes.map(note => {
    if (note.state !== 'open' || note.consequence !== 'cleanup_pending') return note;
    const resolved = bindings => ({ ...note, state: 'resolved', resolution_basis: 'scoped_physical_retirement',
      resource_binding_sha256: hashJson(bindings.map(record => [record.id, record.pid, record.pid_started_at])) });
    if (!note.source_run_id && ['execution_cleanup_pending', 'qualification_cleanup_pending'].includes(note.code)) return proof?.pending === false ? resolved(inventory.processes) : note;
    if (!note.source_run_id && !['judge_cleanup_pending', 'interaction_judge_cleanup_pending', 'baseline_registry_retirement_pending'].includes(note.code)) return note;
    const resource = note.resource_identity ?? note.diagnostic_reference;
    if (typeof resource !== 'string') return note;
    const matches = inventory.processes.filter(record => {
      if (note.source_run_id && record.run_id !== note.source_run_id) return false;
      let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { return false; }
      if (metadata.budget?.scope_id !== scopeId) return false;
      if (record.id === resource) return true; // Immutable registry identity, not a reused PID/path.
      const directoryMatches = metadata.state_dir === resource || note.code === 'interaction_judge_cleanup_pending' && typeof metadata.state_dir === 'string' && path.dirname(metadata.state_dir) === resource;
      const firstSeen = note.source_first_seen ?? note.first_seen;
      return directoryMatches && (!note.source_run_id || metadata.run_generation === note.generation)
        && Number.isFinite(Date.parse(firstSeen)) && Number.isFinite(Date.parse(record.started_at))
        && Date.parse(record.started_at) <= Date.parse(firstSeen);
    });
    if (!matches.length || !proof?.retiredScope && scopeResourcesPending({ scope_id: scopeId, processes: matches,
      provider_turns: inventory.provider_turns.filter(turn => matches.some(record => record.id === turn.process_id)) }, scopeId, proof)) return note;
    return resolved(matches);
  });
}
