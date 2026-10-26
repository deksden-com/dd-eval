# 107 — Принятый результат независимо от технического завершения упряжки

Статус: реализован; проверки затронутых зон пройдены. Итоги и границы приёмки: [107-implementation-report.md](107-implementation-report.md). Release/EVAL-приёмка отдельно.
Дата: 2026-10-26.
База исследования: dd-flow-cli `fe486595859b84327e9622fa7ad3d86a5ac7b89b`,
dd-eval `da67ce77688548b35eed8a3be0b81f91d95e289b` (origin/main).
Мотивирующий запуск: ZCode `EVAL-20261026052205-60ea8f42`, engine beta.152,
bridge 0.52.0/b18dfdb. Этот запуск старше интеграции плана 106.

## 1. Цель и границы

Принятие результата Work/Stage/RUN и техническое закрытие native-сессии — разные
факты. Принятый результат не аннулируется из-за stop/cleanup/служебной телеметрии.
Служебные затруднения публикуются в результатах как технические замечания.
Незавершённая содержательная работа и обязательные проверки не становятся PASS.

Общий контракт для Codex/Luna, ZCode, AGY, OpenCode, Grok; общий код включает и
Droid. Не чинить продукт, не запрашивать новую модель ради закрытия ресурсов.
Не добавлять decision-классификатор ошибок, обязательный replay всех native events,
новую БД, новый универсальный оркестратор или полную переквалификацию Judge.
Реализация, release, EVAL и изменение работающих процессов этим документом не
выполняются. GitHub CI и полный gate запрещены; будущие проверки — затронутые зоны.

## 2. Что обнаружено и перепроверено

Сначала выполнены независимые исследования admission, native/resource lifecycle и
EVAL; затем перепроверены основные ветви по исходникам origin/main. Поиск
shutdown/readiness/cleanup/observation/receipt охватил 40 файлов runtime/engine и
11 файлов EVAL; дополнительно проверены stage/Work ownership и packet assignment.
Это перечень изученных механизмов, не доказательство отсутствия любых других багов.

| ID | Место на исследованной базе | Проблема / решение |
| --- | --- | --- |
| D1 | lifecycle-invocations.ts:104,796,1756–1875; run-controller.ts:460 | Отсутствие native receipt за 30 с становится no_effect/recoverable:false и глобальным fatal. Для managed settlement использовать выданное назначение, не свежую live-доставку |
| D2 | run-cli.ts:1721,1730; work-registry.ts:155–170; hooks.ts:1235 | Второй независимый fresh PreToolUse guard завершения Work. Удаление только ожидания D1 не решает отказ; заменить обе проверки одним assigned-settlement admission |
| D3 | work-registry.ts:135–149; stage-lifecycle.ts:150–190 | У coordinator stage lifecycle аналогичная hook-зависимость. Разделить первоначальный запуск и дальнейшие операции принятого coordinator assignment |
| D4 | controller-fanout.ts:87; run-controller.ts:753–754 | Любой running/unknown ребёнок заставляет ждать, любой сохранённый failed блокирует переход, даже если соответствующий Work принят. Согласовать с уже Work-aware vnext-fanout.ts:281–287 |
| D5 | run-controller.ts:549–569,755–772 | Неудачный shutdown блокирует completed/stop_target_reached. Сохранить терминальный результат и независимо pending retirement |
| D6 | run-controller.ts:1088–1094 | После терминальной записи external Work daemon.stop может вызвать stopAfterFailure всего RUN. Отделить результат от очистки |
| D7 | run-controller.ts:326–328 | finally/finishManagedProcess может заменить успешный возврат ошибкой реестра. После принятия результата — secondary technical note |
| D8 | dd-opencode-daemon.mjs:375–385; run-controller-adapter.ts:125–128,211 | Потеря durable observation может скрыть уже принятый Work. Сначала сверка собственной DB; при отсутствии принятого результата не повторять неизвестный effect |
| D9 | judge-cleanup.mjs:53–72,169; runner.mjs:2322–2360,5598–5601 | Валидный Judge verdict не completed до полного shutdown. Разделить проверку verdict и resource retirement |
| D10 | hitl-retained.mjs:65 | Принятый канонический HITL-ответ повторно зависит от cleanup Judge. Убрать cleanup из допуска ответа, сохранить все content/scope bindings |
| D11 | baseline-admission.mjs:398–407,424 | Exit0 и остановленное execution-tree теряют PASS из-за finish ACK реестра. Bookkeeping error — замечание; не путать с живым writer |
| D12 | runner.mjs:2277–2282; completion-scope.mjs:80–91; runner-health.mjs:66,71,116 | Cleanup/capture/результат слиты в общий pending. Разделить work outcome, assessment evidence и cleanup; status не должен снова превращать completed в awaiting_cleanup |
| D13 | run-controller.ts:644,700–710,847 | Остались pre-dispatch/после-prompt observation fences и обязательный stop старой stage Session. Применить тот же Work-aware контракт и к этим ветвям |
| D14 | runner.mjs:4041,4051,4388,4401; specify-comparison.mjs:171–183 | Qualification producer/consumer и comparison продолжают требовать cleanup settled. Принятые samples переиспользовать, измерения завершать независимо от retirement |
| D15 | lifecycle-invocations.ts:766–791,877–911; run-cli.ts:599 | Retry/recovery successors не наследуют packet assignment; observeLifecycleCommand повторно требует native receipt. Обновить полную цепочку, не только первую admission |

В ZCode установлено: ребёнок действительно записал result-input и выполнил
work finish; invocation не получил event_key/identity_json. Первоначальная точка
потери live-события не доказана. Родительский replay не гарантирует восстановления
live-only child mirror. Обычный session/messages требует requireSession и не
гарантирован для ребёнка. Поэтому обязательное восстановление native history не
выбрано основным исправлением: оно сохраняло бы ненужную критическую зависимость.

## 3. Политика исходов — одно решение по фактам, не по тексту ошибки

| Факт | Поведение |
| --- | --- |
| Результат принят, ошибка закрытия/поздний provider error | Сохранить результат, technical note, cleanup отдельно |
| Результат ещё не принят, подтверждён no_effect | Ограниченное локальное восстановление текущего assignment, без повторного выполнения Work |
| Операция executing, effect неизвестен | Сверить существующую запись операции/Work; при невозможности пауза, не blind retry |
| Результата нет / проверки не пройдены | Существующий repair/ошибка работы; не маскировать предупреждением |
| Конкурирующий writer затрагивает следующий этап | Поставить на паузу только небезопасный переход, остановить/изолировать owned writer |
| Owner/generation действительно заменены | Запрет productive mutation под старым владельцем |
| Verdict/evidence/profile подменены | Результат не принят; это не cleanup warning |
| Только optional telemetry/диагностический capture отсутствует | Замечание, не причина провала |
| Нет обязательного стабильного evidence для оценки | Выполнение сохраняется; assessment pending/unavailable, не ложный PASS |

Не делать глобальное catch→warning и не классифицировать последствия regex текста
ошибки. Решение принимается у владельца операции по durable accepted result,
effect, текущему assignment и реальному конфликту ресурсов. Не выдавать нативный
ACK/сообщение «готово»/один файл за принятый результат.

## 4. Прямое принятие managed settlement

### 4.1 Выбранная авторизация без новой системы токенов

Повторно использовать существующие lifecycle_packet_assignments и WorkSession:
invocation → packet_sha256 → work_sessions.start_receipt_json.prompt_sha256.
Связь уже создаётся атомарно в work-registry.ts:835–850 и используется при
retireWorkPacketAuthorities в lifecycle-invocations.ts:1026. UUID сам по себе
недостаточен: текущий InvocationScope привязан к root, а не конкретному WorkSession.

Managed work finish/fail допускается напрямую, если:

- команда, операция, project/RUN/Work и fingerprint точно соответствуют назначению;
- packet относится ровно к одному текущему running WorkSession данного Work;
- start_publication_status = published, start/launch binding принят штатным путём;
- текущие generation, owner и operation scope действительны;
- входные данные проходят прежние schema/path/content/check/write-boundary guards.

Сделать отдельную ветвь admission в существующей awaitLifecycleInvocation и
process-local typed admission для run-cli/assertWorkLifecycleOwner. Использовать
атомарный issued→executing claim, не создавать фиктивные HookSessionIdentity,
hook_events или physical caller evidence. Подготовка до claim, I/O не переносить
в SQLite transaction. При гонке finish/fail одного Work только один terminal
commit; повтор committed invocation возвращает сохранённый результат без checks.

Но per-invocation CAS недостаточно: finish и fail имеют разные ID. В той же короткой
write transaction перед claim проверить, что для текущего WorkSession нет другого
executing terminal assignment (через existing packet join), и зарезервировать
settlement до запуска checks/публикации. Второй вызов наблюдает сохранённую первую
попытку и получает pending/reconciliation, не запускает checks и не превращает
конкуренцию в fatal. Отклонённая без эффекта попытка освобождает reservation через
settled outcome; crashed executing owner сначала reconcile, не blind takeover.
Перед terminal commit повторно проверить WorkSession/owner/generation: начатые
раньше проверки не дают права коммитить после смены владельца.
Coordinator stage finish/pause/resume, меняющие ту же WorkSession, входят в ту же
взаимоисключающую reservation. Внутренний вызов settlement из stage finish использует
уже принятую invocation, не пытается захватить собственную reservation второй раз.

Третий hook guard — observeLifecycleCommand (run-cli.ts:599 и
lifecycle-invocations.ts:445–454). Для typed managed admission завершение и ошибка
пишутся в уже существующую invocation outcome + RUN audit, не через обязательный
hook anchor. Ветви retry/error notification/checkOutcomes должны читать этот же
outcome. Native hook, если пришёл, остаётся optional корреляцией и не создаёт
второй результат. Не молча отключать учёт обязательных ошибок вместе с observer.

Admission result — discriminated union native_hook / managed_assignment, а не
обязательный eventKey. Для managed ветви CLI не добавляет --hook-event-id и не
читает null identity_json как native array. Durable источник assigned admission
хранить в nullable admission_json существующей lifecycle_invocations (additive
storage migration): kind, WorkSession/controller binding, generation/target,
executor pid/birth/admitted_at. Legacy null означает прежний native путь, не
автоматическое разрешение. Live hook, пришедший позже, не переводит executing
обратно в observed, не заменяет assignment и не создаёт fatal из отсутствующего
eventKey. После рестарта эта запись служит для reconciliation, но сама не выдаёт
новому процессу physical launch authority/currentLifecycleAdmission.
Зафиксировать schema_id=dd-flow/assigned-lifecycle-admission@1,
kind=managed_assignment; admission_json пишется вместе с atomic claim/reservation.
Snapshot/capture/restore переносит новое поле; missing/null старой истории остаётся
native-only. PID/birth — сведения для сверки, не право takeover по одному исчезшему PID.

Public команды могут не содержать invocation UUID. Resolver использует точное
текущее assignment/target/operation в проверенном scope: один кандидат — resolve,
несколько — explicit ambiguity, ни одного — no authority. Не требовать отсутствующее
live event для такого lookup и не выбирать global latest. Сохранить штатные alias/
canonical argv rules; новый parser не добавлять.
Exact settled replay после проверки соответствия сохранённой команде обрабатывается
до требований current-running WorkSession/owner: read-only ответ остаётся доступным
после cleanup и смены generation. Это не разрешает новую мутацию старой authority.

Граница принятия — durable terminal commit Work/WorkSession после валидации и
обязательных checks; stdout ACK не является этой границей. Если после commit
сломалась публикация result-файла, сначала materializePendingWorkResults из
сохранённых bytes/receipt, не повторять Work/checks. Обязательный отсутствующий
artifact блокирует только его потребителя/assessment; optional dashboard/audit
projection даёт замечание. Для настоящего отсутствующего DB commit — unknown,
а не предположение об успехе.

Граница доверия: разрешается сдать результат назначенного Work; не утверждается,
какой физический агент набрал команду. Same-user environment/DB не являются
защитой от злоумышленника с теми же правами. Native launch/fresh reviewer evidence
остаётся доказательством независимого исполнения на старте. Ни CLI env, ни один
UUID не становятся заменой такой launch-проверки.

### 4.2 Покрыть другие lifecycle-команды, не оставить скрытый второй gate

В run-cli.ts:562 проходит общий dispatch; второй await caller в
run-controller.ts:597 восстанавливает committed HITL resume — сохранить его
reconciliation, не повторять уже применённый ответ.

Для managed stage start использовать уже существующую native session/create
receipt контроллера (run-controller.ts:840–879), а не новое live tool-событие:
session.id, native provider SID из managed daemon mapping, frozen profile, cwd,
owner/generation, exact stage/context hash/attempt. Сохранить связь invocation с
controller Session при выдаче stage packet. В stage-lifecycle/bindStageCoordinatorWork
передавать typed controller launch binding, не синтетическую HookSessionIdentity.
Это сохраняет launch evidence, но не требует повторного доказательства через hook.
Отсутствие самой create/launch receipt даёт bounded reconciliation/pause, не
новый дублирующий запуск и не доверие одному env/UUID.
Lazy session/create может вернуть только ACP locator. До issuance использовать
существующий no-model resolve/materialize API, сохранить provider SID/root mapping
и затем managedInvocationContext. Не отправлять модельный prompt ради identity.
Frozen/configured profile — ожидаемая настройка/ACK, не выдуманное наблюдение модели;
actual profile фиксируется обычным путём, когда native действительно его сообщил.
Для managed coordinator stage finish/pause/resume использовать stage packet
assignment + уже bound coordinator WorkSession, current attempt/cycle/generation.
Если конкретный issuance path не хранит packet relation — добавить её в существующую
таблицу assignments в точке публикации, не угадывать owner по latest Session.
Resume дополнительно привязан к pause и accepted answer; replay не применяет его
дважды. Операции без managed assignment сохраняют явный manual/native путь.

Auxiliary scope сейчас не является invocation capability. Его точный inventory
в lifecycle-command.mjs:112–120: work repair add и stage block. Обе мутируют:
допуск только по конкретной операции/target из packet текущего coordinator
WorkSession с RUN/project/stage/generation и repair contract. Сохранить requestKey
и идемпотентность регистрации. При публикации добавить недостающую связь в existing
assignments; не авторизовать семейство команд целиком из root env. Read-only
status/list здесь не участвуют и не требуют mutation receipt. Memory batch
registration сохраняет assignment/write-authority/custody. diagnostic-start имеет
отдельную provenance admission; её не удалять по аналогии с live receipt.

Child Work start и независимые reviewer/fork/memory repair launch продолжают доказывать
native identity/freshness, workspace и profile. Не распространять terminal
admission на currentLifecycleAdmission в physical memory repair launch. Изменить
вызывающие ветви согласованно; не удалять полезные проверки fresh запуска.

Обязательные typed-binding consumers, помимо общего guard: vnext-specify.ts:137,
vnext-protocolize.ts:154, work-registry.ts:675+ (bindStageCoordinatorWork),
stage-pause.ts:113,145–151 (claim resume и rebind WorkSession). Эти функции сейчас
прямо читают hookSessionIdentity. Managed ветвь получает проверенный controller/
assignment binding; manual/native ветвь сохраняет HookSessionIdentity.
Если resume меняет coordinator, новая WorkSession получает собственную сохранённую
start/assignment receipt с текущим launch binding и ссылкой на исходный packet/
предыдущую WorkSession; старую строку и prompt bytes не переписывать. Не копировать
только prompt_path без start_receipt/publication: иначе direct finish не сможет
проверить законное продолжение. Same-session resume не создаёт лишнего исполнителя.

### 4.3 Ошибки и совместимость

Отсутствие post-start tool events больше не вызывает receipt timeout у managed
settlement. Старые issued packets без однозначной связи не авторизовать эвристикой:
штатная bounded reconciliation/pause с конкретной причиной. Исторические FAIL не
переписывать; expired попытку не оживлять. Если старый timeout имеет no_effect,
controller может выдать successor текущего assignment один раз после сверки;
не повторять исходный Work и не сбрасывать retry budget. Неподтверждённый executing
outcome остаётся reconciliation, не no_effect.

SuccessorLifecycleInvocationCommand и recoverLifecycleCommands должны атомарно
выдавать successor вместе с его assignment relation. В пределах текущей WorkSession
наследуется точная predecessor packet relation, не latest matching command. При
смене recovery generation создаётся relation к явно принятому текущему recovery
segment/WorkSession; старая authority остаётся stale. Поправка argv/check retry,
кооперативный drain и несколько последовательных recoveries не теряют привязку.
Если committed effect уже есть — replay; если executing — reconcile. Не выпускать
successor из одного совпадения fingerprint старой сессии.

## 5. Native lifecycle и ресурсное завершение

Не ослаблять nativeShutdownConfirmed: он и далее означает реальную полную очистку.
Не подделывать native_settled/clean/stopped. Убрать зависимость semantic completion
от этой функции в потребителях. Общий контроллер применяет policy раздела 3.

В controller-fanout и failed-child fence связывать ребёнка с WorkSession и текущим
Work. Native error после accepted Work — заметка, не capacity retry и не repair.
Для непринятого Work использовать существующие continuation/repair правила.
Известные historical links отличать от unbound/ambiguous/parent mismatch.

Перед зависимым запуском обеспечить отсутствие конфликтующей записи, но не требовать
смерти всех daemon. Использовать существующие признаки read_only/support_service/
schedule, workspace/Work role и ownership; не парсить естественный язык статуса.
Одна декларация read_only в prompt не доказывает изоляцию: использовать принятый
execution workspace, фактические ограничения и доступы. При отсутствии такой
гарантии считать возможную запись неизвестной, а не безопасной.
Неизвестный writer в общем workspace не считать безопасным. Остановить только
точно owned execution/process group с проверкой incarnation либо использовать
уже принятый изолированный immutable input. Пока это не доказано — пауза перехода,
принятый результат не аннулировать. Не добавлять новый механизм sandbox ради плана.
Если реально изменились входы будущей проверки или accepted snapshot, это отдельный
факт изменения кандидата: не переиспользовать старый PASS для новых bytes. История
принятого результата сохраняется, текущая пригодность evidence проверяется штатно.

Для completed RUN и stop_after результат фиксировать независимо от retirement.
Попытка очистки ограничена существующим cleanup budget и не держит terminal
completion до бесконечности. External Work stop и finishOwner finally применяют
ту же политику. Существующий первичный сбой не заменяется cleanup exception.

Контуры: AGY schedules/services; ZCode child tree; Codex/Luna native tree;
OpenCode profile/idle/durable observation; Grok refreshTree; Droid shared daemon.
Адаптеры продолжают честно сообщать состояние. Ошибка cwd/profile во время реальной
работы не превращается в предупреждение только из-за её harness-происхождения.
Если durable observation потеряна, сначала принять во внимание существующий
engine Work commit; без него неизвестные native effects не повторять вслепую.

### 5.1 Область принятого результата и все поздние guards

Не поглощать ошибку prompt по признаку «какой-то Work завершён». Перед dispatch
сохранять в existing run_controller_operations.input_json точные ожидаемые targets
из текущего packet/graph: RUN/generation/stage/attempt/cycle, WorkSession/Work IDs,
pause/answer для HITL, действие entry/dispatch/finish. Не создавать новый graph.
После observation gap сверять именно их durable progress. Для entry достаточно
принятого stage/coordinator start; для finish нужен принятый Stage result; для
child — конкретный Work. A completed не доказывает принятие B из того же prompt.
Оставшиеся targets продолжать существующим графом после сверки эффекта, не повторяя
принятые. Если весь ожидаемый boundary принят — поздний native error лишь note.

Применить это в controller pre-dispatch failed fence (:644), после-prompt gap
(:700–710), advancement fence (:754), adapter observation recovery и capacity
ветвях. No-result/unknown effects требуют reconciliation, а не молчаливого continue.
Capacity retries сохраняются для действительно незавершённого назначения; ошибка
провайдера после принятого boundary не создаёт новый Turn.

В stage transition (:847) убрать безусловную зависимость новой Session от clean
stop старой. Сначала отозвать старые productive assignments, сохранить результат
и долг очистки. Новый отдельный state-dir/session создавать только после
исключения конфликтующего writer; never reuse старого dir. Простая живая bridge
без продуктивного writer сама по себе не запрещает переход.

### 5.2 Законное продолжение технической паузы

После одной штатной bounded stop/reconcile попытки можно продолжать независимые
готовые Work. Если безопасного dispatch больше нет и writer conflict остался,
использовать existing requestRunControl(action=pause, waitMs=0), а не stopAfterFailure:
сохранить dependency reason и текущий control_id, не отмечать semantic FAIL.
Пока settlement/capture не получены, status честно показывает control pending/
blocked. После устранения конфликта existing run control reconcile завершает
seal/capture, затем run control resume --from <control_id> возобновляет тот же RUN.
ResumeRunController требует sealed/settled capture — это требование сохраняется;
не обещать resume до него. Не повторять pause request под новым ID при каждом poll:
requestKey строится из controller/generation/dependency boundary. Терминальному
RUN такой control не нужен: только resource cleanup, без resurrection.

## 6. Технические замечания и отложенная очистка

Использовать текущие RUN timeline/audit events и EVAL events, добавить необязательную
проекцию technical_notes в status/report.json/report.md. Не делать отдельную БД,
службу предупреждений или новый набор терминальных статусов.

Минимальная запись: code/message, phase, harness, RUN/EVAL, generation, Work/Stage,
source operation, resource identity (если есть), first_seen/last_seen,
state=open|resolved, consequence (none|cleanup_pending|dependency_blocked),
bounded diagnostic reference. Дедупликация по scope/generation/operation/code/
resource, resolution — отдельное событие, не изменение исходного принятого result.
Секреты/env/raw transcript в заметки не копировать.

Недоступность записи замечания не должна заменить успешный result новым exception:
использовать существующий stderr/secondary diagnostic fallback; при недоступной
основной БД нельзя заявлять, что result committed. После перезапуска проекция
восстанавливается из durable events. Outcome/candidate content hash не зависит
от поздних cleanup замечаний; report revision может меняться, verdict не вызывать
повторно. Schema closed consumers обновить согласованно, historical readers
принимают отсутствие technical_notes как пустой список.

Cleanup debt хранить в существующих process/daemon/control records и событиях.
Перед следующим конфликтующим запуском обслужить owned leftovers; не останавливать
работающие чужие EVAL. Не освобождать port/lease claim и не переиспользовать state
directory, пока ресурс не доказан retired. PID reuse, смена owner или поколения
запрещает kill по старой записи. Срок хранения данных не равен разрешению kill.
Resource reaper не продолжает модель и не возобновляет semantic Work.
Речь о reservation живого ресурса, а не о productive controller/RUN lease:
терминальный semantic owner освобождается штатно. Cleanup не продлевает его
полномочия и не держит глобальный dispatch; долг имеет существующего технического
resource owner и блокирует только конфликтующее переиспользование.

Точный cleanup путь: пока старый owner действителен — stopManagedProcess с его
существующим token; после его смерти/разрешённого expiry takeover — существующие
claimExpiredManagedProcesses/reconcileExpiredManagedProcesses с CAS и incarnation
проверкой. Сам истёкший lease не доказывает смерть процесса и не разрешает kill
ресурса нового владельца. Pending debt ссылается на исходный process/daemon,
его runtime/resource home и stop operation; не создавать абстрактного нового owner.
После reclaim использовать новый штатный token. При текущем чужом owner —
замечание/конфликт, не takeover. GC (storage.mjs:97–103) сохраняет ownership
records/артефакты до доказанной очистки; terminal outcome не разрешает их удалить.

### 6.1 Замечания не меняют семантические hashes

Использовать явные event types technical_note_recorded/technical_note_resolved
(в EVAL — dev.dd.eval.technical_note.*), а operation хранить как source_operation_id.
SubjectHistoryEvents сейчас включает любое событие с launch/recover operation_id;
новые технические types явно исключить из него и semantic result revision даже
при наличии operation correlation. Не добавлять заметки/поздние cleanup updates
в executionState.result, candidateExecution.recovery/incomplete_evidence или
сохранённый Judge evidence.json. Это отдельная mutable report/status projection.
Candidate hash, subject_history_sha256, assessment input/evidence hash и число
model calls одинаковы до/после note и resolution. Reliability сохраняет смысл
interruption/recovery выполнения; retry очистки не делает uninterrupted→recovered.
Техническое состояние видно в technical_notes/observability, без новой метрики
или наказания semantic verdict за ресурсную ошибку.

## 7. EVAL, Judge, baseline и capture

Разделить assertJudgeCleanup на принятие verdict/evidence/profile/session и
независимое наблюдение cleanup. Final Judge и HITL используют первый результат,
даже если остановка Judge не удалась. Изменить runner, hitl-retained,
runner-health и completed publication guards: accepted verdict не переоценивается
моделью и не перестаёт быть completed из-за resource stop.
Включить supplemental interaction rejudge (runner.mjs:5049), где cleanupError
также сейчас даёт judge_status=failed. Повтор модели ради cleanup запрещён и здесь.
Split validator может прочитать исторический verdict с валидными bindings,
независимо от старого cleanup failure; не переписывать старые outcomes/receipts
и не повышать версию старого shutdown proof задним числом.

Та же split validation применяется к qualification producer и consumer:
assertHitlQualification/verifyQualificationSample (:4041/4051), запись native sample
(:4388) и qualification receipt (:4401). Проверять oracle/content/native-chain/
context/profile и identity независимо от retirement. Existing @4 identity/key
не менять из-за этой policy: не требовать нового полного модельного корпуса.
Новые samples/qualification сохраняют честный cleanup snapshot (возможен pending)
в момент неизменяемой записи; последующее resolution только техническим событием.
Старые passed receipts читаются без переписывания bytes/hash; старый sample,
сохранённый при cleanup error, можно детерминированно принять после обычной
проверки содержания/ожиданий, не объявляя ранее failed qualification прошедшей
без такой проверки. Недостающий native sample не выдумывать.

У baseline после exit0 и доказанной остановки command execution tree ошибка
registry finish ACK — заметка. Admission до продуктивного исполнения и отсутствие
конкурирующего writer в переиспользуемом test-world сохраняются. В verification
receipts отдельно отразить физический stop и bookkeeping; не подставлять settled
вместо неизвестного cleanup.

Совместимость baseline — additive поле execution_settlement в существующих
@1/@2 checks и их split @3 references, без изменения policy/fixture execution key.
Только доверенный producer пишет state=settled после actual owned process-tree
observation; сохраняет process_id/pid/incarnation и observed_at из существующей
ownership записи. Registry bookkeeping остаётся в cleanup и может быть pending.
Один общий predicate используется verifyBaselineAdmission (включая :424/:441)
и revalidateFixtureResult (:151): новый валидный physical proof ИЛИ историческое
cleanup=settled по старому контракту. Старое unknown без physical proof не PASS.
Не модифицировать старую квитанцию, не повторять весь fixture suite ради нового
поля; только затронутая проверка/readback, если старого доказательства недостаточно.

В runner/completion-scope/snapshot-observation отделить выполнение, assessment и
retirement. Стабильный принятый candidate + обязательные evidence допускают Judge
при pending resource cleanup. Optional failure capture — заметка. Отсутствие
обязательного evidence означает assessment pending/unavailable, не PASS и не
переписывание принятого Work в failed. При возможном writer нельзя считать mutable
workspace стабильным snapshot: сначала остановка/изоляция или уже опубликованный
принятый immutable artifact. Исторические cancellation после accepted candidate
уже не отменяют его в execution-state reducer; сохранить и переиспользовать это.
Проекция: execution_state сохраняет accepted outcome; cleanup_state независимо
pending/blocked/settled; judge_status=completed только для валидного verdict;
assessment_state=completed|pending|unavailable|not_requested — отдельное optional
поле отчёта (historical отсутствие выводится из прежних полей). Overall outcome
не становится pending только из-за cleanup. Отсутствующее обязательное evidence
не позволяет заявить scored PASS: assessment_state=unavailable или pending при
идущем capture, а execution_state остаётся completed. Terminal не означает clean.
Если configured Judge не запущен именно из-за отсутствия обязательного evidence,
judge_status=not_run_incomplete_evidence (добавить в enum consumers), а не failed
или вечный in_progress. assessment_state=pending только при существующем активном
capture/assessment owner; иначе unavailable. При disabled Judge использовать
not_requested, не запускать его ради нового поля. Case acceptance и model verdict
остаются отдельными существующими фактами, не выводятся из cleanup.
Технические замечания видимы в reliability/observability отчёта, но не являются
автоматическим product FAIL или основанием нового Judge-вызова. Если содержательная
ошибка уже принята Judge, cleanup её также не превращает в PASS.

Specify-comparison.mjs:171–183 принимает finished/target_reached измерение с notes,
не ждёт cleanup_state=settled. Перед следующим последовательным вариантом отдельно
проверяет конфликт ресурсов; при конфликте сохраняет уже полученный sample и
объяснимую паузу, не объявляет sample failed/не перезапускает модель. Attention/
health/terminal readers должны использовать одну согласованную проекцию, а не
восстанавливать старый cleanup gate по отсутствию Judge или виду заметки.

Новый план явно заменяет требования 099/100 «полная очистка как условие acceptance»
в описанных post-result случаях. Не отменяет полную очистку как условие clean
shutdown и безопасного повторного использования ресурсов. Правила 106 о settlement
самого test execution перед мутирующим repair сохраняются.

## 8. Порядок реализации и затронутые зоны

1. Зафиксировать policy/technical notes contracts и маленькие регрессии: accepted
   result + cleanup failure; lost native event после принятого Work start.
2. Engine assigned settlement: lifecycle-invocations, run-cli, work-registry,
   hooks consumers, stage-lifecycle/issuance, memory/diagnostic callers. Обновить
   общий prompt/canon: результат считается сданным по dd-flow, не native карточке;
   после finish агент прекращает работу, не пытается повторно закрывать Work.
3. Controller/fanout: Work-aware child outcomes, terminal/external/finally cleanup,
   existing resource debt. Не менять проверку clean в низкоуровневых адаптерах.
4. EVAL: Judge/HITL split, baseline bookkeeping, independent projections/status,
   technical_notes schemas/reporting и operational runbook.
5. Проверить все callers старых guards и ветви всех harnesses; удалить ненужные
   ожидания/тесты, существовавшие только ради fresh terminal receipt. Не удалять
   native observation целиком: это диагностика и launch evidence.
6. Только затронутые unit/contract/integration группы, без paid model/full gate/CI.
   Build затронутого пакета — при изменении runtime assets. Коммит/пуш/мерж и
   release/EVAL требуют отдельного этапа/разрешения, не выполняются планированием.

Зоны точечной проверки: engine lifecycle-invocations, stage-lifecycle-ownership,
controller-child-observer, run-controller-state/stages/adapter и controller-resume-
preparation; EVAL judge-cleanup (включая legacy), hitl-retained, qualification-
recovery/intent, baseline-admission, completion-scope, runner-health и
specify-comparison. Дополнять существующие файлы/fixtures, выбирать затронутые
контракты через действующую impact policy; не превращать этот список в обязательный
полный прогон каждого большого файла. Одна public-CLI integration регрессия должна
пройти start → finish с потерянным stream, чтобы unit mocks не скрыли третий guard.

## 9. Минимальная приёмка реализации

- Work start с реальным launch binding, все следующие native events потеряны:
  valid finish принимается без ожидания receipt; fail также не зависит от stream.
- Stage entry использует сохранённую controller session/create identity без
  нового hook; её отсутствие даёт bounded pause. Stage finish/pause/resume не зависят от stream;
  auxiliary permit ограничен конкретной операцией/target; HITL не применяется дважды.
- Wrong stage attempt/context hash/controller Session/generation отклоняются,
  даже если CLI env выглядит правильным. work repair add/stage block без live
  receipt разрешены только текущему coordinator assignment; повтор requestKey
  оставляет ровно один repair Work.
- Exact replay не повторяет checks/effects; конкурентные finish/fail дают один
  terminal commit. Старый packet после retry/new generation отклонён.
- Два разных terminal invocation-ID одного WorkSession не запускают параллельные
  checks; crashed reservation не захватывается вслепую. Generation меняется во
  время checks — старый executor не коммитит. DB commit + потерянный stdout/файл
  восстанавливает ответ/публикацию без новой проверки.
- Admission_json проходит storage migration и snapshot/restore roundtrip; legacy
  null не включает direct admission. Поздний hook до/после direct claim не меняет
  результат; exact settled replay после смены поколения не требует живого owner.
- Correction/check retry/cooperative drain/multi-generation recovery сохраняют
  точную assignment lineage; новый coordinator при resume имеет полноценную
  опубликованную receipt, а retired WorkSession не получает новую authority.
- Wrong Work/project/session assignment, ambiguous packet, unpublished receipt,
  malformed result, missing required file и failed check не получают PASS.
- Fresh reviewer/memory repair launch нельзя обойти terminal admission.
- Completed Work + native failed/running/unknown: note, не repair; конфликтующий
  writer блокирует только зависимый запуск, изолированный read-only — не блокирует.
- Completed RUN/stop_after/external Work + daemon stop timeout/registry finish
  failure сохраняют outcome и видимый cleanup_pending. Failure primary сохранён.
- Один prompt содержит A и B: accepted A не скрывает незавершённый B. Принятый
  boundary + post-turn observer gap не даёт fatal. Смена stage Session с failed
  stop не блокирует безопасную замену и не допускает конфликтующего writer.
- OpenCode observation write fail: accepted engine Work сохраняется; без commit
  эффект сверяется, не выполняется повторно.
- Final Judge и native HITL verdict + stop failure принимаются, заметка видима;
  corrupt evidence/profile/candidate всё ещё запрещают acceptance.
- Supplemental interaction verdict + cleanup failure также принимается без нового
  Judge-вызова; историческая cleanup запись остаётся неизменной и честной.
- Qualification native sample с корректным verdict и cleanup pending повторно
  используется без model calls; missing/corrupt native sample не принимается.
- Baseline exit0 + физически stopped + registry finish failure сохраняет baseline;
  неизвестный writer запрещает конфликтующее переиспользование test-world.
- Optional capture fail не запрещает оценку стабильного candidate; отсутствие
  обязательного evidence оставляет assessment unavailable, не ложный PASS.
- Note/resolution не меняют result revision/candidate/history/Judge evidence hashes
  и число Judge calls. SPECIFY comparison завершает измерение при pending cleanup.
- Реальный writer conflict после bounded recovery идёт через pause/reconcile/
  resume текущего control_id; resume до settled capture запрещён, не требуется
  новая EVAL или повтор принятых Work.
- Restart, duplicate notes, resolved cleanup, старое поколение, PID reuse и
  недоступность warning persistence не меняют accepted outcome/не убивают чужое.
- Semantic owner завершается при cleanup_pending; технический reaper не возобновляет
  его lease, ресурсная reservation запрещает только конфликтующее использование.
- Параметризованные shared contract doubles для Luna/Codex, ZCode, AGY, OpenCode,
  Grok и Droid; не шесть полных модельных E2E ради общей ветви policy.

## 10. Readiness / ponytail review

Выбран один путь: существующее assigned settlement вместо обязательного live
receipt, существующие timeline/resource records вместо нового recovery framework.
Результат, provenance, ресурсы и оценка не объединены в один булевый clean.
Число native retries/таймаут не используется как «исправление» отсутствующего
события. Не добавляются regex семантических ошибок или decision calls.

Перед снятием guard разработчик обязан доказать persisted assignment на каждом
issuance path; отсутствие связи — конкретная доработка этого path, не повод
переходить к latest/session/env эвристике. Это acceptance requirement, а не оставленный
продуктовый выбор. Миграция старой истории не нужна; строгая явная reconciliation
для неподдерживаемых старых packets сохраняется. Главный риск — незамеченный второй
guard или blanket status projection; обе категории включены в scope и регрессии.

План готов к реализации с указанными invariants и критериями. До выполнения
регрессий не утверждается, что новое поведение уже работает. Причина первоначального
обрыва live stream не объявляется доказанной и не нужна как prerequisite: новая
граница принятия результата должна переживать любой такой обрыв.
