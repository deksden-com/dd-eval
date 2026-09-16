# CP-108 fork-016: late native creation, lost outcome and blocked cleanup

Status: implementation reviewed and corrected; local regressions verified, live qualification pending; 2026-09-16.

## Follow-up implementation review (2026-09-16)

The earlier completion statement was too broad. Review found and corrected:

- Ordinary native `Error` objects lost custom codes at the ACP SDK boundary.
  The shared converter now returns `RequestError` with structured `data`;
  every native observation-loss code survives outer adapter decoding.
- Lazy-create uncertainty was only in memory. Exclusive per-alias allocation
  records now survive bridge restart, reject duplicate allocation, and fail
  closed on corrupt metadata. A confirmed rejection releases the intent;
  a confirmed identity replaces it atomically. These records are deliberately
  not subject to the legacy alias index's expiry/best-effort behavior.
- A failing allocation callback discarded a received native identity. Identity
  is now registered and persisted before callback execution.
- The eviction reload swallowed unknown native outcomes. Those now propagate
  without authorizing dependent work.
- Registry preparation had a separate 10-second cap despite the advertised
  shared startup budget. It now consumes the shared budget; exhausted budget
  cannot dispatch create.

Regressions cover SDK wire serialization, outer error classification,
restart/no-replay, allocation callback failure, exclusive allocation records,
confirmed rejection, corrupt metadata, and unknown reload outcomes.

Late-allocation follow-up is implemented: the original native request retains
its correlation after the observation/grace deadline. A late successful create
atomically persists its native identity and emits `zcode/session/allocated`.
The outer bridge accepts the notification only for an alias allocated by its
own create operation. The daemon persists the identity in its session inventory
and updates allocation evidence only on the matching active request. It never
recreates a finished request or overwrites another request's ownership.

This path does not resolve the already-failed observation again, apply a
profile, subscribe, send a prompt, or restart the RUN. Duplicate replies are
not redelivered. If the backend dies before replying, correlation is released
and the durable unknown intent remains blocked; no fabricated success or
automatic retry is allowed. Recovery after complete loss of the original
process/response still requires authoritative native evidence, not inference.

Validation: ZCode full suite 823 tests, typecheck/lint/build; outer bridge and
daemon targeted regression tests include matching, finished, and foreign
active requests. Live E2E qualification remains a separate step and was not run.

## Implementation delivered

The plan is implemented across the EVAL runner, the shared RUN controller, and
all bundled native transports. The implementation keeps one durable operation
per dispatch, separates observation deadlines from native effect lifetime, and
never replays a request whose outcome is unknown.

- `dd-flow-cli/src/harness-runtime/lib/{dd-zcode,dd-codex,dd-droid}.mjs` retain
  timed-out requests, journal late replies and transport death, preserve the
  original request/method IDs, bound retained diagnostics, and guard broken
  stdin writes. The ZCode daemon records ACP alias allocation before native
  identity resolution and keeps the create operation recoverable.
- `zcode-acp/src/handlers/session.ts` now keeps a lazy create explicitly
  blocked after an unknown native outcome; a later ACP call reuses that same
  failure instead of dispatching a second allocation. This is covered by a
  direct repeated-call regression.
- `dd-flow-cli/src/harness-runtime/lib/daemon-operations.mjs` and
  `src/services/{run-control,run-controller-adapter,run-controller,
  run-control-worker}.ts` separate productive outcome from physical settlement,
  persist stop/capture receipts, admit a null native ID only for the exact
  create operation, and wait for detached control-worker admission before
  releasing the caller.
- `dd-flow-cli/src/services/code-checks.ts` and `work-registry.ts` make check
  execution fail-closed on real infrastructure errors, preserve gitless
  workspaces, validate safe/renamed paths, and keep project-policy checks at
  their aggregate gate. `src/services/projects.ts` now compares canonical
  filesystem roots at every lookup.
- `dd-flow-cli/src/services/vnext-{plan,plan-review,code,merge}.ts` and the
  shared error/engine/session modules retain structured native causes and keep
  plan, code, recovery, and merge transitions transactional.
- `dd-eval/lib/{runner,eval-resume-worker,daemon-operations,homes,
  recovery-observation-budget}.mjs` (with the corresponding CLI and tests)
  keep EVAL observation separate from provider execution, persist recovery
  evidence, and clean only explicitly selected homes after ownership/active
  process checks.

No manual proof is accepted as a flow check. The only interactive path remains
the explicit HITL pause for a material unanswered question; all gates require
autonomous executable evidence.

The startup optimization was evaluated but deliberately not enabled: the
installed native protocol does not expose a verified public capability contract
for omitting workspace state from the provider-registry update. The registry
call therefore remains required and fail-closed. Likewise, the listener's
timeout retry remains only for the observational `session/subscribe` path; no
productive create/send/fork/resume operation is replayed after an unknown
transport outcome.

## Evidence and conclusion

EVAL root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260915213000-settlement-fix-fork-016`.
Engine: `0.9.0-beta.74`, checksum `38908bc52079b0b510d860a09bb8e96d937be7a6ac71bf63c4c99ae7205af4ae`.
Controller: `DRV-0f25da59-93fa-4ad7-bf81-150ba5cc0044`.
Adapter evidence: that controller's `session-1/adapter.events.jsonl` and `daemon.json`.
Native evidence: `/Users/deksden/.zcode/cli/log/zcode-2026-09-15.jsonl`, lines 11844 onward; correlate by the exact fork workspace, timestamps and session IDs, not neighbouring unrelated native sessions.

The native create DID complete. Failure was reported before its reply could be consumed. No new Subject prompt was sent. Consequently this run did not exercise the previous post-prompt settlement fix. There is no evidence that removing redundant post-turn inspection caused the startup delay; the previous fix left this earlier boundary unhandled.

### Observed sequence (UTC)

| Time | Event |
|---|---|
| 20:28:33.147 | ACP `session/new` returned alias `46872e31-a3f5-4b9e-b0d7-b37379accfa4`. |
| 20:28:33.151 | Adapter called `zcode/session/resolve`, triggering lazy backend materialization. |
| 20:28:43.154 | Native protocol startup completed. |
| 20:28:43.199 | Native provider-registry update started, `includeWorkspaceState:true`. |
| 20:28:44.063 | Bridge's 10-second registry wait expired; it continued to create. |
| 20:28:54.407 | Native registry update actually completed: 11,208 ms, including 10,252 ms building workspace state. |
| 20:28:54.439 | Native `session/create` started. |
| 20:28:59.086 | Bridge returned generic ACP error after its 15-second create wait expired. |
| 20:29:03.520 | Native create completed successfully in 9,082 ms with `sess_3a779d46-324e-46c5-b7d9-f75af26adc1f`. |
| 20:29:04.687 | Controller requested fatal stop. |
| 20:29:12.271 | Daemon stop confirmed physical settlement. |
| 20:31:10.932 | Recovery budget exhausted with provider identity unresolved. |
| 20:31:23.849 | EVAL completed as `recovery_blocked`. |

The registry's temporary app was `sess_66589b8d-2035-4ec1-9e21-e0af13f9d11b`; do not confuse it with the actual created Subject session. Native logs show plugin/MCP initialization, an image_search auth/negotiation failure, and a slow 4,134 ms session snapshot. These are measured contributors/context, not evidence that the model hung or that one plugin alone caused the failure. The exact pre-bootstrap delay is not broken down by available logs.

## Root causes and affected locations (pre-fix)

The following records the behavior found in fork-016 before the changes above;
the referenced paths are the original failure boundaries, not current behavior.

1. **Request wait lifetime is treated as native operation lifetime.**
   `zcode-acp/src/backend/client.ts:request` deletes the pending request on timeout; `resolvePending` silently drops late replies. `handlers/session.ts:ensureMaterialized` then clears `pending.creating` even after unknown outcome, allowing a subsequent use to dispatch another create. The durable daemon wrapper cannot recover a reply discarded by the lower layer.
2. **Structured errors are flattened at protocol boundaries.**
   `handlers/session.ts` loses native details for create, list, send and resume. `handlers/extensions.ts` does the same for close, resident read, fork, goal, compact, background cancellation, thought level, runtime model and mode. `config/options.ts`, `config/model-cache.ts`, and `handlers/slash.ts` contain related conversions. Existing `backendFailure` covers only selected inspection paths and collapses non-timeout transport failures. `dd-flow-cli/.../dd-zcode.mjs` recognizes only `native_timeout`; backend death/pipe loss become generic ACP failure. Shared `operation-errors.mjs` does not classify those transport losses. Thus the native create timeout was journalled as failed, despite its eventual success.
3. **Startup budgets and prerequisites are inconsistent.**
   `syncProviderRegistry` waits 10s, ignores its unknown outcome and proceeds; create waits another fixed 15s including native queue delay. `ensureBackend` returns immediately after spawn. Registry sync asks for a workspace state response it does not use; the actual native default built a temporary app. `resumeBackendSession` retries timeout by issuing another request, based on an unproven cold-start assumption for each incident. Listener subscribe retries are a different, observational case and must not be blindly removed.
4. **Identity is published only at the end of a compound create.**
   `dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs:createSessionWithBridge` holds ACP alias and resolved native ID locally until profile/remaining steps succeed; `dd-zcode-daemon.mjs:productive/track` records the final return. Failure after alias allocation or native creation leaves daemon inventory empty. Retain allocation progress even when required profile verification subsequently fails; never report profile success on failure.
5. **Recovery requires a Session identity even after a verified whole-daemon close.**
   Shared `src/services/run-control.ts` accepts empty-session clean shutdown only when `create_operation_id` is absent. The existing create ID therefore causes permanent `provider_identity_unknown`. The retained-close branch returns its operation ID only inside `receipt`, while terminalization reads `node.operation_id`, causing `operation_terminalization_binding_unknown`. Terminalization also filters productive requests by string Session ID, excluding unresolved create requests with null identity. These paths affect all managed harnesses, not just ZCode.
6. **The same late-reply pattern exists in sibling transports.**
   `dd-flow-cli/src/harness-runtime/lib/dd-codex.mjs` and `dd-droid.mjs` delete pending RPCs at timeout and ignore replies without a pending waiter. The outer ZCode Bridge does likewise. Their error codes already preserve some unknown outcomes, but this alone does not recover late allocation replies. Grok/OpenCode/Antigravity need the same outcome/identity contract tests at their native transport boundaries; this audit does not claim a reproduced late-reply defect in those three.
7. **Transport diagnostics and disconnect handling are incomplete.**
   ZCode backend stderr is ignored at spawn. Native late responses are discarded without an event. `stdin` error sets `readerDead` directly, while `markReaderDead` returns early when that flag is set; pending waiters can remain until individual timeouts. Synchronous write failure removes a pending entry without clearing its timer. `markReaderDead` replaces request IDs with zero. Server-request routing also assumes a matching numeric ID wins even when the incoming message has a method; test opposite-direction ID collisions before relying on that assumption. This collision is a latent issue, not the observed cause here.

## Systemic implementation plan

### A. One retained operation, bounded observation

- Reuse native request correlation and the existing durable operation journal. Separate caller observation timeout from the lifetime of a dispatched native request. Keep a bounded record/tombstone until a reply, confirmed backend death/close, or defined recovery deadline.
- Persist late replies and allocation identity; do not resolve the already-rejected Promise again. Reconciliation consumes the recorded outcome for the original request, and never resends create/send/fork merely because waiting expired.
- Record bridge incarnation, native request ID, method, outer operation ID and ACP alias before dispatch; add native ID immediately on receipt. An alias is not proof of native identity.
- Keep lazy materialization in an explicit unknown state following timeout; subsequent resolve observes that operation. Definitive rejection can allow an explicit new attempt. Bridge restart cannot infer success from a workspace match alone.
- Preserve all native error fields through one shared translator. Distinguish not-dispatched, confirmed rejection, dispatched-outcome-unknown, completed, and interrupted. Transport death after dispatch does not prove failure of the effect.

### B. Avoid unnecessary startup work and conflicting budgets

- Check the installed native protocol's support for `includeWorkspaceState:false`; if supported and proven to preserve registry semantics, use it because sync discards the state response. Do not disable user plugins or change profile implicitly.
- Put startup readiness and request deadlines in the backend lifecycle, using an actually supported readiness signal/probe. Logging `startup.completed` is not by itself a public RPC notification contract. Validate the mechanism before implementation.
- Use one bounded creation deadline covering readiness, required registry sync, native creation and profile application, with remaining time passed to inner waits. Optional evidence stays optional. A timeout in a prerequisite must not silently authorize dependent mutation with unknown configuration.
- Replace timeout-based resume replay with reconciliation unless native idempotency is demonstrated. Keep confirmed busy-rejection retries distinct from unknown acceptance.

### C. Physical closure and productive outcome remain separate

- Normalize fresh/reused close nodes to the same shape, including operation ID and daemon incarnation. Check whether anything needs terminalization before demanding its bindings.
- Use the existing exact owner/lease/PID-birth/daemon-stop proof to settle owned resources after a clean whole-process close, including an allocation with unknown Session ID. Empty inventory alone is never sufficient. Remote/external sessions require their own closure proof.
- Permit null native ID specifically for allocation operations, bound to exact operation and daemon IDs. Preserve original errors; mark interrupted only when the stop proof warrants it. Do not rewrite completed/failed immutable receipts.
- Remove resolved pending reasons on recomputation, preserving unrelated unresolved writers. Recovery captures the stopped state; EVAL still reports the original infrastructure failure.

### D. Retain useful evidence

- Capture bounded backend lifecycle/request summaries and stderr in the EVAL evidence hierarchy with secret redaction. Retain request/response timestamps, queue/start timing when available, late-response handling and linkage to native logs; no credential or prompt dumping.
- Route all stream-death paths through one waiter-finalization function; preserve IDs, clear timers, reject pending observers promptly, and record uncertainty accurately.
- Add fresh-run-only usage/progress alongside inherited snapshot evidence so old tokens/tool calls cannot imply that this new Subject ran.

## Verification and execution walkthrough

1. Fork restore pins engine; capture provenance and select the newest verified checkpoint from the whole lineage.
2. Create intent and alias are durable before native allocation. One native request is dispatched.
3. Delayed startup/registry consumes the declared creation budget. No second create is sent.
4. On observation timeout, original operation remains unknown. A late successful create records its native identity; profile checks then determine readiness for prompt.
5. On definitive rejection, retain rejection and enter controlled cleanup. On backend loss, preserve uncertainty and stop owned resources.
6. Clean close with null native ID settles exact owned resources; matching outstanding allocations become interrupted as warranted, and recovery capture can finish. Foreign/live processes still block.
7. If create and profile succeed, prompt proceeds; completed prompt plus failed bookkeeping uses the beta.74 settlement path without replay.

Required focused regressions: registry completion after first wait; create success after timeout with exactly one native dispatch; repeated resolve during unknown create; profile failure after native allocation; backend death before/after write; late reply after stop; PID/incarnation mismatch; empty-session clean close with create ID; fresh versus reused close receipt; null-ID allocation terminalization; unrelated live writer; code/detail retention across all handler families; no new prompt after timeout/stop. Use deterministic fake backends for delay/order cases and one native startup smoke after integration, then the controlled E2E. No repeated full qualification matrix.

## Verification result

- `dd-flow-cli`: build, typecheck and lint pass; the final complete Vitest
  rerun passed (60 files, 713 tests). An earlier fixture used a stale shared
  `/tmp/flow` writer contract; it now creates an isolated home and the
  previously failing runtime-service test passes. The focused recovery,
  controller-stage, vNext, check, hook and native-adapter suites are green.
- `zcode-acp`: build, typecheck, lint and the complete suite pass (56 files,
  812 tests). The suite includes the retained-request, transport-error and
  repeated-unknown-create regressions; `session/resume` has no timeout replay.
- `dd-eval`: complete Node test suite passes (260 passed, 8 intentionally
  skipped). New coverage includes durable observer recovery, fork admission,
  cleanup ownership, retained outcomes and monitoring projections.

The implementation is ready for the next controlled E2E. The native startup
smoke and E2E are intentionally not counted as unit-suite evidence and should
be run once against the selected Luna/ZCode profiles.

## Preparation mistake and next checkpoint

The previous launch incorrectly reported plan-review as the latest usable entry. `runner checkpoints` now confirms a newer code entry in fork-009:

- Parent: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260915010000-plan-review-fork-009`
- ID: `plan-review-9493dd79385985f244d7c0e6f7d5a02b6747c8c7412f433c4207442dc3257499`
- Stage: `code`; created `2026-09-14T22:58:04.541Z`.
- Manifest hash: `2339d0d43a133a74ce80dd7fcc19928cd661c5a13588f8c3323c405776e83816`.

Use the existing registry/lineage to enumerate candidate checkpoints before selecting one. The selection mistake did not cause this startup failure, but would have repeated plan review unnecessarily. Full fork admission must still validate the selected source definition and artifact before launch.

Monitoring also reported this failure much later than its native timestamp: completion was 20:31 UTC, the delivered heartbeat was 21:41 UTC. The available evidence does not explain that scheduling delay. Treat app heartbeat as supplemental reporting, not an enforcement deadline; the runtime already stopped locally. Do not promise a hard six-minute notification SLA.
