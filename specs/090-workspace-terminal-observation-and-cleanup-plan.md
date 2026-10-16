# 090 — Актуальный workspace, сохранение native outcome и очистка EVAL

Дата: 2026-10-16. Статус: P1–P9 реализованы; финальная приёмка и merge выполняются.
Результаты и границы проверки — [implementation receipt](090-implementation-report.md).
Уточнения readiness-проверки — раздел 7.
Ponytail: full. Исправляем FLOW/адаптеры/EVAL tooling, не оцениваемый продукт.

Audit base: dd-flow-cli origin/main a3a65214979e72aecb25817c527d60e80b0d1838;
dd-eval origin/main cf5267daad330647a32f7e4b114ea0a0a454feb1. Исследованные
review checkouts имеют те же затронутые участки; перед реализацией сверить main.
План 089 не заменяется: его bounded overload episodes сохраняются.

## 1. Цель, границы и доказанные инциденты

Цель: назначенный workspace доходит до native Session; ошибки admission не
теряются; недоступная диагностика не уничтожает известный native terminal;
завершённый/упавший EVAL не оставляет бесконтрольные локальные процессы.

Исторические попытки на engine beta.138:

| Упряжка / EVAL | Установленная цепочка |
| --- | --- |
| ZCode / EVAL-20261015071520-779a13ef | SPECIFY/PROTOCOLIZE done; controller выдал session create для PLAN со старым cwd; ACP session/new подтвердил тот же путь; CLI отверг его с invocation_directory_mismatch. |
| Grok / EVAL-20261015072157-9f1086d8 | SPECIFY/PROTOCOLIZE done; та же ошибка controller; native PreToolUse обнаружил старый cwd до lifecycle CLI. |
| OpenCode / EVAL-20261015060823-6f9a01c1 | Тот же неправильный cwd; агент перенёс Session через session_move. Native PLAN done 06:44:51Z, idle=succeeded 06:45:11Z; observer завершился 07:15:11Z. Native log содержит 4927 HTTP404 для одного shell/output по старому location. |

Ни ZCode, ни Grok не потеряли корректный cwd: им передали неправильный.
OpenCode не завис на PLAN: потеряно подтверждение уже завершённой работы.
30-минутное окно OpenCode было скользящим; увеличивать его не требуется.

Evidence roots (read-only):

- ~/.dd-eval/qualification/cp-230-zcode-full/runs/EVAL-20261015071520-779a13ef
- ~/.dd-eval/qualification/cp-230-grok-full/runs/EVAL-20261015072157-9f1086d8
- ~/.dd-eval/qualification/cp-229-opencode-full/runs/EVAL-20261015060823-6f9a01c1

В каждом сверены state/events, controller operations/state, daemon.json,
adapter journal, timeline и runtime SQLite. Для OpenCode дополнительно native
session_message и xdg-data/opencode/log/opencode.log. Отдельные offline probes
воспроизвели stale routing и потерю succeeded outcome из-за shell404. Изолированный
native 2.0.29 readback/import не отправлял prompts и не менял исходные EVAL.

Не входят: repair продукта, изменение native ZCode/Grok, новые EVAL, release,
обновление hooks/pins или остановка текущих исторических процессов без отдельного
поручения. При реализации допустимы только изолированные технические проверки.
Последующая scored-приёмка и operational cleanup требуют отдельного запуска.

## 2. Инвентаризация дефектов

Пути engine относительны dd-flow-cli, пути EVAL — dd-eval. Номера строк — audit base.

| ID | Место / первопричина | Системное исправление |
| --- | --- | --- |
| D01 | engine controller-execution.ts:81–86; run-controller.ts:434,657,729,740: routing замыкает RUN до PROTOCOLIZE, хотя цикл перечитывает RUN | Frozen policy отдельно; transition и cwd вычислять из одного актуального RUN. |
| D02 | engine runs.ts:2020,2072 сравнивает immutable bundle scope.workspace с изменяемым SDLC workspace_root | Разделить admission scope и подтверждённый физический SDLC route; generic scope оставить строгим. |
| D03 | engine runs.ts:527 отдельно обновляет workspace_root до revision-guard persistRunState:1845–1865; audit/timeline ещё позже | Один SQL writer для пути, индекса, revision и route evidence; FS projections только после commit. |
| D04 | engine dd-opencode.mjs:214–225,235–292: output старого/completed shell запрашивается по this.directory раньше terminal; ошибка обрывает reconciliation | Output только актуальных shell; правильный location; terminal и pending/tree proof независимо от progress channel. |
| D05 | engine dd-opencode-daemon.mjs:193,199,284–287,373–384: чужой cwd приравнен к чужой Session и блокирует describe/cancel/shutdown | Ownership/ancestry, разрешение dispatch и settlement — отдельные проверки. |
| D06 | engine dd-agy-daemon.mjs:405: captureChildTools предшествует lastResult/current.terminalResult | Сначала сохранить validated terminal, затем fallible secondary capture. |
| D07 | engine dd-agy-daemon.mjs:504–508: после retained SUCCESS всё равно выдаётся native_outcome=unknown | Сохранять известный terminal при tree/observation uncertainty, не выдавать чистый успех преждевременно. |
| D08 | engine opencode-plugin.mjs:35–42; daemon не читает bound hook-failure receipts | Общий exact-operation hook failure contract до вызова admission; controller получает typed первопричину. |
| D09 | engine dd-codex.mjs:285, dd-droid.mjs:534 перезаписывают доказанный admission effect=no_effect значением unknown | Сохранить effect конкретной CLI admission; отдельно учитывать неизвестные эффекты всего native Turn. |
| D10 | engine dd-droid.mjs:526 и dd-agy-daemon.mjs:543 имеют более слабые correction predicates, чем operation-errors.mjs:4 | Использовать isProvenShellCorrection после native owner binding; не ослаблять критерии. |
| D11 | EVAL runner.mjs:2432–2473 теряет phase/recoverable/disposition и refusal authority в компактной диагностике | Дополнить bounded projection, сохранив redaction и различие evidence/authority. |
| D12 | EVAL runner.mjs:3247–3290 не узнаёт native_hook_receipt_invalid / native_hook_identity_conflict и integrity-коды retained bundle, реально выдаваемые engine | Точные infrastructure categories на existing causal path; без классификации по тексту модели или wildcard run_bundle_*. |
| D13 | Engine test controller-stage-fixture.ts:53 всегда integration_branch_direct; OpenCode progress fixture всегда отдаёт output | Регрессии на смену workspace после создания routing и на disappeared/completed shell. |
| D14 | EVAL runnerCleanup:5387–5442 требует existing RUN control, обрабатывает managed Subject/Final Judge, но не является sweep всех ролей; prelaunch cleanup пока runbook-only | Машинный owner-scoped cleanup lifecycle, явная investigation deferral и обязательное закрытие старых cleanup перед новой campaign. |

D02/D03/D06–D12 — дополнительно подтверждённые code-path дефекты, не утверждение,
что каждый уже проявился в трёх перечисленных EVAL. D14 — также новое требование
пользователя; завершение EVAL и физическая очистка не должны смешиваться.

## 3. Принятые решения реализации

### P1. Актуальная маршрутизация без повторного выбора профилей

Файлы: controller-execution.ts, run-controller.ts, execution-policy.ts и их tests.

- Сохранить единственное frozen policy/profile selection на RUN.
- В методы SDLC transition/cwd передавать актуальный RUN из текущей итерации,
  а не скрыто перечитывать настройки или первоначальный RUN из closure.
- Оба расчёта выполняются из одного снимка RUN; перед dispatch сохранить
  существующие generation/lease/admission fences. Если route/revision изменился
  при asynchronous setup — повторная подготовка/typed no-effect отказ до prompt,
  не отправка в уже устаревший каталог.
- stageExecutionCwd остаётся общей pure-функцией: SPECIFY/PROTOCOLIZE в stable root,
  PLAN и последующие рабочие стадии в write workspace; MERGE — claimed target.
- При несовпадении session.cwd с актуальным stageCwd создать новую native Session
  даже при configured same_session. Не перемещать живую Session молча.
- Same-session MERGE по-прежнему отвергает несовместимый target/profile; server
  MERGE использует точный claimed target, не default workspace.
- Generic descriptor routing остаётся привязанным к snapshot.scope.workspace.
  Recovery той же native Session сохраняет её cwd; следующий Stage выбирается
  заново по актуальному route. Никакого переписывания исторических session records.

### P2. Законный SDLC rebind и неизменный bundle

Файлы: runs.ts, vnext-protocolize.ts, vnext-workspace-policy.ts; bundle tests.

- Bundle, его sha/admission/profiles/compiled handlers не пересобирать и не
  перезакреплять после PROTOCOLIZE. Их scope фиксирует admission, не обещает
  неизменный физический SDLC checkout.
- Общий identity predicate используется обоими bundle guards. Generic RUN:
  project/flow/run/workspace обязаны точно совпадать с admitted scope.
- Для SDLC точное совпадение остаётся обычным случаем. Исключение только для
  законного перехода stable admission root → provisioned feature-worktree:
  известный vNext kind, исходный admitted workspace=project_root, тот же RUN,
  project/flow/bundle anchor; row, index.execution и index.workspace согласованы;
  путь/branch/base/manager соответствуют подтверждённому route PROTOCOLIZE.
  Не разрешать произвольный SQL workspace mismatch по одному flow_id=sdlc.
- Для новых rebind сохранить prepared VnextWorkspaceRouteReceipt в payload
  существующего flow_run.workspace_rebound audit event вместе с route tuple и
  revision. Это не новая таблица/registry. Проверки внутри writer используют
  этот SQL evidence, а не запускают Git/FS. Физическую проверку existing
  requireVnextWorkspaceRoute выполнять вне writer перед стадийной работой.
  В receipt остаются только необходимые route/create/bootstrap facts и refs,
  не полный stdout/env bootstrap. Audit sanitizer не должен менять authority:
  canonical compact receipt и его digest формируются до writer и проверяются
  после записи. Существующую route-file schema сохранить совместимой.
- Исторический законный route проверять по existing receipt + coherent index/
  audit binding; отсутствие достаточных доказательств — typed no-effect отказ,
  без auto migration/переписывания старого bundle. Stage-entry imports, где
  admitted scope уже равен feature workspace, не подпадают под исключение.
- Generic rebind на другой workspace отвергать до записи; same-path no-op
  не создаёт лишний переход. Существующие unbundled SDLC поддержать.

### P3. Атомарная публикация workspace route

Файлы: runs.ts:rebindFlowRunWorkspace, vnext-protocolize.ts:provisionWorkspaceForProtocolize.

1. До writer подготовить/проверить пути, Git facts, create/bootstrap receipt,
   предыдущий workspace и expected revision/generation. Native/Git/FS операций
   внутри SQL transaction нет.
2. В одном outer writeTransaction повторно проверить ownership/generation,
   предыдущий workspace/revision; записать workspace column, index.execution,
   index.workspace, canonical route audit и timeline. Использовать существующий
   nested writer и afterCommit, а не новый transaction manager.
3. После commit материализовать existing workspace-route.json и projections из
   сохранённых фактов. Не выпускать следующий productive Stage до публикации.
   При публикационной ошибке сохранить committed effect и exact repair/readback
   evidence; не повторять worktree creation или SQL mutation как новый запрос.
4. Recovery после commit до file publication восстанавливает только projection
   из exact committed route event; до commit — rollback, без частичного пути.
   Наличие подготовленного file без SQL authority не разрешает новую работу.

### P4. OpenCode: terminal не зависит от доступности старого output

Файлы: dd-opencode.mjs, dd-opencode-daemon.mjs и v2 adapter/native fixtures.

- Сначала получать/сохранять exact current admission ID и native terminal; output
  tracking не является источником terminal truth. Дополнительные reads не
  должны препятствовать reconciliation messages/idle/pending/tree.
- Хранить active shell polling отдельно от множества owned shell IDs, нужного
  для проверки background notifications. Завершённый tool удалять из polling,
  но не терять ownership ранее запущенного background shell.
- Получать location из проверенного native session/tool context. Для shell,
  начавшегося до move, не угадывать location по текущему root: сохранить его
  подтверждённую launch location. Если её нет — сверить owned native shell
  listing/metadata; не искать shell во всех чужих каталогах.
- При output404 активного shell выполнить независимую сверку tool/root/children.
  При доказанном завершении перестать читать output и вернуть сохранённый outcome;
  без proof оставить observation uncertainty, не provider failure и не replay.
- Terminal success возвращается только при exact owned request, terminal и
  отсутствии pending tools/inbox/forms/permissions/children/background shell.
  Один stage_completed в FLOW или финальный текст модели недостаточен.
- SSE reasoning/text/tool activity продолжает двигать скользящее окно; heartbeat,
  model list updates и повторный404 не являются прогрессом.
- Сохранить в bounded diagnostic первую и последнюю ошибки observation, method,
  HTTP status/native tag, count и refs; не писать тысячи одинаковых payloads и
  не раскрывать headers/credentials. Оригинальный primary error не затирать.

### P5. Ownership, route conformance и cleanup — разные факты

Файлы: dd-opencode-daemon.mjs:describe/cancelTree/requireSettled/dispatch,
session-settlement.mjs, daemon-control и existing runtime-scope-stop consumers.

- Productive admission требует ожидаемый cwd. Read-only inspect/settlement и
  cancellation требуют exact owned ID/daemon/root/ancestry; location mismatch
  сохраняется как нарушение route, но не делает owned Session чужой.
- Для root/children ownership проверяется до adoption; чужие ID, подменённый parent,
  cycles/fork lineage и неподтверждённый move не получают продуктивных прав.
- Обычная смена cwd моделью не легализуется автоматически. Общий controller
  устраняет её причину; неожиданный move остаётся typed contract failure.
- Cleanup не должен пропускать owned child только потому, что его cwd изменился.
  Shared waitForSettlement сохраняет cancellation-before-observation и запрет
  утверждать settlement при провале наблюдения.
- Если native outcome/settlement не подтверждён, existing runtime scope stop
  может остановить точно зарегистрированные локальные процессы с birth/lease
  checks. physical_stopped=true не превращать в native_settled=true или PASS.

### P6. AGY: сохранить полученный terminal до вторичной диагностики

Файлы: dd-agy-daemon.mjs:finishTurn/completePendingTurn/prompt и AGY fixtures.

- После проверки current operation/generation/conversation и native status
  немедленно сохранить validated terminal и его identity. Не принимать stale
  терминал прошлого input или известие от другого child как root result.
- Только затем captureChildTools, usage, journal/projections. Их failure
  сохраняет original native result и settled=false; отсутствие durable write
  явно отмечается, а не объявляется успешно сохранённым receipt.
- При silent reconciliation retained SUCCESS + неизвестное tree settlement
  сообщать как known native outcome / unconfirmed settlement, используя existing
  native_outcome_observation_failed/error contracts. Не выдумывать unknown result
  и не завершать всю работу успехом по одному root SUCCESS.
- ERROR/CANCELLED, repeated conversation errors, settled_by_root и Work success
  остаются разными фактами. Следующий prompt не повторяет неизвестные эффекты.

### P7. Единый typed admission failure и correction contract

Файлы: opencode-plugin.mjs, dd-opencode-daemon.mjs, native-hook-command.mjs,
dd-codex.mjs, dd-droid.mjs, dd-agy-daemon.mjs, operation-errors.mjs.

- OpenCode до admission связывает native tool с daemon/root/operation/generation/
  Session/message/tool/command digest. Переиспользовать acceptNativeHookRequest,
  writeNativeHookFailure/readNativeHookFailures, а не отдельную очередь.
- Сохранить typed отказ до того, как native tool renderer превратит его в текст.
  Runtime/controller принимает только exact bound current failure; старые,
  поддельные, повторные и late receipts не останавливают чужую операцию.
- Первичная причина побеждает; запись failure receipt не удалась — приложить
  receipt_error/observation error, не считать admission успешной и не заменять
  первопричину storage/cleanup wrapper-ошибкой.
- Во всех adapters после owner verification использовать isProvenShellCorrection.
  Сохранить AGY limit одной correction на generation. Неполный proof не даёт
  retry, новый Session, перенос cwd или право исправлять инфраструктуру агентом.
- Доказанное no_effect относится к конкретной lifecycle admission. Codex/Droid
  не должны переписывать его из-за fatal disposition; отдельно сохранить
  native Turn possible_effects/pending/outcome. No-effect CLI НЕ доказывает
  отсутствие предыдущих файловых/дочерних эффектов Turn и не разрешает replay.
- Generic hook timeout/неполный receipt остаётся unknown; не подставлять no_effect
  по имени ошибки или тексту stopReason.

### P8. Компактная EVAL диагностика не теряет смысл первопричины

Файлы: lib/runner.mjs:failureDiagnostic/isInfrastructureFailure; diagnostic tests.

- Сохранить bounded scalar phase/effect/recoverable/disposition,
  cli_admission_barrier, issued_invocation_id, event/refusal keys,
  native_pre_cli_refusal и nested receipt_error. Для cwd сохранять expected,
  actual, actual_provenance. Для known terminal сохранять exact native identity,
  terminal outcome и отдельно settlement uncertainty.
- Это только evidence для отчёта/Judge, не источник новых execution прав.
  Не копировать credentials/env/raw provider body или неограниченный transcript.
- Классифицировать native_hook_receipt_invalid/native_hook_identity_conflict
  вместе с existing exact hook-integrity infrastructure codes на causal path.
  Для retained bundle включить exact run_bundle_anchor_invalid,
  run_bundle_authority_missing, run_bundle_authority_invalid,
  run_bundle_identity_invalid, run_bundle_binding_incomplete при подтверждённом
  engine/controller admission origin. Не включать автоматически start_required,
  immutable, active: это могут быть отказы на неверную запрошенную операцию;
  их оценка сохраняет existing causal/issued-command contract. Native oversized
  input тоже не получает exception/retry только из-за префикса native_hook_.
  Не обходить conflicting RUN/operation evidence и не использовать cleanup_error
  как замену первичной причине product/model failure.
- EVAL failure остаётся failure, даже если native PLAN был done. Judge отдельно
  получает, какая работа фактически выполнена и почему потеряно продолжение.

### P9. Очистка после падения и перед следующим запуском

Новая пользовательская задача. Файлы: lib/runner.mjs, lib/eval-resume-worker.mjs,
lib/cleanup-observation.mjs, lib/daemon-control.mjs, lib/storage.mjs, bin/dd-eval.mjs;
engine existing runtime-scope-stop.ts и owner-scoped controls.

**Политика:** сохраняем доказательства; процессы по умолчанию останавливаем после
ошибки, успеха, отмены и неудачной подготовки. Живой процесс оставляем только
ради конкретного расследования; следующая campaign закрывает эту отсрочку.
Остановка процессов не означает удаление EVAL, SQLite, logs, credentials или volume.

1. В существующем failure/finalization path сохранить original error и identities,
   затем поставить durable cleanup intent. Переиспользовать cleanup-kind resume
   worker и per-EVAL lock, не добавлять heartbeat automation/service.
   Sealed/captured journal исторического EVAL не размораживать: такие intent и
   maintenance receipts хранятся во внешнем существующем maintenance-контуре с
   точной ссылкой на старый scope. Для новых незапечатанных попыток — их обычный
   operation/event journal. Cleanup worker закрывает свою регистрацию последней,
   после сохранения результата; он не должен остановить себя посреди inventory.
2. Inventory охватывает Subject root/children, external workers, merge executor,
   Interaction/Final Judge, qualification/probe attempts и их daemon/provider
   registrations. Доказательство: EVAL scope/resource-home + owner/operation/
   state-dir/registration/lease + PID/start identity, а не имя процесса/возраст.
   Intent/owner registration создаются до первого native spawn, затем
   подтверждаются PID/start identity. Падение между spawn и finalizer не должно
   оставлять неучтённый daemon. Неподтверждённый spawn остаётся reconciliation,
   а не основанием повторить его или убить найденный по имени процесс.
3. Штатный порядок: прекратить новые productive admissions → сохранить доступные
   receipts/capture → scoped cancel/stop → verify exact physical survivors и
   native settlement → записать отдельный cleanup result. Capture failure не
   даёт бесконечно держать локальный процесс: physical stop возможен по exact
   owned registration, с честным capture/native-unconfirmed outcome.
4. Отсутствующий RUN control у failed-before-controller не делает cleanup
   невозможным: использовать существующий retained owner/runtime scope control.
   Не создавать новую Session, запуск Judge или resume Subject ради очистки.
5. Если pinned runtime не умеет завершить повреждённый owner, отдельный checked
   maintenance CLI + исходный resource home выполняет existing runtime scope stop.
   Не подменять engine старого RUN и не редактировать daemon/runtime DB вручную.
6. Investigation deferral — явное операторское решение через существующий
   runner cleanup: добавить --defer-reason <text> вместе с --request-id.
   Оно сохраняет exact inventory, EVAL, reason, время и close-before-next-campaign
   event. Без reason отсрочки нет; неизвестный outcome сам по себе не означает
   просьбу оставить процессы. Запрос deferral до начала stop фиксируется тем же
   lifecycle lock; если stop уже начался, он не обещает сохранить живой процесс.
7. status остаётся read-only. Показывать отдельно execution outcome, местные
   процессы (stopped/live/unknown), native settlement, capture, cleanup
   (existing pending/blocked/settled), reason и next permitted action.
   Deferral — дополнительный cleanup_deferral record, не новое terminal state:
   cleanup_state остаётся pending. Deferred live targets не разрешаются к GC.
   Повторный status не запускает cleanup/модель/daemon.
8. Worker ограничен существующим recovery-observation budget; прогрессом считаются
   новые stop receipts/исчезновение точных process identities, не polling. После
   исчерпания — cleanup blocked/pending с причиной, не infinite loop/чистый PASS.
   Новый cleanup request повторно сверяет inventory и только незавершённые цели.
9. Перед новой campaign: readonly preflight выдаёт inventory старых owners через
   существующие registry/resource registrations. Именно prepare/run, до новых
   baseline/model dispatch, закрывает cleanup предыдущих failed/completed или
   явно abandoned попыток этого проекта/campaign scope, включая deferrals.
   Свежий home не должен скрывать старые регистрации общего resource home.
   Общая проверка перед dispatch вызывается также при входе через prepared queue/
   fork/resume нового запуска; переданные preparedInputs не обходят barrier.
   Продолжение уже активного EVAL исключает собственный разрешённый scope и не
   останавливает его как «предыдущий». Definition-only/read-only проверки не
   начинают cleanup; qualification dispatch также проходит prepare barrier.
10. Активный соседний EVAL не является мусором. Нет авторизации автоматически
    объявить quiet/expired RUN abandoned; unknown ownership блокирует только
    конфликтующий запуск с exact diagnostics. Concurrent starts используют
    existing scope/control locks и idempotent request IDs; повтор не создаёт
    второй stop worker. После prior-owner retirement новый EVAL получает новый ID.
    Cross-EVAL fence конкретен: existing withRunnerLock на файле
    <canonical-resource-home>/locks/eval-retirement, общий для всех новых homes.
    Под ним inventory/revalidation → retirement старых eligible owners →
    регистрация новых launch owners; затем lock освобождается до model dispatch.
    Это только сериализация подготовки/retirement, не запрет параллельных EVAL.
    Lock берётся до зависимых per-EVAL cleanup locks; SQL writer не удерживается
    во время ожидания. Исходные process/owner bindings перепроверяются перед stop
    и перед dispatch. Membership/eligibility определяется сохранёнными EVAL/
    project/scope bindings, не общим resource home сам по себе.
11. Fresh launch требует подтверждённого отсутствия относящихся старых локальных
    процессов либо verified physical_stopped receipt при unresolved remote
    outcome, плюс отсутствие resource conflict. Старый EVAL при этом не становится
    successful/cleanly settled и не разрешается к resume/GC.
12. DB/container останавливается после последнего verified consumer. Сохранять
    данные для расследования в stopped storage; не останавливать общий сервис
    при активных других consumers. Возраст >30 дней относится к отдельной GC
    политике данных, а не к праву убить процесс/удалить volume.

Runbooks execute-eval.md, e2e-monitoring.md, eval-storage.md: заменить ручное
пожелание на короткий порядок команд/deferral/проверки. Не размножать протоколы
инцидентов в операционных инструкциях; конкретные receipts остаются в EVAL.

## 4. Проверенные аналогичные пути и полезные гарантии

| Область | Результат аудита / действие |
| --- | --- |
| Все SDLC harnesses: Codex/ZCode/Grok/AGY/OpenCode/Droid | D01 исправляется в общей точке, не шестью harness-specific prompt patches. |
| Generic descriptor controller | scope.workspace frozen намеренно; сохранить строгую identity, не распространять SDLC исключение. |
| External Work launch | RUN перечитывается per launch (external-work-launch.ts:40,136); review/repair copy имеет отдельную authority. Preserve + regression. |
| Merge server | cwd от claimed request.target_workspace и повторная проверка target при capacity wait (merge-server.ts:76,126–129). Preserve. |
| Recovery controller | Та же Session намеренно использует retained cwd (run-controller-recovery.ts:140,149); нельзя переносить её в rebind target. |
| EVAL stage context/restoredRoots | runner.mjs:1751–1753,5006–5012 читает актуальный route на новую стадию/attempt; аналогичного stale closure не найдено. |
| Codex terminal | dd-codex.mjs:645–646 проверяет terminal до silence, :605–612 сохраняет outcome после observation failure; сохранить. D09 — отдельный admission effect. |
| ZCode terminal/stop | dd-zcode.mjs:279–315 отделяет RPC result от notifications; daemon:648–685 не воскрешает closed Session. Preserve. |
| Grok terminal/stop | dd-grok.mjs:153–160 сохраняет native prompt receipt; daemon:316–325 принимает exact TaskOutput proof. Preserve. |
| Droid terminal/recovery | dd-droid.mjs:220–222,385–439 сохраняет outcome отдельно от settlement; physical cleanup:541–583 проверяет survivors. Preserve. D09/D10 отдельно. |
| Shared settlement | session-settlement.mjs отменяет уже owned IDs до diagnostic observation и не выдумывает settlement при отказе readback. Preserve. |
| EVAL cleanup/GC | Existing cleanup observation, scoped maintenance и GC fences переиспользуются; не broad sweep, не удаление по одному state=failed. |

Исследованы consumers selectControllerExecution/stageExecutionCwd/
rebindFlowRunWorkspace; workspace_root/cwd caches; shell output/live part trackers;
native terminal → secondary capture → settlement; before-hook failure/correction
handlers; error serialization/compact report/classification; cleanup/finalization/
prelaunch/storage. Отчёты трёх read-only субагентов перепроверены основным агентом
по перечисленным участкам. «Всё остальное без дефектов» не утверждается.
Основной агент дополнительно выполнил actual failureDiagnostic/classifier probe:
у route rejection остаются только actual/effect, expected/actual_provenance и
operational refusal fields пропадают; оба hook-integrity кода и bundle identity
сейчас классифицируются false. Known native_outcome_observation_failed уже
правильно классифицируется infrastructure — второй классификатор не нужен.

## 5. Порядок реализации и проверяемый результат

- [x] P1–P3: свежий SDLC route, bundle compatibility, atomic rebind и projections.
- [x] P4–P5: OpenCode outcome/progress/owned cleanup.
- [x] P6–P7: AGY terminal retention, typed admission/correction во всех consumers.
- [x] P8: EVAL evidence/classification.
- [x] P9: автоматический cleanup lifecycle, deferral и prelaunch barrier.
- [ ] Regression/gate, проверка patch inventory, короткий implementation receipt.
- [ ] Коммиты/PR/merge по runbooks/git-workflow.md только при поручении реализации;
  release/pins/hooks/scored EVAL — отдельный operational шаг, не скрытая часть tests.

### Минимальная regression matrix (в существующих suites)

| Проверка | Обязательный результат |
| --- | --- |
| Routing создан до feature provisioning; fresh RUN после него | PLAN transition и adapter --cwd/session-new используют feature path во всех profile routes. |
| Direct workspace / same_session / MERGE target | Без лишней смены Session при прежнем route; explicit MERGE target и conflict guards сохранены. |
| Bundle-backed SDLC + legal rebind / generic mismatch / column-only tamper | Законный route проходит с прежним bundle SHA; подмена и generic mismatch отклоняются. |
| Revision race / SQL failure / projection failure / crash before publication | Полный rollback до commit; после commit согласованный route+index+audit, только publication repair, без второго worktree. |
| Recovery в старой Session → следующая новая стадия | Retained Session cwd не меняется; новый Stage получает актуальный route. |
| OpenCode completed tool + stale SSE shellID + output404 + succeeded idle | Старый output не блокирует terminal; один POST, no replay, busy children всё ещё удерживают settlement. |
| OpenCode running shell404 + no terminal / background zero output | Никакого ложного success/прогресса; exact ownership/notifications сохранены. |
| Moved owned root/child / foreign ID / wrong parent / cycle | Dispatch route guard работает; inspect/cancel/cleanup owned доступны, чужие цели недоступны. |
| AGY SUCCESS + capture/journal failure / SUCCESS без fully-idle | Native result сохранён; settled=false честно, не unknown result и не ранний PASS. |
| OpenCode fatal before-hook rejection, real native tool rendering | Точный original code/phase/effect достигает controller; marker effect отсутствует; late/forged receipt отвергнут. |
| Codex/Droid typed no-effect fatal; AGY/Droid incomplete correction proof | No-effect не затирается, но не даёт replay Turn; каждый отсутствующий authority field запрещает correction. |
| EVAL bounded error projection/classification/redaction | Первичная причина и operational поля сохранены; cleanup не меняет product verdict; секреты не попали в Judge. |
| Failure before RUN / during Subject / Judge/qualification / after terminal | Все зарегистрированные owners попали в cleanup; original failure сохранён, productive calls=0. |
| Deferral / next fresh home / duplicate starts / PID reuse / wrong resource home | Deferred targets закрыты перед новыми модельными вызовами; один cleanup intent; чужой PID/owner не тронут. |
| Два разных новых EVAL/home одновременно; crash между native spawn и finalizer | Общий retirement fence не допускает dispatch до очистки; failed spawn обнаружим по registration/intent; активные соседние EVAL не остановлены. |
| Captured operator journal: defer → cleanup → prelaunch retirement | Bytes/hash events.jsonl неизменны; maintenance receipts вне captured journal, productive/model calls=0. |
| Pinned cleanup failure + checked scope-stop fallback | Physical stopped доказан отдельно; remote/capture uncertainty сохранена, старый EVAL не объявлен успешным. |
| Shared DB/container с другим активным consumer | Cleanup данного EVAL не останавливает shared resource раньше последнего consumer. |

Не создавать отдельный test framework. Расширить existing controller-stage fixture
вариантом feature_worktree (не заменить direct coverage), execution-policy/full-cycle,
bundle/runs, opencode-adapter/native-plugin, AGY state-boundaries, admission/error,
EVAL monitoring/cleanup/control/preflight tests. Native technical probes — private
home/DB/port, deterministic local provider либо без генерации, не рабочая упряжка.

Gate engine: typecheck, lint, strict-canon build; полный pnpm test (hybrid/e2/e3/
release/integration/runtime-sensitive), installed/packed contracts по owning release
runbook. Gate EVAL: полный npm test и affected installed engine integration.
Команды engine: `pnpm typecheck`, `pnpm lint`,
`DD_FLOW_BUILD_STRICT_CANON=1 DD_MEMORYBANK=<exact-canon-root> pnpm build`,
`pnpm test`, `pnpm test:e2:installed`. Exact canon и installed candidate выбираются
по release runbook, не через ambient/global working checkout.
Не увеличивать test timeouts для маскировки lost outcome; clocks/delays inject
или использовать существующий test progress budget. Skips/failures указать явно.

## 6. Readiness и ponytail review

- [x] Причины, реальные инциденты и дополнительные latent paths разделены.
- [x] Общая точка fresh route определена; frozen policy/generic scope защищены.
- [x] Bundle/provision ordering и SQL/FS atomicity имеют явное решение.
- [x] Root terminal, Work/Stage result, tree settlement и local physical cleanup
  определены отдельно; неизвестность не превращается в retry/успех.
- [x] Correction proof единый; admission effect не приравнен к эффектам всего Turn.
- [x] Cleanup автоматический, owner-scoped, ограниченный; deferral закрывается
  перед следующей campaign; read-only preflight/status не убивает процессы.
- [x] Не меняем продукт, native binaries, историю, текущие RUN и global hooks.
- [x] Нет новых dependencies, daemon service, parallel policy registry, общей
  «системы таймаутов» или вторых state machines для уже существующих controls.
- [x] Каждому существенному изменению соответствует проверка, падающая на старом
  механизме; полный gate не подменён mock-only smoke или живой qualification.

План готов к реализации. Это не утверждение о готовом исправлении/зелёном gate
или полном прохождении E2E. Фактические результаты оформляются после реализации;
новые scored запуски — только после отдельного поручения.

## 7. Повторная readiness-проверка: обязательные уточнения

Эти решения уточняют P1–P9 и имеют приоритет над неоднозначной формулировкой
выше. Проверены actual worker/lock/control APIs, native hook ledger, bundle
guards и cancellation consumers. Новая реализация/операционные действия не
выполнялись. Не требуется выбирать архитектуру или политику во время кодинга.

### R1. Route revision, идемпотентный rebind и восстановление публикации

- Сравнивать не весь runtime_revision на каждом prompt, а prepared workspace
  tuple: project/RUN/generation, canonical workspace, route revision/digest и
  explicit MERGE claim identity. Обычный heartbeat/usage update не меняет route
  и не должен приводить к бесконечным отказам dispatch. Полный runtime_revision
  остаётся optimistic fence непосредственно в transaction rebind.
- Новый route revision — revision совершённого workspace-rebind audit event.
  Его canonical receipt имеет точные RUN/project/generation, previous_workspace,
  workspace_root, branch/base, policy, compact create/bootstrap proof и SHA256.
  SQL guards сверяют этот exact event с row/index, не ищут «последний похожий»
  receipt на диске. Conflict revision/path/owner — no-effect отказ.
- При повторе того же committed rebind с тем же tuple вернуть retained receipt
  и допубликовать projection, без новой revision/event/worktree. Тот же request
  с другим tuple — conflict. Не создавать отдельный request registry: опираться
  на существующую lifecycle invocation + route audit identity.
- Recovery publication — existing lifecycle settlement/readback path перед
  возвратом результата и перед допуском следующей стадии, не новый repair агент
  и не readonly status. Он берёт per-RUN writer authority, читает exact committed
  event, проверяет digest и публикует только named file/projections атомарной
  заменой. Commit уже случился — error.effect=committed, retry creation запрещён.
- Если native Session создана, но route изменился до prompt, не отправлять prompt
  в неё и не создавать вторую, пока первая не закрыта штатно. Cleanup uncertainty
  сохраняется; изменение route не разрешает проигнорировать живую Session.
- Stage-entry restore/fork сверяет перенесённые route paths с existing verified
  snapshot lineage. Не сравнивать перенесённый путь со старым source path и не
  разрешать rebind по одному basename. Bundle SHA и provenance остаются прежними.

### R2. OpenCode: независимый terminal read и неожиданная смена location

- Output probes не await-ятся на пути обязательного terminal reconciliation.
  Максимум один pending read на active shell; его promise имеет обработчик
  ошибки. Native messages/idle/current input и pending/tree читаются независимо.
  При выходе остановить только локальный observer fetch/SSE через AbortSignal,
  не посылать native cancel как побочный эффект удачного чтения terminal.
- События могут приходить не по порядку: late running/SSE delta не возвращает
  completed tool в active polling. На новый owned admission создаётся отдельный
  baseline; чужой user input/terminal, повторные/старые event IDs не принимаются.
- Completed tool и completed background shell — не одно и то же. Background
  output/notification остаётся outstanding до exact native completion proof,
  даже если shell tool уже вернул управление. Потерянный output не заменяет
  pending proof; heartbeat и 404 не сдвигают окно productive silence.
- `describe` возвращает native outcome/settlement и отдельный route_conformance
  (matches, expected, actual). Productive `requireSettled` проверяет оба условия;
  inspect/cancel не требует matches=true. Для known owned Session использовать
  typed invocation_directory_mismatch с actual_provenance=native_session_readback,
  а foreign_session оставить для нарушений ownership/ancestry.
- Два допустимых итога не путать: completed shell404 при совпадающем route не
  портит успешный prompt; реальный неразрешённый session_move остаётся route
  contract failure, но error сохраняет native terminal, который удалось прочесть.
  Historical OpenCode не «исправляется» задним числом в completed/PASS.
- Hooks и mandatory identity/settlement reads не объявляются optional diagnostics.
  Их failure блокирует продуктивное продолжение и остаётся точной первопричиной.

### R3. AGY terminal и приоритет нескольких ошибок

- Terminal retention включает received_at и исходную operation/generation/
  conversation binding; SUCCESS, ERROR, CANCELLED обрабатываются отдельно.
  RUNNING не становится terminal. При capture failure на ERROR первичным остаётся
  native provider error, capture error прикладывается вторично. При SUCCESS с
  потерей обязательного наблюдения — native_outcome_observation_failed с точным
  received result и settled=false. Оба случая не дают автоматического replay.
- Durable terminal записывается до child transcript enrichment. Если сама запись
  не удалась, использовать известный in-memory result в error с явным
  terminal_persisted=false; не выдавать его за восстановимый durable receipt.
  После перезапуска нет доказательства — normal reconciliation, не синтез Turn ID.
- Сохранение root SUCCESS не превращает settled_by_root в child Work success.
  Pending child/hook после root terminal по-прежнему удерживает settlement.

### R4. OpenCode hook binding: конкретный IPC путь и fail-closed поведение

- `writePlugin` передаёт private stateDir/socket binding, но не password/provider
  credentials. Plugin получает exact operation binding у своего daemon через
  non-generative hook.resolve до запуска admission. Runtime устанавливает current
  prompt generation/request map до POST; handler hook.resolve работает при active
  prompt и не ждёт его завершения/не захватывает второй productive permit.
- Root/child identity вычисляется daemon по retained ownership и native ancestry,
  не по присланному plugin operation_id или ambient «последней Session».
  acceptNativeHookRequest сохраняет existing operation ledger; plugin передаёт
  binding в CLI event envelope и сохраняет typed failure через тот же ledger.
- Если binding не получен, CLI/tool не запускается; возвращается infrastructure
  admission error. Failure после effect у after-hook не маркируется no_effect:
  сохранить outcome tool и observation failure, без повторения shell chain.
- Проверить generation ещё раз после await hook.resolve/admission и перед
  публикацией prompt result. Late failure старой generation не меняет новую;
  current fatal failure не теряется при одновременном native idle.
- Остальные упряжки используют existing proof checks. Prefix, stopReason или
  одиночное поле no_effect не заменяют bound refusal authority.

### R5. Cleanup intent, хранение и исключение self-stop

- Расширить existing cleanup-kind intent полями mode=reconcile|defer,
  goal=native_settlement|local_retirement, defer_reason и target_binding_digest.
  Новые cleanup intents используют local_retirement: сначала обычное native
  завершение, при его невозможности checked physical stop. Старый intent без
  goal сохраняет прежний native_settlement; смена требует нового request ID.
  Старый intent без mode означает reconcile;
  не переписывать его. Один request ID с другим mode/reason/target manifest hash
  даёт control_request_conflict; не запускать два worker на разные формулировки.
- target_binding_digest связывает canonical EVAL root/ID, manifest SHA, retained
  runtime/resource homes и выбранный maintenance engine. Mutable inventory не
  включать в intent hash: его successive snapshots/stop receipts записываются
  отдельно. Появление owned child не меняет принятую команду и не мешает её
  идемпотентной сверке; смена manifest/home/engine требует нового request ID.
- CLI: runner cleanup --eval <root> --request-id <id> [--defer-reason <text>].
  Непустой reason до 4096 UTF-8 bytes; неизвестные flags отвергать. Без reason
  обычная reconcile/retirement. Deferral не останавливает процесс и не создаёт
  provider; если stop уже был принят, вернуть stop_already_in_progress и его
  receipt, не обещать работающий daemon для расследования.
  Дополнительные --maintenance-home/--maintenance-bin разрешены только для
  указанного ниже fallback и включаются в intent; не игнорировать неизвестные
  flags, не менять этими аргументами subject/profile/config старого RUN.
- Результат deferral привязан к exact inventory, а не ко всем будущим процессам.
  Новые child registrations требуют повторного inventory; drain fence запрещает
  late productive admissions перед stop. Более поздняя явная defer не отменяет
  уже совершённый stop; отсутствие deferral не разрешает трогать active EVAL.
- Reuse sidecar layout runner-attempts/<hash(request-id)>/{attempt.json,events.jsonl}
  и cleanup-kind worker. Captured root events.jsonl, manifest и snapshot не менять.
  Для maintenance fallback рабочий DD_FLOW_HOME — private control-runtime нового
  подготовленного запуска, либо explicit --maintenance-home <absolute-path> для
  standalone cleanup; --maintenance-bin <absolute-verified-cli> нужен только
  при fallback с несовместимого pinned engine. Пути/engine receipt включены в
  immutable intent; ambient/global executable не подставляется автоматически.
- Cleanup-only worker не регистрируется новым eval-observer внутри target scope:
  существующая cleanup ветка уже выполняется до этой регистрации. Его ownership —
  sidecar process PID/start + lock. Иначе runtime scope stop остановит cleanup
  worker до сохранения результата. Исходный EVAL observer можно закрывать только
  после durable handoff primary failure + cleanup intent этому worker.
- Cleanup-only spawn не зависит от валидации semantic_decisions/coverage policy
  исторического профиля и наличия model credentials. Сейчас общий spawnWorker
  вызывает ownerEnvironment даже для cleanup; выделить существующую maintenance
  ветку формирования env, переиспользовав masking из runtime-maintenance.mjs
  для OPENROUTER_API_KEY/OPENAI_DECISIONS_API_KEY. Retained runtime/owner binding
  проверяется по-прежнему; недоступность case или несовместимая semantic config
  не должна мешать безопасной физической остановке подтверждённого owner.
- Использовать existing all-role runtime scope controls как основной inventory/
  retirement путь; runnerCleanup только Subject/Final Judge недостаточен. В sealed
  режиме не вызывать его assertEvalAdmission/finalizeRunProjection и не запускать
  runnerFinalizeSettled/Judge ради публикации maintenance результата.
- Локально остановленные процессы и native settlement — отдельные поля результата:
  worker может завершить local retirement при physical_stopped=true с unresolved
  native/capture. Общий cleanup_state не становится settled, GC/resume запрещены.
  При отсутствии физического proof — blocked/unknown, следующий конфликтующий
  launch не разрешается. Missing/deleted project cwd не повод терять проверенный
  owner: применить existing scoped physical fallback, не выдумывать новый cwd.
- Для local-retirement intent критерий завершения worker — verified
  physical_stopped=true, не обязательно cleanup_state=settled. В этом случае
  attempt.status=completed, result.cleanup_state=pending при unknown native/
  capture; state исторического EVAL не переписывается. Existing cleanup branch,
  которая ждёт только cleanup_state=settled, должна учитывать этот явно заданный
  intent, иначе она зациклит уже выполненную физическую остановку.
- Legacy cancelOwnedDaemon в EVAL применяется только к non-managed driver path;
  его stable-root contract не расширять наугад и не использовать для нового
  feature-session cleanup. Проверен actual caller cancelExecutionTree: managed
  RUN использует run control раньше этого legacy fallback.

### R6. Prelaunch fence, crash окна и пределы автоматической очистки

- Создать owned locks parent directory с private permissions до withRunnerLock;
  canonical resource-home должен совпасть с manifest/registration, symlink escape
  или чужой resource home — отказ. Existing withRunnerLock сам parent не создаёт.
- Inventory учитывает прежние EVAL того же project/case в выбранном retained
  registry, даже если следующая campaign выбрала новый resource home. Каждый
  старый scope останавливается со своим original resource home; не переносить
  его registrations в новый. Для нескольких затронутых resource homes взять
  их retirement locks в порядке canonical path, затем per-EVAL locks; повторно
  сверить discovery под lock. Один home — обычный случай P9. Не читать global
  registry при явном private registry. Orphan с недоказанной принадлежностью
  остаётся unknown; это не кандидат на убийство по похожему EVAL имени.
- Lock сериализует short retirement/admission, не весь provider runtime. Не держать
  новый EVAL lifecycle lock и не ожидать worker, которому нужен этот же lock.
  Cleanup worker не берёт retirement lock рекурсивно. Не держать SQL writer/permit
  при ожидании daemon exit; все fences перепроверяются после await.
- Пока родитель держит retirement fence, выполняется inventory/stop/readback либо
  bounded ожидание existing cleanup worker. Затем retained launch reservation /
  initial owner registration записывается до освобождения lock. Перед первым
  baseline/qualification/Subject dispatch подтвердить её identity/admission.
  Если lock wait истёк, новый dispatch запрещён; вернуть pending prior cleanup
  с exact request ref, не заявлять, что чужая очистка упала, и не сбрасывать бюджет.
- Crash после регистрации, но до spawn: доказать отсутствие physical child и
  закрыть reservation. Crash после spawn до confirm: reattach/reconcile exact
  registration; unknown identity не превращать в kill или второй spawn.
- Eligibility автоматической очистки: подтверждённый terminal failed/completed/
  cancelled либо явный operator stop/abandon, плюс exact ownership. Само по себе
  awaiting_provider, recovery_required, silence или expired lease не означает
  согласие на отмену ещё работающего native запроса. При неопределённости —
  показать blocker/предложить explicit stop, не подменять расследование cleanup.
- Active comparison EVAL исключаются из кандидатов; параллельные новые EVAL после
  общей подготовки разрешены. Изолированные private test registries/resources
  не сканируют global homes.json или реальные пользовательские daemons.
- GC остаётся отдельной операцией: удалить можно только явно выбранные данные
  по existing policy после проверки зависимостей. Cleanup по этому плану ничего
  не удаляет из исторического EVAL и не делает Docker prune/DROP DATABASE.
- Термин «readonly preflight» выше относится к inventory старых owners, не к
  отсутствию любых локальных записей: actual evalPreflight создаёт private
  conformance workspace/home и запускает provider-free doctor. Это поведение
  сохранить; он не останавливает старые EVAL и не вызывает модель. Native memory
  preparation, qualification и model probes идут через authorized prepare/run
  barrier, а не превращают preflight в скрытый оплачиваемый запуск.
- Container stop автоматизировать только при existing explicit ownership и
  last-consumer proof. Если такого proof нет — показать отдельный ресурсный
  blocker/ручную owner-scoped инструкцию, не создавать новый Docker manager и
  не считать отсутствие pg_stat_activity достаточным доказательством.

### R7. Контракты, порядок и дополнительная приёмка

- До кода зафиксировать types/tests для route receipt и cleanup intent; затем
  engine P1–P7, EVAL P8–P9 и integration. Bump только изменённых внутренних
  контрактов; additive optional поля читать совместимо. Unknown schema/version
  и конфликт retained binding — отказ, не подстановка текущего default.
- Существующие physical/capture/cleanup/report состояния не переименовывать.
  Дополнительные route_conformance, cleanup_deferral, local retirement diagnostics
  согласовать с JSON schemas, compact report, text status, health и GC consumers.
  То же доказательство показывается одинаково через status/cleanup/prelaunch.
- Не считать реализацию законченной, пока каждое D01–D14 связано с commit и
  runnable regression в implementation receipt. Тесты нужны и на legacy unbundled,
  bundle-backed SDLC, generic и verified stage-entry restore; не только на один
  happy-path native E2E. No-workspace-change/direct route остаётся покрыт.

| Дополнительная проверка | Ожидаемый результат |
| --- | --- |
| Route меняется во время native Session setup; heartbeat меняет runtime revision | Нет prompt в старый route и нет ложного конфликта на heartbeat; незакрытая Session не потеряна. |
| Commit rebind повторён после projection crash; conflicting tuple | Один route event/worktree; только projection repair; conflicting tuple отвергнут. |
| Поздний shell/SSE update, hung optional output read, background tool returned | Terminal reconciliation доступна; finished shell не оживает; pending background всё ещё удерживает settlement. |
| AGY ERROR/SUCCESS + transcript/persistence error + process restart | Native cause/result сохранены в доступной степени; durability не выдумана; нет replay/ложного PASS. |
| Hook resolve при active prompt; after-hook failure; simultaneous idle | Нет IPC deadlock; original effect/typed cause сохранены; stale generation не влияет на новую. |
| Reused cleanup request ID с другим reason/mode/manifest | Conflict до stop; повтор с тем же intent возвращает retained результат. |
| Deferred inventory меняется; stop уже начат; cleanup worker target scope | Нет обещания отменить принятый stop; worker не убит собственным scope-stop; все owned late children учтены. |
| Missing lock parent, stale lock PID, lock wait timeout, две private registries | Корректный owned lock/readback; pending не равен failure; чужие/global ресурсы не затронуты. |
| Fresh campaign сменила resource home; два новых caller обнаружили старый scope | Старый eligible owner не пропущен, его original resource binding сохранён; lock order/idempotent stop не допускают гонки или deadlock. |
| physical_stopped=true, native_settled=false | Новый независимый запуск допустим только без конфликтов; исторический failure/uncertainty и запрет GC/resume сохранены. |
| Cleanup без model credentials, с недоступным case/устаревшей semantic config | Проверенный owner можно остановить по retained binding; нет model calls, credential forwarding и зависимости от judge qualification. |

Readiness после уточнений: все существенные варианты поведения выбраны;
операционные решения пользователя (конкретный release/новые scored EVAL/retire
исторических процессов) намеренно не выполняются этим планированием. Реализация
должна отдельно подтвердить тестами отсутствие новых блокеров, а не ссылаться на
эту readiness-проверку как на доказательство работоспособности кода.
