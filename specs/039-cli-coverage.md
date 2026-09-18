# 039: проверенное покрытие CLI

Статус: **неполный inventory**. Таблица фиксирует только просмотренные пути;
отсутствующая строка не означает отсутствия дефекта или завершения работы.
Полный синтаксический список: `dd-flow-cli/src/cli/command-inputs.ts`.
План и исходный scope: [039](039-cli-prepare-before-execute.md).

Общее для строк: parser проверяет allowed options, позиции, required values,
диапазоны и объявленные enum до исполнения. Ниже — дополнительная проверка
payload/state, которую синтаксический тест сам по себе не доказывает.

| Команда | Подготовка / вход | Первый продуктивный эффект | Проверка |
| --- | --- | --- | --- |
| `project register` | `resolveProjectRoot`: существующий directory | INSERT/UPDATE projects | run-cli-admission: file root без home |
| `project archive` | `prepareProjectArchive`: одна цель, reason, retained project | UPDATE archived | project-archive-preparation; run-cli-admission |
| `lane workspace set` | `prepareLaneWorkspace`: project, lane, directory, optional branch text | INSERT/UPDATE lanes | lane-preparation; run-cli-admission; lane CLI lifecycle |
| `lane lock acquire/heartbeat/release/wait/wait-acquire` | `prepareLaneLock`: worker/reason/token, numeric bounds, matching workspace, existing ownership where required; reused by CLI and direct services | explicit expiry / lock update / queued acquisition | lane-preparation: invalid payload before DB; positive wait/acquire/heartbeat/release; admission overflow without home |
| `lane waiter cancel` | `prepareLaneWaiterCancellation`: worker/reason/project/lane | explicit waiter expiry/cancel | lane-preparation; run-cli-admission |
| `lane status/lock status/waiters`, `lane workspace check` | syntax validation; read-only classification + SELECT/path/Git read | нет | classifier source; lane-preparation SQL-write spy; existing lane CLI lifecycle |
| `plan item start/done/block/skip` | `preparePlanItemMutation`: typed action payload, read-only canonical/progress, binding consistency, item/dependencies | bind plan / UPDATE progress | run-cli: no binding/progress writes on invalid item/dependencies; direct prepare all four actions; run-cli-admission no home |
| `stage start --stage plan` (vNext) | shared `prepareVnextPlanStart`: workspace route, accepted protocol IDs/ownership/SPECIFY identity, prompt/check profile/aspect catalog, root Work, running PLAN exclusion, variables/Git and output locations; prepared data reused by executor | stage directory / root binding / PLAN Work | vnext-protocolize: invalid retained result leaves Work/hook/directory unchanged; prepared template survives source deletion; feature-worktree PLAN start |
| `stage start --stage code-review` (vNext) | shared `prepareVnextCodeReviewStart`: route, CODE report, root Work, fresh stage transition, review groups/batch, template/checks/output paths and existing external context; existing prompt/fanout checked before resumed binding | directory / frozen mode / Work binding | code-review-start-preparation: illegal transition and duplicate groups fail without SQL writes/directory/hook consumption; prepared template used after source replacement |
| `stage start --stage plan-review` (vNext) | shared `prepareVnextPlanReviewStart`: terminal report before old batch; fresh/resumed/off route, groups, root Work, transition, checksums, template/revision/capacity and actual output paths; off validates frozen PLAN and prepares CODE batch without publication | directory / Work binding/creation | vnext-protocolize: missing template direct+CLI keeps RUN/hook/stage unchanged, prepared template survives replacement; accepted replay after batch deletion; corrupt review-off batch is not repaired by validation |
| `stage start --stage protocolize` (vNext) | shared `prepareVnextProtocolizeStart` and `prepareVnextProtocolizeArtifacts`: root Work, accepted SPECIFY, frozen handoff/context, stage applicability, prompt/catalog/output paths, retained or planned workspace route, Git target and bootstrap sources before publication; session policy checked before materialization | stage directory / checkout provisioning / context publication | vnext-protocolize: missing template direct+CLI no writes/hook/stage, foreign Session no directory, prepared template after deletion, corrupt resumed context rejection; feature route missing bootstrap before rebind and hook consumption |
| `stage start --stage code` (vNext) | shared `prepareVnextCodeStart`: route/root Work, fresh stage transition (except source-repair attempt), accepted handoff/batch, template/variables/output paths; resumed prompt/fanout and external context preflight; graph command issuance stays in execute | directory / workspace readiness | vnext-protocolize two PLAN→CODE→MERGE integrations: missing template direct+CLI no writes/directory/hook consumption, managed readonly scope issues no invocations in prepare, later readiness failure retains execution classification; fresh and resumed success |
| `stage start --stage merge` (vNext) | shared `prepareVnextMergeStart`: terminal shortcut, request/Work/transition, lane target, frozen checks/settings, existing prompt/output/context before effects; native receipt before directory/lane | Work directory / lane / request claim | both PLAN→CODE→MERGE integrations PASS: malformed gate direct+CLI leaves request/hook/Work directory unchanged; executor consumes prepared gate after source deletion; settlement recovery preserved |
| `stage finish --stage merge` (vNext) | shared `prepareVnextMergeFinish`: identity/apply/conflicts, immutable semantic result bytes/schema and retry receipt against the frozen gate before heartbeat or checks; terminal replay does not reopen result | lane heartbeat / bootstrap / retry timeline / checks | PLAN→CODE→MERGE integration consumes prepared result after source deletion; existing settlement recovery preserved |
| `stage finish --stage code/code-review` terminal replay | CLI resolves retained done stage/report before opening transient verification/decision input; service recovery remains authoritative | recovery settlement only | review-off integration replays CODE after deleting verification and replays CODE-REVIEW without a decision file (`/tmp/dd-039-terminal-stage-replay.log`) |
| `stage start --stage specify` (vNext) | shared prepare captures intake/template/grounding/handoff, readable memory bank, existing stage outputs/context and fresh destination parent; native hook identity before RUN creation, recovery rechecked for existing RUN | project registration / RUN creation / stage files | vnext-specify: blocked output no intake/Work or SQL writes; preparation without probes, captured sources consumed after deletion, missing hook creates no RUN; fresh blocked home creates no project/RUN |
| `stage start` (legacy/bootstrap) | shared `prepareLegacyStageStart`: intake/directory, existing RUN transition, output destinations, protocol state, memory-bank readability, canonical/project instruction bytes; bootstrap protocol identity and RUN profile are prepared before registration | project/protocol/RUN registration or stage attachment | legacy-start-preparation direct+CLI: blocked destination and unreadable instruction reject without index/SQL writes; captured instructions survive source deletion; mb-upgrade CLI start PASS |
| `stage start --context-file` (non-bootstrap) | existing stage-context identity and destination checked before stage dispatch; direct PLAN/CODE/CODE-REVIEW use same helper | stage execution | stage-context: no directory during prepare, immutable installed bytes, late output failure has no safe-retry promise; remaining direct stage services still require dedicated coverage |
| `protocol register` | `prepareProtocolRegistration`: безопасный identifier, project/workspace directories | ensureRuntimeProtocolFiles | protocol-transition-preparation: path IDs без storage; worktree-preparation successful register |
| `protocol transition` | `prepareProtocolTransition`: payload/schema/state | переход runtime state | protocol-transition-preparation; run-cli-admission |
| `transition` | тот же service prepare, alias dispatcher | тот же переход | run-cli-admission: обе формы |
| `run attach-stage` | `prepareFlowRunStageAttachment`: RUN/guard/index/dir/status/stage applicability | archive previous stage attempt | run-settings-preparation; run-cli-admission |
| `run complete-stage` | `prepareFlowRunStageCompletion`: RUN/guard/stage/status/reference shape; пути — ссылки, не читаемый payload | persistRunState | run-settings-preparation; run-cli-admission |
| `run override` | `prepareFlowRunCompletion`: failed/cancelled + reason, RUN/guard | closeOpenWorksForOverride | run-settings-preparation; run-cli-admission |
| `run recovery capture/resume` | shared capture/resume preparation validates retained guard, capture snapshot and all replacement identities before UPDATE/writer transaction; managed acceptance command is still issued only during execute | capture binding UPDATE / resume writer transaction | eval-snapshots recovery regression: invalid identity opens no writer; snapshot drift and concurrent state rechecks preserved (`/tmp/dd-039-recovery-prepare-final.log`) |
| `run config set` | `prepareFlowRunConfig`: key/value/reason/frozen review state | persist index | run-settings-preparation |
| `run vars set` | `prepareFlowRunVariable`: variable key/value + retained RUN | persist index | run-settings-preparation |
| `project config status`, `run timeline`, `run config status`, `run vars ls/get`, `run flags status` | syntax inventory + read-only classification; scoped project/RUN SELECT and retained file/index reads | none | run-cli-admission missing home and successful existing RUN reads; dashboard-preparation config projection no SQL writes |
| `canon register` | `prepareCanonRegistration`: explicit root resolution, prepared canon | INSERT runtime_config | run-cli-admission; run-cli existing canonical registration |
| `id next` | `previewNextEntityId`: kind/slug/root + readonly IDs | нет; reserved:false | command-inputs aliases; source audit ids.ts |
| `codex home init` | `prepareCodexHome`: source/target + source TOML | target mkdir | home-preparation; run-cli existing home lifecycle |
| `codex home remove` | `prepareCodexHomeRemoval`: mode/profile/scoped project; existing registered home marker must match owner/project/profile/source/target and not alias source; removed profile is no-op | owned file deletion / profile UPDATE | home-preparation wrong mode/profile/marker no writes or deletions; valid removal leaves source unchanged; repeat no-op; CLI no-home admission |
| `codex hooks install` | `prepareCodexHooks`: target/confirmation + regular JSON/event arrays | backup/write hooks | hooks-preparation; run-cli hooks lifecycle |
| `codex hooks remove` | тот же prepare; сохранённые чужие hooks | backup/write hooks | hooks-preparation; run-cli hooks lifecycle |
| `worktree create` | `prepareWorktreeCreate`/`prepareManagedWorktree`: branch/base SHA/path | managed tool installation/Git worktree | worktree-preparation; run-cli worktree lifecycle |
| `worktree bootstrap` | `prepareWorktreeBootstrap`: record/project files/target | native bootstrap command | run-cli worktree lifecycle |
| `worktree close` | `prepareWorktreeClose`: mode/record/stage safety | record update/native cleanup | run-cli worktree lifecycle |
| `runtime process release-turn` | `prepareProviderTurnRelease`: exclusive source, retained receipt parse/shape; execute owner/generation/settled proof | DELETE provider-turn claims | runtime-budget |
| `runtime process status` | read-only classification + resource registry `read_existing`; missing registry returns empty | none | managed-processes; CLI both homes absent |
| `runtime process check-admission` | read-only route; ID/token validation, single SQL snapshot of owner and scope fence/control, retained role/budget validation | none | runtime-budget no writer/transaction, missing registry absent, retained corruption fatal; CLI neither home created; scope stop/control regressions |
| `runtime scope fence/stop` | shared `prepareRuntimeScopeFence`: canonical scope and nonblank bounded request ID; reused by control, CLI preflight and direct fence/stop | registry creation / fence INSERT; stop then owns physical control | runtime-budget direct malformed inputs no resource home + idempotent valid fence; CLI invalid scope/overlong request leaves both homes absent |
| `runtime scope reconcile` | shared `prepareRuntimeScopeReconciliation`: scope/request, positive integer generation, recovery request length, current control read-only | retained worker renewal / owner launch | runtime-budget invalid/missing no resource home and valid prepare no writes; CLI invalid scope/request and missing generation leave both homes absent; superseded remains infrastructure failure |
| `runtime scope serve` | shared `prepareRuntimeScopeServing`: scope/generation, launch token and unclaimed starting worker read-only; same record validator reused under claim transaction | worker owner UPDATE / managed process registration | runtime-budget malformed/missing/claimed owner regression; CLI no token/unowned token no homes; fresh-build detached worker integration |
| `runtime scope status` | shared resource read snapshot; absent registry stays absent, cached owner transaction view retained, uncached connection is SQLite readOnly | none | runtime-budget absent/existing/uncached and concurrent registration snapshot; CLI neither home created |
| `runtime scope resume` | shared `prepareRuntimeScopeResumeRequest`: payload, prior replay, current control/capture/inventory/journal read-only; retained authority rechecked under existing writer transaction | scope-resume-request / scope-resume INSERT | runtime-budget missing scope no registry; CLI missing scope neither home; runtime-scope-resume invalid journal no write transaction, replay after journal deletion no writes, complete detached release |
| `runtime process register` | `prepareManagedProcessRegistration`: scalar fields, PID/lease, JSON-serializable metadata, observer ownership, operation requirement and existing registration read-only; shared CLI input builder | registry initialization / INSERT; unique operation rechecked under transaction | managed-processes malformed/cyclic metadata and duplicate ID no writes; CLI missing observer PID/operation no homes; code-checks and runtime-budget |
| `runtime process confirm` | `prepareManagedProcessConfirmation`: ID/token/PIDs/lease + retained starting state and ownership | registry initialization / conditional UPDATE | managed-processes invalid PID, missing record, wrong lease and repeated confirmation no writes; CLI missing record no homes |
| `runtime process heartbeat` | shared payload/lease prepare; direct service reads applicability without creating registry, keeps false for stale/missing leases | conditional lease UPDATE | managed-processes invalid payload no home, missing/stale/terminal false without writes, valid renewal; CLI invalid lease no homes |
| `runtime process finish` | shared ID/token/state/reason prepare + retained record read-only; identical terminal result replay true, stale/incompatible false | conditional terminal UPDATE / resource release | managed-processes payload/missing record no home; stale lease/replay no writes; CLI missing record no homes |
| `runtime process stop` | `prepareManagedProcessStopOperation`: payload/timer + existing record/lease/physical identity read-only; execution refreshes ownership | stopping UPDATE / owned signals / terminal settlement | managed-processes wrong lease/unconfirmed no SQL writes; CLI missing ID with zero grace no homes; orphan stop/PID-reuse tests |
| `dashboard refresh` (project/protocol target) | `prepareDashboardRefresh`: scoped project/protocol, format/open, recovery guard, summary/project/global output paths, disabled-project no-op; shared with CLI | render publication / summary / optional open | dashboard-preparation manual/automatic invalid global output no project/summary files + success; CLI no-home admission |
| `dashboard data` | common target resolution + registered protocol; read-only route | none | classifier + dashboardData source; existing target-based dashboard CLI |
| `dashboard render/render-global` | shared `prepareDashboardRender/prepareGlobalDashboardRender`: project/protocol/recovery/format + explicit or default output/JSON paths before writer admission | page publication | dashboard-preparation; run-cli-admission; existing static HTML CLI |
| `dashboard open` | common options/target validation; protocol HTML requirement; global/protocol output preparation; project open has no rendering | native cmux open (global/protocol render first) | no-home invalid viewer/protocol admission; existing target-based CLI |
| `dashboard refresh-global`, `dashboard refresh` (global/all targets) | common options/target validation + global output preparation; batch projects keep per-project outcome; ignored custom batch output now rejected | global page + project publications | no-home format/open/output admission; dashboard-preparation failed-project no summary; target-based CLI |
| `merge-queue complete/fail` | `prepareMergeJobCompletion/Failure`: summary/reason/worker/requeue, scoped claimed job, lane ownership, runtime state and completion contract before UPDATE | queue UPDATE / persist protocol | merge-queue-preparation; run-cli-admission |
| `merge-queue note` | `prepareMergeJobNote`: nonempty summary/worker, merged job owned by worker | queue UPDATE / audit | merge-queue-preparation invalid payload/owner no writes + successful note; run-cli-admission |
| `merge-queue cancel` | `prepareMergeQueueCancellation`: reason/worker/force, scoped job, claimed ownership or explicit force, terminal applicability; repeated under transaction | queue UPDATE / audit | merge-queue-preparation: invalid payload/terminal rejection before transaction, force success, idempotent cancel; CLI no-home admission |
| `merge-queue next/claim` | `prepareMergeClaim`: worker, scoped project, stop/ownership, selected FIFO or targeted job, runtime transition; reread under transaction | queue UPDATE / state publication | merge-queue-preparation no writes for invalid state; run-cli-admission no-home; successful FIFO-neighbor CLI test |
| `merge bundle claim` | `prepareMergeBundleClaim`: branch eligibility, worker/stop/ownership, all runtime transitions; all queue rows claimed before publishing any file | queue UPDATE / state publication | run-cli-admission; existing successful bundle CLI test |
| `merge-queue wait-next` | `prepareMergeQueueWait`: worker/boolean, shared lane timer limits, project/next transition, matching existing lane or valid new directory; stopped outcome preserved | automatic lane creation / waiter / heartbeat / claim | merge-queue-preparation: invalid inputs and not-ready protocol create no lane/waiter or SQL writes; valid prepare pure; CLI no-home |
| `merge bundle complete/fail` | `prepareMergeBundleCompletion/Failure`: every member uses same single-job preparation; applicability refreshed under transaction before first member write | queue UPDATE / persist protocol | merge-queue-preparation: invalid second member leaves first file and both queue rows unchanged; successful complete/requeue; CLI admission |

`readProtocolRuntimeState` no longer performs implicit file/DB repair, even on
a writable connection. Explicit `repairProtocolRuntimeState` (cleanup) retains
repair behavior. Regression verifies missing-file reads, unchanged caller record,
zero SQL writes during prepare, and successful explicit reconstruction.
This is not a claim of filesystem/SQLite atomicity after execution starts.

## dd-eval: проверенные read-only storage paths

Syntax inventory for all **35** dd-eval leaf routes now lives in
`lib/cli-input.mjs` and is consumed by the real CLI and `cli-input.test.mjs`.
Each route tests accepted option names, extra/missing command tokens, unknown
and prototype-like options, missing values and duplicates. Each route is also
invoked through the actual executable with `--__proto__`; it must exit usage/2
without creating either home. Payload/state coverage is tracked by the
command-family rows above and by the final P1–P8 qualification in the
implementation plan; syntax inventory is only the parser half of that evidence.

| Команда | Входы и чтение | Первый эффект | Evidence |
| --- | --- | --- | --- |
| `homes list` | parse/arity/options; `listHomes` reads and validates existing registry; missing file returns empty, corruption propagated | none | homes.mjs source audit; homes.test.mjs |
| `homes add` | shared service validates path/label/automatic shape, resolves physical readable directory before updateHomes; existing lock validates retained registry | registry parent/lock / atomic registry replacement | homes.test malformed/missing/file targets no home, invalid label preserves existing registry; concurrent physical deduplication and corruption preservation |
| `homes remove` | shared service validates ID/path and resolves existing target read-only; lock rechecks the same retained ID/root | registry lock / disabled flag publication | homes.test missing target no home (direct + CLI), existing bytes unchanged, path/ID/repeated disable |
| `storage ls` | optional case filter; `evalHome` resolves path only, runRecords reads manifests/journals; missing runs root empty | none | storage.mjs source audit; storage.test.mjs |
| `storage status` | no payload; same retained records, no size-tree traversal or status repair | none | storage.mjs source audit; storage.test.mjs damaged journal preserves other runs |
| `runner control request` | request/mode plus retained RUN/execution identity and runtime executable are validated before publishing the durable control intent | `control.requested` append, then runtime scope control | runner-control: malformed retained execution rejects with no events file |
| `runner fork` replay | stable request/source/execution/checkpoint/output/engine scalars resolve an existing fork receipt before source manifest or snapshot reads; fresh forks retain complete source/fixture/baseline/engine preparation | target parent/lock/registry only for a new fork | runner-fork 12 PASS, including replay after deleting the source EVAL (`/tmp/dd-039-fork-full.log`) |

Verification of homes/storage after homes input fixes: 4 PASS. Unknown removal
now resolves before updateHomes; non-string labels cannot corrupt a registry.
Input errors use usage/prepare/no_effect/recoverable; corruption and a changed
target under lock remain infrastructure failures. This does not prove all GC
behavior or the other dd-eval families.

## Qualification notes

Дополнительно рассмотрены snapshot create paths: bootstrap проверяет Git HEAD/
branch и destination до копирования; run snapshot использует общий
`prepareEvalRunSnapshotCreation` до writer admission и временного output.
Regression: `eval-snapshots.test.ts`, `run-cli-admission.test.ts` (bootstrap
без Git, взаимоисключающие режимы, отсутствие output/home при отказе).
Named branch/HEAD feature-workspace также проверяются до копирования; regression
с detached HEAD доказывает отсутствие copy/output parent. Это не закрывает
оставшийся аудит внутренних recovery artifacts: они не являются пользовательским
JSON payload.

- The final closure and exact gate evidence are recorded in
  `039-cli-prepare-before-execute.md`; live E2E remains separate.
- `stage start`: bootstrap intake/directory исправлены, но это не подтверждает
  весь vNext start applicability до hook claim по всем семи стадиям.
  All seven vNext starters now have explicit source-preparation rows above.
  These do not close legacy stage paths or every finish/direct-service route.
- Dashboard explicit output проверен; batch refresh/implicit destinations не
  закрыты проверкой одного HTML output.
  Project/protocol refresh now checks its implicit summary/project/global paths
  before publication and before CLI writer initialization. Auto-refresh uses the
  same output check (but preserves its existing disabled/recovery skips).
  Refresh-all retains per-project best-effort results: failed project render no
  longer publishes that project's summary first; global output may still exist.
  Nested project HTML publication additionally prepares all selected protocol
  pages before parent/child writes (dashboard-preparation: blocked second output,
  no partial files, then success; built CLI global/project/protocol render PASS).
  This is not evidence for refresh-all/summary/auto-refresh coverage.
- `run drive answer`: accepted operation is resolved by RUN/request-id before
  opening its transient source. Same pause replays after source deletion or
  controller completion; another pause conflicts. Direct and real CLI regressions
  PASS (`/tmp/dd-039-controller-answer-final.log`,
  `/tmp/dd-039-controller-answer-cli-rebuilt.log`).
- dd-eval имеет отдельные входы и side effects; dd-flow строки их не покрывают.
- `runtime scope resume/status/reconcile/serve`: explicit rows above supersede
  the initial payload-only gap. This does not close other runtime process routes.
- Runtime process stop/reconcile payload/timer preparation verified (130 PASS
  managed-process + admission suite). Not yet complete: read-only registry
  applicability/ownership before writer creation; other process mutations.
  Update: stop ownership/identity and status now use read-only resource access;
  explicit rows above supersede that part of the gap. Other mutations remain.
- The final P1–P8 audit supersedes the earlier incremental "not closed" notes;
  focused evidence remains useful for locating each contract regression.
