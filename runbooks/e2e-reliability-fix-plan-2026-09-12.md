# План: надёжное исполнение dd-flow / dd-eval после Luna и ZCode

Итог на 2026-09-13: согласованный объём I-01…I-09/C-01…C-03 реализован и проверен; beta.53 опубликована, cp-101 закреплён, Luna/ZCode preflight PASS. Готово к новому E2E, сам scored E2E не запускался. Доказательства и границы: [readiness audit](e2e-readiness-audit-2026-09-13.md). Актуальный дизайн: `zcode-cli-rendezvous-2026-09-13.md`; он заменяет ниже исторические требования новой native сборки и hook-only admission для ZCode. Основание общего плана: `e2e-systemic-investigation-2026-09-12.md` (I-01…I-09). Продуктовые исправления Subject не входят: их выполняет flow в рамках оценки.

## 1. Сохранить существующее разделение обязанностей

- flow владеет RUN/Stage/Work/Session, вопросом, ответом, переходами и capture.
- eval владеет EVAL, definition, подачей контекста, разрешённым ответом simulated user и Judge.
- adapter владеет связью с native session, достоверной идентификацией и доставкой событий.
- Не добавлять второй orchestration loop, отдельный чат вопросов или новый event bus.

Вопрос уже задаётся через `dd-flow stage pause … --question-stdin`, ответ — через `stage resume … --answer-stdin`. Использовать существующие generated templates с heredoc и обязательными идентификаторами. В eval существующий `observeManagedRun` обрабатывает `waiting_for_user`, получает ответ через `answerFor` и передаёт его через `drive answer`; этот путь сохранить. Отсутствие разрешённого ответа должно оставлять явное ожидание, не синтезировать ответ и не возобновлять работу самостоятельно.

## 2. Выбранный механизм ZCode и проверенная зависимость native runtime

**Пересмотрено:** актуальный механизм — `zcode-cli-rendezvous-2026-09-13.md`. Ниже сохранено прежнее решение и результаты hook-эксперимента для истории; требование получить новую сборку с child hooks больше не является выбранным путём. Existing hook implementation не означает qualification нового CLI-rendezvous.

Итог живых опытов: `zcode-native-hooks-experiment-2026-09-13.md`. Выбран штатный **синхронный PreToolUse с updatedInput и точным --hook-event-id**. Передавать все данные в argv и строить новый event broker не требуется. Предыдущие опыты с ACP notifications и очередь 7.239/7.554 s описаны в `zcode-event-delay-experiment-2026-09-13.md`; этот путь остаётся только для evidence.

На stock ZCode 0.16.5 root hook работает, но child runtime не наследует hooks. В native constructor пропущено `hooks:this.config.hooks`. Подстановка этой настройки только в памяти экспериментального процесса дала PASS для root и child: native identity, запись receipt до исполнения, применение updatedInput и запрет exit 2. Установленный runtime не изменялся. Самостоятельный код zcode-acp не содержит этого native constructor.

Обязательная реализация:

1. Получить исправленный native runtime: child наследует разрешённую hook-конфигурацию, но создаёт собственный runner с собственной Session identity; не делить mutable runner root. Покрыть foreground/background, resumed child и разрешённые вложенные пути. Закрепить версию/hash и квалифицировать capability; stock 0.16.5 для нового контракта не принимать. Диагностический preload не превращать в production-патч закрытого bundle.
2. Подключить один process PreToolUse для Bash через поддержанный пользовательский config или plugin. Dispatcher ограничен зарегистрированным managed execution, использует controlled DD_FLOW_HOME/bin/project/daemon context, не меняет посторонние команды и пользовательские hooks. Конфиг устанавливать/проверять до новой Session; не полагаться на hot reload. `--settings` в установленном 0.16.5 не работает, хотя указан в help. Доставку через plugin квалифицировать отдельно, если выбрана она; в опыте проверен user config.
3. Добавить native hook entrypoint в существующую zcode CLI family; общий lifecycle parser, запись receipt, replay validation и commandWithHookEvent переиспользовать из hooks.ts. При успехе вернуть полный `{...tool_input, command: rewritten}` после durable commit, а не после одного enqueue. Внести только ID receipt; исходные аргументы, env assignments и безопасный heredoc сохранить.
4. Native `session_id` и `tool_use_id` использовать как первичные факты. Ключ receipt scoped по harness/daemon/session/tool-call; не полагаться на глобальную уникальность tool_use_id. В hook input проверенной версии нет явного parent_session_id/daemon_id: controlled daemon/root брать из launcher context, непосредственного parent подтверждать native topology либо добавить native поле из уже известной runtime ancestry. Не подменять отсутствующий parent корнем. Этот integration check обязателен до приёмки.
5. Любую ошибку admission оформить в hook как deny/exit 2 с исходной причиной. Дополнительно CLI не допускает ZCode lifecycle mutation без точного валидного receipt: ordinary exit 1 и timeout hook могут продолжить исходную команду. Наличие/отсутствие флага само по себе не доказательство; проверить БД, identity, operation, Work и recovery generation. Отключить recent-match fallback для нового ZCode-контракта.

Безопасный отказ без receipt — нормальная диагностика неисправной интеграции, а не повод предложить агенту бесконечно повторять ту же команду. Регистрация bootstrap не исключается из контракта: её законный native hook путь должен тоже выдавать точный receipt.

Живой механизм проверен marker fixture с fsync, НЕ production SQL claim. До релиза нужны точечные интеграционные проверки на настоящем dd-flow: root/child rewrite, distinct identity и parent, один delayed hook, несколько children, deny, crash/timeout, отключённый hook, duplicate/replay и recovery generation. Отдельно проверить нормализацию native tool_use_id и ACP child-prefixed toolCallId: один вызов не должен создавать два admission receipts.

Граница готовности: механизм выбран и продемонстрирован, но выпуск исправленного native runtime и production-интеграция ещё не выполнены. Смена permission mode не требуется — опыт прошёл в yolo. Не заменять механизм увеличением 250 ms, выбором latest event или ID, произвольно указанным агентом.

Реализовано в репозитории: `dd-zcode hook handle` и `dd-flow zcode hook handle` передают native session/tool-use/daemon identity, делают durable receipt и возвращают full `updatedInput`; wrapper отказывает exit 2 при любой ошибке. ACP forwarder больше не создаёт admission receipts. ZCode daemon сохраняет immutable parent/root ancestry и не принимает конфликт. `doctor`/managed daemon отказывают stock runtime без `hooks:this.config.hooks` для child Sessions. Подключение hook в поддержанной native сборке и её pin/hash остаются внешним шагом выпуска ZCode.

## 3. Общий lifecycle parser и generated commands — I-01/I-02/I-03

Файлы: `dd-flow-cli/src/services/lifecycle-command.ts`, `hooks.ts`, `work-registry.ts`; семантику help сверять с `src/cli/help.ts`.

1. Help классифицировать по правилам настоящего CLI до lifecycle mutation. Help одной команды не скрывает соседнюю настоящую мутацию. Bootstrap сохраняет законный путь регистрации.
2. Единое исключение shell-композиции: один lifecycle вызов с прямым stdin heredoc. Generated work finish привести к тому же шаблону, который уже использует HITL. Проверить совместимость текущих packet fixtures; старые формы не разрешать широким исключением.
3. Multiple lifecycle invocations и посторонние исполняемые хвосты отклонять до stdin-исключения. Содержимое heredoc считать данными.
4. Корректно отличать fd redirection от числового аргумента. Неизвестную форму не переписывать; не строить полноценный shell interpreter.

Регрессии: help с pager; help + mutation; два lifecycle; безопасный work/HITL heredoc; вредоносный хвост; `2>&1` против аргумента `2`; generated packet проходит тем же production parser.

Реализовано: общий `commandWithHookEvent` вставляет receipt перед heredoc delimiter, сохраняя body неизменным; обычные compound commands по-прежнему не переписываются. Shell regressions покрывают work finish, pause/resume и хвост после heredoc.

## 4. Достоверная идентичность и ошибки доставки — I-08/I-09

**Поправка для ZCode:** hook-only путь и запрет использовать ACP для admission ниже заменяются exact invocation → native observation → durable receipt → CLI claim по `zcode-cli-rendezvous-2026-09-13.md`. ACP остаётся асинхронным наблюдением, не PreToolUse; ожидание перед mutation находится в CLI. Требования точной identity, единственного writer, generation, replay protection и сохранения исходной ошибки остаются обязательными.

Реализовать native PreToolUse из пункта 2: receipt commit → updatedInput → CLI claim → mutation. Native session + tool-call identity определяют одну попытку. Запись receipt и последующий claim — отдельные атомарные действия в существующей БД, не одна транзакция через native process. Повтор доставки того же события идемпотентен; уже использованный receipt не разрешает новую мутацию. Retry команды — отдельная попытка с явной связью, а не неоднозначный поиск свежих совпадений.

Убрать из ACP notification forwarder создание lifecycle admission receipts: это теперь обязанность native hook. Так критический путь больше не ждёт последовательную очередь чужих tool events. Сохранять ACP события для evidence и явной корреляции, но не выдавать их за PreToolUse-допуск и не применять к ним второй admission parser с поздним отказом. Profile-integrity и необходимые ordering проверки сохранить. Измерять hook start/receipt commit/response, command claim и evidence observation отдельно. Не создавать новую очередь-сервис и не распараллеливать все notifications без необходимости.

`findRecentMatchingHookEvent` не должен советовать повтор, который заведомо превращает поздние observed receipts в ambiguity. Совместимый fallback остаётся fail-closed; точный ID принимается только с существующей проверкой доверенного источника, Session и операции. Нельзя доверять одной строке argv или выдать child идентичность root.

В `dd-zcode.mjs` сохранять forwarding failure сразу: original code, session/tool-call identity, event time, стадия доставки. Ошибка доверенного наблюдения завершает/приостанавливает затронутую операцию через существующий controller settlement; не ждать общего flush до конца turn. Сначала persist, затем уведомление/settlement. Без доказательства остановки native tree не объявлять clean terminal и не прерывать здоровые siblings произвольно. Поздние callbacks не оживляют завершённую операцию.

После переноса admission в native hook различать классы ошибок: отказ регистрации/claim запрещает соответствующую мутацию; нарушение profile integrity обрабатывается существующим integrity-контрактом; потеря вторичной ACP evidence помечает наблюдаемость как incomplete и сама по себе не отменяет уже корректно подтверждённую lifecycle-команду. Не переносить прежнюю позднюю admission-ошибку в новый evidence-only путь.

Регрессии: delayed event; точный retry; duplicate/reordered event; два child с одинаковой командой; replay после claim; forwarding failure во время turn; исходная ошибка сохраняется несмотря на cleanup failure. Каждый тест проверяет реальное состояние/receipt, не наличие строки в исходнике.

## 5. Устойчивый owner и наблюдаемость EVAL — I-04

Перед переходом к observer учесть дополнение class-audit ниже; C-02/C-03 являются частью готовности нового binding-контракта, а не необязательной косметикой.

`DD_EVAL_HOME/runs/EVAL-*` уже существует: расширить его, не создавать параллельное хранилище.

- Вынести физическое выполнение обычных run/resume в существующий detached-worker подход `eval-resume-worker.mjs`, переиспользуя единственный `observeManagedRun`.
- Под lifecycle lock регистрировать owner до productive dispatch; takeover допускается только после проверки PID + start identity. Два resume не получают двух owner.
- Сохранять `runner-attempts/<id>`: owner identity, время и тип запуска, definition, stdout/stderr без секретов, процессные события, последнюю observation и ожидаемую операцию. Resume добавляет attempt к тому же EVAL.
- Родитель/наблюдатель фиксирует известный exit code/signal. После SIGKILL или потери машины следующий status/reattach показывает исчезновение owner; неизвестную причину не подменять догадкой.
- Status выводит отдельно сохранённое состояние EVAL, свежесть observation, живое состояние controller и недоступность источника. Read-only status не переписывает исторический verdict.
- Human wait, operator pause и recovery_required не являются автоматическим разрешением продолжить.

Регрессии: exit вызывающего CLI не теряет worker; исчезновение worker не выглядит как здоровое ожидание; PID reuse; concurrent resume; один context после reattach; HITL без ответа; явный pause; restart в промежутке dispatch/persist. Точная host-причина исчезновения прежнего Luna observer остаётся неизвестной.

## 6. Единый reattach outcome и definition guard — I-05/I-07

В `dd-eval/lib/runner.mjs` переиспользовать существующие error classification и failure persistence в launch/recover/resume. Conclusive operation failure получает receipt и evidence; observation loss остаётся неизвестным исходом; control pause остаётся pause. Failure операции не запрещает отдельное разрешённое восстановление. Cleanup не заменяет первичную причину.

До productive reattach вызвать существующий `assertRetainedRunDefinition`, включая начатую execution. Проверить покрытие untracked case inputs и сохранить проверку ранее подготовленных context hashes. Изменение definition не обходить одним совпадением checkpoint.

Регрессии: failed controller на resume; недоступный controller; operator pause; изменение blueprint при прежнем checkpoint; неизменённый resume; существующий context hash mismatch. Проверять отсутствие dispatch при отказе admission.

## 7. Общий resolver evidence — I-06

Вместо старого `drivers/subject.events.jsonl` разрешать зарегистрированные controller session journals через один helper для model attribution, tool observations, failure report и Judge input. Учитывать root/child/successor, проверять существование ссылок; отсутствие наблюдения показывать как unavailable с причиной, не нулевое использование. Не удваивать inclusive usage и не копировать весь raw journal в EVAL events.

Регрессии: реальный managed-result shape; несколько Session; недоступный/частичный журнал; failure path; отсутствие двойного счёта; все опубликованные evidence paths существуют либо явно помечены unavailable.

Реализовано: `resolveEvidenceJournals` в runner собирает опубликованные controller/adapter journals, дедуплицирует model observations и сохраняет unavailable source отдельно; Judge получает эти paths через execution evidence вместо жёстко заданного одного subject journal.

## 8. Завершение и достаточная проверка

### Дополнение по общему классу дефектов — C-01/C-02/C-03

Подробности и воспроизведения: `hook-boundary-class-audit-2026-09-13.md`, `tools/probe-hook-boundary-audit.mjs`.

- **C-01, Grok:** native hook wrapper должен вернуть полный protocol response общего обработчика, а не выбросить stdout и вернуть allow. Удалить второй admission writer из ACP notification пути; сохранить evidence/correlation. Проверить transport updatedInput, deny и единственный receipt при native+ACP mirror. Native error wrapper уже возвращает exit 2; не менять это на generic exit 1.
- **C-02, общий rewrite:** generated heredoc является разрешённым standalone, но rewriteSafe=false оставляет его без ID. Реализовать безопасную вставку --hook-event-id в командную часть перед heredoc; stdin body не менять. Allow/rewrite должны использовать один результат parser. Shell regression проверяет реальный argv/байты stdin для work finish и HITL pause/resume; unknown forms fail closed. Фикс нужен всем пользователям commandWithHookEvent, включая новый ZCode путь.
- **C-03, ZCode Session updates:** track не должен стирать parent_provider_session_id при prompt/inspect receipt без этого поля. Переиспользовать принцип сохранения известного parent из Grok track; conflicting ancestry отклонять, mutable topology snapshot не смешивать с immutable identity. Regression: fork→inspect→prompt→persist/reload и конфликт parent.
- **Расширение I-08:** единая политика exact receipt должна охватывать work start/finish/fail, stage lifecycle/HITL, recovery accept и законные bootstrap/session-registration пути. Не оставлять siblings на поиске по времени после исправления одного startWork. Legacy fallback разрешается только по явно подтверждённой harness capability.

Это локальные поведенческие проверки; они не добавляют полную шестихарнессную матрицу в ближайший этап и не требуют повторять полный gate после каждой правки.

Реализовано: Grok wrapper сохраняет full native hook response, ACP mirror больше не создаёт второй receipt; ZCode track сохраняет parent на partial receipt и reject-ит конфликт ancestry. Локальный `tools/probe-hook-boundary-audit.mjs` теперь является regression check, не repro дефектов.

Актуальный порядок: CLI-rendezvous production implementation и qualification на установленном ZCode → итоговая проверка parser/packet, binding/delivery, reattach/definition, owner/status, evidence. Native marker spike PASS не заменяет SQL/claim integration tests. Не ждать несуществующую исправленную сборку и не объявлять ZCode готовым до qualification выбранного пути.

На каждом блоке — профильные regression tests и необходимые build/type checks. После интеграции — один полный обязательный release gate на окончательном release commit, публикация и проверка пакета, checkpoint и обновление runbook. Затем согласованный живой E2E Luna и ZCode, где продуктовые сценарии проверяются самим flow. Не добавлять полную матрицу шести harnesses и stop/recovery после каждой узкой правки.

Готовность: все I-01…I-09 связаны с кодом и поведенческим тестом; native binding контракт доказан; после потери вызывающего CLI EVAL либо сопровождается owner, либо честно показывает потерю observation; вопрос не теряется; conclusive failure сохраняется; Judge получает доступные evidence. Любая недоказанная гарантия отмечена явно, а не закрыта зелёным unrelated gate.
