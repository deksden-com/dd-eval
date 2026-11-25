import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readPackRevisionGraphs } from './recovery/pack-review-graph.mjs';
import { readPackHistory } from './recovery/pack-history.mjs';
import { frozenFile, readFrozenFile, withFrozenRuntimeDatabase } from './recovery/frozen-evidence-io.mjs';
import { snapshotTreeHash, framedSnapshotTreeHash } from './recovery/snapshot-tree.mjs';
import { retainedPackComponentFingerprint } from './pack-component-fingerprint.mjs';
import { validateVerificationMatrix, verificationMatrixFingerprint } from './verification-matrix-schema.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = message => { throw Object.assign(new Error(message), { code: 'verification_matrix_qualification_invalid' }); };
const relativeFile = value => typeof value === 'string' && value && !path.isAbsolute(value) && !value.includes('\\')
  && value.split('/').every(part => part && part !== '.' && part !== '..');

/** Resolve a checkpoint-owned snapshot or bundle without following path aliases. */
export async function ownedDirectory(owner, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')
    || relative.split('/').some(part => !part || part === '..')) return invalid('Pack evidence directory is unsafe');
  const root = await realpath(owner), file = path.resolve(root, relative), rel = path.relative(root, file);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return invalid('Pack evidence escaped checkpoint ownership');
  let current = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return invalid('Pack evidence directory is unsafe');
  }
  if (await realpath(file) !== file) return invalid('Pack evidence directory traverses an alias');
  return file;
}

/** Assess exact T03 visits and their recorded scopes; no assessment snapshot can qualify @5. */
export async function assessPackMatrixQualification({ owner, receipt, checkpoint, engineFingerprint }) {
  const selection = receipt?.pack_history;
  if (selection?.schema_id !== 'dd-eval/pack-revision-graphs-request@1' || !hex(selection.snapshot_sha256)
    || typeof selection.run_id !== 'string' || !selection.run_id
    || !['previous_plan_visit', 'previous_review_visit', 'plan_visit', 'review_visit'].every(key => Number.isSafeInteger(selection[key]) && selection[key] > 0)
    || receipt.component_sha256 !== engineFingerprint) return invalid('Pack qualification history or engine scope is invalid');
  const downstreamKeys = ['code_visit', 'code_review_visit', 'merge_visit'];
  if (downstreamKeys.some(key => selection[key] !== undefined && (!Number.isSafeInteger(selection[key]) || selection[key] < 1))
    || selection.code_review_visit !== undefined && selection.code_visit === undefined
    || selection.merge_visit !== undefined && selection.code_review_visit === undefined) return invalid('Pack downstream visit selection is invalid');
  const snapshot = await ownedDirectory(owner, selection.snapshot);
  const history = await readPackRevisionGraphs({ snapshot, snapshotSha256: selection.snapshot_sha256, runId: selection.run_id,
    previousPlanVisit: selection.previous_plan_visit, previousReviewVisit: selection.previous_review_visit,
    planVisit: selection.plan_visit, reviewVisit: selection.review_visit });
  if (history.source.run_id !== selection.run_id || receipt.engine_artifact_sha256 !== history.pack.engine_checksum
    || receipt.flow_commit !== history.pack.project_commit || receipt.built_with_canon?.commit !== history.pack.canon_commit)
    return invalid('Pack qualification provenance differs from the selected RUN');
  const manifest = JSON.parse((await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).text);
  const runRoot = path.relative(manifest.dd_flow_home, manifest.pack_evidence.source_run_root);
  if (!runRoot || runRoot === '..' || runRoot.startsWith(`..${path.sep}`) || path.isAbsolute(runRoot)) return invalid('Pack RUN root is unsafe');
  const sourceRoot = path.join(snapshot, 'runtime', runRoot, 'flow-pack-bundle');
  const target = checkpoint?.value?.flow_pack?.pack_bundle;
  if (target !== undefined && (!target || !hex(target.manifest_sha256))) return invalid('Target pack authority is invalid');
  const targetRoot = target ? await ownedDirectory(owner, target.root) : null;
  const gaps = new Set(['snapshot_component_marker_unavailable', 'full_producer_coverage_unavailable', 'forkability_unverified']);
  const marker = manifest.pack_matrix_evidence;
  if (marker !== undefined) {
    if (marker?.schema_id !== 'dd-flow/pack-matrix-snapshot@1' || marker.coverage !== 'partial' || marker.project_id !== history.source.project_id
      || marker.run_id !== selection.run_id || marker.pack_sha256 !== history.pack.manifest_sha256 || marker.engine_binding_sha256 !== history.pack.engine_binding_sha256
      || !hex(marker.rows_sha256) || !Array.isArray(marker.files) || marker.files.length > 40001) return invalid('Pack matrix snapshot marker differs');
    const rows = await withFrozenRuntimeDatabase(snapshot, db => {
      const unknown = db.prepare("SELECT 1 FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_component_observation','flow_run.stage_packet') AND CASE WHEN NOT json_valid(payload_json) THEN 1 WHEN json_type(payload_json)<>'object' OR json_type(payload_json,'$.run_id') IS NOT 'text' OR (SELECT COUNT(*) FROM json_each(audit_events.payload_json) WHERE key='run_id')<>1 OR json_extract(payload_json,'$.run_id')<>? THEN 1 ELSE 0 END LIMIT 1").get(history.source.project_id, selection.run_id);
      if (unknown) return invalid('Pack matrix snapshot event scope differs');
      return db.prepare("SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_component_observation','flow_run.stage_packet') AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all(history.source.project_id, selection.run_id);
    });
    if (rows.length > 20000 || sha(JSON.stringify(rows)) !== marker.rows_sha256) return invalid('Pack matrix snapshot rows differ');
    let previous = '';
    for (const item of marker.files) {
      if (!relativeFile(item?.path) || item.path <= previous || !hex(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0) return invalid('Pack matrix snapshot inventory differs');
      previous = item.path;
      const file = await readFrozenFile(snapshot, path.join(snapshot, 'runtime', runRoot, item.path));
      if (file.bytes.length !== item.size || sha(file.bytes) !== item.sha256) return invalid('Pack matrix snapshot file differs');
    }
    if (!marker.files.some(item => item.path === 'engine-binding.json' && item.sha256 === marker.engine_binding_sha256)
      || !marker.files.some(item => item.path === 'flow-pack-bundle/manifest.json' && item.sha256 === marker.pack_sha256)) return invalid('Pack matrix snapshot omits bound roots');
    gaps.delete('snapshot_component_marker_unavailable'); gaps.add('snapshot_component_coverage_partial');
  }
  if (!targetRoot) gaps.add('target_pack_authority_missing');
  const selected = [history.current_graph.binding.plan, history.current_graph.binding.review];
  if (selection.code_visit !== undefined) {
    const requested = [['code', selection.code_visit], ['code-review', selection.code_review_visit], ['merge', selection.merge_visit]]
      .filter(([, visit]) => visit !== undefined).map(([stage, visit]) => ({ stage, visit }));
    const downstream = await readPackHistory({ snapshot, snapshotSha256: selection.snapshot_sha256, runId: selection.run_id, publications: requested });
    let previous = selected.at(-1);
    for (const visit of downstream.visits) {
      if (previous.successor?.stage !== visit.stage || previous.successor?.visit !== visit.visit) return invalid('Pack downstream visit does not follow selected history');
      selected.push(visit); previous = visit;
    }
  }
  const collected = await withFrozenRuntimeDatabase(snapshot, db => {
    const records = [];
    for (const visit of selected) {
      let generation;
      for (const [kind, ref] of [['start', visit.start_receipt], ['submit', visit.acceptance_receipt]]) {
        const row = kind === 'start'
          ? db.prepare('SELECT start_receipt_json AS raw FROM work_sessions WHERE id=?').get(ref.id)
          : db.prepare("SELECT payload_json AS raw FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_submission_accepted'").get(ref.id, history.source.project_id);
        if (!row || sha(row.raw) !== ref.sha256) return invalid('Selected pack receipt changed');
        const value = JSON.parse(row.raw), source = kind === 'start' ? value.pack_start : value;
        if (source?.stage !== visit.stage || source.visit !== visit.visit || source.attempt !== visit.attempt) return invalid('Selected pack scope belongs to another visit');
        if (kind === 'submit') generation = value.generation;
        const record = { stage: visit.stage, visit: visit.visit, attempt: visit.attempt, kind, scope: source.component_inputs, scopeSha256: source.component_inputs_sha256 };
        if (kind === 'submit' && value.verification_matrix) {
          const meta = value.verification_matrix;
          if (meta.contract !== 'dd-flow/verification-matrix@1' || meta.role !== 'output'
            || !['declared', 'execution', 'final'].includes(meta.completeness) || !hex(meta.source_fingerprint)
            || !['json', 'markdown'].every(key => relativeFile(meta[key]?.path) && hex(meta[key]?.sha256))) return invalid('Pack matrix metadata differs');
          record.matrix = meta;
          record.packets = {};
          for (const key of ['json', 'markdown']) {
            const locator = path.join(manifest.pack_evidence.source_run_root, meta[key].path);
            const rows = db.prepare("SELECT payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.stage_packet' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.attempt')=? AND json_extract(payload_json,'$.file')=?").all(history.source.project_id, selection.run_id, visit.stage, `visit-${visit.visit}-try-${visit.attempt}`, locator);
            if (rows.length > 1) return invalid('Pack matrix packet is ambiguous');
            if (!rows.length) { gaps.add('matrix_packet_not_retained'); continue; }
            const packet = JSON.parse(rows[0].payload_json), bytes = Buffer.from(packet.base64 ?? '', 'base64');
            if (!bytes.length || bytes.toString('base64') !== packet.base64 || sha(bytes) !== packet.sha256 || packet.sha256 !== meta[key].sha256)
              return invalid('Pack matrix packet differs from its owner');
            record.packets[key] = bytes;
          }
        }
        records.push(record);
        if (kind === 'submit' && value.matrix_components !== undefined) {
          const aggregate = value.matrix_components;
          if (aggregate?.status === 'partial') records.push({ stage: visit.stage, visit: visit.visit, attempt: visit.attempt, kind: 'matrix_aggregate',
            scope: aggregate.scope, scopeSha256: aggregate.sha256 });
          else if (aggregate?.status === 'unavailable' && typeof aggregate.reason === 'string' && aggregate.reason) gaps.add('matrix_component_aggregate_unavailable');
          else return invalid('Pack matrix component aggregate is invalid');
        } else if (kind === 'submit' && value.verification_matrix) gaps.add('matrix_component_aggregate_missing');
      }
      if (!Number.isSafeInteger(generation) || generation < 0) return invalid('Selected pack generation is invalid');
      const submissions = db.prepare("SELECT id,payload_json AS raw FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_submission_accepted' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=? AND json_extract(payload_json,'$.attempt')=? AND json_extract(payload_json,'$.generation')=? ORDER BY id LIMIT 1001")
        .all(history.source.project_id, selection.run_id, visit.stage, visit.visit, visit.attempt, generation);
      if (submissions.length > 1000) return invalid('Selected pack submissions exceed the limit');
      for (const row of submissions) {
        if (row.id === visit.acceptance_receipt.id) continue;
        const value = JSON.parse(row.raw);
        const member = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND work_id=?').get(history.source.project_id, selection.run_id, visit.stage, `visit-${visit.visit}`, value.work_id);
        const session = db.prepare('SELECT status FROM work_sessions WHERE id=? AND work_id=?').get(value.work_session_id, value.work_id);
        if (!member || session?.status !== 'completed' || row.id >= visit.acceptance_receipt.id || value.operation !== 'work')
          return invalid('Pack child submission has no accepted Work session');
        records.push({ stage: visit.stage, visit: visit.visit, attempt: visit.attempt, kind: 'work', id: row.id,
          scope: value.component_inputs, scopeSha256: value.component_inputs_sha256 });
      }
      const observations = db.prepare("SELECT id,payload_json AS raw FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_component_observation' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=? AND json_extract(payload_json,'$.attempt')=? AND json_extract(payload_json,'$.generation')=? ORDER BY id LIMIT 1001")
        .all(history.source.project_id, selection.run_id, visit.stage, visit.visit, visit.attempt, generation);
      if (observations.length > 1000) return invalid('Selected pack observations exceed the limit');
      for (const row of observations) {
        const value = JSON.parse(row.raw);
        const member = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND work_id=?').get(history.source.project_id, selection.run_id, visit.stage, `visit-${visit.visit}`, value.work_id);
        const session = db.prepare('SELECT 1 FROM work_sessions WHERE id=? AND work_id=?').get(value.work_session_id, value.work_id);
        if (!member || !session || row.id >= visit.acceptance_receipt.id || typeof value.command !== 'string' || !value.command) return invalid('Pack command observation has no owning Work session');
        records.push({ stage: visit.stage, visit: visit.visit, attempt: visit.attempt, kind: 'exec', id: row.id,
          scope: value.component_inputs, scopeSha256: value.component_inputs_sha256 });
      }
    }
    const ref = history.current_graph.dispatch;
    const row = db.prepare("SELECT payload_json AS raw FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_component_observation'").get(ref.id, history.source.project_id);
    if (!row || sha(row.raw) !== ref.sha256 || !records.some(item => item.kind === 'exec' && item.id === ref.id)) return invalid('Selected dispatch observation changed');
    return records;
  });
  const observed = [];
  for (const record of collected) {
    if (record.kind === 'submit') {
      if (!record.matrix) gaps.add('matrix_metadata_missing');
      else if (record.packets?.json && record.packets?.markdown) {
        for (const key of ['json', 'markdown']) {
          const published = await frozenFile(snapshot, path.join(snapshot, 'runtime', runRoot, record.matrix[key].path));
          if (published.sha256 !== record.matrix[key].sha256 || !Buffer.from(published.text).equals(record.packets[key])) return invalid('Published pack matrix differs');
        }
        let matrix;
        try { matrix = validateVerificationMatrix(JSON.parse(record.packets.json.toString('utf8'))); }
        catch { return invalid('Pack matrix bytes are invalid'); }
        if (matrix.header.project_id !== history.source.project_id || matrix.header.run_id !== selection.run_id
          || matrix.header.stage !== record.stage || matrix.header.stage_attempt !== `visit-${record.visit}-try-${record.attempt}`
          || matrix.header.role !== record.matrix.role || matrix.header.completeness !== record.matrix.completeness
          || matrix.header.source_fingerprint !== record.matrix.source_fingerprint || verificationMatrixFingerprint(matrix) !== matrix.header.source_fingerprint)
          return invalid('Pack matrix owner or source fingerprint differs');
        const expectedPlans = history.chain.current.plan.members ?? [history.chain.current.plan];
        if (expectedPlans.some(plan => !matrix.sources.some(source => source.role === `plan:${plan.protocol_id}` && source.sha256 === (plan.sha256 ?? plan.result?.sha256))))
          return invalid('Pack matrix PLAN sources differ from the selected revision');
        if (record.stage === 'plan-review' && !matrix.sources.some(source => source.role === 'plan_review' && source.sha256 === history.chain.current.review.result.sha256))
          return invalid('Pack matrix review source differs from the selected visit');
        if (['code', 'code-review', 'merge'].includes(record.stage)) {
          const own = selected.find(visit => visit.stage === record.stage && visit.visit === record.visit);
          const role = record.stage === 'code' ? 'code_verification' : record.stage === 'code-review' ? 'code_review' : 'merge_result';
          if (!own || !matrix.sources.some(source => source.role === role && source.sha256 === own.result.sha256)) return invalid('Pack matrix stage result differs from the selected visit');
          for (const [stage, sourceRole] of record.stage === 'merge' ? [['code', 'code_verification'], ['code-review', 'code_review']] : record.stage === 'code-review' ? [['code', 'code_verification']] : []) {
            const prior = selected.find(visit => visit.stage === stage);
            if (!prior || !matrix.sources.some(source => source.role === sourceRole && source.sha256 === prior.result.sha256)) return invalid('Pack matrix predecessor differs from the selected visit');
          }
        }
        for (const source of matrix.sources) {
          if (source.root !== 'run' || !relativeFile(source.path)) return invalid('Pack matrix source is outside retained RUN');
          const retained = await frozenFile(snapshot, path.join(snapshot, 'runtime', runRoot, source.path));
          if (retained.sha256 !== source.sha256) return invalid('Pack matrix source bytes differ');
        }
      }
    }
    if (!record.scope || !hex(record.scopeSha256)) { gaps.add('component_observation_missing'); continue; }
    if (sha(JSON.stringify(record.scope)) !== record.scopeSha256 || record.scope.access_failures !== false
      || JSON.stringify(record.scope.stages) !== JSON.stringify([record.stage])) return invalid('Pack component observation differs');
    try {
      const source = await retainedPackComponentFingerprint(sourceRoot, history.pack.manifest_sha256, record.scope);
      if (source !== record.scopeSha256) throw new Error('Pack producer scope differs from retained source');
      if (!targetRoot) continue;
      const candidate = await retainedPackComponentFingerprint(targetRoot, target.manifest_sha256, record.scope);
      if (candidate !== source) throw new Error('Pack component inputs changed');
    } catch (error) { return invalid(`Pack component compatibility failed: ${error.message}`); }
    observed.push({ stage: record.stage, visit: record.visit, kind: record.kind, sha256: record.scopeSha256 });
  }
  if (snapshotTreeHash(path.join(snapshot, 'runtime')) !== manifest.runtime_sha256
    || manifest.schema_id === 'dd-flow/eval-run-snapshot@12' && framedSnapshotTreeHash(path.join(snapshot, 'runtime')) !== manifest.payload_integrity?.runtime
    || (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 !== selection.snapshot_sha256)
    return invalid('Pack snapshot changed during matrix assessment');
  return { history, observed, gaps: [...gaps].sort(), coverage: { matrix_components: 'unavailable', forkability: 'unverified' } };
}
