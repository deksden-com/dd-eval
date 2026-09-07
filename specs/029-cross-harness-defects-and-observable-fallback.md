# 029 — Общий план исправлений и наблюдаемый fallback

Дата: 2026-09-06. Статус: **основные изменения A–E и live root smoke выполнены; cp-077 выявил дополнительные дефекты Codex settlement/error attribution, общая квалификация F не завершена**.
Уточняет [028](028-droid-eval-defects-root-cause-and-repair-plan.md).
Проверен текущий dd-eval HEAD `ab94650`; локальные изменения runner/recovery
существовали до этой правки документа и в неё не входят.

## Решение по fallback

Разрешить штатный quota fallback и продолжать выполнение. Смена модели сама
по себе не является ошибкой Subject, поводом для repair или инфраструктурным
провалом. Запуск оценивает адаптивную связку harness + модели; его нельзя
подписывать как результат одной исходной модели. Ранее выявленное вмешательство
общей БД остаётся независимой причиной невалидности исторического запуска.

Минимальная реализация — один контракт наблюдений поверх существующих журналов,
один reducer проекции профиля и существующий канал progress. Новый сервис
мониторинга, изменение аккаунта или отдельная система уведомлений не нужны.

Разделить:

- `requested_profile`: неизменяемое намерение запуска;
- native configured profile: что runtime принял в настройках;
- observed model: подтверждённое событием/ответом использование или настройка,
  с явно указанным уровнем доказательства;
- неизвестное/устаревшее наблюдение: не подставлять requested как observed.

Событие смены содержит execution, generation, root/child Session ID, старую и
новую модель/provider, native timestamp (если есть), время обнаружения, источник,
причину (например `quota/402/overage_reactive_402`) и hash допустимого evidence.
Если причина неизвестна, так и записать; не объявлять любую смену quota fallback.
Не выводить токены авторизации и полные общие native logs.

Сначала сохранить событие, затем показать progress: «Дочерняя сессия …:
Sol → Kimi, исчерпан лимит; выполнение продолжается». Повторы одного наблюдения
дедуплицировать; возврат Kimi → Sol — новое событие. После рестарта непрочитанные
уведомления восстанавливаются по журналу. Допустима повторная доставка с тем же
ID; обещать exactly-once UI нельзя. При недоступности UI событие остаётся в
status/report. Потерю источника наблюдения показывать отдельным предупреждением.

Native events — основной источник; для Droid детей, не видимых root RPC,
наблюдать только зарегистрированные файлы settings/events. Ограниченный polling
с mtime/offset, обработкой ротации и неполной записи; без полного чтения истории
на heartbeat. Начальный целевой интервал — 2 секунды с измерением нагрузки;
при исправном источнике приёмка требует обнаружения в пределах двух интервалов.
Native settings подтверждают конфигурацию, а не факт исполнения каждого запроса.
Источники не гарантируют раскрытие скрытой серверной маршрутизации провайдера.
Если наблюдение невозможно, итог получает `model_observation=incomplete`.

В status/report всегда показывать requested, известные модели и интервалы
по сессиям, число переходов, полноту наблюдения. Счётчики usage делить по модели
только при наличии native attribution. Общий session counter показывать как
mixed/unattributed; не распределять стоимость пропорционально времени.

Guard должен различать разрешённый routing transition, отсутствие сведений и
нарушение целостности. Не отключать проверку Session ID, cwd, владения процессами,
permission mode и доказательств. Ошибка целостности прерывает активный prompt
через общий fatal handler; разрешённая смена записывается и пропускает работу.
Один policy evaluator используют adapter, runner и Flow hooks: иначе hook
продолжит блокировать fallback, разрешённый runner. Строгий pin можно оставить
явной опцией конкретного эксперимента, но он не является требованием этого плана.

## Аудит аналогичных путей

Ниже различаются подтверждённые свойства исходника и воспроизведённые инциденты.
Для новых путей ещё нужны fault-injection регрессии; они не объявляются live repro.

| Узел | Что установлено по коду | Системное исправление |
| --- | --- | --- |
| Codex `createSessionWithBridge`, `startSessionWithBridge`, `promptSessionWithBridge`, `inspectSessionWithBridge` | При отсутствии native model подставляется requested; start вообще маркирует запрос как observed, inspect также подставляет reasoning | Разделить requested/applied/observed; отсутствие поля оставлять unknown; проверять конкретный turn, не переносить старую модель на новый |
| Grok `observedProfile`, `inspect`, daemon `hook.resolve` | Fallback на requested; inspect использует init, hook возвращает daemon config как observed | Наблюдать актуальные native session/model events; init хранить с временем и scope, не выдавать за текущее использование ребёнком |
| AGY `observedProfile` | Отсутствующая init.model заменяется requested; reasoning/mode берутся из запроса | Явно указать evidence/source каждого поля; unsupported observation не считать matched |
| ZCode `observedProfile` и `zcodeLifecycleEnvelope` | Session read читает native settings, но lifecycle envelope заново передаёт requested под именем observed | Передавать проверенное session-scoped наблюдение; Flow `hooks.ts` не должен доверять декларации как независимому native факту |
| OpenCode `session.prompt` | Проверяет финальный info.model после завершения prompt | Добавить временную историю по доступным native сообщениям/событиям: финальный профиль не исключает промежуточную смену |
| Общий runner `withExecutionDaemon` | Cancel проходит через status и при отсутствии daemon через продуктивный recovery bridge | Отдельный control path к владельцу; никаких стартов runtime/auth setup для отмены |
| Droid `daemon.status` | Refresh с profile validation блокирует runner cancel; воспроизведено в 028 | Status возвращает ошибки наблюдения как данные; cancel доступен независимо от модели |
| Grok `daemon.status`, `refreshTree` | Idle status ожидает inspect; сетевой/diagnostic отказ может не дать runner вызвать cancel | Кэшированная control identity отдельно от диагностики; stop пытается завершить известное своё дерево даже при ошибке inspect |
| OpenCode `cancelTree`, ZCode `cancelTree` | Последовательный await ошибки ребёнка прерывает обработку следующих детей и root | Собрать ошибки по узлам, продолжить отмену остальных подтверждённых owned nodes, затем проверить settlement |
| OpenCode `session.cancel` | После abort обязательный describe может потерять результат уже выполненной отмены | Сохранять cancellation attempts и observation errors отдельно; отсутствие проверки не объявлять settlement |
| Все harness через runner | Независимые launch/cancel operation locks не выбирают общий terminal outcome | Один execution/generation reducer, существующий lock, freeze/Judge из сохранённой проекции |
| Runner `runnerCancel` | Сессия без ID пропускается; `cancelled.every(...)` на пустом массиве даёт true и допускает finalize | Учитывать все выбранные executions: отдельно доказанно never-dispatched, terminal, owned active и unknown; пустой список receipts не доказывает отмену |

Не заменять все адаптеры универсальным runtime. Общими сделать контракт
наблюдений, классификацию причин, terminal reducer и conformance checks.
Протокол отмены и получение native evidence остаются адаптерными.

## Остальные первопричины и границы исправления

1. **Тестовая БД.** Общие фиксированные имена в baseline Vitest config/setup
   и новой upgrade fixture допускают чужой reset. Один project-owned test-world
   на invocation, точный env для setup/seed/API/workers/teardown, ownership guard
   перед reset/drop; отдельные роли integration/upgrade/browser. Обычный pnpm
   использует тот же launcher. Namespace checkout недостаточен. Проверить все
   database URL/default/reset consumers, не только исторически упавший setup.
2. **Порты.** Playwright игнорирует выданные Flow API/Web ports. Один resolver
   для server command, readiness, proxy и baseURL; аудит hardcoded портов во
   всех launchers/configs. Использовать существующий Flow allocator, сохранять
   совпадение lease и фактических endpoints в receipt.
3. **Keyboard test.** Минимальный headless Chromium repro исключил приложение
   и БД, но не установил внутреннюю причину Chromium. Убрать непроверенное
   предположение о трёх ArrowDown из functional persistence теста. Оставить
   отдельную квалификацию реального keyboard поведения на поддерживаемой среде.
   Аудировать похожие select/End/ArrowDown тесты; selectOption не доказывает a11y.
4. **Baseline.** Tag/hash подтверждает identity, но не pre-feature пригодность.
   Case-owned admission перед Subject; source неизменен при обновлении flow_pack.
   Инфраструктурные исправления — новый commit от `44939e9`, новый tag/checkpoint.
   Старые scored workspaces не править. Недостающую проверку PATCH без priority
   учитывать как finding Subject; скрытую проверку не передавать ему в prompt.
5. **Engine.** Проверять фактический artifact digest/build identity вместе с
   version; аудит prepare/preflight/resume/router snapshot. Отсутствующий pin
   явно требует нового checkpoint, не молчаливого доверия номеру версии.
6. **Evidence/report.** Нормализовать причины adapters до runner classification:
   сейчас `profile_drift`, `profile_mismatch`, `agy_profile_drift` различаются,
   а общий список инфраструктурных ошибок не покрывает все эти имена напрямую.
   Проверить полный путь сериализации, не только расширить список строк.
   Разрешённый fallback — событие, не fatal error. Сохранить отдельно качество
   candidate, ресурсную валидность и model attribution. Поздние выводы —
   immutable addendum; повторный Judge — явная ревизия, без переписи истории.

## Порядок реализации и приёмка

| Пакет | Изменение | Обязательная проверка |
| --- | --- | --- |
| A | Общий control path, best-effort owned-tree cleanup во всех adapters, coalesced stop | Drift/сломанный inspect/ошибка одного ребёнка не мешают попытке остановить остальных; foreign identity не затрагивается; неизвестный settlement не становится success; нет нового daemon для cancel |
| B | Общий terminal reducer и finalize | Барьеры между процессами: cancel-first, complete-first, fatal-first, empty receipts, crash, late generation; один принятый terminal/candidate/Judge; без ослабления candidate_revision_unauthorized |
| C | Observations + разрешённый fallback от adapter до Flow и report | Scripted root/child 402, смена и возврат, missing fields, restart/replay, log rotation; событие durable, progress видим, работа продолжается, noFlow тоже наблюдается; identity violation всё ещё останавливает |
| D | Test-world/ports во всех project entrypoints | Два checkout и два одновременных check одного checkout с разными migration hashes; ручной pnpm; kill одного мира не затрагивает другой; receipt соответствует DB/listeners |
| E | Baseline/engine admission, browser qualification, evidence | Pre-feature acceptance; одинаковая version с другим digest отклоняется; semantic persistence и отдельный keyboard test; старые receipts неизменны |
| F | Выпуск и квалификация | Целевые регрессии, обязательные repo checks; установленный artifact проверен; короткий live smoke control/hooks; новый E2E до MERGE на новом checkpoint |

A предшествует включению общего fatal handler; B предшествует новой финализации;
C должен быть завершён во всех потребителях профиля до разрешения fallback в
scored запуске. D/E нужны до следующего параллельного сравнения. Каждое исправление
включает поиск аналогичного пути и регрессию на уровне общего контракта плюс
адаптерную проверку там, где протокол отличается.

Quota branch проверяется scripted provider без намеренного исчерпания аккаунта.
Live smoke не доказывает полноту наблюдения на всех провайдерах; возможности
каждого источника фиксируются явно. Открытые вопросы перед F: квалификация child
источника Droid 0.212.0, native fields/events остальных providers, поддерживаемая
keyboard среда. Для них предусмотрены отдельные проверки, а не предположения.

Первоначальный шаг был планом; результаты последующей реализации см. в [029 implementation evidence](029-implementation-evidence.md).
Исторические воспроизведения перечислены в 028. Реализация должна закрыть весь
пакет и найденные аналоги, а не ограничиться Droid catch или снятием profile guard.
