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

- plan:PRT-001-task-priority: run:04-plan-review/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (74a7daa1c5e6ed7f1332edfd848e28d93797141c3a0f1df62980109c095d8776)
- semantic_assessment: run:04-plan-review/decision.json (ed26b3a5e5860a8f596055d743f4d5497c4bc54b5167115f8c40aac4bb8e7c65)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
