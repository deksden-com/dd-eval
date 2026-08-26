---
file: 'beta/vnext-code-review-beta.1/index.md'
description: 'Draft beta contract for independent CODE-REVIEW, material findings and bounded repair after mandatory CODE verification.'
status: 'DRAFT'
---

# vNext CODE-REVIEW beta 1

This bundle extends the accepted `SPECIFY -> PROTOCOLIZE -> PLAN ->
PLAN-REVIEW -> CODE` contour with an optional independent CODE-REVIEW stage.

The boundary is deliberate:

1. CODE must verify that the implementation fulfils the accepted plan;
2. CODE-REVIEW independently challenges the quality of that already verified
   implementation;
3. deterministic checks remain owned by `dd-flow` in both stages;
4. CODE-REVIEW repairs only accepted material findings and does not start an
   automatic second review wave.

The bundle reuses the existing root orchestrator, Work registry, Session
binding, RUN capacity, plan-aspect catalog, CODE check runner and deterministic
stage-report renderer. It adds no second coordinator, review database, authored
coverage map or project-wide audit flow.

## Included specification

- [001 — independent CODE-REVIEW and bounded repair](specs/001-independent-code-review-and-bounded-repair.md)
- [002 — verification receipts and two-phase closure](specs/002-verification-receipts-and-two-phase-closure.md)

## Required implementation sequence

1. add mandatory semantic plan-conformance verification to CODE finish;
2. add `code_review.mode` to the frozen RUN execution profile;
3. add the CODE-REVIEW stage and its modular CLI service;
4. project applicable plan aspects and the actual diff into fresh reviewer
   Works;
5. validate compact reviewer findings and coordinator decisions;
6. compose accepted findings into bounded repair Works;
7. rerun focused and aggregate checks after repair without reopening CODE;
8. render deterministic CODE-REVIEW reports and expose the next flow action;
9. add focused and end-to-end evaluation coverage before promotion.

The implementation specification is authoritative for priorities, deferrals,
repair closure and the separation between CODE verification and CODE-REVIEW.
