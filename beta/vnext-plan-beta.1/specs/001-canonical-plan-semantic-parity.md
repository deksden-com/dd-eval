---
file: 'beta/vnext-plan-beta.1/specs/001-canonical-plan-semantic-parity.md'
description: 'Semantic process and artifact contract for canonical-quality PLAN on the vNext flow.'
status: 'DRAFT'
---

# 001 — Canonical PLAN semantic parity

## Goal

PLAN turns accepted user behavior and executable protocols into a grounded,
self-contained implementation design and a concrete CODE Work graph. It keeps
the useful semantic scope of canonical reflection, implementation, operations,
scenarios and review without repeating their multi-file execution ceremony.

The stage must be usable by a fresh Session and must not rely on the earlier
discussion, private model reasoning or planning-session memory.

## Entry and correction boundary

PLAN starts from:

- the accepted SPECIFY result and request-level acceptance;
- the selected PRT or PSET and every member PRT;
- linked epic, feature, spec, ADR and scenario documents;
- project product, system, engineering, verification and operations indexes;
- the resolved RUN policy and current runtime facts;
- plan/aspect contracts and exact CLI completion commands.

An upstream omission does not normally restart SPECIFY or PROTOCOLIZE. PLAN
repairs the owning artifact in the current RUN, records the revised input and
replans only affected Work:

- a clear missing fact receives the safest project-compatible default;
- an implementation uncertainty receives bounded grounding or research;
- incorrect PRT/PSET boundaries or dependencies are corrected in their owning
  documents;
- an incomplete requirement or acceptance row is amended from established
  user/project facts;
- a material decision with no reasonable default puts the PLAN stage and RUN
  in `waiting_for_user` while the current Work remains `running`, then resumes
  after one consolidated answer packet.

Child Works never question the user directly. They return a
`question_candidate` with consequence and known options; the root planner
deduplicates candidates, applies reasonable defaults and asks only what cannot
be resolved safely.

A full previous-stage restart is reserved for an explicit user or external
approval requirement. PLAN must never silently invent or contradict user
behavior while repairing an upstream document.

Correction lineage uses existing artifacts rather than a new amendment file:
the user answer is appended to RUN intake, changed upstream paths and their
accepted checksums appear in the PLAN stage report, and affected plan/Work
revisions are regenerated. Git diff plus RUN timeline and accepted hashes are
the audit trail. Unaffected member plans and accepted aspect findings remain
unchanged.

## Adaptive depth

Every executable PRT in this formal flow receives a plan. vNext has no
`no_plan` route:

- `compact_plan` is the minimum route: one or a few bounded implementation
  items, local grounding and self-review when sufficient;
- `full_plan` is selected only for a named high-impact, uncertainty,
  irreversible data/security/runtime or explicitly requested full-depth
  trigger.

Assessment keeps independent axes for scope breadth, solution novelty,
solution uncertainty and failure impact. Breadth is not complexity: crossing
data, API and UI in one conventional vertical slice does not itself trigger
`full_plan`. A PSET may assign different plan depths to different members.

The accepted RUN policy is an input and floor, not a substitute for assessment.
PLAN may raise depth when it discovers a named trigger, but it must state the
trigger and must not silently lower an accepted floor.

## Grounding contract

PLAN grounds every applicable change surface deeply enough to identify current
owners, consumers, contracts, invariants, extension points and proof contours.
It does not read every project surface at equal depth.

The planner checks applicability of:

1. user behavior and acceptance;
2. component ownership and architecture;
3. data, persistence and migration;
4. API, CLI, event and consumer contracts;
5. UI and other client surfaces;
6. authorization, privacy and trust boundaries;
7. tests, scenarios, seeds and fixtures;
8. runtime, Git, delivery and operations;
9. durable documentation.

For each applicable surface it forms a named question, performs a bounded
local scan and stops when the owner, current behavior, relevant contract and
safe integration point are established. It uses top-level indexes first,
then linked documents, targeted code/schema/tests, and only then history or
external research for a remaining named uncertainty.

One compact source scope stays local. Several independent, substantive,
read-only questions may become grounding Works as specified in 003. A
grounding result returns facts, source anchors, current owner/behavior,
invariants, extension points, risks, remaining unknowns and a stop reason. It
does not own the final design decision.

Every executable plan item uses the accepted grounding to name exact
`required_read`, `discovery_boundary`, `write_scope` and checks. Vague discovery
such as “inspect the project” is not a CODE handoff.

## Durable document ownership

Delivery documents retain distinct roles:

- SPECIFY owns user behavior and request-level acceptance;
- PROTOCOLIZE creates/selects epic and feature records, PRT/PSET decomposition
  and primary acceptance;
- PLAN creates or updates durable technical decisions, executable acceptance
  and operational design;
- CODE implements accepted plans;
- READINESS records actual evidence.

PLAN may refine feature acceptance and cross-links, but does not turn a feature
into an implementation plan or redefine its user value. A missing or incorrect
feature/epic relationship is corrected before member plans are accepted.

Create or update a spec only for a durable product/system/engineering/
operations invariant, boundary or contract that is difficult to recover from
code. A spec describes what remains true; it does not narrate future modules,
pseudocode or ordinary implementation steps.

Create an ADR only when real alternatives were considered and the reason for
the selected durable boundary matters later. Following an established project
pattern with no material alternative does not require an ADR.

Create or update a scenario when a repeatable feature/capability, feature-group
or epic-level path needs an executable acceptance contract. A PRT contributes
to one or more scenarios but does not require its own SCN file. A technical
PRT may use plan-local checks. A cross-feature actor journey may use an XE
contract when it has independent user or operator value.

Create or update an operator runbook only for a real migration, deploy,
publish, backup/restore, rollback or comparable operational procedure.

Shared specs, ADRs, scenarios and runbooks in a PSET have one root PLAN owner.
Member planners may propose a shared change but must not concurrently mutate
the same durable document.

New future behavior is written only to DRAFT/PLANNED contracts. PLAN never
publishes unimplemented behavior as current or accepted evidence.

## Durable and runtime outputs

Every executable PRT owns exactly one canonical semantic plan:

```text
.memory-bank/protocol/<PRT-ID>/plan.json
```

Every executable PRT owns one RUN-local coverage map:

```text
<RUN>/03-plan/<PRT-ID>/aspect-map.json
```

The complete PLAN result is:

- accepted per-PRT plans;
- required durable feature/spec/ADR/scenario/runbook updates;
- complete aspect maps;
- one PSET integration verdict when a set exists;
- an atomically registered CODE Work DAG for the current RUN;
- a truthful CODE entry handoff.

There is no PSET `plan.json`, runtime plan copy, authored job map, graph report
or second semantic summary. The SQLite Work registry is the concrete mutable
execution graph. CLI renders one read-only RUN-local Work projection for
portability plus standard JSON, Markdown and HTML reports and summaries.

The semantic plan deliberately remains repository-owned JSON rather than
moving into SQLite. It is versioned, reviewable durable knowledge and the
portable implementation contract for later Sessions and reruns. Work is
mutable execution state for one RUN and therefore belongs in SQLite. Runtime
stores only the plan path, revision and accepted checksum needed to bind the
RUN; it does not mirror the plan body.

## Per-PRT plan contract

Each plan preserves:

- goal, scope, constraints and explicit non-goals;
- accepted requirement and primary-acceptance traceability;
- versioned source references and accepted revisions/checksums;
- independent assessment axes and selected plan depth;
- material architecture, data, API, UI, security and operations decisions;
- a minimal implementation item graph with true consumed-output dependencies;
- self-contained item summary and details;
- semantic spine, exact execution context and write boundary;
- invariants, controls, likely pitfalls, stop conditions and completion;
- verification, scenario, fixture, evidence and proof-limit contracts;
- Git, workspace, delivery and later-gate handoffs;
- precise current blockers or future named deferrals;
- complete references for CODE prompt rendering.

Every newly authored executable item has non-empty details sufficient for a
developer who knows the stack but not the planning Session. `depends_on` is a
hard edge only when the successor consumes a named predecessor output. Related
topics and useful ordering may inform a task but do not block it.

Requirement references accept stable IDs from accepted SPECIFY and linked
durable specs; an unrelated `SPC-*` is not mandatory. SPECIFY owns explicit
`R-*` and `AC-*` identifiers. PLAN may reference only identifiers present in
accepted inputs and must never synthesize a plausible-looking missing ID.

## Acceptance and verification design

PLAN maps each accepted criterion through implementation and proof:

```text
criterion
→ plan item
→ changed surface
→ check or scenario
→ environment and fixtures
→ expected evidence and proof limit
→ gate
```

For every applicable acceptance path, PLAN decides:

- actor, initial state, happy path and material negative/error paths;
- test layer or scenario runner;
- target environment and check profile;
- seed/fixture/world, isolation, bindings and cleanup;
- rerun and idempotency behavior;
- expected evidence and what weaker evidence does not prove;
- manual/external gate and precise DEF when it cannot run now.

A scenario derived faithfully from accepted behavior does not require repeated
user approval. PLAN asks only when the proposed acceptance changes user
meaning, adds a manual/external obligation, spends material resources or has
no safe default. A mental walkthrough finds design gaps but is never evidence.

## Operational and CODE bootstrap design

PLAN carries a compact applied policy context with source links, Git route,
delivery/fixation strategy, integration target, check profiles, current gate,
runtime stages, release/deploy/publish applicability, evidence and gaps.

It determines, only where applicable:

- branch/worktree ownership and cleanup;
- local baseline and CI checks;
- workspace bootstrap and env/secrets policy;
- changelog/version/release targets;
- preview/beta/production gates;
- deploy/publish trigger, readback and evidence;
- migration/backup/rollback requirements;
- operator runbook and external approvals.

PLAN does not create the implementation worktree. It hands CODE the exact
workspace route, base ref, bootstrap entrypoint, env/secrets policy, expected
receipt, first writable location and cleanup owner. CODE entry performs that
deterministic preparation. PLAN names baseline checks and known failures; CODE
entry executes or verifies them according to project policy before mutation.

## Aspect coverage

Every PRT classifies every catalog aspect with applicability, reason, coverage
mode, planned/reviewed artifacts, findings, verdict, evidence and deferrals.
Unknown applicability must be resolved before acceptance.

Complete coverage does not mean one worker per aspect. Compatible independent
read-only aspects may be grouped, while a critical independent boundary may
receive focused review. `informs` stays soft context and never becomes a Work
dependency. The useful design order is preserved proportionally:

```text
Product Design → System Architecture → Program Design → Vertical Slice Design
```

The parent planner owns final applicability and verdicts. It accepts grouped
results per aspect, preserves accepted siblings and creates a narrow correction
Work only for a rejected unit. PLAN finish validates semantic completeness,
not worker or array counts.

## PLAN stage lifecycle

The first PLAN action in either a continued or fresh Session is one prepared
command:

```bash
dd-flow stage start <RUN-ID> --stage plan --project-root <root> --json
```

The command validates the legal transition and accepted SPECIFY/PROTOCOLIZE
handoff, attaches `03-plan`, registers the trusted Session on the RUN root
Work, and returns one rendered PLAN prompt. The prompt contains:

- resolved RUN/project/workspace/Git and handoff policy facts;
- exact accepted input paths and checksums;
- applicable project indexes/policies and bounded grounding entry points;
- canonical aspect catalog paths;
- exact `protocol-plan@2`, `plan-aspect-map@2` schema paths and complete compact
  valid examples embedded in the returned packet so the worker does not need a
  separate schema/example read;
- conventional writable plan/map/draft-batch paths;
- Work registry commands needed by this route;
- the exact finish command.

The worker does not call global help or repeat deterministic compatibility,
permission, Git or path discovery. Semantic intake, applicability, grounding,
design and planning remain model work.

The agent authors only canonical per-PRT plans, RUN-local aspect maps, triggered
durable documents and one temporary CODE batch at:

```text
<RUN>/03-plan/code-work-batch.json
```

The finish command is:

```bash
dd-flow stage finish <RUN-ID> --stage plan --project-root <root> \
  --code-work-batch-file <RUN>/03-plan/code-work-batch.json --json
```

Member PRTs and their conventional plan/map paths are discovered from the
accepted PROTOCOLIZE result; the model does not pass repeated path arrays.
Finish reads those files, returns all schema/cross-file/graph diagnostics in
one response, and on success renders stage JSON/Markdown/HTML and summary
projections itself. The agent does not author a separate stage result, report,
summary or graph file.

Schema and documentation lint are restricted to the plans, maps and durable
documents touched by this stage; PLAN finish does not lint the entire memory
bank. After successful Work registration, CLI refreshes the portable Work
projection, then removes the temporary batch file and records its checksum,
entry Work ID and registered IDs in the deterministic stage projection. On
failure the batch remains in place for correction. SQLite is the only accepted
mutation authority; the generated projection is read-only evidence.

Validation failure leaves draft files writable in the current Session; it does
not publish accepted hashes or runnable CODE Work. A
material user question changes RUN/stage state to `waiting_for_user` while the
root Work remains `running`; waiting is not a Work status. Successful finish
closes the PLAN Work/Session link and stage, keeps the root Work alive and
returns the CODE directive with the exact `stage start code` command without
starting CODE.

## PLAN process

The normal single-PRT process is:

1. start PLAN and consume the prepared context;
2. repair clear upstream omissions in place and consolidate any user question;
3. assess `compact_plan` or `full_plan`;
4. form grounding questions and perform local or delegated grounding;
5. accept facts and make the simplest project-compatible decisions;
6. create/update triggered durable documents;
7. draft the semantic implementation graph;
8. design acceptance, verification and operational handoffs;
9. classify and route aspect coverage;
10. review one immutable draft snapshot, integrate findings and retry only
    rejected units;
11. mentally walk through the primary and material failure paths;
12. validate traceability, graph, current-truth and CODE handoff;
13. prepare the CODE Work batch and finish atomically.

One generated PLAN prompt compiles these obligations. It includes accepted
inputs, bounded project context, exact schemas/examples, Work commands, write
boundaries and completion commands. It does not require global help or manual
reports.

## PSET relationship

A PSET coordinates delivery; it is not another semantic plan. Every member
retains separate scope, plan, aspect coverage, implementation contribution,
verification and closure.

The root planner first resolves shared grounding and design contracts, then
launches member planning. After member plans are accepted, one integration Work
checks request coverage, shared contracts, gaps, duplicate scope, write
conflicts, actual dependencies, delivery topology and the proposed CODE Work
DAG. This is the semantic coverage gate: the reviewer compares task text and
graph intent with plans and acceptance. The generic Work registry validates
only task presence and graph correctness; it does not require a duplicate
machine-readable `covers` relation. The integration Work corrects affected
members only and creates no PSET plan.

`blocked_by_protocols` constrains delivery but does not automatically serialize
planning. A member PLAN Work waits only for a concrete result it consumes.

## vNext schema cutover

This beta introduces `dd-flow/protocol-plan@2` and
`dd-flow/plan-aspect-map@2`. They must align with this process rather than copy
known canonical contradictions:

- accepted sources and requirement refs are not restricted to `SPC-*`;
- executable item details are schema-required;
- task assessment uses explicit allowed axes and depths;
- actual capacity, waves, worker/session IDs and packing remain runtime facts,
  not immutable semantic plan fields;
- policy context can represent Git, checks, delivery and gaps required by the
  operational contract;
- verification can represent scenarios, environments, fixtures, cleanup,
  evidence and proof limits without placeholder seeds;
- the durable CODE handoff remains RUN-independent; registered Work IDs appear
  in RUN/stage projections and rendered tasks, not in `plan.json`.

### `protocol-plan@2` normative shape

The version-2 schema has this required top-level structure:

```text
$schema
schema_id = dd-flow/protocol-plan@2
plan_id
protocol_id
revision
title
summary
source_refs[]
goal
assessment
decisions[]
document_updates[]
items[]
acceptance[]
policy_context
code_handoff
```

`source_refs[]` accepts any stable accepted source kind (`specify`, `protocol`,
`feature`, `epic`, `spec`, `adr`, `scenario`, `policy` or `other`). The agent
authors `kind`, `id`, repository-relative `path` and zero or more stable
requirement IDs. A version/revision is required only when the source contract
has one. `stage finish` resolves the accepted bytes and injects `sha256` before
the final accepted-plan validation. The worker never calculates a source hash.

`assessment` contains the four independent axes `scope_breadth`,
`solution_novelty`, `solution_uncertainty` and `failure_impact`; each has an
enumerated `level`, concrete `surfaces` and `reason`. Allowed levels are:

```text
scope_breadth: narrow | moderate | broad
solution_novelty: established | adapted | novel
solution_uncertainty: low | medium | high
failure_impact: low | medium | high
```

It also contains `selected_depth: compact_plan | full_plan` and
`depth_trigger: none | explicit_full | irreversible_data | security_trust |
runtime_concurrency | high_uncertainty | high_failure_impact |
external_delivery`. It contains no worker, probe, wave or execution-mode facts.

Each `decisions[]` row contains `id`, `decision`, `rationale`,
`affected_surfaces` and optional `durable_ref`. Each `document_updates[]` row
contains `path`, `action: create | update`, `owner` and `reason`. Empty arrays
are valid when no durable decision/document trigger exists.

Each executable `items[]` row requires:

```text
id, title, summary, details, depends_on, requirement_refs,
semantic_spine, execution_context, verification
```

`summary` is the compact intent; `details` is the ordered implementation
approach. `semantic_spine` preserves
user outcome, component responsibility, invariants, non-goals and acceptance
contribution. `execution_context` contains exact required reads, bounded
discovery, write scope, checks and stop conditions. `verification` contains
the checks, expected evidence and proof limits contributed by the item. There
is no item runtime status, assigned Session or Work ID.

Each `acceptance[]` row requires `criterion_id`, `plan_item_ids`,
`changed_surfaces`, `path`, `environment`, `fixtures`, `cleanup`,
`expected_evidence`, `proof_limits` and
`gate: code | readiness | merge | release | external`. Arrays may be empty only when
the concept genuinely has no members (for example no special fixture); expected
evidence and proof limits remain non-empty. The semantic validator rejects
placeholders presented as evidence.

`policy_context` has exactly `sources`, `git`, `workspace`, `checks`,
`delivery`, `operations` and `gaps`. These cover the selected route/base/target
and fixation policy; workspace/bootstrap/env/secrets/cleanup policy; baseline,
implementation and readiness checks; release/deploy/publish applicability; and
migration/backup/rollback/runbook obligations. An inapplicable contour is an
explicit small value, not an invented task.

`code_handoff` contains only durable inputs for the next stage: `must_read`,
`workspace_route`, `bootstrap`, `env_policy`, `secret_policy`,
`preserved_invariants`, `current_blockers` and `next_stage: code`. It does not
contain its own checksum, RUN path, Work IDs or mutable Git facts.

### `plan-aspect-map@2` normative shape

The version-2 aspect map requires:

```text
$schema
schema_id = dd-flow/plan-aspect-map@2
protocol_id
plan_id
plan_revision
catalog_ref { path, sha256 }
routing { initial_state, selected_route, reason, groups[] }
aspects[]
```

`routing.initial_state` is always `orchestrator_local`; `selected_route` is
`local_compact | single_wave_grouped | multi_wave_grouped | external_handoff`.
Each semantic `groups[]` row lists the compatible aspect IDs intended to share
one review packet. Actual capacity, probe attempts, Work/Session IDs and
wave timings remain runtime facts and are not copied into the map.

Every current catalog aspect appears exactly once. Each row requires:

```text
aspect_id
applicability = applicable | not_applicable
reason
coverage_mode = none | self_check | focused_subagent |
                grouped_subagent | external_evidence |
                deferred_as_DEF | blocked
verdict = pass | watch | needs_changes | blocked | not_applicable
planned_artifact_refs[]
reviewed_artifact_refs[]
evidence_refs[]
findings[]
deferrals[]
```

`not_applicable` requires `coverage_mode: none` and
`verdict: not_applicable`. Applicable rows may not use `none`. Delegated Work,
Session, probe and wave IDs stay in runtime reports; accepted semantic findings
and evidence stay in the map. CLI cross-validates catalog completeness,
plan identity/revision and permitted applicability/mode/verdict combinations.

`planned_artifact_refs[]`, `reviewed_artifact_refs[]` and `evidence_refs[]` are
stable paths or identifiers. Planned refs describe future CODE outputs;
reviewed refs name artifacts that actually existed and were inspected during
PLAN, preserving the current-truth boundary.
`findings[]` rows contain `id`, `severity: critical | major | minor`, `summary`
and `resolution`. `deferrals[]` rows contain `def_id`, `reason` and
`target_gate`. Empty arrays are valid; unresolved critical/major findings and
unresolved current-gate deferrals prevent PLAN acceptance.

The new schemas are one cutover, not optional aliases. The beta flow pack,
embedded CLI schemas, validators, examples, PLAN prompt, stage finish, reports,
CODE/readiness readers and tests all consume version 2. There is no version-1
fallback, dual write, legacy-readable output or silent coercion. Existing beta
runtime state is migrated explicitly or recreated before the first version-2
RUN.

## Atomic finish and immutability

PLAN finish validates all PRT plans, maps, durable document changes, PSET
integration result and the proposed CODE Work batch before accepting any of
them. Schema/CLI checks validate the Work graph structurally—non-empty tasks,
valid references, same-RUN dependencies and acyclicity. Semantic coverage of
plan items and acceptance is owned by the PLAN integration review and is
rechecked later against actual implementation by READINESS. On success finish:

- records accepted revisions and checksums;
- registers the CODE Work DAG in one transaction;
- renders standard reports and summaries;
- runs selected-file lint where required;
- records available session/usage observations;
- returns the CODE entry directive and stops before implementation.

On validation failure no partial acceptance or runnable CODE Work is published.
The current PLAN Work receives all actionable errors for correction. An
accepted plan is immutable; semantic change requires a new PLAN attempt and
incremented revision.

## Acceptance

- A compact PRT produces a useful plan and CODE Work without delegated work or
  capacity probing.
- A full PRT performs proportional grounding, durable-document promotion,
  aspect review and executable acceptance design.
- A fresh CODE Session can execute the registered task without hidden planning
  context.
- In-place corrections update only affected artifacts and Works.
- Invalid grounding, source refs, item details, dependencies, acceptance,
  policy or aspect rows fail with combined diagnostics; semantic review rejects
  incomplete or orphaned CODE tasks before finish.
- PLAN changes no application code, creates no implementation worktree and
  executes no CODE Work.
- A PSET produces separate member plans plus one validated CODE Work DAG, not a
  PSET plan or an array with no execution topology.
