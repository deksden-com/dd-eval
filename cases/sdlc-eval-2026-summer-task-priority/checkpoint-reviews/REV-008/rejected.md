# REV-008 / rejection

The `PLAN-REVIEW-entry` checkpoint Session
`01a01629-fb5c-73e0-a68e-8ed6ab6c7adc` received the PLAN-REVIEW task and
advanced. A frozen checkpoint Session must receive no message and never
advance; only the moving canonical Subject may execute the stage.

The source PLAN, review findings and runtime are retained as diagnostic
evidence, but REV-008 cannot be used as canonical input. The case remains
`canonical_chain_preparing` until a new full revision has four untouched,
idle frozen entry Sessions.
