# 046 — Инструкции controller, связанные с подтверждённым состоянием

Дата: 2026-09-21. Статус: реализовано в CLI `18e2627`; release/live qualification выполняется.

## Основание и границы

CP-127: EVAL-20260921091816-52de5f6f, engine beta.89.
После семи завершённых PLAN-REVIEW reviewer Work controller безусловно сообщил,
что rejected finish уже зарегистрировал repair, и потребовал закончить turn.
В native turn 09:55:05–09:55:47 UTC координатор прочитал результаты и последовал
этой инструкции. Stage finish не выполнялся. Неизменившийся children_settled
закончился fanout_stage_nonprogressing. Ошибка внесена f8c07677 в
dd-flow-cli/src/services/controller-fanout.ts:73.

Уточнение предыдущего расследования: PLAN-REVIEW исправляет принятые замечания
в том же coordinator Work, увеличивает revision и завершает review. Для этой
стадии не следует вводить CODE repair-child контракт. Шесть needs_changes —
reviewer evidence, а не готовое решение о terminal failure.

Цель: факты в runtime-подсказках соответствуют durable state; инструкции на
будущие условия явно условны; остановка turn имеет определённого следующего
владельца и исполнимое продолжение. Модель принимает семантические решения;
scope, идентификаторы, проверка receipts и выбор dispatch остаются кодом.
Не менять CP-127, не выполнять resume и не заменять исторические receipts.

## Аудит и классификация

1. controller-fanout.ts, nextControllerFanout: подтверждённый дефект общей
   children_settled ветки. Затрагивает все fanout-стадии. Исправить первым.
2. vnext-plan-review.ts, orchestratorPrompt/finishPlanReviewOwned: существующий
   контракт правильный — классифицировать findings, применить исправления к PLAN
   и aspect map в текущем Work, затем decision-file/finish. Защитить от перезаписи
   общей подсказкой и проверить revision/batch regeneration.
3. vnext-code.ts: semantic и aggregate repair responses, orchestratorPrompt.
   Утверждения о регистрации в responses выдаются после создания Work; это не
   подтверждённая копия CP-127. Проверить completed replay и инструкции после
   repair: fresh semantic verification обязательна.
4. vnext-code-review.ts: initial review, semantic repair, aggregate repair,
   повторный finish. Сохранить accepted decision; не требовать нового review
   после repair. Общий текст не должен превращать уже завершённый repair в
   требование ждать ещё одного ребёнка.
5. repair-intents.ts, isRegisteredRepair: проверяется существование исторического
   intent/Work и соответствие receipt, но внешний scope ограничен project/run.
   Current stage/attempt/cycle и состояние Work не входят в эту проверку.
   Это подтверждённое ограничение API; воспроизвести последствия до объявления
   отдельным runtime-дефектом. Историческая валидность не равна готовому handoff.
6. lifecycle-invocations.ts: callers isRegisteredRepair в fatal suppression,
   settleLifecycleRejection и retry_instruction. Повторная проверка установила:
   неретрайная correctable-ветка соответствует fresh_session_required; producer
   work-registry.ts/bindSession уже работает с существующим WorkRow. Поэтому
   отсутствие локального SELECT само по себе не дефект и не требует второго
   repair lookup. Это handoff обычного существующего Work, не обязательно repair.
   Сохранить различие и проверить scope/dispatch eligibility при передаче controller.
7. continuation-outcome.ts: исключает зарегистрированный repair из primary error.
   Проверить stale cycle, завершённый/failed repair и отсутствие legal successor.
8. controller-fanout.ts fingerprint и run-controller.ts retain/check: fingerprint
   содержит stage/parent/state/graph, но не вид задания. Уточнить соответствие
   semantic progress текущему attempt/cycle; не включать heartbeat/время/сырой
   текст, иначе защита будет обходиться инфраструктурными изменениями.
9. controllerStageEntryPrompt: остановка после work_fanout условна и обоснована
   передачей управления controller. Сохранить; тестировать отдельно от completion.
10. cli/help.ts и canon .memory-bank/dd-flow/{common/runtime-cli.md,
    common/runtime-contract.md,vnext/code.md,vnext/code-review.md,vnext/merge.md}:
    проверять условность и соответствие response contracts. Найденные CODE
    aggregate инструкции условны; массовая замена текста не нужна.
11. vnext-plan.ts: инструкция Follow next start command потенциально конфликтует
    с managed controller boundary. Проверить managed и standalone контексты,
    согласовать владельца перехода без запрета legitimate standalone workflow.
12. test/vnext-fanout-storage.test.ts, repair-continuation.test.ts,
    run-controller-stages.test.ts: есть dispatch/storage/repair coverage, но
    требуется явная регрессия обычного settled graph без зарегистрированного repair.

## P0. Воспроизводимое основание

- Сохранить компактные ссылки на CP-127 prompt, final message, timeline и graph;
  не копировать весь transcript и персональные provider данные в Git.
- Зафиксировать отсутствие repair и stage-finish в проблемном turn read-only
  запросом к receipts. Зафиксировать 7 завершённых reviewers и их verdicts.
- Сопоставить исходники beta.89 с текущими затрагиваемыми файлами.
- Снять список всех callers проверок repair и всех renderer-ов continuation;
  дополнить таблицу выше при нахождении иных веток.

## P1. Исправить обычное завершение fanout

- Удалить безусловное утверждение о rejected finish/registered repair.
- Для children_settled выдать задание продолжить семантику исходной стадии и
  выполнить её finish после подготовки обязательных JSON-файлов.
- PLAN-REVIEW: классификация всех material findings, коррекция PLAN/aspect map,
  revision и decision.json; без выдуманного child repair.
- CODE: verification по результатам исполнителей, затем finish.
- CODE-REVIEW: принятие decision либо завершение с уже принятой decision после
  repair. Не требовать повторения независимого review.
- Общее правило handoff только условное: если результат текущей команды
  подтверждает registered repair, закончить turn и передать dispatch controller.
- Ready/running repair продолжает обрабатываться существующими ветками graph.
  Не добавлять отдельный prompt только ради повторения known Work ID.

## P2. Разделить существование repair и право на продолжение

- Сохранить возможность проверить исторический receipt для идемпотентного replay.
- Ввести минимальную общую проверку применимости к текущему scope поверх уже
  существующих stageAttempt/stageCycle, stage-work membership и repair_intents.
- Результат проверки различает invalid/stale, pending dispatch, running,
  completed-needs-verification, failed/cancelled. Переиспользовать Work status;
  не хранить вторую копию состояния.
- Сопоставлять project/run/stage/attempt/cycle; generation брать из существующей
  authority там, где она требуется. Не требовать переписывать эти поля моделью.
- При отсутствии cycle в старом receipt использовать сохранённый intent payload;
  если доказательств недостаточно — явный compatibility outcome, не догадка.
- Использовать current applicability в controller/fatal suppression/handoff;
  historical existence оставить для чтения retained outcomes.
- Failed/cancelled child и stale receipt не должны подавлять primary failure.

## P3. Единое формирование инструкций и диагностики

- Небольшой typed action в существующем Decision: например semantic completion,
  graph creation, dispatch. Scope и action формирует код из существующего state.
- Общий helper только для повторяющегося registered-repair handoff текста,
  принимающий проверенный результат P2. Стадийная семантика остаётся в stage modules.
- Не создавать registry промптов, новую БД continuation или универсальный workflow DSL.
- В existing controller event/state сохранить action, scope, expected transition
  и ссылки на causal receipts. Не дублировать полный prompt во всех журналах.
- Fingerprint включает только факты, меняющие legal action: stage attempt/cycle,
  action и существующий graph revision. Проверить переход completed repair →
  verification без ослабления запрета на повтор неизменного действия.
- Если same-turn CLI отказ объясняет отсутствие прогресса — сохранить его primary
  code. Если CLI вызова не было — сообщить ожидавшееся действие и неизменный scope.
- Не объявлять такой случай «модель повторила команду»: это может быть отсутствие
  команды вследствие ошибочного задания.

## P4. Согласовать все публичные поверхности

- Проверить stage response instructions, lifecycle retry/recovery instructions,
  controller prompts и CLI help как единый контракт.
- В текстах различать «если команда вернёт» и «команда вернула»: второе допустимо
  только после проверки durable receipt в данном scope.
- Любое end-turn правило указывает реального следующего владельца: controller
  dispatch, user HITL, либо explicit blocker. Не обещать runnable child без Work.
- Согласовать managed stage boundary и standalone next-command рекомендации.
- Canon менять только при подтверждённом расхождении. Если изменён canon,
  обновить соответствующие schemas/manifest/version по действующему runbook и
  явно указать изменение flow inputs в новом checkpoint.
- JSON files остаются форматом семантических inputs; не возвращать heredoc,
  shell-сборку JSON или ручное копирование hashes/internal invocation IDs.

## P5. Регрессии

Использовать существующие fixtures и runner; без новых зависимостей.

1. PLAN-REVIEW: семь settled reviewer Work, needs_changes, repair отсутствует.
   Задание требует semantic completion, не утверждает регистрацию repair.
   Исправленный PLAN/revision/decision принимается; следующий этап достижим.
2. CODE: settled executors без repair → verification/finish.
3. CODE: semantic/aggregate failure → ровно один repair → fresh child → fresh
   verification → accepted finish. Retry/lost reply не создаёт второй Work.
4. CODE-REVIEW: accepted decision → repair → завершение с той же decision;
   aggregate repair не запускает новый независимый review.
5. Pending/running/completed/failed/cancelled repair: правильное действие для
   каждого состояния, без подмены completed состоянием pending.
6. Wrong project/run/stage/attempt/cycle и старый receipt после нового цикла:
   не разрешают handoff и не скрывают актуальную ошибку.
7. Исторический replay остаётся доступным, но не выдаёт нового разрешения.
8. Unchanged semantic turn без CLI call останавливается с action/scope evidence;
   correlated CLI failure сохраняется; heartbeat не считается прогрессом.
9. Fanout stage entry по-прежнему заканчивает entry turn; dispatch выполняется
   следующим controller решением. External и native delegation сохраняются.
10. Contract tests проверяют смысл action/expected outcome, а не snapshot всей
    строки. Небольшие assertions на ложное утверждение защищают конкретный CP-127.

Mock-provider integration доказывает wiring и состояния, но не понимание текста
моделью. Поэтому необходим один новый чистый Luna E2E после release; локальный
PASS не объявлять доказательством качества промпта в живом запуске.

## P6. Верификация и поставка

- Сначала focused regressions P5, typecheck/lint и build с точным canon.
- Полный release gate обязателен: изменяются controller и lifecycle authority.
  Использовать новую схему immutable candidate из плана 045.
- Коммиты по логическим частям: fix/contract, tests, docs; каждый итоговый набор
  согласован, временный обход no-progress guard запрещён.
- Published tuple и installed snapshot integrity проверить штатными средствами.
- Новый чистый checkpoint на базе CP-127: сохранить product inputs; engine и
  при необходимости flow pin менять явно. Старые runtime DB/runs не копировать.
- Preflight PASS до scored E2E. Мониторить actual stage и children/repair scope.
- Критерий live проверки: PLAN-REVIEW проходит classification/correction/finish;
  CODE и CODE-REVIEW корректно проходят свои verification/repair transitions.
  Если repair не возник в E2E, считать его live-путь непроверенным, опираться на
  deterministic regression, не заставлять модель искусственно создавать дефект.

## Готовность и ограничения

Порядок: P0 → P1/P2 → P3 → P4 → P5 → P6; регрессии пишутся вместе с исправлением.
План готов для реализации с обязательной проверкой перечисленных рисков P0/P2.
Единственная доказанная причина остановки CP-127 — ложная общая инструкция.
Остальные обнаруженные ограничения не выдаются за уже воспроизведённые аварии.
Работа считается законченной после code/tests/docs и честного отчёта о release
и live evidence; при инфраструктурном блокере сохранить точную причину.

## Повторная проверка готовности — 2026-09-21

### Уточнения архитектуры перед реализацией

- Не объединять fresh_session_required и repair_required в один repair-only
  validator: первый может относиться к обычному reviewer/executor Work.
- Использовать stageGraphScope/stageWorkIds из stage-work-graph.ts; не писать
  вторую реализацию определения attempt/cycle. stageCycle для PLAN-REVIEW пуст,
  для CODE-REVIEW initial, для merge source repair берётся из run variables.
- isRegisteredRepair вызывается в lifecycle-invocations.ts:295,306,546 и
  continuation-outcome.ts:17. Для каждого caller отдельно решить historical
  replay или current authority; глобальное ужесточение boolean недопустимо.
- completed repair остаётся доказательством разрешённого прошлого отказа.
  Он не должен автоматически превращать этот отказ в fatal при replay; при
  выборе следующего действия означает verification, а не новый dispatch.
- Проверку scope и чтение Work делать в согласованном snapshot/существующей
  транзакции. Перед мутацией действуют existing generation/ownership fences.
  Результат read-only проверки сам по себе не выдаёт dispatch authority.
- Сохранить порядок branches: failed/cancelled, ready, running, unresolved
  dependencies, semantic completion. Empty graph не приравнивать к успешной
  проверке: сохранить coordinator_required и stage-specific obligations.
- Не называть общее действие verification для PLAN-REVIEW: здесь требуется
  classification и коррекция плана. Typed action может быть общим
  semantic_completion; стадия определяет содержание.

### Совместимость состояния controller

- run-controller-state.ts хранит last_continuation как строку. Дополнительные
  диагностические поля вводить optional; чтение старого state должно работать.
- Изменение fingerprint не должно разрешать один лишний productive turn после
  restart. Определить совместимость старого fingerprint до dispatch; если его
  нельзя безопасно сопоставить, вернуть explicit compatibility/recovery reason.
- Повтор процесса после сохранения задания и до/после native prompt проверяется
  через существующие operation receipts: не отправлять уже выполненный prompt.
- Если action можно вывести из существующего graph без нового persistent field,
  предпочесть это; диагностическое событие не становится новой authority.

### Дополнения к тестам и областям аудита

- Добавить regression для fresh_session_required обычного Work без repair intent.
- Добавить completed repair + replay отказа: historical evidence принимается,
  controller выбирает verification, failed repair остаётся отдельным failure.
- Добавить controller restart со старым state/fingerprint и потерянным reply.
- Проверить zero-child/coordinator_required, stalled dependencies и смешанные
  completed/failed результаты: ложный semantic success невозможен.
- Проверить PLAN-REVIEW accepted_fix/rejected/deferred/requires_user, включая
  корректный HITL: одни needs_changes не предопределяют решение модели.
- Включить src/harness-runtime/lib/delegation-instructions.mjs: end-turn после
  dispatch wave законен только с передачей наблюдения controller; capacity refusal
  не должен утверждать запуск всех children. Это проверяемая смежная поверхность,
  не установленная причина CP-127.
- Включить vnext-merge.ts и controller MERGE boundary: source repair принадлежит
  своему циклу, завершённый MERGE turn не получает fanout-инструкцию другой стадии.
- Проверить work-registry.ts/recoveryPrompt: существующий текст требует наблюдать
  retained evidence и не повторять неизвестные эффекты; сохранить этот контракт.
- Проверить canon и curated project flow pack раздельно: изменение только canon
  не гарантирует изменение frozen project inputs следующего EVAL.

### Файлы реализации и критерии приёмки

Обязательные: controller-fanout.ts; его tests; run-controller.ts/state и tests
для action diagnostics/compatibility; repair-intents.ts и перечисленные callers
для разделения history/current; соответствующие repair/lifecycle tests.
Стадийные vnext-plan-review.ts, vnext-code.ts, vnext-code-review.ts, vnext-plan.ts,
vnext-merge.ts, delegation-instructions.mjs, CLI help и canon редактировать только
при выявленном противоречии; покрытие правильного существующего поведения достаточно.

Перед commit проверить: каждая factual фраза имеет producer/receipt; каждое
end-turn правило имеет следующего владельца; каждый consumer repair использует
нужную семантику history/current; все ошибочные и устаревшие scope покрыты;
no-progress защита не ослаблена; identities/hashes вычисляются кодом; нет новых
модельных административных обязанностей. В отчёте перечислить реально изменённые
файлы и результаты проверок, отдельно отметить непроверенные live ветки.

Итог повторной проверки: план готов к реализации. Полнота относится к проверенным
controller/fanout/lifecycle/repair/prompt путям, а не к обещанию отсутствия любых
дефектов во всей системе. Необоснованное подозрение на correctable-ветку уточнено;
план теперь явно защищает её правильный существующий контракт.

## Реализация

- Общая `children_settled` ветка теперь выдаёт typed
  `semantic_completion` и требует выполнить стадийное решение и фактический
  finish. Регистрация repair упоминается только как условие реального ответа
  `continuation.kind = repair_required`.
- PLAN-REVIEW, CODE и CODE-REVIEW получают разные краткие семантические задания;
  административные scope/id/hash по-прежнему формирует runtime.
- `fanout_stage_nonprogressing` сохраняет прежний fingerprint и stop guard для
  совместимости с retained controller state, но теперь сообщает ожидавшийся
  action. Таймеры и текст prompt не добавлены в fingerprint.
- Повторный аудит подтвердил, что stage/attempt/cycle membership и Work status
  уже являются текущей проекцией применимости repair. Исторический
  `isRegisteredRepair` нужен для идемпотентного replay и не используется как
  самостоятельное разрешение на dispatch. Поэтому второй repair-state helper и
  новая таблица не добавлялись.
- Тексты CODE/CODE-REVIEW о «уже зарегистрированном» repair остаются только в
  ответах после атомарного создания Work. Correctable `fresh_session_required`
  остаётся отдельным handoff существующего Work и не превращён в repair-only путь.
- Регрессии покрывают обычный settled graph для всех трёх fanout-стадий и
  отсутствие ложного repair-факта; существующие тесты сохраняют scoped repair,
  completed replay, cycle isolation и compatibility refusal.

Focused tests, typecheck, lint и strict-canon build прошли. Полный suite не
дублируется локально: immutable release gate выполняет release contracts,
четыре integration shard и runtime-sensitive suite на одних candidate bytes.
