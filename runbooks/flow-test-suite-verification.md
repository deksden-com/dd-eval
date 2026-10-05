# FLOW test-suite verification

Use this procedure for offline FLOW changes. Group membership is defined only
in FLOW's `vitest.config.ts`; do not copy its file lists into commands or docs.
Implementation and measurements are recorded in [plan 066's report](../specs/066-implementation-report.md).

## Development

From the FLOW checkout, use `pnpm test:fast`, then the affected `pnpm test:core`,
`pnpm test:flow` or `pnpm test:runtime-sensitive`. Related file/name filtering is
allowed for development only. Changed-file selection does not understand all
fixture, schema, canon and built-asset dependencies and is not acceptance.
Fast cases are not removed or rewritten for speed. New test files default to
core-serial; parallel promotion requires an isolation audit and measurements.

## Full offline acceptance

Freeze the FLOW and canon revisions, record Node/pnpm versions and platform,
and build before any release test. Use a separate checkout when another task
owns source, config or `dist`. Never rebuild between groups or benchmark modes.

```sh
pnpm typecheck
pnpm lint
DD_MEMORYBANK="$CANON_ROOT" DD_FLOW_BUILD_CANON_ROOT="$CANON_ROOT" \
  DD_FLOW_BUILD_STRICT_CANON=1 pnpm build
pnpm test
```

`CANON_ROOT` is the explicit clean canon checkout. If the checks use mb-lint,
set `MB_LINT_BIN` to the installed executable. `pnpm test` preserves the order
release → integration → runtime-sensitive; the release gate includes
`node --test scripts/verify-release-build.test.mjs`. Verify source and `dist`
digests are unchanged after tests. A receipt must identify the exact source
revision/tree, dirty delta if any, canon tuple and frozen build bytes.

For detailed evidence, create a fresh directory outside tracked source for each
run and use the stdlib receipt wrapper (no automatic retry):

```sh
node --test scripts/verify-release-build.test.mjs
node scripts/run-test-receipt.mjs release "$REPORT_ROOT/release"
node scripts/run-test-receipt.mjs integration "$REPORT_ROOT/integration"
node scripts/run-test-receipt.mjs runtime-sensitive "$REPORT_ROOT/native"
node scripts/verify-test-inventory.mjs "$REPORT_ROOT/release/discovery.json" "$REPORT_ROOT/release"
node scripts/verify-test-inventory.mjs "$REPORT_ROOT/integration/discovery.json" "$REPORT_ROOT/integration"
node scripts/verify-test-inventory.mjs "$REPORT_ROOT/native/discovery.json" "$REPORT_ROOT/native"
```

The wrapper removes inherited `VITEST_MAX_WORKERS`, keeps verbose logs, JSON
results, actual exit status and elapsed time. It rejects test filters/retries.
`DD_FLOW_TEST_REPORT_DIR` activates built-in Node TAP destinations for all
nested native fixtures, avoiding an unbounded stdout buffer. Report-write or
collection failures fail acceptance. JSON `success` alone is insufficient:
Vitest can report it while also returning nonzero for unhandled errors.

Full acceptance forbids `.only`, changed/file/name filters, retries, bail,
snapshot updates, `passWithNoTests` and ignored unhandled errors. Missing
receipts or required targets are NOT RUN, not PASS. Only explicitly identified
platform skips (FIFO on Windows, missing Bash/Zsh binaries) are permitted and
must be reported. Preserve parameterized cases and duplicate-name multiplicity.

## Paired EVAL checks

After the same FLOW build, run from EVAL:

```sh
DD_FLOW_SOURCE_ROOT="$FLOW_ROOT" \
DD_EVAL_TEST_FLOW_CLI="$FLOW_ROOT/dist/cli.js" \
DD_EVAL_TEST_FLOW_ADAPTER="$FLOW_ROOT/test/fixtures/controller-stage-adapter.mjs" \
node --test --test-concurrency=1
```

`FLOW_ROOT` is an absolute path to that tested checkout. These targets enable
the installed capacity/clock contracts and disposable real-CLI lifecycle,
restore and resume fixtures. A skip of a required paired target does not close
acceptance. This procedure never calls a paid provider.

## Worker limits and measurement

Current default is one worker for every group. Plan 066's two-worker candidate
passed all cases but its measured full-chain median was 3.3% slower, not the
required 10% faster. The `integration-core-parallel` name identifies audited
candidate membership, not currently enabled concurrency.

Files may run in separate forked workers with isolation enabled; cases within
each file remain sequential. Runtime-sensitive and release groups remain one
worker. Unknown files stay serial. Never use `it.concurrent` to accelerate
process/env/SQLite fixtures. `--maxWorkers=1` alone may not override project
limits; the full serial fallback is:

```sh
pnpm test:integration --no-file-parallelism --maxWorkers=1
```

The receipt wrapper accepts `--serial` for the same override. Avoid inherited
`VITEST_MAX_WORKERS`: it can override explicitly serial project settings.
Run only one local suite/benchmark chain at a time; do not compete with another
acceptance on the same machine or mutate its checkout. CLI workers are not
harness-native child capacity.

To qualify two workers, audit unique roots, DBs, sockets/ports, resources,
native config, birth identities and cleanup barriers first. Freeze the final
candidate config with two workers only for the audited projects and one for
all other projects; a global `--maxWorkers=2` is not that candidate. The normal
candidate run measures this policy, and `--serial` measures its override.
Source/build must then stay frozen. Report initial system load; warm both modes, then measure two
pairs in alternating serial/parallel order with identical inputs. Compare the
median of the complete release/integration/native chain, not summed test body
durations. Retain every attempt. Promote only with at least 10% improvement,
no new failures/skips/unhandled errors or unconfirmed owned resources. Otherwise
keep serial as default. This benchmark is a one-time qualification, not an
automatic doubling of ordinary acceptance.

Policy-only timeout assertions can use instance-local ObservationClock inputs
after real admission closure and physical child settlement. Never use global
fake time or synthetic progress as lease authority or absence proof. Real
signal, native lifecycle, ownership and physical joins keep their real clocks.

## CI shards and failures

CI runs four integration shards, one worker per VM. Shard the full integration
selection once, not every group separately. Each shard saves discovery, results
and exit code through the chosen artifact/cache transport even on failure.
Candidate acceptance compares their actual union against fresh unsharded
discovery: every file exactly once, no foreign project, no empty or partial
report. `vitest list --filesOnly --shard` does not prove a partition. Preserve
the fixed release required-suite set and the separate native job. Actual GitHub
execution is reported separately from local workflow contract checks.

On failure let the suite finish its remaining cases and owned teardown. Do not
retry automatically for green, kill neighboring processes, close user apps,
delete uncertain diagnostic roots or resume/restart EVAL. Only an exactly
identified owned hung process may be stopped, with primary and cleanup evidence
retained. Mocked seven-stage controller cycles are not scored live E2E; the
integration case count is neither the whole suite nor the nested Node count.
