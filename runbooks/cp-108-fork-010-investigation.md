# cp-108 fork-010: investigation and implementation gaps

Date: 2026-09-15. Investigation only; this report does not certify beta.68 as fixed.
Source: `~/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260915024000-plan-review-fork-010`.
Engine actually executed: `0.9.0-beta.65`. Later source changes were installed separately through beta.68.
Evidence: source `events.jsonl`, `reports/report.json`, observer `attempt.json`, read-only execution SQLite, controller adapter journal/operation receipts, exact-session native operational log and model-IO metadata.

## What actually happened (UTC)

- 02:41:58: CODE prompt dispatched. 02:42:14: stage-start command; native Bash duration about 82.6 s. Stage startup succeeded.
- 02:44:35: root starts Agent for P1 Work WRK-009; 02:44:45: child invokes work start. Thus this was not a failure to start CODE or its child.
- 02:47:36.049: child starts a model request; ACP tool activity becomes quiet.
- 02:57:36.511: bridge records inactivity_detected without aborting the prompt.
- 03:07:33.594: model request 36d5a629-0f7d-407a-afbf-b70cde4ce21c completes successfully, duration 1,197,518 ms (19m57.5s), attempt 1. Agent executes more Bash calls and another successful request.
- 03:07:54.846: another child model request starts.
- 03:11:59.387: the 30-minute ACP prompt timer expires. This is a whole-turn timer, not an individual model-request timer.
- 03:11:59.421: fatal RUN stop is requested with force=false.
- 03:12:00.288: current child request is cancelled after 245,419 ms. The agent's earlier long request had already succeeded.
- 03:12:08.966: session.cancel receipt reports settled=true from close/residency/topology observations.
- 03:12:10.319 onward: root runs Read and subsequently Bash despite that receipt. Root continues model requests and ends its native turn at 03:13:03.291.
- 03:14:19: EVAL observer records recovery_blocked / recovery_observation_budget_exhausted. Main report remains awaiting_provider, execution_state=failed, cleanup_state=pending.

Provider latency inside the 19m57 request is not explained by these metadata alone. The successful completion rules out treating that interval as a proven permanent hang. The exact child/root native identities are in retained receipts; no prompt/reasoning bodies are needed for these conclusions.

## Confirmed defects and root causes

### 1. Request lifetime confused with a complete agent turn

`dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs`, promptSessionWithBridge/request; daemon session.prompt.
The requested design assigned 30 minutes to each native model request. Implementation assigns it to session/prompt, which includes startup, tools and many model requests. The successful 19m57 request consumed the parent turn's budget; its successor was cancelled after only four minutes.
Fix: track native logical request identity and lifetime, independently of ACP turn and tool durations; keep explicit overall RUN limits separate. Preserve unknown provider outcome on policy interruption. Replay this exact timeline in a deterministic test.

### 2. Fatal stop never reaches the added daemon-stop barrier

`src/services/run-controller.ts:stopAfterFailure` requests stop without force; `src/services/run-control.ts` gates closeNodes on request.force===true. SQLite confirms force=false and no daemon.stop receipt for fork-010.
The beta.68 change inside DaemonRuntime.prepareStop cannot repair a call path which never invokes it.
Fix: define fatal whole-RUN shutdown semantics explicitly and route owned backend retirement through that same path. Keep single-child cancellation scoped separately. Test actual controller failure -> RUN control -> daemon retirement -> capture/report.

### 3. Logical cancellation falsely claims physical settlement

`dd-zcode.mjs:cancelTree/observeClosedZcodeTree` and daemon session.cancel/session.inspect still promote non-residency to settled. Native logs prove root Read/Bash after the successful settlement receipt. This recurs from fork-009.
Fix: retain cooperative receipts as diagnostic evidence; whole-RUN settlement requires confirmed retirement of the owned native execution boundary. Pending promises and late callbacks cannot reopen the fenced generation.

### 4. Physical boundary selected at the wrong process level

Outer AcpBridge starts a detached zcode-acp process. `zcode-acp/src/backend/client.ts` starts the actual native backend in another detached group, plus a separate watchdog. Stopping the outer group alone does not directly prove the backend group exited.
ZcodeBackend.close returns on leader exit, catches signal errors indiscriminately, and does not await exit after SIGKILL; it then removes the watchdog.
Fix: implement confirmed native backend group retirement in its actual owner, preserve ownership/birth evidence, distinguish ESRCH from failures, confirm after escalation, and expose the resulting receipt to the outer adapter. Do not infer stopped from a signal send or a missing leader.

### 5. Forced stop still depends on cooperative settlement

Current beta.68 prepareStop throws on unsettled.length BEFORE reaching bridge.close. A failed native probe/close can therefore prevent the very physical stop intended to resolve it. AcpBridge.close additionally awaits flush before process stop, allowing evidence delivery to delay termination.
Fix: use one bounded cooperative drain; diagnostic failures must not bypass owned physical retirement. Persist primary error and cleanup error separately. Capture remains blocked until exit proof exists.

### 6. Timeout receipt stays unresolved even after the late native response

request.finish removes the pending request; receive journals an unmatched late reply but cannot complete the logical operation. daemon-operations persists observation-lost.json, while run-control treats operations without completed/failed receipts as unsettled.
The fork has an awaiting_provider prompt operation after root native turn completion. This explains a persistent reconciliation obstacle, independent of process liveness.
Fix: maintain a terminal reconciliation path for the original operation after caller timeout. A cancelled/fenced late success is evidence only; it must not resume work. Physical-stop evidence can establish interrupted settlement without inventing a successful prompt result.

### 7. New quiet diagnostics compare different identity namespaces

Daemon active_request.session_id stores native root sess_26085..., but AcpBridge onInactivity receives adapter 84bd6e61.... The equality guard returns early. This is still present in beta.68.
The diagnostic callback also captures a stale request before await and can restore it after productive() clears it; failed persistence can reject an unhandled async interval callback. resident=false currently also represents a malformed/missing resident response.
Fix: record both identities plus operation/generation; correlate and revalidate after diagnostics; validate source replies, preserve unknown, and handle callback/storage failures explicitly. Tests must use unequal native/adapter IDs and completion during the probe.

### 8. Shared bridge change removes Grok's only deadline

`dd-grok.mjs:promptSessionWithBridge` calls shared AcpBridge.request with timeout=null and an idle timeout. After idle becomes diagnostic-only globally, Grok has no termination budget. A local 20ms quiet/90ms observation probe confirmed the request remained pending with no request timer.
Fix: make quiet policy explicit per caller or give every productive caller an explicit finite supported policy. Audit all AcpBridge consumers, not just ZCode. Add cross-adapter regression.

### 9. Policy configuration is incompletely wired

Daemon requestTimeoutMs is not exposed by dd-zcode CLI common(). Invalid/zero/NaN durations can disable checks through Number.isFinite conditions. Several comments/tests still describe the old sliding fatal timer.
Fix: validate at admission, wire and freeze supported fields, reject invalid durations; match docs/tests to the actual measured lifetime.

### 10. Final observation and user report disagree

Observer records recovery_blocked but reports/report.json remains awaiting_provider. publish attempts its final diagnostic using the already exhausted observation budget; fork-010 final_observation immediately reports that same exhaustion.
Fix: project terminal observer failure into the common report with original cause, cleanup/capture uncertainty and last known evidence. Reserve diagnostic capacity before exhaustion or read already persisted local receipts without pretending fresh native observation occurred.

## Same classes elsewhere

- Shared run-controller fatal-stop/force gate affects every harness using this controller.
- Shared daemon-operations and run-control terminal operation reconciliation affect all adapters producing observation-loss receipts.
- Grok's missing timeout is directly reproduced, not merely suspected.
- Codex, Grok and OpenCode daemon stop publish clean=true/_shutdown before subsequent async resource retirement. Their external socket/process checks mitigate some paths; durable operation replay must not treat early clean acknowledgement alone as physical exit. Native behavior equivalent to ZCode is not asserted without tests.
- runtime-scope-stop reuses a deterministic stop operation ID and only inspects it thereafter; a terminal tree_not_settled failure has no retry-after-new-evidence route. run-control has a limited :finalize path, so the two owners differ.
- Generic stopProcessGroup deliberately fails closed for surviving leaderless groups. That prevents unsafe signaling but needs a caller-visible reconciliation outcome; it is not successful cleanup.
- Fork start comment says preparation lock is released first, but startForkedExecution is still called within withRunnerLock callback. No deadlock was established: the continuation uses another lock and fork-010 launched. Keep this as an ordering/documentation issue, not the incident root cause.

## Implementation/verification shortcomings

The original fork-009 plan was not fully implemented despite the previous completion report: native request correlation, cursor replay, persisted request budgets and the whole-RUN stop integration are missing. beta.65 was launched before subsequent stop/diagnostic edits; that run cannot validate beta.68. Later versions still contain the defects above, so another run on beta.68 alone is insufficient.
The quiet test proves only that an RPC remains pending. The stop test with an empty Session list and a mock close clearing activeProductive does not cover native close failure, detached backend descendants or the controller force gate. The updated timeout source-regex test enshrines a whole-turn limit contrary to the plan. The failed-fork test asserts one launch but does not wait for final settlement despite its title.

## Required order for the next repair

1. Correct shared timer ownership/policies and exact request/session correlation; cover Grok and ZCode with deterministic event replay.
2. Implement native backend retirement in zcode-acp and integrate fatal whole-RUN control, including cooperative failure and surviving descendants.
3. Reconcile timed-out original operations using late terminal/physical-stop evidence, preserving at-most-once dispatch.
4. Persist validated bounded diagnostics and budgets; unify observer terminal/report projection and scope-stop retry semantics.
5. Test the real failed-controller path end to end with fake native processes (including distinct process groups), then one bounded live cancellation probe. No full repeated release gates.
6. Freeze one final engine artifact and only then create a fresh fork from the verified CODE-entry checkpoint. Preserve fork-010 as incident evidence.

No implementation or live lifecycle mutation was performed in this investigation. The audit covers the identified lifecycle/timer/identity/reporting paths; it is not proof of absence of all defects in the repositories.
