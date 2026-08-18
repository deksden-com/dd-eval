# REV-009 / canonical chain closure

The canonical Subject chain stopped at its declared E2E boundary
`plan_review_accepted`; CODE was not started.

| Stage | Result | Subject duration |
| --- | --- | --- |
| SPECIFY | specified after one canonical HITL answer | 362,673 ms |
| PROTOCOLIZE | one executable protocol, `PRT-007-task-priority` | 62,128 ms |
| PLAN | four-Work CODE graph, one six-group review wave planned | 579,456 ms |
| PLAN-REVIEW | accepted; PLAN revision 2 | 953,499 ms |

The moving canonical Subject is
`01a01648-4729-7392-ab7e-5480063e7d43`. The four frozen entry sessions are
`01a01648-84bf-7ce0-9235-49cf7ba8499a`,
`01a0164f-b7ce-7d90-9bd6-c3847c6ec63b`,
`01a01651-ec9e-7291-8bbf-01bfce5be599` and
`01a0165d-f4fb-76b3-8a89-6407dbabb379`. Each remains idle and was never sent a
stage message.

PLAN-REVIEW launched six fresh isolated reviewer sessions in one concurrent
wave. All six review Works completed and are linked to the RUN. Its 20 findings
were accepted as a single PLAN revision-2 correction; policy prohibits an
automatic second review cycle.

RUN now reports `plan_review_accepted` and only `start_code` is legal next.
REV-009 is canonical input ready for independent expectation/oracle authoring;
it is deliberately not `scored_eval_ready` while those references remain draft.
