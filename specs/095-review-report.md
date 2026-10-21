# Plan095 implementation review

2026-10-21. Reviewed integrated FLOW `2fbbdf71`, EVAL `703fae1`, canon `51f7d71`
against plan095, including the user-approved targeted candidate acceptance in
§10. No new EVAL, release, pins or installed hooks are authorized by this review.

## Substantial defects fixed

1. **Installed smoke was not isolated.** Candidate acceptance and the registry
   consumer inherited operator HOME/config/resource/engine routing variables.
   Both now use one existing-module helper which creates private directories,
   removes inherited FLOW/native routing and provider settings, and preserves
   npm authentication and script policy. Installation also runs in the private
   consumer cwd. A real offline local-package regression supplies poisoned
   homes/routing, checks all four CLI invocations and an unchanged operator
   sentinel; the publish regression checks the same boundary without publishing.
2. **Discovery lacked interruption ownership.** `vitest list` ran synchronously
   before signal handlers and owned-process metadata. Discovery can import code;
   interrupting it could lose its child. Discovery and execution now share one
   asynchronous owned-phase lifecycle, signal handling, bounded drain and phase
   history. Tests interrupt each phase, including a zero-exit child: the gate
   remains non-PASS and discovery cannot dispatch the body.

No substantial additional defect was established in archive/template isolation,
the eight transferred target cases, real SQLite/process/race controls, receipt
scope/inventory/shard checks, metrics or the prior custody fixture corrections.
These conclusions include independent subagent review, rechecked by the root
agent. They are not claims that every possible runtime fault is eliminated.

## Verification

- Full typecheck and lint: PASS.
- Focused release/receipt contracts: 18/18 PASS; final release-only follow-up
  also PASS after explicitly disabling network/audit for its dependency-free
  local fixture. One initial regression assertion needed canonical realpaths
  for macOS `/var` versus `/private/var`; the failed attempt is retained.
- Fast baseline: 759/759 PASS. Hybrid: 66/66 PASS.
- Real installed smoke with poisoned operator environment: PASS, using the
  unchanged saved tarball SHA256
  `9d96234561bcd53f2dc343e024135245928112b77296056ebcf08ff9d90c836a`, engine checksum
  `7e812772fb569eff913a8f736bd945114b16500a732503a90ba71978712cbe5f`.
  Original candidate remains `built`, not release-accepted.
- Logs: `_artifacts/plan095/review-*.log`. No unchanged full profile was repeated;
  historical FAIL/interruption receipts remain unmodified. No runtime acceptance
  is inferred from this targeted tooling review.

## Integration and cleanup

FLOW review source: `ddb2e2e7`, integrated by
[PR104](https://github.com/deksden-com/dd-flow-cli/pull/104) as
`4d327bfa976a97cdaadde876e212174e69213496`. The merged tree exactly matches the
tested source. Documentation is integrated by a separate EVAL PR.

Cleanup archives and exact recovery manifest are stored privately at
`_artifacts/plan095-cleanup-20261021.bwrtvg`. Git bundles preserve historical
heads/branches; `.tasks` and real private files are archived before any removal.
The three superseded uncommitted fixture edits in `dd-flow-plan094-e3-verify`
are preserved as an archived Git stash commit, without rewriting their source.
An orphaned doctor-test fixture PID31226 was stopped only after verifying birth,
argv and cwd against its retained test source; it was not a live Grok EVAL.

The independent useful `fix/072-hitl-renewal` implementation is **not integrated
in main** and is retained locally/remotely. Active SPC-014/E5 and other foreign
Codex worktrees, primary checkouts, and working EVAL processes are excluded.
Verified historical cleanup: 43 worktrees, 16 local task branches and 12 remote
task branches removed, all preserved in the checked bundles/manifest first.
Remote deletion leases required the exact archived tip, preventing deletion of
concurrently changed branches. No shared history was rewritten.

The review's own two task trees/branches are retired after their PR merges;
their final removal is recorded in the PR handoff. Exact Node dependencies were
moved out of the retired094 checkout into the private archive before removal,
and the review symlink was rebound/checked; active neighbours did not use them.

Recovery: inspect `manifest.json` and `git bundle list-heads <repo>.bundle`,
then restore the required archived tag/HEAD with `git worktree add`. The dirty
fixture state is an archived stash commit and can be restored with
`git stash apply <dirty_commit>` over its original recorded HEAD. Private tar
archives contain operational receipts/private files; do not publish them.
