# 086 — отчёт реализации

## Изменения и границы

Реализованы D2–D7 и D9–D12 плана. D1 остаётся ошибкой оцениваемого candidate:
оператор не исправлял продукт и исторический EVAL. D8 отозван после чтения
collector: он уже сохранял полный inventory; ослабления custody не требуется.

dd-tasks сохраняет native module/suite/hook/collection ошибки Vitest, фазу,
SQLSTATE и ограниченную редактированную диагностику. SQL integrity может стать
source repair только при доказанной готовности owned disposable test world.
Wrapper проверяет финальную cleanup receipt, включая malformed/orphan/symlink
случаи; неполная агрегация и инфраструктурные ошибки не разрешают product repair.

Engine использует общий classifier после проверки physical settlement и
digest-bound engine outcome. Work получает штатный corrective successor в той
же Session с `--retry-check` и `--reason`; исправленный source может иметь новый
hash, но execution contract и latest-receipt fence сохраняются. CODE,
CODE-REVIEW и MERGE используют тот же disposition. При reconcile статус считается
после blockers; unbound outcome не даёт PASS. Принадлежность source фиксируется
при capture: последующий rename/delete не отменяет repair, а изначально missing
или escaped file не получает authority задним числом.

EVAL сохраняет компактную первичную check-диагностику и только frozen/bound refs.
Baseline failure по-прежнему запрещает product repair. Формат исторических
case-acceptance receipts не изменён.

## Проверенные источники

- engine: `1d7730cb538055a9098e44b21aa4a43921e7f5cc`;
- dd-tasks tooling: `a5e1b8ced623330f0a2d80fecbf66cdacc3c64c3`, PR 9,
  squash main `a31cc0c2e86a4b69521cb8a247926f5e828d4d4d`;
- чистая product база: `26bf561f175450337a999fdb114580e641c99cde` + только
  tooling cherry-pick, итог `b791fea498364465e51e43bd0674b4e212403c9a`,
  immutable tag `eval/plan-086-clean-tooling`;
- canon: `1ddedf9d3f086e046f8e7b194c739ec386e7c8b9`, версия 4.1.2.

Draft checkpoint CP229 намеренно **не launchable**: engine checksum ещё нет,
beta.137 — версия исходного package, не новый опубликованный artifact. Release,
matrix qualification и запуск требуют отдельной авторизации.

## Проверки

Evidence: `/Users/deksden/.dd-eval/implementation-evidence/plan-086/`.

- Engine targeted: 249/249 PASS; дополнительно public lifecycle stdin,
  redirection/heredoc, changed/renamed/deleted source, crash/unbound sidecar,
  reserved paths и missing-at-capture negative regressions.
- dd-tasks tooling: 21/21 PASS с настоящими Vitest/Playwright/Postgres.
  Full quality PASS; clean baseline: API 29, web 11, integration 11, browser 6/6,
  world isolation PASS.
- Native Vitest beforeAll FK 23503 → wrapper report → engine classifier:
  `source_repair`, реальная cross-repository disposable regression PASS.
- EVAL полный offline suite: 888 tests, 883 PASS, 0 FAIL, 5 SKIP. Skips требуют
  отдельной installed Memory/setup приёмки; они не объявлены PASS.
- Engine typecheck/lint/strict canon build PASS. Итог полного набора engine
  suites записывается после завершения в PR; merge запрещён при его ошибках.

Первый полный engine запуск не получил `DD_FLOW_E3_CANON_ROOT`: две E3 проверки
отказали до исполнения. E3 повторён с явным зафиксированным canon; это ошибка
окружения проверки, не повод ослаблять контракт. Предыдущие отменённые и неверно
настроенные gate logs сохраняются, но не считаются PASS.

Новые EVAL не запускались; исторические runtime артефакты не менялись.
Собственный временный Postgres-контейнер удалён после проверок; evidence сохранён.
Ponytail: native runner API, существующие receipt/repair primitives, без нового
framework, classifier model, daemon, БД или blanket retry.
