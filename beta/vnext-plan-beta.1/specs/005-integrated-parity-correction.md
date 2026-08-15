---
file: 'beta/vnext-plan-beta.1/specs/005-integrated-parity-correction.md'
description: 'Integrated correction contract for observed SPECIFY, PROTOCOLIZE, PLAN, Work, lifecycle and observability parity defects.'
status: 'DRAFT'
---

# 005 — Integrated parity correction

## Goal

Close the defects exposed by the first end-to-end vNext PLAN run as one
coherent correction, rather than patching individual prompts or validation
errors. The corrected contour must preserve the accepted vNext order and
minimal runtime while restoring the useful semantic and operational guarantees
already required by specifications 001–004 and the PROTOCOLIZE/SPECIFY beta
specifications.

This specification is a conformance-and-clarification change. It does not add a
new stage, a second plan, a new Work type, a scheduler service or a legacy
compatibility path.

## Observed failure pattern

The run produced a strong-looking plan because the model voluntarily searched
for missing contracts, calculated hashes, reconstructed examples, reviewed all
applicable aspects locally and authored fields that the schemas did not
require. The engine would also have accepted materially weaker output.

The root causes form six connected groups:

1. semantic contracts were weaker than their owning specifications;
2. PLAN bypassed the trusted stage/Turn/session lifecycle;
3. planning depth was conflated with aspect-review routing;
4. stage packets omitted deterministic context and exact output shapes;
5. document and requirement traceability was advisory rather than validated;
6. reports, usage and Work projections were incomplete or non-portable.

A correction is accepted only when all six groups are fixed together. A prompt
change without schema/runtime enforcement is not sufficient.

## 1. Semantic identity and traceability

### 1.1 Stable SPECIFY identifiers

The accepted SPECIFY Markdown is still the human-readable semantic owner, but
its output contract must require stable identifiers:

```text
R-001, R-002, ...   accepted requirements and constraints
AC-001, AC-002, ... request-level acceptance criteria
Q-001, Q-002, ...  user questions
```

The agent authors the semantic IDs. CLI validates uniqueness and required
sections; it does not infer requirements from arbitrary prose. PROTOCOLIZE
maps `AC-*` to member keys. PLAN references only IDs present in accepted
SPECIFY or linked durable specifications. It must never invent a missing
`SPECIFY@.../R-*` reference.

### 1.2 Strict `protocol-plan@2`

The schema must implement the complete normative shape from specification 001:

- enumerated independent assessment axes and plan depth;
- non-empty, repository-relative accepted source references;
- structured decisions and triggered document updates;
- strict executable items with semantic spine, execution context, details,
  verification and resolvable dependencies/requirement references;
- acceptance mapping with environment, fixtures, cleanup, evidence, proof
  limits and gate;
- applied policy context for Git/workspace/checks/delivery/operations/gaps;
- durable CODE handoff without mutable runtime IDs.

Nested objects reject unknown fields unless the contract explicitly allows an
extension. Arrays that establish coverage have meaningful minimum sizes.

Accepted source checksums are mechanical facts. The agent writes logical source
references; `stage finish` resolves accepted paths/revisions and computes
hashes. No stage prompt asks the model to run `sha256`, `shasum` or equivalent.

### 1.3 Strict `plan-aspect-map@2`

The map must contain every current catalog aspect exactly once. Applicability,
coverage mode and verdict are enums; applicable rows have a completed verdict
and evidence/review references, while not-applicable rows have a reason.

The map records the semantic route and grouping needed to explain coverage,
but not mutable Session IDs, probe attempts or timing. Runtime Work/Turn
records own actual dispatch.

### 1.4 Cross-artifact validation

PLAN finish validates in one diagnostic result:

- accepted SPECIFY `R-*`/`AC-*` references;
- PRT/PSET membership and primary acceptance ownership;
- plan item dependencies and acceptance ownership;
- full aspect-catalog coverage and final verdicts;
- CODE batch task/dependency/parent structure;
- referenced Memory Bank paths and current-truth boundaries;
- changed-document links and selected-file lint.

All errors are returned together. Failure publishes no accepted hashes,
runnable CODE Work or successful report.

## 2. One stage lifecycle and trusted execution binding

SPECIFY, PROTOCOLIZE and PLAN use the same stage-entry envelope. A stage module
may provide its semantic template and deterministic handlers, but it does not
reimplement identity, preflight, hook binding, prompt persistence, timing,
usage checkpoints, reporting or next-command rendering.

For a supported Codex Desktop/CLI harness:

- `stage start` consumes one trusted PreToolUse event;
- the real Session is registered to RUN;
- one Agent Turn is opened for the Work;
- stage finish closes that exact Turn;
- missing or ambiguous binding fails closed in a controlled eval.

An unsupported harness may report binding as unavailable, but it cannot claim
complete session or usage coverage.

Successful PLAN does not set `waiting_for_user` merely because CODE has not
started. `waiting_for_user` is reserved for an actual unresolved user question.
The receipt returns the legal next state and exact CODE start command.

Declared transitions must be executable. `specify.answer`,
`specify.remediation` and protocolize question continuation may not appear in
the Flow graph or receipts until the corresponding entry and resume contract
exist and are tested.

## 3. Self-contained stage packets

`stage start` is the first practical lifecycle command and returns everything
known deterministically that the stage needs:

- RUN/Work/Stage identity and writable workspace;
- trusted Session/Turn binding;
- project/workspace/cwd and Git branch/HEAD/dirty/remotes;
- engine/flow compatibility and permission result;
- handoff policy and accepted predecessor paths/revisions;
- target language and applicable project policy sources;
- bounded Memory Bank/project grounding entry points;
- exact output paths;
- complete output schema shapes and one minimal valid example;
- only the Work commands applicable to the selected stage;
- exact matching finish command.

Every successful finish receipt similarly returns the exact next-stage command
or an explicit user/external/terminal gate. A normal worker must not search CLI
help, schemas, examples or flow files to reconstruct a command or object shape
already owned by the lifecycle.

Semantic project research remains model work. Git, compatibility, permission,
path, schema-shape, report, hash and transition discovery remain deterministic.

## 4. PLAN depth, grounding and aspect routing

Planning depth and execution routing are independent:

```text
compact_plan != local_compact
single PRT != single semantic review unit
one implementation item != one applicable aspect
```

`orchestrator_local` is only the initial owner. Use `local_compact` only for one
genuinely tiny semantic unit or one short source scope. A conventional compact
vertical slice may still have several substantive architecture/data/API/UI/
security/verification aspects.

For substantive independent read-only work:

1. classify applicability cheaply;
2. retain only real hard-output or independent-trust boundaries;
3. group compatible units, at most three per Work;
4. prefer `single_wave_grouped`;
5. use known free capacity or one bounded probe when useful capacity is
   unknown;
6. accept each aspect separately;
7. retry only a rejected unit.

Capacity changes packing and wave count only. It never changes applicability,
plan depth, task meaning, dependencies or the need for an independent verdict.
Probe attempts are not Work and are not persisted as session coverage. Only
the usable capacity result is needed while routing the current wave.

PLAN must have an actual route from grouped aspect packets to child Work and
trusted Agent Turns. Documenting `single_wave_grouped` without dispatching or
accepting the corresponding units is invalid coverage.

## 5. Grounding, documents and acceptance

### 5.1 SPECIFY handoff

SPECIFY preserves relevant product/system/policy sources, selected design
aspects, assessment axes, settled defaults, `R-*`, `AC-*`, remaining `Q-*` and
verification seeds in a cold-start-safe result. It does not duplicate runtime
facts or implementation design.

Knowledge-candidate extraction is not added to this correction merely for
canonical ceremony. It remains a later full-flow parity item until promotion
at merge/closure has an implemented consumer.

### 5.2 PROTOCOLIZE catalog and links

PROTOCOLIZE start supplies the relevant epic/feature paths and compact content,
not only epic-directory names. It also supplies applicable spec/ADR/scenario
indexes and positive-trigger rules.

The result contract supports the actions it advertises. At minimum:

- existing feature link plus reciprocal PRT backlink update;
- feature create and update;
- existing epic link and justified epic create/update;
- explicit PLAN obligations for triggered spec/ADR/scenario/runbook work.

`feature.link` is not a read-only existence check. Successful protocolization
must leave feature/PRT traceability coherent in both directions.

### 5.3 PLAN durable decisions and proof design

PLAN enforces the positive-trigger rules already defined in specification 001:

- feature/epic for durable value/capability;
- spec for distributed normative meaning not recoverable from one code owner;
- ADR for a real durable decision with alternatives and rationale;
- standalone scenario for reusable/cross-layer/evidence-heavy acceptance;
- runbook for an actual operator procedure.

Every accepted criterion maps through plan item, changed surface, check or
scenario, environment/fixture/cleanup, expected evidence, proof limit and gate.
Local tests cannot silently close user, integration, operational or production
claims.

## 6. Work runtime, portability and usage

### 6.1 One Work authority

Use only `flow_works` and `flow_agent_turns`, rebuilt to the minimal registry
shape from specification 002. Remove `vnext_works` and `vnext_agent_turns` and
all dual reads/writes. New beta databases use the new schema only; there is no
legacy fallback.

Parent Work cannot complete while a required descendant is `created` or
`running`. Cancellation/failure closes descendants explicitly; reparenting is
not supported.

### 6.2 Portable projection

SQLite is the mutable authority, but the RUN remains portable. After every Work
mutation, CLI deterministically refreshes one RUN-local Work projection
containing root ID, tasks, parentage, dependencies, status, compact results and
Turn/session references. It is a projection, not a second editable graph.

PLAN may remove the temporary input batch only after the accepted Work graph
has been committed and projected. A RUN archive must remain understandable
without the original live SQLite database.

### 6.3 Usage provenance

Stage finish and final eval collection refresh usage for every Session
registered to the RUN, including coordinator, delegated and recovery Sessions.
Aggregation uses session/Turn time boundaries and never duplicates one full
Session total across several Works.

Each imported source records at least:

- source kind and source Session ID;
- source locator;
- source size, mtime and SHA-256;
- collection timestamp;
- provider token-event timestamp and Turn ID when available;
- parser version and extraction status.

Snapshots retain input, cache-read, cache-write when reported, reasoning and
output categories. Reports show honest complete/partial/unavailable coverage;
they do not rely on a manually set boolean.

## 7. Deterministic finish and reports

Every stage finish uses the shared deterministic report pipeline:

- validate semantic and cross-file contracts;
- compute hashes and changed-file set;
- run selected-file Memory Bank lint only when Memory Bank files changed;
- close the bound Turn and checkpoint all registered Session usage;
- append structured timeline events with timestamps and duration;
- render schema-valid JSON, Markdown and template-backed HTML;
- refresh protocol summary and portable Work projection where applicable;
- return exact next command or gate.

The agent never authors report projections, timestamps, wall clock, Git facts,
Session IDs, token counts, hashes or HTML. Static template rendering is not
followed by a model-driven browser/DOM smoke.

## 8. Required repository changes

### `dd-tasks` beta flow pack

- strengthen SPECIFY output headings/IDs and PLAN/PROTOCOLIZE instructions;
- replace the weak plan/aspect schemas and add valid examples;
- keep the routing clarification already added to `vnext/plan.md`;
- expose document, policy, acceptance and exact-command contracts in rendered
  stage packets.

### `dd-flow-cli` beta engine

- use one shared stage lifecycle envelope and one Work table family;
- bind PLAN/Work starts through the trusted hook;
- implement strict aggregate validators and atomic finish;
- implement actual grouped aspect Work dispatch/acceptance support;
- implement coherent PROTOCOLIZE catalog actions/backlinks and resume entries;
- generate complete reports, Work projection and usage provenance;
- return exact next commands.

### `dd-eval`

- keep this correction specification and updated quality checklist;
- archive exact Session/task IDs and RUN artifacts;
- evaluate substantive content before report cosmetics;
- compare wall clock, calls, reads, sessions/turns and token categories;
- run single-PRT PLAN first and PSET separately.

## 9. Explicit non-goals

- no legacy/fallback readers or dual schemas;
- no new Work type/stage/subject/executor fields;
- no dependency table or scheduler daemon;
- no agent-authored SHA, reports, telemetry or graph projection;
- no plan-specific second lifecycle implementation;
- no one-worker-per-aspect rule;
- no forced subagents for one tiny semantic unit;
- no full Memory Bank lint on every stage;
- no requirement to create epic/spec/ADR/scenario/runbook placeholders;
- no CODE/REVIEW/MERGE implementation inside this correction beyond a valid,
  self-contained CODE entry contract.

## 10. Acceptance matrix

| ID | Requirement | Minimum proof |
| --- | --- | --- |
| C-01 | SPECIFY emits unique `R-*`, `AC-*`, `Q-*` identifiers where applicable | result validation fixtures |
| C-02 | PLAN cannot reference a missing accepted requirement or criterion | negative cross-file test |
| C-03 | `protocol-plan@2` rejects semantically empty nested contracts | invalid fixture set |
| C-04 | aspect map covers the exact catalog with enum route/verdict fields | missing/duplicate/unknown tests |
| C-05 | PLAN start binds the real Session and opens one Agent Turn | Desktop hook integration test |
| C-06 | supported-harness missing/ambiguous binding fails closed | negative hook tests |
| C-07 | PLAN start packet contains exact contracts, examples and finish command | prompt snapshot |
| C-08 | finish receipt contains exact next-stage command or explicit gate | transition tests |
| C-09 | compact depth can select grouped one-wave review | routing fixture matching task-priority shape |
| C-10 | accepted aspects survive a narrow retry of one rejected aspect | Work/result fixture |
| C-11 | feature link adds the accepted PRT backlink without duplication | protocolize integration test |
| C-12 | declared question/remediation transitions are executable | resume tests |
| C-13 | finish returns all relevant diagnostics and publishes no CODE Work on failure | atomic negative test |
| C-14 | successful PLAN publishes one coordinator and traceable child DAG | stage integration test |
| C-15 | parent Work cannot finish with active descendants | structured-concurrency test |
| C-16 | only one Work/Turn table family participates in a new beta RUN | schema/SQL audit test |
| C-17 | archived RUN contains a complete generated Work projection | portability fixture |
| C-18 | all registered RUN Sessions are included in usage aggregation with provenance | multi-session usage fixture |
| C-19 | stage reports contain timings, binding, usage, validation and exact next action | schema/render snapshot |
| C-20 | one controlled Desktop PLAN rerun passes the updated quality gate without manual schema/help/SHA discovery | eval review |

## Release gate

Do not create the next immutable beta checkpoint until C-01 through C-20 pass
or are explicitly marked not applicable by this correction's scope. The first
model eval occurs only after deterministic fixtures pass; model output is not a
substitute for contract tests.
