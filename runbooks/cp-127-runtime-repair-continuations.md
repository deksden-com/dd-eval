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
3. Compute the installed full-content digest using `engineArtifactDigest`; pin it in a new
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

Pending published package verification, preflight and new EVAL allocation.
