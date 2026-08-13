# 002 — Finish receipts and conflict boundary

## Evidence

The first failed beta.2 finish payload was overwritten during repair. SQLite
recorded only accepted lifecycle transitions, so diagnosis lost the original
request that triggered the failure.

## Decision

Each `stage finish` creates one RUN-local immutable receipt before validation.
It records the raw semantic input (or its absence), checksum, final accepted or
rejected outcome, and safe error details. SQLite `audit_events` records the
same attempt outcome for queryable history. This is lifecycle evidence, not a
new manual trace system or a general logger.

The rendered stage prompt makes rejection semantics explicit: never rewrite a
required semantic result to another permitted lifecycle status. Stop with
`flow_contract_conflict` instead.

## Acceptance

- a rejected finish leaves `finish-receipts/001.json` and
  `stage.finish.rejected` audit evidence;
- an accepted finish returns its receipt path;
- normal stage reports, HTML and summary remain CLI-generated.
