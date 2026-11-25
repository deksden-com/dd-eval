import { createHash } from 'node:crypto';
import { isStageRunSnapshot } from './snapshot-version.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { code: 'fork_publication_invalid' }); };

/** Bind the CLI-exported publication to the captured @19 and its accepted visit. */
export function inspectPackStagePublication({ publication, publicationSha256, manifest, snapshot, snapshotSha256, engineVersion, engineChecksum }) {
  const bytes=Buffer.from(JSON.stringify(publication));
  if (!isStageRunSnapshot(manifest) || manifest.schema_id!=='dd-flow/eval-run-snapshot@19' || !/^[a-f0-9]{64}$/.test(publicationSha256 ?? '')
    || sha(bytes)!==publicationSha256 || publication?.schema_id!=='dd-flow/stage-publication@1'
    || publication.project_id!==manifest.project_id || publication.run_id!==manifest.run_id
    || manifest.stage_engine.engine_version!==engineVersion || manifest.stage_engine.engine_checksum!==engineChecksum) fail('Stage publication or exact engine identity differs');
  const operation=publication.operation, catalog=publication.catalog, capture=manifest.boundary_capture, authority=manifest.pack_stage_authority;
  if (!operation || !catalog || operation.operation_id!==capture.operation_id || operation.controller_id!==capture.controller_id
    || operation.input_hash!==capture.boundary_key || operation.operation_id!==`${operation.controller_id}:boundary:${operation.input_hash}`
    || typeof operation.input_json!=='string' || typeof operation.receipt_json!=='string'
    || catalog.schema_id!=='dd-flow/snapshot-catalog@1' || catalog.provenance!=='capture' || catalog.run_id!==manifest.run_id
    || catalog.operation_id!==operation.operation_id || catalog.input_sha256!==sha(operation.input_json) || catalog.receipt_sha256!==sha(operation.receipt_json)) fail('Stage publication operation or catalog differs');
  let input,receipt; try { input=JSON.parse(operation.input_json); receipt=JSON.parse(operation.receipt_json); } catch { fail('Stage publication records are malformed'); }
  const entry=catalog.entry, boundary=input?.pack_boundary, accepted=boundary?.accepted, last=Array.isArray(accepted) ? accepted.at(-1) : null;
  if (input?.action!=='boundary_capture' || input.run_id!==manifest.run_id || input.stage!==authority.stage || input.stage_entry!==manifest.stage_entry
    || input.output!==snapshot || boundary?.next_stage!==manifest.stage_entry || boundary.cursor?.stage!==manifest.stage_entry
    || !Number.isSafeInteger(boundary.cursor?.visit) || boundary.cursor.visit<1 || !last
    || ['stage','visit','attempt','outcome','result'].some(key=>last[key]!==authority[key])
    || sha(JSON.stringify(boundary))!==authority.boundary_sha256
    || sha(JSON.stringify({run_id:manifest.run_id,stage:input.stage,pack_boundary:boundary}))!==operation.input_hash
    || receipt?.snapshot!==snapshot || receipt.manifest_sha256!==snapshotSha256 || entry?.snapshot_id!==operation.operation_id
    || entry.snapshot!==snapshot || entry.manifest_sha256!==snapshotSha256 || entry.after_stage!==authority.stage || entry.stage_entry!==manifest.stage_entry
    || entry.assessment_only===true || entry.forkable!==true || entry.restorable!==true || entry.available!==true) fail('Stage publication does not authorize this accepted boundary');
  return { bytes, authority: { schema_id:'dd-eval/pack-stage-publication@1', publication_sha256:publicationSha256,
    snapshot_sha256:snapshotSha256, run_id:manifest.run_id, project_id:manifest.project_id, stage:authority.stage,
    visit:authority.visit, attempt:authority.attempt, outcome:authority.outcome, result:authority.result,
    boundary_sha256:authority.boundary_sha256, pack_sha256:manifest.stage_engine.pack_sha256,
    accepted_visits_sha256:sha(JSON.stringify(accepted.map(item=>Object.fromEntries(['stage','visit','attempt','outcome','result'].map(key=>[key,item[key]]))))), successor_visit:boundary.cursor.visit,
    engine_version:engineVersion, engine_checksum:engineChecksum, engine_manifest_sha256:manifest.stage_engine.engine_manifest_sha256 } };
}
