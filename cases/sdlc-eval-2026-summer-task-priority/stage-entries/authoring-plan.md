# Task Priority SDLC Entry Pack: authoring plan

Status: prepared source map; not an accepted entry pack
Specification: `specs/017-deterministic-eval-runner-and-portable-stage-entry.md`
Case: `sdlc-eval-2026-summer-task-priority`
Pack name: **Task Priority SDLC Entry Pack**
Pack identity: `entry-pack:sdlc-eval-2026-summer-task-priority@<revision>`

## Purpose

Prepare the case-owned semantic content while the generic entry-pack and runner
code is implemented. This file is an authoring blueprint, not Subject input and
not a substitute for mechanical or semantic acceptance.

The current case resolves `cp-045-zcode-snapshot-git-beta-124`. Existing
REV-077 snapshots are useful source evidence. Their provider Session IDs,
absolute paths and `canonical-stage-checkpoint@2` records are not migrated into
the new pack.

## Files produced by the completed authoring pass

```text
entry-pack-source/stage-context.json
entry-pack-source/context-oracles/specify.json
entry-pack-source/context-oracles/protocolize.json
entry-pack-source/context-oracles/plan.json
entry-pack-source/context-oracles/plan-review.json
entry-pack-source/context-oracles/code.json
entry-pack-source/context-oracles/code-review.json
entry-pack-source/interactions/specify.json
run-profiles/build-entry-pack-reference-sol-high.json
run-profiles/qualify-entry-pack-terra-high.json
```

These are mutable authoring inputs. `canonical build` freezes them into:

```text
stage-entries/<REV>/entry-pack.json
stage-entries/<REV>/stage-context.json
stage-entries/<REV>/e2e.json
stage-entries/<REV>/specify.json
stage-entries/<REV>/protocolize.json
stage-entries/<REV>/plan.json
stage-entries/<REV>/plan-review.json
stage-entries/<REV>/code.json
stage-entries/<REV>/code-review.json
context-oracles/<REV>/<stage>.json
interactions/<REV>/<stage>.json
checkpoint-reviews/<REV>/<entry>.md
```

`<REV>` is allocated by `dd-eval runner canonical build`; do not reserve or
write it by hand.

## Initial task input

Use the exact flow trigger and concrete task request from
`prompts/subject-e2e.md`. `prompts/subject-discussion.md` asks for a discussion,
but the case does not preserve the assistant turn that would make it a complete
transcript. It is therefore authoring history, not Subject input; the pack must
not present two consecutive user messages as if a discussion had occurred.

If a future case truly starts after a discussion, its ordered task input must
contain the complete accepted role-ordered transcript or a separately accepted
pre-flow decision record with evidence. The runner never invents a missing
assistant turn or Controller summary.

Focused SPECIFY and E2E use the same task input. The old
`prompts/subject-specify.md` is duplicate material and is removed at cutover.
Downstream `subject-<stage>.md` files are not carried into the pack. Universal
stage instructions move to the flow-pack renderer; case-specific accepted
facts are indexed in the relevant stage entry.

## Root names

All source mappings below use restored logical roots:

- `project:` stable checkout at the input checkpoint;
- `workspace:` routed feature worktree when it exists;
- `run:` the active RUN created or restored by `stage start` inside the
  execution's `DD_FLOW_HOME`.

The final context source mappings contain no authoring-host absolute path,
REV-077 RUN identity or generated protocol/Work identifier. A captured focused
snapshot still preserves its internal flow IDs because its artifacts and graph
refer to them; dynamic roles keep those IDs out of the portable context
contract.

`stage-context.json` stores the case-specific mappings once. Focused entries
bind the selected slice to their restored accepted predecessor state. During
E2E the runner materializes one slice per boundary, and every `stage start`
binds its dynamic roles to that Subject's own current artifacts. A Subject
never receives another stage's slice early.

Every stage slice has its own hash. A correction to PLAN-only mappings
invalidates PLAN qualification and any explicit consumer of that slice, not
unrelated SPECIFY evidence. The whole blueprint hash still identifies the pack.

## Shared project orientation

Start with compact indexes, then name a deeper source only when its contents
are applicable to the stage:

- `project:.memory-bank/index.md`;
- `project:.memory-bank/dd-flow/index.md`;
- `project:.memory-bank/epics/index.md`;
- `project:.memory-bank/spec/index.md`;
- `project:.memory-bank/scenarios/index.md`;
- `project:README.md`;
- `project:package.json` for engineering/check entry points where relevant.

Archived Memory Bank trees are explicitly excluded. A clean Subject should not
need to discover which of the live and archived copies is authoritative.

The same logical orientation roles resolve against `project:` before a feature
workspace exists and against the routed `workspace:` after PROTOCOLIZE creates
it. A downstream slice does not silently fall back to the original checkout;
if both roots are intentionally needed, each source must state why.

## Entry source map

Concrete REV-077 paths below are authoring anchors for focused binding. A path
whose entity is created by the flow is represented in `stage-context.json` by
a dynamic role such as `current_protocol`, `current_feature`, `current_plan`,
`current_work_graph` or `current_code_evidence`. E2E resolves the role from its
own RUN; it never assumes the reference IDs `PRT-007` or `WRK-005`.

### E2E and SPECIFY

Required:

- the ordered initial task input above;
- shared project orientation;
- current project and runtime state before SPECIFY;
- active flow/engine identities and flow entry rule;
- SPECIFY gap-analysis and design-aspect method supplied by the flow pack.

E2E has the case terminal boundary `code-review`. Focused SPECIFY stops after
successful SPECIFY finish. Neither entry contains a downstream canonical
artifact.

### PROTOCOLIZE

Required predecessor sources:

- dynamic accepted SPECIFY result (REV-077 binds `run:01-specify/specify.json`
  as semantic SSOT and `run:01-specify/specify.md` as its projection);
- the captured HITL question and exact delivered canonical response;
- dynamic previous-stage report (REV-077 binds
  `run:01-specify/stage-report.json`) as lifecycle/result evidence.

Required project sources:

- `project:.memory-bank/epics/index.md`;
- `project:.memory-bank/epics/EP-001-task-management/index.md` when selected by
  semantic authoring;
- `project:.memory-bank/spec/index.md`;
- `project:.memory-bank/scenarios/index.md`;
- project Git/worktree policy selected by the flow renderer.

The feature/protocol files do not yet exist at this entry and must not be
borrowed from a later snapshot.

### PLAN

Required predecessor sources:

- dynamic accepted PROTOCOLIZE result, previous-stage report and workspace
  route (REV-077 binds them under `run:02-protocolize/`);
- dynamic `current_protocol` index and summary (REV-077 binds to
  `workspace:.memory-bank/protocol/PRT-007-task-priority/`);
- dynamic `current_feature` (REV-077 binds to
  `workspace:.memory-bank/epics/EP-001-task-management/features/FT-001-task-priority/index.md`);
- dynamic accepted scenarios (REV-077 includes
  `workspace:.memory-bank/scenarios/SCN-002-workspace-task-core.md`).

Applicable engineering sources are selected through these indexes:

- `workspace:.memory-bank/spec/engineering/index.md`;
- `workspace:.memory-bank/spec/product/index.md`;
- `workspace:.memory-bank/spec/system/index.md`;
- `workspace:.memory-bank/spec/operations/index.md`;
- `workspace:package.json` and relevant package manifests for check aliases.

The context oracle must verify that every requirement and acceptance obligation
from SPECIFY/PROTOCOLIZE is available for allocation into the plan.

### PLAN-REVIEW

Required:

- every PLAN input needed to trace obligations;
- dynamic `current_plan` (REV-077 binds to
  `workspace:.memory-bank/protocol/PRT-007-task-priority/plan.json`);
- dynamic PLAN aspect map (REV-077 binds to
  `run:03-plan/PRT-007-task-priority/aspect-map.json`);
- dynamic `current_work_graph` (REV-077 binds to
  `run:03-plan/code-work-batch.json`);
- dynamic previous-stage report (REV-077 binds
  `run:03-plan/stage-report.json`);
- review aspects and severity/repair policy supplied by the flow pack.

Reviewer context must be clean. Reference reviewer Work prompts/results are
for forensic comparison only and are not shown to a scored reviewer.

### CODE

Required:

- dynamic accepted reviewed `current_plan`;
- dynamic accepted `current_work_graph`;
- dynamic accepted PLAN-REVIEW decision and receipt (REV-077 binds them under
  `run:04-plan-review/`);
- dynamic previous-stage report (REV-077 binds
  `run:04-plan-review/stage-report.json`);
- applicable coding/documentation standards and package check aliases;
- routed workspace and Git policy;
- the per-Work context paths declared by the accepted plan.

The pack gives the coordinator enough information to execute the Work graph.
Each code worker receives its own Work context through `work start`; the root
CODE entry does not duplicate every worker prompt.

### CODE-REVIEW

Required:

- dynamic accepted plan and obligation mapping;
- the complete changed-file diff against the declared base;
- dynamic `current_code_verification` (REV-077 binds to
  `run:05-code/code-verification.json`);
- dynamic workspace readiness and CODE report;
- dynamic `current_code_evidence` directory (REV-077 binds to
  `run:05-code/checks/`);
- relevant dynamic Work results and repair attempts under the current RUN;
- dynamic accepted scenarios (REV-077 includes
  `workspace:.memory-bank/scenarios/SCN-002-workspace-task-core.md`);
- review aspects and material-severity policy supplied by the flow pack.

The evidence directory is one bounded directory source. The pack does not
enumerate every receipt/log filename.

Mechanical acceptance rejects a dynamic-role mapping that embeds a generated
REV-077 entity, RUN or stage path. The concrete paths above are review aids for
the author only; they are not copied into `stage-context.json`.

## Context oracles to author

Each oracle records required facts/source roles, not answer wording:

- SPECIFY: raw task preserved; archived-project scope remains unresolved until
  legitimate HITL; no implementation plan is leaked.
- PROTOCOLIZE: accepted requirements and HITL decision available; product
  placement, protocol split, scenario responsibility and Git route can be
  grounded.
- PLAN: every requirement/acceptance obligation can be traced; relevant project
  architecture, check aliases and worker-context responsibilities are visible.
- PLAN-REVIEW: complete plan, Work graph and aspect map visible; reviewer has no
  reference review conclusions.
- CODE: coordinator can start only graph-ready Work; every worker can obtain
  task, context, checks and output boundary without searching CLI help.
- CODE-REVIEW: reviewer sees the whole diff and complete verification evidence,
  can trace implementation to plan, and receives no golden findings.

## HITL material

Replace `interactions/specify.json` with `canonical-responses@1` for SPECIFY.
The existing response text in `interactions/clarification-task-priority.md`
becomes one immutable response item with topic and applicability metadata. The
fixture does not encode expected question wording or `after_pause` position.
All downstream stages declare HITL `forbidden` unless their accepted case
contract is deliberately changed.

## Acceptance evidence

Every entry review must record:

- mechanical validation receipt;
- rendered-context hash and leak scan;
- reviewer profile and semantic verdict;
- required-role coverage;
- unresolved limitations;
- clean-session qualification execution and observed context diagnostics;
- explicit human acceptance.

Extra file reads are evidence for analysis, not automatic failures. A context
miss is accepted only with a transcript/tool span showing that the Subject had
to rediscover a fact, path, rule or command the package was responsible for
naming.

## Qualification profile

Before semantic acceptance, execute every candidate focused entry once with:

- Codex via `dd-codex`;
- `gpt-5.6-terra`, reasoning `high`;
- one new empty Session per stage;
- one Codex root execution at a time and no competing eval on that harness;
- exactly one stage and no downstream continuation;
- complete available transcript and tool evidence;
- clean context analysis plus explicit human acceptance.

Store the diagnostics under the pending canonical build:

```text
qualification/specify/
qualification/protocolize/
qualification/plan/
qualification/plan-review/
qualification/code/
qualification/code-review/
```

For every Session inspect declared/undeclared reads, path searches, CLI help,
commands before `stage start`, unexpected HITL and rediscovery of accepted
facts. Classify behaviour rather than treating every extra read as a package
failure. Correct and rerun only affected entries; rerun every consumer when a
shared source role changes. Then run one clean E2E qualification to verify live
dynamic binding and stage-slice isolation across the entire contour.

The E2E qualification also uses Codex `gpt-5.6-terra` high. The reference-chain
profile uses clean Codex `gpt-5.6-sol` high to maximize the quality of fixed
predecessor inputs; both requested and observed profiles are recorded rather
than compiled into runner code.

Qualification output is diagnostic evidence. It is not a model score, a
canonical predecessor or a golden answer.

Use verdicts `qualified`, `package_gap` and `invalid_infrastructure`.
`qualified` asserts context sufficiency, not excellent stage output; a
separately recorded Terra quality defect does not force package churn.

## Preparation boundary

Can be completed before runner implementation:

- review and approve this source map;
- consolidate ordered task input;
- author canonical response descriptors;
- draft six context oracles;
- identify live project indexes and exclude archives;
- review REV-077 as evidence for missing roles;
- prepare Sol-high reference-build and Terra-high qualification profile
  content.

Requires the new contracts/runner:

- allocate the revision;
- capture fresh portable snapshots;
- calculate canonical hashes;
- render `stage start` context through the production renderer;
- perform leak/path/integrity validation;
- accept entries and write `entry-pack.json`;
- run focused Terra-high qualification diagnostics and clean E2E.

The pack is ready only after both groups are complete.

## Pre-implementation walkthrough

This table is the operational sanity check for the implementation. A row must
produce its stated boundary before the next row can start.

| Step | Operation | Expected boundary | Must not happen |
| --- | --- | --- | --- |
| 1 | Validate `entry-pack-source/` | all six stage slices, task input, response set and oracles are valid | provider Session starts to compensate for an invalid source |
| 2 | Start `canonical build` | pending revision and initial E2E/SPECIFY entry exist; no RUN exists yet | a provider Session ID becomes fixture input |
| 3 | Run reference SPECIFY | bootstrap `stage start` creates the RUN; successful finish stops the turn | PROTOCOLIZE starts before the SPECIFY boundary is captured |
| 4 | Accept and continue the reference chain | `canonical boundary accept` captures the next entry without prompting; `canonical resume` then starts its successor in the same reference Session | a later canonical artifact is copied into an earlier entry, or approval silently starts a turn |
| 5 | Qualify focused entries | six independent empty Terra-high Sessions each complete exactly one stage | qualification output replaces reference artifacts or affects scores |
| 6 | Qualify E2E | one empty Terra-high Session chain uses only its own downstream outputs | a focused canonical predecessor enters live E2E |
| 7 | Review and accept | all non-stale receipts exist; `entry-pack.json` and `case.json.entry_pack` are promoted atomically | a partially accepted pack becomes runnable |
| 8 | Commit the definition tree | case is `runnable`, Git definition tree is clean, snapshot roots validate | an uncommitted authoring change enters a scored run |
| 9 | Run a focused eval | selected snapshot restores, empty Subject starts, dynamic roles bind to accepted predecessors | provider history, starter Session or hidden warm-up is used |
| 10 | Run E2E | initial bootstrap starts a fresh RUN and every boundary is checkpointed before continuation | runner substitutes a canonical downstream result |

Expected HITL is the only mid-stage pause. A provider turn that ends without a
registered pause or successful stage finish is preserved as an incomplete
Subject result; the Controller does not guess that the model is waiting for an
answer.
