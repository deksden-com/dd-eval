# 086 — ревью реализации

Проверены план, изменения dd-tasks/engine/EVAL и пути reporter → bound receipt →
shared disposition → Work corrective retry/aggregate repair → EVAL diagnostics.
Продуктовый D1 не исправляется оператором. D8 был правильно снят при реализации:
collector уже сохраняет полный inventory. Release и новые EVAL не выполняются.

## Существенные находки и исправления

1. Два валидных отдельных report могут переполнить безопасный integer при
   aggregation. Wrapper прежде сохранял completed=true и возвращал exit 0.
   Shared boundReport теперь добавляет tooling/invalid_aggregate_counts и
   completed=false, не выдумывая новые counts. Регрессия воспроизвела exit 0
   до исправления, затем exit 1 для passed и skipped overflow.
2. Engine проверял world_id/migrations_sha256 через String(...): одноэлементный
   массив проходил regex и мог разрешить source repair. Проверка теперь требует
   реальные строки; failure enums также не приводятся к строкам. Native JSON
   read и direct disposition регрессии отвергают malformed proof; legacy valid
   evidence остаётся совместимой.
3. Compact check diagnostics не скрывали Bearer, api-key и quoted JSON
   credentials. Применена одинаковая ограниченная redaction-политика в producer
   и EVAL presentation; raw stack/proof не добавляются в компактный packet.
4. Реальный Playwright fixture наследовал короткие synthetic watchdog windows.
   Он использует production startup/execution silence budgets. Позитивный
   sliding test работает дольше 10s общего deadline, но не требует scheduling
   двух процессов в пределах 1s. Intentional silence negatives сохраняют малые
   бюджеты. SQL fixture теперь печатает retained failures при неверном количестве.
5. Retry integration не доказывал, что начальный check реально дошёл до exit 1:
   отказ preparation обнаруживался поздним несовпадением marker. Добавлена ранняя
   проверка actual status/exit с physical diagnostics, без обхода custody/retry.
6. Полный offline EVAL suite отменил длинный canonical fixture на общем
   абсолютном 60s deadline, хотя отдельные CLI-команды уже имеют скользящее
   наблюдение и завершались. Убран дублирующий total deadline; test.signal
   передаётся owned command observers для отмены/cleanup, их budgets сохранены.

## Источники и границы

- dd-tasks: d5c3e8b (shared bounds/redaction), 9c9e85e и 34a73d3 (test windows);
- engine: bbbc20017b604c6437412ce6656b8c8d8bc537c1;
- чистый tooling-only source: b68b95e086e76440117b03644661ab15d2d1d24b,
  tag eval/plan-086-review-clean-tooling; изменены только два scripts-файла
  относительно прежнего чистого b791fea;
- CP229 всё ещё не launchable: checksum опубликованного engine отсутствует.
  Ранее recorded baseline относится к явно указанному source_commit b791fea;
  новый release/preflight должен проверить новую tuple до запуска.

Проверки и точные terminal результаты фиксируются в PR перед merge. До фиксов
все три новые defect regressions падали; после фиксов проходят. Первые engine
tests, начатые до готовности build, не считаются приёмкой. Промежуточные отказы
реальных fixtures сохраняются отдельно, не заменяются утверждением о PASS.

Ponytail: исправлены существующие общие обработчики; новых зависимостей, модели,
daemon, схем БД или дополнительного repair-механизма нет. Не повторялась модельная
квалификация Judge, не менялись исторические runtime receipts или candidate test.
