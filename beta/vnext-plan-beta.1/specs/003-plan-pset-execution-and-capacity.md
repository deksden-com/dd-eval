---
file: 'beta/vnext-plan-beta.1/specs/003-plan-pset-execution-and-capacity.md'
description: 'Grounding, PSET planning, aspect execution, capacity routing and CODE Work projection.'
status: 'DRAFT'
---

# 003 — PLAN/PSET execution and capacity

> Specification 008 supersedes this document's per-stage/ephemeral probe
> accounting and Session-binding details. Capacity is observed once at first
> useful delegation in a RUN and reused as a RUN variable; every accepted
> probe uses the same minimal Work lifecycle as other subagents.

## Goal

Use one Work abstraction for grounding, planning, aspect review and later CODE
execution. PLAN must preserve one semantic plan per PRT while producing the
actual CODE Work DAG that this RUN will execute. Capacity changes only the
number of concurrent assignments, never the semantic graph.

## Work and protocol graphs

PRT/PSET and Work represent different things:

- a PRT is an independently accepted delivery slice;
- a PSET coordinates those slices and their delivery relationships;
- a Work is one concrete agent assignment in the current RUN.

Projection is not one-to-one:

- one PRT may require several Works;
- one shared Work may serve several PRTs;
- a compact PRT may be implemented by one Work;
- initial foundation and final integration Works may sit outside any single
  member subtree while remaining traceable to their consumers.

PLAN Work and CODE Work have the same registry shape. They differ only by their
Markdown task and position in the Flow-managed execution. The registry has no
stage or type field.

## Root topology

The root RUN Work survives the Flow and owns child work across stages. A
representative PSET PLAN topology is:

```text
root RUN Work
├── shared grounding/design Work
├── PLAN Work for PRT-A
│   ├── optional grouped aspect Work
│   └── optional focused aspect Work
├── PLAN Work for PRT-B
├── PLAN Work for PRT-C
└── PLAN integration Work
```

The root cannot complete while live descendants remain. It may continue through
multiple Session interactions and stages. Child failures are handled explicitly; they
must not disappear from a successful gate.

## Grounding routing

The root planner derives grounding questions from accepted behavior, PRT/PSET
scope and project maps. The applicability categories are defined in 001; they
are not fixed worker packages.

Grounding stays local when one bounded scan can establish owners, current
contracts, integration points and verification contours. It becomes child Work
when all are true:

- the question is named and its answer affects a plan decision;
- the source boundary is substantive and read-only;
- it can be investigated independently of another question;
- parallel work is expected to reduce wall time or the result is shared by
  multiple PRT planners.

Compatible questions may share one Work. Typical—but not mandatory—bundles are
persistence/migrations/fixtures, API/auth/consumers, UI/browser/accessibility,
or verification/operations. The planner decides from actual task surfaces; it
must not create one worker per catalog category.

Every grounding task names its question, starting sources, discovery boundary,
required facts and stop condition. Its result includes source anchors, current
owner and behavior, invariants, safe extension points, risks, unknowns and stop
reason. The root validates and accepts facts before using them. Grounding Work
does not edit semantic plans or durable documents.

Shared grounding is performed once and its accepted result is supplied to all
consumers. A result may inform several Works without a hard edge; `depends_on`
is used only when a consumer cannot proceed without it.

## Shared PSET design

Before member fan-out, the root checks for design decisions shared by multiple
PRTs: schema/data boundaries, APIs, migrations, cross-slice contracts, common
scenarios, ADRs, workspaces or delivery topology.

When a shared decision is needed, the root may create a bounded research/design
Work, accept its result and update the shared spec/ADR/scenario itself. Member
planners receive one accepted version and do not concurrently write the shared
document. An unexpected shared issue found by a member is returned to the root
as a finding; the root resolves it and replans only affected members.

Every PSET member still receives its own `plan.json` and aspect map. PSET
topology does not dictate one Session per member:

- independent members may be planned in one worker wave;
- one available worker may execute the same member Works sequentially;
- one Session may take successive member Work;
- outputs remain separate regardless of execution packing.

`blocked_by_protocols` primarily constrains implementation/delivery and does
not automatically serialize PLAN. A member PLAN Work waits only for a concrete
result it consumes.

The old unconditional `before_first_code` user confirmation is removed. The
root selects the simplest feasible topology from project policy, actual Work
dependencies and available capacity. It asks the user only when alternatives
change material risk, cost, external access or delivery semantics and no safe
project default exists.

## Member planning and aspect work

Each member planner follows 001 and owns only its assigned PRT plan, aspect map
and PRT-local draft documents. It receives accepted shared context rather than
the full root Session transcript.

After drafting a plan, the member fixes an immutable or read-equivalent review
snapshot. All aspect Works in one wave review that snapshot. The parent does
not modify it until the wave returns.

Plan depth and review routing are independent. `compact_plan`, one PRT and one
implementation item do not imply `local_compact`. Local coverage is suitable
only for one genuinely tiny semantic unit or one short source scope. For
substantive independent read-only aspects, including a conventional compact
vertical slice spanning several contracts, group compatible units up to three
per Work and prefer one wave. A focused Work is used only for a genuinely
independent critical boundary. Soft `informs` context does not create a
dependency.

The member accepts grouped output per aspect. Accepted siblings remain accepted.
A rejected unit receives one narrow correction Work against the next draft
revision. A crashed or tool-failed Work may use registry retry. The final
member result records no hidden reliance on worker Session context.

## PLAN integration

After all member plans complete, one root integration Work checks:

- complete accepted-requirement coverage;
- one primary acceptance contribution per member;
- shared-contract consistency;
- gaps, duplicate scope and orphan plan items;
- actual consumed-output dependencies;
- conflicting write scopes and required serialization;
- scenario/fixture/evidence coverage;
- Git/workspace/delivery compatibility;
- feasibility of the proposed CODE Work projection.

It applies corrections to affected artifacts/Works and repeats only the
necessary review. It creates no PSET plan and does not repeat every member
aspect review.

The accepted integration verdict remains the integration Work result in
SQLite and is projected into the PLAN stage report. It does not require a
separate PSET verdict file.

## RUN workspace

All planning stays in one RUN:

```text
<RUN>/03-plan/
├── shared/
├── <PRT-A>/
├── <PRT-B>/
└── <PRT-C>/
```

Member agents write only inside assigned boundaries. Shared durable documents
have one root owner. Work state and dependencies remain in SQLite; there are no
authored PSET job maps, secondary RUNs or editable runtime graph files. CLI
refreshes the one generated Work projection required to inspect an archived
RUN without the live database.

## Capacity probe (runtime contract owned by specification 008)

Capacity is a runtime observation, not a plan decision or flow flag. The
runtime contract is owned by specification 008: no probe Work or Session is
created. The harness launches at most 15 independent leaf probes; each waits
60 seconds and returns exactly `AGENT-NN`, while doing no tool/file/child work.
The controller waits for all probes or 180 seconds total, terminates unfinished
probes, counts only exact-token completions, and stores only
`runtime.subagents.available_slots`. Probe launch requests and queued or
incomplete probes are not capacity.

Tiny or single-work paths never probe. Capacity affects packing only; it never
changes applicability, depth, dependencies, task contents or independent-proof
requirements.

## Dispatch algorithm

1. Register the complete currently known child graph with `work add-batch`.
2. Query ready Work.
3. If useful delegation exists and capacity is absent, let this dispatch run
   the probe handshake described above.
4. Select ready Work up to stored capacity.
5. Launch each returned ID with the exact `work start` instruction.
6. Workers execute the rendered task and call `work finish` or `work fail`.
7. Query ready Work again; completed dependencies expose the next wave.
8. When every required child result is accepted, resume the parent for fan-in.

The same graph runs with capacity one or many. Failed launch attempts leave
unclaimed Work in `created`; the graph is not rewritten. A reusable Session may
execute sequential Work.

## CODE Work projection

Per-PRT plan items are semantic implementation intent. PLAN projects them into
the concrete Work DAG for the immediately following CODE stage.

A CODE Work task contains, in Markdown:

- goal and accepted plan-item/PRT references;
- required context and accepted predecessor results;
- implementation assignment and ordered steps;
- write boundary and preserved invariants;
- checks and stop conditions;
- compact completion/result contract.

The root may create:

- one CODE coordinator Work for the stage cohort;
- one shared initial Work consumed by several PRT implementations;
- one or several implementation Works for a PRT;
- precise cross-PRT dependencies;
- a final implementation integration Work;
- implementation-time checks needed before the later readiness gate.

Every required plan item maps to at least one CODE Work, every CODE Work maps
back to accepted plan/acceptance in its Markdown task, and no accepted
requirement is orphaned. The root PLAN integration review verifies this
semantically; the generic Work CLI does not add a parallel `covers` field or
parse implementation meaning from task prose. READINESS later compares actual
diff/evidence with the accepted plans regardless of which Works completed.
The Work DAG may be more precise than `blocked_by_protocols`; protocol
dependencies set constraints but do not require one Work per PRT.

PLAN semantically describes later readiness, review, merge and delivery gates,
but materializes only the next CODE DAG. Later stages create their own Works
from actual diff/evidence rather than stale speculative tasks.

The proposed CODE batch is a temporary PLAN finish input. Its top-level CODE
coordinator is a child of the RUN root Work; every implementation/check Work
is a descendant of that coordinator. The accepted PLAN stage projection stores
the coordinator Work ID by creating the CODE stage projection in `pending`
state with `entry_work_id` set. `stage start code` changes that projection to
`running` and claims the referenced coordinator. This partitions the cohort
without putting a stage/type field on every Work.

PLAN integration
semantically reviews plan-item/acceptance coverage and write conflicts. PLAN
finish validates the accepted semantic verdict plus all plans, maps, task
presence, dependency references and cycles, then registers the batch
atomically. On failure no runnable CODE Work is published. SQLite becomes
runtime authority; there is no durable authored `code-work-graph.json`.

This deliberately separates two kinds of coverage:

- aspect coverage remains explicit in `aspect-map.json`, because every
  catalog aspect must receive an applicability decision and verdict;
- plan-to-CODE coverage is a semantic quality judgment over plan items,
  acceptance and Work task Markdown, not another stored edge set.

A machine `covers` array would duplicate prose references without proving that
the assignment is sufficient. PLAN integration performs the earlier semantic
check; READINESS performs the stronger later check against actual code and
evidence. Structural CLI checks stay deterministic and small.

## CODE stage start versus Work start

`stage start code` and `work start` have different entry scopes and are never
both required from one worker.

The root CODE worker calls `stage start code` exactly once. The command resolves
and atomically starts the CODE coordinator Work recorded by PLAN, registers its
Session link, and performs stage-wide deterministic preparation:

- validate the accepted PLAN handoff and registered CODE Work graph;
- materialize/revalidate the selected workspace/worktree and bootstrap receipt;
- resolve policy, baseline checks and current Git/runtime facts;
- render the coordinator prompt and list its ready child Work IDs;
- register the root Session through the trusted stage-start hook event.

Each delegated CODE worker calls only `work start <WORK-ID>`. The task registered
by PLAN already contains the canonical CODE worker instructions and its
specific assignment. `work start` adds live per-Work facts, accepted dependency
results, workspace/Git state and exact completion commands. The Work-start hook
records provider `session_id`, optional child `agent_id`, raw `turn_id` and
transcript path, registers/reuses `sessions.id = agent_id ?? session_id`, and
opens the Work/Session link.

In a compact route the CODE coordinator task contains the implementation itself
and has no child implementation Work. The root worker calls only `stage start
code`, receives that task with live context, implements it and finishes the
coordinator. In a delegated route the coordinator task is orchestration/fan-in;
its children call only `work start`. Delegated workers never repeat stage
start, workspace bootstrap or global baseline preflight.

The root closes the cohort with `stage finish code`; that command validates the
stage result and atomically finishes the coordinator Work. The root does not
also call `work finish` for the coordinator. Delegated children always close
with `work finish` or `work fail`.

PLAN finish deterministically builds coordinator and child tasks by combining
each accepted assignment with the applicable canonical CODE instructions. This
reuses the existing prompt renderer but introduces no per-Work template
selector: every task is self-contained when stored, while stage/work start
supplies only live runtime context.

## Work prompt rendering

The stable Work `task` is plain Markdown. `work start` renders the authoritative
execution prompt from one internal envelope:

```text
<work>ids and parent</work>
<runtime_context>project, workspace, cwd and Git facts</runtime_context>
<dependency_results>completed predecessor results</dependency_results>
<task>stable Markdown assignment</task>
<completion>exact finish and fail commands</completion>
```

The start call performs universal deterministic preparation: readiness and
permission checks, current project/workspace/Git facts, dependency-result
collection, optional hook binding, rendering and exact prompt persistence.

Stage-specific deterministic preparation stays in Flow actions. The registry
does not accept arbitrary prepare commands or become another Flow DSL. Listing
returns stable task data and does not render every live prompt; a preview
renderer remains deferred until a demonstrated debugging use case needs it.

## Acceptance cases

1. A tiny one-unit PLAN may stay local without a probe; a compact-depth
   one-PRT PLAN with substantive independent aspects uses grouped one-wave
   review when capacity permits. Both create one useful plan and at least one
   CODE Work.
2. Independent grounding/member/aspect Works execute in one wave when capacity
   allows and sequentially with capacity one, without graph changes.
3. Shared grounding/design is performed once and supplied to every consumer.
4. Member planners cannot race on one shared spec/ADR/scenario.
5. Strict dependencies delay only actual consumers; soft context does not add
   a wave.
6. Grouped aspect review preserves per-unit verdicts and correction retries only
   a rejected unit.
7. PSET integration cannot accept a failed member, orphan requirement, write
   conflict or incomplete CODE projection.
8. Successful PLAN atomically publishes a traceable CODE Work DAG; failed PLAN
   publishes none.
9. The same CODE DAG is executable by one Session sequentially or several
   Sessions concurrently.
10. CODE stage-wide preparation and coordinator claim run once; each delegated
    worker performs only its own `work start` and cannot race global bootstrap.
11. Exact rendered prompts, Work results and hook-associated real sessions are
    available for post-run eval when the hook supplies the association.
