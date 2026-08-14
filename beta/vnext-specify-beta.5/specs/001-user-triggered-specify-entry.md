# User-triggered SPECIFY entry

## Problem

The beta engine can launch `mb-sdlc-vnext-specify`, but the active `prime.md`
still routes “Ок, давай оформим протокол” to legacy `protocol.md`. A native
fork of a primed conversation therefore cannot enter the evaluated flow from a
normal user message.

## Decision

For this beta, a request to create/formalize a protocol is the user-level
trigger for the vNext SPECIFY-first flow. `prime.md`, the catalog and the
normal-route overview route it to `vnext/start.md`. That entry materializes the
raw discussion in the local intake workspace, then invokes the existing
hook-bound `dd-flow flow launch --flow mb-sdlc-vnext-specify` command. The
returned worker prompt remains the sole semantic SPECIFY instruction.

`vnext/specify.md` is deliberately not used as the direct entry: it needs the
RUN, Work, stage workspace and bounded context deterministically produced by
`flow launch`.

## Non-goals

- Do not introduce a second router, controller message or manual session id.
- Do not create a PRT before SPECIFY.
- Do not change the engine or its `0.8.0-beta.4` snapshot: the launch command
  already supplies the required atomic RUN/Work/session binding.
- Do not alter canonical `dd-memorybank/main` before the beta fork run proves
  this routing.

## Acceptance

1. A fresh session completes `prime.md`, discusses the feature, is forked, and
   receives only “Ок, давай оформим протокол.”
2. The fork follows `vnext/start.md`, materializes the discussion, and its
   first lifecycle command is `flow launch` from that worker session.
3. The hook binds the fork session; the agent receives the generated SPECIFY
   prompt and creates only `specify-result.json`.
4. No `PRT-*`, plan, code, review or merge work is created.
5. The saved baseline and measured result name the exact prompt hashes and
   session/thread identities.
