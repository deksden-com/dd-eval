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

Focused regressions passed before final offline acceptance. Final receipts and
integration refs will be appended after the frozen full suite finishes. Historical
acceptance remains attached to its original source/build; it is not relabelled.
