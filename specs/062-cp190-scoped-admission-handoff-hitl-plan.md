# 062 — CP190: scoped admission, владение handoff и HITL-контракт

Дата: 2026-10-02. Статус: **реализация, ревью и обязательная offline-приёмка завершены**. Исправления FLOW закоммичены и отправлены; live delivery и новые scored E2E в рамках ревью не выполнялись. Повторная проверка и уточнения — §12. Соответствие дефектов реализации и финальные результаты проверок — `062-cp190-implementation-report.md`; формулировки ниже о readiness сохранены как исходные условия приёмки.

Этот план фиксирует причины Luna/ZCode CP190, результаты дополнительного аудита и критерии исправления. Он дополняет 061, не отменяя её приёмку. PASS прежних suites не доказывал контракты, которых в них не было.

## 1. Цель, границы и исходная версия

Устранить доказанные ошибки flow/harness/tooling и проверок: одинаковая публичная lifecycle-команда должна разрешаться только в доказанном native scope, controller должен сохранить свой private execution contract, первичный admission failure должен дойти до EVAL без подмены timeout, HITL qualification должна проверять реальный контракт matcher.

Продукт вручную не исправляем. Не добавляем сортировку/ранжирование задач, цвета, workflow или другие требования ради прохождения Judge. Качество продуктового результата остаётся предметом работы агента, case acceptance и Final Judge.

В текущей задаче изменяется только этот план. Нет resume/restart/manual repair, редактирования исторических DB/фикстур/checkpoints, обновления установленных hooks, публикации engine, paid Judge qualification или новых E2E. Эти действия не являются побочными эффектами исследования.

| Источник | Проверенная версия |
| --- | --- |
| FLOW `/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation` | `bcb3440b50455f8ab000ff3117f32fcc2d85e713`, beta.124 |
| EVAL `/Users/deksden/Documents/_Projects/_worktrees/dd-eval-cp190-three` | `9fcdbbfb1d36edf17b803af4deb02ef9fbce2bf2` до добавления этого плана |
| CP190 установленный candidate CLI | `/Users/deksden/.dd-eval/qualification/cp-190-final-candidate/installed/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`; SHA-256 `e5d86f3fab34b16564fad881dfa2d213241bc37386994966362af97f4d1587e5` |
| Canon | 4.1.2, `2e57b987ec91b7c3b0fa97f6169047802a1233fb`; необходимость изменения не установлена |

Все ссылки на строки ниже относятся к этим исходным версиям. Новый source не изменяет runtime старого EVAL.

## 2. Уже расследованные исходные дефекты

### Luna — `EVAL-20261002060452-7b45a17e`

Home `/Users/deksden/.dd-eval/qualification/cp-190-luna`. Baseline PASS; SPECIFY HITL-001; terminal `completed_with_failures / interaction_fixture_gap`. UTC: HITL 06:10:31, verdict 06:13:50.802, operation failure 06:13:54.269, EVAL terminal 06:14:14.

Judge покрывает Q002/Q003, но считает Q001 «уровни, порядок, подписи» частично неразрешённым: значения/подписи есть, precedence/order не явно задан. Активная canonical response запрещает дополнительную сортировку и сохраняет существующий порядок списка. Вопрос Subject смешивает словарь/представление с предпосылкой о сортировке. Доказаны остановка и неоднозначность контракта; **не доказано**, что продукт нуждается в новом rank или что Judge единолично виноват.

Evidence: `<home>/runs/<EVAL>/executions/e2e/interaction-judge/specify-682c510f/{packet,result,cleanup}.json`; RUN `executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/intake/hitl/HITL-001-specify/question.md`. Active fixture SHA-256 `e089c3df741772bd3e87fd58deb07a55cc331500baaf65ede0d98cf703c7c61c`.

### ZCode — `EVAL-20261002060627-6cedc9e9`

Home `/Users/deksden/.dd-eval/qualification/cp-190-zcode`. Baseline PASS; SPECIFY done; **entry PROTOCOLIZE failed до stage attachment**; terminal `completed_with_failures`. UTC: SPECIFY done 06:20:02.597; old next attempt issued 06:20:02.614; new attempt issued 06:20:31.883; exact command 06:20:38.929; observer `invocation_ambiguous` 06:20:39.219; receipt timeout 06:21:10.127.

Subject исполнил exact controller command `"$DD_FLOW_BIN" stage start --stage protocolize --json --progress-jsonl`. Две попытки принадлежали разным native owners:

- old `4b9676bd-9957-4d16-9dd5-d529c4808200`, daemon `c7f27e63-ad15-48f3-b090-8a47bfb4aabb`;
- new `24efbb7a-390a-4e7e-abe3-fcbec84e3a96`, daemon `1acd0cbf-f8b1-409d-8f1e-1ef7df78400c`.

Trusted daemon/root есть в ZCode metadata, но предварительный cwd lookup использует ambient env без daemon. Получается глобальный lookup и ambiguity. Ошибка не входит в fatal allowlist ACP и не будит pending prompt: controller первым получает поздний timeout. Не SQLite lock, не slow hook, не ошибка модели/составной команды.

Evidence: `<home>/runs/<EVAL>/executions/e2e/dd-flow-home/db.sqlite`; RUN controller `DRV-dc77807a-c19a-4562-923b-9d3ff774ad5a`, `turn-00003.md`, `session-2/adapter.events.jsonl`, `protocolize-1.stage-start-response.json`. Предыдущий daemon/native tree и новый tree физически settled; прежняя cleanup проблема не повторилась.

## 3. Реестр причин и дополнений аудита

`live` — этот EVAL; `source/probe` — проверенный соседний контракт/воспроизведение, не новое live падение; `gap` — непокрытая проверка или неоднозначная спецификация.

| ID | Доказательство и первопричина | Системная точка исправления |
| --- | --- | --- |
| D01 | live: verified ZCode metadata не передана в `assignedLifecycleCwd`; lookup опирается на env | A: существующий scoped assignment lookup и все ingress callers |
| D02 | live/source: stage finish заранее выдаёт next authority старому владельцу; controller выдаёт её своему выбранному владельцу | B: единственный managed dispatcher; declarative next при controller ownership |
| D03 | live/source: обязательный observer refusal сохранён, но не будит ожидание из-за неполного списка fatal codes | C: доказанная correction отдельно от отказа mandatory owned ingress |
| D04 | gap: controller fixture подставляет daemon env, которого реальный ZCode ACP не передаёт | E: production-shaped ingress regressions |
| D05 | live/gap: taxonomy, presentation/order и дополнительная сортировка не разведены в HITL; materiality/classification недоопределены | D: ясный canonical non-goal, semantic policy и corpus, без расширения продукта |
| D06 | **добавлено, source/probe:** lookup даже с daemon игнорирует root/project/RUN/generation; соседние owners могут неоднозначно совпасть | A: полные доказанные ограничения вместо daemon-only/global fallback |
| D07 | **добавлено, source/probe:** short→full issuance в том же scope переиспользует попытку без context-file/hash, session binding и response-file | B: убрать managed precursor; проверять совпадение private stage-start contract |
| D08 | **добавлено, source:** CLI делает assignment lookup даже в unmanaged вызове без daemon; чужие pending назначения могут перехватить маршрутизацию/дать ambiguity | A: различать managed evidence и обычный manual CLI до lookup/подстановки private argv |
| D09 | **добавлено, source/probe:** safe shell correction аттестуется лишь для explicit internal UUID; public no-ID форма poison-ит ACP даже после correction | C: exact scoped assignment + durable pre-CLI proof для публичной формы |
| D10 | **добавлено, source:** native Grok/ZCode catch сохраняет только deny/reason, теряет typed cause до ledger; Codex native failure обобщает code | C: owned correlated failure receipt и bounded typed round-trip |
| D11 | **добавлено, source/probe:** `hitl-match@1` schema запрещает response_ids при unmatched, runtime намеренно сохраняет покрытый subset | D: schema/runtime parity, partial evidence не разрешает доставку ответа |
| D12 | **добавлено, source:** HITL qualification не передаёт stage context, production передаёт; контекстные classification проверяются на другом packet | D: один packet contract с authored context и immutable binding |
| D13 | **добавлено, gap:** весь active corpus positive-only; обещанные в плане 054 negative cases отсутствуют | D/E: небольшой case-local negative/partial/context corpus и проверка охвата |
| D14 | **добавлено, source/probe:** raw primary `invocation_ambiguous` не признаётся infrastructure, timeout признаётся; исправление доставки причины меняет run validity | C/E: доказанная причинная attribution в EVAL, без blanket классификации всех ошибок агента |

D03 затрагивает также отсутствующие `invocation_assignment_missing`, `invocation_directory_mismatch`, `invocation_scope_unproven`, `invocation_storage_unprepared` в ZCode allowlist. Исправление — не очередное расширение списка вручную.

## 4. Систематическая карта аудита

Основной агент и три read-only субагента проверили все callers найденных общих функций; результаты перепроверены по исходникам и runnable probes. «Вся кодовая база» здесь означает поиск этих классов дефектов по всем соответствующим ingress/producers/consumers/tests, не обещание отсутствия любых иных ошибок проекта.

| Граница | Проверенные места / результат |
| --- | --- |
| Native identity → cwd → assignment | FLOW `hooks.ts:503/511` Codex, `666/670` ZCode, `758/762` Grok, `906–907` controlled AGY/OpenCode/Droid; `lifecycle-invocations.ts:1039–1057`; receipt owner proof `767–865/912+` |
| Native forwarding/env | ZCode `dd-zcode.mjs:787–790`, `native-hook-command.mjs:132`; `run-controller-adapter.ts:58`; Grok `dd-grok-daemon.mjs:36/82–87` |
| CLI lookup/restore | `run-cli.ts:373–412`; `resolveObservedLifecycleArgs:1065–1078`; bootstrap/explicit-ID/manual compatibility |
| Issuance/immutability | `managedInvocationContext:483`, `managedLifecycleCommand:507–546`, public fingerprint/runtimeOwnedOptions `120–159`; retry/HITL successor paths; all 13 services calling managedLifecycleCommand |
| Stage successors | SPECIFY `vnext-specify.ts:287`; PROTOCOLIZE `vnext-protocolize.ts:96/232`; PLAN `vnext-plan.ts:162/186`; PLAN-REVIEW `vnext-plan-review.ts:107/138/296/527/530`; CODE→review; CODE-REVIEW→MERGE `265`; MERGE→source repair CODE `vnext-merge.ts:359/380`; recovery/merge-server/pause/Work registry |
| Owner selection | `run-controller.ts:639–670`, frozen transition policy/profile/cwd; managed daemon binding; external Work/server MERGE owners |
| Error ingress/consumer | ACP ZCode `26/237–258/339/795`; native `bin/dd-grok.mjs:30`, `bin/dd-zcode.mjs:80`; Codex `dd-codex.mjs:196–225`; AGY `bin/dd-agy.mjs:15–37`, daemon `473–506/605–623`; Droid `419–438`; OpenCode generated plugin `dd-opencode-daemon.mjs:56–58/164+` |
| Durable error consumers | lifecycle failure polling `lifecycle-invocations.ts:313+`, fallback diagnostics `444–460`, controller stop/drain, shared errorRecord, EVAL attribution/revision/report `runner.mjs:1825+/1893/1954/2281+` |
| HITL semantics/contracts | all interaction JSON cases, active task-priority SPECIFY/PLAN versus legacy scripted files; `interactionJudgePrompt:2174`, packet `2182–2183`, validator `2213`, resolve `2222`, qualification `2670–2772`, schema and tests |
| Tests/release assets | lifecycle-invocations, hooks, zcode-invocation-observer, controller-stage fixture/fullcycle, native adapter/assets, EVAL eval/evidence-schema; installed copied runtime versus source |

### Что не объявляем новым доказанным дефектом

- Grok native ingress **сейчас передаёт daemon env**; ACP mirror намеренно no-op. Предыдущее предположение о полном совпадении с missing-env ZCode уточнено. Общий неполный scope lookup остаётся, но нового live Grok падения здесь нет.
- AGY и Droid уже имеют correlated rejection и current-operation guard. Их транспорт не переписываем ради одинаковых файлов/архитектуры; проверяем одинаковую семантику.
- OpenCode plugin бросает typed error, но её сохранение конкретным native server не доказано. Нужен ingress contract test; исправление только если тест выявит потерю.
- SPECIFY/PLAN minimum task state response повторяется с разной явностью archived ограничения. Это drift-risk, не доказанное незаконное продуктовое поведение. Проверить combined question и accepted context; не создавать шаблонизатор ради двух ответов.

## 5. Пакет A — единое scoped разрешение lifecycle-команды

1. Переиспользовать `InvocationScope`, `InvocationIdentity`, существующие daemon/owner checks. Не создавать новый authority framework или параллельную Session registry.
2. Общий lookup принимает **явные проверенные** project/daemon/native root и установленный RUN/generation, а не сам читает optional ambient env. Доказать поля существующим owner binding; не извлекать authority из текста модели или из выбранной строки ledger.
3. Cwd выбирается по тому же scoped assignment, который observer затем проверит/свяжет. Передать selected identity/assignment дальше; повторная validation перед receipt/claim сохраняет защиту от гонки, foreign owner и смены generation.
4. При missing managed authority — точная no-effect ошибка, не глобальный search. Если owner ещё bootstrap и RUN не установлен, сохранить существующий доказанный bootstrap scope; не выдумывать RUN из чужого совпадения.
5. Сначала определить managed/unmanaged режим по существующему доказанному ownership. Controlled AGY/OpenCode/Droid, Codex/ZCode/Grok и CLI используют общий resolver там, где есть managed assignment. **Hook-only/unmanaged native receipt mode сохранить:** он может записывать native evidence без controller/assignment и не обязан выдумывать controller RUN/generation (`managedInvocationContext:487`, `observeLifecycleInvocation:929–932`). Но доказанный managed call без authority не превращается в unmanaged и не использует global fallback. Отдельные формы native payload допустимы; правила разрешения authority одинаковы.
6. В CLI разделить ordinary/manual call и managed call до private-argv restoration. Unmanaged команда без capability/native binding не читает глобальные pending attempts. Explicit-ID compatibility не должна обходить native receipt/ownership проверки.
7. Две попытки внутри **одного exact scope** по-прежнему дают ambiguity. Не выбирать latest/самую близкую, не возвращать UUID модели, не расширять разрешённый cwd.
8. Для CLI не считать `observedLifecycleNativeEvent` proof scope: сейчас это diagnostic correlation (`lifecycle-invocations.ts:984–1012`). Сначала связать daemon с persisted physical owner/state-dir/lease, current native root и RUN generation; receipt затем подтверждает конкретный tool call. Env/ID из argv лишь указатель для проверки, не самостоятельная authority. Native root брать из persisted native binding; ZCode adapter Session ID не равен provider Session ID, parent/root нельзя вывести из префикса UUID.
9. Наличие managed runtime owner при недостающих/повреждённых controller/Work/MERGE records означает `scope_unproven`, не доказательство unmanaged режима. Два подходящих владельца — conflict. Read-only status/inspection не требует issuance; bootstrap/hook-only сохраняют свои явно доказанные режимы.
10. Повтор одной native delivery/tool ID с теми же facts идемпотентен, native PreTool и ACP — corroboration одного допуска. Новый tool call с той же строкой не считается повторной доставкой: он не перехватывает executing assignment. Сохранить уже предусмотренное чтение settled результата без нового dispatch; expired/failed authority не оживлять. Выбор кандидата и receipt/claim проверяют один scope и status; при CAS race выполняются reread/validation, не глобальный повтор lookup.

Приёмка: exact CP190 короткая команда с old/new owner выбирает new assignment; same-daemon different-root/generation не смешиваются; wrong/foreign owner не допускается; manual CLI не зависит от чужих pending assignments.

## 6. Пакет B — один issuer следующего этапа и private contract

1. Controller-managed stage finish возвращает **декларативный next step** и инструкцию закончить Turn, а не заранее mint next-stage authority текущей Session. Это правило действует и при same_session: controller ещё должен привязать context, hash, response-file и binding.
2. Controller после frozen transition/profile/cwd policy, необходимого physical stop и проверенного session.create выдаёт полный Stage entry assignment один раз. Same-session controller пропускает создание Session, но не подготовку полного assignment.
3. Применить существующий общий helper в lifecycle issuance/next rendering, а не разные harness-specific правила. Managed ownership доказывается retained owner/controller metadata, не произвольным env-флагом. Не менять модель управления paused Work или child-only assignments.
4. Сохранить manual/unmanaged next commands, manual new-session handoff и same-session flow без controller. У них нет controller, который выдаст команду позже; удаление всех next.command недопустимо.
5. Проверить все next-command producers из карты, включая review-off/idempotent finish/report rendering и MERGE source repair. Повторное чтение stage report не должно выдавать новую authority или заставлять старую Session продолжать новый этап.
6. В `managedLifecycleCommand` запретить молчаливое reuse при разном **private Stage-start execution contract**. Публичный fingerprint остаётся для распознавания; context/hash/binding/response-file не теряются при совпадении видимой команды. Повтор точного полного контракта идемпотентен.
7. Минимальное правило несовпадения — точный отказ без side effects; не автоматически переписывать observed/executing command. Если для штатной подготовки нужен replacement, допустим только явно авторизованный CAS never-observed issued intent; отдельный тест, не общий «upgrade любых argv».
8. Не чистить ledger глобально. Старые never-observed intents можно retire только на доказанном handoff и только если это необходимо существующему lifecycle; executing/unknown требуют reconciliation. Исторические CP190 оставляем как есть.
9. Schema/TS types/CLI JSON consumers обновить согласованно для managed declarative next. Проверить `next_command`, `next.command`, mechanical report fields и replay consumers. Использовать существующие next kinds/owner flags, минимальное расширение лишь если текущие формы не выражают поведение.
10. Зафиксировать payload: в controller-managed finish сохранить `next.kind=start_stage`, целевую stage и handoff metadata, но не включать executable `next.command`/successor `next_command`; дать общую инструкцию закончить Turn и ждать controller. Результат остаётся успешным finish текущей Stage. Manual payload остаётся executable. **Не удалять `stage start` → `next_command=stage finish`**: это операция текущей Stage, обязательная в `stage-start-response@2`. `resume_command` paused Work и child Work assignments тоже не являются автоматически successor Stage.
11. Guard private contract обязателен во всех ветках `managedLifecycleCommand`: writable reuse, read-only rendering и explicit-ID compatibility. Для Stage start сравнить project/RUN target, context-file+hash, require-session-binding, response-file после имеющейся alias/path нормализации; эквивалентная запись пути не создаёт новый intent. JSON/progress flags не превращать в новую execution authority. Не расширять guard на разрешённые semantic inputs Work failure/result или existing accepted HITL answer replacement без отдельных причин.
12. В новом source default — mismatch отказ, без автоматического replacement и без массового retire. Удаление managed precursor предотвращает новый конфликт. Старые неполные intents остаются reconcile-required; exact repeat после lost reply/crash использует retained assignment. Возможный never-observed replacement из B7 не реализовывать «на всякий случай»: нужен failing regression, доказывающий его необходимость для штатного нового пути.

Приёмка: ни old/new-session ambiguity, ни short→full hidden-argument loss; same_session/manual modes сохраняются; вся последовательность SPECIFY→PROTOCOLIZE→PLAN→PLAN-REVIEW→CODE→CODE-REVIEW→MERGE и MERGE→CODE repair проверена без обхода gates.

## 7. Пакет C — correction, первичная ошибка и её attribution

### C1. Сначала public-command safe correction

1. Расширить существующую proof path `observeLifecycleInvocation` для public no-ID команды: exact scoped issued assignment, verified native identity и durable pre-CLI receipt.
2. Unsupported shell leaf используется только для доказательства, **какая выданная команда была отклонена до запуска**, не как разрешение исполнить loop/substitution/ambiguous multi-call. Не менять поддерживаемую shell-грамматику ради этого исправления.
3. Если exact assignment/leaf/scope/effect доказать нельзя, correction не разрешена. `error.details` из произвольного callback не является proof; сохранить транспортную аттестацию/WeakSet.
4. Public и explicit-ID compatibility paths дают одинаковое безопасное поведение. Corrected command не poison-ит flush; нельзя replay prefix/suffix, восстанавливать потерянные effects или выдавать новый UUID вручную.
5. Отказанная shell-форма имеет отдельный native event/tool key и не consuming/claiming выданную CLI authority. Correction допускает один новый tool call, который заново проходит native admission той же exact issued команды; это не replay старого hook event. Failed shell receipt остаётся evidence и не poison-ит более поздний successful receipt. Ноль/несколько assignment matches, executing/settled/expired attempt, changed owner/generation или неоднозначный AST не дают correction capability. Не вводить автоматическую бесконечную correction loop; действуют имеющиеся controller nonprogress/owner budgets.

### C2. Потом обязательный owned ingress failure

1. На **owned mandatory lifecycle observer** разграничить доказанную correction и остальные отказы. Убрать зависимость от неполного fatal code allowlist в этой границе.
2. Не применять «любой callback fatal» к telemetry, ordinary tools, foreign events или stale observer. Current observer/operation guard остаётся.
3. **Синхронно latch первую typed cause/correlation в owned operation и закрыть productive gate; reject exact pending waiter без неограниченного ожидания persistence.** Не ждать receipt deadline или зависшего `journal.write()` при уже доказанном отказе. «Сохранить причину до rejection» означает сначала удержать её в памяти, не ждать SQL/file I/O без бюджета.
4. Затем сохранить durable evidence в существующем hook/operation budget через bounded `errorRecord`, lifecycle outcomes/diagnostic fallback и controller failure polling/stop/drain. Ошибка/зависание journal/DB записи — secondary; не выдавать fabricated durable receipt. Unknown effect остаётся no-replay/reconciliation; pending persistence не позволяет физически бесконтрольно завершить процесс с потерей evidence.
5. Если native terminal result уже получен, сохранить его отдельно: обязательная observation/admission ошибка не переписывает provider completion и не доказывает отсутствие всех прошлых effects. `no_effect` относится только к доказанно не допущенному lifecycle вызову. При гонке error/timeout/cancel/late notification первую доказанную owned cause не заменять вторичной; late failure старой operation сохранять отдельно, не отклонять новый Turn. SQL receipt callback остаётся synchronous SQL-only: никакого await/filesystem/RPC внутри SQLite write transaction.

### C3. Native-only typed failure round-trip

1. Native deny формат Grok/ZCode оставить совместимым с harness. Отдельно сохранить structured cause через существующую atomic receipt и owner/request correlation — по уже реализованному принципу AGY, не generic доверенный mailbox.
2. Daemon принимает failure лишь для hook request, который признан его own active operation: daemon incarnation, root/child ownership, request/tool, operation/turn generation. Нельзя привязать старый/foreign receipt к текущей Session по одному daemon ID.
3. Ошибка до proof ownership не становится отказом произвольного текущего Turn. Сохраняется unbound diagnostic, managed boundary остаётся fail-closed/unknown согласно имеющимся evidence.
4. Codex native path проверить на сохранение typed service cause вместо generic `native_hook_failed`; human-facing reason/regex не даёт authority. AGY/Droid семантически проверить без ненужной переписи; OpenCode менять только после доказательства transport loss.
5. Для Grok/ZCode минимально расширить существующий daemon hook identity handshake: daemon регистрирует/возвращает accepted request ID, привязанный к active operation/native tool; hook пишет typed failure в owned state-dir под этим ID, daemon проверяет binding. Не доверять произвольному request ID или state-dir из текста модели. Повтор receipt идемпотентен; stale/foreign/unbound receipt не закрывает текущую operation. После daemon restart correlation восстановима из retained operation evidence; если proof не сохранился, оставить unbound/unknown, не перепривязывать к новой active operation. Использовать existing atomic writer/error serializer и bounded retention по завершении owned operation, не новый mailbox service.

### C4. EVAL primary cause и validity

1. Проверить raw/wrapped/retained failure через `executionEvidence`, failure revision, attribution, report и Final Judge packet.
2. Доказанный runtime-issued `invocation_ambiguous` — infrastructure/flow failure, не valid product run. Первичная cause сохраняется; timeout/cleanup отдельно.
3. Не помечать все `invocation_*` или wrong-cwd/unknown model command инфраструктурой по prefix. Для assignment/directory failures учитывать доказанный issuer/route и trusted fatal disposition; недоказанное attribution остаётся undetermined.
4. Infra classification не даёт retry authority и не означает observation loss. Safe correction, quota, ownership и unknown effects не объединяются.

Зависимость обязательна: C1 реализовать/проверить **до** C2, иначе public shell correction превратится в немедленный fatal.

## 8. Пакет D — ясный HITL и квалификация production-контракта

### D1. Canonical decisions и materiality

1. Уточнить active source answer: четыре значения и подписи; `no_priority` — отсутствие; никаких дополнительных сравнений/сортировки/фильтрации; существующий task-list order не меняется. Не придумывать отдельный rank или порядок UI-контрола, не требуемый задачей. Если presentation order реально нужен, его отсутствие анализировать как отдельное решение, а не silently добавлять новое продуктовое требование.
2. Согласовать общий смысл SPECIFY/PLAN minimum task state и узкого archived priority exception. Preserve stage-specific PLAN duties; при достаточном accepted context не дублировать весь ответ в каждой фикстуре.
3. В существующем `interactionJudgePrompt` явно определить material in-scope unresolved decision, `fixture_gap`, `unnecessary_question`, `out_of_scope`, `ambiguous` и mixed questions. Recommendation Subject не делает новую функцию обязательной; canonical отказ от функции может разрешать вопрос о её необходимости.
4. Subject assumptions не заменяют accepted context. Не терять независимое действительно необходимое решение при отказе от предложенных вариантов. Exact canonical answer, smallest sufficient response IDs, logical entailment и запрет сочинять ответ сохраняются.
5. Не вводить regex semantic judge, automatic PASS исторического вопроса или forced rank. В rationale требовать конкретный непокрытый атомарный пункт; существующих полей достаточно, новое дерево решений/схема для красоты не нужны.
6. Для mixed question использовать один существующий primary classification с явной политикой: доказанный обязательный in-scope gap → `fixture_gap`; если такого gap не доказано, но существенную неоднозначность нельзя разрешить → `ambiguous`; иначе непокрытый дополнительный scope → `out_of_scope`; иначе ненужное уточнение/повтор → `unnecessary_question`. Покрытый subset сохраняется. Все независимые причины перечисляются в rationale/атомарных uncovered entries; primary fixture_gap **не означает**, что ошибочное расширение scope Subject тоже вызвано инфраструктурой. Добавить combined gap+out-of-scope test; Final Judge получает обе причины. Это порядок semantic policy, не regex и не новый verdict format.
7. Accepted context используется для scope/materiality и понимания уже принятых решений, но не позволяет дописать/перефразировать canonical answer. Sole повтор явно принятого решения без нового существенного обстоятельства — `unnecessary_question`, даже если fixture содержит прежний ответ. Independent новое unresolved решение нельзя проигнорировать как повтор. `covered_questions` — атомарные запросы, обслуженные выбранными canonical responses; `uncovered_questions` включают и необслуженные invalid/ненужные запросы с причиной в rationale, не только отсутствующие ответы. Смешанные verdict должны удовлетворять тому же validator, не отдельной неформальной схеме.

### D2. Published schema = runtime validator

1. `schemas/hitl-match.v1.schema.json` разрешает partial response IDs при unmatched; matched требует непустого покрытого ответа и отсутствия uncovered decisions.
2. Непустой partial response subset допустим лишь с покрытыми decisions. Уникальные непустые строки, непересекающиеся covered/uncovered, known response IDs и consistent classification проверяются existing validator/schema на своих уровнях. Schema не проверяет known IDs без fixture и не подменяет semantic Judge.
3. `resolveHitlJudgment` **не отправляет** partial ответ при unmatched. Исторический verdict остаётся неизменным; новая schema должна принимать его как diagnostic evidence, а не менять outcome старого EVAL.

### D3. Qualification context и identity

1. Переиспользовать существующий stage-context и packet construction для scored/recovery/qualification. Qualification context authored и immutable, не текущий изменяемый workspace старого EVAL; не поднимать полный RUN ради matcher.
2. Context-dependent corpus item явно указывает stage/accepted facts; staged sources доступны/снимок подготовлен тем же contract. Недоступный path не считается прочитанным доказательством.
3. Corpus/context bytes, Judge prompt/profile, fixture hash и definition binding участвуют в qualification identity. Referenced sources — только case/owned immutable inputs; используемые **source bytes/hash**, а не один path, связаны с identity либо с уже проверяемым immutable input manifest. Stable authored identity отделена от абсолютных materialized paths конкретной qualification operation. Packet/receipt verification проверяет context/source identity и packet hash, а не только вопрос/response IDs. Старый contextless receipt не годится для новой contextual qualification; менять source под тем же path нельзя.
4. Если существующих corpus fields достаточно — использовать их; иначе минимально добавить context reference/hash или версионировать corpus contract. Не хранить несколько копий ответа для разных harness.
5. Для contextual items зафиксировать минимальный формат: optional `context_file` и `context_sha256`, только парой; файл relative внутри case, после containment/regular-file проверок. Содержимое проходит existing stage-context validation и содержит authored accepted facts/source references. Materialization использует `lib/entry-pack.mjs`, packet construction остаётся общим `interactionJudge`. Binding источников — существующий committed definition/input manifest плюс hashes используемых bytes; transient absolute roots входят в packet hash, но не меняют stable qualification key сами по себе. Contextless items других cases остаются поддержаны; для contextual task-priority corpus отсутствие пары — declaration error. Contract/version bump нужен лишь при несовместимом формате; key обязан измениться при новых context/source/prompt inputs в любом случае.

### D4. Case-local corpus

1. Сохранить exact CP190 Luna question отдельным regression case; ожидаемую classification обосновать новым ясным контрактом, не выбирать ради PASS. Добавить атомарный values/labels/no-additional-order случай и другой способ группировки тех же решений.
2. Малый negative набор: настоящее in-scope material решение без ответа; лишний scope; ненужный повтор принятого решения; реально двусмысленный вопрос; partial-covered compound question; mixed real gap + extra scope по политике D1.6. Все поддерживаемые unmatched classifications представлены.
3. Проверить vocabulary/default/backfill/roles/create-update/archive/UI/API/no-extra-indicators/no-sorting/minimal-state, включая state in archived + priority exception и smallest sufficient IDs.
4. Добавить case-local coverage assertion по фиксированным declared ids/decision tags. Это проверка присутствия оговорённых тестов, не «детерминированное доказательство полноты семантики».
5. Проверить qualification negative expected status/IDs и cleanup, а не positive-only test helper, который всегда создаёт matched. Смена corpus/prompt/context/fixture/Judge требует нового receipt. Один общий Judge `gpt-6.1-sol/high` квалифицируется на definition, не отдельно на каждую subject harness.
6. Редактировать будущую source definition/новую committed revision; sealed case CP190/runtime files не менять. Legacy scripted `interactions/specify.json` не переписывать массово: scored runtime читает active entry-pack-source.
7. Expected для exact Luna Q001–Q003 после D1: `matched / covered_by_canonical_response`, только `clarification-task-priority` — значения/подписи/defaults/permissions и явный отказ от нового ordering behavior разрешают эти запросы; отдельный UI-control order не является acceptance этого case. Это expectation нового уточнённого контракта, не изменение historical verdict. Контроль: действительно самостоятельный material in-scope вопрос, которого D1 не разрешает, остаётся `fixture_gap`; иначе исторический PASS считается подгонкой. Corpus status ожидается явно (`matched` для covered, `unmatched` для остальных), IDs сравниваются как множество без duplicate; negative/partial coverage и minimal sufficient selection проверяются отдельно от свободного wording rationale.

## 9. Пакет E — runnable проверки и delivery gate

### Targeted regressions в существующих suites

| Проверка | Минимальный expected outcome |
| --- | --- |
| Actual ZCode ACP envelope без daemon env; два old/new assignments | одна exact new scope; hooks/CLI получают один assignment |
| Same daemon/different roots; same root/different generation; different projects/RUNs | нет cross-scope подстановки; foreign/stale отказ без effects |
| Root/child native calls; bootstrap и explicit-ID compatibility | ancestry/binding обязательны; public IDs не нужны |
| Manual CLI при чужих pending ledger rows | обычный route не перехватывается; managed без proof не допускается |
| Native hook-only без controller/assignment против managed missing assignment | первый сохраняет evidence; второй fail-closed, не маскируется под unmanaged |
| Short→full issuance; changed private context | controller fields не теряются; mismatch не меняет in-flight command |
| Повтор точного полного Stage entry | один идемпотентный assignment, hash/response/binding сохранены |
| Private mismatch в writable/read-only/explicit-ID branches; lost issuance reply | все три ветки отказывают без изменения authority; exact repeat возвращает retained assignment без нового dispatch |
| Повтор native event против нового tool call; settled result read | дубликат идемпотентен, новый tool не захватывает executing intent; settled read не повторяет effects |
| Controller same_session/new_session/profile/cwd transition; review off/idempotent; MERGE repair | next не выдаёт authority предыдущему владельцу; manual next сохранён |
| Handoff прерван между finish/stop/create/issuance; concurrent cancel/recovery, ноль/два доказанных владельца | только existing reconciliation и доказанный current owner; ни double issuance, ни mint по старой generation; current-stage finish/paused resume сохранены |
| Mandatory observer failure до receipt; перечисленные missing fatal codes | pending prompt отклоняется с первой cause до timeout; stale observer не трогает новый Turn |
| `journal.write()` never resolves, receipt deadline наступает параллельно | latch/reject своевременно передают primary failure; budget/fallback удерживают storage failure вторичным |
| Public и ID safe shell refusal → correction | обе формы не poison-ят flush; forged details/multi-leaf/wrong owner не получают authority |
| Native hook structured failure round-trip, поздний/foreign request, ledger/journal unavailable | exact owned cause либо честная unbound/unknown диагностика; no replay |
| Restart до/после accepted hook request и atomic failure receipt; duplicate receipt | retained binding либо unbound/unknown; старый request не связывается с новой operation; никаких повторных effects |
| Native terminal result одновременно с mandatory failure/cancel/timeout | provider result сохранён отдельно; первая доказанная owned cause первична, no-effect ограничен отклонённым вызовом |
| EVAL raw/wrapped primary ambiguity + cleanup/timeout | flow-invalid infrastructure attribution; product mistakes не blanket infra |
| Actual Luna partial verdict versus schema/runtime | оба принимают diagnostic; delivery unmatched запрещена |
| Mixed/material/non-goal/accepted-context HITL packets | заданные positive/negative expectations, source/context доступность проверена |
| Qualification key/packet/context/source mutation под тем же path и negative verdict fixture helper | stale/tampered receipt отказ; absolute operation paths не ломают stable identity; negative result не превращается в matched |

Тестовый controller adapter не должен подставлять env/native metadata, отсутствующие в проверяемом ingress. Native PreTool и ACP observer — разные transport fixtures; AGY/Droid сохраняют свой настоящий envelope. Общая semantic matrix — table-driven cases в уже существующих tests, не новый test framework.

### Порядок реализации и проверки

1. Добавить failing reproductions D01/D07/D09/D11/D14; затем A → B → C1 → C2/C3/C4. D1–D4 можно делать независимо, но D2 предшествует negative partial-schema gate.
2. Targeted FLOW: существующие lifecycle-invocations/hooks/zcode-invocation-observer/controller-stage/native-adapter/assets suites. EVAL: eval/evidence-schema и qualification producer/validator cases.
3. Общая приёмка FLOW — команды ниже. Integration, runtime-sensitive и release — отдельные обязательные gates; `test:integration` не включает два остальных. Не повышать timeout/не исключать failing tests ради PASS. Build не выполнять одновременно с читающими dist тестами.
4. Общая приёмка EVAL — команда ниже, с **offline controller adapter**, не реальной упряжкой. Tests создают свои изолированные homes; не подставлять live EVAL homes/config/resources. Сохранять exact commands, counts, skips/failures и primary errors. Required SKIP или зависший gate — unverified, не PASS.
5. На packed/copied candidate повторить critical ingress/private-argv/error/schema regressions вне source tree. Native shape/env не должны зависеть от тестового checkout.
6. Review diff + tests отдельно: scope trust boundary, owner handoff, correction proof, immutable reuse, error attribution, corpus expectations. Коммит/пуш изменений и receipt при реализации — по отдельному запросу; publication/hooks/new runs не входят автоматически.
7. После отдельного разрешения delivery: новый pinned engine, новая committed case revision, обновлённая qualification identity; live HITL qualification общим Judge; новые отдельные homes Luna/ZCode/AGY. Grok offline coverage обязательна, live только после проверки доступа и отдельного решения.
8. Полный E2E считается успешным не при daemon ready/Stage entry, а после всех стадий, gates, MERGE, settled physical tree, case acceptance и Final Judge. Provider quota/access блокер отделяется от defect fixed; failed исторический EVAL не становится успешным из-за нового кода.

FLOW gates, cwd — implementation checkout из §1:

```sh
pnpm typecheck
pnpm lint
DD_MEMORYBANK=/Users/deksden/Documents/_Projects/dd-memorybank DD_FLOW_BUILD_STRICT_CANON=1 pnpm build
pnpm test:release
pnpm test:integration --reporter=dot
pnpm test:runtime-sensitive --reporter=dot
```

EVAL gate, cwd — implementation EVAL checkout, пути сверить с выбранным FLOW commit:

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation \
DD_EVAL_TEST_FLOW_CLI=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation/dist/cli.js \
DD_EVAL_TEST_FLOW_ADAPTER=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation/test/fixtures/controller-stage-adapter.mjs \
node --test --test-concurrency=1
```

Перед запуском сверить scripts/fixture paths с выбранными commits. Если изменится native failure asset/export или next/schema contract, приёмка включает существующие loader/export checks и исполнение packed/copied assets вне checkout; source-only import не является доказательством доставки фикса.

## 10. Перепроверенные probes этого исследования

Все read-only: original DB открыта `DatabaseSync(...,{readOnly:true})`; временная реконструкция состояния только в памяти; provider/CLI mutation не запускались.

- Установленный lookup: без daemon — exact CP190 ambiguity; с correct daemon — new assignment. Subagent дополнительно подтвердил same-daemon root/generation collision.
- Установленный ACP: ambiguity сохраняется, но pending остаётся; scope_mismatch немедленно отвергает pending.
- Основной агент повторил hidden contract probe на installed beta.124: short prior reuse → `context-file=false`, `context-sha256=false`, `require-session-binding=false`, `response-file=false` в restored argv.
- Основной агент повторил actual observer/bridge public correction probe: explicit-ID → flush success; public no-ID → `lifecycle_shell_syntax_invalid` retained/flush error.
- AJV2020 из уже установленного FLOW dependency: actual Luna verdict runtime-valid, published schema-invalid `/response_ids maxItems:0`; основной агент повторил schema failure независимо от субагента.
- Actual EVAL classifiers: `invocation_ambiguous` → infrastructure false / attribution undetermined; `invocation_receipt_timeout` → true / evaluation_infrastructure. Assignment/directory raw codes также undetermined; это не разрешение blanket менять attribution без provenance.

## 11. Ponytail review и критерий завершения плана

План проверен по ponytail full после чтения реальных цепочек и всех callers. Для semantic prompt policy также использован prompting: ясная materiality, context, строгий output и positive/negative examples вместо новых ролей/framework.

- Переиспользуем InvocationScope/Identity, owner binding, existing lifecycle ledger, errorRecord, atomic receipts, stage-context и существующие test suites.
- Не добавляем зависимости, registry, generic authority framework, event bus, универсальный qualification engine, response templating или JSON decision tree.
- Не предлагаем «подождать дольше», latest-row selection, daemon env как единственную заплатку, fatal prefix rule, wildcard `.zcode`/Grok home guards, отключение admission либо автоматический ответ Judge.
- Разделяем proven defects, test gaps и risk-only OpenCode/fixture duplication; последние сначала проверяем и не ремонтируем предположения.
- Каждый нетривиальный фикс имеет runnable regression и отрицательный контроль. Не расширяем продукт и не ослабляем unknown-effect/no-replay границы.

Повторный challenge review полного плана тремя аудиторами добавил четыре readiness условия: hook-only совместимость (A5), immediate latch/reject без unbounded persistence wait (C2), content-bound source identity (D3) и mixed-classification policy (D1/D4). Основной агент проверил соответствующие исходные paths и включил условия в acceptance таблицу. Это дополнения к плану, не утверждение о выполненных fixes.

План реализован полностью только когда D01–D14 имеют code/fixture/test mapping и PASS указанных gates, manual/managed compatibility доказана, packed assets проверены, а risk-only проверки имеют зафиксированный результат. Сейчас зафиксирован **план**, не выполненные исправления и не обещание будущих scored PASS.

## 12. Повторная проверка готовности — 2026-10-02

Перепроверены существующие resolver/CLI/issuance branches, native failure transports, stage response/next types, HITL qualification/entry-pack и реальные package/test scripts. Найденные недоопределённости закрыты требованиями A8–A10, B10–B12, C1.5/C2.5/C3.5, D1.7/D3.5/D4.7 и дополнительными строками приёмки E. Новые live дефекты этим review не объявлены: уточняется реализация уже доказанных D01–D14 и защита соседних путей.

### Что дополнено и почему

1. **Источник authority:** diagnostic native event и env — не proof; scope связывается с physical owner, native root и RUN generation. Missing managed records не дают downgrade в manual. Учтено различие adapter/provider Session IDs.
2. **Граница successor:** убирается только преждевременная controller-managed команда следующей Stage. Обязательная команда finish текущей Stage, manual next, paused resume и child Work contract сохраняются.
3. **Идемпотентность и private contract:** проверяются все три issuance branches, normalized paths и hidden arguments; duplicate native delivery отделяется от нового tool call, settled read — от повторного dispatch.
4. **Crash/гонки:** добавлены interrupted handoff, cancel/recovery, lost reply, restart hook correlation, поздние/foreign errors и concurrent terminal result. Не сохранённая proof остаётся unknown, не восстанавливается предположением.
5. **Correction:** новый исправленный tool call заново проходит admission; ошибочный shell receipt не расходует authority и не poison-ит последующий успех. Correction не превращается в общий replay/retry механизм.
6. **HITL:** accepted context определяет materiality, но не сочиняет ответ; повтор принятого решения классифицируется до canonical matching. Указаны точный expected Luna regression, отрицательный независимый gap и правила partial/mixed verdict.
7. **Qualification:** выбран минимальный context reference/hash contract, привязаны source bytes и stable identity; transient materialization paths не инвалидируют её сами по себе. Contextless compatibility других cases сохранена.
8. **Проверки:** зафиксированы offline env/adapter и strict-canon build; required SKIP не считается PASS, copied assets проверяются отдельно. Никаких live вызовов провайдера при offline suite.

### Порядок и совместимость реализации

- Сначала failing regressions, затем A/B, C1 перед C2, затем native round-trip/attribution. HITL D независим от admission, но schema parity и context binding должны предшествовать новой qualification. Общие gates запускаются после согласования обеих частей; paid/live validation — отдельная delivery фаза.
- Только новые source revisions. Для case definition использовать отдельный implementation checkout/branch, не менять frozen CP190 definition под активным/историческим EVAL. Текущий review меняет лишь этот документ.
- Старые intents/receipts не переписывать и не дополнять authority; incomplete private contracts — точный refusal/reconciliation, не автоматический upgrade. Обновление engine не меняет pinned bytes исторического EVAL. Совместимые чтение evidence/manual paths сохранить; при действительно несовместимом published contract обновить version/producer/consumer согласованно и дать явный contract error, не provider failure.
- Не вводить speculative replacement/retirement, новый registry/mailbox/framework или dependency. B7/OpenCode transport changes допустимы лишь после отдельного воспроизводящего failing test. Это ponytail-ограничение не отменяет обязательные trust-boundary проверки.
- В implementation report обязательна таблица D01–D14 → изменённые files → regressions → gate result; для risk-only проверок — результат и причина изменения либо отказа от изменения. Нельзя завершить план по targeted PASS при незавершённом обязательном gate.

**Вывод:** известных блокирующих проектных вопросов не осталось; план готов к реализации. Это не обещание будущего paid Judge/E2E PASS. Code fixes, runtime gates и live validation ещё не выполнены; при новой противоречащей evidence решение уточняется до изменения соответствующей границы, а не обходится ослаблением guard.
