# 002 — Trusted Codex session binding

## Problem

The installed `PreToolUse` hook receives the real Codex `session_id`, but the
current handler finds the project only from hook `cwd`. In a Desktop eval the
task cwd is outside the materialized project, although the intercepted
`dd-flow stage start` command has `--project-root`. The event becomes
`unrelated_cwd`, no session is bound, and an agent can be pushed toward unsafe
manual session registration.

Additionally `codex hook handle` is router-native, so a stable router can run
the stable hook handler even when project commands select a beta engine.

## Decision

Keep one idempotent observing `PreToolUse` hook per active `CODEX_HOME`. It
remains the only source of Codex session identity.

The stable router becomes a narrow hook dispatcher only for this command:

1. read the hook payload once;
2. ignore non-Bash and non-`dd-flow` commands;
3. parse the intercepted command's `--project-root` before falling back to
   payload cwd;
4. resolve the project-compatible engine and dispatch the same payload to it;
5. beta engine records an idempotent hook event and returns an opaque
   `--hook-event-id` command rewrite;
6. `stage start` consumes that event, creates/attaches the RUN and binds the
   trusted session in SQLite.

The agent never sees or provides `--session-id`; remove it from worker-facing
commands and stage-prompt material. A hook event can be observed repeatedly
without duplicate bindings. One session may have time-scoped segments across
different RUNs.

No `PostToolUse` hook is added: participation and successful CLI completion
are separate facts, and lifecycle completion is already CLI-owned.

## Acceptance

1. Router-level test proves a bootstrap hook dispatches to the selected beta
   engine using `--project-root` inside payload command.
2. Hook test with unrelated cwd and valid project-root creates one binding.
3. Replaying the same event is idempotent.
4. A bootstrap `stage start` receipt reports the actual Codex session as bound.
5. Stage finish can report unavailable binding honestly but never accepts a
   model-authored replacement id.

## Out of scope

Guessing session ids, a daemon, `PostToolUse`, or a separate beta `CODEX_HOME`.
