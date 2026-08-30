# Принятие PLAN: REV-108

## Решение

Принято как входная граница для `PLAN-REVIEW`.

## Основания

- Граф P1 → P2 → P3 отражает реальную зависимость: сначала server-authoritative
  persistence/API, затем UI/browser, затем durable product/system/feature/
  scenario contract, который опирается на оба готовых поведения.
- Проверки сфокусированы на владельцах; aggregate `pnpm quality` и
  `pnpm docs:check` назначены общему readiness/CODE gate, а не leaf Work.
- PLAN явно классифицировал связанные документы и назначил обновление
  `SCN-002` единственному владельцу P3, устраняя дефект REV-107.

## Неблокирующее наблюдение

`stage-report.json` всё ещё нормализует project `plan.json` через stable root,
поэтому отображает относительный путь с `../dd-flow-home/…`. Семантический
план и batch используют корректные portable references; это дефект отчёта,
который нужно исправить отдельно.

## Проверенное доказательство

`reference/dd-flow-home/projects/PRJ-001-project/checkouts/worktrees/RUN-RUN-001/project/.memory-bank/protocol/PRT-007-task-priority/plan.json`
