# CP-108: детерминированный fork с апгрейдом engine и продолжением EVAL

Статус: fork-007 прошёл PLAN-REVIEW, но 2026-09-14 остановился из-за неполного EVAL manifest. Исправление интеграции fork с общим lifecycle и регрессионные проверки описаны в разделе 9. Новый живой прогон после этого исправления ещё не запускался.

## Результат и границы

Реализовать один воспроизводимый путь: подтверждённый checkpoint → изолированный производный RUN → выбранный исправленный engine → продолжение с сохранённой границы под управлением dd-eval.

Первый реальный сценарий: продолжить ZCode EVAL `EVAL-20260914164431-d2acf1d8` с входа в PLAN-REVIEW, не повторяя SPECIFY/PROTOCOLIZE/PLAN. Старый RUN, EVAL, snapshot и их ошибки неизменны. Это новый связанный эксперимент, не исправление истории старого результата.

Не включать в первый выпуск: произвольный rewind внутри стадии, восстановление из неполного snapshot, перенос живых provider-сессий, универсальные миграции любых исторических схем, изменение flow/memorybank вместе с engine, автоматическое повторение внешних эффектов MERGE. Все штатные границы описать сразу; неподдержанные источники явно отклонять.

## 1. Источник первого продолжения

- EVAL home: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/runs/EVAL-20260914164431-d2acf1d8`.
- Execution: `e2e`; RUN: `RUN-001-eval-subject`.
- Boundary key: `13244ad697126e5f22f5e26c1bf2b11f752998eb0513ef74aa6a8d1ea3393956`.
- Snapshot: `executions/e2e/boundaries/plan-13244ad697126e5f22f5e26c1bf2b11f752998eb0513ef74aa6a8d1ea3393956` относительно EVAL home.
- Manifest SHA-256 при расследовании: `ee561145bf9bfc42beeb2bd0df6c8febac672ddd6ff425fbb28f73ee3de441d4`.
- `purpose=stage_entry`, `stage_entry=plan-review`.

Перед использованием повторно проверить manifest и весь payload существующим verifier. Директория или commit сами по себе не являются доказательством целостности. Последний recovery после падения сейчас не подтверждён; его не использовать. Результаты reviewers, полученные после выбранной точки, в продолжение не подмешивать.

## 2. Публичный контракт

```text
dd-eval runner checkpoints --eval <SOURCE-EVAL> [--execution e2e]
dd-flow run fork --from <SEALED-STAGE-ENTRY-SNAPSHOT> --output <EMPTY-DIRECTORY>
  --engine-version <EXACT-VERSION> --request-id <ID> [--integrity-checksum <SHA256>] --json
dd-eval runner fork --eval <SOURCE-EVAL> --execution e2e --from <CHECKPOINT-ID>
  --output <NEW-EVAL-ROOT> --engine-version <EXACT-VERSION> --request-id <ID>
  [--integrity-checksum <SHA256>] [--start true]
```

`dd-eval runner checkpoints` — единственный каталог точек для EVAL: он показывает только
проверяемые `stage_entry` snapshots. Отдельный `dd-flow run checkpoints` не нужен: `dd-flow`
получает абсолютный locator уже выбранного snapshot и использует существующий verifier restore.

- `--from` разрешается однозначно в manifest hash и разрешённую stage entry. Нельзя независимо передать произвольный этап и не относящийся к нему snapshot.
- Версию engine разрешить до dispatch и сохранить package integrity/build identity. Плавающий tag не остаётся частью замороженного intent. Непубликованная локальная сборка допустима только через уже поддерживаемый immutable engine artifact; не привязывать RUN к изменяемому `dist`.
- Без `--start`: подготовить, проверить, вернуть состояние `ready` и точную команду продолжения. С `--start true`: после тех же проверок один раз передать запуск существующему controller; первое поколение нового execution всегда имеет canonical operation ID `<EVAL>:<execution>:launch`.
- Ответ включает fork/request ID, новый runtime/EVAL home, локальный RUN ID, parent identity, checkpoint hash, старый/новый engine, target stage, controller/operation handle и состояние.
- Идентичный request ID с идентичным нормализованным intent возвращает прежний результат/handle. Изменённые параметры — конфликт. Параллельные вызовы не создают две копии или два prompt.

Идентичность производного экземпляра — новый fork/runtime ID и home. Внутренние RUN/Work ID из snapshot сохранять в изолированном пространстве: не делать массовую замену идентификаторов в исторических документах. В отчётах всегда показывать составную identity и parent; новый EVAL получает собственный ID.

## 3. Реализация в dd-flow-cli

Опорные места: `src/cli/run-cli.ts`, `src/services/eval-snapshots.ts`, `run-controller-capture.ts`, `run-engine-bindings.ts`, существующие engine resolve/install и controller start services. Малый orchestration service допустим; второй snapshot/restore engine не нужен.

### 3.1. Каталог контрольных точек

Переиспользовать controller `boundary_captured` receipts и snapshot manifests. Для нового fork записывать ссылку на доступные source checkpoints, чтобы доступ к ним не зависел от живого исходного controller. Выдавать стабильный ID, predecessor, next stage, время, Git HEAD, manifest checksum, состояние проверки и точную причину отказа.

Допуск определяется payload verifier и легальным переходом из stage catalog, а не только отсутствием `target` в stage_runs. Проверить обязательные predecessor receipts и согласованность Works/артефактов. Существующие checkpoint без отдельного Git-коммита принимать, если полный Git snapshot и runtime payload подтверждены.

### 3.2. Prepare → restore → upgrade → validate → ready → start

1. Создать durable intent рядом с целевой директорией под существующей блокировкой. Сохранить source identity/checksum, engine integrity, output, routing и request ID.
2. Проверить пути: новый destination не равен и не вложен в source RUN/snapshot; не является symlink на них; не содержит чужих данных. Source открыть только для чтения, без запуска миграций исходной БД.
3. Восстановить checkpoint существующим `restoreEvalRunSnapshot` в собственную staging-директорию. SQLite брать из согласованного snapshot, не копировать live db/WAL из упавшего RUN.
4. Переиспользовать `detachSnapshotRuntimeOwners` и rebase. Сохранить принятую работу и source lineage; старые PID, leases, listeners, controller operations и launch capabilities не становятся полномочиями новой копии. Новые provider sessions создаются при dispatch.
5. Установить выбранный engine и выполнить поддерживаемые DB migrations только в копии. Сохранить прежний engine binding в lineage; сформировать новый binding через явный fork-only import path, до появления нового controller. Обычный `writeRunEngineBinding` остаётся immutable — общего `--force` не добавлять.
6. Проверить входы следующей стадии новым engine без запуска модели. Сохранить flow/memorybank версии, требования, ответы HITL и принятые predecessor результаты. Проверить references, artifact schemas, Work dependencies и routing. Не переписывать принятый batch «для удобства» и не переотмечать старые ошибки успешными.
7. Неизвестная схема/невосстановимая ссылка/несогласованный граф — structured failure с именем артефакта и поддерживаемой альтернативной точкой. Не откатываться автоматически на другой checkpoint.
8. Опубликовать ready receipt лишь после успешной проверки всех частей. Переименование staging в окончательный путь не должно ломать абсолютные пути: финальный rebase и его верификация обязательны до ready; либо использовать окончательное расположение с закрытым admission и отдельным ready marker. Выбрать один существующий паттерн, не смешивать оба.
9. При `--start` записать dispatch intent со стабильным operation ID, затем вызвать существующий controller start. Потерянный ответ — reconcile по handle, не новый controller/prompt.

При сбое между шагами повтор команды продолжает по durable `.fork-intent.json`/`fork.json` receipts. Частично подготовленная копия не допускается к исполнению. Retry очищает только известные каталоги, созданные тем же intent; любой посторонний файл даёт `fork_retry_inspect_required` и остаётся для диагностики. Источник не затрагивается ни при одном исходе.

Совместимость — проверка того, что новый engine может корректно прочитать оставленные входы, а не требование равенства версий и не полный E2E gate. Поддерживаемый апгрейд не требует повторного выполнения завершённых стадий.

## 4. Контрольные точки флоу

| Вход | Обязательный сохранённый набор |
|---|---|
| SPECIFY | Bootstrap snapshot: исходный проект, intake, pinned flow/memorybank, execution config |
| PROTOCOLIZE | Принятый SPECIFY, полный канонический ответ/HITL receipt, исходные требования |
| PLAN | Принятый PROTOCOLIZE, protocol/PSET identity, связи с требованиями |
| PLAN-REVIEW | Принятый PLAN, aspect maps, proposed batch и PLAN receipt |
| CODE | Принятый PLAN-REVIEW либо разрешённый review-off receipt, окончательный batch и граф Works |
| CODE-REVIEW | Завершённые CODE Works, исходники, проверочные receipts, CODE report |
| MERGE | Принятый CODE-REVIEW либо разрешённый review-off receipt, candidate identity и delivery policy |

Сохранять границу после принятия predecessor и остановки его writers, до dispatch successor, через существующий controller barrier. Действительные review-off переходы брать из frozen flow config. После MERGE хранить terminal candidate, не предлагать его как повторный старт MERGE.

Git anchor и manifest должны описывать одно состояние. Для новых checkpoints сохранять HEAD, index/staged patch, unstaged patch, необходимые untracked files и Git bundle, как уже делает snapshot. Если нужен отдельный checkpoint commit — только технический ref в изолированном snapshot Git, без движения пользовательской ветки и без включения runtime/secrets. Не делать новый обязательный business commit условием использования старых целых checkpoints.

MERGE boundary допустима только при доказанном отсутствии незавершённой delivery operation; перед выполнением заново проверить target branch и внешнее состояние. Git reset не откатывает БД, deploy или publish. Для EVAL внешняя среда должна быть изолирована и восстановлена существующей fixture policy. Без такой политики не обещать продолжение затронутой стадии.

## 5. Интеграция dd-eval

Опорные места: `lib/runner.mjs`, CLI runner dispatch, manifest/events/checkpoint preparation и `lib/eval-resume-worker.mjs`.

- `runner fork` создаёт новый EVAL manifest и execution, вызывает один dd-flow fork service; ручного копирования RUN в eval не добавлять.
- Зафиксировать source EVAL/RUN/checkpoint, выбранный engine, routing и сохранённые flow/memorybank. Сохранить provenance исходного checkpoint, но создать новую input identity, соответствующую upgraded engine: не обходить `assertCheckpointEngine`.
- Execution начинается с `plan-review`, terminal target берётся из исходного сценария. Передать штатную fixture/ответы и политику unexpected HITL. Не запускать канонический bootstrap заново для уже принятого SPECIFY.
- Доставка вопросов, stop/recovery и события идут через обычные runner/controller механизмы. Fork-команда не становится вторым оркестратором стадий.
- Раздельно учитывать inherited evidence и newly executed stages, usage, duration. Производный прогон не выдавать за полный E2E с нуля, не включать унаследованные затраты в новые расходы.
- Потеря runner CLI-ответа не отменяет и не дублирует fork/start. Возвращать durable handle, доступный через status.

## 6. Регрессии и проверка без лишних прогонов

Использовать существующие snapshot/recovery/controller fixtures и fake adapter. Обязательные тесты:

1. Restore PLAN-REVIEW boundary на новый engine: source hashes неизменны, принятые входы сохранены, новый binding/lineage корректны, старые owners отсутствуют в executable inventory.
2. Первый PLAN-REVIEW finish с исправлением плана успешно переходит к CODE; это включает уже добавленную регрессию CP-108, не создавать дубликат всей цепочки.
3. Повтор/конкурентный fork с одним request ID, конфликт параметров; ответ потерян после dispatch — ровно один controller/prompt.
4. Fault injection после копирования, миграции, binding и перед ready/start: незавершённая копия не запускается, retry безопасен.
5. Неполный/повреждённый checkpoint, несовместимая schema, незаконный target stage, непустой destination и symlink в источник — отказ без изменений source.
6. Paths/DB/Works и artifact refs согласованы после relocation, в том числе `/var`/`/private/var` на macOS.
7. Dd-eval создаёт новый experiment identity, не повторяет завершённые стадии, не считает inherited usage новой, сохраняет fatal error и завершает cleanup.
8. Табличные проверки каждой разрешённой границы и review-off переходов; unresolved MERGE не импортируется как безопасный повтор.

Запустить профильные тесты, TypeScript/lint затронутых файлов. Не повторять полный release gate после каждой правки. Если runtime потребляет опубликованный пакет, выполнить один обязательный gate для итоговой release revision, опубликовать, проверить установленный consumer и зафиксировать exact engine identity. Если используется поддержанный immutable local engine, явно записать это в эксперименте; не заявлять published consumer verification.

## 7. Контролируемое продолжение CP-108

После реализации и профильной проверки:

1. Разрешить и проверить checkpoint из раздела 1; зафиксировать read-only hashes источника.
2. Подготовить новый engine вместе с проверенным ZCode adapter fix; сохранить точные версии и integrity обоих. Обновление только engine без adapter не закрывает прежний дефект ожидания закрытой сессии.
3. Выполнить `dd-eval runner fork` без start. Проверить ready receipt, input compatibility, изоляцию, lifecycle hooks/routing и отсутствие старых владельцев. Полный preflight/gate повторно не запускать.
4. Продолжить тот же request с явным start через предусмотренный отдельный start/reconcile path. `--start` не должен менять идентичность prepare intent: желание dispatch оформляется отдельной идемпотентной операцией, а не конфликтом исходных параметров.
5. Запустить ZCode с PLAN-REVIEW. Первый рубеж успеха — accepted review с первого valid finish и готовность CODE; затем продолжать до исходного terminal target, если нет существенного отклонения.
6. Наблюдать штатные process/operation/status/events. Настроить heartbeat примерно раз в 5 минут: сообщать переходы, ошибки, завершение и необходимость действия; при неизменном состоянии молчать. Быструю реакцию на failure обеспечивает controller, а не пятиминутный монитор.
7. При fatal error сохранить primary cause и диагностику, завершить cleanup по штатной политике; не обходить проверку ручным finish/правкой БД. При успехе приложить отчёт производного прогона и сравнение hashes исходного snapshot.

## 8. Фактическая реализация и контрольный запуск

- `dd-flow-cli`: `run-fork.ts` переиспользует `restoreEvalRunSnapshot`, записывает lineage,
  проверяет выбранный immutable engine через `run status` и меняет binding только в копии
  (`source=fork_upgrade`). Обычный binding остаётся immutable.
- `dd-eval`: fork использует стандартный layout `executions/<id>/{project,dd-flow-home}` и
  `managed-runtime.json`. Первоначально одного этого оказалось недостаточно: отдельная
  ветка start обошла общий lifecycle; это устранено в разделе 9.
  Перед dispatch materialize выполняется через обычный stage-input путь; provider session
  не переносится из snapshot.
- Профильные проверки: dd-flow fork regression + TypeScript/lint/build; dd-eval syntax и
  36 runner/recovery tests. Полный gate сознательно не повторялся.
- Source checkpoint повторно сверён: SHA-256
  `ee561145bf9bfc42beeb2bd0df6c8febac672ddd6ff425fbb28f73ee3de441d4`.
- Fork-006 сохранил первичную ошибку `execution_generation_stale`; она произошла до
  `dispatch_accepted` и до вызова модели. Причина — fork ошибочно использовал нестандартный
  operation ID. Исправление перевело его на canonical `<EVAL>:<execution>:launch` и добавило
  регрессию state-machine.
- Fork-007: root
  `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260914222400-plan-review-fork`,
  EVAL `EVAL-20260914202054-ae27fbd6`, RUN `RUN-001-eval-subject`, target `plan-review`.
  Engine `0.9.0-beta.64`, integrity
  `99a8fac56d9788911698ae36346f129010d79555d570530059015d283cbbd26a`.
  Controller создал новую ZCode session `sess_c84e9574-34e1-4568-8181-152b306f7d62` и принял
  первый prompt. Старый EVAL/RUN не менялся.

## Критерий готовности к первому продолжению

Готовы команда и durable retry, импорт checkpoint с upgrade, проверка входов, новый EVAL manifest/учёт и обычный controller dispatch; пройдены профильные регрессии; подготовлен exact engine+adapter artifact; prepare возвращает ready для реального CP-108 snapshot без изменения источника. Тогда можно сразу запускать продолжение. Расширение на mid-stage salvage и универсальный исторический upgrade не является условием этого запуска.

## 9. Исправление отказа fork-007 после принятого PLAN-REVIEW

Факт: `stage_finish` принят в 20:55:59 UTC, checkpoint перед CODE сохранён в
20:57:35 UTC. Затем callback EVAL выдал `interaction_fixture_invalid`: в производном
manifest не было `interaction_fixtures`. Это не новый HITL и не ошибка ZCode.
Отдельный `startForkedExecution` также пропустил остановку и финализацию: execution
стал failed, EVAL остался awaiting_provider, controller — waiting_for_context.

Исправление:

- Fork наследует definition, input checkpoint, entry-pack и проверенные fixture pins
  источника. Pins для всего оставшегося диапазона проверяются до подготовки/dispatch;
  отсутствующие или изменённые pins не пересчитываются молча по текущим файлам.
- Сохранённое baseline admission и его перечисленные логи копируются как evidence;
  baseline команды и законченные стадии заново не выполняются.
- `derived_from.engine` закрепляет выбранную сборку отдельно от исходного semantic
  checkpoint. Запуск и reattach проверяют её тем же artifact verifier. Обычный EVAL
  по-прежнему обязан совпадать с engine исходного checkpoint.
- Fork отличается только подготовкой. Start/retry идут через `runnerResumeLocked`,
  обычную очередь, `launchEvalExecution` и общую финализацию. Восстановленный RUN
  проверяется по ready receipt, runtime scope и engine; bootstrap не повторяется.
- Одна lifecycle-блокировка охватывает проверку receipt, очистку незавершённой
  подготовки, prepare и start. Повторная команда не выдаёт условный `started`, а
  возвращает reconciled результат без нового launch.
- Ошибка callback сохраняет boundary как evidence, вызывает штатный stop и capture.
  `completed_with_failures` допустим только после подтверждённого settlement;
  до него отдельно видны execution=failed и cleanup=pending. Потеря ответа не
  превращается в отказ и не приводит к дублированию controller.

Проверки: `test/runner-fork.test.mjs` проходит публичный fork prepare/start на fake CLI:
граница PLAN-REVIEW → CODE, concurrent/idempotent вызовы, missing/drifted pins,
ошибка callback с остановкой/финализацией, незавершённый cleanup, reattach после потери
ответа и проверка exact upgraded engine. Это не живой E2E и не повтор release gate.

Итог проверки: 156 профильных тестов прошли (включая 8 новых fork-регрессий),
5 gated интеграционных тестов с реальным CLI пропущены; syntax и `git diff --check`
прошли. В тестовых manifests добавлены обязательные pins; устаревшее ожидание CP-107
обновлено на уже используемый case-ом CP-108. Живые provider-запуски не выполнялись.

### Диагностика на старых артефактах без нового fork

Разрешено read-only: воспроизвести проверку старого manifest, собрать исправленное
представление только в памяти из pins исходного EVAL, проверить весь оставшийся
диапазон, engine artifact и hash сохранённого boundary manifest. Такая проверка
выполнена: ошибка воспроизведена, inherited pins для plan-review/code/code-review/merge
валидны, engine artifact и boundary manifest не изменены. Исходные manifest/journal
остались неизменны; никакого provider dispatch не было. Полная проверка payload
snapshot этим read-only сравнением manifest hash не заменяется.

Нельзя объявлять это успешным живым продолжением. Старый EVAL уже содержит terminal
failed operation и неполный manifest; обычный resume не должен стирать ошибку или
повторно отправлять launch. Для продуктивного продолжения того же RUN нужен явный
recovery с корректными retained metadata и подтверждённым sealed recovery source.
Не править БД/terminal events и не заменять failure на success ради smoke-проверки.
Для нового доказательного прогона использовать отдельный fork после проверки источника.
