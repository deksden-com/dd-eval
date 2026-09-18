# 038 — Контракт hook / CLI и исправление отказа CP-110

Продолжение после CP-116: [039 — проверенный вход CLI до выполнения](039-cli-prepare-before-execute.md). Оно расширяет предварительную проверку с argv на весь payload, схемы и применимость всех команд; прежние записи реализации ниже не означают выполнения плана 039.

Дата: 2026-09-17. Статус: после ревью существенные дефекты локальной реализации исправлены; полное выполнение P0/P1 ещё не подтверждено. Не считать этот статус разрешением на новый E2E.

План исполним по порядку ниже. P0 — ограниченная живая проверка native transport, а не полный E2E. Deterministic boundary/integration fixtures не закрывают P0. Старый compatibility path не удалён.

Основание: [расследование CP-110](../runbooks/cp-110-luna-hook-failure-investigation-2026-09-17.md). Четыре из шести Codex hooks превысили 5 секунд; отказ start потерялся, два работника вручную вызывали handler, один продолжил без start; контроллер остановил RUN только при finish примерно через 11 минут. Отдельно два reviewer исправили противоречие findings в шаблоне. Это не отсутствие hooks у Codex subagents.

## 1. Цель и ограничения

### Уточнение контракта после CP-114

Это уточнение заменяет ниже описанный исторический compound-deny/retry в хуке.
Хук проверяет нативную доставку/идентичность и фиксирует событие; аргументы CLI,
payload-файлы, логическая привязка Session/RUN и выдача retry ему не принадлежат.
Проект хука определяется daemon/config workspace, не аргументом модели.
Реальный отказ хука остаётся fatal infrastructure failure без ретрая.
CLI до исполнения отклоняет неверные аргументы с доказанным `no_effect`;
для issued/observed attempt атомарно сохраняет отказ и единственный
`retry_command`. Executing/unknown-effect попытку повторять нельзя.
Общий контракт действует на все шесть адаптеров, без нового transport manager.

Регрессии: опечатка CP-114 в project-root; duplicate option; испорченный
payload/несуществующий файл не ломает hook; неизвестный invocation ID остаётся
ошибкой CLI; failed COMMIT не публикует successor; реальная ошибка записи
receipt пробрасывается; нативный профиль/parent и история A→B→A сохраняются
при успешной CLI-регистрации, но не при одном наблюдении команды.

- Hook синхронно сохраняет минимальный контекст; CLI выполняет бизнес-операцию. Нет фоновой обязательной записи, второй очереди, нового daemon или второго контроллера.
- Передача не зависит от updatedInput. Существующие hook_events и lifecycle_invocations переиспользуются, а не копируются в третью систему.
- Ошибка до регистрации receipt наблюдаема. Отсутствие receipt не разрешает мутацию.
- Модель выполняет выданные команды, но не создаёт ID, receipts, не вызывает handler для восстановления и не продолжает работу после неуспешного start.
- Сохраняются ownership, generation scope, recovery и границы проектов. Не ослаблять schema ради неверного примера.
- Не переписывать исправные адаптеры под Codex. Общая семантика, разные нативные способы доставки.
- Не изменять старый CP-110 RUN и его доказательства; не перезапускать eval и не публиковать пакет как побочный эффект реализации этого документа.

## 2. Ответственность и контракт

| Компонент | Владеет | Не делает |
| --- | --- | --- |
| dd-eval | Сценарий, канонический HITL, общий бюджет, оценка и итог | Не переключает внутренние стадии и не ремонтирует receipt |
| Controller dd-flow | RUN, выдача работ/команд, переходы, stop/recovery | Не разбирает native hook payload разных продуктов |
| Adapter runtime | Нативные session/tool IDs, topology, доставка, ошибка и отмена собственного дерева | Не принимает бизнес-результат Work |
| Hook ingress | Валидация native envelope/identity, короткая запись native context с COMMIT | Не валидирует CLI argv/payload, не привязывает RUN/Work, не выпускает retry, не начинает Work, не готовит схему |
| CLI/service | Admission, state transition, результат и outcome | Не угадывает native session по общей env или времени |

### 2.1 Идентификаторы и данные

Переиспользовать InvocationScope и InvocationIdentity из lifecycle-invocations.ts: projectRoot, daemonId, rootSessionId, runId, generation; native sessionId, parentSessionId, toolCallId. Native identity всегда с harness namespace. Internal SES, ACP ID и native ID не взаимозаменяемы; сохранять существующее явное отображение.

Invocation ID — идентификатор выданной runtime операции, native toolCallId — конкретной доставки. Это разные сущности. ID операции может присутствовать в готовой команде до hook; агент не должен им управлять. Не считать наличие ID достаточным допуском: требуется подтверждённая нативная связь и совпадение операции/scope.

Hook сохраняет только поля, необходимые для этой связи и диагностики; не копировать секреты/env/полный stdin результата в admission. Нужные observations/profile/lineage сейчас побочно записываемые handleCodexHook не терять: перенести в существующее наблюдение адаптера или CLI, точно указав владельца каждого поля при реализации.

### 2.2 Порядок записи и чтения

1. Подготовка RUN/runtime проверяет совместимость и подготавливает schema.
2. Runtime выдаёт команду с существующим invocation identity, если этот transport требует такого коррелятора.
3. Native hook получает реальную identity и команду; короткая транзакция сохраняет receipt и связь invocation, без I/O внутри транзакции.
4. Успешный выход hook только после COMMIT. Никаких detached subprocess для этой записи.
5. CLI в новой транзакции находит точную запись, проверяет текущий scope, claim и меняет бизнес-состояние. Receipt claim и переход Work должны быть атомарны там, где это одна БД; не оставлять consumed receipt при rollback бизнес-операции.
6. Outcome возвращается CLI и поступает в существующий канал controller. Потеря публикации после commit не превращает операцию в неисполненную: использовать существующий recovery/reconciliation.

COMMIT достаточен для видимости из новой SQLite transaction; WAL checkpoint и sleep не нужны. CLI не держит старую read transaction при ожидании события. Если применяется существующий async rendezvous для транспорта без sync child hooks, ждать только точную issued invocation, с одним ограниченным deadline, без удержания DB lock. Это исключение принадлежит адаптеру, не становится общей фоновой схемой hooks.

### 2.3 Терминальные случаи

- Запись не committed: admission запрещён, effect=no_effect, инфраструктурная ошибка наблюдаема.
- Запись committed, но hook затем упал: не угадывать эффект Work по статусу hook. Native failure останавливает дальнейшее выполнение; учесть возможную гонку уже начавшегося CLI. Фактически committed переход сохраняется, неизвестное восстанавливается существующим recovery.
- Потерян ответ после Work commit: не выполнять повторную мутацию. Вернуть/восстановить retained outcome через текущий механизм.
- Повтор того же native event — идемпотентная доставка. Другой native call с тем же issued ID — не автоматически duplicate: сверить существующий retry contract.
- Неверный результат после успешного start — correctable, агент исправляет. Новый входной результат не должен ошибочно получать кеш старого schema rejection.
- Нет точной корреляции, чужой RUN/daemon/generation, stale receipt — отказ; не выбирать newest и не расширять TTL.

## 3. P0 — квалифицировать точную корреляцию без updatedInput

Файлы: services/lifecycle-invocations.ts (managedInvocationContext, managedLifecycleCommand, issue/observe/await/settle); harness-runtime/lib/dd-codex.mjs, dd-codex-daemon.mjs; существующие probe tools и fixtures. Пути в этом разделе относительны dd-flow-cli/src, если не указано иное.

Решение-кандидат: распространить существующий issued-invocation путь на managed Codex. Сейчас managedInvocationContext ограничен zcode-acp. В готовую команду ID добавляет runtime заранее, поэтому проигнорированный rewrite не теряет коррелятор. Codex hook связывает этот ID с native call в БД. Для scope использовать persisted managed daemon/root binding, не общий CODEX_SESSION_ID детей.

Ограниченный эксперимент в mkdtemp workspace, отдельном home, без CP-110 mutation и без изменений пользовательских hooks:

1. Root и child исполняют безопасную marker-команду с issued ID; hook сохраняет identity и deliberately не возвращает updatedInput.
2. Проверить прямой shell и вложенный code-mode shell: argv, native IDs и committed receipt сопоставлены фактическим логом, не текстом модели.
3. Шесть детей одновременно, отдельные operations; затем два одинаковых по бизнес-параметрам вызова с разными attempts. Никакой перекрёстной привязки.
4. Отложенная/дублированная доставка, прерванная старая попытка и повтор: старый receipt не допускает новую команду.
5. Проверить finish/fail и получение successor command из start/status: read-only rendering не создаёт ID, repeated render не создаёт новую попытку.

Выход P0: сохранённый transcript/summary с версиями и утверждениями, выбран один путь для Codex; список generated-command producers и retry behavior подтверждён. При отрицательном результате сохранить прежний путь, оформить конкретный blocker и вернуться к проектированию — не подменять точную привязку временным окном. Не требуется live E2E или полный gate для этого опыта.

## 4. P1 — короткий hook ingress и подготовка storage

Файлы: services/hooks.ts (handleCodexHook, record/claim helpers, hookCommand/commandHook), runtime/context.ts, storage/database.ts, cli/run-cli.ts, harness-runtime/lib/native-hook-command.mjs.

- Провести замер cold/warm ingress и параллельной волны; отдельно время context/open/schema/receipt. Не приписывать всё DB locks без замера.
- Выделить минимальный вход hook до полной загрузки бизнес-router, используя существующие parser/storage helpers. Схема остаётся общей, без нового самодельного SQL-хранилища.
- Добавить/переиспользовать writable-existing путь для подготовленного store без миграций и scan recovery на каждый вызов. Проверка ожидаемой schema generation обязательна; несовместимый store получает ясную ошибку, а не скрытую миграцию в hook.
- Новый/старый home подготавливается штатной startup/migration процедурой; учесть параллельный startup, старые CLI writers и resource DB. Не просто отключить весь executeStoreSchema глобально.
- Устранить также CREATE TABLE IF NOT EXISTS lifecycle_invocations на каждом hot operation; подготовка один раз с тем же контрактом.
- Короткая транзакция записи с bounded lock wait. Единственный согласованный бюджет ingress; внутренний deadline меньше outer hook timeout с запасом на запуск/выход. 5s не оставлять без обоснования, но и 600s default не использовать как лечение.
- Hook match только для необходимого события/инструмента; нерелевантные команды быстро пропускаются до дорогой подготовки.
- Сохранить protocol stdout отдельно от stderr, exit/deny behavior и полные остальные tool_input поля при необязательном rewrite.

Выход: шесть concurrent ingress успешно укладываются в выбранный бюджет на проверенной среде; unit/integration correctness не зависит от жёсткой миллисекундной границы на медленном CI. Измерения с timeout записать в evidence.

## 5. P2 — общий CLI admission и обход всех потребителей

Файлы: services/hooks.ts, lifecycle-invocations.ts, lifecycle-command.ts, work-registry.ts, cli/run-cli.ts; generated commands в stage/delegation/recovery.

- После PASS P0 подключить managed Codex к выбранному issued path. Переиспользовать один parser и existing scope/identity validators.
- Составить checked inventory всех операций parser: bootstrap, stage start/finish/pause/resume, work start/finish/fail, recovery acceptance и остальных реально поддержанных lifecycle operations. Каждая отмечается changed / unaffected с причиной.
- Проверить все callers findRecentMatchingHookEvent/claimBootstrapHookEvent/claimStageStartHookEvent/claimWorkStartHookEvent/claimStageLifecycleHookEvent/claimWorkLifecycleHookEvent/observeCommandHook, включая status-публикацию команд.
- Для нового managed пути удалить зависимость от 60s recent-match и 250ms polling. Legacy/nonmanaged compatibility не удалять молча; оставить только явно поддержанный режим, не использовать его как fallback при ошибке нового режима.
- IDs выдаются после окончательной сборки argv, до выдачи агенту; heredoc/response-file/json/progress options не ломают parser. Прочитать existing fingerprint exclusions и не расширять их без доказательства эквивалентности.
- Проверить текущий executing→settled разрыв: existing Work/recovery evidence используется после crash, не добавлять обещание exactly-once для внешних side effects.
- Не разрешать ручному hook handler создавать managed admission без подтверждённой native invocation. Reconciliation по существующему adapter journal/runtime; не обещать security isolation от агента с full OS access.

## 6. P3 — ранняя ошибка без receipt и единый outcome

Файлы: harness-runtime/lib/dd-codex.mjs (native notifications), dd-codex-daemon.mjs; services/lifecycle-invocations.ts (observeLifecycleCommand/assertLifecycleOutcomes), run-controller-state.ts и потребители lifecycle_outcome; dd-eval/lib/runner.mjs.

- hook/completed failure собственного обязательного handler преобразовать в существующий failure channel с native session/tool ID, operation и первичной причиной. Не превращать чужие пользовательские hooks в blockers и не дублировать outcome из CLI/native сообщения.
- Убрать молчаливое if (!anchor) return для ошибок известного managed execution: scope для диагностики берётся из подтверждённого runtime/issued invocation. Diagnostic scope не даёт permission на mutation. Не привязывать неизвестный вызов к «текущему RUN».
- При недоступной БД использовать существующий diagnostic fallback/adapter journal; не пытаться писать сообщение об ошибке бесконечно в сломанную БД.
- effect (no_effect/committed/unknown) отделить от disposition (correctable/fatal). Ownership/admission rejection до мутации — no_effect, но инфраструктурная ошибка остаётся fatal.
- Controller прекращает новые dispatch и останавливает своё дерево существующим stop API; preserve first cause, cleanup failure отдельно. Нет нового watchdog и нет ожидания следующего finish для обнаружения hook failure.
- Eval isInfrastructureFailure получает этот же outcome; ошибка инфраструктуры не оценивается как продуктовый/модельный дефект, completed_with_failures/validity согласованы.
- Результат finish, исправленный schema rejection и hook failure различимы в status, raw journal и итоговом отчёте. Не добавлять независимый poller к каждому уровню.

## 7. P4 — контракты работников и оба review templates

Файлы: harness-runtime/lib/delegation-instructions.mjs, отдельный worker text dd-droid.mjs, services/work-registry.ts, schemas/plan-review-result.schema.json и code-review-result.schema.json (для проверки, не ослабления).

- Продолжать только после успешного start с packet. status не заменяет start. При инфраструктурном отказе прекратить задание, вернуть диагностический результат, не вызывать hook handler, не придумывать IDs/сессию, не запрашивать HITL у ребёнка.
- Сохранить локальное исправление schema/semantic result после успешного start; не перепутать с инфраструктурным отказом.
- В PLAN-REVIEW и CODE-REVIEW заменить remove findings на findings: []; примеры должны проходить реальные schemas. Отдельно проверить пустые замечания и смешанный набор аспектов.
- Не добавлять секретные/технические инструкции в продуктовые prompts и не менять содержание канонического ответа eval.

## 8. Матрица адаптеров: аудит общих последствий

| Adapter | Что проверить/сохранить |
| --- | --- |
| Codex | Native root/child hook, ignored rewrite, code-mode, hook failure notifications; основной новый путь по P0 |
| ZCode | Existing issued invocation + ACP/native identity observation; не требовать отсутствующих child hooks, не нарушить async rendezvous; Grok использует общий bridge |
| Grok | bin/dd-grok.mjs и shared native-hook-command.mjs сохраняют stdout/deny; один источник admission, ACP mirror не создаёт второй |
| OpenCode | Existing awaited tool.execute.before и plugin bridge; не сломать output.args/updatedInput, exact claim и rollback |
| Antigravity | Existing daemon hook.observe и recent-match callers; capability без rewrite не должна получить Codex identity assumptions |
| Droid | Own runtime hook identity/topology и worker instructions; stage/Work owner сохраняется, hook exit не маскируется |

Для каждого указать в implementation evidence: изменённые callers, тест/fixture и unsupported native limitation. Это не требование шести новых полных live E2E. Не заявлять runtime-квалификацию по одним mocked fixtures.

## 9. Регрессии и команды проверки

Расширять существующие test/lifecycle-invocations.test.ts, test/hooks-shell.test.ts, test/runtime-cutover.test.ts, test/run-cli.test.ts, test/run-controller-stages.test.ts и соответствующие test/fixtures/*adapter*.mjs. Eval — существующие runner/control-plane tests. Новые файлы только для отдельного native probe/недостающей boundary integration.

Обязательные сценарии:

1. Six concurrent receipts, own sessions, ignored updatedInput, без schema migration на горячем пути.
2. Hook killed/rollback before commit → no Work mutation и быстрый controller failure.
3. Commit before hook timeout → не двойной переход; первичная ошибка сохранена, эффект определяется по DB.
4. Lost CLI response after commit; replay/restore без повторного Work transition.
5. Stale/foreign generation, одинаковые commands разных attempts, duplicated event, conflicting native identity.
6. Claim rollback при бизнес-ошибке; correctable result resubmission не возвращает старую ошибку навсегда.
7. Receipt отсутствует и anchor отсутствует → ошибка не исчезает; DB unavailable → diagnostic fallback.
8. User hook failure не запускает чужую остановку; own hook failure останавливает только своё дерево.
9. Read snapshot до commit не используется для rendezvous; bounded waiting без write lock и без sleep в sync happy path.
10. Schema-valid empty/mixed findings в обоих templates, общий worker и Droid не разрешают manual receipt repair.
11. Eval validity/first cause/cleanup; fake native event не проходит как подтверждённая managed delivery.

Запуск из dd-flow-cli: `pnpm exec vitest run test/lifecycle-invocations.test.ts test/hooks-shell.test.ts test/runtime-cutover.test.ts test/run-controller-stages.test.ts --pool=forks --no-file-parallelism`, затем затронутые CLI/adapter fixtures по существующему runner. `pnpm typecheck` и `pnpm build` после сборки пакета изменений. Eval: `node --test` с конкретными затронутыми test paths, выбранными по inventory. Не выполнять полный gate после каждой маленькой правки. Один требуемый release gate на окончательной версии при подготовке релиза; не дублировать его вне release script.

## 10. Пройденная мысленная трассировка

**Штатно:** подготовленная DB → issued command → real child hook → commit native context → CLI exact admission → Work start+packet → result → exact finish+schema → outcome → controller следующая работа. Нигде нет предварительного Work start из hook, ожидания фоновой записи или поиска последнего receipt.

**Timeout до commit:** hook killed → host может выпустить CLI → точного admission нет → CLI no_effect error; native failure тоже приходит, controller объединяет по invocation и прекращает дерево. Не ждёт 11 минут. Нельзя доказать managed scope → adapter channel сообщает failure, CLI не выдумывает scope.

**Timeout после commit:** host выпускает CLI одновременно с native failure. Admission может уже произойти; cancellation не делает rollback committed SQL. Controller сохраняет ошибку и реальный persisted результат, не выдаёт новую попытку вслепую. Recovery нужен только при действительно неизвестном эффекте.

**Некорректный результат:** Work был started → finish validator отвергает до принятия → no_effect/correctable → агент исправляет JSON → existing retry contract выдаёт/принимает корректную попытку → один завершённый Work. Это не инфраструктурная остановка.

**Старый receipt:** новая generation/attempt не совпала → отказ до мутации; совпадение команды или свежесть не заменяет exact admission. Fork не наследует действующие authority старого daemon.

**Повтор native сообщения:** same identity/event → та же запись; conflicting identity → явная ошибка. Raw ACP mirror не создаёт новый admission. Missing root/child mapping не восстанавливается эвристикой строки ID.

## 11. Доставка, документы, критерии завершения

Порядок: P0 → P1/P2 → P3 → P4 → локальные регрессии/сборка → review diff и evidence. P3/P4 можно делать независимо от P0; новый transport включать только после PASS P0.

- Обновить runbooks/execute-eval.md, harness-backends.md и CP-110 investigation: contract, supported transports, timeout ownership, что означает no_effect и как восстанавливать.
- Документировать миграцию existing home, несовместимость старого writer и rollback: не откатывать бинарь на изменённую schema без подтверждения совместимости; исходные snapshots сохранять.
- Обновить bundled runtime/assets вместе с CLI, проверить packaging через существующую сборку; не считать изменение src доставленным в установленный engine.
- Заполнить evidence по P0–P4: файлы, проверки, результаты, оставшиеся ограничения. Никаких отметок done для непроверенной native возможности.
- Готовность: нет потери первичной ошибки, нет ручного handler repair, данные Work меняет CLI, нет обязательного updatedInput, concurrency probe проходит, все исправления findings включены, старые RUN читаются.
- Следующий live контроль после отдельной команды запуска: новый fork с последней совместимой границы PLAN → PLAN-REVIEW CP-110, engine новой сборки; не менять оригинал. Проверить фактическую boundary через текущий fork CLI/runbook, не придумывать flags. Один такой run проверяет волну шести работников; не повторять SPECIFY/PROTOCOLIZE/PLAN без необходимости.

## 12. Реализация и локальная квалификация

Выполнено:

- P1: добавлен подготовленный `hook` open mode; native PreToolUse не запускает migration/VACUUM. Обязательная schema, writer contract и `lifecycle_invocations` проверяются до записи; lifecycle table подготавливается один раз на обычном startup.
- P2: managed Codex подключён к существующему issued invocation path. Codex root в daemon state поддерживает нативный string-формат; child `agent_id` и `tool_use_id` сохраняются отдельными полями. Receipt query теперь параметризует harness и требует exact project-root/native identity.
- P3: Codex compound lifecycle rejection до исполнения атомарно получает `effect=no_effect`, durable outcome и единственный successor; hook возвращает deny. Новые admission/storage/identity ошибки классифицируются `dd-eval` как инфраструктурные; worker/controller не должны восстанавливать их ручным handler или status.
- P4: обновлены общий delegation contract и Droid worker prompt; шаблоны PLAN/CODE REVIEW оставляют `findings: []` для пустого списка.
- Обновлены `execute-eval` и `harness-backends`; investigation CP-110 содержит причинную цепочку, границы доказанности и evidence реализации.
- Актуализирован тестовый pin case на CP-110/beta.75, чтобы проверка действительно проверяла текущий входной checkpoint.

Доказательства:

- Прежнее утверждение «123/123 после финальных правок» снято: нет согласованного финального протокола именно такого набора; результаты ревью фиксируются ниже.
- `dd-eval`: выбранный runner/control-plane/eval набор — 151 тест, 146 passed, 5 skipped, 0 failed.
- Прежний тест шести receipts выполнял hooks последовательно и не доказывал concurrency; он переименован. При ревью добавлена отдельная проверка шести процессов с разными child identities и общей SQLite DB. Это всё ещё synthetic native input, не live P0.

Не заявляется без live provider: native Codex E2E в установленной пользовательской сборке не запускался этим изменением. Перед следующим живым E2E нужно собрать/выбрать новый engine artifact и создать новый fork от согласованной границы; исходный CP-110 RUN не менять.

## 13. Ревью реализации 2026-09-17

Исправлены существенные дефекты:

1. CLI вызывал observation до `awaitLifecycleInvocation`: отсутствующий пока receipt прерывал async ZCode и replay. Теперь ожидание/retained outcome предшествует observation; replay не запускает dispatch. Добавлен тест реального `runCli` с изолированными routing/preflight, реальными DB/admission и немедленным/отложенным outcome.
2. `hook/completed` Codex только журналировался. Теперь failure своего managed handler поднимается до собственного root по native topology, сохраняет первую причину, прерывает ожидающий RPC и обнаруживается в prompt/start/inspect. Чужой hook, чужое дерево и успешный hook не становятся ошибками. Cancel не блокируется этой проверкой. Native событие для регрессии взято из CP-110; live stop этим тестом не доказан.
3. Receipt timeout создавал successor и тем самым скрывал ошибку от controller. Теперь timeout — durable `no_effect`, `recoverable=false`, без successor; dd-eval классифицирует его как инфраструктуру.
4. Compound deny выдавал старый ID вместо successor. Исправлено, повторный deny воспроизводит тот же successor; неоднозначные несколько lifecycle-команд не превращаются в разрешённую replacement-команду. Retry публикуется только после COMMIT.
5. Managed observation больше не падает обратно на recent-match при наличии invocation ID. Legacy rewrite сохраняет остальные tool_input поля.
6. Hook storage не создаёт пустой home; проверяется наличие нужных receipt columns, а не только имён таблиц. Transcript discovery вынесен из receipt write transaction; нерелевантный shell больше не читает child transcript header.
7. PLAN/CODE REVIEW получают schema-valid примеры без findings и со смешанными аспектами. Восстановлена форма непустого finding; оба примера каждого типа проверяются штатным schema validator. Общая worker-инструкция не утверждает, что любой адаптер обязательно получает invocation ID.

На момент первого ревью оставалось (результаты закрытия — раздел 14):

- P0: ограниченный **живой** native root/child + code-mode эксперимент без updatedInput, включая реальную волну шести детей и delivery/replay. Локальные synthetic tests этого не заменяют.
- P1: минимальный ingress до полного business-router; cold/warm end-to-end измерения и согласованный внутренний deadline. Текущий open mode устраняет миграции, но сам по себе не доказывает выполнение всего P1. Не повышать timeout ещё раз вместо измерения.
- P2: native provenance/reconciliation для защиты от ручного handler repair сверх проверки supplied native fields. Полной изоляции от агента с OS-доступом не заявлять.

Исходный CP-110 RUN не изменялся; публикация и новый E2E в рамках ревью не выполнялись.

Проверки ревью:

- Выбранный набор семи файлов CLI/controller/runtime: 159/159 passed (99.15 s).
- После финальных изменений чтения transcript и распространения native error: 32/32 в трёх файлах runtime/CLI/examples; `lifecycle-invocations` отдельно 51/51 passed. В первой итерации нового теста metadata был неверно ожидаем object вместо штатного identity tuple; исправлено ожидание, код хранения не изменён ради теста.
- `pnpm build`, `pnpm typecheck`, `git diff --check` успешны. Сборка обновляет bundled runtime; установленный release engine не заменялся.
- `dd-eval`: `node --test test/eval.test.mjs test/runner-recovery.test.mjs` — 105/105 passed.
- Шесть холодных hook-процессов проверены в общей DB на synthetic child payload. Полный lifecycle файл с этим тестом проходит; время отдельного теста в первом прогоне — 329 ms. Это не замер полного native host → router → ingress и не PASS P0.

## 14. Завершение ingress/provenance и живая квалификация

Реализован минимальный entry до business-router: общий parser отбрасывает нерелевантные инструменты без DB; bounded worker сначала подтверждает native delivery, затем открывает prepared store и пишет receipt. Worker ожидается до COMMIT, не работает в фоне. Бюджеты: daemon verify 5 s внутри worker 20 s внутри native host 30 s. Полная ошибка сохраняется в stderr; успешный ответ содержит только native protocol. Phase timing пишется отдельно в stderr.

Подтверждение происхождения переиспользует Codex daemon и его app-server stream: `hook/started` создаёт временную запись активного managed hook, `hook/completed` удаляет её. Read-only `hook.verify` проверяет native root/child/tool/turn и topology. Handler принимает proof только из этого пути, а не из stdin; сверяет home/project/command и transcript parent. Новых таблиц, очередей, detached-процессов, polling по JSONL или зависимости от updatedInput нет. Это защита от ошибочного ручного repair, не security sandbox от произвольного OS-доступа.

Инвентаризация общего command path: session register; stage start/finish/pause/resume; work start/finish/fail; run recovery accept. Producer-ы `run-controller`, `vnext-specify/protocolize/plan/plan-review/code/code-review/merge`, `stage-pause`, `work-registry`, `merge-server`, `run-recovery` используют общий managedLifecycleCommand/issuance. Retry использует общий successor, retained outcome читается до observation. Ни один новый provider-specific business dispatcher не добавлен. ZCode сохраняет свой существующий receipt transport; Codex-specific proof не навязывается остальным адаптерам.

Воспроизводимый ограниченный эксперимент: `node tools/probe-codex-hook-admission.mjs` из dd-eval после сборки dd-flow-cli. Создаёт изолированные project/home/CODEX_HOME/daemon, использует существующий login через ссылку на auth.json без копирования секрета; finally останавливает собственное дерево. Business mutation заменена безвредным retained marker, production issuance/native hook/provenance/receipt/claim/settle используются настоящие. Это НЕ полный E2E и НЕ изменение исходного CP-110.

Первый живой PASS: `/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-codex-admission-aIlg2q/summary.json`, рядом native journal/transcripts. Codex 0.154.0, gpt-5.6-luna. Два root вызова через native code-mode shell, шесть разных native child IDs, восемь settled receipts. Actual hooks детей пересекались во времени. Холодный root: 1836 ms; следующий root: 915 ms; дети: 720/808/840/1079/1164/1158 ms. Manual handler с прежним native payload: native_hook_unproven; повтор завершённой CLI-команды: сохранённый marker, replay=true. Cleanup: stopped=true, clean=true.

В этой установленной сборке shell доступен через code-mode `exec → tools.exec_command`; отдельного direct shell tool верхнего уровня нет. Не заявляем отдельный отсутствующий transport: реальный Bash PreToolUse подтверждён для основной и дочерних сессий.

Регрессии: native active/foreign/stale/turn/tool topology proof; raw handler без proof; отсутствие DB для unrelated ingress; шесть отдельных cold writers; retained replay и задержанный receipt; first native failure и propagation; schema-valid review examples. Финальные результаты приведены ниже.

Дополнительный native PASS с фазой намеренного отказа: `/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-codex-admission-XK0hm4/summary.json`. Все восемь admissions повторно прошли (740/257/482/483/507/559/520/319 ms). Вызов с невыданным ID через настоящий shell → PreToolUse не создал receipt; session.prompt завершился native_hook_failed за 5416 ms, включая генерацию моделью вызова. Ошибка не проглочена, daemon cleanup stopped=true/clean=true. Завершение native Turn дополнительно удаляет незакрытые active proofs, чтобы потерянный hook/completed не оставлял stale authority.

Финальные проверки: lifecycle/CLI/runtime 82 passed; runtime/examples/controller-stages 39 passed; early ingress 1 passed; dd-eval eval+runner-recovery 105 passed. Эти наборы пересекаются — не суммировать в число уникальных тестов. Typecheck и сборка прошли. После удаления stale proof выполнена повторная точечная runtime-проверка. Все P0–P4 закрыты в указанном объёме; полный продуктовый E2E и выпуск нового артефакта остаются отдельным запуском, не частью этого bounded diagnostic.

В финальном повторе выявлен test-only timing defect: проверка передачи structured error ограничивала cold Node startup одной секундой и иногда получала timeout вместо ожидаемого error. Проверка формата теперь имеет отдельный запас запуска; сценарий зависания по-прежнему явно проверяет короткий deadline. Production timeout не изменялся.
