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
- completion:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-002/completion.json (9b16e85991fd825219cd2b742052324ab57e1336eb297689cd075b11d6c3e693)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-002/completion.json (9b16e85991fd825219cd2b742052324ab57e1336eb297689cd075b11d6c3e693)
- completion:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-002/completion.json (9b16e85991fd825219cd2b742052324ab57e1336eb297689cd075b11d6c3e693)
- plan:PRT-001-task-priority: run:05-code/verification/sources/333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a/plan.json (333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (ff2b92ef1079af01663886ed36a41453f69c205964f6c4151fc27c995b4272e8)
- receipt:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-002/receipt.json (658aef55859554ce4eea20387c875cdf8440716597b42a32826c7ee5a06ee962)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-002/receipt.json (658aef55859554ce4eea20387c875cdf8440716597b42a32826c7ee5a06ee962)
- receipt:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-002/receipt.json (658aef55859554ce4eea20387c875cdf8440716597b42a32826c7ee5a06ee962)
- semantic_assessment: run:05-code/code-verification.json (f06a8edc39c7a72e8a2e779f267c306d5da53a18bd3c23c16d8bc90281788c1a)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
