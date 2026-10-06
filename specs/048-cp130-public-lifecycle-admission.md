# 048 — Public lifecycle admission across harnesses

Дата: 2026-09-22. Статус: план; реализация не начата.

## Ponytail review — ограничения реализации

Итоговая проверка 2026-09-22: весь заказанный аудит и исправление аналогичных дефектов сохраняются. Перечень рисков не является распоряжением переписать каждый перечисленный компонент. Следующие правила уточняют все этапы ниже.

1. Перед реализацией сверить merged PR в dd-flow-cli/dd-zcode и zcode-acp с пунктами плана. Зафиксировать commits и покрывающие проверки; выполненные пункты закрыть доказательством, не реализовывать повторно. Исторические находки CP-130 сохранять как основание, не выдавать за состояние нового HEAD.
2. Для каждой находки: минимальный regression → существующий общий путь → исправление в нём → sibling regressions. Если сценарий уже корректен, закрыть пункт результатом проверки без изменения production code. Для Z5 сначала установить контракт счётчика; корректный transport counter не переопределять как lifecycle counter.
3. Выбор transport не предрешён: сначала проверить, покрывает ли текущий/merged native механизм требуемые identity и ordering. Использовать уже работающий механизм с наименьшим объёмом изменений. Bounded rendezvous нужен только при доказанной необходимости асинхронного admission; новый shim — только при отсутствии достаточного native primitive. Не реализовывать оба механизма на будущее.
4. Разделить compatibility/capacity/admission логически внутри существующих qualification receipts и tooling. Не вводить три независимых хранилища, новые сервисы или capability negotiation framework. Проверяемого поля contract version и ссылок на exact evidence достаточно, если оно закрывает требования.
5. Общие функции observeLifecycleInvocation, resolveObservedLifecycleArgs, currentLifecycleFailure и существующий parser расширять на месте. Новый helper выделять при реальном повторе или самостоятельной проверяемой границе; не создавать отдельный модуль для каждого пункта плана.
6. Матрица тестов — перечень свойств, не полный декартов продукт routes × transports × failures. Общий route contract покрыть table-driven тестом; transport-specific tests проверяют extraction, identity и ordering; один связный native probe покрывает root, параллельных children и continuation. Дополнительный live probe нужен при ином механизме, новом failure или недостаточном evidence.
7. Allocation/errors/inspection исправлять минимально с учётом merged PR. Перенос usage aggregation между репозиториями не обязателен для завершения 048: полноту и корректность исправить у текущего владельца. Архитектурный перенос выполнять только если он необходим для установленного дефекта; иначе оставить отдельной последующей работой.
8. Safety-инварианты authority, fencing, unknown effects и отсутствие implicit resume не сокращать. Независимые подтверждённые дефекты остаются обязательными до итогового закрытия плана; риск без воспроизведения закрывается проверкой, а не предположительным refactoring.

Review устранил преждевременное предпочтение нового async rendezvous, неоднозначность «раздельных receipts», риск взрывного числа тестов и необязательный перенос accounting. Неподтверждённый механизм корреляции остаётся явным engineering gate, а не обещанием готового дизайна.

## Цель и границы

Устранить разрыв между публичной командой controller и native admission во всех поддержанных harnesses. Модель задаёт семантический ввод и JSON-файлы; runtime восстанавливает собственные scope, paths, checksums и служебные IDs из выданного назначения. Новый ZCode E2E допускается только после проверки этого полного пути.

Основание: CP-130 / EVAL-20260922045349-7f182daa, engine beta.92, ZCode 0.16.9, bridge 0.43.2 overlay 8c0a893f3c26a0b96cb138acf762db84c800298b. Исторический RUN, его БД, verdict и published engine не менять. Не возобновлять его в рамках реализации; новый scored запуск получает отдельный checkpoint/home.

Этот документ дополняет 041–044, 046–047 и gate-план 045. Не считать прежний PASS этих работ доказательством совместимости каждого transport.

## Подтверждённые факты

- Первый native tool_call содержит точную выданную команду `"$DD_FLOW_BIN" stage start --stage specify --json --progress-jsonl`, ACP session ID и native toolCallId. Доставка ACP состоялась.
- В execution db.sqlite: hook_events = 0; lifecycle_invocations содержит одно назначение в status=issued с полными retained argv.
- zcodeInvocationObserver фильтрует команды без --invocation-id. Изолированный вызов observer даёт 0 отправок для публичной команды и 1 для legacy-команды с ID.
- handleZcodeEvent повторно фильтрует команды без ID. publicInvocationCommand намеренно удаляет ID и runtime-owned arguments.
- startDaemon ZCode формирует env с HOME/BIN, но не добавляет managed daemon marker; ранний CLI guard зависит от DD_FLOW_DAEMON_ID. В EVAL наблюдались обычные usage errors о project-root/run-id/intake, затем trusted_session_binding_required/event_missing.
- controller повторил start_stage continuation и сообщил stage_entry_nonprogressing. Отсутствие lifecycle admission оставило причинную цепочку без зарегистрированного результата назначения.
- compatibility qualify использует native-child capacity smoke; совпадение runtime tuple возвращает already_qualified без проверки admission. Preflight создаёт 0 provider sessions и выполняет prepare + doctor.

Первичные доказательства находятся в CP-130 execution: controller session-1/adapter.events.jsonl, controller receipts, RUN timeline и dd-flow-home/db.sqlite. Ответ Subject — дополнительное свидетельство, не источник native authority.

## Карта аудита

Пути src/test ниже относятся к ../dd-flow-cli; lib/tools/specs/runbooks — к dd-eval.

| Область | Результат чтения кода | Работа |
| --- | --- | --- |
| lifecycle-invocations.ts: publicInvocationArgs/publicInvocationCommand | Скрывает IDs и machine arguments для всего managed lifecycle | Сохранить контракт; независимая матрица public → issued → observed → dispatched |
| dd-zcode.mjs: zcodeInvocationObserver | Подтверждённый ID-only фильтр | Native extraction без требования model-visible ID |
| hooks.ts: handleZcodeEvent/recordZcodeLifecycle | Второй ID-only фильтр; receipt type зависит от наличия ID | Разделить transport facts и assignment resolution; ACP receipt не выдавать за синхронный PreToolUse |
| dd-zcode.mjs: flowForwarder | Комментарий предполагает уже выполненный native PreToolUse | Удалить неверное предположение; явно описать выбранный transport protocol |
| dd-zcode-daemon.mjs: config/env/session/reattach | Managed marker не установлен в config.env | Доказать propagation в фактический native Bash; проверить root, children, reattach |
| hooks.ts: handleCodexHook; codex-hook-delivery.ts; dd-codex-daemon.mjs | Есть native proof и observeLifecycleInvocation, daemon marker передаётся | Использовать как проверенный синхронный путь; сохранить существующие trust checks |
| hooks.ts: handleGrokEvent | Пишет hook row и updatedInput; нет вызова observeLifecycleInvocation | Перевести public lifecycle на общее связывание назначения; live failure ещё не воспроизведён |
| hooks.ts: handleControlledToolEvent | Общий путь OpenCode, Droid и Antigravity пишет receipt, но не связывает issued assignment | Исправить один общий путь с сохранением разных native identity checks; live failure каждого не заявлять без probe |
| dd-grok-daemon.mjs, dd-droid.mjs, dd-agy-daemon.mjs, dd-opencode-daemon.mjs | Разные hooks, environments, before/after и возможности updatedInput | Матрица transport capabilities; подтвердить inherited context и callback ordering |
| run-cli.ts: observed lookup/guard/resolve/await | Lookup перед routing, guard зависит от env; асинхронного ожидания public receipt здесь нет | Fail-closed managed mode, bounded rendezvous, внутренние argv только после admission |
| lifecycle-invocations.ts: observedLifecycleInvocation | Без daemonId ищет среди observed/executing всей БД; с daemon фильтрует только daemon scope | Усилить принадлежность вызывающему native execution; параллельные одинаковые команды не должны смешиваться |
| lifecycle-invocations.ts: observedLifecycleDiagnostic | Ограниченный поиск последних 20 событий daemon | Точная scope/operation корреляция; шум других turns не должен скрыть первичный отказ |
| run-controller.ts: start_stage/fanout; continuation-outcome.ts | Неодинаковые пути causal error перед no-progress fallback | Единый приоритет causally-bound error для stage entry, answer и fanout |
| run-controller-state/recovery/adapter; lib/managed-flow-client.mjs, lib/runner.mjs | Несколько слоёв error, capture и settlement | Сохранить primary cause отдельно от capture_pending/cleanup; не объявлять ожидание capture здоровым Subject |
| dd-zcode.mjs: observeModelUpdate/applyProfile/observedProfile; model-observations.mjs | ACP composite model ID сравнивается с bare model; native provider отличается от requested alias | Общая нормализация форматов ZCode по доказанному native mapping, raw facts сохранять |
| zcodeLifecycleQualification; zcode-invocation-observer.test.ts | Allowlist + тест legacy ID; отсутствует текущий public-contract proof | Versioned qualification receipt, отрицательные тесты, exact artifacts |
| lib/runner.mjs: harnessCompatibilityQualify/evalPreflight/evalRun | Capacity smoke и doctor подменяют достаточное lifecycle evidence | Раздельные compatibility/capacity/admission доказательства; gate и при direct run |
| tools/probe-zcode-production-invocations.mjs | Старый prompt требует preserve invocation-id, finish использует heredoc | Current public commands и result-file; engine из выбранного published snapshot |
| tools/probe-zcode-invocation-reattach.mjs | Assertion требует --invocation-id в native command | Проверять durable binding и exact public semantics вместо наличия ID |
| runbooks/update-zcode.md, e2e-monitoring.md; DD-ZCODE.md | Документация границ и qualification | Зафиксировать фактический protocol и недопустимость allowlist-only admission |

Проверены producer, CLI lookup, все ingress в hooks.ts и основные daemon launch paths. Наличие live дефекта доказано для ZCode; таблица отдельно отмечает code-level разрывы и риски других transport. Поддержку неподтверждённого runtime нельзя обещать по результатам только unit tests.

## Инварианты

1. Public argv не содержат authority IDs, context hashes и иных runtime-owned значений. Legacy internal argv допустимы лишь в явно проверяемом внутреннем пути.
2. Env marker — locator managed scope, а не доказательство authority. Receipt требует native session/tool identity, живого owner и generation fencing.
3. Issued assignment не равно observed invocation; запись назначения сама по себе не даёт права исполнения.
4. Exact native observation связывается с единственным assignment; одна mutation claim, повторная доставка идемпотентна. Чужие/устаревшие/неоднозначные события отклоняются.
5. CLI до admission не выполняет lifecycle mutation и не требует от модели восстановить скрытые arguments.
6. Public fingerprint и aliases разбираются общим parser. Не добавлять новую regex-грамматику shell в адаптер.
7. Отсутствие native evidence, rejection, timeout и unknown effect различаются. Не выдавать автоматический retry для contract/authority failure.
8. Известное отсутствие прогресса имеет causal failure независимо от свежего process heartbeat.

## Этап 1 — Regression fixtures и выбор transport

- [ ] Из CP-130 извлечь минимальные обезличенные public command/native event fixtures, без копирования runtime DB или секретов.
- [ ] Добавить красный regression для emit public command → ZCode observer → ingress → retained argv resolution, с реальной функцией renderer и независимым ожидаемым public argv.
- [ ] Построить таблицу sync/async ingress, native IDs, parent ownership, environment propagation, updatedInput support для каждого harness.
- [ ] Для ZCode подтвердить порядок Bash spawn / ACP tool_call, выполнение children, наследование daemon context, повторный attach. Использовать bounded isolated probe.
- [ ] Сравнить текущий/merged native механизм с ACP rendezvous по достаточности identity, ordering и размеру необходимых изменений. Выбрать один минимальный доказуемый путь. Если имеющихся primitives недостаточно, добавить узкий transport shim. Нельзя компенсировать недостаток identity выбором «последнего совпавшего события».
- [ ] Зафиксировать выбранный механизм и evidence до изменения admission. Никакой глобальной подписки/нового сервиса только ради этого исправления.

## Этап 2 — Общий admission

- [ ] Переиспользовать observeLifecycleInvocation, существующие scope validation, fingerprint, replay и resolveObservedLifecycleArgs. Выделить общий приём validated native lifecycle facts из hooks.ts только для реально повторяющихся операций.
- [ ] Оставить harness-specific extraction/proof в соответствующем adapter/ingress. Общая функция не должна принимать недоказанную identity как проверенную.
- [ ] В ZCode удалить оба ID-only фильтра; различать receipt transport явно, независимо от присутствия ID.
- [ ] Подключить handleGrokEvent и handleControlledToolEvent к общей assignment binding transaction. Сохранить auxiliary commands, standalone/bootstrap и PostToolUse semantics отдельными ветками.
- [ ] Receipt commit и assignment observation должны быть атомарны; replay с тем же ID и другими facts — ошибка. Не удерживать SQLite transaction во время ожидания события.
- [ ] Public lookup ограничить актуальными owner/generation/session/tool или эквивалентным доказанным execution locator. Повтор одинаковой команды от разных children не разрешать по времени прибытия.
- [ ] Для синхронных hooks оставить немедленное чтение committed receipt. Для выбранного async transport добавить bounded wait до routing и раскрытия retained argv; использовать существующие ожидание/таймауты где возможно.
- [ ] Deadline исходит из одного operation budget; cancellation/owner loss/generation change завершают ожидание. Receipt после timeout не даёт завершённой CLI-попытке права на позднюю mutation.
- [ ] Доставку lifecycle evidence не блокировать очередью model telemetry; сохранить ошибки persistence как отдельные диагностические факты.

## Этап 3 — Managed context и ошибки

- [ ] Проверить env constructors всех daemon и engine wrappers; добавить недостающий managed marker в ZCode после назначения daemon ID и до запуска native process.
- [ ] Исключить наследование чужого daemon scope при запуске нового adapter, diagnostic probe и Judge. Проверить restart/reattach к тому же owner и отказ после смены generation.
- [ ] Managed lifecycle при потере контекста должен завершаться структурированной ошибкой до usage fallback. Не переводить обычный standalone CLI в managed mode только по наличию случайного файла проекта.
- [ ] Сохранять native observation/rejection и causal diagnostic даже когда assignment ещё не bound; для корреляции использовать validated scope и tool ID, не текст ответа модели.
- [ ] Общий helper выбора primary continuation failure вызвать до stage_entry_nonprogressing, fanout fallback и answer no-progress; accepted repair/HITL/successor должны корректно supersede старый отказ.
- [ ] Протянуть code, reason, scope, native event, phase/effect и receipt reference через controller → recovery → eval status/result. capture_pending и cleanup не заменяют primary failure.
- [ ] Уточнить tests failureAttribution: infrastructure contract failures относятся к infrastructure, fallback без доказательств — undetermined. Productive outcome и physical settlement выводить раздельно.

## Этап 4 — Model/provider evidence

- [ ] Нормализовать composite provider/model IDs из ACP и native readback в одном ZCode helper, используемом initial apply, updates и final receipt.
- [ ] Alias builtin/account признавать эквивалентным только при подтверждённом mapping выбранного native runtime. Сохранять requested, raw observed, canonical observed и источник mapping.
- [ ] Partial config update не должен стирать известный provider или создавать ложную смену model; неизвестное поле остаётся unknown, не matched.
- [ ] Проверки: одинаковая модель в двух форматах; настоящий provider switch; настоящий model switch; неизвестный alias; mode/reasoning mismatch. Не ослаблять permission checks.

## Этап 5 — Qualification и gate

- [ ] В существующем qualification receipt различать binary compatibility, measured native capacity и public lifecycle admission с привязкой к evidence; отдельные файлы нужны лишь если их уже требует tooling. already_qualified разрешать только при наличии требуемых доказательств для текущего exact tuple.
- [ ] Ключ admission receipt: published engine full-content digest (включает bundled adapter), native binary digest, bridge commit/content identity, admission/probe contract version и влияющая на transport configuration. Mutable paths и строка версии недостаточны.
- [ ] Обновить старые ZCode probes: public renderer из выбранного engine snapshot, JSON result files, без требования model-visible invocation-id и без соседнего mutable dist import.
- [ ] Qualification должна доказать root stage entry, root/child work start+finish, две параллельные child assignments и продолжение той же child session. Проверять DB/state effects и receipts, а не финальное DONE модели.
- [ ] Preflight оставить без provider sessions: он проверяет заранее полученный qualification receipt. Если receipt отсутствует/устарел — actionable failure с штатной командой qualification.
- [ ] Тот же admission check обязателен в evalRun до создания scored Subject, включая обход preflight прямым запуском. Qualification имеет отдельный ограниченный путь проверки ещё не допущенного tuple, без изменения глобальной allowlist ради probe.
- [ ] Миграция legacy receipts: не трактовать отсутствие admission proof как PASS. Старые EVAL остаются читаемыми. Новые запуски требуют нового receipt.
- [ ] CI проверяет deterministic contract/transport fixtures. Live qualification выбранного harness выполняется при изменении relevant tuple/contract; не требовать дорогой live suite всех providers на каждый нерелевантный релиз.

## Матрица обязательных проверок

| Группа | Сценарии и критерий |
| --- | --- |
| Routes | stage start/finish/pause/resume, work start/finish/fail, merge apply/repair, recovery accept и bootstrap; public/internal contract для каждой операции |
| Structured input | result/answer/question/verification/decision JSON files, quoted paths/spaces, разрешённые aliases; неизвестный alias и опасная shell composition отклоняются |
| Timing | Receipt до CLI, CLI до receipt, задержка telemetry, deadline, событие после deadline, cancel во время wait |
| Identity | Root, direct child, подтверждённый nested child где поддержан; foreign daemon/project/session, orphan parent, stale generation |
| Concurrency/replay | Два одинаковых public argv в разных scopes, duplicate event, conflicting event ID, повтор executing/settled call; максимум один effect |
| Context | Missing marker, чужой inherited marker, reattach, owner death, pinned binary/home consistency |
| Failures | Persistence failure, assignment missing, unsupported contract, rejection до binding; primary cause переживает capture/cleanup |
| Existing behavior | Codex synchronous proof и остальные native hooks; standalone CLI, bootstrap и read-only paths сохраняются |
| Qualification | Tuple/engine/probe change инвалидирует PASS; capacity-only и doctor-only не допускают scored E2E |

Расширять существующие suites lifecycle-invocations, hooks-preparation/hooks-shell/hook-responsibility, zcode-invocation-observer, run-cli, run-controller-stages/state/capture и adapter fixtures. В dd-eval — eval/preflight/admission/qualification tests. Не писать проверки, выводящие ожидаемый список маршрутов из той же таблицы реализации: хотя бы одна независимая матрица обязательна.

## Refactoring и документация

- Общий parser/route contract остаётся единственным источником синтаксиса. Native tool names и extraction остаются у transport.
- Общие helper-функции: validated lifecycle receipt → assignment binding; bounded observed-assignment lookup; causal continuation failure selection; ZCode profile normalization. Сначала использовать существующие функции, затем выделять только доказанные повторы.
- Не создавать общий superclass daemon, новый orchestration loop или универсальный plugin framework.
- В update-zcode runbook описать compatibility/capacity/admission receipts, provenance, overlay boundary и rollback. В monitoring — различать «native event отсутствует», «событие отброшено», «assignment не найден», «CLI ждёт receipt».
- Согласовать DD-ZCODE.md с фактическим решением; существующие незакоммиченные README.md/DD-ZCODE.md сохранить и учитывать отдельно. Не объявлять policy extraction из bridge завершённой: usage aggregation пока остаётся там.
- Обновить активные примеры/qualification prompts с legacy IDs/heredoc. Исторические incident runbooks не переписывать как будто они исполнялись по новому контракту; добавить явные ссылки на замену.

## Порядок реализации и выпуска

1. Сверить merged PR и exact commits, закрыть уже выполненные пункты их regressions; затем зафиксировать недостающие reproductions и выбрать доказуемый transport (этап 1).
2. Реализовать shared admission + ZCode context + deterministic timing/security tests (этапы 2–3).
3. Подключить остальные ingress и прогнать независимую route × transport матрицу. Непроверенные live combinations обозначить unqualified.
4. Исправить profile normalization и qualification tooling/gates; проверить устаревание receipts и отсутствие обхода через evalRun.
5. Проверить документацию, dirty changes ownership, focused suites и обязательный release gate для общего runtime изменения; закоммитить логические части.
6. Выпустить новый immutable engine; проверить tag, build-info/canon, npm integrity и installed full-content digest. Overlay обновлять/релизить только если выбранный transport потребовал native primitive.
7. Получить live admission receipt на опубликованном exact tuple в отдельном qualification home. При failure расследовать, не добавлять tuple в allowlist вслепую.
8. Создать следующий свободный checkpoint/home на базе CP-130: source/flow/memory-bank inputs прежние; поменять только проверенные runtime pins. Не копировать старые runs/DB/conformance как новое состояние; qualification receipt прикрепить как проверяемое evidence.
9. Обновить case checksum, сохранить runbook receipts, commit/push; штатный preflight PASS, затем один scored ZCode E2E. Записать конкретный EVAL ID в новый monitor.
10. Мониторить фактическую stage, work/attempt/cycle, durable events, native turns, owner liveness, HITL, causal errors и settlement. При runtime failure — read-only расследование; автоматический resume/repair не включать.

## Definition of done и открытые проверки

- [ ] CP-130 fixture проходит полный admission без ручного добавления скрытых аргументов.
- [ ] Все 11 перечисленных маршрутов покрыты независимыми expectations; аналогичные ingress подключены к shared contract либо явно недоступны до qualification.
- [ ] Ни один delay/duplicate/foreign event не разрешает неправильную mutation; невозможная корреляция завершает вызов явной ошибкой.
- [ ] Preflight/direct run отвергают capacity-only evidence и устаревший tuple.
- [ ] Primary error не теряется за no-progress/capture_pending; ложные model transitions устранены без сокрытия реальных switches.
- [ ] Published artifact и новый EVAL имеют exact provenance; мониторинг привязан к новому run.

Нерешённый engineering gate: фактическая возможность однозначно связать async ACP event с конкретным native CLI execution при одновременных одинаковых командах. Этап 1 обязан закрыть его evidence; простое добавление env marker и удаление regex не считается готовым решением. Live поведение Grok/OpenCode/Droid/Antigravity требует собственных probes; текущий аудит не выдаёт им фиктивный PASS.

## Дополнение — полный используемый ZCode integration surface

Повторный аудит 2026-09-22 охватывает фактически установленный overlay 8c0a893 в CP-130 и его consumers в dd-flow-cli. Это аудит интеграции и её reachable paths, не заявление о проверке всех внутренних функций закрытого native ZCode. Сверены registry src/index.ts, extensions, backend/client, lazy session materialization, translator/dispatch, background tasks, adapter create/prompt/inspect/cancel/fork и daemon operations.

### Новые подтверждённые расхождения кода

| ID | Producer → consumer | Расхождение и последствия | Исправление и проверка |
| --- | --- | --- | --- |
| Z1 | bridge allocation → dd-zcode createSessionWithBridge/allocationObservers → daemon onSessionAllocated | Adapter подписывается на zcode/session/allocated; installed bridge не содержит producer этого notification. Обычный resolve-response работает, но позднее native allocation после потерянного ответа этим каналом не наблюдается | Минимальный bridge primitive для committed alias/native/cwd allocation и retained readback; adapter сохраняет факт независимо от успеха post-create/profile. Test: native create succeeds, response lost/late, cancel during create, daemon restart; нельзя повторно создать Session при unknown outcome |
| Z2 | backend/client.request → extensions → AcpBridge.receive | Backend timeout/dead/pipe возвращает только message; extensions превращает native error в Error(message). Adapter ожидает data.code/data.details и специальные native_timeout/native_backend_dead/native_backend_pipe_broken/native_outcome_unknown | Единый bridge error mapper для используемых RPC с method/request identity и dispatch/effect state; adapter сохраняет primary native code. Test: до dispatch, timeout после dispatch, EOF, late success, explicit rejection; unknown не превращается в no_effect/retryable |
| Z3 | inspectSession/resolveSidOrThrow → ensureRealSession → adapter inspect/controlledIdentity | read/subagents/usage/events и resolve могут materialize/reload; one-shot adapter inspect дополнительно вызывает resume. Поэтому обычный inspect нельзя считать read-only относительно native residency | Разделить attach/recovery и non-materializing observation. Использовать resident/retainedSubagents где достаточны; недостающий native read-only primitive добавить узко. Test: inspect закрытой/evicted/unknown session не вызывает create/resume; productive reattach разрешён явно |
| Z4 | usage/requestUsageFromRead → forwardUsage/ingestion | finite превращает отсутствующие поля в 0, measured определяется наличием хотя бы одного assistant token record; ошибка второго session/read скрывается. Нет dedup request identity в суммировании | Сохранять completeness/error и missing counters, различать отсутствующие и измеренные нули. Проверить native message/request semantics до изменения подсчёта. Test: partial tokens, repeated request ID, missing read, truncation, cumulative/delta и cache/reasoning |
| Z5 | native tool result → ACP summary → eval tool evidence | В CP-130 CLI errors не отражены как failures в tool summary. Возможное различие успешного Bash transport и ненулевого CLI exit | Сверить native result shape и translator; хранить transport completion отдельно от process exit/lifecycle result. Не утверждать успешный lifecycle по ACP completed. Test: Bash tool completed + exit 1 + structured CLI rejection |

Z1–Z4 подтверждены чтением обеих сторон контракта; конкретные аварийные сценарии требуют targeted reproductions. Z5 — наблюдаемая неоднозначность evidence, attribution причины требует сопоставления native result. Ни один из них не объявляется дополнительной причиной уже объяснённого CP-130 SPECIFY failure.

### Reachability и обязательные регрессии

- [ ] create: session/new → alias persist → resolve/materialize → native persist → applyProfile → usage. Ошибка каждого post-allocation шага сохраняет ownership; creation callback идемпотентен и не перезаписывает другую active operation.
- [ ] resume/reattach: lazy alias store, cwd, native/ACP ID distinction, loaded/evicted state. Проверить чужой workspace и обработку stale mapping; не полагаться на совпадение двух видов ID.
- [ ] prompt/root/children: translators/event-translator.ts → handlers/dispatch.ts сохраняют childSessionId/parentToolCallId/agentId/taskId. Проверить delayed Agent parent event, orphan child, nested ancestry, replay journal и одинаковые tool IDs разных sessions.
- [ ] background: handlers/background-tasks.ts, SendMessage/child continuation и native end_turn. Root end_turn не означает завершения children; новое сообщение той же child не теряет ownership и admission.
- [ ] profile: порядок set_mode → setThoughtLevel → setModel и final readback. Проверить, не сбрасывает ли model switch reasoning; native config updates с partial fields не должны давать ложный PASS или ложный drift.
- [ ] inspect: явно обозначить различия обычного read/resolve и resident/retained reads; unknown/observation failure не равны empty tree или resident=false.
- [ ] cancel: cancelBackgroundTask → tree read → close → resident/retained verification; остановка root не доказывает остановку известных детей. Ошибка чтения topology не означает чистую остановку; cancelled prompt не должен делать implicit resume через final inspection.
- [ ] fork: session/fork возвращает forkedSessionId, bridge регистрирует alias/cwd/MCP; adapter связывает новый root с source ancestry, но не переносит чужую lifecycle authority. Проверить active children, unknown fork outcome и первый public lifecycle нового fork.
- [ ] events/usage: zcode/session/events зарегистрирован как extension, но adapter сейчас не вызывает его напрямую; не добавлять polling без необходимости. Если нужен raw request evidence для Z4, обосновать использование и bounded объём.
- [ ] shared AcpBridge: используется также Grok; изменение native error/profile/notification handling проверять на Grok fixtures, без навязывания ему ZCode-specific metadata.
- [ ] CLI entrypoints, daemon operations и one-shot функции должны проходить одни ownership/admission правила; read-only status не должен скрыто переключаться на productive attach.

### Незакоммиченные изменения старого fork

В /Users/deksden/Documents/_Projects/zcode-acp имеются незакоммиченные backend errors, allocation notification и lazy-session изменения, которых нет в qualified overlay. В частности, локальный src/index.ts уже содержит producer zcode/session/allocated; это не доказательство его наличия в CP-130. Не копировать dirty дерево целиком и не считать все эти правки завершёнными.

- [ ] Инвентаризировать каждую локальную правку: исходная причина, актуальный upstream эквивалент, зависимость adapter, regression, решение keep/drop/port.
- [ ] Для Z1/Z2 использовать существующие локальные решения как материал review, портировать минимальные проверенные transport changes на текущий upstream с отдельными commits.
- [ ] Оставить policy/admission/profile normalization/qualification в dd-zcode/dd-flow/dd-eval. Allocation facts, raw native errors и non-materializing native access относятся к bridge.
- [ ] Исправить доказанные потери usage evidence на существующей границе. Перенос aggregation в adapter не входит в обязательный результат 048, если корректность достигается у текущего владельца; возможная последующая миграция требует raw request identity/completeness и единственного владельца подсчёта.
- [ ] Обновить bridge capability/contract evidence: одинаковый dd-zcode-harness@1 не доказывает наличие allocation/error/observation возможностей. Добавить минимальные проверяемые capability assertions для реально используемых primitives.

### Встраивание в реализацию

Z1/Z2 и non-materializing checks Z3 выполнить до live qualification новой версии: иначе failure/cleanup probe не может доказать ownership и settlement. Z4/profile evidence закрыть до признания нового scored результата достоверным. Проверить Z5 до утверждения корректности tool failure counters. Native session/cancellation проверки выполнять в отдельном isolated qualification scope, не на историческом CP-130.

К DoD добавить producer/consumer tests для каждого потребляемого extension и async notification, failure injection при allocation/transport, observation-after-close без resume, root/child continuation и сохранение неполноты usage. Полный продуктовый UI/hub/remote ZCode вне этого плана, кроме путей, реально используемых dd-zcode.
