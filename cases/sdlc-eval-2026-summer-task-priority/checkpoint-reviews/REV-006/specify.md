# REV-006 / SPECIFY entry acceptance

- The checkpoint is an unstarted `RUN-001-task-priority` in the dedicated
  `REV-006` runtime: no stage-owned Work, HITL pause or Subject binding exists.
- The project is the exact `eval-flow-vnext-plan-review-beta.62`
  materialization and its isolated runtime resolves engine `0.8.0-beta.61`.
- The moving Subject (`01a015d4-fffc-7a32-a571-1c51d02b3494`) completed only
  ordinary project priming. Its untouched same-directory fork
  (`01a015d6-5318-78b1-8e58-ea31688eac43`) is the frozen SPECIFY entry.
- The next ordinary user message begins the task-priority request and must
  finish SPECIFY before any successor stage starts.
