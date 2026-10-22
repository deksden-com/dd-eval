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
