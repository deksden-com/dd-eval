# Beta 10 native-fork SPECIFY run

- Checkpoint: `cp-002-vnext-specify-beta-9`
- Engine: `dd-flow-cli@0.8.0-beta.8`, bound snapshot
  `62396f02e8f419a5642fc05429ac257b0708a117a3e6f517a878def09b47f40c`
- Flow pack: `mb-sdlc-vnext-specify@1`
- Primed-discussion parent: `01a0020d-ef51-7a60-a572-ff8c1db36592`
- Forked worker: `01a0021a-00fe-7c73-9cf7-c0d6680f85b4`
- RUN / Work: `RUN-002-task-priorities` / `WORK-8e2312e0-3faf-449e-b47c-2f9074550cfe`

## Verdict

**Invalid for Luna/xhigh model comparison; useful engine diagnostic.** The
Desktop UI showed that the fork was switched to `gpt-5.6-sol/high`. Although
the worker used the intended primed-discussion context, started and finished a
single SPECIFY Work, and produced a validated `specified` result, it is not a
Luna/xhigh measurement. The stage report SHA-256 matches the semantic result
bytes; the materialized repository remained clean and no new protocol or
later-stage artifact was created.

| Criterion | Result | Evidence |
| --- | --- | --- |
| Intent fidelity | pass | Low/medium/high, create/edit/list and medium legacy default are explicit. |
| Gaps and defaults | pass | Light use-case, CRUD and example analyses are selected; lifecycle, event and security methods are correctly inapplicable. No unresolved material choice remains. |
| Grounding | pass | Uses the task-core system spec, `SCN-002` and the existing Linear-UI protocol; preserves task permissions and isolation. |
| Portable contract | pass | Requirements, scope, seven acceptance criteria, end-to-end scenario, assumptions and handoff are complete. |
| Verification | pass | Covers default/legacy behavior, create-high/edit-low round trip, invalid rejection, authorization/isolation and accessible responsive UI. |
| Boundary discipline | pass | Data/API/file/migration and implementation ordering decisions remain deferred to PROTOCOLIZE/PLAN. |
| Handoff and routing | pass | One vertical protocol with a compact cross-layer plan floor and concrete verification seeds is proportionate. |

## Observability and efficiency

The measured stage duration is 509,758 ms. Two `stage finish` submissions were
rejected before the accepted third submission. The first draft had several
full-schema shape mismatches; the second correction pass repaired them. This
is useful prompt-contract friction, not a semantic failure: the final result
is valid and internally consistent.

Usage is unavailable for an engine reason. The Codex JSONL contains the child
session metadata first and inherited parent metadata second; the adapter keeps
overwriting the observed session id and therefore reports
`session_mismatch` for all four snapshots. The trusted hook did bind the real
worker session correctly, so this is an adapter defect, not a worker failure.

## Evidence

- [Semantic result](/Users/deksden/.dd-flow/projects/PRJ-044-dd-eval-vnext-beta10-xhigh/runs/RUN-002-task-priorities/01-specify/specify-result.json)
- [Stage report](/Users/deksden/.dd-flow/projects/PRJ-044-dd-eval-vnext-beta10-xhigh/runs/RUN-002-task-priorities/01-specify/stage-report.md)
- [Run timeline](/Users/deksden/.dd-flow/projects/PRJ-044-dd-eval-vnext-beta10-xhigh/runs/RUN-002-task-priorities/timeline.jsonl)
- [Worker transcript](/Users/deksden/.codex/sessions/2026/08/14/rollout-2026-08-14T23-07-33-01a0021a-00fe-7c73-9cf7-c0d6680f85b4.jsonl)
