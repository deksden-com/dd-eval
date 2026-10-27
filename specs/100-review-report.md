# Plan 100 independent implementation review — 2026-10-24

## Scope and result

Reviewed engine origin/main `54899ed0` and EVAL `9977b7ea`, plan100 and
implementation report. Primary local main branches have unrelated unpublished
E5 integration commits; they and active E5 worktrees are preserved.
No new EVAL, model request, release publication, global hook upgrade or historic
runtime mutation is part of this review.

## Substantive defect found and corrected

OpenCode daemon.stop reobserved its owned tree as settled but did not publish
`active_tree:false`. A prior observation failure could leave true forever,
making the strict shared shutdown reject a newly proven clean stop.

Fix: after successful native settlement, commit the existing shutdown fence,
then publish false. Never infer readiness from process exit. Busy remains a
refusal; late activity cannot be overwritten into clean. Regression checks
stale true→fresh idle, busy, late activity during publication, and productive
dispatch blocked at the publication boundary.

The existing physical-stop fixture also masked a contract integration gap:
it omitted activity and replaced persist with a noop. Its prior PASS was on
the isolated OpenCode branch before strict shared shutdown was combined.
The reviewer reproduced its failure on the merged tree. Fixture now mutates
retained state; a separate incarnation tests physical failure rather than
replacing a child after completed shutdown phases have been retained.

## Cross-harness audit

| Producer | Positive execution proof publication |
| --- | --- |
| Codex | prepareCodexStop after native wait, current revision and dispatch fence |
| AGY | Native proof/revision and admission/result state; uncertain cancellation stays unclean |
| ZCode | prepareStop after required-work observation |
| Grok | refreshTree after owned root/descendant observation |
| Droid | closeTree publishes false; native settlement separately validated |
| OpenCode | Missing publication corrected by this review |

No additional confirmed unsafe-clean issue found in Codex. OpenCode finite-log
decoder independently reviewed against pinned SDK union; revision and completion
share it, sync is neither a model-progress signal nor terminal outcome.
Unsupported/corrupt/foreign evidence remains a refusal. EVAL recovery readers
remain strict; the runner discovery prefilter grants no replacement authority.

## Verification

- EVAL: `node --test test/judge-cleanup.test.mjs test/judge-cleanup-legacy.test.mjs
  test/judge-observation-cleanup.test.mjs` — 13/13 PASS, log
  `/tmp/plan100-review-eval-tests.log`.
- Corrected OpenCode fixture — 39/39 PASS, log
  `/tmp/review100-opencode-stop-tests-r2.log`; syntax/fixture lint/diff checks PASS.
- Combined cross-harness fixture run: **290/290 PASS**, no skips, 135.2 seconds,
  log `/tmp/plan100-review-cross-harness.log`. One sequential Node test invocation
  covered daemon-operations, Codex/OpenCode/AGY/ZCode/Grok/Droid adapter and daemon
  fixtures, including AGY native-inspection/state-boundaries. All use offline
  native fixtures; no model or scored EVAL was launched.
- `pnpm gate:merge`: PASS (typecheck, lint, fast770/770, hybrid66/66), log
  `/tmp/plan100-review-merge-gate.log`. `pnpm build`: PASS, log
  `/tmp/plan100-review-build.log`. Diff check PASS.

Engine follow-up: PR121. EVAL report follow-up records this reviewed acceptance.
Earlier separate-branch PASS is retained as historical evidence, not presented
as the combined producer/consumer acceptance.

## Cleanup and operational boundary

Only clean obsolete worktrees and PR-confirmed merged task branches are removed.
Untracked `.zcode` service state and original plan copy preserved under
`/Users/deksden/.dd-eval/qualification/plan100-review-cleanup-20261024/`.
Git commits remain available through merged PR history; primary main and E5
worktrees/branches are not cleanup targets.

P1–P4 implementation and merge acceptance are distinct from P5 release/live E2E
acceptance. The latter is deliberately deferred; no claim that existing CP246
attempts now pass or that installed engine/hooks have changed.
