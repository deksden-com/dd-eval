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
- The current integrated engine is `dd-flow-cli@0.8.0-beta.29`. The beta
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
  ".memory-bank/dd-flow/schemas/plan-aspect-map.schema.json"
]) JSON.parse(require("node:fs").readFileSync(p, "utf8"))'
```

## PLAN run

From the agent Session that owns the accepted RUN:

```bash
dd-flow stage start <RUN-ID> --stage plan --project-root <dd-tasks> --json
```

The returned prompt is authoritative. The agent writes one `plan.json` and one
`aspect-map.json` per PRT plus `<RUN>/03-plan/code-work-batch.json`. For a
grouped route it then runs the returned `plan reviews dispatch` command,
launches every ready review Work with its returned command, accepts their
verdicts into the map, and only then runs the exact PLAN finish command.

The successful finish must prove:

- every plan validates as `protocol-plan@2`;
- every map validates as `plan-aspect-map@2`;
- the CODE batch has an `entry_work_id`;
- `03-plan/stage-report.{json,md,html}` exist;
- the temporary batch file is removed only after the complete Work graph has
  been committed and refreshed in the portable RUN projection;
- every supported-harness PLAN/child Work has a trusted Session/Turn binding;
- usage was refreshed for all RUN Sessions with source provenance;
- the receipt contains the exact CODE start command and RUN is not marked
  `waiting_for_user` without a real question.
- `single_wave_grouped` has completed review Work/Agent Turns before CODE is
  registered; a route label alone is not evidence.

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
