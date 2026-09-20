# Fix 042: канонические ссылки lifecycle и надёжный повтор CLI

Дата: 2026-09-20. Статус: реализован, профильная квалификация пройдена.
Продолжение 041-contextual-cli-identifiers-and-lifecycle-admission.md.
Область: dd-flow-cli; интеграционные проверки dd-eval и инструкция мониторинга.

## Цель и границы

Один и тот же объект, указанный полным ID или поддерживаемым коротким алиасом,
должен одинаково проходить prepare, admission, receipt matching и owner check.
Модель не вычисляет match key, не получает внутренние hook/invocation ID и не
выбирает специальную форму команды для обхода ошибки. Native session/tool IDs
остаются непрозрачными идентификаторами провайдера и никогда не сокращаются.
Ошибки аргументов допускают исправленный повтор; ошибки инфраструктуры
останавливают выполнение. Не добавлять автоматический retry инфраструктуры.

## Доказательства cp-121

EVAL-20260919225335-8be534e1, engine 0.9.0-beta.80.
База: qualification/cp-121-luna/runs/EVAL-20260919225335-8be534e1/executions/e2e/dd-flow-home/db.sqlite.
Сохранённый RUN: RUN-001-eval-subject, стадия отказа plan-review.

1. В 23:16:30.542Z первая команда work finish WRK-006 отклонена:
   review_evidence_invalid, повторяющийся FIND-001. Hook event 13 остался observed.
2. Модель исправила FIND-002 и повторила команду в 23:16:56Z.
3. Event 14 существует: exec-a5aa4370-db95-49a6-897b-e9fb01a52c57,
   session SES-25874202a4aabc775623f351, status observed.
4. Его match_key = 606a91ecd5551ba12e820293ec87958a59775e742bdcdf1295da63c3e90a7cf2.
   Это точно SHA256 JSON для work_finish, WRK-006 и materialized project root.
5. assertWorkLifecycleOwner разрешает WRK-006 в
   WRK-006-prt-007-task-priority-rg-trace; claimWorkLifecycleHookEvent вычисляет
   c6e816b7132b72e52a5d6f7171eb78bd9fe8d4d0ed4e99567415494f081f4cfc.
6. Различие ключей вызывает trusted_session_binding_required. Доставка хука,
   native identity и исправленный повтор модели не являются первопричиной.

## Карта мест и степень подтверждения

Пути src/test относятся к dd-flow-cli, lib/specs — к dd-eval.

| Место | Установленное поведение | Доработка |
|---|---|---|
| src/services/hooks.ts: lifecycleMatchKey, workLifecycleMatchKey, claimWorkLifecycleHookEvent | Hook хеширует буквальный WRK, claimant полный. Падение cp-121 доказано | Общий контракт эквивалентности для work finish/fail |
| hooks.ts: workStartMatchKey, claimWorkStartHookEvent; work-registry.ts: startWork | Start отдельно принимает два ключа; fallback ловит любую ошибку | Убрать особый путь после общего исправления; не подавлять ambiguity/storage errors |
| hooks.ts: stageLifecycleMatchKey, stageResumeMatchKey; stage-pause.ts: requireWork, prepareStageResume; work-registry.ts: assertStageLifecycleOwner | Work в pause/resume не нормализуется; локальный resolver и owner SQL требуют full ID | Разрешать --work тем же scoped resolver до SQL; применять общий receipt contract |
| hooks.ts: stageStartMatchKey, stageLifecycleMatchKey, recoveryAcceptMatchKey | RUN хешируется буквально; managed hook подставляет scope.runId, остальные пути нет | Проверить full/short RUN во всех поддержанных путях; унифицировать, не считать все пути уже сломанными |
| lifecycle-invocations.ts: normalizedInvocationValue/fingerprint | Admission сокращает PRJ/RUN/WRK независимо от hook matcher, включая значения без типизации | Использовать общие правила только для полей-ссылок; обычный текст/opaque IDs не нормализовать |
| lifecycle-invocations.ts: expandLifecycleInvocationArgs | Раскрывает пути и RUN, но не Work | Подключить общий read-only resolver Work для positional и --work |
| lifecycle-invocations.ts: assertLifecycleInvocationCurrent | Собственный SQL разрешения Work | Переиспользовать scoped resolver; единая обработка exact/short/ambiguous/not found |
| work-registry.ts: requireWork/shortWorkId; hooks.ts: shortWorkReference | Дублирование regex и разрешения; часть scope берётся из env | Один нижележащий helper; explicit project/RUN в известных внутренних вызовах |
| hooks.ts: findRecentMatchingHookEvent | Два observed receipt дают ambiguity, текст просит модель указать hook ID | Ошибка без предложения модельного ID; исключить известные завершённые no_effect attempts из fallback |
| hooks.ts: observeLifecycleCommandForOutcome; lifecycle-invocations.ts: record/settle outcome | Дополнительное сравнение match key может расходиться с receipt contract | Общая нормализация и точная связь outcome с native event |
| hooks.ts: Codex/ZCode/Antigravity/прочие handlers, assertHookEventReplay | Одни handlers пересчитывают key после scope, другие используют raw facts | Одинаковый контракт для записи/replay/claim; сохранить native proof каждого адаптера |
| test/stage-lifecycle-ownership.test.ts | Fixture WRK-001 не различает full ID и alias | Реалистичный WRK-001-slug и вызовы WRK-001 |
| lib/runner.mjs: runnerStatus; test/monitoring-status.test.mjs; monitoring prompt | В мониторинге читалась entry stage из manifest как текущая | Читать живую RUN stage; manifest обозначать entry stage. Не менять API без необходимости |

Последние пункты про fallback, RUN и replay — обнаруженные асимметрии/риски,
а не доказанные дополнительные падения cp-121. Их критерий изменения —
воспроизводящий поведенческий тест или явное нарушение обещанного CLI-контракта.

## Контракт реализации

### 1. Разрешение объекта и представление ссылки

- Переиспользовать существующие resolveRun и Work lookup; вынести минимальный
  общий read-only Work resolver ниже work-registry/hooks для исключения циклов.
  Реализация: `src/storage/work-references.ts`, используется registry, HITL и admission.
- Resolver принимает project/RUN scope явно, ищет exact, затем только строгий
  короткий WRK-NNN. Full ID также обязан принадлежать scope. Нельзя принимать
  несуществующий WRK-006-wrong-slug только из-за числового префикса.
- Не выбирать latest или первый match. Ambiguity остаётся ошибкой no_effect.
- Различать display alias, persisted full ID и native handle.
- Match-key helpers используют одну чистую функцию представления ссылок;
  shortening разрешён лишь для объявленных entity-полей. Доказательство прав
  остаётся за resolver и owner/session check, не за совпадением hash.
- Для managed вызова scope берётся из проверенной привязки. Хук фиксирует факты
  вызова и native identity; пользовательские аргументы валидирует CLI.
  Не добавлять бизнес-операции, запуск проверок или ожидание работ в hook.
- В key сохранять operation, project, RUN где применимо, stage, recovery/context
  discriminators. Не объединять разные операции/поколения/работы.

### 2. Единое применение по операциям

- Work start/finish/fail: общая форма Work-ссылки у recorder и claimant.
- Stage pause/resume: сначала scoped --work lookup, затем owner SQL и receipt.
- Stage start/finish и recovery accept: полный/короткий RUN должны совпадать
  только внутри правильного project/managed RUN. Recovery ID не сокращать
  generic regex; использовать существующий RUN-scoped recovery resolver.
- Привести observeLifecycleCommandForOutcome и assertHookEventReplay к тому же
  контракту. Повторная доставка того же native tool event идемпотентна.
- Проверить command renderers work-registry, stage-pause, stage-context,
  vnext stage services, run-recovery: примеры должны использовать реально
  поддержанные aliases. Не трогать семантические тексты результатов.

### 3. Повтор после ошибки входа

- Сначала полностью проверить JSON/schema/files/ссылки, затем claim/execute.
- Ошибка prepare не меняет Work/stage, не запускает проверки и не расходует
  чужой receipt. Служебный диагностический outcome допустим и связан ровно
  с текущим native event.
- При исправленном вызове приходит новый tool event. Использовать его точную
  существующую transport-привязку; не выбирать последний event по времени.
- Для non-rewriting fallback подтверждённый оконченный no_effect event не
  должен конкурировать с новым. Использовать сохранённый outcome/существующий
  статус, без новой очереди и таймера; сначала тестом проверить текущие пути.
- Если остаются два действительно подходящих незавершённых события, отказать
  с ambiguity. Модель не должна разрешать эту неоднозначность внутренним ID.
- Убрать catch-all short->full fallback startWork; прежняя ambiguity не может
  превращаться в успешный выбор другого представления.

### 4. Диагностика и совместимость

- Сохранить машинную классификацию инфраструктурных ошибок, добавить reason:
  event_missing / identity_missing / event_consumed / target_mismatch /
  owner_mismatch. Давать expected/observed target и event status в диагностике.
- Не печатать секреты, весь stdin или scope env. Native IDs допустимы в
  операторских артефактах, не обязательны в командах модели.
- Формат key сохранён: matcher принимает exact и short варианты разрешённого
  объекта. Старые базы не переписываются. При upgrade/fork
  незавершённые попытки получают новое событие и текущую привязку.
- Если поддерживаемый resume требует старые observed receipts, добавить узкую
  совместимость в одном matcher с exact event/owner/scope validation. Не
  расширять поиск до произвольного набора keys; settled outcomes не исполнять
  повторно. Решение закрепить тестом до объявления upgrade поддержанным.

## Пошаговая трассировка будущего выполнения

1. Renderer выдаёт work finish WRK-006 --result-stdin; скрытые handles не нужны.
2. Native hook синхронно сохраняет session/tool факты до возврата управления.
3. CLI получает проверенный контекст и разрешает WRK-006 в scoped full ID.
4. Prepare читает stdin и проверяет результат. Повтор FIND-001 возвращает
   recoverable no_effect; Work остаётся running, диагностируется текущий event.
5. Исправленный вызов получает новый native event. Его alias и full ID имеют
   одинаковое receipt-представление; старый завершённый no_effect не мешает.
6. Claim атомарно расходует ровно новое событие, owner check сверяет физическую
   сессию/daemon/Work. Несовпадение останавливает выполнение с точной причиной.
7. Work завершается штатно. Повторная доставка того же события не исполняет
   операцию ещё раз. needs_changes идёт обычным маршрутом исправления плана.
8. Controller реагирует на новое состояние; неизменённый continuation не
   отправляется бесконечно. Eval сообщает фактическую стадию и terminal state.

## Тесты и критерии приёмки

Дополнить существующие lifecycle-invocations, stage-lifecycle-ownership,
vnext-specify/stage-pause, hooks и zcode-invocation-observer suites:

- Реальный hook->CLI путь: сохранённый full WRK со slug, короткий finish,
  исправленный повтор после invalid JSON/review evidence и успешный claim.
- Таблица start/finish/fail/pause/resume: full/short ссылки, явный event и
  поддержанный non-rewriting путь. Не только сравнение двух hash helpers.
- Wrong slug, чужой RUN/project, ambiguity, чужая native session/daemon,
  claimed event и два живых события отвергаются без бизнес-побочных эффектов.
- Replay native event, повтор settled invocation и fork с новым scope.
- Aliases @project/@workspace/@run раскрываются только в path-параметрах;
  payload с текстом WRK/RUN, quoted/heredoc input не переписывается.
- Основные адаптеры используют общий matching; transport-specific native
  proof не подменяется универсальным synthetic session.
- Мониторинг: manifest.entry=specify, RUN.current=plan-review => plan-review;
  данные RUN недоступны => unknown с причиной, не entry stage.

Запускать профильные тесты и build/typecheck. Полный release gate один раз
на итоговом release-коммите; документационные правки не требуют полного E2E.
После отдельного разрешения на реализацию/запуск — published engine и новый
fork от сохранённой границы plan->plan-review cp-121, если она проходит штатную
проверку fork; иначе объяснить конкретное ограничение. Исходный RUN сохранить.
Живой успех: reviewer finish принят, fan-in завершён, needs_changes/pass
обрабатывается штатно, нет прежней ошибки и повторяющегося continuation.

## Порядок работ и завершённость

1. Красный regression cp-121 и таблица соседних случаев.
2. Общий resolver/представление ссылок и подключение всех перечисленных callers.
3. Receipt/outcome/retry и диагностика; совместимость сохранённых событий.
4. Обновление примеров и runbook мониторинга, профильные проверки.
5. Review diff по карте, release qualification, затем разрешённый live fork.

План не утверждает, что просмотрена каждая строка всех репозиториев: обследованы
producer/consumer цепочки lifecycle identity, aliases, ownership, retry и
monitoring. Ошибки предметного плана (например расписание browser checks)
остаются предметом эвала и не подменяют этот инфраструктурный фикс.

## Результат реализации

- Добавлен единый model-facing renderer коротких PRJ/RUN/WRK-ссылок. Generated
  start/fail/pause/resume-команды больше не заставляют модель переписывать slug.
- CLI сначала разрешает короткую ссылку в точный объект внутри явного
  project/RUN scope, затем выполняет owner и receipt checks.
- Receipt matching принимает два точных написания уже разрешённого объекта:
  его полный ID и короткий alias. Они не схлопываются в один hash: поэтому
  `WRK-006-wrong` не может выдать себя за `WRK-006-real`.
- Один механизм подключён к Work start/finish/fail, stage
  start/finish/pause/resume и recovery accept. Повторно claimed событие,
  неверная цель, отсутствие identity и отсутствие события различаются в
  диагностике; ambiguity не перекладывает выбор внутреннего event ID на модель.
- Сохранённый cp-121-класс покрыт реальным short-command/full-storage путём;
  добавлены проверки wrong slug, consumed receipt, HITL resume и hook/adapter
  responsibility. Все проверки выполняются до бизнес-мутаций.
- Отдельная правка runner не понадобилась: штатный `runner status` уже выводит
  фактическую stage в `execution_results`. Ошибка мониторинга была в чтении
  entry-stage из manifest; runbook фиксирует приоритет live RUN/controller и
  `unknown`, если они недоступны.
- Полный живой fork и release/publish намеренно не входят в эту реализацию:
  они остаются отдельным квалификационным действием после code review.

## Дополнения по ревью

Первоначальный отчёт о полной реализации был преждевременным. Ревью выявило
и исправило следующие пропуски:

1. Registry, HITL и admission использовали разные Work lookup. Общий read-only
   resolver теперь применяет project/RUN scope и к exact ID, и к alias.
2. Fingerprint сокращал ID-подобные subject/opaque значения. Сокращение
   ограничено полями entity-reference; semantic arguments остаются различимыми.
3. Fallback включал завершённые no_effect receipts. Они исключены по durable
   outcome; `retrying`, unknown и два активных события не маскируются.
4. Правило current stage внесено в `runbooks/e2e-monitoring.md`.

Work alias намеренно разрешается в CLI admission/prepare через общий resolver,
а не в `expandLifecycleInvocationArgs`, который вызывается и hook recorder:
это сохраняет ответственность CLI за проверку аргументов. Полные ID остаются
в БД, alias используется только в командах и допустимых spelling receipt.
