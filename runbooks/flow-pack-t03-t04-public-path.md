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
