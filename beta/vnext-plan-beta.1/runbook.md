---
file: 'beta/vnext-plan-beta.1/runbook.md'
description: 'Controlled preparation and execution of the vNext PLAN beta eval.'
status: 'DRAFT'
---

# vNext PLAN beta runbook

## Preconditions

- `dd-tasks` is checked out on the beta flow branch with the vNext flow pack.
- `dd-flow-cli` is built from its beta branch and selected as the project
  engine.
- The project has a fresh `DD_FLOW_HOME`; do not reuse a database holding the
  pre-registry `flow_works` shape.
- The current integrated engine is `dd-flow-cli@0.8.0-beta.32`. The beta
  project compatibility file must select that exact snapshot before creating a
  RUN.
- Codex hooks are installed for the active `CODEX_HOME` and the harness can
  create a PreToolUse event for `dd-flow` Bash calls.
- The canonical discussion fixture has already reached accepted PROTOCOLIZE
  with one PRT. PSET is a separate eval case.

## Harness

Launch the evaluated worker as a separate, visible Codex Desktop task by
default. Do not launch this eval through `codex exec`: that is a different
harness and is permitted only for an explicitly labelled CLI case or a
mechanical smoke check. Record the Desktop task ID in the result.

Do not delete, rename or rebuild the user's shared `~/.dd-flow` database to
make an eval fresh. If Desktop cannot start the task with the designated
isolated `DD_FLOW_HOME` and matching hook environment, record the environment
blocker and repair that harness configuration first. A CLI-only substitute is
not a Desktop comparison result.

For an isolated Desktop run, prefix every `dd-flow` lifecycle invocation with
the literal `DD_FLOW_HOME=<isolated-home>`. The managed PreToolUse hook routes
that event to the same home before it appends `--hook-event-id`; this is the
only permitted runtime override for this beta harness.

## Preflight

```bash
pnpm --dir <dd-flow-cli> typecheck
pnpm --dir <dd-flow-cli> lint
pnpm --dir <dd-flow-cli> build
pnpm --dir <dd-flow-cli> test
```

Do not start the model eval while any deterministic C-01–C-19 fixture from
specification 005 is missing or failing. C-20 is the model eval itself.

Check the beta pack:

```bash
node -e 'for (const p of [
  ".memory-bank/dd-flow/vnext/mb-sdlc-vnext-protocolize.json",
  ".memory-bank/dd-flow/schemas/protocol-plan.schema.json",
  ".memory-bank/dd-flow/schemas/plan-aspect-map.schema.json",
  ".memory-bank/dd-flow/schemas/plan-review-decision.schema.json"
]) JSON.parse(require("node:fs").readFileSync(p, "utf8"))'
```

## PLAN run

From the agent Session that owns the accepted RUN:

```bash
dd-flow stage start <RUN-ID> --stage plan --project-root <dd-tasks> --json
```

The returned prompt is authoritative. The agent writes one `plan.json` and one
`aspect-map.json` per PRT plus `<RUN>/03-plan/code-work-batch.json`, then runs
the exact PLAN finish command. PLAN does not start reviewers and does not
register CODE Work.

The successful finish must prove:

- every plan validates as `protocol-plan@2`;
- every map validates as `plan-aspect-map@2`;
- the proposed CODE batch remains present and has no registered entry Work;
- `03-plan/stage-report.{json,md,html}` exist;
- the receipt contains `start_plan_review`, not a CODE start command;
- the PLAN Work has a trusted Session/Turn binding;
- usage was refreshed for all RUN Sessions with source provenance;

## PLAN-REVIEW run

Start the stage from the PLAN owner Session:

```bash
dd-flow stage start <RUN-ID> --stage plan-review --project-root <dd-tasks> --json
```

The start response has only two legal outcomes:

- `review_off`: no prompt, reviewer Work or reviewer Agent Turn exists. The
  CLI has atomically opened CODE; use the returned CODE command.
- `review_required`: the returned prompt is authoritative. Run its exact
  `plan-review dispatch` command, bind each returned Work to a fresh Desktop
  task, then send that task its returned `work start` command. Reviewers return
  `plan-review-result@1` JSON through `work finish` and never edit plan/product
  files. The parent writes `decision.json` and runs its exact finish command.

For the compact task-priority case, `auto` should select `standard` and one
grouped fresh-reviewer wave. A user request may be recorded before this stage:

```bash
dd-flow run config set <RUN-ID> --project-root <dd-tasks> \
  --key plan_review.mode --value off|standard|deep --reason "..." --json
```

The setting is frozen as soon as PLAN-REVIEW starts.

Successful PLAN-REVIEW must prove:

- `04-plan-review/stage-report.{json,md,html}` exists;
- the outcome is `off` or `accepted` and CODE Work is registered exactly once;
- enabled review has at least one fresh reviewer Work/Session/Turn;
- only latest accepted reviewer attempts gate CODE after targeted retry;
- the proposed batch is removed only after CODE registration commits;
- the exact CODE start command comes from the PLAN-REVIEW receipt.

For a visible Desktop worker wave, the harness creates every child task, then
runs `dd-flow work adapter-bind <WORK> --desktop-task <returned-task-id>`
before it sends that child its returned `work start` command. The worker never
receives or supplies a session ID. The one-time launch token in the returned
command and the PreToolUse command fingerprint reject a foreign or reused hook
event.

The task-priority case uses `compact_plan` depth but is a substantive
multi-aspect vertical slice. It should prefer one grouped review wave when the
actual pool permits it; do not score `local_compact` as correct merely because
there is one PRT or one implementation item.

When the Desktop adapter is available for the controlled eval, state the known
review capacity in the parent task's stage context before PLAN routing. That is
a runtime fact, not a user/product requirement: it changes packing only.

## CODE-entry proof

Run only the entry, then stop before implementation:

```bash
dd-flow stage start <RUN-ID> --stage code --project-root <dd-tasks> --json
```

The result must contain the same coordinator Work ID, an Agent Turn ID and a
self-contained worker prompt. For a compact case no child Work is required.

## Eval evidence

Archive the RUN unchanged. Collect its stage reports, timeline, Work list and
session/turn IDs. Grade it using `004-plan-quality-gate.md`; do not fold PSET
criteria into the single-PRT score.
