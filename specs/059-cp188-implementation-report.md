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
