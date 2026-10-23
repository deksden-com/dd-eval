# 099 — Execution readiness отдельно от resource retirement

Статус: код реализован; детерминированная приёмка описана в
[implementation report](099-implementation-report.md). Live AGY P3 остаётся
отдельным непрошедшим gate; qualification blocker не снят.
Дата: 2026-10-23. Новые EVAL, native-пробы, release и изменения hooks/pins
в рамках подготовки этого плана запрещены.

## 1. Цель и установленная причина

Агент может закончить обязательную работу, оставив сервер для browser acceptance.
Нельзя ни задерживать переход стадии до остановки этого сервера, ни выдавать
готовность агента за доказательство очистки всех ресурсов.

В AGY 1.4.6 реально наблюдались native idle + aggregate SUCCESS при живом
`run_command(IsDaemon=true)`. Обычная фоновая команда, напротив, удерживала idle
до завершения и доставки результата. Это согласуется с назначением daemon-команд
в [официальном SDK](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/types.py).
Полные факты, ограничения и хеши: [098 native result](098-agy-p3-native-146-result.md).

Доказанный дефект — избыточная гарантия qualification `persistent_background`:
она требует busy там, где native API законно подтверждает готовность исполнения.
Это не основание объявить ошибкой AGY или просто убрать проверку pending.
В общем коде уже есть отдельные readiness и shutdown пути, но их скалярные
`settled/clean` поля не называют область доказательства достаточно явно.
Проверка всех производителей и потребителей ниже обязательна; наличие имени
в инвентаризации само по себе не означает доказанный дефект этого адаптера.

## 2. Три независимых результата — обязательный контракт

| Ось | Что доказывает | Чего не доказывает |
| --- | --- | --- |
| Execution readiness | Нет обязательной работы root/owned descendants, ожидающих tools и недоставленных обязательных сообщений текущего запроса | Успех продукта, отсутствие живых support-сервисов |
| Semantic outcome | Work/Stage выполнил требования, checks/review дали соответствующий результат | Остановку процесса, готовность неизвестного дерева |
| Resource retirement | Ресурсы конкретного владельца действительно остановлены/освобождены в запрошенной области | Успех модели или исправление её ошибки |

Решения:

- `nativeTreeReadiness` остаётся единственной общей точкой допуска следующего
  продуктивного запроса. Native idle никогда не заменяет checks/review.
- Native явно классифицированный support-service не является обязательной
  незавершённой задачей. Обычный async tool/background command остаётся задачей.
  Неизвестная классификация не получает исключения по имени команды, PID,
  отсутствию output, финальному тексту модели или истечению паузы.
- Сервис разрешено оставить только внутри живой owning scope. Переход стадии
  может использовать его; завершение owning scope требует отдельной очистки.
  Владение не передаётся следующему RUN неявно.
- Таймеры с ожидаемым сообщением, tool result, child completion delivery и
  незавершённые child/grandchild считаются обязательной работой. Определение
  daemon-процесса не исключает связанные с ним ещё не обработанные сообщения.
- При cancel требуется доказать прекращение обязательной работы и очистку
  запрошенных ресурсов. ACK/kill корневого PID/закрытие stream этого не доказывают.
- Если native outcome неизвестен, физическая очистка может быть доказана
  отдельно. Исторический outcome остаётся unknown, не превращается в SUCCESS
  или в основание повторно отправить прежний запрос.
- Cleanup failure сохраняет исходный semantic outcome и primary error; отдельный
  cleanup blocker запрещает clean shutdown/приёмку, но не переписывает историю.

## 3. P1 — минимальное изменение общей схемы и границ доверия

Изменять существующие helpers, не создавать новый runtime/реестр/планировщик.

1. В `src/harness-runtime/lib/native-children.mjs` и `.d.mts` определить
   `native-tree-settlement@2`: текущая идентичность/дерево плюс явная область
   `scope: required_execution`. Она означает весь обязательный native subtree,
   а не все OS-процессы. Сохранить exact root/operation/turn/request binding,
   budget settlement, полноту retained descendants и fresh revision fence.
2. В existing receipt добавить отдельный resource snapshot: schema
   `native-resources@1`, owner daemon/incarnation, observation revision/time,
   записи с native id, scope owner, typed classification, источником/ссылкой
   на native evidence и состоянием `live/stopped/unknown`. Process identity
   брать из существующего managed-process registry, не дублировать PID ledger.
   Native resource без проверенного PID остаётся ресурсом с неизвестной
   физической остановкой. Не сериализовать credentials, environment или CSRF.
3. `settled/native_settled` оставить совместимыми проекциями execution readiness;
   `physical_stopped` не выставлять из idle. `clean` допустим только в shutdown
   receipt после всех необходимых фаз. Resource snapshot — наблюдение, не
   самостоятельно пригодная authority-квитанция cleanup.
4. В `daemon-operations.mjs` расширить shutdown до `dd-flow/daemon-shutdown@2`:
   required phases явно включают execution settlement/cancellation, owned
   resources, provider, daemon endpoint/resource. `stopped/clean` публиковать
   только после полного durable завершения фаз. Повтор cleanup продолжает
   недостающие фазы той же incarnation, не создаёт Turn.
5. В общем helper проверки shutdown проверять точную схему, совпадение owner,
   обязательные завершённые фазы и отсутствие явных противоречий. Не принимать
   `clean:true` как достаточный самостоятельный аргумент. Онлайн/офлайн пути
   используют один validator; OS re-observation остаётся на process boundary.
6. Старые @1 receipts доступны для истории. Не повышать их автоматически до
   новой области доказательства. Для нового productive @2 запроса нужен свежий
   @2 producer. Retire старого владельца разрешается существующим отдельным
   physical-retirement путём без выдачи semantic/native PASS; чужой или
   неопределённый owner блокирует операцию. Pins обновлять только после приёмки.

## 4. P2 — все адаптеры, один смысл и разные native источники

В `src/harness-runtime/lib/dd-*-daemon.mjs` и соответствующих runtime `.mjs`:

| Адаптер | Проверить и сохранить при переводе на @2 |
| --- | --- |
| AGY | Unary idle покрывает required execution, но не IsDaemon resources; explicit native task classification и сообщения обязательны; nested ancestry требует отдельного доказательства |
| Codex | Turn/session + retained descendants; terminal tool item не доказывает остановку запущенного сервера; native background task не исключается без typed service evidence |
| ZCode | Closed-tree/pagination/revision completeness; результат bridge не означает OS cleanup; сохранение native outcome при разрыве транспорта |
| Grok | Retained root/parent ancestry и attempt identity; session result не означает retirement; поздние события старой попытки не меняют новую |
| OpenCode | Native status + pending requests/tools и listing∪retained nodes; исключение service не обходится через idle root/404; cancel сохраняет cwd и ownership |
| Droid | Owned Task inventory и recursive descendants; отсутствие Task не разрешает игнорировать ранее retained work; kill не синтезирует native success |

Для каждого адаптера составить в implementation report короткую таблицу:
native evidence → required-work projection → service inventory → cleanup action.
Если native сервисная классификация недоступна, не изобретать её. Сохранять
существующий безопасный readiness для поддерживаемого native scope, явно
выдавать unknown для недоказанной области и проверять ресурсы на cleanup.
Нельзя объявлять все pending tool parts сервисами, чтобы получить PASS.

Отдельно AGY: native creation edges брать из source-bound записей, рекурсивно
валидировать parent до retained root, отбрасывать cycle/foreign/duplicate
contradictions. Существующий `agy_child_parent_unqualified` не удалять вслепую:
заменять direct-root ограничение только после bounded подтверждения каждого
ребра и проверки hook binding. Неполный transcript/pagination — pending/unknown.
Не делать новый model request ради выяснения дерева.

## 5. P3 — потребители и ресурсный lifecycle

Engine обязательная проверка всех вызовов `nativeTreeReadiness` и
`nativeShutdownConfirmed`, не только AGY:

- `provider-capacity.ts`, `memory-init-native-capacity.ts`: readiness до retry
  intent; service liveness не считается прогрессом модели и не сбрасывает
  provider retry budget. Read-only inspection не расходует новый model attempt.
- `run-controller.ts`, `run-controller-recovery.ts`, `run-control.ts`,
  `native-daemon-history.ts`: продолжение опирается на execution, replacement
  daemon — на retirement и exact generation; не смешивать эти разрешения.
- `runtime-scope-stop.ts`, `runtime-scope-resume.ts`, managed-daemon/process
  registry и `driver-recovery.mjs`: использовать shutdown @2 и подтверждать
  process birth/ownership; parent exit не доказывает отсутствие detached child.
  Детерминированно обнаруживаемый owned descendant сохранить до parent exit.
- Capture/Work graph: не стирать service evidence при readiness projection;
  `settled_by_root` не равно semantic completed; failure descendants сохранить.

EVAL: `lib/capacity-policy.mjs`, `judge-capacity.mjs`, `driver-recovery.mjs`,
`daemon-control.mjs`, `runner.mjs`, `execution-state.mjs`, `runner-events.mjs`,
diagnostics и pinned-engine contract loader. Обновить producer/consumer версии
вместе; online/offline cancellation должны давать одинаковый verdict.

Моменты очистки:

1. Между стадиями — сохранять нужные scope-owned services; не делать global kill.
2. Terminal success/failure/cancel RUN/EVAL — штатно retire все его owned ресурсы,
   включая support-services, и отдельно записать cleanup result.
3. Retention для расследования — только явный режим: outcome terminal, resources
   retained, owner и причина записаны; это не `clean`. Снять retention и выполнить
   cleanup перед следующим конфликтующим запуском, не трогая живые чужие EVAL.
4. Неизвестный owner/PID reuse/replaced socket — fail closed, не убийство по имени.
   Внешняя общая БД/пользовательский сервер не принадлежат EVAL лишь из-за порта.

Использовать существующие фазовые receipts/registry и cleanup runbooks.
Новый демон мониторинга, отдельная БД ресурсов и таймер очистки не нужны.

## 6. P4 — завершение AGY P3 с корректным критерием

Текущий blocker остаётся до новой приёмки. Старые результаты/отрицательный
counterexample не удалять и не переписывать под новый контракт.

1. В `agy-native-inspection.mjs` разделить native capability @2 и evidence schema
   от старой квалификации. Exact binary/client/schema hashes остаются provenance
   и compatibility inputs. Изменение unrelated документа не требует живых проб.
2. Заменить старый `persistent_background` на два независимых утверждения:
   `daemon_excluded_from_required_execution` и `owned_daemon_retirement`.
   Первое требует typed IsDaemon evidence, aggregate/native readiness и живого
   owned service одновременно; второе — его проверенную остановку. Обычная
   async команда должна оставаться busy до drain. Idle timer с pending delivery
   не считается daemon-исключением.
3. Typed validator выводит checks из наблюдений, не принимает operator booleans.
   Финализатор не создаёт authority receipt при пропусках, противоречиях,
   mismatched identity, позднем событии или cleanup uncertainty.
4. Сохранённый 1.4.6 fixture использовать детерминированно для проверки двух
   осей: он опровергает старое zero-resource idle, но совместим с execution
   readiness. Не выдавать fixture replay за новую живую приёмку.
5. Новая native-приёмка (только следующим разрешённым шагом): обычный background;
   root→child→grandchild с выделенным grandchild-only pending интервалом;
   completion delivery после локального ответа; timer delivery; persistent
   daemon ready-while-live и physical cleanup. По одному initial root prompt
   на fixture; последующая инспекция только read-only API, без «ты завершился?».
6. Fatal executor error отличать от обработанного exit7. Проверять его
   fail-closed обработку детерминированным ответом transport/native boundary:
   отсутствие положительного proof не даёт ready; ERROR плюс свежий отдельный
   idle proof может означать settled execution, но никогда semantic SUCCESS.
   Безопасный реальный fatal native отказ, если встретится, сохраняется как
   дополнительная live регрессия; его искусственное получение не является
   обязательным paid qualification gate. Детерминированные transport/error/
   cancel/restart fences обязательны, но не называются live доказательством
   бинарника. Поздняя activity/cancel/restart проверяется на exact old/new owner,
   запрос и revision. Обязательные live cases перечислены в пункте 5, остальные
   обязательные safety cases — deterministic; это явная замена старого
   монолитного критерия, а не декларация о пройденных live случаях.
7. Blocker снимается только когда все обязательные scope-specific cases
   подтверждены, validator и финализатор прошли негативные проверки, nested
   hook scope согласован с доказанным деревом, cleanup доказан. Если остаётся
   недоказанный случай — честный blocker, не ручное qualified:true.

Зависимости: учесть локальные followup-коммиты engine `5370d5cb`, `0b69ecbc`,
`535cb104` и EVAL `35805866`, `e135e45c`; они ещё не объявлены merged.
Не воспроизводить их изменения повторно, проверить diff относительно main.

## 7. Приёмка без лишних прогонов

Сначала детерминированные affected suites и fixture replay, без модели:

- Общий truth table: execution ready + live service; pending ordinary child;
  unknown classification; pending delivery; failed-but-settled native result;
  missing/contradictory owner/schema; old receipt; stale revision.
- Для каждого из шести адаптеров минимум положительный scoped-readiness случай
  и отрицательный required-work случай; fixture-only mocks не заявлять live.
- Shutdown: ready + service live ≠ clean; cancellation ACK ≠ clean; detached
  owned child, PID reuse, replaced socket, foreign resource, partial phase
  failure, durable retry, post-await new activity, restart and offline replay.
- EVAL: stage transition не останавливает нужный server; terminal cleanup
  останавливает owned service; primary error сохранён при cleanup failure;
  retained resources запрещают ложный clean и не затрагивают чужой EVAL.
- AGY qualification validator: old counterexample, partial native evidence,
  timer vs daemon, ordinary tool exit vs executor failure, nested ancestry.

Запускать targeted native fixtures/AGY state-boundary wrapper и affected EVAL
tests; затем установленный package contract smoke для новых @2 артефактов.
Typecheck/lint/diff checks. Полный gate — только если его требует фактическая
impact policy проекта; не повторять неизменённые дорогие группы по привычке.
GitHub CI не запускать. Live P3 — отдельно после реализации; EVAL не входит
в этот план приёмки и требует следующего запроса пользователя.

## 8. Проверка готовности и ponytail

Решения приняты: три оси; native classification вместо regex; fail-closed
unknown; @2 execution/shutdown и отдельный resource snapshot; совместимость;
scope lifetime; cleanup/cancel/recovery; preservation primary outcome;
all-harness inventory; AGY оставшиеся live cases и критерий снятия blocker.

Ponytail: переиспользуем native-children, completeDaemonShutdown, process registry,
retained journals и существующий квалификатор. Нет новых dependencies, generic
workflow engine, resource scheduler или дополнительного model-запроса.
Не ослабляем ownership/freshness/error guards ради прохождения P3.

Порядок реализации: P1 contracts → P2 adapters → P3 consumers → P4 validator и
deterministic regressions → targeted acceptance → отдельно разрешённая live P3.
В implementation report для каждой строки записать code/tests/evidence и
оставшиеся ограничения. Завершённый код без пройденной live P3 не объявлять
завершённой AGY qualification. Это единственная внешняя приёмочная зависимость;
для старта реализации дополнительных продуктовых решений не требуется.

## 9. Readiness-review: уточнения, обязательные при реализации

### 9.1 Точная форма evidence и область полномочий

- Расположение новых данных: `native_settlement.contract` =
  `native-tree-settlement@2`, `native_settlement.scope` = `required_execution`;
  `native_resources` — отдельный объект receipt, schema `native-resources@1`.
  Producer, validator, declarations, package exports и EVAL loader обновляются
  совместно. `native-children@2` не менять: ancestry-структура не меняется.
- Resource identity: `resource_id` (native identity или ссылка на registry id),
  `provider_session_id`, owner daemon id/generation, native source locator,
  classification `support_service/required_work/unknown`, state
  `live/stopped/unknown`. Container/DB identity брать из существующих resource
  receipts, не искать контейнеры по свободному тексту команды.
- Пустой inventory не означает complete. Нужен явный coverage
  `complete/partial/unsupported` и source revision. При partial/unsupported
  execution может быть ready только по независимому qualified native proof,
  который действительно покрывает required tree; resource cleanup остаётся
  недоказанным до положительного scoped process/resource proof.
- Unsupported service classification не должна блокировать обычный terminal
  Turn без pending work. Но наблюдённый pending tool нельзя исключить из дерева
  по этой причине. Никакого синтетического native IsDaemon для других упряжек.
- Revision snapshot должен охватывать tree и resources одной incarnation.
  Activity во время await invalidates proof до публикации. Daemon service output
  сам по себе не является model progress; новое native сообщение/required task
  делает прежний execution snapshot непригодным. Inspection clock не сбрасывать
  от poll, metadata или живого PID.

### 9.2 Владение сервисом и порядок завершения

Scope-owner уже связывает project/run/work/daemon через managed-daemon registry.
Новый автоматический transfer между Work не вводить. Пока используется тот же
живой daemon/scope, service может пережить Turn. Если стадия закрывает daemon
или Work, сервис остановить; следующая стадия штатно запускает нужный сервер
заново. Не пытаться сохранить дочерний процесс через уничтожение его владельца.
Cross-Work handoff не является условием этого исправления и не заявляется
поддержанным без отдельного existing resource-owner механизма.

Shutdown @2 имеет фиксированные обязательные фазы:
`execution`, `owned_resources`, `provider`, `daemon_resource`.
Adapter-specific `provider_resource` остаётся дополнительной фазой там, где есть.
Порядок: fence dispatch → settle/cancel required execution → сохранить complete
owned inventory → остановить owned services/native handles → закрыть provider →
re-observe все retained process/resource identities → закончить registry/endpoint.
Фаза `owned_resources` получает true только после этой re-observation; durable
phase можно начать раньше, но нельзя отметить завершённой до фактического stop.
Provider-dependent graceful stop делается до закрытия provider; ограниченная
эскалация через существующий owned process-group stop — после него.
Штатные stop-операции детерминированные, не требуют нового запроса модели.

После quiescence поставить shutdown fence и сохранить полный план фаз до
побочных эффектов очистки. Ошибка persistence не разрешает productive retry.
Повтор cleanup идемпотентен по incarnation/resource identity; новый discovery
при retry не удаляет прежние retained live/unknown resources. Положительный
cleanup snapshot становится obsolete при новой регистрации до terminal fence.
Если native remote work невозможно подтвердить остановленным, локальный kill
позволяет physical-retired, но не clean native shutdown и не replay запроса.

Не требуется доказательство «никаких процессов во всей машине»: только полное
покрытие ресурсов данного owner. Недоступность OS inventory, потеря ancestry до
retention или native resource без stop API оставляют cleanup unknown. Не считать
это основанием запускать root discovery с широкими kill/glob/port правилами.

### 9.3 Конкретные найденные consumer gaps

В EVAL `cancelOwnedDaemon` сейчас online путь выводит physical_stopped из
`stopped`, а fallback inspection способен подтвердить только native readiness.
В @2 fallback НЕ может поднять clean/retired: отдельно валидировать durable
shutdown phases и physical observation. Offline путь уже проверяет phases,
но его текущий @1 список и проверку native boolean заменить тем же validator.

В engine `completeDaemonShutdown` сейчас ставит `settled:true` в итоговом
control receipt независимо от result.native_settlement. В @2 не подменять этим
execution: `stopped` — завершение control shutdown; `settled/native_settled`
берутся только из execution proof; clean требует обе оси. `active_tree:false`
также не является доказательством required execution settlement.

AGY `prepareStop/close` сейчас проверяют execution и закрывают stdin/process
group, а `finishResource` завершает registry record. Добавить resource proof
между этими действиями: registry finish — учёт, не доказательство смерти task.

Все literal consumers `native-tree-settlement@1`, `daemon-shutdown@1`, а также
boolean-only consumers в budget release, capture и recovery найти повторным
`rg` перед merge. Нужен тест полноты package exports: EVAL использует validator
из pinned engine, а не свою копию новой семантики.

### 9.4 Совместимость, приёмка и остановочные условия

- Исторические файлы не мигрировать in place. Новая версия engine создаёт @2;
  mixed @1/@2 productive composition отвергается до dispatch с понятной
  contract-mismatch диагностикой. Работающие старые EVAL не обновлять.
- Сохранить cancel semantics для root без первого Turn: exact owned empty tree
  + полная physical cleanup могут дать clean; отсутствие истории без owner
  proof не равно empty tree. Проверить также multiple roots в одном daemon.
- Добавить regressions для service crash после execution ready (readiness не
  переписывает outcome; check/browser получает реальную ошибку), завершения
  service одновременно со snapshot, нескольких сервисов с partial cleanup,
  daemon отсутствующего PID и запущенного во внешнем container/remote runtime.
  Последние не требуют создавать новую поддержку remote cleanup: неподдержанная
  область должна остаться unknown, а не ложным physical_stopped.
- Live P3 фиксирует до/после binary/client identity, evidence file hashes,
  native source/revision и pre-cleanup outcome. Probe работает в disposable
  owner; finally всегда пытается cleanup, даже при неудачной квалификации.
  Cleanup failure сохраняется и блокирует clean qualification.
- Результат приёмки раздельный: implementation PASS/FAIL; deterministic safety
  PASS/FAIL; live AGY execution capability PASS/FAIL; cleanup PASS/FAIL.
  P3 снимается только при всех обязательных PASS. Если доступ провайдера закрыт
  или новый binary поменялся, результат BLOCKED, не повтор полного gate.

Итог review: исходный план задавал верное разделение, но был недостаточно точен
для реализации lifecycle и завершения P3. Уточнения выше являются частью плана,
не опциональными идеями. Новых service managers/transfer protocols и требований
к живой квалификации остальных пяти адаптеров не добавляем: их изменения
проверяются существующими affected regressions. Реальный AGY P3 остаётся отдельным
разрешённым шагом; readiness-review менял только этот документ. Последующая
реализация фиксируется отдельно в implementation report.
