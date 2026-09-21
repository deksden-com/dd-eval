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

Published-engine qualification passed against exact-commit fixtures redirected
to installed npm modules: 19 selected tests passed across three files, including
the three settled-fanout regressions; 27 unrelated tests were deliberately
unselected. Eval contract tests passed 67/67.

Preflight `1789993420090-d319a964` passed against committed definition
`3e8ef8eea1311365c1bb078fa4aca42ec6876421` and tree
`99ae138b72d2040d1f3a128883e25d2cb5bfbd2a`. Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-128-luna/conformance/e2e-preflight/1789993420090-d319a964/e2e-inline-merge-luna-xhigh`.
Both Luna subject and Sol judge doctors passed with Codex `0.154.0`, no provider
Sessions were created, and baseline remained correctly `not_run` for the actual
execution workspace. Until the launch receipt is appended, no scored-E2E quality
claim is made.

Scored E2E launched once as `EVAL-20260921122436-1ffe0a80` from committed
definition `3be66456af466de68cc6ea61b1b960a7aff2ebe5` (tree
`d57acdff73ce313ce15e7f2b9906066d23e1ae43`). Root:
`/Users/deksden/.dd-eval/qualification/cp-128-luna/runs/EVAL-20260921122436-1ffe0a80`.
The accepted launch entered `awaiting_provider`; observer PID `62114` was alive,
its lease current, and baseline/runtime materialization had not yet produced a
managed RUN or provider Turn. This is a healthy launch transition, not evidence
that SPECIFY has begun and not a scored quality verdict.
