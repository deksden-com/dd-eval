# 082 — CP225: восстановление Work, lifecycle receipts и Judge

Статус: код реализован; финальная проверка и интеграция выполняются.
Дата: 2026-10-13.

## Цель и границы

Устранить доказанные причины остановки полного ZCode + Luna Decisions E2E
`EVAL-20261012204356-dcfa3cc2` на PLAN-REVIEW. Исправления общие для всех
упряжек; native различия остаются в адаптерах. Продукт вручную не исправляем.
Исторический EVAL, SQLite и recovery capture не меняем и не возобновляем.
Порог Decisions 0.7 и модели не меняются ради получения PASS.

Рабочая база реализации: актуальный origin/main каждого репозитория в отдельных
короткоживущих ветках. Первичный локальный main dd-eval отличается от origin;
его не сбрасывать. Реализация EVAL и план находятся в fix/082-judge-evidence.

## Доказанные факты

- Engine beta.133, source 43d88ec57e1b100fa29f31be925d6abfc976e7a2;
  bridge 0.46.7, ZCode 0.16.9. Baseline, SPECIFY, PROTOCOLIZE, PLAN завершены.
- WRK-004 start принят 21:18:20 UTC; native failure 21:19:49:
  model_request_failed, provider/unknown, stream/generic, SSE, retryable=false.
  Конкретный HTTP-код/overload не сохранён: не объявлять его установленным.
- WRK-005 завершён; WRK-004 согласован как failed 21:27:25. Новый ребёнок
  21:29:03 повторил старый work start без Work retry.
- observeLifecycleInvocation вернул старый event key settled invocation;
  ZCode receipt layer сравнил старую child identity с новой и выбросил
  hook_event_replay_mismatch. Это не коллизия хеша.
- Final Judge вернул run_validity=invalid. Разрешено
  valid/invalid_infrastructure_flow/contaminated. Детерминированный replay
  сохранённого ответа проходит при изменении только этого enum в памяти.
- Judge назвал open/closed выдуманным scope. Frozen canonical specify/plan
  явно требует open/closed по решению пользователя; assessment это не отражает.

Источники: CP225 RUN timeline, session-4/adapter.events.jsonl orders 251,
474–481; hook_events/lifecycle_invocations в execution db.sqlite; native
message ZCode child c4538916; judge/events.jsonl, candidate/assessment/evidence.
При создании регрессий вырезать минимальные обезличенные данные, без ключей,
домашнего дерева, копии полной БД и полного миллионного Judge transcript.

## A. Разделить повтор доставки и чтение результата

Файлы: dd-flow-cli src/services/lifecycle-invocations.ts, hooks.ts;
все четыре callers observeLifecycleInvocation: Codex, ZCode, Grok,
общий native ingress. Проверить cli/run-cli.ts admission/claim/return.

1. Дополнить внутренний результат observeLifecycleInvocation явным смыслом:
   новая observation, тот же native call/доставка, чтение settled outcome.
   Не строить отдельную подсистему или публичный универсальный framework.
2. Для settled read сохранить исходные event/identity/outcome неизменными;
   разрешить возврат результата после существующих проверок owner/scope/target.
   Не выдавать право нового исполнения. Не сравнивать новую session как
   повтор доставки старого события. Если новая observation сохраняется,
   её ключ принадлежит текущему tool call, связь с исходным outcome отдельная.
3. Same-call replay по-прежнему проверяет identity; cross-transport
   corroboration не подменяет первую квитанцию. Проверки чужого RUN,
   поколения, parent/daemon/команды не ослаблять.
4. Состояния issued/observed/executing/settled/expired различать, не считать
   любой duplicate разрешённым settled read. Не расширять новый enum
   механически на непроверенные состояния.

Проверки: два ребёнка с разными tool IDs читают один settled start без
второго dispatch; настоящий same-event identity mismatch отклонён; transport
corroboration работает; чужой owner/generation/target отклонён; executing
outcome не объявляется готовым; повторная доставка после crash не мутирует
исходную receipt. Сценарии через реальные handlers, не только helper.

## B. Восстановление Work — runtime authority, не догадка координатора

Файлы: controller-fanout.ts, run-controller.ts, work-registry.ts,
lifecycle-invocations.ts; CLI work retry и общие delegation prompts.

Дополнительный подтверждённый дефект: retryWork переводит failed→created,
но workStartCommand/managedLifecycleCommand по прежнему scope/fingerprint
может вернуть старую settled start authority. Поэтому одной инструкции
«сначала work retry» недостаточно.

1. Использовать существующий retryWork и архив попыток, не параллельный
   repair engine. Для новой попытки выдавать новую start invocation через
   существующие issuance/successor primitives после проверки их ограничений.
   Стабильная связь Work attempt → start authority обязательна: repeated
   rendering одной попытки возвращает тот же ID, следующая — новый.
2. Retry transition crash-safe: архив прошлого результата, CAS состояния и
   выдача следующей authority должны быть восстанавливаемы. Не проводить
   filesystem/process/model calls внутри SQL write transaction. При crash
   между reset и issuance повторная подготовка не создаёт несколько authority.
3. Fanout возвращает конкретную runtime-issued операцию либо blocker.
   После failed/cancelled нельзя выдать прежний child assignment как retry.
   Координатор выполняет только разрешённую операцию и заканчивает Turn;
   controller затем выдаёт свежий packet/child. Не давать модели создавать IDs.
4. Не автоматически повторять unknown provider error. Для этого случая
   default — evidence-backed blocker; scoped retry возможен лишь после
   принятого runtime решения и проверки эффектов. Для доказанного overload
   использовать имеющуюся same-session continuation policy: два отказа
   продолжения за скользящие 120 секунд; quota terminal с reset time, если есть.
5. Не закрывать/повторять здоровых siblings, не освобождать dependencies на
   основании failure. readinessBlockers уже требует completed — сохранить.
   Исправить misleading work_dependency_unblocked: сейчас settle сообщает
   completed_dependency=failed Work для всех глобально ready Works.
   Событие должно сообщать реальную причинную разблокировку, не фиктивную.

Проверки: failed→retry→fresh child с новым work_session и новым invocation;
старый start возвращает только исторический outcome; concurrent retry CAS;
crash/archive/reset/issuance replay; failed dependency остаётся blocked;
completed sibling не перезапускается; unknown/cancel/quota не превращается
в overload; overload continuation сохраняет Work и native session.

## C. Native failure без потери атрибуции

Проверить ZCode source failure-classifier и native persisted message, bridge
extensions/topology, dd-zcode child inspection, shared controller child type,
reconciliation receipt и аналогичные Codex/AGY/Grok пути.

1. Переносить существующие структурированные terminal error поля:
   native session/turn, observed time, provider/model, code, attribution,
   phase, retryable, HTTP/reset metadata только если реально сохранены.
   vnext-fanout.ts уже принимает provider_error/terminal_turn_id, но failed
   Work receipt в reconcileVnextFanout их теряет: добавить безопасные поля
   или явную ссылку на retained evidence в существующий failure contract.
   dd-eval failureDiagnostic тоже отбрасывает ZCode attribution scalars:
   проверить весь путь native → adapter → Work → executionEvidence → Judge.
2. Читать retained evidence без load/resume закрытой session. Сохранить
   отсутствие данных как unknown, отсутствие retryable как неизвестность,
   а не false/true по умолчанию. Удалить raw secrets/headers/body из diagnostics.
3. Если текущий native API не отдаёт error, минимальный read-only bridge
   endpoint возвращает bounded terminal metadata из существующей storage,
   с exact native identity. Не копировать всю native БД в dd-flow.
4. Проверить child directories pagination: retainedSubagents сейчас не
   передаёт endedCursor, тогда как dd-zcode его отправляет. Исправить forwarding
   после проверки актуального installed 0.46.7 source; >20 children обязаны
   перечисляться без ложной полноты и без открытия закрытых residents.

Проверки: real CP225 unknown stream fixture; overload/quota/cancel;
отсутствующий/чужой terminal metadata; >20 ended children; sanitization;
закрытая session не становится resident. Source ZCode не менять без
доказательства upstream причины: generic provider failure сам по себе
не доказывает дефект классификации внутри упряжки.

## D. EVAL attribution и Judge contract

Файлы: dd-eval runner.mjs isInfrastructureFailure, finalJudgePrompt,
validateJudgeResult; schemas/judge-result.v2.schema.json; supplement path.

1. Из общего contract/schema брать run_validity и severity enums для prompt
   и validator. Сохранить существующий формат @2, не вводить новый protocol.
   Прописать valid/invalid_infrastructure_flow/contaminated и все severity.
2. Validation error должен иметь field/actual/allowed, без всего ответа.
   Не исправлять enum автоматически и не скрывать invalid output под PASS.
3. hook_event_replay_mismatch отсутствует в isInfrastructureFailure.
   Не добавлять безусловную классификацию по одному коду: он может означать
   настоящее нарушение identity. Runtime должен сохранять проверенные факты
   settled-read/current-call/original-receipt и disposition; классифицировать
   доказанный owned ingress defect как инфраструктуру, неизвестный конфликт
   оставлять undetermined. Проверить родственные ingress codes. Текст Subject
   не является authority для attribution.
4. Candidate run validity остаётся отдельным от semantic Subject scores.
   Аудит supplemental Judge использует тот же contract и scope.

Проверки: сохранённый Final Judge output отвергается с точным полем;
исправленный enum в памяти проходит; все enum values и плохие значения;
обычный и supplement prompts содержат полный контракт; CP225 failure
даёт infrastructure validity, не product failure; чужие/неподтверждённые
attribution claims не превращаются в инфраструктурные автоматически.

## E. Канонический scope, rubric и acceptance согласованы

1. Обновить authored assessment для минимального open/closed: default open,
   create rejects closed, explicit close/reopen в active project для owner/member,
   сохранение независимого priority, archived state read-only. Не путать
   со task archive, отдельным workflow или дополнительными индикаторами.
2. Проверить по всем стадиям task input, specify/plan canon, requirement/AC,
   golden/risk, qualification corpus, acceptance checks и Judge tests.
   Не требовать фиксированной нумерации R/AC: оценивать принятые обязательства.
3. В Judge prompt отделить rubric (критерии качества) от frozen accepted
   requirements (содержание задачи). Отсутствие требования в кратком rubric
   не доказывает invented scope. Проверять соответствие каноническому ответу
   и downstream preservation; пакет не может менять schema/allowed reads.
4. Mechanical audit проверяет наличие связанного authoritative packet,
   а не семантику keyword regex. Semantic regression использует сохранённый
   erroneous finding как отрицательный пример. Историческую оценку не менять.

Проверки: open/closed разрешён и обязателен, task archive запрещён;
архивный priority-only exception не разрешает state edits; canon-added scope
не blame Subject; неподтверждённое расширение остаётся находкой; Decisions
confidence не является доказательством корректности.

## Порядок, gates и приёмка

1. Минимальные регрессии A/B на engine, C на bridge только если нужен контракт;
   затем реализация общих точек. Перепроверить findings внешнего аудита.
2. D/E — dd-eval отдельным согласованным изменением; replay сохранённых
   ответов локально, без повторной полной живой qualification из-за docs/oracle.
3. Engine typecheck/build/lint, затронутые suites и release-policy gates;
   bridge build/typecheck/tests и patch inventory если изменён; EVAL tests,
   schema/prompt/fixture consistency. Не увеличивать fixed timeout как fix.
4. Review diff и cross-repository commits; PR/commit/push/merge по runbooks/
   git-workflow.md только при реализации/соответствующей авторизации.
5. Выпустить новый неизменный engine, при необходимости bridge; обновить pins
   и оба Codex homes hooks штатно, не менять CP225 runtime. Точные artifacts
   и checksum readback, минимальные affected compat checks.
6. Новая scored full E2E в отдельном home: ZCode GLM-5.3-Flash/max,
   Luna Decisions 0.7, Judge gpt-6.1-sol/high, без stop_after. Запуск отдельным
   следующим действием, не часть текущей задачи составления плана.
7. Приёмка runtime: baseline PASS, PLAN-REVIEW все applicable Works приняты,
   корректный retry при инъецированном failure, затем CODE/REVIEW/MERGE и
   валидный Final Judge. Product score может быть низким: это не разрешение
   чинить продукт вручную. При новом blocker сохранить evidence и остановиться.
   Cleanup daemon/DB по ownership и runbooks; не broad prune.

## Проверка ponytail и готовность

- Используются retryWork, issuance, receipts и существующие suites; новых
  зависимостей/framework/очереди нет. Полезная identity гарантия сохранена.
- Реализация обязана доказать crash-safe новую Work authority, а не просто
  убрать assert. Все callers общего observation результата перечислены.
- Unknown первичная provider причина честно остаётся unknown; инфраструктурный
  fallback не подменяется бесконечным retry или догадкой модели.
- До merge сверить native metadata/pagination с pinned bridge source; это
  проверяемая implementation gate, не разрешение на speculative ZCode patch.
- Код и исторические EVAL не изменены этой плановой задачей.

## Уточнения повторной проверки готовности

При реализации дополнительно проверен реальный CP225: native message завершено
1791839989041, child topology — 1791839989050. Эти timestamps не обязаны быть
равны. Реализованный retainedTerminal использует exact child session и
native startedAt/endedAt; выбирает единственный последний completed assistant
в этом интервале с error и anchor.turnId. Новый успешный ответ, равные ambiguous
timestamps, чужой turn или данные вне интервала дают unavailable, не ближайшую
догадку. Adapter проверяет echoed lifetime и native completion внутри него.
Второе дополнение: новая Work попытка получает не только новый start, но и
новые finish/fail authority; старые issued settlement команды истекают при
retry CAS, observed/executing блокируют retry, settled история сохраняется.

Эта секция конкретизирует A–E; при разночтении действует она.

### 1. Точный admission результат

Внутренний disposition: admitted, replay, settled_read, in_flight, expired.
Отдельно вернуть current_event_key и authoritative_event_key; authoritative
может отсутствовать у expired до первой observation. Не создавать фиктивную
persisted receipt только ради заполнения поля. Все ingress callers используют
disposition, а не выводят observed из локального inserted=false.

- admitted/replay: текущая receipt есть, same-call immutable facts проверены;
- settled_read: исходный outcome возвращается без нового dispatch; текущий
  tool call не объявляется первой receipt и не получает её native identity;
- in_flight: только наблюдение существующей операции, не результат и не retry;
- expired: структурированный no-effect/unknown эффект по retained facts,
  без автоматической новой authority и без success из-за duplicate=true.

Settled read не может перепривязать уже выполненный Work к новой session.
При смене поколения старый результат доступен только исторически, не как
разрешение mutation в новом поколении. Поддержать old receipts с отсутствующим
новым disposition: выводить состояние из retained invocation, не из поля модели.

### 2. Новая Work authority и crash boundary

retryLifecycleInvocationCommand разрешён только executing операции; его
нельзя вызывать для успешно settled старого work_start. Для нового Work
использовать issueLifecycleInvocation в короткой транзакции завершения retry.
Сохранить в works nullable ссылку current_start_invocation_id: additive migration,
unmanaged Work оставляет null. Эту ссылку проверять против Work/RUN/owner scope,
никогда не принимать ID из model result. Первичная подготовка managed start
и retry используют один проверенный helper привязки.

После публикации архива: в одной SQL transaction CAS failed→created,
создание ровно одной новой start authority и запись ссылки в Work. Повторное
выполнение journal после crash при created читает ссылку, не выдаёт ещё одну.
workStartCommand при managed Work рендерит эту authority явно, а не выбирает
успешный старый start по одному fingerprint. Не менять RUN generation.
Если authority scope перестал принадлежать текущему controller, остановить
подготовку и пройти существующий recovery barrier, не перепривязать silently.

Восстановление legacy created Work без ссылки: создать её при первом
контролируемом dispatch; running/failed/completed legacy Work не переиздавать
по одному отсутствующему полю. Старую authority/результат сохранить.
Транзакция не содержит fs, subprocess, await; journal cleanup после commit.
Два concurrent retry: один CAS побеждает, второй читает тот же transition
или получает conflict; никогда не создаёт следующую третью попытку.

Архивировать все attempt-local start/context/result artifacts, включая
result-input.json, если существует, а не только три старых имени. Frozen
review inputs остаются общими; старые start response/work_session остаются
историческими. Новому ребёнку нельзя принять leftover result предыдущего.

### 3. Восстановление: принятое решение, не новый retry policy

CP225 unknown + retryable=false — blocker с сохранённой ошибкой, без
автоматического fresh-child retry. Cancelled тоже не превращать в failed
ради retryWork. Product/check failure использует уже зарегистрированный
repair contract, а не повтор ревью целиком. Overload — существующая доказанная
same-session continuation, без нового Work attempt; quota — terminal.

Для явного разрешённого scoped Work retry runtime выполняет transition,
потом dispatch свежего assignment. Если coordinator должен выбрать semantic
repair/block, ему выдаётся только текущий допустимый contract; свободный текст
«choose legal retry» без executable authority удаляется. До окончания native
tree/check settlement новую попытку не выдавать. Pending внешние эффекты —
reconciliation blocker, а не no_effect по отсутствию result-файла.

Прогресс после успешного продолжения сбрасывает capacity refusal window;
две доставки одной terminal turn не считаются двумя отказами. Не расширять
Codex-specific overload classifier на другие упряжки по похожему сообщению.

### 4. Native evidence и pagination — точный минимальный путь

Сначала читать существующий native terminal message через bounded read API;
выбирать по exact child session + native child lifetime + terminal turn,
не последний assistant вообще. Проецировать code и attribution source/reason/errorPhase/
exceptionKind/providerId/modelId/providerKind/transport/retryable; optional
statusCode/retry/reset только с native provenance. Свободный текст сообщения,
headers/body не переносить; retryable=false отличать от отсутствия значения.
Отсутствующий turn/evidence означает unassessable, не permission to resume.

Новый bridge endpoint не нужен, если текущий read передаёт эти поля. Для
нерезидентных детей использовать retained storage path без load/resume.
Изменение bridge допускается только если этот contract отсутствует; release
bridge тогда обязателен. pinned source сверить по commit636b1418, не по имени
локальной папки 0.46.7: её содержимое само по себе не proof установленного кода.

Для pagination передать только документированный endedCursor; exact root
session проверять на каждой странице. Повтор cursor, revision drift, mismatch
total или конфликт child outcome — incomplete observation, не false settlement.
Нет необходимости менять native ZCode provider classifier при unknown error.

Допроверено на установленном CP223 tarball 0.46.7: реализация находится
в dist/handlers/harness.js, а не extensions.js. retainedSubagents вызывает
session/subagents только с sessionId и теряет endedCursor. Native server
server-operations.ts явно принимает params.endedCursor. Pagination defect
подтверждён на installed bytes; это не только риск текущего source checkout.
Исправление forwarding обязательно в bridge, с отдельным >20-child тестом.

### 5. Judge и смысловая проверка без ложных гарантий

Schema @2 — SSOT enum. Prompt/validator читают те же перечисления; diagnostics
для missing/тип/enum содержит JSON field path и bounded actual, не transcript.
Не вводить repair-цикл для invalid Judge и не автоматизировать invalid→enum.

Authored rubric описывает качество; выданные frozen канонические ответы
определяют принятое содержание. Draft/proposal или невыданная fixture не
authority. Проверять stage/pause, response IDs, actual issued bytes/hash и
разрешённый evidence path; supplemental packet не может отменить canon.
Если author inputs противоречат друг другу — evaluator-definition finding,
а не обвинение Subject и не молчаливый выбор удобного источника.

Детерминированная проверка prompt/evidence доказывает лишь правильную передачу
authority, не гарантирует будущий смысловой ответ модели. Сохранённая ложная
находка служит regression case для живой итоговой проверки; не выдавать keyword
assert за semantic oracle. Не менять исторические оценки или qualification.

### 6. Приёмка, границы и обязательные дополнительные сценарии

Fault injection — отдельный integration test home, не вмешательство в scored
EVAL. Новый live full E2E запускается без искусственной ошибки. CP225 unknown
failure обязан корректно остановиться; это отдельная успешная проверка политики,
не требование любой ценой пройти MERGE вопреки non-retryable отказу провайдера.

Добавить crash после commit до journal cleanup, stale current_start reference,
новое controller поколение, delayed old child event после retry, старый result
после нового start, executing race, cancelled sibling и повтор native terminal.
Late old child не меняет новую попытку и не завершает её через старую session.
На genuinely foreign replay сохранить отказ и undetermined attribution.

Реализация завершена при зелёных affected/release gates и review. Release,
обновление установок и live E2E — явно отдельная операционная фаза с разрешением
пользователя. Не создавать heartbeat и не менять исторические runs автоматически.
