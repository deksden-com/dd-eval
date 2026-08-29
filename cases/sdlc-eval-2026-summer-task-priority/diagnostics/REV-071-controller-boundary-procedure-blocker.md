# REV-071 · Controller-boundary procedure blocker

## Observation

The Subject received only the ordinary user trigger.  It followed the normal
flow-pack rule for a new task and ran `stage start --bootstrap`, thereby
creating `RUN-002-task-priority`.  The prepared and checkpointed
`RUN-001-task-priority` stayed unstarted.  REV-071 cannot be used as a
canonical chain because its intended SPECIFY-entry snapshot does not precede
the executed stage.

## Root cause

This was a Controller procedure error, not a new model or CLI defect.
`runbooks/execute-eval.md` already requires the normal trigger **plus** a
Controller boundary containing the exact prepared
`DD_FLOW_HOME=... dd-flow stage start <RUN> --stage specify ...` command.
That command is the adapter-supplied runtime fact anticipated by `prime.md`.
The Controller sent the bare trigger instead.

## Correction

For REV-072 and every later canonical stage, render and deliver the existing
`subjectContinuation(...)` packet.  It contains the exact run, project root,
raw intake and stop boundary.  Do not modify the flow pack merely to hide a
Controller contract that already exists.
