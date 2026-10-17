# 091 — Readiness, исполняемые prerequisites, наблюдение проверок и диагностика

Дата: 2026-10-17. Статус: реализован и интегрирован; результаты проверок и граница
live acceptance описаны в разделе 9. Изолированный public-API probe — в разделе 8.
Ponytail: full. Цель — устранить подтверждённые причины остановки пяти E2E и
аналогичные дефекты общих механизмов, не исправляя оцениваемый продукт вручную.

## 1. База, область изменений и ограничения

Исследован engine `995243962934773092d9d2a127b0e1224baa622d`, beta.140,
из `dd-flow-cp233-retirement-physical`; EVAL `d0bca5b` из `dd-eval-cp234-grok`.
Именно этот engine использован в рассматриваемых попытках.
Checkpoint `checkpoints/cp-233-final-runtime.json` закрепляет:

- subject/tooling dd-tasks: `f36145464688040a81fd218520b1426710091e79`;
- flow pack: `1fdebb7de50ad764b6a35fb8ef2b30cb2e0e5be9`;
- исходный продукт: `26bf561f175450337a999fdb114580e641c99cde`;
- canon 4.1.2: `1ddedf9d3f086e046f8e7b194c739ec386e7c8b9`.

Пути engine ниже относительны его repository, пути test tooling — закреплённому
dd-tasks, а не случайному текущему main. В локальном dd-tasks main `4a5f59a`
наблюдение тестов было отменено revert; переносить main целиком в checkpoint
нельзя. Реализация tooling: отдельная ветка от закреплённого source commit,
с diff только инфраструктуры тестирования/DB и flow policy. Product feature
из исторических candidate workspaces в baseline не переносится.

Разрешённый будущий scope: engine, адаптеры, EVAL evidence/classification,
test-world/runner/DB tooling, общие инструкции проверки и негативные примеры
Judge. Не входят: app UI/API/schema task-priority, ручной repair старого EVAL,
переписывание его квитанций, новая native реализация Grok/ZCode/OpenCode,
новые scored E2E в рамках реализации без отдельного поручения.

Сохраняются: owner/generation fences, наблюдение реального прогресса,
различие product failure/tool failure/unknown, bounded overload episodes плана
089, запрет повторять продуктивные действия при неизвестном эффекте.
Проверки cleanup не отключаются. Исторические EVAL — read-only.

## 2. Зафиксированные инциденты и пределы доказательства

Evidence root: `~/.dd-eval/qualification/<home>/runs/<EVAL>/executions/e2e`.
RUN: `dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject`.

| Harness / home / EVAL | Факт и первопричина на подтверждённом уровне |
| --- | --- |
| OpenCode / cp-233-opencode-full / EVAL-20261017113954-e9d7d7f6 | PLAN accepted 12:35:12Z. Session-4 server слушает порт, plugin загружается; doctor/model.list возвращает ServiceUnavailableError «Location plugins did not finish activating». Единственная проба обрывает startup; внешний daemon_start_failed теряет retryable=true. |
| ZCode / cp-233-zcode-full / EVAL-20261017115834-7e0e9f29 | CODE RCP-014 db:check 15:06:54Z раньше RCP-015 db:migrate 15:06:58Z. Последняя применяет все три миграции. PLAN prose требует обратного порядка, array ему противоречит. Исходное SQL exception уничтожено generic catch. |
| AGY / cp-233-agy-full / EVAL-20261017123702-78623faf | WRK-011-prt-007-task-priority-p4/RCP-004: browser 6 passed/0 failed; world f2d47beb1a6744959744b7791e2ed7fd, затем cleanup_unconfirmed, cleanup_errors=[Error: kill EPERM]. Не product assertion. |
| Luna / cp-233-luna-full / EVAL-20261017133345-b569fdf6 | CODE RCP-009, world 35c14dc6d34d4eaa9ac85e8f06487e04. Trace call@139 ждёт отсутствующую ссылку Projects; последний step 15:56:11.495Z, внешний stop 16:06:11Z. Native action не ограничен, итоговый reporter report потерян; cleanup также EPERM. |
| Grok / cp-234-grok-full / EVAL-20261017171847-415bd00f | SPECIFY завершён, PROTOCOLIZE finish получает lint_gate_failed с result={}. Caller превращает пустой stdout/nonzero в findings и отбрасывает stderr/signal. Изолированный /usr/bin/false воспроизводит ту же ложную классификацию. |

Старый Grok auth failure `EVAL-20261017144332-edc460ea` не причина нового
инцидента: после исправления auth новый Grok 1.0.63 прошёл native smoke/children
и SPECIFY. Не повторять расследование закрытой authentication проблемы.

Не установлены и не подменяются гипотезой:

- почему ОС отвергла конкретный исторический kill: нет PID/PGID/signal/birth;
- какой stderr выдал исторический mb-lint: caller его не сохранил;
- конкретный PostgreSQL exception RCP-014: DB CLI его уничтожил.

Изоляция DB checkout-derived suffix работает; доказательств общей БД всех
EVAL или поломки ZCode bridge в этом инциденте нет. Дефекты progress ниже
подтверждены кодом, но не объявляются причиной исторической тишины Luna.

## 3. Дополнительный аудит: inventory и охват

Номера строк — audit base; перед реализацией сверить актуальный main.
Результаты трёх read-only направлений аудита перепроверены по исходникам.

| ID | Подтверждённый дефект / источник | Пакет |
| --- | --- | --- |
| D01 | stage-lifecycle.ts:924–950: empty stdout превращается в {}; exit0 принимается без схемы, nonzero приравнивается findings; stderr/signal теряются | P1 |
| D02 | vnext-protocolize.ts:395–437: rollback удаляет generated inputs; без отдельного failure capture нечего исследовать после сбоя lint | P1 |
| D03 | tooling.ts:249–263: tar/unzip listing error и unsafe archive объединены без process diagnostics; extraction теряет exit/signal. worktrees.ts:327–338 отбрасывает signal при sanitization | P1 |
| D04 | dd-opencode-daemon.mjs:359–366,479: HTTP ready предшествует location/plugin ready; model.list и plugin.list проверяются один раз, неактивный plugin смешан с отсутствующим/failed | P2 |
| D05 | dd-opencode-daemon.mjs:172: typed retryable startup cause обёрнут в retryable=false; identity endpoint проверяется после location probes | P2 |
| D06 | dd-codex-daemon.mjs:97,104 и dd-zcode-daemon.mjs:187–193,707: initialize failure не публикуется как startup_error; parent не замечает ранний exit и ждёт generic timeout | P2 |
| D07 | code-checks.ts:168,169,769–782: исполняются списки/первое появление команды, не prose prerequisites. readiness — итоговый gate, не неявный preflight (vnext-code.ts:184,817) | P3 |
| D08 | pinned dd-tasks apps/api/src/db/commands.ts:265: generic catch стирает cause/SQLSTATE; DB aliases не имеют runner evidence | P3 |
| D09 | scripts/owned-process.mjs + test-world.ts:58–60: первая non-ESRCH ошибка обрывает cleanup остальных детей; state-only liveLeader недостаточен для подробной диагностики | P4 |
| D10 | Те же throws из SIGTERM/SIGINT handlers, interval и escalation callbacks могут обойти final receipt/report | P4 |
| D11 | test-world final сохраняет String(error); assertWorldCleanup сворачивает причину; test-runner удаляет private temp до сохранения нужных деталей | P4/P7 |
| D12 | engine check-runner-evidence.ts:63–77 отклоняет progress >1 MiB как []; producer/wrapper допускают 4 MiB. Здоровый long run может стать «тихим» только для engine | P5 |
| D13 | test-observation.mjs:354–396: несколько процессов read-last-sequence→append(sequence+1) без сериализации; возможны duplicate cursors | P5 |
| D14 | test-runner.mjs:125–156 читает только последнюю строку, в отличие от engine; partial tail/bursts скрывают полные события | P5 |
| D15 | playwright.config.ts timeout:0 + неограниченный locator; wrapper убивает runner вместо native test failure. Reporter onStepEnd без active-step context | P6 |
| D16 | playwright-observation.mjs все timedOut/interrupted считает tooling; недостаточно доказательств для безопасного candidate-action repair | P6 |
| D17 | Candidate Luna expectTaskLayout пропускает пустой DOM; PLAN ZCode prose противоречит порядку. Это отдельные дефекты работы агента/ревью, а не повод вручную менять product | P8 |
| D18 | vnext-protocolize.ts:429–435: исключение при восстановлении файла/удалении directory маскирует primary error и может оставить частичный materialization | P1/P7 |
| D19 | dd-opencode.mjs:45–65: default RPC timeout 1800000 ms; readiness doctor не передаёт остаток startup budget. Внутренний probe не согласован со startup clock; parent может остановить его снаружи вместо typed probe completion | P2 |

Полный охват аналогичных путей:

- lint: оба callers — generic stage finish и PROTOCOLIZE materialize;
- commandResult: lint, tooling download/list/extract, worktrees, dashboard;
  download уже проверяет checksum, dashboard безопасно сообщает unavailable.
  Они не объявляются ложным PASS и не требуют общего JSON-framework;
- startup: OpenCode, Codex, ZCode, AGY, Grok, Droid. У последних трёх есть
  сохранение/чтение startup_error; закрепить общий контракт тестами, не переписать
  все адаптеры ради одинакового вида;
- checks: Work finish (work-registry.ts), aggregate CODE/readiness,
  CODE-REVIEW, MERGE, memory-verification-checks.ts и EVAL baseline;
- cleanup test tooling: test-runner, test-world, scenario-foundation,
  scenario-preview; engine/EVAL managed-daemon уже имеют reobservation;
- progress consumers: engine code-checks.ts:1003, EVAL baseline-admission.mjs:113,
  test-runner. Producers: world setup, Playwright/Vitest reporters;
- browser entry points: core/foundation/preview/keyboard specs и обычный,
  preview, keyboard configs. Общая fixture не должна обходиться одним import.

## 4. Принятые решения и детальные пакеты реализации

### P1. Результат инструмента: findings отдельно от ошибки исполнения

Файлы: engine stage-lifecycle.ts, vnext-protocolize.ts, tooling.ts,
worktrees.ts; существующие sanitizers и tests. Менять общий commandResult так,
чтобы он бросал на любой nonzero, нельзя: его контракт как раз возвращает result.

1. Валидировать именно LintReport установленного mb-lint: tool=mb-lint,
   непустая version, согласованный root, summary с безопасными целыми счётчиками,
   массив findings с валидными severity/ruleId/file/message. Проверить согласие
   счётчиков и findings; warning/info/suggestion не становятся blocking errors.
   У mb-lint 0.4.0 report.root=".": разрешать его относительно invocation cwd
   и сравнивать canonical path, не требовать абсолютного root в JSON.
2. PASS только при нормальном exit0 и валидном отчёте без error findings.
   lint_gate_failed только при валидном отчёте об error findings и ожидаемом
   exit1. Exit0 без валидного отчёта и валидный отчёт с противоречивым exit/summary
   — lint_gate_invalid_output. Nonzero без валидного отчёта, неожиданный exit>1
   либо signal — lint_gate_tool_failed, не findings. Spawn failure — unavailable;
   inactivity/observation failure сохраняет свой cause/phase. Нельзя подставлять
   {} как успешный отчёт; malformed stdout сохраняется как diagnostic excerpt.
3. В ошибках сохранить bounded redacted process evidence: binary/argv без
   secrets, exit_code/signal, stdout/stderr, phase и observation/cleanup details.
   Использовать существующие errorRecord/sanitization, не новый process SDK.
   Пределы: stdout excerpt 8 KiB, stderr excerpt 16 KiB; truncation явно отмечать.
   Полный linter report — отдельный ограниченный artifact, а не безразмерный error.
4. До rollback PROTOCOLIZE сохранить в RUN diagnostic dir выбранные пути,
   hashes/доступные bounded redacted generated documents и результат процесса.
   Диагностика не authority и не подменяет accepted result. Сохранить rollback;
   ошибка записи capture — secondary cause, исходную ошибку не стирать.
   Generic stage finish сохраняет тот же тип diagnostic result без зависимости
   от materializer. Следующий retry не перезаписывает предыдущий capture.
   Вложенный finally гарантирует rollback даже при capture failure. Каждый restore/
   remove выполняется независимо; primary lint/materialization error сохраняется,
   rollback errors и restored/unrestored paths — secondary facts. Partial rollback
   означает effect=unknown и tooling blocker, не разрешение повторить stage finish.
   Полный capture ограничен 1 MiB/attempt, ≤64 generated documents, ≤64 KiB/document;
   превышение — explicit truncation с путями/hash, а не потеря исходного сбоя.
5. При валидных findings по authored input — обычная коррекция stage, если
   существующая effect/rollback boundary это доказывает. Findings по engine-owned
   serialization или tool failure — tooling blocker, не product repair. Не
   разрешать blanket retry stage finish при unknown partial effect.
   Эта ветка не определяется одним тем, что файл сгенерирован: native report
   ruleId/file/location и известное преобразование должны связывать findings с
   конкретным authored field. Без такого mapping — tooling/unclassified. В этом
   пакете не создавать общий inferred mapper «любой generated lint → вина агента».
6. В tar/unzip разделить unreadable process failure и unsafe path; оба по-прежнему
   блокируют extraction. Сохранить process evidence. В worktrees не терять signal.
   Checksum/path traversal защиты не ослаблять; dashboard не рефакторить.

Регрессии: empty+0, empty+1, stderr runtime+1, malformed/несогласованный JSON,
valid clean, warning/suggestion-only, valid blocking findings, signal, spawn failure;
одинаковый verdict у обоих lint callers; capture переживает rollback;
capture/rollback failure не маскируют primary; partial rollback не даёт retry;
tar/unzip failure имеет диагностику.

### P2. Native startup: полная readiness и сохранение первичной причины

Файлы: dd-opencode-daemon.mjs, dd-codex-daemon.mjs, dd-zcode-daemon.mjs,
managed-daemon.mjs/error record helpers при реальном повторении; native fixtures.

1. OpenCode сначала проверяет owned PID/version endpoint, затем location model
   readiness и active required plugin (dd-flow либо dd-flow-security).
2. Startup использует существующий ObservationClock и startup budget. Признаки
   продвижения — реальные новые фазы native activation; повтор одинаковой
   «not ready» пробы не продлевает окно. Никакого sleep-на-пять-минут или total
   runtime cap поверх sliding window.
3. Повторять только read-only probes при типизированной transient недоступности
   location/activation. Это readiness polling до истечения startup inactivity
   window, НЕ provider retry episode с тремя попытками. Cadence 250/500/1000 ms,
   далее 2000 ms между probes, без обновления quiet clock одной неготовностью.
   Не переносить сюда продуктивные prompts/creates. Явный plugin failed/missing,
   неверная identity/auth/config — сразу соответствующая ошибка. Если native
   вообще не даёт достаточного состояния (включая пока пустой plugin.list),
   до истечения окна допускается только
   bounded наблюдение «activation unconfirmed», не выдуманный active/missing.
4. Активация plugin после успешного model.list тоже входит в ожидание. Doctor
   после startup остаётся health check, не скрытым бесконечным restart-loop.
   Каждому awaited probe, включая client initialization/import и RPC, передать
   оставшийся startup quiet budget и AbortSignal; default 30-minute client timeout
   в этом пути не используется. После нового подтверждённого startup progress
   остаток пересчитывается, отсутствие прогресса не продлевает запрос. Abort/
   observation failure запускает owned cleanup; оставленные фоновые read requests
   не считаются завершёнными только потому, что Promise.race уже вернул ошибку.
   Read-only Unauthorized/Forbidden/InvalidRequest/capability errors классифицировать
   по native typed cause до generic opencode_unavailable: auth/config не попадают
   в transient polling. Лог/текст модели для этого не используется.
5. Codex/ZCode сохраняют startup_error до выхода serve: исходные code/message,
   retryable/details и daemon_id; parent читает только текущую generation/daemon,
   замечает собственный early exit/signal. Для exit без retained cause — честная
   native startup exit error с process evidence, не автоматически retryable.
6. Cleanup startup сохраняет primary error, ошибки cleanup вторичны. Не
   объявлять предыдущий daemon restartable, пока физическое завершение неизвестно.
   Не захватывать старые startup_error из чужого/предыдущего daemon state.
   Ошибка публикации startup_error тоже secondary; записать bounded error record
   в owned daemon log. Если state сохранить не удалось, parent сообщает early
   exit с locator этого log, а не выдумывает успешно прочитанный native cause.

Регрессии: HTTP ready до location, model ready до plugin, failed/missing plugin,
foreign endpoint (никаких дальнейших probes), auth refusal; immediate initialize
failure Codex/ZCode доставляет typed cause без полного ожидания; stale state
не принимается; зависший safe RPC отменяется в startup window, не через 30 минут;
реальный новый activation progress продлевает окно. Positive AGY/Grok/Droid не
регрессируют.

### P3. DB verification: самодостаточный tooling-контур вместо prose dependencies

Файлы pinned dd-tasks: apps/api/src/db/commands.ts, target-guard/client/migrations
по необходимости, package scripts, code-check-profile.json; flow pack PLAN/
PLAN-REVIEW instructions/examples и engine check boundary tests.

1. Добавить tooling command `pnpm db:verify -- --target local --run-id {run_id}`
   и alias `@check/db-verify-local`. Resolve scoped target один раз → existing
   safe-target/ownership checks → создать разрешённую scoped DB при отсутствии →
   применить migration chain → проверить schema/ledger → bound RunnerEvidence.
   Никакого reset/drop/seed и работы с чужим/production target.
   Конкретный package route: root db:verify → @dd-tasks/api db:verify →
   `node ../../scripts/test-runner.mjs tsx src/db/commands.ts verify`.
   Existing evidence() пишет private DD_TASKS_RUNNER_REPORT, а wrapper публикует
   bound final evidence. Добавить этот literal route в hasTestWatchdog и его
   tests: direct CLI без wrapper иначе не получает private report destination.
   Success — completed=true, counts={passed:1,failed:0,skipped:0}; mismatch —
   completed=true, failed=1, failure category=unclassified; preparation/transport
   failure — completed=false, failure category=tooling. Progress только по реальным
   завершённым create/migrate/inspect phases, не по SQL polling.
2. Require flow-owned scoped local binding: run ID + checkout suffix + existing
   target guards. Один и тот же resolved target во всех шагах, без повторного
   чтения разных env. Plain developer db:check остаётся read-only; не делать
   прежнюю команду скрыто мутирующей. Developer migrate/reset/check сохраняют
   собственную явно отличающуюся семантику, не compatibility aliases нового flow.
   До mutation проверить именно local profile, допустимый run ID и suffix из
   codeExecutionEnvironment, отсутствие DD_TASKS_TEST_WORLD и соответствие имени
   resolved scoped target; base developer database без suffix не мутировать.
   Parse/URL resolve тоже внутри typed error boundary, не до main().catch.
   CREATE DATABASE race: только duplicate_database после create позволяет readback
   того же guard-approved target и переход к migration; чужие ошибки не подавлять.
   Existing migration advisory transaction сохраняется; applied checksum conflict
   — typed blocker, не повод reset/drop. Исправление уже applied migration требует
   обычного forward migration решения агента, не скрытой очистки tooling.
3. DB commands сохраняют безопасные code/SQLSTATE/operation/phase/cause, исключают
   passwords и connection URLs. Verification использует существующий RunnerEvidence
   binding invocation/check/input_hash/epoch, не параллельный формат acceptance.
4. В этой реализации connection/target/preparation failures — tooling; post-migrate
   schema/ledger mismatch без независимого candidate proof — unclassified с полной
   диагностикой. DB verify не создаёт test-world: существующий candidate_sql_integrity
   proof нельзя фабриковать для scoped local target. Новую DB repair rule в этот
   пакет не добавлять. Ненулевой exit не разрешает source repair. Уже доказанные
   candidate SQL failures в настоящем bound test-world сохраняют прежний путь.
5. Новые profile/PLAN примеры используют самодостаточный alias. Детерминированная
   граница задаётся новым project-owned code-check-profile.json: старый standalone
   @check/db-check-local не объявляется как aggregate alias, require_alias_for
   для raw pnpm db:check указывает @check/db-verify-local, который объявлен с runner
   contract и обязательной project readiness policy. Existing unknown-alias/raw-
   command validation возвращает correctable PLAN diagnostic до acceptance.
   Не зашивать имена dd-tasks команд в generic engine и не парсить purpose.
   Специализированный read-only test с реально подготовленным world может иметь
   отдельный явно объявленный project alias/contract; общего запрета таких тестов
   нет. Raw developer CLI за пределами managed check остаётся read-only.
   Обязательный alias закрепить в project mandatory_by_gate для readiness и merge;
   внутри Work он доступен при реальной необходимости, но не обязан запускаться
   для каждого мелкого Work. Не перезаписывать исходный developer target или
   добавлять DB verify в baseline-admission.json, где нет subject RUN/suffix.
   Baseline policy install/quality/browser/isolation остаётся прежней.
6. PLAN-REVIEW явно проверяет prerequisites и противоречия описания/исполнения.
   Это semantic review, не обещание детерминированно понять любой текст.
7. Не менять глобальный порядок work/code/readiness; не вводить generic DAG.
   Общий alias работает через Work, CODE, CODE-REVIEW, MERGE и memory verification.
   Для mutable DB state не добавлять reuse=deterministic: source hash не доказывает
   текущее состояние DB. Raw commands в специальных проверках не кэшировать иначе.

Регрессии: fresh target; повторный verify; разные checkout suffix; rejected
target без mutation; migrate failure не идёт дальше; connectivity cause redacted;
каждый shared check caller использует один контракт; malformed historical PLAN
как negative review case; failed db check без evidence не становится repairable.

### P4. Cleanup: одна семантика, безопасные signal handlers и полные квитанции

Файлы tooling: scripts/owned-process.mjs, test-runner.mjs,
apps/api/scripts/test-world.ts, scenario-foundation.mjs, scenario-preview.mjs.
Engine/EVAL managed-daemon использовать как существующий reference contract,
не импортировать из глобального mutable installation в standalone project.

1. Сохранить один project-owned helper вместо копий cleanup в четырёх callers.
   Перед signal учитывать retained owned child, PID/PGID и birth, где доступно;
   после leader exit не сигналить группе только по переиспользуемому числу PID.
   Отсутствие доказанной authority — observation-only, не расширение полномочий.
2. ESRCH означает исчезновение; EPERM не означает успех и не даёт права на
   SIGKILL. После signal error повторно наблюдать только тот же owned target.
   Если исчезновение доказано — settled с сохранённым warning; иначе failure.
   Известный identity mismatch запрещает signal. Для freshly spawned live owned
   ChildProcess достаточно retained handle и detached-spawn proof; отсутствие
   платформенного birth token само по себе не отключает этот cleanup. Для
   reacquired/persisted PID без подтверждённой incarnation — observation-only.
3. Cleanup идемпотентный, concurrent callers coalesce. Все children обрабатываются
   независимо; ошибка одного не пропускает остальных и DB cleanup.
   Сохраняется existing TERM grace 5000 ms и bounded KILL/settlement follow-up;
   post-error reobservation ≤250 ms, без повышения прав. Остаток drain бюджета
   общий для batch детей: parallel allSettled, не N последовательных grace periods.
   Unknown leaderless target не получает новый signal после исчерпания времени.
4. Signal handlers/interval/escalation лишь инициируют общий stop path с handled
   rejection. Ошибка signal не выбрасывается uncaught из callback. Timers/listeners
   снимаются; final report/receipt публикуется из единого finally.
5. В final receipt сохранить per-child code/syscall/PID/PGID/signal, known birth,
   наблюдения до/после, settled и secondary errors. Bounded/redacted; no argv/env
   dumps. DB drop подтверждается отдельно и не подменяется process settlement.
6. После successful assertions + unknown cleanup сохранить counts=passed, но
   check/EVAL не PASS. Не запускать новый attempt до подтверждённого settlement.
   Не делать автоматический product repair ради EPERM.

Регрессии: EPERM→наблюдаемый ESRCH; persistent EPERM; ESRCH сразу; dead/recycled
leader; один ребёнок отказал, остальные закрыты; repeated/concurrent stop;
permission error в каждом callback сохраняет final receipt; DB cleanup не пропущен.
Все сигналы в tests только собственным созданным children, не историческим PID.

### P5. Progress: один publisher, одинаковые пределы и отсутствие ложной тишины

Файлы: test-observation.mjs/test-runner.mjs, Playwright/Vitest reporters;
engine check-runner-evidence.ts/code-checks.ts; EVAL baseline-admission.mjs.

1. Wrapper — единственный publisher официального progress@1 и его global sequence.
   Existing producers пишут в private per-source mailbox под wrapper temp root:
   source UUID на процесс + local sequence, invocation binding, complete JSONL.
   Wrapper читает все новые полные записи, проверяет тип/размер/время/binding,
   deduplicates source/local cursor и публикует global increasing sequence.
   Никакого общего read-last/increment между процессами, event bus или зависимости.
   Wrapperless запуск не публикует managed proof; supported project launch routes
   всегда создают wrapper. Не оставлять старый многопроцессный writer как fallback.
   Mailbox — producer-owned rolling snapshot (до 64 records / 256 KiB), публикуемый
   atomic rename, а не бесконечный append inbox. На invocation максимум 64 sources;
   превышение — явный progress_capacity_exceeded, не ложная тишина. Это осознанный
   ponytail-предел для текущих serialized тестов, не новый configurable event bus.
   Пропуск промежуточных source records при отставании reader отмечается как
   diagnostic compaction; свежий valid cursor всё ещё доказывает liveness, но не
   заменяет full native result. Final report и active-step proof хранятся отдельно.
   Для quality, состоящего из последовательных API/web/integration wrappers,
   это единственный publisher В КАЖДЫЙ МОМЕНТ, не один PID на весь compound check.
   Existing binding/counter продолжаются через nonce-owned publisher lock в check
   evidence root: acquire wx до spawn → publish result/final progress → release
   своего lock. Successor читает последний global sequence, не начинает с нуля.
   Занятый/оставшийся после crash lock — typed ownership error, не автоматический
   takeover PID и не параллельный publisher. True nested same-invocation wrapper
   отвергается до productive spawn; штатные literal launch routes не вложены.
   Private mailbox dirs создаются wrapper, имена source и record strings bounded;
   перечитываются только изменившиеся snapshots. Seen semantic identities тоже
   ограничены текущим rolling window, не бесконечным Set за lifetime команды.
2. Официальный файл — ограниченное rolling window до 4 MiB, atomic rename,
   sequence не сбрасывается. Чтение движется по logical sequence, не только inode.
   Потеря промежуточных diagnostic records при rotation допустима и обозначается;
   liveness требует свежих валидных фактов, не полного архива всех шагов.
3. Engine/EVAL/wrapper согласуют предел 4 MiB и max record 16 KiB. Consumer читает
   все полные строки bounded regular file через no-follow descriptor; partial tail
   ждёт append. Oversize/invalid path/IO failure — typed observation error, не
   silent []. ENOENT до первого event — startup silence, не немедленный failure.
4. Сохранять защиту от foreign invocation, future/stale time, replayed cursor,
   одинаковых semantic identities. Execution phase не регрессирует в startup.
   Логи, heartbeat lease, wallclock tick, repeated locator retry не считаются
   прогрессом. Новый source UUID сам по себе не продлевает окно.
5. Одинаковое engine API чтения используется в engine check и EVAL baseline;
   standalone project wrapper использует свой один helper с тем же corpus
   contract tests, а не импорт mutable global engine и не ad-hoc last-line parser.
   Не добавлять external JSON schema@2, если progress@1 с sole publisher достаточно.
6. Невалидный progress не создаёт success/repair authority; сохранять primary
   observation problem и выполнить P4 settlement. Не выдавать oversize за
   неисправность провайдера и не подталкивать модель сообщением «продолжай».
   При переходе reader от silent [] к typed error ОБА interval callers (engine
   code-checks и EVAL baseline) обязаны catch → controlled stop/settlement/report;
   thrown error не выходит uncaught из setInterval. Существующее состояние serving
   обрабатывается прежней policy, не обходится новым observer.

Регрессии: два concurrent producers; burst+partial tail; >1 MiB здорового
progress; rotation; malformed/oversized record; foreign/replay/future events;
старый cursor не renew; wall/mono observation gap; engine и baseline одинаковы.
Длительная проверка с действительным прогрессом живёт дольше одного quiet window;
sequential quality wrappers сохраняют счётчик/aggregate evidence; nested/overlapping
publishers отвергаются до spawn, stale lock не захватывается по одному PID.

### P6. Browser inactivity: native completion до внешнего убийства runner

Файлы: общий browser test fixture, playwright-observation.mjs, configs и imports
browser specs; test-runner; existing evidence validators/repair disposition.

1. Использовать публичные Playwright automatic fixture и testInfo.setTimeout,
   не приватный runner API. Общий exported test base обязателен для core,
   foundation, preview, keyboard; детерминированный import check ловит обход.
   При managed run выключен total duration cap; новый fixed actionTimeout не вводить.
2. Reporter сохраняет bound test_id/retry/worker/step identity, location, phase,
   begin/end и native errors. Step begin нужен для диагностики текущего действия,
   но сам по себе не heartbeat. Новые завершённые содержательные шаги сдвигают
   native quiet deadline через fixture; polling/повтор прежнего события — нет.
   Общий private attempt key = invocation_id/test_id/retry/repeatEachIndex/workerIndex,
   в file name его hash, не сырой test title. Fixture читает reporter-owned rolling
   per-attempt snapshot (те же 64 records/256 KiB); reporter никогда не переписывает
   fixture-owned health snapshot. Запоздалый body-step после перехода в teardown
   не продлевает teardown: phase выводится reporter из public parent hook context,
   clock slot по-прежнему выбирается worker, не parent marker. Proof role/files
   разделены с mailbox/global progress: stream compaction не удаляет active state.
3. Rearm testInfo.setTimeout из elapsed текущего native timeout slot + remaining
   quiet window, не из общего времени всего EVAL. Отдельно учитывать test body
   и afterEach/fixture teardown slot: при входе teardown сбросить slot epoch,
   не наследовать накопленное многоминутное test timeout. Phase switch обнаруживать
   в worker по публичному testInfo.duration: до конца body оно 0, после body —
   фактическая duration. При первом ненулевом значении переключить local slot epoch
   и переустановить budget; для нулевого body inherited allowance отличается менее
   чем на 1 ms. Poll ≤100 ms; задержку доставки reporter marker не использовать
   как authority для timeout slot. Поведение закрепить на Playwright 1.62.1;
   worker beforeAll/afterAll без active fixture остаются outer-guard territory.
   Не обращаться к testInfo._timeoutManager или другим private properties.
   Использовать automatic fixture с минимальными зависимостями, чтобы она начинала
   наблюдение до page/context setup. Нельзя подставлять elapsed всей сессии или
   заново считать старый completed event новым progress при каждом poll.
4. Native quiet budget = existing execution silence (600000 ms production).
   Fixture polls accepted per-test progress, но polling не продлевает срок.
   Внешний execution observer даёт native deadline завершиться и bounded
   settlement/publication tail 5000 ms; это drain grace, не дополнительное окно
   работы агента. При отсутствии final report — штатный owned stop/settlement.
   Настоящий dead worker/blocked event loop по-прежнему обрывается fail-closed.
   Иерархия бюджетов: native Q → wrapper Q+5000 ms (grace) → engine/EVAL outer
   wrapper budget+existing 10000 ms cleanup tail. Исходные env quiet values Q/S
   не менять по месту в нескольких observers. runnerObservationDurations и producer
   используют один согласованный contract; sleep/clock gap не становится progress.
   Новая phase завершения/настоящий teardown progress двигают sliding window,
   а просто ожидание завершения процесса не даёт бесконечных grace periods.
5. До интеграции выполнить постоянную isolated Playwright contract
   regression: длинный здоровый test, missing locator, hung afterEach. Она обязана
   доказать rearm/slot reset и publication через public API. Если установленный
   runner не поддерживает это поведение, не обходить private API/не выдавать PASS:
   зафиксировать blocker P6 и скорректировать дизайн до его закрытия.
   Readiness probe раздела 8 уже подтвердил public-API основу; постоянная regression
   в repository должна дополнительно покрыть настоящий locator/browser и transport.
   Нельзя рассчитывать на выполнение fixture finally после hung afterEach: native
   runner может пропустить teardown этой fixture после исчерпания общего slot.
   Поэтому pre-deadline snapshot публикуется ДО таймаута, timer unref'ed и получает
   terminal cancellation через parent-owned attempt state. Worker exit гарантирует
   прекращение его timer; reporter final result от fixture finally не зависит.
6. timedOut/interrupted сами по себе НЕ candidate proof. Новая точная proof rule
   candidate_browser_action_inactivity допускает repair только при native result,
   exact активном action/expectation с candidate file/line и test attempt, bound
   world-ready, известной неразорванной browser/transport context до timeout,
   завершённом reporter и settled cleanup. Hook/fixture/worker crash, неизвестный
   transport, generic timeout, неизвестная location — tooling/settlement, не repair.
   Rule и все поля проверяются engine validator, не текстом сообщения модели.
   Health producer — worker fixture: наблюдает публичные browser disconnected,
   context/page close и page crash, фиксирует browser.isConnected/page.isClosed
   непосредственно перед ожидаемым deadline. Bound snapshot содержит invocation,
   test_id/retry/repeat/worker, sequence/time, active phase и закрытия до deadline.
   Reporter сшивает snapshot с exact native result; отсутствие свежего snapshot,
   mismatch attempt или закрытие до deadline не дают candidate proof. Обычное
   закрытие страницы после timeout при teardown не отменяет сохранённые факты.
   Snapshot также содержит свежие доступные health facts принадлежащих world
   services/DB; known service death/DB connectivity refusal не становится source
   attribution из одного отсутствующего locator. Отсутствие достаточной проверки
   инфраструктуры — unclassified/tooling, не фиктивное доказательство её здоровья.
   Hash-bound snapshot снимается до deadline; после deadline свежесть старых фактов
   не продлевается простым переписыванием timestamp. Event-loop/observation gap
   инвалидирует attribution, даже если native eventually вернул timedOut.
   Фиксированный schema discriminator: failure category=unclassified,
   origin=candidate, phase=test, native_code=PLAYWRIGHT_ACTION_INACTIVITY;
   repair_evidence.rule=candidate_browser_action_inactivity. Proof содержит
   candidate file/line, bound WorldReadyProof, attempt tuple из P6.2, step identity
   и ссылки {relative_path,sha256} на frozen native-result и worker snapshot.
   Native-result обязан подтверждать timedOut. Snapshot: active non-hook
   action/expectation, browser connected,
   page not closed/crashed до deadline, world identity и fresh API/web/DB health,
   quiet window/last real progress/deadline, observation_gap=false. Health-проверки
   read-only (owned health URLs и SELECT 1 для world DB), не продлевают clock.
   Freshness ≤min(1000 ms,Q/4) до deadline; если probe не успел — proof отсутствует,
   не healthy по умолчанию. Snapshot после freeze не переписывается новым attempt.
   Для generic interrupted/teardown timeout, failed health, отсутствующего поля,
   unknown action location или несовпавшего hash rule не проходит. Существующий
   candidate_sql_integrity сохраняется отдельной веткой discriminated union.
7. Сохранить обычный assertion path. Не восстанавливать отсутствующий final
   report из одного последнего progress event и не считать interrupt доказательством
   продуктовой ошибки. Vitest generic hang также остаётся unknown/tooling; P4/P5/P7
   сохраняют его диагностику, но не выдумывают source attribution.

Регрессии: серия шагов дольше quiet budget; missing locator даёт native result
и trace; body→teardown после длинного теста не получает удлинённого окна; здоровый
teardown с прогрессом; beforeAll/afterAll зависание ловит outer guard; dead worker;
page/context crash; same test_id другой retry; ложный proof/foreign path/неполный
cleanup не создаёт repair; accepted failure создаёт ровно один repair Work.

Проверенные primary API references (это объяснение выбранного механизма, не
зависимость от всегда актуального интернета при исполнении):

- https://playwright.dev/docs/api/class-testinfo#test-info-set-timeout
- https://playwright.dev/docs/api/class-testinfo#test-info-duration
- https://playwright.dev/docs/test-fixtures#automatic-fixtures
- https://playwright.dev/docs/test-timeouts (отдельное окно teardown).

Проверка API/documentation и локального Playwright worker source подтверждает
публичную семантику duration (0 до конца body), но не заменяет P6 runtime regression.
В коде реализации private worker internals использовать запрещено.

### P7. Не терять причинную цепочку в engine/EVAL compact diagnostics

Файлы: test-runner/test-observation, engine check-runner-evidence/code-checks,
lib/check-diagnostic.mjs, lib/baseline-admission.mjs и runner causal projection.

1. До удаления temp сохранить в bound check artifacts нужные ready/final world
   receipts, last active test/step, reporter result и cleanup details. Existing
   evidenceDir, заранее созданные пути; atomic publish; отсутствие artifact
   обозначается явно. Поиск по чужим test-results и newest-file запрещён.
   Порядок finally: закончить/наблюдать processes и DB независимо от capture
   failures → сформировать primary+secondary result → publish artifacts/report →
   удалить temp только при сохранённой диагностике. Publication failure не может
   пропустить cleanup; если копирование не удалось, сохранить locator private
   temp и typed error, не удалять единственный экземпляр доказательств.
2. Не добавлять безразмерные поля в RunnerEvidence: для расширенного browser proof
   использовать проверяемый repair_evidence, для process diagnostics — отдельный
   bound artifact + существующие bounded failures/details. Обновить schema,
   validators, producer/consumer contracts и tests вместе, без незадокументированной
   утраты полей через boundReport. Старые корректные assertion proofs не ослаблять.
   Если proof зависит от внешнего artifact, exact relative path + sha256 +
   invocation/attempt входят в validated repair_evidence; файл читается в пределах
   check evidence root без symlink. Один pathname не создаёт authority.
3. Сохранять две независимые оси: tests/native outcome и observation/cleanup.
   «6 passed + cleanup unknown» остаётся именно этим, а не «0 тестов», PASS или
   product assertion. Primary failure и secondary cleanup error не перезаписывают
   друг друга. Факт нормального native completion не исчезает из-за capture failure.
4. EVAL compact output сохраняет redacted первопричину и locator на полный artifact;
   полный stack/env в compact packet не копируется. Allowlist точных новых codes,
   никакого классификатора «любая ошибка native_* → инфраструктура».
   Compact projection — представление, не источник repair authority.
5. Baseline, Work, aggregate CODE, CODE-REVIEW и MERGE должны давать одинаковую
   классификацию одинакового bound evidence. Unknown остаётся unknown, cleanup
   pending требует settlement и блокирует новый запуск согласно existing lifecycle.

Регрессии: сохранение SQLSTATE/kill cause/lint invalid output по цепочке;
credential redaction; bound artifact переживает temp deletion; mixed primary+
cleanup; diagnostic truncation не превращает неизвестное в доказанный repair;
baseline и subject выдаёт согласованный verdict.

### P8. Agent/review quality: передавать полезные доказательства, не чинить продукт

1. Общие PLAN/PLAN-REVIEW инструкции: предпосылки должны исполняться в check
   command/declared supported policy; purpose не задаёт порядок. Negative case —
   противоречивый historical PLAN, positive — самодостаточный DB alias.
2. Общие CODE/browser verification инструкции: проверка должна доказать наличие
   ожидаемой поверхности перед измерением layout; отсутствие элементов не есть
   успешная геометрия. Навигация строится по фактическому UI и принятой спецификации.
   Не добавлять заранее правильный product implementation/locator в fixture ответа.
3. Judge/ревью получают native errors, proof limits и конкретное свидетельство
   пустого layout coverage; green test не доказывает семантику автоматически.
   Дополнить retained негативные/положительные regression packets. Если требуется
   изменение общего Judge prompt, его live qualification проводится по existing
   dependency-scoped policy; не объявлять её пройденной одними unit tests.
4. Кандидатные тесты и app не редактировать вручную; future repair Work делает
   агент, Judge отдельно оценивает качество. Terminal tooling failure не выдаётся
   за завершённую независимую оценку продукта.

## 5. Порядок работ, зависимости и проверяемые результаты

| Шаг | Работа | Обязательный результат до следующего шага |
| --- | --- | --- |
| 0 | Сверить main/AGENTS/policies; ветки от правильных bases; скопировать только read-only incident facts в regression fixtures | Нет изменений исторических RUN/foreign worktrees; scope product/tooling проверен |
| 1 | P1 + P2 engine | Correct process/lint verdict, retained startup cause; targeted fixtures зелёные |
| 2 | P4 + P5 tooling/engine/EVAL | Safe cleanup и единый progress; concurrency/size/rotation regressions зелёные |
| 3 | P6 permanent public API regressions, затем fixture/report/validators | Native graceful timeout + отдельный teardown slot доказаны; false attribution отвергается |
| 4 | P3 self-contained DB tooling + P7 сохранение diagnostics | Fresh scoped DB success, no-secret typed failure, cross-caller consistency |
| 5 | P8 flow/review contracts и selective qualifications | Negative quality cases не считаются достаточным proof; нет product patch |
| 6 | Полные gates и review diff по репозиториям | implementation receipt с exact refs/results и всеми закрытыми D01–D19 |

P1/P2 можно реализовывать независимо от DB и browser. P6 зависит от исправленного
progress/cleanup; нельзя получить успешную приёмку repair обходом P4/P5.
P7 обновляется вместе с producer/validator изменениями, не в отложенной «доработке».

Минимальные команды реализации (уточнить имена добавленных tests, не запускать
все historical EVAL и не использовать их как mutable fixtures):

- engine: affected native/check/PROTOCOLIZE/tooling tests через существующие
  vitest projects; `pnpm typecheck`, `pnpm lint`, `pnpm build`, затем полный
  project gate `pnpm test` по текущей release policy;
- pinned dd-tasks tooling candidate: `pnpm test:tooling`; изолированные DB/Playwright
  regression scripts с собственными temporary dirs, world DB/ports; bootstrap,
  baseline scripts и format/typecheck в объёме изменённого tooling;
- EVAL: targeted `node --test test/baseline-admission.test.mjs
  test/check-diagnostic086.test.mjs` плюс добавленные contract regressions,
  затем `pnpm test`/`pnpm validate` согласно project scripts;
- полный verification baseline будущего checkpoint отдельно от release gate.

Для isolated timeout tests — короткие инъецируемые quiet budgets, шаги и assertions
по состоянию/сигналам, а не хрупкие ожидания точного wallclock. Один зелёный E2E
не заменяет negative concurrency/attribution regressions. Не назначать тестам
произвольные малые total deadlines, падающие от нагрузки машины.

## 6. Выходные артефакты и эксплуатационная граница

1. Изменения engine и отдельный tooling-only source commit на pinned product base;
   EVAL profile/checkpoint/flow-pack candidate с явными refs. Не переносить
   текущий dd-tasks main и не изменять старый checkpoint задним числом.
   Pinned tooling source публикуется как отдельный reviewed candidate/tag. Если
   исправления интегрируются также в dd-tasks main, переносится только проверенный
   tooling diff, не merge старого baseline/product state целиком. Engine/EVAL PR
   следуют обычному main workflow. Cross-repo contract обновляется одной волной:
   новый producer/proof нельзя допускать к старому engine-validator; ABI mismatch
   блокируется preflight, а не скрытым legacy parser или ослаблением proof.
2. Implementation/review receipt: каждый D → diff → runnable regression → result;
   unproven historical causes явно остаются unproven, не переименовываются «fixed».
3. Коммит/пуш/PR/мерж — по runbooks/git-workflow.md; документационные изменения
   сами по себе не требуют unrelated full engine gate/live Judge calls.
4. Публикация engine, обновление installed hooks/pins и новые scored E2E —
   отдельная operational фаза после реализации/поручения. При ней проверить
   installed artifacts, scoped cleanup и порты, не трогать чужой 55433.
   Scored baseline для каждого нового execution обязателен.
5. Старые failed EVAL не resume/manual repair. Для проверки исправлений нужны
   свежие попытки; cleanup старых — штатный owner-scoped lifecycle, не killall.
   Исторические документы, docs/test изменения не запускают автоматически полную
   Judge qualification; повтор определяется реальными изменёнными зависимостями.

## 7. Ponytail и readiness-check плана

Приняты решения: места изменений, правильные source bases, failure taxonomy,
safe readiness probes, command-local DB preparation, один progress publisher,
native sliding deadline, teardown boundary, repair proof, diagnostic retention,
scope tests и release/launch граница. Внешние неразрешённые выборы пользователя
для начала реализации отсутствуют.

Сознательно не добавляем: generic check DAG, новый process/readiness SDK,
новый event bus, JSON-contract для tar/unzip/dashboard, relaxed ownership,
обход cleanup, blanket retry stage/productive provider operations, native forks
без доказанной необходимости, ручные product fixes, полную live qualification
после любого коммита. Используем existing ObservationClock, error records,
RunnerEvidence, private temp dirs, stdlib и публичный Playwright API.

P6 public-API основа проверена readiness probe раздела 8. Это не проверенная
production реализация: постоянные browser/transport/proof/cleanup regressions
остаются обязательными. Их отказ требует исправить реализацию/дизайн, а не
вводить приватный обход, fixed total timeout или ослабление attribution.

Итоговая готовность: план пригоден для начала реализации по указанному порядку.
Критерий завершения — закрытие D01–D19 с воспроизводимыми проверками и зелёными
затронутыми repository gates; не «ещё один запуск дошёл чуть дальше».

## 8. Повторная проверка готовности и внесённые уточнения

Проверено 2026-10-17: каждый P1–P8 сопоставлен с producer, consumer, failure path,
границей владения, переносом между репозиториями и runnable acceptance. Новые
подтверждённые code-path дефекты — D18 (primary masking при rollback) и D19
(внутренний RPC timeout не согласован со startup observation window). Это не утверждение,
что оба уже проявились в исторических EVAL.
У D19 существующий parent startup observer остаётся внешней защитой: не утверждаем,
что весь EVAL обязательно зависнет на 30 минут. Исправление устраняет несогласованные
вложенные ожидания и сохраняет точную причину отмены safe probe.

| Пакет | Что было недостаточно определено | Закрытое решение |
| --- | --- | --- |
| P1 | Capture/rollback failure и размер снимков | Независимый rollback, primary+secondary chain, partial effect=unknown, bounded capture; no-effect correction только с доказательством |
| P2 | Budget внутри await; auth ошибочно transient | Остаток quiet window/abort в probe, typed auth/config до generic unavailable, early-exit fallback log |
| P3 | Report destination, guarded target, baseline без RUN | db:verify через existing wrapper/evidence ABI; строгий scoped local target без reset; baseline policy не меняется |
| P4 | N children × grace; callback failure | Parallel settlement с общим drain budget и handled callback errors |
| P5 | Несколько последовательных wrappers в quality; private cursor handoff | Один publisher в момент времени, owned lock и continuing cursor; no silent takeover/nested spawn |
| P6 | Slot switch, skipped fixture finally, stale health/attempt | Public duration-based worker phase, pre-deadline snapshot, unref timer, exact attempt/proof и запрет repair при unknown health |
| P7 | Partial publication, external proof artifact | Cleanup до temp deletion независимо от ошибок; relative path/hash/binding и validators обновляются вместе |
| P8 | Agent quality vs ручное исправление продукта | Общие инструкции/negative packets и scoped qualification; candidate code остаётся задачей агента |

### Изолированный public-API probe — выполнен

Использован уже установленный Playwright 1.62.1, отдельные файлы в ignored .tasks.
Не запускались provider calls, EVAL, DB или product browser application. Probe
только проверяет automatic fixture + public setTimeout/duration + reporter.
Окно тишины 1000 ms, синтетические реальные test.step с паузами, workers=1:

| Сценарий | Наблюдение |
| --- | --- |
| Healthy body + healthy teardown, оба с progress | passed, 3067 ms суммарно; public duration переключила fixture в teardown; total cap не сработал |
| Незавершающееся действие в body | timedOut, 1001 ms; native reporter записал результат |
| Body с progress, затем hung afterEach | timedOut, 2500 ms суммарно; native error явно указывает afterEach, не наследуется удлинённое body window |

Отдельный assert verifier подтвердил ожидаемые статусы. Exit1 Playwright здесь
намеренный: два негативных теста должны timedOut, это не failed release gate.
Выявлено дополнительно: final snapshot из fixture finally для hung afterEach
не появился; нельзя опираться на этот finally как источник обязательного proof.
Это уже учтено P6.5: snapshot до deadline, normal native result из parent reporter.

Ограничения probe: это не настоящая missing-locator/browser/DB-health проверка,
не новая RunnerEvidence rule, не тест всего P6 pipeline и не проверка устойчивости
1-секундного тестового окна к любой нагрузке. В постоянных regressions использовать
control/barriers и достаточные budgets, проверять outcomes, а не точные duration.

Readiness verdict: обязательные проектные решения выбраны; неразрешённых выборов
пользователя нет. Реализация может идти по разделу 5. Полный gate, release и
новые scored E2E этой проверкой готовности не подменяются и не выполнялись.

## 9. Реализация и проверка 2026-10-17

Реализованы P1–P8. Исторические EVAL и их runtime artifacts не менялись;
новые scored E2E, публикация engine, installed hooks и pins не выполнялись.
Это implementation candidate, не новая квалификация или подтверждение качества
продукта. Неизвестные исторические SQL/stderr/EPERM причины остаются неизвестными.

| Дефекты | Изменение и воспроизводимая регрессия |
| --- | --- |
| D01–D03 | Строгий LintReport, process exit/signal/excerpts, diagnostic capture до rollback; `runtime-tool-readiness.test.ts` |
| D04–D06, D19 | Owned identity до readiness probes, activation quiet window и bounded RPC, retained typed startup cause/early exit; `runtime-startup-readiness.test.ts`, existing OpenCode/hook fixture suites |
| D07–D08 | Guarded scoped `db:verify`, project alias/mandatory policy, typed SQLSTATE/phase; `scripts/db-verify.test.mjs` и scoped real DB regression |
| D09–D11 | Shared coalesced/parallel owned settlement, callbacks не теряют final evidence, per-process diagnostics; `owned-process.test.mjs`, `test-runner.test.mjs` |
| D12–D14 | Sole publisher + private source mailboxes + rolling 4 MiB journal, typed unsafe progress, sticky execution phase; `runner-progress.test.mjs`, `runner-observation091.test.ts`, `baseline-admission.test.mjs` |
| D15–D16 | Native sliding browser fixture, independent teardown slot, narrow hash/binding/attempt/health proof; `browser-observation.test.mjs`, `runner-observation091.test.ts`, sidecar retry integration в `code-checks.test.ts` |
| D17 | Общие PLAN/review/CODE/MERGE инструкции, prerequisite и nonempty-layout/proof limits; `verification-matrix.test.ts`, retained `check-proof-limits091.json` + `proof-limits091.test.mjs` |
| D18 | Независимый rollback каждого path, primary/secondary ошибки; bounded stable-fd capture, symlink/growth/oversize negatives в `runtime-tool-readiness.test.ts` |

Дополнительно при реализации/перекрёстном ревью закрыты:

- Перенос/rebinding/reconciliation/retry receipt сохраняет проверенные sidecar refs,
  сравнивает точное derived множество и не разрешает произвольные extra artifacts.
- Native browser `ended_at` связывает timedOut с frozen deadline; 5-second report
  drain не подменяет строгую freshness проверку health snapshot.
- Capture растущего файла не ждёт EOF бесконечно: fixed descriptor snapshot,
  bounded hashing, incomplete prefix hash явно отличается от полного SHA256.
- Ошибки чтения official progress в interval переводятся в controlled settlement,
  а не uncaught exception/поздний generic silence. Полная malformed запись — ошибка;
  partial tail ждёт завершения, foreign/replay/future не продлевают окно.
- Redaction покрывает Basic/Bearer и составные credential keys, без квадратичного
  поиска URL на длинных документах. Compact EVAL сохраняет безопасный locator,
  но не переносит raw stack или repair authority.
- Health probe использует одну прогретую probe-only PostgreSQL session с server
  statement timeout; per-poll force-close и discarded cancel Promise убраны.
  Неизвестное здоровье не выдаёт proof. Публикация reporter имеет отдельный drain,
  не расширяющий freshness; mixed native errors не стираются timeout proof.
- Vitest hook error может повторно прийти сериализованным clone в result/suite
  projection. Дедупликация ограничена native trace + entity/phase + occurrence;
  различные ошибки, beforeAll/afterAll и runner errors не объединяются по message.

Проверенный tooling-only source: `1d7f8b2397704f51f9b919d4ce4deac741b657a4`,
immutable tag `eval/plan-091-verified-tooling`. Integration PR dd-tasks #12 переносит
только tooling на актуальный main. Для этого exact source и main-transfer отдельно
прошли `pnpm test:tooling`: 36/36 PASS без skips, включая свежую собственную БД
и Chromium. `format:check`, `lint`, `typecheck`, `build`, `docs:check` — PASS на
main-transfer; созданные регрессионные БД удалены адресно.

Финальный tests-only follow-up добавил реальные beforeAll/afterAll hangs и
SIGKILL worker: main `pnpm test:tooling` 39/39 PASS, 0 skips; scoped outer guard
подтверждает cleanup и не создаёт source proof при неизвестном native outcome.
В afterAll hang marker выполненного body не заменяет отсутствующий final report.
Source coverage commit `a64c432a91274d6a9421805e623467a5b0c8d9ec`, tag
`eval/plan-091-tooling-coverage`; production bytes совпадают с verified-tooling.
dd-tasks PR #12 / #13 смержены, main `16e6231175cad8414845ae60ca41d57e86714ddd`.
Финальная сверка P6 добавила отдельное подтверждение native `trace.zip` при
missing locator и private `outputDir`; Chromium + scoped DB regression PASS.
Tests-only tag `eval/plan-091-native-trace` (`c92bb80`), PR #14 смержен:
`3272e46cc4954c20a855eb35eb3fca12f9bed0e1`. Production tooling не изменён.
Existing `repair-continuation.test.ts` aggregate/replay/concurrent/reply-loss
регрессии повторно PASS 2/2: один repair intent и один Work. Новая browser rule
проверяется на том же source-repair guard, специальной harness ветки после него нет.

EVAL full suite с `DD_FLOW_SOURCE_ROOT` на изолированную сборку engine:
924 tests, 909 PASS, 15 explicit optional skips, 0 failures. Первоначальный запуск
без обязательного source-root отказал в соответствующих fixture tests и не
считается зелёным; повтор выполнен с правильным окружением. Последующие isolated
compact/redaction/proof-limit regressions также PASS; Judge prompt не менялся.

Engine full-gate environment: explicit `DD_FLOW_E3_CANON_ROOT` на canon
`1ddedf9d3f086e046f8e7b194c739ec386e7c8b9` (4.1.2), strict-canon build до tests.
Первый E3 запуск без этого fixture input отказал в Memory tests; исправлено
окружение и инструкция operations, не ослаблены тесты/продуктовый контракт.
Native Worktrunk E3 отдельно выполнен с `DD_FLOW_E3_WT=/opt/homebrew/bin/wt`:
PASS; абсолютный путь также добавлен в инструкцию gate. Compact redactor EVAL
использует тот же безопасный key boundary, что engine: длинная цепочка дефисов
не вызывает повторный поиск с каждой позиции; targeted suite PASS 5/5.

Engine runtime source `9c7aa01e` прошёл strict-canon build, typecheck/lint и release
(Node 2/2, Vitest 8/8). Hybrid 66/66, E2 133 PASS + 1 optional skip. Финальный E3:
467 cases, 461 PASS, 5 optional skips, один missing-input refusal для Worktrunk;
весь его файл повторно PASS 5/5 с явным `DD_FLOW_E3_WT`. Таким образом все
462 обязательных E3 cases проверены; первый aggregate exit1 не называется PASS.
Последующие engine commits меняют только gate documentation и regression tests,
не production runtime bytes. Integration/runtime-sensitive результаты ниже.
Полный engine integration: 171/171 files, 2882/2882 PASS, без skips/failures,
включая все семь stages четырёх server cells, same-session, repair, overload и
три негативных terminal-cleanup сценария (4727.86 s).
Runtime-sensitive: 2/2 files, 48/48 PASS (269.19 s), включая bundled native
adapter/daemon fixtures и owned cleanup. Полная release/integration/runtime цепь
завершилась exit0. Существенных незакрытых пунктов P1–P8 финальная сверка не выявила.

Tooling source — отдельный commit на pinned `f361454`, а перенос в актуальный
dd-tasks main выполнен cherry-pick только tooling diff. Сохранены main product
и его browser assertions; разрешены лишь imports общей fixture. Старые checkpoint
и case definition не переключались. Следующая operational фаза должна связать
этот source с выпущенными новыми engine bytes, проверить ABI/pins и лишь затем
создавать новый checkpoint/launch. Старый beta.140 для нового producer не выбирать.

Интеграция: dd-flow PR #87, dd-eval PR #106; tooling PR #12/#13/#14.
Следующая operational фаза (release/pins/hooks/new EVAL) намеренно не выполнялась.

## 10. Независимое ревью реализации

Перепроверены P1–P8 по общим callers и producer/consumer цепочкам. В P2 найдены
оставшиеся существенные startup-пропуски:

- Grok повторно записывал raw startup error после общей безопасной публикации,
  теряя redaction; вторичная ошибка записи могла маскировать native cause.
- AGY/Droid могли заменить native cause ошибкой cleanup/publication; resource
  cleanup details записывались недостаточно надёжно. Теперь cleanup ошибки
  вторичны, snapshot сохраняется после cleanup и `cleanup_failed` не выдаётся за
  подтверждённое завершение. Publication failure имеет redacted log fallback.
- OpenCode parent использовал daemon-only cleanup, хотя provider имеет отдельную
  process group. Подключён существующий owner/record-bound cleanup обоих процессов;
  PID-only signal authority не добавлялась.
- Общий bridge startup сохраняет `cleanup_failed` при неизвестном физическом
  завершении; Grok читает retained primary и в этом состоянии.

Engine review candidate: `f165752f`. Actual serve failure injections и owned
detached-child regression: startup 20/20 PASS; native Grok 13/13, AGY/Droid/OpenCode
53/53 PASS. Независимые progress/cleanup/wrapper проверки 33 PASS + 1 optional DB
skip; EVAL diagnostic/baseline/proof-limit 14/14 PASS; engine observer 2/2 PASS.
Существенных дефектов P1/P3–P8 дополнительное ревью не выявило. Product, live EVAL,
исторические receipts, pins и installed runtime не менялись.

Полный повторный gate выполняется на точном review commit с strict-canon build,
`DD_FLOW_E3_CANON_ROOT` и `DD_FLOW_E3_WT`, без изменения сборки между группами.
Hybrid 66/66; E2 133 PASS + 1 optional skip; E3 462 PASS + 5 optional skips,
0 failures (aggregate exit0); release Node 2/2 + Vitest 8/8 PASS.
Integration на review-кандидате: 171/171 files, 2887/2887 PASS, 0 skips/failures
(3351.43 s), включая пять добавленных startup-regressions.
Runtime-sensitive: 2/2 files, 48/48 PASS (424.15 s). Все группы полного `pnpm test`
завершились успешно на одном неизменном review-кандидате; optional skips явно
отражены выше, обязательные входы gate не пропускались.
2026-10-18 полная последовательность `typecheck → strict-canon build → pnpm test →
lint` завершилась exit0. Review fixes интегрируются engine PR #88; этот отчёт —
dd-eval PR #107. Установленные hooks/pins/runtime и живые EVAL не менялись.
