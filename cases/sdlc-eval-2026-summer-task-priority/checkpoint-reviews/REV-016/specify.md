# REV-016 · SPECIFY entry

Accepted. The snapshot names the beta.73 project input and beta.72 engine,
contains one unstarted `RUN-001-task-priority`, has no stage attempts, no
subject binding, no pending HITL and no active child Work. The frozen Subject
fork contains only the completed project priming conversation; the task itself
has not yet been sent.

The run is mechanically allocated (`status: running`) solely so the first
agent action can be `stage start specify`; `next_action: start_specify` is the
authoritative entry condition.
