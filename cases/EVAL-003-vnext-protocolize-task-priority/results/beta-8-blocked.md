# EVAL-003 — beta.8 same-session blocked result

## Identity

- checkpoint: `cp-002-vnext-protocolize-beta-8`;
- flow pack: `eval-mb-3.2.0-vnext-protocolize-beta.8`;
- engine: `eval-engine-0.8.0-beta.20`;
- profile: `codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-8-0-beta-20`;
- agent session: `01a005a8-9f3f-7023-ba3e-82c6e0e87b39`;
- RUN: `RUN-001-task-priority`.

## Verdict

**Blocked by Flow routing.** SPECIFY completed as `specified` and the agent
attempted the supplied same-session continuation. The public `stage start`
dispatch instead attached generic `03-protocolize`, with `Protocol: SPECIFY`,
the canonical SPECIFY instructions, and generic `stage-input.json`. It did not
create the vNext `02-protocolize` Work or its `protocolize-result.json`.

The agent stopped on that contradictory packet. It did not invent a result
envelope, alter RUN state, or create a PRT/PSET. This is a valid flow failure,
not an agent-quality verdict.

## Evidence

- isolated input: `/Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-003-vnext-protocolize-task-priority/luna-xhigh-beta8-same-session`;
- portable RUN home: `/Users/deksden/.dd-flow/projects/PRJ-056-luna-xhigh-beta8-same-session/runs/RUN-001-task-priority`;
- accepted SPECIFY: `01-specify/specify.md` and its reports;
- contradictory generic packet: `03-protocolize/stage-prompt.md` and
  `03-protocolize/stage-input.json`;
- timeline: `timeline.jsonl`, sequences 6–11.

The timeline proves the root transition: it records `work_completed` and
`run_completed` immediately after SPECIFY, then later only generic
`stage_attached` and `session_bound` for PROTOCOLIZE. No vNext
`stage_prepared` or `agent_turn_started` event exists.

## Required correction before rerun

`stage start <run> --stage protocolize` must dispatch a RUN whose completed
SPECIFY Work has `next_action=start_protocolize` into
`startVnextProtocolize`, not the generic stage launcher. The transition must
preserve the vNext Work and same-session constraint and must yield the
vNext `protocolize-result.json` contract.
