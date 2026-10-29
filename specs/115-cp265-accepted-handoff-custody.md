# 115 — Accepted handoff is not a live PLAN admission check

Status: ready for implementation; RCA and readiness review complete.
Campaign: CP264/CP265, repair cycle 2 of 3. No new EVAL dispatched.

## Evidence and cause

Failed EVAL: `EVAL-20261029152150-eacbcd11`, published engine beta.160,
source `3d065fa9b570fdb25570e4c47d7c99a5d50d5574`.
Artifacts live under `/Users/deksden/.dd-eval/qualification/cp265-luna-full/runs/EVAL-20261029152150-eacbcd11`.

1. Baseline, SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW passed.
2. The three CODE Works completed, last WRK-012 at 16:58:02.846Z.
3. CODE checks requested repair WRK-013 at 17:00:47.115Z; it started
   17:01:14.072Z. This was working autonomous repair, not a failed child.
4. Native session-5 journal records the repair child's successful `mv
   apps/api/tests/api-json-contract.test.ts
   apps/api/tests/api-json-contract.integration.test.ts` at 17:08:42.172Z.
   Product correctness of that edit is outside this investigation.
5. WRK-013 completed 17:11:06.123Z. Child reconciliation at 17:11:19.942Z
   had no issues or pending children.
6. Parent invoked CODE finish with retry-check RCP-010. At 17:12:36.980Z
   it failed before re-running the intended checks: the old required_read
   filename no longer existed. Native Turn was interrupted 17:12:39.299Z.
7. Recovery capture became ready 17:12:50.539Z; execution failed
   17:12:54.130Z. Final Judge started 17:12:58.398Z and is not interrupted.

Root cause: `finishVnextCode` calls `validateVnextCodeHandoff`, which calls
the full PLAN preparation validator. `validateProjectedPaths` then demands
that historical reading inputs still exist **after** implementation changed
the tree. A valid admission-time precondition was incorrectly promoted to a
permanent invariant and terminal controller failure.

This is deterministic local code/artifact evidence, not an inferred provider
outage; web research is unnecessary for this established cause.

## Systemic audit

All callers were checked by the primary agent and independently audited:

- CODE initial/reconstructed start: `src/services/vnext-code.ts`.
- CODE finish, including post-repair: same module.
- CODE-REVIEW finish: `src/services/vnext-code-review.ts`.
- MERGE source-repair CODE start can also reach the start validator if the
  original prompt is absent; a finish-only exception would be incomplete.

Skipping only file existence is insufficient: full PLAN re-projection also
depends on current orientation files, optional check-profile existence,
available command resolution, live aspect catalog and merge policy. Legitimate
implementation changes can therefore retroactively invalidate the batch even
without the observed rename. PLAN-REVIEW already publishes exact accepted
PLAN/batch checksums; verification matrices already retain source custody.
Actual check execution validates its own executable/declaration at use time.

## Planned changes

1. Keep full schema/semantic/input availability checks at PLAN and PLAN-REVIEW
   admission. Do not accept a plan with missing original required inputs.
2. Replace post-acceptance handoff re-projection with exact accepted artifact
   custody. Reuse existing accepted PLAN-REVIEW report/checksum and source
   authorities; no new schema, certificate, ledger or dependency.
3. Preserve rejection of changed PLAN/batch, wrong RUN identity, missing
   acceptance authority and unsafe artifact paths. Do not trust an editable
   report alone: anchor it to its existing accepted publication receipt.
4. Apply the same shared custody check to initial/reconstructed CODE entry,
   CODE finish and CODE-REVIEW finish. Do not regenerate or overwrite the
   accepted batch to conceal changes. Do not edit failed EVAL artifacts.
5. Keep action-local gate command/executable validation and existing autonomous
   repair semantics. Removing stale PLAN validation is not skipping checks or
   declaring a failed gate passed.
6. Add affected lifecycle regressions: original input renamed/deleted after
   completion; orientation/profile/catalog mutations; CODE repair and review
   finish; reconstructed/source-repair entry; PLAN/batch/report tampering;
   missing original PLAN input; actual missing gate executable.
7. Review source and test changes, run only selected affected contracts, commit,
   push and squash merge by project rules. No full gate or GitHub CI.
8. Publish a fresh immutable engine, update pins/hooks, create fresh checkpoint
   and home with unchanged model/profile/capacity/product. Wait for the old
   Judge/capture consumer to settle before owned cleanup or shared-service
   shutdown. Launch once, record receipt/identities and update monitor binding.

## Readiness decisions

- Reuse `readAcceptedStageData` for PLAN-REVIEW: both accepted and review-off
  completion publish `stage-report.json` as their committed data. The initial
  attachment's decision schema is not the completed data contract. SQL receipts,
  attempt and independent completion hash establish custody; editable report
  bytes are not authority. Storage errors retain their original failure.
- Read accepted `semantic.batch_checksum`, compare exact batch bytes, then
  compare each checksum-bound batch source SHA with its current PLAN file.
  Require nonempty, unique safe protocol IDs and well-formed source hashes.
  No duplicated PLAN-set digest algorithm or circular review-module import.
- Matrix-marked and legacy runs use the same committed report authority;
  no fallback to mutable files if custody is missing. Review corrections publish
  final hashes; review-off publishes the same hashes without reviewer Works.
- Source PLAN paths are relative to the current registered workspace; accepted
  report relocation remains handled by the existing custody API. Batch sources
  themselves are hashed and cannot silently change during recovery/source repair.
- Historical required_read, orientation/catalog/profile existence is not a
  post-acceptance invariant. Due executable validation remains at actual checks.
- Test unchanged acceptance after rename and mutable input changes, alongside
  negative PLAN/batch mutation and missing SQL authority. Existing admission,
  path-security, command execution and publication custody tests remain selected
  affected contracts; no global suite fallback.

Ponytail review: remove wrong-phase validation rather than add filename rename
recognition, warning taxonomy, retries or another decision model. Input admission,
artifact custody and action-local check execution protect different actions.

## Implementation/review evidence

- Shared custody validator implemented in `vnext-plan.ts`; all existing callers
  inherit it without phase flags or separate warning policy.
- CODE regression file: 11/11 PASS, 11.11s. Initial sandbox bootstrap timeout
  retained; `ps` was denied. Only owned test PIDs were stopped; outside-sandbox
  repeat passed both bootstrap cases in under two seconds each.
- Four accepted-data/SQL-export/relocation contracts PASS; two existing review-off
  lifecycle contracts PASS. New rename regression first reproduced the defect
  against stale built snapshot; after rebuilding current source, only that
  failed scenario repeated: PASS33s through CODE and MERGE.
- Read-only replay against the actual CP265 database and original workspace
  returned zero handoff failures; no historical artifacts changed.
- TypeScript, affected ESLint and diff whitespace checks PASS.
- Independent implementation review found no significant defects; primary agent
  reviewed full diff and verified producer/receipt/restore compatibility.
- No full gate, GitHub CI, provider probe or new EVAL in this verification step.
