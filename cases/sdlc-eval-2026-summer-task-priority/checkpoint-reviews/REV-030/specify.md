---
description: 'Acceptance review for the REV-030 SPECIFY entry checkpoint.'
purpose: 'Record that the matched SPC-006 pair has a clean, ordinary-discussion entry point before SPECIFY.'
version: '1.0.0'
date: '2026-08-22'
status: 'ACCEPTED'
parent: 'cases/sdlc-eval-2026-summer-task-priority/case.json'
---

# REV-030 — SPECIFY entry

The frozen Subject Session completed project priming and an ordinary discussion
of task priority, but did not receive the user-level flow trigger and did not
start a stage. The captured RUN is `RUN-001-task-priority`, is running with
`next_action: start_specify`, has no stage attempts, no active child Work and
uses the matched pair recorded by `cp-011-lossless-executable-plan-beta-85`.

The checkpoint is accepted as a reproducible entry boundary. It makes no claim
about the semantic quality of SPECIFY, because that stage has not run yet.

## Successor-stage check

The canonical Subject completed SPECIFY after this boundary. Its accepted
`specify.json` preserves nine requirements and six observable criteria,
including the three-value vocabulary, `medium` default/backfill, invalid-value
rejection, existing authorization/archived-project boundaries and deterministic
API/browser evidence. `specify.md` is present as the deterministic projection
and both hashes are recorded by the stage report. PROTOCOLIZE receives the
accepted JSON source rather than a Markdown-derived list.
