# 083 — переход dd-opencode на OpenCode v2

Статус: план для согласования; реализация и живая приёмка не начаты.
Дата исследования: 2026-10-13.

## Решения и границы

- Переходим на v2 единственным актуальным адаптером. Не сопровождаем v1/v2
  параллельно, не добавляем новую семью harness и не создаём dd-opencode2.
  Сохраняем dd-opencode, opencode/opencode-server и общий контракт engine/EVAL.
- Меняется native transport и принадлежащий dd-flow плагин; Stage, Work,
  lifecycle instructions, repair, Judge и Decisions остаются общими.
- Сторонние плагины, в том числе moshi-hooks.ts, исключены из анализа,
  реализации и критериев приёмки. Изолированный EVAL не загружает их.
- Сейчас только фиксируем v1 и план. Не обновляем установленный OpenCode,
  пользовательскую конфигурацию, активные runtime homes или исторические EVAL.
- Начальный кандидат: @opencode/cli, @opencode/client и @opencode/plugin
  2.0.28. Версия проверена в registry, но кандидат ещё не квалифицирован.
  При реализации повторно проверить доступность, platform package и integrity;
  замена кандидата явно записывается, не используется плавающий latest.

## Последняя исходная реализация v1

В dd-flow-cli создан и опубликован неизменяемый annotated tag
[archive/opencode-v1-final-beta134](https://github.com/deksden-com/dd-flow-cli/tree/archive/opencode-v1-final-beta134)
на b243f4dac38629b7f0398b3e0b1613904f4aebff, package version 0.9.0-beta.134.
Это архивная граница исходного адаптера v1, не дополнительный выпуск пакета и
не новая квалификация native runtime. Поставленный в исходниках baseline —
1.18.25; установленный на момент исследования OpenCode — 1.18.35. Тег не
утверждает, что эта установленная версия прошла baseline.

Не перемещать тег при будущих изменениях. Исторические runs/artifacts сохраняют
свои настоящие pins. Rollback — отдельный новый запуск на архивном tuple, а не
запуск старого runtime через новый адаптер и не переписывание его БД.

## Проверенная база и источники

Engine исследован по origin/main b243f4d; EVAL — по origin/main 4779b95.
Расходящиеся первичные локальные main и чужие рабочие деревья не изменяются.
Опубликованные типы SDK/plugin 2.0.28 просмотрены отдельно, без npm install
в домашний каталог и без модельных запросов.

Официальная миграция выделяет изменения server API, plugin API и terminal
config. Поддерживаемые старые настройки можно оставить: v2 нормализует их
без обязательной перезаписи. Названия permission actions изменились, поэтому
наши инструкции и обработчики инструментов требуют проверки отдельно от JSON
совместимости. Это не основание конвертировать все пользовательские настройки.
[Миграция v1](https://opencode.ai/v2/docs/migrate-v1/).

План API и плагина опирается на [client](https://opencode.ai/v2/docs/build/client/),
[plugin migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1),
[plugin hooks](https://opencode.ai/v2/docs/build/plugins) и
[API reference](https://opencode.ai/v2/docs/api).
V2 устанавливается пакетом @opencode/cli, а не обновлением opencode-ai из v1;
обычный CLI по умолчанию подключается к общей службе. Для нашего owned runtime
это поведение неприемлемо. [Установка](https://opencode.ai/v2/docs/),
[CLI/service](https://opencode.ai/v2/docs/cli/).

## Инвентаризация мест изменения

| Область | Места и причина |
| --- | --- |
| Native API | dd-flow-cli: src/harness-runtime/lib/dd-opencode.mjs — v1 routes, синхронный prompt, info/parts, history/usage |
| Daemon/plugin | src/harness-runtime/lib/dd-opencode-daemon.mjs — baseline, API fingerprint, private config/auth, plugin, registry, fork/archive/cancel |
| CLI/delivery | src/harness-runtime/bin/dd-opencode.mjs, package.json, lockfile и scripts/copy-assets.mjs — совместимость аргументов и реально установленный SDK/plugin |
| Hooks/observations | src/services/hooks.ts, src/harness-runtime/lib/tool-observations.mjs — shell, identity, входные аргументы и terminal tool outcome |
| Native instructions | src/harness-runtime/lib/delegation-instructions.mjs и tests — старые task/subtask/task_id; модельное имя и форма subagent должны быть подтверждены |
| Models/discovery | native model probe/catalog callers и discovery — v1 modelID/providerID/variant, команды и конфигурация |
| EVAL | dd-eval: lib/runner.mjs, schemas/run-profile.v*.schema.json, profiles/opencode-server-*.json, qualification/pins/readback |
| Регрессии | test/fixtures/opencode-adapter.mjs, adapter-progress, daemon-operations/progress, runtime-owner, native-adapter-contracts, delegation-instructions |
| Документация | README адаптера, runbooks/update-harnesses.md, execute-eval.md, native payload inventory; specs/015 и старый research остаются историческими |

Перед изменениями провести git grep по актуальной ветке: opencode,
opencode-server, @opencode-ai, /global/health, /session/status, /children,
modelID, task_id, subtask, API fingerprint и baseline. Проверить каждое попадание
по смыслу; не переименовывать общие/чужие task поля механически.

## A. Уточнить native контракты до их реализации

Небольшой disposable home и отдельный v2-бинарь; не заменять пользовательский
бинарь для исследования. Сначала локальные probes без модели, затем минимальные
модельные probes для контрактов, которые иначе проверить невозможно.

1. Prompt с заданным message ID: повтор с тем же payload, повтор с другим
   payload, отказ до admission, обрыв ответа после admission. Записать реальные
   результаты; наличие поля id не доказывает идемпотентность.
2. Связь inbox ID → delivered → assistant message(s) → execution outcome.
   Execution events SDK содержат sessionID, не prompt ID: доказать причинную
   связь при одном owned prompt, compaction/retry и нескольких assistant steps.
3. Session log: replay after sequence, граница snapshot/live, повторные events,
   пропущенные text/reasoning/tool deltas и разрыв/переполнение volatile stream.
   Проверить, что сообщения/snapshots позволяют восполнить необходимые данные.
4. Tool hooks: реальное имя/аргументы shell и subagent, input replacement,
   exception/deny до эффекта, after success/error, фактический cwd и env child.
   Не считать permission action названием model tool без проверки каталога.
5. Child topology, fork lineage, pagination, cancel с prompt в очереди,
   выполняющимся shell и child; экспорт/импорт в новый private home.
6. Private service registration, выбранные пути БД/config/auth, startup/stop,
   plugin загрузка и готовность без вмешательства в общую пользовательскую службу.

Результат: краткая таблица подтверждённых полей/семантики с version/hash и
проверками. Если безопасного replay нет — observation/reconciliation only,
никакого resend. Если required child/cwd/outcome не наблюдаем — blocker
квалификации, а не успешный результат с синтетической identity. Не добавлять
custom RPC или чтение SQLite без доказанного пробела штатного API.

## B. Один v2 transport, общий runtime

- Заменить OpenCodeClient v1 официальным Promise API @opencode/client через
  существующий небольшой модуль dd-opencode.mjs. Не строить общий provider
  framework и не переносить engine на Effect. Удалить v1 routes/парсеры после
  перевода callers; не оставлять runtime branch по major version.
- Сохранить внешний daemon command/JSON контракт там, где смысл не изменился.
  Native protocol=2 записывать явно. Новое persisted state/archive получает
  новую schema version; legacy state отклоняется до productive dispatch с
  инструкцией использовать архивный engine. Не мутировать v1 state при чтении.
- Для неоднозначных состояний переиспользовать durableDaemonDispatch,
  dispatch-fence, operation-errors, observation-clock, managed-daemon,
  session-settlement и retained Session registry. Не дублировать их в v2 SDK layer.
- Штатная session.resume остаётся read-only inspect. Продолжение работы —
  явный новый prompt в той же Session с новой operation identity; resume flag
  native interrupt не становится разрешением скрыто продолжать исполнение.
- Установка зависимостей через package manager проекта в отдельном checkout;
  проверить packed engine и импорт SDK/plugin вне source/node_modules. Плагин
  должен загружаться из доступного pinned пакета без сетевой загрузки latest.
  Использовать Promise entrypoints; не устанавливать optional TUI/solid пакеты
  ради server plugin. Транзитивный Effect в plugin SDK не означает перевод
  нашего runtime на его framework; состав зависимостей проверить по lockfile.

## C. Admission → работа → результат

- До POST durable сохранить operation ID, Session ID, выбранный prompt/message
  ID и исходную observation boundary. Один productive prompt на owned Session;
  не разрешать посторонний inbox или внешний клиент как часть этого протокола.
- Ответ prompt означает admission, не assistant result. Сверить возвращённую
  identity; сохранять inbox receipt отдельно от исполнения и terminal result.
- Подписаться до dispatch; после admission связать доставку, новые сообщения и
  execution outcome по проверенным в A правилам. Старый assistant или idle
  до доставки не завершает новую операцию. Учитывать несколько model steps,
  tools, compaction и native retries; финальное сообщение может не быть первым.
- При потере HTTP acknowledgement/observer читать inbox/log/messages и durable
  operation record. Не повторять create/prompt/fork с новым ID. Если native
  эффект не доказан и не опровергнут — operation_observation_lost/unknown,
  сохраняются handles; controller не получает разрешения на retry.
- Crash после admission и до сохранения receipt, после native completion и
  до local persist, client reconnect и повтор daemon request должны дать ту же
  операцию/settled receipt, не новую модельную работу.
- Таймаут — скользящий по новым model/tool событиям в текущем causal scope,
  включая работающих потомков. Повторные events, старый replay, busy, polling
  и service heartbeat не продлевают его. Child baseline фиксируется так, чтобы
  не потерять уже начавшуюся работу между обнаружением child и первым read.
- Live event stream — ускорение наблюдения; cursor log и native snapshots —
  восстановление. Cursor сохраняется после обработки; повтор безопасен.
  Отделить чтение stream от медленного hook/ingest, ограничить буфер. Overflow
  означает reconciliation, не безграничную очередь и не ложное completion.
- Settlement включает inbox, execution, shell и owned descendants. idle либо
  204 wait отдельно не доказывает успех; Work success остаётся lifecycle receipt.

## D. Принадлежащий dd-flow plugin и native специфика

- Переписать generated plugin на @opencode/plugin Plugin.define с постоянным
  id, setup и cleanup. Tool before содержит sessionID/messageID/id(input);
  after — completed/error. Сохранить common trusted ingress и проверку ownership.
- Нормализовать shell/tool names на границе адаптера, сохраняя original name.
  Compound-command parser и lifecycle admission/retry работают общим механизмом.
  Нет специальных для OpenCode обходов контроля Work/Stage.
- Envelope строится из actual Session/location и фактического tool input;
  ctx.location — место загрузки плагина, не доказательство cwd инструмента.
  ShellCreateBefore даёт cwd/env, но не Session ID/Call ID: запрещена корреляция
  через глобальный last session. В A подтвердить явный cwd input либо native
  причинную связь. Если её нет, требовать доказуемый qualified execution binding;
  не выдавать prompt-only cwd за native proof и не разрешать ambiguous lifecycle.
- Денай/ошибка before не допускают исполнение. updatedInput применяется до
  запуска. Учитывать повтор before, потерянный after и рестарт плагина: receipt
  восстанавливается по native identity, не только из in-memory participating Set.
- Перевести только OpenCode-блок общих delegation instructions на подтверждённый
  v2 tool/schema. Поведение launch/wait/partial/failure/retry остаётся общим;
  не выдумывать subagent parameters по старой форме task.
- Подтверждать provider/model/variant/agent для root и children из native readback,
  а не из DD_OPENCODE_* среды root. Fork ancestry хранить отдельно от direct-child
  membership. Все страницы topology/messages обходятся с dedup/cursor guard.

## E. Configuration, cwd и owned service

- Спавнить собственный private сервер через существующий managed process lifecycle;
  не вызывать SDK Service.ensure/stop с default registration. Проверить CLI flags
  selected version в A; SDK нужен для клиента, не для подмены нашего ownership.
- Изолировать data/config/cache/state/DB и registration. Loopback, private auth,
  права файлов, process birth identity; не наследовать ambient server/DB selectors.
  Не обращаться к пользовательскому демону, включая cleanup после failed start.
- Копировать только нужную portable provider/model/agent config и credentials
  через подтверждённый v2 механизм. Старое copy auth.json не является достаточным
  доказательством входа. Secrets не попадают в journal/status/artifact manifests.
- Native config v2 генерируем только для принадлежащего нам private home.
  Не переносить сторонние plugins, runtime DB, Sessions и cache как qualification.
  Сохранить ограничения admin/system policies; не обходить deny ради EVAL.
- При последующей глобальной замене v1 сохранить прежний executable/config и
  сделать SQLite-aware backup пользовательских данных, если установка затрагивает
  их: не копировать один live .db без WAL. Сначала проверить отсутствие активных
  пользователей этого runtime; чужие процессы не останавливать автоматически.
  Rollback восстанавливает согласованный v1 backup, не открывает v2 БД старым
  бинарём. Не выполнять автоматическую конверсию общих конфигов/TUI за рамками
  необходимой установки; сторонние hooks остаются вне задачи.
- Requested cwd и native location readback должны совпадать. Stage handoff в
  другую feature workspace использует существующее правило новой Session,
  не скрытый move активной. Пути tools/env и сценарий нескольких roots проверяются.
- Если runtime не предоставляет LSP diagnostics, действующие deterministic
  lint/typecheck/tests продолжают выполняться. Не обещать LSP и не ослаблять gates.

## F. Errors, interruption, usage и archive

- Нормализовать structured errors в общий classifier с safe diagnostic allowlist:
  auth, quota/reset time, rate limit, overload, tool denial, transport/unknown.
  Не объявлять любой 429 overload. Native retry scheduled/willRetry учитываются:
  controller не шлёт продолжай, пока native retry/loop/inbox ещё активен.
- После terminal recoverable capacity error использовать общую действующую
  continuation policy в той же Session. Quota/auth не уходят в бесконечный retry.
- Cancel: остановить новые dispatch, interrupt(resume=false) только owned Session,
  явно обработать owned queued inbox и descendants, дождаться native settlement.
  Нельзя очищать чужой inbox или считать прерванный HTTP отменой модели.
- Shutdown: existing waitForSettlement/completeDaemonShutdown, точный owned process,
  native cleanup даже после failure; неоднозначность сохраняет evidence и primary
  error. Forced termination не маркируется успешным clean stop.
- Usage адаптировать к v2 token schema; сообщения/events не суммировать дважды,
  root/child учитывать как physical Sessions. Missing != zero, неполные данные
  помечать неполными. Проверить cache/reasoning total semantics, cost availability.
- Fork/export/import подтвердить A и отразить capabilities. Архив включает
  native version/protocol/location/provenance без secrets; v1 import в v2 не
  поддерживаем. Не добавлять сравнение всего history/home как блокирующую
  гарантию: проверяется нужная boundary/identity, digest служит provenance.
  Unsupported optional операция возвращает понятный capability error; required
  операция остаётся qualification blocker, не получает synthetic fallback.

## G. Compatibility, EVAL и документация

- До launch проверять major v2 и необходимые API/plugin capabilities через
  безмодельный doctor. Удалить exact v1 version и whole OpenAPI fingerprint gate.
  Непроверенная v2 версия — кандидат для targeted conformance, не автоматический
  PASS и не поддержка «любой установленной». Runtime version/hash — provenance;
  изменение несвязанной части API не повод повторять все модельные проверки.
- Сохранить --opencode-bin, opencode-server и общие профили. Обновить фактические
  pins/qualification receipts, diagnostics/model catalog/usage reader в EVAL;
  no-flow probe и productive hook qualification — разные проверки.
- Judge/Decisions, канонический пакет и пороги этим изменением не меняются.
  Не требовать заново квалифицировать неизменный Judge из-за native upgrade.
- Inventory service artifacts обновить по назначению: ephemeral private state
  не контролировать как неизменный продукт. В provenance нужны selected executable,
  adapter/plugin/config contract и pins, не hash всей native home.
- Обновить operational runbooks кратко: v2 package, backup/restore, private homes,
  doctor/conformance, owned hook installation/readback, preflight/launch/cleanup.
  specs/015 и v1 research пометить historical со ссылкой на 083, не переписывать
  историю как будто v2 был квалифицирован раньше.

## H. Проверки и приёмка

Расширять существующие fixtures/contract suites, не строить второй test harness.
Моки должны моделировать queue и события v2, а не возвращать v1 assistant reply.

| Обязательный сценарий | Что доказывает |
| --- | --- |
| POST ack без assistant; idle до delivered; несколько steps | admission не выдаётся за completion |
| acknowledgement loss, повтор request, crash/persist boundaries | нет повторного native dispatch |
| reasoning-only, tool-only, child progress; duplicates/replay | правильный скользящий timeout |
| disconnect/overflow/log catch-up, pagination | восстановление без потери identity и без ложного progress |
| shell compound lifecycle, deny before effect, updatedInput, missing after | общий admission и корректное завершение CLI |
| root + минимум два direct children, child continuation, чужой child | topology/profile/cwd/Work ownership |
| overload/native retry, quota/auth/unknown | правильный classifier и отсутствие двойного продолжения |
| inbox/shell/child cancellation; partial startup; foreign service | безопасная остановка и отсутствие чужих эффектов |
| packed engine/plugin, offline dependency load, private credential readback | исполнимость установленного, не только source checkout |
| malformed responses, missing usage, legacy state/archive | отказ без синтетических успехов и без порчи истории |

Typecheck/build/lint, затронутые contracts и required release gates по правилам
проектов; реальные проверки выполняются на точном проверяемом candidate tuple.
После локальных gates — native conformance, productive hooks, SPECIFY-only,
затем полный scored E2E на доступной согласованной модели. Нет вручную изменённого
продукта, повторного старого run или неподтверждённых pins ради PASS.
Успех приёмки: baseline → все Stage → terminal finished, отдельные Work/repair
receipts и Judge assessment, usage/Decisions evidence, owned cleanup. Native
quota/внешний outage не доказывают дефект адаптера, но не засчитывают полный E2E.

## Порядок реализации и готовность

1. A: контрактные probes и точный tuple. Решить доказательно causal mapping,
   cwd binding и credential loading до реализации обещающих их гарантий.
2. B/C/E: v2 transport, isolation, durable queue/observer, doctor/state boundary.
3. D/F: plugin, instructions, topology, ошибки, cancellation, usage/archive.
4. H: регрессии и packed candidate; G: EVAL/pins/runbooks.
5. Release/installation → conformance → SPECIFY → full E2E отдельной задачей
   исполнения. Для будущей реализации явно подтвердить разрешение на живые
   модельные probes/запуски, поскольку текущая задача — план, не запуск.

Приняты архитектурные решения: один v2-only адаптер, Promise SDK, собственный
managed server, общие flow/Work/timeout/retry механизмы, старые состояния не
продолжаются новым адаптером. Не доказанные native детали перечислены в A с
безопасными исходами; это первый пакет работ, а не скрытые предположения.

Проверка ponytail: не добавляем dd-opencode2, protocol factory, custom SDK,
универсальную migration framework, shared-service manager, новый Judge или
контроль неизменности всего home. Только необходимые native изменения и
регрессии на каждый рисковый causal/lifecycle boundary. Исторический v1 живёт
в неизменяемом теге; текущий код после перехода обслуживает только v2.
