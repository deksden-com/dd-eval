# Review: EVAL-002 vNext SPECIFY

Review one completed SPECIFY stage. This rubric evaluates the stage, not the
reviewer's preferred implementation. The semantic result is the source of
truth; stage reports and timeline provide deterministic execution evidence.

## Required reviewer output

For every semantic criterion below, record `pass`, `partial`, or `fail`, with
one evidence link or a concise reason. Classify every finding as `worker`,
`flow`, `engine`, or `harness`; do not charge a worker for a deterministic
controller defect. Report `context_misses` only when directly observed in the
worker's actions or result.

The stage passes when all mechanical gates pass and no semantic criterion
fails. A `partial` result is a review finding, not an automatic stage failure.

## Mechanical gates

- The worker was forked from the recorded primed-discussion baseline, pinned
  to the baseline's exact model and reasoning effort, and received only the
  case's start-flow trigger.
- The worker did not read another RUN, transcript, reviewer material or prior
  result. The current RUN workspace is allowed; any other `~/.dd-flow` run is
  a harness-input leak and invalidates model-quality comparison.
- The RUN has one SPECIFY Work and its trusted hook binds the actual worker
  session. No worker-supplied session id was used.
- `specify.md` is non-empty and follows the rendered Markdown template. The
  stage is `done/specified`, its report JSON/Markdown/HTML exists, and the
  report's semantic-document SHA-256 matches `specify.md`.
- The final transition is `start_protocolize`. No protocol, PLAN, CODE,
  review, merge, deployment, or durable Memory Bank document was created.

If a gate fails, stop semantic scoring only when the result cannot be trusted.
Otherwise record the gate failure separately and continue.

## Semantic criteria

| Criterion | Pass means |
| --- | --- |
| Intent fidelity | Preserves the agreed priority feature: a fixed, understandable priority set; creation, edit and list visibility; and the agreed default for new and existing tasks. |
| Gaps and defaults | Runs a proportionate baseline pass; uses applicable light methods; asks only for a decision with no reasonable default; does not silently invent a material rule. |
| Grounding | Uses only relevant project evidence and carries forward existing task surfaces, permission/isolation invariants and the `SCN-002` acceptance contour. |
| Portable contract | States problem, goal, actor, requirements, constraints, scope/non-goals, assumptions, acceptance criteria and one observable end-to-end scenario sufficiently for a fresh PROTOCOLIZE session. |
| Verification | Covers explicit/default/update persistence, invalid-value rejection, authorization/isolation regression, browser path and basic accessible/responsive UI evidence; does not overclaim CI, remote or production proof. |
| Boundary discipline | Leaves architecture, data migration mechanics, endpoints, files, task ordering, worker topology and merge decisions to later stages; creates no later-stage artifact. |
| Handoff and routing | Chooses a plausible delivery shape and planning floor, preserves non-negotiables, names only material follow-up sources and supplies verification seeds. |

Do not require exact wording or a particular technical solution. `gaps: []` is
valid when the prior discussion already settled every material choice.

## Efficiency and observability (non-scoring)

Record elapsed time, custom-tool calls, rejected `stage finish` attempts,
unnecessary reads and transcript/usage coverage. These diagnose the flow or
engine; they do not lower the semantic score unless they caused a missing or
untrustworthy result.
