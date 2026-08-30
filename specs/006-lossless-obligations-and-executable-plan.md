---
file: 'specs/006-lossless-obligations-and-executable-plan.md'
description: 'Use structured SPECIFY obligations, lossless protocol ownership and a PLAN-derived CODE Work graph.'
status: 'ACCEPTED'
suite_id: 'sdlc-eval-2026-summer'
extends: '004-protocolize-worktree-boundary.md'
---

# 006 — Lossless obligations and executable PLAN

## Goal

Make the path from clarified user intent to CODE mechanically lossless while
keeping semantic work with the agent:

```text
specify.json semantic SSOT
  -> specify.md deterministic human projection
  -> PROTOCOLIZE obligation ownership
  -> plan.json semantic implementation graph
  -> code-work-batch.json deterministic runtime projection
  -> PLAN-REVIEW semantic challenge and correction
  -> validated CODE Works
```

The agent decides meaning, delivery boundaries, implementation and proof. The
CLI validates and projects facts it can determine exactly. No stage manually
rewrites a downstream artifact that can be derived from an accepted source.

## Design rule

A field is structured only when deterministic code uses it for validation,
routing, projection or a lifecycle transition. Information read only by an
agent, Judge or human remains in a small number of large Markdown sections.

### 0.1 Artifact-shape policy

`JSON` is for the semantic facts that later deterministic steps must preserve
or check.  It is not an instruction to atomize normal reasoning into dozens
of shallow fields.  A stage therefore uses this split:

- stable identities, ownership, dependencies, paths, revisions and references
  are explicit JSON fields;
- exact accepted requirements and acceptance criteria are explicit JSON arrays;
- a substantial but non-mechanical explanation stays as Markdown inside one of
  the declared large JSON string sections;
- human-readable `.md`, HTML and report files are deterministic projections
  when their content can be derived from an accepted JSON source.

This preserves complete meaning without making the agent fill a questionnaire.
It also gives every later stage one unambiguous semantic source.  Do not create
an additional prose file merely to store the same meaning under another name.

### 0.2 Source-of-truth table

| Concern | Semantic source | Deterministic projection or receipt | Never agent-authored |
| --- | --- | --- | --- |
| clarified intent | `01-specify/specify.json` | `specify.md`, stage report, hashes | a second obligation list |
| allocation to delivery slices | `02-protocolize/protocolize-result.json` | PRT/PSET documents and links | paraphrased replacement R/AC text |
| implementation decisions | each `03-plan/<PRT>/plan.json` and aspect map | generated CODE graph | a second runtime PLAN graph |
| executable CODE work | final semantic plans plus accepted ownership | `03-plan/code-work-batch.json`, registered Works | manual batch edits |
| fresh-worker context | accepted plan items plus project standards and exact R/AC | generated CODE Work packets | worker rediscovery or a second authored context plan |
| PLAN review decision | `04-plan-review/decision.json` | corrected PLAN closure and receipt | a synthetic decision for review-off |

The table is deliberately short.  If a future field cannot name the source it
extends and the deterministic consumer that needs it, it does not belong in a
new contract.

This rule prevents two opposite failures:

- unstructured prose that later stages can only recover with regular
  expressions; and
- a large JSON questionnaire whose fields have no executable purpose.

Do not add a second obligation file, a parallel PLAN graph, compatibility
fallbacks or task-specific business heuristics.

## Scope and non-goals

This specification changes the beta flow and engine contracts for SPECIFY,
PROTOCOLIZE, PLAN, PLAN-REVIEW and their handoffs. It also changes the active
eval assessment and requires a new canonical checkpoint chain.

It does not:

- change the task-priority product request or its golden business decisions;
- implement CODE, merge or deployment behavior;
- introduce a general workflow DSL or a second task scheduler;
- make Judges responsible for deterministic schema validation;
- preserve readability of the old beta stage contracts inside the new engine.

Historical eval artifacts remain historical evidence. The new beta pair does
not read them as live stage input.

## Current defects

1. SPECIFY writes `R-*` and `AC-*` bullets in Markdown. The CLI finds their
   identifiers with regular expressions but does not retain exact statements
   in a structured contract.
2. PROTOCOLIZE maps only `AC-*`. An accepted requirement, invariant, exception
   or negative boundary can disappear even when current coverage validation
   passes.
3. PROTOCOLIZE manually paraphrases accepted scope into each PRT. This makes
   semantic preservation depend on model repetition rather than ownership.
4. PLAN authors both `plan.json` and `code-work-batch.json`. These are two
   representations of one graph and can diverge.
5. PLAN validates identifier existence and local acyclicity, but not complete
   obligation realization, input availability or conflicting file ownership.
6. PLAN-REVIEW applies corrections to PLAN and manually regenerates the batch.
   A valid decision receipt can therefore coexist with a stale CODE handoff.
7. The current handoff can put future CODE outputs in root `must_read`, making
   the accepted graph impossible to start.
8. Work registration currently collapses structured CODE context into a task
   string, losing read/write boundaries, accepted semantics and verification
   needed by a fresh worker.

## 1. SPECIFY semantic source

### 1.1 Agent result

The successful agent result is `01-specify/specify.json`, conforming to
`dd-flow/specify@1`. It is the sole semantic source of truth:

```json
{
  "schema_id": "dd-flow/specify@1",
  "summary": "A concise clarified outcome.",
  "requirements": [
    {
      "id": "R-001",
      "statement": "An exact accepted requirement, constraint or invariant."
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "statement": "An exact observable acceptance obligation."
    }
  ],
  "sections": {
    "problem_and_scope": "Markdown covering the problem, goal, actors, in-scope and out-of-scope behavior.",
    "acceptance_and_verification": "Markdown covering the scenario, happy/alternate/error paths, automated/manual proof, fixtures, cleanup and proof limits.",
    "gaps_defaults_and_project_facts": "Markdown covering the baseline pass, method applicability, findings, research, settled defaults, assumptions and binding project facts.",
    "assessment_and_protocolize_handoff": "Markdown covering task assessment, plan floor, delivery-shape seed, material sources and verification seeds."
  }
}
```

The four section values are large Markdown strings. Their internal content is
governed by the SPECIFY prompt and evaluated semantically; the CLI checks only
that each required section is a non-empty string. Do not split their prose into
fields until deterministic code has a real consumer for such a field.

The JSON Schema is closed: all shown top-level fields and all four section keys
are required, `requirements` and `acceptance_criteria` are non-empty, and
`additionalProperties` is false at every structured object boundary. The CLI
normalizes accepted JSON to two-space indentation and one final newline before
hashing and rendering it.

The JSON has no `outcome`, timestamps, checksums, runtime paths, Git facts,
session data or empty `questions` array. Lifecycle supplies the outcome and CLI
supplies runtime facts. A material unanswered question uses the existing
`stage pause`/`stage resume` contract and cannot appear in a successfully
finished SPECIFY result.

### 1.2 Obligation rules

- Every material functional rule, non-functional constraint, preserved
  invariant, exception and negative boundary receives one `R-*` entry.
- Every independently observable acceptance obligation receives one `AC-*`
  entry.
- IDs match `^R-[0-9]{3,}$` or `^AC-[0-9]{3,}$`, are unique within the result
  and retain array order.
- Statements are non-empty exact accepted semantics, not implementation steps,
  phase labels or references such as “as discussed above”.
- Context and rationale stay in the large sections. Do not manufacture an
  obligation merely to make the list longer.

The CLI performs structural validation only. It cannot decide whether the
agent omitted a material business rule; that remains a Judge concern.

### 1.3 Deterministic Markdown projection

After validating and storing `specify.json`, the CLI always renders
`01-specify/specify.md`. The agent never writes or edits this file.

The renderer uses one stable layout:

```markdown
# Summary

<summary>

# User problem and scope

<sections.problem_and_scope>

# Requirements

- R-001: <statement>

# Acceptance criteria

- AC-001: <statement>

# Acceptance and verification

<sections.acceptance_and_verification>

# Gaps, defaults and project facts

<sections.gaps_defaults_and_project_facts>

# Assessment and PROTOCOLIZE handoff

<sections.assessment_and_protocolize_handoff>
```

The renderer escapes or normalizes only what is required for valid headings
and stable final newlines. It does not summarize, rewrite or reorder semantic
content. A renderer test proves byte-stable output for the same accepted JSON.

### 1.4 SPECIFY lifecycle

`stage start ... --stage specify` returns one complete packet containing:

- trusted runtime/grounding context;
- the full `dd-flow/specify@1` JSON Schema with field descriptions;
- one minimal valid result example;
- the existing pause command;
- one exact JSON-stdin finish command.

The Subject must not search for another schema or example. The successful path
is one `stage finish` call with JSON on stdin. Finish must:

1. parse the input and collect all schema errors;
2. report all structural errors together with JSON paths;
3. validate R/AC ID format and uniqueness;
4. write `specify.json` atomically;
5. render `specify.md` atomically;
6. generate the normal JSON, Markdown and HTML stage reports;
7. record hashes for both accepted JSON and rendered Markdown in the stage
   report, without creating a separate receipt;
8. close SPECIFY and return the exact PROTOCOLIZE continuation.

No successful finish may leave only one of the two files. A validation or write
failure leaves the stage running and does not publish a partial accepted
result.

The flow manifests change the SPECIFY agent action from
`result_format: markdown` to `result_format: json`.

## 2. PROTOCOLIZE is allocation, not paraphrase

### 2.1 Input

The PROTOCOLIZE start packet names both accepted artifacts:

- `specify.json` — semantic SSOT and machine-readable R/AC list;
- `specify.md` — deterministic reading projection.

The CLI also renders the exact R/AC list in the start packet, so the agent does
not need to discover or regex it. In any conflict, which would be an engine
defect, `specify.json` is authoritative and the stage fails closed.

### 2.2 Result contract

Replace `dd-flow/vnext-protocolize-result@1.acceptance_coverage` with
`dd-flow/vnext-protocolize-result@2.obligation_ownership`:

```json
{
  "schema_id": "dd-flow/vnext-protocolize-result@2",
  "obligation_ownership": [
    {"obligation_id": "R-001", "member_keys": ["primary"]},
    {"obligation_id": "AC-001", "member_keys": ["primary"]}
  ]
}
```

The rest of the current delivery, member, topology, durable-link and feature
contract remains unless a field is proven unused during implementation.

Each R/AC id appears in exactly one ownership record. `member_keys` is a
non-empty unique list of existing temporary member keys. Multiple member keys
are allowed only for a genuinely cross-slice obligation; they are not a default
and do not permit blanket duplication. Every member owns at least one `AC-*`.

### 2.3 Agent responsibility

The PROTOCOLIZE agent must:

1. choose the smallest valid single-PRT or PSET topology;
2. allocate every accepted R/AC obligation without changing its statement;
3. define member goal, role, boundary, dependency and concise primary
   acceptance;
4. apply positive triggers for epic/feature/spec/ADR/scenario documents;
5. pause within PROTOCOLIZE for a new material decision with no reasonable
   default, then resume the same Work.

It must not rerun SPECIFY, rewrite accepted obligations, design implementation,
create the worktree, allocate durable ids or write durable documents directly.

### 2.4 Deterministic materialization

PROTOCOLIZE finish validates complete ownership before any durable write. It
joins ownership with the exact statements from `specify.json` and renders under
every generated PRT:

- `Owned requirements` with exact assigned `R-*` statements;
- `Owned acceptance criteria` with exact assigned `AC-*` statements;
- member boundary, primary acceptance and links supplied by PROTOCOLIZE.

The PSET document renders the complete ownership map and dependency topology.
Boundary prose may explain a slice but cannot replace or override owned
obligations. Unknown, missing or duplicate ownership, an ownerless member, or a
member without acceptance prevents all durable publication.

## 3. PLAN is the implementation SSOT

### 3.1 Agent-authored artifacts

For every PRT, the PLAN agent authors:

- `.memory-bank/protocol/<PRT>/plan.json`;
- `<RUN>/03-plan/<PRT>/aspect-map.json`.

It does not author `code-work-batch.json`. Remove that path, schema and example
from the PLAN output instructions. Do not keep a hidden compatibility option or
CLI flag that accepts an agent-authored batch.

The plan schema advances to `dd-flow/protocol-plan@3`. Preserve the current
useful semantic fields: goal, independent assessment axes, decisions,
document updates, plan items and acceptance proof. Remove agent-owned runtime
or handoff fields when their values are already known by the CLI. In
particular, root CODE `must_read`, workspace route, bootstrap, source hashes and
runtime policy facts are generated or normalized by CLI rather than invented by
the PLAN agent.

PLAN start may prepopulate deterministic identity/source metadata in each
target plan file. The agent owns only semantic fields; finish validates that
CLI-owned identity and source references were not changed.

The stored `protocol-plan@3` top level is deliberately limited to:

```json
{
  "schema_id": "dd-flow/protocol-plan@3",
  "plan_id": "PLAN-001",
  "protocol_id": "PRT-001-example",
  "revision": 1,
  "title": "...",
  "summary": "...",
  "source_refs": [],
  "goal": {},
  "assessment": {},
  "decisions": [],
  "document_updates": [],
  "items": [],
  "acceptance": []
}
```

CLI owns `schema_id`, `plan_id`, `protocol_id`, initial `revision` and
`source_refs`; the agent owns the remaining semantic fields and a review
correction may increment `revision`. Remove `policy_context` and `code_handoff`
from the semantic plan. Their runtime facts are already known by the CLI, while
their useful semantic invariants belong in `goal`, decisions or plan items.

### 3.2 Minimum PLAN item contract

Each PLAN item provides everything needed to derive one CODE Work:

- stable local `id`;
- `title`, `summary` and implementation `details`;
- local `depends_on` item ids;
- non-empty `requirement_refs` owned by that PRT;
- semantic spine and preserved invariants;
- project-relative or `run://` `required_read` paths;
- optional project-relative `planned_write_areas` files or component
  directories, used only to coordinate likely concurrent overlap;
- focused checks, stop conditions and expected evidence.

`required_read` contains paths, not prose such as “owning service”. Project
paths are relative, RUN paths use `run://<RUN-ID>/...`, and semantic plans never
store host-absolute paths. A new output may appear in `planned_write_areas` before it
exists; a root read may not. These areas are soft coordination hints, never a
worker write allowlist.

Every obligation assigned to the PRT is referenced by at least one plan item.
Every assigned `AC-*` also has one acceptance entry linking the criterion to
the plan items and observable proof. A plan item cannot claim an obligation
owned only by another PRT.

### 3.3 PSET graph

Local `depends_on` defines the graph inside a protocol. The accepted PSET member
`blocked_by` topology supplies cross-protocol ordering.

For the first implementation, every root Work of a blocked member depends on
every terminal Work of the blocking member. This conservative projection is
deterministic and safe. Do not add cross-protocol plan-item reference syntax
until a real case demonstrates that the conservative edge is materially too
broad.

### 3.4 Deterministic CODE projection

PLAN finish derives `<RUN>/03-plan/code-work-batch.json`. Stable Work keys are
`<PRT-ID>:<PLAN-ITEM-ID>`. Each Work projection contains:

- source protocol, plan id, plan revision and item id;
- task text rendered from the plan item;
- requirement refs;
- resolved portable read/write paths;
- verification and stop conditions;
- derived Work dependencies.

The projection contains source plan checksums. It has no independent semantic
field that can disagree with PLAN.

Its minimum stored shape is:

```json
{
  "schema_id": "dd-flow/code-work-batch@1",
  "entry": "code",
  "sources": [
    {
      "plan_id": "PLAN-001",
      "protocol_id": "PRT-001-example",
      "revision": 1,
      "sha256": "<CLI-generated>"
    }
  ],
  "works": [
    {
      "key": "PRT-001-example:P1",
      "protocol_id": "PRT-001-example",
      "plan_id": "PLAN-001",
      "plan_item_id": "P1",
      "task": "<CLI-rendered from the plan item>",
      "requirement_refs": ["R-001", "AC-001"],
      "read_paths": ["apps/api/src/example.ts"],
      "write_paths": ["apps/api/src/example.ts"],
      "verification": ["pnpm --filter @example/api test"],
      "stop_conditions": ["Stop on a conflicting accepted invariant."],
      "depends_on": []
    }
  ]
}
```

The exact `task` renderer combines title, summary, details, semantic spine,
checks and stop conditions in a fixed order. CODE `work start` may enrich the
worker prompt with trusted runtime facts and the source plan item, but it must
not reinterpret or replace this assignment.

PLAN finish validates in one atomic operation and reports all independent
errors together:

1. every plan and aspect-map schema;
2. owned-obligation coverage and AC proof paths;
3. local and PSET dependency references;
4. graph acyclicity;
5. portable path syntax and path containment;
6. root read availability in accepted project/RUN state;
7. later read availability from at least one transitive predecessor when the
   path did not exist at entry;
8. write conflicts: several Works may name the same file only when their graph
   orders those writers; unordered writers are rejected;
9. aspect-map coverage and links to concrete plan items, decisions, acceptance
   or evidence;
10. deterministic batch generation and source checksums.

If any check fails, PLAN remains running and no new accepted batch/report is
published. Compact and full plans differ in reasoning depth, never in
obligation coverage or graph executability.

Before independent review, applicable aspects have review status `pending`.
PLAN cannot predeclare a future reviewer result as `pass`.

## 4. PLAN-REVIEW consumes and corrects PLAN

### 4.1 Review input and routing

PLAN-REVIEW receives accepted plans, aspect maps and the generated batch with
exact plan revision/checksums. Reviewers inspect semantic decisions, evidence,
obligation realization and graph executability. They do not repeat schema or
projection-format validation.

The existing routing remains:

- at least one genuinely fresh reviewer Session when review is enabled;
- compatible aspects grouped toward one capacity-aware wave;
- narrower groups for real trust, irreversible or hard-risk boundaries;
- one review pass by default;
- the orchestrator classifies findings and owns corrections.

### 4.2 Correction contract

The orchestrator applies accepted findings only to `plan.json` and the relevant
aspect map. It never edits `code-work-batch.json` and does not list that
generated path as if it were an agent-authored correction.

Advance the decision contract to `dd-flow/plan-review-decision@3`. Keep it
small: outcome, summary, finding decisions and a correction block containing
status, previous revision, changed semantic plan/map paths and concise summary.
Checksums, generated paths and registration facts belong to the CLI receipt and
stage report.

```json
{
  "schema_id": "dd-flow/plan-review-decision@3",
  "outcome": "accepted",
  "summary": "Concise evidence-backed decision.",
  "finding_decisions": [
    {
      "finding_id": "F-001",
      "decision": "accepted_fix",
      "reason": "Why the finding is material and applicable."
    }
  ],
  "correction": {
    "status": "applied",
    "previous_plan_revision": 1,
    "changed_paths": [
      ".memory-bank/protocol/PRT-001-example/plan.json",
      "run://RUN-001/03-plan/PRT-001-example/aspect-map.json"
    ],
    "summary": "What semantic defect was corrected."
  }
}
```

When no material correction is accepted, `correction.status` is
`not_required`, `changed_paths` is empty and the previous revision remains the
accepted revision. The generated batch never appears in `changed_paths`.

### 4.3 Finish and review-off

PLAN-REVIEW finish:

1. validates reviewer completion and the decision;
2. requires a PLAN revision increment when semantics changed;
3. reruns the same PLAN validator;
4. regenerates `code-work-batch.json` from final PLAN;
5. validates the resolved CODE handoff;
6. registers CODE Works atomically;
7. writes final before/after revisions, checksums, projection and registration
   facts to the deterministic receipt/report;
8. returns the exact CODE entry command.

When RUN `plan_review.mode` is `off`, the stage performs no model review and
creates no synthetic decision. The same deterministic final PLAN validation,
batch generation, handoff validation and CODE registration path still runs.

Accepted findings are fixed once. There is no automatic second review. A
deterministic validator may reject a broken correction, but the orchestrator is
not required to prove semantic correctness through deterministic code.

## 5. Stage handoff integrity

Every stage finish returns only information usable by the next stage now.

- Root `must_read` contains existing accepted SPECIFY, PROTOCOLIZE, PLAN and
  RUN artifacts generated by CLI.
- Future CODE outputs never appear in root `must_read`.
- A CODE Work read path exists at CODE entry or is produced by an ordered
  transitive predecessor.
- Unordered multiple writers, unresolved portable references, path escapes,
  stale plan/batch revisions and unknown `run://` references are rejected.
- Agent-authored prose may explain invariants or blockers but cannot override
  deterministic workspace, source or path facts.

The validator is stage-generic. It must not know task-priority values, archived
project semantics or another case-specific business rule.

## 6. Flow-pack changes

Update the beta pack as one matched change:

- `vnext/mb-sdlc-vnext-specify.json` and
  `vnext/mb-sdlc-vnext-protocolize.json`: SPECIFY result format becomes JSON;
- `vnext/specify.md`: explain the minimal JSON contract, the four large
  semantic sections, R/AC obligations and exact lifecycle commands;
- `vnext/protocolize.md`: define lossless obligation allocation rather than
  acceptance-only coverage or requirement paraphrase;
- `vnext/plan.md`: remove agent-authored CODE batch and explain PLAN-owned Work
  derivation, coverage and path requirements;
- `vnext/plan-review.md`: instruct corrections to PLAN only and distinguish
  semantic review from deterministic reprojection;
- `vnext/start.md`, indexes and handoff references: identify `specify.json` as
  SSOT and `specify.md` as projection.

Prompts remain normal project-flow instructions. They do not mention the eval,
golden answers or model comparison.

## 7. Engine changes

Keep stage-specific code in the existing service modules and extract only
shared deterministic logic with more than one real caller.

### SPECIFY

- add `src/schemas/vnext-specify.schema.json`;
- replace Markdown parsing in `vnext-specify.ts` with schema validation;
- implement the deterministic Markdown renderer;
- change stage data to `specify.json`, while reporting both JSON and Markdown;
- update help, lifecycle input and run guidance paths.

### PROTOCOLIZE

- update `VnextProtocolizeResult` in `vnext-contracts.ts`;
- add a schema for `vnext-protocolize-result@2` instead of template-only shape
  checking;
- replace acceptance-only validation with full obligation ownership;
- render exact R/AC statements into PRT/PSET documents.

### PLAN and projection

- advance `protocol-plan.schema.json` to the accepted `@3` contract;
- remove agent-batch discovery and related CLI options/examples;
- create one PLAN validation/projection function shared by PLAN finish,
  PLAN-REVIEW finish and review-off closure;
- derive and validate CODE Work graph/path ownership from PLAN;
- keep `code-work-batch.json` as a reportable projection, not an input SSOT.

### PLAN-REVIEW and CODE entry

- advance `plan-review-decision.schema.json` to `@3`;
- remove the requirement that agent correction paths include the generated
  batch;
- regenerate the batch and register Works only after final validation;
- generate root CODE handoff paths from accepted artifacts and runtime facts.

### Cutover

This is a breaking beta contract. Remove old readers and fallbacks in the same
change:

- no live `specify.md` semantic input;
- no `obligations.json`;
- no `acceptance_coverage`;
- no agent-authored `code-work-batch.json`;
- no `protocol-plan@2` or plan-review-decision@2 fallback in the new beta
  engine.

Historical eval reports are not migrated. A new matched beta engine/flow pair,
input checkpoint and canonical chain identify the cutover.

## 8. Verification

### Unit and contract tests

SPECIFY tests cover valid JSON, malformed JSON, all schema errors returned
together, missing/duplicate/wrong-prefix R/AC, empty semantic sections, stable
Markdown rendering, atomic failure and deterministic report hashes.

PROTOCOLIZE tests cover complete R/AC ownership, unknown/duplicate/missing
obligations, multi-member ownership, member without AC, no partial durable
writes, and exact-statement rendering.

PLAN tests cover obligation coverage, AC proof links, local/PSET cycles,
unknown dependencies, root missing reads, predecessor-produced reads, portable
RUN refs, path escape, unordered writer conflict, ordered shared-file writes,
deterministic identical projection and stale revision rejection.

PLAN-REVIEW tests cover no-change acceptance, semantic correction with revision
increment, invalid correction, batch reprojection, no manual batch requirement,
review-off closure, CODE registration atomicity and future output rejection in
root handoff.

### Integration diagnostics

Before creating canonical checkpoints, run one disposable chain across:

```text
SPECIFY finish
  -> PROTOCOLIZE ownership/materialization
  -> PLAN validation/projection
  -> PLAN-REVIEW correction or no-change
  -> CODE Work registration and start packet
```

Inspect semantic artifacts as well as lifecycle receipts. Repeat only while a
contract defect remains. This diagnostic is not a scored substitute for the
full eval.

## 9. Evaluation contract

Focused Judges evaluate:

- SPECIFY: complete, precise R/AC obligations; proportionate gap work; useful
  large semantic sections; portable PROTOCOLIZE handoff;
- PROTOCOLIZE: lossless obligation ownership, smallest valid topology and
  correct durable links/materialization;
- PLAN: grounded decisions, complete obligation realization, executable graph
  and falsifiable verification;
- PLAN-REVIEW: material semantic findings, evidence, prioritization, accepted
  correction and final CODE readiness.

Deterministic validity is flow evidence, not semantic-quality credit. A CLI
pass cannot hide a weak decision, and a harmless formatting issue cannot
outweigh a strong outcome.

Because the axes and matched pair change, old published weighted scores are not
directly comparable with the new run. Retained old candidates may be statically
rejudged under the new assessment with `evidence_completeness: limited`; old
historical scores otherwise remain in a separate lane.

The acceptance run is deliberately complete:

- focused SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW for Luna, Terra and Sol:
  12 Subject executions;
- one full E2E for each model: 3 Subject executions;
- fresh stage/E2E Judges under the updated assessment.

## 10. Implementation order

Implement in this dependency order so every step has a runnable check:

1. add SPECIFY schema, JSON finish and Markdown/report projection;
2. update flow manifests/prompts and SPECIFY tests;
3. add PROTOCOLIZE v2 ownership schema, validation and durable rendering;
4. advance PLAN schema, remove manual batch input and implement deterministic
   projection/path validation;
5. update PLAN-REVIEW decision/finish and review-off closure;
6. update CODE entry to consume only the validated generated graph;
7. update engine help, indexes, snapshots and all affected tests;
8. release one matched beta pair and run the integration diagnostic;
9. fix diagnostic defects without changing the case task;
10. commit/tag the accepted pair, create a new input checkpoint, and build a
    new canonical chain from SPECIFY entry;
11. accept all four stage-entry checkpoints and create untouched starters;
12. execute and judge the full 15-run comparison;
13. compare with the retained previous eval using the assessment-version rule;
14. promote to canon only after the full comparison is accepted.

## 10.1 Detailed implementation plan

This is the executable work breakdown for this specification.  Complete the
packages in order unless the listed dependency is already accepted.  A package
is not complete merely because its code compiles: its stated contract test or
diagnostic must pass.  Keep the change on the matched beta branches until
package 20 is accepted.

### Foundation and SPECIFY

1. **Freeze the cutover boundary.** Record the exact beta engine commit, beta
   pack commit, input case and assessment revision in the beta bundle index.
   Do not mutate historical RUNs or add a compatibility reader.
2. **Add the SPECIFY schema.** Add the closed `dd-flow/specify@1` JSON Schema
   to the engine and the project-local flow-pack schema directory.  It must
   enforce the four semantic sections, non-empty R/AC arrays and stable IDs.
3. **Replace SPECIFY semantic input.** Make `stage finish --stage specify`
   accept JSON only; collect parse, schema and obligation-ID errors in one
   response while leaving the stage running on failure.
4. **Implement the deterministic projection.** Atomically write normalized
   `specify.json`, then render byte-stable `specify.md`, reports and both
   hashes.  No stage may subsequently parse R/AC semantics from Markdown.
5. **Make the worker path self-sufficient.** Update start packets, help and
   the SPECIFY prompt to include the exact schema, a minimal valid example,
   pause/resume instructions and the exact JSON-stdin finish command.  The
   worker must not search the repository for a schema or a command example.
6. **Prove SPECIFY in tests.** Cover valid and invalid JSON, aggregate errors,
   duplicate/wrong R/AC IDs, empty sections, atomic failure, renderer
   stability and report hashes.  Update all fixtures to the new source.

### PROTOCOLIZE

7. **Advance the PROTOCOLIZE contract.** Add a closed
   `vnext-protocolize-result@2` schema and replace `acceptance_coverage` with
   `obligation_ownership`.  Remove the old field and every reader of it.
8. **Read accepted obligations once.** Load exact R/AC statements exclusively
   from `specify.json`; expose them in the PROTOCOLIZE start packet and fail
   closed if accepted input is unavailable or inconsistent.
9. **Validate lossless allocation.** Require every R/AC exactly once, valid
   non-empty member ownership, no unknown IDs, and at least one AC per member
   before any durable document is published.
10. **Materialize ownership deterministically.** Join ownership with exact
    accepted statements while rendering PRT and PSET documents.  Preserve the
    agent's topology, boundaries and roles, but never let paraphrase replace
    an obligation.  Add no-partial-write and exact-rendering tests.

### PLAN and the executable graph

11. **Advance the PLAN schema to `protocol-plan@3`.** Keep only semantic
    planning fields; move identity, source hashes, runtime policy and CODE
    handoff facts to CLI-owned projections.  Update every project-local schema
    and fixture at the same time.
12. **Remove agent-authored batches.** Delete batch input instructions,
    examples and validation paths from PLAN.  The only agent-authored outputs
    are a semantic `plan.json` and its aspect map.
13. **Build one shared PLAN closure.** Extract one deterministic validator and
    projector that all PLAN completion paths call.  It loads protocol ownership
    and accepted SPECIFY obligations, validates plan semantics, and is the
    sole writer of `code-work-batch.json`.
14. **Enforce complete realization.** Validate that every PRT-owned R/AC is
    referenced by one or more items, each AC has an observable proof path,
    and no item claims another PRT's obligation.  Aspect maps must point to a
    concrete plan item, decision, acceptance or evidence target.
15. **Validate an executable graph.** Check local and PSET dependencies,
    cycles, portable project/RUN paths, root-read availability,
    predecessor-produced reads, and ordered multi-writer ownership.  Use the
    conservative PSET root-to-terminal edge rule; do not introduce
    cross-protocol item syntax.
16. **Generate stable CODE work.** Project `code-work-batch@1` from the final
    plans with keys `<PRT-ID>:<PLAN-ITEM-ID>`, checksums, rendered task text,
    paths, verification and stop conditions.  Prove deterministic identical
    output for identical plans and rejection of stale or impossible graphs.

### PLAN-REVIEW, CODE entry and pack cutover

17. **Advance the review decision to `@3`.** Keep only the decision and
    semantic correction paths.  A reviewer/orchestrator may edit plans and
    aspect maps, never the generated batch; changed semantics require a plan
    revision increment.
18. **Unify review-on and review-off closure.** In both paths run the shared
    PLAN validator, regenerate the batch, validate the CODE handoff and
    atomically register CODE Works.  Review-off creates no synthetic decision
    and review-on does not automatically repeat a review after a correction.
19. **Harden CODE entry.** Construct root handoff from existing accepted
    artifacts and runtime facts only; permit a child read of a missing file
    only when an ordered predecessor writes it.  Reject future outputs in root
    input, stale revisions and unresolved `run://` references.
20. **Update the matched flow pack.** Change stage manifests, prompts, indexes,
    help snapshots and project schemas in one commit.  Prompts describe normal
    flow work—not the eval, a preferred answer or a model comparison.  Remove
    every old-contract reference rather than retaining a fallback.

### Acceptance and eval evidence

21. **Run mechanical and disposable integration gates.** Run typecheck, all
    unit/contract tests and a disposable chain from SPECIFY finish through
    CODE Work registration.  Inspect the semantic artifacts, lifecycle
    receipts and handoff; repair root defects and repeat only this diagnostic
    until the matched pair is sound.
22. **Create fresh evidence and compare models.** Commit/tag the accepted pair,
    create a new input checkpoint and canonical SPECIFY→PROTOCOLIZE→PLAN→
    PLAN-REVIEW chain, accept four stage entries and create protected starters.
    Then run 12 focused executions and three E2E executions for Luna, Terra
    and Sol under the updated assessment.  Keep old results historical or
    statically rejudge them as limited evidence; promote only after the new
    comparison is accepted.

### Explicit exclusions during implementation

- Do not change product behavior, business defaults or the task-priority case
  merely to satisfy the validator.
- Do not create `obligations.json`, a second plan graph, an agent batch
  workaround, a legacy parser, compatibility mode or a general workflow DSL.
- Do not let deterministic validation masquerade as semantic review, or let
  semantic prose override a deterministic fact.
- Do not create canonical checkpoints, starter Sessions or scored results from
  a partially migrated engine/pack pair.

## 11. Delivery ledger

The numbered packages in section 10.1 are the normative implementation order.
This ledger makes their ownership and completion evidence explicit.  Finish a
row before starting a dependent row; do not substitute a manual inspection for
the stated mechanical proof.

| Wave | Packages | Repository and change | Required evidence before the next wave |
| --- | --- | --- | --- |
| A — semantic intake | 1–6 | `dd-flow-cli`: SPECIFY schema, validator, atomic writer and projection. `dd-tasks`: identical local schema, manifests and normal-stage prompt. | Typecheck/build; SPECIFY contract tests; exact engine/pack schema parity; a valid JSON result renders identical Markdown twice. |
| B — lossless allocation | 7–10 | `dd-flow-cli`: PROTOCOLIZE v2 schema, ownership validator and renderer. `dd-tasks`: result contract, prompt, local schema and handoff references. | Contract tests reject unknown, missing and duplicated R/AC; durable PRT/PSET output contains the exact accepted statements. |
| C — executable planning | 11–16 | `dd-flow-cli`: PLAN v3 validator, coverage/path/graph checks and one batch projector. `dd-tasks`: PLAN schema, prompt and examples that author only semantic plans. | PLAN tests cover coverage, proof, graph and path failures; identical inputs produce byte-identical batches; no prompt or live reader accepts an agent batch. |
| D — review and CODE boundary | 17–20 | `dd-flow-cli`: decision v3, shared closure, review-off and CODE-root checks. `dd-tasks`: review/CODE prompts, manifests, indexes and help. | Review-on and review-off produce the same registered CODE graph for unchanged semantic PLAN; invalid corrections leave prior artifacts untouched; no future output is in CODE root input. |
| E — acceptance evidence | 21 | Both beta branches: matched prerelease versions, clean commits and a disposable lifecycle diagnostic. | `typecheck`, relevant test suites, schema parity, pack document checks, and one observed SPECIFY → CODE-registration chain all pass. |
| F — comparative proof | 22 | `dd-eval`: one new input checkpoint, canonical chain, starter registry, updated assessment and scenario evidence. | Four accepted stage entries, untouched starters, then 12 focused and 3 E2E completed and judged runs; reports record pair identity and all Session IDs. |

### 11.1 Exact execution sequence

1. Work only on the two matched beta branches.  Record each behavior change in
   this specification before or alongside its implementation; do not patch the
   stable canon while the behavior is unproven.
2. Implement waves A–D as one coherent breaking cutover: remove the superseded
   beta contract at its readers and prompts rather than teaching live code to
   guess which version it received.
3. At each wave boundary, run the smallest test set that falsifies the changed
   contract.  Repair the shared validator, renderer or handoff constructor
   rather than adding stage-specific exceptions.
4. Bump both prerelease identities and make one matched, clean engine/pack
   pair.  Build the engine with the exact pack identity embedded and verify the
   installed router selects it for the diagnostic RUN.
5. Run the disposable diagnostic on a new isolated workspace.  It is allowed
   to expose a root defect; discard it after diagnosis.  Do not score it, reuse
   it as a fixture, or change the user task to make it pass.
6. When the diagnostic is sound, tag the two exact commits and write one new
   immutable `dd-eval` input checkpoint that names both tags, versions and
   commits.  Historical checkpoints remain immutable comparison material.
7. Build a fresh canonical Subject chain from normal priming and normal user
   discussion. At each natural stage boundary, review the semantic result,
   capture the project/RUN state and frozen Subject Session, then make an
   untouched shared starter Session for each stage. Focused attempts fork that
   shared Session and explicitly select their evaluated model and reasoning on
   the first new message. Do not duplicate checkpoint Sessions or starters by
   model profile.
8. Only after the four checkpoints and shared starters pass the scored readiness
   gate, execute the fixed Luna/Terra/Sol matrix.  A Controller may answer a
   legitimate question substantively; it records the exchange for the Judge
   instead of treating it as a harness failure.
9. Judge outcome quality, flow reliability and efficiency independently under
   the accepted assessment.  Aggregate only after every declared run reaches a
   terminal state; publish comparison and golden-dataset recommendations as
   evidence, not as edits to the historical candidates.

### 11.2 Completion decision

The Controller may request canonical promotion only when wave F is accepted.
If a failure is semantic or a contract defect, return to the earliest affected
wave, issue a new beta pair and start a new canonical chain.  If it is only an
invalid disposable attempt or harness interruption, repair the harness and
repeat that attempt without mutating accepted checkpoint evidence.

## Definition of done

The change is complete only when:

- one agent-authored `specify.json` produces byte-stable `specify.md`;
- no live stage regex-parses R/AC from Markdown;
- every accepted R/AC is owned by PROTOCOLIZE and realized by PLAN;
- agents never author or repair `code-work-batch.json`;
- PLAN and PLAN-REVIEW use the same deterministic projection/validator;
- CODE root and child inputs resolve under the accepted graph;
- review-on and review-off both register the same valid CODE graph for the same
  final PLAN;
- all contract/integration tests pass;
- the new canonical chain and starter Sessions are accepted;
- the full Luna/Terra/Sol focused and E2E comparison is completed under the
  updated assessment.

Do not mutate the old canonical revision, starter registry or completed eval
results. Do not promote the beta pair before these conditions hold.

## 12. Operational implementation plan

This section turns the normative packages above into the one working order for
an implementation session.  It adds no contract and does not replace the
delivery ledger.  Its purpose is to make the intended end state, the boundary
between deterministic and agent work, and every acceptance checkpoint visible
in one place.

### 12.1 Target state

At the end of this change, the same accepted semantic fact moves through the
flow without being retyped by an agent:

```text
Subject writes specify.json
  -> CLI renders specify.md
  -> Subject allocates R/AC ids to protocol members
  -> CLI materializes exact owned statements in PRT/PSET documents
  -> Subject writes semantic plan.json and aspect map
  -> CLI validates it and derives code-work-batch.json
  -> Reviewer/orchestrator corrects only semantic PLAN artifacts
  -> CLI revalidates, reprojections and registers CODE Works
```

The intentional ownership split is fixed throughout the work:

| Owner | May decide or write | Must not do |
| --- | --- | --- |
| Subject | user intent, R/AC statements, slice boundaries, plan semantics, review decisions | write projections, runtime paths, hashes or CODE batches |
| Reviewer | identify material semantic defects and recommend/follow accepted corrections | substitute schema validation or edit generated runtime artifacts |
| CLI | validate structure and graph facts, render/copy projections, calculate hashes, register Works and transition lifecycle | infer missing business requirements or silently repair semantics |
| Judge | assess outcome quality, reliability and efficiency from preserved evidence | grant semantic credit merely because a deterministic check passed |

### 12.2 Work sequence

1. **Establish the exact beta baseline.** Record the engine and flow-pack
   commits, versions, input checkpoint and assessment revision in the beta
   index.  Work only on the matched beta branches.  Historical runs remain
   read-only evidence.
2. **Finish the SPECIFY cutover as one vertical slice.** Add the closed
   `specify@1` schema in both repositories, change the finish input to JSON,
   validate all independent errors together, atomically write normalized JSON
   and deterministic Markdown, then update the start packet and normal flow
   prompt.  Prove schema parity, atomic failure, stable rendering and report
   hashes before touching PROTOCOLIZE.
3. **Make protocolization an allocation step.** Replace the old
   acceptance-only coverage with full R/AC ownership.  Load the accepted JSON
   once, reject any incomplete or contradictory map before writes, and render
   exact assigned statements into PRT/PSET documents.  Preserve only the
   agent-authored topology and boundary explanation as prose.
4. **Make PLAN the only implementation source.** Advance to
   `protocol-plan@3`; remove runtime/handoff fields and every input path for
   an agent-authored batch.  The plan item contract must carry the semantic
   task, owned obligation references, portable reads/writes, checks, stop
   conditions and evidence.  No host-absolute path enters semantic PLAN.
5. **Implement one shared PLAN closure.** Use the same validator/projector at
   PLAN finish, PLAN-REVIEW finish and review-off closure.  It validates
   obligation realization, AC proof, local/PSET dependencies, cycles, path
   availability and ordered writers, then is the only writer of
   `code-work-batch.json`.
6. **Close review and CODE on the generated graph.** Advance the decision
   contract to `@3`; accept semantic plan/map corrections only, require a
   revision bump for semantic changes and regenerate the batch afterwards.
   Review-on and review-off both use the shared closure and atomically
   register identical CODE Works for an unchanged final PLAN.  CODE entry
   receives only existing accepted inputs or reads produced by ordered
   predecessors.
7. **Remove superseded live behavior.** Update stage manifests, prompts,
   help, indexes, local schemas and test fixtures in the same cutover.  Delete
   old readers and examples; do not retain a fallback parser, compatibility
   flag, parallel obligation list or secondary PLAN graph.
8. **Verify each cutover boundary cheaply.** After each vertical slice, run
   the smallest contract tests that can falsify it.  Before beta acceptance,
   run the complete engine contract suite, typecheck, lint, strict build,
   flow-pack document check and exact schema-parity check.  Repair a shared
   validator, renderer or handoff constructor at its root rather than adding a
   stage exception.
9. **Run one disposable lifecycle diagnostic.** In a new isolated project and
   runtime with the exact installed beta engine, execute
   `SPECIFY finish -> PROTOCOLIZE -> PLAN -> PLAN-REVIEW -> CODE registration`.
   Inspect semantic artifacts and lifecycle receipts, including the generated
   CODE graph.  A failed diagnostic is disposable; fix the beta pair and rerun
   only this diagnostic until the pair is sound.
10. **Freeze the accepted pair.** Commit and tag the exact clean engine and
    flow-pack commits.  Only then create a new immutable eval input checkpoint
    recording the pair identity, assessment identity and source project.
11. **Rebuild canonical evidence from the new boundary.** Start a normal
    primed Subject session and ordinary user discussion, capture the natural
    `specify`, `protocolize`, `plan` and `plan-review` entries in order, accept
    their project/RUN snapshots and create untouched starter forks.  Never
    splice an old downstream checkpoint into this new pair.
12. **Run the declared comparison, then decide promotion.** Execute the four
    focused stages for Luna, Terra and Sol plus their three E2E chains, all
    from starter sessions.  Judge semantic quality, flow reliability and
    efficiency independently.  Compare historical candidates only in the
    separate assessment-version lane.  Promotion is allowed only after this
    matrix and all acceptance evidence are complete.

### 12.3 Mandatory acceptance checks by transition

| Transition | Deterministic check | Human/Judge check |
| --- | --- | --- |
| SPECIFY -> PROTOCOLIZE | valid closed JSON, stable projection, both hashes | R/AC list is complete, precise and not implementation prose |
| PROTOCOLIZE -> PLAN | every R/AC is owned; each member owns an AC; no partial materialization | smallest valid topology and meaningful boundaries |
| PLAN -> PLAN-REVIEW | every owned obligation realized; graph, paths and writer order are valid; batch is a projection | grounded decisions, adequate verification and useful aspect coverage |
| PLAN-REVIEW -> CODE | final revision validates; batch regenerated; Works registered atomically | findings are material, evidence-backed and corrections improve the plan |
| beta pair -> scored eval | exact matched pair and clean disposable chain | canonical stage entries are semantically acceptable and starters untouched |

### 12.4 Stop and rollback rules

- A structural or lifecycle defect stops at the earliest affected package;
  fix that shared cause and rerun the smallest falsifying check.
- A semantic weakness found in a diagnostic does not get hidden by a schema
  rule.  Improve the normal stage prompt or the review method only when the
  weakness is systemic, then issue a new matched beta pair.
- A failed or interrupted disposable diagnostic is discarded, not edited into
  evidence.
- A new beta pair invalidates downstream canonical checkpoints.  Rebuild the
  chain from `specify-entry`; do not mutate already accepted historical
  records.
- No step may weaken a closed contract, preserve a legacy fallback or change
  the user task merely to make a test pass.
