# Legacy eval garbage-collection plan — 2026-08-18

Status: **applied on 2026-08-18**.

The active `case@3` has no accepted canonical checkpoints. The user decided
that no previous local eval attempt needs to be retained as a reference. These
attempts predate the canonical stage-checkpoint contract and are not valid input
for a scored run.

## Applied targets

These exact non-Git runtime roots were moved to macOS Trash and are absent from
`_Projects`:

```text
/Users/deksden/Documents/_Projects/dd-eval-runs
/Users/deksden/Documents/_Projects/dd-flow-runs
/Users/deksden/Documents/_Projects/EVAL-005-vnext-plan-review-task-priority
/Users/deksden/Documents/_Projects/EVAL-014-summer-e2e-beta56
```

Observed size before cleanup:

| Root | Observed size | Reason |
| --- | ---: | --- |
| `dd-eval-runs` | 1.0 GB | obsolete scratch, fixture-based and beta attempts |
| `dd-flow-runs` | 12 MB | obsolete standalone runtime attempt |
| top-level `EVAL-005…` | 8 KB | duplicate orphan runtime root |
| top-level `EVAL-014…` | 280 KB | duplicate orphan runtime root |

Do **not** delete project repositories or Git worktrees. These remain because
their beta branches are ahead of `main`:

```text
dd-flow-cli.beta-engine-0-7
dd-flow-cli.beta-vnext-specify
dd-flow-cli.beta-vnext-plan-review
dd-tasks.beta-mb-3-2
dd-tasks.beta-vnext-specify
dd-tasks.beta-vnext-plan-review
dd-memorybank.beta-vnext-specify
```

Approximately 1.0 GB of obsolete eval/runtime data was removed from the active
workspace. It remains recoverable until Trash is emptied.

## Procedure used

1. Confirm no live Desktop task or shell process has a working directory below
   a target root.
2. Re-run `du -sh` for every target and verify that the list exactly matches
   this document.
3. Create and verify `$DD_EVAL_HOME` before the next eval. It is not part of
   the deletion set.
4. Move only the four explicit roots above to Trash; do not use an unbounded
   glob, repository root, or home directory as a deletion target.
5. Verify that all four roots are absent and record reclaimed space.
6. Start new evaluations only beneath `$DD_EVAL_HOME` according to
   [eval storage and retention](eval-storage.md).

The future `dd-eval gc plan` command replaces this hand-authored plan for new
attempts. A generated plan remains read-only until the operator explicitly
applies it.
