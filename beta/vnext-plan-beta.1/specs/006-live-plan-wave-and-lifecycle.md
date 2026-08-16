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

> Specification 008 supersedes this document's launch-token and manual
> Desktop-binding mechanics. The current contract uses a token-free
> `work start`, hook-native `session_id`/`agent_id` identity and an atomic
> normalized command fingerprint.

## Evidence from beta.27

The compact single-PRT run produced a strong plan, four compatible aspect
groups and a valid CODE coordinator. It also exposed three contradictions:

1. `single_wave_grouped` was recorded, but all aspect rows claimed
   `self_check`; child review Work was created only *after* PLAN was accepted
   and had no executing Sessions or results.
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
- A same-session handoff leaves the Session registered for the next stage and
  must not stop it between adjacent stages.
- A new-session handoff closes the current Work/Session link and returns an
  explicit resume command. The RUN itself remains `running`.
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
   returns their IDs, ready order and exact token-free `work start` commands.
   Every command contains an explicit project-root argument, so a Desktop task
   whose own cwd is not the evaluated checkout can still be observed by the
   hook. The hook and CLI match the normalized operation, Work id and project
   root atomically.
4. The harness/orchestrator launches those ready Work in one wave when actual
   free capacity permits, otherwise in the minimum number of waves. The CLI
   does not pretend to be a scheduler or persist unstarted probe attempts.
5. Each worker starts its assigned Work as its first command, receives the
   rendered task packet, writes its compact semantic result and finishes that
   Work. It never edits the product or accepted plan.
6. The PLAN orchestrator consumes worker results, updates the corresponding
   aspect-map rows with the separate verdict/evidence references, and calls
   the existing PLAN finish command.

When one latest result is `needs_changes`, the orchestrator corrects the
draft/map and calls
`dd-flow plan reviews dispatch <RUN> --retry-needs-changes --project-root <root> --json`.
That command creates one new Work only for each currently rejected group; it
does not re-run accepted groups. PLAN acceptance evaluates the latest attempt
for every declared group.

`stage finish --stage plan` accepts a grouped route only when every declared
group has one completed Work, one registered Session link and a passing
accepted result. A rejected group blocks PLAN correction and CODE Work is not
registered. It must be possible to retry only that group.

No new Stage, queue, Job entity, scheduler daemon or persistent probe record
is introduced. The existing Work table and its dependency list remain the
single authority.

## 3. Capacity and wave choice

The first stage-specific dispatch that needs delegation performs the bounded
probe handshake from specification 008 when RUN capacity is unknown. Only
available slots are projected; accepted probe Work, Sessions and usage remain
normal runtime facts.

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
Session coverage names the Sessions linked to stage Work. Final usage is
recalculated from transcripts after relevant provider turns complete; stage
finish records only a provisional observation.

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

Similarly, one PRT, one CODE item or a missing implementation dependency does
not prove `local_compact`. The route is local only when the review itself has
one genuinely tiny semantic unit/short source scope. Independent data, public
contract, UI and evidence concerns remain separate review units even when they
are implemented as one vertical slice. With usable delegated capacity, three
or more such substantive concerns select `single_wave_grouped`.

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
would have attributed the wrong Session to the Work. The run was cancelled
before any review verdict or PLAN acceptance.

The correction has two layers:

1. **CLI invariant.** A `work start` hook event is one-time claimed and must
   match a canonical fingerprint of the exact `work start <WORK-ID>` command.
   A stale, already-claimed or other-Work event fails closed. The event table
   stores the canonical invocation fingerprint alongside its normal event key.
2. **Hook-native harness identity.** Codex supplies the host `session_id`, an
   optional child `agent_id`, raw `turn_id` and transcript path in the hook
   event. The runtime preserves both provider identities and uses
   `sessions.id = agent_id ?? session_id`. The child `agent_id`, not the
   inherited host Session id, distinguishes parallel subagents.

The implementation must not use a model-supplied `--session-id`, a heuristic
"latest session", manual adapter binding or a retry that silently reuses
another worker's event.
Serialized workers may be used only as an explicitly labelled harness
diagnostic; they are not proof that a one-wave route works.

## Acceptance checks

| ID | Proof |
| --- | --- |
| L-01 | same-session SPECIFY → PROTOCOLIZE → PLAN has no intermediate `run_completed`, `run_finished` checkpoint or Session stop |
| L-02 | a grouped map cannot finish PLAN without completed review Work/Session links/results |
| L-03 | a local map cannot claim grouped review without a reasoned exception |
| L-04 | successful grouped PLAN maps each group to a completed Work and CODE depends on them only after acceptance |
| L-05 | a rejected group prevents CODE registration and can be retried alone |
| L-06 | portable RUN projection, map and Work task contain no unnormalised absolute artifact paths |
| L-07 | PLAN start packet contains exact dispatch/start/finish commands and a valid grouped example |
| L-08 | usage reports retain prior measured totals and use terminal checkpoint names only at terminal RUN state |
| L-09 | parallel Desktop workers cannot start from a foreign, stale or reused hook event |
| L-10 | the hook stores both host `session_id` and optional child `agent_id`; distinct child identities become distinct flow Sessions and usage sources |
| L-11 | an additive task field that preserves existing access checks selects `compact_plan`, unless a named new trust or irreversible-data change exists |
| L-12 | a compact vertical slice with independent data/API/UI/evidence review units does not collapse to `local_compact` merely because it has one PRT or CODE item |
| L-13 | every generated worker start command is token-free, carries an explicit project root and is matched atomically by normalized operation/Work/root fingerprint |
| L-14 | `needs_changes → corrected draft → --retry-needs-changes → pass` creates a new Work only for the rejected group and allows PLAN acceptance from the latest group attempts |
