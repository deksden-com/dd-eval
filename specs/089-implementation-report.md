# 089 — реализация единой политики перегрузки

## Реализовано

D1–D11 переведены на `provider-overload-episode@1`: основной запрос и два
дополнительных повтора, backoff 5/15 секунд с jitter, Retry-After не более
30 секунд. Успешный terminal outcome закрывает эпизод; следующая операция
получает новый бюджет. Исчерпание обязательной операции даёт
`provider_unavailable`, optional Decisions передаёт задачу обычному Judge.

Engine использует общий механизм в root controller, external/review Work,
MERGE, recovery, native child и Memory startup probe. EVAL использует его
для interaction/final/qualification Judge, harness capacity probe и semantic
HTTP, включая прежние JEV coverage/calibration entrypoints. Источник политики —
проверенный pinned engine, а не глобальная установка.

Quota/auth/неизвестный 429 не становятся перегрузкой. Lost ACK, неизвестный
outcome, hook/storage/ownership failure не разрешают повтор. Сохраняются Session,
модель, reasoning, identities и durable intent; restart не добавляет бюджет.
Исторические observations читаются без пересэмплирования, несовместимый активный
эпизод требует исходного runtime. Диагностика сохраняет первичную/последнюю
ошибку, число попыток и retry/reset metadata без response bodies и credentials.

## Существенные находки итогового ревью

- Восстановленный четвёртый Judge intent мог обойти бюджет: лимит проверяется
  до dispatch, добавлена отрицательная регрессия.
- Child observer терял native proof и сохранял старый отказ рядом с новым Turn:
  текущая проекция обновляется отдельно от полной durable истории.
- Failed root с ещё работающими children не имел достаточной проекции:
  mixed tree сохраняется, безопасный повтор ждёт settlement siblings.
- Ошибка Retry-After теряла предыдущую причину: история передаётся в итоговую
  диагностику. Semantic backoff связан с policy и engine checksum.
- Legacy JEV unsupported model раньше мог отмечаться после paid-dispatch intent:
  fallback выбирается до dispatch. Historical terminal/unknown cache не запускает
  новую платную серию.
- Supplemental fixture подменяла реальную policy неполным mock: подмена удалена,
  тест проверяет согласованный комплект настоящих adapter/policy assets.
- HTTP Decisions не учитывал auth message при 503 и структурный overload code
  при 429: исправлен приоритет native error envelope; неизвестный 429 остаётся
  terminal. После полного suite дополнительный transport/semantic gate: 22/22.
- Recovery admission fixture всё ещё требовала разрешить третье продолжение:
  теперь проверяется отказ до dispatch; весь файл 28/28 PASS.
- AGY wrapper ограничивал сумму 29 последовательных случаев одним 60s guard:
  применена существующая схема составного crash guard, внутренние бюджеты не
  менялись. Standalone 29/29 PASS (86s под нагрузкой), wrapper 1/1 PASS.
- E3 compiled-init имел разные 30/120s guards для одинаковой холодной подготовки
  и отдельный 15s observer до ожидаемого отказа заглушки. Границы выровнены;
  многоэтапное ожидание продлевается только новыми terminal operation receipts,
  не heartbeat. Пустой stdout теперь сохраняет первичный stderr вместо
  вторичного JSON parse error. Обычный alias с исправлением PASS (221s),
  memory-stages со скользящим observer PASS (1388s под нагрузкой). Прежнее
  абсолютное окно 600s обрывало продвигающийся многоэтапный fixture.
- E3 native-repair wave 1 запускал source-loader CLI с 15s test guard и получал
  `status=null` до admission-проверки. Guard холодного subprocess выровнен до
  120s, добавлена error/signal диагностика; обе wave регрессии PASS (33/23s).
- Полноцикловая native-child fixture распознавала прежнюю фразу followup и
  падала на `includes(undefined)` вместо обработки новой native API инструкции.
  Она использует общий renderer и отдельно диагностирует неподдержанный prompt.
  Оба полных overload-цикла PASS, включая mixed с ещё работающим sibling.

## Границы native API

AGY persistent CLI не всегда возвращает настоящий уникальный Turn/request ID.
PID, birth и локальный generation не подделывают эту identity: при отсутствии
ID возвращается `provider_overload_evidence_unavailable` с причиной
`native_turn_identity_unavailable`. Это infrastructure, не дефект продукта.
При наличии настоящего ID действует общий механизм.

ZCode root ACP поддержан; native Agent schema не имеет same-child resume.
Вместо продолжения старого ребёнка новый Agent не создаётся. Codex/OpenCode/
Droid/Grok используют подтверждённые followup API; неполное terminal evidence
остаётся reconciliation fence. Это не обещание живой приёмки всех native API.

Capacity probe измеряет принятую native direct-child ёмкость, а не качество
ответов детей. Принятый, но затем failed/cancelled child сохраняется отдельно
от completed; требование успешности всех детей не добавлялось.

## Проверки

- EVAL полный offline suite: 895 tests, 880 PASS, 0 FAIL, 15 environment-gated SKIP.
  Последующий небольшой HTTP-classifier фикс проверен отдельными 22 тестами.
- EVAL общий настоящий policy/Judge/semantic suite: 43/43 PASS; installed pinned
  policy/native contracts: 5/5; supplemental Judge: 18/18.
- Engine typecheck, lint и build PASS; targeted controller/policy/Memory: 79/79.
- Adapter fixtures: 123/123; дополнительная mixed-tree/proof матрица: 7/7.
- Настоящий установленный Codex против локального mock: native retry→success
  без owner continuation; native exhaustion→один same-Session continuation→success.
  Обычные native retries не отключались; внешних модельных обращений не было.
- Engine hybrid: 66/66; E2: 133 PASS, 0 FAIL, один SKIP (fish отсутствует).
  Первый E2 под нагрузкой получил subprocess timeouts; повтор зелёный без
  ослабления тестов. Release build/native contracts: 2 Node + 8 Vitest PASS.
- Clean built/npm-installed E2 gate: 2/2 PASS на engine `ea0d8055`, с явным
  canon `1ddedf9d3f086e046f8e7b194c739ec386e7c8b9`; без global installation.
- Runtime-sensitive целиком: 48/48 PASS. Все native adapter fixtures и
  control-worker recovery/cancellation проверены без scored EVAL.
- Полный integration: 2793 PASS / 4 FAIL в трёх загруженных до исправлений
  fixture/ожиданиях. Все четыре закрыты последующими проверками: recovery
  admission 28/28, AGY wrapper 1/1, полные child-overload циклы 2/2. Остальные
  full-cycle, routing, HITL, repair и terminal cleanup cases прошли в общем прогоне.
- Полный E3: 446 PASS / 10 FAIL / 6 gated SKIP. Восемь отказов вызваны
  отсутствующими явными canon/Worktrunk inputs, два — исправленными guards.
  Все десять случаев перепроверены успешно с корректными inputs/исправлениями:
  canonical cases 2/2, ordinary-entry 4/4, actual Worktrunk 1/1,
  memory-stages 1/1, operation-only 1/1 и native-repair wave 1/1.
- Дополнительный Memory E3 повтор: 85 PASS / 3 FAIL / 3 gated SKIP. Два старых
  observer отказа закрыты исправленными aliases выше. Третий — Worktrunk probe
  под нагрузкой; точный bootstrap case повторён PASS. Две синтетические
  Worktrunk пробы также перепроверены 2/2 без изменения production лимитов.

Это проверка наборами и адресными повторами, **не заявление о едином зелёном
`pnpm test` invocation**. Исходные неудачные прогоны сохранены, причины не скрыты.
Селекторные skips (не выбранные cases) не смешиваются с environment-gated skips.
Последний strict-canon build, typecheck/lint и clean built/npm-installed E2 gate
прошли на итоговом commit `c27b7dfb` (2/2 installed PASS).

Первые E3 запуски не являются зелёными: одному не передали обязательный
`DD_FLOW_E3_CANON_ROOT`, другой успел создать fixture archives до обновления
build-info с canon provenance. Это ошибки настройки/порядка проверки: archives
сохраняют захваченные bytes, metadata не кешируется. Повтор выполняется на
стабильной сборке и явном canon; проверка release integrity не ослаблена.

Ponytail: расширены существующие durable owners и semantic executor, единый
pure policy helper; без новой зависимости, scheduler, БД, circuit breaker или
замены моделей. Release, hooks, pins и новые EVAL в эту работу не входят.
Работающие EVAL и исторические runtime artifacts не изменялись.

## Интеграция

Engine: [PR 75](https://github.com/deksden-com/dd-flow-cli/pull/75), squash main
`dafdb20250923abf9b667c310df35ef388e01658`. Проверенный source `c27b7dfb` и merge
имеют одинаковое Git tree; это не подмена commit identity собранного пакета.
EVAL: [PR 95](https://github.com/deksden-com/dd-eval/pull/95), включая этот план
и отчёт. Версия engine остаётся beta.138 в source; patch changeset подготовлен
для отдельного будущего release, действующие pins/hooks не обновлялись.
