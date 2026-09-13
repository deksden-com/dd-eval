# Fix 033: подготовка Luna / ZCode, исправленный checkpoint cp-104

Статус: release gate и опубликованный пакет PASS; два preflight ещё выполняются.
Scored E2E не запускались. Цель — готовность к новому эксперименту, не гарантия
успешного продуктового результата и не полная квалификация всех harnesses.

## Ревью и исправления

Подробности: [Fix 033, раздел 8](../specs/033-cp102-proof-command-and-stop-repair-plan.md).

- Убрано разрешение ручных/external доказательств из CLI, канона и проектного flow-pack. Проверяемые свойства UI/API сохранены; HITL остаётся только в разрешённых вопросах.
- Direct command preflight учитывает cwd, execution environment, quoted path и literal PATH; не выполняет check и не отвергает динамический shell по догадке.
- Retry authority проверена тестами реальных CODE/CODE-REVIEW/MERGE command producers.
- ZCode stop не доверяет cancelled/closed ACK: проверяет residency root/children без resume. Close receipt сохраняется во всех путях shutdown; неполное подтверждение остаётся pending и не открывает Session заново.
- Растущий transcript сохраняется message chunks + manifest с проверкой целостности. Изменившиеся ошибки dd-eval не подавляются вместе с timestamp-only updates.
- Новый bridge commit квалифицирован живым узким probe root/concurrent children/child continuation. Native nested children не поддержаны.

Реализация без новых зависимостей и без отдельного orchestration слоя.
Старые cp-102 EVAL, snapshots и receipts не переписывались.

## Проверки и закреплённые исходники

- dd-flow кандидат beta.55: `84e76cfa798732b3121534551515b02f4a238425`.
- Канон 4.1.1: `97f811d33c212ae3497020178b1ed825c7c3ebac`.
- Проектный flow-pack: `9b121e24f94ac56c2a076cd95e84f427eeea8c6d`.
- Продуктовый baseline НЕ изменён: `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag `eval/cp-074-source-final`.
- zcode-acp 0.13.1: `e0600fe3c46e215695f257e65aa6f674ced998d8`; ZCode 0.16.5.
- zcode-acp полный suite: 801 passed; dd-eval: 221 passed, 8 optional integrations skipped.
- Адресные dd-flow command/lifecycle suites PASS; 21 тест ZCode adapter PASS, daemon regression PASS, typecheck/lint/build PASS.
- [Release gate](https://github.com/deksden-com/dd-flow-cli/actions/runs/34776742452): PASS, 649 tests / 55 files, typecheck/lint/build, OIDC publish, registry readback и consumer smoke. Два предыдущих кандидата отменены до публикации после findings; их незавершённые gates не считаются PASS.
- [Native evidence](zcode-stop-experiment-2026-09-13.md), долговременные копии в `/Users/deksden/.dd-eval/qualification/cp-103-luna-zcode/adapter-probes/`.

## Предзапусковая фиксация

Публичный beta.55 установлен изолированно, build-info/canon/peeled tag совпали.
Full-content engine snapshot digest: `65c15097f9e8e7d0ade01bd665b44dab5ace4ae05ac1f4f1ad2b078b457005b0`.
[Checkpoint cp-104](../checkpoints/cp-104-task-priority-autonomous-proof-flow-4-1-1-engine-0-9-0-beta-55.json)
закреплён в case SHA-256 `3cd1f68f3124cf859282f257c37208219d02af142f2b331c7c6169d9613b5d80`.
Первая подготовка cp-103 ошибочно закрепила digest только dist, а не snapshot
(включая package metadata и зависимости). Оба preflight корректно отказали
до baseline и provider Sessions: `input_checkpoint_engine_mismatch`.
Исторический cp-103 и failure receipts сохранены, вместо переписывания создан cp-104.
Два независимо установленных snapshot beta.55 совпали по полному digest;
`verifyEngineArtifact` пересчитал и подтвердил их содержимое.
Каталог кампании по-прежнему `cp-103-luna-zcode`, но input checkpoint — cp-104.
Следующий шаг на чистом committed definition — по одному `runner eval preflight` для Luna и ZCode.
Оба должны дать `ok:true`, baseline admission passed, Subject/Judge doctor PASS
и `provider_sessions_created:0`. До этого этот документ не разрешает запуск.

PostgreSQL `dd-tasks-postgres-1` healthy на `127.0.0.1:55433`; данные не сбрасывались.
Новый `DD_EVAL_HOME`: `/Users/deksden/.dd-eval/qualification/cp-103-luna-zcode`.
Публичный engine сохранять в `published-engine/` до завершения кампании.
