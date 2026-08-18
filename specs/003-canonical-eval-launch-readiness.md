---
file: 'specs/003-canonical-eval-launch-readiness.md'
description: 'Minimal cutover from the current beta worktrees to one reproducible canonical checkpoint chain and the first scored eval.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
extends: 'specifications 001 and 002'
---

# 003 — Canonical eval launch readiness

## Goal

Make the existing `case@3` checkpoint design executable without adding another
registry, scheduler, fixture format or orchestration layer. The first accepted
result must be reproducible from an immutable engine/flow pair, four accepted
stage-entry checkpoints, recorded Subject/Judge session baselines and accepted
stage oracles.

This specification separates two gates:

1. **canonical authoring ready** — the matched beta artifacts, storage and
   capture path are trustworthy enough to create the canonical chain;
2. **scored eval ready** — the canonical chain, session baselines and oracles
   are accepted, so focused, segment and E2E attempts may be launched.

Passing structural JSON validation alone satisfies neither gate.

## Current audit

As of 2026-08-18, snapshot capture/restore and `case@3` preparation exist, but
the suite is not ready for a scored run.

| Area | Current state | Consequence |
| --- | --- | --- |
| Engine source | snapshot support is at `327af3d…`, after tag `eval-engine-0.8.0-beta.58` at `d5b44b3…`; `package.json` still says `0.8.0-beta.58` | changed code has no unique immutable engine identity |
| Active profiles | beta.58 profiles were rewritten to point at `327af3d…` | an old profile ID no longer identifies its tagged artifact |
| Product checkpoint | `cp-002-vnext-plan-review-beta-58` still identifies engine commit `d5b44b3…` and a portable-fixture flow pack | case, profile and checkpoint disagree |
| Flow pack | `dd-tasks` is tagged beta.58 and pins engine beta.58 | it cannot select a uniquely versioned snapshot engine |
| Checkpoints | all four case checkpoint records are `pending_capture` | no focused, segment or E2E input is runnable |
| Session baselines | active Subject and Judge records are `pending_creation` | native Subject and Judge fork parents are unknown |
| Oracles | all stage and E2E oracles are `draft_pending_human_acceptance` | Judge preparation correctly fails closed |
| Storage | `DD_EVAL_HOME` is documented but is not created or enforced by `dd-eval` | attempts and canonical archives can again leak into `_Projects` |
| Validation | `validate` checks the case/tag shape but not full launch readiness | a green validation result can conceal the blockers above |
| Cleanup record | obsolete roots were moved to Trash, while its runbook still says “planned” | operations documentation is stale |

## Decisions

### 1. Cut a new immutable beta pair

The snapshot changes must become a new engine prerelease,
`0.8.0-beta.59`, with an annotated `eval-engine-0.8.0-beta.59` tag. The final
release commit—not the pre-version source commit—is the engine identity.

The project-local flow pack is then pinned to that exact version and committed
as `3.2.0-vnext-plan-review-beta.59`, with annotated tag
`eval-flow-vnext-plan-review-beta.59`. A new immutable product checkpoint,
`cp-002-vnext-plan-review-beta-59`, records both tags and full commits.

Existing beta.58 tags, checkpoint records and profiles are historical facts:

- restore beta.58 profiles to the beta.58 tagged engine commit `d5b44b3…`;
- never edit those profiles again;
- create new Luna/Subject and Sol/Judge beta.59 profiles;
- move the active case to the beta.59 profiles and checkpoint only after the
  beta.59 commits and tags exist.

The engine is built from the beta.59 flow-pack checkout, installed into the
canonical chain's isolated `DD_FLOW_HOME`, and verified through the stable
router with `engine resolve` and `engine doctor`. Source commit, package
version, tag, installed snapshot checksum and flow compatibility must all
agree. Any mismatch stops before a Desktop task is created.

### 2. Implement only the necessary `DD_EVAL_HOME` behavior

`DD_EVAL_HOME` is resolved from an explicit absolute environment value or
defaults to `path.join(os.homedir(), ".dd-eval")`. The CLI creates:

```text
$DD_EVAL_HOME/
  sequence.json
  canonical/<case-id>/REV-<NNN>/
    workspace/project/
    workspace/runtime/
    checkpoints/<stage>-entry/snapshot/
    checkpoints/<stage>-entry/capture.json
  attempts/active/<EVAL-id>/
  attempts/archive/<EVAL-id>/
  tmp/
```

`sequence.json` contains only the next eval number. It is updated under an
exclusive filesystem lock and is not a run registry. The generated name is
`EVAL-<zero-padded-number>--<case-id>--<mode>`. No SQLite catalog is added.

`prepare --output` becomes optional. Without it, the CLI allocates the next
directory below `attempts/active`. An explicit output is accepted only when it
is a new path below that same root. Canonical capture defaults below
`canonical/<case>/REV-<NNN>` and rejects a path outside `DD_EVAL_HOME`.

Checkpoint records committed to Git store a `DD_EVAL_HOME`-relative snapshot
locator. They never use an operator's absolute home path as the runnable
locator. Snapshot manifests may retain old absolute paths as non-authoritative
historical evidence; restore always returns current paths.

`storage ls/status` and `gc plan/apply` remain a later operational increment.
They are useful, but they do not block the first canonical chain. No daemon,
retention scheduler or database is part of this change.

### 3. Make readiness one deterministic check

`dd-eval validate` returns three independent facts:

```json
{
  "definition_valid": true,
  "canonical_authoring_ready": false,
  "scored_eval_ready": false,
  "blockers": []
}
```

`--require authoring` and `--require scored` make the command fail when the
requested gate is false. `prepare` always enforces `scored` readiness for the
selected mode.

Authoring readiness verifies:

- clean, reachable exact `dd-tasks` checkpoint tag and tree;
- clean, reachable exact engine tag/commit and unique package version;
- agreement among case compatibility, product checkpoint, selected profiles,
  project flow manifest and compatibility pin;
- installed engine resolution and snapshot checksum in the selected isolated
  runtime home;
- presence and validity of prompts, interactions, rubrics and pending
  checkpoint slots;
- writable canonical and temporary storage below `DD_EVAL_HOME`.

Scored readiness additionally verifies for the selected mode:

- every needed checkpoint is accepted and its snapshot checksum is valid;
- every needed native-fork baseline and frozen checkpoint Session is accepted,
  reachable and has not advanced after capture;
- every needed oracle has status `accepted`;
- checkpoint chain revision, project tree, engine, flow pack and handoff mode
  are identical across all selected entries;
- a restore smoke has proved the normal next stage command without stale
  active session bindings.

All blockers are returned in one invocation. The operator should not need a
sequence of failed launches to discover them.

### 4. Tighten the canonical checkpoint receipt

The active contract becomes `dd-eval/canonical-stage-checkpoint@2`; active code
does not execute `@1`. Historical result files remain readable as files but are
not runnable inputs.

An accepted record requires:

- case ID, canonical-chain revision, stage and capture timestamp;
- home-relative snapshot locator and content checksum;
- project commit/tree, flow-pack version/commit and engine version/commit/tag;
- RUN ID, legal next stage and clean-boundary receipt;
- Subject provider, harness, model and reasoning; canonical-chain Session ID,
  optional completed source turn evidence and frozen checkpoint Session ID;
- Agent ID when the harness exposes it, otherwise an explicit unavailable
  reason;
- handoff mode, completed predecessor receipts and RUN-variable checksum;
- acceptance timestamp, Git-relative review path and review checksum.

Capture creates only `pending_review`. Acceptance requires a compact review
file under `cases/<case-id>/checkpoint-reviews/REV-<NNN>/<stage>.md`. The
review confirms the clean boundary and the semantic suitability of the
predecessor result; schema validity alone cannot accept it. The CLI hashes the
review and writes the accepted record. Neither file is edited in place after
acceptance.

### 5. Record native Subject and Judge baselines explicitly

Create a beta.59 Subject baseline with `gpt-5.6-luna/xhigh` and a beta.59 Judge
baseline with `gpt-5.6-sol/high`. Each record contains:

- provider/harness, profile and model/reasoning;
- Session ID and optional last completed turn evidence;
- Agent ID when available;
- ordered priming message paths and hashes;
- creation time and `accepted` status.

The Subject baseline receives ordinary project priming and canonical user
discussion only. The Judge baseline receives evaluation-method and repository
priming but no candidate or stage oracle. Stage-specific material is supplied
only after forking. Every stage checkpoint references its own frozen Subject
child; the baseline remains the root provenance of the moving canonical chain.

The Controller is the current managed Codex Desktop task running
`gpt-5.6-terra/high`. It reads the versioned Controller packet and runbook, but
has no reusable baseline and is never a Subject/Judge fork parent. Each result
still records its actual Controller Session ID, model and reasoning so the
operational provenance is explicit.

### 6. Author one canonical chain, not four reconstructed fixtures

Create `REV-001` in one isolated canonical project/runtime and one canonical
Subject continuation:

```text
prime + canonical discussion
  → allocate unstarted RUN
  → capture/review/accept specify-entry
  → execute and review SPECIFY
  → capture/review/accept protocolize-entry
  → execute and review PROTOCOLIZE
  → capture/review/accept plan-entry
  → execute and review PLAN
  → capture/review/accept plan-review-entry
  → execute PLAN-REVIEW as a chain validation
```

At every entry, the target stage is unstarted, HITL is clear, no child Work is
active and the canonical Subject is idle. Before allowing that Session to
continue, the Controller creates one same-directory child fork, gives it the
title `CANON <case-id> REV-<NNN> <STAGE>-entry`, sends it no prompt, records its
Session ID and pairs it with the project/RUN snapshot. The original canonical
Session—not the frozen child—then continues. The Controller never invents or
repairs a Session ID after capture.

If an accepted predecessor changes, create `REV-002` and recapture every
downstream checkpoint. Never patch one accepted checkpoint in place and never
mix revisions.

### 7. Accept oracles after the canonical evidence exists

For each stage and E2E, review the current rubric against the accepted
canonical artifacts and author the expected findings independently. Set an
oracle to `accepted` only with provenance, reviewer identity/session and the
exact checkpoint/rubric hashes it covers. An empty oracle is valid only when
the review explicitly concludes that no expected finding exists.

Canonical checkpoint acceptance and oracle acceptance are separate decisions:
the first says “this is a valid stage input”; the second says “this is the
expected evaluation reference.”

## Implementation order

The shortest safe order is:

1. **Freeze beta.59:** version, build, test, tag and install the engine; pin,
   test and tag the flow pack; create the immutable product checkpoint and new
   profiles without rewriting beta.58.
2. **Finish the small eval runtime gap:** `DD_EVAL_HOME` resolver/layout,
   generated eval ID, path guard, home-relative checkpoint locator and
   aggregate readiness output.
3. **Tighten capture:** checkpoint `@2`, review-backed acceptance, separate
   `--canonical-subject-session` and `--checkpoint-subject-session` inputs,
   optional source-turn evidence, Session/Agent parentage and exact
   compatibility checks.
4. **Create session parents:** one accepted Subject baseline and one accepted
   Judge baseline for beta.59; configure the actual Controller profile as
   `gpt-5.6-terra/high` without creating a Controller baseline.
5. **Capture `REV-001`:** run the canonical chain once, review each predecessor
   result and accept all four entry checkpoints.
6. **Accept references:** complete stage/E2E oracles against the frozen chain.
7. **Prove launch:** run `validate --require scored`, restore each checkpoint in
   a disposable attempt, then execute one focused SPECIFY smoke with a fresh
   Subject fork and fresh Judge fork.
8. **Freeze the eval definition:** commit and tag `dd-eval` only after the smoke
   passes; then run the requested focused/segment/E2E matrix.

Steps 1–3 are code/config implementation. Steps 4–6 require real Desktop
sessions and semantic review. Step 7 is the launch acceptance test.

## Required checks

### `dd-flow-cli`

- typecheck, lint and full tests;
- snapshot create/restore test with project and runtime path rebasing;
- rejection of shared runtime, dirty stage boundary and archive-inside-source;
- built engine reports beta.59 version, release commit and flow-pack checksum;
- stable router resolves and diagnoses the installed beta.59 snapshot.

### `dd-tasks`

- only intended flow-pack/compatibility metadata differs from the product
  baseline unless explicitly recorded;
- Memory Bank lint and flow schema parity pass;
- exact beta.59 engine pin is present everywhere the runtime reads it;
- annotated beta.59 tag resolves to the case checkpoint commit.

### `dd-eval`

- tests for default/custom `DD_EVAL_HOME`, path escape and ID allocation;
- one validation call reports every known mismatch;
- beta.58 profile immutability regression;
- checkpoint `@2` capture, review acceptance and checksum tamper rejection;
- rejection when the frozen checkpoint Session is missing, has the wrong
  parent or has advanced after creation;
- focused/segment/E2E preparation from the correct accepted checkpoint;
- restore leaves the requested target stage unstarted and no stale binding;
- draft baseline, draft oracle or mixed chain revision fails closed.

## Explicitly deferred

The first launch does **not** require:

- a SQLite eval registry;
- automatic provider Session creation/forking;
- a custom Codex app-server adapter for historical `lastTurnId` forks;
- a background controller or scheduler;
- portable semantic stage fixtures;
- storage dashboards, automatic retention or timed garbage collection;
- automatic promotion from beta to Memory Bank canon.

Add those only after a real accepted run demonstrates a concrete need.

## Acceptance

This specification is complete when:

1. `validate --require authoring` passes before canonical capture;
2. all four `REV-001` entry checkpoints restore independently and point to
   reachable, idle frozen Subject Sessions that never advanced after capture;
3. beta.59 Subject/Judge baselines and all needed oracles are accepted, and the
   actual Terra/high Controller identity is recorded;
4. `validate --require scored` passes with no blocker;
5. a focused SPECIFY smoke reaches a candidate checkpoint and an accepted
   Judge result using only documented commands and paths below
   `DD_EVAL_HOME`;
6. the exact beta.59 engine, flow-pack and eval-definition commits/tags are
   recorded in the result.
