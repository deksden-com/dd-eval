# EVAL code structure

`lib/runner.mjs` is the existing orchestration and compatibility facade. Extract
cohesive responsibilities by subsystem, preserve its published exports, and
avoid moving code simply to meet a line-count target. The first structured
subsystem is `lib/evidence/`: it owns retained journal resolution, model
conformance projection, candidate and stage attribution, and report/Judge-evidence projection. Its exported
functions document their contracts with JSDoc; they do not issue model calls.

## Boundaries for subsequent extractions

The following is an ownership map, not a promise that every existing file is
already in a directory. Move cohesive groups incrementally with their callers,
tests and verification-key ownership. Keep generic helpers shared until they
have a clear owner; do not introduce empty directories or blanket re-exports.

| Subsystem | Current related modules | Responsibility |
| --- | --- | --- |
| Evidence and reporting | `evidence/`, `model-observations`, `observation-summary`, `failure-diagnostic` | Resolve retained evidence and project it into attribution, Judge input and reports; candidate freezing remains an effectful boundary. |
| Execution and control | `execution/`, `execution-contract`, `runner-events`, `runner-lock`, `operation-context` | Bind the selected execution and coordinate durable state and admission. |
| Recovery and cleanup | `recovery/`, `snapshot-tree`, `recovery-safety`, `eval-retirement`, `eval-resume-worker`, `runner-health`, `eval-worker-status` | Select retained recovery sources, verify snapshots and observe/reconcile owned runtime resources. |
| Cases and qualification | `case-acceptance`, `canonical-qualification`, `definition-identity`, `task-input`, `flow-boundaries`, `verification-matrix-*` | Bind case inputs, frozen definitions, qualification and acceptance. |
| Harnesses and capacity | `driver-bindings`, `driver-recovery`, `capacity-policy`, `native-children`, `model-progress` | Adapt harness contracts and observe their execution; do not own EVAL verdicts. |
| HITL and Judge | `hitl/`, `hitl-*`, `judge-*`, `final-judge-contract`, `semantic-decisions` | Build and verify interaction and assessment contracts. |

On extraction, separate pure projection from I/O and ownership checks where the
existing contract permits it. Document exported functions with JSDoc describing
inputs, outcomes and important safety guarantees. Use a barrel only for a real,
stable subsystem interface; internal imports should avoid barrels that create
cycles. Preserve `runner.mjs` compatibility, update any direct consumers and
verification source closures, and test affected behavior before committing.
Historical runbooks and archived specifications remain historical references,
not a reason to maintain duplicate implementations.
