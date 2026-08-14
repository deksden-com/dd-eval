# vnext-specify-beta.4

This iteration moves the initial vNext lifecycle call into the worker session.

| Component | Exact candidate |
| --- | --- |
| `dd-tasks` | flow pack `3.2.0-vnext-specify-beta.4`, tag `eval-mb-3.2.0-vnext-specify-beta.4` |
| `dd-flow-cli` | engine/router `0.8.0-beta.4`, tag `eval-engine-0.8.0-beta.4` |

## Change

The controller previously called `flow launch`, so the PreToolUse hook saw the
controller session rather than the worker session. The fresh worker now makes
`flow launch` as its first action. The hook records that real session, injects
an opaque hook event id, and launch atomically binds it to the root Work and
Agent Turn. No `--session-id` exists in the agent command surface.

The global router must use this beta version too: `codex hook handle` is
router-native and has to recognize the new lifecycle command before it routes
the launch to its project-selected engine.

## Acceptance

1. A launch without a trusted hook event fails before it creates a RUN.
2. The hook rewrites only vNext launch with an opaque event id; it never emits
   a session id.
3. A successful launch persists the true worker session in SQLite for both the
   Agent Turn and flow-session record, but does not return it to the agent.
4. The returned SPECIFY prompt remains free of lifecycle and eval instructions.
