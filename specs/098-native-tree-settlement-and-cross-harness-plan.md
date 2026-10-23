# 098 — Native tree settlement: AGY inspection и общие границы доверия

Дата: 2026-10-23. Статус: реализация candidate выполнена; native-приёмка AGY P3
частичная, production qualification не выдана. Результаты и границы:
[implementation receipt](098-implementation-report.md). Release и новые scored EVAL не запускались.
Результат последующего ревью и исправлений: [review receipt](098-review-report.md).

## 1. Цель и границы

Для всех harnesses различать: terminal ответа, завершение native дерева,
физическую остановку, semantic Work/Stage outcome и готовность capture.
Получать доказательство native settlement без нового запроса модели.
Неизвестность не превращать в успех, но старый отрицательный сигнал не должен
навсегда запрещать более свежий доказанный idle.

Меняем engine/harness/tooling/EVAL consumers, не продукт и не judged ожидания.
Working/historical EVAL, runtime DB, receipts и pinned binaries не менять.
Не внедрять один native protocol во все harnesses: едины значения и требования
к proof, различны адаптеры получения фактов. Droid включён в parity audit,
но не добавляется шестым EVAL к ранее запрошенным пяти.

### 1.1. Уже сделано — не реализовывать повторно

Зависимость: [097 implementation receipt](097-implementation-report.md).

| Harness/общий слой | Закрыто в 097 | Что остаётся в 098 |
| --- | --- | --- |
| Luna/Codex HITL | Полный accepted packet, стабильный overload prompt, postcommit publication recovery без второго resume | Проверка общих native/capacity границ; не новый вариант HITL-промпта |
| Grok/общий lifecycle | Trusted repair до serialization, атомарный successor и текущий finish, canonical public paths | Общая reconciliation противоречивых tree facts |
| OpenCode | Native candidate TypeError/ReferenceError attribution, ранний test typecheck | Согласованность idle/tool/tree inspection |
| ZCode/tooling | Target/epoch scoped browser observation, gap recovery, bounded partial @2 | Регрессии native tree consumers, без изменения locator/matcher продукта |
| AGY | SUCCESS/missing Stop не proof, physical/native split, ACTIVE mapping, same-generation stale/duplicate guards | Native RPC + устранение arrival-generation доверия Stop |

Engine `6aa020e8` (base `a8d1318a`), EVAL `610e3ef` (base `196680e`), source
scored `d7d5f49` + `f744b4c`; equivalent source-main `56a9fbe` + `632777a`
на базе `51aec3f`. Это опубликованные implementation branches, не уже выпущенный
engine и не автоматически интегрированный main. Перед реализацией сверить актуальные
ветки/PR и сохранить смежные изменения. Не сливать старую product history scored-source.

Ошибки типов существующих API/browser tests, открытые расширенным typecheck,
не исправлять вручную ради baseline PASS и не исключать из tsc: их обрабатывает
штатный candidate repair. Их наличие не означает defect нового runner evidence.

## 2. Подтверждённые дефекты и отдельные вопросы

Пути ниже относительно engine `6aa020e8`, если не указан EVAL.
Структурный code defect не объявляется доказанной причиной исторического EVAL.

| ID | Факт и системная причина | Точка исправления |
| --- | --- | --- |
| N01 | AGY session.inspect читает transcripts и cached receipt, но не native idle barrier. Публичного CLI status нет, однако установленный binary содержит WaitForConversationFullyIdle | dd-agy-daemon.mjs:230,272–332,388–503,783; один private native client |
| N02 | Stop без stepIdx обходит stale-step guard; generation присваивается на момент получения. Delayed Stop Turn N может стать proof Turn N+1, даже после 097 duplicate guard | dd-agy-daemon.mjs:654–682,790–798; Stop → hint либо independently bound proof, свежий native reconciliation |
| N03 | OpenCode busy не учитывает current-turn running/streaming tool parts, хотя native_turn_items.pending учитывает. Возможен settled:true + pending:true; child pending:false задаётся без проверки его tool parts | dd-opencode-daemon.mjs:227–258; единый per-node расчёт из одних native facts |
| N04 | Droid missing/null/{} task catalog превращается в invocations=[] и topologyIncomplete=false; записи без обязательных identity пропускаются. Root idle + неизвестный child может выглядеть полным пустым деревом | dd-droid.mjs:39,441–456,491–496; shape/coverage validation и retained topology |
| N05 | Общий normalizer предпочитает terminal факты running по rank без доказательства freshness/attempt; tree_observations settled:false игнорируются | native-children.mjs:48–52,69–77,90–111; не выдавать противоречивый набор за terminal |
| N06 | capacityReadiness при allowDescendants=false принимает ids.length===1 вместо exact positive root observation; противоречивый settled:true/unsettled root проходит более слабую ветку | services/provider-capacity.ts:60–75; одинаковая полнота proof в обеих ветках |
| N07 | Legacy EVAL cancellation принимает daemon.stop settled:true даже clean:false за окончание cancellation. Per-execution cancel может стать terminal без all-scope проверки | EVAL daemon-control.mjs:25,55–63; runner.mjs:3488,5750–5774; split ACK/native conclusion |
| N08 | Compact EVAL failureDiagnostic/native_outcome оставляет generic settled, но теряет native_settled, physical_stopped и native_settlement reason/capability | EVAL runner.mjs:2484,2522; bounded allowlist, не копия native payload |
| N09 | При implementation-audit обнаружено: memory-init native-capacity qualification принимает stopped/settled без clean; несколько engine recovery/scope consumers не отвергают explicit native_settled:false | Общий nativeShutdownConfirmed; native-capacity producer/replay, controller/recovery/runtime-scope/history и retained daemon recovery |

N07 не является доказательством ложного candidate PASS: последующий cleanup/report
имеет дополнительные guards, managed-runtime path использует run control.
Исправляем конкретно ложную per-execution cancellation completion projection.
N06 — latent/default API defect: найденные production continueProviderCapacity
callers передают allowSettledDescendants=true. Однако более слабые отдельные
predicates есть в EVAL judge-capacity.mjs:128–133 и runner.mjs:2863–2866,3683.
EVAL legacy directNativeChildren (:3584–3588) повторяет terminal-over-running
правило N05. Эти пути входят в общий фикс; причиной CP243/244 без evidence их не объявлять.

Отдельный обязательный contract reproduction Q01: OpenCode childTree/describe/
cancelTree обходят актуальный children list (`:202–220`, `:244–254`, `:302–321`),
а ранее обнаруженные дети хранятся в sessions. Проверить исчезновение ребёнка до
terminal: native deletion/archive может иметь собственную retirement семантику.
Не объявлять любое исчезновение ошибкой заранее. До доказанного retirement
отсутствие узла не может уменьшать owned inventory и разрешать settlement.

## 3. AGY: что действительно известно

Проверен локальный `agy 1.4.5`, binary SHA256
`0c5ecd1f69c06d57178cc3e9c7be08b84f00207a6182b937243f743576798570`.
В protobuf descriptors и registered service metadata присутствуют:

- `/exa.language_server_pb.LanguageServerService/WaitForConversationFullyIdle`;
- request: conversation_id=1/string, inactivity_timeout_seconds=2/int32,
  stabilization_duration_seconds=3/int32 (deprecated), return_on_executor_error=4/bool;
- response: timed_out=1/bool;
- StreamAgentStateUpdates: fully_idle, background_tasks_update;
- trajectory summary: not_fully_idle, background_task_count, has_running_subagents.

Сохранённые CP243 AGY logs подтверждают отдельные LS HTTP/gRPC endpoints.
Публичный google-antigravity/antigravity-cli не содержит runtime source;
локальный `_Projects/Antigravity` — другой проект, не исходник этого CLI.
Официальный Python SDK имеет wait_for_idle, но не является drop-in observer
существующей CLI Session. Он не заменяет qualification native CLI контракта.

**Наличие метода доказано; whole-tree semantics текущей версии ещё не
квалифицирована.** Старый вывод 097 «inspection недоступен» уточняется: нет
публичной CLI-команды, но найден внутренний version-sensitive candidate RPC.

## 4. Порядок и конкретные решения

### P0 — Установить baseline и минимальные regressions

1. Сверить 097 commits с integration main, зафиксировать tested engine/source/
   bridge/native versions и минимальные immutable CP243/244 evidence refs.
2. На существующих fake-native fixtures воспроизвести N02–N07 и Q01. Исторические
   RUN не становятся тестовыми writable fixtures. Для N01 отдельно wire/native capability.
3. Не запускать полный release suite для получения первоначального RED.

### P1 — Один AGY native inspection client и физическая привязка

- Private модуль рядом с dd-agy-daemon, не новая служба/daemon/framework.
  Native CLI остаётся владельцем agent execution; клиент только наблюдает.
- В args/start добавить абсолютный `--log-file` в state-dir с отдельным locator
  на каждый физический provider launch. Подготовить parent directory до запуска.
- Endpoint discovery только из этого лога; проверить loopback, действующего
  владельца listening socket, PID birth, daemon identity и connection epoch.
  Не доверять glog numeric prefix как PID; не предполагать port+1 и не брать
  последний глобальный лог. Никакого сканирования/подключения к чужому AGY.
- Перед grant проверить native conversation metadata: точный ID, root relation,
  workspace/cwd и нашу сохранённую ownership. Никакого `LoadTrajectory`, resume,
  SendUserCascadeMessage, SignalExecutableIdle, mutation или подмены backend state.
- Протокол: unary gRPC на принадлежащем нам loopback h2c endpoint. Использовать
  проверенный `@grpc/grpc-js@1.14.6` transport и generated protobuf codecs
  `@bufbuild/protobuf@2.16.0` (версии проверены registry 2026-10-22); минимальная
  pinned schema только необходимых read-only методов. Зафиксировать exact versions
  и integrity в lockfile на implementation candidate, codegen tool matching2.16.0,
  проверить Node26/package assets. Не писать собственный gRPC framing/
  trailers/parser и не включать весь Python SDK. Генератор — dev-only,
  generated output — часть built package; build/runtime не скачивают schema.
- В engine сейчас нет готового gRPC/protobuf клиента: это обоснованное локальное
  добавление зависимостей, а не «переиспользуем несуществующий transport».
- Ограничить response/message size, закрывать client/call при cancel/stop;
  не журналировать credentials, metadata token, headers и тело всей trajectory.

P1 acceptance: валидный reply, split frames/trailers через настоящий gRPC client,
nonzero status, malformed/missing message, unknown method, foreign ID, неверный
port owner, PID/port reuse, две одновременные AGY instances. HTTP200 не idle proof.
Пустое **декодированное protobuf** сообщение при status OK допускает default
timed_out=false; пустой HTTP ответ без корректного gRPC completion — нет.

### P2 — AGY reconciliation, а не новая генерация

- После durable terminal/journal запустить один single-flight read-only wait.
  `receipt()` остаётся синхронной projection; не выполнять network I/O внутри неё.
  session.inspect и completePendingTurn используют тот же native observer.
- session.inspect запускает/переиспользует observer, но возвращает доступный
  proof либо typed pending/unknown в пределах существующего adapter request
  budget. Не ждёт внутри inspect весь liveness budget модели. Consumers повторяют
  read-only reconciliation исходной операции по существующему observation budget,
  не отправляют новый prompt и не трактуют pending как очередной overload refusal.
- Не ждать RPC в sequential stdout drain или Stop hook: иначе перестанут
  поступать модельные события и возникнет новый hook timeout/deadlock.
- `return_on_executor_error=false`, deprecated stabilization field не задавать.
  Server inactivity timeout — ограничитель ожидания, не критерий idle.
  Его timeout/error сохраняет pending/unknown; retry read-only observation
  разрешён, повтор productive prompt — нет.
- Численная политика: inactivity_timeout_seconds = ceil(remaining observation
  budget ms / 1000), ограничение 1..2147483647; при exhausted budget новый call
  не запускать. Client-call ограничен оставшимся existing reconciliation budget;
  0/«безлимит» не использовать. Повтор call не обнуляет owning rolling clock.
- Proof принимается только при gRPC OK, decoded timed_out=false, неизменных
  daemon/provider birth/connection/root/Turn generation/operation и activity revision,
  и отсутствии противоречащих текущих task/child facts. Сохранить evidence kind,
  native method/version, request binding и observation revision в существующем journal.
- При ERROR/CANCELLED active может быть снят до inspection. Observer ownership
  берётся из retained terminal metadata исходной operation/generation/connection,
  а не из наличия active. Последующий drain не переписывает исходный ERROR и не
  разрешает новый productive dispatch до обычного admission.
- Stop без доказанной source-Turn привязки — hint для reconciliation, не authority.
  arrival-time generation не доказывает source identity. Обязательно N02 negative
  с identical и altered old no-step Stop после старта нового Turn.
- Любая новая root/child/tool activity инвалидирует proof; запоздалый RPC ответ
  после новой activity/cancel/dispatch не восстанавливает его. После restart
  прошлый clean shutdown разрешает reattach, но не удостоверяет idle нового provider.
- Существующий ObservationClock и реальные reasoning/messages/tool/native task
  events продолжают rolling window. RPC polls/ответ «ещё занят»/heartbeat —
  не model progress. Не вводить общий wall-clock deadline выполнения агента.
- ERROR/CANCELLED и ошибки child остаются исходами ошибок, даже если дерево idle.
  Физическое завершение сохраняется отдельно. При native unavailable — точная
  capability diagnostic; никакого fallback SUCCESS/отсутствие children=idle.
- Перед новым AGY productive launch preflight проверяет доступность inspection
  capability и соответствие native compatibility receipt. Без RPC/другого
  квалифицированного source-bound proof — явный blocker до запуска, не ожидание
  30 минут на каждом Turn. Для уже запущенной операции сохранить unknown.

Начать с wait + metadata. State stream добавлять в этот же клиент только если
native qualification показывает необходимость для актуальности/pending-delivery
и покрытия child/task. Не реализовывать параллельный task scheduler.

### P3 — Native qualification AGY до включения success authority

Узкая совместимость на pinned бинаре, не пять scored E2E и не Judge corpus.
Initial prompt может создать тестовую работу в disposable workspace; **сама
inspection не посылает ни одного сообщения и не вызывает модель**. Такие live
пробы выполняются при отдельно разрешённой native-приёмке, не при планировании.

| Native случай | Требуемый результат |
| --- | --- |
| Root terminal, child всё ещё работает | Нет idle grant |
| Child terminal, его background command ещё работает | Нет idle grant |
| Running grandchild | Нет idle grant; доказать рекурсивную область метода |
| Child завершился, его completion message ещё ждёт root wake/delivery | Не терять сообщение, не закрывать root преждевременно |
| Всё завершилось и обработано | Fresh wait proof закрывает старый root Stop false |
| Executor error / timed_out / transport deadline | Primary error либо pending/unknown, никогда idle из timeout |
| Новая activity/cancel/restart во время wait | Поздний результат fenced |
| Timer, recurring schedule, persistent service | Установить native semantics; не игнорировать фоновые задачи по тексту команды |

Если native wait не покрывает nested/pending-message случай, не продвигать его
как full-tree proof: подключить native state stream для доказанной полноты либо
оставить явный capability blocker. Не договариваться с моделью «считай себя idle».
Не завершать stdin и не kill процесс ради получения положительного результата.
Проверить до/после inspection отсутствие новых user/model turns и usage прироста,
обусловленного самой проверкой (background work может законно продолжаться).

Compatibility receipt зависит от native binary identity, wire/client contract,
relevant proof policy и реально проверенных task capabilities; не от Git tree
всего engine/EVAL, README или Judge corpus. Его можно переиспользовать без новых
платных вызовов при неизменном механизме. Смена native версии/области гарантии
требует именно затронутых native cases, не полной квалификации Judge.
097 positive fixtures с synthetic no-step Stop мигрируют в hook-observation
tests; native settlement positives получают RPC/source-bound proof. Нельзя
сохранять их зелёными обходом нового N02 guard.

### P4 — Общая reconciliation native-tree facts (N05/N06)

- В native-children сохранить producer-specific attempt IDs/native event order.
  Не заменить rank на обратный rank: это снова потеряет более свежие terminal facts.
- Terminal + running/explicit unsettled одного узла без доказанной freshness
  дают typed conflict/unknown, не terminal. Доказанно stale факт того же attempt
  может быть отброшен producer-ом; failed outcome сохраняется diagnostic независимо.
- Учитывать отрицательные tree observations и exact coverage; duplicates/foreign
  parent/разные terminal Turn IDs остаются fail-closed. Неполное дерево не пустое.
- capacityReadiness обе ветки требуют exact positive root/tree observations и
  согласованного пустого unsettled_sessions для ready; allowDescendants управляет
  допустимостью children, а не строгостью root proof. Сохранить qualified
  owned_children_live wait и запрет root replay/новой Session.
- Переиспользовать общие нормализатор и capacity boundary; проверить service и
  pinned-runtime EVAL consumers, а не добавлять AGY исключение в controller.
- Общий небольшой tree-readiness predicate разместить в существующем native
  contract module, экспортировать через обычные build assets. Engine capacity
  и EVAL Judge/qualification используют его вместо независимых weaker predicates.
  Legacy directNativeChildren fallback также fail-closed при противоречии;
  несовместимый старый pinned engine может читать diagnostic, но не выдавать
  новую retry authority через молчаливый fallback. Version/capability mismatch явный.
- Не переписывать рабочие Codex/Grok/ZCode native protocols без найденного дефекта.

Acceptance: single-root settled:true + root unsettled:false/список непустой →
unproven; missing/duplicate observation → unproven; exact root proof → ready;
old completed/new running, reverse source order, current failure vs stale running,
attempt conflict и qualified owned children live. Повторы overload прежние:
основной запрос + три backoff continuation, успех завершает episode; quota fail
не становится overload и observation retry не расходует productive retry count.

### P5 — OpenCode единый per-node verdict и retained inventory (N03/Q01)

- В describe/childTree получить current-turn user boundary, terminal outcome,
  tool parts, pending inbox/forms/permissions, shells и active status для каждого
  узла. Из того же нормализованного набора вычислить busy, settled, tree observations
  и native_turn_items.pending; противоречивый snapshot не получает grant.
- Старые parts до последнего user input не делают текущий Turn вечно running.
  При race — bounded read-only reconciliation; старый terminal не обнуляет новый tool.
- Q01: объединять native listing с retained owned children, пока нет точного
  terminal/retirement proof. Validate ancestry; native deleted/archive outcome
  квалифицировать отдельно, не молча забывать узел. Inspection и cancel обходят
  одну ownership topology, не два разных списка.
- Acceptance: root/child idle + running/streaming tool, permission/inbox/shell,
  later terminal; disappearing retained child; foreign fork; directory churn;
  cancel при недоступном child оставляет physical/native uncertainty явно.

### P6 — Droid completeness, без ложного empty inventory (N04)

- Validate task catalog shape и обязательные child/parent/tool/attempt identity.
  Невалидная запись owned scope не пропускается как несуществующая.
- Сопоставить Task creation/resume facts root и retained topology с catalog;
  исчезнувшая запись не удаляет proof obligation. Nested Tasks либо наблюдать
  рекурсивно, либо явно unknown/unsupported, не скрыто игнорировать.
- Отсутствующий каталог разрешать для доказанного never-dispatched bootstrap
  либо terminal root с полным no-Task transcript и пустым retained inventory
  (точные условия в 8.3); не требовать файл от обычных no-child Sessions.
- Native outcome и physical close остаются разными; root idle не перекрывает
  неполную child inventory. Не объявлять незавершённых children completed при kill.
- Acceptance: missing/null/{}/partial, Task/resume mismatch, retained child gone,
  running grandchild, valid empty no-Task, valid complete terminal tree.

### P7 — Consumers, cancellation и cleanup (N07)

- EVAL cancelOwnedDaemon возвращает physical/native факты раздельно; legacy
  daemon.stop settled ACK не служит native proof, clean:false никогда не grant.
- Для exact owned Session использовать штатный fresh inspect/durable clean
  settlement при доступности; после unclean physical stop сохранить cancelled
  intent и primary error, но completion/capture не выводить из физического ACK.
- Offline retained path проверяет точный shutdown receipt/identity/operation,
  не только cleanup.settled или shutdown_state text. Legacy compatibility даёт
  физическую retirement возможность, не новую semantic/native authority.
- Проверить per-execution cancel и whole-EVAL scope, recovery, capacity/Judge
  cleanup, capture/reattach и status projection. Managed path guards сохранить.
- Physical-only retirement может закрыть ресурсы failed EVAL перед новой campaign,
  но не сделать его candidate_ready/PASS или запечатанный capture.
  После окончания/ошибки останавливать только owned processes/DB; investigation
  deferral остаётся явной и закрывается до следующей campaign по существующему runbook.
- Acceptance: stopped:true/settled:true/clean:false/native_settled:false не
  завершает native cancellation; physical presentation stopped, capture pending;
  валидный clean proof позволяет closure; PID reuse/foreign receipt/отсутствующий
  native proof не дают grant. No-provider-dispatched остаётся отдельным нормальным case.

### P8 — Сохранять объяснение неопределённости в отчёте (N08)

- failureDiagnostic и compact native_outcome сохраняют physical_stopped,
  native_settled и ограниченный native_settlement: confirmed/reason/capability,
  source, daemon/session/generation/operation и hashed proof locator.
- Переиспользовать существующие compact/allowlist/budget helpers, сохранять limits
  depth/count/bytes и primary/secondary causes. Не включать arbitrary headers,
  credentials, native request/response, полный transcript или всё дерево.
- Acceptance: физически остановленный native-unknown AGY, реально живой owner
  и положительный native idle различимы после raw→compact→report roundtrip;
  oversized/secret fields отброшены, причина отсутствующего proof остаётся видна.

## 5. Полнота аудита и приёмка

Проверены producers: dd-codex-daemon, dd-zcode + daemon, dd-grok-daemon,
dd-opencode-daemon, dd-agy-daemon, dd-droid; общий native-children, durable daemon
operations/observation, native settlement/closure; consumers: controller/fanout,
provider-capacity, runtime-scope stop/control/history/resume, EVAL driver recovery,
daemon-control, retirement, cleanup observation, Judge capacity/cleanup.
Tooling evidence, repair successor и HITL custody закрыты 097; acceptance сохраняет их.

Не найдено основания заново реализовывать:
- Codex retained/native topology + per-node read и narrow notLoaded handling;
- Grok retained descendants, new-attempt receipt invalidation и ancestry;
- ZCode native pagination revision/total/identity и closed-tree read-only proof;
- managed runtime physical/native split и независимые capture/report guards.

Это аудит перечисленных boundary paths, не заявление об отсутствии любых багов
во всём проекте. Consumer failure или чужая native topology не исправляются
ослаблением этих гарантий. Native source issues не выдаются за наш воспроизведённый bug.

Порядок: P0 → P1/P2 → P3; P4/P5/P6/P7/P8 независимые узкие ветки с общей повторной
проверкой. AGY продвижение заблокировано до P3; другие harness fixes не зависят
от положительного native результата AGY. Минимальный local acceptance:

1. Affected node/TS contract regressions, typecheck/lint/build и built assets.
2. Installed adapter → native inspection → controller/capacity/cancel consumers:
   positive и explicit unknown/contradiction cases для каждой затронутой упряжки.
3. Re-run affected 097 serialization/successor/HITL, не весь неизменный release gate.
4. Native AGY compatibility receipt с exact binary hash и всеми P3 cases.
   Если coverage не подтверждена, точный blocker, не fabricated PASS.
5. Acceptance receipt перечисляет executed/failed/skipped/not-run. Сохранить RED,
   не заменять его последним успешным stdout и не мерить benchmark под host load.

Release/merge по runbooks/git-workflow.md и policy095: commits [skip ci], GitHub
CI не запускать. При последующем отдельном выпуске — exact engine/bridge versions,
pins, оба Codex home hooks и fresh execution homes/DB ports. Не обновлять bridge
без bridge diff и не менять Judge corpus/qualification при harness-only fix.
Новые пять full E2E — отдельное разрешение после реализации/приёмки; старые не resume.

## 6. Ponytail / readiness

- Один AGY native observer внутри существующего daemon. Ни отдельной службы,
  ни нового scheduler, ни второго lifecycle ledger.
- Проверенные protocol libraries вместо собственного parser; минимальный schema
  slice, без импорта всего SDK и без генерации network code при startup.
- Общие reconciliation/capacity guards чинятся один раз; adapter-specific
  inventory rules остаются в adapters. Продукт руками не меняется.
- Валидацию ownership, freshness, completeness и ошибки не удаляем ради простоты.
- Узкие regressions + одна необходимая native compatibility цепочка вместо пяти
  платных E2E на каждом промежуточном изменении. Acceptance не равен release.

Решения для локальной реализации приняты. Два evidence milestones не являются
скрытыми настройками: P3 обязан доказать native whole-tree/message semantics;
Q01 проверяет native deletion/retirement контракт; безопасный baseline уже выбран
в разделе 8 и не зависит от положительного результата. При отрицательном
результате сохраняется fail-closed diagnostic; unsafe fallback запрещён.
До их проверки нельзя объявлять capability полностью готовой для новых AGY E2E.

## 8. Обязательные уточнения после readiness review

Этот раздел уточняет P0–P8; при расхождении применяется более точное решение
ниже. Это решения для реализации, а не свидетельство выполненной native-приёмки.

### 8.1. Pending, бюджет и доставка fresh proof (P2/P4)

- Ввести общий additive export `NATIVE_TREE_SETTLEMENT_CONTRACT =
  "native-tree-settlement@1"` и pure `nativeTreeReadiness(receipt, binding)`:
  ready / owned_children_live / inspection_pending / unproven. Pending допустим
  только при точной привязке к owner/session/operation/request и существующему
  observation episode; conflict, unavailable и чужой proof остаются unproven.
  Не менять значение native-children@1 молча: исправленный normalizer получает
  native-children@2; новый productive loader требует @2 и settlement@1.
- `loadNativeContracts(..., {requireTreeSettlement:true})` загружает их только
  из pinned engine. Старые @1 читаются в явно read-only historical режиме без
  retry/closure authority. Отсутствующий контракт и повреждённый существующий
  module различаются; глобальный установленный runtime не fallback.
- Engine provider-capacity, EVAL judge-capacity и predecessor reconciliation
  должны ждать exact inspection_pending read-only, как owned_children_live,
  до готовности либо исчерпания прежнего observation budget. Проверять отмену,
  current owner и binding на каждом await и перед dispatch; после backoff также
  проверять заново. Pending не расходует overload attempts, не создаёт retry
  intent, permit, Session или prompt. Произвольный unknown не повторяется.
- AGY ObservationClock перенести из локальной prompt-переменной в существующий
  runtime-owned observation episode; сохранить его snapshot вместе с terminal
  owner после ERROR/active=null. Inspect и восстановление используют остаток
  этого же бюджета. RPC/poll/Stop hint не activity и не продлевают окно;
  продлевают лишь подтверждённые текущие native execution signals. При restart
  применять существующее восстановление clock и uncertainty, не выдавать новый
  полный срок. Не добавлять отдельный lifecycle ledger.
- Fresh AGY native_turn_items/readiness выводить отдельно от immutable исходного
  ERROR. Для stream_request выбирать fresh facts по exact request_proof /
  streamRequestKey, а не terminal_turn_id, которого у этого протокола нет.
  Original primary error и failed outcome не переписываются в SUCCESS.
- Существующий session-settlement.waitForSettlement не подходит как готовый
  read-only waiter: без cancel он бросает на первой active observation. Расширять
  только существующую observation/capacity цепочку, не использовать этот helper
  с фиктивным cancel и не создавать второй общий retry framework.

### 8.2. Native AGY bootstrap и wire contract (P1/P3)

- Порядок: static binary compatibility → owned process init без prompt → endpoint
  ownership + metadata capability probe → admission productive write. P3 создаёт
  capability receipt в явном disposable unscored qualification режиме; он не
  требует уже существующего собственного receipt. Такой режим не разрешает
  scored EVAL, не является bypass для productive preflight и не даёт PASS.
- Дополнительно к WaitForConversationFullyIdle зафиксировать метод
  GetConversationMetadata: request conversation_id=1/string; response metadata=1,
  num_steps=2/uint32, trajectory_id=3/string. Metadata parent_conversation_id=5,
  root_conversation_id=6, workspace_uris=7/repeated string; deprecated workspaces
  не использовать. Номера сверены по установленному AGY 1.4.5.
- Не считать trajectory_id эхом conversation ID и пустой root relation признаком
  self до P3. Workspace file URI канонизировать как путь; не сравнивать prefix.
  Если init не позволяет metadata probe без модели — точный capability blocker,
  а не скрытый запрос модели. P3 проверяет эти предпосылки явно.
- Проверить dependency resolution/codecs в собранном и установленном pinned
  engine snapshot, включая isolated runtime imports, а не только source tests.

### 8.3. Freshness, конфликт и восстановление (P4/P5/P6)

Normalizer — pure reconciliation одного receipt, не новый history ledger.
Producer отбрасывает только доказанно stale facts до normalizer. Использовать
существующую identity: Codex native Turn; Grok attempt_id/retired_attempt_ids;
ZCode execution identity/interval при наличии доказательства; OpenCode admission
user message ID и durable aggregate seq; Droid Task invocation/resume tool-use.
Без пригодной identity порядок не угадывать по status rank, source order или
wall-clock timestamp. Отрицательная current tree observation также учитывается.
Следующий согласованный fresh receipt снимает конфликт; historical failed outcome
остаётся diagnostic, но не вечным live-state нового attempt.

OpenCode:
- Один current-turn busy predicate включает native status, pending requests,
  running shells и running/streaming tool parts; из него строятся root/child
  pending, settled и tree observations. Старые parts до последнего user boundary
  не блокируют новый Turn.
- Использовать существующие durable logs как revision fence до/после чтений;
  execution/tool/shell/inbox activity инвалидирует idle snapshot. Seq сравнивать
  только внутри одного aggregate. Не заменять fence произвольным quiet sleep
  или требованием двух пустых чтений. Недоступный fence — observation unknown.
- Inventory = native listing ∪ retained owned children. Пропавшего из listing
  проверять session.get; существующего продолжать наблюдать. 404/deleted сами
  по себе не доказывают idle/success. Exact retained terminal последнего attempt
  сохраняет силу только без более новой activity/dispatch; иначе конкретный
  native_child_observation_unavailable и отдельный physical retirement.
  В установленном @opencode/client@2.0.28 нет includeArchived; deleted event
  имеет identity/seq, но не completion proof. Локальный source 1.18.25 не
  квалифицирует v2 semantics. Это baseline Q01 без ожидания нового исследования.

Droid:
- Missing catalog допустим не только до dispatch: completed root с полным
  terminal transcript без Task create/resume и retained/hook child inventory
  является нормальным доказанным no-child case.
- Root Task без allocation coverage → unknown; отказ до allocation признаётся
  no-child только по квалифицированному native факту, не тексту модели.
- Invalid top-level catalog → unknown; invalid owned record → unknown. Ownership
  определяется reachable parent edges, retained task/child identity или root
  tool-use, включая nested descendants. Доказанно чужая повреждённая запись
  не блокирует наше дерево. Fresh complete catalog снимает прежний unknown.

### 8.4. Отмена и размер diagnostics (P7/P8)

- False stop ACK → bounded read-only reconciliation → exact native proof и один
  cancelled event. При мёртвом owner/исчерпанном бюджете без proof — стабильный
  cancellation_unconfirmed + cleanup-blocked, не вечный busy loop. Сохранять
  cancel intent и primary failure; не публиковать EVAL completion. Учесть reducer,
  игнорирующий обычные failure events после effective cancellation: выделить
  этот cleanup outcome явно. Reattach не сбрасывает budget и не закрывает native
  state. Physical-only retirement по прежнему разрешает следующую campaign.
- failureDiagnostic получает общий лимит **32 KiB UTF-8 на весь результат**, а не
  на каждый вложенный check. Переиспользовать allowlists и compact helpers;
  сохранить primary code/reason, physical/native flags, binding и proof locator,
  сначала сокращать children, добавить diagnostic_truncated. Финальный encode
  обязан укладываться в лимит, включая marker/locator; secrets не сохранять.
  Раньше имелись count/depth/scalar limits, но общего byte budget не было.

### 8.5. Дополнения к минимальной приёмке и статус готовности

Добавить к существующим affected regressions (не новый полный gate):
1. Pending→ready; pending после restart→ready; exhausted без dispatch; conflict
   без повторов. Fresh stream-bound proof заменяет только readiness, не ERROR.
2. Old pinned diagnostic читается; productive old contract отвергается; broken
   present module не считается отсутствующим optional module.
3. OpenCode mixed snapshot→consistent same-attempt idle; omitted child→get→
   terminal; old tools до admission не мешают; deleted не превращается в success.
4. Droid completed no-Task/no-catalog positive; partial→complete→idle без нового
   Turn. Old failed A/current running B→terminal B без sticky negative.
5. Cancel pending→proof→один cancelled; dead/expired→stable blocked; reattach
   ничего не финализирует. Wide/deep secret-bearing diagnostic ≤32 KiB,
   сохраняя primary/native capability reason.

Решения для реализации зафиксированы. P3 остаётся обязательной внешней проверкой
при реализации: native private RPC пока не доказан как whole-tree authority.
Если проверка отрицательна — deliverable включает исправленные общие границы и
явный AGY capability blocker; нельзя объявлять цель native AGY idle достигнутой
или запускать новые AGY E2E на неподтверждённом proof. Альтернативный state-stream
добавляется только при конкретно доказанной нехватке unary RPC, не заранее.

## 7. Источники

- [AGY hooks: fullyIdle и Stop](https://www.agy.dev/docs/hooks/).
- [Headless stream: unsupported control messages](https://www.agy.dev/docs/cli/headless/).
- [Statusline agent_state/task_count: TUI, не native tree authority](https://www.agy.dev/docs/cli/statusline/).
- [Upstream #1044: SUCCESS с незавершённой background работой/child delivery race](https://github.com/google-antigravity/antigravity-cli/issues/1044).
- [Upstream #779: запрос публичного status/cancel](https://github.com/google-antigravity/antigravity-cli/issues/779).
- [Официальный SDK Conversation: wait_for_idle делегирует connection](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/conversation/conversation.py).
- [gRPC Node client](https://github.com/grpc/grpc-node/tree/master/packages/grpc-js),
  [Protobuf-ES runtime/codegen](https://github.com/bufbuild/protobuf-es).
- Внешние reverse-engineered schemas/клиенты использованы как поисковая наводка,
  не authority: wire fields сверены с installed binary. Внешний ProbeIdle,
  игнорирующий timed_out, не копировать. Private runtime source недоступен.
