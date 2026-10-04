# CP194 — composed recovery readiness before Luna launch

2026-10-04. No scored CP194 EVAL has started. Supersedes the unlaunched
[maintenance-rejection candidate](cp-194-luna-plan064-maintenance-rejection.md).
Preserve older candidates, failures and qualification attempts; never rebind
their results to this candidate.

## Frozen candidate

- Engine beta.125 / `3d55ff54a1975f396c787b20867d9b79d28f0830`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/recovery-readiness`.
- Tarball SHA-256 `e9c2e79b2ab184da9d624cad63a508e9defdc423db001d11137bb7f0bb5de9e8`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-recovery-readiness/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Verified full-content engine SHA-256 `42b9d5954bd0cea7079cb587092d0b8b792c63fcb1f8fd47a07a339ea2b6a3db`.
- Checkpoint `cp-194-task-priority-plan064-recovery-readiness`; product and flow-pack pins unchanged.

## Additional test defect and correction

The previous serial full-suite attempt passed shard 1 (815 tests), but shard 2
failed its claimed-owner recovery scenario: a 45-second test wait expired while
the controller was alive, without `last_error_json`, and the ACK prompt was still
being dispatched. Daemon start and native Session resume had already completed.
This is not evidence that recovery reached the terminal acknowledgement.

The test incorrectly composed four 5-second attempts. Actual recovery has eight
sequential maintenance episodes: daemon register/confirm (two), and fresh
resume/prompt adapter leases before admission, admission, and leases after
admission (three each). Each episode has the existing 30-second reconciliation
budget. The test now imports `RENEWAL_POLICY.budgetMs` and composes those eight
episodes plus provider/readiness overhead. Its assertions and production's
5-second attempt/30-second uncertainty budgets are unchanged.

The previously failed scenario passed in 60.902 seconds with this correction.
Typecheck and lint passed. Production source is byte-identical to the preceding
`c826784` fix; only the recovery test changed. The preceding maintenance-rejection
fix and its 166 passing regression tests remain part of this candidate.

The installed package completed the actual PLAN/PLAN-REVIEW/CODE/MERGE matrix
fixture in 85.85 seconds. Normal qualification accepted four owning Stage
publications, receipt SHA-256
`a6458d83aba23b06cf9fbc1c0ed208861dd666bfae40f72ab0d6cda3cb02b82d`.
These are fresh packets bound to this installed engine, not copied acceptance.

## Remaining admission and launch

Run EVAL's complete suite serially with `DD_FLOW_SOURCE_ROOT`, the installed CLI
and `DD_EVAL_TEST_FLOW_ADAPTER=<flow-source>/test/fixtures/controller-stage-adapter.mjs`.
The adapter enables the two actual offline CLI integration tests previously
skipped by an unset environment variable. Then complete all six normal release
suites for this source and accept the frozen candidate through the release tool.
Suite failures are failures: do not waive them or inherit predecessor results.

Commit/push the definition and checkpoint before live qualification. Complete a
fresh exact-definition qualification and the bounded reference pair serially
after heavy offline checks. Retain semantic failures; never retry until PASS.
Then run one light preflight and one scored EVAL. Prove its own baseline PASS,
native Subject Session and actual RUN SPECIFY from controller/timeline.

Home `/Users/deksden/.dd-eval/qualification/cp-194-luna`; explicit `engine-config`;
resource home `/Users/deksden/.dd-eval/qualification/cp-191-resources`.
Subject `gpt-6-luna/xhigh`; Interaction and Final Judge `gpt-6.1-sol/high`.
Use `cx`, `CODEX_HOME=/Users/deksden/.codex-cpa`, and the installed CLI above.
Node compile cache `/tmp/dd-flow-cp194-node-cache.Tg7VgB` is compilation-only,
outside source and immutable snapshots. Do not stop foreign processes, extend
production deadlines, fix the product, resume historical EVALs, repair runtime
artifacts manually or create an automatic heartbeat.

## Full-gate outcome and retained registration evidence

The exact installed candidate passed EVAL's full suite: 458/458, zero skips,
including both actual offline CLI integration tests. Log:
`/tmp/dd-eval-cp194-recovery-readiness-full-tests.log`.
Release contracts passed. Integration shard 4 passed 296/296, including all
four seven-stage controller cycles, ordinary HITL, overload continuation and
both review-off variants. Log:
`/tmp/dd-flow-cp194-recovery-readiness-integration-4.log`.

The serial full-gate attempt then stopped in shard 2: 224 passed, one failed,
with the remaining files not run. Its `claimed-owner` recovery scenario passed;
`stop-before-ack` instead observed generation 1/sealed rather than generation
2/draining. That first failure did not retain sufficient underlying diagnostics
to establish its precise cause. It remains FAIL, not an acceptance receipt.
Log `/tmp/dd-flow-cp194-recovery-readiness-integration-2.log`.

A separate diagnostic selection ran all three stop/reply scenarios. Before-ACK
and lost-reply passed; after-ACK failed before the native Session/ACK/stop:
daemon registration and its registry reconciliation exhausted the existing
maintenance budget. Native calls contain only daemon start and its observation,
not Session resume/prompt. The terminal error is `process_maintenance_timeout`
at an exhausted prelaunch budget. This does not establish a stop-generation bug
or a particular SQLite writer/OS wait. Log:
`/tmp/dd-flow-cp194-stop-recovery-diagnostics.log`.

The recovery test now retains its existing controller/operation/native/log
diagnostics when the generation assertion fails, before fixture cleanup.
Shared startup reconciliation also retains `registration_error` instead of
discarding the failed register's cause/phases when status fails. Reconciliation's
fatal classification, native dispatch fence and production time budgets are
unchanged. The regression failed before the fix (missing SQLITE_BUSY cause),
then the complete managed-daemon selection passed 24/24; typecheck/lint passed.
Flow commit `c678a89` contains this additional diagnostic fix and is not the
already frozen/installed `3d55ff5` candidate. Do not silently treat old package
bytes or partial suite results as acceptance of the successor.

No candidate acceptance, live definition qualification, new preflight or scored
CP194 EVAL was performed while this full-gate failure remains unresolved. User
declined changing host load; foreign processes remain untouched. Investigation
uses only fresh offline fixtures, never historical EVAL repair/resume.
