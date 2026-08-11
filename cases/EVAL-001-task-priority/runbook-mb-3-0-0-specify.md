# EVAL-001 Memory Bank 3.0.0 — Goal A / SPECIFY

This runbook launches only the first evaluation goal. It ends when the agent
has completed the incomplete-input SPECIFY pass and is demonstrably waiting for
the controller. Do not deliver the clarification packet in this runbook.

## Fixed input

- case: `EVAL-001-task-priority`
- track: `planning`
- checkpoint: `cp-002-mb-3-0`
- source tag: `eval-cp-002-mb-3-0`
- source commit: `3661b84bf0f58fc886b2f2e49e6b720a1b017c05`
- Memory Bank: `3.0.0`
- flow contract: `dd-flow-canonical-2026-08`
- dd-flow CLI: `0.5.0`
- profile: `codex-desktop-gpt-5-6-luna-max-dd-flow-0-5-0`
- model and reasoning: `gpt-5.6-luna` / `max`
- stop boundary: `waiting_for_user` after SPECIFY; no PLAN or CODE

## 1. Materialize a clean run repository

Run from the `dd-eval` repository. Choose a new output path; it must not
already exist.

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-0 \
  --source /Users/deksden/Documents/_Projects/dd-tasks

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-0 \
  --profile codex-desktop-gpt-5-6-luna-max-dd-flow-0-5-0 \
  --track planning \
  --source /Users/deksden/Documents/_Projects/dd-tasks \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/codex-desktop-gpt-5.6-luna-max-mb-3.0.0-specify-01
```

Keep the adjacent `*.run.json` manifest outside the materialized repository.
It binds the checkpoint, generated `eval-input` commit, profile and SHA-256 of
every controller material. Do not copy controller files into the evaluated
repository or tell the agent their paths.

## 2. Launch the evaluated task

Create one new Codex Desktop task rooted at the materialized repository with
full access, model `gpt-5.6-luna`, and reasoning `max`.

Render the controller prompt by replacing only `{{RUN_REPOSITORY}}` with the
absolute materialized repository path. Then send that complete rendered text as
the task's initial message. The template remains in `dd-eval`; the rendered
prompt remains beside the external run manifest. It is the controller message,
not a replacement for project flow instructions.

The task must:

1. create Goal A with the objective “complete the project flow through the
   incomplete-input SPECIFY pass and stop at `waiting_for_user`”;
2. prime from the materialized repository's `.memory-bank/dd-flow/prime.md`;
3. use the project-local `dd-flow` flow and register its session normally;
4. ask only the questions required by the current incomplete input;
5. stop after it has persisted the stage evidence and reported
   `waiting_for_user`.

Do not send the clarification packet, reference specification, reference plan,
review prompt, or acceptance contract to the task. Do not combine Goal A and
Goal B. Do not let the task start PLAN, CODE, merge, deploy, or a second stage.

## 3. Controller acceptance gate

Before sending any follow-up, inspect the materialized repository and its
runtime with the task's explicit `--project-root`:

```sh
dd-flow protocol status <protocol-id> --project-root <materialized-repository> --json
dd-flow run list --project-root <materialized-repository> --json
dd-flow run timeline --project-root <materialized-repository> --run-id <run-id> --json
```

Accept Goal A only when all are true:

- the protocol/run is at `waiting_for_user` (or the current flow's exact
  equivalent user-input wait state);
- initial-request questions and SPECIFY evidence are present in the active
  run/protocol workspace;
- no PLAN artefact or plan-stage completion exists;
- no CODE, merge, deploy or publication action started;
- the session is bound to this run and its timing/event data is retained.

If the gate fails, retain the run as invalid infrastructure/flow evidence and
do not repair it by manually editing the materialized repository or SQLite.

## 4. Stop here

Goal B is a separate controller operation. Only after this gate passes may the
controller send the unchanged `controller-clarification.md` together with the
exact `clarification-packet.md` bytes whose SHA-256 is bound in the run
manifest. Goal B has its own runbook and is not part of this stage.
