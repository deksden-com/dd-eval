/** Version gate only; callers still verify publication identity and payloads.
 * @6 is the separate unborn-project Memory recovery contract, not a candidate. */
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
  if (!['dd-flow/eval-run-snapshot@10','dd-flow/eval-run-snapshot@11'].includes(value?.schema_id)
    || value.purpose !== 'stage_entry' || typeof value.stage_entry!=='string' || !value.stage_entry
    || !['project','git_worktree','git_repository'].includes(value.workspace?.kind)) return false;
  if (value.schema_id==='dd-flow/eval-run-snapshot@10' || value.work_git!==undefined) {
    if (!hasGitEvidence(value)) return false;
  }
  if (value.schema_id==='dd-flow/eval-run-snapshot@10') return value.payload_integrity===undefined;
  return hasFramedIntegrity(value);
}
