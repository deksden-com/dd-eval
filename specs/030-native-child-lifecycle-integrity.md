# 030 — Native child lifecycle: hooks, identity, dispatch и settlement

Дата: 2026-09-07. Статус: **спецификация исправлений; реализация и приёмка не выполнены**.

План исполнения и доставки: [031](031-systemic-repair-delivery-plan.md).
Расширяет [022](022-native-subagent-capacity-and-productive-fanout.md),
[026](026-interrupted-eval-recovery.md) и
[029](029-cross-harness-defects-and-observable-fallback.md).
В случае противоречия эта спецификация уточняет child lifecycle/dispatch;
029 сохраняет приоритет для разрешённого наблюдаемого model fallback.
Старые отчёты и evidence не переписываются.

## 1. Основание и границы достоверности

Инцидент: `EVAL-20260906223630-0d25c085`, AGY 1.1.27,
dd-flow-cli `463a6ff` / beta.20, dd-eval clean worktree `f8eb771`.
Время ниже — UTC 2026-09-06.

- SPECIFY, PROTOCOLIZE, PLAN завершены; PLAN-REVIEW не завершён.
- В 22:45:52 runner запросил Work WRK-004/WRK-005; provider создал native children.
- Child `work start` отказал с `trusted_session_binding_required`.
- Журнал daemon: 43 PreToolUse, 42 PostToolUse, 10 Stop, все для root.
  Все 176 provider events также адресованы root; child IDs присутствуют
  в `subagent_info`, но отдельного child tool stream в этом evidence нет.
- В 22:48:51 reconciliation получил детей со статусом unknown, не сообщил
  issues; runner повторно запросил те же Work. Появилась вторая пара children.
- Позже provider и daemon намеренно остановлены оператором SIGKILL.
  Это fault injection, не доказательство самостоятельного падения AGY.
- Cleanup сообщил tree_not_settled; recovery не получил clean settlement.
  Итог — invalid_infrastructure_flow и forensic evidence, не recovery success.

Источники относительно локального run root:

- `events.jsonl`;
- `executions/e2e/drivers/daemon/events.jsonl` и `daemon.json`;
- `executions/e2e/native-children-plan-review-cc7cfaee-e11a-4691-88b7-96d3cb36050d.json`;
- `executions/e2e/drivers/daemon/gemini/runtime/brain/<native-id>/.system_generated/logs/`.

Локальный root: `/Users/deksden/.dd-eval/runs/EVAL-20260906223630-0d25c085`.
Эти пути — ссылки на evidence, не разрешение публиковать сырые журналы.
Для переносимого отчёта готовится очищенный evidence manifest с hashes.

Подтверждено отсутствие child events на входе daemon. Не установлено, не
вызывает ли AGY child hook вообще или вызов теряется раньше daemon.
Отсутствие в журналах не объявлять доказанным upstream bug.

Официальные контракты, проверенные при исследовании:

- [AGY hooks](https://www.agy.dev/docs/hooks/): conversationId, toolCall,
  stepIdx, workspacePaths; allow/deny через JSON stdout.
- [Headless](https://www.agy.dev/docs/cli/headless/): step_update и subagent_info;
  описание не гарантирует полноту child tool stream.
- [Changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md).

## 2. Владельцы и неизменные инварианты

| Владелец | Ответственность |
| --- | --- |
| Harness/provider | Native Sessions, physical parentage, исполнение tools, native events |
| dd-eval adapter | Проверить native identity, сохранить observations, доставить receipt, наблюдать/остановить своё дерево |
| dd-eval runner | Зафиксировать разрешённую волну, execution/generation, неизвестный исход, recovery и evidence |
| dd-flow-cli | Work graph, lifecycle eligibility, однократный claim и WorkSession, семантический результат |
| dd-memorybank | Канонические инструкции, capability/compatibility требования и правила приёмки |

H-01. Native Session существует независимо от WorkSession. Наличие child ID
не разрешает автоматически Work start/finish/fail или recovery accept.

H-02. Logical Work parent и physical provider parent — разные связи.
Нельзя выводить physical parent из единственного root, Work ancestry,
порядка массива children, роли агента или текста prompt.

H-03. Разрешение lifecycle связывает конкретное native invocation с Session,
daemon, project/RUN/Work и текущим recovery/dispatch generation.
Model-supplied Session ID, env родителя, ручная регистрация и transcript prose
не заменяют native evidence. Постфактум найденный tool result не превращается
в синтетический PreToolUse.

H-04. Unknown identity/status/delivery — отдельный результат, не root, idle,
success, failed или разрешение повторного dispatch.

H-05. Повтор транспорта одного события идемпотентен; повтор исполнения — новая
попытка. Конфликтующий payload с прежним ID отклоняется.

H-06. Receipt claim и изменение Work binding согласованы транзакционно.
Отказ не оставляет использованное событие без принятого lifecycle outcome.
Файловые packets публикуются атомарно с существующим механизмом staging/reconcile;
не обещать атомарность SQLite и filesystem без соответствующего протокола.

H-07. Конец root Turn, idle дерева, terminal child outcome, Work completion,
остановка процессов и пригодность recovery snapshot — разные факты.

H-08. Никаких новых корневых Sessions вместо native children, обхода identity
guards, изменения аккаунта/лимитов или исправления исторических snapshots.

## 3. Обязательный decision gate AGY

До выбора конкретного transport fix выполнить изолированный bounded probe:
один root, один direct child, безвредная команда у каждого, без product Work.
Зафиксировать binary digest/version, model/mode, hook config digest, workspace,
daemon ID, native IDs, время и результат каждого участка цепочки.
Hook пишет очищенный ingress record до RPC, затем отдельные delivery/Flow ack
и reply records. Не записывать credentials и весь tool input без фильтрации.

| Результат | Решение |
| --- | --- |
| Child hook входит, теряется при RPC/normalization/Flow | Исправление соответствующего локального участка с регрессией |
| Child hook не входит | Проверить документированные loading/inheritance и конфигурацию exact runtime; не выдумывать флаги |
| Есть альтернативный native child tool-call источник | Отдельно доказать identity, порядок, полноту и безопасную корреляцию; адаптировать в существующий receipt contract |
| Нет пригодного источника | AGY productive_child_lifecycle=unsupported/unknown; upstream repro и tracking; общие исправления продолжаются |

После observational probe нужен отдельный lifecycle smoke в изолированном
Flow RUN: child start -> result -> finish, проверка physical parent и WorkSession.
Ни transcript tailing, ни DONE-only stream не принимаются как pre-execution
authority. Асинхронное native уведомление допустимо только при проверенном
сопоставлении invocation и блокировке lifecycle mutation до подтверждения.
Обычный event observer не объявлять enforcement hook.

Если upstream нужен, подготовить minimal repro без внутренних проектов и
секретов. Публикацию issue/смену harness согласовать отдельно. Переключение на
SDK или другую упряжку — изменение эксперимента, не незаметный fallback.

## 4. Identity, доставка и применение receipts

Использовать существующие adapter state/journal, hook_events и work_sessions;
не строить новый сервис. Минимальное расширение schema определить после
ревизии существующих generation/operation полей.

Сохраняемая identity включает harness, native Session, подтверждённый parent,
daemon ownership, invocation ID/phase, generation и source evidence reference.
Provider timestamp отделяется от локального observed_at. Исходные данные
ограничиваются необходимым набором; конфликты immutable parent запрещены.

AGY descendants восстанавливаются из сохранённого state или проверенного replay
с cursor. Hook-before-spawn ожидает independent native identity в ограниченном
окне; event loop при этом должен продолжать принимать spawn observation.
При исчерпании окна — явная identity_unconfirmed, без parent=null fallback.
Source step.conversation_id валидируется; не назначать init root всем уровням.

PreToolUse allow выдаётся после подтверждения записи receipt. При отказе —
AGY JSON deny с устойчивым code/reason и проверкой реального поведения runtime,
включая always-proceed. Ненулевой exit code сам по себе не доказательство deny.
Потерянный ACK допускает повтор доставки того же event, но не mint нового ID.
ID разных invocations не сливаются по одному command hash/step index.

В Flow общий replay guard сравнивает immutable identity и command match key
для всех harness, не только Droid. Конфликт не считается harmless duplicate.
Freshness и generation проверяются и при явном event ID, и при fallback lookup.
Lookup не выбирает произвольно newest event, если несколько подходят без
достаточной идентичности. При недостаточном контракте — fail closed.

Claim и Work mutation должны выдерживать concurrent claim, exception/rollback,
crash до/после commit и повтор после потерянного ответа. Для этого использовать
существующий transaction/operation механизм, не добавлять отдельный mutex server.

## 5. Dispatch и check-in

Перед запросом root Turn сохранить wave attempt с execution/generation,
parent Session, stage и точным набором уже готовых Work. Запись намерения не
доказывает появление native child. После native spawn сохранить независимый
факт accepted child ID. Work связывается только по проверенному lifecycle.

Состояния минимум различают: requested, native-observed/unbound, bound,
confirmed-refused, terminal и outcome-unknown. Названия не требуют новой БД:
реализация расширяет существующий operation journal/reducer.

- Незавершённая/unknown попытка блокирует повторную выдачу затронутой волны,
  даже когда Work остаётся created и даже после restart/recovery.
- Если child-to-Work mapping ещё не доказан, блокировать весь unresolved набор,
  а не угадывать соответствие по порядку/роли/prompt.
- Частичный launch учитывает принятые и неподтверждённые элементы отдельно.
  Повтор возможен лишь после доказанного отказа/settlement и явной retry policy.
- Unbound child после подтверждённого завершения становится infrastructure
  finding, не новым ready Work и не fabricated failed WorkSession.
- Error guidance отличает краткую задержку события от отсутствующего канала;
  bounded retry той же invocation не превращается в бесконечные команды модели.
- Инструкция родителю о fresh context не вкладывается ребёнку как задача
  «создай ребёнка». Признак fresh context не выводится из нового Session ID.

## 6. Settlement и recovery

Root idle receipt допускается как доказательство tree idle только если exact
provider contract явно охватывает descendants; это не доказывает Work results.
Missing Stop не приравнивается к fullyIdle=true. Unknown children сохраняются.
Sparse status API трактуется по квалифицированной семантике конкретного API:
не вводить универсальное правило «нет строки = idle» или обратное без проверки.

При confirmed provider death адаптер сохраняет primary error и отдельно
reconciles принадлежащие запуску процессы/descendants. PID без identity/lease
недостаточен; PID reuse и detached children входят в проверку.
Смерть bridge не доказывает смерть provider. Потеря наблюдения не разрешает
слепой kill. Cleanup не должен зависеть от успешного model/profile inspect.

Settlement после crash может иметь иной evidence kind, чем clean shutdown,
но должен независимо доказать отсутствие writers и согласованность state.
Не переписывать shutdown_state в clean ради прохождения gate. Retained native
Session resumability проверяется отдельно; остановка процессов её не доказывает.
Без доказательств остаётся immutable forensic snapshot, restorable=false.

## 7. Cross-harness audit matrix

| Узел | Найдено / что проверить | Обязательное действие |
| --- | --- | --- |
| AGY daemon | descendants in-memory; early hook parent=null; root-only stream в инциденте | Sections 3–6, replay topology, ingress/ACK diagnostics |
| Grok hook.resolve | Unknown Session получает единственный root перед подтверждением | Проверять native parent до регистрации, foreign/early hook tests |
| Grok ACP + native hook | Два источника invocation observation | Correlation, source distinction, duplicate/conflict и ordering tests |
| ZCode forwarder | Lifecycle строится из ACP tool_call | Child metadata/parent validation, поздняя доставка, generation и ordering |
| Droid hook | Native metadata/path/cwd/parent validation уже есть | Сохранить этот принцип; общие replay/atomicity/control tests |
| OpenCode plugin | Native session.get + before/after; local participating set | Проверить restart/lost after, native parent, sparse statuses и duplicate |
| Codex app-server + managed hooks | Native thread topology и отдельный hook channel | Проверить early child, reload, exact invocation и stale generation |
| Flow hooks | Общий duplicate path слабее Droid-specific path | Единый immutable replay guard и одинаковые claim требования |
| Work/Stage/recovery lifecycle | Разные claim/transaction entrypoints | Пройти start/finish/fail/pause/resume/accept, не исправлять только work start |
| Runner | created Work повторно запускается после unknown child | Durable wave/check-in barrier во всех launch/resume/recovery/reference путях |
| Reports/qualification | Capacity и root smoke недостаточны для child lifecycle | Раздельные capability verdicts и первичная причина сбоя |

## 8. Проверки и критерий закрытия

| ID | Проверка | Ожидаемый результат |
| --- | --- | --- |
| H-T01 | Root + direct child lifecycle | Ровно одна WorkSession, верные native IDs/parent, проверенный result |
| H-T02 | Hook до spawn; затем spawn; spawn отсутствует | Корректное разрешение гонки либо bounded отказ, никогда guessed parent |
| H-T03 | Foreign Session/parent/workspace/daemon | Отказ без mutation |
| H-T04 | Same event повторён; payload изменён | Идемпотентный повтор; конфликт отклонён |
| H-T05 | Одинаковая команда в разных invocations | Разные receipts, никакого command-hash conflation |
| H-T06 | Exception/crash между claim и binding; потерян ACK | Нет orphan claim/двойной WorkSession; outcome восстанавливается |
| H-T07 | Restart, late old-generation hook | Topology восстановлена; старое событие не захватывает новую Work |
| H-T08 | Partial spawn/unknown/check-in refusal | Нет автоматического duplicate wave, включая restart |
| H-T09 | Root DONE при неизвестных детях | Не становится Work completion/recovery-ready |
| H-T10 | Kill provider, kill daemon, detached child, PID reuse | Только owned cleanup; честный settlement или forensic-only |
| H-T11 | Hook deny/timeout/RPC failure в native AGY | Измеренное blocking поведение; никаких ложных allow claims |
| H-T12 | Model fallback root/child по 029 | Работа продолжается с attribution; identity guards не отключаются |
| H-T13 | Два concurrent claims и stale explicit event ID | Не более одного принятого outcome; единая freshness policy |
| H-T14 | После recovery завершённые Work | Не перезапускаются; interrupted получают адресный packet |

Scripted tests обязательны для всех adapters; live capability qualification
не заменяется mocks. Недоступный provider — explicit blocked/unsupported, не pass.
Полное закрытие AGY child recovery требует H-T01 и H-T14 на exact released
artifact set; root-only smoke и defensive capability denial этого не доказывают.
