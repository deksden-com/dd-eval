---
file: 'beta/vnext-code-beta.1/specs/001-code-execution-verification-and-repair.md'
description: 'Root-orchestrated CODE execution with lossless worker context, deterministic checks, graph closure and bounded repair.'
status: 'DRAFT'
---

# 001 — CODE execution, verification and repair

## Goal

Execute the accepted PLAN as a graph of autonomous, bounded coding Works while
preserving all information required by a fresh worker. Deterministic commands,
check receipts, graph state and reports belong to the CLI. Agents own semantic
implementation, diagnosis and repair.

The target path is:

```text
accepted plan.json
  → deterministic code-work-batch.json
  → registered Work packets
  → capacity-aware implementation waves
  → focused Work checks
  → graph fan-in
  → aggregate CODE gate
  → repair Work when needed
  → CODE-REVIEW or ready_for_merge
```

## 1. Ownership and topology

The root Work created with the RUN remains the logical SDLC process. The same
orchestrator Session normally continues from PLAN-REVIEW into CODE. CODE does
not create a coordinator Work and does not launch a coordinator subagent.

All accepted CODE and repair Works are descendants of the root Work:

```text
root SDLC Work (orchestrator)
├── implementation Work
├── implementation Work
├── documentation or verification Work, when semantically needed
└── repair Work, only after a later aggregate failure
```

`stage start ... --stage code` continues the root Work in the observed
orchestrator Session, validates the accepted handoff, attaches the CODE stage
and returns graph state plus execution instructions. It must not start the
first implementation Work in the orchestrator Session merely because that
item sorts first.

The accepted `code-work-batch` has no CODE coordinator `entry`. PLAN-REVIEW
registers every item atomically under the root Work and returns their resolved
IDs. The generic Work batch command may retain an optional entry for another
flow that genuinely delegates a coordinator cohort; CODE does not use it.

The orchestrator may execute a tiny Work locally when reuse is allowed, but the
normal multi-item route delegates ready Works to child Sessions. This is a
routing decision, not a different graph.

## 2. PLAN owns worker-context semantics

PLAN has already grounded the accepted task in the project. It therefore owns
the semantic decision about what a fresh code worker must know. A CODE worker
must not repeat broad project discovery to compensate for an incomplete plan.

Every plan item must make the following self-contained:

- user outcome and component responsibility;
- exact accepted `R-*` and `AC-*` references;
- invariants and non-goals;
- concrete existing owner source, representative tests and local configuration;
- applicable feature, scenario, spec, ADR and operational references;
- applicable project coding/documentation standards;
- exact write scope and bounded discovery boundary;
- predecessor outputs that the Work consumes;
- focused checks, expected evidence and proof limits;
- stop conditions and unresolved current blockers.

The quality test is:

> A developer who knows the stack but has a fresh Session can execute the Work
> without the planning transcript, broad Memory Bank traversal or invention of
> missing requirements.

PLAN-REVIEW evaluates this property for every item. The CLI validates only the
mechanical subset: referenced paths, accepted obligation IDs, graph order,
write conflicts, required fields and input availability.

## 3. Worker micro-priming

The full project `prime.md` is not a CODE worker prompt. It is for a Session
before practical work is selected and includes flow/runtime methodology that a
bounded implementer does not need.

Every fresh CODE worker instead receives a small project orientation:

- `.memory-bank/index.md`;
- `.memory-bank/spec/engineering/index.md`;
- the project coding-standards document linked by the engineering index.

The PLAN item then adds only task-applicable material. A documentation guide is
included only when the Work changes that class of document. A scenario, ADR or
spec is included only when it governs the Work. MBB, dd-flow catalogs and all
project indexes are not default worker reads.

A reused Session may retain this orientation, but the rendered packet still
names the accepted source paths and hashes so its contract is inspectable.

## 4. Lossless Work packet

`plan.json` remains the semantic source. The CLI deterministically projects
each accepted item into `code-work-batch.json`. Registration snapshots that
projected object into the Work row as one nullable `payload_json`; it does not
create one database column per semantic field.

`payload_json` is a runtime projection, not a second authored plan. The
generated batch path, source plan revision and checksum remain its provenance.
The CLI rejects a packet whose source no longer matches the accepted PLAN.

A CODE payload contains:

```json
{
  "schema_id": "dd-flow/code-work-packet@1",
  "source": {
    "plan_id": "PLAN-007",
    "plan_item_id": "P1",
    "revision": 1,
    "sha256": "..."
  },
  "goal": {
    "user_outcome": "...",
    "component_responsibility": "...",
    "must_preserve": ["..."],
    "non_goals": ["..."]
  },
  "requirements": [
    {"id": "R-001", "statement": "..."},
    {"id": "AC-001", "statement": "..."}
  ],
  "task": "Markdown implementation instruction.",
  "required_read": ["project-relative/path"],
  "discovery_boundary": ["project-relative/path or a narrow search rule"],
  "write_scope": ["project-relative/path"],
  "checks": ["pnpm ..."],
  "expected_evidence": ["..."],
  "proof_limits": ["..."],
  "stop_conditions": ["..."]
}
```

Resolved requirement statements come from accepted `specify.json`; the PLAN
does not paraphrase them. Relevant acceptance rows and document updates are
projected from the accepted plan item relationships. Dependency results are
runtime data and are appended by `work start`, not stored in the packet.

The target PLAN item keeps the existing semantic split with one correction:

- `semantic_spine` owns outcome, responsibility, invariants and non-goals;
- `execution_context` owns `required_read`, `discovery_boundary`,
  `write_scope` and `stop_conditions`;
- `verification` owns `checks`, `expected_evidence` and `proof_limits`.

This removes the current duplication between `execution_context.checks` and
`verification.checks` without inventing another context object. Every declared
check is required. CLI derives stable receipt IDs from Work ID and list order;
the planner does not author check IDs or `required` booleans.

## 5. Rendered worker prompt

`work start` renders one complete prompt containing:

1. Work/RUN identity and immutable workspace root;
2. bounded project orientation;
3. goal, task, requirements, invariants and non-goals;
4. exact required reads and write scope;
5. completed dependency results;
6. declared checks, evidence and proof limits;
7. stop conditions;
8. exact finish/fail commands.

The worker does not search global CLI help, another RUN, planning transcripts
or eval materials. Missing essential context is reported as a specific Work
blocker; it is not silently recovered with an unbounded project scan.

## 6. Graph scheduling

CODE start exposes the accepted graph, ready Works and
`runtime.subagents.available_slots` when already observed. The orchestrator
launches at most:

```text
min(ready Work count, available slots)
```

Works with hard dependencies remain blocked. Works that can write overlapping
paths must be ordered. Path conflict validation covers equality and ancestor /
descendant containment, not only identical strings.

After every Work settlement, CLI returns or makes queryable:

- newly ready Works;
- blocked Works and their dependencies;
- completed, failed and active counts;
- the exact remaining graph.

The existing one-shot capacity observation is reused for the whole RUN. CODE
performs it only when delegation is useful and no accepted observation exists.
Completed disposable agents are closed so stale Sessions do not consume the
measured pool.

## 7. Work-local verification

PLAN supplies the required focused checks. The generated Work packet preserves
them and CLI executes them from the immutable workspace root.

The successful worker path is one completion call:

```text
dd-flow work finish <WORK-ID> --result-stdin ...
```

Before completion, CLI runs every declared check and stores a receipt
with command, start/end time, exit code, bounded stdout/stderr paths and source
workspace revision. The model does not author a `passed` claim.

If a required check fails:

- the Work remains `running`;
- the Work/Session link remains open;
- CLI returns all failing checks and exact evidence paths together;
- the same worker fixes the task inside its existing scope and repeats finish.

The semantic result remains small: summary, deviations and blockers. CLI adds
changed paths, check facts, Session facts and later usage projections.

Checks that are commands belong here. A semantic/manual inspection becomes an
explicit Work or later review; it is not disguised as a deterministic command.

## 8. Aggregate CODE gate

When no implementation Work remains active, the root orchestrator calls CODE
stage finish. The CLI performs one deterministic gate.

### Graph closure

- every required accepted CODE/repair Work is completed;
- no descendant is `created`, `running` or paused;
- all hard dependencies were consumed in order;
- accepted PLAN/batch revisions still match;
- no unresolved Work blocker remains.

### Structural obligation coverage

- every accepted `R-*` maps to at least one completed Work;
- every `AC-*` maps to completed implementation plus evidence at its declared
  current or later gate;
- every required document update has one completed owner;
- no accepted plan item disappeared from the runtime graph.

This proves traceability, not semantic correctness of the code.

### Project checks

The project owns a machine-readable check-profile source. PLAN selects the
applicable profile and adds feature-specific scenarios. CODE finish runs the
resulting accepted set once after concurrent mutation stops, for example:

- `git diff --check`;
- format check, lint, typecheck, unit/integration tests and build;
- applicable database, browser or scenario gates;
- documentation checks and changed-file Memory Bank lint when documentation
  changed.

The project profile, not the model at CODE finish, chooses these commands.
Manual/external proof remains an explicit later gate or named blocker.

Successful finish records check receipts, graph coverage and a deterministic
stage report, then returns CODE-REVIEW or `ready_for_merge` according to RUN
policy. It does not perform semantic CODE review inside the deterministic gate.

## 9. Repair after aggregate failure

A Work-local failure remains in the original Work. A failure discovered only
by the aggregate gate does not reopen a completed Work or rewrite its history.

The orchestrator classifies the failure and creates one bounded repair Work.
Any product change made after aggregate failure must belong to a registered
repair Work; the orchestrator does not perform an invisible direct edit.

The repair packet is composed deterministically from:

1. exact immutable payloads of the relevant original Work or Works;
2. their accepted results and check receipts;
3. the aggregate failure receipt, command, logs and affected paths;
4. the orchestrator's concise semantic repair objective;
5. narrowed write scope, exact checks and stop conditions.

The repair Work depends on every selected origin Work. Its default read context
is the complete original packet set plus the new receipt and result facts. Its
default write scope is the union of the selected origin scopes; any expansion
must be explicit in the repair objective. Its focused checks include the
failing aggregate command and the affected original checks. The complete
project gate is still rerun only at CODE finish.

When ownership is ambiguous, the orchestrator may select several origin Works
from the accepted path-ownership map. It does not invent a separate diagnostic
Work type: the bounded task may say "diagnose and repair" and must retain the
observed failure verbatim. Unrelated Work packets are not added for safety.

The original context is included, not paraphrased. The repair-specific delta
is a separate block so the worker can distinguish accepted intent from the new
diagnostic evidence. Planning transcripts and hidden reasoning are excluded.

A proposed command surface is:

```text
dd-flow work repair add \
  --run <RUN> \
  --from-check <CHECK-RECEIPT> \
  --origin-work <WORK> [--origin-work <WORK>...] \
  --task-stdin
```

CLI validates that origin Works and the receipt belong to the same RUN,
derives dependencies, snapshots original payloads and returns the normal Work
start command. The orchestrator owns the semantic selection of relevant origin
Works and the repair objective.

After repair completion, previous aggregate receipts are stale. CODE finish
runs the complete aggregate gate again. This beta does not implement a complex
impact cache.

## 10. PLAN Judge and golden worker contexts

Fresh-worker context sufficiency is an explicit PLAN outcome, not a minor
formatting property. The PLAN Judge evaluates every candidate item against a
case-specific golden worker-context set.

Each golden context names a semantic implementation responsibility rather than
a required candidate item ID. It records:

- essential project sources and tests;
- essential accepted requirements/acceptance;
- invariants and non-goals;
- expected write ownership;
- required focused proof;
- harmful or irrelevant context that should not be forced on the worker.

The Judge maps candidate Works to golden responsibilities semantically. A
different valid decomposition passes when the union of packets is sufficient,
non-duplicative and safely executable. Exact path spelling is required only
for real project files; prose need not match the golden wording.

The Judge separately reports:

- missing essential context;
- irrelevant context that causes rediscovery or scope drift;
- incorrect ownership/write boundaries;
- missing verification or proof limits;
- information present in PLAN but lost from the generated Work packet.

Golden contexts are hidden eval material. They never enter Subject prompts,
the product repository or CODE worker packets.

## 11. Deterministic evidence and reports

The CODE stage report is generated from SQLite and immutable receipts. It
contains:

- accepted PLAN/batch revision and checksums;
- root orchestrator Session and child Work/Session tree;
- Work counts and terminal states;
- requirement/acceptance coverage;
- focused and aggregate check results;
- repair lineage;
- changed paths and declared proof limits;
- next gate;
- timing and separately collected usage/tool-call facts when available.

The agent does not hand-author stage report JSON, Markdown, HTML, summary or
telemetry.

## 12. Non-goals

This beta does not add:

- a second CODE coordinator agent or coordinator Work;
- full `prime.md` for each code worker;
- a second plan/context database;
- automatic semantic diagnosis of a failed test;
- hidden code changes by the root orchestrator;
- per-Work commits or branches;
- automatic repeated CODE review;
- a scheduler daemon or generic workflow system.

## 13. Implementation plan

This is a clean beta cutover. Schemas, generators, consumers and fixtures move
together; there is no legacy fallback that silently accepts the lossy packet.

### Slice A — PLAN contract and project context

1. Update the PLAN schema, validator, example and rendered instructions so
   `execution_context` owns reads/discovery/writes/stops and `verification`
   alone owns checks/evidence/proof limits.
2. Require PLAN to select exact task-applicable project sources, tests and
   durable documents for every item.
3. Resolve the standard orientation from the project Memory Bank index and
   coding-standards link. Do not make the planner copy standard prose into each
   item.
4. Add PLAN and PLAN-REVIEW tests for a packet that is mechanically valid but
   insufficient for a fresh worker.

Primary CLI surfaces: `src/schemas/vnext-protocol-plan.schema.json`,
`src/services/vnext-plan.ts`, PLAN prompt rendering and PLAN-REVIEW validation.

### Slice B — lossless deterministic projection

1. Extend `code-work-batch` to carry the complete semantic spine, resolved
   requirements, bounded context and verification contract.
2. Derive it only from accepted PLAN/SPECIFY data; remove agent-authored batch
   repair paths.
3. Bind the projection to plan revision/checksum and prove identical input
   produces byte-identical output.
4. Reject unresolved reads, invalid requirement references, stale source
   revisions and overlapping unordered write scopes in one validation pass.

Primary CLI surfaces: `src/schemas/code-work-batch.schema.json` and the
projection functions in `src/services/vnext-plan.ts`.

### Slice C — Work registry and worker start

1. Add one nullable `payload_json` snapshot to the Work record and batch
   registration; do not add semantic columns for every packet field.
2. Preserve parent/dependency identity and source provenance atomically with
   the Work rows.
3. Make `work start` combine the payload, completed dependency results and the
   deterministic project orientation into one prompt.
4. Return exact finish/fail commands, current scope and missing-context blocker
   instructions in that same response.

Primary CLI surfaces: Work storage migration, `src/services/work-registry.ts`
and prompt rendering.

### Slice D — focused and aggregate verification

1. Make `work finish` execute every declared focused command before changing
   terminal state and record immutable receipts.
2. Keep a failed Work running and return all failures together to the same
   worker.
3. Make CODE finish validate descendant closure, dependency order, obligation
   coverage and selected project commands after mutation fan-in.
4. Generate stage JSON, Markdown/HTML summaries and evidence links
   deterministically; usage remains separately collectible telemetry.

Primary CLI surfaces: Work lifecycle, CODE stage lifecycle, check runner and
stage-report renderer.

### Slice E — repair

1. Add the bounded `work repair add` composition command.
2. Resolve selected origin packet(s), results and receipts from SQLite; accept
   only the semantic repair objective and any explicit scope override from the
   orchestrator.
3. Validate same-RUN lineage, create dependencies, render the normal Work
   prompt and retain repair lineage in reports.
4. Mark prior aggregate evidence stale and require the full CODE gate after
   repair completion.

### Slice F — evaluation and rollout

1. Validate `golden.worker_contexts` in the assessment contract and include it
   only in PLAN/PLAN-REVIEW Judge packets.
2. Score missing, excessive, incorrect and projection-lost context separately
   from formatting defects.
3. Add unit fixtures for packet projection/registration/rendering, integration
   tests for checks and repair lineage, and a focused CODE eval with at least
   one aggregate failure.
4. Run the PLAN → PLAN-REVIEW → CODE diagnostic chain before replacing the
   canonical checkpoint or extending the three-model end-to-end comparison.

## Acceptance

1. Every CODE Work prompt is sufficient for a fresh Session and matches its
   accepted PLAN item without information loss.
2. PLAN Judge packets include and score case-specific golden worker contexts.
3. CODE uses the root orchestrator and direct child Works; no false first-item
   coordinator exists.
4. Work finish cannot accept failed required checks.
5. CODE finish cannot pass an incomplete graph, uncovered obligation or failed
   project check profile.
6. Aggregate failures produce bounded repair Works carrying original context
   plus the diagnostic delta.
7. Any repair invalidates and reruns the aggregate gate.
8. Reports are deterministic, and semantic review remains a separate later
   concern.
