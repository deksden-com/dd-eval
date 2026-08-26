# Specification 009: Verification evidence and review closure

## Goal

Make verification evidence trustworthy without adding a second planning model.
The accepted criterion, declared check, retained receipt and deterministic stage
report form one traceable chain. CODE-REVIEW classifies findings once and never
repeats the review wave merely because accepted fixes were applied.

## Contract

PLAN declares checks as `{ id, command, run_at, required_artifacts? }` and links
acceptance criteria through `check_refs`. Behavioral meaning, expected evidence
and proof limits live only on acceptance. Valid gates are `work`, `code`,
`readiness`, `merge`, `release`, and `external`; a later gate is `not_due`, not a
false pass.

CODE Work returns changed paths plus semantic evidence grouped by acceptance
criterion. The CLI executes due checks. Every receipt contains the declaration
id, workspace fingerprint, stdout/stderr, exact required-artifact inventory and
hashes. Work receipts live under that Work attempt; stage gates live below the
stage. The project profile separates the command allowlist from
`aggregate_commands`.

CODE semantic verification is compact: verdict, summary, unresolved items and
deviations. Stage reports deterministically project check and acceptance status;
agents do not duplicate this bookkeeping.

CODE-REVIEW uses a compact immutable decision: summary plus one disposition and
reason per finding. The first Finish validates and freezes it, creates one
bounded repair Work for all accepted fixes, and returns the exact next commands.
After repair, the same Finish verifies the unchanged decision, reruns the full
aggregate CODE gate and closes the stage. Independent review is not repeated.

## Invariants

- no separate evidence registry, verification matrix or glob-based collector;
- no handwritten receipt or report evidence;
- no check is reported as passed without a successful receipt for the current
  workspace fingerprint and all declared exact artifacts;
- no terminal RUN event precedes the terminal stage event;
- changed-path discovery includes untracked files;
- schema replacement has no legacy fallback in the beta contour.

## Eval acceptance

The next pair must pass engine tests, matched-pair checks and a disposable
lifecycle diagnostic. A new immutable input checkpoint is required. Existing
canonical checkpoints are not rewritten; a new canonical chain is created only
after the pair is accepted.
