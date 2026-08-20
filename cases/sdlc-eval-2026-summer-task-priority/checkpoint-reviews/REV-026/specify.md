# REV-026 SPECIFY entry acceptance

Accepted as the canonical SPECIFY entry.

- Materialized project is clean on `main` at the recorded source commit.
- Dedicated runtime resolves only engine `0.8.0-beta.80`.
- `RUN-001-task-priority` is allocated with no stage, HITL pause, Subject
  binding, or active Work.
- The frozen entry Subject is an untouched fork of the primed, discussed
  canonical Subject.
- The source snapshot was captured read-only: a failed capture at a foreign
  worktree cannot register a second project in this runtime.
