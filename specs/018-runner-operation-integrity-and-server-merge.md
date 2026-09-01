# Specification 018: Runner operation integrity and server MERGE execution

Status: implementation contract
Date: 2026-08-31
Owner: `dd-eval`
Affected repositories: `dd-eval`, `dd-flow-cli`, `dd-memorybank`
Extends: specifications 017 and Memory Bank SPC-012

## Purpose

Make a runner execution safe to resume and make `MERGE` with
`merge_mode=server` a normal evaluated stage. This contract first removes the
unsafe operation split, then records the small follow-up that will converge
live and recovery decisions without changing behavior.

## Decisions

### One durable operation registry

`events.jsonl` is append-only evidence.  For every productive operation its
`operation_id` has at most one semantic terminal result.

- a cross-process journal lock serializes `read → sequence → append`;
- a per-operation lock serializes an operation's observation and transition;
- a repeat with the same terminal type and canonical result hash is an
  idempotent historical duplicate and is folded while reading;
- a different terminal type or result hash is `journal_conflict`;
- a completed operation returns its recorded result to every caller;
- `storage ls/status` reports a conflicting journal for that execution but
  continues to report other executions.

The runner state comes only from declared execution lifecycle events, never
from an incidental `data.state` in an adapter or Work event.

### One execution reducer — staged follow-up

The present change makes the productive operation registry common. The next
small refactor will make live execution and `runner resume` call one reducer.
Given restored RUN state, provider observation and the operation registry, it
will return exactly one action: wait, prompt the Subject, resume registered
HITL, drive fan-out, run the server MERGE executor, capture a candidate, or
fail. A recovery path may observe and finalize but never invent a new Subject
turn or a second MERGE executor. This is not a generic orchestration DSL.

### Server MERGE is a stage executor

When the persisted RUN execution profile says `merge_mode=server`, the
coordinator Session does not receive a `MERGE` launcher.  Instead the runner:

1. materializes a `dd-flow/agent-profile@1` from the selected Subject profile;
2. invokes `dd-flow merge serve --once` in the execution's isolated runtime;
3. observes the request, Work, Stage and server-launched Session;
4. accepts the boundary only when their terminal states agree.

`same_session` remains the normal Subject-stage executor.  The first version
uses the resolved Subject model/profile for server MERGE; per-stage model
overrides are deliberately outside this contract.

### One contour authority

An accepted entry pack must exactly match `case.json.flow.contour` and
`terminal_stage`; its blueprint and entries cover the focused contour. E2E
starts directly from the case input checkpoint. A historical package is never
rewritten; only a proven change to a saved stage start context invalidates that
entry and its downstream dependants.

### Execution engine is pinned outside the stage entry

Before restoring or starting an execution, the runner materializes a private
`$DD_FLOW_HOME/bin/dd-flow` shim for the selected execution engine. Stage-entry
packages contain start context, not executable engine bytes. The shim exports
its own absolute path as `DD_FLOW_BIN`.
The first lifecycle command explicitly sets both `DD_FLOW_HOME` and
`DD_FLOW_BIN` and invokes that absolute shim; every harness daemon and
merge-server process receives the same absolute shim through its explicit
adapter argument. `PATH` remains a convenience only. `DD_FLOW_HOME` by itself
is not enough: a host-global `dd-flow` binary may otherwise execute a different
local build. The resolved engine identity is execution evidence.

### Engine-pinning implementation plan

1. The runner installs the private shim and emits the exact standalone
   `DD_FLOW_HOME=… DD_FLOW_BIN=… <absolute-shim> stage start …` launcher.
2. Stage and Work prompts treat the returned engine/check-profile contract as
   authoritative; an agent neither searches for an ambient CLI nor rewrites a
   profile to fit one.
3. Before accepting a CODE Work, `dd-flow work finish` rereads and validates
   the current project `code-check-profile.json`. An unsupported schema or
   invalid mandatory gate rejects the finish and leaves the Work running.
4. A changed engine, CLI or flow implementation triggers an impact review. A
   stage entry is recreated only when the change altered or invalidated its
   saved start context.

Steps 1–3 are implemented by the matched `dd-eval`, `dd-flow-cli` and flow
pack pair. Step 4 is an evidence-based review, not an automatic canonical
rebuild.

## Module boundaries

The present change splits the two responsibilities that were actually
repeated:

- `runner-events`: journal lock, operation registry and reduction;
- `process-json`: bounded JSON/text subprocess invocation;
- `runner`: public CLI operations, flow observation and current execution
  orchestration.

Extract `flow-client` (RUN observation/statistics) and the shared execution
reducer only after a second stage executor or recovery defect makes that
boundary concrete. Do not pre-create a generic plugin or adapter framework.

`dd-flow-cli` keeps queue/state policy in its existing merge services.  Its
merge server may extract its adapter subprocess boundary, but it must not copy
runner lifecycle logic or acquire semantic decision-making authority.

## MERGE recovery table

| Merge request state | Runner action |
| --- | --- |
| `queued` | one `serve --once` is allowed |
| `dispatching` with live lease | observe/wait |
| expired `dispatching` with unstarted Work | requeue through `dd-flow` reconciliation |
| `active` | observe original Session; do not relaunch |
| `recovery_required` | retain evidence and fail the execution |
| `completed` | reconcile and capture the existing result |
| `failed` / `cancelled` | terminal failed execution |

## Required evidence

Automated tests cover exact and conflicting terminal duplicates, concurrent
in-flight rejection, storage isolation of a damaged historical journal,
pack/case contour mismatch, server routing, server dispatch/requeue and
idempotent MERGE finish. A live focused MERGE test runs only in an isolated
checkout and `DD_EVAL_HOME`; it additionally proves integration state, checks,
lane release and complete request/Work/Stage/RUN closure.

## Non-goals

- a shared runtime package between `dd-eval` and `dd-flow-cli`;
- a generic stage-executor plugin system;
- a global database for eval runs;
- automatic retry after a partially started MERGE;
- per-stage model selection in this implementation.
