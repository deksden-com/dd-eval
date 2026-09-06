# 028 — Дефекты повторного Droid E2E: причины и системный план исправления

Дата: 2026-09-06. Статус: **расследование и проект изменений; исправления этого пакета ещё не реализованы**.

Основание: [аудит CP-073](../runbooks/task-priority-baseline-audit-2026-09-06.md),
прогоны `EVAL-20260906193630-e4169daa` и `EVAL-20260906192414-ddcfa3bc`.
Срез кода: dd-eval `5653af8`, dd-flow-cli `bc11ec7`; исполнявшийся engine —
beta.19 (`02648aa2`), исходный продукт — `44939e9`, Droid — `0.212.0`.
План дополняет 018, 024, 026 и 027, используя существующие operation registry,
recovery generation, managed processes и check receipts.

## Вывод

У проблем несколько владельцев. Общая тестовая БД — дефект исходной тестовой
инфраструктуры dd-tasks. Переключение Sol → Kimi — штатный механизм Factory,
сработавший при исчерпании лимита и несовместимый со строгим профилем эвала.
Продолжение после обнаружения переключения, заблокированная отмена и конфликт
финализации — дефекты dd-eval. Выделенные Flow порты не потребляет конфигурация
Playwright исходного проекта. Отдельное падение клавиатурного browser-теста
воспроизводится без приложения и БД.

Полная оценка модели по этому запуску недостоверна. При этом уже выполненная
работа и конкретные недостатки её проверки остаются доступными для анализа.

## 1. Sol → Kimi: первопричина установлена

В предыдущем аудите причина была неизвестна. Найден дополнительный источник:
`executions/e2e/drivers/daemon/home/.factory/logs/droid-log-single.log`.
Он содержит события дочернего процесса, отсутствующие в потоке root RPC.

| UTC | Событие | Источник, строка |
| --- | --- | --- |
| 20:30:57.885 | Sol: 77 544 токена при пороге compaction 250 000, `under` | native log:15913 |
| 20:30:58.873–875 | Запрос Sol получил `paymentRequired`, HTTP 402: исчерпан пятичасовой standard usage limit | native log:15925–15926 |
| 20:30:58.903 | Native settings ребёнка обновлены на `kimi-k3` | native log:15927 |
| 20:30:58.904 | `Model-Router`: `source=detector_recovery`, `reason=overage_reactive_402`, main slot Sol → Kimi | native log:15928 |
| 20:30:58.907–931 | Сериализация контекста после смены провайдера; `summaryKind=provider_switch_serialization` | native log:15930–15933 |
| 20:30:58.948 | Подготовлен следующий запрос уже к Kimi | native log:15944 |
| 20:35:42.570 | Первый Execute отклонён нашим hook с `profile_drift` | native child transcript |

Первый `work start` прошёл на Sol. Смена произошла внутри дальнейшего native
agent loop. Контекст не достигал порога compaction; запись compaction здесь —
следствие сериализации при смене провайдера, а не причина переключения.

В коде установленного executable найден тот же путь `overage_reactive_402`:
при `overagePreference === droidCore` и наличии recommended core model он
вызывает `SessionService.setModel`. Этот путь не проверяет модель custom droid
и не использует словарь `modelFallbacks`. Overage preference берётся из данных
account/subscription; отдельный Factory home с копией входа её не изолирует.
Официальный [changelog Factory](https://docs.factory.ai/changelog/release-notes)
документирует автоматический переход на Droid Core при такой настройке.

**Исправление контракта:** строгий профиль должен означать запрет смены модели
в течение всей попытки, включая дочерние сессии. Preflight должен отдельно
проверять и сохранять доступность модели, наблюдаемую политику fallback и
возможность её запрета. Успешный `list_models` не подтверждает остаток лимита.

Нельзя считать `modelFallbacks: {}`, повторное `--model Sol` или
`compactionModel: same` решением этого инцидента. Документированный
`modelFallbacks` относится к другой ветке выбора модели
([Factory settings](https://docs.factory.ai/droid-cli/settings)).
Поддерживаемый запрет quota fallback на уровне конкретной Session/CLI в этом
расследовании не установлен. Его нужно квалифицировать до обещания жёсткого
pin. При обнаруженной политике `droidCore` strict scored preflight должен
сообщать несовместимость. Настройка `/limits` относится к аккаунту; перевод
на Extra Usage затрагивает расходы и не является автоматическим исправлением.
Ни настройки аккаунта, ни расходы этим расследованием не менялись.

Независимо от preflight адаптер обязан останавливать попытку при фактическом
нарушении профиля. Проверка лимита в начале не гарантирует лимит до конца,
особенно при других сессиях того же аккаунта. Постфактум возвращать Sol в
settings и объявлять смешанную историю чистым Sol-запуском нельзя.

## 2. Почему обнаруженный profile drift не остановил prompt

Места: `lib/dd-droid.mjs` — `prepareDroidHome`, `event`, `observeHook`,
`refreshTopology`, `prompt`; `lib/dd-droid-daemon.mjs` — `hook.observe`;
`bin/dd-droid.mjs` — сериализация hook output.

Подтверждённая цепочка:

1. Pre/PostToolUse hooks установлены только для `Execute`. Read, Grep, Glob,
   Edit, Create и остальные инструменты не проверяются этим guard.
2. `observeHook` выбрасывает `profile_drift` в отдельном RPC. Это отклоняет
   данный tool call, но не вызывает reject активного root prompt.
3. Hook CLI завершает ошибку кодом 2. Для PreToolUse это корректирующая ошибка
   конкретного инструмента, после которой native агент может продолжить.
4. `event` не обрабатывает `settings_updated` как изменение доверенного профиля.
   Даже root notification не прерывает prompt; child notifications в нашем
   root RPC вообще не были доставлены. Обработка только root event не решит всё.
5. Native progress и hook-вызовы увеличивают `activity`, поэтому liveness
   watchdog не является механизмом завершения такого нарушения.
6. CLI hook output сохраняет только `hookSpecificOutput`, отбрасывая общие
   поля `continue` и `stopReason`, даже если адаптер начнёт их возвращать.

**Системный фикс:** одна сохраняемая первая ошибка целостности на execution
(с Session ID, native источником, временем, ожидаемым/наблюдаемым профилем и
причиной). Все точки обнаружения вызывают общий обработчик: отклонить
дальнейшую продуктивную работу, завершить активный prompt исходной ошибкой,
однократно запустить прекращение собственного дерева, сохранить cleanup отдельно.

PreToolUse guard должен покрывать все инструменты. Передача shell lifecycle
событий в Flow остаётся отдельной обязанностью: не надо отправлять каждое
чтение в Flow как shell command. Проверка профиля нужна и для `noFlow` smoke.
На успешном create/resume контроль вооружается после применения native
настроек: начальные `normal → auto-high` notifications не должны давать ложный
drift. Отсутствующий/частично записанный native settings — неизвестное состояние,
а не выдуманная другая модель; перед продуктивным действием требуется завершённая
проверка с ограниченным ожиданием и явной диагностикой.

Для hook использовать документированное `continue: false` / `stopReason`
([Factory hooks](https://docs.factory.ai/harness/hooks)) и сохранять эти поля
в CLI. Это дополнительное прекращение child loop; оно не заменяет общий
fatal state и остановку root/соседних детей. Отдельно квалифицировать поведение
в native версии 0.212.0; undocumented exit code 3 не нужен как основной контракт.

Раннее наблюдение child profile требует контролируемого источника: native
child channel, если поддерживается, иначе ограниченного наблюдателя известных
child settings/событий с проверкой identity. Не сканировать заново всю историю
на каждый heartbeat и не приписывать сообщения из другого execution.
Polling/hook обнаруживают нарушение после native переключения; они не дают
гарантии нулевого числа токенов чужой модели. Для неё нужен запрет fallback
на native стороне. Любой уже смешанный запуск сохраняет invalid qualification.

Остановка должна планироваться вне очереди `this.draining` и после возврата
hook-ответа: `closeTree` сама ожидает draining и native close, поэтому прямое
ожидание cleanup внутри обработчика события создаст риск взаимной блокировки.

## 3. Отмена не должна требовать исправного профиля

Места: `runner.mjs:withExecutionDaemon/runnerCancel`,
`dd-droid-daemon.mjs:daemon.status/session.cancel/daemon.stop`.

`runnerCancel` сначала вызывает `withExecutionDaemon`, который проверяет
`daemon.status`. Droid status вызывает `refreshTopology`, а тот валидирует
модели всех детей и выбрасывает `profile_drift`. До `session.cancel` управление
не доходит. Сам `session.cancel` уже умеет сначала прекратить процессы и лишь
затем приложить inspection error. Прямой вызов на синтетической модели доказал:
status падает, cancel успешно возвращает `settled: true`.

**Системный фикс:** разделить диагностику здоровья и проверку пригодности к
продуктивной работе. `daemon.status` сообщает известное состояние и ошибки
наблюдения, а не делает control plane недоступным. Cancel/stop обращаются к
существующему владельцу по подтверждённым native ID и process identity, не
требуя соответствия модели. Не отключать проверки ID, каталога и принадлежности
процессов. Не превращать ошибку status в разрешение запустить второй daemon.

Для отмены нельзя использовать productive recovery bridge, который может
стартовать native runtime, перечитать модель или скопировать auth. Если daemon
уже отсутствует, сначала сверить сохранённое владение и процессы; подтверждённо
пустое дерево означает idempotent settlement. Живые подтверждённые остатки
завершать через существующий managed-process cleanup; неизвестное владение
возвращать как `settlement unconfirmed`, не как успех.

Одновременные stop/cancel должны присоединяться к одному cleanup promise и
возвращать один результат. `settled`, `clean`, исходная ошибка и ошибки cleanup
сохраняются независимо. `settled: true, clean: false` допустимо и правдиво.

Runner сейчас добавляет `--cancel-tree` в launch finally только для
`subject_liveness_timeout`. Подтверждённый fatal profile violation тоже требует
прекращения дерева; transport/observation loss по-прежнему не доказывает право
считать неизвестную provider operation завершённой. Сохранить различие из 026.

## 4. Cancel и launch конкурируют за итог execution

В первом остановленном прогоне:

- 19:34:13.713 — cancel requested;
- 19:34:15.925 — execution cancelled;
- 19:34:15.935 — candidate frozen;
- 19:34:17.632 — поздний launch записывает `incomplete_subject_turn`;
- повторная финализация получает `candidate_revision_unauthorized`.

Первопричина: блокировки есть для каждого operation ID, но launch и cancel —
разные операции. Нет общего атомарного выбора итогового состояния execution.
`storedExecutionResults` выбирает launch failure раньше cancellation;
`runnerRun` финализирует собственный локальный массив results. После отмены
его обработчик всё ещё проверяет незавершённую стадию как ошибку Subject.
Блокировка append защищает JSONL от повреждения, а не от этой смысловой гонки.

**Системный фикс:** использовать один reducer и короткую cross-process
блокировку для terminal transition текущего execution/generation. Переиспользовать
`withRunnerLock` и существующую recovery generation, не вводить второй registry.
Проверять cancellation/fatal intent перед следующим dispatch, переходом стадии,
принятием terminal результата и freeze. Provider I/O не держать под этой блокировкой.

Правила разрешения гонки:

| Первое принятое событие | Следующее событие | Итог |
| --- | --- | --- |
| Productive completion | Cancel | Already terminal; результат не отменяется задним числом |
| Cancel intent | Поздний нормальный ответ root | После settlement — cancelled; ответ остаётся evidence, нового dispatch нет |
| Cancel intent | Неподтверждённый stop/живые дети | Cancelling/settlement unconfirmed; candidate не замораживается как settled |
| Подтверждённый fatal violation | Cancel для cleanup | Исходная ошибка сохраняется; cleanup не заменяет её на пользовательскую отмену |
| Terminal generation | Поздний ответ старой generation | Историческое evidence, без изменения принятого результата |

Freeze/final Judge должны использовать сохранённую terminal projection после
подтверждения settlement. Финализация дедуплицируется по принятому candidate
hash; длительный Judge не выполняется под execution lock. Смерть runner между
intent, settlement и freeze обрабатывается тем же reducer при восстановлении.

Не ослаблять `candidate_revision_unauthorized` и не разрешать произвольную
перезапись candidate: защита правильно обнаружила ошибку более раннего слоя.
Также нельзя просто поднять cancellation выше любого failure в функции
чтения — это скроет реальную ошибку, которая предшествовала отмене.

## 5. Общая тестовая БД: изоляция должна доходить до каждого потребителя

Первопричина подтверждена исходником тега `44939e9` и историческими receipts:
`apps/api/tests/global-setup.ts` создаёт и сбрасывает фиксированную
`dd_tasks_foundation_test_vitest`; Vitest config принудительно задаёт её в
`DATABASE_URL`. При сбросе не проверяется владелец тестового мира.

`getFlowScopedLocalDatabaseUrl` используется в DB CLI commands и требует
runId; `createSqlClient` и global setup его не вызывают. Значение
`DD_FLOW_LOCAL_DATABASE_SUFFIX`, которое Flow считает от checkout, туда не
доходит. `fileParallelism: false` действует внутри одного процесса Vitest.

В двух разных eval integration команды перекрылись 20:25:04–20:25:21.
Droid ожидал checksum `9a0fe038…`, а ledger общей БД содержал checksum
параллельного AGY `53deac64…`. Ошибка `Applied migration changed` и часть
500/401 ответов получены в испорченном внешним сбросом мире. Это не повод
отключать checksum check. Новая migration-upgrade фикстура Subject тоже содержит
фиксированное имя БД; исправление только основной fixture оставит аналогичный путь.

**Предлагаемый минимальный общий контракт:** один test-world на запуск
проверочной команды, общий для её setup, API, workers, seed и teardown.
Namespace одного checkout недостаточен для двух проверок в том же checkout.

В dd-tasks вынести создание мира в один небольшой project-owned launcher/helper.
Он один раз создаёт уникальный ID, передаёт точные URL/имена через environment
в дочерние процессы и фиксирует роли `integration`, `upgrade`, `browser`.
Vitest config/setup и upgrade fixture читают этот контракт; они не генерируют
разные случайные имена при повторном импорте модуля. Обычный `pnpm test` вне
Flow использует тот же путь. Независимые Vitest invocations получают независимые
миры, даже если запущены одним aggregate check.

Все reset/migrate/seed/client операции используют один resolver. До первого
разрушительного действия проверить local test target и владение конкретным
миром; отсутствие binding в eval — явная ошибка, а не fallback к общей БД.
Имена укладываются в лимит PostgreSQL и безопасно формируются/цитируются.
В receipt сохранять endpoint без credentials, namespace, owner, роль и migration
fingerprint. Normal teardown удаляет только свои БД после завершения клиентов;
при crash остаётся ownership manifest для безопасной адресной уборки. Возраст
записи не доказывает, что мир свободен.

В Flow использовать уже имеющийся check receipt/process ID как внешний owner,
передаваемый в environment. Случайный namespace не должен случайно ломать
семантический input hash или связывать повтор с живыми ресурсами прошлого check.
Продуктовые SQL-детали остаются в dd-tasks. Полноценная платформа контейнерных
миров не нужна для устранения этого подтверждённого дефекта.

До реализации допустима только полная сериализация всех пользователей общей
fixture; `concurrency=1` в одном run profile не блокирует другой runner или
ручную команду. Это временная мера, не квалификация параллельных эвалов.

## 6. Browser ports и независимое падение keyboard test

### Порты

Flow корректно выдал `resources.ports={api:54450,web:54451}` в CODE RCP-010.
`apps/web/playwright.config.ts` использовал 8788/4174 для команд, readiness URL
и baseURL, игнорируя `DD_FLOW_PORT_API/WEB`. Проблема наследуется от исходной
конфигурации; в конкретном RCP-010 конфликта bind не было.

Исправить общий resolver browser environment: allocated API/Web ports должны
использоваться в server command, Vite proxy, webServer readiness и test baseURL.
В режиме eval отсутствие выделенного порта не заменять фиксированным числом.
Проверить фактические listener endpoints и world identity перед browser checks;
наличие lease на неиспользуемый порт не доказывает изоляцию. Переиспользовать
существующий allocator Flow, не писать второй поиск свободного порта.

### Клавиатурный тест

RCP-010: 6 тестов прошли, один упал на `core.spec.ts:280`: после трёх
`ArrowDown` select оставался `no_priority`, ожидался `high`. Скриншоты ниже
этого assertion не выполнялись; missing artifacts — следствие раннего падения.

Минимальный опыт без приложения, React, API и БД, с тем же Playwright 1.62.1,
Chromium 151.0.7922.34 и Desktop Chrome preset на darwin:
`focus + ArrowDown ×3` → `no_priority`; дополнительный Enter → `no_priority`;
`selectOption('high')` → `high`. Аналогичный результат получен через agent-browser
на отдельном Chromium 148. Все созданные браузеры закрыты.

Конкретное ожидание теста непереносимо в этой headless среде. Это не доказательство
ошибки API или React onChange. Проверку четырёх значений, PATCH, сохранения и
отрисовки сделать через семантический выбор. Клавиатурную доступность сохранить
отдельным тестом на поддерживаемом сочетании OS/browser с проверенной реальной
последовательностью клавиш; `selectOption` сам по себе её не доказывает.
Точная причина платформенного поведения Chromium глубже минимального repro
не устанавливалась. Не подменять её недоказанным объяснением про Enter или popup.

Есть также замечание Judge о независимом доказательстве PATCH без priority:
нужен сценарий «установить high → PATCH только title/description → повторное
чтение всё ещё high». Это недостаток проверки частичного решения Subject,
а не механизм упряжки. Не добавлять такую подсказку в стартовый контекст эвала.
Форматирование было исправлено первым repair; обязательные gates отключать не надо.

## 7. Подготовка baseline и engine: что исправлено, что предотвратить

CP-071 совместно поменял source и flow_pack на `f4d613d5`, где задача уже была
реализована по другому контракту. CP-073 исправляет выбор исходника, но
checksum/tag доказывают identity выбранного commit, а не его пригодность к задаче.
Текущее поле `ready_for_e2e` не заменяет проверку стартового состояния.

Нужен небольшой case-owned baseline acceptance check до Subject: задача ещё
не реализована, исходная схема и обязательные проверки согласованы с выбранным
pre-feature baseline. При обновлении Flow сохранять source по умолчанию;
изменение source требует отдельного baseline review и нового checkpoint.
Проверка пригодности остаётся у runner и не раскрывает скрытые решения Subject.

Исправление тестовой инфраструктуры делать на ветке от `44939e9`, сохранив
pre-feature продукт. Выпустить новый source commit/tag и checkpoint с новой
подтверждённой средой. Не hotpatch уже материализованный scored workspace и
не передвигать старый тег. CP-071/072/073 и их receipts остаются историческими.

Установленный npm beta.19 и router snapshot beta.18 были разными экземплярами.
Preflight правильно заблокировал несоответствие; snapshot уже исправлен и
побайтово проверен. Для последующих запусков записывать resolved path, build
commit, version и checksum; проверять фактически выбранный engine, а не только
`dd-flow --version`. Сейчас `assertCheckpointEngine` сравнивает версии;
проверку закреплённого artifact digest/build identity нужно сделать явной,
чтобы другой build с тем же version не проходил по одному номеру.

Метка `local_development` выводится эвристикой по `.git` в предках packageRoot.
Она не является доказательством происхождения npm-байтов; provenance следует
брать из проверенного build manifest/package integrity. В данном случае
подмены байтов обнаружено не было.

Ранее найденная гонка `recoverOperation` уже исправлена в `dad947e`: сохраняется
ссылка на active operation до await. Её регрессия остаётся обязательной;
заново переписывать runtime из-за неё не требуется. 203 проходивших теста
подтверждали тот срез, а не исправления настоящего плана.

## 8. Качество оценки и сохранность причин

Фактический `reports/report.json` уже содержит
`run_validity=invalid_infrastructure_flow`; вложенный Judge receipt содержит
`valid` для рассмотренного неполного candidate. Обобщённый статус инфраструктуры
не был ошибочно превращён в pass. Однако два одноимённых понятия легко спутать,
а private расследование БД и native 402 не входило в разрешённый пакет Judge.

Приоритет: нормализовать native причины и ресурсные нарушения в existing
execution evidence. Прилагать session-scoped выдержку с hash/путём источника,
не весь native log с посторонним содержимым. Отделить качество доступных
артефактов от пригодности запуска для сравнения моделей. Judge не должен
повышать детерминированно invalid qualification.

Для находок после freeze — отдельное неизменяемое дополнение, связанное с
candidate/evidence hash. Если нужна повторная оценка, создавать новый Judge
receipt через явную ревизию. Исходный candidate, score и JSONL не переписывать.
Вмешательство другого eval предъявлять через минимальное доказательство
конфликта ресурса; не давать Judge произвольный доступ ко всем чужим workspace.

## 9. Пакеты реализации и обязательные проверки

| Порядок | Пакет и владелец | Приёмка |
| --- | --- | --- |
| P0.1 | dd-eval: control path cancel/stop, единый cleanup | Child drift, malformed topology и root drift не блокируют остановку; foreign identity блокируется; параллельные stop coalesce; нет живых потомков/копий auth; исходная ошибка сохранена |
| P0.2 | dd-eval: fatal profile state, все tools, native cause | Синтетические 402 → settings switch в root/child; первый запрещённый tool не исполняется; prompt заканчивается исходной ошибкой; нет нового child/repair; no-flow smoke тоже контролирует модель |
| P0.3 | dd-eval: execution terminal reducer/finalization | Двухпроцессный launch/cancel с управляемыми барьерами: cancel-first, completion-first, error-first, stop unknown, runner crash, late generation; один terminal/candidate/Judge, без самовольных revisions |
| P0.4 | dd-tasks + минимальный Flow env contract: test worlds и ports | Два одновременных прогона с разными migration hashes, плюс два check invocation одного checkout: ни reset, ни ledger/seed/session/port не пересекаются; kill одного не затрагивает второй; env receipt совпадает с фактическим сервером |
| P1.1 | dd-eval: admission/qualification, baseline/engine evidence | Несовместимая quota policy, уже решённая задача, неверный tag/commit и другой digest того же version не допускаются; технический smoke не маркируется scored pass |
| P1.2 | Отдельная диагностика Subject browser/check gaps | Семантический выбор и сохранение проходят на том же Chromium; keyboard проверяется отдельно без снятия требований; historical Subject не исправляется задним числом |
| P1.3 | dd-eval: evidence/отчёт | Provider quota и drift связаны с конкретным native child; известное ресурсное вмешательство видно Judge; общий invalid не перекрывается оценкой качества; старые receipts неизменны |

P0.1 нужен до включения автоматической остановки P0.2. P0.3 не решается одним
catch в Droid: проверить все harness entrypoints, использующие общий runner.
P0.4 и baseline acceptance должны войти в новый исходный checkpoint до следующего
сравнительного запуска. Реализацию делать отдельными проверяемыми коммитами;
существующие механизмы 026 не дублировать.

После целевых регрессий: необходимые проверки затронутых репозиториев, релиз
изменённого Flow/flow pack только если затронут их контракт, проверка именно
установленного artifact. Затем короткий live smoke под подтверждённым профилем
и новый E2E до MERGE. Bounded smoke не должен намеренно исчерпывать реальный
лимит аккаунта: ветка 402 проверяется scripted provider; live проверяет
поддерживаемый hook/control контракт. При повторном настоящем quota event
ожидается быстрая явная инфраструктурная ошибка, а не смена модели и ремонт кода.

## 10. Что проверено в этом расследовании

- Прочитаны исходные baseline fixture, Flow check allocator и runtime env,
  Droid adapter/daemon/CLI, runner transitions/freeze, native child и vendor log.
- Установлена 402 → account overage fallback причинная цепочка; подтверждена
  соответствующей веткой кода установленного executable.
- Выполнен локальный `reproduce.mjs`: fake native provider + реальный adapter
  подтвердили status/cancel разрыв; runtime fixture — отсутствие propagation;
  replay исторических событий в новом временном каталоге — freeze conflict.
- Выполнен минимальный browser repro на той же версии Playwright/Chromium.
- Не запускались новые продуктивные модельные сессии, не сбрасывались БД,
  не менялись account preferences, Subject workspace, baseline tags или scores.
- Продуктовый код и код упряжки в рамках этого запроса не изменены.

Локальный пакет: `~/.dd-eval/conformance/droid-defects-20260906/`:
`native-fallback-cause.json`, `native-binary-analysis.json`, `reproduce.mjs`,
`reproduce-result.json`, `select-repro.html`, `select-repro.mjs`,
`select-repro-result.json`. Он не нужен для будущего CI: при реализации заменить
исторические пути минимальными синтетическими fixtures в existing test suite.
