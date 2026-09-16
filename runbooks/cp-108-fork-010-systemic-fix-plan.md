# cp-108 fork-010 — системный план исправления и выполненная трассировка

Дата: 2026-09-15. Статус: проект решения; реализация и квалификация впереди.
Основание: `cp-108-fork-010-investigation.md` и исходный `cp-108-fork-009-observability-fix-plan.md`.
Этот документ уточняет оба: он не объявляет beta.68 исправленной и не заменяет недоказанное поведение предположением.

## 1. Единая модель и границы ответственности

Различаем четыре объекта: EVAL, RUN, ACP-turn, native model request. Один turn содержит несколько запросов, инструменты и дочерние сессии. Отдельно существует disposable RPC-клиент, ожидание которого может закончиться раньше операции.

- **dd-eval** владеет экспериментом, ответами HITL по фикстуре, observer и итоговым отчётом. При ошибке продолжает согласование существующего RUN control. Не останавливает native-процессы в обход владельца.
- **dd-flow RUN control** владеет generation fence, единым stop intent, проверкой ресурсов, закрытием операций и разрешением snapshot/capture. Fatal-stop должен проходить тот же путь при любом harness.
- **Harness daemon** владеет реально запущенной операцией, её журналом и наблюдением, привязкой native/adapter идентификаторов. Потеря клиента не отменяет его операцию.
- **zcode-acp backend owner** владеет отдельной native process group и подтверждает её завершение. ACP bridge group и native backend group не взаимозаменяемы.
- **Адаптер конкретного провайдера** сообщает доступные способы наблюдения и остановки. Общие потребители не выводят эти возможности из имени harness.

Используем существующие manifests, журнал, таблицы control/operations и registry. Нового сервиса, второй очереди событий или отдельной state machine для console не требуется.

Основные инварианты:

1. Одна подтверждённая операция запускает native работу не более одного раза.
2. Deadline принадлежит именованному объекту; RPC timeout не превращается автоматически в provider failure.
3. Heartbeat/status/replay/синтетическая подсказка не являются новым продуктивным событием.
4. После durable fence успех старого поколения не разрешает новые продуктивные действия.
5. cancelled/closed/non-resident не эквивалентны physical execution settled.
6. Capture разрешён только после завершения всех релевантных писателей и согласования их операций.
7. Отсутствующие данные означают unknown, а не false/empty/success.
8. Повторное присоединение не выдаёт новый бюджет и не отправляет повторный prompt.

### 1.1. Переиспользование и модульные границы — обязательная часть исправления

Не создавать универсальный orchestration framework. Расширять существующие модули; выносить небольшую общую функцию только при наличии нескольких реальных потребителей. Общая политика должна иметь одну реализацию, provider-specific протокол — оставаться в адаптере.

| Общая ответственность | Существующая точка расширения | Что переиспользуют потребители |
|---|---|---|
| Native identity и storage key | `dd-flow-cli/src/services/session-identity.ts` | Валидацию публичной native identity; storage ID не подставляется вместо native ID. |
| ACP transport, bindings, ожидание ответа | `src/harness-runtime/lib/dd-zcode.mjs:AcpBridge` (используется также Grok) | Разделённые transport timeout/quiet policy и корреляцию RPC; ZCode log parser не становится частью общего транспорта. При выделении bridge в нейтральный файл сохранить совместимые exports. |
| Operation admission, journal, replay | `src/harness-runtime/lib/daemon-operations.mjs` | Один writer и generation guard для всех daemon entrypoints; один reconciliation path, не отдельная реализация для cancel/resume/inspect. |
| Cooperative settlement | `src/harness-runtime/lib/session-settlement.mjs` | Bounded wait/cancel с нормализованным наблюдением; не превращает empty topology в доказательство physical exit. |
| Ownership и retirement | `src/harness-runtime/lib/managed-daemon.mjs`, `zcode-acp/src/backend/client.ts` | Существующие registry/launch identity/process helpers; backend owner выполняет native stop, общий control проверяет receipt. Не дублировать process killer в dd-eval. |
| Observation, clocks, errors | existing `model-observations.mjs`, `observation-clock.mjs`, `operation-errors.mjs`, recovery-budget modules | Общие правила evidence/progress/error и budget reservations; provider parser только нормализует данные. Quiet clock не подменяет operational budget. |
| Continuation и итоговая проекция | `dd-eval/lib/eval-resume-worker.mjs`, `runner.mjs` | Один continuation path для start/resume/fork; CLI/console читают одну report projection. |

Пути `src/...` в таблице относятся к dd-flow-cli. Совпадающие имена файлов в dd-eval не означают дубликат: например, его `daemon-operations.mjs` — reader, а runtime-модуль — writer/dispatcher. Согласовать формат receipts и проверить совместимость producer/consumer; не переносить управление daemon в reader. Для реально совпадающих чистых правил использовать существующий package/export либо текущий механизм доставки runtime, без относительного импорта через соседние репозитории и без нового пакета ради одной функции.

Общий код принимает нормализованные факты и capabilities, а не ветвится по `harness === "zcode"`. Адаптер отвечает за перевод native событий, probe/cancel/close и предел достоверности evidence. Capability должна описывать подтверждённую гарантию, а не просто наличие метода. Не объединять scoped child cancel, checkpoint settlement и whole-RUN retirement в один неразличимый `stop()`.

### 1.2. Идентификаторы: один подход, разные пространства имён

- Сохранить публичную `NativeSessionIdentity { harness_id, session_id }` и существующие storage keys. Backend incarnation не меняет публичную личность возобновляемой сессии: это часть **execution binding**, не native identity.
- Ввести в затронутых контрактах различимые native session, ACP session, native turn/query/request, RPC request, durable operation и control intent ID. В TS — именованные opaque/branded типы через валидирующие constructors; в JS runtime — те же проверки и явные поля/дискриминаторы. Type assertion не считается валидацией. Не мигрировать все строки репозитория без необходимости.
- Session reference содержит namespace (`native`/`acp`) и harness; execution binding отдельно связывает native reference, nullable ACP reference, daemon/backend incarnation и RUN generation. Для lookup/callback недостаточно одного raw ID. У ACP-only или non-ACP адаптера не выдумывать недостающий native/ACP ID.
- Native request ID и source-qualified observation cycle ID — разные типы. RPC request UUID и operation ID не подставляются ни в один из них. Parent-child связи используют qualified references; title/main/child purpose участвует в проверке принадлежности evidence.
- Mapping создаётся из подтверждённого create/load/attach результата и сохраняется до dispatch. После reconnect новая ACP binding не наследует callbacks старой incarnation. Callback после await проверяет binding, operation, generation и request cycle через общий guard, затем меняет состояние.
- Проверять входные JSON/CLI/adapter ответы на границе. Внутри не повторять разные ad hoc проверки. Wire остаётся обычным версионируемым JSON; compile-time brand не попадает в журнал. Старые receipts читаются только с однозначной доказанной binding, иначе observation unknown и запрет опасного действия.
- Аудировать `publicSessionIdentity` с `provider_session_id ?? session_id`, `modelSessions` и все raw-ID сравнения в timers/cancel/inspect/hook/registry/replay. Fallback допустим лишь там, где контракт действительно гарантирует native значение; равенство строк, префикс `sess_` или отсутствие поля такой гарантией не являются. Не объявлять каждый fallback багом без проверки его источника.
- Одинаковая строка ID в двух harness/namespace/incarnation должна оставаться разными execution targets. Process identity — отдельно PID + birth/group/ownership; session ID не даёт права послать сигнал процессу.

## 2. Пакет реализации: покрытие всех найденных недостатков

### A. Владение таймерами и корреляция запросов

Файлы: `dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs`, `dd-zcode-daemon.mjs`, `dd-grok.mjs`, `observation-clock.mjs`, CLI `bin/dd-zcode.mjs`; `zcode-acp` handlers/translators/backend listener.

- Убрать неоговорённый 30-минутный лимит всего ZCode ACP-turn. Сохранить независимые явно заданные ограничения RUN/операции, если они есть в конфигурации, под их собственными именами.
- Quiet threshold 600000 ms запускает запись диагностики. Native request budget 1800000 ms относится к одному подтверждённому логическому запросу. Retry/backoff того же запроса его не обновляют; новая независимая inference получает новый budget.
- В общем AcpBridge явно разделить транспортный timeout и политику quiet. Сначала восстановить конечную idle-политику Grok для существующих вызовов. Включать для Grok новый request-based режим только при подтверждённой native телеметрии; бесконечный null+diagnostic-only запрещён для продуктивного вызова без другой ограничивающей политики.
- Нормализовать поля на входе: finite positive safe durations, единицы ms внутри, отсутствие = документированный default. NaN/Infinity/0/отрицательные значения отклоняются. Прокинуть request budget из CLI/конфигурации в frozen daemon config и её identity check.
- Хранить `operation_id`, `daemon_id`, generation, adapter_session_id, provider_session_id, native turn/query/request identities отдельно. Не использовать случайный UUID daemon prompt как native request ID.
- Native request-start в доступном operational log не всегда содержит requestId. Нельзя выдумать его или соединить события только по sessionId. Для источника с доказанно последовательными запросами одного query допускается source-qualified cycle ID (source identity + start offset + query + purpose), отдельно от nullable native requestId. Terminal связывается только при единственном совместимом открытом цикле. При неоднозначности — observation unknown, без закрытия чужого запроса.
- Title/main/child/retry события не закрывают бюджеты друг друга. Если источник не предоставляет достаточной связи, это явная нехватка наблюдения, а не основание выдать новый budget.

**Результат на fork-010:** запрос 19m57 успешно закрывает собственный budget; запрос в 03:07:54 получает новый. В 03:11:59 общий возраст turn не является причиной остановки.

### B. Наблюдаемость и восстановление её состояния

Владелец диагностического чтения — existing harness daemon. zcode-acp экспортирует нормализованную доступную wire metadata через существующий extension/event bridge. Native JSONL используется для необходимых child request metadata с точной привязкой к текущему RUN, не как альтернативный оркестратор.

- До dispatch закрепить identities, существующие source cursors и effective policy. Следить за operational log инкрементально; completed model-IO использовать как ретроспективное подтверждение, а не таймер тишины.
- Публичная bounded summary: текущие requests/unfinished tools, observed_at, last genuine progress, capability/completeness, источники/watermarks, quiet/error, процессные receipts. Без промптов, заголовков авторизации и reasoning text.
- Сначала дописать evidence в existing journal, затем продвинуть cursor/summary. После сбоя повтор допустим, пропуск записи — нет. Дедупликация по event identity или file identity/offset. Partial line перечитать; oversized/malformed relevant record, rotation gap, truncation и недоступность файла отражать явно. Не перечитывать весь global log при каждом poll.
- Предпочитать текущий wire для root streaming; child -32004 значит unavailable subscription. Не вызывать ensure/resume ради наблюдения.
- Callback диагностики захватывает ключ операции, преобразует ACP/native ID через сохранённую binding, после await проверяет тот же operation/generation и текущее состояние. Завершившийся request не может быть восстановлен устаревшим callback.
- Запись quiet происходит до RPC-диагностики. Каждый probe <=5000 ms и укладывается в оставшийся общий budget. Ошибки callback обработаны; storage failure блокирует новую работу и запускает безопасную остановку через существующего владельца. Сбой diagnostic RPC лишь ухудшает полноту наблюдения.
- Валидировать identity и тип resident/topology ответа: malformed != resident:false. Unknown child list != empty list.
- Quiet помечается заново для нового периода тишины после реального прогресса; завершение/прогресс снимает старую quiet-проекцию. Повторные диагностики ограничены существующей политикой, не образуют бесконечный цикл.

**Дополнительные найденные места в `zcode-acp/src/handlers/session.ts:runEventTurn`:**

- `lastProgress` обновляется при служебном status=running и до отбрасывания чужих событий. Перенести обновление после проверки принадлежности и класса события; transport responsive хранить отдельно.
- Синтетический `agent_thought_chunk` «正在思考…» маркировать synthetic; не учитывать в продуктивности и provider streaming.
- Двойной idle probe с паузой 1500 ms не доказывает terminal. В managed режиме возвращать end_turn только по актуальному terminal event либо подтверждённой terminal-записи текущего turn. Без неё сохранять uncertainty и применять observation policy. Не подставлять старый последний ответ.
- Проверить polling/event-driven альтернативы и background-task listener на те же правила, сохранив разделение main/background turns.

### C. Бюджеты без продления при рестарте

Файлы: existing observation clock, daemon state/journal, `dd-eval/lib/recovery-observation-budget.mjs` и его callers.

- Observation-loss budget 120000 ms применяется, когда request state неизвестно; отсутствие child stream само по себе не включает его, если request надёжно известен как pending.
- Известный request при временной потере source остаётся pending/stale с прежним budget. Corrupt/missing admitted budget запрещает начинать отсчёт заново.
- Не использовать сброс `ObservationClock.elapsed=0` на scheduler gap как продление request lifetime. Разделить quiet clock и сохраняемый остаток operational budget.
- В работающем owner считать наблюдаемое время монотонно. Gap записывать отдельно и не выдавать весь начальный budget снова. Перед ограниченным RPC/poll сохранять reservation оставшегося budget. Crash оставляет reservation потраченной; подтверждённое завершение учитывает реальную длительность. Это консервативная погрешность максимум в размер одной reservation, а не бесплатный полный цикл при каждом падении.
- Parallel probes делят одно окно reservation, а не получают N полных budgets. Poll delay также учитывается. Для request наблюдения использовать короткие контрольные интервалы, а не резервировать все 30 минут сразу.
- Перед expiry обработать уже полученные matching terminal events. Если fence успел сохраниться раньше — поздний успех лишь evidence. Эти две ветки сериализуются владельцем state.
- Отдельно именовать request_policy_expired и observation_policy_exhausted. Первопричина, неизвестный native outcome и cleanup failures сохраняются раздельно.

### D. Один путь fatal whole-RUN stop

Файлы: `run-controller.ts`, `run-control.ts`, `run-control-worker.ts`, `runtime-scope-stop.ts`, managed daemon и backend client.

- Общий action=stop для принадлежащего RUN исполнения должен проходить owned execution retirement независимо от force. Force управляет срочностью/допустимой эскалацией по существующему публичному контракту, а не наличием фазы завершения ресурсов. Аудировать soft stop, force stop, boundary capture и отдельный child cancel, не объединяя их семантику.
- Fatal handler сохраняет один control intent и generation fence с исходной причиной. Повторный observer присоединяется к этому intent.
- Остановка имеет один ограниченный cooperative interval. Ошибки stop/close/read не препятствуют следующей фазе физического retirement при доказанном exclusive ownership.
- Подтвердить backend process group в её владельце `ZcodeBackend`: PID/birth/group/start incarnation регистрируются до productive admission. Native backend detached group и watchdog имеют собственные identities. Интегрировать с существующим process registry и retained launch descriptor, чтобы внешний reconciler мог действовать после смерти bridge.
- Выполнить TERM -> ожидание -> разрешённую KILL-эскалацию -> подтверждение выхода всей owned boundary. ESRCH означает отсутствие; EPERM/unknown ownership — ошибку. Leader exit не доказывает исчезновение группы. Если surviving descendant ownership не доказано, сохранить cleanup unconfirmed и не сигналить предположительные PID.
- Receipt physical execution settlement содержит binding/проверенное время/результаты. Только после него normal stop может вернуть clean для исполнения. Отдельно фиксируется retirement outer daemon, который после своего выхода уже не может писать собственный receipt: это делает внешний control observer.
- Registry callbacks/native hook delivery и event flush ограничить; очередь diagnostic output не должна удерживать работающие инструменты бесконечно. Сначала fence, bounded drain, physical retirement, затем ограниченная фиксация остаточных evidence/ошибок.
- Нельзя признать чистым mock/adapter лишь потому, что у него отсутствует close method. Production capability обязательно; тестовый adapter должен предъявлять свой явный settlement contract.
- Для shared/remote backend нельзя убивать приложение по аналогии с owned local backend. Нужна native scoped terminal guarantee. Если её нет — cleanup unconfirmed. Никакого молчаливого расширения child stop до whole RUN.

### E. Оригинальная операция и её поздний результат

Файлы: AcpBridge pending records, `daemon-operations.mjs`, `run-control.ts`, `native-daemon-history.ts`, `runtime-scope-resume.ts`.

- Разделить ожидание disposable клиента и durable operation. Истечение ожидания клиента не удаляет способность владельца обработать terminal response.
- Для policy interruption сохранять bounded unresolved-operation identity/tombstone до согласования. Операция не перезапускается; receipt observation-lost остаётся evidence прежнего состояния.
- После проверенного matching terminal или physical stop записать terminal operation outcome атомарно через единый existing operation journal writer. Для прерванного исполнения использовать совместимое `state:failed` с конкретным interruption code и settlement evidence, не выдуманный успешный результат модели.
- Late result после fence хранится как diagnostic outcome; он не превращает failed в completed и не открывает generation.
- Физическая остановка завершает вопрос возможности дальнейших эффектов, но не доказывает содержимое потерянного ответа. Эти факты сохраняются отдельно.
- Control consumers учитывают окончательный operation receipt, сохраняя строгую проверку identities. Просто удалить native_operation_unsettled guard нельзя.
- Cancel/finalize handlers идемпотентны. После подтверждённого failed tree_not_settled можно создать следующую bounded control attempt с предшественником и новой evidence revision. Unknown outcome требует observation того же ID. Применить одинаково к RUN control и runtime-scope-stop.

### F. Отчёты, запуск и межадаптерная согласованность

- `finalizeRunProjection`/runner status должны учитывать latest recovery_blocked event и version/revision общего отчёта. Execution outcome, observer state, cleanup state, capture state — отдельные факты. Сохранить совместимость schema/console: обновить их потребителей и fixtures, если добавляется enum; не внедрять неизвестное значение без изменения контракта.
- Запись terminal observer event ведёт к обновлению отчёта без обязательного native RPC. Финальная диагностика использует retained локальные receipts или резерв, выделенный заранее. Исчерпанный бюджет не открывает новый RPC budget.
- Capture после подтверждённой физической остановки и согласования операций; capture failure не отменяет execution settlement. Отчёт может быть failed + cleanup settled + capture failed с явной причиной.
- `runnerFork` возвращает подготовленный receipt из preparation lock, затем зовёт shared requestRunnerContinuation. Crash в зазоре означает ready без запуска; повтор --start безопасен. Устранить расхождение комментария с кодом, не объявляя доказанный deadlock.
- Повтор --start для terminal recovery_blocked сообщает этот terminal статус и путь cleanup; accepted/pending не обещают запущенного worker. Новый cleanup intent может продолжить только cleanup. Старый terminal event другого intent не блокирует новую подтверждённую cleanup-проекцию навсегда.
- Codex/Grok/OpenCode: согласовать фазу acknowledgement с физическим завершением; не интерпретировать ранний clean:true в durable replay как exit proof. Droid/AGY: проверить те же contract tests, не менять native transport без необходимости.
- Сохранять structured adapter errors flat/nested, включая retryable:false и falsy details. Выход subprocess и secondary logging errors не заменяют исходную причину.

## 3. Выполненная мысленная трассировка нормального выполнения

| Шаг | Вызов и изменение состояния | Проверка результата / сбой |
|---|---|---|
| 1 | runnerFork проверяет source/checkpoint, case/flow/MB/fixtures и exact engine artifact. | Ошибка останавливает подготовку до provider dispatch. |
| 2 | Под preparation lock копируется checkpoint, устанавливаются bindings, публикуется ready receipt. | При crash повтор проверяет тот же intent и уже созданные артефакты. Source не изменён. |
| 3 | Lock освобождён; requestRunnerContinuation фиксирует один continuation intent. | Crash до dispatch оставляет ready/requested; повтор использует тот же operation. |
| 4 | Observer получает lease, проверяет generation/manifest, запускает controller. | Второй observer наблюдает существующий запуск; native prompt не дублируется. |
| 5 | Daemon и backend регистрируют собственные process boundaries; identities и policy сохранены. | Неполная ownership/capability не допускает productive execution. |
| 6 | Наблюдение подключено; cursor/bindings сохранены; operation requested атомарно опубликован. | Потеря evidence до отправки означает no dispatch. |
| 7 | Проверка fence непосредственно перед native send; отправляется один ACP prompt. | Control во время подготовки запрещает отправку; уже отправленная работа входит в stop scope. |
| 8 | stage start и Work start идут через существующий trusted CLI/hook. Native child зарегистрирован как child. | Неудачная CLI-команда сохраняет собственную ошибку; child не становится вторым root. |
| 9 | Native request-start открывает request budget. Root status probes и title completion не меняют его. | Неоднозначный request-start переводит observation в unknown, не создаёт ложную корреляцию. |
| 10 | Quiet фиксирует evidence и один bounded snapshot. Child subscription -32004 записывается как unavailable. | Известный pending request продолжает свой budget. |
| 11 | Ответ 19m57 связывается с исходным request и закрывает его. Следующий tool и request создают новые факты. | Поздний duplicate не обновляет clocks и не закрывает соседний request. |
| 12 | Native terminal текущего turn принимается; response journal записан до acknowledgement. | Двойного idle недостаточно. Потеря клиента после записи восстанавливается operation.inspect. |
| 13 | dd-flow проверяет Work/stage по обычному контракту и захватывает checkpoint после scoped writer settlement. | Нет обхода product checks или ручных доказательств. Normal checkpoint не обязан убивать здоровый переиспользуемый daemon, но требует доказанного завершения relevant turn/children. |
| 14 | Controller идёт на следующие стадии; dd-eval обновляет report из подтверждённых фактов. | Если завершён весь запуск, финальный resource retirement проходит общий lifecycle, а не inference по active_tree. |

**Проверка fork-010:** после шага 11 возраст всего ACP-turn достигает 30 минут; policy нового request не истекла. Никакой fatal-stop по старому общему таймеру не создаётся. Это устраняет именно воспроизведённое ложное прерывание.

**Дополнительная выполненная трассировка переиспользуемого identity path:** create/load возвращает native N и ACP A → адаптер валидирует разные namespaces → daemon сохраняет binding N↔A в incarnation D и generation G → общий dispatch writer записывает operation O → событие ACP A переводится через эту binding, а не сравнивается с N → request-start открывает cycle C → quiet callback сохраняет ключ D/G/O/C и делает bounded probe → за время await cycle C завершается либо backend переподключается → общий guard отвергает устаревшую запись, active_request не воскресает. Если mapping отсутствует, событие остаётся uncorrelated evidence и не меняет чужой budget. При stop общий control выбирает native N через подтверждённую binding и process boundary через ownership registry; ACP A не используется как native target или process identity. После receipt тот же operation reader восстанавливает O, а report projection показывает подтверждённое состояние без нового dispatch. Для Grok меняется native translation и quiet policy, но правила correlation/fence/replay остаются теми же.

## 4. Выполненная трассировка настоящего deadline/fatal-stop

1. Request/observation policy действительно истекла. Владелец сначала обрабатывает уже доставленный terminal. Если он принят до fence — обычное завершение; иначе сохраняются исходная причина и interruption intent.
2. RUN control атомарно фиксирует fence. Hook admission, queued dispatch и новые prompts того же поколения закрыты. Уже выполняющиеся native инструменты требуют физического retirement.
3. Все relevent daemon/backend identities проверены по registry и retained binding. Control не выводит scope из имени процесса.
4. Выполняется bounded cooperative cancel. Возврат closed:true или child removal не закрывает physical settlement.
5. Native child cancellation будит root. Его поздние request/tool события записываются как противоречие отмене. Это не снимает fence и не разрешает capture.
6. Истёк cooperative interval или пришёл ответ. Даже если read/close падают, owner переходит к stop своей native boundary. Неизвестное ownership останавливает эту ветку с needs_attention.
7. Backend owner отправляет TERM, затем по политике KILL, проверяет owned group/descendants. Watchdog не снимается до подтверждения выхода либо явной передачи ответственности retained reconciler.
8. Подтверждён native exit; owner публикует physical receipt. Старые unresolved operations становятся terminal interrupted с ссылкой на receipt. Потерянный model response остаётся неизвестным.
9. Daemon прекращает исполнение; внешний control подтверждает его physical exit и обновляет registry. Если daemon умер раньше публикации, восстанавливает evidence через identities; отсутствие данных не превращается в clean.
10. После полного согласования writers/operations захватывается recovery snapshot. Crash между exit и capture означает pending capture, а не повторный prompt.
11. Observer публикует execution failed, cleanup settled, capture ready/failed и исходную причину. При недоказанном exit публикует recovery_blocked, cleanup unconfirmed и последний receipt; бесконечного awaiting_provider нет.

## 5. Выполненная трассировка рестартов и гонок

| Точка сбоя | Что остаётся | Действие восстановления |
|---|---|---|
| Клиент ушёл после native send | requested operation, живой daemon | Читать original operation; не send повторно. |
| Observer погиб | intent/lease/budget reservations | Новый owner проверяет PID+birth, присоединяется; не сбрасывает бюджеты. |
| Daemon погиб, native backend жив | ownership backend + admission fence | RUN control останавливает доказанную boundary; без ownership оставляет needs_attention. |
| Evidence записана, cursor нет | journal event + старый cursor | Replay с dedup; timestamp события не заменяется временем replay. |
| JSONL оборван/ротирован | offset/file identity | Перечитать partial; gap пометить stale/unknown, сохранить известные pending budgets. |
| Request завершился во время diagnostic RPC | terminal receipt, старая callback key | Callback перепроверяет generation/operation и не восстанавливает active_request. |
| Request ответил после fence | поздний terminal event | Записать diagnostic outcome; оставить interruption и stop. |
| TERM убил leader, descendant остался | ранее закреплённая boundary evidence | Проверить ownership потомков; завершить доказанные, иначе cleanup unconfirmed. |
| Exit случился до receipt | retained identities, мёртвая boundary | Подтвердить физические факты и завершить interrupted operations; не выдумывать ответ. |
| Stop получил terminal tree_not_settled | failed attempt | При новой evidence начать следующий control attempt; original productive operation не повторять. |
| Stop reply потерялся | pending/terminal durable stop operation | Читать тот же ID; отсутствие клиентского ответа не основание новой отправки. |
| Budget закончился | terminal observer event + retained evidence | Построить report локально. Никакого fresh native wait для финальной диагностики. |
| Storage failure при отмене | возможно частичный intent/evidence | Не допускать новую работу; остановить доказанно owned исполнение, сообщить отдельную storage/cleanup error. Без durable proof не seal capture. |

## 6. Проверки, закрывающие существенные риски

### Организация поведенческих тестов

Одна параметризованная contract suite для общих lifecycle гарантий, с тонкими драйверами существующих адаптеров. Общие проверки вызывают production dispatch/inspect/cancel/stop, а не копию алгоритма в тесте. Provider-specific parsing и недоступные capabilities проверяются отдельно: unsupported должно давать явный результат, не молчаливый пропуск обязательной гарантии. Для всех шести harness проверить применимые пути; не требовать local process kill от remote/shared backend.

Переиспользовать существующие fake clock, temporary home, event feed и process fixtures. Внешнюю сеть/provider можно заменить детерминированным boundary fake, но не подменять тестируемый journal, fence, reconciliation или report writer. Отдельный subprocess integration test проверяет реальные detached groups; clock-тесты не ждут 30 минут. Assertions — наблюдаемый outcome, число dispatch, receipts, сохранённая причина и отсутствие чужих эффектов, не приватная структура Map или написание кода.

Обязательные дополнительные случаи identity: одинаковый raw ID у разных harness и namespace; новая incarnation с прежним ACP ID; native resume с новой ACP binding; несовпадающие ACP/native IDs; отсутствующий native request ID; неоднозначный legacy receipt; foreign child/terminal; устаревший callback после reconnect. Проверить, что чужой budget не закрыт, cancel не ушёл чужой сессии, новая работа не допущена, unknown явно виден.

Producer/consumer contract test читает реальный runtime receipt через dd-eval reader и строит report. Он ловит drift формата между репозиториями без дублирования runtime writer. Typecheck дополнительно запрещает передачу ACP ID вместо native ID в затронутых TS API, но не заменяет runtime/поведенческие проверки.

### Обязательные сценарии

1. Fake-clock replay реального fork-010: 19m57 request, subsequent request, >30m turn; никакой отмены по возрасту turn. Отдельно настоящий request expiry при постоянных stream updates.
2. Матрица AcpBridge callers: ZCode diagnostic quiet и Grok конечная idle policy; null/NaN/0 отклоняются там, где оставляют работу без bound.
3. Unequal ACP/native IDs, title/main/child concurrency, retry, duplicate/out-of-order, synthetic hint/status=running/foreign events не считаются прогрессом. Два idle не означают end_turn.
4. Crash/replay source cursor, partial/rotated JSONL, budget reservation, stale callback и rejected diagnostic persistence.
5. Настоящая цепочка controller fatal -> stop(force:false) -> cancellation failure -> backend exit -> original operation reconciliation -> capture -> final report. Тест с отдельной native process group, surviving descendant и соседним процессом, который обязан остаться жив.
6. Потерянный stop reply, failed tree_not_settled с новой evidence, повтор scope cleanup, adapter early clean и shutdown failure. Проверить все шесть harness contract paths.
7. Fork foreground exit/repeated start/observer crash дают один native launch; failed-fork тест ждёт финальный cleanup/report, а не заканчивается на accepted.
8. Report/console schema: recovery_blocked виден после observer exit без live RPC; original cause сохранена, cleanup и capture не смешиваются.

Убрать source-regex assertions, которые проверяют написание таймера вместо его поведения. Не добавлять тесты на косметические изменения. Один прогон affected suites + type/build; расширять только при выявленном shared impact.

## 7. Последовательность доставки и критерии готовности

Перед изменением каждого общего helper перечислить его production callers, согласовать контракт §1.1–1.2 и включить их в affected suites. В plan-to-diff checklist для каждого блока A–F указывать: общий модуль-владелец, подключённые callers/adapters, удалённые локальные дубли правил, behavior test и остающиеся capability limitations. Само наличие нового helper без переключения старых путей не закрывает пункт.

1. Сначала восстановить shared timer contract/Grok и зафиксировать metadata/capabilities и terminal receipt contract тестами.
2. Реализовать native request observation/budget и actual backend retirement; затем подключить их в RUN control и durable operation reconciliation.
3. Исправить report/budget persistence/fork ordering и проверить остальные adapters на том же контракте.
4. До реального E2E провести один bounded live probe на isolated owned ZCode backend: root+child, stop, выход всех принадлежащих процессов, отсутствие продолжения инструментов после settlement. Отдельно квалифицировать request correlation по доступному источнику; если event identity неоднозначна, readiness блокируется с конкретной причиной.
5. После всех изменений один раз собрать/установить final immutable engine и pin совместимого zcode-acp artifact/contract. Предыдущие qualified bridge hashes не переносить автоматически на изменённый backend.
6. Подготовить новый fork из проверенного CODE-entry checkpoint, сверить artifacts/pins/fixtures и запустить только после готовности полного пакета. Существующий fork-010 остаётся evidence.

Готовность означает: все пункты A–F реализованы, тесты проверяют реальную последовательность, native stop probe прошёл, plan-to-diff checklist заполнен ссылками на код/тесты/receipts. Успешный E2E отдельно подтверждает оставшиеся стадии; сам по себе он не доказывает редкие stop/restart ветки.

## 8. Дополнение по fork-012: граница долгой подготовки CODE

Реальный fork-011 показал ограничение не модели и не lifecycle identity: нативный ZCode ограничил один Bash tool call примерно 126 секундами, а `stage start code` синхронно выполнял детерминированный `pnpm bootstrap`. После tool-timeout повтор того же invocation корректно был запрещён как unknown effect, но это оставляло RUN в recovery_required.

Исправление: controller до prompt выполняет `prepareVnextCodeWorkspace`; только он запускает долгий bootstrap и сохраняет `workspace-readiness@2` с `prepared_by = controller_id`. Агентский `stage start` принимает такой receipt лишь при точном совпадении controller id, workspace root, bootstrap command и policy reference. Любой unowned, старый, чужой или failed receipt игнорируется и проходит обычную readiness-проверку. Поэтому hook-bound agent command остаётся единственной authority для stage attach, но больше не зависит от жёсткого лимита native tool runtime.

Проверка: unit-contract запрещает reuse при чужом owner или failed receipt; controller/readiness path покрыт typecheck и affected lifecycle/controller suites. Fork-012 стартует из принятого plan-review checkpoint непосредственно с CODE и проверяет этот путь на живом ZCode.
