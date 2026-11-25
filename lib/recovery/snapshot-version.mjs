/**
 * Check the standard snapshot version; callers still verify identity and payloads.
 * Version 6 is a separate unborn-project Memory recovery contract, not a candidate.
 */
export function isStandardRunSnapshot(value) {
  return value?.schema_id === 'dd-flow/eval-run-snapshot@5' ? value.workspace?.kind !== 'git_repository'
    : value?.schema_id === 'dd-flow/eval-run-snapshot@7' && value.workspace?.kind === 'git_repository';
}

const sha=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
function hasGitEvidence(value) {
  return sha(value?.work_git?.sha256) && Array.isArray(value.work_git.refs) && value.work_git.refs.length>0
    && value.work_git.refs.every(ref=>/^refs\/dd-flow\/work-results\/[a-f0-9]{64}$/.test(ref?.ref ?? '') && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref?.commit ?? ''))
    && new Set(value.work_git.refs.map(ref=>ref.ref)).size===value.work_git.refs.length;
}
function hasFramedIntegrity(value) {
  const proof=value.payload_integrity;
  return proof?.schema_id==='dd-flow/framed-payload@1' && sha(proof.project) && sha(proof.runtime)
    && (value.workspace.kind==='project' ? proof.workspace===undefined : sha(proof.workspace))
    && Object.keys(proof).sort().join()===(value.workspace.kind==='project' ? 'project,runtime,schema_id' : 'project,runtime,schema_id,workspace');
}

/** Candidate evidence is never a Stage entry or a restoration capability. */
export function isCandidateRunSnapshot(value) {
  return value?.purpose==='candidate' && (isStandardRunSnapshot(value)
    || value.stage_entry===null && value.schema_id==='dd-flow/eval-run-snapshot@12' && ['project','git_worktree','git_repository'].includes(value.workspace?.kind)
      && hasGitEvidence(value) && hasFramedIntegrity(value));
}

/** Stage-only version gate. The selected dd-flow engine verifies the payload,
 * retained Git bundle and publication identity before restoring the snapshot. */
export function isStageRunSnapshot(value) {
  if (isStandardRunSnapshot(value)) return true;
  if (value?.schema_id === 'dd-flow/eval-run-snapshot@19') {
    const authority=value.pack_stage_authority, engine=value.stage_engine, evidence=value.pack_evidence;
    return value.purpose==='stage_entry' && value.stage_entry==='code' && value.assessment_only===undefined
      && typeof value.project_id==='string' && Boolean(value.project_id) && typeof value.run_id==='string' && Boolean(value.run_id)
      && value.consistency==='controller_boundary_writer_barrier@1' && value.boundary_capture?.observation?.settled===true
      && value.boundary_capture.observation.operation_id===value.boundary_capture.operation_id
      && authority?.schema_id==='dd-flow/pack-stage-authority@1' && authority.stage==='plan-review' && authority.outcome==='accepted'
      && Number.isSafeInteger(authority.visit) && authority.visit>0 && Number.isSafeInteger(authority.attempt) && authority.attempt>0
      && authority.result===`run://plan-review/${authority.visit}/result.json` && sha(authority.boundary_sha256)
      && engine?.schema_id==='dd-flow/pack-stage-engine@1' && typeof engine.engine_version==='string' && Boolean(engine.engine_version)
      && [engine.pack_sha256,engine.engine_checksum,engine.engine_manifest_sha256].every(sha)
      && evidence?.schema_id==='dd-flow/pack-snapshot-evidence@1' && evidence.publication==='published'
      && evidence.run_id===value.run_id && evidence.project_id===value.project_id && sha(evidence.code_input_sha256)
      && value.pack_stage_sql?.schema_id==='dd-flow/pack-stage-sql@1' && sha(value.pack_stage_sql.sha256)
      && value.pack_stage_resource_capture?.schema_id==='dd-flow/pack-stage-resource-capture@1' && sha(value.pack_stage_resource_capture.receipt_sha256)
      && value.workspace?.kind==='git_worktree' && value.workspace.index_format==='entries@1' && sha(value.workspace.index_sha256)
      && value.project_git?.index_format==='entries@1' && sha(value.project_git.index_sha256) && value.work_git===undefined;
  }
  if (value?.schema_id === 'dd-flow/eval-run-snapshot@14') return value.purpose === 'stage_entry' && typeof value.stage_entry === 'string' && Boolean(value.stage_entry)
    && ['project', 'git_worktree', 'git_repository'].includes(value.workspace?.kind) && hasGitEvidence(value)
    && value.consistency === 'controller_boundary_writer_barrier@1' && typeof value.boundary_capture?.operation_id === 'string'
    && value.boundary_capture.observation?.settled === true && value.boundary_capture.observation.operation_id === value.boundary_capture.operation_id
    && value.stage_resource_capture?.schema_id === 'dd-flow/stage-resource-capture-marker@1' && sha(value.stage_resource_capture.receipt_sha256);
  if (!['dd-flow/eval-run-snapshot@10','dd-flow/eval-run-snapshot@11'].includes(value?.schema_id)
    || value.purpose !== 'stage_entry' || typeof value.stage_entry!=='string' || !value.stage_entry
    || !['project','git_worktree','git_repository'].includes(value.workspace?.kind)) return false;
  if (value.schema_id==='dd-flow/eval-run-snapshot@10' || value.work_git!==undefined) {
    if (!hasGitEvidence(value)) return false;
  }
  if (value.schema_id==='dd-flow/eval-run-snapshot@10') return value.payload_integrity===undefined;
  return hasFramedIntegrity(value);
}
