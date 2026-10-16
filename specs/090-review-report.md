# 090 — Implementation review

Scope: review P1–P9 and readiness contracts R1–R7, fix substantial defects,
integrate through reviewed PRs, remove only obsolete recoverable checkouts/refs.
No release, global hook/pin changes, scored EVAL launches or control of working
EVAL processes is part of this review.

## Findings corrected

1. **Owned OpenCode hook identity failures could disappear.** Native ancestry
   discovery and Session inspection ran outside failure retention; the plugin
   also performed a redundant Session read before asking the daemon for binding.
   A native tool renderer could consume the exception while the controller had
   no bound failure to observe. The daemon now owns the single identity read,
   derives cwd from native directory plus tool workdir, returns only necessary
   metadata, and retains the original failure for the exact current owned
   operation. Foreign/stale requests cannot poison another generation; an await
   cannot publish admission after the generation changes. The plugin uses this
   identity/binding rather than reading it independently.
2. **Two automatic cleanup callers inherited operator authority.** Initial EVAL
   and qualification finalizers omitted `cleanupOrigin`, whose default is the
   explicit operator mode. A new execution starting between the eligibility
   read and cleanup lock could therefore be stopped. Both callers now request
   automatic retirement, so eligibility is checked again under lifecycle lock
   before any native call. Operator authority remains explicit and unchanged.
3. **Failed inline cleanup observations could replenish their budget.** Only
   successful observations persisted spent time. A command failure left the old
   budget, allowing repeated preparation requests to repeat the wait indefinitely.
   Errors now persist the consumed budget and original typed cause, preserving
   previous evidence without manufacturing physical-stop proof. Exhausted requests
   become `recovery_blocked` and fail before another native call. The regression
   checks error persistence and exhausted retry without a short scheduler race.
4. **Prelaunch lock preparation wrote before checking its path boundary.** A
   symlink resource home could acquire a new `locks` directory in another target
   before the later canonical-path refusal. The nearest existing ancestor is now
   validated before mkdir; all homes are validated before any creation. Fresh
   canonical paths remain supported. Absolute paths are normalized before
   deduplication/order so equivalent `..` spellings cannot recursively acquire
   the same lock and spuriously time out.

Engine source: `f83e5175405fadd54310b839c9c0941873abb039`, tree
`91a4cd66eba9f50b29447f43d75d048bbad5eb47`.
EVAL executable source: `7e3192e017bcf813781dfcabc07c2a7cbe8f0d8e`, tree
`7fcc7b52bea125eeda666eb326f00bf50c280941` (report-only follow-ups do not change
executable inputs).

## Verification

- Independent route/bundle review: no further substantial defect; workspace
  route 5/5 and targeted E3 route regression PASS.
- OpenCode adapter fixture: 34/34 PASS. Owned native read failure, foreign/stale
  generations, native cwd authority and metadata boundaries are covered.
- Installed native OpenCode plugin against a local mock provider: 1/1 PASS.
  This is protocol conformance, not scored live qualification.
- Retirement/qualification focused regressions: 18/18 PASS; active execution
  rejects automatic retirement before native inspection/stop.
- Typecheck, lint and strict-canon build: PASS. Frozen canon v4.1.2,
  `1ddedf9d3f086e046f8e7b194c739ec386e7c8b9`.
- Full engine and paired EVAL acceptance: in progress; not yet PASS.

Artifacts: `/Users/deksden/Documents/_Projects/_artifacts/plan-090-review.Lh1WVr/`.
Frozen build-info SHA-256:
`0ffce145d741700677c0b7260c5dd0b5edc3e3b8455357c7d8ad049fdc958a00`.
Installed snapshot full-content checksum:
`dbfdb3a7f6e875c3331344d7feb0965035c4a3a365d6b9d70ff966b4b5eadbff`.

## Repository cleanup boundaries

Merged refs are checked against actual origin/main ancestry or exact merged PR
trees, not against stale local main. No primary checkout is reset or switched.
Uncommitted historical material was committed and pushed under archive tags
before checkout removal:

- EVAL `archive/20261016-plan090-readiness`: original readiness snapshot.
- EVAL `archive/20261016-early-luna-decisions`: early standalone experiment.
- Engine `archive/20261016-cp189-installed-probes`: historical installed tests.

Parallel Memorybank E4, release snapshots and source paths retained by historical
EVAL definitions remain. `dd-flow-089` remains because two live fixture daemons
reference its code. Unique unintegrated E0 and HITL-renewal work is not discarded
or silently merged into this review. Remote deletions use exact-ref leases;
already absent remote branches are removed only from stale tracking metadata.
