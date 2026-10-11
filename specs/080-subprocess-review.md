# Plan 080: subprocess and observation review

The startup policy is an inactivity policy, not a maximum operation lifetime.
Bootstrap uses 120 seconds until a real milestone; ordinary control silence uses
30 seconds. Explicit caller windows win. Native productive Turns retain their
existing durable inactivity owner. Setup JSONL is bound to the operation, ordered,
deduplicated and bounded; polls and heartbeat timestamps cannot renew it.

## Changed paths

- Runtime and EVAL bounded JSON/text transports preserve clock state, inactivity
  versus observation gap, child exit/signal and the original nested error.
- CLI ingress reports imports, all six daemon starters observe retained native
  milestones, and doctor/version probes report actual completion. ZCode binary
  identity is streamed, not read into one large buffer.
- Engine install/doctor/bind/fork dependency checks are asynchronous. Static
  resolution does not run hidden subprocesses. Routing explicitly admits a
  selected external engine. Bind/fork revalidate retained identity before writing.
- Worktrunk download, archive listing/extraction/version, worktree bootstrap,
  selected-file lint and dashboard viewer probes use the shared async transport.
  Download progress is increasing archive bytes, not repeated status output.
- PROTOCOLIZE retains pre-await file hashes for publication revalidation. Its
  validator runs on a draft outside the writer transaction.
- Non-forced protocol cleanup now rejects unavailable Git status instead of
  treating it as a clean workspace. Prompt identity uncertainty is not drift.

## Deliberately retained boundaries

| Sites | Why retained |
| --- | --- |
| managed-processes ps; EVAL process-snapshot/processRetired | Small bounded ownership reads. Failure is unknown, never permission to kill an unproven owner. |
| branch-context, prompts, cleanup/protocols Git status | Local identity/admission reads, bounded independently of model work. Unavailable status is not clean or a proven identity mismatch. |
| canon, runs, specify, version-status, lanes, workspace policy Git refs | Local immutable-ref/metadata reads; no provider/agent lifetime watchdog. Errors remain admission/metadata failures. |
| review-copy, workspace-files, external-work-launch, eval-snapshots | Local snapshot preparation with bounded buffers and checked exit outcomes. They do not introduce a hidden provider startup deadline. |
| vnext-merge Git operations, worktree preparation Git, protocol branch/removal | Local transactional mutations, not health probes or model execution. Nonzero outcomes remain actionable Git failures; making all publication callbacks asynchronous is outside this startup repair. |
| memory-permissions ls/lsattr, status npm view, code-checks executable lookup | Optional platform/admission diagnostics, not model liveness. Existing small availability windows do not classify provider outage. |
| scripts/build/release/qualification/test receipt subprocesses | Finite CI/administrative guards, not EVAL native Turn lifetime; suite deadlines and output bounds remain explicit. |
| generated harness adapter shim | Inherits child stdio; outer transport observes actual child output. No second private native work watchdog. |
| maintenance lease/storage window, native hook host deadline, cleanup/late-response grace, reconciliation horizon, retry backoff | Ownership and cleanup limits remain finite. They must not be renewed by model output or renamed agent inactivity. |

This inventory distinguishes startup defects from synchronous local operations;
it does not claim all synchronous Git/file operations are now asynchronous or
that a passing startup proves completion of the full E2E.

## Verification accounting

Intermediate runs are preserved, not acceptance receipts: local async suites
105/105, EVAL transport 31/31. The first combined runtime run exposed unresolved
async dashboard wrapping and load-sensitive producer startup assertions; those
were corrected before the final frozen run. Changing dist while snapshot tests
run invalidates their identity evidence, so subsequent runs keep dist unchanged.
Official release acceptance is separate from targeted startup checks and from a
locally pinned candidate. No historical EVAL or receipt is repaired in place.

Final implementation review found and fixed two additional common-boundary
defects: AGY's startup observer referenced an undefined local instead of its
actual configuration daemon ID; OpenCode's helper overrode an explicitly supplied
short window with 120 seconds. The beta.129 native run is retained as 44/46,
not promoted. A separate beta.130 artifact retains the corrected source and
last confirmed setup phase in uncertainty diagnostics.

Verified: typecheck/lint/build; affected runtime suites 104/104; engine/fork
42/42; runtime JSON observation fixture 12/12; EVAL transport 32/32; startup
contract parity; AGY/OpenCode/tool-observation fixtures 39/39 after fixes.
Installed beta.130 offline full-cycle PASS, with four real owning matrix packets
and explicit review-off omission, receipt cp-221-verification-matrix-qualification.
The full native group and live admission remain separate checks.
