# REV-055 implementation plan

## Objective

Replace the incomplete REV-054 beta behavior with a coherent vNext pair before
creating a new canonical chain. The pair must preserve agent-owned engineering
decisions, use deterministic CLI enforcement, retain complete evidence, and
remain efficient under the normal Desktop harness.

## Required changes

1. Replace per-item duplicated check declarations with one PLAN check catalog.
   Items and acceptance criteria use `check_refs`. A check is either available
   or planned; a planned check names its provider Work and, for an alias, its
   exact definition.
2. Let PLAN choose checks and declare new commands/aliases. CLI validates ids,
   dependencies, gates, guarded operations and later materialization; it does
   not select, rank or classify checks by cost.
3. Materialize planned checks in their provider Work. `work finish` verifies
   the command/alias, executes it and saves the receipt. Consumers must be
   ordered after their provider.
4. Turn the project check profile into reusable aliases, aggregate gates and
   guarded-command rules, not a closed allowlist of ordinary local checks.
5. Make PLAN-REVIEW test verification design, never remove a Work's last
   check, accept only evidence-backed scope changes, and distinguish advisory
   comments from material defects.
6. Use a single conservative lifecycle-shell analyser. Rewrite only the exact
   safe dd-flow invocation; never rewrite heredoc input. Hinted matching binds
   unmodified heredoc resumes to the recorded PreToolUse event.
7. Add SPECIFY policy-collision checking. Let PROTOCOLIZE record user-backed
   obligation amendments without restarting SPECIFY; downstream stages consume
   effective obligations deterministically.
8. Keep aspect maps as routing manifests. Store actual review outcomes only in
   PLAN-REVIEW evidence and reports. Make non-essential aspect inputs `informs`.
9. Compact stage packets without losing their contract, enforce a one-shot
   harness-timed capacity probe, and make the eval controller resilient to
   transient Desktop API failure.

## Delivery order

1. Write beta specifications and update Memory Bank indices/runbooks.
2. Upgrade schemas and flow prompts together, with no legacy fallback.
3. Implement engine support and focused tests.
4. Update the project profile and test/check documentation.
5. Run unit, integration, typecheck, lint and beta-pair verification.
6. Audit every item in this document against source and tests; repair gaps.
7. Commit and publish a matched engine/flow beta pair.
8. Prepare a new canonical revision, accept stage checkpoints, create starter
   forks and run a full Desktop E2E eval. Record every defect and stop only on
   a genuine blocker.

## Acceptance

- HITL heredoc answers are byte-for-byte unchanged.
- No Work lacks a meaningful declared check.
- A planned check cannot be consumed before its provider succeeds.
- The CLI runs aggregate gates only at their declared gate.
- PLAN-REVIEW cannot remove verification without a replacement.
- Effective R/AC obligations are internally consistent after clarification.
- Review routing honors real hard dependencies and otherwise uses one wave.
- Prompts contain needed commands/paths without truncation.
- A released pair passes all focused and full validation before canonical use.
