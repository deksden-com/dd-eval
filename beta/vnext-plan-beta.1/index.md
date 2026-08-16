---
file: 'beta/vnext-plan-beta.1/index.md'
description: 'Draft beta contract for canonical PLAN parity on the vNext flow and its minimal Work runtime.'
status: 'DRAFT'
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
- [Controlled eval runbook](runbook.md)

## Intended implementation order

1. Apply specifications 005, 006 and 007 as the correction gate over the original bundle;
   deterministic contract tests must pass before another model eval.
2. Cut over RUN Flow identity and rebuild the vNext Work storage/CLI to the
   minimal registry contract from specification 002, with no compatibility
   path.
3. Implement one-PRT PLAN start, correction, grounding, document promotion,
   prompt, finish, validation and proposed CODE graph from specification 001
   as superseded by specification 007.
4. Add the PLAN-REVIEW stage, policy resolution, fresh reviewer fan-out,
   orchestrator reduction, reporting and atomic CODE Work projection from
   specification 007.
5. Add shared/member PSET Works, capacity-aware waves and final integration
   from specification 003 under the PLAN-REVIEW ownership defined by 007.
6. Freeze one engine/flow pair and apply the quality gate from specification
   004 to separate single-PRT and PSET eval cases.

## Implementation cutover checklist

One implementation change set must update:

- `flow-run@3`, rebuilt Work/Agent-Turn storage and all affected SQL/types;
- Work CLI commands, help, hook participation and canonical fingerprints;
- `protocol-plan@2` and `plan-aspect-map@2` schemas, examples and validators;
- vNext PLAN stage start/finish, prompt renderer, selected-file lint and
  deterministic reports;
- PLAN-to-PLAN-REVIEW handoff, PLAN-REVIEW-owned CODE coordinator/child
  projection and CODE stage entry lookup;
- flow-pack instructions/readers for PLAN, CODE and READINESS;
- unit/integration tests for schema rejection, Work state/dependency/parent
  rules, hook binding, retry/cancel, finish atomicity and report rendering.

The first behavioral eval is the compact single-PRT case. The PSET topology is
then evaluated as a separate case; it does not complicate the first score or
serve as a fallback path for it.

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
