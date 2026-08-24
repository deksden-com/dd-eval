# REV-034 · CODE blocker: prose checks executed as shell commands

## Status

`RUN-001-task-priority` is paused in `05-code`; it did not reach `code_completed`.

## Evidence

- Stage: `CODE`, attempt `try-001`; blocker code: `packet_checks_malformed_exit_127`.
- Work: `WRK-005-prt-008-task-priority-p1`.
- The accepted plan put five values in `verification.checks`. The first two are executable aliases (`@check/db-migrate-local`, `@check/db-check-local`); the remaining three are descriptive assertions such as `db-check assertion: schema permits …`.
- `work finish` forwards `packet.checks` unmodified to the shell gate. The descriptive values were therefore executed as commands and failed with exit 127.
- Before the synthetic check failure, the worker reported successful migration, database, integration, formatting and type checks. That does **not** make P1 accepted: the Work lifecycle correctly remained failed.
- The flow offers repair creation from an aggregate check receipt and a completed origin Work. This failure is at per-Work finish, so no supported repair path or legal retry was returned.

## Root cause

The plan/code-work data contract mixes two different concepts in one `checks` list:

1. executable deterministic commands or project aliases; and
2. semantic assertions to be demonstrated by a test or receipt.

CODE treats every entry as (1), while PLAN and PLAN-REVIEW allow (2) in the same field.

## Required correction before rerun

- Make the executable check list structurally separate and accept only registered aliases/commands that `code-check-profile.json` recognises.
- Keep semantic assertions in `expected_evidence` or a dedicated non-executable assertion field; surface them in worker prompts and stage reports without sending them to the shell.
- Validate this separation when PLAN generates `code-work-batch.json`, so an invalid packet fails before CODE opens a Work.
- Define a legal recovery contract for a check failure that occurs during `work finish`, or make the failure receipt eligible for the existing repair-work path. The first option must not silently mark an unaccepted origin Work complete.

## Non-effects

No CODE finish, CODE review or merge was started. `P2`–`P4` remain unstarted. The worktree contains unaccepted P1 edits solely for diagnostics and must not be treated as an evaluated or mergeable implementation.
