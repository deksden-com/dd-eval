# 083 — CP226: native failure attribution и materialized evidence

Статус: реализация A–D завершена; новые EVAL и release не выполнялись.
Дата: 2026-10-13. Ponytail: full.

## Цель и границы

Правильно наблюдать, сохранять и оценивать техническое прерывание native
child; Judge оценивает материализованный результат, а не принимает authored
input за конечное состояние. Общая логика не зависит от harness/model.

Источник: CP226 EVAL-20261013123721-76ab3783, engine beta.134/b243f4d,
bridge 0.52.0/9c5ca6c. SPECIFY/PROTOCOLIZE/PLAN завершены; PLAN-REVIEW
прерван: WRK-009 native failed, пять reviewer Work completed.

Пользователь обновил ZCode. Native signer оставляем вне реализации: не
патчить bundle, не отключать signing, не менять concurrency, не добавлять
retry/restart workaround, не считать обновление доказанным исправлением.
Не исправлять продукт вручную. Исторические EVAL/БД/Judge не переписывать.
Release/pins/hooks/upstream update и живой E2E — отдельная последующая задача.

## Установленные дефекты и расширение аудита

1. Native log содержит ClientRequestSigningV4Error/disposed, но native SQLite
   сохраняет только model_request_failed/provider/unknown. Это upstream
   ограничение, не исправляемое чтением той же БД bridge. Не придумывать cause.
2. EVAL isInfrastructureFailure не рассматривает controller.error,
   primary_error/error и failures[].provider_error. Один пробел затрагивает
   report validity, failure attribution, infrastructure stop policy и status.
3. classifyInterruption распознаёт account/unavailable/timeout/session-budget,
   но infrastructure predicate не учитывает все эти категории. Generic и AGY
   ошибки одинакового смысла дают разные результаты. Подтверждено вызовом
   текущих функций на минимальных структурированных примерах.
4. failureDiagnostic теряет controller.error/primary_error/error. Классификация
   и Judge получают разные причинные цепочки; прямой failures[] сохраняется.
5. Fanout receipt выбирает правильные stage members, но сокращает native
   reconciliation receipt до Work/status/error/terminal time. Нужные для
   надёжной классификации source/harness/session/work-session связи надо
   сохранять из уже проверенного reconciliation, не угадывать по строке code.
6. Native отказ WRK-009 был известен 13:56:08 UTC; controller reconciliation
   произошёл 14:06:53 после завершения sibling 14:06:03. In-flight monitor
   проверяет lifecycle, native children согласуются после coordinator Turn.
   Ожидание здорового sibling само по себе не дефект; отсутствие раннего
   durable наблюдения отказа — недостаток наблюдаемости.
7. Judge заявил missing feature link по authored related_features=[] для
   feature.action=create. Frozen recovery/workspace содержит обе связи.
   vnext-protocolize stage-report.semantic.evidence указывает authored result,
   хотя changed_files содержит фактические материализованные документы.
8. Тесты 082 проверяли прямую safe projection, но не всю цепь до validity/stop;
   существующие provider tests проверяли category отдельно от infra predicate.

## A. Один ограниченный путь причинной классификации — dd-eval

Затронуты lib/runner.mjs: classifyInterruption, isInfrastructureFailure,
failureDiagnostic, failureAttribution, executionEvidence, buildReport,
infrastructureQueueStopped и execution failure policy. Проверить всех callers.

- В существующем модуле выделить небольшой helper выбора известных причинных
  узлов: cause, details.cause, details.primary_error, details.controller.error,
  details.error. Не сканировать произвольные поля Subject, текст и всю JSON.
- Использовать локальный образец selectFailedCheckGate из case-acceptance:
  ограничение глубины 12/узлов 256, защита циклов и неоднозначных причин.
  Совпадающая ссылка на один узел не считается двумя причинами; конфликт
  независимых primary nodes остаётся unassessable, не выбор первого массива.
- Primary error имеет приоритет над cleanup error; cleanup хранится отдельно.
  Lifecycle/storage/ownership primary не превращать в provider failure из-за
  вторичной вложенной сетевой ошибки. Не классифицировать по message regex.
- Fanout: использовать только typed native terminal receipt с доказанной
  принадлежностью RUN/stage/Work attempt/session/turn. Дополнить существующую
  safe receipt projection в engine нужными идентичностями (раздел B).
  Legacy CP226 без полного binding остаётся legacy/unconfirmed attribution;
  расследование доказывает его причину, но не создаёт новую runtime authority.
- Proven native failed outcome без подробного cause означает infrastructure
  interruption, concrete source/reason остаётся unknown. Failed Work без native
  proof, subject work.fail и settled_by_root не означают infrastructure.
  Cancellation пользователя не объявлять провайдерным дефектом.
- Account/unavailable/timeout/session-budget с typed evidence учитываются
  infrastructure predicate наравне с quota/rate/overload. Category != retry
  authority: никаких новых повторов, continuation/recovery/dispatch прав.
- Diagnostic сохраняет выбранные причинные узлы через существующие allowlists,
  не raw error tree. Depth overflow/conflict/missing proof показываются явно.
- Technical validity и Judge validity остаются отдельными оценками; report не
  копирует вердикт Judge. Исправить technical calculation, показать разногласие.

## B. Provenance и сохранение доступных native facts — engine / bridge

Engine: native-children.mjs, vnext-fanout.ts, controller-fanout.ts;
EVAL: failureDiagnostic и consumer из A. Bridge: retained-terminal.ts,
handlers/harness.ts и живой event путь только при наличии доступных facts.

- Переиспользовать safeNativeFailure; safe scalar identities ограничить типом,
  длиной и exact scope. Не вводить параллельный универсальный error framework.
- В failure receipt сохранить source=native_child_observation, harness_id,
  session_id, work_session_id, run/stage/current membership и terminal turn.
  Проверка ownership остаётся в engine; EVAL проверяет retained scope/binding.
- Проверить direct failure, retained child, controller wrapper и recovery
  projection: один смысл, одинаковые разрешённые поля, old snapshots readable.
- Не добывать первичную причину автоматическим сканированием глобальных логов,
  nearest timestamps, assistant prose или resume закрытого child.
- Если новая официальная версия даёт typed cause, сохранить только безопасный
  code/type/source через имеющийся контракт и регрессию. Пока не даёт — честный
  unknown; расширение под гипотетический формат не реализовывать заранее.
- Source=provider из native attribution маркировать как native-reported fact,
  а не доказанный сетевой факт. Фаза stream не доказывает HTTP отправку.

## C. Раннее наблюдение без конкурирующей orchestration — engine

run-controller.ts, controller-fanout.ts, adapters/retained inspection.

- Использовать existing retained topology/terminal inspection: только read-only
  наблюдение, без session load/resume и productive native calls.
- Во время активного coordinator Turn один single-flight observation; повтор
  после завершения предыдущего, существующий monitor cadence, no overlap.
- Полученный native terminal receipt durable сохраняется с exact scope. Отказ
  устанавливает dispatch fence; никакой новой работы/стадии до reconciliation.
- Не вызывать nextControllerFanout из interval: он может dispatch/mutate.
  Writer reconciliation выполнять на безопасной controller boundary с проверкой
  owner/generation. Не держать SQLite transaction на async inspect/journal I/O.
- Здоровому sibling дать завершиться; failure не считается успешным Work;
  pending checks/descendants соблюдаются. Отмена только по текущей stop policy.
- Поздние события старой generation/Turn игнорируются либо фиксируются как
  conflict, не применяются к новой попытке. На shutdown observer прекращается,
  in-flight task дренируется, receipt не пишется после ownership loss.
- Observation failure не маскируется success и не переносит activity timeout:
  heartbeat/polling не является сигналом продуктивной работы модели.
- Для harness без безопасного in-flight retained inspection сохранить явную
  post-turn наблюдаемость, без обещания одинаковой latency и нового fake API.

## D. Judge оценивает результат материализации — engine / EVAL

Engine: vnext-protocolize.ts stage report + materializeFeature/protocolMarkdown.
EVAL: judge packet/evidence builder, sealed boundary/recovery readers,
assessment instructions. Аудировать аналогичные SPECIFY/PLAN/review receipts.

- Дополнить существующий stage-report доказательствами output: созданные IDs,
  workspace-relative пути и фактические feature↔protocol связи. Authored result
  остаётся input evidence, не выдаётся за final docs. Новый pipeline не нужен.
- Использовать существующие changed_files и receipt, читать только нужные
  materialized документы из frozen boundary/recovery workspace manifest.
  Не брать original project вместо routed workspace, live mutable files вместо
  snapshot, path traversal/symlinks вне разрешённого capture.
- Детерминированно проверить existence и reciprocal links; create с пустым
  input list допустим, update/none и fanout-many проверять по реальному output.
  Уточнение native action enum: create/link/update/not_applicable; не вводить
  отдельное none. Проверять взаимность только связей, которыми владеет текущая
  материализация, не требовать её от всех произвольных related_features.
- Дать Judge проверенные facts и пути output. Missing input link != missing
  output link. Missing/недоступный snapshot означает evidence unavailable,
  а не автоматически missing product feature. Judge оценивает смысл/полноту.
- Не принуждать LLM к PASS и не заменять semantic review structural validator.
  Существующие verdict schema сохраняются; новую обязательную schema вводить
  только если текущий stage-report/evidence не способен выразить факты.
- Аналогичные места исправлять там, где input-only реально используется как
  output proof. Не создавать дополнительный receipt для каждой стадии без нужды.
  Аудит: SPECIFY уже публикует document/projection paths+hashes
  (vnext-specify.ts:535), PLAN — plans/aspect_maps/code_work_batch/checksum
  (vnext-plan.ts:167). Эти механизмы сохранить и использовать, не переписывать.
  mb-lint после материализации и case-acceptance PLAN/matrix ownership не
  заменяют точечную проверку resolved feature links на раннем interrupted RUN.
  Использовать optional semantic.materialization в существующем stage-report;
  сохранять legacy readers и проверять payload при normalization.

## E. Регрессии и приёмка

Минимальные обезличенные CP226-shaped fixtures, без полной БД/домашних путей,
prompt transcripts и секретов. Использовать существующие test frameworks.

1. Native fanout direct/wrapped → normalized facts → safe diagnostic → validity
   и обе stop-policy ветки. Account/unavailable/timeout/session-budget consistency.
2. Negative: business work.fail, plain fanout code, foreign RUN/Work/stage/turn,
   legacy без proof, stale attempt, cancelled/settled_by_root, conflicting causes,
   cycles/depth overflow; primary storage + secondary quota; separate cleanup.
3. Secret sentinels в raw message/header/body/cause не появляются в packets.
   Direct/retained/wrapped безопасные поля сохраняются одинаково.
4. Controlled fake event/clock: child failed while coordinator+sibling active;
   early receipt+fence, no extra dispatch, sibling completes, single-flight,
   shutdown/owner loss, no extra native session/resume, no nested async writer.
5. PROTOCOLIZE create empty input links + actual reciprocal links проходит;
   missing/broken reciprocal link выявляется; update/none/multiple protocols;
   sealed workspace != original project, path escape, unavailable snapshot.
6. Deterministic replay CP226 safe evidence опровергает missing-link hypothesis;
   historical Judge JSON остаётся неизменным. Не заявлять это новой LLM-приёмкой.

Порядок: B identity receipt → A shared classification/projection → D evidence
→ C observation → targeted suites → полный repo gate/typecheck/build/lint
по правилам каждого проекта. Проверить фактический inventory/provenance gates.
Реализация в свежих ветках от актуального main; пользовательские dirty trees и
расходящийся primary main не сбрасывать. Commit/push/merge — при разрешении
реализации. Эта задача создаёт только план, без release/новых EVAL.

## Ponytail и готовность

Не включены: native signing patch, automatic unknown retry, global log scanner,
новые зависимости, универсальный error bus, per-stage новый framework, перепись
исторических результатов. Используем существующие receipts, sanitizers,
bounded cause traversal, sealed capture и fanout reconciliation.

Основные решения, scope, provenance, backward compatibility, negative cases и
порядок приняты. Остаточное внешнее ограничение: native cause может отсутствовать;
план обеспечивает честное unknown, а не обещает восстановить потерянные данные.
Обновлённый ZCode проверяется позже отдельной живой приёмкой, не этой задачей.

## Readiness-review: принятые уточнения (2026-10-13)

### 1. Конкретный контракт native failure, не доверие к строке source

В существующем failure entry оставить Work/status/error/time и добавить
`native_binding`: schema_id=dd-flow/native-work-failure@1, project_id, run_id,
stage, parent_work_id, work_id, work_session_id, harness_id,
parent_provider_session_id, provider_session_id, terminal_turn_id,
controller_id, generation, stage_attempt_id. Все поля берутся из runtime
registries/current stage membership, не из текста результата Work.
Work attempt идентифицируется work_session_id; отдельный новый счётчик не нужен.

Receipt выдаёт engine только после exact association проверки из reconciliation.
Не принимать authored work.result с поддельным native_binding: engine сверяет
его с work_sessions/sessions и текущим controller/stage; EVAL — с сохранёнными
execution/controller/native observation facts в owned capture. Matching внутри
одного произвольного JSON не считается provenance. Нет proof — undetermined.
Stored session ID и provider session ID не взаимозаменяемы: использовать
существующий storageSessionId и зарегистрированное соответствие harness.

Raw native attribution остаётся `native_reported`; derived source для неясной
model_request_failed — harness/runtime unknown, не asserted provider outage.
Для инфраструктурной validity достаточно proven failed native execution;
конкретный exception/provider HTTP факт для этого не обязателен.

### 2. Однозначная семантика неопределённости

Не расширять enum run_validity и не объявлять unknown доказанной инфраструктурой.
Для legacy/unproven/conflicting evidence сохранять текущую техническую validity,
но execution failure attribution=undetermined и диагностическое объяснение
`native_failure_evidence_unconfirmed`; valid не означает attribution confirmed.
Новый typed receipt с conclusive owned native failure даёт
invalid_infrastructure_flow. Stop-on-infrastructure применяется только к этому
доказанному результату, не к unknown. Упавший отдельный execution в любом случае
остаётся failed; отсутствие infrastructure proof не разрешает его продолжить.
Judge verdict и технический verdict показывать рядом существующими полями,
разногласие описать в reportMarkdown; новую report schema не вводить.

### 3. Безопасный in-flight retained-only путь

Доисследование: inspectSessionWithBridge вызывает controlledIdentity и обычное
evidence; session.inspect может материализовать Session. Его НЕ использовать.
В daemon добавить узкую `session.observe-children` operation: только текущий
зарегистрированный root, без productive dispatch, controlledIdentity/resume,
session/read и child promotion в owned roots. Внутри переиспользовать
readZcodeSubagents(bridge, nativeRootId, existing observation budget, true).
Retained-only bridge methods уже есть; новой публичной bridge RPC не требуется.

Operation возвращает existing normalized subagent evidence плюс root/active
operation/generation. Она разрешена параллельно session.prompt, но не после
daemon stop fence. Capability фиксируется явно для ZCode adapter; прочие
адаптеры без такой capability остаются post-turn, не получают fake support.

Наблюдение запускается только для активной fanout stage, не для всех Turns.
Текущий 1s monitor tick запускает не более одного request; после завершения
следующий tick может начать следующий. Pagination revision изменился — discard
sample как incomplete, не failed child; на следующем tick повторить read-only.
Terminal metadata для уже сохранённого child+turn не читать заново. Known
terminal cache scoped root/generation, не глобальный и не inferred success.

Daemon/adapter journal сохраняет terminal fact до ACK; controller receipt event
дедуплицируется по root/generation/child/turn/outcome. Не писать RUN DB из timer.
Controller восстанавливает fence из owned durable observations после crash,
затем проверяет Work binding и применяет reconciliation на writer boundary.
Fence запрещает только новый dispatch, не останавливает работающий sibling и
не превращает native failure в Work result без reconciliation.

Пропавшая наблюдаемость отражается как observation gap; persistent loss следует
существующей observation-loss/stop policy, без нового idle/wall timeout.
Пагинация/опрос/запись observations не обновляют productive activity cursor.
Shutdown не ждёт бесконечно: существующий observation request budget/abort
прекращает request, затем writer/daemon generation fence запрещает late commit.

### 4. Materialization receipt: место, формат и crash boundary

Проверена actual schema: stage-report@2.semantic допускает additive fields.
PROTOCOLIZE сначала строит stage-report@1; renderer уже сохраняет semantic
при normalization, а generic stage builder перечисляет поля явно. Решение:
добавить optional semantic.materialization (schema_id
dd-flow/protocolize-materialization@1) и явный перенос/валидацию в normalization;
НЕ вводить sidecar file или новую stage-report version.

Payload: run_id, stage=protocolize, action=create/link/update/not_applicable,
feature_path|null, protocol_ids, authored_result ref, materialized document
refs {path,sha256}, owned link edges и structural check status. Paths
workspace-relative; authored_result имеет отдельный RUN-relative role/ref,
не смешивается с workspace. JSON roundtrip/renderer не теряют payload.

Факты вычисляются после publishProtocolizeIntent из published files до complete
Work/stage done. Проверку связи включить в существующий prepare/publish путь:
при ошибке не завершать Work раньше проверки. Crash после publication допускает
детерминированный replay intent; не выделять новый feature ID и не дублировать
links. Done stage replay читает принятый receipt, не переписывает его current
live state. Missing old receipt обозначается legacy unavailable.

EVAL выбирает для этой стадии sealed PROTOCOLIZE boundary, если он существует;
иначе sealed recovery workspace с точным run/stage receipt. Проверять snapshot
manifest hash и document refs существующими reader helpers. Более позднее
изменение документа не опровергает завершённую stage boundary; не смешивать
состояние разных timestamps. Evidence check statuses passed/failed/unavailable.
not_applicable: никаких owned feature edges, это допустимо; link/update
проверяют только edges, созданные/поддержанные текущей операцией.

Typed materialization summary добавляется в существующий evidence packet;
проверять actual packet schema и его разрешённые execution fields, расширить
optional field в текущей схеме/validator, сохранить legacy readers. Отсутствие
summary не трактовать как отсутствие output. Judge input-only inference
запрещён общими final Judge instructions для всех harness.

### 5. Дополнительные обязательные регрессии

- Подделанный source/native_binding в authored Work result не проходит;
  одинаковые IDs в foreign capture не являются ownership proof.
- Same native Session reused, новый work_session/current generation: late
  terminal не применяется к новой попытке; identity conflict остаётся explicit.
- Read-only observer while prompt pending: spies запрещают resume/read/load,
  productive calls; pagination churn, journal failure, daemon stop race и
  repeated terminal дают gap/один event, не success и не double failWork.
- Reconcile после observer fence сохраняет pending check/descendant barriers;
  completion sibling не снимает failure fence; CODE не начинается.
- Legacy stage-report@1 → normalized @2 сохраняет materialization payload;
  malformed optional payload не молча исчезает. Hash/path/scope mismatch
  возвращает unavailable/invalid evidence, не продуктовый missing-link.
- Crash между publish, verification и Work completion; replay uses same IDs;
  completed stage receipt неизменен. Source snapshot boundary vs поздний
  recovery mutation: Judge видит правильную stage evidence.
- Scope-limited link checks не требуют reciprocal edges от unrelated docs.

### Итог readiness

Убраны развилки «проверить schema потом», «inspect наверное read-only»,
«scope совпадает внутри receipt значит trusted», «unknown значит infra».
Реализация не требует решений о native signing, release, модели, concurrency
или новых EVAL. Внешняя неизвестность ZCode cause явно не блокирует A–D:
храним только наблюдаемые факты. Приёмка требует targeted regressions и gates,
а не обещания, что обновлённый ZCode уже исправил исходный signer defect.

## Реализация и проверка — 2026-10-13

- dd-flow: `f5f5b90`, `5e68b83`; dd-eval: `cc2beaa`, `1fcd472`, `7ed5e7b`.
  Ветки `fix/083-native-evidence` опубликованы в обоих репозиториях.
- Native failure authority проверяется по frozen registry, reconciliation
  timeline и фактическим retained native ответам, а не по authored флагам.
  Реализованы ZCode retained topology/terminal и Codex Desktop thread/read;
  неподдерживаемые или отсутствующие доказательства остаются unknown.
  Изменение execution, settlement или scope аннулирует проверенную authority.
- In-flight observer использует только advertised ZCode read-only capability.
  Failure fence переживает успешное завершение sibling; shutdown дожидается
  observer drain. Старые адаптеры сохраняют post-turn поведение.
- Materialization receipt фиксирует опубликованный результат отдельно от
  authored input. Judge reader проверяет accepted audit receipt в frozen БД,
  hashes, paths и только относящиеся к операции reciprocal edges.
  Completed PROTOCOLIZE replay не переиздаёт документы, не требует позднего
  live состояния и не откатывает PLAN/CODE/завершённый RUN.
- Проверки: typecheck, build, lint, release gate PASS; runtime-sensitive 46/46;
  fanout/observer 22/22; PROTOCOLIZE 27/27; native assets 83/83.
  Полный EVAL gate дважды: 809 PASS, 10 opt-in skips, 0 failures (819 total).
  Последняя защита authority cache отдельно: native-failure083 6/6 PASS.
- Широкий engine integration прогон: 138 файлов / 2382 теста PASS;
  один observer тест получил `drain is not a function`. Прогон был запущен
  во время реализации: worker загрузил прежний модуль до добавления drain,
  а тестовый файл уже содержал новую регрессию. Повтор всего observer файла
  на окончательном неизменном дереве: 4/4 PASS (3.56 s). Остальные изменённые
  suites также повторены на окончательном коде. Исходный широкий прогон
  формально не зелёный; это не заявляется как чистая release acceptance.
- В ходе общего gate исправлен `root` undefined в continuation: evalRoot
  передаётся явно. Также усилены audit custody и scope conflict проверки.
- Исторический CP226 не изменён. Read-only smoke для старого capture вернул
  `legacy_materialization_unavailable`, а не ложный missing-link.
  Native signer defect не исправлялся и обновление ZCode не квалифицировалось.
  Release/pins/hooks/живые EVAL остаются отдельной задачей.

## Ревью реализации — 2026-10-14

Полнота A–D проверена по producer → retained observation → controller
reconciliation → frozen capture → EVAL classification/Judge evidence.
Существенные найденные дефекты исправлены:

1. In-flight ZCode read передавал public provider ID вместо зарегистрированного
   adapter ID. Mock ранее не проверял аргумент запроса. Теперь distinct IDs
   проверяются явно; productive/native resume методы по-прежнему запрещены.
2. Authority cache не учитывал scope carrier, wrapper controller и schema ID.
   Изменения этих полей аннулируют подтверждение. Отсутствие поля отличается
   от null; невычислимая signature не даёт authority. Contradictory controller
   scope отвергается и при первичной проверке, не только после мутации.
3. Diagnostic повторно клонировал общие причинные узлы, что раздувало DAG.
   Проекция и infrastructure predicate посещают узел один раз. Predicate
   выровнен с общим пределом 12 причинных переходов; подтверждённая storage
   причина не теряется на прежней восьмиуровневой границе.
4. Native fact reader иначе нормализовал unsafe/empty error metadata, чем
   native-children@1 producer. Выровнены scalar filters, codexErrorInfo,
   attribution и пустые ошибки. Proven failed terminal без подробной причины
   остаётся подтверждённым; discarded prose/headers не становятся evidence.
5. Completed PROTOCOLIZE replay всё ещё требовал живую Git-ветку/worktree.
   Немутационный replay берёт route из принятого отчёта, не восстанавливает
   удалённый worktree и не выдаёт successor command. Active replay, который
   продвигает RUN к PLAN, сохраняет live route validation.
6. Console observation регрессия отстала от интегрированного health/progress
   контракта. Точное ожидание обновлено. Отдельный built-policy сбой оказался
   гонкой с build, а не дефектом policy: paired EVAL gate запускается после
   завершённой сборки engine; проверка dist/source parity не ослаблена.
7. Финальный integration gate воспроизвёл production publication race:
   controller.status=stop_target_reached был виден раньше pause и terminal
   event. Общий setStatus теперь атомарно публикует SQL status/audit event;
   terminal event включён в ту же транзакцию, pause подготовлен до неё.
   В транзакции нет async/native/FS работы. Stage-controller регрессия требует
   и durable terminal event, и paused RUN сразу после наблюдаемого status.

Целевые проверки: native/Judge/materialization 11/11; recovery/native 68/68;
capacity/console/health 19/19; полный PROTOCOLIZE файл 27/27, включая replay
после удаления worktree. Общий EVAL gate после исправлений: 819 PASS,
10 opt-in skips, 0 failures. Changeset добавлен без выпуска новой версии.

PR: dd-flow-cli #67, dd-eval #86. Dirty main и активные/уникальные наработки
других задач сохраняются. Новые EVAL, native signing patch, release, hooks
и pins не входят в это ревью.

Первый runtime-sensitive прогон имел один fail-closed отказ physical birth
observation до native dispatch. Guard не ослаблялся: подробная причина OS probe
не сохранена старым кодом и не объявляется доказанной. Три terminal variants
повторно PASS; полный runtime-sensitive на свежем main затем 46/46 PASS.
Старые failed gate logs сохранены вместе с финальными, не заменены success.

### Финальная верификация и integration

- dd-flow source `9ce25f8`, включая актуальный main `0704927`:
  typecheck/build/lint PASS, release build checks 2/2 и policy tests 8/8 PASS.
- Integration: четыре штатных shard, 141 файл, 2397 PASS
  (1053 + 584 + 391 + 369). После последнего controller publication fix
  четвёртый shard полностью повторён: 35 файлов / 369 PASS;
  controller core отдельно 55/55, stage-controller отдельно 26/26 PASS.
  Все семь стадий, repair, continuation и terminal cleanup покрыты.
- Runtime-sensitive после последнего исправления: 2 файла / 46 PASS.
- dd-eval runtime source `7bd5edf`, актуальный main `4deff58`:
  полный gate 829 tests, 819 PASS, 10 opt-in skips, 0 failures;
  native/Judge/materialization targeted 11/11 PASS.
- Логи до/после исправлений сохранены вне удаляемых worktree:
  `/private/tmp/dd-plan083-review.k3lHxK`. Это offline regression evidence,
  не release acceptance и не новая живая квалификация.
- PR #67/#86 интегрируются squash в origin/main по runbooks/git-workflow.md.
  Локальные main с чужими незавершёнными наработками не переписываются.
  Удаляются только merged refs 082/083 и неиспользуемые task worktree;
  open PR, dirty tree и qualified release sources сохраняются.
