# REV-070 · ZCode runtime-environment blocker

## Observation

REV-070 correctly created and accepted an unstarted SPECIFY entry.  After the
ordinary user trigger, the Subject made 37 tool calls before any stage command.
They inspected global `~/.dd-flow`, `~/.codex`, `~/.zcode` and ran global
`dd-flow --help` / `dd-flow status`; the isolated RUN remained unchanged and
SPECIFY never started.

## Root cause

`dd-zcode daemon` passed its configured `DD_FLOW_HOME` only to adapter-side
lifecycle forwarding.  It did not put that variable into the environment of
the ACP process that launches ZCode.  Consequently the Subject shell resolved
the global default runtime instead of the prepared canonical runtime.

## Correction

The daemon now puts `DD_FLOW_HOME` into its ACP environment and the daemon
test asserts that propagation.  REV-070 predates that correction and is not a
valid canonical chain; its accepted entry is diagnostic evidence only.
