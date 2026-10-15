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

7. После устранения внутреннего timeout fixture выявила недостаток observable
   прогресса: Memory-init не публиковал ingress/imports и завершение реальных
   candidate/selection/flow-admission/stores/startup-input checkpoints. Эти
   сигналы теперь идут через существующий setupReporter, с прежней binding и
   timestamps. Compiled operation-only регрессия проверяет их наличие.
   Home-free E2/installed CLI probes используют тот же startup budget вместо
   собственных 30s. Это не изменение таймаутов/бюджета provider operations.
   Попытка ускорить source loader native stripping отклонена при проверке:
   существующие type-only imports без `import type` требуют compiler semantics;
   итоговый loader оставлен прежним. Эта попытка не считается исправлением.

8. Release fixture вручную копировала неполный список native contracts и
   пропустила новую зависимость native-children → provider-overload-policy.
   Сам dist содержал нужный модуль; падал искусственно усечённый consumer.
   Fixture копирует реальный harness-runtime layout целиком, проверяя точные
   байты публичных contracts (включая policy/types) и исполняя их вне source tree.
   Это не исключение отсутствующей зависимости из проверки.

9. Общая capture-fixture имела дополнительный deadline 15s от момента её
   создания, включая подготовку и все capture/replay проверки case. Он завершил
   три корректно продвигающихся сценария вместо их contract assertions.
   Дублирующий guard удалён; owner-token assertion оставлен. Production
   recovery budget и framework timeout 120s не менялись. Все 24 capture-теста,
   включая journal mutation/refusal и owner fencing, прошли после исправления.

10. Общий classifier пропускал документированные Claude API
    `type/code=overloaded_error` и HTTP 529: адаптеры возвращали generic failure,
    обходя retry-policy. SSOT теперь распознаёт структурный code/type и status;
    простое упоминание `overloaded_error` в сообщении не даёт права повторять.
    Quota/auth имеют прежний приоритет. Проверены OpenCode/Droid/AGY, включая
    отсутствие настоящего AGY request ID и native willRetry. Контракт terminal
    proof не ослаблен. [Первичный источник](https://platform.claude.com/docs/en/api/errors).

11. Semantic streaming fixture зависела от real-time разницы 40ms/70ms:
    scheduler delay под нагрузкой превращал продуктивный ответ в timeout.
    Часы и sampling в положительном сценарии управляются тестом; настоящая
    streaming/decoding цепочка принимает три чанка за модельные 120ms при окне
    70ms. Без сдвига окна на байтах проверка падает. Отрицательные проверки
    silence/empty chunks/cancellation/output limit сохранены. Production code
    и duration не менялись. Итоговые policy/Judge/semantic: 50/50 PASS.

12. Whole integration на ecd4a4b9: 2797 PASS/1 FAIL. Единственный отказ
    `runtime-scope-stop (eval-observer)` произошёл до stop при регистрации:
    `process_ownership_unknown/physical_identity_unavailable`,
    phase=observer_registration, effect=no_effect, native_dispatch_started=false.
    Runtime корректно не принял неподтверждённую physical identity; точная причина
    недоступности отдельного ps-ответа не сохранена и не приписывается таймауту.
    Фикстура ошибочно требовала успеха первого наблюдения. Она использует уже
    имеющийся retryPhysical с production maintenanceRetryable и неизменным общим
    uncertainty guard, сохраняя точный registration ID/lease. Stop assertions
    не обёрнуты в retry и не ослаблены. Адресный replay до исправления 2/2 PASS
    не выдаётся за успешный whole gate. Все 11 full-cycle cases исходного общего
    integration прошли, включая overload children и terminal cleanup.

Ponytail: исправления в существующих общих точках; без новых зависимостей,
retry executor, замены модели, новой Session или обхода admission.

## Проверка

- Runtime candidate: `fb01a59e` (retry metadata: `b599b0da`);
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
- Общий invocation `1d08e306` прошёл hybrid, но остановлен после FAIL E2 completion
  на отдельном 30s cold CLI deadline. Его результат не засчитан за PASS.
- На `fb01a59e`: оба ранее падавших Memory сценария прошли вместе (2/2,
  включая compiled operation-only). Installed gate: 2/2 PASS.
- Полный invocation `fb01a59e`: hybrid 66/66, E2 133 PASS/1 gated SKIP,
  E3 461 PASS/0 FAIL/5 gated SKIP (466 tests); затем FAIL release-fixture из
  пункта 8. Общему invocation не приписывается exit 0.
- После исправления только `scripts/verify-release-build.test.mjs` release
  пройден полностью: Node 2/2 + Vitest 8/8. Runtime source, build inputs и
  построенный engine не менялись, поэтому зелёные hybrid/E2/E3/installed
  сохраняются для тех же байтов. Source tree: `6c53bcdcf55a7b3b2a147a94aa3f65735fe13bd9`;
  SHA-256 build-info.json: `f166934483bb6ca538979d08affeecb08a6dac7225e93b0b144f94e2ff999cf6`.
- Первый integration invocation остановлен после трёх отказов fixture guard
  из пункта 9; ему не приписывается полный PASS. После capture 24/24 запущены
  новые typecheck/lint (PASS) и повторный integration. У раннего повторного
  integration одновременно с отдельным тяжёлым E3 возникли два framework
  hook-timeout 120s в run-cli.test.ts. Те же cases прежде прошли в одиночном
  invocation за 46975ms и 13890ms. Дублирующий feedback run остановлен;
  framework timeout не увеличен. Этот run также не засчитан за полный PASS.
  Причинность contention не выдаётся за доказанный production-дефект:
  окончательная проверка — один последовательный gate ниже.

## Финальный чистый candidate

`ec948cb6bc678fa2926f4c73c68711043a474974` содержит оба последних test fixes.
Runtime source tree совпадает с `fb01a59e`:
`6c53bcdcf55a7b3b2a147a94aa3f65735fe13bd9`. Strict-canon build прошёл;
SHA-256 его build-info.json:
`835eece585cacc2471a31f95bac27127613415ecefdc074d741c3abd4f776afc`.
Этот invocation остановлен без выявленных отказов на E3 перед изменением
runtime classifier из пункта 10; общий PASS ему не приписывается.

Новый candidate `ecd4a4b9aa1b55ff4e1652f2aa28a94232ca3693` включает пункт 10.
Адресные проверки: policy 60/60 и native adapters 7/7 PASS. Для него заново
запущены strict-canon build и полный последовательный `pnpm test`.
Build PASS; source tree `b7f76d2e14a09ce846eebd17fe98cb808e941041`,
SHA-256 build-info.json `521a306a97a5eb1e8ddd928b21f581be65b225fd1f13984fec74bd84e3a64eeb`.
EVAL после пункта 11: полный suite с DD_FLOW_SOURCE_ROOT на этот candidate —
897 tests, 882 PASS, 0 FAIL, 15 environment-gated SKIP, exit 0.
Адресный current-engine policy/Judge/semantic — 50/50 PASS, exit 0.
Полный invocation ecd4a4b9 прошёл hybrid/E2/E3/release, но завершился exit 1
из-за пункта 12; runtime-sensitive после него не запускался.
Итоговый результат следующего чистого candidate будет записан до merge.

Проверка выполняется в отдельных worktrees. Установленные runtime/хуки,
работающие EVAL и их артефакты не менялись; новые EVAL не запускались.

## Сохранённые границы

Ревью не подменяет live acceptance. Ограничения native API из плана остаются:
AGY без настоящего turn/request ID не получает выдуманную continuation authority;
ZCode native Agent без same-child followup не заменяется новым spawn. Неизвестный
исход требует observation/reconciliation, а не повторного dispatch. Это явные
безопасные отказы, не обещание универсального retry без native evidence.
