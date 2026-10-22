# 096 — CP240: полные результаты проверок и независимое от упряжки окружение

Дата: 2026-10-22. Статус: реализация и локальная приёмка отражены в
[implementation report](096-implementation-report.md); release и новые scored EVAL
в эту задачу не входят.
Readiness review 2026-10-22: §9 уточняет и при расхождении заменяет решения §1–8.
Основание: расследование пяти CP240 E2E и дополнительный аудит producers/consumers.
Цель: доказанная ошибка кандидата получает штатный repair, ошибка tooling — точный
blocker, неизвестное наблюдение не превращается ни в PASS, ни в разрешение repair.

## 1. Границы и проверяемые исходные факты

Меняем flow/engine, EVAL plumbing и тестовый tooling. Не исправляем вручную SQL,
UI, тестовые ожидания или другие продуктовые результаты агента в scored RUN.
Такие недостатки исправляет агент через flow; их качество оценивает Judge.
Не меняем исторические квитанции, baseline, budget повторов и verdicts.
Не увеличиваем таймауты, не ослабляем ownership/binding/hash/path/cleanup guards.
GitHub CI не запускаем. Никаких новых платных квалификаций неизменного Judge.

Исследованный engine: beta.145 / `52851c6a5c8419e93b543fd6a53e71f9aa359d9f`.
Definition CP240: `023305e36b9c8bdfee469abe7b59b19dc47c111b`.
Source checkpoint: dd-tasks `c92bb80240c98eb10d2e7a2626bef4778ea800b1`;
flow pack `1fdebb7de50ad764b6a35fb8ef2b30cb2e0e5be9`.
План основан на dd-eval main `ee27a514697985e3ce799ad7818e8557d7924cfb`;
последующие E5 изменения не откатывать ради совпадения с CP240.

| Упряжка / EVAL | Факт | Нужная реакция после исправления tooling |
| --- | --- | --- |
| OpenCode / EVAL-20261021204250-381e17c3 | CODE: migration SQLSTATE 42601, отсутствует `;` после `NULL`; global setup не дошёл до тестов; evidence потерял причину и оставил nonzero_exit | Доказанную ошибку выбранной миграции направить в repair, не объявлять неизвестный SQL продуктовым |
| ZCode / EVAL-20261021204853-d7e7083e | CODE: 8 browser PASS, один тест ждёт `Projects` в task detail, где есть ссылка с именем проекта; нет worker snapshot для proof | Ошибка сценария должна быть различима от поломки browser/world; при достаточном proof — repair |
| AGY / EVAL-20261021205710-0a17ab9e | CODE-REVIEW: API 19/19, web 16/16, browser 11/11; formatter отказал, quality.runner.json отсутствует | Опубликовать ошибку formatter с файлом и запустить штатный repair |
| Grok / EVAL-20261021212217-bed2dcbf | CODE: browser executable искался в session-5/grok-home/Library/Caches/ms-playwright, хотя baseline прошёл с другим HOME | Общий закреплённый cache install/baseline/checks; отсутствие executable — tooling, без продуктового repair |
| Luna / EVAL-20261021210657-b61225c6 | PLAN: основной Turn и два продолжения одной Session завершились serverOverloaded / willRetry=false | Сохранить provider_unavailable после исчерпания episode; policy не менять |

Evidence roots: `/Users/deksden/.dd-eval/qualification/cp-240-<harness>-full/runs/<EVAL>`.
Рабочие продуктовые файлы находятся в execution runtime `projects/PRJ-001-project/
checkouts/worktrees/RUN-RUN-001/project`, а не в исходном `executions/e2e/project`.
Сначала читать bound receipt/retained boundary; не подменять их глобальным checkout.

**Поправка расследования ZCode.** Обе сохранённые ошибки RCP-008 буквально проходят
существующее regex после stripVTControlCharacters, включая `Error: locator.click:`.
Исправлять regex под этот префикс НЕ нужно. Доказано отсутствие worker snapshot;
его точную причину ещё требуется локализовать. Нагрузка сама по себе не доказана.

## 2. Инвентаризация аналогичных мест и владельцы

Аудит ограничен данным классом проблем, а не обещанием отсутствия любых багов
во всех репозиториях. Проверяем всю цепочку producer → publication → validation →
disposition → repair/recovery → EVAL diagnostics, включая соседние consumers.

| Область | Файлы / вызовы | Найденный пробел / решение |
| --- | --- | --- |
| Test producers | dd-tasks scripts/test-runner.mjs, test-observation.mjs, vitest-observation.mjs, playwright-observation.mjs, browser-fixture.mjs, browser-observation.mjs, runner-progress.mjs | setup/collection/unhandled и native action требуют полных результатов, не fallback только по exit |
| Составные проверки | package.json quality, test:unit, typecheck, build; вложенные wrappers; value-absence-check.mjs | Ранний отказ даёт no evidence, поздний отказ оставляет успешное evidence вложенных тестов; один внешний владелец aggregate |
| Обязательные docs/check aliases | scripts/docs-check.mjs; @check/docs в CODE/MERGE; @check/web-build и существующие runner contracts | docs печатает JSON, но не имеет bound runner_evidence contract; известный отказ обязательного docs-check также останется unclassified. Подключить native checker к общей публикации, не парсить произвольный stdout |
| DB tooling | apps/api/tests/global-setup.ts, src/db/migrations.ts, scripts/test-world.ts, db verification | Подготовка не может требовать успешного применения ошибочной миграции как условия доказательства её ошибки |
| Engine consumers | src/services/check-runner-evidence.ts, code-checks.ts: runCodeChecks, reconcileUnfinishedChecks, stale/retry/reuse, captured receipts | Расширять общий валидируемый контракт, а не делать исключения для имени упряжки |
| Repair consumers | work-registry.ts, vnext-code.ts, vnext-code-review.ts, vnext-merge.ts, repair-intents.ts, lifecycle-invocations.ts | Все используют общий disposition; сохранить exact successor, запрет replay и отдельность settlement |
| Environment | codeExecutionEnvironment; workspace-bootstrap.ts; runtime-service.ts; environmentFingerprint | process.env/HOME протекает из provider; owned check inputs должны одинаково доходить до bootstrap/check/reuse |
| Harness boundary | src/harness-runtime/lib/dd-grok{,-daemon}.mjs; остальные bundled adapter env builders | Grok меняет HOME/GROK_HOME; не убирать isolation. Проверить сохранение explicit check env у всех adapters |
| EVAL | lib/baseline-admission.mjs, process-json.mjs, runner.mjs, check-diagnostic.mjs, case-acceptance.mjs, retained captures | baseline использует installed engine ABI; compact packet — locator, не источник repair authority |
| Lifecycle/cleanup | EVAL eval-retirement.mjs, runner finalization; engine run-controller-recovery/run-control | Состояние failed/recovery_blocked отдельно от capture/physical cleanup; AGY pending не объявлять settled |

Дополнительный подтверждённый дефект диагностики: `lib/cleanup-observation.mjs`
обозначает `physical=live`, когда есть control и `receipt.settled=false`.
Но AGY auto-cleanup receipt сообщает `physical_stopped=true`, `native_settled=false`:
session-6 имеет `runtime_scope_outcome_unknown` / «Dead native owner requires
retained shutdown evidence», остальные native nodes settled. Это не доказательство
живого процесса. Физическое завершение и неизвестный native outcome надо показывать
раздельно, а отсутствие capture не переименовывать в работающий процесс.

Существующие frozen/runtime copies не редактировать. После merge новые сборки и
checkpoint получат исправления обычной публикацией. Bridge/native упряжки здесь
не требуют самостоятельного изменения без нового доказанного дефекта.

### Важная развилка исходников dd-tasks

CP240 source имеет tooling, которого нет в текущем первичном checkout dd-tasks:
`4a5f59a` явно revert-ит `f1eeec1`. Существует source-ветка
`eval/cp237-scoped-checks` (в исследовании HEAD `1fc6fac`, потомок c92bb80) и отдельный
flow-pack `eval/cp237-flow-intent` (`9824552`). Не отменять revert молча и не
перезаписывать чужие checkout. Реализация tooling стартует на source-контуре,
совместимом с CP240, в отдельной ветке; фиксирует отличие от main и назначение
scored-source fixture. Изменения продукта не переносить. Если требуется перенос
tooling на main, он оформляется отдельным проверенным diff по Git workflow.
Профиль@7 уже есть в pinned source; profile@6 pack не использовать как authority
для понижения/удаления source-owned runner contracts при материализации.

## 3. Принятые общие решения

1. Сохраняем существующий `check-runner-evidence` и shared disposition. Не создаём
   второй evaluator, plugin framework, scheduler или автоматический repair по stderr.
2. Основной отчёт описывает **всю запрошенную команду**. Результат шага, его tooling,
   наблюдение и cleanup представлены отдельно, под одной invocation/check/epoch.
3. Каждый запуск пишет в свежий invocation-owned каталог. Единственный final publisher
   атомарно закрывает отчёт; nested steps не перезаписывают итог всей команды.
   Отсутствующая директория создаётся до запуска, failed publication сохраняет primary.
4. `completed` означает завершённое наблюдение, а не PASS. Ненулевой выход плюс
   неизвестная причина остаётся unclassified; сигнал/observer gap/живой процесс —
   settlement_required. Ошибку tooling не превращаем в source_repair для удобства.
5. Новый repair proof проходит одинаковую проверку в normal execution, re-read,
   reconciliation, recovery/capture и MERGE. JSON со словом candidate недостаточен.
6. Публикация диагностик ограничена размером, редактирует секреты и URL credentials,
   не публикует весь env, raw SQL/параметры, prompt или token. Binding и hashes полезных
   артефактов сохраняются; symlink/path traversal/foreign epoch отклоняются.
7. Приоритет результата: неизвестное/неоконченное наблюдение → settlement_required;
   известная tooling/publication/cleanup ошибка → tooling_blocker; неизвестная
   атрибуция → unclassified; только полный набор доказанных candidate failures →
   source_repair. При смешанных причинах сохранять все, но repair не разрешать.
   PASS требует terminal exit=0 и полного непротиворечивого report, не одного
   вложенного успешного результата. Это не меняет правила исторических receipts.

## 4. Последовательность реализации

### P0 — Сохранённые регрессии и закрытие неизвестного browser proof

- Извлечь минимальные обезличенные реальные формы RCP/SQL/formatter/native timeout
  и Luna episode; хранить рядом с существующими contract tests, без копии всего RUN.
- Детерминированно подтвердить обе native timeout-формы текущим matcher (уже
  выполнено при планировании); никаких новых matcher-веток под locator.click.
- Сопоставить reporter/worker attempt IDs, phase, progress cursor, timeout origin,
  world-ready и пути mailbox; сравнить pinned scripts с runtime candidate.
- Проверить native `setTimeout` относительно начала test, а наш расчёт относительно
  fixture epoch; не смешивать разные начала отсчёта без сохранённого offset.
  Сохранять native budget/origin и wall/monotonic origin диагностики; из числа
  601004 ms нельзя вывести точный момент пропуска snapshot. Совпадение порядка
  полей attempt() по коду не доказывает совпадение фактических значений binding.
- В узком локальном browser fixture воспроизвести отсутствие snapshot/задержку
  публикации, не повторяя scored EVAL. Нужен итог reason, а не предположение «load».
- До изменения positive repair authority зафиксировать reproduction и отказавшее
  условие. Если воспроизведение не подтверждает гипотезу, исправлять только доказанные
  diagnostic/publication gaps и не заявлять весь ZCode proof исправленным.

### P1 — Полный terminal report для setup/collection и миграций

- Сохранять исходную ошибку global setup непосредственно на границе выполняемой
  операции, до перехода Vitest к zero-tests/runner teardown. Reporter подхватывает
  bound error, дедуплицирует её проекции по operation/error identity, не по одному тексту.
- Добавить узкий proof ошибки **выбранного файла миграции**: invocation, migration
  path+hash, phase, SQLSTATE, operation, setup/world identity и observation outcome.
  Готовность DB-соединения не равна успешности всех миграций.
- Для 42601 разрешать repair только при сопоставленном candidate migration, сохранённой
  операции и достоверном ответе PostgreSQL. Не расширять весь класс 42 без нужды.
  Ошибки 08/28/53/57/58, неизвестная query/foreign file, timeout, оборванное соединение,
  конфликты/cleanup блокируют или остаются неизвестными.
- В shared engine reader/validator добавить этот proof; same rules для capture,
  file validation и re-read. Старые integrity proofs оставить без ослабления.
- На startup/collection ошибках TS/module/config сначала сохранять фазу и исходную
  причину; разрешать source_repair только для проверенного candidate diagnostic.
  Не делать универсальное правило «globalSetup упал → виноват продукт».
- Проверки: реальная маленькая ошибочная миграция в одноразовой DB; исправная миграция;
  foreign SQL, auth/connection отказ, неверный hash/binding, mixed setup+cleanup.

### P2 — Один внешний publisher всей quality pipeline

- Заменить только orchestration команды quality явной последовательностью её
  существующих шагов через argv. Сохранить порядок, команды и fail-fast; не писать
  универсальный shell parser или новую систему сборки.
- Переиспользовать test-runner/progress/owned-process helpers. Внешний owner агрегирует
  вложенные результаты по отдельным step identity; nested reports имеют свои paths,
  не выдают успешный отчёт unit/integration за quality final. Счётчики не удваивать.
- При отказах format/lint/typecheck/build/value-absence итог публикуется так же, как
  при отказе теста. Сохраняются executed/failed/unreached steps; unreached не PASS.
- Для Biome использовать native JSON diagnostic pinned tool, candidate paths и
  категории format/lint. TypeScript/build/value-check diagnostics связывать с их
  конкретным шагом и файлами; при неизвестном формате — retained diagnostic +
  unclassified, без догадок по строке. Известные source diagnostics получают узкое
  общее правило engine, а spawn/ENOENT/cache/permissions остаются tooling.
- Форма additive proof фиксируется как `candidate_tool_diagnostic`: `tool`
  (name/version), `step` (id/ordinal/command_sha256), `diagnostic_code`, `file`,
  `file_sha256`, `native_artifact` (relative_path/sha256). Оно вложено в failure
  с origin=candidate, phase=collection/test/setup по фактической фазе,
  native_code из allowlist распознанного tool и обязательным diagnostic_artifact.
  Native artifact содержит top-level binding и исходный структурированный diagnostic
  с тем же code/file/step. Engine повторно проверяет этот матч, bounded regular file,
  path containment и capture-time source hash; смена source после capture требует
  нового epoch, не подгонки старого proof. Никакого принятия произвольной строки
  «candidate» или произвольного diagnostic_code.
  Для Biome разрешены подтверждённые JSON categories format/lint; TypeScript —
  структурированный TS diagnostic с candidate source location; неструктурированный
  build отказ остаётся unknown с сохранённой причиной, не получает искусственный proof.
  Unknown tool/version/output не проходит positive rule.
  Уточнение native-проверки при реализации: pinned Biome 2.5.6 также выдаёт
  `assist/source/organizeImports` из исходной команды `biome check`. Этот точный
  code разрешён с тем же candidate-file/hash/native-artifact proof; весь класс
  assist не разрешается. Native `location.path` может быть строкой, а не объектом.
- Синхронно обновить producer validReport/validRepairEvidence и engine
  runnerFailureValid/candidateFailure/readRunnerEvidence/runnerProofArtifacts,
  snapshot copying и retained re-read. Нужны fixtures полного Biome-format proof
  и позднего build unknown; только producer test без engine consumer не приёмка.
- Без DD_FLOW binding standalone команды работают как прежде; управляемая quality
  обязана закрыть один bound final report даже при первом отказавшем шаге.
- Apply тот же aggregate helper только к уже найденным multi-runner цепочкам
  test:unit/typecheck/build, где они заявлены самостоятельным evidence-контрактом;
  не назначать всем shell aliases новые обязательные schemas ради унификации.
- Для уже обязательного `@check/docs` добавить bound report (`docs.runner.json`) и
  profile contract: сам docs-check располагает native списком нарушений, значит
  передаёт structured diagnostics напрямую. Broken link/frontmatter связывается
  с исходным candidate document; missing required document — с точным путём из
  pinned required-files declaration и input epoch. Для последнего native proof
  явно различает `path_state=missing`/`present`; missing не подменяется хешем
  несуществующего файла: file_sha256=null и обязательный hash owning declaration.
  Engine проверяет declared expected path+captured absence и не разрешает foreign,
  произвольное или уже неактуальное отсутствие. EACCES/I/O/read failure не являются
  missing document; их source repair запрещён. У `value-absence-check` сохранять
  file/rule, но не обнаруженное значение секрета. Для `@check/web-build` при прямом
  вызове использовать тот же step adapter, что внутри quality, не второй classifier.
- Проверки: отказ каждого шага (особенно первого и последнего), success, nested
  failure, invalid child report, nonzero после успешных тестов, zero exit с failures,
  SIGTERM, публикация недоступна, cleanup failure, отсутствие лишних test reruns.
  Добавить обязательный docs failure/broken reference/missing file и permission
  negative; список required files и проверяемые продуктовые требования не менять.

### P3 — Browser inactivity: наблюдение должно пережить реальную границу

- Существующие browser-fixture/reporter остаются владельцами native progress.
  Одна незавершённая операция и idle window, успешные steps сдвигают окно; polling,
  health probes и повтор одного события не означают прогресс продукта.
- После P0 сохранять bound worker observation регулярно и при изменении активного
  шага, не только за 750 ms до deadline. Ограниченный один обновляемый snapshot на
  attempt + frozen referenced artifacts при terminal; не безграничный health journal.
- Отделить свежесть health от активности действия. Выполнять probe последовательно,
  с существующим ограниченным budget; его timeout не доказывает продуктовую ошибку.
  Не требовать попасть в магическое субсекундное окно публикации для любого host load.
  Это требование надёжности диагностики, а не разрешение ослабить доказательство:
  до результата P0 сохраняются текущие ограничения authority — health не старше
  min(1000 ms, quiet/4) у deadline и terminal publication не позже deadline+5000 ms.
  Периодический старый snapshot сам по себе не разрешает repair. Если P0 докажет
  дефект именно этих границ, отдельно зафиксировать минимальную замену с native
  time origin, fresh health и negative delayed-observer тестом до изменения validator.
- При невозможности построить proof публиковать bounded reason: missing worker,
  identity mismatch, phase/health unknown, observation gap, artifact write/read failure.
  Безмолвные catch не должны уничтожать единственное объяснение; содержимое env не писать.
- Нативный action-timeout + доказанное body/owned file/healthy world даёт source_repair.
  teardown, interrupted, crash, disconnected, API/DB failure и unknown health — не source.
- Согласовать producer и `validateBrowserArtifacts` на одном контракте. Не удалять
  negative controls и не разрешать repair по одному DOM snapshot/regex.
- Проверки: фактический missing locator; рабочая страница с длительным прогрессом;
  задержка observer; повторный test ID с другим retry/worker; teardown timeout;
  disconnected/crash/unhealthy world; redirection/symlink/hash mismatch; ANSI messages.
  Использовать реальный Playwright хотя бы для одной положительной/отрицательной пары.
  Переиспользовать имеющийся native browser-observation.test.mjs. Усилить условие
  «есть хотя бы один worker.json»: snapshot и proof должны принадлежать именно
  missing-locator attempt, не соседнему успешному тесту или teardown.

### P4 — Browser/tool resources независимо от HOME упряжки

- При подготовке EVAL выбрать и сохранить один абсолютный `PLAYWRIGHT_BROWSERS_PATH`
  как owned execution resource. Явный допустимый path оператора сохранить; иначе
  использовать campaign-owned cache root, закреплённый в каждом EVAL. Создать parent
  до установки; переиспользовать уже установленный совместимый browser revision,
  не удаляя общий cache при завершении одного consumer; не скачивать
  браузеры заново в каждый session-N и не полагаться на host HOME defaults.
- Один и тот же path передать browser-install, baseline browser, runtime controller,
  native adapter children и `codeExecutionEnvironment` (включая bootstrap/services).
  Grok сохраняет HOME/GROK_HOME isolation; остальные adapters не получают чужой home.
- Path закреплён в execution manifest/owned operational context. Проверять абсолютность,
  отсутствие NUL и согласованность selection; environment override не разрешает
  произвольную замену PATH/DD_FLOW_BIN/authority. API расширять минимально к текущему
  owned checkEnvironment, не принимать произвольный env-object от агента.
- `environmentFingerprint` учитывает **effective** path, как и исполняемый check;
  shared immutable browser cache не общий writable test-world. Правила очистки должны
  учитывать всех живых consumers, не удалять cache из-под другого EVAL.
- Missing/wrong revision executable публикуется отдельным tooling diagnostic;
  не считать все browserType.launch ошибки равнозначными и не auto-install внутри check.
- Тесты: HOME-A install/baseline → HOME-B check с тем же explicit cache; missing cache,
  другой browser revision, relative/malformed path; env/hash совпадение normal/reconcile;
  table-driven wiring всех bundled harnesses без платных моделей.

### P5 — Consumers, replay protection, diagnostics и terminal cleanup

- Общий disposition остаётся SSOT для Work, CODE, CODE-REVIEW, MERGE и invocation
  recoverability. Для новых proof tests пройти read/retain/reconcile/snapshot/restore,
  а не только вызвать classifier напрямую с самостоятельно собранным JSON.
- Ошибка кандидата создаёт ровно один repair Work с bound failed receipts;
  после исправления только exact issued successor/явный свежий check attempt.
  Успешный дочерний Turn сам по себе не завершает Work/Stage.
- EVAL compact diagnostics показывают исходный step/error, classification reason,
  reference полного proof и secondary cleanup/publication problem. Не копируют
  validator logic и не превращают compact packet в новую repair authority.
- Проверить baseline ABI: те же validators/effective env, baseline никогда не
  авторизует продуктовый repair. Ненулевой pre-feature baseline остаётся blocker.
- AGY pending: отдельно исследовать retained finalization/capture/cleanup intent,
  процессы с birth identity и resource registry. Не объявлять no PID == settled;
  не возобновлять Subject для завершения cleanup. Если нарушен terminal handoff,
  исправить existing finalizer для success/failure/recovery_blocked/cancel;
  сохранить primary check error. До proof не называть конкретную cleanup причину.
- Исправить подтверждённое смешение physical/native в cleanup-observation: живость
  выводить из exact PID/birth/process-tree evidence либо соответствующего bound
  physical receipt, а не из `settled=false`. Старый stopped receipt не доказывает
  текущее отсутствие новых owners: проверять generation/identity и свежий inventory.
  При dead physical owner + unknown native outcome писать physical stopped/unknown
  по доказательствам и native settlement pending отдельно, не manufacturing capture.
  Регрессия повторяет session-6: physical=true, native=false, capture missing;
  также настоящий live owner, PID reuse, changed generation и missing inventory.
- Luna episode оставить без изменения (same Session, основной + два продолжения).
  Добавить regression из сохранённых трёх Turn и distinct Turn IDs: native willRetry
  не удваивает dispatch, third refusal => provider_unavailable, success закрывает episode.
  Не маскировать провайдерную недоступность как продуктовый/тестовый дефект.

## 5. Совместимость и доставка

- Сохранить schema @1 для неизменных полей; новые discriminated proof rules расширяют
  reader и локальные shape validators одновременно. Изменение meaning существующего
  поля вместо additive rule требует явной версии, не скрытого переопределения.
- Старый engine с новым неподдержанным proof должен отказать безопасно; запретить
  новую checkpoint tuple со старым ABI. Legacy evidence читать по прежним правилам,
  не переоценивать исторические verdicts новым classifier.
- Изменять source tooling и source-owned check profile согласованно, затем engine,
  затем EVAL checkpoint/materialization/case-acceptance. Проверить фактически
  материализованный profile, а не только исходный pack@6.
- Каждый затронутый repo: isolated branch, review diff, минимальные достаточные
  локальные проверки, commit/push/PR/squash по [Git workflow](../runbooks/git-workflow.md).
  Этот план не является разрешением немедленно публиковать engine или запускать E2E.
- При отдельно разрешённом rollout: один новый exact engine artifact, новые pins,
  обычное обновление hooks; не менять установленные runtime snapshots старых EVAL.
  Product task/fixtures/Judge model и принятый scope остаются прежними.

## 6. Приёмка без повторения лишних тяжёлых гейтов

Следовать [локальной политике](../runbooks/flow-test-suite-verification.md) и плану095.
Порядок: deterministic stored forms → tooling unit/contract → реальная маленькая DB/
browser пара → affected engine lifecycle/recovery contracts → paired installed EVAL.
Не выполнять полный suite на каждом промежуточном коммите; финальный release gate
нужен один раз на замороженном release candidate, если release отдельно разрешён.

| Проверяемая гарантия | Минимальная приёмка |
| --- | --- |
| SQL setup attribution | pg42601 реального candidate file; foreign/auth/unknown отрицательные; engine read+disposition |
| quality terminal completeness | Все места отказа, поздний отказ, nested no-double-count, missing publication |
| browser action proof | Реальный missing locator + health-negative; frozen proof engine consumer, restore |
| одинаковое окружение | HOME сменён, cache тот же; installed adapter-to-check wiring; отсутствие browser |
| flow repair | Work + CODE + CODE-REVIEW + MERGE: positive/negative dispatch, no replay, next invocation |
| EVAL | baseline failure/success, compact primary vs secondary, cleanup after blocked/cancel, ABI mismatch |
| overload сохранён | Три distinct отказа одной Session, два dispatch continuation, новый episode после успеха |

Ни один skipped/неисполненный native case не считать PASS. При полном gate не
запускать вторую тяжёлую цепочку и не останавливать чужие процессы. Для новой E2E
кампании заранее получить отдельное разрешение; реализация этого плана сама по себе
не разрешает release или новую кампанию.

## 7. Definition of done и readiness

- Каждому подтверждённому дефекту соответствует producer, общий consumer, regression
  и проверяемый outcome; продуктовые изменения оператора отсутствуют.
- Positive/negative proofs проходят actual installed engine API и retained re-read.
- Невозможность классификации имеет причину и источник evidence; отчёт команды
  не теряет initial failure из-за publication/cleanup и не выдаёт partial за PASS.
- Browser cache одинаков в install/baseline/checks независимо от harness HOME.
- Existing overload policy сохранена; E5/095 изменения не откатились.
- Новые checkout/pins не маскируют активные/исторические runtime; процессная очистка
  подтверждена отдельно от verdict, shared DB не остановлена при живых consumers.

План готов к последовательному исполнению с обязательным P0. Не закрыты заранее:
точная причина отсутствия ZCode worker snapshot и AGY capture/cleanup pending.
Это явно выделенные исследовательские задачи и exit criteria, а не разрешение
внедрить недоказанные workaround. Их нельзя объявить исправленными по regex/unit PASS.

## 8. Проверка по ponytail

Использовать existing helpers и shared classifier. Один quality publisher вместо
нескольких пересекающихся отчётов; один effective cache path вместо копий браузера
в каждой Session. Без нового framework, auto-retry тестов, глобальной смены HOME,
расширения SQLSTATE на все ошибки или эвристики «любой timeout — продуктовый».
Не исправлять правильную Luna policy и работающий regex. Регрессии сосредоточены
на реально найденных границах и отрицательных контролях; no paid Judge requalification.

Внешние проверки поведения: [PostgreSQL PL/pgSQL structure](https://www.postgresql.org/docs/18/plpgsql-structure.html),
[Playwright browser cache](https://playwright.dev/docs/browsers),
[native auto-waiting](https://playwright.dev/docs/actionability),
[TestInfo.duration](https://playwright.dev/docs/next/api/class-testinfo#test-info-duration).
Они объясняют поведение native tools, но не заменяют доказательства конкретного RUN.

## 9. Readiness review: закрытые решения и границы готовности

Повторно проверены producers, actual CP240 receipts и shared consumers, включая
normal/reconcile/restore/MERGE, baseline resume и Memory verification. Два read-only
субагента проверили proof/aggregation и environment/browser; существенные выводы
перепроверены главным агентом по коду. Runtime/продуктовые файлы не менялись.

### 9.1. P0 — не формальность и не разрешение менять допустимость repair

До P3 выполнить локальную native browser-regression в одноразовом каталоге с
текущими scripts/tool version: delayed fixture setup, changed active step,
observer delay, health timeout, report write refusal, native body/teardown timeout.
Повторять весь scored EVAL для этого не нужно. В тесте сохранять exact test/retry/
worker/step identity и оба clock origins; positive proof должен относиться именно
к missing-locator test. Нельзя закрыть P0 существованием snapshot соседнего теста.

Для каждого отказа capture сохранять один bounded reason с attempt/sequence:
`deadline_passed`, `step_changed`, `progress_changed`, `observation_gap`,
`health_unavailable`, `capture_failed`, `publication_failed`. Эти причины —
диагностика, не доказательство product blame. События health/poll не сдвигают idle.

Exit criteria P0: воспроизведён конкретный механизм потери snapshot, positive и
negative native tests различимы, причина записана в implementation receipt.
Если этот результат не получен, завершёнными можно назвать только независимые
P1/P2/P4 и улучшение диагностики; весь096 и исправление ZCode НЕ завершены.
Никакой заранее выбранной правки regex, увеличения budget или ослабления свежести.

### 9.2. P1 — отдельное pre-ready SQL proof, без ослабления WorldReadyProof

Добавить additive rule `candidate_migration_sql`, только для доказанного 42601.
Его данные: `file` (absolute candidate migration), `file_sha256`, `native_code`,
`operation_id`, `world` (invocation/world/role/migrations manifest hash,
`phase=migrating`, `setup_completed=false`) и `native_artifact` (relative path/hash).
Артефакт хранит top-level runner binding, выбранный migration path/hash/ordinal,
SQLSTATE и результат выполнения той же операции. Не сохранять SQL parameters,
credentials или всю query; позиция ошибки допустима без содержимого значений.

WorldReadyProof и старое integrity rule по-прежнему требуют ready=true. Новый
pre-ready proof не выдаётся за ready-world: одноразовая DB создана и соединение
работает, но migration не завершена. Файл и его hash фиксировать **до** отправки
миграции. Путь должен принадлежать выбранному migration manifest, а не браться
из произвольного stack. Чужая операция/файл/схема, ambiguous migration, connection
отказ и неизвестный результат не получают source_repair.

Данные этого rule читаются теми же producer/engine validators, capture и retained
re-read, что прочие proofs. Изменение file после проверки не переписывает старый
результат: текущая пригодность check определяется существующим epoch/reuse policy.
Историческая диагностическая квитанция остаётся читаемой по capture-time facts.

### 9.3. P2 — parent/step/child без подмены binding

Команда quality имеет фиксированный упорядоченный список существующих argv-шагов.
Parent invocation владеет final report и progress; step имеет id/ordinal/argv hash;
каждый child имеет собственную invocation, отдельный каталог, binding и отчёт.
В final report child reference содержит step identity и relative path/hash.
Parent проверяет, что child был запущен именно данным step, terminal и имеет
правильный binding. Child учитывается ровно один раз; чужой/повторный id,
несовпадающий argv и malformed report не агрегируются как успешные.

Child artifacts не переписываются на parent binding. Минимальная совместимая
реализация: parent-bound diagnostic envelope с вложенными проверенными child
binding и reference неизменного child artifact. Shared reader валидирует оба
уровня и путь child внутри invocation-owned evidence root; относительные ссылки
при snapshot/restore сохраняют структуру. Не добавлять второй truth source.
Nested unit chains используют тот же mapping. Суммировать только leaf test counts,
не одновременно aggregate и его children. Незапущенные шаги имеют state=unreached.

Child завершился с нулём, но сообщил failure; parent ненулевой после всех успешных
tests; report появился до terminal; terminal появился без report; запись прервана
между body/drain/publication — отдельные regressions. Parent stdout/stderr и
первичный diagnostic не теряются при неудачной final publication. При SIGKILL
невозможно обещать final report: уже retained evidence сохраняется, reconciliation
пишет interrupted/unknown, а не PASS. После сигнала не запускать следующий step.

**TypeScript:** использовать compiler API уже установленного pinned TypeScript
для получения структурированных diagnostics с теми же tsconfig, project references
и noEmit semantics; не разбирать строки tsc. Adapter обязан сохранить исходные
exit/build semantics. До подтверждения эквивалентности обычный CLI отказ честно
сохраняется как unknown и не получает repair proof. Vite/прочие build failures
без поддержанного native diagnostic также unknown, но не «успешная quality».

**Docs absence:** расширить capture-time outcome отдельным списком
`candidate_absences` (expected path, owning declaration path/hash, state=missing),
не смешивать его с existing-file `candidate_files`. Общие candidateFailureFiles/
candidateFailure/engine-outcome readers проверяют discriminated present/missing
формы. Missing proof с file_sha256=null допустим только для native required-file
diagnostic и проверенного declaration из того же input epoch. Для symlink escape,
EACCES, unknown stat или произвольного незаявленного пути — repair запрещён.
Проверять existing ancestors через ближайший owned parent; не вызывать realpath
несуществующего файла как единственную проверку containment. Это не изменение
продуктового списка обязательных документов и не разрешение ослаблять docs-check.

### 9.4. P4 — точные plumbing/compatibility решения

Новый operational selection содержит `check_resources.playwright_browsers_path`:
единственный absolute cache path, выбранный **до** browser-install/baseline.
Если оператор явно задал PLAYWRIGHT_BROWSERS_PATH, сохранить его; иначе default
`<runtime_resource_home>/browser-cache/playwright`. Manifest сохраняет effective
selection и его binding; это не shell expression, `~` не раскрывается провайдером.
Общий cache — ресурс установки, а не общий test-world. Разные browser revisions
могут сосуществовать; проверяемый executable принадлежит pinned Playwright revision.

Обязательные места передачи selection:

1. EVAL manifest creation/materialization и admission schemas/checks;
2. runner `evalRuntimeEnv` (не вычислять повторно из нового shell при resume);
3. `runBaselineAdmission`/execute: новый narrow resource argument, одинаковый для
   canonical baseline и всех resume/recovery baseline calls;
4. controller manifest и его restore/re-attach, bundled native daemon dispatch;
5. engine `codeExecutionEnvironment`, bootstrap/workspace-bootstrap, runtime-service;
6. `memory-verification-checks.ts` с его отдельно retained checkEnvironment;
7. effective environment fingerprint, reusable receipt и new epoch checks.

Использовать один narrow type для внутренних `CODEX_HOME` и
`PLAYWRIGHT_BROWSERS_PATH`: только известные optional keys, минимум один при наличии
override, absolute strings без NUL. Agent не может подменить этот retained selection
или передать произвольные PATH/engine/auth env. Legacy CODEX_HOME-only callers
работают как раньше. Новые harnesses не требуют отдельных cache rules.

Legacy manifest без check_resources читается по прежнему контракту, но не считается
подтверждением новой гарантии HOME-independent checks. Для нового профиля selection
обязателен; mismatch между saved selection/runtime/cache env — явный admission
blocker, не fallback на текущий HOME. Snapshot/restore в другом filesystem не
запускает browser автоматически: operator выбирает новый ресурс для нового run
или получает explicit resource-unavailable; старые receipts не перепривязываются.

Cache не удаляется automatic daemon cleanup. Перед новой кампанией допускается
обычная scoped очистка по ранбуку только после последнего consumer; не создавать
новый daemon, GC/service или глобальный docker/cache prune для этой задачи.

### 9.5. AGY shutdown: установленные факты и отсутствие ложного PASS

Дополнительное read-only исследование session-6 установило: daemon.json содержит
`shutdown_state=unclean`, все physical shutdown phases (tree/provider/daemon_resource)
выполнены, но shutdown.result.clean=false с reason=native_terminal_unconfirmed.
Native journal заканчивается ERROR/interrupted при остановке; предыдущий SUCCESS
другого Turn не доказывает clean последнего. Это объясняет native_settled=false.

`prepareStop` правильно отделяет физическое завершение от native receipt. Его guard
не удалять и не назначать clean по одному exit/PID. Подтверждённая правка096 —
точная диагностика physical/native/capture; если при реализации обнаружен иной
дефект drain, зафиксировать его отдельной reproduction, не расширять authority
задним числом ради успешной классификации исторического AGY.
Для уже unclean native incarnation итог остаётся unknown; очистка физических
ресурсов не требует нового Subject prompt, resume или создания новой Session.
Условие следующего launch — установленный scoped fence/physical retirement, а
не выдуманный чистый native outcome прежней модели.

### 9.6. Приёмка и окончательная оценка готовности

P1/P2/P4 независимы от установления browser snapshot root cause; P3 меняет repair
authority только после P0. P5 применяет их общие consumers и отдельную cleanup
диагностику. При реализации сначала сохраняется минимальный red regression, затем
исправление и green той же границы; один green unit parser не заменяет native proof.

В receipt реализации нужны: точные source refs, список затронутых owners/consumers,
red/green по SQL, quality early+late, docs absence, browser failed-attempt,
HOME-A→HOME-B и re-attach, cleanup stopped+native unknown, retained re-read,
Work/CODE/CODE-REVIEW/MERGE. Применять existing local merge gate и union затронутых
наборов095, без повторов полного release gate после каждой правки. Scored E2E и
release остаются отдельно разрешаемой проверкой конечного результата.

Итог: архитектурные/совместимые решения, scope и acceptance определены. Можно
начинать реализацию P0 и независимых частей; **нельзя заранее заявить**, что вся
причина отсутствия ZCode snapshot установлена или что096 гарантирует полный E2E
PASS при недоступной модели. Незакрытый P0 блокирует завершение096, а не маскируется
под готовое исправление. Нужных решений от пользователя для начала работ нет.
