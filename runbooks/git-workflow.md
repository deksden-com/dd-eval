# Git workflow across the integration repositories

Policy for `dd-flow-cli`, `dd-eval` and the downstream `zcode-acp` fork. This
document defines the agreed workflow; it does not claim GitHub branch protection
or default-branch settings have already been configured.

## Shared rules

`main` is the default integration branch. Use short-lived `feat/<topic>`,
`fix/<topic>` or `docs/<topic>` branches for changes and `upgrade/<component>-<version>`
for upgrade candidates. Branch from current main unless the fork rule below
requires an upstream base. Keep one coherent task per branch; isolate concurrent
tasks in worktrees and preserve existing uncommitted work. No permanent develop
branch is needed.

Before merging, inspect the diff, run checks appropriate to the change and record
their results in a PR/review receipt. CI-required gates must pass. Documentation
changes need link/command review, not an unrelated full runtime suite. Runtime,
prompt and canon changes require behavioral checks. Prefer PRs into main with
required checks/review enforced by repository settings when configured. Routine
direct pushes to main are outside this workflow.

For dd-flow-cli and dd-eval, squash merge a coherent task by default. Preserve
separate commits when their history is operationally useful. Remove merged task
branches once they are no longer needed. Never rewrite shared main or release
tags. Fix a bad merge with a reviewed revert/follow-up change.

## Repository-specific integration

| Repository | Merge condition | Release/acceptance boundary |
| --- | --- | --- |
| dd-flow-cli | Implementation and affected contracts pass the release policy's required checks. | Publish the exact verified candidate artifact under an immutable version/tag; preserve provenance. Main HEAD alone is not a released engine. |
| zcode-acp fork | Upstream candidate plus maintained patches passes bridge and adapter contract checks; review patch inventory. | Tag/build identity identifies an immutable downstream artifact. Full system qualification is tracked separately in dd-eval. |
| dd-eval | Profiles/checkpoints/runbooks are internally consistent, hashes verified and candidate status explicit. | Candidate definitions may merge before E2E; acceptance requires a separate completion/qualification receipt. |

For a multi-repository change, prepare the bridge, adapt dd-zcode if necessary,
release verified artifacts, then merge pinned eval definitions and execute the
qualification. Record exact cross-repository refs; branch names never substitute
for artifact identity. A candidate can be published/merged without being promoted
as an accepted runtime. Keep candidate and accepted tuples distinguishable in
receipts and do not silently replace the last accepted selection.

## Fork history

Keep `upstream` as the original project remote and `origin` as our fork. Remote
tracking refs contain unmodified upstream history. An optional local `upstream`
branch is a fast-forward-only mirror, not a second development branch.

Create `upgrade/zcode-acp-<version>` at the exact selected upstream tag in an
isolated checkout. Cherry-pick the still-required downstream commits, preserving
their logical separation and tests. Update PATCHES.md when upstream replaces a
patch. Rebase only private/unpublished candidates; published candidates get new
refs when rewritten. Preserve qualified overlay refs.

Merge an approved upgrade into our main using a merge commit, retaining the
upstream ancestry and individual patch history; do not squash the entire fork
upgrade. Because re-applied patches can conflict with older main patches, inspect
the merge result against the tested candidate tree and rerun checks for any
resolution changes. The release must identify the actual tested source commit;
do not assume a pre-merge commit qualification automatically covers a new build.

Use the [fork's instructions](https://github.com/deksden-com/zcode-acp/blob/main/docs/FORK-UPDATES.md)
for technical patch maintenance. Existing `dd-eval/v0.43.2-overlay` is a retained
candidate branch; migration to this naming policy does not require rewriting it.

## Hotfixes and rollback

Fix current main when practical. If an older released line needs a patch, branch
from its exact tag, run the applicable gates, issue a new immutable patch release
and bring the fix into main. Do not bypass gates by calling a change a hotfix.
Rollback selects an earlier accepted artifact tuple for a fresh run and records
that choice. It does not reset shared history or mutate an active eval runtime.
