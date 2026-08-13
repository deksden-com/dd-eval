# mb-3.2.0-beta.4

Этот кандидат повторяет только initial SPECIFY `EVAL-001-task-priority` после
неуспешного beta.3 launch gate. Product baseline и semantic flow pack не
меняются; меняется bootstrap binding в engine.

| Component | Exact candidate |
| --- | --- |
| `dd-tasks` | flow pack `3.2.0-beta.4`, tag `eval-mb-3.2.0-beta.4` |
| `dd-flow-cli` | engine `0.7.1-beta.5`, tag `eval-engine-0.7.1-beta.5` |

## Included specification

| Spec | Owner | Intent |
| --- | --- | --- |
| [001](specs/001-bootstrap-hook-registration.md) | `dd-flow-cli` | Let the first bootstrap hook register its project before binding the session. |

## Acceptance

1. The first bootstrap command receives `--hook-event-id` without any earlier
   project registration command from the worker.
2. `--require-session-binding` succeeds with the actual Codex session.
3. The run proceeds only to structured SPECIFY `waiting_for_user`; no PLAN or
   CODE starts.

Use [controller-initial.md](controller-initial.md); beta.3 remains immutable
failed launch evidence.
