# 080. Наблюдаемый startup и составные проверки CP219

Дата: 2026-10-11. Статус: реализация и проверка старта завершены; полный EVAL работает, результат полного цикла ещё не установлен. Инвентаризация, проверки и launch receipt: [080-subprocess-review.md](080-subprocess-review.md).

## Цель и доказательства

Добиться нового полного E2E ZCode GLM-5.3-Flash/max + OpenAI gpt-6-luna Decisions, min_confidence=0.7, fallback/Final Judge gpt-6.1-sol/high. Нет stop_after; целевой цикл заканчивается MERGE и Final Judge. Критерий успешного старта: собственный baseline PASS, native Session создана, actual RUN вошёл в SPECIFY и есть подтверждённый продуктивный dispatch. Это не означает успешного завершения полного E2E.

CP218 EVAL-20261011162639-51a451a1: register baseline process оборван через 5928ms; remaining ownership budget около 24s; только request, без store_open. Подтверждён неверный старт 5s storage silence window до завершения cold imports. Исправление e1d3aa2 интегрировано через dd-flow PR57 (main 8720cbe), кандидат beta.128: targeted 20/20, native 46/46, typecheck/lint/build и установленный offline full-cycle PASS. Эти результаты не заменяют полную release admission и не доказывают живой E2E.

CP219: первая preflight потеряла observation при engine install; вторая вернула entrypoint_probe_unavailable; третья/четвёртая — внешний operation_observation_lost при doctor. Subject/Decisions ещё не выполнялись. Для health-probe не сохранены raw error/signal; для внешнего clock не сохранено состояние. Нельзя утверждать точный ETIMEDOUT или конкретный gap для этих попыток. Нагрузка хоста (load до 192) — сопутствующее свидетельство, не самостоятельное доказательство причины. Исторические receipts не дополнять выдуманными деталями.

## Границы и принцип

- Меняем dd-flow-cli и dd-eval, не продукт, fixture, порог или модель для обхода проблемы.
- Переиспользуем ObservationClock, bounded command transport, operation journals и существующие launch receipts; без нового framework/зависимости.
- Окно измеряет тишину конкретной фазы. Оно сдвигается только фактическим новым событием. Вывод reasoning/messages/tools и подтверждённая работа descendants продолжают использовать существующий native work owner.
- Bootstrap, control, productive work, ownership horizon и cleanup — разные ограничения. Не переносить control watchdog на всю продолжительность model Turn.
- Lease expiry, native host hook deadline, cleanup grace, backoff и конечный reconciliation horizon не удаляем под названием «таймаут агента».
- Один владелец решения о productive inactivity; внешние CLI наблюдают запуск/транспорт, не создают второй work timeout.

## Инвентаризация аналогичных мест и решения

| Область | Найденные места | Изменение |
| --- | --- | --- |
| Maintenance | managed-daemon.mjs/runtimeProcess; native-hook-command.mjs; runtime-maintenance-ingress.ts | сохранить уже исправленное разделение imports/storage; проверить все actions/callers и конечный lease horizon |
| Engine probes | engines.ts/manifestDiagnostics, bindRunEngine, upgradeForkedRunEngine; install/doctor callers, run-fork.ts, run-cli.ts | убрать spawnSync с фиксированными 15/30s для runtime probes; async bounded наблюдение и точный outcome |
| Doctor | dd-zcode, dd-codex, dd-agy, dd-grok; dd-droid version, OpenCode transport/doctor entrypoint | общие фазовые сигналы; внутренние command probes передают наблюдаемое продвижение внешнему caller |
| Daemon readiness | dd-{zcode,codex,agy,grok,droid,opencode}-daemon; OpenCode health loop; AGY readyPromise | часы сейчас местами вызываются без cursor, polls не считаются прогрессом; учитывать реальные startup milestones и явное ready |
| Outer transport | dd-eval/lib/process-json.mjs JSON/text; callDriver; bundled runtime process-json.mjs | классификация clock reason, сохранение состояния, фазовый startup/control контракт |
| Local blocking probes | tooling.ts download/archive/version; stage-lifecycle.ts validator; dashboard.ts executable probes; Git/permission probes в canon, runs, prompts, specify, branch-context, cleanup, review-copy, workspace-policy, merge, memory-permissions | найти все callers, перенести потенциально долгие children на уже существующий async transport; короткие identity reads — bounded uncertainty, не product/provider failure |
| Process identity | managed-processes.ts/ps 1s; dd-eval process-snapshot.mjs/ps 5s | сохранить небольшой bounded ownership read, но timeout = unknown identity; не dead owner, не разрешение kill/replay |
| Timers остальных подсистем | весь src/runtime, src/services, harness-runtime, dd-eval/lib, scripts, tests | составить checked inventory каждого spawnSync/execFileSync timeout/AbortSignal.timeout/observedTimeout/clock без progress; явно классифицировать, не механически менять все числа |

Последние строки — риски, найденные аудитом исходников, не заявления о наблюдавшихся отказах. На реализации расширить точный список через rg до полного покрытия этих директорий; каждому совпадению дать решение changed/retained с объяснением. Нельзя считать все Git subprocess автоматически дефектами или автоматически исключить их.

## 1. Единый outcome и диагностика

Сохранить текущие внешние error codes для recovery/classifier совместимости. Добавить bounded details:

- reason: inactivity / observation_gap / child_exit / abort / output_limit / ownership_horizon / cleanup_unconfirmed;
- operation_id, request/action, phase, pid, timeout_ms и последняя подтверждённая phase/sequence;
- clock.state(): elapsed_ms, uncertainty_elapsed_ms, gaps, observation_lost, timestamps;
- child exit_code/signal, исходный error.code/message, cleanup outcome; effect no_effect/unknown отдельно от failure reason.

Не писать env, credential, prompt или неограниченный stdout/stderr. Таймаут probe не равен dependency-load failure. Не маскировать первичную ошибку вторичной cleanup/recovery. При ошибке до spawn — no_effect; read-only probe не означает, что допустимо повторить неизвестный engine install или native dispatch.

JSON и text wrappers используют одну существующую функцию формирования clock details. bundled runtime и EVAL сохраняют одинаковую семантику; проверка contract parity обязательна. Не создавать новый error taxonomy без необходимости.

## 2. Startup/control политика и сигналы

Для обычных административных subprocess initial startup quiet window = 120000ms, после подтверждённой готовности phase quiet window = 30000ms. Это defaults для setup/probe, не budget model работы. Параметры передаются через существующие options и валидируются; именованные константы вместо новых env override. В maintenance использовать оставшийся существующий ownership budget, а не 120s: короткая аренда не продлевается.

Сигнал содержит существующий request/operation identity, kind, phase, монотонную sequence и observed_at. Для локальных CLI use stderr JSONL; stdout остаётся одним итоговым JSON. При daemon readiness — retained operation/startup state с daemon/owner/generation binding. Не писать отдельную БД или synthetic heartbeat.

Минимальные реальные milestones: ingress_entered, imports_ready, probe_started, probe_completed, dependency_check_completed, identity_digest_progress/completed, native_initialized, ready. Допустимые phase names фиксированы по операции. Каждый завершённый отдельный probe имеет identity/index, чтобы второй version check не исчезал как duplicate первого. Сигнал поступает только при реальном действии/результате; старт того же шага повторно не продлевает окно.

Полезный inherited child output передавать bounded, привязанным к step; для reasoning/messages/tools использовать имеющиеся semantic activity records, не произвольный status/poll. Foreign identity, stale event, repeated sequence, heartbeat и периодический busy игнорируются. Legacy adapters без phases сохраняют bounded startup window, но не получают бесконечного ожидания.

После imports_ready не считать мнимый timer событием прогресса. При отсутствии любых сигналов startup конечен. Непрерывный реальный прогресс продлевает обычный setup; искусственного абсолютного lifetime cap не вводим. Cancellation/output bounds/ownership constraints остаются.

## 3. Engine installation, health, binding и fork

- manifestDiagnostics разделить на синхронные статические проверки и асинхронный runtime probe. Resolver/manifestSummary не должны неявно создавать subprocess. Переиспользовать существующий runtime process-json transport, не вторую реализацию timer.
- Health probe должен действительно загрузить необходимые runtime зависимости. Быстрый --version только с build-info недостаточен. Целевой health ingress загружает тот же нужный CLI/runtime dependency graph и сообщает imports_ready; успех только после завершения import, а не после печати версии. Не превращать это в baseline/model call.
- Install lock: сохранить single-writer staging и атомарную activation; async probe не ослабляет lock. До probe и activation нет открытой SQLite write transaction. finally освобождает lock, staged manifest не выбирается как установленный.
- bind/fork probes вынести в async prepare до write transaction. Перед записью повторно сверить RUN identity, исходный binding, выбранный engine digest и fork lineage; конфликт = отказ, не stale write. Сохранить idempotency и запрет менять исходный RUN binding.
- Перевести callers install/doctor/bind/fork/router dispatch и tests на await там, где реально есть probe. Не заражать async только static resolve path. Проверить transaction wrapper run-cli: ожидание subprocess должно быть вне writer section.
- entrypoint unavailable остаётся unverified, реальный nonzero dependency failure — отдельный outcome. Никакой activation по unknown/timeout. Возвращать точный bounded probe result.
- Избежать повторного дорогого cold health внутри одной операции: проверенная identity/digest может переиспользоваться в её scope, но не глобальный cache PASS без проверки выбранного артефакта.

## 4. Doctor и daemon startup для всех упряжек

- ZCode четыре проверки сохраняем; передавать start/completion каждой и chunk progress при потоковом digest. Не читать огромный binary целиком лишь ради SHA256; stdlib createReadStream/createHash. Результат/qualification identity не менять.
- Codex version + app-server initialize, AGY version + models, Grok version/contract, Droid/OpenCode аналогичные шаги публикуют тот же setup contract. Doctor остаётся non-generative; provider Sessions/Turn не создаются для прогрева.
- Bridge initialize/native auth/profile negotiation сообщают реальные ответы, не socket polling. Частая проверка файла/сокета сама по себе не продлевает ожидание.
- Во всех daemon startup loops cursor берётся из request-bound retained milestones. Socket существует/daemon.status отвечает не всегда значит provider ready: harness-specific ready condition сохранить. Failed startup останавливает только доказанно owned process tree и фиксирует cleanup; неизвестную identity не убивать.
- Согласовать inner/outer bootstrap windows: внешний observer видит внутренние фазы; внутренний native utility watchdog не остаётся скрытой более короткой границей до первого сигнала. Не менять host hook limits и productive Turn policy.
- EVAL callDriver doctor/control использует setup policy, session.prompt сохраняет native owner и timeout=null с существующей durable reconciliation. Опции клиента не должны менять retained native operation identity.

## 5. Остальные потенциально блокирующие операции

В startup/install/admission/runtime-control callbacks не оставлять long spawnSync/execFileSync и CPU/file loops, которые не дают наблюдать clock и children. Для download/unpack/version/validator переиспользовать async transport, наблюдать фактические bytes/files/completed steps. Git/permission/ps reads классифицировать отдельно: если это только ownership observation, unavailable означает unknown и запрещает деструктивное решение. Product quality command nonzero остаётся failure, не автоматически retry.

Async refactor не должен удерживать writer transaction во время child command. Особенно проверить engine bind/fork, stage validator и merge preparation. Решение о переносе каждого найденного места записать в реализации; не обещать исправление всех hang patterns по одному поиску timeout:.

## 6. Проверки и критерии приёмки кода

Использовать существующие test suites, без новой тестовой платформы. Fake clocks для boundary combinatorics; ограниченное число реальных subprocess regressions.

1. Старый maintenance 6s cold import: PASS; молчащий startup finite failure; после imports_ready storage silence failure; lease horizon не продлевается.
2. Doctor: несколько здоровых последовательных probes суммарно >30s проходят за счёт distinct progress; зависший отдельный шаг падает; большой digest продвигается; иностранные/повторные/poll markers не удерживают процесс.
3. Engine: cold dependency loading >15s с настоящими phases проходит; import error не проходит; silent probe finite failure/unverified; output bound/abort/cleanup preserved; при failure нет activation/выбора staging.
4. Bind/fork: совместимость PASS, неизвестный probe не пишет binding; concurrent binding/engine/lineage change отвергается; source RUN неизменен; writer не удерживается при await.
5. Daemons: медленный настоящий startup продлевается, вечный status poll нет; native init failure сохраняется; readiness не приравнивается к socket alive; foreign generation reject; cleanup только own subtree.
6. Clock: silence vs gap vs horizon различимы в конечном receipt; wall jump/sleep/backpressure не называются provider outage; late/duplicate events не восстанавливают потерянную operation identity.
7. JSONL phases не загрязняют финальный JSON; nested primary и effect сохранены; secret redaction/legacy classifier совместимость; оба process-json implementations проходят parity checks.
8. Полный inventory subprocess/clock sites с retained rationale; typecheck/lint/build, affected suites + native runtime group + установочный/offline full-cycle fixture. Если выпускаем опубликованный engine — полный официальный release gate/receipt, не подмена targeted checks полным acceptance.

Тесты не должны создавать load-sensitive 20ms assertions. Семантику окон проверять fake clock; real cold import test иметь запас внешнего harness timeout и проверять результат/identity, не точный wall duration. Нельзя повторять упавший тест до зелёного без сохранения причины.

## 7. Подготовка и запуск полного E2E

1. Работать от актуального remote main в изолированном checkout, сохранить пользовательские edits; интегрировать code/doc PR по правилам обоих проектов. Не использовать расходящийся primary local main.
2. Новый engine artifact после исправлений имеет новый exact source commit/digest; не перепаковывать CP219 beta.128 молча и не менять retained homes. Если локальный candidate — явно назвать не опубликованным и не full release accepted. При официальной публикации пройти release runbook полностью.
3. Прогнать установленный offline full-cycle fixture и получить новый engine-bound verification-matrix receipt @3; сохранить actual evidence, не перепривязать старый PASS к новому checksum.
4. Свежие checkpoint/definition и EVAL home. Те же product baseline d81cd0a, flow pack 1fdebb7 (если canon не менялся), профиль e2e-zcode-glm-5-3-flash-max-openai-decisions. Decisions gpt-6-luna 0.7/max_retries2; Subject GLM-5.3-Flash/max; Judge gpt-6.1-sol/high; полный MERGE без stop_after. Проверить дату review_at operational exception на дату запуска и не использовать истёкшую декларацию молча.
5. По execute-eval/update-harnesses/eval-storage: cleanup только устаревшего owned runtime, сохранить расследуемые CP218/219; shared resource registry и PostgreSQL 55433 не дублировать/не останавливать чужих consumers. Текущий ZCode binary; Codex через cx/CODEX_HOME=.codex-cpa. Именованный Decisions secret из ignored .env не печатать и не наследовать Subject children.
6. Preflight должен PASS с новым exact engine. При unknown effect сначала reconcile исходную подготовку/ownership, не loop retry. Read-only doctor можно повторить после доказанного прекращения observers, но повтор не считается системным исправлением.
7. Не повторять живую Judge qualification при изменениях harness/transport: inputs/model/oracle не менялись; переиспользовать валидное task-scoped evidence. Изменение engine требует его admission, не 20 новых Judge calls.
8. Запустить runner eval run штатно, сохранить EVAL ID. Дождаться baseline PASS, register/start/finish receipts и cleanup подтверждения baseline, native Session, actual SPECIFY/первого dispatch. Проверить state/controller/timeline/turns/Work/lease, не manifest entry-stage. Ошибка до запуска — не «E2E запущен».
9. Успешный полный цикл отдельно подтверждается MERGE, terminal EVAL, Final Judge и settled owned resources. На новом blocker — read-only причина и самостоятельное исправление исходников; не manual repair/resume старого EVAL и не изменение продукта. Не обещать достижение MERGE только на основании успешного старта.

## Готовность / ponytail review

Решения приняты: существующий transport/clock, фазовый contract, setup120s/control30s defaults, отдельный maintenance lease horizon, async probes вне transactions, bounded reason diagnostics, все harnesses, no-effect/unknown retry rules, точный artifact pin, критерии start vs completion, необходимые regressions и live admission.

Добавлено при readiness review: отсутствие proof конкретного clock trigger в старых receipts; скрытые внутренние utility deadlines; retained daemon readiness вместо polling keepalive; async API callers/transaction race revalidation; статический resolve без subprocess; digest streaming; большой output/redaction; compatibility старых errors/adapters; отсутствие fake full release claim; exception expiry; shared resource safety; полная inventory traceability.

Не добавляем универсальный orchestration framework, новую БД heartbeat, host load auto-scaler, глобальный cache qualification или provider-specific timeout workaround. Не отключаем полезные integrity/identity checks. План не содержит новых продуктовых решений. Реализация готова начинаться; live проверка может выявить новый независимый blocker, это не основание расширять scope тайно.
