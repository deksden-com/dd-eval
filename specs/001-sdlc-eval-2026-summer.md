---
file: 'specs/001-sdlc-eval-2026-summer.md'
description: 'Versioned stage-isolated and end-to-end SDLC evaluation suite with primed Subject and Judge sessions, canonical fixtures, independent scoring and reproducible run evidence.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
---

# 001 — SDLC Eval 2026 Summer

## Goal

Evaluate AI agents at two complementary levels:

1. isolate `SPECIFY`, `PROTOCOLIZE`, `PLAN` and `PLAN-REVIEW` so each stage can
   be compared against a stable canonical input and expected result;
2. run the complete chain to measure information preservation, handoff quality
   and cumulative behavior across the same stage checkpoints.

The suite must support focused comparison of harness/model profiles without
turning the evaluated agent's prompt into an eval-specific instruction. Every
result must identify the exact Git state, prompts, fixtures, runtime and Session
tree that produced it.

## Why both forms are required

An end-to-end run alone cannot identify whether a weak PLAN was caused by PLAN,
by a poor SPECIFY result, or by information lost during handoff. A stage-only
run alone cannot show whether a model preserves decisions across the whole
flow.

Stage-isolated runs therefore consume an accepted canonical result from the
preceding stage. The end-to-end run starts from the original user discussion
and produces its own result at every checkpoint.

```text
canonical discussion
  ├─ SPECIFY eval
  │
  └─ canonical SPECIFY result
       ├─ PROTOCOLIZE eval
       │
       └─ canonical protocol set
            ├─ PLAN eval
            │
            └─ canonical imperfect PLAN revision 1
                 └─ PLAN-REVIEW eval

canonical discussion
  └─ E2E: SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW
```

The canonical PLAN used by PLAN-REVIEW is a **review fixture**, not a claim that
the plan is correct. It intentionally contains a known, documented set of
reviewable defects.

## Roles

### Eval Controller

The Controller operates the evaluation. It may be an agent, but it is not the
evaluated Subject and it does not judge semantic quality itself.

It:

1. resolves the requested case, focused stages and optional E2E run;
2. checks exact checkpoint, flow-pack, engine and harness compatibility;
3. materializes one independent repository/RUN workspace per selected run;
4. launches, names and monitors Subject Sessions;
5. stops at the configured stage boundary;
6. records root and child Session identifiers and runtime evidence;
7. waits for every Subject agent and subagent to stop;
8. launches independent Judge Sessions;
9. validates Judge results and renders the final report;
10. preserves the result in Git.

The Controller may retry a failed operational launch according to the runbook.
It must not answer semantic questions for the Subject, edit candidate artifacts,
suggest expected findings or repair a stage result.

### Flow Subject

The Subject is the harness/model/reasoning profile being evaluated. It receives
normal project and flow instructions. Its prompt must not disclose:

- that the work is an eval;
- the rubric or scoring weights;
- hidden expected results or review findings;
- the Judge profile;
- paths to hidden eval materials.

### Judge

The Judge evaluates only after the candidate run and all its child Sessions
have stopped. A Judge is read-only with respect to candidate artifacts.

It receives the applicable rubric, canonical expectations, candidate artifacts,
Session evidence and runtime metrics. It returns a schema-valid evaluation;
the Controller validates and renders it.

The Judge profile is independent of the Subject profile. A high-capability
model may judge a less expensive Subject model.

## Run selection

One Controller run accepts two independent selections:

```yaml
focused_stages:
  - specify
  - protocolize
  - plan
  - plan-review
e2e: true
```

- `focused_stages` may contain any subset of the four stages.
- `e2e` independently enables the complete chain.
- `all stages + e2e` is the full suite, not one shared Subject run.
- Each focused stage is materialized and executed independently.
- Focused runs execute sequentially by default so they do not distort the
  shared subagent capacity. Parallel execution requires isolated runtime pools.

## Priming and stage conditioning

There are reusable base priming Sessions, followed by stage-specific forks.
There is no claim that three permanent Session lines are sufficient by
themselves: every fork receives additional versioned instructions for its exact
stage and role.

### Controller priming

The Controller prime teaches:

- repository layout and case manifests;
- the operational runbook;
- materialization and compatibility checks;
- Session naming and identity capture;
- stop conditions and operational retry boundaries;
- evidence collection and Judge launch order;
- the prohibition on semantic assistance.

The concrete Controller run prompt supplies the case, selected stages, E2E
flag, Subject profile and Judge profile.

### Subject priming

A Subject base Session is created for each exact
`harness + model + reasoning + project checkpoint + priming prompt` identity.
It performs normal project priming and receives no hidden eval material.

Each focused stage forks that base Session and then receives a versioned
stage-specific Subject packet:

- the normal stage trigger;
- the materialized project and RUN paths;
- the accepted upstream handoff or original user discussion;
- normal flow instructions and stop condition;
- no rubric, oracle or eval terminology.

If a natural user conversation is needed before the trigger, the exact ordered
messages are part of the case fixture. Free-form Controller "warm-up" questions
are forbidden because they can leak hints and make runs incomparable.

An E2E Subject is another fork of the same base Session. It receives the
canonical discussion and normal start trigger, then follows the flow without
canonical intermediate results.

A native fork must preserve the Subject model, reasoning and harness profile.
Changing the model after a fork invalidates comparability. A different profile
gets its own base priming Session.

### Judge priming

A Judge base Session is created for each exact
`harness + model + reasoning + eval-definition commit + Judge prime` identity.
It learns:

- stage purposes and artifact contracts;
- hard, semantic and reference expectation classes;
- finding severity and evidence rules;
- semantic matching rather than text matching;
- treatment of new findings not present in the oracle;
- prioritization of material defects over formatting bureaucracy;
- the required evaluation-result schema;
- the read-only boundary.

Each stage evaluation forks this base Session and receives a versioned Judge
packet containing only that stage's case material. E2E evaluation uses a
separate fork and an E2E packet. Candidate results from one Judge fork never
enter another fork's inherited conversation.

## Canonical stage fixtures

Every isolated stage owns:

- input artifacts;
- hard invariants;
- semantic rubric;
- reference expectations;
- normal Subject launch messages;
- Judge packet template;
- expected terminal boundary.

### SPECIFY

Input:

- project checkpoint and primed Subject context;
- canonical user discussion and initial request.

Expected analysis covers:

- material gaps and only necessary questions;
- reasonable defaults where invention is unnecessary;
- separation of desired behavior from implementation decisions;
- preservation of all user facts;
- acceptance contract;
- a durable handoff sufficient for a fresh PROTOCOLIZE Session.

### PROTOCOLIZE

Input:

- canonical accepted SPECIFY result;
- corresponding project checkpoint and Memory Bank state.

Expected analysis covers:

- task scope and size;
- vertical slicing and number of protocols;
- feature/epic ownership and links;
- acceptance ownership;
- absence of premature detailed implementation planning;
- a durable handoff sufficient for a fresh PLAN Session.

### PLAN

Input:

- canonical protocol or PSET;
- related features, specifications, ADRs, scenarios and project state.

Expected analysis covers:

- relevant project grounding;
- applicability and handling of plan aspects;
- requirement and acceptance traceability;
- necessary architectural decisions;
- required feature/specification/ADR/scenario updates;
- executable CODE Work graph and dependencies;
- verification expected from each Work;
- sufficiency for code workers with clean context.

### PLAN-REVIEW

Input:

- a frozen PLAN revision 1 and all evidence required to review it;
- a hidden oracle of known findings;
- a reference corrected PLAN revision 2.

Each oracle finding records:

- stable finding ID;
- aspect and severity;
- affected location;
- defect and consequence;
- grounding evidence;
- acceptable semantic matches;
- expected correction direction;
- whether it is required or supplemental.

Expected analysis covers:

- weighted recall of required findings;
- false positives and low-value criticism;
- evidence and grounding quality;
- severity and prioritization;
- practicality of corrections;
- reviewer grouping, wave count and runtime cost;
- correctness of the orchestrator's finding decisions;
- correctness of the final plan correction.

A candidate finding absent from the oracle is not automatically false. The
Judge validates it on its merits and records a confirmed new finding separately
so the oracle can be amended in a later eval-definition version.

## E2E evaluation

The E2E Subject starts from the canonical discussion and produces all
intermediate artifacts itself. The Controller captures a checkpoint after each
stage without replacing it with canonical data.

The E2E Judge receives:

- SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW artifacts;
- lifecycle transitions and runtime reports;
- root and child Session evidence;
- the stage rubrics as guidance;
- canonical expectations marked as advisory rather than exact outputs.

It evaluates both stage quality and cross-stage behavior:

- information lost, changed or invented between stages;
- contradictions and scope drift;
- whether durable handoffs support fresh contexts;
- whether early defects are corrected or amplified;
- legal and efficient flow transitions;
- appropriate user interaction;
- appropriate subagent routing and grouping;
- final readiness for CODE.

Stage reference answers are strict inputs for isolated runs and diagnostic
guidance for E2E. A different but grounded E2E decision is not a failure merely
because it differs from the reference wording or decomposition.

## Evaluation classes

Every stage rubric separates three classes.

### Hard invariants

Mechanically or near-mechanically checkable conditions, including schema
validity, legal terminal boundary, forbidden product-code changes, required
artifact presence and complete applicable-aspect disposition.

### Semantic expectations

Weighted Judge criteria such as completeness, grounding, appropriate defaults,
decision quality, acceptance quality, practical execution and prioritization.

### Reference expectations

Expected questions, decisions, plan elements or findings used for semantic
comparison. They are not required verbatim answers unless separately declared
as a hard invariant.

The rubric, weights and severity mapping are versioned case inputs. Rescoring
an old candidate with a changed rubric creates a new evaluation result; it does
not overwrite the original judgment.

## Session and usage evidence

Every run report records:

- Controller Session ID;
- Subject base priming Session ID;
- Subject root Session ID and fork parent;
- every Subject subagent Session and agent ID;
- Judge base priming Session ID;
- Judge Session ID and fork parent;
- model, reasoning and harness for each role;
- transcript path, checksum and size when available;
- Work links, parent relationships and stage ownership;
- stage and total timing;
- token usage by unique Session and aggregate totals;
- observed subagent capacity and review waves.

Priming is measured once per base Session and reported separately. Its cost is
not repeatedly added to each fork's stage latency.

The Controller does not ask Subject or Judge agents to estimate usage. Usage is
collected from trusted harness/runtime evidence after all relevant agent turns
have stopped.

## Git identity and reproducibility

Eval definitions and results live in `dd-eval` Git history.

Before launch, the Controller records a clean definition checkpoint containing:

- `dd-eval` definition commit and optional annotated tag;
- case schema/version;
- `dd-tasks` checkpoint commit and tag;
- flow-pack version, commit and tag;
- engine version, commit and tag;
- harness profiles;
- checksums of source templates, rendered prompts, fixtures, rubrics and oracle.

Dirty source trees are not comparable. Experimental beta inputs still require
immutable commits and tags before launch.

After judgment, the result is committed separately and may receive an
`eval-run-<id>` annotated tag. The result manifest points back to the frozen
definition commit, not to the later result commit.

## Repository layout

Reuse the repository's current `cases`, `profiles`, `checkpoints` and `results`
concepts. Do not introduce a second top-level case catalog.

```text
specs/
  001-sdlc-eval-2026-summer.md

prompts/
  roles/
    controller-prime.md
    judge-prime.md

cases/<case-id>/
  case.json
  prompts/
    subject-prime.md
    subject-e2e.md
  stages/
    specify/
      input/
      expected/
      rubric.md
      subject.md
      judge.md
    protocolize/
    plan/
    plan-review/
  e2e/
    rubric.md
    judge.md
  results/<eval-run-id>/
    manifest.json
    prompts/
    sessions.json
    stages/
    e2e/
    report.json
    report.md
    report.html
```

`report.json` is the result SSOT. Markdown and HTML are deterministic renders.
The Controller must not manually maintain three semantic report copies.

Rendered prompts and compact candidate/Judge artifacts are committed with the
result. Raw transcripts may initially be stored as compressed evidence. If
repository growth later requires external artifact storage, Git still retains
Session IDs, checksums, sizes and immutable locators.

## Isolation boundary

Oracle, Judge prompts and hidden expectations must never be materialized into
the Subject repository, prompt or RUN workspace. The Subject starts with the
materialized project as its working scope and receives no `dd-eval` hidden
paths.

Full filesystem isolation is not required for the first Desktop implementation,
but the report records the actual permission profile. A future VM-backed
harness may enforce the same logical boundary physically without changing the
case contract.

## Required run report

The result manifest and report identify at minimum:

- eval run and case IDs;
- selected focused stages and E2E flag;
- definition, project, flow-pack and engine Git identities;
- Subject, Controller and Judge profiles;
- every base/fork/child Session ID;
- exact rendered prompts and checksums;
- artifacts and stage terminal states;
- per-stage and total time/usage;
- mechanical incidents and retries;
- stage scores and findings;
- E2E checkpoint and cross-stage assessment;
- confirmed new oracle candidates;
- final verdict.

## Acceptance

The first implementation of this specification is accepted when:

1. one case can select any focused-stage subset and independently enable E2E;
2. each focused stage starts from its canonical fixture in a fresh Subject fork;
3. Subject and Judge forks receive separate versioned stage packets;
4. the E2E Subject produces all intermediate checkpoints without canonical
   replacement;
5. the Controller launches Judges only after candidate Sessions stop;
6. stage and E2E Judge outputs validate against stable schemas;
7. every related Session ID and fork/parent relationship appears in the report;
8. the report records exact Git refs and prompt/fixture checksums;
9. `report.json` deterministically renders equivalent Markdown and HTML;
10. a completed result is committed without candidate oracle leakage;
11. rerunning the same definition/profile preserves comparable inputs;
12. a changed rubric, prompt, fixture, engine or flow pack is visible as a new
    versioned identity rather than silently changing an old result.

## Out of scope

- automatically generating a gold oracle from the candidate being judged;
- letting the Controller repair Subject output;
- exposing eval-specific instructions to the Subject;
- requiring exact textual equality with reference answers;
- parallel focused runs on a shared subagent pool;
- implementing a general cloud scheduler before the local Desktop suite works;
- retaining compatibility fallbacks for superseded case contracts.

## Carried runtime findings

The latest beta.51 run also exposed runtime defects that are intentionally not
solved by this eval-suite specification:

- completed capacity-probe Sessions can remain open and occupy reviewer slots;
- generated prompt/packet guidance can diverge from the actual artifact schema;
- `run.json` projections can remain stale after an accepted stage transition;
- usage output does not clearly separate unique Sessions from Work-session
  measurements.

They remain follow-up engine/flow work and must be visible as run incidents
until fixed.
