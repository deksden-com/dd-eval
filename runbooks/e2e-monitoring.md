# E2E monitoring

## Read status

From the definition checkout, with the EVAL's pinned home/engine/config/resources:

~~~sh
node bin/dd-eval.mjs runner status --eval <absolute-eval-root>
~~~

Read EVAL result, baseline, controller, native turns/children, Work graph, HITL,
leases/process start identities and primary error together. Status is read-only;
do not resume, repair, launch Judge or send a model prompt to obtain diagnostics.
Stay quiet on unchanged healthy work; report actual Stage/repair transitions,
HITL, confirmed blockers, dead owners or completion, with harness and EVAL ID.

## Determine the current stage

`manifest.executions[].stage` is the immutable **entry**, not current progress.
Use the live RUN/controller projection; corroborate it with `timeline.jsonl`
and current Work/artifacts. The latest unmatched `stage_attached` is current;
after `stage_completed`, report between stages until the next attach. Prefer a
newer durable event over a stale projection. Unavailable evidence means unknown,
with a separately labelled last-known Stage.

~~~sh
jq -r 'select(.type == "stage_attached" or .type == "stage_completed") | [.at,.type,.stage,(.status // "-")] | @tsv' <absolute-run-root>/timeline.jsonl | tail -n 20
~~~

`awaiting_provider`, lease renewal and turn count do not identify semantic Stage.
For direct diagnostics use the execution's pinned wrapper, never the global CLI:

~~~sh
DD_FLOW_HOME=<runtime-root> <runtime-root>/bin/dd-flow run drive status --run <RUN-ID> --project-root <project-root> --after <cursor> --json
~~~

## Liveness and children

Only fresh current-operation reasoning/text/tool/advancing-usage evidence or
validated active children renew productivity. Polls, status timestamps and lease
heartbeats do not. A quiet root with live children is normal. Keep native outcome
and whole-tree settlement separate: completed prompt/child is not Work success.
AGY `settled_by_root` and Grok multi-result need each child's matching lifecycle
receipt; ZCode `lost`, conflicting parentage or unbound children remain unknown.
Read full inventories, not just one page or the current controller journal.

Only confirmed Codex `serverOverloaded` continues the same Session/task. Two
distinct consecutive **continuation** refusals within 120 seconds stop the chain;
the initial refusal does not count. Backoff is 5/15 seconds or proven Retry-After.
Quota/auth failures do not auto-continue. Report native reset time/anchored
estimate without moving it on subsequent polls. Never manually continue an EVAL
to bypass these rules.

## Errors and unknown outcomes

- Preserve the first correlated error, its operation/Session/Stage attempt and
  effect; report cleanup warnings separately. `incomplete_subject_turn` and
  `fanout_stage_nonprogressing` wrappers alone do not establish cause/attribution.
- Observer timeout, expired lease, host gap or missing socket does not prove a
  failed/dead provider. Read the exact retained operation and late outcome;
  never replay a prompt to recover a lost reply. A live unreachable owner needs
  investigation, not a new daemon. Diagnostic timeout alone is not a stop reason.
- Correlate hook deny/timeout, native identity and CLI receipt. A late allow does
  not undo a deny. `retry_command` requires proven `effect=no_effect`;
  `publication_pending` requires projection reconciliation, not repeat execution.
- A registered `repair_required` gate is a repair transition, not Stage success
  or automatically terminal failure. Monitor its bound Work/cycle; do not create
  repairs or repeat checks as a monitoring action.
- An accepted answer plus a settled answer Turn leaving the **same pause** active
  is `controller_answer_not_applied`, not another request for the same answer.
- For snapshot/review drift, report actual changed input paths and ownership.
  Do not reset reviewer baselines, manually checkpoint SQLite or rewrite frozen
  evidence. Tracked product inputs and untracked provider service files differ.

## Results and cleanup

Read candidate-bound sources/recovery captures, never a plausible global-home
snapshot. Keep reached failures, unavailable evidence and unreached/not-applicable
checks distinct; all-aborted checks are not PASS. Product faults are assessed by
Judge, not repaired by the operator. Judge verdict and physical shutdown are
separate: `result_ready` alone does not prove completion.

For `stop_after`, `finished` requires accepted target completion and settled
cleanup. Skipped targets are not completed-stage timing samples. Record decision
provider/model, confidence, fast-path/fallback reasons and latency; audit retained
fast-path answers against canonical bytes. Final Judge audits when enabled;
SPECIFY-only runs require a separate review. Never rerun Decisions for the audit.

After **success, failure or cancellation**, save the result and perform
[daemon/database retirement](eval-storage.md#container-retirement-after-an-eval),
including preparation failures. A shared DB stops after the last consumer.
Investigation normally retains files/dumps with processes stopped; a necessary
live-resource deferral must be closed before the next campaign using it.
Report a cleanup blocker separately; do not claim clean shutdown from a verdict,
dead PID alone or a vanished socket. See [owned cleanup commands](eval-storage.md#stop-leftover-daemons).

For input admission/qualification policy see [launch preparation](execute-eval.md#before-launch).
Internal contracts and historical incidents belong in specs/CP reports, not extra
monitoring actions or repeated readiness experiments.
