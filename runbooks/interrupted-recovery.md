# Interrupted execution recovery

Recovery is explicit. A provider failure is not a failed business result, and
an unknown operation outcome is not permission to repeat a prompt.

For beta.64 and later, retained lifecycle outcomes distinguish `no_effect`,
`committed`, and `unknown`. A committed Work-start response is recovered from
its stored packet/reply, not by creating another binding. Only a proven SQL-only
rollback permits the runtime-issued bounded storage retry. Follow that runtime
directive; never invent an invocation ID or edit the ledger to mark it ready.
Keep the original error and receipt even if stop/capture also fails. A retained
error is not evidence of a currently held SQLite lock or a live native process.
Use the owner/process and RUN-control receipts to establish those facts.
Diagnostic fallback files explain failed outcome persistence; they are not
authority to replay an operation. Historical writer-contract-1 homes stay on
their pinned engines; new beta.64 campaigns use fresh contract-2 homes.

## Continue blocked cleanup without resuming work

The recovery observer has 120 seconds of active observation, persisted across
owner replacement. Host sleep is not evidence of death. Poll backoff is
1/2/5/10 seconds; cleanup RPC waits are capped by the remaining budget.
An exhausted observer exits with the fence intact, not with fabricated success.

A rejected startup is not necessarily an unknown live Session. If the durable
`daemon.start` failure explicitly records `details.startup_resources:
"not_created"`, and the retained operation/resource inventory proves no
predecessor daemon or later dispatch, RUN control can settle that empty target.
An absent Session id, generic error, timeout or missing receipt is insufficient.
Keep the original startup failure even when empty-resource cleanup succeeds.

After budget exhaustion, `recovery_blocked` must appear in the root EVAL journal
and `observation.json`, not only in the attempt file. Read these together when
diagnosing historical runs such as cp-106, whose old projection incorrectly
remained `awaiting_provider`. Do not restart observation repeatedly to hide an
unresolved startup/settlement defect.

For a failed EVAL execution with pending cleanup:

```sh
dd-eval runner cleanup --eval /absolute/eval --request-id cleanup-1
dd-eval runner status --eval /absolute/eval
```

This detached attempt only reconciles existing managed RUN controls and reports
cleanup/capture. It never launches queued executions, Subject, Judge or recovery.
Repeating the same request ID reuses its attempt and budget; a different ID is an
explicit new observation allowance. A live owner is never displaced.

For an operator-controlled EVAL, keep its captured journal frozen and use its
retained `DD_FLOW_HOME`, `DD_FLOW_RESOURCE_HOME`, control executable and current
generation (from `runtime scope status`):

```sh
dd-flow runtime scope reconcile --scope-id EVAL-ID --generation N --request-id cleanup-1 --json
```

For an individual RUN, using that RUN's retained runtime home:

```sh
dd-flow run control reconcile --run RUN-ID --project-root /absolute/project --control-id CONTROL-ID --request-id cleanup-1 --json
```

These commands do not change the control generation or release admission. A
boundary-capture failure first needs explicit RUN pause/stop; its existing
controller is not restarted merely to grant more observation time. Productive
recovery remains the separate operation described below. Never patch old
immutable EVAL engine snapshots in place to install these commands.

ZCode cleanup requires the bridge's `zcode/session/retainedSubagents` extension.
After native close, dd-flow reads topology recursively without implicit resume
and checks every node's residency. A stale `running` label in retained history
does not mean a live resident; transport failure does not mean a dead one.
An older bridge lacking this method remains unsettled until explicitly upgraded
through the normal engine preparation workflow.

## Productive recovery

```sh
dd-eval runner recovery inspect --eval /absolute/eval --execution execution-id
dd-eval runner recover --eval /absolute/eval --execution execution-id --from RCV-id-from-inspect
```

The runner requires clean, stopped adapter receipts for every retained daemon,
reconciles their client-operation ledgers, seals the RUN, and captures evidence.
Recovery verifies the manifest, payloads, original case definition, and current
workspace before dispatch. A retained operation ID prevents blind duplicate
delivery. Unknown delivery remains blocked for reconciliation.

The runner starts and identifies the replacement daemon before preparing a
recovery binding. `dd-flow run recovery resume` requires `--daemon-id`,
`--harness`, and `--native-session-id`; it leaves the RUN guarded as `resuming`.
The retained root Session must execute the engine-generated `run recovery
accept` command. Its immutable native hook must match the authorized daemon,
Session, RUN, and recovery ID. For unfinished Work, acceptance closes the old
coordinator WorkSession as interrupted, creates the new binding, and opens the
RUN in one transaction. At a completed stage boundary it retains the completed
Work and WorkSession unchanged: the root acknowledges recovery, returns to the
controller, and only then may the controller enter the next stage.
A paused Work remains paused; acceptance does not supply its user answer.
For a running fan-out stage, the runner reads its engine-owned orchestration
before preparing recovery delivery. The root recovery Turn acknowledges only
and returns; the normal fan-out path then reconciles the graph and provides
current Work start commands. The coordinator must not perform a child's Work
or message an old child during the acknowledgement Turn. Existing launch
policies remain in force: `fresh_agent_required` still requires a fresh worker
Session, and retained native child identity alone does not authorize Work reuse.
Worker launch commands carry the current recovery ID. Receipts from old
packets or retired daemons cannot acquire another segment, and finishing Work
requires the daemon that owns its current WorkSession.

Before sending the root recovery prompt, the runner durably saves its exact
bytes, SHA-256, native Session identity, and stable adapter operation ID under
the attempt's `recovery-packets/` directory. Changed bytes or identity conflict
with that delivery; a lost response does not authorize a new operation ID.
Atomic JSON receipts flush the file before publication and the parent directory
afterward. Runner events are flushed before their caller proceeds.

`dd-flow run snapshot restore --snapshot /absolute/snapshot --project-root
/absolute/empty-project --recovery-id RCV-ID --json` restores a sealed RUN to a
fresh dedicated `DD_FLOW_HOME`. It does not import a native provider Session or
claim that the adapter can resume it. Inspect the restored RUN first.

Snapshot checks cover project/runtime/worktree payloads and Git bundles; Git
index patches preserve staged versus unstaged changes. Local drift or changed
evidence is rejected. Published snapshot directories are immutable; incomplete
temporary captures are not ready recovery evidence.

Historical candidate and Judge files remain in place. New candidate revisions
and their Judge outputs use separate paths. Changed failure evidence creates a
new candidate identity even when the sealed recovery source is unchanged;
revisions link to their immediate predecessor. Reports identify recovered runs;
ordinary GC retains runs ending with failures and rechecks eligibility under
the same lifecycle lock used by recovery.

## Qualification boundaries

The implementation is not yet full acceptance of plan 026. In particular:

- Fresh native-session import, selective same-ID child recovery, and credential
  refresh require adapter-specific qualification; file restore does not imply
  these capabilities.
- Conflict-index/partial-MERGE round trips, failed flush publication, and native
  recovery binding/old-packet races have regression coverage. Full crash-window
  and descendant-process race qualification remains incomplete.
- Cross-segment usage/account-change accounting is not yet the complete plan
  026 report model.
- The historical AGY run requires separate explicit recovery authorization.

Never remove these restrictions merely to make an E2E pass. Record a capability
gap when native evidence cannot establish safe continuation.
