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
   The admitted-command executor had the same defect at 120/600 seconds. A small
   test-only Node observer now applies those same durations as quiet windows,
   forwards diagnostics, and joins its owned command on SIGTERM/SIGINT. Existing
   synchronous memory-fixture callbacks and stdout/error contracts are retained.
   Regression covers distinct progress markers beyond the quiet duration,
   subsequent silence, signal cancellation and physical child join.

Previous failed engine source: `a098266d33162b328247616dcda989cb8314d145`, tree
`7f82f9d8e5aea988fd5afca79aec23c17108def3`.
Additional reviewed candidate: `02c0d90d833f753573f2a1c2f3de68e65cf74938`,
published to engine PR #79 after preserving the prior failed gate and teardown.
Follow-up fixture candidate: `658d746920da4c1b5c3d053eaa5e0b5b7f2ec09e`,
tree `604f659d8936ba19429fa6c312024d16300e3021`; acceptance artifacts will be in
`/Users/deksden/Documents/_Projects/_artifacts/plan-090-review-acceptance.kzQjaG/`.
Final frozen candidate after test-cleanup corrections:
`b1bb5a9fc8a957778b7770709986fd2cf67e0515`, tree
`53cdd9c2905eb9d043208b68939c4f52591d6695`.
Typecheck, lint and strict-canon build PASS; focused new regressions 41/41 in
four files PASS (14.75 seconds). The first lint attempt is retained separately;
its fixture teardown could mask a primary assertion and was corrected before
freezing this candidate.
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
- Previous complete engine rerun: FAIL. Under severe host load it
  exposed two additional issues: a resource-open timeout escaping read-only
  owner confirmation as a fatal unknown-effect error, and controller fixtures'
  raw fixed CLI/shell timeouts bypassing the shared observed subprocess
  transport. Boundary-specific fixes and regressions are included in the final
  frozen candidate above.
  ZCode exceeded its 1440-second whole-scenario envelope; Luna same-session
  reached completed MERGE Work but exceeded the same overall envelope while
  controller settlement remained pending. Host load reached 180.16. These are
  failures, not successful live EVALs or proof of green acceptance. No broad
  timeout increase, test retry, neighboring-process stop or merge was used.
  This prior run has now exited 1: integration 2802 PASS/five failures in one
  file, 165 other files PASS; 7899.08 seconds. Its runtime-sensitive group is
  NOT RUN because the chain stopped at integration. The failures are preserved.
  The fresh complete run on final candidate `b1bb5a9f` is in progress: hybrid
  66/66, E2 133 PASS/one unavailable fish skip, E3 462 PASS/five external-input
  skips and release 2/2 plus 8/8 PASS. The host reboot interrupted integration
  at 2026-10-16 21:37 local host time, without a final suite/exit receipt. That
  interrupted integration is NOT PASS, even though its observed cases had no
  reported failure. Source HEAD/tree, build-info and installed checksum remain
  unchanged. A fresh entire integration group followed by runtime-sensitive,
  installed, native mock and paired EVAL checks runs sequentially through the
  retained `finish-gates.sh` driver, with separate logs and exit receipts.

Artifacts: `/Users/deksden/Documents/_Projects/_artifacts/plan-090-review.Lh1WVr/`.
Final rerun: `/Users/deksden/Documents/_Projects/_artifacts/plan-090-review-final.q0N3CM/`.
Frozen build-info SHA-256:
`4a26a31b0fe804a91cb1b490ae0027332ba921fbb218b5b89ed6cf8e6f8e85d7`.
Installed snapshot full-content checksum:
`08d92cdf3d07f5e31b3e395395f881b598437f7dc80578cb029ce7d6e4fb981e`.
New frozen acceptance build-info SHA-256:
`244d447643a891d8701fad7523247055b9394bc98b371bd47f98be21c10c7deb`.
New verified installed snapshot checksum:
`a9d2c0f80d9a11c6710e8d342d9893f758d0b894ccfb72de6f960b9bda7a23c5`.
Its `dist` matches the new frozen source build byte-for-byte.

## Final fixture transport follow-up

After the reboot, the complete integration group finished with 2814 PASS and
five failures in `run-controller-stages.test.ts` (167 other files PASS,
4461.05 seconds). All eleven full-cycle/overload/terminal-cleanup scenarios
passed. The five failures share one test-only cause: `observed-shell-command`
retained structured CLI diagnostics but normalized every nonzero child exit to
1, hiding the expected input-refusal exit 2. The helper now preserves actual
integer child exit codes 1–255 and keeps the existing fallback for observation
loss/cancellation. Regression covers exit 2 and 17 with unchanged typed
no-effect refusal; quiet-window and signal cleanup checks also pass (4/4).
This does not change production error classification or relax assertions.

Final source after this correction:
`130fce2bba68640599f6def6c0b8012f5e07d907`, tree
`fd332a77f9ee104aef65ff35bfe47a74d7c4c280`.
Typecheck/lint PASS. A new build and isolated `home-verified` snapshot replace
neither global installation nor the earlier retained acceptance artifacts.
The entire `pnpm test` chain is rerun on this single frozen candidate, followed
sequentially by installed/native mock/paired EVAL checks. No partial prior
integration receipt is presented as a green full gate.

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

Cleanup so far: 18 obsolete checkouts, 18 local branches and seven actually
existing remote branches removed; five nonexistent temporary checkout metadata
registrations pruned. Current review/candidate checkouts remain necessary until
acceptance and integration complete. Engine PR #79 and EVAL PR #98 remain draft.
