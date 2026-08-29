# REV-066 — ZCode canonical chain blocked by wrong integration checkout

## Observation

`RUN-001-task-priority` completed `SPECIFY` after a valid ZCode bootstrap,
trusted lifecycle binding and one normal HITL pause/resume. Its first
`PROTOCOLIZE` start was rejected deterministically:

```text
workspace_route_invalid
Configured feature worktree requires a clean, known integration checkout
expected_integration_branch: main
actual.branch: beta/zcode-code-recovery
```

Evidence: `~/.dd-eval/canonical/sdlc-eval-2026-summer-task-priority/REV-066/`
`harnesses/zcode-acp/canonical/zcode-chain-003/events.jsonl`, tool call
`call_4f595572e1f24174ab8fc092`.

## Root cause

The canonical project clone was created from the flow-pair branch
`beta/zcode-code-recovery`. The project's checked-in workspace policy remains
correctly configured for feature worktrees rooted in its integration branch
`main`. These identities are different: a beta flow pair describes the
Memory-Bank/engine under test; it must not silently replace the product
integration checkout.

The agent correctly treated the returned precondition as a blocker. Switching
that checkout to `main` mid-RUN would invalidate the recorded project snapshot
and can remove the beta flow-pack being evaluated, so it is not recovery.

## Required correction

Canonical setup must materialize two explicit identities before the first
bootstrap command:

1. product workspace: clean checkout of the project's configured integration
   branch (`main` for this case);
2. evaluated flow pair: engine snapshot and Memory-Bank pack identified by the
   beta checkpoint, installed into the isolated `DD_FLOW_HOME` without making
   the product checkout itself a beta branch.

The setup receipt must record both commits/branches and reject a mismatch
before starting ZCode. Then create a fresh canonical revision; this RUN cannot
be resumed.

## Secondary harness note

`session cancel` requested root cancellation, but ZCode did not settle the
active `session.create` request within the daemon's bounded stop window. The
daemon requires explicit process cleanup. This is the already-observed ZCode
terminal-cancellation limitation; it is recorded here as an associated
operational defect, not used to reinterpret the workspace-route root cause.
