# 050 — Observation fences and native hook identity

Status: implemented in dd-flow PR #11 / merge commit
`4d478c7dd9549a5b81ed5cd77d4f04befebf6f1c`; beta.97 release gate and fresh
qualification remain in progress. Readiness review: 2026-09-22.
Date: 2026-09-22. Follow-up to plan 049 and published dd-flow beta.96
(`cb6c669ff3f24115ac0a4d2c04c8877eb8683bc6`).

## Evidence and corrections

Grok CP-134, EVAL-20260922125919-3a21d00b: SPECIFY completed at
13:12:49 UTC; boundary capture began at 13:12:57 and failed at 13:14:58.
The retained boundary receipt has settled native sessions and exactly
`owned_inventory_changed` as its pending reason. Thirteen usage rows during
capture contain the same 1,867,512 tokens and 48 tool calls, with new timestamps.
`observeControllerBoundary` samples SQLite data_version before native inspection;
Grok inspection calls usage ingestion through another connection, invalidating
that version on every poll. The earlier claim of a late-settlement race is
superseded. Later recovery succeeds after shutdown, using retained close receipts.

AGY CP-135, EVAL-20260922125919-d6535aec: real PreToolUse carries conversation
and step (2 and 4), but no executionNum. `handleAgyEvent` requires execution_num
AND step_index. Correct lifecycle commands are rejected before CLI execution.
`stage_entry_nonprogressing` is downstream of `agy_native_call_identity_missing`.
Positive tests manufacture execution_num=1 and miss the provider contract.

Do not resume or mutate these scored runs. Preserve their evidence and frozen
engines. Future qualification uses new homes and EVAL IDs.

## Audit inventory and scope

Paths below are relative to dd-flow-cli. All six bundled daemon dispatch paths
and shared callers of data_version/nativeInventoryVersion were searched.
Confirmed means observed in artifacts or directly established by the call chain;
potential exposure means a regression must establish impact before changing code.

| Surface | Finding | Required action |
| --- | --- | --- |
| services/run-control.ts | Confirmed global DB version surrounds mutating inspect; native inventory also sampled before reconciliation | Two-phase observation and stable final validation |
| services/run-controller-capture.ts | Repeats self-invalidating observation until budget exhausted; coarse pending reason | Consume corrected observation; retain precise change category |
| services/runtime-scope-control.ts | Inventory sampled before cancel/inspect and checked after; expected changes can invalidate drain | Separate intentional mutation from final proof; regression |
| services/runtime-scope-resume.ts | Pre/post inspect inventory checks in prepare/release/retire paths | Apply same observation ordering without weakening generation checks |
| services/run-recovery.ts, run-recovery-runtime.ts | Consumers of settlement and immutable capture | Regression for live idle versus retained clean shutdown |
| lib/daemon-operations.mjs | session.inspect releases budget observations; therefore observation has reconciliation effects | Keep reconciliation before final fence; verify idempotency and failures |
| lib/dd-grok.mjs, dd-grok-daemon.mjs | Confirmed inspect ingests timestamped usage; tracks/persists session and heartbeat | Keep ingestion outside stability window |
| lib/dd-droid.mjs, dd-droid-daemon.mjs | Confirmed inspect calls snapshotUsage/ingest, refreshes topology and process capture | Same treatment; root and children coverage |
| lib/dd-zcode.mjs, dd-zcode-daemon.mjs | inspect has no direct usage forward; closed settlement observations already excluded from owner inventory | Reuse separation; verify open/closed paths and topology updates |
| lib/dd-opencode-daemon.mjs | inspect describes and persists; usage reconciliation occurs on other paths | Verify stable repeated inspect and actual topology changes |
| lib/dd-agy-daemon.mjs | inspect returns receipt; usage forwarded on provider result, hooks update state | Verify concurrent terminal hook/result updates invalidate stale proof |
| lib/dd-codex-daemon.mjs, dd-codex.mjs | inspect checks hook health and native tree; shared reconciliation applies | Verify stable idle inspection and concurrent child activity |
| services/hooks.ts, bin/dd-agy.mjs | Confirmed native/normalized/shared contract mismatch | Phase-specific identity contract and real payload fixtures |
| Other hook entrypoints in hooks.ts and harness bin/plugin bridges | Different provider IDs, aliases, ancestry and phase fields | Contract matrix and paired positive/negative native fixtures; no blanket optional IDs |
| services/usage.ts; storage/database.ts | Timestamp-dependent inserts and project registration; DB initialization can also affect versions | Retain metrics; test duplicate input and no-op DB open, avoid schema writes on observation |
| eval-snapshots.ts, recovery-snapshot-database.ts | Final source/copy validation must still reject actual writers | Keep final verification around immutable snapshot creation |

## Invariants

1. An unchanged idle runtime reaches capture without stopping its provider.
2. Observation cannot perpetually invalidate its own proof.
3. New productive work, ownership/token/generation changes, new children,
   unsettled requests and source changes invalidate the proof.
4. Usage and model attribution survive capture; missing attribution stays explicit.
5. Native hook identity uses fields proven available at that phase; unknown or
   foreign identity remains rejected. No fabricated execution number or caller ID.
6. Replay of one physical call is idempotent; a different call cannot reuse it.
7. Failure reports retain the first causal error and secondary capture/cleanup errors.

## Work packages, in dependency order

### A. Reproduce with existing test infrastructure

- Add a small real-SQLite boundary fixture using Grok inspect and usage ingestion.
  Assert the old implementation fails with owned_inventory_changed while native
  sessions are idle. Include Droid's snapshotUsage route.
- Extract minimal sanitized AGY 1.2.8 PreToolUse/Stop payloads from CP-135 with
  provenance (provider version, event phase, original evidence path). Preserve
  absent fields; remove task content and credentials.
- Feed them through the actual normalization and handleAgyEvent path. The valid
  PreToolUse must currently reproduce the admission rejection.
- Tests must not stub away SQLite writes, budget reconciliation or native field
  omission. Keep fixtures in existing test suites, no new test framework.

### B. Repair shared observation ordering

- Inventory/fence entry: assert exact RUN/scope generation, physical controller,
  dispatch barrier and owner tokens; prevent productive dispatch as today.
- Observation/reconciliation phase: inspect native owners, flush intended usage
  and terminal/budget reconciliation, await their completion. Discover topology
  before accepting its coverage; incomplete evidence stays pending.
- Stable validation phase: re-read the full owned inventory and validate it
  against the inspected identities/topology/results. Capture database/native/
  process versions only after intended writes. Revalidate original fence and
  coverage so an intervening writer cannot be accepted as the new baseline.
- Retain a read-only verification closure for snapshot copying/publication. It
  must not call adapters, ingest usage, release capacity or update process state.
- Reuse the existing observeControllerBoundary/control observer and version
  helpers. Extract one shared helper only for ordering/validation duplicated
  across RUN and scope paths. No new coordinator, database, service or public API.
- Keep database-wide version protection for final copying initially. Do not
  replace it with a partial table hash or ignore all usage writes. If unrelated
  writes remain a demonstrated problem, specify a scoped proof separately.
- Preserve budget limits and cancellation; do not increase timeout to hide a loop.
- Record which category changed (DB/native/process/import/fence), with owner and
  operation identifiers and bounded hashes. Do not dump raw sensitive state.

### C. Apply and verify each shared caller

- RUN stage boundary, final candidate capture, graceful drain, interrupt/stop,
  recovery sealing, scope drain, scope resume preparation and release.
- Expected cancellation/reconciliation changes are completed before proof capture;
  new unrelated changes after that point still fail.
- Validate live daemon and retained clean-shutdown cases separately.
- Test a newly discovered child, concurrent terminal event, owner replacement,
  lost inspect reply, telemetry failure and exhausted observation budget.
- Preserve original terminal error if cleanup/capture subsequently fails.

### D. Correct AGY native identity once

- Document required fields by PreToolUse/PostToolUse/Stop phase using captured
  native evidence. executionNum is optional on PreToolUse; stepIdx must be a
  nonnegative safe integer, alongside trusted conversation and daemon binding.
- Reuse the shared replay/admission checks and existing identity utilities.
  Extract an identity helper only if multiple production callers need it.
- Bind stable call identity to daemon incarnation, confirmed conversation and
  proven native step scope; validate tool/input fingerprint as call attributes,
  not as a way to generate a different identity for conflicting input. Confirm Pre/Post correlation when
  optional execution metadata appears later; late metadata must not rename a call.
- Check step reuse/reset across turns and child conversations with native evidence.
  Do not add current local generation to an old event on receipt: delayed replay
  must not become a fresh invocation. Reject ambiguous identity if evidence cannot
  distinguish it; report that limitation explicitly.
- Keep existing executionNum when supplied and check consistency only where its
  native scope is established. Stop execution numbering is not assumed to identify
  an earlier tool call without proof.
- Preserve child ancestry, project binding, stale-hook checks and changed-input
  replay rejection. Do not make missing identifiers optional for other harnesses.

### E. Cross-harness admission and error diagnostics

- Build an explicit six-harness matrix: native event type, call ID, session/parent,
  turn/step scope, optional fields, normalizer, shared admission and replay key.
- Run captured/minimal native-shaped positive fixtures through each bridge and
  hooks.ts, plus missing identity, wrong owner/parent, duplicate, changed-input
  replay, out-of-order and same-child continuation cases.
- Correct only reproduced mismatches. Native-shaped fixtures must not synthesize
  fields that the provider does not emit.
- Persist trusted admission failures before throwing, with session/event/stage,
  code, phase and no-effect classification. Associate them with the current
  controller turn so old failures do not poison a successful successor.
- Surface the causal error as primary when that turn makes no progress; keep
  nonprogress/capture/cleanup as secondary context. Reuse lifecycle outcome/error
  records, avoid another independent error ledger.

### F. Qualification and operational documentation

- Fast native contract and shared observation regressions first; then affected
  controller/recovery/scope suites, typecheck and lint. Runtime-wide changes require
  the full release gate under plan 045, including immutable package smoke.
- Extend published-engine qualification with actual DB observation and native
  payload admission checks. Static doctor/preflight PASS does not prove these paths.
- Update monitoring runbook: inspect retained boundary pending_reasons, distinguish
  terminal native activity from observer writes; do not infer race from later recovery.
- Publish a new version only after required tests pass; verify tag/commit/canon,
  tarball build-info and installed full-content checksum.
- Prepare fresh AGY/Grok homes/checkpoints preserving source/flow inputs, copying
  portable configuration only. Record exact harness versions and definition commit.
- Start scored runs only after package qualification and preflight PASS. Monitor
  actual stage, HITL correlation, settlement, boundary capture and successor entry.
- On runtime failure investigate read-only; preserve evidence and stop blind retries.
  Update/delete heartbeat according to live runs and terminal completion.

## Acceptance and completion checklist

- [ ] Baseline regressions fail for the demonstrated reasons on beta.96.
- [ ] Idle Grok and Droid capture succeeds with telemetry retained and daemon alive.
- [ ] All six harnesses pass repeated idle observation; actual changes invalidate proof.
- [ ] RUN and scope drain/resume/capture keep generation and ownership guarantees.
- [ ] AGY native PreToolUse without executionNum admits the valid lifecycle call.
- [ ] Missing/foreign/stale/replayed-conflicting identities remain rejected.
- [ ] Cause attribution preserves native admission failure and secondary errors.
- [ ] Required local/package/release checks pass; receipts recorded.
- [ ] Fresh AGY and Grok E2Es cross the previously failing boundaries; full outcomes
      reported honestly, with further runtime defects tracked separately.

## Ponytail review

Use existing fences, observer, replay ledger, adapter dispatch and test runners.
The fix is shared observation ordering plus one AGY contract correction. No new
dependency, telemetry subsystem, generic provider framework or timeout workaround.
Usage deduplication is optional follow-up, not a correctness mechanism: even one
legitimate telemetry write inside a stability window can invalidate it.
Do not refactor unrelated adapter internals. Extract helpers only where multiple
real callers need identical semantics; test through the existing integration paths.

## Implementation record

- The existing `--no-flow` adapter mode is reused as the settlement-observation
  marker; no new protocol, schema, coordinator or dependency was introduced.
- `inspectControlledNativeSession` adds that marker only for RUN settlement and
  cancellation verification. Runtime-scope observation keeps its existing
  semantics because no self-invalidating write was reproduced there.
- Grok suppresses usage forwarding only for marked inspection. Productive turns
  still forward their initial/final snapshots. Droid returns the same measured
  usage but skips ingestion only for marked inspection. Codex/ZCode accept the
  shared flag; AGY/OpenCode already have non-ingesting inspect paths.
- AGY lifecycle admission now requires a nonnegative safe native step. The
  execution number remains validated when supplied but is optional, matching
  the native 1.2.8 PreToolUse payload.
- Regression coverage proves the shared controller emits the marker, ordinary
  Grok/Droid inspection still ingests, settlement inspection does not, and AGY
  admits the real missing-execution shape while rejecting missing step or an
  invalid supplied execution number.
- Confirmed implementation validation: typecheck, lint, release contracts,
  controller/lifecycle 81/81, Droid adapter 15/15, Grok adapter 9/9. The full
  local integration run encountered two pre-existing 120-second mb-upgrade
  timeouts under concurrent live eval load; the clean sharded release workflow
  is the authoritative full gate.

## Readiness review additions — binding implementation constraints

These constraints refine B–F and take precedence over ambiguous wording above.

### 1. Close the observation-to-proof gap

Simply moving initialDatabaseVersion after inspect is NOT an acceptable fix:
it could silently adopt a productive mutation that occurred during inspection.
The entry guard must remain valid throughout reconciliation. Retain entry owner,
generation, dispatch barrier and operation identities. After reconciliation,
rebuild complete coverage and prove that each accepted session/operation belongs
to that same fenced inventory. Unexpected new owners/operations require a fresh
observation pass, not a baseline reset. Newly discovered children need explicit
terminal evidence and coverage before success.

Prefer the existing shared observer's prepare/reconcile/verify sequence. If its
current dispatch barrier does not exclude a productive race, extend the existing
barrier before accepting a later baseline. Do not assume controller status alone
is an exclusive lock. Add a deterministic interleaving test that inserts a writer
between inspect completion and baseline capture; it must never publish a snapshot.

Await every inspection and its telemetry/budget/process reconciliation before
the final fence. With parallel sessions, a late write from session B must not
invalidate or evade a proof taken for session A. No fire-and-forget flushing.
The final phase must have no await or RPC between proof capture and the existing
synchronous copy/verify/publication path unless protected by an equivalent fence.

`eval-snapshots.ts:createEvalRunSnapshot` already verifies before copy and after
sync, before rename. Preserve both checks, source/Git validation, temporary output
cleanup and immutable publication. Snapshot failure must not mark the boundary
completed; crash/replay may reuse only a fully verified published receipt.

### 2. Stabilize only observation metadata, retain ownership changes

Classify fields rather than excluding daemon state wholesale. Lease renewal
timestamps and observation timestamps are not ownership identities; daemon/PID
incarnation, lease token, process state, topology, active request and terminal
receipts remain part of the proof. Test that repeated idle inspect stabilizes and
that owner replacement with the same PID number or same session ID is rejected.
Keep expired/dead-owner checks independent of this timestamp normalization.

`native-session-control.ts:inspectControlledNativeSession` is the shared RUN/scope
adapter boundary and must be included in caller coverage. Test shared budget
settlement failure separately from physical native idle; no capacity release or
snapshot success may be inferred from a partial response or a lost RPC reply.

Telemetry ingestion failure follows the existing completeness/error contract.
Do not relabel lost telemetry as complete or stop a live provider just to capture.
Already accepted telemetry must survive snapshot and restored reporting.

### 3. Separate AGY call identity from event identity and payload validation

The current event hash includes event phase, execution metadata and args. It is
not automatically a cross-phase call ID. Define a stable call key from proven
native coordinates (daemon incarnation, conversation, native step); keep phase
in the event key. Store/check tool and canonical input digest as immutable call
attributes, NOT solely as part of the key: otherwise changed args generate a new
key and bypass changed-input replay rejection. Canonical object ordering must not
turn the same JSON payload into a different call.

Use existing hook/lifecycle records and replay comparison to implement this;
introduce a small AGY helper only where the actual daemon/bridge callers share it.
Do not require PostToolUse input fields absent from its native payload. If it
arrives with fewer fields, correlate through the retained trusted call record.
Unmatched Post must not manufacture a successful admission or productive effect.
Duplicate Post and Post-before-Pre need explicit, bounded outcomes.

Keep omitted executionNum distinct from zero. Reject invalid numeric types,
negative/fractional/out-of-safe-range step values. Verify native conversation
fallback consistency: daemon observation currently can fall back to root while
the bridge forwards raw payload.conversationId; normalization must not diverge
or silently bind an unknown child to root.

Native step-reset/continuation evidence is a gate before finalizing call identity.
If native coordinates can repeat within one daemon/conversation, reuse a proven
native turn identity or retained dispatch binding. Never substitute receipt-time
generation. If evidence is insufficient, retain a precise admission error and
record the remaining limitation; do not claim supported same-child continuation.

### 4. Preserve causality without trusting invalid input

The new AGY rejection happens before shared admission records are created. Record
it only after validating the physical daemon/session/project binding. Untrusted
or malformed input may produce diagnostic output but cannot create authoritative
lifecycle outcomes for another RUN. Do not classify all hook failures as no_effect:
that classification applies to pre-dispatch rejection, not PostToolUse failure.

Associate primary failure with the exact call/turn and successful successor rules.
Test two rejected calls, one successful correction, unrelated sibling success,
and cleanup failure after rejection. Preserve original cause; successful recovery
must not retroactively turn a failed scored EVAL into PASS.

### 5. Concrete tests and delivery receipts

Map coverage to existing suites: run-controller-capture.test.ts, eval-snapshots.test.ts,
run-control-worker.test.ts, run-control-resume.test.ts, runtime-scope-control.test.ts,
runtime-scope-resume.test.ts, runtime-scope-stop.test.ts, run-cli-admission.test.ts,
hook-responsibility.test.ts, runtime-cutover.test.ts and existing AGY/Grok/Droid
adapter fixtures. Select actual cases by behavior; do not duplicate every test
across every suite. This is a coverage inventory, not a requirement to edit every
listed file. Reuse sufficient existing assertions; add only missing regressions.
Use bounded/injected time for timeout cases, not 120-second sleeps.

Required additional scenarios: two simultaneous sessions; live root with terminal
child; late new child; terminal root with active child; same-child second turn;
no-op DB reopen; actual source mutation during copy; crash before/after rename;
historical clean daemon; partial telemetry; exhausted budget remains exhausted
across observer restart unless explicitly renewed under the existing contract.

Before implementation, compare the audited beta.96 files to current target HEAD
and list overlapping changes; work in an isolated checkout. Do not rewrite the
dirty dd-eval checkout or other tasks' adapter work. No runtime schema migration
is planned; if call record changes require one, explicitly define old-record
handling and test it before release. Frozen old engines/homes stay untouched.

Record implementation commits, exact tests/results and source/package identities.
Commit/push definition and runbook receipts before scored launch. Number new
checkpoints from repository inventory, not assumptions in this document. Reuse
the existing release gate and published repair qualification script, and ensure
the new tests are selected by the gate rather than merely present on disk.

The six-harness audit is source/contract coverage, not a claim of six live E2E
qualifications. Required new scored acceptance is AGY and Grok; record fixture-only
coverage for other harnesses explicitly. Overall completion requires their full
terminal outcomes; crossing SPECIFY alone proves only the targeted regression.

## Ponytail full review — implementation selection

The audit and all safety invariants remain required. Audit coverage does not imply
mandatory changes to every harness or shared caller. For each inventory row,
record one disposition: fixed with regression, covered by the shared fix, or
verified unaffected with evidence. Do not refactor unaffected adapters.

Before committing to the broader ordering change in B, compare the two concrete
routes against the failing integration fixture:

1. Make final inspection free of telemetry writes, with required telemetry and
   budget reconciliation completed at an existing earlier boundary. Prefer this
   if it preserves fresh native evidence and complete final usage for all callers.
2. Use the fenced prepare/reconcile/verify ordering described in B when legitimate
   inspection effects cannot be moved without losing evidence or compatibility.

Choose one coherent route, with the smaller verified production change. Do not
implement both, add a public inspect-mode switch, or add a new framework merely
to accommodate the alternatives. A pure final verifier and complete telemetry are
requirements; a particular refactoring shape is not. If route 1 cannot satisfy
the shared budget or topology contracts, record the failing case and use route 2.

For AGY, first establish native call coordinates with the real fixture and apply
the phase-contract correction. Change event-key construction only where replay
and cross-phase regressions demonstrate its current semantics are insufficient.
Keep the documented separation of identity and payload validation; do not create
a general cross-provider identity system or schema migration preemptively.

Tests are behavioral coverage, not a Cartesian product of every scenario and
every harness. Exercise shared race/ownership failures once at the common layer,
plus provider-specific native payload and side-effect paths. Existing crash,
timeout and recovery regressions count if they cover the changed behavior.

Delivery stop condition: demonstrated failures fixed, analogous paths accounted
for, required tests and qualification completed, new E2E outcomes reported. No
optional telemetry deduplication, adapter reorganization or speculative tuning
is needed to declare this plan implemented.

Readiness verdict: ready to execute A–F with the selection rule above. Two evidence gates remain inside
implementation: demonstrate the fence closes the reconciliation gap, and prove
AGY call coordinates across continuation. These are explicit blocking acceptance
checks for the affected change, not permission to improvise or weaken guards.
