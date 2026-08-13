# Analysis: mb-3.2.0-beta.1 / <run-id>

## Frozen inputs

- dd-tasks beta tag/commit:
- dd-flow-cli beta tag/commit/version/checksum:
- checkpoint and prepare manifest SHA:
- profile and actual Codex session id:

## Mechanical gate

- engine binding:
- hook event and trusted session binding:
- lifecycle transition:
- generated reports and schemas:
- timing/usage coverage:
- prohibited later stages or hidden input access:

Verdict: `valid | invalid_infrastructure_flow`.

## Semantic gate

- applicable rules and project grounding actually read:
- questions/gaps quality:
- evidence quality:
- stop boundary:

Verdict: `pass | fail`.

## Context misses

Record reviewer-observed missing, late, misleading or rediscovered context.
Do not attribute this list to the evaluated agent. State whether each miss is
one-off or should be promoted into the next `stage start` packet.

## Findings and next action

List `critical`, `high`, `medium` and `low` findings with likely owner:
engine, flow, harness or model. Link the next beta spec if another iteration is
needed.
