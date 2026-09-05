# 024. Единый автономный план системных исправлений флоу, раннера и упряжек

Дата: 2026-09-05. Статус: **реализован 2026-09-06; полноценный live E2E этим
пакетом не запускался**.

Редакция объединяет D01–D12 и N01–N09. Это единственный актуальный план пакета;
отчёты расследований — доказательства, а не дополнительные планы исполнения.
N06 расширяет D01 и не считается отдельной первопричиной.

## 0. Задание исполнителю и границы

Исправить контракты исполнения, восстановления, проверок, доказательств и
наблюдаемости, перечисленные ниже. Работать с причинами во всех вызывающих
путях, а не добавлять исключения для одного эвала. Документ самодостаточен;
историю разговора читать не требуется.

Рабочий каталог: `/Users/deksden/Documents/_Projects`.
Все приведённые ниже пути исходников относительны к явно указанному репозиторию.

Репозитории:

| Репозиторий | Ответственность |
|---|---|
| `dd-eval` | раннер, адаптеры упряжек, восстановление, пакеты результатов, Judge, ранбуки |
| `dd-flow-cli` | авторитетное состояние RUN/Work, проверки, архивирование, статистика, MERGE |
| `dd-memorybank` | канонические инструкции стадий и методик |
| `zcode-acp` | мост к native ZCode: завершение prompt и наблюдение за остановкой |
| `dd-tasks` | только штатная синхронизация пакета флоу/совместимости; не исправление исторического продукта эвала |

Исходные версии исследования: dd-eval `c1f0b93`, dd-flow-cli `e11a611`,
CLI `0.9.0-beta.15`, Memory Bank `4.0.4`. Перед началом записать фактические HEAD
и dirty status: другие сессии могли внести полезные исправления. Не откатывать их.

Основание: [расследование](../cases/sdlc-eval-2026-summer-task-priority/results/2026-09-05-three-e2e-root-cause-audit.md).
Дополнение: [проход по упряжкам](../cases/sdlc-eval-2026-summer-task-priority/results/2026-09-05-harness-walkthrough-audit.md).
Этот документ уточняет незакрытые вопросы [023](023-suspend-aware-execution-and-repair-contracts.md).
В конфликтующих местах для нового пакета руководствоваться решениями 024;
прежние отчёты не переписывать задним числом.

### Что НЕ делать

- Не править вручную SQLite, receipts, статусы или продукт исторических RUN.
- Не пытаться сделать три неуспешных прогона успешными изменением отчёта.
- Не вводить новую Flow DSL, отдельный workflow framework, Agent Turn entity,
  каталог семантических ошибок или новый вид эвалов.
- Не решать детерминированно, правильно ли реализована функция и достаточен ли
  тест. Это решение модели. Код проверяет форму, идентичность, разрешённый
  переход, процесс, exit code, адресуемость и полноту объявленного исполнения.
- Не переносить все aggregate-проверки во все Work и не ослаблять итоговый gate.
- Не запускать платный E2E автоматически из unit-тестов/проверки релиза.
  Граница пакета — исправления, проверки, предусмотренные релизы, готовность
  нового запуска. Live smoke выполнять только при соответствующем разрешении
  задания на реализацию; полноценный E2E — отдельная явная команда пользователя.
- Не перестраивать канонические пакеты контекста ради E2E: они ему не нужны.

## 1. Термины и обязательные инварианты

- **Work** — управляемая задача; successful provider response не завершает Work.
- **Session** — физическая сессия упряжки; публичная идентичность:
  `(harness, native session id)`. Транспортный adapter id остаётся внутри адаптера.
- **Turn** — ход провайдера, не новая сущность базы dd-flow.
- **Попытка стадии** — существующая попытка в RUN. Repair MERGE создаёт новый
  цикл CODE/CODE-REVIEW/MERGE, но не новый RUN.
- **Квитанция (receipt)** — факт выполнения проверки с исходом и доказательствами.
- **Settlement** — подтверждение, что адресованный ход/дерево больше не выполняется;
  подтверждение приёма cancel не равно settlement.
- **Cleanup** — остановка и освобождение принадлежащих запуску ресурсов, не
  результат качества работы модели.

Обязательные свойства:

1. Раннер не придумывает переход, которого нет в флоу; флоу не рассчитывает,
   что раннер восстановит переход из текста последнего ответа модели.
2. Ответ относится к той же физической сессии и операции, которую вызвали.
3. После неизвестного исхода сначала наблюдать исходную операцию, не повторять prompt.
4. Нормально завершившийся ход при незавершённом Work требует продолжения или
   решения координатора; явный сбой исполнителя не превращается в вечный running.
5. Падение repair-проверки оставляет текущий repair открытым.
6. Архив не делает доказательства недоступными и не меняет их содержимое/hash.
7. Ошибка выполнения и результат cleanup сохраняются независимо.
8. Счётчики использования имеют одну объявленную семантику, а unknown не равен 0.

## 2. Исходные доказательства для регрессий

Корень: `/Users/deksden/.dd-eval/runs/`.

| Дефект | Прогон / факт |
|---|---|
| D01 переход | `EVAL-20260905111617-f949e84a`: MERGE repair вернул next CODE; runner — incomplete_subject_turn |
| D02 среда теста | тот же RUN: MERGE RCP-001 unit упал без БД, RCP-002 contract прошёл |
| D03 repair | WRK-019…022 исправляли форматирование; их проверка имела run_at=code |
| D04 архив | RCP-001 лежит под try-001; четыре абсолютных пути внутри указывают в старое место |
| D05 ребёнок | `EVAL-20260905104307-78d396f8`: два native child failed; Work остались незавершёнными |
| D06 ACP | тот же RUN: stopReason=max_turn_requests, root running, следующий prompt tree_not_settled |
| D07 время | разные watchdog в runner, мосте и native; повторные updates не обязательно прогресс |
| D08 identity | `EVAL-20260905114448-6a6c0920`: cancel e106ee52… вернул e9a788f9… |
| D09 cleanup | AGY failure стал cancelled; ZCode daemon остался жить после failure |
| D10 tools | ZCode передаёт tools за prompt, CLI вычитает их как cumulative snapshots |
| D11 повторы | MERGE дважды quality и docs на одном проверяемом дереве |
| D12 отчёт | на incomplete нет конечного evidence bundle и штатной Judge-оценки |

Превращать эти факты в небольшие синтетические фикстуры с fake provider.
Не копировать целые многомегабайтные транскрипты и никакие секреты в Git.
Не использовать абсолютные пути этих RUN в тестовых утверждениях.

## 3. Порядок реализации

Выполнять B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9.
Тест, воспроизводящий соответствующее поведение, писать до изменения логики.
Каждый блок включает исправление всех перечисленных sibling paths, а не только
первого найденного caller. Новые имена функций/полей ниже — проектные решения
для реализации, не утверждение, что такой API уже существует.

### Полное покрытие находок

| ID | Первопричина / исправление | Блоки |
|---|---|---|
| D01, N06 | Разные переходы и контракты normal/recovery/reference/server | B2 |
| D02 | Не проработана среда публичных test entrypoints | B5, B9 |
| D03 | Repair не исполняет причинные aggregate checks | B5 |
| D04 | Архив разрывает ссылки; repair неустойчив к падению | B4 |
| D05 | Native child outcome не согласован с Work | B1, B3 |
| D06, N05 | Возврат запроса/отсутствие детей подменяет завершение root | B2, B6 |
| D07 | Несогласованные источники активности и таймауты | B6 |
| D08 | Адресованная операция может работать с другой Session | B1 |
| D09 | Cleanup подменяет результат или оставляет процессы | B1, B6 |
| D10 | Разная семантика счётчиков и повторный учёт | B7 |
| D11 | Одна проверка повторяется из-за нескольких policy refs | B5 |
| D12 | Неуспех не получает evidence bundle/Judge | B8 |
| N01 | Канон MERGE противоречит runtime prompt | B0, B5, B9 |
| N02 | Новый Session id ошибочно принимается за пустой контекст | B3, B9 |
| N03 | Codex child transcript обновляет binding корня | B1, B7 |
| N04 | AGY смешивает Stop/transcript и исходы разных Session | B1, B2, B3 |
| N07 | Recovery не сверяет bytes принятого ответа с checksum | B2 |
| N08 | Ответы stage start перезаписывают общий файл | B4, B8 |
| N09 | OpenCode конкурентно сохраняет состояние в один temp-файл | B6 |

### B0. База и согласованные контракты

1. Прочитать инструкции репозиториев; зафиксировать HEAD/ветки/dirty state,
   опубликованные версии и выбранную пару. Проверить уже внесённые другими
   сессиями исправления и сохранить их. Не повторять патч, если причина уже
   устранена, но подтвердить это соответствующей регрессией.
2. Для Codex/AGY/ZCode/Grok/OpenCode проверить все targeted операции, хуки,
   settlement и usage. В отчёте исполнения вести матрицу «исправлено / уже
   корректно + тест / неизвестно». Не менять рабочий код ради единообразного стиля.
3. Разделить Work outcome, native turn outcome, tree settlement, владение
   процессом и cleanup. Это разные факты, не один completed/active_tree.
4. MERGE-контракт: продуктовый дефект → source repair → CODE → независимое
   CODE-REVIEW → новый MRG. Реальные merge conflicts разрешаются в integration
   workspace. Восстановление среды без изменения продукта остаётся в текущем
   MERGE и использует повтор проверки B5. Причину классифицирует модель.
5. Снятые подозрения не исправлять: `assertDaemonOwnership` уже блокирует новые
   продуктивные операции при lease.error. Для sparse OpenCode statuses сначала
   проверить native API: отсутствие записи может штатно означать idle.
6. Новые структурные контракты согласовать сразу во всех producers/readers,
   schemas, CLI help, prompt и тестах. Повышать schema id только при реальной
   несовместимости; не строить ненужный слой legacy fallbacks.

## B1. Идентичность, принадлежность наблюдений и исход — D08/D09/N03/N04

### Файлы

dd-eval:
`lib/dd-agy-daemon.mjs`, `lib/dd-agy.mjs`, `lib/runner.mjs`,
`lib/runner-events.mjs`, `lib/driver-recovery.mjs`, `lib/managed-daemon.mjs`;
остальные `lib/dd-*-daemon.mjs` — для проверки того же контракта.

### Изменения

1. В AGY ввести одну внутреннюю `requireSessionIdentity(requestedId)`.
   Вызвать её для prompt/inspect/cancel/resume/fork при адресованном запросе.
   Исключение только session.create: она намеренно создаёт новый ID.
   Несовпадение возвращает `session_identity_mismatch` с expected/observed/harness.
   До этой проверки нельзя посылать cancel или prompt провайдеру.
2. Разделить запуск daemon и создание новой provider Session. Для recovery
   стартовать provider с явно сохранённым ID через поддержанный resume-механизм
   (`Runtime.start(sessionId)`), не выполнять create с последующим переименованием.
   Если процесс уже держит другой ID, не использовать ранний return start().
   Возвратить mismatch; для правильного восстановления нужен отдельный процесс.
3. `withExecutionDaemon` получает целевой sessionId и тип операции. Recovery
   daemon должен подтвердить attach к нему до action. Inspect/cancel не имеют
   права создавать новый продуктивный контекст. Если оригинал не восстановим,
   вернуть явную ошибку, не подменять его новой Session.
4. После каждого targeted ответа runner сравнивает harness/native ID.
   Проверку применить к normal/recovery/reference/Judge/HITL вызовам.
5. `runnerCancel` сначала читает durable execution result. Терминальный failed
   или completed не переписывать в cancelled. При необходимости выполнить только
   cleanup принадлежащего дерева. Повторный cancel должен быть идемпотентным.
6. `storedExecutionResults` должен извлекать failed operation из журнала,
   а не смотреть только успешный result. Приоритет: доказанный execution outcome;
   последующий cleanup не участвует в выборе результата. Одновременно обновить
   `reduceEvents`/`finalizeRunProjection`, чтобы status/report совпадали.
7. Гонку cancel/result разрешать по durable operation ordering: если execution
   outcome уже committed, его не менять; иначе принять исход, подтверждённый
   провайдером для той же операции. Не считать сам cancel_requested доказательством отмены.

### Принадлежность событий и транскриптов

Дополнительные файлы dd-flow-cli: `src/services/hooks.ts`, `sessions.ts`,
`session-identity.ts`, `work-registry.ts`, readers codex_session_bindings.

8. Codex hook один раз вычисляет эффективный native id: agent_id ребёнка при
   наличии, иначе session_id. Binding, transcript/cwd и event receipt относятся
   к этому владельцу. Корневой session_id — отдельный факт родства, не владелец
   child transcript. Проверить всех читателей bindings и импорт usage.
9. Не переписывать старые данные предположениями. Исправить текущую запись и
   разрешение путей; историческую привязку менять только по доказанному владельцу.
10. AGY Stop/transcript/наблюдения хранить по conversation_id в существующем
    состоянии демона. Root receipt читает свой узел. Native execution identity
    отделяет поздний Stop предыдущего хода; неизвестную принадлежность сохранить
    как diagnostic, не применять к текущему ходу.
11. DONE инструмента запуска ребёнка не доказывает completed ребёнка. Использовать
    его собственный native terminal/inspect; при отсутствии подтверждения unknown.
    Проверить аналогичные преобразования во всех адаптерах. Не добавлять Turn table.

### Тесты и готовность

- AGY cancel A при живом B: ошибка, B не получил cancel.
- После рестарта inspect A возвращает A; provider create не вызван.
- Терминальный failure + cleanup: итог failed, cleanup отдельно, original error сохранён.
- Поздний ответ и повтор cancel не создают новый prompt/session и не затирают usage.
- Применить contract cases к Codex/Grok/ZCode/OpenCode на fake providers.
- Codex root → child A → child B → root: bindings/receipt/transcript lookup
  сохраняют правильного владельца, включая последующий импорт usage.
- AGY root/child Stop в разном порядке, поздний Stop, child transcript и
  parent tool DONE при работающем ребёнке не искажают соседние узлы.

## B2. Единое продолжение, settlement и HITL — D01/D06/N05/N06/N07

### Файлы

dd-eval: `lib/runner.mjs` (`reconcileFlow`, `evalRun`, reference loop,
`recoverExecution`, `runServerMerge` callers), `lib/session-settlement.mjs`,
`lib/dd-zcode.mjs`, `lib/dd-zcode-daemon.mjs` и остальные адаптеры.
dd-flow-cli: `src/services/runs.ts`, `src/services/stage-lifecycle.ts`,
`src/domain/stage-catalog.ts`, `src/services/vnext-merge.ts`,
`src/services/merge-server.ts`, `src/cli/run-cli.ts`, затронутые response schemas.
zcode-acp: `src/handlers/session.ts`, `src/backend/listener.ts`.

### Авторитет переходов

1. В ответ `run status` добавить вычисляемый `continuation`, не отдельную
   таблицу переходов и не ещё один сохранённый current_stage:
   `{ kind, stage, attempt, work_id, reason, command }`.
   Поля, неприменимые к действию, null/отсутствуют согласно схеме.
   `kind`: start_stage, continue_stage, wait, paused, blocked, terminal.
2. Проекцию строить из существующего snapshot флоу, RUN stage_runs/next_action,
   активного repair cycle и Work. Не доверять одному свободному next_action,
   если он противоречит фактам. Несовместимое состояние — объяснимая ошибка
   reconciliation, не предположение по массиву стадий.
3. Команду строит тот же CLI command builder, что формирует stage start/finish:
   абсолютный project root, корректный DD_FLOW_HOME, экранирование аргументов.
   Runtime root и project workspace — разные пути.
4. В dd-eval выделить небольшой общий resolver/driver продолжения. Перевести
   normal, recovery, reference и inline/server MERGE на него. `nextStage()`
   оставить только для статического описания выбранного набора, не для исполнения.
5. Для `start_stage/continue_stage` заново материализовать контекст выбранной
   стадии; сохранить выбранный attempt/cycle в событии. Продолжить ту же Session
   при same_session. New_session применяется только согласно RUN-политике.
6. Ключ защиты от повторов включает stage + attempt/cycle + graph/receipt revision.
   Новый repair — прогресс. Один и тот же принятый результат не запускает два
   продолжения. Не ограничивать законный repair фиксированным числом стадий.
7. Для focused/segment результат считается достигшим границы после принятия
   нужной стадии. Если для её принятия нужны разрешённые repair-переходы,
   выполнять их; не завершать focused как успешный по одному return из Turn.
   Если переход выходит за предусмотренную область профиля, сохранить блокер
   с объяснением, не расширять задание молча.

### Native result и settlement

8. ZCode `promptSessionWithBridge` обязан разобрать stopReason. `end_turn`
   означает только окончание хода; `max_turn_requests`, cancelled и provider
   failure сохраняют собственную причину и не считаются обычным success.
9. После stop-related ответа использовать общий bounded settlement observer:
   root и descendants, текущая операция/turn, исходные native IDs.
   При running/unknown нельзя вызывать следующий prompt.
10. `productive`, `requireSettled`, inspect, cancel и stop используют одно
    определение settled. Ошибка guard ДО dispatch не должна оставлять
    active_tree=true, если наблюдение подтвердило idle. При неизвестности
    оставить unknown ownership, не выдумывать idle.
11. В zcode-acp путь NO_PROGRESS_MS не возвращает max_turn_requests как
    замаскированный обычный ответ после неподтверждённого stop. Сначала запрос
    остановки, затем наблюдение terminal/исхода; при неизвестности — error с
    причиной и идентичностью исходного turn. Поздние события не теряются.
12. Не убирать tree_not_settled guard: исправляется противоречие до него.
13. Сохранить существующий semantic HITL matching, строгий hitl-match@1,
    fixture checksums, точные bytes ответа, receipts и max_rounds. При переносе
    циклов не оставить особую обработку вопроса только в reference builder.
    Общий путь сначала подтверждает исход provider operation, затем обрабатывает
    pause/вопрос разрешённым Interaction Judge. Нельзя отправлять ответ вопроса
    в новую продуктивную операцию при ещё не settled исходном ходе.

### Тесты

- MERGE gate failed → source repair → CODE → CODE-REVIEW → replacement MERGE.
  Один и тот же сценарий прогнать через normal, resume, reference, server-route.
- Перезапуск после сохранённого repair next не повторяет merge repair.
- max_turn_requests + root running: ни success, ни новый prompt; ожидание/reconciliation.
- end_turn + idle + Work running: продолжение той же стадии, не автозавершение.
- Неизвестный/запрещённый переход блокируется с контекстом и инструкцией.

### Полнота общего пути: дополнительные обязательства

14. `promptExistingSession` и остальные recovery callers направить через тот
    же provider-turn executor, что normal/reference/Judge. Сохранить проверку
    observed model/reasoning и identity, профильные timeout аргументы и
    ограничения конкурентности обычного пути. Не вкладывать повторный захват
    одной аренды в уже захваченную аренду.
15. Выбор same_session/new_session/merge_server, materialize, вызов и событие
    context_prepared должны проходить одним путём. Recovery не пишет launcher
    без stage/attempt/hashes. Сохранить эти данные на error/finally путях тоже.
16. Grok refreshTree учитывает native root info.status, не только this.active
    и список детей. ZCode productive/inspect/cancel/stop используют ту же
    семантику, что requireSettled. Сначала нормализовать контракт провайдера,
    затем применять общий observer. Неизвестный root нельзя объявлять settled.
17. Общий загрузчик принятого HITL ответа читает bytes, сверяет answer_sha256
    и отправляет именно проверенные bytes. Не допускать гонку «проверили файл,
    затем модель перечитала изменившийся файл» без проверки у потребителя.
    Применить к reference/recovery/повтору resume. Mismatch/missing — ошибка
    целостности с evidence; не менять hash и не запускать semantic Judge заново.
18. Повтор того же принятого ответа не расходует новый semantic round; новый
    вопрос всё ещё проверяется по fixture и max_rounds.

Тесты: recovery profile mismatch; new_session/server после рестарта; одинаковые
context identities normal/recovery; Grok root running после ошибки запроса
при пустом списке детей; HITL файл изменён/удалён/неизменён в обеих ветках.

## B3. Запуск, контекст и сверка дочерних исполнителей — D05/N02/N04

### Файлы

dd-eval: `lib/runner.mjs` (`driveFanout`, `directNativeChildren`,
`nativeChildFanoutPrompt`, `nativeChildWaitPrompt`), forwarding в адаптерах.
dd-flow-cli: `src/services/hooks.ts`, `src/services/sessions.ts`,
`src/services/session-identity.ts`, `src/services/work-registry.ts`,
`src/services/vnext-fanout.ts`.

### Реализация

1. Нативные terminal child observations доставлять через существующие trusted
   harness event handlers, не только через tool_call с dd-flow. Сохранять
   harness/native session ID, parent, native event/operation ID, исход и причину.
   Дедупликация по существующему событийному механизму.
2. Общая функция сверки работает с конкретной work_sessions-связью и попыткой.
   Старое событие прежней попытки не закрывает повторно запущенный Work.
3. Child failed/cancelled при связанном running Work: регистрировать неуспех
   именно этого исполнения, оставляя причину и evidence; зависимости не разблокировать.
   Нельзя закрыть родительский Work, у которого есть активные дети.
4. Child success/end_turn без work finish: Work не завершать. Вернуть
   координатору `execution_ended_without_work_result` с exact resume/retry/fail
   вариантами, выбранными по существующим допустимым состояниям.
   Если остался живой процесс объявленной проверки, ждать его, не принимать
   отсутствие work finish за ошибку модели раньше времени.
5. Для сбоя ДО work start использовать точную launch association, если она
   уже записана (wave Work ID + returned native agent/session ID). Сохранять
   её в существующем launch journal; не создавать сущность Turn.
   Когда запуск делает модель и точной связи нет, не угадывать её по времени,
   названию или порядку массива. Сообщить координатору failed child и список
   ещё не начатых поручений; потребовать установить соответствие перед retry.
6. `stage fanout status` сохранить read-only. Обновление по trusted observation
   выполнять до его вызова, а не прятать запись в status.
7. В `driveFanout` сначала обработать failed/incomplete executions, затем ready
   и running. Один failed не отменяет siblings; разрешённые независимые работы
   могут завершаться. Не генерировать бесконечный wait prompt по одному works.running.
8. Existing Work retry использовать только по явному решению координатора
   и разрешённому исходу. Проверить, что retry обновляет текущую связь/контекст,
   не теряет старые результаты и не создаёт двух running-исполнителей.

### Обязательная инструкция координатору

Перед исполнением графа обеспечить следующий контракт запуска:

9. Уточнить существующий launch_policy: независимому PLAN-REVIEW/CODE-REVIEW
   нужен пустой контекст, не только новый Session id. Проверить прочие назначения
   политики, включая CODE; не плодить дублирующие флаги в Work/RUN/profile.
10. `nativeChildFanoutPrompt` передаёт требование контекста, эффективный профиль
    модели, поддержанный способ нативного запуска и exact work start. Способ
    брать из проверенных возможностей упряжки, не выдумывать общий API инструментов.
11. Уникальность id оставить механической проверкой. Если упряжка подтверждает
    режим контекста — сохранить observation; иначе честно показать предел
    доказательств. Judge оценивает доступный launch/context evidence, а не
    принимает fresh_agent_required за доказательство независимости.
12. Нативного ребёнка запускает координатор-модель: адаптер не создаёт незаметно
    второй набор работников. Внешний dispatch используется только по профилю.

Тесты запуска: обязательные сведения для всех поддержанных профилей; новый id
с унаследованной историей не считается доказанным чистым контекстом; live smoke
проверяет фактический способ запуска. Сохранить короткие Work IDs и wave/dependency
поведение, не усложнять формат результата ревьюера.

Инструкция исполнения графа:

«Ниже состояние конкретных исполнителей. Жди только тех, чья работа ещё
подтверждённо выполняется. Для завершившегося с ошибкой исполнителя прочитай
причину, реши, требуется ли продолжение/повтор/блокер, и используй возвращённую
команду. Не отменяй остальных из-за одного сбоя. Успешный ответ ребёнка не
заменяет принятый work finish. Не создавай новую копию уже выполняемой задачи».

Тесты: child failed до/после start, два ребёнка с разными исходами, duplicate
terminal event, stale event после retry, живой detached check, missing launch
association, depends_on на failed задачу.

## B4. Адресуемые доказательства и восстанавливаемый repair — D04/N08

### Файлы

dd-flow-cli: `src/services/runs.ts` (`archiveExistingStageAttempt`,
`prepareVnextMergeSourceRepairAttempt`), `src/services/code-checks.ts`,
`src/services/vnext-code.ts`, `src/services/work-registry.ts`,
`src/services/vnext-merge.ts`, `src/storage/database.ts`,
общие существующие обработчики `run://` и генераторы отчётов.

### Модель хранения — конкретное решение

1. Сохранить запись агентом в текущую папку стадии и архив try-NNN рядом.
   Не переводить всё хранилище на новый формат директорий.
2. В существующем RUN attempts хранить устойчивую запись каждой попытки:
   stage, attempt, current/archive root и outcome. При открытии нового цикла
   старые записи дополняются, а не заменяются только текущими stage_runs.
3. Новые ссылки между задачами использовать по существующему receipt ID,
   а не копировать failure_receipt_path как авторитет. Абсолютный путь в prompt —
   вычисляемая текущая проекция ID. Для произвольных run artifacts выдавать
   attempt-qualified run:// ссылку; resolver текущей попытки отображает её
   на активную папку, завершённой — на архив. Не добавлять отдельный URI-протокол.
4. После archive обновить location-проекции SQLite: check_receipts paths,
   work_sessions prompt/result paths и прочие найденные сохраняемые location
   поля под переносимым префиксом. Все readers получать путь через общий resolver.
5. Не переписывать bytes исторических result/receipt ради исправления ссылок.
   Reader receipt получает его owner/attempt и возвращает рабочие resolved paths;
   raw receipt остаётся историческим фактом. HTML и новые prompt используют
   resolved projection. Существующие локальные/относительные evidence paths
   разрешать от владельца доказательства, не от cwd процесса.
6. Не делать глобальный replace старого пути во всех JSON. Перенос должен
   затронуть только известные location-поля/записи текущего RUN и попытки.
   Не чинить автоматически старые опубликованные эвалы; если нужна их
   переоценка, использовать явную read-only проекцию архивных адресов.

### Надёжность многосоставной операции

Перед реализацией MERGE repair исправить также стартовые артефакты dd-eval:

- `entryLauncher` не должен использовать общий stage-start-response.json для
  нескольких стадий. Context/launcher/response хранить по stage и attempt,
  используя существующую identity попытки CLI. До первого start сохранить
  стартовый пакет отдельно; после ответа связать с назначенной попыткой,
  не угадывать её номер.
- Пути/hashes включить в context_prepared/boundary/evidence. Следующая стадия
  и repair не перезаписывают прежний ответ. Повтор идемпотентного start не
  меняет сохранённую границу; новое наблюдение хранить отдельно при необходимости.
- B8 сохраняет реальные bytes пакета, а не рассчитывает на provider transcript.
  Тест: PLAN→PLAN-REVIEW→CODE→repair CODE сохраняет все предыдущие ссылки/bytes.

Далее — операция MERGE repair:

7. `repairVnextMerge` сегодня делает abort, fail Work, archive, add repair,
   supersede и release lock последовательно. Использовать существующий
   merge request checkpoint + operation journal для идемпотентного продолжения.
   Записать намерение и target/source identity ДО необратимого шага.
8. Зафиксировать checkpoints: rollback confirmed, prior attempt archived,
   repair registered, replacement pending. Если существующий checkpoint
   покрывает шаг — использовать его, не дублировать.
9. Повтор repair для того же MRG возвращает уже созданный repair Work, а не
   требует action_required и не создаёт второй. После сбоя сначала сверить
   Git/DB/filesystem с намерением. Нельзя повторно откатывать чужие изменения.
10. БД обновлять короткой транзакцией; filesystem move не держать фиктивно
    «атомарным» вместе с SQLite. Журнал + проверка фактов обеспечивает recovery.
    Освобождать merge lane только после устойчивой записи результата передачи.

### Тесты

- После архива новая repair-задача читает receipt/stdout/stderr/completion.
- Перезапуск процесса на каждом checkpoint даёт один архив и один repair.
- Старая attempt-ссылка не разрешается в одноимённый файл новой попытки.
- Hash исходного receipt/result до и после archive одинаков.
- Обычный restart стадии и Work retry проходят ту же проверку ссылок.

## B5. Проверка исправления, среда и объединение gate — D02/D03/D11/N01

### Файлы

dd-flow-cli: `src/services/vnext-code.ts` (`selectRepairChecks`,
`addVnextCodeRepair`), `src/services/work-registry.ts:settle`,
`src/services/code-checks.ts`, `src/services/vnext-code-review.ts`,
`src/services/vnext-merge.ts`, CODE packet/result/plan schemas и validators.
dd-memorybank: `.memory-bank/dd-flow/vnext/plan.md`, `code.md`,
`plan-review.md`, `code-review.md`, `merge.md`, соответствующие testing/verification aspects.

### Repair execution

1. Не менять исходный `run_at` принятой декларации. В repair packet добавить
   `repair.verification_check_refs`: обязательства, которые CLI выполняет
   перед принятием этого repair независимо от их исходного aggregate gate.
   Для --from-check заполнить из причинного receipt; для review repair — из
   принятого decision.check_refs. Не копировать автоматически все проверки.
2. Сохранять IDs, definition/profile identity, required_artifacts и ресурсы.
   Получить execution set как union обычных work checks и repair refs;
   дедуплицировать одним существующим исполнителем проверок.
3. Failed/aborted/in-progress не закрывает repair. Ответ содержит receipt ID,
   resolved logs, статус процесса и точную команду следующего действия.
   После обычного test failure агент исправляет в том же Work и повторяет finish.
4. Если причинная aggregate проверка требует ещё не готовых зависимостей,
   координатор до запуска repair выбирает подходящую уже объявленную фокусную
   проверку и явно фиксирует оставшуюся aggregate обязанность. Нельзя молча
   пропустить repair verification. Если подходящей нет — подготовить её
   агентным решением, а не выдумывать её кодом CLI.
5. Итоговый gate стадии выполняется после repair на актуальном дереве.
   Прошедшая локальная проверка не доказывает достаточность semantic fix:
   это по-прежнему проверяет координатор по решению review и evidence.
6. В prompt дать: «Сначала прочитай причину и логи. Исправь её. Следующий work
   finish запустит перечисленные repair checks. При failed оставайся в этом
   Work. Не запускай проверки вручную, если их сейчас запускает CLI. Форматирование
   делай штатным formatter проекта по нужным файлам; не отключай правила».
   Отдельно перечислить проверки, которые будут выполняться позднее родителем.

### Среда и MERGE

Канонический merge.md, mergePrompt и error responses обновить вместе. Убрать
противоречивый совет исправлять продукт в integration workspace и повторять тот
же MRG. Ясно описать два выхода B0: source repair и восстановление среды проверки.
Пакет должен давать цель, ограничения, evidence paths, точные команды и ожидаемый
исход каждой ветки. Канон объясняет смысл, runtime подставляет команды через
существующий builder. Согласованность смысла проверяет reviewer, не regex-тесты.

7. Добавить в PLAN/CODE/REVIEW инструкции проверить каждый изменённый test
   entrypoint: создаёт ли он БД/seed/services, кто очищает мир, какие env/cwd
   использует приложение и тест, не маскирует ли результат прошлый запуск.
   Использовать существующие context/check declaration поля; не вводить
   обязательную «таблицу всех файлов тестов».
8. Регрессия на маленьком fixture repo: unit entrypoint случайно включает
   DB-test без setup; отдельный contract entrypoint успешен. Gate должен
   сохранить настоящий failure. Prompt review должен требовать проверку этих
   публичных команд на чистом мире. Не добавлять в CLI анализ import/имён тестов.
9. MERGE prompt не требует source repair при ЛЮБОМ failed check. Агент по
   retained evidence выбирает: source defect → existing merge repair;
   environment blocker → stage block в той же MERGE; после восстановления
   среды → unblock и повтор проверки на неизменном интегрированном дереве.
10. Для повторного исполнения failed check без изменения Git добавить явный
    параметр существующего finish: `--retry-check <receipt-id> --reason <text>`.
    Это предложение API, его ещё требуется реализовать. Разрешать только
    failed/aborted завершённый receipt той же попытки, не running и не чужой.
    Сохранить новый receipt и причину; старый не затирать. `unchangedFinalGateFailures`
    не должен требовать фиктивной правки исходников после восстановления среды.
    Этот путь применить в CODE, CODE-REVIEW, MERGE через общий gate runner.
11. Не разблокировать failed проверку просто потому, что модель назвала её
    инфраструктурной. Успех всё равно подтверждается повторным реальным исполнением.

### Дедупликация в одном gate

12. Сгруппировать эффективные проверки текущего invocation по execution identity:
    команда/argv, cwd, профиль/среда, ресурсы, inputs/tree и required artifacts.
    `run_at` — происхождение обязательства, не различие исполнения внутри
    одного MERGE gate. Receipt покрывает все check_refs группы.
13. Не использовать успешный feature receipt для интегрированного target.
    Разные env/cwd/артефакты не объединять. Не вводить общий persistent cache
    результата по одной команде.

### Тесты

- Дважды неверный formatter fix: один Work остаётся running до третьего успеха.
- Repair check выполняется даже при исходном run_at=code/readiness.
- Review check refs не превращаются в запуск всех проверок.
- Восстановление среды без изменения Git: новый receipt, старый failed сохранён.
- Повтор running check запрещён; чужой --retry-check отклонён.
- Один MERGE: quality по двум policy refs выполняется один раз; разные env — два.
- Изменить `test/vnext-code.test.ts`, сохранив тест исходного run_at и добавив
  проверку фактического repair execution set; не просто перевернуть старое ожидание.

## B6. Наблюдение, процессы и запись состояния — D07/D09/N09

### Файлы

dd-eval: `lib/observation-clock.mjs`, `lib/observation-summary.mjs`,
`lib/session-settlement.mjs`, `lib/managed-daemon.mjs`, все адаптеры/daemon,
`lib/runner.mjs:providerTurn` и cleanup/finally.
dd-flow-cli: `src/services/managed-processes.ts`, `src/services/code-checks.ts`,
`src/services/harness-adapter.ts`, `src/services/merge-server.ts`.
zcode-acp: `src/handlers/session.ts` — его собственный watchdog.

1. Один владелец liveness deadline на продуктивную операцию. Короткие transport
   deadlines не должны превращаться в отмену живой модели.
2. Разделить данные наблюдения: новая native последовательность/дельта работы;
   живой transport/heartbeat; unchanged status; observation gap; terminal.
   Повтор одного tool update без изменения payload/state не считается новым
   прогрессом. Не принимать текст синтетического «думает» за работу модели.
3. Использовать ObservationClock в подконтрольных таймерах. Для zcode-acp
   согласовать семантику, не импортировать dd-eval как зависимость мостика.
   Значение status=running не продлевает бесконечно бюджет без наблюдения.
4. После gap сначала обработать накопленные события и прочитать состояние
   исходной операции. Не утверждать sleep ОС без системного доказательства.
5. Закрытый native ZCode watchdog нельзя исправить в нашем JS. Его terminal
   reason сохранить; обработать по B3. Не обещать, что внешний timeout гарантирует
   отсутствие внутренних обрывов. При необходимости допроверить native logs
   и оформить отдельный upstream defect, не выдавать догадку за исправление.
6. При терминальном runner failure записать cleanup outcome и owner остаточных
   ресурсов. Применить уже имеющийся managed-process реестр и stop protocol.
   Не оставлять ownership только в памяти функции finally.
7. При подтверждённом failure и политике завершения дерева запросить stop
   принадлежащих процессов, ждать settlement, эскалировать только после проверки
   PID/start identity. При неизвестном исходе не убивать продуктивную работу;
   оставить recoverable observation и известного владельца.
8. После смерти владельца уборка реестром возможна лишь для подтверждённо его
   дерева. TTL сам по себе не разрешает убить живого чужого владельца.
   Порты/аренды освобождаются после остановки дерева, не по exit shell.
9. Старый PID 40856 из расследования — НЕ готовая команда kill: перед любой
   уборкой заново доказать ownership и отсутствие другой активной задачи.

Тесты: fake clock gap/перевод часов, долгий реальный прогресс, heartbeat-only,
повтор tool update, child activity, late terminal, stale socket, SIGTERM ignored,
PID reuse, живое дерево после выхода лидера, потеря lease, рестарт cleanup owner.
Не использовать реальные десятиминутные ожидания в unit-тестах.

### Последовательная запись состояния демона — N09

Файлы: dd-eval `lib/dd-opencode-daemon.mjs:Runtime.persist/writeJson`;
для сверки паттерна `dd-agy-daemon.mjs`, `dd-codex-daemon.mjs`,
`dd-grok-daemon.mjs`, `dd-zcode-daemon.mjs`.

10. В OpenCode применить существующую promise-очередь сохранения. Снять
    structuredClone после применения patch и до постановки записи в очередь.
    Одна очередь на файл состояния исключает конкурирующие write/rename.
11. Уникальный temp-файл сам по себе не заменяет порядок записи. Не вводить
    persistence framework. В соседних адаптерах проверить захват изменяемого
    this.state по ссылке: queued запись должна сохранять свой снимок, а не
    случайное будущее состояние. Ошибка записи должна оставаться видимой;
    нельзя считать состояние durable после неуспешного write/rename.
12. Проверить конкурентные session.inspect, terminal prompt, cancel и shutdown.
    Разрешённые read-only наблюдения не запрещать глобально ради устранения гонки.
    Не добавлять второй процессный lease guard вместо существующего общего.

Тест: задержать write/rename fake filesystem, совместить inspect и завершение
prompt, затем cancel; проверить отсутствие ENOENT, целый JSON, порядок снимков,
сохранность исходной ошибки при неудаче persist. Проверить restart по последнему
подтверждённому состоянию, а не только ответы API.

## B7. Единицы статистики и границы измерения — D10/N03

### Файлы

dd-eval: `lib/dd-zcode.mjs`, `lib/dd-agy-daemon.mjs`, `lib/dd-grok.mjs`,
прочие usage forwarders и их persisted daemon state.
dd-flow-cli: `src/services/usage.ts`, `src/storage/database.ts`, session usage schemas.

1. Контракт tools snapshots: накопительный счётчик физической Session, не delta
   отдельного prompt. Ключ `(harness,native_session_id)`; source + observed_at сохранять.
2. ZCode накапливает уникальные tool_call IDs с начала данной Session, включая
   повторные prompts. Восстановление продолжает snapshot из durable state/journal,
   не начинает с нуля. Использовать существующий Grok pattern накопления.
3. AGY dedup по native step/tool ID: повтор DONE не увеличивает total, ERROR
   одного инструмента не учитывается дважды. Если provider не даёт устойчивый
   ID, явно частичное измерение; не хешировать произвольный текст как точную identity.
4. Проверять монотонность cumulative counters. Вместо тихого Math.max(0, negative)
   записать несовместимый snapshot как diagnostic и вывести partial/unavailable
   соответствующей метрики. Старые raw snapshots не переписывать.
5. Root/child usage собирать раздельно по объявленному scope. Не суммировать
   tree-inclusive root с теми же children. Неизвестный scope отражать как partial.
6. При work finish брать промежуточный snapshot; окончательную статистику —
   после фактического конца хода/дерева. Завершение Work не финализирует Session,
   которая продолжает следующие работы.
7. Для окон стадий сохранить привязанные boundary snapshots и provenance.
   Если точных снимков на границах нет, не выдавать приблизительную разницу за
   точную stage usage. Итоговые неперекрывающиеся deltas не превышают Session total.
8. Время показывать отдельно: wall duration, наблюдаемые интервалы операций,
   observation gaps. Не называть разницу начального/конечного timestamp временем
   вычисления модели при паузах хоста и ожиданиях.

Тесты: 3 prompts 244/12/1 дают cumulative 244/256/257; повтор ingest не удваивает;
restart продолжает счётчик; старый меньший snapshot диагностируется; одна Session
на несколько стадий; ребёнок заканчивает после work finish; неизвестное usage не 0.

## B8. Результат любого прогона и оценка выполненной части — D12/N08

### Файлы

dd-eval: `lib/runner.mjs` (`captureExecutionCandidate`, `finalizeRunProjection`,
`evalJudge`, `finalJudgePrompt`), существующие candidate/report builders,
`schemas/candidate.v1.schema.json`, `report.v2.schema.json`, judge-result schema,
`cases/sdlc-eval-2026-summer-task-priority/assessment.json` и используемые Judge prompts.
При изменении case manifest брать актуальный путь из него, не создавать параллельную методику.

1. Общий terminal finalizer вызывается для success, failure, cancellation и
   восстановленного результата. Делает evidence bundle даже при отсутствии
   успешного terminal Stage. Сбор не запускает subject и не меняет RUN.
2. Расширить существующий candidate/evidence контракт полями execution outcome,
   reached/accepted stages, failure cause, evidence completeness. Название
   candidate больше не должно семантически означать успешный продукт; release
   eligibility проверять по outcome. Если изменение несовместимо, поднять schema
   id и обновить все producers/validators/readers/fixtures в одном пакете.
3. Включать manifest/profile/engine identity, исходные Session IDs, события,
   artifact refs/hashes, check receipts, промежуточный/финальный usage с полнотой,
   observation gaps и cleanup. Секреты и значения env не копировать.
4. На границах стадий использовать существующие snapshot utilities для
   фактического сохранения изменяемых task artifacts и repo Git state/diff,
   не просто boundary event. У каждого снимка hash и attempt. Node_modules,
   .env и кэши не включать. Не создавать canonical/starting Sessions для этого.
5. Если процесс погиб до terminal finalizer, resume/reconcile собирает bundle
   из уже сохранённых данных без повторного исполнения. Частичные ссылки
   перечислить как missing, не уничтожать всю сборку отчёта первой ошибкой чтения.
6. `evalJudge` больше не отказывается только из-за incomplete_execution.
   Передать Judge достигнутые стадии и фактический исход. Оценить сделанную
   работу, обоснованность вопросов, реакцию на сбои; непрошедшие стадии N/A,
   а не 0 по качеству и не pass. Не сравнивать неполный E2E с полным без оговорки.
7. Не скрывать дефекты инструментария в оценке модели. В отчёте различать
   model behavior, flow/tooling defect, provider/external failure и unknown
   как причины находок, не как новые категории запусков.
8. Сохранять существующие несколько шкал качества/дисциплины/эффективности.
   Отсутствие Final Judge или telemetry явно показать, не подставлять оценки.

Тесты: failure в SPECIFY/CODE/MERGE создаёт читаемый bundle; cleanup failure
сохраняет исходный результат; judge stub получает incomplete + N/A; snapshot
ранней стадии не меняется после repair; повтор finalize не дублирует операции.

Для снимка состояния SQLite использовать штатный consistent backup/snapshot,
а не копировать один db.sqlite при активном WAL. Снимок не включает процессные
аренды как разрешение повторно использовать старые PID/порты. При restore
технические ресурсы выделяются заново штатным механизмом. Сведения о missing
артефакте сохраняются в bundle и не дают тихо считать снимок полным.

## B9. Документация, проверка всего пакета и выпуск

### Обязательные документы

В этом пакете не требуется редактировать исторические аудиты, кроме обратной
ссылки на единый план. Все актуальные правила реализации находятся в 024.
Список ниже дополнительно включает: пустой контекст ревьюеров (B3), ownership
транскриптов (B1), byte-exact HITL replay (B2), attempt-specific стартовые ответы
(B4), согласованный MERGE-контракт (B0/B5) и последовательный persist (B6).

- dd-eval `runbooks/execute-eval.md`: authoritative continuation, same_session
  default, реакция на failed child, запрет повторного prompt при unknown,
  отдельный cleanup, оценка incomplete, ID сессий и использование абсолютных путей.
- `runbooks/create-eval-case.md`: stage boundary snapshots и отсутствие зависимости
  E2E от канонических контекстных пакетов.
- `runbooks/harness-backends.md`: identity/stop reasons/settlement/usage contract,
  native timeout ограничения; совместимость обновлённого runtime после smoke.
- `runbooks/eval-storage.md`: receipts/attempt references, failed bundles и
  безопасное удаление только после проверки владельцев процессов.
- `specs/023-suspend-aware-execution-and-repair-contracts.md` и предыдущий audit:
  добавить ссылку на 024, не менять исторические утверждения о результате.
- dd-memorybank vNext prompts/aspects: B3/B5; ограничения мягкие, продуктовые
  решения агентные. Обновить связанные индексы/compatibility по правилам репо.
- dd-eval критерии PLAN/CODE/REVIEW: качество контекста проверки, чистая среда,
  причинная самопроверка; не вводить testcase-specific автоматические оценки.
- CLI help/start/finish/error responses: новые параметры, exact commands,
  DD_FLOW_HOME, paths, ожидаемое состояние и инструкция после ошибки.

### Команды проверок

Выполнять с cwd соответствующего репозитория, не в checkout исторического эвала.

dd-eval:

```sh
node --test
```

dd-flow-cli:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
node --test scripts/verify-release-build.test.mjs
```

Для strict build предварительно установить каноническую identity согласно
`.memory-bank/spec/operations/git-and-operations.md`; не обходить проверку
build-info фиктивными значениями. В zcode-acp при его изменении:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Memory Bank проверить штатным lint/schema consistency способом, указанным в его
репозитории. Перед любой работой там прочитать применимые AGENTS.md/индексы.

### Минимальный набор сквозных fault-injection тестов

Размещение новых проверок (новые имена файлов — целевые; если эквивалентный
набор уже существует к началу реализации, расширить его вместо дублирования):

| Репозиторий / файл | Проверяемые блоки |
|---|---|
| dd-eval `test/dd-agy.test.mjs`, `test/runner-recovery.test.mjs` | B1 identity, late result, terminal cancel |
| dd-eval `test/runner-flow-continuation.test.mjs` | B2 общие переходы normal/recovery/reference/server |
| dd-eval `test/native-work-reconciliation.test.mjs` | B3 native child и Work, сбой до start |
| dd-eval `test/dd-zcode-daemon.test.mjs`, `test/session-settlement.test.mjs` | B2/B6 stop reasons и фактическое завершение |
| dd-flow-cli `test/run-attempt-evidence.test.ts` | B4 archive, resolver, recovery |
| dd-flow-cli `test/vnext-code.test.ts`, `test/code-checks.test.ts` | B5 repair execution, retry, dedup |
| dd-flow-cli `test/merge-repair-recovery.test.ts` | B2/B4 crash checkpoints, один repair |
| dd-eval `test/observation-clock.test.mjs`, `test/managed-daemon.test.mjs` | B6 время и cleanup |
| dd-flow-cli `test/usage.test.ts`, dd-eval `test/harness-tool-counters.test.mjs` | B7 counters и границы |
| dd-eval `test/runner-terminal-evidence.test.mjs` | B8 failure bundle, snapshot, Judge |
| zcode-acp `tests/prompt-settlement.test.ts` | B2/B6 native stop после timeout |
| dd-flow-cli существующие hook/session tests | B1 Codex root/child transcript ownership |
| dd-eval AGY daemon tests | B1/B3 порядок Stop, execution identity, child outcome |
| dd-eval Grok daemon tests | B2 root running при пустом списке детей |
| dd-eval runner/recovery/HITL tests | B2 profile/policy parity и answer checksum |
| dd-eval native fanout prompt tests | B3 контекст и эффективный профиль запуска |
| dd-eval stage context/evidence tests | B4/B8 неперезаписываемые стартовые пакеты |
| dd-eval OpenCode daemon tests | B6 конкурентный persist и restart |

Не писать assertions на полное строковое совпадение больших prompt. Проверять
обязательные сведения, реальную команду/аргументы и поведение после её вызова.
Не дублировать тесты JSON Schema, если контрактное поведение уже проверено
через public command; отдельный schema test нужен для выявленной формы ошибки.

1. MERGE failed → archive → один repair → review → MERGE accepted, включая restart.
2. Параллельная волна: один child failed до start, один после start, один completed.
   Нет duplicate dispatch, зависимая задача не стартует, успешная не повторяется.
3. Native response max_turn_requests + root running → settlement → recovery;
   ни автоматического success, ни немедленного второго prompt.
4. AGY recovery A, ложный reply B, terminal failure + cancel cleanup.
5. Repair проверка падает несколько раз: один открытый Work и retained receipts.
6. Архив прежней попытки + новые одноимённые артефакты: старые refs читают старые bytes.
7. Crash на каждом MERGE repair checkpoint; проверка lane/Work/result consistency.
8. Один физический Session на несколько стадий, поздний child usage, restart tools counter.
9. Failure bundle и Judge по принятой части после ошибки любой стадии.
10. Root/child события разных сессий и попыток вперемешку; ни transcript,
    ни terminal, ни usage не присваиваются соседу.
11. Новая Session с унаследованной историей не выдаётся за доказанное независимое
    ревью; профиль/launch-context правильно переданы координатору.
12. HITL checksum mismatch прерывает отправку, повтор с прежними bytes не
    расходует новый раунд; normal/reference/recovery одинаковы.
13. Recovery obeys same_session/new_session/server и model/reasoning, сохраняет
    hashes стартовых пакетов; соседние stages/attempts не переписывают их.
14. Конкурентные inspect/prompt terminal/cancel OpenCode дают устойчивый state.

Существовавшие 31 targeted tests из расследования должны остаться зелёными,
но это не замена новым сценариям. Fake providers не называются live smoke.

### Live smoke после разрешения

Для каждой изменённой упряжки: создать сессию, два последовательных prompt,
запустить короткого native ребёнка, получить явный terminal, inspect исходного
ID, восстановить daemon, inspect/продолжение той же Session, затем stop дерева.
Сохранить model/reasoning/runtime version/commit, ID, логи, usage и cleanup receipt.
Не эмулировать provider fault убийством чужих процессов. Негативные случаи
предпочтительно доказать fake providers; штатный cancel живого smoke допустим
только для его собственного явно зарегистрированного дерева.

### Коммиты/релизы в задании на реализацию

1. Содержательные коммиты по завершённым блокам; не коммитить .env, runtime homes,
   журналы с секретами, базы и node_modules. Полезные планы/отчёты коммитятся.
2. Перед выпуском прочитать repo-specific release runbook. CLI:
   `.memory-bank/spec/operations/git-and-operations.md`. Не выбирать новую
   версию по числу beta.15 в этом документе: сверить Git/npm и уже вышедшие релизы.
3. Обновить compatibility/pack/schema consumers и модельные launch profiles.
   Canon source commit должен быть зафиксирован до strict CLI build; порядок
   coupled release определить по действующему runbook, не публиковать пакет
   со ссылкой на отсутствующий обязательный компонент.
4. Для npm брать NPM_ACCESS_TOKEN из предусмотренного repo .env, отображать в
   NODE_AUTH_TOKEN и подключать временный npm userconfig по ранбуку. Токен не
   печатать и не записывать в Git. Readback опубликованного tarball обязателен:
   source commit, canon commit/version, schemas, package version/dist-tag.
5. Изменённый zcode-acp выпустить по его правилам. В dd-eval обновить фактическую
   qualification профиля только после smoke именно опубликованной сборки.
6. Подготовить новые изолированные runtime homes штатным способом, сохранив
   согласованную пару CLI/pack, harness config, profile и resource isolation.
   Не менять pinned engine исторических RUN. Не запускать E2E без команды.

## 4. Финальная приёмка и отчёт исполнителя

Завершение пакета — не «все тесты прошли», а покрытие D01…D12 и N01…N09
согласно единой матрице раздела 3. N06 закрывается общим исправлением D01.
В итоговом отчёте дать таблицу:
`ID | первопричина/класс | изменение и sibling paths | файлы/commit | regression test | live evidence/не выполнялся | остаток`.

Обязательно отдельно подтвердить:

- [ ] Все normal/recovery/reference/server paths используют одно решение о продолжении.
- [ ] Все targeted session operations проверяют identity; cleanup не меняет execution outcome.
- [ ] Нет вечного ожидания подтверждённо failed child; нет ложного failed из-за missing observation.
- [ ] После restart/архива новый repair читает все причинные доказательства.
- [ ] Repair не закрывается без назначенной самопроверки; aggregate gate сохранён.
- [ ] Повтор после восстановления среды не требует фиктивной правки кода.
- [ ] Counters одного вида, неизвестные данные явно отмечены, дети не посчитаны дважды.
- [ ] Incomplete execution имеет пакет доказательств и доступен Judge.
- [ ] Ненужные owned процессы очищены либо остаток явно указан с owner/status.
- [ ] Все изменённые контракты обновлены в schema, prompt, help, readers и тестах.
- [ ] Коммиты/пуши/релизы/readback выполнены, если входили в полномочия задания.
- [ ] Неустановленные native причины не выданы за исправленные.
- [ ] Канон MERGE, runtime prompt и восстановление среды не противоречат друг другу.
- [ ] Transcript/Stop принадлежат своей Session и исполнению, включая поздние события.
- [ ] Новый Session id не выдаётся за доказательство пустого контекста ревьюера.
- [ ] Recovery проверяет тот же профиль и применяет ту же session policy, что normal.
- [ ] Принятый HITL ответ отправляется только с проверенными bytes/hash.
- [ ] Стартовые пакеты прежних stages/attempts не перезаписываются.
- [ ] Concurrent persistence OpenCode и соседних изменённых адаптеров проверена.

Смысловые изменения промптов отдельно пройти на четырёх ситуациях: чистый happy
path; вопрос пользователя и resume; failed child в волне; MERGE failure с
продуктовой и инфраструктурной причиной. Для каждой проверить, что агент знает
цель, доступный контекст, текущий Work, точные команды и допустимый выход.
Это ревью инструкций, не детерминированная оценка качества продукта.

### Итоговый порядок поставки

1. B0: база и контракты; B1–B3: identity, runtime outcomes, продолжение и работники.
2. B4–B6: устойчивые артефакты/repair/checks, наблюдение и хранение состояния.
3. B7–B8: статистика, evidence и Judge; B9: весь набор тестов и ревью инструкций.
4. По заданию реализации — коммиты/пуши/релизы/readback, профильная совместимость
   после разрешённых smoke опубликованной сборки. Без smoke не писать compatible
   как доказанный факт; указывать непроверенную часть.
5. Подготовить новый запуск без изменения исторических RUN. E2E остаётся
   отдельным разрешённым действием, не запускается этим документом автоматически.

При настоящем внешнем блокере остановить только зависимую работу, сохранить
доказательства и объяснить, чего не хватает. Не объявлять весь план выполненным
при непроверенном recovery или потерянном ресурсе.

## 5. Запись о реализации

Пакет реализован в согласованной паре `dd-eval`/`dd-flow-cli`, каноническом
Memory Bank и `zcode-acp`. Основные инварианты подтверждены целевыми
регрессиями: native identity и child transcript, recovery через общий provider
executor, byte-exact HITL resume, attempt-qualified stage response, durable
daemon persistence, cumulative usage, repair verification и неполный
candidate/Judge. Проверки не запускают платные модели: новый live E2E остаётся
следующим отдельным действием и должен зафиксировать любые фактические
отклонения как новые evidence, а не менять этот план задним числом.
