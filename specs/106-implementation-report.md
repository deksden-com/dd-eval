# План 106 — реализация

Дата: 2026-10-26. Реализация завершена; новые EVAL, model calls, полный gate,
GitHub CI, npm release и изменение установленных хуков не выполнялись.
Main не менялся: опубликованы согласованные feature-ветки для следующего review.
Работающие и исторические CP256 runtime/definitions не изменялись.

## Доставка

| Репозиторий | Ветка | Commit |
| --- | --- | --- |
| dd-flow-cli | fix/106-diagnostic-repair | 881fbc74 |
| dd-tasks (только producer scripts/tests) | fix/106-runner-diagnostics | 1ef07bd38b73d0f630c6252f9901a94655ebc90f |
| dd-memorybank | fix/106-diagnostic-repair | f904d8a6a2c6bc4c9d463dcc891835db6d9aab31 |
| dd-eval | docs/106-diagnostic-repair | текущий commit этого отчёта |

Все commits используют [skip ci]. Интеграция/выпуск остаются отдельным шагом;
исполняемая проверка и canon result schema должны доставляться согласованно.

## Выполнено

- Один technical admission для diagnosis после подтверждённого окончания checks.
  WORK/CODE/CODE-REVIEW/MERGE/lifecycle/repair-intents и явный retry не требуют
  exception attribution. MERGE сохраняет свой integration Work/ownership.
- Optional report, отсутствие stderr и изменение dependency proof не блокируют
  diagnosis. Raw paths и недостающие данные явно обозначаются, не подделываются.
  PASS, проверка принадлежности/epoch и физическое settlement остаются строгими.
- Старый source-only admission удалён; старый checkRepairDisposition/проверка
  исторических proof сохранены только для совместимого чтения. Новое исполнение
  использует checkDiagnosisDisposition/checkDiagnosisPolicy=settled-failure@1.
- Удалён producer stack/dependency causal-proof builder: не добавлялись regex
  новых исключений. Counts/native SQL code/phase/stack/progress/cleanup сохранены.
  В producer около 600 строк удалено, около 85 добавлено вместе с обновлением тестов.
- EVAL на новом engine не запускает semantic failure corpus перед baseline.
  Legacy reader остаётся для старых tuple; реальные baseline команды сохранены.
- Result уже удовлетворённого документа/оспариваемого finding может не менять
  файлы; нужны rationale/evidence и свежий независимый selective reviewer PASS.
  Есть один bounded corrective шаг, без бесконечного спора и без полного повторного
  review обычного fixed-result. Исторический result без disposition = fixed.
- CLI подставляет retained focus/coverage и reviewed REPORT details из trusted
  predecessor до финальной schema validation. Противоречивые legacy поля отвергает.
- AGY использует native inventory root+descendants и drained delivery под
  owner/trajectory/revision fence. Отсутствующий task handle становится retired,
  а не выдуманным успешным shell command. Активные owned schedules используют
  существующий scoped stop с последующим свежим inventory. Unknown/partial/live
  остаются блокерами; физический shutdown проверяется отдельно.
- Общие canon instructions, result schema и runtime guidance обновлены вместе.
  Новый flow/framework/dependency/decision model не добавлялись.

## Проверки только затронутых зон

| Проверка | Результат |
| --- | --- |
| AGY native inspection/state boundaries | 65/65 PASS, без live RPC/model |
| Engine diagnosis/reconciliation/diagnostic results | 38/38 PASS; после нового missing-report кейса diagnosis 5/5 PASS |
| Engine legacy structured proof + matrix + initial diagnosis | 22/22 PASS |
| Engine code-checks/lifecycle/matrix consumer files | исходно 272 PASS / 5 FAIL; все 5 доисследованы и исправлены, targeted 3/3 и 2/2 PASS |
| Lifecycle focused | 26/26 PASS (прочие кейсы файла намеренно не выбраны) |
| Historical library proof reader | 5/5 PASS |
| Canon/engine schema copies | 15/15 PASS |
| EVAL baseline + compatibility | 15/15 PASS |
| EVAL с фактически собранным engine consumer | 1 PASS; historical CP247 sample test SKIP без переданного каталога |
| Producer четыре затронутых файла тестов | 39 PASS, 0 FAIL, 1 SKIP; 67.6s |
| TypeScript noEmit, final build, scoped ESLint/Biome, diff-check | PASS |

Producer SKIP — существующая PostgreSQL-проба без DD_TASKS_TEST_ADMIN_URL;
отдельная БД не запускалась. Первые producer отказы были из-за устаревших probe
expectations и отсутствовавшего dependency link из изолированного checkout;
исходные логи сохранены. Перед commit созданные links удалены, пакетных зависимостей
и продуктовых исходников в diff нет.

В consumer прогоне устаревшие требования source_repair/tooling_blocker заменены
проверкой diagnosis_required с отдельным отрицательным assertion для PASS. Найденный
реальный риск cross-wave retry устранён matching execution_contract_hash; два
оставшихся теста повторены адресно. Целый многочасовой suite повторно не запускался.

## Локальные логи приёмки

`/tmp/plan106-engine-consumers.log` — исходный consumer run с пятью отказами;
`/tmp/plan106-code-checks-r2.log`, `...-r3.log` — исправленные адресные кейсы;
`/tmp/plan106-engine-focused.log`, `...-diagnosis-r4.log`, `...-core-focused-r2.log`;
`/tmp/plan106-core-tsc-final.log`, `...-build-final.log`, `...-eslint-final.log`;
`/tmp/plan106-producer-tests-final.log`, `...-eval-tests.log`,
`/tmp/plan106-eval-built-consumer.log`, `...-schema-copy.log`.

Это scoped implementation acceptance, не утверждение полного E2E PASS или
release-accepted. Поведение на новых провайдерах проверяется после отдельного
согласованного выпуска; старые EVAL задним числом успешными не объявляются.
