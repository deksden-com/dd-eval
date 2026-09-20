# E2E monitoring

Start with `node bin/dd-eval.mjs runner status --eval <absolute-eval-root>` from the dd-eval checkout.
For direct controller diagnostics use the execution's pinned wrapper with
`DD_FLOW_HOME=<runtime-root> <runtime-root>/bin/dd-flow run drive status --run <RUN-ID> --project-root <project-root> --after <cursor> --json`.
The explicit home is required for historical wrappers; newly generated wrappers pin it themselves.

## Determine the current stage

`manifest.executions[].stage` is the configured entry stage. It is immutable run input and
must never be reported as current progress.

Determine the current stage in this order:

1. Use an explicit live stage projection from the RUN/controller when status provides one.
2. Otherwise read the RUN's `timeline.jsonl`: the latest `stage_attached` without a later
   matching `stage_completed` is current. If the latest stage was completed, report the RUN
   as between stages and include that completed stage as the last known stage.
3. Corroborate the result with current Work states and recently written stage artifacts.

For example:

```sh
jq -r '
  select(.type == "stage_attached" or .type == "stage_completed") |
  [.at, .type, .stage, (.status // "-")] | @tsv
' <absolute-run-root>/timeline.jsonl | tail -n 20
```

Do not infer stage progress from `state: awaiting_provider`, process leases or provider-turn
count: those describe orchestration/liveness, not the semantic stage. If the timeline and a
live projection disagree, report the discrepancy and use the newer durable RUN event. If live
RUN evidence is unavailable, report the current stage as unknown with the observation error;
label retained evidence as last known rather than substituting the entry stage.

When a lifecycle call fails, inspect the retained hook event and CLI error together. A
`lifecycle_shell_syntax_invalid` error means the hook observed the call but rejected its shell
composition; it is not missing delivery. `invocation_receipt_missing` is reserved for absent
or unbindable native evidence. Preserve the original code/reason in the report instead of
replacing it with a later `execution_ended_without_work_result` or cleanup error.

A diagnostic timeout means observation failed. Validate arguments, runtime home and engine;
retry the read through the ordinary runner path. Never stop an EVAL solely because a diagnostic
timed out, a timestamp did not change, the root session is quiet or a Work has not finished.

For each current controller operation report two independent facts: its productive outcome
(`completed`, `failed`, `interrupted`, or unknown) and its settlement (`settled`, `pending`, or
`blocked`). A completed native prompt with pending settlement is not a failed prompt and must
not be resent. It keeps its capacity until the same operation's receipt-only release or one
fresh, authoritative tree inspection settles it. Show the operation ID, pending reason, last
observation error and deadline if present. A historical receipt without `settlement.json` is
unknown settlement, not proof of either success or failure.

Before declaring a blocker, inspect controller errors, owned process identities, native root and
child session evidence, and the child's retained JSONL. Do not materialize/resume sessions to
observe them. A pending model request is not proof of a deadlock. Stop only on an explicit
operator request, a confirmed fatal execution error or an expired configured execution deadline.
Retain the source evidence and exact reason before issuing the standard control command.

Lease heartbeats and polling timestamps are infrastructure evidence, not model progress. Report
the latest durable native content/tool event separately; if it is absent or unreadable, label it
unknown rather than calling the flow healthy or hung.

Status distinguishes physical stop from recovery readiness. `stopped` means the matching scope
generation has a durable physical settlement receipt. Recovery may still be pending because
operation journals require reconciliation; show its reasons and verified RUN capture paths.
Keep historical execution results and the initiating control request visible. Do not freeze a
candidate, start Judge, resume or create another fork as a side effect of status monitoring.
