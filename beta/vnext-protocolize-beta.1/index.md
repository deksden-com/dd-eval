---
file: 'beta/vnext-protocolize-beta.1/index.md'
description: 'Beta contract for the SPECIFY → PROTOCOLIZE proving slice.'
status: 'VALIDATED'
---

# vNext PROTOCOLIZE beta 1

This bundle extends the proven vNext SPECIFY contour with one following stage:
`SPECIFY → PROTOCOLIZE`. It intentionally excludes PLAN, CODE, REVIEW and
MERGE runtime work.

Engine target: `dd-flow-cli@0.8.0-beta.20`.

Flow pack target: `3.2.0-vnext-protocolize-beta.8`.

## Included specifications

- [001 — flow, handoff and Work contract](specs/001-flow-handoff-and-work.md)
- [002 — PROTOCOLIZE delivery documents and acceptance](specs/002-protocolize-documents-and-acceptance.md)
- [003 — catalog shelf and eval proof](specs/003-epic-catalog-and-eval.md)

## Live proof

`EVAL-003` passed in both handoff modes on beta.4, exposing and preserving two
runtime defects. Beta.5 fixed the projection defect and passed the clean
same-session rerun. Beta.8 adds the complete delivery contract and is prepared
for the next same-session proof. Results live beside the case.
