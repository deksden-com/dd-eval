# CP-108: расследование падения и системный план исправлений

Статус: реализовано 2026-09-14; профильные регрессии и type checks пройдены. Новый производный ZCode EVAL fork-007 запущен с sealed PLAN-REVIEW boundary; старый RUN не изменялся. Даты событий ниже — UTC.

## Запуск и результат

- EVAL: `EVAL-20260914164431-d2acf1d8`, ZCode, cp-108.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.64`, commit `53046a13b2a4370531d64b380974abbd6bf2383b`.
- dd-eval: `1c8c22a28cdf64eabfde3d6dc21fa09bf189fe60`.
- zcode-acp: `60af0d31e13076a313d9770f10aa70f7c94742cf`.
- Evidence root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/runs/EVAL-20260914164431-d2acf1d8`.
- Baseline, SPECIFY, PROTOCOLIZE и PLAN пройдены. Пять reviewer Works завершились; это ревью плана, не выполнение CODE.
- После принятия замечаний модель подняла revision плана с 1 до 2 и исправила plan/aspect-map. По инструкции не редактировала generated CODE batch.
- 17:57:09.646: lifecycle outcome `stage_finish / stage_inputs_changed`, fatal; 17:57:09.666: controller boundary reached; 17:57:10.365: execution failed.
- 17:59:14.430: `recovery_blocked`, cleanup observation budget exhausted.
- Native cancel имеет durable receipt `completed`, `settled:true`, `close.closed:true`. Исходный prompt имеет поздний failed receipt от **17:59:09.031**, `acp_request_failed`, `Internal error: turn made no observed progress before the stop request`.

Важно: нельзя утверждать, что prompt до сих пор running. Это было состояние более раннего snapshot. Поздний terminal receipt появился, но завершения всего cleanup в рамках бюджета EVAL не подтвердил. Основная ошибка запуска остаётся `stage_inputs_changed`, а не поздняя ошибка ACP.

## F1. Самоинвалидация PLAN-REVIEW — подтверждённая первичная причина

Код dd-flow-cli:

- `src/services/vnext-plan-review.ts:151`: guard фиксирует checksum старого `code-work-batch.json`.
- Строка 191 вызывает `validateVnextPlanArtifacts`.
- `src/services/vnext-plan.ts:172-181`: валидатор строит новую проекцию и публикует batch через rename.
- `vnext-plan-review.ts:202`: guard повторно сравнивает файлы, видит собственное штатное изменение и бросает `stage_inputs_changed`.

При исправленном плане изменение batch обязательно: проекция содержит revision и checksum плана. Ошибка детерминирована порядком действий, а не доказанной гонкой и не неправильным поведением модели. Защита от изменения входов смешала входные документы с производным выходом.

Смежные места того же класса:

1. `validateVnextPlanArtifacts` также нормализует aspect-map на диске (`normalizeAspectMapRefs`, строки 315–326), в том числе при `publishBatch:false`. Поэтому проверка accepted handoff в CODE/CODE-REVIEW не полностью read-only.
2. `planSetChecksum` в PLAN-REVIEW хеширует только plan.json, не aspect-map. Последний участвует в валидации и группировке, но не защищён как отдельный вход текущего guard.
3. Все три вызова `stageInputGuard` — PLAN-REVIEW, CODE, CODE-REVIEW — используют весь набор Works RUN, а не явно заданные зависимости принятого решения. В CODE-REVIEW часть проверок reviewer/repair evidence выполняется до создания guard: снимок после проверки не доказывает, что проверялись именно эти данные. Это статические пробелы контракта; отдельное проявление в этом запуске не установлено.
4. Guard сообщает `effect:no_effect`, хотя PLAN-REVIEW уже изменил batch и мог сохранить decision receipt. SQL rollback не откатывает файловые операции. Нужно различать отсутствие бизнес-коммита и наличие подготовленных файлов.

Решение: разделить существующую функцию на подготовку/валидацию проекции и её публикацию, без новой подсистемы. Подготовка читает входы, нормализует значения в памяти, возвращает валидированные значения/bytes и их именованные hashes. Guard защищает исходные plan, aspect-map, decision, review context и релевантные Works. Derived batch не считается внешним входом. Перед принятием повторно проверить исходные hashes и DB dependencies, принять именно подготовленную проекцию. Публикацию generated-файлов сделать детерминированной и восстанавливаемой после файлового сбоя; не обещать общей транзакции SQLite+filesystem. Read-only handoff validator не пишет исходные документы.

Не исправлять отключением guard, произвольным обновлением его baseline после проверки или ручным редактированием batch моделью.

## F2. Потеря сообщения ошибки на lifecycle boundary

`src/cli/run-cli.ts:350` передаёт экземпляр AppError в `settleHook`. `lifecycle-invocations.ts` сериализует outcome через JSON.stringify. Стандартное Error.message не enumerable и исчезает. Поэтому основной CLI/ledger знает текст, а hook/controller/EVAL получает code с пустым сообщением.

Проверено прямым запуском сериализации реального `dist/shared/errors.js`: у объекта message есть, в JSON его нет. Это общий путь lifecycle-команд, а не особенность PLAN-REVIEW или ZCode. Его используют адаптеры через общий hook settlement, включая diagnostic fallback.

Решение: нормализовать ошибку в plain record на границе один раз; использовать существующие подходы `errorRecord`, не создавать конкурирующие форматы. Сохранять code, message, details, exitCode и безопасно ограниченную cause. Проверять обязательный message при чтении; старые неполные записи показывать с понятным fallback, не заменять исходную ошибку ошибкой cleanup. В `stage_inputs_changed` возвращать именованные изменившиеся входы и expected/actual hashes без содержимого документов.

## F3. Native close не завершает ожидающий ACP turn

В `zcode-acp/src/handlers/extensions.ts:161` closeSession закрывает native resident, но не связывает подтверждённое закрытие с pendingTurns. В `handlers/session.ts:1417` отменённый turn продолжает ждать terminal event; общий no-progress порог — 120 секунд, после него возникает ошибка со строкой 1669. Закрытая сессия не обязана прислать ожидаемое событие в прежний listener.

На стороне dd-flow `dd-zcode.mjs:cancelTree` доказывает закрытие дерева. `dd-zcode-daemon.mjs:prepareStop` отдельно ждёт activeProductive до 5 секунд. `daemon-operations.mjs` сохраняет terminal receipt только после завершения action promise. Получаются разные ответы на два вопроса: «native дерево закрыто?» и «RPC operation закончилась?».

Решение: в zcode-acp подтверждённое закрытие принадлежащей adapter-сессии должно завершать её ожидающие turns через общий механизм settlement, с корректной отменой и очисткой pending/listener/timers. Простого отправленного cancel недостаточно. Закрытие неизвестной/другой сессии и неоднозначный native ответ не дают права выдумывать terminal outcome. Позднее provider-событие не должно повторно завершать операцию или попадать в следующую генерацию.

В dd-flow сохранить общий durable operation receipt и проверку ownership. После подтверждённого close дождаться терминального receipt соответствующего prompt, согласовать controller operation, затем останавливать daemon. Не помечать prompt успешным только по пустому дереву.

Смежные границы: обычный cancel, cancel-child, daemon.stop, root/child productive dispatch, preemption и bridge disconnect. Codex уже имеет отдельный `cancelPendingDispatch`; нельзя механически считать его поведение эквивалентным ZCode. Общий daemon-operation journal используется шестью адаптерами: его тесты должны проверять единый контракт, а adapter-specific close остаётся внутри адаптера. Для остальных адаптеров аналогичный живой сбой данным запуском не доказан.

## F4. Cleanup snapshot и поздний terminal receipt

`run-control.ts` отдельно наблюдает native operation inventory и controller operation receipts. `dd-eval/lib/eval-resume-worker.mjs` прекращает cleanup при исчерпании 120-секундного observation budget. В этом запуске terminal receipt появился за несколько секунд до итогового recovery_blocked; сохранённое состояние всё ещё содержало причины незавершённой операции.

Это не доказательство, что весь cleanup уже мог безопасно завершиться: нужны ещё подтверждения daemon/process ownership и остановки. Но отчёт должен отличать актуальное неизвестное состояние от ранее наблюдавшегося pending.

Решение: в пределах существующего бюджета после значимого close/operation receipt заново читать затронутые локальные receipts; перед финальным blocked сохранять свежий ограниченный локальный snapshot, времена наблюдений и точные оставшиеся причины. Не запускать новый продуктивный запрос, не расширять бюджет бесконечно. После позднего receipt следующая явная cleanup-попытка должна продолжать reconciliation, а не эвал. Проверить временной сценарий receipt-before-deadline и receipt-after-deadline отдельно.

## F5. Тест маскировал первичный дефект

`dd-flow-cli/test/vnext-protocolize.test.ts:468-473`: перед принятием исправленного плана устанавливается SQL-trigger для fault injection. Для первого finish проверяется только `code != 0`, затем trigger снимается и finish повторяется.

Первый вызов может упасть раньше trigger, на stage_inputs_changed, уже пересоздав batch. Повторный вызов проходит с новым batch. Таким образом зелёный тест не доказывает ни попадание в нужную точку fault injection, ни успешность штатного first attempt. `stage-consistency.test.ts` проверяет отдельно guard и SQL rollback, не реальный порядок подготовки файлов.

Решение и обязательные регрессии:

1. Исправленный PLAN → первый finish accepted, без предварительного намеренного падения; clean review также проходит.
2. Fault injection проверяет конкретную ошибку и достижение точки инъекции; после отказа проверяются DB и файловые receipts, затем корректный retry.
3. Изменение plan/aspect-map/decision/релевантного Work между чтением и settlement отвергается; штатная генерация batch не отвергается.
4. Read-only handoff не меняет ни байта. Ошибка публикации не маскируется как полное no_effect.
5. Реальный AppError проходит CLI → hook JSON → controller → EVAL с неизменным code/message; отдельно fallback хранения и ошибка cleanup.
6. Pending ACP prompt + подтверждённый close без terminal event завершается быстро и ровно один раз; отрицательные случаи wrong session, неподтверждённое close, late event, child, повторный cancel.
7. Durable journal, controller operation и cleanup согласуются по одному operation/session/generation; поздний receipt обновляет диагностику, но не запускает повторный prompt.

## Порядок реализации и проверки

1. F1 и F5 вместе: подготовка/публикация, полноценные input guards, first-attempt regression, точная fault injection.
2. F2: общий error boundary и end-to-end тест без живой модели.
3. F3: ZCode close/turn settlement; общий adapter journal contract.
4. F4: bounded reconciliation и свежая диагностика.
5. Профильные тесты изменённых путей, один обязательный release gate на итоговом release commit, published consumer check. Не повторять все долгие прогоны после каждой узкой правки.
6. После публикации и обновления checkpoint — новый ZCode E2E. Старый запуск оставить доказательством, не превращать в успешный результат повтором finish.

## Выполненное исправление

1. `dd-flow-cli/src/services/vnext-plan-review.ts`: stage guard теперь защищает plan, aspect-map, decision, work-context и Works, но не generated `code-work-batch.json`. Это сохраняет защиту от внешней смены входов и разрешает штатную публикацию нового batch.
2. `dd-flow-cli/src/services/vnext-plan.ts`: CODE/CODE-REVIEW handoff больше не нормализует aspect-map при проверке; проверка принятых артефактов не имеет побочного эффекта.
3. `dd-flow-cli/src/shared/errors.ts` и `src/services/lifecycle-invocations.ts`: Error/AppError превращается в plain record до записи hook outcome; code, message, exitCode, details и ограниченная cause сохраняются.
4. `zcode-acp`: подтверждённый `zcode/session/close` завершает относящиеся pending turns результатом `stopReason: cancelled`, а не generic no-progress error. Проверяется ожидание событий, busy-send/retry и закрытие во время subscribe; закрытый turn не должен инициировать reload после отказа subscribe. Captured turn objects защищают следующую генерацию от позднего close reply.
5. Dd-eval: отсутствие terminal receipt объясняло задержку ZCode, но само по себе не закрывало F4. Теперь последняя секунда существующего observation budget резервируется для ограниченного read-only `runnerControlStatus`. `final_observation` сохраняет времена начала/окончания, текущие локальные control receipts и unavailable-ошибки. Это не доказательство settlement и не основание повторно запускать Subject. Если предыдущий RPC уже исчерпал весь бюджет, невозможность нового чтения явно сохраняется; старое наблюдение не называется свежим.

### Дополнительное ревью реализации

- Первоначальная реализация F1 была неполной: aspect-map всё ещё нормализовался после снятия guard baseline, а batch публиковался до guard. `prepareVnextPlanArtifacts` теперь готовит и проверяет bytes во временных файлах без изменения исходных артефактов; PLAN-REVIEW публикует их только после проверки входов. Ошибка публикации сообщает `effect: unknown`, перечень опубликованных файлов и отсутствие бизнес-коммита. Общая транзакция файлов и SQLite не обещается.
- В CODE-REVIEW guard перенесён перед чтением/валидацией решения и reviewer evidence; защищён также review-context. Диагностика guard содержит изменившиеся категории входов и expected/actual SHA-256 без раскрытия содержимого.
- Абсолютные aspect-map refs канонизируются существующим helper: `/var/...` и `/private/var/...` на macOS не являются выходом из project scope. Это обнаружила новая регрессия; защиту от настоящего выхода из scope не отключали.
- Исторические hook receipts без Error.message получают явное fallback-сообщение. Новые receipts сохраняют настоящий AppError до JSON-сериализации.
- В тесте отделён штатный первый finish от fault injection. Для SQL fault проверяется конкретный `details.cause.message` и rollback, а не просто ненулевой exit code или внешний текст `SQLite write failed`.

Проверки этого ревью фиксируются по завершённым процессам, а не по факту запуска команды. Полный release gate, публикация и новый живой E2E в это ревью не входят. Ранее записанное общее утверждение о прохождении всех профильных/console тестов не является подтверждением итоговой ревизии.

Подтверждённые результаты: оба варианта PLAN → PLAN-REVIEW → CODE → MERGE regression прошли после исправления (first attempt и injected SQL failure/retry); 7 stage-consistency tests; lifecycle/AppError regressions прошли в профильном прогоне. ZCode: 19 tests, TypeScript и ESLint — exit 0. Dd-flow: TypeScript и ESLint изменённых файлов — exit 0. Dd-eval: 33 recovery tests плюс отдельно добавленный worker final-observation integration test — exit 0; синтаксис изменённых runner modules проверен. До исправления канонизации два новых PLAN теста честно падали; после неё injection assertion дополнительно исправлен на фактический structured SQLite cause, затем оба теста прошли.

### Возобновление для проверки исправления

На момент read-only проверки старый EVAL `EVAL-20260914164431-d2acf1d8` имеет `recovery.unavailable: true`, `capture_error.code: recovery_capture_pending`. Нельзя считать его recovery snapshot подтверждённым по одному наличию recovery id в runtime. Сохранён sealed boundary после PLAN с `stage_entry: plan-review`; это более раннее состояние, до выполнения reviewers и их исправлений.

Обычный recovery сохраняет pinned engine identity. Подмена старого snapshot установленным новым CLI нарушает этот контракт, а `runnerRecover` дополнительно сверяет engine с checkpoint. Поэтому обычный resume старого EVAL не является проверкой нового engine fix.

Минимальное будущее решение для ускоренных проверок — derived RUN из существующего stage-entry/recovery snapshot в отдельном home/worktree, с записанной parent/snapshot/engine provenance и явной проверкой совместимости. Переиспользовать существующий capture/restore, не писать второй механизм snapshot. Публичного произвольного `RUN fork --from-stage` с заменой engine сейчас нет; его реализация не входила в это ревью.

Git commit недостаточен для восстановления: нужны staged/unstaged/untracked файлы, RUN artifacts, DB/Works и принятые receipts. Внешние эффекты (БД приложения, деплой, публикация) отдельно требуют изолированной среды/fixture reset. Исходный checkout не откатывать. Если snapshot нужного состояния не существует, стартовать от ближайшей сохранённой границы и повторить следующие стадии, не имитировать восстановление.

Границы исследования: установлена конкретная цепочка падения и просмотрены её общие реализации, три stage guard caller, все caller валидатора PLAN, общий lifecycle/error и daemon journal, ZCode cancellation/close и EVAL cleanup budget. Это не утверждение об отсутствии всех дефектов во всех модулях или о квалификации всех шести адаптеров. Продуктовые замечания reviewers остаются предметом выполнения flow, не отдельными инфраструктурными задачами.

### Проверка fork/upgrade после исправлений

Реализованы `dd-flow run fork` и `dd-eval runner checkpoints|fork`. Они используют sealed
`stage_entry` snapshot и существующий verifier/restore, не копируют live DB/WAL и не переносят
provider session. У fork есть durable intent, lineage и immutable upgraded engine binding; retry
может удалить только собственные известные артефакты и останавливается на посторонних данных.

Fork-006 намеренно сохранён как доказательство ошибки реализации: нестандартный operation ID
`fork-launch` не принадлежал первой generation state-machine. Он остановился до
`dispatch_accepted`, то есть ZCode/model не вызывались. Исправление использует canonical
`<EVAL>:<execution>:launch`, что закреплено отдельной регрессией.

Fork-007 расположен в
`/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260914222400-plan-review-fork`;
его EVAL ID `EVAL-20260914202054-ae27fbd6`. Source SHA-256 остаётся
`ee561145bf9bfc42beeb2bd0df6c8febac672ddd6ff425fbb28f73ee3de441d4`.
Создана новая ZCode session `sess_c84e9574-34e1-4568-8181-152b306f7d62`; prompt принят
controller и operation сейчас наблюдается как активная. Terminal outcome в этот документ не
подменяется: его нужно получить из итогового EVAL report.
