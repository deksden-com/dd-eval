# FIX-041 — Контекстные команды CLI и внутренние lifecycle ID

Статус: реализовано; unit/integration gate пройден, живое подтверждение выполняется отдельным E2E-запуском.
Основание: CP-119, EVAL-20260919115756-b5b13f83, WRK-017-code-review-3.

## Подтверждённая причина

Runtime выдал `506c3ee3-c36c-4622-a1fa-25586fec1ede`; агент передал
`506c3ee3-c36c-4622-a1fa-25586fec1eede`. Правильная строка осталась в SQLite
в состоянии issued, без event_key/outcome. CLI завершилась до исполнения.
`run-cli.ts` вызывает lifecycleInvocationScope до prepare; load бросает
invocation_unknown с no_effect, но без recoverable/retry_command.
Инструкция требует остановиться при такой ошибке. Завершившаяся сессия без
Work-result вызвала execution_ended_without_work_result и остановку EVAL.
Нельзя объявлять подготовленный моделью pass принятым результатом review.

## Исследованная поверхность и места изменения

Все пути dd-flow ниже относительно dd-flow-cli; dd-eval — относительно этого репозитория.

| Участок | Наблюдение | Изменение |
|---|---|---|
| src/cli/run-cli.ts: routing, databaseModeForCommand, prepareCliInput | Scope и режим БД зависят от наличия invocation-id; ошибка ID предшествует prepare | Определять managed context независимо от публичного ID; сохранять read-existing/no-migration до admission |
| src/cli/command-inputs.ts | Общий реестр синтаксиса, но нет типизации ссылок/путей; stage-команды требуют project-root/RUN | Расширить существующий реестр метаданными контекстных параметров; не заводить второй реестр команд |
| src/services/lifecycle-invocations.ts | Issuance, hook receipt, fingerprint, retries, replay завязаны на UUID и буквальные argv | Сохранить внутренние attempts/CAS; отделить публичный render от внутреннего admission; нормализовать refs до сравнения |
| src/services/lifecycle-command.ts; src/harness-runtime/lib/native-hook-command.* | Парсинг нативного shell и lifecycle-команд | Признать короткие команды; hook сохраняет native identity и исходный вызов, не валидирует пользовательские аргументы |
| src/services/hooks.ts; managed-daemon-binding.ts; run-controller-adapter.ts; harness-adapter.ts | Уже есть native session/root/daemon binding | Переиспользовать источник идентичности; env-подсказка не заменяет native receipt |
| src/services/runs.ts: resolveRun | RUN short_id уже ограничен project_id | Переиспользовать; при managed context проверять также текущий RUN |
| src/services/work-registry.ts: requireWork/shortWorkId/start/finish/fail/repair | Короткий WRK ищется по всей БД; вывод уже содержит short_id | Передавать project/RUN scope в общий resolver, проверить всех вызывающих; full ID тоже проверять на принадлежность scope |
| src/storage/paths.ts | Есть canonicalPath/assertPathWithin и run:// ссылки | Переиспользовать containment для фиксированных @алиасов; не заменять строки во всём JSON/тексте |
| src/services/stage-context.ts и vnext-{specify,protocolize,plan,plan-review,code,code-review,merge}.ts | Команды создаются на каждой стадии | Все start/finish, retry, repair, next и handoff выводить общим renderer |
| src/services/stage-pause.ts, stage-blocker.ts, run-recovery.ts, runs.ts, merge-server.ts, run-controller.ts | Отдельные управляющие/восстановительные пути | Учитывать контекст и полные операторские команды; не сокращать away request/recovery identity |
| src/services/controller-fanout.ts, vnext-fanout.ts | Native completed не означает Work completed | Сохранить проверку; дать структурированную причину CLI rejection вместо одного общего reconciliation error |
| dd-eval/bin/dd-eval.mjs, lib/cli-input.mjs | --eval принимает путь; простой общий inventory | В одном prepare-шаге разрешать EVAL ID в явно выбранном home и @eval из привязанного контекста |
| dd-eval/lib/runner.mjs, managed-flow-client.mjs, operation-context.mjs, eval-resume-worker.mjs | Отдельные operator/control/fork/worker пути | Внутренние вызовы передают канонические ссылки; managed env передаётся централизованно; fork получает новый контекст |

При реализации для каждой строки выполнить поиск всех callers, а для CLI —
покрыть каждую запись обоих commandInputs классификацией: contextual entity,
filesystem path, native handle, opaque technical ID, ordinary value.
Это критерий полноты внедрения, а не утверждение о построчном аудите всех модулей.

## Целевой контракт

1. Модель получает `dd-flow work finish WRK-017 --result-stdin`, без UUID,
   inline DD_FLOW_INVOCATION_SCOPE и абсолютного пути engine.
2. RUN может быть опущен только при однозначной привязке. Work оставляем
   явным: он полезен при делегировании и проверке намерения.
3. RUN/PRJ/WRK используют существующие короткие идентификаторы. RCP-NNN
   разрешается только внутри заданного RUN через существующее local_id.
   Полные ID поддерживаются; persisted JSON и evidence хранят канонические ID.
4. Полные native session/tool handles сохраняются для вызовов нативных инструментов.
   Внутренние SES/WS/DRV не выдавать за native handle. Новых сокращённых
   идентификаторов для каждого технического объекта не вводить.
5. Request IDs операторских stop/resume/fork остаются явными ключами
   идемпотентности. Нельзя автоматически создавать новый ключ на каждом повторе.
6. Для ручного вызова без managed context сохраняется полный явный синтаксис.
   Никогда не выбирать последний RUN/EVAL или единственную глобальную запись
   как неявное разрешение на мутацию.

## Реализация по зависимостям

### 1. Единый prepare контекста и ссылок

- Расширить существующую подготовку CLI: parse -> контекст read-only ->
  канонические entity refs/path args -> полная проверка входов -> admission -> execute.
- Приоритет: явная ссылка проверяется против managed binding; конфликт является
  ошибкой, а не переключением чужого RUN. В unmanaged режиме explicit scope обязателен.
- Синтаксис с необязательным RUN включать только в выбранных stage/status/repair
  routes. Не делать глобально все обязательные аргументы необязательными.
- Нормализовать positional Work/RUN, --run/parent/work/origin-work/on,
  --from-check/retry-check и прочие entity-поля согласно inventory, включая repeatable.
- Проверить прямые service callers: resolver не должен оставлять обход CLI
  с глобальным неоднозначным разрешением. Storage API принимает полные ID.
- Не глотать ambiguity/context errors в resolveProjectRootBeforeRouting catch.
  Отсутствие контекста и повреждение/конфликт контекста — разные исходы.

### 2. Убрать invocation UUID из model-facing команд

- Сохранить таблицу attempts, внутренний ID, generation, ownership и CAS.
- Вынести представление команды из issuance: model-facing команда короткая;
  legacy/operator/internal представление допускает явный ID.
- CLI находит разрешённую попытку по канонической операции/target,
  RUN generation и подтверждённому native caller. Первый work start ещё не
  имеет work_session: использовать parent/root binding и выданное assignment.
- Нельзя использовать «последний receipt этой сессии» при параллельных tool calls.
  Сопоставлять исходную команду с записанным native tool-call receipt; при нескольких
  кандидатах возвращать ambiguity до исполнения. Явный старый invocation-id
  остаётся совместимым fallback для таких контекстов, пока нет однозначной привязки.
- Hook пишет native факты и подтверждает их сохранение до возврата. Он не
  выбирает бизнес-операцию, не выполняет finish и не исправляет CLI arguments.
  Не полагаться на updatedInput или экспорт env из дочернего hook-процесса.
- Прежде чем включать короткие команды по умолчанию, экспериментом проверить
  receipt correlation для первого child start, finish, двух concurrent вызовов
  и повторного вызова в той же сессии на Codex/ZCode. Если текущих данных
  недостаточно, добавить только transport correlation в существующий adapter
  contract; не компенсировать недостаток эвристикой поиска в БД.
- Settled replay возвращает сохранённый результат. Executing/unknown не исполняется
  повторно. Исправление no-effect создаёт/выбирает явно разрешённую successor attempt;
  идентичная публичная команда не должна сама означать новую бизнес-попытку.
- Deadline запускается при admission, а не во время длительного написания результата.

### 3. Исправляемые ошибки CLI

- Проверять ID format, route, aliases, пути, JSON/schema и applicability до effects.
- Для legacy invocation_unknown: no_effect; если исходная команда однозначно
  восстанавливается из проверенного binding/operation/target — вернуть retry_command
  и recoverable=true. Не исправлять UUID по расстоянию строк.
- Если доказанного кандидата нет, дать диагностическую ошибку с причиной;
  нельзя превращать любой unknown ID в permission на новый execution.
- Сохранять input rejection отдельно от принятого бизнес-результата. Controller
  должен видеть конкретный rejected call; no-effect ошибка не означает Work complete.
- Общие инструкции всех адаптеров разрешают исправленный retry после no_effect;
  hook/transport failure и unknown effect требуют остановки/reconciliation.
- Результат на stdin не должен теряться из-за принудительного завершения native
  сессии: основной путь — немедленное исправление в той же сессии. Не добавлять
  автоматическое принятие результата из свободного текста или журналов.

### 4. Фиксированные алиасы путей

- `@project`, `@workspace`, `@run`; в dd-eval дополнительно `@eval`.
  Алиас действует только в объявленных path-параметрах CLI и допускает `/relative`.
- Использовать canonicalPath/assertPathWithin, включая symlink и будущий output.
  `@run/../other`, неизвестный alias и отсутствие context возвращают prepare error.
- Никакой замены в task text, shell scripts, arbitrary JSON, URLs, model/profile
  names или evidence_refs. Существующий run:// остаётся форматом evidence.
- В prompt показывать mapping alias -> absolute root и пояснение, что shell/cat/rg
  не понимают @alias. Для обычных инструментов использовать относительные пути/cwd.
- Не переиспользовать родительский @run/@workspace после fork; binder строит значения
  для нового RUN. Исторические snapshots остаются неизменными.

### 5. dd-eval и генераторы инструкций

- Разрешать --eval EVAL-... относительно явно заданного DD_EVAL_HOME с проверкой
  manifest.run_id. Полный путь остаётся поддержан. Не вводить EVAL-001 с новой БД
  alias-реестра; @eval покрывает текущий запуск.
- Операторские fork/control/recover требуют явно выбранного EVAL или надёжно
  привязанного контекста; никакого latest. Checkpoint --from пока оставить явным,
  отображать готовую команду из checkpoints, не выбирать checkpoint по названию стадии.
- До shorten renderer обеспечить наследование PATH, pinned engine/home/resource
  context в root/child/reviewer/repair/judge. Проверить дочерние env отдельно.
- Проверить генераторы стадий, Work packets, retry/recovery overlays, help,
  fixtures и runbooks. Для всех поддерживаемых адаптеров пройти один общий контракт;
  adapter-specific остаются только transport/native tool инструкции.
- Потребители full ID JSON не ломать: short_id/короткая command — presentation,
  identity в receipts, checkpoints, comparisons и session registry — canonical.

### 6. Промпты и примеры — обязательная часть поставки

- Обновить исходные flow/memory-bank шаблоны и runtime-вставки одновременно:
  stage prompts, Work start/finish packets, coordinator delegation, reviewer,
  repair, HITL pause/resume, continuation и recovery overlays. Найти источник
  поставляемого flow pack: изменения только в локальной копии .memory-bank
  недостаточны; новый checkpoint должен использовать обновлённый пакет.
- В каждом свежем контексте, включая fork_turns=none, дать компактный блок:
  текущий RUN, явный Work, доступные path aliases с абсолютными корнями,
  правило автоматической привязки CLI и границы записи. Не рассчитывать,
  что ребёнок наследует объяснения координатора.
- Заменить длинные model-facing примеры на команды общего renderer:
  `dd-flow work start WRK-017`,
  `dd-flow work finish WRK-017 --result-stdin`,
  `dd-flow stage finish --stage plan --result-file @run/<actual-result-file>`.
  Последний пример при генерации получает реальное имя файла, допустимое для
  стадии; нельзя отдавать модели шаблон с незаполненными placeholders.
  Для stdin дать полный валидный пример JSON/передачи stdin по схеме роли,
  согласованный с поддерживаемым shell parser, а не только название параметра.
- Добавить примеры no-effect rejection -> исправление входа -> retry_command;
  alias path -> разрешённый CLI input; отсутствие контекста -> явные параметры.
  Показать разницу между коротким Work ID и настоящим native child handle.
- Удалить из стандартных managed prompts требования переписывать invocation UUID,
  вручную выставлять DD_FLOW_INVOCATION_SCOPE/home, повторяющиеся абсолютные
  engine paths и инструкции о служебных параметрах, которые CLI теперь выводит сама.
  Legacy explicit-ID синтаксис оставить в справке совместимости/диагностики,
  а не как конкурирующий основной пример для модели.
- Переписать противоречащие новому контракту формулировки «копируй всю длинную
  команду без изменений»: следовать выданной операции/target и retry_command;
  разрешённые значения result/file задаются по контракту команды. Не ослаблять
  запреты на самостоятельный старт следующей стадии или чужого Work.
- Сохранить инструкции о hook/transport failure, unknown effect, ownership,
  ожидании дочерних агентов и обязательном принятии Work result. Удаление UUID
  не означает возможность повторять любой сбой или считать финальный текст receipt.
- Алиасы объяснять только там, где они доступны. Не использовать @run в cat/rg,
  shell cwd или evidence_refs; там остаются обычные пути и run:// соответственно.
- Help, ошибки CLI, runbooks и новые примеры должны соответствовать тем же правилам.
  Исторические transcripts/snapshots/receipts не переписывать.
- Приёмка: отрендерить реальные packets всех стадий и ролей для поддерживаемых
  адаптеров; проверить отсутствие старых предписаний и незаполненных placeholders.
  Выполнить примеры через CLI в тестовом контексте, включая fresh child и retry.
  Тестировать контракт и разрешение контекста, не фиксировать случайные UUID
  и полные тексты промптов огромными snapshots.

## Мысленная трассировка нового пути

1. Controller создаёт assignment и внутреннюю attempt; prompt содержит WRK-017.
2. Hook child-start сохраняет native root/child/tool-call и исходный вызов.
3. CLI читает binding, разрешает WRK-017 только в его RUN и валидирует вход.
4. Однозначная attempt получает receipt и CAS; Work start записывает владельца.
5. Child читает проект, формирует JSON и вызывает короткий work finish.
6. Prepare читает весь JSON и схему до записи результата/проверок.
7. При ошибке возвращается no_effect с исправлением; Work остаётся running.
8. После исправления та же native сессия подаёт результат; admission проверяет
   ownership, generation и отсутствие другого executor, затем сервис принимает результат.
9. Повтор после потерянного stdout читает receipt; второй набор effects не запускается.
10. Native child completed + accepted Work result разрешают следующий fanout.
11. Native completed без result всё ещё вызывает reconciliation, но с причиной rejection.
12. При fork исходный RUN не меняется; новая generation/context не может использовать
    attempts/aliases исходного RUN. На следующей стадии binding обновляется атомарно
    с её переходом; старый target не перенаправляется на новый автоматически.

## Тесты и критерии приёмки

- CP-119 regression: известный правильный ID + опечатка -> no business effects,
  точный безопасный retry; затем accepted finish ровно один раз.
- Public command без ID: root stage start/finish, fresh Work start/finish,
  review и repair, pause/resume; проверить native identity каждого caller.
- Два проекта/два RUN с одинаковыми короткими ID: scoped resolution или ambiguity,
  чужая сессия/явный чужой ID никогда не меняют чужое состояние.
- Full и short refs дают одну canonical operation; конкурирующие вызовы не получают
  две attempts; settled replay, executing unknown, stale generation проверяются отдельно.
- Path aliases: valid input/output, missing/unreadable, JSON schema, symlink escape,
  traversal, no context; обычные строки и run:// не переписываются.
- dd-eval: full path/EVAL ID/@eval, wrong home, fork new context, request-id replay.
- Существующие lifecycle-invocations, command-inputs, vnext-fanout-reconcile,
  zcode-invocation-observer и dd-eval CLI tests расширить поведением, а не снимками UUID.
- Проверить inventory всех routes и всех managedLifecycleCommand/flowCommand callers;
  документировать команды, намеренно оставленные explicit/native-only.
- Один релевантный набор unit/integration после изменений + typecheck/build/lint;
  полный release gate один раз на итоговом release commit по ранбуку.
- Живое подтверждение после реализации: отдельный fork из сохранённой границы
  CODE -> CODE-REVIEW CP-119. Исходный RUN не менять. Не считать unit tests или
  подготовленный pass доказательством завершённого E2E.

## Границы

Не удалять protection от повторного исполнения, ownership и generation. Не добавлять
общий alias registry, нечёткий поиск UUID, скрытые retry неизвестного результата,
собственный shell wrapper на каждую команду или автоматическое исправление продукта
монитором. Отдельный обнаруженный journal_outside_published_state_dir требует своего
расследования наблюдаемости и не является причиной этой остановки.
