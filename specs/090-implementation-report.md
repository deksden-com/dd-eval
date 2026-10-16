# 090 — Implementation and verification receipt

Scope: FLOW/adapters/EVAL tooling only. No release, pins/hooks update, new scored
EVAL or control of historical/working EVAL processes belongs to this change.

Engine candidate: `5da2bb0a4667dd59f680b05625e5923762b71ffd`, tree
`a4ebcc7689a3be0d76bdb13c6b0ad1f3d5bb6482`.
Clean canon: v4.1.2, `1ddedf9d3f086e046f8e7b194c739ec386e7c8b9`.
Node v26.8.2, Darwin arm64. Required full gates are recorded below after completion;
focused tests are development evidence, not a substitute.

## Defect coverage

| Defects | Implementation | Runnable regression |
| --- | --- | --- |
| D01, D13 | Current RUN drives stage route; route tuple fenced across Session setup independently of heartbeat revision; real feature-worktree fixtures. | `test/run-controller-stages.test.ts`, `test/execution-policy.test.ts` |
| D02 | SDLC bundle guards require coherent retained route authority; generic scope remains frozen; verified snapshot relocation preserves original receipts. | `scripts/e3-bundles.test.mjs`, `test/workspace-route.test.ts` |
| D03 | One SQL writer for workspace/index/revision/audit/timeline; committed projections repair without second worktree creation. | `test/workspace-route.test.ts`, `test/vnext-protocolize.test.ts` |
| D04–D05 | Optional shell output cannot block terminal; completed tools ignore late SSE; moved owned Sessions remain inspectable/cancellable, not dispatchable. | `test/fixtures/opencode-adapter.mjs`, `test/fixtures/opencode-v2-native.mjs` |
| D06–D07 | AGY retains terminal before enrichment; ERROR/CANCELLED stay primary; persistence loss and tree uncertainty remain explicit. | `test/fixtures/agy-state-boundaries.mjs` |
| D08 | OpenCode uses active-generation hook IPC and shared bound failure ledger, including receipt-write failure; no native text parsing. | `test/fixtures/opencode-v2-plugin-native.mjs`, `test/fixtures/opencode-adapter.mjs` |
| D09–D10 | Codex/Droid preserve admission no-effect separately from Turn effects; AGY/Droid share exact correction proof. | `test/fixtures/codex-adapter.mjs`, `test/fixtures/droid-adapter.mjs`, `test/fixtures/agy-state-boundaries.mjs` |
| D11–D12 | Bounded diagnostics retain refusal/route/terminal authority; exact integrity/route codes need issued/controller provenance. | `test/eval-retirement090.test.mjs`, `test/check-diagnostic086.test.mjs` |
| D14 | Durable cleanup sidecars, explicit deferral, all-role scope controls, physical/native separation, prelaunch resource fences, independent qualification ownership. | `test/eval-retirement090.test.mjs`, `test/cleanup-sidecar090.test.mjs`, `test/qualification-owner090.test.mjs`, `test/runner-control.test.mjs`, `test/runner-fork.test.mjs` |

## Review corrections and boundaries

- Route creation facts bind immutable `workspace.base/branch/path`. Do not freeze
  `execution.git`: normal stage completion refreshes that observation.
- Publication repair and snapshot relocation are covered independently; no
  claim of a new live bundled snapshot qualification is made.
- Cleanup handoff is persisted before observer registration release. Cleanup
  workers stay outside their target scope and never unseal its root journal.
- A scope RUN drain is not superseded immediately by a permanent scope fence;
  failed/superseded drain may use existing exact lease/PID-birth process control.
- Prelaunch fencing precedes lifecycle locks. Coherent admission is read under
  a short lifecycle lock first, then revalidated after retirement. Invalid inputs
  cannot cause engine work; active reattachment is not a fresh-launch sweep.
- Private maintenance shims can override resource-home. Fallback therefore uses
  verified payload bytes and the original target resource DB, never a global CLI.
- QUAL operational scope/budget is separate from semantic task/cache identity.
  Qualification runtime evidence is retained; cleanup does not delete archives.
- Native/capture uncertainty is not PASS or GC authority. Shared storage has no
  new guessed ownership: absent explicit last-consumer proof it requires operator
  verification, as documented in the storage runbook.
- Old cleanup intents retain native-settlement semantics. Unknown contract
  versions refuse; repeated request IDs cannot change their meaning.
- Local retirement completion always requires `physical_stopped=true`, including
  the recovery-budget boundary. A legacy Subject/Judge settlement receipt cannot
  substitute for all-role process proof. Missing proof stays `recovery_blocked`.
- Replaying an exactly applied resume after terminal retirement returns a bound
  historical ACK with `dispatch_blocked=true` and `release.current=false`; it
  neither appends the captured journal nor reopens the scope.
- Status tolerates an attempt directory before atomic receipt publication but
  rejects corrupt/foreign receipts. Cleanup environment forwards no Decisions keys.

Test isolation review found temporary test locators appended to the operator
homes registry by the first broad external-root registration implementation.
Registration is now restricted to canonical QUAL outputs; affected fixtures use
private registries. Exactly the 13 locators added by this task were removed;
historical EVAL files/processes were not changed.

## Acceptance

EVAL executable candidate: `139ac6c6a533f2636a40e65ff4ef8e8d15b93188`,
tree `79141a70ef7f517c4462c8a57de082e9af9fbc0d` (subsequent report-only edits
do not change executable inputs).

- Final complete paired `npm test`: exit 0; 912 tests, 907 PASS, zero failures,
  five explicitly gated external-fixture skips; 776.339 seconds. Required paired
  real-CLI resume/fork, installed capacity/clock and operational runtime targets
  executed. Private registry and the frozen engine source/dist/installed snapshot
  were passed explicitly as documented in `runbooks/flow-test-suite-verification.md`.
- Skipped optional fixtures: private complete Memory template; native installed
  owner proof; pinned dd-tasks zero checkpoint; authenticated external/native
  semantic selection; installed setup/Console observation. They are NOT RUN,
  not evidence of live qualification.
- Final focused retirement/recovery: 75/75 PASS. Historical fenced ACK and its
  negative bindings, qualification ownership and reliable continuation checks
  also passed.
- Engine build/typecheck/lint: PASS. Installed E2: 2/2 PASS. Final complete frozen
  engine `pnpm test`: exit 0, no filters/retries/bail or ignored unhandled errors.
  Hybrid 66/66; E2 133 PASS/one gated skip; E3 462 PASS/five gated skips;
  release build checks 2/2 plus release Vitest 8/8; integration 166 files,
  2807/2807; runtime-sensitive 2 files, 48/48. No failed/cancelled tests.
  E3 skips are explicit old/new package pairing, installed init negatives,
  retained correction replay, and two installed real-linter qualification cells.
  They are NOT RUN, not live qualification. The E2 gated installed capability
  remains separate from the additional installed E2 2/2 result.
- Post-gate source tree remains `a4ebcc7689a3be0d76bdb13c6b0ad1f3d5bb6482`,
  clean; `dist` matches the independently installed snapshot byte-for-byte.
  `dist/build-info.json` SHA-256 before/after:
  `2889b4afba6d6ce3fddfb35d65fb233732e66f8ef3f40250e3f48f8ec0644a6e`.
  Snapshot full-content checksum:
  `1b0eedfb1d81e039120ca2d788dcec592c5640b3cc5339c325f167d0b03f352b`.
  Canon remains clean at the recorded revision.
- Earlier failed development runs are retained: unpaired EVAL lacked required
  bindings; paired iterations exposed private-registry/schema fixture gaps and
  terminal-retirement ACK semantics, all corrected before the final full run.
  An initial engine invocation omitted `DD_FLOW_E3_CANON_ROOT`; its separate
  `unverified_lock_owner` refusal is preserved and did not reproduce in the final
  gate (no ownership guard was weakened). A second invocation was cancelled after
  discovering missing `DD_FLOW_E3_WT`. Neither is the acceptance run. The final
  complete invocation explicitly selects clean canon, real Worktrunk and mb-lint;
  the runbook command now retains the required E3 environment.

Raw logs, including failed/cancelled development attempts:
`/Users/deksden/Documents/_Projects/_artifacts/plan-090-verification/receipt.L53sht/`.
The final logs are `dd-flow-090-acceptance.log` and `dd-eval-090-acceptance.log`.

PRs: [engine #78](https://github.com/deksden-com/dd-flow-cli/pull/78),
[EVAL #97](https://github.com/deksden-com/dd-eval/pull/97). Integration uses squash
merge with exact tested head/tree verification, not a direct push to main.
