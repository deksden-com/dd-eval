# План 106 — ревью, исправления и интеграция

Дата: 2026-10-26. Ревью выполнено основным агентом и тремя независимыми
субагентами по checks/retry/MERGE, results/re-review и AGY/native inventory.
Выводы перепроверены по коду и runnable регрессиям. Только затронутые зоны;
полного gate, GitHub CI, EVAL, live native RPC и запросов модели не выполнялось.

## Существенные дефекты, найденные и исправленные

1. **Восстановленный env запрещал retry.** Retry contract включал фактические
   значения объявленного окружения. Теперь он связывает command/profile/declared
   inputs/Work/wave, а фактический env остаётся в execution input hash. Исправление
   env допускает новый linked retry, но не переиспользование прежнего PASS.
   Cross-wave fence сохранён; legacy hash принимается только при прежнем env.
2. **MERGE преждевременно предлагал source repair.** Общая неизвестная/infrastructure
   ошибка получала repair_command, откатывающий integration и открывающий CODE.
   Общий отказ теперь даёт только continuation текущего MERGE. Явный source-repair
   API остаётся доступен после установления причины агентом, не по regex ошибки.
3. **Дубли selective review/correction.** Lookup до writer transaction не защищал
   от параллельного/recovered Finish. Регистрация теперь использует существующий
   атомарный requestKey. Новый correction наследует контракт задачи, но не custody
   marker предыдущей Work. Реальная SQLite/Work lifecycle регрессия проверяет
   fresh read-only launch, parent/child sessions, schema admission и independent
   PASS; изменение workspace не может использовать устаревшее reviewer решение.
4. **AGY доверял неполному transcript.** При пустом ledger или постороннем типе
   task retirement мог пропустить живой native handle; fullyIdle допускает daemon
   tasks. Qualified shutdown теперь всегда читает полный root/descendant inventory,
   scoped stop охватывает все принадлежащие дереву task handles, а clean требует
   их отсутствия и drained delivery под ownership/trajectory/revision fence.

В synthetic AGY transport добавлен отсутствующий state RPC, соответствующий
проверяемому production API; production проверки ради тестов не ослаблялись.
Первый lifecycle тест не имел parent Session: исправлена фикстура, не guard.
Дополнительных существенных дефектов в producer/EVAL compatibility и deterministic
diagnostic materialization не установлено. Schema canon/engine совпадают.

## Приёмка исправлений

| Зона | Результат |
| --- | --- |
| Diagnosis, включая env restoration и MERGE handoff | 7/7 PASS |
| Существующие retry/env/cross-wave кейсы | 7/7 PASS |
| Reconciliation: concurrent registration и настоящий Work lifecycle | 5/5 PASS |
| AGY native inventory/state boundaries | 66/66 PASS |
| Fake AGY adapter с native transport doubles | 14/14 PASS |
| EVAL baseline/compatibility | 15/15 PASS |
| TypeScript noEmit, финальная сборка, scoped ESLint, diff-check | PASS |

Предыдущая scoped приёмка неизменённых частей сохраняется в implementation report,
включая producer39 PASS/1 SKIP (не задана тестовая БД) и schema-copy15 PASS. Новых
причин запускать их полные suites или Judge qualification не было.
Логи: /tmp/review106-core-diagnosis-final.log, /tmp/review106-core-retry.log,
/tmp/review106-results.log, /tmp/review106-agy-tests-r2.log,
/tmp/review106-agy-adapter.log, /tmp/review106-eval-tests.log,
/tmp/review106-tsc.log, /tmp/review106-build.log, /tmp/review106-lint.log.

## Интеграция

- Engine: reviewed source e052883b37cb708e344cc276abee1bfb444a205d;
  PR134 squash -> **fe486595859b84327e9622fa7ad3d86a5ac7b89b**, origin/main.
- Canon: PR10 squash -> **db015d333e5c6dc7fbf5f5ff4fc47a9a10fc1b45**, origin/main.
- Producer tooling: fast-forward по политике dd-tasks ->
  **1ef07bd38b73d0f630c6252f9901a94655ebc90f**, origin/main. Product files не менялись.
- EVAL: этот review receipt + реализация через squash PR в origin/main;
  итоговый merge SHA выдаётся в финальном сообщении, не самоссылочный hash.

Проверена точная tree-equivalence engine/canon с reviewed branch после squash.
Main-only интеграция не является release-accepted и не обновляет установленный
beta.152. Никакие старые EVAL не объявляются исправленными задним числом.

## Cleanup и сохранённая работа

Удаляются после подтверждённого merge четыре task-ветки106 локально/удалённо
и их четыре worktree. Дополнительно проверены merged PR164/165/166, удалены старые
EVAL ветки fix/cp255-inherited-coverage, fix/cp255-coverage-evidence,
ops/cp256-four-e2e локально и удалённо; patch identity и точные PR heads сверены.
Удалены чистый неиспользуемый dd-tasks-cp256-format и его merged локальная ветка.
Коммиты остаются в main/merged PR, force/reset не использовались.

Не удаляются primary checkouts, уникальные неопубликованные E5 commits/local main,
фrozen definitions CP253–256 и деревья зависимостей/исходников опубликованных
engine. В частности dd-flow-cp253/node_modules нужен другим сохранённым checkout.
Это сохранение необходимых данных и чужой работы, а не заявление, что все
оставшиеся ветки навсегда необходимы. Работающие EVAL не останавливались.
