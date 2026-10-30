# CP267 scenario acceptance closure — cycle4

## Authority and evidence

User 2026-10-30 authorizes one additional repair/fresh full Luna; total4 repairs,
not a reset. No full gate/GitHub CI, product edits, scoring relaxation or changes
to historical EVAL. CP267 beta162 completed all7 stages/all20 Works; Judge valid,
outcome4/4/4/3, flow4/4/4/4. Case acceptance's sole gap is
`scenario_not_accepted_local` in immutable candidate d84816bc6f5eb12e2986bd50c0bf0eed53d67677b5f0ae8f85ee35779cb8c750.

PLAN revision2 assigned P3 to update SCN-002 and explicitly leave runnable_local
until new acceptance. P3 correctly did so. CODE final verification@3 claimed all
documents complete with empty document_updates, then aggregate retry completed.
No document-closing Work followed. Final SCN-002 still says runnable_local.
Final MERGE receipts RCP028/API and RCP032/browser passed; case checker correctly
retained the stale status rather than inferring acceptance. This is not missing
product capability or a broken checker parser.

## Root and analog audit

Runtime shared verificationMatrixInstruction omits the canon's explicit rule:
accepted document_updates and scenario contracts/statuses remain mandatory even
when generated matrix replaces manual duplicate proof. It instead emphasizes
not copying generated facts. CODE's generic prompt describes opt-in needs_checks
but shows passed as its example and does not surface pending document reasons
in the post-check continuation. A repaired check can therefore yield a green
summary without a fresh semantic document-closure assessment.

Audit applies to PLAN, PLAN-REVIEW, CODE, CODE-REVIEW and MERGE consumers of the
same shared instruction, including null-matrix legacy flows. Scenario status is
semantic: runtime must not auto-promote every scenario after any passing check.
MERGE/review are not authorized document writers. Existing needs_checks ->
needs_repair/document_updates -> fresh owned Work already solves the actual
write lifecycle; no new executor or schema is needed.

## Plan / ponytail readiness

1. Restore shared mandatory-document/status instruction for all consumers;
   distinguish generated facts from meaningful durable acceptance closure.
2. Surface original assigned document paths/reasons in CODE semantic verification
   and post-check continuation. Require inspect actual document after receipts;
   use needs_checks when proof is pending, needs_repair for assigned closure.
   Explicitly cover retry/repair, no-change with evidence, later/not-due gates,
   partial/failed proof and read-only reviews. Never infer acceptance from name.
3. Use needs_checks in initial JSON example; passed remains legal only with
   evidence-backed current documents. Preserve existing ownership/repair rules.
4. Focused prompt contracts + existing real lifecycle closure regression; scoped
   policy selection, type/lint and diff review. Publish exact corrected engine,
   pins/hooks, necessary installed qualification and new CP268 full Luna.
5. Preserve CP267; fresh checkpoint/home, same models/profile/capacity. Rebind
   existing paused monitor only after actual launch; no duplicate dispatch.

No hardcoded SCN-002 auto-PASS, generic document parser, new schema, or forced
extra gate round for every flow. These would confuse semantic acceptance with
technical check success or expand beyond the confirmed instruction-custody bug.
Independent read-only audit confirms cause and existing repair route; primary
reviewed source and immutable artifacts. This is behavioral prompt correction,
not a claim of mechanical semantic enforcement or guaranteed future score.
