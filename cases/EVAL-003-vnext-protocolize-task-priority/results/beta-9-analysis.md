# EVAL-003 beta.9 — PROTOCOLIZE analysis

## Identity and timing

- session: `01a005b5-3141-77b0-80bb-0436ab2d03e9`;
- RUN: `RUN-001-task-priority`;
- stage: `02-protocolize`, 82,223 ms;
- result: `PRT-007-task-priority`, no PSET;
- usage: 300,095 input, 282,368 cache-read, 17,727 uncached-input,
  6,471 output and 2,032 reasoning tokens.

The stage used five tool calls: one targeted epic read, one initial result
write, two finish calls and one correction write. It did not inspect CLI help,
Git, runtime status, another RUN or arbitrary implementation files. From stage
entry to the epic read was about 12.5 s; the first semantic result was written
at about 59.6 s; the successful finish arrived at about 82.2 s. Final user
prose followed after stage completion and is excluded from stage timing.

## Review result

`run_validity: valid`. The correct beta.9/engine beta.21 pair was bound, the
same Desktop session crossed SPECIFY → PROTOCOLIZE, no hidden input leaked,
and the semantic result is trustworthy.

### Semantic quality

| Criterion | Result | Evidence |
| --- | --- | --- |
| Intent and scope fidelity | pass | Fixed values, Medium default, existing edit permission, visibility/order and explicit non-goals are preserved. |
| Sizing verdict | pass | `single_executable_protocol` is the smallest cohesive vertical slice. |
| PRT member quality | pass | One end-to-end member has a clear goal, scope and observable primary acceptance. |
| Acceptance coverage | pass | Five material criteria map to `primary`; actor, state, action, outcome, verification and proof limits are complete. |
| Dependencies and PSET topology | not_applicable | One unblocked PRT; no false dependency or PSET. |
| Durable grounding and catalog actions | partial | Epic and SCN-002 are material, but `.memory-bank/spec/system/index.md` is a generic shelf index rather than a specific normative contract. |
| Boundary and PLAN handoff | pass | No architecture, file/task graph, worktree or merge design entered the PRT. |
| Question and route discipline | pass | No duplicate problem-space question; no artificial `requirement_gap`. |

Score: **13/14 (92.9%), semantic verdict `pass`**.

### Mechanical conformance

| Check | Result | Owner and finding |
| --- | --- | --- |
| Routing and workspace | pass | vNext `02-protocolize` and its correct result contract were used. |
| Work, Turn and sessions | partial | **engine, medium:** SQLite has the final Work state, but portable `work.json` remains `waiting_for_agent`, retains the SPECIFY result/turn projection and carries a completed timestamp older than PROTOCOLIZE. |
| Contract validation | partial | **flow/engine, medium:** the supplied result template omitted `epic_path`, `title` and `slug` for `feature.create`; the first finish discovered these hidden conditional requirements. |
| Deterministic materialization | fail | **engine, high:** protocol and epic indexes were not updated; the feature body is empty because the contract did not collect a summary; detailed acceptance coverage exists only in runtime JSON and is not projected into the durable PRT. |
| Reports and observability | fail | **engine, medium:** stage report says `wall_clock_ms: 0`, uses finish time for both start/finish, and lists only the PRT summary while feature and PRT index were also created. |
| Stop boundary | pass | RUN truthfully waits at `protocolized → start_plan`; later stages were not run. |

Additional low worker finding: the final prose called the flow Turn id a
“Session/turn ID” instead of reporting the actual session id. The RUN/session
registry itself is correct, so this does not affect semantic validity.

## Conclusion

The worker's delivery decision is strong and fast enough for this task. The
remaining blockers are deterministic engine/flow materialization and
observability defects. Fix those before promoting PROTOCOLIZE to canon; do not
change the semantic rubric or make the worker compensate by editing indexes,
reports or runtime projections manually.
