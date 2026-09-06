# Recovery verification — 2026-09-06

Engine source: `a81ade7` (`0.9.0-beta.20`). Runner campaign checkpoint:
`cp-072-task-priority-project-flow-pack-4-0-6-engine-0-9-0-beta-20`.

- Full engine suite: 294 tests in 23 files passed. Subsequent focused snapshot
  suite: 8 passed; typecheck and lint passed.
- Full runner/adapter suite after retained-daemon changes: 198 passed.
- npm publication was refused (401 on `npm whoami`, 404 on publish). beta.20
  is not published. The campaign uses the documented local engine override.
- E2E preflight passed with AGY 1.1.27 and Codex CLI 0.153.4; no provider
  Sessions were created by preflight.
- Live AGY native-retention smoke passed. Session
  `c9d3da01-8290-425a-ae7f-459aba6c3e01` received a private test marker, then
  its daemon stopped cleanly. A second daemon loaded that same Session from
  the retained isolated store. A second prompt, which did not contain the
  marker, returned it exactly. Both turns used zero tools. The second daemon
  was also stopped cleanly. Evidence is retained locally under
  `/Users/deksden/.dd-eval/conformance/recovery-agy.e53EeL`.

This is evidence of root Session retention across a clean daemon restart,
not proof of selective child recovery, interrupted external effects, native
archive portability, or full interrupted → recovered → judged acceptance.
Full-flow E2E results and remaining plan-026 gates must be recorded separately.

## Six-adapter retained-root smoke

All six adapters completed the two-turn retained-context probe after a clean
daemon stop/restart. These are the final passing receipts under
`/Users/deksden/.dd-eval/conformance/` (earlier failures are retained too):

| Adapter | Evidence directory |
| --- | --- |
| AGY | `recovery-agy.e53EeL` (native daemon journal) |
| Codex | `undefined-recovery-vanjCa/receipt.json` |
| Droid | `dd-droid-recovery-nEvovi/receipt.json` |
| ZCode | `dd-zcode-recovery-FGdUGG/receipt.json` |
| Grok | `dd-grok-recovery-GvLere/receipt.json` |
| OpenCode | `undefined-recovery-m7F5Ed/receipt.json` |

The `undefined-` prefix was only a smoke-tool naming defect, since those
profiles infer their adapter. The tool now falls back to the harness name.

Live probes exposed and drove fixes for Droid's retained root identity,
ZCode/OpenCode response text, native package symlinks during daemon inventory,
and Grok's missing native root status. Grok now requires the durable native
session-created/end-turn receipt when status is absent, invalidates that
receipt before dispatch, and remains blocked after an unknown outcome.
One earlier Grok probe required verified process-group teardown after the
adapter could not confirm native settlement; it is not a successful recovery.

Reproduce with `node tools/native-recovery-smoke.mjs <profile-id>`.
The full runner suite after these changes passed 200 tests.
Native-root smoke success does not substitute for a full-flow result or for
the interrupted-work acceptance gates in plan 026.

## Subsequent full-flow attempts and snapshot checks

- `EVAL-20260906190344-6ffd759f` completed with failures and a retained Judge
  receipt. It reached PLAN-REVIEW, then native-child observation incorrectly
  supplied the EVAL ID to `dd-flow`. Runner commit `ce633aa` uses the reconciled
  flow RUN ID. Its old in-memory daemon inventory also rejected package
  symlinks; a read-only check with the corrected inventory confirmed clean
  settlement, without changing the historical failure or capture.
- `EVAL-20260906192305-814fa61f` completed with failures and a retained Judge
  receipt. Codex HITL Judge cleanup encountered a helper process group just
  after its leader exited. Commit `87eeafa` permits bounded passive settlement
  before refusing ownership; it never signals a leaderless group. The old
  Judge bridge PID 70165 was subsequently stopped after exact PID/command
  verification. Its `cleanup_failed` evidence was preserved, not relabeled
  as a clean recovery. The current full runner suite passed 204 tests.
- `EVAL-20260906193007-d5463c98` is the next normal-flow AGY attempt; its result
  is pending. It still uses the frozen beta.20 override, not later source.
- Engine commits `d753594`, `79787d3`, and `2a3818e` add pre-publication fsync,
  conflicted-index/object-pack/partial-MERGE restoration, and executable-mode
  integrity. The focused snapshot suite passed 10 tests and typecheck passed.
  Coverage includes staged-only binary objects, tabbed filenames, a deleted
  merge-source branch, index stages 1–3, merge-message drift, mode tampering,
  and refusal to publish after a failed flush. A full engine rerun is pending.

None of these runs yet qualifies interrupted → recovered → judged acceptance.
The additional engine commits have not been published to npm.

## Report history and stale MERGE continuations

- Runner `0861696` derives execution segments and historical interruptions from
  the operation journal. Capture enrichment does not count as a new failure;
  two recovery operations remain two segments. Reports retain the latest RUN
  usage measurement instead of summing overlapping cumulative snapshots.
  Active/provider-wait time remains explicitly unavailable, not inferred from
  segment wall time. The full runner suite passed 205 tests.
- Engine `32d70b5` rechecks the captured RUN generation after MERGE lane waits,
  bootstrap, checks, Work settlement and source-repair waits. A completed
  recovery does not revive a stale continuation. Route changes check the guard
  inside their write transaction. Typecheck and 15 focused checks passed,
  including a generation change during source repair before archival begins.
  This does not yet certify all mutation transactions or all adapter hooks.
- The normal-flow third E2E reached CODE and native child dispatch. Its final
  result and the full engine suite remain pending.
- `npm whoami` still returns E401. No registry publication was performed.

## Work evidence and import state

- Engine `8b44233` preserves a Work's original `started_at` across reopening
  and activates its recovery segment inside the session-binding transaction.
- `6a0f9ee` references the verified capture's Work directory instead of copying
  another archive inside SQL. Missing or symlinked directory components block
  recovery. The regression test refuses any copy during resume and confirms
  that subsequent edits to the working prompt leave captured bytes unchanged.
- `9fa63e4` keeps running Work session records intact during a sealed recovery
  import. Explicit resume closes them as interrupted, never as completed.
  Typecheck and all 10 snapshot tests passed after these changes.
- `bc11ec7` fences server MERGE queue selection, transactional claiming, adapter
  calls and late receipts. Recovery blocks automatic requeue and expired-lease
  reconciliation of guarded requests. All 17 focused server/repair/runtime
  tests passed, including an interruption between claim and first adapter call.
- The full engine run started before these edits ended with 295 passes and
  5 failures: newly edited tests ran against cached pre-edit source (including
  an old void guard and unguarded server dispatch). Fresh focused tests above
  passed. A new full suite is running against clean `bc11ec7`; engine source
  changes are paused until that run finishes. Its result remains pending.

The third E2E is still executing CODE. Fresh native import, authenticated hook
generation binding, selective child-session continuation and full interrupted
E2E acceptance are not claimed complete by these checks.
