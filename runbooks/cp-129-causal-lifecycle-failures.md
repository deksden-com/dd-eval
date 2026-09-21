# CP-129: causal lifecycle failures

Date: 2026-09-21. Published qualification passed; scored E2E not yet launched.

## Immutable inputs

- CLI: `@deksden-com/dd-flow-cli@0.9.0-beta.91`, commit
  `82e57ba33fbc4e915c2b5809dd82fe9033969c3a`.
- Canon: `d1a6081ab15ab92ac917ff5d037121a40c709db1`, version `4.1.1`.
- Product source remains `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Project flow pack remains `53d4b76943900f122957c78cc0fefa2051bd7b1a` in
  `deksden-com/dd-tasks`. CP-129 is engine-only relative to CP-128.
- Profile: `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json`.
- Home: `/Users/deksden/.dd-eval/qualification/cp-129-luna`. Only portable
  engine configuration was copied. Runs, runtime DB, resources and conformance
  state from CP-128 were not copied.

## Release and package evidence

Workflow `35636278000` passed release contracts, four integration shards,
runtime-sensitive tests, package smoke, immutable publication and registry
consumer verification. Its exact release tuple is:

- npm beta dist-tag: `0.9.0-beta.91`;
- peeled annotated tag `v0.9.0-beta.91`:
  `82e57ba33fbc4e915c2b5809dd82fe9033969c3a`;
- npm tarball SHA-256:
  `829adc5e72b805396289f1ccb6e7cd875772ec6a655247f1a9eadbea9fc3f98e`;
- npm integrity:
  `sha512-tEWSWkp+SexwfhQQWasRJSmVKDgoRWN3iTmeP5N7xft0/4fOJovBg92pR838RZhlJz80HY3gQBSrYs/O5E1U4w==`;
- installed engine snapshot full-content SHA-256:
  `4ee3b2fc168841123534c220677075e52cc8d347b9147381db1caf4428dc890a`.

`dist/build-info.json` independently identifies the same CLI commit/version and
canon commit/version. The snapshot digest was computed by `engineArtifactDigest`
and accepted by `verifyEngineArtifact`; it is intentionally distinct from the
npm tarball checksum.

The preceding workflow `35634695774` passed every test layer but correctly
rejected publication because its candidate still used the already published
`0.9.0-beta.90` tuple. The package was versioned normally before this workflow;
no old registry bytes or stale candidate were reused.

## Qualification and launch

`scripts/qualify-published-repair.mjs` passed against exact-commit fixtures
redirected to the installed package: 19 selected tests passed across three files
and 27 unrelated tests were deliberately skipped. This includes settled fanout,
repair registration/replay, contextual parameters, alias handling and current
lifecycle-failure attribution.

Before launch:

1. commit and push this checkpoint, the case pin and this runbook;
2. run the standard Luna profile preflight with explicit CP-129 homes;
3. append its receipt, commit and push it;
4. start exactly one new scored E2E. Never resume CP-128 or duplicate CP-129.

Monitor with `runbooks/e2e-monitoring.md`. Determine the actual stage from the
RUN controller/timeline and fresh stage/work artifacts, never from the manifest
entry stage. Correlate stage/attempt/cycle Work, native durable events, process
liveness, HITL, lifecycle receipts and the primary error. In particular verify
that MERGE internal identifiers stay runtime-owned, an active successor
suppresses its superseded failure, unchanged preparation does not loop, and a
terminal lifecycle rejection remains the controller's causal error. Runtime
failure investigation is read-only: do not resume, retry, repair or edit code.

## Receipts

Preflight `1790015204405-7daf9985` passed against committed definition
`b3bb2ef5c45be0584820628306633febdac3babe` and tree
`ecac6562a72dfc361fe1301cd647e033630fdd6a`. Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-129-luna/conformance/e2e-preflight/1790015204405-7daf9985/e2e-inline-merge-luna-xhigh`.
Both Luna subject and Sol judge doctors passed with Codex `0.154.0`, no provider
Sessions were created, and baseline remained correctly `not_run` for the actual
execution workspace. The scored-run receipt will be appended after launch.
