# 072 — Повторный HITL и надёжный decision transport после CP-201

Статус: пакеты A/B/C/D реализованы 2026-10-08; пользователь выбрал создание
только `open`, закрытие отдельным обновлением. Финальные проверки зафиксированы
в implementation receipt. Новые EVAL, платные диагностические вызовы, публикация
engine и изменения исторических запусков этой задачей не выполняются.

Основание: [план 071](071-semantic-decisions-and-stop-after-plan.md) и
[приёмочный отчёт CP-201](../runbooks/plan-071-implementation-receipt.md).
Проверенные исходники: dd-flow-cli `src/services/lifecycle-invocations.ts`,
`stage-pause.ts`, `runs.ts`, `run-controller.ts`; dd-eval
`lib/semantic-decisions.mjs`, `hitl-coverage.mjs`, `runner.mjs`, канонический
пакет SPECIFY и соответствующие тесты. Это план исправления установленных
дефектов, не заявление о полном аудите всех репозиториев.

## 1. Цель и границы

1. Второй и последующие реальные вопросы в том же Stage/Work/attempt должны
   создавать новый HITL, а повторная доставка старого вызова — возвращать старую
   неизменную квитанцию. Одинаковый путь и даже одинаковый текст вопроса не
   делают разные HITL одним действием.
2. Ошибка optional decision API должна иметь пригодную для расследования
   диагностику и корректный ограниченный retry; после исчерпания допустимых
   повторов используется существующий native Judge.
3. Канонический пакет должен однозначно отвечать на выявленный Q-004 после
   согласования его смысла. Продукт исправляет Subject через flow, не мы.
4. Уже исправленную ошибку повторного чтения acceptance receipt сохранить
   закрытой регрессией; не реализовывать исправление заново.

Не меняем порог 0.93, семантику confidence, Judge-модель, правила завершения
`stop_after`, число обязательных HITL-раундов или реальные продуктовые файлы.
Не ослабляем native identity, generation fencing, immutable evidence или
проверку настоящего завершения Stage. Не превращаем `incomplete_subject_turn`
в успех. Не возобновляем CP-201 и не правим его DB/артефакты.

## 2. Реестр фактов и дефектов

| ID | Факт / системная причина | Статус и действие |
| --- | --- | --- |
| D1 | После успешного resume второй `stage pause` с тем же публичным argv выбирает settled invocation первого pause. `managedLifecycleCommand` не выдаёт следующий pause, native lookup может выбрать старый успех; CLI возвращает его до чтения нового вопроса. | Подтверждено. Пакет A: новая authority на границе успешного resume, отдельно от replay. |
| D2 | Старый канон определял default `open` и обновление `open/closed`, но не разрешение или запрет явного `closed` при создании. Q-004 обоснован. | Закрыто пакетом C после выбора пользователя: только open при создании, закрытие отдельным обновлением. |
| D3 | Три исходных ошибки JEV сохранены как `transport_or_response_invalid`; точная причина потеряна. Общий новый transport уже сохраняет фазу, но legacy `requestJev` ещё имеет такой catch. | Потеря исторических данных необратима. Пакет B: общий ограниченный transport и безопасная диагностика в обоих путях. |
| D4 | В общем catch `retryable = reason !== observation_lost`, поэтому невалидные JSON/модель/provider/question IDs тоже повторяются. Тест требует `true` для всех фаз. | Подтверждено. Пакет B: явная классификация, исправить тест ожидания. |
| D5 | Producer допускает `not_applicable` без checkpoint hash, а повторное чтение receipt раньше требовало это поле отдельно от полного checker. | Уже исправлено в PR 58. Пакет D: только проверить и сохранить регрессию. |
| D6 | Есть тест одного pause/resume, но нет всей managed-цепочки второго pause с тем же файлом после resume. | Подтверждено для проверенных тестов. Пакет A: один сквозной сценарий и необходимые варианты replay/crash. |
| D7 | Сквозной тест второго цикла выявил тот же класс ошибки в выдаче resume: answer-file исключён из fingerprint, поэтому новый принятый pause мог получить settled resume первого цикла. | Пакет A: выдавать resume authority на границе действительно нового принятого pause; exact replay не перевыдаёт её. Проверяется тем же двухцикловым сценарием. |
| D8 | При введении cycle link безопасный no-effect retry и recovery могли оставить ссылку на старую assignment/scope и заблокировать штатного преемника. | Пакет A: переносить authority только в доверенных retry/recovery writer-путях, сохраняя исходное доказательство resume. Unknown effects не получают преемника; отдельные регрессии. |
| D9 | Новый Stage attempt копирует прежний StageRunIndex и мог наследовать cycle link предыдущего attempt. | Пакет A: удалить прежнюю связь при выдаче нового attempt, с регрессией; same-attempt recovery сохраняет связь. |

CP-201: Judge-only `EVAL-20261007215922-3f305c54` и JEV
`EVAL-20261007221049-f5a5fbce` завершили SPECIFY; OpenAI Decisions
`EVAL-20261007222514-8f0a65c9` завершён с ошибкой после stale pause. Все cleanup
settled. Engine — beta.125, checkpoint commit
`b74ba81f88cbb2fe3b752eb4579baac6b2244d6a`.

В третьем запуске первый pause был в 22:28:21.738 UTC, resume —
22:29:22.758, новый native вызов pause — 22:30:58.194. В 22:31:02.458 CLI
успешно вернул старый HITL-001/Q001–Q003 вместо Q-004; новый pause не появился
в timeline. `incomplete_subject_turn` затем — следствие этого, не первопричина.

OpenAI Decisions вернул P(uncovered)=0.11, confidence=0.89; fallback при 0.93
правилен. Judge правильно классифицировал исходные Q001–Q003: Q-004 ещё не
входил в тот packet. Во всех трёх пилотах fast path не был принят. Нельзя
объявлять доказанными ни ускорение, ни ошибку Judge, ни конкретную сетевую
причину старых JEV failures. Отдельные успешные диагностические HTTP-вызовы
после запуска не заменяют утраченное scored evidence.

## 3. Пакет A — HITL authority по циклам в dd-flow-cli

### A1. Точка исправления и хранение

- Исправлять общий `resumeStageAfterUser` и lifecycle issuance/lookup, а не
  промпт Luna, Codex-адаптер или отдельный `vnext-specify`.
- При успешном managed resume выдать ровно одну новую `stage_pause` assignment
  для этого же Stage, Work, attempt и доказанного invocation scope. Публичная
  команда и `question-input.md` могут остаться прежними.
- Использовать существующие `lifecycle_invocations` и SQLite transaction.
  Связь хранить в существующем StageRunIndex как необязательный
  `hitl_continuation: { resumed_pause_id, work_id, attempt, pause_invocation_id,
  resume_invocation_id }`. Последнее поле — неизменная квитанция исходного
  resume, необходимая для доказательства цикла после смены recovery generation.
  Scope/generation/daemon/root и operation проверяются по связанной invocation;
  не дублировать их в новом реестре. Это локальная additive metadata, не новая
  таблица или изменение формата публичной команды.
- Связь заменяется только следующим успешным resume текущего pause. Наличие
  связи само по себе не даёт прав: проверить текущие Stage/Work/attempt, scope,
  статус invocation и runtime owner. При завершении/отмене Stage она не
  разрешает новые действия; при новом attempt прежняя ссылка не наследуется.
- Ранее выданный pause должен соответствовать действительно принятому HITL,
  а не просто быть «последней строкой». В managed-режиме отсутствие/конфликт
  этой связи — явная ошибка authority до продолжения, не новая произвольная
  issuance. Существующий unmanaged/manual resume без invocation scope сохранить.
- До первого resume поле `hitl_continuation` закономерно отсутствует. Его
  отсутствие не является ошибкой само по себе: первый принятый pause доказать
  по единственной settled pause invocation с соответствующим
  `outcome_json.result.pause.id`,
  Work/Stage и scope. После resume ссылка обязательна в новом managed цикле.
  Старый paused RUN без поля может проходить этот же доказанный путь; running
  RUN без linkage не ремонтировать автоматически угадыванием последнего HITL.
  Attempt брать из текущего StageRunIndex, включая существующий legacy default,
  и сохранять в linkage: одного scope generation для проверки attempt мало.
- Штатные no-effect retry и безопасная recovery атомарно переводят ссылку
  pause на выданного преемника только при точном совпадении старой ссылки,
  Work/attempt. Исходную resume квитанцию сохраняют и проверяют напрямую;
  scope её прежней generation не подменяют новым. Hooks, rendering и generic
  issuance не перемещают ссылку; unknown effect не получает преемника.

### A2. Транзакция и crash boundary

1. Прочитать/проверить prompt/question/answer и подготовить immutable answer
   до SQLite writer, как сейчас.
2. В общей транзакции перепроверить pause и Work, claim resume receipt,
   связать Session при необходимости, перевести Stage/Work в running,
   создать следующую pause invocation и записать `hitl_continuation`.
3. Только после commit вернуть continuation с authoritative pause command и
   метаданными его assignment, пригодными для существующей packet binding.
   Исходный stage prompt не переписывать.
4. Не делать fs/network/process inspection или provider dispatch внутри writer.
   Для необходимых проверок использовать уже подготовленные evidence и
   синхронные fenced DB-проверки. Проекции обновлять штатным afterCommit.

Rollback не оставляет resumed Stage без следующей assignment. Повтор того же
resume invocation возвращает сохранённый результат и ту же assignment, не
выдаёт третью. Успешный effect и неизвестный исход CLI после commit не равны:
при аварии между commit и settlement следующая assignment уже есть, но её
существование не доказывает успешную доставку resume. Не добавлять автоповтор
unknown operation: существующая recovery должна удержать dispatch и отобразить
неизвестный исход. После безопасного чтения/reconciliation не выдавать ещё одну
assignment. Проверить обе crash-границы тестом.

### A3. Разделение нового действия и replay

- Тот же explicit invocation ID или тот же native tool-call identity продолжает
  возвращать immutable прежний результат, даже когда новый pause уже выдан.
- Новый native tool call выбирает текущую выданную pause assignment, не старую
  settled. Старый ID не превращается в новый вследствие изменения файла.
- Для нового managed `stage_pause` без active assignment не разрешать
  fingerprint-only fallback на старый settled успех. Вернуть существующую
  ошибку missing assignment; не менять глобально replay всех lifecycle commands.
- `managedLifecycleCommand` при повторном rendering/status читает текущую
  assignment; read-only context никогда не выдаёт новую. Rendering не считается
  событием нового HITL. Helper для выдачи вызывается только разрешённым resume
  issuer, hooks только наблюдают.
- Новая question snapshot создаётся штатным `pauseStageForUser` при выполнении
  нового pause. Два разных вопроса и два одинаковых вопроса в разных циклах
  получают разные pause IDs и invocation IDs.
- Конкурирующие resume, stale generation, отмена, другой Work/Stage/attempt,
  root/daemon, чужой native child и несколько подходящих active assignments
  не дают новую authority. Не угадывать единственного владельца.

### A4. Все общие потребители

Пройти `stagePauseCommand`/resume/packet binding в SPECIFY, PROTOCOLIZE, PLAN,
PLAN-REVIEW, MERGE; проверить уже разрешённые CLI pause в CODE/CODE-REVIEW без
добавления новых обещаний в их prompts. Вывод continuation должен одинаково
работать через все managed harnesses. Повторно использовать общие lifecycle
тесты; не добавлять независимые решения для шести адаптеров.

### A5. Проверки и критерий готовности

- Сквозной managed admission: pause1 → answer1 → resume1 → запись Q2 в тот же
  путь → pause2 → answer2 → resume2 → успешный finish. Один Stage/Work/attempt,
  два реальных waiting/resumed события, разные IDs, точные bytes обоих вопросов
  и ответов. Не ограничиваться прямым вызовом service в обход native admission.
- Вариант с теми же bytes Q1/Q2 доказывает, что identity — цикл, не content hash.
- Повторный hook delivery старого tool call и explicit old ID возвращают старый
  результат. Новый tool call использует successor. Повтор resume/render/status
  не увеличивает число assignments.
- Проверить rollback до commit и сбой после commit до settlement; unknown не
  запускает новую модель, authority не размножается.
- Проверить fence/cancel/conflicting owner и ручной unmanaged путь, а также
  чтение старого StageRunIndex без нового поля. Historical evidence не менять.
- Typecheck/build и релевантные существующие lifecycle, Stage и controller
  тесты; release gates по правилам dd-flow обязательны перед выпуском.

## 4. Пакет B — общий bounded transport и retry в dd-eval

### B1. Минимальная структура

Выделить из двух HTTP-реализаций один небольшой bounded JSON transport helper:
native fetch, `observedTimeout`, AbortSignal, ограниченный streaming reader,
безопасные metadata. Codec/model identity остаются в plugins/legacy validator,
retry и durable attempts — у существующего generic owner. Legacy остаётся
single-shot с прежними admission/certificate/model-snapshot правилами.

Чтобы не создать circular import (`semantic-decisions` уже использует
`hitl-coverage`), helper не импортирует этих consumers; только stdlib и
существующий observation clock. Не добавлять SDK, сервис, новую очередь или
иерархию transport classes. Общие limits можно экспортировать из helper с
совместимым re-export из прежних модулей.

30 секунд — прежнее скользящее окно отсутствия HTTP-прогресса. Headers и
непустые body bytes сдвигают окно; timer ticks/empty chunks не считаются
прогрессом. Это не общий deadline на длительность запроса. Сохранить пределы
65 536 bytes входа/выхода, запрет redirect, отмену reader и освобождение timer
на каждом исходе. Не повторять запрос после внешней отмены.

### B2. Полная безопасная диагностика

Все попытки, включая early return, сохраняют reason/phase, известный
`http_status`, allowlisted `transport_code` или null, `latency_ms`, допустимый
Retry-After и retry disposition. Неизвестное — null, не фиктивный ноль.
Исторические observations без новых полей читаются как раньше.

Фазы: transport_failed, response_read_failed, response_missing,
response_json_invalid, response_schema_invalid, network_inactivity,
observation_lost; отдельно HTTP/hard_quota/input_limit/output_limit.
Schema/model/provider/question mismatch не маскировать под network.
Произвольный error.message, URL, headers, response body и секреты не писать.
Provider request ID хранить только по существующему bounded allowlist, если
он доступен. Fallback receipt сохраняет причины decision failures, а не только
последующий успешный результат Judge.

### B3. Принятая retry-политика

| Исход | Действие generic owner |
| --- | --- |
| HTTP 408/429/5xx без подтверждённой hard quota | Initial + максимум 2 retry, затем Judge. |
| Временный network/connect/read failure, inactivity | Те же ограниченные retry. |
| 401/403, прочие conclusive 4xx, hard quota, отсутствующий ключ/неподдерживаемый вход, output limit | Сразу Judge, без retry. |
| HTTP 200 с пустым/отсутствующим/невалидным JSON или schema/identity ответа | Сразу Judge. Не «перевыбирать» модельный ответ. |
| Подтверждённый постоянный TLS/certificate error | Сразу Judge. |
| Low confidence, refusal, tie или ответ uncovered | Штатная маршрутизация в Judge один раз; не retry ради другого verdict. |
| External cancellation | Отмена, без retry/fallback. |
| Observation lost / issued outcome unknown | Не повторять decision; retained unknown и только существующий fenced fallback при разрешённом ownership. |

Сетевые коды классифицируются явным конечным набором: ECONNRESET,
ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT,
UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT, UND_ERR_SOCKET — bounded retry;
certificate-коды из текущего allowlist — без retry. Неизвестная ошибка fetch
или чтения допускает только тот же bounded retry, но не schema/JSON ошибка.
ENOTFOUND не доказывает временность: это ограниченная best-effort политика,
не бесконечное ожидание исправления DNS.

Для non-200 transient headers повреждённый/пустой/oversized диагностический
body не должен превращать 503 в schema error или permanent 401 в retry.
Подтверждённая hard quota в доступном bounded body подавляет retry 429.
При HTTP 200 превышение response limit всегда без retry. Это precedence
проверить отдельно; не классифицировать исключительно по месту catch.

Сохранить существующий backoff 1 s / 3 s + jitter до 250 ms, Retry-After как
минимальную задержку. Если Retry-After > 10 s — сразу fallback с
`retry_after_limit`, не ждать сброса квоты. Будущий restart продолжает retained
budget/not_before, не начинает три вызова заново. Legacy owner не получает
retry автоматически от нового helper.

### B4. Совместимость и доказательства

- Новый helper включить в `semanticFingerprint`; после изменения реально
  затронутых зависимостей новые runs сохраняют новый fingerprint. Не менять
  fingerprint всего репозитория и не требовать повторной живой Judge
  квалификации из-за engine/transport/docs правок.
- У legacy не менять semantic projection, prompt, codec, model resolution,
  threshold или qualification key только из-за диагностических полей. Старые
  bytes/receipts не пересериализовать; сохранить прежний qualified verdict.
- Новые поля observations additive и optional для historical readers;
  verify/hash считаются по реально сохранённым bytes/объекту, не по
  синтетически дополненным старым observations. Profile@1/@2 и отключённый
  decision режим не требуют новых credentials или HTTP.
- Обновить тест, сейчас требующий retryable=true для всех phases. Добавить
  табличные fake-fetch cases для обеих providers и legacy; для shared transport
  достаточно одного набора streaming/abort тестов плюс codec-specific cases.
- Проверить 503→503→success, три transient failure→ровно один fallback;
  200 invalid JSON/schema/wrong identity→один decision call→один fallback;
  auth/quota/TLS/input/output; отсутствующее тело 200/503; Retry-After;
  cancellation во время headers/body/backoff; потерю owner/unknown dispatch;
  redaction и отсутствие secret/body во всех failures.
- Проверить, что deadline не возобновляется от пустых chunks, продуктивный
  stream может длиться дольше исходного окна, а нет сигнала — inactivity.
  Сохранять latency всех известных failures и неизвестность старых metrics.

## 5. Пакет C — полнота канона, без исправления продукта

### C1. Единственное обязательное решение пользователя

Как обрабатывать явное `state=closed` при создании задачи?

- A (рекомендация, минимальное расширение): создаём только `open`;
  отсутствующий state или `open` разрешены, `closed`/невалидное значение
  отклоняются без создания. Закрытие — отдельное обновление после создания.
- B: при создании разрешены `open` и `closed`, отсутствие даёт `open`;
  невалидное значение отклоняется без создания.

Решение пользователя 2026-10-08: выбран A («логично второе» в ответ на выбор
между разрешением closed при создании и созданием только open). Это продуктовый
выбор; исходный Q-004 остаётся обоснованным для прежнего канона. A/B не меняют
права на создание, архивное read-only правило и отдельно принятые ограничения
на priority. Точный API field брать из принятой case definition, не вводить
новый конкурентный атрибут со словом `state` из этого примера.

### C2. После согласования

- Изменить authoritative
  `cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/specify.json`;
  синхронизировать только связанные канонические packets/blueprints и corpus
  expectations через существующий процесс materialization/validation.
  Проверить, какие stages потребляют тот же полный dependency package.
- Новое предложение должно явно различать create/default/update, отказ без
  записи, active/archive и независимость priority/state. Нельзя запретить
  дополнительные обоснованные вопросы фразой «канон покрывает всё».
- В регрессии сохранить старый неоднозначный packet как negative Q-004 и
  выбранный новый канон как positive с буквальным evidence. Противоположная
  политика и независимый новый вопрос остаются uncovered. Не требовать
  угадывания политики из applicability/topic.
- Детерминированный oracle проверяет сохранённые Judge outputs/структуру и
  правильные expectations, но не заменяет проверку семантики новой модельной
  реакцией. Если требуется живая проверка квалификации — только затронутый
  case по существующей dependency policy, не весь corpus автоматически.
- Сохранить `max_rounds: 1`: негативный дополнительный вопрос должен давать
  честный EVAL outcome по policy, а не молчаливое продолжение. Два разрешённых
  HITL-цикла для engine проверить в отдельном managed тесте пакета A.
- Не патчить generated product, не переоценивать исходный Judge verdict и
  не делать новую qualification в рамках текущего планирования.

## 6. Пакет D — уже исправленное не регрессировать

`attachCaseAcceptance` теперь проверяет hash/case и повторно вычисляет полный
checker вместо несовместимого обязательного checkpoint field у
`not_applicable`. Сохранить тест `runner-recovery.test.mjs`: repeated finalize
failed-before-product-gate с recovery checkpoint возвращает тот же receipt;
самостоятельно изменённый и заново захешированный `passed` отвергается.
Не ослаблять applicable receipt bindings. Новое исправление здесь не нужно.

## 7. Порядок реализации и проверки

1. Создать обычные task branches/worktrees от актуального main обоих repos;
   сохранить пользовательские ahead commits и грязные файлы. Следовать
   [git workflow](../runbooks/git-workflow.md), никаких прямых main pushes.
2. Реализовать A с managed two-cycle regression. Реализовать B независимо;
   A/B не ждут продуктового выбора C.
3. Получить решение C1, внести canon/corpus delta и проверить зависимые
   materializations. Нельзя закрыть пакет C на основании собственной догадки.
4. Прогнать targeted tests и обязательные repo/release checks, провести diff
   review. Существующие fixtures/framework переиспользовать; платных вызовов
   для проверки этих branches не требуется.
5. Зафиксировать implementation receipt: refs, изменённые контракты,
   точные команды/результаты, remaining blockers. Коммиты/PR/squash по правилам
   проекта. Реализация разрешена пользователем; merge и release не входят в неё.

Runnable targeted проверки (при реализации, из соответствующего repo):

```sh
# dd-flow-cli
pnpm exec vitest run --project=integration-core-parallel test/lifecycle-invocations.test.ts
pnpm exec vitest run --project=integration-core-serial test/vnext-specify.test.ts
pnpm exec vitest run --project=integration-flow test/run-controller-stages.test.ts test/run-controller-full-cycle.test.ts
pnpm typecheck
pnpm build

# dd-eval
node --test --test-concurrency=1 test/semantic-decisions.test.mjs test/semantic-routing.test.mjs test/hitl-coverage.test.mjs test/hitl-coverage-transport-review.test.mjs test/runner-recovery.test.mjs test/hitl-corpus.test.mjs
```

Если новая регрессия размещена в соседнем существующем тесте, записать его
явно в receipt. Targeted PASS не заменяет обязательные release checks. До этого
в расследовании прошли 65 тестов semantic-decisions/semantic-routing/
runner-recovery; это baseline, не доказательство исправления A/B.

Новый engine release/checkpoint и новый scored SPECIFY — отдельная операционная
приёмка после реализации и разрешения пользователя. Старые runs остаются
terminal. Не менять установленный runtime живых EVAL. Для проверки D1 не нужны
шесть платных E2E; для доказательства ускорения нужны сопоставимые одинаковые
inputs и реально accepted decision route, чего CP-201 не дал. Полный E2E PASS
не следует из SPECIFY-only `finished`.

## 8. Чеклист завершения

- [x] A: текущий resume атомарно связан с единственным новым pause assignment.
- [x] A: реальный managed two-cycle, same-bytes, exact replay, rollback/unknown,
      cancellation/fences и общий continuation/packet binding проверены.
- [x] B: transport общий, bounded, без cycles/dependencies/секретов;
      диагностические поля есть на всех новых outcomes.
- [x] B: retry/fallback precedence соответствует таблице; budget и cancel
      сохраняются; legacy single-shot и historical receipts совместимы.
- [x] C: пользователь выбрал A/B; canon и зависимые expectations согласованы,
      отсутствует ручная правка generated product.
- [x] D: уже закрытая not_applicable receipt regression остаётся PASS.
- [x] Проверки/review/implementation receipt и коммиты/push выполнены по правилам;
      merge/release не входят в эту задачу.

Технические проверки и independent review выполнены; результаты и ограничения
зафиксированы в [implementation receipt](../runbooks/plan-072-implementation-receipt.md).
Task branches закоммичены и отправлены без merge/release. Пакет C закрыт после
выбора пользователя; операционная приёмка новым EVAL отдельно не выполнялась.

## 9. Проверка готовности и $ponytail

При уточнении плана дополнены: место хранения cycle link без новой DB; отдельное
правило нового native event и exact replay; атомарность resume/issuance и
unknown после commit; первый resume без linkage и проверка attempt;
manual/old-format compatibility; packet bindings;
неприемлемость hash файла как cycle identity; границы stage consumers; все
HTTP early returns; invalid-200/non-200 precedence; Retry-After и cancel;
shared-helper import graph; historical hashes/qualification scope; max_rounds
и продуктовый gate; точные targeted checks и раздельные критерии реализации,
операционного запуска и ускорения.

Ponytail: исправление A в существующем shared lifecycle owner, B — удаление
дублированного bounded HTTP-кода. Нет нового контроллера, отдельного retry
framework, SDK, benchmark платформы, глобальной пересертификации Judge,
ослабления контракта или настройки threshold ради PASS. Не выдаём новые права
из hooks/status, не обновляем все settled invocations и не скрываем настоящую
неполноту канона. Тестируем воспроизведённый корневой сбой, а не только happy path.

Вывод: технические решения A/B/D реализованы и проверены. Decision gate C
закрыт явным выбором пользователя и синхронизацией канона SPECIFY/PLAN.
Утраченная точная причина исторических JEV failures остаётся неизвестной:
новая диагностика предотвращает повторную потерю, но не восстанавливает прошлое.
