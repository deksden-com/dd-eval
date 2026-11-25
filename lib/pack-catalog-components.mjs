import { createHash } from 'node:crypto';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { frozenFile, withFrozenRuntimeDatabase } from './recovery/frozen-evidence-io.mjs';
import { snapshotTreeHash, framedSnapshotTreeHash } from './recovery/snapshot-tree.mjs';
import { retainedPackComponentFingerprint } from './pack-component-fingerprint.mjs';
import { readPackInvocationObservations } from './pack-invocation-observations.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = message => { throw Object.assign(new Error(message), { code: 'pack_catalog_components_invalid' }); };

/** Compare the scopes actually retained by a catalog-bound assessment; completeness remains unknown. */
export async function assessPackCatalogComponents({ snapshot, snapshotSha256, history, targetRoot, targetManifestSha256 }) {
  if (history?.schema_id !== 'dd-eval/pack-catalog-history@1' || history.source.snapshot_sha256 !== snapshotSha256
    || Boolean(targetRoot) !== Boolean(targetManifestSha256) || targetRoot && (!path.isAbsolute(targetRoot) || !hex(targetManifestSha256)
      || await realpath(targetRoot) !== path.resolve(targetRoot))) return invalid('Catalog or target scope is invalid');
  const manifest = JSON.parse((await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).text);
  const relative = path.relative(manifest.dd_flow_home, manifest.pack_evidence.source_run_root);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return invalid('Catalog RUN root is invalid');
  const sourceRoot = path.join(snapshot, 'runtime', relative, 'flow-pack-bundle');
  const gaps = new Set(['full_producer_coverage_unavailable', 'forkability_unverified', 'target_execution_authority_unverified', 'host_node_access_unbounded']);
  const records = await withFrozenRuntimeDatabase(snapshot, db => {
    const result = [];
    for (const visit of history.visits) {
      const accepted = db.prepare("SELECT payload_json FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_submission_accepted'").get(visit.acceptance_receipt.id, history.source.project_id);
      const started = db.prepare('SELECT start_receipt_json FROM work_sessions WHERE id=?').get(visit.start_receipt.id);
      if (!accepted || sha(accepted.payload_json) !== visit.acceptance_receipt.sha256 || !started || sha(started.start_receipt_json) !== visit.start_receipt.sha256) return invalid('Catalog visit receipts changed');
      const submit = JSON.parse(accepted.payload_json), start = JSON.parse(started.start_receipt_json);
      if (!Number.isSafeInteger(submit.generation) || submit.generation !== start.generation) return invalid('Catalog visit generation differs');
      const journal = readPackInvocationObservations(db, history, visit, submit.generation);
      journal.gaps.forEach(gap => gaps.add(gap));
      result.push(...journal.records.map(record => ({ ...record, digest: record.scopeSha256 })));
      result.push({ stage: visit.stage, visit: visit.visit, kind: 'start', scope: start.pack_start?.component_inputs, digest: start.pack_start?.component_inputs_sha256 });
      result.push({ stage: visit.stage, visit: visit.visit, kind: 'submit', scope: submit.component_inputs, digest: submit.component_inputs_sha256 });
      if (submit.matrix_components?.status === 'partial') result.push({ stage: visit.stage, visit: visit.visit, kind: 'matrix_aggregate', scope: submit.matrix_components.scope, digest: submit.matrix_components.sha256 });
      else if (submit.matrix_components !== undefined && submit.matrix_components?.status !== 'unavailable') return invalid('Matrix aggregate is invalid');
      const rows = db.prepare(`SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_component_observation','flow_run.pack_submission_accepted')
        AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=?
        AND json_extract(payload_json,'$.attempt')=? AND json_extract(payload_json,'$.generation')=? ORDER BY id LIMIT 2001`)
        .all(history.source.project_id, history.source.run_id, visit.stage, visit.visit, visit.attempt, submit.generation);
      if (rows.length > 2000) return invalid('Catalog visit observations exceed the limit');
      for (const row of rows) {
        if (row.id === visit.acceptance_receipt.id) continue;
        const value = JSON.parse(row.payload_json), child = row.event_type === 'flow_run.pack_submission_accepted';
        const member = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND work_id=?').get(history.source.project_id, history.source.run_id, visit.stage, `visit-${visit.visit}`, value.work_id);
        const session = db.prepare('SELECT status FROM work_sessions WHERE id=? AND work_id=?').get(value.work_session_id, value.work_id);
        if (!member || !session || row.id >= visit.acceptance_receipt.id || (child ? value.operation !== 'work' || session.status !== 'completed' : typeof value.command !== 'string' || !value.command)) return invalid('Catalog observation owner differs');
        result.push({ stage: visit.stage, visit: visit.visit, kind: child ? 'work' : 'exec', scope: value.component_inputs, digest: value.component_inputs_sha256 });
      }
    }
    return result;
  });
  const observed = [], checked = new Set();
  if (!targetRoot) gaps.add('target_bundle_missing');
  for (const record of records) {
    if (!record.scope || !hex(record.digest)) { gaps.add('component_observation_missing'); continue; }
    if (sha(JSON.stringify(record.scope)) !== record.digest || record.scope.access_failures !== false
      || JSON.stringify(record.scope.stages) !== JSON.stringify([record.stage])) return invalid('Catalog component scope differs');
    if (!checked.has(record.digest)) {
      try {
        const source = await retainedPackComponentFingerprint(sourceRoot, history.pack.manifest_sha256, record.scope);
        if (source !== record.digest) throw new Error('source scope changed');
        if (targetRoot && await retainedPackComponentFingerprint(targetRoot, targetManifestSha256, record.scope) !== source) throw new Error('target scope changed');
      } catch (error) { return invalid(`Catalog component compatibility failed: ${error.message}`); }
      checked.add(record.digest);
    }
    observed.push({ stage: record.stage, visit: record.visit, kind: record.kind, sha256: record.digest });
  }
  if (snapshotTreeHash(path.join(snapshot, 'runtime')) !== manifest.runtime_sha256
    || manifest.schema_id === 'dd-flow/eval-run-snapshot@12' && framedSnapshotTreeHash(path.join(snapshot, 'runtime')) !== manifest.payload_integrity?.runtime
    || (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 !== snapshotSha256) return invalid('Catalog snapshot changed during component assessment');
  return { schema_id: 'dd-eval/pack-catalog-components@1', status: 'assessment_only', target: targetRoot ? 'caller_pinned_unverified' : 'absent', observed, gaps: [...gaps].sort() };
}
