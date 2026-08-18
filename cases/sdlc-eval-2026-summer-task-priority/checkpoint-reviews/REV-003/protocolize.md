# REV-003 / PROTOCOLIZE entry acceptance

- `RUN-001-task-priority` is the sole RUN in the dedicated runtime; SPECIFY is `done`, and PROTOCOLIZE is unstarted.
- The accepted SPECIFY result covers the user-visible priority field, labels, default, existing authorization and acceptance paths; its scope excludes ordering changes and unrelated task lifecycle additions.
- Moving Subject `01a01560-93a0-7402-8934-b7687569ac2b` is idle. Frozen child `01a0156c-0f33-7e61-81c7-1784bea13cbd` was forked at this exact boundary and received no follow-up.
- The snapshot is external to the captured project/runtime and restores a single ready protocolize entry.

The initial SPECIFY launch used a real observed PreToolUse event, but the current Desktop adapter did not apply its returned command rewrite. The worker manually reused that observed event key; session identity is present, but this adapter defect is recorded as an infrastructure finding before scored acceptance.
