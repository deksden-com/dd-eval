# 086 — CP228: полные ошибки проверок и корректный source repair

Дата: 2026-10-14. Статус: реализовано; результаты offline-проверок и границы
приёмки — в [отчёте](086-implementation-report.md). Release и новые EVAL не выполнялись.
Ponytail: full. Цель — ошибка candidate test/setup не теряется и возвращается
агенту по штатному repair-пути, без разрешения product repair при сбое тулинга.

## 1. Границы и источники

Инцидент: ZCode EVAL-20261014063704-e049673f, home
`/Users/deksden/.dd-eval/qualification/cp-228-zcode-decisions-full`.
Engine beta.137. GLM-5.3-Flash/max; OpenAI Decisions gpt-6-luna, threshold 0.7.
Baseline PASS; SPECIFY 06:51:26Z, PLAN 07:16:39Z, PLAN-REVIEW 08:07:40Z;
CODE с 08:09:09Z. WRK-009/RCP-001: 08:23:17–08:23:28Z, exit 1;
EVAL completed_with_failures, cleanup settled. Это не timeout/native loss.

Проверенный audit-base: dd-flow-cli origin/main
`5c4e969615004fc57aace080fe310e57dfa5feb9`, dd-tasks origin/main
`0b998f2170f71d3dbdde67efd655d0961cb1716d`, dd-eval origin/main
`46ac5d3130520973c20017243243787b3657c717`.
Перед реализацией перебазировать собственные task-ветки на актуальный main,
повторно проверить inventory. Исторически расходящиеся primary local main не сбрасывать.

Исправляем FLOW/reporters/EVAL tooling, не candidate product. Не редактировать
упавший тест, старые receipts, DB, EVAL runtime или checkpoint на месте.
Не исправлять ZCode native/bridge: свидетельств их дефекта в этой цепочке нет.
Новый scored EVAL, публикация/установка engine и hooks — отдельная авторизация.

## 2. Установленные дефекты

**D1, candidate, не операторский фикс.** Новый beforeAll в
apps/api/tests/task-priority-state.integration.test.ts вызывает resetProductData,
который TRUNCATE-ит tasks/projects/workspaces и остальные продуктовые таблицы.
Затем тест вставляет tasks с несуществующими parent records. Получен
PostgresError/tasks_workspace_project_fk на строке 54. fileParallelism=false:
это не гонка suites. Пять тестов skipped, один suite failed, остальные 11 PASS.
Исправить этот результат должен оцениваемый агент, а не оператор.

**D2, tooling.** scripts/vitest-observation.mjs собирает test-case errors и
глобальный onTestRunEnd errors, но игнорирует modules/suites. Ошибка beforeAll
теряется. Native Vitest 3.2.7 SuiteImplementation.errors() читает task.result.errors.
Read-only reproduction: пять skipped, module.errors с PostgresError;
onTestRunEnd ни разу не читает module errors, failures=[].
test-runner.mjs корректно предотвращает ложный PASS, добавляя nonzero_exit,
но это уже потерянная первичная причина.

**D3, policy.** AssertionError отождествлён с ремонтопригодной ошибкой исходников.
Даже после D2 PostgresError останется unclassified и заблокирует repair.
Форма исключения и ответственность за него — разные признаки.

**D4, siblings.** Оба reporter удаляют stack/file/phase/native error code.
Playwright сохраняет сообщения exception, но не происхождение. Его неизвестные
исключения имеют тот же policy gap; timedOut/interrupted сами по себе не доказывают
дефект продукта. Не переименовывать все такие события в candidate failure.

**D5, unsafe sibling.** runCodeChecks выставляет failed и при missing artifacts,
workspace mutation/launcher failure. checkRepairDisposition читает только
runner report и может разрешить source_repair при assertion evidence, игнорируя
engine-origin blocker. Он также не исключает exit_code=null. Расширять repair
до исправления этого пробела нельзя.

**D6, EVAL diagnostics.** lib/runner.mjs failureDiagnostic сжимает details.failures
до Work/native fields: исчезают check id/declaration/receipt paths/exit/runner cause.
details.checks baseline также не сохраняется. executionEvidence использует этот
результат. Case acceptance имеет отдельный evidence capture: не утверждать, что
Judge вообще лишён всех доказательств; исправить адресную потерю и проверить ссылки.

**D7, regressions.** scripts/test-runner.test.mjs проверяет fake per-test assertion
и empty-nonzero guard, но не native installed Vitest hooks/modules/collection.
Есть реальная Playwright regression; использовать тот же стиль, без нового framework.

**D8, снято при реализации.** Первоначальная гипотеза subset/full inventory
не подтвердилась: collectCheckArtifacts сохраняет ВСЕ файлы независимо от
required списка, поэтому исходное сравнение корректно при report+progress.
Не ослаблять custody ради этой гипотезы и не считать D8 исправленным дефектом.
Оставить regression multi-artifact/recovery для новых engine outcome metadata.

**D9, world settlement evidence.** test-world finally сохраняет cleanup_errors
в .test-worlds/<token>/receipt.json; reporter заканчивается до этой очистки.
Сам runner report поэтому не доказывает DB cleanup. Исправление должно учитывать
финальный world receipt в wrapper, не только живость child process group.

**D10, implementation review.** Выдаваемый Work finish corrective successor
повторяет finish без --retry-check/--reason. Это не гарантирует связи
нового выполнения с failed receipt. Исправить общий successor producer:
привязать первичный failed check и --reason, сохранив native input transport и
existing ownership/effect guards; подтвердить реальным public lifecycle test.

**D11, причинный recheck.** Два retry guards требовали CURRENT input_hash равным
predecessor.input_hash, запрещая повтор после правильного изменения source.
Допустить новый hash только при доказанном source_repair и неизменном execution
contract, с latest-receipt fence и retry_of; environment retry не расширять.

**D12, crash и historical ownership.** Reconcile должен считать статус после
physical blockers, не давать PASS при uncommitted sidecar. Проверенный локатор
ошибки принадлежит моменту запуска: последующий rename/delete source не лишает
repair authority. Captured candidate_files хранить в bound engine artifact,
не требовать неизменности/вечного существования product file. Missing/escaped
file на initial capture не становится допустимым после последующего создания.

## 3. Принятые решения

### 3.1 Один evidence-контракт, совместимое расширение

Сохранить check-runner-evidence@1 и текущие category assertion/tooling/unclassified.
Добавить optional поля failure: `origin` (candidate/tooling/unknown), `phase`
(test/setup/teardown/collection/runner), `file`, `test_id`, `stack`, `native_code`,
`classification_reason`. Название exception остаётся в code, текст — в message.
Старые записи читаются; отсутствие origin не получает новую атрибуцию задним числом.
Legacy assertion сохраняет существующий путь при исправном physical receipt;
legacy unclassified остаётся blocked. Противоречивый/malformed origin не разрешает repair.
`origin=candidate` — диагностическое поле, не самостоятельное разрешение. Новый
unclassified требует validated `repair_evidence` с rule (candidate_sql_integrity),
native_code, candidate source locator и вложенной world ready proof. Engine
перепроверяет rule/SQLSTATE/binding/root; неизвестный rule => unknown. Legacy
assertion не расширяется до exception из-за одного поля origin. Не требуется
подпись reporter: это обычная bound check evidence, не недоверенный внешний API;
receipt/artifact custody проверяется как сейчас.

Валидировать типы всех optional полей, enum, размер и принадлежность file к
candidate root (физически разрешённый путь, не symlink escape). Native stack
сохранять ограниченно и с редактированием секретов; не копировать env/DB URL.
Практические пределы: не больше 64 failures, message 4 KiB, stack 16 KiB;
overflow отмечает неполноту, не превращается в PASS/repair. Общий read-report
лимит 1 MiB сохранить. Не вводить отдельную БД, classifier-plugin или diagnostic agent.
Лимит действует после aggregation: JSON report <=768 KiB, UTF-8 byte lengths,
остаток под wrapper blockers. При overflow сохранить primary cause, добавить
tooling/report_truncated, completed=false; counts не подгонять. Проверять
схему текущего и prior report до merge; foreign binding не перезаписывать молча.
file вне candidate root допустим как диагностика runner/dependency, но не как
доказательство candidate ownership. Stack никогда не исполняется/не даёт read scope.

### 3.2 Детерминированная атрибуция, не угадывание

Shared helper reporter использует native structured errors и retained setup
контекст; не парсит stderr для разрешения repair. Candidate file/имя PostgresError
в одиночку не являются достаточным основанием.

Начальный поддержанный набор:

- Native expectation/assertion в candidate test — candidate; explicit runner,
  cleanup/observation/setup infrastructure errors имеют приоритет.
- SQL integrity violations 23502/23503/23505/23514 из candidate test/setup:
  candidate только если доказан успешно подготовленный owned disposable world,
  совпадает invocation/world identity, migration/setup этапы завершены, ошибка
  относится к запросу candidate, нет инфраструктурного blocker. Для CP228 это
  позволяет вернуть FK setup error агенту, а не объявить её assertion.
- Отсутствие такой world binding/ready evidence — unknown, не свободный повтор.
- SQL connection/auth/resource/shutdown/system classes 08/28/53/57/58,
  native cancellation, observation loss и cleanup uncertainty — не source repair.
- Остальные exception/collection errors сохраняются подробно как unknown, пока
  нет поддержанного положительного правила; это явный предел, не фиктивная
  универсальная классификация. Ошибки импорта/TypeError не размечать по одному имени.
- Playwright использует тот же формат/helper для поддержанного positive proof;
  expectation identity сохраняется, timeout/interruption не ослабляются.

World binding взять из existing test-world/progress/binding, расширить только
недостающий ready receipt. Не читать произвольный global DB; не делать live
диагностические запросы из classifier. Не запускать новую модель для атрибуции.
Транспорт готовности: wrapper резервирует путь `DD_TASKS_TEST_WORLD_RECEIPT`
в собственном temporary evidence dir; test-world пишет bound world identity
ready=false до dispatch. apps/api/tests/global-setup.ts переводит ready=true
атомарно только после await resetAndMigrate и закрытия setup SQL client, с проверкой
requireTestWorld()/invocation identity. Поля: schema_id, invocation_id, world_id,
ready, migrations_sha256, role, setup-completion identity; без URL/паролей.
Reporter читает этот путь, проверяет binding/regular-file/no-follow/size и ready,
затем включает сам bounded proof в retained report до удаления temporary dir.
Недостаточно ссылки на удаляемый temporary file. Existing progress
не считать readiness, если этапы только начаты. В standalone без такого proof
SQL constraint exception остаётся unknown. Проверить, что installed Vitest
сохраняет native SQLSTATE; если native API его не передаёт, дополнить test-world
error serialization, не извлекать разрешение на repair из текстового сообщения.
Fallback на test-world serialization допустим только для ошибок, которые он
реально получает. Для test beforeAll передача native_code обеспечивается native
Vitest reporter API; если API не сохраняет code, regression обязана выбрать
доступный native error serialization path или оставить unknown, не обещать
несуществующее наблюдение launcher. Готовность сама по себе не доказывает
корректность candidate схемы, но constraint violation такого мира — допустимая
задача source/test repair, не утверждение о конкретной строке виновного кода.
При смешанном наборе один tooling/unknown блокирует source repair всего gate.
Дубликаты одного native failure объединять по stable identity+phase, не message:
одинаковые тексты разных ошибок/блокеров нельзя терять.

### 3.3 Engine-owned outcome имеет приоритет

Сначала terminal process outcome и settlement, затем обязательная evidence
доступность/binding, engine errors/mutation, затем failure attribution.
Требуется integer nonzero exit; null/running/aborted/lost => settlement/unknown.
Known missing required artifacts, unexpected tracked-input mutation, launcher
failure и incomplete cleanup не разрешают product repair даже при assertion.
Это проверка причин данного запуска, не контроль Git tree всего репозитория.

Повторно использовать checkReceiptEvidenceValidForMode диагностический путь и
collectCheckArtifacts, не дублировать валидатор. Если требуется отделение
physical outcome от API wrappers — маленький existing shared helper.
Причины engine сохранять в optional receipt field `execution_failures`, с
machine-owned code/message; писать одинаково в live/reconcile/recovery paths.
Implementation уточнение custody: engine после settlement публикует атомарно
собственный check-execution-outcome@1 artifact, digest которого входит в
существующий SQL artifact inventory. candidate_root/execution_failures при
чтении получаем из этого bound artifact, не из свободных полей receipt JSON.
Тестовый процесс не может подменить sidecar через symlink; atomic wx+rename.
Declared check-input hash/reuse не меняются из-за скрытого добавления proof.
Задать коды: launcher_error, missing_required_artifact, check_input_mutated,
completion_unknown, cleanup_unconfirmed, invalid_runner_evidence. Не доверять
execution_failures, дописанным только в mutable receipt JSON: DB outcome/artifact
custody и actual completion остаются авторитетными; восстановить/project optional
field через тот же verified retained evidence path, без отдельной SQLite таблицы.
Не переопределять ими первичную native cause: сохранять обе с явным источником.
Baseline вызывает чистый classifier с available outcome, без требований к
несуществующему полноценному Work receipt; no-product-repair остаётся независимо.

### 3.4 Возврат ошибки и продолжение

Классификация сама по себе не запускает repair. Проверить два разных маршрута:
Work finish corrective continuation и aggregate gate registered repair Work.
Work finish сегодня сохраняет Work running и выдаёт corrective successor в той
же Session: агент исправляет причину и повторяет finish. Это не новый repair Work.
Aggregate CODE/CODE-REVIEW использует зарегистрированный repair и свежего child.
Сохранить это различие; не добавлять автоматический перезапуск child, который
завершился без исправления. Issued successor не означает completed repair.
Если correction потеряна при доставке, исправлять delivery existing outcome,
а не скрывать unresolved predecessor и не создавать новый prompt по догадке.

Error packet должен включать primary failure/code/message/phase/file/native_code,
bound receipt ID и ссылки на retained stdout/stderr/report. Все пути реально
существуют и разрешены read-policy repair workspace; root не обещает PASS.
Повтор finish/check только через issued lifecycle successor и existing failed
receipt retry semantics, не ручной CLI replay. Новый check связан retry_of,
old receipt неизменен. Existing repair-intent identity обеспечивает ровно один
Work на причину/attempt/generation. Transport/unknown effect не превращать в retry.
Existing repeat/cycle guards сохранить; ошибка gate не увеличивает capacity retry.
После исправления source новое выполнение проверки использует existing explicit
retry receipt/reason/workspace-change rules. Нельзя повторить finish с прежним
failed receipt без этих параметров и считать это новым тестом. Regression
проверяет фактически выданный argv, второй receipt и корректное settlement.

## 4. Полный inventory и задачи реализации

### A — dd-tasks: reporters/launcher (D2/D4/D7)

- scripts/vitest-observation.mjs: обход modules и вложенных suites, native
  errors hooks/setup/teardown/collection; глобальные errors отдельно.
- scripts/playwright-observation.mjs: bounded context/native error preservation;
  native expectation matching и mixed/timeouts safety сохраняются.
- scripts/test-observation.mjs, test-runner.mjs: shared attribution/normalization,
  owned world-ready evidence, no-empty-PASS guard, report aggregation и limits.
- Wrapper после выхода test-world читает его final cleanup receipt и добавляет
  blocker при cleanup_errors/cleanup_unconfirmed даже если child-group settled.
  Сохранять primary failure отдельно; fallback path существует до spawn.
- apps/api/scripts/test-world.ts и tests/global-setup.ts: доказательство owned
  successfully prepared world, ни миграции продукта, ни seed semantics не менять.
- scripts/test-runner.test.mjs: реальные API installed versions и negative cases.

### B — dd-flow-cli: evidence и все потребители (D3/D5)

- services/check-runner-evidence.ts: type/reader/validated attribution/policy.
- services/code-checks.ts: live capture, reconcile, receipt read/relocation/reuse,
  execution_failures и physical evidence guards; сохранить проверку всего
  inventory (D8 снято), regression нескольких artifacts при новом sidecar.
- work-registry.ts Work finish; vnext-code.ts gate и createCodeRepair;
  vnext-code-review.ts gate; vnext-merge.ts gate/repair admission;
  repair-intents.ts; lifecycle-invocations.ts retry eligibility.
- run-drive/controller/native-hook error delivery: candidate work failure must
  reach correcting worker; ownership/effect guards and handoff remain SSOT.
- Найти assertion-only user instructions/errors во всех этих местах и shared
  prompts/canon. Заменить на candidate-source-backed, не давать harness-specific
  обходы. MERGE blocked response не публикует actionable source repair command.
- Никаких новых запретов «все файлы неизменны»: только existing check-input scope.

### C — dd-eval: baseline/diagnostics/checkpoint (D6)

- lib/baseline-admission.mjs: consume enriched evidence, сохранить
  product_repair_allowed:false; failed baseline не идёт в subject repair.
- lib/runner.mjs failureDiagnostic/executionEvidence: bounded check IDs,
  declaration, disposition, primary phase/code и frozen evidence refs;
  details.checks также сохранять. Не встраивать весь raw report/stack в prompt.
- lib/case-acceptance.mjs и report/final-Judge packet builders: ссылки на captured
  candidate-bound failures доступны даже до terminal stage; unknown/unreached
  отличать от product failure. Не превращать skipped suite в пять failed tests.
- Новый immutable checkpoint с tooling-only reporter изменением на отдельной
  product task-ветке, materialization/pins/hash по existing runbooks; candidate
  упавший тест не переносить. Historical accepted tuple не переписывать.
- Fresh checkpoint baseline проверяет совместимость нового reporter/engine.
  Не повторять Judge model qualification из-за unrelated tooling fix.

## 5. Проверки и критерии приёмки

1. Реальный Vitest: beforeAll, nested beforeAll, afterAll, collection/import,
   test exception, assertion, identical-message distinct errors. Ошибка не
   теряется; test counts честные; suite errors сохраняются без выдуманных counts.
2. CP228 minimal disposable regression: existing parents reset, candidate FK
   insert fails; retained world-ready proof + SQLSTATE 23503 -> candidate repair.
   Исправление делает fixture agent/controlled regression, не оператор старого EVAL.
3. Negative: DB unavailable/auth/missing world binding, worker crash, cancellation,
   malformed/truncated report, null exit, lost observation, live process tree,
   missing required artifact, mutation despite assertion => нет source repair.
4. Mixed candidate/tooling/unknown -> blocker, исходные обе ошибки доступны.
5. Real Playwright assertion/exception/mixed/timeouts: прежние гарантии не потеряны.
6. Work end-to-end через public lifecycle/controller: new reporter -> receipt ->
   same-Session corrective successor -> agent receives exact cause -> bound recheck
   -> Work completed. Не только unit disposition. Aggregate CODE/CODE-REVIEW/MERGE:
   exactly one registered repair; replay не создаёт duplicates; blocked ни одного.
   Premature terminal worker без correction остаётся unresolved, не ложный PASS
   и не неавторизованный restart. Registered handoff отдельно сохраняет контракт.
7. Live/reconciled/recovered receipts дают одинаковый disposition и refs; legacy
   readable, legacy unknown не получает candidate origin задним числом.
   Report+progress+дополнительный artifact остаются читаемыми после relocation;
   подмена именно report digest по-прежнему отвергается. Проверить overflow,
   foreign prior binding, malformed prior fields, cleanup world failure после
   reporter completion и readiness fail до миграций.
8. Baseline candidate-category failure остаётся baseline failure/no-product-repair.
9. EVAL/Judge compact packet указывает существующий captured cause, не только
   check_gate_blocked; report не утверждает completed-stage при running CODE.
10. Targeted suites, затем полный engine gate по release-policy, dd-tasks tooling
    suites и dd-eval affected/full offline suites с собранным paired engine.
    Записать exact commits/tree/logs. Не отключать failing suites ради зелёного gate.

## 6. Последовательность и Definition of Done

A: воспроизводящие positive/negative regressions и полный failure collection.
B: physical blocker guards, затем bounded attribution и shared repair policy.
C: Work/controller delivery и aggregate registration, prompts/evidence links.
D: EVAL diagnostics/baseline compatibility, immutable checkpoint подготовка.
E: независимое review, gates, PR/commit/push/squash merge по git-workflow каждого
репозитория; отдельный release/launch после разрешения пользователя.

Готовность: существующие primitives найдены, контракт/legacy/mixed rules/границы
и test outcomes определены. Не считать план выполненным, пока regression CP228
не доказала доставку ошибки агенту и успешный штатный bound recheck.
Список supported attribution rules намеренно узкий; неизвестное не угадывается.

## 7. Проверка готовности (повторная, 2026-10-14)

Приняты решения: ready пишет global-setup, proof сохраняется inline; wrapper
добавляет late cleanup blocker; origin не достаточен для repair; legacy и
unsupported error rules fail closed; bounded report aggregation; гипотеза D8
снята после полного чтения collector; same-Session retry проверяется
через реальный публичный argv. Ниже сохранена проверка готовности до реализации;
фактические изменения и проверки перечислены в отчёте реализации.

Первый implementation шаг — installed Vitest serialization regression с
PostgresError/native code и module hook error; затем ready/cleanup transport и
physical guards, затем attribution. Это проверяемый technical gate, не отложенный
выбор политики. Не продолжать к relax repair, если положительное evidence
недоступно. На release нужны совместимые engine+reporter/checkpoint, не отдельно
один reporter. Реальный scored EVAL не входит в acceptance этой реализации:
достаточны disposable offline fixture/controller проверки; launch отдельно.

Ponytail review: нет нового framework/daemon/diagnostic model/БД; native runner
API вместо stderr parser, существующие classifier/receipt/repair intents вместо
параллельной harness-specific системы. Не добавлять blanket retry всех exit 1,
не выдавать AssertionError вместо настоящего PostgresError, не исправлять продукт
оператором, не объявлять новый E2E успешным без реального завершения.
