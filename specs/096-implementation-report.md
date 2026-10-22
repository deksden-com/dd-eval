# 096 — implementation and local verification

Scope: engine check evidence, scored-source test tooling, EVAL resource retention
and cleanup presentation. No product repair, release, installed hook update,
historical EVAL mutation, new E2E or model call is part of this change.

## EVAL

- A new manifest retains the selected absolute Playwright cache before baseline.
  Explicit operator selection wins; otherwise the resource-home cache is used.
  Baseline installation/checks, controller dispatch, canonical execution and
  recovery inherit that selection instead of recomputing it from harness HOME.
- Baseline receipt and structured input binding retain the selection. Recovery
  and fork reject a mismatched selection. Legacy receipts retain legacy semantics.
- Cleanup presentation no longer treats `settled:false` as evidence of a live
  process. Physical stop and pending native settlement remain distinct; no sealed
  capture or successful native outcome is manufactured.
- Compact diagnostics retain flattened primary/secondary causes and hashed
  artifact locators; repair authority remains exclusively in engine evidence.

Local verification: 36/36 passing Node tests across baseline admission, resource
selection, cleanup observation, compact diagnostics and fork/recovery contracts.
The resource test executes installation/check stand-ins and rejects a mismatched
retained cache. Earlier monitoring-status coverage also passed (20/20 combined
focused run). No actual scored execution was used as a test fixture.

## Repository boundaries

- Engine branch: `fix/096-check-evidence`, based on `b9c32626`.
- Source tooling branch: `fix/096-check-tooling`, based on `1fc6fac4` in the
  CP240-compatible scored-source lineage, not the primary branch that reverted
  that tooling. No product semantic changes are included.
- EVAL branch: `docs/096-cp240-check-evidence-plan`, based on `ee27a514`.

## Browser result and limits

Tooling commit `8f445b7` fixes an accumulated native-timeout slot versus observer
epoch mismatch. With an earlier 2-second fixture and a 4-second quiet window, the
native regression first lost one expected proof (RED), then retained both (GREEN).
The final expanded native suite passed 3/3 in 36.1 seconds: it checks exact failed
attempt identity, delayed success, long sliding body/teardown, hung teardown and an
unhealthy-world negative. A disposable DB was created and dropped; no scored DB
was changed. Native elapsed-time introspection is isolated and pinned to the
installed Playwright 1.62.1 shape. Unknown version/shape disables source attribution.
The existing 1-second health freshness and 5-second terminal bounds are unchanged.

This reproduces a concrete snapshot-loss mechanism, not the unknowable exact
historical CP240 branch: that run did not retain the necessary worker snapshot.
The existing timeout regex was already correct and remains unchanged.

## Findings closed during implementation review

- The old `test:unit` shell chain overwrote API PASS evidence with the Web report.
  Both native children now have separate owned reports; public `test:unit` and
  quality reuse the same fixed step definitions.
- Parent/child proofs validate deterministic binding, epoch, command/input hashes,
  exact count sums and the unreached tail. Nested failures preserve their validated
  child authority; successful nested reports must also appear in capture inventory.
- Real Biome 2.5.6 returns `location.path` as a string and can report the exact
  source-owned `assist/source/organizeImports` diagnostic from `biome check`.
  The native adapter and narrow allowlist cover these actual forms; arbitrary
  assist categories or unknown tool versions do not gain repair permission.
- Context-owned browser resources feed checks and reuse fingerprints, including
  in-process callers and narrow declared environment input sets. Malformed or
  conflicting environment overrides are refused before dispatch.

## Engine verification

The three affected evidence/check/lifecycle suites passed **112/112** tests.
A further owned missing-doc capture and retained re-read integration passed
**1/1**. Four focused MERGE/CODE-REVIEW/repair-continuation/provider-capacity
suites passed **81/81**. These cover logical repair/recovery and the unchanged
overload episode boundary without paid provider calls. No full release profile is
claimed.

Local `pnpm gate:merge` is green: typecheck, lint, **765/765** fast tests and
**66/66** hybrid contracts. The build also passes. This is the existing merge
profile, not a full release gate or permission to publish an engine.
Final controller/adapter browser-resource round trips passed **3/3** and the
final native-proof validator suite passed **13/13**. Engine commit: `af6bd5cb`.

## Source-tooling verification

All five new source suites passed **14 distinct scenarios**, zero skips (13 in the
combined run, plus the final added late-pipeline case; final pipeline group 10/10).
Actual native cases used
the final built engine reader/disposition ABI: selected malformed SQL, corrected
SQL, foreign SQL and authentication refusal; mixed Biome format/import-order
diagnostics through the quality aggregate; TypeScript CLI-equivalent diagnostics;
docs missing/broken/permission errors. Aggregate tests cover all seven failure
positions, separate API/Web child totals and the unbound developer entrypoint.
After the final operation-identity deduplication adjustment, SQL/source regressions
passed again (**2/2**). API typecheck, focused Biome formatting and diff checks pass.
The disposable PG test-world count is zero and temporary fixture directories were
removed; the campaign baseline DB was not modified.

Source commits: `8f445b7` (browser) and `6c3f106` (migration/aggregate diagnostics).
Unknown build diagnostics and unsupported TypeScript project references remain
explicit fail-closed cases, not fabricated candidate diagnostics. The pinned
project configs do not use project references.

Luna's initial overload plus two failed continuations in the same Session was
correct policy execution, not a retry defect. This change does not increase its
budget or reinterpret the historical failure. Likewise AGY's unclean native
settlement remains unknown even after confirmed physical shutdown.

This is not a release-acceptance or full-E2E success receipt.

## Independent review and integration (2026-10-22)

The follow-up review found and corrected substantial gaps rather than treating
the original green merge profile as proof of completeness:

1. Valid incomplete child evidence was discarded by the recursive reader. The
   producer and reader now retain its primary error and artifact tree, propagate
   unknown observation (including empty reports and zero native exit), and stop
   the remaining pipeline. No PASS/source-repair is granted by partial evidence.
2. A static repository-tooling import made the relocated/deployed API fail on
   module load. Migration diagnostics now load only on an observed test failure;
   production imports do not depend on repository scripts. SQL behavior is unchanged.
3. An invalid setup sidecar without an operation ID could suppress unrelated
   native errors through `undefined === undefined`. Deduplication now requires an
   actual retained operation identity.
4. Browser terminal/snapshot/diagnostic publication failures could erase the
   native timeout. Primary failures survive; a separate publication failure
   blocks source attribution. Refusals at four publication boundaries are tested.
5. Native scope restart/load did not retain the browser cache even though normal
   controller dispatch did. Producer, recovery consumer and native request
   fingerprint now share the additive cache input, preserving legacy contracts.
6. An actual missing pinned Playwright executable was left unclassified. Only the
   exact native expected-path/ENOENT case becomes a tooling diagnostic, not all
   browser launch errors.
7. Direct live-root classifier calls checked file ownership but not the new
   migration/tool proof checksum. Both live entry paths now validate the checksum;
   retained capture-time attribution remains unchanged after a later source edit.
8. Compact aggregate diagnostics exposed native refs relative to the wrong root.
   They now retain the immediate child-report locator, from which nested proof
   refs can be followed, without copying repair authority into EVAL.
9. RUN-control status has no `physical_stopped` field. Status now also consumes the
   existing scoped retirement proof, only when its manifest/resource binding and
   fresh fenced inventory still match. A new owner/generation invalidates it;
   native outcome and capture remain pending independently of physical stop.
10. Fatal docs/value I/O refusals lost their structured primary cause. A shared
    native-error observation boundary preserves it without intercepting the
    process's default fatal exit or granting candidate repair.

Integration of dd-tasks uses a new branch from current `origin/main` and only the
reviewed tooling commits, not a merge of the old scored-source product tree.
In particular, current product migration options/reset behavior are preserved.
The scored-source lineage is retained separately for reproducibility.

Final review checks and merge/cleanup readback are recorded below. No GitHub CI,
release, new E2E, provider call or historical EVAL modification is authorized by
this receipt. The exact historical CP240 snapshot-loss branch remains unprovable;
the native reproduction establishes a concrete mechanism, not missing history.

### Final verification and integration readback

- Engine reviewed head `646c9ece`: build and `gate:merge` PASS (typecheck/lint,
  fast and hybrid); affected eight suites **243/243**, native request-proof
  **4/4**. [PR #110](https://github.com/deksden-com/dd-flow-cli/pull/110) squash
  merged as `a8d1318a`; its Git tree equals the verified head's tree.
- Main-based tooling head `7fadf5b`: all eight source/native suites **26/26**,
  zero skips, using the final built engine ABI. This includes real disposable
  PostgreSQL, browser, mixed native diagnostics and relocated API packaging.
  API typecheck/build PASS. [PR #15](https://github.com/deksden-com/dd-tasks/pull/15)
  squash merged as `dc7b322`; its tree equals the verified integration head's tree.
- EVAL: affected baseline/resource/status/diagnostic/retirement sets **46/46**,
  fork/recovery set **19/19**, syntax and diff checks PASS. No full release profile
  or unchanged live Judge qualification was repeated.

Historical unmerged experiments are retained under
`archive/cleanup-20261022/*`, not silently merged into the current implementation.
The scored-source archive points to `5270b26`; the CP237 flow-pack archive retains
`9824552`. Needed ignored local data (`.env`, `.tasks`, test observations) and
the checked engine dist were copied before worktree removal to private local
`/Users/deksden/Documents/_Projects/_artifacts/plan096-cleanup-20261022.KYCMIn`.
Generated dependency/build directories need not be retained in worktrees.
The active E5 worktree and the user's primary `eval/cp162-flow-pack` checkout are
outside cleanup; their uncommitted/unpublished work remains unchanged.
