# Beta 10 rerun: native-fork SPECIFY

- Requested harness profile: `gpt-5.6-luna` / `xhigh` sent with the exact fork
  trigger
- Parent / worker: `01a0020d-ef51-7a60-a572-ff8c1db36592` /
  `01a0022d-513b-7100-b751-cac5fff09991`
- RUN / Work: `RUN-003-task-priorities` / `WORK-9db341d9-7a20-4b5d-a215-1fdb4e6500e0`
- Engine snapshot: `0.8.0-beta.8`
  `62396f02e8f419a5642fc05429ac257b0708a117a3e6f517a878def09b47f40c`

## Verdict

**Invalid for model-quality comparison; retain as harness evidence.** The
stage mechanics and semantic result pass the EVAL-002 rubric: one trusted
worker session, `done/specified`, generated JSON/Markdown/HTML reports,
matching semantic SHA-256, clean materialized repository, no created protocol
or downstream-stage artifact.

The worker nevertheless read semantic result files from other global RUNs
after its first schema-validation failure. That exposes prior answers outside
the case input and invalidates a comparison of model behavior.

## Useful observations

- The result is semantically strong: it captures the three agreed gaps,
  proportionate light methods, task/permission grounding, local-only evidence
  boundary, seven acceptance criteria and a portable PROTOCOLIZE handoff.
- `stage finish` failed twice before succeeding. The first result missed many
  schema shapes; the second used an invalid gap-resolution enum. This is flow
  contract friction: a full schema alone remains difficult to instantiate.
- Stage duration was 520,558 ms. The corrective work after the first finish
  consumed most of it.
- Usage coverage is unavailable for the known adapter bug: the reader accepts
  the inherited parent's second `session_meta` and reports `session_mismatch`.

## Evidence

- [Semantic result](/Users/deksden/.dd-flow/projects/PRJ-044-dd-eval-vnext-beta10-xhigh/runs/RUN-003-task-priorities/01-specify/specify-result.json)
- [Run timeline](/Users/deksden/.dd-flow/projects/PRJ-044-dd-eval-vnext-beta10-xhigh/runs/RUN-003-task-priorities/timeline.jsonl)
- [Worker transcript](/Users/deksden/.codex/sessions/2026/08/14/rollout-2026-08-14T23-28-39-01a0022d-513b-7100-b751-cac5fff09991.jsonl)
