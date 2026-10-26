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
- code_work_batch: run:07-merge/verification/sources/77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da/code-work-batch.json (77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da)
- code_work_batch_current: run:03-plan/code-work-batch.json (77bae4b331373b07cdf71acd27acef07229923e245ce5f4534301d2f96f197da)
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (279a4607b104bebe88403d05bd7efac36a73d11ac81762761443d5add09b129e)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (655c717995ae75bbe163794bb4cbc3a4b23350e10d51f74e1e4e61dc6ea52ade)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (655c717995ae75bbe163794bb4cbc3a4b23350e10d51f74e1e4e61dc6ea52ade)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (655c717995ae75bbe163794bb4cbc3a4b23350e10d51f74e1e4e61dc6ea52ade)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (28dc23f66057be443d8d5316ec50d9d04db6517a79bbf572b4934de6961276c7)
- merge_gate: run:07-merge/merge-gate.json (2fb642ba3079d05d4eb05c4f2a5a74b5ac1a70d4662d702a4a83f2a2c976b3ce)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (ef28785c06622847c592a99b777e58009c0d0f49a9aafec2d8f776ffc28f19a3)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (2c53e9321dfb602375a2e3894e94f13c4af83fe7dbf1a8d8eccb574892d44ea1)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (d6a6f99e8db5173e849f0c955ae1c14c1e04c25c7acc35f8b43b6b20f2961400)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (d6a6f99e8db5173e849f0c955ae1c14c1e04c25c7acc35f8b43b6b20f2961400)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (d6a6f99e8db5173e849f0c955ae1c14c1e04c25c7acc35f8b43b6b20f2961400)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
