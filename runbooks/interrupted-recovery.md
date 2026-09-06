# Interrupted execution recovery

Recovery is explicit. A provider failure is not a failed business result, and
an unknown operation outcome is not permission to repeat a prompt.

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
Session, RUN, and recovery ID. Acceptance closes the old root WorkSession as
interrupted, creates the new binding, and opens the RUN in one transaction.
A paused Work remains paused; acceptance does not supply its user answer.
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
and their Judge outputs use separate paths. Reports identify recovered runs;
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
