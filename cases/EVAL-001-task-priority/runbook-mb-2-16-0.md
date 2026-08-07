# EVAL-001 Memory Bank 2.16.0 planning rerun

## Fixed input

- checkpoint: `cp-002-mb-2-16-0`
- source tag: `eval-cp-002-mb-2-16-0`
- source commit: `65c4e97b04e87ec30747e6a3a5560299c8831bb4`
- Memory Bank: `2.16.0`
- flow pack commit: `4f98e82398746639b6e3a40d5c6bc7a8c6850dda`
- profile: `codex-desktop-gpt-5-6-luna-max`
- stop boundary: accepted `ready_for_code`, before CODE

## Prepare

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-16-0

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-16-0 \
  --profile codex-desktop-gpt-5-6-luna-max \
  --track planning \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/codex-desktop-gpt-5.6-luna-max-mb-2.16.0-planning
```

The operator substitutes the prepared repository path into
`prompts/controller-initial.md`, starts a Codex Desktop task with
`gpt-5.6-luna` / `max`, and waits for `waiting_for_user`. Then substitute the
complete contents of `prompts/clarification-packet.md` into
`prompts/controller-clarification.md` and send it unchanged.

## Runtime preflight

The installed CLI is `/Users/deksden/Library/pnpm/dd-flow` version `0.4.0`.
The evaluated task must check that exact path when `dd-flow` is absent from
`PATH`. The materialized repository path is unique, so it receives a separate
project registration and RUN lineage.

## Collect

After the task stops at `ready_for_code`, create an operator-only evidence
directory outside the evaluated repository and save the CLI projections:

```sh
/Users/deksden/Library/pnpm/dd-flow run timeline <RUN-ID> \
  --project-root <RUN-REPOSITORY> --json > <EVIDENCE>/timeline.json
/Users/deksden/Library/pnpm/dd-flow run usage <RUN-ID> \
  --project-root <RUN-REPOSITORY> --group-by session --json > <EVIDENCE>/usage.json
/Users/deksden/Library/pnpm/dd-flow run flags status <RUN-ID> \
  --project-root <RUN-REPOSITORY> --json > <EVIDENCE>/flags.json

node ./bin/dd-eval.mjs collect \
  --manifest <RUN-REPOSITORY>.run.json \
  --session <CODEX-SESSION.jsonl> \
  --timeline <EVIDENCE>/timeline.json \
  --usage <EVIDENCE>/usage.json \
  --flags <EVIDENCE>/flags.json \
  --output <EVIDENCE>/collected.json
```

Review with the existing `review/planning.md` rubric. Compare total and phase
wall time, question/plan score, coverage units, jobs, sessions, groups, waves,
recovery attempts, duplicate launches, tool calls, compactions, source-aware
usage and unattributed flow time. Do not interpret unavailable usage as zero.
