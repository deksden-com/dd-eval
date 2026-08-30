# Принятие PLAN: REV-107

## Решение

Принято как входная граница для `PLAN-REVIEW`.

## Основания

- План разделяет вертикальную поставку на P1 (persistence/API/atomic archive
  boundary) и P2 (UI/browser path) с единственной обоснованной зависимостью
  P2 → P1.
- Узкие проверки остаются у владельцев, а `pnpm quality` и `pnpm docs:check`
  впервые корректно назначены общему CODE-gate после fan-in. Это устраняет
  ошибочную схему REV-106, где P2 получала aggregate gate без права исправить
  P1-файл.
- Граф содержит точный контекст, область записи, acceptance traceability и
  отрицательную atomic-проверку. PLAN-REVIEW ещё должен критически проверить
  документирование SCN-002 и прочие смысловые границы.

## Неблокирующее наблюдение

`stage-report.json` печатает project-файл `plan.json` как относительный путь
с префиксом `../dd-flow-home/…`, потому что использует stable project root
вместо immutable workspace root. Batch и семантический plan от этого не
зависят; это дефект нормализации отчёта, а не причина отвергать вход в review.

## Проверенное доказательство

`reference/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/03-plan/code-work-batch.json`
