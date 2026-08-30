# Compare Luna xhigh, Terra high and Sol high

## Purpose

Measure where these three Subject profiles differ while executing the same
SDLC flow through accepted CODE-REVIEW:

- `gpt-5.6-luna` / `xhigh`;
- `gpt-5.6-terra` / `high`;
- `gpt-5.6-sol` / `high`.

The comparison has two parts:

1. six independent focused stages per profile, each starting from its accepted
   portable stage-entry fixture in a new empty Subject Session;
2. one clean E2E planning contour per profile on the explicitly selected profile
   and producing its own downstream artifacts.

This is 21 Subject executions: 18 focused and 3 E2E. Historical Luna beta runs
are diagnostic evidence only and are not substituted into this comparison.

## Fixed inputs

- Case: `sdlc-eval-2026-summer-task-priority`.
- Controller and Judge: the current `case.json` defaults.
- Focused stages: `specify,protocolize,plan,plan-review,code,code-review`.
- E2E: enabled; stop at `code-review`; MERGE remains unstarted.
- Every focused candidate uses a new empty Subject Session, an accepted portable
  entry and the requested model/reasoning. E2E uses one clean Subject Session
  on that profile and only the initial E2E entry; downstream artifacts are its
  own.
- Every candidate has one clean Judge Session. The same committed case
  definition, accepted entry pack, project input, permissions and Desktop
  harness apply to every profile. The resolved manifest is the sole source of
  the engine/flow pair.

Subject profile selection is resolved from the current `case.json` by matching
the model/reasoning pair below; the scenario deliberately does not repeat
engine or flow identifiers:

```text
gpt-5.6-luna / xhigh
gpt-5.6-terra / high
gpt-5.6-sol / high
```

Do not edit prompts, interactions, assessment, starters or runtime
configuration between profiles. A changed definition starts a new comparison.

## Controller procedure

1. Record the clean `dd-eval` commit and verify scored readiness once.
2. Launch one full suite per Subject profile with the exact selection:

```sh
DD_EVAL_HOME=/absolute/path/to/eval-data \
dd-eval runner eval run --profile \
  cases/sdlc-eval-2026-summer-task-priority/run-profiles/<profile>.json
```

3. Execute focused candidates stage-major to reduce time-dependent environment
   drift: all three SPECIFY candidates, then all three PROTOCOLIZE candidates,
   then PLAN, PLAN-REVIEW, CODE and CODE-REVIEW. Within a stage use the profile
   order Luna, Terra, Sol.
4. Execute the three E2E candidates after all focused candidates, in the same
   profile order.
5. Follow `runbooks/execute-eval.md` for every execution. Never continue a
   canonical provider Session directly.
6. Judge every candidate from a fresh clean Judge Session. Do not tell the Judge which
   Subject model produced it. Supply only the declared assessment, methodology
   and candidate evidence.
7. Preserve invalid attempts, but exclude them from quality comparison. Retry
   only infrastructure-invalid executions from a new Subject fork and record
   both attempts.
8. Finalize all three profile runs before producing the comparison report.

## Comparison method

Compare quality and efficiency separately.

Quality is reported per stage and for E2E on two independent planes:

- **Outcome Quality:** 0–4 anchored scores for the declared outcome criteria,
  essential-criterion gates, and blocking/material/minor/cosmetic findings;
- **Flow Reliability:** the corresponding 0–4 evidence for following the
  workflow contract, reported separately from Outcome Quality;
- **Efficiency facts:** wall time, token classes, sessions, tool calls and
  retries, without a compensating score.

A profile is practically **not worse than Sol** for one stage when all are true:

1. both executions are valid;
2. it meets every essential Outcome Quality criterion met by Sol;
3. it has no additional blocking or material Outcome Quality finding;
4. its deterministic Outcome Quality score is no more than `0.03` below Sol.

Efficiency never compensates for a critical or major quality defect. Report it
separately using wall time, total/input/cache-read/reasoning/output tokens,
Subject and child Session counts, CLI calls, retries and unnecessary repeated
work.

The Judge's Subject-model label remains hidden during individual scoring. A
fresh Grand Judge receives anonymized accepted reports and may propose golden
or methodology changes; only a human accepts those proposals. The Controller
performs no semantic synthesis.

## Required report

The comparison report records:

- scenario path and `dd-eval` definition commit;
- all 21 execution IDs, Subject Sessions and Judge Sessions;
- effective model/reasoning verified by the harness;
- a stage-by-profile quality table;
- a separate efficiency table;
- pairwise Luna-vs-Sol and Terra-vs-Sol findings for every stage and E2E;
- where Luna or Terra is not worse, worse, or better under the declared rule;
- recurring defects shared across stages;
- invalid attempts and retries;
- the limitation that one case and one valid attempt per cell do not establish
  model-wide statistical superiority.

The final conclusion must say where a cheaper profile is sufficient, where Sol
provides a material quality gain, and whether any difference appears only in
the integrated E2E chain rather than in focused stages.
