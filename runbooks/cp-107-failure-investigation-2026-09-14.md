# cp-107: lifecycle failure during plan review

Run: `EVAL-20260914113523-44ebdc3b`; engine beta.63 / `4975ba1`;
eval definition `cea0934`. Investigation only; production code and retained run were not changed.

## Evidence and confidence

- 12:08:30 UTC: plan-review entered; one managed provider prompt remained active.
- 12:11:13: RG1 `work start`, invocation `0367a2d7-02f4-45ee-97d4-cb564fc69c79`,
  returned `unexpected: Error: database is locked`.
- Its retained lifecycle row is `settled`; RG1 Work remains `created`, with no successful start.
  Repeating that command reads the saved error. Repeated output does not prove a continuing lock.
- Other reviewers produced results; the coordinator subsequently retried RG1 through new child sessions.
- 12:58:10: coordinator called `uuidgen | tr 'A-Z' 'a-z'`. It substituted the resulting
  `6186e906-9c28-4c57-9561-09ab72e9353e` in a Work start command. This ID was never issued by runtime.
- 12:58:37–38: child call was observed and rejected with `invocation_unknown`; controller entered
  recovery_required and execution failed. 12:59:12: EVAL completed_with_failures.

The fatal identity check was prompt, not delayed by fifty minutes. The delay preceded it.
Earlier claims that the controller issued this UUID, or that the adapter waited fifty minutes to reject
that UUID, were incorrect. Error logs do not retain the SQLite extended code or failing SQL/stack;
the exact first production statement cannot be proved retrospectively.

## Reproduced storage defect

`dd-flow-cli/src/services/lifecycle-invocations.ts:145`, managedLifecycleCommand:
outer SAVEPOINT → SELECT prior invocation → schema helper / INSERT.
An outer SAVEPOINT starts a deferred transaction. A concurrent committed write after its SELECT
invalidates its WAL read snapshot for writes. A larger busy_timeout cannot repair that snapshot.

Experiment used the actual built managedLifecycleCommand and two actual getDatabase connections in
a disposable home. The second connection inserted an unrelated row immediately after the first
connection's prior-invocation SELECT. Result: ERR_SQLITE_ERROR, errcode 517
(SQLITE_BUSY_SNAPSHOT), `database is locked`; the requested command was not issued.
This proves the code defect and a mechanism compatible with the incident, not the unavailable
extended error code of the original incident.

## Class audit

Confirmed read-before-write outer-savepoint paths:

1. lifecycle-invocations.ts / managedLifecycleCommand: shared issuance for work-registry,
   run-controller, stage-pause, run-recovery, merge-server and vnext specify/protocolize/plan/
   plan-review/code/code-review/merge command producers.
2. work-registry.ts / addWorkBatch: SAVEPOINT work_batch, nextWorkIds reads allocation state,
   then INSERT. Applies to materializing Work graphs, independent of adapter.
3. runs.ts / withStageSettlement: deferred transaction around callback reads/writes.
   Callers: vnext-plan; vnext-plan-review (entry/terminal/repair paths); vnext-code
   (settlement and repair); vnext-code-review. Nested use is safe only when the outer owner
   already holds a write reservation.

Do not mechanically replace every SAVEPOINT: runtimeBudgetStatus, runControlStatus,
and preparedScopeRun use read snapshots. Correction after the second trace:
controller_ready_status, controller_failure_status and controller_spawn_status are mutations,
not read-only snapshots; each starts with an UPDATE. Like persist_run_state,
run_usage and seal_run_status, they begin their mutation with a write; they are not evidence of this
same read-to-write upgrade defect. writer-contract's owned schema transaction already uses
BEGIN IMMEDIATE; its savepoint inherits the caller's transaction and cannot repair a deferred parent.
dd-eval delegates runtime storage to dd-flow; its own examined lifecycle code uses JSON journals.

## Failure contract defects

- run-cli.ts:324–329 saves every non-AppError after lifecycle admission as a settled `unexpected`
  error. It drops SQLite errcode, failing operation and effect certainty. This produces an
  immutable failed attempt without a useful recovery directive, including when a Work never opened.
- lifecycle-invocations.ts / managedLifecycleCommand returns the retained same-command attempt
  unless its caller is that executing invocation. Graph reads and newly_ready can therefore expose
  the failed start again. New child sessions do not create new authority.
- Work start is multi-step: hook claim, prompt rendering/command issuance, binding transaction,
  file publication, projections and timeline. Failures after a commit can coexist with productive
  effects; globally replaying a CLI command on any SQLite error is unsafe.
- runner.mjs / isInfrastructureFailure omits harness_adapter_failed and invocation_unknown.
  Direct calls to the classifier returned false for both, true for harness_runtime_incompatible.
  Failure policy and run-validity classification must retain the causal category through wrappers.
- dd-zcode.mjs rejects fatal lifecycle observer errors immediately, but ordinary tool failure
  does not itself produce a shared controller infrastructure-failure signal. Here the parent
  continued its provider turn while one child's required Work had failed to start.
- Root eval observation says awaiting_provider and can expose execution state unknown while
  a managed stage is running. That alone is inadequate evidence of healthy progress. Status
  reporting must distinguish active review, a failed required lifecycle operation, and recovery.

## Minimal systemic changes to implement

1. Use one nest-aware synchronous write-transaction primitive: BEGIN IMMEDIATE when owning
   the transaction; SAVEPOINT when nested under a proven write transaction. Convert the three
   confirmed mutation paths. Retain read-only snapshots. No provider, subprocess or async waits
   inside writer transactions; preserve bounded SQLite busy wait.
2. Preserve structured storage errors and effect state at the common CLI boundary.
   Retry a pure rolled-back transaction or publish a runtime-issued successor only with proven
   no effects. For committed/unknown effects, retain evidence and require reconciliation.
   Never whitelist all `unexpected`/SQLite errors as safe full-command retries.
3. Existing lifecycle ledger must expose a usable outcome/directive for a failed required command:
   exact authorized retry when safe, otherwise runtime block/recovery. Do not present the stale
   failed start as ready work. UUIDs remain runtime-owned; no manual DB edits or caller-generated IDs.
4. Propagate lifecycle outcome and causal category through a shared controller contract used by
   every adapter. Hooks/ACP translate native identity/events; dd-flow owns admission, effects,
   retry and recovery; dd-eval owns fixture policy and evaluation validity. A generic Bash nonzero
   is not automatically a fatal infrastructure error: distinguish result validation, product checks,
   safe transient rejection and infrastructure/unknown-effect failure.
5. dd-eval must classify wrapped infrastructure errors correctly and expose the last meaningful
   lifecycle result/stage. A fatal registered command must not leave progress looking healthy;
   quiet but genuinely active model work is not evidence authorizing interruption.

## Required regression evidence

- Deterministic two-connection collision for real invocation issuance, Work ID allocation and
  stage settlement; verify no partial Work graph or stage commit.
- Two concurrent same-command issuers converge on one authority or an explicit conflict;
  never silently issue two executable identities for the same semantic attempt.
- Storage failures before effects, after commit and while persisting a reply have different
  outcomes; retry never duplicates a completed Work/session/file publication.
- An already-settled failed Work start cannot cause repeated fresh-child dispatch with the same ID.
- Adapter contract tests: identity-valid transient failure, conclusive no-effect rejection,
  unknown effect and invalid authority; verify controller state and nested error preservation.
- Evaluation classifier tests with actual wrapped harness_adapter_failed and lifecycle failures;
  assert invalid infrastructure verdict and correct stopping policy.
- Keep one targeted regression suite for these changes; live E2E follows in a new checkpoint.

No claim of exhaustively proving absence of all concurrency defects: this audit enumerates the
identified transaction pattern and the failure propagation paths above. The missing production
extended error/stack is itself an observability gap to close.

## Second-pass findings, 2026-09-14

These are additional code-path findings, not assertions that each occurred in cp-107.
Implementation decisions, the step-by-step proposed execution trace, side effects and acceptance
tests are in [the expanded fix plan](cp-107-systemic-fix-plan-2026-09-14.md), sections 8–12.

### Confirmed with short local experiments

- `dd-eval/lib/runner-events.mjs / appendEvent`: an event can be fsynced before observation
  publication fails. A disposable directory at observation.json forced EISDIR; the journal then
  contained one event. After removing only that empty test directory, deduplicating the same
  event returned the retained event but did not create observation.json. Projection recovery
  cannot depend on another unrelated event arriving.
- `dd-eval/lib/process-json.mjs / commandJson`: a throwing onProgress callback was invoked
  with valid JSON, its error was swallowed by the parser catch, and the command returned ok:true.
  The same catch pattern exists in dd-flow-cli/src/harness-runtime/lib/process-json.mjs.
  This is a shared-helper failure-handling defect; existing simple assignment callbacks do not
  by themselves prove this failure occurred in production.
- The same commandJson returns an ok:false/error envelope normally when the child exits zero.
  Whether that is erroneous depends on the command contract. A runtime failure envelope must
  not become success; negative product results and doctor findings must retain their semantics.

Probe script: `/tmp/cp107-plan-probes.hvpOfg/probe.mjs`.
Disposable journal: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/cp107-projection-probe-2l0k0l`.
No provider was launched; no production RUN data was modified or removed.

### Further source-traced gaps and preservation constraints

- `controllerAdapter` awaits a session prompt with a two-hour adapter timeout. Required-command
  outcomes need to be observed while this promise remains active, not only after its reply.
  Fencing and confirmed native drain must be distinct from merely abandoning the await.
- `managedInvocationContext` configures invocation scope only for zcode-acp. An adapter-neutral
  outcome signal cannot rely on every command having this ZCode-specific invocation ledger.
  Reuse trusted hook receipts for other harnesses and keep authority runtime-owned.
- `harness-adapter.ts` timeout, invalid reply and output-limit errors do not establish whether
  the native operation had effects. The timeout code is absent from the current observation-loss
  helpers. `native-hook-command.mjs` has a separate 15-second timeout and can lose structured
  causes. Transport outcome and actual execution outcome must not be conflated.
- `controllerAdapter`, controller failure persistence, schema rollback and final managed-process
  cleanup can throw secondary errors before the primary reaches the caller. Existing preservation
  helpers, such as managed-daemon cleanup handling, should be reused instead of replacing every catch.
- `eval-resume-worker / publish` saves its attempt receipt before publishing a root event;
  generic failed observer state is not published to the root journal there. A crash in this gap,
  including after recovery_blocked receipt persistence, requires projection reconciliation.
- `run-controller` heartbeat catches more than the lease monitor renewal: recovery guard reads
  and merge dispatch-lease UPDATE failures are also inside its catch. The lease monitor's own
  retained error does not account for those additional failures.
- `retainScopeDrain` already documents registry → sorted RUN lock ordering. The inspected
  controller/control-worker claim paths commit the RUN claim before resource registration.
  No inverse lock order was established in those paths; the transaction fix must preserve them.

The plan distinguishes normal product failure, correctable validation, safe bounded retry,
committed-but-unobserved results, unknown effects, observer loss and conclusive infrastructure
failure. A quiet live provider is not evidence of a fault. A known mandatory lifecycle failure,
however, must not be left to repeated parent-model retries.

## Completed mental trace of the proposed changes

The user requested the trace itself, not a task to perform it later. Section 10 of the fix plan
now records the completed static trace: concrete existing call paths, counterexamples to the
initial proposal and the resulting design corrections. No new E2E or production-code execution
is claimed by that trace.

Additional corrections required by this pass:

- startBoundWork renames packet files before COMMIT; existing pending-result materialization
  covers terminal results, not start packets. A durable start receipt tied to WorkSession is needed.
- startWork resets a claimed hook after any startBoundWork exception, including projection failure
  after commit. Cleanup must not make an already consumed hook available again.
- Work readiness and dependencies can change between prechecks and binding. Both the starter
  and mutateWorkDeps/deleteWork write boundaries need current-state checks.
- A monitor only inside controllerAdapter misses launchExternalWork and the outer allSettled
  wait. Observe throughout controller execution; propagate conclusive child failure before join.
- An issued retry is not a delivered continuation. Work-start replacement needs an explicit
  recipient/path; late resolved rejection must not be treated as a new fatal failure.
- New dispatch/terminal acceptance needs an outcome barrier between monitor ticks.
- Error-initiated control must retain its execution cause: the existing control_requested path
  clears last_error_json and the eval consumer interprets it as operator suspension.
- Eval's status loop also waits for context/answer callbacks, including interaction Judge.
  Continued observation plus a single pending action is needed; late answers must not resume a stopped RUN.
- Reconciliation of an observer's saved terminal receipt must precede its early terminal return.

These findings refine the planned mechanism. They are not claims that these additional failure
sequences occurred in cp-107, and they do not replace implementation-time regression tests.
