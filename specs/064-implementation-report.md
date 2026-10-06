# Plan 064 — implementation and verification ledger

Scope: tooling/flow ownership only. Historical EVALs, product code, provider
Sessions, global installations and live runtime homes were not modified.
Live E2E acceptance is a separate task; this report does not claim a successful
full native flow from offline tests.

## Implemented contracts

- Hot maintenance opens existing RUN storage read-only and the prepared resource
  writer without migration/DDL/WAL setup. The same absolute deadline reaches
  routing, preparation, writer acquisition, SQL and cleanup.
- Renewal returns the committed expiry and registration binding. Existing
  boolean service callers remain compatible; productive monitors consume the
  receipt, not a guessed TTL. Same-token expired active owners may renew.
- One shared bundled policy: 30-second uncertainty episode, attempts including
  cleanup bounded to 5 seconds, 250/500/1000/2000-ms capped retry. Capacity waits
  are not an ownership uncertainty episode. Explicit loss and programming errors
  are not transient failures.
- Finish and exact-owner resource cleanup are atomic; terminal replay can repair
  incomplete settlement without deleting another owner's claims.
- Dispatch intent keeps its immutable hash and records prepared/external-effect/
  receipt phases with owner/generation CAS. A prepared request can continue with
  its original ID; a potentially dispatched or legacy request is observation-only.
- Daemons scope caches by resource home, ID and token; productive boundaries check
  all retained provider leases. Failed pending renewal is followed by a fresh
  attempt. Closing drains renewal before finish.
- Controller/control/scope/check/MERGE owners distinguish unconfirmed ownership
  from loss. Transient renewal does not immediately kill admitted work. Unknown
  ownership cannot authorize another productive mutation or native cancellation.
- EVAL observer renews independently while waiting for Subject/Judge. Baseline
  and observer maintenance use helpers from the selected runtime's portable alias
  or direct installed CLI layout. Missing assets fail compatibility; no global or
  cross-repository source fallback is permitted.

## Defect-to-regression map

| Defects | Implementation / runnable regression |
| --- | --- |
| L1–L3 | database/context/CLI prepared maintenance; `managed-process-maintenance.test.ts` cold two-store writer contention, absolute deadline, cached/nested scope, missing/incompatible store |
| L4–L8 | managed daemon policy/guards and authoritative receipt; `fixtures/managed-daemon.mjs`, `managed-lease-monitor.test.ts`, maintenance admission/fingerprint scenarios |
| L9–L10 | bounded role-specific monitors; admitted check retry and controller uncertainty retention regressions; no RUN-stop on unconfirmed ownership |
| L11–L12 | atomic finish/replay and closing drain; maintenance rollback/resource-delete injection and daemon pending-close tests |
| L13 | `runtime-maintenance.test.mjs` long-await heartbeat/single-flight, invalid receipt/fatal outcome, pinned helper requirement; background observer integration fixtures |
| L14 | MERGE renewal deadline/timer containment and expired-candidate owner/state/token/expiry CAS; existing MERGE integration scenarios |
| L15 | independent primary/persistence/settlement handling; adapter recovery and owner cleanup suites |
| L16 | shared bounded maintenance transport and physical-cleanup poison; native hook/managed daemon timeout regressions |
| L17 | adapter prepared/external/receipt phases; `run-controller-adapter.test.ts` retained prepared ID and completed receipt/no-replay scenarios |
| L18 | full operation/Session/daemon/prompt registration fingerprint comparison; maintenance same-ID conflict regression |

## Original implementation verification status (superseded source)

Final runtime source: `ce67caeac22e92fa11cb802bc7f695c2e3c58f27`, branch
`fix/064-managed-lease-renewal`, version `0.9.0-beta.125`.
EVAL implementation: `7ccc82f`, branch `fix/064-managed-lease-eval`.
Both implementation branches are pushed; the report is committed separately.

Final candidate lives at `/tmp/dd-flow-plan064-release.X1n4Iv` and is installed
only in that directory's `consumer` prefix. No global installation is changed.
The source tuple is frozen while its required suites run. Final receipts below
are updated only after their complete runs; earlier interrupted, superseded or
load-timed-out runs are not PASS.
Tarball SHA-256: `cb8ffb1afc6a6f6ac9e5ff60d7a1901370795dd2f22b528b70a020a5a4d6020d`.

## Additional defects caught during implementation verification

1. Stable registration IDs were accepted by the service but omitted from the
   public CLI inventory. The common inventory now exposes optional `--id`;
   a real cold CLI regression verifies exact registration and duplicate rejection
   without replacing another token.
2. In-process heartbeat timers sampled once rather than retrying during a long
   native await. All four owner consumers now join one bounded background retry;
   closing cancels the deferred retry without aborting admitted native work.
3. Callback failures could disappear after background renewal. They are retained
   and fence later productive work. The controller's idempotent MERGE keepalive
   runs after the resource COMMIT, under the same attempt deadline, and acquires
   no RUN writer when no dispatch claim needs renewal.
4. The new ordinary mutation guard rejected an already accepted sealed recovery.
   Lease boundaries reuse the recovery-aware launch guard, checking exact owner,
   generation and control/recovery identity. Normal productive guards remain
   unchanged. Installed-runtime EVAL recovery reproduced the failure before the
   fix and continued to the next stage after it.
5. A late committed success could reset an elapsed uncertainty episode unless
   its caller first queried remaining time. The shared policy now checks expiry
   before every reset; deterministic-clock regression covers this directly.
6. EVAL closing could leave a deferred retry alive or admit a response arriving
   after closing. Delay cancellation, pre/post-RPC closing and budget gates now
   prevent both. Admission requires `ok`, `admitted` and the exact process ID;
   altered/malformed receipts are fatal, not retryable.
7. Positive readiness fixtures mixed protocol assertions with short wall-clock
   deadlines. FIFO/cancel fixtures now wait for an observable queue barrier;
   two-home preparation has its own bounded readiness budget. Short timeout,
   persisted expiry and negative writer-boundary tests retain their budgets.
   Synthetic runtime fixtures now carry the authoritative receipt ABI rather
   than generic `{ok:true}` responses.

## Original acceptance receipts (not receipts for the reviewed source)

- Typecheck and canonical build: PASS.
- Complete EVAL suite using a real installed runtime: 452/452 PASS, no skips.
- Final installed cold-maintenance target: 7/7 PASS.
- Release contracts: 2 Node tests and 8 Vitest tests PASS on the final source.
- Integration shard 1/4: 804/804 PASS on the final source.
- Integration shard 2/4: NOT PASS. CLI and runtime-cutover cases progressed
  successfully, but recovery fixtures exceeded their 45/90/120-second readiness
  limits and cleanup hooks. The failed run was stopped; shards 3/4 and 4/4 were
  consequently not executed. No incomplete shard is a release receipt.
- Isolated recovery recheck: exact accepted-recovery guard PASS (24.5 seconds),
  two-home preparation again exceeded 90 seconds. Read-only inspection showed
  no controller operations yet during preparation, before the tested admission
  boundary. Host load averages were approximately 61–66; even diagnostic commands
  suffered multi-second scheduling delays. This does not prove an additional
  runtime defect, nor does it establish complete acceptance. Production budgets
  were not enlarged to hide this result.
- Final runtime-sensitive recheck: NOT PASS; Droid daemon wrapper exceeded its
  30-second subprocess budget after three successful internal cases. The run was
  stopped after the failure. Earlier direct Droid fixture was 6/6 PASS, but that
  does not substitute for the required complete suite.
- Candidate acceptance remains BLOCKED on complete integration/runtime-sensitive
  suites on a suitably available host. `candidate.json` remains `built`, not
  `accepted`; no fabricated release receipts or publication occurred.
- Live scored E2E, publication and global installation: NOT RUN, outside scope.

## Implementation review — 2026-10-03

Verdict: the original implementation did **not** fully satisfy W2–W6. The review
checked the plan against storage, daemon, controller/control/scope/MERGE and
EVAL consumers, used three independently scoped reviewers, and rechecked their
production diffs and focused regressions. The following substantial defects
were corrected, without changing product code or historical runtime artifacts.

| Finding / plan boundary | Root cause and correction | Regression |
| --- | --- | --- |
| R1, W3/L4–L6 | Daemon's 60-second timer made one attempt, longer than the 30-second uncertainty episode. It now joins the shared bounded retry during a long native await; closing drains it. | `fixtures/managed-daemon.mjs`: background recovery without productive caller; closing during deferred retry |
| R2, W4/L17 | A saved `receipt_observed` was ignored after controller crash, especially for Session creation without a recovery journal. Reuse the exact input-bound receipt, validate Session identity, and settle through existing owner/generation CAS; malformed receipts cannot fall back to a different journal result. | `run-controller-adapter.test.ts`: prompt/create receipt, replacement owner, invalid Session; zero native replay |
| R3, W4/L14 | A post-await MERGE failure UPDATE could overwrite a replacement dispatch. Both success-without-stage and error settlement now require the retained status, owner, token and current recovery generation. | `merge-server.test.ts`: replacement during prompt, replacement plus error, generation fence plus error |
| R4, W4/L9–L10 | Inner control/scope native and publication boundaries checked intent but not the worker lease after long awaits. A process-local owner assertion now checks the exact lease and intent at those boundaries; workers reconfirm before post-await publication and after synchronous snapshot/capture work. No asynchronous renewal is introduced inside a SQLite writer. | `run-control-admission.test.ts`, `runtime-scope-control.test.ts`, `runtime-scope-resume.test.ts`: loss before next native action, drain or release |
| R5, W5/L7–L8/L18 | Baseline trusted registration/confirmation/admission envelopes and could release the command gate on an unrelated receipt. One binding predicate checks ID, kind, owner, operation, home, role, owner PID, budget and absence of unrelated RUN/work/check scope; confirmation also requires the same token, child PID, running state and future committed expiry; admission requires exact ID and positive acknowledgement. Timeout reconciliation uses the same predicate and retains the original error on malformed inventory. | `baseline-admission.test.mjs`: 16 malformed/foreign variants, exact phase-call sequences, no productive command |
| R6, W5/L16 | A visible committed observer registration could be adopted while its mutable maintenance child had no exit proof. `cleanup_unconfirmed` now fences reconciliation before any follow-up writer/admission. | `runner-control.test.mjs`: committed registration plus unresolved physical cleanup; foreign registration remains untouched |
| R7, W2/W5/L11–L12 | EVAL accepted a missing/negative finish acknowledgement as successful settlement. The pinned maintenance helper now requires `ok=true`; existing cleanup handling retains this as a secondary failure rather than replacing the primary error. | `runtime-maintenance.test.mjs`; daemon false-finish regression retains closing gate |
| R8, W6/L16 | Native-hook diagnostics did not cover the actual maintenance CLI child. Scoped, bounded stderr records now expose RUN/resource open/validation/writer/commit/ack, committed expiry and wrapped SQLite code. Parent queue/fresh/join context is bounded; request-local subscriptions cannot mix concurrent in-process requests. Ordinary CLI stderr compatibility is retained without a bounded request deadline. | `runtime-maintenance-diagnostics.test.ts`; actual installed cold CLI and timeout allowlist checks |
| R9, W6 | A released nested savepoint emitted a durable COMMIT phase even when the outer transaction rolled back. Only an outer SQLite COMMIT emits this evidence. | `runtime-maintenance-diagnostics.test.ts`: real nested write followed by outer rollback, then genuine commit; existing storage after-commit/writer tests |
| R10, W6/primary error | Installed-package verification caught JSONL diagnostic phases followed by a pretty error envelope being classified as generic `native_hook_failed`. Both shared runtime and EVAL CLI parsers remove only recognized phase records before parsing the whole envelope; diagnostics never count as error receipts. The old 64-KiB stderr tail also truncated legal pretty receipts (real `errorRecord` approximately 73 KiB); it now uses the existing 1-MiB stdout protocol bound. Arbitrary chatter is not stripped or scanned for brace substrings. | `fixtures/hook-runtime-boundaries.mjs`: real bounded subprocess preserves code/cause/details plus allowlisted phases, legal large receipt; `process-json.test.mjs`: leading/trailing phases preserve primary, retryable and cleanup |

### Reviewed source and verification boundary

- Flow commits: `1df23be` (R1–R9), `b6fb997` and `557def8` (R10); final source
  `557def86f7c6dcddb2e5369687163ea08d8a2e0b` on
  `fix/064-managed-lease-renewal`, version `0.9.0-beta.125`.
- EVAL commits: `5f7ea70` (R5–R7), `69451bd` (R10); source
  `69451bd20c8d0ef7cce26dbb369edd29a0e2acfe` on
  `fix/064-managed-lease-eval`. Report/plan documentation is committed separately.
- Canon unchanged: 4.1.2, `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Intermediate candidate `/tmp/dd-flow-plan064-review.cNmfBn`, source `1df23be`,
  caught R10 in a genuine installed-runtime baseline test (10/11, **NOT PASS**).
  It is superseded, not accepted; its source/bytes are not silently replaced.
- Final reviewed candidate: `/tmp/dd-flow-plan064-reviewed.tOcYzM`, installed
  only in its `consumer` prefix, source `557def8`, tarball SHA-256
  `fff4ad803086620cada50bdc929285a4196b80e90027801836968e7aca7e64f3`.
  Strict canonical build and frozen pack PASS. The candidate remains `built`,
  not `accepted`. Neither targeted tests nor the original 452/452 EVAL run
  establish complete acceptance of this new source.

### Review test ledger

Completed checks during review (counts are separate suites, not a unique total):

- Typecheck and canonical build: PASS on reviewed changes; final frozen build
  is checked again for the candidate.
- Full controller adapter: 11/11 PASS.
- Full direct managed-daemon fixture: 23/23 PASS, including physical single-flight
  and background renewal/closing. This does not substitute for the 30-second
  runtime-sensitive wrapper suite.
- Full MERGE suite: 17/17 PASS; six new ownership scenarios and eight existing
  source-only control/scope scenarios also PASS.
- Control/admission plus initial diagnostics: 28/28 PASS; final diagnostics,
  including nested rollback: 4/4 PASS.
- Runtime budget/processes/lease monitor plus initial diagnostics: 55/55 PASS.
- Storage after-commit/writer contracts/access: 23/23 PASS.
- Baseline + runtime maintenance: 11/11 PASS; malformed binding case covers 16
  variants. Affected detached observer/control scenarios: 4/4 PASS.
- EVAL CLI parsing/error tests after R10: 14/14 PASS.
- Bounded subprocess failure/timeout diagnostics after R10: 2/2 PASS.
- Final small/large pretty-error subprocess regressions: 2/2 PASS. An intermediate
  combined run did not pass: host scheduling exhausted the positive 2-second
  probe and the initial large fixture was only 63 KiB. The new error-parsing
  probes use the transport's existing default budget (not a production change),
  and the legal large fixture is checked to exceed 64 KiB. The original timeout
  fixture and all production timeout budgets are unchanged; its earlier PASS
  is not an assertion that the failed combined run passed.
- Release contracts on R1–R9 source: 2 Node + 8 Vitest PASS.
- Final installed cold maintenance: 7/7 PASS, including actual child storage
  phases/expiry/no-token diagnostics. Final installed EVAL baseline/maintenance/
  process-json run: 24/25, **NOT PASS**; ordinary register/confirm/admission
  succeeded, then baseline finish exceeded its existing 5-second transport
  budget (`process_maintenance_timeout`, approximately 4519 ms, effect unknown).
  This is not the previous typed-error parsing failure. No production budget
  was raised; the final error-boundary recheck is recorded separately below.
- Standalone installed baseline recheck: **NOT PASS**. Registration and its
  read-only inventory reconciliation both exceeded the existing transport
  budget; the retained primary is `process_maintenance_timeout` (approximately
  4715 ms), not `native_hook_failed`. Only parent request evidence was retained
  on the primary failure, so the precise delayed child phase is not established.
  Read-only host observation: load averages 49.19 / 42.55 / 38.47. This is evidence
  of substantial host load, not proof of the exact timeout cause. Further repeated
  load-sensitive attempts were stopped; no release acceptance is claimed.
- Historical broad integration/runtime-sensitive gaps above remain unresolved
  acceptance evidence, not a proven new runtime root cause. Full required suite
  set must run against one frozen final tuple before release acceptance.
- No publication, global update or new scored E2E was performed for this review.

Ponytail check: use existing bounded retry, receipt journal, owner/generation CAS,
process-local assertions and `diagnostics_channel`; no telemetry database, new
retry framework, global parser dependency, broader permissions or weakened
ownership/deadline policy were added. All fixes target demonstrated failure
boundaries, not cosmetic cleanup.
