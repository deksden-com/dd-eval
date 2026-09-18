# 039 — Проверенный вход CLI до выполнения операции

Дата: 2026-09-18. Статус: COMPLETE — P1–P8 закрыты статическим inventory, профильными регрессиями и итоговой квалификацией ниже. Live E2E остаётся отдельным этапом и в этот план не входит.

Область: все публичные маршруты `dd-flow` и `dd-eval`, внутренние вызовы тех же сервисов, все семь стадий flow, общие инструкции шести адаптеров. Основание: CP-116 и согласованное требование пользователя «все параметры проверить до любых действий». Продолжает [038](038-hook-cli-admission-and-cp110-repair-plan.md), не возвращает валидацию business CLI в hooks.

Текущая по-командная evidence-карта: [039-cli-coverage.md](039-cli-coverage.md).
Она пока неполна и не означает закрытия всех 208 leaf routes.

## 1. Результат и границы гарантии

Команда проходит `parse → prepare → execute → publish outcome`. Prepare проверяет весь определимый вход и применимость команды, ничего не выполняет. Execute потребляет подготовленные значения, а не повторно читает исходные файлы. Ошибка входа до execute возвращается с `effect=no_effect` и понятным способом исправления.

No-effect означает отсутствие продуктивных изменений: RUN/Work/Session binding, принятого результата, Git/worktree, home registry, запуска/остановки процессов и проверок, публикации, удаления данных. Допускаются минимальные записи наблюдения вызова, отказа и successor в существующем admission store и диагностический вывод. Эти записи не должны создавать пустой project/home или выполнять миграции ради неверной команды.

Не обещать невозможное: доступность файлов/сети/диска после prepare может измениться. После начала execute runtime failure не превращается в безопасный повтор. Для пакетных внешних операций нет обещания общей транзакции; нужно отразить выполненные элементы/эффект и использовать существующее recovery. Исправление аргументов не равно повтору упавшего gate, запуску E2E или ремонту инфраструктуры.

Не вводить новую очередь, daemon, универсальный workflow framework, глобальную транзакцию, новый fingerprint всех файлов, отдельную команду обязательного preflight или зависимость. Подготовка — обязательная часть обычного вызова. Не добавлять повторные quality/browser gates.

## 2. Подтверждённые находки и владельцы

Пути `src/...` ниже относятся к dd-flow-cli; `lib/...`, `bin/...` — к dd-eval. Это статическое исследование и трассировка сохранённого CP-116, не новый live PASS.

| ID | Найдено | Следствие / исправление |
| --- | --- | --- |
| F01 | `src/services/vnext-code-review.ts:readCodeReviewDecision/readJson`: raw read/parse | CP-116: решение в checkout, finish читает RUN home; ENOENT → unexpected/unknown → fatal. Общий reader входных артефактов |
| F02 | `src/services/vnext-code.ts:readVerification`, `vnext-protocolize.ts:readResult`: raw JSON; missing result отдельно not_found | Одинаковый ввод классифицируется по-разному. Нормализовать на границе входа, не глобальным catch ENOENT |
| F03 | `vnext-plan-review.ts:readJson`, `schema-validation.ts:readJson`, `run-cli.ts:readOptionalJsonFile` имеют разные broad catch | Ошибки внутренней схемы/хранилища могут выглядеть как исправимый пользовательский JSON. Разделить источник и причину |
| F04 | `run-cli.ts`: validation в dispatch, после createContext/admission; global singleton check не задаёт allowed options для всех маршрутов; отдельные `Number(...)`, presence flags | Требуется общий route-aware prepare; неизвестные опции, лишние позиции, флаг вместо значения, диапазоны и aliases не должны игнорироваться |
| F05 | `lifecycle-invocations.ts:awaitLifecycleInvocation` проверяет argv и переводит observed → executing до полного разбора входа сервисом | Подготовить payload до допуска business execute; атомарно переиспользовать settlement/successor, не ломать replay |
| F06 | `work-registry.ts:assertStageLifecycleOwner` claim-ит hook; `run-cli.ts` вызывает его до stage-specific input checks | Отделить read-only проверку применимости/identity от claim/binding; hook receipt остаётся observation |
| F07 | `vnext-specify.ts:finishVnextSpecifyStage` пишет candidate и удаляет supplied acceptedResult до submit/schema | Невалидный ввод уже меняет файлы. Разобрать/проверить in-memory до candidate/rename/remove; ошибочный вызов сохраняет вход |
| F08 | `vnext-specify.ts:submitVnextSpecify` validateSchema затем повторный read; `work-registry.ts` batch validators читают файл отдельно | Устранить check/use расхождение, передавать подготовленные bytes/value |
| F09 | `vnext-plan.ts:validateVnextPlanArtifacts` по умолчанию вызывает publish; prepare пишет временные файлы для schema; finish проверяет binding после публикации | Prepare действительно read-only: validateSchema(data), подготовленные проекции; публикация только после всех input/applicability checks |
| F10 | `run-cli.ts`: work finish raw file read; fanout/native observations raw JSON; runtime manifest JSON | Применить тот же контракт к worker/control входам, не только stage finish |
| F11 | `schema-validation.ts:validateSchema` уже принимает `data` и имеет Ajv + contract invariants | Переиспользовать; отделить input errors от schema registry errors. Не строить второй schema engine |
| F12 | `bin/dd-eval.mjs`: route allowlist есть, но boolean значения местами `=== "true"`; `lib/runner.mjs:readJson` объединяет все причины | Строгие typed options, отдельный input reader и reuse loadProfile/loadRunProfile/entry validators |
| F13 | `lib/runner.mjs:runnerFork` вызывает registerRunHome до чтения/проверки snapshot | Неверный checkpoint не должен регистрировать target. Передвинуть запись после полного prepare |
| F14 | `lib/eval-resume-worker.mjs:requestRunnerContinuation` после JSON.parse пишет registry/intent и запускает worker | Проверить полноценный manifest/request/profile scope до записи intent/spawn; worker перепроверяет актуальную authority, а не перекладывает ошибки аргументов на фон |
| F15 | `lib/storage.mjs:gcApply` проверяет и удаляет кандидатов последовательно | Неверный второй кандидат может обнаружиться после удаления первого. Подготовить весь список до первого удаления, затем recheck liveness под lock |
| F16 | `run-cli.ts:writeResponseFile` вызывается после dispatch | Проверить форму/место output заранее; поздняя ошибка публикации не должна выглядеть no_effect или повторять успешную операцию |
| F17 | `schema-validation.ts` возвращает invalid_json, но `lifecycle-invocations.ts:isRetryableLifecycleRejection` не включает его; not_found тоже не включён | Одного хорошего сообщения недостаточно: classification/settlement/controller должны согласованно читать явный prepare outcome, а не расширять глобальный allowlist на все not_found |

В CP-116 корректный абсолютный путь был в stage prompt; модель создала относительный файл в другом cwd. Исправление инструкции снижает риск, но устойчивость обеспечивает именно CLI. Не искать файл автоматически в соседнем checkout и не подменять указанный вход.

## 3. Устройство prepare без второго диспетчера

### 3.1 Route-aware parsing

В `run-cli.ts` выделить существующий разбор каждой ветки в подготовку её typed input. Общие primitives — в одном небольшом модуле CLI input; рядом с маршрутом определить позиции, allowed/repeatable options, aliases и конфликтующие источники. Маршрут и executor должны ссылаться на одно определение: не копировать большой switch в независимый validator. Отдельного публичного API-фреймворка не нужно.

Типизированный результат подготовки несёт command key, нормализованные параметры, подготовленные входные артефакты и необходимые read-only ссылки на контекст. Предпочесть конкретные типы сервисов generic bags/магическим кешам. Не передавать владение mutable prepared object модели; execute не переинтерпретирует argv. Прямые API-вызовы сервисов используют ту же prepare-функцию, а не обходят её; внешний callable wrapper готовит вход, внутренний executor принимает prepared.

Проверять: точную арность; unknown command/option; singleton и repeatable; отсутствие значения; пустое/whitespace значение там, где оно запрещено; enums; конечные числа, целые значения и диапазоны; явные boolean versus presence switches; взаимоисключающие аргументы, в том числе aliases; условия `--retry-check`/`--reason`; идентификаторы и scope без смешивания native/SES/ACP; допустимые ключи config/flags. Сохранять документированную совместимость syntax/aliases, выдавать ошибку вместо молчаливого игнорирования.

### 3.2 Входные файлы, JSON и stdin

- Разрешать относительный путь один раз относительно документированного base. Явно различать caller cwd, project root, checkout и RUN artifact home; не менять семантику всех relative paths молча.
- Открыть файл, проверить через fd, что это обычный читаемый файл, прочитать, закрыть. Для JSON разобрать и проверить схему/invariants. `existsSync/access` перед вторым read не являются гарантией. Не следовать FIFO/device и не зависать на directory input. Применить существующие ограничения path containment/symlinks, не запрещать все symlinks без основания.
- Возвращать `{source, value/bytes}`; schema validator получает `data`. Если исполнителю нужны bytes для копирования — использовать именно проверенные bytes. Для больших копируемых snapshot/tree — существующий механизм snapshot/import authority, не пытаться держать дерево в RAM.
- JSON inline/file/stdin проходит один валидатор. Stdin читать один раз; TTY/пустой ввод/допустимый размер проверять по контракту команды, не добавлять произвольный маленький лимит на большие отчёты. Streaming protocol hooks не буферизовать как business payload.
- JSON без самостоятельной JSON Schema проверяется существующим typed validator; для неохваченного публичного объекта определить минимальный точный shape. Не принимать `null`/array как object и не делать `as Type` вместо проверки. Registry/schema corruption — не ошибка пользовательского payload.
- Markdown/text intake, question, answer, reason проверять как текст по их правилам, не требовать JSON. Внешние скрипты/check commands не выполнять для «валидации»; их поведение относится к execute.
- Выходные пути: проверить тип, containment, overlap, overwrite policy и существующего родителя. Не создавать probe, каталог, output file или backup в prepare. Поздний отказ записи остаётся runtime/output failure с честным эффектом.
- Подготовить весь batch и все cross-references до первого изменения: duplicates, cycles, foreign project, неизвестные элементы, пары files/IDs. Не выдавать partial success как no_effect.

### 3.3 Порядок routing/admission/replay

1. Лёгкий parse/help/version без initialize DB. Router выполняет только необходимое read-only разрешение engine/scope. Схему frozen RUN определяет выбранный engine, не другая версия router.
2. Для managed ID сначала загрузить и проверить authority/matching command. Если есть retained terminal outcome — вернуть его без открытия payload/stdin, без новой hook delivery, без повторной schema validation.
3. Для новой попытки — чистая подготовка аргументов/данных и read-only applicability. Использовать существующие issued/observed states; не добавлять persisted preparing ради этой задачи.
4. Ошибку prepare атомарно сохранить вместе с единственным successor в существующем store, только если попытка ещё не executing/settled/unknown. Конкурентный claim побеждает право обещать no_effect. Replay старого ID возвращает тот же отказ/successor, не создаёт цепочку новых IDs.
5. Успешная подготовка → native receipt/authority admission → CAS observed→executing → execute. До мутации повторить только mutable authority/generation/ownership invariants атомарно. Таймаут/отказ native hook остаётся infrastructure failure; input correction его не маскирует.
6. Точное место ожидания receipt зависит от adapter delivery: сохранить работающий sync/async transport. Prepare не должен claim-ить business Work, перепривязывать Session или запускать worker. После ожидания не читать payload заново.
7. Executing с неизвестным результатом не повторять. Сохранённый successful result при output failure возвращать через существующий replay; не запускать операцию заново ради нового response-file.

Нужна regression для отсутствующего home: неверная unmanaged команда не создаёт DB; malformed unknown managed ID не создаёт successor/authority. Read-only opening существующей DB для scope не равно business mutation.

## 4. Ошибки и контракт с вызывающим агентом

Сохранить внешний envelope `ok:false/error`, exit 2 для ошибок ввода. Добавить/унифицировать details: `phase:prepare`, `effect:no_effect`, `recoverable`, `parameter`, `file/source`, schema/path/expected и безопасное объяснение. Не выводить содержимое секретов, токены и полный payload. Не превращать всякий `validation` в no_effect: тот же код сегодня бывает после действий.

Отсутствующий явно поданный файл, directory вместо файла, malformed JSON, schema mismatch — исправимый вход. Нечитаемый пользовательский файл возвращает точную причину и no_effect, но агент не получает инструкцию chmod/обходить доступ; повтор только после допустимого исправления. Повреждение принятых внутренних артефактов, схемы, DB, native proof — отдельная неисправность, без автоматического retry. Решение определяется происхождением данных и фазой, не одним errno.

Managed rejection выдаёт exact successor command с тем же scope и корректным quoting. Если содержимое неизвестно — не изобретать его: «исправь файл X и выполни retry_command». Для stdin указать необходимость повторно передать исправленный ввод; не выдавать bare command, который зависнет на EOF. Для unmanaged CLI ID не нужны: можно повторить исправленную команду. `recoverable` означает возможность исправления, не фоновый бесконечный retry.

Классификацию prepare назначает только код доверенной границы до execute, не поля входного JSON. Не разрешать payload заявлять себе no_effect/recoverable. Коды invalid_json/not_found без контекста источника не включать глобально в retryable: missing accepted report и missing supplied decision — разные случаи. Успешная запись invocation outcome обязательна прежде выдачи runnable successor; сбой её хранения сохраняет инфраструктурный характер. Машинный progress не должен утверждать done для rejected/failed operation.

Во флоу при prepare rejection сохранить текущую Session/Work и отдать ошибку агенту, не завершать EVAL. Агент исправляет вход и использует successor в той же Session. Повторяемая ошибка без прогресса ограничена существующим turn/run budget, не новым retry daemon. Gate failure имеет собственный repair contract, не объявляется ошибкой аргумента. Unknown/committed и hook infrastructure остаются fatal/recovery по текущему контракту.

## 5. Покрытие всех стадий

| Стадия | Подготовить до start/finish | Что запрещено до готовности |
| --- | --- | --- |
| SPECIFY | intake file/text, routing/profile, outcome, result schema/obligations, pause question/resume answer и refs | создать RUN/Work из invalid intake; candidate write/delete до schema; bind/accept result |
| PROTOCOLIZE | result schema, список протоколов, paths/relationships и workspace policy; внутренний accepted SPECIFY отдельно | materialize протоколы, mutate index, создать checkout до проверки всего результата |
| PLAN | все plan.json, aspect maps и batch вместе, schema/cross-refs/dependencies; подготовленные производные проекции | publishBatch/temp schema files из validation; завершить Work до проверки binding |
| PLAN-REVIEW | decision schema, finding refs/dispositions, correction shape, root/child states | считать повреждение runtime context исправимым пользовательским вводом; publish decision раньше проверки |
| CODE | verification schema, check/evidence refs, retry reason/receipt, Work results | запускать gates до полного input validation; читать verification повторно; объявлять failed gate no_effect |
| CODE-REVIEW | decision schema, canonical finding/check refs, duplicate links, accepted-decision rules | CP-116 fatal на missing input; freeze decision/создать repair до всех input checks; требовать заново исходный файл при valid retained decision |
| MERGE | request/work/claim, supplied reports/repair refs/target/bundle, retry params; target policy | lock/worktree/process/check/Git mutation из prepare; принимать старую authority после ожидания |

Для всех стадий: start, finish, pause/resume, block/unblock, repair, generated next commands; worker start/finish/fail; legacy stage finish и mb-upgrade тоже включены. HITL остаётся только по существующей политике, ошибка CLI не добавляет HITL. Внешние accepted reports и schema registry не валидировать как редактируемый моделью input.

## 6. Полная карта CLI-маршрутов для миграции

Источник инвентаря dd-flow — верхний `dispatch` и все `dispatch*` в `src/cli/run-cli.ts`, help/classification, внутренний early ingress в `src/cli.ts`. Для каждой leaf-команды реализация обязана иметь coverage row: args validator, payload validator/none, context requirements, first effect, tests. Ни одна семья ниже не считается закрытой по одному тесту CODE-REVIEW.

| Семейства dd-flow | Особое внимание |
| --- | --- |
| status/version/help; project register/status/summary/resolve/archive/migrate-ids/config; protocol register/status/branch-status/ready/blockers/implement/ready-for-merge/transition/sync-from-run/cancel; transition alias | known route/options до initialize, идентичность project/protocol, alias conflicts |
| run start/prepare-vnext-specify/status/list/timeline/config/vars/flags/revise/attach-stage/complete-stage/complete/override; capacity/context/answer | JSON overrides/routing, values enums, output/render side effects, answer contract |
| run drive/control/serve/stop; recovery inspect/begin/seal/capture/resume/accept; snapshot bootstrap/create/restore; fork | inline JSON, manifests/tree/paths, authority, prepare до registry/copy/spawn, terminal replay |
| stage start/finish/pause/resume/block/unblock/fanout/native; plan status/reviews/item; plan-review dispatch; prompt render | все stage-specific inputs, native observations, stdout vs file render |
| work status/add-batch/ls/show/repair/deps/delete/launch/start/finish/fail/cancel/retry | typed status/limit; batch all-before-write; Work result schema выбран по Work; stdin |
| session register/status/stop/stop-worker/usage; runtime scope/check-admission/start/stop/register/confirm/heartbeat/admission/release-turn/finish/status/reconcile | native IDs не SES; manifest JSON; не spawn/stop до всех аргументов; authority отдельно |
| lane status/waiters/waiter/workspace/lock; merge-queue status/next/claim/wait-next/complete/fail/note/cancel; merge serve/server/apply/repair/request/route/bundle/claim/complete/fail/one-shot; merge-worker | timeouts/lease numbers, identifiers, recheck под lock; wait не начинает продуктивную работу до prepare |
| engine install/list/info/resolve/doctor/bind-run; canon register/status/resolve; migration impact/plan/report/verify/apply; storage migrate-writer | routing/version/source/output, schema manifest; explicit install/migrate action после validation, не hidden prepare |
| cleanup scan/apply; worktree plan/create/status/bootstrap/close; codex home plan/init/status/print-env/remove; hooks print/status/install/remove | все targets/plans до первого удаления/изменения; preserve safety guards |
| stat usage/run; id next; integration cmux status; dashboard data/render/render-global/open/refresh/refresh-global; schema validate; memory permissions preflight | render/open/probe могут иметь эффекты; id next — readonly preview без reservation; output paths и schemas |
| codex/zcode/grok/opencode/droid/agy hook/event/usage; zcode invocation prepare | native envelope validators до собственной записи; никаких business argv/file validators в hook. Сохранить minimal early ingress |

dd-eval — покрыть каждую ветку существующей `validateCommand` в `bin/dd-eval.mjs`, в том числе four-token canonical actions:

- homes list/add/remove; storage ls/status; gc plan/apply;
- harness capacity check/compatibility qualify; runner fixtures validate/eval preflight;
- runner canonical build/status/resume/engine capture/boundary accept/qualify/qualification recover/accept;
- runner eval run/judge; status/resume/cleanup/recover/recovery inspect/checkpoints/fork/reconcile/cancel;
- runner control status/pause/stop/reconcile/resume.

В dd-eval reuse существующих validators profiles/case/entry-pack и `validateControlResumeInput`. До detached worker проверить всю request shape, manifest/profile/checkpoint refs и output. Worker принимает подготовленный контракт через существующий intent, либо существующие immutable snapshots; не заводить новую систему хранения. Мutable runtime state/ownership повторно проверяются worker-ом. Control stop не блокировать валидацией нерелевантного product payload/availability модели: проверяются только его собственные входы и authority.

## 7. Инструкции, prompts и потребители

Применить общий текст через существующий renderer `src/harness-runtime/lib/delegation-instructions.mjs`; проверить Droid local prompt и dd-eval `lib/delegation-instructions.mjs`, чтобы не осталось противоречащих копий. Provider-specific native tools остаются в адаптерах. Hook только фиксирует native observation, не читает input CLI и не подсказывает бизнес-retry.

В `vnext-*.ts`, `work-registry.ts`, `stage-pause.ts`, controller follow-up, legacy stage prompts и `.memory-bank/dd-flow/vnext/*` согласовать:

- product workspace = каталог кода; artifact path = абсолютное место результата, не относительный путь от cwd;
- создать результат именно по `result_path/decision_file/verification_file` из packet, затем выполнить выданную команду;
- prepare rejection → исправить названный вход и повторить разрешённую команду в той же Session; не ask user только ради CLI syntax, не начинать successor stage;
- native hook/transport/storage failure → сообщить и остановиться, не вызывать handler вручную;
- check/gate repair и stage handoff — отдельные ответы; не повторять команду с unknown effect;
- не требовать обязательный `jq/schema validate` перед каждым finish: сама CLI делает необходимую валидацию. Примеры путей и JSON проходят те же validators в тестах.

Обновить `runbooks/execute-eval.md`, `runbooks/harness-backends.md`, flow operations/system docs. Старые cp readiness и spec038 — история, не переписывать их в фиктивный PASS039. Документировать новые error details, retry semantics, zero business effects и replay-before-input.

## 8. Порядок реализации и критерии закрытия

### P1 — Контракт и inventory

Создать параметризованный inventory тестов всех leaf routes, включая aliases, hidden/internal routes и help. Для каждой ветки указать first effect и input sources. Сопоставить help/dispatcher/classifier, удалить молчаливые ignored options. Не менять command names/semantics без совместимого alias. Закрытие: нет маршрутов без явного prepare или обоснованного no-payload/read-only случая.

### P2 — Общие primitives и error contract

Reader text/JSON + reuse schema validator(data); разделение input/internal schema ошибок; strict args primitives; safe diagnostics/output destination validation. Табличные unit tests. Не менять hook responsibilities. Закрытие: malformed/missing/wrong shape имеют одинаковую семантику для file/inline/stdin.

### P3 — Lifecycle admission и service boundary

Prepare до executing/claim/binding; retained outcome раньше чтения файла; атомарный rejection+successor. Сохранить async receipt и strict hook failure. Выполнить unmanaged/managed/direct service paths. Проверить output failure после committed result. Закрытие: failing prepare не вызывает executor, не меняет business state; concurrent duplicate не исполняется дважды.

### P4 — Все стадии и Work

Сначала CODE-REVIEW регрессия CP-116, затем CODE/PROTOCOLIZE, SPECIFY, PLAN/PLAN-REVIEW, MERGE; work batch/results/start/repair и pause/resume. SPECIFY больше не удаляет supplied file на invalid input; PLAN validation не публикует. Read-only подготовка и atomic mutable rechecks отделены. Закрытие: вся матрица раздела 5.

### P5 — Остальные dd-flow команды

Пройти все строки раздела 6; приоритет destructive/batch, run snapshot/fork, runtime control, затем configuration/diagnostics/legacy. Не считать «все CLI» завершённым после P4. Закрытие: все coverage rows зелёные, direct calls используют ту же подготовку, нет duplicated validators с разными правилами.

### P6 — dd-eval

Strict boolean/numeric validation; input/internal readers; fork/profile/manifest prepare до registerRunHome; continuation до intent/spawn; весь gc plan до первого удаления. Для GC сохранить liveness/ownership recheck под lock и честный partial failure после начала удаления. Не запускать cleanup/GC/E2E для теста на пользовательских данных.

### P7 — Flow/control integration и docs

Общие инструкции и stage paths, controller не прекращает ход на input rejection; dd-eval не считает исправленный отказ failure исполнения. Fatal infrastructure не маскируется. Обновить docs/help. Проверить generated commands round-trip через parser/prepare, включая quoting/пробелы в пути и stdin.

### P8 — Проверка и handoff

Один профильный интеграционный набор после объединения; build/typecheck/lint изменённых частей. Полный release gate — только один раз для выбранного release artifact по ранбуку, не на каждой правке. Новую live квалификацию запускать отдельно по разрешению; CP-116 не изменять. В deliverable перечислить закрытые coverage rows, результаты тестов, оставшиеся ограничения и точный engine artifact, не обещать live PASS по unit tests.

## 9. Регрессионная матрица

1. Каждая leaf-команда: unknown option, лишняя/недостающая позиция, flag вместо value, duplicate/alias conflict; invalid call не открывает writable initialize/store и не вызывает executor.
2. Каждый input role: missing/unreadable/directory/symlink-policy, пустой/invalid JSON, null/array/wrong schema, неизвестный ref; text отдельно. EACCES тестировать injected errno, не полагаться на chmod под привилегированным runner.
3. CP-116: decision существует только в checkout → expected absolute path в no-effect error → создать правильный файл → same-session successor → ровно один repair Work; original reviewers не перезапускаются.
4. Один и тот же payload через file/stdin/inline даёт одинаковый schema outcome. Подменить/удалить файл после prepare: execute использует проверенное значение. Replay terminal command не требует файла/EOF.
5. SPECIFY invalid result сохраняет исходный файл, прежние артефакты и business rows. PLAN invalid последнего protocol/map не публикует предыдущие проекции. Batch invalid второго элемента не создаёт первый.
6. Snapshot/fork invalid checkpoint/profile/output overlap: no home registration, mkdir/copy/engine install/spawn. dd-eval invalid bool не преобразуется молча в false.
7. GC invalid последнего target: ни одного rm; valid prepare, затем active owner появляется: recheck запрещает удаление. После начавшегося batch failure указаны completed targets, no_effect не заявлен.
8. Managed duplicates/concurrency: один successor, COMMIT failure не публикует runnable retry; receipt пришёл поздно — old ID не воскресает; executing/unknown не получает successor. Scope/ownership/native receipt errors не считаются typo.
9. Hook fail остаётся infrastructure fatal; исправленный input не останавливает controller/agent turn и не создаёт новую Session. Одинаковый контракт для шести адаптеров с synthetic receipts; live smoke всех шести не нужен для чисто общего изменения.
10. Runtime I/O/check failure после execute и output publication failure после success не имеют ложного no_effect. Schema registry corruption не превращается в просьбу модели исправить JSON результата.
11. Help/version/read-only routes не создают home; invalid stop args не останавливают процесс, valid stop не зависит от продуктовых файлов. Generated prompts/commands валидны и используют абсолютный artifact path.

Для no-effect сравнивать целевые business tables, directory/Git state и spies внешних эффектов до/после; разрешённый admission/diagnostic delta проверять отдельно. Тесты не требуют нового production checksum-контроля и не запускают full product quality/browser checks.

## 10. Проверенные сценарии исполнения нового контракта

Это результаты проектной трассировки, не утверждение о выполнении нового кода.

- **CP-116:** authority известна → terminal receipt отсутствует → prepare открывает точный decision path → ENOENT input rejection → атомарный successor → controller оставляет ход → агент исправляет файл → новая подготовка schema/refs → claim/execute → freeze decision/repair ровно один раз.
- **Payload испорчен:** parse JSON/schema прекращает prepare; ни stage result, ни child Work, ни check ещё не создавались. Ошибка содержит file + JSON path, не сырой секретный payload.
- **Payload изменён после чтения:** command использует проверенные bytes/value; связанные state refs перепроверяет под существующим lock. Нет повторного read разных байтов.
- **Повтор после успеха:** matched retained outcome возвращается до input read; удалённый candidate не мешает replay. Новый произвольный ID не получает authority.
- **Native delivery сломана:** prepared payload не заменяет receipt; admission отказывает infrastructure failure; controller останавливает своё дерево, не предлагает исправить JSON.
- **Две одинаковые команды одновременно:** обе могут read-only подготовиться; лишь одна получает execute CAS. Вторая читает retained outcome либо pending, не вызывает executor и не получает ложный безопасный successor.
- **PLAN с несколькими протоколами:** все входы/schema/cross-refs подготовлены → только затем projections publish и settlement. Ошибка последнего не меняет первый.
- **Новый eval/fork:** profiles/manifest/checkpoint/output проверены до registry/intent; только valid request сохраняется и запускает worker. Runtime resource failure после этого честно является failure начавшейся операции.
- **GC:** все targets формы/пути/ownership подготовлены → под lock проверяется живое состояние каждого → delete. Нельзя обещать atomic-all deletion при внешнем сбое; partial outcome остаётся явным.

## 11. Что сознательно не включено

Не исправлять продуктовые findings эвала руками; не менять frozen CP-116 и канонический ответ; не добавлять HITL; не ослаблять ownership, схемы или запрет retry unknown effect. Полный формальный аудит каждой функции всей кодовой базы не заявляется: исследованы CLI routes, входные readers и критические effect boundaries; полнота leaf migration должна быть доказана inventory/regression в P1–P8. Старые накопленные изменения сохраняются, не смешиваются с утверждением, что 039 уже реализован.

## 12. Definition of done

- Все строки inventory dd-flow/dd-eval закрыты, все семь стадий и прямые service callers используют общий контракт; незакрытая семья запрещает заявление «план выполнен полностью».
- Исправимые отказы до execute доказанно не дают бизнес-эффектов; expected inputs не читаются повторно; retained replay и все native transports сохранены.
- Инфраструктурные ошибки, ошибки после начала работы и concurrent authority loss не получили ложного no_effect/retry.
- Инструкции, help, runbooks и schema examples согласованы с реализацией; конкретные тестовые команды/результаты записаны в implementation evidence.
- Не требуется публикация, коммит/пуш или новый E2E без отдельного запроса. Готовность к живому тесту и фактический live PASS — разные результаты.

## 13. Implementation evidence — 2026-09-18

### Дополнение: engine bind preparation

- `engine bind-run` использует общий `prepareRunEngineBind` в CLI и service.
  Reason проверяется до engine probe. Manifest/identity/entrypoint проверяются
  readonly; dependency healthcheck не исполняется из prepare, его покрывает
  RUN-status probe при execute. Binding повторно проверяется перед probe;
  неизменность binding защищена также writer-ом.
- Retained identical binding возвращается без нового probe. Invalid manifest,
  damaged binding и immutable conflict сохраняют infrastructure/fatal semantics;
  несуществующий пользовательский RUN отклоняется в prepare без записи.
- Engine family source audit: install принимает только заранее разобранный
  force switch (first effect: install lock); list/info читают store/manifest;
  resolve выбирает engine по compatibility; doctor выполняет диагностические
  healthcheck subprocesses как собственное действие команды. Bind — единственная
  команда семьи с пользовательским reason и записью RUN binding.
- Regression в `run-cli.test.ts` проверяет отсутствие native вызовов в prepare,
  один RUN-status probe в execute и отсутствие probe на replay. Три профильных
  integration tests PASS: filesystem-only RUN rejection, prepare/execute/replay,
  сохранение bound same-version snapshot при force install. Typecheck/lint/build
  PASS. Full P1/P5/P6 coverage этим engine-набором не доказано.

### Дополнение: Worktree bootstrap/close

- Bootstrap/close проходят readonly applicability preparation до CLI writer.
  Bootstrap проверяет active record и readable regular project bootstrap files;
  close проверяет mode, active record и разрешённую стадию для remove. Проверка
  актуального active record сохраняется при исполнении.
- Дублирующий bootstrap command loop удалён: PRT-backed CLI использует тот же
  managed executor, что PROTOCOLIZE. Фактический command failure сохраняет
  bootstrap_failed и durable failure state; project configuration/Worktrunk
  infrastructure failures не переименованы в аргументный recoverable отказ.
- Проверено: existing full worktree lifecycle (create/bootstrap/close) и
  feature-route PROTOCOLIZE→PLAN: 2 PASS. Lifecycle fixture теперь имеет реальный
  Git base и физический target, command assertion проверяет prepared commit SHA.
  Отдельная проверка directory вместо wt.toml доказывает отсутствие tool calls.
  Typecheck/lint/build PASS. Полный P1/P5/P6 audit остаётся открыт.

### Дополнение: Worktree create

- Общий `prepareManagedWorktree` проверяет Git branch/base и destination до
  установки Worktrunk и `switch --create`. Используются native Git validators;
  base разрешается в commit SHA, этот SHA потребляется executor и записывается
  в worktree record. Ветка должна быть буквальным новым именем, не Git shorthand.
- CLI `worktree create` вызывает `prepareWorktreeCreate` до writer admission;
  direct service и PROTOCOLIZE используют тот же managed prepare. Наличие
  активного worktree повторно проверяется при исполнении. Paths канонизируются;
  checkout внутри исходного проекта, непустой target и file-parent отвергаются.
- Проверено: direct + CLI no-effect regression PASS; SPECIFY→PROTOCOLIZE и
  fresh-session workspace-policy 2 PASS; отдельный feature-worktree→PLAN
  integration PASS. Typecheck/lint/build PASS; живой E2E не запускался.
- Bootstrap/close дополнены следующей итерацией выше; полный P5/P6 inventory
  этим worktree-набором не закрывается.

### Дополнение: preflight и task-input batch

- `evalPreflight` читает baseline policy, blueprint, все task-input bytes и
  selected Subject/Judge profiles до mkdir/checkpoint materialization/runtime
  install. Doctor получает подготовленный profile, без повторного чтения файла.
- Общий `prepareTaskInput` проверяет весь batch до изменения Git exclude или
  первой записи. `materializeTaskInput` потребляет подготовленные bytes;
  повторный `cp(source)` удалён. Сохраняются source permissions; публикация через
  временный файл и rename не разыменовывает symlink в конечном имени.
- Tests: eval/task-input 69 PASS; canonical/control/task-input 32 PASS,
  5 live SKIP. Regression: missing/mismatched второй input не копирует первый
  и не меняет exclude; после prepare оба source удалены, публикация успешна.
  Public preflight с невалидным baseline не создаёт conformance directory.
- Найденный здесь поздний worktree create input validation закрыт дополнением
  выше. Остальной inventory и focused execution entry preparation остаются открытыми.

### Дополнение: qualification batch и initial EVAL preparation

- `canonicalQualify` больше не пишет entry-pack до проверки subject profile,
  capacity, HITL fixtures, stage blueprints и предыдущих qualification cells.
  Общий `prepareEvalInputs` используется также `executeEval`: входные profile,
  execution descriptors, contexts и pack читаются до registerRunHome/mkdir/engine
  provisioning. Prepared pack/blueprints передаются очереди без нового чтения.
  Focused-only очередь не требует несвязанного E2E blueprint.
- `canonicalQualificationRecover` проверяет весь список source executions
  (unknown/duplicate/invalid) и готовит все cell payloads до записи. Retained
  coverage читается до первой записи; повреждённый старый receipt не оставляет
  частичный recovery. Runtime I/O во время execute остаётся честной ошибкой,
  не превращается в input/no_effect.
- Initial EVAL и continuation используют общий validator execution descriptors;
  direct execute также использует существующие profile validators. Mutable
  operator control по-прежнему проверяется под lifecycle lock перед публикацией.
- Проверено: eval/canonical/control 99 PASS, 5 live integration SKIP; после
  дополнительных регрессий canonical/control/JSON 32 PASS, 5 live SKIP.
  No-output regression покрывает missing context, invalid concurrency и unsafe
  execution id. Canonical regression покрывает missing profile/capacity, invalid
  last result, успешный recovery и corrupt retained receipt до первой записи.
- Открыто: дальнейший P5/P6 inventory и оставшиеся prepare пути, в частности
  preflight baseline/judge inputs и чтение focused entry на запуске execution.
  Это не отметка полного выполнения плана и не live E2E qualification.

### Дополнение: controller, canonical publication и GC

- Controller launch/context/answer вынесены в readonly prepare; execute использует
  подготовленные bytes. Launch/context возвращают retained replay до чтения
  удалённого source. Mutable ownership/generation проверяются при записи.
  Answer сохраняет проверку конфликтующих bytes; replay этого пути ещё требует
  отдельного решения без ослабления request-id semantics.
- Stage-context проверяет реальные типы вложенных полей до публикации. Recovery
  interruption/settlement JSON также проверяется до writer admission.
- CLI error progress больше не содержит ложного `done`; добавляется `failed`.
  Built-CLI тест доказывает rejection launch без каталога, записи controller и
  вызова adapter. Recovery может наблюдать unknown create, но не повторять его.
- Canonical boundary/entry review читается одним descriptor как regular file;
  hash вычисляется по прочитанным bytes, а не повторным открытием пути. Promotion
  подготавливает все entries/reviews до первой записи и использует их без reread;
  изменение ранее принятого review отклоняется до публикации.
- GC имеет общий direct-service prepare полного плана. Ошибки supplied plan
  получают usage/exit 2 и prepare/no_effect/recoverable. Повреждения retained
  state и ownership failures не переклассифицируются; mutable liveness guard
  под lock и effect=unknown при ошибке удаления сохранены.
- Проверено: targeted controller launch PASS; controller context/answer 6 PASS;
  stage-context/admission 79 PASS; canonical/storage/JSON 4 PASS. Canonical тест
  удаляет review между чтением и записью и проверяет правильный hash; GC тест
  удаляет source после prepare, а invalid last candidate не удаляет первый RUN.
  Итоговый профильный набор: dd-flow controller/stage-context/admission 115 PASS;
  dd-eval eval/canonical/storage/JSON 72 PASS. Typecheck/lint/build dd-flow PASS.
  Ни live E2E, ни пользовательский GC не запускались.
- Это закрывает перечисленные пути, не весь P5/P6: полный payload/first-effect
  inventory 208 команд, остальные direct/admin/runtime команды и canonical
  qualification остаются предметом завершающего аудита. План IN_PROGRESS.

### Дополнение: restore, scope control и интеграционная проверка

- RUN snapshot restore и bootstrap restore используют readonly prepare до
  writable context/очистки target. Проверяются source payload (включая Git
  bundle/index), взаимное расположение targets, recovery/stage-entry условия,
  execution routing и профили. Execute получает подготовленные значения;
  повторяются только проверки изменяемых целей. CLI и direct service используют
  один путь. Snapshot/admission: 73 PASS.
- Scope control больше не открывает manifest повторно после CLI prepare:
  worker/service получают подготовленную декларацию. Чтение через общий
  regular-file reader; corrupt retained JSON остаётся fatal. Проверены удаление
  файла после prepare, неизменность принятого списка execution IDs и отсутствие
  resource registry при ошибке входа. Scope/admission: 79 PASS.
- Общая граница CLI prepare теперь нормализует исправимые ошибки и для вызовов
  без invocation ID. Интеграция двух стадий с неправильной и затем исправленной
  командой подтверждает `no_effect`, ту же Session и отсутствие recovery: PASS.
- Recovery fixture переведена с прямого business accept на native hook + CLI;
  production hook-проверка не ослаблялась. Recovery/admission: 32 PASS.
- Полный dd-eval прогон обнаружил различие direct/detached terminal cleanup:
  detached путь требовал актуальные productive inputs. Решение вынесено в общий
  prepare: terminal journal не требует prerequisites нового запуска. Fork-тест
  теперь ждёт фактического stop, а не промежуточного awaiting_provider, и проверяет
  финализацию без redispatch. Fork/recovery/continuation: 48 PASS после исправления.
- Replay scope control читает принятый receipt до исходного manifest; удаление
  исходного файла не мешает повтору, смена mode с тем же request ID конфликтует.
  Повторный scope/admission набор: 69 PASS (пересекается с 79 выше).
- `prompt render`: общий prepare читает task/profile/static inputs и проверяет
  ссылки до регистрации Job, привязки canonical plan и создания artifacts.
  Binding проверяется readonly, execute использует принятый canonical plan.
  Регрессия показывает неизменность jobs/bindings при missing input и исполнение
  после удаления уже прочитанного static input: PASS.
- SPECIFY start: общий service prepare читает intake/template/execution policy,
  проверяет непустой intake/slug и существующий Stage до регистрации проекта/RUN.
  CLI читает runner task_input до claim и передаёт те же bytes. Direct malformed
  input не регистрирует проект/RUN. SPECIFY/admission: 60 PASS; stage-context: 2 PASS.
- Нестабильная capture-failure fixture удаляла свой home до регистрации detached
  cleanup owner. Теперь ждёт его admission, затем использует прежнюю остановку
  процессов. Проверка writer fence PASS; production recovery contract не менялся.
- Regex-тест Codex fallback заменён проверкой поведения: старый final message
  должен быть удалён до `turn/start`, а результат относится к новому Turn.
  Все 26 Codex adapter contracts PASS.
- Полный dd-flow набор запущен один раз; найденные несовпадения фикстур исправляются
  с отдельными целевыми перепроверками. Полного PASS пока нет; P1–P8/DoD не закрыты.
- Дополнительный незакрытый P4 путь, обнаруженный при последовательном аудите:
  `work repair add` пока читает stdin в dispatch; semantic `verification-file`
  попадает в packet как ссылка без общей подготовки schema/bytes. Сервис
  `addVnextCodeRepair` создаёт временный JSON до `addWorkBatch` validation.
  Закрыто следующим дополнением: общий prepare repair (check/review/semantic),
  batch из значения в памяти, reuse результата в CLI/direct callers.

### Дополнение: repair, legacy finish и регрессии полного набора

- `work repair add` готовит stdin, выбор источника, origin/check/finding refs
  и semantic verification до writer/admission. CLI и direct callers используют
  общий `prepareVnextCodeRepair`; review wrapper готовит тот же контракт.
  `prepareWorkBatch` принимает файл или значение: временный `.repair-*.json`
  удалён. Исполнение использует подготовленный packet и проверяет mutable parent
  под существующей транзакцией. Retained review-cycle replay остаётся до чтения
  нового payload. Неверные repair inputs не создают home, Work или artifacts.
- Найдена и исправлена путаница identity в legacy `startStage`: внутренний SES ID
  передавался как публичный native session ID. Теперь передаётся hookEventId;
  `registerFlowSession` извлекает native/storage identity из trusted receipt.
  Остальные callers проверены; глобальная проверка конфликтов не ослаблена.
- Legacy `stage finish` тоже использует pure `prepareStageFinish`: semantic JSON,
  schema/outcome и PLAN/aspect-map проверяются до receipt/binding/lint/report.
  Execute потребляет сохранённые bytes, receipt содержит именно принятый input.
  Report schema проверяется в памяти до публикации JSON. Невалидный direct input
  сохраняется без finish receipt; CLI diagnostic rejection остаётся в admission.
- Regression подтверждает исполнение legacy finish после удаления входного файла
  между prepare и execute. Runtime-cutover/admission/repair: **91 PASS**;
  PLAN→CODE/review/repair integrations: **22 PASS**. Build/typecheck/lint PASS
  на этой границе (следующие изменения требуют собственной проверки).
- Однократный полный dd-flow прогон: 1275 PASS, 33 FAIL (10 файлов). Он шёл
  одновременно с доработками, поэтому не является release-artifact gate.
  Разобранные ошибки проверяются профильными наборами, не новым полным прогоном.
  Dispatch fixtures external/merge моделируют native binding stub transport;
  реальная ownership-проверка сохраняется и покрыта lifecycle-invocations.
  External + lifecycle **79 PASS**, merge-server **10 PASS**. PLAN schema fault
  injection теперь повреждает выбранную RUN-bound схему, а не неиспользуемую
  проектную копию. Проверки не заменяют оставшийся аудит P1/P5/P6.

### Уточнение после ревью

Дополнение следующей итерации P4/P5/P6:

- `migration apply/verify`: общий regular-file JSON reader, подготовка отчёта до
  writable context; apply потребляет prepared contract, а актуальная активность
  проверяется на prepare и под write transaction. Неверный файл/JSON/shape не
  создаёт home. Пять существующих migration/upgrade интеграций PASS.
- `codex home init`: TOML разбирается до mkdir/symlinks/config write; prepared
  config используется без повторного чтения. Совпадение source и target
  (включая canonical filesystem identity) отвергается. Diagnostics TOML
  сообщают file/line/column без фрагмента потенциально секретного конфига.
  Direct regression с удалённым source config и существующая CLI integration PASS.
- `stage finish`: stage-specific payload options проверяются в выбранной ветке
  flow. Несвязанные decision/verification/result/retry/request параметры больше
  не игнорируются. Проверка парности retry-check/reason симметрична. Сохранены
  поддерживаемые aliases. Admission/home набор: 62 PASS; выбранные интеграции
  CODE/review и Codex home: 3 PASS (остальные тесты фильтром не запускались).
- `protocol transition` и alias `transition`: один prepare для JSON shape,
  типов изменяемых полей, stage/force/reason и текущего protocol state.
  Payload читается один раз; перед записью повторяется только mutable transition
  applicability. Direct/CLI tests: 64 PASS вместе с admission, включая source
  deletion после prepare, отсутствие записей при invalid payload и no-home
  отказ для обоих aliases.
- dd-eval общий JSON reader теперь использует один nonblocking fd и проверяет
  regular file до read. FIFO не ждёт writer; filesystem errors сохраняют errno
  вместо ложного invalid JSON. Reader используется и для retained state, поэтому
  не назначает глобально no_effect/recoverable. Eval/storage/input: 71 PASS.
- JSON/TOML diagnostics не включают исходный payload из parser error message;
  regression с фиктивным секретом покрывает оба JSON reader.

Не закрыто этим дополнением: полная first-effect/payload/direct-service карта
208 команд, оставшиеся административные lifecycle/worktree/engine пути и
command-specific prepare/outcome для остальных dd-eval canonical/admin команд.
Найденные здесь canonical review rereads, qualification recovery batch и GC
structural error envelope закрыты последующими дополнениями выше. Остальные
coverage rows и command-specific errors не считаются закрытыми автоматически.
Полный DoD остаётся открытым.

Предыдущая отметка IMPLEMENTED была преждевременной. Нижеприведённое описание
первой реализации не является подтверждением Definition of done.

Исправлено при ревью: неблокирующее открытие caller file с проверкой fd;
отдельные fatal ошибки чтения внутренней схемы; сохранение исходных diagnostics
в retained prepare rejection; null batch; проверка Work result в памяти до
claim; публикация PLAN после проверки Work/Session; сохранение frozen review
decision при prepared input; автоматический decision для review-off; запрет
публиковать ответ в заведомо невалидное место; unmanaged prepare до writable
context. Устранён ложный session_parent_conflict при reuse той же Session.

dd-eval: выбранный engine проверяется до destructive fork retry и регистрации;
GC проверяет весь набор целей до первого удаления, затем повторно ownership
под lock; partial deletion failure содержит completed targets и unknown effect;
control resume проверяет source и runtime identities до регистрации home.
Обычный productive continuation также проверяет manifest shape, уникальность
execution IDs и сохранённые run/harness profiles общими валидаторами до
registry/intent/spawn; cleanup не блокируется нерелевантным product profile.
Native observations проходят один общий валидатор в CLI и обоих service paths.
`session register` теперь готовит ровно один payload source до writable context
и передаёт разобранное значение сервису без повторного чтения файла. Исправлено
рассогласование явно заданного session ID и native provider ID. Managed CLI
открывает только подготовленный writer без миграций перед admission.

Остаётся закрыть до полного завершения:

- P1/P5: синтаксический inventory 208 leaf routes и общий strict parser уже
  реализованы (см. дополнение ниже). Остаются command-specific payload/state
  validators, first-effect coverage и direct-service подготовка всех семейств;
  один синтаксический inventory не закрывает payload/applicability контракт.
- P4: все семантические проверки stage/Work до claim, единое consumption
  подготовленных bytes во всех service paths. Повторные чтения plan/aspect-map
  в PLAN preparation устранены в ходе ревью.
- P6: распространить подготовку continuation на control/direct-service пути,
  строгие typed inputs остальных команд и полный аудит output targets fork.
  Обычный detached continuation теперь проверяет case/checkpoint/entry pack,
  blueprint и interaction fixtures до intent/spawn. Source/fixture/baseline/
  engine подготовка fork перенесена до mkdir/lock.
- P7/P8: согласовать документацию с реальным покрытием, дополнить inventory
  regression и итоговый evidence. Unit PASS не означает готовность всего 039.

### Первая реализация (частичная)

Дополнение общего CLI inventory 2026-09-18:

- `dd-flow-cli/src/cli/command-inputs.ts` — явные 208 leaf routes, включая
  nested/internal, совместимый `transition` и retired surfaces. Проверяет
  arity, required/allowed/repeatable options, значение versus switch, boolean,
  числовые типы/диапазоны, часть enums, aliases и retry-check/reason.
- `prepareCliInput` использует выбранный route; `dispatch` получает те же
  разобранные options/positions, не перечитывает argv. Единственное добавление
  после admission — подтверждённый hook-event-id. Удалён отдельный global
  singleton allowlist. Синтаксическая проверка не подменяет validators файлов,
  схем, references и применимости состояния.
- CLI, engine router и operation classifier используют общий
  `parseCommandArgs`, включая `--key=value`. Upgrade marker проверяется общим
  существующим `isUpgradeAllowlisted`; native early ingress остаётся лёгким и
  валидирует только собственные параметры, не business command/payload.
- Retained terminal invocation проверяет совпадение authority/command и
  возвращает outcome до syntax/payload preparation. Regression доказывает,
  что оба preparation callback не вызываются.
- `test/command-inputs.test.ts`: параметризованное покрытие всех 208 маршрутов.
  `test/run-cli-admission.test.ts`: invalid argv каждого маршрута не создаёт
  свежий DD_FLOW_HOME. Совместимость: полный run-cli прогон 120/122; оба найденных
  отличия исправлены (upgrade marker и подсказка о retired merge session-id),
  повтор пяти затронутых routing/merge сценариев — PASS. Повторять весь
  одиннадцатиминутный набор ради этих двух известных отличий не требуется.
- Общий набор parser/hooks/lifecycle: 519 PASS. Отдельный
  inventory/admission/lifecycle/native-ingress: 504 PASS. Наборы пересекаются.

Дополнение review 2026-09-18 (план всё ещё IN_PROGRESS):

- `stage start` проверяет XOR источников intake/context и пару context-file/
  context-sha256 до admission. Контекст передаётся в исполнение вместе с
  проверенными bytes: установка больше не копирует повторно исходный файл.
- `stage pause/resume` читают question/answer один раз до admission, отклоняют
  пустой и интерактивный stdin. Finish проверяет конфликтующие result aliases,
  запрещённый status/outcome и обязательные MERGE request/work до выполнения.
- PLAN использует общую `prepareVnextPlanFinish`: schema/semantic projection
  готовится до claim; публикация остаётся после проверки рабочего состояния.
- Отсутствующий RUN и повреждённый retained run_root различаются: второй
  остаётся infrastructure failure, не безопасной ошибкой аргумента. Подготовка
  caller inputs возвращает exit 2 с сохранением диагностического кода.
- Fork snapshot JSON и digest берутся из одного чтения. Плохие source pins и
  отсутствующий engine не создают даже родительский каталог fork output.
- Обычный continuation проверяет productive dependencies до detached worker;
  terminal receipt replay не требует повторной проверки этих dependencies.
- Проверено: 80 input/admission/lifecycle тестов, 23 stage-context/admission/
  consistency, 3 профильных protocolize/PLAN; 24 fork/reliability и 105
  eval/recovery. Наборы пересекаются, числа не суммировать. Живые E2E не запускались.

Результаты review-регрессий: dd-flow `typecheck`, lint изменённых TS-файлов;
73 теста input-preparation/admission/lifecycle, 13 fanout, профильные
review-off/feature-worktree/session-identity и PLAN прошли. В dd-eval прошли
105 eval/recovery, 12 e2e-reliability (синтетические, не живой E2E), 50
storage/fork/recovery; новая GC regression с невалидной последней целью
прошла отдельно. Цифры относятся к отдельным пересекающимся наборам, не
суммировать их как количество уникальных тестов. Общий run-cli набор проверяется
отдельно; готовность всего плана из этих результатов не следует. Первый общий
run-cli прогон: 119/122; три отказа исправлены (response-file compatibility,
тесты нового hook-контракта и обнаруженное рассогласование native session ID).
Повтор пяти затронутых CLI сценариев: PASS. Полный набор повторно не запускался.

- `dd-flow`: добавлен единый reader подготовленного text/JSON input,
  lifecycle prepare выполняется до `observed → executing`, terminal replay
  предшествует чтению input. SPECIFY, PROTOCOLIZE, PLAN-REVIEW, CODE и
  CODE-REVIEW получают подготовленные значения; `work add-batch`, Work finish
  и native observations используют тот же reader. Schema validation принимает
  уже разобранные данные и не открывает `<stdin>` повторно.
- Ошибки входа получают `phase=prepare/effect=no_effect/recoverable=true`;
  schema registry/engine-binding/storage faults не маскируются как ошибка
  payload. Явный `--response-file` проверяется до business execution.
- `dd-eval`: CLI booleans строгие; fork проверяет request/engine/checkpoint до
  `registerRunHome`; continuation проверяет manifest до registry/intent/spawn;
  GC проверяет весь внешний plan до первого удаления.
- Регрессии: dd-flow typecheck и lifecycle/admission/SPECIFY набор; dd-eval
  `node --test test/eval.test.mjs test/runner-fork.test.mjs
  test/runner-recovery.test.mjs test/homes.test.mjs`.

### Дополнительное закрытие поздних валидаторов (2026-09-18)

- `run start`: общий `prepareFlowRunStart` проверяет subject/slug/workspace,
  формы task profile/protocol/run overrides, flow flags и execution routing
  до регистрации Project/выделения RUN ID. CLI читает caller JSON до writable
  context, затем service использует prepared profile/routing/flags, не перечитывает
  файлы. Workspace обязан быть директорией. Direct-service regression проверяет
  отсутствие writes и Project при invalid input, затем обычное создание RUN.
- `runtime scope control`: JSON разбирается в CLI prepare; service проверяет
  declaration/source до открытия resource registry. `runtime process register`
  заранее проверяет budget; `runtime process start` использует общий readonly
  validator ports/readiness/RUN до mkdir/register/spawn. 52 runtime/admission
  tests PASS; после добавления RUN cases — 44 RUN/admission/service tests PASS.
- `run fork`: readonly preparation предшествует очистке interrupted-copy targets;
  готовый matching receipt возвращается без исходного snapshot. Source checksum,
  stage boundary и возможность detach retained runtime проверяются до copy;
  output ownership recheck остаётся непосредственно перед удалением owned copies.
  Версия/checksum вызываемого engine и зависимости проверяются до удаления;
  snapshot engine-store не содержит, поэтому другая версия требует вызова того
  CLI, а не заведомо неработающего позднего выбора в пустом target home.
  Copy/install и preflight используют один inventory файлов package/dependencies.
- Канонизация пути разрешает symlink ближайшего существующего предка даже при
  нескольких отсутствующих компонентах. Fork overlap regression покрывает такой
  путь. Snapshot restore/bootstrap запрещают пересечения source/project/home;
  feature workspace collision обнаруживается до очистки project/runtime.
  Fork tests покрывают invalid engine без output, corrupt snapshot без удаления
  старого target и replay после удаления source. Первый полный snapshot набор:
  29 PASS; два engine install/standalone smoke PASS. Повтор полного snapshot
  набора после restore-path изменений: 29 PASS; это не итоговое покрытие всего плана.
- Execution-routing input переведён на общий неблокирующий reader с проверкой
  regular fd и сохранением исходных bytes. FIFO не зависает; EIO не превращается
  в ошибку JSON. Исправимый routing schema rejection маркируется на границе
  явно переданного файла, не для всех ошибок внутренних frozen profiles.

- Прямой `runnerResume` использует тот же productive prepare, что detached
  continuation, до operation.started/dispatch. Lifecycle lock сохраняется перед
  чтением внутренних manifest/queue: initial owner может ещё публиковать их;
  это синхронизация чтения, не productive admission. Applied request/admission
  проверяются до чтения productive inputs под lock. Execution использует
  подготовленные case/entry pack/blueprints без повторной загрузки этих файлов.
  Terminal failed/completed executions сохраняют cleanup/finalization путь без
  требований к профилю нового запуска. Regression доказывает отсутствие execution
  events при invalid manifest; existing initial-owner/control races сохранены.
- При timeout/error финального cleanup observation worker явно сохраняет
  `observation_complete=false` вместе с `unavailable/error`: раньше поле
  отсутствовало именно на exception path. Проверяется existing cleanup-worker
  regression; продуктивный запуск для этого не нужен.

- Work deps/delete/fail/cancel/retry: readonly service preparation вызывается
  до CLI admission и из direct-service entrypoint. Все dependency refs и cycles
  проверяются до transaction, scope включает project и RUN. Retry проверяет весь
  архивируемый набор до первого переноса; malformed retained journal остаётся
  fatal `work_retry_invalid`, а не ошибка аргумента. Mutable state повторно
  проверяется под существующей транзакцией; crash recovery journal сохранён.
- Generic `validation/schema_validation` больше не являются основанием для
  successor сами по себе: требуется `phase=prepare`, `effect=no_effect` и
  `recoverable=true`. Отдельные gate/repair codes сохраняют свой контракт.
  Регрессии Work: invalid deps/delete/settlement не открывают транзакцию и не
  пишут данные; поздний archive conflict не переносит первый файл; partial
  archive/commit recovery продолжает работать. Полный DoD плана ещё не закрыт.
  dd-flow: 37 Work/admission tests PASS; lifecycle 60 PASS и отдельная новая
  post-admission validation regression PASS; typecheck, lint, build PASS.
  dd-eval continuation/control/recovery: 85 PASS, 5 optional live tests SKIP.
  Work result preparation также использует общий settlement guard: проверяет
  status/active children/link и разрешает короткий Work alias в canonical ID
  до поиска WorkSession; внутреннее отсутствие link остаётся fatal.

- `cleanup apply`: общий prepare читает JSON один раз, валидирует весь список
  action kinds и обязательные typed targets, project scope, protocol references,
  retained RUN index и safety guards до writer/admission. Execute потребляет
  подготовленный plan; mutable guards повторяются внутри write transaction.
  Неудачный git-status probe теперь fatal, а не неявное «worktree clean».
- Ошибка после начала apply сообщает `effect=unknown`, откат БД и attempted
  results: файловые изменения не выдаются за откатившиеся вместе с SQLite.
  Регрессии покрывают неправильную вторую action до первого эффекта, missing
  protocol, single-read source, failed git probe, execution failure и malformed
  CLI JSON без runtime home. 9 unit + 1 CLI + 1 existing cleanup scenario PASS;
  typecheck/lint PASS. Реальные home/run данные не очищались.

- `stage pause/resume`: CLI и direct services используют общую readonly
  подготовку Work/RUN/stage/recovery guard. Resume читает retained prompt и
  question до admission; выполнение получает те же тексты, не открывая их
  после COMMIT. Evidence связано с pause ID и исходными путями: смена паузы
  после подготовки — `runtime_state_changed`, не повтор с чужим вопросом.
- Missing continuation artifacts и повреждённый RUN index остаются fatal;
  неверные аргументы/состояние до execute получают prepare/no_effect.
  Regression удаления prompt/question доказывает неизменность RUN/Work,
  непринятие hook и отсутствие answer file; восстановление разрешает resume.
  Проверены 46 SPECIFY/admission тестов и целевой повтор с evidence regression;
  typecheck/lint PASS. Полный P4/P5 ещё не закрыт.

- `stage block/unblock`: общие readonly prepare функции проверяют text input,
  RUN/Work принадлежность и статус, recovery guard, состояние этапа и matching
  blocker до admission. Block summary читается из stdin один раз. Direct
  service использует ту же подготовку перед effects; RUN-layer получает уже
  проверенный state от вызывающего service без дублирующего чтения.
- Existing infrastructure-block/unblock integration PASS: пустой summary и
  неподходящий stage возвращают prepare/no_effect, index остаётся неизменным;
  неверный unblock не снимает blocker, корректный продолжает тот же stage.
  Regression пустого stdin также проверяет отсутствие свежего runtime home.
  Typecheck/lint PASS. Это закрывает block/unblock preparation, не весь P4.

- PLAN aggregation больше не маскирует произвольные exceptions, I/O и ошибки
  внутреннего schema registry как исправимую `validation`. Список ошибок
  собирается только из диагностированных input/semantic AppError exit 2;
  schema-not-found и invalid-code-check-profile сохраняют исходную ошибку.
  Aspect map проходит JSON/schema validation до нормализации полей.
- Existing snapshot-to-PLAN-review integration PASS с добавленными fault
  injections: EIO и повреждённая внутренняя схема проходят наверх без изменения
  batch/map; неверные типы aspect map дают schema_validation, не TypeError,
  и запрещают publish. Typecheck/lint PASS. Остаток P4/P5 не закрыт этим тестом.

- `zcode invocation prepare`: stdin JSON и структура issuance scope проходят
  общий `prepareLifecycleIssuance` до writable context. Direct issuance вызывает
  тот же validator до обращения к storage. Dispatcher использует подготовленный
  payload, не читая stdin повторно; проверка mutable scope повторяется перед
  выдачей invocation. Hook business-валидацией не занимается.
- Проверено 106 тестов admission/input/lifecycle PASS, typecheck/lint PASS.
  Новые регрессии: malformed/null/array/incomplete stdin не создаёт home;
  структурно неверный scope не обращается к БД даже при direct service call.

- `work add-batch`: общий `prepareWorkBatch` читает caller JSON один раз,
  проверяет весь пакет, уникальность ключей, циклы dependencies/parent,
  существование/статус parent и ссылки на Work этого RUN до admission.
  Execute получает подготовленные items; под writeTransaction переиспользуется
  проверка mutable parent/references без повторного открытия файла.
  Direct service без prepared вызывает ту же подготовку до транзакции.
- Регрессии batch: неверные JSON/shape/cycle/missing file не создают home;
  неизвестная dependency не создаёт Work; замена файла после prepare не
  подменяет принятый task; завершившийся после prepare parent блокирует запись.
  7 целевых тестов PASS, typecheck/lint PASS. Остальные P4/P5 остаются открытыми.

- `run config set`/`run vars set`: общий readonly prepare используется CLI до
  writer/admission и direct service до mutation. Проверяются разрешённые
  key/value/reason, наличие RUN, recovery guard и замороженность review mode.
  При execute mutable state снова читается сервисом, caller files отсутствуют.
- Ошибка повреждённого SQLite RUN index теперь `runtime_state_invalid`/exit 1,
  не `validation`/exit 2; JSON null/array/отсутствие stage_runs также fatal.
  Регрессии доказывают отсутствие записей для preparation/frozen setting и
  отсутствие recoverable retry при повреждённом retained state.
- Проверено: 31 input/admission тест, 6 run-settings тестов, один существующий
  integration scenario `accepts a forked starter after a restored stage-entry
  snapshot` PASS; typecheck/lint PASS. Полный gate/E2E не запускался.

- Operator continuation (`requestEvalResume`) теперь использует тот же readonly
  `prepareRunnerContinuation`, что обычный detached resume: manifest/profile,
  execution IDs/mode/contour, retained definition, blueprint, capacity и HITL
  configuration проверяются до registry, intent и worker. Принятый immutable
  intent не проходит повторную проверку продуктивных зависимостей; конфликт
  request ID проверяется до registry. После подготовки проверяется deadline,
  чтобы просроченный запрос не получил поздний старт.
- Control/reliability набор: 43 PASS, 5 live-интеграций SKIP (без live E2E).
  Старые synthetic control fixtures дополнены полным manifest, чтобы тесты
  потери наблюдения/foreign registration продолжали проверять нужный слой.
  Direct `runnerResume`/runtime control и остальные пункты P6 ещё требуют
  завершения аудита; эта запись не закрывает P6 целиком.

- `project config set`: существующий pure parser переиспользуется в CLI prepare
  и direct service. Неизвестный ключ и неверное значение отвергаются до создания
  writer/runtime home, с `phase=prepare/effect=no_effect/recoverable=true`.
- `schema validate`: файл читается один раз общим JSON reader; RUN binding и
  schema validation используют тот же объект. Результат вычисляется в prepare
  и передаётся dispatcher без повторного чтения caller input. Удалён reader,
  который молча проглатывал ошибки при извлечении run_id.
- Проверено: 28 тестов input-preparation/admission PASS, typecheck PASS.
  Добавлены случаи отсутствующего файла, malformed JSON, schema mismatch,
  валидного JSON и неверной конфигурации без создания runtime home.
- Это частичное закрытие P5; оставшиеся payload/state/direct-service пункты
  раздела 13 сохраняются. Статус всего плана остаётся IN_PROGRESS.

### Focused/segment entry preparation — дополнительное закрытие P6

- Общий `prepareFocusedEntries` читает и валидирует stage-entry до регистрации
  первоначального EVAL и до launch operation. Queue и direct launch используют
  один validator, executor получает уже прочитанный объект без повторного
  открытия caller file. Один source file читается один раз на подготовку очереди.
- Resume готовит entries только для ещё не начатых executions; derived fork
  использует свой retained snapshot. Завершённые операции не требуют повторного
  чтения stage-entry. Для focused-only очереди не требуется несвязанный e2e blueprint.
- Регрессия проверяет malformed JSON и schema mismatch без operation journal,
  а также удаление source после prepare: execute доходит до восстановления
  snapshot с принятыми данными, не перечитывая удалённый файл.
- Проверка focused-entry/task-input/runner-control: 32 PASS, 5 live SKIP,
  0 FAIL. Ранее eval/canonical/control: 99 PASS, 5 SKIP. Live E2E не запускался.
- Это не закрывает весь 039: оставшийся command-specific first-effect аудит
  и итоговая сверка P1–P8 остаются открытыми.

### Runtime turn release — дополнительное закрытие P5

- `runtime process release-turn` готовит observation до writer; direct service
  использует тот же `prepareProviderTurnRelease`. Исполнитель потребляет
  подготовленный объект без повторного чтения файла. Выбор operation-id либо
  observation-file взаимоисключающий; неоднозначный вызов — usage/exit 2/no_effect.
- Observation — retained daemon receipt: повреждение JSON/shape остаётся
  infrastructure failure/exit 1, не превращается в retryable ошибку модели.
  Проверки физического owner, daemon generation, принадлежности каталогу и
  settled evidence перед удалением claim сохранены. Retained operation/result
  в режиме operation-id также сохраняют инфраструктурную семантику.
- Concurrent scope control выявил окно: файл registry уже существует, но таблица
  ещё создаётся другим процессом. Readonly replay lookup использует стандартный
  busy timeout 4000 мс; отсутствие таблицы означает отсутствие receipt, затем
  executor повторяет lookup под существующей write transaction после init.
- 15 runtime-budget тестов PASS, включая физические конкурентные клиенты,
  пустой registry без записи при prepare, повреждённые receipts, удаление source
  после prepare и отказ foreign daemon без освобождения claims. Build PASS.
- Общий план всё ещё IN_PROGRESS; этот набор не заменяет оставшийся аудит CLI.

### Codex hooks install/remove — дополнительное закрытие P5

- Общий `prepareCodexHooks` используется до CLI writer и direct service mutation:
  project/target/profile, confirmation, чтение JSON и форма event arrays.
  Невалидная конфигурация больше не нормализуется молча в пустые hooks.
- Install/remove и backup потребляют подготовленные данные, не перечитывая
  source; чужие корректные hooks сохраняются. Backup создаётся с mode 0600.
- Регрессия malformed JSON/null/invalid hooks shape доказывает отсутствие backup
  и изменений; source deletion после prepare проверяет обе операции и backup.
  Existing CLI scenario default confirmation/backup/drift/install/remove PASS;
  typecheck, scoped lint и build PASS. Остальной аудит 039 не закрыт этим пунктом.

### Dashboard output — дополнительное закрытие P5

- Явный `--output` проверяется CLI до writer с правильной базой относительного
  пути (project root для project/protocol, cwd для global). Проверяется тип
  выходного файла, ближайший существующий родитель и доступ на запись.
- Shared `prepareOutputFile` используется также direct render service:
  project/protocol/global HTML проверяет HTML и JSON destinations до первой
  записи. Устранена частичная запись JSON при заведомо невалидном HTML output.
  Markdown render также проверяет destination перед записью.
- 3 профильных теста PASS: новая регрессия отсутствия JSON sidecar при ошибке
  output, существующие static HTML global/project/protocol и target-based CLI.
  Typecheck и scoped lint PASS. Filesystem races остаются execute errors;
  предварительная проверка не обещает атомарности многофайлового экспорта.
- Это не закрывает весь dashboard/admin inventory: multi-project refresh и
  остальные implicit output targets требуют итоговой сверки отдельно.

### Legacy bootstrap — дополнительное закрытие P4

- В `bootstrapStageRun` обнаружено чтение intake после registerProject,
  registerProtocol и startFlowRun. Shared `prepareLegacyStageStart` теперь
  проверяет режим/subject/directory и читает intake перед этими действиями;
  direct startStage использует ту же подготовку по умолчанию.
- CLI legacy bootstrap передаёт уже прочитанный intake в service preparation,
  затем executor пишет принятый текст, не открывая source повторно. Bootstrap
  на других стадиях и intake options вне SPECIFY отвергаются до writer.
- 71 admission/legacy-start тест PASS; подтверждены missing intake, escaping
  directory, invalid stage без runtime creation/storage access. Typecheck и
  scoped lint PASS. Полная applicability-проверка legacy start и всех других
  стадий остаётся частью итоговой сверки, не закрыта одной этой регрессией.

### Stage attachment — общая подготовка P4/P5

- Из `attachFlowRunStage` выделена readonly `prepareFlowRunStageAttachment`:
  project/RUN lookup, recovery guard, authoritative index, stage/dir/status,
  существующие vNext applicability checks. CLI `run attach-stage` вызывает её
  до writer; service повторяет mutable checks перед archive/persist.
- Legacy start существующего RUN проверяет attachment до регистрации hook
  project/binding. Directory validator переиспользуется в legacy bootstrap:
  неверный формат `NN-stage-slug` теперь отвергается до создания RUN, а не после.
- Регрессии покрывают readonly valid preparation, direct invalid stage/status/
  directory без effects, missing RUN и legacy bad-format без создания home.
  Не заменяет оставшиеся start-specific проверки всех vNext стадий.

### Stage completion — подготовка mechanical endpoint P5

- `run complete-stage` использует общую readonly
  `prepareFlowRunStageCompletion` до writer: RUN/recovery authority,
  authoritative stage existence, status, строковые artifact references/aliases.
  Direct service использует тот же путь; mutable stage state перечитывается
  непосредственно перед записью, подготовленный snapshot не заменяет authority.
- `data/report/stage-report/alias` здесь сохраняемые ссылки, а не читаемые CLI
  payload files. Существующие stage-specific semantic/schema validators остаются
  в finish services; mechanical command не вводит второй reader/schema engine.
- 81 admission/settings тест PASS до финального расширения cases на пустые
  artifact references; дополнительные проверки references включены в focused
  settings rerun. Не является подтверждением полного выполнения 039.

### RUN override — общая подготовка P5

- Общая `prepareFlowRunCompletion` проверяет RUN/guard/index/status и активные
  Work для обычного completion до effects; CLI override вызывает её до writer.
  Executor заново читает mutable state, а не принимает прежний index за authority.
- Устранено расхождение прямого сервиса и CLI: manual override принимает только
  failed/cancelled и непустую reason. Ранее пробельная reason обходила active Work
  guard, а direct call мог передать done с reason. Успех через override запрещён
  в общем сервисе; завершение обычными stage services сохранено.
- 83 admission/settings теста PASS; typecheck/scoped lint PASS. Обновление
  не подтверждает полное закрытие остальных строк CLI inventory.

### Canon registration и ID preview — аудит P1/P5

- `canon register`: общая `prepareCanonRegistration` проверяет явно выбранный
  canon до writer/home creation; invalid root возвращает validation/exit 2 с
  no_effect и прежними blockers/bootstrap diagnostics. Executor использует
  подготовленную resolution вместо повторного обхода источника. Direct service
  вызывает ту же подготовку по умолчанию.
- `id next` по текущему `previewNextEntityId` читает DB/filesystem и возвращает
  reserved:false, не выделяет ID и не меняет счётчик. Исправлена неверная пометка
  об эффекте в inventory. Strict parser сохраняет сервисные aliases prt/wrk и
  регистронезависимые варианты; отдельного нового allocator не требуется.
- 512 route/admission тестов PASS, 1 существующий canon-registration CLI
  scenario PASS; typecheck/scoped lint PASS. Это доказательство перечисленных
  строк, не завершение полного first-effect inventory.

### Project/protocol registration — подготовка P5

- Общий `resolveProjectRoot` теперь требует directory, а не просто существующий
  filesystem object. CLI project register проверяет root до writer; direct
  register и остальные потребители используют тот же resolver.
- `prepareProtocolRegistration` проверяет handshake как identifier, project и
  optional workspace до runtimeProtocolDir/files. Разделители пути/NUL/dot paths
  больше не могут пройти как PRT identifier. CLI вызывает shared preparation до
  writer; direct register повторяет её перед исполнением.
- 79 admission/worktree/transition тестов PASS; дополнительно 2 direct protocol
  теста PASS, включая path identifiers без storage access. Общий protocol
  registration штатно используется успешными worktree/transition fixtures.
- Все остальные protocol команды и registry/admin строки требуют своей
  проверки; эта запись не закрывает их автоматически.

### Project archive — подготовка P5

- Shared `prepareProjectArchive` проверяет ровно один target (ID/alias либо
  root), непустую reason и существование регистрации до writer/update.
  Удалено молчаливое предпочтение root при одновременно переданном ID.
  Direct archive использует ту же проверку перед условным UPDATE; повторный
  archive по root по-прежнему возвращает already_archived без новой записи audit.
- 80 CLI admission тестов и 1 direct-service regression PASS; typecheck и
  scoped lint PASS. Тесты используют только временные проекты, пользовательские
  проекты не архивировались. Общий inventory остаётся незавершённым.

### Объединённая регрессия после административных fixes

- Build PASS, затем один совместный набор: все `*preparation.test.ts`,
  run-cli-admission, lifecycle-invocations, runtime-cutover, runtime-budget,
  run-controller-state. Результат: **245 PASS / 18 файлов / 0 FAIL** (~38 с).
- Это включает legacy PLAN/CODE, native bindings, lifecycle retained replies,
  concurrency budget и подготовку новых admin paths в одной текущей сборке.
- Создана отдельная evidence-карта команд с first effect и regression sources.
  Пока 19 явно рассмотренных routes; оставшиеся строки не объявлены готовыми.
  Live E2E/release/publish/пользовательские cleanup не запускались.

### HITL answer: applicability до writer admission

- `prepareRunControllerAnswer` теперь проверяет request conflict, единственность
  ответа для pause, текущего controller, terminal RUN и соответствие active pause
  до writer admission. Один shared read-only helper используется и direct service,
  и CLI. Execute повторяет mutable checks под транзакцией, не перечитывая source.
- Regression: чужой pause не открывает write transaction и не создаёт файлов/
  operations; завершение controller после prepare отвергается до публикации ответа.
- `test/run-controller.test.ts`: 38 PASS; TypeScript и targeted ESLint PASS.
- Не менять незаметно контракт answer replay: request hash включает raw bytes,
  в отличие от context с explicit SHA. Повтор с другим содержимым по тому же ID
  по-прежнему conflict. Replay после удаления source требует отдельного решения
  контракта и этим исправлением не объявлен завершённым.

### Snapshot creation: подготовка до копирования

- Bootstrap snapshot раньше обнаруживал отсутствие Git HEAD/branch после
  `mkdir/cp`. Теперь общий `prepareEvalBootstrapSnapshot` проверяет root,
  destination/containment и Git до копирования; CLI использует его до writer.
- RUN snapshot: извлечён `prepareEvalRunSnapshotCreation`; direct service и CLI
  проверяют взаимоисключающие режимы, RUN/controller/recovery applicability,
  quiescence, destination и project Git до temporary output. Проверки состояния
  при capture сохранены; sealed-source restore validator не изменён.
- Убрана отдельная CLI-развилка выбора режима: один input builder и один service
  validator предотвращают различия между direct calls и CLI.
- Regression: bootstrap без Git/без commit не создаёт output parent; conflicting
  modes отклоняются до DB reads; CLI не создаёт runtime home/output при отказе.
- TypeScript PASS; snapshot + admission: **113 PASS / 2 файла**, включая fork,
  recovery и восстановление конфликтного Git index. Дополнительный focused
  control-input набор: 13 PASS. Полный план по-прежнему IN_PROGRESS.

### Snapshot feature workspace: ранняя проверка retained Git state

- Проверка named branch/readable HEAD отдельного workspace теперь вынесена
  из позднего `snapshotWorkspace` в общий read-only helper и вызывается общей
  подготовкой создания snapshot до mkdir/copy runtime. При фактическом capture
  состояние проверяется снова; это mutable Git state, не повторное чтение
  пользовательского payload.
- Regression с detached feature worktree доказывает отсутствие `cpSync` и даже
  output parent при отказе. Существующие четыре round-trip сценария обоих
  checkout (clean/modified/deleted/staged-deleted templates) остались зелёными:
  5 PASS, TypeScript PASS. Аудит прочих маршрутов остаётся незавершённым.

### Plan item mutation и происхождение missing-artifact ошибок

- `plan item start/done/block/skip`: прежний `planWithProgress` по умолчанию
  выполнял binding/INSERT progress до проверки item/dependencies. Теперь общий
  `preparePlanItemMutation` использует read-only projection, проверяет canonical
  binding, item/dependencies и action payload. Все четыре public services и CLI
  используют его; только после успешной подготовки выполняется update/binding.
- Regression проверяет отсутствие SQL writes для неизвестного item/пустого
  summary/reason, чистую подготовку всех четырёх действий и успешный done.
  CLI dependency rejection сохраняет прежние таблицы binding/progress;
  четыре команды с отсутствующим project не создают runtime home.
- Смежный regression обнаружил недопустимую классификацию missing accepted
  predecessor как `not_found` → recoverable CLI typo. Введён отдельный код
  `runtime_artifact_missing` для отсутствующих принятых report/specify/protocol
  artifacts в prompt, PLAN, PLAN-REVIEW, CODE-REVIEW, PROTOCOLIZE, canonical plan
  и retained fanout root. Unknown RUN в fanout остаётся отдельным `not_found`.
  Это исправление missing-case; аудит malformed retained payload остаётся
  отдельным обязательством, не считается закрытым одной заменой кодов.
- Build PASS; targeted CLI plan/prompt + classifier: 5 PASS; control-input
  admission: 17 PASS. Prompt regression запускался после обновления dist:
  frozen engine иначе продолжал исполнять предыдущую сборку.
- Input preparation + fanout regression: 27 PASS; TypeScript и targeted ESLint
  PASS. Полный план не закрыт: оставшиеся CLI семьи и malformed retained inputs
  требуют собственной сверки.

### Malformed retained JSON: canonical PLAN / accepted SPECIFY / PLAN-REVIEW

- `readCanonicalPlan` теперь отдельно классифицирует JSON/typed-validation
  ошибки canonical artifact как `runtime_artifact_invalid` (exit 1), а не
  `validation` (exit 2). Все его потребители получают один и тот же контракт.
- `acceptedSpecifyObligations` читает accepted SPECIFY один раз и проверяет
  schema по тем же данным; malformed JSON/schema не превращается в caller retry.
  Ошибки schema registry/engine/DB не перехватываются этой классификацией.
- PLAN-REVIEW internal `readJson` используется только для retained report,
  context, aspect map и plan: его parse/read failure также остаётся runtime
  error. Пользовательский decision использует отдельный input validator.
- Regression: 6 tests проверяют malformed/nonobject canonical plan, broken
  accepted SPECIFY до создания PROTOCOLIZE artifacts и malformed review context
  до reviewer dispatch; ошибки проходят `prepareError` без recoverable label.
- Fresh build + targeted CLI/source suite: 7 PASS; затем расширенный retained
  artifact suite: 6 PASS; TypeScript и targeted ESLint PASS. Изменение не
  объявляет закрытыми все места чтения retained JSON по кодовой базе.

### Lane preparation: скрытая запись из ownership lookup

- `activeLaneLock` раньше вызывал UPDATE expiry при каждом чтении, в том числе
  при `requireLaneLockOwner`, неверном heartbeat TTL и отказе release по owner.
  Теперь lookup — SELECT с фильтром срока действия. Explicit expiry сохранён
  в acquire/wait; queued acquire выполняет expiry locks/waiters внутри своей
  write transaction один раз, без скрытого повторного UPDATE из lookup.
- `prepareLaneWorkspace` используется до CLI writer и direct service; общий
  resolver требует directory, а не любой существующий файл. Его используют
  также check/matching/ensure paths. Ошибка типа lane теперь validation,
  а не TypeError из trim.
- Regression проверяет отсутствие SQL writes при prepare/неверном directory,
  неверном TTL/чужом owner и чтении expired lock; expired lock не принимается
  за действующий. Preparation + admission: 88 PASS, TypeScript/lint PASS.
- Этот аудит не закрывает весь lane/merge-queue API: дополнительные action
  payloads и все pre-writer dispatch paths требуют оставшейся сверки.
- Существующие CLI integration lifecycle/stale takeover и FIFO waiter/retry/
  cleanup/stop-cancellation: 2 PASS. Проверено сохранение успешного поведения,
  а не только ранний отказ новых regression.

### Lane lock payload preparation shared by all public mutations

- Acquire/heartbeat/release/wait/wait-acquire теперь используют один
  `prepareLaneLock` до эффектов и до CLI writer initialization. Он валидирует
  worker/reason/token, TTL/timeout/poll interval, project/lane/workspace и нужную
  ownership applicability. Mutable состояние повторно читается direct service
  непосредственно перед действием; prepare не сохраняет lease/receipt.
- Конечные, но непредставимые как Date TTL/timeout теперь отклоняются до expiry
  updates; poll interval ограничен поддерживаемым диапазоном Node timer, чтобы
  большое значение не превращалось в частый polling из-за overflow.
- Waiter cancel получил аналогичную чистую подготовку worker/reason/project/lane.
  Read-only lane status/lock status/waiters/workspace check проверены отдельно:
  classifier выбирает read_existing, сервисы не выполняют SQL writes.
- Подготовка/admission: 93 PASS до добавления waiter-case; окончательный targeted
  payload/admission набор: 25 PASS. Direct regression также проходит успешные
  wait, queued acquire, heartbeat, release и no-op cancel без реального ожидания.
  TypeScript и targeted ESLint PASS. Merge-queue ещё требует отдельного аудита.

### Merge preparation and explicit protocol repair

- `readProtocolRuntimeState` previously repaired files/DB even during input
  preparation on a writable context. Reading/reconstruction is now pure;
  explicit cleanup repair retains persistence. Read does not mutate the caller's
  protocol record. Existing missing-state and pinned-flow-contract CLI behavior
  verified on freshly built engine.
- Single merge complete/fail prepare payload, ownership and required state/flow
  contract before queue changes; CLI uses the same preparation before writer
  initialization. A broken contract cannot first mark the job merged.
- Bundle complete/fail prepare **all** members before any member is written,
  reusing the single-job helpers. Mutable applicability is refreshed inside the
  transaction before its first write. This avoids a late member validation error
  after an earlier filesystem state has already changed; runtime I/O failure
  after execution still requires recovery, not a no-effect claim.
- Tests: initial read/merge/admission + existing CLI contract behavior 28 PASS;
  final bundle/admission regression 30 PASS. Corrupt second member leaves first
  state bytes and both queue statuses unchanged, then successful complete/requeue
  verified after repairing the fixture. Remaining claim/wait/note/cancel paths
  are not covered by this completion/failure evidence.

### Merge cancellation and claim transition ordering

- `merge-queue cancel` now shares `prepareMergeQueueCancellation` between CLI
  admission and the direct service. Reason/optional worker/boolean force and
  state/ownership applicability are checked before the transaction; mutable
  applicability is refreshed under the transaction. Already-cancelled remains
  idempotent. Regression proves malformed payload/terminal rejection cause no
  writes or transaction, followed by successful force cancellation and replay.
- All three claim variants validate worker text. Transition preparation is
  extracted from transition execution: protocol state, readiness, pinned flow
  contract and linked-run diagnostics are read before UPDATE. Bundle prepares
  every transition, then claims all queue rows before publishing any protocol
  files. Thus a later invalid state or unclaimable queue row does not leave an
  earlier protocol file in integration after SQL rollback.
- Targeted regression/admission: 32 PASS; TypeScript/targeted ESLint PASS.
  Fresh engine build plus existing targeted/FIFO-neighbor claim and full bundle
  claim/complete CLI scenarios: 2 PASS. This proves successful behavior remains,
  not just early failure.
- Still open in this area: complete pre-admission coverage for claim commands
  and wait-next validation before automatic lane creation. Do not mark the whole
  merge family complete based on these narrower results.

### Merge CLI claim/wait pre-admission completion

- `prepareMergeClaim` is shared by CLI next/claim and direct services; ownership,
  stopped worker, chosen FIFO/targeted job and transition applicability are
  checked before admission, then refreshed inside the write transaction.
  `prepareMergeBundleClaim` covers branch eligibility and every transition before
  CLI admission and direct execution. Queue claim conditions remain under SQL
  transaction; no frozen preflight claim is treated as authority.
- `prepareMergeQueueWait` validates worker/acquire-lock, timing, project, initial
  job transition and workspace before auto-creating a lane or waiter. Existing
  lanes use their shared preparation; new lanes validate the directory without
  INSERT. Stop outcome remains an outcome, not an input error.
- Lane and merge waits share `prepareLaneWaitTiming`, including Node timer/date
  overflow limits. No new polling framework or background retry was introduced.
- Preparation/admission/lane suite: 109 PASS. Regression explicitly checks no
  lanes/waiters/writes on rejected wait payloads; invalid queued protocol is also
  rejected before lane creation. This closes the claim/wait pre-admission gap
  above, not the remaining overall P1–P8 audit.
- Fresh build integration: 5 PASS (lane ownership/wait, acquire+heartbeat,
  targeted FIFO-neighbor claim, bundle claim/complete, release on worker stop).
  Additional final invalid-queued-state regression: 4 PASS in merge preparation
  file; TypeScript and targeted ESLint PASS. The final source-only guard adds
  early rejection of a not-ready queued protocol before automatic lane creation;
  integration build preceded that guard and is not evidence of that new branch.

### Dashboard nested HTML publication

- Project HTML previously wrote its JSON/HTML before rendering protocol pages;
  a bad later protocol destination could therefore fail after partial output.
  Protocol HTML preparation is now separated from publication. Project rendering
  prepares all selected protocol pages first, then writes parent and children;
  prepared data/HTML are consumed without rebuilding the protocol pages.
- Protocol rendering (including open-protocol) also checks the existing project
  recovery guard before writing, matching project rendering behavior.
- `dashboard-preparation.test.ts`: 2 PASS, including a blocked second protocol
  output with no parent/first-page writes, followed by successful rendering of
  both pages after fixing the destination. TypeScript/ESLint PASS. Fresh build
  and existing global/project/protocol HTML CLI scenario: 1 PASS.
- This does not close refresh-all best-effort semantics, summary publication,
  auto-refresh or all implicit destinations before CLI writer admission. Those
  remain part of the dashboard audit; no claim of whole-family completion.

### Dashboard refresh output preparation

- Shared `prepareDashboardRefresh` validates project/protocol applicability,
  format/open, recovery guard and all summary/project/global output paths before
  project publication. CLI project/protocol refresh invokes it before writer
  initialization; disabled-project refresh remains a no-op.
- Auto-refresh reuses the output-path check while preserving disabled/recovery
  early skips. A blocked global destination no longer leaves a newly written
  project summary/Markdown behind. Tests cover manual and automatic paths and
  successful retry after fixing the destination.
- Refresh-all is intentionally best-effort across projects, retaining per-item
  failure reporting; it checks project output/summary paths and renders before
  summary publication. Regression confirms a failed nested protocol page leaves
  no summary or parent HTML for that project. Global output is permitted by this
  partial-result API, not described as a no-effect failure for the whole batch.
- Focused preparation/admission 40 PASS; final dashboard preparation 4 PASS;
  TypeScript and targeted ESLint PASS. Remaining dashboard pre-admission audit:
  render/open/global targets and explicit batch-wide invalid-option handling.
- Fresh build plus existing CLI manual Markdown refresh, automatic project/global
  refresh and disabled auto-refresh scenarios: 3 PASS.

### Dashboard target and options admission

- All dashboard CLI paths now resolve/validate the target and options before
  writer initialization, not only when explicit `--output` is present. Protocol
  existence is checked in the selected project, including data/open routes.
- Render/global-render share service preparation for format, recovery guard,
  destination and JSON sidecar. Open validates viewer and protocol HTML support;
  global/protocol open prepares generated output, project open remains an open
  of an existing view rather than a new rendering operation.
- Common option validation is reused by direct open/refresh services. Existing
  legacy default formats and target-based defaults remain unchanged. Redundant
  same-call Markdown destination checks removed.
- `--output` on project/protocol or all-project refresh was silently ignored;
  it now fails before effects with guidance to use `dashboard render`. Global
  refresh retains custom output support.
- Full dashboard preparation/admission suite: 118 PASS before the final ignored
  output case; final focused global-option admission adds that case. Fresh build
  target-based, HTML and manual Markdown CLI scenarios passed. Remaining overall
  completion still requires the non-dashboard route/P1–P8 audit and consolidated
  verification; these rows are not proof of whole-plan completion.

### Managed Codex home removal preparation

- CLI and direct removal share `prepareCodexHomeRemoval` before writer admission
  or file deletion: mode, profile, project and registered target are resolved.
  Explicit empty/non-string profiles are rejected by shared profile resolution
  instead of silently selecting the default profile or throwing TypeError.
- Existing target ownership marker must match registration/project/profile and
  source/target paths; target cannot resolve to source. Missing/corrupt/mismatched
  retained marker is infrastructure `runtime_artifact_invalid`, not a retryable
  argument error. No extra ownership store was added.
- Already-removed profiles return a no-op, avoiding deletion of new files placed
  at a formerly managed path. Unknown profiles remain not-initialized no-op.
- Regression proves malformed mode/profile/marker leave config and SQL intact;
  valid temporary-home removal preserves source config and repeat is no-op.
  Focused preparation/admission: 40 PASS; home regression 2 PASS. Real user
  homes have not been removed or modified by this task.
- Expanded final home regression: 3 PASS, covering both keep-shared and
  remove-owned with shared auth symlink/source preservation. Fresh build and
  existing isolated-home CLI lifecycle: 1 PASS; targeted ESLint PASS.

### Managed process stop/reconcile timer input

- Stop previously sent SIGTERM before using unvalidated `graceMs`; invalid or
  overflowing Node timers could cause immediate escalation. Reconcile also
  claimed expired rows before validating grace. Shared payload preparation now
  checks IDs/owner/token, optional reason/force and bounded nonnegative integer
  grace before resource DB access, claims or signals.
- CLI stop/reconcile use the same prepare before admission. A valid zero grace
  is now preserved instead of rejected by the unrelated positive-number parser
  or replaced by a default through a truthiness conditional.
- Regression checks invalid grace/identity/force cause no resource-home creation
  or process signals, including direct service calls; CLI checks both home paths
  absent for timer overflow. Existing managed-process ownership/reconciliation
  behavior plus admission tests: 130 PASS; TypeScript/ESLint PASS.
- Still open: resource-registry read API currently initializes storage, so valid
  syntax with missing/mismatched process ownership needs a read-only applicability
  path before writer admission. Register/confirm/heartbeat/finish payload and
  registry origin checks remain to be audited; this timer fix does not close the
  full runtime process family.

### Read-only resource registry and stop applicability

- `getResourceDatabase(..., "read_existing")` does not create directories, a DB,
  schema or writer registration. Existing files open read-only. If a local writer
  already owns a transaction, read-only view delegates only get/all to it, keeping
  uncommitted visibility without exposing writes or closing the writer.
- `managedProcessStatus` now reads through this API and closes owned read handles;
  process status is classified read-only. Missing registry gives an empty result,
  while actual DB errors are not swallowed into an empty registry.
- Stop preparation verifies retained process, matching lease and usable physical
  identity before CLI writer initialization/direct registry writes. Execution
  rechecks ownership from the writer before signals; missing process is a typed
  not_found, while lease loss/unknown identity remain infrastructure errors.
- Managed-process/admission suite: 133 PASS; TypeScript/ESLint PASS. Additional
  direct wrong-lease/unconfirmed tests verify zero SQL writes. Resource read tests
  cover absent home, cached transaction visibility, write rejection, writer
  lifetime, and uncached read-only reopening. CLI missing stop (grace 0) and status
  leave both flow/resource homes absent. No real user process was stopped.
- Final managed-process + runtime-budget regression: 29 PASS, including the
  additional wrong-lease/unconfirmed checks and existing budget ownership flows.

### Managed process lease preparation

- Shared lease-expiry validation now rejects nonpositive/fractional/nonfinite
  durations and dates outside the representable range before registry creation.
  Register, confirm, heartbeat and port reservation invoke it before effects;
  the three public CLI lease commands invoke it before writer admission.
- This avoids late RangeError after opening/initializing resource storage and
  prevents accepting already-expired leases through malformed negative input.
  Existing default/positive leases remain unchanged.
- Expired-record tests now explicitly set expiry or use a historical context
  clock, retaining their original reconciliation scenario without exploiting
  invalid service input. No production caller used negative/zero leaseMs in the
  inspected source tree.
- Managed-process + full code-check regression: 61 PASS, including live/dead
  orphan reconciliation and workspace gate ownership. Five CLI timing-overflow
  checks PASS with neither home created; TypeScript and targeted ESLint PASS.
- Register/confirm/heartbeat/finish still need complete payload/applicability
  audit beyond lease duration; this entry is not a closure of those route rows.

### Managed process registration, confirmation and settlement preparation

- Added shared preparation for registration (scalar fields, PID/lease, metadata
  object/serialization, observer identity, unique-operation requirement and
  retained registration conflicts). Metadata is serialized before opening the
  writer and the INSERT consumes that prepared string. CLI and direct callers
  use the same service preparation; registration argument construction is shared
  by preflight and dispatch. Unique operation ownership is still rechecked in
  the existing execution transaction.
- Confirmation validates IDs/PIDs/lease and reads starting state/lease ownership
  before writer initialization. Its execution UPDATE remains conditionally
  fenced on the same ID/token/starting state.
- Heartbeat validates input before resource access and keeps its boolean lease
  contract: missing/stale/terminal returns false without initializing or writing
  the registry. Finish validates ID/token/terminal state/reason and reads the
  retained registration before writer admission; identical terminal replay is
  true, incompatible state or stale lease false, without writes. Missing finish
  target is a prepare not_found. Resource/physical ownership failures remain
  infrastructure failures, not argument retries.
- Regression before registration expansion: 157 PASS (managed-processes,
  runtime-budget, CLI admission), TypeScript and targeted ESLint PASS. Expanded
  registration regression: 204 PASS including full code-checks suite; TypeScript
  and targeted ESLint PASS. Final runtime-input CLI matrix: 9 PASS, including
  observer registration without PID/operation, with both homes absent.
- This closes the listed process registration/confirmation/heartbeat/finish
  payload paths, not runtime scope/admission APIs or the remaining P1–P8 audit.

### Runtime scope argument preparation

- Scope fence/stop now share scope and bounded nonblank request validation with
  control; CLI invokes it before writer admission and direct stop invokes it
  through fence before any physical operation. This fixes whitespace/non-string
  request IDs and late malformed scope/overlong request rejection.
- Resume exposes `prepareRuntimeScopeResumeInput`; CLI and direct record service
  use the same scope/request/generation/capture-key checks before registry
  creation. Existing capture/generation/ownership applicability is still guarded
  under the execution transaction, not weakened by the input check.
- Regression found a missing error classification: runtime_scope_resume_invalid
  was returned without prepare/no_effect/recoverable. It has one source, the
  pure argument validator, and now receives the normal safe-correction envelope.
  Other resume conflicts, damaged captures and ownership failures stay fatal.
- Not a closure of scope status/reconcile/serve or full resume applicability:
  those routes still require their own read-only preparation audit.
- Final verification: 169 PASS (runtime-budget, CLI admission, input preparation),
  TypeScript and targeted ESLint PASS; no live EVAL or user process was started
  or stopped. Invalid scope/argument tests leave both CLI homes absent.

### Runtime scope reconciliation preparation

- `prepareRuntimeScopeReconciliation` validates scope/request/generation and
  the existing 200-character recovery request limit before resource access.
  It reads only the current control record through read_existing, replacing the
  previous full status call that initialized storage before request validation.
  CLI preflight and direct reconciliation share this preparation.
- Missing/superseded generation remains runtime_scope_control_superseded (fatal,
  no suggestion to retry a CLI typo), but now creates neither runtime home.
  Valid preparation makes no SQL writes; the existing launch transaction still
  arbitrates current control and physical worker ownership.
- Shared recovery observation renewal now rejects non-string request IDs as
  usage instead of throwing TypeError; all callers use the same validator.
- Targeted regression: 157 PASS (runtime-budget, recovery-observation-budget,
  CLI admission), TypeScript and targeted ESLint PASS. Separate missing-control
  CLI regression: 1 PASS. Fresh build and detached worker integration: 1 PASS
  (concurrent launch, CLI exit, retained completion, explicit reconciliation,
  and final owned-process shutdown in the test's temporary scope).

### Runtime scope worker admission preparation

- `prepareRuntimeScopeServing` validates scope/generation and checks launch token
  plus retained unclaimed starting worker through read_existing before opening
  a writer. The same starting-worker check is reused inside the existing claim
  transaction, preserving single-owner arbitration after the preflight window.
- CLI and direct serve call this preparation. Bad scope/generation is an input
  error; missing token/claim and an already-owned worker remain infrastructure
  failures, without claiming that an ordinary CLI correction can repair them.
- Verification: 157 PASS (runtime-budget + CLI admission), TypeScript and
  targeted ESLint PASS. Fresh build and detached worker integration PASS.
  No production worker or live EVAL was launched; integration owns temporary
  fixtures only. Separate CLI missing/foreign token checks: 2 PASS; both homes
  remain absent and neither failure is advertised as recoverable input.

### Local runtime check admission is read-only

- `admitRuntimeCheck` validates ID/token before opening resource storage and uses
  read_existing. One SELECT reads the process and both scope admission fences
  from the same database snapshot; no writer transaction or schema initialization
  is required for this observational result. Physical liveness is still checked.
- The CLI route is classified read-only, so an unknown process creates neither
  DD_FLOW_HOME nor DD_FLOW_RESOURCE_HOME. A missing/mismatched process remains an
  infrastructure ownership failure, not a suggested command-argument retry.
- Invalid retained process budget/role/operation now produces
  runtime_artifact_invalid (exit 1), rather than runtime_budget_invalid (exit 2),
  which incorrectly described damaged stored state as user input.
- This check remains an admission observation, not a new durable permission:
  physical ownership/fencing mechanisms continue to govern subsequent execution.
- Verification: 176 PASS across runtime-budget, scope-stop, scope-control and CLI
  admission; TypeScript and targeted ESLint PASS. Regression confirms successful
  admission makes no SQL writes or writer transaction, and control/stop still
  reject dispatch in the selected scope without affecting its neighbor.

### Diagnostic route classification and pure configuration reads

- Audited project config status and RUN timeline/config status/vars ls+get/flags
  status: owning services read retained project/RUN data; they are now explicitly
  classified read-only rather than initializing a writable home by default.
- `readProjectConfig` no longer runs a legacy migration based on connection
  writability. It projects legacy keys without writes, with canonical keys taking
  precedence. Explicit `setProjectConfigValue` performs the existing migration
  only after validating the requested key/value. Invalid input therefore cannot
  cause legacy-key cleanup. Raw overrides remain available as retained evidence.
- Regression: 161 PASS (dashboard preparation, RUN settings preparation and CLI
  admission), TypeScript and targeted ESLint PASS. Tests cover no-home failures,
  pure legacy reads, canonical precedence, invalid writes without migration and
  successful explicit migration. Existing RUN diagnostic matrix: 1 PASS across
  all six read commands; fresh build and two CLI integration scenarios PASS
  (project config/dashboard and legacy RUN timeline). This does not close other
  diagnostic routes.

### Consolidated regression and remaining dd-eval registry audit

- Started one consolidated dd-flow Vitest run after the diagnostic/config fixes:
  `pnpm exec vitest run --pool=forks --no-file-parallelism`, log
  `/tmp/dd-039-consolidated.log`. Result is PENDING, not a release/live PASS.
  Build metadata: package 0.9.0-beta.75, built_at 2026-09-18T15:14:24.570Z.
  Its recorded HEAD 60b05d220e32542b0e4cf38234595fdad51b8e80 does not identify the
  accumulated dirty changes; no published immutable artifact is claimed.
- While the suite runs, source remains unchanged. Read-only dd-eval homes list,
  storage ls/status audited and documented in coverage; baseline homes/storage
  tests: 3 PASS.
- Open concrete mutation findings: homes remove creates registry directory/lock
  before resolving an unknown target; direct homes add accepts a non-string
  label that can make the resulting registry unreadable. Implement shared input
  preparation and read-only remove resolution, rechecking mutable target under
  the existing lock; no new registry/lock mechanism required.

### dd-eval homes mutation preparation

- Confirmed dd-flow source/tests do not import dd-eval's homes module; the
  consolidated dd-flow run remains on unchanged source/build while this
  independent dd-eval fix is tested separately.
- addHome validates root/label/automatic shape and resolves a directory before
  entering updateHomes. Known input-path failures return usage with explicit
  prepare/no_effect/recoverable; unknown storage failures are not reclassified.
- removeHome resolves the supplied ID/path through read-only listHomes before
  mkdir/lock. Under the existing lock it rechecks the same retained ID and root,
  then disables the entry. A concurrently replaced target is a runtime failure,
  not a promise of safe input retry. No new lock or registry abstraction added.
- Verification: 4 PASS (homes/storage), node syntax check and diff check PASS.
  Direct and CLI unknown removal leave `.dd-eval` absent; invalid labels and
  unknown targets preserve existing bytes. Path/ID/repeated removal, physical
  deduplication, automatic registration and corruption preservation still pass.
  Only temporary test fixtures were touched, not the user's registered homes.

### dd-eval shared CLI syntax inventory

- Moved the existing parser/route table into `lib/cli-input.mjs`, shared by the
  executable and tests. All 35 leaf routes are explicit, including canonical
  engine capture, boundary accept and qualification recover. Longest known
  command prefix preserves arity/unknown-argument rejection; service dispatch
  and required/payload checks remain with their existing owners.
- Fixed a parser defect found during extraction: a plain object's __proto__
  setter could swallow an unknown option. Options now use Object.create(null),
  so all supplied keys participate in the existing allowed-option check.
- Every route gets syntax matrix coverage plus actual executable invocation
  proving prototype-like unknown input exits usage/2 without initializing homes.
  The matrix also covers valid option sets, extra/missing command tokens,
  duplicate options and missing option values.
- Verification: 105 PASS (CLI inventory, homes and eval baseline tests); node
  syntax checks and diff check PASS. This is syntax-level completion for the
  current dd-eval command table, not a claim that every payload/effect boundary
  or the overall P1–P8 plan is finished. dd-flow consolidated run remains active
  on unchanged dd-flow sources.

### Canonical build flow-source admission

- Split existing flow-source validation from materialization. canonicalBuild now
  checks the source Git revision/cleanliness, contained pack path and complete
  flow-pack manifest before creating a revision directory or cloning input.
  Materialization consumes the prepared source and retains its post-copy check
  (a source can change after preparation; that is an execution failure).
- Verification: canonical-source-preparation and canonical-managed: 2 PASS.
  Invalid pack/dirty source reject read-only; valid preparation leaves the source
  clean. Existing managed resume/review integration remains green.
- Consolidated dd-flow suite exposed a failing canonical flow CLI integration
  (missing plan in feature workspace). Stopped the verified test runner with
  SIGINT (exit 130) to fix it; no user/E2E processes touched. No full-suite success
  claimed. Its partial log is /tmp/dd-039-consolidated.log.
- Root cause located: readProtocolRuntimeState passes a shallow copy to
  resolveProtocolRuntimeState. normalizeProtocolPlanPath updates that copy,
  whereas scopedProtocol in plans.ts returns the original record and reads its
  stale feature-worktree plan_path. The fixture legitimately writes the canonical
  plan under the stable project root. Fixed using shared resolveProtocolPlanPath
  for protocol reads (required/optional) and dashboard's direct plan queries.
  Explicit repair rereads stored locations before migration; ordinary reads do
  not migrate. Verification: 12 focused tests PASS, then fresh build and formerly
  failing canonical flow CLI integration PASS. Existing fixture unchanged.

### Resource scope preparation completion

- runtime scope status uses a read-only resource snapshot without initializing
  absent homes. A cached owner transaction remains visible; standalone readers
  open SQLite readOnly/query_only. Existing concurrent-registration snapshot
  regression remains intact, rather than weakening consistency to separate reads.
- runtime scope resume now shares full capture/ownership preflight between CLI
  and direct service. Missing/stale source fails before registry creation or
  writer admission. Retained replay precedes source journal reads and does not
  enter a write transaction. Accepted fresh request rechecks mutable authority
  under the existing transaction before retaining the request, without a new lock.
- Verification before final retained-manifest classification adjustment: 197
  PASS across runtime budget, CLI admission, scope resume/control/stop/worker.
  New tests cover no-home reads, uncached persisted status, invalid journal before
  writer admission, and idempotent replay after source journal deletion.
- Retained manifest validation is now explicitly separate from fresh manifest
  input: malformed/missing retained authority is fatal exit 1 without recoverable
  or no_effect hints. Applied to capture, control and both resume paths.
- Final fresh-build verification: 210 PASS across nine suites (scope families,
  CLI admission, protocol transition, merge queue and dashboard preparation),
  build/typecheck/changed-file lint/diff check PASS. Log:
  /tmp/dd-039-scope-final.log. Build metadata: 0.9.0-beta.75,
  built_at 2026-09-18T15:40:42.547Z. Recorded HEAD is
  60b05d220e32542b0e4cf38234595fdad51b8e80, but worktree changes are uncommitted;
  this is not a published immutable artifact or a full-plan/release PASS.
  P1–P8 remain incomplete; the remaining inventory must still be closed.

### PLAN start preparation

- Found reads of accepted protocol ownership/SPECIFY identity and aspect catalog
  after PLAN Work creation. Extracted prepareVnextPlanStart, shared by CLI before
  writer admission/hook lookup and direct service calls. It also checks root Work,
  workspace policy/protocol documents, current running PLAN, prompt/check profile,
  variables/Git and output destinations before materialization.
- Executor consumes prepared identities, catalog, template, variables and parsed
  check profile. It does not reread those source files to render the prompt or
  seed drafts. Existing hook identity and mutable running-Work checks remain at
  execution; no new queue, store or generic lifecycle framework added.
- Targeted regressions: 2 PASS (feature-worktree PLAN; invalid accepted result
  before effects and prepared template after source deletion). The negative case
  covers direct service and CLI; hook stays observed, Work rows unchanged, no
  stage directory. Existing source file restored before successful preparation.
- Full vnext-protocolize integration: 23 PASS, including PLAN/CODE/MERGE, injected
  execution, review-off, feature-worktree and restored starter paths; log:
  /tmp/dd-039-plan-start-integration.log. The final mutable running-PLAN check was
  moved into the existing Work insertion transaction (not duplicated outside it).
  Its additional targeted regression passed in /tmp/dd-039-plan-start-race.log:
  stale prepared start enters the transaction, rejects without a second Work,
  and leaves the competing hook observed. Typecheck/lint/diff checks PASS.
  This does not close the other vNext stage start paths or P1–P8.

### CODE / CODE-REVIEW start and external stage context preparation

- Shared prepare functions now run from CLI before stage admission and as the
  default for direct service starts. CODE reads its template/variables/graph
  before workspace readiness; CODE-REVIEW prepares review groups, Work batch,
  template and accepted checks before mode freezing or Work creation. Executors
  consume prepared data. Existing resume paths remain separate from fresh stage
  attachment; source-repair CODE retains its deliberate attachment exception.
- Reused prepareFlowRunStageAttachment before fresh PLAN/CODE/CODE-REVIEW
  effects. The final attachment still rechecks mutable state. An illegal start
  no longer first creates a directory or freezes review mode.
- External context installation has a read-only preflight shared with CLI
  non-bootstrap starts and direct PLAN/CODE/CODE-REVIEW. Publication repeats only
  the immutable identity check, not an input-error wrapper: a destination that
  breaks after prepare must not be labeled recoverable/no_effect.
- Regression: 36 PASS across vnext-protocolize, code-review-start-preparation and
  stage-context before the CODE extraction (dd-039-stage-start-review.log).
  After extraction, both PLAN→CODE→MERGE integrations PASS, including injected
  execution (dd-039-code-start.log). Missing CODE template is tested through
  direct service and CLI: unchanged RUN, observed hook, no CODE directory.
  Final targeted 23 PASS (dd-039-start-final.log) additionally cover illegal
  CODE-REVIEW transition and late publication error classification.
- Final build, TypeScript check, changed-file lint and diff check PASS. Local
  build timestamp: 2026-09-18T16:07:14.671Z, version 0.9.0-beta.75. Dirty worktree
  contents are included; recorded Git HEAD does not identify these uncommitted
  changes as an immutable release.
- Still IN_PROGRESS: PROTOCOLIZE/PLAN-REVIEW/MERGE start preparation, remaining
  direct-service and retained-artifact cases, controller answer replay and the
  complete P1–P8 route/evidence audit are not closed by these tests. No live E2E
  or release/publication performed.

### PLAN-REVIEW start preparation and pure PLAN validation

- Shared prepareVnextPlanReviewStart now serves CLI pre-admission and direct
  starts. Template, revision, fan-out policy, accepted group/checksum data and
  output destinations are prepared before Work creation. Review-off prepares
  registration items before binding and reuses them during execution. Resumed
  starts read the existing prompt/fanout before binding. A terminal accepted/off
  report is handled before reopening the previous PLAN/CODE batch.
- Regression exposed an additional root cause: validateVnextPlanArtifacts
  implicitly published/regenerated the batch, hiding retained corruption and
  writing from a supposedly read-only preflight. It is now strictly read-only,
  with publishBatch:false internal to the helper. Inspected all source callers:
  only CODE handoff and review-off start use validation; PLAN finish and
  PLAN-REVIEW finish already explicitly publish prepared projections.
- Retained review-off corruption is runtime_artifact_invalid/exit 1, not a
  recoverable caller-file error. Prepared batch registration uses the captured
  items, not a reread of the accepted file. Missing internal prompt is likewise
  runtime_artifact_missing, not ambiguous not_found.
- Verification: 23/23 vnext-protocolize tests PASS after start extraction,
  including direct/CLI missing-template no-effects, prepared-template replacement,
  and terminal replay with deleted batch (/tmp/dd-039-plan-review-start.log).
  The additional review-off negative test initially failed because validation
  repaired the batch; the pure-validation change addresses that demonstrated
  failure, not a hypothetical one. See final targeted result below.
- Final review-off regressions: 2 PASS (both stop targets), including direct
  service and CLI rejection, unchanged corrupt bytes/RUN/hook, no review-stage
  directory and successful continuation after restoring the accepted batch;
  /tmp/dd-039-review-off-preparation-final.log. Final TypeScript, changed-file
  lint, diff check and local build PASS (/tmp/dd-039-plan-review-build-final.log).
- Remaining original scope is unchanged: PROTOCOLIZE/MERGE start preparation,
  remaining direct-service/retained-artifact audit, controller-answer replay and
  complete command-by-command P1–P8 evidence. Controller answer inspection
  confirms it currently reads answer bytes before prior-operation lookup; fixing
  replay requires an explicit stable request identity, not silently masking raw
  input conflicts. No live E2E, publishing or commits were performed.

### PROTOCOLIZE packet and stage admission

- Split read-only prepareVnextProtocolizeArtifacts from the historically named
  prepareVnextProtocolize materializer. The latter is explicitly execution:
  files, workspace and timeline publication are not called "non-productive".
  Template/catalog, accepted SPECIFY obligations, handoff and output targets
  are captured before any materialization; rendering consumes captured sources.
- Shared prepareVnextProtocolizeStart runs before CLI hook claim and defaults
  direct service calls through the same path. Existing retained context must
  contain a real frozen handoff; malformed context no longer silently bypasses
  session policy. Missing context prepares a new packet in memory. Fresh stage
  applicability is checked before effects; same/new Session checks occur after
  native hook identity is available but before workspace/context publication.
- Workspace routing now has a read-only plan: retained receipt, direct checkout
  or feature worktree. Feature branch/base/destination validation reuses the
  worktree service. Shared bootstrap-source validation checks the project-owned
  include/config files before checkout creation; target existence is still
  verified during actual bootstrap after creation. Session mode is resolved
  before provisioning, not after rebind. Internal route conflicts remain fatal
  workspace_route_invalid rather than a model-correctable CLI typo.
- Regressions cover missing template through direct service and CLI, unchanged
  RUN/hook/directory, wrong Session before provisioning, captured template after
  source deletion and malformed resumed context. Feature-worktree regression
  checks missing bootstrap input before rebind/publication and then successful
  continuation. Verification: 31 PASS across vnext-protocolize, retained-artifact
  and worktree-preparation suites (/tmp/dd-039-protocolize-start.log). Additional
  final feature-route regression PASS, including an already-existing branch
  reported as fatal workspace_route_invalid without recoverable metadata
  (/tmp/dd-039-protocolize-route-final.log). TypeScript, changed-file lint, diff
  check and local build PASS; built_at 2026-09-18T16:25:32.756Z. This is a dirty
  local build, not a published immutable release or full-plan qualification.
- Original plan stays IN_PROGRESS: MERGE start, controller answer replay,
  remaining payload/state/direct-service inventory and full P1–P8 audit are not
  closed by the stage-start changes. No live E2E or publication was run.

### MERGE and SPECIFY start: remaining late reads

- MERGE now shares `prepareVnextMergeStart` between CLI and direct service:
  request/Work/stage applicability, target lane, frozen checks/settings, prompt
  and output/context preparation precede effects. Completed request returns
  before opening the old gate. Native hook validation precedes directory/lane
  creation. Git cleanliness and target HEAD remain under the acquired lane:
  checking a workspace owned by another merger before waiting would reject
  valid queued work. Mutable generation is rechecked after waiting.
- Fixed a hidden effect in CODE prepare: `codeWorkGraph` renders managed
  commands and may issue invocation IDs. It now runs only during execution,
  after workspace readiness. The managed readonly-scope regression proves
  prepare neither writes invocations nor requires preissued child commands.
- Both PLAN→CODE→MERGE parameterized integrations PASS, including malformed
  gate rejection via direct service and CLI without request/hook/directory
  mutation, gate removal after preparation, and existing crash-recovery paths.
  Evidence: `/tmp/dd-039-merge-start.log` (2 PASS).
- SPECIFY now captures project grounding and effective stage handoff before
  creating RUN/Work or writing intake. Existing output targets and installed
  external context are prepared before hook claim; a fresh home parent is
  checked without creation. The temporary write/delete probe was removed.
  Shared file/directory destination validation remains read-only; actual late
  filesystem failures still belong to execution, not safe input retry.
- Direct SPECIFY checks native hook identity before creating a RUN and rechecks
  recovery for an existing RUN. Execution consumes prepared template, intake,
  grounding and profile even if original sources disappear. Tests cover blocked
  fresh home, blocked existing prompt, no prepare writes/probes and missing-hook
  rejection before RUN creation. Verification: 18 PASS in
  `/tmp/dd-039-specify-start-final.log`, 1 additional fresh-home regression PASS
  in `/tmp/dd-039-specify-output.log`, and 19 input-preparation tests PASS in
  `/tmp/dd-039-output-preparation.log`. Final typecheck, changed-file lint and
  local build PASS (`/tmp/dd-039-start-build-final.log`); diff checks PASS in
  both repositories. This is a dirty local artifact, not release evidence.
- Not a full-plan completion: controller-answer replay contract, outstanding
  command payload/state/direct-service inventory, legacy paths and combined
  P1–P8 verification remain open. No live E2E, publication or commit was made.
  Follow-up source inspection confirms legacy `startStage` still attaches the
  stage before `stagePreflight` writes/renames a probe and before prompt-source
  reads. Its current intake/directory test does not cover these later effects;
  migrate that path through shared read-only preparation, not another probe.

### Legacy start and controller-answer replay completion

- Legacy start now uses one shared prepare for CLI and direct calls. It checks
  retained stage transition, output destinations, protocol state, memory-bank
  access, canonical/project instruction sources, and bootstrap RUN profile
  before registration or stage attachment. Prompt rendering consumes captured
  instruction bytes. The old temporary write/rename/delete permission probe is
  removed; it provided no race guarantee and ran after mutation.
- Regression covers direct and CLI rejection of an occupied destination and an
  unreadable instruction path with unchanged RUN/zero SQL writes, then source
  deletion after prepare and successful consumption of captured bytes. Legacy
  bootstrap input/directory checks remain green. The isolated mb-upgrade CLI
  stage scenario also passes. Evidence: `/tmp/dd-039-legacy-start-latest.log`,
  `/tmp/dd-039-legacy-upgrade-cli.log`.
- HITL answer replay now resolves an accepted operation by project/RUN/request
  before opening `--answer-file`. Same request and pause returns the retained
  status after file deletion, content change, or controller completion; using
  the same request for another pause remains a conflict. New acceptance still
  hashes and persists the prepared bytes and rechecks mutable applicability in
  its transaction. Direct answer regression: 8 PASS in
  `/tmp/dd-039-controller-answer-final.log`; the rebuilt real CLI/controller
  regression also passes in `/tmp/dd-039-controller-answer-cli-rebuilt.log`.

### MERGE finish and retained eval control preparation

- MERGE finish now uses shared preparation for direct and CLI calls. Request,
  Work and RUN identity, apply receipt, unresolved conflicts, semantic result
  bytes/schema/outcome, frozen gate and optional retry receipt are validated
  before the first lane heartbeat, bootstrap, retry timeline event or check.
  Execute settles Work from the captured result bytes instead of reopening the
  mutable source after checks and Git delivery. Terminal replay still returns
  without requiring the old result file.
- The parameterized PLAN→CODE→MERGE integration includes deletion of the
  result file after prepare and before execute; the prepared branch must finish
  from the accepted bytes while preserving existing crash recovery. Evidence:
  `/tmp/dd-039-merge-finish.log`.
- dd-eval operator control now validates the retained RUN identity and unique
  execution identities before appending `control.requested`. A malformed
  retained execution no longer leaves a durable control intent before the
  caller learns that its scope is unusable. Focused evidence:
  `/tmp/dd-039-eval-control-prepare.log`.
- The same replay-before-input audit found CODE and CODE-REVIEW terminal stage
  finishes being prepared by the CLI before their services could return a
  retained outcome. CLI preparation now recognizes only a retained `done`
  stage with its report and skips transient verification/decision reads; the
  service then performs its existing recovery settlement. The review-off
  integration covers CODE replay after deleting its verification file and the
  no-file CODE-REVIEW replay. Evidence:
  `/tmp/dd-039-terminal-stage-replay.log` (2 PASS).
- RUN recovery capture and resume now share direct/CLI preparation. Capture
  validates the sealed snapshot before its binding UPDATE. Resume validates all
  replacement daemon/harness/native-session identities and the immutable
  snapshot before opening the writer transaction, then rechecks mutable guard
  state inside the transaction. Rendering the managed acceptance command stays
  in execute because it may issue lifecycle authority. The focused recovery
  regression passes in `/tmp/dd-039-recovery-prepare-final.log`.
- dd-eval fork replay now reads an existing target receipt using only stable
  scalar request identity before reopening the source manifest/checkpoint. A
  successfully prepared fork therefore remains replayable after its source EVAL
  is archived. New forks still validate source definition, fixtures, baseline
  and engine before target registration or creation. The complete fork suite is
  12 PASS in `/tmp/dd-039-fork-full.log`.

### Final P1–P8 qualification

- The route inventories are authoritative and executable: all 208 dd-flow leaf
  routes and all 35 dd-eval leaf routes reject unknown, missing, duplicate and
  excess arguments before writable initialization. Command-family coverage maps
  payload-bearing mutations to shared preparation or records a read-only/no-payload
  route; direct service callers use the same preparation.
- Final dd-flow build, typecheck, lint and diff check pass. The single full test
  run completed 1496 functional tests successfully. Its only two failures were
  post-test `ENOTEMPTY` races after the expected `recovery_required` result; the
  common fixture cleanup now uses bounded asynchronous removal, and both affected
  cases pass together in the focused rerun (2 PASS, 6 filtered skips). No product
  assertion failed and no second full product gate was run merely to repeat the
  same 39-minute matrix.
- Final dd-eval full test run passes: 315 PASS, 8 explicitly live-only SKIP, zero
  failures/cancellations. Two load-sensitive integration budgets found by the
  first run were increased without changing production behavior; both scenarios
  also pass in isolation.
- No live E2E, publication, commit, push, release or user-data cleanup was
  performed. Those are deliberately outside this implementation qualification.
