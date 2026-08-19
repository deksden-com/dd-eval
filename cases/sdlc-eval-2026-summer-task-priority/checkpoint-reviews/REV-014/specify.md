# REV-014 — SPECIFY entry acceptance

Accepted as the canonical entry for SPECIFY.

- The dedicated canonical runtime contains exactly one prepared RUN,
  `RUN-001-task-priority`; no stage or child Work has started.
- The stable project checkout is clean and detached at the declared beta.69
  source commit. This deliberately exercises the route that must materialize a
  feature worktree during PROTOCOLIZE.
- The moving Subject completed only ordinary project priming. Its frozen child
  is idle and contains no eval, Judge, rubric, or user-task material.
- The captured snapshot uses `dd-flow/eval-run-snapshot@2` and records the
  stable project workspace expected at the SPECIFY entry boundary.

The next canonical action is a normal `stage start … --stage specify` on the
moving Subject only. The frozen Session must never receive a message.
