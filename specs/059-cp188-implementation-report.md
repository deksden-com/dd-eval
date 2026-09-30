# 059 — implementation / verification

Дата: 2026-09-30. Репозитории: dd-flow `fix/cp187-matrix-admission`, dd-eval `eval/cp188-agy-update`. Node v26.8.2, pnpm 10.23.0. Публикация engine, оплачиваемые qualification/E2E и изменение существующих runtime/продукта не выполнялись.

## Реализация

| ID | Изменение | Проверка |
|---|---|---|
| D1–D5 | Все шесть daemon adapters: shared `completeDaemonShutdown`, physical/provider/resource cleanup до durable success; listener retirement после publication, до ACK. Удалён повторный post-ACK close. | `codex-daemon-concurrency`, `harness-runtime-assets`, native adapter fixtures |
| D6–D7 | Pending fence до await; permanent fence после settlement; rejected noncancel освобождает temporary fence. Control join/serialization, retained phases/tree proof: свежий control завершает только оставшийся cleanup. Старый failed operation не меняется. | `fixtures/daemon-operations`, real Codex socket concurrency |
| D8 | Recoverable snapshot queues во всех шести adapters: rejected caller сохраняет ошибку, следующая write выполняется. | `fixtures/daemon-operations` snapshot failure vectors |
| P1–P2 | Ownership-aware signals, bounded reobservation, EPERM diagnostic, joined bridge physical close/drain; retained daemon identity/PID и endpoint corroboration; primary error отдельно от cleanup. | `fixtures/managed-daemon`, ZCode/Codex fixtures и standalone error regression |
| P3–P5 | TS adapter/check cleanup использует shared helper без post-close unowned SIGKILL; registry сохраняет signal errors и birth fence; merge liveness dead только при ESRCH. | `harness-adapter`, `code-checks`, `managed-processes`, `merge-server` |
| P6 | AGY/OpenCode CLI timeout ждёт bounded group cleanup, timeout primary / cleanup secondary. | existing native adapter contracts |
| P7–P8 | Eval process helper policy parity; baseline timeout/finally/no-scope используют один cleanup, registry finish после physical proof, исходная ошибка не заменяется. | `managed-daemon`, `baseline-admission` |
| J1, J3–J4 | Final/Interaction Judge shared cleanup scope, Interaction start внутри try; semantic verdict сохранён в failure details, capacity typed errors. | `judge-cleanup`, `eval`, `judge-capacity` |
| J2, J5 | Companion `cleanup.json` @1 с verdict/incarnation/operation/hash; locked monotonic writer и short publication recheck. Cached/final/supplemental/control/report consumers не считают result_ready clean completion. HITL qualification @2 проверяет каждый cleanup. | `judge-cleanup`, `judge-supplement`, `runner-control`, `eval`, report schema |
| Q1 | Whole-definition qualification-key narrowing не входит в repair и не реализовано. | Deferred, без оплачиваемой requalification |

Обновлены README dd-flow и monitoring runbook dd-eval. Новых dependencies/frameworks нет. Companion не изменяет `result.json`; historical receipts не переписываются. Причина первоначального kernel EPERM CP188 остаётся неизвестной: последующий ESRCH не доказывает race.

Cleanup writer дополнительно отказывает до stop/write при несовпадении предыдущего verdict/profile/incarnation: чужой companion не заменяется новой «успешной» proof.

## Проверки

- dd-eval `npm test`: 379 total, 370 PASS, 9 предусмотренных SKIP, 0 failures. После усиления PID validator targeted Judge/supplement/eval/schema: 88/88 PASS. Четыре load-sensitive deadline tests дополнительно прошли isolated rerun.
- dd-flow targeted core services: 97/97 PASS; финальный assets/concurrency/adapter rerun: 45/45 PASS (включая standalone primary/cleanup serialization и AGY cancel-before-tree).
- Shared daemon/process + ZCode + AGY fixtures после актуализации cleanup-retry contract: 74/74 PASS.
- Финальные typecheck, lint, build: PASS. Release tests: 1 Node + 8 Vitest PASS.
- Четыре integration shards и runtime-sensitive были первоначально ошибочно запущены одновременно с build в одном checkout. Наблюдались deadline/load failures и чтение частично перезаписанного `dist` (missing export). Эти прогоны **не являются green full gate**. Исправленные конкретные regressions проверены отдельно; дальнейшие serial результаты фиксируются ниже. CI/release readiness не объявляется по одному targeted PASS.
- Shard 4 закончил: 255 PASS, 9 failures (8 controller deadlines, 1 устаревшая AGY cleanup-retry assertion, исправлена). Семистадийные offline fake-provider циклы Luna/Grok/AGY/ZCode и Luna repair прошли. Controller rerun: 7 PASS, 1 повторный 30s timeout; это не скрыто и не объявляется green. Shard 2 остановлен после повторных CLI timeout/lock-expiry failures; изменение timeout/lock policy ради зелёного теста не выполнялось.
- Финальный shared daemon/process/AGY rerun: 43/43 PASS; dd-eval полный suite повторён: 370 PASS / 9 SKIP / 0 failures. После последнего ownership-retry guard Judge/supplement/eval targeted: 86/86 PASS.
- Последний controller timeout (`fences one fatal lifecycle`) прошёл отдельным serial rerun без изменения его 30s budget: 1 PASS (28.29s). Все восемь первоначально failed controller cases имеют последующий PASS, но это не заменяет green полный shard.
- Финальный serial `pnpm test:runtime-sensitive`: 2 files, 30/30 PASS, 340.09s. Проверен окончательный committed dd-flow source, без параллельной перезаписи `dist`.

Ponytail review: shared existing ledger/control/lock/error helpers, stdlib process APIs, без automatic paid/native replay и новых настроек. Единственная новая companion нужна для независимых semantic/lifecycle фактов.

## Delivery

dd-flow commit `20004b4aee99050bcd257221bb5708736f087e6d` отправлен в origin; remote SHA проверен. CI/full release acceptance остаются отдельной проверкой: локальные targeted PASS не подменяют полный green integration gate. Новые E2E не подготовлены и не запущены.

## Независимое ревью реализации — 2026-09-30

Исходная реализация не закрывала все существенные failure boundaries плана. Два независимых audit/review потока проверены основным агентом по diff, реальным callers и offline воспроизведениям. Внесены дополнительные исправления:

| Пробел | Исправление / регрессия |
|---|---|
| Productive request проходит idle precondition await одновременно со stop | Shared fence повторно проверяется непосредственно перед native dispatch/reservation и после persistence; paused-precondition regression Grok/OpenCode не допускает native task. Проверены поздние AGY/Droid dispatch. |
| `result.json` stop publication / endpoint retirement fails после сохранения clean | Все шесть handlers сохраняют `cleanup_failed` с причиной; completed resource lease не оставляет слушающий productive daemon. Старый failed operation не replay/переписывается. |
| `server.close` unlink удаляет pathname replacement listener | Retained Unix endpoint inode/device проверяются перед retirement; при чужом endpoint daemon выходит nonzero без libuv unlink. Реальный subprocess regression сохраняет replacement inode. |
| Forced AGY cancellation использует SUCCESS предыдущего Turn | `prepareStop` отделяет physical settlement от текущей native proof; unproven termination — `clean:false`. Clean restart fixture теперь сначала доказывает settlement root/child. |
| AGY mandatory stream journal error исчезает через catch/active reset | Sticky original drain error возвращается после физической/resource finalization и блокирует productive restart; fake warmup SUCCESS → journal EIO → stop regression сохраняет EIO, не stale clean. |
| Unclean/cleanup_failed/stopping обходят restart authorization | Все шесть entrypoints запрещают replacement bridge в этих состояниях. Clean retained resume и recovery требуют versioned incarnation-bound `required_phases`, все completed, native `result.clean`, inactive tree и existing physical/ledger validation. Legacy label-only clean не сертификат. |
| Short AGY/OpenCode CLI stdin EPIPE падает как unhandled event | Stream error принимается как primary, joined bounded process cleanup; timeout остаётся primary со secondary cleanup. Реальные Node children проверяют EPIPE и TERM-resistant timeout. |
| Cached `eval judge` возвращает verdict как clean success без cleanup | Candidate/profile/cleanup/current-byte checks обязательны перед return. Verdict остаётся сохранённым при отказе, нового оплачиваемого Turn нет. |
| HITL admission доверяет aggregate passed / подменённой item receipt | Фактический semantic verdict связан с exact Judge, stage, fixture hash, aggregate observation; packet сверяется с corpus question и fixture responses. Wrong profile/fixture/question/missing verdict отвергаются. |
| Report/supplement publication пропускает drift / exception сохраняет status settled | Короткий current guard проверяет verdict bytes, все required phases, PID exit. Failure projection явно unknown/failed; semantic verdict не удаляется. Primary ошибки сохраняют retained verdict и при успешном cleanup. Corrupt lifecycle JSON возвращает typed evidence error. |
| Helper cleanup retry недоступен при Final Judge-only failure | Existing explicit `runner cleanup` поддерживает только report-selected current Final Judge/revision: exact retained runtime engine/adapter/owner/profile/canonical paths. Fresh stop-only operation, без daemon.start/Session/prompt. Complete original stop proof при lost ACK позволяет republish companion после свежего physical observation без RPC в dead bridge и без изменения ledger. Missing/foreign ownership остаётся blocked. |

Interaction/qualification/supplemental scopes остаются самостоятельными владельцами; EVAL Final cleanup не сканирует и не останавливает их. Q1 по-прежнему deferred. Новые dependencies, automatic paid retries, публикация engine и изменения продукта/исторических EVAL отсутствуют. README и monitoring runbook уточнены. Ponytail: используются существующие fence, phase receipt, lock, ledger и control entrypoint, без нового recovery framework.

Проверки review fixes: ранний комбинированный dd-eval targeted suite — 158 PASS / 5 expected SKIP; повтор на финальном коде — 157 PASS / 5 SKIP / 1 старый bounded-wait failure. Все новые Judge regressions прошли, включая original/revision owned stop, redirected directory, publication failure, HITL binding и prior completed stop reconciliation. Изолированная supplemental проверка прошла после временного `ps` 5s timeout. dd-flow новые targeted Vitest — 35/35 PASS; Node suites до последнего drain addition — 39/39 PASS; narrow drain regression PASS. Последующий загруженный Node run — 38 PASS / 1 leaderless-process observation failure / 1 endpoint subprocess deadline. Timeout/ownership policy не ослаблялась.

Финальные typecheck, lint и build прошли. Полный integration run review остановлен после deadline failures на загруженном хосте (наблюдался load average 75; AGY fixture 60s и CLI ingress deadlines). Остановлен только собственный тестовый Vitest, не EVAL/provider. Это не green full gate и не доказательство, что каждый deadline имеет только инфраструктурную причину. До зелёного полного acceptance план не объявляется Done/release-ready. Последующие serial результаты фиксируются ниже.

- Финальный serial Node daemon/AGY/recovery run: **43/43 PASS**, включая оба ранее failed/timed-out случая; short CLI EPIPE/timeout: **2/2 PASS**. Финальный release suite: **1 Node + 8 Vitest PASS**.
- Финальный Judge/cached/original+revision cleanup run: **4/4 PASS**, включая redirected directory/file ownership отказ и completed prior stop reconciliation без RPC.
- Старый bounded operator release wait повторно failed isolated (5s observation budget; native subprocess startup/observation не успели, затем test elapsed assertion). Budget не изменён. Полный sequential dd-eval run также получил canonical-managed fixture 60s deadline. Эти gates остаются не зелёными; status Done не выставлен.
- dd-flow review commit: `6f441c2` — source fixes, fixtures и README; publication/live qualification не выполнялись.
- Полный финальный `node --test --test-concurrency=1`: **383 total / 367 PASS / 6 FAIL / 1 cancelled (canonical 60s timeout) / 9 expected SKIP**, 1205.5s. Пять fork fixtures превысили собственный 30s state-wait при живых continuing/settling owners без записанного primary error; cleanup observer не успел settle в test budget. Bounded operator release wait в этом полном прогоне PASS (2034.7ms), несмотря на предыдущие failures. Все новые Judge/HITL/ownership regressions PASS и в полном прогоне. Наличие высокой нагрузки подтверждено, но единственная причина каждого deadline не доказана; эти failures не скрываются и не заменяются blanket timeout increase. Полный acceptance остаётся open.
- Проверен origin SHA dd-flow `6f441c26f9b75253e541be084abfb187667cb745`; checkout чистый. GitHub runs для этого нового SHA пока не обнаружены; старый успешный publish run относится к другому commit и не считается CI proof этого review.
- Последующий последовательный canonical/fork/recovery run: **53 total / 51 PASS / 2 FAIL**, 269.7s. Canonical managed fixture, normal fork, callback failure, explicit digest и cleanup observer прошли без изменения budgets; два оставшихся fork state-wait снова превысили deadline.
- Последний изолированный запуск этих двух случаев (`lost fork observer` и `failed fork stays pending`): **2/2 PASS**, 54.77s. Таким образом, каждый failed/cancelled case полного финального dd-eval прогона имеет последующий PASS, но набор отдельных PASS **не заменяет зелёный полный acceptance**. Read-only проверка call paths также установила, что оба fork случая отключают Judge и не исполняют новые Judge cleanup/publication gates; конкретный новый source defect в этих ожиданиях не подтверждён.
- dd-eval review source commit `4057b1cac322e5f6b518ec72fc3a835143b464ec` отправлен в origin `eval/cp188-agy-update`, exact remote SHA проверен. Исторические runtime артефакты, установленные engines и оплачиваемые E2E не менялись. Последнее дополнение к отчёту — только фиксация завершённых проверок, без новых runtime изменений.
