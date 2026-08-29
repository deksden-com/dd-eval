---
revision: 'REV-065'
status: 'BLOCKED'
stage: 'code'
run_id: 'RUN-001-task-priority'
harness: 'zcode-acp'
model: 'GLM-5.3-Flash'
---

# CODE blocker — child cancellation detached lifecycle forwarding

The ZCode candidate completed SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW.
CODE completed and accepted P1 and P2. P3 could not be bound after the
controller cancelled a troublesome child through the tree-wide `session
cancel` operation.

## Evidence

- Root provider session: `sess_322fa57f-d744-4d1c-bccd-26475e7a44e1`.
- The first P3 child (`sess_subagent_agent_a58ef0c5-a462-4c3a-9b55-2302c59b2a71`)
  had a claimed `PreToolUse` hook event and a bound Work session.
- Tree-wide cancellation stopped both that child and the root ACP turn. The
  native root later spawned P3 attempt `ATT-003`
  (`sess_subagent_agent_41f9ae82-6e37-47b5-bd61-a6deb2dc327c`), but its
  lifecycle events were no longer forwarded to `dd-flow`.
- P3 therefore received `trusted_session_binding_required` from `work start`
  and repeatedly retried the command. It made no product edits.
- The immutable evidence is the ZCode journal at
  `REV-065/harnesses/zcode-acp/canonical/events-chain-003.jsonl`, native model
  I/O under `~/.zcode/cli/rollout/`, and the flow runtime SQLite database.

## Root cause and correction

`dd-zcode session cancel` is deliberately tree-wide: it cancels the selected
children **and** the root session. That is appropriate for final shutdown, but
not for recovering one failed worker while its orchestrator must continue to
receive child hook events.

The harness now provides `dd-zcode session cancel-child --child-session-id …`.
It verifies membership in the live child topology, calls
`session/cancelBackgroundTask` for that child only, waits until it disappears
from `running`, and leaves the parent turn/listener alive. Its regression test
asserts that it never sends `session/cancel`.

This revision remains diagnostic evidence only. A fresh canonical chain is
required for the complete ZCode E2E run; it must use child-only cancellation
for worker recovery and reserve tree cancellation for a terminal shutdown.
