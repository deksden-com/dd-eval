# 049 — Lifecycle rejection settlement и аудит всех упряжек

Дата: 2026-09-22. Статус: план реализации; production code не изменён.

## 1. Цель, границы и baseline

Устранить два связанных, но разных класса дефектов: (A) native lifecycle call наблюдался, но ранний отказ CLI не получил причинного durable outcome; (B) native turn завершён, но tree settlement/capacity/следующее продолжение расходятся. Не смешивать semantic lifecycle outcome с освобождением provider capacity. Проверить AGY первой, затем все остальные поддержанные упряжки: Grok, Droid, OpenCode, Codex, ZCode. Luna/Sol/Terra — модельные профили Codex, не отдельные transports.

Аудит проведён по `dd-flow-cli@c1017bf64843d6979b9dee222dc0831baff6ad0a`; исходный инцидент — published beta.95, commit `4c8c5e8456d684a7887c8bfdd1afc24ae874ff6c`. Не переносить исторические утверждения на новый HEAD без сверки. Перед реализацией повторно снять HEAD/status, сверить merged работу по плану 048 и dd-zcode/zcode-acp. Уже исправленные пути закрывать regression evidence, не переписывать.

Не изменять CP-133 DB, artifacts, verdict, published engine; не resume/restart/manual repair. Не вмешиваться в параллельные ZCode/Grok EVAL. Новые проверки используют временные изолированные homes; будущая live-квалификация — новый checkpoint и новый EVAL. Существующие несвязанные изменения README, runbooks, DD-ZCODE.md и план 048 сохранить. Этот план не является разрешением на реализацию или публикацию.

## 2. Доказанная причинная цепочка CP-133

EVAL `EVAL-20260922075252-129d85b8`, home `/Users/deksden/.dd-eval/qualification/cp-133-agy`, RUN `RUN-001-eval-subject`, controller `DRV-dbfe49b0-6bcc-4f1a-8a31-6847bec0ee79`. AGY 1.2.8; requested `gemini-3.1-pro-high`; native child model attribution остаётся incomplete.

1. SPECIFY/HITL завершились; SPECIFY finish — 07:56:44 UTC. PROTOCOLIZE start — 07:57:27 UTC. Дефект произошёл в **PROTOCOLIZE**, не в SPECIFY.
2. Первый finish, 07:58:12: `schema_validation`, `phase=prepare`, `effect=no_effect`, `recoverable=true`. В 16 элементах ownership использовано `id` вместо `obligation_id`. Ответ не содержит `retry_command`.
3. Модель исправила поля в 07:58:22. Исправленный JSON проходит pinned JSON Schema offline; это не доказательство semantic acceptance.
4. Второй finish, 07:58:30: `ambiguous_lifecycle_receipt`, `multiple_live_events`. Native steps 33 и 37 — **два разных вызова**, а не повторная доставка одного.
5. `hook_events` id 6 и 7 имеют status=observed, claimed_at=NULL, outcome_json=NULL и одинаковый match_key. `lifecycle_invocations` пуста. Read-only вызов matcher на историческом времени воспроизводит ambiguity.
6. Controller заканчивается `incomplete_subject_turn`; первичная schema error и последующая ambiguity не представлены как causal lifecycle error. Native SUCCESS означает завершённый provider turn, не успешный EVAL.

Evidence paths относительно EVAL:

- `executions/e2e/dd-flow-home/db.sqlite` — receipt/outcome state;
- `executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/controllers/DRV-dbfe49b0-6bcc-4f1a-8a31-6847bec0ee79/session-1/events.jsonl`;
- в той же session: `gemini/runtime/brain/0d14a7ec-ea06-4e76-8638-e3adacb3e04e/.system_generated/logs/transcript_full.jsonl`.

Первопричина runtime: в `src/cli/run-cli.ts` non-invocation `prepareCliInput` исполняется раньше `observeLifecycleCommand`; catch умеет ранний settlement только при `DD_FLOW_DAEMON_ID`. AGY не получает managed invocation scope: `managedInvocationContext` включает его только для Codex/ZCode. Schema rejection поэтому оставляет старый native receipt живым. Matcher обоснованно отказывается выбирать из двух кандидатов. Ослаблять matcher — не исправление.

Сопутствующий дефект producer: `vnext-protocolize.ts` пишет `resultTemplate(obligations)` в файл, но показывает в prompt `resultTemplate()` с пустым ownership. Канон дополнительно велит заполнить пустой ownership. Нужная форма уже известна детерминированно, однако модель вынуждена её восстанавливать. Это фактор ошибки ввода, но не оправдание отказа runtime обрабатывать корректный повтор.

## 3. Общие инварианты исправления

- Каждый доверенно сопоставленный lifecycle call получает один терминальный outcome, включая отказ до dispatch. Ошибка ввода не даёт права claim/execute.
- Диагностическая запись в уже существующий receipt не является semantic effect. Невалидная ручная команда без receipt не создаёт home/DB/output directories.
- Identity включает существующие project/run/generation/stage/attempt/cycle/Work/session/native call связи там, где применимо. Command hash — lookup key, не identity вызова. Внутренние ID, checksum и scope остаются runtime-owned.
- Redelivery того же native call идемпотентна; новый call с тем же текстом — отдельная попытка. Success одного Work не подавляет ошибку соседнего.
- Correctable no-effect rejection допускает новую авторизованную попытку; fatal rejection, stale owner и unknown/committed effect — не продуктивный retry. Replay сохраняет исходный outcome.
- Не выбирать «самый свежий» receipt, не сокращать TTL, не ждать 61 секунду, не подставлять guessed ID, не расширять fallback allowlist ради обхода ambiguity.
- PostToolUse, provider SUCCESS и assistant prose не заменяют semantic receipt. Active successor подавляет старую ошибку только при доказанной причинной связи.
- Отсутствующий/неоднозначный anchor сохранять как диагностический факт, но не приписывать произвольному Work. Ошибка публикации ответа после commit не превращается в no_effect.

## 4. Карта общих затронутых мест

Пути ниже относительно dd-flow-cli. Это полный найденный набор lifecycle route families и прямых claim/matcher consumers на baseline; список не означает доказанный дефект каждого consumer.

| Участок | Места | Что исправить/проверить |
|---|---|---|
| Внешняя CLI граница | `src/cli/run-cli.ts`: alias/route parsing, engine routing, prepare, compatibility, dispatch, catch, response publication | Один outcome на ранний отказ с существующим trusted anchor; один writer в routed engine; без повторного чтения prepared inputs |
| Settlement/admission | `src/services/lifecycle-invocations.ts`: observeLifecycleCommand, observedLifecycleNativeEvent, awaitLifecycleInvocation, settleLifecyclePreparationRejection, currentLifecycleFailure | Переиспользовать существующие записи/классификацию; общее извлечение причинной ошибки для invocation и hook-only |
| Hook correlation | `src/services/hooks.ts`: observeCommandHook, findRecentMatchingHookEvent, replay/claim helpers | Отказы no_effect исключаются из live candidates; неоднозначность не проглатывается как успешная корреляция |
| Claim callers | stage start в run-cli; stage resume в `stage-pause.ts`; work start в `work-registry.ts`; recovery accept в `run-recovery.ts`; общие stage/work finish/fail/pause/bootstrap claims | Общие проверки current scope и CAS; stale receipt/replay/cross-session regressions |
| Controller | `run-controller.ts`: fanout none, repeated continuation; `continuation-outcome.ts` | Hook-only cause доступен и без fanout; корреляция не только по operation, но и по target/attempt; не маскировать соседний Work |
| Route inventory | `lifecycle-contract.ts` | session register; stage start/finish/pause/resume; work start/finish/fail; merge apply/repair; run recovery accept |
| Auxiliary continuation | `work repair add`, `stage block` | Не приравнивать к lifecycle authority; проверить сохранение ошибки и continuation без ложного receipt |
| Prompt/draft producer | vnext-protocolize, specify, plan, plan-review, code, code-review, merge | Согласовать реальные drafts, показанные формы, schemas и runtime-owned fields; не заставлять модель переписывать известные значения |

Ранние отказы для table-driven coverage: unknown flags/route, path alias, reason/question/answer/result/decision/verification file отсутствует или некорректен, stdin JSON, response destination, context/checksum mismatch, compatibility rejection. Проверять и phase/effect, и отсутствие semantic writes. Не каждый error является correctable: классификацию сохранять по существующему контракту.

## 5. Аудит каждой упряжки

Обозначения: **C** — подтверждённый кодом/артефактами дефект; **R** — конкретный статический риск, требующий regression/native contract evidence; **P** — уже существующая защита, нужна проверка отсутствия регрессии. Не заявлять live failure там, где проверен только код.

### AGY / antigravity-cli — первая очередь

- **C:** non-invocation prepare/settlement gap выше. Fix в общей CLI, не особый повтор AGY.
- Native ID в `src/harness-runtime/lib/dd-agy-daemon.mjs::observeHook` включает daemon, conversation, turn generation, execution, step, tool, args. CP-133 показывает корректно различённые calls; при полных metadata и одной generation exact redelivery также стабильна. Эта гарантия не распространяется на cross-generation replay и missing metadata ниже.
- **C:** `bin/dd-agy.mjs::hook` запускает event handler с stdout=ignore, считает exit 0 достаточным, не использует bounded `invokeNativeHook`; generic Error теряет structured code, собственных timeout/output bounds нет. Переиспользовать `lib/native-hook-command.mjs`, сохранив AGY-native allow/deny envelope и валидный nonparticipating response. Не передавать unsupported updatedInput провайдеру.
- **C, независимо воспроизведено:** старый payload после смены turnGeneration получает новый event ID; stale=true остаётся только journal, bridge безусловно forward-ит событие. Безусловный persist также вызывает heartbeat process leases (`dd-agy-daemon.mjs:203,368–371`). Запретить admitting forward известного stale PreToolUse; diagnostic persistence отделить от heartbeat. Успешная semantic mutation после этого через downstream guards не доказана и остаётся R.
- **C, независимо воспроизведено:** child `Pre(step N) → Stop(step N) → delayed Pre(step N)` снимает tree_settled. last_hook хранит только последнее событие, а stale использует строгое `<`. Исправить стабильную delivery identity/order; не менять механически `<` на `<=`, поскольку разные native события одного step могут быть легитимны.
- **C (boundary validation):** missing execution/step допускается и превращает identity одинаковых calls в content dedup. Для participating lifecycle нужны доказанные native call metadata; распространённость такого payload в AGY 1.2.8 требует native fixture.
- Generated hook config имеет outer timeout=30, RPC — свой timeout; отсутствие timeout выше относится именно к внутреннему spawn. Устанавливаются PreToolUse/run_command и Stop, но не PostToolUse. Не рассчитывать на Post как способ закрыть orphan receipt.
- **R:** observeStep приписывает обнаруженным descendants parent=root даже для child step. Проверить native nested topology contract, не объявлять поддержку grandchildren без доказательства.
- Проверить root/child parent proof, same-child continuation, concurrent same-command calls, hook failure before execute, missing step/execution metadata. Если native transport не позволяет однозначно связывать параллельные команды, fail closed и фиксировать limitation; не угадывать по времени.

### Grok / grok-acp

- **P:** native PreToolUse authoritative; ACP mirror observational. `bin/dd-grok.mjs` уже использует invokeNativeHook; updatedInput несёт точный hook-event-id.
- **C для documented payload, native version qualification ещё нужна:** `hooks.ts:701–703` fallback key игнорирует `toolUseId` и `promptId`; bridge лишь добавляет _meta и не нормализует их. Локальная upstream документация `~/.grok/docs/user-guide/10-hooks.md:267,283` описывает именно эти поля. Одинаковая команда разных calls/turns коллидирует без event_id. Документ не version-pinned: закрепить fixture 1.0.40. Использовать daemon/session/native toolUseId и сохранить promptId как turn, не content dedup.
- **C, независимо воспроизведено:** `dd-grok-daemon.mjs:240` кэширует неизвестную session как child единственного root до inspect. Failed inspect оставляет запись, повторный hook.resolve проходит без проверки. Проверять native membership/parent до persist; ошибка не должна создавать admitted cache entry. Возможность принять реальную чужую provider session отдельно не доказана.
- Общий prepare settlement нужен и при explicit hook-event-id: точный ID сам по себе не записывает ранний outcome.
- В отличие от AGY, новый distinct explicit ID не блокируется старым orphan через multiple_live_events: fallback allowlist исключает Grok. При collision возможен reuse старого receipt — другой механизм.
- Helper bounded, но hook.resolve выполняется перед ним. Проверить суммарный deadline resolution+CLI относительно native outer timeout и explicit deny при отказе; не считать subprocess timeout гарантией всего hook.
- Проверки: отдельные native calls одинаковой команды, redelivery одного call, root/child isolation, пустой turn ID, nonzero/ok:false transport errors, corrected fresh retry.

### Droid / droid-cli

- **P:** `lib/dd-droid.mjs::observeHookChecked` проверяет native metadata, cwd/transcript, root/child parent; возвращает native lifecycle envelope с updatedInput.
- **R:** `src/harness-runtime/bin/dd-droid.mjs:29` выдаёт randomUUID на каждую hook delivery. callDaemon не имеет автоматического retry; hook.observe обходит durable dispatch journal (`daemon-operations.mjs:111`). Даже ручное повторение RPC ID не гарантирует однократность activity/usage side effects. Установить native tool-use identity в реальном payload и отделить её от RPC ID. Не сливать два настоящих Execute по command text.
- **C (дублирование/различие контракта):** `DroidRuntime.flow` имеет собственный spawn/JSON parser и timeout, но unbounded output и не проверяет ok:false при exit 0. Используется также usage ingest: переиспользование helper должно сохранить оба response contracts, а не сломать accounting.
- Проверки: metadata admission ещё до root initialization, Task resume того же child, real PostToolUse error, delayed duplicate after generation change, early CLI rejection.
- Уточнение: обычный create устанавливает rootId до initialize response; эта гонка защищена. Проверять отдельно hook до установления rootId. Exact updatedInput event ID защищает от AGY fallback ambiguity, но не от потери early outcome. Fixtures droid-native — fake provider, не доказательство реального native payload.

### OpenCode / opencode

- **C (синтаксический пропуск):** generated plugin в `lib/dd-opencode-daemon.mjs::writePlugin` допускает только `command.includes("dd-flow")`. Это не распознаёт поддержанный shared parser literal `"$DD_FLOW_BIN" …`. Наличие слова в аргументе, наоборот, недостаточно для lifecycle admission. Уточнение после перепроверки: `node …/cli.js` поддержан `continuationCommand` для auxiliary routes, но не обычным lifecycle parser; не расширять lifecycle launcher contract случайно.
- Убрать локальную эвристику: отправлять поддерживаемые shell tool events общему parser, который уже возвращает nonparticipating; либо переиспользовать ровно существующий распознаватель, если это доступно в установленном plugin. Не писать второй shell parser и не import исходники repo из deployed workspace.
- **P:** sessionID/callID/phase дают native identity; сохранять parent proof и response updatedInput. Проверить participating Set для redelivery и missing after; after status completed не должен затереть CLI error.
- Уточнение parent proof: session.get даёт native parent, но plugin допускает отсутствующий data с fallback directory/parent=null; daemon tree membership здесь не доказывается. **R:** missing/foreign session должна fail closed; сохранить downstream Work owner/recovery guards.
- **R:** participating Set keyed только callID, receipt — sessionID+callID+phase. Проверить две sessions с одинаковым callID; минимально использовать scoped key. Set удаляется до успешной after delivery; duplicate before с observed=false не восстанавливает участие. Исправлять как observation delivery, не считать Post источником semantic outcome.
- OpenCode также hook-only: prepare outcome gap общий, но exact rewritten event ID исключает прямой перенос AGY multiple_live_events при исправленном fresh call.
- **C:** generated invoke дублирует unbounded spawn, не имеет собственного timeout и полноценной проверки envelope. Переиспользовать packaged native-hook helper через гарантированный путь; если plugin isolation запрещает import — один shipped hook entrypoint вместо копии реализации. Проверить npm tarball installation.

### Codex / codex-desktop (Luna, Sol, Terra)

- **P:** generic daemon marker, `codex-hook-delivery.ts` проверяет owning daemon/root/session/toolCall и активный native hook; prepare **внутри awaitLifecycleInvocation** проходит settlement/retry. Это не end-to-end защита всех ранних guards.
- **C:** parseOutputOptions отдельным return обходит ledger; alias validation предшествует observedLifecycleInvocation. Даже при найденном hook early catch не завершает observed assignment, который может остаться live и подавлять causal error. Fix — общий outer settlement существующего trusted assignment + hook, без нового Codex retry.
- **C:** --response-file удаляется из output.args, но не из native signature; early catch восстанавливает command без него, поэтому уникальный native event не находится. Исправить согласованное представление argv, а не ослаблять native identity.
- Legacy/unmanaged Codex hook-only наследует prepare gap. Его fallback `hooks.ts:1906–1915` не включает agent_id; разные siblings без explicit native ID с одинаковым root/turn/command коллидируют. Современный managed path требует verified toolCallId и от этого защищён; частота missing-ID payload — native contract R.
- **R:** missing turnId с обеих сторон проходит active proof; уникальность native hook/tool IDs и transcript-first-line readiness требуют pinned fixtures. Сохранить fail-closed поведение после completed turn/wrong session. Не расширять совместимость guessing-ом.
- Проверить public и retained/legacy команды, отказы до awaitLifecycleInvocation (aliases/route/response), delayed receipt, two callers/one assignment, child resume, parent/child одинаковые команды. Сохранить proof, assignment fencing, no replay of unknown effect.
- Hook-only compatibility path и auxiliary continuation должны проходить те же общие regressions. Для разных model profiles достаточно общего transport contract и профильной qualification при различии native поведения.

### ZCode / zcode-acp

- **P:** public native pre hook и tracked-session daemon identity связывают toolCall/session, observer создаёт invocation; prepare внутри await защищён. ACP **public** mirror уже исключён из authoritative path. Не возвращать двойную регистрацию, исправленную планом 048.
- Разделять три пути: public synchronous native; legacy explicit invocation-ID через asynchronous ACP rendezvous (native handler намеренно skips); hook-only/auxiliary. Native before precedes CLI только в первом. Legacy retained/replay/CAS уже защищены соответствующим контрактом.
- **C:** guards до await и hook-only/auxiliary остаются в общем early settlement gap. В проверенном ZCode launcher общий DD_FLOW_DAEMON_ID не выставлен; нельзя полагаться на daemon-only catch, хотя managed invocation scope присутствует.
- **R:** hook.resolve проверяет tracked session ancestry, но не активный toolCall/command/turn, в отличие от Codex active proof. Проверить delayed native delivery, concurrent children и same-child next turn; не объявлять доказанный execution bypass без воспроизведения.
- **R/qualification:** выяснить владельца native hook installation в fresh installed tuple и проверить фактическую доставку. Отсутствие настройки в dd-flow-cli само по себе не доказывает, что её нет во внешней упряжке. Проверить native toolCall uniqueness для ACP owner-map; nested children не входят автоматически в квалифицированный root/concurrent_children/child_continuation contract.
- При qualification закрепить реальные версии upstream, dd-zcode adapter, bridge commit и harness contract. Не обновлять fork и live engine как побочный эффект этого плана; координировать с отдельной работой по адаптеру.

## 6. Последовательность реализации и минимальный рефакторинг

### WP0 — зафиксировать регрессии и границы

- [ ] Сверить baseline/merged fixes; сохранить sanitized minimal fixture CP-133: observed receipt → invalid schema → corrected different native call. Не копировать live DB как тестовый writable state.
- [ ] Воспроизвести внешний runCli путь, не только вручную вызванный observer. Assert: первый outcome отсутствует на старом коде; второй вызов блокируется; причинная ошибка теряется.
- [ ] Для каждого R из матрицы написать минимальный counterexample; зафиксировать confirmed / already protected / unsupported contract. Закрывать неподтверждённые риски проверкой, без speculative production change.

### WP1 — ранний settlement в существующей CLI границе

- [ ] Выделить минимальный общий resolver существующего trusted diagnostic anchor из observeCommandHook/observedLifecycleNativeEvent. При explicit ID проверять scope и command; fallback использовать только в текущих разрешённых transports и только однозначно.
- [ ] Подключить error settlement до/вокруг prepare и ранних guards, не нарушая prepare-before-execute. Переиспользовать observeLifecycleCommand/существующий outcome writer. Не включать DD_FLOW_DAEMON_ID для всех harnesses механически: это сейчас включает другой admission contract.
- [ ] Учесть отдельный early return parseOutputOptions (`run-cli.ts:313–317`), который сейчас обходит общий catch. Existing diagnostic anchor не должен требовать успешно разобранного malformed output option; при недостатке доказательств — uncorrelated diagnostic без claim.
- [ ] Сохранить raw/native presentation argv для correlation и согласовать response-file stripping/signature. Early отказ с известным trusted assignment завершает assignment, а не только hook; никаких abandoned observed rows и ложного active-successor suppression.
- [ ] Проверить routes без lifecycleMatchKey (session register, merge apply/repair) и auxiliary commands: текущий observeCommandHook возвращает до установки anchor. Использовать exact native diagnostic binding, не выдумывать coarse authority key.
- [ ] При correctable no_effect записывать outcome, disposition и разрешённый путь исправления; retry_command выдаётся runtime там, где он владеет назначением. На hook-only пути повтор — новый native call, не старый event ID. Не требовать от модели создавать identity.
- [ ] Не проглатывать anchor ambiguity. Если нельзя безопасно привязать ошибку, сохранить causal diagnostic без чужого claim. Зафиксировать secondary persistence error, не подменяя primary.
- [ ] Prepared inputs не читать заново; routed parent не settle одновременно с child engine. При сбое response write после commit сохранять committed/unknown и запрет продуктивного повторения.

### WP2 — controller получает одну причинную картину

- [ ] Расширить существующий currentLifecycleFailure либо его используемый resolver, чтобы понимать scoped invocation **и** hook outcomes/diagnostics. Использовать в fanout none и repeated continuation, не поддерживать два расходящихся фильтра.
- [ ] Заменить operation-only latest map в continuation-outcome на existing target identity: Work/Stage + attempt/cycle + session/assignment linkage. Доказать regression с двумя sibling Work, один failed, другой success.
- [ ] Сохранить causal code/phase/effect/receipt reference; incomplete_subject_turn только fallback при отсутствии причины. Correctable failure после успешного causal successor не terminal; unrelated success не скрывает failure.
- [ ] Сохранить repair_required с durable repair receipt как continuation, не failure. Unknown effect и storage diagnostic не auto-retry.

### WP3 — adapter-specific corrections

- [ ] AGY: shared bounded hook invocation; подтверждённые stale forwarding, generation replay, lease heartbeat и equal-step child reopening; достаточность native metadata.
- [ ] Grok: native call identity/turn normalization; admission-before-cache в hook.resolve и общий hook deadline.
- [ ] Droid: stable native delivery identity отдельно от RPC ID; shared envelope validation с сохранением usage contract.
- [ ] OpenCode: shared command recognition и packaged bounded invocation; native hook schema compatibility.
- [ ] OpenCode: scoped participation bookkeeping, session.get error handling и observational after retry. Тестировать исполнение generated plugin вместо regex на текст `participating.add`.
- [ ] Codex/ZCode: regressions и только подтверждённые остаточные fixes; сохранить authoritative native path.
- [ ] Из repeated claim helpers выносить только реально одинаковую query/scope/CAS часть, если она нужна WP1. Не объединять разные semantic validations в generic engine. Отдельный массовый cleanup не нужен.

### WP4 — один достоверный draft вместо повторного конструирования

- [ ] PROTOCOLIZE prompt использует тот же populated resultTemplate(input.obligations), что файл, либо ссылается на файл без второй расходящейся формы. Модель меняет semantic member assignment, не переписывает obligation IDs/ключи.
- [ ] Канон `dd-memorybank/.memory-bank/dd-flow/vnext/protocolize.md`: убрать требование восстановить уже заполненный ownership; сохранить JSON-file workflow и finish как единственную authoritative validation.
- [ ] Проверить producers остальных стадий: SPECIFY; PLAN (сохранить existing deterministic source_refs); PLAN-REVIEW; CODE (не выдавать строку `passed | needs_repair | blocked` за допустимое enum значение готового JSON); CODE-REVIEW; MERGE (не вернуть runtime IDs в payload).
- [ ] Тестировать совпадение форм/детерминированных полей; заполненный representative example валидировать schema. Незавершённый semantic draft не обязан проходить полную schema до работы модели; явно различать draft и valid example.
- [ ] Не добавлять универсальный JSON-schema form generator, новый prompt framework или отдельный model-driven syntax repair.

## 7. Проверки и критерии приёмки

Использовать существующие Vitest/Node fixtures: `run-cli-admission.test.ts`, `lifecycle-invocations.test.ts`, `stage-lifecycle-ownership.test.ts`, `repair-continuation.test.ts`, `codex-hook-delivery.test.ts`, `zcode-invocation-observer.test.ts`, `agy-state-boundaries.test.ts`, `harness-runtime-assets.test.ts`, `native-adapter-contracts.test.ts` и его fixtures. Дополнять подходящие suites; не создавать по framework на harness.

Обязательные свойства:

1. AGY non-invocation schema rejection → durable no_effect outcome → новый hook → corrected finish без ambiguity; controller видит исходную причину, если исправления нет.
2. Все route families: prepare отказ не вызывает semantic mutation; существующий receipt получает outcome. Manual invalid CLI не создаёт runtime home. Read-only status ничего не лечит.
3. Missing files, malformed JSON, aliases/unknown flags, compatibility/response errors: сохранены code/phase/effect и правильная retry policy.
4. Same native call redelivery идемпотентна; distinct same-command calls не сливаются; genuinely ambiguous fallback fail closed. Зафиксировать immutable command semantics: same ID с изменённым target/result-file/semantic input не должен менять назначение; runtime-added flags нормализуются отдельно. Это новый требуемый контракт, не уже существующая защита: assertHookEventReplay сравнивает coarse identity/match_key, а runtime-cutover.test.ts:45–61 сейчас допускает appended shell tail. Пересмотреть этот тест осознанно, сохранив observational-only поведение unsupported composition и не допуская её execution.
5. Cross-project/root/child/session/generation/stage/attempt/cycle mismatch rejected; stale AGY hook не возобновляет activity/admission; concurrent children не claim друг друга.
6. Same target causal successor suppresses rejected predecessor; sibling success не подавляет failure; зарегистрированный repair ведёт к verification без ложного terminal error.
7. Crash/failure between receipt, prepare, claim, commit, outcome persistence, response publication: no double execute, no unknown→no_effect downgrade; bounded hook failure, malformed/ok:false envelopes fail closed; output caps/timeout не оставляют незавершённый caller.
8. OpenCode literal DD_FLOW_BIN, quoted dd-flow paths и irrelevant commands доходят до правильной shared classification; node cli.js отдельно проверяется на существующем auxiliary contract. No shell parser duplication; unsupported launchers/composition не становятся разрешёнными как побочный эффект.
9. Populated PROTOCOLIZE ownership одинаков в файле/prompt; exact obligation IDs сохранены. Другие stage templates сохраняют schema field names и ownership boundary.
10. Published-package installation: helper доступен generated plugin/adapter вне checkout; exact canon/engine tuple и checksum подтверждены.

Матрица — не декартово произведение всех harnesses/routes/errors. Общий contract покрывается table-driven tests; adapters проверяют extraction/identity/order/envelope; end-to-end fixture покрывает связную цепочку CP-133. Native qualification отдельно доказывает реальные payload и capability каждого изменённого transport.

## 8. Release и новая квалификация (после реализации)

- [ ] Локальные fast contracts → affected runtime/integration suites → требуемый полный release gate для изменений общих lifecycle механизмов. Ночной PASS не замена.
- [ ] Отдельные reviewable commits: common settlement/controller; adapters; drafts/canon; qualification/runbooks. Commit/push/release выполняются только в реализации, не этим документом.
- [ ] Если меняется canon — согласованный canon release/pin, затем неизменяемый проверенный engine package. Проверить git tag, build-info, dist-tag, tarball и installed full-content checksum.
- [ ] Изолированные native qualification probes всех затронутых harnesses: root lifecycle, bad JSON → correction, exact retry/redelivery, parallel children и same-child continuation где supported. Недостающую capability пометить unsupported, не утверждать PASS по mock.
- [ ] Новый AGY checkpoint: unchanged source/flow/memory-bank inputs кроме явно релизованного canon/engine изменения; portable config/resources без runtime DB/runs. Записать отличие tuple. Preflight PASS обязателен до scored E2E.
- [ ] Остальные harnesses: квалификация их изменённых путей обязательна; clean scored runs по согласованной матрице/capacity. Не заменять версии уже запущенных EVAL.
- [ ] Monitoring: actual RUN timeline/controller stage, Work graph, fresh native content/tool events, lease/process liveness, pause/answer consistency, lifecycle outcomes. Native success ≠ stage success. Runtime failure — read-only расследование, без автоматического ремонта.

## 9. Ponytail review и готовность

Проверка плана: системный фикс остаётся в существующих CLI settlement, hook matcher и controller cause resolver. Adapter fixes адресуют разные реальные границы и не подменяются одним сомнительным флагом. Новые таблицы, services, polling/retry loops, arbitrary latest-event heuristic, universal adapter framework и schema generator не нужны. Новых зависимостей не требуется.

Уточнения после расширения аудита: добавлены все шесть transports, identity/redelivery risks Grok/Droid, OpenCode command-filter gap, AGY stale-forwarding/transport envelope, sibling-target isolation controller, routed writer/unknown-effect ограничения и schema/draft consistency остальных стадий. Codex/ZCode описаны как защищённые managed paths с обязательными regression checks, а не как доказанно сломанные.

План расширен WP5–WP8 ниже; готов к реализации начиная с регрессий WP0/WP5. Закрытие R-пунктов требует воспроизведения и native contract evidence; заранее обещать отсутствие всех дефектов или успешную native qualification нельзя. Условие полного завершения: каждый пункт имеет diff+test либо доказанный no-change verdict; package/native checks и новые AGY/Grok scored E2E записаны отдельно. До этих проверок статус не менять на implemented/qualified.

## 10. Фокусные аудиты субагентов и независимая перепроверка

По запросу пользователя проведены шесть отдельных фокусных заданий: AGY, Grok, Droid, OpenCode, Codex, ZCode. Выполнены двумя волнами; завершившие первую волну агенты получили отдельный scope второй. Все работали read-only, без provider runs и изменений live EVAL. Их выводы не принимались автоматически.

Главный агент независимо перепроверил:

| Находка | Перепроверка | Вердикт |
|---|---|---|
| Общий prepare/output parsing gap | run-cli.ts:313–317,415–418,460–495; lifecycle-invocations.ts:802–824 | Подтверждён порядок; добавить raw argv и assignment settlement |
| Потеря hook-only cause и sibling target | lifecycle-invocations.ts:317–355,919–944; continuation-outcome.ts:15–17; run-controller.ts:572 | Подтверждено; fatal hooks уже читаются assertLifecycleOutcomes, прежнее широкое обобщение исключено |
| AGY generation/stale forwarding | Memory-only Runtime: identical payload, generation 1→2, step floor; persist/journal stubbed | Разные event IDs, stale journal=true, response без stale; воспроизведено |
| AGY equal-step child reopening | Memory-only Runtime: Pre→Stop→same Pre; tree_settled true→false | Воспроизведено, не native incident claim |
| AGY stale lease renewal | dd-agy-daemon.mjs:203,368–371 | Безусловный persist heartbeat проверен по коду; live lease не менялся |
| Grok failed identity cache | Memory-only Runtime/mock bridge: inspect throws, второй hook.resolve | Непроверенная session остаётся в sessions; повтор проходит без inspect, воспроизведено |
| Grok native key | hooks.ts:701–703; bridge payload forwarding; local upstream docs:267,283 | Documented-shape collision; нужен pinned native fixture |
| Droid RPC/envelope | dd-droid.mjs:387–425; bin/dd-droid.mjs:29–32; daemon-operations.mjs:111 | Нет durable hook RPC dedup; exact event rewrite не равно early settlement |
| OpenCode filter/transport | generated source dd-opencode-daemon.mjs:37; lifecycle-command.ts:48–64,171 | Literal launcher gap и envelope/bounds gap подтверждены; обычный node lifecycle не добавлять |
| Replay changed payload | hooks.ts:1870–1889; runtime-cutover.test.ts:45–61 | Текущая защита coarse; tightened semantic replay contract требует изменения теста |
| Codex protected boundary | dd-codex.mjs:145–166; run-cli.ts:356,488,625–634 | Active proof сохранить; early guards/output signature исправить общим путём |
| ZCode public/legacy distinction | hooks.ts:575–630; bin/dd-zcode.mjs:42–46; daemon:427–431 | ACP legacy intentional; tracked identity не равна Codex active-call proof |

Коррекции после ревью: не переносить AGY multiple_live_events на exact-ID Grok/Droid/OpenCode; не считать все Codex/ZCode early refusals защищёнными; не считать Post событие semantic settlement; не обещать full command replay immutability по старому тесту; не выдавать отсутствие hook wiring в одном repo за доказанный upstream дефект. Дополнительные native-risk проверки включены в WP0/WP3/qualification, а не потеряны и не объявлены уже исправленными.

Проверки этого исследования: чтение кода и существующих тестов, три изолированных memory-only counterexamples главным агентом; AGY/Codex агенты также выполнили pure checks. Полный test suite и native qualification сейчас не выполнялись: production fixes ещё не реализованы.

## 11. Дополнение: CP-132 Grok HITL и provider settlement

Дополнение от 2026-09-22; baseline тот же `c1017bf64843d6979b9dee222dc0831baff6ad0a`. Номера строк ниже — ориентиры этого baseline, символы/функции важнее номеров. Это продолжение 049, не новый параллельный план. Старые WP0–WP4 и результаты аудита сохраняются.

### 11.1. Доказанный инцидент и разграничение причин

EVAL `EVAL-20260922074953-449265a0`, CP-132 Grok 1.0.40, engine beta.95. Evidence root: `/Users/deksden/.dd-eval/qualification/cp-132-grok/runs/EVAL-20260922074953-449265a0/executions/e2e/dd-flow-home`; controller `DRV-d64dab87-1479-4858-b07f-89cb388a12a3`, native session `01a0c818-c8b4-7530-89b6-3937f5e87877`.

- 07:53:57 UTC — SPECIFY pause `HITL-001`.
- 07:54:09 — native `end_turn`, children пусты, но operation `87992d1e-efde-4102-9d92-029fa72f790b` (с controller prefix) получает `completed` + `settled=false`, settlement `pending/tree_unsettled`.
- 07:54:41 — ответ принят для того же pause; его `:prompt:0` dispatch записан, но native delivery не произошла: только requested.json, без terminal result. Единственный Grok provider slot удерживается предыдущей операцией.
- В daemon state уже есть native `end_turn` receipt, `active_operation=null`, но `active_tree=true`. Воспроизведение на pinned adapter и HEAD: productive возвращает false, немедленный treeRunning на тех же данных — false (дерево уже признаётся idle).

Причинная цепь: Grok вычисляет settlement до записи native terminal receipt → common bookkeeping правильно сохраняет capacity при false → controller пропускает reconciliation для tree_unsettled → HITL prompt ждёт собственный predecessor slot до входа в adapter.requireSettled. Это не модель, проигнорировавшая ответ, не повторный HITL и не `controller_answer_not_applied`: проверка применения ещё не достигнута. Просроченный observer lease сам по себе не доказан первопричиной.

### 11.2. Дополнительные обязательные инварианты

1. Отдельны: native terminal outcome; whole-tree settlement; release provider capacity; публикация ответа/применение semantic lifecycle команды. Ни один факт не заменяет остальные.
2. Completed + pending допустим при живых children или недоступном наблюдении. Нельзя превращать это ни в автоматический failure, ни в разрешение следующего conflicting prompt.
3. Перед новым продуктивным вызовом той же сессии незавершённый settlement predecessor должен получить reconciliation либо явный blocker. Нельзя ждать capacity, если единственный способ её освободить оказался за тем же ожиданием.
4. `session.inspect` в managed adapter может выполнять budget reconciliation; это не команда для read-only мониторинга инцидента. `runner status`/чтение journal не должны лечить состояние. Некоторые native inspect могут materialize session: не обещать их абсолютную read-only семантику.
5. Fresh observation освобождает только заранее снятый набор terminal operation IDs того же daemon/session/owner. Не освобождать новый turn, другой root или unknown operation; не использовать TTL, увеличение concurrency, удаление claim либо native prompt replay как лечение.
6. Асинхронная запись/usage/hook обработка не должна публиковать settled=true, если доказательство инвалидировано новой activity до commit/resolve. Snapshot resource IDs защищает от освобождения новой операции, но не заменяет свежесть native tree evidence.

### 11.3. Общая карта вызовов и consumers

| Граница | Проверенные места | Доработка |
|---|---|---|
| Provider dispatch/journal | `harness-runtime/lib/daemon-operations.mjs`: productive set, durableDaemonDispatch, journalDispatch, settleDaemonOperation | Сохранить requested-before-admission и exclusive terminal slot; классификация resume по фактическому эффекту; не терять terminal при поздней observation error |
| Budget reconciliation | `managed-daemon.mjs`: assertDaemonOwnership, completeBudgetOperation, budgetObservationScope, releaseBudgetObservation | Не новая система settlement: использовать существующие evidence/release helpers; диагностировать self-owned predecessor; не повторять бесконечно settle старого false receipt без fresh inspect |
| Capacity authority | `services/runtime-budget.ts`: reserve/acquireProviderTurn, releaseProviderTurns | Сохранить exact process/lease/op/session fencing; добавить причинные сведения о blocking predecessor при необходимости, не менять limit semantics |
| Controller adapter | `run-controller-adapter.ts`: awaitSettlement, controllerAdapter | Ранний выход tree_unsettled сохраняет outcome, но не должен отменять барьер перед следующим productive dispatch |
| Все controller continuations | `run-controller.ts`: prompt/call, HITL answer, stage entry, fanout continuation, terminal/stop settle | Барьер в общей границе, не только строка HITL; parent с live children должен сохранять возможность наблюдения/управления children |
| Recovery | `run-controller-recovery.ts`: retained daemon close, resume, acknowledgement prompt | Не обходить новую проверку; сохранить clean-owner replacement и generation-bound accepted intent; resume не использовать вместо inspect для освобождения собственного слота |
| Failed/unknown dispatch | `operation-errors.mjs`, daemon journal catch, controller recovery/control drain | Failed terminal тоже может удерживать slot: release только после fresh settled proof; unknown outcome — inspect/stop barrier, никогда replay |
| EVAL projections | dd-eval `lib/daemon-operations.mjs`, `runner.mjs::runnerStatus/runnerControlStatus`, `execution-state.mjs`, `eval-resume-worker.mjs` | Read-only representation outcome/settlement/admission/HITL delivery; runtime остаётся владельцем reconciliation, не копировать его алгоритм в runner |

Отдельно проверить различие transport aliases: общий список считает resume продуктивным, хотя Grok/Codex runtime реализуют его как inspect; Droid при уже loaded session наблюдает, при closed session загружает provider. Не переименовывать глобально все resume в inspect. Предпочтительно controller reconciliation всегда вызывает явный inspect; локальное устранение admission у чисто observational alias допускается только с тестом CLI+daemon контракта.

## 12. Дополнительный аудит settlement по каждой упряжке

Каждой из шести упряжек выдан отдельный фокусный scope субагенту, задания выполнены двумя волнами. C/R/P имеют тот же смысл, что в §5. Подтверждённый code-path дефект не означает, что он произошёл в текущем EVAL.

| Упряжка | Результат независимого review | Минимальное действие |
|---|---|---|
| Grok | **C:** productive `dd-grok-daemon.mjs:236` вычисляет treeRunning до terminal receipt; очищает receipts всех sessions. Archive `:246` тоже очищает proof, хотя его result не содержит native tree evidence. Создание второго root теряет proof первого. Главный агент повторил все три memory-only checks. | Записать proof до derivation; invalidation только фактического native target; archive не продуктивный native turn. Развернуть перегруженную строку в читаемую локальную последовательность; не generic Runtime framework. |
| Grok aliases/cancel/fork | **C boundary:** resume=inspect попадает в productive admission. Fork result не содержит topology, поэтому одно переставление строк не делает его settled. Cancel helper требует явный status, daemon fallback умеет terminal receipt. | Разделять creation receipt и tree proof; единая локальная оценка root/tree при доступном daemon evidence; неизвестная topology остаётся pending. Проверить alias под capacity=1. |
| AGY | **C:** `finishTurn:284–288` после root SUCCESS обновляет поздний child terminal и возвращается; receipt уже settled, но root promise остаётся pending. **C:** `:300–315` сохраняет captured settled receipt через await; новая child activity делает его ложным. Оба случая независимо воспроизведены главным агентом в памяти. Аналогичный capture/resolve в `observeHook:368–371`. | Один локальный completion helper для root result, child terminal и Stop; согласованные active/state/proof; проверка activity/generation после await до resolve. Не снимать active до завершённого commit. |
| Droid | **C code path:** `dd-droid.mjs::recoverOperation:315–341` находит exact native terminal, но при !settled возвращает null до сохранения outcome; inactivity caller выдаёт subject_liveness_timeout. Normal prompt `:303–309` уже разделяет outcome/observation и служит образцом. Главный агент проверил обе ветви. | Сохранить terminal независимо от живых children/inspection failure, оставить capacity pending; original active dispatcher — единственный writer. Не превращать ERROR в success; сохранить native outcome reason. |
| ZCode | **C boundary:** после native session/prompt terminal (`dd-zcode.mjs:846`) flush/inspect (`:862–863`) могут бросить до возврата receipt; общий journal получает error без отдельного terminal evidence. **R:** completed_turns=0 shortcut после failed post-turn observation; active_tree summary отражает один root, не все. | Сохранить native terminal и отдельно observation/authority error; не проглатывать fatal lifecycle hook failure как успешный turn. Failure-injection для first-turn shortcut/multi-root, менять production только при доказанном нарушении consumer. |
| Codex | **P:** native result не выдаёт root terminal за tree settlement; daemon снимает active перед common fresh inspect, tree observer обходит children, cancel требует наблюдения. **R:** несколько session inspections последовательны без activity revision. | Общие barrier/regression fixes; проверить activity во время inspect. Нет доказательств необходимости переписывать Codex adapter или отдельные Luna/Sol/Terra implementations. |
| OpenCode | **C:** daemon.stop `dd-opencode-daemon.mjs:162–174` возвращает clean до physical shutdown (`:178–193`); durable ledger уже получает success. Внешний stopDaemon дополнительно ждёт socket closure — это защита CLI, но не достоверность раннего durable receipt. **C:** fetch reset после возможного POST превращается в opencode_unavailable (`dd-opencode.mjs:21–24`), которого нет в observation-loss classification. **C:** productive catch `:87` может заменить primary error ошибкой persist/journal. Главный агент проверил последовательность. | Physical provider barrier до durable clean success; network uncertainty после dispatch сохраняется unknown без re-prompt; primary/secondary ошибки раздельно. Сохранить существующее удержание native reply при post-success describe failure. |

OpenCode **R**, не автоматические production fixes: sparse `/session/status` может законно опускать idle sessions, но malformed/null responses не должны становиться idle proof; concurrent inspect без active guard, child discovery/status snapshots и multi-root active_tree summary требуют interleaving/native-contract fixtures. Stop уже обходит все sessions: неверный summary сам по себе не доказательство unsafe stop. ZCode multi-root summary трактовать аналогично.

Общие failed-operation gaps и pending-follow-up применимы ко всем consumers shared dispatch, но воспроизведённый live self-block в этом дополнении — только CP-132. Сохранить ZCode physical stop/residency guards, Codex native topology checks, AGY clean-retained recovery, Droid exact turn binding.

## 13. Дополнительные work packages и порядок выполнения

### WP5 — regression evidence и Grok root cause

- [ ] Добавить sanitized CP-132 fixture: end_turn/no status/empty children → accepted same-pause answer → capacity=1. На старом коде доказать self-block без запуска модели; bounded test не должен сам зависать.
- [ ] Grok: proof-before-derivation; per-target invalidation; archive сохраняет proof; второй create/fork не инвалидирует прежний root. Не объявлять fork settled без native topology.
- [ ] Проверить create/prompt/fork/resume/archive/inspect/cancel/stop через реальные adapter entrypoints в fake-provider fixtures, не только вызов private метода; pure counterexamples оставить как быстрые регрессии где полезно.
- [ ] Проверить сохранение receipt при persist failure: outcome unknown не превращается в безопасный repeat; отмена/fence между reservation и dispatch запрещает новую native работу.

### WP6 — общий settlement barrier и диагностируемая admission

- [ ] Расширить существующую controllerAdapter/awaitSettlement границу минимальным общим helper для reconciliation predecessor. Сначала tests всех productive callers из §11.3; ни отдельного HITL retry, ни отдельного алгоритма в recovery/runner.
- [ ] Bookkeeping failure → same-operation settle; tree_unsettled → fresh scoped inspect. Completed result/assistant text сохранить; snapshot terminal IDs делать до observation существующим budgetObservationScope.
- [ ] При живых children вернуть контроллеру наблюдаемое ожидание, не заблокировать fanout orchestration глобальным ожиданием всего дерева. Перед следующим conflicting root prompt проверить prior settlement снова. Stop/cancel должны прерывать очередь через существующий generation guard.
- [ ] Для внешних adapter callers исключить бесконечный self-owned predecessor wait на общей admission границе: причинный settlement-required result/error с exact blocker, либо тот же evidence-based reconciliation там, где callback уже доступен. При реализации выбрать один owner reconciliation; не дублировать polling в controller и daemon. Обычная очередь за другой живой сессией остаётся допустимой.
- [ ] Failed terminal result не освобождает slot автоматически; fresh inspect с exact failed op может это сделать. Unknown/observation-lost не разрешает новый productive request. Сохранить single writer/exclusive terminal record.
- [ ] Уточнить observational resume aliases без снятия admission с реально materializing операций. Recovery clean daemon path сохранить.

### WP7 — локальные completion/outcome fixes остальных adapters

- [ ] AGY: объединить только реально повторяющуюся pending-terminal completion часть finishTurn/Stop/child-result; локальная activity revision либо существующая serialization с recheck предотвращает stale proof через await. Не вводить общий state-machine engine для шести transports.
- [ ] Droid: recoverOperation переиспользует normal prompt outcome+pending shape; обновить тест, который сейчас требует settled tree для восстановления известного root outcome.
- [ ] ZCode: retained terminal evidence отделить от post-turn observation/flush failures; lifecycle authority error остаётся primary. Zero successfully-recorded turns не эквивалентно never-dispatched: counterexample определяет необходимый минимальный guard.
- [ ] OpenCode: physical provider termination/ownership finalization предшествует durable clean stop receipt; socket/server teardown после ответа остаётся отдельной идемпотентной фазой, не допустить deadlock server.close на текущем соединении. Cleanup failure не replay-ится как clean success.
- [ ] OpenCode: различать known HTTP rejection и потерю ответа после потенциально принятого POST; не добавлять все opencode_unavailable в generic allowlist без phase/effect проверки. Fault fixture accepted POST → connection reset сохраняет unknown и capacity. Не повторять create/prompt/fork.
- [ ] OpenCode: primary error переживает secondary persist/journal failure; при native terminal отдельно сохранять evidence и uncertainty записи. Проверить sparse-status native contract, malformed topology и concurrent inspect до изменения idle semantics.
- [ ] Codex и прочие R-пункты: failure-injection/interleaving сначала, production fix только при подтверждённой некорректной границе. Не объявлять последовательное наблюдение atomic snapshot.
- [ ] Проверить failure после native terminal до adapter return, после journal terminal до release, после release до response и при restart. Replay того же operation ID никогда не отправляет prompt снова.

### WP8 — наблюдаемость, release и новая квалификация

- [ ] Статус различает HITL answer accepted, admission queued, native dispatched, terminal outcome, settlement pending/settled и semantic answer applied. Использовать existing records/events и stable IDs, не новую БД состояния HITL.
- [ ] Read-only status показывает blocking operation/session, последний durable event и границы неизвестности; никакого session.inspect/settle из monitoring. Исправить misleading waiting_for_user при уже принятом ответе через projection/reason, сохранив совместимость consumers.
- [ ] Дополнить `runbooks/e2e-monitoring.md` и Grok/AGY runbooks: process alive ≠ progress; accepted ≠ delivered; terminal root ≠ settled tree. Исправить комментарий prompt wrapper, что settlement якобы всегда joined.
- [ ] Выполнить release из §8 после всех обязательных WP, включая common budget/recovery suites. Новый чистый Grok EVAL обязателен наряду с AGY; published exact tuple, capacity=1 и preflight PASS. Не чинить старые CP-132/133 или переносить их runtime state.
- [ ] Для остальных изменённых transports native smoke: два последовательных turn, children/continuation где поддержаны, cancel/settlement; scored E2E по согласованной матрице. Отсутствие capability/evidence — explicit limitation, не фиктивный PASS.

Порядок: WP0 + WP5 regression → WP5 Grok + WP6 common barrier → WP1/WP2 lifecycle fixes и WP3/WP7 adapter corrections → WP4 drafts/canon → общие интеграции → WP8/§8 release и qualification. Независимые локальные работы допустимы параллельно; общий admission/outcome contract принадлежит одному исполнителю, чтобы не получить два reconciliation loops.

## 14. Settlement acceptance matrix и итог Ponytail review

Расширять существующие `test/fixtures/grok-daemon.mjs`, `agy-adapter.mjs`, `droid-adapter.mjs`, `zcode-adapter.mjs`, `zcode-daemon.mjs`, `codex-adapter.mjs`, `opencode-adapter.mjs`, `daemon-operations.mjs`, `session-settlement.mjs`, `run-controller-adapter.test.ts`, `run-controller*.test.ts`, `runtime-budget.test.ts`, `harness-runtime-assets.test.ts`; точные fixture filenames сверить перед patch. Не создавать новый тестовый framework.

| Сценарий | Обязательное утверждение |
|---|---|
| Missing status + native end_turn/cancelled + authoritative empty children | Согласованные daemon state/receipt; слот освобождён по same-op proof |
| Child running, topology missing/error, root terminal | Outcome сохранён; settled не true; никакого принудительного release |
| Последний child завершился после root | Pending root promise разрешается ровно один раз; child ERROR не скрыт как semantic success |
| Activity/новый child во время await persistence/inspection | Старый settled snapshot не публикуется как актуальное доказательство |
| Capacity=1, accepted HITL и следующий stage/fanout prompt | Reconcile predecessor до admission; один native prompt, тот же pause/answer checksum |
| Старый false receipt, native теперь idle | Fresh inspect releases scoped predecessor без повторного productive вызова |
| Another session alive / unknown prior operation | Корректная очередь/explicit blocker; не чужое освобождение и не auto-replay |
| Новая операция появляется после observation scope snapshot | Старое наблюдение не освобождает новый slot; stale generation/lease rejected |
| Cancel/stop во время admission/reconciliation | Queue fenced, no late native dispatch; existing stop barrier обязателен |
| Post-terminal observation failure / journal or release storage failure | Native outcome не теряется, primary error не подменяется, settlement отдельно |
| Grok archive/create2/fork; resume aliases | Proof unaffected у unrelated roots; observational path не требует собственного занятого productive slot |
| Process crash/replay | Нет double prompt, unknown не превращается в no_effect; exact terminal retained |
| OpenCode accepted POST → reset; logical idle → failed physical stop | Первый случай unknown, не provider failure; второй не публикует durable clean success |
| Status/monitor | Никаких writes/reconciliation; accepted/queued/delivered видны раздельно |

Перепроверка главным агентом: Grok три memory-only assertions; AGY late-child и stale-proof через gated persist assertions; прямое чтение Droid recovery/normal prompt, ZCode terminal→flush/inspect и first-turn guard, Codex tree observer, OpenCode HTTP error classification и stop→journal→physical shutdown, shared journal/budget/controller/recovery и dd-eval status consumers. Результаты агентов не приняты как доказательство live incidents: static risks и native qualification остаются отдельными. Все шесть отдельных scopes завершены; «вся кодовая база» здесь означает систематический поиск данного класса по producers/callers/consumers, а не доказательство отсутствия любых иных ошибок.

Ponytail: сохраняем четыре существующие границы — native adapter evidence, durable operation journal, managed budget release, controller continuation. Общие helper нужны только для predecessor reconciliation и уже повторяющегося local completion; новые ledger/table/daemon/scheduler/dependency не нужны. Не объединять semantic rejection settlement из WP1 с physical tree settlement в один boolean. Не ослаблять matcher/leases/capacity ради зелёного теста. Оптимизация тестового suite вне этого плана.

Definition of ready: все C имеют целевой участок и failing regression; каждый R имеет конкретный проверочный сценарий и no-change вариант; все шесть transports и shared consumers представлены. Definition of done: checklist WP0–WP8 закрыт diff+tests либо доказанным no-change, published package и clean native/EVAL evidence записаны. Это план, не заявление о реализации: production code и live EVAL этим дополнением не менялись.
