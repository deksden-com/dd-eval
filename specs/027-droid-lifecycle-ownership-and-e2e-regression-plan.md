# 027 — Принадлежность lifecycle, делегация Droid и достоверность E2E

Дата: 2026-09-06. Статус: **реализовано; детерминированные проверки выполнены, живая и scored E2E квалификация остаются отдельными gates**.

## Основание и исправление прежнего диагноза

В `EVAL-20260906033153-cdccbaff` root передал уже начатые coordinator Work
трём native Task на SPECIFY, PROTOCOLIZE и PLAN. Дети не выполнили собственный
`work start`, но CLI принял их `stage pause/finish` и завершил Work root.
На PLAN-REVIEW агент правильно остановился по launcher для runner dispatch.
Runner сначала reconciled всю историю детей и упал на трёх отсутствующих
Work-привязках. Review wave ещё не запускалась.

Это уточнение заменяет утверждение спецификации 025 об отказе subject от
review dispatch. Ранее сохранённый Judge receipt остаётся историческим
результатом, а не подтверждением этой атрибуции. Незарегистрированная
делегация на предыдущих стадиях действительно нарушала worker contract.

Доказательства доступны локально в
`DD_EVAL_HOME/conformance/droid-adapter-20260906/e2e-root-cause.md` и
`e2e-root-cause-checks.json`. Реализация и детерминированные тесты не должны
зависеть от этих приватных файлов или полного исторического проекта.

## F1. Проверять владельца до любой lifecycle-мутации — реализовано

Репозиторий: **dd-flow-cli**. Основные пути: `src/cli/run-cli.ts`,
`src/services/hooks.ts`, `src/services/work-registry.ts`, stage services.

Переиспользовать существующие trusted hook identity, command matching и
claim-механизм. Провести `stage finish` и `stage pause` через общий guard:

1. Найти текущий coordinator Work/WorkSession для точных project/RUN/stage.
2. Проверить trusted PreToolUse receipt для точной команды и её scope.
3. Сопоставить вызывающую физическую Session с WorkSession, а не просто
   проверить, что у Work существует какая-то привязанная сессия.
4. Только после успешной проверки разрешить изменения Work, Stage, HITL,
   semantic artifacts и timeline успеха. Отказ может сохранить diagnostic
   receipt, но не должен менять состояние выполнения.

Предлагаемые коды: существующий `trusted_session_binding_required` при
отсутствии доказательства; `lifecycle_caller_mismatch` при другом владельце.
В диагностике: operation, project/RUN/stage/Work, expected и observed Session,
hook event key. Не выводить auth или полный пользовательский prompt.

Проверить все agent-owned terminal entrypoints, включая `work finish/fail`,
чтобы прямой вызов service не обходил проверку CLI. Передавать проверенную
identity явно. Не получать identity из ID в тексте prompt или свободного env.
Транзакция/guard должны охватывать необходимые проверки до первого изменения:
например, текущий PLAN finish обновляет Work до проверки WorkSession.

Технические dispatch/reconcile/cancel остаются отдельными controller
операциями. Не вводить общий `--skip-owner-check`. Существующие MERGE server,
HITL resume и операции восстановления проверить на их явную роль; право
controller не должно автоматически давать native child право finish root.
Успешный повтор исходной durable operation не должен повторять mutation;
новая попытка команды использует новый receipt по текущему hook contract.

## F2. Согласовать инструкции координатора и ребёнка — реализовано

Репозитории: **dd-eval**, **dd-memorybank**. Пути:
`lib/dd-droid.mjs`, `lib/runner.mjs`, common worker/subagent contracts.

- Root выполняет уже привязанный coordinator Work в своей Session.
- Task допустим для отдельного объявленного child Work, для которого CLI
  вернул exact `work start`. Имя worker и текст описания не создают Work.
- `dd-flow-worker` при отсутствии start-команды сообщает о неполном packet
  и не выполняет lifecycle или продуктивные изменения. Технический no-flow
  capacity marker остаётся отдельным существующим сценарием.
- Worker не завершает стадию координатора; он завершает только свой Work.
- Сохранить правило launcher: при `work_fanout` root возвращает управление
  runner; runner владеет dispatch. Оно должно присутствовать и в Judge packet.

Инструкции уменьшают ошибки модели; жёсткая защита — F1. Не подменять её
regex-парсером свободного Task prompt, автоматическим созданием Work по Task
или догадкой о смысле результата. Проверить остальные harness bootstrap
пути на тот же контракт, не меняя native primitives без необходимости.

## F3. Разделить обнаружение нарушений и управление текущим fanout — реализовано для stage-local reconciliation

Репозитории: **dd-eval**, **dd-flow-cli**. Пути:
`driveFanout`, `directNativeChildren`, `src/services/vnext-fanout.ts`.

Полный список descendants — наблюдение истории Session, не список review Work.
Проверять новые native observations после хода и перед принятием границы
стадии, даже если у неё нет fanout descriptor. Использовать существующие
Work/Session links и persisted stage/context events для scope; не создавать
отдельный scheduler или новую сущность Turn.

Классифицировать подтверждённые связи:

- текущий Work/attempt — сверять его состояние;
- завершённый Work предыдущей стадии — сохранить как историю без повторного
  settlement и без изменения текущего Work;
- неизвестная связь — сохранять как нарушение, не отбрасывать по возрасту;
- reused Session с неоднозначными execution links — оставлять ambiguity,
  не применять поздний terminal к последнему Work.

Отсутствие `work start` у ещё запускающегося ребёнка само по себе не ошибка:
он может ещё не успеть зарегистрироваться. Нарушение доказывает чужой
lifecycle-вызов (F1) либо terminal child без обязательного принятого Work.
Не выводить unbound failure из тишины или длительности старта.

Диагностика различает `detected_at_stage` и подтверждённую исходную стадию.
Если исходная стадия неизвестна — явно unknown. Root, который остановился
по launcher, должен получить дальнейший ход после runner dispatch, если
нет настоящего несогласованного состояния. Перестановка dispatch перед
проверкой или фильтрация всех старых детей не является исправлением.

## F4. Сохранять доказательства и не назначать виновного по умолчанию — реализовано

Репозиторий: **dd-eval**. Пути: execution failure path, `executionEvidence`,
`buildEvidencePacket`, `isInfrastructureFailure`, `finalJudgePrompt`, recovery.

Сохранить в failure result накопленные boundaries, HITL receipts, последние
driver/native observations, доступные statistics и ссылку на точный launcher.
Unknown/partial не заменять нулём. Данные должны переживать finalize и resume;
cleanup error хранить отдельно от исходной причины.

Отделить execution outcome от атрибуции. Не превращать код, отсутствующий
в списке infrastructure errors, автоматически в `subject`. Для reconciliation
без достаточного доказательства указывать `undetermined`; конкретный trusted
caller mismatch может подтверждать protocol violation. Схемы, report readers
и tests обновить согласованно. Не объявлять все fanout errors инфраструктурными.

Judge получает обязанности controller/subject и исходный launcher. Нельзя
штрафовать за исполнение требования stop-for-runner. Непройденные стадии
остаются not_applicable; нарушение нельзя превращать в успешный E2E.

## Реализация

`dd-flow-cli` beta.19 добавляет exact lifecycle-command matching для
`stage finish`, `stage pause`, `work finish` и `work fail`. Перед terminal
mutation CLI one-shot claims trusted PreToolUse receipt и сравнивает его
physical Session с running WorkSession. Несовпадение получает
`lifecycle_caller_mismatch`, сохраняет diagnostic receipt/timeline/audit и
не меняет Work, Stage, HITL или result. Controller-owned MERGE path остаётся
явным исключением; это не даёт child общей возможности обходить guard.

`dd-droid` теперь требует отдельный exact `work start` для productive Task:
Task с уже привязанным coordinator Work сообщает incomplete packet и не
исполняет terminal lifecycle. Runner ведёт baseline native child IDs на
границе Stage: cumulative transcript не выдаёт историческую волну за текущий
PLAN-REVIEW fanout. Terminal child observations остаются в retained receipt;
неизвестная terminal связь сохраняет reconciliation error, а не запускается
повторно и не получает догадочную привязку. Failure result сохраняет
boundaries, HITL, launcher, driver receipt и доступную statistics. Неизвестные
reconciliation ошибки получают attribution `undetermined`; final Judge прямо
инструктирован не считать stop-for-runner abandonment dispatch.

## Проверки: что именно подтверждено детерминированно

### T1. Негативный end-to-end тест ownership — выполнен

Реальный CLI и временная SQLite, fake native provider только вместо модели.
Через штатные bootstrap/hook/Work команды привязать PLAN к root R. Child C
имеет подтверждённую native parent edge R, но не имеет Work. C вызывает
тот же `stage finish`, который раньше был принят.

Ожидание: `lifecycle_caller_mismatch`; Work и WorkSession root всё ещё running,
стадия не done, acceptance result/boundary не созданы. Затем R выполняет ту
же разрешённую операцию со своим receipt — стадия успешно завершается один
раз. На исходном коде негативная часть обязана падать, потому что finish C
принимается. Только после зафиксированного red реализовывать F1.

Табличные варианты: SPECIFY/PROTOCOLIZE/PLAN finish; child stage pause;
отсутствующий/чужой project или RUN receipt; прежняя Session после разрешённого
handoff. Проверить текущего владельца и разрешённый same-ID resume, чтобы
guard не ломал легальный lifecycle. Историческую production SQLite не менять.

### T2. Детерминированный переход к review — покрыт stage-local regression

Воспроизвести сценарий через runner, настоящий flow CLI и scripted provider:

1. Root завершает ранние coordinator стадии легально; есть terminal native
   child с корректно завершённым отдельным Work из прошлой стадии.
2. PLAN-REVIEW launcher возвращает work_fanout; scripted root читает response
   и останавливает Turn ровно как в историческом прогоне.
3. Runner выполняет dispatch ровно один раз и возвращает exact ready Work
   packets той же coordinator Session.
4. Новые children выполняют start/finish своих Work через hooks.
5. Coordinator принимает review и завершает стадию. Исторический child
   остаётся привязан к прежнему Work, повторного запуска/settlement нет.

Проверять записи БД, реальные команды и результат, не наличие строк в source.
Дополнительная ветка с terminal unbound child должна остановиться в исходной
стадии с полной диагностикой; просто исключить его из observations нельзя.
Running child, ещё не сделавший check-in, не должен ложно считаться failed.
Существующие проверки reused Session, pending check и позднего terminal
обязаны остаться зелёными.

### T3. Failure evidence и ответственность — выполнен

После трёх captured boundaries и одного HITL искусственно вызвать failure
в scripted runner. В конечном Judge packet должны остаться те же boundary
hashes, HITL, Session, launcher и доступные usage/tool observations. Повторить
через stored-event recovery/finalize. Проверить unknown attribution для
неопределённой reconciliation error и независимое сохранение cleanup error.

Stop-for-runner не должен классифицироваться детерминированно как отказ
subject. Тест проверяет packet/contract; стабильность свободного ответа LLM
не выдаётся за unit-test гарантию. На текущем exception path сохранность
boundaries обязана дать red.

### T4. Живая приёмка после публикации — выполнена, scored gate не пройден

На новой private workspace и зафиксированных версиях выполнить bounded
Droid smoke через настоящие hooks: отдельный child Work start/finish,
отклонение child finish root и корректный root finish, затем PLAN-REVIEW
dispatch/reconcile. Проверить profile, physical identity, отсутствие дублей,
native settlement и удаление копий авторизации. Не использовать prompt как
единственное доказательство того, что запрещённая команда действительно
была вызвана: нужен native tool/hook receipt; если модель отказалась её
вызывать, негативная live-ветка не считается выполненной.

Затем новый scored E2E до MERGE с независимым Judge. Старый run и receipt
не переписывать и не продолжать ради получения pass. Новый провал отдельно
диагностировать; успешный unit test или Work smoke не заменяет этот gate.

Публикация проведена как `dd-flow` `0.9.0-beta.19` и Memory Bank `4.0.6`.
Живой negative/positive ownership probe подтвердил, что child не может
завершить root lifecycle, а root с новым trusted receipt может; дерево и
копии auth были убраны. Отдельный live stop-regression с реальным Droid
подтвердил закрытие Unix socket до подтверждения `daemon stop`.

Scored run `EVAL-20260906135233-403fab69` нельзя использовать для оценки
subject: CP-071 ошибочно подменил исходный проект уже реализованной версией
`f4d613d5`, одновременно обновляя flow pack. Код и активная Memory Bank
задавали Low/Medium/High, default Medium и read-only архив, тогда как скрытый
HITL fixture требовал четыре значения, default no_priority и исключение для
архивных задач. `required_hitl_missing` и Judge verdict сохранены как
исторические evidence, но атрибуция ошибки subject была необоснованной.
Кроме того, `daemon_stop_incomplete` относился к Codex Judge; Droid
stop-regression не доказывает исправление Codex cleanup.

Повторная квалификация использует CP-073: исходный commit `44939e9` из тега
`eval/cp-068-source`, отдельно наложенный flow pack 4.0.6 и engine beta.19.
CP-071 и прежние run receipts не переписываются.

Повтор CP-073 `EVAL-20260906193630-e4169daa` подтвердил собственные
`work start/finish` у пяти PLAN-REVIEW детей, трёх CODE детей и первого
repair ребёнка; native observation/reconciliation вернули `issues: []`.
Полный gate не пройден: далее обнаружены пересечение общей Vitest-БД с
параллельным eval и смена native profile десятого ребёнка на `kimi-k3`.
CODE-REVIEW и MERGE не достигнуты. Подробности и границы результата — в
[аудите CP-073](../runbooks/task-priority-baseline-audit-2026-09-06.md).

## Размещение тестов и порядок исполнения

- CLI: расширить `test/vnext-fanout-reconcile.test.ts` и
  `test/vnext-fanout-storage.test.ts`; ownership проверить интеграционно
  через существующий hook/lifecycle test setup, при необходимости отдельным
  `test/stage-lifecycle-ownership.test.ts`.
- Eval: использовать `test/fixtures/droid-native.mjs`, `test/droid-daemon.test.mjs`,
  runner test seams; добавить `test/runner-fanout-lifecycle.test.mjs` для T2/T3.
  Существующие string/source assertions в `test/eval.test.mjs` недостаточны.
- Общие guards проверить минимум с Droid и существующей Codex hook identity,
  а остальные поддерживаемые hook envelopes — текущими adapter tests.

Порядок: зафиксировать red T1/T3 → F1 → F2 → F3/T2 → F4/T3 → targeted tests →
CLI typecheck/lint/build/full tests и dd-eval full tests → канонические lint/
совместимость → нужные релизы и frozen engine → T4. Если для T4 сначала
использован local build, после выпуска нужен smoke опубликованного engine.
Live/полный E2E не включать в обычный `npm test`.

## Критерий готовности

Исправление подтверждено, когда чужой lifecycle отклоняется без изменения
Work/Stage, легальный Work/owner/resume сохраняет работоспособность, stop для
runner приводит к review dispatch, неизвестные дети не скрываются, а failure
сохраняет evidence без ложной атрибуции. Полная E2E-квалификация отдельно
требует прохождения нового прогона до MERGE.

Детерминированная часть готова после зелёных full checks CLI и eval,
канонического lint/compatibility, выпуска beta.19/Memory Bank 4.0.6 и
published-engine smoke. Полная E2E-квалификация всё ещё требует нового
scored прогона до MERGE с независимым Judge. Старый failed run остаётся
неизменяемым evidence и не является результатом этой проверки.
