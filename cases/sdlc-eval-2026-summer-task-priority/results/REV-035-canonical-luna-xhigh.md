# REV-035 · canonical Luna xhigh flow run

## Scope and outcome

This is the canonical Subject-chain run used to create the accepted stage
entries for the beta.93 pair. It is not a scored comparison or a Judge result.
The Subject used `gpt-5.6-luna` with `xhigh` reasoning and reached the
configured terminal state: `code_completed`.

| Stage | Active duration | Pause | Outcome |
| --- | ---: | ---: | --- |
| SPECIFY | 4m 32s | 33s | specified |
| PROTOCOLIZE | 1m 02s | — | one vertical protocol |
| PLAN | 10m 35s | 38s | planned after HITL-002 |
| PLAN-REVIEW | 15m 32s | — | accepted plan revision 2 |
| CODE | 30m 11s | — | code_completed |

CODE accepted both dependent Works. Its aggregate gate passed `pnpm quality`,
`pnpm docs:check`, `db:migrate`, and `db:check`; the SCN-002 browser evidence
reported 6/6.

## Observed defects and incidents

1. **Medium — reviewer launch guidance was incomplete.** The first six
   PLAN-REVIEW launches were rejected because the reviewers require fresh
   child sessions. The orchestrator recovered with the same six groups in one
   fresh-session wave and did not treat the rejected starts as review evidence.
   Improve the stage packet so the fresh-session requirement is explicit before
   the first launch.
2. **Medium — runtime usage is absent.** The `usage` table contains no records
   for this RUN, so token totals and per-session tool metrics cannot be scored.
   Do not infer numbers from wall-clock time; repair final usage collection and
   then rerun a scored attempt.
3. **Low — child session lifecycle is incomplete.** Completed reviewers and
   CODE workers remain `idle` in the runtime session table. Their Work records
   are completed, so functional flow completion is sound, but the session
   finalizer should record them as stopped and trigger usage ingestion.
4. **Low — PLAN needed a legitimate additional clarification.** The task asks
   for an archived-task priority change while the fixture models only archived
   projects. HITL-002 resolved this explicitly as “a task in an archived
   project”, without adding a new archive feature. This is candidate model
   behaviour, not a product failure.

## Known-good evidence

- The executable-check contract rejected an accidental raw browser command in
  PLAN-REVIEW; the plan was corrected by keeping browser behaviour in expected
  evidence and only allowlisted commands in `checks`.
- Review found and repaired meaningful plan gaps: stable ordering for
  priority-only updates, migration proof and database invariants.
- CODE respected the dependency graph, did not interrupt live workers, and ran
  the final gate only after both Works were accepted.
