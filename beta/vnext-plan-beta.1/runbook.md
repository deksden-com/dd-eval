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
- Codex hooks are installed for the active `CODEX_HOME` and the harness can
  create a PreToolUse event for `dd-flow` Bash calls.
- The canonical discussion fixture has already reached accepted PROTOCOLIZE
  with one PRT. PSET is a separate eval case.

## Harness

Launch the evaluated worker as a separate, visible Codex Desktop task by
default. Do not launch this eval through `codex exec`: that is a different
harness and is permitted only for an explicitly labelled CLI case or a
mechanical smoke check. Record the Desktop task ID in the result.

## Preflight

```bash
pnpm --dir <dd-flow-cli> typecheck
pnpm --dir <dd-flow-cli> lint
pnpm --dir <dd-flow-cli> build
pnpm --dir <dd-flow-cli> vitest run test/vnext-specify.test.ts
```

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
`aspect-map.json` per PRT plus `<RUN>/03-plan/code-work-batch.json`, then runs
the exact returned finish command.

The successful finish must prove:

- every plan validates as `protocol-plan@2`;
- every map validates as `plan-aspect-map@2`;
- the CODE batch has an `entry_work_id`;
- `03-plan/stage-report.{json,md,html}` exist;
- the temporary batch file is removed;
- RUN next action is `start_code`.

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
