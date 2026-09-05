# Повторная верификация плана 024

Дата: 2026-09-06. Новый E2E не запущен. Полная готовность пока не подтверждена.

## База проверки

До исправлений: dd-eval `efc025b`, dd-flow-cli `8de503c` / npm
`0.9.0-beta.16`, dd-memorybank `8e572d1` / 4.0.4,
zcode-acp `43f654b` / 0.13.1. Все рабочие деревья были чистыми.
Сверялись требования 024 с исполняемыми ветками кода, а не только с отчётом
о реализации и количеством зелёных тестов.

## Исправления повторной проверки

1. Раннер запрещал законный MERGE → CODE repair, сравнивая авторитетный
   continuation CLI с линейным массивом стадий. Теперь обычный переход,
   восстановление и выбор следующего checkpoint читают continuation CLI.
2. После рестарта ошибка productive operation могла превращаться в ожидание
   провайдера или cancellation очистки. Сохраняется исходный failure и путь
   к попытке; cleanup не заменяет исход выполнения.
3. Targeted Session operations проверяют возвращённый native ID и harness.
   AGY recovery передаёт конкретный Session ID при запуске моста; чужой result
   не завершает root Turn, активный новый Turn не считается settled по старому.
4. Новый старт той же стадии перезаписывал старые контекст/launcher/response.
   Пакеты получают уникальные имена; журнал хранит их пути и hashes. HITL
   recovery читает пакет из записи context_prepared, не угадывает старое имя.
5. Второе архивирование повторно переписывало пути уже архивированных receipts.
   Перенос журналируется до rename; незавершённый перенос можно продолжить.
   Архивы прежних попыток не переписываются. Их исходные stage facts сохраняются
   в archive.json. Публичное чтение receipts проецирует пути приложений на
   текущую архивную папку без изменения исходных receipt bytes.
6. MERGE repair повторно создавал работу и не принимал merge-only causal check.
   Используется существующий repair cycle для повторного обращения; причинная
   проверка берётся из всех объявленных проверок, включая merge.
7. Retry проверки теперь требует reason и receipt текущей попытки этой стадии;
   старый receipt из try-NNN не разрешает повтор. Эквивалентные проверки в одном
   gate объединяются независимо от run_at с сохранением всех check refs.
8. Runtime MERGE prompt противоречил канону про восстановление среды.
   Маршруты source repair и environment retry приведены к одной инструкции.
9. Общий код снимков исключает node_modules, кэши и .env; база сохраняется
   через VACUUM INTO, а не копированием живых SQLite/WAL файлов. Обычный E2E
   сохраняет реальный checkpoint принятой границы, не только событие о ней.
10. Добавлен runner eval preflight --profile: подготовка изолированного
    checkout/DD_FLOW_HOME, проверка пары и профилей, стартовый пакет SPECIFY,
    receipt; без создания модельных Session. Это та же подготовка, что eval run.
11. Канонические PLAN/PLAN-REVIEW/CODE-REVIEW дополнены проверкой публичных
    test entrypoints в чистой среде: выбор тестов, DB/schema/seed/services,
    cwd/env, cleanup, запрет зависимости от случайных остатков предыдущих тестов.
    Кураторский пакет dd-tasks синхронизирован без правок продукта и Git overlays.

## Подтверждённые проверки

- dd-eval: 164/164 теста прошли как последовательно, так и обычным параллельным
  запуском. В параллельных тестах устранены слишком короткие искусственные
  окна 20–150 мс; производственный бюджет активности модели не увеличивался.
- Завершение процесса: grace до SIGKILL отделён от срока подтверждения
  остановки ядром ОС. EPERM при проверке существования не означает «процесс умер».
- CLI: typecheck и lint проходят. Прицельные тесты снимков, archive/retry,
  проверок и CODE: 30/30, включая повтор после дополнения archive.json.
  Не заменять этим итог полного набора.
- Большой CLI suite обнаружил два истечения lease в тестах очереди.
  FIFO-тест прошёл отдельным повтором; ownership/wait-next исправлен: его
  30-секундная тестовая аренда истекала во время подготовки второго протокола.
  С арендой 300 секунд тест прошёл; эксплуатационный TTL не менялся.
  Итог первоначального полного запуска: 270 passed / 2 failed, 18 файлов,
  2663.99 с. Оба отказа проверены отдельными повторными запусками; новый
  целиком зелёный полный запуск после всех изменений пока не заявляется.
- Memory Bank lint: dd-memorybank и dd-tasks — 0 ошибок, 0 предупреждений.
- ZCode: qualification на native 0.16.5 / bridge 0.13.1, commit 43f654b,
  завершена успешно; capacity — 15 started / 15 completed / 0 failed,
  очистка завершена. Профиль обновлён. Это короткие probes, не E2E.

Локальные evidence:

- `/tmp/dd-eval-024-all-final.log`
- `/tmp/dd-eval-024-serial-tests.log`
- `/tmp/dd-flow-024-verification-tests.log`
- `/tmp/dd-flow-024-final-focused.log`
- `/tmp/dd-flow-024-lane-recheck.log`
- `/tmp/dd-flow-024-lane-final.log`
- `$DD_EVAL_HOME/conformance/harness-compatibility/20260905224154339/zcode-acp-zai-glm-5-3-flash-max/receipt.json`
- `$DD_EVAL_HOME/conformance/native-subagents/20260905224216340/zcode-acp-zai-glm-5-3-flash-max/capacity.json`

## Что ещё нельзя объявить закрытым

Это оставшиеся требования того же 024, не новый слой классификации эвалов.

1. **B3: terminal child → конкретная Work/Session attempt.** driveFanout читает
   состояние Works, но полный trusted observation path для failed child не
   доведён до сверки связи исполнения. Нужны регрессии failed до/после start,
   late event после retry, missing association и живой detached check. Нельзя
   угадывать Work по порядку списка или автоматически принимать native success.
2. **B2: все пути исполнения.** Исправлены обнаруженные normal/recovery ветки,
   но полный fault-injection прогон reference/server source repair ещё не
   подтверждён. Сохраняется риск расхождения веток; тест чистой функции
   continuation не является проверкой всей цепочки.
3. **B4: MERGE repair после падения между несколькими эффектами.** Архивирование
   восстановимо и повторный repair не создаёт ещё один Work. Но отказ в каждой
   точке между abort, сменой состояния, созданием Work и release lane ещё не
   покрыт требуемым тестом. Нельзя утверждать exactly-once всей операции.
4. **B6/B7: AGY late Stop и статистика ZCode.** AGY sessionObservations остаётся
   памятью процесса; защита от позднего Stop прежнего executionNum не доказана.
   Проверить, что повтор одинакового provider update не обновляет productive
   activity. ZCode bridge.toolSummary агрегируется на мост: нужен тест, что
   root/child ingest не присваивает один счётчик нескольким Session.
5. **B8: incomplete evidence.** Путь неуспешной попытки теперь сохраняется,
   Judge может оценивать неполный результат. Но ссылка на изменяемую попытку
   не равна неизменяемому полному снимку на любой точке отказа. Для incomplete
   bundle требуются отдельные failure/finalize/restart тесты и фиксация missing.

## Подготовка E2E и порядок снятия блокировки

Намерение запуска: Luna xhigh / AGY Gemini 3.1 Pro high / ZCode GLM 5.3 Flash max;
Judge Sol high; same_session; inline MERGE; до merge_completed.

1. Закрыть перечисленные приёмочные пробелы и завершить полный CLI suite.
2. Коммит изменений, release CLI по его ранбуку, readback tarball build-info,
   установка выпущенного router/engine. Не выдавать локальный dist за npm-релиз.
3. Зафиксировать новый flow-pack commit и engine в новом input checkpoint.
   Исходный продукт кейса оставить `44939e95060a65e80571acdcbf42609b80621e63`;
   не подменять его уже реализованным продуктом и не перестраивать canonical
   stage packages ради E2E.
4. Обновить case reference/hash и проверки metadata, закоммитить definition.
5. Провести три runner eval preflight с существующими E2E run profiles.
   Сохранить receipts и явный verdict готовности. Текущий case всё ещё
   ссылается на beta.15; его нельзя запускать как проверку новых исправлений.
6. Полный E2E — отдельный запуск после подготовки. Не маркировать этот аудит
   или capacity probes как результаты E2E.

## Зафиксированное состояние на остановке верификации

- dd-flow-cli: `0dd4da3`, изменения и Changeset отправлены в main; npm-релиз
  намеренно не выпускался до закрытия оставшихся пунктов.
- dd-memorybank: `ced59c1`, отправлен в main.
- dd-tasks: `91b317a`, отправлен в main; только синхронизация flow pack.
- dd-eval: `0bbeaaf`, исправления и аудит отправлены в main.
- `runner eval preflight` действительно выполнен и отклонён с
  `input_checkpoint_engine_mismatch`: установленный beta.16 против beta.15
  в case checkpoint. Ни Subject, ни Judge Session не создавались.
- Receipt: `$DD_EVAL_HOME/conformance/e2e-preflight/1788649942295-a7001de6/e2e-inline-merge-luna-xhigh/receipt.json`.
- Выполнены strict-canon build, typecheck, lint; текущие 30 прицельных CLI
  тестов и 164 dd-eval теста прошли. Нельзя называть это полной приёмкой 024
  или полностью подготовленным E2E: приёмочные пробелы перечислены выше.
