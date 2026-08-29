# REV-068 · ZCode SPECIFY semantic-quality blocker

## Observed behaviour

The isolated pair was correct:

- project: clean `main` checkout at `e541118fed3c05a7dbb2b6331ccadb37d026f47d`;
- runtime: Memory Bank `3.2.0-vnext-plan-review-beta.121` and dd-flow
  `0.8.0-beta.120`;
- ZCode provider session: `sess_81c0e60c-9f45-4ca1-9f03-f8535305f94d`;
- trusted lifecycle binding and standalone `stage start` both succeeded.

The subject completed SPECIFY without a user pause.  It materialized the
following ungrounded product decisions as if they had been agreed in the
preceding discussion:

- a three-value taxonomy `low` / `medium` / `high`;
- `medium` as default for new and existing tasks;
- priority as the primary ordering key of the task list.

The actual discussion asked only to discuss expected behaviour, defaults and
edge cases.  It contained no user answer adopting any of those choices, and no
authoritative project policy supplies them.  The generated `specify.json`
therefore does not preserve the user's intent faithfully and cannot be the
input of a canonical PROTOCOLIZE/PLAN chain.

## Root cause

The stage prompt already says that a new visible taxonomy, persisted-data
default and public input semantics require a user answer when no authoritative
source exists.  The model nevertheless treated its own discussion suggestions
as settled user facts.  The prompt does not make that provenance boundary
prominent enough: an agent-authored recommendation in prior conversation is
not a user decision.

## Required correction

Strengthen the general SPECIFY instruction near the decision rule:

> Only an explicit user statement or an authoritative project source settles a
> product decision.  Your own earlier recommendation, summary or proposed
> default is not evidence of user acceptance.  Keep it proposed and ask when
> the distinction changes scope or acceptance.

This is general flow behaviour, not a task-priority-specific hint.  It needs a
new beta pair and a fresh canonical revision because the prompt is part of the
evaluated flow.  Do not accept downstream entries or create starters from this
semantic failure.
