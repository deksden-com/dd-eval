# cp-107: повторное ревью реализации

Исторический срез до завершающей доработки. Актуальная реализация и подготовка
описаны в [cp-108](cp-108-implementation-and-readiness-2026-09-14.md).

Дата: 2026-09-14. Область: незакоммиченный пакет dd-flow-cli/dd-eval,
сверка с cp-107-systemic-fix-plan. Живые E2E и публикация пакетов не выполнялись.

## Подтверждённые существенные дефекты и внесённые исправления

1. **SQLite: неизвестная транзакция ошибочно считалась writer.**
   `isTransaction` допускал вложенную запись под deferred read snapshot.
   Теперь оба способа начала записи используют один учёт владения в Database:
   callback `writeTransaction` и явный `beginWriteTransaction` для существующих
   composite-команд с ручным commit/rollback. Их BEGIN IMMEDIATE в services переведены
   на явный API; порядок захвата нескольких БД сохранён. Native DatabaseSync при
   snapshot-copy не подменён facade. Неизвестная транзакция отклоняется до callback;
   после ошибки rollback соединение запрещает последующие продуктивные операции.
   SQL в `exec` не распознаётся регулярками. Это уточнение реализации §2.2:
   оставлены прежние границы composite-команд вместо механического переноса их
   сложных return/cleanup веток в callback.
   Регрессии: две SQLite connections, writer reservation до чтения, неизвестный
   read snapshot, явный outer writer, nested rollback и повторное открытие транзакции.

2. **Work start: claim и authority могли сохраниться отдельно от binding.**
   Hook claim теперь передаётся как callback и выполняется в общей транзакции с
   выдачей packet-команд, чтением зависимостей, Work/Session binding и receipt.
   Проверяются актуальные Work/generation/readiness. Workspace fingerprint готовится
   вне writer lock. Отдельный безусловный возврат claimed hook в observed удалён:
   откат claim выполняет сама транзакция. Обновление coordinator current_stage
   использует внутреннюю identity, а не отсутствующее поле публичного ответа.
   Регрессия проверяет rollback после частичной записи claim без Session/packet.

3. **Start receipt мог уничтожить пакет следующей стадии.**
   Повторная публикация разрешена только пока указатель Session соответствует
   исходному `works/<work>/prompt.md`. Переход к stage packet не даёт старому receipt
   права переписать новый prompt/context. Проверка указателя и публикация защищены
   от конкурентного handoff/retry writer lock. Неожиданные отличающиеся bytes
   дают conflict без перезаписи. Missing packet восстанавливается из точных bytes.
   `work show` снова только читает. Удалено восстановление до проверки прав в start.
   Регрессии: missing packet, drift, later-stage pointer и отсутствие постороннего context.

4. **Controller мог потерять причину либо выйти при живых соседних операциях.**
   Проверка зарегистрированных lifecycle outcomes читает runtime ledger по RUN,
   project и generation, а не UUID, найденные в тексте prompt. Старые superseded
   attempts и разрешённые retry не трактуются как новый fatal. После prompt есть
   повторный barrier; ошибки polling перехватываются. Перед отменой transport
   сохраняется причина и запрашивается существующий RUN control. Adapter promise
   дожидаются перед выходом из prompt handler. External fan-out снова использует
   allSettled для join, с запросом control сразу из rejected branch. Отказ persistence
   controller operation и cleanup/failure persistence в serve не заменяют исходную ошибку;
   вторичная причина сохраняется в диагностическом stderr владельца. Failed retained command больше
   не рекламируется как ready. Эти изменения **не доказывают** полноту всего §4:
   оставшиеся границы перечислены ниже.

5. **Adapter/JSON transport теряли исключения и принимали runtime failure за успех.**
   Abort до dispatch не запускает процесс. Error/close имеют один settlement path;
   evidence callback не выбрасывает исключение из EventEmitter. Output limit тоже
   запускает ограниченное завершение transport. Сохраняются nested error details
   из stdout/stderr, включая pretty JSON. Exit-0 structured runtime error отвергается,
   обычный отрицательный product verdict остаётся результатом. Оба process-json
   обрабатывают последнюю stderr-строку без newline; запрещённый async callback
   не оставляет unhandled rejection. Это прекращение transport, не доказательство
   остановки удалённой native Session — её подтверждает штатный control.

6. **Сбой projection выдавался за сбой уже committed event.**
   fsync journal остаётся фактом. Ошибка observation.json сохраняется отдельно в
   observation-error.json (при невозможности — stderr), не меняя исход операции.
   Duplicate заново строит projection и убирает warning после успеха.
   Регрессия воспроизводит EISDIR после journal commit и проверяет единственное событие.

7. **Worker crash между attempt receipt и root event оставался невидимым.**
   Terminal failure восстанавливается до early return, с детерминированным event ID,
   без нового execution. Failed attempt с подтверждённой регистрацией виден в root;
   до-registration admission failure не превращается в failure всего EVAL.
   Reducer понимает recovery_failed. Два subprocess replay-теста проверяют failed
   и recovery_blocked: один root event, никаких CLI/provider calls.

8. **Долгий context/HITL callback останавливал доставку событий; мгновенный обходил poll.**
   В managed client один последовательный status/event reader и один pending action.
   Во время подготовки reader доставляет события и продвигает cursor. Перед доставкой
   есть свежий status barrier даже для мгновенного callback. Поздний результат не
   отправляется после control, а execution cause не заменяется managed_run_controlled.
   Регрессии покрывают долгий и мгновенный callback, root event delivery и отсутствие dispatch.

## Что всё ещё нельзя считать реализованным по первоначальному плану

- Общий trusted outcome для harnesses **без ZCode invocation ledger** (§9.1):
  hooks.outcome/общий settlement anchor не добавлен. Улучшенный reader invocation
  ledger не заменяет такой канал. Полной шестипрофильной contract matrix нет.
- Единый observer обязательных failures на протяжении **всего** executeController
  (включая долгие внешние children/capture), а не только prompt и dispatch barriers,
  и детерминированные тесты fatal/operator-stop/prompt-completion race (§4.8, §4.15).
- Полный протокол no_effect/committed/unknown с восстановлением CLI ответа после
  committed start, durable ограничением storage retry и покрытием всех post-commit
  fault points (§3). Start bytes сохранены, claim атомарен, но одного этого недостаточно
  для заявления о полном восстановлении после любой потери ответа.
- Полная failure-injection матрица secondary-failure границ §4.13 ещё не выполнена;
  исправление сохранения primary в serve и adapter само по себе не закрывает её.
- Полная сверка ранее прочитанных stage/check inputs на settlement и строгая
  универсальная проверка конфликтующих duplicate root events остаются требованиями
  исходного плана; текущие локальные регрессии не доказывают их закрытие.

До закрытия этих требований нельзя объявлять весь первоначальный план выполненным
или готовность нового E2E подтверждённой. Старый cp-107 не мигрировался и не перезапускался.

## Проверки

- dd-flow-cli: typecheck и build; целевые storage/lifecycle/Work/adapter тесты;
  stage-consistency; vnext-protocolize; controller и controller-stages с локальными
  subprocess fixtures; runtime-scope-control/resume; stage-lifecycle-ownership.
- dd-eval: node:test suite и отдельные регрессии managed-flow-client,
  process-json, console-observation, e2e-reliability. Live проверки остаются skipped.
- Последний полный dd-eval: **239 passed, 8 skipped, 0 failed** (247 тестов).
  Последний компактный storage/lifecycle/Work/adapter набор dd-flow: **49 passed**;
  controller suite: **33 passed**. Дополнительно пройдены более широкие наборы
  controller-stages/scope/stage-ownership и vnext-protocolize (перекрывающиеся
  наборы не суммируются в искусственный общий счётчик).
- Это не full release gate, не публикация и не живая квалификация harnesses.
