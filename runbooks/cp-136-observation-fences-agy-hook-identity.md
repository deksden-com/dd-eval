# CP-136/137: observation fences and AGY hook identity

Date: 2026-09-22. This campaign validates Plan 050 with fresh Grok and AGY
homes. It preserves the CP-134 task source, flow pack and harness tuples and
changes only the published engine identity.

## Immutable tuple

- Product source: `deksden-com/dd-tasks`
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a`, path
  `.memory-bank/dd-flow`, Memory Bank `4.1.1`.
- Canon: `4.1.1`, commit
  `678daa038287c948ada5b2d785a6dcc925c7b891`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.97`, commit
  `4d478c7dd9549a5b81ed5cd77d4f04befebf6f1c`, installed full-content
  SHA-256 `90c2e6abfdeac7bca2d6161274e20f8f795f4706804c279a4f0ac5b005ab1f45`.
- Grok: Build `1.0.40`, binary SHA-256
  `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2`,
  `grok-4.7` high, ACP1.
- AGY: `1.2.8`, binary SHA-256
  `b9a0982a7fb09b41f585d93cfa2fe541ec8e4395445a4246973317506477382f`,
  requested `gemini-3.1-pro-high`; native child model attribution remains
  incomplete rather than inferred.

Homes are `/Users/deksden/.dd-eval/qualification/cp-136-grok` and
`/Users/deksden/.dd-eval/qualification/cp-137-agy`. They contain only portable
engine/agent configuration plus the exact published package. Prior runs,
runtime databases and conformance state were not copied.

## Release evidence

Workflow `35748312676` passed prepare, runtime-sensitive, four integration
shards and immutable candidate/package smoke. npm accepted the exact candidate,
but the post-publish readback exhausted because npm temporarily returned
`ETARGET` while processing the new version. Registry readback later proved:

- beta dist-tag: `0.9.0-beta.97`;
- peeled tag `v0.9.0-beta.97`:
  `4d478c7dd9549a5b81ed5cd77d4f04befebf6f1c`;
- npm tarball SHA-256:
  `f4d4e2be63b45dd54d53069bf80456e5f3fced7597c7458c04e0fa35f5505342`;
- npm integrity:
  `sha512-1o4icAZl9EHp5fIpFVf+03R/Ib1I1d7WlfQhEPVkRWWFIEJOgi+EaASGD/FyEEOEsMtFoClV7biylhO0crLUMg==`.

The accepted candidate and registry tarball hashes match. The installed
consumer selected the exact version and produced the expected full-content
snapshot checksum. The readback classification defect is fixed separately by
`deksden-com/dd-flow-cli#12`: npm `ETARGET` is transient during this bounded
post-publish verification, while authentication and malformed responses still
fail closed.

## Admission and monitoring

Run a standard preflight before each scored launch:

- `e2e-inline-merge-grok-4-7-high.json`;
- `e2e-inline-merge-agy-gemini-3-1-pro-high.json`.

Both commands must use the matching explicit `DD_EVAL_HOME`, published
`DD_FLOW_BIN`, portable `DD_FLOW_CONFIG_HOME` and fresh `DD_FLOW_RESOURCE_HOME`.
Monitor using `runbooks/e2e-monitoring.md`. Determine current stage from the
RUN controller/timeline and fresh stage/work artifacts, not manifest entry
stage. Correlate Work graph, native provider turns, process/lease liveness,
HITL identity and lifecycle settlement receipts. In particular:

- Grok settlement inspection must not mutate usage storage during the
  observation/capture boundary or produce `owned_inventory_changed` by itself;
- ordinary productive Grok inspection must still ingest usage;
- AGY lifecycle hooks with `conversation_id` and nonnegative `stepIdx` must be
  admitted when `executionNum` is absent; malformed step identity and invalid
  present execution numbers must still fail closed.

Runtime failure investigation is read-only: no resume, duplicate launch,
manual repair or code change.

## Receipts

Preflight and scored E2E receipts are appended after admission.
