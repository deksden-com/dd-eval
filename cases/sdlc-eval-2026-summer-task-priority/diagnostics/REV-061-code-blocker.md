---
revision: 'REV-061'
status: 'BLOCKED'
stage: 'code'
run_id: 'RUN-001-task-priority'
---

# CODE blocker — REV-061

The canonical chain reached CODE and all three planned works were accepted:
P1 (persistence/API), P2 (web) and P3 (durable documentation). Their scoped
receipts report no blockers. `code-verification.json` also validates after the
Subject adapted it to the installed schema. The final `stage finish` cannot
pass, because the engine now considers its CLI-derived `code-work-batch.json`
stale after the legitimate P3 documentation changes.

## Evidence

- `stage finish` first exposed a prompt/validator mismatch: the CODE prompt
  described `code-verification@1`, while the installed validator accepts the
  bundled `code-verification@2` form. The Subject preserved the verdict and
  evidence, changing only the required envelope.
- The subsequent finish receipt reports `stale_code_work_batch`: its current
  batch fingerprint is recomputed from files P3 was explicitly required to
  change, but the batch itself is CLI-derived and must not be manually edited.
- The RUN is paused with `next_action=resolve_blocker_then_unblock_same_stage`;
  CODE-REVIEW has not started.
- Every generated worker prompt used `dd-flow work start WRK-005`, but that
  short id is ambiguous among P1, P2 and P3. Each worker recovered by using
  its full assigned work id. This is a separate command-generation defect,
  not a candidate implementation defect.

## Required repair

Make the engine use a stable batch input fingerprint that excludes legitimate
post-plan durable-documentation edits, or deterministically regenerate the
batch through the lifecycle before its freshness gate. Align the CODE prompt
with the validator schema and emit a unique, executable work-start identifier.
Then create a new matched engine/flow pair and a fresh canonical revision;
do not manually alter the saved batch or resume this candidate as if the
engine defect had not occurred.
