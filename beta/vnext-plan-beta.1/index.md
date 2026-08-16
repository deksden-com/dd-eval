---
file: 'beta/vnext-plan-beta.1/index.md'
description: 'Draft beta contract for canonical PLAN parity on the vNext flow and its minimal Work runtime.'
status: 'IN_PROGRESS'
---

# vNext PLAN beta 1

This bundle extends the proven `SPECIFY → PROTOCOLIZE` contour with PLAN. It
preserves the useful semantic scope of canonical PLAN while replacing its
multi-file execution ceremony with one prepared stage prompt, a small Work
registry and deterministic CLI validation and reporting. Every formal PRT uses
at least `compact_plan`; vNext has no `no_plan` route.

The bundle intentionally stops before executing CODE. PLAN writes the proposed
CODE Work DAG; the always-present PLAN-REVIEW stage either accepts it through
fresh reviewers or takes the deterministic `off` path, then atomically
registers the graph that CODE will run. Engine and flow-pack versions are
allocated only when implementation is ready; this draft does not claim an
immutable beta checkpoint.

## Included specifications

- [001 — canonical PLAN semantic parity](specs/001-canonical-plan-semantic-parity.md)
- [002 — minimal Work registry](specs/002-minimal-work-registry.md)
- [003 — PLAN/PSET execution and capacity](specs/003-plan-pset-execution-and-capacity.md)
- [004 — PLAN quality gate](specs/004-plan-quality-gate.md)
- [005 — integrated parity correction](specs/005-integrated-parity-correction.md)
- [006 — live PLAN wave and lifecycle convergence](specs/006-live-plan-wave-and-lifecycle.md)
- [007 — PLAN review gate and truthful observability](specs/007-plan-review-gate-and-observability.md)
- [008 — RUN context and trusted subagent Work](specs/008-run-context-and-trusted-subagent-work.md)
- [Controlled eval runbook](runbook.md)

## Current state and remaining implementation plan

Specification 008 remains the active runtime contract. The first clean cutover
is now committed in the two beta branches:

- engine: `dd-flow-cli` `8d22c55`;
- flow pack: `dd-tasks` `d16ccb1`.

The narrow vNext and flow-pack checks pass. This is still not an immutable
engine checkpoint: the final lifecycle/observability edge cases and the full
deterministic suite must be closed before a model run is considered evidence.

The remaining work is ordered deliberately. Later items must not be papered
over with compatibility paths while an earlier contract is still unsettled.

1. **Close the remaining controller edge cases.**
   Audit every terminal PLAN-REVIEW route, including unfinished capacity probes,
   so it settles child Work and open links before the parent settles. Replace
   residual placeholder coverage fields in reports with truthful deterministic
   facts. Keep the clean `runs / works / sessions / work_sessions / hook_events
   / usage` boundary: no Turn, launch-token, adapter-bind, legacy read, or
   dual-write path.
2. **Prove Session and usage semantics, not only their schema.**
   Add fixtures for parent/child Session trees, shared-host subagents,
   fresh-session isolation, exact hook matching and one-read-per-transcript
   usage aggregation. A single transcript must not be counted twice when it
   spans several Work links; its result must retain source timestamp, source
   Session id and every reported token category.
3. **Finish deterministic verification.**
   Run the complete engine suite and fix the remaining non-vNext failures at
   their cause (rather than excluding or weakening them). Re-run typecheck,
   build, focused lifecycle tests and `mb-lint` on the beta flow pack. Verify
   the installed hook resolves the selected beta engine.
4. **Prepare one reproducible evaluation workspace.**
   Create a fresh isolated project checkout and fresh `DD_FLOW_HOME`; record
   exact repository revisions, engine version, model/reasoning profile and the
   eventual root and child Session ids. Do not reuse a Run database or a
   previous agent context.
5. **Run and assess the visible Desktop evaluation.**
   Start the standard Desktop task—not `codex exec`—at PLAN, let it pass
   through PLAN-REVIEW and stop when CODE is opened but not executed. On
   completion, collect deterministic lifecycle/usage facts and independently
   assess grounding, plan semantics, routing, reviewer isolation, artefact
   quality and timing against the reference runs. A real blocker pauses the
   sequence for root-cause analysis; otherwise archive the complete Run.

The detailed execution requirements below preserve the original cutover
design. They are historical implementation context, not a second active
checklist: where they conflict with the five beta.35 items above or
specification 008, the newer contract wins.

### 1. Freeze the agreed contract

- commit the current dd-eval specifications, runbook and review criteria as one
  documentation checkpoint;
- treat specification 008 as authoritative for runtime storage, identity,
  capacity and usage;
- do not commit the current partial five-file CLI patch as-is: it still uses
  synthetic Turns, launch-token-era schema and the old reviewer result shape.

### 2. Cut over runtime storage

- rebuild the beta database to `runs`, `works`, `sessions`, `work_sessions`,
  `hook_events` and `usage`;
- remove prefixed/temporary Work, Session, Turn and usage-snapshot tables and
  every caller; add no compatibility read or dual write;
- keep Work parentage and dependency DAG in `works`;
- keep Session parentage in `sessions`;
- derive RUN participation only through `works → work_sessions → sessions`;
- refresh portable RUN projections from these authorities.

### 3. Centralize hook identity and Session registration

- persist hook `session_id`, optional `agent_id`, raw `turn_id`, transcript,
  model and agent type in `hook_events`;
- remove launch tokens, `adapter-bind` and all model-supplied identity flags;
- normalize the participating command fingerprint from operation, Work id and
  canonical project root;
- implement one shared transaction used by root stage start and `work start`:
  claim hook, resolve Work/RUN/parent, create or reuse Session, set immutable
  parent from the parent Work's open link, validate launch policy, open
  `work_sessions`, then start Work;
- fail closed on a missing/ambiguous parent link or a foreign/reused hook.

### 4. Finish the minimal Work contract

- apply `launch_policy` and `result_schema` to storage, batch schema, CLI help,
  projections and prompts;
- validate Work hierarchy, same-RUN dependencies, cycles, readiness,
  structured concurrency and one open execution link per running Work;
- make `work finish/fail/cancel` close the Work/Session link atomically;
- validate structured results before completing Work and return all errors;
- keep delegated PLAN aspect verdicts `pending` until accepted review evidence.

### 5. Add RUN variables and review policy

- make the current flow-contract version define and resolve flow flags instead
  of silently omitting them;
- materialize resolved policy values and runtime observations in the RUN
  variable store and root `run.json` projection;
- define `plan_review.mode`, project presets/floors and
  `policy.plan_review.requested_mode`;
- freeze requested mode at PLAN-REVIEW start and derive
  `runtime.plan_review.effective_mode` once;
- expose only applicable system variables plus bounded `user.*` values to
  stage/Work packets.

### 6. Implement one RUN-level capacity handshake

- put capacity handling inside stage-specific dispatch, not a new public
  command;
- on first useful delegation without known capacity, create up to 15 fresh
  probe Work and return `capacity_probe_required` with exact start commands;
- on repeated dispatch, wait for running probes, count distinct completed
  probe Sessions, cancel never-started probes and store
  `runtime.subagents.available_slots`;
- use the stored value for later waves and reduce it after a real refusal;
- include accepted probe usage in RUN cost but exclude probes from semantic
  reviewer counts.

### 7. Replace usage aggregation

- remove the duplicate `run usage` command, usage checkpoint deltas and stored
  Turn lifecycle;
- make `work finish` take only a provisional source observation;
- make `stat usage --run [--session]` reread each selected transcript once,
  use raw provider turn boundaries in memory, deduplicate turns touching
  several Work and refresh RUN/Session `usage` rows;
- return `provisional|final|unavailable`, all token categories, source facts
  and observation time;
- make `stat run sessions ls` show the stored Session hierarchy and Work-link
  counts;
- run final statistics only from the controller after root/child responses
  return; never instruct the evaluated agent to collect statistics.

### 8. Complete PLAN and PLAN-REVIEW behavior

- update `plan-aspect-map@2` so delegated rows are structurally `pending`;
- replace reviewer schema with the compact per-aspect contract from 008;
- keep PLAN-REVIEW decision small and support accepted, needs-changes,
  waiting-for-user, blocked, failed and cancelled outcomes;
- register reviewer Work with `fresh_agent_required`, reduce findings in the
  existing orchestrator Session and retry only invalidated groups;
- make every terminal path settle child/parent/root Work and open links,
  generate deterministic JSON/Markdown/HTML and leave CODE unregistered;
- register the proposed CODE graph exactly once only after `off` or accepted
  PLAN-REVIEW, then return the exact CODE entry without executing it.

### 9. Update the dd-tasks beta flow pack

- cut over schemas, examples, PLAN/PLAN-REVIEW prompts and flow contract in the
  beta branch;
- make every stage start/dispatch response contain its exact next commands,
  workspace, bounds, compact schemas and applicable RUN variables;
- remove Agent Turn, launch-token, adapter-binding and agent-statistics
  instructions;
- keep canonical PLAN grounding, document, aspect and acceptance functionality
  unchanged.

### 10. Prove deterministically before another model run

Add the smallest fixtures that prove:

- old tables/commands are absent after the clean beta cutover;
- root Session registration, four children sharing one host `session_id`,
  nested parent derivation, Session reuse and fresh-required rejection;
- token-free fingerprint equality and foreign/reused event rejection;
- Work hierarchy/dependency/structured-concurrency rules;
- one capacity probe per delegating RUN and repeat-dispatch convergence;
- provisional Work-finish usage and final multi-Session transcript usage;
- pending aspect rejection, compact reviewer-result validation, targeted retry
  and every PLAN-REVIEW terminal outcome;
- identical JSON/Markdown/HTML gate facts and atomic CODE registration.

Run typecheck, lint, build and the full deterministic test suite. Do not start
a model eval until they pass.

### 11. Publish one comparable beta and rerun EVAL-005

- commit/tag/push the engine beta;
- select that exact engine in dd-tasks, commit/tag/push the flow-pack beta;
- prepare a fresh isolated checkout and `DD_FLOW_HOME` through dd-eval;
- launch the normal visible Desktop task with the fixed model/reasoning profile;
- stop after PLAN-REVIEW opens CODE, without executing CODE;
- after all root/child responses return, run final `stat usage` from the
  controller;
- archive the RUN, Work tree, Session tree, Work/Session links, raw provider
  identities, transcripts, reports and timings;
- grade by the PLAN and PLAN-REVIEW quality checklists and compare against the
  retained reference runs.

PSET concurrency remains a separate follow-up eval after this single-PRT case
passes. It does not block the first corrected PLAN/PLAN-REVIEW rerun.

`compact_plan` describes plan depth, not review routing. The first single-PRT
case is still a substantive multi-aspect vertical slice and therefore proves
grouped one-wave routing when the available pool permits it.

## Proof boundary

The bundle is accepted only when all of the following are demonstrated:

- a compact single PRT reaches a canonical-quality accepted plan without
  unnecessary worker creation or capacity probing;
- the same PSET Work graph executes correctly with one worker and with several
  available workers;
- every member PRT owns a separate accepted plan and aspect map;
- applicable durable feature/spec/ADR/scenario/runbook changes have one clear
  owner and no parallel write conflict;
- strict dependencies prevent premature Work start and cycles are rejected;
- a fresh planning agent can execute from the rendered Work prompt without the
  earlier discussion or planning-session context;
- PLAN corrects clear upstream omissions in place and pauses only for a material
  user decision with no reasonable default;
- PLAN completes with deterministic validation and a truthful PLAN-REVIEW handoff;
  PLAN-REVIEW either records `off` or accepts fresh reviewer evidence, atomically
  registers the CODE Work DAG and stops before CODE.
