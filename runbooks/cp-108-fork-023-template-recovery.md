# Fork-023: legacy snapshot template omission

CODE_REVIEW completed and the pre-MERGE boundary was saved. MERGE then failed
with `merge_target_dirty`: integration checkout had ` D .env.example`.
The old snapshot filter omitted `.env.*` including this tracked public template.
Restore checks out Git then replaces the working tree with the filtered payload.
Feature review repaired only the feature checkout; integration remained dirty.

Current snapshot capture includes `.env.example` in both working files and index.
Regression tests cover root/nested templates in both checkouts: clean, separate
staged/unstaged modifications, unstaged deletion and staged deletion. Private
`.env.local` remains excluded. Never infer from absence alone that a file should
be resurrected. Legacy index-patch verification retains its historical filter.

For affected historical snapshots, prepare a new fork without starting it.
Inspect both checkouts. Only after establishing that a missing public template
was lost by the old filter, restore that exact path from its checkout's frozen
Git commit in the NEW fork and retain a repair receipt outside the project.
Do not restore private environments, reset the checkout, edit accepted artifacts,
or change the source snapshot. Legitimate edits/deletions must remain intact.
Check integration Git status before launch; do not run product quality/browser
gates during this preparation. The runner excludes its own `.dd-eval/` task
context during fork preparation using the same helper as task materialization.

## Prepared Fork-024 (not launched)

- Root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260916-merge-template-fork-024`
- EVAL: `EVAL-20260916190125-0d78f2a9`
- Source: `EVAL-20260916-result-authority-fork-023`
- Boundary: `code-review-869797473ca0bc79c4c4c8fa0ea5b76d2ed46d4d85ab450c067d476949406b30`
- Entry: MERGE; prior CODE_REVIEW and its feature commit are retained.
- Engine: `0.9.0-beta.74`, checksum `3b44a0c0287b351d6e01272f496dbd3b23551564ca6ebec3f02fc3d3286e9288`.
- Repaired integration `.env.example` from commit
  `124b979ad687b175f60893134613a5b0b88e4fe8`, blob
  `d4ee660b3064587303b317ef34a7a9b1ce0601f8`.
- Audit: `legacy-template-repair.json` in the new EVAL root.

Launch with the exact `next_command` in Fork-024's `fork.json` from this repo,
with `DD_FLOW_HOME=/Users/deksden/.dd-flow` and the same `DD_FLOW_CONFIG_HOME`.
It reuses the prepared fork; do not restore it again or rerun CODE_REVIEW.
New snapshot-filter behavior is already in this engine; this preparation adds
coverage and repairs the inherited historical omission, so no engine rebuild
or release is needed. Monitor MERGE and report the final EVAL outcome.
