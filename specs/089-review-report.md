# 089 — ревью реализации

## Найдено и исправлено

1. Общий sanitizer native-child ошибок воспринимал Retry-After как простой
   идентификатор: HTTP-date с запятой исчезала из durable evidence. Заголовок
   Retry-After также не попадал в эту проекцию. После reattach владелец мог
   применить default backoff вместо указанной провайдером задержки.
   `safeNativeFailure` использует существующую безопасную timing-проекцию
   общей policy. Невалидные значения не исчезают; non-finite numbers и слишком
   длинные строки сохраняются как invalid marker, в том числе после JSON roundtrip.
   Секреты и остальные заголовки не копируются. Регрессии проверяют HTTP-date,
   header, invalid metadata и восстановление child observer.

2. Современный semantic coverage runner загружал retry-policy до чтения
   сохранённого terminal observation. При отсутствии result.json это могло
   блокировать публикацию уже готового ответа на старом pinned engine.
   Загрузка policy перенесена внутрь существующего locked owner, после
   проверки terminal evidence. Новые/активные эпизоды по-прежнему требуют
   verified pinned policy до HTTP dispatch; active mismatch остаётся ошибкой.
   Регрессия проверяет completed/fallback reuse без policy loading и отсутствие
   HTTP-вызова при ошибке загрузки для новой задачи. Проверки request/config/
   source binding, dependency fingerprint и cancellation не ослаблены.

3. Полный engine gate обнаружил два отказа Memory-layer до проверяемых
   assertions: повторный `wt --version` и functional Worktrunk probe. Оба
   адресных случая прошли без изменения кода; это не было засчитано за full PASS.
   Исследование выявило лишнюю повторную квалификацию: target revalidate/restore
   снова запускали version probes на checkpoint-проверках. Общий путь теперь
   проверяет выбранные пути и SHA-256 executable bytes, повторно наблюдает Git и
   source state, сохраняя первоначальные version proofs. Регрессия считает
   реальные вызовы: новых `--version` нет, Git-наблюдение есть; изменённые tool
   bytes и исходники по-прежнему отвергаются. Общий fake WT переведён с Node
   cold start на shell + настоящий Git worktree; отдельная real-WT qualification
   сохранена. Production deadlines и assertions не ослаблены.
   Старые wrappers не сохранили status/signal исходных отказов, поэтому
   конкретный ETIMEDOUT для них не утверждается; подтверждены отказы probes
   и лишние повторные вызовы, а не выдуманная native transport-причина.

4. Bootstrap wrappers отбрасывали вложенную причину, оставляя только reason.
   Теперь оба слоя используют общий bounded errorRecord; JSON roundtrip
   сохраняет исходную типизированную причину. Functional WT probe также
   сохраняет phase/status/signal/error_code/timed_out и размеры потоков, но не
   их содержимое. Регрессия настоящего probe timeout проверяет ETIMEDOUT;
   регрессия storage failure проверяет передачу причины через оба wrapper.

5. Compiled CLI fixture использовала wall-time `spawnSync(120s)` для всей
   многоэтапной операции. Теперь fixture наблюдает существующие setup events
   с точной operation identity и исходным timestamp; свежие шаги продлевают
   окно, heartbeat/повторы/чужие events — нет. При истечении останавливается
   только CLI observer, не независимо управляемый RUN. Регрессии проверяют
   productive progress, ложные сигналы и сохранение detached child.
   Слепой повтор init после ETIMEDOUT удалён: неизвестный исход не разрешает replay.

6. Дополнительное воспроизведение выявило отдельный внутренний отказ:
   `frozen_engine_flow_incompatible/selected_engine_probe_failed` скрывал
   ETIMEDOUT (SIGTERM, stdout=0, stderr=0) при cold start выбранного CLI.
   Его 15s budget не соответствовал общему startup budget 120s. Flow/storage
   admission используют существующий SETUP_STARTUP_MS; это ограниченная локальная
   проверка, не агентный prompt. Status/signal/error_code и размеры потоков
   сохраняются без вывода самих потоков. Проверки содержимого engine и фактов
   admission не отключены. Регрессия проверяет budget и точный отказ subprocess.

Ponytail: исправления в существующих общих точках; без новых зависимостей,
retry executor, замены модели, новой Session или обхода admission.

## Проверка

- Engine candidate: `ebb621b0` (retry metadata: `b599b0da`);
  targeted observer/policy/child: 67/67 PASS.
- Engine strict-canon build PASS; typecheck/lint PASS; installed gate: 2/2 PASS.
- EVAL candidate: `6dea421`; полный suite: 882 PASS, 0 FAIL, 15 gated SKIP
  (897 tests). Дополнительный current-engine policy/Judge/semantic gate: 50/50.
- Первый полный `pnpm test` на b599b0da: hybrid 66/66, E2 133 PASS/1 gated SKIP,
  E3 455 PASS/2 FAIL/5 gated SKIP. Отказы из пункта 3 не скрыты; последующие
  наборы по этому invocation не запускались. После исправлений: focused Memory
  regression 4/4, target/cause 2/2 и Worktrunk contracts с real WT 5/5 PASS.
- Повторный общий gate `ebb621b0` также не зелёный: public-request fixture и
  compiled operation-only=true упали; invocation остановлен после сохранения
  отказов. Последующие наборы не засчитаны. Focused reproduction на следующем
  кандидате доказало отдельный 15s frozen-engine timeout из пункта 6.
- Итоговый общий engine gate ещё не пройден. Результат нового чистого кандидата
  записывается перед merge; адресные проверки не подменяют этот gate.

Проверка выполняется в отдельных worktrees. Установленные runtime/хуки,
работающие EVAL и их артефакты не менялись; новые EVAL не запускались.
