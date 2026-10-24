# Plan 100 implementation report

Independent follow-up review found and corrected a missing OpenCode stop-state
publication and a fixture integration gap. See [100-review-report.md](100-review-report.md)
for the combined six-harness 290/290 PASS and final acceptance; the isolated
suite results below are preserved historical results, not a substitute for it.

## EVAL implementation and audit

Judge stop ACK preliminary acceptance now requires explicit `active_tree === false`, matching final physical-state validation. Missing, null and true activity evidence cannot be promoted to clean cleanup. Regression verifies the early rejection reason and unchanged saved verdict.

Audited unchanged consumers: `daemon-control.mjs`, `driver-recovery.mjs`, and `qualification-recovery.mjs` already require explicit false. The permissive runner cleanup-discovery prefilter is followed by `assertDaemonReplaceable`; it grants no independent replacement authority and was deliberately left unchanged. Historical @1 read-only validation is unchanged.

## Verification

Command:

```sh
node --test test/judge-cleanup.test.mjs test/judge-cleanup-legacy.test.mjs test/judge-observation-cleanup.test.mjs
```

Original result: 12 PASS / 1 FAIL, duration 98.6 seconds. The failed `final Judge cleanup distinguishes judge_result_invalid from cancellation authority` case failed before cleanup with an unknown previous driver outcome (`driver-recovery.mjs:166`), not the changed predicate. Preserve this original failure; do not describe the full command as PASS.

Targeted rerun:

```sh
node --test --test-name-pattern='stop ACK|all Judge|Judge verdict|retained @1|historical reader|final Judge cleanup distinguishes judge_result_invalid' test/judge-cleanup.test.mjs test/judge-cleanup-legacy.test.mjs test/judge-observation-cleanup.test.mjs
```

Result: 6 PASS / 0 FAIL, duration 43.6 seconds, including the initially failed case. New strict-activity regression and historical proof validation passed in both runs. `git diff --check` PASS.

## Engine integration

Engine integration branch: `fix/plan100-integration`, PR dd-flow-cli#120.
Source changes reviewed by integration owner: explicit proof-bound Codex idle
publication; productive/native activity invalidation; same-generation/revision
late-activity check; strict shared shutdown; one OpenCode finite-batch decoder
used by revision and completion. Domain events and sync markers are separate.

Targeted commands (in the owning engine worktrees):

```sh
node --test test/fixtures/daemon-operations.mjs
node --test test/fixtures/codex-adapter.mjs
node --test test/fixtures/opencode-adapter.mjs
```

Results: 27/27, 64/64 and 38/38 PASS respectively. Shutdown exploratory runs
before final fixture correction and under host `ps` observation timeout were
not PASS; final full targeted suites supersede them without deleting history.
The race/cancel regressions include native interruption, terminal notification,
read-induced idle and late activity; no provider/model calls were required.
Syntax checks and final fixture ESLint/diff checks PASS.

Integration owner verification on combined engine branch:

- `pnpm gate:merge`: PASS; typecheck, lint, integration-fast 770/770 and
  hybrid contracts 66/66. Log `/tmp/plan100-engine-merge-gate.log`.
- `pnpm build`: PASS, log `/tmp/plan100-engine-build.log`.
- Built runtime native OpenCode 2.0.31 no-model smoke: PASS using
  `P100_RUNTIME_ROOT=<integration-worktree>/dist/harness-runtime/lib node
  /tmp/cp246-opencode-observe.mjs`. Actual create/get/log and Runtime
  requireSettled returned idle/settled without any experimental override.
  Input/output/reasoning tokens=0, cost=0; owned server PID11677 exited130
  after SIGTERM. Log `/tmp/plan100-built-opencode-smoke.log`, native evidence
  `/tmp/cp246-opencode-observe-Xh7yyW/evidence.json`.

Engine implementation integrated through dd-flow-cli PR120; EVAL PR143.
These are implementation/merge checks, not a new full release acceptance.

No beta.148 acceptance receipt is reused for changed bytes. Package publication,
default hook upgrade and fresh scored EVAL are not claimed by this implementation
review; they require a separate frozen release/launch step.

## Operational boundary

No new EVAL, model request, publication, hook update, or modification of historical runtime/proof artifacts. GitHub CI was not launched. Release/publication and new EVAL remain separate operator-authorized steps.
