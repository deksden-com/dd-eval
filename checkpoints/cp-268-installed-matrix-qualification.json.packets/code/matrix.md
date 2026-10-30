# Verification matrix

RUN: RUN-001-tasks; stage: code / try-001; role: output; completeness: execution.

This generated view is not semantic acceptance. A retained passed check proves only its declared contour and proof limits.

## Requirements

| Protocol | Requirement | Statement | PLAN items / checks |
| --- | --- | --- | --- |
| PRT-001-task-priority | R-001 | Priority field. | P1: CHK-NEW, CHK-P1-TEST |

## Acceptance criteria

| Protocol | Criterion | Gate | Checks / native results | Proof limits |
| --- | --- | --- | --- | --- |
| PRT-001-task-priority | AC-001 | work | PRT-001-task-priority/CHK-P1-TEST: passed; PRT-001-task-priority/CHK-READY: passed | ["No production claim."] |

## Policy checks


## Sources

- accepted_intake: run:05-code/verification/sources/e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd/accepted-input.md (e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd)
- code_work_batch: run:05-code/verification/sources/75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3/code-work-batch.json (75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3)
- completion:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-004/completion.json (d50faa49eb23651a4c649ba12cc3586d37556c8d37eb52e6171b0623e2813659)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-004/completion.json (d50faa49eb23651a4c649ba12cc3586d37556c8d37eb52e6171b0623e2813659)
- completion:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-004/completion.json (d50faa49eb23651a4c649ba12cc3586d37556c8d37eb52e6171b0623e2813659)
- plan:PRT-001-task-priority: run:05-code/verification/sources/333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a/plan.json (333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (47273e833a9549ce082e21867365a9d5d08334760c3490880446f460891a0071)
- receipt:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-004/receipt.json (66afac8fc9cdb7d2df821889b4ed2190436d9036db8f0a582a41366f698a5cb2)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-004/receipt.json (66afac8fc9cdb7d2df821889b4ed2190436d9036db8f0a582a41366f698a5cb2)
- receipt:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-004/receipt.json (66afac8fc9cdb7d2df821889b4ed2190436d9036db8f0a582a41366f698a5cb2)
- semantic_assessment: run:05-code/code-verification.json (f06a8edc39c7a72e8a2e779f267c306d5da53a18bd3c23c16d8bc90281788c1a)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
