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
- completion:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/completion.json (f28548ef70519d7500faa62ef358ad3ad030fbfa5125fbcec1f1e18bc73eefcc)
- completion:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dc8e54335874afdcd3701e3bbf620e94f43d220a9ba2d1ea047550d8cc9145a5)
- completion:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dc8e54335874afdcd3701e3bbf620e94f43d220a9ba2d1ea047550d8cc9145a5)
- completion:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/completion.json (dc8e54335874afdcd3701e3bbf620e94f43d220a9ba2d1ea047550d8cc9145a5)
- merge_acceptance: run:07-merge/merge-gate-acceptance.json (c9ff8fee3607688bf43a5c04f57482ee3557b0d496cf3b213a2437b49541c8a8)
- merge_gate: run:07-merge/merge-gate.json (2242aaaae23ca10d79fa72a317237cb9b1240abfe9ff1cc22ed2d9ae48b88ee8)
- plan:PRT-001-task-priority: run:07-merge/verification/sources/333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a/plan.json (333b93b445dd2126210975950949952d0ad97bb845371dadf6a72139f7e3158a)
- protocolize: run:02-protocolize/protocolize-result.json (e76aee02e027ca6ca16de8c5b1533e91b469595098e423668cded932ded55ead)
- protocolize_report: run:02-protocolize/stage-report.json (ff2b92ef1079af01663886ed36a41453f69c205964f6c4151fc27c995b4272e8)
- receipt:PRT-001-task-priority/CHK-MERGE: run:07-merge/works/WRK-006-merge/checks/RCP-004/receipt.json (3793537608bb7f03db3a8a5f88de77b8fd4af3ee67c1e22d25406f9469ab49d8)
- receipt:PRT-001-task-priority/CHK-NEW: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (263db9ab59ed25f626b92c413b11f9e1df12cb140d805ae5a8ffe09e0ebf838a)
- receipt:PRT-001-task-priority/CHK-P1-TEST: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (263db9ab59ed25f626b92c413b11f9e1df12cb140d805ae5a8ffe09e0ebf838a)
- receipt:PRT-001-task-priority/CHK-READY: run:07-merge/works/WRK-006-merge/checks/RCP-003/receipt.json (263db9ab59ed25f626b92c413b11f9e1df12cb140d805ae5a8ffe09e0ebf838a)
- semantic_assessment: run:07-merge/works/WRK-006-merge/result.json (ff9c50911b3e9db3ab9b10bd03f9c5066362d5b0e23b25a9e039e9325d181f91)
- specify: run:01-specify/specify.json (00ae7c018b7cb7cb7e74c3ddf4c0da94e5fa03bea10248cb34caee01bc01cfaa)
