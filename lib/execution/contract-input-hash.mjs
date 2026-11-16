import { hashJson } from "./journal-hash.mjs";

/** Bind only the context slices selected for this execution. */
export function executionContextHash(blueprint, selectedStages) {
  return hashJson({ schema_id: blueprint?.schema_id ?? null,
    stages: Object.fromEntries(selectedStages.map(stage => [stage, blueprint?.stages?.[stage] ?? null])) });
}

/** Bind interaction fixtures to their execution context. */
export const executionFixtureHash = (fixtures, contextSha256) => hashJson({ interaction_fixtures: fixtures, stage_context_sha256: contextSha256 });
