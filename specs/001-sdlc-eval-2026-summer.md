---
file: 'specs/001-sdlc-eval-2026-summer.md'
description: 'Versioned focused-stage, contiguous-segment and end-to-end SDLC evaluation suite with canonical stage-entry checkpoints, independent scoring and reproducible run evidence.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
---

# 001 — SDLC Eval 2026 Summer

## Goal

Evaluate AI agents at two complementary levels:

1. focus on `SPECIFY`, `PROTOCOLIZE`, `PLAN` and `PLAN-REVIEW` so each stage can
   be compared from the same canonical project, RUN and Session boundary;
2. run the complete chain to measure information preservation, handoff quality
   and cumulative behavior across the same stage checkpoints.

The suite must support focused comparison of harness/model profiles without
turning the evaluated agent's prompt into an eval-specific instruction. Every
result must identify the exact Git state, prompts, checkpoint, runtime and Session
tree that produced it.

## Why both forms are required

An end-to-end run alone cannot identify whether a weak PLAN was caused by PLAN,
by a poor SPECIFY result, or by information lost during handoff. A focused
stage run alone cannot show whether a model preserves its own decisions across
the whole flow.

Focused runs therefore fork the current starter Subject Session and restore the
exact canonical project/RUN state immediately before the selected stage. They do not
reconstruct that state from portable semantic fixtures. The end-to-end run
starts from the canonical SPECIFY-entry checkpoint and produces its own result
at every later boundary.

```text
canonical chain
  ├─ checkpoint: specify-entry ───────→ focused SPECIFY
  ├─ checkpoint: protocolize-entry ───→ focused PROTOCOLIZE
  ├─ checkpoint: plan-entry ──────────→ focused PLAN
  └─ checkpoint: plan-review-entry ───→ focused PLAN-REVIEW

checkpoint: plan-entry
  └─ segment: PLAN → PLAN-REVIEW

checkpoint: specify-entry
  └─ E2E: SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW
```

The canonical PLAN at `plan-review-entry` is an accepted review input, not a
claim that the plan is correct. It intentionally contains a known, documented
set of reviewable defects. The full checkpoint also preserves its real RUN and
Session context.

The detailed checkpoint and execution contract is
[specification 002](002-canonical-stage-checkpoint-evaluation.md), which
supersedes the portable stage-fixture mechanism previously described here.

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
agent and stage-owned Work has completed or failed, no child Work is active,
and the stage has reached its expected boundary. The root coordinator Work and
provider Session may remain resumable at a focused or segment boundary; they
must have no active agent turn or stale Work-session binding. Session deletion
or artificial closure is not required. A Judge is read-only with respect to
candidate artifacts.

It receives the applicable rubric, canonical expectations, candidate artifacts,
Session evidence and runtime metrics. It returns a schema-valid evaluation;
the Controller validates and renders it.

The Judge profile is independent of the Subject profile. A high-capability
model may judge a less expensive Subject model.

## Run selection

One Controller run accepts focused-stage and E2E selections. A contiguous
segment is prepared separately so its single Subject continuation is explicit:

```yaml
focus:
  - specify
  - protocolize
  - plan
  - plan-review
e2e: true

segment: plan..plan-review
```

- `focus` may contain any subset of the four stages; every item is independent.
- `segment` names one inclusive contiguous range and starts from only the first
  stage's canonical entry checkpoint.
- `e2e` independently enables the complete chain.
- `all stages + e2e` is the full suite, not one shared Subject run.
- Each focused stage is restored and executed independently.
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

There is one run-local Controller Session and a reusable Judge priming Session.
The current Desktop Controller is not a canonical fork parent: it reads the
versioned Controller packet and runbook in its real task, and the run report
records its actual Session ID and model profile. Subject focused and segment
attempts fork the current untouched starter Session stored for the selected
stage entry, not the frozen canonical checkpoint Session, moving
canonical-chain Session or one generic Subject base Session.

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

For the initial suite the Controller is `gpt-5.6-terra` with `high` reasoning.
No reusable Controller baseline Session is created. Add one only if a later
eval explicitly measures Controller behavior or needs comparable Controller
forks across runs.

### Subject priming

A canonical Subject chain is created for each exact
`harness + project checkpoint + engine + flow pack + canonical prompt sequence`
identity. It performs normal project priming and user discussion, then produces
one accepted Session/RUN/project checkpoint at every stage entry. At each
boundary the Controller immediately creates an idle child fork of the current
canonical-chain Session. That child receives no prompt and never advances; it
is the frozen checkpoint Session. The original canonical-chain Session
continues to the next stage.

Each focused stage forks its own checkpoint Session and receives only the
generated ordinary continuation packet: restored project/RUN paths, the normal
stage trigger and the harness-owned stop boundary. The upstream handoff is
already present in the forked conversation and restored RUN. No rubric, oracle
or eval terminology is included.

If a natural user conversation is needed before the trigger, the exact ordered
messages are part of the case definition. Free-form Controller "warm-up" questions
are forbidden because they can leak hints and make runs incomparable.

An E2E Subject forks `specify-entry`, receives the normal start trigger, and
follows the flow without canonical intermediate results.

A native fork must execute the explicitly selected Subject model, reasoning and
harness profile. A profile different from the canonical-chain producer is
allowed and is the point of focused model comparison; both profiles are
recorded. An unrequested change or silent fallback invalidates comparability.

The case records `session_seed_mode`:

- `native_fork` uses the harness fork primitive and preserves the exact base
  context;
- `portable_replay` starts a fresh Session and replays the exact versioned
  priming message sequence when the harness cannot fork.

The two modes are reported separately. A replay run must not be labelled as a
native fork or compared as equivalent for cache, latency or context-retention
metrics.

Before any attempt, the Controller verifies the selected stage-entry checkpoint
and resolves the current starter registry: checkpoint identity, starter
Session, canonical producer profile, effective attempt profile,
definition/project/runtime identities, ordered message hashes and archive
checksums. Canonical-chain priming quality
and cost are reported separately and are not repeatedly added to focused-stage
latency.

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

Active cases use one contract, `dd-eval/case@3`. The runtime must not interpret
`case@2`, `stage-fixture@1` or the old `tracks` shape as a fallback. Existing
historical results remain immutable evidence, while active cases are migrated
before this suite can run.

The case manifest contains only configuration needed to reproduce the suite:

- schema, suite, case and definition-version IDs;
- immutable project checkpoint and exact flow-pack/engine identities;
- allowed/default Controller, Subject and Judge profiles;
- one entry per stage with canonical stage-entry checkpoint, interaction script,
  Subject packet, Judge packet, rubric, oracle and allowed terminal boundary;
- the E2E packet, checkpoints, interaction script and terminal boundary;
- pinned flow settings: handoff mode, plan-review mode and capacity policy;
- result thresholds and paths relative to the case directory.

The first CLI surface is deliberately small:

```sh
dd-eval prepare \
  --case sdlc-eval-2026-summer-task-priority \
  --focus specify,protocolize,plan,plan-review \
  --e2e \
  --controller-profile <id> \
  --subject-profile <id> \
  --judge-profile <id> \
  --output <outside-dd-eval-path>
```

`--focus` is a comma-separated subset and `--e2e` is an independent boolean
flag. `--segment <start>..<end>` prepares one contiguous chain separately. At
least one focused stage, one segment or `--e2e` is required. A separate `--suite`
selector is unnecessary because `case.json` already names its suite. `prepare`
validates every referenced file and compatibility identity before creating any
candidate workspace; unknown keys, missing files and mismatched identities fail
closed.

## Canonical stage-entry checkpoints

Every focused stage owns:

- input artifacts;
- hard invariants;
- semantic rubric;
- reference expectations;
- normal Subject launch messages;
- Judge packet template;
- expected terminal boundary.

An upstream semantic document by itself is not a runnable checkpoint.
PROTOCOLIZE, PLAN and PLAN-REVIEW also require their real flow state, RUN
variables, durable Memory Bank files, project tree and conversation context.

Each stage therefore references a stage-checkpoint record pairing:

- an immutable project boundary commit/archive;
- an engine-owned snapshot of the exact RUN at the stage entry;
- the moving canonical-chain Subject Session ID, optional completed source turn
  evidence and the separate frozen checkpoint Subject Session created from
  that boundary;
- the target stage, graph entry, handoff mode and compatibility identities;
- hashes of predecessor receipts, RUN variables and prompts;
- clean-boundary evidence and human acceptance.

`dd-flow run snapshot create/restore` owns runtime capture, path rebasing and
stale-binding removal. `dd-eval` owns project restore, checkpoint selection,
Subject forking instructions and attempt evidence. Neither an agent nor
`dd-eval` edits SQLite. The complete contract and required commands are in
[specification 002](002-canonical-stage-checkpoint-evaluation.md).

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

The SPECIFY case is intentionally interactive when its checkpoint discussion declares
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

Canonical stage-entry checkpoints are immutable inputs for focused stages.
Reference answers remain semantic comparison material rather than exact-output
contracts in both focused and E2E judgments. A different but grounded E2E
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
  `controller` or `checkpoint`;
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

The initial `task-priority` case is not ready until its four canonical
stage-entry checkpoints and accepted oracles have been created and reviewed. A
candidate run must never be used to generate the oracle that scores itself.

## Session and usage evidence

Every run report records:

- Controller Session ID;
- canonical-chain Subject Session ID and optional source turn evidence in the
  checkpoint definition;
- frozen checkpoint Subject Session ID in the checkpoint definition;
- current starter Session ID and evaluated Subject child Session ID in the
  attempt evidence;
- every Subject subagent Session and agent ID;
- Judge base priming Session ID;
- Judge Session ID and fork parent;
- model, reasoning and harness for each role;
- transcript path, checksum and size when available;
- Work links, parent relationships and stage ownership;
- stage and total timing;
- token usage by unique Session and aggregate totals;
- observed subagent capacity and review waves.

Canonical-chain priming is measured once and reported separately. Its cost is
not repeatedly added to each checkpoint fork's stage latency. Judge priming is
likewise measured once per Judge base Session.

The Controller does not ask Subject or Judge agents to estimate usage. Usage is
collected from trusted harness/runtime evidence after all relevant agent turns
have stopped.

Usage is reported in separate, non-overlapping groups:

- Controller;
- canonical Subject-chain priming;
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

- `prepare` restores the selected stage-entry project/RUN checkpoint, creates
  the immutable manifest, initial `state.json` and independent execution
  workspaces, then returns the exact Subject fork action.
- `session add` records a harness-provided Controller, starter parent,
  evaluated Subject or Judge
  Session ID and optional parent ID. Subject child Sessions are reconciled from
  trusted `dd-flow stat run sessions ls` output rather than copied by hand.
- `sync` reads trusted flow state after a Subject task returns. It records a
  declared pause or terminal boundary and returns the next legal Controller
  action, including the exact interaction-script message when applicable. It
  does not send a message or make a semantic decision.
- `checkpoint --stage` reads the selected project and flow RUN, validates the expected
  boundary, copies the case-declared compact artifacts, calculates checksums and
  writes immutable `candidate.json` evidence. It is the required barrier
  between segment/E2E stages as well as the focused-stage stop boundary.
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
  --stage <finished-stage>
dd-eval judge prepare --eval <prepared-dir> --execution <id> [--stage <stage>]
dd-eval judge accept --eval <prepared-dir> --execution <id> \
  [--stage <stage>] --result <judge-result.json>
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
- checksums of source templates, rendered prompts, checkpoints, rubrics and oracle.

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
  case.v3.schema.json
  stage-checkpoint.v1.schema.json
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
  checkpoints/
    specify-entry.json
    protocolize-entry.json
    plan-entry.json
    plan-review-entry.json
  baselines/
    judge-<profile>.json
  prompts/
    subject-prime.md
    subject-e2e.md
  stages/
    specify/
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

- `dd-eval` owns case schemas, checkpoint records, role/stage packets, preparation,
  Controller lifecycle, Judge packets, scoring and reports;
- `dd-flow-cli` owns exact selected-RUN snapshot capture/restore and trusted
  flow Session/usage queries;
- the beta flow pack owns ordinary stage prompts, artifacts and legal
  transitions; it must contain no eval-specific wording;
- the canonical `dd-memorybank` is unchanged until the beta flow has been
  validated and intentionally promoted.

Implementation migrates the active case manifest and CLI/tests to
`dd-eval/case@3`, then removes the old runtime branches. Historical case/result
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
- every checkpoint-parent/fork/child Subject Session ID and every Judge
  base/fork/child Session ID;
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
   `dd-eval/case@3`; the CLI has no executable `case@2`, fixture or `tracks`
   fallback;
2. any focused-stage subset and E2E can be selected independently;
3. checkpoint snapshot restore reconstructs the exact accepted RUN/project
   boundary at each target entry under new paths without stale active bindings;
4. each focused stage starts from its canonical entry checkpoint in a fresh Subject fork
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
13. the report records exact Git identities and prompt, checkpoint, rubric and
   oracle checksums;
14. `report.json` deterministically renders equivalent Markdown and HTML;
15. a completed compact result is committed without definition changes, raw
    transcripts, runtime databases or candidate oracle leakage;
16. the first case's canonical checkpoints and oracles are independently reviewed,
   human-accepted and immutable before they score a Subject;
17. rerunning the same definition/profile preserves comparable inputs, while a
    changed rubric, packet, checkpoint, engine or flow pack has a new visible
   identity;
18. current CLI tests cover preparation, checkpoint mismatch, interaction pauses,
    immutable checkpoints, attempts, Judge validation, unique-Session usage,
    deterministic scoring/rendering and safe finalization.

## Implementation order

Implement the smallest vertical slices that can be verified independently:

1. add the schemas, migrate the one active suite case to `case@3`, update
   validation/selectors and delete executable fixture/old-contract branches;
2. add and test selected-RUN snapshot capture/restore in `dd-flow-cli`;
3. implement preparation, Controller state, checkpointing, Judge acceptance,
   scoring/rendering and finalization in `dd-eval`;
4. author and human-accept the task-priority prompts, checkpoints, interaction
   scripts, rubrics and oracles;
5. run one focused smoke per stage, one segment smoke and one E2E smoke, freeze the definition
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
