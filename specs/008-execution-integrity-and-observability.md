# 008 — Execution integrity and complete observability

## Goal

Make an eval attempt measure the declared flow and model rather than accidents
of shell composition, scheduler order, stale canonical state, or incomplete
session accounting. Keep the mechanism small: reject ambiguous lifecycle
starts, execute the recorded Work graph, and derive reports from factual data.

## Decisions

### Writable attempt boundary

`dd-eval prepare` creates the only writable execution root under
`$DD_EVAL_HOME/attempts/active`. Canonical checkpoints are immutable inputs.
All commands that open an eval root reject direct canonical paths. This removes
the need for operator judgment about whether a directory is safe to mutate.

### Lifecycle start integrity

Every stage and Work begins with its generated start command as the first
technical action. The command is a standalone Bash invocation. The Codex hook
recognises quoted arguments and environment prefixes, rejects shell
composition around a protected start, and returns the exact retry command.
The retry stays in the same Session.

Stage setup is committed only after trusted hook/session binding succeeds. A
failed binding leaves no running stage, reviewer batch, or report path that a
different Session could later finish. A stage coordinator never claims a
reviewer Work.

### Work graph execution

`depends_on` means a result is required, not merely useful. The runtime rejects
starting a blocked Work and returns both its blockers and the Works currently
ready. Completion emits the newly ready successors. Review wave counts are
derived from the dependency graph and measured capacity; a one-wave preference
never overrides a hard edge.

Every Work receives one exact result path and completes with
`work finish --result-file`. This avoids shell pipelines and preserves hook
matching. Root coordinator completion does not overwrite a stage report that
the deterministic stage renderer already wrote.

### Reports and usage

CODE-REVIEW stores its receipts inside its own stage directory, records real
start/finish/wall-clock values, changed files, material acceptance statements
and normalized evidence references. Reviewers may read the bounded CODE
evidence directory instead of guessing individual receipt names.

Usage remains a query over physical provider Sessions. Rows expose the
provider Session ID, Agent ID, source timestamps and token/tool totals. Final
comparison checks every productive RUN Session, including reviewer and repair
children, against the declared execution profile. Reports never manufacture a
coverage flag in place of those facts.

## Acceptance

- compound stage/Work starts are rejected with a usable same-Session retry;
- a failed stage binding leaves no partial stage execution;
- blocked Work cannot start and becomes ready only after all hard predecessors;
- coordinator and reviewer Sessions cannot overwrite each other's result;
- CODE-REVIEW evidence, timing and changed-file fields are factual;
- a scored attempt cannot write to canonical storage;
- an undeclared model/reasoning change in any productive Session invalidates
  synchronization;
- typecheck, lint, focused lifecycle tests, the full engine suite and the eval
  suite pass before release.
