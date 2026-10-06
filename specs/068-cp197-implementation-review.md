# CP197 implementation review

Scope: FLOW PR47, EVAL PR48/49/50 and the CP197 launch contract. The prior
investigation is recorded in `runbooks/cp-197-luna-lifecycle-finalization.md`.
This review does not modify the live EVAL, its engine, product or fixtures.

## Plan coverage

- CLI publishes only the transactionally committed lifecycle rejection and
  successor authority. Existing rollback fencing remains in force.
- PLAN and PLAN-REVIEW correction use one check-catalog instruction. New aliases
  remain planned with a named provider Work; validation is not relaxed.
- Ordinary scored continuation finalizes after settled cleanup, including the
  recovery-budget boundary. Explicit cleanup remains nonproductive.
- Frozen candidate and report survive repeat finalization without Subject replay.
- CP197 uses the accepted engine checksum, real installed matrix packets and
  qualification@4 reuse. Startup is not full E2E acceptance.

## Substantive review findings and fixes

1. **Large diagnostics lose lifecycle authority.** The bounded shared error
   serializer walked fields in insertion order. PLAN errors put `errors` before
   `phase/effect/recoverable`; those controls could disappear before settlement
   classification, or a committed successor could disappear on reserialization.
   Reserve finite operational fields before optional messages/bulk diagnostics,
   retaining existing shared bounds. The EVAL transport uses the same policy:
   losing `cleanup_unconfirmed` must not enable registration adoption or turn an
   unresolved owner into a normal failure. A paired cross-transport test checks
   repeated serialization, typed causes, exact controls and the shared bounds.
   Do not expose truncated executable command
   or continuation authority. Regressions cover oversized error-first rejection
   through actual CLI/hook/retained outcome, repeated serialization and oversize
   authority rejection; compact and rollback checks remain.
2. **Infrastructure stop leaves queued siblings pending.** `mapLimited` returned
   cancellation only in memory; final projection rebuilt results from the journal
   and lost it. Cleanup-only observation then waited forever, while a replacement
   observer could dispatch the forgotten queue. Record cancellation under the
   journal lock for the current unstarted launch generation only, at initial and
   resumed boundaries. Settled cancellation is terminal without inventing a
   native operation; active operations still require physical cleanup. Regressions
   cover immediate failure, retained failure, delayed cleanup, repeated resume
   and unchanged candidate, with no queued Subject dispatch.

No framework, dependency, retry-until-PASS, product repair or per-harness override
was added. The two independent review findings were traced and checked by the
main agent. The normal transaction, journal and cleanup mechanisms are reused
in accordance with ponytail.

## Verification and integration

Full offline acceptance passed on frozen FLOW
`d2c8795e5dd3dd760bb98759a613bd9f774c9208` and EVAL
`62217f9597aaca0dd312947550346b0dd21c8e4e`, both clean. Canon:
`2e57b987ec91b7c3b0fa97f6169047802a1233fb` / 4.1.2. Environment:
Node v26.8.2, pnpm 10.23.0, macOS. Evidence directory:
`/Users/deksden/Documents/_Projects/_worktrees/dd-cp197-review.YiSwKt`.

- Typecheck, lint and strict canonical build: PASS.
- Release build checks: 2/2; release contracts: 8/8.
- FLOW integration: 2214/2214; runtime-sensitive: 43/43.
- Paired full EVAL suite: 596/596, zero failures/cancellations/skips/TODO.
- Full test inventories verified after each group and again after the EVAL
  suite; source and frozen build digests remain unchanged. No filters or retries.

FLOW source SHA256:
`37c54e7e68c069dd4084b711c5f7936f21b15dd04a5404c1f4895b8e3be83d78`;
dist SHA256:
`16bbc3e36e8a4f329e8ad3c5758c312e19efb1b91e48e211a24068e230767de9`.
This report-only follow-up does not change the tested EVAL implementation.
Historical acceptance remains attached to its original source/build; it is not
relabelled.

Integration follows `runbooks/git-workflow.md`, through coherent squash PRs:
[FLOW PR48](https://github.com/deksden-com/dd-flow-cli/pull/48) and
[EVAL PR51](https://github.com/deksden-com/dd-eval/pull/51). GitHub reported no
configured checks for these PRs; the complete local gates above are retained.
This review does not publish a replacement engine, modify global hooks, restart
the live CP197 EVAL or claim a completed scored E2E. Implementation review is
complete; live acceptance remains a separate result.
