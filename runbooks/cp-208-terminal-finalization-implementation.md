# CP-208 — Plan 077 implementation receipt

This is deterministic implementation verification, not a scored E2E or release
acceptance. Historical CP-207 is untouched. No provider/model calls were made.

## Implemented contract

- Existing controller renewal uses recovery/generation authorization, not fresh
  launch admission. Physical identity, owner token and lease checks remain.
- Fresh native productive dispatch is forbidden on terminal RUN; retained
  operation observation and settlement remain available.
- Terminal stop uses the ordinary durable control worker and sealed capture.
  Terminal pause remains a no-op; RUN/index/integration commit are preserved.
- Terminal cleanup cannot authorize productive recovery, including a prepared
  resume raced against a later terminal transition.
- Read-only engine status exposes only scoped, causal finalization diagnostics.
  Retired exact identity proves absence; missing/ambiguous identity is unknown.
  A recorded capture operation is not itself authorization for Final Judge.
- EVAL retains primary failure, promptly blocks proven orphaned finalization,
  and attributes that failure to infrastructure even after cleanup succeeds.
  Sealed candidate/settlement barriers remain mandatory.
- Full-cycle assertions now precede fixture teardown and cover final sealed
  snapshot digest, seven stages, one MERGE, stopped Sessions and retired trees.

## Verification

Exact worktrees:

- dd-flow: `/Users/deksden/Documents/_Projects/_worktrees/dd-flow-077-finalization`
- dd-eval: `/Users/deksden/Documents/_Projects/_worktrees/dd-eval-077-finalization-plan`

Node v26.8.2, pnpm 10.23.0. Canon 4.1.2, unchanged. Dependencies installed from
the committed lockfiles. All checks below use deterministic mock native adapters
or local child processes, not live providers.

Completed:

| Gate | Result |
| --- | --- |
| `pnpm build` | PASS |
| `pnpm lint && pnpm typecheck && pnpm test:release` | PASS; release 2 Node + 8 Vitest tests |
| admission + controller + control-worker full files | 109/109 PASS, no skips |
| terminal-finalization + managed-lease-monitor | 17/17 PASS |
| controller-adapter full file | 20/20 PASS |
| controller-capture full file | 14/14 PASS |
| selected recovered-owner authorization | PASS; unrelated cases skipped by selection |
| dd-eval complete recovery + evidence-schema files | 68/68 PASS, no skips |
| full-cycle scenario matrix | 11/11 distinct scenarios PASS across the recorded disjoint jobs/reruns |
| staged/stop-target scenarios | 2/2 PASS |
| final beta.127 capture/shutdown/unclean matrix | 3/3 PASS; 122s/111s/240s |

The two disjoint full-cycle jobs initially covered ten distinct scenarios (four server
routes, shared inline, repair, two capacity and two terminal failures), plus two
existing staged/stop-target scenarios. One mixed-capacity assertion initially
included snapshot inspections, incorrectly demanding launch profile flags from
them. The test now excludes the explicitly declared `:boundary:` operation
namespace, not calls with missing model fields; every actual capacity inspection
still must carry the exact profile/cwd/project root. Its beta.126 rerun passed.

Terminal-failure tests were additionally strengthened to require settled control,
completed worker, sealed recovery and physically dead retired trees before
teardown. The beta.126 capture-failure rerun passed. The shutdown rerun exposed
an incorrect test expectation: its injection killed the daemon and durably saved
`clean:false`, which correctly cannot be promoted to clean merely because all
processes died. This is **not** an established additional runtime defect.

The final fixture distinguishes recoverable `tree_not_settled` before physical
shutdown from a genuinely unclean shutdown. The former must settle normally;
the latter must retain requested control/draining recovery and an exhausted
worker with no recovery capture, preserving the primary finalization error and
terminal RUN/MERGE. Both check physical retirement before teardown. The mock now
also supports real read-only `daemon.operation` inspection and journals the
`cancelTree` parameter. No production fences or proof requirements were weakened.
The final matrix has eleven scenarios. Final beta.127 failure reruns passed
3/3: capture and recoverable shutdown sealed normally; genuinely unclean
shutdown preserved the expected blocker. All exact owned trees were dead and
retired before teardown. Both final test jobs exited zero; no owned test job
remained running. Historical EVAL processes were not touched.

Representative commands (disjoint full-cycle selectors avoid duplicate fixtures):

```sh
pnpm exec vitest run test/run-control-admission.test.ts test/run-controller.test.ts test/run-control-worker.test.ts
pnpm exec vitest run test/terminal-finalization.test.ts test/managed-lease-monitor.test.ts
pnpm exec vitest run test/run-controller-adapter.test.ts
pnpm exec vitest run test/run-controller-capture.test.ts
pnpm exec vitest run test/run-controller-full-cycle.test.ts -t 'retains successful MERGE'
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-077-finalization node --test --test-concurrency=1 test/runner-recovery.test.mjs test/evidence-schema.test.mjs
```

Build/lint/typecheck/release gates passed again after the final beta.127 commit.
The production finalization code did not change between the recorded beta.126
and beta.127 gates; the latter corrects test semantics and candidate provenance.

The corrected dd-eval full suite completed with 766 PASS, 2 FAIL, 1 cancelled,
10 skipped (779 total). Failures were an 80ms network-progress fixture and a
5s cold observer child deadline; cancellation was the 60s canonical fixture
deadline. Serial repetition of all three plus finalization/scope regressions
passed **11/11**, with unchanged production/test timing values. The full-suite
invocation is retained as non-green; the separate rerun is not relabelled as
a clean full-suite result.

An initial dd-eval suite was incorrectly invoked without `DD_FLOW_SOURCE_ROOT`:
724 passed, 9 failed, 45 skipped; all nine failures require the explicit selected
engine source. This invocation is not a passing gate. The corrected invocation is:

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-077-finalization npm test
```

The first expanded full-cycle job was interrupted after a passing Luna/server
case and an inline aggregate test deadline while the fixture was still making
progress. Its exact mock-owned processes were drained and diagnostics retained.
The final matrix covers four server routes, shared Luna inline, repair, two
capacity scenarios and two terminal failures. Its test-only aggregate ceiling
accounts for seven newly observed bounded capture episodes; production budgets
are unchanged. Assertions run before teardown, which cannot create a PASS.

## Release and live boundary

Immutable development candidate:

- Engine version: `0.9.0-beta.127`.
- Source branch: `fix/077-terminal-finalization`.
- Source commit: `3cb058edc76d6150db6d3078e09a9766d8d27f85`.
- Source tree: `a5bad79b2625781e82c0d7ae552c629a5e5b92d5`.
- Tarball: `/Users/deksden/.dd-eval/qualification/cp-208-finalization-candidate-beta127/deksden-com-dd-flow-cli-0.9.0-beta.127.tgz`.
- Tarball SHA-256: `ff1826ee15e58340c392a1d9eee57b2584cc58fed4008c9846dd758ab9ee963c`.
- Receipt: `/Users/deksden/.dd-eval/qualification/cp-208-finalization-candidate-beta127/candidate.json`.

The earlier beta.126 built artifact is retained unchanged in
`cp-208-finalization-candidate`; it was never accepted, installed or published.
Beta.127 changes the test contract/provenance, not the production finalization
fix. A new artifact identity avoids replacing the earlier candidate bytes.

Source history: `0a8923a` implements plan 077; `3cb058e` corrects the shutdown
test contract. dd-eval uses task branch `fix/077-terminal-finalization`, based
on `568da6a`; prior plan-076 changes are not duplicated. Both task branches
are committed/pushed, not merged to main by this task.

Built from clean committed source with `DD_FLOW_BUILD_CANON_ROOT` pointing to
the unchanged canon and `DD_FLOW_BUILD_STRICT_CANON=1`. Packed with the normal
`release:candidate:pack`, then verified with `verifyCandidate` (tarball digest,
embedded source/version/canon). No npm publication or runtime installation.

It remains **built**, not accepted: the full required release suite set and live
E2E acceptance are separate. No active profile/runtime selection is replaced.
Judge inputs are unchanged, so no new live Judge qualification is warranted.

Future separately authorized E2E must verify final sealed capture, physical
cleanup, Final Judge and independent decision audit. CP-207 must not be resumed
or manually repaired to obtain that evidence.
