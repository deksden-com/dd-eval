# 059 — CP188: достоверный shutdown и независимый учёт Judge verdict / cleanup

Дата: 2026-09-30. Статус: source repair и дополнительные review fixes реализованы; full integration acceptance пока не подтверждён. Результаты проверок и ограничения — в `059-cp188-implementation-report.md`. Проверен по ponytail full.

Readiness review: 2026-09-30. После повторного чтения handlers, ledger, registry, baseline и Judge/control readers уточнены failure boundaries, companion receipt, recovery policy и команды проверки (§12–16). Реализация не означает публикацию engine либо подтверждение live цикла; Q1 остаётся deferred.

## 1. Цель и границы

Исправить дефекты dd-flow/adapters/dd-eval, из-за которых успешный ответ Judge превращается в непрозрачный failure либо, наоборот, незавершённый cleanup публикуется как clean completion. Одинаковый контракт для всех adapters, специфична только реализация native settlement.

Не исправлять продукт; не менять исторические EVAL/receipt и frozen definition работающих Luna/ZCode. Grok исключён из live запуска до восстановления квоты; offline контракт проверяется и для него. Этот план не разрешает новые платные квалификации/E2E: это отдельный шаг после реализации и разрешения запуска.

Исходный код: dd-flow `fix/cp187-matrix-admission`, commit `0d75e9e7e18868fbe9eee8d51e4c4d06ab03a8cd`, beta.123; dd-eval `eval/cp188-agy-update`, commit `58c6e33`. План 058 не открывается заново: здесь новые lifecycle-находки после CP188.

## 2. Доказанный инцидент и пределы знания

AGY 1.2.14 прошёл compatibility/capacity. Новый scored AGY не создан: третья проверка HITL qualification остановилась на Codex Judge cleanup.

Qualification key `54f03f578f7dbceec8afc6a687cd85d1f65b9c6f7408fe608facd948f3a0ce37`, operation `operation-7ab8ebee-19ee-410f-aa01-8c24db36ff1a`, item directory `interaction-judge/specify-c1db2113`; native Session `01a0f272-bf04-7de3-87bc-e4547cac8eba`, daemon `cec1d8a7-77c6-467d-bad4-f9ac5853ee8d`, provider PID 49625.

Valid matched verdict сохранён. Stop `5611e084-0736-40cf-9322-c4bef897cef8` записал clean durable result в 13:15:10.172 UTC, затем физический cleanup дал `kill EPERM`, state `cleanup_failed` в 13:15:12.434 UTC. Caller получил `daemon_stop_incomplete`. Позже группа отсутствовала (`ESRCH`), новый stop пытался inspect закрытую трубу и получил `bridge_pipe_broken`.

Почему ОС первоначально вернула EPERM, не установлено: contemporaneous membership/UID отсутствуют. Последующий ESRCH не доказывает race. Исправление не должно игнорировать EPERM или повышать привилегии.

## 3. Реестр после систематического аудита

Пути dd-flow относительны к его checkout; dd-eval — к этому checkout. Это проверенные кодовые дефекты/опасные паттерны; только D1 имеет описанный live incident.

| ID | Место | Находка / необходимое исправление |
|---|---|---|
| D1 | flow `dd-codex-daemon.mjs:115,162` | Clean durable result и ACK раньше physical close и resource finalization; перенести обязательный cleanup в stop action |
| D2 | flow `dd-grok-daemon.mjs:382,429` | Та же ранняя success boundary; offline исправить, новый Grok incident не заявляется |
| D3 | flow `dd-zcode-daemon.mjs:627–644,675` | Physical close уже до result, но повтор close/resource finalize после ACK; swallowed resource failure, shutdown Promise без catch |
| D4 | flow `dd-opencode-daemon.mjs:179–214` | Physical stop до result, resource finalize и повтор stop после ACK |
| D5 | flow `dd-agy-daemon.mjs:560` | Endpoint close запланирован внутри action до durable publication; storage failure может оставить retired endpoint без stop receipt |
| D6 | flow `daemon-operations.mjs:14–26,110–136`, Droid stop | Generation отменяет старые queued requests, но не новые requests после stop; Droid ставит stopping после await inspect |
| D7 | те же control/adapter paths | Concurrent join не покрывает post-ACK cleanup; mixed cancelTree имеет отдельные keys; partial retry снова inspect закрытый provider |
| D8 | flow daemon persist queues: Codex:103, Grok:186, ZCode:244, AGY:242, OpenCode:70 | Rejected write Promise отравляет очередь: последующие `.then(write)` больше не выполняют write; невозможно сохранить cleanup_error/доработать partial cleanup |
| P1 | flow `managed-daemon.mjs:289–327` | Signal EPERM без reobservation; socket lstat timeout скрывает late primary error |
| P2 | flow `dd-codex.mjs:314`, `dd-zcode.mjs:423` | Close не joined, already-exited child ждёт новый exit; physical failure мешает journal drain |
| P3 | flow `services/harness-adapter.ts:59,86`, `code-checks.ts:641–652,677` | Catch-all signal; SIGKILL старому PGID после leader close без нового ownership proof; PID reuse не воспроизведён |
| P4 | flow `services/managed-processes.ts:444–453` | Birth/lease fence сохранён, но signal error стирается и заменяется generic tree_not_settled |
| P5 | flow `services/merge-server.ts:136` | EPERM/неизвестная ошибка liveness считаются dead, возможен конкурирующий server |
| P6 | flow `dd-agy.mjs:24`, `dd-opencode-daemon.mjs:26` | CLI timeout SIGTERM + немедленный reject без bounded settlement/escalation; риск orphan, не новый live incident |
| P7 | eval `lib/managed-daemon.mjs:13–39` | Копия shared stopProcessGroup уже отстала: нет beta.123 ESRCH guard на SIGTERM/SIGKILL |
| P8 | eval `lib/baseline-admission.mjs:48–79` | Timeout cleanup и finally могут конкурировать; при no-runtimeScope ветка возвращает completed до finally и не подтверждает descendants cleanup; finally может заменить исходную ошибку |
| J1 | eval `runner.mjs:2110,2146,2654` | Finally cleanup error подавляет valid verdict return; failure qualification теряет уже полученный corpus result |
| J2 | eval `runner.mjs:1651–1657`, supplemental reuse | Existing result.json используется как completed без проверки cleanup; повторная projection способна скрыть первый cleanup failure |
| J3 | eval `runner.mjs:2130` | Interaction Judge start вне try/finally: partial start/observer loss без cleanup attempt |
| J4 | eval `runner.mjs:2564` | Capacity cleanup хранит только message, теряет typed cause/details |
| J5 | eval `runner.mjs:3813–3833` | Operator control reconciliation завершает final_judge по result_ready без проверки cleanup; ещё один consumer для общего settlement gate |
| Q1 | eval `runner.mjs:2616` | Whole definition tree вызывает оплачиваемую requalification при unrelated subject/docs изменении; отдельная оптимизация, не shutdown blocker |

Аудит охватил шесть daemon adapters, их bridge close/timeout, shared ledger/managed helpers, TS adapter/check/managed-process/merge-server services; dd-eval Judge, qualification, supplemental/reprojection, process/lock/control callers. Не утверждается доказательство отсутствия иных дефектов во всех возможных interleavings.

## 4. P0 — зафиксировать inputs и regression

1. Проверить branches/dirty state/AGENTS; сохранить чужие изменения. Создать отдельный рабочий definition для доработок, не редактировать active frozen checkout.
2. Перенести минимальные очищенные CP188 stop/state/verdict vectors в существующие suites: без credentials, env dumps и private transcript. Сохранить identity/phase/time.
3. Воспроизвести early-clean + late-close failure и Judge reuse/qualification omission offline. Перед изменениями эти проверки должны ловить дефект.
4. Прочитать всех callers меняемых helpers. Не заменять observer cancellation остановкой detached Subject runtime.

## 5. P1 — единая success boundary daemon.stop (D1–D7)

Порядок: admission fence → native tree settlement/cancel → physical provider close → journal/model drain и обязательная resource/auth finalization → durable terminal stop result → retire listener → ACK через уже принятое соединение → process exit. Socket disappearance — transport corroboration, не самостоятельное доказательство native settlement.

- Повторно использовать `durableDaemonDispatch`, `closeManagedBridge`, `finishDaemonProcess`, errorRecord и Droid close-before-ACK pattern; без нового lifecycle framework.
- Fence устанавливается до первого await stop. Все create/prompt/start/fork/resume проходят общий guard; status/operation.inspect и нужные cleanup controls доступны.
- Noncancel stop на активном дереве возвращает typed tree_not_settled, снимает временный fence и оставляет рабочий provider. После irreversible close fence не снимается при cleanup failure.
- Один cleanup Promise на daemon incarnation. Same-mode concurrent stop не дублирует close. Mixed noncancel/cancel stop не теряет cancel intent: rejected noncancel не заменяет cancel; cancel, пришедший после начавшегося irreversible cleanup, присоединяется к нему.
- Partial failure сохраняет completed phases и native settlement proof той же incarnation/generation. Новая control operation продолжает только оставшиеся cleanup phases, не prompt/create/inspect закрытый bridge. Unknown native crash не равен settled.
- Failed operation ID остаётся failed, completed остаётся immutable: повтор bookkeeping не переписывает ledger и не меняет at-most-once productive semantics.
- D3/D4 удалить повторный physical close после ACK; D5 перенести endpoint retirement из action в handler после durable result. Droid fence переставить до inspect.
- Если durable publication либо bookkeeping failed после physical exit: сообщить physical-stopped + cleanup-unsettled, без clean:true; восстановление только оставшейся bookkeeping с доказанной identity. Не маскировать storage failure.
- Existing connections не должны держать shutdown бесконечно: после fence reject productive, ограничить ожидание drain/ACK, не обрывая success reply до отправки. Post-receipt endpoint retirement failure сохранять как transport failure, не выдавать caller чистый успех; проверить offline.

## 6. P2 — process ownership, idempotence и диагностика (P1–P7)

1. Shared helper: ESRCH при signal = уже отсутствует; EPERM/иной signal failure сохранить и bounded reobserve тот же owned target. Только подтверждённый ESRCH позволяет считать physical exit; persistent EPERM/unknown ownership остаётся failure. Не сигналить leaderless group без retained birth/ownership proof.
2. Диагностика: code/message/syscall/signal/PID/PGID/platform/exitCode/signalCode/phase и observation timestamps, без секретов. Если kernel-данные недоступны, явно unknown.
3. Bridge close joined/idempotent: проверить already-exited child до ожидания exit; retry после partial failure продолжает только незавершённые phases. Drain выполнить и при physical failure, сохранив первую ошибку и вторичную drain error.
4. confirmDaemonStopped привязать к retained daemon identity; при timeout читать matching cleanup error/phase. Не читать state другой incarnation, не называть существующий stale pathname живым socket. Не удалять socket вручную как repair/proof.
5. Adapter transport/check cancellation: убрать безусловный post-close SIGKILL по старому PGID; применить существующую ownership-aware модель с bounded settlement. Не считать leader close доказательством отсутствия descendants; unproven survivors дают cleanup-unconfirmed.
6. Registry signal errors сохранять вместе с первичным abort/timeout, не ослаблять birth/lease fence. Merge-server: только ESRCH означает dead; EPERM/прочее не допускают duplicate owner.
7. Short CLI timeout: определить direct-child vs detached-group ownership, bounded terminate/escalate/observe; не слать negative PID nondetached процессу. Сохранить timeout primary и cleanup secondary.
8. Eval copy helper реально используется `baseline-admission.mjs` и `managed-daemon.test.mjs`: оставить и синхронизировать минимальную политику, добавить cross-copy parity regression. Не вводить новый общий package ради этой копии. Baseline execute: все ветки завершаются одним joined cleanup; сохранить command/registration/timeout primary и cleanup secondary; record finish только после physical proof. No-runtimeScope не означает «cleanup не нужен».

## 7. P3 — Judge результат отдельно от cleanup (J1–J4)

- Использовать existing result.json как immutable semantic result, плюс минимальный lifecycle/cleanup receipt (новое additive поле или companion file согласно текущим schema consumers). Не объявлять verdict ошибочным из-за cleanup и не выдавать qualification PASS при незавершённом cleanup.
- Error после valid verdict содержит receipt path/hash/session/candidate или packet identity и отдельный cleanup error. Qualification failure.results включает последний observed verdict и его semantic passed отдельно от cleanup status; глобальный receipt passed только после полного cleanup.
- Final/Interaction/supplemental Judge и cached result/reprojection проходят один settlement gate. Existing verdict + cleanup_failed → retained verdict, blocked/failed cleanup, без final_judge.completed и без нового paid prompt.
- Historical verdict без нового cleanup receipt не получает manufactured settled. При available retained proof проверять incarnation/identity и physical/resource evidence; иначе unknown. Исторические артефакты не переписывать.
- Interaction daemon.start перенести в existing cleanup scope. При uncertain startup установить owned state перед stop, не убить чужой daemon; сохранить startup primary и cleanup secondary.
- Capacity cleanup использовать errorRecord, не расширять cancel retry на произвольные failures. Сохранить различие settled_by_root и Work success.
- Согласовать report/events/projection status с этим разделением и покрыть concurrent projection: verdict reuse не порождает duplicate prompt/completed event.

## 8. P4 — минимальная regression matrix

В существующих suites, без новой тестовой инфраструктуры:

1. Codex late physical close/resource/drain failure: нет clean terminal result; primary cause retained.
2. Все шесть adapters: правильный порядок physical/finalize/durable/retire/ACK; storage failure не превращается в clean success.
3. New productive request during stop rejected; old queued cancelled; status/inspect доступны; rejected noncancel stop не оставляет permanent fence.
4. Concurrent same/mixed stop; partial close retry; repeated same operation ID; no extra prompt/inspect closed pipe.
5. Already-exited bridge, stdin broken, journal drain error; child exits between liveness and signal; ESRCH на TERM/KILL; EPERM→ESRCH; persistent EPERM; leaderless unknown group.
6. Registry lease/birth mismatch не сигналится; adapter/check post-close не сигналит unowned PGID; CLI refuses TERM → bounded escalation/unconfirmed result; Windows direct-child policy.
7. Socket path stale, endpoint failure, different incarnation, ACK lost/client disconnected: durable result остаётся наблюдаемым, нет automatic native replay.
8. Valid Judge verdict + cleanup failure, primary Judge failure + cleanup failure, partial start, cached/reprojection/supplemental reuse. Qualification failed item сохраняет observation, admission остаётся denied.
9. Capacity typed diagnostics; merge-server EPERM не даёт duplicate start. Shared helper copies проходят одни vectors, если обе остаются.

Existing baseline 14/14 managed-daemon/daemon-operations PASS не покрывает post-ACK failure. Не выдавать этот PASS за исправление новых regression.

## 9. P5 — release и критерии завершения реализации

1. Обновить runtime contract/runbooks: clean означает settlement + обязательный cleanup, ошибки сохраняются, никакой ручной DB/socket repair; операторский retry cleanup не повторяет paid prompts.
2. Прогнать targeted regression, typecheck/build и штатные обязательные CI/release gates. Записать exact commands/results/commits; при gate failure реализация не закончена.
3. Независимое ревью всех изменённых lifecycle callers и schema/report readers; проверить соответствие ID реестра tests/implementation. Никаких blanket catch/EPERM-ignore.
4. Публикация engine/обновление installed Codex hook binary — только по release runbook и при разрешении delivery; не менять captured engines текущих EVAL. Подготовка/запуск новых E2E не входит в текущую реализацию без отдельного поручения.
5. Для будущего разрешённого live gate: новый home/definition, exact released artifact, Codex cx/CPA, Judges sol/high; три упряжки до MERGE + Final Judge + clean resource settlement. External quota отдельно от tooling defect. Offline PASS не доказывает полный live цикл.

Done: D1–D8/P1–P8/J1–J5 имеют fix или доказанное удаление ненужного path, executable regression, documentation и успешные required gates. Никакие старые EVAL не исправлены вручную. Q1 отдельно и не блокирует этот Done.

## 10. Q1 — отдельно от обязательного repair

Dependency-scoped HITL identity целесообразна, но не нужна для исправления shutdown. Если делать отдельным поручением: bind corpus/fixtures/prompt/validator implementation/Judge config/relevant runtime code, новый contract/key version; unrelated docs/Subject profile не invalidates, relevant change invalidates. Не заменять implementation identity literal schema string, не переносить historical pass автоматически.

## 11. Ponytail review и исследовательские дополнения

Минимальный repair: переставить cleanup в существующую durable action, переиспользовать Droid listener pattern и shared ownership helpers, добавить один общий guard и existing state phases, разделить verdict/cleanup в существующих readers. Без universal daemon framework, dependency, нового scheduler или broad refactor.

После исходного расследования добавлены: AGY early endpoint retirement, Droid pre-fence window, mixed-stop semantics, post-close unowned SIGKILL в двух services, merge-server EPERM liveness, typed registry diagnostics, short CLI timeout cleanup, отставшая eval helper copy, cached Final/supplemental Judge settlement gate, Interaction startup scope и capacity diagnostics. Находки субагентов перепроверены по общим ledger/handlers, TS cancellation/liveness и runner result/finally/projection paths. Это additions в план, не заявление об уже исправленном коде.

## 12. Readiness: конкретная граница stop / resources / ACK

Первоначальная фраза «все resources stopped до ACK» недостаточно точна: daemon сам ещё жив, чтобы отправить ответ. `finishManagedProcess` освобождает registry resources, а не доказывает физическое исчезновение PID. Уточнение:

- `stopped:true` в stop result означает завершённый native/provider stop и shutdown commit, **не** exit отвечающего daemon PID. `clean:true` означает native proof + provider physical settlement + required evidence/auth/bookkeeping; его нельзя выводить только из closed pipe/socket. `settled:true` не равен Work success. Forced local exit без native proof не clean.
- Daemon registry finish непосредственно перед durable result допускается как текущий handoff-to-exit, только после необратимого productive fence. Финальное physical daemon exit подтверждает клиент/внешний owner по retained birth identity, как уже делают controller `confirmStopped` и recovery. Caller не возвращает overall clean завершение по одному исчезнувшему socket path.
- Если daemon registry уже finished, но durable result/endpoint retirement failed, нельзя оставлять незарегистрированный productive daemon. Сохранить cleanup-only state, запрещённый dispatch и typed failure; операция stop/inspection остаётся возможной только в пределах текущего owned cleanup. При невозможности durable save завершить daemon с ненулевым кодом после физического cleanup; отсутствие receipt остаётся unknown, не success. Не подавлять journal error.
- Отдельно проверить, не надо ли позднее сдвинуть daemon registry finish к listener retirement; минимальный вариант принимается только при перечисленных invariant tests. Новый state `stopping` в registry не вводить ради декларации, если существующей модели достаточно.
- `server.close()` инициировать, но не ждать его callback перед ACK: принятый request socket сам препятствует callback. Ответ flush/close дождаться с bounded deadline; затем закрыть оставшиеся idle соединения этого server, без убийства чужих процессов. Endpoint path cleanup identity-bound, ENOENT идемпотентен; чужой/replaced endpoint не удалять.
- Общий total deadline stop использовать и для RPC, и для подтверждения exit, без скрытого удвоения двух timeoutMs. Существующие grace/timeout параметры сохранить; EPERM reobservation помещается в budget, а не добавляет неограниченный retry. Timeout наблюдателя не доказывает failure native action и не разрешает resend productive operation.

## 13. Readiness: fence, durable phases и storage failure

Не новый state machine framework: небольшой shutdown объект в existing daemon state (incarnation, initiating control IDs, generation, cancel intent, verified tree identity, completed cleanup phases и errors). Фазы фиксируются только после успешного действия; restart/readback не доверяет memory-only patch.

1. `daemon.stop` fence + generation должны блокировать все productive entrypoints, включая вызовы после ожидания permit; `session.cancel` остаётся временным control и сам по себе не устанавливает permanent shutdown fence.
2. Hook verification/resolve, необходимый уже выполняющейся native cancellation, не блокировать общим productive guard. До physical close разрешать нужные lifecycle hooks, после него только retained identity observation без native RPC. Проверить отсутствие cancellation→hook→fence deadlock.
3. Cancel in-flight Turn до physical close: дождаться/согласовать native terminal и pending handler cleanup; late productive finally не снимает shutdown fence, не пишет `running` поверх cleanup_failed/clean и не уничтожает tree proof. Если deadline исчерпан, сохранить partial/unproven stop, не clean.
4. D8: существующие snapshot persistence queues должны разрешать следующую отдельную попытку write после failure; ошибка конкретного write возвращается его caller. Нельзя `.catch(()=>{})` сделать предыдущий mandatory write успешным. Полное failed snapshot может повториться только как новая идентифицированная попытка; failed drain append journal по-прежнему failure, не «забытый» record.
5. Область Promise join: одна незавершённая попытка cleanup; после rejection promise reset допустим только вместе с retained completed phases. Success cache относится к incarnation. Concurrent mixed modes сериализовать: noncancel выполняет проверку и может отказать; ожидающий cancel после отказа выполняет cancellation; не upgrade отмену неявно для noncancel caller.
6. Receipt published, ACK lost: повтор того же ID только возвращает immutable result и завершает transport retirement, не закрывает provider повторно. Physical action completed, receipt write failed: исходный ID остаётся observation-lost; новая **control** operation может использовать trusted retained phase proof, но не terminalize исходную operation задним числом. После смерти daemon нельзя перезапускать native bridge только ради cleanup; missing proof → явный unresolved result/существующий owned control recovery.
7. `save(cleanup_failed)` тоже может отказать. Сохранить primary + persistence secondary через существующий errorRecord/stderr fallback; не promise-rejection loop/unhandled rejection. Physical settlement без сохранённой proof не квалифицирует future restart.
8. Проверить consumers `native-daemon-history.ts`, `run-control.ts`, `run-controller.ts`, `run-controller-recovery.ts`, `driver-recovery.mjs`, eval `daemon-control.mjs`: clean legacy result сам по себе не заменяет matching state, generation, resource ownership и physical proof. Старый defect receipt не считать доказательством нового контракта; historical read-only отображение не переписывать.

## 14. Readiness: конкретный Judge cleanup контракт и consumers

Выбран companion `cleanup.json` в existing Judge attempt root; `result.json` остаётся immutable verdict и не дополняется post-hoc. Companion schema `dd-eval/judge-cleanup@1`, поля: verdict sha256 (либо null до result), profile_id, session_id (nullable до create), daemon_id/state_dir, stop_operation_id, status `settled|failed|unknown`, observed_at, typed error (если есть). State/record/process references привязываются к owned runtime; абсолютный path сам по себе не authority. Validator проверяет binding, shape и monotonic identity, без новой зависимости.

- Одна shared проверка для обычного Final/Interaction, cached verdict, supplemental publish/reuse, `runnerControlReconcile` и report/projection. `recordOperation` сохраняет at-most-once; не расширять его на произвольный replay terminal failed action. Cleanup reconciliation — отдельная existing control identity, не повтор Final Judge.
- `result_ready` остаётся semantic evidence, не completed. `judge_status` может быть failed/in_progress с сохранённым verdict; добавить отдельный `judge_cleanup` status/references в report вместо нового overall EVAL enum. `execution_state`/Subject candidate не меняется из-за Judge cleanup, общий отчёт не утверждает clean завершение.
- Error retained verdict identity записать в `details`, поскольку errorRecord сериализует именно details/cause/cleanup_error, а не произвольные свойства Error.
- Порядок publication: verdict → cleanup attempt → cleanup companion → Judge completed/event/report. Crash между verdict и companion даёт unknown cleanup; crash после companion до report позволяет read-only reuse без paid prompt. Companion write failure не квалифицирует settled.
- Packet/candidate/evidence/fixture/profile hash mismatch либо corrupt verdict/cleanup → typed evidence mismatch, не новый prompt и не подмена данных. Concurrent projection не перезаписывает verdict/cleanup от другого attempt.
- Companion пишет owner под existing attempt lock, atomic write; повтор cleanup под новым control ID может заменить failed/unknown на settled только для той же verdict/incarnation с новой подтверждённой proof. Старый writer не вправе поздно затереть settled stale failure. Report хранит companion hash/control identity; повторная проверка перед completed publication предотвращает stale-read race. Не вводить глобальный lock всего EVAL и не держать lock событий во время native RPC.
- Для новых qualification failures сохранить semantic result и cleanup separately; consumer `assertHitlQualification` проверяет settled для каждого item и aggregate cleanup, не только passed count. Если shape/semantics меняют qualification receipt validation — явно version contract/key, без автоматического переноса исторического PASS.
- Для старых frozen EVAL применять legacy read-only rendering без retroactive clean certification. Supplemental сохраняет исторический original verdict как evidence; отдельный **новый** supplemental runtime обязан пройти новый cleanup gate. Не требовать менять original historical cleanup artifact.
- Startup, которое не создало daemon (spawn error/нет matching state), допускает отсутствие cleanup target как not-created proof; это не cleanup_failed. Observer loss/частично созданный state — unknown и owned stop только после identity check. Не посылать stop arbitrary stale daemon state.

## 15. Readiness: дополнительные regression и конкретные команды

Добавить к §8: persistence write failure → следующая cleanup write попытка действительно выполняется; late Turn finally не снимает fence; hook при cancel не deadlock; registry finish + journal fail не допускают productive daemon; ACK flush при idle client connection; final_judge control reconcile не завершает lifecycle только по result_ready; companion missing/corrupt/wrong incarnation; baseline timeout+finally join и no-runtimeScope descendants settlement.

Проверки выполняются на disposable fake providers/процессах, не на live Sessions/EVAL. Controlled signal vectors проверяют вызовы, permission failure не воспроизводится изменением чужих прав. OS-specific cases skip с причиной на неподдерживаемой платформе, а не unconditional PASS.

Flow targeted:

```sh
node --test test/fixtures/managed-daemon.mjs test/fixtures/daemon-operations.mjs
pnpm exec vitest run --pool=forks --no-file-parallelism test/codex-daemon-concurrency.test.ts test/native-daemon-history.test.ts test/harness-adapter.test.ts test/code-checks.test.ts test/managed-processes.test.ts test/merge-server.test.ts
pnpm test:runtime-sensitive
pnpm typecheck
pnpm lint
pnpm build
```

Eval targeted:

```sh
node --test test/managed-daemon.test.mjs test/baseline-admission.test.mjs test/daemon-operations.test.mjs test/judge-capacity.test.mjs test/judge-supplement.test.mjs test/runner-control.test.mjs test/runner-recovery.test.mjs
npm test
```

Adapter fixtures и новые Judge cases должны реально вызываться existing test runners; просто добавить неисполняемый fixture недостаточно. Перед полным suite проверить fake dependency wiring/no live auth. Полные flow release gates — existing workflow `npm-publish.yml`: typecheck/lint/test:release/build, четыре integration shards и runtime-sensitive; не заменить их targeted PASS. Package runtime Node>=26 для flow; eval Node>=22. Exact Node/pnpm versions записать в report.

## 16. Порядок реализации и handoff

1. P0 и failing regression → P2 process/ownership + P7/P8 baseline parity → P1 adapter boundary/fence/persistence → P3 Judge companion/readers → P4 matrix → P5 docs/local+CI verification. Номера P* сохранены из исходного плана, это dependency order, а не переименование.
2. Отчёт реализации: каждая строка D/P/J → изменённые files → runnable check → результат; Q1 явно deferred. Acceptance review отдельно проверяет новые failure ветки и старые clean paths.
3. Done implementation = source, regression, docs, локальные обязательные gates; publish/live delivery — отдельная явно отмеченная стадия, не путать их статусы. Если CI ещё не запущен/не закончен, писать local verified / CI pending, не full release-ready.
4. Никаких дополнительных строгостей для product/service dirs, новых qualification paid prompts, миграции active runtimes или исправления исторических failures в рамках readiness/repair. Ponytail: reuse existing ledger/state/control/test infrastructure, исправить доказанные paths; Q1 остаётся отдельной оптимизацией.
