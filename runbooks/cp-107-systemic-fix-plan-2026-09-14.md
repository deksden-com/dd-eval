# cp-107: план системного исправления SQLite/lifecycle

Статус: реализация прошла повторное ревью 2026-09-14; существенные дефекты первого
варианта исправлены. Полное закрытие пакета и готовность нового E2E пока не подтверждены.
Актуальные результаты и оставшиеся требования: [отчёт ревью](cp-107-implementation-review-2026-09-14.md).
Основание: [расследование](cp-107-failure-investigation-2026-09-14.md).
Репозитории: dd-flow-cli и dd-eval. Цель: конкурентные lifecycle-команды исполняются
однозначно; сбой получает машинно проверяемое продолжение или остановку; адаптер агента
не определяет правила восстановления. Новый ZCode E2E выполняется после выпуска исправления.

## 1. Инварианты и границы

- Пишущая транзакция резервирует право записи до первого зависимого чтения.
- Read-only status сохраняет согласованный снимок без захвата writer lock.
- Один semantic attempt имеет одну исполняемую authority; повтор возвращает его исход.
- Повтор продуктивной операции разрешён только при доказанном отсутствии её эффектов.
  Отсутствие Work Session само по себе недостаточно: могли сохраниться hook claim,
  команды продолжения, файлы или другие записи.
- После commit ошибка публикации ответа/проекции не превращает выполненную операцию в
  разрешение исполнить её повторно.
- Потеря наблюдения не доказывает остановку provider. Ошибка execution, состояние cleanup
  и здоровье observer — разные факты; ни один из них не подменяет остальные.
- Неисправность записи вторичного журнала/cleanup не заменяет первопричину. Если надёжное
  сохранение невозможно, результат не считается подтверждённым успехом.
- Runtime выдаёт invocation ID и retry-команду. Модель не восстанавливает authority,
  не пишет runtime DB и не генерирует UUID для lifecycle.
- Ошибка обязательной lifecycle-операции видна контроллеру независимо от текста ответа агента.
- Product check failure, исправимая валидация, безопасный отказ до эффектов и неизвестный
  инфраструктурный исход различаются. Сам по себе Bash exit != 0 не означает падение E2E.
- Исходный flow pack, задача, Memory Bank и критерии оценки сохраняются. Все затронутые
  сгенерированные CLI-инструкции проверить на отсутствие изменения продуктовой семантики.
- Состояние cp-107 остаётся доказательством. Перенос старого E2E на новый engine не входит в фикс.

## 2. Транзакции: исправление общего механизма

Файлы: dd-flow-cli/src/storage/database.ts, writer-contract.ts;
services/lifecycle-invocations.ts, work-registry.ts, runs.ts.

1. Добавить к существующему Database минимальный синхронный механизм writeTransaction.
   Внешний вызов: BEGIN IMMEDIATE, затем callback и COMMIT; вложенный: SAVEPOINT/RELEASE.
   Использовать существующее schema transaction решение как образец, не добавлять библиотеку.
2. Явно отслеживать владение write transaction. Одного isTransaction недостаточно: он
   не отличает read snapshot от writer. Вложенную запись под read snapshot отклонять явно;
   прочитать все внешние caller-пути до миграции. Для raw BEGIN IMMEDIATE определить
   единый способ регистрации владения, не оставлять два расходящихся учёта. Выбранный вариант:
   владение хранится у native connection; все внешние BEGIN IMMEDIATE, из которых достижим
   новый helper/execSchema, переводятся на тот же helper. Не распознавать SQL регулярками
   внутри exec. Неизвестная внешняя транзакция не считается write-owner автоматически.
3. Перевести managedLifecycleCommand, addWorkBatch, withStageSettlement на этот механизм.
   Проверить все вызывающие этапы: specify/protocolize/plan/plan-review/code/code-review/merge,
   stage-pause, run-controller, run-recovery и merge-server.
4. Внести зависимые проверки состояния/выделение ID внутрь той же write transaction.
   Сохранить атомарность выдачи predecessor/successor, hook receipt и привязки Work/Session.
   Отдельно проверить данные, захваченные callback **до** BEGIN: finishVnextPlanReview читает
   parent/children/revision заранее, finishVnextCode/finishVnextCodeReview выполняют checks
   до settlement. Новый BEGIN сам по себе не делает эти ранее прочитанные объекты актуальными.
   Generation/Work/dependency/accepted-input guard проверяется вновь на write boundary;
   тяжёлые checks не запускаются под lock, их receipt проверяется относительно принятого
   immutable input/hash. Существующие generation guards после await сохранить.
5. Аудировать все BEGIN/SAVEPOINT, включая вложенные schema calls, на чтение до записи
   и на длительный I/O под lock. Не переносить provider calls, subprocess waits или await
   в writer transaction. Подготовку файлов выполнять до lock; публикацию связывать с
   существующими durable receipt/intent механизмами. Не выносить механически небольшой
   локальный receipt-intent за lock, если это разрушает существующий commit/recovery контракт.
6. Read-only savepoints оставить: runControlStatus, runtimeBudgetStatus, preparedScopeRun.
   Исправление прежней классификации: controller_ready_status, controller_failure_status,
   controller_spawn_status — **пишущие, write-first**, а не read-only. Как и
   persist_run_state, run_usage, seal_run_status, они начинают с записи;
   менять их только если проверка вызывающих функций выявит фактическую проблему.
7. Сохранить ограниченный busy_timeout. Не добавлять неограниченные повторы или общий mutex
   вокруг всего CLI. Если требуется дополнительный retry, он охватывает лишь целиком
   откатившуюся DB-only транзакцию с новым снимком и общим временным бюджетом.
8. Rollback/release/commit могут сами завершиться ошибкой. Сохранить исходную ошибку,
   вторичные добавить отдельно; после неподтверждённого rollback не переиспользовать connection
   для продуктивных операций. Async callback helper не принимает; случайно возвращённый
   Promise отклоняется, а не коммитится до завершения работы.
9. Сохранить порядок нескольких БД: resource registry → RUN homes в стабильном порядке
   (runtime-scope-control.ts / retainScopeDrain). claimControllerProcess и control worker
   сейчас завершают RUN claim до resource registration: объединять их в обратный порядок нельзя.
   Частичный commit разных БД не объявлять атомарным: оставлять существующий reconciliation.

## 3. Исход lifecycle и безопасное продолжение

Файлы: src/cli/run-cli.ts, shared/errors.ts, storage/database.ts,
services/lifecycle-invocations.ts, work-registry.ts и конкретные границы settlement.

1. Сохранить SQLite primary/extended code, имя операции, фазу и причинную ошибку.
   SQL parameters, stdin и секреты в журнал не писать. Полный стек — в локальный
   диагностический артефакт; CLI получает короткую структурированную ошибку и ссылку.
2. В существующей ledger/receipt модели различить no_effect, committed и unknown.
   Согласовать миграцию с writer contract, если потребуются новые поля. Не выводить
   no_effect только из названия SQLite ошибки или статуса Work.
3. Для доказанного отказа до эффектов выдать единственный successor через существующий
   settleLifecycleRejection/successor механизм. Старый invocation остаётся неизменяемым;
   повтор читает его outcome и ту же retry-команду. Все записи successor и rejection атомарны.
4. Для committed восстановить ответ из сохранённых фактов. Для unknown сохранить
   блокировку/recovery directive; не создавать новую продуктивную попытку автоматически.
5. Исправить многосоставной work start. Фактический порядок startBoundWork: hook claim →
   подготовка packet/команд и tmp files → BEGIN → binding → rename файлов → COMMIT →
   projection/timeline → сохранение CLI outcome. Ранее описанный порядок «commit, потом
   публикация packet» **не соответствует текущему коду**. materializePendingWorkResults
   восстанавливает terminal result, а не start packet: его наличия для старта недостаточно.
   Минимальное расширение: сохранять start receipt с точными packet bytes/hashes, hook identity
   и WorkSession ID в той же DB-транзакции, что binding (в существующей WorkSession записи).
   Публиковать канонические packet-файлы после commit из этого receipt; повторять можно
   публикацию подтверждённых байтов, не сам start. Использовать publishReceiptFile и проверки
   drift; не создавать универсальный filesystem transaction manager. Подготовленные невыданные
   команды не должны оставлять исполняемую authority после rollback старта.
   Hook claim освобождать только после доказанного отката без binding; не выполнять нынешний
   безусловный claimed → observed из catch, если упала проекция уже закоммиченного Work.
   Claim hook, выдачу команд пакета и binding включить в общую короткую write transaction
   во всех стартовых caller-путях; подготовку независимых входных bytes делать заранее.
   Это устраняет сохранённый claim/выданные команды при откате binding. Неподтверждённый commit
   по-прежнему требует сверки, а не объявления no_effect.
6. work ls/newly_ready и rendering не должны рекламировать settled failed start как
   исполняемый ready command. Вернуть successor, если он законно существует, иначе
   явную blocked/recovery директиву. Read-only просмотр не выдаёт новую authority.
7. В общей инструкции продолжения пояснить обработку returned directive и запрет
   самодельных ID. Это дополнение к исполняемому протоколу, не единственная защита.
8. Retry не должен создавать бесконечную цепочку successor. Для временного storage failure:
   одна автоматическая дополнительная попытка после доказанного no_effect, затем recovery.
   Счётчик относится к semantic action/поколению, сохраняется при successor и перезапуске observer.
   Исправимая валидация имеет отдельный контракт: не превращать обычное исправление результата
   моделью в infrastructure failure и не повторять автоматически пользовательский shell.
9. Повтор со старым ID остаётся чтением прежнего исхода. Новый ребёнок не должен запускаться
   лишь потому, что Work всё ещё created: исполнительность определяется outcome/directive
   совместно с зависимостями и текущим поколением. Raw result и исходные промпты не переписываются.
10. Выдача successor сама не обеспечивает продолжение. Довести directive до конкретного
    исполнителя: вернуть в CLI reply и в read-only continuation/Work graph. Сейчас
    lifecycleRetryCommands ограничен stage_finish и вызывается из stage-pause; этого недостаточно
    для failed work start. Шаблоны controller-fanout/external-work-launch должны разрешать
    runtime-issued replacement той же операции, сохраняя запрет самодельного ID/чужого Work.
    Если назначенный ребёнок уже закончил Turn и нет разрешённого продолжения, вернуть явный
    recovery с исходной причиной; не пересоздавать work_launches и не запускать root автоматически.
    Fingerprint продолжения учитывает изменившуюся directive, но не сбрасывает retry budget.
11. readiness проверяется повторно внутри start binding transaction. Симметрично перевести
    mutateWorkDeps и deleteWork на write transaction с проверкой актуального created state,
    зависимостей/ссылок и цикла до изменения. Иначе отложенный UPDATE dependencies может пройти
    уже после старта Work: одно исправление читателя эту гонку не закрывает.

## 4. Контроллер и адаптеры

Файлы: services/run-controller.ts, run-controller-adapter.ts, lifecycle-invocations.ts,
hooks.ts; harness-runtime/lib/dd-*.mjs и их существующие общие utilities.

1. Передавать в контроллер исход обязательной lifecycle-команды из доверенного runtime
   receipt/event, включая root и дочерние Works. Использовать существующий journal/ledger;
   не определять исход по произвольному тексту tool output или финальному ответу модели.
2. Проводить классификацию/выбор retry/block/recovery в общем dd-flow. Адаптер только
   доставляет подтверждённые identity/events и исполняет команды управления своим provider.
3. Проверить все адаптеры, реально подключаемые registry, через общую матрицу:
   root/child identity; ошибка старта до ресурса; обязательная команда до/после commit;
   потерянный ответ; явный fatal outcome; stop/drain. Составить список по registry во время
   реализации, не считать поддержку проверенной лишь по сходству названий файлов.
4. Сохранять causal code при обёртке harness_adapter_failed; не терять его внутри stderr.
5. Conclusive infrastructure failure переводит controller в recovery_required и запускает
   существующий stop/drain/capture путь. Safe retry остаётся управляемым продолжением;
   неисправимый/unknown исход не оставляется на бесконечные попытки родительской модели.
6. Проверить сбой до lifecycle admission, когда invocation ещё не успел сохранить outcome:
   он также должен быть видим через operation/adapter receipt. Не ограничиваться executing rows.
7. Нативная тишина не является ошибкой. При отсутствии доказанного отказа не отменять
   работающих детей и не вводить короткий wall-clock timeout на ревью.
8. Активный session prompt сегодня ожидается до двух часов. Наблюдение обязательных outcomes
   должно жить на протяжении **всего executeController**, не только внутри controllerAdapter:
   native prompt, внешний fan-out, ожидание children/capacity/context и переходы/capture.
   Один последовательный reader в существующем controller, отдельный read-only connection,
   курсор run_controller_events и сверка незавершённых command receipts при старте/reattach.
   Не открывать writable/migrating context каждую секунду. Ни cron, ни ответ модели не входят
   в цепочку доставки fatal error.
9. Fatal outcome сначала закрывает RUN admission через существующий recovery guard,
   затем передаётся существующему stop/drain пути. Одного Promise.race недостаточно:
   проигравший prompt продолжает существовать до подтверждённой native settlement.
   Обработать обе Promise-ветки, снять timers/listeners; повторный сигнал не выдаёт второй stop.
10. Timeout/обрыв/лимит вывода adapter client — исход native операции unknown, если нет
    отдельного подтверждения завершения. Убийство CLI/process group не равно подтверждённой
    остановке удалённой Session или всех детей daemon. Сначала reattach по operation ID;
    никакого нового session prompt/new/fork ради проверки, выполнялось ли предыдущее действие.
11. Общие process-json.mjs есть и в dd-eval/lib, и в dd-flow-cli/src/harness-runtime/lib.
    Исправлять оба использующихся экземпляра. JSON.parse отделить от вызова обязательного
    onProgress/onEvidence: ошибка обработчика не является «обычным не-JSON stderr».
    Promise callback должен быть awaited/упорядочен либо явно запрещён контрактом; final receipt
    не обгоняет обязательную обработку. Для error/close использовать один путь settlement.
12. Runtime failure envelope с ok:false/error не становится успехом от exit 0. Сохранить
    structured cause и в harness-adapter.ts, и в native-hook-command.mjs, и в process-json.
    Это не правило «любой ok:false = infrastructure»: doctor findings, product check result
    и ошибки пользовательских команд классифицируются по своему контракту.
13. Ошибки renewal/recovery/capture/finishManagedProcess видимы отдельно от исходной ошибки.
    Lease uncertainty закрывает новые продуктивные dispatch, но не означает доказанную смерть
    владельца. Уже существующий managed-daemon хранит ошибку heartbeat: не переделывать
    корректные best-effort catch, если причинная ошибка сохранена и admission её учитывает.
14. Внешний fan-out: Promise.allSettled в executeController сейчас сообщает о rejected child
    только после всех соседей; launchExternalWork ждёт prompt до 45 минут и идёт мимо
    controllerAdapter. Передавать conclusive failure в общий controller handler сразу из
    rejected branch/receipt, а allSettled оставлять для join/cleanup. Ошибки продукта не дают
    такого сигнала. В external-work-launch catch не заменять create receipt строкой Error:
    сохранить уже подтверждённую Session и отдельные structured error/effect/operation phase.
15. Перед новым productive dispatch, переходом стадии и terminal acceptance повторно
    проверять обязательные outcomes текущего поколения. Poll — сигнал пробуждения, не
    единственная защита: успешный prompt может прийти раньше следующего tick reader.
    Старый no_effect failure с разрешённым/выполненным successor не должен отменять RUN:
    проверять актуальное разрешение причины по ledger, а не прерывать на любом старом error event.
16. Автоматический fatal и операторский stop сходятся на существующем control intent, но
    причины не смешиваются. В serveRunController ветка control_requested сейчас очищает
    last_error_json: для error-initiated stop сохранять исходную execution failure отдельно
    от управления остановкой. dd-eval не должен принять такой stop за обычную паузу оператора.

## 5. dd-eval: валидность и наблюдаемость

Файлы: lib/runner.mjs, operation-errors.mjs, runner-events.mjs,
observation-summary.mjs и соответствующие тесты.

1. Классифицировать инфраструктурную причину по структурированному outcome/cause через
   wrappers. Исправить текущий пропуск harness_adapter_failed и invocation_unknown;
   проверить все producer/consumer коды, включая storage failure и outcome unknown.
2. Применять stop_run_on_infrastructure_error согласованно при выполнении, восстановлении
   и формировании run_validity. Не оценивать сбой движка как продуктовый результат.
3. Проецировать текущую стадию, последнюю содержательную операцию, её состояние и время,
   число обязательных Works running/completed/blocked и причину блокировки из runtime.
   awaiting_provider не должно маскировать известный failed lifecycle или давать unknown
   для execution с подтверждённой стадией.
4. После recovery/terminal события проекция не может возвращаться к старому running/waiting
   из-за запоздалой доставки. Проверить replay, дубликаты, порядок и повторное чтение журнала.
5. Отчёт оператора должен различать прогресс модели, ожидание ребёнка, retry lifecycle,
   блокировку и recovery. Не добавлять периодический шум при неизменном состоянии.
6. Journal append и observation.json — не одна атомарная операция. После fsync события
   failed projection даёт отдельный observation warning, а не failed productive operation.
   Проверка/пересборка проекции выполняется после dedupe и при startup/reattach; status может
   вычислить актуальное представление read-only, не выдавая новой authority. Проверять sequence,
   scope и конфликт повторного ID до признания события дубликатом.
7. eval-resume-worker сначала сохраняет attempt.json, затем пишет root event. Восстанавливать
   недоставленный terminal/blocked observer event из этого receipt с детерминированным ID.
   failed/dead worker должен быть виден в root status, даже без нового execution event.
   Повторный вызов с тем же request ID восстанавливает наблюдение/публикацию, не разрешение
   повторить failed productive operation. Перед любым restart — проверка ownership и ledger.
8. Не скрывать observer loss бесконечным неизменным awaiting_provider: показать last_successful
   observation, сохранённую причину, состояние reattach и активные IDs. Продолжать bounded
   read-only reattach; после исчерпания окна восстановления — явный observer unhealthy/blocked,
   без ложного утверждения «provider остановлен» и без молчаливого сброса бюджета при restart.
9. Повреждённый журнал, частичная последняя запись, ошибка fsync или несовместимая версия
   схемы — явный диагностический отказ. Не пропускать строки и не обрезать журнал автоматически.
   Если outcome не удаётся надёжно прочитать, не начинать повторную продуктивную операцию.
10. Сохранять execution failure до начала cleanup. Истечение бюджета cleanup означает
    cleanup blocked, а не исчезновение исходного сбоя. Final Judge при инфраструктурном
    падении допустим только по существующей диагностической политике; оценка не становится valid.
11. observeManagedRun сейчас ждёт contextFor/answerFor внутри polling loop. answerFor может
    ждать interaction Judge. Для оперативного статуса оставить один event reader работающим,
    а длинную подготовку ответа/контекста учитывать как одну pending action. Не запускать её
    повторно каждый tick. Перед доставкой готового результата сверять тот же pause/request/
    controller generation и существующий dispatch guard: ответ, пришедший после stop, сохранять
    как evidence, но не доставлять. Ошибка pending action обрабатывается, а не остаётся rejection.

## 6. Проверки, привязанные к дефектам

Один целевой набор после реализации; на опубликованный release — один обязательный full gate.

| Проверка | Что обязана доказать |
| --- | --- |
| Два реальных SQLite connections, конкурентный commit после чтения | Выдача invocation не падает с BUSY_SNAPSHOT; последовательность не создаёт две authority |
| Конкурентное выделение Work IDs | Нет коллизии ID, частичной batch и потерянной зависимости |
| Stage settlement с конкурентным writer | Все связанные DB-изменения commit/rollback вместе; nested call не открывает deferred writer |
| Состояние изменилось между подготовкой/checks и BEGIN | Устаревшие parent/children/input revision не дают принять стадию; checks не переносятся под writer lock |
| Read-only status параллельно writer | Диагностика остаётся read-only и согласованной |
| Fault injection на каждом переходе work start | No-effect/committed/unknown различаются; никакого двойного Work/Session |
| Сбой сохранения ответа после commit | Повтор/recovery восстанавливает исход, не повторяет эффекты |
| Повтор отклонённого invocation | Один сохранённый outcome и один законный successor либо block |
| Граф после failed start | Не запускается новый ребёнок со старой неисполняемой командой |
| Shared adapter contract, root и child | Ошибка обязательной команды доходит до controller и вызывает правильную директиву |
| Wrapper/cause в dd-eval | Инфраструктурный исход помечен invalid и выполняется failure policy |
| Event replay/out-of-order terminal | Статус сохраняет стадию и причину, terminal не откатывается |
| Prompt остаётся pending, ребёнок возвращает fatal outcome | Admission закрывается без ожидания prompt; ровно один controlled stop; sibling не получает новый dispatch |
| Потеря adapter/hook ответа после commit | Reattach того же operation, без второго prompt/Work/claim |
| Progress/evidence callback падает, error и close приходят оба | Нет swallowed error, unhandled rejection или двойного settlement |
| Journal fsync прошёл, projection rename упал | Событие одно; dedupe/startup чинит projection, продуктивная операция не повторяется |
| Observer receipt записан, root event не записан; worker погиб | Root status показывает observer failure; replay доставляет ровно одно событие |
| Fatal + завершение prompt + операторский stop одновременно | Один recovery owner, одинаковое поколение, первопричина сохранена |
| Rollback/cleanup/logging падают поверх исходного сбоя | Primary cause не меняется, вторичные доступны, успех не объявляется |
| Старый failure после разрешённого resume | Новое поколение не отменяется; старый terminal не перезаписывается |
| Повторный storage successor также отклонён | Retry бюджет не сбрасывается; нет бесконечного цикла новых детей |
| Observer timeout при живом provider | Прерывается только observer RPC; статус unknown/unhealthy, не completed/cancelled |
| Оборванный journal и конфликт duplicate payload | Явная ошибка, сохранение evidence, нет автоматического replay продуктивной операции |
| Work start: второй rename/commit/refresh падает | Packet согласован с durable start receipt; post-commit failure не освобождает использованный hook |
| Ready прочитан, затем параллельно меняются deps/стартует Work | Не стартует Work с неподтверждёнными deps; запоздалый deps UPDATE не меняет running Work |
| Внешний child A упал, child B остаётся pending | Ошибка видна до завершения allSettled; stop запускается один раз, B корректно drain-ится |
| Prompt завершился перед очередным monitor tick | Следующая стадия/terminal не проходит мимо unresolved mandatory failure |
| Safe successor сохранён, старый failure доставлен позднее | Нет ложной отмены после разрешённого восстановления; directive доходит назначенному исполнителю |
| Error-initiated stop попал в control_requested | dd-eval получает исходную execution failure, а не managed_run_controlled без причины |
| Interaction Judge ещё работает, RUN получил stop | Статус обновляется; поздний answer не доставляется, второй Judge не запускается |

Использовать существующие тестовые fixtures и helpers. Нужны детерминированные барьеры
конкурентности, не вероятность попадания в race и не долгие sleep. Нативные живые прогоны
всех harnesses не делать условием этого фикса: общие contract tests плюс новый ZCode E2E.

## 7. Порядок поставки и критерии готовности

1. Транзакционный primitive и три подтверждённых опасных пути, с regression tests.
2. Сохранение исхода, законное продолжение и корректный ready graph.
3. Общий сигнал controller и сохранение причин в адаптерах.
4. Классификация dd-eval, наблюдаемость и replay tests.
5. Ревью всех мест BEGIN/SAVEPOINT и всех adapter registry entries; зафиксировать таблицу
   «исправлено / безопасно с обоснованием / отдельный подтверждённый дефект». Каждый новый
   существенный дефект этого класса включать в пакет до объявления готовности.
6. Обновить execute-eval/interrupted-recovery: retained error не означает живой lock;
   не генерировать invocation ID; следовать runtime directive; сохранять cause/receipt;
   после изменения engine создавать новый checkpoint с точным checksum.
7. Подготовить release commit, выполнить один полный release gate, опубликовать и проверить
   изолированный consumer. Известную проблему global consumer с общим DD_FLOW_HOME учесть
   в механике проверки: временный home, без чтения активных пользовательских RUN.
8. Новый checkpoint: прежняя задача/flow pack/Memory Bank/оценка, новый engine checksum
   и версия dd-eval в manifest. Выполнить non-generative doctor фактического пакета и запустить
   новый ZCode E2E с его единственным штатным baseline **отдельным шагом после подготовки**.
   На текущем запросе выполняются исследование и доработка плана, не реализация и не запуск.

Готовность: targeted checks проходят; нет неизвестного исхода, рекламируемого как ready;
каждый обязательный lifecycle failure имеет retry/block/recovery путь; инфраструктурная
ошибка правильно классифицируется; повтор не дублирует эффекты. Успех нового E2E подтверждает
живую связку, но не заменяет конкурентные и failure-injection регрессии.

## 8. Дополнения повторного исследования: доказательства и ограничения

| Место | Что найдено | Что включено в фикс |
| --- | --- | --- |
| controllerAdapter → runHarnessAdapter | Ожидание prompt до 2 часов без общей параллельной проверки исходов команд | Наблюдение lifecycle внутри активного prompt, fencing и controlled drain |
| managedInvocationContext | Invocation scope выдаётся только zcode-acp | Общий outcome не привязывать к наличию ZCode invocation ID; см. §9 |
| run-cli / controllerAdapter / serveRunController | Потеря SQLite details; ошибки persistence и cleanup могут скрыть primary error | Единая причинная запись, effect certainty, secondary errors |
| process-json в обоих репозиториях | Один catch вокруг JSON.parse и onProgress | Разделение parsing и обязательной обработки, порядок и обработка отказа |
| harness-adapter / native-hook-command / operation-errors | Wrapper теряет cause; timeout-коды расходятся с observation-loss classifier | Общие смысловые категории на границе и contract tests по реальным producers |
| runner-events / appendEvent | После fsync ошибка projection; dedupe не пересобирает observation | Журнал — факт; проекция восстанавливаемая; отдельный diagnostic outcome |
| eval-resume-worker / publish | Attempt receipt и root event публикуются раздельно; generic failed остаётся локальным | Reconciliation terminal observer receipt → root event/status |
| runtime-scope-control / claimControllerProcess / control worker | Уже есть правильный порядок registry → RUN и раздельный claim/registration | Сохранить его; инверсия в этих проверенных claim-путях не установлена |

Локальные эксперименты 2026-09-14, без provider и без изменения RUN:

- Реальный appendEvent: под observation.json создана конфликтующая пустая директория
  в disposable home. Получен EISDIR; journal содержит 1 событие. После устранения препятствия
  повтор того же ID возвращает событие, но observation.json всё ещё отсутствует.
- Реальный commandJson: дочерний процесс отдаёт валидный progress JSON; onProgress бросает
  probe_observer_failed. Callback вызван, однако commandJson возвращает `{ok:true}`.
- Реальный commandJson возвращает `{ok:false,error:{code:...}}` как обычный result при exit 0.
  Это демонстрация текущего envelope-контракта; значимость зависит от consumer. Поэтому
  исправляется именно runtime failure envelope, а не любой отрицательный продуктовый результат.
- Скрипт экспериментов: `/tmp/cp107-plan-probes.hvpOfg/probe.mjs`;
  fixture журнала: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/cp107-projection-probe-2l0k0l`.

Эти эксперименты подтверждают дополнительные дефекты/риски обработчиков, но **не доказывают**,
что именно они произошли в cp-107. Точная первоначальная SQL-команда cp-107 по-прежнему
не восстановлена: extended error и стек тогда не сохранялись. Сценарии ниже — проектный
мысленный прогон будущего исправления, а не заявление о прохождении нового E2E.

## 9. Общий контракт исхода: без нового оркестратора

### 9.1. Источник и корреляция

dd-flow владеет lifecycle, состоянием Works/стадий, native admission и recovery.
dd-eval наблюдает этот контракт, применяет fixture/failure policy и оценивает валидность.
Адаптер подтверждает нативную identity и выполняет provider-specific inspect/cancel/stop.
Ни dd-eval, ни модель не чинят напрямую RUN DB и не выдают invocation ID.

Использовать существующий trusted hook receipt как общий anchor обязательной CLI-команды:

- ZCode сохраняет свой invocation ledger; его outcome остаётся authority попытки.
- Для остальных harnesses исход привязывается к уже подтверждённому hook event, а не к
  новому модельному аргументу. В hook receipt добавить минимальное поле outcome_json, если
  эквивалентного пригодного поля нет; исходная native identity/command fingerprint неизменяемы.
- Общий settlement helper сохраняет исход и notification в run_controller_events в одной
  RUN write transaction. Notification — проекция исхода, не независимая команда/authority.
  У notification стабильный source key и защита от повторной публикации; cursor продвигается
  после подтверждённого сохранения downstream event, а не до него.
- В payload нужны run/controller/generation, Work (если уже известен), native session/tool
  event, invocation ID (если есть), semantic operation, category, effect, disposition,
  error/cause и ссылка на локальную диагностику. Не доверять совпадению текста команды без
  подтверждённой identity и не использовать название harness как источник классификации.
- Если CLI упал до создания context/admission, результат сохраняет существующий managed
  adapter/daemon operation journal с доказанной связью с этим вызовом. Controller должен
  наблюдать этот канал и во время prompt. Такой diagnostic receipt не даёт права повторить
  неизвестную операцию. Если ни один канал записи недоступен, это observer/storage unhealthy,
  не no_effect и не успех; исходная ошибка также выводится в уже открытый локальный stderr.

Не расширять ZCode invocation-протокол на все CLI ради telemetry. Не создавать второй
универсальный operation ledger, event broker или стороннюю очередь.

### 9.2. Решение по исходу

Категория ошибки и наличие эффектов — независимые признаки:

| Подтверждённый факт | Действие runtime | Что делает eval |
| --- | --- | --- |
| Успех с сохранённым receipt | Возвращает тот же результат при повторе | Продолжает наблюдение текущей стадии |
| Исправимая валидация, no_effect | Возвращает разрешённую коррекцию/следующий invocation | Не записывает infrastructure failure |
| Временный storage отказ, доказанный no_effect | Один сохранённый successor в пределах retry бюджета | Показывает retry; не дублирует native prompt |
| Эффекты committed, потерян ответ/проекция | Материализует сохранённый результат, чинит проекции | Reattach, без повторного исполнения |
| Эффекты unknown / потерян transport | Закрывает новую конфликтующую admission, сверяет retained operation | Показывает observation loss; не выдумывает terminal исход |
| Неисправимая обязательная infrastructure failure | Фиксирует failure, fencing → controlled drain | Применяет failure policy; execution invalid, cleanup отдельно |
| Упал тест продукта / отклонён результат review | Штатное продолжение/repair в рамках flow | Продуктовый результат, а не отказ упряжки |
| Нет доказанной native identity или совместимого события | Не допускает действие; явная infrastructure причина | Не начинает/не считает валидным неподдержанный запуск |

Никакой эвристики «Bash упал → остановить весь eval». Help, read-only команды,
обычные команды разработки и штатные review rejects не являются обязательным lifecycle failure.
Не подавлять failure, если модель позже написала «всё успешно».

## 10. Результаты выполненного мысленного прогона

Прогон выполнен по веткам существующего кода с подстановкой предложенных изменений.
Ниже — выводы и найденные контрпримеры, **не задание провести трассировку в будущем**.
Это статическая проверка последовательностей, не запуск нового кода и не доказательство
отсутствия всех возможных interleavings. Обозначения: G — поколение RUN, I0/I1 — исходная
и разрешённая следующая попытки, H — подтверждённый hook, WS — WorkSession.

1. **Launch → controller owner.** В recordOperation/observeManagedRun запуск имеет сохранённый
   request/operation ID; claimControllerProcess коммитит RUN claim до resource registration.
   Подстановка write helper не требует объединять эти БД. Вывод: оставить существующее
   восстановление ownership, не вводить новый launch при перезапуске reader. Нового разрыва
   в этой проверенной последовательности не установлено; legacy raw transaction owners
   должны перейти вместе с достижимыми nested helpers, иначе новый helper отвергнет законную запись.
2. **Выдача I0 → конкурентный writer.** managedLifecycleCommand читает previous attempt внутри
   outer SAVEPOINT. Если второй writer коммитит после SELECT, исходный код получает stale snapshot.
   После переноса BEGIN IMMEDIATE перед SELECT второй writer не может вклиниться в это окно.
   Вывод: предложенный primitive закрывает именно этот воспроизведённый механизм; он не
   исправляет уже захваченные до BEGIN объекты и не разрешает повтор целой CLI-команды.
3. **Work ready → изменение зависимости → binding.** assertWorkLaunchReady читает состояние
   до startBoundWork; binding проверяет created state, но не повторяет весь readiness predicate.
   Более того, mutateWorkDeps делает UPDATE после отдельного чтения created. Контрпример:
   старый deps writer может изменить зависимости уже после успешного старта Work.
   Вывод: исправить обе стороны — readiness в start transaction и guard/cycle check в
   mutation transaction (§3.11), а не только добавить BEGIN к одному читателю.
4. **I0 admitted → H claimed → packet → WS.** В startBoundWork два rename находятся ДО COMMIT.
   Отказ второго rename оставляет первый файл; rollback SQLite его не откатывает.
   materializePendingWorkResults выбирает terminal Works и не восстанавливает start packet.
   Вывод: прежняя фраза «существующих intents достаточно» неверна. Уточнён start receipt в WS:
   claim/выдача команд/binding/bytes-or-hashes коммитятся вместе, packet публикуется из receipt.
   DB rollback означает отсутствие binding; оставшийся staging file не является authority.
5. **WS committed → refresh падает.** startBoundWork вызывает projection после COMMIT;
   внешний startWork catch всё равно возвращает H из claimed в observed. Контрпример:
   уже использованное разрешение становится повторно доступным из-за вторичной ошибки.
   Вывод: cleanup должен знать фазу; после committed WS сохраняются H и исход старта,
   восстанавливается ответ/проекция. Ровно это уточнение добавлено в §3.5.
6. **I0 no_effect → I1 выдан → ребёнок продолжает.** Одной записи I1 недостаточно:
   lifecycleRetryCommands сейчас обслуживает stage_finish при stage resume, а external launch
   instructs «не запускать эту команду больше одного раза». Если reply I0 потерян или ребёнок
   закончил Turn, прежний план не называл исполняемый путь к I1. Вывод: directive должна
   попасть в CLI reply и read-only continuation; живой назначенный исполнитель использует
   её без самодельной authority. Без разрешённого продолжения — recovery, не новый root (§3.10).
7. **Ошибка во время native prompt.** Controller ждёт adapter reply, хотя I0 уже settled failed.
   Предложенный независимый reader закрывает это окно. Но reader обязан читать trusted outcome,
   а не каждый shell nonzero; иначе штатный review reject станет аварией. Для не-ZCode
   нужен hook-based outcome (§9), поскольку invocation scope у них сейчас отсутствует.
8. **Внешний fan-out: A rejected, B pending.** Здесь executeController ждёт allSettled, а
   launchExternalWork вызывает runHarnessAdapter напрямую, с prompt timeout 45 минут.
   Reader только внутри controllerAdapter этот путь НЕ покрывает. Вывод: один monitor
   охватывает весь executeController, rejected branch сразу сохраняет/сигналит conclusive
   failure; allSettled остаётся сбором исходов после запуска controlled drain (§4.14).
9. **Prompt fulfilled → следующий этап до tick.** Между успешным adapter reply и очередным
   опросом может уже существовать обязательный failure. Одного интервала в 1 секунду недостаточно.
   Вывод: перед dispatch/advance/terminal проверяется актуальный ledger. Обратный контрпример:
   поздний I0 error после разрешённого успешного I1 не должен прерывать RUN. Решение опирается
   на неразрешённую причину и текущую attempt/generation, не на факт наличия старого error (§4.15).
10. **Stage validation/checks → settlement.** finishVnextPlanReview захватывает parent/children
    до helper; CODE/CODE-REVIEW проводят async checks до helper. Замена SAVEPOINT на IMMEDIATE
    не обновляет эти значения. Вывод: повторная проверка изменяемой authority/зависимостей и
    актуальности evidence на write boundary; существующие generation guards сохраняются.
    Долгие checks не перемещаются под DB lock. Нормальные product failures остаются repair.
11. **Fatal → recovery guard → catch controller.** Если новый handler создаёт control intent,
    serveRunController может попасть в control_requested и очистить last_error_json.
    observeManagedRun затем трактует этот статус как managed_run_controlled — паузу оператора.
    Вывод: без отдельного causal execution failure предлагаемая остановка сама замаскирует
    аварию. Исправлены контракт cause и consumer этого состояния; cleanup не заменяет failure (§4.16).
12. **Cancel requested → native ещё работает.** Existing requestRunControl сохраняет intent
    до запуска control worker; confirmStopped проверяет не только reply, но и tree/identity.
    Это пригодный механизм, новый stop service не нужен. Вывод: сохранить физическое доказательство
    остановки, отделить failed execution от pending/blocked cleanup; не ждать конца всего
    productive Promise.allSettled, прежде чем вообще запросить drain.
13. **HITL/context → долгий callback → stop.** observeManagedRun ждёт answerFor/contextFor
    внутри того же status loop; answerFor может ждать interaction Judge. Контрпример к обещанным
    10 секундам: flow уже остановился, а eval ещё ждёт Judge и не читает status.
    Вывод: одна pending action и продолжающийся reader; по завершении action повторно проверяется
    pause/request/generation. Поздний ответ не возобновляет остановленный RUN (§5.11).
14. **Journal fsync → projection error → duplicate.** Реальный probe из §8 уже показал:
    событие сохранено, duplicate не чинит observation. Мысленная подстановка восстановления
    на dedupe/startup устраняет зависимость от будущего события. Вывод: event commit не
    отменяется из-за display failure; cursor обновляется после durable downstream append.
    Конфликт payload по тому же ID не считается успешной доставкой.
15. **Observer receipt saved → worker crash → reattach.** В publish attempt.json записывается
    раньше root event. При сохранённом recovery_blocked worker может сразу завершить следующий
    вход, так и не доставив root event. Вывод: reconciliation receipt → root event выполняется
    ДО early terminal return; запускать продуктивный action для этого не нужно. Observer failure
    становится отдельным видимым фактом, не доказательством остановки provider.
16. **MERGE effect → DB/reply failure → окончание EVAL.** applyVnextMerge/finishVnextMerge
    выполняют Git effects за пределами DB; новый helper не делает их откатываемыми. Повтор
    допускается только как чтение/сверка существующего request checkpoint и Git evidence.
    observeManagedExecution уже проверяет terminal stage и capture checksum: эти проверки
    остаются, к ним добавляется отсутствие unresolved mandatory failure. Вывод: успех модели,
    готовый snapshot или diagnostic Judge по отдельности не закрывают инфраструктурный сбой.

Итог прогона: первоначальная версия пакета была недостаточна. Контрпримеры 3–6, 8–9, 11,
13 и 15 потребовали уточнить механизм, а не просто расширить будущую тестовую матрицу.
После этих уточнений для рассмотренных переходов определены продолжение, восстановление
сохранённого результата либо явный failed/blocked исход. Динамическое подтверждение остаётся
за реализацией и регрессиями; оно не подменяется этим мысленным прогоном.

### 10.1. Выводы по каждой содержательной стадии

Источник маршрута — `dd-flow-cli/src/domain/stage-catalog.ts`, реализация — соответствующий
`src/services/vnext-*.ts` и общий controller. Таблица фиксирует, какой переход был рассмотрен
и какое условие потребовалось сохранить/исправить; это не перечень ещё не выполненной трассировки.

| Стадия | Рассмотренный нормальный переход | Вывод из разбора отказа/перехода |
| --- | --- | --- |
| SPECIFY | Accepted result и Work binding ведут к PROTOCOLIZE; вопросы проходят существующий pause/fixture | Ошибка submit/finish после записи результата не повторяет ответ пользователя и не открывает второй Work |
| PROTOCOLIZE | Принятые входы превращаются в protocol artifacts; сохранённый stage outcome выдаёт PLAN | Частичные файлы не считаются no_effect без проверки intents; одна опубликованная команда перехода |
| PLAN | Валидируются plan/aspect map, формируется CODE batch, accepted PLAN ведёт к review по действующей политике | withStageSettlement резервирует запись до зависимого чтения; ошибка выдачи next command не теряет уже принятый PLAN |
| PLAN-REVIEW | addWorkBatch создаёт граф reviewer Works; независимые дети дают evidence, coordinator применяет предусмотренную коррекцию | Failed mandatory work start не рекламируется как ready и виден во время prompt; worker_jobs_incomplete/needs_changes не приравниваются к падению infrastructure |
| CODE | Граф готовых Works исполняется по зависимостям; автономные checks и repair определяют accepted CODE | После async checks повторно проверяются generation и актуальность receipt; failed project test идёт в repair, storage failure — в инфраструктурную ветку |
| CODE-REVIEW | Reviewers и необходимые repairs завершаются, итоговый gate подтверждает результат; подготавливается MERGE request, если маршрут этого требует | Заранее захваченные Work/check данные проверяются на settlement; ошибка сохранения report не разрешает повторно выполнять repairs/checks с уже принятым receipt |
| MERGE | Используются существующие request/lane/baseline/apply/gate/commit/delivery receipts | SQLite ошибка после git merge/commit не означает отсутствия эффектов. Продолжение только по сохранённому checkpoint и проверенному Git state, без слепого повторного apply/commit |
| Завершение EVAL | Flow terminal, capture/result, обязательный cleanup и Judge policy дают конечный отчёт | Product verdict, run validity, observer health и cleanup state не подменяют друг друга; не объявлять успех только по завершению adapter subprocess |

Сохраняются законные skip/off/stop-target ветки stage catalog и execution profile. Новый monitor
не должен принудительно добавлять review, MERGE или проверки к маршруту, который их не требует.
Внешние и нативные дети используют тот же outcome-контракт; способ fan-out не меняет критерий
готовности обязательного Work.

## 11. Оперативность, сайд-эффекты и границы гарантий

- **Реакция, а не таймаут модели.** Проектная цель при исправном локальном storage: последовательный
  poll lifecycle раз в 1 секунду, обнаружение durable fatal ≤5 секунд, отражение в root observation
  ≤10 секунд. Это критерии тестов будущего исправления, не измерения текущего кода. При превышении
  собственного RPC/наблюдательного бюджета показывается observer unhealthy. Длительность stop
  определяется подтверждениями provider и существующим recovery budget, а не обещанием «убить за 5 секунд».
- **Нет гарантии записи на сломанный диск.** Disk full/EIO/недоступный journal не маскируются.
  На доступном канале сохраняются primary/secondary diagnostics; без durable evidence нет нового
  productive retry. Если недоступны все каналы, клиент получает явный отказ, а не вымышленный receipt.
- **Совокупный бюджет ожиданий.** Сейчас busy_timeout=4s, native hook timeout=15s. Не складывать
  полные schema/DB/retry ожидания так, чтобы CLI регулярно убивался до публикации ответа.
  Протянуть один deadline доступного hook/операционного бюджета через DB waits; successor — отдельный
  разрешённый вызов, не скрытая бесконечная петля внутри hook. Длинная продуктивная работа не получает
  короткого диагностического deadline. На read-only polling использовать существующие bounded RPC helpers.
- **Цена write reservation.** BEGIN IMMEDIATE несколько раньше сериализует writers. Транзакции
  короткие; никаких provider waits и синхронного ожидания другого процесса. Проверить три опасных
  пути и достижимые внешние owners, а не переписывать каждый read-only SAVEPOINT ради единообразия.
- **Цена наблюдения.** Один reader на controller, нет параллельных накопленных polls. Читать
  новые события по cursor/индексу, делать небольшую сверку outstanding receipts при reattach;
  не сканировать весь transcript/journal на каждый token и не писать heartbeat в root event каждую секунду.
- **Старые/дублирующиеся события.** Проверять scope, generation, immutable payload hash.
  Terminal монотонен внутри одной semantic attempt/generation, не поперёк разрешённого recovery.
  Непредвиденный источник/конфликт — диагностика, а не игнорирование или применение к текущей Session.
- **Одинаковая логика разных adapters.** Contract matrix перечисляет `codex-desktop`, `zcode-acp`,
  `grok-acp`, `droid-cli`, `antigravity-cli`, `opencode-server`. Luna — модель в профиле, не седьмой
  adapter. Для каждого проверить root/child boundary и pre-admission error; неподдерживаемая native
  capability должна быть честно отклонена preflight, не прикрыта общим «все adapters поддержаны».
- **Параллельные executions.** Fatal закрывает соответствующий RUN; dd-eval дополнительно
  применяет stop_run_on_infrastructure_error к EVAL scope. Другие эксперименты/чужие процессы
  не затрагиваются. Внутри остановленного scope сохранённые успехи остаются evidence.
- **Совместимость и сравнимость.** Изменение runtime schema требует версии writer contract
  по существующим правилам. Не расширять разрешения старого engine на новый store. Сравнивать
  результаты по task/checkpoint semantics и flow/MB, фиксируя engine/eval pins отдельно;
  runtime prompt diff проверяется, поскольку CLI тоже формирует инструкции.

## 12. Как подтвердить готовность без лишних прогонов

1. Пополнить существующие storage/lifecycle/controller, process-json, runner-events,
   console-observation и managed-flow-client тесты сценариями §6. Не создавать новый test framework.
2. Для concurrency использовать два реальных SQLite connections/процесса и детерминированные
   барьеры. Не ждать освобождения writer из того же заблокированного event loop.
3. Для event latency использовать fake clock и adapter stub с незавершающимся prompt;
   отдельно короткий subprocess тест CLI → outcome → controller → eval projection. Запуск
   LLM не нужен для доказательства доставки fatal во время await.
4. Проверить общий happy path и четыре отличающиеся ветки: safe retry, committed reply loss,
   unknown native outcome, conclusive fatal + cleanup. Включить race с operator stop и late events.
5. Не запускать полный gate после каждой локальной правки; один targeted набор на пакет и
   один обязательный release gate на release commit. Изолированная проверка опубликованного
   пакета/doctor — без новых генеративных сценариев. Полная живая квалификация шести harnesses
   не является условием готовности ближайшего ZCode E2E.
6. В implementation report дать coverage таблицу по §8–11: исправлено и тест; безопасно и
   обоснование; неподдерживаемая capability и preflight. Не объявлять «всё исправлено» по одному
   успешному E2E.

## 13. Реализация пакета — 2026-09-14

Завершающая реализация и сопоставление с требованиями: [cp-108](cp-108-implementation-and-readiness-2026-09-14.md).

Ниже сохранён первоначальный отчёт реализации. **Повторное ревью признало его вывод
о полноте преждевременным; таблица не является актуальным подтверждением готовности.**
В частности, повторный `work show` теперь не выполняет восстановление файлов,
`Promise.all` заменён обратно на join с немедленным запросом control при ошибке,
а владение транзакцией больше не выводится из одного `isTransaction`.
Актуальное состояние — в отдельном отчёте ревью по ссылке в начале плана.

| Область | Системное изменение | Регрессия |
| --- | --- | --- |
| SQLite read→write | В общем `Database` появился синхронный `writeTransaction`: новый верхний уровень начинает `BEGIN IMMEDIATE`, а существующий уже захваченный composite transaction получает вложенный savepoint. `managedLifecycleCommand`, `addWorkBatch`, `withStageSettlement`, изменение/удаление зависимостей и финальная проверка запуска Work используют этот путь. | `writer-contract.test.ts`: две реальные SQLite connection воспроизводят deferred-snapshot failure и доказывают безопасный путь. Существующие lifecycle/stage tests проходят. |
| Start Work | До коммита сохраняются точные bytes prompt/context и hashes в `work_sessions.start_receipt_json`; после него файлы публикуются из receipt. Повтор `work start`/`work show` восстанавливает missing projection, не делает claimed hook повторно доступным после committed start. Внутри транзакции ещё раз проверяются generation, current Work status и dependency readiness. | `vnext-protocolize.test.ts` покрывает реальный PLAN→CODE coordinator start; targeted Work/lifecycle suite проходит. |
| Controller/adapter | Adapter принимает abort signal, сохраняет структурированную первичную причину из stderr. Controller наблюдает retained lifecycle outcome во время долгого native prompt и немедленно закрывает его при conclusive error. External fan-out перестал ждать все children после первого reject; automatic control не очищает causal `last_error_json`. | `harness-adapter.test.ts` покрывает abort; `run-controller.test.ts` targeted suite проходит. |
| JSON transport | И `dd-eval`, и bundled `dd-flow` transport не скрывают ошибку progress callback и не принимают exit-0 `{ok:false}` как успех. | `dd-eval/test/process-json.test.mjs`. |
| EVAL observation | Deduplicated append заново строит `observation.json` из fsync journal. Resume worker проецирует terminal recovery failure, но не превращает обычную локальную admission failure в результат всего EVAL. Долгая подготовка context/HITL теперь прерывается свежим controller fence и не отправляется после stop/recovery. | `console-observation.test.mjs`, `managed-flow-client.test.mjs`, `e2e-reliability.test.mjs`. |
| Infrastructure semantics | `dd-eval` относит adapter failure/timeout/output limit, unissued/unknown lifecycle authority и progress delivery failure к infrastructure failure, поэтому уже существующая stop policy применяется и к этому классу. | targeted runner/managed suites проходят. |

Не выполнены живые E2E в рамках реализации: это следующий отдельный этап по cp-107 readiness,
а не доказательство локальных инвариантов. Перед ним нужен один release gate на release commit,
а не повторный полный gate после каждой из перечисленных узких правок.
