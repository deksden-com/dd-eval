---
file: 'specs/006-lossless-obligations-and-executable-plan.md'
description: 'Preserve accepted obligations through PROTOCOLIZE and derive the CODE graph from PLAN as its single semantic source.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
extends: '004-protocolize-worktree-boundary.md'
---

# 006 — Lossless obligations and executable PLAN

## Goal

Make the path from clarified user intent to CODE mechanically lossless without
moving semantic decisions into deterministic code:

```text
SPECIFY obligations
  -> PROTOCOLIZE ownership
  -> PLAN implementation graph
  -> deterministic CODE Work projection
  -> PLAN-REVIEW semantic challenge and correction
```

The agent decides meaning, delivery boundaries, implementation and proof. The
CLI preserves identifiers, exact accepted text, graph integrity and file
references. No stage manually rewrites a downstream projection that can be
derived from the accepted source.

## Current defects

1. SPECIFY writes `R-*` and `AC-*` bullets in Markdown. The CLI finds their
   identifiers with regular expressions, but does not expose a structured list
   containing the exact statement and kind. This is machine-detectable, not a
   complete machine-readable obligation contract.
2. PROTOCOLIZE maps only `AC-*`. It manually compresses requirements into
   member scope and primary acceptance, so an accepted constraint, exception or
   negative rule can disappear even when all acceptance identifiers pass the
   current validator.
3. PLAN is asked to author both `plan.json` and `code-work-batch.json`. They
   describe the same implementation graph twice and can diverge. The supplied
   one-Work example also biases a model toward collapsing a multi-surface plan.
4. Current PLAN validation checks identifier existence and acyclicity, but not
   complete obligation ownership, CODE input availability, unique output
   ownership or consistency between the accepted PLAN revision and the batch.
5. PLAN-REVIEW asks the orchestrator to update PLAN and manually regenerate the
   batch. A mechanically valid review receipt can therefore coexist with a
   stale or non-executable CODE handoff.

## 1. SPECIFY obligation contract

`specify.md` remains the human-readable semantic source of truth. Do not add a
second agent-authored JSON result.

The two normative sections use one parseable bullet form:

```markdown
## Requirements

- R-001: Exact accepted requirement or constraint.

## Acceptance criteria

- AC-001: Exact observable acceptance statement.
```

Each material functional rule, non-functional constraint, preserved invariant,
exception and negative boundary receives one `R-*` entry. Each observable
acceptance obligation receives one `AC-*` entry. Context, rationale, research,
assumptions and verification notes remain prose in their natural sections and
must not be promoted to obligations merely to satisfy a counter.

At successful SPECIFY finish the CLI parses only these two sections, rejects
duplicates, empty statements, wrong prefixes and malformed bullets, and writes
`01-specify/obligations.json` as a deterministic projection:

```json
{
  "schema_id": "dd-flow/specify-obligations@1",
  "source": "specify.md",
  "obligations": [
    { "id": "R-001", "kind": "requirement", "statement": "..." },
    { "id": "AC-001", "kind": "acceptance", "statement": "..." }
  ]
}
```

The projection copies text exactly and is always regenerated from
`specify.md`; it is never edited by an agent. This is the only new SPECIFY
artifact required by this specification.

## 2. PROTOCOLIZE is allocation, not paraphrase

Replace `acceptance_coverage` with one `obligation_ownership` array. Every
obligation from `obligations.json` appears in exactly one ownership record and
names one or more valid temporary protocol member keys:

```json
{
  "obligation_ownership": [
    { "obligation_id": "R-001", "member_keys": ["primary"] },
    { "obligation_id": "AC-001", "member_keys": ["primary"] }
  ]
}
```

An ownership record is unique by obligation id. Multiple member keys are valid
only when the same request-level obligation genuinely crosses vertical slices;
they are not a way to copy every obligation into every protocol. Every protocol
member must own at least one `AC-*` criterion.

The PROTOCOLIZE agent must:

- choose the smallest valid single-PRT/PSET delivery shape;
- allocate every accepted `R-*` and `AC-*` without rewriting its meaning;
- define member goal, role, boundaries, dependencies and concise primary
  acceptance;
- create or link durable epic/feature/spec/ADR/scenario records only under
  their existing positive triggers.

The agent must not manually copy obligation statements into its result. At
finish the CLI joins ownership with `obligations.json` and renders the exact
accepted statements into each PRT/PSET handoff. Member scope remains useful
boundary prose, but it cannot replace or override owned obligations. The CLI
rejects missing, unknown or duplicate ownership records before publishing any
durable document.

## 3. PLAN is the semantic and graph SSOT

The agent authors `plan.json` and its aspect map. It no longer authors
`code-work-batch.json`.

Each PLAN item already supplies the semantic fields needed for one CODE Work:

- stable local item id, title, summary and implementation details;
- `depends_on`;
- owned `requirement_refs`;
- `execution_context.required_read` and `write_scope`;
- checks, stop conditions and expected verification evidence.

Keep this existing shape unless implementation proves one of those fields
cannot be projected unambiguously. Do not introduce a parallel Work DSL into
PLAN. For a PSET, local PLAN dependencies and the accepted protocol dependency
graph together define the global graph; the deterministic projection uses
stable `<PRT-ID>:<PLAN-ITEM-ID>` Work keys.

PLAN finish performs one atomic operation:

1. validate every plan and aspect map and return all discovered validation
   errors together;
2. require every obligation owned by that PRT to be referenced by at least one
   PLAN item, and every `AC-*` to have an acceptance entry and proof path;
3. validate local item dependencies and accepted cross-protocol dependencies;
4. derive `03-plan/code-work-batch.json` from the accepted PLAN files;
5. require every root `read_path` to exist in the accepted project/RUN state;
   a later Work may instead read a path produced by exactly one transitive
   predecessor;
6. reject unresolved paths, output ownership conflicts and dependency cycles;
7. record source PLAN revision/checksums in the projection and complete PLAN.

The generated CODE batch is a disposable deterministic projection. Its Work
task is rendered from the PLAN item; it contains no model-authored facts absent
from PLAN. Compact and full plans may differ in explanatory depth, but both
must preserve complete obligation coverage and an executable graph.

Aspect routing remains semantic. An aspect map records applicability and links
an applicable aspect to concrete PLAN item, decision, acceptance or evidence
references. Before independent review its review status is `pending`; PLAN
cannot declare that a future reviewer passed it.

## 4. PLAN-REVIEW contract

PLAN-REVIEW receives the accepted PLAN files, aspect maps and the generated
batch with their exact revision/checksums. Reviewers inspect semantics,
evidence and executability; they do not review JSON projection style or repeat
deterministic schema checks.

The orchestrator classifies findings and applies accepted corrections once to
the PLAN SSOT and aspect map. It never edits `code-work-batch.json`. On finish,
the CLI:

1. validates the review decision and correction references;
2. requires a PLAN revision increment when semantics changed;
3. reruns PLAN validation;
4. regenerates the batch from the final PLAN;
5. validates the resolved CODE handoff;
6. registers CODE Works atomically and returns the exact CODE entry command.

When review is off, the same deterministic PLAN validation/projection and CODE
registration path runs without reviewer dispatch or a synthetic review
decision. A review finding may cite a PLAN item or its derived Work key, but a
fix always targets the PLAN item.

The existing one-pass policy remains: accepted findings are corrected, then
the stage closes without an automatic second review. Deterministic validation
can reject an invalid correction, but the orchestrator is not required to
"prove" every semantic fix with deterministic code.

## 5. Handoff integrity

Every stage finish returns only inputs that the next stage can use now.

- CLI-generated root `must_read` contains existing accepted SPECIFY,
  PROTOCOLIZE, PLAN and RUN artifacts only.
- Future CODE outputs never appear in root `must_read`.
- A child Work input exists at CODE start or has exactly one transitive
  predecessor that owns that output path.
- Unknown `run://` references, multiple producers and stale PLAN/batch
  revisions are rejected.
- Agent-authored handoff prose may explain invariants and blockers, but cannot
  override the resolved deterministic paths.

This rule is stage-generic. Do not add task-priority-specific path or business
heuristics to the engine.

## 6. Evaluation changes

The Subject prompts remain ordinary flow prompts. They do not mention the eval
or teach the model the golden answer.

Focused Judges evaluate:

- SPECIFY: complete, precise and portable obligations plus justified gaps;
- PROTOCOLIZE: lossless obligation allocation and correct delivery topology;
- PLAN: grounded implementation decisions, complete obligation coverage,
  executable graph and falsifiable verification;
- PLAN-REVIEW: material semantic findings, prioritization, accepted
  corrections and final CODE readiness.

Deterministic validity is flow evidence, not semantic quality credit. A CLI
pass cannot hide a weak decision; a harmless formatting defect cannot outweigh
a strong outcome.

Because this changes both the matched engine/flow pair and the assessment
axes, historical published scores are not directly comparable. Retained old
candidates may be statically rejudged under the new assessment and labelled
with `evidence_completeness: limited`; the new run uses complete evidence.

## 7. Delivery and validation sequence

Use the shortest controlled beta loop:

1. implement the parser/projection and lifecycle changes in the matched beta
   engine and beta flow pack;
2. run unit tests for malformed obligations, complete ownership, plan coverage,
   projection determinism, path producers, conflicts, stale revisions and
   review-off/review-on closure;
3. run one fast diagnostic chain through
   PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE handoff;
4. fix contract defects until that diagnostic is semantically and mechanically
   sound;
5. create a new canonical revision from SPECIFY entry, capture all four stage
   entries, accept them and create new untouched starter Sessions;
6. run the full focused Luna/Terra/Sol matrix for SPECIFY, PROTOCOLIZE, PLAN and
   PLAN-REVIEW, then the three planned E2E executions;
7. judge under the new assessment and compare the new run with a clearly
   labelled static rejudgment of retained old evidence.

Do not mutate the old canonical revision or its results. Do not promote the
beta pair to canon before the diagnostic and full comparison are accepted.
