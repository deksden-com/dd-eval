# 069 — CP198: согласование operational policy и достоверность evidence

Дата: 2026-10-07. Статус: **реализация и offline gates завершены; интеграция через PR**.
Повторная проверка готовности: 2026-10-07; уточнения отражены в разделе 13.
Расследование и реализация зафиксированы в [implementation report](069-implementation-report.md).
Этот документ не разрешает новый E2E, recovery исторического RUN или перезапись
прежних verdict/receipt. Живая приёмка остаётся отдельным действием R9.

## 1. Цель и границы

Устранить противоречивые инструкции об операционном контуре RUN, доставлять один
принятый контракт всем Stage/Work и корректно оценивать evidence при остановке,
восстановлении и успешном завершении. Исправляем FLOW, канон, EVAL и тесты, **не
продукт**. Ошибки продуктового результата остаются результатом Subject и предметом
оценки Judge, а не ручного исправления fixture/product runtime.

Критерии результата:

- Scoped решение о local integration и retention явно принято, доступно до PLAN
  и одинаково видно координаторам, native/external reviewers, CODE/repair Work.
- Frozen settings не подменяют разрешение пользователя. Отсутствующее разрешение
  и новый действительный конфликт сохраняют blocker/HITL.
- Integration, remote publication и cleanup — разные факты. Нет ложного
  `merged`, скрытого push/tag или удаления чужих ресурсов.
- Failed-check acceptance применяется только к действительно достигнутым check
  failures, использует точные native receipt IDs и доказанное владение snapshot.
- Отчёт, status, обычный и supplemental Judge согласованно видят источники,
  пробелы, историю и неопределённую причинную ответственность.
- Тесты пересекают реальные producer/consumer границы; scripted happy path не
  считается доказательством согласованности model-facing instructions.

## 2. Исходные данные и установленная причина CP198

Исследованный EVAL: `EVAL-20261007055948-506f2932`, Luna
`gpt-6-luna/xhigh`, через `cx`/CPA, Codex CLI `0.160.0`. Оба Judge:
`gpt-6.1-sol/high`. Home:
`/Users/deksden/.dd-eval/qualification/cp-198-luna.ghqTHj`.

Источники аудита:

- dd-eval main `7fd45fefc2ad7db151e66d2a8c1e5795a01e5a2e`;
- FLOW main `b9039b5104b92b46bc03b8f7acba8451a3f129c0`;
- CP198 engine beta.125, reviewed source
  `d2c8795e5dd3dd760bb98759a613bd9f774c9208` — дерево проверенной реализации;
- frozen launch definition `e31b23e989dd2f0a4dd1e617d92a36efca90c9c5`;
- product baseline dd-tasks `d81cd0a`, flow-pack source
  `2777773781b69dfd2ccaed55bbec245a88344655`;
- clean canonical source `2e57b987ec91b7c3b0fa97f6169047802a1233fb`;
  checkout `/Users/deksden/Documents/_Projects/_worktrees/dd-cp197-retry.gritrD/canon`.

В dd-memorybank есть чужие незакоммиченные изменения. Реализацию канона начинать
в отдельном чистом checkout; не смешивать её с ними и не менять старый pack.

Фактический результат: `completed_with_failures`, `unexpected_hitl` на
PLAN-REVIEW, cleanup settled, Final Judge завершён. SPECIFY, PROTOCOLIZE, PLAN
прошли; CODE/CODE-REVIEW/MERGE не достигнуты. В SPECIFY **полный канонический
продуктовый пакет был доставлен**: приоритеты/подписи/defaults, UI/API, атомарность,
open/closed, архивный exception, запрет дополнительных индикаторов. Дополнительный
вопрос был не про недостающие продуктовые требования, а про Git delivery/retention.

Frozen RUN profile требует `merge_delivery.strategy=local`,
`merge_cleanup.source=retain`. Сохранённая `.memory-bank/project-policy.md`
требует по умолчанию push exact main + annotated tag + cleanup; local-only — по
явному решению, retention — с причиной, владельцем и датой пересмотра. Исключений
нет. Reviewer WRK-009 выявил это, координатор запросил scoped разрешение
(`HITL-002-plan-review/question.md`). EVAL запрещает HITL на этом этапе и завершил
запуск. Считать этот код достаточным доказательством ошибки Luna нельзя.

Системная причина: при overlay нового flow-pack на старый product checkpoint
операционные полномочия и приоритет policy не представлены единым контрактом;
часть настроек видна лишь в MERGE, а reviews обязаны проверять их уже в PLAN.
Нет основания устранять проблему разрешением любого лишнего HITL или добавлением
Git-исключения в продуктовый ответ SPECIFY.

## 3. Охват аудита и реестр дефектов

Проверены все семь vNext Stage entry points, общий Work renderer и review input
binding, lifecycle/recovery consumers EVAL, все callers journal resolver,
обычная/supplemental Judge evidence projection, shared/legacy/vNext Git canon,
materialization/admission, production receipt producer и acceptance fixtures.
Это аудит данных классов проблем по всей связанной поверхности, не заявление об
отсутствии любых иных ошибок во всех репозиториях.

| ID | Установленный дефект | Статус относительно CP198 | Исправление |
| --- | --- | --- | --- |
| P1 | Новый frozen profile и старый policy не имеют явного scoped согласования | Первичная причина | Раздел 4 |
| P2 | Delivery/cleanup не доступны ранним Stage; external accepted decisions не доходят до Work | Подтверждённый родственный путь | Раздел 4 |
| P3 | Common/legacy Git prose смешивает local handoff с доказанной local target integration | Подтверждённая неоднозначность инструкций | Раздел 5 |
| P4 | EVAL admission принимает только project-execution@2, FLOW поддерживает @2/@3 | Новый дефект совместимости | Раздел 5 |
| E1 | Failed-check checker определяет применимость по наличию capture: открывает нерелевантный snapshot, но пропускает достигнутый gate без snapshot | Ложный evidence error CP198 и новый обратный дефект | Раздел 6 |
| E2 | FLOW пишет global recovery, EVAL acceptance требует execution-owned path | Подтверждённый producer/consumer mismatch | Раздел 6 |
| E3 | Supplemental Judge допускает только `/boundaries/` для всех snapshots | Новый родственный ownership mismatch | Раздел 6 |
| E4 | Nested `details.cause` repair rejection теряет настоящие failed gate receipts | Новый родственный дефект | Раздел 7 |
| E5 | Receipt index синтезирует короткий aggregate ID вместо native RUN/RCP | Новый дефект CODE/CODE-REVIEW acceptance | Раздел 7 |
| E6 | Readiness check receipts в `05-code/readiness/checks` не индексируются и их wrapper не распознаётся | Новый дефект полноты failed-check diagnostics | Раздел 7 |
| E7 | Применимый gate с одними aborted receipts возвращает not_applicable | Подтверждено при проверке готовности, не причина CP198 | Раздел 7 |
| O1 | При canonical inventory без controller синтезируется missing legacy journal | Ложный пробел CP198 | Раздел 8 |
| O2 | Expected model Sessions берутся только из controllers, не canonical sources | Новый дефект полноты model evidence | Раздел 8 |
| J1 | `unexpected_hitl` и `required_hitl_missing` автоматически означают `subject` | Ошибочная причинная атрибуция | Раздел 9 |
| J2 | Recovery history есть в report, но нет в обычном Final Judge packet | Новый родственный дефект | Раздел 9 |
| T1 | Happy-path тесты обходят противоречивые policy, namespace IDs и ownership | Общая причина пропуска регрессий | Раздел 11 |

Связанный обязательный edge case, **не существующая exploit-находка**: после
доставки external accepted decisions в Work новый consumed input должен войти
в immutable reviewer input hashes. Сейчас Work этот input вообще не получает.

Не объявляем дефектами: capacity incident с четвёртым spawn был восстановлен,
две волны reviewer Work завершились; generic `dependency_unblocked` не доказывает
жёстких зависимостей между группами; отдельные исправленные shell/read ошибки не
были terminal cause. Cache acceptance уже пересчитывает content и проверяет hash;
нет доказательства бесконтрольного reuse. Не переписывать эти механизмы целиком.

## 4. Общий operational contract: полномочия, freeze, доставка

Точки: FLOW `src/services/runs.ts:216–232,415–440`,
`vnext-execution-profile.ts:24–44`, `stage-context.ts:28,92–112`,
`work-registry.ts:771–843,1037–1079`; EVAL `lib/entry-pack.mjs`,
`lib/runner.mjs:240–299` и подготовка managed RUN.

### 4.1. Authority до freeze

1. Оставить existing RUN execution profile источником frozen operational
   settings. Не создавать второй профиль или policy engine.
2. Сохранить в существующих RUN/context receipts **явное принятое operational
   решение** и его связь с profile: decision ID, источник/authority, точный
   project/RUN/EVAL scope, source revision/hash, выбранные local delivery и
   source retention. Reason/owner/review date нужны для retention exception,
   когда этого требует исходная policy (как в CP198), не для любого `retain`.
   Profile checksum доказывает байты, но не право отменить policy.
3. Для EVAL описать решение в публичном operational контексте launch definition,
   отдельно от product SPECIFY package. Автор definition задаёт scope/причину/
   владельца/правило даты; caller принимает этот заявленный режим при запуске.
   RUN/EVAL ID и абсолютные пути материализуются детерминированно. Нельзя
   генерировать вымышленное пользовательское согласие, владельца или исключение
   по одному обнаружению `local/retain`.
4. Исключение распространяется только на delivery/retention ресурсов данного
   запуска: local target integration без remote publication; сохранение source
   для evidence/recovery с явно заданной датой пересмотра, если policy требует
   её. Дата пересмотра — не автоматический срок прекращения разрешения.
   Исключение не отменяет branch
   protection, dirty/unmerged guard, force/tag immutability, auth или чужие
   retention/deploy правила. Remote delivery не реализовать: FLOW сейчас
   поддерживает только `local`.
5. Для **заявленного override/exception** при отсутствующем/невалидном authority,
   конфликте settings/decision, выходе за scope либо явном expiration/revocation
   preflight не делает model call и выдаёт понятную диагностику. Обычные
   непротиворечивые project defaults не требуют нового отдельного approval.
   Наступление review date означает необходимость пересмотра, **не**
   автоматическое удаление, отказ запуска или изменение frozen RUN: hard expiry
   применяется только если сама принятая policy явно задаёт его. Нельзя добавить
   этот запрет как новое неоговорённое требование. Operational решение после freeze
   в этой реализации не rebinding на месте: изменённый scope требует новой
   штатной подготовки RUN, не ручного изменения run.json. Не обещать отсутствующий
   сейчас API для operational amendments.
6. Для обычного проекта без scoped решения действуют его defaults. EVAL-specific
   обходы по имени case/harness запрещены. Произвольный Markdown policy не
   парсить как машинный ACL: детерминированно проверять только typed settings,
   decision binding и declared exception; не обещать доказать отсутствие любого
   семантического противоречия в prose.

Конкретный вход: optional typed `operational_decision` в existing project
execution → frozen RUN profile path. Он содержит exact выбранные settings,
scope, declared exception и policy source path/hash/clause reference; остальные
поля из пунктов выше обязательны лишь согласно этому exception. Декларация
публична в launch definition, её acceptance связывается с actual caller launch,
а preflight сам не создаёт acceptance. В `prepareFlowRunStart` /
`snapshotVnextExecutionProfile` (`runs.ts:272,415–433`) проверить draft без
побочных эффектов. **RUN ID там ещё отсутствует**: его выделяет `startFlowRun`
после registerProject (`runs.ts:290–295`). Final scope binding выполняется после
выделения ID в существующей транзакции создания RUN, до Stage/provider/workspace
effects; повторный launch request использует существующую idempotency boundary,
не создаёт второй accepted decision. Между prepare и publication повторно
проверить исходные bytes/hash: разрешение не должно относиться к иному профилю.

Минимальные typed поля decision: contract/version, decision ID, declared logical
scope, exact delivery/cleanup settings, source policy path/hash/clause references,
acceptance source; reason/owner/review_at только если exception требует их.
Не добавлять permissions для операций, которые здесь не поддерживаются.
Динамические EVAL/execution/PRJ/RUN IDs и physical locators — отдельная final
binding принятой декларации, а не изменение её author-authored bytes.

Конкретная проверка поддержки: pure validator и version export
`RUN_OPERATIONAL_DECISION_CONTRACT = "run-operational-decision@1"` в existing
`vnext-execution-profile.ts`. EVAL вызывает validator из **проверенного выбранного
engine artifact** тем же bounded loading подходом, что capacity/native contracts;
не импортирует active source checkout или произвольный модуль из profile.
Definition с decision нельзя исполнить старым engine без contract marker,
который её молча игнорирует: unsupported → typed preflight failure без provider.
Обычные @2/@3 profiles без decision остаются совместимыми.

Это одна addition к существующему profile contract, не второй decision store.
`accepted_decisions` (strings или `{id, statement}`) остаётся model-facing
projection, не security grant. Actual Work получает frozen RUN decision
ID/hash/statement и его retained source, а не изменяемый project-execution file.
При stage-entry import и recovery решение сохраняется только при соответствующем
**логическом scope**. Обычная relocation того же RUN в новые physical paths
допустима через существующий validated import/path_mapping receipt. Это не
разрешение другому EVAL или проекту. Новый logical execution/stage-focused импорт
получает новую acceptance binding до первого provider call либо понятный reject,
а не тупиковую инструкцию «scope changed» без штатного пути подготовки.
Recovery в том же logical scope не re-approves исходное решение.
Источник полномочия должен существовать до первой Subject Stage.

### 4.2. Один renderer для Stage и Work

1. Использовать `acceptedDecisionPrecedence` и existing stage-context renderer.
   Дополнить их одним operational block: effective settings, source path/hash,
   authority/scope, что означает completion, что не разрешено.
2. Передавать блок от SPECIFY/PROTOCOLIZE через PLAN/PLAN-REVIEW/CODE/
   CODE-REVIEW/MERGE; ранний Stage не должен спрашивать о уже принятом выборе.
   `frozen_git_policy` PROTOCOLIZE сейчас содержит routing, но не delivery/
   cleanup: его projection привести к тому же источнику, не добавлять отдельно
   придуманные defaults.
3. Общий `renderWorkerPrompt` получает retained accepted context своего Stage
   и relevant accepted RUN decisions, а не перечитывает изменяемый project file
   как authority. Native/external reviewer, implementation и repair получают
   одинаковую policy-семантику; различаться могут лишь transport/cwd instructions.
4. Добавить newly consumed context/decision artifacts в `ReviewInput.run_inputs`
   и existing immutable controller/context digest. Соседи используют один
   исходный digest; external read-only workspace mapping не теряет references.
   Drift до launch/во время review блокирует; recovery не меняет decision bytes
   незаметно. Не хэшировать весь repository или service homes.
   Не хэшировать mutable `run.json` целиком: Stage/status/timing меняются штатно.
   Retained `<RUN>/operational-contract.json` — однократно опубликованная
   минимальная projection frozen execution_profile, а не второй decision store.
   В ней нет auth/provider home contents; authoritative digest связать с existing
   RUN index. Изменение profile source после freeze не меняет принятый RUN.
5. Empty legacy context остаётся read-compatible, но не создаёт разрешения.

Обязательный relocation edge case: `eval-snapshots.ts:527–552` rebases database
locators, но imported context/prompt/result bytes сохраняет историческими.
Решение/policy source bytes остаются неизменными; разрешённые текущие пути
добавляются отдельной derived projection через validated path mapping. Renderer
даёт агенту **существующий текущий полный путь**, original path — provenance-only.
Hash новой projection связан с original hash + import binding; integrity не
ломается от relocation и не ослабляется от подмены содержимого.

Приёмка: на материале CP198 одинаковый accepted local/retain блок виден в
production-generated coordinator и leaf packets, review не требует повторить
этот уже принятый выбор. Без accepted exception противоречие остаётся видимым и
может законно требовать HITL. Fixture `plan-review: forbidden` не ослаблять.

## 5. Канон, overlay и profile admission

Канон: `.memory-bank/dd-flow/common/git-ops.md:24–35,242–249`,
`mb-sdlc/merge/integrate.md:85,112–122,153–169`, `merge/job.md:65–74,143`,
`mb-sdlc/plan-aspects/aspects/git_delivery_contour_review.md:19–23`,
`vnext/merge.md:68–72`. FLOW: `vnext-merge.ts:384`.

1. В общем Git contract разделить три факта: target integration, remote
   publication, resource cleanup. Local **доказанный target commit** может
   завершить vNext local integration; это не push/deploy/release и не равно
   legacy `local_only` handoff/dirty feature-only result.
2. Legacy strategy names и verdict expectations не массово переименовывать.
   Уточнить применимость общей инструкции к legacy/vNext; route/target result
   commit evidence остаётся обязательным. References из aspect/merge siblings
   ведут к общей precedence rule, без копий независимых policy.
3. Cleanup defaults остаются, если scoped retain decision отсутствует. Указанное
   исключение не распространяется на все ветки/все worktree проекта. `retain`
   результата и physical provider/process cleanup EVAL — разные вещи.
4. Новая версия канона → flow-pack с точным source commit/hash → новая EVAL
   definition. Overlay продолжает сохранять product-policy/source baseline;
   его противоречие решает открытый scoped operational contract, не скрытая
   замена продукта. Проверить included_files/version/pack checksums.
5. Убрать admission drift `assertProjectFlowPack` (@2-only), согласовать с
   выбранным FLOW, который поддерживает @2/@3. Использовать его реальный
   structural validator/существующий engine validation entrypoint; если чистый
   validator не экспортирован, выделить его из loader один раз, не копировать
   набор enums в EVAL. @3 требует execution routing; unknown schema не принимается.
   Static definition validation и engine-dependent materialized preflight
   имеют разные роли; validation не должен стартовать provider или mutating RUN.

Тесты: @2 compatible, valid @3 pass, @3 без routing reject, unknown schema reject;
local integrated commit ≠ remote delivered; dirty/unmerged output ≠ merged;
retain только owned scope; absent authority сохраняет conflict. Проверять
generated packet/materialized project, а не только наличие файлов в manifest.

## 6. Recovery evidence: применимость и один ownership contract

EVAL: `case-acceptance.mjs:161–174,308–352`, `runner.mjs:48–51,1825–1851`,
managed launch/control/reconcile/recovery callers, `judge-supplement.mjs:107–138`.
FLOW: `run-control-worker.ts:282–287`, `runtime-scope-control.ts` target context
switch, `run-recovery.ts` / существующий sealed snapshot verifier.

### 6.1. Сначала applicability

Определять наличие достигнутого failed check из bounded typed error chain и
retained failures **до** realpath/open recovery. При `unexpected_hitl` CP198 и
прочих failures без check receipts — `not_applicable`, без попытки открыть даже
недоступный capture. Primary outcome/error сохраняется. Скопированный manifest
locator/hash не называть verified evidence, если checker capture не потреблял.

Если check applicability доказана, но capture/receipt отсутствует или повреждён,
результат `unavailable` с точной причиной; не `passed` и не product failure.
Фактически failed native check и unavailable proof — разные состояния.
В частности, убрать зависимость самого входа в failed-check branch от наличия
`recovery.manifest_sha256`: сейчас reached `code_gate_failed` без capture ошибочно
возвращает `not_applicable`. Selection обязана выполняться и для этого случая.

### 6.2. Новый EVAL-owned recovery root

Выбран минимальный вариант: один absolute recovery root внутри **EVAL root**, вне
`dd-flow-home`/snapshot runtime, frozen в manifest: `<EVAL>/recovery`.
FLOW сохраняет существующие runtime-hash/PRJ/RUN/RCV подкаталоги и global default
для самостоятельных проектов. EVAL acceptance не требует искусственно
`executions/<id>/...`, а проверяет EVAL-owned root **и точную execution binding**.

Ввести env через существующие `runtimeEnv`/`evalRuntimeEnv` и retained manifests,
проследить launch, RUN stop/pause, EVAL scope control, reconcile, observer
replacement, capture retry и explicit recovery. Нельзя выбрать root как
`parent(runtimeRoot)/recovery`: scope control работает через `control-runtime`,
а FLOW переключает DD_FLOW_HOME, сохраняя остальное env. Такое исправление снова
разведёт producers/consumers. Resource/auth homes не копировать.

Конкретный manifest input для новых запусков: `runtime_recovery_home`, absolute
owned path, frozen до создания Subject runtime. Он имеет приоритет над ambient
`process.env.DD_FLOW_RECOVERY_HOME` и произвольным `extra` в env helpers; operator
не должен менять placement повторным запуском observer с другим окружением.
Не задавать этот root по умолчанию standalone FLOW/reference tooling, не имеющим
EVAL manifest. Исторический manifest без поля не переписывать при чтении; его
published capture оценивается по legacy binding. Existing scope-control projection
при target context switch сохраняет именно frozen EVAL root.

Consumer проверяет: actual realpath containment/no symlink traversal; exact
EVAL execution → project/runtime/RUN identity; control/recovery ID, generation,
settled sealed binding; snapshot schema/purpose/recovery consistency;
manifest SHA и workspace/runtime tree hashes. Эти проверки не заменяются одной
проверкой расположения файла. Чужой RUN даже под owned recovery root отвергается.

Разделить **публикацию/productive recovery** и **чтение frozen evidence**. Для
первого нужны live current/sealed generation fences. Для второго authority —
retained capture publication receipt и его первоначальная execution/control/
generation binding: после законного resume live guard уже recovered/resuming,
а позднее может появиться новая generation. Историческое чтение не требует,
чтобы старый control до сих пор был current/sealed, и не даёт права возобновить
устаревший control. Snapshot consistency/hash сохраняются обязательными.

### 6.3. Общие consumers и история

Один bounded snapshot/source resolver для acceptance и supplemental consumers,
на основе существующих verifiers. Candidate по-прежнему обязан быть final
candidate boundary. Recovery — иной typed purpose, допускаемый только с exact
binding. Не проверять тип snapshot подстрокой `/boundaries/` во всех путях.

Supplemental Judge может принять recovery evidence успешного recovered candidate,
сохранив immutable path-mapped copy/hashes и no auth/runtime-home cloning guards.
Failed-only supplemental target в этой задаче не расширяется.

Определить snapshots по typed полям frozen candidate/execution recovery и
publication receipts, не recursive поиском любой пары `snapshot/manifest_sha256`
в произвольном текстовом evidence. Один locator с противоречащими digest/purpose
отвергается, а не last-write-wins. Проверка contained directory сама по себе не
даёт права клонировать всё дерево: копируется только утверждённый snapshot
payload/source selection без внешних symlink targets/auth homes. Historical
global snapshot получает безопасный owned destination по exact bound identity,
не `path.relative(evalRoot, externalSnapshot)` с `..`. Исходные bytes/verdict
не меняются; это отдельный output вне historical EVAL по existing supplement API.

Historical global capture не переносить и не переписывать. Для read-only derived
diagnostic допустим только exact previously published sealed capture с доказанным
original execution/control binding; никакого обхода glob по global home или
общего allowlist любых внешних paths. Если исторической authority недостаточно,
явно `unavailable`, а не новое полномочие. Для CP198 failed-check не применим,
поэтому его исправленная диагностика не должна открывать global capture вообще.

Приёмка: direct RUN и EVAL-scope stop создают captures под одним frozen root;
два executions не смешиваются; repeated capture/status не создаёт дублей;
wrong RUN/generation/hash/purpose/symlink/escape → typed rejection. Ни один тест
не resume/restart исторический Subject.
Дополнительный тест: capture → authorized resume → successful candidate →
supplemental preparation, затем тот же read-only consumer после следующей
recovery generation. Старое valid evidence читается, stale mutation запрещена.

## 7. Native checks: namespaces, wrappers и readiness

### 7.1. Exact IDs вместо угадывания по directory

`case-acceptance.mjs:638–662 finalReceiptIndex` синтезирует bare aggregate RCP ID.
`src/services/code-checks.ts:392` выдаёт `${workId ?? runId}/${localId}`.
Current CODE/CODE-REVIEW aggregate failed receipts поэтому не находятся.
Current fresh MERGE обычно uses executor Work ID и уже совпадает: **не утверждаем,
что любой новый MERGE ломается**. Проблема затрагивает @2/@3 index и retained/
reused RUN-qualified refs; @1 имеет отдельный старый contract.

Исправление: bounded scan frozen known check directories читает regular
receipt.json и индексирует exact validated `receipt.id`. Namespace/local ID,
project/RUN/work/scope/gate/path сверяются с производящим contract. `scope=aggregate`
сам по себе не означает namespace RUN: MERGE executor может быть WRK.
Не обрезать namespace, не создавать aliases `RCP↔RUN/RCP`. Duplicate/foreign IDs
и несовместимый path/type — evidence error. Все acceptance callers используют
один исправленный index. Supported historical bare IDs — только в явно
поддержанном старом schema/receipt contract, не silent normalization нового.

Не требовать несуществующих полей: production `CheckReceipt` содержит `local_id`,
`work_id`, `scope`, `gate`, но не `project_id/run_id/schema_id` в самом JSON.
PRJ/RUN binding доказывается snapshot manifest + retained runtime authority и
known owned directory/namespace, не вымышленными обязательными receipt fields.
Absolute `receipt_path/stdout_path` — historical locators; в captured tree читать
owned relative equivalents по проверенному mapping, не live files по этим путям.

### 7.2. Error wrappers

FLOW `registerAggregateCodeRepair` (`vnext-code.ts:412–425`) сохраняет failures
на outer details, а gate cause в `details.cause`. Текущий checker этот путь не
обходит, а просто перейти в cause тоже недостаточно: там нет массива failures.

Использовать существующее bounded error-chain convention (`operation-errors.mjs`,
`classifyInterruption`), свести selection применимости в одно место. Gate cause и
wrapper receipts сохраняют связанность: брать failures enclosing gate rejection,
не произвольный соседний массив. Outer primary error/attribution не менять на
gate code ради удобства. Проверять cycles/depth/ambiguous branches; неизвестная
форма означает unproven/unavailable, не догадку о продуктовой причине.

Gate code без массива/identity evidence — reached-but-unproven `unavailable`,
не отсутствие применимости. Выбор противоречащих веток error graph отклонять:
нельзя склеить gate одной Work и failures другой Work. Existing outer primary
code, details и cause не теряются при projection.

### 7.3. Readiness

`ensureCodeWorkspaceReady` (`vnext-code.ts:814–844`) пишет aggregate receipts в
`05-code/readiness/checks`; `workspace_readiness_failed` несёт `details.checks`
с id/status/receipt_path, а не `details.failures`. Текущий index и selection их
пропускают. Добавить этот **конкретный production path** и typed readiness wrapper.

Если readiness запустил checks и они failed/aborted, checker читает exact full
native receipts из frozen snapshot, сверяет wrapper ID/status/path; отсутствующий
input_hash в кратком wrapper не означает, что его можно выдумать. Complete native
receipt проходит те же integrity проверки. Bootstrap failure без check receipts
остаётся `not_applicable` для failed-check acceptance, но не исчезает из primary
readiness diagnostics/Judge evidence. Readiness failure не final MERGE acceptance.

### 7.4. Failed/aborted и итог checker

Дополнительно подтверждён `E7`: `failedCheckEvidence` сейчас возвращает
`not_applicable`, если все валидные retained receipts имеют `status=aborted`
(`case-acceptance.mjs:348`). Но gate применим и проверка не завершена успешно.
Для нового checker:

- `not_applicable`: действительно нет достигнутого check gate;
- `unavailable`: gate достигнут, но proof отсутствует/неподтверждён/невалиден;
- `failed`: exact evidence доказывает non-passing gate (`failed` или settled
  `aborted`); native status и aborted reason сохраняются отдельно;
- `passed`: только полная успешная final candidate acceptance, не промежуточный
  readiness или failed-check diagnostic.

`failed` здесь означает неуспешную проверку/приёмку, **не причинный verdict о
продукте**. Обязательные outputs после aborted check не называть дефектом продукта:
это unfulfilled check evidence, оценку причины оставляем Judge. Running/unsettled
receipt не становится terminal aborted лишь по истечении времени.

Тесты: RUN/RCP CODE и CODE-REVIEW, WRK/RCP CODE/MERGE, wrapped repair registration
rejection, readiness check failure vs bootstrap-only, retry/reuse predecessor,
duplicate/foreign/malformed ID, wrong gate/path, actual missing artifact,
claimed artifact corruption, zero-exit contract violation. Current artificial
bare `RCP-001` fixtures не должны подменять современные production receipts.

## 8. Journals/model coverage

`runner.mjs:1540–1623 resolveEvidenceJournals` используется attach/finalization/
Judge/status и failure path. Исправлять там, не в каждом отчёте отдельно.

1. Canonical inventory — authority перечисления источников. При его наличии не
   выдумывать `drivers/subject.events.jsonl` из attempt лишь потому, что controller
   отсутствует. Explicit legacy fallback оставить только в поддержанном legacy
   contract без canonical inventory/controller authority.
2. Malformed/unknown canonical inventory не переключает resolver незаметно в
   guessed legacy paths. Публикуется typed unavailable/incomplete diagnostic;
   valid current/inherited sources дедуплицируются с provenance.
3. Expected model Sessions derive из canonical `sources[].session.session_id`
   плюс согласованных retained controller IDs. Tool counters и model coverage
   независимы. Один observed session + один published missing expected session
   не дают полного model observation. Optional non-asserting locator не становится
   обязательной Session, неизвестная модель не приравнивается requested model.
   Expected identity передавать как `{harness, session_id}`, если harness известен:
   existing `modelAttribution` уже поддерживает это; одинаковый ID другой упряжки
   не закрывает missing Session. Не добавлять второй attribution reducer.
4. Сохранить realpath/root/symlink checks; genuine missing journal не скрывать.
   Сохранить validated last-observed controller scope при exception из
   `answerFor` и `onEvent` в shared `managed-flow-client.mjs`: сейчас callbacks
   могут бросить bare failure до возврата `observeManagedRun`, поэтому поздний
   `onProgress({driver: observed})` в runner не срабатывает. Выбран bounded error
   enrichment в shared observer: last-validated status сохраняется до callback,
   при exception добавляется только отсутствующая scope evidence с cursor и
   last-observed provenance; existing error/details.controller не перетираются.
   Новый callback API или второй journal/store для этого не нужны.
   Не заменять original code/details/cause и не скрывать callback error новым
   failure чтения status. Last-observed scope — evidence с cursor, **не live
   current authority** и не разрешение на продолжение.

Тесты: canonical inventory + attempt + no controller (CP198), malformed inventory,
legacy-only compatibility, inherited/current deduplication, one known/one missing
Session, missing model sidecar, complete tool counters при неполном model evidence,
escape/symlink negatives. Проверить тот же projection через status и finalization.

## 9. Outcome, attribution и Judge history

1. `failureAttribution` (`runner.mjs:1946–1955`): `unexpected_hitl` и
   `required_hitl_missing` по коду alone → `undetermined`. Это нарушения fixture
   expectation, а не доказательство виновности Subject. Сохранять reached Stage,
   exact question, supplied product package, operational authority/scope,
   accepted decision refs и blocker error. Direct infrastructure failures не
   переклассифицировать; неизвестное не превращать автоматически в infrastructure.
2. Judge оценивает причинность по evidence. Формулировка «лишний вопрос» не заменяет
   проверки противоречия инструкций. Outcome failed может соседствовать с
   undetermined cause и корректным поведением агента при несогласованных inputs.
3. `recoveryHistory` (`runner.mjs:1969–2002`) уже SSOT. `buildEvidencePacket`
   (`1960–1967`) должен получать **тот же frozen event revision** и projection
   истории, что report, а `performFinalJudge` (`2182`) — actual packet с ней.
   Не строить второй reducer. Добавить в evidence schema history/reliability/
   recovery count, обновить все callers/tests и consumers.
4. Historical evidence@1 читать как исторический пакет без гарантированной history,
   не вычислять `uninterrupted` из её отсутствия. Версионировать несовместимый
   contract; additive расширение проверять на actual schema validator (там
   additionalProperties=false). Latest cumulative RUN usage — единственный
   measurement; snapshots не суммировать. Unreached stages не failed checks.
5. Acceptance immutable cache уже пересчитывает текущий результат. Изменённый
   checker/projection имеет новую versioned derived identity (policy/checker,
   outcome/applicability binding, checkpoint/event revision), а не перезаписывает
   прежнюю receipt под прежним key. Не включать Git tree всего repo и не делать
   новый универсальный cache. Candidate/verdict/evidence SHA сохраняются; original
   Judge receipt не менять. При отдельной повторной оценке — existing supplemental
   mechanism, не новый Subject execution и не автоматический запуск модели.

Регрессии: forbidden question при conflicting input; required HITL уже снят
пакетом; known infra остаётся infra; failure→authorized recovery→candidate-ready
имеет одинаковую report/Judge history, нет double-count usage; repeated finalization
идемпотентна; changed derived checker не corrupts original history.

### 9.1. Конкретная миграция контрактов и публикации

Новая definition выбирает `task-priority@4` для исправленной acceptance semantics;
новый actual Judge packet — `dd-eval/evaluator-evidence@2`. Old contracts остаются
readable. Это необходимые версии имеющихся контрактов, не новая система.

До переключения case проверить **все** production version branches:

- `validateCaseAcceptancePolicy`, `checkCaseAcceptance` dispatch/generated matrix
  handling (`case-acceptance.mjs:70–77,162`), `schemas/case.v7.schema.json`;
- recovery checkpoint selection/cache (`runner.mjs:1412`),
  verification-matrix source projection (`runner.mjs:1921`);
- `assertVerificationMatrixQualification` (`engine-admission.mjs:42`) и
  `bin/qualify-verification-matrix.mjs`. @4 **сохраняет** matrix/final-coverage
  qualification gate @3, а не обходит его из-за comparison с одной строкой;
- evidence schemas, Final Judge/supplement validators и fixtures/consumers.

Общие predicates для generated-matrix/new acceptance capabilities вывести из
существующего acceptance contract, не разносить новые строковые comparisons
по файлам. Сам qualification receipt матрицы меняется только при изменении его
семантики; версия checker не требует автоматически придумывать ещё одну версию
этой receipt. Новая engine/canon tuple требует offline exact-artifact proof,
не полной живой квалификации Judge по несвязанным изменениям.

New acceptance key: checker/contract + policy digest + execution/outcome +
selected gate/receipt binding + selected checkpoint digest (либо explicit absence).
Не включать весь events.jsonl: Judge/cleanup append не должен создавать новую
acceptance. Consumed sources содержат явный candidate/recovery selector и binding;
`executionEvidence` не угадывает root через `candidate ?? recovery`. @4 projection
не теряет qualified receipt refs и matrix sources. Другая derived diagnostic
получает отдельную identity; старый immutable file остаётся byte-identical.
Исторический status не должен запускать новую acceptance/Judge под старым key.
Совместимые index fixes остаются общими, но новую статусную семантику не применять
ретроактивно под прежним checker identifier.

В `finalizeRunProjection` уже есть candidate/result revision fences. На них
заморозить **subject execution event cut** (ordered event IDs/hash) и передать
один и тот же history input в ordinary Final Judge и report. Проверить late
capture enrichment/concurrent recovery: изменившийся result/history revision
отклоняет stale publication или образует штатную новую candidate revision.
Не держать filesystem/SQLite lock во время model call. Judge/cleanup events
после cut не меняют историю Subject. History отсутствие ≠ uninterrupted:
при недоступном prefix явно unknown/incomplete coverage, без вымышленного zero
recovery count как доказательства. Сохранённый оригинальный Judge packet@1
переиспользуется со своим evidence SHA, не перезаписывается в @2 на месте.

Operational decision и runtime IDs передаются через frozen RUN operational
projection, **не дописываются** в продуктовый canonical response или corpus
semantic context для получения нового Judge qualification key. Если реальные
Judge inputs действительно изменились, dependency-based qualification должна
это учитывать; нельзя просто сохранить старый key. Тест отдельно доказывает,
что change subject engine/operational packet при неизменном Judge input не
запускает live corpus заново.

## 10. Порядок реализации и зависимости

- [x] R1: сначала red regressions на реальные CP198 policy/evidence и production
  receipt shapes; сохранить только необходимые публичные sanitized inputs, без
  auth/native transcripts целиком и без ссылок на локальные temp homes в tests.
- [x] R2: FLOW typed scope/authority binding + frozen operational projection +
  common Stage/Work renderer + review input integrity. Обычные @2 flows compatible.
- [x] R3: чистый canon common Git semantics/precedence, siblings references;
  новый pack. Product baseline/source unchanged.
- [x] R4: EVAL operational definition/context materialization, structural @2/@3
  admission и новый checker @4; проверить соответствие exact FLOW artifact,
  не ветке по имени. Draft/no-effect и final RUN binding проверить раздельно.
- [x] R5: один EVAL-owned recovery-root contract, env всех control paths, общий
  typed source resolver; applicability, exact receipt index/wrappers/readiness.
- [x] R6: journal/model expectations, attribution, report/Judge history/schema и
  versioned derived identities (@4 acceptance, evidence@2); обновить все version
  predicates/qualification guards. Supplemental projection использует R5.
- [x] R7: paired producer/consumer tests, targeted integration и required release
  gates, code review. Обновить execute/monitor runbooks новыми scope/evidence fields.
- [x] R8a: коммиты/push/PR по [git workflow](../runbooks/git-workflow.md),
  verified immutable engine/canon/definition tuple и implementation report.
- [ ] R8b: merge подготовленных PR после review и финальных gates. Пользователь
  разрешил интеграцию через PR; main напрямую не меняется. Canon/pack уже
  интегрированы; FLOW/EVAL ожидают завершения review.
- [ ] R9: **отдельно разрешённая** живая приёмка нового E2E после R8; ни один старый
  EVAL не трогать. Этот planning turn R9 не выполняет и не запускает heartbeat.

R2/R3/R4 — первичная policy цепочка; R5/R6 — достоверность diagnostics. Независимые
части можно реализовать параллельно, но согласование contracts и совместная
приёмка обязательны. Нельзя объявить всё готовым по отдельным зелёным unit suites.

## 11. Проверки и готовность к реализации

Расширить существующие test files, не создавать отдельный framework:

- FLOW: `test/stage-context.test.ts`, common Work/reviewer tests,
  `test/run-controller-full-cycle.test.ts`, controller capture/recovery,
  MERGE/read-only input tests. Production packet renderer должен использоваться
  в тесте: fixture с одной строкой «use assigned packet» не проверяет policy.
- EVAL: `test/entry-pack.test.mjs`, `canonical-source-preparation.test.mjs`,
  `canonical-managed.test.mjs`, `case-acceptance.test.mjs`,
  `model-observations.test.mjs`, `evidence-schema.test.mjs`, `eval.test.mjs`,
  `runner-recovery.test.mjs`, `recovery-safety.test.mjs`, `judge-supplement.test.mjs`.

Prerequisites: отдельные implementation checkouts с зависимостями из lockfile:
`npm ci` для dd-eval (`package-lock.json`), `pnpm install --frozen-lockfile`
для FLOW. Для совместной проверки нужен Node >=26; FLOW требует pnpm >=10
(версию брать из `packageManager`). Не считать отсутствие зависимостей падением
контрактного теста и не устанавливать их в чужой рабочий checkout.

Runnable targeted EVAL gate (из dd-eval checkout):

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/dd-flow-cli node --test test/entry-pack.test.mjs test/canonical-source-preparation.test.mjs test/canonical-managed.test.mjs test/case-acceptance.test.mjs test/model-observations.test.mjs test/evidence-schema.test.mjs test/eval.test.mjs test/runner-recovery.test.mjs test/recovery-safety.test.mjs test/judge-supplement.test.mjs
```

FLOW: `pnpm typecheck`, `pnpm lint`, build с явным clean canon checkout:
`DD_MEMORYBANK="$CANON_ROOT" DD_FLOW_BUILD_CANON_ROOT="$CANON_ROOT" DD_FLOW_BUILD_STRICT_CANON=1 pnpm build`.
`CANON_ROOT` — выбранный чистый canon revision, а не dirty dd-memorybank по
умолчанию. Затем targeted Vitest suites в соответствующих projects и полные
release gates по [test-suite runbook](../runbooks/flow-test-suite-verification.md).
Не считать aborted/full-suite зависание PASS; фиксировать failed/skipped/elapsed.
Проверить exact installed candidate и adapter metadata после publish. Изменение
subject operational prompting не является изменением Judge model/oracle и не
требует само по себе повторить всю живую Judge qualification. При настоящем
изменении её входов применять существующую dependency-based qualification policy.

Cross-boundary regressions:

| Сценарий | Должно быть |
| --- | --- |
| CP198 policy + explicitly accepted scoped local/retain | Общий packet непротиворечив; no repeated authorization question |
| Те же settings без authority | Conflict виден; no inferred waiver/no remote mutation |
| Обычные @2/@3 defaults, retain без declared exception | Нет нового approval/обязательной даты; прежнее поведение |
| Изменение project/RUN/EVAL scope при import/recovery | Старое решение не становится grant новому scope |
| Context drift, sibling/recovery generation | Rejection, authority не меняется скрыто |
| HITL fail + unavailable/global capture | Failed-check not_applicable, primary HITL сохранён |
| Proven aggregate/readiness gate failure | Native qualified receipts найдены, exact evidence validated |
| Forged scope/receipt/artifact/snapshot | Unavailable/rejection, не product failed-check claim |
| Direct RUN stop и EVAL scope stop | Один frozen owned recovery root, exact execution binding |
| Successful recovered candidate + supplemental Judge | Candidate и recovery purpose различены, originals unchanged |
| Canonical journals без controller | Только published sources, no invented legacy journal |
| Одна missing expected model Session | Incomplete model coverage независимо от tool counters |
| Recovered Final Judge packet | Та же history, что report; cumulative usage не суммируется |
| Валидные receipts только aborted | Применимый non-passing gate, native aborted сохранён, не not_applicable |
| @4 acceptance при missing matrix qualification | Preflight reject, новый checker не обходит обязательный gate |
| Ambient recovery env меняется после launch | Placement остаётся frozen, исторический manifest не правится |
| Relocation same logical RUN | Пути валидны, authority/байты source неизменны; другой EVAL не наследует grant |
| Одинаковый session_id другой упряжки | Не закрывает missing expected harness/session identity |

Детерминированные тесты доказывают binding/projection/control behavior, **не**
то, что любая модель никогда не задаст ошибочный вопрос. После отдельного запуска
живая приёмка требует actual Stage timeline до MERGE, real local target commit,
retained source согласно scope, physical cleanup settled, complete bound final
acceptance/Judge evidence. Не скрывать новый обоснованный HITL ради completion.
Shared packet контракт проверять во всех routing вариантах; живые harness runs
выполнять только по отдельной команде и после проверки доступности, не исходя
из старого состояния квоты Grok.

Уже выполненные проверки в ходе **аудита, до исправлений**: targeted
`case-acceptance`, `model-observations`, `canonical-source-preparation` —
**13/13 PASS, 0 skips** на текущем FLOW source. Их зелёный статус при перечисленных
проблемах подтверждает пробел coverage, а не готовность реализации. Основной
агент перепроверил code paths и CP198 policy/HITL/report; read-only probes на
реальном evidence подтвердили false legacy journal и acceptance ownership error.
Дополнительный чистый probe без filesystem accesses подтвердил: reached
`code_gate_failed` без capture → ошибочно `not_applicable`; оба HITL codes →
`subject`. FLOW main и CP198 source имеют одинаковый Git tree
`7627ebd7a30538a932b14280e123189bf05fdcef`.

При повторной проверке `entry-pack` + `evidence-schema` дали **22/22 PASS,
0 skips** в основном dd-eval checkout того же commit, с существующими
зависимостями. Первая попытка в docs-worktree завершилась `ERR_MODULE_NOT_FOUND`
для `ajv`: там зависимости не установлены. Это ограничение окружения, а не
PASS schema-теста; именно поэтому prerequisites выше обязательны. Установка
зависимостей, изменение runtime и проверка будущих исправлений не выполнялись.

## 12. Ponytail review

План проверен по ponytail. Выбран минимальный системный путь:

- reuse frozen profile + accepted context + common renderers, не новый policy engine;
- reuse review run_inputs hashes, не whole-repository/home immutability;
- один owned recovery root и общий bounded verifier, не consumer-specific exceptions;
- exact native receipt IDs, не alias/parser слоя для синтетических names;
- existing `recoveryHistory`, resolver и immutable receipts, не новые журналы/cache;
- исправления existing tests на crossing contracts, не ещё один scripted happy path.

Не делаем: NLP-парсер произвольного project-policy, шаблоны по каждой упряжке,
remote delivery implementation, продуктовые fixes, ослабление HITL/security guards,
массовую историческую переоценку или полную живую qualification из-за docs changes.
Validation, scope/authority, hashes и защита от удаления/перезаписи сохраняются.

При планировании этот документ не объявлял исправления внесёнными. Текущее
выполнение отражено чекбоксами выше и в [review report](069-review-report.md);
исторические qualification receipts не заменяются новыми результатами.

## 13. Повторная проверка готовности: закрытые пробелы

Повторно прослежены actual RUN creation, profile freeze, stage-entry/recovery
restore, shared observer exceptions, receipt shape/status, version predicates,
env precedence и Judge finalization fences. Ниже — обязательные дополнения
именно этой проверки, а не выполненная реализация.

1. **Prepare ≠ final binding.** `prepareFlowRunStart` ещё не знает будущего
   RUN ID. Draft validation без provider effects отделена от binding в actual
   RUN creation. Проверить replay/concurrent allocation и смену profile bytes
   между prepare/publication. Если late failure произошёл после записи project/
   artifact, не маркировать его ложно `no_effect`; использовать существующую
   transaction/publication cleanup semantics и точный phase diagnostic.
2. **Одна authority, один immutable input.** Сохраняются original declared
   decision bytes + hash и final scope binding. Worker/reviewer hash относится
   к минимальной operational projection, не постоянно меняющемуся run.json.
   Перенос путей — отдельное доказанное отображение, не переписывание original
   authority. Contract marker/pure validator выбранного artifact закрывает
   silent-ignore старого engine.
3. **Review date не TTL.** Убрано неоговорённое обязательное прекращение работы
   по дате пересмотра. Ordinary retain не требует дополнительных бумаг;
   reason/owner/date обязательны только согласно конкретной declared policy.
   Explicit expiration/revocation всё ещё соблюдается.
4. **Scope и relocation разделены.** Same logical RUN recovery/import может
   менять physical paths через existing import receipts. Cross-EVAL/new logical
   execution требует новой launch acceptance binding. Тесты должны проверять
   существование указанных агенту путей и unchanged original hashes, а не только
   schema validity или blanket rejection всех relocation.
5. **Recovery root не берётся из окружения повторно.** Новые manifests сохраняют
   `runtime_recovery_home = path.join(evalRoot, "recovery")`. Старые manifests
   при read-only diagnosis остаются неизменными. Consumer source selection
   typed; ancillary historical snapshot не получает `..` output mapping и
   произвольная строка в evidence не является полномочием копировать дерево.
6. **Уточнены реальные receipts и их состояния.** Не требуются отсутствующие
   project_id/run_id/schema_id в native JSON; ownership доказывается retained
   runtime/snapshot binding. Добавлен E7 и регрессия all-aborted. Reached gate
   с отсутствующей/неоднозначной evidence — unavailable, а не not_applicable.
7. **Миграция версий не ослабляет gates.** Зафиксированы @4 acceptance и
   evidence@2, их schema/dispatch/source/cache/qualification consumers. Exact
   matrix proof по новой artifact/canon tuple сохраняется. Original receipts/
   Judge verdicts не переписываются; derived checks не используют whole-repo
   hashes или весь events.jsonl как ключ.
8. **History freeze и failure context.** Report и Judge используют один subject
   event cut под existing revision fences; никакого model wait под DB lock.
   Observer callbacks сохраняют last-observed controller evidence до exception,
   не меняя primary failure и не приписывая этому scope live authority.
   Expected model identity включает harness, где он известен.

### Обязательные дополнительные regression witnesses

- Две concurrent/replayed RUN preparations, источник изменён между фазами:
  нет повторного grant/provider call, late effects не скрыты как no_effect.
- Valid @2/@3 default без decision и valid scoped exception; unsupported engine,
  forged acceptance/policy hash, due review date против explicit hard expiry.
- Stage-focused import в новый logical execution с новой acceptance и same-RUN
  recovery relocation без расширения scope; Work видит реальные mapped paths.
- Новый @4 case без обязательного matrix proof rejected тем же gate;
  consumed source refs доступны после namespace/receipt correction.
- Gate без failures и all-aborted; readiness wrapper с краткими refs, forged
  namespace/local_id/work_id, mixed RUN/WRK receipts и retained old fixtures.
- Scope stop после смены ambient env; два execution captures, conflicting digest
  одного locator, global ancillary source → owned mapping без path escape.
- `answerFor` и `onEvent` throw сохраняют primary code + validated scope/cursor;
  unrelated status read failure не маскирует их.
- Failure → capture → authorized recovery → successful candidate, concurrent late
  enrichment и следующая generation: stable report/Judge history, old frozen
  evidence readable, stale mutation rejected, usage не складывается.

### Итог готовности

Существенные архитектурные развилки закрыты: выбран существующий profile path,
конкретные acceptance/freeze фазы, один recovery root, actual receipt contracts
и явные правила версий/совместимости. Новый E2E остаётся отдельной разрешённой
приёмкой. Выполнение R1–R8 должно оставить по каждому defect ID implementation
reference и passing regression, exact artifact tuple и unresolved/skipped list;
нельзя объявить readiness по одному успешному scripted full-cycle.

Повторная ponytail-проверка исключила новые hard time limits/approval для
обычных defaults, whole-run/repo hashing и отдельный policy/recovery framework.
Изменён только этот план; runtime и EVAL artifacts не изменялись.
