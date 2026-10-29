# Verification matrix

RUN: RUN-001-tasks; stage: plan-review / try-001; role: output; completeness: declared.

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

- accepted_intake: run:04-plan-review/verification/sources/e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd/accepted-input.md (e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd)
- code_work_batch: run:04-plan-review/verification/sources/75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3/code-work-batch.json (75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3)
- plan:PRT-001-task-priority: run:04-plan-review/verification/sources/333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a/plan.json (333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (ed4f5d3e55f68e4c0d106d2711335ce62f2c480faf5adfb5351216caad9e699c)
- semantic_assessment: run:04-plan-review/decision.json (492846573f426109bdb030918167f4435992308fed97b2aa06021c338d83d321)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
