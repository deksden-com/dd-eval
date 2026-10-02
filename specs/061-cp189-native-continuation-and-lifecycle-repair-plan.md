# 061 — CP189: native continuation, lifecycle admission и сквозные диагностические контракты

Создан 2026-10-01; проверка готовности, реализация и повторное ревью 2026-10-02. Статус: **реализация и повторная полная offline-приёмка завершены**. Системный аудит и реализация трёх направлений выполнены с субагентами; основные находки перепроверены по исходникам и offline probes. Повторное ревью закрыло дополнительные continuation/admission/diagnostic/pinned-asset gaps; полный FLOW gate 1948/1948, EVAL 412/412 PASS. Этот документ дополняет 058–060, а не отменяет их отчёты приёмки. Итоговая проверка описана в [отчёте реализации](061-cp189-implementation-report.md); публикация и новые E2E не входят в эту задачу.

## 1. Цель и границы

Исправить flow/harness/tooling так, чтобы безопасный terminal overload продолжался в той же native Session, обычные shell-команды не превращались в lifecycle failures, а реальные ошибки сохранялись до EVAL report/Judge. Переработать тестовые контракты, которые позволили этим дефектам пройти прежнюю приёмку.

Продукт вручную не исправляем. Качество PLAN/реализации продукта — результат работы агента и предмет Judge/case acceptance; tooling обязан предоставить достаточные, достоверные evidence. Не ослабляем admission, exact identity, immutable inputs, effect uncertainty, Work/Stage/HITL boundaries и no-replay.

В этой задаче нет публикации engine, изменения установленных hooks, paid qualification, новых E2E или resume/restart исторических EVAL. Последующие delivery и полный scored цикл требуют отдельного запуска. Grok пока исключён из live работы; дата 2 октября сама по себе не доказывает снятие квоты. Общие Grok runtime paths проверяются offline.

Проверенные исходные точки:

| Репозиторий/назначение | Checkout | Commit |
| --- | --- | --- |
| FLOW implementation | `/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation` | `aa68575974aa53f4e741a1d122db2744aabebe59` |
| EVAL implementation/report | `/Users/deksden/Documents/_Projects/_worktrees/dd-eval-cp188-agy` | `41af387c6d1f975141e1669f3f08021be9443a2a` |
| CP189 frozen definition, не редактировать | `/Users/deksden/Documents/_Projects/_worktrees/dd-eval-cp189-three` | `12464d91e8ce77d8dc5aeb239d428ab4d51f5460` |
| CP189 release checkout, не смешивать с implementation | `/Users/deksden/Documents/_Projects/_worktrees/dd-flow-cp189-release` | `7bc8e8d17471c2cd33a93ca25e55770a4cb6e336` |
| Canon, доказанной необходимости изменения нет | `/Users/deksden/Documents/_Projects/dd-memorybank` | `2e57b987ec91b7c3b0fa97f6169047802a1233fb` |

CP189 использует pinned beta.124, artifact SHA-256 `59c3aec864602db0612c15fe3f69090c601b3724c62632dfb931d149a07cd568`. Изменение source не меняет runtime старого EVAL. В release checkout есть локальный untracked `test/cp189-installed-matrix.test.ts`: не удалять и не включать автоматически в коммит.

## 2. Факты последних трёх EVAL

Все три терминальны `completed_with_failures`; полного MERGE/case acceptance не достигли. Actual Stage установлен по RUN timeline/controller/artifacts, не по manifest entry-stage. Полные launch inputs — [CP189 receipt](../runbooks/cp-189-launch-receipt.md).

| Harness / EVAL | Home | Actual Stage / первичная причина |
| --- | --- | --- |
| ZCode / `EVAL-20261001144132-4c2043b1` | `/Users/deksden/.dd-eval/qualification/cp-189-zcode` | CODE-REVIEW: loop с динамическим `"$f"` без dd-flow ошибочно признан lifecycle participation; отказ сохранён как poisoned observer и выброшен после native completion |
| Luna / `EVAL-20261001144318-855a75c9` | `/Users/deksden/.dd-eval/qualification/cp-189-luna` | PLAN-REVIEW: terminal `serverOverloaded`; неверное pending для информационных items и отказ ждать живых детей; continuation не была отправлена |
| AGY / `EVAL-20261001144545-44d9b26b` | `/Users/deksden/.dd-eval/qualification/cp-189-agy` | CODE-REVIEW: настоящий terminal quota exhaustion, не overload и не повод автоматически повторять |

Evidence locators (относительно соответствующего EVAL):

- RUN: `executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject`.
- ZCode controller `DRV-885abdf4-de54-42a2-8538-a6026c81894c`, `session-6/adapter.events.jsonl`: native tool order 561 → observer failure 563 → completed tool 593 → completed `end_turn`; failure 17:22:33 UTC. Native Session `sess_f6ac73d6-e6b1-43c9-9f45-91fa9358e8eb`, adapter Session `e7e94dc2-cefb-42f2-a26f-a4a28e83c153`. Команда пыталась выполнить receipt JSON как executable, затем читала receipts; это странность агента, но **не dd-flow lifecycle command**.
- Luna controller `DRV-5f73ff69-8690-4b49-a55c-a399dccf8426`, `session-4/adapter.events.jsonl`. Root `01a0f817-c7a6-7482-b965-5d54f90d7d65`, failed Turn `01a0f82a-9eaf-7581-8544-cc37395edd66`, overload 15:58:35.198 UTC. `subAgentActivity` items уже имеют exact `item/completed` events, но snapshot не содержит `status`. Дети ещё active. В DB нет capacity successor operations; это **не исчерпание burst attempts**. Control stop создан после отказа gate, child interruptions — следствие этого stop.
- AGY controller `DRV-19d9a21e-eef8-4de3-ad6a-c95b1e38c908`, `session-6/adapter.events.jsonl`; native conversation `8139f48b-cafa-4bd6-ac04-0753bab33db5`. Terminal ERROR 16:18:41.330 UTC: `Individual quota reached ... Resets in 3h12m12s`. Строка stderr 429/retryable не переопределяет authoritative result. Расчётная дата reset: 19:30:53.330 UTC / 21:30:53.330 Europe/Kaliningrad, **оценка**, не проверка доступа. Из usage EVAL нельзя вывести область account quota.

## 3. Подтверждённые дефекты и охват

`live` означает подтверждение на CP189; `source/probe` — соседний подтверждённый контрактный дефект, не утверждение о его проявлении в этих EVAL.

| ID | Статус / дефект | Основные места | Исправление / пакет |
| --- | --- | --- | --- |
| R01 | live/source: native item taxonomy расходится; passive items считаются pending/effects; sibling gap — terminal interrupted tool тоже pending | FLOW `dd-codex.mjs:543`, `tool-observations.mjs:129` | Один существующий classifier + exact phase evidence, A |
| R02 | live: root overload при доказанно живых owned children превращается в fatal, без durable continuation intent | FLOW `codex-capacity.ts:181–214`; controller/external/MERGE/recovery callers | Отдельное owned-live wait, затем same-Session successor, B |
| R03 | source/probe: overloaded child + live sibling вызывает `failWork` до окончания ожидания | FLOW `run-controller.ts:662`, `controller-fanout.ts:76`, `vnext-fanout.ts:136` | Eligible overload исключить из преждевременного бизнес-failure, B |
| R04 | live/probe: `subAgentActivity(kind=interacted)` меняет parentage, вплоть до root↔child cycle | FLOW `dd-codex.mjs:240–265` | Parentage только из validated native creation/parent facts, A |
| R05 | source/probe: EVAL трактует idle как completed, отбрасывает foreign parent и не проверяет terminal/Turn conflicts | EVAL `runner.mjs:2431–2456` против FLOW `controller-fanout.ts:115–190` | Общая pinned native-child normalization, A |
| R06 | live + все ingress siblings: parser uncertainty без lifecycle leaf считается participation | FLOW `lifecycle-command.mjs:107–169`, `hooks.ts:586/1054`, `dd-zcode.mjs:776`; ingress/delivery | Разделить certainty и participation, C |
| R07 | source: ACP ZCode отбрасывает `work repair add` / `stage block`, хотя observer их передаёт, native hook принимает | FLOW `dd-zcode.mjs:777`, `hooks.ts:587/615` | ACP auxiliary parity без выдачи lifecycle capability, C |
| R08 | source/live mechanism: recoverable no-effect ACP refusal всё равно блокирует permissions и flush | FLOW `dd-zcode.mjs:237–245/318/421` | Qualified error disposition, C |
| R09 | source: Droid PreToolUse catch стирает доказанное no_effect, присваивая unknown/fatal | FLOW `dd-droid.mjs:420–428` | Сохранить доказанную pre-tool certainty; не обобщать post-tool, C |
| R10 | source asymmetry, не CP189 primary: literal execution route проверяется/связывается не во всех harness ingress | FLOW `hooks.ts:510/664/878/922`, `lifecycle-invocations.ts:1251` | Общий assigned-route contract, без выдуманного native cwd, C |
| R11 | live/source: потеря primary observation details и native completion на post-terminal observation/cleanup | FLOW ZCode/Codex/Grok; EVAL `callDriver:1278` | Native outcome отдельно от обязательного observation failure, D |
| R12 | live/source: quota identity/time не фиксируются; AGY pre-init/direct fallback классифицируют иначе | FLOW AGY daemon `325/386`, ACP/OpenCode error boundaries; EVAL `providerTurn:2386` | Typed terminal metadata/classification, D |
| R13 | source/probe: JSON/transport/recovery serializers теряют cause, false retryable, cleanup, runtime-error envelope | FLOW adapter/shared/CLI; EVAL callDriver/process-json/recovery | Bounded error round-trip, D |
| R14 | source/probe: Judge/report failure projection и material revision теряют decisive diagnostics | EVAL `executionEvidence:1828`, `failureEvidenceRevision:1697` | Compact stable diagnostic projection, D |
| R15 | source/probe: report с judgeError нарушает strict schema из-за undeclared judge_provider_limit | EVAL `buildReport:1942`, `schemas/report.v2.schema.json` | Producer/schema/error-case tests вместе, D |
| R16 | source/probe: FLOW/EVAL observation-loss code sets расходятся | обе `operation-errors.mjs`, EVAL awaiting/recovery paths | Одинаковая uncertainty semantics; no replay, D |
| R17 | source/probe: mandatory observation failure получает run_validity=valid и неопределённую attribution | EVAL `isInfrastructureFailure:2248`, `failureAttribution:1863`, `buildReport:1924` | Typed infrastructure attribution отдельно от observation-loss/retry eligibility, D |

Проверка R03 выполнена offline с реальными извлечёнными функциями и fake DB: результат `wait(native_children_unsettled)`, но уже произошёл `failWork`. R04 воспроизведён replay CP189 topology events. Основной агент отдельно вызвал реальные EVAL producer/normalizer/metadata/revision и Ajv: schema false (`judge_provider_limit`); idle→completed; quota identity/time null; изменение observation reason не меняет failure revision. При проверке готовности отдельный producer probe для `native_outcome_observation_failed` вернул `infrastructure:false`, `attribution:undetermined`, `run_validity:valid` — R17. Эти probes не запускают providers.

### Систематическая карта поиска

Аудит прошёл по всем классам входов и consumers, а не только по трём точкам failure:

- Parser и participation: `src/harness-runtime/lib/lifecycle-command.mjs`, `src/services/lifecycle-command.ts`, `hooks.ts`, `lifecycle-invocations.ts`, `codex-hook-delivery.ts`, `src/cli/hook-ingress.ts`, `native-hook-ingress.ts`, `run-cli.ts`, `dd-zcode.mjs`; ingress Codex/ZCode/Grok/AGY/OpenCode/Droid.
- Native facts и continuation: `dd-codex.mjs`, `tool-observations.mjs`, `codex-capacity-policy.mjs`, `codex-capacity.ts`, `controller-fanout.ts`, `vnext-fanout.ts`, `run-controller.ts`, `run-controller-state.ts`, `run-controller-recovery.ts`, `external-work-launch.ts`, `merge-server.ts`.
- Dispatch/settlement/owner: `daemon-operations.mjs`, `dd-codex-daemon.mjs`, `managed-daemon.mjs`, `session-settlement.mjs`, `runtime-budget.ts`; EVAL `runner.mjs`, `judge-capacity.mjs`, `capacity-policy.mjs`, `runner-events.mjs`, `eval-resume-worker.mjs`.
- Errors/metadata: все шесть runtime adapters и daemon counterparts, `harness-adapter.ts`, `src/shared/errors.ts`, `run-cli.ts`, `runtime-scope-stop.ts`, `run-control.ts`; EVAL `operation-errors.mjs`, `process-json.mjs`, `runner.mjs`, `judge-cleanup.mjs`, `case-acceptance.mjs`, schemas и error-case tests.
- Тесты, packaged asset copying, runtime-sensitive wrapper и существующий release CI. Не найдено основания добавлять другой parser, scheduler или отдельную БД.

Поиск reduced error records дал дополнительные mandatory boundaries в ZCode topology/cancel/close и CLI settlement/output. Их включить в D с явным disposition: primary/settlement proof — полный bounded record; best-effort usage — диагностический secondary, не новая primary failure. Краткая ошибка, специально синтезированная policy guard без native cause, сама по себе не дефект. Механическая замена всех `{code,message}` не нужна.

Это покрытие классов дефектов и их consumers, не обещание доказать отсутствие любых ошибок в каждом файле всех репозиториев.

## 4. Неизменяемые правила

1. Продолжение разрешает только exact terminal native `serverOverloaded` с Session/Turn/operation identity и willRetry=false/эквивалентным terminal proof. Generic retryable/message/429 не авторизуют successor.
2. Same native Session, исходная задача, короткое «продолжай», не повтор длинного initial prompt, не новая child wave.
3. Initial overload не считается отказом продолжения. Остановка: два различных ordinal-positive continuation отказа с failure timestamps на расстоянии **≤120000 ms**. Больше окна — не lifetime exhaustion. Повтор observe одного Turn не новый отказ.
4. Backoff 5 s, затем 15 s; authoritative Retry-After может увеличить ожидание. Failure timestamp и not-before фиксируются один раз. Waiting/restart не выдают новый owner deadline. Controller/recovery могут иметь explicit null deadline; не добавлять тайно общий двухминутный timeout.
5. Owned live child и unknown/contradictory evidence — разные состояния. Первое ждём; второе блокирует отправку. Нельзя освободить budget по истечению lease, по idle или по успешному parent followup.
6. Whole-tree fresh settlement — обязательная предпосылка нового root Turn. Нормальное ожидание не вызывает cancel/stop. User stop, ownership loss и реальные fatal boundaries сохраняют штатное drain/capture.
7. Work success требует принятого business receipt, а не `idle`/`settled_by_root`. Native settlement не заменяет Stage, checks или product acceptance.
8. Authority/scope/storage errors не превращаются в correctable syntax; post-tool unknown effect не превращается в no_effect. Native completed + observer failed не является правом повторить продуктивный Turn.
9. Historical evidence/PLAN/case не изменяем. При недостаточных legacy facts — observe/block, не догадка и не ручной migration ради dispatch.

## 5. Пакет A — единые native facts и topology

### A1. Item evidence

- Экспортировать classifier `tool/non_tool/unknown` из уже существующих sets в `tool-observations.mjs`; использовать в tool reducer и `turnItemEvidence`. Не создавать вторую whitelist.
- Для known non-tools отсутствующий status не означает pending/effects. Для genuine tools использовать признанный native terminal status (включая interrupted) либо exact `item/completed` с ключом Session + Turn + item ID.
- Retain фазу из native events в bridge/state там, где snapshot её не несёт. Snapshot с terminal status достаточен сам; phase receipt не должен переноситься на другой Turn или новое item с тем же ID. Дубликаты идемпотентны; stale started не отменяет proven completion текущего item.
- Unknown item/status, notLoaded snapshot, конфликт identity и незавершённый genuine tool остаются unproven. Terminal root Turn не доказывает завершение всех инструментов.
- Legacy без phase evidence разрешается свежим exact native read, если такой proof доступен; historical файлы не дописывать.

Порядок events тоже часть контракта: поздний `item/started`/completed старого Turn не меняет новый Turn; reused item ID в другом Turn не переносит terminal proof. При конфликте terminal snapshot с phase evidence блокировать, не брать «последний удобный» статус. Durable failure receipt сохраняет snapshot/evidence revision; повторный read может дополнить proof из исходного journal/current native read, но не перезаписывает прежний failure timestamp. Для restart phase facts восстанавливаются из owned journal/state, а не из произвольного файла. Ошибка записи обязательного phase proof блокирует dispatch, а не превращает pending в false.

### A2. Parentage

- Создавать edge только из validated spawn receipt / native explicit parent metadata с известным source schema. Recursive object с произвольными parent-looking полями не authority.
- `subAgentActivity` обновляет activity известного ребёнка; `interacted` не создаёт/reparents receiver. Если версия native API даёт ancestry только через creation activity, отдельно распознать именно creation shape и тестировать его provenance.
- Root parent неизменен; self-parent, root-as-descendant, cycle и conflicting trusted parent дают typed topology error. Не исправлять их тихим last-write-wins.
- Scoped cancellation обходится только trusted tree текущего owner; communication не расширяет scope на root/siblings/чужую Session. Visited set оставить как защита обхода, не как исправление повреждённого графа.

Не предполагать единственный root на весь bridge: retained Sessions могут иметь разные roots. Binding выполняется для соответствующего managed owner. Child event может прийти раньше spawn receipt: его activity/terminal facts сохраняются как ещё не связанные, без выдуманного edge; trusted creation/parent receipt позже связывает их по exact child/Turn identity. Communication receiver не становится ребёнком. Conflicting trusted binding — typed failure до native hook admission/cancellation.

### A3. FLOW/EVAL normalization

- Перенести pure native-child reducer из `controller-fanout.ts` в существующий bundled runtime слой, экспортировать через pinned engine asset. TS consumer и EVAL loader используют один reducer; адаптация типов/error wrapper тонкая, без второй интерпретации.
- Как у capacity policy: загрузка из проверенного engine artifact, без ambient latest/source fallback в production; exports/artifact hash проверяются явно.
- Сохранить parent mismatch, terminal/Turn conflicts, outcome_lost и separate settled_by_root. Не расширять native parent fallback за пределы реально scoped provider receipt.
- EVAL capacity probe может считать наблюдённые started children, но не называть idle success. Strict no-children квалификация/Judge там, где fanout не разрешён, остаётся strict: root-wait не выдаёт этим владельцам право на детей.

### A4. Конкретная загрузка и совместимость

- Pure reducer разместить в `src/harness-runtime/lib/native-children.mjs` с соответствующим `.d.mts`; экспорт `normalizeNativeChildren(receipt, rootSessionId)` и явный native-child contract version. FLOW `controllerNativeChildren` остаётся тонким TS facade, сохраняя typed error code/details при преобразовании в AppError.
- EVAL расширяет существующий verified-engine loader в `lib/capacity-policy.mjs` фиксированной загрузкой native child/error exports. Проверку artifact и imports выполнять один раз на bound runtime owner, не на каждом poll; не строить registry плагинов.
- Общие native contracts грузятся для **всех** harness profiles из supplied runtimeRoot. Сейчас loadCapacityPolicy вызывается только для Codex: использовать этот условный вызов для нового normalizer означало бы оставить AGY/ZCode на старом reducer. Codex-specific burst policy по-прежнему только для Codex.
- Производственные consumers `directNativeChildren` получают bound normalizer явно. `capacityCodexChildren` остаётся extractor rollout facts, но передаёт их тому же reducer; не сохранять там второй outcome interpreter. Latest task lifecycle/Turn identity проверять, duplicate session files/foreign metadata/conflicting terminal facts не сводить к `completed` только из-за одного старого task_complete. Accepted child count и success count — разные метрики.
- Новый обязательный contract не нужен, чтобы просто показать raw retained legacy receipt/status. Чтение старых EVAL остаётся read-only и доступным; missing contract запрещает новый productive dispatch/qualification с этим engine, а не уничтожает historical report. Старый sealed report не пересчитывать новым reducer. Production fallback на source/ambient latest запрещён.
- Capacity policy `codex-overload-burst@1` не менять ради unrelated normalization exports. Новые native contract exports проверяются отдельно. `.d.mts`, copy-assets, module import из installed snapshot и missing/wrong version должны иметь tests.

## 6. Пакет B — durable continuation и ожидание детей

### B1. Общий readiness discriminator

В `codex-capacity.ts` ввести узкое различие: `ready`, `owned_children_live`, `unproven/blocked`. Проверять exact failed predecessor/Turn/items/owner/root/tree. `settled=false` без доказанной owned live topology не означает wait. Конфликт «root settled=true, child unsettled» остаётся блокирующим.

Для owned_children_live:

- Retain исходный refusal и bound successor intent **до** ожидания; использовать существующие operation/controller ledgers, не новый scheduler.
- Сохранить root operation ID в durable state; re-entry controller с обычным random prompt ID не начинает другую capacity chain.
- Poll свежего root/tree inspect; использовать существующие cancellable delay/RPC budgets. На каждом шаге и перед dispatch: owner/generation/lease, signal, Work/Stage/HITL boundary, исходный deadline. Никаких активных SQLite writer transactions во время native calls/delay.
- Если business boundary уже completed/paused — reconcile без prompt. Не считать всякий fanout `wait` reconciliation_blocked: qualified capacity/work-receipt ожидание отличать от отсутствующей authority.
- После settlement повторно reconcile predecessor ledger/budget; только затем permit + повторная current/boundary check + один dispatch exact successor.
- Child timeout/lost/foreign parent/unknown tool effect — typed blocked/failure, не бессрочное оптимистичное ожидание.

Root/child waiting не монополизирует SQLite writer или productive permit: отказ predecessor сохраняется terminal native outcome, но его reservation удерживается до свежего settlement. Observation использует штатные observation lanes/RPC budgets; successor permit берётся только после release. Если owner deadline null, не вводить скрытый lifetime timeout: штатная native liveness/owner loss остаётся authority, sampling прежнего `active` не доказывает вечную жизнь. Inspection timeout — observation loss того же operation, не новый provider отказ и не автоматическая отправка.

### B2. Restart/no-replay

Проверять exact prepared/dispatched successor operation перед любой отправкой:

| Retained факт | Действие |
| --- | --- |
| prepared intent, operation_not_found доказан | Допустима единственная отправка того же ID/prompt hash/Session/not-before/deadline после readiness |
| operation running / reply lost / unknown delivery | Только observe/reconcile того же operation, не новый successor |
| terminal success | Вернуть cached outcome после owner/business reconciliation; без новой отправки |
| terminal exact overload | Новый distinct ordinal по исходной chain; stable refusal timestamp |
| mismatch/conflict/legacy incomplete | Typed block; не reset цепочки |

Сохранить existing prepared-intent hashes/versioning и policy identity. Legacy отсутствующие факты не дорисовывать. `operation_not_found` достаточен только от exact retained daemon/state-dir с matching owner/generation/engine, не от нового пустого daemon home.

Нормальный wait helper обслуживает внутри ожидания; не возвращать fake successful Receipt, чтобы controller не продвинул Stage. Confirmed running successor наблюдается до terminal/boundary на том же operation. При потерянном inspect/reply наружу передавать typed observation-loss с исходным overload как secondary, а не повторно бросать predecessor overload: иначе caller ошибочно вызовет fatal stop уже отправленного successor. Для unproven authority/effect — typed blocked с сохранением native uncertainty; никакого force cancel как способа «доказать» неизвестный outcome. Controller/EVAL projection и cleanup используют штатные uncertainty/owner rules. Это проверять через real caller path, не только mock prompt count.

### B2a. Атомарное удержание и точки crash

Controller State получает optional `pending_capacity` reference с root/predecessor/successor IDs, native Session, owner generation и prompt kind (`stage`, `child`, `hitl`), когда подготовлен successor. Refusal/intent payload остаётся в existing operation receipt, не второй копии state. Для recovery ACK reference принадлежит существующему runtime_dispatch binding; external/MERGE — existing adapter_receipt capacity_intents. Полного новых SQL tables не требуется.

- В одном коротком writer transaction сохранить frozen refusal, intent, owner resume reference и event. SQL CAS проверяет owner token/generation/status и ровно одну обновлённую запись. Native inspection и filesystem/native calls выполняются вне transaction. Сбой между observation и commit → никакой отправки; после commit → re-entry на тот же reference, не random root.
- Refusal может существовать без prepared successor, например burst stop: это normal terminal chain, не разрешение придумать новый intent. Refusal+intent без owner reference — legacy/incomplete evidence: восстановить ссылку только по единственной совпадающей durable owner operation; иначе block, не выбирать newest по времени.
- Intent пометить dispatched в owned ledger до/при штатном daemon admission, а native operation/result остаётся dispatch authority. После ambiguous reply observation прежде successor. Cached completion очищает pending reference только после принятого business/owner reconciliation; не очищать до записи receipt.
- Tests останавливают fake owner после native refusal, после atomic prepare, во время wait, после admission до reply, после native completion до controller receipt. Во всех случаях restart сохраняет Session/operation/not-before/refusal time и не повторяет lifecycle effects. Concurrent stale owner не может записать состояние или отправить тот же intent.

### B3. Mixed child outcomes

- До generic `reconcileVnextFanout` распознавать narrowly eligible terminal overload direct child. Пока live sibling работает, retaining child link/Work остаётся running; не писать failed result receipt.
- После settlement продолжать exact ребёнка через штатный parent `followup_task`, с accepted native linkage; successful parent delivery не равен child success.
- Поддержать несколько eligible children без serial child waves/respawn. Burst state отдельный для исходной child задачи; parent overload не удваивает child refusal.
- Обычный non-overload child failure по-прежнему failWork. Не «разфейливать» уже terminal historical Work; исправление предотвращает преждевременный переход новых запусков.

Suppression generic failWork применяется только после exact eligibility и unique direct-child Work binding (ноль связей допустимо лишь для уже разрешённой немаппированной native задачи, не для обязательного Work). Multi-parent/multi-Work/conflicting Turn/unknown tool effect не подпадают под неё. При burst/non-overload failure вернуть ребёнка в штатный owning failure path. Все overload refusals различных детей считаются раздельно; за один проход выбирается один prepared followup, остальные не теряются. Это не новая wave: IDs существующих children и Work неизменны.

Child refusal сохранять в существующем `child_capacity[sessionId]` при первом exact observation, до ожидания sibling; иначе delayed reconciliation присвоит отказу новое время и исказит burst. Child followup intent и его causal root Operation ID удерживаются один раз, но отправка родительского Turn запрещена до readiness. Если Work завершился/отменён или Stage/HITL boundary сменился во время wait, business reconciliation выигрывает: followup не отправляется. Доказанный provider_overload_burst является terminal boundary и может вызвать штатный scoped stop; правило «не отменять здоровых детей» относится к normal wait, не отключает terminal shutdown.

### B4. Все владельцы

Проверить controller, recovery ACK, external read-only Work, MERGE executor и EVAL Judge/probe. Общие readiness/identity правила — shared helper/pinned contract, owner-specific boundary callbacks остаются локальными. Judge/probe unexpected children остаются нарушением их контракта, не normal wait. Сохранять исходные external/MERGE 45-minute deadlines; для остальных — существующее значение, включая null.

## 7. Пакет C — lifecycle participation, correction и cwd

### C1. Participation отдельно от certainty

- Shared parser результат отдельно сообщает known lifecycle/auxiliary leaf и certainty/supportability. `unresolved` сам по себе не участие. Не переименовывать неопределённое участие в «доказанно безопасная команда».
- CP189 receipt loop, обычный dynamic executable, unrelated eval, dynamic shell payload и malformed ordinary shell не создают lifecycle receipt, rewrite или Session failure только из-за неопределённости parser.
- Для statically обнаруженного lifecycle leaf в unsupported composition сохранить refusal. `eval 'dd-flow …'`, repeated/background/substitution/multiple leaves и malformed actual lifecycle — negative cases; не делать текстовый substring scanner. Quoted data/comments/heredocs не executable authority.
- Динамически скрытая настоящая dd-flow команда не получает receipt от ignored observer; достигший CLI требует exact issued assignment, committed native receipt, scope/current CAS. Проверить это отдельным end-to-end offline CLI тестом.
- Обновить все consumers из §3 вместе: shared lifecycleFacts, native/ACP ZCode, ingress, Codex delivery и CLI diagnostic handling. Не ограничиваться одним ACP catch.

### C1a. Parser contract и опасность упрощённого fix

Текущий parser одинаково возвращает `kind:none/unresolved` для `eval 'echo ready'` и `eval 'dd-flow work start WRK-001'`; аналогично для malformed echo и malformed dd-flow. Это подтверждено offline parse. Поэтому просто убрать все unresolved refusals нельзя — потеряется разграничение известных unsupported lifecycle forms.

Добавить отдельное participation поле (`none`, `lifecycle`, `auxiliary`, `unproven`) к existing result, оставив supported/reason и existing complete invocation shape. Partial/malformed recognized executable не получает invocation/argv/route authority: это только отказ, никогда receipt/rewriting. Все consumers читают shared participation, а не вычисляют его снова.

- При recovered AST разрешено распознать статический executable в syntactic command position, но нельзя «достроить» malformed arguments. ERROR nodes/data/comments/heredocs не дают execution facts. Если command position не доказана — unproven, без minted authority.
- Статический literal eval payload анализировать existing parser только для recognition и помечать unsupported; не выполнять eval, не разрешать его admission и не интерпретировать динамические многошаговые expansion. Dynamic payload → unproven; достигший actual dd-flow CLI по-прежнему требует receipt.
- Auxiliary detection входит в тот же shared classification и поддерживает реальные разрешённые compound/static wrapper формы с теми же exactly-one/route правилами. Legacy continuationCommand становится facade, не второй самостоятельный shell parser. Auxiliary receipt остаётся без lifecycle capability.
- Корпус размечает ожидаемые participation, supportability, rewriteability **и ingress outcome**, включая input limits, Bash-compatible zsh, malformed code и quoted данные. Parser успешно импортирован — не evidence правильной Session disposition.

### C2. Auxiliary и qualified correction

- ACP `stage block` и `work repair add` принять через existing auxiliary native receipt/scope path, как native ZCode hook; не создавать ordinary issued lifecycle capability. Guard parsed.invocation при kind=none.
- Разделить retained correctable refusal и fatal notificationError в AcpBridge. Только доказанный qualified prepare/no_effect/recoverable отказ допускает последующий исправленный вызов/permission/clean flush. Сам отказ остаётся durable evidence, не successful invocation.
- Unknown/committed effects, identity/authority/storage/timeout/profile failures остаются blocking. Не blanket swallow/clear notificationError. Stale observer callback не меняет новый active session disposition.
- Droid сохраняет proven native PreToolUse no_effect/recoverable record; post-tool/timeout остаются unknown. Correction разрешать лишь при native pre-tool refusal contract, не обещать AGY same-Turn поведение без platform proof. Минимальный fallback — точный scoped отказ без ложного unknown effect; права на replay не появляются.

Qualified correction требует trusted observer/native callback текущего Session/tool/operation, typed `lifecycle_shell_syntax_invalid`, `phase=prepare`, `effect=no_effect`, `recoverable=true`, `disposition=pre_cli_shell_refusal` и durable refusal locator. Одних произвольных error.details или model text недостаточно. Для ACP асинхронного события no_effect доказывает CLI admission barrier, не само предположение «tool ещё не запустился»; без этой связки refusal remains blocking. Failure сохранения correction/refusal тоже blocking.

`no_effect` относится к lifecycle mutation, **не ко всему compound Bash**: prefix мог уже записать файл. Исправленный вызов использует issued standalone successor, не повторяет prefix/старую shell-команду. Повтор одного notification идемпотентен; fatal другого tool/Session не очищается. Сохранять AGY существующий one-correction-per-Turn guard. Для Droid existing API возвращает continue=false/stopReason при отказе; planned fix сохраняет доказанный no_effect и различает scoped refusal/fatal Session, но не обещает productive same-Turn correction без native fixture proof.

### C3. Общий execution-route contract

Подтверждена code asymmetry, не доказан cwd failure CP189. Использовать уже существующую resolution logic `controlledLifecycleCwd` как общий assigned workspace resolver для participating commands всех ingress. Не создавать новый cwd policy engine.

- Различать launch cwd, observed tool cwd, literal shell cd intent и actual CLI process cwd. ACP без native cwd остаётся с null provenance, не выдуманным project root.
- Known static shell route сверять с assigned workspace и связывать через typed `executionCwd`; reached CLI перед CAS подтверждает actual cwd. Не ограничиваться выводом пути в display text.
- Если route отсутствует и native observed cwd доступен — проверить его по applicable operation scope. Если native cwd недоступен — не запрещать все ZCode команды: existing trusted assignment + actual CLI confirmation даёт проверяемый physical route.
- Сохранить особые реальные scopes: bootstrap/SPECIFY/PROTOCOLIZE root coordinator, feature Work, isolated reviewer snapshot, MERGE target; диагностические read-only команды без fixed workspace не получают лишнюю строгость.
- Regression сначала покажет missing bound-route confirmation для Codex/ZCode; затем добавит общий helper. Dual native+ACP receipts сохраняют первый immutable admission, второй только corroboration. Short public call без unique issued RUN не получает guessed workspace.

В `controlledLifecycleCwd` уже есть special review_copy lookup по work_launches и provider_session_id — его сохранять, а не заменять general feature root. Bind route из authoritative scope до CAS; не доверять `--project-root` как доказательству physical cwd. Canonical/symlink-equivalent cwd допускается existing canonicalPath; unrelated/foreign directory и escape отвергаются. Missing/ambiguous assigned route даёт typed error, не default cwd. Native+ACP race с/без observed cwd подтверждает один bound route, не создаёт второй receipt или несовместимый identity tuple.

## 8. Пакет D — errors, quota, reports/Judge

### D1. Post-terminal outcome и primary/secondary

- ZCode post-turn errors 933/945/957 и mandatory topology/cancel/close boundaries сохраняют existing full errorRecord, reason/violations/source locator, native identity и outcome.
- Codex/Grok mandatory observation после native success сохраняет исходный completed receipt отдельно от observation/profile/lifecycle failure. Не возвращать settlement=true или считать profile failure успехом.
- Grok close/finally не заменяет primary; cleanup_error — secondary. Использовать существующие patterns Droid/OpenCode/daemon-operations, не новую exception hierarchy.
- EVAL model progress failure до dispatch — effect no_effect с cause; после receipt — completed native result + observation failure, без повторной отправки. Не сохранять success в качестве business acceptance.

### D2. Frozen provider metadata

- AGY terminal event ingestion фиксирует observed_at один раз, exact conversation/root, operation/Turn generation и journal locator. Классификация quota/account/rate/unknown/cancel одна для pre-init, daemon terminal, standalone/direct envelope и EVAL fallback.
- Quota-first precedence сохранить, unknown429 не делать transient; stderr retryable не сильнее native ERROR. Repeated conversation error не создаёт fresh refusal/reset; pre-init без native Session честно содержит null identity.
- Из `Resets in 3h12m12s` строить только явно estimated reset на основе frozen terminal observation: duration 11532 s. Retain basis/source и estimated flag; это не authoritative native timestamp. Не считать от now/status/retry.
- Duration parser узкий под подтверждённый native format; invalid/ambiguous/negative/overflow остаётся unknown. Native Codex resets_at сохраняет свою authoritative provenance; Retry-After отдельное поле. Не выводить quota scope из EVAL token counts.
- ACP ZCode/Grok и OpenCode typed provider error boundaries тоже retain frozen identity/time/native source, когда их API даёт эти факты; отсутствие reset evidence → null, без придумывания.
- Provider quota/auth terminal, automatic same-Session capacity continuation только для разрешённого Codex overload.

### D3. Transport/recovery

- Bounded serializers сохраняют code/message/details, явные true **и false** retryable, cause и cleanup secondary; ограничение depth, cycle handling и JSON-safe значения. Проверить TS shared, MJS shared, harness-adapter, CLI settlement/output, daemon ledger и EVAL recovery failure construction.
- В частности, `run-controller-state.ts:errorRecord` сейчас сохраняет typed code/details только для AppError. Новые pure MJS errors не должны превращаться в controller_failed: facade и controller serializer сохраняют структурированный code/retryable/cause. Подтвердить round-trip через last_error_json и controllerReceipt, не только прямой helper test.
- Не обходить произвольные observation_error/cleanup_error при поиске provider primary. Classifier traverses только deliberate cause/primary links.
- EVAL callDriver использует existing process-json extraction для pretty JSON/JSONL terminal error; successful exit с typed `ok:false` тоже failure. Product verdict `passed:false` без runtime error не превращать в infrastructure error.
- Supplemental Judge terminal failure durable event получает тот же full diagnostic record; не replay paid operation. Новый supplemental report формат не требуется ради этого исправления.
- Общий observation-loss contract берётся из pinned existing runtime error asset, с offline parity для EVAL preselection paths. Native timeout/unknown/dead/pipe/bridge loss допускают observation того же operation, не новый prompt. `native_outcome_observation_failed` не добавлять автоматически в uncertainty: native completion уже известен, observation failure может быть conclusive.

Bound error contract передавать явно в per-owner callbacks/operation context после загрузки runtime; не заменять process-global predicate последним загруженным engine, поскольку рядом могут работать EVAL с разными pinned версиями. Sync serializer/classifier не выполняет async dynamic import. До появления runtime остаётся небольшой conservative bootstrap predicate с обязательным parity test; он не разрешает productive replay. Отсутствие bound contract на productive path — typed unsupported/block, legacy raw read/status остаётся доступным.

### D4. Report/Judge и material revision

- executionEvidence содержит один компактный structured failure diagnostic: primary record, native_outcome, observation_error, immutable source locator/Session/Turn. Не копировать journal/transcript целиком, не раскрывать credentials.
- failureEvidenceRevision использует тот же stable projection: material reason/locator/native outcome меняет revision; volatile polls/sampling times — нет. Frozen provider observed_at считается material identity, не обновляется при чтении.
- Согласовать report producer со strict schema: объявить judge_provider_limit (object/null с проверяемыми полями), диагностический projection и estimated reset semantics там, где нужна schema. Success/error/cleanup/unknown cases обязательны. Не снять additionalProperties:false.
- Judge получает различие native success vs tooling observation failure и product defect; failure attribution не подменяет semantic verdict. Historical sealed candidates/reports не пересобирать ради новой схемы; version/optional backward compatibility проверять на fixtures.

### D5. Точная attribution и JSON compatibility

- R17: typed mandatory `native_outcome_observation_failed`, `model_observation_storage_failed` и подтверждённые adapter observation/profile/storage failures classified как tooling/infrastructure. `isInfrastructureFailure`, failureAttribution, report run_validity и configured stop-on-infrastructure policy согласуются; не вся неизвестная ошибка и не business check failure становится infrastructure.
- Infrastructure classification отдельно от isObservationLoss и capacity eligibility. `native_outcome_observation_failed` не разрешает reattach/resend продуктивного Turn лишь потому, что tooling виноват. Native completed и observer failure остаются видимыми одновременно; provider-like слова в secondary cleanup не меняют primary.
- Новый failure diagnostic добавляется optional в report/evidence schema; existing required fields/schema IDs сохраняются, пока old fixtures успешно читаются. Stable revision использует canonical projection с явными null/absent rules; один и тот же JSON после read/serialization имеет тот же hash. Raw Error, volatile stack, polling time и unbounded details не входят в hash.
- Serializer depth bound действует и на cause/cleanup, и на переносимые details: circular/non-JSON/oversize диагностические данные маркируются truncated/unavailable без замены primary или создания throw при публикации отчёта. Не обрезать exact native identity/typed eligibility proof. Judge projection выбирает ограниченные reason/violations/identity/outcome/locators; raw transcript/env/token/authorization headers не включать.
- Provider metadata схема допускает unknown/null identity и reset; estimated reset явно отделён от native-authoritative. Валидировать источник/basis и сброс не раньше frozen observation. Unknown/legacy без observed_at остаётся unknown — не now() fallback. Machine JSON и human report показывают stop reason, Session/Stage и reset basis одинаково.

## 9. Пакет E — исправление тестов, а не только добавление зелёных примеров

### E1. Red–green proof и корректировка fixture contracts

Каждая R01–R17 должна иметь runnable failing regression на старом соответствующем пути, затем PASS после fix. Source/probe proof служит обоснованием, но не заменяет оставшийся в репозитории regression test. Данные — минимальные sanitized фрагменты CP189 events с сохранением native shapes/order/IDs; не весь приватный journal. Сохранять что fixture fake, не выдавать его за live qualification.

Изменить слишком слабые assertions: полный diagnostic record вместо только code; no duplicate Turn/Work/cancel вместо только конечного текста; actual producer+schema вместо hand-written success object. Snapshot update сам по себе не приёмка.

Не переворачивать существующие tests с contradictory root/child settlement или голым settled=false: они по-прежнему unproven. Добавить **реалистичную** owned-live topology и ожидаемую последовательность wait→fresh settle→dispatch. Historical corpus scan 127 unresolved не является manually reviewed oracle: обозначить новые ожидаемые ingress outcomes для каждой sanitized команды, не переписать цифры исторического отчёта.

### E2. Конкретная матрица regressions

| Группа | Сценарии / обязательные assertions | Existing tests для расширения |
| --- | --- | --- |
| Native items/topology | passive taxonomy; interrupted genuine tool; completed phase без status; stale другой Turn; unknown item; child→root interaction; foreign receiver; trusted-parent conflict/cycle; bounded cancellation | FLOW `test/fixtures/codex-adapter.mjs`, `test/fixtures/tool-observations.mjs`, `test/vnext-fanout-storage.test.ts` |
| Root continuation | реальный failed root overload + два live child; ни одного cancel; stable intent/time; после settlement тот же root Session, один successor; ongoing second wave запрещена | FLOW `test/codex-capacity.test.ts`, `test/run-controller-stages.test.ts`, `test/fixtures/controller-stage-adapter.mjs` |
| Mixed children | один exact overloaded failed child + live sibling: wait, Work/link running, no failed receipt; затем same child followup; ordinary failure всё ещё failWork | FLOW `test/vnext-fanout-storage.test.ts`, `test/vnext-fanout-reconcile.test.ts`, controller fixture |
| Все owner paths | completion/HITL/user-stop/lease/generation/deadline во время wait и после permit; restart prepared/running/unknown/cached success; не обновлять Retry-After | FLOW `test/external-work-launch.test.ts`, `test/merge-server.test.ts`, `test/run-controller.test.ts`, `test/run-controller-adapter.test.ts`, capacity tests; EVAL `test/judge-capacity.test.mjs`, `test/eval.test.mjs` |
| Burst safety | distinct refusals; duplicate observe; ровно 120000/120001; initial ordinal0; quota/auth/no typed proof; stable times после restart | existing FLOW/EVAL capacity policy и transcript tests; не менять правильный policy@1 алгоритм |
| Participation | CP189 loop, dynamic unrelated/eval/payload/malformed ordinary; quoted dd-flow data; known unsupported lifecycle; скрытый actual dd-flow denied by CLI без receipt; все шесть ingress | FLOW `test/hooks-shell.test.ts`, `test/native-hook-ingress.test.ts`, `test/zcode-invocation-observer.test.ts`, `test/lifecycle-invocations.test.ts` |
| Auxiliary/correction/cwd | native и ACP stage block/work repair; no minted capability; correctable no_effect→следующий permission/correct command/clean flush; fatal preserved; cwd shell intent vs CLI physical route; bootstrap/feature/reviewer/MERGE | existing ingress/lifecycle/hooks tests, `test/fixtures/zcode-adapter.mjs`, Droid/AGY fixtures |
| Outcome/transport | native end_turn success + lifecycle/profile/storage observation fail; native receipt/full reason retained, settled unproven, no resend; primary+cleanup; JSONL error/exit0 ok:false/false retryable/cause round-trip | FLOW `test/harness-adapter.test.ts`, adapter/daemon fixtures; EVAL `test/process-json.test.mjs`, `test/runner-recovery.test.mjs`, driver fixtures |
| Quota | AGY exact terminal quota против stderr429; frozen identity/time, reset +11532s; advance clock/read/restart неизменны; pre-init null identity/repeated error/invalid duration/cancel; all adapter known-rate vs ambiguous429 | AGY/ZCode/Grok/OpenCode fixtures; EVAL `test/eval.test.mjs`, operation error tests within existing suite |
| Projection/schema/parity | actual report success, subject failure, Judge quota/error+secondary cleanup; schema strict; revision material vs polls; FLOW/EVAL unknown-code parity; idle≠success, foreign/conflicting child | EVAL `test/evidence-schema.test.mjs`, `test/eval.test.mjs`, `test/capacity-policy.test.mjs`, existing error/recovery tests |
| Readiness additions | atomic prepare/crash/re-entry; late phase/spawn events; multiple roots; all-harness pinned imports; legacy raw read; wrong version/exports/hash; recoverable fake-details rejection; explicit infrastructure validity R17 | FLOW `test/run-controller-state.test.ts`, `test/run-controller-adapter.test.ts`, `test/codex-capacity.test.ts`, native fixtures; EVAL `test/capacity-policy.test.mjs`, `test/eval.test.mjs`, `test/evidence-schema.test.mjs` |

Указанные suites существуют в исходных checkout; для recovery ACK использовать owner fixtures в `test/run-controller.test.ts` и adapter ledger fixtures в `test/run-controller-adapter.test.ts`. Новые сценарии добавлять в этих владельцев, без нового test framework. Основной acceptance checklist ниже привязан к контрактам, не только к названию теста.

### E3. Offline integration и packaged proof

- Genuine fake native streams + real adapter bridge + durable daemon ledger + real controller/CLI: нельзя только вручную выставить pending=false в mock и считать R01/R02 проверенными.
- Минимальный full-cycle offline controller fixture проходит stage transitions, delegation/review, repair/check/final gate и MERGE на test project. Не использовать продукт EVAL как ручной fix; уже реализованные 058–060 acceptance/verification guards сохранить.
- Fresh installed engine snapshot запускается без доступа к source tree: проверить copied classifier/normalizer/error asset, export identities и совпадение байтов/hash. TS tests против source не доказывают bundled runtime.
- Fake clocks/controlled event sequences вместо реальных 120-second sleeps. Cleanup каждого временного test owner проверяем; соседняя Session/EVAL не затрагивается. Не расширять глобальные test timeouts, не превращать зависания в silent skip.
- Для критичных regressions один контроль удаления/отключения конкретного нового guard должен снова уронить соответствующий test; без нового mutation-testing framework.

Проверять существующий seven-stage fixture в `test/run-controller-stages.test.ts`, а не создавать второй full-cycle simulator. Он уже покрывает native Work/server MERGE и harness routes; добавить narrowly scoped faults на нужных стадиях. Source full-cycle fake доказывает orchestration, но не поведение модели или продуктовую case acceptance. Boundary smoke через real CLI/native-shaped fake должна включать отдельный ZCode ACP observer и AGY error stream, которые общий controller fixture не заменяет.

Missing-env gates считать FAIL readiness соответствующего required contract, не successful skipped suite. По R01–R17 вести явную карту test name → old failure → new PASS → suite/built artifact. Для R09 correction proof и R10 actual route proof отрицательные тесты обязательны: непроверенный native shape не объявлять supported. Старый `.toEqual` ожидаемый shape корректировать только вслед за явно изменённым API, не скрывать semantic regression.

## 10. Очерёдность и gates реализации

1. Зафиксировать sanitized CP189 replay inputs и failing tests (A/C/D) на исходных commits; записать failures, а не заменять expectations заранее.
2. A: facts/topology/shared normalization; затем B: root/child waits и durable chain. Проверить native admission/budget guards без ослабления.
3. C: participation → all consumers → auxiliary → scoped correctable disposition → assigned cwd parity.
4. D: исходный full error/terminal metadata → transport/recovery → evidence/report/schema/revisions.
5. E: real offline integration, existing mandatory suites и installed candidate proof. Проверить cross-repo contracts в одном recorded build, затем minimal operator docs.
6. Итоговое ревью implementation diff по R01–R17 и §11; commits по логическим изменениям. Publication/new E2E — отдельный этап, не считать их выполненными source tests.

FLOW gates (в implementation checkout):

```sh
pnpm typecheck
pnpm lint
DD_MEMORYBANK=/Users/deksden/Documents/_Projects/dd-memorybank DD_FLOW_BUILD_STRICT_CANON=1 pnpm build
pnpm test:integration
pnpm test:runtime-sensitive
pnpm test:release
```

Перед применением сверить scripts с package.json выбранного commit; не подменять полный suite выборочным зелёным файлом. `test:integration` исключает runtime-sensitive/release tests: два последних gates обязательны отдельно. Existing `test/native-adapter-contracts.test.ts` запускает native Node fixtures; прямой node replay не заменяет wrapper. Не запускать build одновременно с читающими dist тестами.

EVAL полный gate с offline CLI fixture, а **не реальным Codex native adapter**:

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation \
DD_EVAL_TEST_FLOW_CLI=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation/dist/cli.js \
DD_EVAL_TEST_FLOW_ADAPTER=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation/test/fixtures/controller-stage-adapter.mjs \
node --test --test-concurrency=1
```

Отдельный installed-asset test читает dist, восстанавливает temporary snapshot и исполняет оттуда; cross-repo source parity сама по себе недостаточна. Новые normalization/observation contracts добавить к этой existing binding схеме. В acceptance report фиксировать commits, canon version, package checksum, команды, test counts, skips/failures. Required checks без env часто SKIP — это **unverified**, не PASS.

В существующем FLOW release workflow использовать уже имеющиеся integration/runtime-sensitive/release jobs; не новый CI сервис. EVAL локальный node suite не выдавать за отсутствующий EVAL workflow. Если full suite завис — диагностировать owned test worker/cleanup, фиксировать незавершённый gate, не обещать completed по частичному выводу.

### Deliverables и граница последующей доставки

- FLOW: shared native contracts + TS facades, durable wait/reconciliation, all-ingress participation/correction/route fixes, error boundaries, existing suite regressions и copied assets. EVAL: explicit bound loaders/consumers, full diagnostics/classification/projection/recovery/schema, offline contracts и updated source diagnostics.
- Документация: implementation report с R01–R17/test mapping и commits; обновить `runbooks/e2e-monitoring.md` о owned-child wait, quota estimate и native success/observation failure. В `runbooks/update-harnesses.md` отметить новые mandatory native exports, qualification-cache binding к exact package checksum и обязательный refresh installed hooks **при последующей delivery**, не выполнять её сейчас.
- До первого fix: проверить base HEAD/dirty files и отсутствие пересекающегося live mutation. Working copy созданного плана/link 060 сохранить; frozen CP189 definition, historical artifacts, product baseline и текущие профили не менять. Если HEAD изменился — новый audit receipt для affected diff, не тихое применение к иной версии.
- Законченная source implementation не означает готовность старых installed engine или успешный новый E2E. При последующей delivery создать exact candidate, квалифицировать current harness/available credentials, проверить hooks на pinned runtime и только затем новые homes/EVAL. Judge остаётся `gpt-6.1-sol/high`, AGY `gemini-3.8-flash-high`, Luna `gpt-6-luna/xhigh`, ZCode current qualified binary/profile. Grok не возвращается в live scope только по календарю.
- Коммиты — отдельные понятные FLOW/EVAL commits после gates; user changes не включать автоматически. Push/publication выполнять по актуальной авторизации. Никакого hidden new E2E в offline test gate.

## 11. Definition of done / проверка готовности

- [x] Каждая R01–R17 имеет implementation diff и сохраняемый runnable regression; source-only risk не назван фактическим CP189 failure.
- [x] Eligible root/child overload при normal wait не отменяет healthy siblings; fresh settlement/budget precedes exact successor; no duplicate effects/Session/Work/child wave. Burst/fatal/user-stop всё ещё выполняет штатный scoped shutdown.
- [x] Все owner paths покрыты; restart/unknown dispatch/HITL/stop/deadline/lease тестированы. Existing burst policy boundary unchanged.
- [x] Все ingress одинаково решают participation; unsupported known lifecycle fail-closed; concealed CLI cannot bypass admission.
- [x] Recoverable no_effect не poisons Session; unknown/authority/storage/profile остаются blocking. Native-specific timing/permission distinctions сохранены.
- [x] Cwd route provenance разделена и actual CLI подтверждён там, где fixed scope необходим; нет новых бессмысленных cwd требований для unrelated diagnostics.
- [x] Native outcomes, primary reason/cause/false retryable/cleanup сохраняются через CLI/ledger/EVAL/recovery/report/Judge; optional telemetry не становится fatal.
- [x] Quota reset frozen/estimated/native/unknown корректно различены; read/restart не меняет дату и не делает dispatch.
- [x] Все actual producer error reports проходят strict schemas; stable diagnostic revisions меняются только от material facts.
- [x] Pinned shared modules не расходятся с TS/EVAL; no source/ambient fallback в production, no required SKIP в приёмке.
- [x] Full FLOW + EVAL gates и installed-snapshot proof PASS; release qualification ещё не заявлена выполненной.
- [x] Historical EVAL/case/product unchanged; отдельный implementation report содержит точные commits и доказательства, а не обещание будущего scored PASS.
- [x] Atomic prepare/owner resume reference, all-harness pinned loading, late native event binding и legacy read-only compatibility проверены. Mandatory observation failure не публикуется как run_validity=valid.

Приёмка реализации: [implementation report](061-cp189-implementation-report.md). FLOW integration 1933/1933, runtime-sensitive 30/30, release 2+8, EVAL 407/407; typecheck/lint/strict-canon build PASS. Новые E2E и delivery в этот scope не входят.

План готов к реализации на уровне решений, owners, sequencing и acceptance. Наличие API version edge cases не разрешает optimistic fallback: unknown shapes fail-closed и попадают в fixture tests. Реальный полный scored цикл трёх упряжек остаётся последующей проверкой после delivery; provider availability не гарантируется offline tests.

### Итог проверки готовности 2026-10-02

Предыдущая версия правильно задавала направления, но не полностью определяла crash atomicity, late-event binding, all-harness contract loading и trusted correctable disposition; эти решения теперь прописаны в A1–A4, B2a/B3, C1a/C2/C3 и D3–D5. Добавлен подтверждённый R17 и расширены tests/deliverables. Нет открытого пользовательского выбора, препятствующего началу source implementation; технически неизвестные native shapes не разрешаются по догадке и не считаются поддержанными до fixture proof. Исходники/runtime не изменены, full implementation gates этой проверкой не запускались.

## 12. Проверка по ponytail

- Убираем необоснованную строгость в zero-leaf participation, а не весь shell/admission guard. Не пишем shell interpreter и не меняем существующие tree-sitter/shell-quote зависимости.
- Reuse existing classifier, child reducer, error serializer, operation/controller ledgers, owner callbacks и test wrappers. Никаких новых retry schedulers, databases, generic middleware/error hierarchy.
- Исправляем общие источники R01/R02/R06 и сквозные serialization boundaries; не добавляем три harness-specific prompt workaround и не требуем от агента отказаться от normal compound shell.
- Не лечим quota retries, продуктовые дефекты, исторические receipts и все неизвестные ошибки заодно. Cwd checks только где имеют operational purpose.
- Тесты требуются явно: достаточный replay/contract/integration набор обязателен, но не бессмысленный полный Cartesian product всех harness × всех synthetic errors. Общий механизм проверяется один раз глубоко, каждой boundary — targeted contract.
- Старые правильные security/no-replay/budget и acceptance guards сохраняются. «Зелёный тест» ценен только если ловит реальный regression и проверяет отсутствие новых побочных эффектов.
