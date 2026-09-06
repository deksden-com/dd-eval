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
- Conflict-index/partial-MERGE round trips, capture crash/flush injection,
  descendant-process registry races, and all late-hook generation races still
  need their dedicated acceptance tests.
- Cross-segment usage/account-change accounting is not yet the complete plan
  026 report model.
- The historical AGY run requires separate explicit recovery authorization.

Never remove these restrictions merely to make an E2E pass. Record a capability
gap when native evidence cannot establish safe continuation.
