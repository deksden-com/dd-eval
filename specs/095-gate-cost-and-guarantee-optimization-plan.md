# 095 — Оптимизация гейтов без потери полезных гарантий

Дата: 2026-10-21. Статус: план зафиксирован и проверен на готовность к реализации;
реализация, новые проверки, сборки, релизы и EVAL не разрешены этим документом.
Основание: согласованные пользователем read-only инвентаризация и подход.
Повторное readiness review: §9 уточняет решения и имеет приоритет при расхождении.

## 1. Результат и границы

Сделать получение доказательств корректности существенно дешевле: проверять
свойство на минимально достаточном уровне, не повторять неизменную подготовку и
не запускать весь системный набор после каждой локальной правки. Сохранить
независимые физические проверки там, где предмет проверки — реальный процесс,
транзакция, установленный пакет или сквозная сцепка механизмов.

Не оптимизировать runtime/provider policies ради тестов. Не удалять отрицательные
контроли, не вводить автоматические test retries, неожиданные skips или PASS по
одному exit code без проверки полноты. Не менять исторические результаты.
Не создавать новый scheduler, framework, сервис кеша или автоматический анализатор
транзитивных зависимостей. Не запускать платные модели в обычных offline-гейтах.

План 094 не объявлен завершённым: его проверки остановлены пользователем, merge
не выполнен. Сохранённые изменения engine и незакоммиченные тестовые доработки
нельзя потерять, смешать с baseline или считать проверенными новым профилем заранее.
План 095 — отдельная задача; изменения 094 и оптимизацию тестовой инфраструктуры
учитывать раздельными diff/receipts, используя workflow проектов.

## 2. Исходные факты и ограничения измерений

Исследованы engine checkout `dd-flow-plan094`, HEAD `6e972a2b` с сохранённым dirty
test-only delta, и EVAL checkout `dd-eval-plan094`, HEAD `9cb8d344` с dirty receipt094.
Это provenance исследования, не идентичность будущего принятого кандидата.

| Набор | Полезное доказательство | Сохранённое наблюдение |
| --- | --- | --- |
| typecheck / lint | Типы исходников/тестов; статические правила | PASS ранее получен; отдельной надёжной wall-разбивки нет |
| build | Production-компиляция, схемы/runtime assets, build provenance | Строгая сборка получена; фазовой стоимости нет |
| hybrid | Форматы и контекстные связи контрактов | 66 тестов, 42.4 s |
| hybrid:canon | Реальный canon, consumers, inventory, копии схем | 71 тест, 75.1 s |
| E2 | Setup, выбор/совместимость engine, архивы, provenance, CLI | 136 тестов, 682.3 s; 1 skip |
| E3 | Memory init/bootstrap, execution, review/repair/publication | 47 файлов; один memory-layer работал 15052 s до остановки |
| E4 | Upgrade, storage transition, preservation | 80 тестов, 471.6 s; signed installed chain отдельно не выполнен |
| release | Build identity, установленные assets, acceptance/publish/recovery | 2 Node-теста: 3.8 s; 8 Vitest: 95.4 s |
| integration | Engine/SQLite/lifecycle/controller/recovery/snapshots/CLI | Прерван; сумма завершённых тел около 15179 s, не wall всей команды |
| runtime-sensitive | Detached ownership, native contracts, physical cleanup | 7423.7 s; 42 PASS / 7 FAIL, не приёмка |
| EVAL default | Runner, Judge/decision plumbing, профили, evidence/diagnostics | 955 тестов, 893.5 s; 940 PASS / 15 skips |

Эти прогоны выполнялись под неодинаковой внешней нагрузкой и частично конкурировали
друг с другом. Они локализуют стоимость, но не задают норматив и не доказывают
процент ускорения. Длительности вложенных suite/file/case нельзя складывать вместе.
Прерванные, отфильтрованные и opt-in не выполненные случаи не считать PASS.

Основные завершённые тела integration: run-control-resume 3342 s,
run-controller-capture 2370 s, stage-lifecycle-ownership 1717 s,
run-control-admission 1369 s, work-receipt-publication 903 s — около 64% суммы.
746 завершённых fast cases занимали суммарно 12.6 s без imports/runner overhead.

Источники: FLOW `package.json`, `vitest.config.ts`, `.github/workflows/npm-publish.yml`,
`scripts/{release-candidate,run-test-receipt,verify-test-inventory,test-receipt-identity,source-test-loader}.mjs`,
`scripts/e3-memory-layer.test.mjs`, `test/native-adapter-contracts.test.ts`;
EVAL `runbooks/flow-test-suite-verification.md`, `specs/066-implementation-report.md`;
сохранённые `/tmp/dd-plan094-*.log`. Логи временные: до их утраты при будущей
реализации сохранить используемые выдержки/receipts вне tracked source без секретов.

## 3. Установленные причины избыточной стоимости

1. **Разные определения полного gate.** Локальный `pnpm test` включает hybrid,
   E2/E3/E4, release, integration, runtime-sensitive. Publish workflow использует
   hybrid, release, integration shards и runtime-sensitive, без отдельных E2/E3/E4
   и hybrid:canon. README/ранбук описывают старую последовательность. Это расхождение
   политики, а не основание автоматически убрать локальное покрытие.
2. **Повторная установка как универсальный setup.** В E3 цепочка
   projectBootstrapFixture → publicationFixture → installed создаёт архивы,
   хеширует payload, выполняет installRelease и подготавливает stores/execution
   даже для узких проверок. Дублирование подготовки доказано; семантическое
   дублирование assertions требует поштучного сопоставления перед удалением.
3. **Смешанные уровни.** Большой memory-layer объединяет проверки данных, SDK,
   installation, compiled CLI и controller. Набор режимов через env усложняет
   выбор нужных зависимостей, диагностику и доказательство полноты.
4. **Повторный cold graph.** source-test-loader выполняет transpileModule;
   изолированные процессы повторно загружают графы. В целевых прогонах import
   иногда занимал больше тела. Долю compiler/IO/нагрузки нельзя точно разделить
   без фазовых измерений; не объявлять причиной исключительно TypeScript.
5. **Слишком дорогая матрица.** Общую политику и provider-specific wiring местами
   проверяют через многоступенчатые CLI-цепочки. Например, adapter-progress имеет
   6 entrypoints × 4 отрицательных комбинации; требуется сохранить все 24 клетки,
   но не обязательно 24 раза повторять полный cold graph.
6. **Недетерминированные фикстуры.** Процесс жил две секунды до identity check;
   маленькое окно ожидания включало journal setup; detached worker ожидали 10 s.
   Увеличение всех timeout не устраняет смешение подготовки и проверяемого свойства.
7. **Конкурирующие прогоны.** Ранбук уже требует одну локальную цепочку. Это правило
   было нарушено общими и целевыми запусками; исправляется сначала организацией.
   План066 уже измерял двух workers: полная цепочка стала на 3.3% медленнее.
8. **Дорогие общие identity scans.** Receipt wrapper несколько раз вычисляет
   source/dist identity; verifier повторяет проверку. Гарантия полезна, стоимость
   пока не локализована. Оптимизировать лишь после основных fixtures, не удалять
   контроль целостности production engine или границ приёмки.

## 4. Принятые архитектурные решения

### 4.1. Уровни и обязательность

| Свойство | Минимально достаточный уровень | Независимый физический контроль |
| --- | --- | --- |
| Классификация, retry episode, state transitions, idle window | Общая функция, явные события/локальные часы | Реальный timeout/отмена транспортного вызова |
| Schema/prompt/event mapping | Данные и реальные сохранённые формы входов | Package asset/adapter wiring smoke |
| SQL CAS/rollback/атомарность | Настоящая SQLite, точные строки/соединения | Независимый writer process для межпроцессного свойства |
| PID/birth/signals/detached owner | Реальные процессы и identity | Обязателен; mock не заменяет отсутствие/завершение |
| Installation/entrypoints/copied assets | Настоящий пакет вне source checkout | Обязателен на финальном artifact |
| Сцепка stages/recovery/publication | Целевой controller/system scenario | Сохраняется для каждой уникальной границы |
| Signed old/new compatibility, live model quality | Явная qualification | Отдельная область приёмки с точными входами |

Полный релизный профиль после преобразования содержит все обычные обязательные
гарантии текущих hybrid/canon, E2, E3, E4, release, integration и native наборов.
Перенос теста на более дешёвый уровень допустим; перевод полезной гарантии в
optional ради скорости — нет. Специальные signed/live проверки остаются отдельными,
но если конкретный релиз требует такую совместимость, её отсутствие блокирует
именно это утверждение о совместимости. Skipped не означает qualified.

### 4.2. Профили запуска и существующий SSOT

- **Development:** быстрые проверки и целевые случаи; результат не acceptance.
- **Merge для кода:** typecheck/lint, все быстрые контракты, затронутые storage/process/
  flow/canon проверки и package smoke при изменении собираемых/поставляемых bytes.
  При неоднозначном влиянии брать объединение затронутых наборов, не угадывать.
- **Release:** полный оптимизированный offline-профиль на одном замороженном
  кандидате плюс чистая установка точного artifact. Publish не пересобирает его.
- **Qualification:** дополнительные явно выбранные signed/installed/live сценарии;
  не скрытая предпосылка обычной локальной проверки unrelated кода.

Состав Vitest файлов остаётся в `vitest.config.ts`; Node families и канонические
команды профилей — в `package.json`. Новые имена `gate:merge`/`gate:release`
допустимы как простая композиция существующих средств, не новый runner.
Merge состоит из общей базовой команды и явно выбранных дополнительных наборов
по §4.3. Выбор и его обоснование записываются в task/PR receipt; нет утверждения,
что одна команда автоматически обнаруживает все затронутые зависимости.
Документальные изменения без исполняемых инструкций используют отдельный дешёвый
путь из §4.3, без typecheck/build/runtime ради самого факта изменения репозитория.
Required release suite IDs экспортировать из существующего release-candidate
модуля и использовать в acceptance/workflow contract tests, не держать несколько
расходящихся ручных перечней. CI и локальный release обязаны доказывать одинаковый
логический набор; четыре shards на отдельных VM — способ исполнения, не другая
политика. Документация ссылается на владельца состава, не копирует списки файлов.

При исходном переносе все текущие cases сохраняются. Ни один файл не выпадает
из inventory из-за переименования группы. Новые неклассифицированные файлы идут
в консервативный serial набор и остаются обязательными для release.

### 4.3. Выбор затронутых проверок для merge

Не полагаться только на `--changed`: fixtures, schemas, canon, dynamic imports и
dist имеют неявные зависимости. Начать с обозримой таблицы областей изменений:

| Изменение | Обязательная область merge |
| --- | --- |
| Документация без исполняемых/канонических инструкций | Проверка ссылок/команд; без полного runtime |
| Чистая policy/parser/state функция | Быстрые positive/negative + контракты её callers |
| Adapter/provider mapping | Общая policy + точные adapter fixtures и wiring |
| Hooks/identity/lease/cancellation/shared runtime | Все потребители общей границы, реальные owner/cleanup/late-ACK проверки |
| Storage/schema/writer/restore | SQL/межпроцессные/CAS/rollback + affected init/upgrade/recovery |
| Stage/prompt/Work/controller | Packet contracts + affected lifecycle/replay + один нужный system путь |
| Canon/schema/descriptor | Hybrid/canon consistency + affected engine consumers и asset smoke |
| Packaging/dependencies/loader/entrypoints | Строгий build, установленный пакет, assets и affected cold/wiring paths |
| EVAL runner/Judge/decision plumbing | Affected EVAL suites и парные FLOW контракты, не новая живая квалификация неизменного Judge |

При сочетании строк выполнять объединение. Изменение самого selection/receipt/
gate policy требует проверки полного inventory и окончательного release-профиля.
Изменение текста Markdown, потребляемого агентом, не считать просто документацией.

### 4.4. Переиспользование подготовки

- Build once уже реализован в publish workflow: сохранить эту гарантию.
- Неизменные engine/canon bytes, архивы и inventory готовить один раз на точную
  комбинацию artifact/canon/fixture inputs в пределах запуска; простой локальный
  helper/Map, если это достаточно. Без внешнего кеша и фонового сервиса.
- Ключ подготовки включает содержимое влияющих inputs/вариант mutation, а не
  только version/path/mtime. Изменившийся fixture input не получает старый payload.
- Для не-installation тестов готовить минимальное валидное состояние средствами
  существующих fixture helpers. Реальный installRelease оставить installation
  тестам и небольшому числу system сценариев. Нельзя подложить обходящий проверку
  production authority документ вместо требуемого retained receipt.
- Closed pristine SQLite template допустим лишь когда schema init/migration не
  предмет теста: закрыть соединения, корректно получить standalone snapshot,
  создавать отдельную изменяемую копию и уникальные runtime identities.
- Не использовать общий mutable store, hardlinks изменяемых файлов, symlink
  вместо проверяемого regular installed package или файловую копию открытой WAL-БД.
- Тесты tamper/migration/installation работают на собственной копии и проходят
  настоящую проверяемую операцию. Кеш не должен скрывать их mutation.
- Не кешировать successful authority/lease/physical identity проверки между
  разными операциями и не убирать production integrity admission ради тестов.

### 4.5. Границы переиспользования результатов

В первой реализации reuse PASS разрешён только для того же frozen source/test/
fixture/config/canon/build кандидата и нужной платформы, с полным receipt.
Не пересобирать посреди suite, не складывать PASS разных dirty trees в acceptance.
Interrupted/failed/partial report не переиспользуется как PASS. При изменении inputs
повторять затронутую проверку; provenance оставлять целиком.

Межкоммитный dependency-aware reuse результатов — НЕ часть первой реализации.
Сначала устранить дорогую повторную подготовку и неправильную обязательность.
Commit/tree остаются provenance; документация не превращается в семантическую
зависимость всех тестов только потому, что она находится в том же репозитории.

## 5. Последовательность реализации и проверяемые результаты

### A. Зафиксировать baseline и карту гарантий

1. Сохранить существующие логи, exact source/build/canon/delta и известные failure
   categories. Не запускать тяжёлый baseline заново только ради таблицы.
2. После отдельного разрешения реализации получить inventory существующими
   Node/Vitest средствами; записать cases, параметры, nested cases, skips/opt-ins.
   Node не требует отдельного исполнения всей suite ради discovery: правила §9.2.
3. Для каждого преобразуемого тяжёлого case записать: гарантия → минимальный уровень
   → сохраняемый independent physical control → новая location/identity.
4. Подготовить transfer map для moved/merged cases. Удалять дубликат только когда
   указана сохраняющая все его отличия проверка. Одного совпадения названий мало.

Выход: полный учёт tests/guarantees и конкретная карта переноса, без смены runtime.

### B. Согласовать команды, policy и evidence

1. В существующих config/scripts реализовать профили §4.2 и выбор §4.3.
2. Синхронизировать package scripts, workflow, release required IDs, README и
   `runbooks/flow-test-suite-verification.md`; убрать устаревшую ссылку на ветку066.
3. Расширить существующие receipts/inventory checker на обязательные Node families:
   reuse native reporter/Node events и общую provenance, без второго формата
   «success без cases». Нужны file/case identity и multiplicity, exit/signal,
   неожиданные skip/TODO, missing/duplicate/foreign cases, exact artifact identity.
4. Не добавлять unconfigured required group, которая неизбежно skipped локально;
   явные qualification prerequisites отделить от обычного offline состава.

Выход: одна логическая release policy локально/в CI; фильтрованный merge не может
выдать receipt полного release; пустые/частичные/прерванные наборы отвергаются.

### C. Упростить подготовку E3 и разделить уровни

1. Выделить из memory-layer только используемые fixture builders без top-level
   tests/env effects. Отделить лёгкие data/SDK tests от installed/system сценариев.
2. В `installed`, `publicationFixture`, `projectBootstrapFixture`, `builtEngineFiles`
   переиспользовать неизменные bytes и прекратить installation там, где она не
   предмет проверки. Общий helper исправляет всех callers, не отдельные тесты.
3. Сохранить настоящую public init/controller/replay цепочку, actual canon path,
   installed consumer, drift/crash и уникальные opt-in physical cells.
4. Не плодить маленькие файлы с тем же полным import graph. Группировать по
   зависимостям. Повторную TS-транспиляцию устранять существующим runner/build
   transport только если измерения после разделения показывают её существенную
   стоимость; отдельный compiler cache framework не нужен.

Выход: data case не собирает/устанавливает полный engine; immutable archive
assembly выполняется один раз на вариант; реальные installation tests не ослаблены.

### D. Оптимизировать пять основных integration hotspots

| Область | Изменение | Что обязательно остаётся реальным |
| --- | --- | --- |
| run-control-resume | Общие isolated starting states; дешёвые policy cells отдельно от длинных resume CLI цепей | Same-session recovery, fence, exact admission, lost reply, cleanup/cancellation |
| run-controller-capture | Лёгкий source inventory отдельно от capture orchestration; повторное неизменное fixture payload | WAL/logical change, независимый writer, journal cuts, tamper и publication race |
| stage-lifecycle-ownership | Минимальные Session/Work/hook rows, без unrelated startup | SQL claim/CAS, consumed/foreign/stale identity, no-write denial |
| run-control-admission | Общая матрица guard decisions in-process + отдельные compiled entrypoint cells | Межпроцессный writer/control race и exact recovery/HITL permit |
| work-receipt-publication | Подготовленная isolated Work база, минимум unrelated CLI | Writer не удерживается во время FS publication; crash/replay и concurrent attempt |

Не заменять SQL на mock в тесте SQL и физический join на mocked absence. Для
матрицы сохранять все отличающиеся входы/исходы, но не дублировать общий cold setup.

### E. Native fixtures и детерминированность

1. Общую overload/settlement/state policy проверять один раз на общем механизме;
   каждый adapter сохраняет реальную форму events/errors и wiring smoke.
2. Разделить 24 отрицательных entrypoint cells на общую parser/admission матрицу
   и необходимые реальные entrypoint checks; transfer map сохраняет все различия.
3. Pure time-policy использует локальные явные часы; реальные birth/signal/cleanup
   не подменяются. Ready/finish управлять handshake/barrier, не sleep на скорость Mac.
4. Whole-case CI guard покрывает setup/body/drain; не выдаёт provider retry и не
   подменяет productive idle window. Не увеличивать runtime TTL/deadline ради PASS.
5. На базе existing cleanup helpers ввести один ownership/drain контракт фикстур:
   прекратить запуск, остановить exact owned tree, подтвердить отсутствие, лишь
   затем удалять root. Неизвестная cleanup сохраняет evidence и не становится clean.
6. Зафиксировать незакрытый Droid cleanup случай094: failed `ps` observation не
   доказывает отсутствие процесса. Проверить общий helper/callers отдельно от
   оптимизации; не скрывать ошибку skip/retry whole test. Новый runtime fix при
   необходимости оформить отдельно, с собственным focused proof.

Выход: policy cells не зависят от real scheduler pauses; transport/OS guarantees
проверены физически; остановка gate не оставляет тестовые detached owners.

### F. Ресурсы и наблюдаемость

1. Одна локальная тяжёлая цепочка за раз, включая целевые проверки из других
   worktrees. Соблюдать существующий runbook; не создавать cross-chat lock service.
2. CI сохраняет отдельные VM shards. Локальный multi-worker не включать по умолчанию;
   повторно оценивать только после сокращения подготовки и аудита изоляции.
3. В существующие отчёты добавить ограниченную фазовую сводку setup/import/body/
   cleanup и счётчики CLI starts, archive assemblies, payload copies/digest scans.
   Инструментировать общие fixture helpers, не каждый assert и не production hot path.
4. Сначала устранять основные операции; повторные receipt identity scans/частично
   пересекающиеся typecheck+build оптимизировать только при доказанной стоимости.
   Typecheck включает тесты, production build — другой охват: просто удалить один
   как «дублирующий» нельзя. Целостность на границах release обязательна.

### G. Измерить и принять

1. Проверять каждый преобразованный helper целево по мере реализации, не повторять
   полный набор после каждого редактирования теста/документа.
2. Для основных hotspots получить сопоставимые before/after на одной машине,
   одинаковых inputs/platform/runtime и без собственной конкурирующей нагрузки.
   Existing logs — диагностика; не выдавать несопоставимые времена за speedup.
3. Один парный замер на изменённый hotspot, повтор только при неоднозначном
   результате/разной нагрузке. Не удваивать каждый обычный gate ради benchmark.
4. После freeze выполнить один полный новый release-профиль с complete receipts,
   package install smoke и проверкой Node/Vitest inventory union. При failure
   расследовать и повторить затронутую область; окончательная приёмка относится
   только к coherent frozen candidate, не к произвольной сумме разных версий.
5. Локальный/CI equivalence проверить workflow contract tests; реальный GitHub run
   отмечать отдельно. Не объявлять локальное исполнение выполнением GitHub workflow.

## 6. Edge cases и обязательные отрицательные проверки

- Cache miss/corruption/изменение canon, build, fixture variant не дают stale payload.
- Mutation одного test home/store не меняет другой; повторный запуск не наследует
  Sessions, IDs, ports, environment, открытые соединения или логи предыдущего.
- Изменение source-schema/копируемого MJS asset без TS diff выбирает нужный набор.
- Renamed/parameterized/nested case не исчезает и не учитывается дважды.
- Новая группа/файл, failed discovery, пустой reporter, TODO, unhandled error,
  interrupted suite и несоответствие process exit/JSON success блокируют acceptance.
- Source/dist/canon изменились во время проверки — receipt не авторизует release.
- Повторный reporter event/mtime/heartbeat не считается полезным прогрессом.
- Нет mb-lint/WT/shell/platform capability: статус и область coverage явны; отсутствие
  обязательной capability не маскируется неожиданным skip или запуском другой версии.
- Signal/timeout во время startup/body/cleanup: не запускаются новые дочерние действия;
  нет удаления root до физического drain; foreign процессы и настоящие EVAL untouched.
- Подготовленный DB template проверяет изоляцию; реальные schema init/migration,
  rollback-after-crash и open-WAL tests никогда не получают этот shortcut.
- Минимальная shared matrix не заменяет native-ID/request/generation/ordering
  особенности конкретной упряжки. Разные контракты остаются разными тестами.

## 7. Критерии завершения и порядок интеграции

1. Есть transfer map всех преобразованных cases и сохранённых гарантий; нет
   непреднамеренной потери negative/parameterized/nested coverage.
2. Локальный release и CI используют один required guarantee set; профили development,
   merge, release, qualification различены в командах, receipts и документации.
3. Чистые policy/data tests не устанавливают engine и не запускают native процессы.
   Installation/archive assembly выполняется только там, где нужна, либо один раз
   на неизменный variant; изменяемые данные каждого теста изолированы.
4. Успешный cleanup подтверждает отсутствие принадлежащих проверкам живых процессов;
   сигнал прекращает новый dispatch. Если drain не доказан, результат не clean/PASS,
   uncertainty, failure evidence и точные owned identities сохранены (§9.4).
5. Есть фазовые/операционные before/after, показано сокращение повторной подготовки
   и wall стоимости основных hotspots без новых ошибок/скрытого missing coverage.
   Заранее не обещать N-кратное ускорение и не вводить произвольный норматив минут.
6. Финальные typecheck/lint/build и полный оптимизированный offline release-профиль
   проходят на одном кандидате. Existing platform skips перечислены; opt-in live/
   signed acceptance отдельно pending, если не разрешена/не требуется этой задачей.
7. В отдельных coherent commits/PRs интегрированы engine test infrastructure и
   EVAL runbook/policy docs по `runbooks/git-workflow.md`; замороженные runtime
   исправления094 имеют собственный учёт. Никаких новых EVAL/релизов по умолчанию.

Миграция порядка проверок: сначала полнота/evidence и команды; затем перенос
hotspots с сохранением case map; после успешной приёмки переключение обязательного
профиля. Не сохранять вечный обязательный двойной запуск старого и нового наборов.
Rollback — вернуть конкретный перенос/helper/profile отдельным commit, сохраняя
логи и runtime исправления; не переписывать shared history.

## 8. Проверка по ponytail и готовность

Ponytail review выполнен документально, без запуска проверок:

- Используются существующие Vitest projects, Node runner/reporters, package scripts,
  fixture/cleanup helpers и receipt verifier; новых dependencies/frameworks нет.
- Сначала удаляется повторная работа в общих helpers, а не добавляется кеш в каждом
  тесте. Учитываются все callers. Имена групп не объявляются доказательством coverage.
- Нет speculative distributed cache, AST selector, scheduler или новой системы TTL.
  Cross-commit reuse отложен; начальный reuse ограничен точными frozen inputs.
- Не оптимизируются вслепую compiler/integrity scans и не удаляются реальные safety
  controls. Дешёвый mock не заменяет физическое свойство.
- Карта гарантий нужна для разрешения удаления/переноса; это рабочая таблица, не
  второй executable registry рядом с vitest.config.ts.
- Измерение — часть проверки результата, не постоянно обязательный двойной gate.

Readiness review: область и запреты, required guarantees, владельцы состава,
профили/выбор при ambiguity, cache isolation, evidence/multiplicity, interrupts,
platform/opt-in prerequisites, критерии приёмки и rollback определены.
Первый исполняемый шаг A уточняет конкретный case transfer inventory; это работа
реализации по принятому правилу, не неразрешённый архитектурный выбор.
Численное ускорение и PASS будущего gate пока неизвестны и не заявляются.
План готов к реализации после отдельного разрешения пользователя. Сейчас создан
только этот документ; никакие команды из плана не выполнялись.

## 9. Повторное readiness review: закрытые пробелы

Дата: 2026-10-21. Проверены решения §§1–8 и реальные constraints existing receipt
checker/cleanup helpers. Review документальный: код не менялся, проверки не запускались.

### 9.1. Merge evidence не должно подчиняться правилу полного release

Текущий `verify-test-inventory.mjs` допускает только release/runtime-sensitive или
полный integration inventory, а его provenance checker фиксирует полные команды
и unsharded/четыре shard identities. Просто добавить `gate:merge` недостаточно:
он либо не получит валидный receipt, либо ослабит проверку полного набора.

Принято решение расширить существующие writer/verifier явной областью
`scope: merge | release`, сохранив строгую release-ветку. Старый receipt без scope
трактовать только по прежним полным правилам; не выдавать новый частичный scope
за старую полную приёмку. Для merge сохранять выбранные файлы/группы, основание
выбора по §4.3 и реально исполненные case identities. Все явно выбранные targets
обязаны быть собраны и завершены; недостающий target — NOT RUN, не PASS.
Release проверяет union всего required inventory, а не union заявленного subset.
Negative controls: merge receipt передан release verifier, пропавший выбранный
файл, foreign case/shard, несовпадение scope/command и partial nested report.

Не добавлять обязательный одиночный package smoke каждому изменению: при чистой
policy-правке source tests достаточны до затронутого уровня. Любой merge-тест,
который вызывает compiled CLI, обязан получать актуальный замороженный dist;
следовательно, он требует build/проверки identity даже если packaging не менялся.
Изменение tests-only не повод запускать runtime всего проекта: typecheck/lint
затронутого тестового кода и выбранные affected contracts сохраняются. Документы,
канонические инструкции и исполняемый code по-прежнему различаются по §4.3.

### 9.2. Полнота и достаточность проверок — два разных доказательства

Для Node исходный file inventory берётся из существующих явных family globs/
entrypoints. Reporter собирает реальные case events во время единственного
запланированного выполнения. Не предполагать наличие безопасного `list` режима:
импорт Node test module может выполнить setup и зарегистрировать динамические cases.
Vitest file discovery также считать исполняемой операцией, не запускать сейчас.

Transfer map хранит старый file/full case name/parameter identity/multiplicity,
негативный исход или проверяемый invariant, новую location и сохраняемый физический
контроль. Для default и opt-in cells учитывать разные explicit env/inputs;
не требовать декартово произведение всех env flags. Unsupported сочетания не
превращать в новые обязательные gate cells. Матрица определяется существующими
поддерживаемыми контрактами и установленными дефектами.

Число PASS и совпадение названий не доказывают сохранение assertions. При lowering/
объединении case нужен review исходных и новых assertions. Для каждого изменённого
общего helper/типа переноса добавить минимальный контроль чувствительности: явный
неправильный input/event/state должен заставить проверку отказать по нужной причине.
Использовать существующие seams/fixtures, без mutation-testing framework и без
глобальной подмены production функций. Критические physical races сохраняют
независимую ошибочную/конкурирующую сторону и отрицательную ветку.

Если исходный case не успел выполниться в остановленном прогоне, это отмечается
как неизвестный baseline, а не потерянный PASS. Его invariant определяется по
коду; целевой baseline при необходимости совмещается с paired hotspot measurement,
без нового полного старого gate. Новые regression cases могут увеличить число
тестов; объединение — уменьшить. Приёмка опирается на reviewed transfer map,
полноту нового inventory и чувствительность проверок, не на равенство PASS-count.

### 9.3. Кеш — только подготовка, не общий mutable world

Первый вариант кеша ограничить lifetime одного процесса/fixture family, lazy по
потребности; не прогревать все варианты и не держать несколько полных engine trees
в RAM ради ускорения. Для больших неизменных bytes переиспользовать существующий
run-owned read-only payload/archive на диске. Shared Map не считается кешем между
forks; не обещать межпроцессное ускорение без реально устранённого повторного setup.
Если fork нуждается в отдельном writable tree, его копирование остаётся явной
учтённой операцией. Общий материал не передавать на изменение потребителю: mutation
fixtures получают собственную копию; не допускать утечки изменяемых Buffer/Map ссылок.

DB template по умолчанию содержит только схему и действительно статичные данные.
Абсолютные пути, project/RUN/Session/Work identities, owner tokens, lease expiry,
in-flight operations и retained authority создаются после копирования для данного
test root существующими fixture/lifecycle helpers. Не переносить живую authority
из одного мира и не переписывать продуктивные signatures/digests ради удобства.
Если валидный старт конкретного case так получить нельзя, он сохраняет настоящее
индивидуальное setup. Template identity учитывает schema/migration inputs,
SQLite/Node compatibility и параметры fixture. Копируется standalone closed DB,
не просто основной файл рядом с неприменённым WAL. Negative controls: два мира
меняют строки/файлы независимо; испорченный template или changed schema не дают hit.

Не пересчитывать весь payload для каждого cache lookup. Подготовка и проверка
run-owned неизменного материала выполняются один раз, контроль его мутации на
границах family остаётся; production admission каждого реального вызова не обходится.
Не вводить межкоммитный PASS cache под видом кеша подготовленных bytes.

### 9.4. Остановка, платформы и чужая конфигурация

Ownership/drain включает не только зарегистрированные ресурсы, но и удерживаемые
ChildProcess handles, подтверждённые detached launch claims и ещё не завершённый
handoff. Handler Ctrl-C сначала закрывает создание новых children, затем drains
owned процессы через existing helpers; удаление root допустимо лишь после joins.
Cleanup имеет конечный собственный budget, не перезапускается бесконечно новыми
heartbeat. Если отсутствие не доказано — итог interrupted/cleanup_unconfirmed,
root и identities сохранены, есть точная команда/информация для ручной остановки.
Нельзя обещать физическую очистку при недоступном OS inspector или SIGKILL runner;
гарантия здесь — отсутствие ложного clean и recoverable список своих ресурсов.
Не сканировать/убивать все похожие Node/daemon процессы и не менять native settlement.

Целевые fixtures задают свои DD_FLOW/DD_EVAL homes, endpoints и env flags; отсутствие
явного opt-in не наследует пользовательские PUBLIC_* режимы. Environment restore
выполняется после завершения старого body, а не параллельно следующему тесту.
Общие mutable process.env/cwd/mock clocks запрещают concurrent cases.

Offline runs не наследуют боевые provider credentials/адреса и не зависят от сети;
зависимости устанавливаются отдельно, не внутри policy case. Реальные install
smokes используют локальный frozen artifact и изолированный HOME/config, не пакеты
оператора. Учитывать текущие правила npm scripts, не отключать их ради теста.
В platform identity учитывать OS/architecture и Node/SQLite версии. PASS на macOS
не объявляется Linux/Windows qualification. CI shards одной
платформы нельзя смешивать с другой; platform skips задаются точными identities.
Новые обязательные host/tools prerequisites и границы support нельзя скрыто
изменять в задаче оптимизации.

### 9.5. Реалистичная цель и отсутствие цикла с планом094

Самый дорогой system scenario продолжает вызывать production checksum/identity/
storage проверки. Кеширование fixture archive не отменяет этих затрат. Сначала
измерить число и цену вызовов на соответствующем пути; если после сокращения
подготовки доминирует реальный production механизм, описать предел ускорения и
отдельное предложение runtime-оптимизации, а не подменять его в acceptance test.

Для before/after фиксировать Node/SQLite/platform, artifact/canon identities,
fixture shape, внешний load и собственную конкуренцию. Warm/cold режимы одинаковы;
их нельзя смешивать. Надёжное уменьшение числа установок/CLI/scans доказывается
счётчиками; wall speedup утверждается лишь при сопоставимых измерениях. Шумный
результат обозначается неопределённым, не повод бесконечно повторять benchmark.

Этапы B и переключение нового release policy реализовать раздельно: сначала
инвентарь/receipts под существующей policy, затем оптимизация C–F, затем один
новый полный профиль G и активация policy. Не требовать полный новый gate после
каждой промежуточной правки policy scripts и не удваивать финальный gate старым.

095 не должен ждать старого многочасового gate094 как условия начала работы.
При разрешённой реализации зафиксировать reviewed source094 и отдельно сохранённый
test-only delta, создать изолированную dependent task branch без потери исходного
checkout. Итоговая приёмка оптимизации может проверять этот combined frozen source,
но receipt перечисляет оба изменения. Production исправления094 не объявлять
проверенными потому, что их tests перенесены; все незакрытые runtime failures,
включая Droid cleanup observation, остаются явными blockers соответствующей
приёмки. Известную ошибку не исключать из required inventory ради merge095.
Порядок связанных PRs и проверяемый combined source сохраняются в integration
receipt; не требуется предварительно объявить094 полностью зелёным.

### 9.6. Итоговый readiness checklist

| Решение | Состояние после review |
| --- | --- |
| Что сокращаем и что не ослабляем | §§1,4.1,9.2; определено |
| Локальный/CI SSOT и default unknown files | §4.2; определено |
| Partial merge против full release evidence | §9.1; закрыт отсутствовавший контракт |
| Node dynamic inventory и completeness | §9.2; не требует лишнего полного запуска |
| Изоляция cached payload/DB/paths/authority | §9.3; закрыты ограничения shortcut |
| Cancellation/handoff/unknown cleanup | §9.4; сформулирована достижимая гарантия |
| Offline env/platform/tools | §9.4; определено |
| Сохранение assertions при lowering | §9.2; transfer review и targeted negative sensitivity |
| Измерения и предел fixture-only ускорения | §9.5; без недоказанных процентов |
| Порядок rollout,094 blockers и rollback | §§7,9.5; нет круговой зависимости |

Ponytail повторно: все дополнения используют существующие scopes, helpers,
reporters и task receipts. Избыточные новые cache/selection/locking сервисы
по-прежнему исключены. Отдельные субагенты для этого документального review
не использовались: спорные места перепроверены напрямую по source.
Открытых обязательных архитектурных выборов не осталось. Case transfer map,
конкретные file moves и фактические измерения — результаты будущей реализации,
не предположительно выполненная работа. Разрешение на запуск/реализацию по-прежнему
требуется отдельно; сейчас изменён только этот план.
