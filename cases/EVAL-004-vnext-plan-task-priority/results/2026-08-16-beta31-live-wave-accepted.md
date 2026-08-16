---
file: 'cases/EVAL-004-vnext-plan-task-priority/results/2026-08-16-beta31-live-wave-accepted.md'
status: 'PASSED'
---

# EVAL-010 — beta.31 live grouped PLAN wave

## Scope

- checkout: `dd-eval-runs/EVAL-010-live-plan-retry/luna-xhigh-beta31`;
- engine: `dd-flow-cli@0.8.0-beta.31`;
- flow pack: `3.2.0-vnext-protocolize-beta.14`;
- model: Codex Desktop `gpt-5.6-luna`, `xhigh`;
- parent task/session: `01a0086b-7120-70e1-9fac-a00b141bdb5f`;
- RUN: `RUN-001-task-priority`;
- protocol: `PRT-007-task-priority`.

## Result

The live flow completed `SPECIFY → PROTOCOLIZE → PLAN` and deliberately
stopped before CODE. PLAN chose `compact_plan` and
`single_wave_grouped`, rather than incorrectly treating one PRT as a local
review route. It registered one CODE coordinator, but did not start it.

| Review group | Work | Desktop session | Agent Turn | Verdict |
| --- | --- | --- | --- | --- |
| data | `WORK-8e52e928-283e-48cc-b8b6-416c376ecaec` | `01a00876-65ca-77a1-b9cf-6f1e99e90bd6` | `TURN-8dc782b5-bcd3-485a-ab28-39065fcc986c` | pass |
| API | `WORK-c9293955-dddd-480a-96b4-45ac3f455742` | `01a00876-68a1-71a1-9191-44c9ab6a3162` | `TURN-4fba83b1-fb35-4cb8-99bb-d1befe87db6b` | pass |
| UI/evidence | `WORK-a4130a28-5506-436b-9eca-a82a12be1faf` | `01a00876-6cd8-7853-b01e-8e4c3907b49b` | `TURN-22b1c4a8-0877-4c5a-94d9-d61abb572aae` | pass |

The parent PLAN Work and Turn were
`WORK-798b2e14-c26d-4085-8477-cb99f6fdb22b` and
`TURN-40474479-11c6-4e05-89fe-89a64b51bbc3`. The generated CODE entry is
`WORK-d337790b-1fb6-4bcd-8398-41aa2e87ba7d`; it remains `created` and has
the three review Works as dependencies.

## Acceptance evidence

- All lifecycle transitions were registered through `dd-flow`.
- The three review sessions were bound to their real Desktop task IDs before
  `work start`; the persisted Agent Turn records contain those same IDs.
- Each generated worker command used a one-time launch token and an explicit
  project root. For the live adapter invocation the project root was supplied
  by the short alias `/tmp/dd-e10`, preventing a model transcription error in
  a long filesystem path.
- `stage-report.json` is `done`; its PLAN wall clock is `696358 ms`.
- `plan.json`, `aspect-map.json`, CODE batch, report Markdown and report HTML
  were all created by the stage. Product code was not changed.

## Related regression and beta.31 fix

EVAL-009 on beta.30 produced a valid API `needs_changes`: a legacy PATCH that
omits `priority` must preserve an existing High/Low value, not apply the
create/legacy-read Medium default. The parent corrected that plan, but beta.30
could not create a fresh review attempt and therefore blocked PLAN finish.

Beta.31 adds `plan reviews dispatch --retry-needs-changes`: it creates a new
Work only for a group whose latest verdict is `needs_changes`, and PLAN
acceptance uses each group’s latest attempt. The deterministic regression test
exercises `needs_changes → retry → pass`; EVAL-010 did not require a retry
because its initial API review already passed.

## Remaining observation

The generated full absolute `start_command` is semantically correct. Agents
can still mistype a long copied path, as seen in EVAL-009. The runtime has
project aliases conceptually, but the worker packet should expose a short,
validated alias directly in a future beta so the harness does not need to
provide one externally.
