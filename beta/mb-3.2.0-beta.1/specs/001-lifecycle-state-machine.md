# 001 — Unified lifecycle state machine

## Problem

The current CLI has three overlapping lifecycle implementations: protocol
transitions use `FlowContract.transitions`; stage finish has its own
rank-based `syncProtocolLifecycle`; RUN completion has a third status update.
The generic finish schema excludes `waiting_for_user`, while the generated
finish command always passes `--outcome done`. A valid SPECIFY pause can
therefore be recorded as a blocked RUN or an inconsistent protocol state.

## Decision

Define one explicit lifecycle table in the beta flow contract and make one CLI
reducer the only writer of protocol state, RUN state and next action.

- `current_stage` is the active logical stage.
- `running`, `waiting_for_user`, `blocked`, `failed` and `done` are statuses,
  not substitute stages.
- `stage finish` reads a stage-specific semantic verdict from `stage-input.json`;
  it does not accept a competing `--outcome` flag.
- The reducer validates the transition, updates SQLite, `run.json`, timeline,
  protocol summary and generated receipt atomically.
- Prompt allowed outcomes and `flow guidance` are rendered from the same table.
- A normal final transition completes the RUN. No second worker command closes
  it.

For SPECIFY, `waiting_for_user` preserves `current_stage: specify`; receiving
the clarification and starting SPECIFY again returns it to `running`. A
`specified_ready_for_plan` verdict transitions to PLAN. `blocked` and `failed`
remain at the current stage with an explicit reason.

Replace `run complete` with controller-only `run override --status
cancelled|failed --reason <text>`. It is an audited manual recovery action,
not a normal completion command and not a worker-prompt command.

## Ownership

- `dd-tasks/.memory-bank/dd-flow/flow-contract.json`, its schema, runtime
  contract and stage instructions define the table and wording.
- `dd-flow-cli` implements the reducer, schemas, guidance and generated command
  surface.

## Acceptance

1. Unit tests cover each allowed and rejected SPECIFY transition.
2. `waiting_for_user` remains a nonterminal RUN/protocol state with no status
   mismatch.
3. A normal final stage completes a RUN without `run complete`.
4. `run override` requires a reason, is audit-labelled `manual_override`, and
   cannot be rendered for a worker.
5. There is no rank-based parallel transition logic or fixed `--outcome done`
   in the active stage lifecycle.

## Out of scope

Changing the product task-tracker lifecycle or adding recovery fallbacks for
old active RUN formats.
