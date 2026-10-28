# 111 — Доступные продолжения и capture после нативного отказа

Статус: подтверждённые tooling-дефекты реализованы, адресная offline-приёмка PASS;
Дата: 2026-10-28. Native AGY acceptance — отдельная
явно обозначенная зависимость, не обещанный результат offline исправлений.
Ponytail full: общий формат результата, существующие lifecycle/control rows,
physical-absence proof и отдельная финализация; без новой подсистемы recovery.

## 1. Цель и границы

Устранить причины технического FAIL CP261 Luna и потери recovery evidence AGY.
Агент должен получать фактически выданное продолжение; новый исправимый отказ
не является повторной доставкой старой операции. Умерший provider не обязан
отвечать на native idle перед безопасным capture. Ни один из этих принципов
не разрешает объявлять незавершённый Work/Stage успешным.

Исследованные базы: engine `0.9.0-beta.156`, commit
`1a2bd0ea6d022b22e94f552f1cde1fb8e8b6689e`; EVAL `f0a556f3` (CP261).
Перед реализацией сверить с текущими main; не переносить уже исправленный код.
Исторический план 110 не переписывать: этот план явно заменяет его правило
«одна automatic repair-follow-up episode на Work» и уточняет shutdown/capture.

Не менять продукт dd-tasks, fixtures Judge, verdicts, старые EVAL homes/pins,
исторические receipts или результаты. Не resume/restart/stop работающие EVAL.
Не запускать новые EVAL, полный gate, GitHub CI или модельные пробы при написании
плана. При реализации — только затронутые проверки. Выпуск/новые прогоны требуют
отдельного поручения; AGY live-проверка — явно выделенная последующая приёмка.

### Исходные доказательства

Общая база: `/Users/deksden/.dd-eval/qualification/`.

| EVAL | Home | Подтверждённая цепочка |
| --- | --- | --- |
| Luna `EVAL-20261028075607-701b1ff1` | `cp261-luna-full` | CODE → WRK-012 repair → два сохранённых `work_checks_failed`/successor → stdout без retry → одна controller-коррекция → техническая пауза → `usage: run control status does not accept --control-id` |
| AGY `EVAL-20261028075608-e8692542` | `cp261-agy-full` | CODE принят → оба review Work приняты → новый запрос stage-finalization → native `INVALID_ARGUMENT (400)` → provider exit 3 → native inspection недоступен → control budget exhausted → нет sealed snapshot, cleanup позже settled |

Luna: SQL `lifecycle_invocations` IDs `033da7a0-0cee-4084-adc8-3567a7786637`
и `4b962561-4f4e-472e-985a-38eaa1ac2156` имеют `retry_command`,
`effect=no_effect`, `recoverable=true`, `successor_invocation_id`. Фактические
commandExecution outputs не имеют этих полей: вызовы без `--json`, вывод
`dd-flow: Work remains running...; See: ... --help`. Это не truncation.
Controller events 110–115: work_repair_reserved → follow-up completed → inspect
settled, все child completed → technical_dependency_paused без source operation.

AGY: session-6 `e0075eeb-60e7-49e2-9404-5c2010babc24`, native terminal positions
252–258, generation 4. После user input финализации нет model/tool результата.
`AGY_ERROR` сообщает `retryable=false`; native log — общий INVALID_ARGUMENT.
`daemon.json`: provider_exit.code=3, cleanup_failed, shutdown.phases.execution=true;
cleanup_error.reason=provider_birth_changed. Control worker — remaining_ms=0,
policy=settlement-inactivity@1, 154 markers, 14 polls, observation_gaps=0;
последняя session pending, listener inspection unavailable. Это не доказательство
fixed wall-clock timeout: окно sliding, но ожидало невозможный native proof.

## 2. Реестр дефектов и аналогов

Пути engine относительны dd-flow-cli, EVAL — dd-eval. Аналог без исторического
проявления не называть причиной конкретного EVAL.

| ID | Доказанность / корень | Места и решение |
| --- | --- | --- |
| D1 | CP261 Luna, потеря presentation при retention | `src/cli/run-cli.ts:562,632`: parseOutputOptions удаляет flags, retainObservedLifecycleSemantics записывает очищенные args; `lifecycle-invocations.ts:1762` перезаписывает work finish/fail. Исходная выдача Work уже содержит JSON flags. Сохранить semantic args и presentation раздельно при обновлении существующей команды, не только добавить flags в первоначальный issuer. |
| D2 | CP261 и общий аналог, неполный human output | `src/cli/error-output.ts:21` скрывает retry/continuation; `run-cli.ts:897` скрывает outcome/instruction/next.finish_command/repair/prompt_delivery. Затрагивает ошибочные и успешные нетерминальные stage/work, interactive scope/checks и memory compose. Общий компактный renderer полезного следующего действия. |
| D3 | CP261, Work-wide cap | `controller-child-repair.ts:31–40,66`: одна reservation на весь Work и operation ID от run+work запрещают новый successor после нового отказа. Заменить на идемпотентную коррекцию конкретной refusal→successor, с прогрессом и поддержкой native follow-up. |
| D4 | CP261, причина подменена writer-блокером | `run-controller.ts:538,582` сворачивает reconciliation_required в generic pause; исходная ошибка/source теряется. Различать незавершённый результат, неизвестный effect, возможный writer и cleanup; передавать первичную причину и operation binding. |
| D5 | CP261, публичный CLI mismatch | `lib/managed-flow-client.mjs:195` добавляет неподдерживаемый control-id в status. `src/cli/command-inputs.ts:210`, `run-cli.ts:2169` принимают RUN scope. Удалить flag у клиента, сохранить проверку полученного control_id перед reconcile. |
| D6 | CP261 AGY, аварийный stop зависит от native ACK | `run-control.ts:265`: physical absence только boundary/technicalPause; generic fatal stop исключён. Общий `completeDaemonShutdown` запускает prepare раньше физической уборки; AGY prepare/inspection требуют живой endpoint. Разделить graceful reuse, forced physical stop и capture. |
| D7 | Подтверждённый общий ABI-дефект, не только AGY | `run-control.ts:290,614`, `dd-grok-daemon.mjs:544` читают `shutdown.phases.tree`, текущий ABI использует execution/owned_resources/provider/daemon_resource (+ фактические дополнительные фазы). Stop fallback дополнительно требует ровно два records/один provider. Удалить stale predicates и cardinality gate; читать существующий ABI/owned inventory, не строить новый schema registry. |
| D8 | Аналоги D6 в других адаптерах | Codex prepareCodexStop до bridge.close; OpenCode daemon.stop waitForSettlement/describe до stopProcessGroup; ZCode prepareStop может бросить tree_not_settled до bridge.close. Проверить аварийный provider unavailable на всех; исправлять общий stop/capture путь и минимальные adapter hooks. Droid physical close — полезный существующий пример, не переписывать исправный код. |
| D9 | Подтверждённые тестовые слепые зоны | `test/managed-flow-client.test.mjs` CLI-double принимает лишние args; `test/controller-child-repair110.test.ts` закрепляет Work-wide cap; `test/run-controller.test.ts:491,895` создаёт legacy phases.tree. Заменить ожидания/fixtures на реальные контракты, не увеличивать таймауты и не повторять весь gate. |
| D10 | Native AGY 400: точный payload-дефект не установлен | AGY 1.4.7 отвергает продолжение после двух принятых review Work. Не объявлять это overload, quota, дефектом prompt или подписи без evidence. Проверить upstream 1.4.9 адресно; сохранить явную границу native blocker. |
| D11 | Аналог, структурированная диагностика AGY не доходит до результата | `dd-agy-daemon.mjs:403` журналирует stderr, `dd-agy.mjs:18` разбирает AGY_ERROR только если он внутри result.error; в CP261 result.error — короткая строка, envelope остался только в stderr. Сохранить безопасные native status/code_kind/retryable/error_id с binding текущего dispatch, не весь stderr/секреты. Это улучшение доказуемости, не доказательство причины 400. |
| D12 | Подтверждённый аналог: отсутствие input binding в anti-repeat | `lifecycle-invocations.ts:1798–1808,1816` и hook-only correction `:564–585` сравнивают диагностическую signature без digest отклонённого содержимого. Разное содержимое с одинаковой ошибкой может лишиться successor ещё до controller. Привязать CLI preparation rejection к фактически прочитанному input; hook не должен читать файлы или предполагать их неизменность. |

## 3. Проверки: что оставляем, что удаляем

| Конкретное действие | Достаточная гарантия / поведение при её отсутствии |
| --- | --- |
| Чтение status, вывод диагностики | RUN scope и валидный ответ. Не требовать idle, clean shutdown, полного model attribution или готового assessment. Ошибка чтения не становится ошибкой Subject. |
| Новый productive запрос / lifecycle effect | Текущий owner/generation, точное назначение, отсутствие конкурирующей неизвестной доставки. Наблюдать original unknown effect, не повторять mutation. |
| Продолжение исправимого Work | Принятый отказ, существующий issued successor, тот же child/scope и отсутствие pending dispatch. Не новый Work и не повтор уже использованной команды. |
| Принятие Work/Stage, заявление PASS | Реальный принятый результат и необходимые проверки. Native terminal/текст агента не заменяют его. |
| Конфликтующая запись в workspace | Предыдущее связанное исполнение settled либо физически отсутствует. Не проверять всё дерево всех упряжек перед любым unrelated действием. |
| Force stop / удаление ресурсов | Явная stop/cancel authority, exact owned process/tree identity, PID birth/группа, dispatch fence. Не kill по имени процесса, порту или общей папке. |
| Sealed capture | Writers ограждены и их отсутствие/settlement доказано; целостность снимка привязана к RUN. Не требовать native success или идеальной уборки idle service. |
| Automatic reconcile/resume | Exact current control + собственный source/принятый boundary. Никогда автоматически не снимать человеческую pause/stop. |

Удаляем Work-wide cap, stale tree predicates, невозможное обязательство получить
ACK умершего сервиса и зависимость доступности successor от режима вывода.
Не добавляем classifier/decision-модель ошибок, глобальный watchdog, новую БД,
очередь recovery, полный proof всего репозитория или дополнительный тестовый gate.

## 4. Пакеты реализации

### A. Один фактический output-контракт для продолжений (D1,D2)

1. В retainObservedLifecycleSemantics обновлять только публичные semantics Work
   (result input/reason), не теряя retained --json/--progress-jsonl и заданного
   response-file/stdin/redirection. Использовать существующие parser/output
   helpers. Не менять fingerprint authority: json/progress-jsonl уже исключены
   из него, но response-file может оставаться частью точной привязки Work-команды.
   Его destination и существующие authority-правила сохраняются; не исключать
   response-file глобально из fingerprint ради исправления presentation.
2. Публичные successors агентных stage/work/start/finish/fail/resume должны
   сохранять machine-readable presentation по всей цепочке, включая второй retry,
   prepare-rejection, verification_required и return-from-repair. Не вставлять
   внутренние invocation IDs в видимый агенту текст. Не менять shell conditions.
3. renderHumanError показывает code, effect/recoverable, retry instruction и
   точную public retry_command, а также существующую continuation, когда она есть.
   renderHumanResult показывает outcome, полезную instruction, next.finish_command,
   repair.work_id и prompt_delivery.path/sha256. Печатать только существующие
   поля, без нового policy decision и копирования больших receipts/prompts.
   HITL входит в этот же контракт: pause.user_message/question_path,
   agent_instruction, next_action, resume_command/template; resumed — текущий
   prompt_delivery либо legacy prompt_path. Иначе human pause/resume по-прежнему
   потеряет необходимое действие. Сохранять raw answer, не интерпретировать его.
4. Сохранить failure exit code; ok:true не означает Stage done. При response-file
   JSON и human action должны описывать один сохранённый outcome. Не перезаписывать
   исторический artifact ради нового представления; придерживаться его текущего
   explicit destination контракта. Read-only replay не создаёт successor.
5. Проверить все callers shared renderers/retention и issuers stage/work,
   interactive checks/scope, memory compose, delivery. Верхние wrappers, уже
   выводящие полный JSON, не переписывать без дефекта.

### B. Последовательные исправления без duplicate dispatch (D3)

1. Резервировать коррекцию по exact refusal + successor, Work и текущему generation.
   Использовать existing controller events/operations; новая таблица не нужна.
   operation ID детерминирован от этой связи, а не только run+work.
2. Один successor доставляется максимум один раз; persisted pending/unknown
   dispatch наблюдается по прежнему ID после restart, не отправляется заново.
   Новый отказ с новым successor может дать следующую коррекцию тому же child.
3. Для check-refusal использовать существующие declaration/command identity,
   scoped check.input_hash и сохранённый typed error code отказа. Не предполагать
   наличие отдельного check-rejection fingerprint: сравнение строится на этой
   конкретной связи check + consumed input + code. Новые UUID,
   timestamps, receipt sequence, terminal Turn и правка только result summary
   не являются прогрессом. Для content/preparation-rejection использовать
   существующий rejection_signature и изменение именно отклонённого input;
   если доказуемой связи нет, оставить локальный blocker, не угадывать по prose.
   Не проектировать новый free-text normalizer/classifier диагностик, полный
   Git tree или самостоятельный монитор изменений. Повтор того же отказа при
   прежнем relevant input не запускает очередной auto-follow-up: retained
   Work-level blocker `repeated_without_progress` с исходной диагностикой.
   Повтор с прежним check input после предполагаемого восстановления окружения
   не получает автоматический controller-follow-up: существующий --reason —
   только текст, а отдельного approved recovery evidence сейчас нет. Сохранять
   возможность явного разрешённого retry по действующему CLI; не строить новую
   систему approvals. Это ограничивает только автоматическую отправку нового
   запроса завершившемуся child, не отключает overload retries и не отменяет
   уже выполняющуюся законную коррекцию внутри его Turn.
4. Код должен сначала найти новый текущий отказ/successor, затем сравнить с
   previous reservation: простое удаление if(previous) небезопасно. Previous
   episode не даёт права повторить старый finish. Scope/child/assignment/generation
   и незавершённые siblings остаются существующими admission-проверками.
5. Follow-up только там, где adapter уже умеет безопасно продолжить child.
   Codex/OpenCode/Droid/Grok используют имеющиеся capabilities. Для AGY/ZCode
   не выдумывать native send/resume API: в активном Turn работает исправленный
   output; завершившийся child без capability получает точный локальный blocker
   и существующий явный recovery. Независимые разрешённые Work не отменять.
6. Не превращать unfinished Work в PASS и не создавать replacement worker.
   Никакого нового лимита «N исправлений на Work» вместо удалённого cap.
7. D12 исправляется у issuer, а не только у controller: при CLI preparation
   привязать отказ к existing canonical public argv (без presentation/internal IDs)
   и SHA-256 ровно тех result-file/stdin bytes, которые уже прочитаны для этой
   попытки. Reuse текущего loader/hash, не дополнительное чтение всего workspace.
   Тот же scope + input key + rejection_signature без нового эффекта — прежний
   refusal; изменённый consumed input допускает новый исправимый successor даже
   при той же diagnostic signature. Exact replay старой identity остаётся старым.
   Если input ещё не прочитан/неподтверждён, не выдумывать digest: оставить
   консервативную локальную диагностику. Hook-only correction использует только
   retained CLI input key или literal argument binding; отсутствие body digest
   не доказывает неизменность файла и не является глобальным fatal. Проверку
   file/stdin content делает CLI после лёгкого hook ACK, не callback.

### C. Правильный тип паузы и публичный control client (D4,D5)

1. Просмотреть все pauseDependency callers: productive outcome unknown,
   predecessor settlement, failed child repair, accepted-child cleanup, Stage
   transition, external Work cleanup, boundary capture. Отказ каждого должен
   объяснять именно запрещённое действие.
2. В existing technical_dependency_paused/technical_notes сохранять primary
   code/reason, Work/operation/refusal/successor refs, защищаемое действие и
   конкретную зависимость. Не выдавать child_work_repair_blocked за native writer.
   `source_operation_id` заполнять только реальной операцией, не для прохождения
   автоматического resume. Отсутствующий source — явное ограничение recovery.
3. При незавершённом Work не запускать dependent finish, но разрешать diagnostics
   и независимые ready Work. Если продолжение невозможно и больше полезной работы
   нет — правдивый failure/blocker с причиной, не вечный generic pause.
4. EVAL status вызывать без --control-id. Сопоставлять current control receipt с
   ожидаемым событием до reconcile; mismatch/смена owner/операторская pause дают
   наблюдение/явную остановку действия, а не автоматический resume.
5. Ошибку EVAL-наблюдателя/CLI учитывать отдельно от исходной ошибки Subject;
   recovery interruption сохраняет обе причины, не затирает первую `usage`.
   Ошибка локального read с phase=prepare/effect=no_effect не разрешает повторять
   продуктивные команды или terminalize RUN как semantic failure.

### D. Физическое завершение вместо ACK умершего сервиса (D6–D8)

1. В общем completeDaemonShutdown отделить graceful prepare от explicit forced
   cleanup. Обычный stop без cancel-tree не должен незаметно убивать живую работу.
   В явно авторизованном forced stop native-inspection ошибка сохраняется, но не
   препятствует остановке точно owned provider/групп и оставшихся ресурсов.
   Здесь forced означает уже авторизованный whole-RUN stop/cancel-tree;
   --force управляет escalation, а не существованием cleanup. Не добавлять
   обязательный --force для fatal-stop и не давать kill authority чтению status.
   При реализации подтверждён ещё один вариант того же дефекта: prepare может
   вернуть unsettled receipt без исключения, а следующий native resource RPC
   может упасть отдельно. Все три пути (throw, returned unsettled, resource RPC
   failure) обязаны дать authorized owned physical cleanup, сохраняя native error
   и неизвестные ресурсы; не выставлять execution=true только потому, что Promise
   завершился успешно. Graceful путь по-прежнему не получает kill authority.
2. До close удержать existing exact inventory, fencing и PID-birth. После close
   доказать отсутствие owned execution; не объявлять native settled/clean/success
   по факту SIGKILL/exit. Если provider сам аварийно вышел, не требовать его endpoint
   для этой физической проверки. Известный потомок/unknown resource остаётся
   связанным blocker capture или отдельным service cleanup по своему write scope.
   Native prepare exception не даёт права ставить shutdown.phases.execution=true.
   Forced path отдельно сохраняет physical retirement facts в existing shutdown
   JSON (owned inventory, provider/owned_resources/daemon_resource completion),
   а native execution/settled/clean оставляет false/unavailable. Текущий dispatcher
   fence и retirement endpoint закрываются после owned physical cleanup, без
   возобновления продуктивного dispatch и без поддельного nativeShutdownConfirmed.
3. В run-control использовать managedDaemonExecutionAbsent и для fenced fatal
   stop/capture, не только boundary/technical pause. Re-observe под текущим control;
   не расширять до «нет PID лидера — значит нет потомков». После проверки сохранить
   существующую physical retirement evidence, а native acknowledgement оставить
   unavailable. Не повторять неизвестную productive operation ради очистки.
   Выбран простой вариант для error/fatal-stop: перед physical-only capture
   завершить также технический bridge. managedDaemonExecutionAbsent сейчас
   проверяет его наравне с provider — не ослаблять это до «bridge вроде idle».
   Cleanup pending после capture означает lease/socket/bookkeeping или отдельно
   доказанный non-writer service, не живой непроверенный bridge. Живой bridge
   допустим только при уже существующем независимом current execution proof,
   не как новая exception данного плана.
   Расширить existing absence predicate на сохранённые shutdown.owned_processes
   и native_resources_entries: все известные local writer PID/birth должны быть
   retired; unproven writer/schedule/topology gap — blocker именно capture.
   Не считать исчезновение registered leaders полной coverage. Поле classification
   само по себе не исключает запись; использовать existing native-resource
   ownership/scope/proof. Нельзя требовать native success для уже доказанного
   physical retirement, но нельзя скрыть неизвестный external writer.
   nativeInventoryVersion обязан включать имеющиеся write-relevant native
   revision/unclaimed/topology/resource/retirement-notification поля: поздний
   writer между наблюдением и seal инвалидирует proof, heartbeat/log time — нет.
4. Удалить phases.tree из production reads (два в run-control, один Grok status).
   Для проверки полного shutdown использовать actual required_phases и общий
   validator nativeShutdownConfirmed; для одного действия проверять только нужную
   execution/physical гарантию. Удалить привязку physical fallback к ровно двум
   process records: достаточен полный проверенный owned inventory, включая реальные
   дополнительные support/tool процессы. Старый tree не приравнивать автоматически к новому
   complete shutdown. Legacy receipt можно сохранить, отсутствие current proof
   восполняется read-only физическим наблюдением, не rewrite historical result.
   nativeShutdownConfirmed не является условием physical capture:
   для него достаточен managedDaemonExecutionAbsent после текущего fence.
5. Точечно согласовать prepare/stop всех шести адаптеров. AGY cancel/close сейчас
   инвалидирует native proof и затем требует его от исчезнувшего сервиса; новый
   forced path завершает физическую уборку без такого RPC. Codex/OpenCode/ZCode
   аналогичный pre-close dead-provider отказ не должен блокировать forced cleanup.
   Droid reuse существующего поведения, Grok — убрать stale refresh predicate.
6. Sliding settlement-inactivity оставить; polls/heartbeat не являются прогрессом,
   реальные новые retirement facts продлевают окно. Не увеличивать 120с ради
   невозможного proof и не добавлять fixed timer. Внутри длинного cleanup общему
   наблюдателю доставлять новые подтверждённые фазовые факты по existing progress
   path, иначе последовательная работа может ошибочно выглядеть тишиной.
7. Capture/Judge/final report отделить от остаточного service bookkeeping через
   existing owners. При доказанном отсутствии writer публикуется sealed capture
   с исходным failure и technical notes; при неизвестном writer — только bounded
   technical report, без вымышленного полного assessment. Поздний bound snapshot
   может дополнить evidence, не переписывая исторический failure.
   Совместимость end-to-end: sealRunRecovery получает aggregate settled=true
   только для фактического fenced execution settlement; completed control nodes
   несут physical evidence и native_cleanup_confirmed=false, не native PASS.
   controlStatusReceipt и EVAL capture ingestion читают sealed bound control как
   раньше. runPhysicalStopped/cleanup_state независимо проверяют свою inventory;
   capture-ready не должен автоматически превратиться в cleanup-settled.

### E. AGY native 400: доказуемая граница и адресная проверка (D10,D11)

1. Не добавлять INVALID_ARGUMENT в overload/retry policy. Generic 400 не доказывает
   no_effect всего прошлого Turn и не даёт права безусловно повторять запрос.
2. Из AGY_ERROR envelope брать только существующие безопасные поля
   status/error_code/code_kind/retryable/error_id и связывать с active operation,
   connection и turn_generation. Неполная chunked строка собирается существующим
   stream reader; чужой/late envelope не меняет текущий результат. Не логировать
   токены, credentials, полный backend request/history, произвольный stderr body.
   Конфликт result/error-envelope — сохранить оба typed facts, не менять в PASS.
   Envelope CP261 не содержит operation_id/generation: active pointer сам по себе
   не доказывает связь. Обогащать только diagnostic metadata при совпадении
   connection/dispatch-интервала и terminal status/message; иначе unbound note.
   Не выводить identity из error_id и не использовать envelope.retryable как
   самостоятельную dispatch/retry authority. Late previous-Turn envelope не
   переопределяет следующий Turn; при неоднозначности данные только unbound.
3. Upstream changelog 1.4.9 описывает устранение unmatched tool call/result и
   устаревших thinking-block ошибок. При реализации установленный AGY уже 1.4.9;
   пользователь поддерживает его актуальным. Версия не является доказанным fix
   CP261: фиксировать фактические version/SHA перед приёмкой, не требовать
   обновления ради самого обновления. Проверить identity перед изменением pin; не трогать
   глобальный AGY и native binaries работающих EVAL. Новый private artifact.
   Источники: [официальный changelog AGY](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md),
   [upstream issue 919](https://github.com/google-antigravity/antigravity-cli/issues/919),
   [Google о thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).
   Issue — сообщение о похожем классе, не доказательство конкретной причины CP261;
   changelog также не подтверждает, что новый binary уже установлен/принят.
4. После отдельного разрешения выполнить адресную native reproduction acceptance:
   stage-entry → два child Work → delivery completion → semantic stage finish.
   Полезные негативные terminal-error/physical-exit случаи сначала offline.
   Никаких полной Judge qualification, пяти E2E или полных suite ради AGY bump.
   Native inspection grant привязан к binary SHA и client contract: старый P3
   receipt не копировать на новый binary. Существующий P3 grant all-or-nothing:
   11 случаев (8 live + 3 safety), включая fences activity/cancel/restart. Для
   предоставления grant новому binary нужны именно они через существующий
   collector/validator. Это scoped native qualification, не полный engine gate
   и не Judge qualification. Одна последовательность двух ревью не заменяет P3.
   Без текущего полного PASS новый grant не выдаётся; существующие grants и
   работающие homes эта реализация не изменяет. assertNativeInspection
   не обходить и productive native acceptance на неподтверждённом binary не
   объявлять разрешённой. Offline tooling можно завершить независимо от этого.
5. Если текущий проверяемый AGY повторяет 400 — сохранить upstream blocker с точным native error_id,
   binary identity, redacted transcript/steps и request timing; не писать собственный
   реконструктор Gemini history/signatures. Без такого proof нельзя обещать,
   что весь нативный дефект исправлен.
6. Принятые child Work остаются принятыми; незавершённый Stage finish не считается
   сделанным. При необходимости только existing явно авторизованный recovery
   оставшейся финализации; никаких автоматических смен model/profile или повторов
   уже принятых reviewer Work. Generic auto-new-session для любого 400 не вводить.

## 5. Систематическая область аудита и отрицательные результаты

Исследованы producers/consumers общих механизмов, а не только строки CP261:

| Область | Покрытие / итог |
| --- | --- |
| Lifecycle | shared issuance/retention/public command/rejection/successor, stage/work/start/finish/fail/resume, CLI human/JSON/response-file; D1,D2 |
| Другие flow | SDLC, memory init/upgrade/fix/compose, interactive scope/checks/integrate, delivery через shared output/retention; исправления общего пути, не копии на Stage |
| Controller | prompt/predecessor, child repair/capacity, fanout, accepted result authority, pause/stop, boundary capture, auto-reconcile; D3,D4 |
| Упряжки | Codex/Luna, AGY, ZCode, OpenCode, Grok, Droid; shutdown/reuse/physical absence и поддержка child-follow-up; D6–D8 |
| EVAL | managed observe, control stop/reconcile, recovery ingestion, cleanup-only/scored finalize, final report; только один production status-call имеет лишний control-id, остальные scope-only сохраняются |
| Provider policy | generic400 остаётся nontransient; overload/network/quota правила не переписывать без нового дефекта; AGY diagnostics D11 |
| Тесты | public-CLI doubles и legacy shutdown fixtures исправить на затронутых границах, не переписывать всю suite |

Не найдена необходимость менять bridge protocol, canon, fixtures canonical HITL,
Judge prompt/model/qualification, лимиты output/контекста или продуктовую логику.
Наличие похожей prepare-ветви адаптера не доказывает отдельный сбой его EVAL;
в плане это проверяемый аналог D8. AGY raw backend request недоступен; точная
причина 400 остаётся внешней неопределённостью, а не выдуманным диагнозом.

## 6. Точечная приёмка

Расширять существующие test files/helpers. Выбирать test-name patterns по зонам;
не запускать целиком native-adapters/run-controller, E3, release-gate или CI.
Не делать новую модельную квалификацию из-за harness/tooling фиксов.

| Пакет | Минимальное доказательство |
| --- | --- |
| A | Реальный CLI: issued Work → retained semantics → failed check → видимый successor с JSON → второй failure → второй successor. Human-mode видит actionable instruction. Успешный verification_required/repair_required не теряет next command/Work; stdout/response-file согласованы; exact replay не исполняет повторно. |
| B | Два новых no-effect отказа с релевантным прогрессом разрешают две коррекции одного child; один refusal/successor после owner restart не отправляется дважды; summary-only edit не считается прогрессом check-refusal, изменённый scoped check input считается; одинаковый diagnostic/input без прогресса останавливает только этот auto-follow-up; unchanged-input environment retry не запускается автоматически по одному reason; unknown effect и чужой child не допускают follow-up. Capability-unsupported AGY/ZCode не получают выдуманный API. |
| C | EVAL client проходит real public CLI validator на status, затем exact current reconcile. Negative: human pause, superseded control, foreign RUN, missing source. В отчёте видны исходный child error и observation error отдельно; нет false writer note при idle/completed tree. |
| D | Shared authorized stop/cancel-tree: native endpoint исчез/prepare бросает; own process tree останавливается и физически проверяется, FAIL остаётся FAIL, capture готов при cleanup pending. Полностью retired inventory с >2 owned records проходит без cardinality gate. Unknown/foreign PID, reused PID, surviving detached child и late writer не дают capture/kill чужого. Graceful stop/status не форсирует; fatal-stop не требует нового --force. Legacy tree не считается current execution. |
| D ABI | Existing daemon-operations/native-children fixtures генерируют текущий shutdown proof; реальные run-control и Grok readers принимают его без native refresh. Снять ручные tree-положительные doubles. |
| E | Offline structured AGY_ERROR с chunking/late/foreign dispatch, включая задержанный envelope прошлого Turn во время следующего; unbound metadata не создаёт retry authority. Terminal ERROR + provider exit до idle RPC → physical cleanup/capture без model call. Live последовательность текущего binary — отдельная явно помеченная native acceptance, не условие запуска остальных offline проверок. |
| A/HITL | Human pause показывает raw question и resume command, human resumed — текущий continuation path; output-mode не меняет raw answer или lifecycle authority. |
| B/issuer | Два различных consumed input с одинаковым validation error получают свои разрешённые successors; тот же input+signature не создаёт безлимитную цепочку; stdin и file работают одинаково, replay остаётся exact. Hook ACK не читает файл, отсутствующий digest не превращает состояние в глобальный FAIL. |
| D/capture | Error+dead provider, живой bridge: сначала авторизованно retire bridge, затем seal. Retained detached writer вне managed rows не пропускается; late native resource invalidates snapshot proof. Native clean/settled не становятся true от kill. Engine→EVAL ingestion допускает ready capture при cleanup pending; последующее cleanup-only завершение не повторяет Subject/Judge и не меняет исходный failure. |

Для A/C нельзя ограничиться mock, принимающим любые argv. Минимум один кейс
проходит настоящий engine CLI и публичный validator. Для D — общий contract
test плюс параметризованные dead-provider hooks всех затронутых adapters;
полные модельные прогоны каждой упряжки не нужны.

## 7. Порядок, совместимость, критерии завершения

1. Сначала A + C: восстановить видимость и правильный status без изменения
   semantics/safety. Затем B: новые repair episodes с проверкой прогресса.
2. D: current ABI и shared forced cleanup/capture; adapter deltas только где
   precondition реально мешает. Затем E diagnostics и отдельный AGY candidate.
3. Сохранить чтение existing repair events/operation IDs: pending old reservation
   наблюдается в прежнем ID; завершённый old episode не grants новую мутацию без
   нового bound отказа/successor. Не мигрировать активные homes автоматически.
4. Без schema migration по умолчанию: новые refs/primary cause в существующих JSON
   events. Если реализация обнаружит обязательную SQL migration — отдельно
   пересмотреть минимальное решение до изменения writer contract.
5. Все affected contracts проверены, diff/typecheck только нужных packages,
   source refs и evidence receipts сохранены; docs runbook не растёт протоколами.
   Коммит/пуш/мерж выполнять только в реализации по git-workflow проекта.
6. Различать завершение собственного tooling и подтверждение native AGY fix:
   confirmed fixes не блокируются неопределённостью backend; общий статус нельзя
   назвать «все проблемы AGY устранены» без native evidence пакета E.

### Readiness review — 2026-10-28

Независимо перепроверены A/B/C и D/E; выводы приняты после сверки основным
агентом с run-cli/output, issuer, control/shutdown, native qualification code.
Добавлены D12 и конкретные решения, которые первоначально отсутствовали:

- Недостаточно сохранить flags только в первом issuer: retention и public
  rendering/replay обязаны сохранить presentation, не меняя response-file authority.
- Human contract дополнен HITL pause/resume; один общий renderer вместо
  отдельного formatter каждого flow.
- Не существует approved environment-recovery receipt: текст --reason не даёт
  нового auto-follow-up. Не добавлять вымышленный grant/approval subsystem.
- Anti-repeat проверяется и при выдаче successor, с consumed input binding;
  controller не может доставить successor, который issuer ошибочно не создал.
- Physical fallback не исключает живой bridge молча; error path retire bridge,
  проверяет retained writer inventory и не фабрикует native execution phase.
- Расширена узкая inventory-version на реально значимые late-writer поля,
  не на всю БД/репозиторий/служебные timestamps.
- P3 не частичная: новый binary без полного текущего scoped proof не получает
  grant. Его live-приёмка явно отделена от реализации собственных исправлений.
- Добавлена engine→EVAL проверка capture-ready / cleanup-pending и конкретные
  negative cases; это замена слепых doubles, не ещё один полный gate.

## 8. Ponytail и readiness

- Причины разобраны по фактическому outcome/CLI/native/SQL, не по тексту последнего
  FAIL. Исправления в общих producers/consumers, а не отдельный костыль Luna.
- Удаление лишнего: Work-wide cap, legacy tree checks, mandatory dead-end native
  idle ACK, silent human output. Полезные гарантии закреплены у конкретных действий.
- Reuse: parseOutputOptions/publicInvocationCommand, lifecycle rows, control events,
  managedDaemonExecutionAbsent, nativeShutdownConfirmed, existing scoped tests.
- Нет нового scheduler, provider classifier, dependency, полного gate, глобального
  fingerprint или универсальной AGY-history surgery. Идемпотентность сохранена.
- Приняты решения по retries, presentation, unsupported child capability, ручной
  pause, unknown effect, owner replacement, late callback, physical cleanup и
  историческим receipts. Каждый пакет имеет positive/negative acceptance.
- На этапе readiness подтверждённые D1–D9,D11,D12 были готовы к реализации. D10 имеет явный маршрут
  проверки и честную внешнюю неопределённость; обновление AGY не объявлено
  доказанным исправлением заранее. При readiness review runtime/тесты/эвалы
  не запускались; последующая реализация и её проверки зафиксированы ниже.

## 9. Реализация и адресная приёмка — 2026-10-28

Engine source: `559d8130`, branch `fix/plan111-actionable-recovery`.
Это исходный кандидат, не новая опубликованная версия engine.

Реализованы A–D и E diagnostics; неподтверждённое исправление native backend AGY
не подменяется статусом tooling. Установленный AGY 1.4.9 не обновлялся и не
откатывался; live reproduction/P3 и новые EVAL не выполнялись. Текущие EVAL homes,
pins, канон и опубликованный engine этим изменением не заменяются.

- A/D12: реальные human/JSON CLI attempts, retention/presentation, scoped
  input binding и hook-only unknown-body — PASS (22 выбранных проверки,
  затем 10 адресных проверок после уточнений; пересекаются, не суммировать).
- B/C: child-repair — 22 PASS; public control CLI validator — 3 PASS;
  две выбранные accepted-SPECIFY dependency-ситуации — PASS. Обнаруженная
  гонка pause→конкурирующий stop исправлена: диагностика не входит в identity
  control, поздний observer не отменяет уже опубликованную техническую паузу.
- D: 30 выбранных проверок binding/inventory/shared shutdown/current ABI и
  physical observe→seal — PASS. Проверены exception, returned-unsettled,
  отдельный resource-RPC failure, сохранение старых unknown resources, поздний
  writer, живой PID при stopped handle и уже умерший retained local writer.
  Исходные outcome_unknown operations остаются unknown, semantic PASS не создаётся.
- E: chunked/unbound AGY_ERROR, safe metadata и прежняя overload identity —
  3 выбранных проверки PASS. Stderr без operation binding остаётся только note;
  оно не меняет verdict/classification/retry authority.
- EVAL: `node --test test/managed-flow-client.test.mjs` — 48 PASS;
  два выбранных capture/cleanup separation сценария — PASS. Sandbox EPERM
  при `ps` перепроверен с разрешённым read-only process inspection; лимиты
  времени не увеличивались и assertions не ослаблялись.
- Typecheck, сборка CLI и diff-check — PASS. Полный gate, GitHub CI, модельная
  Judge qualification и новые модельные запросы не выполнялись.

Ревью независимо разделённых изменений выполнено основным агентом; cross-review
controller/retirement дополнительно обнаружило returned-unsettled и resource-RPC
варианты D6, исправленные до фиксации результата.

## 10. Ревью реализации и интеграция — 2026-10-28

Ревью выявило и исправило шесть существенных пробелов, не замеченных первичной
адресной приёмкой:

1. Preparation refusal создавал successor без сохранённого successor ID.
   Добавлена durable связь; реальный issuer → completedChildRepair проходит.
2. Отказ подготовки происходил раньше retention фактического Work input:
   retry возвращал placeholder path/reason. Проверенные public semantics теперь
   сохраняются и при no-effect preparation rejection; foreign route не допускается.
3. Human output не показывал единственную инструкцию fresh-session handoff.
   Общий renderer выводит уже существующие recovery_instruction/work_id/
   handoff_required, не создавая нового решения о маршрутизации.
4. Несколько наблюдений одной технической паузы блокировали принятый Work либо
   стирали source в EVAL. Допускается один согласованный bound source среди
   неизменяемых событий exact control. Конфликт/чужая identity блокируют reconcile;
   новый control не наследует source предыдущего. История не переписывается.
5. Реальный AGY terminal task proof не совпадал с ожидаемым stop-RPC proof.
   Принимается существующий ordered terminal_source с daemon ownership;
   captureChildTools сохраняет owner после проверки transcript ancestry.
6. Native inventory baseline снимался после physical observation, допуская
   незамеченного позднего writer. Теперь baseline снимается до наблюдения,
   сверяется после и тем же значением защищает seal.

Регрессии воспроизвели дефекты до исправления. После исправлений PASS:
lifecycle 10 + issuer/controller 1 + renderer 3; engine technical-control 2;
EVAL technical-observer 10; managed-binding 9 и real physical observe/seal 2
(включая внедрённый late writer). AGY positive использует настоящий
Runtime.captureChildTools с локальным transcript, без RPC/модели.
Typecheck, финальная сборка и diff-check PASS; старые незатронутые группы
первичной приёмки повторно не запускались. Полного gate/CI/EVAL/model probes нет.

Engine reviewed source `8e4afa69` интегрирован squash PR
[155](https://github.com/deksden-com/dd-flow-cli/pull/155), main `b7555a74`;
дерево merge совпало с проверенным source. Нового выпуска или смены pins нет.
Native AGY 400/P3 остаются отдельной последующей живой приёмкой, не объявляются
исправленными только на основании обновлённого CLI или offline regressions.

Старые merged task branches/worktrees очищаются после проверки PR history,
содержимого и отсутствия активных EVAL. Нужные пакеты вынесены в стабильный
`/Users/deksden/Documents/_Projects/.cache/dd-flow-cli-deps-plan111`, прежние
зависимости сохранены отдельно. Ignored .tasks/.env старых checkout сохранены
в private archive `/Users/deksden/Documents/_Projects/.cache/worktree-retirement-20261028`.
Три orphan fake-AGY группы завершённых failed verification jobs остановлены
по exact PID/birth/cwd/group; исторические EVAL homes и результаты не менялись.
