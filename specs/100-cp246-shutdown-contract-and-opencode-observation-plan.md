# 100 — CP246: shutdown contract и OpenCode observation

Статус: план; реализация и новые EVAL не выполняются в рамках подготовки.
Дата: 2026-10-23; readiness-review 2026-10-24. Продолжает 098/099; их разделение execution readiness,
semantic outcome и resource retirement сохраняется.

## 1. Факты и границы

Все пять CP246 прошли baseline на неизменённом engine beta.148,
commit `17bf983178e8f9f27bac65501c1434785ee3f214`.
Полный локальный release-gate завершён PASS; candidate artifact SHA256
`4f063722329a40bc29ea16cf3bbedcfd890d308c32f9016e220d0944e1bacf7f`.
Это доказательство выполненных регрессий, не доказательство отсутствия live-дефектов.
Новые обнаруженные дефекты не разрешают переписать принятую квитанцию или tgz.

| Harness | EVAL | Наблюдение |
| --- | --- | --- |
| OpenCode | EVAL-20261023172352-a0c84cbf | SPECIFY entry, tree_not_settled, Session status unknown |
| Luna | EVAL-20261023172903-c973658d | SPECIFY HITL, judge_cleanup_failed |
| AGY | EVAL-20261023173314-860a1af1 | SPECIFY HITL, judge_cleanup_failed |
| ZCode | EVAL-20261023173723-86179fb5 | SPECIFY HITL, judge_cleanup_failed |
| Grok | EVAL-20261023174206-7560c8dd | SPECIFY HITL, judge_cleanup_failed |

Артефакты: `/Users/deksden/.dd-eval/qualification/cp-246-<harness>-full/runs/<EVAL>/`.
У четырёх Judge Codex: verdict сохранён; daemon.json содержит clean, shutdown@2,
native_settled=true и physical_stopped=true, но не содержит active_tree.
Cleanup отклонён с `daemon clean ACK conflicts with its retained state`.
Это tooling-дефект, не неправильная классификация Judge и не ошибка продукта.

Продукт, вопросы, канонические ответы и пороги не менять. Старые попытки,
операции и verdicts не перезаписывать и автоматически не resume/restart.
GitHub CI не запускать. Не обновлять engine внутри существующих EVAL.

## 2. Доказанные причины и дополнительные находки

### D1. Codex producer не публикует полный shutdown state

`dd-flow-cli/src/harness-runtime/lib/dd-codex-daemon.mjs`: stop prepare ждёт
нативного settlement и возвращает clean, но не публикует active_tree=false.
Status также не содержит этого поля. Общий `managed-daemon.mjs:confirmDaemonStopped`
и EVAL `judge-cleanup.mjs:assertPhysicalState` требуют явный false.

### D2. Общий producer и потребители расходятся на missing

`daemon-operations.mjs:completeDaemonShutdown` использует `!state.active_tree`,
поэтому missing может участвовать в положительном clean. Сам helper не
нормализует поле. Строгие потребители потом законно отвергают такой state.
Положительная fixture `test/fixtures/daemon-operations.mjs:24–38,45–52` с отсутствующим полем
проверяет clean и маскирует несогласованность.

### D3. Аналогичные read/recovery пути

Проверить совместно, а не чинить только Judge: engine managed-daemon,
driver-recovery, daemon-operations retained stop/resume; EVAL daemon-control,
driver-recovery, qualification-recovery, judge-cleanup, runner cleanup discovery.
Особенно опасны `!active_tree`, `!== true`, строгий false и совпадение
generation/revision: одинаковое значение должно иметь одинаковый смысл.
Наличие похожей проверки само по себе не означает баг; строгий отказ на unknown
сохраняется. Нужны доказанные различия в гарантиях, не механическая замена grep.
В `judge-cleanup.mjs:156` предварительная проверка допускает missing, а следующая
строгая отвергает его: использовать согласованную проверку. В `runner.mjs:2163`
есть permissive fallback, но за ним вызывается assertDaemonReplaceable:
проверить всю цепочку перед объявлением ложного допуска, не только одну строку.

Droid не объявлять доказанно сломанным по одному init: его closeTree отдельно
публикует false. AGY/ZCode/Grok/OpenCode также имеют собственные writers;
проверить end-to-end callback wiring и late-activity, не приписывать им D1.

### D4. OpenCode — доказанный отказ на control frame log.synced

`dd-opencode-daemon.mjs:revision/describe` строит fence из durable.aggregateID/seq.
Missing/invalid fence превращает snapshot в changed/unknown и блокирует dispatch.
Не считать unknown ни idle, ни доказательством незавершённой модели.
Native 2.0.31 без model prompt возвращает для новой пустой Session конечную
выборку `[{"type":"log.synced","aggregateID":"<session-id>","seq":0}]`.
У этой записи поля находятся наверху, а не внутри durable. Декодер SDK 2.0.28
законно пропускает её: `SessionLogItem = SessionEventDurable | EventLogSynced`,
`EventLogSynced` явно объявлен в generated/types.d.ts:779–783.
Наш revision ошибочно применяет схему первого варианта ко всему union,
возвращает null и детерминированно блокирует новую пустую Session.
Это дефект нашего адаптера, не доказанная несовместимость native/SDK.

Дополнительно подтверждён разрыв тестовых контрактов: `test/fixtures/opencode-v2-api.mjs`
выдаёт durable.seq без durable.aggregateID. Completion в `dd-opencode.mjs`
потребляет seq, а daemon revision требует оба поля. Обе ветки должны проверяться
одной fixture фактического native формата. SDK @opencode/client закреплён
на 2.0.28, native — 2.0.31; различие версий не объявлять причиной без wire evidence.

## 3. Исправления: порядок и решения

### P1. Положительный execution settlement в producer

1. Codex: явная publication состояния после успешного waitForSettlement;
   отсутствие false не заполнять default-ом при загрузке старого state.
2. Перед публикацией проверить принадлежность daemon/session, текущую операцию,
   generation/native revision. Новая активность во время await/persist не должна
   быть затёрта false. Если защита revision отсутствует у Codex — использовать
   существующий механизм revision/dispatch fence, не создавать вторую state machine.
3. Clean допустим только после положительного execution proof, всех required
   shutdown phases и physical/resource retirement. Unknown/late activity →
   unclean/pending с сохранением причины, а не ложный clean.
4. Общий helper: убрать неявное missing→idle; согласовать строгую семантику с
   потребителями. Повтор cleanup не должен терять ранее доказанные phases,
   но обязан перепроверять текущую incarnation/generation.
5. Строгие проверки Judge не отключать; не лечить ошибку добавлением retries
   запроса модели, таймаута или переписыванием daemon.json после остановки.

Точный смысл поля: false — положительно доказанное отсутствие обязательной
execution-активности, не отсутствие PID и не успех модели. true — известная
активность. Missing/null/неboolean — unproven. Начальное значение не должно
подтверждать пустую сессию до native admission. При native failure терминальный
Turn может быть settled, но его семантический failure обязательно сохраняется.
Новый false публикуется только владельцем prepare после waitForSettlement;
общий helper лишь проверяет его, не дописывает за адаптер.

Codex: productive dispatch должен выставлять/инвалидировать activity proof до
await, сбрасывать его только после новой проверки дерева; finally не должен
безусловно выставлять false. Stop должен включить всех обнаруженных потомков,
исключить новый productive dispatch существующим shutdown fence и проверить
свежесть результата после awaits. Положительный no-Session stop — только при
доказанной пустой owning scope. Публикация status согласована с persisted state.

### P2. Аудит всех producers/consumers

Инвентаризировать Codex, AGY, ZCode, Grok, OpenCode, Droid и каждый вызов
completeDaemonShutdown/confirmDaemonStopped/nativeShutdownConfirmed.
Для каждого отметить: кто пишет readiness, как защищена revision, кто пишет
physical proof, какие поля читает status/recovery/retained stop.
Исправить только реальные несогласованности; единую валидацию переиспользовать
через существующий native-children модуль, если она действительно совпадает.
Исторические @1 доказательства остаются read-only, не новая authority для RPC.
Missing современного положительного доказательства не признаётся успехом.

### P3. OpenCode observation

P0-предусловие P3 закрыто native-пробой 2026-10-24:
`/tmp/cp246-opencode-observe-tbO75I/evidence.json`, binary 2.0.31, SDK 2.0.28,
Session `ses_e9522c70dffeAobnMWKvx2aN0s`. Только server.info/create/get/log;
prompt не отправлен, input/output/reasoning tokens=0, cost=0.
Изолированный server PID59072 завершился exit130 после SIGTERM; чужие процессы
и CP246 runtime не затронуты. Сам raw frame приведён в D4, поэтому смысл
regression не зависит от сохранности временного файла.

Повторная проба `/tmp/cp246-opencode-observe-AIUkGm/evidence.json` через
реальные OpenCodeClient и Runtime подтвердила: до изменения revision —
status unknown, settled false, requireSettled бросает tree_not_settled;
с локальной экспериментальной обработкой единственного наблюдавшегося
sync-marker нулевой revision — idle, settled true, requireSettled проходит.
Это эксперимент в памяти, не внесённое production-исправление и не проверка
всего будущего decoder. Session `ses_e95215565ffeaJu4q7qW7Dke40`, PID62005
остановлен exit130; input/output/reasoning tokens=0, cost=0. Сценарий:
`/tmp/cp246-opencode-observe.mjs`; его результаты подлежат переносу в
минимальную репозиторную regression fixture при реализации.

Процедура повторной no-model проверки при реализации:
снять конечный non-follow log существующей owned Session версии 2.0.31
read-only, если её endpoint доступен. Если нет — изолированный create/inspect/
stop без prompt, без resume старого runtime и без продуктового checkout.
Обязательно зафиксировать binary/version, SDK version, returned envelope,
session/aggregate binding, seq/cursor, coverage и cleanup. Не создавать новый
запрос модели ради этой проверки. Секреты/произвольный payload в fixture не писать:
сохранять минимальные структурно точные примеры через существующую redaction.
Не выбирать наугад новую версию SDK или новый native API.

1. Сопоставить client HTTP response, native source/schema, event revision и
   CP246 operation ledger. Записать конкретный дефект и воспроизведение.
2. При исправлении использовать native durable cursor/revision, исключая только
   документированные неавторитетные записи. Malformed durable evidence — отказ,
   не замалчивание. Пагинация должна сохранять полное доказательство fence.
3. Текущую empty Session можно признавать idle только при положительной
   согласованной native observation, без sleeps и без нового model prompt.
4. При изменении revision разрешён существующий bounded reread в той же операции;
   при продолжающемся изменении/unknown — typed observation error, не dispatch.
5. Сохранить различие busy, unsupported evidence, corrupt evidence, transport
   error и unknown-effect. Не классифицировать их все как model overload.
6. Одна нормализация клиентской границы обслуживает revision И completion;
   устранить независимые предположения о durable envelope/cursor. После выбора
   формата записать точную совместимую native/SDK пару. Обновление SDK допускается
   только если доказан его дефект, не как необоснованное лечение version mismatch.
7. Ошибка наблюдения содержит безопасные reason/session/cursor/поле схемы,
   но не текст модели и credentials. Отсутствие fence, race, реально busy и
   malformed/foreign event различаются; ни один не разрешает повтор paid prompt.

Конкретный decoder contract (решение принято):

- Различать два варианта native union: durable domain event с `durable.*` и
  control frame `log.synced` с top-level `aggregateID/seq`. Не выкидывать все
  записи без durable и не придумывать durable wrapper для control frame.
- Финальная finite log-выборка должна иметь валидный sync marker именно
  запрошенной Session. Его неотрицательный safe-integer seq — watermark
  завершённой выборки. Ноль допустим и является доказанным empty-log fence.
- Отсутствующий marker/seq (seq optional в SDK), чужой aggregate, неправильный
  тип seq, противоречивые markers или frame после финального marker → typed
  unproven/corrupt; отсутствие поля не нормализовать в ноль.
- Domain events валидировать отдельно; их cursor не должен выходить за sync
  watermark. Не требовать выдуманной непрерывной нумерации без native гарантии.
- Общая клиентская функция разбора finite batch возвращает domain events и
  validated watermark. revision строит канонический fence с root watermark,
  completion обрабатывает только domain events. log.synced не является
  delivery, terminal outcome или новой активностью модели.
- before/after watermark сравнивается для root и каждого owned child.
  Стабильный ноль + пустые messages/pending/status/tree дают idle без prompt;
  один watermark без остальных idle checks не даёт readiness.
- Сохранить ограниченный reread при изменении snapshot. SDK/native pins
  оставить 2.0.28/2.0.31: обновление не требуется для этого исправления.
- Регрессию native fixture дополнить sync marker и aggregateID domain events;
  прогнать одну выборку через client decoder, Runtime и completion. Больше не
  использовать несовместимые отдельные log mocks для этих путей.

### P4. Регрессии, ловящие именно live-разрыв

Минимальный обязательный набор:

- Реальный Codex producer state без выдуманного active_tree в fixture →
  completed stop → confirmDaemonStopped → EVAL finish/assertJudgeCleanup.
  После фикса цепочка PASS, исходный формат воспроизводит отказ.
- Generic helper: missing/null/true не подтверждают clean; доказанный false
  принимается; callback/save реально изменяет retained state.
- Late activity/revision change во время prepare, owned-resource cleanup и
  финальной публикации; не допускается stale false или clean.
- Lost ACK, closed endpoint при живом PID, умерший PID при живом endpoint,
  чужой daemon/generation, неостановленный ресурс, частичный phase proof.
- Успешная остановка без Session; stop после provider error; cancel активного
  дерева; повтор stop читает результат, не отправляет новый платный Turn.
- EVAL сохраняет verdict и primary error при cleanup failure; корректная
  reobservation не переписывает исторический outcome и не повторяет Judge.
- Cross-harness contract table с реальными producer snapshots всех шести
  адаптеров; не шесть копий одного синтетического boolean mock.
- OpenCode: новый empty root, terminal root/child, pending tool/inbox,
  revision race, missing/malformed durable metadata, смешанные log records,
  pagination и transport failure по реальному формату 2.0.31.
- Та же OpenCode fixture проходит client completion и daemon revision, а не
  только каждый путь на своей упрощённой имитации. Добавить foreign aggregate,
  отрицательную/нецелую seq, exhausted/неполную pagination и child revision race.

Точечные регрессии сначала. Один изолированный native Codex stop smoke и
OpenCode create/inspect/stop без model prompt — если контракт позволяет.
Реальные model calls не нужны для проверки состояния остановки.

### P5. Операционная приёмка и выпуск

1. Не изменять принятый beta.148 candidate, его FAIL/PASS receipts и EVAL.
   После исправления собрать новый exact source/artifact tuple; выбрать версию
   по registry/tag reconciliation, не переиспользовать опубликованные bytes.
2. affected tests + static/build; затем один требуемый локальный release profile
   для замороженного кандидата. Не повторять модельную qualification из-за
   изменения harness cleanup, если semantic dependencies Judge не изменились.
3. Публикация только после отсутствия известных блокеров и принятия требуемых
   receipts. Проверить registry bytes/provenance/tag и installed consumer.
4. Обновить pins и установленные hooks, проверить оба Codex home (.codex и
   .codex-cpa), сохранив symlink и чужие handlers. Старые EVAL не перепинить.
5. Новые EVAL запускать последовательно до выхода предыдущего из admission,
   не только до run ACK: worker повторно берёт retirement-lock после ACK.
   Lock живого владельца не удалять. Две reserved попытки без accepted —
   не считать проведёнными EVAL; проверять dispatch barrier перед повтором.
6. Baseline затем SPECIFY/HITL; продолжить полный флоу. Доложить отдельно
   baseline, фактическую стадию, native readiness, Judge verdict и cleanup.
   Продуктовые дефекты исправляются самим флоу, а не вручную оператором.

## 4. Критерии готовности и завершения

- Перед реализацией P3: доказана точная OpenCode причина, выбрана authoritative
  revision и записана схема негативных случаев; гипотеза не считается решением.
- Все writers/readers инвентаризированы; аналогичные дефекты имеют адресные fixes.
- Исправления не ослабляют unknown/ownership/physical guarantees.
- Регрессия реальной producer→consumer цепочки падает до фикса и проходит после.
- Release и EVAL readiness не смешиваются; старые доказательства неизменны.
- Реализация завершена только с проверками, commit/push/merge по policy;
  живой E2E успех отмечается отдельным фактом, не предсказывается тестами.

## 5. Ponytail review

Используем существующие shutdown/readiness/revision helpers. Новые зависимости,
новый coordinator, polling service, model repair и совместимость посредством
missing→false не нужны. Минимум изменений — producer + общий строгий контракт
+ регрессия фактической интеграции; OpenCode исправляется в своём native decoder.
Полный gate не заменяет целевой тест и не запускается повторно на каждой правке.

Порядок приёмки: минимальные новые regressions → существующие затронутые
Node fixtures и EVAL judge/daemon-control tests → static/build → один замороженный
release profile. В отчёте указать exact commands, discoverable test IDs,
source commits и исходы. Не обещать reuse PASS beta.148 для изменённых runtime
bytes; не добавлять к каждому unit-тесту полный CLI/world bootstrap.

## 6. Проверка готовности

P1/P2/P4 определены для реализации: место записи, strict missing semantics,
race/fence ограничения, неизменность истории и producer-shaped проверки заданы.
P3 готов к реализации: точный control frame получен от установленного native,
union подтверждён закреплённым SDK; место отказа и decoder contract определены.
Все P1–P5 имеют решения и отрицательные критерии. Реализация/приёмка ещё не
выполнены: готовность плана не означает исправность engine или успех EVAL.

