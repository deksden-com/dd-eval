# 045 — Неизменяемый release candidate и многоуровневый release gate

Дата: 2026-09-21. Статус: реализовано и проверено локально; первый production
release по новой схеме остаётся отдельным операционным подтверждением.

## Цель и границы

Сократить время до надёжного релиза, не снижая необходимых проверок. Один раз
собрать кандидат, проверить его и публиковать те же байты. Не запускать полный
suite повторно только из-за сбоя публикации. Быстрые ошибки обнаруживать раньше,
изолированные интеграционные проверки выполнять параллельно.

Основная реализация — в `dd-flow-cli`; этот документ и операционные инструкции
подготовки EVAL — в `dd-eval`. Текущий CP-127 и его установленный engine не менять.
Работа над pipeline не требует остановки, перезапуска или модификации живого EVAL.

Применён ponytail: существующие validators и CI artifacts вместо нового сервиса
доказательств; штатный test runner вместо собственного scheduler; сначала полный
suite, затем измерения. Selector по изменениям — условный следующий этап, не
скрытое условие готовности первой версии.

## Подтверждённое исходное состояние

- `.github/workflows/npm-publish.yml`: один publish job; права contents/write и
  id-token/write выданы на весь workflow; режимы release/recovery вызывают одну команду.
- `scripts/publish-release.mjs`: для ещё не опубликованной версии последовательно
  выполняет typecheck, lint, build, test, затем Changesets publish. Повторной сборки
  после тестов в этом пути уже нет — это свойство сохранить.
- Receipt в `.tasks/release-<version>.json` содержит tuple и фазы, но не связывает
  PASS с заранее зафиксированным tarball и не является самостоятельным CI admission.
- Существующая версия в npm пропускает suite; readback проверяет build-info, но
  не равенство байтов с предварительно проверенным кандидатом.
- `package.json`: альтернативный `release` выполняет build + Changesets publish;
  `prepublishOnly` проверяет build-info относительно текущего Git checkout.
- `pnpm test`: Vitest forks с `--no-file-parallelism`. Есть смешанные source/dist
  тесты и subprocess integration; общий dist нельзя пересобирать во время тестов.
- `retryReadback` повторяет практически любые не-authorization ошибки бесконечно.
- Release lock локален checkout и не сериализует отдельные CI runners.
- Runtime dependencies заданы диапазонами; один tarball не фиксирует будущую
  установленную транзитивную dependency tree.

## Обязательные инварианты

1. Публикуется точный проверенный `.tgz`, без rebuild, repack и изменения файлов.
2. Failed, cancelled, missing или skipped обязательный suite не даёт PASS.
3. Receipt принимается только из доверенного CI-контекста, не на основании поля
   `passed` в предоставленном JSON. PR/fork artifacts не получают publish authority.
4. Публикационные credentials доступны только publish job. Тесты их не получают.
5. Неизвестное влияние изменений и изменения общих runtime-механизмов требуют
   полного suite. Canon/prompts считаются поведением, если не доказано обратное.
6. Потеря ответа публикации означает неизвестный результат: сначала readback.
   Чужие байты под занятой версией — конфликт, не permission на overwrite/retry.
7. Старое восстановление не откатывает beta-tag и не перемещает существующий git tag.
8. Исторические receipts и failed attempts сохраняются. Нет ручного редактирования
   evidence для обхода admission.

## Целевой путь

Фиксированные CLI/canon revisions → быстрые проверки → одна сборка → один tarball
→ integration + установка tarball/smoke → агрегированный PASS → публикация tarball
→ readback байтов/provenance → consumer smoke → release complete.

Начать с одного workflow и нескольких jobs. Отдельный небольшой recovery entry
допускается только для загрузки конкретного ранее проверенного artifact. Не строить
универсальную машину состояний релизов: достаточно явных фаз существующего receipt.

## P0. Инвентаризация и измерения

- Снять длительности suites/jobs из уже завершённых CI запусков; не запускать ещё
  один полный локальный suite только ради оценки времени.
- Найти все callers `publishRelease`, `verifyReleaseBuild`, `retryReadback`, все
  npm/Changesets publish entrypoints и инструкции релиза, включая внешние runbooks.
- Составить фактический список тестов: pure/contract, runtime integration,
  package smoke, смешанные. Проверить скрытые imports dist/assets и общие fixtures.
- Для integration отметить homes, resource registry, cwd, env, порты/сокеты,
  subprocess ownership, global installs и возможные записи в source/dist.
- Зафиксировать baseline wall-clock и runner-minutes, время до первой ошибки,
  наиболее медленные файлы. Не обещать ускорение до замеров.

Готово, когда есть полное распределение тестов и перечень препятствий изоляции;
название файла не используется как доказательство того, что тест является unit.

## P1. Единый контракт кандидата и минимальный рефакторинг

Изменяемые файлы: `scripts/publish-release.mjs`,
`scripts/verify-release-build.mjs`, `package.json`, `test/publish-release.test.ts`,
`scripts/verify-release-build.test.mjs`.

- Разделить текущий orchestration на подготовку/проверку кандидата и публикацию
  принятого кандидата. При необходимости добавить один `scripts/release-candidate.mjs`.
  Не вводить классы, plugin API, backend cache или абстрактный pipeline framework.
- Переиспользовать `verifyPublishedTuple`, `verifyConsumer`, существующий build-info
  validator. Общие проверки должны иметь одного владельца, без копий в workflow.
- Commit/tree покрывают scripts/tests/fixtures/lockfile: не создавать отдельный
  hash каждого tracked файла ради дублирования Git identity.
- Версионированный candidate manifest содержит CLI commit/tree, canon commit/tree,
  package name/version/channel, tarball filename/digest, фактические Node/package
  manager/platform/tool versions и dependency evidence, CI run/attempt/workflow
  identity, обязательный набор suites и ссылки на результаты.
- Итоговый receipt формируется только после проверки всех обязательных результатов.
  Ожидаемый набор определяется доверенной policy, не списком из чужого artifact.
- Явно различать tarball digest, npm integrity и engine snapshot digest.
  Значения вычисляют инструменты; operator/model не переписывает их вручную.
- `release` и `release:publish` привести к единому guarded пути. Changesets оставить
  для версии/changelog; документировать поддерживаемый manual путь, не оставлять
  альтернативный script, обходящий receipt admission.
- Переработать prepublish validation для готового архива: отсутствие `.git` внутри
  unpacked package нормально; source identity проверяется на стадии кандидата,
  публикация проверяет trusted receipt и bytes. Не просто удалять guard.

Готово: один набор validators используется обычной публикацией и recovery;
невалидный manifest, tuple или digest отклоняется до внешней мутации.

## P2. Один build, пакет и проверка до публикации

- После frozen install и быстрых проверок один раз собрать dist со strict canon.
- Упаковать `.tgz` один раз. Проверить name/version/build-info и допустимый состав
  архива. Исключить попадание runtime state, credentials и случайных local files.
- Integration использует именно этот неизменяемый build. Сверить его содержимое
  до/после suite; тестовые мутации не должны попасть в принимаемый кандидат.
- Установить tarball в временный consumer prefix, вне checkout; использовать
  отдельные config/resource/runtime homes. Consumer не должен случайно брать src,
  local dist или dependencies исходного репозитория.
- Проверить entrypoints, packaged schemas/assets, version, engine install/resolve,
  compatibility и небольшой детерминированный lifecycle без живой модели.
- Переиспользовать existing smoke checks; не запускать второй полный integration
  suite на установленном пакете. Включить минимальные package-only регрессии.
- Зафиксировать фактическую dependency tree/lock consumer и engine snapshot digest.
  Package lock кандидата не делает диапазоны зависимостей npm-пакета фиксированными.
  Новая установка с иной tree не наследует старый consumer PASS автоматически.
- Сохранять tarball, manifest, suite results и receipt стандартными CI artifacts.
  Не использовать dependency cache как доверенное хранилище результатов проверки.

Готово: installation smoke обнаруживает отсутствующий packaged asset до publish;
изменение архива после проверки обнаруживается digest admission.

## P3. Publish и безопасное восстановление

Изменяемые файлы: `.github/workflows/npm-publish.yml`, `scripts/publish-release.mjs`,
release tests и найденные в P0 runbooks.

- Publish job загружает artifact по точным run/attempt/artifact identity и проверяет
  его trusted origin, обязательные результаты и digest. Не использовать «последний
  зелёный artifact», имя artifact или поле commit как единственное доказательство.
- Публиковать архив без build/test/repack. Перед внешним эффектом повторно проверить
  разрешённый version/channel и отсутствие конфликта в registry.
- После публикации скачать registry tarball и сравнить с исходным кандидатом;
  build-info совпадения недостаточно. Проверить registry integrity и exact tuple.
- Git tag создаётся на проверенный commit, существующий tag только проверяется.
- Сериализация канала средствами CI, без отмены уже идущего publish job.
  Не полагаться на локальный file lock между runners. Проверка состояния канала
  должна явно отклонять устаревший promotion/recovery, а не считать очередь FIFO.
- Продвижение beta сделать явным действием принятого релиза. Зафиксировать порядок
  publish/smoke/promotion/tag и поведение при сбое между ними в runbook; отсутствие
  атомарности npm и Git не маскировать статусом complete.
- Повтор после потери publish-ответа: сначала проверить наличие версии и bytes.
  Exact match позволяет продолжить незавершённые post-publish проверки; mismatch
  останавливает работу; доказанное отсутствие допускает публикацию того же архива.
- Вынести классификацию readback ошибок: временная сеть/registry visibility может
  ожидаться с backoff без произвольного короткого дедлайна; authentication,
  malformed response, identity mismatch — терминальные ошибки. Сохранять последнюю
  причину, фазу и время; operator cancellation и job interruption остаются доступны.
- Повторные чтения не равны повтору side effects. Не повторять publish вслепую.
- Post-publish consumer smoke выполняется в изолированном prefix. Проверку global
  install, если она нужна как контракт, проводить с отдельным временным npm prefix,
  не менять пользовательскую глобальную установку в ходе квалификации.

Готово: recovery того же принятого кандидата не вызывает сборку/full suite;
чужая версия, stale channel и потеря trusted artifact завершаются явной диагностикой.
Если artifact утрачен, требуется новая проверка кандидата, а не реконструкция PASS.

## P4. Слои и ранние ошибки

Изменяемые файлы: `package.json`, `vitest.config.ts`, выбранные файлы `test/`.

- Быстрый слой: typecheck, lint, pure/contract/release-policy tests.
- Runtime слой после build: SQL, controller, native hooks, lifecycle/recovery,
  process ownership, Work graph и stage workflows.
- Package smoke до publish; published smoke после — разные гарантии, не дубликаты.
- Разделять смешанные test files только когда это сокращает критический путь или
  устраняет shared state. Не переносить весь suite в новую структуру ради порядка.
- Сохранить простую команду полного локального прогона; локальная разработка может
  запускать affected suites, но не подменяет release acceptance.
- Использовать существующий Vitest; никаких новых тестовых frameworks.

Готово: ошибка быстрого контракта обнаруживается до тяжёлого integration, при этом
полный release gate сохраняет прежнее покрытие.

## P5. Проверенная параллельность

- Начать с небольшого числа integration shards на разных CI runners, а не с
  удаления `--no-file-parallelism` на общем checkout.
- Использовать штатные возможности установленной версии test runner. Конкретный
  способ передачи build и shard arguments проверить до включения в workflow.
- В каждом shard использовать один и тот же candidate build и frozen dependencies;
  не пересобирать provenance с новым timestamp на каждом runner.
- Уникальные test homes/cwd/sockets/порты; cleanup только собственных процессов.
  Ни один тест не должен обращаться к домашнему пользовательскому runtime.
- Специальные последовательные группы создавать только для доказанной необходимости.
  Не вводить одновременно ручную тематическую карту shards и вторую карту selector.
- Проверить, что объединение shards равно полному inventory, нет пропущенных или
  непреднамеренно повторённых тестов. Новый нераспределённый файл — ошибка policy.
- Сравнить serial и sharded результаты на одном frozen кандидате; повторить сценарии
  чувствительности к порядку/конкуренции. Forced-failure test должен блокировать
  aggregate PASS даже если остальные shards успешны.
- Измерить wall-clock, runner-minutes и нестабильность. Число shards подбирать по
  данным; больше runners не является самостоятельной целью.

Готово: эквивалентное покрытие, отсутствие новых shared-state failures и измеримый
выигрыш времени. До этого file-parallelism внутри shard остаётся выключенным.

## P6. Условный deterministic affected selector

Не входит в минимальную первую поставку. Решение о реализации принимается после
P5 по оставшейся длительности и стоимости; при отсрочке записать замеры и причину.

- Начать с небольшой versioned path→suite policy, не статического анализатора
  произвольного import graph. Решение принимает код; модель не выбирает tests.
- Diff вычислять относительно точной принятой базы, включая CLI и canon. Учитывать
  удаления/переименования; неизвестная база/путь/impact означает полный suite.
- Общие storage/migrations, lifecycle/hooks/controller, argv/path resolution,
  recovery/process/resource ownership, shared test fixtures, dependency lock,
  build/release policy требуют полного suite.
- Stage-specific prompts/canon требуют связанных behavioral contracts/integration;
  общий runtime contract или недоказанная область влияния требуют полного suite.
- Pure documentation allowlist допускается только вне исполняемых prompts/canon.
- Обязательный быстрый слой и package smoke не отключаются selector-ом.
- Сохранять выбранные suites и причины. Нельзя разрешать публикацию старым receipt
  после изменения самого selector или доверенной release policy.
- Сначала shadow mode: полный suite всё равно выполняется, выбор сравнивается с
  результатами. Наблюдённое отсутствие промахов не доказывает полноту навсегда:
  сохраняются full fallback и явные запреты для рискованных подсистем.
- Ночной full run полезен после сокращения release-набора, но не заменяет обязательный
  полный gate для рискованного runtime изменения. До selector отдельный nightly
  необязателен: каждый кандидат уже проходит полный suite.

## P7. Регрессии release machinery

Использовать существующие release tests с injected command executor и временными
каталогами. Не публиковать реальные версии из unit/integration тестов.

- PASS только при полном наборе обязательных successful suites.
- Modified tarball, wrong tuple, foreign CI origin/attempt/artifact — отказ до publish.
- Missing/corrupt/expired artifact — новый gate, не доверие локальному JSON.
- Publish recovery не вызывает build/test/repack.
- Lost reply + exact registry bytes — продолжение post-publish; разные bytes — отказ.
- Stale recovery не перемещает beta/tag; конкурентные публикации сериализуются.
- Временный readback retry отличается от permanent malformed/identity/auth failure.
- Package smoke исполняет установленный пакет, а не checkout; missing asset ловится.
- Dependency-tree drift отражается в evidence и требует нового consumer smoke;
  недопустимая integrity identity не принимается автоматически.
- Shard inventory полный; skipped/failed shard запрещает aggregate PASS.
- При P6: unknown diff, canon common contract и policy change выбирают full suite;
  rename/delete не выпадают из классификации.

## P8. Операционные инструкции и EVAL

- В release runbook описать candidate id, место artifacts, подтверждённые фазы,
  разрешённый recovery, конфликт версии/канала, retention и отсутствие artifact.
- В `dd-eval/runbooks/execute-eval.md` закрепить получение engine snapshot checksum
  из проверенного установленного snapshot, а не bare npm directory. Переиспользовать
  `lib/engine-admission.mjs`; не вводить второй алгоритм checksum.
- `scripts/qualify-published-repair.mjs` остаётся целевой квалификацией runtime repair,
  а не обязательным smoke каждого будущего релиза. Не превращать исторический CP
  runbook в универсальную последовательность всех когда-либо выполненных тестов.
- Подготовка EVAL проверяет точный published tuple и свои prerequisites; не повторяет
  полный release suite. Результат текущего CP-127 остаётся отдельным evidence.
- Production rollout pipeline: сначала dry-run с реальным tarball без публикации,
  затем следующий действительно нужный релиз. Не выпускать фиктивную версию только
  для проверки recovery; failure injection выполнять локально/в CI без npm writes.

## Порядок поставки и итоговая готовность

P0 → P1 → P2 → P3 → P4 → P5; P7 пишется вместе с каждым этапом; P8 завершает поставку.
P6 отдельно, по данным. На переходе к новой схеме полный suite остаётся обязательным.

Первая версия готова, когда кандидат проверяется целиком, publish использует те же
байты без повторной проверки, recovery безопасен, быстрые ошибки обнаруживаются
раньше, изолированные shards эквивалентны полному прогону, docs/tests обновлены.
Нельзя объявлять задачу завершённой только после изменения YAML или сокращения
списка команд. В отчёте нужны результаты негативных тестов и замеры ускорения.

План не требует нового сервиса, dependency framework, универсального cache key или
переиспользования PASS между разными commits. Точная policy promotions, поддерживаемые
artifact APIs и shard arguments проверяются на установленном toolchain до реализации
соответствующих шагов; неподтверждённые возможности платформы не считаются готовыми.

## Реализация

- Добавлен versioned candidate manifest, единый tarball digest admission и installed
  package smoke. Candidate PASS требует фиксированный набор release-contracts,
  4 integration shards и отдельный runtime-sensitive gate.
- Workflow разделён на prepare, integration matrix, candidate acceptance и credentialed
  publish. Только publish имеет OIDC/write; recovery загружает accepted artifact по run id.
- Publish использует `npm publish <accepted.tgz>`, сверяет registry bytes, provenance,
  channel/tag и выполняет registry consumer smoke во временном prefix без global install.
- Release scripts сведены к одному guarded пути; direct rebuild-and-publish удалён.
- Readback повторяет только временные ошибки; malformed/auth/identity mismatch терминальны.
- `test:release` выполняется раньше build, `test:integration` исключает уже выполненный
  release test. Два доказанно timing-sensitive subprocess-файла вынесены в один
  обязательный последовательный `runtime-sensitive` gate; остальной inventory
  автоматически и без пересечений покрывается четырьмя Vitest shards.
- Добавлены regressions на tamper, неполный набор suites, lost publish reply без
  build/test и классификацию readback. Changeset подготовлен.
- Affected selector сознательно не включён: P6 остаётся условным после замеров P5.
- Проверка installed snapshot checksum добавлена в операционный EVAL runbook.

Локальная проверка реализации:

- release contracts: 8/8 и build-info contract 1/1;
- typecheck и lint: PASS;
- runtime-sensitive: 29/29 (13 process-control + 16 adapter contract tests);
- integration shards: 732/732, 383/383, 237/237 и 144/144;
- dry-run immutable candidate: build, pack, tarball/build-info admission, установка в
  чистый consumer, engine install/resolve/status и dependency lock evidence — PASS;
- первая стресс-попытка подтвердила, что process-control и native-adapter subprocess
  нельзя безопасно смешивать с четырьмя локально конкурирующими suites: они достигали
  собственных observation deadlines. После выделения отдельной дорожки все слои PASS
  без увеличения таймаутов.

Dry-run также выявил и устранил две недетерминированные зависимости smoke от
окружения: унаследованный pnpm `npm_config_allow_scripts` теперь переносится в
изолированный npmrc, а dependency evidence читается из созданного `package-lock.json`,
не из `npm ls`, чувствительного к macOS-нормализации `/tmp` и `/private/tmp`.

Workflow и publish path дополнительно требуют первого реального GitHub production
release: локальная проверка намеренно не публикует фиктивную npm-версию и не выдаёт
локальному процессу production credentials.
