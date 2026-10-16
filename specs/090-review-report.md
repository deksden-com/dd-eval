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
5. **Maintenance preparation delay was confused with an unknown mutation.**
   The generic storage deadline correctly defaults to unknown effects, but lease
   renewal preparation had not started its lease writer. That specific boundary
   now retains a retryable no-effect result. Writer/rollback/close uncertainty
   remains fatal; shared retry classification rejects all retained cleanup-error
   forms. The synchronous physical-owner guard no longer adds a redundant
   five-second wall cutoff before its isolated read: SQLite contention remains
   bounded, and the freshly observed token/PID/state/expiry still gate dispatch.
   This is not a retry wrapper around native or productive operations.
6. **Controller fixtures bypassed the observed subprocess transport.** Raw
   `execFile(timeout=60000)` killed a CLI during cold startup without inspecting
   its setup progress. The fixture now uses the existing shared transport with
   a unique operation binding, distinct startup/quiet windows and its composed
   finite CI envelope. Wiring/abort regressions supplement existing real
   progress and subtree-cleanup tests; no test outcome assertion is weakened.

Final engine source: `a098266d33162b328247616dcda989cb8314d145`, tree
`7f82f9d8e5aea988fd5afca79aec23c17108def3`.
EVAL executable source: `b683fb1d3a517f8ff1a06e1253fa1f5dc469f028`.
Final paired acceptance must include the subsequent original-cause retention
regression and scheduler/platform-independent assertions, not just the earlier
paired receipt below.

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
- Initial full engine run: hybrid 66/66, E2 133 PASS/one unavailable fish skip,
  E3 462 PASS/five explicit external-input skips, release 2/2 plus 8/8 PASS.
  Integration completed with 2803 PASS/four failures: two remaining test-double
  callers returned the old hook identity shape. Both callers now return the
  authoritative Session response and explicitly reject redundant SDK reads;
  assertions were not weakened. Affected files rerun: 256/256 PASS. The failed
  complete run is retained, not relabelled PASS. A fresh full gate and paired
  EVAL acceptance were selected on the new frozen build.
- Full paired EVAL acceptance: exit 0; 917 tests, 912 PASS, zero failures or
  cancellations, five explicitly gated external-input skips, 358.754 seconds.
  Tested checkout `407a902075e70939d2bc3d33dd14ea7b60028143` adds report-only
  commits to the executable source above. Private registry, source CLI/fixture
  adapter and the verified installed operational snapshot were explicit.
- Final complete engine rerun: in progress; not PASS. Under severe host load it
  exposed two additional issues: a resource-open timeout escaping read-only
  owner confirmation as a fatal unknown-effect error, and the controller fixture's
  raw fixed 60-second CLI timeout bypassing the shared observed subprocess
  transport. Boundary-specific fixes and regressions are being prepared in a
  separate checkout; the running candidate remains frozen.

Artifacts: `/Users/deksden/Documents/_Projects/_artifacts/plan-090-review.Lh1WVr/`.
Final rerun: `/Users/deksden/Documents/_Projects/_artifacts/plan-090-review-final.q0N3CM/`.
Frozen build-info SHA-256:
`4a26a31b0fe804a91cb1b490ae0027332ba921fbb218b5b89ed6cf8e6f8e85d7`.
Installed snapshot full-content checksum:
`08d92cdf3d07f5e31b3e395395f881b598437f7dc80578cb029ce7d6e4fb981e`.

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
