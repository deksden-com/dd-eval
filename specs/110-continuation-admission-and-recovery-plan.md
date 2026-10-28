# 110 — Продолжение Work, native admission и независимая финализация EVAL

Статус: реализован; scoped-приёмка PASS. Дата: 2026-10-28.
Результат и интеграция: [110 — implementation completion](110-implementation-completion.md).
Проверен по ponytail full; решения и scoped-приёмка зафиксированы ниже.

## 1. Цель, границы и исходная версия

Устранить технические остановки CP260 Luna/ZCode/OpenCode и аналогичные пути
во всех поддерживаемых упряжках. Не исправлять продукт dd-tasks и не превращать
результат технического ремонта в продуктовый PASS. Сохранить ошибки старых
попыток; не resume/restart, не менять их homes, snapshots, definition/pins.
Не запускать новые EVAL, native/model-пробы, полный gate или GitHub CI в рамках
реализации этого плана. Последующая модельная E2E-приёмка — отдельное действие.

Исследована фактически опубликованная версия engine 0.9.0-beta.155,
commit `2bfe677b16b348906e3015dc8db4ca5253824886`; dd-eval
`6ed2ed50f79a555ad690c0ae789c8e799d4b7e6c`.
До реализации сверить diff этих точек с актуальным main каждого репозитория:
не переносить уже исправленные участки и не затереть параллельные изменения.

Артефакты (общая база `/Users/deksden/.dd-eval/qualification`):

| Запуск | Home | Подтверждённое событие |
| --- | --- | --- |
| Luna `EVAL-20261027231912-77822ea8` | `cp260-luna-full` | CODE: `work_contract_incomplete`, blockers пусты, две описательные deviations |
| ZCode `EVAL-20261027231914-fa5d7409` | `cp260-zcode-full` | CODE: приняты оба Work; successor observed, CLI `invocation_ambiguous` |
| OpenCode `EVAL-20261027231915-25bda5de` | `cp260-opencode-full` | PLAN-REVIEW: оба child callback retained, hook.verify отсутствует, work start timeout |
| Luna `EVAL-20261027112819-88e58379` | `cp258-luna-full-final` | Два `work_checks_failed`, выданы successors; child completed, Work running |

Все CP260 baseline PASS. Recovery-манифесты 41–59 КБ, engine control-workers
completed; на момент расследования capture ready и physical cleanup settled.
Это не основание менять исторический failure на success.

## 2. Инварианты (общие для всех этапов и упряжек)

1. Native delivery, lifecycle effect, принятый Work, оценка и cleanup — разные
   факты. Не выводить один из отсутствия другого.
2. Описательная заметка не доказывает невыполнение Work. Реальное незакрытое
   обязательство не объявлять выполненным ради продолжения.
3. Exact replay читает прежнюю попытку. Новая подтверждённая доставка может
   исполнять successor. Не выбирать newest row и не повторять unknown effect.
4. Проверка защищает конкретное действие, не весь RUN по умолчанию. Ownership,
   generation, assignment/CAS, cwd и integrity проверяются там, где предотвращают
   чужой эффект, повтор записи или недостоверный вывод; не на каждом чтении.
5. Safe pause/stop проверяет физического владельца и актуальность поколения,
   но не требует отсутствия той ошибки продуктивного пути, ради которой вызван.
6. Новая native activity (reasoning, сообщения, tool use/result, реальная работа
   наблюдаемой операции) продлевает окно тишины без требования менять файлы.
   Repair progress — отдельное условие против цикла одного отказа. Heartbeat,
   повтор poll или replay того же события не являются новым сигналом агента.
   Отмена пользователя остаётся отменой.
7. Неполная атрибуция не равна доказанной подмене модели. Не выдумывать model
   intent и не включать unknown sample в достоверное сравнение моделей.
8. Sealed capture и технический отчёт не ждут некритичной уборки процессов;
   cleanup продолжает существующий отдельный owner. Не добавлять второй scheduler.
9. Отсутствие полного capture ограничивает доказуемость assessment/recovery,
   но не запрещает терминальный технический отчёт с известной причиной отказа
   и перечнем недоступных доказательств. Не объявлять такой отчёт полным PASS.

### Назначение и граница оставшихся проверок

Это спецификация существующих ветвей, не новый policy engine/registry.
При реализации каждый отказ должен ссылаться на защищаемое ниже действие.
Проверку без такого действия удалить; одинаковую проверку повторять только
на новой trust/commit boundary или при возможной конкурентной смене состояния.

| Проверка | Какое действие защищает | Что запрещается при отказе / что остаётся доступно |
| --- | --- | --- |
| Current owner, lease, generation | Новая запись, productive dispatch, pause/stop, destructive cleanup | Запрещена мутация от старого/чужого владельца. Разрешены read-only observation/вывод диагностики; запись общего отчёта передаётся актуальному owner. |
| Native identity + assignment + CAS | Привязка результата к Work и однократный lifecycle effect | Запрещена неподтверждённая/повторная мутация; exact replay читает старый outcome. Не отменять уже принятые другие Work. |
| Physical cwd/route | Команда, зависящая от назначенного workspace | Исправить маршрут до запуска этой команды. Не требовать cwd для чтения отчёта или settlement, адресованного явным RUN. |
| Минимальная schema/target validation | Разбор входа и применение конкретного результата | Вернуть исправимый отказ данного input. Никаких gate по стилю текста, непустым заметкам, размеру без технической необходимости. |
| Required checks и незакрытые обязанности | Принятие соответствующего Work/перехода и заявление PASS | Repair/blocker данного Work; не принимать ложный успех. Независимые разрешённые ветви и отчёт доступны. |
| Lifecycle executing/unknown effect | Повтор той же потенциально изменяющей операции | Наблюдать original, не replay mutation. Другие действия разрешены, если не зависят от её результата и не конфликтуют с её записью. |
| Native child active/closure | Конфликтующая запись в тот же workspace или уничтожение его ресурсов | После принятия Work отсутствие close ACK при settled execution — только cleanup note. Привязанный к этому write scope unsettled child ограждается перед зависимой операцией, даже если точная текущая запись неизвестна. Глобальный failure по одному ACK запрещён. |
| Sealed snapshot + scope/hash | Recovery/fork и полная оценка, опирающаяся на snapshot | Не восстановить чужое/изменяемое состояние и не выдать полный verdict без evidence. Технический terminal report по retained фактам доступен. |
| Целостность Interaction Judge content | Использование именно этого verdict как семантического evidence | Исключить неподтверждённый verdict/ограничить assessment. Не называть это повреждением snapshot и не ждать stop ACK для принятого content. |
| Profile routing перед dispatch | Запуск запрошенной конфигурации | Исправить routing перед этим запуском. Post-run unknown/mismatch не мешает диагностике уже исполненного flow. |
| Model attribution для comparison | Утверждение о сопоставимости моделей | Unknown/mismatch исключён из валидного сравнения; сырые тайминги, статус и technical Judge доступны с ограничением. |
| Process identity/owned tree | Kill/reclaim lock/удаление ресурса | Не удалять неизвестный/чужой ресурс; bounded re-observation. Не отменять результаты и не блокировать unrelated EVAL с другим подтверждённо изолированным scope. |
| Новые native activity signals | Решение «агент/операция замолчали» | При реальных сигналах окно сдвигается; при тишине — bounded observation failure этой операции, не утверждение о провале модели/Work. |
| Одна automatic repair-follow-up episode на Work | Новый автоматический запрос завершившемуся child | Не выдавать второй automatic follow-up этому Work; сохранить blocker/отчёт. Новые Turn/receipt/controller IDs не обнуляют лимит. Обычные исправления внутри активного Turn не ограничиваются этим счётчиком. |

Удалить именно как барьеры: непустой deviations; продуктивная ошибка перед safe
pause; historical recovery_blocked при current valid capture; unknown attribution
перед Judge; cleanup pending перед отчётом; issued-only как определение authority;
второй fixed recovery timer; отсутствие close ACK после принятого Work.

## 3. Реестр причин, включая расширение по кодовой базе

Пути engine ниже относительны dd-flow-cli, пути EVAL — dd-eval.

| ID | Корень / область | Подтверждение и необходимое изменение |
| --- | --- | --- |
| D1 | OpenCode generator → plugin → shell | `src/harness-runtime/lib/dd-opencode-daemon.mjs:72` не сериализует runtime_owner; plugin:69 вызывает managedFlowEnv, который очищает owner; CLI:622 не включает retained reconciliation. Исправить передачу launch-bound locator. |
| D2 | Общий lifecycle selector | `src/services/lifecycle-invocations.ts:1667,1698`: успешная settled history конкурирует с observed successor при CLI lookup. Исправить общую корреляцию, сохранив exact replay. |
| D3 | Finish state → fanout | `lifecycle-invocations.ts:712` видит только issued; `controller-fanout.ts:209` превращает observed/executing в authority missing. Возвращать реальное pending/terminal состояние. |
| D4 | Control-plane self-poisoning | `src/services/run-controller.ts:473,580`: assertOwner повторно бросает retained lifecycle error до pause intent. Использовать существующую physical ownership проверку и generation fence. Все pauseDependency callers, не только OpenCode. |
| D5 | CODE Work result | `src/services/work-registry.ts:1670` запрещает любую deviation. Убрать бинарный gate по описательному массиву; незавершённость обрабатывать на уровне Work/repair. |
| D6 | Completed child / unfinished Work | `src/services/vnext-fanout.ts:344` даёт общий execution_ended_without_work_result даже при известном repair successor. Продолжать ту же сессию bounded follow-up при доказанном no-effect repair. |
| D7 | Recovery deadline и abort | `lib/recovery-observation-budget.mjs:5–9,44`: fixed AbortSignal.timeout (до30с) ограничивает sliding commandJson/commandText. `lib/process-json.mjs:153,261` стирает причину в ABORT_ERR. Устранить второй непродлеваемый таймер, сохранить происхождение отмены. |
| D8 | Recovery state/projection | `lib/eval-resume-worker.mjs:406–449,504`: cleanup pending удерживает failure loop; report_projection_pending становится cleanup budget error. Отделить ingestion/finalization от resource cleanup. |
| D9 | Старый worker важнее текущего capture | `lib/runner.mjs:2664`: recovery_blocked проверяется до валидного current sealed snapshot. Сначала проверять текущую bound capture, затем отсутствие/блокер. |
| D10 | Потеря причины capture | `lib/runner.mjs:2353–55,2522`: capture error сворачивается в ready/pending/blocked, наружу unknown без причины; worker публикует общий capture_unavailable. Сохранить typed reason и operation reference. |
| D11 | Unknown attribution → invalid | `lib/runner.mjs:2440,2502,2937–38`: !=matched запрещает Judge и объявляет invalid_infrastructure_flow. Отличить unknown от mismatched во всех проекциях. |
| D12 | Retirement/process inspection | `lib/process-snapshot.mjs:31` fixed5s ps; runner-lock:41 кеширует rejected selfIdentity навсегда; eval-retirement:300 называет unknown owner «still owned». Восстановимые read-only наблюдения, правдивый статус, no unsafe unlock. |
| D13 | Скрытая причина retained verification | `src/services/retained-native-hook.ts:131` catch-all скрывает все hook.verify отказы как legacy/retired. Сохранить диагностическую причину без выдачи authority и без спама каждые250мс. Не доказанная причина CP260 OpenCode, но мешает расследованию аналогичного отказа. |
| D14 | Interaction evidence ошибочно названа capture | `lib/runner.mjs:2406–10,2430`: catch теряет причину проверки Interaction Judge, затем объединяет её с snapshot blocking. Сохранить content/cleanup/capture причины раздельно. |

Уточнение доказанности: конкретная ошибка последнего capture-read Luna не
сохранена. D7 — подтверждённый дефект кода и кандидат на этот триггер, не
доказанная историческая причина именно того RPC. Не подменять это утверждением
«снимок повреждён». Report projection pending у ZCode/OpenCode сохранён явно.

## 4. Пакеты реализации и конкретные решения

### A. Native Work start: восстановить связку, а не утяжелять hook (D1,D13)

- В writePlugin передавать `runtime_owner` из проверенного config; использовать
  existing managedFlowEnv. Не копировать credentials/всё окружение в plugin.
- Fast ACK оставить лёгким: retain exact callback, вернуть управление shell;
  ancestry/cwd proof и lifecycle CAS остаются в исполняющем CLI.
- Просмотреть все producers managedFlowEnv: Codex bridge, AGY sanitizedEnv,
  Grok isolatedEnv, ZCode bridgeEnv, Droid environment, OpenCode server/plugin.
  Сейчас разрыв подтверждён именно у OpenCode plugin, не менять siblings без причины.
- Verify failures: оставить last meaningful structured diagnostic и ссылку на
  request/operation в имеющемся канале наблюдения. Missing/retired/no fact =
  pending, conflicting owner/generation/cwd = явный refusal, не grant.
- Не хранить в diagnostic binding secrets/полный config и не считать diagnostic
  progress. Success/replay/late callback не создаёт второй Work start.
- Полный native-tree proof не собирать повторно ради каждого обычного shell
  вызова. Для Work admission использовать достаточную привязку исполнителя;
  дерево/physical absence проверять перед конфликтующей записью или cleanup.

Приёмка: использовать созданный настоящим writePlugin файл и реальный shell
overlay, затем retained callback → verify → observed → executing → один start.
Negative: owner отсутствует/чужой, generation устарела, callback другой child,
cwd другой, повтор callback. Unmanaged/noFlow не получает managed authority.

### B. Единственная lifecycle authority и её состояние (D2,D3)

- Общий selector использует explicit retained invocation ID / exact trusted
  event или native identity; публичная команда остаётся без внутреннего UUID.
- Для нового native call при наличии доказанно текущей связанной попытки settled
  predecessor не конкурирует с ней. Нельзя просто предпочесть любую active row:
  две непрояснённые доставки/назначения остаются ambiguous.
- Exact old native identity возвращает immutable старый outcome, не successor.
  Без достаточной корреляции — read-only reconciliation, не newest/latest grant.
- currentStageFinishCommand + единственный consumer controller-fanout исправить
  вместе: issued → доступная команда; observed/executing → pending original;
  settled → retained outcome/переход; отсутствует → действительно missing.
  Использовать уже существующие lifecycle rows, не создавать новую таблицу.
- Проверить все операции stage/work/delivery, ветви prepare-retry,
  verification_required, resume и return-from-repair, все вызовы selector в CLI,
  hooks и retained hook. Разные stage/run/generation не объединять.

Приёмка: точная цепочка CP260 ZCode (accepted Work, verification_required,
атомарный successor, новый observed callback, публичный finish); replay старого
callback; параллельные ambiguous current candidates; executing unknown не
исполняется повторно; после рестарта тот же original operation.

### C. Safe control не зависит от продуктивной ошибки (D4)

- В pauseDependency использовать имеющийся assertPhysicalOwner; сохранить
  ownership token/lease, controller identity и проверку актуального поколения.
  Повторить fence в SQL-транзакции intent + technical_dependency_paused.
- Не удалять checkOutcomes/assertLifecycleOutcomes для продуктивных dispatch.
- Проверить все pauseDependency callers и stopAfterFailure: primary error
  сохраняется; pause publication error — отдельная technical cause, не замена.
- Идемпотентность существующего requestId/control intent, concurrent stop,
  уже terminal RUN и superseded controller обрабатывать без нового dispatch.

Приёмка: retained invocation timeout → безопасный pause intent (не рекурсивный
фатальный timeout); при смене owner/generation публикация запрещена; повтор
публикации не создаёт второй control; pause/stop не запускает модель.

### D. Work result и завершённый native Turn (D5,D6)

- Сохранить текущую schema результата: deviations — описательные сведения,
  не основание reject. Не вводить новую decision модель, типологию отклонений
  или DB migration только для устранения этого gate.
- Blockers не объявлять выполнением: агенту вернуть Work-level actionable
  отказ/инструкцию work fail либо correction, не принимать обязательства
  молча. Проверки назначенного Work, code packet и evidence остаются.
- No-effect content rejection не должен немедленно останавливать RUN.
  Использовать существующий prepare successor и защиту repeated_without_progress.
  Изменить нужные ожидания isRetryableLifecycleRejection, не blanket allow-all.
- Для child completed + Work running проверить retained current attempt:
  recoverable no-effect check/result refusal + successor → bounded same-session
  follow-up с исходным diagnostic, result path и текущей командой.
- Переиспользовать delegation follow-up capability/continuation_ref адаптера.
  Поддержка проверяется для каждой упряжки; отсутствие безопасного native resume
  → явный Work-level blocker, не fresh child/replay/ложный completed.
- Текущий renderNativeChildFollowupInstruction содержит provider-failure текст:
  параметризовать существующий renderer purpose/message для `work_repair`,
  сохранив overload default и отдельную capacity policy. Не записывать check
  refusal как serverOverloaded и не использовать provider-only capability
  для другой цели. Нативный ACK/delivery наблюдается адаптером, текст родителя
  «отправил» не является подтверждением нового child Turn.
  Существующее число/backoff provider retries не менять этим локальным repair
  лимитом: перегрузка и незакрытый результат Work — разные эпизоды.
- Ключ точной доставки follow-up включает terminal native Turn + refusal/successor;
  записать намерение existing durable controller operation до dispatch, при replay
  читать outcome. Этот delivery key не увеличивает лимит одной episode на Work.
- Конкретный предел: **одна automatic completed-child repair-follow-up episode
  на Work в RUN**. В коде state.turns — только счётчик, общего repair/turn budget
  нет; не ссылаться на него как на существующую гарантию. Дополнительных
  публичных настроек и глобального таймера RUN не вводить.
- Episode резервируется до dispatch в existing controller operation/event с
  project/run/work identity; состояние saved state дополняется необязательным
  полем, без DB migration. При новом controller/generation читать прежние
  события данного RUN/Work; рестарт, новые Turn/receipt/successor IDs и повторный
  отказ лимит не обнуляют. Replay доставленной episode только читает outcome;
  подготовленная, но не отправленная episode может выполнить тот же dispatch
  один раз; uncertain admission только наблюдается, а не resend.
- Исправления и intentional check retries внутри активного native Turn остаются
  обычной работой агента. После follow-up новый terminal child с Work running
  даёт bounded Work blocker/affected pause, а не вторую automatic episode.
  Разбор changed candidate/evidence может объяснить диагноз, но не требуется
  новый hash-based progress gate и не даёт новый follow-up лимит.
  Reasoning/сообщения/tool activity независимо продлевают liveness window.
- Перед dispatch повторить чтение Work/assignment/native terminal identity:
  уже accepted/explicit failed Work не продолжать; pending check сначала
  наблюдать; несколько Work associations/смена parent или terminal Turn —
  blocker/reconciliation без нового запроса. Рестарт читает durable intent,
  не создаёт второй follow-up.
- Если effect executing/unknown или child ещё активен — только original
  observation этой операции, не «продолжай». Если Work принят — не возобновлять
  его из-за cleanup и не ждать исчезновения child для принятия результата.
  Ограждать конкретную следующую запись также при возможном writer: child
  привязан к этому workspace/write scope, а execution ещё не settled. Не нужно
  доказывать фактическую запись в эту миллисекунду. Existing fence/settlement
  относится к зависимому действию, не ко всему flow. Когда execution завершён
  и отсутствует только close ACK, это исключительно resource cleanup.
- После единственной episode повторное terminal-окончание с Work running,
  независимо от изменения candidate, фиксирует Work-level
  execution-contract blocker с исходным diagnostic; existing authorized
  failure/repair path определяет следующий переход. Не подделывать native failed
  proof для фактически completed Turn и не писать принятый Work result от имени
  контроллера. Если продолжение/авторизованный failure недоступны — явная
  техническая пауза, без productive replay и без успеха по тексту модели.

Приёмка: обе CP260 описательные deviations с blockers=[] не отвергаются по
наличию текста; настоящий blocker не принимается; wrong schema/чужой result
не принимаются. CP258 два check refusal + известный successor → same child
follow-up; без прогресса bounded failure, accepted Work не повторяется.
Продуктовые assertions не менять и failing checks не переводить в PASS.

Поддержка same-child repair (по существующему коду; не обещание live qualification):

| Упряжка | Native путь / поведение |
| --- | --- |
| Codex | collaboration.followup_task с тем же child target; current Work + repair context |
| OpenCode | subagent с тем же sessionID, без изменения model/reasoning |
| Droid | Task resume того же child, без overrides |
| Grok | send_subagent_message delivery=queue с тем же subagent; дождаться admission |
| ZCode | Только typed bound continuation_ref, действительно разрешающий эту цель. Текущий managed-provider-recovery@1 не расширять молча; без repair capability — affected Work blocker/pause. |
| AGY | В текущем renderer документированного same-child пути нет: affected Work blocker/pause, не выдуманный resume и не новый child. |

План110 не расширяет bridge capability и не обещает automatic repair там, где
native API этого не позволяет. Такие ограничения видны в technical outcome;
принятые Work и независимые разрешённые ветви не аннулируются.

### E. Наблюдение, capture, finalization, cleanup (D7–D10,D14)

- Убрать независимый fixed30s AbortSignal из recoveryRpcSignal. Командой владеет
  один существующий sliding observation clock, а общий retained recovery budget
  учитывает новую подтверждённую активность исходной операции, включая reasoning,
  сообщения, tool use/result и source-bound operation progress. Протащить эти
  сигналы через adapter → CLI observer → recovery owner существующим каналом;
  не требовать нового check receipt или изменения файла, пока модель работает.
  Для liveness достаточно source-bound cursor/sequence и observed_at; специально
  сохранять полный reasoning/text или создавать новый журнал для этого не нужно.
  Poll/heartbeat/дубликат event не продлевают. Нельзя отменять живой RPC раньше
  его собственного окна. Owner cancel и действительно spent budget сохраняются.
- Убрать принудительное remaining=0 после второго observer restart/scheduler gap
  в recoveryObservationBudget (текущие строки24,31). Восстанавливать retained
  remaining и cursor, не выдавать полное новое окно только за рестарт. До решения
  об expiry прочитать текущие retained outcome/activity оригинальной операции:
  новый verified signal учитывается sliding clock; новый poll — нет. Gap сам
  по себе означает observation uncertainty, не failure провайдера/Work.
  Без новых signals потраченный budget не возобновляется; при spent budget
  допустимо финальное read-only наблюдение, не новый продуктивный dispatch.
- Различать observation deadline и explicit caller cancellation по typed reason
  signal; исправить оба wrapper commandJson/commandText. Не добавлять любой
  ABORT_ERR в глобальный retryable whitelist и не заменять таймер на большой.
- Ready snapshot определяется current control + owner/generation + sealed
  writer barrier + exact scope + existing hash/reread checks. Исторический
  blocked worker не перевешивает этот факт. Без valid capture нельзя делать
  recovery/fork или полную snapshot-based assessment, но технический отчёт
  финализируется по retained фактам. Не читать mutable workspace как sealed proof.
  Повторный read/hash оправдан только для защиты commit ingestion от смены
  control/bytes между чтением и использованием; не размножать его по каждому poll.
- Capture reader сохраняет pending/invalid/observation_lost reason и reference
  операции. Worker не объявляет повреждение на основании одного unknown read.
- В catch interactionCleanupPending сохранить исходную ошибку и phase:
  неверифицируемое содержимое Interaction Judge ограничивает assessment;
  отсутствие только stop ACK относится к cleanup; ни то ни другое не является
  ошибкой snapshot. Не скрывать отказ проверки content и не снимать custody gate.
- Разделить условия loop: capture ingestion / scored finalization / resource
  retirement. После sealed snapshot выполнить локальную ingestion и finalization
  существующим авторизованным observer, даже если cleanup pending. Не ждать
  чистоты ресурсов для диагностики уже завершённого Subject.
- Если capture не получен в существующем окне наблюдения, опубликовать terminal
  technical report с primary failure, capture reason и assessment unavailable,
  а не держать весь EVAL в бесконечном recovery. Полный Judge по недоступным
  данным не запускать. Отсутствие evidence не подменять продуктовым FAIL/PASS;
  доступные подтверждённые факты сохраняются. Late capture может завершить
  ingestion разрешённым owner без повторного Subject и без переписывания истории.
  Для уже failed execution использовать существующие state=completed_with_failures,
  execution_state=failed, assessment_state=unavailable; capture/cleanup reason
  оставить отдельными полями/technical notes. Не вводить новый state enum.
  Это terminal mapping всего EVAL только когда все выбранные executions terminal
  по existing queue policy. При ещё живой/queued execution сразу публикуется
  diagnostic failed execution, но общий EVAL остаётся в соответствующем running/
  awaiting состоянии. Недоступный capture одной execution не отменяет другую.
- runnerCleanupReceipt оставить read-only recognizer: report_projection_pending
  означает необходимость авторизованной проекции, не absence settlement.
  runnerFinalizeSettled выполняет эту проекцию в текущей authority; cleanup-only
  worker не получает права нового Subject/Judge dispatch.
- После завершения основного отчёта отдельный existing cleanup owner обновляет
  cleanup/technical notes и может ingest/project поздний подтверждённый capture,
  но не запускает платный Judge. После выхода scored observer новая assessment
  требует явного existing авторизованного continuation/finalization request,
  исполняющего runnerFinalizeSettled для terminal Subject. Без этого запроса
  assessment остаётся unavailable; автоматический cleanup не повышает authority.
  Ни этот запрос, ни поздний capture не возобновляют Subject. Candidate/Judge
  revision по тому же evidence hash идемпотентна; при новом evidence — новая
  existing candidate revision, без перезаписи старого verdict/primary failure.
- Перед выходом scored observer подтвердить existing cleanup owner либо
  идемпотентно зарезервировать durable cleanup handoff в имеющемся механизме.
  Ошибка handoff оставляет cleanup_pending с причиной и доступной следующему
  операторскому/preflight cleanup reservation, но не отменяет готовую assessment.
  Рестарт не создаёт второй cleanup owner и не теряет существующий.
- Хранить primary execution failure отдельно от capture/cleanup technical notes.
  Старые scored events не переписывать и не запускать Judge задним числом в
  исторических EVAL при реализации/миграции. Новый код корректно читает их.

Приёмка: reasoning/сообщения/tool activity без изменения файлов за пределами
первоначальных30с продлевают окно; лимит automatic follow-up этим не сбрасывается;
no progress истекает; повтор poll/heartbeat не продлевает; explicit cancel
сохраняется; рестарт не обнуляет spent budget. Current valid snapshot выигрывает
у old worker blocked; foreign/replaced/unsealed/malformed snapshot запрещён.
Capture ready + cleanup pending → отчёт/assessment без повторного Subject;
capture unavailable → technical report без fabricated full assessment;
multiple executions → failed diagnostic не завершает живого соседа;
два рестарта/gap без нового сигнала не дают полный budget и не объявляют Work fail;
late capture после выхода observer → ingestion без Judge, explicit finalization
создаёт максимум один Judge на candidate revision, без нового Subject;
поздняя resource retirement не меняет execution verdict. Проверить оба CLI wrapper.

### F. Атрибуция: оставить полезную гарантию без запрета анализа (D11)

- Strict launch admission `lib/execution-contract.mjs:245–247` не ослаблять:
  frozen profile/routing перед dispatch должны совпадать.
- После исполнения `matched`, `unknown`, `mismatched` сохранять раздельно.
  Missing outbound_model — unknown; явное противоречие expected/observed — mismatch.
- В finalization/Judge gating и buildReport не использовать !=matched как
  общий profile mismatch/infrastructure failure. Unknown даёт technical note
  об ограниченной атрибуции; Judge получает доступные факты и это ограничение.
- Доказанный mismatch остаётся нарушением профиля/невалидным экспериментом;
  выбранная политика: configured final Judge выполняется и при mismatch в
  диагностическом режиме, как и при unknown, если custody позволяет assessment.
  Итог явно не сертифицирует профиль и не переводит mismatch в matched/valid.
  Не добавлять второго Judge или отдельного модельного вызова поверх штатного.
  Условия необходимости capture/content custody по пакету E не отменяются.
- Не менять существующий enum validity без необходимости: conformance и
  technical note уже несут unknown. Истинный infrastructure failure по другой
  причине остаётся invalid независимо от состояния атрибуции.
- `lib/specify-comparison.mjs:178` сохраняет запрет полноценного сравнения
  unknown/mismatched samples, но пишет точную причину и доступные измерения.
  Не объявлять модели сопоставимыми и не выдумывать requested model evidence.
- Для отсутствующих intent records проверить existing canonical source registry:
  не включать non-asserting/no-request session как доказательство model mismatch;
  не наследовать model intent от родителя как якобы наблюдавшийся запрос child.

Приёмка: matched/unknown/mismatch × succeeded/failed Subject; unknown с пустым
mismatches не даёт not_run_profile_mismatch; diagnostic Judge не исправляет
conformance; comparison unknown явно исключён, strict launch mismatch запрещён.

### G. Lock/process observation (D12)

- Self process identity lookup кеширует только успешный результат; сбросить
  rejected selfIdentity promise, чтобы новый read мог восстановиться.
- В existing lock observation loop восстанавливаемые ошибки ps повторять в
  рамках его inactivity policy; не создавать дополнительный бесконечный retry.
  Переиспользовать успешный снимок на один observation pass, не N×ps на владельцев.
- Fixed5s не использовать как доказательство смерти/занятости owner. По возможности
  узкий запрос конкретного PID вместо полного списка; полный snapshot нужен
  только для дерева/инвентаря. Сохранять stderr, exit/signal и cause.
- Unknown process observation → pending с причиной/ограниченным повтором;
  confirmed live owner → ожидание прогресса; proven dead/reused PID → existing
  точный reclaim. Без подтверждения не unlock и не kill по имени процесса.
- `withPriorEvalRetirement` не называет process_ownership_unknown «still owned».
  Failure до Subject не должен порождать cleanup goal, требующий несуществующего
  RUN; eligibility проверять по фактической reservation/registry ownership.
- Не требовать удаления всех исторических EVAL перед каждым запуском. Barrier
  относится к пересечению или не исключённому конфликту exclusive ресурсов; незавершённая
  уборка независимого изолированного scope не является общим запретом admission.
  Изоляция подтверждается actual resource bindings (workspace, ports/DB, leases,
  provider session), не одним новым EVAL ID. При неизвестности изоляции запрещена
  только потенциально конфликтующая операция, не unsafe bypass shared resources.
- Для этого явно дополнить внутренний input withPriorEvalRetirement и оба
  caller (runnerRun/runnerResume) prepared launch resource bindings. Current
  caseId/resourceHome не доказывают ни конфликт, ни изоляцию. Переиспользовать
  manifest/prepared execution reservation, actual test-world/port/DB bindings и
  leases; check-resources сейчас содержит только browser cache, его недостаточно.
  Если часть exclusives ещё не известна до preparation — не угадывать: оставить
  соответствующий потенциальный конфликт fenced до получения фактов.
- Разделить advisory historical cleanup candidates и blocking conflict set:
  пересекающийся writable workspace, тот же exclusive endpoint/DB/test-world
  owner или native session требуют reconciliation перед этой операцией;
  общий readonly browser cache, provider/model name либо SQLite registry home
  сами по себе не являются exclusive workload conflict. Не вводить новый registry.
  Сравнивать нормализованные endpoints/IDs без credentials. Recheck bindings
  под существующими admission locks перед публикацией launch reservation;
  не убирать lock, защищающий конкурентное приобретение одного ресурса.
  Не удерживать блокировку admission независимого scope на ожидании фоновой
  уборки всех case homes. Их cleanup по-прежнему планируется advisory, а не теряется.

Приёмка: transient ps failure → следующий успешный read в том же процессе;
вечно недоступный observer → bounded pending/error без удаления lock;
live owner/reused PID/dead owner/malformed owner; pre-Subject attempt без RUN.
Дополнительно: isolated resources допускают запуск при historical cleanup pending;
одинаковый exclusive port/DB/workspace и missing binding не bypass; общая registry
или browser cache без exclusive overlap не сериализуют все запуски.

## 5. Порядок, затронутые зоны и определение завершения

1. Зафиксировать небольшие offline regression sequences на существующих fixtures
   (исходные CP260/CP258 артефакты только читать; минимальные copies без secrets).
2. Engine A–D; независимый EVAL E–G можно реализовывать параллельно в отдельных
   файлах/ветках. Shared selector+consumer и recovery loop+projection — вместе.
3. Проверить affected contracts по ownership map плана102/104; запустить только
   их. Не делать full/E3/полные native suites из-за общей папки; reusable receipts
   использовать по существующей политике, не считать source text grep behavioral PASS.
4. Engine: existing lifecycle-invocations, assigned-lifecycle, retained-native-hook108,
   native plugin/generated fixture, controller-technical-resume, vnext-fanout-reconcile,
   controller-child-recovery103/result-authority и CODE Work tests — выбранные кейсы.
5. EVAL: recovery budget + process-json wrappers, cleanup-observation, snapshot
   ingestion/finalization, resume worker, judge-profile/report conformance,
   specify comparison, runner lock/process retirement — выбранные кейсы.
   Сохранить негативные custody/ownership/replay/cancel tests в тех же зонах.
6. Подтвердить один общий outcome для всех stages/harnesses; специфика остаётся
   только в native identity/env/continuation adapters. Droid/Grok — offline
   совместимость общих изменений, не новые платные EVAL.
7. Записать единый implementation/check receipt со ссылками D1–D14 (не отдельную
   бюрократическую цепочку для каждого дефекта), diff review и известные
   ограничения; commit/push/PR/merge по runbooks/git-workflow.md только в рамках
   последующего поручения реализации. Не менять release pins/installed hooks
   до отдельного выпуска, не вмешиваться в работающие EVAL.

План выполнен, когда D1–D14 закрыты проверяемыми изменениями/негативными кейсами,
scoped checks PASS и нет неограниченного follow-up/ложного grant. Это готовность
к новому E2E, не заявление о его прохождении. Новые live-запуски потребуют
отдельной команды пользователя и выпущенного/pinned кандидата.

## 6. Ponytail/readiness review

- Не добавлять service/framework, decision classifier, новую БД или второй
  retry scheduler. Использовать managedFlowEnv, native identity, lifecycle CAS,
  physical owner guard, durable operation, observation clock, technical notes.
- Удаляется контроль по непустой deviation и связывание cleanup с оценкой;
  ownership, реальные проверки Work, integrity и unknown-effect safety остаются.
- Запреты replay/foreign input не ослаблять ради продолжения. Сохраняется
  ограничение сравнения моделей при unknown и строгая pre-dispatch profile проверка.
- Причина исторического последнего Luna capture-read неизвестна: реализация
  закрывает доказанные D7–D10 и добавляет диагностику, не подгоняет историю.
- Не требуется решение пользователя о новой модели/схеме: выбран один automatic
  completed-child follow-up на Work, без новой публичной настройки/глобального
  RUN лимита. Нативные неподдерживаемые продолжения дают локальный blocker,
  не выдуманную capability. Продуктовые дефекты вне scope.
- После внесения дополнений проверить ссылки/символы и отсутствие изменённых
  runtime/test/profile/pin файлов. Для планового документа runtime tests не нужны.
- Ревизия назначения checks (§2): отрицательный кейс должен проверять не только
  refusal защищаемого действия, но и отсутствие побочного blanket flow stop.
  Локальная зависимость может остановить зависимый переход — это не разрешает
  продолжать его без prerequisites, но не запрещает отчёт, cleanup и независимые Work.

### Результат независимого review плана

2026-10-28: два read-only аудита engine и EVAL сверены основным агентом с кодом.
В итоговый вариант добавлены общий durable лимит follow-up (новые IDs не прогресс),
обязательная передача cleanup ownership до выхода наблюдателя и однозначный
diagnostic final Judge при post-run mismatch без сертификации профиля.
Проверены callers selector/currentStageFinishCommand, producers managedFlowEnv,
оба CLI observation wrapper и все найденные !=matched post-run gates.
Whitespace/diff review документа PASS; runtime/model checks не запускались.
Изменён только этот план. План готов к реализации на сверенном актуальном main;
неизвестная историческая причина Luna capture-read не блокирует исправление
подтверждённых ветвей и явно остаётся ограничением доказательств.

Повторный review 2026-10-28 по запросу об избыточных проверках: добавлена
action-scoped матрица оставшихся гарантий и явный список удаляемых барьеров.
Разделены liveness activity и repair progress; неполный capture больше не
запрещает terminal technical report. Native closure защищает конфликтующую
запись/cleanup, не принятый Work; retirement не является глобальной уборкой всего
исторического набора EVAL. Новых framework, policy registry, classifier,
публичных настроек или полных тестовых прогонов не требуется.

### Финальная readiness-проверка 2026-10-28

Повторные независимые engine/EVAL review перепроверены по исходникам. Исправлены
необоснованная ссылка на несуществующий общий repair budget, provider-only renderer,
слишком узкий критерий «доказанный writer», неописанный владелец поздней assessment,
обнуление окна после restart/gap, недостающие admission resource inputs и
преждевременная terminal-проекция multi-execution EVAL. Решения зафиксированы
в D/E/G, негативные кейсы включены в их приёмку. Фраза «принятый результат не
ждёт close ACK» не разрешает конкурентную запись unsettled child.
Реализация затрагивает engine и EVAL; bridge/canon/pins/homes не меняются этим
планом. Полного gate, новых моделей, runtime qualification и GitHub CI не нужно.
После внесения решений оба reviewer повторно проверили свои части; основной
агент сверил их с current function contracts и убрал остаточную неоднозначность
«прогресс разрешает ещё одну episode». Существенных проектных блокеров не
осталось; неподдерживаемое native same-child продолжение явно является локальным
ограничением, а не обещанием гарантированного полного E2E во всех условиях.
