# Plan 066 implementation receipt

Status: implementation and all local acceptance gates complete. GitHub workflow
execution was not requested or run; local shard and workflow-contract checks PASS.

## Scope and provenance

FLOW base `ff066da`, implementation branch `fix/066-test-suite-optimization`;
EVAL base `b954eab1a10020f28cb805df23f1fd0588f09bc8`, documentation branch
`docs/066-test-suite-optimization`. These branches deliberately depend on the
current plan 065 feature branches, not older main: no concurrent changes were
copied into the task and no history was rewritten.

Immutable canon: `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
Node `v26.8.2`, pnpm `10.23.0`, Vitest `4.1.7`, macOS.
Reports: `/Users/deksden/Documents/_Projects/_worktrees/dd-plan066-acceptance.XLYf8P`.
Every comparison uses one frozen source/build tuple, fresh fixture roots,
unchanged Vitest cache, no competing task-owned suite, and no paid provider.
External machine load is not controlled; paired order is alternated.

## Implemented decisions

- Group selection lives in `vitest.config.ts`; unknown future files default to
  serial. Standard Vitest projects/forks provide isolation, grouping and sharding.
- Fast cases are unchanged. Runtime-sensitive remains serial. CI retains four
  separate one-worker VM shards, not four VMs multiplied by local parallelism.
- Local observation time advances only after existing physical-owner proofs;
  native deadlines, process ownership and uncertainty retention are unchanged.
- Seven full-cycle cases moved verbatim to their own file. File-owned cleanup
  lists remain separate; shared setup has no top-level test hooks.
- A standard-library receipt wrapper records exit code, full JSON, logs and
  source/dist hashes. Symlinks are hashed as links, not followed as directories.
  Discovery and actual shard-result union must agree before candidate acceptance.
- Native child TAP reports are retained independently of bounded diagnostic tails.
- CI builds before release verification and preserves failure reports. Required
  candidate-suite identities and immutable publish/recovery remain unchanged.
- Commands and limits are documented in
  [the verification runbook](../runbooks/flow-test-suite-verification.md), with
  links from both READMEs and existing operational runbooks.

No runtime source/policy changes, dependencies, global-hook updates, release or
live E2E are included.

## Baseline and discovered fixture defects

Fresh base integration: 126 files, 2204 cases, 2203 PASS / 1 FAIL,
2055.43 seconds Vitest duration. Native: 2 files, 42/42 PASS, 149.01 seconds.
Release: 2 Node + 8 Vitest PASS. These are not the historical 2203-case audit.

The failed negative stage case reached a durable fatal intent but teardown killed
the creator before its control worker registered. The fixture now awaits the
exact current-primary-error routing handoff before draining a passed negative
case. Failed cases still preserve their primary error and uncertain root.
The retained baseline root was not repaired or deleted; recorded owners had exited.

Stage file measured 594.80 seconds (28.93% of integration wall), exceeding the
plan's 25% split trigger. All seven moved case bodies/assertions were compared
against the original; no harness/repair/overload cell was removed.

First targeted run: 52 PASS / 1 FAIL. The added live-owner regression incorrectly
used a fabricated birth identity. It now uses the actual process birth; focused
regression PASS. This was a test bug, not a runtime ownership-policy change.
First receipt warm-up stopped before Vitest because tracked directory symlinks
were read as files; fixed in follow-up commit `e130fa5`. Failed attempts remain.

## Preliminary verification

- Typecheck, lint, strict canon build: PASS.
- Fast: 12 files, 587/587 PASS.
- Release: 2 Node + 8 Vitest PASS.
- Targeted stage and selection cases: PASS; final full recovery acceptance PASS below.
- Four-shard union and paired EVAL offline suite: PASS below.
- Actual GitHub workflow execution: NOT RUN; local workflow contract checks PASS.

## Worker qualification

All six complete chains at `e130fa533c7d49f104c50218d8631d8d3cc95ea2`
passed release (2 Node + 8 Vitest), integration (128 files / 2209 cases), and
runtime-sensitive (2 files / 42 Vitest cases). No skips or unhandled errors.
The 18 nested native fixtures additionally recorded 241/241 Node cases, no skips.

| Attempt | Serial wall seconds | Two-worker wall seconds |
| --- | ---: | ---: |
| Warm-up (not in median) | 1346.48 | 1667.27 |
| Pair 1: serial then parallel | 1680.18 | 1445.14 |
| Pair 2: parallel then serial | 1181.32 | 1509.95 |
| Measured median | 1430.75 | 1477.545 |

The two-worker median is **3.27% slower**, failing the required ≥10% improvement.
Pair 1 favored parallel; pair 2 and the warm-up did not. No favorable-only
selection or additional retry was used. Retain **one worker for every project**;
the audited candidate group remains useful for selection, not promoted concurrency.
Requalification requires a new explicitly frozen candidate config, not a global
worker override. CI still uses four independent single-worker shards.

Identical across all six comparison receipts:

- Source tree SHA256: `a7d3d4e7e96e451663887dc9247b6e201515e3017e86259ed262e9cf0f8d0f40`.
- Built tree SHA256: `9f3258c82faee6417f415637ff180972e9ad3753a3df7f5148891927aaf411ed`.
- Clean tree, same canon and Node/pnpm/Vitest, same test variants and persistent
  Vitest cache. External machine load varied; sampling logs are retained. This
  is not a controlled-hardware speed guarantee.

Baseline/candidate multiset comparison normalized only checkout paths embedded
in parameter names and the seven documented full-cycle file moves. **No lost
case identities or multiplicities**; exactly five added clock/inventory cases.
Native fixture bodies and production source bytes remain unchanged. A raw
cross-checkout name comparison initially flagged absolute path differences;
those are not removed scenarios and normalization was constrained to checkout roots.

Serial default was committed as `6f2c5c6`; final acceptance below uses the later
cleanup correction rather than treating the earlier candidate as final.
That first final attempt (`final-serial`) retained 2208 PASS / 1 teardown FAIL:
Luna-repair had completed MERGE, but the new generic recovery cleanup waited for
a fatal launch even though `runs.status='done'` and no control intent existed.
The selector now excludes only explicitly completed RUNs; absent RUN identity
remains uncertain and still requires handoff. Physical process draining is
unchanged. The routing regression checks both sides of this boundary. This is
a fixture-selection fix, not suppression of a runtime error or an increased budget.
The late `invalid_run_state` controller observation was recorded read-only;
terminal RUN reconciliation itself is outside this test-infrastructure task.
No live process matched the retained failed root, which was left intact.
The retained failed attempt is superseded only by the successful final gates below.

## Final source acceptance

Final FLOW source: `ca9e8fb2678d066d5460c3f90ff8b63607417fb5`, clean tree.
Typecheck/lint and strict canon build PASS after the cleanup-boundary correction.
`final2-serial` ran the normal config without a serial CLI override:

- Release: 2/2 Node + 8/8 Vitest.
- Integration: 128 files, 2209/2209 cases, zero skips.
- Runtime-sensitive: 2 files, 42/42 Vitest; nested native reports retained.
- Complete-chain wall time: 1206.75 seconds. This is a receipt, not a causal
  speedup claim against the differently loaded baseline machine.
- Source SHA256: `ed9d6fe382d50e2835699f61a8e235eed0f7dd443cce12381bd6655bc3c3f199`.
- Dist SHA256: `7c0f9c7a097fa81743fd5a9add41f7bfb24a9cfa43987f14ff48ee53454a646d`.
- Build-info names this exact commit and canon `4.1.2` / `2e57b987…`.

The completed-RUN cleanup regression and the full Luna-repair cycle both PASS;
physical custody/unknown-owner/negative-handoff assertions remain present.

## Shards and paired EVAL acceptance

Four actual Vitest shards ran sequentially locally, one worker each, against
the same final source/dist tuple. CI assigns these shards to independent VMs.

| Shard | Files | Passed cases | Skips | Vitest seconds |
| --- | ---: | ---: | ---: | ---: |
| 1 | 32 | 973 | 0 | 205.55 |
| 2 | 32 | 495 | 0 | 414.78 |
| 3 | 32 | 393 | 0 | 273.11 |
| 4 | 32 | 348 | 0 | 905.10 |

`shard-union.log` confirms 128 files / 2209 cases with no missing, duplicate,
foreign or uncollected file. The exact case-name multiset equals the final
unsharded report; all four receipt revisions and source/dist hashes match.
This proves partition correctness, not a GitHub execution or speed guarantee.

Paired EVAL `node --test --test-concurrency=1`, with explicit final FLOW source,
CLI and adapter paths, passed **542/542**, zero skipped/cancelled/todo, in
294.90 seconds (`eval-paired.log`). Disposable resume/restore/stop and installed
capacity/clock targets ran; no paid provider was used. EVAL code/tests remain
the recorded base; its changes are documentation only.

After all gates, no matching task-owned runner/descendant remained. Failed
attempt reports and diagnostic roots were retained, not repaired or deleted.
Production `src` has no diff from the FLOW base.

## Plan completion and limits

| Area | Outcome |
| --- | --- |
| Inventory and baseline | Complete; fresh baseline and case multiplicity retained |
| Group SSOT and commands | Complete; future files default serial |
| Expensive observation waits | Local clock seam; native physical assertions preserved |
| Slow stage file split | Seven unchanged full-cycle cases separated; focused selection available |
| Worker qualification | Complete; two workers rejected, final default one |
| Receipt and CI partition | Full logs/TAP, exit codes, hashes and four-shard union verified |
| Runbooks | Updated development, acceptance, qualification and failure commands |
| Final acceptance | FLOW full chain, shards and paired EVAL PASS |

The split improves focused selection; no causal serial speedup is claimed.
Ponytail review retained installed Vitest and Node standard library, with no
new dependency or scheduler. No live E2E, release, global hook installation or
runtime policy change was performed. Runtime observations outside test-fixture
ownership are recorded above, not claimed fixed by this test-only work.

## Implementation review

The review checked plan items P01–P08, exact transferred case bodies, cleanup
authority, actual Node reporter behavior and candidate acceptance paths. Seven
full-cycle bodies match the baseline byte-for-byte; fast cases and runtime
source remain unchanged. Two workers remain rejected, not silently promoted.

Three substantive defects were corrected in FLOW `04cfea8`:

1. The shard checker read discovery/results/exit only. A complete report from
   another candidate could authorize the current candidate. A shared stdlib
   identity helper now binds revision, source/dist hashes, build-info and
   Node/platform to the current frozen checkout/build. Command selector,
   distinct shard identities, options and unsignalled completion are mandatory.
   The wrapper freezes before discovery, retains failure on discovery mutation,
   and rejects report roots inside source before writing. CI restores candidate
   dist and verifies both integration and native receipts before acceptance.
2. Native child exit zero and nonempty TAP did not reject nested skips/TODO.
   Node also represents an empty file as one passed placeholder. A reporter
   using standard Node events and TAP rejects missing/partial/empty evidence,
   cancellation, TODO and unexpected skips after native teardown completes.
   Only six exact existing Windows-specific skips are permitted.
3. The stage cleanup hook allowed one readiness envelope for two sequential
   phases: fatal handoff followed by physical drain. Its guard now composes
   two existing envelopes, including observation-gap recovery. Inner phase and
   production budgets remain unchanged. Unproved handoff retains diagnostics
   and does not kill a creator inside the unsafe intent-to-launch gap.

Focused regressions, typecheck, lint and workflow semantic contracts PASS.
A real disposable discovery-mutation check returns failure before launching
tests. Historical candidate receipts reject against changed source and remain
untouched. Real Node pass/skip/TODO/empty cases exercise reporter behavior;
Windows exception identities are checked without claiming a Windows execution.

Review acceptance reports:
`/Users/deksden/Documents/_Projects/_worktrees/dd-plan066-review.DYAimc`.
Final review source: `04cfea823f38c677e9de02b82b675a0957ec0bd2`, clean tree.
Typecheck, lint and strict canon build PASS, then the complete default serial
chain and all three receipt checks PASS:

- Release: 2/2 Node + 8/8 Vitest, zero skips.
- Integration: 128 files / 2211/2211, zero skips, Vitest duration 1982.32 s.
- Runtime-sensitive: 2 files / 43/43, zero skips, Vitest duration 129.31 s.
- Nested native: 18 retained TAP reports / 241/241 cases, zero skip/TODO/failure.
- All three receipts have the same source/build tuple; runner exits are zero.
- Source SHA256: `0a6a40b7735d44cd665b832a1ff52956eaa6c486252ce46f8702280f4f88b216`.
- Dist SHA256: `4c90c656de0442720fe37d72ba1343bd4e8f2e972d376e3b300389ace0eb3167`.
- Canon remains clean at `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.

The exact integration case multiset loses none of the previous 2209 identities;
the only additions are cleanup-envelope and receipt-provenance regressions.
Native adds its reporter regression without dropping any of the 241 underlying
cases. No matching task-owned suite/runner remains after acceptance.

These timings are an acceptance receipt on an externally loaded machine, not a
controlled performance comparison. Two-worker promotion remains rejected.
GitHub execution, a new four-shard run and paired EVAL rerun were not performed
in this review: partition/group membership, runtime source and EVAL code did
not change. The four-receipt contracts and workflow semantics were rechecked;
the earlier actual shard and paired-EVAL results remain historical evidence for
their stated tuples, not acceptance of changed source. No new E2E or release.
