# REV-005 / SPECIFY entry acceptance

- The checkpoint is an unstarted `RUN-001-task-priority` in the dedicated
  `REV-005` runtime; no stage-owned Work, HITL pause or Subject binding exists.
- The project is the exact `eval-flow-vnext-plan-review-beta.61`
  materialization; its isolated runtime resolves engine `0.8.0-beta.60`.
- The moving Subject (`01a015b7-fe27-7401-8967-0dafbc85e170`) completed only
  normal project priming. Its untouched same-directory fork
  (`01a015b9-4e58-76f1-a3cf-b8c9a2a41eb7`) is the frozen SPECIFY entry.
- The next ordinary user message begins the task-priority request and must
  finish SPECIFY before any successor stage starts.
