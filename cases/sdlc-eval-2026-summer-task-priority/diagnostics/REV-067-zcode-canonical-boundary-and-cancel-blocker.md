# REV-067 · ZCode canonical-boundary and cancellation blocker

## Observation

The ZCode subject (`builtin:zai-coding-plan` / `GLM-5.3-Flash`, `high`) bound
to the isolated runtime correctly and completed `SPECIFY` (including the
declared HITL answer) and `PROTOCOLIZE`.  The managed feature worktree was
created from the stable `main` integration checkout, so the earlier workspace
route failure was not reproduced.

This revision cannot be accepted as a canonical chain.  Its first command was
`dd-flow stage start --bootstrap ...`, which started SPECIFY immediately.  The
controller therefore missed the required snapshots at `specify`,
`protocolize`, and `plan` entry.  A snapshot is valid only before its target
stage starts; retrospectively capturing it is intentionally rejected by
`dd-flow run snapshot create`.

The PLAN capacity probe also showed why a non-canonical diagnostic run must
not be reused: all 15 Agent calls were issued, but only ten started in the
first wave.  The remaining five started after that wave completed, every
worker returned the literal `AGENT-NN`, and the whole probe took about 214
seconds.  It did not measure a bounded simultaneous capacity as required.

## Root cause

The execution envelope hand-authored for REV-067 followed the ordinary
bootstrap route instead of the canonical runbook.  The runbook already defines
the correct sequence: first call `dd-flow run prepare-vnext-specify`, capture
the unstarted RUN, and only then let the subject invoke the generated ordinary
`stage start <RUN> --stage specify` command.

The same run exposed an independent adapter lifecycle issue.  `session cancel`
notified ZCode of root cancellation, but the daemon's in-flight
`session.prompt` promise remained active.  `daemon stop --cancel-tree` waited
five seconds and returned `tree_not_settled`; the isolated daemon required a
scoped `SIGTERM` cleanup.  This invalidates the diagnostic execution but does
not alter its stage evidence.

## Required correction before a scored ZCode E2E

1. Materialize a new canonical revision from the pinned beta pair and create
   its RUN with `prepare-vnext-specify`.
2. Capture every entry before the subject starts it, beginning with SPECIFY.
   Preserve each ZCode provider session as harness evidence and create
   deterministic-replay starters only after acceptance.
3. Do not mark the case `ready` or run a scored E2E while its accepted
   snapshots point at the older REV-065 pair.
4. Make terminal daemon cleanup settle an active prompt after root
   cancellation, or return an explicit terminal invalid-infrastructure receipt
   without requiring the controller to kill a process manually.
5. Replace the model-driven probe wording with an exact bounded fan-out
   contract: interpolate each worker number, issue fifteen calls once, count
   starts inside the initial window, and terminate or disregard late calls at
   the three-minute deadline.
