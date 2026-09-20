# Fix 043: служебные параметры без передачи через модель

Дата: 2026-09-20. Статус: реализовано в dd-flow-cli 0.9.0-beta.84;
ожидает подтверждения чистым E2E.
Репозитории: dd-flow-cli и dd-eval. Продолжает 041 и 042.

## Причина и факты

cp-123 / EVAL-20260920143702-c788d54b остановился до входа в specify.
Контроллер выдал context-sha256 с окончанием `615965a9babdd07a0fce0`;
в фактическом вызове было `615965965a9babdd07a0fce0`.
PreToolUse успешно завершился и создал hook_events.id=1, но match_key=null.
Выданная lifecycle_invocation осталась issued. CLI сообщила
invocation_receipt_missing, контроллер — stage_entry_nonprogressing.
Это не доказательство отсутствия доставки хука: фактический вызов сохранён.

Первопричина: внутреннее назначение преобразуется в длинную shell-команду,
затем модель должна восстановить её машинные аргументы. Полное совпадение
аргументов используется раньше предметной валидации. Сокращение ID и алиасы
уменьшают длину, но сохраняют ненужный перенос данных через модель.

## Карта исследования

Пути src/test ниже относятся к dd-flow-cli; lib/specs — к dd-eval.
Только cp-123 — воспроизведённое падение; остальные строки — обнаруженные
источники того же риска либо границы, которые нельзя случайно сломать.

| Место | Что обнаружено | Доработка |
|---|---|---|
| src/services/run-controller.ts:553 | Prompt содержит context file/hash, project root, response file и RUN | Хранить полный вызов, публиковать минимальный вызов назначения |
| src/services/lifecycle-invocations.ts: fingerprint, withoutInvocationId, publicInvocationCommand, managedLifecycleCommand | Полная команда уже сохраняется; наружу убирается invocation-id, остальные машинные параметры остаются | Общая проекция публичных аргументов и восстановление приватных из сохранённого назначения |
| src/cli/run-cli.ts:353–370, stage start handlers около 1122/1558 | Receipt lookup предшествует проверке пары context-file/hash; только alias validation вынесена раньше | Общий prepare: распознать вызов, установить native identity, выбрать назначение, восстановить аргументы, проверить вход, затем claim/execute |
| src/services/hooks.ts: stageStartMatchKey, lifecycleMatchKey, receipt claim/replay | Контекстный hash входит в matching | Native receipt сохраняет факты независимо от совпадения с назначением; связывание с назначением делает CLI |
| src/services/stage-context.ts | Проверяет файл по expected hash | Сохранить проверку, expected брать из назначения, а не считать заново вместо проверки |
| lib/runner.mjs: entryLauncher, вызов около 2430 | Отдельный launcher передаёт те же file/hash и env paths; используется в квалификационном пути | Перевести на тот же prepare/assignment контракт, включая bootstrap; не оставлять conformance на старом интерфейсе |
| src/services/work-registry.ts: workStartCommand, render prompt, work finish/fail | Выданы Work, project root, известны result_path/schema в work_sessions | Start оставляет WRK для выбора из fanout; finish/fail берут Work из однозначной текущей привязки, принимают семантический stdin |
| src/services/vnext-specify.ts, vnext-protocolize.ts, vnext-plan.ts, vnext-plan-review.ts, vnext-code.ts, vnext-code-review.ts | Finish/next/validate commands повторяют RUN, stage и пути известных артефактов | Перевести renderers на общую проекцию; известные result/decision/verification пути получать из назначения; выбор конкретного плана/артефакта сохранять, если их несколько |
| src/services/vnext-merge.ts: applyCommand, finishCommand, mergePrompt | MRG, executor Work, RUN и project root уже известны, apply/repair обходят managed renderer | Общие defaults по текущему merge Work/request, одинаковые правила для apply/finish/repair/retry |
| src/services/stage-pause.ts: pause/resume templates | Повторяются RUN/stage/Work, вопрос/ответ действительно вводит модель | Scope из назначения; вопрос/ответ — stdin; не выбирать произвольную последнюю pause |
| src/services/controller-fanout.ts, run-controller-recovery.ts | Child assignments и продолжения должны сохранять правильного адресата | Short WRK нужен при выборе/первом start ребёнка; не наследовать текущий Work родителя как Work ребёнка |
| lib/managed-flow-client.mjs, run-controller-adapter.ts | Хеши, request/session IDs передаются кодом напрямую | Оставить machine API: здесь нет переписывания моделью |
| lib/runner.mjs: fork next_command | Оператору возвращается длинная команда с уже сохранённым fork intent | Для продолжения использовать сохранённый intent и короткий scoped target; явные override сохранить и проверять |
| src/cli/command-inputs.ts, help.ts, input-preparation.ts; тесты и примеры | Описывают обязательность/форматы параметров | Обновить одновременно с runtime; различать managed defaults и самостоятельный CLI |

Обследованы генераторы команд, lifecycle admission, hook matching, основные
стадии, Work/MERGE/HITL, launch/recovery/fork и прямые machine вызовы eval.
Это карта найденных классов, не утверждение о доказанном отсутствии всех
дефектов репозиториев. При реализации каждый renderer и его callers сверить
с матрицей ниже, включая команды внутри JSON-пакетов и retry/error responses.

## Контракт и минимальный дизайн

1. Переиспользовать lifecycle_invocations и сохранённый controller/Work context.
   Не добавлять новый реестр, универсальный command bus или новый opaque ID
   для модели. Если существующей записи не хватает адресата child session,
   расширить её минимальным полем/связью с dispatch; не выводить адресата из latest.
2. Одна таблица правил для lifecycle операций определяет: смысловые входы,
   селекторы целей, runtime-owned аргументы. Ею пользуются public renderer и
   CLI resolver. Полный машинный вызов сохраняется для аудита и совместимости.
3. Runtime-owned: context file/hash, generation, внутренние invocation/request
   IDs, известные project/RUN roots, output response destination, однозначные
   stage/Work/MRG bindings. Не удалять семантические решения, result JSON,
   вопрос/ответ, reason и выбор из нескольких целей.
4. Публичные формы: `stage start --stage specify`, `stage finish`,
   `work start WRK-003`, `work finish --result-stdin`,
   `stage pause --question-stdin`, `stage resume --answer-stdin`.
   Эти формы реализованы общей проекцией retained lifecycle invocation. Stage/WRK оставлять
   там, где они различают допустимые назначения; не требовать их повторно,
   если session binding даёт ровно одну цель.
5. CLI выбирает только актуальное назначение внутри проверенных project,
   RUN, generation, native session/parent/dispatch и операции. Ноль или
   несколько кандидатов — понятная no_effect ошибка; никакого first/latest.
   Полный fingerprint остаётся внутренней проверкой сохранённой операции,
   не требованием к публичному argv.
6. Явный параметр не должен молча подменяться сохранённым: совпадающий можно
   принять для совместимости, конфликтующий отклонить до эффектов. Вне
   managed session standalone CLI сохраняет явные аргументы и валидацию.
7. Hook фиксирует native identity, tool event и исходный вызов, подтверждает
   commit записи перед возвратом. Не выбирает контекст стадии, не запускает
   бизнес-операции. updatedInput не является единственным каналом доставки.
   Различать отсутствующий receipt, несовпавший вызов, stale assignment и
   неоднозначность. Инфраструктурная ошибка не становится retryable.
8. До эффектов проверить восстановленные файлы, schema и целостность, а также
   ввод модели. Диагностическая запись допустима; stage/work/check execution
   и расходование чужого receipt при ошибке запрещены. Повтор с исправленным
   вводом использует новый native event и существующий механизм no_effect retry.
9. Путь сохранённого ответа возвращается CLI. При усечении вывода агент читает
   этот путь; если нужен короткий указатель, использовать существующие aliases.
   Не требовать, чтобы модель заранее переписывала output destination.
10. Новые runtime-owned поля нельзя автоматически принимать из semantic JSON.
    В схемах результатов провести ревизию identity/hash/path полей: удалять
    обязательное эхо известной идентичности; ссылки на выбранные evidence,
    obligations и semantic findings оставлять. Недостающую служебную оболочку
    CLI материализует из привязки до проверки итогового канонического артефакта.

## Реализация по шагам

1. Зафиксировать regression cp-123 с реальным RUN alias и native receipt.
   Составить таблицу всех callers managedLifecycleCommand и bypass renderers;
   для каждой операции классифицировать каждый параметр по контракту выше.
2. Добавить минимальную общую проекцию/разрешение в существующий lifecycle
   модуль и command-inputs; сначала stage start. Проверить bootstrap отдельно:
   до создания RUN использовать prepared assignment/dispatch, а не угадывать RUN.
3. Разделить факт доставки hook и admission команды. В run-cli убрать раннее
   обобщение всех несовпадений в invocation_receipt_missing. Проверить все
   adapters, использующие hooks.ts, включая детей без собственного native hook:
   сохранить существующий доказанный способ регистрации, не вводить исключения.
4. Подключить весь stage/work/HITL/MERGE набор и recovery/retry continuations.
   Детерминированные пути известных артефактов подставлять в CLI. Stdin остаётся
   для новых результатов; не читать молча старый result.json при новом attempt.
5. Обновить prompts/help/examples и активные flow/memory-bank шаблоны по поиску
   соответствующих команд. Убрать требования копировать checksum/служебные IDs,
   дубли путей и инструкции «вычисли hash». Оставить явное описание semantic
   stdin, выбора WRK, read-response, no_effect retry и остановки при infra error.
   Исторические отчёты/артефакты не переписывать. Если меняется flow pack,
   честно обновить его checkpoint identity, не обозначать изменения как engine-only.
6. dd-eval: единый entry контракт для scored/focused/conformance, machine
   launch API оставить. Дополнить runbook подготовкой installed engine checksum
   (не npm tarball checksum) и полным переносом конфигурации agent-profiles:
   эти две ошибки подготовки повторились при cp-123 и не должны маскировать
   проверку основного исправления.
7. Профильные тесты и ревью выполнены. Отдельная подготовка опубликованного
   engine и чистого E2E выполняется после подтверждения npm tuple.

## Реализовано

- `lifecycle_invocations` хранит полный вызов, а model-facing команда строится
  общей публичной проекцией; новый реестр и новый opaque ID не добавлялись.
- Stage start/finish, Work start/finish/fail, HITL pause/resume, recovery и
  MERGE apply/repair скрывают принадлежащие runtime пути и идентичность.
- CLI после native receipt восстанавливает retained argv и только затем запускает
  существующую подготовку/валидацию. Явный конфликт private аргумента отклоняется
  как recoverable `no_effect`, без эффектов и без подмены.
- Controller больше не публикует context SHA, context/response paths и RUN в
  первой команде; путь полного пакета читается из результата CLI.
- Eval больше не генерирует параллельный длинный launcher для preflight.
- Прямые machine-to-machine вызовы, диагностические read-команды и смысловые
  селекторы оставлены явными: они не переписываются моделью как retained
  lifecycle assignment и не должны получать неявный ambient target.

## Мысленная трассировка целевого поведения

1. Eval фиксирует inputs и передаёт context controller напрямую. Controller
   проверяет bytes/hash и сохраняет назначение specify и место ответа.
2. Модель получает короткий stage start. Native hook сохраняет event/session
   и возвращается после commit; на этом его работа заканчивается.
3. CLI связывает текущий native event с session/dispatch. Находит ровно одно
   разрешённое назначение; подставляет сохранённый context/hash и RUN.
4. Prepare читает context и проверяет сохранённый hash. Изменённый файл даёт
   context_checksum_mismatch; неверный ввод — input error; потерянный hook —
   infrastructure error. Ни один из этих исходов не запускает stage.
5. После проверки claim и запуск стадии сохраняют исходный и resolved argv
   в существующей диагностике. Ответ содержит prompt и путь полного пакета.
6. При fanout родитель получает WRK selectors. Ребёнок начинает свой WRK;
   после binding его finish уже однозначен. Соседняя/родительская работа не
   может быть выбрана только потому, что находится в том же RUN.
7. Результат ребёнка проходит schema/semantic validation. Ошибка JSON допускает
   новый вызов без изменения Work; успешный finish выполняет обычные checks.
8. HITL сохраняет вопрос; eval отправляет fixture answer кодом; resume выбирает
   именно ожидающую pause текущей привязки. Несколько pause требуют выбора.
9. MERGE получает свой request из executor Work. Retry конкретного failed check
   сохраняет явный выбор при нескольких failures и смысловой reason.
10. После fork/recovery generation меняется. Старое назначение/receipt не подходит;
    новый controller выдаёт назначения с новыми путями. Старые prompt files не
    становятся источником authority. В standalone CLI оператор задаёт цели явно.

## Проверки готовности

- Поведенческий regression: короткий stage start проходит с реальным hook,
  без context-file/hash/response-file в prompt; private checksum проверяется.
- Malformed legacy hash/явный конфликт → input no_effect, не receipt_missing;
  отсутствующий hook → infrastructure error, без автоматического retry.
- Два RUN, два готовых Work, parent/child и stale generation не смешиваются;
  ambiguous lookup не выбирает последнюю запись.
- Ошибочный JSON/file/schema не запускает stage/checks; исправленный повтор
  проходит с новым событием; replay не выполняет работу повторно.
- Stage start/finish, Work start/finish/fail, HITL, MERGE apply/finish/repair и
  retry покрыты публичным коротким интерфейсом и standalone compatibility.
- Все adapter ingress используют один контракт; нормализация алиасов сохраняется.
- Scored и conformance prompts не содержат параметров private назначения;
  прямые machine API тесты подтверждают сохранение checksum/version контроля.
- Полный ответ доступен после truncation без повторного stage start.
- В тестах lifecycle-invocations, stage-lifecycle-ownership, merge-server,
  run-controller и dd-eval eval/managed-flow-client обновить контрактные ожидания;
  проверять эффекты/изоляцию, а не только текст snapshot.
- Перед релизом поиск всех model-facing command/next/retry/schema примеров:
  каждый оставшийся длинный ID/hash обязан иметь объяснение, почему он ввод
  модели или явный операторский выбор. Известные служебные значения не копируются.
