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

- check_profile_baseline: run:07-merge/check-profile-baseline.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- check_profile_source: run:07-merge/check-profile-source.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- check_profile_target: run:07-merge/check-profile-target.json (1c0ff3551f961e377f66732b45807b9b85dee91a7c596fc9e30eab3744dfac35)
- code_work_batch: run:07-merge/verification/sources/77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da/code-work-batch.json (77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da)
- code_work_batch_current: run:03-plan/code-work-batch.json (77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da)
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (92757296d45dbeaba7da0dc1cafee3c2e3595b0edc19527a4b579519ba22454d)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (e82329779b00a191b9c3b80fff959ed2f655ac2d4d2c136cea816dad3f28497b)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (e82329779b00a191b9c3b80fff959ed2f655ac2d4d2c136cea816dad3f28497b)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (e82329779b00a191b9c3b80fff959ed2f655ac2d4d2c136cea816dad3f28497b)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (d2687f74c7fbda80ca1f54696467aa3cecf11e4561562d5a2278ba514a8aeda0)
- merge_gate: run:07-merge/merge-gate.json (9369455fa2a4ef6a1a933426d68f60eea7b3d764e33cb9799db1e192a483ca3f)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (db14abe8af0c97620e2fc017ac1a52dbaa9fe7cc23163bbbe99d557e8291c320)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (d4c3bbdc63db9af055f19457e225816f56c755c00251d1ac626ebdd61c8b6e3d)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (8193abec679bf7b956aeaac09dbf28d34602e8a27090740a5a608396cebf7df1)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (8193abec679bf7b956aeaac09dbf28d34602e8a27090740a5a608396cebf7df1)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (8193abec679bf7b956aeaac09dbf28d34602e8a27090740a5a608396cebf7df1)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
