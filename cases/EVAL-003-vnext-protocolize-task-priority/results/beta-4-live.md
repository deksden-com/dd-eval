# EVAL-003 — beta.4 live result

Model: `gpt-5.6-luna`, reasoning `max`.

Both isolated runs reached `specified → protocolized` and created one
task-priority PRT and one feature under `EP-001-task-management`.

- Same-session: session `01a00568-8f3e-7341-9fcc-b56b828ce140`; repository
  `dd-eval-runs/EVAL-003-vnext-protocolize-task-priority/luna-max-beta4-same-session`;
  SPECIFY 224,991 ms, PROTOCOLIZE 74,608 ms.
- New-session: SPECIFY session `01a0056e-6c68-70e1-8574-59223ad64b22`;
  PROTOCOLIZE session `01a00576-48ea-77b1-a904-3c490cde9008`; repository
  `dd-eval-runs/EVAL-003-vnext-protocolize-task-priority/luna-max-beta4-new-session`;
  SPECIFY 296,299 ms, PROTOCOLIZE 179,611 ms.

Neither run entered PLAN, CODE, worktree, review or merge.

The runs exposed two beta defects: catalog links supplied `epic/index.md` while
the CLI expected an epic directory, and the RUN projection retained
`vnext_specify` guidance after PROTOCOLIZE. Both were fixed in beta.5; the
beta.4 artifacts remain unchanged as evidence.
