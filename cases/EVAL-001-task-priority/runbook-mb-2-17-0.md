# EVAL-001 Memory Bank 2.17.0 planning rerun

## Fixed input

- checkpoint: `cp-002-mb-2-17-0`
- source tag: `eval-cp-002-mb-2-17-0`
- source commit: `3ed4077b0dacf9ba1054513cf703e502b0470956`
- Memory Bank: `2.17.0`
- flow pack commit: `79f2eec863c3e4cf3712bca12b28254012de32a3`
- profile: `codex-desktop-gpt-5-6-luna-max`
- stop boundary: accepted `ready_for_code`, before CODE

## Prepare

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-17-0

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-17-0 \
  --profile codex-desktop-gpt-5-6-luna-max \
  --track planning \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/codex-desktop-gpt-5.6-luna-max-mb-2.17.0-cli-0.4.2-planning-rerun-02
```

The run manifest binds SHA-256 for every operator material. Controller prompts
remain outside the materialized repository.

## Two-goal controller sequence

1. Start one Codex Desktop task with `gpt-5.6-luna` / `max` and the complete
   rendered `prompts/controller-initial.md`. Goal A ends at proven
   `waiting_for_user`; PLAN must not exist.
2. Only after Goal A is complete, send the complete rendered
   `prompts/controller-clarification.md` with the exact unchanged contents of
   `prompts/clarification-packet.md`. The same task creates Goal B, records exact
   packet provenance, completes SPECIFY and PLAN, then stops at
   `ready_for_code` before CODE.

Never put both controller messages in one goal. A missing or mismatched packet
hash invalidates the run instead of lowering its quality score.

## Runtime preflight

The installed CLI is `/Users/deksden/Library/pnpm/dd-flow` version `0.4.2`,
built from tagged commit `5443eeea84ccea3740546a8b0bc3867161ac340b`
with engine `install_source=local_development`.
The evaluated task must check that exact path when `dd-flow` is absent from
`PATH`. The materialized repository path is unique, so it receives a separate
project registration and RUN lineage.

The immutable checkpoint metadata continues to describe its original Memory
Bank input. The actual CLI path and version for this run are recorded in the
profile embedded into the external run manifest. npm publication is not a
precondition for this local run because the exact executable, Git tag, commit
and install source are bound explicitly.

Do not reuse or continue either earlier attempt. The CLI `0.4.0` attempt exposed
project-scoping defects; the CLI `0.4.1` rerun exposed top-level router scope
loss before RUN creation. Retain both only as invalid infrastructure evidence
and prepare the `rerun-02` repository above.

## Collect and compare

After `ready_for_code`, collect timeline, usage, flags and sanitized Codex JSONL
as described in `runbook-mb-2-16-0.md`. Evaluate the current Memory Bank 2.17.0
run on its own; a Memory Bank 2.16.0 repeat is not required. Compare the useful
timing and quality signals against the retained earlier results only as
historical context:

- total and phase wall time;
- question/plan quality;
- task assessment and full-plan locality;
- coverage units versus execution jobs;
- groups, semantic waves and runtime batches;
- capacity observation/probe cost;
- recovery attempts and prevented duplicate launches;
- source-aware usage and unattributed time;
- exact clarification provenance and final validity verdict.
