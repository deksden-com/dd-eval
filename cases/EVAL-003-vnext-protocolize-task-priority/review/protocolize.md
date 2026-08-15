# Review: vNext PROTOCOLIZE

Review one completed PROTOCOLIZE stage. Judge the delivery decision and its
durable materialization, not the reviewer's preferred implementation. The
accepted SPECIFY result is the behavioural source of truth;
`protocolize-result.json` is the worker's semantic result; PRT/PSET/catalog
documents are deterministic engine projections.

## Reviewer output

Record three separate results:

1. `run_validity: valid | invalid_infrastructure_flow`;
2. mechanical checks as `pass | partial | fail`;
3. semantic criteria as `pass | partial | fail | not_applicable`.

For each non-pass item give one evidence path, severity (`critical`, `high`,
`medium`, or `low`) and owner (`worker`, `flow`, `engine`, or `harness`). Do
not lower worker semantic quality for a deterministic projection, schema,
routing or reporting defect. `context_misses` are reviewer findings, never
worker-authored fields.

## 1. Run-validity gate

The run is valid for semantic comparison only when all of these hold:

- frozen checkpoint, flow pack, engine binding, model and reasoning profile
  match the selected eval input;
- PROTOCOLIZE received the accepted SPECIFY artifact from the same RUN;
- the actual contributing session or sessions are registered, and the selected
  same-session/new-session policy was followed without a worker-supplied id;
- no prior result, reviewer material, another RUN/transcript or hidden answer
  entered the worker context;
- the worker did not manually repair runtime state or create PLAN/CODE/review/
  merge/deploy artifacts;
- a flow or harness failure did not make the semantic result untrustworthy.

If invalid, preserve the RUN as infrastructure evidence and stop numerical
semantic comparison. A trustworthy semantic result may still be reviewed when
non-contaminating engine projection or observability defects occur.

## 2. Mechanical conformance

| Check | Pass means |
| --- | --- |
| Routing and workspace | The declared transition creates the vNext PROTOCOLIZE stage in its assigned workspace and uses `protocolize-result.json`, without a generic or duplicate stage. |
| Work, Turn and sessions | Root Work, Agent Turn(s), session ids, stage range, status and timestamps truthfully represent the selected handoff mode; portable projections agree with SQLite. |
| Contract validation | The generated template describes every conditionally required field; a valid result is accepted without undocumented schema discovery. Rejections preserve the same attempt and return all actionable errors. |
| Deterministic materialization | CLI allocates ids and creates exactly the required PRT/PSET/catalog documents, resolves temporary member keys, preserves requested raw intake, and updates all owning indexes and cross-links. No placeholder or empty durable document is emitted. |
| Reports and observability | JSON/Markdown/HTML reports exist and agree; stage timing uses lifecycle timestamps; changed files, checks, evidence, sessions and usage coverage are complete and honest. |
| Stop boundary | RUN ends at truthful `protocolized → start_plan`; no PLAN, CODE, worktree, review, merge or deploy work occurs. |

A mechanical failure is assigned to its owner. It invalidates model comparison
only when it contaminates or obscures the semantic decision.

## 3. Semantic quality

Score `pass = 2`, `partial = 1`, `fail = 0`; omit `not_applicable` rows from
the denominator. Report the vector as well as the percentage so one high score
cannot hide a material failure.

| Criterion | Essential | Pass means |
| --- | --- | --- |
| Intent and scope fidelity | yes | Preserves accepted actors, value, behaviour, constraints and non-goals without adding a product rule or dropping an accepted one. |
| Sizing verdict | yes | Chooses the smallest honest delivery shape. One cohesive vertical slice stays one PRT; a PSET exists only for genuinely independent slices or hard delivery boundaries, with a clear rationale. |
| PRT member quality | yes | Every member has one narrow user- or system-valuable goal, explicit scope and an independently verifiable primary acceptance contract. Members do not split by technical layer. |
| Acceptance coverage | yes | Every material request-level criterion maps to one or more members; every member owns acceptance; actor, initial state, action, observable result, verification and proof limits remain usable by a fresh PLAN session. |
| Dependencies and PSET topology | conditional | Only necessary hard dependencies are declared. A PSET identifies startable/blocked members, a feasible execution graph, selected mode and pre-code confirmation gate; soft “informs” relationships do not serialize work. |
| Durable grounding and catalog actions | yes | Links point to specific, material durable records rather than decorative shelf indexes. Epic/feature/spec/ADR/scenario actions follow positive triggers; raw intake is retained only when literal wording matters; no empty record is requested. |
| Boundary and PLAN handoff | yes | Provides enough delivery context for PLAN while leaving architecture, files, endpoints, migrations, task graph, worker routing, worktree and merge decisions to later stages. |
| Question and route discipline | yes | Does not repeat SPECIFY or ask solution questions. Uses `requirement_gap` or `waiting_for_user` only for a newly exposed material problem-space decision with no reasonable default. |

Semantic verdict:

- `pass`: score at least 87.5%, no essential failure;
- `pass_with_findings`: score at least 70%, no essential failure;
- `fail`: an essential criterion fails or score is below 70%.

## 4. Efficiency and observability diagnostics

These metrics do not lower semantic score unless they caused a missing or
untrustworthy result:

- PROTOCOLIZE wall time only, excluding earlier stages and final prose after
  stage completion;
- input, cache-read, cache-write, uncached-input, output and reasoning tokens;
- number of project reads, result writes, lifecycle calls and rejected finish
  attempts;
- repeated reads, CLI help/status/version/Git calls, broad searches and
  unnecessary subagents;
- time to first semantic result and correction time after validation;
- all contributing session ids and transcript coverage.

The expected efficient shape for a simple single-PRT task is one targeted
catalog read when needed, one semantic result write and one successful finish.
Additional calls require a concrete reason.

## EVAL-003 task-priority anchors

For this case, accepted behaviour includes exactly Low/Medium/High, Medium for
new tasks when omitted, existing task-edit authorization, priority visibility
and High → Medium → Low ordering. Labels, task status, notifications and a new
public API are out of scope. One cohesive PRT is the expected shape unless the
worker finds a genuine delivery boundary in accepted evidence.
