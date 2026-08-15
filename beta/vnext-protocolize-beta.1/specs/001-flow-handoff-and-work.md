---
file: 'beta/vnext-protocolize-beta.1/specs/001-flow-handoff-and-work.md'
description: 'SPECIFY → PROTOCOLIZE beta flow, project handoff policy and Work/Turn requirements.'
status: 'DRAFT'
---

# 001 — Flow, handoff and Work

## Goal

Extend the vNext proof flow with PROTOCOLIZE without changing completed
`mb-sdlc-vnext-specify@1` RUNs.

## Flow

The new beta flow has legal transitions:

```text
SPECIFY.specified          → PROTOCOLIZE.default
SPECIFY.waiting_for_user   → SPECIFY.answer
SPECIFY.failed/cancelled   → terminal
PROTOCOLIZE.protocolized   → waiting_for_plan
PROTOCOLIZE.requirement_gap → SPECIFY.remediation
PROTOCOLIZE.failed/cancelled → terminal
```

SPECIFY records request-level behavior and acceptance. PROTOCOLIZE creates
delivery structure; it does not run PLAN or create a worktree.

## Project execution policy

`execution.stage_handoff` is a project-level dd-flow configuration key with
values `same_session` and `new_session`; its default is `same_session`.

The resolved value is snapshotted when a RUN is created and cannot change after
the first inter-stage transition. A RUN-level override is deliberately outside
this beta: no caller needs it yet, and project configuration is the simple
source of truth.

`stage finish` never accepts or changes this value. Its result contains a
directive consistent with the saved snapshot.

## Handoff behavior

For `same_session`, the completion receipt contains a PROTOCOLIZE prompt and a
same-session continuation directive. The harness may continue in the current
turn or open the next turn in the same Session; it must retain the Work.

For `new_session`, the completion receipt prepares PROTOCOLIZE but requires the
current Session to stop. A controller starts a new Session and binds it to a
new Agent Turn of the same Work through the PreToolUse hook.

The model never sends a session id or selects a handoff mode.

## Runtime constraints

- One root Work survives SPECIFY → PROTOCOLIZE.
- A Work may have multiple Agent Turns.
- Each Agent Turn has exactly one Work and one Session.
- A new Session receives the materialized PROTOCOLIZE context, not the full
  discussion transcript.
- Hook matching uses one shared canonical stage-invocation fingerprint.
- Existing terminal SPECIFY beta RUNs stay readable and unchanged.
