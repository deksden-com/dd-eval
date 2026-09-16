# Fork-015: completed prompt lost behind budget settlement

Status: implemented and focus-verified. 2026-09-15.

The implementation specification below supersedes the earlier broad fix outline where they differ. The priority is to remove redundant observations, then handle genuinely missing evidence correctly.

## Evidence and root cause

Eval: `EVAL-20260915170000-code-fork-015`, engine `0.9.0-beta.72`.
Controller: `DRV-78d82b02-6bee-4bdb-bdd8-e617cffa06bd`.
Evidence root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260915170000-code-fork-015/executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject`.

All times UTC; adapter evidence is `controllers/<controller>/session-1/adapter.events.jsonl`.

1. Browser aggregate check RCP-011 failed. Flow admitted repair WRK-012. The repair's canonical result exists and `works/WRK-012-code-gate-repair/checks` contains RCP-012: `pnpm test:browser`, passed, exit 0. The aggregate stage was not subsequently accepted; do not equate repair proof with CODE completion.
2. 18:37:03.093, event 1437: native prompt id 33 returned `end_turn`.
3. Events 1438–1443: post-turn read/subagents/usage all succeeded.
4. 18:37:14.166: `session-1/operations/af3c59ba05faa311dc234b107e66a93d564cc0a4c1dc3abd1d08b0cab4d1e5b0/result.json` persisted `completed` and `end_turn`.
5. 18:37:14.254, events 1446–1448: another read/subagents/usage batch, requested by budget settlement after the durable operation returned.
6. 18:37:29, events 1449–1451: all three returned native timeout, wrapped as ACP -32603.
7. The daemon response became an error even though its operation receipt was completed. Controller reported `harness_adapter_failed`; eval ended `completed_with_failures` at 18:40:22.
8. 18:38:09–13: native subagents/read worked again during cleanup. Root close succeeded; subsequent retained topology/residency checks confirmed closure.

Primary defect: `durableDaemonDispatch` awaits `completeBudgetOperation` AFTER `journalDispatch` has committed success. Any settlement exception replaces delivery of that success. This is our orchestration defect, triggered by a transient native observation timeout. It is not evidence that the successful native prompt failed.

The underlying reason the closed-source native backend missed those three 15-second read deadlines is not established. A prior session/messages timeout at 18:35:54 is additional evidence of intermittent backend unresponsiveness, not proof of a deadlock or its cause. Cleanup reads recovering later rules out claiming permanent backend death from this evidence alone.

## Codebase findings

- `dd-flow-cli/src/harness-runtime/lib/daemon-operations.mjs:58–84`: common post-commit failure path. All six managed daemons call this wrapper. `session.create` and `session.fork` also have post-commit release calls. `session.inspect` similarly conflates successful observation with failure to release budget.
- `.../managed-daemon.mjs:90–122`: settlement includes fresh provider observation, local proof persistence and release-turn CLI. Any of these can fail after operation success. Keeping the slot occupied is correct until settlement is proven; changing provider outcome is not.
- `.../dd-zcode.mjs:412–420,756–795`: full inspection joins mandatory topology and optional usage/profile evidence in one rejecting Promise.all. Post-turn observation can lose an already confirmed native result before it reaches the durable wrapper. This is a related latent path, not the actual fork-015 failure.
- `.../dd-zcode-daemon.mjs:337–378`: pre-dispatch settlement inspection runs inside the productive operation. Unknown observation is not proof of prior-tree failure or of a dispatched new prompt. Admission phase must be retained separately.
- `.../dd-grok.mjs:145–152` and `dd-grok-daemon.mjs:234–245`: analogous post-turn inspection/usage and pre-dispatch tree inspection exposure.
- `.../operation-errors.mjs`: classification is a short top-level code list. `dd-zcode.mjs:221–235` collapses native method timeouts into nonretryable `acp_request_failed`, losing method and phase. `zcode-acp/src/handlers/extensions.ts:62–73` wraps native errors as strings; `backend/client.ts:353–367` reports timeout with only a message.
- `dd-flow-cli/src/services/run-controller-adapter.ts:46–72` and `harness-adapter.ts:90–114`: process-level failure reaches controller even when the daemon has a committed receipt. Controller records uncertainty but needs reconciliation against the exact operation before deciding the run's outcome.
- `dd-eval/lib/runner.mjs`: terminal infrastructure handling consumes the controller failure. This incident does not justify eval inventing its own provider retries; it needs a distinct settlement-pending projection from flow.
- Other inspected adapters: Codex `readCompletedThread` already degrades missing post-turn thread reads to null; Antigravity records usage-ingest failure separately; OpenCode catches auxiliary observation failures. These are useful existing patterns, not evidence of this same direct failure at those locations. Their common daemon wrapper remains affected. Local evidence persistence/identity violations must remain visible and must not be blanket-swallowed.

## Systemic fix

1. Keep one immutable productive outcome, plus a separately persisted settlement record keyed by daemon, operation, session and generation. Settlement states: pending, settled, blocked, with exact failure phase and last evidence. Use the existing operation directory and resource registry; no second scheduler or adapter-specific retry loop.
2. Commit a confirmed native result before optional enrichment. The response must preserve that outcome when settlement fails and expose settlement pending. Keep capacity occupied and prevent conflicting dispatch until authoritative topology proves settlement. Never infer settled from a missing child list, timeout, or stale cache.
3. Reconcile pending settlement through the existing control/observation path with bounded backoff and a configured deadline. Retry only observation/release of the same operation, never its productive action. Re-check generation/fence before any subsequent dispatch. Release must be idempotent for the exact operation cohort.
4. Retain phase (`admission`, `native_dispatch`, `native_completed`, `settlement`) and dispatch evidence. Before dispatch, failed observation means admission pending; after dispatch without terminal evidence, outcome unknown; after committed success, success plus pending settlement. Deadline expiry produces an explicit settlement/recovery blocker without rewriting completed history.
5. Give native observation errors structured method, request id, session, timeout and phase. Preserve them through ACP/CLI/controller. Normalize in one shared error contract. Do not blindly mark all ACP internal errors retryable or match arbitrary error prose as success.
6. Split necessary safety observations from auxiliary usage/profile enrichment. Profile mismatch, identity mismatch, corrupt receipts and persistence failure remain explicit failures/blockers of their own phase. Optional missing usage is reported incomplete, never interpreted as provider failure.
7. On lost/error daemon response, reconcile the exact durable operation receipt before terminalizing controller execution. Validate operation fingerprint/session/generation. Return retained success with pending settlement when appropriate; do not resend prompt. Eval reports productive outcome and settlement independently.
8. Monitoring reports stage/work/check outcome and native content progress, not merely live PIDs or growing event-file size. The previous monitor's claims of a healthy flow based only on those indicators were too strong. Report confirmed repair completion, admission/settlement waits and blocker reasons explicitly.

## Execution trace after the fix

Prompt finishes -> retain native terminal receipt -> attach available evidence -> persist operation completed -> attempt settlement. If native read times out, persist settlement pending and return completed outcome plus that state. Controller consumes the completed operation exactly once, waits for settlement, and does not advance conflicting work. Observation later succeeds -> persist topology proof -> idempotently release slot -> resume next flow action. If deadline expires, preserve completed result and stop with settlement recovery required. A concurrent stop fences future dispatch and uses non-materializing closure proof; reconciliation cannot resurrect closed sessions.

## Required regressions

- Exact fork-015 replay: successful prompt + successful first inspection + timeout during post-commit budget observation. Receipt remains completed; no prompt replay; slot remains occupied; later observation releases it and controller continues.
- Post-commit release CLI failure and proof-write failure, including session.create/fork and session.inspect. Outcomes and settlement failures remain distinguishable.
- Native success followed by optional usage failure; mandatory topology unavailable blocks dispatch without corrupting success.
- Pre-dispatch observation failure proves no native prompt was sent. Retry admission after recovery with unchanged operation identity.
- Crash after native result persistence/before settlement; repeated inspection and release are idempotent.
- Concurrent cancellation/generation change prevents stale release or dispatch; no read resurrects a closed session.
- Fatal native error and profile/identity mismatch still stop correctly; observation retry does not swallow them.
- Shared wrapper contract exercised for all six adapter registrations; focused ZCode and Grok tests cover their extra observation paths. Eval test verifies settlement-pending versus actual execution failure.

Run focused regressions, typecheck/build once, then a new controlled fork. Do not claim original checkpoint qualification from a resumed engine-changing diagnostic fork. Do not mutate fork-015 evidence.

## Implementation specification: minimal checks, explicit ownership

### Additional audit findings and corrections

The earlier OpenCode assessment was incomplete: `dd-opencode.mjs` protects its auxiliary polling, but `dd-opencode-daemon.mjs:107–117` awaits `describe` and usage reconciliation after a successful native POST. That path is affected. `dd-droid.mjs:281–296` similarly awaits inspection after a terminal native outcome and during recovery. Include both.

`run-control.ts:290–320` already validates and reconciles durable controller operations during control handling. Extract/reuse that validation for normal controller response reconciliation; do not build a second interpretation of receipt identity.

`budgetObservationScope` deliberately captures operation IDs BEFORE an observation. Reusing earlier evidence while collecting all terminal operation IDs AFTER it would break that safeguard. The fast path must release only the exact completed operation proven by its result; it must not widen the cohort to every historical/current operation of the same session.

### Responsibilities and data

- Adapter owns native turn outcome and provider-specific tree observation. Generic code must not interpret provider JSON fields to guess idle.
- Daemon owns ordered dispatch, native session identities, generation/fence and operation persistence. It attaches operation-scoped settlement evidence while it still owns the dispatch boundary.
- Resource registry owns capacity admission/release. It consumes validated proof and performs idempotent release; it does not query providers.
- Controller owns progression and bounded reconciliation waits. Eval consumes that status and its failure policy; it does not run a second native retry loop.
- Reuse existing `result.json`, operation directory, `budget-observations`, resource rows and controller loop. Add one settlement sidecar/projection only where pending release must survive a crash. Do not introduce a parallel scheduler, a global cache, or one new polling subsystem per adapter.

Result meaning: productive `completed/failed/interrupted/unknown` is independent of settlement `pending/settled/blocked`. Explicit provider error is still an error even if tree cleanup succeeds. An incomplete tree observation is never proof of idle. Successful native outcome does not imply successful stage/gate.

Retain the existing native outcome data in the operation directory before fallible post-turn work; use the adapter's existing native receipt when available (e.g. Droid binding/outcome). If an additional terminal-evidence file is necessary, give it exact operation/session/native-turn identity. This evidence supports recovery, not an unconditional successful stage verdict. Identity/profile validation failure after execution remains an explicit integrity blocker.

### P1 — Remove the duplicate read at the common boundary

Files: `src/harness-runtime/lib/daemon-operations.mjs`, `managed-daemon.mjs`, `src/services/runtime-budget.ts`; adapter return sites listed in P2.

1. Normalize optional settlement evidence on daemon results: native session identity, daemon identity, exact operation ID, dispatch/control generation, authoritative tree settled flag, and source event/revision when the adapter has one. Absence means unknown. Do not require a provider revision where none exists; the daemon must attach its local dispatch epoch and guarantee no intervening owned mutation.
2. `completeBudgetOperation` first consumes valid evidence from the just-completed operation. Zero extra native requests on this path. It releases only that operation ID using the existing release API/proof directory. Session create/fork retain their existing completed-creation release rule and need no new tree read.
3. If result evidence explicitly says unsettled, retain capacity. If evidence is missing/incomplete, observe only mandatory native tree state, at most once per reconciliation attempt. Capture the candidate operation cohort before this new observation, as today.
4. `session.inspect` reuses the observation it just produced for release. Failure to release must not invalidate the observation returned to callers.
5. Resource release validates daemon/process/lease, session, operation and proof boundary. An old proof can settle its old operation; it must never delete a later operation's resource row. Duplicate release is a successful no-op. No cross-generation widening or success based on timestamps alone.

### P2 — Provider adapters: precise evidence, no unnecessary enrichment

| Adapter / files | Required change | Required observation |
| --- | --- | --- |
| ZCode `dd-zcode.mjs`, `dd-zcode-daemon.mjs` | Reuse the post-turn read/subagent result already produced; attach operation-scoped settlement in the daemon. Separate usage/profile enrichment from settlement. `requireSettled` consumes still-valid prior proof, otherwise asks for missing tree state only. | Root idle and complete child-tree status; usage is irrelevant to capacity. Preserve non-materializing closed-tree path. |
| Grok `dd-grok.mjs`, `dd-grok-daemon.mjs` | Separate confirmed prompt result from post-turn inspection/usage and reuse tree evidence at admission/release. | Provider's complete root/child settlement; do not assume an empty partial list is complete. |
| OpenCode `dd-opencode-daemon.mjs` `describe`, prompt, fork, `requireSettled` | Preserve native POST response before describe/usage. Split tree status from message history/model/usage reads. Reuse collected topology/status for release. | Complete children traversal plus status semantics documented by the client; retain ownership/directory checks. No new history download just to release capacity. Fork continuity remains mandatory but its failure must retain the created-session identity. |
| Droid `dd-droid.mjs` prompt/recoverOperation/inspect; `dd-droid-daemon.mjs` | Retain native outcome even if subsequent filesystem/topology inspection fails. Reuse existing post-turn inspection for release. Recovery must report known terminal outcome separately from missing settlement. | Existing owned process/native children proof; do not treat workingState alone as whole-tree settlement. |
| Codex `dd-codex.mjs`, `dd-codex-daemon.mjs` | Keep existing optional completed-thread-read fallback. Use known terminal turn/child evidence where complete; otherwise one targeted tree observation. Persist native completion before fallible postprocessing/final daemon save. | Root turn completion and tracked descendant completeness; do not claim full settlement from root turn alone. |
| Antigravity `dd-agy-daemon.mjs` | Reuse existing receipt's settled/descendant evidence; retain current separation of usage-ingest errors. Inspect remaining productive/finally persistence paths for result overwrite and use common receipt handling. | Existing complete root/child terminal evidence; no added native polling on success. |

Do not add a mandatory extra native query just to populate the common shape. Add fields from evidence already obtained. If an adapter cannot prove tree completeness, it returns pending settlement. Profile integrity checks remain at dispatch and authoritative profile transitions; do not drop them merely to save requests.

### P3 — Preserve success through settlement and response delivery

Files: `daemon-operations.mjs`, `operation-errors.mjs`, daemon operation readers, `run-controller-adapter.ts`, shared validator extracted from `run-control.ts`.

- A committed `result.json` is immutable. Run settlement after commit under a separate error boundary. Persist settlement error and return the retained productive outcome with pending/blocked settlement.
- If settlement diagnostics cannot be persisted, report an explicit evidence-storage error while retaining the productive receipt. Controller must recover that receipt; never pretend storage succeeded or resend a productive action.
- On duplicate operation delivery, verify fingerprint before reading result; return the same result and current settlement projection. Reconciliation may repeat release/observation, not the action.
- On daemon error/connection loss, controller queries the retained exact operation once before classifying execution failure, using the shared binding validator. A valid completed result is consumed exactly once. Missing/corrupt/conflicting receipt is explicit uncertainty/integrity failure, never inferred success.
- Existing `outcome_unknown` storage remains useful. Add settlement projection to controller state/events without changing productive completion to pending or failed. Reuse control recovery's operation validation for startup, prompt, fork and resume as applicable.
- Pre-dispatch observation failure records admission pending plus `native_dispatched=false`. Do not call it a failed native prompt. Unknown dispatch outcome must never be auto-replayed.

### P4 — Error contract and timeout owner

Files: ZCode bridge error normalization, `zcode-acp/src/backend/client.ts`, `handlers/extensions.ts`, shared `operation-errors.mjs`, harness adapter cause transport, controller wait/recovery.

- Propagate structured native timeout code and method/request/session/timeout metadata through ACP rather than reclassifying every -32603 as a permanent execution failure. Update local zcode-acp package/snapshot qualification if those changes are shipped; do not silently test a different bridge build.
- Preserve compatibility with older string-only bridge errors conservatively: unknown structured classification stays unknown; do not blanket-retry internal errors based on text.
- Keep native RPC timeout separate from settlement wait deadline and productive request deadline. Do not increase the native 15-second timeout as the primary fix.
- One bounded settlement reconciliation loop owned by controller, persisted deadline so restart cannot reset it. Reuse existing wait/backoff/cancellation machinery after locating its configuration route. Expose one named settlement budget only if current budgets cannot express it; document units and a finite default (proposed 120 seconds, with a 15-second maximum per observation and 1/2/4/8-second capped backoff). These are explicit new policy values, not a claim about today's configuration.
- Native tree still running uses existing activity/deadline policy, not the 120-second transient-observation budget. Time spent awaiting capacity is not model failure. At deadline emit `settlement_recovery_required` with retained outcome, unresolved operation IDs and last cause; retain slot until verified stop/settlement.
- Scope stop/generation change interrupts reconciliation and fences dispatch. After confirmed native close, use only retained/non-materializing inspection. Never resume a closed session as a side effect of monitoring.

### P5 — Eval, read-only status and monitoring

Files: `dd-eval/lib/daemon-operations.mjs`, `managed-daemon.mjs`, `runner.mjs`, `runbooks/e2e-monitoring.md`; flow status projections.

- Operation readers expose settlement separately; absence on historical artifacts means unknown, not failure or proven settlement. Keep old receipt reading compatible.
- Eval waits on controller's explicit settlement state. It does not retry ZCode, force-release resources or mark an active repair complete from a tool message.
- Status includes actual stage, current work/check, last native productive activity, productive outcome, pending settlement reason/deadline. Status viewing should not start productive actions or independently reset/retry deadlines. Any explicit reconciliation command is clearly separated from read-only projection.
- Monitoring distinguishes native content/tool activity from lease heartbeat and polling updates. Report failed checks and accepted repair results, not simply stopped check processes. Mark missing telemetry as unknown. Stop only on confirmed terminal blocker; retain evidence.

### P6 — Implementation order and acceptance

1. Add failing regressions for common wrapper: exact successful result + failed release observation; assert no duplicate observation with fresh result proof.
2. Implement P1/P3 common receipt and release contract, including cohort/generation validation and idempotency. Keep legacy receipts readable.
3. Adapt all six P2 return paths. Add structured ZCode errors and update controller reconciliation/timeout owner (P4). Do not ship result-preservation without pending-release handling: that would strand capacity.
4. Update eval readers/projection, monitoring runbook and engine compatibility notes (P5).
5. Focused tests and typecheck/build. One integrated fake-provider/controller/eval test should cover successful native result -> temporary observation failure -> observation recovery -> next stage action exactly once. Do not launch six costly live E2Es to validate a shared wrapper.
6. Produce an immutable engine and prepare a new fork only after regression checks pass. A live fork from the latest verified checkpoint is the subsequent validation step, not part of this planning request.

Additional acceptance cases: zero extra release reads for valid settled evidence; no usage/history request for settlement; old proof cannot release new operation; true provider failure survives cleanup; mandatory profile/identity violation blocks; error after native create retains created identity; concurrent stop does not resurrect sessions; restart preserves deadline; missing/corrupt evidence remains explicit; no repeated prompt on response loss; all six daemon entrypoints use the shared wrapper.

### Reasoned execution cases

**Normal completion:** native result -> existing complete tree evidence -> persist outcome -> release exactly its operation from that evidence -> controller advances. Additional native release queries: zero.

**Children still active:** retain successful root outcome and capacity -> await actual child progress/completion using existing policy -> one targeted observation only if terminal events do not prove full settlement -> release. No success is inferred from root end_turn alone.

**Transient observation failure:** native outcome retained -> pending settlement/error metadata -> controller waits -> next bounded observation succeeds -> release same operation -> advance exactly once. No productive retry.

**Release API unavailable after proven idle:** retain the proof -> retry only idempotent release; no new native observation unless an intervening dispatch invalidated the relevant boundary. If deadline expires, recovery blocker names release failure.

**New operation or stop races:** check exact IDs and daemon dispatch epoch; old evidence applies only to old cohort. Fence prevents pending new dispatch; stop-owned proof settles its actual tree. A new operation's slot cannot disappear through old evidence.

**Crash after native success:** existing terminal evidence/receipt establishes outcome; reconcile state and release without sending prompt again. If only dispatch intent survives, expose unknown and use existing explicit recovery.

**Product test failure:** preserve failed check and repair route. It is unrelated to provider settlement; stage remains unaccepted until aggregate checks actually pass. Successful repair alone does not advance CODE.

## Implementation record

- The shared daemon wrapper now persists `settlement.json` separately from the
  immutable productive receipt. A release/sidecar failure returns `pending` or
  `blocked`; it cannot overwrite an already completed prompt.
- A new `daemon operation settle` command exists in every managed adapter. It
  retries only release using the saved exact receipt. The controller calls it
  before any fresh `session inspect`, so the fork-015 path has no duplicate
  ZCode read/subagents/usage batch.
- The controller observes the exact durable operation once after a transport
  error, validates its operation/session identity, and consumes a completed
  receipt without replaying the productive call. Its bounded settlement loop
  stops with `settlement_recovery_required` rather than inventing a provider
  failure.
- ZCode/Grok usage enrichment is best-effort; ZCode native observation timeouts
  now retain method/request/session/timeout metadata. OpenCode and Droid retain
  native create/prompt/fork identity/outcome when follow-up observation fails.
  An OpenCode fork with unproven continuity remains an explicit blocker.
- dd-eval operation inspection and monitoring guidance expose productive
  outcome separately from settlement; status remains read-only.

Focused evidence: daemon-operation fixture (including release retry), ZCode
adapter fixture, controller transport-loss regression, harness runtime asset
suite, dd-flow typecheck, dd-eval operation reader regression, and the full
zcode-acp suite (808 tests) all passed. The next validation is one controlled
ZCode fork on the new immutable engine; it must not be confused with this
implementation verification.
