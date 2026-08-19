---
file: 'specs/004-protocolize-worktree-boundary.md'
description: 'Move the feature-worktree boundary to deterministic PROTOCOLIZE start.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
extends: '003-canonical-eval-launch-readiness.md'
---

# 004 — PROTOCOLIZE worktree boundary

## Problem

The beta flow declares `feature_route_stage: protocolize_finish`, while the
project Git policy and `common/git-ops.md` require a feature worktree before a
durable protocol is published. The resulting prompt tells the agent not to
create a worktree, but CLI materializes it only after the agent has completed
PROTOCOLIZE. This is an invalid boundary: PLAN can neither reliably inherit
the right cwd nor prove that the PRT, branch and workspace were one contour.

## Decision

For a project configured with `workspace.route: feature_worktree`:

```text
SPECIFY (stable checkout, read-only)
  -> PROTOCOLIZE start: CLI creates + bootstraps feature worktree
  -> PROTOCOLIZE: agent writes only its RUN result file
  -> PROTOCOLIZE finish: CLI validates route and materializes durable docs
  -> new Session in feature-worktree
  -> PLAN -> PLAN-REVIEW -> CODE
```

No agent manually creates, chooses or repairs a branch/worktree. There is no
fallback to a direct integration checkout when the configured route cannot be
materialized.

## Machine-readable project policy

Add one project-local CLI-owned configuration file under
`.memory-bank/dd-flow/`. It is the single machine-readable source for the
workspace route; `project-policy.md` explains the same human-facing policy and
links to it, but CLI must not infer routing from prose or the current branch.

The minimal schema is:

```json
{
  "schema_id": "dd-flow/project-workspace@1",
  "workspace": {
    "route": "feature_worktree",
    "integration_branch": "main",
    "feature_branch_template": "feature/run-<RUN>-<slug>",
    "provision_stage": "protocolize_start",
    "next_stage_session": "new_session"
  }
}
```

`integration_branch_direct` is a valid explicit alternative. It does not
create a worktree and may keep `next_stage_session: same_session`. Missing,
invalid or contradictory configuration is a fail-closed CLI error; it is not a
reason to guess a route.

The branch is RUN-scoped because the delivery shape (one PRT or PSET) is only
known at the end of PROTOCOLIZE. A later PRT id is durable metadata, not a
reason to defer workspace provisioning or rename the branch.

## CLI lifecycle

`dd-flow stage start <RUN> --stage protocolize` must atomically:

1. validate the project workspace configuration and stable checkout;
2. create the configured feature branch/worktree with `wt` and execute the
   configured bootstrap;
3. record the worktree and rebind the RUN workspace before writing the prompt;
4. render the prompt with stable root, actual feature workspace, branch, base
   commit, bootstrap receipt and the mandatory next-session boundary;
5. bind the live agent session through the existing trusted hook.

The start must be idempotent for a previously recorded, healthy worktree of
the same RUN. It must fail when the recorded workspace is absent, on another
branch, dirty before bootstrap, or conflicts with the route—never silently
create a second workspace.

`protocolize finish` must require the recorded route, materialize PRT/PSET and
feature documents into that workspace, and return an exact next-stage command
plus `cwd`. It must not create or select a worktree.

For `feature_worktree`, PLAN start and every later stage that writes project
files must verify that the hook event cwd is the recorded `workspace_root`.
PROTOCOLIZE is the only transition-stage exception: it may run from the stable
session because it writes solely to its RUN stage workspace. Its finish
requires a new agent session from the returned feature-worktree cwd.

## Prompt and flow contract changes

- Change the flow contract to `feature_route_stage: protocolize_start`.
- PROTOCOLIZE prompt must state the actual route and explicitly limit writes
  to `protocolize-result.json`; it must not claim the workspace will be
  created on finish.
- Its finish response must say that the current session is now complete for
  project work and provide the exact command/cwd for PLAN.
- PLAN, PLAN-REVIEW and CODE prompts receive the frozen route facts from the
  CLI. They must not rediscover Git policy or create a worktree.
- Generated eval Subject continuations always include
  `--require-session-binding`, so every stage has a trustworthy bound session
  and its usage can be reconstructed.

## Verification and cutover

Required tests cover feature route creation at PROTOCOLIZE start, idempotent
resume, invalid/missing policy, finish without a route, and rejection of PLAN
from the stable cwd. An integration test must demonstrate PRT documents,
feature branch and RUN workspace are all in one worktree.

Release a new matched beta engine/flow pair. Existing canonical checkpoints
and starter Sessions were made under the old boundary and are diagnostic only.
After the pair passes tests, create a new canonical chain, accept all four
entry checkpoints, create fresh starter forks, and only then run the focused
Luna/Terra/Sol matrix and E2E comparison.
