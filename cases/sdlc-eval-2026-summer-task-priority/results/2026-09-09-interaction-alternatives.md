# Interaction Judge: non-exhaustive alternatives

The native EVAL `EVAL-20260909191829-83ba2b6a` stopped at SPECIFY because
the Judge required the canonical answer to affirm the nullable-field assumption
of a proposed option. The canonical response instead specifies four exact
values, including `no_priority`, with defaults for new and existing tasks.

The shared Judge prompt now explicitly permits alternatives absent from the
Subject's options. An independent decision still requires answer evidence;
canonical response bytes and fail-closed verdict validation are unchanged.

Validation on 2026-09-09:

- Full suite: 202 passed, 0 failed, 8 opt-in tests skipped. One earlier full
  run hit the observer new-stop deadline; its isolated rerun and the subsequent
  full run passed without changing that test or its implementation.
- Native Sol/high, original question and responses: matched. Adding an
  independent audit-retention question: unmatched, with that question uncovered.
- Repeated through `tools/native-interaction-judge-smoke.mjs` with the full
  original `subject_context`: matched / unmatched respectively; both assertions
  passed and both Judge daemons completed their normal shutdown.

Full-context receipts are under
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-eval-hitl-smoke-TkpFCJ`:

- `interaction-judge/specify-a2d46496/result.json`
- `interaction-judge/specify-9df84e6d/result.json`
- `results.json`

These temporary receipts are local evidence, not portable fixtures. The smoke
tool accepts the original packet, Judge profile, retained runtime and project
roots as arguments and preserves its generated packet and receipts. Its input
must be fully covered and must not already answer the audit-retention question.

The stopped EVAL's all-role drain reports `physical_settled: true` and preserves
the RUN recovery snapshot. Recovery readiness is a separate condition; the
persistent scope-control worker maintains the fence until release/supersession.

This verifies the matching correction, not completion of the full E2E contour.
