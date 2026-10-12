# 081. CP223: maintenance, исходы проверок и поздний cleanup

Дата: 2026-10-12. Статус: реализация и local candidate preparation завершены, финальные gates PASS (см. §10); registry/hook delivery и scored E2E не выполнялись. Основание dd-eval origin/main c0b9fa6; runtime origin/main deec90c и реально установленный beta.130/source09c3a78. Локальный primary main runtime не заменяет эти источники; его fetch в первоначальном аудите был недоступен из-за Git HTTPS credentials. Historical EVAL не менялся.

## 1. Цель, scope и подтверждённые факты

Исправить tooling/flow, чтобы служебные задержки не выдавались за потерю агента или продуктовый verdict, а подтверждённый cleanup не скрывался устаревшим отчётом. Затем подготовить свежий полный E2E ZCode GLM-5.3-Flash/max + OpenAI gpt-6-luna Decisions threshold0.7/retries2, Judge gpt-6.1-sol/high, без stop_after. Реализация, установленный артефакт, startup и полный MERGE/Final Judge PASS — разные критерии.

Не исправляем продукт руками, не ослабляем assertions, ownership/fencing или native completion. CP223 EVAL-20261012042737-230b5f48 сохраняется без resume/restart/manual repair. Bridge636b141 исправил прошлый inferred completion: PLAN пройден, native_outcome_unknown не повторился. Новая задача не требует повторного bridge upgrade0.52.0.

UTC-цепочка CP223: WRK-016 completed08:04:50; RCP-018 API integration failed08:08:36 (21/22 PASS, один Vitest timeout5000ms); WRK-017 repair создан08:24:33, не стартовал; native provider ownership timeout/operation failure опубликован около08:25:27; EVAL observer recovery_blocked08:25:40; RUN settlement08:25:41; sealed capture ready08:27:10.

Failed maintenance receipts: phase startup, elapsed около29.9s, только request, нет imports_ready/COMMIT proof. Предыдущие heartbeat ACK занимали8–22s. Эти данные доказывают cutoff до подтверждения maintenance service graph, но не конкретный медленный import/syscall, SQLite lock или сон хоста. Время публикации ошибки не равно времени её возникновения; не интерпретировать gap между stderr и terminal как доказанный sleep.

Auth test ранее прошёл за1299ms (RCP-015), затем остановлен примерно5406ms при абсолютном Vitest5000ms (RCP-018). Тест/config/password helper совпадают с baseline; assertion failure не зарегистрирован. Тест содержит несколько последовательных API/DB/async scrypt await; точный медленный await не измерялся. Repeated integration suite:121s, collection около41s.

## 2. Реестр дефектов и расширения после аудита

| ID | Установленный дефект / граница доказательства | Общая точка исправления |
| --- | --- | --- |
| M1 | Абсолютный renewal episode30s начинается до первого RPC, sliding phases не продлевают hard commandDeadline; receipt после30s отвергается независимо от нового committed expiry | lease-renewal, native-hook-command, managed-daemon, managed-lease-monitor, EVAL runtime-maintenance |
| M2 | Каждый heartbeat запускает CLI; fast ingress всё ещё статически загружает engines/protocol/canon/binding и unrelated stop/budget/alias пути | runtime-maintenance-ingress и фактические import edges; причина конкретной исторической задержки не измерена |
| M3 | finishDaemonProcess запускает settlement budget до ожидания pending heartbeat — finish может не получить собственного окна | shared managed-daemon finish/queue fence |
| M4 | Controller сначала renew resource lease, затем MERGE RUN keepalive; отказ второго эффекта превращается в общий renewal failure, хотя первый COMMIT состоялся | run-controller + monitor, раздельные receipts/effects |
| T1 | Неявные total Vitest5s в integration/test configs, составной auth-сценарий без step timing; результат ошибочно читается как verification failure | owning test launcher/config/reporter; без продуктовых изменений |
| T2 | Ordinary nonzero exit классифицируется failed без структурированного runner outcome; generic repair назначается раньше установления source/tooling причины | code-checks + общая gate routing policy; отсутствие доказательства не означает PASS |
| T3 | CODE/CODE-REVIEW собирают status!=passed, repair-intents принимает failed/aborted, prepareVnextCodeRepair требует failed | единая допустимость repair evidence до создания Work |
| C1 | statusCleanupState требует terminal report; физический settlement/capture ready скрываются за report pending | отдельная read-only cleanup observation, сохранить legacy report state |
| C2 | worker требует lease.admission и для cleanupPending; ownership loss завершает наблюдение до позднего capture | существующий cleanup-only intent, ограниченные полномочия |
| C3 | runnerCleanupReceipt требует уже coherent terminal report, не может ingest late capture; один общий1s на lock/наблюдение легко даёт null без причины | recognition vs reconciliation APIs, progress-aware observation |
| C4 | runnerFinalizeSettled не cleanup-only: может запустить Final Judge; нельзя использовать как fallback expired observer | явное разделение cleanup и scored finalization capabilities |
| C5 | finally close/finish failure меняет recovery_blocked на failed, obscuring primary state | сохранить primary state/error, отдельный cleanup_error |

T3/M3/M4/C3/C4/C5 — дополнительные конкретные находки по коду, не утверждение, что все они сработали именно в CP223. Product findings (UI save race и createTask/archive race) были пойманы флоу и исправлены Subject; их качество оценивает Judge, это не основание править продукт из данного плана.

## 3. Общая maintenance policy и минимальный import graph

### 3.1 Семантические ограничения вместо одного30s

Переиспользовать ObservationClock, setup/maintenance phase contract и существующие lease receipts; не вводить новый daemon, БД heartbeat или cache authority. Все шесть managed harnesses и sync monitors получают одну policy в selected engine.

Разделить purpose: initial registration/confirmation, existing-owner renewal/admission, settlement/read-only observation, external hook. Interval tick — расписание, не timeout/progress. Cleanup grace, provider hook deadlines и реальные lease/security expiry не являются дефектными productive timers и сохраняются.

Для existing-owner получить last confirmed lease_expires_at + registration/token/owner/generation. Observation startup120s, storage quiet5s (совместимость с существующими defaults), useful distinct phases продлевают только своё окно. Допустимое ожидание ограничено оставшимся authority horizon, а не30s; safety margin1000ms включает нынешний500ms cleanup tail и250ms storage reserve. Для MERGE120s TTL это автоматически короче native300s/observer900s; не прошивать TTL заново в caller.

Получение authority horizon требует полного validated receipt. Отсутствующий/неверный expiry не даёт бесконечности или optimistic permission. Initial registration не имеет старой authority: startup silence finite120s и storage silence5s; native dispatch только после exact committed receipt и обычных RUN/generation checks. Внешний hook deadline остаётся отдельной жёсткой границей; внутренний DD_FLOW_HOOK_DEADLINE_AT — storage/authority deadline, не общий startup timer30s.

Не принимать поздний ACK автоматически и не отвергать только за elapsed30s. Сверять operation identity, process birth, id/token/registration, RUN fence/generation и текущий committed expiry. До подтверждения новая productive dispatch запрещена. Renew service может реально commit новую expiry после старой TTL: это новый факт, не продление authority таймером; принимать его только если owner/fence не заменён и operation физически settled. Уже sealed recovery/terminal EVAL не возобновляется этим путём.

Разделить monotonic inactivity и wall-clock expiry. После observation gap/wall jump re-read current authority; не считать scheduled tick доказательством смерти/здоровья. Журналировать failure_at отдельно от publication_at, queue/startup/storage timings, clock evidence, latest phase, previous/new expiry и эффекты.

### 3.2 Reconciliation и cleanup

Typed no_effect разрешает повтор exact operation с backoff существующей policy. UNKNOWN ACK/COMMIT требует сначала physical settlement исходного child/subtree, потом readback exact binding/effect; не второй конкурентный writer. Cleanup-unconfirmed сохраняет poison/fence. Не повторять productive prompts или перенаправлять на другой engine.

finish: отдельно наблюдать ожидание предыдущего maintenance flight; после его physical settlement начать окно самого finish. Не удерживать writer transaction во время await. Не превращать cleanup receipt в productive admission.

Resource lease renewal и optional RUN/MERGE keepalive — два независимых committed effects. Сохранить успешный resource receipt даже при отказе второго; dispatch fence второго остаётся обязательным. Не вводить cross-DB transaction и не продлевать RUN authority успехом resource heartbeat. Диагностика/повтор адресуют только непроверенный эффект.

### 3.3 Узкий ingress

Проверить реальные imports origin/main: compatibility-preflight → engines → protocols/canon/projects/audit/run-binding; command-context → contextual work helpers; runtime-process → register/stop/reconcile/budget. Вынести/lazy-load только нерелевантные internal exact-id/token heartbeat/status/confirm зависимости. Общие parsing, validation, compatibility semantics и ownership checks переиспользовать; никакого второго облегчённого permission router.

Measure request→imports_ready и module graph на установленном артефакте, а не fixture с mocked tiny CLI. Если minimal cut недостаточен, это отдельный измеренный follow-up, не заранее новый resident broker.

## 4. Проверки: наблюдение отдельно от functional verdict

### 4.1 Evidence contract

Расширить общий CheckReceipt versioned optional runner evidence: completed pass/assertion failure, tooling timeout/failure, observation_unknown, unclassified terminal failure; mixed failures сохраняют все категории. Legacy status/exit_code читаются. Для compiler/lint и обычных checks сохранить существующий success protocol (exit0 + требуемые артефакты/прочие guards); не требовать новый reporter от всех команд. Для test checks с явно объявленным required structured report отсутствие этого отчёта не PASS. Nonzero без runner category остаётся unclassified, не функциональный verdict. Timeout command observation остаётся aborted/unknown, не business verdict.

Не распознавать business failure regex по stderr. Для managed Vitest/Playwright использовать доступный штатный reporter + небольшой совместимый adapter/step reporter без новой библиотеки. Категории только из структурированных фактов runner/wrapper; если runner не даёт стабильного timeout code, сохранять unclassified и передавать диагностику, не угадывать.

Bind evidence к invocation/check id, exact executable/command, input_hash/verification epoch и completion receipt. Файл/stdout Subject сам по себе не self-certifying success. Untrusted/missing/truncated/foreign reports — unknown; actual nonzero не может стать PASS. Валидный shell exit отличать от корректности верификации.

Единая routing функция для baseline, CODE, CODE-REVIEW, MERGE: assertion-backed failed проверка допускает source diagnosis/repair; tooling timeout/failure — отдельная tooling diagnosis, без требования менять продукт; aborted/unknown — observation/ownership/settlement, без failed-only repair Work. Legacy unclassified settled nonzero остаётся закрытым gate и diagnostic assignment, не автоматический функциональный verdict. Baseline product failure запрещает Subject dispatch, а не создаёт product repair Work; одинаковой должна быть классификация причин, не назначение стадий. Продуктовая ошибка может сочетаться с tooling failure: ни одну не скрывать.

Согласовать repair-intents, prepareVnextCodeRepair и collectors: repair создаётся только при одинаковой проверке evidence eligibility; повторное подтверждение exact input при dispatch. Существующий MERGE source/environment принцип распространить, а не создавать новую policy hierarchy. Повтор failed checks только после установленной причины/изменения и clean isolated test world, с linkage retry_of; не повторять до зелёного.

### 4.2 Owning test tooling, не продукт

В будущей dd-tasks baseline исправить launcher/config/tests как tooling-only change. Исторические project/feature checkouts и их DB не менять. Записать новый source/checkpoint lineage и явный diff, flow pack/canonical decisions не менять без необходимости. Не прятать исправление в ручной runtime patch до baseline.

Сначала внешний finite inactivity watchdog в существующем test-world/check runner; только после этого отключить implicit per-test/per-hook total timers в его managed режиме. Прямой запуск Vitest без этого watcher не должен остаться без защиты. Standalone и EVAL должны пользоваться одним launcher contract.

Продвижение: фактические collection/setup завершения, completed test, завершение awaited сценарного шага; не timestamp heartbeat и не повтор одного running event. Долгий один await без новых сигналов завершает observation как tooling timeout/unknown. Не fabricating progress вокруг scrypt/DB. Auth составной тест разделить на регистрацию/duplicate и session rotation/expiry с сохранением assertions, предусловий/isolation и fail-fast ошибок.

Аналогичные implicit Vitest budgets root/API/web, Playwright webServer startup120s и assertion/test timers инвентаризировать. Readiness ожидать по настоящим startup/probe событиям, не повторной записи идентичного running статуса. Явные performance budgets оставить только где есть отдельный requirement/contract; cleanup TERM→KILL и postgres end timeout сохранить.

## 5. Cleanup / capture / finalization

В runnerStatus добавить separate versioned observation с физическим settlement, capture readiness и experiment finalization. Existing cleanup_state оставить агрегатным report-state для совместимости, но явно назвать его смысл. RUN/project/control/recovery/generation/manifest/input revision, canonical paths, current sealed control и проверенные snapshot bytes обязательны; просто отсутствие PID не settlement proof.

Read-only status не пишет events/reports/DB, не вызывает stop/resume/Subject/Judge. Missing/stale report не скрывает current physical evidence и не объявляет whole EVAL terminal. Unavailable/current foreign proof — unknown, не pending бесконечно без diagnostic и не settled.

Переиспользовать existing intent.kind=cleanup и runnerCleanup(cleanupOnly=true) для late-capture ingestion. После productive ownership failure только authority-independent read-only observation или явно ограниченный cleanup intent с собственным exact ownership permit. Нельзя обращаться к runnerFinalizeSettled под одним cleanup разрешением: он может вызвать paid Judge. Scored finalization требует fresh appropriate authority; никакого native replay.

runnerCleanupReceipt остаётся recognition-only с прежним именем; ingestion — существующий runnerCleanup(cleanupOnly=true). Вместо silent catch→null и общего1s cold scan/lock возвращать pending/unknown с причиной. ObservationClock startup120/control30 для read-only сбора, caller cancellation и recovery scope horizon сохраняются; никакой timer не удерживает productive owner.

Если observer уходит раньше capture, записать точный recovery_blocked reason + readiness, достаточный для последующего authorized cleanup, не resurrect observer. В finally сохранять primary status/error при finish/close failure, прикладывать cleanup_error. Physical settlement, capture sealed и experiment report completed никогда не взаимозаменяемы.

## 6. Аудит покрытия: обязательные siblings

Runtime: harness-runtime/lib/{lease-renewal,native-hook-command,managed-daemon}.mjs; все dd-{codex,zcode,grok,agy,opencode,droid}-daemon callers; services/{managed-lease-monitor,run-controller,run-control-worker,runtime-scope-worker,merge-server,managed-processes,code-checks}; cli/{runtime-maintenance-ingress,runtime-process,command-inputs}; services/{compatibility-preflight,engines,command-context}.

Checks: services/{code-checks,repair-intents,vnext-code,vnext-code-review,vnext-merge}; source report/receipt schemas; baseline-admission и check consumers в dd-eval. Fixtures: apps/api/vitest.integration.config.ts, core.integration.test.ts, scripts/test-world.ts; root/web Vitest и Playwright configs. Не расширять аудит до rewriting всех числовых timeout: классифицировать productive inactivity, readiness, safety cleanup, performance contract, authority expiry.

EVAL: lib/{runtime-maintenance,eval-resume-worker,runner,baseline-admission,process-json,observation-clock,recovery-observation-budget}; runnerStatus/statusCleanupState, executionCleanupPending, captureRecoveryEvidence, runnerCleanup/runnerCleanupReceipt/runnerFinalizeSettled; ordinary run, fork/start, cleanup, stop, retained Judge cleanup и legacy reports.

Три read-only субаудита lease/checks/cleanup проверены главным агентом по конкретным callers и conditions. Новый code inventory перечисляет дефекты и retained rationale; не выдаёт grep всего timeout за доказательство отсутствия иных ошибок.

## 7. Проверки и порядок реализации

1. Tests first: fake clocks/структурированные fixtures в существующих suites. Maintenance: >30s productive startup при действующем lease проходит; silence конечна; expiry/replacement/generation change запрещает productive use; valid committed late ACK reconcile; unknown effect не дублирует write; finish budget не уходит на predecessor; два DB effects раздельны; external hook deadline не расширяется.
2. Реализовать common policy/import cut, проверить all-six-harness + sync controller/control/scope/MERGE + code-check + EVAL observer parity. Real cold import installed graph regression, output limits/redaction, cancel/physical cleanup, no writer-held await; delay injection в безопасной isolated fixture, не намеренная нагрузка на user host.
3. Check routing regressions: assertion stays failed/repairable; terminal runner timeout/unclassified не даёт product verdict; aborted не входит failed-only path; mixed failure остаётся failed/unknown appropriate; чужой/старый/truncated report не PASS. Baseline/CODE/CODE-REVIEW/MERGE одинаковы.
4. Test watcher: progressing scenario >5s проходит, silent await finite stops; event loop observation gap не assertion; cancellation settles subtree/DB; direct Vitest без managed watcher остаётся bounded; real auth assertions не упрощены.
5. Cleanup: ownership loss before settlement→late sealed capture; stale/missing report не скрывает physical state; read-only status без side effects; foreign control/generation/path/changed manifest rejected; cleanup-only no Subject/Judge; scored finalization separately authorized; root failure переживает finish failure. Existing monitoring-status/runner-recovery/execution-contract tests расширить.
6. Typecheck/lint/build и affected suites. Evidence сохранять: исходный failed test, причина, исправление, повторный результат. Не считать targeted suites полным official release gate. Интегрировать через reviewed PR по git-workflow, без primary main reset и вмешательства в параллельную работу.
7. Новый exact engine artifact + installed snapshot checks; refreshed hooks для qualified harnesses и обоих Codex homes по runbooks. Bridge636b141 pinned, native current binary. Новая tooling-only baseline/checkpoint при необходимости, matrix receipt к exact engine. Judge semantic corpus повторно не вызывать при unchanged model/prompts/oracle/canon.
8. Fresh home и standard preflight; CP223 retained. Следующий E2E: baseline PASS, native Session, actual SPECIFY/productive dispatch; затем полный PLAN/CODE/repair/re-review/MERGE/Final Judge и confirmed resource settlement. На blocker сохранять causal evidence; не вручную исправлять продукт. Новый scored запуск требует отдельного разрешения, если реализация заказана без запуска.

## 8. Ponytail / readiness review

Минимальный фикс в shared clock/policy/routing и existing cleanup mode; stdlib/existing reporters, без нового maintenance daemon, DB или framework. Не увеличивать все timeout произвольно, не объединять два DB commits и не добавлять provider-specific исключение.

Обязательные решения закреплены: authority vs observation, validated expiry/margin, startup/storage defaults, effect-aware reconciliation, trust-bound runner evidence, aborted routing, watcher-before-disabling timers, physical/capture/report separation, cleanup-only capabilities, historical immutability, deployment/pins и критерии startup vs completed E2E.

Implementation checkpoints: concrete reporter adapter must demonstrate structured evidence for the exact installed Vitest/Playwright versions; unsupported outcome remains unclassified (not guessed). Cold import measurement identifies effective minimal cut; historical stalled module remains unknown. Neither limitation разрешает снижать gate или повторять paid qualification без изменённых семантических входов. Готовность определяется также уточнениями ниже; она не означает гарантированного полного PASS до живой приёмки.

## 9. Уточнения готовности к реализации

### 9.1 Clocks, retries и границы эффектов

- Startup120s — окно отсутствия полезного startup progress, не разрешение каждые120s создавать новый episode. Повтор no_effect, backoff, busy/lock refusal и повторное чтение того же receipt не сбрасывают окно. Оно принадлежит всей операции и сохраняется между попытками. Cancellation и authority horizon имеют приоритет.
- Storage quiet5s начинается при dispatch storage RPC, не при попадании в очередь и не при запуске Node. Ожидание predecessor наблюдается отдельно, но тоже ограничено authority/settlement budget. Уже загруженный sync monitor не получает дополнительного cold-start allowance.
- Remaining authority вычислять из validated wall expiry при каждом dispatch/ACK; monotonic clock измеряет inactivity. Новую границу можно принять только из verified committed renewal receipt. При wall jump/gap повторно прочитать authority; до этого productive admission закрыта. Если margin уже съел horizon — reconciliation/settlement, не попытка с отрицательным timeout.
- Не смешивать UNKNOWN effect и no_effect. UNKNOWN не повторять даже после backoff до physical settlement/readback. Для двух controller effects хранить отдельные результаты; повторяется только доказанно не выполненный эффект. Read-only reconciliation не отменяет expired ownership.

### 9.2 Конкретный контракт check evidence и маршрутизация

Использовать code-check-profile@7 с optional runner_evidence_by_alias: alias → { schema_id: "dd-flow/check-runner-evidence@1", path: относительный путь в DD_FLOW_EVIDENCE_DIR }. Читать @6 без изменений; новые поля валидировать, учитывать в profile hash и source/target MERGE comparison, включая existing/planned aliases. Required report автоматически входит в required_artifacts. Не менять enum status и не вводить отдельную БД: optional runner_evidence в JSON receipt и существующий retained artifact; старые receipts читаются без него. Инвентаризировать все сериализаторы/читатели, а не только TypeScript type.

Evidence@1 содержит invocation/check binding, runner/version, completed flag, counts и список структурированных failures с category assertion|tooling|unclassified; observation_unknown задаётся wrapper, не Subject. Pass требует terminal completion, exit0, completed report без failures и прежних guards. Nonzero плюс пустой/pass report — contradiction/unclassified, никогда PASS. Missing, malformed, foreign или truncated report при required contract закрывает gate; mixed categories сохраняются вместе. Хеш отчёта подтверждает retained bytes, но не делает agent-controlled reporter независимым oracle: Judge продолжает оценивать достаточность проверок.

Одна pure eligibility/routing функция используется всеми collectors и dispatch. Assertion evidence разрешает существующий source repair. Tooling/unclassified без assertion останавливает автоматический product-repair и возвращает actionable diagnostic/blocker с receipt/category; не добавлять новый diagnostic Work lifecycle в этом плане. Aborted/unknown сначала требует settlement, а не repair. При mixed outcome tooling/ownership blocker устраняется до product-repair dispatch, assertion не теряется. Baseline никогда не назначает Subject repair. Автоповтор до зелёного запрещён; новый check возможен по обычному flow после конкретного исправления с retry_of и причиной.

### 9.3 Watchdog должен охватывать запуск целиком

Текущий test-world создаёт БД, выделяет порты и пишет setup receipt до spawn; unit/web обходят его. Поэтому watchdog включать до первого setup await, а не только вокруг Vitest. Выделить минимальный stdlib observation helper, использовать в существующем test-world и лёгком launcher для unit/web без ненужной БД. Все package scripts baseline/EVAL направить через эти entrypoints. В managed режиме отключать total test/hook timers только после установки watcher; неподдержанный прямой запуск сохраняет штатные конечные timers, не получает timeout0 автоматически.

Дефолты managed test observation: startup silence120s, execution silence600s, настраиваемые через один launcher contract; это inactivity, не лимит длительности теста. До применения проверить согласование с outer code-check policy: outer окно не короче inner плюс bounded cleanup tail. Для объявленного structured runner progress outer clock читает тот же монотонно растущий sequence, а не arbitrary stdout; legacy command observation остаётся прежним. Reporter writes в выделенный append-only progress файл, путь создаёт launcher; ограничить размер/разбор, проверять invocation и не следовать foreign paths/symlinks. Сохранить stdout/stderr для диагностики.

Vitest3.2.7 предоставляет onTestRunStart/onTestModuleCollected/onTestCaseResult/onTestRunEnd; Playwright — onStepEnd/onTestEnd/onEnd. Использовать фактически установленный API, terminal statuses и ошибки, не текстовый поиск timeout. Collection/module/test/awaited-step completion — progress; тестовый start допускается один раз, дубли и polling readiness не продлевают окно. Setup progress — только завершение конкретного setup шага. На один silent await приходится finite inactivity window; event-loop gap — uncertainty, не assertion failure.

Playwright test total timer отключать только в managed watchdog режиме. expect/action readiness остаётся конечной проверкой конкретного постусловия, а не таймером всей работы агента; timeout без структурированного assertion evidence не объявлять продуктовым verdict. webServer startup наблюдать по реальным фазам/probe переходам, отсутствие переходов конечно. В scored режиме retries=0, чтобы CI retries2 не скрывали исходный failure; последующий retry оформляется flow receipt. TERM→KILL, drop DB и failure primary preservation обязательны и при ошибке setup до child spawn.

### 9.4 Cleanup projection и права

Добавить cleanup_observation@1: physical=live|settled|unknown; capture=pending|ready|unknown; finalization=pending|completed|blocked|unknown; reason/evidence_refs для каждой части. No-RUN baseline failure отражать как not_applicable для physical/capture, а не выдуманный settlement. Несколько executions агрегировать без потери per-execution фактов: settled/ready только когда все applicable bindings доказаны. Legacy cleanup_state оставить прежним, не переопределять его значения.

Status только читает. Cleanup intent может ingest exact sealed capture и обновить локальную projection при текущих binding/input revision; перед записью повторно проверить их под существующим writer fence. Он не получает права на Judge или Subject. Утрата observer не создаёт автоматически новую automation/owner: последующий cleanup запускается уже авторизованным entrypoint. Final Judge после cleanup — отдельная scored finalization с действующей authority. Cancellation/ошибка cleanup сохраняет исходную причину; unavailable evidence остаётся unknown с diagnostic.

### 9.5 Реализация и приёмка без скрытых предварительных условий

До кода зафиксировать выбранные clean branches и AGENTS/git-workflow каждого owning repo. Недоступный Git fetch не заменять утверждением, что cached origin актуален: сверить HEAD перед интеграцией. Tooling baseline change публиковать отдельным commit в owning dd-tasks repo, не патчить исторический EVAL и не менять продуктовые требования. Новый engine номер назначается release workflow, artifact/pins фиксируются по фактическому build. Qualified hooks и source checkpoint обновляются на exact artifact; semantic Judge qualification переиспользуется только при совпадении её реальных зависимостей.

Матрица приёмки обязательна: M1–M4 fake-clock/late-ACK/two-effect/import installed-artifact regressions; T1–T3 real Vitest/Playwright adapter и baseline/CODE/CODE-REVIEW/MERGE routing; C1–C5 late capture, legacy/multi-execution/no-RUN, read-only purity, cleanup-only no Judge и primary error preservation. Negative cases проверяются на malformed evidence, replacement fence, unknown COMMIT, silent setup и cancelled cleanup. Affected suites плюс typecheck/build не заменяют release gate. Живой новый E2E — отдельный итог: baseline, PLAN за прежней точкой отказа, CODE checks/repair/re-review, MERGE, Final Judge, physical cleanup. Если новый product finding выявит Subject/Judge, сохранить его отдельно; выполнение tooling плана не означает ручного исправления продукта или обещания полного PASS.

## 10. Реализация и границы delivery

Рабочие ветки: dd-flow `fix/081-maintenance-check-outcomes`, dd-eval `fix/081-eval-cleanup`, dd-tasks `fix/081-test-observation`; tooling-only baseline — отдельная `fix/081-eval-baseline`, не PR с откатом текущего продукта.

| Scope | Реализовано |
| --- | --- |
| M1–M4 | Одна authority-aware policy во всех managed owners; persisted expiry и safety margin; effect-aware exact readback после physical settlement, без повторения UNKNOWN write; раздельные resource/RUN результаты; finish получает собственное окно после predecessor. Scope-free CLI ingress не импортирует engines/canon/router. |
| T1 | Watchdog установлен до setup; реальные setup/collection/test/step события, а не stdout/heartbeat. Managed Vitest/Playwright не ограничены total duration; direct unmanaged запуск остаётся bounded. Test-world владеет startup/readiness и cleanup. Auth assertions сохранены в отдельных сценариях. |
| T2–T3 | Profile@7 bound runner evidence; @6 читается. Одна eligibility policy для baseline/CODE/CODE-REVIEW/MERGE и repair dispatch. Assertion/tooling/unclassified/mixed сохраняются отдельно. Missing/foreign report никогда не PASS, failed receipt не повторяется до зелёного. |
| C1–C5 | Независимые physical/capture/finalization observations; exact sealed snapshot/control/manifest checks перед ingestion/publication; recognition-only read; cleanup-only не вызывает Subject/Judge; новый paid Final Judge требует fresh authority; finally сохраняет primary error. |

Runtime commits `8c07811` и `f06fef8` опубликованы в [PR59](https://github.com/deksden-com/dd-flow-cli/pull/59). Tooling main commit `423091b` — [PR8](https://github.com/deksden-com/dd-tasks/pull/8); baseline `26bf561f175450337a999fdb114580e641c99cde`, immutable tag `eval/cp-224-tooling-baseline-v2`. Product `apps/api/src`/`apps/web/src` равен исходному d81cd0a. Flow pack1fdebb7, canon4.1.2/2ba0b9c, bridge636b141 и Decisions0.7 не меняются.

Финальный gate обнаружил и закрыл дополнительные дефекты: shared `reportedFailure` не распознавал pretty error envelope после setup JSONL (пять FLOW сценариев); observer передавал heartbeat-only registration hash в check-admission. Добавлены parser regression и admission ABI regression. Два устаревших теста обновлены под async route rejection и committed lease authority, отрицательные проверки сохранены. Beta.131 остаётся неприемлемым immutable local candidate, не перезаписывается; следующий артефакт — beta.132.

Local candidate `/Users/deksden/.dd-eval/qualification/plan-081-beta132`: source `f06fef872fda67703b109a8546edc8c93c9b03b3`, tarball SHA256 `7f47b27dcb525fd523e22492abfeb490ebf0992a4674083fd83d20c3cd3b05af`, installed full-content SHA256 `f4073ed69501cd2f330d9ba8b7fd01bd05703d865e9a126e010b18facfb86543`. Standard release-candidate pack сохраняет `status=built`, не fabricated accepted/publication. Consumer verification повторена главным агентом: exact version/commit/canon, compatibility, native compound parser и profile@7 PASS; dd-eval full-content verifier подтверждает тот же digest.

Новый `cp-224-zcode-decisions-maintenance` связывает baseline26bf561 с engine132; case reference checksum проверен механически. Matrix qualification@3 `cp-224-verification-matrix-qualification.json` SHA256 `821c78b7b7f4646fff37c3fae9686ff7e135c8ac8f1f31b313da5b49c467b2ae` произведена стандартным producer из actual installed PLAN/PLAN-REVIEW/CODE/MERGE publications; CODE-REVIEW off имеет явную fixture reason. Retained packet bytes и их hashes проверены обычным admission, не заменены перечнем существующих schemas. Это offline contract fixture, не приёмка полного scored E2E. Profile остаётся ZCode GLM-5.3-Flash/max, bridge0.46.7/636b141, gpt-6-luna Decisions0.7/retries2, Judge gpt-6.1-sol/high, без stop_after.

Code implementation, local candidate qualification, registry publication, hook delivery и полный scored E2E — отдельные результаты. В этом задании нет нового E2E, merge или замены global hook runtime: runbook требует hook refresh после опубликованного engine. CP223 не возобновлялся; его артефакты/БД не изменены. Живая приёмка §7.8 остаётся следующим отдельно разрешённым запуском, не свидетельством, которое можно изготовить из тестов.

Финальная проверка:

| Gate | Результат |
| --- | --- |
| dd-flow strict canon build / typecheck / lint | PASS; immutable132 собран после source commit f06fef8 в clean detached checkout |
| dd-flow release | 2 Node checks + 8 Vitest tests PASS на exact132 build |
| dd-flow full integration | 138 files, 2368/2368 PASS, 2268.14s; без unhandled errors |
| dd-flow runtime-sensitive | 46/46 PASS на exact132 build, 197.47s |
| dd-eval full | `DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-081 npm test`: 794 PASS / 804 total / 10 explicit opt-in skips, 0 failures, 245894.67ms; committed CP224 и обновлённое golden source ожидание |
| dd-tasks tooling | Watchdog13/13 в обоих source trees; real installed Vitest3.2.7 и Playwright1.62.1 assertion/tooling/mixed regressions; main API integration15/unit31/web16/browser8, baseline integration11/unit29/web11, world isolation, typecheck/build/lint PASS |
| Installed proof / matrix / pins | Exact content verifier + consumer smoke PASS; offline matrix publication fixture1 PASS (25 filtered), 4 owning stage packets; checkpoint/profile admission PASS; remote baseline tag26bf561 verified |

Intermediate failures сохранены как факты, не замаскированы повтором: runtime initial full gate2357 PASS/7 failures (parser5 + async/golden tests2) исправлен и повторён полностью. EVAL uncommitted CP224 закономерно отвергнут definition drift; после commit stale d81 source expectation обновлено на tooling-only26bf561, полный gate повторён и прошёл. Targeted EVAL invocation без required `DD_FLOW_SOURCE_ROOT` не считался доказательством: final full command задаёт явный source. Product assertions, negative ownership/effect cases и обязательность bound evidence не ослаблены.

dd-eval implementation/pins `b34627a`, golden test `0bc19f7` — [PR75](https://github.com/deksden-com/dd-eval/pull/75); этот receipt публикуется отдельным documentation commit. Рабочие implementation branches pushed, без merge и без rewrites main/tags. Временный build checkout удалён после проверки; tarball, installed consumer и fixture evidence сохранены в qualification home. Judge semantic corpus повторно не вызывался: его реальные семантические входы не изменены.

Технический эпизод: ошибочный cherry-pick `f1eeec1` в primary dd-tasks немедленно компенсирован своим revert `4a5f59a`; tracked contents восстановлены, чужие untracked сохранены. Эти два net-zero локальных коммита не пушились; правильные tooling commits опубликованы только в указанных рабочих ветках.

## 11. Независимое ревью реализации — 2026-10-12

Последующий review supersedes beta.132 как текущий candidate, но не переписывает
предыдущие артефакты или evidence. Новые scored E2E не запускались.

| Находка | Исправление и регрессия |
| --- | --- |
| Admission читает устаревший daemon.json expiry, хотя gate уже подтвердил renewal в retained owner | После gate используется exact retained receipt по process/token/registration identity. Проверены stale disk и capacity queue дольше исходных 300s; expired/unknown/replacement по-прежнему запрещены. |
| Невалидный/чужой capture мог разрешать finalization, потому что блокировались лишь два error code | Общая capture classification закрывает finalization и recognition при любом непроверенном capture; retained recovery id не заменяет проверку текущих bytes/binding. Missing workspace также блокирует известный native RUN. |
| Recognition cancellation не достигала read-only CLI revalidation | Signal передаётся обоим RPC; abort не превращается в pending. Регрессия проверяет физическое завершение зависшего child и неизменность events. |
| Completion A→blocked B→A теряла восстановленный текущий статус из-за дедупликации по всей истории | Только completion сравнивается с последним completion этого RUN; прочие historical idempotency contracts сохранены. Natural cleanup→receipt подтверждает restored state и повторную идемпотентность. |
| Prepared preflight folders ошибочно считались native execution | Pre-native exemption определяется отсутствием RUN/Session/managed binding, не наличием папок; known identity требует capture. Status учитывает также retained recovery.run_id при утрате binding. |
| Foreign retained recovery.run_id не сравнивался с managed binding и мог молча заменяться текущим RUN | Capture ingestion и status сверяют все три retained RUN identities; противоречивая история не переписывается и не даёт settled/capture-ready. Четыре negative assertions воспроизвели обход до исправления. |
| Малформированный runner_evidence отвергался лишь при dispatch | Общий validator проверяет contract уже при declaration/admission. Защита до записи существовала и раньше: это не подтверждённый write-escape дефект. |

Runtime review commit `43d88ec57e1b100fa29f31be925d6abfc976e7a2`, beta.133;
local candidate `/Users/deksden/.dd-eval/qualification/plan-081-beta133`.
Tarball SHA256 `5019b8ca414c7f5dd92cb88fb1efb824d64f4bf499acf00e934aa0452abdc1bb`,
installed full-content SHA256 `4bebfd8ea4ebf5308b371abdc01d834bc168908c5075df0662a485dc87f1f5eb`.
Главный агент повторил installed consumer verification: exact commit/canon,
compatibility, native compound parser и profile@7 PASS. Стандартный producer
получил четыре owning stage packets из installed matrix fixture, не из списка
schemas. CP225 receipt SHA256 `495f6aff2016c8c608c6788f214567d3234fa3815beafe9c70ea6fa7bf7495a5`;
case checkpoint checksum `ed34821a1092ab137fc3796e0c36e98330ff2173b6ba08bd362dbcba65c2b7ec`.
CP224/beta.132 сохранены. Candidate остаётся `built`, не registry published,
не live accepted; semantic Judge qualification не повторялась.

Точечные runtime regressions: daemon/monitor59 PASS, code-check evidence71 PASS.
EVAL recovery/fork/cleanup/Judge/managed-resume regressions91 PASS; missing-binding
status2 PASS. Watchdog dd-tasks13 PASS. Общие gates повторяются на final source;
результаты и merge readback фиксируются после их завершения.

Чистка сохраняет историю: integrated branches удаляются после ancestry/merge
proof; superseded CP211 и старые baseline альтернативы архивируются тегами,
а не объявляются merged. Ignored qualification receipts экспортированы в
private archive и проверены byte-for-byte. Активные memorybank ветки, divergent
primary main, dirty/unique work и непроверенные источники не удаляются.

Побочный инцидент локальной проверки: npm install без private package.json
выбрал ancestor `/Users/deksden/node_modules`, удалил 28 прежних package paths
(включая docx/pptxgenjs) и добавил candidate dependencies. Global pnpm runtime
не затронут; correct isolated consumer затем создан с `--prefix`. Точных прежних
версий нет в lock/log, cache неоднозначен; восстановление не заявляется.
Inventory/log сохранены в candidate home `ancestor-install-incident.md/.log`;
пользователю сообщено и предложено отдельное восстановление известных cache
версий без изменения чужих репозиториев.
