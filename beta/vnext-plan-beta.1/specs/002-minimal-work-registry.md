---
file: 'beta/vnext-plan-beta.1/specs/002-minimal-work-registry.md'
description: 'Minimal SQLite-backed task registry for agent Work inside one flow RUN.'
status: 'DRAFT'
---

# 002 — Minimal Work registry

## Goal

Give an orchestrator a small durable task list so it can plan more work than it
keeps in model context, execute the same graph sequentially or concurrently,
and collect child results. The registry is not a second Flow DSL or a generic
cloud scheduler.

## Work record

The agent-facing Work contract contains only:

```text
work_id
run_id
parent_work_id
task
depends_on
status
result
created_at
started_at
completed_at
```

`task` is Markdown and contains all semantic instructions, input references,
write paths, output expectations and checks. These are not duplicated into
typed Work fields. `result` is the worker's compact semantic handoff to the
parent. The same record represents grounding, planning, aspect, implementation
or integration work; meaning comes from the task and Flow position, not a Work
type or stage column.

Session and Agent Turn links are recorded through the trusted hook when the
harness provides them, but they are not required to define or schedule a Work.
The agent never supplies a session ID.

Every execution attempt has one immutable `flow_agent_turns` row with:

```text
turn_id
work_id
session_id
hook_event_id
status
prompt_path
result_path
created_at
completed_at
```

`session_id` and `hook_event_id` are nullable only when the harness provides no
trusted binding. Prompt/result files are immutable RUN artifacts; a failed
attempt receives a deterministic failure result. Retry creates a new Turn and
never rewrites the old one. `work finish` and `work fail` close the one running
Turn of that Work; absence or ambiguity is an error.

Agent Turn states are only `running`, `completed`, `failed` and `cancelled`.
They do not duplicate stage waiting or correction states.

## Physical storage cutover

The current beta `flow_works` table mixes a task with an unused partial Flow
interpreter. This beta replaces that schema rather than preserving it. The new
physical Work authority contains only:

```text
work_id
project_id
run_id
parent_work_id
task
depends_on_json
status
result
created_at
started_at
updated_at
completed_at
```

The following old Work fields are removed from schema, types, SQL, projections,
prompts and tests:

```text
flow_id
flow_version
stage_id
entry_id
next_action_index
wait_kind
context_path
```

They are not retained as internal aliases. Their current uses are evidence of
an incomplete second Flow interpreter rather than requirements of Work:

- `flow_id` and `stage_id` select hard-coded SPECIFY/PROTOCOLIZE handlers;
- `flow_version` is persisted but does not drive a general interpreter;
- `entry_id` is effectively always `default`;
- `next_action_index` is a hand-maintained cursor over three special-case
  actions;
- `wait_kind` duplicates RUN/session waiting state;
- `context_path` points at a path already derivable from the RUN stage layout.

Removing these fields also removes the special-case selector queries and root
Work mutation between stages. They are not replaced by a differently named
cursor.

### RUN Flow identity

Flow identity/version belongs to RUN, because RUN is the materialized Flow
launch. This cutover creates `dd-flow/flow-run@3`;
`flow_runs.flow_kind` is replaced throughout the RUN schema, types, commands,
projections, guidance, dashboard and tests by:

```text
flow_id
flow_version
```

`flow_id` identifies the whole launched definition, for example
`mb-sdlc-vnext`; it is not changed from `vnext_specify` to
`vnext_protocolize` as stages advance. `flow_version` is the accepted Flow
definition version. Neither field is copied into Work. The separate
`flow_sessions.flow_kind` classification (`planning`, `implementation`, merge
roles and similar session purposes) is not a RUN Flow identity and remains
unchanged.

This is a single schema cutover. New vNext code does not read `flow_kind` as a
fallback for RUN identity and does not publish both shapes. Legal stage
transitions and deterministic actions belong to the Flow/stage runtime. Stage
context and prompts live at their conventional RUN workspace paths and Agent
Turns. Wait state belongs to RUN/session state.

### Root Work

A root Work is the parentless logical process created with the RUN. Its `task`
states the requested Flow outcome and stop target; it may span several stages
and Agent Turns. It is not a stage cursor and receives no stage-specific
fields. It remains `running` while its Flow has unfinished child Work and may
complete only after all descendants are terminal and the Flow has reached an
allowed exit. Its `result` is the final compact Flow handoff, not a duplicate
RUN report.

When a later stage needs its own agent coordinator or may overlap another
stage, its accepted stage projection records one entry Work ID and all stage
tasks are descendants of that Work. `stage start` resolves that entry directly.
This runtime handle, plus parentage, partitions concurrent cohorts without
putting `stage_id` back on every Work.

The `flow-run@3` stage projection therefore adds one nullable field:

```text
stage_runs[].entry_work_id
```

It is null for a stage executed directly by the RUN root Work and contains the
accepted coordinator ID for a delegated/future cohort. It is a projection and
lookup handle, not another graph authority.

The database migration rebuilds the affected tables and all vNext
SPECIFY/PROTOCOLIZE/PLAN readers and writers in one cutover. It also removes
vNext dependence on `flow_jobs`; there is no compatibility reader, dual write,
job map or fallback status vocabulary. Beta databases that cannot be migrated
unambiguously must be recreated explicitly before launching a new RUN.

## Dependencies

`depends_on` is one JSON array on the Work record. The CLI loads the small
RUN-local graph, validates references and cycles in application code, and
derives readiness. A separate dependency table is outside this beta.

A Work is ready when:

```text
status == created
and every depends_on Work is completed
```

Readiness and blocked state are derived, never stored. A dependency is added
only when its completed result is required by the successor.

## States

Allowed persisted states are:

```text
created
running
completed
failed
cancelled
```

`work start` atomically changes `created` to `running`. `finish`, `fail` and
`cancel` perform terminal transitions. `retry` resets a failed Work to
`created` for another Agent Turn while preserving the failed Turn and error
history. It never retries an accepted semantic result: a rejected result gets
a new narrow corrective Work so accepted sibling findings remain accepted.

A parent cannot complete while any child is `created` or `running`. Failed or
cancelled children are terminal, but a successful parent/Flow gate must either
accept them as non-blocking, replace them with a successful corrective Work or
fail honestly.

Normal RUN completion requires a completed root Work and no non-terminal Work.
Explicit RUN cancellation atomically cancels every `created` or `running` Work
and open Agent Turn; a late worker finish is rejected. A controller may also
interrupt the external agent process, but runtime correctness does not depend
on successful interruption.

## CLI contract

The initial command surface is:

```text
dd-flow work add-batch
dd-flow work ls
dd-flow work show
dd-flow work deps list|add|remove|clear
dd-flow work delete
dd-flow work start
dd-flow work finish
dd-flow work fail
dd-flow work retry
dd-flow work cancel
```

The minimal invocation forms are:

```text
work add-batch --parent <WORK> --file <batch.json> --json
work ls (--run <RUN> | --parent <WORK>) [filters] --json
work show <WORK> --json
work deps list <WORK> --json
work deps add|remove <WORK> --on <WORK> [--on <WORK>...] --json
work deps clear <WORK> --json
work delete <WORK> --json
work start <WORK> --json
work finish <WORK> --result-stdin --json
work fail <WORK> --reason <text> --json
work retry <WORK> --reason <text> --json
work cancel <WORK> --reason <text> --json
```

A full Work ID resolves its project and RUN, so per-Work commands do not repeat
`--project-root`, `--run`, stage or session arguments. Stage prompts always
return full IDs and exact commands. Diagnostic short-ID resolution may use the
existing project-scoped resolver, but agent prompts never depend on ambiguity.

### Batch creation

`work add-batch` accepts one RUN, one default parent Work and a JSON file
containing:

```json
{
  "entry": "code-coordinator",
  "works": [
    {
      "key": "code-coordinator",
      "task": "Coordinate this CODE stage and integrate child results...",
      "depends_on": []
    },
    {
      "key": "implementation",
      "task": "Implement the accepted plan...",
      "depends_on": [],
      "parent": "code-coordinator"
    },
    {
      "key": "verification",
      "task": "Run the implementation-time checks...",
      "depends_on": ["implementation"],
      "parent": "code-coordinator"
    }
  ]
}
```

This file validates as `dd-flow/work-batch@1`: top-level fields are only
optional `entry` and required non-empty `works`; each Work permits only `key`,
non-empty Markdown `task`, `depends_on` and optional `parent`. Keys are unique.
There is no second PLAN-specific batch schema.

`key` is a batch-local reference. Optional `entry` names one local key and
causes the command to return its resolved Work ID as `entry_work_id`; PLAN
finish requires it for the CODE cohort. Dependencies and optional per-item `parent`
may name a local key or an existing Work in the same RUN. Omitting `parent`
uses the command's default parent. This permits one atomic coordinator/children
batch without adding a stage/type field. The CLI validates the complete
proposed graph and parent tree, creates all rows atomically, allocates Work IDs
and returns the key-to-ID map plus optional entry ID. One-item batches replace
a separate `create` command.

Parentage and execution dependencies are different relations. A child does not
depend on its parent completing: the parent normally remains running while it
coordinates children. The validator rejects parent cycles and a Work depending
on any of its ancestors, which would deadlock dependency readiness against the
ancestor's child-completion rule.

### Listing and readiness

`work ls` supports composable filters:

```text
--run <RUN-ID>
--parent <WORK-ID>
--status <state>
--ready
--limit <positive integer>
--include-results
```

Ready results use deterministic `created_at`, then `work_id` order. A separate
priority model is outside this beta. `work show` returns one complete Work.

### Dependency mutation

Commands use the unambiguous direction `WORK depends on --on OTHER-WORK`:

```text
work deps add <WORK> --on <OTHER-WORK> [--on <OTHER-WORK>...]
work deps remove <WORK> --on <OTHER-WORK> [--on <OTHER-WORK>...]
work deps clear <WORK>
work deps list <WORK>
```

Dependencies may change only while the target Work is `created`. Both Works
must belong to the same RUN. Self-dependencies and cycles fail atomically.
Repeated add/remove operations are idempotent.

### Safe deletion

`work delete` is only for a mistakenly added Work that is still `created`, has
never started, has no children and has no dependents. Started Work remains in
history and may be cancelled instead. This beta has no force-delete path.

### Retry

```text
work retry <WORK> --reason <text>
```

Only `failed` Work may be retried. The command records the reason, preserves
the failed Agent Turn, clears the current claim/timing fields and returns the
Work to `created`. Task and dependencies remain unchanged. A stuck `running`
Work must first be failed or cancelled explicitly; this beta has no lease-based
automatic reassignment.

## Start and completion

A newly launched subagent receives only the Work ID and exact start command.
`work start` validates readiness, claims the Work atomically, prepares current
context and returns the rendered prompt plus exact finish/fail commands.

PreToolUse treats the exact `dd-flow work start <WORK-ID>` invocation as a
participating command. It computes a canonical fingerprint from operation,
resolved project root and Work ID, records the real Session/Turn, and injects
the opaque hook-event ID into the command. CLI claims that event idempotently
before starting the Work. Desktop paths that execute the original command use
the same fingerprint through the unchanged-command claim path to claim the one
fresh matching event. Manual
`--session-id` and fuzzy recent-event selection are not supported.

An unchanged-command claim considers only unconsumed events within the short
hook window. No match leaves session binding honestly unavailable; more than
one match fails closed rather than guessing. A retry may reuse the same command
fingerprint because the previous hook event is already consumed and the new
PreToolUse invocation creates a fresh event.

`work finish --result-stdin` stores the compact result and completes the Work.
SQLite is authoritative for the result; CLI renders the Turn result file as an
immutable audit projection of the same bytes, not a second editable source.
The parent obtains all child statuses and optional results with one filtered
`work ls` call. The registry never parses the semantic task or result.

PLAN may prepare future CODE tasks, but they become registered and runnable
only through successful PLAN finish. The Work registry is the runtime graph;
it does not publish a durable authored `code-work-graph.json`.

## Explicit exclusions

This beta does not add:

- Work type, stage, subject, executor, priority or lease fields;
- separate input-artifact, output-path or verification fields;
- deterministic Work records;
- a dependency table;
- a scheduler daemon;
- arbitrary task-authored prepare commands;
- per-task templates or template variables;
- automatic reassignment of a running Work.

Add any excluded concept only after a demonstrated runtime requirement cannot
be expressed by the task, parent, dependencies, state and result.

## Acceptance

- Batch creation is atomic and returns stable generated Work IDs.
- Ready filtering is correct for independent, chained and fan-in graphs.
- Cycle, cross-RUN dependency, duplicate start and premature start attempts are
  rejected without partial mutation.
- Dependency add/remove/clear immediately changes derived readiness.
- Only never-started unreferenced Work can be deleted.
- A failed Work can be retried without losing its failed Turn history; a
  running Work cannot be silently stolen or reset.
- A completed child result remains readable after its agent context is gone.
- One Session may execute several Work through separate Agent Turns, while one
  Work start cannot be claimed by two sessions.
- No removed Flow-cursor field, old status or `flow_jobs` record participates
  in a new vNext RUN.
- Hook rewrite and unchanged-command claim paths bind the same Work start
  exactly once from the same canonical fingerprint.
