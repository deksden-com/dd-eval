---
file: 'beta/vnext-code-beta.1/specs/002-e2e-runtime-corrections.md'
description: 'Integrated correction plan for runtime, evaluation and observability defects exposed by the first CODE E2E diagnostic.'
status: 'DRAFT'
---

# 002 — E2E runtime corrections

## Goal

Make the next focused CODE and full E2E executions valid evidence. Fix shared
root causes rather than teaching the Controller to work around individual
failures. Keep the current entities: RUN, Stage, Work, Session, check aliases,
model profiles and canonical stage checkpoints. Add no scheduler, model-specific
checkpoint tree or second telemetry store.

The source diagnostic is EVAL-040. It proved the semantic contour through
PLAN-REVIEW and the first CODE Work, but it is not a scored Luna E2E result:
the engine rejected its own projected checks, later Sessions used another
model, usage was double-counted and CODE had no truthful infrastructure-blocked
state.

## Invariants

1. An authored check alias remains an alias in immutable PLAN/CODE data. The
   engine resolves it only when executing the check and records the alias,
   resolved command and receipt together.
2. HITL means that a semantic user answer can advance the current Stage.
   Engine, harness and environment failures never create an HITL question.
3. The requested model profile is explicit at every provider launch. A mono
   profile fills the root stage, handoffs and every freely configurable clean
   child Session. Stage and child overrides are allowed only where the harness
   can actually select them.
4. A native stage fork preserves history, not the evaluated model. The first
   new message explicitly selects the attempt model and reasoning effort.
5. One physical provider Session contributes to RUN token totals once, even
   when it is linked to several Works or Stages.
6. Lifecycle duration comes from authoritative transition timestamps. Models
   never estimate elapsed time or claim a provider Session has stopped.
7. One review wave is preferred when compatible concerns fit observed
   capacity. More groups than capacity require a concrete incompatibility or
   risk reason; PLAN-REVIEW executes the accepted packing without inventing
   extra reviewers.

## 1. Check aliases: repair the blocking CODE defect

`code-work-batch.json` stores the authored alias such as
`@check/db-migrate-local`, never the expanded shell command. Projection may
validate that the alias exists, but it does not replace it.

The shared check runner performs the only expansion:

```text
alias -> project check profile lookup -> command -> execution receipt
```

The receipt retains both alias and resolved command. Raw commands remain
invalid where project policy requires aliases. Validation and execution must
not feed an already expanded command back through input-policy validation.

Required regression test: PLAN alias -> deterministic batch -> Work start ->
Work finish executes once -> accepted Work. The same fixture also proves an
unknown alias and a forbidden raw guarded command fail before execution.

## 2. Truthful failure and recovery lifecycle

Add a non-HITL Stage operation for an external blocker. It keeps the current
Stage unfinished, records a machine-readable blocker and pauses the RUN without
creating a user question. Its minimal fields are:

```text
kind = engine | harness | environment
code
summary
retryable
```

Resume clears the blocker and continues the same Stage. A terminal unrecoverable
error uses the existing failure terminal rather than the blocker operation.
There is no transition back to an earlier Stage.

Every failed lifecycle command returns one authoritative next action:

- retry the same Work with the exact command when retry is legal;
- create bounded repair Work only when its required origin/evidence exists;
- block the current Stage with the exact command when neither path is legal.

Guidance, dashboard state and reports are rendered from the same RUN/Stage/Work
state. A blocked CODE Stage cannot simultaneously recommend `start_code` or be
reported as running. CLI help lookup is not part of normal recovery.

## 3. Executable model profiles

### Profile resolution

Resolve one effective profile before launch:

```text
default model + reasoning
  <- optional stage override
  <- optional clean-child-role override
```

If only the default is supplied, copy it to every Stage and every clean child
role. Record requested and observed profiles separately for every Session.
Any mismatch invalidates the attempt before judging; it is not a model-quality
finding.

### Harness constraints

- A continued root Session can select a new model/reasoning on its next
  message when the provider supports per-turn override.
- A fresh child Session can freely select its declared role profile.
- A child that inherits/forks the live parent context uses the parent's model
  when the harness forbids a model override for that launch mode. Reject an
  incompatible profile before launch; do not silently substitute a model.

### Focused and E2E evaluation

Focused stage attempts use one shared starter per stage. The Controller forks
that starter, then sends the first new Subject message with the requested model
and reasoning explicitly. This holds prior context constant across model
comparisons and removes model-specific starter duplication.

E2E starts a clean Session on the requested root profile and performs ordinary
priming, discussion and the complete flow. A mixed-model E2E applies declared
overrides only at Stage boundaries or clean child launches. Every continuation,
including HITL resume, repeats the effective profile explicitly.

Cut the starter registry over once from profile-keyed `@2` to stage-keyed
`@3`. Update the CLI, case registry, validator, tests and both operational
runbooks in the same change; do not retain a live fallback. Historical attempt
evidence keeps the exact starter/child IDs it already recorded and needs no
rewrite.

## 4. Session topology and status

Keep Works and Sessions in their existing separate tables. When the Controller
creates a handoff or child Session, it records `parent_session_id` immediately;
the hook continues to bind Work/agent identity. Session status is provider
observation, refreshed by sync, not inferred from Work completion.

Reports distinguish:

- active provider turn;
- idle Session with no active turn;
- unreachable/unknown provider state.

Do not leave a Session `active` merely because it once executed a Work. Do not
invent an Agent Turn lifecycle entity.

## 5. Usage, tool calls and time

### Usage source of truth

Store recalculable observations with physical `session_id`, source path/hash,
source timestamp and observed-at timestamp. Preserve input, cache-read,
cache-write when supplied, output and reasoning categories.

RUN totals group observations by physical Session and take the latest valid
cumulative observation per Session. Work links never multiply tokens. A later
recalculation replaces the projection; it does not append another billable
copy.

Stage attribution uses per-Session boundary deltas:

```text
usage at Stage end - usage at Stage start
```

Clamp impossible negative deltas to unavailable evidence and report the source
problem. Across Stages, attributed deltas for one Session must not exceed its
final cumulative total. RUN totals remain authoritative when exact Stage
attribution is unavailable.

Tool-call statistics follow the same identity rule: count source events once,
then project them by Session/Stage where boundaries allow it.

### Time

Stage wall time is `finished_at - started_at`; a blocked or paused Stage reports
elapsed-to-block separately and has no completed duration. RUN elapsed time is
derived from RUN lifecycle timestamps. Reviewer waves and deterministic checks
retain their own start/end facts so waiting and execution are distinguishable.

## 6. Capacity-aware PLAN-REVIEW packing

PLAN receives observed capacity in its start context. It chooses the smallest
safe group count and targets one wave. The plan contract includes
`multi_wave_reason` only when `group_count > capacity`; the reason must identify
a real incompatibility, dependency, isolation or high-risk focus boundary.

The validator rejects `group_count > capacity` with no reason. The Judge still
assesses whether a supplied reason is substantively justified. PLAN-REVIEW
launches exactly `ceil(group_count / capacity)` waves, closes completed agents
promptly and never retries merely to fill capacity.

This is a structural guard, not task-specific grouping. It does not force
unsafe concerns together and does not replace semantic judgment.

## 7. Implementation order

1. **Unblock CODE.** Preserve aliases through projection and add the round-trip
   regression test.
2. **Repair lifecycle.** Add blocker/resume semantics, shared guidance and
   executable failure responses.
3. **Correct telemetry.** Deduplicate physical Sessions, implement boundary
   deltas and derive time from transitions.
4. **Correct evaluation launch.** Cut the registry, CLI and runbooks over to
   shared stage starters, explicit first-turn profile selection and
   observed-profile validation in one change.
5. **Complete topology.** Record parent Sessions and refresh provider status.
6. **Tighten review packing.** Add the capacity budget/reason contract and its
   validator.
7. **Prove locally.** Run focused tests for each shared root cause, then one
   disposable PLAN -> PLAN-REVIEW -> CODE diagnostic.
8. **Prove behavior.** Run a focused CODE eval. Only after it completes, run a
   clean Luna E2E through CODE. Do not replace canonical checkpoints or launch
   the three-model comparison until both are valid.

## Acceptance

The correction is complete when:

1. an alias-authored Work completes through the real deterministic check path;
2. an engine failure produces no HITL record and returns a valid recovery
   command;
3. a mono-model E2E observes the declared model/reasoning in every root,
   handoff, reviewer and CODE worker Session where the harness permits choice;
4. incompatible inherited-context overrides fail before launch;
5. RUN usage equals the sum of unique physical Session totals and Stage deltas
   never exceed those totals;
6. reports agree on RUN, Stage, Work and Session state and duration;
7. compatible review concerns fit one wave, while justified multi-wave cases
   remain possible;
8. focused CODE and clean Luna E2E both reach their declared terminal boundary
   without Controller workarounds.
