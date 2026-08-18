# REV-008 / canonical chain closure

The canonical Subject chain stopped at the declared E2E boundary
`plan_review_accepted`; CODE was not started.

| Stage | Result | Subject duration |
| --- | --- | --- |
| SPECIFY | specified after one canonical HITL answer | 1,727,161 ms |
| PROTOCOLIZE | one executable protocol, `PRT-007-task-priority` | 87,794 ms |
| PLAN | four-Work CODE graph, one six-group review wave planned | 686,242 ms |
| PLAN-REVIEW | accepted; PLAN revision 2 | 1,333,528 ms |

The moving canonical Subject session is
`01a015f8-fce8-71a1-8984-1efdb0d79875`. Its four frozen entry-session IDs are
recorded in the accepted checkpoint records. PLAN-REVIEW created six fresh,
isolated reviewer sessions in one concurrent wave; all six review Works were
completed and linked to the RUN before the parent Work closed.

The final review accepted 29 plan corrections. The final `PLAN-001` keeps the
same four dependency-ordered CODE Works while making the archived
priority-only PATCH boundary, defaults, ordering, fixtures, cleanup and
verification evidence explicit. RUN status is `running` with
`verdict=plan_review_accepted` and its only next legal stage is CODE.

The canonical chain is now ready for independent expectation/oracle authoring
and scored-eval readiness work. It is deliberately not yet
`scored_eval_ready`: stage and E2E expectations are still draft.
