# EVAL-003 beta.11 — PROTOCOLIZE analysis

## Validity

`run_validity: valid`.

The input was materialized from immutable beta.11 at `40a5334`; the RUN bound
engine `0.8.0-beta.23`. The transcript records `gpt-5.6-luna` / `xhigh`, and
the hook registered `01a005ee-ba3a-77a1-94a3-2cbfca2f2fd8`. One flow Agent Turn
crossed SPECIFY to PROTOCOLIZE. No hidden answer, prior RUN, later stage or
runtime repair entered the worker context.

## Mechanical conformance

| Check | Result | Evidence |
| --- | --- | --- |
| Routing and workspace | pass | One `01-specify` and one `02-protocolize` attempt in the assigned RUN workspace. |
| Work, Turn and sessions | pass | `work.json` has the completed Agent Turn; the runtime session is `stopped` at Agent Turn completion. |
| Contract validation | pass | One result write and one successful finish; no schema discovery or rejected finish. |
| Deterministic materialization | pass | Indexed PRT and feature are non-empty; PRT contains acceptance coverage and all changed files are reported. |
| Reports and observability | pass | Report has lifecycle timing, Git branch/head/dirty state, concrete stopped session id and measured usage coverage. |
| Stop boundary | pass | RUN is at `protocolized → start_plan`; no later stage ran. |

beta.10's remaining mechanical findings are closed.

## Semantic quality

| Criterion | Result | Evidence |
| --- | --- | --- |
| Intent and scope fidelity | partial | The original request specifies Medium only for newly created tasks. SPECIFY added a user-visible default of Medium for historical tasks without a priority, and PROTOCOLIZE carried it into PRT scope. |
| Sizing verdict | pass | This remains one cohesive vertical slice and correctly produces one PRT. |
| PRT member quality | pass | Goal, scope, primary acceptance and proof limit are suitable for a fresh PLAN session. |
| Acceptance coverage | pass | Low/Medium/High, new-task default, existing authorization, ordering and negative paths map to the sole member. |
| Dependencies and PSET topology | not_applicable | One unblocked PRT. |
| Durable grounding and catalog actions | pass | Epic, feature, substantive product/system specs and SCN-002 are linked; the feature is populated and indexed. |
| Boundary and PLAN handoff | pass | No implementation/files/task graph/worktree/merge decision is prematurely specified. |
| Question and route discipline | partial | The legacy-task rule was treated as a settled default although it was not necessary to state at the product/protocol level. |

End-to-end score: **12/14 (85.7%), `pass_with_findings`**. The PRT is faithful
to its accepted SPECIFY handoff; the finding is an upstream SPECIFY grounding
defect, not a PROTOCOLIZE routing or materialization failure.

## Efficiency

| Metric | beta.10 | beta.11 | Assessment |
| --- | ---: | ---: | --- |
| PROTOCOLIZE wall time | 85.440 s | 64.009 s | 25.1% faster. |
| First result write | 47.0 s | 56.5 s | Slower initial drafting, but no correction loop. |
| Result writes / finish calls | 2 / 1 | 1 / 1 | Desired shape reached. |
| PROTOCOLIZE usage at completion | 291,014 input / 5,732 output / 1,470 reasoning | 220,668 input / 6,419 output / 1,991 reasoning | Lower input; output/reasoning variation is small-sample noise. |

The full flow was slower because SPECIFY took 241.812 s, versus 100.864 s in
beta.10. Its transcript shows additional catalog/policy reads and one retry of
a mistyped path. That is independent of the beta.11 PROTOCOLIZE fixes and is a
separate target for the SPECIFY evaluation.

## Conclusion

beta.11 closes the session lifecycle and observability defects and improves
PROTOCOLIZE completion speed. The next change should constrain SPECIFY defaults:
it may record an implementation migration consideration as a question for PLAN,
but must not promote it to user-visible accepted behavior without evidence from
the request or project policy.
