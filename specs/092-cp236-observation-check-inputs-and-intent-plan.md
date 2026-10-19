# 092 — Наблюдение native Session, границы check inputs и сохранение принятого намерения

Дата: 2026-10-18. Статус: готов к реализации после readiness review;
реализация и новые E2E не выполнялись.
Ponytail: full. Основание — расследование CP235/CP236 и аудит общих callers,
адаптеров, receipt consumers и инструкций этапов. Цель: убрать ложные blockers,
не ослабить ownership/evidence и не исправлять оцениваемый продукт вручную.

## 1. База, доказательства и границы

Исследованные версии: engine a5b068e5cc52809ac0ea0687e40a49f9379bb198
(beta.142), EVAL f13ee2ff67a9061f320d15556cf722d26d9d9a08,
canon 1ddedf9d3f086e046f8e7b194c739ec386e7c8b9 (4.1.2).
Subject/check tooling CP236: c92bb80240c98eb10d2e7a2626bef4778ea800b1
из checkpoints/cp-236-runtime.json; не прежний f361454 и не случайный dd-tasks main.
ZCode и Luna выполнялись на beta.141; рассматриваемые механизмы сохранились
в исследованном beta.142. Перед реализацией сверить текущие main и diff.
Исторические artifacts/DB/receipts остаются read-only, не переоцениваются задним числом.

Evidence root: `/Users/deksden/.dd-eval/qualification/<home>/runs/<EVAL>/executions/e2e`.
RUN root: `dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject`.

| ID | Home / EVAL | Доказанный факт |
| --- | --- | --- |
| D01 | cp-236-opencode-released-full / EVAL-20261018120221-c50618d2 | PLAN-REVIEW завершён 13:54:53Z; boundary не settled: owned_inventory_changed для session-4, затем observation budget exhausted. Осмотр parent удаляет adapter_session_id у child, child inspect возвращает его. Чистое in-memory воспроизведение подтвердило изменение при неизменном native дереве. |
| D02 | cp-235-zcode-full / EVAL-20261018063748-ff62aaa4 | API integration 08:25:55–08:28:23Z: exit0, 18 passed. В 08:27:12Z параллельный UI Work выполнял biome --write двух web-тестов; глобальный guard ошибочно отнёс их к check_input_mutated. |
| D03 | cp-235-luna-full / EVAL-20261018065929-2a3fe57e | Перед PLAN-REVIEW thread/read получил успешный ответ через ~16.5s, после 10s+5s grace; ответ стал late_response. Продуктивный turn/start ещё не был выполнен. |
| D04 | cp-236-grok-released-full / EVAL-20261018125222-9e60279e | hitl_coverage_unresolved: вопрос о показе подписи приоритета на форме создания. Ответ определяет выбор при создании и отображение в list/detail, но не отдельную обязательность подписи на create. Ошибка Judge не доказана. |
| D05 | cp-236-agy-released-full / EVAL-20261018125928-ce01c5d5 | MERGE завершён. Доставленный канонический ответ требует close/reopen через UI и API; SPECIFY R010 сужает до PATCH, verification seeds не включают status UI. В финальном frozen workspace UI-действие отсутствует; reviews пропустили. |
| D06 | тот же AGY | Финальная case acceptance unavailable/checkpoint_invalid: finalReceiptIndex отвергает readiness receipt в обычном CODE checks, а на MERGE допускает только merge/release, хотя native execution сохраняет исходные logical gates. |

D05 — дефект качества работы агента/семантического ревью. Исправление общего
контекста и критериев улучшает обнаружение, но не доказывает безошибочность модели.
D04 — неполнота/неясность границы канонического пакета, а не установленный native bug.
Retirement envelope mismatch уже исправлен f13ee2f; не включать повторную реализацию.

Scope: dd-flow engine/адаптеры, dd-eval consumers/tests, общие canon инструкции,
check policy/test tooling закреплённого subject и семантические fixtures.
Не входят: task-priority UI/API/schema, правка native ZCode/Grok, повторная живая
квалификация из-за несвязанных правок, автоматический restart старых EVAL.

## 2. Расширение аудита: аналогичные места

Пути ниже относительны соответствующему repository; строки — audit base.
Read-only отчёты трёх субагентов перепроверены по исходникам основным агентом.

| ID | Дополнительно установлено | Исправление |
| --- | --- | --- |
| A01 | OpenCode describe:204 и cancelTree:297 оба записывают child без adapter_session_id. Grok track/recordDescendant сохраняют поле; ZCode track имеет удержание identity. | P1, один способ построения OpenCode Session record; sibling contract tests, не переписывать все adapters. |
| A02 | nativeInventoryVersion используется run-control, eval-snapshots, runtime-scope-control и runtime-scope-resume. Исключение observation operations не исключает побочный rewrite sessions. | P1, общий стабильный authority projection и проверки capture/drain/resume. |
| A03 | code-checks.ts:503 normal и :564 detached сравнивают весь workspace даже при narrow inputs. :905 evidence validation и check-runner-evidence.ts:172 требуют равенства global fingerprints. | P2, согласованный scope во всех producer/consumer путях. |
| A04 | EVAL case-acceptance:609–610 независимо требует before==after и epoch=hash(gate+global before). Исправить только engine недостаточно. | P2/P4, совместный контракт без переинтерпретации старых receipts. |
| A05 | inputs=[] означает весь workspace; одних новых scoped сравнения/полей недостаточно для реального API alias с пустым inputs. | P2, заполнить доверенный project check profile для затронутых aliases; не выводить зависимости из write_areas. |
| A06 | Тест code-checks «uses declared alias inputs...» меняет unrelated.md между вызовами, не во время check; reuse проверен, in-flight false failure — нет. | P2, детерминированная синхронизация check/writer вместо sleep-based гонки. |
| A07 | Codex request уже использует observedTimeout, но progress заполняется через turnObservers для turn/start. Metadata read не имеет такого сигнала, поэтому 10s+grace фактически фиксированы. lateResponses сохраняются без consumer. | P3, использовать существующий observation механизм и фазовый read budget; не объявлять отсутствие framework причиной. |
| A08 | ensureThreadLoaded вызывается перед start/prompt и внутри waitForTurn; readTurn/readPersistedTurn имеют 10s, readCompletedThread — 8 коротких попыток, inspect — default, cancel — отдельный 10s pre-read. | P3, единая ограниченная read policy; read retry не становится retry продуктивного действия. |
| A09 | finalReceiptIndex общий для финального PASS и failure diagnostics; eagerly проверяет все receipts. Посторонний исторический readiness receipt способен сломать разбор нужного proof. | P4, индекс ownership/identity отдельно от semantic validation используемых receipts. |
| A10 | verification-matrix.ts строит obligations из уже принятого specify; исходный intake и доставленные HITL не представлены как отдельные sources. Формальное покрытие после первоначальной потери может быть полностью зелёным. | P5, reuse существующих source packets для оригинальных accepted inputs; semantic comparison в reviews/Judge. |
| A11 | Canon уже требует сохранения смысла/исключений, но нет явной сверки delivered answer→SPECIFY и контроля UI/API modalities. | P5, уточнить общий rubric, не добавлять новый ontology/второй список обязательств. |

Инвентаризация: normal/detached/reuse/readiness/CODE-REVIEW/MERGE checks;
runtime capture/drain/resume; Codex setup/observation/cancel/post-turn reads;
OpenCode root/descendant/cancel; остальные Session registries;
SPECIFY→PROTOCOLIZE→PLAN→PLAN-REVIEW→CODE-REVIEW→final Judge;
EVAL final acceptance и failure evidence. Закрепить этот перечень в review PR.
Это аудит выбранных классов дефектов, не утверждение об отсутствии всех иных bugs.

## 3. Пакеты реализации

### P1. Стабильная native identity при наблюдении

Файлы: `src/harness-runtime/lib/dd-opencode-daemon.mjs`,
`src/services/run-control.ts` и перечисленные A02 callers; существующие tests.

1. Один локальный builder/merge для root/child Session record в describe и cancelTree.
   Всегда сохранять adapter_session_id и проверенную ancestry/root;
   несовместимую ownership identity отвергать, не маскировать spread старой записи.
   Cwd — изменяемый наблюдаемый routing fact, не неизменный ключ ownership:
   перемещённая owned Session остаётся доступна для inspect/cancel, смена cwd
   меняет inventory version, а productive dispatch блокирует route conformance.
2. nativeInventoryVersion нормализует множества Session/descendants/owned processes
   по стабильной identity и включает значимые authority поля. Порядок элементов,
   observation bookkeeping и производные presentation поля не версия владения.
   Перечень полей задать явно рядом с функцией; не игнорировать sessions целиком.
3. Сохранить fences для daemon/owner/process identity, нового child, parent/root/cwd,
   active/productive operation и shutdown. Не обновлять baseline version после
   любого probe: это скрывает реальное изменение во время наблюдения.
   Для неизвестной schema/нового неподдержанного authority record сохранять
   консервативный полный hash записи, не молча отбрасывать поля. Невалидная identity
   или duplicate Session/process ID — typed blocker до canonical sorting, не dedup.
4. Проверить тот же projection в snapshot signature, scope drain и resume prepare/release.
   Осмотр завершённого дерева идемпотентен; первое обнаружение реального нового child
   может потребовать следующего наблюдения, но не вызывает вечную смену версии.

Регрессии: root+несколько settled children, root/child inspect в разном порядке,
reorder массива — стабильны; cancelTree сохраняет форму identity, но сама отмена
как продуктивная операция меняет inventory/settlement. Новый child/другая ancestry/
cwd/productive op/смена владельца — version меняется. Boundary, drain и resume
проходят на стабильном дереве и отклоняют настоящее изменение.

### P2. Проверять реальные check inputs, а не чужие параллельные записи

Файлы: `src/services/code-checks.ts`, `check-runner-evidence.ts`, существующие
profile/schema/receipt validators, verification consumers; dd-eval case-acceptance;
закреплённый subject `.memory-bank/spec/engineering/code-check-profile.json`.

1. Reuse normalizedInputs/explicitInputFiles/workspaceInputFingerprint. Один scope
   используется для input_hash, before/after, mutation_paths, epoch, reuse,
   detached reconciliation и evidence admissibility. Не отдельный алгоритм для Work.
2. Явно обозначить новые receipts `fingerprint_scope: "check_inputs"`:
   before_fingerprint/after_fingerprint — выбранные входы; workspace_fingerprint
   остаётся глобальным audit fact, не причиной invalidation. Epoch вычислять от gate
   и scoped before. При отсутствии маркера читать исторический full-workspace
   контракт без пересчёта/«исправления». Не переиспользовать legacy proof как новый scoped proof.
   Consumers проверяют supported marker fail-closed; включить новые поля в schemas
   и принятую immutable publication, если там есть field allowlist.
   Marker хранится в check_receipts (migration/default legacy), reservation,
   DB→receipt projections и stored-versus-presented evidence comparison. Одного
   редактирования JSON недостаточно для смены semantics; unknown marker отвергается.
3. В check profile API alias задать входы API, действительно импортируемых shared
   packages, manifest/lock/config/tooling. Для web/browser — web и необходимые
   backend/shared/tooling зависимости. Вывести точный список из закреплённого
   package graph/scripts/imports; проверить root configs и runner setup, а не
   угадывать только по имени пакета. Полный repo допустим для реально repo-wide gate.
   Для pinned c92bb802 минимальный консервативный API scope: apps/api, scripts,
   package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.base.json,
   vitest.config.ts, drizzle.config.ts, docker-compose.yml, apps/web/package.json
   (его читает общая observation tooling); не все web source/test файлы.
   Web-unit/build: apps/web + scripts и root manifests/lock/tsconfig; browser:
   apps/api + apps/web + scripts и те же root configs/DB compose. Quality/docs
   оставить whole-workspace, пока нет доказанного более узкого dependency contour.
   Проверить явные imports/config scripts на том же pinned commit; новый реальный
   dependency добавляет input, а не повод ставить общий scope ради простоты.
4. inputs отсутствуют/[]/"." остаются консервативным whole-workspace scope, а не
   пустым набором. Не обещать безопасную параллельность такого check; relevant
   изменение делает proof stale. Не автоматически сужать inputs по Work write_areas:
   область записи не равна dependency closure проверки.
5. Изменение unrelated paths не ошибка. Изменение выбранных inputs — отдельный
   typed `check_inputs_changed`/stale result с affected paths, не утверждение, что
   check сам написал файл. Сохранить реальный test failure и его runner evidence
   независимо от stale результата: stale proof не даёт права source repair.
   Для совместимости с существующим enum status сохраняется failed с bound
   execution_failures.code=check_inputs_changed и отдельной retry_reason; новый
   status stale не вводить. При simultaneous assertion failure+drift ни rerun,
   ни repair не получают право скрыть второй факт; новый пригодный proof нужен
   после стабилизации. Unknown completion/cleanup/authority error приоритетнее
   safe stale retry. EVAL zero-exit failed diagnostics принимает scoped drift
   по новому контракту, не требует глобальной mutation как доказательства.
6. Stale result допускает повтор только проверки, чья повторяемость разрешена
   доверенным check execution contract: в этом плане только явно объявленный
   reuse=deterministic, без нового repeatable флага. inputs/имя test сами по себе
   не доказательство read-only; не назначать reuse всем checks автоматически.
   При неизвестных побочных эффектах — blocker, не автоматический rerun.
   Повтор идёт через controller/check retry после quiescence нужных writers. Не
   запускать product repair/новую native Session и не повторять команды с unknown
   effect. Повтор не зацикливается: один автоматический rerun после подтверждённой
   стабильности; повторный drift остаётся диагностированным blocker с paths/owners.
   Добавить typed stale predecessor переход в общий validateFailedCheckRetry:
   причина только bound check_inputs_changed, тот же command/profile/inputs/
   environment contract, но новый input_hash разрешён; это не source_repair.
   Один predecessor имеет максимум одного такого successor; unique reservation
   предотвращает параллельные повторы. Успешность rerun требует нового receipt.
   Лимит относится ко всей stale episode: successor не начинает новую цепочку
   из одного retry. Проверять ancestry retry_of_receipt_id в том же коротком
   reservation transaction. Не ждать terminal всех Work: это может создать
   deadlock взаимно ожидающих finish. Наблюдать только доказанные связанные
   продуктивные writers; при отсутствии надёжной связи не выдумывать quiescence.
   Истечение существующего observation budget — explicit blocker. Снимок перед
   rerun и обычный scope guard остаются обязательными даже после ожидания.
7. Учитывать add/delete/rename, symlink target/escape/cycle, ignored explicit input,
   missing required input, profile/environment/config change. Не включать generated
   reports/runtime output в source inputs без причины; сохранять artifact integrity.
   Поздний consumer проверяет актуальность relevant inputs, не глобальный audit hash.
8. Detached reconciliation не приписывает изменения после completion команде.
   Если writer успел опубликовать bound scoped completion snapshot — использовать
   его; current inputs отдельно определяют freshness. Без него позднее наблюдение
   доказывает лишь stale/unknown, не command-authored mutation. Для конкретных
   affected paths удерживать bounded before selected manifest рядом с receipt;
   при недоступном manifest — честный scope-only diagnostic, не придуманный путь.
   Repair cause identity (repair-intents) использует receipt/epoch и bound relevant
   evidence, не превращает unrelated workspace audit hash в новый repair.
9. Гарантия — совпадение наблюдаемых scoped inputs и актуальность proof, не
   доказательство отсутствия любой записи между двумя снимками (ABA). Не вводить
   filesystem watcher как ложное доказательство авторства. Требующий более сильной
   изоляции check должен выполняться в существующем изолированном contour либо
   явно не допускается к concurrent evidence; обычные checks не получают такую
   гарантию по одному fingerprint. Manifest хранит пути/hash, не содержимое или secrets;
   максимум 1 MiB, превышение сохраняет только digest и explicit diagnostic truncation.
   Новые marker/manifest/epoch также связываются с completion и engine-outcome
   evidence, не только с итоговым receipt. Миграция БД additive, NULL=legacy;
   старый consumer не должен принимать новый scoped proof: обновить capability/pins.

Регрессии: управляемый barrier во время API check + unrelated UI writer; actual
API/shared/config writer; те же случаи detached/reuse/final acceptance; legacy
receipt не получает новые полномочия; inputs=[] не превращается в empty pass;
настоящий assertion failure по-прежнему идёт в repair. Воспроизвести сохранённую
форму ZCode receipt без новой модели. Сначала scope+consumers, затем profile/pins.

### P3. Codex read-only RPC в общей фазе наблюдения

Файлы: `src/harness-runtime/lib/dd-codex.mjs`, daemon caller и имеющиеся
ObservationClock/observedTimeout tests. Не новый RPC framework.

1. Удалить разрозненные 10s metadata/read overrides и восемь локальных попыток.
   Read policy использует существующий default RPC inactivity (120s в audit base)
   с остатком outer phase budget; не продлевает outer phase каждым новым poll.
   Настройка существующего liveness budget применяется согласованно.
2. Общий clock охватывает setup, ensure-loaded, dispatch и terminal observation
   с различимыми phase diagnostics. Read response — завершение read, но повторный
   unchanged snapshot/poll/heartbeat не продуктивный сигнал агента.
   Native reasoning/text/tool/item progress может продлевать ожидание только
   соответствующего активного turn и поколения, не чужой/старой Session.
3. До истечения фазового окна pending read сохраняет request id и принимает
   успешный ответ: не бросать раньше на локальном 10s deadline. После окончательного
   phase timeout ответ остаётся diagnostic-only; не возобновляет terminal operation.
   Не строить второй late-response cache/replay engine: existing lateResponses
   остаётся диагностикой; достаточно удержать pending read в действующем фазовом
   окне. Старый ответ не завершает новый request, transport generation или операцию.
4. При transient read error — максимум две дополнительные read-only попытки,
   backoff существующей policy и общий остаток бюджета; никаких новых 120s на каждую.
   Known native completed outcome сохраняется при failed terminal observation.
   Проверить readTurn/readPersistedTurn/readCompletedThread/inspect/cancel pre-read.
   Classifier: rpc_timeout и явно recoverable transport interruption допускают
   retry; auth/foreign identity/not-found/schema-invalid RPC не retryable.
   Для standalone inspect/cancel observation phase начинается на входе операции,
   имеет один owner/generation и общий inactivity budget; никакие Session-сигналы
   без доказанной связи с этой фазой не продлевают setup. Identity errors терминальны.
   Backoff — 5s/15s через существующую retry delay policy, обрезанный remaining
   budget, с injectable clock/jitter для tests. Если первый read исчерпал всё
   фазовое окно, новых попыток нет. После поломки транспорта сначала подтвердить
   связь/поколение того же provider; не спавнить новый native процесс скрытно.
   Сохранить различие observation_gap/observer uncertainty и настоящей тишины
   из ObservationClock: sleep/пауза самого наблюдателя не provider failure.
5. Не повторять thread/resume, turn/start и turn/interrupt как read-only.
   Для потерянного productive ACK — существующий effect/identity reconcile;
   неизвестный эффект остаётся unknown, а не permission на повтор.
   Не кэшировать loaded state без проверки daemon/thread generation.
6. Сохранить primary RPC details и secondary observation failures; не превращать
   каждый read failure в null/«нет turn», если это меняет lifecycle verdict.

Регрессии fake clock/bridge: successful read на 16.5s; response на grace boundary;
настоящая тишина; непродуктивный poll не продлевает окно; реальные turn items
продлевают; cancel и post-turn чтение; отсутствующий thread; late productive ACK.
Во всех случаях проверить количество turn/start (ровно один либо ноль), сохранение
native outcome и ограниченность времени. Не делать suite медленным реальными sleep.

### P4. Native receipt contract вместо gate, угаданного по директории

Файлы: dd-eval `lib/case-acceptance.mjs`, tests; engine read-only contract fixtures.

1. finalReceiptIndex отвечает за containment, regular file/symlink policy,
   id/local_id/namespace/владение Run/Work и уникальность, не выводит logical gate
   из stage directory. Aggregate receipt внутри owning Work — допустимая форма.
   Enum logical gates валидируется по receipt contract, а его допустимость для
   конкретной цели — по declarations/bindings; произвольный gate не допускается.
2. Semantic validation применяется к реально потреблённым proofs и их recorded
   execution_refs/binding_refs/declarations. Сохранить проверки command, inputs,
   artifacts, ports, profile, completion и input_hash; учитывать exact-input reuse
   между gates. Не требовать, чтобы original execution gate совпал с binding gate.
3. Неиспользуемый historical readiness receipt не должен обрушать правильный
   acceptance. Однако duplicate/foreign identity в authority catalog — blocker;
   игнорировать structural corruption целиком нельзя. Ошибку связывать с source path.
4. Нормализовать readiness selection в failure diagnostics тем же ownership
   контрактом: текущая проверка подстроки /05-code/readiness/checks/ тоже не authority.
   Финальный PASS и failure diagnostics используют один validator, не две таблицы gates.
5. Совместить с P2 marker/epoch semantics. Engine/EVAL contract parity проверяется
   на native-generated receipts, не только на вручную собранном happy-path JSON.

Регрессии: сохранённые формы AGY RCP-003 и MERGE work/code/readiness aggregate;
несколько gates с dedup/reuse, scoped inputs, диагностический failed readiness;
чужой Work/path, дубли, unsupported gate/marker, несовпадающие bindings/inputhash/
completion/artifact — отвергаются. Исторический AGY result не переписывать.

### P5. Оригинальные accepted inputs доступны ревью, не только их пересказ

Файлы: engine vnext-specify, verification-matrix и существующая публикация bounded
review sources; PLAN/PLAN-REVIEW/CODE-REVIEW context builders; canon общие этапы;
EVAL final Judge packet/rubric. Не task-specific AGY patch.

1. В существующий каталог источников включить исходный intake и фактически
   доставленные принятые HITL answers с устойчивой identity/content hash/order.
   Не считать recommendation агента принятым ответом. Сохранять ответы до stage
   transition, предоставлять копии в isolated reviewer snapshot по существующей
   механике; абсолютный доступный путь и назначение — в prompt.
   Reuse dd-eval hitl-retained.mjs: точные доставленные bytes/anchors уже проверяются.
   Не добавлять ещё один hash-контроль с обещанием доказать сохранение смысла.
2. Если original source недоступен/обрезан, явно обозначить coverage gap, не
   выдавать пересказ SPECIFY за первоисточник. Не передавать весь native transcript,
   credentials или unrelated history. При source revision сбрасывать зависимые
   review bindings; historical immutable publications не менять.
   Обязателен intake; HITL list может быть пуст только при отсутствии принятых
   answers. Сохранять последовательность и explicit supersedes; conflicting answers
   без принятого разрешения — material question, не last-text-wins. Evidence из
   EVAL context нельзя передавать subject: только реально доставленные answers,
   не скрытые canonical/Judge ожидания. Source packet публикуется атомарно до prompt;
   copy/limit failure не превращается в пустой успешный пакет. Для этих sources
   применять существующие bounded packet limits; полное содержимое доступно по
   bound path, в inline prompt только краткий индекс, не молчаливый truncation.
3. SPECIFY instruction: перед finish сверить каждое material принятое обязательство
   с R/AC/объяснённым out-of-scope. Нельзя заменить UI+API на API, close+reopen
   на одну операцию, active/archive исключение на общий happy path. Use existing
   sections и exact R/AC statements; не создавать второй obligation JSON/DSL.
4. PLAN-REVIEW сверяет original accepted inputs→SPECIFY→owned R/AC→PLAN/checks.
   CODE-REVIEW и final Judge сверяют accepted obligation→реальный observable result.
   Уточнить rubric поверхности/актёров/состояний/исключений; не требовать бессмысленно
   проверять все измерения у любой задачи. API evidence не доказывает UI action.
5. Детерминированный validator гарантирует наличие источников/ссылок/согласованный
   revision, но не распознаёт семантическую полноту. При material finding —
   существующий review correction маршрут; при отсутствии обязательного source —
   infrastructure evidence gap. Пропущенный продуктовый UI — quality finding Judge,
   а не автоматически invalid infrastructure. Нельзя вручную дописать продукт.
   Если finding относится к уже принятому SPECIFY, reviewer не редактирует его
   immutable publication. На PROTOCOLIZE использовать существующие bound
   obligation_amendments с реальным hitl_ref только в рамках принятого намерения.
   Не создавать фиктивный HITL ID ради прохождения schema. Позднее ревью
   сообщает finding с original source refs и требует поддерживаемой upstream
   correction/revision; если её нет — actionable blocker, а не локальный repair
   одного PLAN со скрытым противоречием. Совершенно отсутствующий R/AC нельзя
   подделать replacement amendment; требуется новая accepted revision.
   Общая source publication действует для новых RUN по capability marker;
   historical RUN без marker не объявлять повреждённым из-за нового требования.
6. Все упряжки получают этот общий блок из одного места; harness-specific блоки
   только про native управление. Не добавлять новый обязательный LLM вызов после
   каждого stage: использовать существующие review/Judge и self-check SPECIFY.

Регрессии: доставленный UI+API ответ включён в reviewer/final packet; narrow
SPECIFY остаётся структурно допустимым, но semantic negative example имеет material
finding; exact R/AC не перефразируются projection; недоступный источник явно gap;
read-only reviewer видит snapshot source, не случайный исходный cwd.
Сохранить AGY потерю как negative corpus и корректное полное покрытие как positive.
Промпт не является доказательством, что будущая модель не ошибётся.

### P6. Чёткая граница канонического ответа, без выдуманного product requirement

Файлы: task-priority canonical response и связанные interaction Judge/decision
fixtures/qualification corpus; не production UI и не Grok-specific prompt.

1. Разделить create selection и create display, list/detail display и editing.
   В пакете явно различать required/prohibited/optional/unsettled и не добавлять
   новые обязательные визуальные элементы. Принято пользователем 2026-10-18:
   «Подпись приоритета на форме создания допустима, но необязательна».
   И наличие, и отсутствие подписи допустимы; отсутствие не missing requirement,
   наличие не scope violation. Не выводить из этого обязательность селектора,
   новых цветов/индикаторов или изменение создания/default/ролей.
2. Judge сравнивает независимые atoms с canonical coverage. Вопрос о mandatory
   display не считать покрытым одним запретом selection; новый пакет явно отвечает
   «не требуется, но допустимо». Составной вопрос покрыт только если покрыты все
   его независимые существенные части, а не только эта подпись.
   Новый бизнес-смысл/роль/default остаётся uncovered, а не принимается по близости слов.
3. Decision модель и классический Judge получают тот же canonical packet;
   threshold/fallback/retry не менять для получения желаемого результата.
   Зафиксировать version/hash и точечную инвалидацию затронутых case results.
4. Сначала deterministic replay сохранённых questions/results и отрицательных
   примеров. Изменение canonical semantics требует живой проверки затронутых кейсов,
   а не полной квалификации из-за docs/engine commit. Старый Grok uncovered не
   переименовывается задним числом в ошибку Judge.

Решение закрыто. Регрессии: исходный Grok-вопрос с новым пакетом — covered с
необязательным display; presence/absence одинаково допустимы для final Judge;
selection/default/list/detail и новые независимые вопросы не получают молчаливых
изменений. Со старым frozen пакетом прежний uncovered остаётся историческим фактом.

## 4. Порядок, проверка и критерии завершения

1. Перебазировать отдельные рабочие ветки от актуальных main по правилам каждого
   repository, проверить dirty changes/AGENTS; работающие EVAL/pinned homes не трогать.
2. Зафиксировать компактные sanitized incident fixtures с causal facts выше;
   существующий test runner, без новых библиотек/нагрузочных live вызовов.
3. P1 и P3 независимы; P2 engine contract и P4 EVAL consumers интегрируются вместе.
   P5 canon/source packets отдельно; P6 реализует уже принятую optional policy.
4. На каждый дефект сначала воспроизводящая regression, затем targeted suite.
   Full engine gate включает typecheck/build/static, integration, runtime и все
   обязательные E2/E3/hybrid/release checks согласно текущему package/runbook.
   Полный EVAL test gate, canon validation и contract parity проходят на одних pins.
   Команды брать из текущих package.json/runbooks, не копировать устаревший список.
5. Review проверяет все callers из §2, negative tests и миграцию receipts. Не считать
   зелёный unit на helper достаточным, если controller/consumer осталось старым.
6. Коммиты/пуш/мерж выполняются по правилам проектов после проверки. Только
   после gates выпуск engine/canon и обновление checkpoint/pins, затем свежие E2E
   по отдельному поручению; текущая задача ничего не запускает и не публикует.

Done: stable native observation не самоинвалидируется; concurrent unrelated Work
не портит scoped check; real input drift не принимается за proof; metadata response
на 16.5s не роняет Luna; valid native receipts принимаются без path→gate догадки;
original accepted inputs доступны существующим semantic reviews/Judge; граница
create display явно записана без нового молчаливого требования.
Live acceptance будущих запусков отделять от deterministic implementation gates:
ни один тест/порог/новый prompt не гарантирует безошибочность модели или провайдера.

## 5. Ponytail / readiness review

- Reuse Session registry, authority version, ObservationClock, normalized inputs,
  check profile, receipt bindings и MatrixSource. Нет нового scheduler/RPC SDK,
  dependency scanner, ontology, второго obligation списка или нового judge layer.
- Не увеличиваем таймаут OpenCode для сокрытия нестабильности; не выключаем
  ownership/receipt checks; не сериализуем все Work; не whitelist web-файлы ZCode.
- Дополнительные поля только для реально различающихся receipt semantics;
  сохранённый глобальный hash — provenance, не ложная гарантия неизменности.
- Тесты проверяют событие во время выполнения, а не только состояние между вызовами.
  Fake clocks и barriers вместо длинных sleeps/случайного тайминга.
- Реализация P1–P6 определена; последнее продуктовое решение принято пользователем.
  Readiness review уточнил bounded stale episode, DB/immutable bindings, контуры
  реальных check inputs, metadata phase ownership, source provenance и позднюю
  коррекцию без переписывания принятой истории. Новых решений от пользователя нет.
- Оценку агента не подменяем tooling failure и продукт руками не исправляем.

P1–P6 реализованы; финальные offline gates пройдены 2026-10-19. Точные refs,
результаты и явные skips — в [отчёте реализации](092-implementation-report.md).
