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

Selection/receipts use contract schema@2. Cache by exact file or native fixture,
not the current release's group membership. Execution inputs exclude packaging,
HEAD and unrelated fixtures; validator changes first revalidate retained reports.
The release boundary accepts an ancestor tag or a recorded exact-tree equivalent
integration commit (squash); unrelated tags cannot reset coverage requirements.
Native TAP retains the original event-validator fingerprint. If that validator
changes, rerun only the exact affected fixture: TAP cannot reconstruct every
original event. A packaging/aggregate-validator edit alone does not require it.

Cooperating engine/EVAL/bridge runners share a host lease and at most two isolated
top-level jobs. Set `DD_FLOW_VERIFICATION_JOBS=1` for serial fallback. Each child
gets private HOME/TMP/XDG/harness/resource paths and no provider credentials unless
explicitly allowed. `exclusive` drains the pool; nested runners inherit a verified
slot and run serially. Do not start a second unmanaged runner to bypass the lease.
Concurrent nested callers share a validated slot-wide sublease; managed descendants
receive their own checked child context, so recursion does not deadlock. Private
synthetic coordinators must clear both inherited `DD_FLOW_VERIFICATION_SLOT` and
`DD_FLOW_VERIFICATION_NESTED_SLOT` explicitly. Never clear them in productive jobs.
Live/unknown owners are never stolen. Coordinator death does not prove its
detached children stopped. Identical requests join the exact producer attempt;
cancelled waiters do not cancel it. Retain attempts and cleanup evidence.

The shared helper's canonical source is engine `tools/verification-jobs.mjs`;
EVAL and bridge vendor identical bytes. Change it there, copy and compare all
three versions; do not create independent coordination protocols.

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

Prepare-only writes the launch definition without historical retirement. The
productive worker (or direct/resume entrypoint) performs the fresh retirement
barrier under the existing lock before dispatch. Reservations are not authority.
Waiting slides only on new completed-work evidence, never repeated heartbeat;
inspect `admission-wait.json` on a stall. Do not bypass a blocked barrier.

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
