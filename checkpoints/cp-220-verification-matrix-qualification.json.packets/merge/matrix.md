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
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (8e6a1b4de9a339be3bcc291468885f349af6a12c69af1f6f6587414545df9e9b)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (8e6a1b4de9a339be3bcc291468885f349af6a12c69af1f6f6587414545df9e9b)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (8e6a1b4de9a339be3bcc291468885f349af6a12c69af1f6f6587414545df9e9b)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (8e6a1b4de9a339be3bcc291468885f349af6a12c69af1f6f6587414545df9e9b)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (11f86109a4a47ec0a726854eb3e9c476d133b13a3387743d542a152befc43474)
- merge_gate: run:07-merge/merge-gate.json (1f9c152e9ca521dd920125ec23a813b214750d64fd461650483e98ce74ac2761)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7/plan.json (aa9dc1e2c172705a8f6ca03141a24a3822ab6de0da4d48fa40e44498befacce7)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (333fc2b5a6393c1e8a0ef512cf89324dcc808fbf09bc5a4eda24b1851a497f5b)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (2b1ba4f28bbb41c444cc7d8806c346a93d048e573b4bfa3600bca27392ff4f35)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (9538bcbd63a6e25b447cebb4d51f36d80f0d96ff521274ce040784c1ebda0c88)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (9538bcbd63a6e25b447cebb4d51f36d80f0d96ff521274ce040784c1ebda0c88)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (9538bcbd63a6e25b447cebb4d51f36d80f0d96ff521274ce040784c1ebda0c88)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
