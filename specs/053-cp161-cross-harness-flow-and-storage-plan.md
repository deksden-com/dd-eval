# 053 — CP-161: единый контракт флоу, рабочие каталоги и короткие SQLite-транзакции

Дополнение CP-168/169 (2026-09-27): полный live acceptance всё ещё открыт.
ZCode `EVAL-20260927053628-db4a547f` прошёл собственный baseline,
SPECIFY/HITL, PROTOCOLIZE и PLAN, но в PLAN-REVIEW завершился
`completed_with_failures`: два параллельных `work start` материализовали один
и тот же committed start packet. Второй publisher получил нулевой SQL CAS
после того, как первый поставил `published`, и ошибочно сообщил
`work_start_projection_conflict`. Прочитанные без изменения исторического
EVAL `prompt.md` и `context.json` побайтно совпадают с SHA-256 committed
receipt; это ложный конфликт, не разрешение повторить Work. Исправление в
dd-flow PR #24 принимает только идентичные binding/receipt и оба file hash
после CAS miss; новый attempt или изменённые bytes по-прежнему блокируются.
Детерминированный тест параллельной публикации и прежний тест смены attempt
прошли. Исторический EVAL не resume и не исправлять вручную.

Luna `EVAL-20260927050023-21aaa747` прошёл до CODE, затем Codex daemon
не опубликовал readiness: уже подтверждённая managed lease была синхронно
повторно heartbeat-нута до готовности, а подтверждение ownership не удалось.
Вложенная причина этого heartbeat не сохранена, поэтому конкретный SQLite
lock/timeout не объявляется доказанным. Beta.109 candidate в PR #24
планирует renewal после подтверждения без redundant blocking call; поздняя
ошибка lease по-прежнему запрещает productive dispatch. Для failed start до
создания Session run-control теперь допускает settlement лишь при единственном
failed `daemon.start`, отсутствии любых native/controller create, точном owner,
мёртвых daemon/provider и терминальных записях их leases. Неоднозначность
остаётся recovery-blocked. AGY CP166 отвергнут нативным account eligibility
до Conversation; Grok native auth gate отверг refresh token (`invalid_grant`)
до scored EVAL. Эти внешние prerequisites требуют восстановления доступа,
не новых дублей. Следующий gate: полный release workflow beta.109, новый
committed checkpoint с проверенным installed digest, свежие scored E2E и
полный семиэтапный цикл с MERGE/Final Judge; source tests не заменяют его.

CP-169 release gate: workflow `36301974325` — SUCCESS (prepare,
runtime-sensitive, четыре integration shards, candidate и publish). npm
`0.9.0-beta.109` и peeled tag указывают на
`350120c67365b0b0c8f2fc81c7cd73548aae6617`; PR #24 слит в `main`.
`engineArtifactDigest` и `verifyEngineArtifact` подтвердили installed
snapshot `87f7cfb1d3c6da4265c32cb325e2772615f0ef4e0c743d0b278e9035a987d3b4`.
Новый checkpoint CP-169 меняет только engine pin; source, flow pack и
Memory Bank сохранены. Глобальный Codex hook binary обновлён до beta.109,
оба Codex homes по-прежнему указывают на один абсолютный путь.

CP-170 native qualification (2026-09-27): после восстановления доступа
прямые AGY и Grok Turns завершились успешно, но CP-169 preflight отклонил
изменившиеся runtime: AGY 1.2.12 вместо 1.2.11, Grok 1.0.42 вместо 1.0.41.
В отдельном definition checkout compatibility smoke прошёл для обеих версий.
AGY probe на 15 children получил provider `RESOURCE_EXHAUSTED 429` и не
квалифицировал ёмкость; после чистого settlement probe на 4 children измерил
capacity 4 (`settled_by_root`, не Work success). Grok probe на 4 children
измерил capacity 4, все четыре завершились `completed`. Новые профили
закрепляют только наблюдённые runtime/capacity; checkpoint engine/source/flow
не меняется. Следующий gate — clean committed CP-170 definition, свежий
preflight и отдельные scored E2E; прежние CP-166 блокированные EVAL не resume.

Дата: 2026-09-26. Статус на 2026-09-27: engine/flow-pack исправлены и
выпущены, **четыре новых scored E2E ещё не подтверждены**.

Дополнение CP-165/166 (2026-09-27): beta.107 закрыла прежние адресные
regressions, но live full-cycle acceptance снова не достигнута. AGY
`EVAL-20260927034050-413d022d` прошёл baseline, SPECIFY и PROTOCOLIZE;
обычный PLAN `grep` был отклонён по `native_hook_timeout` до исполнения.
Подтверждено, что CLI открывал native `event handle` через тяжёлый
`initialize` вместо подготовленного `hook` store; время внутри отдельной
15-секундной подфазы не журналируется, поэтому SQLite lock как точная
причина **не доказан**. Общий ingress для AGY/Grok/ZCode/Droid/OpenCode
теперь применяет прежние validators/parser, пропускает нерелевантный tool
без открытия DB и открывает `hook` store лишь для участвующего вызова.
ZCode `EVAL-20260927032726-3b21ed2d` прошёл baseline, но не создал native
Session: ACP initialize занял 23 мс, затем daemon не опубликовал readiness
за 15 с. Отдельный provider ledger остался `running` после неудачного старта,
хотя физический PID завершился. Общий failed-start cleanup теперь завершает
точно зарегистрированный provider по id/token и удержанной daemon generation;
ZCode readiness ограничен 30 с. AGY первый запуск остановился на
password-session test с 5-секундным scrypt timeout при одновременных baseline;
источник получил 20 с без изменения assertions. Luna дважды остановился в
`test:world`: `tsx/cli` был промежуточным PID, а оставшийся child сохранял
probe databases. Источник запускает test-world напрямую через `node --import
tsx` и утверждает совпадение наблюдаемого PID. Точный исправленный source
commit `2070638c3811aea6572b9ab8b5ba868fdc519ccc` закреплён tag
`eval/cp-166-source-process-identity`; beta.108 source commit
`0df3cd1e7201f27baeeb07f1c4f2b69ed6e2399b`, release workflow
`36294173055` — SUCCESS, включая четыре integration shards и публикацию.
Полный installed snapshot digest `4afcf456c85ee30a71d30ab5471ee449c0a7b566167073a8cb18af5b6bb1cc09`
проверен для четырёх CP-166 homes. Scored Grok CP-165 не
стартовал: локальная OIDC авторизация истекла до native Session. Исторические
EVAL не возобновлять. Следующий gate — опубликованный beta.108, новый
committed checkpoint и четыре **новых** scored E2E с отдельными baseline,
семью Stage, MERGE, Final Judge и сохранёнными primary errors.

Дополнение CP-166/167: AGY `EVAL-20260927045212-439eb842` прошёл все
baseline checks и остановился до native Session на ответе provider
`agy_provider_rejected`: account unavailable in current location, 0 turns.
Это внешний eligibility blocker, не повторение `native_hook_timeout`.
ZCode `EVAL-20260927045611-ea950b3c` прошёл baseline и прежний startup
blocker: daemon ready, native Session создана, RUN вошёл в SPECIFY. На
ожидаемом HITL Interaction Judge вернул `fixture_gap`: ответ не определял
видимость приоритета в detail-виде и отдельную текстовую подпись в API.
CP-167 уточняет **только будущую** committed canonical response: detail-вид
показывает ту же подпись, API возвращает код `priority` без отдельной подписи;
исторический frozen EVAL остаётся terminal. Luna CP-166 на момент фиксации
ещё выполняется. Grok preflight PASS, но auth до native Session не доказана.

Дополнение CP-164 (2026-09-27): beta.105 не закрыла live acceptance.
Luna CP-162 завершился `incomplete_subject_turn`: Codex-обёртка потеряла
handle ещё выполнявшегося `stage resume` и приняла пустой промежуточный
вывод за окончательный. AGY CP-162 выявил пробел в SPECIFY Interaction
fixture об ответе list/detail API; fixture исправлен в `05ccccb`.
AGY CP-163 затем прошёл SPECIFY и PROTOCOLIZE, но PLAN был остановлен
`agy_directory_mismatch`: модель исполнила штатную сокращённую команду без
публичного RUN ID в правильно выбранном feature worktree, а hook проверил её
относительно старого project root вместо RUN из выданного invocation scope.
ZCode CP-162 остановлен в PLAN-REVIEW после конкурентных `work finish`:
проекция RUN читалась до получения SQLite writer lock и завершилась
`RUN projection changed during preparation`. Grok CP-162 не получил scored
EVAL: native smoke отвергнут `Authentication required` до создания root
Session. Исторические EVAL не исправлять и не продолжать вручную.

Для beta.106 PR #19 и #20 распространяют общий контракт ожидания финального
CLI-результата на Stage entry, HITL resume, server MERGE, external Work,
recovery и controller continuation; hook извлекает скрытый RUN только из
точного выданного invocation; проекция RUN резервирует writer до чтения.
Адресные тесты пройдены. Повторный официальный release gate
`36283580180` завершился SUCCESS, включая четыре integration shards,
runtime-sensitive и npm publish. Новый checkpoint CP-164 закрепляет beta.106
из `41377cb4915163be7220cc90928ea8a0f50683d0`; полный installed
snapshot digest `cecf6b4f9e19a26ae823843179ed9e8c1f6e9f64e714f5cd326990f9ba48a683`
проверен `verifyEngineArtifact` во всех четырёх новых homes. Закрытие плана всё ещё требует четыре
новых scored E2E через MERGE и Final Judge, а не только unit tests.
Продолжает [план 052](052-cp157-158-systemic-runtime-repair-plan.md), не меняя его
исторических результатов. Исходники для аудита: dd-flow
`fix/051-snapshot-worker-provenance` @ `d8b1b96` (beta.104), dd-eval
`eval/cp161-hitl-contract` @ `3934fa3`. Четыре наблюдения: Grok CP-160
`EVAL-20260925142631-067b67a8`; AGY CP-161
`EVAL-20260925154705-81c54f11`; ZCode CP-161
`EVAL-20260925155054-3278afdf`; Luna CP-161
`EVAL-20260925155239-0cdd153d`. Исторические EVAL не изменять, не
resume/restart и не объявлять исправленными результатом unit-теста.

Повторная проверка готовности: 2026-09-26. Цель закрытия — четыре свежих
scored E2E через все семь Stage до принятого MERGE, завершённого Final Judge
и сохранённого отчёта. Начало SPECIFY, terminal failure или один лишь
`state=completed` этой цели не закрывают. Разделы III–VI задают зависимости,
совместимую конфигурацию и доказательства приёмки. Изменения и адресные
проверки выполнены; полный release gate пройден, live acceptance ещё не выполнена.

Реализационный receipt: dd-flow `0.9.0-beta.105` из
`e55ba4f273ae0873e06ebe9ea75e6a6e1eb8b095`, canon
`678daa038287c948ada5b2d785a6dcc925c7b891`, release workflow
`36277905924` — SUCCESS, включая четыре integration shards и
runtime-sensitive. Flow pack dd-tasks `b0b124f3816bf3604161398d2cb0c7d7b287f462`.
Опубликованный пакет установлен в четыре изолированные CP-162 homes;
`verifyEngineArtifact` и `engineArtifactDigest` подтвердили у всех один
полный snapshot SHA-256
`7b0aa89b9bd5b62ecfdb1b93ba3ee194cacb21a0704fa570f5a10ccfa29b8cb6`.
Checkpoint CP-162 отделяет эти новые входы от исторических EVAL.

## I. Уже согласованные исправления — до расширенного аудита

1. **Grok / lifecycle.** Одинаковый внешний исход для всех упряжек:
   доказанный `no_effect` даёт ровно разрешённое продолжение и runtime-issued
   `retry_command` **только когда повтор безопасен**; `committed` не повторяется,
   `unknown` требует reconciliation.
   Первичная correctable ошибка не должна превращаться в
   `incomplete_subject_turn`. Инструкции Stage/Work/controller должны получать
   общие правила повтора, границ этапов и ожидания из одного источника; лишь
   названия native tools, их параметры и capabilities остаются упряжечными.
2. **AGY / workspace.** Разделить стабильный `project_root`, ожидаемый каталог
   исполнения конкретного Stage/Work, наблюдаемый native cwd, каталог записи
   продукта и каталог RUN-артефактов. Не считать промпт `cd` доказательством
   привязки Session. `same_session` через смену физического каталога разрешать
   лишь после отдельной native-квалификации; иначе отказ до productive Turn или
   явно выбранная новая Session. Исправить hook admission, не меняя project
   identity на feature root.
3. **ZCode / SQLite.** Исследовать все write-transaction callers, а не только
   WRK-006. Дорогую подготовку, Git/FS/hash/process probes вынести из периода
   владения SQLite writer; оставить короткий SQL CAS и воспроизводимую
   публикацию из durable receipt. Не маскировать contention ростом
   `busy_timeout` и не повторять произвольный callback с внешними эффектами.
4. **Luna / продуктовый контекст.** Принятый ответ на SPECIFY остаётся
   авторитетным для последующих этапов: участник workspace вправе менять
   **только priority** задачи архивного проекта; смешанное изменение
   отклоняется целиком. Старое общее правило archive read-only не должно
   рождать повторный HITL по уже решённому узкому исключению.

## II. Граница и метод систематического аудита

Просмотрены активные dd-flow `src/services`, `src/cli`, `src/storage`, все шесть
`src/harness-runtime` adapters и связанные tests; в dd-eval —
`lib/runner.mjs`, `lib/entry-pack.mjs`, stage-context blueprint и case
assessment. Для native cwd сверялись исходники Grok Build и ZCode. Поиск
выполнен по **всем** callers затронутых lifecycle, Session, hook, prompt и
transaction helpers, включая вложенные транзакции и raw BEGIN/SAVEPOINT.
Старые tags, исторические checkpoint snapshots и пользовательский продукт
dd-tasks не объявляются повторно проаудированными. Это аудит **данного класса
дефектов**, а не доказательство отсутствия любых ошибок.

Ниже «К» — подтверждённый дефект активного кода, «И» — наблюдённый в EVAL,
«Р» — риск/непроверенная capability. К не означает, что место уже вызвало
падение одного из четырёх EVAL.

Карта проверенных групп вызовов (пути относительно dd-flow `src/`):

| Контракт | Проверенные entry/caller группы |
| --- | --- |
| Lifecycle scope/admission | `services/run-controller*`, `external-work-launch`, `merge-server`, `services/lifecycle-invocations`, `cli/run-cli`, `services/hooks`, `services/continuation-outcome`, `services/run-recovery*` |
| Все генераторы Stage/Work/HITL команд и промптов | `services/vnext-{specify,protocolize,plan,plan-review,code,code-review,merge}`, `work-registry`, `stage-pause`, `controller-fanout`, `prompts`, `harness-runtime/lib/delegation-instructions`, Droid system prompt и проектные `.memory-bank/dd-flow/vnext/*.md` как внешний слой |
| Session/workspace | `services/execution-policy`, `vnext-workspace-policy`, `run-controller*`, `stage-lifecycle`, `work-registry`, `external-work-launch`, `merge-server`, `services/hooks`; все шесть `harness-runtime/bin/dd-*.mjs` и native daemons |
| SQLite writer и побочные эффекты | Все 82 прямых transaction API calls в 31 файле, `withStageSettlement` и его callers, raw `BEGIN`/`SAVEPOINT`, общие `persistRunState`, timeline/projection, resource registry/RUN lock order |
| EVAL boundary | dd-eval `lib/entry-pack.mjs`, `lib/runner.mjs`, case blueprint, interaction answer и assessment |

В проверенном перечне **не** признаны дефектом короткие SQL-only CAS/queue
транзакции (`projects`, `lanes`, обычный `runtime-budget`, `run-control`),
hook receipt SQL, isolated import schema migration и специально drained
`writer-migration`: переносить их механически значило бы увеличить риск.

### L. Lifecycle authority, повторы и инструкции

| ID | Доказательство | Системное исправление и минимальная проверка |
| --- | --- | --- |
| L1 И/К | `lifecycle-invocations.ts:426–450` выдаёт managed scope лишь ZCode/Codex; Grok/AGY остаются hook-only. `run-cli.ts:524–529` формирует retry лишь при invocation settlement. Общее правило `controller-fanout.ts:38–45` требует отсутствующий `retry_command`. | Один нормализованный внешний outcome/continuation contract поверх существующих invocation и hook receipts. Выдавать exact safe retry только при доказанном `no_effect`; `unknown` никогда не auto-replay. Проверка одной input-ошибки и последующего исправления на всех 6 harness; native admission каждой упряжки сохраняет свою identity. Не снимать whitelist одной строкой. |
| L2 К | `run-controller.ts:581` спрашивает `currentLifecycleFailure`, а `lifecycle-invocations.ts:926` читает только invocation ledger; `assertLifecycleOutcomes:281` уже видит fatal hook outcomes. | Общий selector текущей первичной ошибки из обоих журналов, привязанный к RUN generation/Stage attempt/Turn и учитывающий более позднее успешное продолжение. Тест correctable Grok/AGY end-Turn без safe continuation → исходный code; старый исправленный отказ не «отравляет» новый Turn. |
| L3 К | `publicInvocationCommand:202–207` скрывает `--invocation-id`; `recoverLifecycleCommands:564` ищет этот ID в тексте сохранённого промпта. `run-recovery.ts:47,246` передаёт именно этот текст. | При публикации промпта сохранять связь packet → выданные assignment IDs в runtime receipt, а recovery выбирать только проверенные `issued` без эффекта; ambiguous/unknown fail closed. Тест recovery из **реального model-facing markerless** промпта и старой generation, а не из внутренней команды с UUID. Проверить Codex parity (`run-recovery.ts:242` сейчас ZCode-only) по native capability. |
| L4 К | `resolveObservedLifecycleArgs:877–889` после проверки projected fingerprint возвращает `retained.argv` целиком. Fingerprint маскирует `--reason`, пути result/decision/verification input нормализуются; фактическая причина `work fail` подменяется шаблонной. `successorLifecycleInvocationCommand:504–513` также восстанавливает исходный шаблон, теряя реальные public args. | Восстанавливать только runtime-owned private args. Public `work finish --result-file` и `work fail --reason` сохранять из наблюдённого/проверенного вызова, включая successor/recovery. `run-cli.ts:1263–1267,1608–1613` уже читает результат один раз и отдельно проверяет Work owner: использовать captured bytes, без нового запрета других имён входного файла. Canonical output остаётся runtime-owned. Explicit Stage result/decision/verification paths проверять точно, не через маркер «любой input path». Тест двух valid файлов с разными bytes, замены файла после prepare, фактической причины через retry и чужого Work. |
| L5 К | Compound lifecycle shell получает `lifecycle_shell_syntax_invalid` diagnostic (`lifecycle-invocations.ts:716`), но hook пропускает вызов; `observedLifecycleInvocation:854` может найти ещё `issued`, из-за чего `run-cli.ts:366–370` пропускает diagnostic и ждёт receipt до timeout. Existing tests закрепляют timeout. | Приоритет точной коррелированной native diagnostic над `issued` rendezvous; не выбирать stale «последнюю» диагностику по одному fingerprint. Где native PreToolUse допускает deny — вернуть correctable shell-form rejection до CLI; для ACP CLI выдаёт тот же первичный code. Проверить реальную CP-161 форму `sleep && "$DD_FLOW_BIN" work start`, standalone и два одинаковых события. |
| L6 К | Правила разбросаны по `controller-fanout.ts`, `vnext-*`, `work-registry.ts`, `external-work-launch.ts`, `merge-server.ts`, `run-recovery*` и `delegation-instructions.mjs`; внешний launcher говорит «не запускать более одного раза», а общий Work block допускает исправленную pre-CLI попытку; PLAN предлагает запускать successor при managed controller. | Расширить существующий `delegation-instructions.mjs` (с типовым `.d.mts`) небольшими **общими** блоками: outcome/retry, владение Stage, workspace, Work settlement, recovery. Stage renderers оставляют предметные действия; adapters — native syntax. Явный managed/direct context определяет, кто запускает successor. Snapshot собранных промптов всех Stage/Work и 6 harness; успешный Work отдельно от settled native Turn. Без нового template engine. |
| L7 К | `lifecycle-command.ts:157–179` распознаёт для lifecycle только `dd-flow`/`$DD_FLOW_BIN`, тогда как `continuationCommand` принимает также `node …/cli.js`. Все hook ingress опираются на первый parser; неподдержанная форма может пройти как «не lifecycle». | Один небольшой recognizer **фактически выдаваемых** launch forms для lifecycle и continuation. Таблица standalone/compound/wrapped/непрофильных команд через parser, все hook ingress и CLI; не искать произвольное упоминание `dd-flow` регулярным выражением. |
| L8 К | `settleLifecyclePreparationRejection:904–923` определяет отсутствие прогресса по code/details; malformed Work JSON через `prepareWorkResult:867–878` не добавляет hash входа. Два разных ошибочных результата могут получить `repeated_without_progress`. | Включать hash реально прочитанных bytes и значимых public args в identity коррекции. Одинаковый input без изменения durable state ограничивается прежней политикой; исправленный input не блокируется из-за одинакового текста ошибки. Реальный CLI test: malformed A → malformed B → valid C и повтор неизменённого A; UUID/mtime сами по себе не прогресс. |

Уточнения L1/L2, обязательные до изменения общей инструкции:

- `settleLifecycleRejection:542–549` уже выдаёт `retry_command` и
  `recoverable=true` без `effect` для некоторых semantic/check errors, тогда
  как `lifecycleRetryInstruction` требует `effect=no_effect`. Проверять
  **реальный JSON CLI**, а не только helper: prepare rejection, semantic
  validation, `work_checks_failed`, зарегистрированный repair и SQL rollback.
- Не присваивать всем этим ошибкам `no_effect`: проверки могли записать
  receipts, а repair уже создан. Существующий `continuation` — главный
  указатель действия после таких ошибок. Общий selector/instruction различает
  correction с доказанным no-effect, ожидание registered repair, check retry
  по его receipt и reconciliation неизвестного эффекта. Проверки/repair не
  выполняются повторно только потому, что acceptance Work ещё не состоялся.
  Если continuation отсутствует, его формирует lifecycle authority на основе
  committed receipts; hook остаётся коротким ingress и ничего не выдаёт.
- `currentLifecycleFailure:937` сейчас скрывает ошибку при любом issued
  successor, а `:944–946` ищет Stage лишь в `--stage`, пропуская Work-команды.
  Связать Work с Stage/attempt/cycle из DB; после ended Turn невыполненный
  successor сохраняет исходную причину. Во время живого Turn разрешённая
  коррекция не является terminal error. Более поздний успех/repair/HITL/handoff
  снимает лишь соответствующую причинную цепочку.
- Outcome/retry выдаёт CLI/runtime authority. Не переносить эту работу в
  synchronous hook и не дублировать два retry-ledger: общий selector поверх
  существующих stores, атомарный единственный successor в owning store.

`recoverable=true` само по себе не разрешение повторять: различать
correctable input, разрешённый runtime retry, зарегистрированный repair-child,
ожидание уже запущенной операции, HITL и recovery неизвестного эффекта.

Дополнительный gate, выявленный при проверке реализации L1: native root
управляемого Grok/AGY может принадлежать не только controller Session, но и
отдельному `work_launches` либо server `merge_requests`. Hook admission должен
сверять **точный** root с сохранённым launch, daemon/process binding и RUN
generation; чужой или завершённый root не получает authority. Исторический
launch другого root не должен блокировать обычный hook и не должен ломать
обработку из-за старого malformed receipt. Для управляемого root составная
или обёрнутая shell-команда с lifecycle-вызовом отклоняется **до выполнения**,
включая попытку сбросить `DD_FLOW_DAEMON_ID`; diagnostic-only allow недостаточен.
Проверки: controller, external Work и server MERGE, тот же и иной harness,
issued/unissued команда, stale root и составная shell-форма.
У server MERGE есть два штатных владельца с разными persisted receipts:
контроллер (`controller_id` и Session в `run_controllers`) и отдельный
`merge-server` (`runtime_adapter.owner`). Exact-root lookup обязан доказать
соответствующий dispatch owner/lease в обоих случаях; нельзя требовать поля
второго формата у первого или пропускать первый без проверки active owner.

Trust boundary этого gate ограничен подтверждённым native hook transport.
В изученном исходнике grok-build ACP публикует pending tool-call до hook, но
соответствие установленному бинарю и порядок доставки ещё не квалифицированы,
а текущий bridge не сопоставляет это событие с hook input. AGY `step_update`
не доказывает точные shell argv. Daemon-bound active Turn/ancestry и
issued-command fingerprint не
являются криптографическим доказательством подлинности hook stdin против
модели, способной вызвать локальный handler напрямую или сконструировать
lifecycle-команду динамически через `eval`. Не заявлять такую
гарантию без отдельной native qualification и проверенного независимого
сигнала; это ограничение не даёт права ослабить нынешний fail-closed scope.

### W. Workspace identity и фактический cwd

| ID | Доказательство | Системное исправление и минимальная проверка |
| --- | --- | --- |
| W1 И/К | `vnext-protocolize.ts:79,472` создаёт feature worktree **внутри stage start**, после выбора Session controller-ом; `same_session` затем сохраняет старый cwd. В PROTOCOLIZE `:433` разрешает stable Session, но `:85` требует cd feature. | Expected execution cwd фиксировать для Stage attempt: SPECIFY/PROTOCOLIZE — stable root; агент PROTOCOLIZE пишет только RUN result, CLI материализует feature документы. Убрать противоречивый cd. PLAN→CODE-REVIEW — feature; MERGE — target. Guard сравнивает native cwd с этим contract, а не всегда с текущим `run.workspace_root`. Проверить PROTOCOLIZE start→finish и pause→answer→resume после provisioning. Для смены каталога на границе Stage — новая Session либо отдельно доказанный native rebind. |
| W2 К | `execution-policy.ts:153` принудительно выбирает `same_session` для same-session MERGE; target integration root отличается от CODE feature root. `run-controller.ts:528–544` выделяет target cwd только server MERGE. | То же правило смены workspace применить к CODE-REVIEW→MERGE. Если source≠target и same-Session rebind не квалифицирован, отвергнуть конфигурацию до productive MERGE; server/new Session получает target cwd. Test feature→same-session MERGE отказ и server MERGE успех. |
| W3 К | Общий `hooks.ts:754–760` для AGY/OpenCode/Droid требует `session.directory===stable project_root` **до** фильтра tool; новая корректная Session в feature/copy/merge target может получить pre-CLI отказ даже на обычном tool. `external-work-launch.ts:81` уже передаёт copy cwd и stable root. | В одном shared hook guard использовать project root лишь для lookup, а expected execution workspace брать из проверенного owner/Stage/Work/merge route; observed native cwd сохранять отдельно. Тест native root+child, external read-only AGY/OpenCode/Droid `work start`, wrong cwd и обычного non-lifecycle tool. Одна hook qualification не считается E2E admission. |
| W4 К | Grok/ZCode payload несут native cwd, но `hooks.ts:641,705` заменяет его root; `work-registry.ts:852`, `stage-lifecycle.ts:212` сохраняют номинальный `run.workspace_root` как session cwd, в том числе для MERGE target. | Не подменять наблюдение ожидаемым значением: хранить observed cwd с provenance и отдельно authoritative route/target. Без подтверждённого native cwd не утверждать, что он проверен. Regression на root, child, review copy, CODE feature и MERGE integration. |
| W5 Р | AGY `workspace_paths` может быть множественным; `hooks.ts:814` выбирает первый абсолютный. Контракт «активного» пути из массива пока не доказан. | Сначала native qualification fixture root/child/copy и порядок массива. Использовать только доказанный selected cwd либо launch-bound cwd с явным уровнем достоверности; не вводить произвольную строгость «ровно один путь», пока API этого не обещает. |

W3 admission до первого `work start` не может зависеть от ещё отсутствующего
Work binding. Источники authority:

| Исполнитель | Identity и ожидаемый execution cwd |
| --- | --- |
| Stage coordinator | Controller Session + frozen Stage-attempt cwd |
| Native child | Retained parent/root ancestry + выданная Work assignment; cwd текущего Stage |
| External worker | `work_launches.provider_session_id` + owner/operation; это отдельный native root, ancestry coordinator не требуется |
| External read-only reviewer | Тот же committed launch + exact review-copy receipt; source workspace отдельно |
| MERGE executor | Claimed merge request + его integration target |

Native reviewer наследует feature cwd; external reviewer получает isolated
copy. Проверить оба пути; не заменять native delegation внешним запуском ради
обхода проблемы. Для AGY переиспользовать существующие qualification и
`worktrees.ts:200 propagateOwnedWorkspaceHooks`: root → feature → copy →
integration target. Новый daemon только проверяет launch binding; повторная
установка hooks на каждый Turn не нужна.

Stable-root PROTOCOLIZE в W1 — правило свежего bootstrap. Focused/restored
PROTOCOLIZE может уже иметь provisioned feature route (`vnext-protocolize.ts:139–145`):
его Stage cwd выводится из проверенного launch/retained route и фиксируется
для attempt. Не вводить глобальный запрет feature cwd для такого восстановления;
одна regression общего resolver покрывает этот вариант.

Общий workspace block в промпте должен различать: стабильный project identity
для CLI, cwd lifecycle tool, каталог чтения/записи продукта, RUN result/evidence
и read-only execution copy. Native hook не является filesystem sandbox: запрет
всех возможных absolute shell writes им не обещать.

### T. SQLite writer и внешние эффекты

Аудит охватил 82 прямых transaction API call sites в 31 файле, все найденные
raw BEGIN/SAVEPOINT и `withStageSettlement`. `storage/database.ts:310,417`
устанавливает `busy_timeout=4000`; `:489` делает `BEGIN IMMEDIATE`.
Вложенный savepoint не освобождает внешний writer.

| ID | Доказательство | Системное исправление и минимальная проверка |
| --- | --- | --- |
| T1 К | `work-registry.ts:449,811`: под writer идут review source/copy hash, Git/file scan, prompt rendering и публикация receipts. `:236,268,583`: materialization/retry читает, переименовывает и fsync-ит файлы. | Read-only prompt/input prepare вне lock; короткий SQL commit резервирует Work **и runtime-owned lifecycle assignments**, сохраняет готовые bytes/identity; публикация/reconcile после commit. Не пытаться выдать authority при преждевременном render. Тест медленного hash с конкурентным writer и конфликтующей заменой Work. Сохранить проверку real input drift, не переносить риск в whitelist. |
| T2 К | `runs.ts:872` произвольно оборачивает Stage finish; `vnext-plan.ts:133`, `vnext-plan-review.ts:186`, CODE/CODE-REVIEW/MERGE finish выполняют Git, schema, filesystem и stage projections под ним. `code-checks.ts:275` перечитывает и хеширует artifacts под writer. | Для каждого Stage сохранить семантическую подготовку и доказательства до lock, затем короткий CAS accepted revision/generation и idempotent publication. Проверить concurrent revision change, crash после commit и точные исходные bytes. Не считать savepoint сокращением внешнего lock. |
| T3 К | `runtime-scope-control.ts:28,35` держит registry и несколько RUN writers во время recovery snapshot, journal capture и liveness; `runtime-scope-resume.ts:92,93,419` повторяет probes. `cleanup.ts:281` вызывает Git и FS repair под writer; merge-queue/protocol state также пишется на диск под writer. | Вне lock подготовить immutable evidence/process observations; внутри сохранить порядок registry→sorted RUN, сверить generation/owner CAS и записать intent; после commit публиковать/reconcile. Не ослаблять all-role drain/release и не считать FS rollback транзакционным. Проверить два RUN + конкурентный hook writer, частичный publish и idempotent recovery. |
| T4 К | `run-controller.ts:136–145` при uncertain lease повторно пишет heartbeat в resource registry; `assertPhysicalOwner` вызывается внутри RUN transactions (`run-controller-capture.ts:37`, `run-controller-recovery.ts:141`). Scope drain берёт registry→RUN; это обратный RUN→registry порядок. | Lease renewal вне RUN writer; внутри — только pure local/DB ownership assertion и generation CAS. Тест двух соединений с принудительной uncertain lease: ни lock inversion, ни productive dispatch без подтверждённого owner. |
| T5 К | Общие helpers `runs.ts:1598,1705`, `work-registry.ts:1083` читают/публикуют JSON/timeline под чужим writer; `managed-processes.ts:394` через `spawnSync(ps)` вызывается из ряда write paths без собственного timeout. | Разделить SQL authority и файловые проекции у helper-границы, не дублировать патчи по каждому caller. Process probe делать до lock и ограничить; commit повторно сверяет токен/generation. Instrumentation: имя операции и wall time владения writer после release. |
| T6 К | `runtime-scope-resume.ts:62` берёт registry writer до полного `recordControllerResume` preflight, включая context/snapshot/process checks. `runs.ts:672` при flag revision читает runtime FS под writer; `run-controller.ts:339` публикует context file под writer. Это пропущенные siblings T2/T3, не «короткие SQL» пути. | Применить тот же prepare→CAS→publish; отдельно сохранять immutable context bytes/flag revision и идемпотентное восстановление после crash. Тест медленного FS чтения при свободном другом writer. |
| T7 К | `runtime-scope-control.ts:87–94`: registry COMMIT публикует drain receipt; RUN transactions служат writer barriers и завершаются ROLLBACK. Ошибка cleanup среднего RUN скрывает уже известный committed outcome и прерывает очистку остальных. | Попытаться очистить/закрыть каждый target; сохранить committed receipt и secondary cleanup errors. Успешный COMMIT не становится unknown из-за последующего rollback barrier. Fault-injection на средний target и replay того же receipt без второй drain/release операции. Это fault-path hardening, не доказанная причина CP-161. |
| T8 К | Ручные `beginWriteTransaction`/raw SAVEPOINT обходят обработку rollback failure в `storage/database.ts:496–528`; `get/all:539–540` даже после poisoned wrapper не проверяют `assertUsable`. `run-controller-process.ts:146` может заменить spawn error ошибкой сохранения статуса. | Короткие операции перевести на имеющийся `writeTransaction`; для multi-store оставить контролируемую ручную границу с сохранением primary/secondary. После неудачной очистки закрыть/poison connection и запретить **также чтение** через facade. Fault-injection BEGIN/body/COMMIT/ROLLBACK/RELEASE, без ложного `no_effect`. |
| T9 К | `eval-snapshots.ts:351–400,475–495`: import требует пустые targets, пишет в final paths, затем detach двух DB, rebase, registration/routing и relocation. Crash может оставить неполный import; lineage доказывает происхождение, но не готовность. Live source registry не затрагивается. | Установить import-in-progress до копирования authority, completion receipt — лишь после всех фаз; productive admission требует completed import. Failed target сохранить для диагностики, новый restore делать в свежие targets. In-place resume и atomic relocation всех Git/worktree paths не входят в минимальный фикс. Fault-injection между двумя commit и после каждой последующей фазы; incomplete target не dispatch-ится. |
| T10 К | `runs.ts:831,1954–1998` архивирует Stage attempt: journal, rename artifacts, SQL path rewrite, затем перенос journal в archive **до внешнего COMMIT**. SQL rollback оставляет старые пути и уже перенесённые файлы. | Связать существующий archive journal с exact prior/next attempt и generation; завершать его только после принятого SQL path rewrite, восстанавливать по retained archive receipt. До завершения reconcile следующий attempt не пишет в эти пути. Crash после каждого rename, SQL rewrite и перед COMMIT; поздний publisher не архивирует successor. Общие callers включают SPECIFY/PROTOCOLIZE. |

Разделение эффектов для T1–T10 — обязательная часть реализации:

| Эффект | Authoritative запись и восстановление |
| --- | --- |
| Work start | `start_receipt_json` хранит exact prompt/context bytes, их hash и issued assignments; повторная материализация использует те же IDs/bytes. Подготовка FS — до writer, SQL issuance и pure render по подготовленным данным — внутри короткого commit. |
| Work result | `works.result` + work-session identity; publication metadata должна быть восстановима из SQL после commit даже при отсутствующем файловом intent. Сохранять существующую проверку конфликта и previous hash. |
| Stage/HITL packet | Сохранять exact accepted bytes/hash и owner attempt в существующем owning receipt; новые immutable пути публикуются create-if-absent, идентичный файл допустим, отличающийся сохраняется как конфликт. `check hash → replacing rename` без единственного publisher недостаточно. |
| RUN/protocol projection | SQL хранит revision/history; файл перестаёт быть источником следующей revision. Per-RUN publisher последовательно читает последнюю committed revision и публикует проекции вне SQLite writer. Узкий publication lock с exact process identity, без удержания DB writer при ожидании; после смерти владельца — reconcile последней revision. |
| Timeline | Event ID/sequence фиксируются в том же SQL commit, что переход. Использовать существующий SQL audit store с явно scoped RUN event payload и сохранённым sequence, без отдельной универсальной очереди. JSONL строится/дополняется по committed событиям единственным per-RUN publisher. |
| Stage archive | Существующий `.archive-<stage>.json` + SQL attempt/path rewrite; pending intent сохраняется до завершения обоих компонентов. Это перенос authority-linked файлов, а не обычная JSON-проекция. |

В T5 сейчас `runs.ts:1609–1614` читает revision/history из файла, а `:1710–1723`
вычисляет sequence по последней строке JSONL. Перенести только write недостаточно.
Regression: задержать publisher N, опубликовать N+1, отпустить N — revision не
откатывается, history/events не теряются и не дублируются. Общий publication
helper должен читать актуальное состояние после получения своего lock.
Protocol projection использует тот же контракт с project/protocol scope.

После committed mutation, но до required publication следующий productive
dispatch закрыт; разрешено materialization/reconcile того же receipt. Ошибка
публикации сохраняет committed lifecycle outcome. Нельзя повторно запускать
Work или считать отсутствие файла доказательством `no_effect`. Новый dispatch
проверяет готовность нужных пакетов/ревизии, а не успешность необязательной
dashboard-проекции.

T4: renewal выполняется до RUN writer; внутри — pure проверка exact physical
identity, ещё действующего lease и RUN generation. Lease, истёкший или
заменённый **пока ожидается writer**, больше не допускает продуктивное действие:
выйти без эффекта и повторно подтвердить снаружи. Cached `confirmed=true`
недостаточно. При необходимости одновременно заморозить оба stores сохраняется
порядок registry→RUN. T3 evidence после переноса связывается с sealed manifest
digest, journal prefix/sequence, daemon/process binding и inventory version;
один SQL generation не обнаруживает смену native файла.

T8: poisoned facade запрещает также `get/all`, не позволяет внешней transaction
продолжаться после неудачного nested cleanup; cached resource handle удаляется
через существующий `close` (`database.ts:462–466`).
`transaction_rolled_back=true` описывает SQL, а отсутствие внешних эффектов
доказывается отдельно. Тесты включают nested RELEASE/ROLLBACK TO failures.

T9 import guard хранится вне заменяемого runtime tree: `eval-snapshots.ts:371–372`
удаляет `DD_FLOW_HOME` перед копированием, поэтому внутренний marker пропадёт.
Guard закрывает admission до открытия скопированной authority. Completion
привязан к **новому import ID, source manifest hash и фактическим target paths**;
скопированный source completion остаётся историческим evidence. Этот gate
применяется к import-derived runtime, не к обычному новому home. Проверить
crash сразу после копирования `db.sqlite`, до detach/rebase, и source со старым
completion: отдельный процесс не может начать productive dispatch в target.

Полный implementation checklist для T1–T10: `work-registry` (start, finish,
retry, materialize, graph/projection), `repair-intents`, `code-checks`, все
`vnext-{specify,protocolize,plan,plan-review,code,code-review,merge}` callers,
`runs` (flags, state, timeline), `stage-pause`, `run-controller*`,
`run-control-worker`, `run-recovery*`, `runtime-budget`, `runtime-scope-*`,
`managed-processes`, `cleanup`, `merge-queue`, `protocols`, `eval-snapshots`.
Для каждого проверять **внешний** writer scope вызывающего метода, а не только
локальный `BEGIN`; прежде чем закрыть пакет, повторить поиск новых
`writeTransaction`/`beginWriteTransaction`/raw `BEGIN` и I/O в callback.

Проверка source hash вне SQL writer не ослабляет файловую границу сама по
себе: SQLite lock и сейчас не запрещает provider редактировать файлы.
Принятая ревизия должна ссылаться на существующую immutable copy/receipt и
проверяться при соответствующем Work/Stage settlement; generation/CAS ловит
смену DB-владельца. Нельзя просто перенести hash вверх и убрать проверку.

Не переписывать короткие SQL/CAS операции ради единообразия; не вводить
автоповтор `writeTransaction` с filesystem/subprocess побочными эффектами.
Увеличение `busy_timeout` допустимо только после измерений как отдельный
операционный выбор, **не** как исправление причин lock contention.

### C. Принятый продуктовый контекст и EVAL-обёртка

| ID | Доказательство | Исправление и проверка |
| --- | --- | --- |
| C1 И | CP-161 Luna повторно запросил уже решённое право участника редактировать priority архивной задачи. `entry-pack-source/stage-context.json` у всех этапов содержит пустой `accepted_decisions`; PLAN slice ссылается на protocolize, но не объявляет accepted SPECIFY прямым source. При этом `vnext-plan.ts:102` перечисляет `01-specify/specify.json` — отсутствие файла не причина. | Не копировать все решения в новую mutable registry. Явно указать приоритет принятых артефактов над старым общим project rule в одном shared Stage-context block; для PLAN сделать accepted SPECIFY прямым declared source, сохранив pinned materialized SHA. Добавить case regression: member/archived priority-only, mixed update reject, отсутствие повторного HITL; проверять и собранный prompt, и semantic outcome. Не менять исторические EVAL/snapshots. |
| C2 К | dd-eval `lib/runner.mjs:2283` передаёт ZCode `ended.items` в `directNativeChildren` с fallback `completed`; `normalizedChildStatus` возвращает fallback для `lost`. dd-flow ранее исправил аналогичный N3, но qualification metric ещё может назвать lost child completed. | Повторно использовать точный status mapping в dd-eval без новой зависимости: lost/unknown не counted completed; только native terminal proof. Fixture ZCode ended lost и 21+ child; квалификация capacity отделена от результата Work. |
| C3 К | dd-eval `lib/runner.mjs:1664–1669` классифицирует любой текст с `timeout` как `provider_unavailable`, даже если code — lifecycle/storage timeout. | Сначала структурированный code/source/cause, regex текста лишь для неизвестной provider error. Тест `invocation_receipt_timeout`/`storage_write_failed` vs реальный provider timeout; сохранить первичную ошибку в EVAL report. |
| C4 К | `lib/entry-pack.mjs:62`: catch после `stat` безусловно rethrow, поэтому отсутствующий source с `required:false` всё равно блокирует context materialization. | Optional ENOENT допускается и остаётся явно optional в prompt; required ENOENT сохраняет точную причину; EACCES и прочие ошибки не скрываются. Регрессии в `test/entry-pack.test.mjs`. Не менять required источник на optional ради обхода. |

C1 принимается также по **fresh Work/reviewer/repair packets**, а не только
PLAN prompt: `work-registry.ts:924–945` и `vnext-code-review.ts:296` имеют
отдельные renderers. Передавать ссылки и нужный срез accepted obligations через
существующий Work payload. Общий precedence block распространяется на эти
entrypoints. Продуктовые проверки: member priority-only разрешён, mixed update
отклонён целиком, nonmember отклонён, прочие ограничения архивного проекта
сохранены. Accepted exception действует только в своей области, не отменяет
все старые правила проекта. Hidden canonical answer попадает в Subject только
через разрешённый HITL; используют именно ответ этого RUN. Assessment и
Judge-only evidence не становятся Subject context ни на одном этапе.

## III. Порядок реализации и проверяемые выходы

1. **Контракты до патчей.** Зафиксировать таблицу действий из lifecycle outcome,
   authority каждого аргумента и phase-specific cwd из раздела II. Для шести
   adapters собрать fixtures реально выдаваемых команд/native events; native
   live acceptance требуется для четырёх выбранных routes. AGY multi-root
   qualifier не подменяет неизвестный selected cwd первым элементом массива.
   Live rebind не блокирует реализацию: новый campaign использует fresh Sessions.
2. **P0: L4/L5/L7/L8/L1/L2/L3.** Сначала устранить silent подмену аргументов,
   timeout вместо точного shell diagnostic, и отсутствие safe retry/first cause.
   Затем recovery markerless и Codex parity. Закрыть также pending successor
   после ended Turn и сохранение semantic args через retry. Проверки:
   `test/lifecycle-invocations.test.ts`, `test/run-cli-admission.test.ts`,
   `test/runtime-recovery.test.ts`, native hook fixtures. Для каждого исхода
   проверить no-effect/committed/unknown и replay/stale generation.
3. **P1: W1–W5.** Frozen policy/preflight и guard каждого Stage/Work dispatch,
   включая PROTOCOLIZE→PLAN, внешнюю review copy и оба MERGE режима; исправить
   общий hook predicate/telemetry. PROTOCOLIZE сохраняет свой Stage cwd после
   materialization feature workspace. Проверки `test/vnext-protocolize.test.ts`,
   `test/run-controller-stages.test.ts`, `test/external-work-launch.test.ts`,
   `test/merge-server.test.ts` плюс реальные root/child native fixtures.
4. **P2: L6/C1.** Собрать Stage/Work prompts из существующих общих правил и
   маленьких stage/provider блоков; убрать противоречащие копии. Обновить
   dd-eval stage-context blueprint без раскрытия скрытого ответа. Проверить
   итоговый **assembled prompt**, accepted decision precedence и отсутствие
   повторного Luna HITL, включая fresh children. C4 покрыть здесь.
5. **P3: T1–T10.** Сначала SQL-authoritative revision/publication contract,
   затем горячие Work/Stage writer paths и lock inversion, после — scope,
   cleanup и import/archive. T1/L3 используют одну схему packet→assignment;
   нельзя независимо внедрить две версии этого receipt. Для каждого
   перемещения FS эффекта обязателен конкретный recovery test. Проверки
   `test/storage-writer-access.test.ts`, `test/work-receipt-publication.test.ts`,
   `test/stage-consistency.test.ts`, `test/runtime-scope-control.test.ts` и
   отдельное конкурентное соединение/процесс. Базовый показатель —
   длительность владения writer и отсутствие долгих I/O в его callback.
6. **P4: C2/C3, интеграция и выпуск.** Исправить dd-eval reporting, затем
   typecheck/build/lint, адресные suites, полный release/runtime-sensitive и
   integration gates. Обновить `runbooks/update-harnesses.md`,
   `runbooks/execute-eval.md`, `runbooks/e2e-monitoring.md` только по
   реализованным контрактам. Операционный запуск и полное закрытие — разделы
   V–VI. Незакрытый пункт не отмечается выполненным по одному unit PASS.

Границы изменений по репозиториям:

| Репозиторий | Результат пакета |
| --- | --- |
| dd-flow | Общие lifecycle/prompt/cwd helpers, storage/publication исправления, migrations только при изменении persisted contract, unit/concurrent/crash tests, собранный и выпущенный engine |
| dd-tasks flow pack | Новая ревизия `.memory-bank/dd-flow/project-execution.json`; устранение конфликтующих template instructions, если они есть в pinned pack. Product source baseline остаётся `924ef61752b642f06c2c326b444ed7a3239f20ff` / `eval/cp-074-source-final` |
| dd-eval | C1–C4, case blueprint и новые run-profiles, checkpoint engine+flow-pack pins, operational runbooks и campaign acceptance report |

Persisted receipt changes версионировать только где меняется смысл формата.
Исторический reader остаётся read-compatible; старый receipt без новой proof
не превращается в разрешение retry/dispatch. Runtime stores не мигрируются
из hook. Установка новой версии идёт в новые homes; packaged consumer test
проверяет наличие `.mjs` helpers/типов/templates и фактический import из `dist`.
Провести проверки на final source commit и установленном артефакте; после
новых правок повторять затронутые проверки, не ссылаться только на старые PASS.

Зависимости: outcome/argv contract → lifecycle patches и shared prompts;
Stage cwd contract → admission и новые profiles; publication contract →
вынос I/O и recovery; все эти пакеты → packaged qualification → scored E2E.
Детальные адресные tests расширяют существующие suites. Для dd-eval проверить
`entry-pack`, `e2e-reliability`, `runner-control`, `runner-cancel` и
`runner-recovery`, затем штатный `npm test`; для dd-flow — штатные scripts
из `package.json`. Прерванный/зависший suite не считается PASS.

## IV. Проверка плана по `$ponytail` (full)

- **Удалить до добавления:** убрать противоречащие инструкции и ложную
  cwd-телеметрию; не строить новую permission system, template framework,
  универсальный cwd-rebind API или второй recovery engine.
- **Использовать существующее:** invocation/hook receipts, Work start/result
  receipts, `delegation-instructions.mjs`, frozen route, CAS/generation,
  native hook identity и текущие тестовые fixtures. Сложный новый формат
  вводить лишь если существующий receipt не может удержать packet→assignment.
- **Не упрощать безопасность:** unknown effect не retry; stable project
  identity не подменять feature path; native/Work/physical settlement не
  сливать; prepared FS input должен проходить проверку revision при commit;
  реальный product drift и foreign Session по-прежнему отклоняются.
- **Не делать вид, что доказано больше:** exact holder SQLite lock CP-161 не
  идентифицирован; cwd не доказан единственной причиной AGY CP-161;
  семантика AGY multi-root payload и Codex live rebind требует native
  квалификации. План требует измерений/fixtures до соответствующих решений.
- **Каждый нетривиальный фикс оставляет runnable regression**, прежде всего
  путь, который нынешние тесты ошибочно объявляют timeout или success.
- **Убрана необоснованная строгость предыдущей редакции:** managed Work не
  привязан к единственному имени public input файла; Work authority, валидные
  captured bytes и runtime-owned output обеспечивают нужную границу.
- **Ограничен scope qualification:** fresh-session campaign не требует нового
  механизма live cwd rebind, полного переноса native home или проверки всех
  исторических snapshots. Существующие проверки безопасности сохраняются.

## V. Конкретная конфигурация четырёх новых E2E

Исходный checkpoint CP-160 ссылается на flow pack
`53d4b76943900f122957c78cc0fefa2051bd7b1a`; его `project-execution.json`
содержит `stage_session_mode=same_session`, `merge_mode=same_session`.
Поля берутся из project pack (`vnext-execution-profile.ts:21–44`), а
`run-profile.subject.execution` задаёт routing. Исправление одного run-profile
не меняет этих settings.

Для новой общей кампании зафиксировать в новом flow-pack commit:

- `stage_session_mode=new_session`;
- `merge_mode=server`, `merge_delivery.strategy=local`;
- `plan_review_mode=standard`, `code_review_mode=standard`;
- `stop_target=merge_completed`, `merge_cleanup.source=retain`;
- сохранить feature-worktree route и product baseline; bootstrap остаётся
  штатным `pnpm bootstrap` из текущего pack.

Это осознанное изменение условий эксперимента, одинаковое для четырёх
harness. Оно фиксируется в campaign report; не сравнивать новый результат со
старым как изолированный эффект только engine patch. Новые run-profile IDs
должны отражать server MERGE (например `e2e-server-merge-*`); старые inline
profiles и EVAL остаются историческими. Judge модель определяется содержимым
profile, а не историческим `gpt-5-6` в его ID.

| Cell | Subject и native worker policy | Judge и Interaction Judge |
| --- | --- | --- |
| Grok | `grok-4.7 high`, native direct children, текущий qualified Grok Build | `gpt-6-sol high` через Codex CPA |
| AGY | `gemini-3.1-pro-high`, native direct children, текущий qualified AGY | `gpt-6-sol high` через Codex CPA |
| ZCode | `glm-5.3-flash`, reasoning `max` по текущему выбранному profile; текущий установленный binary/bridge после doctor | `gpt-6-sol high` через Codex CPA |
| Luna | `gpt-6-luna xhigh`, native direct children, `cx` с source home `~/.codex-cpa` | `gpt-6-sol high` через тот же CPA transport, независимые чистые Sessions |

Проверить resolved frozen coordinator/worker/stage routes, а не только Subject
profile; любой выбранный Sol route использует `gpt-6-sol high`. Названия моделей
и reasoning сверить с фактическими profile/readback при подготовке. Native
reviews продолжают покрывать direct-child поведение; external reviewer tests
закрывают отдельный поддерживаемый route, но не заменяют его в этих E2E.
В ZCode текущее literal model ID — `GLM-5.3-Flash`; сохранять регистр/ID
из profile. Обновить устаревшие notes AGY «one native Session across stages»
в новом наборе definitions, чтобы они соответствовали выбранной политике.

Подготовка в следующем implementation/run пакете:

1. Коммитить согласованные engine/flow-pack/case изменения; выпустить engine
   штатным release workflow, проверить installed artifact штатным digest.
   Создать новый checkpoint: новый engine и flow-pack commit, прежний source
   baseline. Пересчитать ссылки и SHA штатными средствами; clean committed
   definition tree обязателен (`runner.mjs:1305–1307`).
2. Четыре новых изолированных `DD_EVAL_HOME`, pinned `DD_FLOW_BIN`, config
   homes. Для параллельных запусков один явно заданный campaign
   `DD_FLOW_RESOURCE_HOME` по execute-eval runbook; не четыре независимых
   реестра, теряющих общий учёт процессов. Проверить бюджеты Subject, children,
   reviewers и Judge; сохранить достаточную ёмкость для завершения каждого.
3. Codex Subject/Judges: проверить `cx` → CPA и источник credentials без
   вывода секретов; generated isolated homes должны наследовать нужный
   transport. Обновить установленный hook target в `~/.codex` и `~/.codex-cpa`
   по runbook. AGY qualified hooks устанавливаются при materialization и
   наследуются feature/copy, дальнейшие checks не меняют их.
4. Доктора и bounded technical native fixtures на изменённых контрактах:
   root→direct child start/finish, changed input retry, PROTOCOLIZE stable cwd,
   fresh feature Session, fresh integration Session; для затронутого external
   review route — отдельный root/copy admission. Сохранить native event,
   observed cwd/provenance, owner и lifecycle receipt. Использовать общую
   fixture с четырьмя adapter вариантами, не четыре копии flow-логики.
   Чистый mock или noFlow probe не заменяет этот gate. Не выполнять второй
   продуктовый baseline как скрытую подготовку.
5. Один стандартный `runner eval preflight --profile <new-profile>` на cell;
   это readiness, baseline ещё `not_run`. Установленные Subject/Judge routes
   должны совпадать с frozen profile. Проверить доступность project PostgreSQL
   и других штатных prerequisites; actual baseline запускает сам EVAL.
6. Затем ровно один `runner eval run` на готовую cell, сохранить EVAL/RUN IDs,
   home и immutable manifest. Текущий запрос — аудит плана; эти productive
   действия выполняются при реализации/запуске, не во время проверки документа.

## VI. Приёмка полного цикла и готовность

Перед scored запуском общий integration test должен провести все семь Stage
через controller с adapter fixtures четырёх harness, включая хотя бы один
correctable rejection, обязательный SPECIFY HITL, native fanout, review
multi-wave и repair→повторную проверку, затем server MERGE. Fault cases
проверяются отдельно: ошибка одной cell не отменяет здоровые соседние,
observation timeout не дублирует prompt, cancellation сохраняет primary cause.
Это проверка механики; реальное поведение модели подтверждают только E2E.
Отдельная regression MERGE repair должна вернуть исправление в source
workspace, сохранить integration target от model-authored product edits и
принять только новую проверенную source revision по штатному repair route.
Также проверить ожидание уже запущенного долгого check по прежнему handle,
без второго `work finish`/provider prompt и без потери его позднего результата.

| Граница | Доказательство в каждой из четырёх cell |
| --- | --- |
| Baseline/start | Собственный baseline PASS, ready daemon/native Session, первый Stage receipt; authentication/doctor PASS не заменяет это |
| SPECIFY/HITL | Разрешённый pause, matched Interaction Judge, единственный сохранённый answer, resume той же pause/Session и её закрытие; accepted decisions этого RUN |
| PROTOCOLIZE→PLAN | Provisioned feature route; PROTOCOLIZE finish из его Stage cwd; fresh PLAN в feature; accepted SPECIFY доступен |
| PLAN/PLAN-REVIEW | Accepted plan, complete Work membership, direct child start/result и независимое native settlement; review inputs не изменены между waves |
| CODE/CODE-REVIEW | Завершённые назначенные Works, обязательные checks, закрытые material findings; если был repair, его causal receipt и последующая aggregate verification |
| MERGE | Claimed request, fresh Session на integration target, принятый frozen source, фактический target commit/tree и обязательные target checks; только `MERGE done` недостаточно без доказательств target |
| Capture/settlement | Terminal boundary snapshot с проверяемым manifest/hash; native children/операции и принадлежащие запуску productive процессы settled, capacity освобождена; никакого оставленного active writer |
| Scored report | `candidate_ready` полного MERGE, immutable candidate, `judge_status=completed` и Judge receipt на тот же candidate hash; report без infrastructure-invalid attribution |

`runner.mjs:1557–1630` вычисляет `state=completed` по execution candidates
независимо от ошибки Final Judge. Поэтому monitor/отчёт проверяет отдельно
`execution_state`, `cleanup_state`, `judge_status`, candidate и primary error.
Это уточнение критерия приёмки, не требование переименовать существующий state.
Semantic качество оценивается существующим `assessment.json`/методологией:
сохранены golden E2E outcomes, нет blocking/material нарушения essential
criteria. Не вводить новый произвольный score threshold и не считать
техническое завершение доказательством правильного продукта.

В campaign report одна строка на harness: source/flow/engine/profile pins,
EVAL/RUN/home, baseline, семь Stage, HITL, target tree, settlement, candidate,
Judge, итог и ссылки на evidence. Допустимые итоги: полный успех; завершённый
цикл с semantic failure; blocker с точной первопричиной. Последние два
оставляют цель полного успешного четырёхкратного E2E открытой.

При подтверждённом fatal blocker фиксировать evidence, останавливать только
его execution штатным `runner cancel --eval ... --execution ...` (если ещё
активен), проверять physical settlement; healthy cells продолжают. Отсутствие
новых timestamp, pending native request или диагностический timeout сами по
себе не blocker. Ответ/команду с unknown effect не повторять. Старые failed
EVAL не ремонтировать; новый повтор возможен после зафиксированного исправления
и нового manifest. Heartbeat ранее отключён: без нового указания его не
включать; согласованный мониторинг опирается на штатный status и runbook.

Оставшиеся исследовательские gates ограничены конкретным доказательством:

- AGY multi-root payload: actual selected cwd либо launch-bound proof с
  явно указанным происхождением; неизвестный native rebind обходится fresh
  Sessions, а не фальшивым «cwd verified».
- SQLite: exact исторический holder не восстановлен; concurrent slow-I/O
  fixture и writer duration новой реализации должны доказать устранение
  установленного опасного паттерна. Историческую причину не выдумывать.
- Внешняя quota/capacity/auth: проверяется текущим native gate; при отказе
  cell блокирована. Нельзя автоматически менять модель, скрыто повторять
  productive request или обещать исправить внешний provider кодом runtime.

- [x] Исходный согласованный объём и новые подтверждённые sibling-дефекты
      отделены от рисков.
- [x] Названы общие участки исправления, а не по одному workaround на EVAL.
- [x] Уточнены semantic args/retry, Stage cwd, publication/recovery и их тесты.
- [x] Выбрана конкретная совместимая политика четырёх новых запусков.
- [x] Названы репозитории, зависимости, packaging и чистый checkpoint gate.
- [x] Полный цикл и semantic успех отделены от start/terminal state/Judge failure.
- [x] Реализация, полный release gate и новый pinned engine CP-162.
- [ ] Четыре свежих scored E2E, семь Stage, MERGE, terminal candidate и
      завершённый Judge: приёмка ещё не доказана.

## VII. CP-164: проверка beta.106 и уточнение исправлений

CP-164 подтвердил baseline PASS, native Session/Turn, SPECIFY HITL и переход
через PROTOCOLIZE и PLAN для AGY, ZCode и Luna. Все три EVAL завершились
`completed_with_failures` в PLAN-REVIEW; старые артефакты не исправлять и не
возобновлять. Grok scored запуск не создавался: native capacity smoke вернул
`Authentication required` до root Session. Скопированный OIDC credential
`~/.grok/auth.json` истёк 2026-09-25; новый smoke допустим после `grok login`,
не после изменения flow-кода.

| Cell | Подтверждённая первопричина | Исправление и проверка |
| --- | --- | --- |
| AGY `EVAL-20260927011156-e2543411` | Корневой PLAN-REVIEW получил исправленный `plan.json` с объектом вместо строки в `acceptance[7].fixtures[0]`. Валидатор правильно отказал, но агрегирующий `validation` потерял `phase/effect/recoverable`, поэтому controller принял поправимую ошибку за fatal. | До публикации PLAN/PLAN-REVIEW сохранять в агрегирующей ошибке доказательство `prepare/no_effect/recoverable`; выдавать один exact successor, не повторять выполненную команду. Интеграционный тест CLI проверяет отсутствие публикации и контракт ошибки. |
| ZCode `EVAL-20260927011155-c68cfacd` | Во время последовательных `set_mode → setThoughtLevel → setModel` ZCode сообщил переходное `mode=build`; итоговый `session/read` уже показывал требуемый `yolo`. Проверка была вооружена между частями настройки и ложно объявила `profile_integrity_violation`. | Считать настройку одним непроизводительным интервалом: временно не проверять промежуточные уведомления, дождаться их обработки, сверить итоговый native readback и лишь затем вооружить контроль последующего дрейфа. Fixture воспроизводит промежуточный `build`. |
| Luna `EVAL-20260927011155-712c0874` | Child WRK-004 указал несуществующий `run://.../03-plan/.../plan.json` вместо `.memory-bank/protocol/.../plan.json`. `work finish` отказал с `evidence_ref_missing` ещё до execution, но invocation остался `observed` и ответ не содержал `retry_command`; child остановился. | Pure input preparation должна завершать наблюдаемый отказ и выдавать successor только при доказанном `no_effect` и известном поправимом коде. Повреждённые retained runtime artifacts остаются fatal. Review packet явно называет workspace-relative PLAN path. Тесты проверяют оба исхода. |

Следующий релизный gate: beta.107 из clean committed source, typecheck,
lint, release/integration/runtime-sensitive tests, immutable package candidate
и publish/consumer verification. Затем новый clean dd-eval definition checkpoint,
четыре новые изолированные cell, native auth/capacity gate Grok и ровно один
scored запуск на готовую cell. Полная приёмка остаётся прежней: семь Stage,
MERGE, immutable candidate и Final Judge для каждой упряжки. Блокер одной
cell не останавливает остальные, а терминальный EVAL не возобновляется.

## CP173–175: full-cycle runtime findings and remaining acceptance

CP173 использует собственный baseline PASS в каждой cell и beta.112. Не
смешивать RUN `done` с терминальным scored EVAL/Judge. Терминальные неуспешные
EVAL остаются неизменными; замена — новый home, checkpoint и scored EVAL.

| Cell / EVAL | Установленная первопричина | Системный фикс и доказательство |
| --- | --- | --- |
| AGY CP173 `EVAL-20260927142100-dfffc6a9`; ZCode CP173 `EVAL-20260927142802-f162d549` | `startBoundWork` сравнивал весь `RUN.index_json` при подготовке соседних reviewer Work. Первый корректный старт обновлял общую RUN-проекцию и ошибочно запрещал второй (`work_not_ready`). | PR #33, beta.113: оставить guards собственного Work/generation/dependencies/review-input, убрать только глобальное сравнение проекции. AGY CP174 запустил и завершил все четыре CODE-REVIEW Work. ZCode CP174 `EVAL-20260927170147-b5668788` запущен на beta.113, итог ожидается. |
| AGY CP174 `EVAL-20260927154655-dbb94a7c` | На MERGE native launch cwd был integration target, но общий hook-router определял его только для `stage ... --stage merge`. Для `merge apply`/`merge repair` без Stage/RUN позиции он падал обратно на feature cwd и давал ложный `agy_directory_mismatch`. | PR #35, beta.114: получать integration cwd по сохранённому `MRG-ID`, с прежним fail-closed cwd guard. Регрессии покрывают обе команды и состояния `dispatching`/`active`/`action_required`; targeted tests, typecheck, lint PASS. Нужен новый AGY scored E2E на опубликованном engine. |
| Luna CP173 `EVAL-20260927143220-6354677a` | MERGE замораживал hash check-профиля integration target *до* применения принятого source, а после `merge apply` сравнивал его с target, содержащим две новые task-priority aliases. Старая политика не менялась; `check_profile_drift` был ложным. | PR #37, beta.115: до enqueue разрешить только добавление новых aliases к baseline, запретить изменение/удаление существующих bindings, metadata и mandatory policy; заморозить hash reviewed source и после apply сверить target с ним. Положительная и отрицательные регрессии, typecheck, lint PASS. Нужен новый Luna scored E2E на опубликованном engine. |
| Grok CP173 `EVAL-20260927142324-34415c11` | Runtime-дефекта в этой cell не возникло. | Все семь Stage и MERGE завершены; `execution_state=completed`, `cleanup_state=settled`, `judge_status=completed`, `run_validity=valid`. Полная acceptance Grok PASS. |

Guarded publish beta.115 завершился PASS (все integration shards,
runtime-sensitive, candidate, registry consumer). CP175 checkpoint сохраняет те
же task/source/flow inputs и пинит проверенный snapshot
`ee206821619caf842a9b3c57c9b52c8919ca423bf3fd9fbc383a511efc41d940`.
Оставшиеся действия: провести по отдельности preflight, собственный baseline
и полный E2E для AGY и Luna.
Продолжать ZCode CP174 до terminal candidate/Judge. Для всех новых cell
проверить MERGE target gate, terminal boundary capture, process settlement и
Final Judge. Любой новый blocker расследовать read-only, не чинить старый RUN
вручную и не останавливать здоровые соседние cell.

## CP176: фактические blockers после CP175 и подготовка новых cell

Сведения ниже уточняют прежние ожидаемые итоги; они не переопределяют уже
запущенные manifest/engine/definition. Grok CP173 остаётся полным PASS.

| Cell | Подтверждённое состояние и первопричина | Системное действие |
| --- | --- | --- |
| ZCode CP174 `EVAL-20260927170147-b5668788` | RUN дошёл до CODE и `WRK-011`. Native child вызвал выданный `work finish` через ZCode Bash с `run_in_background=true`. CLI ожидал ACP `tool_call`, но для этого фонового вызова его нет в adapter journal; synchronous PreToolUse намеренно не создавал конкурирующую квитанцию для invocation-ID. Получен `invocation_receipt_timeout`/`effect=no_effect`; после остановки observer сообщил вторичное `recovery_observation_budget_exhausted`, EVAL `recovery_blocked`, живых владельцев нет. | dd-flow PR #39, опубликованная beta.116: native PreToolUse отклоняет только managed lifecycle Bash с `run_in_background=true` до исполнения; единая общая инструкция требует foreground во всех Stage/Work промптах. Обычный фоновый Bash не ограничен. Regression на публичную/issued команду и unrelated Bash, typecheck, lint, build и полный guarded release gate PASS. Старый EVAL не возобновлять; следующий ZCode требует отдельный pinned checkpoint и home. |
| AGY CP175 `EVAL-20260927181605-5203d034` | Собственный baseline PASS, CODE достигнут. Native provider завершил Turn с `agy_provider_quota_exhausted` и точным сообщением об individual quota; EVAL `completed_with_failures`, cleanup без ошибки. Это внешний лимит, не прежний auth/cwd дефект. | Не повторять старый Turn или EVAL. Новый запуск допустим лишь после восстановления quota и собственной preflight/baseline. |
| AGY CP176 `EVAL-20260927203052-1d2488be` | Новый home, beta.115/CP175; preflight PASS, AGY doctor auth available, hooks qualified. Собственный baseline остановился **до Subject Session**: Web unit test `App.test.tsx` с синхронной проверкой loading state превысил неявный Vitest `testTimeout=5000` на загруженном хосте (7.5 с); прочие unit tests прошли. EVAL `completed_with_failures`, живых процессов нет. | В исходной baseline-ветке продукта `fix/eval-unit-timeouts` commit `15a6a5e` задаёт bounded `testTimeout=30_000` во всех пяти Vitest-конфигах API/Web, не меняя assertions. Web 11/11, API 29/29, format/lint/typecheck PASS. Следующий source checkpoint должен пинить этот commit, а baseline выполняться без параллельных тяжёлых проверок другой cell. Старый EVAL не изменять. |
| Luna CP175 `EVAL-20260927181921-3348d5e4` | Собственный baseline PASS, SPECIFY/HITL→PROTOCOLIZE→PLAN→PLAN-REVIEW завершены, CODE активен на момент записи. | Продолжать мониторинг actual Stage/native turns/Work graph; не вмешиваться из-за отсутствия немедленного перехода. Полный MERGE/candidate/Judge пока не доказан. |

Guarded release beta.116: [workflow](https://github.com/deksden-com/dd-flow-cli/actions/runs/36347414796)
PASS для prepare, четырёх integration shards, runtime-sensitive, candidate и
publish/registry consumer. Следующие scored cell должны иметь новый committed
definition/checkpoint с точными source/flow/engine pins и проверенным installed
engine snapshot SHA, отдельные home и собственный baseline. Не считать
исправление тестового timeout или успешный preflight доказательством полного E2E.
До нового baseline не запускать параллельно CPU-heavy Work check другой cell;
это scheduling gate для стабильного измерения, а не пропуск проверки.

CP177 preparation (без scored запуска): source tag
`eval/cp-177-source-unit-timeouts` указывает на `15a6a5e`, а отдельная
committed definition `efacd4c` пинит этот source, прежний flow pack
`b0b124f` и опубликованный beta.116 commit `c30f54c`. Snapshot SHA
`ae81c33309b588a6766aea91ec55160b52cd3adb7e56cfe29e77d64597416db4`
совпал с независимым `engineArtifactDigest`/`verifyEngineArtifact`.
AGY и ZCode прошли собственные preflight в новых home: профиль/движок,
квалификация AGY hooks, ZCode native lifecycle и Judge doctor — PASS;
`baseline_admission=not_run`, provider Sessions не создавались. Это готовность
входов, **не** доказательство рабочего полного цикла. Luna CP175 ещё в CODE;
новый CPU-heavy baseline не совмещать с её Work checks. Общий `npm test`
для dd-eval был прерван, когда запустил множество параллельных процессов рядом
с Luna; целевой `engine-admission` test PASS, полный набор не заявляется.

CP177 live: AGY `EVAL-20260927213303-17863f24` прошёл baseline PASS и
создал native Session в SPECIFY, затем остановился с `interaction_fixture_gap`.
AGY спросил о возможности менять приоритет закрытых задач, а canonical
scripted-ответ уточнял значения/архивный проект, но не статус самой задачи.
Judge обоснованно отметил uncovered question; EVAL terminal
`completed_with_failures`, все процессы settled. В CP178 definition canonical
`entry-pack-source/interactions/specify.json` теперь явно отвечает и про
открытые/закрытые задачи. Неиспользуемые старые `interactions/specify.json` и
Markdown-ответ удалены: загрузчик E2E читает только canonical response.
`interactionFixtureManifest` строит новый pin, entry-pack tests 15/15 PASS.
Старый EVAL не возобновлять; новый AGY scored E2E нужен для live проверки.
ZCode CP177 `EVAL-20260927214029-2c96691d` запущен отдельно на beta.116;
его baseline/Subject результат оценивать только по собственным receipts.
