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
7. При неуспехе хранить receipts, отменить незакоммиченный merge и не двигать target HEAD. Продуктовый repair не допускается в MERGE Work: CLI создаёт source-repair Work в feature workspace, проводит его через CODE verification и независимый CODE-REVIEW, помечает исходный MRG `superseded` и только затем создаёт replacement MRG с новым frozen source и новой check epoch.
8. После success получить `accepted_tree = git write-tree`, создать commit и сверить `integration_commit^{tree} === accepted_tree`. Изменение tree hook-ом требует новой epoch.
9. Повтор `finish` на `checks_running` сначала читает durable attempts и продолжает наблюдение; recovery после crash сверяет Git state/checkpoint и не повторяет apply/commit.
10. Inline и server route вызывают один merge service. Server меняет только получение агентной работы из очереди, но не gate/state/receipts.

### 6.1 Source-repair transition

Это не retry `finish` и не скрытая правка target. Нужен один явный CLI
переход, например `dd-flow merge repair <MRG-ID>`, который выполняет только
детерминированную механику:

1. проверяет, что MRG находится в `action_required` именно из-за immutable
   failed integration receipt, а его target HEAD всё ещё равен baseline;
2. делает `git merge --abort` и проверяет clean target tree; конфликтный или
   неоткатываемый target переводится в `recovery_required`, а не
   «исправляется» агентом;
3. создаёт один source-repair CODE Work в feature workspace, прикладывая
   failed receipt, exact affected checks и исходные CODE Work как causal
   context;
4. помечает исходный MRG `superseded`, сохраняет связь `replacement_of` в
   replacement request и не допускает его повторного dispatch;
5. открывает новую попытку CODE, затем новую попытку CODE-REVIEW. Нельзя
   переиспользовать terminal report или прежние reviewer Work как review
   нового repair; старые attempt artifacts остаются immutable evidence;
6. после нового CODE-REVIEW создаёт replacement MRG. Только он может попасть
   в inline/server queue.

Для этого снять unique-index «один MRG на RUN» и заменить его на invariant
«не более одного non-terminal MRG на RUN». Запросы связываются
`replacement_of_merge_request_id`; `superseded` является terminal status и
не блокирует project FIFO. Это легче и честнее, чем переписывать source freeze
или мутировать старый MRG.

### 6.2 Повторные stage attempts

`CODE` и `CODE-REVIEW` должны уметь иметь несколько attempt в одном RUN,
только через явный source-repair transition. При новом attempt CLI:

- архивирует terminal stage receipt/report в `<stage>/try-NNN/`; следующая
  попытка materialизуется в корне той же stage directory с новым номером
  attempt;
- создаёт fresh prompt/context и связывает coordinator с новой попыткой;
- фильтрует Work по `stage_attempt`, чтобы прежние reviewer results не стали
  ложным покрытием повторного review;
- запрещает неявный `stage start` terminal stage: обычная команда по-прежнему
  fail-closed, а переход доступен исключительно из `merge repair`.

### 6.3 Контракт MERGE Work

`renderWorkerPrompt` не применяет общий project-source write boundary к
`kind: merge`. Merge-specific prompt говорит, что agent не делает Git mutation
вручную: `merge apply` — единственный normal mutation. При конфликте разрешены
только unmerged paths. Любая другая product change в target отклоняется при
`stage finish` сравнением с apply baseline/allowed conflict paths и не может
быть выдана за conflict resolution.

**Тесты:** final CODE checks не теряются; dedupe сохраняет CHK refs; browser/DB не исчезают; `external` не выполняется; failed gate не двигает HEAD и оставляет чистый target; source repair не может писать в integration workspace; replacement MRG создаётся только после CODE verification и CODE-REVIEW; commit только после gate; tree equality; conflict; crash recovery; inline/server equivalence; progress долгой проверки.

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

## 11. Дополнение по E2E `EVAL-20260904061203-2654c7ec`

Ниже — отдельный, минимальный пакет после валидного ZCode E2E. Он не
превращает CLI в анализатор исходного кода: предметная проверка остаётся
обязанностью CODE/CODE-REVIEW/Judge, а CLI исправляет только собственную
детерминированную проекцию доказательств.

### 11.1. Инварианты мутаций — prompt и review, не эвристика CLI

**Наблюдение.** В проверенном кандидате priority-only `UPDATE` опирался на
отдельный `project()`/membership read и не сохранял membership/lifecycle
предикат в самом decision boundary. Это не единичная ошибка конкретного
endpoint: тот же класс возникает у любой write-операции, которой нужна
авторизация или состояние родителя.

**Исправление.**

1. В `dd-memorybank` добавить в общие инструкции CODE и CODE-REVIEW правило:
   если write разрешён только при access/lifecycle инварианте, этот инвариант
   доказывается в том же SQL statement либо в явной транзакции с нужной
   блокировкой. Предварительное чтение допускается только для диагностики
   ошибки и никогда не является доказательством права на последующую запись.
2. Распространить правило на все mutating paths, а не только task update:
   create/update/delete child entity, rename/archive parent и role-gated
   mutation. Агент обязан проверить, что accepted PLAN не обещает более
   сильную атомарность, чем реально реализовано.
3. Уточнить шаблон reviewer Work в `dd-flow-cli`: при аспектах authorization,
   lifecycle, persistence или concurrency reviewer прослеживает predicate от
   входа до statement/transaction и сообщает material finding при check-then-
   write разрыве. Это instruction для смысловой проверки, не grep/AST rule.
4. Обобщить соответствующее golden/Judge criterion: проверяется целостность
   access/lifecycle decision boundary, а не частный случай archive priority.
5. Добавить минимальные regression fixtures: одна priority-only/archive гонка
   и один sibling write с membership/parent-state precheck. Они проверяют
   ожидаемую reviewer/Judge находку, а не заставляют engine читать код.

### 11.2. Evidence epoch — единая детерминированная проекция

**Наблюдение.** Raw Work result правдиво сохраняет receipt упавшей проверки,
которую repair исправлял. Но `verification.acceptance.evidence_refs` в
производном stage report показывал этот исторический receipt как доказательство
принятия вместе с финальным успешным receipt.

**Первопричина.** `verificationProjection` переносит evidence Work без
разделения между историей ремонта и evidence текущей acceptance epoch.

**Исправление.**

1. В `dd-flow-cli` добавить один маленький normalizer в
   `verificationProjection`: raw refs остаются в Work result/repair history,
   а acceptance projection заменяет ссылку на receipt прошлой epoch на
   current final receipt того же declared check. Непроверочные refs не менять.
2. Для прозрачности сохранить `reported_evidence_refs` только там, где нужна
   аудитная история; поле `evidence_refs` в accepted stage report означает
   исключительно действующее доказательство. Не переписывать immutable Work
   result и не скрывать failed receipt из `checks/`.
3. Добавить регрессии для browser repair и sibling check с несколькими
   epochs: report ссылается на latest passed receipt, raw repair result — на
   исходный failed receipt.
4. Проверить все consumers `verification.acceptance` и stage renderers, чтобы
   ни один не считал историческую ссылку текущим acceptance evidence.

### 11.3. Копия UI — один исходник текста и проверка исключения

**Наблюдение.** Узкое разрешённое исключение (priority editable в archived
project) противоречило тексту «read-only».

**Исправление.** В продуктовой реализации формировать lifecycle notice из
того же явного state, который управляет disabled controls; тестировать
архивный режим с разрешённым control и текстом исключения. Проверить все
пользовательские lifecycle labels, а не только одну строку.

### 11.4. Judge scope

Final Judge должен опираться на три переданных immutable packet-а. Golden
examples внутри assessment допустимы как данные packet-а; host-wide поиск
старых eval/RUN запрещён prompt-ом и подлежит отдельной регрессии в driver
journal. Это защищает воспроизводимость оценки без введения sandbox.

### 11.5. Порядок исполнения и приёмка

1. Обновить Memory Bank prompts/criteria и `dd-flow-cli` evidence projection.
2. Проверить класс mutating path в disposable `dd-tasks` fixture и обновить
fixture/expected Judge evidence, не записывая продуктовую реализацию из eval
в main обходом обычного flow.
3. Прогнать unit/contract tests для изменённых компонентов, затем выпустить
согласованную pair `dd-memorybank` + `dd-flow-cli` по их runbooks.
4. Обновить `dd-eval` pinned profile/checkpoint identity и подготовить чистый
ZCode E2E; запускать без ручных правок RUN, receipt, SQLite или candidate.
