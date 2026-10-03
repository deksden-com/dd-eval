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

## Verification status

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

## Acceptance receipts

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
