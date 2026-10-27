# 105 — CP254: атрибуция проверок, HITL, профили и финализация

Статус: реализован; приёмка затронутых контрактов PASS (2026-10-26).
Результат и границы приёмки: `105-implementation-report.md`.
Post-implementation review и исправления: `105-review-report.md`.
Дата: 2026-10-25.
Основание: расследование CP254 и аудит аналогичных producers/consumers.

## 1. Цель и ограничения

Устранить tooling-блокеры Luna/ZCode и ложное несоответствие профиля OpenCode,
сохранив проверку источников, parentage, immutable evidence и безопасный repair.
Исправлять только выполнение флоу и EVAL tooling. Не исправлять продуктовые
исходники, требования и тесты результата за Subject; это работа CODE/repair/Judge.
Не менять CP254 definitions/runtime/artifacts, не продолжать исторические RUN,
не запускать модели, новые EVAL, полный gate или GitHub CI в рамках этого плана.

Четыре исходных случая:

- Luna `EVAL-20261025171129-36f6c202`: CODE, `check_gate_blocked`.
- ZCode `EVAL-20261025171238-a2ac85be`: SPECIFY, `unmatched_hitl/out_of_scope`.
- OpenCode `EVAL-20261025171332-db6ffa2f`: MERGE done, case acceptance PASS,
  итог invalid из-за evidence профилей, Final Judge не запускался.
- Luna/ZCode: physical retirement и sealed recovery capture уже подтверждены,
  но историческая проекция остаётся `recovery_blocked`.

Версии расследования: EVAL `b174ebcb72a43de479a0ac27db36bc6e334d83b1`, engine
`89cad0d654601de59b12929240eee4e958b74207`, published `0.9.0-beta.151`.
Источник чтения: `_worktrees/dd-eval-cp254`, `_worktrees/dd-flow-cp253`, CP254
retained homes в `/Users/deksden/.dd-eval/qualification/cp-254-*-full`.
Реализовывать на актуальных согласованных main, не откатывая чужие изменения.
Этот документ находится в основном dd-eval checkout; frozen CP254 не изменяется.

## 2. Реестр подтверждённых дефектов

| ID | Факт/первопричина | Общее исправление |
| --- | --- | --- |
| D1 | Luna: Vitest завершён, 14 PASS/1 FAIL; `TestingLibraryElementError` от DOM-query получает `unclassified/unknown`, repair блокируется | Узкое native proof для ошибок проверочной библиотеки; не приравнивать все исключения к assertion |
| D2 | Runtime proof допускает только TypeError/ReferenceError/Error с первым causal frame в candidate; библиотечный helper закономерно не подходит | Отдельное правило library-query proof с проверкой helper-chain и candidate callsite; старое правило generic exception не ослаблять |
| D3 | ZCode прочитал нормативный system index; Judge получил только обзорные sources. Единственный отказ из 13 atoms — «стабильной публичной ошибкой», хотя стабильные code/message уже установлены проектом | Полный компактный нормативный пакет + оценка независимых решений, а не каждого модификатора варианта |
| D4 | Grounded, compact Judge и два decision-пути имеют несколько prompt wrappers; локальное исправление одного оставит другую семантику | Один shared semantic rule в existing hitl-contract, все wrappers и проекции используют его |
| D5 | OpenCode streaming callback публикует child observation до retainSession; root_session_id=null. Все 13 отклонённых детей имеют правильные model/provider/reasoning | Подтверждать/retain топологию до первой assertive публикации; не брать root только из ещё пустой таблицы |
| D6 | modelMessages исключает повтор сообщения; общий journal считает изменение роли того же event hash identity conflict | Не «обогащать» тот же immutable event задним числом; при временно неполной binding отложить assertive публикацию и dedup |
| D7 | EVAL conformance смешивает отсутствующее доказательство роли с доказанным нарушением | Полная роль matching → matched; недостающая → unknown; противоречащая → mismatched; Judge не сертифицирует unknown |
| D8 | Assertive Session без profile mapping попадает в unknown list, но может оставить общий state=matched; finalization проверяет только state | Любая реально assertive unmapped Session делает conformance unknown; non-asserting и отсутствие утверждений не превращать в mismatch |
| D9 | Markdown отчёт пишет Judge profile `not_requested`, когда Judge включён, но не запущен из-за mismatch | Разделить requested profile и executed/receipt profile, показать причину not_run |
| D10 | captureRecoveryEvidence вызывает cleanupObservation без retirement proof; RUN control receipt не содержит top-level physical_stopped. Валидный sealed capture получает misleading capture_not_sealed | Разделить capture validation и physical retirement; одинаковые authority-bearing proofs для всех consumers |
| D11 | failureCaptureState не обновляет недоступный capture без ID; отдельный finalizeRunProjection уже повторяет capture для таких failures | Использовать существующую authorized finalization/reconciliation; не добавлять второй retry service; закрыть позднюю готовность и различать временную недоступность/invalid |
| D12 | OpenCode pre-prompt baseline capture рекурсивно обходит детей без parent/cycle guards активного observer | Один traversal guard для baseline и streaming; не отправлять prompt после недоказанной топологии |
| D13 | OpenCode Set(messageID) скрывает позднее изменение identity/profile projection того же сообщения; источник включает model ID | Dedup по immutable observation tuple одного native сообщения, конфликт не скрывать новым hash |
| D14 | Producer truncates строки до 16 KiB: большой DOM dump перед stack frames может удалить callsite, даже если ошибка доказуема | Извлекать bounded frame proof до human diagnostic truncation; не повышать лимиты всех отчётов |

D4 — подтверждённые sibling consumers, не утверждение об ошибке Decisions в CP254:
в CP254 decisions отключены. D7/D8/D9 — дополнительные дефекты по коду; D8 не
объясняет текущие 13 mismatches. Основная причина OpenCode — D5/D6.
Уточнение предыдущего расследования: retry отсутствующего recovery ID существует
в finalizeRunProjection; неверно утверждать, что повторного пути вообще нет.

## 3. P1 — Ошибки тестовых библиотек возвращаются в безопасный repair

### 3.1. Producer и контракт

1. Менять tooling `scripts/test-observation.mjs`, `vitest-observation.mjs` и
   соответствующий Playwright producer в baseline-источнике dd-tasks, не файлы
   приложения или product assertions. Проверенный source:
   `_worktrees/dd-tasks-cp251-integration`, clean commit
   `ad3c2d8b0bfc26da9e61e18081789fa9a2f3f247`; основной dd-tasks checkout старше
   CP254 tooling. Перед интеграцией сравнить с актуальным согласованным main,
   переносить tooling diff, не заменять дерево старым checkpoint.
2. Использовать existing normalizeFailure/nativeArtifact/runner-proof, без
   новой службы диагностики и без LLM-классификатора исключений.
3. Добавить одно узкое правило `candidate_library_query_error` для
   TestingLibraryElementError на фазе test. Не расширять этим правилом generic
   TypeError/Error, setup/teardown/collection или произвольные npm exceptions.
4. Proof содержит existing binding/native artifact, exception name, runner test
   ID, исполняемый candidate test file + hash, candidate callsite line/column,
   native stack и идентичность known Testing Library helper chain. Проверять
   фактические regular files внутри candidate installation; reject symlink
   escape, foreign test, mismatched hash, malformed/oversized stack и подмену
   exception-name без подтверждённой helper-chain. Не доверять одному имени,
   тексту «Found multiple…» или позднему произвольному candidate wrapper frame.
5. Generic runtime-error сохраняет прежнее правило первого causal frame.
   Отдельный library proof подтверждает именно тестовый query failure, а не
   исправность продукта. Eligible repair вправе менять тест или продукт только
   по установленной агентом причине; operator этого решения не принимает.

### 3.2. Все readers/consumers

- Engine: `check-runner-proof.ts` types/shape/native proof revalidation,
  `check-runner-evidence.ts` candidate ownership/disposition/files; existing
  `code-checks`, Work finish, CODE, CODE-REVIEW, MERGE, retry/repair-intents и reuse.
- EVAL: generated `lib/check-runner-proof.mjs` синхронизировать штатным
  `tools/sync-runner-proof.mjs`, metadata exact source/build hash, не править копию
  вручную; baseline admission, recursive composite proofs, acceptance и capture.
- dd-tasks: producer-side validRepairEvidence и reporters должны знать то же
  правило. Не оставлять producer @2, который reader принимает иначе.
- Compat probe: дополнить existing чек этим native случаем, без запуска всех
  product suites или новой полной qualification на обычной подготовке EVAL.
  `baseline-admission.mjs` требует точные пять cases browser-window/runtime-error/
  runtime-typeerror/compiler/composite. Новый case вводить явной версией/capability
  нового checkpoint; старые manifests читать по их контракту. Не объявлять
  исторический PASS ложным. Helper identity/hash привязать к установленному
  package/lockfile и проверить reader-ом, не импортировать код по пути из proof.
  Layout pnpm допустим, foreign/symlink-escape helper — нет.

Приёмка: сохранённый класс Luna → source_repair при валидном bound proof;
неизвестная exception/ошибка инфраструктуры/неверный callsite остаётся blocked.
Composite/reuse сохраняют решение и перепроверяют proof, не теряют child binding.

### 3.3. Закрытые решения о proof API, ограничениях и миграции

**Область первой реализации.** Обязательны synchronous getBy*/queryBy* no-match и
multiple-match с native TestingLibraryElementError. Async findBy*/waitFor меняет
stack через wait-for.js/copyStackTrace; не считать его автоматически покрытым.
Если он не соответствует той же доказанной форме, вернуть диагностический
`unsupported_library_query_shape`, repair запрещён. Не менять глобальные настройки
showOriginalStackTrace и не объявлять поддержку произвольных dependency errors.

**Один proof-вариант в existing evidence@2**, additive discriminator, без
evidence@3. Поля: rule=`candidate_library_query_error`,
exception_type=`TestingLibraryElementError`, phase=`test`, test_id, file,
file_sha256, line, column, library={name,version,package_json_sha256,
lockfile_sha256}, helper_frames=[{file,line,column,file_sha256}], native_artifact.
Library name — @testing-library/dom, первоначально поддерживаемая версия 10.4.1
из CP254. Other versions/shapes требуют explicit compatibility evidence, не
автоматического совпадения имени. Category=unclassified, origin=candidate,
native_code=TestingLibraryElementError; assert category не подделывать.

**Два существующих слоя валидации, без нового filesystem-reader API:**

- Producer читает реальные helper files, package.json и lockfile, подтверждает
  package root и последовательность config.js/getElementError → query-helpers.js
  → первый candidate test callsite без постороннего causal helper. Discovery
  допускает обычную node_modules symlink pnpm, после realpath все цели должны
  остаться внутри candidate root. В proof только canonical paths; escape наружу
  запрещён. В existing artifacts сохранить bound native facts, selected frame
  lines и hash-bound refs на использованные helper/package/lock bytes.
- Pure validateRunnerProof читает только ArtifactReader: shape, hashes и
  соответствие bound native record/helper refs/test identity/frame chain.
  Не пытаться открыть candidate installation внутри этого API; не импортировать
  JS из proof. Native source bytes нужны для проверки hash/identity, не исполнения.
- Existing candidateFailureFiles/candidateFailure слой с candidate_root сверяет
  executing candidate file и hashes актуальных library inputs перед выдачей repair
  authority; в receipt новое optional поле candidate_library_inputs содержит
  только проверенные {file,sha256} canonical identities helper/package/lock files.
  Не перегружать existing candidate_files (список candidate test/source files).
  Отсутствующее поле у historical receipts не даёт authority новому proof, но
  не меняет старые proof-варианты. В source snapshot/capture сохранять refs на
  helper/package/lock artifacts, а не всю node_modules директорию.
  Retained/replay путь перепроверяет bound artifacts и captured ownership,
  не требует живого node_modules исторического EVAL. Несовпадение current inputs
  запрещает reuse, а не переписывает старую квитанцию. EVAL pure mirror сохраняет
  те же правила и не начинает зависеть от npm modules.

**Большие ошибки:** native error input не более 256 KiB; до sanitizeDiagnostic
извлечь только полные frame lines, максимум 32 frames, каждый не более 4096 bytes;
суммарный machine proof не более 128 KiB, native artifact не более existing
256 KiB. Machine record содержит stack_complete/frames_complete. Не обрезать
байты внутри машинного поля и затем считать его полным; превышение любого лимита
или потеря causal frames → явный unsupported diagnostic без repair. Human
message/DOM остаётся bounded отдельно. DOM dump >16 KiB, но <native bound с
полной разрешённой chain, должен сохранять доказательство. Секреты редактируются
в diagnostics; если редактирование меняет необходимое машинное доказательство,
не усиливать результат до repair. Не хранить полный DOM ради классификации.

**Compatibility probe:** old `dd-tasks/check-evidence-probe@1` — ровно прежние
пять cases; new `@2` — те же пять + `library-query`. Checkpoint явно выбирает
requirement.contract=@2; исторический/default @1 не меняется. Producer получает
явно запрошенную версию probe через аргумент, default @1; при @2 выдаёт manifest
@2 и шестой реальный DOM-query case, при @1 — старую форму. Reader поддерживает
обе exact формы и запрещает @2 без library-query/с лишними/duplicate cases.
В baseline probe identity остаются requirement+meaningful producer/reader inputs:
новый proof меняет только compatibility contract, не основание повторять все
quality/browser fixtures. Новый checkpoint/capability artifact подготавливать
отдельно после реализации, исторический cp-253-runtime не редактировать.

## 4. P2 — Общая семантика HITL и достаточный нормативный контекст

1. В active task-priority SPECIFY stage-context добавить явные normative sources:
   `.memory-bank/spec/system/index.md` и
   `.memory-bank/spec/engineering/coding-standards.md`. Сверить аналогичную
   декларацию recovery case; добавлять лишь существующие релевантные документы,
   не переносить product decisions между кейсами. Исторические stage-entries
   оставить архивом; новые materializations строить из обновлённого blueprint.
2. Existing collectHitlSources/buildHitlPacket замораживают объявленные bytes,
   hashes и роли. Не обходить рекурсивно все ссылки/Memory Bank, не разрешать
   Judge читать живой репозиторий, не включать native homes/секреты.
3. Context oracle должен требовать нормативные роли, а не только индекс: источник
   в существующем проекте, но отсутствующий в packet, не считается доставленным.
   Считать required source missing/tooling ошибкой до paid Judge, не scope fault.
4. В existing shared semantic rule закрепить: сначала определить независимый
   requested decision; proposed option, его обычные engineering guarantees и
   уже принятые project constraints не становятся самостоятельными новыми
   требованиями только из-за наличия слов в вопросе. Explicit independent
   изменение API/error/совместимости остаётся отдельным решением.
5. Каноническое «общие правила проекта сохраняются» интерпретировать вместе с
   реально frozen normative sources. Нельзя использовать тему/applicability
   вместо ответа, придумать missing antecedent или принять conflict с правилом
   без разрешённого override. Не добавлять unconditional «любой error covered».
6. Один смысл использовать в grounded `interactionGroundedPrompt`, compact
   `interactionCoveragePrompt`, legacy Jev instructions и semantic-decisions
   provider translation. Existing JSON schemas/atom citations не менять ради
   новой категории «покрыто контекстом»; технический модификатор не atomize как
   отдельный запрос, настоящий independent вопрос сохранять.
7. Не требовать от Subject отдельного согласования реализации. Shared SPECIFY
   уже содержит это правило — не добавлять harness-specific запрет вопросов.
8. Регрессии/корпус: exact CP254 question; сохранение project error contract;
   новый error format/code; исключение из политики; неполный нормативный packet;
   material ambiguity; независимый uncovered вопрос рядом с covered; отвергнутый
   вариант и зависимые детали. Аналогичные правила должны работать для всех
   harnesses и decision modes; decision confidence threshold не менять.

Структурный checker и replay сохранённого verdict не доказывают новую семантику
модели. В реализации достаточно детерминированной проверки packet/prompt/corpus;
при последующей отдельно разрешённой живой проверке — один затронутый HITL case,
не полная квалификация и не пять E2E. До неё честно отметить semantic acceptance
pending; не переписать исторический verdict на PASS вручную.

Expected corpus для CP254: aggregate covered; API-scope atom может использовать
точную каноническую цитату о сохранении общих правил вместе с frozen system/
engineering source. «Стабильной» в proposed option не выделять в отдельное
непринятое решение. Если вопрос независимо просит НОВЫЙ код/формат ошибки либо
изменение существующего публичного контракта, это отдельный unresolved decision.
Нельзя подставить source quote в answer_evidence или использовать reference_bindings
для произвольных обоснований: сохранять существующие правила exact citations.
Все qualification identities и cached decision keys должны учитывать изменённый
packet/shared rule через existing meaningful dependency hashes; не переиспользовать
старое решение для новых normative bytes. Это invalidation только затронутых
semantic inputs, не требование запускать весь corpus при подготовке EVAL.

## 5. P3 — OpenCode topology до model evidence; общие conformance consumers

1. В `dd-opencode.mjs` streaming observer передаёт daemon подтверждённую native
   child identity/parentage, а не только ID из callbacks. Перед assertive message
   publication daemon использует existing retainSession/ancestry checks.
   root вычисляется только по подтверждённой цепочке текущего owned дерева.
2. `describe`, prompt streaming, recovery/restart и hook paths используют тот же
   existing retain/check путь: matching ID,parent,fork,cwd,root; root-session,
   прямой depth-one child и foreign/nested/cyclic случаи различаются.
3. Если native binding временно недоступна, retain observation-unavailable
   diagnostic, отложить assertive observation. Не добавлять message в modelMessages
   до успешной publication с полной ролью. Reconcile того же native message
   разрешён как чтение, без нового prompt или сброса productivity clock.
4. Не исправлять journal replay тем же event_sha256 с другой ролью: shared
   observeModel обязан по-прежнему обнаруживать identity conflict. Не вводить
   новый event-enrichment протокол, когда можно правильно опубликовать первый.
5. EVAL executionConformance: пропущенный role field/null root → unknown;
   явный foreign root/parent/model/permission/agent → mismatched. Assertive
   unmapped profile lineage → unknown и запрет semantic certification.
   Отсутствие assertive claims и source.non_asserting не являются нарушением.
6. Diagnostics содержат Session, stage/Work при наличии binding, поле,
   expected/observed, missing-vs-conflicting и источник, а не только список ID.
   Не выводить весь journal/config/секреты. report показывает requested Judge
   profile отдельно от фактически выполненного и точную not_run причину.
7. Существующие executionConformance/attribution callers, Final Judge gating,
   validity/report/compare должны читать одно tri-state решение; unknown не
   считать matched и не называть доказанным profile substitution.
   Отсутствие native usage/model disclosure не равно недоказанному outbound
   intent; не блокировать только за nullable metadata при доказанном intent.

Приёмка: native callback до describe сохраняет полный bound child role; exact
CP254-shaped retained topology и immutable observations воспроизводят причину.
Новый корректный producer → matched; missing ancestry → unknown; conflicting
ancestry/model/permission → mismatched. Duplicate exact message идемпотентен,
подмена того же event остаётся конфликтом. Проверить v2 native → normalized
projection → streaming/reconnect и archive/resume чтение без нового запроса
модели. V1 runtime/archives по-прежнему отвергаются: info/parts — нормализация v2,
а не поддержка второго native протокола.

### 5.1. Точные правила callback, dedup и итогового состояния

- Передавать уже прочитанный полный child из client.children(parent) и текущий
  owned root в registration callback daemon до observeModels. Root уже retained;
  не добавлять inspect на каждое сообщение. Baseline capture и active traversal
  используют одинаковые visited/parent/fork/depth guards и native read bounds.
  Повтор одного child с конфликтующим parent и циклы запрещены до dispatch.
- Сохранить различие identity и route: moved cwd не стирает ownership и не
  препятствует наблюдению/отмене. Несовпадение cwd запрещает новый dispatch через
  existing route guard; не превращать наблюдаемый moved child в foreign orphan.
- Для (sessionID,messageID) хранить published observation tuple, не один Set ID:
  parent/root/role и request/observed settings; content/token delta не входят.
  Полная точная replay — no-op. Изменение уже опубликованного immutable tuple
  того же native сообщения — conflict через existing observeModel, а не новый
  hash, скрывающий смену model/role. Между РАЗНЫМИ native messages сохраняются
  нормальные model transitions. Не менять historical hashes и не добавлять
  generic enrichment/correction events.
  Null optional native disclosure не является положительным противоречием:
  сравнивать конфликтующие известные значения, не null→known как подмену.
  Отсутствующие optional поля сохраняют честную неполноту attribution; они не
  дополняются requested значениями и не дают основания переписать старый event.
- Прежде первой публикации missing required ancestry/role откладывает assertion
  и dedup. Недостающее native model disclosure не заполнять выдуманным observed
  значением из requested. Availability диагностируется отдельно от intent.
- Aggregate precedence: любое положительное противоречие → mismatched; иначе
  missing required lineage/role/outbound proof → unknown; иначе matched. Проверять
  evidence_conflict и конфликт parents до раннего выхода unmapped Session.
  Наличие null не скрывает другого положительного foreign значения.
- Все non_asserting observations исключены также из вычисления intent_evidence;
  summary requested.model сам по себе не подтверждает outbound request. Если нет
  никакого mapped assertive request/configured proof, intent и conformance unknown,
  не substitution. Доказанный outbound intent не требует полных native usage данных.
- Tests: cold-child в baseline и active prompt, late discovery, moved cwd,
  duplicate/conflicting parent, missing role+foreign model одновременно,
  all-nonasserting и nonasserting-before-asserting, changed tuple одного сообщения,
  повтор exact tuple, v1 refusal. На publish conflict dedup не скрывает ошибку.

Исторический OpenCode EVAL не переименовывать в PASS и не дорисовывать root в
старых наблюдениях. Восстановленная в памяти связь — диагностика, не native факт
того события. Supplemental оценка возможна только отдельно и с явным provenance.

## 6. P4 — Sealed capture и physical retirement: разные гарантии

1. Использовать existing recovery-safety/snapshot validation и retirementProofMatches;
   выделить только общую bounded validation sealed-capture binding из
   cleanupObservation, если это необходимо для reuse. Не строить новую службу.
2. Проверка capture принимает current matching control/recovery/generation,
   sealed admission, allowed owned canonical path, snapshot purpose/run/version,
   hash и current writer-barrier. Native settled не доказывает physical stopped.
3. Physical retirement подтверждать existing owner-bound receipt/maintenance
   proofs + current inventory. captureRecoveryEvidence, status и finalization
   используют одну модель proofs; передача лишь голого run-control receipt
   не заменяет остановку и не должна давать ложный capture_not_sealed.
   Не требовать остановки ВСЕГО EVAL до проверки capture: observer ещё может
   работать, Judge ещё не создан. RUN capture проверяется отдельно; scope
   retirement не prerequisite его чтения. Иначе получается циклическая зависимость.
4. Результат отдельно отражает physical, capture и finalization. Отсутствие
   physical proof при valid sealed snapshot — physical unknown, не invalid
   capture. Неверные bytes/identity/path — capture invalid; настоящая незавершённая
   публикация — pending. Не превращать отсутствующее доказательство в FAIL продукта.
5. Existing finalizeRunProjection уже повторяет capture без recovery_id;
   использовать этот путь и согласовать failureCaptureState. Временный gap
   перепроверяется по новым current proofs в рамках existing bounded observation.
   Доказанную corruption не очищать из-за истечения времени. Не busy-polling,
   не новый service/heartbeat и не вызов модели.
6. Status остаётся read-only; успешная status observation сама не переписывает
   исторический execution outcome. Обновление projection/report только existing
   authorized observer/cleanup/reconcile, с original failure сохранённой в events.
   Не расширять продуктивные права cleanup и не отправлять resume/stop повторно.
   runnerCleanupReceipt — recognition only; runnerCleanup — cleanup-only без
   Judge; runnerFinalizeSettled/observer admission остаются scored authority.
7. Consumers: runner cleanup/finalize/resume/fork, recovery safety/candidate,
   cleanup-observation, report/validity/Judge gating, retirement barrier/GC.
   GC по-прежнему требует current physical ownership proof, retention и отсутствие
   live consumers; наличие snapshot или `settled:true` не даёт delete authority.

Приёмка: оба CP254-shaped receipts (settled/sealed, без physical_stopped наверху)
+ matching retirement proof → capture ready/physical settled; без proof capture
валидируется отдельно, physical unknown и безопасная finalization не завершается.
Late capture без первого ID затем ingest через existing authorized finalization,
primary error сохранён. Foreign/replaced generation/hash/symlink/missing file,
native unsettled, active owner и revoked authorization не принимаются.

### 6.1. Точные границы helper, состояний и авторизации

Небольшой shared read-only helper проверяет snapshot bytes/path/hash/версию и
expected bindings из caller, а не доверяет указаниям внутри snapshot. Два вызова:

1. Recovery — current sealed control, matching control/recovery/generation,
   purpose=recovery; существующая повторная проверка current status+hash после
   чтения остаётся обязательной, заменённая generation не исправляет старую.
2. Successful candidate без control — exact retained candidate.manifest/hash,
   purpose=candidate либо существующий stage_entry; не требовать recovery ID и
   не оставлять validation физически gated только в этом sibling path.

Capture может быть ready при physical unknown. Для финализации failed execution
проверять bound subject/worker/check ресурсы конкретного RUN/generation, включая
owned descendants, через existing shutdown/process-binding proofs; не требовать
retire всего EVAL с его observer. EVAL retirement proof — дополнительный источник,
не обязательный. Final Judge имеет отдельные admission/cleanup. Никакой snapshot
не даёт разрешение dispatch/resume/delete. Active owned child блокирует physical
settlement, живой observer сам по себе не блокирует чтение RUN capture.

Состояния: незавершённая публикация/not-sealed → pending; временно недоступный
readback → unknown с точной причиной; mismatch scope/purpose/hash/version/path,
foreign/replaced generation → invalid/blocked. Missing physical proof не причина
capture_not_sealed. Missing sealed file при опубликованном terminal capture —
не тихий retry success: retained error и повтор только после новых доказательств.

Existing failureEvidenceRevision определяет meaningful change. Authorized
cleanup-only ingest дополняет evidence один раз; повтор того же readback не
публикует новый failure/candidate, не считает recovery/usage повторно. First
failure code/stage/Session/time остаются неизменны. Удалять лишь capture-related
incomplete_evidence после validated current capture, не unrelated missing facts.
Status/recognition не меняют journal/report и не вызывают native actions.
Revoked observer admission не заменяется retirement receipt; cleanup-only
финализация не запускает Judge. Это проверяется связанным offline fixture,
а не только отдельно helper unit test.

## 6.2. Инвентаризация аналогичных мест и пробелов тестов

| Контур | Проверенные места | Решение/покрытие |
| --- | --- | --- |
| Test producer | dd-tasks cp251 integration: test-observation validReport/validRepairEvidence, Vitest hooks/cases, Playwright, quality-runner, test-runner, source-diagnostic | Одно library proof; generic exception guards и phases не ослаблять; leaf и aggregate используют общий validator |
| Proof readers | engine check-runner-proof/check-runner-evidence; EVAL generated mirror, baseline-admission, installed-engine probe | Один согласованный контракт и exact mirror; новый probe version не ломает исторические manifests |
| Repair consumers | work-registry, vnext-code, vnext-code-review, vnext-merge, repair-intents, lifecycle-invocations, code-checks reuse | Менять общую proof/disposition, не N gate-specific exceptions; проверить Work и stage/merge representative |
| HITL | active task-priority/recovery blueprints/oracles; hitl-sources/contract/corpus, runner routes; legacy hitl-coverage и semantic-decisions | Явные normative sources и один semantic rule; frozen source/prompt/corpus bindings и negative coverage сохраняются |
| Model evidence | observeModel callers Codex/ZCode/Grok/AGY/OpenCode/Droid, shared journal, EVAL attribution/conformance, report/compare/Judge | Исправить подтверждённый OpenCode producer и общие consumers; аналогичный null-root bug других adapters не установлен, их не переписывать профилактически |
| Recovery | RUN controlStatusReceipt; cleanupObservation/captureRecoveryEvidence/failureCaptureState; finalize/cleanup/resume worker, retirement и GC | Исправить consumer mismatch; не добавлять physical_stopped в engine лишь ради тестовой заглушки |

Почему существующие тесты пропустили отказы:

- opencode-adapter fixture заранее retain-ит child/root; native-tree-adapters-098
  подменяет observeModels; EVAL подаёт полную handcrafted роль. Нужен связный
  offline stream→retain→journal→conformance regression.
- runner-execution-contract проверяет intent_evidence=unknown для unmapped
  Session, но не state. Независимый replay подтвердил matched+unknown.
- runner-recovery фабрикует physical_stopped:true в RUN control receipt, хотя
  реальный controlStatusReceipt не публикует поле. Нужен real-shaped receipt
  →capture→authorized failed finalization, без искусственного physical_stopped.
- Compatibility runtime-error probe использует прямой candidate stack и не
  проверяет реальную библиотечную query chain; добавления имени недостаточно.

Findings субагентов перепроверены основным агентом по источникам. Другие dependency
errors — граница unsupported attribution, не разрешение любых source repairs.
Исследовательский replay — только в памяти, без изменения CP254 и без модели.

## 7. Порядок реализации и проверки по зонам

1. Снять read-only baseline diff/status согласованных checkout; найти актуальный
   dd-tasks tooling source/checkpoint. План не разрешает трогать чужие commits.
2. P1: producer + engine readers + generated EVAL mirror одной совместимой
   связкой; targeted proof/producer/composite/compatibility checks.
3. P2: context declarations/oracles/shared rule/corpus; targeted packets,
   schemas, prompts/projections и отрицательные контрпримеры.
4. P3: native producer ordering + conformance/report tri-state; local native
   fixture с реальным observer, не observeModels stub; exact retained replay.
5. P4: shared proof validation/callers + late finalization; local controlled
   receipt tests без live model/ресурсов CP254.
6. Для каждого контракта selected jobs exact filenames/fixtures через existing
   verification policy 102/104; обновить ownership dependencies только реально
   изменённых контрактов. Общие readers затрагивают consumers, но не все harness
   suites. Не расширять выбор до full integration-controller/full release gate.
7. Малый сквозной local fixture: test query failure → bound source_repair;
   correct native child → matched; failure → sealed capture + stopped owners →
   terminal failed report (не PASS). Поддельные proofs не разрешают repair/Judge.
8. Проверить `git diff --check`, source/build/mirror synchronization и форматы
   планов/receipts; doc-only изменение не требует runtime suites. Commit/push/
   merge/release и новые EVAL выполняются только по отдельной следующей задаче.

Targeted tests: расширять existing producer plan097-observation/test-runner и
check-evidence-probe; engine runner-evidence097, native-tree-adapters-098 и native
opencode-adapter fixture; EVAL runner-compatibility101, runner-execution-contract,
cleanup-observation, runner-recovery, existing HITL corpus/grounding/coverage и
context-oracle tests. Реальная выборка зависит от конечного diff: список не
означает запуск всех cases всех файлов без отбора.

Не превращать отдельную живую semantic acceptance в скрытый gate подготовки
всех будущих EVAL. Техническую реализацию проверять локально; изменённую семантику
Judge не объявлять доказанной лишь по JSON schema/переписанному оператором ответу.

## 8. Критерии завершения и ponytail review

- Все D1–D14 сопоставлены общему producer/reader/consumer и runnable regression.
- Доказанная ошибка теста направляется агенту, unknown/tooling не маскируются.
- HITL одинаков для всех harnesses, полученный нормативный context доказуем;
  semantic live acceptance отделена от deterministic correctness.
- Native model/role evidence публикуется полным и непротиворечивым; unknown не PASS.
- Physical/capture/finalization согласованы без ослабления ownership/security.
- Product source и исторические результаты не переписаны, лишние model calls,
  полные тесты, GitHub CI и speculative generic frameworks не появились.

Ponytail: reuse normalizeFailure/runner-proof, collectHitlSources/shared rule,
retainSession/observeModel, retirementProofMatches и existing finalization.
Не добавлять AST/import-graph crawler, LLM error classifier, blanket assertion
allowlist, рекурсивный Memory Bank crawler, journal enrichment framework, второй
retry daemon или операторское «исправление» старых verdicts. Сохранить negative
checks на trust boundaries; минимальный diff не означает ослабить доказательства.

## 9. Итог повторной проверки готовности

Readiness review закрыл: proof shape и двухслойную валидацию, pnpm symlinks и
captured library inputs, bounded stack/DOM, ограничение synchronous query scope,
точную probe @1/@2 миграцию, baseline/active traversal, immutable tuple/dedup,
tri-state precedence и nonasserting cases, moved cwd vs ownership, v2-only boundary,
candidate и recovery snapshot callers, RUN-vs-EVAL physical scope, авторизацию,
идемпотентность и сохранение первой ошибки. Дополнительные D12–D14 подтверждены
по исходникам. Prompt-смысл проверен по prompting и shared consumers.

Технических архитектурных/политических решений, требующих выбора пользователя,
не осталось. Implementation details (названия малых helpers, расположение уже
выбранных branches/types) решаются в рамках этих контрактов. Новые package
versions/hashes/checkpoint IDs будут фактическим результатом реализации, не
произвольными заранее придуманными pins. Live semantic acceptance — явно отдельная
проверка после реализации и отдельного разрешения, не незакрытое design-решение.

Предыдущее readiness-review меняло только план. В реализации CP254 frozen evidence
не меняется; новые EVAL, release и live semantic acceptance не входят в эту задачу.
