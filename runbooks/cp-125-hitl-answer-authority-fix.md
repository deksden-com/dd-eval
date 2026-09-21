# CP-125: retained HITL answer and conclusive delivery

Date: 2026-09-21. Implementation: published in `0.9.0-beta.88`; live qualification pending.

## Cause

EVAL-20260920231626-90f5286d accepted an answer, then asked Luna to copy its
controller-owned absolute filename. Luna changed the directory. The native hook
recorded the call, but its public fingerprint no longer matched the issued command.
CLI returned `invocation_receipt_missing` before registering its diagnostic observer.
The controller treated completion of the native Turn as successful answer delivery,
marked the answer completed, and waited on the same pause. Eval had already answered
that pause. Fresh process leases hid the absence of productive progress.

## Implemented contract

- Managed `stage resume` hides `--answer-file`. CLI restores the exact accepted file
  from the retained assignment before validating/reading input. Manual CLI keeps its
  explicit file interface. Explicit conflicting managed values receive a no-effect
  argument rejection and the existing corrected-command retry.
- Controller acceptance can replace an unobserved placeholder assignment atomically.
  Ordinary packet rendering cannot revert the accepted answer. Observed/executing or
  failed assignments cannot be silently rebound. A new pause can issue a new assignment
  after successful settlement, even when answer bytes/path are identical.
- Native observation and assignment matching are separate facts. Early CLI refusals
  correlate exact argv with a unique observed call in the current daemon, solely for
  diagnostics. No latest-call selection, fuzzy matching or new execution authority.
  Existing hook-outcome storage and controller notifications retain the original error.
- An answer operation completes only after its specific pause is no longer active.
  An unchanged pause after a settled Turn fails with `controller_answer_not_applied`.
  A subsequent different pause is allowed. Reattached legacy completed-answer/same-pause
  states also fail rather than waiting forever. Existing failure handling drains/fences
  the controller; eval observes that terminal failure without automatic resend.
- CLI observed-assignment lookup is constrained by the current daemon when available.
- Monitoring checks semantic pause/answer/Turn consistency independently of leases.

## Adjacent paths audited

Stage entry already fences unchanged continuation (`stage_entry_nonprogressing`).
Work-graph continuation already uses `fanout_stage_nonprogressing`; external Work
return requires a terminal Work receipt. Those guards are reused, not replaced with
another timeout/retry framework. Shared lifecycle changes cover all harnesses.

## Regression coverage

`test/lifecycle-invocations.test.ts`: hidden answer authority, placeholder replacement,
immutable in-flight assignment, explicit wrong path rejection, successive pause issuance,
exact native diagnostic correlation, daemon isolation and ambiguous-call refusal.

`test/run-controller-stages.test.ts`: native successful answer through two real stages,
ignored answer Turn, unassigned native command with durable original CLI failure.
Admission/controller suites validate neighboring replay, retry and ownership behavior.

Local verification completed: build, typecheck, lint and diff checks passed;
219 lifecycle/admission tests, 41 controller/state tests and 11 controller-stage
tests passed (271 distinct tests). The capture-fence test initially overlapped a
rebuild of its shared `dist` and failed module loading; its isolated rerun passed.
Do not rebuild shared artifacts while subprocess integration tests are running.
Successful/ignored HITL paths were also rerun after the final single-query cleanup.

The existing cp125 run is not resumed or modified by this change. A new published
engine and isolated qualification are required before claiming live Luna success.
