# 107 — Implementation and scoped verification

Status: implementation complete; affected-zone verification passed. Not release/EVAL acceptance.

Subsequent implementation review and integration: [107-review-report.md](107-review-report.md).

## Delivery scope

- Engine branch: `fix/plan107-result-authority`, base `fe486595`, implementation
  commit `f685af18`.
- EVAL branch: `docs/plan107-result-authority`, base `da67ce77`.
- Canon branch: `feature/plan107-result-contract`, commit `b601a39`.
- No runtime pins, installed hooks, historical EVAL artifacts or active processes
  are changed. No paid model calls, EVAL, release/full gate or GitHub CI.
- Existing divergent primary main checkouts and frozen campaign trees remain
  untouched. Work takes place in dedicated plan107 checkouts.
- Delivery is commit/push on these task branches, as requested. No merge into
  shared main or deletion of unmerged source worktrees is performed by this task.

## Result authority

The accepted Work/Stage result and resource retirement are separate. Managed
commands use retained assignment authority, not a new live tool event. Native
launch/fresh reviewer evidence remains required; a typed assigned binding is not
a fabricated Hook. Unknown effects and conflicting writers still require scoped
reconciliation; unrelated accepted Work is not repeated.

Implementation and final scoped verification are recorded below. Integration into
main, package publication and provider acceptance are separate operations.

## Plan coverage

| Plan items | Implementation owner |
| --- | --- |
| D1–D3, D15 | `assigned-lifecycle.ts`, lifecycle invocation admission/replay, typed CLI/session identity, Work/Stage settlement and recovery lineage. Fresh native launch evidence remains mandatory. |
| D4, D8, D13 | Exact persisted controller dispatch obligations, Work-aware child observation/fanout, shared physical writer absence and scoped technical control. |
| D5–D7 | Controller retirement/finalization uses technical notes; accepted terminal result is independent of shutdown and registry ACK. |
| D9–D10 | Judge verdict verification is separate from cleanup; retained HITL reuses accepted content with its original bindings. |
| D11 | Baseline execution-tree proof is separate from registry bookkeeping; legacy unknown remains unproven. |
| D12 | Root status/report separates execution, assessment and cleanup; missing mandatory evidence is unavailable, not fabricated PASS. |
| D14 | Qualification and SPECIFY comparison retain valid content/measurements independently of cleanup. |

Technical notes use existing scoped audit/event journals, not a new database or
service. They are excluded from semantic history/candidate hashes. Cleanup
observations include Interaction Judge and no-verdict native resources, not only
Subject processes.

## Shared prompts and source maintenance

The canonical lifecycle guards, worker primer and runtime contract now distinguish
accepted results from native cards/shutdown. The shared engine instruction tells
all harnesses to stop writing after acceptance and not prompt a model for cleanup.
Curated engine copies retain their project-specific E4 guidance and history;
only the selected semantic delta and its manifest file hashes change. Original
installation provenance and `installed_at` remain intact. This is source
maintenance, not installation or migration of any retained RUN.

Permissions preflight (`dd-flow memory permissions preflight`, custom/write)
passed in the engine and canon checkouts, with zero warnings. The selected
`mb-lint` invocation discovered zero files because the existing canon policy
excludes `dd-flow/**`; it is not counted as substantive lint coverage. Separate
YAML metadata and selected canonical-contract assertions passed for all three
changed files. No active DEF was closed by this work: the existing protocol-file
lookup and delegated-capacity follow-ups are outside this implementation scope.

## Scoped verification

- Shared delegation instructions: 21 tests passed.
- Selected canonical accepted-result contract: 1 test passed.
- Selected verification-owner classification: 1 test passed.
- Three changed curated manifest hashes verified against their actual files.
- Isolated locked dependencies installed in the new engine worktree; stale
  primary-checkout dependency symlinks were not repaired or modified.
- Parent rerun: Judge cleanup, retained HITL, runner health, SPECIFY comparison
  and technical notes — 80/80 passed; baseline admission, managed client and
  qualification resource ownership — 48/48 passed.
- Parent rerun: controller result authority and existing controller state —
  18/18 passed. Shared delegation instructions rerun — 21/21 passed.
- Parent rerun: assigned lifecycle — 16/16 passed, including the public CLI
  start→finish path with no later tool event, mixed native/direct reservation,
  exact lost-ACK recovery, Stage pause/resume, stale owners and packet lineage.
- TypeScript `--noEmit` and the scoped candidate build passed. Changed-path
  ESLint found no errors (the shared runtime `.mjs` path is ignored by the
  existing ESLint config; its runnable prompt tests provide coverage).
- Parent rerun after the final resource changes: technical notes — 11/11 passed;
  physical daemon/provider binding and technical boundary continuation — 7/7
  passed. These overlap earlier suites and are not additive unique-test totals.
- Parent selected installed-controller regressions: terminal MERGE capture,
  shutdown and unclean-native cases — 3/3 passed; the other eight full-cycle
  cases were not run. Each fixture installs and pins its own candidate snapshot.
- Parent report/evidence-schema/completion-scope regression group — 25/25 passed.
- Delegated targeted checks, reviewed by the parent: existing lifecycle 14/14,
  Stage ownership 31/31, descriptor contracts 5/5, Memory handlers 6/6; direct
  committed-response replay and public CLI post-commit publication failure each
  1/1; unclean Session replacement 2/2 and assessment-output failure 1/1.
- Final source candidate build, TypeScript and changed-path lint passed. Syntax
  checks and `git diff --check` passed in both implementation repositories.

## Additional implementation-review findings

- Direct settlement must reserve the WorkSession against native/legacy executing
  peers too, not only against peers carrying the new admission column.
- Stage entry, auxiliary permits and recovery successors need the same current
  owner/attempt/packet lineage; a matching command fingerprint is insufficient.
- Optional audit publication after the semantic commit must not invalidate that
  commit or cause checks to execute again after a lost outer acknowledgement.
- A dead bridge or a terminal registry row does not prove its provider/child
  process group is gone. Resource observations use exact owned physical trees;
  missing proof remains pending. This affects cleanup, not the accepted result.
- Capture and technical-control continuation must not reintroduce an unconditional
  clean-native-shutdown gate after an accepted Stage boundary. Unknown productive
  effects remain a reconciliation dependency, not permission to replay them.
- Late exact resource retirement resolves the root cleanup appendix without
  rewriting the engine's historical note. A stale source observation cannot
  reopen it; a different incarnation, foreign RUN or stale control cannot supply
  that resolution merely because a physical inventory is empty.

Technical-boundary resume deliberately does not clone provider stores or pretend
to resume an unfinished conversation. The verified completed Stage is continued
with a new Session through the normal controller path. Unfinished assignments,
active scope control and unknown/live writers retain their existing explicit
reconciliation requirement. Full native-provider qualification is not claimed.

Interim failures were retained during development: type checks caught incomplete
cross-file assignment types; an installed-fixture run first lacked a built CLI,
and a later interim build exposed an inactive Stage assignment. Neither attempt
is counted as a passing check or as provider acceptance. The final scoped checks
below supersede them only for the corrected source candidate.

The capture fixture originally waited for a successor context it intentionally
had not submitted. The corrected regression observes the actual accepted Stage
and `waiting_for_context` boundary; its clean rerun passed. An intervening manually
unblocked test-world is not counted as clean capture acceptance. Post-commit
fault-injection setup failures were replaced by a real missing derivative output
directory; that public CLI regression passed without inventing the missing file.
Owned interrupted test-world processes were drained using their exact registry
lease/birth identities. Failed diagnostic records were retained; active EVALs
were not touched.

These checks qualify the changed implementation paths only, not every native
provider or a released engine. No full release gate, live EVAL, model request,
GitHub CI or installed-hook mutation was performed.
