# 104 — Быстрый выпуск и изолированные проверки контрактов

Статус: реализован; targeted-приёмка и ограничения зафиксированы в `104-implementation-report.md`. Новые EVAL и выпуск пакетов в эту реализацию не входят.
Дата: 2026-10-25. Продолжение плана 102 по фактам подготовки CP253.

## 1. Цель, границы и основания

Выпуск engine/bridge не является повторной приёмкой уже проверенного поведения.
Проверять каждый изменённый контракт один раз, переиспользовать его результат при
неизменных значимых входах. Параллельность добавлять после удаления дублирования.
Обычная подготовка EVAL не запускает developer-тесты, живую квалификацию Judge или
повторную оценку неизменной продуктовой фикстуры без конкретного изменения.

Сохраняем: достаточность выбранных контрактов; проверку фактических зависимостей;
идентичность пакета и registry readback; полноту выбранных cases; физическую
изоляцию и cleanup; честные FAIL/INTERRUPTED/UNKNOWN; свежую готовность test-world.
Продуктовые CODE/repair/review/финальный Judge не упрощаем. Работающие EVAL,
их определения и артефакты не меняем. GitHub CI и полный gate не запускаем.

Исторические receipts, неудачные попытки и планы 095/102/103 не переписываем.
Дефект baseline с завершающим `/` уже исправлен PR dd-eval #157; заново его не
«реализуем», сохраняем существующую регрессию как доказательство исправления.

### Наблюдения CP253, не нормативные лимиты

- От начала рабочих checkout до отчёта о четырёх запусках: около 132 минут.
- Итоговая выборка: 105/316 файлов, 2182 верхнеуровневых cases; native wrapper
  содержит дополнительные вложенные cases, поэтому эти счётчики не складываем
  и не называем количеством уникальных продуктовых проверок.
- `integration-controller`: 77 файлов, 1205 cases, 48 мин 43 с.
- R7 переиспользовал пять групп; R8 — девять. Reuse уже есть, строить его заново не нужно.
- R8 после release-script исправления повторил все десять выбранных native fixtures.
- Первые слишком широкие выборки затронули E2 CLI и начали лишние E3-проверки;
  они остановлены, но потраченное время и исходы остаются в учёте.
- Параллельная подготовка столкнулась с общим retirement lock; три запроса
  закончились до manifest. Последовательная подготовка сработала, но повторяла
  обход исторических ресурсов в frontend и worker.
- Оценки quality/browser/isolation в финальных EVAL уже переиспользованы либо
  перепроверены детерминированно. Эти правильные механизмы сохраняем.

Основания: `cp253-impact-verification-r6/r7/r8/verification.json`, их group reports,
`cp253-published-release.json`, `cp253-release-progress.json` в
`/Users/deksden/.dd-eval/qualification`. Измерения под нагрузкой, не чистый benchmark.
Аудит: engine `89cad0d654601de59b12929240eee4e958b74207`, EVAL
`1a9344b8` (полный hash закрепляется в provenance реализации), bridge
`b18dfdbedaa9330e765315bce0f1a609792d6c91`.

## 2. Установленные дефекты и места исправления

| ID | Причина по коду | Системное исправление |
| --- | --- | --- |
| D1 | engine `verificationBase()` в `scripts/verification-policy.mjs` всегда берёт последний release-tag; release заново охватывает уже проверенные merge-изменения | Разделить журнал требуемых контрактов от tag и поиск существующего evidence для конечных входов; tag оставить консервативной границей полноты, не основанием повторного исполнения |
| D2 | `zoneFor()` и `selectVerification()` выбирают все tests широкой зоны `controller` | Декларативные контракты и прямые consumers вместо общей категории; точные file/fixture IDs, объяснение выбора каждого job |
| D3 | `contractIdentity()` добавляет обе ownership-зоны `verification` и `packaging`, общие package/policy файлы; native wrapper классифицирован как verification | Отдельные значимые fingerprints runner, runtime, dependency closure и политики конкретного контракта; упаковка не инвалидирует native behavior |
| D4 | ключ группы содержит весь набор выбранных файлов/fixtures; helpers для non-native берутся широко | Стабильная единица кеша — небольшой контракт, а не случайный состав текущего release-diff; relevant helpers и fixtures принадлежат этому контракту |
| D5 | engine `scripts/verification.mjs` выполняет `for ... await`, меняет глобальный `process.env`; Vitest везде `fileParallelism:false/maxWorkers:1` | Изолированные дочерние jobs с явным env, ограниченный общий пул; не параллелить саму функцию в общем env |
| D6 | engine/EVAL cache locks через `mkdirSync`, состояние running вызывает assert; нет join живого идентичного job | Один producer, остальные наблюдают его exact job/owner и читают готовый immutable receipt; неизвестный владелец не PASS и не разрешение украсть lock |
| D7 | EVAL `scripts/verification.mjs` последовательно запускает каждый файл; `contractKey()` зависит от общих ключей policy/package | Та же семантика ограниченного исполнения и scoped identities в существующем EVAL runner, без копирования engine catalog |
| D8 | bridge `package.json` имеет `prepublishOnly: build && test`, где test — весь `vitest run` | Явный downstream release-путь с выбранными bridge tests/receipts и упаковкой; запрет скрытого полного тестирования через lifecycle hook |
| D9 | EVAL `withPriorEvalRetirement()` вызывается в prepare-only frontend и снова в `runnerResume`; текущие batch по resource home/chunk 16 и bound-proof reuse уже реализованы | Убрать непродуктивный frontend-обход при prepare-only; сохранить один свежий worker barrier и существующий batching; локальную reservation не считать authority |
| D10 | Полнота/время распределены по верхним отчётам, native TAP, reuse-ссылкам и отдельным попыткам | Один краткий итог: выбранное/выполненное/reused/прерванное, вложенные cases отдельно, длительности фаз и критический путь |
| D11 | Оба verification runners создают detached children, а смерть parent сама по себе не доказывает их остановку | Удерживать занятые slots до подтверждённой остановки owned groups; parent death не освобождает бюджет автоматически |
| D12 | Cache index читается до claim, изменяется прямой записью JSON; live join/rerun может увидеть частичный или устаревший индекс | Повторное чтение под lock, атомарный publish, immutable attempt ID и join конкретной попытки |

D1 — расхождение реализации с намерением §3.2 плана 102, а не отсутствие всей
системы reuse. D8 — найденный обходной риск: последний downstream CP253 выпущен
архивом без этого npm hook; не утверждаем, что hook исполнялся в той подготовке.

## 3. Конкретные решения

### 3.1. Выбор и reuse: до запуска, единый SSOT

1. Расширить существующий `verification-policy.mjs`, не вводить новый DSL,
   import-graph анализатор, сервис кеша или второй независимый gate.
2. Описывать contract ID, точные tests/fixtures, owned sources/assets/helpers,
   dependencies, прямые consumers и execution class (`isolated`/`exclusive`).
   Сначала мигрировать реально затронутые CP253 зоны, не переустраивать весь SDLC.
3. Разбить controller минимум на core/state, child/capacity/observation,
   continuation/control/recovery, stage lifecycle/context, work/review,
   merge и diagnostic/protocol consumers. Для каждого указать реальные модули
   и существующие tests; не добавлять новую фикстуру ради названия контракта.
4. Не считать изменение монолитного `run-controller.ts` заведомо локальным.
   Если зависимости действительно широкие — сохранить необходимые consumers;
   если один механизм мешает сужению, выделить только этот механизм в малый
   модуль с существующей точечной регрессией, без общей переработки контроллера.
5. На PR/merge вычислять требования для реального diff (включая изменения main,
   rename/delete, mode/symlink и runtime assets). До публикации собрать union
   требований после последней release-границы и сопоставить receipts конечным
   fingerprints. Отсутствующий/неполный merge receipt не обнуляет требования:
   реконструировать их из diff от tag и выполнить только недостающие контракты.
   Не выбирать произвольный PASS как новую базу, не принимать `--base HEAD` как skip.
6. Итоговый manifest остаётся существующим selection/receipt: добавить причины,
   требования и ссылки reuse. `verifyCandidate`/accept/publish читают одну policy.
   Source commit/tree — provenance; одинаковые meaningful inputs действительны
   через cherry-pick/squash/merge. Конфликтное изменение relevant inputs требует
   новой проверки только соответствующего контракта.
7. Неизвестные sources/tests/dependencies останавливают согласование selection
   с точным именем, не запускают всё и не дают пустой PASS. Проверка каталогизации
   обходит имена файлов, но не импортирует/не исполняет весь набор тестов.

Начальные конкретные границы каталога engine (пути ниже относительно engine;
это корневые tests, не запрет добавлять обоснованный прямой consumer):

| Contract | Sources | Существующие корневые tests |
| --- | --- | --- |
| controller-core | `src/services/run-controller{,-state,-adapter}.ts` | `test/run-controller{,-state,-adapter}.test.ts` |
| native-child | `controller-child-capacity.ts`, `controller-child-observer.ts` в services; `native-children.mjs` в harness-runtime/lib | `controller-child-capacity.test.ts`, `controller-child-observer.test.ts`, `controller-child-recovery103.test.ts` в test |
| provider-policy | `provider-overload-policy.mjs`, `provider-capacity.ts`, `memory-init-native-capacity.ts` | `provider-recovery103.test.ts`, `memory-init-native-capacity.test.ts` и `provider-overload-adapters` fixture |
| run-continuation | `run-recovery-{guard,runtime}.ts`, `run-control{,-worker}.ts` | `run-control-{admission,resume,worker}.test.ts`, `recovery-root-continuation.test.ts` |
| stage-lifecycle | `stage-{context,lifecycle,report-renderer}.ts` | `stage-context.test.ts`, `stage-lifecycle-ownership.test.ts`, `stage-report-publication.test.ts` |
| work-review | `work-repair`/`review-*` services по их фактическому inventory | `work-repair-preparation.test.ts`, `review-contracts.test.ts`, `review-recovery-boundary.test.ts` |
| merge | `merge-{queue,server,worker}.ts` | `merge-server.test.ts`, `merge-queue-preparation.test.ts`, `merge-repair-recovery.test.ts` |
| diagnostic/protocol | `diagnostic-stage-results.ts`, `protocols.ts`, их publication consumers | `diagnostic-stage-results.test.ts`, `protocol-registration-publication.test.ts`, `protocol-transition-preparation.test.ts` |

Brace notation здесь — сокращение списка, не runtime-regex API. Native AGY/Codex/
ZCode/OpenCode получают собственные adapter/daemon fixtures и небольшие TS tests;
общие delegation/model-observation inputs принадлежат отдельным контрактам.
Catalog дополняется по реальному inventory с проверкой полноты, а не по совпадению
подстроки `run-`/`review-`; ручной `--skip` не заменяет reviewed mapping.

### 3.2. Границы ключа контракта

- Runtime sources/assets, выбранные tests/helpers, фактический runner/reporter,
  relevant compiler/options, dependency closure, Node/OS/arch/SQLite при потреблении.
- Не включать HEAD, timestamp, built_at, version-only, checkout path, unrelated
  release scripts или весь package.json в поведенческий ключ. Значение version
  учитывается отдельно, если конкретный контракт реально от него зависит.
- Не игнорировать всю policy: хранить fingerprint декларации именно этого
  контракта и validator semantics. Изменение formatter/report path само по себе
  не меняет доказанное поведение. Изменение смысла PASS/полноты требует
  детерминированной перепроверки сохранённых reports, где это возможно, а не
  обхода нового валидатора. Старый формат не переписывается в новый PASS.
- Изменение dependency → реальные affected consumers, без blanket всех упряжек.
  Неизвестный lockfile формат/closure — явная ошибка mapping, не «нет изменений».
- Native fixtures кешировать по fixture ID, относящимся к ней inputs и общим
  потребляемым контрактам. Состав других fixtures в release-selection не входит
  в её ключ. Wrapper self-tests нужны при изменении wrapper/reporter, не всегда.
- Сохранять TAP/inventory и cleanup выбранных fixtures; новая aggregate-ссылка
  указывает на исходный hash/producer, а не выдаёт reuse за повторный запуск.
- Изменение packaging не инвалидирует adapter cases; изменение общего overload
  контракта выбирает его regressions и доказанно зависящие adapters. Droid/Grok
  допустимы только с такой причиной, не потому, что их fixture есть в каталоге.

Уточнение source/build closure: tests, импортирующие `dist` или запускающие
compiled CLI, потребляют конкретный build. Сначала выполнить один необходимый
build, затем запечатать потребляемые compiled inputs и compiler/options в job
descriptor. Не использовать свежий source PASS для старого dist и наоборот.
Изменение только build-info/version не инвалидирует поведение, если этот metadata
input явно не потребляется проверкой; остальные исполняемые bytes не исключать.

Из старого grouped receipt можно извлечь отдельный contract/fixture proof только
если сохранены его exact cases, inputs, terminal и cleanup evidence. Одного
PASS wrapper недостаточно для выдумывания неизвестных per-fixture fingerprints.
В противном случае выполнять именно missing contract, без переписывания истории.
Версия схемы нового contract selection/receipt — `@2` при изменении семантики
`@1`; historical readers остаются явными. Переиспользование grouped @1 оформляется
новой ссылкой/equivalence evidence после проверки, а не изменением старого файла.
Для нового native job допустима одна fixture ID; self-tests wrapper вынести в
отдельный существующий-file contract. Не включать wrapper self-tests в каждый
из десяти fixture jobs и не учитывать wrapper+children как независимую стоимость.
Requirements после tag строятся из полного diff/его истории по необходимости:
rename/delete учитывают старого owner; отсутствующий файл — явный input marker;
revert допускает старый PASS только для совпавших конечных inputs. Отсутствие
подходящего release-tag — bootstrap от merge-base/корня истории с reviewed
selection, а не пустой набор. Policy-only изменение валидирует completeness
самого mapping; оно не разрешает удалить все requirements и объявить not_required.

### 3.3. Выпуск — доставка, не повторная разработка

Последовательность: определить missing contracts → выполнить их один раз →
заморозить результат → build/pack → короткий installed delivery smoke → publish →
registry readback → pins/hooks. Блокер исправляется отдельным изменением с новой
точечной регрессией; ранее успешные независимые jobs не запускаются повторно.

Минимальная проверка каждого нового tar: версия/provenance, полный необходимый
production payload/dependency closure, отсутствие секретов, установка в отдельный
prefix, загрузка выбранных entrypoints и чтение версии. `engine install` проверяет
созданный snapshot, а не молча выполняет SDLC. Существующий расширенный
install/resolve/status consumer smoke — только при изменении его механизма,
упаковки или ABI. Не добавлять одновременно typecheck и build, если один build
уже выполняет тот же TS compilation без изменения условий.

После publish — точное совпадение registry tar и зависимостей с принятым artifact;
поведенческие suites не повторяются. Ошибка публикации не аннулирует поведенческие
receipts и не разрешает перепубликацию существующей версии другими байтами.

Для bridge сохраняем upstream version и downstream commit/fingerprint. Проверить
README/docs/FORK-UPDATES и реальные `pack/publish/prepublishOnly/postinstall`
entrypoints; downstream helper не должен скрыто запускать общий `pnpm test` или
перезапускать чужой hub. Build нового bridge/engine можно выполнять параллельно
в рамках того же бюджета. Живую native-пробу не повторять ради нового engine tag:
она нужна только для изменённой квалифицируемой tuple/возможности, по отдельному
явному основанию. Offline контракт не выдаём за native-доказательство.

### 3.4. Параллельность и физическая изоляция

Один coordinator составляет immutable список jobs и запускает ограниченный
`spawn`-пул на стандартной библиотеке. Начальный общий бюджет — 2 одновременно
выполняемых jobs (engine + bridge + EVAL tests вместе), `jobs=1` — fallback.
Граница бюджета — один managed coordinator на host, не один на репозиторий,
чат или cache override. Использовать filesystem lease с подтверждённой process
identity в стабильном общем coordinator home; это локальный lock, не новый daemon.
Default этого home — реальный пользовательский `~/.dd-flow/verification-coordinator`,
вычисленный до подмены fixture HOME. Cache overrides не меняют его. Тестовая
подмена coordination home допустима в синтетической fixture, не как release skip.
Второй запрос читает готовые receipts/join активного одинакового job; недостающие
новые jobs ждут освобождения coordinator lease, затем пересчитывают missing.
Не нужен динамический распределённый backlog. Lease уже назначенного job
передаётся child runner; child не открывает собственный пул. Старые несогласованные
внешние процессы и приложения не входят в гарантию этого бюджета и не убиваются.
При внешнем пуле внутренний runner каждого job имеет один worker; не умножать
число процессов вложенной параллельностью Vitest/Node. Порядок завершения не
меняет selection/итог; сохранять стабильный порядок ссылок в summary.

`exclusive` определён строго: дождаться нуля active jobs, выполнить один job
в одиночку, затем возобновить isolated jobs; одновременно второй slot не выдавать.
На первом этапе это host-wide правило, не новый граф конфликтующих ресурсов.
Порядок — стабильный FIFO исходного manifest, без обгона ожидающего exclusive.
Бюджет относится к developer tests/build/delivery smoke, а не к длительности
Subject/Judge EVAL: после запуска самостоятельного EVAL test slot освобождается.
Model dispatch имеет существующий provider/capacity budget, не новый jobs=2.
Productive EVAL admission использует resource locks, не глобальный test lease.
Два jobs — лимит верхнеуровневых одновременно исполняемых проверок, не запрет
подпроцессов native-протокола внутри теста. Вложенный технический runner наследует
проверяемый owner/attempt контекст и один slot родителя; не ждёт тот же host lease
как новый coordinator (иначе parent/child deadlock) и не создаёт свой параллельный
пул. Синтетические repos из tests получают изолированный coordination home или
тот же сериализованный slot; не принимают fake env claim за освобождённый бюджет.

Lease/job record хранит attempt ID, owner PID+birth, child PID+birth/PGID,
потреблённые slots и paths evidence. При падении coordinator сначала наблюдать
детей и их cleanup. Даже подтверждённая смерть parent или PID reuse не означает
свободный slot: живой owned group удерживает его до завершения/owned cleanup;
неподтверждённая идентичность группы блокирует reuse спорного ресурса.
Использовать существующий physical ownership helper, не kill по имени процесса.
Ошибки observation не превращаются в отсутствие процесса. Explicit cancel
producer завершает его группы и публикует INTERRUPTED, не автоматический rerun.

На каждый job: уникальные report root, tmp/cache/config/runtime/Codex/AGY homes,
SQLite и log paths; PostgreSQL — отдельная БД на world, порты выделяет ОС,
отдельный browser profile. Доступ к production/shared credentials — только если
он явно нужен разрешённой native-пробе; unit fixtures используют doubles.
Не изменять глобальный `process.env` между параллельными jobs: передавать каждому
child snapshot env. Общий source/artifact — read-only после freeze.
Identity/command builders принимают env явно (default — process.env для совместимости);
заранее вычисляют job descriptors без переключения parent process.env между jobs.
Общий receipt index и immutable artifacts не копировать в каждый job. Download/
package-manager cache можно разделять только при его штатной concurrent-safe
locking/content-addressed семантике; writable fixture homes/SQLite так не разделяем.
Конкретный DB create/drop и port bind должен владеть выбранным ресурсом до конца
его использования; probe-free-port → close → повторный bind не доказательство изоляции.

Сначала проверить реальные `test/fixtures/*`, E3 helpers, процессные тесты и
Vitest projects: `mkdtemp` сам по себе не изолирует общий HOME/БД/порт/реестр.
Tests глобального singleton/installation оставлять `exclusive`, пока они не
параметризованы; не включать всем `fileParallelism:true` одним флагом.
Остановка/ошибка job прекращает его собственное дерево, подтверждает cleanup,
сохраняет исходный FAIL/INTERRUPTED; остальные независимые jobs не убиваются.
Новые jobs после неизвестной физической очистки не используют спорный ресурс.

Single-flight: identity включает contract + meaningful inputs + execution mode.
Live exact owner → join и наблюдение receipts/progress, не второй запуск.
Dead/reused PID → только подтверждённое восстановление существующими ownership
helpers; возраст lock не доказательство смерти. Новый FAIL не маскируется старым
PASS. Автоматического test-retry нет; explicit rerun сохраняет причину и попытки.

Порядок claim/publication обязателен: взять per-contract lock → заново прочитать
и проверить index → создать уникальную attempt directory → атомарно опубликовать
running с owner/attempt → выполнить job → записать terminal report → атомарно
заменить index ссылкой на этот report. Для JSON использовать имеющийся
`writeJsonAtomic`/эквивалент tempfile+rename, не direct truncate/write.
Join привязан к attempt ID, а не только к mutable имени index. Индекс не является
самим доказательством PASS: report bytes/inputs проверяются reader.
Accepted explicit rerun атомарно supersedes прежний cached PASS до dispatch;
после этого новые readers не возвращаются к старому PASS. Waiter cancellation
отменяет только ожидание, не producer и не чужие joins. Прерванная до dispatch
попытка не запускается тайно заново. Terminal/partial files, logs и rerun причины
сохраняются; invalid index диагностируется под lock, не считается успешным reuse.

Субагентам можно поручать отдельные упряжки/исправления и чтение results.
Они не становятся дополнительными test coordinators и не получают собственные
независимые лимиты по два workers. Общий engine проверяется один раз; каждый
агент использует готовый immutable artifact и выделенные ресурсы своей упряжки.
Создание новых чатов или специальной агентной платформы не требуется.

### 3.5. Подготовка EVAL и retirement

Сохраняем разделение fixture assessment/readiness и reuse Judge/matrix; не
повторяем product quality/browser/isolation из-за фикса адаптера или нового home.
Для каждого world остаются его фактическая установка/routing/DB owner/migrations,
готовность нужных ресурсов и cleanup. Readiness ошибка не превращается в PASS.

Readiness-review установил: `currentRetirementProofs` уже группирует canonical
resource homes, делает chunks по 16, дедуплицирует scope IDs и проверяет bound
proof каждого root. Это сохраняем, заново batching не реализуем. В текущем API
разные resource homes по-прежнему требуют отдельных наблюдений; не обещаем
один CLI-вызов на всю историю и не добавляем новый multi-home RPC в план 104.

Принято минимальное изменение: frontend `executeEval(prepareOnly:true)` только
готовит/публикует manifest и очередь, но не очищает историю. У этого пути нет
productive dispatch. Физический retirement/admission выполняет worker один раз
непосредственно перед первым unstarted execution. Прямой non-prepare-only путь
и resume к unstarted execution также обязаны пройти тот же fresh barrier; путь
к уже started execution сохраняет свои continuation/recovery проверки.
Перед удалением frontend обхода проверить все callers `executeEval/evalRun`
и запретить обход barrier через `executePreparedQueue` как внутренний API.
Prepare-only сохраняет provision control-runtime и manifest/planned publication,
но пропускает также audit reservation write; worker пишет собственную reservation
после своего fresh barrier. Проверены callers `requestEvalRun → evalRun` и
`eval-resume-worker → runnerResume`; native qualification owner имеет собственный
barrier в `lib/qualification-owner.mjs`, его не отключать.

`launch-reservation.json@1` сейчас проверяет лишь run/root/resource-home и не
наблюдается competing discovery без manifest. Оставляем его audit-фактом,
не authority, TTL-token или основанием пропустить worker barrier. Не сокращать
защищённый переход на его основании. Сохраняем порядок resource locks → короткий
lifecycle участок; нельзя ждать retirement, удерживая lifecycle lock. Новая
durable reservation authority/схема resource-registry не вводится этим планом.

При фактическом barrier повторно discover candidates под resource locks,
проверить свежие scopes/fences и physical-stop proofs текущими readers.
Изменённый root/manifest/home/fence/inventory инвалидирует только его proof;
cleanup authority выполняется для реально недостающих proofs. Live соседей
не переводить в terminal и не считать abandoned по возрасту. Публикация
конкурирующего scope проходит тот же protocol; локальный batch coordinator
не становится единственной линией защиты.

Один preparation coordinator может распараллелить независимую frontend работу;
resource barrier сериализует только конфликтующий admission. Вместо hard-coded
30-секундного отказа — cancellable ожидание с наблюдаемыми owner/phase/progress.
Для EVAL admission использовать настраиваемое sliding inactivity окно
1800000 ms (существующий порядок eval no-progress budget): подтверждённый прогресс
сдвигает его, heartbeat без прогресса доказывает liveness, но не бесконечную работу.
Исчерпание возвращает сохранённый waiting/stalled blocker, не failed Subject и
не разрешение украсть lock; существующий owner не убивается. Не менять default
30 s всех `withRunnerLock` callers: новый режим включить только для admission/
coordinator ожидания. Probe failure и неизвестный owner — явный blocker.

Не создавать новый EVAL ID при одном лишь ожидании lock, не оставлять новые
полупустые roots на каждый автоматический повтор. Запущенные чужие EVAL не
останавливать; terminal/investigation retention policy сохраняется.

### 3.6. Отчётность и операционные entrypoints

До исполнения показывать точные jobs, причины, input fingerprints, reuse/missing,
exclusive-class и бюджет. После — отдельно wall time подготовки и тестов,
worker-seconds, installed delivery, publish/network wait, retirement/readiness,
число исполненных и reused файлов/cases; parent wrappers и native cases раздельно.
Прерванные/лишние попытки входят в фактическую стоимость, не исчезают за последним PASS.

Операционный SSOT — `runbooks/flow-test-suite-verification.md` и относящиеся к
EVAL разделы `runbooks/e2e-monitoring.md`, к bridge — `runbooks/update-zcode.md`.
В engine `.memory-bank/spec/operations/verification-policy.md` оставить короткую
ссылку/норму. Не размножать хронологические протоколы в инструкциях.

### 3.7. Минимальный contract/job протокол и зависимости

Для selection@2 сохранить provenance/base/head/paths и добавить
`required_contracts`: ID, declaration fingerprint, meaningful input inventory,
test files/case/fixture selection, dependency owners, runner, execution class,
reasons и prerequisites. Для каждого job зафиксировать отдельно `execution_key`
(поведение/исполняемые входы) и `validation_key` (правила чтения/полноты отчёта).
Смена validation_key сначала перепроверяет исходный report; она не превращает
несовместимый execution_key в reusable. Job не обязан потреблять весь manifest
как свой input; native fixture список соседей не попадает в его ключ.

Receipt@2: requirement → producer attempt/report hash, executed/reused/revalidated/
not_required/blocked outcome, фактический inventory и cleanup; nonterminal
running/waiting живут в атомарном index, не выдаются за terminal proof. Неизвестный
schema version закрывает admission; не вызывать старый full-suite путь как fallback.
Outer release candidate может сохранить совместимую структуру, но старый reader
обязан отвергнуть неизвестный nested receipt/selection, а не проигнорировать его.

Prerequisites указываются вручную только для реально нужных шагов: compiled CLI
test ждёт его build; source-only test не ждёт постороннюю сборку. Общий dist/canon
build writer один; после него artifact read-only. Зависимые jobs не dispatch при
FAIL/UNKNOWN prerequisite, получают blocked, не fake FAIL тестов и не PASS.
Независимые jobs можно закончить; publish ждёт все required terminal evidence.
Build/output fingerprints добавляются до dispatch потребителя после завершения
его build; старую незавершённую job identity нельзя молча заменить во время работы.
Это малый список prerequisites существующего runner, не новый graph framework.

## 4. Порядок реализации и минимальная приёмка

1. **Selection/identity.** Engine policy + receipt identity/validators; конкретные
   consumers; совместимое чтение старых receipts. EVAL policy — аналогичные места.
   Один табличный regression набор на существующем test runner, без full discovery.
2. **Release reuse.** `release-candidate.mjs`/publisher и bridge downstream путь:
   принять существующий evidence, выполнить лишь missing contracts, не запускать
   tests из pack/install hooks. Использовать имеющиеся consumer/archive helpers.
3. **Isolation/single-flight.** Инвентаризировать mutable resources выбранных
   fixtures, исправить конфликтующие; маленькие jobs, explicit child env, join.
4. **Ограниченная конкурентность.** После шага 3 включить два jobs; общий manifest
   хранит бюджет, exclusive jobs исполняются без соседей. Без нового daemon/сервиса.
5. **EVAL admission.** Убрать prepare-only frontend обход; оставить fresh worker/
   direct/resume barrier и существующие batch/proof validators; проверка всех callers.
6. **Документация/метрики.** Обновить операционный SSOT, записать точную стоимость
   targeted приёмки. Коммиты по репозиториям, merge по их правилам при реализации.

Обязательные acceptance-сценарии (только соответствующие изменённые tests):

| Сценарий | Ожидаемый результат |
| --- | --- |
| Version/README/release formatter после проверенного merge | 0 повторных behavior cases; нужная доставка остаётся |
| Исправление только npm packaging | Packaging regression + installed smoke; 0 adapter/controller reruns |
| Локальный ZCode adapter fix | Конкретные ZCode cases и declared consumers; не все AGY/Codex/Droid fixtures |
| Общая provider policy меняет поведение потребителей | Policy tests и явно affected adapters; объяснение каждой связи |
| Уже проверенный squash/merge, другой worktree | Reuse при равных meaningful inputs, исходный producer сохранён |
| Relevant dependency/helper, rename/delete или conflict resolution | Инвалидация только реальных affected contracts, без потери требований |
| Изменение одного unrelated test или добавление соседней fixture | Не инвалидирует независимый PASS |
| Missing/corrupt/старый несовместимый receipt | Точная перепроверка/недостающий job, не пустой PASS и не весь gate |
| Два coordinators запрашивают одинаковый job | 1 исполнение, 1 join; сохранены оба запроса и общий producer |
| Два изолированных jobs + один exclusive | Максимум 2 workers, exclusive не пересекается; нет общих mutable paths |
| Падение/interrupt в одном job, PID reuse/чужой daemon | Только owned cleanup, нет ложного PASS/чужого kill; evidence сохранён |
| Две параллельные подготовки и рестарт frontend/worker | Нет duplicate dispatch, повторной physical cleanup при актуальном proof и ложного lock-timeout FAIL |
| Появился новый historical owner после подготовки | Свежий barrier обнаруживает его; старый receipt не разрешает dispatch |
| Подготовка четырёх EVAL на неизменной фикстуре | Общие tests/Judge qualification не повторяются; каждый world readiness свежий |
| Смерть coordinator при живом detached child | Slot занят до доказанного physical cleanup; новый coordinator не начинает дополнительные jobs |
| Waiter прерван, producer продолжает | Только waiter cancelled; producer не получает SIGTERM и не дублируется |
| Два readers/explicit rerun и падение во время index publish | Нет частичного JSON/устаревшего PASS после accepted rerun; attempts неизменны |
| Nested synthetic verification внутри теста | Нет self-deadlock на host lease и вложенного пула workers |
| Изменились validator semantics или case catalog | Revalidation там, где доказуема; новые/недоказанные cases остаются missing |
| Source обновлён, dist старый / build prerequisite упал | Compiled consumer не получает старый PASS, dependent blocked |
| Prepare-only frontend и прямой запуск без worker | Frontend не делает retirement; direct productive путь обязательно делает свежий barrier |

Не доказывать ускорение повторным многочасовым прогоном или новой живой модельной
квалификацией. Для изоляции достаточно двух реальных локальных fixture jobs с
маркерами ресурсов/контролируемым failure и existing process ownership helpers.
Selection/reuse/race regressions — детерминированные локальные cases.
Структурная цель: 0 unnecessary reruns и bounded workers; секунды под нагрузкой
публиковать как измерения, не как жёсткий flaky acceptance threshold.

## 5. Готовность, миграция и проверка по ponytail

- Решения о семантике release/reuse, единице кеша, начальном бюджете (2),
  изоляции, single-flight, ошибках и границах retirement приняты выше.
- Сначала новые readers/catalog, затем writer и release integration. Старые
  evidence не переписывать; недоказуемый старый key не «мигрировать» в PASS.
- Консервативный fallback — jobs=1 и конкретная missing проверка, не full gate.
  Откат scheduling не отменяет уже полученные валидные результаты и fences.
- Нельзя ради ускорения игнорировать consumer, lock или актуальную DB/process
  ownership. Расширение набора требует причины; неизвестный impact блокирует mapping.
- Ponytail: используем существующие Node/Vitest, каталог, receipts, batch API и
  ownership helpers. Нет распределённого scheduler, нового DSL, сервисов кеша,
  контейнера на каждый unit-test, обязательного subagent или переписывания всего
  controller. Новые abstractions только если конкретный существующий механизм
  невозможно исправить локально; такое отклонение отдельно обосновать.
- План проверен по цепочке selection → key/reuse → execution → delivery → EVAL
  admission. Runtime/native-протоколы и продукт не меняются ради этого плана.

Готовность означает достаточность решений для реализации, не выполненную приёмку.
Тесты, публикации и новые EVAL в рамках подготовки документа не запускались.

## 6. Повторное readiness-review, 2026-10-25

Проверены selection/key/receipt, build/pack/publish, single-flight/execution и
frontend/worker/direct/qualification admission. Два read-only независимых ревью
перепроверены основным агентом по исходникам; результаты не приняты на веру.

Закрытые пробелы первой версии:

1. D11: смерть coordinator не равна смерти detached jobs — добавлены физические
   group identities, удержание slots и unknown-cleanup blocker.
2. D12: direct-write mutable index небезопасен для joins — атомарное обновление,
   повторное чтение после claim, attempt-bound join и явный порядок rerun.
3. `exclusive` теперь занимает весь managed pool; nested runner не ждёт lease
   родителя, EVAL/model lifetime не занимает developer test slots.
4. D9 скорректирован по коду: batching уже есть. Выбрано удаление только
   prepare-only повторного обхода, без новой reservation authority и слабого
   обхода worker barrier. Native qualification path не меняется.
5. Разделены source/build consumption, execution/validation keys и миграция
   grouped/native receipts; определены prerequisites и blocked dependents.
6. Добавлены race/crash/nested/compiled acceptance-сценарии. Осталась только
   точечная приёмка изменяемого механизма, без полномасштабной батареи.

Ограничения намеренные: общий бюджет только для cooperating entrypoints;
действительно общие изменения могут обоснованно выбирать несколько consumers;
разные исторические resource homes всё ещё наблюдаются актуально через имеющийся
API. План не обещает устранить все процессы/все задержки машины. Новые сервисы,
multi-home maintenance RPC и общий controller rewrite не требуются.
Существенных невыбранных архитектурных решений после review не осталось;
при реализации обязательны exact inventory mapping и перечисленная приёмка.
