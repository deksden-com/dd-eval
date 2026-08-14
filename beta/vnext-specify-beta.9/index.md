---
file: 'beta/vnext-specify-beta.9/index.md'
description: 'Beta 9: repair SPECIFY method routing, output contract and observability.'
status: 'READY_FOR_EVAL'
---

# vNext SPECIFY beta 9

Engine: `dd-flow-cli@0.8.0-beta.8`  
Flow pack: `3.2.0-vnext-specify-beta.9`

This beta repairs findings from the beta 8 native run:

- an actor-visible, multi-step acceptance path selects `use_case_analysis` as
  `light`; CRUD+ complements rather than replaces it;
- the generated stage prompt supplies exact shapes and enum values for every
  complex result item, including questions, analogies, gaps, aspects and
  delivery slices;
- `policy_context.findings` preserves durable policy facts separately from
  policy gaps;
- `01-specify` is a real RUN stage with deterministic result artifacts;
- the hook resolves the current Codex transcript from the real session ID, so
  token usage can be measured without an agent-supplied path.

Intake remains semantic work of the agent. The engine records and packages the
agent's discussion; it does not infer questions, defaults or requirements from
it.
