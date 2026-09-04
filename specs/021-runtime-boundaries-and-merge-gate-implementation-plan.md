# 021. Исполняемый план: границы runtime и проверяемый MERGE

Статус: план реализации.
Дата: 2026-09-04.
Репозитории: `dd-flow-cli`, `dd-eval`, `dd-memorybank`; живой проект для приёмки — изолированная копия `dd-tasks`.

Это практический план реализации [спецификации 020](020-semantic-boundary-runtime-roots-harness-home-and-merge-gate.md). Он не создаёт новый контракт: фиксирует порядок миграции, конкретные места кода и контрольные точки, чтобы не смешать детерминированную инфраструктуру со смысловым решением агента.

## 1. Результат и неизменные границы

После реализации движок не интерпретирует произвольные команды или исходный код, технические артефакты RUN живут только в `run_root` под `DD_FLOW_HOME`, а MERGE коммитит в integration branch только дерево, прошедшее полный заранее замороженный набор проверок.

| Корень | Назначение | Допустимое содержимое |
| --- | --- | --- |
| `project_root` | стабильная идентичность проекта | project policy, queue/lane key |
| `workspace_root` | конкретный checkout/worktree RUN | исходники, `.memory-bank`, Git, project checks |
| `run_root` | технический workspace RUN | stage/Work context, results, receipts, reports, engine binding |

`run_root` имеет вид `<DD_FLOW_HOME>/projects/<PRJ-ID>/runs/<RUN-ID>/`; он не равен worktree и не определяется поиском от `project_root`. `integration_workspace` — роль пути из замороженной workspace policy; он может физически совпадать с `project_root`, но не становится хранилищем артефактов RUN.

Детерминированный код оставляет за собой только JSON Schema, ID/зависимости, допустимые переходы, containment путей, checksum, Git-факты, locks/leases, запуск уже выбранных команд и их receipts. Агентный контур выбирает проверки, оценивает достаточность, применимость аспектов, приоритеты и смысл разрешения конфликтов. CLI может применить явную policy к уже принятому агентному факту, но не выводит смысл по названию файла, тексту команды или числу изменённых строк.

## 2. Фаза A — удалить неверную смысловую автоматику

**Репозиторий:** `dd-eval`. **Файлы:** `lib/runner.mjs`, `test/eval.test.mjs`, `runbooks/execute-eval.md`, Judge packet.

1. Удалить `runtimeIntegrityViolation`, `auditRuntimeIntegrity`, связанный `collectCommands`, `candidate_runtime_tampering`, `runtime-integrity.json` и тесты, распознающие `node`, `sed`, heredoc, redirection и подобные shell-строки.
2. В `captureExecutionCandidate` сохранить только воспроизводимые факты входа: identity/checksum engine snapshot, manifest, путь изолированного execution, RUN и stage boundary. Transcript сохраняется как evidence для Judge, но не превращается кодом в verdict.
3. Убрать из отчёта обещание «runtime не менялся»: система этого не доказывает и не является sandbox.
4. Добавить регрессию: обычные read-only команды, heredoc и путь к CLI не блокируют candidate capture; binding snapshot по-прежнему обязателен.

**Подсказка:** не заменять удалённый regex «умным» parser. Удаление — корректное исправление первопричины.

## 3. Фаза B — единый `RunContext` и миграция `run_root`

**Репозиторий:** `dd-flow-cli`. **Файлы:** `src/storage/database.ts`, `src/services/runs.ts`, `schema-validation.ts`, `run-engine-bindings.ts`, `eval-snapshots.ts`, `prompts.ts`, stage/Work services и тесты.

1. Расширить существующий resolver RUN до единого `RunContext`: `project_id`, `run_id`, `project_root`, `workspace_root`, `run_root`. Не заводить второй repository/service.
2. Lifecycle/stage/Work/snapshot/report получают этот объект после единственного project lookup. `--project-root` нужен лишь для поиска зарегистрированного проекта/RUN; cwd и повторные CLI-аргументы не участвуют в выборе путей.
3. Оставить `runs.run_root` единственным live artifact root. Миграция в транзакции переносит `run_home_path` и старые aliases в `run_root`, проверяет containment под текущим `DD_FLOW_HOME/projects/<project>/runs/` и не сканирует диск.
4. Удалить live fallback на `runtime_path`, `run_dir`, `run_index_path`, `run_home_path`. Исторические snapshots открываются прежним движком, а не изменяют новый live-контракт.
5. `validateSchema` получает отдельно `workspaceRoot` и `runRoot`/binding path. Run-bound schema читается строго из `<run_root>/engine-binding.json`; отсутствие binding — понятная ошибка, не поиск схемы в соседнем checkout.
6. Удалить `findRunHome` из lifecycle path. Если она всё ещё полезна для диагностики, оставить только diagnostic-only, без импорта mutating services.
7. В prompt builders показывать все три абсолютных корня и их назначение: артефакты стадии пишутся в `run_root`, код и Memory Bank находятся в `workspace_root`.

**Порядок безопасной миграции:** сначала общий resolver и читатели, затем миграция БД и тест обновления существующей БД, лишь затем удаление aliases. Это исключает полуобновлённый runtime.

**Тесты:** direct RUN; отдельный feature worktree; cwd вне проекта; отсутствующий binding; symlink/`..` escape; restore snapshot; отличающиеся `project_root`/`workspace_root`.

## 4. Фаза C — harness config и изолированный `DD_FLOW_HOME`

**Репозитории:** `dd-flow-cli`, `dd-eval`; adapters только как потребители публичной границы.

1. Зафиксировать один `${DD_FLOW_HOME}/harnesses.json` со схемой `dd-flow/harness-config@1`: `adapter_command`, `runtime_command` и только уже необходимые harness-specific options. Секреты туда не попадают.
2. Не смешивать три уровня: `harnesses.json` говорит, *как* запустить упряжку; `${DD_FLOW_HOME}/agent-profiles/` — *какую* модель/reasoning выбрать; eval profile — *какой эксперимент* запускается.
3. Реализовать один loader с порядком: явный диагностический override → `harnesses.json` → разрешённый policy default discovery в `PATH`. Он выдаёт sanitised resolved receipt. Runner, merge-server и adapters не дублируют этот алгоритм.
4. В `prepareIsolatedFlowHome` из `dd-eval/lib/runner.mjs` копировать из host home только `harnesses.json` и требуемые `agent-profiles/` с правами не шире `0600`; не копировать SQLite, RUN, locks, processes, engines, logs, dashboards или credentials. Потом установить engine snapshot и создать новую БД.
5. До первой Session выполнить selected-harness preflight. Ошибка разрешения команды завершает запуск до RUN/daemon и сообщает next action.
6. `dd-flow codex home init` остаётся отдельным действием hooks после общей подготовки home.

**Тесты:** пустой target; идемпотентный copy; новая config checksum; отсутствующий harness; одинаковый resolved command у runner/server; отсутствие секретов в JSONL; contract tests Codex/ZCode/Grok/AGY/OpenCode.

## 5. Фаза D — убрать смысловые эвристики из flow engine

**Репозиторий:** `dd-flow-cli`. **Файл начала работы:** `src/services/vnext-code-review.ts`.

1. Удалить grouping аспектов CODE-REVIEW «по три» и выбор режима через `changed_paths.length`. Эти признаки не доказывают глубину или необходимость ревью.
2. Если PLAN принял review groups — использовать их. Если групп нет — создать одну нейтральную группу со всеми обязательными baseline aspects. CLI проверяет только покрытие каждого обязательного аспекта ровно один раз и ограничивает запуск измеренной capacity; capacity не меняет смысловой состав.
3. Замораживать `requested_mode`, `effective_mode`, `source` в RUN до открытия CODE-REVIEW: user override → project policy → формальное отображение принятого PLAN assessment. `auto` разрешается один раз, не пересчитывается на start/finish.
4. Переименовать `validateSemanticSchema` в точное `validateContractInvariants` (или аналог). Каждый branch: structural invariant — оставить; policy projection — указать source; semantic judgement — удалить и перенести в agent/Judge prompt.
5. Провести аудит продуктивных веток по словам `semantic`, `infer`, `auto`, `classify`, `applicable`, `sufficient`, `heavy`, `tampering`, `guess`. Результат — краткая implementation table, не новая runtime сущность.

**Подсказка:** fallback «одна группа» не является оптимизатором. Если нужна более умная группировка, её должен принять PLAN, потому что только он обладает предметным контекстом.

## 6. Фаза E — полный integration gate до commit

**Репозиторий:** `dd-flow-cli`. **Файлы:** `src/services/vnext-merge.ts`, `code-checks.ts`, существующие durable receipts/state recovery; затем `dd-memorybank` SPC-012 и merge prompts.

1. При enqueue записывать immutable `<run_root>/07-merge/merge-gate.json`: request id, frozen declaration hash, source profile hash, executable checks, covered CHK refs и policy floor. Источник — accepted PLAN + registered CODE Work graph, а не mutable stage report.
2. Effective integration gate — объединение final CODE executable checks, `run_at: merge` и обязательного merge floor политики. `external`/manual evidence не выполняются как shell-команда. CLI не сканирует `package.json` и не решает, тяжёлый ли тест.
3. До `merge apply` сверять declaration hash. Изменившийся semantic alias → `check_definition_drift` до Git mutation. Новый policy floor явно добавляется в стартовый пакет.
4. Перевести checkpoint machine на: `queued → baseline_locked → apply_recorded → conflicts_resolved → bootstrap_ready → checks_running → checks_passed → integration_committed → delivered → finalized`.
5. `apply` делает `git merge --no-ff --no-commit`. При конфликте сохраняются тот же Work/session/lane; агент исправляет только фактический конфликт и не повторяет apply.
6. На интегрированном, но ещё не committed дереве выполнить bootstrap и весь frozen gate. Durable attempt регистрируется до запуска, progress пишется в JSONL, receipt хранит все покрытые CHK refs.
7. При неуспехе хранить receipts, вернуть `action_required`, не двигать target HEAD. Repair выполняется в том же MERGE Work; изменение дерева открывает новую check epoch и требует полный gate.
8. После success получить `accepted_tree = git write-tree`, создать commit и сверить `integration_commit^{tree} === accepted_tree`. Изменение tree hook-ом требует новой epoch.
9. Повтор `finish` на `checks_running` сначала читает durable attempts и продолжает наблюдение; recovery после crash сверяет Git state/checkpoint и не повторяет apply/commit.
10. Inline и server route вызывают один merge service. Server меняет только получение агентной работы из очереди, но не gate/state/receipts.

**Тесты:** final CODE checks не теряются; dedupe сохраняет CHK refs; browser/DB не исчезают; `external` не выполняется; failed gate не двигает HEAD; repair создаёт новую epoch; commit только после gate; tree equality; conflict; crash recovery; inline/server equivalence; progress долгой проверки.

## 7. Фаза F — документация, выпуск и квалификация

1. В `dd-memorybank` обновить SPC-009 (корни), SPC-012 (merge gate/checkpoint), `vnext/plan.md`, `vnext/code-review.md`, `vnext/merge.md`, schemas/examples/indexes. Prompts получают resolved facts и exact next command вместо требования искать help.
2. В `dd-eval` обновить `execute-eval.md`: config copy, честный candidate evidence и сохранение engine/flow identity вместе с receipts.
3. Выполнить format, lint, typecheck, unit/integration по каждому репозиторию. Добавлять только регрессии для новых ветвлений, не копировать покрытые сценарии.
4. Провести review diff против 020 и этого плана; незакрытые пункты явно отметить.
5. Выпустить согласованную пару `dd-memorybank` + `dd-flow-cli` по их runbooks. `dd-eval` обновлять только при реальном изменении его входного контракта.
6. Провести чистый live inline MERGE, server MERGE на disposable change и намеренно failed gate с доказательством неизменного HEAD.
7. Затем провести E2E до MERGE и Judge без ручной правки RUN, SQLite, receipts или engine во время прогона.

## 8. Итоговые критерии

- отсутствуют runtime command audit и shell-tampering verdict;
- каждый active RUN имеет один зарегистрированный `run_root`;
- schema/stage resolution не зависит от совпадения project/workspace и не сканирует диск;
- isolated home содержит harness config до Session creation, но не host runtime state;
- runner и merge-server используют один config loader;
- CODE-REVIEW не группирует аспекты и не выбирает mode по косвенному признаку;
- MERGE исполняет весь frozen executable gate на integration workspace;
- failed gate не двигает target HEAD, а успешный commit содержит именно проверенное дерево;
- inline/server дают эквивалентные receipts;
- новый живой E2E завершается MERGE и Judge без ручной модификации runtime;
- изменения, версии и release notes опубликованы по runbooks, рабочие деревья чисты.

## 9. Намеренно не добавляем

- `DD_FLOW_RUN_ROOT`: `run_root` уже поле RUN;
- глобальный case-insensitive resolver путей;
- security sandbox, shell parser или автоматический выбор «тяжёлых» тестов;
- новый DSL для harness config/checks;
- временный integration repository;
- второе semantic CODE-REVIEW после MERGE.

Возвращаться к этим идеям следует только по реальному непокрытому кейсу.

## 10. Правило расследования и исправления дефектов

Каждый дефект из живого прогона сначала оформляется как наблюдаемое
следствие, а не как готовый патч. До изменения кода исполнитель обязан:

1. Восстановить полный путь данных и управления от prompt/adapter через
   runner и CLI к durable artifact или process.
2. Назвать первопричину: общее место, где нарушен контракт, а не ближайший
   симптомный caller.
3. Найти весь класс аналогичных мест (`rg` по общему helper, событию,
   state transition и альтернативным harnesses), проверить их фактическое
   поведение и внести результат в implementation table.
4. Исправить общий контракт или shared helper минимальным способом; локальный
   guard допустим только когда доказано, что путь действительно уникален.
5. Добавить самый малый regression test, который воспроизводит исходный
   дефект и хотя бы один sibling path того же класса.

Нельзя закрывать дефект переименованием статуса, ручной правкой RUN/SQLite
или special-case для одного eval. Если причина остаётся агентной
(предметное решение, полнота анализа, качество плана), она переносится в
prompt/Judge criteria, а не кодируется эвристикой CLI.
