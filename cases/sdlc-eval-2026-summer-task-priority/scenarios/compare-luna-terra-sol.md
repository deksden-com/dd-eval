# Compare Luna xhigh, Terra high and Sol high

## Purpose

Measure where these three Subject profiles differ while executing the same
planning flow:

- `gpt-5.6-luna` / `xhigh`;
- `gpt-5.6-terra` / `high`;
- `gpt-5.6-sol` / `high`.

The comparison has two parts:

1. four independent focused stages per profile, each starting from the same
   stage-specific starter Session and canonical project/RUN checkpoint;
2. one E2E planning contour per profile, starting from the same SPECIFY starter
   and producing its own downstream artifacts.

This is 15 Subject executions: 12 focused and 3 E2E. Historical Luna beta runs
are diagnostic evidence only and are not substituted into this comparison.

## Fixed inputs

- Case: `sdlc-eval-2026-summer-task-priority`.
- Controller: `codex-desktop-gpt-5-6-terra-high-dd-flow-0-8-0-beta-63`.
- Judge: `codex-desktop-gpt-5-6-sol-high-dd-flow-0-8-0-beta-63`.
- Focused stages: `specify,protocolize,plan,plan-review`.
- E2E: enabled; stop at `plan_review_accepted`; CODE remains unstarted.
- One fresh Subject fork from the applicable current starter Session per
  execution.
- One fresh Judge fork per focused candidate and one fresh Judge fork per E2E
  candidate.
- The same committed case definition, starter registry, project checkpoint,
  engine, flow pack, permissions and Desktop harness apply to every profile.

Subject profiles:

```text
codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-8-0-beta-63
codex-desktop-gpt-5-6-terra-high-dd-flow-0-8-0-beta-63
codex-desktop-gpt-5-6-sol-high-dd-flow-0-8-0-beta-63
```

Do not edit prompts, interactions, rubrics, expectations, starters or runtime
configuration between profiles. A changed definition starts a new comparison.

## Controller procedure

1. Record the clean `dd-eval` commit and verify scored readiness once.
2. Prepare one full suite for each Subject profile with the exact selection:

```sh
dd-eval prepare \
  --case sdlc-eval-2026-summer-task-priority \
  --focus specify,protocolize,plan,plan-review \
  --e2e \
  --controller-profile codex-desktop-gpt-5-6-terra-high-dd-flow-0-8-0-beta-63 \
  --subject-profile <subject-profile> \
  --judge-profile codex-desktop-gpt-5-6-sol-high-dd-flow-0-8-0-beta-63 \
  --source <absolute-dd-tasks-beta-root>
```

3. Execute focused candidates stage-major to reduce time-dependent environment
   drift: all three SPECIFY candidates, then all three PROTOCOLIZE candidates,
   then PLAN and PLAN-REVIEW. Within a stage use the profile order Luna, Terra,
   Sol.
4. Execute the three E2E candidates after all focused candidates, in the same
   profile order.
5. Follow `runbooks/execute-eval.md` for every execution. Never continue a
   starter or canonical Session directly.
6. Judge every candidate from a fresh Judge fork. Do not tell the Judge which
   Subject model produced it. Accept only the declared rubric and evidence.
7. Preserve invalid attempts, but exclude them from quality comparison. Retry
   only infrastructure-invalid executions from a new Subject fork and record
   both attempts.
8. Finalize all three profile runs before producing the comparison report.

## Comparison method

Compare quality and efficiency separately.

Quality is reported per stage and for E2E using:

- run validity and flow conformance;
- every rubric criterion, including whether an essential criterion passed;
- weighted stage score;
- critical, major and minor findings;
- missed requirements, unsupported invention and information loss;
- quality of the produced handoff to the next stage.

A profile is practically **not worse than Sol** for one stage when all are true:

1. both executions are valid;
2. it passes every essential criterion passed by Sol;
3. it has no additional critical or major finding;
4. its weighted score is no more than `0.03` below Sol.

Efficiency never compensates for a critical or major quality defect. Report it
separately using wall time, total/input/cache-read/reasoning/output tokens,
Subject and child Session counts, CLI calls, retries and unnecessary repeated
work.

The Judge's Subject-model label remains hidden during individual scoring. The
Controller performs the final cross-profile synthesis from accepted Judge
results and flags close or surprising Sol-vs-Sol-Judge differences for human
review.

## Required report

The comparison report records:

- scenario path and `dd-eval` definition commit;
- all 15 execution IDs, starter parents, Subject Sessions and Judge Sessions;
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
