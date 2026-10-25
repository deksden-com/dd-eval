# Local change-impact verification

Operator policy (2026-10-25, plan 102): no mandatory full release-gate, nightly
replacement or test suite simply because merge/release/EVAL preparation occurs.
GitHub CI stays disabled. Never stop working EVALs or foreign checks.

## Verify a change once

1. Inspect `pnpm verify:plan` in the changed repository. Engine mapping lives in
   `scripts/verification-policy.mjs`; EVAL has its own local mapping. Review paths,
   affected contracts and thin consumers. Unknown impact requires a mapping,
   not a whole-suite fallback or silent zero-test PASS.
2. `pnpm test` runs only selected missing checks using existing runners. Use a
   fresh external `DD_FLOW_GATE_REPORT_ROOT` for an engine receipt if desired.
   `gate:merge` is the same scoped engine entrypoint, not an extra common suite.
3. Preserve selection, actual files/cases, multiplicity, exit/signal, skips and
   report hashes. Missing/duplicate/foreign results, unexpected skips/TODO and
   interruption are not PASS. Reuse is an explicit reference to intact evidence
   for identical relevant inputs, not a rewritten old receipt.
4. Investigate FAIL/unknown cleanup before an explicit rerun. No automatic test
   retry, fake time, mock-only replacement for physical lease/SQLite/PGID checks,
   or fallback to an older PASS. Close exact owned children and retain failures.

Each repository owns its impact mapping; no automatic import-graph service.
Shared contract changes select relevant consumers; adapter-only changes do not
run unrelated adapters or E3/E4. Plain docs need review, not runtime tests.
Canonical executable instructions are not plain docs. Compiler/dependency/build
changes require their affected compile/package/consumer checks.

## Deliver an engine

Freeze source and canon; build once with the intended canon, pack the exact
candidate, then accept it using `DD_FLOW_VERIFICATION_RECEIPT=/absolute/verification.json`.
The receipt comes from scoped verification, not a mandatory all-suite profile.
Publication requires frozen provenance, artifact hashes, safe credentials,
immutable version/tag and registry tar readback. Do not rebuild during publish
or uncertain-publication recovery. Identical registry bytes do not require a
second behavioral installed-consumer suite. A publication is not an E2E PASS.
Old full receipts remain history; no new full PASS is required to replace them.

## Prepare EVAL

Validate definition/pins, relevant native compatibility and actual resource
readiness. Do not run manual engine/product quality/browser suites first.
Baseline policy@3 separates reusable `fixture_assessment` from each world's
`world_readiness`. Missing assessment runs only its declared fixture contracts;
unchanged inputs reuse it across harnesses. Every new world still materializes
locked dependencies, checks DB/schema/seed/ownership/write-read/cleanup and engine
routing; never share writable DBs, PIDs, ports or another world's readiness PASS.
Fork refreshes readiness, resume validates its own retained evidence.

Matrix@4 reuses a technical publication proof only when its actual producer,
consumer, schema and dependency component bytes match. Engine artifact integrity
is still checked independently. Legacy@3 exact bindings are not rewritten.
For an unchanged technical component in a legacy@3 proof, use
`node bin/rebind-verification-matrix.mjs --checkpoint <receipt> --source-engine <old-snapshot> --target-engine <new-snapshot> --output <supplement>`.
This compares actual artifacts and retains original evidence; it does not call
models or rerun matrix fixtures. A mismatch requires the affected technical proof.
Fixture assessment caches quality, browser and isolation separately; a test-only
change must not repeat unrelated assessment groups or the shared compatibility probe.
Unchanged Subject fixes do not requalify Judge. Oracle changes first replay
retained answers; changed semantic inputs alone justify relevant live qualification.
Never disable product verification during CODE/repair/review or final Judge.
