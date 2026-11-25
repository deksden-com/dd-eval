# T03/T04 public boundary path

This is a bounded integration scenario, not T03/T04 acceptance or an installed
qualification. Use a fresh owned CLI world, selected compatible engine and
canon. Record their full commits, build identity and the command outcomes.
Do not rerun or modify a retained RUN or snapshot owned by another task.

1. Drive a public managed RUN with boundary capture through PLAN and CODE to
   REVIEW. Record the RUN, controller and completed capture IDs. Keep the
   world and snapshot unchanged at the checkpoint; confirm all owned Sessions
   have settled before reading it.
2. With the same CLI revision and Home, save the exact result of
   `dd-flow run snapshots "$RUN_ID" --project-root "$PROJECT_ROOT" --json`
   to an owned file. Choose one `available` capture after CODE and retain its
   published manifest SHA-256 separately from that file. It must report
   `pack_assessment_only`, `forkable: false`, and capture provenance.
3. Inspect the selected published boundary with the production qualifier's
   read-only diagnostic mode. It emits `assessment_only` and does not create a
   qualification receipt:

   ```sh
   node bin/qualify-verification-matrix.mjs \
     --inspect-pack-catalog "$CATALOG_FILE" --snapshot-sha256 "$MANIFEST_SHA256"
   ```

   Then run the interop check with the catalog file and
   independently retained digest:

   ```sh
   DD_EVAL_PACK_CATALOG="$CATALOG_FILE" \
   DD_EVAL_PACK_SNAPSHOT_SHA256="$MANIFEST_SHA256" \
     node --test --test-concurrency=1 test/pack-catalog-cli-interop.test.mjs
   ```

   This verifies the catalog's boundary against the snapshot manifest, frozen
   database, retained bytes and selected visits; a substituted visit must fail.
   A missing variable pair skips; one missing variable fails. Preserve the CLI
   catalog, hashes, exact versions and test result outside the source snapshot.
4. Stop at this checkpoint. Assessment is neither a forkable snapshot nor
   matrix qualification: `matrix_components` remains unavailable and
   `forkability` unverified. The existing retained S03 world on CLI `0873b0ae`
   is assessment evidence only; its catalog was published before the new
   projection and its actual snapshot has not yet been read by this scenario.

For the next checkpoint, K04 must provide an admitted portable boundary and
complete custody. S02/K03 must provide actual PLAN-REVIEW return, second visit
and skip; run a public fork into two empty roots and verify source immutability,
exact engine/pack pins and substituted-visit refusal. T04 also needs complete
producer observations, matrix packets and selected target authority before a
pack-aware qualifier may emit passing `@5`. T06 owns qualification on the
installed accepted pair. A partial marker or this interop check grants none of
those claims.

## Pack-aware qualification attempt

The qualifier also has an explicit pack RUN route. Prepare a checkpoint-owned
snapshot and target bundle, a checkpoint JSON whose `flow_pack.pack_bundle`
contains the target's owner-relative `root` and `manifest_sha256`, and an
explicit selection JSON:

```json
{
  "schema_id": "dd-eval/pack-revision-graphs-request@1",
  "snapshot": "snapshot",
  "snapshot_sha256": "<published manifest SHA-256>",
  "run_id": "<exact RUN ID>",
  "previous_plan_visit": 1,
  "previous_review_visit": 1,
  "plan_visit": 2,
  "review_visit": 2
}
```

Use the actual selected visit numbers, never infer them from stage names. The
snapshot and bundle directories must be inside the checkpoint directory without
symlinks. `$ENGINE_JSON` identifies the exact engine artifact, and `$FLOW_COMMIT`
is the source project's pinned Git commit, separately from the canon in engine
build-info. Output must be a new file beside the checkpoint:

When those stages have completed, extend the selection in order with
`code_visit`, `code_review_visit`, and `merge_visit`. Eval verifies each
successor and each selected stage's retained observations and packet sources.
Omitting a predecessor while selecting a later visit is invalid. The later
packets currently say `declared`; they do not supply final check coverage.

```sh
node bin/qualify-verification-matrix.mjs \
  --pack-history "$SELECTION_JSON" --checkpoint "$CHECKPOINT_JSON" \
  --engine-json "$ENGINE_JSON" --flow-commit "$FLOW_COMMIT" \
  --output "$CHECKPOINT_DIR/verification-matrix.json"
```

This route verifies the engine bytes, reads the exact T03 graphs, derives the
engine and observed pack fingerprints, checks source/target observations and
matrix packets via the same admission path, and only then atomically publishes
an `@5` receipt. It compares retained command observations for the selected
PLAN/review attempt and generation as well as their start and submit scopes;
these observations still do not prove all commands were captured. A changed used input fails as invalid; an unrelated input can
preserve the compared scope. Neither result supplies missing authority.

**Current result is unavailable:** T03 reads assessment snapshots only; K04 has
not supplied portable fork/capture authority or complete producer coverage.
Admission deliberately refuses even a matching partial scope before writing a
receipt. Selecting another path, inventing a marker, or supplying a checkpoint
bundle without proof it was selected for execution does not change this. After
the K04 contract lands, the reader and admission must verify that actual
contract, including CODE/MERGE coverage and unrestricted plugin reads, before
allowing publication. The fixture tests exercise the route but are not K04 or
installed-pair evidence.

The K04 integration must expose, through its verified public fork result, a
versioned binding of source manifest and payload, selected RUN/visits and
engine artifact, plus the materialized target RUN and its bundle manifest. It
must establish complete producer custody for every contributing stage and Work,
including commands and failed/unknown effects, matrix packet bytes, list
membership and access paths outside capability observation. Eval must check
those bindings against its selected history and actual target before lifting
`full_producer_coverage_unavailable` or `forkability_unverified`. A caller's
path or a receipt declaring full coverage is not that authority. This describes
the required properties, not a claim that K04 currently exposes such an API.

For the coordinated test slot, with frozen commits and the project's ordinary
test prerequisites: `node --test --test-concurrency=1 test/pack-history.test.mjs
test/pack-catalog-cli-interop.test.mjs test/engine-admission.test.mjs` in eval;
the public catalog interop additionally needs `DD_EVAL_PACK_CATALOG` and
`DD_EVAL_PACK_SNAPSHOT_SHA256` as above. CLI needs the pinned-canon build,
typecheck, and `test/run-snapshot-catalog.test.ts` before generating that
catalog. Run these against an owned world and retain their actual outcomes.
