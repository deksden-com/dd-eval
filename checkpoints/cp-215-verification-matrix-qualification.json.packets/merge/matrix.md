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
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (59785c3065fa6e2a5e8dbb37264a339037ca117872c3c258fb97bb7a57b86dff)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (59785c3065fa6e2a5e8dbb37264a339037ca117872c3c258fb97bb7a57b86dff)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (59785c3065fa6e2a5e8dbb37264a339037ca117872c3c258fb97bb7a57b86dff)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (59785c3065fa6e2a5e8dbb37264a339037ca117872c3c258fb97bb7a57b86dff)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (afda32dc609c09a27051006434c4776ed453f66bc4340eccfe594b030c4f4f55)
- merge_gate: run:07-merge/merge-gate.json (7b0110ba708efff8a5fca845e0a93b90a96530382c94f225483727cf9cadf7a2)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (3cd0c19a68ca3e7c12947d0499b510e8eba3567925fa2eea93c52472db9183b4)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (807e0ed696fd9eec43a56db5da0783ec5fe8680c3c6324b01c23e9826832c883)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (c8152e952f31ffc73dba92cf526878ea5c2937520ea73fdb5d5c46b756e72d19)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (c8152e952f31ffc73dba92cf526878ea5c2937520ea73fdb5d5c46b756e72d19)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (c8152e952f31ffc73dba92cf526878ea5c2937520ea73fdb5d5c46b756e72d19)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
