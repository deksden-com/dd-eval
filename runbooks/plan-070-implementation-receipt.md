# Plan 070 implementation and acceptance receipt

## Scope

Opt-in compact `dd-eval/hitl-coverage@1`, frozen packet/projection, bounded JEV
HTTP filter, retained native fallback, dual-source issuance/replay and neutral
report@3 are implemented. Existing profiles continue using their previous
contract. Only the new Luna shadow candidate selects the new contract.

Review fixes: bind proofs to EVAL identity; verify original calibration packet,
request and observation hashes rather than trusting acceptance counters; bind
promotion to the authored corpus; strip classifier credentials at every non-owner
spawn boundary, including native maintenance's final ambient-environment merge;
retain unknown HTTP outcomes without redispatch, including PID reuse.

## Deterministic verification

Targeted coverage/maintenance/sleep checks: 51 PASS, zero failures/skips.
Final paired full suite: 630 PASS, zero failures/skips (435 seconds), including
the installed operational runtime. `git diff --check` passed. Reproduce with:

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/dd-flow-cli \
DD_EVAL_TEST_FLOW_CLI=/Users/deksden/Documents/_Projects/dd-flow-cli/dist/cli.js \
DD_EVAL_TEST_FLOW_ADAPTER=/Users/deksden/Documents/_Projects/dd-flow-cli/test/fixtures/controller-stage-adapter.mjs \
DD_EVAL_TEST_OPERATIONAL_RUNTIME=/Users/deksden/.dd-eval/qualification/cp-199-luna/runs/EVAL-20261007150952-633767e5/control-runtime/engines/@deksden-com_dd-flow-cli/0.9.0-beta.125/dist \
node --test --test-concurrency=1
```

The full discovery run also included two passing tests from the concurrently
authored, untracked Decisions experiment; those files are not part of this PR.

## Live compact qualification

Home: `/Users/deksden/.dd-eval/qualification/cp-200-coverage`.
Qualification key: `b836216b29bbc441ed7ece5de610659d83239430f5d515abb2e67c4f39430d50`.
Native observations: 41 matching status/response-ID sets, with owned cleanup.
Thirty retained observations were reused; only eleven missing cases dispatched
new native tasks. Judge remains `gpt-6.1-sol` / `high`.

The original `heldout-indicators-refusal` label was wrong: its question/context
did not resolve “approved minimal state”. Its retained ambiguous answer was
correct; the expectation was corrected and an independent covered case added.
No classifier prompt was weakened and no JEV held-out observations had occurred.
The frozen corpus has 20 calibration and 21 held-out cases (10 held-out covered,
11 negative), SHA-256
`c24a3d6e31f31acfa62bd7dd3bca3feca5cbb58c94f6115149bd778db0aef5a3`.

Twenty negative answers still require bound semantic adjudication of remaining
question completeness. Code deliberately reports
`definition_qualification_review_required`; matching JSON/status is not a
semantic completeness certificate. Reviewer authorization has been requested.
No manual review PASS has been fabricated.

## Pending empirical acceptance, not implementation defects

After adjudication, rerun the existing qualification entrypoint: retain all
original native observations, run three JEV observations per frozen case, freeze
the threshold using calibration only, then assess the independent held-out set.
Zero false-covered held-out cases and a stable positive fast-path yield are
required. Never tune against held-out failures. Until PASS, stay Judge-only/shadow;
do not create an accepted cascade policy or claim measured end-to-end speedup.

A new scored smoke requires separate launch authorization. No running/historical
EVAL, product source, selected engine or global harness installation was changed.
Concurrent untracked OpenAI Decisions experiment files were excluded from commits.
