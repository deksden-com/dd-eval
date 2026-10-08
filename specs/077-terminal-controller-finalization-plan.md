# 077 — Финализация терминального RUN и доказанное завершение EVAL

Статус: реализован и проверен детерминированными gates; это не живая приёмка. 2026-10-08.

Результаты, ограничения проверок и exact immutable candidate зафиксированы в
[implementation receipt](../runbooks/cp-208-terminal-finalization-implementation.md).

## Цель и границы

После завершения последнего этапа существующий controller должен сохранить
финальный sealed capture, закрыть принадлежащие ему native Sessions/daemons,
подтвердить физическое завершение и дать EVAL выполнить acceptance/Final Judge.
RUN done не равнозначен завершению controller, cleanup или успешному EVAL.
Контракт общий для Luna, ZCode, AGY и Grok, inline и server MERGE.

Не исправляем продукт, не меняем канон/модели, не увеличиваем таймауты,
не ослабляем ownership/generation fences, не запускаем новый controller на
терминальном RUN. Исторический CP-207 не resume/restart и не переписываем.
Новый живой прогон — отдельная приёмка после реализации и разрешения запуска.
Порог .75 и независимый Final Judge audit уже реализованы отдельно в 568da6a;
не повторяем эту работу. Исторический CP-207 сохраняет .93 и старый prompt.

## Установленные факты

EVAL-20261008145700-b1f10fc5, home
/Users/deksden/.dd-eval/qualification/cp-207-luna-full-decisions.
Engine beta.125/source 356a4e1; subject RUN-001-eval-subject.
Все семь этапов done. MERGE done 16:26:18.928 UTC, RUN done 16:26:19.051,
integration commit 64f44e4891798ab413747b16884ce69541363d1a.
Последний session.prompt завершён 16:26:39.457; controller recovery_required
с invalid_run_state в 16:26:39.554. MERGE capture даже не создан (есть шесть
предшествующих boundary captures). run_controls пуст. Последняя native Session
не отмечена stopped, controller вышел; observer исчерпал recovery observation.
Final Judge не запускался. Это финализация инфраструктуры, не доказанный
продуктовый дефект и не ошибка Decisions: .88 < frozen .93 корректно вызвало Judge.

Источники: RUN timeline, controller log/events/operations/state, read-only
executions/e2e/dd-flow-home/db.sqlite, managed-runtime.json, EVAL report/status.
Код проверен в dd-flow-cp198-implementation (d4ae392) и dd-eval-076-decision-audit
(568da6a); runtime source указан отдельно, не подменён текущим HEAD.

## A. Разделить admission и поддержание существующего владельца

Файлы dd-flow: run-controller-process.ts, run-controller.ts,
run-recovery-guard.ts; соответствующие lease/resume tests.

1. assertLaunchAllowed оставить строгим для prepareSpawn: терминальный RUN
   не допускает нового продуктивного физического controller.
2. Из assertLeaseFence убрать именно launch-state проверку. Переиспользовать
   recovery/generation checks; при необходимости выделить только общий guard
   из существующей функции, без нового framework/lease-сервиса.
3. Сохранить exact controller token/generation, PID/birth и resource lease
   checks. Recovery-controller проверяет retained recovery_id/control_id и
   допустимую фазу recovery, как до исправления. Нельзя просто заменить всё
   одним assertRunMutationAllowed и потерять recovery binding.
4. Уже работающий владелец может renew при RUN done/failed/cancelled только
   ради наблюдения, capture и settlement. После terminal continuation не
   отправляется новый продуктивный prompt, child dispatch или MERGE.
5. Сохранить порядок: durable terminal boundary → sealed capture → session
   settlement → controller terminal → physical lease retirement. Failure
   любого шага не превращается в completion.

Регрессия: RUN становится done внутри последнего prompt до его возврата;
следующая foreground renewal и background renewal не отвергают владельца.
Stale token/generation, foreign PID, expired/lost lease и чужой recovery
по-прежнему запрещены. Новый launch на done/failed/cancelled запрещён.
Проверить обычный и восстановленный existing owner отдельно.

## B. Terminal stop — реальное settlement, а не ложный no-op

Файлы dd-flow: run-control.ts, run-control-worker.ts, controller failure path,
существующие owned inventory/capture helpers и contract tests.

1. Удалить безусловный terminal early return для stop. Для pause terminal
   оставить no-op: продуктивное продолжение не разрешаем.
2. Stop на terminal RUN проходит существующий durable control intent,
   recovery fence, worker, exact owned inventory, drain/close и sealed capture.
   Не создаём параллельный cleanup API или новый реестр процессов.
3. Предметный RUN/index/stage status и integration commit сохраняются:
   settlement не меняет done на paused/cancelled/failed. Существующий
   setFlowRunRecoveryPaused уже пропускает terminal RUN; проверить весь worker
   и capture путь на другие предположения о running/paused.
4. Повтор того же request_id возвращает прежний receipt; конфликт inputs,
   superseded generation и existing unresolved control сохраняют текущие
   защиты. Даже пустой inventory получает доказуемый settled receipt/capture;
   terminal:true без control_id не считать доказательством cleanup.
5. Только процессы с точным RUN/controller/native binding; PID reuse,
   неизвестный provider tree или смена inventory дают unresolved/blocker,
   а не kill чужого процесса или фиктивный settled.
6. Сохранить primary error до cleanup; ошибки capture/close вторичны и отдельно
   видимы. Не overwrite первопричину ошибкой позднего worker/observer.

Проверки done/failed/cancelled; idle daemon; active turn; dead owner; empty
inventory; close failure; повтор stop; pause no-op; чужой процесс. Проверить
ошибку финального capture и shutdown после успешного MERGE: нет повторного
MERGE и нет нового Subject prompt, но появляется durable control/settlement.

## C. EVAL: ожидать существующую работу, а не отсутствующего владельца

Файлы dd-eval: managed-flow-client.mjs, runner.mjs, eval-resume-worker.mjs,
report/failure classification и существующие тесты этих модулей.

1. Engine status должен различать RUN terminal, controller terminal,
   settlement pending/settled/blocked, capture sealed/missing и worker liveness.
   Использовать существующие receipt поля; добавить лишь отсутствующую
   причинную фазу/identity, если текущих данных недостаточно.
2. Есть живой exact owner/worker и наблюдаемый прогресс — продолжать штатное
   bounded observation. Нет владельца, control intent и sealed capture после
   controller failure — немедленно recovery_blocked с исходной причиной и
   terminal_finalization phase, не ждать бессмысленно полного бюджета.
   Один пропавший PID или временный DB read failure не доказательство: нужны
   authoritative controller/worker/lease identities; неизвестное = uncertainty.
3. Не запускать cleanup/recovery автоматически из read-only status. Создание
   terminal control принадлежит engine failure path из B. EVAL наблюдает.
4. Final Judge/acceptance допускаются только с sealed authoritative candidate
   и доказанным settlement. RUN done не обходит барьер.
5. Подтверждённый engine finalization failure классифицировать как
   invalid_infrastructure_flow. Не добавлять generic invalid_run_state в
   blacklist: тот же код может означать неверный пользовательский запрос.
   Использовать фазу + controller provenance + scope matching; nested error
   сохраняет primary и secondary, legacy без доказательств не угадываем.
6. Report/status должны согласованно показывать failed/recovery_blocked,
   cleanup pending либо settled, judge not run/unavailable; не выдавать PASS.
   Инфраструктурная invalidity не означает, что продукт семантически плох.

Регрессии: terminal done + failed controller/no control; живой cleanup worker;
потеря наблюдаемости; sealed capture + settled cleanup; чужой RUN identity;
generic user invalid_run_state; nested primary error; повтор finalize без
повторного Judge; старые receipts не превращаются в ложный success.

## D. Исправить границу тестового «полного цикла»

dd-flow/test/run-controller-full-cycle.test.ts оба цикла сейчас выходят на
MERGE done. Ждать controller terminal и успешную финализацию; проверять
last_error до успешного выхода. Повторно использовать текущие routes/fixtures.

Обязательные assertions: семь stage outcomes; MERGE применён один раз;
последний boundary capture completed/sealed с нужными stage/attempt/scope;
все Sessions stopped; native daemons/owned productive trees закрыты;
controller process/lease retired; отсутствие productive dispatch после terminal.
Fixture cleanup afterEach не считается доказательством, assertions до teardown.
Покрыть inline/server MERGE и существующие четыре adapter routes, retained
recovery path и stop_after (target reached != full_case_completed).
Асинхронный выход процесса наблюдать по receipt/identity, а не sleep «на удачу».

Добавить один межслойный regression engine receipt → EVAL projection →
acceptance/Final Judge readiness. Native модельные вызовы не нужны для
детерминированного воспроизведения ошибки в guard.

## Порядок реализации и gates

1. Изолированные task worktrees по git-workflow; не менять frozen CP-207 home.
2. Сначала failing regression A/D, затем shared guard fix A.
3. Terminal failure/stop regressions и B; затем C и межслойная проверка.
4. Аудит всех callers изменяемых guards, terminal stop/cleanup/capture paths;
   отрицательные security/ownership проверки обязательны.
5. dd-flow typecheck/build + targeted controller lease/capture/control/resume
   и full-cycle gates; dd-eval targeted observer/report/finalize + required
   repository checks. Точные команды взять из текущих package scripts/runbooks
   и записать в implementation receipt вместе с counts/skips/failures.
6. Review diff; commit/push в task branches, интеграция по проектной политике.
   Immutable новый engine candidate; pin exact hash/version в новых определениях.
   Исправление упряжки не повод повторять неизменную Judge qualification.
7. В receipt отделить deterministic implementation PASS от live acceptance.
   При отдельном разрешении — новый full E2E, не resume CP-207. Проверить
   финальный capture/cleanup, запуск Final Judge и его независимый decision audit.

## Методическая проверка готовности / ponytail

- Две причины разделены: неверный renewal guard и terminal cleanup early return;
  тестовая слепая зона и EVAL projection покрываются отдельными gates.
- Решены terminal pause/stop, idempotency, status preservation, stale owners,
  background/foreground races, recovered-owner binding, capture/close failures,
  report attribution и historical compatibility.
- Нет новой state machine, dependency, whitelist или увеличения таймаутов.
  Используем имеющиеся lease, guard, control worker, inventory и sealed capture.
- Не требуется изменение product/fixtures/model thresholds или дорогая полная
  Judge qualification. Независимые уже сделанные изменения 076 не дублируются.
- Все критерии приёмки проверяемы; открытых продуктовых/политических решений
  нет. Раскладка мелких helpers/полей определяется минимальным diff при реализации,
  но семантика, ответственность и отрицательные границы зафиксированы здесь.

Готовность реализации подтверждается отдельным implementation receipt после
завершения gates. Исторический live CP-207 остаётся неизменным.

## Уточнения при реализации

- Renewal использует общий recovery/generation guard без capture-writer fence:
  собственный capture не должен прекращать keepalive владельца. Новые launch и
  lifecycle writers сохраняют строгий fence.
- Запрет свежего native dispatch стоит в общем adapter entrypoint после ветвей
  retained receipt/reconciliation. Терминальный RUN не препятствует чтению и
  settlement уже отправленной операции.
- Terminal cleanup receipt не разрешает productive recovery: проверка terminal
  RUN выполнена на prepare/resume/accept и повторена в publication transaction.
- Read-only status выдаёт причинный terminal-finalization receipt только для
  точной фазовой ошибки и связанного controller/RUN/project. Dead PID без
  подтверждённого retirement не означает absent; capture-operation recorded
  не означает sealed. EVAL не угадывает причины legacy ошибок.
- Полный цикл проверяет snapshot digest/identity и retirement до teardown.
  Матрица покрывает четыре server routes и один общий inline путь, без ненужного
  Cartesian удвоения. Общий test-only ceiling включает семь ранее не ожидавшихся
  bounded capture episodes; production budgets не изменены.
- Engine candidate остаётся built, не accepted: targeted deterministic gates
  не заменяют полный release suite set или отдельную живую E2E-приёмку.
- Shutdown regressions различают восстановимый отказ до physical stop и
  durable unclean shutdown. `clean:false` не исправляется предположением о
  смерти процессов: сохраняется blocker без sealed recovery. Исправлена
  семантика mock injection, operation inspection и cancel-tree journaling;
  production proof guards не ослаблены.
