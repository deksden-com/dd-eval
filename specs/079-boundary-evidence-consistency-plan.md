# 079. Полезные гарантии вместо неизменности живого runtime

Статус: реализация исходников выполнена; выпуск нового engine и живая приёмка — отдельные gates после интеграции. Новые EVAL не запускались.
Дата: 2026-10-11.

## Цель и границы

Завершение Stage и публикация результата не должны требовать тишины во всём runtime. Требуем согласованность конкретного RUN/Stage/attempt и выбранных продуктовых входов, отсутствие новых продуктивных операций за удерживаемым fence, целостность опубликованных доказательств. Неизменность сама по себе не доказывает качество результата, отсутствие ABA-изменений или корректность модели.

Работа относится к dd-flow-cli и dd-eval. Продукт EVAL вручную не исправляем. Исторические EVAL, receipts и snapshots не переписываем. Основой реализации выбираем актуальный remote main после проверки правил проекта; расходящийся локальный main dd-flow-cli не используем как неявную базу интеграции.

## Факты расследования

CP-213 Luna/Judge EVAL-20261011010823-4dfd0e30 завершил SPECIFY, затем capture перед обработкой stop_after повторно отклонял изменение adapter.events.jsonl. После завершения Stage в журнале есть thread/read и ответы idle, а не новая продуктивная работа. Проверка собственных наблюдений создала ложную зависимость capture от тишины наблюдателя.

owned_inventory_changed также наблюдался, но исторические сведения не позволяют установить, какая ветвь агрегатной проверки сработала. Не объявляем конкретный heartbeat причиной этого события без доказательств.

Аудит исходников выявил аналогичные риски:

| Место | Предмет существующей проверки | Решение |
| --- | --- | --- |
| eval-snapshots.ts / snapshotSourceVersion | выбранное runtime-дерево целиком, обычные файлы и семантика вложенных SQLite | заменить требование неизменности живого дерева согласованным захватом разных классов данных |
| run-control.ts / databaseVersion | PRAGMA data_version и total_changes всей БД | проверять релевантные записи и поколения владельцев данного RUN |
| run-control.ts / nativeInventoryVersion | daemon state и все retained operations | проверять продуктивные операции, ancestry, владельцев; отделить observation receipts |
| eval-snapshots.ts / bootstrap и RUN source | show-ref --head всех refs | фиксировать используемые HEAD/base/ref и их объекты; не блокировать из-за постороннего ref |
| runner.mjs / canonical resume | равенство commit/tree всего dd-eval | заменить допуск зависимостями конкретной canonical definition, commit оставить provenance |
| runner.mjs / committedDefinitionIdentity | чистота всего checkout | фиксировать committed выбранные входы и их зависимости; посторонние изменения не причина отказа |
| review-copy, external-work-launch, work-registry | исходные review inputs, копия, принятые отчёты | сохранить; уточнить область выбора, не отменять stale-input и read-only гарантии |
| candidate, snapshot manifest, execution contract, qualification receipts | опубликованные артефакты и идентичность проверки | сохранить checksum, binding и проверку переиспользования |

Таблица — аудит механизмов по исходникам, не утверждение, что каждый риск уже проявился в живом запуске. Перед изменением каждой ветви проверяем её актуальную версию, callers и readers.

## Контракт данных

1. Продуктивное состояние: RUN/Stage/attempt, Work receipts, контрольное поколение, владельцы, выбранный продуктовый tree/index/HEAD/base, необходимые recovery Session identities. Захватывается под существующим admission fence. Изменение релевантной идентичности требует повторной проверки или отказа.
2. Наблюдательные данные: append-only journals, read/inspect результаты, heartbeat и диагностика. Фиксируем ограниченный срез; последующий допустимый append не отменяет результат.
3. Опубликованные артефакты: snapshot, candidate, receipts, qualification observations. Их содержимое и binding после публикации должны оставаться проверяемыми; новые результаты оформляются новой revision.

Не исключать весь native runtime из recovery snapshot. Для каждого сохраняемого файла указываем потребителя и назначение: воспроизведение оценки, восстановление Session или диагностика. Provider homes (.zcode, Codex, Grok) не обходятся как произвольный набор неизменяемых файлов: только явно необходимые артефакты существующих адаптерных контрактов. Неизвестная операция не считается безопасным наблюдением.

## Порядок реализации

### 1. Зафиксировать выбор и потребителей

- Составить таблицу всех writers/readers snapshot и inventory: controller capture, bootstrap, recovery seal/import, candidate/Judge, external review, квалификация, все адаптеры.
- Использовать существующие selectors и manifest, не создавать универсальную платформу политик.
- Вынести общий небольшой selector/описание класса только там, где copy и validation сейчас расходятся. Явные обязательные файлы, optional диагностика и причина отсутствия.
- Проверить resource home вне ddFlowHome и вложенные SQLite: отсутствие в обходе не должно означать отсутствие проверки владельца.

### 2. Сузить settlement inventory

- Заменить global database version снимком релевантных RUN/Stage/Work/control/owner записей. Сохранять identity и fencing generation, включая новые child registrations и ранее неизвестных writers.
- Исключить из сравнения только явно классифицированные read/inspect operations и служебные обновления. Сохранить их доказательства отдельно.
- Изменение productive operation, Session ancestry, lease owner, admission generation или неизвестной операции продолжает блокировать capture.
- Не считать heartbeat или повтор idle новым доказательством settlement и не продлевать ими inactivity budget.
- При отказе писать конкретный класс/путь/identity и before/after generation без секретов; сохранить совместимость существующих error codes.

### 3. Захватывать доказательства, а не останавливать наблюдение

- Для JSONL фиксировать последний полный record, byte length и SHA256 захваченного префикса. Копировать ровно этот префикс, записывать cut в manifest. Частичный хвост не выдавать за завершённое событие.
- Допускать append после cut; обнаруживать изменение/усечение префикса. Замена inode/rotation во время захвата требует новой попытки либо явного отказа, не тихого смешивания файлов.
- Использовать существующий SQLite backup/consistent read механизм, не копировать main/WAL как независимые байты. Допустимые служебные записи не должны требовать неизменности всей БД.
- Проверять продуктивные bindings до/после захвата под fence. Несколько БД не объявлять одним распределённым атомарным snapshot: общий контракт обеспечивают fence и RUN identities, диагностические срезы могут иметь разные timestamps.
- Публиковать manifest и payload атомарно существующим способом; сохранённые payload checksums проверять по-прежнему. Fence всегда освобождать в finally.

### 4. Исправить stop_after порядок

- После подтверждённого завершения целевого Stage сначала перейти к штатному owned settlement/stop, затем захватить итоговый результат. Не оформлять его как вход в следующий Stage.
- Согласовать purpose/type с dd-eval consumers: finished означает достижение целевого этапа, не завершение полного SDLC; subsequent Stage не стартует.
- Для промежуточных Stage оставить capture с сохранением Session/recovery возможности, без обязательного закрытия работающего provider runtime.
- При concurrent operator stop/cancel соблюдать существующий control generation и приоритет; не выдавать finished при неподтверждённом завершении Stage.
- Crash/replay не создаёт вторую productive operation или второй conflicting candidate.

### 5. Git и definition зависимости

- Фиксировать exact product HEAD/tree/index, рабочие выбранные файлы, реально используемый base/ref и необходимые recovery objects. Обновление посторонней ветки не отменяет capture.
- Bundle/export строить из зафиксированных необходимых объектов/refs, не из изменяющегося общего show-ref. HEAD/base/index drift по-прежнему отклонять.
- Canonical resume связывать с case/profile/fixture/context/checkpoint и существенными исполнителями проверки, не commit всего checkout. Изменение README не требует перестройки canonical chain.
- Сохранить уже существующее переиспользование qualification по effective request. Oracle/validator изменения проверять replay сохранённых положительных и отрицательных ответов; не возвращать whole-tree qualification key.
- Изменение общего Judge prompt/model/существенного adapter behavior требует соответствующей живой квалификации; несвязанный Subject harness fix сам по себе не требует повторять Judge.
- Новые receipts имеют versioned dependency identity. Старые receipts читаются по старому контракту: неизвестные зависимости не объявлять совместимыми задним числом.

### 6. Сохранить review и recovery гарантии

- Проверить все callers reviewSourceHash/reviewExecutionCopyHash и fallback workspace hash. Новый путь использует выбранный input contract; legacy путь не ослаблять без явной миграции.
- Сохранить detection изменения criterion/plan/report, копии reviewer, symlink escape и executable modes. Не ограничивать review только критериями: продуктовые файлы, необходимые для независимой проверки, остаются входами.
- Полезные bootstrap product guards оставить; сузить только Git refs и служебные файлы по той же политике выбора.
- Recovery import проверяет целостность, ownership, generation и обязательные native материалы. Assessment-only snapshot не представлять portable recovery.

## Проверки реализации

Обязательные детерминированные regression tests:

- Постоянные thread/read appends при idle: capture завершается, copied journal prefix целостен.
- Heartbeat/foreign RUN update в общей БД: допускается; изменение текущего Stage/owner/control или новый child writer: отказ.
- Read operation receipt не инвалидирует inventory; новая productive/неизвестная operation инвалидирует.
- Journal partial record, truncate, prefix rewrite, rotation, missing mandatory file, symlink escape: не публикуется смешанное доказательство.
- SQLite backup при служебных записях читаем и согласован; productive mutation под fence отклоняется.
- Посторонний Git ref меняется: успех; выбранный HEAD/base/index/product input меняется: отказ.
- stop_after: Stage done → owned settlement → final capture → finished; следующий Stage не стартует. Отдельно cancel race, crash/replay, cleanup failure.
- Промежуточный Stage: snapshot пригоден штатному recovery, Session identity сохранена.
- Corrupt published payload/receipt, stale candidate/Judge binding, reviewer mutation: существующие отрицательные проверки остаются рабочими.
- README change не требует новых модельных вызовов; fixture/model/prompt change инвалидирует только правильные qualification dependencies; oracle replay сохраняет negative rejection.

Добавить integration сценарий с реальным observer journal writer, а не только одноразовую правку README через mock cpSync. Не превращать тесты в требования быстродействия под нагрузкой: явные бюджеты ожидания с диагностикой, без бесконечных retry.

Отдельная уже подготовленная зависимость baseline tests: commit 08a4e833ff5dd7e61c78d5b9df4c399dd7557af3 в dd-tasks-baseline-test-reliability. Проверить, опубликовать по правилам продукта и обновить checkpoint отдельным действием; не менять продуктовую функциональность. Текущий pinned checkpoint эту правку ещё не содержит.

## Выпуск и приёмка

1. Проверить repository instructions и актуальный integration base; реализовать небольшими commits по механизмам выше.
2. Прогнать targeted negative/positive tests, typecheck/build и связанные integration suites. Проверить diff на случайное снятие полезных guards.
3. Опубликовать runtime штатно, проверить installed hooks в обоих Codex homes и pinned engine EVAL; старые runs не переводить на новый runtime.
4. Только после отдельного разрешения запустить новый SPECIFY-only EVAL и проверить finished, capture, cleanup; затем recovery/continuation сценарий и необходимые проверки других адаптеров. Один SPECIFY PASS не доказывает весь E2E.

## Readiness / ponytail

Решения о цели контроля, классах данных, stop_after, legacy, failure semantics и отрицательных проверках приняты. План готов к реализации, но не к заявлению о живой приёмке. Первый пункт реализации — подтвердить полный writer/reader inventory на актуальной базе и точные зависимости native recovery; неизвестные обязательные материалы остаются защищёнными до этого подтверждения.

Минимальность: убираем глобальные equality gates, переиспользуем fence, snapshot backup, selectors, publication и qualification replay. Не добавляем новый coordinator, распределённые транзакции или универсальный policy engine. Полезные checksums не удаляем. Замеры CP-213 не используем как доказательство, что широкие проверки повсюду уже ломались.

## Реализация и дополнительные исправления

- `eval-snapshots`: полные строки известных journals/logs фиксируются с длиной, checksum и inode; поздний append разрешён. Rewrite/truncate/rotation отклоняются. Известные read operations сохраняются decoded cuts, без копирования изменяющейся пары requested/result. Неизвестные operations/files остаются защищёнными.
- `run-control`: scoped projection охватывает RUN, descendants, Work/launch/check/merge/lifecycle/plan/protocol/config, контроллеры и продуктивные operation receipts. Общий predicate read operations используется также snapshot copier. Бюджеты settlement не расширены.
- `run-controller`: stop-after settlement предшествует final candidate capture. Промежуточные stage-entry snapshots и recovery остаются отдельными путями. Regression проверяет последовательность реальных detached controller events.
- `runner`: dependency identity versioned; commit/tree остаются provenance. Case docs/results и невыбранные profiles/history исключены; явно включены input, checkpoint, entry pack, qualification corpus/context и role/delegation profiles. Legacy сохраняет старый контракт. Внешний profile привязан к exact checksum.
- При независимом review дополнительно обнаружены и исправлены: незаметное изменение terminal receipt уже существующей productive operation; гонка загруженных case/profile/checkpoint/assessment с новым committed identity. Добавлены regressions.
- Review selectors уже ограничены shared service-file policy: дополнительные ослабления не нужны. Published checksums, accepted reports, stale-input и escape guards сохранены.
- Исправлено предсуществовавшее lint препятствие в stage-lifecycle: удалена неиспользуемая переменная из destructuring, поведение не менялось.
- Baseline test-only commit `08a4e833ff5dd7e61c78d5b9df4c399dd7557af3` опубликован в `origin/fix/baseline-test-reliability`. Старый product checkpoint не подменялся.

Readers/writers проверены: controller admission/capture, native durable operation reader, snapshot copy/restore/fork/recovery, candidate ingestion, canonical/recovery definition admission, review-copy/shared review input, qualification effective-request reuse. Raw inspect receipts не источник productive recovery authority; сохраняются decoded diagnostic cuts. Productive request/result и native Session материалы остаются в payload. Recovery без boundary продолжает использовать sealed guard и прежний snapshot contract.

Доставка source branches не означает опубликованный engine: проект требует PR-интеграции, затем immutable release candidate и release gates. Changeset подготовлен. Глобальные hooks и historical EVAL engines не перенаправляются на непубликованный checkout. Перед будущим EVAL нужны released engine, installed-byte проверка и отдельная живая приёмка; эти шаги не объявляются выполненными по source tests.

Проверка реализации: runtime typecheck, lint и build PASS; capture — 18/18, resume-observation — 6/6, inventory — 2/2. Связанный targeted integration прогон snapshot/review/external Work/controller — 13 PASS, 85 невыбранных тестов пропущены; оба реальных stop-after controller сценария PASS. dd-eval eval/reliability/qualification — 82/82 PASS без skipped. Первоначальные ошибки проверки (отсутствующий dist, ожидание единственного journal cut и неполная тестовая запись owner_token) устранены; продуктивные guards не ослаблялись ради тестов. Полный integration suite и живая модельная приёмка этим прогоном не заменяются.

## Независимое review реализации — 2026-10-11

- Исправлена гонка native publication: каталог операции может появиться раньше requested.json. ENOENT на любой фазе fenced capture становится повторяемым snapshot_source_changed; неизвестный неполный request не считается read-only и при постоянном отсутствии исчерпывает существующий бюджет. Обе ветки покрыты regression.
- Исправлен обход dependency identity через committed symlink: Git связывает текст ссылки, но загрузчик читает цель. Выбранные committed dependencies теперь отклоняют symlinks; изменение ignored target не может сохранять прежний admission digest.
- Добавлен требовавшийся планом настоящий параллельный subprocess journal writer с IPC handshake; capture проверяется на полный JSONL-префикс, последовательность, совпадение с source prefix и checksum без требования тишины.
- Проверены stop supersession, publication replay после rename до DB commit и cleanup failures в общих settle/capture путях. Новых доказанных существенных дефектов там не выявлено.
- Полный dd-eval npm test: 795 PASS, 10 явно skipped интеграционных сценариев, 0 failures (805 tests). Живые модели не вызывались.
- Branch-ready flow-status обнаружил предсуществующий project-pack drift и старый contract; это отдельно зафиксировано в runtime DEF-079-PREEXISTING-PROJECT-PACK, не исправляется подменой канонического пакета в этом patch.
