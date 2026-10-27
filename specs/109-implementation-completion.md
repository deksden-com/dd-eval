# 109 — Реализация достаточности HITL и границ авторитетности

Дата: 2026-10-27. Статус: implementation complete / scoped offline verified.
Не является release-accepted или результатом нового модельного/E2E прогона.
Повторное ревью и интеграция: [109 — review receipt](109-review-and-integration.md).

## Что сделано

- Одна sufficient-answer policy для compact native Judge и JEV/Luna Decisions
  через существующие imports и plugins. Качество уточнения не определяет выдачу
  ответа; техническая эквивалентность не отменяет существенные риски и ограничения.
- Канонические SPECIFY/PLAN ответы byte-identical: default старых задач имеет
  определённое наблюдаемое поведение, реализация делегирована; русские подписи
  заданы точно, язык существующего UI не превращается в новый принятый запрет.
- Все 34 authored operational profiles (включая reference/diagnose/recovery)
  явно используют compact. Исторические manifest и default внешних v3 не менялись.
  Старый atom qualification test явно выбирает свой legacy contract в фикстуре.
- Compact corpus расширен с 50 до 57 случаев. Реальные вопросы CP258 сохранены
  вместе с санитизированными excerpts и исходными отрицательными observations;
  authored expectations не выдаются за новые model responses.
- Важная поправка oracle при ревью: после явного canonical отказа второй язык
  больше не является самостоятельным gap. Тот же вопрос без принятой bilingual
  политики теперь covered; отрицательный кейс опирается на независимый принятый
  bilingual constraint. Исторические результаты не переписывались.
- Явный retained JEV prompt mismatch — incompatible evidence, не доказательство
  порчи и не разрешение на новую выдачу. Frozen semantic readback сохраняет
  изначальные инструкции; retry/confidence/provider configuration не менялась.
- Проверка packet/receipt/scope/verdict выполняется до covered/rejected развилки
  в обоих managed/reference callers. Rejected HITL получает audit packet path и
  anchors, но не answer/issuance. Корректность покрыта отдельной регрессией.
- Retained verification возвращает проверенный packet_file. Evidence producer
  не выводит путь из одного receipt locator или наличия coverage_filter.
- Status и failure enrichment переиспользуют общую reconciliation grounded
  exchanges, сохраняют v3 verdicts, различают scope/round. Отсутствие запрошенного
  receipt — unknown, не not_requested и не PASS.
- В том же final Judge вызове применяется аудит grounded exchanges независимо
  от фильтра/контракта. Невыданный пакет — возможное evidence evaluator-ошибки,
  но не accepted scope для обвинения Subject. Нового prelaunch Judge нет.

## Канон и граница распространения

Отдельный репозиторий dd-memorybank: ветка `fix/plan109-hitl-authority`,
commit `de550694d7a68060a40af8f123022f770077db6b`, база опубликованного канона
`4a6c2d2fd247cb66a1523dbdd022d2d71b75601c`. Непубликованные соседние работы
основного checkout в эту ветку не включались.

Обновлены общие SPECIFY/PROTOCOLIZE/PLAN, SPC-008 и существующий semantic eval.
PLAN-REVIEW/CODE-REVIEW изучены: уже требуют исходные accepted inputs, новых
противоречащих clauses не найдено. Engine stage-context уже содержит accepted
decisions/source precedence: дублирующая схема и engine runtime patch не нужны.

Распространение нового curated pack выполняется при следующем отдельном выпуске
штатным `PreparedMemoryLayer.fromInstalledRelease`, потребляя новый committed canon.
Здесь не создавался фиктивный installed-release manifest, не копировался весь
канон в старый project pack и не менялся product baseline ради доставки промпта.
Существующие flow-pack/checkpoint/pins и активный CP258 checkout неизменны.
Это граница deployment, а не утверждение, что новые промпты уже используются
работающими EVAL. Публикация/установка/новые EVAL не входили в этот запуск работ.

## Scoped-проверки

143 уникальных offline теста прошли; повторные исполнения не прибавляются:

- 48: `hitl-contract` (15), `hitl-coverage` (13), `semantic-decisions` (20).
- 39: `plan109-fixtures`, `hitl-corpus`, `semantic-pilot-profiles`,
  `diagnostic-case-definition`.
- 29: `hitl-coverage-report-review` (10), `evidence-schema` (10),
  `hitl-retained` (9).
- 17: `hitl-issuance`, `hitl-reattach-review`, `semantic-routing`,
  `judge-contract082`, `intent-preservation092`, `materialization-evidence`,
  `proof-limits091`.
- 10 выбранных тестов `eval.test.mjs` по HITL qualification/issuance/recovery и
  Final Judge. Остальная общая suite не запускалась.

Использованы `node --test` с явными файлами и `--test-name-pattern` для последней
группы. Изолированные временные fixtures, fake transports/daemons: без credentials,
живых EVAL, native model calls и БД продукта. Начальный sandbox `ps EPERM`
повторён с разрешённым read-only process snapshot; это не PASS исходной попытки.
Промежуточные несовпадения тестовых ожиданий (implicit legacy contract, prompt
wording, отсутствующий receipt) исправлены; affected tests повторно прошли.

Канон: executable prompt-presence regression PASS; mb-lint по пяти изменённым
документам — 0 ошибок, но четыре dd-flow документа исключены repo ignorePaths;
фактически lint проверил SPC-008, это ограничение не скрывается.
`git diff --check` PASS в обоих репозиториях.

Нет полного engine/release gate, installed matrix, browser/product suites,
GitHub CI, paid qualification или новых E2E. Семантическая корректность LLM после
изменения промпта остаётся предметом отдельно разрешённой живой регрессии.
