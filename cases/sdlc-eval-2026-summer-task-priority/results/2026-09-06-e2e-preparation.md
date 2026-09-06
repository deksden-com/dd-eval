# Подготовка трёх E2E после плана 024

Дата: 2026-09-06. Статус: **три E2E подготовлены; все три preflight успешны**.
Полные E2E не запускались. Этот документ дополняет, а не переписывает
[предыдущую верификацию](2026-09-06-plan-024-verification.md).

## Подготовленный контур

- Subject: Luna xhigh, AGY Gemini 3.1 Pro high, ZCode GLM-5.3-Flash max.
- Judge и обработчик разрешённых вопросов: Sol high.
- SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE → CODE-REVIEW → MERGE.
- Одна родительская сессия на цепочку; исполнение Work — нативными субагентами.
- Inline MERGE; проверки интегрированного кода обязательны.
- Каждый запуск получает отдельные project/DD_FLOW_HOME; общий реестр ресурсов
  предотвращает конфликт портов. Корень данных: `/Users/deksden/.dd-eval`.
- E2E начинает с продукта `44939e95060a65e80571acdcbf42609b80621e63`.
  Новый flow pack накладывается отдельно. Канонические пакеты стадий не нужны
  и ради этого запуска не перестраиваются.

## Дополнительно закрытые пути

1. `stage fanout reconcile` сопоставляет native child с зарегистрированной
   парой harness/session и единственной попыткой Work. Native failure/cancel
   может закрыть только эту попытку. Native completion не принимает результат
   работы. Нет связи, повторное использование Session, незавершённые потомки
   или отсутствующий work finish — явные диагностические исходы, не вечное
   ожидание и не автоматический повтор запуска. Живая проверка не отменяется.
2. Normal/reference/recovery используют общий путь сопоставления. MERGE server
   может вернуть CODE source repair. Recovery отличает новую попытку стадии
   от уже получившей свой стартовый пакет; активную сессию не перезапускает.
3. Отказ между эффектами MERGE repair допускает повтор той же операции.
   Неожиданная ошибка освобождения lane больше не теряется в общем catch.
4. AGY сохраняет Stop-наблюдения; старый executionNum не меняет новое
   исполнение. Повтор одного и того же наблюдения не продлевает активность.
   Завершившийся нативный ребёнок отражается в дереве наблюдений.
5. Счётчики tool calls ZCode разделены по физическим сессиям, включая
   совпадение toolCallId у родителя и ребёнка. Общий счётчик моста не
   импортируется как счётчик каждой отдельной сессии.
6. Общая финализация пытается сохранить неполный RUN через `--incomplete`.
   Это отдельная сохраняемая копия с hashes, не принимаемый checkpoint и не
   фикстура для восстановления. SQLite — согласованный read snapshot;
   файловая копия не атомарна, ограничение записано явно. Ошибка захвата
   фиксируется как missing и не подменяет первичную ошибку исполнения.
7. Ранбуки приведены к фактической модели: детей запускает Subject; измеренная
   capacity берётся из профиля, а не повторно определяется внутри E2E.
   Старые номера в стабильных ID модельных профилей не являются версией движка:
   единственный источник этой версии — input checkpoint.

## Проверки

- Новые CLI-контракты: 16/16 (native reconciliation, incomplete snapshots,
  восстановление MERGE repair в пяти точках искусственного отказа).
- Эти fault-injection тесты проверяют оркестрацию повторов; файловое
  архивирование и SQLite-снимки отдельно проверены с настоящими файлами/БД.
  Они не выдаются за аварийный live E2E.
- AGY doctor: 1.1.27, авторизация и Gemini 3.1 Pro high доступны.
- Codex doctor: 0.153.4, app-server доступен.
- ZCode qualification/capacity: native 0.16.5, bridge 0.13.1 / `43f654b`,
  15 стартовавших и завершённых детей, сохранённые receipts предыдущей проверки.
- `typecheck`, `lint`, strict-canon build проходят.
- Полный dd-eval: 168/168; дополнительный повтор AGY после уточнения
  идентичности hook events: 6/6. Интеграционные CLI проверки PROTOCOLIZE,
  PLAN/CODE/MERGE и деклараций проверок: 38/38 на текущем коде.
- Общий CLI suite: 272 passed / 1 timeout, 2253.69 s. Единственный timeout —
  `busy merge-worker stop marks stop-after-current and stops after completion`.
  Отдельный повтор прошёл за 124.92 s (полный запуск 128.82 s). Для этого теста
  с двумя полными подготовками протокола бюджет увеличен со 120 до 300 секунд;
  рабочие тайм-ауты движка не менялись.
- Обоснованное сужение повторного release gate по операционному ранбуку CLI:
  после полного suite повторён единственный упавший сценарий, а новые и
  изменённые контракты проверены отдельными наборами выше. Повтор всего suite
  после изменения только тестового бюджета не проводился. Исходный timeout
  не скрывается и не считается полностью зелёным первоначальным запуском.

Логи проверок: `/tmp/dd-flow-024-preparation-full.log`,
`/tmp/dd-flow-024-new-contracts-final.log`,
`/tmp/dd-eval-024-ready-tests.log`, `/tmp/dd-flow-024-busy-stop-rerun.log`.

## Финальная предпусковая фиксация

Опубликован `@deksden-com/dd-flow-cli@0.9.0-beta.17`, npm tag `beta`.
Git tag `v0.9.0-beta.17` и исходники отправлены в origin.
Из опубликованного npm-архива повторно прочитан `dist/build-info.json`:

- CLI commit: `162dd994d19c0d454a2ad6b7b62abd70c3e848d6` — совпадает с Git tag.
- Memory Bank: `4.0.4`, commit `ced59c19d0a4062146a1dc4ccb977e10284a2fe4`.
- Проектный flow pack: `91b317a6d131808e08e0c2857e080bdf1a487ed0`.
- Совместимость проектного пакета: `>=0.9.0-beta.13 <0.10.0`; beta.17 подходит.
- Глобальный npm-пакет обновлён; выполнен `dd-flow engine install --force`.
  Установленный engine содержит тот же build-info, что опубликованный архив.
- [Input checkpoint cp-069](../../../checkpoints/cp-069-task-priority-project-flow-pack-4-0-4-engine-0-9-0-beta-17.json),
  SHA-256 `b9413d6c29d30faca44a26ef6e606365703a70f338e9d33212911dbcf6cad9cb`.
- Определение эвала при preflight: `b40b8ddb8287206a19bcfcbf3ddcc291e676130e`,
  чистое рабочее дерево. После смены checkpoint полный dd-eval снова 168/168.
- Engine integrity checksum всех трёх preflight одинаков:
  `e3a16bac6129d173f16c8de8a74dd7cb2672fd5fed40262408f8c8625c1c3ddf`.

Три receipts (в каждом `ok: true`, `provider_sessions_created: 0`):

| Subject | Receipt |
|---|---|
| Luna xhigh | `/Users/deksden/.dd-eval/conformance/e2e-preflight/1788653897179-2ce0a5cc/e2e-inline-merge-luna-xhigh/receipt.json` |
| AGY Gemini 3.1 Pro high | `/Users/deksden/.dd-eval/conformance/e2e-preflight/1788653897920-8908b8b3/e2e-inline-merge-agy-gemini-3-1-pro-high/receipt.json` |
| ZCode GLM-5.3-Flash max | `/Users/deksden/.dd-eval/conformance/e2e-preflight/1788653897493-f4427d2d/e2e-inline-merge-zcode-glm-5-3-flash-max/receipt.json` |

Сохранены стартовые launcher/context и отдельный подготовленный project/home
для каждого preflight. Продуктивный `eval run` создаст свои отдельные каталоги;
не продолжать и не выдавать preflight-каталоги за результаты E2E.

## Следующий запуск

Запустить следующие три команды параллельно в отдельных терминальных процессах.
Все пути абсолютные; текущий каталог не определяет ни кейс, ни DD_FLOW_HOME.
Раннер сам создаёт изолированные окружения. Judge включён в каждом профиле.

```sh
DD_EVAL_HOME=/Users/deksden/.dd-eval node /Users/deksden/Documents/_Projects/dd-eval/bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json
DD_EVAL_HOME=/Users/deksden/.dd-eval node /Users/deksden/Documents/_Projects/dd-eval/bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-agy-gemini-3-1-pro-high.json
DD_EVAL_HOME=/Users/deksden/.dd-eval node /Users/deksden/Documents/_Projects/dd-eval/bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json
```

Фиксировать дефекты, не исправлять испытуемый продукт руками; останавливаться
только при блокере. При неоднозначном исходе сначала согласовать наблюдение той
же операции, не создавать дубль. Подробности — в `runbooks/execute-eval.md`.
Предварительные проверки не доказывают успешность всей живой цепочки:
её и поведение исправлений предстоит проверить собственно E2E и Judge.
Сами модельные E2E запускаются следующей отдельной командой пользователя.
