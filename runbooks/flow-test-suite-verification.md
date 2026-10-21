# FLOW verification

Use the smallest check that proves the changed property. File membership lives
in FLOW's `vitest.config.ts` (Vitest) and `package.json` (Node families).
Required release receipt IDs live in `scripts/release-candidate.mjs`.
Do not copy file lists or treat a filtered run as full acceptance.

Operator policy (2026-10-21): checks and guarded publication run locally only.
Do not dispatch or rerun GitHub Actions, including npm-publish; retained workflows
are inactive references. Git/PR/tag operations remain permitted. Required gates,
immutable candidate evidence and registry readback are unchanged. Re-enabling CI
requires explicit operator instruction.

## Development and merge

For code, run `pnpm gate:merge`, then affected contracts below. Documentation
without executable/canonical instructions needs link/command review, not runtime.
Record targets and reasons in the PR receipt. Combine rows; use their union when
impact is uncertain. Tests invoking compiled CLI require the current frozen dist.

| Change | Additional evidence |
| --- | --- |
| Policy/parser/state | Positive/negative cases and affected callers |
| Adapter mapping | Shared policy, real event shapes, wiring |
| Hook/identity/lease/cancel | All boundary consumers; physical owner/late-ACK/cleanup |
| Storage/restore | SQLite/CAS/rollback, independent writer, affected init/recovery |
| Stage/prompt/controller | Packet contracts, lifecycle/replay, relevant system path |
| Canon/schema | Hybrid/canon consistency, consumers, installed assets |
| Packaging/loader/dependencies | Strict build, isolated installed package, cold path |
| Gate selection/reporting | Complete inventory and final release profile |
| EVAL plumbing | Affected offline EVAL and paired FLOW contracts, not unchanged live Judge |

Example partial receipt (replace example file and reason with actual affected targets):

```sh
node scripts/run-test-receipt.mjs integration "$REPORT_ROOT/affected" \
  --scope=merge --files=test/example.test.ts --reason='changed shared admission boundary'
node scripts/verify-test-inventory.mjs "$REPORT_ROOT/affected/discovery.json" \
  "$REPORT_ROOT/affected" --scope=merge
```

A merge receipt cannot authorize release. Do not rebuild during a suite.

## Full offline acceptance

Freeze engine/canon revisions. Use an isolated checkout if another task owns source
or dist. Run one local heavy chain at a time, including other worktrees. Never stop
foreign tests or working EVALs. An explicit operator exception may allow parallel
chains in isolated checkouts; do not treat their timings as benchmarks.

```sh
pnpm typecheck
pnpm lint
DD_MEMORYBANK="$CANON_ROOT" DD_FLOW_BUILD_CANON_ROOT="$CANON_ROOT" \
  DD_FLOW_BUILD_STRICT_CANON=1 pnpm build
DD_MEMORYBANK="$CANON_ROOT" DD_FLOW_E1_CANON_ROOT="$CANON_ROOT" \
  DD_FLOW_E1_MB_LINT_ROOT="$MB_LINT_SOURCE_ROOT" \
  DD_FLOW_E3_CANON_ROOT="$CANON_ROOT" \
  DD_FLOW_E3_WT="$WORKTRUNK_BIN" \
  DD_FLOW_GATE_REPORT_ROOT="$REPORT_ROOT" pnpm gate:release
```

All roots and WORKTRUNK_BIN are absolute; REPORT_ROOT is a fresh external directory. Preserve every
attempt. Canon/mb-lint source roots identify reviewed inputs. Set MB_LINT_BIN and
DD_FLOW_E3_MB_LINT when qualifying real tools. Signed/old-engine/retained-run
qualifications require their documented explicit inputs: skipped is not qualified.
The ordinary E3 real-Worktrunk check is mandatory, not an optional skip. Use the
explicit verified executable; the retained workflow documents its reference pin.
Offline fixtures must not inherit operator provider credentials or production homes.

Release includes hybrid/canon, E2/E3/E4, release, integration and native guarantees.
Local acceptance proves the required set against the exact artifact; publish does
not rebuild. Receipts retain source/dist/build identity, Node/SQLite/OS/architecture,
real file/case events, multiplicity, exit/signal and duration. Node case inventory
comes from execution, not a second execution for discovery. Missing/foreign/duplicate,
TODO, unexpected skip, interrupted or incomplete evidence is NOT PASS. Candidate
mutation invalidates evidence. Actual GitHub execution is separate from local
workflow checks; macOS is not Linux/Windows qualification.

Installed-package smoke runs outside the checkout with isolated HOME/config and
the exact local artifact. Candidate and registry consumers use the shared
`isolatedConsumerEnvironment`: no inherited engine routing or provider homes;
npm authentication and script restrictions remain separate and unchanged.
No model calls, releases or scored EVALs belong here.

## Fixtures, cleanup and measurements

Reuse immutable preparation only: closed empty schemas and payload/archive bytes.
Each world owns separate writable files, paths, IDs, owners and leases. Real
migration/open-WAL/install/process/race checks stay physical. No cross-commit PASS
cache, whole-test retry or global fake time.

On failure let teardown finish. Stop new dispatch, drain exact owned processes and
handles, join before removing roots. Unknown observation/cleanup retains evidence
and is never clean. SIGKILL cannot guarantee cleanup; retain owned identities for
recovery, never kill all similar processes. Framework guards cover setup/body/drain
without changing provider policy.
Discovery is executable too: the receipt wrapper owns both discovery and runner
phases, retaining their PID/PGID history. Interrupted discovery must not start
the test body or produce PASS, even if its child exits zero.

Fixture summaries under fixture-costs count preparation/copies/scans. Compare
frozen inputs, fixture shape, platform and the same warm/cold mode. Do not sum
nested durations or claim speedup from noisy load. One paired hotspot measurement
suffices unless ambiguous; never double each full gate. Local worker count stays
one; more concurrency needs separate isolation and measurement review.

## Paired EVAL contracts

When FLOW/EVAL plumbing changes, use the same frozen build and installed snapshot:

```sh
DD_FLOW_SOURCE_ROOT="$FLOW_ROOT" \
DD_EVAL_TEST_FLOW_CLI="$FLOW_ROOT/dist/cli.js" \
DD_EVAL_TEST_FLOW_ADAPTER="$FLOW_ROOT/test/fixtures/controller-stage-adapter.mjs" \
DD_EVAL_TEST_OPERATIONAL_RUNTIME="$INSTALLED_ENGINE_ROOT/dist" npm test
```

Missing required paired targets remain NOT RUN, not PASS. This never launches
scored EVALs, changes active runtimes or qualifies an unchanged live Judge.
