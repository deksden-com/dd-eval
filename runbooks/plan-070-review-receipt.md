# Plan 070 post-implementation review

## Scope and outcome

Review of the opt-in JEV → compact Interaction Judge implementation merged in
PR 55 (`ee9dedf13ddc2049cdebe2a8174381b1c22db7c6`). Two independent audits covered
transport/ownership and replay/reporting; the primary reviewer verified their
findings and audited qualification/caching. Fixes are at shared boundaries, not
per Subject harness. No new dependency, product change, paid model call, new EVAL
or modification of a running/historical EVAL was made.

## Substantial defects and repairs

1. **First-use qualification failed before HTTP.** Hold-out/observation locks
   were created inside nonexistent directories. Create the owned directories
   before acquiring existing locks. A fresh-home mock qualification now traverses
   calibration, frozen threshold and held-out assessment, not just pure helpers.
2. **An operator stop could leave progressing HTTP alive.** Before/after
   admission fenced result publication but did not interrupt a response body
   that kept producing bytes. Pass cancellation through both lock waits and
   fetch; poll the existing execution/operator admission read-only while HTTP
   is pending. Reads are not model progress or new dispatch receipts. Tests
   cover cancel, stop and pause, without native fallback or late routing.
3. **Held-out independence trusted mutable case IDs.** Renaming/relabeling a
   used case could claim a new hold-out; distinct IDs could repeat one actual
   input. Bind consumption to the semantic wire input and reject duplicates
   across calibration/held-out before HTTP and when validating a certificate.
   Changing a classifier cannot reuse consumed held-out inputs.
4. **HTTP reuse depended on native Judge task identity.** An unchanged JEV
   request could be paid again after a Judge change. Cache three observations by
   classifier fingerprint and exact wire request; freeze the first packet and
   verify later requests against it. Native Judge qualification remains separate.
5. **A wrong negative status was hidden by review-required.** Semantic
   adjudication is required only after status/IDs match. An actual mismatch now
   fails as a mismatch instead of continuing paid qualification cases.
6. **Replay/status/reporting lost coverage evidence.** Native reconstruction
   invented a fallback reason; Markdown and active status omitted source,
   unresolved questions and HTTP telemetry. Restore the filter from its bound
   native intent; carry it through retained proof/resolution; project one neutral
   summary into JSON, Markdown and status. Active status reads verified anchored
   HITL evidence. Unknown usage remains null; classifier usage is never added to
   Subject usage. Legacy report@2 retains its contract.
7. **Reattached unresolved HITL could remain awaiting_provider.** Initial launch
   treated the verdict as conclusive, but reattach required a terminal RUN
   controller status, absent on classifier verdict errors. Recognize explicit
   conclusive HITL errors, preserve the exchange and use the existing selected
   execution stop/cleanup path on reattach/recover. Unknown observer errors are
   not converted into conclusive failures.

## Verification

The review regressions use synthetic responses and isolated temporary runtimes;
they do not contact a model. Full paired-suite results are recorded below after
completion. Reproduction uses the same environment as the
[implementation receipt](plan-070-implementation-receipt.md).

## Acceptance boundary

Implementation review is not empirical promotion. The existing 41 native
status/response-ID matches do not certify completeness of the 20 negative
answers. Bound semantic adjudication remains pending, followed by JEV
calibration, independent held-out acceptance and explicit cascade promotion.
No accepted cascade policy or measured E2E speedup is claimed. A scored smoke
requires separate launch authorization. The candidate remains opt-in/shadow.
