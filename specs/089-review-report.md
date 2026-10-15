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

4. Bootstrap wrappers отбрасывали вложенную причину, оставляя только reason.
   Теперь оба слоя используют общий bounded errorRecord; JSON roundtrip
   сохраняет исходную типизированную причину. Functional WT probe также
   сохраняет phase/status/signal/error_code/timed_out и размеры потоков, но не
   их содержимое. Регрессия настоящего probe timeout проверяет ETIMEDOUT;
   регрессия storage failure проверяет передачу причины через оба wrapper.

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
- Новый полный единый engine `pnpm test` запускается на чистом итоговом
  candidate `ebb621b0`; его результат записывается перед merge. Адресные проверки не
  подменяют этот gate.

Проверка выполняется в отдельных worktrees. Установленные runtime/хуки,
работающие EVAL и их артефакты не менялись; новые EVAL не запускались.
