# T03 → T04: предварительный результат чтения

Статус — подготовка. Принятого `dd-eval/matrix-history@1` и права на `@5` admission пока нет. Этот файл описывает то, что реально возвращает T03 на опубликованном snapshot; он не меняет требуемый интерфейс в CLI T04 `6c59bd2`.

Вызов `readPackRevisionGraphs({ snapshot, snapshotSha256, runId, previousPlanVisit, previousReviewVisit, planVisit, reviewVisit })` требует явного выбора всех четырёх visits. Caller должен отдельно установить владение и происхождение snapshot и его digest; одно совпадение digest с переданным аргументом этого не доказывает. Reader не ищет нужную стадию по имени каталога. Для review-off без посещения `plan-review` этот API неприменим; отсутствие визита нельзя подменять фиктивным.

Возвращаемый `dd-eval/pack-revision-graphs@1` содержит:

- `source` — RUN/project и точный digest `snapshot.json`; `pack` — digest manifest и раздельные project commit, canon commit, checksum/manifest engine и хеш его binding. Проверка engine binary и полная bundle admission остаются отдельной обязанностью.
- `chain.previous` и `chain.current` — разные принятие PLAN/review, результат и successor каждого визита; `chain.aspect_maps` — выбранные удержанные карты до и после изменения. Доказательство ограничено проверками reader и не доказывает семантическую корректность плана.
- `previous_graph` и `current_graph` — адреса и хеши SQL receipt зарегистрированного graph, его успешного dispatch и принятых child Work; batch и точный result каждого Work. Отсутствующее или неоднозначное доказательство приводит к отказу.
- `coverage.matrix_components = unavailable` и `coverage.forkability = unverified`. Нельзя заменять их на passed, даже если оба graph прочитаны.

Файловый `path` ответа — относительный путь внутри именно удержанного snapshot; `ref` вида `run://...` — логическое имя W08 результата. Receipt `{table, id, sha256}` адресует исходный `payload_json` строки `audit_events` или `start_receipt_json` строки `work_sessions` в `runtime/db.sqlite` этого же snapshot. Digest считается по точной строке, переданной SQLite; граница — `source.snapshot_sha256`, а не текущий рабочий каталог. Отдельный digest SQL строки не является подписью. Для T04 нужно повторно открыть те же snapshot и строку, проверить ID/hash, scope и pinned authority; нельзя использовать произвольный одноимённый JSON.

`pack_history_request` в candidate/recovery является только выбором для диагностики. `attachCaseAcceptance` включает его в identity нового receipt; checker возвращает `unavailable` и может приложить результат читателя к `facts.selected_pack_visits`. Request сам по себе не доказывает, что выбранный CODE/MERGE использовал эти PLAN/review, и не разрешает квалификацию. Запросы отсутствующих/неподходящих визитов не превращаются в PASS.

Для полного T04 остаётся расширенный snapshot contract и независимая проверка: stage packet и все start/exec/submit observations с attempts/generation/Work membership, source и target bundle bytes, неподтверждённые внешние эффекты, CODE graph/skip и принятие результатов downstream. Текущий scoped W08 capture не обязан удерживать `flow_run.pack_component_observation` и `flow_run.stage_packet`; поэтому этот reader может отказать даже на реальном принятом RUN. Формальные S02/K03/K04/R01 и назначенный canon ещё не являются принятыми входами этого среза.
