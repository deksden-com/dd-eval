# CP-127: runtime-owned repair continuations

Date: 2026-09-21. Release/live qualification in progress; no live PASS claimed.

## Immutable inputs

- CLI candidate: `0.9.0-beta.89`, `e36aabd9160805831809ca27575600fb6db47511`.
- Canon: `d1a6081ab15ab92ac917ff5d037121a40c709db1`, version `4.1.1`.
- Release gate: GitHub Actions `35580147738` in `deksden-com/dd-flow-cli`.
- Product source remains `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag `eval/cp-074-source-final`.
- Project flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a` in `deksden-com/dd-tasks`.
  Only five flow instructions and manifest notes changed from CP-126:
  `common/runtime-cli.md`, `common/runtime-contract.md`, `vnext/code.md`,
  `vnext/code-review.md`, `vnext/merge.md`. Product source and other Memory Bank
  inputs are unchanged. This qualification is deliberately not engine-only.
- Profile: `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json`.
- New home: `/Users/deksden/.dd-eval/qualification/cp-127-luna`.
  Copy only `engine-config/harnesses.json` and portable `agent-profiles` from CP-126.
  `resources` starts empty; never copy runtime SQLite, conformance, RUNs or Sessions.

## Regression evidence

Typecheck, lint and strict build passed during implementation. Targeted coverage includes
atomic registration with rollback, concurrent built-engine processes, lost-reply replay,
completed replay, all causal failures, exact native auxiliary rejection, stage/attempt/cycle
membership, legacy compatibility refusal, alias containment and shell argv round-trip.
The integration suite forces aggregate failures in both CODE and CODE-REVIEW, executes fresh
repair Work and proves the accepted gate afterward. Two old assertions on double-quote
spelling were replaced with parsing and checking the actual project-root argument; both reran
successfully. Eval managed-client regressions: 19/19 passed.

The release workflow owns the full suite; targeted success is not a replacement for its PASS.
Do not rebuild shared `dist` while subprocess integration tests use it.

First release gate `35578276811` stopped before publication: 1526/1532 tests passed.
One snapshot test asserted JSON double-quote spelling and removed a recovery argument using
that spelling; it now parses argv and uses the renderer for the deliberate stale-packet case.
Five MERGE recovery fault-injection cases mocked the old renderer module and supplied an
incomplete AppContext. The stale mock was removed and the real context home supplied.
Commit `e36aabd` changes only these tests; both complete suites reran 38/38 PASS, as did
typecheck/lint. Beta.89 was not published by the failed gate; no version was skipped.

## Published qualification and launch

1. Require successful release gate, read npm beta tag and peeled git tag.
2. Inspect published tarball `dist/build-info.json`, not a source build; compare exact CLI
   and canon tuples above. Install the exact version in this home's `published-engine`.
3. Compute the installed engine snapshot digest using `engineArtifactDigest` on
   `engine.json.snapshot_root`, NOT on the npm package directory: the snapshot also
   contains resolved production dependencies. Verify it against `engine.json.integrity`
   and the published engine's `prepareForkEngine` source inventory; pin it in a new
   checkpoint and update the case checkpoint file checksum. Never ask a model to copy hashes.
   Run `node scripts/qualify-published-repair.mjs /Users/deksden/Documents/_Projects/dd-flow-cli /Users/deksden/.dd-eval/qualification/cp-127-luna/published-engine/node_modules/@deksden-com/dd-flow-cli`.
   This reuses matching-commit regression fixtures with imports redirected to installed npm
   modules and packaged schemas; it rejects a different fixture commit and removes only its
   own temporary test directory. It does not touch any EVAL runtime.
4. Run the ordinary profile preflight with all four explicit homes/bin variables. Preserve
   baseline `not_run` semantics; the actual E2E owns its baseline. No launch after failed preflight.
5. Commit/push the checkpoint, case, contract expectation, plan and this runbook before launch.
6. Launch a new scored `runner eval run`, never resume CP-126. Record actual EVAL ID below.

Follow [E2E monitoring](e2e-monitoring.md). Actual stage comes from RUN/controller/timeline,
not immutable manifest entry-stage. A registered `repair_required` is a transition to fresh
child work, not terminal success/failure. Check all causal receipts, current graph membership,
native turn and process liveness; report primary errors without masking them as no-progress.
Do not send retries, repair commands or resume as a monitoring action. Runtime failures get
read-only investigation. Report meaningful transitions, HITL/blockers, confirmed ownership
failure or completion; stay quiet on unchanged live state.

## Launch receipt

Release workflow `35580147738` succeeded at `2026-09-21T09:13:04Z`.
Npm beta dist-tag is `0.9.0-beta.89`; peeled `v0.9.0-beta.89` resolves to the
CLI commit above. Published tarball and installed `dist/build-info.json` match
the exact CLI/canon tuple. Installed engine snapshot full-content SHA-256:
`964c1ed0d58c7d3d26b40515c139de1d6660bd684e5783dad1a9a70f635e9402`.
Npm integrity: `sha512-XXUWKZZa0i0FO7lzO383aafdq3OYw0y3I8S0TuYov+FQEpHIl5ahllHsoqz9dlttQIUvFos2QhNFOhSAxYGMWQ==`.

Published-engine repair qualification: 16 passed, 20 deliberately unselected,
2 test files passed. The checkpoint/case pin contract also passed.
The new home contains portable configuration and the installed package only;
no historical runtime state was copied.

First preflight `1789982148186-6636b60b` rejected `input_checkpoint_engine_mismatch`
before provider execution: preparation had pinned the bare npm directory digest rather
than the engine snapshot inventory (which includes production dependencies).
The corrected digest was independently verified by `verifyEngineArtifact` and the
published engine's `prepareForkEngine`. The failed receipt is retained unchanged.
Corrected preflight `1789982252986-500dadd2` passed at `2026-09-21T09:17:48Z`
against definition `a5e8df5be7715cc374f2c9e2ace3053214fd5c27`.
Receipt: `/Users/deksden/.dd-eval/qualification/cp-127-luna/conformance/e2e-preflight/1789982252986-500dadd2/e2e-inline-merge-luna-xhigh/receipt.json`.
Subject Luna xhigh and Judge Sol high doctors passed for Codex 0.154.0;
provider Sessions created: 0; baseline: `not_run` (owned by the actual E2E).
New EVAL allocation pending. This receipt-only documentation update does not
change qualified inputs and does not require repeating preflight.
