---
file: 'beta/vnext-plan-beta.1/specs/004-plan-quality-gate.md'
description: 'Consistent semantic and process quality gate for vNext PLAN evals.'
status: 'DRAFT'
---

# 004 — PLAN quality gate

## Goal

Evaluate whether PLAN produced a grounded, executable and portable
implementation design. Mechanical lifecycle correctness is necessary but must
not outweigh semantic defects.

## Review order

Review in this order:

1. mechanical validity and evidence availability;
2. semantic plan quality;
3. CODE Work graph quality;
4. process efficiency and observability.

A mechanically perfect report cannot compensate for a wrong or unusable plan.
Formatting and minor report defects are recorded after substantive findings.

## Verdict and severity

Each applicable criterion receives:

```text
pass
pass_with_findings
needs_changes
blocked
not_applicable
```

Findings use:

- `critical`: plan could implement the wrong user behavior, violate a trust or
  data boundary, or cannot be executed safely;
- `major`: material scope, grounding, implementation, verification, PSET or
  Work-DAG gap that must be corrected before CODE;
- `minor`: useful quality or efficiency correction that does not make the CODE
  handoff unsafe or materially incomplete.

PLAN may reach CODE only with no critical or major finding and no unresolved
current-gate blocker.

## Mechanical gate

- `protocol-plan@2` validates for every PRT.
- `plan-aspect-map@2` validates and has no unknown/pending required row.
- all referenced accepted sources exist and accepted hashes/revisions match;
- every PLAN requirement/criterion reference resolves to an accepted `R-*`,
  `AC-*` or durable specification requirement;
- Work graph tasks are non-empty, same-RUN dependencies resolve and the graph
  is acyclic;
- no runnable CODE Work was published before successful PLAN finish;
- stage report, timeline, exact rendered prompts, Work results and
  Work/Session links are readable;
- the finish receipt returns the exact next command or an explicit gate rather
  than making the worker search flow/help text;
- in the controlled Codex eval, every started Work has its trusted real Session
  association; `unavailable` is acceptable only for a declared unsupported
  harness and never counts as complete coverage;
- PLAN changed no application code and executed no CODE Work;
- generated reports are deterministic projections rather than agent-authored
  semantic alternatives.

Mechanical failure blocks acceptance but is reported separately from semantic
quality.

## Semantic checklist

### 1. Goal and accepted behavior

- Does every PRT plan preserve accepted SPECIFY behavior, constraints and
  non-goals?
- Is primary acceptance traceable into implementation and verification?
- Did in-place corrections preserve user intent and record their accepted
  source revisions?
- Is there any orphan work or unplanned scope expansion?

### 2. Adaptive depth

- Is every PRT at least `compact_plan`?
- Are breadth, novelty, uncertainty and failure impact evaluated separately?
- Does `full_plan` name a permitted trigger instead of inferring depth from
  surface count or aspect count?
- Is detail proportional rather than uniformly verbose?

### 3. Project grounding

- Are current owners, behavior, consumers, contracts and integration points
  supported by exact project/code/test anchors?
- Were all applicable surfaces investigated and irrelevant surfaces stopped
  with a reason?
- Did delegated grounding answer named questions without making unowned design
  decisions?
- Can a fresh CODE worker avoid rediscovering basic project facts?

### 4. Technical and document decisions

- Is the selected implementation the simplest project-compatible design?
- Are system/data/API/UI/security responsibilities coherent and non-duplicated?
- Were specs, ADRs, scenarios and runbooks created only on positive triggers?
- Do durable docs state stable contracts without narrating code or claiming
  unimplemented current behavior?
- Does every shared PSET document have one writer?

### 5. Plan-item executability

- Does every item state approach, ordered steps, required reads, write boundary,
  invariants, controls, pitfalls, stop conditions and completion?
- Are hard dependencies limited to consumed predecessor outputs?
- Do items form minimal useful implementation increments rather than arbitrary
  horizontal ceremony?
- Could a developer execute each item without the planning transcript?

### 6. Acceptance and verification

- Does every material criterion map to a check or scenario at an honest gate?
- Are happy, material negative/error and permission/data boundary paths covered?
- Are environment, fixtures/seeds, isolation, cleanup, rerun behavior, expected
  evidence and proof limits explicit where applicable?
- Are mental walkthrough, local tests, browser evidence, external verification
  and production claims kept distinct?
- Are manual/external gaps blocked or deferred precisely rather than silently
  treated as passed?

### 7. Operations and CODE bootstrap

- Is the applied policy context grounded in project owners?
- Are Git route, delivery/fixation, checks, workspace bootstrap, env/secrets,
  cleanup and later gates sufficient for CODE?
- Are release/deploy/publish/rollback/runbook concerns included only when
  applicable and classified honestly?
- Does CODE entry know exactly which deterministic preparation and baseline
  gate run before mutation?

### 8. Aspect coverage

- Is every catalog aspect classified with reason and accepted verdict?
- Are future planned artifacts kept distinct from artifacts actually reviewed
  during PLAN?
- Is coverage proportional: compact local work stays local and substantive
  compatible review uses useful grouping?
- Was plan depth kept independent from routing, so a compact vertical slice was
  not treated as one semantic review unit merely because it had one PRT/item?
- Are hard aspect dependencies real and soft `informs` relations non-blocking?
- Did the parent accept results per unit, preserve accepted siblings and retry
  only rejected/crashed work?
- Did all delegated workers review one immutable/read-equivalent snapshot?

### 9. PSET integration

- Does every member retain separate plan and acceptance ownership?
- Were shared grounding and durable decisions done once?
- Are cross-member gaps, overlaps, write conflicts and consumed-output
  dependencies resolved?
- Does integration correct only affected members and avoid a PSET megaplanning
  artifact?

Mark this section `not_applicable` for a single-PRT eval.

### 10. CODE Work graph

- Is there exactly one CODE coordinator entry Work for this stage cohort?
- Does the coordinator implement directly for the compact route or own
  dispatch/fan-in for the delegated route, without duplicating both?
- Does task prose trace every required plan item and acceptance contribution to
  at least one implementation Work?
- Is every Work justified by accepted plans rather than orchestration ceremony?
- Are shared initial, member-specific and final integration Works placed where
  they reduce duplication or preserve correctness?
- Can the graph execute sequentially with one worker and concurrently without
  unsafe write conflicts?
- Is every task self-contained after `work start` injects runtime facts and
  predecessor results?
- Can `stage start code` recover the cohort solely from the accepted coordinator
  ID, without a Work stage/type selector?

This is a semantic review of plans and task Markdown. The CLI validates graph
structure only and does not require a duplicate `covers` field.

### 11. Fresh-session portability

- Can PLAN continue from materialized SPECIFY/PROTOCOLIZE context in a fresh
  Session?
- Can each child planner/reviewer work without hidden root context?
- Can each CODE worker execute from its rendered Work prompt without reading
  the planning transcript?

### 12. Process efficiency

- Was stage start the first practical lifecycle command and did it prevent
  redundant help/preflight reads?
- Were searches bounded by named questions and stop conditions?
- Was capacity probed only for useful unknown fan-out?
- Were compatible Works packed into the minimum useful waves?
- Were accepted results reused rather than repeated?
- Did deterministic CLI work replace model-authored telemetry, reports and
  normalization?
- Were hashes, Git facts, wall clock and usage provenance produced by CLI
  rather than manual shell calculations or model-authored fields?

Efficiency findings are normally minor unless waste causes context loss,
missing results or a materially incomplete plan.

## Evidence sources

The reviewer uses, as applicable:

- accepted SPECIFY and PRT/PSET documents;
- relevant epic/feature/spec/ADR/scenario/policy sources;
- every accepted `plan.json` and aspect map;
- Work task/result list and dependency graph;
- exact rendered prompts and Session identities;
- stage reports/timeline/usage;
- targeted source/test anchors cited by grounding;
- the worker transcript only to explain process behavior, never as a substitute
  for a missing durable handoff.

## Eval separation

The task-priority PLAN eval is a single-PRT compact-plan case and marks PSET
integration not applicable. PSET scheduling, shared grounding/design, member
fan-out and cross-member CODE projection are evaluated by a separate case in
the same project or another controlled fixture. Results are not combined into
one score that hides which topology failed.

The single-PRT case proves stage semantics, schema cutover, local grounding,
one useful CODE projection and fresh-session portability. The PSET case proves
capacity probing, shared ownership, fan-out/fan-in, dependency waves and
cross-member integration. Passing the first never implies passing the second.
