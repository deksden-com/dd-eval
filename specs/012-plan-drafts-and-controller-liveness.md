# Specification 012: PLAN drafts and Controller liveness

## Goal

Prevent a slow but productive PLAN from being mistaken for a blocked stage,
while reducing mechanical artifact work without moving semantic planning into
the engine.

## Incident evidence

In canonical revision REV-058 the Subject completed the capacity probe,
grounded the plan and wrote a schema-valid 29 KB `plan.json`. The Controller
interrupted immediately after that write because no tool call was active and
incorrectly reported that PLAN had materialized no artifacts. The Subject had
not yet written `aspect-map.json` or called `stage finish`.

The direct cause was Controller liveness inference. A contributing cause was
an asymmetric stage interface: PLAN start created a partial `plan.json`, but
not the corresponding aspect map, and did not give exact validation commands.

## Required behavior

### Controller

- `running` provider/task state and `running` stage state mean wait.
- Absence of an active tool call is not evidence of a stall. Reasoning,
  compaction and artifact composition may occur between tool calls.
- Efficiency symptoms are recorded but never promoted to blockers.
- Interruption is allowed only for explicit Subject blocker, requested HITL,
  provider/runtime failure, user cancellation, or a separately confirmed
  no-progress incident. Before the last case, inspect current task state, RUN
  state and fresh artifact events through read-only Controller tools. Do not
  inject a liveness prompt into the evaluated Subject.
- A canonical stage is accepted only after its successful lifecycle finish.

### PLAN start

- Materialize both current artifacts: protocol-owned `plan.json` and RUN-owned
  `aspect-map.json`.
- Report `status=materialized` and `completeness=partially_filled` in the
  start response and saved Work context.
- State plainly that the artifacts already exist, are partially filled and
  must be edited in place.
- Identify CLI-owned fields. For the plan these are identity, initial revision
  and source references. For the map these are identity, revision, catalog
  reference and every catalog aspect identifier.
- Leave semantic fields incomplete. The CLI must not default aspects to
  `not_applicable`, select checks or invent plan items.
- Return absolute paths and exact schema-validation and finish commands.
- Preserve existing drafts on a repeated start; never replace semantic work.

## Boundaries

`plan.json` remains the sole semantic plan. There is no `plan-input.json`,
planning DSL, semantic SQLite copy or agent-authored CODE batch. The engine
owns deterministic materialization and validation only; the Subject owns
grounding, decisions, checks, graph, acceptance and aspect routing.

## Acceptance

- a PLAN start creates both partial drafts and reports their state;
- the map draft contains the current catalog aspect identifiers without an
  applicability decision;
- an untouched draft fails validation and finish with errors for both files;
- a completed pair follows the existing PLAN finish and CODE projection path;
- the stage packet tells the Subject to keep its actual runner cwd and use the
  returned absolute paths;
- the eval runbook forbids interruption based only on tool inactivity.
