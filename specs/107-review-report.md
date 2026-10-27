# 107 — Implementation review and integration

Status: review fixes and scoped verification complete. GitHub PR merge records
are the integration receipts; this is not release/provider acceptance.

Reviewed the plan against engine `f685af18`, EVAL `cde8747f` and canon `b601a39`,
with independent admission, controller/resources and EVAL reviews. The parent
checked the findings against the actual callers before authorizing corrections.
No product changes, model requests, new EVAL, full release gate or GitHub CI.

## Substantial defects corrected

| Finding | Correction and regression |
| --- | --- |
| Native claims could start checks after a direct claim reserved the same WorkSession. | One SQL-only reservation predicate is called by both native and direct claims, including Work/Stage aliases of the same coordinator. |
| Assigned admission observed process birth using `ps` under the SQLite writer; the newly transactional legacy coordinator binding also read files/resolved profiles under that writer. | Prepare observations before the writer; recheck the prepared RUN/WorkSession and assignment inside the short commit. |
| Same-generation controller replacement could occur between preparation and Stage pause/finish/attachment commit. | Revalidate the assigned owner in shared Stage settlement, generic attachment/completion and pause writers, not only before preparation. |
| A failed native helper without a Work link could still revoke an already accepted Stage. | The Stage acceptance remains authoritative; retain a technical cleanup note while keeping the normal writer-retirement fences. |
| A child disappearing from a post-cancel inspection could be mistaken for terminal proof. | Require explicit terminal child observation or the existing qualified root proof; absent/unknown remains a scoped technical dependency. |
| A dead bridge without a retained process-group boundary was accepted as proof of no descendants. | Missing or malformed owned PGID remains unproven; a dead leader is insufficient. Detached providers remain independently checked. |
| EVAL still threw `stage_boundary_incomplete` after the engine accepted its terminal Stage but capture failed. | Validate the existing exact controller/lifecycle receipts independently. Missing/corrupt snapshots leave accepted execution intact and assessment unavailable; no fabricated candidate, Judge call or case-acceptance PASS. |
| Optional statistics-file publication could fail accepted execution; required HITL checks depended on capture callbacks. | Statistics publication is a technical note. Check required interactions across completed selected stages independently of snapshots. Unreadable mandatory interaction evidence blocks assessment, not the accepted execution. |

The completion receipt checks actual RUN/project/index/Stage and the original
launch plus accepted recovery lineage. An entry label, arbitrary UUID, foreign
RUN, running Stage or empty physical inventory does not grant success.

## Verification

- Parent engine rerun: 49/49 PASS in the four affected source suites, including
  admission/Stage 25, result/child authority 13, technical resume 4 and physical
  binding 7. SQL preparation, owner-change and missing/invalid PGID included.
- Parent EVAL affected group: 68/68 PASS; five explicit terminal-capture/HITL/
  statistics fault cases included, not additional unique tests.
- Installed synthetic ZCode late-helper case: 1/1 PASS through seven Stages to
  completed MERGE; eleven unrelated cases skipped. Its normal cleanup passed.
- Final affected candidate build, parent TypeScript and changed-path ESLint
  (14 files) PASS. JS syntax and diff checks PASS. No full gate.
- Canon accepted-result contract: parent rerun 1/1 PASS.
- Prior implementation receipts remain in `107-implementation-report.md`.

## Integration and cleanup boundaries

Integrate through reviewed PRs into remote `main`; do not rewrite divergent local
main or unrelated E5 work. Preserve runtime campaign checkouts and any branch
with unintegrated commits or retained EVAL references. In particular CP253
manifests still reference `dd-eval-cp253-readiness`; it is not disposable merely
because its patch was later squash-integrated. Remove the merged plan107 source
branches/worktrees only after remote merge/head/tree readback and clean-state
checks. No cleanup may stop another task or working EVAL.

Canon integrated by [PR 11](https://github.com/deksden/dd-memorybank/pull/11),
merge `4a6c2d2`. Engine integrated by
[PR 135](https://github.com/deksden-com/dd-flow-cli/pull/135), merge `025a576f`;
its merged tree matches reviewed correction `0a2e3176`.
EVAL includes the initial implementation plus this review, not just documentation.

Cleanup deliberately excludes divergent local main/E5 histories and frozen
campaign trees. CP253/CP255 release and campaign branches contain retained pins
or unintegrated commits; patch equivalence alone does not prove their worktrees
are unused. No forced reset or release tag mutation is authorized or needed.
