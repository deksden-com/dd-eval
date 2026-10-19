# 093 — Codex: готовность истории не равна готовности выполнения

Дата: 2026-10-19. Статус: план готов к реализации; runtime в этой задаче не менялся.
Ponytail: full. Цель: убрать ложный отказ принятого native Turn, не ослабить
ownership, полноту результата, settlement и запрет повторной отправки при неизвестном исходе.

## 1. Основания и границы

Engine audit base: `dd-flow-review092`, `19ca01d60193f96acf002246cfe7eb4d98b00ae1`,
тот же tree, что integrated `41c019e9b9a20cd8d1a6bf73bf6368ae89ebd414`.
EVAL: `dd-eval-cp237`, `9bb3c07`, branch `ops/cp237-five-harness`, PR117.
Перед реализацией сверить main/смежные изменения и правила репозиториев;
не править frozen tested candidate и его dist/receipts.

CP237: ни один из пяти scored EVAL не запущен; baseline NOT RUN.
Общая Judge qualification остановилась после одного успешного кейса и прерывания
второго, а не после 46 отказов модели.

Evidence:

- `_artifacts/cp237-launch.nF52bO`: подготовка, qualification log, owner cleanup,
  installed matrix regression/receipt.
- `_artifacts/cp237-investigation.KauvUR/probe-result.json` и `native-control.jsonl`:
  offline adapter reproducer и чистый native probe без модели/CPA/старых DB.
- Qualification key `188bf333edbc76e0356af2deb79423d1de1033e254d6e13f151acd1f90b2dbad`,
  operation `operation-31a34e6f-d791-4185-81a5-9f84cf5c69ce`.
- Второй Thread `01a1533b-444b-72c0-bc4f-cd3045a39364`,
  Turn `01a1533b-5e22-7e82-ad76-35f6b99f76c1`.
  08:16:02.090Z start accepted; .097Z history RPC -32601;
  .943Z cleanup уже прочитал inProgress; .960Z отправил interrupt.

Native source: `/Users/deksden/Documents/_Projects/codex`, HEAD `8c076942...`;
критический read/persist путь дополнительно сверялся с `rust-v0.163.0`.
`thread-store/src/local/thread_history/read.rs:203`: нет metadata → Unsupported.
`rollout/src/recorder.rs:882`: deferred creation.
`thread-store/src/local/live_writer.rs:330`: durable rollout перед SQL projection;
ошибка projection может только логироваться. `thread/read(includeTurns=true)`
также использует эту историю, хотя предварительно пытается persist_thread.

Точная причина отсутствия metadata в исходном миллисекундном окне не различена:
ещё не выполненная материализация либо неудача её попытки. Исходного SQL snapshot
нет. Доказаны отказ supplementary read, ошибочная фатальность у нас и тот же
native отказ на чистом пустом Thread. Не планировать лечение «повреждённой БД».

Не входит: native Codex patch/fork, смена CPA/auth/SQLite home, продукт dd-tasks,
новые настройки таймаутов, глобальный retry всех RPC, автоматический запуск новых
EVAL, restart/resume/правка истории старых запусков. Реальные overload retries
остаются политикой 089, не смешиваются с observation recovery.

## 2. Выявленные дефекты и аналогичные места

Пути engine относительны `src/harness-runtime/lib/`, EVAL — `lib/`.

| ID | Установлено аудитом | Работа |
| --- | --- | --- |
| D01 | dd-codex.mjs waitForTurn немедленно вызывает persisted read; известный отказ истории обрывает принятый Turn до запоздалых событий. | P1 |
| D02 | post-turn readCompletedThread обязателен даже при retained completed Turn; недоступное обогащение способно затмить пригодный результат. Полноту конкретного результата надо проверять, а не считать любой final text достаточным. | P2 |
| A01 | inspectSessionWithBridge с turnId гидратирует историю; observedChildren гидратирует failed child. Отказ одного enrichment обрывает весь осмотр/перечень детей. | P2 |
| A02 | cancelSessionWithBridge без turnId сначала требует полную историю; cancelCodexTree явно передаёт turnId:null даже при известном root Turn. Отмена может не дойти до native. | P3 |
| A03 | observeCodexSessions читает persisted page для notLoaded/systemError. settledCodexSession(notLoaded,null) считает отсутствие Turn settled. Подмена unavailable на пустую страницу создаст ложный cleanup PASS. Сейчас такой fallback отсутствует — это обязательный edge case исправления, не уже доказанный ложный PASS. | P3 |
| A04 | RPC -32601 неоднозначен: отсутствие метода, неподдерживаемая история/legacy, ещё отсутствующая metadata. Нельзя кешировать binary-wide unsupported или подавлять любой -32601. | P1 |
| D03 | Qualification reader JSON-парсил новые accepted-intent text sources, тогда как final acceptance уже понимала текст. Исправлено cd8a176, но надо интегрировать и сохранить consumer parity regression. | P4 |
| D04 | Fakes моделировали пустую успешную историю, но не временно недоступную; doctor проверяет version/initialize. Полный gate не упражнял этот lifecycle. | P5 |
| A05 | CodexBridge.onMessage compact-journal для любого ответа thread/read строит result.thread, даже если message.error задан: ошибка в журнале превращается в пустую успешную структуру. Promise при этом правильно rejected. Это самостоятельный дефект evidence, не причина принятого решения runtime. | P4 |
| A06 | EVAL runner Judge finally выбирает --cancel-tree для primaryError, не признанного isObservationLoss. Сырой rpc_error туда не входит; вспомогательное чтение поэтому приводит к отмене уже принятого Turn. | P1/P4 |
| A07 | При реализации/сверке E4: paged history unavailable не означает, что полная история тоже недоступна. Stale active Thread и tree settlement требуют узкого hydrated fallback; свежий active из hydrated ответа важнее предыдущего notLoaded. | P1/P3 |
| A08 | Живая проверка смежной E4 нашла -32603 empty rollout metadata после accepted start, до turn/started/hook. Это отдельная readiness-гонка обязательного compact read, не unsupported history и не любой internal error. | P1/P5 |

Проверенные общие consumers: setup/start, prompt polling, terminal reconciliation,
post-turn output, child enrichment, direct inspect/cancel, tree inspect/cancel,
daemon shutdown/admission, Subject/Work/Judge adapters, EVAL infrastructure/error
classification и qualification cleanup/recovery.
Дополнительно просмотрены AGY quiet reconciliation, ACP/ZCode inactivity
reconciliation, OpenCode durable execution/message reconciliation и общий
operation-errors/daemon-observation. Они используют другие native контракты;
данный Codex Unsupported туда не переносить. Нового воспроизведённого отказа
этих упряжек этим аудитом не установлено. Это аудит класса проблем, не сертификат
отсутствия всех дефектов во всех репозиториях.

## 3. Единый контракт решения

1. Живые native события, metadata Thread и persisted history — разные источники.
   Ответ start означает принятие запроса, не готовность истории/финального ответа.
2. Известный точный отказ history read означает «история недоступна», а не пустую
   историю, failed Turn, готовность к повтору или settled дерево.
3. Только для `thread/turns/list` и `thread/read` с includeTurns=true распознавать
   rpc_error с native code -32601 и точным `list_turns is not supported yet`.
   Уточнение при реализации: чистый native probe дополнительно воспроизвёл -32600
   `thread <exact-id> is not materialized yet; <operation> is unavailable before
   first user message`. Исходники thread_processor.rs:6248–6288 и upstream tests
   подтверждают этот вариант; также распознавать его строго по методу и Thread ID
   (operation = thread/turns/list либо includeTurns), не произвольный InvalidRequest.
   Проверка около Codex history helpers, не ослабление общего readCodexRpc.
   Внутренний результат различает available-empty и unavailable (локальный tag,
   без новой публичной schema/плагинного framework). Остальные ошибки пробрасывать.
4. Отсутствие истории может длиться всё выполнение: не предполагать eventual
   readiness и не считать успешный initialize доказательством её поддержки.
5. Продуктивный запрос не повторять. Ни turn/start, ни steer/resume не являются
   fallback чтения. Существующий notLoaded resume остаётся отдельной операцией
   с прежними ownership/dispatch guards; ошибка истории сама его не инициирует.
6. Существующий ObservationClock — единственный budget productive ожидания.
   Реальные reasoning/message/tool/owned-child события сдвигают окно; read success,
   Unsupported, daemon heartbeat и polling не являются продуктивным progress.
   Не сбрасывать clock на каждой попытке, не добавлять sleep(30s) или hard deadline.
7. При невозможности подтвердить исход по окончании окна — существующий
   operation_observation_lost, native_outcome:unknown, без replay/ложного completion.
   Подтверждённый native outcome сохраняется отдельно от observation/settlement.
8. Identity/schema/hook/ownership/journal/profile storage обязательны. Их ошибки
   не превращать в optional enrichment и не скрывать completed event.

## 4. Пакеты реализации

### P1 — supplementary history в productive ожидании

Файлы: dd-codex.mjs и существующие native tests.

- Добавить одну узкую проверку известной недоступности истории и reuse в обоих
  history helpers. readCodexRpc сохраняет валидацию и bounded transient retries.
- Дополнить существующую transient read policy точной empty-rollout ошибкой:
  только thread/read, есть accepted current Turn без Turn event и current native
  hook, native code -32603, оба пути в native сообщении совпадают и оканчиваются
  на точный Thread ID. Использовать прежние максимум три чтения/backoff/общий
  owner budget, не новый цикл и не повтор turn/start. После событий, для чужого
  пути, paged метода или другого internal error — прежний фатальный отказ.
- waitForTurn продолжает обработку native events при history unavailable;
  повторное read-only наблюдение по существующему cadence, без busy loop.
- Проверять актуальный terminal event также после await/ошибки snapshot: snapshot
  не должен затмевать пришедший одновременно authoritative event.
- Сохранить identity matching Session/Turn и прежние проверки временно
  противоречивого interrupted snapshot. History unavailable не подтверждает terminal.
- Сохранить persisted проверку stale-active interrupted Turn: удаление этого
  источника возвращает исправленный ранее дефект.
- Если paged read unavailable, попробовать full history через тот же helper даже
  при compact active; не ждать idle как условия fallback. Оба unavailable остаются
  unknown. В tree settlement full history допускается как доказательство только
  при реально полученном массиве turns; отсутствие turns не равно пустому массиву,
  явно неверный тип — schema error. Свежий hydrated active запрещает settlement.
- Не расширять synthetic final-message fallback. Недоступность истории не даёт
  новых оснований считать message или Thread idle завершением принятого Turn.

### P2 — final result, inspect и дети

- По completed event сначала использовать retained exact Turn/items и текущий
  assistant output. Full history — enrichment, когда результат уже полон.
- При unavailable использовать compact metadata для наблюдённого профиля;
  requested model не подменяет observed model. Сохранить обязательную публикацию
  model observations, hooks и journal; ошибки их сохранения остаются blockers.
- Если terminal известен, но необходимые output/items/profile evidence получить
  нельзя, сохранять native_outcome_observation_failed с exact native outcome,
  settled:false и причиной. Не возвращать пустой успех и не запускать новый Turn.
- observedChildren сначала сохраняет всё известное дерево; известный history
  отказ одного child не удаляет siblings/ancestry и не заменяет failed на success.
  Без item evidence не разрешать continuation, требующее proof отсутствия эффектов.
- inspect сохраняет compact facts при недоступном enrichment; неизвестный terminal
  явно остаётся неизвестным. Если существующий public ответ не выражает unknown,
  вернуть существующую typed observation error, не вводить новый публичный формат.
- Общие helpers используются всеми Subject/Work/Judge callers; без harness-role
  ветвлений и без отдельного обхода ошибки только в qualification.

### P3 — отмена, settlement и cleanup

- Сохранять известный exact root Turn из operation/retained events при tree cancel;
  не обнулять его. Для child использовать только его собственную проверенную identity.
- При отсутствии Turn ID искать в live exact observations, затем доступной истории.
  Если история unavailable и ID не установлен — unknown, не turn_not_active и не
  interrupt произвольного «последнего» Turn.
- Ответ interrupt — только acknowledgment. Settlement подтверждается отдельно.
- Обновить локальную settlement проверку так, чтобы unavailable не стал null/empty.
  notLoaded без доступной истории/terminal proof — unsettled; systemError аналогично.
  idle сам по себе не отменяет известный принятый нетерминальный Turn. Учитывать
  active operation и child facts, не завершать дерево по одному root idle.
- Сохранить пригодные paths settled для действительно пустой, проверенно idle
  сессии без принятого Turn; не создавать вечные false blockers.
- Неизвестное состояние удерживает cleanup_unconfirmed/существующий settlement
  blocker. Сохраняются primary error, отдельная cleanup error, owned inventory;
  никаких force-stop чужих процессов, удаления native DB или фиктивных квитанций.
- Проверить daemon.stop, admission и driver recovery: нельзя позволить competing
  bridge, новый prompt или retirement только из-за optional read failure.

### P4 — EVAL matrix и диагностика (без второго исправления уже сделанного)

- Интегрировать cd8a176 через штатный review/merge; не переписывать готовый helper.
- engine-admission.mjs и case-acceptance.mjs используют один
  isVerificationMatrixTextSource; text/opaque artifact/technical JSON сохраняют
  разные форматы. Проверить raw bytes/hash/path/source authority и negative cases.
- EVAL распознаёт итоговый observation unknown как tooling/infrastructure, не
  дефект продукта, Judge quality или provider overload. Не добавлять глобальное
  rpc_error в retry/ignore allowlist. Проверить фактические error envelopes через
  adapters/client ledger/qualification owner, не только прямой вызов helper.
- Диагностика history failure: method, includeTurns, Session/Turn/operation identity,
  phase, accepted/not-dispatched, native outcome и исходный RPC code/message.
  Существующие errorRecord/journal/redaction, без полного transcript/секретов.
  Повторные unavailable polls не должны раздувать журнал; фиксировать переходы
  availability и сохранять последнюю причину в финальной ошибке.
- Compact-journal сокращает только успешный thread/read response. RPC error
  сохраняется как error с request identity и исходным code/message, не result.thread
  с null ID. Не возвращать полный transcript в успешных snapshots. Проверить
  successful/error/late-response записи и прежнюю redaction/ограничения размера.
- Judge cleanup выбирает no-replay/observation-loss путь для unresolved принятого
  Turn через существующий typed envelope. Известный временный отказ истории
  обрабатывается внутри ожидания и вообще не доходит до finally как terminal error.
  Не менять все rpc_error на observation loss: до dispatch/unknown method/auth
  имеют другую семантику. После окна unknown не превращается в --cancel-tree только
  из-за того, что наружу просочился сырой вспомогательный RPC error.
- Успешный первый qualification answer сохранить; interrupted/unknown evidence
  второго не переобозначать как success/no-effect. Штатный recovery сначала
  проверяет terminal outcome и cleanup, затем решает допустимость новой задачи.
  Если штатного разрешения нет — blocker, а не ручное удаление failure.json.

### P5 — воспроизводимая проверка и эксплуатация

- Расширить существующий `test/fixtures/codex-adapter.mjs` и contract runner,
  tests tree cancellation/settlement и `test/native-observation-092.test.ts`.
  Не создавать новый framework. Управляемые события/clock/barriers вместо
  коротких реальных sleeps и зависимости от скорости Mac.
- Read-only обзор doctor wording: initialize означает подключение, не полный
  lifecycle PASS. Native empty-Thread probe — отдельный явный non-generative
  contract check в disposable home, не платная обязательная проверка каждого EVAL.
- Пробник закрывает только собственный app-server, не использует общий home,
  не вызывает turn/start/inject/steer и не меняет исторические DB. Empty persistent
  Thread — побочный результат диагностики, сохраняется в diagnostic home.
- Коротко обновить runbook harness updates/execute: история unavailable ≠ provider
  outage; unknown не пересылать; failed cleanup разбирать штатно. Не добавлять
  протокол расследования в операционные инструкции.

## 5. Приёмочная матрица

| Проверка | Обязательный результат |
| --- | --- |
| Новый Turn, оба history read дают известный Unsupported, позже completed event | Результат текущего Turn; один turn/start, без resume/steer/interrupt |
| Unsupported → successful empty page → history с exact Turn | Не путать состояния; не завершать по пустой странице |
| History unavailable постоянно, но идут reasoning/tools/children | Productive clock продлевается; polling его не продлевает |
| History unavailable, progress отсутствует | Bounded unknown; нет replay и ложного provider failure |
| Terminal приходит во время snapshot RPC | Exact authoritative outcome не теряется |
| Completed event есть, output полон / output недоступен | Успех с прежними обязательными guards / retained completed + observation failure |
| Stale active + persisted interrupted, early contradictory interrupted | Существующие регрессии сохраняются |
| Old final message / чужой Turn / unknown RPC -32601 / malformed data | Нет false completion; identity/schema/неизвестная ошибка фатальны |
| Root completed, failed child history unavailable | Полное известное дерево; неизвестные child items не дают safe retry |
| Cancel с известным Turn и недоступной историей | Interrupt exact ID; ack не считается settled |
| Cancel без ID, notLoaded/systemError + unavailable | Не turn_not_active/settled; сохраняется cleanup uncertainty |
| Пустой idle Thread без dispatch; root idle при принятом Turn; active child | Первый может settled при доказательствах; остальные не false PASS |
| Hook/journal/model storage/owner error одновременно с completed | Native outcome сохранён; обязательный blocker не подавлен |
| Matrix text + JSON + opaque artifacts, неверный hash/JSON/source | Оба consumers согласны; invalid не превращается в текст |
| Qualification/client ledger observation failure | Infrastructure attribution, no blind replay, первичная и cleanup причины раздельны |
| thread/read RPC error в compact journal | Записан настоящий error, не фиктивный result; successful snapshot остаётся compact |

Команды на implementation checkout, после проверки текущих package scripts:

```sh
node --test test/fixtures/codex-adapter.mjs
pnpm exec vitest run test/native-observation-092.test.ts test/harness-runtime-assets.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

После targeted PASS — полный engine gate по правилам release-candidate проекта,
включая runtime-sensitive/native contracts, paired EVAL checks и installed artifact.
EVAL: `node --test test/engine-admission.test.mjs` с явно выбранным построенным
engine и обязательным installed fixture (без optional skip), плюс затронутые
qualification recovery/Judge cleanup tests. Receipt фиксирует selected artifact;
не использовать stale dist или публичную старую beta.142 под тем же номером.

## 6. Последовательность и Definition of Done

1. Сверить base/соседние работы, правила репозиториев; выделить implementation branch.
2. Добавить failing regression CP237; P1 → P2 → P3, затем EVAL envelopes/P4 и P5.
3. Targeted + полный required gate, review negative cases и no-replay assertions.
4. Коммиты/пуш/review/merge по правилам каждого изменённого проекта. Если нужны
   canon/schema изменения сверх плана — остановиться и обосновать расширение;
   сейчас они не нужны. Native Codex/dd-tasks product не меняются.
5. Implementation report со списком закрытых ID и точными test receipts.
   Проверка готова только при тестах из таблицы без замены unavailable на empty,
   без роста таймаутов и без ослабления mandatory evidence.

Новый release/pins/hooks и свежие scored запуски — отдельный следующий шаг,
после разрешения оператора. Этот план не требует повторить все Judge model cases
из-за transport fix: reuse валидных ответов по существующим dependency keys;
неизвестные старые исходы сначала разрешаются штатным lifecycle.

## 7. Проверка готовности по Ponytail

- Используются ObservationClock, errorRecord, native event maps, existing read policy,
  operation ledger, settlement и contract tests. Новых зависимостей нет.
- Одна локальная классификация known history unavailable; callers различают
  требования к результату, а не получают глобальный catch-all.
- Не нужны новая retry-политика, plugin layer, configuration knob, migrations,
  native fork, смена SQLite home и тотальная живая реквалификация.
- Решения о fallback, no-replay, post-turn completeness, child evidence,
  cancellation ID, settlement unknown, clock/progress, ошибках и интеграции приняты.
- Остаточная неопределённость native materialization не блокирует реализацию:
  оба её варианта требуют одинакового корректного observation контракта.
- Реализация ещё не выполнена; план не выдаёт запланированные проверки за PASS.
