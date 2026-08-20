# Canonical PLAN-REVIEW entry acceptance — REV-023

Accepted on 2026-08-20.

The captured entry is the state immediately after a successful `PLAN` finish and
before any `PLAN-REVIEW` start. It is suitable as the canonical entry because:

- `RUN-001-task-priority` is `running` with `next_action: start_plan_review`;
- all predecessor stages (`SPECIFY`, `PROTOCOLIZE`, `PLAN`) are `done` in the
  captured runtime;
- the feature worktree exists on `feature/run-run-001-task-priority` and is the
  only writable implementation workspace;
- the protocol plan covers AC-001 through AC-008, and records two ordered Code
  Works for the later CODE stage;
- the frozen Session is a no-work fork of the prepared PLAN-REVIEW Subject
  session. No stage prompt has been delivered to it and no evaluation artifact
  can have contaminated its context.

The snapshot and Session pair are accepted as the common stage-entry baseline
for every focused `PLAN-REVIEW` evaluation and for the E2E contour.
