# CP194 — bounded maintenance rejection before Luna launch

2026-10-04. No scored CP194 EVAL has started. Supersedes the unlaunched
[HITL-phase candidate](cp-194-luna-plan064-hitl-phase.md); retain all older
candidates, suite logs and live Judge attempts without rebinding their results.

## Frozen candidate

- Engine beta.125 / `c8267845f5ee9858b1a839bf5bceca82bdcc6fb2`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/maintenance-rejection`.
- Tarball SHA-256 `55cb107c90513479a7c029f9f79f11aeff96609d540e25219cacce562c0f2b04`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-maintenance-rejection/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Verified full-content engine SHA-256 `a3c935f2f9b5fd1ed60ce222b8a0bdfbc4b920bc3d05e5ebaeee8d65bb0e9e02`.
- Checkpoint `cp-194-task-priority-plan064-maintenance-rejection`; product and flow-pack pins unchanged.

## Confirmed additional defect

The previous live definition qualification completed ten questions with actual
Judge results and settled cleanup, then failed before question 11's native
Session. Its `runtime process register` entered the CLI with 380 ms remaining;
the resource open consumed that budget. The general error handler then created
an unrelated, unbounded RUN router and queried lifecycle hooks after expiry.
This also delayed child cleanup, producing `process_maintenance_timeout` and
`judge_cleanup_ownership_unknown`. Do not call it a semantic Judge failure.
Retain attempt `operation-0b8ebca5-7a25-4355-901d-79aca4f18ead` under qualification
key `a24ca440012cbdb584b3d86d9b78c9107dab7a2ed0d3e9a3e220e6835d4b802d`.
Read-only registry status later found no row for that failed registration; it
does not rewrite the original unknown-cleanup receipt into PASS.

The shared CLI catch paths now parse the command before opening diagnostic
storage. Only lifecycle/auxiliary commands can correlate a lifecycle hook.
The shared native-event lookup also rejects unrelated commands before SQL.
All seven maintenance verbs failed their regression before the fix, then the
complete admission/diagnostic selection passed 166 tests. Correctable lifecycle
rejections still retain their physical hook identity. Typecheck and lint passed.

One aggregate review-off integration test performs 37 CLI calls across six
Stages plus repair/crash/replay checks. Its original 120-second outer timeout
failed under load, while the unchanged isolated scenario passed in 22.14 seconds.
Only its aggregate test budget is now 240 seconds; both variants passed in
38.58 seconds. Individual requests, production maintenance's 5-second limit
and its existing 30-second uncertainty budget are unchanged.

## Actual evidence and outstanding admission

The new installed package completed the real PLAN/PLAN-REVIEW/CODE/MERGE matrix
fixture in 106.28 seconds. Normal matrix qualification accepted four owning
Stage publications, receipt SHA-256
`ab1c08b88191a712a8267edb5b5fefd4526ec79c1875084b20c17ed6db318c8d`.
Engine installation and independent byte verification passed.

Release contracts passed. The first complete integration attempt stopped in
shard 4: all four HITL cells and the seven-stage Luna cell passed, but the Grok
seven-stage fixture hit `process_maintenance_timeout` during registration.
Its handler entered with 3144 ms remaining and last reported a RUN store open
with 2656 ms remaining; the log cannot establish a specific blocked SQLite
writer or the precise later OS wait. Preserve this as FAIL, not acceptance.
Log `/tmp/dd-flow-cp194-maintenance-rejection-integration-4.log`.
An independent serial complete verification uses
`/tmp/dd-flow-cp194-maintenance-rejection-serial-*`; only actual completion of
all required suites can authorize normal candidate acceptance. Never waive a
failure or inherit old package test results.

Native Node compile cache `/tmp/dd-flow-cp194-node-cache.Tg7VgB` stays outside
source and immutable snapshots. `NODE_COMPILE_CACHE_PORTABLE=1`; compilation
only is cached, never operation/admission results. Do not terminate unrelated
applications or increase production deadlines to turn a failed gate green.

## Launch sequence

Use home `/Users/deksden/.dd-eval/qualification/cp-194-luna`, its explicit
`engine-config`, and resource home `/Users/deksden/.dd-eval/qualification/cp-191-resources`.
Subject `gpt-6-luna/xhigh`; Interaction and Final Judge `gpt-6.1-sol/high`.
Use `cx`, `CODEX_HOME=/Users/deksden/.codex-cpa`, and the exact installed CLI above.

Commit/push the definition and checkpoint before live qualification. Complete
EVAL checks with `DD_FLOW_SOURCE_ROOT` and the exact installed
`DD_EVAL_TEST_FLOW_CLI`. Accept the candidate only after its required suites.
Then run fresh definition qualification and the runbook's bounded reference
pair, serially after heavy offline suites; preserve semantic failures and do
not retry them until PASS. Old partial results are not reusable admission.
Run one light preflight and one scored `runner eval run`. Prove its own
baseline PASS, native Subject Session and actual RUN SPECIFY independently of
observer acknowledgment. No product changes, historical resume, manual runtime
repair or automatic heartbeat.
