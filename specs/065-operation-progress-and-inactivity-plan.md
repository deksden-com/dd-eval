# 065 — Продвижение операций и скользящие окна неактивности

Дата: 2026-10-04. Статус: **план; реализация и live acceptance не выполнены**.
Readiness после аудита и повторной проверки: **готов к реализации на указанных
revisions**; контрактные решения и обязательные gates уточнены в §11.
Это не receipt успешной реализации/живой приёмки.

Исходные revisions: dd-flow `776112522e59fab5c977d43b0c0c1cd5b54940eb`,
ветка `fix/064-managed-lease-renewal`, beta.125; dd-eval
`58a5fc2fa589a38ff890efd865b5c20104224ff8`, ветка `fix/064-managed-lease-eval`.
Этот документ — SSOT доработок следующего цикла; реализованный план 064 и
его исторические receipts не переписываются.

## 1. Цель, границы и критерий правильного ожидания

Работа Subject, Judge, reviewer, external worker и MERGE не прерывается лишь
потому, что долго длится. Подтверждённые новые сигналы текущей операции
сдвигают окно её неактивности. Служебный heartbeat, polling, старое событие
или потеря наблюдения не являются продвижением агента.

Scope: все timeout/deadline/progress paths dd-flow `src`, runtime assets и
операционные scripts; dd-eval `lib`, `bin`, scripts; tests и runbooks этих
путей. Включены все шесть bundled harnesses, daemon и standalone entrypoints,
Subject/Judge/worker/MERGE, startup/readiness/checks/recovery/cleanup.

Не исправляем продукт, не снижаем требования corpus/Judge, не используем
черновой JSON как verdict, не редактируем исторические EVAL/native artifacts.
Не создаём новый scheduler, telemetry store, retry framework или зависимости.
Автоматизация heartbeat Codex не входит в этот план.

Абсолютные authority/native/SLA ограничения классифицируются отдельно:
lease/lane/token expiry, native hook deadline, lock wait, signal escalation,
продуктовая latency assertion и UX `waitMs` не обозначают зависание модели.
Их не удаляем механически вместе с продуктивными wall-clock caps.

## 2. Уже установленный failure и источники

CP194 Luna: новый scored E2E ещё не начат. Две exact-definition Judge
qualification попытки приняли первые семь из 18 corpus items; восьмой
`luna-cp190-exact` был прерван внешним общим deadline 10/15 минут.

Во второй попытке native журнал содержит 113 item/turn-start сигналов;
максимальный интервал 71.062 s. Успешный tool завершён в
`2026-10-04T09:16:37.670Z`; native Turn interrupted в `09:16:45.277Z` после
caller timeout и cancel-tree cleanup. Auth, overload, semantic rejection и
мертвый Judge этим failure не установлены.

Источники: `runbooks/cp-194-luna-plan064-recovery-readiness.md:256–329`;
retained qualification key
`f6d8b4f096946e2de31440f6c2603ebbd5a15fc0930f360510c248da2de8f53a`,
operation `operation-fdd7db06-adc5-416b-b9af-355efa8b38ed`,
`interaction-judge/specify-b6c2e0d1/events.jsonl` и `cleanup.json`.
Артефакты сохраняются неизменными; новый policy проверяется новой попыткой.

Корень: внешний `qualificationTimeoutMs` живёт от подготовки до verdict,
передаётся в transport, admission и retained capacity chain. Native progress
не обновляет эти deadlines. `modelProgressPump` наблюдает выбор/reroute модели,
а не reasoning/text/tool liveness. Увеличение 10 → 15 минут не исправило policy.

## 3. Реестр уже расследованных дефектов

Метки: **F** — установленная причина живого failure; **P** — поведение
воспроизведено offline; **C** — подтверждённая ветка кода/нарушение контракта,
участие в историческом EVAL не утверждается. Каждому пункту нужны fix и
runnable regression; одного изменения названия timeout недостаточно.

| ID | Основание и место | Системное исправление / regression |
|---|---|---|
| T01 F | EVAL `lib/runner.mjs:1239,2082,2178,2884`, `lib/judge-capacity.mjs`: qualification общий wall deadline прерывает живой Judge | Qualification использует продуктивный Judge lifecycle без elapsed-work cap; убрать производные от него caller/admission/retained capacity lifetime deadlines, но не issued authority expiry. Активный 8-й item переживает прежний лимит; истинная тишина остановлена отдельно |
| T02 C | FLOW `external-work-launch.ts:87–145`, `merge-server.ts:96–140`: 45 min transport и retained capacity deadlines | Убрать общий предел первоначального и continuation prompt во всех worker/reviewer/MERGE callers; exact operation ID/input и ownership сохраняются |
| T03 C | Те же локальные wrappers: `timeoutMs?: number` + truthiness spread | Пропускать deliberate `null` без превращения в default control timeout; различать omitted/null/positive. Test сквозь caller, не только helper |
| T04 C | ZCode standalone `dd-zcode.mjs:965`: default request budget 30 min; daemon уже передаёт `null` | Standalone и daemon одинаково не обрывают активный prompt; не возвращать daemon cap. Control RPC budgets остаются отдельными |
| T05 P | Codex `dd-codex.mjs:109`: неизменный usage и delta предыдущего Turn увеличивают session counter | Progress после validation текущего Turn/operation, usage только при фактическом продвижении; отдельная проверенная child ancestry |
| T06 C | Codex `waitForTurn:564–618`: expiry раньше terminal reread; read errors превращаются в отсутствие Turn | Terminal reconciliation до verdict о тишине; различить subject quiet и observation lost. Boundary race без повторного prompt |
| T07 P | ZCode/shared ACP `request:345`: `inactivityRecorded` не сбрасывается после возвращения активности | Quiet episodes привязать к текущему request/cursor; каждый новый период тишины наблюдаем, но непрерывная тишина не спамит probes |
| T08 C | ZCode daemon `onInactivity:256`: durable `quiet` не обновляется при активности; root-only map | Сохранять актуальное состояние, проверять exact request/generation после async probe; учитывать доказанную child activity. Не inspect/resume non-resident active child как способ heartbeat |
| T09 C | ACP `isProductiveSessionNotification:458`: denylist допускает служебные/старые updates; нет request-level scope | Явная проекция productive native signals; ACP request generation/Session binding, event cursor где доступен. Cosmetic `thinking_*` не progress; реальные thought chunks — progress |
| T10 P | AGY `observeProviderActivity:256`, `callDaemon:162`: activity до identity validation, adjacent-only dedup, status active_operation не сверяется | Root/descendant/current operation validated до обновления; различать same-step content advancement и replay; foreign/stale A/B events не продлевают |
| T11 C | AGY `Runtime.args:247`: `--print-timeout 6h` | Штатный `--print-timeout 0` (подтверждено installed `agy --help`); daemon inactivity monitor остаётся. Проверка argv + активный fake native Turn дольше прежнего cap |
| T12 C | Droid `receive:147`: counter до identity, metadata учитывается; OpenCode `prompt:39–60`: hash raw history | Семантическая current-operation progress projection, checked children; changing metadata/history order не активность, реальные новые chunks учитываются |
| T13 P | Shared `ObservationClock.sample`: repeated gaps обнуляют elapsed без provider signals | Gap = observation uncertainty, не progress; отдельное конечное восстановление наблюдения, без бесконечных grants и без ложного subject-dead |
| T14 C | Clock consumers передают только counter, не время native progress; `observedTimeout` без progress остаётся budget | Timestamp/cursor остаются в том же clock domain; delayed poll не выдаёт второе полное окно. Правильно именовать неподвижные technical budgets |
| T15 C | `code-checks.ts:629` общий для CODE/bootstrap/runtime-service: только lease renewal, stdout/stderr напрямую fd | Добавить operational check inactivity observation, не засчитывать lease/UI elapsed. Не путать долгую тихую допустимую команду с доказанной смертью; terminal/cleanup доказательства обязательны |
| T16 C | `runtime-service.ts:47`, baseline `timeout_ms`: общий предел готовности/command независимо от полезной работы | Разделить инфраструктурное ожидание startup/command и намеренную продуктовую SLA assertion; sliding по настоящим фазам/выводу, не по повторному 503 или polling |
| T17 C | daemon startup, RPC, driver recovery, settlement loops имеют абсолютные budgets без фазовой проекции | Для долгих наблюдаемых фаз — sliding по фактическим переходам; отсутствие partial RPC signals не исправлять heartbeat другого Turn. Native/safety constraints явно документированы |
| T18 C | Нынешние tests проверяют clock/первую quiet episode, но не всю caller→native цепочку | Controlled clocks + stream/IPC barriers, реальные bundled entrypoints/installed assets, positive и negative cases; CI anti-wedge cap не объявлять agent watchdog |
| T19 C | EVAL `isObservationLoss` не включает свой `definition_qualification_timeout`; `callDriver:1274` пропускает original-operation reconciliation, `interactionJudge:2238` отменяет tree | Разделить transport/observer expiry и proven native inactivity; exact terminal/operation reread до authorized cleanup, без blanket retry неизвестного результата |
| T20 C | EVAL `process-json.mjs:34,93`, `managed-flow-client.mjs:19,29`: обычный status/utility CLI может ждать бесконечно; recovery context покрывает лишь часть callers | Phase-specific guard в existing subprocess helper + owner cleanup; status observer timeout не отменяет detached RUN. Обновить prepare/install/snapshot/git/status/stop consumers и cancellation |
| T21 C | Unbounded helper children: ZCode `commandOutput/runWithStdin:39–62`, Grok `commandOutput:16`, `forwardUsage:88`, daemon `commandOutput:46`; AGY `forwardUsage:65`; Codex version helper | Operational phase observation отдельно от model clock; существующий subprocess helper/owned process cleanup. Ingest/read/doctor failure не переотправляет успешный native Turn |
| T22 C | MERGE `merge-server.ts:89–98`: background dispatch lease failure лишь журналируется, in-flight adapter не получает AbortSignal | Один signal от окончательного failure existing lease monitor к owned transport await; preserve exact native outcome/settlement и original cause, no capacity successor после fence |
| T23 C | `runCheck` также обслуживает long-lived runtime service | Explicit finite-check/bootstrap, service-startup и serving phase policy; quiet serving после ready допустим. Нельзя ставить global stdout quiet kill на все callers |
| T24 C | Scope worker `runtime-scope-worker.ts:167` проверяет budget до exact published release; Droid `dd-droid.mjs:291–299` после async recovery не перепроверяет новую activity | Valid terminal/generation/supersession и fresh progress проверить после await и перед timeout; source-order race tests, не объявлять этот риск причиной прежнего EVAL |
| T25 P/C | Clock принимает Infinity; часть bin parses `Number(timeout)` без positive finite validation; helper теряет `progressAt`, future/stale timestamps могут дать лишнее окно | Единый positive-finite boundary для quiet/control, deliberate null только для разрешённых work caps; atomic cursor/time observation, stale/future marker не grants. Native AGY0 — другой явный контракт |
| T26 C, migration | Baseline сейчас без periodic renewal: прежний total max10 min был меньше lease15 min; sliding снимает эту гарантию | В том же пакете baseline перевода добавить exact baseline owner background renewal/closing/fences из existing pinned maintenance helper; command output не authority |
| T27 C | FLOW/EVAL recovery cumulative120 s и controller settlement absolute120 s не учитывают фактическое продвижение settlement | Sliding quiet reconciliation по exact монотонным шагам закрытия/публикации; сохранить persisted episode/progress и distinct observation-lost budget, no replenishment от polls/restart |
| T28 C, acceptance | Qualification key `runner.mjs:2805` содержит whole definition tree, но не runtime-progress tuple | Не смешивать semantic corpus receipt с runtime acceptance. Fresh installed progress evidence pinned на engine/helper contract/native versions; old semantic cache не proof нового runtime |
| T29 C | `code-checks.ts:204`, `engines.ts:335,403,1001`: timeout probes превращён в missing/incompatible verdict | Transport/probe observation timeout отдельно от negative semantic result; безопасный admission отказ с retriable diagnostics, не ложная неисправность executable |
| T30 C | В bin/daemon setup/control/native turn-start reuse одного timeout смешивает acceptance RPC и productive wait; async session.start требует retained identity | Отдельные phase meanings; RPC без partial signals не продлевается чужой activity. Late accepted native request reconciled exactly; raw socket partial bytes не agent progress |
| T31 C, tests | Live harness smoke `scripts/qualify-live-harnesses.mjs:43` ждёт фиксированные2 s перед cancellation; test fixtures часто заменяют готовность sleep | Cancel-after-observed exact native dispatch/started barrier, не угадывание задержкой; CI anti-wedge watchdog остаётся отдельной внешней гарантией, receipt не PASS при NOT RUN/skip |
| T32 C/P | ACP `dd-zcode.mjs:398–399` и AGY `dd-agy-daemon.mjs:182` выдают локальный `subject_liveness_timeout`; FLOW/EVAL `operation-errors` не считают его observation loss; ACP→`daemon-operations.mjs:294–300` пишет exclusive failed terminal | Отделить решение о локальной тишине от native terminal. Сохранять exact outcome как unknown, пока terminal/cancel+settlement не подтверждены. Late terminal не блокируется локальным таймером; regression через ACP→daemon ledger→caller и AGY CLI→EVAL |
| T33 C, long-operation | EVAL `runner.mjs:1236–1240`, `process-json.mjs:47,93`, native bridge/helper stderr растут в RAM; FLOW `harness-adapter.ts:84–98` общий cumulative stderr limit останавливает transport | Разделить bounded final reply и потоковую диагностику: existing logs/journal, bounded diagnostic tail/typed errors, backpressure. Длинный productive stream не ломается по cumulative stderr; JSON не truncate-to-success, output-limit observer failure не provider failure |

Поведение T05/T07/T10/T13 перепроверено main agent локальными actual-module
probes; T08/T09/T12 усилены проверкой sibling paths (§7). T26 — обязательная
совместная доработка, чтобы **не внести** новый ownership defect при смене
baseline policy; это не утверждение, что текущий capped baseline уже работает
после expired lease. T28/T31 — дефекты полноты доказательств/сценария, не native
runtime failures. C-пункты не выдаются за подтверждённые исторические причины.

## 4. Общий контракт реализации

### 4.1 Кто продлевает ожидание

Один владелец productive inactivity policy на native-operation boundary.
Disposable RPC/caller не создаёт второй конкурирующий elapsed-work deadline.
Внешний наблюдатель использует existing daemon journal/operation observations;
потеря связи не разрешает считать native запрос завершённым или переотправлять его.

Минимальная progress observation использует существующие поля:
operation/daemon/Session/Turn или ACP request generation, checked ancestry,
native cursor/item/tool identity, тип сигнала и время его первого достоверного
наблюдения. Не вводить обязательный provider Turn ID там, где ACP его не даёт.
Тогда scope доказывается active request, connection generation, dispatch floor
и native Session/ancestry; недостающая доказуемость отражается как observation gap.

Продуктивные сигналы: reasoning lifecycle/доступные deltas, text deltas,
tool start/state/output/finish, реальное увеличение usage, checked child work.
Не требовать раскрытия скрытого reasoning и не писать его в новую telemetry.
Для lifecycle terminal уже поступивший result имеет приоритет над timeout.

Dedup по идентичности/sequence, не по произвольному text hash: два одинаковых
новых chunks законны. Same AGY step может реально менять content/tool state.
Status/RPC/model-reroute/heartbeat/lease/timestamp файла сами по себе не progress.

### 4.2 Время и gaps

Использовать существующий `ObservationClock`, монотонное время для elapsed.
Wall timestamps нужны для diagnostics/retained observation, не для guessed TTL.
При позднем прочтении known activity окно не начинает заново отсчитываться от poll.
Restore/reconnect/restart не создаёт новую productive activity и не сбрасывает
старую тишину без authority; clock-domain discontinuity — explicit uncertainty.

Gap сам не renew. Допустимо одно восстановление observation episode; новые
polls/gaps не пополняют его budget. После свежего exact-operation signal вновь
следует обычное окно. Если observation восстановить не удалось — retained
`operation_observation_lost`/reconciliation, не fake provider failure или PASS.

Начальные productive quiet thresholds сохраняют действующие значения native
monitors (Codex/AGY 30 min, ACP/Grok/ZCode/Droid 10 min, OpenCode существующий
inactivity setting), но это теперь **не предел длительности работы**. Values
не увеличиваются ради зелёного test. Different observation capability отражается
в сигналах/диагностике, не в divergent flow logic. Их qualification измеряется
отдельно; startup/control/cleanup не наследуют 30-min productive setting.

### 4.3 Inactivity verdict и безопасность

На границе: проверить сохранённый/native terminal той же операции; проверить
восстановление наблюдения/child work; только затем выдавать конкретный verdict.
Сначала durable outcome/uncertainty, затем authorized owned cleanup. Потеря
transport не доказывает cancel native. Нельзя release ресурсов без settlement.
Manual abort/stop и ownership fences имеют приоритет над sliding continuation.

Provider overload продолжать только в той же settled native Session по policy
двух отказов continuation за rolling 120 s. Quota/auth остаются terminal с
reset time где известно. Progress не отменяет этот breaker/исходную ошибку.

## 5. Пакеты реализации

- **W1, clock/контракт:** поправить shared clock/gap semantics и typed observation,
  terminal-before-timeout; синхронизировать переносимую копию EVAL и .d.mts,
  закрепить contract/parity tests. Без framework/дублирующей policy реализации.
- **W2, adapter progress:** T04–T14 для шести adapters; async generation fences,
  native event validation/children/quiet episodes и diagnostics. Проверить все
  bin/daemon/standalone callers; поля cli timeout не смешивают фазы. T32 в
  shared error/daemon boundary, T33 в native/helper stream capture.
- **W3, callers/Judge:** T01–T03; productive dispatch без wall cap, capacity
  chain не содержит старого lifetime ceiling для нового выполнения, helper null
  передан сквозь wrappers. T32 проходит caller reconciliation, T33 отделяет
  потоковую диагностику от final reply. Setup/cleanup/recovery — отдельные policies.
- **W4, команды и фазы:** T15–T17; common runCheck, bootstrap, readiness,
  baseline и ownership/recovery/cleanup consumers. Продуктовая assertion и
  operational quiet policy описываются отдельно, продукт не меняется вручную.
- **W5, tests/diagnostics/docs:** T18 и новые находки аудита; installed runtime,
  normal suites, runbooks, immutable release/qualification identities.

Порядок: W1 → W2 → W3/W4 → W5. Tests вместе с каждым fix. Parallel implementation
возможна лишь после согласования shared contract; source changes не производятся
в рамках составления этого плана.

## 6. Базовая regression и acceptance matrix

1. Active stream сверх прежнего общего cap для Judge, external reviewer/worker,
   MERGE, daemon/standalone; тишина без final и без busy heartbeat всё же обнаружена.
2. Reasoning/tool-only stream; equal new text chunks; changed vs unchanged usage;
   old Turn, foreign Session, stale descendant, repeated/reordered events.
3. Parent молчит, valid child работает; invalid ancestry не renew; long silent
   tool с неполной наблюдаемостью не объявляется proven provider-dead.
4. Quiet → real activity → quiet; одно событие на episode, bounded diagnostics,
   current durable state и async probe не меняет завершённый/replaced request.
5. Delayed sampling/native timestamps, backward wall jump, repeated scheduling
   gaps, resume/reconnect/restart; no unlimited silence grants.
6. Terminal приходит в момент expiry и во время recovery poll; result не потерян,
   status read failure отдельно от provider failure, no native replay.
7. Cancel/owner loss/supersession/replacement во время await; exact tree settled
   перед release; первичная ошибка сохранена отдельно от cleanup uncertainty.
8. Startup/ready/check/cleanup: genuine phase advancement renew, repeated status
   не renew; known native hook deadline, lock/resource authority и SLA сохранены.
9. Same Session overload continuation, два отказа за 120 s, success между редкими
   failures, quota/auth reset time, crash during unknown dispatch — no duplicate Turn.
10. Candidate portable runtime, installed tarball и EVAL pinned helpers имеют
    тот же clock/error/progress contract. Full ordinary suites, не один mock.

## 7. Дополнительный систематический аудит — выполнен

Первичный реестр T01–T18 записан до дополнительного прохода. Три независимых
read-only аудита FLOW, adapters и EVAL; main agent прочитал affected callsites,
проверил цепочки и повторил важные probes. Изменений source/providers не было.
Adapter subagent после содержательных находок получил capacity error; его
незавершённый итог не считается полноценным audit receipt. Main agent сам
завершил проверку предоставленных snippets, timeout parses и sibling paths.

Поиск: `setTimeout`, `setInterval`, `AbortSignal.timeout`, `timeout:`/
`timeoutMs`/`timeout_ms`, deadlines, inactivity/quiet, progress, `Promise.race`,
expiry/wait, subprocess helpers; затем callers и tests найденных механизмов.
`src`, runtime assets, operational scripts, `lib`/`bin` обоих репозиториев;
native source readback Grok/ZCode только для подтверждения thought/tool wire
signals. Проверка не является формальным доказательством отсутствия всех багов
проекта: scope ограничен этим классом и pinned revisions.

### 7.1 Карта всех найденных семейств

| Семейство / проверенные места | Решение |
|---|---|
| EVAL `runner`, `judge-capacity`, `model-progress`; qualification/Interaction/Final Judge/permits | T01/T19/T28/T30. Model selection pump не liveness; очередь permits не native execution |
| FLOW `harness-adapter`, `run-controller-adapter`, external Work, MERGE, capacity policy | T02/T03/T22/T30; main prompt уже null — сохранить, исправить sibling callers |
| Все шесть bin/lib/daemon entrypoints и `daemon-operations`, `.d.mts` | T04–T14/T21/T24/T25/T30; same operation contract, native-specific wire projection |
| Shared `ObservationClock` и две portable copies | T13/T14/T25; monotonic arithmetic, atomic native cursor/time, gap не progress |
| `code-checks`, `workspace-bootstrap`, `runtime-service`, EVAL baseline | T15/T16/T23/T26; finite command vs startup vs idle serving, policy migration |
| Controller capture/recovery, scope/control worker, driver recovery, eval-resume worker, recovery-observation-budget copies | T06/T17/T19/T24/T27; terminal first, genuine settlement advancement, persisted observation episode |
| EVAL `process-json`, managed-flow-client, runner utility callers; native version/usage helper children | T20/T21/T29; owned helper liveness + cleanup, detached native work не трогаем |
| `hooks`, `native-hook-command`, hook/native/maintenance ingress, lifecycle-invocations, codex-hook-delivery, agy-hooks | Keep external native deadline/freshness; phase identity/diagnostics, no reasoning-based hook extension |
| Managed processes/lease monitor/runtime budget, RUN/control/scope/MERGE leases, storage/context | Keep committed receipt/physical binding/CAS/expiry/closing. T22/T26 bridge новые long-lived waits к existing monitor |
| Lanes, work registry, merge queue, runner locks, resource acquisition/permit queue | Keep queue UX/cancel/fencing; polling/другой владелец не progress. Проверить no dispatch после supersession |
| Engine/command/status probes, process snapshot, GC inventory | T29; bounded diagnostic calls допустимы, timeout не proof absence/death и не право GC/reclaim |
| `publish-release`, `release-candidate`, native-hook/matrix qualification scripts, live harness smoke, suite wrappers | T18/T28/T31; scenario watchdog не productive policy, measured readiness и installed-tuple evidence |

### 7.2 Дополнительные воспроизведения main agent

Без network/files/paid requests, actual imported production modules:

- ACP: зарегистрированный child с `parent=root` посылает настоящие thought
  chunks каждые10 ms; root quiet window80 ms истекает. Его sessionActivity не
  агрегируется к root. Это missing-signal sibling T08/T09, не новый provider bug.
  Guard проверяет retained ancestry до roll-up.
- AGY: `Runtime.drain` получает foreign terminal results A/B/A; все не приняты
  как root outcome, но `markActivity` срабатывает3 раза. T10 — wrong-order
  activity admission, не предположение по event names.
- OpenCode: actual `prompt/request` с offline mocked fetch: меняется только
  `updatedAt` **старого** assistant message; response после323 ms переживает
  idle threshold80 ms. Контроль без изменения metadata получает
  `operation_observation_lost` примерно через109 ms. T12. Использовать existing
  `canonicalHistory/stablePart`, current-message boundary и checked children;
  один общий history hash без scope остаётся недостаточным.
- `new ObservationClock({timeoutMs:Infinity})` принят. T25; fake-clock tests
  проверяют Infinity/NaN/negative/zero, deliberate null и timestamp bounds.

Временные интервалы probes — демонстрация ветки, не production threshold и не
performance acceptance. Перенести cases в deterministic repo regressions.

### 7.3 Важные сохранённые ограничения

- Hook host30 s и issued invocation deadline/freshness защищают stale delivery.
  Sliding отдельных hook фаз допустим лишь внутри native limit и по matching
  acknowledgement. Не менять expiry по output модели; не переисполнять admitted
  CLI после ambiguous timeout. Heavy maintenance остаётся в лёгком prepared
  ingress плана064, без RUN migrations/нового daemon.
- Resource SQLite busy wait/request-scoped deadline — contention boundary.
  Renewal attempt5 s/uncertainty30 s и persisted expiry — authority boundary.
  Только committed exact receipt подтверждает владение. True loss/closing не
  откладываются reasoning chunks. Concurrent RUN/resource writers не добавляем.
- Stop signal grace и physical retirement: разрешено продлевать observation
  actual retired target/confirmed phase; не бесконечно отсрочивать forced stop
  из-за продолжающегося model output. No clean/resource release without proof.
- `waitMs`, wait-next, lane/lock/permit acquisition — очередь/response policy,
  не agent silence. `pending` не `provider failed`; неизвестный/live owner не
  reclaimed по возрасту. Чужая native activity не renew queued operation.
- Declared SLA/test deadlines измеряют продукт или ограничивают сам тестовый
  сценарий. Не исправляем продукт, assertions сохраняются и оцениваются Judge.

## 8. Детализация пакетов и compatibility

### W1 — Clock, cursor и observation episode (T13/T14/T25)

1. Переиспользовать `ObservationClock.sample(cursor, progressAt)`; helper читает
   cursor и timestamp **одним snapshot**, не дважды вызывает progress callback.
   Для новых timestamped callers projection `{cursor, observed_at}`; primitive
   legacy marker допустим лишь как локальный current-arrival counter, не poll
   snapshot. Обновить callers и declarations в одной contract migration.
2. Validate finite positive quiet/control/gap durations. `null` означает только
   отсутствие total-work cap, не отключение quiet monitoring. Не трактовать
   произвольный `0`, NaN, Infinity или отрицательное CLI значение как disable.
   AGY native `--print-timeout 0` — intentional separately validated argv.
3. First-known event time + cursor монотонны в scope текущей operation. Old/
   future/unbound marker не даёт окно; uncertain clock skew диагностируется,
   не silently clamp-to-zero fresh activity. No wall-time rollback renewal.
4. Productive quiet threshold берётся из current qualified adapter default.
   Initial observation-loss episode использует existing120 s recovery setting;
   его active observer time и remaining сохраняются между перезапусками. Gap
   не grant, но время отсутствующего наблюдения не доказывает provider silence.
   При повторных gaps остаётся uncertainty; следующее достоверное observation
   возобновляет/заканчивает тот же episode, не создаёт новый автоматически.
   Повторный gap не разрешает бесконечно ждать восстановления: на следующем
   доступном observer turn выполняется bounded read-only exact-operation
   reconciliation; если current progress/terminal не удалось подтвердить,
   возвращается retained observation-lost outcome, а не новое пустое окно.
   Exhausted episode после restart не получает ещё120 s. Это завершение
   наблюдателя с неизвестным native outcome, не доказательство смерти агента.
5. FLOW/EVAL portable copies остаются согласованы byte/contract parity check.
   EVAL runtime helpers всегда из selected candidate; no global/source fallback.

### W2 — Все адаптеры и технические children

1. Codex current Turn + exact child ancestry; usage delta и lifecycle sequence;
   terminal before clock fail, fresh progress после async reads. Не превращать
   recovered completed Turn в failure только потому, что был stale timer.
2. ACP/Grok/ZCode explicit productive kinds + request generation/dispatch floor;
   registered descendants renew root лишь после ancestry validation. Quiet
   diagnostic rearmed после genuine signal; probe snapshot проверяется после
   await, durable quiet не current при последующей работе.
3. ZCode пока нет достоверных child signals не объявляет non-resident child dead.
   Выполнить qualified read-only request/tree observation; signal coverage gap
   имеет конечный observation outcome, не unbounded wait и не automatic resume.
4. AGY activity после validate; bind `active_operation` status; source cursor
   same-step content progression не подавляется. `--print-timeout 0`.
5. Droid validate до counter, timeout candidate после recoverOperation требует
   recheck active operation/generation/current outcome **и новой activity**;
   сбросить checking latch при renewed work. OpenCode semantic current content
   projection вместо old raw metadata; child order стабилен, checked ancestry.
6. Helper subprocess doctor/version/models/usage ingest — own phase quiet guard
   и cancellation/physical cleanup. Расширить existing subprocess helper для
   operational mode, не копировать hook-budget algorithm. Hook/native total
   budget остаётся явным отдельным mode. Silent utility timeout — typed local
   observation failure; latest native success отдельно, no provider prompt retry.

### W3 — Productive callers, MERGE ownership и Judge

1. Удалить `qualificationTimeoutMs` как productive total-work budget, связанные
   pre-dispatch remaining deadline и transport kill. Использовать existing
   Interaction/Final Judge lifecycle; startup/create/control observations отдельны.
2. External Work/MERGE wrappers принимают number|null; productive calls передают
   null; больше не генерируют45-min retained chain deadline. Capacity breaker
   rolling120 s не меняется, cancellation/generation/ownership rechecked.
3. MERGE in-flight transport получает AbortSignal existing dispatch monitor;
   transient uncertainty не abort до policy exhaustion, definite loss/fatal
   failure возвращает retained cause. Native operation thereafter read-only
   reconciled; no second prompt/auto cancel чужого/replaced tree.
4. Typed transport expiry входит в observation-loss handling. Перед `finally`
   cleanup принять exact already-terminal outcome; если неизвестно, preserve
   original operation ledger и authorized cleanup/reconciliation вместо replay.
   Existing `recoverOnly` publication после старого deadline сохраняется.
5. `session.start` acceptance — не complete; не вводить второй native prompt
   при late receipt. Не менять фактические overload/quota/auth classifications.

### W4 — Checks/baseline/readiness/observer/recovery

1. Common `runCheck` наблюдает actual stdout/stderr/known completion с сохранением
   retained logs, backpressure и fd lifetime. Не читать весь растущий log каждые
   poll. Finite check и bootstrap получают quiet guard; runtime service явно
   phase startup до readiness, serving без output-based quiet kill. Exit/explicit
   stop/ownership всё ещё наблюдаются. Idempotent stop + exact process cleanup.
2. Для новых baseline definitions policy@2 содержит `inactivity_timeout_ms`
   positive integer1..600000 вместо absolute `timeout_ms`; @1 читается лишь
   как legacy absolute policy с сохранённой семантикой. Не переписывать pinned
   старую policy. Новый pin/new admission receipt (checkpoint менять только если
   case-input/checkpoint contract того требует); source product bytes неизменны.
3. Sliding baseline может работать дольше lease15 min: pinned maintenance
   background renewal/single-flight/closing в exact registered child binding,
   commit-expiry acknowledgement. Timer стартует после admission как сейчас;
   output не продлевает lease, renewal failure не подменяет command failure.
4. `process-json` commandJson/commandText и utility helpers: defaults по фазе
   status/control30 s quiet, process snapshot existing5 s, version/model existing
   budget, long clone/install/build — explicit30 min quiet budget, not total;
   caller override только positive finite и с указанной фазой. Частые служебные
   keepalive строки не advancement: использовать real subprocess output/phase,
   а для structured output исключать известные heartbeat/poll records.
   Caller signal + internal guard композиция, real progress где доступен;
   при отсутствии частичных сигналов bounded request означает observation lost.
   Убиваем только exact owned helper, сохраняем detached RUN/control intents.
5. Recovery budget@next остаётся120 s **тишины подтверждённого settlement**;
   monotonic durable phase/retired targets/committed receipt renew, same status/
   poll/attempt/metadata не renew. Persist marker и remaining, legacy cumulative
   receipts don't gain grants silently. Subject signal не cleanup progress.
   Observation-loss episode (§W1) отдельно, same native operation/no replay.
6. Terminal-order readback во всех loops (scope/control/controller capture/
   adapter/EVAL observer/native timer): exact existing receipt первым, matching
   supersession fence перед timeout. Истёкший budget не разрешает новую mutation
   ради «последней попытки»; final check read-only и bounded.
7. Engine/executable probes: inspect timeout/error/signal отдельно от actual
   missing dependency/nonzero semantic response; unverified compatibility
   блокирует новый dispatch, но возвращает observation/probe unavailable cause.

### W5 — Diagnostics, tests и rollout

Существующий journal/error serializer хранит operation/Session/Turn/generation,
phase, cursor/type/source, last signal age, quiet threshold, observation state,
remaining recovery budget, owner/terminal/cleanup disposition. Не сохранять
reasoning/text/credentials/lease token в новых diagnostic records. Primary
failure и post-native publication/usage/cleanup failure не смешиваются.

Update `runbooks/execute-eval.md`, `e2e-monitoring.md`, `update-harnesses.md` и
CP194 successor readiness: правильные signal/probe/terminal interpretations,
exact installed hooks/runtime, fixed productive caps prohibited, native limits
и pending/observation-loss отдельно. Не переписывать прежний runbook outcome.

Исторические paid capacity chains и failed qualification attempts неизменны.
Новый engine/candidate не редактирует pinned runtime старого RUN. Old unknown
operation только exact recovery под её contract; никакого обнуления deadline
в retained JSON. New attempts/new receipt namespace для новой policy.

Qualification key уже включает whole committed EVAL definition tree: новый
commit автоматически требует новой semantic qualification, cache не удаляем.
FLOW-only change не меняет эту identity: семантический receipt не выдаётся за
runtime proof. Использовать existing release/qualification evidence отдельно
для exact engine artifact SHA/source/progress contract и harness version/config
subset, важных для выполнения (не blanket hash всего native home). Full fresh
18-item corpus нужен для нового CP194 запускного tuple, как и runtime acceptance.

## 9. Test targets, проверка полноты и приёмка

| Пакет / пункты | Existing targets и обязательные добавления |
|---|---|
| W1, T13/T14/T25 | EVAL `observation-clock.test.mjs`; FLOW `harness-runtime-assets.test.ts` / actual imported clock parity. Repeated gaps, delayed/future/stale cursor, numeric boundary |
| W2, T04–T12/T21/T24/T30 | `fixtures/codex-adapter.mjs`, `zcode-adapter.mjs`, `grok-adapter.mjs`, `agy-adapter.mjs`, `agy-state-boundaries.mjs`, Droid/OpenCode fixtures и `native-adapter-contracts.test.ts`; actual six bin/daemon asset tests |
| W3, T01–T03/T19/T22 | EVAL `judge-capacity.test.mjs`, runner/qualification tests; FLOW `external-work-launch.test.ts`, `merge-server.test.ts`, `harness-adapter.test.ts`, `run-controller-adapter.test.ts`. Full active-over-old-cap + ownership stop + no replay |
| W4, T15–T17/T20/T23/T26/T27/T29 | Existing FLOW `code-checks.test.ts`, `runtime-service.test.ts`, `runtime-scope-worker.test.ts`, `run-control-worker.test.ts`, `run-controller-capture.test.ts`, `runtime-recovery.test.ts`, `recovery-observation-budget.test.ts`, `engine-installation.test.ts`; bootstrap coverage добавить через existing caller tests либо новый `workspace-bootstrap.test.ts` (сейчас его нет). EVAL `process-json.test.mjs`, `managed-flow-client.test.mjs`, `baseline-admission.test.mjs`, `runner-control.test.mjs`, `recovery-safety.test.mjs`, `runtime-maintenance.test.mjs` |
| W5, T18/T28/T31 | Existing candidate pack/accept, installed cold-hook/maintenance/portable asset qualifications, complete ordinary suites и corrected live smoke barriers (live только отдельно) |
| W2/W3/W4, T32/T33 | FLOW `native-adapter-contracts.test.ts`, `harness-adapter.test.ts`, `fixtures/daemon-operations.mjs`; EVAL `process-json.test.mjs`, `runner-recovery.test.mjs` и добавить focused `operation-errors.test.mjs` (сейчас его нет). Shared error contract parity, long stderr, late terminal и unknown dispatch fence |

Часть capacity tests skip без `DD_FLOW_SOURCE_ROOT`. Acceptance задаёт exact
audited source для source-linked tests; installed evidence использует exact
selected CLI/package bytes, не source fallback. Отсутствующий suite/skip есть
NOT RUN, не полный PASS. Цифры прежних receipts не переносятся на новый source.

Replace tests, закрепляющие total-work deadline refusal (EVAL `judge-capacity`
Retry-After>budget/deadline-at6001), на scope-specific assertions. Preserve
exact publication recovery-after-deadline, no replay, true no-progress expiry,
admission/authority deadlines и physical cleanup tests. Не удалять negative
timeout coverage ради облегчения positive runs.

Использовать existing node:test/Vitest mock clocks; long15/30/45-min сценарии
моделируются clock advance. Stream sequencing/child ownership — IPC barriers.
Не строить custom fake provider framework; расширить existing fixtures. Suite
watchdog защищает CI от вечного теста, не служит runtime liveness evidence.

Основные команды будущей реализации (не запускались при планировании):

```sh
# dd-flow implementation checkout
pnpm typecheck
pnpm build
pnpm test:integration
pnpm test:runtime-sensitive
pnpm test:release

# dd-eval implementation checkout, exact paired source для capacity targets
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation node --test
git diff --check
```

Дополнительно packed candidate installed checks по existing release runbook:
source/build/portable assets/CLI identity совпадают; холодные hooks/maintenance,
clock ABI и observation errors проверены в isolated homes. Никаких real runtime
homes в test fixtures. Full corpus qualification проводится после commit нового
definition и accepted candidate, не вместо offline tests.

Для каждого T01–T33 implementation report содержит fix commit, regression name,
source/installed receipt и статус PASS/NOT RUN. Любой не закрытый существенный
пункт препятствует claim «план реализован полностью». Scope-dependent native
signal gap тоже требует тестируемого bounded outcome, не deferred TODO.

Live acceptance — отдельная разрешённая фаза, не действие текущей задачи:
fresh exact-definition qualification, baseline/preflight; затем новые homes и
полный цикл harnesses без repair старых результатов. Startup success не равно
full E2E success; actual Stage по controller/timeline, FinalJudge/product verdict
и infrastructure result раздельны. Failure изучается без manual product fixes.

## 10. Итоговая проверка ponytail и граница завершения

Проверка ponytail: переиспользуем ObservationClock, existing journals/daemon
operations/recovery/settlement и test runners. Удаляем конкурирующие work
deadlines вместо увеличения чисел. Adapter-specific остаётся только перевод
native signals и подтверждение identity/capability. Не добавляем telemetry DB,
набор параллельных watchdogs или dependency.

Завершение реализации: все T IDs закрыты fix + executable test либо проверенным
shared coverage; нет live-work wall caps и fake progress, true silence observable,
unknown native outcome не replay, authority/native contracts не ослаблены.
Offline complete и live E2E proven — разные статусы. Новый candidate и отдельная
exact-definition qualification/live acceptance обязательны до новых E2E; не
переносить старые receipts на новые bytes. Во время планирования E2E не запускаем.

Результат проверки **ponytail full**: убираем причины (конкурирующие work
deadlines, unscoped activity и пробелы наблюдения), не поднимаем30/45/6h числа.
Общий clock и существующий operation ledger остаются SSOT; минимальные native
projections и phase argument для реально разных задач. Сохранённые authority/
native/SLA/UX constraints имеют конкретную safety цель. Нет необоснованного
контроля native private home, новых зависимостей, event bus, telemetry store,
второго controller или универсальной retry платформы. Необходимые tests и
ownership/cancel/no-replay validation не сокращаются под видом минимализма.

Дополнения этой задачи: T19–T31; missing child signal и raw metadata поведение
T08/T09/T12 усилены offline production-module probes; новый baseline renewal,
service phase exception, MERGE abort wiring, portable/cached proof distinction,
terminal-after-await recheck и helper/no-progress coverage обязательны. Все
пункты имеют владельца пакета, минимальное исправление и regression criterion.

## 11. Повторная проверка готовности — 2026-10-04

Первичная версия плана описывала направления верно, но допускала различные
трактовки ниже. Решения этого раздела обязательны и уточняют §4/§8/§9.
T32/T33 добавлены при этой проверке. Source revisions не изменились.

### 11.1 Clock boundary, dispatch и рестарт

- Quiet window начинается после admitted native dispatch, не при создании
  qualification, ожидании permit, загрузке истории или подготовке профиля.
  При отсутствии первого сигнала dispatch является началом ожидания, но не
  повторяющимся progress event. Early native events, пришедшие до dispatch ACK,
  буферизуются и принимаются после проверки identity/floor, а не теряются.
- `cursor` — advancement в scope текущей операции, не hash всего Session,
  не `Date.now()` каждого poll и не локальный UUID повторно прочитанного event.
  Timestamped snapshot `{cursor, observed_at}` использует числовые Unix ms
  **первого** наблюдения validated события. ISO native timestamp переводится
  один раз на native boundary; произвольное время из provider payload не
  является доверенным временем clock. Equal timestamps допустимы при новом
  cursor: два настоящих chunks в одной миллисекунде не потерять.
- Владелец native stream измеряет elapsed монотонно. Переносимый wall marker
  переводится в возраст только в доказанном clock domain с проверкой epoch/skew;
  затем возраст растёт монотонно. `performance.now()` разных процессов нельзя
  напрямую сравнивать. Wall rollback не renew и не уменьшает накопленную тишину.
  После restart сохраняется remaining/cursor/policy/generation; отсутствие
  такого доказательства даёт reconciliation/unknown, не новое полное окно.
- Duration boundary: number, finite, целое количество ms ≥1. Значение для
  timer-backed API ≤2_147_483_647 ms; CLI seconds после умножения проверяются
  повторно. Иначе validation failure **до spawn**, не Node clamp-to-1ms или
  silent disable. NaN/Infinity/string/overflow/mixed flags покрыты tests.
  Null work transport и native AGY0 остаются двумя отдельными разрешёнными cases.
- Repeated gaps: сохраняем accumulated quiet и один observation episode;
  recovery не подменяет work progress. Повторный gap до подтверждения текущего
  состояния приводит к bounded read-only check и затем unknown при отсутствии
  подтверждения, без очередного grants loop. Wall skew без scheduler gap также
  не доказывает subject failure. Tests разделяют эти случаи.

### 11.2 Кто наблюдает и что считать новым сигналом

| Native boundary | Progress projection / дополнительные проверки |
|---|---|
| Codex bridge | Current Session/Turn + typed item/delta/usage advancement; delayed old Turn не renew. Child ancestry и current child operation доказаны отдельно |
| Grok/ZCode ACP bridge | Active request generation, connection/floor, bound Session и retained ancestry. Real text/thought/tool kinds; model/title/status/heartbeat/cosmetic hints не progress |
| AGY daemon Runtime | Current turn_generation/operation, ordered native input/stream и root/checked descendants; step_index вместе с semantic content/tool advancement. CLI status-reader не второй model watchdog |
| Droid native bridge | Session/operation, current tool/reasoning/content transition; unbound notification не progress. Recheck после async recovery |
| OpenCode client | Previous message IDs — floor; только новые current messages/parts и current checked children. Stable canonical semantic parts; old message edit/reorder и stale child history не renew |

Для snapshot API semantic change одного current step может быть progress; для
append-only stream два одинаковых новых chunks могут быть progress. Не вводить
один text-hash алгоритм на все providers. Dedup/high-water state ограничено
текущей operation; no unbounded lifetime event-ID set. New child registration
не даёт автоматического progress от всей его прошлой истории.

Probe/quiet callbacks single-flight для exact operation + generation + cursor.
Новый сигнал во время probe отменяет stale quiet verdict; после await проверяем
и identity, и current cursor, не только `active_request` existence. Completed/
superseded request не resurrect; новый genuine quiet episode rearmed. Quiet
durable write/очередь записи не блокирует admission native событий.

Quiet long-running tool с неполным signal coverage не имеет доказанной смерти:
один bounded exact-operation/tree probe, затем observed terminal, renewed
validated progress или observation-lost. `running`, resident/PID alive и
повторное описание tool сами по себе окно не renew. Тихое выполнение нельзя
автоматически replay/resume. Tests обязаны проверять конечный unknown outcome,
а не только наличие одной diagnostic записи.

Trusted HITL/context/capacity wait — отдельная **неproductive** phase. Native
quiet clock не измеряет время оператора, но приостановка допустима лишь по
exact bound pause/accepted controller state и доказанному ожиданию input либо
settled previous Turn. Произвольный `busy`/`waiting` event не выключает guard.
На accepted continuation новая operation получает своё окно; answer dispatch
fences и physical ownership остаются. Regression: long HITL wait без false
timeout и ложный wait event, который не скрывает тишину модели.

### 11.3 Outcome, отмена и поздний результат — T19/T24/T32

1. Проверить exact identity/generation/fence; уже sealed/superseded результат
   не переписать. Control/cancel/lease failure не становится PASS от позднего
   сообщения модели. Сохранить его native outcome отдельно, если оно доказано.
2. Прочитать current terminal и применить прежние profile/hook/output validators.
   Terminal priority не значит принять черновой JSON, один final message или
   root completed при работающем tree как полный успешный EVAL.
3. Разделять native outcome, observation disposition и tree settlement.
   Completed root + active child: native result retained, settlement pending;
   stage success/resource release только после required settlement.
4. После await повторно прочитать progress/terminal. Если остаётся quiet,
   local inactivity error включает operation/generation/last-signal evidence;
   это не provider terminal. T32 обновляет shared error contract и EVAL copy,
   а не только список сообщений в одном catch.
5. При unknown daemon ledger пишет observation-lost, не exclusive failed slot.
   Unknown dispatched operation сохраняет productive fence; inspect/cancel/
   settlement разрешены, новый prompt запрещён до exact resolution. Не очищать
   единственную retained identity или освобождать слот по выходу observer CLI.
   Late matching terminal может закрыть original operation до confirmed abort;
   terminal после sealed cancellation сохраняется как evidence, не overwrites.
6. Manual abort/true owner loss останавливает только owned процессы/transport,
   не откладывается native progress. Promise completion, timer/listener teardown,
   log flush и physical close — однократны. Primary error остаётся primary;
   cleanup/publication uncertainty записывается отдельно. Подтвердить close/
   retirement прежде finalization ресурса, не по одному `error`/`exit` событию.

### 11.4 Public options и retained policy

- Все шесть новых bundled entrypoints используют `--liveness-timeout` в seconds
  для productive quiet window (существующий ZCode flag переиспользуется).
  Для `session.prompt` старый `--timeout` — documented compatibility alias
  **quiet**, больше не total-work cap. Если указаны оба, значения должны
  совпасть, иначе usage error до dispatch. Семантическая смена явно отражена в
  новом pinned runtime/progress contract; старые pinned binaries не меняются.
- На control/setup `--timeout` относится к соответствующей фазе, не наследуется
  productive Turn. `session.start` bounded acceptance и subsequent native work
  — разные waits. `--request-timeout` не задаёт предел работы prompt; там, где
  API не отделяет acceptance, explicit productive request cap отклоняется,
  а не молча игнорируется. Create/fork/resume классифицируются по native
  action: allocation/attach/inspect — control; dispatch новой worker activity —
  work policy. Это одинаковое правило для всех adapters, не выбор исполнителя
  «на месте» по имени CLI. Смешанный call переключает фазу на dispatch boundary.
- W3 удаляет derived lifetime deadline; issued invocation TTL, lease expiry и
  authority admission barriers остаются. Перед новым dispatch после очереди/
  backoff повторяется ownership/generation/admission check. Capacity breaker
  и provider Retry-After не считаются productive activity и не сбрасываются
  heartbeat. Existing quota/auth и same-Session overload rules не изменять.
- Baseline policy@2 не принимает одновременно `timeout_ms` и
  `inactivity_timeout_ms`; @1 сохраняет absolute contract. Новый admission
  receipt@2 хранит timeout kind/threshold и outcome/cleanup отдельно; validator,
  builder/preflight/execute/derived-fork consumers проверяют policy/hash/schema.
  Изменить baseline pin в current case definition для будущих запусков;
  исторические policy bytes/receipts/checkpoints не переписываются.
- Recovery snapshot новой policy содержит `policy_id: settlement-inactivity@1`
  и exact operation/control generation, progress marker и remaining. Legacy
  cumulative snapshot читается legacy path, неизвестная policy fail-closed.
  Automatic restart/poll/request-ID rotation не replenish; explicit authorized
  reconciliation может начать новый retained episode по existing contract.
- Progress/error contract ID, helper bytes и selected artifact identity
  проверяются перед новым dispatch existing candidate acceptance. New EVAL +
  old helper не «молча совместимы»; legacy read-only recovery отдельно. Не
  смешивать feature detection с семантической qualification модели.

### 11.5 Output/ownership limits — T26/T33

T33: diagnostics стримятся в existing evidence sink, в RAM bounded tail и typed
error summary. Final JSON reply остаётся целым и ограниченным; если превышен
existing reply budget, typed observer failure + exact reconciliation, не
truncate-to-valid-PASS и не подмена provider outcome. Full stderr stream не
накопительный lifetime kill threshold. Для utility caller, требующего весь
text result, превышение capture limit явно неуспешно; install/build logs не
обязательно держать целиком в RAM. Native journal остаётся источником evidence.
Backpressure/log-write error не progress; disk/publication failure retained
отдельно. Не вводить новые quotas на всю native private directory.

T26: baseline renewal запускается до освобождения admitted gate, использует
existing 5 s attempt/30 s uncertainty policy; observed output не authority.
Definite loss/exhaustion прерывает ожидание command и инициирует owned cleanup,
а не только журналируется. Before finish monitor переведён в closing, in-flight
renewal drained; нет renew-after-finish. Test: productive command дольше15 min,
renewal conflict/timeout-after-COMMIT/true loss во время output, complete-vs-loss
race и gate, который ни разу не исполнил command до admission.

### 11.6 Пакетные gates и дополнительные regressions

- **G1 / W1:** clock API и numeric/time/gap semantics; FLOW/EVAL parity, primitive
  compatibility, epoch/skew и restart без grants. Не менять adapter defaults
  до прохождения этого gate.
- **G2 / W2:** actual six entrypoints, current scope/children, quiet episodes,
  async races, long silent tool и trusted HITL; null transport работает, но
  silence всё равно получает конечный outcome. AGY monitor owner — daemon,
  не несколько disposable clients. Invalid flags fail before any native effect.
- **G3 / W3:** caller→adapter→daemon ledger→native stream tests. T32 отдельный
  test в `native-adapter-contracts.test.ts`/`fixtures/daemon-operations.mjs` и
  EVAL `operation-errors.test.mjs`/runner recovery targets. Classified local
  quiet не пишет false provider terminal; late reply и unknown fence проверены.
- **G4 / W4:** baseline@1/@2 compatibility и new pin, periodic renewal + closing,
  runCheck startup→serving transition, output backpressure, exact cleanup,
  recovery marker persisted/legacy. T33 long-output regression через existing
  harness-adapter/process-json/runner fixtures; bounded RAM capture и отсутствие
  cumulative diagnostics stop проверяются по mechanism, не flaky heap benchmark.
- **G5 / W5:** обычные suites не skipped, pack/installed artifact checks,
  runbooks и все T01–T33 связаны с executable regression. Source/build/helpers
  не diverge. NOT RUN остаётся NOT RUN; paid live qualification/E2E отдельны.

Readiness результата: существенных неразрешённых design decisions в scope не
оставлено. Реализация начинается с G1, не с массового удаления всех timers.
Подтверждение 31 прежнего пункта дополнено T32/T33 и edge-case контрактами выше;
это готовность спецификации, не доказательство будущего PASS четырёх E2E.

Проверки при readiness review: current `node --test
test/observation-clock.test.mjs` — 7/7 PASS, без skipped; это исходная версия,
часть закреплённых gap semantics заменяется G1 tests. Offline actual-module
assertions подтвердили отсутствие `subject_liveness_timeout` в обоих loss
classifiers и принятие clock numeric-string/overflow duration. Source readback
подтвердил exclusive failed write и разные output capture ограничения.
Plan structure: T01–T33 unique; whitespace check без findings. Полные suites,
будущие regression cases и paid live acceptance здесь не запускались.
