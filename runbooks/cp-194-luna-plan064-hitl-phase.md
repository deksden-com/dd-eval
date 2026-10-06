# CP194 — HITL dispatch identity correction

2026-10-04. No scored CP194 EVAL has been started at publication of this runbook.
Superseded before launch by [the maintenance-rejection candidate](cp-194-luna-plan064-maintenance-rejection.md).
Supersedes the unlaunched [recovery preparation](cp-194-luna-plan064-recovery.md).
Retain old candidates, failed suites and Judge attempts; never rebind their results.

## Frozen inputs

- Engine beta.125 / `e0cb030696ca426bfad0bc8f04be968276d5d629`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/hitl-phase`.
- Tarball SHA-256 `0adbec5e37c9a1c6ae6aca99ee47282b8e2ff5978fd79387e935b45060ac87d7`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-hitl-phase/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Full-content snapshot SHA-256 `b73613e6fe6978ccee4daf727b2eaa02cc25b6321477b818193a02f43c8fb7a3`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Checkpoint `cp-194-task-priority-plan064-hitl-phase`; product and flow-pack pins unchanged.

## Root causes and fixes

The old complete suite passed shards 1–3. Shard 4 had eight HITL failures and
two registration timeouts. The shared HITL admission guard included mutable
`dispatch_phase` in a digest frozen before that phase was added. It rejected
the controller's own retained answer dispatch in every harness. The guard now
requires `external_dispatch_possible` separately and hashes only immutable
dispatch fields. Native Session, ownership, generation, pause, answer and
prompt integrity checks remain. Regression inputs reproduce the actual stored
shape and reject missing, prepared, completed and unknown phases.

Bounded registration timeouts under host load are distinct: failed attempts had
no child handler ingress phases and no registered owner; read-only status
reconciliation retained that evidence. An isolated full CLI import took about
one second. Do not label a timeout SQLite contention without writer evidence,
raise production budgets to hide it, or terminate unrelated host processes.
Run heavy suites serially and retain all failed attempts. Standard maintenance
requests remain 5 seconds within the existing 30-second uncertainty budget.

EVAL baseline admission also left its receipt `running` if owner admission,
command preparation or cleanup threw. EVAL commit `4fbe50211fc5e6b7844f53e897988273186208a3`
records a terminal failed receipt with the retained primary/cleanup error;
it still propagates the original failure and never grants baseline admission.
The existing negative registration/confirmation/admission tests and cancelled
pre-command test now assert the terminal receipt. All three offline tests passed.
Follow-up review found that redacting serialized JSON could consume closing
quotes after a connection URL. Redact string values through the JSON replacer
instead; the URL/API-key regression asserts valid terminal evidence and preserves
the original rejection code. The follow-up qualification must bind this committed
definition, not the intentionally stopped earlier partial attempt.

Typecheck, lint, strict package build and release contracts passed. The actual
installed PLAN/PLAN-REVIEW/CODE/MERGE matrix cycle passed in 31.43 seconds; normal
qualification accepted four owning Stage publications, receipt SHA-256
`b2874327412d63316cc85ef5972f7d16acca08ff596238a9226a35125122e717`.
Required complete suite logs use `/tmp/dd-flow-cp194-hitl-phase-verified-*`;
only their actual successful completion may authorize candidate acceptance.
New source cannot inherit old source's successful or failed suite results.
For this loaded local host, an optional standard Node compile cache is retained
outside source and immutable engine snapshots at `/tmp/dd-flow-cp194-node-cache.Tg7VgB`.
`NODE_COMPILE_CACHE` points there and `NODE_COMPILE_CACHE_PORTABLE=1` enables Node's
native portable-cache behavior. It caches compilation only, not admission, baseline
or test results. Warm imports measured 387–398 ms. Keep failed uncached logs;
cached full-suite logs use `/tmp/dd-flow-cp194-hitl-phase-cached-*`. All assertions
and production/test budgets remain unchanged; no coverage collection is enabled.

## Launch procedure

Use `/Users/deksden/.dd-eval/qualification/cp-194-luna`, its explicit engine-config,
and shared resource home `/Users/deksden/.dd-eval/qualification/cp-191-resources`.
Subject `gpt-6-luna/xhigh`, Interaction and Final Judge `gpt-6.1-sol/high`;
runtime `cx`, explicit `CODEX_HOME=/Users/deksden/.codex-cpa`.

Freeze and push the case/checkpoint/definition before the new live qualification.
Run ordinary `runner definition qualify` on this exact tuple; old partial or
deliberately interrupted qualification is not PASS. Run complete EVAL checks
with `DD_FLOW_SOURCE_ROOT` and the exact installed `DD_EVAL_TEST_FLOW_CLI`.
After all required Flow suites pass, perform normal candidate acceptance.
Then one light preflight and one scored `runner eval run` using the same exact
installed entrypoint. Verify the new execution's own baseline PASS, native
Subject Session and actual RUN SPECIFY, separately from observer acknowledgment.
No product edits, historical resume, manual runtime repair or implicit heartbeat.
