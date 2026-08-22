---
file: 'beta/lossless-executable-plan-beta.87/index.md'
description: 'Matched beta bundle for the lossless SPECIFY → CODE handoff cutover.'
status: 'ACCEPTED_FOR_CANONICAL_AUTHORING'
---

# Lossless executable PLAN — beta.87

This is the active implementation bundle for
[specification 006](../../specs/006-lossless-obligations-and-executable-plan.md).
It replaces the previous beta semantic handoff with one breaking, matched
engine/flow-pack contract. It is not itself a canonical checkpoint. Its
disposable diagnostic and release gates have passed; the next required step is
to rebuild and accept the canonical conversation/RUN chain before any scored
model run.

## Matched working pair

| Component | Repository | Branch | Commit | Version |
| --- | --- | --- | --- | --- |
| Engine | `deksden-com/dd-flow-cli` | `beta/vnext-plan-review` | `a863668eb71c3706115a01361a4e0d121523df49` | `0.8.0-beta.87` |
| Flow pack | `deksden-com/dd-tasks` | `beta/vnext-plan-review` | `3b4c3cfc1a1c50934d254c09387cd8c6faa8ed78` | `3.2.0-vnext-plan-review-beta.87` |

The project pack pins exactly `0.8.0-beta.87`; a router must select that
snapshot for every disposable diagnostic and later canonical workspace.

## Included contract

- [Specification 006](../../specs/006-lossless-obligations-and-executable-plan.md)

The specification is the only design checklist.  This index records the
tested component identity and acceptance evidence; it does not copy the
contract into a second checklist.

## Acceptance path

1. Run engine typecheck, lint, build and the relevant contract tests.
2. Validate the project-local flow pack, including exact schema parity.
3. Run one disposable `SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE`
   lifecycle diagnostic with this exact installed engine snapshot.
4. If the diagnostic exposes a root defect, increment the changed component's
   beta version, update this table, and repeat only the disposable diagnostic.
5. After the pair is sound, tag both immutable commits, create a new input
   checkpoint, rebuild the canonical chain and starters, then execute the
   declared 15-run comparison.

Historical beta bundles and checkpoints are comparison evidence only.  They
are neither compatibility inputs nor fallback fixtures for this bundle.

## Accepted diagnostic

On 2026-08-22 a disposable, isolated run used the exact installed engine
snapshot and completed the lifecycle through CODE entry:

```text
SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW (off) → CODE work registration
```

The diagnostic established all of the following without a legacy reader or
manual artifact mutation:

- SPECIFY published `specify.json` and its deterministic Markdown projection;
- PROTOCOLIZE created the policy-required feature worktree and published the
  protocol result there;
- PLAN accepted `plan.json`, its aspect map and the deterministic
  `code-work-batch.json` projection;
- review-off performed the same deterministic PLAN closure before CODE entry;
- CODE entry registered the executable Work from the batch with its prompt,
  paths, requirement references and verification command.

The run deliberately stopped at CODE entry: it was a handoff-contract
diagnostic, not a product implementation. Its disposable workspace was sent to
Trash after inspection. This is sufficient evidence for the matched pair; the
canonical chain is a separate, versioned acceptance step.

## Immutable tags

| Component | Tag |
| --- | --- |
| Engine | `eval-engine-0.8.0-beta.87` |
| Flow pack | `eval-mb-3.2.0-vnext-plan-review-beta.87` |
