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

- accepted_intake: run:03-plan/verification/sources/e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd/accepted-input.md (e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd)
- code_work_batch: run:03-plan/verification/sources/3019e752b84e96de74ce68867de3659ce13faa89881b619c9543bd90a70ad856/code-work-batch.json (3019e752b84e96de74ce68867de3659ce13faa89881b619c9543bd90a70ad856)
- plan:PRT-001-task-priority: run:03-plan/verification/sources/064d4f17236a65babc312dda75990a1e3beed1902a0578e77df22d891023ebbd/plan.json (064d4f17236a65babc312dda75990a1e3beed1902a0578e77df22d891023ebbd)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (ff2b92ef1079af01663886ed36a41453f69c205964f6c4151fc27c995b4272e8)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
