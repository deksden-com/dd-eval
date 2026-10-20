# 094 — CP-239: terminal evidence, native hooks и доставка текущих инструкций

Статус: реализация и независимое ревью выполнены, полный gate и интеграция в работе.
Новые EVAL не запущены. Раздел 6 уточняет и имеет приоритет над общими формулировками.
Дата: 2026-10-20. Основа dd-eval: 78b736a. Исследованный опубликованный engine:
0.9.0-beta.144, source fc729af5d6f9865bab178e40b34dd9b0a99a0318.
Тот же номер версии в последующем main не означает тот же опубликованный артефакт.

## 1. Цель и границы

Исправить причины ложного завершения/блокировки RUN и потери текущих инструкций.
Политика перегрузки остаётся прежней: исходный запрос + два дополнительных повтора
с backoff в той же Session, только после доказанного окончания предыдущего запроса.
Успех закрывает эпизод; следующий отказ получает новый бюджет. Quota/auth — не overload.

Не исправлять продукт вручную, не менять исторические результаты/журналы, не
возобновлять старые EVAL, не объявлять неизвестный эффект успешным. Не повторять
квалификацию неизменившегося Judge из-за изменения subject adapter/engine.
Изменения промптов Judge проверять по фактической области зависимостей квалификации.

## 2. Зафиксированные факты и степень доказанности

| Harness / EVAL | Факт | Вывод |
| --- | --- | --- |
| Luna / EVAL-20261020074739-006aaec6 | SPECIFY и PROTOCOLIZE восстановились после двух продолжений; PLAN получил три serverOverloaded подряд | Исчерпание бюджета корректно; не увеличивать лимит ради PASS |
| OpenCode / EVAL-20261020084025-91552a86 | PLAN, native_hook_timeout, 16.5 s; последняя фаза import, до imported/store_open | Холодная загрузка критического пути попала под внутренний cap |
| Grok / EVAL-20261020094214-6c456775 | PLAN-REVIEW, такой же timeout около 15 s; позднее получен точный cancelled для root prompt RPC 19 | Ошибка хука первична; позднее terminal доказательство не проецируется в settlement |
| AGY / EVAL-20261020095409-0d28dc43 | Четыре ранних 503, затем работа и успешный stage pause; через ~час terminal ERROR повторяет старый текст | Это не новый отказ в конце; потеря временной области ошибки и durable-boundary reconciliation |
| ZCode / EVAL-20261020075202-57573624 | completed через MERGE; Judge отметил отсутствие прямого retained-row upgrade proof | Не runtime failure и не доказанный баг миграции; недостаток качества плана/ревью |

Историческая физическая причина медленного import (CPU/IO/GC) не установлена:
трассы этого нет. Архитектурный дефект и фаза отказа установлены; увеличение
таймаута без сокращения cold path не является системным исправлением.
Grok физически остановлен; native_settled=false не следует называть живой утечкой.

Источники: controller.log, adapter.events.jsonl, native transcript, RUN timeline,
runner-attempts/attempt.json и judge/result.json в homes
`/Users/deksden/.dd-eval/qualification/cp-239-{luna,zcode,opencode,grok,agy}-full/runs/<EVAL>`.
Ключевые события: Grok native_terminal_after_hook_failure 10:29:33.811Z;
AGY stage pause 10:59:49Z, Stop fully_idle 11:01:54.368Z, result ERROR 11:01:54.416Z.

## 3. Системный охват и дополнительные находки

### A. Native hooks: дешёвый admission и единый бюджет

Места: `src/cli/native-hook-ingress.ts`, `src/cli/hook-ingress.ts`,
`src/services/hooks.ts`, `src/harness-runtime/lib/native-hook-command.mjs`.
Все callers: bin/dd-grok.mjs, bin/dd-agy.mjs, bin/dd-zcode.mjs,
lib/opencode-plugin.mjs, lib/dd-zcode.mjs (invocation observer), lib/dd-droid.mjs.
Codex использует отдельный ingress, но тот же тяжёлый hooks graph.

Новая находка: native ingress загружает hooks.ts ДО определения участия команды;
даже irrelevant shell command оплачивает repair/recovery/external-review imports.
Codex уже имеет предварительный дешёвый gate — использовать этот паттерн и
существующий parseLifecycleCommand, не заводить отдельные regexp в адаптерах.

Реализация:

1. Отделить минимальный envelope/command preparation от тяжёлого handler.
   Явно посторонние команды возвращают existing non-participating response без DB.
   Неоднозначные managed команды не пропускать без проверки.
2. Отложить repair/recovery/native-review imports до нужной ветки handler.
   Handler/policy остаются общими; новый hook server, dependency или cache не нужны.
3. Удалить произвольный дополнительный 15 s cap; передавать единый remaining budget
   от квалифицированного внешнего deadline, включая observation/identity, import,
   store, verify/ACK и завершение. Числа/reserve брать из текущего host contract;
   не ставить 60 s при внешнем native hook deadline 30 s.
4. Request-bound фазы startup/import/imported/store/commit/ack публиковать и для
   Codex. Фаза — диагностика/прогресс, а не свидетельство commit.
5. Hard deadline протокола не продлевается бесконечно heartbeat. Агентный idle
   timeout и bounded hook admission — разные механизмы. Повторяющийся heartbeat
   без смены фазы не доказывает полезный прогресс.
6. После dispatch сохранять unknown effect, если no-effect/commit не доказаны.
   Никакого автоматического повторного work finish после hook timeout.

Проверки: child-process delayed import отдельно от DB writer contention;
irrelevant command не открывает store; managed command сохраняет identity/CAS;
expiry до commit, commit с поздним ACK, malformed shell, stale/foreign binding;
ZCode observer/native hook равнозначны; Codex timeout имеет фазовую диагностику.
Существующий test/native-hook-ingress.test.ts с малым deadline оставить: он
доказывает bounded no-write, а НЕ успешную cold readiness. Добавить отдельную
readiness-регрессию, не ослаблять существующие expiry assertions.

### B. Terminal evidence и settlement после первичной ошибки

Места: lib/dd-zcode.mjs AcpBridge.receive/rejectedHookRequests;
lib/dd-grok-daemon.mjs productive/refreshTree/rootRunning; bin/dd-grok.mjs cancelTree;
общие native-tree/shutdown и EVAL cleanup receipt consumers.

Аудит подтверждает: поздний matched response записан в журнал и мутирует error,
но Grok productive уже вышел, поэтому native_root_receipt не обновляется.
session/info не обязан иметь status/state; отсутствие поля не означает running.

Реализация:

1. Нормальный и late RPC outcome направлять в один существующий terminal reducer;
   добавить минимальный bridge callback, а не второй журнал/реестр.
2. До удаления ephemeral operation сохранять связь daemon generation, Session,
   request ID, operation/attempt. Поздний exact matched terminal обновляет только
   эту операцию и native root settlement, не Work success и не первичную ошибку.
3. Root и descendants сверять независимо. Cancelled child event использовать
   как доказательство конкретного child; 404 или отсутствие status — unknown.
4. Persist terminal projection перед финальным shutdown receipt. При рестарте
   восстанавливать только из связанного durable event, без новой команды модели.
5. EVAL различает physical_stopped, native_settled и evidence_unavailable;
   расследование не удерживает уже остановленный процесс как «живой».

Проверки: hook failure → pending rejected → cancel → late matched terminal →
info без status → root settled; wrong ID, старая generation, новая operation,
duplicate terminal, crash до/после persist, live child, contradictory native event.
Проверить ZCode как второго пользователя AcpBridge и остальные daemon shutdown
consumers. Не конвертировать timeout/lost transport в terminal receipt.

### C. AGY: реальный native contract, область ошибки и продолжение

Места: lib/provider-overload-policy.mjs, lib/dd-agy.mjs agyTerminalFailure,
lib/dd-agy-daemon.mjs drain/finishTurn, services/provider-capacity.ts,
run-controller.ts, run-controller-recovery.ts, external-work-launch.ts,
merge-server.ts, memory-init-native-capacity.ts. EVAL Judge/Decisions используют
тот же классификатор/политику, но не должны получать agent continuation semantics.

Новые подтверждённые пробелы:

- Строка `(code 503): No capacity available for model ...` не распознаётся.
- Даже после классификации AGY блокируется требованием turn_id/request_id,
  которых documented stream result не гарантирует.
- Сравнение previousError учитывает прошлый Turn, но не восстановление внутри
  текущего Turn. Native cumulative num_turns не является request identity.
- continueProviderCapacity проверяет overload proof ДО decision callback;
  завершённый/paused Work не достигает reconciliation в нескольких callers.
- Тест all-harness capacity подставляет AGY вымышленный turn_id и скрывает дефект.

Реализация:

1. Нормализовать documented native error/AGY_ERROR envelopes и реальные строковые
   формы, включая code503/no capacity. Только на native error boundary, не по
   содержимому пользовательского текста, reasoning или tool stdout.
2. Сохранить native-turn-ID proof для провайдеров, где он есть. Для AGY добавить
   альтернативное доказательство: exact daemon generation/Session + единственный
   in-flight stream request + связанный outbound/inbound terminal journal cut.
   Это локальная binding identity, не выдуманный native ID. При ambiguity — block.
3. Отделить исторические retry events от актуального terminal отказа по порядку
   событий. Stop/непустой текст сами по себе не успех. Раннюю 503 сохранить в
   диагностике; не считать её новым отказом после подтверждённого durable pause.
4. В общем helper выполнять exact durable-boundary reconciliation для
   аутентифицированного terminal provider result перед решением о continuation.
   Fatal hook/storage/ownership/auth/quota остаются первичными: не переносить
   decision() безусловно перед всеми ошибками.
5. Совпавший pause/completion закрывает текущий запрос без replay. Pending HITL
   обслуживается штатно в той же Session/Work. При доказанном новом overload —
   существующие два продолжения/backoff; пока native retry активен, не отправлять
   «продолжай». Native внутренние четыре попытки — не четыре controller retries.
6. Journal/operation recovery сохраняет тот же episode и ordinal после crash;
   успешный запрос закрывает episode. Raw native failure и primary cause не терять.

Проверки: реальная AGY result shape без turn_id; stale early503 + tools + pause +
Stop + ERROR; настоящий terminal503 без pause; ответ без proof; stream interleave;
duplicate result; переподключение; quota/auth; pending tool; completed Work;
MERGE action_required; recovery; memory init; Judge и Decisions fallback.
Луна: replay последовательности success→новый episode→exhaustion, без смены policy.

Native contract: https://www.antigravity.google/docs/cli/headless/
и https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md .
Документация подтверждает result boundary, не гарантирует исправление stale error.

### D. Текущий prompt как доступный plain Markdown, а не JSON-строка

Места: cli/response-file.ts, services/controller-fanout.ts,
services/stage-pause.ts, cli/run-cli.ts memory stage delivery; все Work/repair/
review/MERGE/resume consumers worker_prompt_markdown и prompt_path.

Факт: AGY read_file получил 4031 символ из 39843-byte stage-start JSON;
одна длинная escaped строка скрыла pause command. Текст существовал, но не был
надёжно доставлен. ~57 минут из ~59 заняли agent responses, tools — ~52 секунды.
Нельзя объяснять весь тайминг скоростью CLI или считать пропущенный текст отсутствующим.

Новый дефект: stage resume возвращает prompt_path исходного prompt, хотя
worker_prompt_markdown дополнен HITL answer/replacement commands. Memory start
также добавляет current lifecycle commands только в delivery. Простая замена
«читать JSON» на «читать старый prompt_path» потеряет authority и ответ пользователя.

Реализация:

1. Для каждого current delivery публиковать полный актуальный Markdown атомарно
   в существующем RUN/Work current-prompt механизме. Frozen semantic original
   остаётся отдельно неизменённым; не менять custody bytes ради доставки.
2. Результат содержит однозначный current delivery path и его digest/revision;
   original prompt_path не переименовывать молча. Все controller entry/resume и
   fanout/repair/review/MERGE сообщения направляют читать именно current delivery.
3. JSON остаётся machine receipt. worker_prompt_markdown для совместимости может
   остаться, но не должен быть единственным model-readable источником.
4. До handoff проверить создание файла/parent, readability в фактическом cwd,
   sandbox/read-only copy и разрешениях упряжки. Публикационный сбой после commit
   требует reconcile/republication того же результата, НЕ replay lifecycle.
5. Не дублировать большие инструкции в stdout. Короткий ответ даёт путь и
   обязательные действия; substantive prompt SSOT — одна current delivery.
6. Проверить все стадии, Memory/E4 текущего main, native/external Work, resume и
   повторный lifecycle rejection. Не раскрывать canonical answer до HITL boundary.
   Не использовать currentStagePrompt из stage-context.ts как готовую execution
   authority: его relocation projection помечает исторические команды non-executable.
   Ordinary stage/work start и PROTOCOLIZE уже пишут совпадающие Markdown/path —
   сохранить их publication/receipt механизмы, не переписать всё ради одного helper.

Проверки: long/Unicode/escaped prompt с native line clipping; current delivery
содержит последний ответ и exact replacement command; frozen original не меняется;
несколько resume/revisions; crash/republication; missing parent/read-only path;
snapshot worker видит свой путь, foreign path не выдаётся; stale digest не применяется.

### E. Семантическая достаточность доказательства — отдельно от runtime PASS

Места dd-eval: case assessment.json STRONG-PLAN-001, prompts Judge/reviewer,
lib/case-acceptance.mjs и final evidence assembly. План и matrix уже могут содержать
AC→CHK→PASS, но это не доказывает, что CHK проверяет именно заявленный сценарий.

1. Проверить передачу accepted obligation и proof_limitations в PLAN-REVIEW,
   CODE-REVIEW и final Judge. Не вводить ещё один case-specific engine gate.
2. Это правило УЖЕ есть в vnext-code-review.ts reviewerTask/orchestratorPrompt:
   evidence must exercise named failure mechanism, proof limits cannot waive an
   accepted obligation. Сохранить правило, проверить его доставку и применение;
   не добавлять ещё одну копию общего запрета. Disclosed limitation не погашает
   требование без принятого изменения.
3. Для обещанного upgrade retained rows fresh-world seed/default insert — косвенное,
   не прямое доказательство. Reviewer должен потребовать focused check или честно
   оставить unmet obligation; Judge оценивает это даже при case acceptance PASS.
4. Если требование уже доставлено и ясно, регистрировать ошибку модели/агента и
   score, а не бесконечно усиливать промпт или вручную исправлять продукт.

Регрессия: пара evidence bundles — fresh-world/default-only и real retained-row
upgrade; одинаковые PASS receipts не должны скрывать различие proof coverage.
Матрицу не превращать в сертификат семантической безошибочности.

## 4. Порядок реализации и проверка полноты

1. Сохранить минимальные обезличенные реальные traces как регрессионные данные:
   hook phases, late RPC, AGY stream, clipped prompt, migration proof limitation.
   Без токенов, native credentials и полного приватного transcript.
2. A: общий hook cold path/budget; B: terminal reducer/shutdown; независимо C:
   error normalization/proof/boundary order; D: current delivery. E зависит от
   проверки реального evidence delivery, а не от нового runtime framework.
3. Каждый пакет имеет targeted test, отрицательный контроль и проверку sibling
   callers из разделов A–E. В implementation receipt отметить каждый caller:
   changed / covered by shared fix / intentionally unchanged с причиной.
4. Проверить текущий main и E4 изменения перед implementation; не заменять его
   старым published144 tree. Не редактировать frozen launch checkouts.
5. Engine: typecheck, build, полные unit/integration/runtime-sensitive gates по
   release policy; EVAL: affected tests, fixtures/schema/profile validation.
   Тестовую инфраструктуру не «чинить» ослаблением проверок deadline/identity.
6. Commit/PR/review/squash merge по runbooks/git-workflow.md. Публикация точного
   проверенного engine, новые pins/хуки и свежие EVAL — отдельный следующий шаг
   после разрешения; этот план сам по себе не запускает модельные вызовы.

## 5. Готовность и ponytail review

- Решения: общий существующий parser, lazy existing handlers, remaining native
  deadline; existing terminal reducer с minimal callback; protocol-specific proof
  в общем retry contract; current Markdown delivery отдельно от original prompt.
- Не нужны: новый демон/сервис hooks, новый retry framework, новые зависимости,
  автоматический replay unknown-effect commands, дополнительные бессрочные повторы,
  глобальная квалификация Judge после любого изменения, ручная правка продукта.
- Сохранить полезные проверки identity, ownership, exact request, expiry и evidence.
  Удаление внутреннего cap не отменяет внешний protocol deadline.
- Readiness не зависит от угадывания host load. Численные host deadlines/reserves
  при реализации сверяются с pinned native configuration и фиксируются в тестах.
- Все новые подтверждённые аналоги внесены: other hook callers, Codex diagnostics,
  AGY fictional-ID test, shared callback ordering, stale resume/memory prompt paths.
- Acceptance: нет потери текущих инструкций; доказанный pause не превращается в
  provider failure; late matched terminal не теряется; unknown остаётся unknown;
  реальные overload retries исчерпываются ограниченно и одинаково во всех callers.

План прошёл ponytail: исправления в существующих общих механизмах, без параллельной
архитектуры. Полный gate и живая приёмка ещё не выполнены: это план, не PASS реализации.

## 6. Решения readiness review: закрытие развилок и опасных допущений

### 6.1. Admission: deadline и предварительный gate

- Не менять общий default runBoundedCommand для maintenance/прочих callers.
  Исправление относится к invokeNativeHook и его перечисленным callers: они
  передают remaining budget явно; внутренний default не должен вновь обрезать его.
- Сохраняем текущие квалифицированные бюджеты: native adapters 25 s, Codex ingress
  20 s, либо меньший inherited deadline. Это не новые agent stall timeouts.
  Использовать existing cleanupWithinBudget: до 500 ms, не более 1/5 оставшегося
  бюджета, на subtree cleanup. Если места не осталось — no new dispatch.
  Failure-report RPC/receipt тоже не получают новый независимый deadline после
  истечения общего; неуспех записи виден как cleanup/evidence diagnostic.
- Для pinned hosts с 30 s hook limit текущий запас снаружи сохраняется. Для нового
  host без доказанного лимита не заявлять совместимость автоматически: явно
  квалифицировать adapter configuration, не выбирать произвольный timeout.
- Cheap gate валидирует native envelope/event/tool, а не только shell command.
  Stop, PostToolUse и non-shell события, которые участвуют в settlement/cwd/tool
  evidence, НЕ отбрасывать как irrelevant. Использовать ту же таблицу участия,
  что handler; отрицательные проверки нужны отдельно для каждого event kind.
- Lazy imports требуют async handler только на затронутой ветке; обновить всех
  прямых callers/CLI await. Не переносить async импорт внутрь синхронной SQLite
  транзакции и не держать write transaction во время import/native RPC.
- Любая стадия DB/receipt проверяет deadline перед записью. Таймер Promise.race
  сам по себе не останавливает action: просроченный код не должен позднее commit.

### 6.2. Terminal reduction: порядок записи и остановки

Выделить минимальную общую функцию из существующих success/catch branches Grok;
формулировка «existing reducer» не предполагает, что готовый универсальный reducer
уже существует. AcpBridge callback передаёт normal/late matched outcome, не пишет
Grok state напрямую. ZCode сохраняет существующую семантику через тот же callback
contract там, где ему требуется terminal projection.

Порядок: exact response → durable journal append → serialized state reduction →
persist → settlement receipt. Callback writes присоединяются к существующей
очереди; shutdown ждёт её завершения. Ошибка journal/persist запрещает clean receipt,
но не подменяет первичный native_hook_timeout. ACK не опережает persistence.
Запись rejectedHookRequests не удалять до durable append/учёта callback.
Ограничение размера карты не должно молча терять единственное незавершённое
доказательство: при достижении existing bound отказать в новом dispatch до
reconciliation, не создавать безразмерную карту. Disk failure и race shutdown
против late callback — обязательные отрицательные тесты.

Binding включает daemon instance/generation, operation ID, Session, request ID и
connection incarnation. RPC ID повторно на новом соединении не совпадает с прошлым.
Root terminal относится к Turn, не навсегда к Session; новая prompt operation
инвалидирует прошлое idle proof. Late outcome старого Turn можно архивировать,
но он не делает новую операцию idle. Duplicate identical outcome идемпотентен,
противоречащий исход — reconciliation blocked. Child event имеет собственную
Session/generation/порядок; свежая activity отменяет старый terminal proof.

При restart не создавать новый generic event-sourcing engine: перечитать только
existing retained operation + её exact journal events после последней projection.
Если связи/порядка недостаточно, evidence_unavailable; исторические EVAL не патчить.
Потерянный terminal после убийства transport не восстанавливать предположением.

### 6.3. AGY proof: изменение всех потребителей, не только классификатора

Внутренний normalized proof становится discriminated union:

- `kind: native_turn`: native Session/Turn ID и текущие проверки;
- `kind: stream_request`: daemon instance, operation ID, turn generation,
  Session, outbound journal position и terminal inbound position.

Сохраняем старые поля native proof для совместимости; stream proof не заполняет
native_turn_id фиктивным значением. Для episode dedup/recovery использовать
типизированный request key, а не предположение «любой proof имеет turn_id».
Пройти normalizeProviderFailure, terminalProviderOverload, refusal records,
retained capacity intents, inspectOperation/inspectSession и их validators/tests.
Для stream proof session inspect вызывается БЕЗ выдуманного --turn-id; exact
predecessor проверяется по operation journal. В публичных diagnostics — только
ссылки/безопасные поля, не полный native response или credentials.

Stream proof принимается только при одном принятом outbound на этом connection,
одном связанном terminal result и неизменном owner. После reconnect нельзя
отправлять prompt до drain/reconciliation старой операции. Одинаковый текст двух
ошибок НЕ делает второй result дубликатом: границы запросов важнее текста.
Unsolicited/duplicate result после следующего dispatch нельзя привязать только
по наличию одного active request. Использовать native ordered one-result-per-input
contract с предыдущим drain barrier; при наблюдаемом нарушении порядка блокировать
продолжение. Не обещать распознать ненаблюдаемое нарушение native protocol без ID.

Разрешённые dispositions terminal ERROR:

1. Текущий доказанный overload и нет достигнутой boundary: bounded continuation.
2. Ранний error, затем свежая работа той же операции, точный successful lifecycle
   receipt pause/completion, затем idle/terminal без нового error после boundary:
   `boundary_satisfied` — сохранить raw ERROR и историческую 503, не выдавать
   native SUCCESS и не создавать ещё один prompt.
3. Есть новый error после boundary, unknown scope, чужой pause, pending tool/child,
   неизвестный эффект или неисправность evidence: не подавлять ошибку;
   reconciliation blocked либо исходная actionable failure.

Для случая 2 нужны ordered evidence и exact receipt с теми же RUN/Stage/Work/
attempt/operation; одно совпадение error text, непустой ответ или Stop недостаточны.
Если native stream не даёт достаточно порядка, это явно unproven, не эвристический
успех. Auth/quota/hook/ownership/storage ошибки имеют приоритет во всех случаях.
Cancellation никогда не запускает overload continuation.

Boundary reconciliation и retry допускаются только после подтверждённого idle
дерева. После ожидания/backoff повторно проверить owner/lease, cancellation,
current boundary и отсутствие native retry. Lease loss не обновляет budget.
Полученный HITL ответ нельзя доставлять до settlement предыдущего запроса.

### 6.4. Prompt delivery: точный API, custody и failure semantics

Добавить backward-compatible поле `prompt_delivery` в ответы, несущие текущий
worker prompt: `{ path, sha256 }`. Путь абсолютный для конкретного получателя;
хеш — SHA-256 полных UTF-8 Markdown bytes. Metadata routing остаётся в JSON.
`prompt_path` сохраняет прежнее значение, `current_prompt` recovery projection
не переиспользуется под новым смыслом. `worker_prompt_markdown` не удалять в этой
доработке; старые consumers не ломать.

Если original файл уже точно равен текущему delivery и доступен получателю,
сослаться на него — не создавать копию. Иначе положить новую immutable delivery
revision в существующую RUN/Work область по digest, создать атомарно и повторно
проверить bytes. Имя по digest не является полномочием исполнить команды.
Lifecycle authority выдаётся только существующим bindLifecyclePublishedPacket/
recovery acknowledgement; publisher не перевыпускает invocation credentials.

HITL answer, актуальные replacement commands и Memory appended commands включены
до вычисления digest. Две параллельные публикации одинаковых bytes идемпотентны;
разные bytes имеют разные пути. Старый ответ не перезаписывает current pointer/
receipt новой generation. Read-only snapshot получает доступную локальную копию
без выдачи записи в authoritative workspace и без изменения её input hash.

Если delivery не опубликован после lifecycle commit: вернуть existing committed
publication error/reconcile route, оставить routing receipt и НЕ инструктировать
агента выполнять старый prompt. Reconcile переиздаёт retained exact delivery,
а не заново исполняет stage start/resume/work start. Восстановление после crash
проверяет operation/generation/receipt, не реконструирует commands из старого prompt.
Полные delivery bytes либо все точные inputs и уже принятый command packet должны
быть retained вместе с existing committed operation receipt ДО объявления commit
успешным. Resume не пересобирает authority через новый lifecycle command issuance.
Filesystem publication делается после транзакции; DB write transaction не держится
на filesystem/native async work. Для старой receipt без достаточных bytes/input
не обещать восстановление: actionable publication/reconciliation blocked.

Новые controller consumers читают prompt_delivery Markdown; для старого packet
без поля сохраняют прежний совместимый путь. Mixed-version packet не должен
молча заменить current authority historical projection. После обновления сборки
тест проверяет соответствие issued bytes, visible locator и реального file content.

### 6.5. Семантическая регрессия и достаточность результата

Сохранённые weak/strong evidence проверяем детерминированно на completeness
сборки reviewer/Judge input: obligation, limitation и focused evidence не потеряны.
Не выдавать snapshot-test prompt за доказательство корректного решения LLM.
Семантическую точность reviewer подтверждает отдельная живая ограниченная проверка
на этих двух bundles при разрешённой приёмке. До неё — `semantic acceptance pending`.
Final Judge уже обнаружил недостаток: его verdict не менять ради зелёного результата.

### 6.6. Проверки и завершение реализации

Implementation receipt должен содержать отдельные строки A–E и все перечисленные
callers, команды/exit status и оставшиеся acceptance limitations. Минимальные
gate-команды engine: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`;
использовать полный release policy текущего main, включая добавленные E4 suites,
а не только состав scripts из опубликованного144. Targeted tests запускать до
полного gate. Для dd-eval перечислить конкретные affected suites после изменения
реального inventory, не заявлять «всё проверено» по одному oracle тесту.

Тесты с реальным child/startup используют управляемые барьеры/phase events и
локальные часы для логики budget, не произвольные sleeps и не нагрузку Mac как
источник детерминизма. Один integration проверяет настоящий process timeout;
отдельные проверки гарантируют, что намеренно зависший import всё же завершается
ошибкой. Нет требования гарантировать admission при бесконечной задержке host.

Достижимый результат реализации: устранены установленные системные причины,
положительные/отрицательные traces проходят, полный gate зелёный. Это НЕ гарантия
успеха любой модели или доступности провайдера. Свежая живая приёмка и публикация
отдельно разрешаются пользователем; без неё не утверждать «все пять E2E прошли».
