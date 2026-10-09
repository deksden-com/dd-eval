# 078 — Operation progress and native creation reconciliation

Status: implemented; follow-up review fixes verified by affected regressions. Full offline/release and live acceptance remain separate milestones. 2026-10-09.

Readiness review: design decisions below are binding; the original implementation
receipt below is historical, not evidence that the follow-up review found no
defects. No open user-facing policy choice is required.

## Goal and boundaries

Healthy native operations must not fail because a disposable socket client
cannot see their progress. Lost acknowledgment must not duplicate native work.
Apply the contract to all bundled harnesses, Subject/coordinator, external
workers, qualification, Interaction Judge and Final Judge. Product changes,
historical EVAL repair and unrelated timeout rewrites are outside this plan.
Do not replace the silence timeout by a larger lifetime limit or disable it.

## Evidence and confidence

CP-210 parallel SPECIFY attempts:
- Luna Decisions EVAL-20261008200524-b1cd04bf.
- JEV EVAL-20261008200526-9b087dcd.
- Judge-only EVAL-20261008200525-050c331c.

All failed before a native Turn, with daemon_timeout on session.create.
All original daemon operation receipts are completed, contain distinct native
Session IDs, and have settled creation receipts. Creation request/result UTC:
Luna 20:12:03.754/20:12:32.698; JEV 20:12:03.964/20:12:32.408;
Judge-only 20:12:03.678/20:12:32.488. thread/start itself took about 5.3s;
roughly 23s preceded dispatch. Admission/lease checking precedes action in
durableDaemonDispatch; no per-phase timestamps establish the exact slow call.
Parallel load is a possible trigger, not a proven SQLite contention cause.
Current source and pinned beta.125 contain the relevant defective paths.

## Code inventory and additional findings

Engine src/harness-runtime/lib:
- dd-codex-daemon.mjs: callDaemon observes only socket buffer growth; server
  sends one final reply after durable dispatch and settlement.
- dd-agy-daemon.mjs, dd-grok-daemon.mjs, dd-opencode-daemon.mjs,
  dd-zcode-daemon.mjs, dd-droid-daemon.mjs: same socket-only progress pattern.
  These are exposed sibling paths, not six independently observed incidents.
- daemon-operations.mjs: journalDispatch persists native outcome before
  completeBudgetOperation and writeSettlement; final response conflates them.
- managed-daemon.mjs: admission and release-turn are subprocess bookkeeping;
  release must remain authoritative before another productive operation.
- adapter-timeouts.mjs: native-work/control policy is shared, but individual
  clients still special-case session.prompt. Control does not imply short work.
- dd-codex.mjs: request uses observedTimeout without a progress callback;
  create, read, resume and start require operation-specific native evidence.
- observation-clock.mjs and operation-errors.mjs are existing shared contracts.
- run-controller.ts: Session ID is saved only after adapter success; create
  acknowledgment loss can leave controller identity empty despite native effect.
- merge-server.ts: separate MERGE launcher retains create_operation_id but
  saves native Session ID only after adapter success; it also has a ZCode-only
  180-second create wait. Cover this caller explicitly; longer waits are not
  a replacement for original-ID reconciliation and operation progress.

EVAL lib:
- runner.mjs callDriver already reconciles observation loss via original ID;
  reuse this behavior, do not add another retry layer per Judge.
- driver-recovery.mjs recoverDriverReply calls clock.sample without progress;
  an actively progressing retained operation can exhaust this recovery window.
- recoverDriverReply returns completed result without checking settlement;
  distinguish outcome recovery from permission for next productive dispatch.
- daemon-operations.mjs reads requested/result/observation-lost/settlement.
  Extend this reader compatibly rather than introducing a second operation DB.
- Qualification recovery and Judge cleanup consume retained operations too;
  explicitly verify their outcome/settlement semantics remain correct.

## Implementation sequence

### 1. Freeze identity and define observable progress

- Retain one operation ID before dispatch; bind operation, params digest,
  daemon incarnation, owner/generation and session when known.
- Add a small progress record to the existing operation directory, published
  atomically through existing writers. Use monotonic sequence and observed_at,
  phase and bounded metadata; no credentials, prompts or full provider payloads.
- Events: operation accepted, admission state advanced, native dispatched,
  correlated native progress, native outcome retained, settlement phase advanced.
- No progress for generic daemon heartbeat, repeated queue denial, polling,
  arbitrary stdout, unrelated session activity or identical phase rewrites.
- During a healthy capacity queue distinguish confirmed waiting from native
  silence; cancellation/fence/dead owner still terminates waiting. Do not turn
  periodic admission polling into proof the model works.
- Reuse ObservationClock sleep/gap behavior and durable remaining-window state.
  Restarting observer must not grant a fresh window for the same silence episode.

### 2. One shared daemon observation path

- Reuse original operation directory to observe progress and native result
  during final-only socket waits. No new streaming socket protocol is required.
- Share the small reader/wait helper across six clients; preserve native
  serializers and harness-specific request contracts.
- Before reporting silence, inspect the retained outcome for the exact ID.
  Completed failure preserves primary native error; completed success retains
  identity; running/unknown remains observation loss, never safe-to-replay.
- Control requests without a durable productive record retain a bounded
  transport wait. Validate durations and clean up timers/listeners/read handles.
- Reuse nativeOperationWait everywhere; remove divergent hardcoded decisions.
- Corruption, binding mismatch, daemon replacement or missing post-dispatch
  evidence fails closed. Do not synthesize successful receipts.

### 3. Preserve outcome and settlement as distinct facts

- Keep native result durable immediately after action, as today.
- Recovered creation can restore Session ID even if settlement remains pending.
- Do not return an actionable ready receipt or dispatch another Turn until
  matching settlement is confirmed. Native success with pending bookkeeping
  is pending/reconciliation, not native failure and not full success.
- Settlement failure includes retained native outcome and primary/secondary
  errors. Recovery performs only idempotent remaining bookkeeping, never action.
- Serialize owner-bound bookkeeping and honor shutdown generations; an older
  release cannot free a newer Turn. Retain existing ownership fences.

### 4. Reconcile every caller before failure/cleanup

- run-controller.ts and shared harness session/worker launch paths: persist
  original ID before create; recover exact receipt after observation loss;
  restore Session ID, then await settlement and proceed without new thread/start.
- Include merge-server.ts, including standalone MERGE and its ZCode-specific
  wait, not only controller-managed stage transitions.
- Enumerate all create/fork/start/resume callers under engine src and EVAL lib
  with rg; record each as covered by shared helper or explicit native exception.
- EVAL callDriver: extend existing recovery with operation progress and explicit
  settlement readiness; apply once to qualification, focused Subject and Judges.
- Never blanket-retry session.create or mark daemon_timeout retryable as proof
  of no effect. Unknown outcome remains an explicit reconciliation blocker.
- Cleanup retains original outcome; known idle Sessions may be retired through
  existing control. Do not erase identity or report cleanup as primary failure.

### 5. Native RPC and observability

- CodexBridge request: supply correlated progress for relevant request/session,
  not every inbound message. Native response identity is authoritative.
- Audit analogous request/wait loops in six adapter libraries and startup waits;
  fix proven missing/misbound progress sources in the same mechanism.
- Keep deferred reasoning at thread/start separate: xhigh applies at first Turn;
  observed low before first Turn is not a model-profile drift defect here.
- Timestamp maintenance request/ack records and include operation ID/phase,
  monotonic durations, native-dispatch flag and outcome/settlement availability.
- Error evidence exposes last meaningful progress, original operation identity
  and recovery result; user report distinguishes native failure from lost reply.

## Verification and acceptance

Use existing Vitest/node test infrastructure and retained redacted CP-210
fixtures. Add cases to operation-observation, managed-daemon-late-ack,
recovery-observation-budget, controller and daemon contract tests:
- Creation longer than silence window with meaningful progress succeeds.
- Native result before expiry plus slow settlement does not become native fail.
- Dropped socket reply is recovered with exactly one native create.
- No progress expires; unrelated events, heartbeat and repeating status cannot
  extend it. Malformed/foreign/stale/future progress cannot grant a new window.
- Crash/restart, late response and daemon incarnation mismatch retain identity.
- Pending/failed settlement prevents subsequent productive dispatch.
- Cancel/shutdown during admission or bookkeeping prevents a later dispatch.
- Recovery does not release another operation's budget or duplicate Turn.
- Parameterized coverage exercises all six daemon clients and real socket
  framing, not just mocked adapter return values.
- Extend native fixture for Codex start success with delayed final acknowledgment;
  use accelerated clocks/barriers, not slow multi-minute sleeps.
- Typecheck, build and affected suites; report unrelated suite failures honestly.

After implementation and review: commit/push engine and EVAL; build/checksum
candidate, update exact checkpoint/contract provenance and runtime qualification
affected by wait behavior. Reuse unchanged Judge task qualification; no full
Judge campaign merely for transport edits. Freeze clean committed profile tree
before launch. Run three new isolated parallel SPECIFY samples at confidence
0.70 (Luna Decisions/JEV/Judge-only), pinned to corrected engine, not beta.125.
Acceptance: all reach SPECIFY done, EVAL finished, cleanup settled, matched
conformance; separate baseline/startup/stage/decision/fallback timing. A provider
failure is reported distinctly and cannot count as repair acceptance.
Historical CP-209/210 attempts remain immutable. New launches require execution
authorization; this planning task does not launch or modify runtimes.

## Ponytail review

Reuse durable operation files, recoverDriverReply, ObservationClock,
nativeOperationWait and current tests. No new dependency, queue service,
generic transport framework, second database, heartbeat-based liveness or
full requalification of unchanged Judge. Minimal shared contract fix first;
do not refactor harness protocols merely for stylistic uniformity.

## Readiness addendum — binding implementation decisions

### A. Reuse existing settlement and cover the outer observer

Further source inspection found settleDaemonOperation in engine
daemon-operations.mjs. Reuse it for remaining bookkeeping; do not implement a
second settlement engine. It must run with original daemon/owner authority,
under per-operation single flight, and reject a changed generation or fence.
The EVAL reader is read-only: it must not call registry mutations itself.
Expose bookkeeping reconciliation via the existing daemon operation inspection
route with an explicit settle option; plain inspection remains read-only.
If daemon is absent, retain pending settlement and block; do not launch a new
provider bridge merely to recover a result.

runHarnessAdapter has an independent outer ObservationClock (default 120s),
with its own diagnostic progressCursor. Fixing the inner 30s wait alone is
insufficient. The same validated operation progress must reach this outer
observer, EVAL callDriver, and recoverDriverReply. User-facing progress messages
and adapter subprocess heartbeats are not liveness evidence. Use structured,
bounded operation-progress diagnostics for the adapter's parent; validate
identity and increasing sequence before advancing its cursor. Stdout remains
exactly one final JSON result; diagnostics go to stderr.

### B. Concrete record and writer discipline

Use operations/<sha256(operation-id)>/progress.json, schema
dd-flow/operation-progress@1, fields: operation_id, daemon_id, operation,
params_sha256, owner_id, generation when applicable, sequence, phase,
observed_at, and optional native_request_id/session_id. Bound record size to
16KiB. Validate against requested.json and the frozen caller binding, not
against a supplied self-description alone. Native outcome uses existing
result.json; progress is never outcome authority.
One daemon-owned publisher serializes concurrent phase/native event updates;
atomic rename alone does not prevent sequence rollback. Ignore duplicate or
decreasing sequences; malformed/binding-conflicting records are explicit
observation errors, not progress. Do not rewrite the record on each poll.
Coalesce high-volume native deltas to at most one durable update per second;
flush outcome/phase boundaries immediately. Preserve latest real event time,
not publication or read time. Reuse bounded native journal cursors where possible.
Read errors cannot silently reset the silence budget. ENOENT before request
publication is pending within the original window, not permission to resend.

### C. Phase-specific waits and exact outcomes

- Admission: confirmed provider-capacity waiting is a separate state, not model
  progress. Continue while its authoritative owner/fence and original queue
  membership are confirmed; maintenance uncertainty uses existing renewal
  policy. A dead owner, terminal RUN or changed generation ends waiting.
- Native request: initialize/start/read/resume each use a request-local silence
  clock. Correlate native response IDs and session-scoped startup events; a
  response for another pending request cannot extend the clock.
- Native Turn: reasoning/message/tool lifecycle signals advance the existing
  Turn clock; explicit terminal error remains authoritative. Do not add a new
  total-lifetime cap and do not count polling as model activity.
- Settlement: retained native success switches to bookkeeping observation,
  governed by existing finite ownership/renewal uncertainty policy. Repeated
  failed bookkeeping attempts do not extend that policy indefinitely.
- Terminal-ready: completed outcome plus settled or explicitly not_required
  settlement permits continuation. Failed outcome preserves native failure;
  pending/blocked settlement yields reconciliation-required with native result.

All readers distinguish completed native outcome from dispatch readiness.
Missing settlement for owned productive work is pending, not not_required.
Completed outcome can be retained after an owner dies, but may not authorize
new work without current ownership. Cancel/fence wins over late success for
continuation; preserve late success only as historical effect/cleanup evidence.
Before final silence classification, perform one last exact receipt read to
resolve result-versus-timer races. No retry or resend is performed by that read.

### D. Compatibility, caller identity and diagnostics

Old progress-less artifacts remain inspectable for historical outcome and
cleanup. Never manufacture progress or reset their observation budget. New
launches require the new contract advertised by the selected runtime; update
loadNativeContracts/capacity-policy checks and contract tests consistently.
Deploy engine and EVAL readers together and pin checksums in the new checkpoint.
Do not accidentally enable new receipt semantics against beta.125.

Persist create/fork/start/resume operation IDs before adapter spawn in controller
state, worker launch receipts and MERGE retained receipts. A observer restart
uses the same ID and binding. If a predecessor outcome is unknown, do not
generate a successor UUID. Daemon startup without an incarnation remains a
distinct bootstrap path; preserve its existing durable launch contract.

Do not broadly change retryable flags for unrelated native failures. These
observation-loss errors must carry native_outcome=unknown or retained success,
effect classification, operation ID and state directory; automatic replay is
forbidden regardless of legacy retryable=true. Preserve underlying primary
failure and secondary recovery/cleanup errors in both engine and EVAL reports.

### E. Test and completion precision

Add an outer-adapter regression: inner operation keeps progressing beyond the
outer silence interval, and the parent neither kills the CLI nor duplicates
native work. Add concurrent publisher ordering, truncated/oversized record,
old-runtime contract rejection, missing settlement, admission queue/fence,
and result-versus-expiry race cases. Exercise creation at elapsed 28–29/30s
with delayed release, matching CP-210, through a real socket and adapter CLI.
Use existing fake-clock/barrier patterns; at least one subprocess/socket test
must verify the mocked clock does not hide transport behavior.

Implementation is complete only after affected deterministic suites, build,
and review pass with all enumerated callers classified. Live acceptance is a
separate milestone requiring authorized runs; if external provider access is
blocked, report implementation complete/live acceptance blocked, not full PASS.
Re-read git status immediately before every paid launch. A campaign/profile
change creates a new committed definition and fresh campaign; never mutate
inputs to a live comparison. Record parallel baseline timing and failures;
load variation is allowed but an infrastructure failure is not a speed sample.

## Completion checklist

- [x] Progress binding and persistence contract implemented.
- [x] Six clients and native RPC/startup inventory covered.
- [x] Native outcome/settlement separation and original-ID recovery covered.
- [x] Subject, workers, qualification and both Judges covered.
- [x] CP-210 regressions and negative/concurrency tests pass.
- [x] Implementation review, commit/push and local build completed.
- [ ] Normal release admission and corrected scored checkpoint prepared.
- [ ] Authorized parallel acceptance runs finish and clean up.

## Implementation review record

Shared `operation-progress.mjs` publishes exact-operation events in the existing
receipt directory; `daemon-observation.mjs` owns socket observation and recovery.
No new dependency or parallel database was introduced (ponytail review).
Admission waiting is separate ownership evidence, never model progress.
Both observer snapshots retain their silence episode; cancellation/incarnation
checks prevent a historical successful result from authorizing new work.

Caller inventory: controller creation and controller recovery use
`controllerAdapter`/`runHarnessAdapter`; external Work, standalone MERGE and
runtime-scope resume use the same outer adapter. External/MERGE creation retains
the recovered native identity even when bookkeeping is pending. ZCode-only
180-second creation overrides were removed. EVAL Subject, qualification,
Interaction Judge and Final Judge use `callDriver` and its frozen runtime
contracts. Historical minimal receipts remain inspectable; new runtimes must
export the operation-progress contract.

Native inventory: Codex and ACP (including Grok/ZCode) use correlated RPC
progress and sliding late-response grace; OpenCode forwards content-scoped
observations; Droid forwards active-Turn observations; AGY forwards correlated
activity. Silent create/read/resume without attributable native events remains
bounded and reconciles the original operation instead of fabricating progress.

Review additionally fixed decreasing/replayed progress, success after daemon
replacement, missing settlement, recovery after observer restart, admission
lease expiry, and progress diagnostics hiding a multiline primary error.
Malformed socket JSON now preserves typed observation loss. An AGY asynchronous
publisher failure cannot reject a successor Turn. Concurrent daemon-stop
callers reuse successful cleanup; failed cleanup remains retryable.
Existing fixture assertions were updated to decode typed errors through the
shared decoder, not parse all stderr as one JSON document.

Verification includes six actual exported socket clients, dropped replies with
one dispatch, native RPC fake-clock regressions, controller/Work/MERGE suites,
EVAL recovery/process suites and contracts loaded from built runtime bytes.
Recorded checks: engine typecheck/build PASS; controller/adapter 41 PASS;
Work/MERGE/adapter/recovery-budget 73 PASS; operation-observation 2 PASS;
native RPC 5 PASS; durable daemon fixture 17 PASS; real-socket fixture 6 PASS;
runtime assets 82 PASS; focused Codex/ZCode native contracts 43/3 PASS;
EVAL process/recovery 87 PASS; selected-runtime contracts 4 PASS and new
operation regressions 7 PASS. Counts overlap between affected suite runs.
One pre-existing oversized-output fixture failed its producer-byte threshold
under host load; isolated rerun passed. This is not counted as live acceptance.

Release/checkpoint preparation and paid parallel comparison are deliberately
not claimed: the corrected engine must pass normal release admission before a
new scored checkpoint is pinned. Historical CP-209/210 artifacts are untouched.

## Follow-up implementation review — 2026-10-09

Three reviewers audited engine receipts/observation, native adapters/outer
launchers and EVAL separately; the coordinator reread their diffs and requested
additional regressions. The earlier implementation receipt did not establish
that all edge cases were correct. Substantial defects found and fixed:

- Cancellation during retained-reply I/O could return late success. Check
  cancellation after asynchronous authority reads and before returning ready.
- Transport/outer-to-recovery handoff could grant a fresh silence/uncertainty
  window. Reuse the same outer clock or its retained snapshot, keep sequence
  high-water, and require genuinely newer event time to reopen exhausted silence.
  An exact late ready outcome is still read first; no native request is resent.
- EVAL could count decreasing/replayed progress, freeze a foreign incarnation on
  its first read, or downgrade failed recovery to historical readiness in catch
  cleanup. Persist frozen binding/clock/high-water and use the same selected
  native authority in every reconciliation path. Include exported session.resume.
- A progress write failure after retained native success lost effect/Session
  attribution. Keep typed original-operation/native-result evidence; auxiliary
  progress never replaces the outcome authority.
- Work/MERGE creation recovery never retried remaining bookkeeping. The shared
  outer launcher invokes the existing original-ID settlement route once, without
  replaying creation; preserve any enclosing physical-observation budget.
- Standalone settlement read process-local generation zero instead of the
  persisted fence and could ignore shutdown. Validate persisted generation,
  daemon incarnation/owner and shutdown; pending outcomes check authority before
  invoking settlement. Missing durable outcome also fails closed for ownerless
  modern productive calls.
- Deferred Codex/ACP publication or activity failures could poison a successor.
  Attribute rejection to the still-current original request/Turn only.
- AGY terminal and Droid lifecycle/tool snapshots could replay progress. Dedup
  within the active generation; include both message and Turn identity. Droid's
  bounded recent history is not a lifetime activity quota: new events beyond
  1,024 entries still advance. Events outside that retained history are not
  claimed as indefinitely provable replays; native sequence IDs are the upgrade
  path if that operational ceiling matters. Store fixed-size SHA-256 fingerprints,
  not 1,024 retained copies of potentially growing tool output.
- FIFO/oversized progress input could block or allocate before validation. Open
  nonblocking, require a regular file and cap progress reads at 16KiB plus one.
  Drain in-flight socket polling before returning; no receipt writes after exit.
- Minimal historical unowned/unhashed receipts with an operation name wrongly
  required modern settlement. Preserve their read-only compatibility; owned,
  generation-bound or digested modern records still require settlement.

Regression quality was also corrected: real socket actions are joined before
fixture cleanup; fake-clock tests synchronize I/O rather than measure scheduler
speed; positive CR framing uses the ordinary subprocess watchdog; framework
cleanup hooks use the existing 120-second test envelope. Production silence
windows were not increased. No new dependency or second state store was added.

The broad EVAL run exposed two additional offline fixture omissions: Judge
cleanup lacked required progress/recovery exports, and supplemental Judge wrote
incomplete daemon identity without modern settlement. Correct the test adapters,
not production authority checks. The supplemental replay test also verifies that
read-only reuse after clean shutdown performs no further native RPC. Operator
fixtures keep their actual UX deadlines and no-late-admission assertions, while
positive multi-process readiness and physical retirement have separately bounded
test watchdogs; elapsed host speed is not cancellation proof.

Affected review checks: current core socket fixture 16/16 PASS, durable daemon
fixture 17/17 PASS, native RPC 10/10 PASS, EVAL operation/daemon 19/19 PASS,
historical HITL recovery 2/2 PASS, required-env native-child proof 1/1 PASS and
CR framing 1/1 PASS. The corrected Judge cleanup fixture passes 6/6, supplemental
Judge passes 17/17 on the final frozen build, and operator control regressions
pass 4/4, with no skips. The coordinator's combined affected
engine run passes 61/61; counts overlap the individual runs. Static typecheck,
strict-canon build, lint and diff checks
were run separately. Counts describe these regression runs, not full acceptance.
The first broad runs began before the final review tree froze: engine tests
overlapped dist rebuilding and were stopped; EVAL lacked required paired-runtime
environment and also reported operator-fixture failures under host load. These
attempts are not a green complete-suite receipt. Full frozen offline admission,
immutable release/checkpoint and authorized live comparison remain unchecked.

Integrate via PR with history-preserving merges: this branch also contains the
preceding maintenance/finalization repairs and qualified comparison provenance.
Preserving their commits is operationally useful; main integration must not be
reported as a new published or accepted engine. Historical EVALs stay unchanged.

### Final cross-layer review findings

The frozen engine run at `3e1c245cf4140a4e9d00629e607c342018dffa96`
completed without interruption: release Vitest 8/8 PASS; integration 2,269/2,272
PASS (132 files, two failing fixture files). All seven-stage harness cycles,
overload continuation and capture/shutdown/unclean finalization scenarios passed.
The three failures were incomplete fake resume receipts and fake ZCode pending
requests lacking their mandatory publication callback. Fix the fixtures rather
than weakening productive receipt or observer-failure requirements. The chained
runtime-sensitive suite did not run after integration failed; it is not a PASS.

Additional confirmed defects require these minimal shared corrections:

- Grok's `session.resume` is an observational `session.inspect` alias, but upper
  engine/EVAL callers classified the raw spelling as productive. This could
  create an unrecoverable client-ledger entry, seek a nonexistent durable native
  resume receipt or reject harmless retained inspection after terminal state.
  Export canonical operation semantics from the existing native wait contract
  and use it before every affected admission, observation and recovery predicate.
  Preserve raw argv/provenance; other harnesses retain materializing resume.
- Invalid native control output could remain `flow_reconciliation_failed` when
  no productive ledger existed, incorrectly permitting provider-failure cleanup.
  Classify malformed output consistently inside `callDriver`, including ordinary
  inspection and Grok's alias; preserve actual typed provider errors.
- EVAL's progress reader used an unbounded `readFile` after its size check;
  concurrent file growth could allocate above the limit. Both readers also
  mishandled valid JSON primitives/null instead of reporting corrupt progress.
  Bound the actual read to 16KiB plus one and require an object. Missing files
  remain absent; malformed records never become heartbeat/liveness evidence.
- Controller crash recovery could accept a modern settled Session receipt after
  daemon replacement or a newer native fence. Apply the existing retained native
  authority helper before recovered productive receipts become actionable,
  including `receipt_observed`. Bind original method/owner/native generation,
  preserve native outcome and reject changed authority without replay. Native
  generation is not RUN/controller generation. Lifecycle start/stop evidence and
  immutable completed ACK replay keep their separate existing caller contracts;
  legacy unowned minimal fixtures must not downgrade a modern missing journal.
- A subsequent independent review found the same downgrade if both native files
  disappeared. Determine modern custody from the existing frozen managed-daemon
  registration as well, not file absence. No new marker ledger is needed.
- Scope Session-load recovery used a cached `settled:true` result without its
  original-operation settlement/fence. Check shared retained readiness before
  marking a materializing load prepared, including cached replay; keep pending
  load evidence and never reissue resume. Grok observational loads retain their
  live replacement/Session checks. Update incomplete modern scope fixtures.

Fresh Session inspection may legitimately release the original budget without
rewriting its settlement file. Its release proof must identify the original
operation (`source: inspection`, matching `operation_ids`) and pass the same
current authority guard; a generic `settled` cannot upgrade pending bookkeeping.
Retained ordinary `inspect/status` intents use the same guarded reobservation
path as Grok's alias. Preserve the first authority error rather than polling it
away as a generic inspection failure.
Controller recovery also consumed only hook `primary_error`, ignoring ordinary
terminal native `error` in a failed/interrupted original receipt. Prefer hook
primary evidence when present, otherwise retain the typed terminal error after
the existing original-ID/method/Session checks. A crashed observer must not turn
a known provider failure into an outcome-unknown blocker or replay native work.

These findings add regressions at native/outer, controller/scope/control and
paired EVAL boundaries; no dependency, replacement ledger or transport framework.
During the frozen broad run the canon checkout advanced only engineering progress
metadata (`6431cdf` to `53c1d25`), with no `dd-flow`, `mbb` or `VERSION` change.
This is not an immutable full release acceptance receipt. Final source checks,
PR integration and subsequent release/live qualification remain distinct.

### Final fixture-contract audit

The final affected engine run at `84b985c1bbe98eb57c301169459ce298357bae18`
passes 261/261 in 12 files. Two new fixture assertions initially overlooked the
outer error wrapper and Grok's pre-retirement inspection; correct their exact
expectations, not production. A later scope fixture failure was a pre-receipt
startup crash caused by a separate one-second provider-PID polling limit.
Replace that file-polling shortcut with an explicit stdlib IPC readiness event,
bounded by the existing adapter observation budget, and distinguish a real
fixture startup failure from its deliberate post-journal lost ACK.

The complete runtime-sensitive run then drained normally: control-worker
26/26 PASS; native contracts 16/20 PASS. Its four failed outer cases exposed
three incomplete positive socket mocks (`adapter-progress`, `agy-adapter`,
`zcode-adapter`) and an outdated Droid cancellation expectation. The positive
mocks must persist modern original-operation outcome/settlement with the
existing `durableDaemonDispatch` and join asynchronous server work before
cleanup. A bare productive socket ACK is deliberately insufficient authority.
The Droid held prompt must attach its rejection assertion before cancellation:
the newer durable fence correctly rejects that old observer with
`operation_cancelled`, even if its native outcome is retained. New work still
loads the same native Session once. Do not remove the fence or swallow a genuine
unhandled rejection.

The sibling audit covered all fixture `net.createServer`, daemon-response and
socket sites. Other bare replies were control/lifecycle calls or intentional
negative observation-loss cases; no additional positive productive mock was
found. These are test-contract repairs, not a new production timeout or a
compatibility bypass. Failed attempts remain diagnostic evidence, not PASS.
