# 066 План ускорения тестовой проверки FLOW без потери покрытия

Дата: 2026-10-05. Статус: готов к реализации после повторной проверки;
реализация не начата. Фактическое ускорение ещё не измерено.

Цель — уменьшить длительность полной offline приёмки FLOW и дать короткую
проверку для разработки, сохранив все проверяемые свойства. Быстрые тесты не
сокращаем. Не меняем продукт, runtime policy, production budgets, требования
Judge или исторические EVAL. Новый платный E2E этим планом не запускается.

Документ предназначен для реализации в dd-flow-cli и обновления операционных
ранбуков dd-eval. Он не заменяет план 065 и его receipts. Пользователь запросил
план, а не реализацию: текущим действием создаётся только этот документ.

## 1 Основание и ограничения измерений

Исследованный полный интеграционный прогон FLOW: revision
`c3a8b3bdd2a0ee8c384b427cd95a4488fba7d3cc`, beta.125,
`/Users/deksden/Documents/_Projects/_worktrees/dd-plan065-final.b1wTxn/full-integration.log`.
Для реализации исходный checkout повторно сверить: после этого прогона он
изменился, исследованные настройки прочитаны также на `8555768`.

| Факт из журнала | Значение |
|---|---:|
| Интеграционные файлы / случаи | 126 / 2203 |
| Полная длительность | 1185.35 s |
| Время внутри тестов по итогам Vitest | 1150.76 s |
| Случаи менее 100 ms по индивидуальным строкам | 1587, суммарно 21.117 s |
| Случаи от 5 s | 46, суммарно 642 s |
| `run-controller-stages.test.ts` | 32 случая, 398.667 s |
| `run-control-resume.test.ts` | 23 случая, 176.310 s |
| Семь полных controller cycles | суммарно 245.857 s |

2203 — не весь `pnpm test`: отдельно существуют release и runtime-sensitive
gates, а их Node fixtures содержат вложенные тесты. Сумма округлённых строк
тестов отличается от итоговой длительности; wall time и test body time не
смешиваем. Число PASS не является branch coverage или живой приёмкой модели.

По сохранённым длительностям идеальное распределение всех файлов по двум
worker даёт около 575 s, но это не benchmark. Нагрузка, subprocess fan-out,
порядок групп и изоляция увеличивают реальное время. Четыре worker на Mac
не принимаем по такому расчёту. Предыдущий более медленный прогон был на
другой ревизии и не используется как контрольная пара для speedup.

Последовательность введена commit `4fb9872` для изоляции process-global state.
В тестах есть `process.chdir`, env mutation, SQLite caches, mocks и очереди
cleanup. Сохраняем `pool=forks`, `isolate=true`, последовательные случаи
внутри каждого файла. Изоляция между файлами не доказывает их физическую
независимость: filesystem, sockets, homes, PID/PGID и нагрузку проверяем отдельно.

## 2 Принятые решения

1. Использовать установленный Vitest 4.1.7 и стандартные Node APIs. Не добавлять
   зависимости, собственный scheduler, балансировщик shard или базу метрик.
2. Группировать на уровне файлов. Не переписывать быстрые assertions ради
   их числа и не применять `it.concurrent` к существующим process fixtures.
3. Состав групп задать один раз в `dd-flow-cli/vitest.config.ts`: именованные
   проекты и экспортируемые списки выбранных файлов. Package scripts выбирают
   эти проекты, ранбуки не копируют списки. Полная integration — одна команда
   Vitest с последовательными project phases, не shell dispatch framework.
4. Неизвестный новый `.test.ts` автоматически относится к последовательной
   интеграционной группе. Не требовать ручного добавления для попадания в full.
5. Начальный лимит — один worker. Два допускаются только для явно проверенного
   набора файлов после gates ниже. Runtime-sensitive и release остаются serial.
6. Полная локальная цепочка запускает группы последовательно: не складываем
   лимиты отдельных команд и не запускаем одновременно несколько `pnpm test`.
7. Сохранить все четыре harness controller cells, repair и оба overload
   сценария. Удаление или замена полного цикла более узким тестом не входит
   в этот план. Сквозная механика работает с fake provider, не живой моделью.
8. Production clocks, lease expiry, hook deadlines, replay fences и физические
   проверки не ослаблять. Управляемые часы допустимы только внутри тестового
   решения по времени, не как доказательство смерти реального процесса.
9. Ускорение оцениваем по полной цепочке, а не только по выбранной быстрой
   группе. Набор названий/параметров, assertions и платформенных skip сверяем.
10. Во время чужой приёмки не менять её source/config/dist, не запускать
    конкурирующий benchmark и не останавливать чужие процессы. Реализацию
    вести в отдельном checkout либо после завершения текущей приёмки.

## 3 Группы и команды

| Публичная группа | Состав и назначение | Ограничения |
|---|---|---|
| `test:fast` | Небольшие policy/parser/contract проверки для обратной связи | Один worker; без оптимизации существующих быстрых тел |
| `test:core` | CLI, storage, snapshots, lifecycle и остальные интеграции | Serial по умолчанию; отдельная проверенная parallel часть |
| `test:flow` | Controller stage scenarios и полные cycles | Случаи serial; файлы до квалификации serial |
| `test:runtime-sensitive` | Существующие `run-control-worker.test.ts` и `native-adapter-contracts.test.ts` с вложенными Node fixtures | Один worker, guards и teardown сохраняются |
| `test:release` | Существующий `publish-release.test.ts` и `scripts/verify-release-build.test.mjs` | Один worker; проверка сборки/установки не сокращается |

Начальный fast список — ровно эти файлы:

- `test/command-inputs.test.ts`;
- `test/review-result-examples.test.ts`;
- `test/run-settings-preparation.test.ts`;
- `test/codex-capacity.test.ts`;
- `test/codex-hook-delivery.test.ts`;
- `test/control-cli-validation.test.ts`;
- `test/flow-flags.test.ts`;
- `test/delegation-instructions.test.ts`;
- `test/recovery-observation-budget.test.ts`;
- `test/scope-writer-cleanup.test.ts`;
- `test/managed-lease-monitor.test.ts`;
- `test/managed-daemon-late-ack.test.ts`.

Это не утверждение, что все прочие тесты медленные. Остальные дешёвые файлы
оставляем в core: массовая переклассификация не нужна для цели ускорения.
`harness-error-tail.test.ts` оставляем в core: он запускает настоящий child
через импортируемый transport, хотя прямого child_process import в файле нет.
Таким образом отсутствие import не используется как доказательство изоляции.

Начальный flow список — `test/run-controller-stages.test.ts`. Если выполнено
разделение по §6, к нему добавляется `test/run-controller-full-cycle.test.ts`.
Остальные файлы, кроме fast/native/release, входят в core по дополнению.
В core используются `core-serial` и, после квалификации файлов,
`core-parallel`. Пустой parallel проект первоначально не объявляется:
ему не разрешается выдавать зелёную приёмку вместо реального набора.

Имена Vitest projects: `integration-fast`, `integration-core-serial`,
непустой квалифицированный `integration-core-parallel`, `integration-flow`,
`runtime-sensitive` и `release`. Публичные package scripts из таблицы сохраняют
короткие имена. Общий `integration-*` selector обеспечивает попадание
квалифицированного проекта в full без правки всех вызывающих команд.
Wildcard в shell обязательно заключать в кавычки.

Штатный `sequence.groupOrder`: fast = 10, core-serial = 20,
core-parallel = 30, flow = 40, runtime = 50, release = 60. Каждая phase имеет
единый worker count; разные phases выполняются последовательно в одном
runner. Поэтому core serial не перекрывается с core parallel, а лимит не
складывается между projects. Не полагаться на неявное поведение groupOrder=0.
Если split не выполнен, единственный flow файл не получает бесполезный второй
worker. Runtime/release не входят в `integration-*`.

Совместимость команд:

- `pnpm test` остаётся полной цепочкой release → integration → runtime-sensitive.
- `pnpm test:integration` остаётся полным объединением fast + core + flow,
  а не превращается незаметно в более узкий набор: одна команда
  `vitest run --project='integration-*'`. Дополнительные аргументы, включая
  `--shard`, передаются непосредственно Vitest.
- `test:core` — одна команда `vitest run --project='integration-core-*'`;
  последовательность обеспечивает groupOrder, не несколько стартов runner.
  Приёмка принадлежности требует непустоты всех реально объявленных проектов.
- `test:fast`, `test:flow` и `test:core` доступны для локальной адресной проверки.
- Для baseline/диагностики full integration можно принудительно выполнить
  `pnpm test:integration --no-file-parallelism --maxWorkers=1`.
  Одного `--maxWorkers=1` недостаточно: project maxWorkers в Vitest 4.1.7
  имеет приоритет над root/CLI maxWorkers. `--no-file-parallelism` передаётся
  в project overrides и принудительно устанавливает один worker.
  Точные команды после реализации проверяются и записываются в ранбук.

В FLOW `test/test-group-selection.test.ts` добавить один небольшой runnable
контракт конфигурации. Он перечисляет `test/**/*.test.ts` стандартным Node API,
проверяет существование всех явных entries, отсутствие пересечений, принадлежность
каждого файла ровно одной группе и попадание нового неизвестного пути в core-serial.
Проверка использует экспортированную конфигурацию, не второй независимый список.
Сам файл этой проверки входит в core-serial. Node release-build tests отдельно
сверяются с явной release командой; их нельзя потерять при Vitest группировке.
При переходе на projects common scalar options задаются один раз и явно
передаются inline projects: pool=forks, isolate=true, testTimeout=120000,
последовательные cases. Reporters остаются глобальными. Include/exclude
задаются для каждого проекта явно из SSOT; не наследовать broad root include
через `extends:true`, где merge массивов может добавить чужие файлы.
Core-serial — общий test glob минус явные группы; новые файлы попадают туда.
Проверить actual discovery командой `vitest list --filesOnly --json`, сравнив
абсолютные пути после нормализации с файловым inventory: не ограничиваться
проверкой функции классификации. Список case names брать из выполненных
отчётов, не исполнять top-level fixture setup ради предварительного list.

В full/acceptance запрещены `.only`, changed/name/file filters, `retry>0`,
`bail>0`, snapshot update и игнорирование unhandled errors. Адресные проверки
разрешены в development, но не создают full receipt. В дочернем окружении
приёмки убрать `VITEST_MAX_WORKERS`: Vitest читает его после разрешения
fileParallelism, и унаследованное значение может сломать даже serial режим.
Не менять глобальное окружение пользователя и не печатать его содержимое.

## 4 Квалификация параллельного исполнения

Кандидаты первой волны, а не автоматически одобренный parallel список:

- `run-cli.test.ts`, `eval-snapshots.test.ts`, `run-controller.test.ts`;
- `lifecycle-invocations.test.ts`, `vnext-protocolize.test.ts`;
- `run-control-resume.test.ts` и flow stage scenarios.

Для каждого проверить все вызываемые helpers и children, а не только импорты:
уникальные root/home/resource/recovery/provider directories; socket/port/path
изоляцию; чтение общего `dist` без записи; отсутствие настоящих provider homes
и auth; отсутствие общей изменяемой tool/cache директории; точные PID/birth
и scope cleanup. Два homes с намеренно общим resource registry внутри одного
сценария остаются одним сценарием, не разделяются по worker.

В fixtures передавать собственное окружение, не изменять settings операторских
homes. Cleanup не может сигналить процессам соседней фикстуры. Если выявлен
общий изменяемый ресурс, оставить файл serial или исправить fixture root;
не блокировать все тесты новым глобальным lock и не смягчать custody assertions.

Vitest parallelism включать только между файлами разрешённого проекта:
`fileParallelism=true`, `maxWorkers=2`, `pool=forks`, `isolate=true`.
Serial проект получает `fileParallelism=false`, `maxWorkers=1`. У full команды
не должно быть безусловного CLI `--no-file-parallelism`, перекрывающего выбранную
политику; serial fallback задаётся явно. Группы/команды не перекрываются по времени.

Гейты promotion:

1. Один frozen source/build/canon, одинаковые варианты тестов. Никаких retries,
   скрытого удаления failed runs или timeout increases для получения PASS.
2. После прогрева выполнить по две сравнительные пары 1/2 worker, меняя порядок
   режимов. Записать wall time, file/case durations, exit status, skips,
   unhandled errors и cleanup failures. Основной режим не запускать одновременно
   с benchmark. Каждый прогон имеет новую чистую область fixtures.
   Сравнивать режимы на одной итоговой ревизии; старый журнал 2203 tests —
   исходный ориентир, не denominator для доказательства parallel speedup.
   Прогрев нужен для каждого режима. Состояние штатного Vitest cache,
   cold/warm dist, версии Node/pnpm и load фиксируются; чужой cache не удалять.
3. Выполнить дополнительные targeted проверки isolation при двух файлах:
   сохранившийся чужой/неизвестный PID не удаляется; teardown не захватывает
   fixtures следующего случая; все собственные подтверждённые children joined.
   Не делать глобальный kill. Проверять принадлежность, не требовать нулевого
   числа всех процессов Node на машине.
4. Новых failures, unexpected skips, retained uncertain roots или живых
   owned descendants нет; существующие ожидаемые retained diagnostics остаются
   ожидаемыми и проверяются отдельно. Forced serial full также PASS.
5. Median полной проверки с двумя worker лучше serial хотя бы на 10%, иначе
   parallel не становится default. Это порог принятия решения, не обещание
   speedup. При противоречивых результатах расширить измерение, не выбирать
   только удачный прогон. При нестабильности оставить serial и записать причину.

На локальном Mac больше двух worker не вводим. В CI сохраняем четыре отдельные
VM/shard, по одному worker на runner в этой доработке: не перемножаем четыре
VM на два process suites без отдельной квалификации. Откат режима — config
worker count/файл возвращается в serial; покрытие не отключается.
Если parallel не прошёл квалификацию или не дал полезного ускорения,
доработка может завершиться serial default с ускоренными policy waits:
обязателен отчёт о проверке и отказе от parallel, а не фиктивный PASS двух worker.

## 5 Детерминированное ожидание в recovery cleanup tests

Исходные места: `test/run-control-resume.test.ts`, `fixture().close()` и
`expectUnlaunchedIntentRootRetained()`. Дорогие случаи: intent-only stop,
stop-before-ack, stop-after-ack. Сейчас они ждут настоящего истечения
`RENEWAL_POLICY.budgetMs` внутри test cleanup, затем проверяют сохранённую область.

Решение — использовать существующий ObservationClock и узкую test-only
инъекцию его wall/monotonic clock в cleanup helper. Default путь использует
настоящие часы. Никаких изменений runtime implementation или RENEWAL_POLICY.
Обнаруженная в том же файле подмена `ObservationClock.prototype.sample`
в двух случаях `retains unknown ... evidence` заменяется этой же локальной
инъекцией: нельзя менять часы других экземпляров, включая runtime observer.

Порядок реализации:

1. Сохранить настоящие clients, CLI, ACK/barrier races и no-replay assertions.
2. Закрыть test admission, дождаться всех admitted clients; физическое закрытие
   и birth/ownership доказать на настоящих процессах. Не ускорять этот этап.
3. После фактической retirement и наблюдения ожидаемого pending-intent состояния
   разрешить продвижение только локальных cleanup часов. Статус unknown не
   становится absence, а root не удаляется. Не подменять глобальные Date,
   performance или timers пока работают реальные children.
   Для двух synthetic unknown-evidence случаев clock может исчерпать только
   диагностическое ожидание после закрытия подтверждённых реальных children.
   Неподтверждённая allocation сохраняется unknown и root остаётся на диске;
   отдельное точное synthetic retirement не считается physical absence proof.
   Если initial cleanup проходит полностью, локальное ускорение не включается.
4. Продвинуть время последовательными samples меньше gap threshold, чтобы
   истечение budget не превратилось в observation-gap recovery. Проверить
   состояние непосредственно до/на/после границы и повторный progress cursor.
   Wall, monotonic и передаваемый в sample progressAt берутся из одного
   test-local источника; смесь fake wall с реальным Date.now запрещена.
   Только ожидаемое policy ожидание получает управляемый шаг вместо delay;
   проверки реального дерева процессов и ожидания его закрытия остаются real-time.
5. В трёх исходных сценариях сохранить проверки database receipts, guard,
   no-launch/no-replay, stopped-owned bindings и существования diagnostics.
6. Оставить один standalone real-clock cleanup smoke с коротким test-only
   окном, без детей/authority production waits. Цель — проверить, что timer loop
   реально просыпается, а не точную latency ОС. Default production-sized
   budget остаётся в остальных обычных process-cleanup сценариях.

Инъекция принадлежит одному вызову close конкретной fixture, включая
expectUnlaunchedIntentRootRetained, не prototype и не всему файлу. При переходе
от real к controlled clock использовать тот же Observer: сохранить cursor,
elapsed и progress timestamp; clock не должен прыгнуть назад или создать gap.
Проверить delayed/duplicate cursor, progress непосредственно перед границей,
настоящий gap и exception при physical stop: все сохраняют прежнее поведение.
После expected retention убрать только точный callback из cleanup очереди,
закрыть DB handles и не вызывать close повторно с закрытой базой.

Принимать изменение только если тела этих трёх случаев больше не тратят
каждое около 30 s на ожидаемый timeout. Физические процессы не заменяются mocks;
неизвестные maintenance children по-прежнему блокируют удаление root.

## 6 Разделение самого тяжёлого файла

Решение условное, с конкретным триггером: после §4–5 разделить файл, если его
median остаётся не менее 25% wall time полной integration проверки или он
определяет хвост самого долгого CI shard. Иначе оставить файл и записать
измерение, по которому дополнительная структура не нужна.
Доминирование в shard — основание для bounded split experiment, не гарантия
ускорения. Разделение сохраняется, если итоговое измерение подтверждает пользу
локальному full или CI critical path без ухудшения стабильности; иначе вернуть
только собственный экспериментальный перенос и оставить исходные cases.

При срабатывании триггера:

- В `test/run-controller-full-cycle.test.ts` перенести пять seven-stage cells
  (четыре harness + Luna repair) и два multi-child overload cases без изменения
  названий, параметров или assertions.
- Routing, two-stage, HITL, capture/error и cleanup regressions оставить в
  `run-controller-stages.test.ts`.
- Общий setup/drain helper вынести только в
  `test/fixtures/controller-stage-fixture.ts`, поскольку теперь есть два
  реальных потребителя. Helper не регистрирует tests/hooks при импорте.
- Cleanup collection принадлежит конкретному test file и передаётся helper
  явно; root/state/resource paths остаются уникальными для каждого случая.
- Переиспользовать `controller-stage-adapter.mjs`, не клонировать сценарный
  адаптер и не создавать общую mutable database для ускорения setup.
- Оба файла проходят membership gate и повторную qualification в двух-worker
  flow проекте. `it.concurrent` по-прежнему не используется.

Не распиливать сразу все большие файлы и не менять legacy test names ради
красоты. Shared setup fixture не превращать в универсальную lifecycle фабрику.

## 7 CI и измеримость

Обновить `.github/workflows/npm-publish.yml`, чтобы integration gate выполнял
точное объединение fast/core/flow, а native и release gates остались обязательными.
Сохранять четыре штатных shard, immutable candidate dist и существующий механизм
candidate accept/publish. No shared dist rebuild во время проверок.

CLI `--shard` нельзя передать составному `pnpm test:integration` как будто это
одна Vitest команда, поэтому составной вариант исключён решением §3.
В CI сохранить вызов через package script:
`pnpm test:integration --shard=N/4 --no-file-parallelism --maxWorkers=1`.
Он выбирает `integration-*`, а не отдельный shard каждой группы. Исключить
`VITEST_MAX_WORKERS` из среды job. Сверить union manifests всех shard с unsharded
integration: каждый файл ровно один раз, без native/release.
Отчёты получают уникальные имена по run/attempt/group/mode/shard;
`passWithNoTests` не включать. У нынешнего набора больше четырёх файлов, поэтому
пустой shard — failure, не EMPTY PASS. Если когда-либо набор станет меньше числа
shard, потребуется явное изменение CI matrix, не маскировка пустого результата.

`vitest list --filesOnly --json` в 4.1.7 перечисляет discovery и не вызывает
sequencer.shard: добавление `--shard` к list не доказывает partition. Сравнивать
список с JSON результатами четырёх реально выполненных shard. Нормализовать
checkout-specific абсолютные пути до project-relative; дубли считать по
(project, file) в discovery, а также требовать единственный project для каждого
file. JSON run results Vitest 4.1.7 содержат file path, но не projectName:
project восстанавливается из уже проверенного singleton discovery mapping,
его нельзя выдумывать из отсутствующего поля reporter.
Shard с collection/startup error не имеет полного manifest и не принимается.
Минимальный механизм сверки — `scripts/verify-test-inventory.mjs`, стандартный
Node, без scheduler. Он принимает discovery manifest и один или четыре JSON
results с сохранённым exit code каждого runner, проверяет exact file union,
completed statuses и unexpected skips. Его negative cases (пропуск, дубль,
чужой discovery project, неполный отчёт, fail/skip и success=true при nonzero
exit code) включаются в тот же `test-group-selection.test.ts`.
JSON schema берётся из установленного reporter, не угадывается: fixture
результата штатного небольшого теста проверяется до подключения checker к CI.
Missing/malformed reports и collection failure не превращать в ноль tests.
У штатного JSON reporter поле success не учитывает unhandled errors; отсутствие
failures в JSON недостаточно. Сохранить runner exit code отдельно в
`exit-code.txt` в той же уникальной области, принять только zero плюс полный
JSON; stdout/stderr сохраняют объяснение runtime/unhandled failure. Missing
exit receipt также проваливает проверку. Wrapper и CI step возвращают исходный
код после сохранения diagnostics, не код последней upload/printf команды.
Новых проблем detector процессов или репортинга продукта этим не создаём.
Сохранить четыре report artifacts и сверить union до candidate acceptance;
использовать существующий выбранный artifact/cache transport с уникальными
ключами, не добавлять второй обязательный канал при cache fallback.
Upload diagnostics выполняется и при failure, но его успех не заменяет suite
exit code. Отсутствие обязательного отчёта — NOT RUN/failed acceptance.

Отдельно исправить порядок CI prepare: typecheck/lint → build → test:release
→ pack. Сейчас test:release стоит до build, хотя
`scripts/verify-release-build.test.mjs` сравнивает source с `dist` и копирует
именно built bytes во временную install fixture. На чистом checkout `dist`
игнорируется Git и ещё не создан. Это реальная предпосылка failure, а не
необходимость увеличить timeout. Сборка одна, metadata/canon freeze сохраняются;
release fixture не пересобирает общую source tree.

Существующий Vitest shard использует hash имени и число файлов, не durations.
Имеющееся распределение по локальному журналу даёт приблизительно 291/238/152/471 s.
После изменения границ файлов перерасчитать перекос; свой sequencer не писать.

Добавить JSON reporter рядом с verbose только для acceptance/benchmark, не
усложнять обычный короткий запуск. Для wrapped Node fixtures сохранять полный
отчёт дочернего runner в acceptance artifacts с именем fixture и exit/signal;
не терять primary/secondary cleanup failures. Если нужны individual durations,
использовать штатный Node reporter, сохранив существующий wrapper exit check.
Не печатать provider tokens, полный env и prompts. Raw captures остаются в
уже принятой защищённой области diagnostics, а не публичной CI сводке.

Для acceptance используется одна опциональная переменная
`DD_FLOW_TEST_REPORT_DIR`, указывающая уникальную область отчётов вне tracked
source. Без неё обычный wrapper остаётся прежним. Native wrappers направляют
штатный Node TAP reporter в отдельный файл через reporter destination; не
полагаются на бесконечный spawnSync buffer. Сохранить exit/error/signal check
и полезный tail в failed assertion. Ошибка создания обязательного отчёта
проваливает acceptance. Shell piping не теряет exit status (pipefail или
штатный outputFile); не вводить auto-retry и новый reporter/parser framework.
Report transport и изменённый build порядок проверить существующим
`publish-release.test.ts`, дополнив его semantic assertions: все required suite
receipts обязательны, восстановление cache fails closed, publish не начинается
без union. Не ослаблять эти свойства ради прежнего буквального числа строк YAML.

## 8 Обновления документации и ранбуков

Операционный SSOT — новый `dd-eval/runbooks/flow-test-suite-verification.md`.
В нём после реализации должны быть проверенные команды, а не обещанные примеры:

1. Development: fast плюс связанные core/flow/native tests; зависимости от
   fixtures, schema, canon, build assets нельзя определять только по Git path.
   Changed-file mode Vitest — подсказка, не release acceptance.
2. Full acceptance: typecheck/lint, затем build единственного frozen candidate,
   затем все release/integration/native gates. Для cross-repository acceptance
   указать `DD_FLOW_SOURCE_ROOT` и существующие built CLI/adapter fixture targets.
   Missing required target/skip = NOT RUN, не PASS.
   Release-build contract tests сравнивают и устанавливают во временную область
   уже собранные bytes; build обязателен перед ними также на чистом CI checkout.
   Integration/native проверяют этот же candidate без rebuild между группами;
   итоговый byte digest неизменен. Проверить отсутствие source/dist mutation
   тестами и сохранение immutable candidate accept/publish gate.
3. Команды serial fallback, принятые worker limits и запрет нескольких
   одновременных локальных suite/benchmark на одном checkout.
4. Scope: test workers ≠ native children; fake controller cycle ≠ live E2E;
   integration count ≠ весь набор. Отдельно показывать skips и nested fixtures.
5. Benchmark recipe: freeze hashes, warmup, чередование 1/2 worker, одинаковые
   reports/inputs, состояние load и проверка exact owned cleanup после run.
   Объяснить inherit env override, запрет concurrent cases и effective worker
   limits. Прогрев/measurement — локальная offline процедура, не автоматическое
   удвоение каждой обычной приёмки.
6. Failure: дать runner завершить оставшиеся cases и штатный teardown;
   при timeout остановить только точно принадлежащий зависший run, сохранить
   primary и cleanup evidence. Не закрывать пользовательские приложения, не restart
   EVAL, не удалять uncertain roots, не retry автоматически ради зелёного.
7. Добавление теста: default core-serial; promotion требует проверенной изоляции.
   Длинный wall wait допускается при физическом свойстве, policy clock проверяют
   детерминированно. Existing native/signal/authority boundaries не обнуляются.

Обновить также:

- `dd-flow-cli/README.md`, раздел Verification: новые команды и build-before-test,
  ссылка на операционный SSOT без второго списка файлов; короткое объяснение
  full/dev и serial/qualified parallel режимов.
- `dd-eval/README.md`: ссылка на ранбук и корректная paired offline acceptance.
- `dd-eval/runbooks/plan065-runtime-progress-acceptance.md`: только ссылка на
  общую offline процедуру, не переписывать historical PASS/NOT RUN receipts.
- `dd-eval/runbooks/beta-contour.md`: full gate перед promotion и разделение
  offline suites, installed acceptance и отдельно разрешённого live E2E.

Исторические планы/журналы, case definitions и release receipts не обновлять
новыми длительностями. Документация не объявляет parallel accepted раньше gate.

## 9 Порядок реализации и критерии завершения

| Шаг | Изменение | Проверка завершения |
|---|---|---|
| P01 | Freeze source/build и inventory верхних/вложенных cases, baseline timings | Нет конкурирующей приёмки; полный baseline scope и actual revision записаны |
| P02 | Vitest группы, package commands, membership regression | Каждый файл ровно один раз; legacy integration/full scope сохранён; serial PASS |
| P03 | Audit roots/owners и qualification двух worker | Сравнительные пары и isolation PASS; решение default/fallback с receipts |
| P04 | Test-only cleanup clocks, реальные process barriers сохраняются | Три costly cases ускорены; boundary/progress/retention assertions PASS |
| P05 | Измерить critical tail, при выполнении триггера разделить stage file | Все семь полных cycles сохранены, case mapping и cleanup PASS |
| P06 | CI build-before-release, shard union и machine-readable reports | Чистый checkout имеет свежий dist; actual reports совпадают с discovery; нет скрытого empty/skip, pinned candidate и native gate сохранены |
| P07 | Все README/runbook updates из §8 | Каждая команда проверена; списки не размножены; full/dev/live различены |
| P08 | Итоговая serial и выбранная optimized full acceptance | Typecheck/lint/build и все gates PASS; нет новых skips/ошибок/owned leaks; порог speedup перепроверен на итоговой ревизии после clock/split изменений |

Для каждого переноса или разбиения записать old case → new case и сохранённое
проверяемое свойство. Test counts могут вырасти из-за membership/clock regression;
нельзя удерживать число 2203 ценой удаления проверки. Parametrized rows,
platform-dependent skip и nested Node cases должны остаться объяснимыми.
Сравнение case sets использует project-relative file и полный parametrized
test name с учётом multiplicity; одинаковые имена не схлопываются в Set.
Baseline platform skips фиксируются явно и сравниваются на той же платформе.
Mandatory paired acceptance не может пройти при skip из-за отсутствующего
DD_FLOW_SOURCE_ROOT, CLI или adapter target. На Mac нельзя объявлять PASS
непроверенного Linux CI path: локальный all-four-shards serial check возможен,
но настоящий GitHub result отдельно PASS либо NOT RUN.

P03 до P04 — предварительная qualification, не повод повторять несколько
полных benchmark после каждого маленького edit. Финальные два warm режима и
две пары на одной итоговой ревизии закрывают P08; прежние неизменившиеся gates
и артефакты можно переиспользовать только при совпадении source/build tuple.
Если clock/split изменили tuple, их старые timings не являются итоговой приёмкой.

Итоговый отчёт сохранять рядом со спецификацией как
`specs/066-implementation-report.md`: revisions, команды, группы/case mapping,
serial/optimized timings, все failed/retained attempts, accepted worker mode,
решение по split trigger, cleanup evidence и необходимые NOT RUN. Нельзя
назвать план выполненным, скрыв неуспешный mandatory gate.

Реализация включает normal commits/push только при отдельном поручении на
реализацию и согласно Git runbook. Runtime release, переустановка глобальных
hooks и новые E2E не нужны для изменения тестовой инфраструктуры; разрешение
на них из этого документа не выводится.

## 10 Проверка ponytail

Применён full: сохраняем существующий Vitest/Node, fork isolation, clocks,
release pipeline и все meaningful scenarios. Один источник групп и один
membership regression вместо новой системы тестов. Fast tests не оптимизируем.
Два worker принимаются по измерению, не по числу CPU. Split — только по
объективному trigger, helper — только для двух возникших потребителей.

Не включены массовые test renames, custom shard scheduling, новые dependencies,
общая mutable fixture DB, blanket fake timers, повышение production deadlines,
удаление harness matrix и автоматический live E2E. Эти ограничения являются
решениями реализации, а не незавершёнными пунктами текущего плана.

## 11 Дополнения после проверки готовности

Проверка выполнена по FLOW `855576800c5b08bfd2135ad62459c234543c0558`,
установленному Vitest 4.1.7, package scripts, publish workflow и исходным
cleanup/native/release fixtures. Тесты или CI в ходе этой проверки не запускались;
проверен CLI help, реализация scheduler/config/discovery и исходные вызовы.

Уточнения, обязательные для реализации:

- Одна integration команда вместо shell chain; штатные groupOrder и селекторы
  сохраняют последовательность phases, передачу shard и предел worker.
- Serial override учитывает project precedence и VITEST_MAX_WORKERS;
  common options не наследуют чужие include через merge массивов.
- Membership проверяется по actual discovery и actual run reports; list с
  shard не считается доказательством partition. Empty или malformed report
  не маскируется в PASS. Recovery уже принятых release не меняется.
- Release contract требует dist, поэтому CI build переносится перед ним;
  source/canon freeze и единственная сборка candidate сохраняются.
- Controlled clock не сбрасывает прогресс; synthetic uncertainty сохраняется;
  глобальная prototype подмена заменяется локальным test seam.
- Full reports переживают failure, child TAP не упирается в buffer, checker
  имеет собственные negative cases; retry/bail/only/filter не сужают full.
  JSON success отдельно не считается PASS: runner exit code обязателен,
  project identity сверяется через actual discovery mapping.
- Benchmark не смешивает разные source tuples и cache states; split и два
  worker остаются решениями по измерению, а не обязательной новой архитектурой.

Структурных blockers для начала реализации после этих уточнений не осталось.
Ещё не установленные факты — безопасный parallel allowlist, фактический speedup
и необходимость split — намеренно закрываются измерительными gates, не
объявляются заранее доказанными. Результаты плана 065 и live E2E не подменяются
приёмкой этой тестовой доработки.
