# EVAL-001 Memory Bank 2.18.0 planning rerun

## Fixed input

- checkpoint: `cp-002-mb-2-18-0`
- source tag: `eval-cp-002-mb-2-18-0`
- source commit: `f883630c2d95179e3ac1c3881bb11cba4fa71b39`
- Memory Bank: `2.18.0`
- flow pack commit: `af116584a66eab21a33a704a288a6ccb214c9885`
- profile: `codex-desktop-gpt-5-6-luna-max`
- CLI: `0.4.2`
- stop boundary: accepted `ready_for_code`, before CODE

## Prepare

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-18-0

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-18-0 \
  --profile codex-desktop-gpt-5-6-luna-max \
  --track planning \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/codex-desktop-gpt-5.6-luna-max-mb-2.18.0-cli-0.4.2-planning-rerun-01
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

## Runtime and observability

Use `/Users/deksden/Library/pnpm/dd-flow` version `0.4.2` when `dd-flow` is not
on `PATH`. Always pass the materialized repository as `--project-root`.
Record the RUN timeline, stage wall time, flow-flag revisions, current available
subagent slots, accepted semantic launches, recovery count, and source-aware
usage. Capacity probes are not semantic reviewers; unavailable values remain
explicitly unavailable rather than numeric zero.

Do not reuse or continue a Memory Bank 2.17.x attempt. This run starts from the
single deterministic `eval-input` commit produced above.

## Collect and compare

After `ready_for_code`, collect timeline, usage, flags and sanitized Codex JSONL
as described in `runbook-mb-2-16-0.md`. Compare this run with the retained
2.17.0 result using total and stage wall time, gap/question quality, routing
decisions, semantic launch count, recovery work, usage, and final plan quality.
