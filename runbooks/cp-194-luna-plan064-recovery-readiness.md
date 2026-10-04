# CP194 — composed recovery readiness before Luna launch

2026-10-04. No scored CP194 EVAL has started. Supersedes the unlaunched
[maintenance-rejection candidate](cp-194-luna-plan064-maintenance-rejection.md).
Preserve older candidates, failures and qualification attempts; never rebind
their results to this candidate.

## Earlier frozen candidate (not the launch candidate)

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

## Successor test diagnostics and aggregate budgets

The `c678a89` full-gate attempt passed release contracts, then stopped in shard 2:
69 tests passed and the protocol/RUN mismatch test failed with an empty Stage
chain. That test had discarded the attach/complete setup results; the original
setup cause cannot be reconstructed. Commit `2b06ef5` asserts both responses
with their full diagnostics. The exact test and the entire CLI file then passed
(127/127, zero skips); typecheck/lint and strict-canon build passed. These are
targeted evidence, not acceptance of the complete suite set.

The next full-gate attempt passed release contracts and that mismatch scenario,
then stopped after 70 passed tests: the guidance scenario timed out at 120 s.
Its fixture removal also failed with ENOTEMPTY while the timed-out test's
operation was still active. Log:
`/tmp/dd-flow-cp194-setup-gate-integration-2.log`.
The unchanged isolated guidance scenario passed in 87.84 s. It contains 21
sequential CLI calls and does not assert a latency SLA. Commit `e0cfd47` budgets
this composed test at 240 s, without altering assertions or any production
command, maintenance, or retry deadline. Typecheck/lint and strict-canon build
passed; the user declined host-load changes and no foreign process was stopped.

A fresh serial complete suite set ran for `e0cfd47`: release contracts and all
127 CLI tests passed, then snapshot/fork exceeded its own 60 s override
(77.888 s), leaving 128 passed tests and one failure. Log:
`/tmp/dd-flow-cp194-guidance-gate-integration-2.log`.
The unchanged isolated snapshot/fork test passed in 36.24 s. It composes real
snapshot copy/verification, successful replay and negative corrupt-source,
request and path-conflict cases, not a latency SLA. Commit `63113cb` removes
its separate 60 s override and uses the existing suite budget of 120 s;
assertions and production deadlines are unchanged. Focused lint passed.

No successor is accepted or installed as the CP194 launch candidate yet. All preceding FAIL
receipts remain FAIL. No new definition qualification, preflight, or EVAL has
been launched during these checks.

## Controller-cell composed readiness

For `63113cb`, release contracts and integration parts 2/4 (526 tests), 1/4
(815 tests) and 3/4 (395 tests) all passed. Part 4/4 stopped after five passed
tests: the Grok routing-only cell exhausted its hardcoded 30 s Stage-prompt
wait while the controller was running with no last error. Its original
diagnostic lacks the operation/native call sequence; the exact delayed phase
is therefore unknown. The remaining files and runtime-sensitive suite were
not run. This remains a failed complete-gate attempt, not acceptance.
Logs `/tmp/dd-flow-cp194-snapshot-budget-gate-*.log`.

Code tracing established a related fixture budget defect: daemon register and
confirm, followed by create and prompt with renewal before/admission/after,
compose eight maintenance episodes, each using `RENEWAL_POLICY.budgetMs`.
The shared four-harness fixture now imports that policy for Stage readiness
(eight episodes plus 25 s overhead) and composes its short-scenario outer
budget from client calls and two Stage boundaries. It does not extend any
production request, uncertainty or retry deadline. Routing checks fail
immediately on a retained controller error, and timeout diagnostics retain
controller operations, native calls and physical liveness before cleanup,
without logging lease tokens. Assertions about Session count, profile,
fences, Work and no replay are unchanged. Typecheck/lint passed.

## Business-router import exceeds maintenance transport

The exact `d988ac0` complete-gate attempt passed release contracts, then stopped
in integration 4/4 after two passing tests and one failure. This was not the
fixture Stage-readiness timer: registration exceeded its 5 s production
transport (5313 ms), then read-only status reconciliation exhausted the 30 s
uncertainty budget. The preserved `registration_error` is working. No native
Session dispatch began, and no child maintenance phase was emitted. Remaining
suites were not run. Log `/tmp/dd-flow-cp194-stage-readiness-gate-integration-4.log`.

A read-only import probe, without CLI dispatch or SQL, took 10094 ms just to
import `dist/cli/run-cli.js`, longer than the transport contract. Log
`/tmp/dd-flow-cp194-cold-router-probe.log`. This reproduces the architectural
startup bottleneck under current host load; it does not establish the exact
duration of that historical child's import or an unrelated SQLite writer.

The successor introduces a short ingress only for bounded JSON maintenance
inside an already-selected engine. Syntax inventory, input preparation,
registration/renewal/admission/finish dispatch and recovery fences are shared
with the ordinary CLI. Operator routing, help and rich output retain the full
router. Compatibility and import/writer guards are not waived. Reconciliation
`status` also carries its absolute deadline and request-local phase evidence,
using a read-only resource store. Diagnostics start before service imports.
Production 5 s attempts, 30 s uncertainty and physical ownership fences are
unchanged; no foreign process was stopped.

The initial focused selection passed 27/27, including syntax/lease/ownership
parity and a subprocess that rejects any business-router import. Import probe
observed 32 ms for ingress and 319 ms through maintenance services. Logs
`/tmp/dd-flow-cp194-light-maintenance-focused-built.log` and
`/tmp/dd-flow-cp194-light-maintenance-import-probe.log`. These are targeted
evidence, not complete release acceptance. The subsequent light recovery-guard
dependency extraction must also be checked by the exact-source complete gate.
No CP194 EVAL, preflight or new live definition qualification has started.

## Accepted lightweight-maintenance launch candidate

The exact `776112522e59fab5c977d43b0c0c1cd5b54940eb` source passed the complete
serial FLOW gate without source edits or waived tests: release contracts,
integration 4/4 (296), 2/4 (533), 1/4 (828), 3/4 (378), and runtime-sensitive
(32). Logs `/tmp/dd-flow-cp194-light-ingress-gate-*.log`. Typecheck and lint had
also passed for this source. All earlier failed attempts remain failed.

The fresh candidate is
`/Users/deksden/.dd-eval/qualification/cp-194-candidate/light-maintenance-ingress-7761125`.
The normal release tool accepted it after a fresh consumer installation and
engine/compatibility checks; log
`/tmp/dd-flow-cp194-light-ingress-candidate-accept.log`.
Tarball SHA-256 `96540a51cdd8ddaafed3dee5d74ed7e5c203994f9a012658ae1bcd52b113d1d8`.
Installed CLI for all remaining CP194 commands is
`/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-light-maintenance-ingress-7761125/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
Its full-content engine snapshot SHA-256 is
`8f77983cdb70218e26c0df17089307ae4335d67ea1c55a71e9db59248ad06b2d`.

The installed-package PLAN/CODE/MERGE lifecycle fixture passed in 47.22 s;
only this selected fixture was run, not the other tests in that copied file.
All 16 production imports use the new installed package, with unchanged test
assertions. Retained fixture:
`/Users/deksden/.dd-eval/qualification/cp-194-candidate/light-maintenance-matrix-fixture-7761125/qualification-evidence/fixture.json`.
Normal matrix qualification accepted four owning Stage publications and the
final MERGE authority. Receipt
`checkpoints/cp-194-light-maintenance-verification-matrix-qualification.json`,
SHA-256 `9c68275e908c858b4a985270fd754386cb2aa44ebe9317faf6b5683a59b3bede`.
Code-review is explicitly skipped by this fixture's existing review-off policy,
not advertised as a matrix publication. The fresh consumer and fixture engine
snapshot checksums match.

EVAL's full suite also passed against the newly installed CLI, with the real
offline adapter enabled: 458/458, zero skips, serial execution, 310.01 s.
Log `/tmp/dd-eval-cp194-light-ingress-full-tests.log`.
The unlaunched CP194 checkpoint and case hash now bind this exact engine and
new qualification packets; product baseline, flow-pack and canon pins remain
unchanged. The pending home uses the new installed adapter and `cx`.
The focused `fixtures validate` command without `--revision` correctly refused
this case, which has no accepted focused entry pack; log
`/tmp/dd-eval-cp194-light-ingress-fixtures-validate.log`. It is not a passed gate
or an E2E blocker: this launch uses the checkpoint and normal qualification/
preflight, not a manufactured focused revision.

Commit this definition before the fresh 18-item live Judge qualification;
then run one light preflight, the bounded six-Session reference pair, and one
scored Luna E2E only if those gates pass. Do not change the committed definition
during these operations, manufacture results or retry a semantic rejection
until PASS. Baseline PASS must come from the actual scored execution, followed
by its native Subject Session and actual SPECIFY timeline evidence. No automatic
heartbeat, historical resume or manual artifact repair is authorized.
