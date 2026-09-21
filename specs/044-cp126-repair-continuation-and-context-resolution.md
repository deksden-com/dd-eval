# CP-126: контекстные пути, repair и продолжение стадии

Дата: 2026-09-21. Ревизия: 3. Статус: реализация выполнена; targeted regression проходит проверку, публикация и чистая live-квалификация ещё не завершены.

## Цель и границы

Устранить класс дефектов, при котором runtime выдаёт команду, не исполнимую собственным CLI, поручает модели перенос уже известных идентификаторов и затем маскирует отказ общей ошибкой отсутствия прогресса. Охват: dd-flow-cli, канонические инструкции dd-memorybank и приёмка/наблюдение dd-eval. Сохранить независимые семантические решения модели, ownership, проверку результатов, защиту от повторов и границы разрешённых изменений.

Этот документ продолжает 039, 041–043 и CP-125 HITL fix. Старый EVAL остаётся неизменным доказательством; его resume и повторное использование для scored qualification не входят в план.

## Реализация ревизии 3

- R1: `command-context.ts` содержит lookup scope и общий resolver объявленных путей; `run-cli` и lifecycle preparation используют его. Auxiliary native proof проверяет ту же project/RUN/generation authority, но не выдаёт lifecycle capability. Политика прочих путей — явный physical-only inventory, покрытый contract test.
- R2: `runtime-command.ts` централизует launcher/argv quoting, recovery evidence JSON и retry argv. Stage pause/resume, Work commands и CODE/CODE-REVIEW/MERGE используют общий renderer. Поддержка legacy `--reason` сохранена; готовые recovery instructions используют `--reason-file`.
- R3: `repair-intents.ts` регистрирует immutable causal set, Work и membership в одной SQLite write transaction. Используется штатная поддержка вложенных SAVEPOINT, а не независимый commit. Generation проверяется под транзакцией; replay возвращает прежний Work, включая завершённый. Все failed receipts входят в identity, все принятые проверки — в repair obligations. Старое singular packet поле остаётся совместимым; причинный набор хранится в intent, новая packet schema не нужна.
- R4: `stage-work-graph.ts` задаёт stage/attempt/cycle membership; fanout, readiness, dispatch, reconciliation и fingerprint используют один набор. Descriptor @2 — проверяемая проекция; при утрате проекции committed repair восстанавливается из DB. MERGE child также получает явную membership. Старый @1 читается, но неоднозначный dispatch блокируется без backfill.
- R0/R5: новый versioned `repair_required` receipt валидируется по durable binding, `continuation-outcome.ts` сохраняет exact correlated native rejection. Существующие typed controller wait/HITL/block/completion/error состояния переиспользуются, не заменяются вторым универсальным state machine. Приоритет и no-progress guard остаются у существующего controller; это намеренное сокращение предложенных абстракций без нового retry budget.
- Canon и project flow-pack: обновлены ровно common/runtime-cli.md, common/runtime-contract.md, vnext/code.md, vnext/code-review.md, vnext/merge.md. Source продукта и остальные Memory Bank inputs сохраняются. Новый checkpoint **не engine-only**: включает явно перечисленный flow patch.
- Регрессии: реальные CLI paths и native hook outcomes; атомарность/rollback/replay; конкурентные built-engine subprocesses; смешанный root и отдельные review cycles; CODE и CODE-REVIEW forced aggregate failure → fresh repair → verification → acceptance; eval сохраняет исходный error projection. Полный suite остаётся обязательным release gate. Live Luna success нельзя объявлять до terminal verdict нового EVAL.

Исторические формулировки плана ниже фиксируют требования и основания; текущий статус исполнения и точные release/EVAL receipts записываются в runbook CP-127.

## Установленные факты

EVAL-20260921004450-82841827 работал на CLI beta.88, commit 6cd7da3104a366d4b2866fa31ef8635949e79143. P1 и P2 завершились; aggregate CODE gate обнаружил RCP-008 (format errors) и RCP-012 (browser timeout при поиске Projects). Координатор записал objective в существующий RUN-local файл intake/code-repair-RUN-001-eval-subject/RCP-008.md. Выданный CLI repair_command оставил @run буквальным сегментом пути, получил input_file_missing и не зарегистрировал repair. Контроллер завершил запуск с fanout_stage_nonprogressing.

Доказательства: runtime timeline, check stdout/stderr и repair objective в cp-126; native transcript /Users/deksden/.codex/sessions/2026/09/21/rollout-2026-09-21T02-46-03-01a0c16d-57c3-7550-95a1-e037e00cfa24.jsonl. Последний coordinator turn: 02:20:15–02:26:29 UTC. parseLifecycleCommand для work repair add возвращает kind:none. В SQLite под WRK-001-root четыре завершённых прямых ребёнка: PLAN, PLAN-REVIEW, P1, P2; fanout ошибочно назвал все четыре CODE Work.

## Карта найденных мест

Пути ниже относительно названного репозитория. «Риск» означает обнаруженный разрыв контракта, для которого ещё нужен отдельный воспроизводящий тест, а не установленную причину CP-126.

| Место | Статус и проблема | Пакет |
| --- | --- | --- |
| CLI src/cli/command-inputs.ts; src/cli/run-cli.ts; src/services/lifecycle-invocations.ts | Подтверждено: contextualPaths есть у work repair add, но expansion зависит от lifecycle invocation | P1 |
| CLI src/services/lifecycle-command.ts | Подтверждено: repair add и stage block не распознаются как lifecycle; stage block при этом объявляет contextualPaths | P1, P4 |
| CLI src/services/vnext-code.ts | Подтверждено: failed gate выдаёт @run task path и placeholder origin Work вместо готового перехода | P2 |
| CLI src/services/vnext-code-review.ts | Подтверждено: тот же шаблон repair при failed aggregate gate | P2 |
| CLI src/services/vnext-code.ts prepareVnextCodeRepair/addVnextCodeRepair | Риск: явный replay поиск есть для reviewCycle; для check-based/semantic repair нужна проверка повторной регистрации и атомарности | P2 |
| CLI src/services/vnext-code.ts CodeRepairInput/selectRepairChecks | Подтверждено: check-based repair принимает один receipt; gate возвращает несколько failures, но команда использует failed[0] | P2 |
| CLI vnext-code.ts, vnext-code-review.ts, vnext-merge.ts finishCommand | Подтверждено: retry_command содержит <environment recovery evidence>; это незавершённый шаблон, а не готовая команда | P3 |
| CLI src/services/vnext-fanout.ts; src/services/work-registry.ts listWorks | Подтверждено: выборка только по parent, без stage/attempt membership; смешивает PLAN и CODE | P5 |
| CLI src/services/controller-fanout.ts; run-controller.ts; run-controller-state.ts | Подтверждено: fingerprint графа/текста не описывает gate/repair outcome; исходный отказ заменяется fanout_stage_nonprogressing | P4, P5 |
| CLI test/vnext-protocolize.test.ts | Подтверждено: repair тест собирает свой argv с task-stdin вместо исполнения возвращённой команды | P7 |
| CLI test/lifecycle-invocations.test.ts; test/run-controller.test.ts; test/vnext-fanout-storage.test.ts | Пробел покрытия: resolver отдельно от полного CLI, guard отдельно от gate→repair, отсутствие смешанного stage graph сценария | P7 |
| Canon .memory-bank/dd-flow/common/runtime-cli.md; runtime-contract.md | Подтверждено: documented known aliases шире реально реализованных project/workspace/run; may expose и known aliases имеют разный смысл | P6 |
| CLI src/services/stage-pause.ts; work-registry.ts; generated stage prompts | Смежные поверхности: aliases, файлы семантического ввода и exact commands; проверить после общей нормализации | P1, P6 |
| Eval lib/managed-flow-client.mjs; lib/operation-errors.mjs; lib/runner-events.mjs; lib/execution-state.mjs | Риск потери cause/continuation при переносе controller error в итог EVAL; проверить сквозным тестом | P4, P7 |

## P0. Зафиксировать регрессионные данные и контракты

- Создать минимальные fixtures из публичных полей CP-126: failed receipts, graph membership, structured input_file_missing. Не переносить provider session state, секреты или большой runtime DB в тесты.
- Зафиксировать последовательность и критерии: gate failure допустим; создание repair — обязательный управляемый переход; успешный Work не означает passed stage gate.
- Проверить правила репозиториев и существующие схемы перед реализацией. Не менять бизнес-inputs eval ради прохождения.

## P1. Единое разрешение контекста и путей CLI

Изменяемые места: command-inputs.ts, run-cli.ts, lifecycle-invocations.ts; общий небольшой модуль разрешения context/path; его вызовы из hook admission и engine routing.

1. Сделать источником допустимых path-параметров metadata маршрута, а не LifecycleOperation. Lifecycle wrapper использует ту же функцию.
2. Перед чтением любого объявленного файла вычислять проверенный контекст: retained invocation имеет приоритет; unmanaged CLI использует explicit project/RUN/Work с уникальным scoped resolution. Не угадывать последний RUN. Конфликт scope выдаёт structured prepare/no_effect error.
3. Нормализовать @project/@workspace/@run в parse→context→paths→prepare→execute порядке. Проверить повторную нормализацию при engine routing: абсолютный путь не меняется, scope не теряется.
4. Поддержать одинаковую семантику --option value и --option=value, quoted alias и уже поддерживаемый escaped alias. Не раскрывать алиасы внутри произвольного текста/JSON, shell-команд или неизвестных параметров.
5. Сохранить containment, проверку symlink escape, неизвестного алиаса и отсутствующего bound root. Входные и выходные пути различать; создаваемый leaf не требует существования, существующие родители проверяются.
6. Обязательные маршруты: work repair add (task-file, verification-file), stage block (summary-file, project-root), все уже объявленные contextualPaths, включая unmanaged варианты stage/work/session/recovery.
7. Инвентаризировать остальные файловые маршруты: work add-batch --file, prompt render --task-file/--workspace-root, stage fanout reconcile и stage native observe --observations-file, schema validate --file/--schema-dir, runner intake/context, run drive context/routing. Применить зафиксированную ниже политику supported roots/ordinary-path-only в metadata/help и тестовой таблице; не расширять алиасы случайно по суффиксу -file.
8. Не добавлять command в lifecycle только ради раскрытия пути. Для manual repair/block сохранить существующие mutation/owner/recovery проверки, дополнить проверкой managed scope и записью correlated outcome до/после prepare. Автоматический repair создаёт fenced controller/stage executor. Path resolver и журнал диагностики не выдают права на mutation и не подменяют invocation admission.

Приёмка: точная CP-126 команда читает реально существующий RUN-local objective; неизвестный/чужой scope и escape отклоняются до mutation. Hook и CLI получают один канонический argv.

## P2. Runtime-owned repair по aggregate failures

Изменяемые места: vnext-code.ts, vnext-code-review.ts, work-registry.ts, check-receipt storage/схемы и controller-fanout.ts.

1. Вынести общую подготовку aggregate failure continuation из CODE и CODE-REVIEW: stage/attempt, gate revision, failed receipts, workspace fingerprint, accepted declarations и origins вычисляются движком.
2. Сохранять структурированный repair intent со всеми causal failures. По умолчанию один последовательный repair на один результат aggregate gate; не плодить параллельные Work с пересекающимися файлами.
3. Цель runtime: исследовать указанные failures и восстановить accepted checks, сохранив требования. Определение конкретного исправления остаётся repair worker. Не утверждать автоматически, что любой failed check — product defect: worker может подтвердить environment blocker/contradiction; существующая политика retry сохраняется.
4. Использовать проверенные origin Work текущей реализации и accepted graph. При aggregate check без единственного владельца включить допустимый набор origins; не просить модель копировать IDs. Не вытаскивать их из prose.
5. Устранить отдельный model-authored markdown repair task для автоматического gate repair. Сохранять objective/receipt links детерминированно. Ручной CLI repair сохранить для operator/semantic сценариев с явными входами.
6. Расширить causal checks на набор receipts/declarations; worker должен доказать все назначенные причины. Исторические failed receipts сохраняются; новый workspace/check execution получает новую связь.
7. Ввести стабильную identity repair intent: project, RUN, stage, attempt, authoritative gate result/revision. Replay того же intent возвращает тот же Work; новый gate после изменений создаёт отдельный цикл. Не использовать постоянный human key code-gate-repair как identity.
8. Атомарно фиксировать intent→Work binding и durable outcome. Проверить crash до/после commit и до ответа CLI, конкурентное повторение, восстановление без дублей. Проверки команд запускаются вне длительной SQLite-транзакции.
9. Failed gate сохраняет существующий non-zero exit code и code_gate_failed/code_review_gate_failed wrapper, добавляя versioned typed continuation repair_required с зарегистрированным Work и retained failures. Это не stage success. Controller читает durable continuation до generic failure/nonprogress classification и запускает fresh child один раз. Legacy consumers продолжают видеть failed gate; новый controller умеет отличать обработанный repair transition от terminal engine failure.
10. После завершения repair — новая semantic verification и aggregate gate по существующим правилам; нельзя автоматически принять stage только по completed Work.
11. Применить к semantic repair/review finding dedup только общий механизм identity/receipt; не объединять различные семантические политики. MERGE source repair остаётся отдельным переходом со своими workspace/queue ограничениями.

Приёмка: failed CODE и CODE-REVIEW gate создают один repair без model copy IDs/paths; два failures не теряют вторую причину; replay/crash не дублируют Work; fresh child завершает repair, затем stage может пройти.

## P3. Выданная команда должна быть исполнимой

- Убрать <WORK-ID> из runtime continuations; IDs задаёт runtime. Примеры help могут содержать placeholders, operational command fields — нет.
- Для retry CODE/CODE-REVIEW/MERGE отделить семантическое recovery evidence от готового argv. Если evidence ещё требуется, вернуть typed needs_input и JSON file contract; после валидации выдать готовую команду. Не подставлять фиктивную reason автоматически.
- Общий renderer argv с shell quoting и declared mutable inputs; не собирать path/IDs конкатенацией JSON.stringify в разных services. Reuse существующий quote/parser, без новой библиотеки.
- Для файлов, которые модель должна создать, отдавать обычный абсолютный/относительный путь отдельно от CLI alias. @run не должен выглядеть как путь для apply_patch/cat.
- Не использовать receipt id с '/' напрямую как имя нового файла. Safe local basename вычисляет runtime; связь с receipt хранится структурно.
- Проверить все runtime *_command/next.command/retry_command/start_command/repair_command producers. Составить реестр producer→route→consumer и прогонять возвращённый argv через тот же CLI parser/prepare.

## P4. Причинная диагностика и защита от повторов

- Controller должен получать typed outcome из retained command/lifecycle records, а не разбирать финальный текст модели.
- Для non-lifecycle команд, влияющих на продолжение (repair/block), обеспечить correlation RUN/stage/attempt/controller turn и durable prepare/execution rejection. Это отдельная обязанность от path expansion.
- Перед повторной выдачей continuation сопоставлять stage state, pending repair intent, gate outcome и последний scoped rejection. Не использовать случайный старый error другой стадии/child.
- Сохранить original code/message, phase/effect, failed command route, gate/repair references. fanout_stage_nonprogressing остаётся fallback при отсутствии доказанной причины, с before/after fingerprint и outcome references.
- Учитывать authoritative semantic progress: новая repair registration, gate result, explicit blocker/HITL, stage completion. Чтение файлов, повторные observe/reconcile и переписанный prompt не считаются прогрессом.
- Не увеличивать retry budget как лечение данного дефекта. Identical settled continuation без разрешённого перехода останавливается; живые children/checks ожидаются по их lifecycle.
- Проверить propagation через dd-eval managed-flow-client, operation-errors, runner-events, execution-state и итоговый report. Failed gate с repair_required не должен превращаться в terminal EVAL failure; настоящий engine error должен сохранить cause.

## P5. Явная принадлежность Work графу стадии

- Ввести единый selector membership для stage/attempt/review cycle; persisted Work membership должен позволять отличить PLAN, PLAN-REVIEW, CODE, CODE-REVIEW и repair cycles. Generation — fencing владельца исполнения, а не фильтр, исключающий незавершённый Work после recovery.
- counts, ready, dependency closure, dispatch и fingerprint используют один selector. Нельзя отфильтровать только отображаемый completed count.
- Review repair должен принадлежать текущему review cycle, даже если его product packet имеет code-work schema и origin CODE Work. Исторические origins доступны как evidence, но не запускаются заново.
- Проверить native-child reconciliation при session reuse: наблюдать нужную topology, учитывать origin stage, не скрывать незавершённых/осиротевших детей фильтром.
- Для старых runs сохранить status и исходный engine pin; неоднозначный запуск на новом controller возвращает диагностированный compatibility blocker, как определено ниже. Не мигрировать старые runs эвристически во время status.
- Добавить явное runtime-owned membership storage: текущие works и fanout descriptor не содержат надёжной stage/attempt связи. Новая версия миграции и тесты clean install/upgrade обязательны. Не добавлять техническую принадлежность в JSON, который должна писать модель.

## P6. Промпты, канон, help и ранбуки

- Обновить CODE/CODE-REVIEW rendered prompts в vnext-code.ts/vnext-code-review.ts, controller-fanout.ts и work-registry.ts: repair уже зарегистрирован, coordinator заканчивает ход, fresh child получает ready Work.
- Удалить инструкции писать repair_task_file, подставлять origin IDs и выполнять template repair_command для автоматического gate repair.
- Сохранить JSON-file-first для semantic decisions, verification, review evidence и пользовательских файлов; Bash содержит только отдельный вызов CLI.
- В dd-memorybank common/runtime-cli.md и runtime-contract.md согласовать реально поддерживаемые aliases. Не объявлять @stage/@protocol/@intake/@plan/@aspect-map реализованными без resolver/tests; возможные будущие алиасы пометить отдельно.
- Проверить канонические CODE/CODE-REVIEW/MERGE инструкции, примеры, CLI help и snapshot tests по реестру ссылок; generated copies обновлять штатной сборкой.
- Eval runbook: actual stage по timeline/controller, Work completion отдельно от aggregate gate, primary cause отдельно от guard. Сообщать repair cycle transition и связанные checks; не интерпретировать любой guard как «модель зациклилась».

## P7. Регрессионная матрица

| Группа | Обязательные сценарии |
| --- | --- |
| Path contract | Каждый declared contextual path route; managed/unmanaged; separated/equals argv; quoted/escaped alias; spaces/non-ASCII; unavailable root; traversal/symlink escape; scope conflict; engine routing |
| Exact returned continuation | CP-126 CODE gate; CODE-REVIEW gate; ручной repair task-file; semantic repair verification-file; stage block summary-file; выполнение выданных полей вместо ручной реконструкции |
| Repair lifecycle | Один/несколько failed checks; replay; concurrent duplicate; crash before/after binding; fresh child; исправление вызывает новый failure; accepted requirement contradiction; environment blocker |
| Stage graph | Root содержит PLAN/PLAN-REVIEW/CODE; новый review cycle; historic repair; shared session children; пустой graph; blocked dependency; no cross-stage dispatch |
| Controller | Gate→repair — прогресс; alias rejection сохраняет cause; unchanged read/observe — не прогресс; missing typed result — явный fallback; живой check не считается зависанием; HITL regression |
| Eval | controller cause до report; repair_required не terminal failure; failure cleanup/recovery sealed; no automatic resume |
| Contract drift | Все generated executable commands parser/prepare-valid; no unresolved placeholders; docs vocabulary совпадает с resolver; новые path routes требуют явного решения |

Расширить существующие lifecycle-invocations, run-controller, vnext-fanout-storage/reconcile, vnext-protocolize tests; не создавать дублирующий тестовый фреймворк. Изолировать filesystem/DB/provider fixtures, не изменять retained CP-126. Проверить dist/published entrypoint хотя бы одним regression smoke, чтобы не ограничиться source helper.

## P8. Выпуск и новая квалификация после реализации

1. Review изменений и матрицы, targeted tests, затем обязательные typecheck/lint/build/full suite по правилам репозитория.
2. Согласовать canon/CLI изменения и commit tuple, выпустить новую версию штатным release workflow; проверить опубликованные tag/dist-tag/build-info/integrity.
3. Создать следующий свободный clean checkpoint на основе CP-126: source/flow/memory-bank inputs сохраняются согласно qualification contract; изменение canon, если оно необходимо для фикса, фиксируется явно и не маскируется как engine-only. Не копировать runs/runtime DB/conformance state.
4. Published engine install, штатный Luna preflight. Только PASS допускает scored E2E. Commit/push checkpoint/case/runbook по отдельному implementation scope.
5. Мониторить реальные stages, repair cycles, native turns, process ownership и structured causes. При terminal failure — read-only RCA; без автоматического resume или ослабления gate.
6. Если live E2E не вызвал repair, он не доказывает исправление repair path: обязательный deterministic forced-failure integration остаётся отдельным release evidence.

## Порядок выполнения и критерий завершения

P0 → R0 (контракты и storage) → P1/R1 → P5/R4 → P4/R5 (reader) → P2/R3 и P3/R2 (producer) → P4 (сквозное подключение) → P6 → P7 → P8. Тесты пишутся вместе с соответствующим пакетом; P7 — сквозная проверка всех связей. Membership предшествует repair, потому что определяет его origin scope. Reader typed continuation внедряется до включения нового producer в общем релизе. Не строить новый orchestration framework.

Фикс завершён, когда точный класс CP-126 покрыт сквозными тестами, автоматически известные параметры больше не переписывает модель, repair recovery идемпотентен, graph не смешивает стадии, ошибки сохраняют причину, канон соответствует CLI и опубликованный engine прошёл отдельную чистую квалификацию. Непройденные пункты явно остаются открытыми.

## Дополнения к исходному предложению

Добавлены stage block и unmanaged path handling; полный реестр файловых маршрутов; несколько causal failures; replay/concurrency/crash repair; placeholders в retry трёх стадий; разделение input needed и executable command; output file path versus CLI alias; реальная stage/attempt membership; typed rejection вне lifecycle; end-to-end error propagation; расхождение alias vocabulary канона; тест опубликованного entrypoint и forced repair qualification.

Аудит установил перечисленные дефекты и поверхности риска поиском producers, consumers, route metadata и тестов. Это не утверждение об отсутствии неизвестных дефектов: закрытие полного реестра маршрутов/команд и его автоматическая проверка входят в P1/P3/P7.

## R0–R5. Обязательный целевой рефакторинг

Имена новых файлов ниже — целевые имена; допускается использовать существующий подходящий модуль, сохранив границы ответственности. Не создавать параллельную реализацию рядом со старой.

| Шаг | Общий компонент и контракт | Все обязательные потребители | Проверка |
| --- | --- | --- | --- |
| R0 | Versioned continuation, stage membership и repair identity; типы и runtime validation на границе сохранённых данных | Controller, CLI outcome writer, fanout, repair registry, eval error projection | Round-trip storage; unknown version; migration |
| R1 | services/command-context.ts: resolveCommandContext(route, parsed, authority, lookup); shared/contextual-paths.ts: resolveContextualPaths(parsed, pathPolicy, roots) | run-cli перед prepare, lifecycle-invocations, hooks admission и engine routing | Таблица маршрутов; aliases; scope conflict; idempotent normalization |
| R2 | services/runtime-command.ts: готовый executable argv плюс shell renderer; required semantic input оформляется отдельно | CODE/CODE-REVIEW/MERGE finish/retry, stage pause/resume, Work completion и repair commands | Render→parse round-trip; standalone command; нет незаполненных placeholders |
| R3 | services/repair-intents.ts: prepareAggregateRepair(snapshot) и ensureRepairWork(prepared, ownerFence) | CODE и CODE-REVIEW failed gate; общий registration primitive для semantic/review repair | Replay, race, crash, multiple failures; полный CLI→controller сценарий |
| R4 | services/stage-work-graph.ts: loadStageWorkGraph(scope) и чистая projectStageWorkGraph(rows, memberships, dependencies) | fanout counts/ready, controller dispatch, progress fingerprint; reconciliation получает тот же membership | Смешанный root, attempt/cycle, recovery generation, cross-stage dependency |
| R5 | services/continuation-outcome.ts: validate/load correlated outcome и decideContinuation(snapshot) | run-controller, controller-fanout, terminal diagnostics; eval переносит public projection | Приоритет repair/block/error; stale causes; no-progress fallback |

Границы функций:

- R1: разрешение authority и чтение DB отделены от чистой подстановки пути. Файловые проверки существования/realpath выполняются явно в prepare. Hook использует те же нормализованные значения, но не читает пользовательский JSON повторно и не получает право на исполнение от resolver.
- R2: принимает аргументы массивом, не shell fragments. Внутренний executable path и поддерживаемый runtime launcher token различаются типом/вариантом, чтобы quoting не превратил $DD_FLOW_BIN в буквальное имя файла. JSON.stringify не используется как shell escaping. Никаких eval или command substitutions.
- R3: подготовка валидирует immutable receipts и строит минимальный intent; registration проверяет owner fence и unique identity под транзакцией. Внутри транзакции нет запуска checks, модели, shell и ожидания. Существующий addWorkBatch получает внутренний transaction-safe primitive без смены публичного API; не полагаться на случайную поддержку вложенных транзакций.
- R4: query отделена от чистой projection. Stage membership не выводится по result_schema или имени Work: review repair может иметь code-work packet. Dependencies вне текущей стадии учитываются как сохранённые prerequisites, но не добавляются в dispatch set.
- R5: чистая decision функция не вызывает модель, не создаёт repair и не меняет DB. Исполнитель выполняет только возвращённое разрешённое действие. Ошибки не извлекаются из prose; отсутствие структурной причины явно отражается в диагностике.
- Stage-specific policies остаются в vnext-code.ts/vnext-code-review.ts/vnext-merge.ts: принятие verification/decision, выбор review findings, MERGE target и queue ownership. Общий helper не решает продуктовые вопросы и не содержит флагов, подменяющих эти политики.

## Зафиксированные решения для реализации

### Storage и совместимость

1. Источник истины для новых Work — отдельная runtime membership запись с project/RUN, work_id, stage, stage_attempt и cycle (пустой для нециклического случая). Stage attempt берётся из текущего accepted stage state, а не timestamp или имени каталога. Запись создаётся в той же транзакции, что и Work; attach уже созданного Work выполняется явно при materialization стадии.
2. Fanout descriptor новой версии указывает scope стадии/attempt; SQLite хранит membership, JSON является проекцией. Нельзя вести два независимых изменяемых списка Work IDs. После crash проекция восстанавливается из committed DB.
3. Repair intent хранит уникальный key, scope, canonical payload hash, причинные receipt refs, origins, bound work_id и итог регистрации. Identity для aggregate: project/RUN/stage/attempt + отсортированный набор causal receipt IDs и их verification epoch/workspace fingerprint. Generation проверяется как fence при записи и не создаёт новый intent для тех же причин. Semantic/review repair используют собственную stable accepted decision/cycle identity.
4. UNIQUE constraint и payload hash защищают от гонок: identical key+payload возвращает прежний Work; key с несовместимым payload выдаёт conflict. Повтор завершённого repair не создаёт новый Work. Повтор failed gate с теми же причинами без новой evidence не запускает бесконечный repair цикл.
5. Multi-receipt repair вводит новую версию runtime packet, если текущая schema не допускает поля. Reader поддерживает старый singular check_receipt_id, новые writers сохраняют весь набор. Старые accepted packets не переписываются и не получают выдуманный receipt.
6. Для legacy runs status остаётся доступным. Старый engine pin не меняется. Новый controller не выполняет неоднозначный legacy graph: возвращает конкретный compatibility blocker с сохранённой диагностикой. Возможное обновление legacy membership — отдельная явная migration, не side effect status; массовый backfill исторических runs не нужен для нового clean E2E.
7. Изменения включить во все существующие SQL bootstrap/upgrade пути src/storage/database.ts; тестировать одинаковую схему fresh/upgrade и rollback транзакции. Миграция выполняется штатным writer admission без обхода активных владельцев.

### Typed continuation и приоритет решения

Public outcome содержит schema_id/version, kind, project/RUN/stage/attempt, revision/identity, source operation reference; поля по варианту: work refs, required input contract либо error с cause. Варианты: waiting, repair_required, needs_input, blocked, stage_completed, failed. needs_input для recovery evidence не создаёт пользовательский HITL автоматически: actor явно coordinator или operator по существующей policy; product question остаётся отдельным HITL.

Порядок решения после завершения coordinator turn:

1. Проверить owner fence, terminal/cancel/recovery state.
2. Прочитать принятый stage completion/HITL/block и незавершённые физические операции.
3. Загрузить свежий correlated gate/repair outcome текущей стадии/attempt. repair_required допускается только если Work binding существует и валиден; ошибка создания repair терминальна с исходной причиной.
4. Dispatch только ready Work текущего графа; живые check/child owners ожидаются, без повторного запуска.
5. При незавершённом семантическом решении разрешить соответствующее continuation один раз на authoritative revision. New rejected CLI input сам по себе не обнуляет guard и не считается успехом; допускается только явно выданный безопасный corrected retry.
6. При совпадении meaningful progress fingerprint: если есть нерешённая correlated ошибка — сообщить её; иначе fanout_stage_nonprogressing с evidence. Повторный timestamp, prompt, чтение и observe не изменяют fingerprint.

Controller reader и assertLifecycleOutcomes должны обрабатывать валидный repair_required согласованно: non-zero code_gate_failed не должен вызвать stop до чтения зарегистрированного repair. Все остальные error outcomes сохраняют существующую остановку. Сначала покрыть этот порядок интеграционным тестом, затем включить автоматический producer.

### Политика дополнительных файловых маршрутов

Все уже объявленные contextualPaths поддерживаются полностью. Дополнительно включить входные file/task-file/observations-file у work add-batch, prompt render, stage fanout reconcile, stage native observe и schema validate; @run допустим только при единственном доказанном RUN. Для schema validate --schema-dir оставить ordinary-path-only (внешний каталог схем). run drive routing/context packages и pre-RUN bootstrap paths оставить ordinary-path-only до создания RUN; явно отклонять @run, не искать файл с буквальным @. Общие project/workspace roots поддерживать лишь при уже установленном контексте. Для прочих путей реестр обязан явно указать policy; новая строка без policy — ошибка contract coverage test.

## План миграции вызовов и удаления дублирования

1. Добавить characterization tests для действующих managed stage/work/HITL команд и CP-126 reproducer.
2. Ввести R0 типы/storage readers, затем R1 общий resolver. Старый expandLifecycleInvocationArgs временно делегирует R1; все его callers переводятся без смены ownership.
3. Ввести R4 membership/projection и перевести fanout status, ready selection, controller fingerprint. Удалить выборку «все дети root = текущая стадия».
4. Ввести R3 repair intent registration и R5 reader/decision. Применить сначала к CODE, затем CODE-REVIEW; проверить каждую ветку gate rejection. Не оставить отдельный legacy auto-repair producer в одной из стадий.
5. Перевести command producers на R2, сохранив manual CLI contracts. Удалить duplicated repair_command templates и retry placeholders; migration tests проверяют все зарегистрированные producers.
6. Обновить schema readers/writers, prompts/canon/help/eval projection одним согласованным набором commits. В packaged dist должны попасть ровно эти версии.
7. Удалить временные wrappers, если нет внешнего consumer; публичные совместимые adapters оставить тонкими, без собственной логики. Поиск старых шаблонов, resolver-копий и parent-only stage selection — обязательная часть review.

## Проверка готовности плана, ревизия 2

Проверено чтением актуального кода: addWorkBatch всегда выделяет новые Work IDs; check-based repair не имеет отдельного replay lookup. Это подтверждает необходимость idempotency key, а не только теста существующей защиты. works не хранит stage/attempt membership; fanout descriptor хранит только stage и parent. В controller есть assertLifecycleOutcomes после adapter prompt — его необходимо обновить вместе с обработкой non-zero gate continuation.

| Проверка плана | Результат |
| --- | --- |
| Причина CP-126 связана с конкретными producer/consumer и regression | Готово: P0/P1/P2/P7 |
| Общие компоненты имеют границы, callers и тесты | Готово: R0–R5 |
| Порядок шагов не использует отсутствующий membership/outcome reader | Исправлено: R0/P5 до включения repair producer |
| Exit/error compatibility и обработка repair_required определены | Готово: non-zero wrapper + durable typed continuation |
| Повтор, гонка, crash и generation рассмотрены | Готово: unique intent, fence отдельно от membership |
| Stage-specific semantic policy не переносится в универсальный helper | Готово: явные границы R3/R5 |
| Scope, unsupported aliases и bootstrap маршруты определены | Готово: P1 и таблица политики |
| Canon/prompts/help и удаление старых веток включены | Готово: P6 и migration steps |
| Unit tests дополнены настоящим CLI/controller и published smoke | Готово: P7/P8 |
| Критерии выпуска и чистой квалификации определены | Готово: P8, forced-failure proof обязателен |

План готов к реализации: незакрытых продуктовых или архитектурных решений, требующих отдельного согласования, не осталось. Выбор имени модуля, номера миграции/релиза и конкретного SQL индекса — технические детали исполнения. Проверка готовности плана не означает, что код реализован, тесты пройдены или live E2E успешен. В ходе реализации новые подтверждённые зависимости фиксируются в этом документе и покрываются тестами до объявления соответствующего пакета завершённым.
