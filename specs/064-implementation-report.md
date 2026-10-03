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

Final source, installed-tarball and broad-suite receipts will be recorded here
after the consistent candidate build. Partial or load-timed-out runs are not PASS.
No package publication or new scored E2E is included in this implementation task.
