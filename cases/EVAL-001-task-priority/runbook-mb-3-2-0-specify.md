# EVAL-001 Memory Bank 3.2.0 — Goal A / SPECIFY

This runbook launches only the initial incomplete-input SPECIFY pass. It ends
when the agent has persisted the stage evidence and is waiting for the external
clarification packet. Do not start PLAN or CODE in this run.

## Fixed input

- case: `EVAL-001-task-priority`
- track: `planning`
- checkpoint: `cp-002-mb-3-2-0`
- source tag: `eval-cp-002-mb-3-2-0`
- source commit: `252f6c8b112a88327cf8c8e22c606679f85bb0ff`
- Memory Bank: `3.2.0`
- flow pack commit: `2a1aaec84ee7d62b9f5a6549de5d1f0cb88082c0`
- flow contract: `dd-flow/flow-contract@6`
- dd-flow CLI: `0.7.0`
- profile: `codex-desktop-gpt-5-6-luna-max-dd-flow-0-7-0`
- model and reasoning: `gpt-5.6-luna` / `max`
- stop boundary: `waiting_for_user` after SPECIFY; no PLAN or CODE

## 1. Materialize a clean run repository

Run from the `dd-eval` repository and choose a new output path that does not
already exist:

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0 \
  --source /Users/deksden/Documents/_Projects/dd-tasks

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0 \
  --profile codex-desktop-gpt-5-6-luna-max-dd-flow-0-7-0 \
  --track planning \
  --source /Users/deksden/Documents/_Projects/dd-tasks \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/codex-desktop-gpt-5.6-luna-max-mb-3.2.0-specify-01
```

Keep the adjacent `*.run.json` manifest outside the materialized repository.
It binds the immutable checkpoint, generated `eval-input` commit, profile and
SHA-256 of every controller material. Do not copy controller files into the
evaluated repository or reveal their paths to the agent.

## 2. Launch the evaluated task

Create one new Codex Desktop task rooted at the materialized repository with
full access, model `gpt-5.6-luna`, and reasoning `max`. Send the rendered
controller prompt from `prompts/controller-initial.md`, replacing only
`{{RUN_REPOSITORY}}` with the absolute materialized repository path.

The task must:

1. create Goal A for the incomplete-input SPECIFY pass and stop at
   `waiting_for_user`;
2. prime from the materialized repository's
   `.memory-bank/dd-flow/prime.md`;
3. create the intake file in the run workspace and make
   `dd-flow stage start --bootstrap --stage specify --project-root <root>` the
   first flow action; use the returned stage prompt and context packet as the
   authoritative runtime facts;
4. ask only the problem-space questions required by the incomplete request;
5. finish the stage through the generated completion command and stop.

Do not send the clarification packet, reference specification, reference plan,
review prompt, or acceptance contract to the task. Do not start PLAN, CODE,
readiness, merge, deploy, or a second stage.

## 3. Controller acceptance gate

After the task stops, inspect the materialized repository with its explicit
project root:

```sh
dd-flow protocol status <protocol-id> --project-root <run-repository> --json
dd-flow run list --project-root <run-repository> --json
dd-flow run timeline --project-root <run-repository> --run-id <run-id> --json
```

Accept Goal A only when the protocol/run is in `waiting_for_user` (or the
current flow's exact equivalent), SPECIFY questions and evidence are present,
no PLAN/CODE/merge/deploy action started, and session/timing data is retained.
If the gate fails, retain the run as invalid flow evidence; do not repair it by
editing the materialized repository or SQLite.

## 4. Stop here

Goal B is a separate controller operation. Only after this gate passes may the
controller send the unchanged clarification prompt and exact clarification
packet for the next run stage.
