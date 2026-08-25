# REV-039 E2E engine-contract diagnostic

REV-039 is retained as debugging evidence, not as a model-quality result.

The RUN was immutably bound to `dd-flow` `0.8.0-beta.98`. Normal routed
`stage finish` calls therefore used that snapshot and rejected draft 2020-12
CODE contracts because its schema registry selected only the draft-07
validator. Calling services from a newer linked checkout made the stages appear
to finish, but bypassed the RUN-bound engine and invalidated the lifecycle
evidence. The router behaved correctly; the matched beta pair was incomplete.

The same run exposed three adjacent defects:

- independent CODE reviewers reused the same example finding id;
- a quoted RUN positional was stored with its shell quotes, excluding the root
  Subject Session from RUN statistics;
- resumed stages retained resolved pause/blocker objects in their active
  projection.

The correcting pair is flow pack
`eval-mb-3.2.0-vnext-plan-review-beta.100` with engine
`eval-engine-0.8.0-beta.99`, recorded by input checkpoint
`cp-022-full-code-review-e2e-beta-100`. Confirmation must use a fresh RUN and
canonical revision; REV-039 must not be upgraded or rescored.
