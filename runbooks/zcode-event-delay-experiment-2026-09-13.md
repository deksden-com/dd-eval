# ZCode: локализация задержки и живой эксперимент

Дата разбора: 2026-09-13, Europe/Kaliningrad. Исторический EVAL и рабочий код не изменялись.

## Почему вызванный CLI не нашёл event

Это два независимых пути: native Bash исполняет `dd-flow work start`, а native notification поступает в `AcpBridge.receive`, ставится в общую Promise-очередь и затем через отдельный процесс `dd-flow zcode event handle` сохраняет доверенную identity в БД. Вызов CLI сам по себе не предоставляет native child/tool-call identity. В режиме исследованного запуска notification не является блокирующим pre-execution hook, несмотря на имя PreToolUse у записи flow.

## Историческая задержка локализована

Сопоставлены immutable чтение `hook_events`, `adapter.events.jsonl` и `model-observations.jsonl` одного controller. Время UTC. Model observation — отметка внутри forwarder перед запуском subprocess, НЕ точное время входа callback. created_at — timestamp INSERT, НЕ отдельное доказательство времени commit/видимости.

| Work | Inbound event | Model observation перед subprocess | Receipt created_at | Inbound → receipt |
| --- | --- | --- | --- | --- |
| WRK-006 | 15:54:36.733 | 15:54:36.793 | 15:54:39.279 | 2.546 s |
| WRK-007 | 15:54:37.952 | 15:54:39.835 | 15:54:41.692 | 3.740 s |
| WRK-008 | 15:54:40.559 | 15:54:42.540 | 15:54:45.230 | 4.671 s |
| WRK-004 | 15:54:40.976 | 15:54:46.573 | 15:54:48.215 | 7.239 s |
| WRK-005 | 15:54:41.959 | 15:54:48.702 | 15:54:49.513 | 7.554 s |

Объяснение подтверждается кодом: `AcpBridge.receive` сериализует все notifications, `flowForwarder` ждёт model observation и завершения каждого CLI subprocess перед переходом к следующему событию. Пять параллельных child запусков породили последовательное обслуживание receipt. Основная задержка последних событий накопилась после их получения адаптером. Это не объяснение «провайдер долго думал» и не потеря сообщения по дороге к адаптеру.

Нельзя отдельно измерить по этим старым логам время ожидания очереди, model-journal lock/fsync, startup CLI, SQLite contention и post-insert работы. Для этого в исправлении нужны timestamps enqueue, dequeue, subprocess start/exit, receipt acknowledgment. Также время возврата ошибки в ACP не равно времени SQL-проверки внутри CLI: receipt created_at раньше видимого error output не опровергает отказ, произошедший ранее.

## Живой опыт №1: искусственное удержание callback 3 секунды

Скрипт: `tools/probe-zcode-live-order.mjs`. Настоящий ZCode ACP, новая Session, пустой mkdtemp workspace. Root и один foreground child выполняют только `node -e` с timestamp. Обработчик уведомления задерживается; dd-flow не вызывается, старые RUN не затрагиваются.

Journal: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-order-LVP1Mt/adapter.events.jsonl`.
ACP Session: `29c3481a-ab05-4689-8aa8-48fbd0441006`.

- Child notification: 22:25:25.522 UTC.
- Child marker из самой Bash-команды: 22:25:25.714 UTC, через 192 ms.
- Completed tool update: 22:25:25.751 UTC.
- Callback завершён: 22:25:28.523 UTC.

Команда и её результат появились ДО завершения обработки event. Поэтому await callback не является native execution barrier. Root в первом опыте выполнился после callback (shell стартовал дольше трёх секунд); это не доказательство барьера, поэтому нужен повтор с большим удержанием.

Session завершила turn с end_turn; topology показала running=[] и одного successful child; затем отправлен session/cancel и закрыта группа процессов bridge.

## Живой опыт №2: удержание callback 15 секунд

Journal: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-order-GOkiqQ/adapter.events.jsonl`.
ACP Session: `5a86c351-0e81-4f79-8a70-a0b34ceced89`.

| Исполнитель | Callback start | Marker из команды | Callback finish |
| --- | --- | --- | --- |
| Root | 22:27:37.691 | 22:27:48.816 | 22:27:52.693 |
| Child | 22:28:03.200 | 22:28:04.561 | 22:28:18.211 |

Оба исполнились до callback finish. В обоих живых journals 0 permission requests. Второй turn также end_turn, running=[], один successful child; отправлен cancel и закрыт bridge. Значит, отсутствие барьера подтверждено для root и child, а не только inferred из отсутствия permission в старом журнале.

## Следствие для фикса

Нужно исправлять две разные вещи: убрать накопление критических receipt за медленной обработкой чужих событий и установить причинную связь trusted receipt → execution. Простая параллелизация ускорит доставку, но не гарантирует нужный порядок и не заменяет identity/barrier. Простое увеличение timeout также не делает протокол корректным.

Проверка native pre-execution механизма остаётся отдельной задачей: текущий опыт доказал отсутствие барьера у используемого notification пути, а не работоспособность какого-либо альтернативного hook. Не ослаблять проверку identity и не выбирать последнее из нескольких совпадений.
