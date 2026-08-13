# 001 — Bootstrap hook registers the project

## Evidence

In beta.3, the active Desktop `PreToolUse` hook was installed, trusted and
matched `Bash`, but its adapter required the materialized project to exist in
SQLite. That project is normally created by the following bootstrap command,
so no hook event could be created and `--require-session-binding` failed.

## Decision

Only for `dd-flow stage start --bootstrap` with an explicit `--project-root`,
the hook registers that root before resolving the project and recording its
event. This is idempotent CLI-owned setup, not agent-authored project setup.
All non-bootstrap hook paths keep their existing registered-project boundary.

## Acceptance

- regression test runs the actual hook before any project registration, then
  runs bootstrap with its rewritten trusted event and succeeds;
- a real Desktop task receives a bound session on its first bootstrap command;
- no retry or manual session id is allowed.
