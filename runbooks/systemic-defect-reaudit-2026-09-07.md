# Повторная ревизия: flow, recovery, evidence и release

Дата: 2026-09-07. Статус: исходная ревизия ниже сохранена; реализация и локальные проверки описаны в следующем разделе. Публикация и реальная qualification пока не подтверждены.

## Выполненная реализация

- F1–F3: AGY больше не заменяет native failure успешным Stop; новая активность снимает settlement, запоздалый Stop с меньшим native step отвергается. Prompt резервируется до persistence. Ошибка persistence освобождает reservation во всех шести адаптерах; bundled и fallback изменены вместе. Проверены новый/повторный step, разные concurrent prompt и disk failure. Событие без native identity по-прежнему нельзя однозначно привязать к Turn; локальный generation не выдаётся за такую гарантию.
- F4: общий cleanup сначала запрашивает normal stop и отменяет owned tree только при точном ответе `tree_not_settled` после terminal failure. Observation loss и ошибки доступа не разрешают отмену. Capture больше не зависит от списка infrastructure-кодов: его разрешает фактический RUN и sealed-writer barrier; productive resume остаётся отдельной явной операцией с проверкой точной identity. Attribution используется для отчётности, не как разрешение replay.
- F5: Work publication получает fsynced intent до SQL commit и атомарно материализуется после commit. Recovery seal завершает только intent, совпадающий с принятой DB receipt и WorkSession. Более поздний drift не перезаписывается. Retry использует устойчивый journal, сохраняет DB receipt в archive и продолжает частичный перенос вместо создания следующего ATT. Incomplete snapshot сохраняет противоречащие байты и hashes, остаётся non-restorable; проверяется соответствие уже скопированных файлов уже скопированной SQLite.
- Release: замороженный clean main/canon tuple, checkout lock, bounded metadata/tarball readback, reconciliation lost publish reply, отсутствующий tag создаётся только после проверки опубликованного artifact. Изолированный consumer предшествует global install; вызывается exact package entrypoint, проверяются router/engine/checksum/compatibility. Секреты не попадают в phase receipt. Версия остаётся beta.35, новый bump не выполнялся.

Локальные проверки: полный dd-eval после adapter-изменений — 249/249; snapshot/recovery и новые publication/retry crash-состояния — 15/15; fake release проходит accepted-publish/lost-reply, временно недоступный tarball и повтор после install failure без второй публикации. Полный engine gate и опубликованный consumer требуют отдельного завершения. Эти проверки не заменяют матрицу реального провайдера ниже и не доказывают causal identity отсутствующих native полей.

Исследованные исходники: dd-flow-cli `508b72a9e9bb17dfa6bff5e52462115507a8524c`, dd-eval `8b03c9a907cd43a5c6d34fabab24e757e6a742ec`. Опубликованный npm beta: `0.9.0-beta.34`. Выпуск beta.35 остановился до публикации: 332 теста прошли, тест AGY liveness превысил ограничение 350 мс. Исходники и исторические RUN в этой ревизии не менялись. Новые provider Sessions не запускались.

## Вывод

Предыдущие исправления закрыли ряд конкретных нарушений, но системное закрытие не доказано. Общая причина — превращение наблюдения или промежуточного эффекта в окончательное решение без достаточной идентичности, проверки актуальности и восстановления после частичного выполнения.

У этой причины четыре проявления:

1. Наблюдение относится к Session, а решение применяется к текущему Turn/Work без достаточного разграничения поколений.
2. Остановка процесса, исход provider Turn и принятие Work представлены одним статусом.
3. Последовательность эффектов над БД, файлами, журналом или registry считается одной операцией, хотя падение может произойти между ними.
4. Успех команды или одного теста подменяет проверку требуемого состояния.

Это общие инварианты, но не повод писать одну универсальную машину состояний для npm и всех провайдеров. Исправлять нужно небольшие общие точки внутри каждого контура, с одинаковой дисциплиной доказательств.

## Что из прежних исправлений сохраняет силу

| Прежний дефект | Текущее состояние | Граница доказательства |
| --- | --- | --- |
| Recovery не находил владельца после завершённого PLAN | `run-recovery.ts` выбирает последнюю coordinator WorkSession; completed boundary получает ACK без повторного открытия Work | Есть regression и историческое контролируемое восстановление с переходом PLAN → PLAN-REVIEW → CODE; это не полный успешный recovery E2E |
| Старый daemon сохранял authority после следующего recovery | Проверяются binding, generation, native Session и свежий hook; более ранний владелец отвергается | Поддерживать проверки на каждом mutation и после await; не считать это доказательством всех mutation paths |
| OpenCode использовал историческое сообщение вместо текущего ответа | Проверяется новый assistant message из текущего POST, Session и native error в HTTP 200 | Не решает произвольную потерю ответа; повторная продуктивная отправка не разрешается |
| ACP read-запрос стирал ошибку pending prompt | Ошибка прикрепляется к pending `session/prompt`, а не к Session вообще | Session-only notification всё ещё не доказывает, какому prompt принадлежит задержанное событие |
| Sequence журнала перезаписывался enrichment, candidate игнорировал новую причину ошибки | Sequence назначает журнал; сравнение candidate расширено, revisions проверяют hash и parent | Проверять crash между публикацией evidence и событием; существующий regression не равен перебору всех crash points |
| Root SUCCESS возвращался до доказательства остановки неизвестных descendants | Есть pending terminal receipt и `settled_by_root` | Найдены оставшиеся нарушения ниже |
| Reviewer принимался без per-aspect evidence | PLAN/CODE ingress проверяет coverage и непустые ссылки до принятия Work | Правильность смысла ссылки остаётся обязанностью reviewer/Judge; наличие файла само по себе её не доказывает |
| Файл result менялся после принятия Work | Перед snapshot сравниваются байты файла и DB receipt | Это обнаружение рассогласования, а не завершённый протокол сохранения/восстановления evidence |

## Подтверждённые повторными проверками дефекты flow

### F1. Stop стирает исход дочернего Turn — P1

Место: `dd-flow-cli/src/harness-runtime/lib/dd-agy-daemon.mjs`, `Runtime.observeHook`; аналогичная логика в `dd-eval/lib/dd-agy-daemon.mjs`.

Изолированный вызов на текущем Runtime: descendant имел `status: failed`; пришёл `Stop(fullyIdle=true, terminationReason=error)`; статус стал `completed`. Ни реального провайдера, ни рабочего RUN для этой проверки не использовалось.

Первопричина: `fullyIdle` означает отсутствие активности, но обработчик присваивает ему смысл успешного завершения. Это стирает failure и может поменять последующее решение fanout с обработки ошибки на `execution_ended_without_work_result`. Engine не принимает Work автоматически по native SUCCESS, поэтому это не доказательство автоматического ложного принятия Work.

Исправление: независимо хранить native outcome (`success/failed/cancelled/unknown`), tree settlement и accepted Work receipt. Stop обновляет settlement; никогда не переписывает outcome. Если своего terminal result нет, сохранять неизвестный исход и доказательство остановки.

### F2. Новая активность использует старый settlement — P1

Место: `Runtime.observeStep`, `receipt`, сохранённая карта descendants.

Изолированный вызов: descendant со статусом `settled_by_root` получил новый `step_update` в состоянии RUNNING; статус остался `settled_by_root`. `receipt()` включает этот статус в множество остановленных children. В наблюдении subagent также сохраняется `prior.status`.

Первопричина: settlement имеет длительность жизни Session, а должен иметь область действия конкретного Turn/поколения активности. Старые children сохраняются через restart, но новая активность не инвалидирует прежнее доказательство.

Исправление: привязать settlement к поколению и границе наблюдённой активности; любое подтверждённое новое исполнение снимает старый settlement. Исторические outcomes сохраняются отдельно. Локальный generation не следует выдавать за native request ID.

Ограничение: probe подтверждает ошибку перехода текущего Runtime; воспроизведение реального повторного использования native child требует отдельной qualification.

### F3. Два prompt проходят admission одновременно — P1

Место: `Runtime.prompt`. После проверки `this.active` выполняется `await persist`, и лишь затем устанавливается `this.active`.

Изолированная проверка с управляемым promise для persist: два разных prompt одновременно дошли до persist; после освобождения barrier в fake stdin ушли обе команды. Одна запись active не может представлять обе операции.

`durableDaemonDispatch` исключает повтор одного operation ID, но разные IDs проходят независимо. Это не per-Session mutex. В OpenCode/Grok productive-wrapper active устанавливается до persist; похожую дисциплину можно использовать без нового framework. Нужно также проверить их освобождение reservation при ошибке persist до входа в try/finally.

Исправление: резервировать productive operation синхронно перед первым await после admission; связывать reservation с operation ID; освобождать только владельцем, включая ошибку persistence и отмену. Control-path cancel/stop должен оставаться доступен.

### F4. Ошибки и остановка дерева выбираются разными списками — P1/P2

Место: `dd-eval/lib/runner.mjs`: `isInfrastructureFailure`, `requiresTreeCancellation`, `captureRecoveryEvidence`, `recoveryBridgeStopArgs`.

Факт кода: recovery capture допускается по whitelist error code, cancel-tree — по другому whitelist. Например, `agy_provider_failed` допускает capture, но не требует cancel-tree. AGY ERROR может завершить prompt при ещё не доказанном settlement descendants. Тогда normal stop откажет, а capture вернёт unavailable. Это сценарий для воспроизведения, а не заявление, что всякий provider ERROR оставляет живое дерево.

Первопричина: attribution ошибки используется как замена фактам о процессе и пригодности recovery. Новые коды требуют согласованного изменения нескольких мест.

Исправление: разделить attribution, outcome certainty, tree settlement, replay permission. После ошибки читать фактическое состояние принадлежащего запуску дерева и применять единую процедуру drain/owned cancellation/settlement. Recovery eligibility определять отдельно от product/infrastructure attribution. Полезен один нормализованный decision object, а не расширение нескольких списков.

### F5. Целостность receipt проверяется поздно; crash-consistency неполна — P1

Места: `work-registry.ts: settle/retryWork/assertRunWorkResultArtifacts`, `eval-snapshots.ts: captureEvalRunSnapshot`, stage fan-in writers.

Факты кода: result-файл записывается внутри SQL transaction, но rollback SQL не откатывает файл. Retry перемещает файлы перед изменением DB. Snapshot guard распространяется и на incomplete/recovery: drift completed Work блокирует также сбор такого evidence. DB авторитетна, но несколько downstream surfaces читают материализованные файлы.

Исправление: DB хранит принятый receipt и его identity; файловое представление публикуется атомарно и восстанавливается из принятого receipt. Отдельно сохранить обнаруженный изменённый файл и hashes — не перезаписывать следы. Принятие candidate при drift запрещать. Диагностический capture должен иметь возможность сохранить противоречие с пометкой «непригоден для resume»; восстановление должно требовать отдельного согласованного состояния. Проверить readback после копирования payload, а не только источник до копирования.

Это не предложение молча починить исторические snapshot или считать испорченный capture restorable.

## Release: системный план вместо следующего частного retry

1. Зафиксировать до проверки версию, commit, branch, ожидаемый canon и release channel. Проверить main, чистоту и неизменность этих входов непосредственно перед publish. Для долгих gates использовать существующий release lock или минимальную reservation; она должна исключать параллельный собственный release, но не обещать блокировку произвольного git другого процесса.
2. Перед любой повторной публикацией читать registry. Если версия уже опубликована — проверить артефакт и продолжить post-publish этапы для того же tuple. Если результат publish неизвестен — сначала reconciliation. Запретить bump как обход незавершённого выпуска. Непубликованный beta.35 сначала согласовать с registry; не создавать beta.36 автоматически.
3. Добавить bounded readback и для metadata, и для tarball. Повторять временные ошибки, отдельно обрабатывать auth/conflict. Ограничивать отдельную команду и общее ожидание. Использовать Node timer вместо внешнего `sleep`.
4. Проверять созданный Changesets tag; при частичном завершении восстанавливать только отсутствующий тег и только после подтверждения artifact commit. Проверять remote main и peeled tag. Существующий неправильный тег не перемещать.
5. Выполнять consumer smoke через точно установленный executable и сравнивать JSON: router version, selected engine, checksum, compatibility. Успешный exit и напечатанный JSON недостаточны. Чистый изолированный consumer должен предшествовать обновлению рабочего global router.
6. Повторно проверять canon tuple в опубликованном tarball, а не только наличие canon metadata в локальном prepublish. Проверить фактический registry/channel; `whoami` сам по себе не доказывает полномочия на требуемый package.
7. Сохранять итоговый receipt с фазами, exact tuple и readbacks, без секретов. Использовать существующие atomic-file/lock подходы; не строить release server.

Текущий retry и tag readback — полезные части, но release-script до сих пор не прошёл от начала до конца одним успешным запуском. Предыдущее утверждение об отсутствии создания тега было ошибочным: Changesets создаёт аннотированный тег; дополнительное создание не требовалось.

## Проверки и область уверенности

В этой ревизии повторно выполнены `node --test test/runner-recovery.test.mjs test/recovery-safety.test.mjs test/daemon-operations.test.mjs`: 33/33 прошли. F1–F3 проверены отдельными изолированными вызовами текущего Runtime со stub persistence/stdin; это новые воспроизведения вне существующего regression suite. F4–F5 установлены трассировкой исходников; полное crash/provider воспроизведение для них входит в план.

Нестабильный тест `<350 мс` присутствует в обоих репозиториях. Он проверяет скорость wall-clock выполнения машины вместе с механизмом liveness. Падение последнего full suite подтверждено; оно само по себе не доказывает ошибку production timeout. Проверять вычисление deadline на управляемых wall/monotonic clocks, отдельно оставив socket integration с широким watchdog. Простое увеличение 350 не закрывает класс.

Нужная матрица:

- terminal → Stop, Stop → terminal; ERROR → Stop; CANCELLED → Stop;
- child settled → новая активность; старый hook после нового generation; notification без native ID;
- два разных prompt одновременно; повтор одного ID; cancel до/после reservation; persist failure;
- crash до/после DB commit, публикации result, snapshot rename, boundary event, recovery ACK;
- два последовательных recovery, включая completed stage boundary; завершённые Work не запускаются снова;
- изменённый result/evidence сохраняется диагностически, но не становится принятым/restorable;
- registry 404 → visible, tarball временно недоступен, auth отказ, publish accepted → потерян ответ, tag push/install потерял ответ, PATH ведёт на другую версию;
- parity контракта bundled runtime и fallback в dd-eval; сравнивать поведение, а не только raw file hash (текущий diff AGY включает комментарии/форматирование).

При notification без native prompt identity нельзя обещать абсолютное causal fencing. Нужна явная capability/uncertainty политика: сомнение сохраняется и блокирует продуктивный replay; локальный счётчик не устраняет ограничение провайдера.

## Порядок реализации и критерии завершения

1. Зафиксировать реестр дефектов F1–F5 и release gaps с reproduction и ожидаемыми инвариантами. Начать с детерминированных failing tests; больше не проверять release orchestration новой npm-версией на каждую догадку.
2. Исправить admission и независимые outcome/settlement в AGY; проверить аналогичные границы шести адаптеров. Сначала закрыть F1–F3, затем привести cleanup/recovery decisions к наблюдённому состоянию (F4).
3. Восстановление DB/file receipts и диагностического capture (F5). Пройти crash points вокруг stage transitions и recovery, сохранив уже исправленные owner/generation/candidate инварианты.
4. Исправить release orchestration и test clocks; прогнать fake registry/git/consumer сценарии без публикаций. Обновить runbook под фактический путь и частичное завершение.
5. Один согласованный source candidate: targeted regressions, полный dd-eval/engine gate, strict build и pack. Повторять полный gate после существенного изменения, а не для неизменного промежуточного readback.
6. Одна публикация согласованного release tuple, exact consumer verification, новый immutable checkpoint.
7. Реальная qualification: обычный flow до MERGE + Judge; recovery внутри незавершённого Work; recovery на completed boundary; повторное interruption/recovery. Проверять отсутствие повторного Work, сохранение ошибок, чистое дерево и связность candidate/Judge revisions. Семантическую оценку продукта отделить от корректности orchestration.

Закрытие требует поведения на опубликованном артефакте и перечисленных failure permutations. Если native capability или quota блокирует сценарий — явно назвать незакрытую ячейку. Ни зелёный unit-suite, ни один удачный provider run не доказывают отсутствие этого класса во всей кодовой базе.
