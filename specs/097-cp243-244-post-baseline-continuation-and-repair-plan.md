# 097 — CP243/244: надёжные continuations, repair и native settlement

Дата: 2026-10-22. Статус: внутренние исправления реализованы; результаты проверки
и внешнее ограничение P7 — в `097-implementation-report.md`. Новые EVAL не запускались.
Основание: расследование пяти CP243/244 E2E и аудит аналогичных producers,
consumers и переходов. Дополняет 096, не переписывает исторические результаты.

## 1. Цель, границы и исходные версии

Цель — доказанная исправимая ошибка candidate получает штатный repair; после
repair controller выдаёт актуальную authority; принятое HITL-решение не теряется
для агента при overload; неизвестное состояние остаётся явно неизвестным.
Это необходимые условия полного E2E, не обещание безошибочности модели/провайдера.

- Меняем только engine/flow, harness adapters, тестовый tooling и EVAL diagnostics.
- Не исправляем вручную продукт, locator/matcher или ожидания в scored RUN.
  Их чинит Subject через repair; качество его работы оценивает Judge.
- Не изменяем historical receipts, runtime DB, baseline, snapshots, Sessions.
- Не отключаем assignment/ownership/path/hash/epoch/settlement guards.
- Не добавляем общий timeout, автоматический replay unknown effects или repair
  любого TypeError/timeout. Продолжение — только в разрешённой текущей Session.
- Не запускаем GitHub CI, новые scored EVAL или платную квалификацию в рамках
  планирования. Не повторяем неизменную квалификацию Judge при harness/tooling fix.

Исследованы engine beta.146 `ec625cbe88749b7561a92ff9bc1f72f508b8e1cb`
и beta.147 `2f3d3f0bf4f4ff59acea46ca83b9baefc19d1f7d`; последний добавляет
третий overload retry и не исправляет перечисленные ниже причины.
Definition CP243 `186a2356359008ced94b6aa3ee45e9180b5ba379`; source tooling
`dc4ae3be860549101d814651b09255a265d70a23` (`eval/cp243-native-typecheck`).
Product base `26bf561f175450337a999fdb114580e641c99cde`, flow pack
`1fdebb7de50ad764b6a35fb8ef2b30cb2e0e5be9`, canon
`925ef10ecc0b683f7feba6f74913e15560842500` не подменять текущим product main.
При реализации сначала сверить main/открытые PR и не откатывать смежные E5/147.

### 1.1. Неизменяемая исходная evidence

| Harness / EVAL | Baseline | Последняя подтверждённая причина |
| --- | --- | --- |
| AGY `EVAL-20261022093358-56b14337` | PASS | PLAN-REVIEW: child Work complete + child Stop true + root SUCCESS, но root Stop false; native settlement не подтверждён |
| OpenCode `EVAL-20261022093859-4b41b639` | PASS | CODE/RCP-005: candidate browser test вызывает отсутствующий `toHaveTextContent`; unclassified останавливает repair |
| ZCode `EVAL-20261022094416-da2b71dc` | PASS | CODE/RCP-011: locator требует `← Launch notes`, accessibility snapshot содержит `Launch notes`; timeout с sticky observation_gap |
| Luna CP244 `EVAL-20261022112650-0d0241d7` | PASS | SPECIFY: overload повтор в той же Session успешен; агент не применяет скрытый принятый HITL-ответ; controller_answer_not_applied |
| Grok `EVAL-20261022095651-82b4d369` | PASS | CODE/RCP-010: Biome failure → WRK-013 repair PASS → повтор finish без successor; invocation_assignment_missing |

Evidence roots: `~/.dd-eval/qualification/cp-243-<harness>-full/runs/<EVAL>`;
для новой Luna — `cp-244-luna-full`. Читать timeline/controller/actual receipt,
не manifest entry-stage. RCP artifacts находятся в `checks/RCP-*/artifacts/`.
Главный root cause — не текст последней wrapper error.

## 2. Реестр дефектов и проверка аналогичных мест

| ID | Подтверждённый механизм | Общие места, которые должны быть покрыты |
| --- | --- | --- |
| D01 | HITL answer-file скрыт из публичной команды; resume/retry prompt не показывает принятый файл, агент принимает старый placeholder/null за отсутствие ответа | run-controller.ts prompt/hitl, controller-fanout.ts controllerStageResumePrompt; pause/resume, reattach, capacity continuation, EVAL answer delivery |
| D02 | HITL overload continuation извлекает команду `text.split("\n\n")[1]` и собирает другой неполный пакет | Все prompt/retry builders и callers continueProviderCapacity; не парсить presentation обратно в authority |
| D03 | CLI сериализует AppError перед settleLifecycleRejection; повторная классификация теряет WeakMap/WeakSet-валидацию proof; source_repair становится unclassified, successor не выдан | run-cli.ts, lifecycle-invocations.ts все isRetryableLifecycleRejection/settle callers, check-runner-evidence.ts; memory, Work, CODE, review, MERGE, retained/reconcile |
| D04 | semanticCompletionPrompt велит повторить finish исходного пакета даже после settled error/repair; runtime не гарантирует текущую команду | controller-fanout.ts SDLC и memory review/correction branches, run-controller.ts, vnext-code/review/merge, repair-intents, lifecycle packet recovery |
| D05 | Candidate test runtime exception, не AssertionError/известный SQL, остаётся unsupported_attribution | test-observation.mjs normalizeFailure; Playwright и Vitest test/setup/collection/teardown; engine reader/disposition/repair/capture |
| D06 | Web typecheck не включает browser tests, API typecheck также включает только src; ошибки test API проходят ранний quality | apps/api и apps/web tsconfig*, package scripts, tool-diagnostic-runner TypeScript config list; сохранить native tsc semantics |
| D07 | browser-fixture gap накапливается на весь test, а не текущее окно; onset не содержит достаточной причины | browser-fixture, playwright-observation, browser-observation, runner-progress; producer/engine validator и capture/re-read |
| D08 | Закрытие любой страницы/context навсегда выставляет общие closed/crashed для всех последующих действий | browser-fixture observePage/observeContext/captureHealth; закрытый вспомогательный tab не доказывает поломку active target |
| D09 | Parent report сопоставляет одинаковые child failures через find к первому объекту; проверка полноты через === отвергает второй occurrence | check-runner-evidence.ts readRunnerEvidence/validatedChildren; nested report, missing/extra projections, diagnostics |
| D10 | Ограничение aggregate report обрезает child projections, но сохраняет ссылки steps; reader требует все child instances, теряет весь валидный partial report | test-observation boundReport, quality-runner aggregation, engine reader/proof paths, EVAL compact diagnostic; CP243 поправил только redundant marker +64 случай |
| D11 | AGY stale non-idle root observation блокирует settlement после terminal/child stop; отсутствие root Stop, напротив, принимается как idle | dd-agy-daemon receipt/observeHook/onResult/captureChildTools/drain, native-children, qualification/reattach |
| D12 | AGY session.cancel переписывает settled в Boolean(exited), а prepareStop отказывает clean native terminal для той же ситуации | cancel/close/daemon.stop, runtime-native shutdown receipts, control/recovery/EVAL projections/barrier |
| D13 | AGY нормальный step.state ACTIVE не распознаётся tool status и создаёт sticky tool_status_unsupported | tool-observations.mjs status/agyToolObservation, stream/transcript consumers; telemetry не подменяет settlement |
| D14 | CODE semantic needs_repair и blocked возвращают ok:true без next.finish_command; старый successful invocation возвращает cached outcome вместо повторной оценки | vnext-code.ts:270–288; verification_required и CODE-REVIEW как образец delivery, но также проверить атомарность issuance/settlement |
| D15 | Unsupported Playwright timeout adapter тихо вызывает info.setTimeout(quiet), возвращая fixed accumulated budget вместо скользящего окна | browser-fixture.mjs:108–111, armQuietTimeout; capability failure должен быть явным |
| D16 | lifecycleRetryCommands ищет replacement по fingerprint predecessor; --retry-check меняет fingerprint, и уже выданная команда исчезает из HITL continuation | lifecycle-invocations.ts:603–618, successor helper:700–720, stage-pause.ts:124 |

Дополнительные места, для которых принято правило и нужен узкий reproduction,
но причиной этих пяти запусков они НЕ объявляются:

- R01: test-runner.mjs:125–130 останавливает child при observer lag >60s до чтения
  buffered genuine progress. Это нужно разделить с clock discontinuity: порядок
  collect→validate→idle decision, liveness не оценивается по длительности poll.
- R02: playwright onStepBegin публикует active action, но не сдвигает
  last_progress_at. Решение: уникальный новый native action start — полезный
  signal один раз; повторы health/poll/delivery того же события — не progress.

Первоначальная гипотеза Grok «только не подготовили finish после repair» уточнена:
на actual RCP-010 freshly validated check даёт source_repair, после JSON/errorRecord
roundtrip — unclassified. D03 является более ранней причиной отсутствия successor;
D04 — самостоятельный небезопасный instruction contract, исправляются оба.

Нельзя приписать ZCode gap конкретно host load: первый источник не сохранён.
Последний diagnostic active_step_changed сам по себе gap не устанавливает.
D07/D08 доказаны кодом; не объявлять D08 причиной данного RCP без native evidence.

## 3. Общие решения

1. Controller/runtime остаётся единственным issuer lifecycle authority. Prompt
   показывает только уже выданную текущую команду, не придумывает переход.
2. Сохраняем имеющиеся RUN/Work/repair-intents, runner-evidence и proof validators.
   Новая framework/plugin system, второй scheduler и отдельный Judge не нужны.
3. Diagnostic JSON — presentation, не proof capability. Сериализация/редакция/
   truncation никогда не должна пересчитывать полномочия по потерянным объектам.
4. В mutable текущем ходе решение вычисляется из исходного validated receipt до
   errorRecord. На durable/re-attach границе proof заново читается общим reader
   по exact binding/path/hash; WeakSet нельзя восстанавливать по словам JSON.
5. Ошибка candidate теста не доказывает дефект продукта. Repair может менять
   принадлежащий candidate тест, не снимая принятые требования/проверки.
6. Native SUCCESS, semantic Work completion, отсутствие pending commands,
   физическая остановка и capture — разные факты. Не сводить их к одному boolean.
7. Новые bounded поля additive, version при семантическом несовпадении. Legacy
   evidence не получает новые гарантии задним числом. Unknown — не PASS/repair.

## 4. Порядок реализации и точные acceptance cases

### P0 — Зафиксировать реальные boundary regressions

Из пяти EVAL извлечь минимальные обезличенные native формы, без всего RUN/токенов,
и добавить к существующим тестам. Сохранить исходный FAIL и red/green отдельно.
Обязательны: Grok RCP-010 до/после errorRecord; Luna actual answer/placeholder;
OpenCode missing matcher; ZCode accessible-name + gap; AGY false→child true→SUCCESS.
Не делать платный повтор E2E для воспроизведения каждого локального механизма.

### P1 — Сохранение trusted repair decision через CLI и durable boundaries (D03)

- До sanitization вычислить retry/repair disposition исходных validated checks;
  передать его приватным typed аргументом, связанным с invocation и receipt IDs,
  в общий settlement helper. Serialized details не являются trusted аргументом.
- Обычные checkReceipts/projectCheckReceiptRow/resolvedReceiptArtifacts и pending
  reconciliation уже делают checksum/binding validation и readRunnerEvidence;
  их не переписывать. Для новых diagnostic/durable boundary callers rehydrate
  authoritative receipts вне
  SQLite write transaction через существующий readRunnerEvidence, с binding,
  artifact hashes, candidate membership и epoch policy; затем atomic compare-and-set.
- Не хранить произвольный public `repair_allowed=true`, не менять WeakSet на
  доверие полям category/origin и не считать mutation/errorRecord equivalent proof.
- Trusted аргумент создаётся внутри engine из проверенных объектов; это не enum,
  принимаемый от CLI caller. До SQL commit повторно сравнить invocation status,
  generation, bound receipt IDs/epoch с прочитанным snapshot. Конфликт означает
  reconcile без successor; файловый I/O и provider calls не выполняются под write lock.
- Проверить все callers isRetryableLifecycleRejection и checkRepairDisposition:
  original AppError, prepared/no-effect CLI rejection, native hook, reused RCP,
  reattach/recovery, baseline reader, Memory verification, CODE/REVIEW/MERGE.
- Regression: actual native Biome/TS/migration/browser/composite proof после
  публичной сериализации всё ещё приводит к тому же разрешённому successor через
  trusted path. Forged/sanitized JSON без proof, changed binding/hash/file, mixed
  tooling+candidate, observation unknown и failed publication successor не выдают.

### P2 — Актуальная lifecycle-команда после repair (D04/D14/D16)

- В общем semantic-completion пути получать текущий prepared finish из runtime.
  Не ссылаться на original packet после settled rejection или recovery generation.
- Existing retry/successor helper использовать как SSOT. Новый successor выдать
  ровно один раз для settled repairable predecessor и завершённого repair Work;
  запомнить lineage predecessor/repair/revision, не выдавать новую authority на
  каждом status/prompt rendering.
- Если successor уже выдан P1, переиспользовать его. Если repair ещё running,
  есть in-flight/unknown-effect операция или predecessor не завершён —
  wait/reconcile, не повторять старый finish. После repair старый check epoch
  закономерно устарел: НЕ требовать свежего PASS как условия выдачи successor.
  Доставить инструкцию обновить verification и текущий finish вместе; именно
  новый finish валидирует данные и исполняет актуальный gate по existing policy.
- Выдаваемый gate successor может включать публичный --retry-check; нельзя
  заменить его старой командой с тем же stage. Сохранять receipt-specific binding.
- lifecycleRetryCommands разрешает exact retained successor по его issued command/
  invocation identity и проверяет собственные scope, generation, fingerprint,
  status/deadline; не ищет его по fingerprint predecessor. Нельзя выбирать просто
  latest stage finish. Проверить receipt-specific replacement в HITL overlay,
  same-fingerprint обычный retry, consumed/stale/foreign successor.
- CODE semantic needs_repair и blocked (ok:true) тоже должны выдавать следующий finish:
  применить уже существующий образец verification_required/CODE-REVIEW
  next.finish_command. Успех вызова с nonterminal outcome не означает право
  заново исполнить его cached successful authority.
- Для blocked successor исполняется только после устранения указанного external/
  user-input blocker; не вводить автоматический цикл повторов unresolved blocker.
- Issuance successor и settlement nonterminal predecessor принять одной existing
  SQL transaction общего lifecycle settlement boundary. Подготовка checks/files —
  до неё; presentation — после. В error path settleLifecycleRejection уже делает
  это атомарно, сохранить его. Existing successful verification_required и
  CODE-REVIEW тоже проверить: один next.finish_command сам по себе не доказывает
  crash safety. Не заводить второй registry или долгую внешнюю работу в transaction.
- SDLC CODE, CODE-REVIEW, MERGE и memory correction/selective-review branches
  должны одинаково соблюдать этот контракт. Не отменять selective acceptance.
- Regression actual installed CLI+hook: gate FAIL → registered repair → PASS →
  refreshed verification → authorized next finish. Двойной rendering/reattach
  не даёт второй ID; old ID/foreign native root/unknown effects запрещены.
- Отдельный positive nonterminal case: ok:true/repair_required → repair completed
  → successor → новая semantic evaluation; cached старый repair_required не
  принимается controller за новое исполнение. Existing finish может выполнять
  проверку сам; обязательного ручного duplicate pre-gate перед ним нет.
- Fault injection до/после commit: либо executing predecessor без доступного
  successor, либо settled outcome и ровно один successor. Повторная доставка
  восстанавливает тот же пакет. Отдельно blocked → blocker resolved → fresh finish.

### P3 — Один структурированный HITL resume-пакет (D01/D02)

- Внутренний пакет: pause_id, stage/work, accepted-answer file+sha256, issued
  resume command и assignment identity. Использовать existing accepted operation,
  не заводить независимый answer registry. Ответ canonical, не генерируется снова.
- До первого provider dispatch файл и родители существуют, bytes проверены;
  модель видит абсолютный read-only путь и назначение. Не подменять исторический
  pause.answer_path или placeholder, чтобы выглядеть уже resumed.
- Initial и overload prompt рендерятся из этого же объекта. Удалить parsing
  presentation через split. Явно: answer accepted/retained; answer_path null до
  resume нормален; команда применит hidden bound answer-file, ничего не выдумывать.
- На retry controller сам проверяет текущую exact pause/answer identity. Если
  answer уже применён — не отправлять его снова; смена pause/generation/hash,
  accepted unknown-effect operation или отсутствие исходного accepted input до
  его committed custody — exact blocker. Потерянная файловая проекция после
  доказанного commit — не потеря ответа: восстановить её из retained bytes/hash.
- SQL commit resume до публикации Stage packet/подтверждения answer operation —
  committed publication_pending, не «всё доставлено» и не разрешение replay.
  Восстановить публикацию той же операции и доставить её authoritative packet;
  исчезновения pause недостаточно, чтобы молча пропустить агентские инструкции.
- Переиспользовать recoverCommittedStageResume, acceptStagePacket/
  publishStagePacket и preparePromptDelivery: существующий SQL custody уже хранит
  exact invocation/generation/pause, bytes и sha256. Не проектировать новый recovery.
  Если pause исчезла после commit, reconcile accepted answer operation и доставить
  сохранённый continuation, не выполнять stage resume повторно.
- Проверить EVAL answer enqueue, canonical/reference answer delivery и recovery
  callers на тот же контракт; не переносить internal invocation ID в prompt.
- Tests: overload до tool call, overload после доказанного effect, saved answer
  при null pause field, changed prompt formatting/newlines, replaced placeholder,
  two pauses in one Session, Unicode/large answer via file, stop during retry,
  crash/overload между resume SQL commit и prompt publication/answer ACK.
- Остаётся bounded overload policy: beta147 три повтора, новый episode после
  успешного запроса. Не добавлять бесконечный retry completed/no-progress Turns.

### P4 — Repair доказанной ошибки candidate теста и ранняя TS диагностика (D05/D06)

- Existing native reporter сохраняет exception type, phase, exact candidate
  frame/line и file hash вместе с bound diagnostic. Добавить узкое additive rule
  candidate_test_runtime_error; конкретный TypeError из test-owned callsite не
  превращать в product assertion. Начальный закрытый список: TypeError и
  ReferenceError. Тип — structured native Error.name; при отсутствии name,
  как у actual Playwright failure, только заголовок сохранённого native Error.stack
  закреплённого формата, не произвольный stderr или наличие слова в message.
  Другие формы/типы — unclassified до отдельного доказанного расширения.
- Native source frame должен принадлежать выполняемому тестовому модулю данного
  attempt и текущим candidate files; foreign dependency/runner/globalSetup/SQL/
  network errors и teardown ambiguity не получают repair по одному типу ошибки.
  Нужен верхний причинный native frame: file/hash/line/column и executing module,
  не любой нижний candidate frame/имя suite/test.location. Непроверяемый source map
  или unknown frame не даёт authority. Setup/collection допускаются только при
  таком же доказанном candidate frame,
  а не из-за имени candidate suite в wrapping error.
- Один rule проходит producer, engine schema/shape, proof validation,
  candidateFailureFiles, disposition, artifact capture/restore и EVAL diagnostic.
- Включить browser и API TypeScript tests в существующий typecheck через test
  tsconfig с корректными native types каждого runner; подключить к обычному tsc и к
  tool-diagnostic-runner compiler API. Не добавлять новую ручную prep suite.
  До включения проверить existing tests; не править за Subject новые scored tests.
- Отдельные test tsconfig используют native types своего runner: Vitest globals
  не добавляют browser-тестам несуществующие Playwright matchers. CLI tsc и
  compiler API проверяют одинаковый перечень configs, включая test helpers.
  Existing source errors фиксировать как baseline/tooling blocker, не исключать
  файлы и не редактировать продуктовые тесты для получения зелёного typecheck.
- Tests: missing matcher/undefined symbol в Playwright и Vitest, beforeEach и
  collection, assertion отдельно, dependency TypeError/network/setup connection,
  stale source hash, symlink escape, exception+cleanup failure. Actual repair
  Work получает retained diagnostic и может исправить тест без снятия требований.

### P5 — Скользящее окно доказанного browser inactivity (D07/D08)

- Ввести единый observation_contract `dd-tasks/browser-observation@2` в worker,
  native result и BrowserProof; reader требует точное согласование версий и
  binding. Обновить source validReport, engine validateBrowserArtifacts, типы,
  capture/restore вместе. Legacy proof не получает target/window guarantees
  задним числом; новая authority требует @2, иначе conservative unknown. Reader
  сохраняет возможность читать старые diagnostics, не переоценивая historical RUN.
- Использовать существующий timer/reporter/worker mailbox. Состояние proof
  относится к test attempt + phase + active step + target/page + window epoch.
  Полезный native progress сдвигает idle; health polling/heartbeat не сдвигает.
- Уникальный native action start/успешный step end сдвигают окно. Дубликаты
  sequence/id, поздний чужой attempt, poll/health и повтор чтения mailbox — нет.
- Unsupported armQuietTimeout capability не подменять info.setTimeout(quiet):
  до test body выдать typed tooling capability error с native version/reason.
  Не пытаться доказать browser action inactivity неизвестным clock adapter.
- Event-loop gap/failed publication не стирать. Зафиксировать bounded gap record
  с reason, interval, sequence и затронутым epoch; инвалидировать это окно.
  После свежего подтверждённого progress начать новое непрерывно наблюдаемое окно.
  Один поздний health sample без нового окна не очищает gap автоматически.
- Step/phase/target change закрывает старую probe; её async result не может
  опубликоваться в новом epoch. На timeout нужен valid pre-deadline snapshot
  текущего окна, native timeout origin и тот же active action.
- Health относится к выполняемому target. Вспомогательный page.close/context.close
  не инвалидирует здоровую текущую страницу навсегда. Если target невозможно
  достоверно связать с native step, сохраняется unknown, не случайная healthy page.
  Browser disconnect остаётся глобальной инвалидизацией.
- Начальная поддержанная target capability: ровно одна подтверждённая live page
  в одном context на протяжении action/window epoch; её identity сохраняется
  в worker proof, её close/crash инвалидирует окно. Закрытие старой auxiliary
  page до начала нового такого epoch не переносится как вечный флаг. Для
  multi-page action без native target binding — explicit target_ambiguous,
  не выбор произвольной healthy page. Private trace instrumentation не добавлять
  без отдельной необходимости/qualification pinned Playwright.
- Не повышать silence budget, не возвращаться к fixed total timeout и не
  превращать плохой locator в infrastructure автоматически. Повреждённое
  наблюдение даёт точный blocker с причиной, нормальное missing locator — repair.
- Native tests с коротким test-owned quiet window: missing accessible locator,
  long useful progress, gap→progress→new full window, gap near deadline, no healthy
  sample, overlapping steps/probes, auxiliary page close, active page crash,
  body→teardown, old attempt/retry mailbox, binding mismatch и write refusal.
- Отдельно test-runner: сначала collect/validate buffered progress, потом idle
  verdict. Observer lag при свежем доказанном child progress не равен тишине.
  Clock reversal/skew, corrupt/truncated journal или отсутствие доказуемого
  current window остаются typed observation error, не продлевают budget по now.
  Эта правка принимается только после R01 reproduction; stop ownership/signals
  и уже запрошенная cancellation имеют приоритет перед сбором новых событий.

### P6 — Полнота и ограничение составных доказательств (D09/D10)

- В readRunnerEvidence сопоставлять одинаковые child failures по occurrence
  внутри конкретного child report (consume unmatched ordinal), не только по value
  первого find. Не дедуплицировать два одинаковых фактических отказа.
- Для aggregate переполнения сохранить bounded explicit partial projection и
  ссылки на child reports; reader проверяет их отдельно, не требует потерянные
  flattened entries как будто report полный. Полнота остаётся false/unknown;
  partial не PASS и не source_repair. Не увеличивать лимиты ради одного запуска.
- Новые semantics вводить в `dd-flow/check-runner-evidence@2`, не расширять @1
  так, чтобы старый reader проигнорировал marker и дал ложный PASS. Reader
  поддерживает @1 по старым правилам и @2 по новым; producer/profile contract
  переключаются согласованно. В @2 добавить optional failure_projection
  { state:"partial", reason:"count_bound"|"byte_bound"|"interrupt", represented,
  omitted }. Обновить RunnerContract/RunnerEvidence, runnerContractsValid,
  source validReport, boundReport allowlist, aggregation/capture и profile pins.
  Nested reports используют объявленную версию contract; unsupported/mismatch
  отвергается явно. Исторические @1 не переписываются.
  Marker сам не authority: reader сначала проверяет каждый retained child
  path/hash/binding и его bounded report, затем occurrence-проекции. Количества
  represented/omitted для aggregate считаются только в occurrences CHILD
  projections: represented — оставленные, omitted — сумма retained child
  occurrences минус represented. Выводить их из проверенных children, не верить
  на слово. Собственные cancellation/tooling failures считать отдельно и сохранять
  в пределах лимита; marker не позволяет молча потерять primary local failure.
  Если даже binding/steps/primary diagnostic не помещаются в текущий лимит,
  выдать bounded evidence_incomplete diagnostic без candidate authority;
  это отдельная диагностика tooling error, не фиктивно валидный report без refs;
  лишние projections, переставленные/пропавшие step refs и несовпавшие counts
  запрещены. Partial leaf без полного источника counts не считается complete;
  его reported counts лишь диагностика. Для leaf represented — число retained
  failure entries, omitted — число удалённых producer entries, диагностическое,
  не проверяемое по отсутствующему полному источнику. counts.failed считает ТЕСТЫ,
  не entries: 100 failed tests и 64 retained entries допустимы только в partial
  diagnostic ветке; safe nonnegative integers остаются обязательны.
  Вложенная partial полнота не повышается.
- Partial всегда понижается до completed=false и не source_repair/PASS независимо
  от заявленных completed/counts/status. Count/byte truncation не означает unknown
  native effects: сохранить actual observation_unknown отдельно. Native pending/
  interrupt с недоказанным settlement → settlement_required; conclusively settled
  command с неполными diagnostics → tooling_blocker с evidence_incomplete, без
  бесконечного ожидания процесса. Проверка partial предшествует shortcut status=passed.
  Обязательную missing
  child или invalid path/hash/binding marker не делает валидными. Legacy report
  без marker проверяется прежним полным coverage; лимиты чтения сохраняются.
- Nested proofs/capture сохраняют ссылочную структуру. Compact EVAL packet —
  locator, не выдаёт partial report за authoritative complete report.
- Tests: два identical failures одного child и разных children; missing/extra
  occurrence; 64 failures + cancellation/unknown marker; nested byte overflow;
  corrupt/missing child path/hash/binding; полный успешный report не меняется.
  Обязательные spoof negatives: partial+completed:true, partial+failed:0,
  неверные represented/omitted, hidden child без marker и partial duplicates.
  Дополнительно: partial leaf с counts.failed>retained entries, local cancellation
  плюс 64 child entries, settled truncation без observation_unknown, old-reader
  refusal @2 и legacy @1 full success без изменения результата.

### P7 — AGY terminal, native-tree и physical shutdown (D11/D12/D13)

- Сначала сохранить regression exact event order: root Stop false, child Stop
  true, terminal SUCCESS; отдельные controls с ещё живой background command,
  missing root Stop, delayed hook, native child resumed после Stop, stale generation.
- Нельзя удалить root false guard или объявить SUCCESS доказательством tree idle:
  upstream #1044 демонстрирует противоположное. Также текущий default
  rootSettled=true при отсутствии Stop не считать положительным native proof.
- Root Stop — observation конкретной generation/момента, не вечный boolean.
  Пересчитывать proof по актуальным root/child/task фактам; stale negative не
  отменяет более новую положительную native idle observation. При отсутствии
  такой positive native observation результат остаётся tree_unknown.
- Старый положительный fullyIdle=true также теряет силу после более новой
  root/child/tool activity. Проверить обе стороны invalidation, не только
  очистку старого false. Cancellation сохраняет прежний terminal/result отдельно
  от исхода остановки; не переписывает SUCCESS/unknown задним числом.
- До расширения success authority проверить доступный AGY1.4.5 native status/task
  контракт по retained records и локальному fixture, при необходимости отдельной
  разрешённой совместимости. No API/недоказанная полнота tool stream — явный
  capability blocker, не новая paid Session/«продолжай» для угадывания settlement.
- Если native умеет bounded read-only tree/task inspection — добавить его в
  existing adapter inspect/drain. Если не умеет — только точный unknown и scoped
  retirement; полный AGY E2E не объявлять достижимым этим изменением заранее.
- Read-only проверка локальных `agy --help`, `agy help agents` и
  `agy help remote-control` не обнаружила non-generative tree/task inspection:
  agents — определения агентов, remote-control status — только его daemon.
  Поэтому начальная реализуемая positive policy конкретна: current-generation
  root Stop fullyIdle=true + terminal текущего запроса + settled known children,
  без более новой activity, инвалидирующей proof. Для actual false→child true→
  SUCCESS positive root proof отсутствует; вернуть typed native-tree unknown с
  причиной, не обещать устранение этого native blocker. Новый generative запрос
  для угадывания settlement не добавлять.
- cancel/close/prepareStop должны использовать одну семантику: physical_stopped
  отдельно, native_settled отдельно. Boolean(exited) не подменяет native settlement.
  User cancellation не равна successful semantic Work; сохранить primary failure.
- Не менять глобально legacy settled: daemon.stop settled:true уже обозначает
  physical endpoint shutdown даже при clean:false. Для новых AGY receipts явно
  проецировать physical_stopped/native_settled, сохранить ACK identity и durable
  control operation. Existing consumers требуют fresh inspect/clean shutdown,
  их не заменять доверием cancel ACK. Regression: stopped:true/settled:true/
  clean:false никогда не становится native_settled, capture-ready или RUN PASS.
- Existing EVAL cleanupObservation и physical-only retirement barrier уже есть:
  переиспользовать, не создавать новую cleanup архитектуру. Не делать native
  unknown исторического RUN вечным blocker нового физически изолированного RUN.
- tool-observations распознаёт native ACTIVE как running, DONE как completed;
  unknown enum остаётся unknown. Accounting gaps не становятся tree proof.
  Восстановление producer telemetry и root settlement проверяются независимо.
- Tests: native Stop/task proof, pending background task, cancel/stop одинаковые
  physical/native факты, clean/unclean reattach, process exit без terminal, EVAL
  physical stopped + capture unavailable + finalization blocked; unaffected
  Codex/ZCode/Grok/OpenCode/Droid adapters сохраняют свои native proof правила.

## 5. Приёмка, зависимости и выпуск

Порядок: P0 → P1 → P2; P3 независим от P4/P5/P6; P4/P5/P6 проходят через тот же
engine reader и disposition. P7 positive settlement зависит от native capability
proof, но diagnostics/cancel consistency/ACTIVE mapping можно исправлять отдельно.

1. Для каждого механизма сначала runnable red regression, затем его green;
   объяснить, какой конкретный инвариант он доказывает.
2. Affected local suites/typecheck/build по действующей policy095, без повторов
   полного gate после каждой правки, без параллельных лишних тяжёлых цепочек.
3. Минимальный installed CLI+hook сценарий: candidate test error → repair →
   correct diagnostic → свежий authorized finish. Параметризовать routing всех
   harnesses существующими fake-native fixtures, не пятью платными E2E.
4. Native browser regression обязательна для изменения browser proof authority;
   parser/unit PASS недостаточен. Не измерять benchmark под host load.
5. Сохранить minimal evidence refs, source/tool/canon versions, passed/failed/
   skipped фактически. Merely merged/built != release accepted.
6. Коммиты/пуш/PR/merge — по runbooks/git-workflow.md; [skip ci], без GitHub CI.
   Tooling source changes отдельно перенести на scored-source и main без слияния
   старой продуктовой истории. Затем новый engine, pins, hooks и checkpoint только
   при отдельно запрошенном release/launch. Working/historical EVAL не меняются.

Definition of done: исправлены все D01–D16 и проверены R01/R02 с применимыми native negative cases;
старые guards не ослаблены; partial/unknown не выдаются за repaired/pass;
accepted answer и successor authority видимы/доступны; physical/native различимы;
неизменные product/Judge corpus не перепроверяются заново без причины.
Если native AGY не даёт positive settlement, P7 отмечается частично выполненным
с точным capability blocker; нельзя закрыть весь план или обещать пять PASS.

## 6. Ponytail и readiness

- Existing typed controller helpers вместо новой orchestration framework.
- Existing runner evidence и validators вместо нового judge/repair scheduler.
- Один trusted decision до serialization; rehydrate только на нужной durable
  границе. Не чинить каждый harness отдельной копией правил.
- Existing rolling window, но правильная область epoch/target; не новый watchdog.
- Existing cleanup projections/retirement сохраняются; не вводить новую службу GC.
- Короткие native reproductions и targeted suites, не новый полный E2E gate.
- Полезные проверки authority/proof/ownership остаются. Самоцелью неизменность
  каталога провайдера и новые требования к продукту не становятся.

Архитектурные решения P1–P6 приняты. Реализуемая часть P7 также определена:
current-generation Stop proof, явный unknown, cancel consistency и ACTIVE.
Отсутствующий positive root proof в actual AGY chain — внешнее ограничение,
не скрытый выбор разработчика между unsafe success и бесконечным ожиданием.
План не выдаёт unknown native behavior за уже установленный факт.

## 7. Внешние источники и ограничения доказательств

- Playwright [assertions](https://playwright.dev/docs/test-assertions) и
  [role locators](https://playwright.dev/docs/locators#locate-by-role): matcher API
  и accessible name, не доказательство конкретного продукта без native snapshot.
- AGY [hooks](https://antigravity.google/docs/hooks) и upstream
  [#1044](https://github.com/google-antigravity/antigravity-cli/issues/1044),
  [#1076](https://github.com/google-antigravity/antigravity-cli/issues/1076):
  SUCCESS не гарантирует отсутствие background tasks; #1076 duplicate не означает
  исправление #1044. Это обоснование negative cases, не доказательство точной
  внутренней причины отсутствия root idle-hook в нашем RUN.

## 8. Перепроверка результатов систематического аудита

Три read-only субагента проверили соответственно continuations/authority,
checks/observations и settlement/cleanup. Главный агент перечитал ключевые
callers/producers и независимо повторил installed replay реального Grok RCP-010:

```text
reportValid: true
fresh validated disposition: source_repair
errorRecord clone disposition: unclassified
JSON roundtrip disposition: unclassified
```

Это дополнение к первоначальному расследованию: P1 обязателен до простого
исправления повторного finish. Также самостоятельно сверены vnext-code.ts:286,
vnext-code-review.ts:216, TypeScript include обоих apps, browser closed/gap
branches, ACTIVE mapping и cancel/prepareStop различие. D09 подтверждается
occurrence/object-identity анализом shared reader; D10 — producer slicing и
обязательным all-children coverage consumer.

Сохранены полезные existing механизмы: hydrated persisted check reads, CODE-REVIEW
next.finish_command, memory selective-review acceptance, physical-only retirement
barrier и отдельные physical/capture/finalization projections. Для них нужны
паритетные регрессии, не новый дизайн по умолчанию. Sibling adapters не объявлены
дефектными только потому, что у AGY иной native contract.

Новые подтверждённые дополнения сверх пяти исходных цепочек: D03, D06/API,
D08–D10, D12–D15. R01/R02 отдельно маркированы как policy/reproduction scope.
P7 не закрывает неизвестность native inventory фантазией о fullyIdle: если proof
не получен, это остаётся явным ограничением готовности полного AGY цикла.

Код реализации, runtime artifacts и продуктовые файлы в этой задаче не менялись.

## 9. Повторное readiness-review: решения и границы завершения

Проверены три независимых направления; существенные находки перечитаны главным
агентом по source. Добавлены D16 и sibling D14/blocked; уточнены atomic issuance,
existing resume recovery, версии browser/report proof и partial disposition.
Результаты help AGY сверены без запуска модели. Отчёт аудита не заменяет проверки
реализации; следующее выполнение начинается с red fixtures P0.

| Блок | Обязательная приёмка без нового scored E2E |
| --- | --- |
| P1/P2 | Реальный proof serialization regression; installed CLI/hook gate→repair→fresh finish; changed fingerprint/HITL; crash before/after atomic commit; blocked resolution; memory selective parity |
| P3 | Тот же accepted файл в initial/retry; SQL commit→lost publication→recovery retained packet, без второго resume; changed/missing input до commit отрицателен |
| P4 | Playwright/Vitest TypeError/ReferenceError exact top frame; foreign/ambiguous frame не repair; native tsc/compiler API одинаково видят API/browser tests |
| P5 | Native pinned Playwright: полезный progress переживает quiet budget, отсутствующий locator получает repair только с полным @2 окном; gap/target/version negatives |
| P6 | Identical occurrences, leaf/composite bounds, local failure preservation; partial никогда PASS/repair; physical settled truncation не ждёт process settlement; @1/@2 migration |
| P7 | Current root+children positive proof; actual stale-false chain остаётся честным unknown; missing/stale-positive negatives; ACK/physical/native parity |

Все fixtures имеют test-owned короткие бюджеты/временные каталоги, без sleep на
production silence budget и без dependency на loaded host benchmark. Нельзя
заменить native browser proof тестами JSON shape. Общие policy095 selection и
receipts определяют нужный union suites; второй самостоятельный полный gate
или новая платная qualification не добавляются этим планом.

Согласованный rollout: engine reader/types сначала умеют старый @1 и новый @2;
затем source producers/profile/pins включают @2 в новом checkpoint. Старый engine
с новым source получает explicit unsupported contract, не silent fallback на @1.
До обновления installed hooks/engine нельзя считать новый checkpoint совместимым.
Выпуск и новые EVAL — отдельная команда пользователя; исторический evidence
служит regression input, а не объектом миграции/исправления.

Итог готовности: внутренние исправления можно реализовывать без дополнительных
продуктовых решений. Полный успех AGY не является закрытым acceptance обещанием:
нужен актуальный положительный native proof, которого нет в сохранённой цепочке
и для которого локальный CLI не объявляет отдельного read-only API. Реализацию
без такого proof маркировать частичной по P7, не объявлять все пять E2E починенными.
