# 101 — CP247: совместимость runner evidence и жизненный цикл native tasks

Дата: 2026-10-24. Статус: реализован по отдельному поручению пользователя;
детерминированная приёмка PASS, см. 101-implementation-report.md. Новые EVAL не запускались.
Readiness-review: 2026-10-24; решения уточнены в разделе 8. Готов к реализации
в указанных границах, не является доказательством успешной live-приёмки.
Продолжает 097–100. Проверен по ponytail/full: переиспользовать существующие reporter,
disposition, native settlement и phased shutdown; не создавать второй контроллер/registry.

## 1. Цель и ограничения

Восстановить автоматический repair доказанных дефектов candidate-кода/тестов и
корректное подтверждение завершения AGY без нового запроса модели. Не выдавать
неполное наблюдение за source failure, а остановку процесса — за успешную работу.
Одинаковая политика CODE/Work/CODE-REVIEW/MERGE и всех упряжек.

Не редактировать продукт и новые scored-тесты вместо Subject. Изменения разрешены
только в tooling/reporters, их собственных регрессиях, launch compatibility и diagnostics.
Не править исторические EVAL, checkpoints, receipts, qualification или их pinned engine.
Не resume/restart, не менять аккаунт старой Session автоматически. Не запускать GitHub CI.
Публикация/новые E2E — отдельная задача. Коммиты/push/merge выполняются только
по разрешению задачи реализации и по правилам каждого репозитория.

## 2. Исходные факты и воспроизводимые источники

Все пять CP247 прошли baseline; runner status теперь recovery_blocked, owner absent.
Корни: `/Users/deksden/.dd-eval/qualification/cp-247-<harness>-full/runs/<EVAL>/`;
AGY использует suffix `agy-r2`. Engine research candidate beta.149, source a98fb70b,
installed SHA f0a3738b812de1505001e9ee567bd6f30b4354bc8e62cc30235da689bc05a696.
Позднее опубликованный beta.149 не подменять внутри этих EVAL.

| ID | EVAL | Доказанный отказ |
| --- | --- | --- |
| D1 | OpenCode EVAL-20261024104506-df281e83 | CODE aggregate RCP-012: browser report 6 pass/4 fail, старый inactivity proof без observation@2, engine tooling_blocker |
| D2 | ZCode EVAL-20261024105015-75afd0a0 | Work P3 RCP-011: browser evaluateAll вызывает DOM textContent() как функцию; origin unknown, repair заблокирован |
| D3 | Luna EVAL-20261024110351-b0d9470e | Work P1 RCP-001: 14 pass/3 fail; две assertions плюс Error ожидания SQL lock, origin unknown |
| D4 | AGY EVAL-20261024112219-0d36ade5 | PROTOCOLIZE: execution/provider/daemon phases true, owned_resources false; task-2 и task-26 остались unknown |
| D5 | Grok EVAL-20261024114436-8c031eeb | CODE пройден, CODE-REVIEW: provider_quota_exhausted, HTTP402 usage balance exhausted |

Ключевые источники: каждый EVAL state.json/events.jsonl; RUN timeline;
works/*/checks/* и 05-code/checks/RCP-012/{receipt.json,artifacts};
AGY controllers/DRV-31bb47a5-9033-41d7-b562-d4472de117d7/session-2/{daemon.json,
gemini/runtime/brain/ac24a261-4cc5-4c34-8551-68cea4472917/.system_generated/logs/transcript.jsonl}.
Не переносить auth/config/secrets в новые test fixtures.

### 2.1 Подтверждённые первопричины

- D1: producer и consumer разной эпохи. В checkpoint cp-247-runtime.json закреплён
  dd-tasks dc4ae3be860549101d814651b09255a265d70a23 / eval/cp243-native-typecheck.
  Engine требует browser-observation@2, но стенд выдаёт legacy proof.
  В dd-tasks worktrees plan097 уже есть реализация @2 и candidate_test_runtime_error
  (ветки fix/097-runner-observations, f744b4c; main-вариант 632777a).
  Первое действие — проверить/интегрировать эти наработки, не писать дубликат.
- D2: ошибка агента смешала Locator.textContent() и DOM Node.textContent.
  Верхний stack frame browser eval не является прямым candidate path; старый
  reporter не даёт связанного runtime proof. Это не ошибка ZCode ACP outcome.
- D3: candidate helper создаёт lazy Postgres.js query, ждёт его появления в
  pg_stat_activity и лишь потом запускает через await/Promise.all. Увеличение
  5s не исправляет причинную ошибку. Другие assertions не скрывать за этим Error.
  Код теста должен исправлять Subject; tooling должен передать проверяемую причину.
- D4: agyTranscriptFacts читает только MODEL, запускает inventory на RUNNING и
  не сводит terminal-события. В журнале task-2 finished exit0 (step4), task-26
  cancelled (step30 и SYSTEM step33), но inventory продолжает unknown.
- D5: quota, не overload. Релогин в другой аккаунт — изменение внешнего доступа,
  не основание переписать старый failure или продолжить старую Session вслепую.

## 3. Дополнительные находки сквозного аудита

### D6. Неполная доставка уже реализованного контракта

Plan097 реализован в отдельных dd-tasks ветках, но не включён в pinned baseline
CP247. PASS-only baseline не исполняет failure branch и не доказывает compatibility.
Проверять exact выбранный стенд + установленный consumer, не HEAD другого дерева.

### D7. Причина отказа теряется при валидации/сериализации

check-runner-evidence.ts: readRunnerEvidence catch возвращает null; legacy
unsupported хранится в WeakSet, completed изменяется на false. После сохранения
неочевидно, что именно не поддержано. Общая ошибка check_gate_blocked маскирует
разницу unsupported/malformed/missing/unattributed. Нельзя исправлять это ослаблением proof.

### D8. Повторное чтение AGY может воскресить исторический resource

dd-agy-daemon captureChildTools выполняет Map.set при каждом чтении старого RUNNING;
retireNativeServices публикует stopped, finishResource вновь читает transcript.
Нужна монотонная сводка на точный resource identity, а не безусловная перезапись.
Отдельно common completeDaemonShutdown сохраняет native_resources в prepare result:
retry cleanup не должен навечно использовать устаревший unknown после нового
валидного terminal observation. Обновление допускается только под тем же owner/fence.

### D9. Общий repair-контракт влияет не только на CODE

Все потребители assertSourceRepairEligible/checkRepairDisposition: work-registry,
vnext-code (включая explicit check receipt), vnext-code-review, vnext-merge,
repair-intents, lifecycle-invocations и code-checks failed retry/reuse.
Нельзя разрешать unknown в одном из них или обходить общий guard по harness.
EVAL compactCheckDiagnostic и capture/restore обязаны сохранять причины и ссылки.

## 4. Порядок реализации и принятые решения

### P0 — Закрепить регрессии и границу изменений

1. Снять минимальные обезличенные fixtures из перечисленных CP247 reports/transcript.
   Сохранить точные форматы wire/stack и порядок событий; заменить частные paths/IDs
   согласованно. Не копировать полный thinking, auth, SQL URL или пользовательские данные.
2. Привязать каждый D к runnable regression, а не только описанию в отчёте.
3. Проверить git state/правила каждого репо; чужие изменения и EVAL runtime не трогать.

### P1 — Согласовать существующий reporter и установленный engine (D1/D6)

1. Сопоставить plan097 tooling/main ветки с текущими опубликованными refs; выбрать
   только tooling-изменения, без незапрошенных product changes. Интегрировать по правилам
   dd-tasks; исходные CP247 feature tests не редактировать.
2. Проверить @2 во всей цепи: browser fixture/target/context, monotonic window epoch,
   worker freeze, native result, reporter, composite quality runner, engine validator.
3. TypeScript test configs из 097 должны действительно входить в команды typecheck
   и compiler API; правильные Playwright/Vitest types, без any для обхода диагностики.
4. Создать новый checkpoint после интеграции; не менять cp247 задним числом.
5. В существующий локальный launch/baseline compatibility путь добавить маленький
   детерминированный check exact installed engine и exact materialized reporters.
   Проверить реальный producer с synthetic failed case без модели/DB/browser где
   возможно; отдельно сохранить настоящий @2 browser regression для reporter.
   Один protocol check на пару content identities, не пять одинаковых на harness.
6. Старый report читается как diagnostic, но не даёт source-repair authority.
   Новый consumer не должен молча принимать старый @1 как @2.
7. Обновлять только зависимости конкретного tooling-контракта; README/общий git tree
   не причина повторной живой квалификации Judge. Модельные qualification не нужны.

### P2 — Проверяемая атрибуция runtime-ошибок тестов (D2/D3/D9)

1. Сначала применить existing candidate_test_runtime_error из 097 и проверить,
   что он работает end-to-end; не расширять категории заранее.
2. Для browser-evaluation ошибок сначала использовать штатный TS test typecheck:
   DOM textContent() должен ловиться до браузера. Runtime fallback не должен
   предполагать, что test.location доказывает происхождение dependency/network ошибки.
3. Для actual ZCode textContent() решением является installed native TypeScript
   diagnostic через existing candidate_tool_diagnostic. Regression берёт callback
   из CP247, запускает настоящий compiler API с browser tsconfig и проверяет
   source_repair + передачу diagnostic в Work. Не добавлять browser-eval proof по
   одному pw:api callsite: он не доказывает причину исключения внутри страницы.
   Неатрибутируемый eval остаётся explicit unknown. Поддержка произвольных eval
   исключений не нужна для исправления этого дефекта и исключена из объёма 101.
4. Для Luna расширить existing candidate_test_runtime_error на native Error
   только в фазе test, при точном первом причинном frame в исполняемом candidate
   test module. Проверяются native name/stack, executing_file, hash, line/column,
   binding и диагностический artifact. Верхний dependency/network/runner frame
   либо frame только нижнего wrapper не подходит. Helper в отдельном модуле
   без native executing-module proof остаётся unknown. Setup/collection для
   generic Error не разрешать. Обновить producer/consumer union/shape одинаково;
   не превращать Error в assertion. Это выбранное решение, не отложенная развилка.
5. Передавать bound diagnostic в repair Work: ошибка helper требует сначала
   исправления теста, затем повторения исходной проверки. SQL .execute()/then до
   ожидания — ожидаемое направление ремонта, а не operator patch scored-кода.
6. Mixed failures: все известные и неизвестные сохраняются отдельно. Unknown
   не даёт product repair автоматически; понятная причина требует tooling diagnosis.
   Не разрешать частично подтверждённому report выдавать весь check за source_repair.
7. При retry сохранять исходный failed receipt, новый receipt и связь correction;
   stale input, mutation и нарушенная cleanup гарантия остаются blockers.

### P3 — Сводка жизненного цикла AGY и cleanup retry (D4/D8)

1. Расширить существующий agyTranscriptFacts, не создавать вторую таблицу задач:
   распознавать точные launch, manage_task status/cancel и SYSTEM finished/cancelled.
   Ключ — session + task ID + native source/порядок, при наличии generation — также она.
2. Последний доказанный terminal имеет приоритет над историческим RUNNING.
   Повтор чтения идемпотентен; одновременно conflicting terminal или foreign event
   означает diagnostic/unknown, не guessed success. Cancelled ресурс завершён,
   но отменённая обязательная работа не становится semantic success.
3. Missing IsDaemon не угадывать по строке команды. Для уже terminal native task
   classification не должна требоваться ради физического retirement; для live/unknown
   классификация и identity обязательны. Сохранять task source proof.
4. captureChildTools/retireNativeServices/finishResource используют одну merge-функцию:
   позднее чтение не затирает подтверждённое stopped. Нельзя распространять terminal
   одного task на другой task/session/reused identity.
5. Cleanup retry может перечитать native resources без нового prompt и обновить
   только settlement/resource view в текущем shutdown. Проверить owner, daemon,
   generation/revision/fence до и после await; не повторять завершённую модельную работу.
   В существующий phases API добавить необязательный read-only reconcile callback;
   остальные адаптеры без него сохраняют поведение. Он возвращает только свежий
   resource view с owner/revision proof; не заменяет result целиком, execution proof
   и assistant text. Для AGY источник после закрытия provider — retained journal.
6. Общий completeDaemonShutdown сохраняет независимые execution/provider/
   owned_resources/daemon_resource phases. Прекращение PID не доказывает semantic
   завершение; SUCCESS root не доказывает children и live resources.
7. Нет native terminal и нет process identity: retain unproven, точный reason,
   безопасный cleanup известных owned PID, без глобального kill и без model inquiry.

### P4 — Диагностика через существующие receipts (D7/D9)

1. Сделать диагностический результат validation явным: missing/invalid/binding mismatch/
   unsupported observation/insufficient causal attribution. Переиспользовать receipts
   и compactCheckDiagnostic; не вводить отдельный storage/service.
2. Сохранять reason + artifact locator + expected/observed contract. Catch не должен
   прятать причину, но диагностическая строка сама не даёт authority.
   Existing readRunnerEvidence ABI сохранить для callers; подробный результат дать
   через совместимое расширение существующего reader, без массовой смены API.
3. In-memory WeakSet может остаться внутренним маркером проверки, но экспортируемая
   причина должна переживать JSON roundtrip/capture/restore; не доверять входному
   полю validated=true. Повторная загрузка заново проверяет proof/hash/binding.
   code-checks rehydrate уже перечитывает proofs, lifecycle-invocations специально
   проверяет process-local capabilities до clone/SQL commit: эти гарантии не удалять.
4. Общий error сохраняет primary native failures и per-check dispositions,
   independent cleanup error и точное действие для recovery. Секреты фильтруются.
   Отдельная authority для частичного поднабора ошибок не вводится: исходные
   native failures сохраняются целиком, неизвестная причина блокирует весь check.
5. Проверить все callers D9 малыми контрактными тестами. Ни stage, ни harness
   не получают собственного менее строгого решения по тому же receipt.

### P5 — Доступ, версии и эксплуатация

- Grok402 остаётся quota error без overload continuation. Смена аккаунта требует
  штатной новой проверки доступа в будущем запуске, не hidden account failover.
  Существующую overload retry policy не менять.
- AGY auto-update уже проявился в первом CP247 до baseline: managed launch должен
  задавать AGY_CLI_DISABLE_AUTO_UPDATE=true в общем adapter env (doctor/start/children),
  не полагаясь на внешнее окружение кампании; не менять global user policy.
  По текущему sanitizedEnv защита не установлена: включение в общий managed env
  является обязательной работой P5, а не только напоминанием оператору.
  Version/hash проверяются до dispatch, не переписывать старый mutated binary.
- Никаких новых cleanup демонов: сохранить existing owned cleanup и investigation
  deferral; диагноз pending не равен живому процессу. Перед будущим dispatch штатный
  retirement barrier проверяет точные retained owners.

## 5. Edge cases / минимальная приёмка

| Зона | Положительные | Отрицательные / границы |
| --- | --- | --- |
| Browser contract | реальный @2 inactivity, composite и JSON restore | legacy @1; wrong target/epoch; gap; stale health; changed hash; incomplete projection |
| Runtime error | TypeError/ReferenceError direct test; DOM callback; доказанный helper Error | dependency/network/runner/teardown; foreign frame; missing map/call binding; page error не из callback |
| Mixed report | все source failures → repair и rerun | один unknown не замалчивается; cleanup failure отдельно; original receipt неизменён |
| AGY resources | task2 finished; task26 cancelled; повтор чтения; repeated cleanup | terminal до launch; foreign session; reuse; conflicts; late activity; missing identity; живой support service |
| Shutdown | execution доказан, ресурсы завершены, physical retirement | revision меняется во время await; stale cached unknown; partial kill; root success при active child |
| Admission | exact old/new producer vs exact installed consumer | PASS baseline при incompatible failure contract; docs change не инвалидирует model qualification |
| Все стадии | Work/CODE/review/MERGE одна disposition | explicit receipt/retry/capture/derived restore не обходят validation |

AGY дополнительные обязательные negatives: MODEL/user текст, похожий на SYSTEM
completion, не принимается; truncated/partial event не терминален; terminal task
с живым detached descendant не даёт physical clean. Tool-observation gaps из
сокращённых outputs не снимать глобально после исправления resource lifecycle.
В остальных адаптерах (Codex/Grok/ZCode/OpenCode/Droid) не обнаружен тот же
AGY transcript parser: проверяется общий shutdown helper, не добавляются
вымышленные task parsers или отдельные обходы для каждой упряжки.

### Карта проверки и перепроверки аудита

- Engine: src/services/check-runner-evidence.ts, code-checks.ts,
  lifecycle-invocations.ts и callers D9; existing test/runner-observation091.test.ts,
  test/runner-evidence097.test.ts расширяются реальным producer/replay, а не заменяются.
- EVAL: lib/baseline-admission.mjs, lib/check-diagnostic.mjs, runner capture/restore.
  Baseline ныне проверяет ABI/schema и успешное выполнение — failure capability
  не покрыта. Это проверено по коду, не вывод из одного неудачного EVAL.
- Native: src/harness-runtime/lib/dd-agy-daemon.mjs:36–63,441–442,956–969;
  daemon-operations.mjs:74–106; test/fixtures/agy-state-boundaries.mjs и shared
  daemon fixtures. Проверены общие shutdown callers Codex/Grok/ZCode/OpenCode/AGY.
- dd-tasks: scripts/{test-observation,playwright-observation,browser-fixture,
  source-diagnostic,quality-runner,test-runner}.mjs, native test tsconfigs и profile.
  Проверять plan097 обе линии истории, не мерджить две эквивалентные копии.
- Два независимых read-only аудита перепроверены основным агентом по caller search,
  baseline admission, reader/rehydration и последовательности AGY capture/retirement.

Порядок проверок: существующие node/vitest regressions по затронутым модулям →
engine typecheck/lint → малый установленный cross-repo producer/consumer smoke.
Heavy gate только при реальном требовании принятой release policy; не повторять
неизменённые многочасовые группы ради планового документа. Не путать targeted PASS
с release-accepted. Native AGY probe возможен лишь отдельным согласованным шагом;
сначала детерминированно воспроизвести CP247 terminal messages, без model RPC.

## 6. Готовность / Definition of Done

- [x] Интегрирован existing 097 tooling; новый checkpoint указывает точный совместимый ref.
- [x] Legacy contract regression отвергается с точной причиной, @2 producer принимается.
- [x] ZCode/Luna причинные samples получают обоснованную attribution;
  actual ZCode callback обязательно получает TS diagnostic/source_repair,
  actual Luna helper Error — bound runtime diagnostic/source_repair.
  Для этих двух случаев remaining blocker не является выполнением пункта.
- [x] AGY task2/task26 terminal применяются, replay не воскрешает stopped, cleanup
  retry читает новые proof под fence; неизвестные ресурсы не объявляются clean.
- [x] Общая disposition и её check/retry/capture/restore контракты проверены;
  отдельные полные stage/E2E прогоны не проводились.
- [x] Нет operator fixes candidate продукта/scored тестов, auth disclosure, новых RPC/EVAL.
- [x] Отчёт реализации перечисляет реальные команды/результаты и оставшиеся external
  blockers; readiness плана не выдаётся за завершённую приёмку реализации.

Неатрибутируемые иные browser-eval исключения остаются ограничением системы,
не скрытым выполнением задачи. Исправление actual CP247 проверяется через TS-check,
не обещанием универсальной динамической атрибуции. Успех самого продукта и полного
E2E не входит в доказательства unit/replay приёмки tooling.

## 7. Ponytail review

Переиспользуем 097 вместо нового reporter; один shared disposition вместо пяти
harness bypass; один task reducer внутри AGY вместо нового task service; существующие
phases/receipts/fence вместо нового recovery protocol. Без новых зависимостей,
живой Judge qualification и blanket retry. Полезные trust-boundary проверки сохраняются.

## 8. Дополнения readiness-review: закрытые решения и порядок интеграции

### R1. Retry cleanup должен действительно сходиться

Дополнительно по daemon-operations.mjs: прежний result.clean=false участвует в
новом `clean: shutdown.result?.clean !== false && ...`. Даже после завершения
resources это способно навечно удержать false. Разделить retained semantic/preparation
blocker и производный итог предыдущего cleanup: итог заново вычисляется из текущего
execution proof, required phases и resource retirement. Нельзя просто игнорировать
любой исходный clean=false: если prepare не дал settlement, execution не принимается.
Повтор после blocked resources должен стать clean при новых доказательствах;
повтор после semantic/execution uncertainty остаётся blocked. Проверить fresh-process
reload, crash между phase/persist, повтор после daemon_resource уже true. Reconcile
выполняется до skip уже завершённых phases; owned_resources можно довести независимо
от того, выполнен ли daemon_resource. Новый model Turn недопустим.

### R2. Terminal native task и физическое завершение — разные доказательства

Task terminal переводится в существующее resource state stopped с отдельным
native outcome (completed/failed/cancelled), source и task identity. Это разрешает
только логический task retirement; retained owned PID/birth inventory всё равно
должен быть физически пуст. Cancelled/failed required work не превращается в
успешный execution. Общий cleanup не снимает active_tree/child uncertainty по тексту.
Частично дописанная последняя JSONL-строка ожидает следующего чтения; повреждённая
закрытая запись/пропущенный prefix — явный gap. Не очищать весь inventory при parse error.
Порядок — native step/source occurrence в одной инкарнации, не wall-clock timestamp.

### R3. Совместимость без нового тяжёлого qualification framework

Одна локальная функция в существующем baseline admission проверяет required
capabilities выбранного code-check profile до Subject dispatch. Replay использует
реальные producer entrypoints в отдельном временном каталоге, installed consumer ABI
и собственный invocation binding; не изменяет workspace продукта. Минимум: browser@2
failure, direct runtime Error/TypeError, compiler diagnostic, composite nesting.
Negative samples old/malformed/foreign должны отклоняться. Тест самого browser
producer отдельно проверяет native step/target/epoch, не только hand-written JSON.
Не добавлять persistent receipt cache: выполнить дешёвый check при admission,
объединить одинаковые пары в рамках одной подготовки кампании. Никаких model calls,
новых registry/глобального git-tree qualification key. Недоступный нужный capability
останавливает подготовку с expected/observed до платного Subject запроса.

### R4. Подробная диагностика без изменения authority ABI

Добавить readRunnerEvidenceDetailed с результатом {evidence, diagnostics}; существующий
readRunnerEvidence остаётся wrapper, возвращающим evidence/null. Recursive reader
передаёт bounded diagnostics с report-relative locator, reason и expected/observed.
Набор reason: missing, invalid_json, invalid_shape, binding_mismatch,
artifact_mismatch, unsupported_observation_contract, attribution_unproven,
observation_incomplete. Не сохранять raw file bytes/stack/auth в reason.
Проекции bounded (64 записи и общий 32 KiB); truncation обозначается явно.
Engine receipts и EVAL compact diagnostic сохраняют причины/locators; replay заново
валидирует authority, входные diagnostics не влияют на disposition.

### R5. Межрепозиторная последовательность

1. dd-tasks: сравнить две линии 097, интегрировать одну эквивалентную tooling-реализацию;
   дописать узкий Error(test) producer и regression/typecheck. Команды package scripts
   сверить с реальным содержимым; не править generated feature tests.
2. dd-flow-cli: consumer additive proof + diagnostics, AGY reducer/env и shared cleanup
   convergence. Старые reports не получают нового authority. На этом этапе старый
   checkpoint по-прежнему допустимо читабелен, но не пригоден для нового запуска.
3. Cross-repo smoke exact установленных артефактов: compiler→receipt→repair selection;
   runtime Error→receipt→repair selection; browser@2→disposition; AGY replay→shutdown.
4. dd-eval: admission/diagnostic forwarding и новый checkpoint на проверенный dd-tasks
   commit. До отдельного engine release не писать выдуманный npm version/checksum:
   в реализации фиксировать проверенный local artifact, release pins обновлять при
   реальном выпуске. Не подменять pinned engine текущих EVAL.

### R6. Обязательные свидетельства приёмки

В implementation report таблица D1–D9/R1 → изменённые файлы → команда → фактический
результат. Минимальные suites: existing engine runner-observation091/runner-evidence097,
AGY state boundaries/shared daemon operations; dd-tasks plan097-observation,
source diagnostic, browser observation и tool diagnostic; EVAL baseline-admission/
check-diagnostic tests. Проверять package scripts, не придумывать отсутствующие команды.
Нужен хотя бы один установленный cross-repo smoke, а не только TS unit mocks.
Проверки с ошибкой и повтором обязаны доказывать отсутствие нового provider dispatch.
В рамках реализации без отдельного разрешения не выполнять native paid probes,
новые EVAL, публикацию engine или GitHub CI. Это не препятствует завершению
детерминированной реализации; live-подтверждение отражается отдельным статусом.
