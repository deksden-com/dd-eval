---
file: 'beta/vnext-workspace-route-beta.1/index.md'
description: 'Beta contract for deterministic feature-worktree routing before PLAN.'
status: 'IN_PROGRESS'
---

# vNext workspace route beta 1

This beta closes the missing delivery-workspace boundary uncovered by the SOL
evaluation. `PROTOCOLIZE` decides only the delivery shape; the CLI owns the
Git route, creates the feature worktree, bootstraps it and materializes the
new protocol documents there before PLAN can start.

## Included specification

- [001 — deterministic protocol workspace route](specs/001-deterministic-protocol-workspace-route.md)

## Acceptance boundary

The beta is ready for a new canonical chain only when the deterministic tests
prove both routes:

1. a Git project gets a managed feature worktree before PLAN and the stable
   checkout remains unchanged by PROTOCOLIZE materialization;
2. a stage-entry snapshot of that RUN restores both the stable checkout and
   feature worktree, with PLAN still bound to the restored feature workspace.

No compatibility reader for the pre-route snapshot format is retained. The
previous canonical chain is evidence for the old treatment only.
