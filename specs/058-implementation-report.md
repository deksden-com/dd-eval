# 058 — локальная реализация и проверки

Дата: 2026-09-30. Статус: реализация P0–P7 и последующее независимое ревью завершены; выявленные существенные дефекты исправлены, локальные/offline gates выполнены. Новые E2E, подготовка их homes/checkpoints, release/publish и платный supplemental Judge не входят в этот запуск работ.

## Выполненные изменения

| Блок | Реализация |
| --- | --- |
| P0/P1 | Regression inputs закреплены в существующих тестах. Shared overload policy различает завершённые и pending эффекты по native Turn; owner решения учитывают RUN/Work/HITL/recovery/MERGE. Продолжение использует прежнюю Session, короткое сообщение, максимум две дополнительные попытки, retained ordinal/operation ID/not-before, исходный deadline и cancellation. Unknown dispatch сначала наблюдается, а не повторяется. |
| P2 | В матрицах сохраняется content-addressed CODE batch; исторический и финальный batch имеют разные authority roles. Общая проверка candidate projection используется acceptance и qualification; qualification @2 связывает настоящие stage packets/catalogs с точным engine-binding. Старый @1 не удостоверяет новую реализацию. |
| P3 | При restore публикационные пути разрешаются через связанную relocation до первого reconciliation. Исторические packet/audit bytes не переписываются. |
| P4 | PLAN/CODE reviewers получают точные assigned criteria и доступную project orientation, включая ignored Canon files. Inputs закреплены до первого запуска и между waves. Canon уточняет fresh/upgrade/repeated-reset и negative-path proof без обязательного изменения продукта. |
| P5 | Existing Judge CLI получил `--supplement` и `--output` (обязательны вместе). Independent assessment использует исходную frozen rubric, собственные journal/runtime/Session/budget и exact source hashes. Original EVAL не finalize/resume/rejudge in place. Supplemental evidence — проверяемая гипотеза, не требуемый verdict. |
| P6 | ZCode selector aliases нормализуются узко; raw model/provider/routing остаются evidence. Model/tool observations учитывают channel/scope/attempt/turn и не превращают nonasserting сообщения в переключение модели. dd-flow/dd-eval aggregation согласованы. |
| P7 | AGY child transcript захватывается из точного native locator до удаления disposable home в owned portable journal. Стабильность bytes, containment, ancestry и coverage проверяются. Незнакомый identified tool остаётся учтённым; отсутствие корреляции result не выдаётся за success. |

Основные рабочие деревья: dd-flow `_worktrees/dd-flow-051-implementation`, dd-eval `_worktrees/dd-eval-cp186-report`, Canon `dd-memorybank`. Продукт и исторические CP187 EVAL не изменялись.

## Supplemental источник

`058-agy-source-inference-supplement.json` связывает конкретную reset/enum гипотезу с четырьмя frozen source files исходного AGY candidate. Byte SHA сверены с retained MERGE boundary. Повторный reset в БД не воспроизводился; это явно отмечено. Платная assessment и новый output runtime не создавались.

## Проверки

При высокой конкурентной нагрузке первый dd-eval прогон дал deadline-sensitive failures; последовательный прогон прошёл без изменения рабочих timeout/guards.

- dd-eval: `node --test --test-concurrency=1` — 367 tests, 358 PASS, 0 FAIL, 9 opt-in SKIP.
- dd-eval: `DD_FLOW_SOURCE_ROOT=<dd-flow-worktree> node --test test/model-observations.test.mjs test/judge-capacity.test.mjs test/judge-supplement.test.mjs` — 25/25 PASS, включая parity двух consumers, CLI option pairing и retained absolute deadline при reattachment. Полный прогон выше предшествовал последнему добавленному regression; изменённые suites перепроверены после него.
- dd-flow capacity/external/MERGE/controller-adapter — 57/57 PASS; дополненная capacity suite — 15/15 PASS; native Codex fixture — 33/33 PASS.
- dd-flow matrix/reviewer/snapshot focused suites — 53/53 PASS; новые reviewer drift проверки — 2/2 PASS; review-off predecessor/negative cases — 3/3 PASS.
- dd-eval engine admission/case acceptance — 6/6 PASS.
- Canon lint — 247 файлов, 0 findings.
- Четыре SHA supplement сверены с historical frozen boundary read-only. Syntax/diff проверки dd-eval PASS.
- Финальные dd-flow `pnpm typecheck`, `pnpm build`, `pnpm lint` — PASS. Строгая Canon-bound локальная сборка также PASS; установленный пакет не менялся.
- AGY/model/tool fixtures — 26/26 PASS; ZCode-inclusive native fixtures — 54/54 PASS.
- Реальный non-injected producer — 1/1 PASS: PLAN, PLAN-REVIEW, CODE и MERGE публикуют собственные output matrices. CODE-REVIEW в этой фикстуре явно выключен, это не доказательство его live execution.
- На нетронутых producer artifacts настоящий qualifier @2 — PASS, 4 Stage packets. Root независимо повторно проверил receipt через `assertVerificationMatrixQualification`/`task-priority@3`. Engine digest `2fc78c63322fb0b27ce7a3499bb0fc83d939d6d33ba55742d77a988c5858d0c8`; receipt SHA `43e16e0cb6854a4a1a22ed16af1bf207bd28c83362116bce2fc2cc126e442b78`. Это временная offline фикстура, не новый case checkpoint/admission для E2E.
- Qualifier CLI negative gates — PASS: существующий output не заменяется и temp не остаётся; coherently resealed missing batch не публикует PASS. Первый producer со сборкой без Canon provenance был корректно отвергнут и не использован вместо Canon-bound доказательства.
- Полный injected lifecycle regression — 1/1 PASS, включая post-MERGE crash-settlement, повторный finish, report rebuild и malformed-binding recovery assertions. Два review-off lifecycle regressions — 2/2 PASS. Ранние конкурентные прогоны этого длинного теста упирались в test timeout; isolated bounded rerun завершился за 244 секунды, без изменения рабочих runtime limits.

Более широкий offline lifecycle обнаружил дополнительный дефект: явно отключённый CODE-REVIEW не публикует матрицу, поэтому MERGE должен брать accepted CODE output. Исправление разрешено только при retained off+reason и отсутствии CODE-REVIEW Stage; в остальных случаях missing predecessor остаётся ошибкой. Это подтверждено и коротким regression, и настоящим producer/qualifier.

## Независимое ревью реализации

Повторно проверены P0–P7 и их связанные callers. Три независимых reviewer исследовали continuation/admission, matrix/publication/reviewer inputs и model/tool observations; основной агент перепроверил их изменения, повторил проверки и отдельно исследовал публичный supplemental Judge runtime. Первоначальный статус «реализовано» не означал отсутствие дефектов: ревью обнаружило следующие существенные пробелы.

| Дефект | Исправление и проверка |
| --- | --- |
| Codex daemon допускал два разных prompt operation ID через asynchronous idle inspection. | `active` резервируется до первого `await`, освобождается в `finally`. Реальный socket dispatcher с удержанным inspection подтверждает один native `turn/start`, второй prompt получает `operation_busy`. `test/codex-daemon-concurrency.test.ts`. |
| Continuation мог дойти до native dispatch после завершения/паузы владельца во время permit wait. | Общая capacity-only admission проверяет Work, controller Stage, linked child Work, MERGE request и точный recovery ACK среди исторических bindings; native boundary перепроверяется после inspection. Helper принимает завершение/паузу как reconciliation, а не новое failure. Завершённый executor Work не запрещает оставшийся Stage finish активного MERGE. `test/codex-capacity.test.ts`, `test/run-control-admission.test.ts`. |
| dd-eval cancellation/packet drift во время native inspection не запрещали следующую Judge попытку. | Admission повторяется после asynchronous inspection, до сохранения dispatched intent. Regression сначала отправлял лишний запрос, затем прошёл с одним запросом. `test/judge-capacity.test.mjs`. |
| Qualification была слабее acceptance: пропускала изменённые MERGE policy declarations; missing accepted batch SHA; report без связи с завершённым owning Stage. | Общая technical authority связывает coverage и точные gate declarations; accepted batch SHA обязателен для PLAN/PLAN-REVIEW output. PLAN/PLAN-REVIEW/CODE/CODE-REVIEW/MERGE report связан с `stage_runs.status=done` и `data_sha256`. SPECIFY/PROTOCOLIZE не получили неправильный report guard: их completion data имеют другой контракт. `test/engine-admission.test.mjs`, `test/case-acceptance.test.mjs`. |
| Supplemental копировал весь snapshot, но его directory locator превращался в недоступное `provenance-only`; новые файлы copy не входили в проверку. | Пакеты явно предоставляют owned frozen snapshot roots, directory paths отображаются в copy; проверяется полный original/copy tree, включая добавления/удаления. Верхние packet bytes сохраняются из одного чтения и сверяются до dispatch/result. `test/judge-supplement.test.mjs`. |
| Supplemental write мог пройти через заменённый parent symlink за пределы assessment copy до containment check. | До записи проверяются ближайший существующий ancestor и physical destination parent; итоговая copy дополнительно проверяется. Регрессия подтверждает отсутствие записи в disposable historical fixture. Engine target/entrypoint также валидируются до materialization, private artifact identity/root проверяются, manifest/config/adapters перепроверяются перед productive native call. |
| Supplemental runtime требовал единственный engine во всём home вместо точного engine candidate; completed journal без report не восстанавливал report. | Выбор идёт по проверенному frozen RUN engine-binding, не по manifest guess или единственному установленному engine. Cached terminal receipt восстанавливает собственный report без native replay. Drift во время setup запрещает Session creation; потерянный подтверждённый ответ и disposable observer crash используют исходные Session/operation ID. Публичная `evalJudge` ветка проверена с двумя retained versions и локальными native/CLI doubles, без сетевого вызова. |
| AGY exact transcript FIFO мог навсегда блокировать capture; regular managed journal, заменённый на FIFO после проверки, мог блокировать status. | Regular-file precheck плюс `O_NONBLOCK` и последующая проверка открытого file descriptor; неизвестные/частичные данные остаются gap, не success/failure. `test/fixtures/tool-observations.mjs`, `test/run-observations.test.ts`. |
| Malformed ZCode model selector после известной модели ошибочно давал complete attribution. | Обе model projections считают asserting configured/response observation без модели неполным; optional nonasserting omission не ухудшает доказанную конфигурацию. Native fixture и cross-repository parity regression. |
| Legacy string model source терял channel/scope и скрывал AGY init → hook transition. | Shared `observeModel` нормализует новые string sources в typed channel/configured-or-response scope; unavailable без доказанного scope не маскируется. Старые retained observations не переписываются. |
| AGY разрешённое same-Session daemon replacement теряло canonical tools/gaps; persist терял evidence-backed zero-tool Session coverage. | Existing canonical array сохраняет calls и `source_observed`, startup переносит canonical array/gaps; legacy отсутствие массива по-прежнему даёт gap. Проверен настоящий disposable fake-native start → tool → clean stop → authorized restart, без синтетического success. |

### Итоговые проверки ревью

- Полный dd-eval с parity: `DD_FLOW_SOURCE_ROOT=<dd-flow-worktree> node --test --test-concurrency=1` — **376 tests: 368 PASS, 0 FAIL, 8 opt-in integration SKIP**. Эти SKIP требуют явно подключённых real-CLI integration inputs; они не выданы за выполненную live-проверку.
- Supplemental/capacity/fork/runtime-provision suites: **38/38 PASS**; после окончательных supplemental ownership guards соответствующая suite повторена — **11/11 PASS**. Она исполняет публичный route с disposable doubles и проверяет исходный EVAL tree hash, native dispatch counts, cleanup, lost reply, report rebuild, setup drift и engine containment.
- dd-flow continuation/admission/external/MERGE/controller/observations: **88/88 PASS**, семь test files.
- dd-flow matrix/publication/reviewer input/copy/start-preparation: **18/18 PASS**, пять test files.
- Native AGY/model/tool fixtures: **31/31 PASS**, без SKIP; root повторил reviewer проверки.
- Root повторно выполнил read-only admission сохранённого настоящего non-injected producer через усиленный verifier: **@2 PASS, четыре Stage packets**. Сохранённый engine artifact и receipt digest прежние; рабочая локальная сборка не подменяла их.
- dd-flow `pnpm typecheck`, строгий Canon-bound `pnpm build`, полный `pnpm lint` — **PASS**. Lint дополнительно выявил пропущенные Node imports в новой фикстуре; они исправлены и перепроверены.
- Syntax и `git diff --check` обоих рабочих деревьев — **PASS**. Canon diff перепроверен: lifecycle proofs требуются только для relevant accepted scope, а не автоматически для любой задачи.

Существенных незакрытых дефектов в проверенной области P0–P7 не осталось. Это вывод по исследованным путям и выполненным gates, не гарантия отсутствия любых ошибок во всей системе. Неблокирующая диагностическая особенность shared continuation осталась: при unknown retained delivery helper безопасно запрещает повтор, но в некоторых ветках сохраняет исходный overload вместо отдельного reconciliation code. Она не разрешает повторную отправку и не изменена как самостоятельное улучшение диагностики.

Полный repository-wide `test:integration` dd-flow в этом ревью не выполнялся; ранее выполненные длинные lifecycle gates перечислены выше отдельно. P8 и paid/live validation по-прежнему не входят в поручение. Исторические CP187 artifacts, продукт, установленные hooks/binaries и scores не изменялись; commits/push/release не выполнялись.

## Не выполнялось по текущему поручению

- Новые scored E2E, их preflight/qualification homes и checkpoints.
- Публикация пакета, переключение установленных binaries/hooks, release/version bump.
- Платный supplemental Judge; изменение исторических scores/acceptance.
- Исправление продукта вручную или возобновление старых EVAL.

Локальные тесты подтверждают проверенные контракты, но не заменяют будущую live-проверку полного цикла трёх упряжек и не гарантируют качество работы модели.

## Проверка по ponytail

Использованы существующие continuation/operation ledger, Stage publications, acceptance verifier и Final Judge; отдельный retry/artifact/Judge framework не добавлен. Для atomic exclusive qualification publication достаточно стандартных fs primitives. Ревью сохранило этот подход: точечные guards и существующие канонические проекции вместо нового слоя абстракций. Новые guards защищают конкретные authority/identity boundaries и учитывают легитимные review-off, active MERGE после завершения executor Work и optional native omissions; semantic product quality остаётся независимой задачей Judge. На этом реализация и ревью остановлены.
