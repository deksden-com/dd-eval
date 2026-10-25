# 102 — Проверки по зонам изменений, без полного release-gate

Статус: реализован; проверки и границы переиспользования — в [отчёте](102-implementation-report.md).
Дата: 2026-10-25. Основание: решение оператора отказаться от обязательных полных
прогонов при выпуске engine и от тестов без конкретной причины при подготовке EVAL.

## 1. Цель и границы

Проверяем изменение поведения, а не событие «merge», «новая версия» или «запуск EVAL».
Ни одно из этих событий само по себе не запускает полную тестовую батарею.
Тесты не удаляем; обязательный полный профиль убираем из admission/publish/default
commands. Не переносим его в nightly, CI, скрытый fallback или «последний шаг».
GitHub CI остаётся выключенным; workflow dispatch не выполнять.

Разделяем три независимых основания проверки:

1. Изменилось поведение/зависимость — один раз проверяем затронутые контракты.
2. Доставляем конкретный пакет — проверяем его идентичность и целостность.
3. Создаём новый test-world — проверяем его собственную готовность и изоляцию.

Результаты первого пункта переиспользуем при неизменных значимых входах. Второй
не требует повторного поведенческого тестирования. Третий не является повторной
проверкой поведения всей фикстуры.

Не ослабляем проверки продукта внутри CODE/repair/review и финальный Judge.
Не исправляем продукт вручную вместо Subject. Не переименовываем упавшие прогоны
в PASS. Не меняем определения/артефакты работающих EVAL и не останавливаем их.
Этот план не разрешает запуск новых EVAL, публикацию или изменение runtime.

План заменяет требования обязательного полного release-профиля из плана 095 и
текущих операционных инструкций. Исторические отчёты 095/101 и старые receipts
сохраняют исходное значение: не переписываем их задним числом.

## 2. Что установлено по коду

Аудит engine выполнен на `ad05c70447949f295e588546fe27f6abc4640c3f`,
EVAL — на `b49ce95bc4b5b16d3b676fbd6d166b2f2dd3adb3`.
Рабочие определения пяти запущенных EVAL не редактировались.

| Место | Проблема | Изменение |
| --- | --- | --- |
| engine `package.json` | `test` вызывает полный `gate:release`; `gate:merge` всегда добавляет fast/hybrid | Обычная команда исполняет согласованную выборку, не весь профиль |
| `scripts/release-candidate.mjs` | `requiredReleaseSuites`, accept/verify требуют все семейства и integration shards | Требовать доказательства затронутых контрактов, а не статический полный список |
| `scripts/publish-release.mjs` | Admission опирается на полный accepted candidate, повторяет consumer-путь | Отделить проверку изменения от проверки доставленного пакета |
| `scripts/test-receipt-identity.mjs` | В ключе весь source/dist, HEAD, build metadata и несвязанные family env | Разделить provenance и значимые входы выбранной проверки |
| `scripts/run-test-receipt.mjs` | Частичная выборка разрешена только merge; discovery/identity широкие | Единый scoped-протокол для merge и release |
| `scripts/verify-test-inventory.mjs` | Проверяется весь release-профиль, все shards | Сохранять полноту именно выбранного набора |
| `vitest.config.ts` | Группы отражают способы исполнения, не зоны ответственности | Не считать `core-serial` семантической зоной; выбирать файлы/контракты |
| `test/native-adapter-contracts.test.ts` | Wrapper запускает 20 native fixtures независимо от изменённого адаптера | Явная выборка fixture IDs с тем же reporter/ownership контролем |
| EVAL `lib/engine-admission.mjs` | Matrix proof связан с целым engine digest/flow commit | Переиспользовать proof неизменного matrix-механизма с доказанной эквивалентностью |
| `lib/baseline-admission.mjs`, `lib/runner.mjs` | Каждый world повторяет quality/browser/isolation и producer compatibility probe | Общая оценка фикстуры + отдельная готовность каждого world |
| baseline policy Task Priority `@2` | install, quality, browser-install, browser, isolation выполняются на каждую попытку | Новый policy `@3`, без повторной полной оценки неизменной фикстуры |
| EVAL `package.json` | `test` и `validate` запускают все `test/*.test.mjs` | Выбор затронутых модулей; validate не должен скрыто дублировать test |
| Операционные runbooks | Full release PASS обязателен; baseline PASS запрещено разделять без различения его смысла | Описать новую норму и разделение assessment/readiness |

Последний полный gate: E3 — 535 PASS/9 SKIP, около 41 минуты; integration —
3427 тестов/217 файлов, около 79 минут. Это наблюдаемые затраты, не чистый
benchmark: нагрузка машины менялась. При этом gate не обнаружил ошибки типов
в замороженном внешнем baseline; их пришлось проверять на действительной фикстуре.
Большой прогон не заменяет правильный предмет проверки.

Аналогичные места: fork `zcode-acp` имеет общий `vitest run`, `mb-lint` — общий
Vitest и `build && changeset publish`; это команды ручного запуска, а не доказанный
обязательный полный gate. Не переделывать их ради единообразия. При изменении
bridge/linter запускать выбранные их контракты и engine consumer-контракт; чужие
неизменённые пакеты не тестировать. `dd-memorybank` — канон без корневого npm test:
исполняемые prompt/schema assets проверяются через их реальные engine consumers.

Не путать существующий `dd-flow/release-impact@1` с выбором developer-тестов:
это контракт миграции канона/проекта (`minimum_upgrade_mode`, domains), а не
каталог влияния engine source. Не перегружать его новым несовместимым смыслом.

## 3. Принятое устройство: минимум новых механизмов

Использовать существующие Node/Vitest runners, receipts, inventory и локальные
каталоги результатов. Добавить один декларативный каталог зон в engine
`scripts/verification-policy.mjs` и небольшой selector на стандартных Git/Node API.
В EVAL — такой же локальный каталог для его исходников, без копирования engine
правил; каждый репозиторий владеет своими source/test mappings. Общие форматы
receipt/selection поддержать существующими валидаторами.

Не вводить отдельный сервис кеша, очередь, автоматический transitive import graph,
новую библиотеку тестирования, новый DSL или универсальный CI-оркестратор.
Достаточно деклараций `zone → inputs/tests/consumers` и существующих runner argv.
Физическую организацию Vitest projects сохранить, пока она полезна для изоляции.

### 3.1. Каталог зон и минимальные consumer-проверки

| Зона | Выбираемые проверки |
| --- | --- |
| Конкретный native adapter: AGY/OpenCode/ZCode/Grok/Codex (также Droid, если затронут) | Его fixture, parser/session/transport tests, тонкий dispatch consumer; не все native fixtures |
| Shared provider retries, progress, session settlement/task-tree | Общий контракт плюс по одному применимому adapter consumer; все пять только при общем влиянии |
| Hooks, cwd, shell/admission | Parser/security/cwd tests, затронутые hook entrypoints; обе Codex home-конфигурации, если изменён resolver |
| Process/lease/storage/SQLite/retirement | Физические ownership/PGID/birth/lock/transaction сценарии затронутого механизма, не замена mock-only |
| Controller/stages/recovery/review/merge | Затронутые переходы и один thin full-cycle contract, только если меняется межстадийный контракт |
| Verification matrix, coverage/check evidence | Producer/schema/consumer и одна установленная offline matrix fixture при изменении installed-контракта |
| Canon prompts/schemas/workflow assets | Их hybrid inventory/validation и конкретный stage consumer; E3/E4 только затронутые сценарии |
| Install/router/package/build dependencies | Сборка/pack и один isolated installed-consumer smoke, без всех стадий |
| EVAL orchestration/admission/cleanup | Соответствующие Node test files, реальные ownership controls там, где нужны |
| Judge/Decisions/oracle | Структурные тесты и replay сохранённых ответов; новая live qualification только при изменении её значимых модельных входов |
| Product fixture/tooling | Затронутые API/web/tooling/type/browser contracts на действительном frozen baseline |
| Verification policy/receipts/publisher | Selection, integrity, reuse/admission и publication recovery contracts |
| Неисполняемые README/changelog/version-only | Поведенческих тестов нет; review ссылок/метаданных и delivery integrity при выпуске |

Полный source-path/test-path список заполнить при реализации из фактического
inventory: каждый исполняемый файл имеет owner-zone; общие helpers, templates,
schemas, manifests и runner config входят в inputs своих потребителей. Новый
неизвестный файл не получает молча «нет влияния». Каталог должен позволять отнести
один файл к нескольким зонам и явно задавать межзонные consumers.

Native wrapper: выбирать по стабильным fixture IDs из существующего `schedules`,
не произвольным regex имени Vitest case. Передать и проверить selection; неизвестный,
пустой неразрешённый или дублированный ID — ошибка. Сохранять реальные TAP cases,
полноту отчёта, разрешённые platform skips и cleanup. Self-tests самого wrapper
добавляются только при его изменении. Не запускать все 20 ради изменения AGY.

### 3.2. Как выбирается область

Сохраняемый selection manifest содержит: schema/policy version+digest, base/head
refs и content hashes, diff paths, zones, причины и consumers, точные test/fixture
IDs, значимые зависимости, существующие/reused/missing evidence. Это описание
проверки, не ещё одна certification-система.

База — последний интегрированный проверенный набор входов в ancestry целевого
main; при отсутствии подходящих receipts — фактический merge-base и проверка
затронутых зон без reuse. Для merge учесть все изменения main после branch-point:
пересчитать relevant fingerprints на итоговом candidate tree. Merge conflict
resolution или изменённая dependency инвалидирует только соответствующую зону.

Rename учитывает старый и новый путь; deletion — старый owner; executable bit,
symlink target, untracked nonignored runtime assets — такие же входы. Для dirty
dev-проверки фиксировать точные bytes; публикация требует frozen clean candidate.
Не читать секреты .env в отчёты: хранить лишь разрешённые nonsecret settings и
digest значимых secret/config inputs там, где это действительно нужно.

Неизвестный impact блокирует только согласование selection: оператор/разработчик
явно добавляет mapping и обоснование. Нет fallback «все тесты» и нет автоматического
нулевого PASS. Нулевой набор разрешён только для явно классифицированных изменений
без поведения; receipt говорит `not_required`, а не `tests_passed`.

Выбор обязателен и проверяется валидатором: нельзя передать publisher произвольный
пустой список required suites. CLI overrides могут расширить выбор; уменьшение
требует изменения/ревью policy, не `--skip` или причины строкой.

### 3.3. Повторное использование evidence

Для каждой выбранной группы ключ включает фактически потребляемые source/assets,
tests/helpers, runner/reporter/policy semantics, релевантные lockfile dependency
closures, tool versions и необходимые OS/arch/SQLite/настройки. В первой реализации
lockfile может быть консервативным общим input для зависимых JS-зон; это явно
задокументированное расширение выбора, не повод повторить все сценарии.

HEAD, всё Git tree, версия пакета, `built_at`, абсолютный путь home и несвязанные
env не являются ключом поведения. Они остаются provenance. Сборочный compiler и
реальные dependency bytes — значимые входы; version-only нельзя приравнять к
изменению runtime без анализа, если версия сама используется в логике.

Receipt неизменяемый: producer commit, fingerprints, exact command/selection,
discovered/executed counts+IDs, exit/signal, skips/TODO, report hashes, environment,
owned cleanup outcome. Reuse — отдельная ссылка с hash исходного receipt и
сопоставлением текущих inputs, без переписывания исходного artifact/RUN binding.
Существующий local report root достаточен; при отсутствии/порче evidence выполняем
недостающую выбранную проверку, не весь профиль.

Новый FAIL/INTERRUPTED не скрывается старым PASS для тех же входов. Автоповтора
тестов нет; явный rerun сохраняет оба результата и причину. Одновременно выполняющийся
проверочный owner не считается PASS; ожидание/присоединение только по его точной
идентичности, без кражи живого lock. TTL сам по себе не инвалидирует детерминированный
контракт; внешние mutable provider capabilities имеют отдельную compatibility policy.

Discovery проверяет полноту выбранного набора, включая динамические cases,
duplicates и неожиданные skips/TODO. Не импортировать все интеграционные тесты
просто для вычисления impact: discovery ограничен выбранными файлами.

## 4. Engine: merge и выпуск

1. `gate:merge`/обычный `test` используют selection и недостающие receipts.
   Typecheck выполняется для затронутого TS compilation unit; пока он общий —
   один `tsc`, но не все поведенческие тесты. ESLint — затронутые исходники;
   изменение общих compiler/lint rules расширяет соответствующую проверку.
2. Убрать обязательный `gate:release` и его вызовы. Не оставлять alias, который
   продолжает вызывать полный профиль. Явный ручной запуск отдельного семейства
   доступен; исторические полные receipts читаются без нового full-run требования.
3. Расширить `run-test-receipt` и inventory verifier scoped release-проверкой;
   убрать обязательность всех integration shards, canon/E3/E4 env при чужой зоне.
4. Candidate manifest новой версии `@2` хранит selection, evidence references,
   reuse bindings и delivery status. Accepted означает выполнение этой policy,
   не «все тесты репозитория прошли». Старый `@1` читается по старым правилам;
   не конвертировать его в фиктивный scoped/full PASS.
5. Удалить `requiredReleaseSuites` как основание publish. Пересчитать selection
   по source candidate; verify/accept/publish должны пользоваться одной policy.
6. Build/pack выполняются для доставки. Проверять version, source provenance,
   включённые runtime assets/dependencies, отсутствие секретов, tar hash и pins.
   Exact production closure сохраняется; unrelated whole-source digest не
   инвалидирует результаты отдельных контрактов.
7. Installed-consumer behavioral smoke нужен при изменении упаковки, router,
   install/resolve, bundled assets/deps или их consumer ABI. Его выполняем один
   раз на итоговом packed artifact; для metadata-only — проверка упаковки и
   декларативного package contract без повторного полного installed сценария.
8. После npm publish — реальное registry readback/version/tar digest и сверка
   production closure с зафиксированным пакетом. Это проверка доставки, не второй
   поведенческий consumer suite. Не устанавливать пакет повторно ради того же
   доказательства, если точный пакет уже был проверен и readback идентичен.
9. Сохранять publish lock, токен-гигиену, immutable tag, uncertain-publish recovery
   на тех же bytes, fail-closed при mismatch. Нельзя заново собрать «ту же версию»
   или запустить новую квалификацию вместо восстановления результата публикации.

Новый engine может быть опубликован по scoped policy без полного PASS.
Release verification и E2E qualification — разные статусы: публикация не означает
успешный полный E2E. Глобальные hooks/pins обновлять только на точный выпущенный
artifact с проверкой разрешения путей/совместимости, не через новый полный gate.

## 5. EVAL: подготовка без тестирования «на всякий случай»

### 5.1. Matrix и Judge

Matrix qualification `@4`: хранить digest producer/consumer/schema/templates и
значимых зависимостей механизма плюс реальные packet/RUN evidence. Проверяем
выбранный engine artifact целиком на целостность как сейчас, но сравниваем с
матрицей только её component fingerprint. Для старого `@3` с иным engine digest
нужно отдельное эквивалентностное binding, если старые исходные inputs доступны
и совпадают. Если доказать эквивалентность нельзя — выполнить одну соответствующую
offline fixture, не пять и не полный release-gate. Старый RUN binding не менять.
Версии канона/flow commits — provenance; изменение реально используемых matrix
assets/contract требует новой проверки, несвязанный README/адаптер — нет.

Judge: сохранить существующий независимый от Subject input-scoped механизм
`hitlQualificationInputs`, не строить новый. Subject adapter fix не вызывает
повторные модельные запросы. Oracle/validator fix — сначала replay сохранённых
положительных и отрицательных ответов. Новые вопрос/контекст/canonical packet —
затронутые cases; общая модель/semantic prompt — соответствующая live qualification
по явному основанию. Нельзя выдавать replay за новый ответ модели или обходить
реальный финальный Judge. Аналогично для Decisions provider/threshold/config:
неизменённый unrelated harness не причина квалификации, изменённый semantic input — причина.

Native compatibility/capacity: читать сохранённые доказательства точной native
версии/adapter contract/model capabilities. Не делать новый запрос модели только
из-за нового home. Реальное изменение версии CLI/auth/capability либо фактический
отказ обосновывает ограниченный probe. Native failure не обходить старым receipt.

### 5.2. Общая оценка фикстуры и готовность нового world

Новая baseline policy `@3` разделяет:

- `fixture_assessment`: что проверено в неизменном source/tooling/flow-pack/
  dependency/config variant; fingerprint и ссылка на результат проверки.
- `world_readiness`: собственные project/home/DB namespace/порт/owner birth,
  schema/seed/config/installed engine/hooks и подтверждённая изоляция данного world.

Fixture assessment выполняется при изменении соответствующих inputs, один раз
для нескольких упряжек. Начальный missing assessment — конкретные baseline
контракты, не engine fullsuite. Quality/type/browser/isolation tests разложить
по фактическим изменениям: типы тестов — оба нужных TS config; UI workflow — его
browser case; DB isolation tooling — физические isolation contracts. После
первичной оценки неизменённого baseline все пять EVAL используют её evidence.

Каждый новый world всё равно materialize/install с frozen lockfile и проверкой
фактических inputs; Chromium availability/install — только если нужен и отсутствует
правильный binary. Readiness — минимальные реальные DB connectivity/schema/role,
isolated write-read-cleanup sentinel, ownership и проверка отсутствия cross-world
маршрутизации. Не прогонять все browser CRUD workflows/quality на каждом home.
Проверить hook/engine routing без нового model turn. Не копировать writable DB,
PID/lease, абсолютные world paths или PASS другого окружения.

Producer compatibility `check-evidence-probe` — отдельный reusable контракт
producer/runner/consumer ABI с положительным и отрицательным контролем. Не
повторять вложенные tooling tests на каждом world при неизменной реализации;
при изменении контракта — один реальный probe с собственным owner и cleanup.

Новый baseline receipt явно различает `executed`, `reused_fixture_assessment`,
`world_readiness_passed`, источник и inputs. Итог «baseline admission готов» не
утверждает, что все quality/browser suites были выполнены в этом world. Старый
`@2` валидируется по старым правилам, не дописывается новым PASS.

Launch/canonical/focused/segment/fork/resume и compare helper должны вызывать
один admission resolver. Fork/new world не наследует чужую readiness; resume
перепроверяет своё владение/актуальную готовность без повторного fixture suite.
Изменившийся runtime/seed/source делает соответствующий результат неприменимым.
Scored histories не чинить на месте: новая policy/checkpoint — новые попытки.

Cleanup остаётся обязательной эксплуатационной операцией, не лишним тестом.
Проверять retained processes/DB перед запуском, чистить только доказанно свои
терминальные ресурсы, сохранять evidence. Живой владелец retirement lock — не
stale по длительности ожидания. Не удалять registry/homes ради быстрого preflight.
Не расширять этот план до переписывания retirement/очереди; наблюдавшийся lock
contention сам по себе не основание отключить barrier.

## 6. Согласовать все entrypoints и документы

Engine: `package.json`, `scripts/{release-candidate,publish-release,
run-test-receipt,test-receipt-identity,verify-test-inventory}.mjs`, Vitest/native
wrapper; README release recipes, package/publisher contract tests. В workflow
файлах убрать устаревшую обязательность полного профиля, не запускать и не
включать GitHub CI.

EVAL: `lib/{engine-admission,baseline-admission,runner}.mjs`, shared qualification
helpers/producer probe, scripts qualification/compare и CLI entrypoints, baseline
policy/schema/retained receipt validation. Не делать отдельные исключения для
AGY, Luna или «исследовательского» режима.

Обновить текущие `runbooks/flow-test-suite-verification.md`, `execute-eval.md`,
`git-workflow.md`, release/preparation instructions и актуальную operational
Memory Bank затронутых проектов. Убрать советы вручную повторить fullgate перед
EVAL и запрет cross-commit reuse независимо от inputs. Краткая инструкция:
определить impact → выполнить только missing checks → pack/delivery verify →
resource readiness → launch. Не копировать этот план в несколько ранбуков.
Исторические CP отчёты/планы остаются историей, со ссылкой на новую норму там,
где они используются как действующая инструкция.

DD-tasks: проверить helpers и baseline policies, не менять требования к продукту
в `code-check-profile`. Ошибки TS на frozen baseline не разрешать проверкой одного
current main: валидировать именно выбранный variant. Browser login 5s отказ
сохранён как факт; этот план не объявляет его исправленным и не маскирует retry.
Если readiness выявит такой отказ — отдельное расследование signal/wait path,
а не глобальное увеличение timeout или ослабление утверждения.

## 7. Реализация и порядок интеграции

1. Зафиксировать каталог/selector и scoped identity рядом с существующим receipt
   runner; добавить его точечные регрессии. Старый admission пока не ослаблять.
2. Перевести inventory/runner/native selection и candidate acceptance на новый
   протокол, изменить publisher/default scripts атомарно с policy. Не оставлять
   промежуточный режим «нет fullgate, но нет проверки scope».
3. Matrix component identity и baseline assessment/readiness, совместимые readers
   старых receipts; единый resolver во всех EVAL entrypoints. Подготовить новые
   policy/checkpoint definitions, не менять активные runs.
4. Привести operational docs/Memory Bank и contract tests в соответствие; выполнить
   только проверки изменённых механизмов. Проверка отмены fullgate не требует fullgate.
5. PR/review, scoped evidence, squash merge по правилам engine/EVAL; fork upgrade
   имеет свои merge rules. Никакого прямого main push/CI. Никаких live EVAL в рамках
   реализации без отдельного поручения. Не менять installed hooks в planning task.

Для новой policy нет автоматического grandfathering «любого старого PASS».
Reuse возможен только при восстановимом точном inputs mapping и целостном отчёте;
иначе один missing scoped run. Новые schemas пишутся одним путём; legacy readers
не превращать во второй постоянно развиваемый policy engine.

## 8. Минимальная проверка реализации

Это перечень контрактов для реализации, а не команда запускать тесты сейчас.

- Selection: adapter-only, shared helper, docs-only, version-used-as-data,
  rename/delete/untracked/symlink, изменённый main, unknown path, policy tampering.
- Reuse: unrelated commit/build timestamp/home не инвалидирует; relevant
  source/test/helper/dependency/env/runner change инвалидирует; receipt/report
  corruption/missing/failure/interruption не принимается; чужая selection не PASS.
- Inventory: выбранные файлы/cases выполнены полностью; лишние/недостающие IDs,
  unexpected skips/TODO, unsupported native fixture и signal дают отказ.
- Native wrapper: одна fixture действительно не вызывает остальные; shared retry
  выбирает все применимые consumers; реальные owned cleanup доказательства остаются.
- Publisher: scoped accepted candidate допускается; подделанная пустая выборка
  отвергается; metadata-only не запускает runtime suites; registry mismatch,
  uncertain publish/recovery, token redaction и isolated environment сохранены.
- Matrix: unrelated adapter change reuse; producer/schema/consumer/template
  change требует offline proof; legacy RUN не переписывается; forged equivalence
  и mismatched engine bytes отвергаются.
- Baseline: пять новых world используют один fixture assessment, но пять разных
  readiness; cross-namespace/port/owner, mutable state sharing, failed sentinel,
  stale receipt, resume/fork и interrupted cleanup fail closed.
- Judge: Subject-only change не вызывает live qualification; oracle replay и
  semantic input invalidation соблюдаются; score-stage checks не отключены.

Эти регрессии размещаются в текущих files рядом с соответствующими механизмами
(engine receipt/publish/native/matrix tests; EVAL engine-admission,
baseline-admission, qualification/runner tests), без нового E2E стенда.

### Практические критерии приёмки

1. AGY-only fix: его native fixture + общий затронутый dispatch consumer; нет
   E3/E4, остальных adapter suites и полной matrix/Judge qualification.
2. Shared overload fix: общий retry-контракт + тонкие consumers нужных упряжек;
   сохранены same-session continuation и исчерпание бюджета, без полных SDLC.
3. README/changelog/version-only: ноль behavioral tests, явное основание;
   при публикации — build/package/delivery integrity.
4. Новый выпуск того же проверенного поведения: не повторяет тесты по причине
   нового HEAD/version; прочитывает точный registry tar и сохраняет provenance.
5. Пять EVAL на неизменной фикстуре: нет пяти quality/browser/isolation suites,
   нет повторного Judge и producer probe без изменения; все worlds изолированы.
6. Изменение matrix: одна relevant installed offline qualification, не весь gate.
7. Непонятный diff: понятный запрос классификации, не многочасовой full fallback.
8. Нет утверждений «весь gate зелёный», если запускалась только выборка; отчёт
   показывает выполненные, reused и not-required checks и реальные ограничения.

## 9. Проверка готовности и ponytail

Решения приняты: trigger, owners/catalog, минимальные consumers, selection base,
unknown impact, fingerprint/reuse, отрицательные исходы, schema migration,
publisher integrity, matrix/Judge independence, fixture-vs-world, все entrypoints,
порядок включения и точечная приёмка. Не требуется выбирать framework/провайдера
или согласовывать новый полный профиль. Точные path mappings заполняются как
реализация каталога; unknown-path отказ не позволяет забытый файл принять за PASS.

Проверка достаточности: снимается не только команда полного gate, но и скрытая
обязательность в publisher, receipts, matrix и baseline. Без этих изменений
оптимизация была бы косметической или обходом admission. Сохраняются integrity,
physical ownership/isolation, полнота выбранного исполнения и честная оценка
Subject/Judge; они не подменяются кешем либо schema-only smoke.

Ponytail: используем существующие runners/reports и стандартные Git/Node API;
нет нового сервиса, автоматического dependency analyzer, дублирования Judge cache,
пяти одинаковых baseline suites или полного gate ради доказательства его отмены.
Каталог намеренно явный и небольшой. Изменения fork/linter вне затронутой логики
не нужны. Исторические доказательства не переписываем. Каждая проверка должна
иметь конкретный изменённый контракт или необходимость безопасной доставки/world.

Итог: план готов к реализации. В этой задаче проведён read-only аудит и записан
план; runtime/policy не изменены, тесты, публикация, CI и новые EVAL не запускались.
