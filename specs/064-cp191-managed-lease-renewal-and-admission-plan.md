# 064 — Managed lease renewal, admission и устойчивость к contention

Дата: 2026-10-03. Статус: **planned; implementation not started**.
Readiness review: 2026-10-03; уточнены API/commit acknowledgements, crash/retry boundaries, budget/closing и compatibility. Runtime code не изменён.

Исследованный dd-flow: `fix/051-snapshot-worker-provenance`, `96a34d22ba37b9b22ee48e9cb01553e5e5af66b1` (candidate beta.124).
Исследованный dd-eval: `eval/cp193-grok`, `b96c2c0`.
План сохранён в отдельном checkout `docs/064-lease-renewal-plan`; живой definition checkout и EVAL artifacts не изменяются.

## 1. Цель и границы

Устранить системный класс ошибок: временная невозможность подтвердить ownership превращается в потерю owner и остановку полезной работы; при этом некоторые соседние пути, наоборот, допускают работу по устаревшему подтверждению.

Результат реализации: heartbeat обновляет только нужный registry, без RUN migrations; кратковременный contention восстанавливается до native dispatch; новый dispatch всегда требует действующего owner; settlement атомарен; поведение едино для шести адаптеров.

В scope: dd-flow CLI/storage/resource registry, общий managed-daemon/admission, controller/control/scope/check owners, MERGE dispatch lease, dd-eval observer и связанные тесты/runbooks.
Вне scope: продукт задачи, prompts продукта, новая capacity policy, provider auth/quota, переоценка исторического Judge, изменение сохранённых EVAL/Session/Work, автоматизация мониторинга в Codex.
Lease heartbeat процесса и heartbeat-автоматизация Codex — разные механизмы. Этот план не включает включение последней.

Новые E2E не запускаются при составлении плана. Реализация/релиз и живая приёмка — следующие отдельные действия; текущий Grok CP-193 не используется как экспериментальная площадка.

## 2. Уже установленная цепочка Luna CP-191

EVAL `EVAL-20261002165025-728be00d`, home `/Users/deksden/.dd-eval/qualification/cp-191-luna`; RUN `RUN-001-eval-subject`, controller `DRV-e0cdb67a-bceb-46eb-b026-96e5108b0e13`.

1. SPECIFY, PROTOCOLIZE, PLAN, PLAN-REVIEW завершены; actual stage — CODE.
2. CODE gates обнаружили failures и штатно создали `WRK-011-code-gate-repair`. Предыдущий native Turn завершился в `2026-10-02T19:02:59.989Z`; repair Work ещё не начал работу.
3. В `19:03:08.413Z` сохранён следующий prompt request; в `19:03:20.295Z` получена ошибка. Native dispatch заблокирован ownership guard до отправки нового Turn.
4. Cause chain: `process_heartbeat_timeout` (15058 ms, maintenance effect unknown) → `process_ownership_unknown` → `harness_adapter_failed`. Provider record: `PROC-f07ef017-a6ca-4626-aec2-c8fa37ad43f3`, PID 43476; daemon PID 43262.
5. Затем controller/EVAL инициировали cancellation и daemon shutdown. Последующее `daemon_stopped` — следствие, не первичная ошибка провайдера. Итог: `completed_with_failures`, infrastructure invalid; FinalJudge `not_run_cleanup_only`, cleanup settled.

Здесь **нет доказанного serverOverloaded**. Gate failures (API readiness timeout, formatting, browser timeout) — основание для работы repair/модели, а не повод вручную исправлять продукт и не причина инфраструктурного обрыва.

Достоверно установлены ошибочная pre-dispatch reconfirmation и разрушительная классификация uncertainty. Точная причина задержки исторического CLI на 15 секунд не восстановлена: текущие diagnostics не показывают, была ли это RUN/resource блокировка, scheduling или другая фаза. Нельзя объявлять SQLite доказанной причиной именно этого таймаута.

Изолированные probes на установленном beta.124 повторены 2026-10-03:

- Cold `runtime process heartbeat` при удержании чужого RUN writer завершился `ERR_SQLITE_ERROR`, `sqlite_extended_code=5`, `database is locked`, приблизительно за 4.7 s. Heartbeat не должен зависеть от этого writer.
- Admission присоединился к failing pending renewal: один CLI heartbeat, rejection. Следующая отдельная reconfirmation того же id/token успешна: второй CLI heartbeat. Это воспроизводит ошибку join, не смерть owner.

Воспроизведения использовали только временные homes. В реализации перенести их в repo tests, не оставлять `/tmp` единственным доказательством.

## 3. Реестр дефектов и системных исправлений

Ссылки ниже относятся к указанным исходным commit; номера строк могут сдвинуться после реализации.

| ID | Проверенное место / дефект | Планируемое исправление |
|---|---|---|
| L1 | `dd-flow/src/cli/run-cli.ts:605–640`: runtime heartbeat/confirm/admission/finish/check-admission/release-turn открывают RUN context в initialize | Отдельно определить hot maintenance/admission routes: RUN read-existing, resource prepared writer; startup/migration остаются явными |
| L2 | `src/storage/database.ts:461–528`, `writer-contract.ts:19–21`: fresh resource CLI выполняет DDL и BEGIN IMMEDIATE; process cache маскирует это в тестах | Prepared existing resource writer: проверка schema/writer compatibility, connection-local writer registration, без DDL/migrations |
| L3 | `runtime/context.ts:37`, `database.ts:363,461`: абсолютный transport deadline применяется только к hook RUN store, не resource store | Request-scoped deadline на open/read/write/commit обоих необходимых store; cached connection не сохраняет deadline чужого запроса |
| L4 | `harness-runtime/lib/managed-daemon.mjs:67,227–247`: pre-dispatch recheck join-ит failing pending heartbeat, не делает fresh attempt | Single-flight + bounded fresh reconfirmation после завершения неудачной попытки; retry только maintenance/pre-native admission |
| L5 | `managed-daemon.mjs:62–85`: provider leases проверяются только перед capacity loop, а не перед каждым выходом к native action | Проверять daemon/provider lease gates до/после каждого admission await и после capacity wait; cancellation/generation проверять там же |
| L6 | `managed-daemon.mjs:56,160–181`: tracked registrations без runtime_owner/stateDir используют глобальный fail-fast, без recheck и изоляции | Привязать tracked lease к явному stateDir/config, вне зависимости от наличия runtime_owner; не блокировать чужой daemon ошибкой другой записи |
| L7 | `managed-daemon.mjs:220–241`, `run-controller.ts:137–154`: optimistic local TTL и cache key только process id; controller hardcodes 14 min | Receipt с persisted expiry; scoped key `(resourceHome,id,token)`; deadline из receipt вместо response-time TTL/фиксированного горизонта |
| L8 | `run-cli.ts:2639–2640`, `runtime-budget.ts:164,253`: budget-free/local admission не проверяет expiry; budgeted path делает это | Единый owner validity contract независимо от budget: exact binding/token/state/live identity/future persisted expiry + существующие fences |
| L9 | `run-control-worker.ts:203–207`, `runtime-scope-worker.ts:147–151`, `code-checks.ts:660–664` | Разделить explicit loss, transient uncertainty и fatal error; не терять intent/не убивать admitted child из-за одного BUSY |
| L10 | `run-controller.ts:129–156,399–415,539–543`: uncertainty получает имя, но sustained failure всё равно вызывает RUN-stop и abort | Внешняя bounded renewal до productive boundary; внутри writer только assertion; uncertainty не проходит generic fatal-stop до исчерпания бюджета |
| L11 | `managed-processes.ts:228–245`: terminal UPDATE и resources DELETE раздельны; terminal replay не удаляет оставшиеся claims | Одна resource transaction для transition + exact-owner cleanup; replay безопасно завершает тот же terminal owner |
| L12 | `managed-daemon.mjs:250–257`: finish не координируется с pending heartbeat; failed finish оставляет остановленный timer | Closing gate, bounded drain pending, запрет late state updates; retained cleanup status и повтор settlement без productive admission |
| L13 | `dd-eval/lib/eval-resume-worker.mjs:268–336`: observer не renew-ится; check-admission вне observation retry | Observer renewal и bounded retry pre-dispatch checks; сохранить scope/control binding и observation budget; coordinating close/finish |
| L14 | `src/services/merge-server.ts:79,135`: timer throw вне catch; stale expiry snapshot UPDATE без state/token/expiry CAS | Contain timer exceptions; fresh conditional expiry reconciliation под существующим writer, не затирать renewed/completed/replaced dispatch |
| L15 | `run-control-worker.ts:293–299`, `runtime-scope-worker.ts:193–199`: persistence/finish failure маскирует primary или пропускает settlement | Best-effort независимые cleanup phases, primary + secondary errors; отсутствие proof не выдавать за clean completion |
| L16 | `managed-daemon.mjs:168–173`: bounded только heartbeat; dd-eval managed/baseline calls без собственного maintenance budget, observer уже имеет AbortSignal.timeout(60000), но без общего inner deadline/settlement protocol | Согласовать существующие transport budgets с request deadline и reconciliation; не вводить второй конкурирующий timer и не делать слепой replay register/confirm |
| L17 | `src/services/run-controller-adapter.ts:189–193,225–228`: requested intent сохранён, затем ownership assertion; catch пишет outcome_unknown даже до adapter launch | Разделить durable intent и возможный external effect; reconfirmation сохраняет тот же operation ID/args, не создаёт новый prompt/Turn |
| L18 | `src/services/runtime-budget.ts:270–274`: reuse provider-turn claim проверяет token, но не сравнивает сохранённые operation/Session параметры | Same-ID admission retry допускается только с тем же retained dispatch fingerprint; другое operation/Session не переиспользует claim |

L1–L4 и L10 объясняют системный путь преждевременного обрыва Luna. Остальные — обнаруженные родственные дефекты/уязвимые границы; их участие в историческом EVAL **не утверждается**.

## 4. Карта аудита и намеренные различия

Поиски проведены по `dd-flow/src`, runtime assets, `scripts`, `test`, и `dd-eval/lib`, `test`: heartbeat/renewLease/lease expiry/interval callers; прочитаны shared registry/storage и callers. Аудит не означает формального доказательства отсутствия всех ошибок во всём проекте: зафиксирована полнота найденных путей именно этого класса на указанных revisions.

Все шесть harness paths используют общий durable dispatch/ownership guard:

- Codex: `dd-codex-daemon.mjs:181`, daemon heartbeat `:103`, provider через `startManagedBridge`.
- ZCode: `dd-zcode-daemon.mjs:699`, daemon `:683`, provider через `startManagedBridge`.
- Grok: `dd-grok-daemon.mjs:482`, daemon `:470`, provider через `startManagedBridge`.
- AGY: `dd-agy-daemon.mjs:570`, daemon `:559`, per-session provider `:316`.
- OpenCode: `dd-opencode-daemon.mjs:246`, daemon/provider `:233–234`.
- Droid: `dd-droid-daemon.mjs:117`, daemon `:128`, provider `dd-droid.mjs:116`.

Поэтому guard/renewal исправляется в shared path; adapter-specific изменения нужны только для передачи binding/receipt и per-provider lifetime. Grok `session.resume → session.inspect` остаётся read-only; не превращать его в replay native prompt.

`runCheck` общий для CODE, workspace-bootstrap, runtime-service: исправить caller contract во всех трёх, не только в CODE. Controller/control/scope workers и MERGE имеют отдельные lifecycle/fences, но одинаковую классификацию uncertainty.

Проверенные ограничения, которые нельзя «унифицировать» без причины:

- Managed process expiry — потеря свежего наблюдения, **не смерть**. Сохраняем same-token renewal после host sleep; expired registration не допускает новую продуктивную операцию до успешного обновления. Не вводить strict-expiry запрет heartbeat/finish.
- Reclaim managed owner уже сравнивает candidate внутри writer и проверяет physical liveness (`managed-processes.ts:278–304`). Сохраняем этот CAS; не захватывать живой process по одному времени.
- `assertManagedProcessLease` остаётся isolated read внутри RUN writer; resource renewal там запрещён.
- Workspace gates/port claims имеют explicit release и liveness protection, не являются provider heartbeat. Не освобождать порт по одному истечению timestamp.
- Lane locks — exclusive TTL/takeover contract (`lanes.ts`, `vnext-merge.ts`), не managed process. Их policy не заменяется same-owner revival. В регрессии проверить, что MERGE не стал работать после lane takeover.
- Recovery observation budget (120 s активного наблюдения, отдельное правило scheduler gap) не сбрасывается heartbeat retry. `runControllerStatus` и обычный runner status остаются read-only.
- Baseline policy ограничена 600000 ms на command, что меньше default physical lease 15 min: новый периодический heartbeat baseline не нужен без расширения policy. Admission/setup/cleanup transport всё равно должен быть bounded.
- Upstream Grok/ZCode не меняем: подтверждённый failure path находится до native dispatch в нашем shared tooling; upstream auth/Session API не исправит эти дефекты.

## 5. Единый контракт и выбранная политика

### 5.1 Renewal acknowledgement и authority

Renewal core возвращает exact id/binding и persisted `lease_expires_at` после успешного UPDATE. CLI сохраняет поле `ok`, добавляет receipt; existing boolean API сохраняется thin wrapper, но все monitors этого плана получают expiry из core, не вычисляют её заново.

Receipt относится к **той же committed mutation**: сначала resource writer reservation, затем now/UPDATE/SELECT exact id+token в одной synchronous transaction, и acknowledgement только после COMMIT. Нельзя делать независимый status SELECT после autocommit и получить expiry уже заменённого владельца. Срок рассчитывается после получения writer, а не до ожидания блокировки; задержанный response не увеличивает expiry. Commit failure не возвращает successful receipt. Это использует существующий writeTransaction/run/get, без обхода facade через UPDATE в read API.

Lease token нужен для SQL CAS, но не включается в новые diagnostics. Receipt/observer state связываются с resource home, id, token internally. Invalid/missing expiry — ошибка контракта, не повод придумать локальный TTL.

Renewal expired same-token active process разрешён, если owner не заменён/не terminal/не closing. Новая productive admission требует свежей действующей lease; после sleep сначала renewal и recheck identities/fences. Finish разрешён после expiry: завершение ownership не является новой productive работой.

Budgeted admission revalidates в существующей resource transaction. Budget-free и local admission получают свежую read snapshot validity проверку без добавления ненужного writer. При любом await/queue заново проверяются local ownership и RUN/control generation перед native action. Не обещать глобальную атомарность между двумя БД и внешним provider; сохранить existing native dispatch fence и exact operation binding.

### 5.2 Состояния и действия

Минимальные состояния monitor: confirmed, temporarily unconfirmed, explicitly lost, closing/closed. Fatal nontransient failure сохраняется как ошибка, а не как retryable uncertainty.

- `ok=false`, token replacement, terminal owner, superseded scope/RUN binding или generation change → hard block; не retry для обхода guard. Fence проверяется по роли: authorized RUN-control работает при своём ожидаемом draining/sealed, scope-control — под своим current control fence. Эти fences запрещают новую Subject/Judge работу, но не свой stop/cleanup.
- SQLite BUSY/LOCKED (структурный extended code), phase-bound maintenance transport timeout/потеря maintenance acknowledgement → bounded reconfirmation. Не классифицировать все `ERR_SQLITE_ERROR`, все `process_ownership_unknown` или любую exception как transient.
- Corrupt/incompatible/missing prepared storage, malformed receipt, permissions/IO failure без доказанного transient класса, programming/progress errors → отдельная точная failure, без бесконечных retries.
- Unknown native effect после фактической отправки → существующий durable observation/reconciliation; **не повтор native action**.

Конкретный исходный budget реализации: 30 s от первой uncertainty, retry delays 250/500/1000/2000 ms (далее 2000), одна in-flight renewal. Каждая CLI попытка максимум 5 s **включая** response/physical cleanup tail и не дольше оставшегося общего бюджета; SQLite wait ограничивается тем же absolute deadline. Для heartbeat/admission это не увеличение lease TTL и не увеличение provider capacity retry policy.

Budget не начинается заново при join, смене timer tick, повторном assert или очередной ошибке. Очередь capacity сама по себе не расходует renewal-uncertainty budget: он начинается с maintenance failure, а не с provider_capacity. Только committed exact-owner success завершает текущий uncertainty episode; после exhausted/lost/closing поздний success его не сбрасывает. Clock для elapsed/backoff — monotonic; persisted expiry — wall-clock registry timestamp. Backward clock jump не удлиняет retry budget. На resume после scheduler/host sleep сначала fresh confirmation; старый cached proof не является разрешением dispatch. Никаких sleep/CLI/renewal внутри DB writeTransaction.

После failing join дождаться завершения этой attempt и сделать fresh attempt, если budget есть. Timeout rejection **не равен** physical CLI exit: existing bounded runner может вернуть cleanup_unconfirmed. До подтверждения завершения предыдущего CLI не запускать следующую mutable attempt; допускается bounded read-only reconciliation. Если physical exit не доказан за оставшийся budget, сохранить maintenance effect unknown и закончить recovery-blocked/pending cleanup, без native dispatch. Не заявлять single-flight только на уровне Promise, пока прежний subprocess ещё может писать.

При timeout-after-commit heartbeat после подтверждённого CLI exit можно повторить exact id/token CAS: native effect отсутствует, но resource effect мог произойти. Для admission сохранить operation id/fingerprint и reconcile существующую reservation; slot не создавать дважды и не освобождать по одному таймауту. Fingerprint связывает registration, daemon, operation, Session и prompt digest там, где он есть; retained claim проверяет фактически сохранённые параметры, не один token. Изменение параметров при том же ID — conflict, не fresh retry.

Во время uncertainty запрещён **новый** productive/control dispatch до его role-specific подтверждения. Уже admitted native Turn/check не отменяется от одного transient failure или одного истечения cached proof: это не доказательство смерти/смены owner. Выполняется bounded reconfirmation/наблюдение в пределах 30 s uncertainty budget; нельзя обещать, что уже отправленный внешний Turn «поставлен на паузу». До fresh proof controller не выдаёт новых команд/mutations. Истечение cached proof, включая host sleep, сначала ведёт к fresh same-token renewal, а не generic fatal-stop. Только explicit loss либо исчерпание budget без fresh proof даёт typed infra outcome и retained reconciliation/cleanup, не фиктивную Work success и не утверждение «provider умер». Physical cancel/stop допустим только для доказанно своего процесса/Session; при смене token/PID identity не сигналить replacement и не освобождать ресурсы.

Control cancellation/closing немедленно прекращает retry queue; wakeups recheck fence. Stop/cleanup не требуют productive admission; они имеют отдельный bounded settlement budget 30 s и сохраняют pending/unknown proof при исчерпании, не объявляют ресурсы свободными.

Action budgets не смешиваются: heartbeat/confirm/admission/check-admission — maintenance attempts 5 s и uncertainty episode 30 s; finish/release-turn — bookkeeping attempts в общем settlement budget 30 s. Register имеет отдельный startup bookkeeping budget 30 s с reconciliation, не входит в ongoing renewal episode. Эти значения не заменяют native session.create/init/prompt, физические grace/stop или existing recovery observation limits. `provider_capacity` — нормальная очередь, не ошибка renewal. Уменьшение внешнего observer RPC timeout с existing 60 s применять только к maintenance CLI, не ко всему runnerResume/Judge.

### 5.3 Transaction и lifecycle

- Prepared stores создаются/мигрируются на явной launch/preflight boundary; hot command лишь валидирует schema и writer version. Не обходить import/writer compatibility protections переводом RUN mode в readonly.
- Cached resource connection получает request-local deadline; не хранить один env deadline в долгоживущем facade и не менять mode чужой transaction. После request восстанавливать busy_timeout/default bounds; ошибка/expired deadline запроса A не должна портить запрос B. Scope deadline внутри synchronous facade/transaction, без process-global mutable deadline. Nested writer contracts/savepoints проверяются тестом.
- Terminal UPDATE + resources DELETE одной resource transaction с exact token/state checks внутри writer. Idempotent same-token same-terminal replay освобождает только claims этого retained owner; replacement не затрагивается. Никакого RUN writer при resource finish.
- Closing публикуется до timer stop; bounded pending drain не даёт late completion вернуть confirmed. Не воскрешать timer после successful finish. Failed/unconfirmed finish оставляет cleanup-pending, а не право dispatch; maintenance rearm только после доказанного active same-owner state.
- Timeout confirm/register не retry-ится слепо: confirm-after-commit сверить id/token/PID/state/expiry; register использовать уже имеющийся stable operation binding и найти единственный retained record либо завершить неопределённостью. Не вводить поиск случайного PID или новый owner вместо старого.

### 5.4 Минимальный интерфейс и совместимость

- Renewal receipt CLI: existing `ok`, `process_id`, при success — `lease_expires_at` и `registration_sha256` из exact-owner row. Core использует discriminated owned/not-owned result; boolean wrapper нужен только для совместимости public service API, не для новых monitors. Failed validation/storage остаётся typed error, не `owned=false`.
- Confirm сохраняет existing `process` envelope и берёт тот же committed expiry/binding. Register/confirm/start adapters сохраняют acknowledgement до scheduling monitor. Отрицательный heartbeat `ok=false` остаётся совместимым; bounded transport JSON decoder не превращает его в generic native_hook_failed.
- Использовать existing `controller_lease_lost`, `controller_lease_unconfirmed`, `process_lease_lost`, `process_ownership_unknown` с структурными reason/phase. Expiry-alone → unconfirmed/renewal_required, **не lost** (в том числе в `assertManagedProcessLease`). Classifier рассматривает только ошибки собственного maintenance phase и bounded typed cause chain; не доверять строке ошибки или провайдерскому self-report `pre_dispatch`.
- Два БД режима независимы: RUN read-existing, resource prepared-existing-writer. Не переиспользовать `hook` mode как название runtime maintenance. Для горячих команд startup/read-only routing checks и import/writer compatibility сохраняются; API prepared-open проверяет необходимые таблицы/columns/indexes и writer-contract 2, а не один факт существования файла.
  Resource mode и maintenance deadline передавать trusted context/options к registry/budget services; `registry(context)` и прямые `getResourceDatabase` callers должны использовать их одинаково. Не хранить route mode в process-global cache и не принимать env flag как право обхода preparation/writer checks. In-process owners готовят store один раз; отдельные renewal attempts получают собственный bounded request scope.
- Никакой обязательной SQL schema migration ради receipt/phase/fingerprint: использовать имеющиеся columns/JSON. Phase в existing `run_controller_operations.input_json` — отдельное поле, input_hash по неизменному dispatch input, не по mutable phase. Изменение phase — owner-token/generation CAS.
- Старый operation без durable pre-launch phase консервативно external-effect-unknown; отсутствие нового поля **не** разрешает replay. Legacy claim reuse допустим лишь когда existing metadata и exact retained journal доказывают тот же dispatch; иначе typed reconciliation-required. Новые cold/packed fixtures включают legacy cases.
- Старый pinned executable без нового receipt не заменять текущим глобальным бинарём и не придумывать TTL: новый launcher проверяет поддерживаемый tuple на qualification/preflight; старые EVAL продолжают использовать сохранённый runtime. Store writer version остаётся прежним, если schema contract не изменён. Любая действительно необходимая schema change требует явной preparation/migration boundary и отдельного теста.
- Source TS и packaged MJS assets получают один малый pure renewal-state/classification helper по существующему pattern `codex-capacity-policy.mjs` + `.d.mts`, копируемый `scripts/copy-assets.mjs`. Не менять tsconfig/добавлять новый bundler ради этого. Не иметь два разных backoff/budget алгоритма в controller и adapters; transports и role-specific assertions остаются существующими. dd-eval использует pinned installed CLI contract, а не imports source checkout другого repo.

## 6. Пакеты реализации и последовательность

### W1 — Prepared storage и deadline (L1–L3)

1. Зафиксировать тест cold CLI под чужим RUN lock до правки.
2. В `run-cli.ts` hot allowlist: heartbeat, confirm, admission, finish, check-admission, release-turn. RUN context read-existing; check-admission ресурсный read-only, остальные используют prepared resource writer только где есть mutation. Register/start/stop/scope control и recovery оставляют свои existing lifecycle boundaries; не переводить всё семейство runtime в readonly. Release-turn освобождает по proof и exact owner даже после expiry; его нельзя случайно приравнять к productive admission.
3. В `database.ts`/context добавить prepared resource writer поверх существующих writer-contract checks. Не выполнять WAL mode change/DDL/migrations на hot path; required schema проверять чтением. Missing/incompatible store → typed remediation «prepare», без self-repair в heartbeat.
4. Передавать общий absolute deadline всем request phases, включая router/preparation context и compatibility reads до service dispatch; сохранить hook error taxonomy, не переименовывать native hook контракт без необходимости. Не дать router израсходовать независимые 4 s сверх budget, затем выдать service новый budget. Inherited native hook deadline учитывается только для участвующего запроса; background maintenance не наследует просроченный deadline чужого hook invocation.
5. Startup/preflight гарантируют preparation до register/confirm/monitor во всех daemon и EVAL-local owners. Проверить standalone CLI compatibility: явная init остаётся рабочей, maintenance на неподготовленном home не создаёт schema тайно.

### W2 — Authoritative receipt и atomic finish (L7–L8, L11, L18)

1. Renewal core/receipt, thin boolean compatibility wrapper при необходимости; update CLI mocks и consumers.
2. Проверки expiry/binding независимо от budget, с сохранением read-only check-admission.
3. Atomic finish/replay и tests crash/delete injection/token race. Historical terminal records не переписывать массово; same-owner явный settlement replay может исправить свой partial cleanup. Без sweep unrelated claims.
4. Idempotent admission reuse сравнивает dispatch fingerprint/retained metadata; changed operation/Session/prompt digest при том же ID возвращает conflict. Receipt той же committed renewal mutation; no late read of replacement expiry.

### W3 — Shared daemon gate (L4–L6, L12, L16)

1. Extract минимальный lease gate из existing managed-daemon; применять до/после каждого queue/admission await.
2. Scoped cache key, explicit stateDir для ownerless tracked record; provider registration должна быть известна guard даже при нетипичной startup задержке.
3. Single-flight/bounded fresh reconfirmation, exact failure classification, authoritative deadline.
4. Bounded maintenance transports и commit acknowledgement reconciliation. Успешный admission, которому последовал local loss/cancel, не ведёт к native action; retained reservation settle/reconcile по существующему operation proof, без premature free.
5. Closing/drain/finish protocol для daemon и per-session provider. Не добавлять retry native RPC или глобальный observation-loss allowlist.
6. Provider lifetime учитывать явно: persistent bridges и текущие retained AGY/Droid provider records проверяются по exact binding/physical identity; не требовать будущий AGY provider PID до его spawn. Завершённый per-session provider не должен оставаться активным gate другого Session; mere map entry или acknowledged heartbeat не заменяет liveness proof.

### W4 — In-process owners и MERGE (L9–L10, L14–L15, L17)

1. Адаптировать existing controller monitor к receipt/typed uncertainty; использовать тот же небольшой contract для control/scope/runCheck. Не строить новый scheduler/service/framework.
2. Перенести async bounded reconfirmation к внешней boundary. Synchronous assertion внутри writer при uncertainty бросает typed deferred error и откатывает transaction; нельзя вернуть «успешный status» и закоммитить неподтверждённую mutation. Внешний owner renew/recheck и повторяет только доказанно безопасную подготовку, не native effect.
3. Разделить progress callback failure от renewal failure в runCheck. Explicit loss по-прежнему останавливает именно свой process group с proof.
4. Contain MERGE timer exception; проверять UPDATE changes и token/generation. Guard/generation recheck внутри writer/CAS boundary и при heartbeat UPDATE, и при expiry reconcile. Reconcile читает current owner/state/expiry внутри writer либо делает conditional CAS; stale candidate не переводит свежий dispatch в recovery_required.
5. Независимые persistence/settlement phases сохраняют primary/secondary ошибки, не пропускают cleanup при failure metadata write. Сохранять accepted intent и recovery budget.
6. В `run-controller-adapter.ts` сохранить requested ID/input hash при deferred pre-launch assertion. Durable phase: prepared/no_external_effect после intent и до launch; external_dispatch_possible **до** spawn adapter; receipt_observed после валидного receipt; завершение по существующему status. Все переходы owner/generation CAS. После uncertainty и crash можно возобновить тот же prepared ID только с current binding, неизменным input и доказанным no_external_effect; не создавать новый prompt/Turn. Crash между external-start marker и spawn остаётся консервативно unknown; не откатывать marker по одному отсутствию daemon journal. Уже completed receipt после поздней uncertainty не откатывается и не переотправляется; owner сначала reconfirm-ится для дальнейших mutations. Existing adapter-error reconciliation не должна сама требовать native dispatch и превращать безопасный pre-launch defer в generic stop.

### W5 — dd-eval observer и operational integration (L13, L16)

1. Renew observer на существующем retained id/token; single-flight timer/loop с closing gate; initial confirm receipt задаёт expiry.
2. Check-admission входит в отдельный pre-dispatch retry boundary. Observation retry после runnerResume не повторяет paid Judge/Subject/native effect; существующая journal-aware reattachment остаётся authority.
3. Scope control supersedes observer; stale request/manifest identity остаются hard errors; renewal не сбрасывает observation.remaining_ms.
   Timer renewal должен выполняться также во время долгого runnerResume/paid Judge await; не только между итерациями loop. При uncertainty следующее действие runner fenced; уже запущенный runner reattaches через journal, не повторяет paid работу. После exhausted/superseded closing прерывает pending local observer RPC, не отменяя чужой detached RUN как «cleanup observer».
4. Baseline setup/cleanup и `lib/managed-daemon.mjs` используют bounded bookkeeping transport без нового periodic baseline renewal. Freeze old EVALs; новый contract проверяется только в isolated tests/new candidates.
5. Обновить `runbooks/execute-eval.md`, `runbooks/e2e-monitoring.md`, `runbooks/update-harnesses.md`: prepare stores, exact runtime/resource home, distinguish uncertain/lost/expired, diagnostics, installed binary/candidate consistency. Не предлагать manual DB repair/resume исторических результатов.

### W6 — Diagnostics, regression и qualification

Добавить небольшой structured phase record в существующий stderr/error serializer: process id, operation id, daemon/provider role, RUN/resource store kind (без содержимого), attempt/join/fresh, persisted expiry, remaining budget, phase open/validate/renew/admit/commit/ack/close, SQLite extended code, native dispatch started=false/true, maintenance effect separate from native effect.

Timeout сохраняет эти bounded records через существующий diagnostics allowlist. Не логировать токены/credentials/prompts; не добавлять telemetry БД или background collector. Primary timeout не заменять поздним cancellation/daemon_stopped.

Dependencies: W1 → W2 → W3/W4 → W5 → W6 acceptance. Tests добавляются вместе с каждым пакетом, не откладываются на конец. Shared API contract W2 согласовать до параллельной правки consumers.

## 7. Регрессионная матрица

1. **Real cold CLI / two stores:** заранее подготовить оба homes; child process удерживает RUN writer через IPC barrier. Heartbeat/confirm/finish/check-admission/release-turn не ждут этот writer и не меняют schema_version. Admission читает актуальный RUN fence; scope/RUN stop всё ещё блокирует его. Release после expiry с valid settled proof разрешён; expired productive admission запрещён. Не использовать cached same-process connection как единственный тест.
2. **Resource contention/deadline:** удержать resource writer; deadline истекает → bounded typed diagnostic, no native dispatch. Освободить до конца budget → fresh renewal и ровно один native dispatch. Контроль late subprocess termination и timeout-after-commit response.
3. **Pending join:** previous error + failing pending + fresh success; попытки считаются один раз; repeated assert не пополняет budget. Explicit false sticky; неклассифицированная ошибка не retry.
4. **Capacity queue:** daemon healthy, provider loss/error/expiry во время ожидания; освобождение capacity не обходит provider guard. Cancel/daemon.stop/scope fence между await и action → zero native calls; reservation не выдана за завершённую работу.
5. **Binding/clock:** одинаковые ids в разных homes/tokens, delayed confirm/response/startup, shorter TTL, backward wall clock. Stored expiry — authority; monotonic retry budget неизменен. Expired same-token renewal разрешён; expired admission запрещён до fresh proof.
6. **Writer safety:** assertion под RUN writer только read; retry снаружи. Hook/import/writer version protections прежние. Prepared mode на missing/incompatible schema не создаёт/мигрирует её. Cached facade получает текущий deadline, nested transaction/savepoint не ломается.
7. **Finish:** failure DELETE → rollback и retained claims; replay → terminal+cleanup вместе. Token rotation/terminal race не обновляет и не удаляет replacement. Test late success/false heartbeat в обоих порядках с closing и failed finish; registry resurrection запрещена.
8. **Controller/owners:** BUSY→BUSY→success во время активного Turn/check не создаёт RUN-stop/abort и не теряет control intent. Новые mutations fenced до confirmation. Uncertainty после operation_requested и до launch → тот же ID/input, без outcome_unknown/new prompt/двойного turns increment; внутри writer rollback до retry. Already completed receipt не replay-ится при позднем assert failure. Explicit loss и exhausted budget имеют отдельные bounded outcomes; programming/progress error не маскируется renewal retry. Cancel/supersession во время deferred retry каждого controller/control/scope owner прекращает late dispatch, но не теряет accepted stop intent; own control fence разрешает authorized cleanup.
9. **MERGE:** timer BUSY не uncaught exception; renewed/completed/replaced request после stale selection не overwritten expiry reconciler. Lane takeover блокирует старого dispatcher.
10. **Observer:** fake clock больше 15 min; renewal поддерживает admission. Transient check-admission не заканчивает worker; scope fence/manifest mismatch останавливают правильно. Finish закрывает timer; retries не сбрасывают 120 s observation budget.
11. **Primary/secondary:** metadata persistence и finish fail независимо; оба отражены, primary сохранён, clean proof не сфабрикован.
12. **Harness coverage:** shared gate contract для всех шести adapters; AGY/Droid per-provider lifecycle отдельно. Read-only inspect/cancel/cleanup не требуют productive reservation и не запускают native prompt повторно.
13. **Commit acknowledgement:** pause после COMMIT и до stdout; renewal response lost → exact same-owner reconfirmation, no duplicate native dispatch. Token replacement между mutation и response не даёт receipt replacement. Time на lock wait не съедает запрошенный TTL; уже истёкший delayed receipt не допускает dispatch.
14. **Physical single-flight:** timeout с cleanup_unconfirmed и ещё живым maintenance child → no second mutable child/no native launch. После proven exit allowed retry; late success после exhausted/closing не возвращает confirmed. Abort handler/timer не оставляет uncaught rejection или leaked subprocess.
15. **Same-ID fingerprint:** изменённые operation/Session/daemon/prompt при existing claim rejected, same tuple reused без дополнительного slot. Для legacy incomplete claim нужен retained journal proof; отсутствие proof не guess/replay.
16. **Crash phases:** остановка controller после intent, перед external-start marker, после marker, после native dispatch и после completed receipt. Prepared case возобновляется с тем же ID; marker/unknown case только observe; completed case не replay. Superseded generation не редактирует старый phase, не дублирует event/turn accounting.
17. **Deadline/expiry compatibility:** запрос A заканчивается expired deadline/BUSY/rollback error, запрос B на том же cached resource connection получает своё budget и healthy connection. Rollback failure poisoned connection не reused. Malformed/NaN expiry rejected. Observer renewal работает внутри долгого runner await; own control fence, detached RUN и 60 s legacy observation timeout не путаются с новым maintenance budget.

Использовать существующие Vitest/node:test и fixture helpers. Cross-process ordering — IPC/barriers, logical budget — fake clock; избегать sleeps на 15 min, fragile wall-time equalities и live provider credentials.

Основные существующие test targets dd-flow: `managed-processes.test.ts`, `runtime-budget.test.ts`, `run-controller.test.ts`, `run-controller-adapter.test.ts`, `run-control-worker.test.ts`, `runtime-scope-worker.test.ts`, `code-checks.test.ts`, `runtime-service.test.ts`, `merge-server.test.ts`, `scope-writer-cleanup.test.ts`, `native-adapter-contracts.test.ts`, `fixtures/managed-daemon.mjs`. Новый узкий target `test/managed-process-maintenance.test.ts` хранит real cold-CLI/deadline сценарии; принимает явно pinned CLI path для installed-candidate проверки, по умолчанию проверяет локальный build. Test fixture homes всегда отдельные, env реальных EVAL/resource homes не наследуется как authority.
dd-eval: `managed-daemon.test.mjs`, `baseline-admission.test.mjs`, `managed-resume.test.mjs`, `eval-resume.integration.test.mjs`, `daemon-operations.test.mjs`.

Runnable acceptance после реализации:

```sh
# dd-flow source checkout
pnpm typecheck
pnpm build
pnpm exec vitest run --pool=forks --no-file-parallelism test/managed-process-maintenance.test.ts test/managed-processes.test.ts test/runtime-budget.test.ts test/run-controller.test.ts test/run-controller-adapter.test.ts test/run-control-worker.test.ts test/runtime-scope-worker.test.ts test/code-checks.test.ts test/runtime-service.test.ts test/merge-server.test.ts test/scope-writer-cleanup.test.ts test/native-adapter-contracts.test.ts
pnpm test:integration
pnpm test:runtime-sensitive
pnpm test:release

# dd-eval implementation checkout
node --test test/managed-daemon.test.mjs test/baseline-admission.test.mjs test/managed-resume.test.mjs test/eval-resume.integration.test.mjs test/daemon-operations.test.mjs
npm test
git diff --check
```

Добавленный cold-CLI regression включить в обычный suite и candidate installed-tarball qualification; source PASS без проверки packed assets недостаточен. Candidate pack/accept выполняется по существующему release runbook, не обходом его gates. Недоступный native/provider suite отмечается NOT RUN, не PASS.

## 8. Критерии завершения и ponytail-review

- Все L1–L18 имеют fix + runnable regression либо документированное доказательство покрытия одним shared fix; перенос пункта в «будущее» не считается выполнением.
- Cold maintenance не делает schema work и не нуждается в RUN writer; настоящий resource write остаётся fenced/compatible.
- Временная uncertainty восстанавливается в заданном budget без отмены полезного active Turn; explicit loss/cancel всё ещё hard stop; новый native effect не replay-ится.
- Registry expiry/physical identity/owner token согласованы для всех admission paths, включая без budget и observer.
- Atomic settlement и bounded closing не выдают clean/resource-free без proof.
- Tests покрывают real cold subprocess/две БД, а не только mock happy path; packaged runtime идентичен tested candidate.
- Runbooks и implementation report фиксируют точный tested tuple, tests PASS/NOT RUN и неизвестные исторические факты.
- Исторические EVAL не изменены; живая приёмка новыми E2E возможна после offline gates и отдельного разрешения, не входит в текущее составление плана.

Проверка по **ponytail**: нужны не новый heartbeat-сервис и не увеличение timeout с 15 до 30 само по себе, а устранение ненужной RUN writer/DDL зависимости и shared pre-dispatch guard. Используем существующие storage facade, writer contract, bounded transport, error serializer, controller monitor, journals и test runners. Небольшой общий renewal contract вместо шести harness-specific retry implementations; никакой новой зависимости/telemetry store/config framework. Сохраняем разные lease semantics там, где они дают конкретную safety гарантию; не вводим «строгость ради строгости» для same-token renewal или provider-private files.

### Readiness и граница приёмки

1. Before edits сверить HEAD/dirty state обоих implementation repos; plan checkout не является новым tested engine. Если revisions изменились, перепроверить affected callsites; не переносить изменения в live definition checkout. Изменения runtime требуют нового candidate tuple, не изменения pinned beta.124 in place.
2. Реализация завершена только после W1–W6, regression ledger L1–L18 → конкретные tests, source/build и **installed tarball** checks. Targeted PASS сам по себе недостаточен; недоступный suite оставляет явный acceptance gap. Implementation report должен отличать offline implementation complete от live E2E proven.
3. Packed acceptance запускает cold-CLI target против exact installed candidate path в isolated homes; проверяет receipt schema, timeout stderr phases, shared helper asset и соответствие source/version/hash. Нельзя подменять bin глобальным dd-flow или подключаться к resource home живого EVAL.
4. Если packaging/public ABI вынуждают отойти от интерфейса §5.4, сначала обновить contract/tests плана, затем consumers. Не оставлять часть harnesses на guessed TTL или отдельном retry алгоритме ради совместимости.
5. Новый scored E2E не нужен для составления плана и не исправляет продукт вручную. После offline acceptance отдельная live qualification проверяет штатный полный flow и repair continuation; пока она не проведена, достижение полного цикла у четырёх упряжек не заявляется.

План готов к реализации на указанных revisions. Нет недостающего provider доступа или пользовательского выбора, блокирующего offline fixes. 30 s maintenance budget — явная исходная политика с тестируемой верхней границей; её изменение по measured qualification не должно менять ownership/native replay contract. Историческую неизвестную фазу 15 s timeout можно закрыть лишь дополнительными retained diagnostics, не предположением.
