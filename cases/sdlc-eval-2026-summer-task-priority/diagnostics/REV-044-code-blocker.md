---
revision: 'REV-044'
status: 'BLOCKED'
stage: 'code'
run_id: 'RUN-001-task-priority'
---

# CODE blocker — REV-044

The candidate canonical chain reached CODE. P1 changed its permitted
persistence/API files, but its mandatory Work checks did not pass. The RUN is
paused at `resolve_blocker_then_unblock_same_stage`; P2, P3 and CODE-REVIEW
were not started.

## Recorded evidence

- `pnpm db:migrate -- --target local --run-id RUN-001-task-priority` exited 1
  with `DATABASE_OPERATION_FAILED` after the migration ledger initialization.
- `pnpm db:check -- --target local --run-id RUN-001-task-priority` exited 1
  with `schemaExists: true` and `migrationsMatch: false`.
- `pnpm quality` executed Biome successfully but failed on one API lint rule
  and one test formatting issue.
- The CODE bootstrap completed, but emitted `Ignored build scripts: esbuild`.

The worker classified these as an external binary-dependency mismatch. The
saved check output does not substantiate that diagnosis: it shows a database
migration-state failure and fixable source-quality failures instead. Treat the
classification itself as an evaluation defect. A later repair must inspect the
database migration target and make the source conform, then unblock and resume
the same CODE stage; it must not restart the whole chain or mark this partial
revision canonical.

The five REV-044 entry checkpoints are preserved as candidate evidence only.
The case's active canonical pointers remain on the prior complete REV-040
chain until all six stages of a replacement chain finish and are accepted.
