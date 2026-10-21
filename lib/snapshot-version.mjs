/** Version gate only; callers still verify publication identity and payloads.
 * @6 is the separate unborn-project Memory recovery contract, not a candidate. */
export function isStandardRunSnapshot(value) {
  return value?.schema_id === 'dd-flow/eval-run-snapshot@5' ? value.workspace?.kind !== 'git_repository'
    : value?.schema_id === 'dd-flow/eval-run-snapshot@7' && value.workspace?.kind === 'git_repository';
}
