# E2E orchestration defects — 2026-09-12

> Superseded causal analysis: see [the verified investigation](e2e-systemic-investigation-2026-09-12.md).
> The managed context observer already exists. Neither EVAL journal contains
> `managed_run_controlled` or an operation-suspended event; attributing the
> missing observer to that catch branch below was unsupported. The original
> observer exit cause remains unknown. ZCode's help event occurred at 15:55:13Z,
> but its operation failed at 16:17:01Z. `recovery_required` blocks productive
> continuation; it does not mean that explicit recovery can never occur.
> The minimum-identity proposal below also needs the legitimate bootstrap
> exception and must not replace the CLI's actual help semantics.

Status: three open systemic defects. The live Luna qualification was continued
through the documented `runner resume` path; that recovery is evidence, not a
normal completion of the launch contract. The terminated ZCode qualification
is retained as evidence only and is not to be replayed or manually repaired.

## DEF-EVAL-001 — managed launch has no continuation owner

### Observed deviation

Published-engine Luna E2E `EVAL-20260912145714-a6df3a35` completed CODE at
`2026-09-12T17:11:52Z`. Its retained controller
`DRV-22cc3b4a-a845-484d-9960-b163c7cab9ce` was still alive, its native Session
was idle, and the controller persisted `waiting_for_context` at
`2026-09-12T17:12:35Z`. No runner process supplied the next CODE-REVIEW
context.

This is a liveness failure of the eval orchestration contract. A normal E2E
must not rely on an operator, a chat heartbeat, or a second public command to
move between controller-owned stage boundaries.

At `2026-09-12T17:42Z`, the exact retained EVAL was continued with:

```sh
node bin/dd-eval.mjs runner resume --eval \
  /Users/deksden/.dd-eval/qualification/cp-100-luna-zcode/runs/EVAL-20260912145714-a6df3a35
```

The resume reused the existing controller and Session; it did not send a
manual provider prompt. It recorded the missing controller events, prepared
the CODE-REVIEW context, and the controller entered `code-review` with its
own next `session prompt` operation.

### Cause

`launchEvalExecution()` deliberately maps `managed_run_controlled` to
`execution.awaiting_provider` and returns. The detached `run drive serve`
controller remains responsible for lifecycle progress, but the launch path
does not retain a supervisor that calls `runnerResume()` when that controller
later emits `context_required`.

The controller therefore behaved correctly: it completed and captured CODE,
then waited fail-closed for the context only the runner may materialize. The
runner's projection was stale: it described the initial suspended launch,
not the controller's current need. This is not a Luna/provider timeout and
not a reason to edit SQLite or replay a provider prompt.

### Required correction

1. Give a managed E2E launch a durable local continuation owner. It must
   observe the retained controller until terminal completion, pause/control,
   HITL, or a terminal controller error; `context_required` must cause that
   owner to materialize and supply the exact context without a second public
   `runner resume` invocation.
2. Keep the existing controller fence, operation identities, context hashes
   and no-replay rules. The correction must call the same internal
   continuation path as `runner resume`; it must not manufacture a provider
   prompt or mutate controller state directly.
3. Project a terminal `run drive serve`/adapter failure to the launch
   operation and `execution.failed`. Do not label it `awaiting_provider`.
4. Add regressions for both cases:
   - an initial E2E launch crosses a later `context_required` boundary and
     enters the next stage without another runner command;
   - a retained controller operation fails after launch, and the runner writes
     terminal operation/execution failure rather than an indefinite wait.

## DEF-EVAL-002 — lifecycle parser blocks non-lifecycle CLI help

### Observed deviation and evidence

ZCode E2E `EVAL-20260912145801-7107a4ac` terminated at
`2026-09-12T15:55:13Z` while a child Session requested this ordinary
inspection command:

```sh
DD_FLOW_HOME="…/dd-flow-home" "…/bin/dd-flow" work start --help 2>&1 | head -60
```

The adapter event is retained at
`…/controllers/DRV-acb0931d-6964-4916-b711-0a94ad0c5f8e/session-1/adapter.events.jsonl`
(orders 1713 and 1726). The ZCode hook raised
`compound_lifecycle_command`, which then failed the controller operation.

This was not a `work finish --result-stdin` incompatibility: that exact
payload form is deliberately permitted by `allowsStdinLifecycleCompound()`.

### Cause

`parseLifecycleCommand()` classifies a command purely from its first two argv
items (`work start`), without checking that it carries the required Work
identifier or that it is not a help/version request. Consequently
`dd-flow work start --help` becomes a trusted `work_start` lifecycle command.
The shell pager makes its analysis `compound`, so the safety guard rejects a
documentation query as though it were an attempt to compose a state-changing
command.

The guard's intended invariant is sound: a state-changing lifecycle invocation
must remain one attributable command. Help and version queries do not change
state, cannot claim a lifecycle receipt, and must not enter that guard.

### Required correction

1. Make lifecycle recognition require the minimum operation identity before
   declaring a command lifecycle-participating: a Work command needs a Work
   id; stage commands need their RUN/stage identity; recovery needs its RUN and
   recovery id. Treat `--help`, `-h` and `--version` requests as `kind: none`.
2. Keep the existing compound rejection for actual lifecycle mutations,
   including commands with valid identities. Do not weaken the rule for shell
   pipelines generally.
3. Add parser and hook regressions for the exact absolute-path command above,
   plus `stage start --help | head`; assert that both are ignored by lifecycle
   hooks. Retain tests that a valid `work start WRK-001 | head` is rejected and
   that `work finish --result-stdin` remains permitted.

## DEF-EVAL-003 — terminal controller failures are projected as provider waits

### Observed deviation

The ZCode controller persisted an `operation_failed` terminal result with the
same `compound_lifecycle_command`, yet the high-level E2E projection remained
`awaiting_provider`. Monitoring therefore described a dead execution as one
waiting for a provider and gave no terminal failure receipt to the evaluator.

### Cause and required correction

The initial launch maps `managed_run_controlled` to
`execution.awaiting_provider` and returns. Later controller terminal state is
not observed by an owner (DEF-EVAL-001), and therefore cannot replace that
initial suspended projection. The durable continuation owner must classify an
observed terminal controller/adapter error as `operation.failed` and
`execution.failed`; only a verified active or observation-lost provider turn
may retain `awaiting_provider`.

Add a regression where a controller becomes terminally failed after a managed
launch has returned and assert that the final execution state is `failed`, not
`awaiting_provider`.

## Temporary operational guard

For this live experiment only, a heartbeat may invoke the existing
`runner resume` command when all of the following are proven: the controller
is `waiting_for_context`, the native turn is idle, and no later
`context_prepared` or `stage_entered` event exists. It must not resume an
active turn, HITL, cancellation/control fence, terminal error, or ambiguous
state. This guard is a bounded mitigation and must be removed once the runner
owns continuation itself.

## Cross-defect acceptance criteria

- A fresh multi-stage E2E completes all ordinary context handoffs with one
  initial `runner eval run` invocation and no monitor/operator continuation.
- Interrupted/unknown provider outcomes remain fail-closed and still require
  their existing explicit recovery path.
- Controller terminal errors create durable `operation.failed` and
  `execution.failed` receipts, so final projection and monitoring never call
  them provider waits.
- Existing boundary snapshots remain controller-captured exactly once.
- A help/version command, including an absolute isolated `dd-flow` executable
  and a shell pager, is not classified as lifecycle activity; a valid
  state-changing lifecycle command remains subject to the standalone guard.
