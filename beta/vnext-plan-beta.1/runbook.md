---
file: 'beta/vnext-plan-beta.1/runbook.md'
description: 'Controlled preparation and execution of the vNext PLAN beta eval.'
status: 'IN_PROGRESS'
---

# vNext PLAN beta runbook

## Preconditions

- `dd-tasks` is checked out on the beta flow branch with the vNext flow pack.
- `dd-flow-cli` is built from its beta branch and selected as the project
  engine.
- The project has a fresh `DD_FLOW_HOME`; do not reuse a database holding the
  pre-cutover prefixed Work/Session schema.
- The next integrated snapshot is `dd-flow-cli@0.8.0-beta.41`. Do not create
  a new comparable RUN until the engine tag, the beta flow-pack compatibility
  file and the eval checkpoint all select this exact snapshot.
- Codex hooks are installed for the active `CODEX_HOME` and the harness can
  create a PreToolUse event for `dd-flow` Bash calls.
- The canonical discussion fixture has already reached accepted PROTOCOLIZE
  with one PRT. PSET is a separate eval case.

## Coordinated engine / flow-pack pair

An eval beta is an immutable pair, not an independently selectable CLI and
Memory Bank revision:

1. The `dd-flow-cli` beta tag supplies the router/engine snapshot.
2. The `dd-tasks` beta tag supplies the flow pack and its
   `.memory-bank/dd-flow/compatibility.json` contract.
3. The `dd-eval` profile and checkpoint name those exact two commits/tags.

The flow pack's required engine range must admit the selected snapshot before
the RUN is materialized. A new engine behavior — including a prompt-only
behavior change — requires a new flow-pack beta that updates this contract,
then a new matching profile/checkpoint. Do not substitute a newer engine into
an older pack, widen the gate locally, or relabel the result: compatibility
must fail closed. Preserve such a failed invocation as blocker evidence, then
prepare a fresh materialization from the coordinated pair.

Operator check before launching a worker:

```bash
DD_FLOW_HOME=<isolated-home> dd-flow engine info --json
DD_FLOW_HOME=<isolated-home> dd-flow status --project-root <materialization> --json
```

Both commands must identify the versions pinned by the profile/checkpoint and
report normal-write compatibility before the first `stage start`.

## beta.41 focus

The prior cutover is implemented. beta.41 retains the bounded capacity
observation and complete-review retry, and makes every generated worker
lifecycle command target the same isolated runtime.

1. **Capacity observation.** `dispatch` asks for 15 independent leaf probe
   launches. Each probe waits 60 seconds and returns its exact `AGENT-NN`
   token; the controller waits for all probes or a 180-second total deadline,
   terminates unfinished probes, and records only exact-token completions once
   with `plan-review capacity record`. Probe tasks are never counted from
   creation requests and have no Work/Session records.
2. **Worker packet.** The exact `work start`, `work finish`, and `work fail`
   commands returned to a fresh reviewer all include `DD_FLOW_HOME=<isolated-home>`.
   A worker uses those commands unchanged; it never substitutes its own home.
3. **Review retry.** A `needs_changes` decision ends the current review Work
   and archives the stage attempt. After correcting and incrementing PLAN,
   start `plan-review` again; dispatch every current review group anew. Never
   retry individual groups or reuse their previous evidence.
4. **Reviewer dispatch.** Reuse the RUN-level slot value to pack actual fresh
   reviewer Works into the smallest practical number of waves. The returned
   `work start` command includes the isolated `DD_FLOW_HOME` prefix.
5. **Deterministic gate.** Run the engine suite, fix any remaining test
   failure at its cause, then rerun lint, typecheck, build and beta-pack
   `mb-lint`. Do not weaken or skip a failing test.
6. **Immutable beta artefacts.** Tag/push engine beta.41; update and tag/push
   the dd-tasks beta flow pack and its compatibility contract; then create the
   matching dd-eval profile and checkpoint. All three revisions must be
   recorded before preparation.
7. **One visible evaluation.** Materialize a new isolated workspace and
   `DD_FLOW_HOME`, launch the normal Desktop task with the fixed profile, stop
   at CODE entry, archive the complete RUN, and assess quality and timing.

The run pauses at a genuine blocker; a CLI-only substitute is never reported
as a Desktop result.

Before handing the fresh RUN to a Desktop worker, install the pinned engine
into its fresh flow home deterministically:

```bash
DD_FLOW_HOME=<isolated-home> dd-flow engine install --json
```

This is harness setup, not an evaluated agent action. Confirm the installed
version matches the profile before the first `stage start`; a fresh home has no
engine snapshot by design.

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

### Working-directory contract

The evaluated Desktop task may start in a parent project directory (for
example, `_Projects`) rather than in the materialized repository. Treat that
as a supported harness condition, not a blocker and not a reason to register
a temporary Desktop project.

- Pass the materialization as the absolute `--project-root` on every lifecycle
  command.
- Use only the absolute artifact paths returned in the lifecycle prompt or
  `work-context.json`. They are authoritative regardless of the shell cwd.
- Never create a relative `.memory-bank/...`, `RUN-*`, or stage path. Before
  writing, compare the target with the returned absolute project/stage root.
- A command that needs trusted PreToolUse binding must be one direct
  `DD_FLOW_HOME=<isolated-home> dd-flow …` invocation. Do not wrap it in
  `cd &&`, a pipe, a heredoc or another compound shell expression; use an
  existing absolute `--intake-file` when the bootstrap needs intake bytes.

The operator creates the isolated engine snapshot before launch. The worker
does not install or select engines.

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
  ".memory-bank/dd-flow/schemas/plan-review-decision.schema.json",
  ".memory-bank/dd-flow/schemas/plan-review-result.schema.json"
]) JSON.parse(require("node:fs").readFileSync(p, "utf8"))'
```

Before the first delegated Work in the RUN, inspect the shared context:

```bash
dd-flow run vars ls <RUN-ID> --project-root <dd-tasks> --json
```

`policy.plan_review.requested_mode` must be present. A local-only RUN has no
capacity requirement. A RUN that will delegate must obtain exactly one
`runtime.subagents.available_slots` observation before packing its first
worker batch; later stages reuse it and shrink batches after real refusals.

`policy.plan_review.requested_mode` is not an ad hoc config field. It is the
RUN-variable projection of the versioned `plan_review.mode` flow flag. Inspect
and revise that policy only through:

```bash
dd-flow run flags status <RUN-ID> --project-root <dd-tasks> --json
dd-flow run flags revise <RUN-ID> --expected-revision <n> \
  --idempotency-key <key> --flag plan_review.mode=<mode> \
  --reason <reason> --project-root <dd-tasks> --json
```

The flags revision and `policy.*` materialization must commit together.
`run vars set` is only for bounded `user.*` values.

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
- every delegated aspect is `pending`; only local self-checks may already have
  a terminal verdict;
- the proposed CODE batch remains present and has no registered entry Work;
- `03-plan/stage-report.{json,md,html}` exist;
- the receipt contains `start_plan_review`, not a CODE start command;
- the PLAN Work has a trusted Session link;
- reports point to controller-owned source usage rather than presenting a
  synthetic final total;

## PLAN-REVIEW run

Start the stage from the PLAN owner Session:

```bash
dd-flow stage start <RUN-ID> --stage plan-review --project-root <dd-tasks> --json
```

The start response has only two legal outcomes:

- `review_off`: no prompt, reviewer Work or reviewer Session exists. The
  CLI has atomically opened CODE; use the returned CODE command.
- `review_required`: the returned prompt is authoritative. Run its exact
  `plan-review dispatch` command, launch each returned Work as a real fresh
  subagent, and make the exact returned `work start` command its first action.
  The hook binds the observed Session/agent identity. Reviewers return compact
  per-aspect `plan-review-result@1` JSON through `work finish` and never edit
  plan/product files. The parent writes `decision.json` and runs its exact
  finish command.

If the first dispatch returns `capacity_probe_required`, launch 15 independent
fresh leaf probes in parallel. Probe `NN` must not call tools, read project
files, create children or run `dd-flow`; it waits 60 seconds and returns
exactly `AGENT-NN`. Wait for all probe tasks, but no longer than 180 seconds
from the first launch. Count only exact-token completions, terminate the rest,
record that one number through the returned `plan-review capacity record`
command, then repeat dispatch. The CLI stores
`runtime.subagents.available_slots` and returns actual reviewer Works; only
those have lifecycle and Session records.

For the compact task-priority case, `auto` should select `standard` and one
grouped fresh-reviewer wave. A user request is normalized once into the RUN
variable `policy.plan_review.requested_mode` before this stage. The generic
variable command may set only `user.*`; the flow/controller owns policy and
runtime namespaces.

```bash
dd-flow run vars get <RUN-ID> --project-root <dd-tasks> \
  --key policy.plan_review.requested_mode --json
```

The setting is frozen as soon as PLAN-REVIEW starts.

Successful PLAN-REVIEW must prove:

- `04-plan-review/stage-report.{json,md,html}` exists;
- the outcome is `off` or `accepted` and CODE Work is registered exactly once;
- enabled review has at least one fresh reviewer Work/Session;
- only latest accepted reviewer attempts gate CODE after targeted retry;
- the proposed batch is removed only after CODE registration commits;
- the exact CODE start command comes from the PLAN-REVIEW receipt.

For a visible worker wave, the harness creates every child agent and sends it
the exact token-free `work start <WORK> --project-root <root>` command returned
by dispatch. The worker never receives or supplies a Session or agent id.
PreToolUse supplies both provider `session_id` and optional child `agent_id`;
the runtime uses `sessions.id = agent_id ?? session_id`, derives its parent from
the parent Work's latest confirmed Session link, and atomically claims Work using the
normalized operation/Work/project fingerprint.

The evaluator records both identities. `session_id` names the provider host
task/thread; `agent_id` names the child context when one exists. Neither is
substituted for the other. Runtime grouping and usage use the stored Session
id and its Work links.

Every delegated Work uses the same lifecycle:

1. `work start` is the first subagent action and returns the bounded task,
   applicable RUN variables, result schema and exact completion commands;
2. the subagent performs only that task;
3. `work finish` or `work fail` is its final flow-owned lifecycle command;
4. `work finish` closes the Work/Session link. The controller recalculates
   usage from source only after the subagent returns.

The task-priority case uses `compact_plan` depth but is a substantive
multi-aspect vertical slice. It should prefer one grouped review wave when the
actual pool permits it; do not score `local_compact` as correct merely because
there is one PRT or one implementation item.

Capacity is never typed into the parent prompt. The engine places the one
RUN-level observation in `runtime.subagents.available_slots`; stage start and
Work start include it automatically where applicable. It changes packing only.

## CODE-entry proof

Run only the entry, then stop before implementation:

```bash
dd-flow stage start <RUN-ID> --stage code --project-root <dd-tasks> --json
```

The result must contain the same coordinator Work ID, its registered Session
and a self-contained worker prompt. For a compact case no child Work is
required.

## Eval evidence

Archive the RUN unchanged. Collect its stage reports, timeline, Work tree,
Session tree, Work/Session links, provider `session_id`, optional child
`agent_id`, transcript paths and usage. Verify one Work association per
delegated agent and no active Work after the stage stops. Grade it using
`004-plan-quality-gate.md`; do not fold PSET criteria into the single-PRT
score.

The eval result must contain a compact identity table for the root and every
launched child: Desktop task/thread id when available, Work id, Session id,
provider `session_id`, optional `agent_id`, parent Session and transcript path.
A missing child identity is an observability defect, not an empty value to
infer later.

After the root and all child responses return, run exactly once:

```bash
dd-flow stat usage --run <RUN-ID> --project-root <dd-tasks> --json
```

The result must be `final`; the evaluated agent never runs this command.
