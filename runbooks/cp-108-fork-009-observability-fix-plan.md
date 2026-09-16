# cp-108: fork-009 failure and observation fix plan

Status: ready for implementation after the 2026-09-15 review. Production implementation and validation of the fixed path remain outstanding. The contracts below take precedence over historical investigation notes.

## Implementation order and non-negotiable contracts

1. Preserve structured causes in the shared adapter boundary; add focused tests for both envelope formats and both process exit paths.
2. Implement the whole-RUN physical stop barrier in the owned ZCode backend/bridge and integrate it into RUN control. Test that capture cannot precede this barrier, including failure and restart paths.
3. Add capability-aware observation and persisted budgets in the existing adapter journal/daemon. Implement the timeout and recovery rules below, with fake-clock/event-replay tests.
4. Route fork --start through the existing detached continuation owner; reconcile the same fatal control and publish final EVAL status. Test crash/retry and delayed settlement.
5. Run focused suites and final build/type checks once, then one bounded fixed-path cancellation probe. Replay the historical 601724-ms response with a fake clock; a new ten-minute model call is not required to test the timer boundary. Only after these pass prepare the new CODE checkpoint fork; dispatch remains an explicit operator action.

This is one lifecycle path, not a new orchestration service. Reuse shared journal, process ownership, RUN control and EVAL observer mechanisms. Do not redesign product flow, prompts, fixtures or scoring as part of this fix.

## Live experiments 2026-09-15: implementation decisions

Probe: `tools/probe-zcode-observation.mjs`; existing native backend client reused,
bridge source `60af0d31e13076a313d9770f10aa70f7c94742cf`. Each probe creates
its own temporary workspace, native Session and owned backend process group.
No source RUN/EVAL is resumed or modified. Receipts contain metadata only.

### Cancellation: reproduced, not a hypothesis

Receipt: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-observation-r0nkbT/receipt.json`.
Root `sess_f355a53d-c516-42f9-939a-e206c7296cfb`, child
`sess_subagent_agent_c42df736-4c62-4b12-934e-95a5be213d48`.

- Child tool started at 01:55:58.899Z; root stop acknowledged 01:56:03.555Z.
- Root close acknowledged `closed:true` at 01:56:09.097Z; subsequent read
  returned -32004 (not active).
- Root Agent call completed at 01:56:12.004Z; root **Read started at
  01:56:15.732Z and completed at 01:56:15.746Z**, followed by another model
  request. Root turn completed only at 01:56:26.603Z.
- The prompt deliberately asked the root to read a harmless local marker after
  the child returned, including cancellation. This tests enforcement, not the
  model's willingness to follow an instruction to stop.

Decision: for fatal/whole-RUN cancellation of an exclusively owned ZCode
backend, native close/residency are diagnostic receipts, **not the settlement
barrier**. Fence productive admission, collect bounded diagnostics, stop/close,
retire the owned backend group, await and verify exit, and only then mark
physical settlement and capture recovery state. Do not wait for a model to
cooperate. Never apply this to a shared app or another RUN's backend.
An individual child stop must not kill a shared parent backend; expose that
scope's unconfirmed settlement or escalate through an explicit whole-RUN stop.

Audit `ZcodeBackend.close()` too: its SIGKILL fallback currently sends the
signal without awaiting a subsequent exit, and a leader's early exit is not
proof that every owned descendant exited. Preserve ownership/identity evidence,
verify the required process boundary, and return unconfirmed cleanup on failure.
Do not claim that process exit cancels remote provider billing or computation;
it fences local tools and continuation.

### Observation: root stream and child residency are different capabilities

Root probe receipt:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-observation-XD0pP5/receipt.json`.
Without tools, root emitted native `model.streaming` repeatedly from
01:55:42.905Z through 01:58:02.168Z. Probe ended at its 150-second bound and
owned backend exited with SIGTERM. This qualifies availability of live root
stream events, **not a completed >600-second request**.

Child subscription probe receipt:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-observation-Fhhhfc/receipt.json`.
Native `session/subagents` returned a running child, and native log recorded
its `model.request.started`, but `session/subscribe` for that exact child
returned -32004. No resume/ensure was attempted; owned backend was stopped.
Thus do not implement child observation by assuming every child is a resident
subscribable Session. This limitation is native, not just dropped ACP text.

Controlled repeat, allowing subscription failure without ending observation:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-observation-kGbvgr/receipt.json`.
Child `sess_subagent_agent_c9f2f7a8-7eaf-476b-9c47-9819829f0741` request
started at 01:58:05.157Z. Root's last wire event was 01:58:05.121Z; neither
root wire progress nor child request completion appeared before the probe's
02:00:20.952Z bound (about 136 seconds). The model-IO file did not yet exist
during observation. Subscription again returned -32004. This demonstrates
an observation gap, not a proven inference hang. All four probe backends
exited with SIGTERM; a subsequent process check found none of their PIDs.
No full >600-second live request was completed in these bounded probes;
the historical 601724-ms completion remains the long-request evidence.

Root probe emitted 71 streaming events with a maximum inter-event gap of
2697 ms. Therefore root streaming counters are useful; copying that assumption
to native child Sessions would recreate the bug. The implementation must
publish the adapter's actually supported observation capabilities.

Prefer existing root streaming events with metadata counters over reading full
model-IO bodies. For children use exact-identity native request/turn diagnostics
and report `request_pending; stream_progress_unavailable` when appropriate.
Never interpret a silent completed-model-IO file as proof of a hang. Request
deadline and observation silence must be separate, bounded policies. A known
pending child request must not be killed solely because ACP tool events stopped.

Required tests now include native child subscription -32004 despite a running
child; root Read after close while residency is false; backend-exit wait after
force escalation; snapshot capture forbidden before physical settlement.

## Native-log follow-up: supersedes the initial uncertainty below

Native evidence found in `/Users/deksden/.zcode/cli/rollout/model-io-sess_subagent_agent_6d8b6a95-4bce-42dd-9dc9-004ef28e20d4.jsonl`, `model-io-sess_1c9e73be-35a9-4546-9dcf-4680d6b3550b.jsonl` in the same directory, and `/Users/deksden/.zcode/cli/log/zcode-2026-09-15.jsonl`.

The child request `b095e23d-4a5e-4af3-9ae4-e8f622f86760` completed at 23:21:24.488Z after 601724 ms, attempt 1, finishReason=tool-calls, outputTokens=23394. Native tool.call.started recorded Bash at 23:21:24.569Z, followed by TOOL_CANCELLED at 23:21:26.890Z and cancelled turn at 23:21:27.560Z. The inactivity stop overlapped a long model response that completed successfully. There is no basis to call this a proven hung model. The completed record does not prove the time of each streamed token; live stream progress availability still needs verification.

More seriously, the root session recorded further model requests and Read/Bash tool calls after control settlement at 23:22:01Z, ending at 23:28:46.856Z. Its requests retain the same native turn ID. Bash returned adapter shutdown errors while Reads and inference continued. Thus native residency absence/tree projection was insufficient proof of total execution settlement. Do not assume the sealed recovery snapshot had a fully quiescent native writer solely from this receipt; investigate filesystem writes separately and use the earlier CODE entry checkpoint for validation.

### Required changes to observation and cancellation design

1. Add native diagnostic sources to adapter-owned observation, correlated by exact root/child session, turn/query/request IDs. Publish source paths and cursors to RUN evidence. Tail incrementally with bounded buffers, tolerate an incomplete last line, handle rotation/truncation, deduplicate, and explicitly expose unavailable/stale sources. Do not scan all global logs on every poll. Copy only the relevant diagnostic metadata into RUN evidence; exclude request headers, credentials and full prompts/reasoning from public status.
2. Separate transcript, completed model-IO records, and native operational logs. A completed model-IO record is retrospective: a silent file during a request is not a liveness signal. Record request-start, retry/backoff, first/last stream activity and completion where supported. Stream counters/timestamps suffice; reasoning text is unnecessary. Verify native event availability with a bounded long-response experiment before finalizing timeout behavior.
3. Replace unconditional 10-minute ACP-silence cancellation for an observed in-flight model request. Mark it quiet/model-request-pending and collect diagnostics. Use an explicit bounded request/observation policy distinct from last tool activity; do not let fresh heartbeat/probe events extend it indefinitely. If reliable streaming signals cannot be obtained, record this limitation and qualify a conservative configurable request deadline against a response exceeding 600 seconds; do not describe such deadline expiry as model failure.
4. Treat any native request/tool start after the cancellation fence as a settlement contradiction. Persist it and keep physical execution settlement unconfirmed even if residency reports false. Stop the root turn and background child completion notifications before/alongside closing adapters, prevent new native requests/tools from the cancelled generation, then verify owned processes and pending requests. Confirm what ZCode's native cancellation actually guarantees in a controlled experiment. If native cancellation cannot provide the guarantee, require an isolated owned process boundary with confirmed exit; never kill an unrelated shared application.
5. Extend regressions with this incident: a >600-second model response without ACP tool updates; completed response concurrent with cancellation; cancelled child wakes the root; root emits a new request after native session removal; tools other than Bash remain callable; tree reports settled before request termination. A stable settled report requires that these paths cannot continue productive work.
6. Before another live fork, validate the implemented cancellation boundary with one bounded owned-backend probe and validate the long-response policy with deterministic replay of the historical completion. The diagnostic experiments above establish the defect, not that the fix already works. Retain receipts; the fresh CODE fork remains the validation target below.

## Evidence and scope

Source EVAL: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260915010000-plan-review-fork-009`.

- PLAN-REVIEW succeeded; CODE context was accepted at 2026-09-14T22:58:27Z.
- P1 child Work started at 23:00:17Z. Last forwarded child tool completion was at 23:11:22.800Z (Read of apps/api/src/db/commands.ts).
- ZCode bridge rejected the pending prompt after its 600000 ms inactivity window. There is no recorded native terminal failure proving why updates stopped.
- Adapter emitted a flat error envelope; harness-adapter.ts only parsed nested error.code and reduced it to harness_adapter_failed.
- EVAL reported cleanup pending at 23:21:35Z; run_controls reached settled at 23:22:01.449Z. The EVAL report remained stale. Fork --start bypassed the detached continuation owner used by ordinary run/resume.
- Daemon retained shutdown_state=running with active_tree=false. Separate provider-tree settlement from daemon process retirement.

## 1. Preserve error semantics across adapter boundaries

Use one normalizer for flat `{ok:false,code,error,details,retryable}` and nested `{ok:false,error:{code,message,details,retryable}}` envelopes. Inspect existing shared runtime error utilities before adding any helper. Apply to nonzero process exits and successful exits containing error envelopes. Keep bounded raw diagnostics, transport exit/signal, structured cause and observation evidence separately. Callback/logging failures must not replace the primary cause.

Audit shared harness-adapter consumers (controller, work launch, merge, recovery) and bundled adapter emitters. Consumers must inspect normalized cause for inactivity/observation loss; an adapter wrapper must not turn an uncertain operation into a confirmed provider failure. Do not indiscriminately retry auth, lifecycle validation or product failures.

## 2. Observe inactivity without inventing provider state

Extend existing bridge/daemon journal and status projection; no additional daemon or independent event pipeline.

Persist a bounded activity summary: observed_at, root/provider/adapter/child session identities, Work and stage where known, active prompt request ID and dispatch time, last inbound time, last productive event time, last tool name/ID/status, unfinished tool IDs (bounded), native process identity/liveness and exit evidence, transport state, known child topology with observation time and completeness. Distinguish not available from empty/zero.

At an inactivity threshold, record inactivity_detected BEFORE cancellation. Collect one bounded diagnostic snapshot using existing non-mutating native resident/retainedSubagents operations and process observations. Verify that probes are legal during the active prompt; never use an inspect/resume path that activates or mutates an unregistered child. Store probe timeout/error and keep the root request identity. Probe replies/heartbeats must not refresh productive activity. A native resident process or running child is not proof of inference progress.

Expose states supported by evidence: tool running, waiting for child, native turn pending with no recent updates, transport unavailable, native terminal failure, stopped. Only claim model inference/provider retry if an authoritative native event supplies it. No inference from CPU usage or silence.

Replace the unconditional ACP inactivity cutoff with separate bounded observation and request deadlines. ACP silence first triggers diagnostics. An authoritatively observed pending child request uses the request deadline, not the last-tool timestamp; unavailable diagnostics use an explicit bounded observation-loss policy. Deadline expiry is a policy interruption with native outcome unknown, not proof of provider failure. Do not make waits infinite or blindly resend a prompt. A late result remains correlated to the original request and is journaled; fenced generations cannot accept productive continuation. Preserve sleep-gap handling and ensure diagnostics cannot repeatedly extend the budget. Qualify the configured request budget against the historical 601724-ms successful response; do not pick a new arbitrary cutoff and label the defect fixed.

Inspect locally available ZCode diagnostic logs for this exact provider session to narrow the original silence; record any remaining uncertainty. Additional native provider-request telemetry is conditional on supported sources, not a prerequisite to the basic fix.

### 2.1 Explicit timeout policy

Freeze effective policy in the RUN's adapter configuration at admission and expose it in status. Overrides must be finite positive durations; missing values use the defaults below. Reject invalid values rather than silently disabling limits. Include new policy fields in daemon configuration identity checks. Existing `livenessTimeoutMs` becomes the quiet/diagnostic threshold, not a second independent fatal timer.

- **Quiet threshold: 600000 ms (existing default).** Measured since last genuine productive activity, or dispatch if none. Crossing it records quiet state and triggers bounded diagnostics, not automatic failure. Root text/reasoning stream deltas and attributable child progress count; heartbeat, status replies, duplicate/replayed events and unrelated sessions do not. A known pending child request with unavailable stream telemetry stays visibly pending.
- **Individual native model request budget: 1800000 ms (30 minutes).** This initial operational policy reuses the existing adapter's 30-minute fallback scale, but applies to an individual native request, not a whole multi-step ACP turn. It is not an empirically guaranteed upper bound on model latency. The historical 601724-ms request fits it. Start at the request's authoritative start, retain the same budget across retries/backoff belonging to that logical request, and never refresh it with stream chunks or tools. Only a proven new logical model request gets a new budget. Whole EVAL/RUN limits, if configured, remain separate upper bounds.
- **Observation-loss budget: 120000 ms of active observation after the quiet threshold or detected loss of observation state.** Reuse the existing recovery-observation budgeting pattern. Applies when request state cannot be established/reconstructed, not merely because a child's stream capability is unavailable. A previously persisted pending request keeps its request budget even if the log source temporarily disappears; mark its observation stale. Explicit transport/process failure is handled immediately, not after the quiet threshold.
- **Diagnostic RPCs: at most 5000 ms each, within the same remaining observation budget.** No nested probe gets a fresh outer budget. Exhaustion produces a named observation-policy error; request-budget exhaustion produces a request-policy error. Neither claims that the model itself failed or hung. Both enter the same controlled stop path.

Persist initial budget, remaining budget, last accounted observation and effective policy under the existing journal/state durability contract. Within a live owner use the monotonic observation clock and existing scheduler-gap handling. On restart restore remaining time, never allocate a fresh full budget. An unobserved downtime/suspend interval is recorded as a gap, not charged as evidence of model inactivity; reattach within the persisted observation-loss budget before admitting further work. Persist budget reservations before bounded observation waits so repeated crashes cannot obtain free waits. Corrupt/missing budget for an already admitted request means observation state is unknown, not a new request; recovery cannot silently grant it another 30 minutes.

At the expiry boundary drain already received matching terminal events before making the stop decision. Once the fatal control/fence is durably admitted, a late successful response is diagnostic evidence only and cannot undo the stop or resume productive dispatch. This does not promise to fence native tool execution instantaneously: the physical backend-exit barrier below is mandatory.

### 2.2 Restore observation without resending work

Attach observation before productive dispatch. Persist RUN/controller generation, root/child native identity, logical request/turn identity, source cursor and budget together through the existing serialized writer. Reduce these events into the existing bounded activity summary; do not add a second durable event store.

On observer restart, load the summary, replay journal entries after its watermark, then resume tailing the recorded native sources. Persist normalized evidence before advancing the source cursor; a crash may replay an entry but must not skip one. Deduplicate by provider event/request identity and phase, or source file identity plus byte offset where provider IDs are absent. Session ID alone is insufficient: title generation, main inference, retries and concurrent children can share a session. A title request completion must never close the productive request's budget. Do not substitute a query/turn ID for a finer request ID unless the source actually guarantees uniqueness; represent ambiguous correlation as unknown.

Only subscribe to identities with supported native capability. A running child with -32004 remains an observed child with unavailable subscription, not stopped; do not call ensure/resume to repair observation. Historical events can reconstruct state but their arrival must not reset activity to the current time. Terminal request state is not reopened by an out-of-order start or duplicate.

Tail complete JSONL records with bounded buffers. Retain the partial-line offset for rereading; handle truncation/rotation by file identity. Missing rotated data, malformed relevant records, incompatible state schema or ambiguous ownership explicitly downgrade observation to unknown/stale and invoke the policy above. No whole-global-log scan on every poll. No full prompts, credentials or reasoning text in status/evidence summaries.

If a RUN control is already active on restart, observation joins its cleanup path instead of resuming productive work. Failure to persist lifecycle evidence blocks further admission and surfaces a storage error; best-effort diagnostics must not replace the original failure cause.

## 3. One continuation owner for fork/run/resume

Keep fork preparation idempotent under its lifecycle lock. Publish ready receipt, then release the lock before requesting the existing detached requestRunnerContinuation. Use a stable continuation request ID tied to the fork intent/manifest. Both initial --start and repeated --start must reach the same observer/admission path; no recursive lock and no duplicate native launch.

Remove direct foreground execution from startForkedExecution. CLI returns acceptance and observer location; status comes from shared events/report/attempt state, not the original ready receipt. Ensure next_command retains --integrity-checksum. On failed execution, observer reconciles the existing RUN control until settled or its explicit observation budget expires, then publishes the final report and recovery capture. Reconcile an already-active fatal control rather than creating a competing stop intent. Persist failures of preparation/observer admission with concrete diagnostic evidence.

## 4. Complete resource retirement and reporting

Use this exact whole-RUN fatal-stop order; distinguish the native execution backend from the outer control daemon:

1. Persist/reuse one fatal control and fence new productive admission for its generation. Keep control/status observation available.
2. Capture bounded diagnostic metadata, then attempt cooperative native stop/close. These calls must not postpone physical stop indefinitely; use the remaining existing stop budget. Missing native receipts do not prevent stopping a proven owned backend.
3. Retire the exclusively owned native backend process boundary using existing managed-process helpers. Preserve process identity/birth and ownership evidence before signaling. Await exit after both TERM and KILL; verify owned descendants rather than only the leader PID. Missing/ambiguous ownership forbids broad killing and leaves cleanup unconfirmed. Native work may continue during cooperative drain; journal this, but never seal a snapshot during that window.
4. Persist physical settlement evidence only after the relevant owned execution resources have stopped. A native `closed:true`, absent residency, resolved ACP promise or successful signal send alone is insufficient. If verification fails, keep cleanup pending/needs_attention and capture unavailable; do not mark settled to unblock the workflow.
5. Seal recovery capture only after that barrier. Then retire the outer daemon/control resource when no longer needed, recording its cleanup result separately. If existing shutdown combines backend and daemon exit, have the external controller observe the owned process exit and persist the receipt; do not require the exited daemon to answer an RPC.
6. The detached EVAL observer reconciles the existing control and publishes the final report. Observation-budget exhaustion publishes failed/needs_attention with unconfirmed cleanup, not an endless awaiting_provider state or fabricated success. A replacement observer can continue reconciliation without redispatching work.

These steps are idempotent across crashes: after an observed exit but before receipt persistence, recover using the recorded ownership/exit evidence; never signal a newly reused PID. A failure between settlement and capture leaves capture pending/failed, not ready. Do not stop shared/foreign resources. An individual child cancellation must not silently terminate the whole RUN backend.

Make status show the causal error, current observer state, age of observation, cleanup/capture state and evidence links. An old awaiting_provider projection cannot be presented as fresh productive execution. Verify existing console consumes this data; do not introduce a second console-specific state machine.

## 5. Required regressions and validation budget

- Flat/nested errors, both exit paths, malformed diagnostics, primary error preservation.
- Child events refresh productive activity; diagnostic probes do not. Quiet pending prompt produces bounded evidence and policy attribution; process exit and native failure remain distinct; late result, sleep gap and probe failure cases.
- Real CLI fork preparation/dispatch contract with a small fake adapter: empty output, exact engine hash, preserved fixtures, stable repeated --start, foreground caller exit, one native launch. Avoid relying only on permissive fake fork responses.
- Failure then delayed settled cleanup updates final EVAL report automatically; existing fatal control is reused; observer crash reattaches without redispatch.
- Owned daemon retirement and neighboring-resource preservation.
- Test registry/home isolation: temporary fork homes never enter the real registry.
- Fake-clock replay: 601724-ms child request without ACP updates survives quiet threshold and completes; a request reaching its 30-minute budget interrupts once even with stream events; a new proven request gets its own budget, while retry/reconnect does not.
- Observer restart retains/reserves budgets; scheduler gap is explicit; duplicate, late and out-of-order events do not reset timers or reopen completed requests. Concurrent child/title/main request identities do not cross-complete each other.
- Partial JSONL record, rotation/truncation, unavailable source, corrupt saved budget and crash between evidence append/cursor commit lead to replay or explicit observation loss, never silent fresh admission.
- Close reports success but root issues Read; no capture before physical exit. TERM/KILL exit confirmation, surviving descendant, ambiguous/reused PID, and crash between exit/receipt/capture preserve the settlement barrier and neighboring resources.

Run focused affected suites and build/type validation once for the final changes. Broaden only for a failure or additional changed shared behavior. No repeated full release gates for this investigation.

## 6. Controlled live validation from CODE

Verified snapshot descriptor: schema dd-flow/eval-run-snapshot@5, purpose stage_entry, stage_entry code.

Checkpoint ID: `plan-review-9493dd79385985f244d7c0e6f7d5a02b6747c8c7412f433c4207442dc3257499`.

snapshot.json SHA-256: `2339d0d43a133a74ce80dd7fcc19928cd661c5a13588f8c3323c405776e83816`.

After implementation: build/install the fixed engine, verify its immutable artifact digest, prepare a NEW output/request ID from fork-009 and the above checkpoint, with exact --engine-version and --integrity-checksum. Reuse retained case/flow/Memory Bank/fixture pins and accepted plan. Validate the entire snapshot via the restore contract, restored CODE entry, exact engine binding and inherited baseline receipt before dispatch. Start via shared background observer.

This repeats CODE from its entry, including P1; it does not resume the interrupted P1 inference. PLAN-REVIEW corrections are inherited. No replay of SPECIFY/PROTOCOLIZE/PLAN/PLAN-REVIEW, and no migration of partial failed CODE writes into the clean checkpoint.

Success criteria: CODE is dispatched once, native progress is attributable to the correct Work/child, and execution either progresses with usable evidence or terminates under a named policy with diagnostic snapshot, confirmed cleanup and final report. A naturally successful CODE run cannot by itself prove the inactivity branch; deterministic tests cover it. This derived run validates the fixed engine path and remaining stages, not a fresh end-to-end execution of all earlier stages.

## Step-by-step trace of the proposed path

1. Operator supplies source/checkpoint/new output/engine digest. Definition and artifact validation fails before native dispatch if any pin differs.
2. Fork restore owns output; publishes bound RUN at CODE and retained fixture pins. Source remains evidence.
3. Preparation lock releases; one detached observer admits the manifest and launches one controller.
4. Controller enters CODE and starts ready P1. Root and child events update one activity summary without promoting child identity to a second root.
5. Normal events continue: work completion/checks advance the frozen Work graph through existing flow rules.
6. Silence: diagnostic snapshot records what is known; probes neither resend the prompt nor count as model progress. Native failure or policy interruption retains distinct attribution.
7. Controller fences and requests one stop. Late events are retained as evidence; they cannot reopen execution.
8. Existing control verifies physical provider execution settlement, including owned backend exit for the ZCode whole-RUN fatal path, before sealing capture. Residency absence alone cannot advance this step. Outer daemon retirement has a separately visible result.
9. EVAL observer sees settlement, finalizes the failed/completed projection and exits. Lost observer can reattach by the same persisted identities.
