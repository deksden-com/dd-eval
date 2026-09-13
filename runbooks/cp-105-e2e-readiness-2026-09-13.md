# cp-105: включение RUN pause/recovery fixes из dd-eval3

Статус: review, release gate и опубликованный beta.56 PASS; два preflight ожидаются.
Новые scored E2E не запускались. Предыдущая готовность cp-104/beta.55
не включала эти изменения и не заменяет проверку нового пакета.

## Состав и результаты ревью

CLI commit: `ae4bbaa5b2299aeedf3ee90bccc8ed3db19a6191` (runtime: `95d13f6`).

1. Принятый pause/stop и begin/seal recovery переводят логический RUN в paused;
   DB row, index_json и runtime projection согласуются штатным writer.
2. Ошибка controller spawn/execute помечает RUN paused только для текущего
   поколения/владельца. Completed/cancelled/superseded controllers не переписываются.
3. Recovery ACK и допустимый controller restart восстанавливают operational status;
   настоящие paused/waiting_for_user/blocked стадии сохраняют паузу, terminal RUN не открывается.
4. Общий persistRunState не позволяет позднему admitted результату вернуть running
   при draining/sealed/resuming guard. Audit пишет реально сохранённый статус.
5. Явный legacy repair tool имеет dry-run, backup, exact home/project/RUN scope;
   abandoned fixture cancellation требует отсутствия проекта и Work/Session/controller/recovery history.
   Repair tool в этой работе не применялся к старым RUN.

Существенные дополнения по результатам ревью:

- Общий writer больше не заменяет run.json до успешного SQL UPDATE. Savepoint
  откатывает SQL при отказе публикации файла. Регрессии с SQLite trigger ABORT
  и ошибкой rename подтверждают прежние DB/index/file и отсутствие принятого recovery.
  SQLite остаётся authority; это не обещание распределённой транзакции между FS и БД
  или атомарности файлов при произвольном позднем rollback внешнего вызывающего кода.
- Repair tool выводит applied:true только после COMMIT, не до него.
- Добавлены отдельные регрессии сохранения трёх настоящих Stage pause состояний.

Проверки: 76 тестов controller/recovery/admission/repair PASS, затем 8 тестов
repair/status (включая три дополнительных pause cases) PASS; typecheck/lint/build PASS.
Первый запуск новых pause cases имел неверный dir в тестовой фикстуре, исправлен
на существующий формат 01-plan; это не runtime defect и не ослабление validation.

## Релиз и предзапусковая проверка

[Release workflow](https://github.com/deksden-com/dd-flow-cli/actions/runs/34782145406)
завершился успешно (attempt 2): 657 tests / 56 files, typecheck/lint/build,
OIDC publication, registry/tag verification и consumer smoke PASS.
Attempt 1 также прошёл 657 tests, но отправка в npm завершилась сетевой ошибкой;
версия не появилась в registry. Штатный повтор на том же commit прошёл успешно.
Нужны два preflight на чистом committed dd-eval definition.
Не использовать hash только dist: engine snapshot включает metadata и dependencies.

Первый gate 34781258351: 649 PASS, 8 FAIL из-за неполных RUN index fixtures
в external-work-launch и merge-server. Исправлены сами fixtures с проверкой
`satisfies FlowRunIndex`; runtime validation не ослаблена. Адресные 28 тестов,
typecheck и lint прошли перед повторным release gate. Публикации в первом gate не было.

Без изменений:

- Canon 4.1.1: `97f811d33c212ae3497020178b1ed825c7c3ebac`.
- Project flow-pack: `9b121e24f94ac56c2a076cd95e84f427eeea8c6d`.
- Source baseline: `924ef61752b642f06c2c326b444ed7a3239f20ff` / `eval/cp-074-source-final`.
- ZCode 0.16.5 / ACP 0.13.1, bridge `e0600fe3c46e215695f257e65aa6f674ced998d8`.

Старые EVAL/checkpoints/receipts и их engine snapshots не менять.
Новый каталог кампании: `/Users/deksden/.dd-eval/qualification/cp-105-luna-zcode`.

Публичный пакет установлен в `published-engine/node_modules/@deksden-com/dd-flow-cli`.
Build-info и peeled tag совпали с CLI/canon commits выше.
`verifyEngineArtifact` пересчитал полный installed snapshot:
`be90599c2e32e3d2f02d2611b920b16ae412d3c54baa18668690f9ff7f2101ac`.
Новый [checkpoint cp-105](../checkpoints/cp-105-task-priority-recovery-status-flow-4-1-1-engine-0-9-0-beta-56.json)
закреплён в case checksum `548cd5903c28e9991b7e2604b70758ebdae145bd1cb96aeac3593ed8a547ed91`.
