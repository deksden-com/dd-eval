# REV-069 · ZCode Subject liveness blocker

## Observation

The primary ZCode Subject uses the declared profile `builtin:zai-coding-plan` /
`GLM-5.3-Flash` / `high` / `yolo`.  Priming and the ordinary product discussion
completed successfully.  The canonical SPECIFY-entry snapshot was captured and
accepted while `RUN-001-task-priority` was still unstarted.

After the ordinary user trigger “Давай … оформим протокол”, the Subject emitted
only thought chunks.  It did not call `dd-flow`, did not start SPECIFY, and did
not return a terminal message.  The last adapter event is
`2026-08-29T03:42:41.571Z`; at `2026-08-29T05:42:26+02:00` the provider still
reported the same turn as `running` with no active tool call.  RUN state stayed
unchanged (`next_action: start_specify`, no stage run, no Work).

## Consequence

This is a genuine liveness blocker for the canonical chain, not a product or
flow result.  The protected SPECIFY entry remains valid because it precedes the
stuck turn.  No downstream checkpoint, starter, or scored E2E may use REV-069.

## Suspected boundary

The failure occurs in the ZCode provider/ACP Subject turn before the first
`dd-flow` command.  `dd-flow` has no new lifecycle evidence and therefore is
not the component that can have caused this specific stall.  The adapter must
also make a root-turn cancellation settle its daemon operation; REV-067 showed
that this is currently unreliable.

The ordinary `dd-zcode session cancel` was then issued once.  ZCode accepted
the request, but after eight seconds still reported the root as `running` and
the daemon still owned `session.prompt`.  This reproduces the cancellation
half of the boundary defect without touching the RUN.

## Required correction

1. Add a bounded liveness watchdog to the ZCode adapter: report a terminal
   `subject_liveness_timeout` receipt with the last event timestamp and turn
   identifier, rather than leaving a daemon operation indefinitely active.
2. Make cancellation settle that operation deterministically, including the
   root prompt, without requiring a controller-side process signal.
3. After the adapter fix, create a new canonical revision from the same pinned
   pair.  Do not reuse the active Subject turn or fabricate downstream state.
