# REV-004 / SPECIFY entry acceptance

- The checkpoint is an unstarted `RUN-001-task-priority` in the dedicated
  `REV-004` runtime; no stage-owned Work, HITL pause or Subject binding exists.
- The project is the exact `eval-flow-vnext-plan-review-beta.60`
  materialization and the isolated runtime resolves engine `0.8.0-beta.60`.
- The moving Subject (`01a015af-575e-7f10-8d12-2112f942af22`) completed only
  normal project priming. Its untouched same-directory fork
  (`01a015b1-1a7b-7c82-a92e-a447a06455dc`) is the frozen SPECIFY entry.
- The next ordinary user message begins the task-priority request and must
  finish SPECIFY before any successor stage starts.
