# 007 — Frozen execution profile and CODE completion

## Problem

The beta flow had two mutable sources for one RUN's execution policy and left
CODE in a non-terminal pseudo-state. A restored checkpoint could also copy an
engine snapshot whose version differed from the input checkpoint. Those are
runtime-contract failures, not matters for an agent to infer.

## Decision

Each vNext RUN snapshots `.memory-bank/dd-flow/project-execution.json` once at
creation. It is the sole source for stage handoff, PLAN-review mode, terminal
target and CODE bootstrap command. Workspace routing remains exclusively in
`project-workspace.json`.

`PROTOCOLIZE` creates the selected checkout and copies only policy-allowed
ignored files. `CODE` runs the frozen bootstrap command once, stores
`05-code/workspace-readiness.json`, reuses a matching successful receipt, and
shows heartbeat progress while it runs. It then executes the registered CODE
Work graph and the aggregate deterministic checks. A successful CODE finish
sets the RUN terminal verdict to `code_completed`; a later CODE review is an
optional future stage, not an invented intermediate state.

Stage reports must not claim synthetic session or usage coverage. They contain
their measured timing and point to factual `dd-flow stat` queries, which are
computed after sessions settle.

`dd-eval` validates the project execution profile before preparation and rejects
a restored stage checkpoint if its immutable engine binding does not match the
input checkpoint's CLI version.

## Acceptance

- a RUN retains the same frozen execution profile after the project file changes;
- PLAN receives one recorded capacity value before it groups aspects;
- CODE bootstrap runs in CODE, emits progress and leaves a reusable receipt;
- `code_completed` is terminal and is the E2E boundary;
- vNext reports contain no `session_coverage` or `usage_coverage` claims;
- a beta.88 snapshot cannot be restored for a beta.90 input checkpoint;
- targeted vNext and eval-runner tests pass.
