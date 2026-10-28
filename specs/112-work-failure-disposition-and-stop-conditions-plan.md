# 112 — Осмысленные границы остановки и разбор отказа Work

Статус: реализован 2026-10-28; адресная приёмка завершена.
Результаты: [implementation receipt](112-work-failure-implementation.md).
Дата: 2026-10-28. Ponytail full: существующие Work, controller events/operations,
retry, stage block/pause и repair; без нового scheduler, decision-модели,
regex-классификатора причин или универсального автоматического повтора.

## Цель и границы

Нормальное обнаружение несоответствия реализации принятой цели не останавливает
флоу. Если worker действительно не может продолжить, его диагноз возвращается
координатору и получает исполнимое решение. Ограничение одного доказательства
не объявляется недоступностью всей задачи. Не принимать непроверенную работу,
не ослаблять пользовательские требования, не повторять неизвестные эффекты.

Меняем flow/engine/canon/EVAL reporting, не продукт dd-tasks. Не переписываем
CP262 и его артефакты, не запускаем новые E2E при реализации этого плана.
Исторический результат остается completed_with_failures.

## Доказанный случай и дополнительные источники

Luna EVAL-20261028144542-3b532d0c, engine beta.157 / source 8f858471.
WRK-010 принят 16:13:41Z; WRK-011 начат 16:14:22Z. В 16:51:58Z worker
успешно вызвал work fail с текстом semantic blocker и browser limitation;
checks=[], native child completed в 16:52:11Z. В 16:52:13Z controller
увидел failed Work и завершился fanout_child_failed. Это не native/provider
failure и не отказ work-scoped check. Прежняя техническая классификация неточна.

- `dd-flow-cli/src/services/vnext-plan.ts`, planExample: пример
  `Stop if accepted scope conflicts with current truth` провоцирует ложную остановку.
- PLAN/canon schema execution_context.stop_conditions использует непустой
  strings; work packet validator также требует непустой stop_conditions.
  Пустой список реальных причин остановки должен быть допустим.
- `work-registry.ts`, worker renderer: все stop_conditions названы hard boundaries;
  одновременно planned_write_areas объявлены мягкими подсказками.
- `controller-child-repair.ts`: коррекция завершившегося child рассматривает
  только Work=running с доказанным отказом work_finish/successor. Это правильная
  узкая ветка, а не обработка explicit work fail.
- `controller-fanout.ts`: failed/cancelled Work безусловно бросает
  fanout_child_failed; plain-text result теряется при попытке JSON.parse.
- `vnext-code.ts`: aggregate/semantic repair работает после fan-in/finish,
  поэтому не может исправить предшествующий failed dependency.
- `dd-eval/lib/runner.mjs`: generic fanout_child_failed получает execution_failure,
  source=unknown и native_failure_evidence_unconfirmed даже при явном work fail.

## 1. Предотвращение: единый семантический контракт

Изменить общий PLAN example, PLAN/PLAN-REVIEW/CODE/worker instructions в engine
и `.memory-bank/dd-flow` canon, затем проверить sibling/legacy examples,
schema examples и browser proof guidance тем же поиском.

1. Текущая реализация — исходное состояние, не дополнительное требование.
   Несоответствие реализации принятой цели исправляется в рамках этой цели.
2. Неожиданный файл/слой проекта — coordination drift, не изменение scope.
   Разрешено необходимое project-local изменение; нельзя писать одновременно
   с другим владельцем или нарушать действительно принятые ограничения.
3. Настоящая причина остановки: конфликт действующих принятых решений,
   отсутствующее пользовательское решение без допустимого default, необходимое
   запрещенное действие или реально недоступный ресурс/метод доказательства.
   Остановить затронутое действие, сохранить диагностику и вернуть координатору.
4. PLAN stop_conditions не создают новые пользовательские запреты. Синтезированная
   моделью stop condition не может молча отменять принятую цель. При конфликте
   не игнорировать её молча: координатор документирует интерпретацию/эскалацию.
5. Допустить `stop_conditions: []` в engine/canon schemas и batch validation.
   Не ослаблять общую `$defs/strings`, required_read и другие массивы. Сохранить
   существующую форму/версии payload: эта schema-правка только разрешает пустой
   массив; старые непустые документы остаются совместимыми. Основная схема —
   engine `src/schemas/vnext-protocol-plan.schema.json` и соответствующий
   canon `vnext-protocol-plan.schema.json` (`protocol-plan@6`), не путать с
   legacy `protocol-plan.schema.json`. Проверить также публикуемые копии/примеры.
6. PLAN-REVIEW проверяет по смыслу: stop condition защищает конкретную границу,
   а не запрещает цель; у ограниченного evidence указан точный критерий и путь
   эскалации. Это часть существующего review, без нового model gate.

## 2. Worker: сначала результат/диагностика, не blanket fail

- Work-scoped check отказал: сохраняется running Work, используется выданный
  retry-check/successor после исправления. Не переводить его в failed только
  потому, что тест нашел дефект. Сохранить completedChildRepair без расширения
  его полномочий на terminal failed Work.
- Ограничение среды: сообщить координатору точный affected action/criterion,
  evidence ref и что уже сделано. Не объявлять это новым вопросом о продукте.
- Нужное пользовательское решение: координатор пользуется stage pause/HITL.
- `work fail` остается валидным терминальным результатом попытки, в том числе
  для legacy workers. Он не равен provider failure и не является самостоятельным
  решением завершить весь RUN. Одна только правка промпта недостаточна.

Не вводить отдельную Work status machine только ради этого случая. Для
неуспешной попытки достаточно уже существующего retained failure + disposition.

## 3. Controller: failed Work возвращается на разбор координатору

Вместо unconditional throw для доказанного explicit `work fail` добавить в общий
orchestration path действие `resolve_work_failure`. Применять к native и external Work исполнению, не
создавать реализацию на каждый harness. Проверить PLAN-REVIEW/CODE/CODE-REVIEW
и generic/native/external consumers; специализированные memory repair contracts
и лимиты не обходить общим обработчиком.

### Вход разбора

Текущий failed Work/attempt, исходный reason (text или structured), выданный
packet и stop conditions, принятые requirement/non-goal refs, результаты
предшественников, checks/receipts, реальные browser capability facts, уже
сделанные изменения, зависимости и native settlement/writer observations.
Большие данные передавать путями к сохраненным артефактам, не обрезанным reason.

### Решение и исполнение: использовать существующие команды

Координатор получает precreated абсолютный путь небольшого decision JSON и
диагностический packet. Он сдаёт решение, а не сам исполняет retry/block/pause.
Контроллер валидирует binding и исполняет существующие scoped service APIs;
это не новый public CLI resolver и не новая машина состояний Work. Подробный
контракт принятого решения и recovery — раздел 8.

| Ситуация | Действие |
| --- | --- |
| Работа выполнима в принятом scope; ошибочная интерпретация stop condition | Сдать action=retry с конкретной коррекцией; controller использует существующий retryWork service (`work retry --reason`), затем свежий child того же Work с историей, без повторного выполнения принятого predecessor. |
| Нужна project-local коррекция после уже принятого predecessor | Тот же разрешенный retry failed Work выполняет необходимое изменение, включая другой слой проекта, если оно в принятом scope. Отразить coordination drift и затронутые проверки; история принятого predecessor остается историей, конечный workspace проверяется aggregate gate. Не перезапускать predecessor. |
| Недоступно техническое действие/доказательство | Сдать action=block с kind/code/summary; controller применяет существующий stage block к running coordinator Work, не к failed child. Failed child сохраняется как причина; returned unblock возвращает тот же episode. |
| Нужен новый выбор пользователя | Сдать action=pause с вопросом только о недостающем решении; controller применяет существующий stage pause к running coordinator Work. В EVAL — обычный fixture/Judge path. |
| Цель действительно не достижима в текущих разрешениях | Явный обоснованный failure outcome с сохраненной причиной; не generic provider error. |

Для CP262 не нужен новый corrective graph: planned_write_areas уже soft, а
необходимая project-local коррекция остается в принятом scope того же Work.
Не выдавать координатору произвольное переписывание принятого PLAN/графа.
Если требуется действительно новое решение или несовместимое изменение цели,
использовать pause/HITL, а не маскировать его как retry. Существующие aggregate
repair Work сохраняют свое назначение; не переиспользовать их через фиктивный
code_gate_failed без реально исполненных checks.

### Идемпотентность, конкуренция и завершение

- Ключ episode: RUN + Stage attempt/cycle + failed Work + original work_session/
  receipt hash. Generation привязывает текущий dispatch, но не создает новый
  correction budget. Использовать controller events/operations, не новую БД/демон.
- Одно доставленное действие на один episode. При потерянном ack читать retained
  operation, не посылать второй prompt/не открывать дубль Work attempt.
- Не продолжать, если прежний child/CLI/check может писать; дождаться/сверить
  native outcome и owned resource state. Native idle cleanup без возможного
  writer не должен блокировать содержательное решение.
- Worker отменен оператором/run control — не отменять волю оператора. Не делать
  автоматический retry отмененного Work; перенос решения отмены за пределы
  обычной failed Work correction.
- Provider outage/quota/auth обрабатывает существующая provider policy;
  семантический coordinator path не обходит исчерпанный provider budget.
- Независимые ready ветви могут продолжаться ДО применения общего Stage block,
  когда это не конфликтует с явным pause/control и текущими писателями. Текущий
  stage block приостанавливает Stage целиком: не обещать per-criterion scheduler.
  Сначала выработать disposition и сохранить его как pending до fan-in
  независимых ветвей; после них применить block к coordinator. Для action=pause
  пользовательского решения и внешнего stop/control остановка применяется сразу.
  Зависимые от failed Work остаются blocked; исполненные ветви не повторяются.
- Неуспешное повторение без содержательного изменения не создает новый episode
  лишь из-за нового UUID. Для одного origin failed Work разрешить одну automatic
  corrective attempt; повторный отказ передать в видимый blocked/needs-attention
  с исходным и новым диагнозом. Дальнейший повтор — только явное новое решение
  с причиной. Не фальсифицировать success и не запускать бесконечный triage.

## 4. Browser capability: область доказательства, не scope продукта

- `unsupported` для native-select focus/ArrowDown/Enter означает отсутствие
  доказательства этой операции в этой tuple; не менять requirement и не
  выдавать selectOption за keyboard evidence.
- PLAN не должен превращать факт в невозможность UI implementation. Прочие
  Work/checks продолжаются при отсутствии конфликта; затронутое обязательное
  acceptance остается unverified с конкретным evidence/tooling blocker.
- Если требование допускает другой способ доказательства, координатор выбирает
  его по смыслу и фиксирует предел; не признавать эквивалентность по regex.
- Если обязательное доказательство недоступно, не принимать соответствующую
  Stage как fully verified. Итог execution и assessment/technical notes раздельны.

## 5. Диагностика и EVAL

- `controller-fanout` сохраняет plain reason и структурированный результат,
  source Work/attempt/ref, native outcome отдельно. JSON parse failure не
  уничтожает причину и не требует миграции исторического text result.
- Native completed + Work failed не маркировать как native provider failure.
- Сводка показывает active child activity и текущий blocker, а не только stale
  last lifecycle failure. Преодоленный refusal остается history, не current error.
- `runner.mjs` использует детерминированный disposition/event, а не текст reason:
  semantic Work failure, technical dependency, provider failure и unknown остаются
  разными фактами. Judge оценивает правильность решения агента; engine не делает
  продуктовую экспертизу вместо Judge и не «озеленяет» результат.

## 6. Проверка только затронутых зон

1. PLAN example больше не предлагает baseline/goal mismatch как стоп; пустые
   stop_conditions принимаются, пустые required_read/невалидные элементы — нет.
   Engine/canon examples и generated worker packet согласованы.
2. Replay CP262: native completed + explicit work fail + checks=[] приводит к
   coordinator disposition, сохраняя исходный reason, а не native_failure.
3. In-scope correction: failed history сохраняется; retry выдан ровно один раз;
   новая child-попытка завершает Work, зависимый P3 разблокируется, CODE finish
   по-прежнему выполняет все обязательные проверки.
4. Cross-layer correction в retry того же Work: accepted predecessor не
   запускается повторно, зависимый continuation ждет принятия исправленного
   Work; общий writer исключен, aggregate tests видят конечный workspace.
5. Точный browser blocker не закрывает независимую Work и не превращает
   unsupported keyboard proof в PASS. Неразрешенный обязательный criterion
   останавливает только нужную приемку с правильной причиной.
6. Repeated no-progress refusal, quota/auth, operator cancel, running child/check,
   unknown effects, parent mismatch — не вызывают blind retry или обход control.
7. Потеря ack/рестарт controller/повторный status не дублируют model prompt,
   retry, новую Work attempt, pause или block. JSON/text historical reason читаются.
8. Общий native/external contract offline; adapter stubs по поддерживаемым
   harness identities. Для этого routing не требуется live model qualification
   каждой упряжки, новый capacity probe, полный engine gate или GitHub CI.
9. Dedicated disposition obligation принимается по связанному JSON, не по
   Stage finish. Reply/ack lost до и после каждого write/commit не приводит
   к повторному prompt/retry, а missing/malformed decision не означает success.
10. Новый worker действительно получает сохраненную конкретную коррекцию;
    исходные requirements и старый packet остаются неизменными. Новый Work start
    связан с новой attempt, не с terminal ссылкой прежнего child.
11. External повтор с сохраненным terminal work_launches: старый запуск
    архивируется, новая attempt получает новый operation_id и state_dir;
    активный/неизвестный старый launch не сбрасывается. Повторный dispatch новой
    attempt идемпотентен и не возвращает outcome предыдущей attempt.
12. Explicit work fail, reconciled native fail и operator cancel с одинаковой
    строкой reason не смешиваются. Старые observer fences не снимаются generic
    disposition. Новый child не повторно связывает историческую work_session.

## 7. Очередность и критерий готовности

1. Согласовать семантику prevention/disposition и одну automatic corrective
   attempt на origin failed Work; это принятый в проекте плана предел, не TODO.
2. Адресным тестом закрепить существующий work retry → архив → issued start →
   свежий child → completed → dependent ready, включая project-local drift.
3. Engine + canon examples/schema/prompt, общая controller ветка и diagnostics.
4. EVAL presentation/classification; адресные regression tests/contract build.
5. Review диффа, commit/push/merge по правилам каждого репозитория — отдельное
   разрешение на реализацию. Release/pins/E2E — отдельная задача.

Ponytail review: убрана первоначальная идея отдельного corrective graph для
межслойной коррекции — существующий project-local retry достаточен. Нет нового
resolver command/DB/schema состояния Work; не ослаблены реальные trust/control
границы и acceptance. Реализация начинается после согласования этого плана;
новых model calls/изменений runtime сейчас нет.

## 8. Закрытые readiness-пробелы: протокол решения и исполнение

### 8.1. Где разрешен разбор

Новый путь допускает failed non-root Work текущего project/RUN/Stage attempt и
cycle с подтвержденным явным worker `work_fail` settlement. Источник — existing
`lifecycle.work_settlement`/settled lifecycle invocation и matching work_session,
не разбор текста result. Parent/coordinator Work обязан оставаться running.
Семантический выбор делает координатор; факты статуса/владения — runtime.

`native_child_observation`, provider error/exhaustion, unproven identity,
operator cancellation, specialized memory/interactive contracts не становятся
eligible только потому, что works.status=failed. Их текущие recovery/admission
правила сохраняются. Если доказательства источника нет (старый ручной fail),
сохранить diagnosis и требовать явного operator resolution, не угадывать.
Для PLAN-REVIEW/CODE-REVIEW допускается только failure выполнения порученного
reviewer Work, не изменение уже принятого содержательного needs_changes/blocked
вердикта: такой completed reviewer result обрабатывает существующий review flow.

### 8.2. Decision artifact вместо свободного «продолжай»

Использовать один локальный typed JSON `work-failure-decision@1` с полями:
`episode_id`, `action` (retry|block|pause|fail), `reason`, `evidence_refs` и
action-specific `correction` / `blocker{kind,code,summary,retryable}` / `question`.
Binding project/RUN/generation/Stage/attempt/cycle/failed Work/work_session и
failed-result hash фиксирует controller packet; agent его не выбирает.
Лишние поля/несовпавший episode отклоняются на этой action boundary, не через
полный новый gate. Файл/родительский каталог создает runtime до выдачи пути.
Никакой оценки правильности продукта детерминированным validator.

`ControllerObligation` получает отдельное действие `failure_resolution` и
episode/ref binding. В `run-controller` оно не отображается в default `finish`.
Проверять failure-resolution binding ДО общего shortcut `stage done => true`:
завершение чужой/старой Stage не является сдачей текущего решения.
Успешная сдача bound decision != примененный retry != успешный Work != Stage
completed. Predicate приема проверяет файл и persist accepted decision перед
продолжением, а исполнение действий отслеживается отдельным existing controller
operation. Поздний native error после принятого decision не отменяет его.
Нет решения/невалидный JSON: один actionable correction того же вывода с
диагностикой; второй такой отказ — видимый controller dependency pause, без
бесконечной генерации и без retry failed Work.

### 8.3. Durable action на существующих primitives

В controller events хранить requested → decision_accepted → action_reserved →
action_applied (или blocked/failed); операции использовать для dispatch/recovery.
Это записи событий, не новая таблица/новый daemon. episode fingerprint включает
полный Stage attempt/cycle, original work_session ID и failed receipt hash;
generation — fence текущего dispatch, но смена controller/generation НЕ сбрасывает
correction budget для исходного Work/attempt.

После принятия решения повторно сверить current owner/control, stage membership,
failed attempt и отсутствие старого writer, затем вызвать existing services:

- retry: сохранить action intent, `retryWork`, связать archived ATT-NNN и новый
  `current_start_invocation_id` с episode, dispatch обычным fanout;
- block/pause: target = running coordinator Work Stage; failed child не открывать
  ради блокировки. После resume/unblock заново сверить факты того же episode:
  снятие внешней блокировки само не является retry authority/изменением scope;
- fail: существующее terminal failure/finalization, но с кодом explicit Work
  disposition, reason/ref и cause chain. Не делать фиктивный stage finish.

`retryWork` поддерживает `.retry.json`/archive, но CLI ack не является durable
episode receipt. Потерян ack: читать archive, Work state и start invocation,
доводить ровно сохраненную подготовку; НЕ повторять retry как новую попытку.
Reservation и SQL mutation с owner/failed-hash checks; файловую публикацию/чтение,
native stop и model calls не выполнять внутри SQLite write transaction.

`reason` у нынешнего retryWork только возвращается вызывающему. Поэтому отдельно
сохранить accepted decision/correction и передать reference + короткую instruction
в НОВЫЙ work start prompt. Это уточнение исполнения в принятом scope, не rewrite
старого PLAN/accepted requirement. Старые stop conditions оставить для истории,
в новом пакете явно объяснить разрешение спорного условия. Если это невозможно
без изменения пользовательской цели — pause, не retry.

Budget: одна автоматически примененная retry attempt на original failed Work.
Разбор/ожидание block/HITL сам по себе retry budget не расходует. После отказа
этой попытки coordinator делает финальный block/pause/fail, но не второй auto
retry. Статус blocked реализуется существующим running coordinator stage block
(kind engine, code work_resolution_exhausted), не выдуманным RUN status. В сообщении
явно указать потребность operator resolution; unblock не обнуляет budget.
Исторический manual retry вне managed flow не запрещать новой глобальной policy.

## 9. Попытки Work: native и external

### Native

После work retry старая work_session terminal сохраняется; новый child получает
новую issued start authority/новую work_session. Associations и acceptance
используют конкретную attempt, не только общий works.status; позднее событие
старого child не завершает/не отменяет новую попытку.

Retained native failure observer снимает fence только при новом Turn ТОГО ЖЕ
child (`controller-child-observer.ts`). Fresh-child retry нельзя считать таким
событием. Новый explicit-fail disposition не очищает эти fences: в CP262 native
child был completed, fence native failure отсутствовал. При native failed+Work
failed действует прежняя provider recovery, не этот механизм. Сочетание
независимого native-failure fence и explicit Work decision остается action-local
dependency pause до reconciliation, без generic «все обработано».

### External

`external-work-launch.ts` сейчас возвращает любую строку `work_launches` по
work_id; одного retryWork недостаточно. В existing retry preparation добавить:
проверить terminal previous launch и scoped отсутствие writer; сохранить полный
launch row в ATT-NNN вместе с сохраненными operation/state_dir refs; только затем
в той же guarded retry SQL mutation удалить старый CURRENT launch row. Старый
operation directory и resource receipts не удалять и не переиспользовать.
Новый launch уже создает уникальные operation_id/state_dir существующим кодом.
Если старый launch running/unknown — reconciliation, не reset. При crash
архивирования/SQL replay использовать тот же `.retry.json`/episode intent.
В его allowlist добавить только фиксированный `external-launch.json` и binding
старой operation; не разрешать произвольные пути архива из входа модели.
Cleanup/capture старой attempt читают архивную launch reference; consumers,
которые сейчас считают work_launches единственной историей, обновить адресно.
Новый attempt dispatch и повторный запрос его receipt сохраняют текущую
идемпотентность active work_launches. Новая таблица launch history не нужна.

## 10. Итог readiness review и scope

Найдены и включены отсутствовавшие решения: coordinator target для pause/block,
disposition obligation, передача correction новой attempt, lost-ack reconciliation,
external launch history/reset, strict separation native vs explicit failure,
budget across generations, несколько одновременных отказов и Stage-wide block.

Несколько eligible failed Work разбираются последовательно в стабильном порядке
work_id; один active resolution prompt на coordinator. До dispatch изменений
выполненные решения перепроверяются против текущего graph/control. Sibling writer
не отменяется ради triage. После fan-in независимых ветвей unresolved зависимости
не позволяют Stage finish. При отсутствии running coordinator применять existing
technical control/recovery; не создавать root Session и не синтезировать Work.

Расширение затрагивает только доказанные явные failed Work обычного stage fanout.
Смысловое needs_changes результата reviewer, provider continuation, aggregate
gate repair, memory-repair и operator control сохраняют своих владельцев.
Исторические несовместимые RUN работают на своем pinned engine: без фоновой
миграции/переинтерпретации CP262. Реализация не меняет прошлые результаты;
provider вызовы, новые E2E и полный gate не выполнялись.
