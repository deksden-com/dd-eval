# Controlled recovery E2E — 2026-09-06

Run: `EVAL-20260906223630-0d25c085`.

The run used the local `dd-flow-cli` beta.20 build at engine commit
`463a6ff`; preflight accepted the frozen beta.20 input checkpoint and created
no provider Session.  The run then used the AGY 1.1.27 isolated profile with
one root native Session.

## Observed execution

- `SPECIFY`, `PROTOCOLIZE`, and `PLAN` completed.  The Subject repaired two
  schema-validation errors from the authoritative command results before it
  continued.
- `PLAN-REVIEW` created two direct native AGY child conversations.  Both
  children issued their prescribed `work start` command, but `dd-flow`
  rejected each with `trusted_session_binding_required`.
- The AGY daemon journal has the trusted parent `invoke_subagent` observation
  and native child IDs, but AGY emitted no child `PreToolUse` lifecycle receipt
  for either child command.  Native child transcripts are not an authority for
  granting a Work binding, so the rejection is intentional and correct.

This qualifies AGY retained-root observation only.  It does **not** qualify
selective native-child Work execution or child recovery.

## Controlled crash and evidence

After the child binding failure was recorded, the isolated AGY provider and
its daemon were deliberately stopped to exercise a process-crash path.  The
runner preserved the primary native error as
`agy_terminal_result_missing` and froze an immutable incomplete candidate.
The corresponding forensic snapshot is:

`executions/e2e/failure-evidence/c43bda13-f2bc-444f-99c9-668497244b15`.

Recovery capture stayed unavailable because the forced stop has no clean
provider-tree settlement receipt.  This is the required fail-closed outcome:
the forensic bundle is not a restorable recovery point.  The terminal Judge
completed with `completed_with_failures` and evaluated only preserved evidence.

## Follow-up

`agy_terminal_result_missing` is now normalized as `process_crash` from the
harness, rather than a generic runner failure.  A recoverable AGY child E2E
still requires a trusted, per-child native lifecycle receipt (or a documented
adapter capability that supplies an equivalent immutable receipt).  Do not
derive that authorization from child prompt or transcript text.
