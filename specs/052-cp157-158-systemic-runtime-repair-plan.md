# 052 — CP-157/158: native outcomes, hook latency, service artifacts, review revisions

Дата: 2026-09-25. Редакция 3: реализация N/H/A1–A2/A4–A6/R выполнена
в рабочих деревьях и проходит целевые проверки; A3 и общий релиз остаются
заблокированы native Grok forward-resume gate. Статус и доказательства ниже.
Продолжение [плана 051](051-boundary-snapshot-and-native-worker-provenance.md).
Исходные версии: dd-flow `8f9dd86` / beta.103; dd-eval `61542a1`.
Этот документ не объявляет исправленными исторические EVAL и не разрешает их
resume, restart, ручную правку состояния или автоматическую повторную попытку.

## Исходный согласованный объём

1. **Grok, CP-158 / `EVAL-20260924210211-e3854ed3`.** Пять native children и их
   Work завершились, но daemon пропустил `TaskOutput.MultiResult.results` и
   сохранил `running`. Добавить обработку группового результата рядом с
   одиночным `Result`; сохранить доказанную ancestry и различие между native
   завершением и результатом Work. Проверить групповые/одиночные и смешанные
   исходы, продолжение общего controller fanout.
2. **ZCode, CP-157 / `EVAL-20260924182859-b95dc363`.** MERGE заблокирован
   единственным untracked `.zcode/acp/sandbox.json`, автоматически созданным
   ACP-мостом. Игнорировать служебную директорию `.zcode/` целиком при подготовке
   проектов; необходимые артефакты собирать только явно. Проверить все пути
   materialization, status, merge и snapshot, а не добавлять исключение только
   для одного сегодняшнего файла.
3. **AGY, CP-158 / `EVAL-20260924210212-f97fb855`.** `hook.observe` не ответил
   за внутренние 10 секунд; native PreToolUse отклонил Work start до CLI.
   Поздняя обработка daemon не сохранила клиентский timeout как первичную ошибку;
   наружу вышел вторичный liveness timeout. Разделить обязательное сохранение
   hook и периодический heartbeat, согласовать сквозной deadline, сохранить
   коррелированную исходную ошибку. Точное распределение исторической задержки
   не записано; измерение/изолированное воспроизведение обязательно перед
   утверждением причины длительности и выбором чисел timeout.
4. **Luna, CP-157 / `EVAL-20260924181406-5e05b5be`.** Координатор изменил PLAN
   и aspect-map между волнами 3+1. Первые reviewers проверили revision 1,
   последний получил revision 2. Контроллер уже разделяет dispatch и semantic
   completion: повторное добавление такого разделения не является исправлением.
   Уточнить контракт волны, проверять единую исходную ревизию перед следующей
   волной; при нарушении остановить группу, не смешивать ревизии и не запускать
   автоматический invalidation/re-review.
   External-only workspace snapshot не исправляет этот native-сценарий.

## Границы работы

- Исследовать активный production-код dd-flow/dd-eval, все шесть harness adapters,
  их общие helpers/callers и релевантные tests; исходники Grok/ZCode использовать
  как проверку фактического native-контракта.
- Различать наблюдённый инцидент, доказанный дефект кода и неподтверждённый риск.
- Не превращать стабильность служебного home в самоцель: защищать только
  необходимые входы, ownership и смысл принимаемого результата.
- Повторно использовать существующие журналы, lifecycle, Git ignore, error
  receipts и test suites. Новые зависимости и универсальные frameworks не нужны.

## Дополнения по систематическому аудиту

Аудит выполнен тремя субагентами и главным агентом. Главный агент перепроверил
ключевые findings по исходникам и отдельно воспроизвёл дефекты общего
normalizer и timeout процесса. Ниже **И** — наблюдённый инцидент, **К** —
доказанный дефект/пробел контракта в коде, **П** — проверка, необходимая перед
выбором конкретной реализации. К не означает, что все перечисленные harness
уже падали на этом дефекте в живом EVAL.

Пути `src/` и `test/` относятся к dd-flow; `eval:` — к dd-eval. Исходники
проверялись в `_worktrees/dd-flow-051-implementation` и
`_worktrees/dd-eval-051-live`. Native-контракты проверены в `grok-build`,
`ZCode` и `_worktrees/zcode-acp-0.46.7` под `/Users/deksden/Documents/_Projects`.

### Карта охвата

| Контракт | Проверенные активные пути | Вывод |
| --- | --- | --- |
| Native дерево/результаты | Все 6 `dd-{grok,zcode,codex,agy,opencode,droid}*.mjs`, `controller-fanout.ts`, `vnext-fanout.ts`, fixtures | N1–N6; native settlement и Work result остаются разными фактами |
| Hooks/lease/таймауты | Все 6 bin entrypoints и daemon, `managed-daemon.mjs`, `process-json.mjs`, `native-hook-command.mjs`, `daemon-operations.mjs`, `harness-adapter.ts` | H1–H5; не нужен новый dispatch framework |
| Ошибка до EVAL | Adapter receipt → controller → `eval:lib/runner.mjs` и managed-flow client | Исправлять потерю у источника; общая обёртка уже сохраняет `details.cause`, cleanup/statistics отделены |
| Служебные файлы | `eval:lib/runner.mjs` preparation/restore/fork; `eval-snapshots.ts`, `code-checks.ts`, `external-work-launch.ts`, `vnext-merge.ts` | A1–A6; Git-ignore, snapshot payload и native recovery — разные наборы |
| Остальные Git consumers | `runs.ts`, `vnext-specify.ts`, `branch-context.ts`, `stage-lifecycle.ts`, `cleanup.ts`, `protocols.ts` | Наследуют штатный Git ignore; локальные исключения в каждом не нужны |
| Ревью | `work-registry.ts`, `controller-fanout.ts`, `delegation-instructions.mjs`, `vnext-plan-review.ts`, `vnext-code-review.ts`, external launch, stage/recovery scope | R1–R5; распространяется на PLAN-REVIEW и CODE-REVIEW, native и external |
| Native исходники | Grok TaskOutput enum, list_running, JSONL storage/load; ZCode subagents schema/query/pagination; zcode-acp sandbox | Проверен фактический формат, а не только наша fixture |

Это систематический аудит перечисленных классов дефектов с поиском по активной
кодовой базе и просмотром найденных callers. Это не доказательство отсутствия
всех возможных ошибок во всех файлах. Исторические `beta/`, старые checkpoints
и исходники продуктового task-priority приложения не объявляются заново
сертифицированными; они не являются владельцами исследуемых runtime-контрактов.

### N. Полнота и смысл native outcomes

| ID | Статус и доказательство | Исправление и минимальная регрессия |
| --- | --- | --- |
| N1 | И: Grok пропускает `MultiResult.results`; `dd-grok-daemon.mjs:241`; native `grok-build/crates/common/xai-tool-types/src/task.rs:820` допускает обе формы | Нормализовать singleton/array в одном месте. Проверить 5 завершившихся детей, mixed failure/cancel, неизвестный task ID и TaskNotFound известного ребёнка; последний требует точной диагностики, не ложного success или вечного wait. Ни один Work не объявляется успешным только по native result |
| N2 | К: OpenCode `describe` (`dd-opencode-daemon.mjs:73`) возвращает `settled:true`, но raw `children` без статусов/доказательств settlement. Общий normalizer превращает их в unknown; fanout ждёт | Передавать уже доказанное завершение дерева по каждому ребёнку через существующий `tree_observations`; idle не превращать в semantic success. Тест idle root+child+Work receipt → продолжение; busy/неизвестный child → ожидание; unbound settled child → causal reconciliation error |
| N3 | К: общий `controllerNativeChildren` не знает Codex `interrupted`; ZCode `ended.items` с `status:lost` получает fallback completed | Нормализовать документированные статусы в provider-слое: interrupted → cancelled; lost → точный blocker с неподтверждённым outcome, никогда completed. Просто unknown без causal reconciliation снова даст вечное ожидание. Оставить failed/cancelled. Table-test всех native terminal вариантов + последствия в Work reconciliation |
| N4 | К: dedup в `controller-fanout.ts` может скрыть conflicting parent/status для одного child; Grok `recordDescendant` допускает перезапись terminal запоздалым running | Конфликт ancestry сохранять как существующую provenance/reconciliation issue, не выбирать удобную запись. В одной native попытке terminal не откатывается устаревшим running; легальный новый turn того же Session различать по реальной generation/operation, не запрещать навсегда. Тест обеих очередностей, конфликтных parents, terminal→stale-running и legal new turn |
| N5 | К: ZCode `session/subagents` пагинирует `ended.items`, default20/max100; `dd-zcode.mjs` запрашивает только первую страницу и не читает nextCursor | Дочитать страницы существующим bridge, объединять по native identity; сохранить полноту и не выдавать частичный обход за полное дерево. Тест 21+ детей, несколько страниц, duplicate/ошибка/повтор cursor, lost outcome на второй странице; reuse для всех consumers subagents, включая teardown/recovery |
| N6 | К: Grok constructor (`dd-grok-daemon.mjs:178`) восстанавливает sessions, но начинает descendants пустым; persist сохраняет sessions, не outcomes | Сохранить/восстановить известные outcomes вместе с identity в существующем daemon state. Проверить только разрешённый clean recovery: completed/failed/cancelled сохраняются; unknown не становится success; legal new turn учитывается по N4. Не перезапускать текущий EVAL ради теста |

N3/N5 подтверждены схемами ZCode `packages/shared/src/zcode-protocol/index.ts`
(ended status и параметры cursor/limit) и native query/server реализацией.
Одного увеличения limit до100 недостаточно. N4 — воспроизводимая проблема
обработки входа; конкретный Grok CP-158 объясняется N1, не этой гипотезой гонки.

### H. Hook critical path и первичная ошибка

**H1 — К: heartbeat блокирует очередь persist у пяти адаптеров.**
AGY `dd-agy-daemon.mjs:219`, Grok `:179`, ZCode `:227`, Codex `:100`, OpenCode
`:70` ждут heartbeat CLI после записи состояния. `managed-daemon.mjs:182`
уже имеет timer60s при lease300s, но последовательные persist запускают новые
CLI. `runtimeProcess → process-json.commandJson` не ограничивает ожидание.
Droid `save` этой ошибки не содержит.

План: отделить durable запись от периодического renewal во всех пяти callers;
переиспользовать существующий timer/coalescing. Первоначальные register/confirm
и `assertDaemonOwnership` оставить обязательными. После confirm один раз явно
запустить существующий heartbeat timer для daemon/provider: сами register/confirm
его не запускают, удаление вызовов из persist без этого потеряет renewal.
Ограничить именно heartbeat
subprocess, учитывать последнюю подтверждённую lease и запрет нового productive
dispatch после её потери/неподтверждённого истечения. Не делать fire-and-forget
ошибки владения и не вводить глобальный timeout для любых productive CLI.
Регрессия: зависший renewal не блокирует сохранение/hook, но не даёт работать
без lease; N persist не создают N heartbeat; shutdown не висит на старом renewal.

**H2 — И/К: AGY теряет клиентский отказ.** `bin/dd-agy.mjs:13–39` возвращает
deny при RPC/admission timeout; `Runtime.rejectHook` вызывается лишь при
серверном исключении `observeHook`. Поэтому поздний успешный серверный ответ
не содержит того отказа, который уже увидела native Session.

План: сохранить структурированный окончательный итог admission с event/tool,
Session, daemon incarnation, operation/generation и исходным code/details в
существующем owned journal/receipt; расширить `rejectHook`/prompt outcome/status.
При недоступном daemon запись клиентской ошибки должна оставаться доступной
контроллеру без зависимости от второго RPC в тот же зависший daemon. Не
доверять произвольному файлу/чужому event; корреляция идёт по выданной identity.
Для timeout до ответа identity зафиксировать соответствие request/native event
и текущего operation/generation на сервере до медленной работы. Клиент сохраняет
проверяемый request ID и native payload identity без выдуманного generation;
последующая сверка либо доказывает владельца, либо оставляет outcome unknown.
Поздний allow не отменяет уже принятый deny; старый turn не отравляет новый.
Внешнее убийство wrapper без сохранённого итога даёт явное admission outcome
unknown, не выдуманную причину и не утверждение `effect=no_effect`.
Регрессии: RPC timeout+late success, admission failure после успешного observe,
foreign/stale denial, first-error retention, ошибка записи самого receipt.

**H3 — К/П: вложенные deadlines не образуют общего бюджета.**

| Harness | Сейчас | Обязательное изменение/проверка |
| --- | --- | --- |
| AGY | RPC10s + admission15s внутри native30s | Убрать H1; измерить этапы. Не менять10→30, оставляя внешний30 |
| Grok | RPC30s + admission15s внутри native30s | Вложенные операции получают оставшееся время общего deadline |
| ZCode | RPC30s + admission15s; native source default60s, допускает override | Проверить эффективный лимит установленного hook/current binary, а не считать default фактическим; затем согласовать бюджет |
| Droid | RPC25s; внутри identity≤3s + usage≤25s + admission≤25s; native30s | Usage вне критического admission пути; identity/validation остаются обязательными |
| OpenCode | session.get без явного deadline + admission15s | Ограничить identity lookup и полный hook, а не только последний subprocess |
| Codex | Отдельный native hook protocol | Сохранить существующее hook/completed error handling, добавить общий transport/lease regression |

Использовать monotonic elapsed time внутри процесса и оставшийся бюджет на
RPC/CLI, резервируя время на выдачу ответа/cleanup; не плодить новые настройки
в каждом адаптере. Передать expiry/cancellation и серверной работе hook.observe,
особенно Droid: после истечения бюджета она не должна позднее начинать admission
CLI. Для уже начатого действия сохранить uncertain/committed effect, а не
автоматический retry. Тайминги queue/state-write/renewal/admission писать кратко
в существующий diagnostic journal, без payload и секретов. В изолированном
тесте задержать heartbeat/IO и проверить причинный этап. Точная историческая
разбивка AGY не восстановима из имеющихся записей: это ограничение расследования,
а не повод назвать SQLite либо значение10 единственной причиной.

**H4 — К, воспроизведён: timeout оставляет дочерний CLI.**
`native-hook-command.mjs:11` убивает только wrapper PID, затем ждёт close;
`prepareHarnessFlowExecutable` (`harness-adapter.ts:29`) запускает реальный CLI
через spawnSync. В независимом тесте главного агента timeout500ms вернулся
через1857ms: потомок продолжал удерживать pipes.

План: переиспользовать подход owned process group из `runHarnessAdapter`/
`stopProcessGroup`; ограничить termination/settlement всей группы и закрытие
pipe handlers. Сохранить первый timeout, отдельно cleanup failure; не обещать,
что уже выполненные side effects отменены. Проверить поддерживаемые платформы;
не применять negative PID на Windows. Callers: AGY/Grok/ZCode/OpenCode.
Тест: wrapper→grandchild с inherited pipes, отсутствие позднего эффекта и
живого потомка после подтверждённого cleanup, error/overflow/cancel ветви.

**H5 — К: Droid обобщает admission error и не обязательно завершает prompt.**
`dd-droid.mjs:384–390` заменяет structured error на `droid_flow_rejected`;
`handleObservationError:246` не считает timeout/rejected фатальным отказом
owned hook. Собственный timeout ограничен SIGTERM прямому PID.
План: переиспользовать structured subprocess/error transport из H4; отделить
необязательный telemetry failure от отказа admission текущего turn. Исходный
code/details и identity доходят до controller; отказ чужого hook его не
прерывает. Тест в существующих droid fixtures, включая ignored telemetry error.

**H6 — К, выявлен при runtime-sensitive проверке реализации: control-worker startup.**
`run-control-worker.ts::waitForControlWorkerAdmission` ждал фиксированные 5 секунд
до публикации managed-process lease и затем помечал `starting` как `failed`, даже
когда уже запущенный detached child был жив и обладал зафиксированной физической
identity. Под нагрузкой реально получен `run_control_worker_start_timeout` при
живом процессе. Исправление: по истечении короткого ожидания подтверждённо живой
child остаётся `pending` под тем же durable control intent/launch record; мёртвый
child даёт точный timeout и может быть реконсилирован только по штатным identity
checks. Не повторять физический запуск по одному таймауту и не объявлять stop
settled до capture. Детерминированный тест различает live/dead child; исходный
run-control suite повторяется после новой сборки без конкурирующей нагрузки.

### A. Владение артефактами вместо контроля всего home

**A1 — И: `.zcode/` отсутствует в общей подготовке Git.**
Расширить `eval:lib/runner.mjs:226 ignoreEvalLocalState`, существующие callers:
canonical clone, fresh E2E/baseline, task materialization после restore и fork.
Штатный Git local exclude исключает директорию целиком, не меняя checkpoint
commit. Сохранить прежние записи/idempotency. Разрешать путь info/exclude через
Git, если helper поддерживает linked worktree; отсутствие такого caller сейчас
не выдавать за историческую причину сбоя.

Tracked файлы нельзя молча удалить/скрыть: Git ignore штатно оставляет их
продуктовыми. В рассматриваемом EVAL tracked `.zcode` отсутствует. Если будущий
проект сознательно хранит там важную конфигурацию, сохранить её как явный input;
не превращать пользовательское «игнорировать служебную папку» в потерю данных.
Тест: произвольные новые файлы/подпапки, force-tracked файл, fresh/restore/fork.

**A2 — К: raw snapshots и external clone не следуют Git-ignore.**
`eval-snapshots.ts:69,240,556,747,865,997,1012` копирует/хеширует raw tree;
`external-work-launch.ts:45` имеет ещё один независимый blacklist. Поэтому A1
сам по себе не убирает `.zcode` из source drift и recovery payload.
План: одна небольшая project-payload predicate/selection, используемая copy,
source hash, modes hash, recovery compare и reviewer copy. Provider-owned
untracked `.zcode` исключена; tracked/явно необходимые project inputs сохранены.
Tracked/explicit набор определить до обхода: нельзя отсечь всю `.zcode` ветку,
если в ней есть такой input. Для смешанной папки сохранить нужные entries либо
выдать ownership conflict до запуска, если выбран исключительно служебный
контракт. Тест содержит одновременно tracked `.zcode/config` и untracked
`.zcode/acp/sandbox.json`; автоматический `git rm` не допускается.
Не исключать все ignored/untracked файлы: `.dd-eval/task.md` и незакоммиченная
продуктовая работа нужны. Тест: служебный churn не инвалидирует snapshot,
продуктовая правка инвалидирует; task context и tracked input переживают restore.

**A3 — К: Grok home всё ещё принимается по blacklist.**
`eval-snapshots.ts:762 grokDiagnosticPath` исключает известные memtrace/log/cache,
но любой новый неизвестный файл снова становится обязательным immutable input.
Это не соответствует обсуждённому контракту и должно быть заменено.

План: явно различить три набора — dd-flow-owned RUN evidence; native state,
нужный конкретному поддерживаемому resume/import; необязательная диагностика.
Только первые два участвуют в semantic snapshot. Неизвестный файл native home
не добавляется автоматически. Выбирать native sessions по retained identity,
не копировать чужие Session. Использовать существующие export/import helpers,
без нового универсального snapshot framework. Целостность уже опубликованного
sealed payload остаётся строгой; изменяется состав исходного payload.

Начало точного Grok перечня проверено по
`grok-build/.../session/storage/jsonl/mod.rs:1594,1645`: resume читает summary,
chat history, plan/plan-mode, signals, announcement, goal и workflow state;
updates нужны полному load и восстановлению пустого chat history. Rewind,
attachments/assets и referenced checkpoints имеют отдельные consumers. Поэтому
нельзя объявить единственный `summary.json` достаточным. Перед переключением
политики составить короткую таблицу «файл/consumer/зачем сохраняем» по этим
существующим loader/export paths и подтвердить archive→import→native load/resume
без продуктивного prompt. Одного inspect summary недостаточно: загрузить root и
retained children, проверить chat/updates, plan/workflow и referenced
attachments/checkpoints после relocation. Отсутствие required artifact даёт
явный отказ, добавление неизвестной диагностики не меняет результат.
Аналогично проверить объявленные recovery capabilities
остальных пяти adapters. Не распространять требование immutable на home целиком.

**A4 — К, приоритет безопасности: Droid credentials попадают в payload.**
`dd-droid.mjs:46–51` копирует `auth.encrypted`, `auth.v2.key`, `auth.v2.file`,
`auth.json` в managed home. `eval-snapshots.ts:753` исключает лишь последнее
из этих четырёх имён. Shutdown-cleanup не защищает snapshot живого daemon.
Исключить credential-набор из всех runtime/auxiliary/recovery payload и source
proof; проверить синтетическими маркерами, без чтения реальных credential bytes.
Fixtures должны существовать до остановки daemon; проверить обычный stage
boundary и `captureRecoveryAuxiliary`, отсутствие и в payload, и в source drift.
Проверка только после shutdown-cleanup не доказывает исправление.
Авторизация после восстановления берётся из разрешённого operator source,
не из sealed snapshot. Проверить ранее созданные payload только по путям/metadata;
если обнаружится сохранение секретов, отдельно сообщить владельцу. Удаление
архивов/ротация credentials не выполняются автоматически этим планом.

**A5 — К: MERGE скрывает tracked `.agents/hooks.json`.**
`vnext-merge.ts:379` исключает путь целиком; AGY installer сохраняет там также
пользовательские handlers (`dd-agy-daemon.mjs:65–105`). Следовательно, реальные
tracked изменения могут исчезнуть из проверки clean/commit, хотя check/review
fingerprint продолжает их видеть.
План: квалификация устанавливает/проверяет только owned dd-flow handlers до
продуктивного baseline; повторный запуск не переписывает неизменный файл.
Сохранить пользовательские handlers и запрет конфликта с живым чужим owner.
Убрать безусловное скрытие tracked пути. Local ignore допустим лишь для нового
полностью управляемого untracked файла; смешанный пользовательский файл не
игнорировать целиком. Проверить legal install, idempotency, stale/foreign routing,
tracked user modification и согласие Git/review/check/MERGE. Транспортный H2
не чинится переустановкой hooks.

Установка и привязка запуска — разные операции. Сейчас команда содержит
абсолютный `--state-dir`, а `prepare` отклоняет другой state directory: одной
проверки byte-idempotency недостаточно для обещания «установить один раз».
Целевой контракт: при квалификации устанавливается стабильный owned entrypoint;
при запуске существующий launcher передаёт привязку к pinned engine, daemon и
RUN через свой execution environment. Hook проверяет её против retained
identity/ownership; входной native payload сам не выбирает произвольный runtime.
До реализации проверить наследование binding root→child в AGY. Если native
процесс его не переносит, использовать проверенный scoped discovery механизм
этого provider и явно зафиксировать ограничение квалификации; не вводить
глобальный указатель «последний daemon» и не возвращаться к переписыванию
пользовательского файла на каждый turn. Тест: два независимых запуска, stale и
foreign binding, повторная квалификация, relocation, пользовательские handlers.
Обновление hooks в operator homes не меняет pinned runtime уже идущего EVAL.

**A6 — К: fingerprint меняет семантику при любой ошибке Git.**
`code-checks.ts:401` после любого ненулевого exit `ls-files` сканирует filesystem;
соседний `workspaceChangedPaths` разрешает fallback только для настоящего
nonrepository. Nongit scan также включает `.zcode`.
План: переиспользовать корректную классификацию nonrepo vs Git error; настоящий
gitless workspace использует A2 policy, испорченный Git/permission error явно
останавливает оценку. Не выдавать новый файловый набор за прежний fingerprint.
Тест: nonrepo, повреждённый Git, ошибка доступа, tracked+ignored service paths.

### R. Единая ревизия ревью и реальные границы read-only

**R1 — И: координатор исправляет PLAN между волнами.** В реальном transcript
на19:14:37Z координатор объявил коррекцию после трёх reviewers, на19:18:16Z
запись завершилась; четвёртый dispatch пришёл19:19:14Z. В своём финале первой
волны он признал ошибочную правку и отсутствие RG-4. Контроллер не выдавал
`semantic_completion` между этими волнами.

План минимальной коррекции:

1. В общей delegation continuation явно указать phase=dispatch, размер **всей**
   группы, текущие Work и оставшиеся; запретить изменение review inputs и
   применение findings; после settlement именно текущей волны немедленно
   вернуть управление. Не дублировать шесть provider-промптов.
2. `assertWorkLaunchReady`/startBoundWork и controller перед dispatch проверяют
   общую принятую ревизию, если baseline уже существует. Контроллерная проверка
   экономит запуск; shared Work-start проверка закрывает direct/external CLI
   callers. Отказ до claim/provider launch с различимой причиной input drift.
3. Сохранить проверку последнего reviewer под SQL writer reservation: она
   предотвращает одновременный пропуск барьера двумя finish, но не блокирует
   произвольную файловую запись модели и не является filesystem snapshot.
   После полной группы разрешать штатную correction phase и прирост PLAN revision — это
   легальная работа, не нарушение неизменности.
4. Если baseline уже нарушен, остановиться с исходной ревизией/изменёнными
   компонентами и affected Work. Не автоматически принимать старые результаты,
   менять baseline, откатывать авторские правки или запускать новый цикл.

Это обеспечивает корректность принимаемого ревью и ранний blocker, но не даёт
обещания абсолютного послушания модели. Текущий запрос требует остановки на
blocker. Автоматический re-review/repair engine не добавляется: прежний PLAN
контракт явно не запускает второй круг автоматически. Решение о таком поведении
потребует отдельного продуктового контракта, а не скрытого retry.

**R2 — К: общая worker-инструкция противоречит read-only роли.**
`work-registry.ts:775–795 renderWorkerPrompt` для reviewer тоже выдаёт generic
read/write boundary и совет исправлять project-owned source/config после
неуспешного Finish; read_only учитывается при проверке, но не при выборе этого
completion текста. CODE reviewer task называет роль read-only, PLAN task
дополнительно запрещает правки — общая инструкция всё равно двусмысленна.
План: одна ветвь по существующему payload.read_only. Только чтение project/RUN
inputs; запись исключительно своего result-input и разрешённых evidence outputs;
drift/admission/infrastructure failure сообщать, не «лечить» исходники.
Явно назвать рабочий каталог после lifecycle start и разные роли project_root,
workspace_root, run_root. Сам первый lifecycle command выполняется с inherited
cwd согласно существующему identity-контракту. Тесты native/external PLAN/CODE
reviewers и обычного CODE worker, которому право исправлять исходники нужно.

**R3 — К: external clone изолирован лишь частично и не проверяется как input.**
`external-work-launch.ts:45` создаёт копию на каждый Work; сохраняет symlinks,
убирает `.git`, оставляет absolute RUN refs. `startBoundWork:442` подставляет
clone в prompt, но fingerprint `:460` и settlement `:642` относятся к original.
Поэтому reviewer может изменить собственную копию и завершиться без изменения
original; текущий тест проверяет лишь cwd и наличие одного файла.

План: не называть копию security sandbox. Сохранять привязку execution workspace
и его baseline в уже существующем start receipt/context; перед принятием result
проверять фактические review inputs этой копии и authoritative input группы.
Применять A2 при копировании; source version должен быть проверен до/после copy,
и перед Work start, иначе copy time и first-review baseline расходятся.
Для ссылок использовать существующий containment pattern `explicitInputFiles`:
внутренние относительные ссылки работают в копии; ссылки наружу/в original
не выдавать за изолированные inputs — явно материализовать разрешённый input
или отклонить неподдерживаемый случай до запуска. Не удалять symlinks в проекте.
Git-зависимому ревью дать заранее собранные base/diff evidence; не копировать
живую `.git`-ссылку на control data и не принуждать reviewers запускать Git в
gitless clone. Тест: запись в clone, source change во время copy, symlink,
CODE diff evidence и несколько последовательных reviewers.

**R4 — К: review baseline публикуется в файл внутри откатываемой SQL-транзакции.**
`sharedReviewInput:610–626` пишет/rename work-context до bindSession/SQL commit
в `startBoundWork`. При последующем отказе SQL откатывается, файл с fingerprint
остаётся, хотя первого принятого reviewer ещё нет.
План: сделать авторитетным baseline первого **committed** start receipt этой
группы (в нём уже хранится context/fingerprint); stage JSON — восстанавливаемая
проекция после commit, аналогично существующей публикации Work packet. Не
добавлять распределённую транзакцию или новую таблицу ради одного hash.
Scope обязательно включает parent Work, kind и review cycle/generation:
CODE-REVIEW может использовать общий root Work между циклами. Тест fail после
расчёта fingerprint до commit, retry, recovery и новый code-review cycle.

**R5 — К: workspace hash не охватывает отдельные RUN review inputs.**
Reviewer читает `03-plan/<protocol>/aspect-map.json`, batch/report/CODE evidence
в RUN home; `sharedReviewInput` хеширует только workspace_root. Полный RUN home
хешировать нельзя: туда штатно пишутся новые results/journals.
План: дополнить существующий stage context точными input refs/checksums для
входных aspect maps, принятого PLAN/CODE report и batch, используемых данным
review cycle. Использовать уже имеющиеся plan_checksum/batch_checksum/
code_report_sha256, не вводить параллельный registry. Проверять при dispatch,
start и принятии группы; исключить outputs текущего ревью. Тест изменения
aspect-map без изменения workspace, обычной записи sibling result, легальной
коррекции после завершения группы и восстановления committed baseline.

Общий immutable snapshot всей группы для всех native harness не выбран как
обязательный первый фикс. Он расширяет routing, absolute references, Git и
recovery контракт. R1/R2/R4/R5 используют существующие механизмы; R3 закрывает
уже добавленный external-copy путь. Новый snapshot потребуется только если
проверки покажут, что установленный input-контракт нельзя удержать без него.

## Порядок реализации и критерии завершения

Статусы реализации зафиксированы в конце документа. Готовность отдельных
пакетов не означает готовность релиза. Изменения выполнять в чисто определённом working tree, сохраняя чужие
изменения; не править published runtime внутри существующих EVAL.

1. **P0 / безопасный payload и bounded transport:** A4 и H4; synthetic regressions
   до остальных изменений. Проверка исторических credential-путей отдельно от
   удаления/ротации. Ни один timeout не выдаётся за подтверждённый no-effect.
2. **P1 / native outcomes:** N1–N6 в provider normalizers + общем fanout;
   расширить `test/fixtures/grok-adapter.mjs`, OpenCode/ZCode/Codex fixtures,
   `test/vnext-fanout-storage.test.ts`. Зелёный native child никогда не заменяет
   отсутствующий Work finish; unknown/lost остаётся видимым blocker.
3. **P2 / hook critical path:** H1, затем измерения H3, затем H2/H5 с H4 transport.
   Fixtures `managed-daemon`, `agy-state-boundaries`, Droid и
   `test/harness-runtime-assets.test.ts`. Deadline фиксируется по проверенной
   общей цепочке; не обещать, что30 секунд всегда достаточно без измерений.
4. **P3 / service ownership:** A1/A2/A5/A6 и явная native selection A3;
   `eval:test/task-input-preparation.test.mjs`, snapshot/bootstrap/recovery,
   merge/check suites. A3 native loader/export inventory и roundtrip являются
   обязательным gate до замены selection; незнакомый home-файл не становится
   новым обязательным input. На tracked project data integrity не ослабляется.
5. **P4 / review consistency:** сначала R4/R5 — committed baseline, scope и
   точный состав inputs; затем R1 и R3 — consumers этого контракта. R2 можно
   делать независимо, но его интеграционная приёмка проходит вместе с R1.
   Проверки до dispatch, при start и final settlement разделены по назначению;
   используют один input-контракт. Не чинить нарушение baseline изменением
   hash или replay. R3 также зависит от A2 и relocation-контракта ниже.
6. **P5 / выпуск и свежая квалификация:** typecheck/build/lint, affected suites,
   затем штатные release/runtime-sensitive gates. Упакованный candidate smoke,
   новый pinned engine/checkpoint; квалификация hook/binary/model profiles.
   Codex — через `cx`/`~/.codex-cpa`; Luna `gpt-6-luna xhigh`, judges/sol
   `gpt-6-sol high`; ZCode — текущий квалифицированный бинарь. Авторизацию не
   переносить из старых payload. Устаревшие результаты не переименовывать в PASS.
7. **P6 / controlled live verification:** отдельным шагом после реализации и
   preflight PASS — новые EVAL IDs для четырёх harness без дубликата живого
   запуска. Этот документ не является действием запуска. Критерии: Grok
   проходит multi-child PLAN-REVIEW; AGY child реально выполняет start/finish без
   скрытого отказа hook; Luna сохраняет одну ревизию при волнах3+1 и корректно
   применяет findings после них; ZCode проходит MERGE guard с обычным `.zcode`
   churn. Новый blocker → остановка и read-only разбор, без manual repair.

### Обязательные негативные проверки

- Реальная правка product input во время ревью/capture по-прежнему обнаруживается.
- Отказ/потеря native child, foreign ancestry и lost lease не становятся success.
- Поздний результат hook не разрешает действие после timeout и не портит новый turn.
- `.dd-eval/task.md`, untracked product work и tracked user hooks не исчезают.
- Все reviewed результаты относятся к своей ревизии, группе и cycle; после
  корректной semantic correction не срабатывает прежний read-only barrier.
- Нет синтетического parent ID, автоповтора ambiguous command, замены первичной
  причины cleanup error, реконструкции credential из snapshot.

## Проверка готовности к реализации — редакция 2

Повторная проверка выявила пробелы не в списке основных инцидентов, а в
совместимости, переходных состояниях и зависимостях предлагаемых исправлений.
Ниже обязательные дополнения к N/H/A/R, а не новый параллельный проект.

### 1. Старые receipts, snapshots и перенос путей

По `eval-snapshots.ts:488–520` при восстановлении меняются operational paths,
но `work_sessions.start_receipt_json` и исторические packets сохраняют прежние
байты. Поэтому R3/R4 нельзя реализовать чтением абсолютного старого пути из
receipt с последующим обращением к нему как к текущему workspace.

- Новые input refs хранить относительно явно названного workspace/RUN root;
  физические пути разрешать существующим relocation-контрактом. Исторический
  receipt остаётся доказательством, а не редактируемым указателем на новую ФС.
  Для legacy absolute refs применять проверенное отображение import roots,
  не произвольную замену подстрок; требовать containment в целевом root.
- Проверка sealed payload остаётся полной. `treeHash`/`treeModesHash` сейчас
  по умолчанию проверяют весь payload; новые A2/A3 exclusions применяются к
  **выбору источников для нового capture**, не к проверке уже запечатанного
  архива. Иначе старый повреждённый архив можно ошибочно признать целым.
- Зафиксировать версию selection/input-контракта в новых manifests/receipts
  существующим способом версионирования. Не заводить новую таблицу/registry.
  При несовместимом формате использовать штатный schema transition; отсутствие
  поля в legacy не подменять текущей политикой и не пересчитывать старые hashes.

| Старые данные | Разрешённое поведение нового reader |
| --- | --- |
| Sealed snapshot старой схемы | Проверить исходный payload исходным алгоритмом; не обрезать/переопубликовывать архив |
| Grok state без retained outcomes | Сохранить identity, обозначить неполноту; при необходимости settlement получить доказательство либо causal blocker, не успех по пустому массиву |
| Review receipt без новых RUN-input checksums | Читать/показывать историю; не утверждать новый review acceptance по сегодняшним байтам как будто это старый baseline |
| Recovery с переносом root | Использовать relocation projection, сохраняя исторические receipts и их checksums |
| Новый pinned runtime со старым неподдерживаемым resume-контрактом | Явный compatibility отказ до productive mutation; не скрытый запуск с ослабленными проверками |

Regression: legacy/current fixtures, restore в другой путь, отсутствующий старый
путь, запрет обращения к ещё существующему старому workspace, изменение любого
байта sealed payload. Inspection старых результатов не блокировать только из-за
невозможности нового acceptance/resume. Переход existing EVAL на новый runtime
этим планом не предусмотрен.

### 2. Native artifacts нужны конкретной операции, не каждому snapshot

A3 inventory должен для каждого поддерживаемого provider содержать:
artifact/ref → consumer → назначение → required/optional → способ relocation →
поведение при отсутствии. Нужность определяется контрактом операции:

| Назначение snapshot | Минимальный контракт |
| --- | --- |
| Bootstrap / stage-entry с новой native Session | Product inputs и dd-flow stage evidence; не требовать историю старой native Session только ради свежего старта |
| Candidate / incomplete evidence | Достаточно доказательств оценки/разбора; native resume artifacts обязательны только если snapshot объявляет resume capability |
| Recovery с native resume | Явно выбранные loader dependencies retained root/children и их referenced artifacts; проверенный native load после relocation |

Сначала сверить эти цели с существующими capture/restore callers; не менять
заявленную capability молча. Для пока не проверенного provider сохранять явно
обозначенную неподдерживаемую capability, а не fallback «скопировать весь home».
Удаление диагностических файлов из обязательного proof не требует нового
diagnostic archive subsystem. Проверка A4 распространяется на все payload paths
независимо от назначения.

### 3. Полнота наблюдения и новая попытка ребёнка

- N4: generation корневого prompt сама по себе не доказывает новый execution
  дочерней Session. Определить producer evidence нового child turn и использовать
  его, если оно есть. Без него конфликт terminal/running не разрешать ни вечным
  terminal latch, ни безусловным воскрешением. Activity и terminal outcome —
  разные поля наблюдения. Проверить повторный child turn внутри одной root phase.
- N5: обход страниц укладывается в существующий observation deadline. Проверять
  повтор cursor и согласованность revision; повторное чтение при изменении
  revision также ограничено этим бюджетом. Частичная/неудачная выборка сохраняет
  диагностику, но не становится полным деревом для settlement/dispatch.
- Не приравнивать всякий `unknown` к ошибке: живой child с текущим owner может
  законно исполняться. `lost`, конфликт provenance и недоступность обязательного
  terminal evidence должны доходить до causal reconciliation, а не маскироваться
  бесконечным wait. Проверить обе ветви controller, не только output normalizer.

### 4. Полный hook lifecycle, включая неопределённый эффект

- H1 timer запускается один раз после успешного confirm, не дублируется при
  повторном confirm и прекращается при завершении lifecycle. Конкурентные hooks
  не ждут heartbeat. Его сбой не отменяет ownership/lease gate.
- H3: `performance.now()` разных процессов нельзя сравнивать напрямую.
  Передавать оставшийся бюджет с учётом транспорта и фиксировать локальное
  начало на принимающей стороне; исходный client deadline не продлевать.
  Перед admission проверять cancellation/expiry, полученные от клиента.
- H2/H4: crash/timeout после старта CLI не доказывает отсутствие эффекта.
  Повтор того же native event должен сохранять прежнюю correlation и исходный
  отказ, не запускать ambiguous command заново. Если outcome нельзя доказать,
  остановить текущую операцию с uncertain effect. Late reply не разрешает
  отменённое действие; это не обещание отката уже совершённой записи.
- Проверить параллельные hooks нескольких детей, оборванную последнюю запись
  journal и сбой сохранения error receipt. Использовать существующую семантику
  journal/receipts, не создавать вторую очередь или отдельный сервис.
- H4 приёмка обязательна на текущем macOS/POSIX и других заявленных release
  платформах. Windows-ветвь не использует negative PID; неподдерживаемое tree
  cleanup нельзя обозначать как подтверждённое. Не добавлять новый platform
  backend, если Windows не является поддерживаемой целью этого релиза.

Уточнение ZCode по source: `packages/shared/src/workspace-hook-config.ts`
задаёт default60000ms и допускает per-hook override `timeoutMs`/`timeout`.
Это не измерение effective deadline установленного бинаря. Qualification должна
зафиксировать именно эффективное значение. Исторический AGY time breakdown
по-прежнему неизвестен; новый synthetic timing test докажет путь задержки,
но не восстановит отсутствующую историческую телеметрию.

### 5. Единый review contract до первого и после последнего reviewer

- R4/R5: baseline первого committed reviewer обязан соответствовать уже
  принятому stage PLAN/batch/CODE evidence. Нельзя легализовать правку между
  stage acceptance и первым start, просто сняв новый hash с текущих файлов.
- Scope: parent Work + review kind + cycle + execution generation. Проверить
  конкурентные первые starts, rollback первого, failed/cancelled последний
  reviewer, новый cycle и recovery. Не принимать смесь старых и новых reviews.
- R3: `DD_FLOW_READ_ONLY_WORKSPACE` — транспорт cwd, не доказательство его
  принадлежности. Проверять соответствие committed launch/Work identity и
  выбранной execution copy. Source и clone сравнивать по одинаковому набору
  **логических inputs**, а не требовать равенства raw hashes деревьев с разными
  `.git`/служебными файлами. Отдельно проверять изменения execution copy.
- Проверка original + copy обнаруживает drift, но не делает файловую систему
  атомарной и не заменяет sandbox. Промпт снижает вероятность правки, не
  гарантирует послушание модели. Минимальный успех фикса: ошибочная межволновая
  правка не принимается, а корректная группа3+1 проходит и затем может применить
  findings. Если модель продолжает нарушать контракт, это новый blocker,
  а не основание автоматически включить replay или ослабить guard.

### 6. Вход в реализацию и выход из каждого пакета

Порядок зависимостей уточнён: H4→H2/H5; H1→измерение H3; A2→R3;
R4/R5→R1/R3; A3 inventory→native roundtrip→замена selection. A4, N1–N3,
A1 и независимые regressions можно начинать без ожидания остальных gates.
H2 correlation contract можно реализовывать до подбора окончательных чисел H3.

Для каждого finding N/H/A/R в этом документе при реализации добавить статус,
commit, точную команду regression и результат. Не создавать отдельный трекер.
Минимальная приёмка пакета:

1. Негативная fixture воспроизводит дефект на исходном коде; после фикса она
   проходит вместе с положительным sibling-сценарием. Existing PASS не заменяет
   такую проверку. Тесты не требуют реальных секретов, продуктивных prompts или
   изменения исторических EVAL.
2. Выполнены `pnpm typecheck`, `pnpm build`, `pnpm lint` и затронутые suites.
   Выбор существующих suites: native/fanout — `vnext-fanout-reconcile`,
   `vnext-fanout-storage`; hooks — `hook-responsibility`, `hook-ingress`,
   `harness-runtime-assets`, `codex-hook-delivery`; payload — `eval-snapshots`,
   `runtime-recovery`; review — `stage-consistency`, `external-work-launch`,
   `work-receipt-publication` (имена `test/*.test.ts`). Native fixtures также
   запускать штатным runner, который реально исполняет изменённые assets.
3. До candidate: штатные `pnpm test:release`, `pnpm test:integration`,
   `pnpm test:runtime-sensitive`; зависший/прерванный suite не считать PASS.
   Проверить packaged assets тем же binary/entrypoint, который получит EVAL,
   а не только TypeScript source. Зафиксировать engine commit/version и
   квалифицированные provider/config/model tuple в существующих receipts.
4. Закрыты gates конкретного пакета: A3 — точный inventory/native load; A5 —
   root/child launch binding; H3 — измеренный budget/effective native deadline;
   N4 — доказанное различение child execution. Не оставлять в implementation
   произвольный fallback там, где план требует этого решения.
5. Обновлены связанные runbooks. Никакой hot replacement внутри активного RUN;
   операторские homes обновляются отдельным штатным шагом квалификации.

Итог readiness: **план достаточен для начала поэтапной реализации**. Gates выше
— конкретные проверяемые работы внутри неё, а не обещание уже пройденной
квалификации. До их закрытия соответствующие пакеты и общий релиз не принимать.
Полное устранение практических blockers четырёх harness подтверждается только
P6, отдельно от доказательства корректности guards/normalizers.

## Проверки, уже выполненные при составлении плана

Это диагностика существующего кода, не проверка ещё не написанных исправлений:

- Независимые in-memory проверки главного агента: Codex interrupted → unknown;
  duplicate child с конфликтными parents скрывает конфликт; timeout500ms через
  wrapper→grandchild вернулся спустя1857ms. Использован реальный код helpers,
  процесс-потомок завершился самостоятельно; EVAL процессы не затрагивались.
- Субагент воспроизвёл OpenCode settled receipt→unknown child, Grok
  completed→running overwrite и ZCode lost→completed. Главный агент проверил
  соответствующие producer/consumer участки и native schemas по исходникам.
- Субагент выполнил существующую целевую native-fixture выборку через
  `node --test --test-name-pattern` для Grok/Codex/OpenCode/AGY/Droid/ZCode и
  session-settlement: **18/18 PASS**. Это отдельный запуск; в число44 ниже не входит.
- Запущено: `pnpm exec vitest run test/stage-consistency.test.ts
  test/vnext-fanout-storage.test.ts test/external-work-launch.test.ts
  --pool=forks --no-file-parallelism` — **44/44 PASS, 3 suites**, 52.19s.
  Это показывает, почему существующий зелёный suite недостаточен: он проверяет
  final drift и отдельную cwd-копию, но не рассматриваемые межволновые и native
  protocol edge cases. Полный release gate в этом планировании не запускался.

## Проверка плана по `$ponytail` (full)

1. **Нужно ли вообще:** убрать контроль неизвестного home-содержимого и лишний
   heartbeat на каждый persist; сохранить лишь проверки с конкретной целью
   (ownership, единая ревизия, целостность принятого evidence, отсутствие secrets).
2. **Уже есть:** Git exclude helper; runtime snapshot classifier; lease timer;
   owned process termination; structured errors; hook rejection; Work start
   receipts; sharedReviewInput; native tree observations. Использовать их.
3. **Минимальный общий фикс:** N3/N4 в общем normalizer с provider mapping;
   H1/H4 в shared helpers и малых callers; A1 в одной preparation функции;
   R1/R2 в общих prompt/start путях. Не чинить каждый EVAL отдельной веткой.
4. **Отклонено:** просто10→30; `.zcode/acp/sandbox.json`-only exception; безусловный
   игнор tracked файлов; «всё Git-ignored не нужно»; пересоздание детей по тишине;
   повторное разделение уже разделённых controller phases; clone как обещание
   sandbox; новый универсальный hook/snapshot framework, event bus, dependency,
   auto-repair/re-review engine и всеобщая неизменность provider homes.
5. **Что нельзя упростить:** native identity, distinction settlement/success,
   lease ownership, provenance conflicts, secret exclusion и причинная ошибка.
6. **Проверяемость:** у каждого пакета есть минимальный regression в существующем
   suite; приёмка включает положительный ход и конкретную ошибку, а не только
   проверку строки промпта или успешный запуск процесса.

Дополнительное peer-review плана учтено: явный запуск lease timer после confirm;
корреляция hook timeout до identity reply; deadline серверной admission;
mixed tracked/untracked service directory; native load вместо одного inspect;
различие SQL reservation и filesystem fence; credential fixture до shutdown.

Изменения operational docs выполнять вместе с реализацией:
`runbooks/update-harnesses.md` (квалификация/обновление hooks и binary, service
ownership), `execute-eval.md` (preflight/materialization), `e2e-monitoring.md`
(native vs Work status, first cause, late hook), и описание snapshot/recovery
payload (зачем сохраняется каждый native artifact). Исправить нынешнее обещание
external reviewer isolation: cwd-копия сама по себе не является sandbox.

## Завершение плана

- [x] Зафиксирована карта проверенных production-путей и ограничений аудита.
- [x] Для каждого подтверждённого дефекта указаны причина, общий участок фикса,
      затронутые callers, регрессия и критерий приёмки.
- [x] Непроверенные предположения отделены от обязательных исправлений.
- [x] Проведена финальная проверка по `$ponytail`.
- [x] Подготовлен итоговый доклад о дополнениях; текущий ход реализации указан ниже.

## Ход реализации — 2026-09-25

Эта секция уточняет прежнюю пометку «реализация остаётся отдельным шагом»:
работа начата в `_worktrees/dd-flow-051-implementation` и
`_worktrees/dd-eval-051-live`. Изменения пока не опубликованы и не заменяют
движок или hooks уже идущих EVAL; commit/release identity появится только после
закрытия всех gates. Старые EVAL не возобновлялись и не переписывались.

| Пакет | Состояние и проверка |
| --- | --- |
| N1–N6 | Реализованы нормализация native outcomes, provenance, pagination ZCode и retained Grok descendants. Целевые native/adapter/fanout suites прошли; общий набор повторно выполняется перед выпуском. Native settlement по-прежнему не означает успешный Work. |
| H1–H6 | Реализованы bounded hook transport, lease renewal вне persist, сквозной admission budget, причинная ошибка и Droid/AGY ветви; выявленный позднее control-worker startup оставляет живого owner pending. Изолированные hook/AGY tests прошли; Windows process-tree ветвь проверена синтетически, не нативным Windows запуском. |
| A1/A2/A4/A5/A6 | Реализованы service-path policy, `.zcode` и credential exclusions, AGY qualification до baseline с check-only без записи, точная ownership-классификация в MERGE/fingerprint/snapshot и перенос только canonical untracked hook в feature worktree. Целевые tests прошли; старые credential payload проверены только по именам путей. |
| R1–R5 | Реализованы dispatch phase, принятые PLAN/CODE input checksums, baseline из первого committed Work start receipt, copy/source checks и read-only prompt. Последующий аудит добавил cross-generation review barrier, framing hash, fail-closed copy receipt и AGY external reviewer qualification. Целевые/integration tests выполняются. |
| A3 | **Требует решения по поддерживаемой гарантии.** Native Grok `session/import` переносит metadata/updates, но не sidecars. Isolated root+child native load проходит даже когда asset отсутствует, а `<image_files>` продолжает ссылаться на удалённый source home. Подробный [inventory](../runbooks/native-payload-inventory-052.md) и исполняемый `flow:test/fixtures/grok-native-import-gate.mjs`. Production selector/blacklist не заменены догадкой. Для переносимого продолжения той же native Session требуется sidecar manifest, validated reference rebasing и no-source load/read gate. Однако stage-entry import уже останавливает старые Sessions, снимает их owner leases и начинает новый experiment; ему перенос старой Session не нужен. Перед выбором реализации отделить его evidence payload от recovery, которое сейчас само объявляет `native_session_portability: requires_adapter_verification`. |
| P5/P6 | Build и `test:release` проходят; общий кандидат, установка в operator homes и четыре новых scored E2E **не выполнялись**: A3 support contract не выбран. Свежая отдельная AGY native-проба на установленном `agy 1.2.11` дополнительно остановилась до первого turn с `Eligibility check failed: ... not currently available in your location`; это внешний provider blocker, а не hook timeout. Версия отличается от прежнего pin и требует новой квалификации после устранения доступа. Preflight и provider eligibility не подменяются историческими PASS. |

Проверенные команды этого этапа: `pnpm typecheck`, `pnpm build`,
`pnpm test:release`, целевые `vitest` для review-copy/stage-consistency/
external-work-launch (40/40), review-input/external launch (30/30),
external-review-lifecycle (3/3) и реальный review recovery (1/1). Полный
`pnpm lint` после исправления import `Buffer` в новой Grok fixture — PASS.
Объединённый runtime suite дал 130/132: только два старых fixture ceilings
(30s) сработали под нагрузкой. Оба сценария отдельно прошли с 60s пределом
(fork snapshot 41.49s, ZCode daemon 30.10s); исправления касаются только
тестовых лимитов, не runtime admission. После них выборка EVAL fork tests
прошла 15/15. Дополнительно обнаружен H6; адресный control-worker набор после
новой сборки прошёл 3/3. Полный suite дал 12/14: два оставшихся падения были
исключительно потолками Vitest 45/60s и hook cleanup 10s под нагрузкой;
после увеличения только тестовых потолков эти два сценария прошли 2/2. Все
14 случаев таким образом проверены, но единый полный PASS ещё не получен.
Повторные `pnpm typecheck`, `pnpm lint` и `pnpm test:release` после H6 — PASS;
полные
`test:integration`/`test:runtime-sensitive` не объявлены пройденными.

Перед публикацией обновить эту таблицу фактическими результатами повторных
suite и commit SHA. Нельзя считать план полностью выполненным, пока A3 и
P5/P6 остаются открытыми.
