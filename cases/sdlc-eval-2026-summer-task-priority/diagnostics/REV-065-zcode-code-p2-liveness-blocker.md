# REV-065 · ZCode CODE P2 liveness blocker

## Observed run

- Harness: `zcode-acp`; provider `builtin:zai-coding-plan`; model `GLM-5.3-Flash`, reasoning `high`.
- Recovery runtime: `.../harnesses/zcode-acp/retry-code-002`.
- Root provider session: `sess_382544e5-5678-425b-ae6d-ca54ded12c3e`.
- CODE Work: `WRK-005-prt-007-task-priority-p2`.
- Child session: `sess_subagent_agent_0b04ecc9-c55f-47d9-b88d-603bf299e2d5`.

P2 executed its required standalone `dd-flow work start` and became `running`.
It then completed ordinary source reads, emitted no error and no further child event for more than
four minutes. The ACP root inspection reported a running `Agent` tool, but the adapter cannot
inspect the child session independently. A targeted `dd-zcode session cancel-child` cancelled only
that child and preserved the root session. The root became idle, while P2 remained `running` in the
dd-flow registry.

## Root cause

The ZCode harness represents a child as a provider task, but its cancellation result is not
projected into dd-flow's `works` / `work_sessions` state. `work start` is intentionally atomic: it
claims the Work and binds it to that session. After the provider task is cancelled, no public
dd-flow command can safely return that claimed Work to `created`, rebind it to a replacement
session, or finish it as failed from the harness receipt. The stage coordinator therefore has no
valid next transition.

This is a harness/engine integration blocker, not a product failure and not an indication that P2
implemented invalid code. P1 was accepted before the blocker; no P2 work result was accepted.

## Required correction

1. Add one explicit, auditable recovery transition for a cancelled worker: it must mark its
   `work_session` terminal from an authenticated harness cancellation receipt and either requeue
   the still-unfinished Work or terminally fail it with the receipt. It must never silently mutate
   a Work or allow a duplicate active worker.
2. Include a requeue command in the returned cancellation receipt when requeue is safe. A new
   worker then starts via its ordinary `work start` command and obtains a fresh binding.
3. Until that transition exists, CODE's prompt must prefer the coordinator session for a sequential
   graph with exactly one ready Work. Fresh child sessions remain the default for genuinely
   independent ready Works that can run concurrently.
4. Preserve the ZCode diagnostic journal and the cancelled-child receipt as evaluation evidence.

