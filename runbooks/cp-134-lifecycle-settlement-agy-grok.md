# CP-134: lifecycle settlement qualification

Date: 2026-09-22. Published package qualification passed; AGY and Grok
preflights and scored E2E are recorded below.

## Immutable tuple

- Product source: `deksden-com/dd-tasks`
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a`, path
  `.memory-bank/dd-flow`, Memory Bank `4.1.1`.
- Canon: `4.1.1`, commit
  `678daa038287c948ada5b2d785a6dcc925c7b891`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.96`, commit
  `cb6c669ff3f24115ac0a4d2c04c8877eb8683bc6`, installed full-content
  SHA-256 `77c9596cf424bf3a0eeef94f17a975250834975e849a76bc73629be1c2f661b1`.
- Grok: Build `1.0.40`, binary SHA-256
  `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2`,
  `grok-4.7` high, ACP1.
- AGY: `1.2.8`, binary SHA-256
  `b9a0982a7fb09b41f585d93cfa2fe541ec8e4395445a4246973317506477382f`,
  requested `gemini-3.1-pro-high`; native child model attribution remains
  incomplete rather than inferred.

Homes are `/Users/deksden/.dd-eval/qualification/cp-134-grok` and
`/Users/deksden/.dd-eval/qualification/cp-135-agy`. They were created with
portable engine/agent configuration only. Prior runs, runtime databases and
conformance state were not copied.

## Release evidence

Workflow `35727789189` passed prepare, runtime-sensitive, four integration
shards, immutable candidate verification, publish and registry consumer smoke.
The earlier workflow `35727479529` stopped before tests because its dispatch
contained nonexistent canon SHA `678daa098…`; the corrected dispatch used the
published `678daa038…` commit.

- beta dist-tag: `0.9.0-beta.96`;
- peeled tag `v0.9.0-beta.96`:
  `cb6c669ff3f24115ac0a4d2c04c8877eb8683bc6`;
- tag object: `631e97c9016eaad3cf9fe0ad139a7dea13091f2f`;
- npm tarball SHA-256:
  `d41fd745c040140bfb5a4ddd041bc5ac7120d8af4d72e607248afe3ab69cd36c`;
- npm integrity:
  `sha512-9THVeTGTlHeoBf1dpiLjTzloip/yReMVxmJPCKlnpNC2ML9QgSLlXySt5ipa8bT9mH9V6HedyXIQ5Ft97hzlsQ==`.

`dist/build-info.json`, both installed engine snapshots,
`engineArtifactDigest` and `verifyEngineArtifact` accepted the same tuple.
The published repair smoke passed 19 selected package-only tests; it loaded
the installed npm package, not source modules.

## Admission and monitoring

Run both profiles with explicit home, published `DD_FLOW_BIN`, engine config
and resource home. A preflight PASS is required before each scored launch:

- `e2e-inline-merge-grok-4-7-high.json`;
- `e2e-inline-merge-agy-gemini-3-1-pro-high.json`.

Monitor by `runbooks/e2e-monitoring.md`. The current stage comes from the RUN
controller/timeline and fresh stage/work artifacts, never the manifest entry
stage. Correlate provider turns, lifecycle settlement/reconciliation receipts,
HITL answer/pause identity, Work graph and process/lease liveness. Runtime
failure investigation is read-only: no resume, duplicate launch, manual repair
or code change.

## Receipts

Grok preflight `1790081859615-d5ec0c57` passed against committed definition
`93cfc0232bbe0bac4dbdd27b06e3920a96fb2b5a` and tree
`f42f40de393ab4fc74b25f4efdb3ee7a60462721`. Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-134-grok/conformance/e2e-preflight/1790081859615-d5ec0c57/e2e-inline-merge-grok-4-7-high`.
The exact Grok and Sol judge doctors passed, no provider Session was created,
and baseline remained `not_run` for the actual execution workspace.

AGY preflight `1790081859820-aefe589a` passed against the same definition and
tree. Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-135-agy/conformance/e2e-preflight/1790081859820-aefe589a/e2e-inline-merge-agy-gemini-3-1-pro-high`.
The exact AGY and Sol judge doctors passed; isolated Gemini/app-data roots,
authentication and the requested native model catalog entry were verified.
No provider Session was created and baseline remained `not_run`.

Scored launch receipts are appended after both admitted commands return their
durable EVAL identifiers.
