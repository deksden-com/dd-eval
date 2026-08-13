# mb-3.2.0-beta.3

Третий beta bundle повторяет только initial SPECIFY для `EVAL-001-task-priority`.
Он заменяет beta.2 как кандидат, но не переписывает его RUN или теги.

| Component | Branch | Exact candidate |
| --- | --- | --- |
| `dd-tasks` | `beta/mb-3.2` | flow pack `3.2.0-beta.3` |
| `dd-flow-cli` | `beta/engine-0.7` | engine `0.7.1-beta.4` |
| `dd-eval` | `main` | this immutable bundle |

## Included specifications

| Spec | Owner | Intent |
| --- | --- | --- |
| [001](specs/001-bound-schema-and-semantic-outcome.md) | `dd-flow-cli`, `dd-tasks` | A RUN always validates semantic input against its bound engine schema. |
| [002](specs/002-finish-receipts-and-conflict-boundary.md) | `dd-flow-cli`, `dd-tasks` | Preserve rejected input and stop rather than changing its meaning. |
| [003](specs/003-session-binding-and-bounded-packet.md) | `dd-flow-cli`, `dd-tasks`, `dd-eval` | Fail closed for missing eval binding and avoid duplicate context reads. |

## Acceptance for this candidate

1. Bootstrap uses engine `0.7.1-beta.4` and rejects a missing trusted hook
   binding before a worker can begin semantic work.
2. A genuine SPECIFY gap finishes `waiting_for_user` with structured questions;
   no fallback to a project-local stale schema occurs.
3. Each finish attempt has one immutable receipt and a SQLite audit event.
4. The worker receives one bounded packet, does not repeat its embedded reads,
   and stops on a contract conflict instead of repairing lifecycle state.

The controller is [controller-initial.md](controller-initial.md). The broader
procedure stays in [the beta contour runbook](../../runbooks/beta-contour.md).
