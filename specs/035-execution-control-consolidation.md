# 035 — Централизация управления dd-eval / dd-flow / adapters

Дата: 2026-09-15. Статус: целевой контракт и план, реализация не завершена.

Каноническая [спецификация управления](../../dd-flow-cli/.memory-bank/spec/system/execution-control-contract.md)
и [план P1–P8](../../dd-flow-cli/.memory-bank/plans/execution-control-consolidation.md)
принадлежат dd-flow-cli. Ссылки предполагают соседние checkout dd-flow-cli/dd-eval;
repository-relative owner path указан в ссылке. Не копировать спецификацию сюда.

## Обязательства dd-eval

Расследование fork-013 и приоритетная последовательность исправлений зафиксированы
в [сводном плане](../../dd-flow-cli/.memory-bank/plans/fork-013-systemic-recovery-fix.md).
Особенно проверить F9: recovery_blocked не означает cleanup=settled и не разрешает
freeze/Judge до подтверждённой стабилизации артефактов.

- Владеть сценарием, предусмотренным HITL, результатом, Judge и общим бюджетом эвала.
- Управлять Subject RUN через dd-flow drive/control/scope API. В managed режиме
  не определять settlement по PID, daemon JSON и legacy driver-recovery.
- Хранить идентичность RUN, generation, revision и source receipt. Потеря ответа
  CLI не означает падение Subject и не разрешает повторный productive dispatch.
- Разделить execution, cleanup, recovery и observation в schemas/status/report.
  Recovery blocked и завершившийся observer не отображать как awaiting_provider.
- Бюджет eval observer ограничивает ожидание клиента. Recovery бюджет и переходы
  принадлежат dd-flow; eval не выдаёт новый budget повторным запуском observer.
- Собственные observer/Judge processes остаются в ответственности eval через
  существующие общие механизмы registry и process lifecycle.

## Область миграции

`lib/runner.mjs` (finalizeRunProjection, captureRecoveryEvidence, runnerCleanup,
runnerResume, runnerCancel и status), `lib/eval-resume-worker.mjs`,
`lib/recovery-observation-budget.mjs`, `lib/process-json.mjs`,
`lib/daemon-control.mjs`, `lib/daemon-operations.mjs`, `lib/driver-recovery.mjs`.
Сначала определить callers для managed Subject, focused/legacy и Judge; нужные
standalone пути сохраняются, managed путь перестаёт их использовать.

## Проверка и дальнейший запуск

В P6/P7 общего плана проверить весь переход от failed execution через cleanup
до отчёта и выхода observer, включая смерть controller и повторный reconcile.
Тесты: `test/runner-control.test.mjs`, `test/runner-fork.test.mjs` и существующие
schema/status suites. Проверить, что API-проекция работает без чтения внутренних
файлов daemon. Живой E2E — P8 после сборки и scoped qualification.

Fork-012 остаётся свидетельством дефекта; незапечатанный recovery не считается
готовым checkpoint. Выбор точки fork и нового immutable engine подтверждается
read-only preflight. Матрица оценки продукта и canonical answers не меняется.
Предыдущий [план fork-010](../runbooks/cp-108-fork-010-systemic-fix-plan.md)
сохраняет прочие обязательства; правила времени/остановки уточняет спецификация 035.
