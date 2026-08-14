# Review: vNext initial SPECIFY

First check mechanics, then assess content. Do not score the worker for work
that belongs to the deterministic controller.

## Mechanical gate

- The RUN is bound to engine `0.8.0-beta.1` and flow
  `mb-sdlc-vnext-specify@1`.
- The only initial Work contains one Agent Turn; no protocol exists before the
  submitted result.
- The result is inside `stages/specify/`, validates against
  `dd-flow/vnext-specify-result@1`, and its immutable receipt predates
  validation.
- The first worker action is `flow launch`; its trusted PreToolUse event binds
  the real worker session to the Agent Turn. No agent-authored session id is
  accepted.
- `waiting_for_user` remains a non-terminal RUN state. `specified`, `failed`,
  and `cancelled` are terminal.

## Semantic gate

- Project grounding is relevant and sufficient; the worker did not repeat
  deterministic compatibility, Git, or permission discovery.
- Questions are limited to decisions that lack a reasonable default and would
  materially affect the implementation.
- Requirements, acceptance, scope, constraints, assumptions, and next-stage
  context permit protocolization in a new session without relying on hidden
  chat context.
- No protocol, PLAN, CODE, review, merge, or deployment work began.

Classify each finding by engine, flow, harness, or model. Record only reviewer
observed `context_misses`; do not ask the worker to self-score them.
