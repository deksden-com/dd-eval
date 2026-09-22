# CP-138/139: boundary snapshots and native worker provenance

Date: 2026-09-22. This campaign qualifies Plan 051 with new Grok and AGY
scored E2Es. It retains CP-136's product source, flow pack, canon, harness
versions and model settings. Only the engine pin changes. The terminal
CP-136/137 runs are historical evidence and must not be resumed or copied.

## Immutable inputs

- Product source: `deksden-com/dd-tasks`
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a`, path
  `.memory-bank/dd-flow`, Memory Bank `4.1.1`.
- Canon: `4.1.1`, commit
  `678daa038287c948ada5b2d785a6dcc925c7b891`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.98`, commit
  `a06d4c113d22f31d344bfdf5b740ce5371da8ae2`, installed full-content
  SHA-256 `e799fb861a9cee6204307af4fb3666c5621ab7a9fccd1981f3404b8c42eb3085`.
- Grok: Build `1.0.40`, binary SHA-256
  `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2`,
  `grok-4.7` high, ACP1.
- AGY: `1.2.8`, binary SHA-256
  `b9a0982a7fb09b41f585d93cfa2fe541ec8e4395445a4246973317506477382f`,
  requested `gemini-3.1-pro-high`; native child model attribution remains
  incomplete unless the provider supplies direct evidence.

Homes are `/Users/deksden/.dd-eval/qualification/cp-138-grok` and
`/Users/deksden/.dd-eval/qualification/cp-139-agy`. Initially they contain
only portable agent profiles and harness configuration. Their adapter paths
point to each home's exact installed package, not CP-132/133. No old run,
runtime database, conformance state or provider session is copied.

## Release and admission

Workflow `35775254412` passed typecheck, lint, release contracts, four
integration shards, runtime-sensitive tests, immutable candidate/package
smoke and publication. Independent registry readback confirmed:

- npm `beta` dist-tag: `0.9.0-beta.98`;
- peeled Git tag `v0.9.0-beta.98`:
  `a06d4c113d22f31d344bfdf5b740ce5371da8ae2` (tag object
  `c0df260d619f8918ca4d7fd1259d20102647bdf3`);
- npm tarball SHA-256:
  `7557549be8da04c0e4aaca8a84b749d9f2160e95c5d57acf313127df3f647d94`;
- npm integrity:
  `sha512-K8CL31/TgZXdCGD3RDq2ki9Wd98OKYj4OP7hU5Wwag8B6FjQQIc+HvPtP0P+iTVIDr5A92sXUv3p5qen1QGZmg==`;
- tarball `dist/build-info.json`: exact version and commit above, canon
  `4.1.1`/`678daa038287c948ada5b2d785a6dcc925c7b891`, flow contract
  `dd-flow-canonical-2026-08`, `dot_memory_bank` layout.

Installing the public package into an isolated scratch engine home produced
the full-content SHA above; `engineArtifactDigest` and `verifyEngineArtifact`
independently agreed with its `engine.json.integrity.checksum`.

The public package is installed separately into each home's
`published-engine` prefix. The checkpoint pin uses the installed engine's
`engine.json.integrity.checksum`; tarball SHA, npm integrity and engine
full-content SHA are distinct identities. The case points to the committed
checkpoint file and its exact SHA-256.

Run the standard preflight with explicit `DD_EVAL_HOME`, installed `DD_FLOW_BIN`,
`DD_FLOW_CONFIG_HOME` and `DD_FLOW_RESOURCE_HOME` for each profile:

- `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-grok-4-7-high.json`;
- `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-agy-gemini-3-1-pro-high.json`.

Preflight PASS means input and environment readiness only; the baseline runs
inside the scored E2E. Commit the checkpoint/case/runbook definition before
preflight and launch. Do not start a scored E2E if its preflight fails.

## Monitoring and stop rule

Follow [E2E monitoring](e2e-monitoring.md). Determine current stage from the
RUN controller/timeline and fresh stage/work evidence, not manifest entry
stage. Correlate Work graph, native durable content/tool events, observer and
process/lease liveness, HITL identity and lifecycle receipts. For Plan 051,
check that an idle Grok boundary captures promptly; if it retries, inspect
`last_capture_mismatch.components` and bounded before/after proofs. For AGY,
verify direct-child Work start/finish and never equate `settled_by_root` with
Work success; report a pre-CLI hook rejection with its daemon, operation and
turn identity.

On a scored runtime failure, investigate artifacts read-only and report the
primary cause. Do not resume, restart, perform manual repair, edit code or
create a duplicate EVAL.

## Receipts

Both preflights passed against committed definition
`3087e5e955c45f9eb2008cb7de7ded1140c12001` and tree
`7cfbdd81983940bb6c9239b0ba1e0ecb740ab90b`. The prepared RUN reached
SPECIFY without a provider Session; the baseline remained `not_run` in both.

- Grok receipt:
  `/Users/deksden/.dd-eval/qualification/cp-138-grok/conformance/e2e-preflight/1790107333424-5987f48a/e2e-inline-merge-grok-4-7-high`.
  Grok `1.0.40`/ACP1 and the Sol judge doctor were compatible.
- AGY receipt:
  `/Users/deksden/.dd-eval/qualification/cp-139-agy/conformance/e2e-preflight/1790107376639-485d8d3e/e2e-inline-merge-agy-gemini-3-1-pro-high`.
  AGY `1.2.8`, isolated Gemini/app-data roots, auth, the requested
  `gemini-3.1-pro-high` catalog entry and Sol judge doctor were verified.

Scored EVAL receipts are appended only after each launch returns its durable
identifier.
