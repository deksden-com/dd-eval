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
7. waits until the Subject task is idle and every child agent and flow Work is
   settled;
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

The Judge evaluates only after the candidate task has returned, every child
agent has completed or failed, no candidate Work is `created` or `running`, and
the stage has reached its expected boundary. A provider Session may remain
resumable; Session deletion or artificial closure is not required. A Judge is
read-only with respect to candidate artifacts.

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

For this suite, `e2e` means the pre-CODE planning contour:

```text
SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → plan_review_accepted
```

CODE must remain unstarted. A future implementation eval is a separate suite
boundary rather than an implicit extension of this flag.

Each case pins the flow conditions that affect comparability:

- `handoff_mode`: `same_session` or `new_session`;
- `plan_review_mode`: `off`, `standard` or `deep`;
- capacity-probe policy; observed capacity is result evidence, not input;
- expected user-interaction script;
- allowed stage outcomes and exact stop boundary.

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

The case records `session_seed_mode`:

- `native_fork` uses the harness fork primitive and preserves the exact base
  context;
- `portable_replay` starts a fresh Session and replays the exact versioned
  priming message sequence when the harness cannot fork.

The two modes are reported separately. A replay run must not be labelled as a
native fork or compared as equivalent for cache, latency or context-retention
metrics.

Before any child run, the Controller records a priming checkpoint with the base
Session ID, effective harness/model/reasoning, definition and project commits,
ordered message hashes, fork point, elapsed time and usage. A model/profile
mismatch or incomplete priming sequence invalidates every fork from that base.
Priming quality is a separately reported diagnostic: applicable entry points
read, unnecessary broad reads, errors and readiness for the stage packet. Its
cost is never hidden inside or repeatedly added to focused-stage latency.

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

Judge priming reads only the shared methodology, schemas and navigation needed
to evaluate a packet. It must not read historical candidate results, stage
oracles or prior judgments. Those are supplied after the fork for the selected
case only. This prevents prior candidates from biasing the reusable base
context.

### Prompt sequences

A prompt is an ordered message sequence, not an informal collection of files.
Every Subject and Judge packet manifest records each message role, source path,
SHA-256 and order. The Controller sends exactly that sequence and stores the
rendered messages it actually sent. Free-form preambles, summaries and
Controller-authored follow-up instructions invalidate prompt comparability.

## Case contract and selection

Active cases use one contract, `dd-eval/case@2`. The runtime must not interpret
the old `tracks` shape as a fallback. Existing historical results remain
immutable evidence, while active cases are migrated before this suite can run.

The case manifest contains only configuration needed to reproduce the suite:

- schema, suite, case and definition-version IDs;
- immutable project checkpoint and exact flow-pack/engine identities;
- allowed/default Controller, Subject and Judge profiles;
- one entry per stage with fixture, interaction script, Subject packet, Judge
  packet, rubric, oracle and allowed terminal boundary;
- the E2E packet, checkpoints, interaction script and terminal boundary;
- pinned flow settings: handoff mode, plan-review mode and capacity policy;
- result thresholds and paths relative to the case directory.

The first CLI surface is deliberately small:

```sh
dd-eval prepare \
  --case sdlc-eval-2026-summer-task-priority \
  --stages specify,protocolize,plan,plan-review \
  --e2e \
  --controller-profile <id> \
  --subject-profile <id> \
  --judge-profile <id> \
  --output <outside-dd-eval-path>
```

`--stages` is a comma-separated subset and `--e2e` is an independent boolean
flag. At least one focused stage or `--e2e` is required. A separate `--suite`
selector is unnecessary because `case.json` already names its suite. `prepare`
validates every referenced file and compatibility identity before creating any
candidate workspace; unknown keys, missing files and mismatched identities fail
closed.

## Canonical stage fixtures

Every isolated stage owns:

- input artifacts;
- hard invariants;
- semantic rubric;
- reference expectations;
- normal Subject launch messages;
- Judge packet template;
- expected terminal boundary.

### Portable stage-fixture contract

An upstream semantic document by itself is not a runnable stage fixture.
PROTOCOLIZE, PLAN and PLAN-REVIEW also require a legal flow state, RUN
variables, durable Memory Bank files and the correct project tree. The suite
therefore uses `dd-eval/stage-fixture@1`.

A fixture contains no SQLite database and no absolute path, Session, provider,
usage or timestamp identity. It records:

- suite, case, fixture and target-stage IDs;
- immutable base checkpoint;
- visible project-file overlay and checksums;
- portable upstream semantic results and durable artifacts;
- completed predecessor stages and accepted outcomes;
- flow kind, subject and required RUN variables;
- pinned handoff/review/capacity settings;
- target graph entry and expected start boundary;
- fixture schema and content checksum.

Fixture input visible to the Subject is separate from hidden expected/oracle
material. Applying the visible overlay and initializing runtime state produces
one deterministic `eval-input` commit.

The engine, not `dd-eval` and not an agent, owns runtime materialization through
an operator-only portable boundary:

```sh
dd-flow run fixture export <run-id> \
  --after-stage <stage> \
  --project-root <canonical-project> \
  --output <fixture.json>

dd-flow run fixture import \
  --fixture <fixture.json> \
  --project-root <prepared-project> \
  --json
```

`export` captures an accepted canonical RUN boundary while excluding Sessions,
Works, usage and machine paths. `import` validates the fixture and selected
engine/flow pack, registers the materialized project root, allocates a fresh
RUN, rebuilds only the predecessor state required by the target entry, marks
that history as `canonical_fixture`, and leaves the target stage unstarted.
Imported history must never claim that an evaluated agent performed it.

`import --json` returns the new RUN ID, runtime workspace, target stage and
validated graph entry. `dd-eval prepare` stores that receipt and uses those
returned values; it does not rediscover or infer them from paths.

The importer is idempotent for one prepared execution and fails closed on a
path, engine, flow-pack, artifact or checksum mismatch. `dd-eval` must never
write `dd-flow` SQLite tables directly or copy an old `DD_FLOW_HOME` containing
absolute roots and stale Session identity.

Fixture export/import is the only required new engine surface for isolated
stages. It is not a general RUN backup framework.

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

The SPECIFY case is intentionally interactive when its fixture declares
material gaps. The Subject first reaches `waiting_for_user` with its questions.
The Controller then delivers the case's exact canonical clarification packet,
resumes the same stage and lets it produce the final SPECIFY result. Every
Subject receives identical clarification bytes regardless of how its questions
were worded.

The interaction script declares the allowed pause count, fixed answer material
and resume boundary. A premature `specified` result is scored without receiving
facts it failed to request. An unexpected additional pause after the canonical
packet ends that candidate as `unexpected_user_dependency`; the Controller does
not invent another answer.

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

### User interaction outside SPECIFY

Every stage and E2E case has an interaction script, even when it is empty. A
declared pause receives only its pre-authored response. An undeclared pause ends
the current candidate at that checkpoint and is judged as candidate behavior;
it does not authorize the Controller to make a product or planning decision.

The same stage that asked the question resumes after the answer. HITL never
completes the stage, rewinds to a predecessor stage or creates a replacement
Session unless the pinned handoff mode requires a new Session.

## E2E evaluation

The E2E Subject starts from the canonical discussion and produces all
intermediate artifacts itself. The Controller captures a checkpoint after each
stage without replacing it with canonical data.

The next stage may not start until that checkpoint is captured. The harness may
resume the same Session or launch the configured fresh Session afterward. This
short orchestration boundary is required because later stages can mutate
durable artifacts: PLAN-REVIEW must not erase the PLAN revision 1 that is being
evaluated.

Each immutable checkpoint preserves the stage semantic result, report,
generated/durable documents, checksums, Work results and lifecycle facts that
exist at that boundary. PLAN-REVIEW additionally preserves reviewer results,
the reviewed PLAN revision 1, the finding decision and corrected PLAN revision
2. Copying artifacts only after E2E finishes is invalid evidence.

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

Canonical predecessor fixtures are immutable inputs for isolated stages.
Reference answers remain semantic comparison material rather than exact-output
contracts in both isolated and E2E judgments. A different but grounded E2E
decision is not a failure merely because it differs from the reference wording
or decomposition.

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

### Judge result contract

Every Judge returns `dd-eval/judge-result@1` with:

- candidate and Judge attempt identities;
- `run_validity`: `valid`, `invalid_infrastructure_flow` or `contaminated`;
- every hard invariant as `pass`, `fail` or `not_applicable` with evidence;
- every semantic criterion as `pass`, `partial`, `fail` or `not_applicable`
  with evidence and concise rationale;
- expected-finding matches as `found`, `partial` or `missed`;
- confirmed/rejected new findings;
- `context_misses` observed in the transcript;
- efficiency and observability findings that do not silently lower semantic
  quality;
- owner for every finding: `subject`, `flow`, `engine`, `harness`,
  `controller` or `fixture`;
- severity: `critical`, `high`, `medium` or `low`;
- score vector, deterministic aggregate inputs and final verdict.

The Judge does not choose scoring weights. The versioned rubric and oracle own
criterion/finding weights and essential flags. `dd-eval` calculates the numeric
aggregate from Judge classifications:

```text
pass = 1
partial = 0.5
fail = 0
score = weighted applicable points / weighted applicable maximum
```

An invalid or contaminated candidate has no model-quality score. An essential
failure or missed oracle finding explicitly marked fatal forces `fail`
regardless of percentage. Otherwise the common default is:

- `pass`: score at least 0.85;
- `pass_with_findings`: score at least 0.70;
- `fail`: score below 0.70.

A stage rubric may tighten these thresholds but may not hide its rule in the
Judge prompt. Reports always preserve the vector so one aggregate cannot hide
a material failure.

### Oracle governance

An oracle is authored before candidate comparison through deep independent
review, deduplication and human acceptance. It records its authoring Session
IDs, source artifacts, model profiles, accepted finding set, reference
correction and definition commit. Only `accepted` oracle versions may score a
candidate.

Finding IDs and old oracle versions are immutable. A Judge-confirmed new
finding is an oracle candidate, not an automatic mutation. Accepting it creates
a new eval-definition commit and oracle version. Rescoring an old candidate
against that version creates a new Judge attempt linked to the same immutable
candidate evidence.

The initial `task-priority` case is not ready until its canonical SPECIFY,
PROTOCOLIZE, PLAN and PLAN-REVIEW fixtures and accepted oracles have been
created and reviewed. A candidate run must never be used to generate the oracle
that scores itself.

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

Usage is reported in separate, non-overlapping groups:

- Controller;
- Subject base priming;
- Subject focused-stage or E2E root work;
- Subject child/reviewer agents, including capacity-probe overhead separately;
- Judge base priming;
- Judge candidate evaluation and any Judge children.

The primary Subject score never includes Controller or Judge cost. Aggregate
usage deduplicates physical provider Sessions; several Work links to one
Session do not create several copies of its tokens. Work/stage attribution is a
view over unique Session deltas, not a second total.

Native-fork input/cache tokens emitted by the fork are real execution cost and
remain visible. The already completed base-priming total is recorded once.
Input, cache read, cache write, uncached input, output and reasoning output are
kept as separate counters; an unavailable provider field remains unavailable.

Timing distinguishes materialization, priming, active stage work, scripted HITL
wait, capacity probe, reviewer waves, Judge work and total controller wall
clock. Stage quality latency uses lifecycle timestamps and reports scripted
human-wait time separately rather than silently including or discarding it.

Runs with different observed delegated capacity remain valid but are compared
in separate capacity cohorts. An expected review grouping is parameterized by
the observed capacity rather than hard-coded to one machine's pool size.

## Controller lifecycle

The Controller uses commands instead of hand-editing result JSON:

```text
dd-eval prepare
dd-eval session add
dd-eval sync
dd-eval checkpoint
dd-eval judge prepare
dd-eval judge accept
dd-eval finalize
```

- `prepare` creates the immutable manifest, initial `state.json` and independent
  execution workspaces.
- `session add` records a harness-provided Controller, base, root or Judge
  Session ID and optional parent ID. Subject child Sessions are reconciled from
  trusted `dd-flow stat run sessions ls` output rather than copied by hand.
- `sync` reads trusted flow state after a Subject task returns. It records a
  declared pause or terminal boundary and returns the next legal Controller
  action, including the exact interaction-script message when applicable. It
  does not send a message or make a semantic decision.
- `checkpoint` reads the selected project and flow RUN, validates the expected
  boundary, copies the case-declared compact artifacts, calculates checksums and
  writes immutable `candidate.json` evidence. It is also the required E2E
  barrier between stages.
- `judge prepare` renders the read-only packet from the candidate, rubric,
  oracle and normalized evidence.
- `judge accept` schema-validates one Judge response and stores it unchanged.
- `finalize` reconciles Sessions and usage, calculates scores, writes
  `report.json`, renders Markdown/HTML and marks the result ready to commit.

All commands take the prepared result directory explicitly and return JSON with
the new state and the one next legal operator action. They are atomic and
idempotent for the same inputs. A repeated call with different content fails
instead of overwriting evidence.

The common command shape is explicit rather than a JSON argument:

```sh
dd-eval session add --eval <prepared-dir> --execution <id> \
  --role <role> --session-id <id> [--parent-session-id <id>]
dd-eval sync --eval <prepared-dir> --execution <id> \
  --project-root <path> --flow-run <id>
dd-eval checkpoint --eval <prepared-dir> --execution <id> \
  --project-root <path> --flow-run <id>
dd-eval judge prepare --eval <prepared-dir> --execution <id>
dd-eval judge accept --eval <prepared-dir> --execution <id> \
  --result <judge-result.json>
dd-eval finalize --eval <prepared-dir>
```

`state.json` uses only these Controller states:

```text
run:       prepared | running | judging | completed | invalid | cancelled
execution: prepared | running | waiting_for_user | candidate_ready |
           judging | completed | invalid | failed
```

`waiting_for_user` is a pause of the same Subject execution, not a completed
stage. The interaction script determines the exact response and resume action.
The Controller records lifecycle state; flow stage/Work truth remains owned by
`dd-flow` and is referenced rather than duplicated as editable state.

Session titles are deterministic operator indexes:

```text
S26 · <case> · <execution> · <role> · <model>-<reasoning> · aNN
```

The title never substitutes for the provider Session ID. `aNN` is the
operational attempt.

### Attempts and retries

- A launch that fails before the Subject performs its first action may be
  retried in the same operational attempt.
- After the Subject's first action, a retry creates a new attempt and preserves
  the prior workspace, Session IDs, incidents and partial evidence.
- An invalid Judge response creates a new Judge attempt; it never replaces the
  prior response and never requires rerunning the Subject.
- Invalid, failed and cancelled attempts remain available for operational
  analysis but receive no model-quality score.
- The Controller never edits a candidate or Judge response to make it valid.

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

Preparation writes candidate workspaces and provisional evidence outside the
`dd-eval` checkout. Finalization copies only the validated compact result into
`cases/<case>/results/<eval-run-id>/`, verifies that no definition path changed,
then the Controller commits and pushes that result. A dirty definition checkout
or an existing result ID fails closed; the Controller never sweeps unrelated
files into the commit.

Raw provider transcripts and runtime databases are not committed to Git. They
remain in one immutable external archive after secret scanning/redaction. Git
stores their Session IDs, original and retained checksums, sizes and immutable
archive locators together with compact normalized evidence. This preserves
forensic reachability without turning the repository into a transcript store.

## Repository layout

Reuse the repository's current `cases`, `profiles`, `checkpoints` and `results`
concepts. Do not introduce a second top-level case catalog.

```text
specs/
  001-sdlc-eval-2026-summer.md

schemas/
  case.v2.schema.json
  stage-fixture.v1.schema.json
  interaction-script.v1.schema.json
  run-manifest.v1.schema.json
  run-state.v1.schema.json
  candidate.v1.schema.json
  judge-result.v1.schema.json
  report.v1.schema.json

prompts/
  roles/
    controller-prime.md
    judge-prime.md

cases/sdlc-eval-2026-summer-task-priority/
  case.json
  baselines/
    subject-<profile>.json
    judge-<profile>.json
  prompts/
    subject-prime.md
    subject-e2e.md
  stages/
    specify/
      fixture.json
      input/
      expected/
      interactions.json
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
    state.json
    prompts/
    sessions.json
    stages/
    e2e/
    report.json
    report.md
    report.html
```

The first implementation has one case:
`sdlc-eval-2026-summer-task-priority`. The suite ID remains a field in its
manifest so another case can join the suite later without adding a second case
catalog or suite service.

Truth is deliberately small and separated by ownership:

- `manifest.json` (`dd-eval/run-manifest@1`) is the immutable
  input/configuration truth;
- `state.json` (`dd-eval/run-state@1`) is the atomically written Controller
  lifecycle state;
- each `candidate.json` (`dd-eval/candidate@1`) is collected candidate evidence;
- each `evaluation.json` is the immutable `dd-eval/judge-result@1` response;
- `report.json` (`dd-eval/report@1`) is the deterministic aggregate of those
  sources.

Markdown and HTML are deterministic renders of `report.json`. The Controller
must not manually maintain semantic copies in JSON, Markdown and HTML.

Rendered prompts and compact candidate/Judge artifacts are committed with the
result. Raw transcript and database retention follows the external-archive rule
above.

## Isolation boundary

Oracle, Judge prompts and hidden expectations must never be materialized into
the Subject repository, prompt or RUN workspace. The Subject starts with the
materialized project as its working scope and receives no `dd-eval` hidden
paths.

Full filesystem isolation is not required for the first Desktop implementation,
but the report records the actual permission profile. A future VM-backed
harness may enforce the same logical boundary physically without changing the
case contract.

## Ownership and migration

The implementation changes only the component that owns each fact:

- `dd-eval` owns case schemas, fixtures, role/stage packets, preparation,
  Controller lifecycle, Judge packets, scoring and reports;
- `dd-flow-cli` owns portable RUN fixture export/import and trusted flow
  Session/usage queries;
- the beta flow pack owns ordinary stage prompts, artifacts and legal
  transitions; it must contain no eval-specific wording;
- the canonical `dd-memorybank` is unchanged until the beta flow has been
  validated and intentionally promoted.

Implementation migrates active case manifests and CLI/tests from `tracks` to
`dd-eval/case@2`, then removes the old runtime branch. Historical case/result
files remain readable as files but are not accepted as executable definitions.
README and active runbooks must describe
`SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW`, the new selectors and the external
transcript archive. No adapter, compatibility mode or duplicate suite registry
is added.

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

1. the first task-priority case and all active cases validate as
   `dd-eval/case@2`; the CLI has no executable `tracks` fallback;
2. any focused-stage subset and E2E can be selected independently;
3. fixture export/import reconstructs a legal fresh RUN at each target entry
   without copying SQLite, machine identity or fake agent history;
4. each focused stage starts from its canonical fixture in a fresh Subject fork
   or explicitly reported portable replay with an exact packet sequence;
5. scripted HITL delivers the exact response, resumes the same stage and treats
   undeclared pauses or premature completion as candidate behavior;
6. Subject and Judge forks receive separate versioned packets without oracle
   leakage or free-form Controller hints;
7. every E2E stage is immutably checkpointed before its successor starts, and
   the chain stops at `plan_review_accepted` without starting CODE;
8. the Controller launches a Judge only when the Subject task is idle, children
   and Works are settled, and the expected candidate boundary is captured;
9. stage and E2E Judge outputs validate against stable schemas and deterministic
   scoring reproduces their score vectors and verdicts;
10. invalid launches and Judge responses preserve attempts rather than
    overwriting evidence or triggering Controller repair;
11. every related Session/agent ID and known fork/parent relationship appears in
    the report, with usage deduplicated by physical Session;
12. timing separates materialization, priming, active work, scripted wait,
    probes, review waves and judging;
13. the report records exact Git identities and prompt, fixture, rubric and
    oracle checksums;
14. `report.json` deterministically renders equivalent Markdown and HTML;
15. a completed compact result is committed without definition changes, raw
    transcripts, runtime databases or candidate oracle leakage;
16. the first case's canonical fixtures and oracles are independently reviewed,
    human-accepted and immutable before they score a Subject;
17. rerunning the same definition/profile preserves comparable inputs, while a
    changed rubric, packet, fixture, engine or flow pack has a new visible
    identity;
18. current CLI tests cover preparation, fixture mismatch, interaction pauses,
    immutable checkpoints, attempts, Judge validation, unique-Session usage,
    deterministic scoring/rendering and safe finalization.

## Implementation order

Implement the smallest vertical slices that can be verified independently:

1. add the schemas, migrate the one active suite case to `case@2`, update
   validation/selectors and delete the executable `tracks` branch;
2. add and test portable fixture export/import in `dd-flow-cli`;
3. implement preparation, Controller state, checkpointing, Judge acceptance,
   scoring/rendering and finalization in `dd-eval`;
4. author and human-accept the task-priority prompts, fixtures, interaction
   scripts, rubrics and oracles;
5. run one isolated smoke per stage, then one E2E smoke, freeze the definition
   commit/tag and only then compare additional Subject profiles.

Do not build a daemon, web UI, generic scheduler, artifact service or database
for this milestone. The filesystem contracts, existing Desktop harness and
`dd-flow` runtime are sufficient.

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
