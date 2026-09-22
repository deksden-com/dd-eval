# CP-131: ZCode public lifecycle admission

Date: 2026-09-22. Published qualification passed; scored E2E not yet launched.

## Immutable inputs

- Product source: `deksden-com/dd-tasks` commit
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `deksden-com/dd-tasks` commit
  `53d4b76943900f122957c78cc0fefa2051bd7b1a`, path
  `.memory-bank/dd-flow`, canon version `4.1.1`.
- CLI: `@deksden-com/dd-flow-cli@0.9.0-beta.95`, commit
  `4c8c5e8456d684a7887c8bfdd1afc24ae874ff6c`, canon commit
  `d1a6081ab15ab92ac917ff5d037121a40c709db1`.
- ZCode: native `0.16.9`, SHA-256
  `500ae84fa2cb8dd74c1264e5f3d3709c004c59b58899f1b0c3e205137a0ef466`.
- Adapter: `deksden-com/zcode-acp` tag `dd-v0.46.7-dd.1`, commit
  `f4d47b517073f9bdb8d4eba3d0d59ce66c6a2833`, upstream `0.46.7` commit
  `230dcdf74aa021f37dd6d8e69023e7e2a77aed2a`, contract
  `dd-zcode-harness@2`, code fingerprint
  `e93e0c38f86a2a213dd90ad9dbb94407e186caabac99cf36e3e1b1ccb08b697e`.
- Profile:
  `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json`.
- Home: `/Users/deksden/.dd-eval/qualification/cp-131-zcode`. It was created
  without prior runs, runtime databases or conformance state; only portable
  agent and engine configuration was copied.

## Release evidence

Workflow `35696623199` passed release contracts, runtime-sensitive tests, four
integration shards, immutable candidate checks, publication and registry
consumer verification. The published tuple is:

- npm beta dist-tag: `0.9.0-beta.95`;
- peeled tag `v0.9.0-beta.95`:
  `4c8c5e8456d684a7887c8bfdd1afc24ae874ff6c`;
- tag object: `fb7a34f`;
- npm tarball SHA-256:
  `1970722f6fe2ad43981ec2b3c041f22ccf76086823fa24f21abb0ae1c6c337e4`;
- npm integrity:
  `sha512-7HM4+6N7s4jJKotz74K9VRFwShxzEiAKN61Vj1KZ4Oz4uZiCdqeDap/1FZF39s4U1MpEyFFtxbwSMmbUdDDXQg==`;
- installed engine snapshot full-content SHA-256:
  `2a12a82a250b8b96bbbca09c4ffbd28a4e46b74cf783b61ac6c218c3a23c3221`.

`dist/build-info.json`, `engineArtifactDigest` and `verifyEngineArtifact`
independently accepted the same immutable tuple. Workflow `35695653584`
exposed a test-only admission race: the assertion queried
`run_control_workers` before the detached cleanup owner created the table. PR
`deksden-com/dd-flow-cli#9` made the test wait for the public worker admission
state; it did not weaken the runtime contract.

## Adapter qualification

Harness compatibility passed at:
`/Users/deksden/.dd-eval/qualification/cp-131-zcode/conformance/harness-compatibility/20260922070401178/zcode-acp-zai-glm-5-3-flash-max/receipt.json`.
Native capacity passed 15/15 with clean settlement at:
`/Users/deksden/.dd-eval/qualification/cp-131-zcode/conformance/native-subagents/20260922070504465/zcode-acp-zai-glm-5-3-flash-max/capacity.json`.

The published-engine production probe passed at
`/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-production-MqhxVF`.
It exercised root lifecycle, two concurrent children and continuation of the
same child using only public commands without caller-owned invocation IDs.
ZCode completes `SendMessage` continuations after the parent turn returns, so
the probe keeps the bridge alive, waits for durable child completion, then
finishes the root Work in the same root session. Nested children remain
unsupported by the child toolset and are not claimed.

## Launch procedure

1. Commit and merge this checkpoint, case pin, profile, probe and runbook.
2. Run standard preflight with explicit CP-131 engine, config, resource and
   native ZCode paths.
3. Record the receipt in this runbook and merge it.
4. Start exactly one scored E2E; never resume CP-130 or create a duplicate.

Monitor by `runbooks/e2e-monitoring.md`, using the RUN controller/timeline and
fresh stage/work artifacts rather than the manifest entry stage. Correlate
stage/attempt/cycle Work, native durable events, observer/process liveness,
HITL, lifecycle receipts and the primary error. Runtime failure investigation
is read-only: do not resume, retry, manually repair or edit code.

## Receipts

Preflight and scored-E2E receipts will be appended after the committed
definition is admitted.
