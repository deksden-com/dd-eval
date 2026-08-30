---
file: 'beta/vnext-code-review-beta.1/specs/002-verification-receipts-and-two-phase-closure.md'
description: 'Stable check declarations, immutable evidence receipts and one bounded repair phase.'
status: 'DRAFT'
---

# 002 — Verification receipts and two-phase closure

Replace duplicated prose evidence with one traceable chain:

```text
acceptance criterion -> CHK declaration -> due-gate receipt -> stage report
```

PLAN owns the declaration and acceptance link. The CLI owns execution,
workspace fingerprinting, exact artifact hashing and deterministic projection.
The agent owns only semantic evidence and the compact CODE conclusion.

CODE-REVIEW classification is immutable after the first Finish. If accepted
fixes exist, the CLI creates one repair Work from the union of original CODE
planned coordination areas and returns its exact start command plus the same Finish command.
The second Finish accepts only the same decision, completed repair and passing
full aggregate CODE gate. It does not launch another reviewer wave.

Do not add an evidence table, a second matrix artifact, glob collection,
handwritten receipts, or a compatibility fallback for the replaced beta
schemas.
