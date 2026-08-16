---
file: 'beta/vnext-plan-beta.1/specs/006-live-plan-wave-and-lifecycle.md'
description: 'One corrective contract for the remaining PLAN routing, RUN lifecycle, portability and observability defects.'
status: 'DRAFT'
---

# 006 — Live PLAN wave and lifecycle convergence

## Goal

Make the PLAN route truthful and executable without adding a scheduler,
parallelism service or a second planning model. A selected grouped route must
mean that grouped review Work really runs and is accepted before CODE becomes
startable. A RUN must stay live until its Work graph reaches a legal terminal
state. All portable artifacts must be relocatable.

This specification supersedes only the incomplete implementation portions of
005. Its smaller scope is deliberate: do not reopen SPECIFY or PROTOCOLIZE
semantic contracts that already pass their quality checks.

## Evidence from beta.27

The compact single-PRT run produced a strong plan, four compatible aspect
groups and a valid CODE coordinator. It also exposed three contradictions:

1. `single_wave_grouped` was recorded, but all aspect rows claimed
   `self_check`; child review Work was created only *after* PLAN was accepted
   and had no Agent Turns or results.
2. PROTOCOLIZE emitted `run_completed: waiting_for_user`, stopped the shared
   Session and checkpointed `run_finished` before the advertised PLAN command.
   PLAN then reopened the same RUN. Those are not terminal facts.
3. the plan report became portable, but aspect-map evidence and generated
   review-task text still contained absolute runtime paths.

The goal is not to force delegation. `local_compact` remains correct for one
genuinely tiny semantic unit. The goal is to prevent a grouped route from being
merely descriptive.

## 1. One live RUN lifecycle

- A stage completion is not RUN completion.
- `run_completed`, `run_finished` usage checkpoints and terminal Session stop
  are emitted only when the root Work and every required descendant have a
  terminal, legal state.
- A same-session handoff closes the previous **Agent Turn**, but leaves the
  Session registered and live for the next Turn. It must not call
  `stopFlowSession` between adjacent stages.
- A new-session handoff closes the old Turn/Session and returns an explicit
  resume command. The RUN itself remains `running`.
- The root Work is completed only by an actual terminal Flow exit. Stopping an
  eval after PLAN is an external evaluation boundary, not a fake Flow terminal
  state.
- The runtime may record `next_action`, but it must use a non-terminal update
  path. `completeFlowRun` is reserved for genuine Flow exits.

## 2. PLAN routing must be executable

PLAN uses three mutually exclusive accepted states:

| Selected route | Map rows | Runtime requirement |
| --- | --- | --- |
| `local_compact` | applicable rows use `self_check` | PLAN orchestrator accepts them locally |
| `single_wave_grouped` / `multi_wave_grouped` | delegated rows use `grouped_subagent` | each declared group has a completed review Work and accepted result |
| `external_handoff` | rows identify external evidence | the explicit external gate remains before CODE |

The engine must reject a mixed claim such as a grouped route with applicable
rows marked `self_check`, unless that row is intentionally outside every group
and its local coverage reason says why.

### Two compact PLAN actions

The normal PLAN agent sequence is:

1. `stage start` returns the full semantic contract, paths, valid examples,
   routing instructions and the exact commands below.
2. The agent writes draft `plan.json`, `aspect-map.json` and
   `code-work-batch.json`.
3. For a grouped route it calls one deterministic command:
   `dd-flow plan reviews dispatch <RUN> --project-root <root> --json`.
   It validates the draft, creates only the declared grouped review Work and
   returns their IDs, ready order and exact `work start` commands.
4. The harness/orchestrator launches those ready Work in one wave when actual
   free capacity permits, otherwise in the minimum number of waves. The CLI
   does not pretend to be a scheduler and does not persist probe attempts.
5. Each worker starts its assigned Work as its first command, receives the
   rendered task packet, writes its compact semantic result and finishes that
   Work. It never edits the product or accepted plan.
6. The PLAN orchestrator consumes worker results, updates the corresponding
   aspect-map rows with the separate verdict/evidence references, and calls
   the existing PLAN finish command.

`stage finish --stage plan` accepts a grouped route only when every declared
group has one completed Work, one completed trusted Agent Turn and a passing
accepted result. A rejected group blocks PLAN correction and CODE Work is not
registered. It must be possible to retry only that group.

No new Stage, queue, Job entity, scheduler daemon or persistent probe record
is introduced. The existing Work table and its dependency list remain the
single authority.

## 3. Capacity and wave choice

The agent/harness determines usable slots with its normal bounded probe when
capacity is unknown. The probe is ephemeral. The only persisted facts are the
created review Work, their dependency graph, Agent Turns and outcomes.

For compatible substantive review, prefer one grouped wave. Packing is at most
three aspects per Work. If fewer slots are actually usable, launch the same
groups in the minimum number of waves; this changes neither applicability,
verdict ownership nor the final plan depth. No delegation is required for a
genuinely tiny `local_compact` unit.

## 4. Portable references and packets

- All references under RUN are normalised before validation to
  `run://<RUN-ID>/<relative-path>`.
- Project files remain repository-relative.
- A semantic artifact may not retain an arbitrary absolute filesystem path;
  finish rejects one it cannot normalise.
- Stored Work task text keeps portable references. `work start` resolves them
  into the current RUN path only in the rendered worker packet.
- Every PLAN start packet includes the exact review-dispatch, worker-start,
  worker-finish and PLAN-finish commands. A normal agent must not search CLI
  help or derive the command shape.

## 5. Reports and usage

Stage reports distinguish stage completion from RUN completion. Their
`session_coverage` names the Turn/Session bound to that stage; usage snapshots
use `stage_finished` only for stage boundaries and `run_finished` only at an
actual terminal RUN boundary.

The existing source provenance fields remain mandatory. Aggregate usage is
computed from every registered RUN Session; zero deltas are valid but must not
be used to overwrite an earlier measured total.

## 5.1 Depth triggers are not regression obligations

The task-priority run selected `full_plan` with `security_trust` solely because
the plan must preserve existing authorization and archived-project behavior.
That is an incorrect escalation. Regression checks for an existing invariant
are mandatory acceptance evidence; they do not by themselves introduce a new
trust boundary.

- `security_trust` requires a new or changed authorization decision, a new
  sensitive-data/trust boundary, or a material change to the existing security
  model.
- `irreversible_data` requires a destructive/non-reversible data effect, not
  an additive defaulted field with a forward migration.
- a cross-layer vertical slice and a moderate failure impact do not imply
  `full_plan`.
- absent one of the explicit triggers, select `compact_plan`; independent
  aspect routing may still be one grouped review wave.

The PLAN packet must state this distinction immediately beside the depth
decision. Finish validates that `depth_trigger: none` accompanies a compact
plan; the semantic quality gate evaluates any non-`none` trigger against its
named concrete change rather than treating a generic preservation invariant as
evidence.

## 6. Required changes

### `dd-flow-cli` beta engine

- add `plan reviews dispatch` and narrow integration tests;
- validate route/coverage-mode consistency and accepted grouped results at
  PLAN finish;
- render portable review task references and resolve them only for live worker
  prompts;
- replace premature nonterminal `completeFlowRun`/`stopFlowSession` calls with
  a shared nonterminal transition update;
- emit terminal events/checkpoints only when Work structured-concurrency rules
  allow it.

### `dd-tasks` beta flow pack

- state the two PLAN actions and exact worker lifecycle in the rendered PLAN
  instruction;
- keep `single_wave_grouped` as the preferred substantive route, never as a
  claim without corresponding Work;
- state that report/usage facts are CLI-owned and that semantic artifact paths
  use project-relative or `run://` references.

### `dd-eval`

- retain beta.27 as the failing reference for these three defects;
- score the next run separately for route truth, live lifecycle, portability,
  content quality and elapsed time;
- use the same single-PRT priority case before adding the separate PSET case.

## 7. Parallel Desktop worker binding

EVAL-006 proved that a hook presence check is not enough. Three visible
Desktop worker tasks were created in one wave. Their `work start` commands were
valid, but two observed PreToolUse events carried the Session identity of a
different concurrent worker. The current `work start` accepted that event and
would have attributed the wrong Agent Turn to the Work. The run was cancelled
before any review verdict or PLAN acceptance.

The correction has two layers:

1. **CLI invariant.** A `work start` hook event is one-time claimed and must
   match a canonical fingerprint of the exact `work start <WORK-ID>` command.
   A stale, already-claimed or other-Work event fails closed. The event table
   stores the canonical invocation fingerprint alongside its normal event key.
2. **Trusted harness adapter.** Only an adapter that creates a fresh worker
   Session may assign that worker Session to its Work before launch. The
   assignment is adapter-owned, never an agent flag. `work start` compares the
   observed hook Session with that assignment and fails closed on a mismatch.
   Codex Desktop task creation already returns the worker task ID, so the
   Desktop adapter can make the assignment deterministically. A plain CLI
   harness without that capability keeps the existing unassigned mode, but it
   cannot claim a multi-session eval is fully bound.

The implementation must not use a model-supplied `--session-id`, a heuristic
"latest session", or a retry that silently reuses another worker's event.
Serialized workers may be used only as an explicitly labelled harness
diagnostic; they are not proof that a one-wave route works.

## Acceptance checks

| ID | Proof |
| --- | --- |
| L-01 | same-session SPECIFY → PROTOCOLIZE → PLAN has no intermediate `run_completed`, `run_finished` checkpoint or Session stop |
| L-02 | a grouped map cannot finish PLAN without completed review Work/Turns/results |
| L-03 | a local map cannot claim grouped review without a reasoned exception |
| L-04 | successful grouped PLAN maps each group to a completed Work and CODE depends on them only after acceptance |
| L-05 | a rejected group prevents CODE registration and can be retried alone |
| L-06 | portable RUN projection, map and Work task contain no unnormalised absolute artifact paths |
| L-07 | PLAN start packet contains exact dispatch/start/finish commands and a valid grouped example |
| L-08 | usage reports retain prior measured totals and use terminal checkpoint names only at terminal RUN state |
| L-09 | parallel Desktop workers cannot start from a foreign, stale or reused hook event |
| L-10 | the Desktop adapter binds the returned child-task identity to its Work before launch; a mismatch is blocked without creating an Agent Turn |
| L-11 | an additive task field that preserves existing access checks selects `compact_plan`, unless a named new trust or irreversible-data change exists |
