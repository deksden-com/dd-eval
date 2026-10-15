# 089 — Единая ограниченная серия повторов при перегрузке провайдера

Дата: 2026-10-15. Статус: реализован и проверен; результаты и ограничения —
в [отчёте реализации](089-implementation-report.md).
Ponytail: full. Исправляем FLOW/адаптеры/EVAL, не оцениваемый продукт.

## 1. Цель и границы

Для каждой отдельной операции: основной запрос и максимум два дополнительных
повтора при подтверждённой временной перегрузке. Успех закрывает серию; следующая
перегрузка получает новый бюджет. После трёх неудачных попыток обязательная
операция завершается provider_unavailable. Optional decision после своей серии
передаёт задачу classic Judge. Никаких повторов через product-repair/new Session.

Одинаковы семантика, бюджет и диагностика. Различаются только доказательства
native outcome и способ продолжения: Session prompt, child follow-up или HTTP.
Все поддерживаемые упряжки: Codex, OpenCode, AGY, ZCode, Grok, Droid; все их
реально доступные роли, а не невозможные комбинации native delegation.

Новые EVAL, release, установка engine/bridge/hooks и изменение живых RUN не входят
в реализацию этого плана без отдельного поручения. Старые ошибки/receipts не менять.

Audit base: dd-flow-cli c1a9786d04e0944daac204e1c767414904d9ced2 (beta.138),
dd-eval 5ef9a95. Перед реализацией проверить актуальные origin/main и изменения
inventory; исторически расходящиеся local main не сбрасывать.

## 2. Факты и дефекты

Пути engine ниже относительно dd-flow-cli, EVAL — dd-eval.

| ID | Подтверждённое место | Дефект / последствие |
| --- | --- | --- |
| D1 | engine src/harness-runtime/lib/codex-capacity-policy.mjs:85; src/services/codex-capacity.ts:258 | Два отказа продолжений за 120 секунд вместо ограничения серии. Медленные отказы допускают неограниченное число продолжений. |
| D2 | engine src/services/run-controller.ts:583; external-work-launch.ts:168; merge-server.ts:114; run-controller-recovery.ts:182 | Владельцы подключают recovery только по whitelist Codex/OpenCode. |
| D3 | engine src/harness-runtime/lib/dd-agy.mjs:15; dd-zcode.mjs:221,286; dd-droid.mjs:363 | Нет общей категории/доказательства overload у AGY, ACP ZCode/Grok и Droid. Generic error обходит политику. |
| D4 | engine src/services/run-controller.ts:767,788,795,841; vnext-fanout.ts:253 | Native child поддержан только Codex; история по Session очищается при смене стадии, но не закрывается явно после успешного продолжения. |
| D5 | EVAL lib/runner.mjs:2805,2885,3124,3678 | Judge/qualification/probe активируют продолжение только для Codex. Нормализация OpenCode уже есть, но gate её не допускает. |
| D6 | EVAL lib/hitl-coverage.mjs:96,131; lib/runner.mjs:2936,2952,4146 | Достижимые legacy JEV coverage/calibration выполняют один HTTP-вызов, обходя existing bounded semantic executor. |
| D7 | engine src/services/memory-init-native-capacity.ts:175 | Техническая startup-проба вызывает prompt напрямую; overload не получает общую серию. |
| D8 | engine run-recovery-guard.ts:49, run-recovery-runtime.ts:91; EVAL lib/capacity-policy.mjs:55 | Recovery admission и загрузчик фиксируют старый burst-контракт. Замены одного helper недостаточно. |
| D9 | engine test/codex-capacity.test.ts:380; EVAL test/judge-capacity.test.mjs:288 | Тесты специально разрешают длинные серии медленных отказов; нет единой owner/adapter contract-матрицы. |
| D10 | engine test/fixtures/codex-native-overload.mjs:55 | Installed fixture отключает native retries; не доказывает поведение с обычными native retries. Внутренние сетевые попытки и наши продолжения сейчас не образуют общий наблюдаемый бюджет. |
| D11 | EVAL lib/semantic-decisions.mjs:290 | Современный HTTP-путь ограничен, но имеет отдельные 1s/3s delays и Retry-After ceiling 10s; нужно согласовать с общей политикой, сохранив fallback. |

Последние CP230 Luna/AGY не доказывают отсутствие retries. AGY
EVAL-20261015071713-6e8e94d6: baseline PASS, отказ Codex Judge; attempts=3,
две continuation refusal с интервалом 20775ms. Luna
EVAL-20261015071953-a29d790a: отказ Subject по тому же burst-правилу.
Замена правила не обещает успех при фактической аварии провайдера.

Полезное существующее поведение сохранить: root получает новый operation ID
для каждого нового prompt (run-controller.ts:549), успех завершает executor,
pending_capacity очищается (:641); intent сохраняется до ожидания/отправки;
неизвестный исход восстанавливается наблюдением, не повторным dispatch.

## 3. Решения политики — приняты для реализации

### 3.1. Бюджет и время

- policy ID: provider-overload-episode@1; default max_retries=2, total attempts=3.
- Это число внешних попыток владельца задачи, не обещание ровно трёх HTTP-запросов
  внутри закрытого native клиента. Отдельно учитывать известные native attempts.
- Первый backoff 5000ms, второй 15000ms; jitter 0..250ms на каждый.
  Общая pure-функция принимает clock/random для детерминированных тестов.
- Retry-After (секунды или HTTP date) задаёт минимум задержки. Если рассчитанное
  ожидание больше 30000ms — не повторять раньше срока и не ждать часами:
  mandatory provider_unavailable/retry_after_exceeds_budget, optional Judge fallback.
  Сохранить suggested_retry_at, фактический счёт attempts и причину раннего выхода.
- Невалидный/отрицательный Retry-After не становится нулём: typed metadata error,
  без нового dispatch; optional decision — fallback с причиной.
- Плановый backoff не доказывает прогресс модели и не обнуляет inactivity clock.
  Использовать существующий явный waiting/suspension contract для ожидания, не
  добавлять heartbeat-байты как productive progress. Проверить owner lease во время
  ожидания, не держать SQL transaction или provider permit.
- Существующий явно заданный semantic max_retries=0..2 сохраняется как намеренное
  уменьшение бюджета; default=2. Более двух не разрешать. Новых knobs не вводить.

### 3.2. Какие ошибки допускают серию

Общая нормализация возвращает category и факты, а не boolean retryable:
provider_overloaded; provider_quota_exhausted; provider_rate_limited;
provider_limit_unknown; provider_account/auth; provider_failed; outcome_unknown.

Overload — известный структурный native code/serverOverloaded, документированный
capacity status, HTTP503 от самого модельного вызова либо проверенная native
сигнатура. Не искать слово overload в пользовательском prompt/tool output.
Quota/billing/auth имеют приоритет над общим 503/text match. Неизвестный429 не
превращать в overload. Soft rate limit допускает ту же bounded policy только при
доказанном временном ограничении и Retry-After; unknown429 останавливать отдельно.

Agent continuation разрешена только после подтверждённого terminal failed Turn,
с точными Session/Turn/operation identities, остановленным native retry, settled
tools/owned tree и актуальными Work/Stage/generation/owner. Если API не даёт Turn ID,
использовать его достоверный request/execution ID; не синтезировать native evidence.
Неполное доказательство => observation/reconciliation error, не разрешение повтора.
Промежуточный willRetry/retry_state — не новый наш отказ; дождаться native результата.
Остаются прежние harness/provider/model/reasoning и Session. Перегрузка не разрешает
скрытую замену модели или понижение reasoning. Native retry без новых сигналов
контролируется существующим sliding inactivity mechanism, не новым wall-time cap.

Transport loss, timeout, lost publication, malformed success, hook/storage/ownership
errors не становятся перегрузкой. Существующие stateless transport retries можно
сохранить с тем же бюджетом, но не расширять их на агентные side effects.
Успешный HTTP с ошибочным JSON не считается overload: штатный fallback/validation.

### 3.3. Эпизод и успех

Episode ID = root logical prompt/decision operation ID плюс текущий owner scope;
каждая дополнительная попытка имеет свой dispatch ID и predecessor native identity.
Не использовать Session, модель или весь RUN как ключ общего счётчика отказов.

Только подтверждённый successful terminal outcome закрывает серию; уведомление о
старте Turn, reasoning/text/tool activity сами по себе бюджет не сбрасывают.
HITL pause/завершённый Work принимается как отдельная owner boundary: прекращаем
retries, не выдаём паузу за provider success и не отправляем лишний prompt.

Для ребёнка: продолжение через родителя адресует прежнюю child Session, хранит
episode root и подтверждение нового Turn; после успешного terminal Turn серия
закрывается. Новый failed Turn без intervening success остаётся той же серией.
Старый cached отказ не считается повторным, даже если обнаружен после рестарта.

### 3.4. Исчерпание и наблюдаемость

Mandatory Subject/worker/reviewer/MERGE/Judge/probe: provider_unavailable,
reason=overload_retries_exhausted либо retry_after_exceeds_budget. Никакого repair
продукта, new Session или скрытого внешнего повтора всей задачи.
Optional Decisions: durable fallback_intended, затем один classic Judge task со
своей серией; если Judge тоже недоступен — общий fail. Нет возврата обратно к decision.

Сохранять policy/episode ID, logical owner/role/harness/provider/model, попытки,
native identities, исходный и последний отказ, planned/actual backoff, retry_after,
terminal/fallback reason. Не терять nested cause в failureDiagnostic/final Judge.
Секреты, response bodies и полный домашний контекст в публичный отчёт не попадут.

## 4. Системное устройство и inventory реализации

Переиспользовать codex-capacity-policy и существующие executor/receipts. Переименовать
модуль в provider-overload-policy и публичные функции без Codex-имён, обновить все
imports/types/tests/package assets атомарно. Это чистая политика + уже имеющиеся
owner executors; не строить общий job scheduler и не заводить новую БД.

| Пакет | Файлы/пути | Работа |
| --- | --- | --- |
| Engine policy | harness-runtime/lib/codex-capacity-policy.mjs, .d.mts; services/codex-capacity.ts | Ограниченная серия, общая нормализация, backoff, typed exhaustion; переименование. |
| Adapter evidence | dd-codex.mjs, dd-opencode.mjs, dd-agy.mjs/daemon, dd-zcode.mjs/daemon, dd-grok.mjs/daemon, dd-droid.mjs | Единое terminal overload evidence; native-in-progress и uncertain не смешивать с отказом; сохранить provider metadata. Grok использует общий ACP client, не дублировать классификатор. |
| Dispatch admission | dd-codex-daemon.mjs; managed-daemon/daemon-operations; services/harness-adapter.ts, managed-processes | Убрать Codex-only семантику capacity ID там, где есть; проверять общий intent и actual owner. Не повторять create/cancel/stop/lifecycle автоматически. |
| Subject/HITL | services/run-controller.ts, run-controller-adapter.ts, continuation-outcome.ts | Подключить общую возможность adapter evidence вместо harness whitelist; сохранить HITL successor и stage boundary. |
| Workers/MERGE | services/external-work-launch.ts, merge-server.ts | Та же серия и continuation, без повторного work start/merge apply. Включает reviewer и Memory Work. |
| Native children | services/run-controller.ts, vnext-fanout.ts; harness-runtime/lib/native-children.mjs, delegation-instructions.mjs | Общая episode policy, adapter-specific child targeting. Убрать hardcoded Codex storageSessionId; success reset, siblings и Work fences. Не имитировать delegation там, где её нет. |
| Recovery | services/run-controller-recovery.ts, run-recovery-runtime.ts, run-recovery-guard.ts | Бюджет/intent admission/reattach по новой политике; не только изменение runtime loop. |
| Memory probe | services/memory-init-native-capacity.ts | Повтор только prompt того же probe Session. Qualification custody включает все continuation receipts и финальный outcome, а не требует успешного исходного prompt. Cleanup по-прежнему обязателен. |
| EVAL pinned policy | lib/capacity-policy.mjs, test/fixtures/capacity-policy.mjs | Загрузка общего контракта из pinned engine, обновить export/version проверки. Не подменять policy текущим global installation. |
| EVAL owners | lib/judge-capacity.mjs, lib/runner.mjs: Judge interaction/final/qualification, harnessCapacityCheck/boundedCapacityContinuation, providerTurn | Снять codex boolean; один owner series на задачу. providerTurn остаётся single-dispatch transport, без второго вложенного retry loop. |
| Decisions | lib/semantic-decisions.mjs, decision-transport.mjs, hitl-coverage.mjs; profile schema/validation/defaults | Общие счётчик/backoff helpers, сохранить fallback и explicit lower max_retries. Legacy JEV coverage/calibration направить через semantic executor с переводом policy, не поддерживать второй HTTP executor. |
| Diagnostics | lib/runner.mjs failure classification/diagnostic; lib/native-failure-evidence.mjs; engine operation-errors.mjs | Единый final code/cause/attempts, exhausted не помечать как автоматически retryable. Сохранить reset time для quota. |
| Docs/tests | текущие capacity/recovery/adapter/semantic suites; runbooks/e2e-monitoring.md, update-harnesses.md | Заменить устаревшую политику, fixtures и операторскую диагностику без протоколов запусков в ранбуках. |

Отдельно просмотрены native-session-control/runtime-scope-resume: cancel/inspect/
load/stop — control/observation операции, не модельные задачи; не добавлять туда
«продолжай». runtime-service fetch проверяет локальную service readiness, не LLM.
Проверки product CLI с corrective retry — другой контракт, не overload-series.
Внешние native SDK и bridge могут внутренне обращаться к модели; не менять
закрытые native binaries и не обещать контролировать неизвестное число их запросов.

## 5. Порядок реализации и совместимость

1. На task-ветках актуализировать inventory: все импорты policy/helpers, overload/
   retry flags, session.prompt/HTTP callers, built assets и test fixtures. Проверить
   structured native error variants по исходникам/сохранённым событиям; добавить
   небольшие redacted fixtures для AGY/ACP/Droid. Если native evidence не позволяет
   доказать terminal refusal, это явно unsupported proof, а не heuristic auto-retry.
2. Реализовать pure policy и параметризованные регрессии; поменять recovery guards,
   daemon admission и validators вместе с executor. Затем adapters и engine owners.
3. Исправить child episode closure и probe receipt custody. Проверить root/external/
   merge/recovery/Memory roles на общих fixtures, без provider-вызовов.
4. EVAL loader/Judge/probes/semantic/legacy переводятся на тот же контракт. Для
   semantic direct tests передавать тот же engine policy fixture; не копировать
   константы. Если policy не загрузилась — не отправлять платный вызов.
5. Старый codex-overload-burst@1 хранится как историческая версия: старые pinned
   RUN не переписывать/переоценивать. read-only status/evidence старых chains остаётся
   доступным. Новый engine не возобновляет активную старую chain под новым бюджетом:
   typed capacity_policy_mismatch до dispatch; использовать исходный pinned runtime
   или штатную явную reconciliation, не молча обнулять счётчик.
   Новые chains получают versioned schema и policy ID; миграция данных не требуется.
6. Legacy JEV сохранённые completed/failed/unknown observations только читать;
   не превращать прежний unknown/failed cache в разрешение новой платной серии.
   Новые задачи legacy profile переводить в semantic config до первого dispatch.
7. Запустить проверки ниже, проверить полный diff и searches на оставшиеся gates.
   Закоммитить/PR по правилам каждого репозитория при реализации. Engine/EVAL changes
   интегрировать согласованно; publish/pins/hooks/live acceptance — отдельный этап.

## 6. Обязательные проверки

Использовать существующие test runners, fake clock/random и small native fixtures.
Никаких новых зависимостей. Не размножать полный cross-product, если несколько
ролей используют один доказанный executor; отдельно проверить wiring каждого owner.

- Policy: immediate success; overload→success; overload→overload→success;
  три отказа => stop и ровно два дополнительных dispatch. Тот же результат при
  интервале между отказами >120s. Две независимые серии с успехом между ними.
- Timing: обе задержки/jitter; Retry-After seconds/date/ceiling/invalid; wall-clock
  shift не повторяет backoff; cancellation/lease loss во время ожидания.
- Agent safety: pending native retry/tools/children не разрешают dispatch; siblings
  продолжают работу. Не повторять принятый HITL/work start/stage finish/merge apply.
- Recovery: restart до/после durable intent, во время backoff, после dispatch до ACK,
  после success до публикации; бюджет не сбрасывается, lost ACK только наблюдается.
- Child: exact target без new spawn; cached refusal не увеличивает счётчик; success
  закрывает серию; следующий overload получает два повтора; stage/Work сменился — stop.
- Adapter contract: Codex/OpenCode/AGY/ZCode/Grok/Droid terminal overload fixtures;
  quota/auth/unknown429/transport loss/native retry active отрицательные примеры;
  generic text из tool output не распознаётся как отказ провайдера.
- Wiring: Subject/HITL, external/review/Memory, MERGE, recovery ACK, child,
  Memory probe, interaction/final/qualification Judge, harnessCapacityCheck.
- Decisions: JEV/Luna HTTP 503→503→success и exhaustion→Judge; legacy/calibration
  используют тот же executor; explicit0/1 retries; неизвестный HTTP outcome не
  пересэмплируется; Judge exhaustion не запускает повторный decision/repair.
- Native retries: fixture in-progress→success не запускает наш prompt;
  in-progress→terminal overloaded даёт один наш отказ. Записать различие native
  network attempts и owner continuations; configurable native retries не вкладывать
  в ещё один наш adapter retry loop. Не отключать их глобально ради теста.
- Diagnostics: первичная/последняя ошибка, attempts/episode/Retry-After дошли до
  EVAL/final evidence; quota reset time сохранён, credentials/body отфильтрованы.
- Compatibility: old policy read-only; active incompatible chain no dispatch;
  new engine artifact содержит новые module/types и EVAL loader его принимает.

Команды проверки:
engine pnpm typecheck; pnpm lint; pnpm test (hybrid, e2, e3, release,
integration, runtime-sensitive); installed gates по package.json/runbooks.
Build требует явного DD_FLOW_BUILD_CANON_ROOT и DD_FLOW_BUILD_STRICT_CANON=1;
E3 — DD_FLOW_E3_CANON_ROOT и абсолютного DD_FLOW_E3_WT. Не менять build-info
между capture fixture archive и его приёмкой. Границы fixture observer не являются
таймаутами агента: многоэтапный прогресс продлевает ожидание по terminal receipts.
EVAL node --test --test-concurrency=1 test/capacity-policy.test.mjs
test/judge-capacity.test.mjs test/semantic-decisions.test.mjs, затем npm test.
Installed fixture использует локальный packaged engine, без новых scored EVAL.
Нельзя объявлять live acceptance пройденной по offline fixture.

## 7. Готовность и Ponytail-проверка

Архитектурные решения приняты: два повтора, shared default5s/15s+jitter,
Retry-After ceiling30s, per-operation episode, terminal-success reset,
same-Session continuation, exact native proof, fallback optional Decisions,
versioned pinned compatibility, диагностический контракт и тестовые критерии.

Минимальный путь: расширить/переименовать существующую policy, переиспользовать
durable owners и semantic executor, удалить legacy dispatch bypass и harness gates.
Не добавлять отдельный scheduler, global circuit breaker, новую очередь/таблицу,
runtime config для каждого harness, универсальный retry любой CLI команды,
автоматическую смену модели или новая Session после перегрузки.

Реализован. Точные native error payload варианты проверены adapter fixtures;
фактические ограничения API описаны ниже. Для любого API без
необходимого evidence заранее определён безопасный результат: unsupported proof,
не выдуманная identity и не безусловный retry. Завершённость требует закрыть этот
inventory для каждой поддерживаемой упряжки либо явно показать внешний blocker;
одних Codex-тестов недостаточно.

Definition of done: D1–D11 закрыты кодом и проверками; все production provider
owners перечислены с общим policy/exhaustion либо обоснованным control/observation
исключением; нет бесконечной overload серии или счётчика на всю Session; restart
не добавляет бюджет; неизвестный исход не переотправлен; engine/EVAL gates зелёные.

## 8. Уточнения по фактическим native API при реализации

- AGY использует один streaming CLI process для нескольких prompt. PID/birth и
  локальный turn_generation не являются уникальной native попыткой. Без настоящего
  result.turn_id/request_id возвращаем provider_overload_evidence_unavailable,
  reason=native_turn_identity_unavailable; это infrastructure, не product failure.
  При наличии настоящего ID применяется общий executor. Не менять архитектуру
  native CLI и не придумывать Turn ID ради зелёного результата.
- ZCode Agent schema не имеет resume/same-child followup. Root Session через ACP
  поддержана; native child recovery не подменяется новым Agent/spawn.
- Для Codex, OpenCode, Droid и Grok followup используются проверенные native API.
  Grok child требует действительно доступных terminal error/items; неизвестный
  child outcome остаётся reconciliation fence.
- Выявленные на ревью siblings: durable child observer терял native_source/items;
  кеш старого отказа конфликтовал со следующим failed Turn; часть adapter inspect
  не передавала смешанное дерево failed root + live children. Исправления сохраняют
  полную историю серии отдельно от проекции текущего Turn, а live siblings ожидают,
  не отменяют. Это включено в регрессии, не ослабление settlement.
- Восстановленная Judge chain проверяет лимит до dispatch; semantic backoff связан
  с точным engine checksum. Legacy JEV unsupported model уходит в Judge до dispatch,
  а historical completed/failed/unknown observations не требуют новой policy и
  никогда не пересэмплируются.
