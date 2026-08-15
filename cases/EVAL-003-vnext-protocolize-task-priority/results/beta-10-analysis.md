# EVAL-003 beta.10 — PROTOCOLIZE analysis

## Validity and identity

`run_validity: valid`.

The isolated input was materialized from
`eval-mb-3.2.0-vnext-protocolize-beta.10` at `84333d5`; its immutable engine
binding is `0.8.0-beta.22`. The registered session is
`01a005dd-566f-7310-a232-c69687ba0461`, whose transcript records
`gpt-5.6-luna` with `xhigh` reasoning. The same session and one flow Agent Turn
(`TURN-083b60d3-d3c6-4558-895f-aa76c8819c4a`) crossed SPECIFY to PROTOCOLIZE.
The worker received the accepted `01-specify/specify.md` from this RUN only and
did not create later-stage artifacts. The report defects below do not
contaminate the delivery decision.

## Semantic quality

| Criterion | Result | Evidence |
| --- | --- | --- |
| Intent and scope fidelity | pass | Low/Medium/High, Medium default, existing task-edit authority, High→Medium→Low ordering and explicit non-goals are retained. |
| Sizing verdict | pass | One cohesive vertical slice is correctly a single executable PRT. |
| PRT member quality | pass | The member has an end-to-end goal, explicit scope and a usable primary acceptance contract. |
| Acceptance coverage | pass | All four material criteria map to `primary`; actor, state, action, result, verification and proof limits are present. |
| Dependencies and PSET topology | not_applicable | No PSET or artificial dependency was created. |
| Durable grounding and catalog actions | pass | The epic, feature, two substantive specs and SCN-002 are material records; the feature has content and is indexed. |
| Boundary and PLAN handoff | pass | No architecture, file list, task graph, worktree or merge decision leaked into the PRT. |
| Question and route discipline | pass | No repeated user question or artificial requirement gap. |

Score: **14/14 (100%)**, semantic verdict **pass**.

## Mechanical conformance

| Check | Result | Finding |
| --- | --- | --- |
| Routing and workspace | pass | vNext `01-specify` and `02-protocolize` ran once in the assigned RUN workspaces. |
| Work, Turn and sessions | partial | Work and the flow Agent Turn are now correct in `work.json`; however the session registry still says `active` after the Desktop turn has completed. **Medium, engine/hook.** |
| Contract validation | pass | Conditional feature fields are supplied in the generated template and the result completed with one successful finish, without schema discovery or a rejected finish. |
| Deterministic materialization | pass | Engine created and indexed PRT and feature, wrote acceptance coverage into the durable PRT, and reported all changed durable files. |
| Reports and observability | partial | Timing and changed files are correct. The PROTOCOLIZE report still has `git: {}`, only generic `session_coverage: recorded`, and `usage_coverage: available_later` although session ids and usage are available from the RUN. **Medium, engine.** |
| Stop boundary | pass | RUN is truthfully at `protocolized → start_plan`; no later work ran. |

Low worker finding: its final prose reported the parent/source-thread id
`019fb9e5-…` as the Codex session. The actual session is the hook-registered
`01a005dd-…`; runtime evidence is correct, so this does not invalidate the run.

## Efficiency and comparison

| Metric | beta.9 | beta.10 | Assessment |
| --- | ---: | ---: | --- |
| PROTOCOLIZE wall time | 82.223 s | 85.440 s | +3.217 s; one sample, no material regression claim. |
| First semantic result | 59.6 s | 47.0 s | Faster by about 12.6 s. |
| Successful finish | after one rejected finish | first finish | Contract repair removed the rejected-finish loop. |
| Stage usage | 300,095 input / 6,471 output / 2,032 reasoning | 291,014 input / 5,732 output / 1,470 reasoning | Lower at the PROTOCOLIZE finish checkpoint. |

The full measured flow stages took 186.304 s: SPECIFY 100.864 s and
PROTOCOLIZE 85.440 s. The agent used one targeted epic read, read the generated
result template, wrote the semantic result, performed two JSON syntax checks,
then made the single successful finish. The template's empty sample acceptance
criterion caused an avoidable second result edit; no lifecycle retry occurred.
After RUN completion the worker spent roughly 54 s searching for its session id
and still reported the wrong one. That work is outside the stage timing but is a
clear harness/prompt efficiency defect.

## Conclusion

beta.10 fixes every high-impact beta.9 materialization and Work-projection
defect. It is a valid semantic comparison point and produces a plan-ready,
durable PRT. Do not promote the observability implementation unchanged: close
the session at agent-turn completion, and make the deterministic PROTOCOLIZE
report include the known Git snapshot, concrete session ids and current usage
coverage. Separately, change the eval worker's completion instruction so it
does not infer a session id from delegation metadata.
