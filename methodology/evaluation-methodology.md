# Evaluation methodology

This is the normative method for every `dd-eval` case. It evaluates the
result of an SDLC flow, not textual similarity to a reference answer.

## Three independent views

1. **Outcome quality** is the primary result: whether the resulting decision,
   handoff or plan is correct, grounded, practical and sufficiently deep.
2. **Flow reliability** is execution discipline: legal flow transitions,
   correct HITL handling, durable handoffs and usable evidence.
3. **Efficiency** is reported as facts: elapsed time, tokens, tool calls,
   sessions, retries and waits. It never compensates for weak outcome quality.

Reports compare candidates in that order: outcome first, flow second, then
efficiency as a tie-breaker for materially comparable results. No blended score
is used.

## Criterion scale

Each applicable outcome and flow criterion is scored from 0 to 4.

| Score | Meaning |
| --- | --- |
| 0 | Missing, unsafe or contradicts the task. |
| 1 | Major gaps or unsupported decisions. |
| 2 | Usable but needs material correction. |
| 3 | Strong, grounded and free of material gaps. |
| 4 | Exceptionally complete and practical; adds a useful, justified insight. |

Extra prose, needless architecture and additional subagents do not improve a
score. A score of 4 requires a concrete improvement to the decision, evidence
or risk posture.

`not_applicable` is valid only when the criterion truly does not apply and the
Judge explains why. Missing evidence for an applicable criterion is not N/A.

## Findings and gates

- **blocking**: the result cannot safely proceed; Outcome verdict is `fail`.
- **material**: a meaningful defect that must be corrected. An essential
  criterion with a material defect cannot receive a full pass.
- **minor**: a local weakness without a meaningful downstream consequence.
- **cosmetic**: wording or formatting without a practical consequence.

Formal defects are classified by effect. A malformed path that blocks a CODE
worker is material; an equivalent harmless typo is cosmetic. Flow compliance
can never make up for a poor semantic result.

## Golden reference

Each case has one accepted `assessment.json`. It contains required outcomes,
accepted strong decisions, valid alternatives and known risks for each scope.
It is a semantic baseline, not a prescribed answer. A Judge first evaluates the
candidate on its own merits, then checks coverage against the reference and may
recognize a grounded alternative.

Judges may propose golden candidates. They never mutate the reference. A human
accepts a proposal by editing `assessment.json` in a new Git commit.
Accepted strong decisions are positive, reusable patterns rather than extra
mandatory outcomes: a grounded candidate may use an equally strong alternative.

## Roles

- **Controller** materializes attempts and records facts; it makes no semantic
  evaluation.
- **Stage Judge** is a fresh, read-only Session per focused stage.
- **E2E Judge** is a fresh, read-only Session for the full chain.
- **Grand Judge** compares anonymized completed reports, audits interpretation
  and may propose golden or methodology changes. It does not overwrite the
  original stage or E2E judgments.

The Judge receives mechanical evidence calculated by the tools. It must not
repeat checksum or lifecycle bookkeeping instead of reviewing the substance.

## Stage semantics

- **SPECIFY** is judged on a portable problem-space contract. Its `R-*` and
  `AC-*` obligations must be complete, precise and acceptance-oriented;
  mechanically parseable identifiers are necessary but earn no semantic
  credit by themselves. `specify.json` is the semantic source; `specify.md` is
  its deterministic reading projection. The Judge uses the JSON for exact
  obligation coverage and the Markdown for readable contextual review.
- **PROTOCOLIZE** is judged on lossless allocation of accepted obligations to
  the smallest valid delivery topology. It must not gain credit for paraphrasing
  the request, nor lose credit merely because deterministic rendering preserves
  the exact wording.
- **PLAN** is judged on grounded decisions, complete obligation realization,
  an executable implementation graph and falsifiable verification. A generated
  CODE projection is evidence of graph integrity, not proof that the plan is a
  good solution. Each plan item is also judged as a fresh-worker context:
  whether it selects the smallest sufficient project sources, standards,
  accepted semantics, boundaries and proof for a code worker without the
  planning transcript.
- **PLAN-REVIEW** is judged on independent semantic challenge, prioritization,
  accepted corrections and the readiness of the resulting plan for CODE. It is
  not a second schema-validation pass.

When a deterministic projection is derived from a semantic source, Judges
score the source and its downstream fitness. They report a projection mismatch
as a flow defect and must not reward duplicated agent-authored bookkeeping.

### Criterion interpretation for the planning contour

Use these meanings whenever the active assessment contains the named id.

| Scope | Criterion | Judge meaning |
| --- | --- | --- |
| SPECIFY outcome | `gaps` | Finds and resolves material ambiguity proportionately; does not reward question count or speculative analysis. |
| SPECIFY outcome | `obligations` | R/AC are complete, precise, mutually coherent and include material defaults, invariants, exceptions and negative boundaries. |
| SPECIFY outcome | `handoff` | A fresh PROTOCOLIZE Session can act without the discussion transcript and without inventing product semantics. |
| SPECIFY outcome | `grounding` | Uses relevant project truth and stops reading once the material uncertainty is resolved. |
| SPECIFY flow | `hitl` | Pauses only for a decision with no reasonable default, preserves the same stage and correctly incorporates the answer. |
| SPECIFY flow | `stage-integrity` | Produces the accepted JSON SSOT and deterministic projection once, then stops at the declared boundary. |
| SPECIFY flow | `evidence` | Stage report and retained inputs make the result and its sources inspectable. |
| PROTOCOLIZE outcome | `obligation-preservation` | Every accepted R/AC keeps its exact meaning and has explicit protocol ownership; no material obligation is lost or invented. |
| PROTOCOLIZE outcome | `slicing` | Uses the smallest valid vertical single-PRT/PSET topology with real dependency boundaries. |
| PROTOCOLIZE outcome | `durable-documents` | Applies positive triggers for feature/epic/spec/ADR/scenario links and leaves useful indexed records without placeholders. |
| PROTOCOLIZE outcome | `handoff` | PLAN receives clear protocol boundaries, owned obligations and topology without premature implementation design. |
| PROTOCOLIZE flow | `workspace-policy` | Uses only the CLI-provisioned workspace/branch route. |
| PROTOCOLIZE flow | `deterministic-materialization` | Lets CLI allocate ids and render exact obligations; no manual durable-document duplication or partial publication. |
| PROTOCOLIZE flow | `evidence` | Result, ownership map, generated durable links and stage report are traceable. |
| PLAN outcome | `grounding` | Grounds decisions in accepted obligations, PRT boundaries and relevant current project surfaces. |
| PLAN outcome | `decision-quality` | Chooses the simplest adequate architecture and records only material decisions, risks and document changes. |
| PLAN outcome | `executable-work-graph` | Every owned obligation maps to concrete ordered plan items with resolvable inputs, bounded outputs and no unsafe concurrency. |
| PLAN outcome | `verification` | Gives falsifiable positive, negative, migration and cleanup evidence proportionate to the accepted behavior. |
| PLAN outcome | `worker-context` | Gives each fresh code worker sufficient source, standard, requirement, hard workspace boundary, soft planned coordination areas and verification context; it does not outsource grounding to the worker. |
| PLAN flow | `routing` | Uses local work or grouped subagents proportionately; breadth alone does not force deep routing. |
| PLAN flow | `projection-integrity` | PLAN remains the semantic SSOT and the generated CODE graph matches its revision, dependencies and paths. |
| PLAN flow | `evidence` | Plan, aspect map, generated graph and stage report make coverage and readiness inspectable. |
| PLAN-REVIEW outcome | `material-findings` | Finds consequential semantic, verification or executability defects rather than maximizing finding count. |
| PLAN-REVIEW outcome | `evidence` | Ties findings to accepted obligations, plan items and project facts. |
| PLAN-REVIEW outcome | `prioritization` | Consolidates duplicates and separates blocking/material issues from minor preferences. |
| PLAN-REVIEW outcome | `correction` | Applies accepted findings once to the PLAN SSOT without claiming unmade changes. |
| PLAN-REVIEW outcome | `code-readiness` | Final PLAN and generated graph can start CODE with complete, resolvable inputs. |
| PLAN-REVIEW flow | `reviewer-isolation` | Uses genuinely fresh read-only reviewer Sessions when review is enabled. |
| PLAN-REVIEW flow | `routing` | Groups compatible aspects toward minimal capacity-aware waves without dropping applicable review. |
| PLAN-REVIEW flow | `closure` | Classifies all material findings, handles HITL in-stage and closes once without an automatic second review. |
| PLAN-REVIEW flow | `code-registration` | CLI revalidates/reprojects and registers CODE Works atomically from the final PLAN. |

For E2E, `stage-quality` aggregates these semantic meanings without averaging
away a material stage defect; `cross-stage-integrity` checks preservation of
accepted obligations and decisions; `correction-quality` checks that review
improves the actual PLAN; and `readiness` checks the final executable graph.

### Golden worker contexts

An assessment may define `golden.worker_contexts` for PLAN. Each row describes
one semantic implementation responsibility and the context a fresh worker
needs: essential sources/tests, obligations, invariants, write ownership,
proof and harmful irrelevant context. Rows do not prescribe candidate item IDs
or one decomposition.

The Judge maps candidate items to these responsibilities semantically and
evaluates both directions:

- missing essential context that forces rediscovery or invention;
- excess irrelevant context that broadens scope or hides the actual task.

The union of several candidate packets may satisfy one golden responsibility,
or one coherent packet may satisfy several. Exact wording is never required.
The Judge also reports a projection-integrity defect when PLAN contains the
needed context but the generated CODE packet loses it.

## Evidence and rejudging

Candidate artifacts and their receipt are immutable. A later Judge result is a
new numbered judgment over the same candidate, carrying the assessment and
methodology hashes. Exact reruns use canonical stage-entry checkpoints. Static
rejudging uses retained candidate evidence; a report must state whether that
evidence is `complete` or `limited`.

Scores produced under different criterion axes are not compared as if they
shared one scale. When an assessment changes, either statically rejudge the old
candidate under the new assessment or show the historical and new-method lanes
separately. Never silently mix their weighted scores or radar axes.

## Reporting

Outcome and flow have separate score vectors. Efficiency remains raw data.
Radar charts may show a 0–4 vector only when all displayed models share the
same axes. Time, tokens and tool calls use bars or tables, never a radar.
