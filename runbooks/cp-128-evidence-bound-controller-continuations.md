# CP-128: evidence-bound controller continuations

Date: 2026-09-21. Published qualification in progress; no live PASS claimed.

## Immutable inputs

- CLI: `@deksden-com/dd-flow-cli@0.9.0-beta.90`, candidate commit
  `a4e9733f871af5032fc372d324d8fd0dfd2ec44f`.
- Canon: `d1a6081ab15ab92ac917ff5d037121a40c709db1`, version `4.1.1`.
- Product source remains `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Project flow pack remains `53d4b76943900f122957c78cc0fefa2051bd7b1a` in
  `deksden-com/dd-tasks`. CP-128 is engine-only relative to CP-127.
- Profile: `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json`.
- Home: `/Users/deksden/.dd-eval/qualification/cp-128-luna`. It contains only
  portable engine configuration, agent profiles, empty resources and the newly
  installed package/engine snapshot. CP-127 runs, SQLite and conformance state
  were not copied.

## Release evidence

The immutable release gate `35596446951` passed candidate construction, package
smoke, four integration shards and the runtime-sensitive suite on the same
candidate bytes. Publication then exposed two release-transport defects rather
than product defects: explicit Sigstore provenance is unavailable for this
private source repository, and annotated-tag creation lacked a Git identity.
The workflow was hardened without rebuilding the candidate. Recovery workflow
`35598327442` verified the existing npm bytes and annotated tag after fetching
remote tags and completed successfully.

- npm beta dist-tag: `0.9.0-beta.90`.
- Peeled `v0.9.0-beta.90`: `a4e9733f871af5032fc372d324d8fd0dfd2ec44f`.
- npm tarball SHA-256: `2f59607d84b4a8a3a4f42dc78713556fe4d7ac5e4239543c4f63182be7435b16`.
- npm integrity:
  `sha512-71Rty9MHZxIqY2/W1EfrfKs1X4sHuZNysAonM287yVr1w2TuwA5b8GU8DPoexDn1ADCXzbWYFryikA/3VOO88w==`.
- Installed engine snapshot full-content SHA-256:
  `522e8ffd194598191484b3a6e4f505690baf23637c95d124fb2aee1f59de50e6`.

The snapshot digest was computed with `engineArtifactDigest` from
`engine.json.snapshot_root` and independently accepted by `verifyEngineArtifact`.
Do not substitute the npm tarball or bare package-directory hash.

## Qualification and launch

1. Run `scripts/qualify-published-repair.mjs` with regression fixtures checked
   out at the exact candidate commit and imports redirected to installed npm
   modules. The smoke must include ordinary settled PLAN-REVIEW/CODE/CODE-REVIEW
   continuation as well as repair registration/replay.
2. Commit and push the checkpoint, case pin, qualification contract, plan and
   this runbook.
3. Run the ordinary profile preflight with explicit CP-128 `DD_EVAL_HOME`,
   published `DD_FLOW_BIN`, `DD_FLOW_CONFIG_HOME` and `DD_FLOW_RESOURCE_HOME`.
   Do not launch after a failed preflight.
4. Record the preflight receipt, commit/push its documentation, then launch one
   new scored E2E. Never resume CP-127 or create a duplicate CP-128 EVAL.

Monitor by `runbooks/e2e-monitoring.md`. The current stage comes from the actual
RUN controller/timeline and fresh stage/work artifacts, not manifest entry-stage.
For fanout stages correlate stage attempt/cycle, child graph, native durable
events, process liveness, lifecycle receipts and primary error. Ordinary settled
children must lead to the stage-specific semantic completion action. A repair is
reported as registered only after its durable receipt exists. Monitoring is
read-only: do not resume, retry, repair or edit code after a runtime failure.

## Receipts

Published-engine qualification, preflight and launch receipts are appended here
after they complete. Until then, this document makes no scored-E2E quality claim.
