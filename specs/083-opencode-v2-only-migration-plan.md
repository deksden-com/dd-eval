# 083 — переход dd-opencode на OpenCode v2

Статус: код v2 реализован, полный локальный release gate пройден; engine
beta.135 опубликован и интегрирован, OpenCode 2.0.28 установлен. Подробности в receipt реализации. Scored
SPECIFY/E2E не запускаются по текущему указанию пользователя. Техническая
conformance на native 2.0.28 использует локальный deterministic provider stub.
Дата исследования: 2026-10-13.

## Решения и границы

- Переходим на v2 единственным актуальным адаптером. Не сопровождаем v1/v2
  параллельно, не добавляем новую семью harness и не создаём dd-opencode2.
  Сохраняем dd-opencode, opencode/opencode-server и общий контракт engine/EVAL.
- Меняется native transport и принадлежащий dd-flow плагин; Stage, Work,
  lifecycle instructions, repair, Judge и Decisions остаются общими.
- Сторонние плагины, в том числе moshi-hooks.ts, исключены из анализа,
  реализации и критериев приёмки. Изолированный EVAL не загружает их.
- Реализация включает обновление установленного OpenCode. Пользовательскую
  конфигурацию, сторонние плагины, активные runtime homes и исторические EVAL
  не изменяем; новые эвалы отложены отдельным указанием пользователя.
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

Итоговые version/hash, integration/release gates и установка фиксируются в
[receipt реализации 083](../runbooks/cp-083-opencode-v2-implementation.md).
Native tuple пока не является принятым scored E2E tuple.

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

### Дополнительное исследование readiness

Исходники изучены на точном upstream теге
[v2.0.28](https://github.com/anomalyco/opencode/tree/v2.0.28), commit
026b106bc5d41b679ffc413264229c340871e4d3. Движущаяся ветка v2 не используется
как доказательство поведения этого кандидата. Уточнены следующие контракты:

- Inbox reconcile сопоставляет Session и тип, но не новый text/payload:
  first admission wins. Повторный prompt также может вызвать execution.wake.
  Значит, server idempotency не заменяет нашу проверку запроса и не разрешает
  безусловный повтор POST. [Inbox](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/session/inbox.ts),
  [prompt](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/session/session.ts).
- Shell действительно называется shell и принимает command/workdir/timeout/
  background. Foreground default timeout — 120000 мс, 0 отключает native timer.
  shell hook вызывается раньше присваивания OPENCODE_SESSION_ID; брать Session
  из этой env в hook нельзя. [Tool](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/tool/plugin/shell.ts),
  [создание shell](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/shell.ts).
- Subagent принимает agent/description/prompt и optional model/sessionID/
  background. Модель выбирается explicit model → agent.model → parent.model;
  omission model не гарантирует наследования. Фоновое завершение создаёт native
  notification и может возобновить parent. [Subagent](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/tool/plugin/subagent.ts).
- Native managed service восстанавливает orphaned execution claims с at-least-once
  semantics. Это не read-only inspect. Обычный unregistered serve не включает
  этот boot sweep: выбран именно он, без --service/--stdio и общей registration.
  [Boot](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/server/src/process.ts),
  [restart](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/session/execution/restart.ts).
- Credential migration импортирует auth.json при миграции БД; копия файла в уже
  подготовленный home не означает повторный импорт. [Legacy import](https://github.com/anomalyco/opencode/blob/v2.0.28/packages/core/src/database/migration/20260805200742_import_legacy_credentials.ts).

В нашем managed-daemon.mjs mapping включает opencode-daemon, но не
opencode-provider, который регистрирует dd-opencode-daemon.mjs. При наличии
owner.budget provider registration получает undefined harness. В B/E добавить
точное сопоставление и регрессию этой productive ветки; не обходить budget gate.

### Уточнения, подтверждённые во время реализации

- CLI 2.0.28 по умолчанию не сохраняет payload событий: session.log может
  вернуть только log.synced. Durable authority — projected user/idle с точным
  outcome/error. Volatile events ускоряют observer, но не заменяют эту проверку.
- Running shell snapshot может ещё не содержать shellID; native tool.progress
  передаёт его отдельно. Handle сохраняется в operation observer; пропуск
  события восполняется только однозначным shell.list readback (Session,
  message-time boundary), затем shell.output cursor отслеживает новые байты.
- Native плагин исполняется embedded Bun: process.execPath там — opencode,
  а не Node. В launch binding передаётся выбранный Node executable.
- Autodiscovery загружает plugins/*.js или *.ts, не *.mjs; configured local
  plugin — directory. Принадлежащая нам wrapper *.js импортирует pinned factory.
- Snapshot install раньше дублировал общий dependency DAG под каждым parent.
  Применено стандартное Node hoisting с локальными конфликтующими версиями;
  ESM-only packages разрешаются по package root, не require export condition.
- Native export — один physical Session. V2 archive явно содержит parent-first
  exports root и всех descendants; import валидирует дерево до первого эффекта.
  Исторические v1 archives не конвертируются.
- Promise client и Plugin.define поставляются неизменёнными upstream assets
  в engine: optional AI/Effect/TUI dependency graph не устанавливается при
  каждом холодном hook/snapshot запуске. Offline packed проверка обязательна.
- Topology и root messages читаются раздельно. Если native child notification
  появился между ними, observer повторно подтверждает ancestry read-only до
  классификации; notification без native parent proof остаётся чужим вводом.
- При локальном full gate обнаружены заниженные guards в существующих
  recovery fixtures: настоящий cold CLI ограничивался 15с, а physical-stop
  scenario переопределял общий CI envelope теми же 15с. Fixtures используют
  существующий CI envelope; production watchdog/ownership checks не меняются.

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
7. Native questions/forms/permissions, code-mode обёртки, background notifications
   и failure/cleanup hooks: какие из них создают дополнительный inbox/loop и какие
   IDs доступны до эффекта. Проверить уникальность Call ID в scope Session/message,
   включая несколько shell subcalls одной code-mode tool call.

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
- Root create передаёт location.directory, agent и Model.Ref
  {providerID,id,variant?} из выбранного профиля. V2 prompt не принимает старый
  modelID/variant payload: нужный model/agent уже выбран и подтверждён в Session.
  Переключение — только на settled Session по явной authority, не во время
  observer readback. Native отсутствие variant не подменяется строкой default.
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
- Использовать native message ID с префиксом msg_, создать один раз до dispatch.
  Сохранить digest полного нашего request (text, attachments, metadata, delivery
  и смысловых selectors) рядом с existing durable operation, не вводить новый
  универсальный store. Один operation/ID с другим request отклоняется локально.
  Сравнение request — защита от двух разных заданий под одним ID, не контроль
  неизменности transcript или native home. Payload с секретами не журналируется.
- Наш direct prompt явно delivery=queue, resume=true после proven settlement;
  default steer не использовать. При uncertain ack — GET reconciliation, не
  повторный POST даже с тем же ID. Если эффект точно no_effect, retry проходит
  только общую authority-политику. Для continuation после terminal failure —
  новый operation/message ID в прежней Session, не replay старого prompt.
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
  SDK onActivity учитывает в том числе keepalive chunks: его нельзя подключать
  к model liveness. HTTP/stream activity и semantic progress разделены. В client
  2.0.28 запрос идёт через fetch без штатного retry middleware; не добавлять
  automatic retries POST в custom fetch. Transport recovery не retry dispatch.
  Хранить cursor/high-water и ограниченные in-flight identities, не все hashes
  каждой версии transcript за всю жизнь Session.
- Settlement включает inbox, execution, shell и owned descendants. idle либо
  204 wait отдельно не доказывает успех; Work success остаётся lifecycle receipt.
- Causal scope включает native synthetic completion notifications owned shell/
  subagents, а не только внешний user prompt. Это допустимые сообщения внутри
  той же операции, не foreign contamination. После parent execution.succeeded
  дочитать cursor/inbox/children, чтобы не пропустить ещё не доставленный child
  result и последующий parent loop. Посторонняя input или неизвестная synthetic
  причина сохраняет evidence и даёт понятный blocker; её не удаляем автоматически.
- Progress dedup/cursors — по Session и текущей operation, не общей временной
  метке сервера. После разрыва old replay не сдвигает окно по времени чтения;
  missed signal не заменяется фактом reconnect. Если восстановление показывает
  новый эффект, использовать существующее правило fresh observation один раз.
  Если log не покрывает gap, читать native snapshots; если causal outcome всё
  ещё не доказан, возвращать unknown, не guessing по последнему assistant.
- Для блокирующего shell одного tool.started недостаточно: связать native
  shellID через tool progress/metadata с owned Session/Call, читать новые output
  bytes по cursor штатным API и подавать их общему observer как tool progress.
  Повтор одного tail, рост файла чужого shell и heartbeat не продлевают окно.
  Тишина действующего процесса остаётся тишиной; timeout=0 не снимает общий
  контроль liveness и не разрешает orphaned shell жить после cancel.

## D. Принадлежащий dd-flow plugin и native специфика

- Переписать generated plugin на @opencode/plugin Plugin.define с постоянным
  id, setup и cleanup. Tool before содержит sessionID/messageID/id(input);
  after — completed/error. Сохранить common trusted ingress и проверку ownership.
- Нужен default export; await регистраций Promise hooks в setup до plugin-ready.
  Native server ready и plugin-ready — разные условия. В productive doctor
  сверить принадлежащий нам loaded plugin и launch binding; --no-flow не требует
  dd-flow plugin и не выдаётся за проверку productive admission. Не добавлять
  custom RPC для готовности, если native plugin list/status достаточно.
- Нормализовать shell/tool names на границе адаптера, сохраняя original name.
  Compound-command parser и lifecycle admission/retry работают общим механизмом.
  Нет специальных для OpenCode обходов контроля Work/Stage.
- Event key включает daemon/Session/message/Call ID и phase; одинаковый Call ID
  другого message не replay. Для вложенных code-mode calls проверить native
  discrimination в A; не добавлять random ID при каждом callback, который
  скрыл бы настоящий повтор. Если несколько subcalls неразличимы до эффекта,
  lifecycle использует отдельный native shell call с issued invocation, а не
  неоднозначную обёртку; другие обычные tools не запрещаются blanket policy.
- Envelope строится из actual Session/location и фактического tool input;
  ctx.location — место загрузки плагина, не доказательство cwd инструмента.
  ShellCreateBefore даёт cwd/env, но не Session ID/Call ID: запрещена корреляция
  через глобальный last session или ещё не установленный OPENCODE_SESSION_ID.
  Выбранный binding — qualified native shell input.workdir, разрешённый относительно
  actual Session location. Owned before hook нормализует/фиксирует explicit workdir
  до native permission и spawn; учитывает cd внутри compound command общим parser.
  В A доказать, что после updatedInput native запускает именно этот workdir.
  Shell hook не служит источником lifecycle identity. Если доказательство не
  получено, productive admission остаётся blocker, не prompt-only fallback.
- Денай/ошибка before не допускают исполнение. updatedInput применяется до
  запуска. Учитывать повтор before, потерянный after и рестарт плагина: receipt
  восстанавливается по native identity, не только из in-memory participating Set.
- Ошибка callback должна попадать в native tool failure до spawn: явно проверить
  deny, timeout/IPC failure и Promise rejection отдельно. SDK Promise hooks и
  Effect failure channel нельзя считать эквивалентными без проверки. При failed
  admission нельзя log-and-allow. Native tool after.status=completed означает
  завершение вызова инструмента, а не exit=0 shell: проверять structured exit,
  signal, timeout и status=running/shellID. Без terminal CLI result не Work finish.
- Для принадлежащих flow shell calls задать timeout=0 и background=false до
  запуска, чтобы native 120s не обрывал живой CLI. Liveness/cancel остаются под
  общим observer. При deliberate bounded command сохранять её явный лимит,
  если это предмет проверки, не менять все tools blanket policy. Если отдельный
  tool backgrounded пользователем/native runtime, удерживать shellID и отслеживать
  его реальный terminal outcome; не replay CLI вслед за ранним tool result.
- Перевести только OpenCode-блок общих delegation instructions на подтверждённый
  v2 tool/schema. Поведение launch/wait/partial/failure/retry остаётся общим;
  не выдумывать subagent parameters по старой форме task.
- Подтверждать provider/model/variant/agent для root и children из native readback,
  а не из DD_OPENCODE_* среды root. Fork ancestry хранить отдельно от direct-child
  membership. Все страницы topology/messages обходятся с dedup/cursor guard.
- Native tool — subagent с agent/description/prompt. Fresh child: без sessionID;
  continuation: реальный owned direct-child ID, не task_id. Для согласованного
  worker agent исключить неожиданный agent.model override до запуска (owned
  config соответствует requested tuple); затем проверить actual model каждого
  response. Agent mode должен допускать subagent, depth=1 допускает direct children
  и запрещает grandchildren. Возможность background нужна для native fanout;
  ожидание — штатная notification, не придуманный native polling tool и не новый
  root prompt. Никаких присвоенных вручную Session IDs для children.

## E. Configuration, cwd и owned service

- Спавнить собственный private сервер через существующий managed process lifecycle;
  не вызывать SDK Service.ensure/stop с default registration. Проверить CLI flags
  selected version в A; SDK нужен для клиента, не для подмены нашего ownership.
- Конкретный launch: serve --hostname 127.0.0.1 --port <owned-port>, без --service
  и --stdio. OPENCODE_DB — явный absolute private path; config/project selectors
  нормализуются из owned config. Native auto-recovery managed service не включать.
  Existing unknown/active-tree state не становится разрешением restart provider;
  сначала общая read-only reconciliation/ownership policy. Не очищать native
  claims SQL-запросом и не вызывать resumeSuspendedSessions из адаптера.
- Изолировать data/config/cache/state/DB и registration. Loopback, private auth,
  права файлов, process birth identity; не наследовать ambient server/DB selectors.
  Не обращаться к пользовательскому демону, включая cleanup после failed start.
  /api/info проверяет readiness и private paths/instance identity выбранного
  сервера. Успешный TCP connect не достаточен. Port collision — failed startup
  либо новый безопасный pre-dispatch bind attempt, не reuse чужого endpoint.
- Копировать только нужную portable provider/model/agent config и credentials
  через подтверждённый v2 механизм. Старое copy auth.json не является достаточным
  доказательством входа. Secrets не попадают в journal/status/artifact manifests.
- Выбранный credential bootstrap: нужные v1 auth entries — до первого открытия
  новой private DB, если подтверждён legacy importer; для действующего v2 config
  — штатный credential/integration API в private server. Не копировать всю
  пользовательскую БД. Повтор setup после migration подтверждает active credential
  readback, а не переписывает auth.json в надежде на повторный importer.
  Не включать credential values в diagnostics; private native DB требует 0600.
- Удалять OPENCODE_PASSWORD/OPENCODE_SERVER_PASSWORD из shell env нашего
  private server: default serve не обещает сам убрать их из наследуемой среды.
  Другие provider secrets не выводить в errors/status. Удаление daemon password
  из child env не меняет auth клиента и не требует Session correlation.
- Native config v2 генерируем только для принадлежащего нам private home.
  Не переносить сторонние plugins, runtime DB, Sessions и cache как qualification.
  Сохранить ограничения admin/system policies; не обходить deny ради EVAL.
- Неинтерактивный productive launch задаёт owned разрешения для нужных tools,
  сохраняя системные policies. Pending native permission/form не маскируется под
  silence timeout и не auto-approved ради PASS. Flow clarification остаётся
  общим HITL через Stage CLI/Judge. Неожиданный native form/permission сохраняет
  Session/request IDs и выдаёт operator blocker; его ответ не фабрикуется.
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
- Различать v2 fork(before=<messageID>) и возможный старый смысл through message:
  передавать boundary явно в receipt/CLI документации, не обещать идентичность
  старому messageID API. Root identity и fork ancestry не доказывают direct-child
  Work membership. Read-only recovery не вызывает fork/import/model switch.

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
| один ID с другим payload; resume/queue/steer; delayed notification | request binding и отсутствие скрытого wake/replay |
| shell живёт >120с, новые output bytes; completed tool с exit!=0 | нет native fixed cutoff и ложного Work success |
| plugin не загружен/не await-registered, location reload | readiness не обходит productive hooks |
| worker с чужой agent.model, background result и parent auto-wake | профиль не подменяется; дерево не завершается преждевременно |
| opencode-provider с owner.budget; секрет в shell env | budget/ownership registration и безопасное наследование |

Typecheck/build/lint, затронутые contracts и required release gates по правилам
проектов; реальные проверки выполняются на точном проверяемом candidate tuple.
После локальных gates — native conformance, productive hooks, SPECIFY-only,
затем полный scored E2E на доступной согласованной модели. Нет вручную изменённого
продукта, повторного старого run или неподтверждённых pins ради PASS.
Успех приёмки: baseline → все Stage → terminal finished, отдельные Work/repair
receipts и Judge assessment, usage/Decisions evidence, owned cleanup. Native
quota/внешний outage не доказывают дефект адаптера, но не засчитывают полный E2E.

## I. Обновление установленного OpenCode

Обновление самого runtime — обязательная часть будущего выполнения 083,
не только выпуск нашего engine. Параллельного сопровождения не появляется:
candidate binary временно отдельный для безопасной проверки, после приёмки
обычная команда opencode указывает на v2; v1 остаётся только в rollback backup.

1. Inventory: type -a/command -v/realpath/version и installation owner.
   Сейчас /Users/deksden/.opencode/bin/opencode — обычный Mach-O arm64 v1,
   не package-manager symlink. Проверить это заново перед заменой; не сносить
   глобальные npm/pnpm пакеты на основании одного имени команды.
2. Скачать точный @opencode/cli-darwin-arm64@2.0.28 artifact через registry,
   проверить npm integrity и hash extracted binary. SDK/plugin/engine pins
   относятся к тому же проверяемому tuple. Download не запускает default service.
3. Сохранить v1 executable, checksum, прежние config и данные при необходимости
   SQLite-aware backup. Backup credentials хранится приватно, не в Git/receipt.
   Проверить active users/daemons/EVALs по exact binary/process identity. Если
   runtime занят, не заменять его автоматически: завершить его использование
   согласованно либо отложить глобальную замену; candidate tests идут отдельно.
4. На candidate binary с отдельным home провести --version/--help/paths,
   v2 doctor, native/productive conformance и локальные gates. Не использовать
   пользовательскую Session DB как тестовые данные. Сохранить legacy config,
   кроме нашего private generated config; сторонние плагины не исправлять.
5. Установить те же проверенные native bytes в прежний command path. Для
   текущей direct установки использовать официальный v2 installer с
   --binary <verified-binary> --no-modify-path; перед исполнением просмотреть
   и сохранить выбранный installer. Не использовать curl latest | bash без
   выбранной версии/artifact. Если ownership изменился на package-managed,
   применять только его штатную замену, не смешивать два installation owner.
   Alias opencode2 installer может создать сам; наш dd-opencode2 не добавляется.
6. После установки: сбросить shell command cache, проверить type -a, абсолютный
   path, --version и hash. Подтвердить отсутствие старого shadowing binary.
   Никаких правок PATH/config shell при уже доступном ~/.opencode/bin.
7. Выпустить/установить проверенный engine с v2 dd-opencode, обновить именно
   owned dd-flow plugin и pins. Исторические EVAL homes остаются pinned к своему
   engine/native tuple. Fresh EVAL использует explicit --opencode-bin, не
   случайный PATH и не default shared daemon.
   Глобальную native замену и обновление установленного engine выполнять в
   одном maintenance окне после candidate conformance; между ними не запускать
   flow на несовместимой паре. Наш plugin привязан к выбранному engine, а не
   становится бесконтрольным глобальным плагином пользовательского OpenCode.
8. Выполнить post-install doctor/plugin check и conformance на selected bytes,
   затем SPECIFY и полный E2E. Сохранить candidate/accepted receipts отдельно.
   Только успешная приёмка переводит candidate tuple в accepted.
9. Если installation/readback сломан — восстановить v1 executable и прежний
   согласованный config/data backup; активные v2 runs не переключать на v1.
   Если не прошёл лишь scored E2E по quota/provider outage, не разрушать
   установленный v2 автоматически: tuple остаётся candidate с явным blocker.

Успех установки не требует работоспособности сторонних plugins: это явная
граница пользователя. Не считать их отсутствие/ошибки дефектом нашего
изолированного адаптера и не обещать общую TUI-приёмку сторонних интеграций.

## Порядок реализации и готовность

1. A: контрактные probes и точный tuple. Решить доказательно causal mapping,
   cwd binding и credential loading до реализации обещающих их гарантий.
2. B/C/E: v2 transport, isolation, durable queue/observer, doctor/state boundary.
3. D/F: plugin, instructions, topology, ошибки, cancellation, usage/archive.
4. H: регрессии и packed candidate; G: EVAL/pins/runbooks; I: native upgrade.
5. Release/installation → conformance → SPECIFY → full E2E отдельной задачей
   исполнения. Для будущей реализации явно подтвердить разрешение на живые
   модельные probes/запуски, поскольку текущая задача — план, не запуск.

Required для приёмки: root create/prompt/inspect/continuation, native child
fanout и lifecycle hooks, profile/cwd proof, progress/error/settlement/cancel,
owned cleanup, usage completeness reporting. Fork/archive/import проверяются
и сохраняются при доказуемой семантике, но не блокируют fresh E2E, если ни один
caller выбранного flow их не требует; unsupported capability явно отражена.
Если выбранный flow действительно требует их, это обязательный gate, не
автоматический свежий root вместо продолжения.

Doctor — доступность/readiness/config/capability без модели. Qualification —
техническая проверка нужного tuple. Scored E2E — результат работы flow/product,
а не ещё один псевдо-PASS doctor. Для development fixtures использовать mock
provider/event traces; модельные probes не должны быть обязательной частью
обычных unit tests. Расширить существующие gates и фиксировать их реальные
команды/отчёты, не заявлять живую приёмку по одному мок-тесту.

Разрешения на будущее исполнение: реализация плана включает code/tests/pack
и установку выбранного native runtime по I. Живые probes/SPECIFY/full E2E
требуют отдельного явного запроса на запуск и выбранного доступного профиля;
в текущей readiness-задаче они не выполняются. Не добавлять специальные
согласования для каждого обычного implementation шага.

Приняты архитектурные решения: один v2-only адаптер, Promise SDK, собственный
managed server, общие flow/Work/timeout/retry механизмы, старые состояния не
продолжаются новым адаптером. Не доказанные native детали перечислены в A с
безопасными исходами; это первый пакет работ, а не скрытые предположения.

Проверка ponytail: не добавляем dd-opencode2, protocol factory, custom SDK,
универсальную migration framework, shared-service manager, новый Judge или
контроль неизменности всего home. Только необходимые native изменения и
регрессии на каждый рисковый causal/lifecycle boundary. Исторический v1 живёт
в неизменяемом теге; текущий код после перехода обслуживает только v2.
