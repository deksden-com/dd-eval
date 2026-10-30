# Verification matrix

RUN: RUN-001-tasks; stage: merge / try-001; role: output; completeness: final.

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

- PRT-001-task-priority/CHK-MERGE: passed
- PRT-001-task-priority/CHK-NEW: passed

## Sources

- accepted_intake: run:07-merge/verification/sources/e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd/accepted-input.md (e4a6938b5896af4c7a44ed499875e6b630c1249dd35d3274c4b6bb0eb019c0bd)
- check_profile_baseline: run:07-merge/check-profile-baseline.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- check_profile_source: run:07-merge/check-profile-source.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- check_profile_target: run:07-merge/check-profile-target.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- code_work_batch: run:07-merge/verification/sources/75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3/code-work-batch.json (75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3)
- code_work_batch_current: run:03-plan/code-work-batch.json (75713ad51c2dbd2001a352d72c3a9878ec6340a8ef92fae23493fd02476d04a3)
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-007-merge/checks/RCP-006/completion.json (ba13a27e7238a165a01ec7bb20c10743fbf6a47e5f1b7f6d803f12ee20fdf603)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-007-merge/checks/RCP-005/completion.json (5cbb23c47b137b9cbb27de8c4656c3fd0327a4e008fd31f0f2beed05bc3ed6f3)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-007-merge/checks/RCP-005/completion.json (5cbb23c47b137b9cbb27de8c4656c3fd0327a4e008fd31f0f2beed05bc3ed6f3)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-007-merge/checks/RCP-005/completion.json (5cbb23c47b137b9cbb27de8c4656c3fd0327a4e008fd31f0f2beed05bc3ed6f3)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (0694a546845cf8f7eab7e41c1c11a3fb8986f63f57fa44bc0c1b2f4a978632ff)
- merge_gate: run:07-merge/merge-gate.json (2821adc4d0e7f5d477ac01c8f5834673f933634a32e380a40a238e6b3bde861d)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a/plan.json (333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (47273e833a9549ce082e21867365a9d5d08334760c3490880446f460891a0071)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-007-merge/checks/RCP-006/receipt.json (114d4626dec84dd4fe38ebd49f62b7f808db527157f601db74a325627aafa153)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-007-merge/checks/RCP-005/receipt.json (2ba1c9fbdf082110e38cb211c1aa74b0abb6011df0a785e71f8af12ede77a83b)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-007-merge/checks/RCP-005/receipt.json (2ba1c9fbdf082110e38cb211c1aa74b0abb6011df0a785e71f8af12ede77a83b)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-007-merge/checks/RCP-005/receipt.json (2ba1c9fbdf082110e38cb211c1aa74b0abb6011df0a785e71f8af12ede77a83b)
- semantic_assessment: run:07-merge/works/WRK-007-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
