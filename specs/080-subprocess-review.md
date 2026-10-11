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
The final native group passed 46/46 with complete inventory and unchanged source
09c3a783d80008637e76faafc3aa4777ba563edf. Runtime PR58 squash-merged as deec90c.
Live admission remains a separate check.

CP221 preflight correctly rejected a preparation mistake: the checkpoint used
the npm tarball SHA instead of installed engine content identity. Those are
different digests. Preserve that failed attempt; CP222 pins the measured engine
checksum 0f830868453106ca108e9739e4e789cd562297f062a98ebd0c05454aec5deaf4,
matching both installed fixture and preflight manifests. The execute runbook
now names this distinction explicitly. No runtime guard was weakened.

Final startup receipt (2026-10-11): CP222 preflight PASS at
`/Users/deksden/.dd-eval/qualification/cp-222-zcode-decisions-full/conformance/e2e-preflight/1791753141875-c1be6b34/e2e-zcode-glm-5-3-flash-max-openai-decisions`.
Both doctors compatible; existing task-scoped Judge qualification reused, no
additional paid qualification. Definition source 303faae53cfaf4f954a4d258a2f448250e26c24c.
New scored full run EVAL-20261011211255-023e67a1 in CP222 home, no stop_after.
Baseline receipt passed all five checks (install, quality, browser-install,
browser, isolation); each exit_code=0. Timeline stage_attached SPECIFY at
2026-10-11T21:15:01.099Z, WRK-001-root waiting for agent.
Native Session sess_625daa66-336e-451f-b92a-3f48fd631972 created by owned daemon
5fde26f7-9bad-4de1-8229-78df3f4d938e; provider PID18651, daemon PID18559.
Daemon receipt at 21:15:30.503Z confirms session.prompt dispatched,
observation productive, cursor27, native_initialized, active_tree=true.
This satisfies startup acceptance only, not MERGE/Final Judge/full E2E PASS.
Runtime PR58 squash merged deec90c119105260559953aae00b152525f6d913;
EVAL integration PR73 contains this final receipt. Local beta.130 candidate is
not an npm-published or full official release-accepted artifact.
Final EVAL setup regression rerun: 3/3 PASS; git diff --check clean.
