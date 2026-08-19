# 011 — Restored starter-fork handoff

## Problem

A focused-stage attempt restores a frozen stage-entry RUN and then starts a
fresh Subject from the checkpoint's untouched starter Session.  Snapshot
restore correctly retires the canonical Work/Session binding, but the
`same_session` PROTOCOLIZE guard still compared the new Subject against that
retired canonical Session ID.  Every focused PROTOCOLIZE attempt therefore
failed before it could execute the stage.

## Decision

The engine treats only a predecessor Session explicitly marked
`snapshot_restored` as retired.  A new Subject binding is allowed at that
stage entry; it becomes the live same-session owner for the candidate RUN.
All ordinary RUNs retain the strict equality check: a different Session still
fails with `handoff_session_mismatch`.

The Controller remains responsible for the eval-specific lineage boundary:
it forks the committed starter Session and records starter/child IDs in the
attempt before sending the generated stage continuation.  The engine does not
invent or accept agent-provided Session IDs.

## Acceptance

1. An ordinary same-session PROTOCOLIZE handoff rejects a different Session.
2. A restored stage-entry snapshot accepts the first Subject fork.
3. The new binding is the sole active Work/Session binding for the stage.
4. The engine has a focused regression test for both paths.
5. The next canonical chain and model comparison use a new immutable matched
   engine/flow-pack pair; beta.63 snapshots are not modified.
