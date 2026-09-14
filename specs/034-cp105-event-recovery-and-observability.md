# Fix 034: cp-105 — события, восстановление и наблюдаемость E2E

Дата: 2026-09-14. Оставшиеся блоки D3/D4 реализованы локально; адресные
регрессии и изолированный native smoke выполнены. Release gate, публикация
и новые engine pins ещё не выполнялись. Это не допуск старого cp-105 к новому E2E.

## Границы

Исправление относится к надёжности `dd-flow` и `dd-eval`, а не к изменениям
продуктового задания или к неявному ручному HITL. Оно сохраняет один durable
source of truth для lifecycle-вызова, native operation и controller receipt.

## Реализованная часть

1. ZCode `PreToolUse` для compound lifecycle-команды, которая ещё не могла
   выполниться, атомарно сохраняет `compound_lifecycle_command` и единственный
   standalone successor. CLI немедленно получает durable `retry_command`; уже
   executing/unknown попытка не переиздаётся. Такой доказанный no-effect отказ
   не отравляет ACP bridge, а несовпадение identity/scope/generation остаётся
   фатальным нарушением целостности.
2. Cancel ACK и physical settlement разделены. `completed, settled:false`
   сохраняется как immutable ACK, после чего каждый poll выполняет новую
   read-only inspection. Закрытый ZCode root опрашивает native residency всех
   известных root/child (включая ended children), не делает resume и не
   объявляет дерево завершённым при неполной topology.
3. Неудавшаяся immutable cancel/stop операция не подменяет свежий факт о
   дереве: scope settlement определяется inspection и незавершёнными native
   operations. После failed `tree_not_settled` новая попытка daemon.stop получает
   отдельный stable ID лишь при свежем settlement всех его sessions. Clean
   shutdown не синтезируется по смерти процесса. Failed receipt не перезаписывается
   и productive dispatch не повторяется.
4. RUN control, scope control, controller boundary capture и EVAL observer
   используют наблюдаемый 120-секундный budget. Его остаток сохраняется в
   durable snapshot и переносится следующему owner; scheduler/sleep gap не
   считается доказательством смерти и не тратит budget. По исчерпании owner
   выходит в blocked-состояние, fence остаётся. Новый explicit request обновляет
   только budget наблюдения; replay того же request-id сохраняет остаток.
   Backoff 1/2/5/10 секунд; timeout RPC ограничен оставшимся временем.
5. Report отделяет `execution_state` от `cleanup_state`: failure остаётся
   видимым при pending cleanup, но Judge/candidate не запускаются до settlement.
   Controller receipt публикует только owned journal paths, а eval отклоняет
   опубликованный journal за пределами его `state_dir`.
6. `canonicalResumeLock` переведён на существующий owner-identity lock.
   Старый file lock мигрируется лишь для валидного доказанно мёртвого owner;
   malformed или live legacy owner блокирует resume. Legacy `started_at` —
   время получения lock, а не OS birth: несовпадение строк не доказывает PID reuse.
   Ошибка action с
   кодом `EEXIST` не повторяет action.

## Регрессии

- durable root/child compound receipt и ACP envelope;
- fresh ZCode residency после close без resume;
- late physical settlement после failed cancellation;
- persisted recovery-observation budget и host gap;
- failure плюс pending cleanup в EVAL report;
- owned/missing/foreign controller journals;
- dead, malformed и live legacy canonical locks.

Локальная проверка ограничена typecheck/syntax check и затронутыми тестами.
Полный release gate и новые Luna/ZCode E2E намеренно не запускаются этим
изменением: это отдельные действия после финального review и release commit.

## Review реализации — существенные исправления

1. **Отказ lifecycle смешивался с поломкой транспорта.** Успешная запись
   no-effect возвращает `ok:true`, ошибка операции остаётся в durable outcome.
   Ошибки SQLite и непроверенная identity не подавляются bridge. Проверки
   project/native identity/generation предшествуют записи отказа. Неоднозначный
   shell с несколькими lifecycle-вызовами не выдаёт successor.
2. **Deadline оставлял попытку без безопасного продолжения.** CAS истечения
   ожидания атомарно сохраняет no-effect и successor только для issued/legacy
   expired. Late event не создаёт receipt и не возобновляет старую попытку.
   Observed/executing не переиздаются. Проверено выполнение successor.
   Общий renderer отклоняет expired issued-команду с retained ID/outcome,
   вместо предложения её как исполнимой; read-only путь не создаёт замену.
3. **Ошибка inspect переписывала ACK отмены.** Persistence результата cancel
   отделён от fresh inspection. Сбой чтения сохраняет completed ACK. Повтор
   scope-control сверяет unknown cancel через operation ledger, не посылает
   cancel заново. Foreign operation/session остаётся барьером.
4. **Daemon shutdown читал старый close receipt.** prepareStop закрытой сессии
   использует свежую residency с проверкой identity. Наблюдение сохраняется
   отдельно от close receipt и ownership inventory: observed_at не ломает fence.
5. **Topology теряла ранее виденных детей.** Накапливаются childSessionIds,
   running и ended между чтениями и в retained daemon state. Ошибочный/пустой
   snapshot не удаляет IDs. Это ещё не доказательство транзитивной полноты.
6. **Budget захватывал продуктивную работу и терял состояние.** EVAL тратит
   cleanup budget после failure/pending cleanup; RUN/scope сохраняют остаток
   после наблюдения. Capture сохраняет нулевой остаток до выхода. Blocked RUN
   сохраняет последние узлы/receipts; replacement scope owner наследует бюджет.
7. **Миграция могла удалить legacy lock живого PID.** Устранено сравнение
   acquisition time с OS birth; перед удалением сверяется inode.
8. **Lexical path check пропускал symlink наружу.** Consumer сверяет realpath
   журнала и файла model observations с опубликованным owned state_dir.

## Закрытие оставшихся блоков

- **D3.** `zcode/session/retainedSubagents` читает raw native topology без
  `ensureRealSession`. После close dd-flow рекурсивно обходит retained children
  и вновь обнаруженных потомков. Для каждого узла сначала проверяет residency,
  затем durable topology. Только inactive узел не может дописать нового ребёнка;
  наличие любого resident, неполный snapshot или ошибка RPC оставляют unsettled.
  Наблюдения сохраняются отдельно от immutable cancel ACK и ownership inventory.
  Даже idle root проходит close: idle Turn не доказывает остановку descendants.
  Старый bridge без нового метода остаётся blocked, fallback через resume нет.
- **Native evidence.** `tools/probe-zcode-tree-boundary.mjs --flat` прошёл
  на изолированном root с двумя background children. Новая цепочка handler +
  tree walker подтвердила все три inactive после close. Receipt:
  `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-tree-boundary-eeibYD/receipt.json`.
  Предыдущая проба показала stale `running` в durable snapshot после close;
  поэтому сам этот флаг не является settlement. Nested Agent недоступен внутри
  ZCode subagent; транзитивный/late-child обход проверен регрессией, не live nesting.
- **D4.** Публичные `run control reconcile`, `runtime scope reconcile` и
  `dd-eval runner cleanup` используют существующие owner locks/claims.
  Новый request-id обновляет budget один раз, все предыдущие IDs сохраняются.
  Автоматическая замена owner и replay не пополняют остаток, живой owner не
  отбирается. Scope cleanup не вызывает resume preparation; отдельный explicit
  resume очищает cleanup-only режим. Завершённый drain не запускает новый owner
  на каждом обычном poll. Ошибки наблюдения также сохраняют потраченное время.
- **EVAL.** Cleanup работает только с failed executions и уже принятыми RUN
  controls. Он не запускает queued execution, Subject, Judge или recovery.
  Операторский frozen scope journal не изменяет: для него применяется scope
  reconcile. Автоматический failure-cleanup также использует cleanup-only путь.
- **Boundary capture.** Исчерпание/ошибка сохраняет budget и оставляет Stage
  fenced. Продолжение — через RUN pause/stop и его cleanup control, а не повтор
  следующего Stage. Бюджет старой boundary-попытки не обнуляется.

Дальнейшая приёмка перед новым scored E2E: один release gate на финальном
release commit, публикация обоих изменённых runtime packages, проверка consumer
artifact, новые pins/checkpoint и лёгкий preflight. Старые EVAL не переписывать.

Проверки review: typecheck и build dd-flow; 67 тестов lifecycle/RUN/scope
(плюс добавленная затем регрессия read-only expiry),
31 тест runtime/capture/budget/controller-state; 28 recovery + 3 journal +
48 control/cancel/client тестов dd-eval (ещё 5 integration scenarios skipped).
PASS этих наборов не означает выполнения оставшихся критериев плана.
