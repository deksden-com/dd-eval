# Fork-021: accepted Work result authority

## Incident

EVAL-20260916140947-13e08ec8 completed five CODE_REVIEW workers and its repair.
CODE_REVIEW was accepted at 2026-09-16T14:48:32Z. The checkpoint before MERGE
failed with `work_result_artifact_drift` for imported WRK-009; EVAL ended
`recovery_blocked`, not successfully completed.

Restore had rewritten WRK-009/result.json at 14:09:51Z, before the agent ran.
The source snapshot and SQLite result hash was
`0acebceb18d8da5945f062934912cbefcfc3fd736821b6d3ac089979aa593994`.
The fork file hash was
`68e45a62ffa37a86fafcf77cda011de6d1289920c6661d05648b1b2de62b03c3`.
Parsed JSON was identical; 3843 characters became 4291 solely by serialization.

## Correction

- Accepted child Work results already feed stage aggregation from SQLite.
  Remove the duplicate file-vs-database byte equality checkpoint gate, including
  the second comparison after snapshot copying. Do not replace it with another
  semantic comparison gate.
- Remove recursive JSON/JSONL rewriting during stage-boundary restore.
  Relocate operational database paths; preserve historical artifact bytes.
- Rewrite only the operational `02-protocolize/workspace-route.json` receipt;
  its frozen worktree path must follow the relocated checkout. Refresh mutable
  `harnesses.json` in the new EVAL home before dispatch so adapters never point
  at the source EVAL. Other packets, results, receipts and journals stay byte
  identical.
- Retain submission validation and crash-safe result publication. Those protect
  acceptance and concurrent writes, not historical file formatting.
- Snapshot/restore/capture regression covers original, reformatted, changed and
  missing representations, relocated operational paths and partial JSONL tails.

## Prepared next E2E (not started)

Source: `EVAL-20260916060330-late-allocation-fix-fork-017`.
Checkpoint: `code-ac58c02c5d5e4c0a3f6527003d7578f8c63cc988bb7583cdfced40e3324dc490`.
Entry: CODE_REVIEW. Fork-021 has no published boundary before MERGE; do not
manufacture one by editing its controller or rewriting the failed RUN.

Target:
`/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260916-result-authority-fork-022`.
Request: `fork-022-result-authority`.
Engine: local `0.9.0-beta.74`, artifact
`2569a40dfa62b96c11eb36ee744831bb4f943c645d4ff2d54dd78907ebc57862`.
Use the exact `next_command` in the target's `fork.json` when authorized to start.

The historical checkpoint lacks `.env.example`; the new snapshot filter cannot
recreate it. **Do not delegate this to CODE_REVIEW:** repair there affects only
the feature checkout, while MERGE consumes a separate integration checkout.
Follow the explicit new-fork repair in
[Fork-023 template recovery](cp-108-fork-023-template-recovery.md). Never edit the
source RUN or checkpoint, or automatically restore all missing tracked files.

Verification: 26 snapshot tests and 4 publication tests passed; typecheck,
build and changed-file ESLint passed. No full release gate or live E2E was run
for preparation. When launched, confirm CODE_REVIEW → checkpoint → MERGE and
report EVAL terminal state separately from worker-attempt completion.
