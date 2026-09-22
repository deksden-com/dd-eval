# CP-141: ZCode E2E on published beta.99

Date: 2026-09-23. New scored E2E; do not resume CP-131.

## Inputs and isolation

- Source `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag `eval/cp-074-source-final`.
- Flow pack `53d4b76943900f122957c78cc0fefa2051bd7b1a`, Memory Bank 4.1.1, canon `678daa038287c948ada5b2d785a6dcc925c7b891`.
- Published `@deksden-com/dd-flow-cli@0.9.0-beta.99`, commit `a68a8ac243ceef7806094964106ebe38c5d384fd`, full-content engine SHA-256 `44d74f969e0d0445cef2b82c353ee255f5ee60a18ce1d36ecacb9ab1b2dae57f`.
- Qualified ZCode 0.16.9 and `zcode-acp` 0.46.7 overlay commit `f4d47b517073f9bdb8d4eba3d0d59ce66c6a2833`, contract `dd-zcode-harness@2`; subject `GLM-5.3-Flash` max.
- Home `/Users/deksden/.dd-eval/qualification/cp-141-zcode` contains a fresh published engine install, portable agent profiles, and a copy of the qualified bridge code. No prior runs, conformance receipts, runtime database, or provider sessions were copied. Resource state belongs only to this home.

CP-131 `EVAL-20260922071817-08e57c49` completed with `merge_target_dirty` after `code-review`; its provider startup and lifecycle were not the terminal cause. This is historical evidence, not a run to resume. The new EVAL must be monitored independently, including the integration workspace before MERGE.

## Admission and launch

Use `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json` with explicit `DD_EVAL_HOME`, `DD_FLOW_BIN`, `DD_FLOW_CONFIG_HOME`, and `DD_FLOW_RESOURCE_HOME` under CP-141. Run standard `runner eval preflight` after committing the checkpoint/case. It must verify the installed engine checksum, ZCode and Judge doctors, and prepared RUN with zero provider Sessions; baseline is `not_run` until scored execution. Start exactly one `runner eval run` only after PASS.

Monitor per [E2E monitoring](e2e-monitoring.md): use actual RUN timeline/controller stage and stage/attempt/cycle Work, native ZCode turns, direct-child lifecycle, process/lease liveness, HITL consistency, and primary error. A `settled_by_root` child is not by itself successful Work. At runtime failure, investigate read-only; do not resume, retry, manually repair, or edit code automatically.

## Receipts

Pending preflight and scored launch.
