# Plan 069 — implementation and offline verification

2026-10-07. No historical EVAL was resumed, repaired or rewritten. No new model
E2E, heartbeat, npm release or global harness update belongs to this change.
Product baseline remains `d81cd0acd589a35789aec4c5291ffb5a6efd2d4e`.

## Implemented contract

| Plan defects | Shared correction |
| --- | --- |
| P1–P4 | Explicit scoped declaration, selected-engine structural validator, retained policy bytes and one operational Stage/Work renderer. Settings do not imply authority. |
| E1, E4–E7 | Gate applicability before capture access; bounded typed failure chain; native receipt namespace and frozen RUN/Work/SQLite ownership; readiness directories; aborted checks remain nonpassing. |
| E2–E3 | EVAL-owned frozen recovery root; shared typed snapshot/publication resolver for acceptance and supplement; exact generation/control/settlement and hashes. |
| O1–O2 | Canonical journal inventory only; exact harness/Session expected coverage; malformed inventory produces typed incomplete evidence. |
| J1–J2 | HITL mismatch alone is undetermined attribution; candidate, report and Judge bind the same Subject history cut without cumulative usage duplication. |
| T1 | Producer/consumer and negative authority regressions, installed CLI lifecycle tests and installed native matrix qualification. |

Additional review fixes: ordinary `evalJudge` passed stale results and omitted
history; now it uses finalized results and the shared history guard. Fork/import
requires new scoped acceptance and resets the frozen recovery root. Recovery
preserves original authority. Current context paths come only from verified
import/copy mappings; reviewer sources point into their isolated read-only copy.
Stage operational hashes come from SQLite authority, not a mutable `run.json`.
Native aborted receipts retain the producer's optional `abort_reason`.

Final launch-path review found that writing the scoped operational profile after
checkout materialization dirtied Git before baseline admission. Fresh EVAL-owned
checkouts now commit only that profile before baseline and propagate its new
materialized commit into provenance. Any pre-existing dirty/staged/untracked
state is rejected before writing. Generic import/output callers do not commit.
The installed-engine regression covers baseline PASS and dirty-checkout rejection.
Bootstrap restore also propagates that commit instead of dropping it when
returning the restored metadata. Full-suite review then found two shared FLOW
regressions: final live profile revalidation accidentally covered ordinary
prepared profiles, and scope comparison treated `/var` and `/private/var` as
different projects. Ordinary profiles now retain frozen preparation; scoped
authority retains its final drift fence. Existing `canonicalPath` compares
physical roots in fresh and imported decisions without rewriting declaration
bytes or admitting another root. Positive alias and negative foreign-root tests
cover the same rule.

Ordinary retained @2/@3 profiles without a decision still use their engine's
existing admission. No synthetic approvals, policy replacement, new global
framework, product repairs or weakening of read-only/input-integrity guards.
Review dates are not hard TTLs; expiration requires explicit `expires_at`.

## Exact candidate inputs

- FLOW `a1d9496406ae70e03f3e62eab35040edf338ceca`, beta.125, unpublished candidate.
- Canon `b91f82165cbf713739bec6cc9db2cb9867e1824e`, version 4.1.2.
- Flow-pack `cc6f6d99da6b2e3ec80ac6cc0941eb848800baa0`; only flow-pack files changed.
- Tarball SHA `77dab5bb0032a1e4bae2ba48210c45a23e15c418b2bb22c6d7adcabdd1dadf1d`.
- Installed engine SHA `b1c83ce4ab43cd3eccdc4cdcfd6004ca41526226b6e08439791d3e8fad1392f2`.
- New checkpoint [CP199](../checkpoints/cp-199-task-priority-operational-policy.json)
  remains `candidate_pending_preflight`, not an accepted model E2E.
- Matrix proof [receipt](../checkpoints/cp-199-verification-matrix-qualification-final.json)
  SHA `275b0bf0317ce88e45510cdcf561ccdd30e85f0ea31454536e2374d9ca7d3936`.

The retained matrix proof was produced afresh by the installed engine through
PLAN, PLAN-REVIEW, CODE and MERGE. It was not copied/rebound from CP198. Old
checkpoint/proof bytes remain unchanged. Its explicit code-review-off projection
does not claim a model code-review qualification.

## Verification record

Node 26.8.2, pnpm 10.23.0, Darwin. Dependencies came from lockfiles in isolated
worktrees. Strict build used the clean canon revision above.

- Typecheck, ESLint, strict build and diff checks passed.
- Stage context 15/15; reviewer-copy producer/consumer 4/4.
- Acceptance 7/7; recovery/supplement 21/21.
- Selected installed engine admission 7/7, including owned-profile baseline,
  no optional skip.
- Installed EVAL lifecycle/background resume 2/2, no skip.
- Installed native matrix fixture and qualification passed.
- Full serialized EVAL suite: 611/611 PASS, 0 skips. Final changed engine/bootstrap
  paths additionally passed 11/11 after the last EVAL code commits.
- Four FLOW files affected by final review: 82/82 PASS.
- Final CP199 installed engine/definition regression: 89/89 PASS, no skips.

Initial development runs are not acceptance: one overlapped source/definition
edits and was rejected by the retained-definition fence; one FLOW run was
interrupted before the final frozen receipt run. A serialized EVAL run passed
606 tests with one lease-loss witness failure and three explicitly optional
skips. The witness tested owner loss but its unrelated two-second silence budget
could expire first on a loaded host. Only its test startup budget was increased;
exact lease-loss and failed-cleanup assertions remain. The installed optional
paths were then exercised separately. Aborted or failed attempts are not PASS.

The first complete FLOW integration run produced 2214 PASS / 3 FAIL / 0 skips:
the prepared-profile regression and two physical-scope alias failures described
above. These failures were fixed, not waived. Final exact-candidate integration
used the four standard shards; final release/native gates ran on the
same unchanged source/build identity. Final results:

- Integration shards: 977 + 497 + 393 + 351 = **2218 PASS**.
- Inventory union: 128/128 configured files, 2218 cases, **0 skips**, all four
  integration projects present; source/build identity verified by the receipt
  wrapper and union verifier.
- Runtime-sensitive: **43/43 PASS**, inventory 2/2 files, 0 skips.
- Release: **8/8 PASS**, inventory 1/1 file, 0 skips; build verifier **2/2 PASS**.
- Exact final receipt root:
  `/Users/deksden/.dd-eval/qualification/cp-199-candidate/gates-v2`.
- Full EVAL log:
  `/Users/deksden/.dd-eval/qualification/cp-199-candidate/eval-final-tests.log`.

Earlier receipts remain retained but do not substitute for this final candidate.

Live acceptance is separate R9 work and remains unexecuted by explicit scope.

## Delivery boundary

FLOW changes are pushed on `fix/cp198-operational-contract` in
[PR 49](https://github.com/deksden-com/dd-flow-cli/pull/49); canon in
[PR 2](https://github.com/deksden/dd-memorybank/pull/2); flow-pack in
[PR 5](https://github.com/deksden-com/dd-tasks/pull/5). Canon and flow-pack
branches retain the previously selected, unmerged input baselines; those
dependencies are disclosed in their PR descriptions. No unrelated product
changes or direct main pushes were made. PR integration, npm publication and
live R9 acceptance remain separate from this commit/push implementation task.

The packaging helper's tuple labels `branch: main`; actual source branch is
`fix/cp198-operational-contract`, not merged main. Commit/tree/build/artifact
hashes above identify the candidate; branch labels are not qualification proof.
