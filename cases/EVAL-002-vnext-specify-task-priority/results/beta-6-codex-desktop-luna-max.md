# Beta.6 native-fork SPECIFY run

## Identity

- Baseline: `baselines/codex-desktop-gpt-5-6-luna-max-beta-6.json`
- Forked worker thread: `01a0014b-8130-7a70-9292-63333d3ba285`
- Worker turn: `01a0014b-8f3e-7bc3-8a93-325b3f3af65f`
- RUN: `RUN-001-task-priorities`
- Work: `WORK-2c13b14f-b317-4370-bb2e-8fd064966125`
- Flow pack / engine: `3.2.0-vnext-specify-beta.6` / `0.8.0-beta.5`

## Result

Passed. The fork received only “Ок, давай оформим протокол.” It followed the
primed `vnext/start.md` route, created raw intake, entered bootstrap
`stage start`, wrote a schema-valid SPECIFY result, then itself called the
exact `stage finish` command supplied in the returned prompt.

The RUN completed as `done` with verdict `specified` and next action
`start_protocolize`. No `PRT-*`, plan, code, review, or merge work was
created.

## Timing

| Segment | Wall time |
| --- | ---: |
| Priming baseline | 122.9 s |
| Product discussion baseline | 73.4 s |
| Forked SPECIFY turn | 137.2 s |
| RUN, from bootstrap to finish | 67.5 s |

## Observed issue

The semantic flow passed, but generic `run status` currently advertises
`stage-report.*` and `summary.md` artifact paths even though the vNext
SPECIFY run intentionally does not generate those files; it also reports
`stage_count: 0`. This is an observability projection defect, not a worker
failure. It should be fixed before treating vNext RUN reports as canonical.
