---
file: 'cases/EVAL-004-vnext-plan-task-priority/results/2026-08-16-beta28-live-wave-blocked.md'
status: 'BLOCKED'
---

# EVAL-006 — beta.28 live grouped PLAN wave

## Scope

- project checkout: `dd-eval-runs/EVAL-006-live-plan-wave/luna-xhigh-beta28`
- engine: `dd-flow-cli@0.8.0-beta.28`
- flow pack: `3.2.0-vnext-protocolize-beta.12`
- Desktop parent task: `01a00817-4e60-7e91-90d6-421b5106caef`
- RUN: `RUN-001-task-priority`
- parent PLAN Turn: `TURN-35fd034e-e14d-495a-978f-5984263e599b`

## What passed

- SPECIFY and PROTOCOLIZE completed in one live RUN.
- No premature `run_completed`, `run_finished` usage checkpoint or
  same-session stop occurred between those stages and PLAN.
- PLAN dispatch produced three portable grouped review Work in one wave.
- The flow correctly prevented PLAN finish and CODE registration when those
  reviews did not complete.

## Blocker

Three visible Desktop worker tasks were created concurrently:

- `01a00823-4b3d-7e32-91ed-9744b0d0cb4d` — contract/data;
- `01a00823-4438-76b2-8616-4cc72eade64a` — UI/trace/evidence;
- `01a00823-5891-70c0-b451-a2c609d02ae8` — trust/tests/scenario.

The PreToolUse hook attributed two `work start` events to the Session of a
different concurrent worker. The affected Work were cancelled rather than
claiming false Agent Turn/usage coverage:

- `WORK-37035ddd-8505-4a4d-8a74-c62b6d07480f`;
- `WORK-d37008ca-f836-4123-87b6-c9dce33b3f7b`;
- `WORK-d6e50ed4-13e6-47d0-b540-0f7aa283aa82`.

No worker result, aspect verdict/evidence update, PLAN report, CODE, worktree
or merge was produced. The failure is an adapter/hook identity defect, not a
semantic PLAN acceptance.

## Follow-up

Implement specification 006 L-09/L-10, then rerun the same case unchanged.
