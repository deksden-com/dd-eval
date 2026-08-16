---
file: 'beta/vnext-plan-beta.1/specs/008-run-context-and-trusted-subagent-work.md'
description: 'RUN variables, deterministic Work/Session registration, one capacity observation and source-based usage.'
status: 'DRAFT'
---

# 008 — RUN context and deterministic Work/Session runtime

## Goal

Keep the runtime model small and truthful:

```text
RUN owns a Work tree
Session owns a Session tree
work_sessions records which Session executed which Work
hooks provide identity
transcripts provide usage
```

The model does not create a dd-flow Agent Turn entity. Provider `turn_id` is
raw hook/transcript metadata used by the usage parser, not a lifecycle object.
Work state belongs to dd-flow; Session/turn lifecycle belongs to the harness.

This specification replaces the older runtime portions of specifications
002, 003, 005, 006 and 007: prefixed Work/Session table names, synthetic
`TURN-*` rows, manual Desktop binding, launch tokens, per-stage capacity probes
and snapshot-delta usage aggregation are removed rather than retained.

## Evidence from EVAL-011

The failed PLAN-REVIEW run exposed four root causes:

1. Codex supplied one host `session_id`, a distinct `agent_id` and a distinct
   transcript for every subagent, but the hook stored only `session_id`.
   Subagents consequently overwrote one parent Session row and its transcript.
2. The fifth reviewer copied one character of a launch token incorrectly. The
   token was in the same model prompt as the Work id and added no trust.
3. Internal `TURN-*` rows represented Work executions, not real provider
   turns. A single real Codex turn could touch more than one Work.
4. Token counters are cumulative per Codex Session. A child transcript's
   `session_meta.id` equals `agent_id`, while `session_meta.session_id` names
   the host Session. Arbitrary checkpoint deltas therefore misattribute or
   double-count usage.

## 1. Minimal storage

The database is already owned by dd-flow. Use ordinary plural table names:

```text
runs
works
sessions
work_sessions
hook_events
usage
```

Do not add `flow_works`, `flow_sessions`, `flow_agent_turns`,
`run_session_links`, a capacity table or a probe-attempt table. This beta is a
clean schema cutover with no dual read, fallback or legacy alias.

### `works`

```text
work_id
project_id
run_id
parent_work_id nullable
task
depends_on_json
status
result nullable
launch_policy
result_schema nullable
created_at
started_at nullable
updated_at
completed_at nullable
```

Every Work belongs to one RUN and has at most one parent Work in the same RUN.
The parent relation is an acyclic hierarchy used for structured concurrency.
`depends_on_json` is the independent readiness DAG: a dependency exists only
when the predecessor result is required. A parent cannot complete while a
child Work is `created` or `running`.

`launch_policy` is exactly:

```text
reuse_allowed | fresh_agent_required
```

It is a precondition used by the orchestrator and checked at `work start`; it
does not make Work the owner of a Session. `result_schema` is a schema id or
null. When present, `work finish` validates the semantic answer and returns all
errors without completing Work.

Do not add Work type, stage, subject, executor, duplicated artifact fields or
a scheduler entity. The Markdown `task` contains the bounded assignment.

### `sessions`

```text
id
project_id
provider
session_id
agent_id nullable
parent_id nullable
transcript_path
model nullable
agent_type nullable
created_at
updated_at
```

`id` is the effective dd-flow Session identity:

```text
id = agent_id ?? session_id
```

For a root agent, `agent_id` and `parent_id` are null. For a Codex subagent,
`session_id` preserves the host Session, `agent_id` identifies the child
context/transcript, and `parent_id` identifies the actual parent Session in
dd-flow. A Session has at most one immutable parent. The Session hierarchy and
Work hierarchy are separate: one Session may execute several Work, and a child
Work may execute in the same Session when reuse is allowed.

### `work_sessions`

```text
id
work_id
session_id
started_at
finished_at nullable
start_hook_event_id
finish_hook_event_id nullable
```

This is the only mutable association between Work and Session. It permits one
Session to execute several Work and preserves another execution if a Work is
retried or handed off. Work status/result remain authoritative in `works`.

The RUN-to-Session relation is derived without another table:

```text
runs → works → work_sessions → sessions
```

### `hook_events`

Hooks store the sanitized provider facts they receive, including exact command
fingerprint, `session_id`, optional `agent_id`, provider `turn_id`, transcript
path, model, agent type and timestamps. `turn_id` remains here and in usage
source evidence only. There is no `turns` table or synthetic `TURN-*` id.

### `usage`

`usage` is a recalculable RUN/Session projection, not an append-only snapshot
ledger. Each row stores RUN id, Session id, `provisional|final|unavailable`,
token fields, observation time and source path/hash/mtime. Transcripts remain
the source of truth.

## 2. Deterministic Session registration

Agents never provide RUN, Flow, parent Session, Session id or agent id.

At root `stage start` or `work start`, the CLI knows
`work_id == run.root_work_id` and `parent_work_id == null`. The participating
hook supplies provider identity, so the CLI creates or reuses the root Session
with `parent_id = null` and opens its `work_sessions` link.

At a child `work start`, one database transaction:

1. claims the single-use matching hook event;
2. loads Work, RUN and parent Work;
3. finds the one open `work_sessions` link for the parent Work;
4. derives child Session id as `agent_id ?? session_id`;
5. reuses that Session when it already exists, otherwise creates it with the
   parent Work's Session as `parent_id`;
6. validates `launch_policy`;
7. opens the child Work/Session link;
8. changes Work from `created` to `running`;
9. returns the prepared task packet.

If the parent Work has no unambiguous open Session link, a fresh child cannot
start. The runtime does not guess from the latest Session. An existing
Session's parent never changes. When child Work runs in the same Session as its
parent, no new Session row or self-parent edge is created.

For `fresh_agent_required`, the effective child Session must differ from the
parent and must not already have executed another Work in this RUN. PLAN
reviewers and accepted capacity probes require fresh Sessions. Sequential CODE
Work may use `reuse_allowed`.

## 3. RUN variables and flow flags

RUN variables are cross-stage context stored authoritatively in SQLite and
projected under `variables` in root `run.json`. No `variables.json` exists.

```text
policy.*   resolved flow-control policy
runtime.*  observations and routing decisions for this RUN
user.*     bounded custom values supplied to the RUN
```

Each value contains `value`, `source`, optional short `reason` and
`updated_at`. Secrets, transcripts and tool output are forbidden.

Flow flags are the versioned policy group that produces `policy.*` variables.
They retain presets, precedence, mandatory floors and revisions; they are not
a replacement for all RUN variables. An accepted flag revision and its RUN
variable projection commit together.

Initial variables required by this beta are:

```text
policy.plan_review.requested_mode = auto | off | standard | deep
runtime.plan_review.effective_mode = off | standard | deep
runtime.subagents.available_slots = integer >= 0
```

There is no separate `need_plan_review` boolean. Generic agent mutation is
limited to bounded `user.*`; engine operations own `policy.*` and `runtime.*`.

## 4. Capacity observation through dispatch

There is no public capacity command. A RUN that never delegates never probes.
The first stage-specific `dispatch` that has promoted delegated Work does this:

1. if `runtime.subagents.available_slots` exists, pack against it;
2. otherwise create up to 15 minimal fresh probe Work under the current
   orchestrator Work;
3. return `capacity_probe_required` and exact token-free `work start` commands;
4. let the harness attempt those subagents concurrently;
5. each accepted probe holds its slot for approximately 60 seconds, calls
   `work finish` with a minimal result and exits;
6. the caller repeats the same stage-specific `dispatch`;
7. dispatch waits if an accepted probe is still running, otherwise counts
   distinct completed probe Sessions, cancels never-started probe Work, stores
   `runtime.subagents.available_slots` and creates the semantic wave.

The probe result does not contain an agent id; the hook already registered it.
Only available slots are projected into RUN variables. Probe Work/Session and
usage remain normal runtime facts, are included in total RUN cost, and are
excluded from semantic reviewer counts. Later launch refusal may reduce the
stored slot count; it never changes applicability or dependencies.

## 5. Token-free Work claim

Remove public `launch_token`, `work adapter-bind` and model-supplied identity.
Hook and CLI compute the same normalized fingerprint from:

```text
operation + work_id + canonical project_root
```

Option order, quoting, `--json` and a literal `DD_FLOW_HOME` prefix do not
change the fingerprint. The hook event is single-use, Work must be `created`,
dependencies must be complete and the database claim is atomic. A future
remote trust boundary may inject its own signed capability outside the model;
it is not part of this beta.

## 6. Uniform delegated Work lifecycle

For every reviewer, scout, verifier, code worker or accepted probe:

1. register Work or a Work batch;
2. return exact `work start` commands;
3. launch a subagent whose first action is that command;
4. let `work start` register Session/link and return task, dependency results,
   applicable RUN variables, bounds, result schema and exact finish/fail
   commands;
5. perform only the semantic task;
6. call `work finish` or `work fail` as the last flow-owned command;
7. let the harness end the provider turn after the agent returns.

`work finish` validates the result, stores it, closes `work_sessions`, completes
Work and takes a provisional usage observation. It does not claim to stop the
Session or provider turn.

## 7. PLAN aspect and reviewer result contracts

PLAN schema and instructions enforce:

```text
not applicable: coverage_mode=none, verdict=not_applicable
local check:    coverage_mode=self_check, verdict=pass|watch|needs_changes|blocked
delegated:      coverage_mode=grouped_subagent|focused_subagent, verdict=pending
```

PLAN finish rejects a delegated terminal verdict without accepted reviewer
evidence; it never silently rewrites the map. PLAN-REVIEW projects validated
results into the map. Corrected groups alone return to `pending`.

Reviewer output stays small:

```json
{
  "schema_id": "dd-flow/plan-review-result@1",
  "plan_revision": 1,
  "overall_verdict": "needs_changes",
  "summary": "Short conclusion.",
  "aspects": [
    {
      "aspect_id": "api_contract_design_review",
      "verdict": "needs_changes",
      "summary": "PATCH omission is ambiguous.",
      "evidence_refs": [".memory-bank/protocol/PRT-007/plan.json"],
      "findings": [
        {
          "severity": "high",
          "summary": "Omitted priority behavior is undefined.",
          "evidence_refs": [".memory-bank/protocol/PRT-007/plan.json"]
        }
      ]
    }
  ]
}
```

Every assigned aspect appears once. CLI assigns finding ids and adds Work,
Session, timing and usage provenance. Reviewers do not author infrastructure.

## 8. Usage calculation

Agents never run statistics commands. `work finish` records only the latest
available provisional source observation because the provider turn can still
produce reasoning, tools and a final answer afterwards.

One operator/controller command recalculates usage from source:

```bash
dd-flow stat usage --run <RUN> --project-root <root> [--session <sessions.id>] --json
```

Remove the duplicate `dd-flow run usage` command. `stat usage` always rereads
the selected transcripts, refreshes `usage` and returns:

```text
final        every relevant provider turn has task_complete
partial      at least one relevant provider turn is still active
unavailable  a required transcript/counter cannot be read
```

For the selected RUN the calculator:

1. obtains distinct Sessions through Work links;
2. reads each transcript once;
3. obtains relevant provider `turn_id` values from linked hook events;
4. builds `task_started → task_complete` windows in memory;
5. uses cumulative counter differences and counts each provider turn once even
   when it touched several Work;
6. sums parent and child Sessions, including probe Sessions;
7. persists current per-Session and RUN totals with source and observation
   time.

There is no persisted Turn table, checkpoint-delta ledger, stage-token split or
special two-RUN/one-turn machinery. The normal flow launches one RUN at a time.

Report fields are:

```text
total_tokens
input_tokens
cache_read_input_tokens
cache_write_input_tokens nullable
uncached_input_tokens
output_tokens
reasoning_output_tokens
```

Reasoning is a subset of output and is never added twice. Missing provider
fields remain null. Stage reports may show a clearly provisional observation;
final flow usage is RUN-level and is recalculated only after relevant provider
turns have completed.

Session inspection uses:

```bash
dd-flow stat run sessions ls --run <RUN> --project-root <root> --json
```

It returns Session id, provider `session_id`, optional `agent_id`, parent id,
role, Work count, current link count and transcript path. The Session tree is
stored independently; participation in the RUN is derived through Work links.

## 9. Terminal lifecycle and reports

PLAN-REVIEW supports `accepted`, `needs_changes`, `waiting_for_user`,
`blocked`, `failed` and `cancelled`. `requires_user` is only a missing product
decision without a safe default. Required reviewer launch failure is blocked;
engine failure is failed.

A terminal non-green finish settles every created/running child Work, closes
open Work/Session links, settles parent/root Work, retains the proposed CODE
batch and generates deterministic JSON/Markdown/HTML. RUN guidance remains on
PLAN-REVIEW until accepted/off or terminal and never opens CODE from completed
PLAN alone.

Stage reports derive Work and Session counts from SQLite. They do not count
hook snapshots, provider turns or usage measurements as Sessions. Final usage
is refreshed after the controlling agent response, not fabricated inside its
own finish command.

## 10. Required implementation changes

### Engine

- cut over tables/callers to `works`, `sessions`, `work_sessions`,
  `hook_events` and `usage`; delete synthetic turn storage and old aliases;
- share one deterministic Session-registration path between root stage start
  and Work start;
- preserve both hook `session_id` and `agent_id`, derive `sessions.id`, and set
  child parent from the parent Work's open Session link;
- enforce parent immutability, one unambiguous open parent link and
  `launch_policy` transactionally;
- remove launch tokens, adapter binding and identity flags;
- make stage-specific dispatch own the one RUN capacity observation;
- validate `result_schema` in `work finish`;
- make delegated PLAN verdicts pending until reviewer reduction;
- replace snapshot-delta aggregation and duplicate usage commands with one
  source-reading `stat usage` implementation;
- render terminal and non-green reports from Work/Session facts.

### Flow pack

- return exact token-free lifecycle commands in stage/Work packets;
- describe Work/Session ownership without Agent Turn state;
- tell orchestrators to repeat the same dispatch after probe completion;
- keep reviewer result and decision schemas compact;
- never instruct an agent to register identity or collect statistics.

### Eval

- archive Work tree, Session tree, Work/Session links and hook-observed raw ids;
- verify every delegated agent has one Session and a validated Work result;
- run `stat usage` only after the root and child agent responses return;
- score capacity, reviewer isolation, lifecycle and usage separately from
  semantic plan quality.

## Acceptance checks

1. Root Work start creates one root Session without an agent-authored id.
2. Four subagent hooks with one host `session_id` and four `agent_id` values
   create four child Sessions and do not overwrite the root.
3. A nested child Session receives the Session of its parent Work as parent.
4. Reused Session executes another Work without a new Session or self-edge.
5. Fresh-required Work rejects the parent or a previously used RUN Session.
6. One provider turn touching several Work is counted once without a Turn row.
7. `work finish` records provisional usage; later `stat usage` includes the
   agent's final response and becomes final after `task_complete`.
8. Local-only RUN creates no probe; first delegation probes once and later
   dispatches reuse the stored slots.
9. Delegated aspect rows remain pending until validated reviewer evidence.
10. Blocked/failed/cancelled PLAN-REVIEW leaves no active Work/link and never
    registers CODE.

## Non-goals

- no Agent Turn entity or synthetic Turn ids;
- no launch token, adapter binding or model-supplied identity;
- no Session scheduler, leases or cloud queue;
- no separate capacity command/table/artifact;
- no per-stage exact token allocation;
- no compatibility reads or fallback schemas.
