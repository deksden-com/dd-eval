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
native evidence. `invocation_assignment_missing` means native delivery succeeded but argv
did not match an issued assignment. Preserve the original code/reason in the report instead of
replacing it with a later `execution_ended_without_work_result` or cleanup error.

For a CODE/CODE-REVIEW aggregate failure, distinguish the check result from its continuation.
`code_gate_failed`/`code_review_gate_failed` with a durable `repair_required` binding is not
stage success or a terminal engine failure: inspect the registered repair Work, its stage,
attempt/cycle, causal receipts and fresh child. Report the repair transition once. Completed
repair Work still requires the subsequent semantic verification and aggregate gate. Never
create another repair, copy receipt/Work IDs into a model-authored command, or retry a check
as a monitoring action. Environment recovery requires factual JSON evidence, not a placeholder.

Use explicit stage/attempt/cycle membership for counts and dispatch. PLAN and PLAN-REVIEW
siblings under the same coordinator are historical evidence, not CODE children. A legacy or
stale membership projection is a compatibility blocker; status must not invent membership.
For unchanged continuation failures, retain the same-turn CLI rejection (route, phase/effect,
native hook event and scope). `fanout_stage_nonprogressing` is only the fallback when no
correlated primary cause exists; a fresh process heartbeat does not invalidate that cause.

A diagnostic timeout means observation failed. Validate arguments, runtime home and engine;
retry the read through the ordinary runner path. Never stop an EVAL solely because a diagnostic
timed out, a timestamp did not change, the root session is quiet or a Work has not finished.

For boundary capture, keep `snapshot_source_changed` and `owned_inventory_changed` distinct.
The former compares copied source content and Git state; inspect its bounded
`last_capture_mismatch.components` paths to identify the changed source. The latter is a
productive writer or owned inventory fence. A retry with unchanged source diagnostics is
not progress; report the component and capture deadline instead of calling SQLite WAL
activity a model turn. If the budget expires, retain the last concrete mismatch in the
report. Do not manually checkpoint a database or restart the controller while monitoring.

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

For AGY, `settled_by_root` proves native tree settlement, not successful Work completion.
Correlate every direct child with its Work and lifecycle result; an unbound settled child
requires reconciliation. An early `hook_rejected` receipt (for example
`agy_child_identity_unconfirmed` or `agy_child_parent_unqualified`) is the causal error when
it precedes a generic `fanout_stage_nonprogressing` wrapper. Check its conversation ID,
daemon ID and turn generation against the active native turn before attributing it.

For every harness, keep native child outcome and Work settlement separate. A Grok
`TaskOutput.MultiResult` can settle several children at once; inspect each retained child
identity, outcome and matching Work finish. ZCode `lost`, a contradictory parent, or a
missing terminal result is an observation/reconciliation blocker, not completion. An
unknown child may still be executing if its native owner is live. Do not infer success
from an idle root, an empty list, or a single page of a paginated child directory.

For hook admission, distinguish the client-visible deny/timeout from a later daemon
response. Correlate request ID, native event, Session, daemon incarnation and active
operation/generation before naming the primary error. A late allow does not undo a
native deny. If the wrapper died without a durable outcome, report effect unknown;
do not retry the Work-start command or replace the first error with a lease timeout.

For PLAN/CODE review waves, use the first committed reviewer start receipt as the
group's input baseline across recovery generations. The accepted stage report, batch,
aspect maps, workspace source and external review copy have distinct checks. A
`read_only_input_changed` between waves means the group cannot combine those results;
do not move the baseline, silently re-review, or treat a new provider turn as a fix.
Untracked provider-owned `.zcode/` files and an exact qualified untracked AGY hook are
service state, not product changes; tracked or mixed files remain product inputs.

For HITL, correlate the pause ID, accepted answer operation and its native prompt receipt.
An accepted answer plus a completed/settled answer Turn with the **same pause still active**
and no active provider Turn is a no-progress blocker even when controller/observer leases
are fresh. The controller must report `controller_answer_not_applied`, not mark the answer
completed and wait for the same user answer again. A different subsequent pause is legitimate.
Report this contradiction immediately; do not resend the answer or resume automatically.

Status distinguishes physical stop from recovery readiness. `stopped` means the matching scope
generation has a durable physical settlement receipt. Recovery may still be pending because
operation journals require reconciliation; show its reasons and verified RUN capture paths.
Keep historical execution results and the initiating control request visible. Do not freeze a
candidate, start Judge, resume or create another fork as a side effect of status monitoring.
## Causal lifecycle failures

When a managed Turn ends without completing its Stage, do not treat
`incomplete_subject_turn` alone as the primary cause. Correlate the current RUN,
controller generation, Session, Stage attempt/cycle and latest durable lifecycle
receipt. A rejected runtime-owned option, authority failure or unknown effect is
an engine/infrastructure failure. A generic wrapper without correlated evidence
has undetermined attribution. Historical failures superseded by a successful
attempt, registered repair, accepted HITL answer or handoff are not current.

Record the primary error code, message and receipt identity separately from
controller wrappers and cleanup/dashboard warnings. An unchanged corrective
retry must have changed semantic input or durable lifecycle state; a new UUID or
timestamp is not progress.
