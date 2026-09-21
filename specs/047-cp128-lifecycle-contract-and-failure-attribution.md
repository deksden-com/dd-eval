# 047 — Lifecycle contracts, actionable retries and causal failure attribution

Дата: 2026-09-21. Статус: реализовано; ожидается release qualification и чистый CP-129 Luna E2E.

## Основание и границы

CP-128, EVAL-20260921122436-1ffe0a80, engine 0.9.0-beta.90. CODE-REVIEW accepted в 14:17:00 UTC; MERGE entry в 14:17:49; два отказа merge apply в 14:17:54 и 14:17:59; остановка controller с incomplete_subject_turn. Модель использовала выданную публичную команду без invocation-id. Runtime восстановил retained argv, содержащий служебный ID, после чего собственный CLI-validator отклонил его. Retry воспроизвёл противоречие. MERGE apply не исполнился, но entry-stage и Work были созданы.

Источники: controller.log, turn-00021.md, session-1 native rollout, timeline.jsonl и 07-merge/works/WRK-018-merge/prompt.md в RUN-001-eval-subject. Не изменять исторический EVAL и его исходный verdict; новые объяснения сохранять отдельными receipts.

Проверка опубликованного dist: из 11 lifecycle routes только merge apply и merge repair отклоняют invocation-id и hook-event-id. Это воспроизведённый дефект двух маршрутов. Остальные находки ниже различают подтверждённое поведение кода и регрессионные риски; перечень не означает доказанного сбоя каждого адаптера.

## Инварианты решения

- MERGE остаётся managed lifecycle: ownership, native receipt, fencing, admission и replay сохраняются.
- Служебные ID, project scope, hashes и классификация ошибок принадлежат runtime. Модель пишет только семантические входы, преимущественно JSON-файлы.
- no_effect описывает отсутствие эффекта; не доказывает исправимость или полезность повторения.
- Неизвестный эффект, повреждение контракта и потеря authority не порождают автоматический retry.
- Primary error определяется по связанным durable данным, а не по тексту финального ответа модели или глобальной последней ошибке.
- Исправленный вход, новый check receipt, repair, HITL answer или новая разрешённая generation могут оправдывать новую попытку. Простая смена UUID и времени — нет.

## Карта изменений

Пути dd-flow-cli ниже относительны соседнему репозиторию ../dd-flow-cli.

| Место | Находка / риск | Требуемая работа |
| --- | --- | --- |
| src/services/lifecycle-command.ts | LifecycleOperation и lifecycleOperation вручную перечисляют операции | Одна таблица route → operation; вывести тип и распознавание из неё |
| src/cli/command-inputs.ts | merge apply/repair не принимают служебные параметры; тесты выводят ожидания из этого же реестра | Общий lifecycle contract подключает internal options; независимая матрица обязательных маршрутов |
| src/services/lifecycle-invocations.ts, runtimeOwnedOptions, public rendering, resolveObservedLifecycleArgs | Повторное описание скрытых аргументов и преобразование public → retained → dispatch | Согласовать с общим контрактом; сохранить точное fingerprint/authority сопоставление |
| src/cli/run-cli.ts | validateArgs получает runtime-bound argv; hook-event-id добавляется позже | Явно различить публичный и внутренний ввод, сохранить проверку обоих; отказ внутреннего контракта выделить отдельно |
| src/cli/input-preparation.ts: prepareError | Может перезаписать recoverable:false; phase=prepare допускает широкий набор ошибок | Сохранить отрицательную recoverability, unknown/committed effect, infrastructure и handoff; уточнить caller-input классификацию |
| lifecycle-invocations.ts: settleLifecyclePreparationRejection | Безусловно создаёт successor и recoverable:true | Общая политика disposition, атомарное сохранение отказа, successor только при доказанной исправимости |
| lifecycle-invocations.ts: isRetryableLifecycleRejection, settleLifecycleRejection | Другой путь классификации; повтор без изменения входа не отделён от исправления | Одна политика для prepare/execution с сохранением различий effects, storage retry и registered repair |
| src/services/hooks.ts; harness-runtime/lib adapters; codex-hook-delivery.ts | Потребители parsing/receipts; возможен обход исправления отдельным transport | Проверить все callers общего parser и native binding, smoke каждого поддержанного transport без новой логики на адаптер |
| src/services/continuation-outcome.ts, controller-fanout.ts, run-controller.ts | Generic incomplete_subject_turn при отсутствии fanout маскирует конкретный отказ | Общий поиск causal rejection перед fallback; не перекрывать зарегистрированный repair/ответ/HITL |
| run-controller-state.ts, run-controller-recovery.ts, run-controller-adapter.ts | Передача и сохранение ошибки через stop/recovery/status | Сохранить primary cause и ссылки на receipt; cleanup errors оставить вторичными |
| run-cli.ts: refreshDashboardsAfterMutation/projectRootForMutation | Получают output.args; stage/merge требуют отсутствующий публичный project-root | Передавать уже разрешённый scope; общий fallback для остальных mutations |
| dd-eval/lib/managed-flow-client.mjs | Переносит controller error в исключение с nested controller | Сохранить структурированную причину до execution result и capture |
| dd-eval/lib/runner.mjs: failureAttribution | incomplete_subject_turn прямо относится к subject | Классифицировать по доказанной причине; без неё undetermined; не угадывать вину по generic wrapper |
| test/command-inputs.test.ts и merge service tests | Самопроверка декларации и обход managed CLI не обнаружили дефект | Проверки границ компонентов и реальных производимых команд |

## WP1. Общий контракт команд

1. Ввести небольшой dependency-free модуль описания lifecycle routes рядом с parser. Сначала проверить существующие зависимости и исключить цикл services → cli → services. Не переносить весь CLI в новый framework.
2. Перечислить все 11 операций: session register; stage start/finish/pause/resume; work start/finish/fail; merge apply/repair; run recovery accept.
3. Использовать таблицу для parser, lifecycle internal-options в commandInputs и route mapping contextualPathOptionsForLifecycle. Сохранить различия обязательных аргументов и вложенного recovery route.
4. Разрешить invocation-id/hook-event-id для MERGE внутри managed пути. Синтаксическое разрешение не должно давать authority: неизвестный, чужой и истёкший ID по-прежнему отвергаются admission.
5. Runtime-owned arguments продолжать восстанавливать из retained assignment. Не заставлять модель указывать project-root или UUID. Не удалять ID на retry.
6. Проверить producers vnext-merge.ts applyCommand/finishCommand/repair и все остальные managedLifecycleCommand callers. Проверка emitted internal command должна проходить реальную preparation, где это возможно без эффектов.

Критерий: каждый публичный issued command после native binding проходит синтаксис; неизвестные пользовательские параметры остаются ошибками; replay не повторяет side effect.

## WP2. Единая политика ошибок и повторов

1. Общая функция disposition принимает источник ошибки, effect, authority, handoff и признаки исправимости. Возвращает retry-after-correction, handoff, terminal/internal или unknown-effect. Использовать существующие error helpers и continuation-outcome; новый abstraction layer не нужен.
2. Ошибка собственной декларации runtime-owned option получает отдельный код (предлагается lifecycle_contract_invalid), recoverable:false, operation/parameter и correlated receipt. Обычная опечатка caller остаётся исправимой.
3. prepareError не переопределяет явный запрет retry, committed/unknown effect и infrastructure failure. Проаудировать все его callers, особенно обёртки service validation и file/schema preparation. Тестировать исходную причину, а не только итоговый code.
4. Согласовать prepare settlement и executing settlement. Новый successor и отказ сохраняются атомарно; повторная доставка возвращает прежний результат. Сохранить существующий ограниченный storage retry и fresh-session handoff.
5. Защита от отсутствия прогресса: хранить/вычислять из durable данных подпись operation+target+scope/stage/attempt/cycle+error code/parameter+подготовленные входные bytes+существенное состояние. Не включать UUID, время, декоративный текст. Использовать уже прочитанные input bytes, без повторного чтения после проверки.
6. При повторном одинаковом conclusive rejection без изменения подписи прекратить выдачу successor и сообщить no-progress с исходной причиной. Проверять цепочку после перезапуска controller. Исправленный файл по тому же пути должен менять подпись. Новый UUID сам по себе не должен.
7. Gate/repair retry учитывать через конкретный check/repair receipt и verified progress; нельзя блокировать законный повтор после исправления source только потому, что semantic JSON не изменился.
8. Для внутренних контрактных ошибок не выдавать даже первую инструкцию «повтори». Для временных ошибок ждать/повторять только по существующей явной политике, не вводить общий временной лимит выполнения стадий.

Критерий: воспроизведение CP-128 завершается точной ошибкой движка без бессмысленных retry; исправимый JSON и зарегистрированный repair продолжают работать.

## WP3. Причина ошибки от controller до eval

1. Перед incomplete_subject_turn искать неразрешённый отказ, связанный с текущими controller generation, native turn/session, RUN, stage/attempt/cycle и operation. Использовать durable identity, не глобальный latest.
2. Исключать исторические ошибки, уже закрытые успешным successor, зарегистрированным repair, корректным handoff или ответом на pause. Проверять несколько последовательных отказов и параллельные children.
3. Сохранять primary cause code/message/details и receipt reference; общий wrapper при необходимости хранить отдельно. Ошибка cleanup/capture не заменяет первичную.
4. Проверить state serialization, controller status, recovery capture, managed-flow-client, execution result, failureAttribution и evaluator evidence. Новые поля согласовать с существующими schemas и читателями; старые receipts без cause должны оставаться читаемыми.
5. lifecycle_contract_invalid относится к дефекту engine согласно существующей taxonomy eval. Не превращать все неизвестные ошибки в infrastructure автоматически. Generic incomplete_subject_turn без доказательства причины → undetermined.
6. Добавить fixture фактической цепочки CP-128 с минимальными обезличенными данными. Исторический capture не переписывать.

Критерий: один и тот же primary code доступен в CLI rejection, controller status и итоговом eval evidence; модель не получает blame за внутренний контрактный отказ.

## WP4. Scope и dashboard

1. refreshDashboardsAfterMutation получает resolved scope/prepared invocation context, который использовался при mutation.
2. В projectRootForMutation проверить stage start/finish/pause/resume; merge apply/repair/request; run mutations; session; protocol; worktree и lane helpers. Для project register/archive сохранить специальные правила.
3. Известный resolved scope использовать первым; explicit/result/entity lookup — только необходимые fallback. Не выбирать cwd при неоднозначном проекте.
4. Dashboard остаётся best-effort: реальный сбой render сохраняется warning, успех основной операции не превращается в failure. Не подавлять предупреждения целиком.

Критерий: managed command без публичного project-root обновляет нужный dashboard; явный другой проект не получает обновления; реальный render failure виден.

## WP5. Проверки и порядок реализации

1. Сначала regressions текущих багов: полный lifecycle route matrix с обоими internal options; prepareError сохраняет recoverable:false; internal rejection не создаёт retry; scope warning; attribution generic vs causal.
2. Реализовать WP1, затем WP2, затем WP3/WP4. Каждый шаг имеет ограниченный diff и affected tests. Общие helpers тестируются на границах, не дублируются в каждой ветке.
3. Managed integration: native observation → public command → resolved argv → CLI prepare → admission → merge service → settlement → replay. Обязательно apply и repair; прямого вызова service недостаточно.
4. Проверки отказов: чужой ID, изменённый target, expired generation, неизвестный effect, concurrent duplicate, crash между settlement/successor, повтор после reattach, ошибочный и исправленный JSON по одному пути.
5. Controller: previous failure followed by success; current internal rejection; repair-required and fresh child; no causal evidence; cleanup failure secondary. Eval: корректная классификация и сохранение nested evidence.
6. Проверить адаптерные producer/observer контракты на той же таблице команд; не требовать платного live E2E каждого provider для статической ошибки синтаксиса.
7. Typecheck/lint, affected suites, затем обязательный release gate для общих runtime изменений. Package smoke тестирует установленный кандидат, а не только checkout. Версию/commit/digest получить из фактического нового кандидата.

## WP6. Документация и будущая live-квалификация

- Обновить lifecycle/retry developer docs и инструкции harness: retry только из доказанной классификации runtime; модель не диагностирует служебные UUID и не пересобирает команду.
- Обновить runbooks/e2e-monitoring.md: первичная ошибка, корреляция, wrapper, attribution, secondary warnings; текущая стадия по actual timeline.
- После реализации и релиза подготовить новый чистый checkpoint на основе CP-128, сохранив source/flow/memory inputs, с точным новым engine tuple. Проверить доступность номера перед созданием.
- Запустить published-package regression до дорогого Luna E2E; штатный preflight обязателен. Не копировать старые runs/runtime DB/conformance state.
- В live E2E подтвердить MERGE apply → gate → completion, корректные repairs при их возникновении, отсутствие repeated unchanged rejection. Мониторить по операционному runbook; runtime failure расследовать без автоматического resume.
- PASS unit/integration не считать live PASS. Сохранить ссылки на candidate receipt, preflight, EVAL и фактический итог.

## Готовность и ограничения исследования

План определяет реализацию, зависимости и acceptance. Подтверждены: два несовместимых маршрута; принудительная recoverability в preparation; общий controller fallback; subject-attribution для wrapper; dashboard scope mismatch. Дополнительно выявлен риск перезаписи запрета retry в prepareError. Для остальных transports, restart/crash и всех dashboard mutations предусмотрены проверочные сценарии; их сбой не заявляется как уже воспроизведённый.

При реализации уточнить минимальное расширение существующей записи retry для progress signature после проверки схемы storage; не заводить отдельный журнал или универсальный retry framework. Изменение storage, если необходимо, включает совместимое чтение старых rows, migration test и schema version. Решение должно быть принято до WP2 integration, с описанием в этом плане.

## Реализация и проверка

- Введён единый dependency-free lifecycle route contract; все 11 маршрутов принимают оба runtime-owned ID, а MERGE больше не расходится с остальными стадиями.
- Preparation сохраняет terminal/unknown disposition; корректирующий successor создаётся только для доказанно исправимых отказов. Подпись ошибки и входных bytes останавливает неизменный второй отказ без третьего retry.
- Controller перед generic wrapper извлекает текущую durable lifecycle-причину, учитывает generation/stage и не поднимает superseded outcome. Eval относит generic wrapper к undetermined, а внутреннее нарушение lifecycle-контракта — к infrastructure.
- Dashboard refresh использует resolved scope только для соответствующих lifecycle mutations; read-only команды не становятся мутациями.
- Обновлены route-matrix, preparation, retry/no-progress, causal failure и eval-attribution tests, а также monitoring runbook.
- Проверки checkout: typecheck, lint, release tests, build и runtime-sensitive 29/29 PASS; integration 1512/1513 PASS, единственный cleanup-fixture race отдельно воспроизведён как PASS. Окончательный обязательный gate выполняется на immutable release candidate.

Реализация готова к release qualification. Новый E2E запускается только с опубликованным пакетом, точным build tuple и чистым checkpoint без runtime state CP-128.
