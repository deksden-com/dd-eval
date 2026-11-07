# Recovery snapshot consumer consolidation

Source parent: `a7f2e9fcb8355545d70e92329fe8dc1579353d5a`.

Scope: explicit required snapshot policy admission against the selected engine; Stage-only snapshot version recognition; candidate Git/framed payload integrity; materialization and acceptance consumers. These changes do not publish an engine, change an existing EVAL pin, or establish full recovery acceptance.

## Verification

- `git diff --check`: PASS.
- `node --test test/case-acceptance.test.mjs test/cleanup-observation.test.mjs test/managed-flow-client.test.mjs test/materialization-evidence.test.mjs test/recovery-safety.test.mjs test/snapshot-version.test.mjs test/runtime-restore.test.mjs`: PASS 90/90.
- Related runner/native/restore selection: 90 PASS, 5 FAIL, 3 opt-in SKIP (98 tests). Not an all-green result.
- Clean-parent comparison selected the five failing scenarios plus the sibling infrastructure-stop case: 1 PASS, 6 FAIL. The five failures also occur on the parent: boundary callback closure, retained infrastructure cleanup, delayed infrastructure cleanup, cleanup-only Judge status, exhausted local-retirement cleanup. Parent boundary failure occurs earlier (`stage_boundary_incomplete`); candidate reaches the expected primary failure but records two boundaries rather than the fixture's expected one.

Outstanding baseline findings must not be concealed by weakening assertions. Real installed-engine integration remains opt-in and was not executed here. No providers, full gate, GitHub CI, release or EVAL launch.

Local comparison evidence: tool sessions 63305, 91971, 62075; clean parent checkout under `.recovery-consolidation-20261107.LBYiAx/dd-eval-parent-check`. Temporary comparison worktree is disposable; Git commits and this report retain the source/result distinction.
