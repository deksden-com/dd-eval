# Memory Bank 2.18.0 planning baseline

This result freezes the last controlled EVAL-001 planning run before the
breaking Memory Bank 3.0.0 / dd-flow-cli 0.5.0 cutover.

## Bound inputs

- checkpoint: `cp-002-mb-2-18-0`
- Memory Bank: `2.18.0`
- dd-flow-cli: `0.4.2`
- harness: Codex Desktop
- model: `gpt-5.6-luna`
- reasoning: `max`
- main session: `019fe9d3-dc30-7133-a534-a6ad4d9a2959`
- transcript SHA-256:
  `03ad2ec83da0e75d42b2c509b5e999de6258fff62256fe6c04818bc7f03d2045`

The source tree and all operator-material SHA-256 values are retained in
`result.json`.

## Baseline measurements

- session wall time: `9,494.445 s` (`2:38:14.445`)
- SPECIFY stage time: `6,036.605 s` (`1:40:36.605`), including the user wait
  and the second clarification attempt
- PLAN stage time: `1,815.679 s` (`0:30:15.679`)
- summed stage time: `7,852.284 s`
- main-session tool calls: `269` exec and `12` wait
- context compactions: `3`
- input tokens: `35,745,522`
- cached input tokens: `34,718,976`
- output tokens: `181,694`
- reasoning output tokens: `50,937`
- total tokens: `35,927,216`

Runtime session coverage was empty because the 0.4.2 session registration
failed in the original run. The retained flow usage therefore contains no
sessions or token deltas; transcript-level counters above are the available
baseline.

## Known old-contract behavior

The run used two SPECIFY attempts and one PLAN attempt. It retained a runtime
plan, aspect graph, manual trace files and `.tasks` planning artifacts. The
PLAN performed 15 applicable local self-checks, launched no semantic
subagents, and reported zero recovery attempts.

These are comparison observations, not acceptance requirements for 3.0.0.
The 3.0.0 run is expected to use one current stage root, generated reports,
SQLite-owned runtime state, one canonical protocol `plan.json`, and complete
or honestly partial session/usage coverage.

## Collector defect found while freezing the baseline

The current `dd-eval collect` output reports negative
`unattributed_flow_seconds` when the RUN itself remains open and its timeline
summary has no total elapsed time. The raw session and stage durations are
valid; the derived field must be fixed before collecting the 3.0.0 comparison.
