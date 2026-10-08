# Plan 073 — implementation and verification receipt

Date: 2026-10-08. Repository: dd-eval. Branch: `fix/073-execution-contract`.
Scope: [plan 073](../specs/073-cp202-execution-contract-and-comparison-plan.md).

This branch depends on the existing CP072 candidate ancestry ending at
`69df96023d42c18f8b7bd6d2bc1bbc7e3bc415db` (also `2513941`, `019852f`), rather
than claiming those changes are already in main. No main merge or release is
included. The unchanged dd-flow source used for cross-repository checks is
`e61fd6712e70e549ea8c047218c7bf1e4b1e937f`, engine beta.125.

## Scope closure

| Defect | Implementation / verification |
| --- | --- |
| D1 | Shared resolver validates complete same-ID templates; repo model/reasoning are authoritative. Effective policy materializes before RUN preparation and is checked before native dispatch. Real dd-flow snapshot/resolver regression reproduces the 5.6 versus 6 failure without a model call. |
| D2 | Report/status/candidate distinguish experiment conformance from provider-returned model attribution. Frozen RUN and known role-specific native intent are compared; missing historical evidence stays unknown. Invalid new contracts cannot become a finished valid experiment or trigger automatic Final Judge. |
| D3 | Fresh E2E, focused restore and canonical bootstrap/resume share the contract. Canonical continuation retains launch profile/policy rather than reloading the source file. |
| D4 | Portable harness configuration no longer copies ambient model profiles. Fork inherits and materializes the retained contract, checks the new RUN, and does not mutate source evidence. |
| D5 | Interaction/Final Judge use retained effective policy; semantic fast-path replay does not demand native settings. Qualification keys include actual Judge policy, not Subject settings or whole repository tree. Explicit supplemental assessments retain their own chosen profile. |
| D6 | Standard sequential comparison waits for durable finished + settled cleanup + completed target + matched conformance. Local receipt/lock, exact acknowledgment and uncertain-submission reconciliation prevent duplicate/overlapping launches. |
| D7 | Measurements separate durable Stage duration, paused windows, HTTP/total/retry time. Documentation prohibits interpreting independent trajectories as identical-input benchmarks or a single sample as proof of speed/accuracy. |
| D8 | Reviewed CP202 Stage prompt/context: all four supplied task/project paths are absolute and present. No producer path defect established; recovered agent guesses remain quality evidence. No product patch, path alias or command rewriting added. |
| D9 | Admission inventory includes reachable coordinators, external workers and enabled Judges. Executable fake adapter regression proves a worker doctor failure stops admission before provider dispatch. Native capacity belongs to the actual stage coordinator; external mode and PLAN alone do not acquire needless capacity gates. |
| D10 | Native Judge intent/verdict/replay bind semantic effective profile hash, not only ID. Retained HITL and Final Judge reject same-ID changed settings; historical evidence is not silently rejudged. |

Additional integration checks closed bootstrap hook materialization, canonical
launch-profile retention, role-specific capacity, lazy native Judge fallback,
and pre-enqueue comparison bindings (profile, effective contract, admission,
checkpoint, canonical fixtures + selected-stage context). Existing ZCode/AGY
provider/mode declarations constrain the template and are accepted when equal;
conflicts fail before dispatch. Unreached later-stage context does not invalidate
a SPECIFY-only comparison. Provenance-only changes do not invalidate
semantic/admission equality. Each individual retained contract still validates
its integrity.

## Verification

All checks use deterministic fixtures/native API doubles, not paid providers.
Final exact-tree full suite: 730 tests, 720 PASS, 0 FAIL, 10 SKIP
(optional opt-in integration checks), 102525 ms. Contract/admission/comparison
regressions separately: 48/48 PASS. Syntax checks and `git diff --check`: PASS.

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-cp198-implementation node --test --test-concurrency=2 test/*.test.mjs
git diff --check
node --check lib/runner.mjs
node --check scripts/run-specify-comparison.mjs
```

## Acceptance boundary

No new EVAL, paid qualification, historical resume/repair, engine publication,
main merge or historical artifact rewrite was performed. CP202 remains evidence
with its original limitations. Live comparison is a separate operational action;
this receipt does not claim live acceptance or model correctness.

Ponytail review: existing loaders, frozen RUN authority, native admission,
hashing, locks and status were reused. No dependency, universal campaign DSL,
new profile registry or machine-wide semaphore was added.

## Independent implementation review (2026-10-08)

Three read-only reviewers audited contracts/recovery, Judge/retained evidence,
and comparison orchestration. Their findings were checked against the actual
dd-flow beta.125 source and deterministic reproductions by the integrating agent.
Substantial gaps corrected:

- Recovery called `run control resume` before RUN conformance admission. That
  command spawns a controller and can prompt the retained native Session.
  The contract is now checked immediately before resume. An executable-double
  regression fails against the previous implementation and confirms that a
  mismatch issues no resume with the fix.
- Terminal EVAL with pending cleanup ignored worker failures/dead ownership;
  blocked cleanup also polled forever. Comparison now checks these blockers
  until authoritative settlement, including the real incomplete-observation
  status shape. Initial live preparation without a managed RUN remains valid.
- `permission` was passed to a checker expecting `permission_mode`, omitting
  the security comparison. Shared native checks now use the existing normalized
  Judge settings. AGY's allow policy maps to its native `always-proceed` field;
  routing differences remain permitted, permission/autonomy differences do not.
- Appending a flag does not mean an adapter enforces it. The pinned non-ZCode
  adapters do not implement configurable deny; such templates now fail before
  dispatch with `execution_policy_unsupported`. ZCode's ACP deny stays supported.
  No adapter is silently switched to a different permission policy. This is an
  admission/dispatch guard, not a structural reader restriction: historical
  receipts stay readable and owned cleanup/cancellation remains available.
- Focused/segment doctor inventory previously covered unreachable stages.
  Admission uses selected execution ranges; all routing profiles remain frozen
  for structural integrity. Canonical authoring explicitly admits its full case
  contour because it traverses beyond the EVAL profile's selected range.

The first review full run exposed an old test that expected Codex deny to be
accepted as a qualification-key change. It now asserts the unsupported-policy
blocker. Targeted scope/canonical/recovery/comparison tests: 61/61 PASS.
Final exact-code-tree full suite: **738 tests, 728 PASS, 0 FAIL, 10 SKIP**
(opt-in integration boundaries), 95068 ms, using the full-suite command above.
Final policy/retention regressions: **98/98 PASS**. Syntax/diff checks and
comparison script help: PASS. No new dependency or dd-flow source edit.
The review request separately authorizes integration through ordinary PR/squash
merge, including the retained CP072 prerequisite. This is not runtime release
or live acceptance; neither new EVALs nor paid qualification were run.

Ponytail: reused the existing selection helper, admission check and policy
normalizer; no new retry, registry, model call or runtime repair was introduced.
