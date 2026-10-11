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

- code_work_batch: run:05-code/verification/sources/77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da/code-work-batch.json (77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da)
- completion:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-002/completion.json (af3715d21eace70a4f3b8c4336e7d16699884cf0d81e783709c4397d69c9c392)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-002/completion.json (af3715d21eace70a4f3b8c4336e7d16699884cf0d81e783709c4397d69c9c392)
- completion:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-002/completion.json (af3715d21eace70a4f3b8c4336e7d16699884cf0d81e783709c4397d69c9c392)
- plan:PRT-001-task-priority: run:05-code/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (3cd0c19a68ca3e7c12947d0499b510e8eba3567925fa2eea93c52472db9183b4)
- receipt:PRT-001-task-priority/CHK-NEW: run:05-code/checks/RCP-002/receipt.json (239f80abd9ea71aeafdc4c46400dd115b293600edc16b6f88c550eaf9c004210)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:05-code/checks/RCP-002/receipt.json (239f80abd9ea71aeafdc4c46400dd115b293600edc16b6f88c550eaf9c004210)
- receipt:PRT-001-task-priority/CHK-READY: run:05-code/checks/RCP-002/receipt.json (239f80abd9ea71aeafdc4c46400dd115b293600edc16b6f88c550eaf9c004210)
- semantic_assessment: run:05-code/code-verification.json (f06a8edc39c7a72e8a2e779f267c306d5da53a18bd3c23c16d8bc90281788c1a)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
