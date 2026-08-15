# EVAL-003 — beta.11 same-session result

## Identity

- checkpoint: `cp-002-vnext-protocolize-beta-11`;
- flow pack: `eval-mb-3.2.0-vnext-protocolize-beta.11`;
- engine: `eval-engine-0.8.0-beta.23`;
- profile: `codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-8-0-beta-23`;
- Codex session: `01a005ee-ba3a-77a1-94a3-2cbfca2f2fd8`;
- Codex turn: `01a005ee-bb52-7772-a20e-72568ab3fb7f`;
- flow Agent Turn: `TURN-1aaeb0f2-5e7c-4468-91d3-72c411e078de`;
- RUN: `RUN-001-task-priority`.

## Result

The same registered session completed `specified → protocolized` and stopped
at `await_plan`.

- PRT: `PRT-007-add-task-priorities`;
- PSET: not applicable;
- created feature: `FT-001-task-priorities`;
- no PLAN, CODE, worktree, review, merge or deploy actions.

The deterministic PROTOCOLIZE report contains the exact Git snapshot, stopped
session id and a measured usage checkpoint. The worker completion message
contains only the RUN and flow Agent Turn, so it no longer reports an inferred
or incorrect Codex session id.

Evidence is retained in the isolated input at
`/Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-003-vnext-protocolize-task-priority/luna-xhigh-beta11-same-session`
and the RUN home at
`/Users/deksden/.dd-flow/projects/PRJ-059-luna-xhigh-beta11-same-session/runs/RUN-001-task-priority`.
