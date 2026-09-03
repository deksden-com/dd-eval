# 020. Граница смысловых решений, корни runtime, конфигурация упряжек и MERGE gate

Статус: план реализации; текущий код ещё не соответствует всем решениям ниже.
Дата: 2026-09-03.
Репозитории: `dd-flow-cli`, `dd-eval`, `dd-memorybank`; тестовый проект —
`dd-tasks` через новый изолированный прогон, без ручной подгонки его состояния.

Документ фиксирует пакет исправлений после E2E
`EVAL-20260903161732-91ac05b3`. Он уточняет и в затронутой части заменяет:

- D14 и раздел «Аудит целостности раннера» плана 019;
- текущую реализацию разрешения RUN через `project_root`;
- правило SPC-012, по которому MERGE повторяет только проверки с
  `run_at: merge`;
- автоматическую смысловую маршрутизацию CODE-REVIEW внутри CLI.

План опирается на уже принятый контракт трёх корней из
`SPC-009-vnext-identity-materialization-and-runtime-state.md`. Новую сущность,
переменную `DD_FLOW_RUN_ROOT`, отдельный семантический DSL или второй реестр
RUN создавать не требуется.

## 1. Цель и критерий разделения ответственности

Цель — оставить детерминированному коду только механически проверяемые факты,
а смысловые решения передать модели, ревьюерам или явно принятой политике.

Базовый тест для любой проверки в CLI:

> Можно ли установить результат из структурированных входов без понимания
> предметной области, намерения автора и значения исходного кода?

Если да — это допустимый детерминированный инвариант. Если нет — CLI сохраняет
данные и передаёт решение агентному этапу, но не выносит вердикт самостоятельно.

### 1.1 Что остаётся детерминированным

- JSON Schema и простые контрактные ограничения;
- уникальность ID, ссылочная целостность и отсутствие циклов;
- разрешённые переходы машины состояний;
- готовность Work по `depends_on`;
- безопасное разрешение и containment путей;
- точная идентичность engine/flow pack по версии и checksum;
- Git branch, HEAD, tree, status и наличие конфликтов;
- запуск уже выбранных проверок, exit code, stdout/stderr и receipts;
- locks, leases, очередь MERGE, порты, процессы и подтверждённая активность;
- materialization, копирование, hashes и восстановление проекций;
- покрытие явно перечисленного набора сущностей результатом агента.

### 1.2 Что принадлежит агентному контуру

- достаточность требований и acceptance criteria;
- выбор проверок, действительно доказывающих конкретные R/AC;
- применимость аспектов и качество их проработки;
- смысловая группировка аспектов между ревьюерами;
- существенность находки, её priority и disposition;
- правомерность DEF и остаточного риска;
- выбор способа разрешения содержательного merge-конфликта;
- достаточность контекста, качество кода, плана и результата;
- соответствие вопроса HITL каноническому пакету ответов.

CLI вправе применять формальную политику к уже принятому смысловому факту.
Например, после того как агент присвоил `failure_impact=high`, правило проекта
может детерминированно выбрать `deep`. CLI не вправе сам выводить высокий риск
из названия файла, количества изменений или текста команды.

## 2. Удаление эвристического runtime integrity audit

### 2.1 Удаляемое поведение

Из `dd-eval` удалить без замены другим анализатором shell-команд:

- `runtimeIntegrityViolation`;
- `auditRuntimeIntegrity`;
- `runtimeIntegrityJournals`, если после удаления у неё не останется иного
  потребителя;
- рекурсивный `collectCommands`, используемый только этим аудитом;
- вызов аудита из `captureExecutionCandidate`;
- ошибку `candidate_runtime_tampering`;
- артефакт `runtime-integrity.json` и его включение в отчёты/Judge packet;
- unit-тесты, проверяющие распознавание `node`, `sed`, `rm`, redirection и
  подобных строк;
- правило в `runbooks/execute-eval.md`, запрещающее оценку результата на
  основании этого аудита;
- противоречащее новое решение из плана 019.

Не делать «улучшенный» shell parser, allowlist утилит, список опасных regex или
перехват каждого файлового вызова. Это не security sandbox и не требуется для
оценки обычного поведения модели.

### 2.2 Что сохраняется

До передачи управления Subject раннер по-прежнему:

1. выбирает конкретный engine snapshot;
2. проверяет его manifest/checksum;
3. материализует его в изолированный `DD_FLOW_HOME`;
4. связывает RUN с этой идентичностью;
5. записывает выбранную версию и checksum в evidence эвала.

Это проверка входа эксперимента, а не поведения агента. После старта Subject
журнал упряжки сохраняется как наблюдаемое доказательство для разбора и Judge,
но произвольная команда не получает автоматический смысловой verdict.

### 2.3 Регрессии

- обычные read-only команды внутри изолированного runtime не блокируют candidate;
- наличие текста `engines`, `bin`, `sed -n` или пути с `cli` ни на что не влияет;
- candidate capture по-прежнему проверяет snapshot, stage boundary и RUN facts;
- отчёт не обещает отсутствия вмешательства, которого система больше не
  доказывает.

## 3. Ревизия других детерминированных смысловых решений

### 3.1 CODE-REVIEW grouping

Текущий `vnext-code-review.ts` собирает аспекты в массив и режет его по три для
`standard`, по одному для `deep`. Удалить эту эвристику.

Минимальный контракт:

- если принятый PLAN/aspect map содержит явные review groups, использовать их;
- если групп для CODE-REVIEW нет, одна группа получает все применимые и
  обязательные baseline aspects;
- CLI проверяет, что каждый обязательный аспект покрыт ровно один раз;
- число одновременно запущенных Works ограничивается измеренной capacity, но
  capacity не меняет смысловой состав групп;
- будущая более тонкая группировка добавляется в PLAN, а не в алгоритм CLI.

Не вводить отдельный оптимизатор групп или scoring affinity. Одна группа —
достаточный нейтральный fallback.

### 3.2 Выбор режима ревью

Убрать правило CODE-REVIEW `changed_paths.length ? standard : off`.

Режим `off | standard | deep` должен быть заморожен в RUN из одного из трёх
источников с явным `source`:

1. override пользователя;
2. политика проекта;
3. формальное отображение принятой PLAN assessment в режим.

Если режим остался `auto`, разрешить его один раз перед открытием ревью и
сохранить `requested_mode`, `effective_mode`, `source` в RUN. Повторный start
не пересчитывает решение по текущим файлам.

### 3.3 Терминология валидаторов

Переименовать внутренний `validateSemanticSchema` в
`validateContractInvariants` или близкое точное имя. Сам код оставить только
для структурных и ссылочных инвариантов. Проверить каждый его branch:

- можно доказать из структуры — оставить и покрыть тестом;
- требуется оценить смысл текста — удалить из валидатора и добавить в prompt
  соответствующей agent/review стадии;
- это проектная политика — назвать источник политики в ошибке.

### 3.4 Системный аудит

По `dd-flow-cli` и `dd-eval` просмотреть функции и сообщения с именами/словами
`semantic`, `infer`, `auto`, `classify`, `applicable`, `sufficient`, `heavy`,
`tampering`, `guess`. Для каждого места зафиксировать одно из решений:

- mechanical invariant;
- projection of explicit policy;
- agent/Judge responsibility;
- obsolete code to delete.

Не считать ошибкой:

- структурированную классификацию явного adapter error code;
- требование repair Work для находки, которую агент уже классифицировал P0/P1;
- проверку, что reviewer вернул все назначенные ему аспекты;
- механическую валидацию Memory Bank JSON, ссылок и путей;
- semantic HITL matching, если его выполняет отдельный Judge, а код только
  валидирует JSON его ответа.

Результат аудита — короткая таблица в implementation report, не новая runtime
сущность.

## 4. Единый контракт корней

### 4.1 Значение корней

Использовать существующие определения SPC-009 без новых aliases:

| Имя | Назначение | Типичные записи |
| --- | --- | --- |
| `project_root` | стабильный зарегистрированный корень и идентичность проекта | project lookup, policy, queue/lane key |
| `workspace_root` | конкретный checkout/worktree данного RUN | исходники, тесты, project Memory Bank, Git checks |
| `run_root` | технический файловый workspace RUN под `DD_FLOW_HOME` | stage/Work context, results, receipts, reports |

`integration_workspace` — отдельная роль пути, которую MERGE получает из
замороженной workspace policy RUN. В простом режиме он может совпадать с
`project_root`, но это не часть семантики `project_root` и не четвёртый
универсальный корень RUN. Благодаря этому поиск проекта, feature worktree и
фактический target checkout нельзя случайно подменить друг другом.

`run_root` вычисляется/хранится в записи RUN и имеет форму:

```text
<DD_FLOW_HOME>/projects/<PRJ-ID>/runs/<RUN-ID>/
```

Управляемый feature worktree может физически находиться под
`<DD_FLOW_HOME>/projects/<PRJ-ID>/checkouts/`, но от этого он не становится
RUN artifact storage.

### 4.2 Источник истины и миграция

- привести таблицу `runs` и TypeScript-типы к одному полю `run_root`;
- удалить новый runtime-контракт `run_home_path`, `runtime_path`, `run_dir` и
  `run_index_path`, как уже требует SPC-009;
- существующее значение `run_home_path` однократно перенести в `run_root` в
  миграции SQLite;
- `run.json` материализовать как `<run_root>/run.json`;
- не оставлять fallback, который сканирует каталоги от `project_root`;
- старые исторические eval snapshots читаются своим старым движком и не
  определяют новый live-контракт.

Миграция должна быть транзакционной и идемпотентной. До удаления старого поля
проверить, что у каждой активной записи новый `run_root` находится под текущим
`DD_FLOW_HOME/projects/<project>/runs/` и не совпадает с `workspace_root`.

### 4.3 API и вызовы

Stage/Work service получает один разрешённый `RunContext` из БД:

```text
project_id, run_id, project_root, workspace_root, run_root
```

Не создавать второй repository или service для этого объекта; расширить
существующий общий resolver RUN/path.

Правила вызовов:

- lifecycle command принимает `--project-root` только для поиска проекта;
- после нахождения RUN все остальные корни берутся из RUN, а не из cwd/CLI;
- schema/document/check reads используют `workspace_root`;
- stage/Work artifacts используют `run_root`;
- merge target использует frozen integration workspace из workspace policy;
- prompts показывают все три корня с кратким назначением.

### 4.4 Run-bound schemas

Исправить `schema-validation.ts`:

- `validateSchema` для stage input получает явный `runRoot` или
  `engineBindingPath` от уже найденного RUN;
- project schema lookup получает отдельный `workspaceRoot`;
- `resolveRunBoundSchema` не вызывает `findRunHome(ddFlowHome, projectRoot,
  runId)` и не сканирует проекты;
- RUN engine binding читается только из `<run_root>/engine-binding.json`;
- отсутствие ожидаемого binding — явная ошибка, а не тихий fallback на schema
  другого checkout;
- standalone project-only validation без RUN сохраняет project/bundled lookup.

Удалить `findRunHome`, если после миграции у неё не останется легитимных
потребителей. Иначе ограничить её только диагностикой, не lifecycle path.

### 4.5 Тесты корней

Обязательные тесты:

1. `project_root === workspace_root` для простого direct RUN;
2. stable project root + отдельный feature worktree;
3. stage artifact находится только под `run_root`;
4. schema берётся из RUN-bound engine при отличающемся workspace;
5. schema binding missing не превращается в silent fallback;
6. cwd вне проекта не меняет выбор корней;
7. symlink/`..` не позволяют выйти из owner root;
8. snapshot restore переносит все три корня и сохраняет их роли.

## 5. Harness config внутри DD_FLOW_HOME

### 5.1 Разделение двух конфигураций

Не смешивать локальную конфигурацию упряжки и модельный профиль:

```text
<DD_FLOW_HOME>/harnesses.json       # как запускать упряжки на этом host
<DD_FLOW_HOME>/agent-profiles/      # какую упряжку/модель/reasoning выбрать
dd-eval run profile                 # состав конкретного эксперимента
```

Для MVP использовать один `harnesses.json`, а не отдельную schema/loader для
каждой упряжки. Минимальная форма:

```json
{
  "schema_id": "dd-flow/harness-config@1",
  "harnesses": {
    "codex-desktop": {
      "adapter_command": "/absolute/path/to/dd-codex",
      "runtime_command": "/absolute/path/to/codex"
    },
    "zcode-acp": {
      "adapter_command": "/absolute/path/to/dd-zcode",
      "runtime_command": "/absolute/path/to/zcode-acp"
    }
  }
}
```

Дополнительные harness-specific options допустимы только когда уже нужны
существующему адаптеру. Не превращать файл в универсальный DSL команд.

Секретные значения в нём не хранить. Допустимы имена переменных окружения и
пути к host credential source; изолированную рабочую копию credentials создаёт
соответствующий adapter по своему уже существующему контракту.

### 5.2 Разрешение конфигурации

Единый порядок:

1. явный CLI override для диагностического запуска;
2. запись выбранного harness в `${DD_FLOW_HOME}/harnesses.json`;
3. стандартное имя исполняемого файла на `PATH`, только если запись явно
   разрешает default discovery.

Переменные `DD_ZCODE_ACP_BIN`, `DD_GROK_BIN`, `DD_AGY_BIN` и аналоги перестают
быть скрытым основным источником. На время миграции они могут быть явным
one-run override, но resolved command обязательно попадает в preflight receipt.

Один loader должен использоваться runner, merge-server и adapters. Если
прямой импорт между пакетами невозможен, публичный CLI preflight возвращает
resolved harness config; не копировать порядок разрешения в пяти драйверах.

### 5.3 Изолированный DD_FLOW_HOME

Расширить существующую подготовку runtime в `dd-eval/lib/runner.mjs` одной
функцией `prepareIsolatedFlowHome`:

1. source — активный host `DD_FLOW_HOME`, по умолчанию `~/.dd-flow`;
2. target — execution-specific `.../dd-flow-home`;
3. создать target до engine install;
4. атомарно скопировать `harnesses.json` и нужные `agent-profiles/`;
5. не копировать БД, RUN, locks, processes, engines, logs или dashboards;
6. после этого установить точный engine snapshot и создать новую БД;
7. проверить выбранную запись harness и доступность executable;
8. записать в eval events source/target, checksum конфигурации и resolved
   commands без секретов.

Копирование выполняется стандартной библиотекой Node (`cp`, `mkdir`, `chmod`,
atomic rename). Новый daemon или отдельный сервис для подготовки home не нужен.
Конфигурационные файлы создаются с правами не шире `0600`.

`dd-flow codex home init` остаётся отдельной операцией подготовки Codex hooks и
вызывается после общей подготовки `DD_FLOW_HOME`; она не должна становиться
универсальным harness config copier.

### 5.4 Проверки

- пустой target получает конфигурацию, но не состояние source;
- повторная подготовка с теми же bytes идемпотентна;
- изменение source checksum видно в новом execution receipt;
- отсутствующий выбранный harness завершается до создания Session;
- server MERGE и обычный runner разрешают одинаковые adapter/runtime commands;
- секретные значения не появляются в event JSON и отчёте;
- Codex, ZCode, Grok, AGY и OpenCode проходят contract tests одного loader.

## 6. Полный интеграционный MERGE gate

### 6.1 Фактический дефект

В E2E `EVAL-20260903161732-91ac05b3` CODE и CODE-REVIEW имели десять свежих
успешных проверок, включая DB и browser. MERGE повторил только:

```text
pnpm quality
pnpm docs:check
```

Source commit и integration commit имели одинаковый tree
`196a052d9c92abeba024926f09199e4bc798708e`, конфликтов не было. Поэтому
предыдущие доказательства были релевантны содержимому, но система не доказала
работу полного набора на integration workspace. При изменившейся target branch
или конфликте этот shortcut уже небезопасен.

Дополнительно текущий `finishVnextMerge` сначала вызывает `commitIntegration`,
а затем bootstrap/checks. При падении gate целевая ветка уже содержит
непроверенный commit.

### 6.2 Кто выбирает проверки

PLAN остаётся единственным смысловым владельцем выбора CHK для R/AC. Reviewer
и Judge оценивают достаточность. MERGE не сканирует `package.json`, не запускает
«все найденные scripts» и не решает, какая проверка тяжёлая или полезная.

Детерминированный effective integration gate — объединение:

1. всех исполнимых проверок, входивших в принятый final CODE gate
   (`work`, `code`, `readiness`);
2. всех явно объявленных `run_at: merge` проверок;
3. обязательных merge aliases текущей project policy.

`external` и ручные доказательства не запускаются как команды. Они остаются
predecessor evidence с честным ограничением.

Команды дедуплицируются существующим механизмом по resolved command,
required artifacts и ports, но каждый receipt сохраняет все покрытые
canonical CHK refs.

### 6.3 Замораживание gate

При создании MRG:

- получить accepted final declarations из PLAN и зарегистрированного CODE Work
  graph, а не из строк `stage-report.semantic.checks`;
- проверить наличие всех planned aliases;
- сохранить semantic declarations в MERGE request (`effective_checks_json`
  либо один immutable `gate.json` под `run_root/07-merge/`);
- сохранить checksum набора и исходного profile;
- перед `merge apply` добавить актуальный mandatory merge policy floor;
- изменение команды принятого semantic alias означает
  `check_definition_drift` до Git mutation;
- новая обязательная policy check добавляется явно и попадает в стартовый
  пакет.

Не пересобирать смысловой набор из mutable PLAN после enqueue.

### 6.4 Порядок MERGE

Исправить checkpoint state machine:

```text
queued
  -> baseline_locked
  -> apply_recorded
  -> conflicts_resolved
  -> bootstrap_ready
  -> checks_running
  -> checks_passed
  -> integration_committed
  -> delivered
  -> finalized
```

Порядок исполнения:

1. дождаться project lane и зафиксировать current target HEAD;
2. применить frozen source через `git merge --no-ff --no-commit`;
3. при конфликтах оставить тот же MERGE Work, lock и Session;
4. агент разрешает только фактические конфликты;
5. выполнить project bootstrap на интегрированном, но ещё не опубликованном
   дереве;
6. запустить весь effective integration gate с progress JSONL;
7. при любой ошибке сохранить все receipts, оставить target branch на прежнем
   HEAD и вернуть `action_required`;
8. после repair повторить полный gate на новом content fingerprint, не
   повторяя merge apply;
9. после успешного gate получить staged tree через `git write-tree` и сохранить
   `accepted_tree`;
10. создать merge commit;
11. проверить `integration_commit^{tree} === accepted_tree`; если commit hook
    изменил содержимое, не считать gate действительным и потребовать новую
    проверочную epoch;
12. подтвердить delivery, выполнить cleanup, закрыть Work/RUN и освободить lane.

Это использует существующий integration workspace и lock. Отдельный временный
integration repository/worktree не вводить, пока реальные требования к
параллельному чтению target checkout этого не потребуют.

### 6.5 Повтор, crash и repair

- повтор `finish` на `checks_running` сначала сверяет durable check attempts;
- accepted receipt переиспользуется только внутри того же merge gate epoch,
  exact content fingerprint и declaration hash;
- source CODE/CODE-REVIEW receipts никогда не подменяют post-merge receipts;
- failed check не запускается скрытно второй раз без изменения дерева или
  явного retry той же незавершённой durable attempt;
- crash до commit восстанавливается по Git merge state, apply receipt и
  checkpoint;
- crash после commit сверяет commit/tree и DB intent, не создаёт второй commit;
- при failed gate интеграционная branch ref остаётся на baseline;
- repair выполняется в том же MERGE Work; отдельный repair Work не нужен.

### 6.6 Стартовый пакет и отчёт

`stage start --stage merge` показывает:

- `project_root`, integration workspace, source workspace и `run_root`;
- source commit, target baseline, ветки и lock/queue state;
- predecessor checks отдельно от effective integration gate;
- полный список реально запускаемых integration checks с CHK refs;
- exact apply/finish/pause/resume commands;
- правило: не создавать commit вручную и не повторять apply;
- при failed check — путь receipt/log, тот же Work и требование полного
  повторного gate после исправления.

MERGE report раздельно хранит:

- `predecessor_evidence`;
- `integration_check_receipts`;
- `effective_check_refs` и declaration/profile hashes;
- target baseline, source commit, accepted tree и integration commit/tree;
- conflicts и краткое смысловое описание разрешения;
- bootstrap receipt;
- delivery/cleanup receipt;
- длительность ожидания, bootstrap, checks, commit и cleanup.

Фраза «все проверки прошли» допустима только для effective integration gate.
Предыдущие 10/10 называются predecessor evidence, а не post-merge validation.

### 6.7 Тестовая матрица MERGE

Минимальные unit/integration проверки:

1. clean merge повторяет final CODE checks и merge policy checks;
2. одинаковые команды дедуплицируются, CHK refs не теряются;
3. browser/DB check из final CODE gate не исчезает из MERGE;
4. `external` evidence не исполняется shell-командой;
5. failed check оставляет target HEAD прежним;
6. repair меняет дерево, полный gate запускается новой epoch;
7. merge commit появляется только после passed gate;
8. commit tree равен проверенному staged tree;
9. conflict resolution проверяется полным gate;
10. crash до/после checks и до/после commit не дублирует apply/commit;
11. inline и server route используют один merge service и одинаковый gate;
12. report отличает predecessor и integration receipts;
13. изменение semantic alias до apply даёт drift;
14. новый mandatory policy floor включается до apply;
15. progress не даёт контроллеру принять долгую проверку за зависание.

Живые проверки на `dd-tasks`:

- clean inline MERGE с полным набором, включая browser и DB;
- server MERGE на небольшом disposable изменении;
- отдельный преднамеренный failed integration check, подтверждающий, что HEAD
  не изменился до исправления;
- после успеха — clean Git, полный report и все receipts.

## 7. Порядок реализации

### Фаза A — документационный контракт

1. Принять этот план как замену D14 плана 019.
2. Обновить SPC-009 только там, где реализация/наименования ещё расходятся с
   уже утверждёнными тремя корнями.
3. Обновить SPC-012: полный integration gate и commit-after-checks.
4. Обновить vNext PLAN/CODE-REVIEW/MERGE prompts и операционные ранбуки.
5. Не менять downstream Memory Bank копии вручную до готового канонического
   релиза.

### Фаза B — удаление неверной функциональности в dd-eval

1. Удалить runtime integrity command audit и tests.
2. Упростить candidate capture и Judge evidence packet.
3. Сохранить engine identity/checksum evidence.
4. Добавить test, что обычный candidate проходит без анализа команд.

### Фаза C — корни и run-bound contracts

1. Добавить/нормализовать `run_root` в SQLite и runtime types.
2. Мигрировать данные и убрать live fallback aliases.
3. Перевести schema resolution, stages, Works, snapshots, cleanup и reports.
4. Добавить cross-root regression suite.
5. Проверить все вызовы `validateSchema` и `findRunHome`, а не только
   CODE-REVIEW path из последнего эвала.

### Фаза D — harness configuration

1. Добавить `harnesses.json` schema/loader в публичный runtime contract.
2. Перевести runner и merge-server на один resolved config response.
3. Добавить deterministic isolated-home preparation.
4. Перевести адаптеры без изменения их нативной Session semantics.
5. Проверить все пять поддерживаемых упряжек contract tests.

### Фаза E — semantic boundary cleanup

1. Удалить arithmetic CODE-REVIEW grouping.
2. Заморозить effective review modes в RUN.
3. Провести системный аудит спорных `infer/auto/classify` веток.
4. Переименовать misleading validator и удалить найденные смысловые проверки.
5. Обновить prompts, чтобы агент явно владел перенесёнными решениями.

### Фаза F — MERGE gate

1. Заморозить accepted semantic check declarations при MRG enqueue.
2. Построить полный effective integration gate.
3. Переставить bootstrap/checks перед commit.
4. Добавить accepted tree и durable merge check epoch.
5. Обновить state recovery, reports и server route.
6. Выполнить полную тестовую матрицу и живые inline/server проверки.

### Фаза G — выпуск и новый эвал

1. Запустить format/lint/typecheck/unit/integration тесты затронутых репозиториев.
2. Провести review соответствия этой спецификации по фактическому diff.
3. Выпустить согласованную пару `dd-memorybank` + `dd-flow-cli` по их runbooks.
4. Обновить dd-eval profile/entry pack только если изменился его контрактный
   вход; E2E не зависит от downstream canonical stage packages.
5. Подготовить чистый изолированный runtime через новый copier.
6. Запустить новый E2E до MERGE и Judge, фиксируя дефекты без ручного изменения
   RUN/SQLite/receipts.

## 8. Карта предполагаемых изменений

Точные имена могут уточниться при реализации, но ответственность не должна
разъехаться:

### `dd-eval`

- `lib/runner.mjs`: удалить audit, добавить isolated-home preparation;
- `test/eval.test.mjs`: удалить parser tests, добавить candidate/home tests;
- `runbooks/execute-eval.md`: убрать runtime tampering verdict, описать config
  copy и полный integration evidence;
- `specs/019-...md`: отметить D14 как заменённый этим документом.

### `dd-flow-cli`

- `src/services/schema-validation.ts`: явный run/workspace root;
- `src/services/run-engine-bindings.ts`: убрать lifecycle scan по project root;
- `src/services/vnext-code-review.ts`: убрать arithmetic grouping и path-based
  auto mode;
- `src/services/vnext-merge.ts`: frozen full gate, check-before-commit, tree
  proof и report;
- `src/services/code-checks.ts`: переиспользовать существующие declaration,
  deduplication и durable receipts, не создавать второй executor;
- existing run/path/config services: `run_root` и harness loader;
- migrations/schemas/help/tests — синхронно с контрактом.

### `dd-memorybank`

- `SPC-009`: финализировать три корня и `run_root` naming;
- `SPC-012`: новый MERGE gate/checkpoint contract;
- vNext `plan.md`, `code-review.md`, `merge.md`;
- соответствующие JSON schemas/examples/indexes;
- release notes и compatibility range согласованной пары.

## 9. Критерии готовности

Пакет завершён только когда одновременно истинно следующее:

1. в продуктивном коде и документации нет runtime command tampering audit;
2. candidate не блокируется эвристикой по тексту команды;
3. каждый активный RUN имеет ровно один `run_root` под `DD_FLOW_HOME`;
4. stage/schema resolution не зависит от совпадения feature worktree со
   стабильным project root;
5. isolated `DD_FLOW_HOME` получает конфигурацию выбранной упряжки до Session
   creation;
6. runner и merge-server разрешают одну и ту же harness configuration;
7. CLI не группирует CODE-REVIEW аспекты произвольными чанками;
8. effective review mode объясняется сохранённым source, а не текущим числом
   файлов;
9. MERGE на integration workspace исполняет полный принятый executable gate;
10. failed MERGE gate не двигает target branch;
11. успешный integration commit имеет тот же tree, который прошёл gate;
12. inline/server MERGE дают эквивалентные receipts и stage report;
13. новый живой E2E заканчивается MERGE и Judge без ручной правки runtime;
14. все изменения закоммичены, опубликованы по runbooks, рабочие деревья чисты.

## 10. Намеренные упрощения

- Нет security sandbox: изоляция эвала и сохранённые журналы достаточны для
  текущей цели.
- Нет отдельного `DD_FLOW_RUN_ROOT`: `run_root` уже принадлежит RUN.
- Нет harness-specific config framework: один небольшой JSON и общий loader.
- Нет автоматического semantic check selection: PLAN уже владеет выбором.
- Нет временного merge repository: существующий integration workspace защищён
  lane lock, а commit переносится после gate.
- Нет повторного независимого CODE-REVIEW после MERGE: MERGE выполняет
  верификацию интегрированного результата, а не новый смысловой обзор кода.

Эти ограничения пересматриваются только после реального кейса, который они не
покрывают.
