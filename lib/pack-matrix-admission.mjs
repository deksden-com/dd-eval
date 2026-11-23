import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readPackRevisionGraphs } from './recovery/pack-review-graph.mjs';
import { frozenFile, withFrozenRuntimeDatabase } from './recovery/frozen-evidence-io.mjs';
import { assertRetainedPackCompatibility } from './pack-component-fingerprint.mjs';
import { validateVerificationMatrix, verificationMatrixFingerprint } from './verification-matrix-schema.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = message => { throw Object.assign(new Error(message), { code: 'verification_matrix_qualification_invalid' }); };
const relativeFile = value => typeof value === 'string' && value && !path.isAbsolute(value) && !value.includes('\\')
  && value.split('/').every(part => part && part !== '.' && part !== '..');

/** Resolve a checkpoint-owned snapshot or bundle without following path aliases. */
async function ownedDirectory(owner, relative) {
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
  const targetRoot = target && hex(target.manifest_sha256) ? await ownedDirectory(owner, target.root) : null;
  const gaps = new Set(['snapshot_component_marker_unavailable', 'full_producer_coverage_unavailable', 'forkability_unverified']);
  if (!targetRoot) gaps.add('target_pack_authority_missing');
  const selected = [history.current_graph.binding.plan, history.current_graph.binding.review];
  const collected = await withFrozenRuntimeDatabase(snapshot, db => {
    const records = [];
    for (const visit of selected) {
      for (const [kind, ref] of [['start', visit.start_receipt], ['submit', visit.acceptance_receipt]]) {
        const row = kind === 'start'
          ? db.prepare('SELECT start_receipt_json AS raw FROM work_sessions WHERE id=?').get(ref.id)
          : db.prepare("SELECT payload_json AS raw FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_submission_accepted'").get(ref.id, history.source.project_id);
        if (!row || sha(row.raw) !== ref.sha256) return invalid('Selected pack receipt changed');
        const value = JSON.parse(row.raw), source = kind === 'start' ? value.pack_start : value;
        if (source?.stage !== visit.stage || source.visit !== visit.visit || source.attempt !== visit.attempt) return invalid('Selected pack scope belongs to another visit');
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
      }
    }
    const ref = history.current_graph.dispatch;
    const row = db.prepare("SELECT payload_json AS raw FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_component_observation'").get(ref.id, history.source.project_id);
    if (!row || sha(row.raw) !== ref.sha256) return invalid('Selected dispatch observation changed');
    const dispatch = JSON.parse(row.raw);
    records.push({ stage: 'plan-review', visit: selection.review_visit, kind: 'dispatch', scope: dispatch.component_inputs, scopeSha256: dispatch.component_inputs_sha256 });
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
      }
    }
    if (!record.scope || !hex(record.scopeSha256)) { gaps.add('component_observation_missing'); continue; }
    if (sha(JSON.stringify(record.scope)) !== record.scopeSha256 || record.scope.access_failures !== false
      || JSON.stringify(record.scope.stages) !== JSON.stringify([record.stage])) return invalid('Pack component observation differs');
    if (!targetRoot) continue;
    try {
      await assertRetainedPackCompatibility({ sourceRoot, sourceManifestSha256: history.pack.manifest_sha256,
        targetRoot, targetManifestSha256: target.manifest_sha256, scope: record.scope, scopeSha256: record.scopeSha256 });
    } catch (error) { return invalid(`Pack component compatibility failed: ${error.message}`); }
    observed.push({ stage: record.stage, visit: record.visit, kind: record.kind, sha256: record.scopeSha256 });
  }
  return { history, observed, gaps: [...gaps].sort(), coverage: { matrix_components: 'unavailable', forkability: 'unverified' } };
}
