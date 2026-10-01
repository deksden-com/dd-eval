# Plan 060 — implementation review

Date: 2026-10-01. Scope: source implementation A–H, not deployment or new E2E.
Review complete; confirmed material defects corrected and source gates passed.

Three independent reviewers audited capacity, frozen coverage and review contracts.
The main reviewer traced the reported defects through production callers, checked
the patches and requested additional parity/negative controls. Ponytail: reuse
the pinned policy, owner ledger, existing matrix sources and shared frozen checker;
no new dependency, retry framework or artifact schema.

## Confirmed material defects and corrections

1. **Recovered Judge overload got a new failure time.** `judge-capacity.mjs`
   used the reattach clock instead of the retained native `observed_at`, allowing
   two rapid continuation refusals to bypass the two-minute burst stop. Recovery
   now uses immutable observation time; missing/invalid/reversed evidence is
   no-send, not a fresh refusal. Native terminal time remains a separate field,
   never mixed into the durable-observation basis.
2. **Fresh native effects were ignored.** Judge expected `native_turn.id`, while
   the actual adapter emits `terminal_turn_id`/`terminal_status`. Exact fresh
   items now override cached items; pending/unknown/foreign evidence blocks
   continuation even with custom inspection. A compact inspect without Turn
   fields may still use a proven immutable failed receipt, never unknown items.
3. **FLOW could replace invalid refusal time with the current clock.** Shared
   `refusalObservation` now rejects invalid/changed native observation time.
   Retained refusals are reconciled against the native receipt before reuse;
   duplicate Turn IDs and invented terminal-time provenance do not authorize a
   successor. Chronology is checked even before the first continuation pair.
4. **CODE P0/P1 could disappear through duplicate resolution.** Duplicate chains
   were filtered before the mandatory-fix guard. Their final canonical finding
   must now have disposition `fix`; existing causal-check and completed clean
   repair requirements remain authoritative. Legitimate one-repair dedup still
   works. No new blanket severity policy was imposed on PLAN.
5. **Frozen consumers accepted contradictory passed native receipts.** One
   shared verifier now checks terminal completion, exit status, unchanged
   fingerprint/epoch, profile hash, resolved command, inputs, port names,
   required outputs and exact grouped binding contracts. Completion and claimed
   artifact bytes are retained through existing matrix sources, including binary
   outputs; qualification and case acceptance both check their hashes. Cross-gate
   deterministic reuse and differing execution/binding refs remain supported.
   The producer also normalizes fresh relative and DB absolute artifact paths
   against the receipt artifact directory; escaped paths are rejected. A real
   check producing binary output verifies the producer-to-frozen-consumer path.
6. **Frozen baseline-policy comparison missed new metadata on an existing
   alias.** EVAL now matches FLOW's rejection of changed ports/inputs for a
   baseline alias, while still allowing materialization of declared new aliases.
   Input normalization was separately checked against FLOW (`.`, trailing slash,
   backslash and `{run_id}` resolution).
7. **A failed check with exit code 0 was misclassified as unavailable.** FLOW
   legitimately fails a check when required output is missing or the workspace
   was mutated. EVAL now verifies terminal completion and the failed contract,
   then reports failure and output gaps. Zero-exit failure without a proven
   contract violation is rejected; product/infrastructure attribution remains
   an independent Judge assessment.

## Scope and completeness

The fixes close implementation gaps in A/B/C/F/G rather than add a new product
requirement. E materialization/full due coverage, D joined cleanup and H source
delivery remain in scope of verification. Canon contracts need no additional
change: the accepted mandatory-fix, coverage and timestamp rules already require
these behaviors. Historical EVALs and installed/live runtimes are untouched.

## Verification and delivery

Corrected source identities:

- FLOW `12c15beb4e9302d68b5205f2272382515a557904`, branch `fix/cp187-matrix-admission`.
- EVAL `340a38c69505f5f13cbd75d22e29ed6fd01d02ea`, branch `eval/cp188-agy-update`.
- Canon unchanged: `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Strict build: FLOW `0.9.0-beta.123`, CLI commit above; canon `4.1.2`, commit above.
  This is a local source build, not package publication or live installation.

| Current review-tree verification | Result | Local evidence |
|---|---|---|
| FLOW expanded impacted set, 16 files | 209/209 PASS | `/tmp/dd-flow-060-review-impacted.log` |
| Full EVAL, installed policy and real offline CLI enabled | 398/398 PASS, no skips/cancellations | `/tmp/dd-eval-060-review-full.log` |
| FLOW runtime-sensitive, 2 files | 30/30 PASS | `/tmp/dd-flow-060-review-runtime.log` |
| FLOW release verifier / procedure | 1/1 and 8/8 PASS | `/tmp/dd-flow-060-review-release.log` |
| FLOW typecheck, lint, strict canon build | PASS | `/tmp/dd-flow-060-review-build.log`; typecheck/lint rerun after final source changes |
| EVAL cleanup/baseline/supplement targeted set | 15/15 PASS | `/tmp/dd-eval-060-review-cleanup.log` |

The expanded FLOW set includes all four seven-stage offline harness cells, Luna
repair, independently overloaded children, review/coverage/materialization,
MERGE, HITL, ownership and recovery boundaries. It is **not** a rerun of the entire
FLOW integration suite. Release tests do not publish a package.

Intermediate packaging negative: capacity checks were 27/28 because old `dist`
policy bytes differed from corrected source. A strict rebuild resolved that
mismatch; the installed-module assertion passed in the final 398/398 suite.
The assertion was not weakened.

Existing pre-review full FLOW integration was 1894/1894 and full EVAL 392/392;
those counts describe the previous commits, not the corrected review tree.

No remaining material implementation gap was found in the reviewed A–H scope.
Source/offline evidence does not prove live provider availability, successful
paid E2E delivery or model/product quality. No new E2E was prepared or launched;
historical runs and installed hooks were not changed. Fixes reuse shared policy,
existing authority ledgers and matrix sources without new dependencies or schema.
