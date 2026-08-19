---
file: 'beta/vnext-workspace-route-beta.1/specs/001-deterministic-protocol-workspace-route.md'
description: 'Makes the feature worktree an explicit, deterministic PROTOCOLIZE handoff.'
status: 'IMPLEMENTING'
---

# Deterministic protocol workspace route

## Problem

The prior beta asked PROTOCOLIZE to respect the project Git policy but neither
created a feature worktree nor bound subsequent stages to one. The agent could
therefore produce valid-looking protocol files in the stable checkout. PLAN
then inherited an invalid repository state. A PLAN reviewer correctly blocked
that state, but only after avoidable work.

## Decision

For a Git project, PROTOCOLIZE finish is the sole route boundary.

1. The start packet freezes Git facts and the flow policy.
2. The agent returns delivery semantics only: one PRT or a PSET, slug,
   acceptance and durable-document links. It does not choose a branch or a
   filesystem path.
3. The CLI allocates the PRT/PSET ID, creates
   `feature/<delivery-id>-<slug>` with Worktrunk beneath the service-managed
   checkout root, runs the ordinary worktree bootstrap, materializes the
   protocol/feature documents there and records that workspace on the RUN.
4. PLAN, PLAN-REVIEW and later coding stages consume the registered RUN
   workspace. Their prompts name absolute authoritative paths, so an agent
   cannot silently create a second relative `.memory-bank` tree.

A non-Git fixture uses the explicit direct route. It exists only for
deterministic unit tests; normal repository delivery uses the feature-worktree
route.

## Snapshot contract

`dd-flow/eval-run-snapshot@2` captures the stable project tree and, when the
RUN workspace differs, a second worktree tree plus its named branch. Restore
creates that branch as a real sibling worktree of the new stable checkout,
overlays the captured workspace files and rebases runtime paths to the two
new roots. A snapshot never serializes `.git`; it rebuilds Git metadata from
the restored project. This avoids mutable original worktree paths while
preserving the state PLAN actually needs.

## Non-goals

- no agent-run `wt switch` command;
- no per-stage branch selection;
- no fallback that silently rebinds a feature workspace to the stable tree;
- no PSET concurrency expansion in this single-PRT task-priority case.
