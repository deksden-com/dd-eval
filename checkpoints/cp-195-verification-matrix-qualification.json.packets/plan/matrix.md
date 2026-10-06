# Verification matrix

RUN: RUN-001-tasks; stage: plan / try-001; role: output; completeness: declared.

This generated view is not semantic acceptance. A retained passed check proves only its declared contour and proof limits.

## Requirements

| Protocol | Requirement | Statement | PLAN items / checks |
| --- | --- | --- | --- |
| PRT-001-task-priority | R-001 | Priority field. | P1: CHK-NEW, CHK-P1-TEST |

## Acceptance criteria

| Protocol | Criterion | Gate | Checks / native results | Proof limits |
| --- | --- | --- | --- | --- |
| PRT-001-task-priority | AC-001 | work | PRT-001-task-priority/CHK-P1-TEST: not_run; PRT-001-task-priority/CHK-READY: not_run | ["No production claim."] |

## Policy checks


## Sources

- code_work_batch: run:03-plan/verification/sources/87e04b2d0de72ebc62c60cc3fcf258903579dc55ea1f8925affe328a03b062d9/code-work-batch.json (87e04b2d0de72ebc62c60cc3fcf258903579dc55ea1f8925affe328a03b062d9)
- plan:PRT-001-task-priority: run:03-plan/verification/sources/54ab1c31ae295a032639f7764fffbf6f8ff2c7e96a87821a0c89d88bd3bb0387/plan.json (54ab1c31ae295a032639f7764fffbf6f8ff2c7e96a87821a0c89d88bd3bb0387)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (678b02896936786119d9a695e34c58a2f311e34a04657d9f17dab8f35880c0b3)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
