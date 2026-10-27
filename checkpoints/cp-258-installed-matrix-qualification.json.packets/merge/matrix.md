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
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (d142907067125874d3acca812fca940b57b0b855a4324e3013fb32f46eacae6c)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dcbbb9b081e9dcb3543e3f1cb7af96e6e07b5aa4e9f9b18b4053586272ecfaee)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dcbbb9b081e9dcb3543e3f1cb7af96e6e07b5aa4e9f9b18b4053586272ecfaee)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dcbbb9b081e9dcb3543e3f1cb7af96e6e07b5aa4e9f9b18b4053586272ecfaee)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (53272a69548777c6ab72088ac04242aecb55fc632a13a9fb8524fad656b64377)
- merge_gate: run:07-merge/merge-gate.json (fba690d682f6e2972ce9066ee3bbfd26caf4c6edaf88d72f444b4900a5454e84)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (f4c59a7d340cfa2d19413ef0f315970cd324c4b84995e671e070fdf93d60159b)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (baeced306557ec587a10ae67e3a18c7f1cc1fcf107ce38c417d4aa9b1305b676)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (f1bea9536a456a08ffb1557717d2e67c734a398e31b3b4002f3eab296e4c5f07)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (f1bea9536a456a08ffb1557717d2e67c734a398e31b3b4002f3eab296e4c5f07)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (f1bea9536a456a08ffb1557717d2e67c734a398e31b3b4002f3eab296e4c5f07)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
