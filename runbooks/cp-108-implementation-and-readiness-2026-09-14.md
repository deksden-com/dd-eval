# cp-108: завершение системного пакета cp-107

## Реализованные границы

| Требование исходного плана | Реализация и проверка |
| --- | --- |
| Writer reservation до чтения, nested ownership | `Database.writeTransaction` / `beginWriteTransaction`; два SQLite соединения, rollback и отказ неизвестному outer transaction в writer-contract tests |
| Claim, packet authority и Work binding вместе | Одна SQL-транзакция `startBoundWork`; WorkSession хранит bytes, hashes, generation и полный ответ. Publication выполняется после commit. Work receipt tests и потеря публикации в lifecycle-invocations tests |
| no_effect / committed / unknown | no_effect для SQL-only старта только после доказанного rollback; committed publication failure не превращается в failed invocation; неизвестный dispatch не повторяется |
| Ограниченный storage retry | Один successor в ZCode ledger; для остальных harnesses один retry в существующем hook outcome по Work/generation. Счётчик сохраняется; незавершённый retry имеет deadline и требует reconciliation. Две регрессии non-invocation и persisted successor test |
| Общий trusted outcome | `hook_events.outcome_json`, атомарно с controller event. Атрибуция — immutable hook, Session/parent, controller create receipt либо проверенный daemon, не текст модели. Общая root/child матрица для всех шести harnesses |
| Ошибка до чтения result-файла | Немутабельная проверка точного hook match до dispatch; не заменяет обязательный claim. Реальный CLI в controller-stage fixture отклоняет команду, а provider остаётся pending |
| Непрерывное наблюдение | Один controller timer на весь executeController, отдельное read-only соединение и retained outcome reconciliation; синхронные dispatch barriers. Проверены pending prompt и waiting_for_context: один RUN stop, следующий stage не запускается |
| Сохранение primary, drain | Primary фиксируется перед fence/stop. Adapter promise и fanout join, cancellation после control. Ошибка failure persistence/cleanup/response-file не заменяет primary. Controller, adapter и process-json tests |
| Принятие стадий по актуальным входам | PLAN-REVIEW, CODE, CODE-REVIEW сверяют Work graph и входные hashes внутри writer reservation; тяжёлые checks вне него. Git preparation MERGE отделена от nested SQL settlement. Stage-consistency и сквозной vnext-protocolize test |
| Строгий журнал EVAL | Проверяются scope, sequence, duplicate identity/payload, malformed/truncated tail. После fsync projection failure — отдельное warning, duplicate восстанавливает projection |
| Наблюдаемость EVAL | Один status reader во время context/HITL callback; терминальный worker receipt восстанавливает root event; observation содержит stage/status/error, последний Work/operation и pending operations. Проекция использует тот же execution reducer, что productive admission: поздний waiting не оживляет failed, старое поколение не загрязняет recovery. Nested infrastructure cause учитывается в failure policy и validity |
| Старые engines не обходят гарантии | Writer contract 2. Старый writer отказывается писать новый store; исторические homes не мигрируются. Новый E2E — новый cp-108 и новые homes |

Новый универсальный ledger, event broker, внешние зависимости и новые model-authored
IDs не добавлены. Реальная остановка native дерева подтверждается существующим
RUN control; завершение transport не считается доказательством native shutdown.
Неопределённый исход требует reconciliation, а не автоматического повторного prompt.
При отказе SQL settlement сохраняется отдельный scoped diagnostic artifact, который
тот же observer читает как причину остановки, но никогда как разрешение повторить
операцию. При отказе обоих каналов исходная причина остаётся в stderr владельца;
успешная остановка native дерева в этом случае не заявляется. Fault injection
проверяет rollback outcome и чтение diagnostic fallback для каждого harness.

## Подготовка запуска

1. Release beta.64 на чистом commit: один обязательный release gate и публикация.
2. Изолированный published consumer, проверка provenance/checksum и non-generative
   doctors Subject/Judge из точного установленного runtime.
3. cp-108 сохраняет source, flow pack, MemoryBank и case inputs cp-107; меняется engine pin.
4. Новый campaign home и новый resource home contract 2, общий для всех процессов
   этой кампании. Не направлять beta.64 в старый contract-1 resource registry.
   Если одновременно нужны кампании разных writer contracts, их registries и
   выдаваемые ресурсы не смешивать; старые процессы сначала учитывать отдельно.
5. Чистый committed dd-eval, проверенные профили и штатные host prerequisites.
   Никаких отдельных quality/browser/world прогонов: baseline запускается самим E2E.
6. Запуск ZCode из существующего `e2e-inline-merge-zcode-glm-5-3-flash-max` profile.
   Номер EVAL, release receipt и фактический старт дописать после выполнения.

Адресные проверки: 64 storage/lifecycle/stage; 45 lifecycle/Work publication;
44 writer/migration/vnext protocolize; 3 реальные controller-stage регрессии;
111 EVAL client/journal/transport и 11 execution/projection/race — прошли.
Это пересекающиеся наборы, их числа не суммируются в число уникальных тестов.
Последняя проверка fallback diagnostics также завершилась без failures (Vitest receipt).

Первый release gate на `f21e056` дал 693 PASS / 7 FAIL: два тестовых адаптера
ещё использовали прежний transaction API. Исправленная точка fault injection
дополнительно обнаружила реальный конфликт Work packet после recovery.
Он исправлен: старый пакет остаётся evidence, новое поколение использует отдельный
путь `works/<Work>/starts/<WorkSession>/prompt.md`. Проверка подтверждает сохранность
старых bytes и публикацию нового recovery packet. Unit resource registries вынесены
из пользовательского home и из проверяемого workspace.
Адресные 13 проверок, typecheck и lint после этой доработки прошли.

CLI commit `53046a13b2a4370531d64b380974abbd6bf2383b`, beta.64.
Повторный release gate после исправления причин падения:
https://github.com/deksden-com/dd-flow-cli/actions/runs/34868774949.
Первую неуспешную попытку не считаем успешной квалификацией; повтор нужен для
исправленного release commit, отдельный локальный full gate не запускался.
Итог повторного gate: **700/700 PASS, 58 файлов**, публикация beta.64 и проверки
release consumers завершены успешно. Локально установлен точный npm-пакет;
engine install/resolve дал checksum
`26970ba55cca2070d806041962837356077bbcf1948ebdccd6067c04cabe5029`.
Build provenance совпал с CLI commit и canon `97f811d` / MemoryBank 4.1.1.
Doctors из опубликованного runtime подтвердили ZCode 0.16.5 / bridge 0.13.1
(`60af0d3`, qualified root/concurrent children/continuation) и Codex CLI 0.154.0
для Judge Sol high. Native nested children не заявляются поддержанными.
После изменения проекции дополнительно прошли 80 EVAL admission/recovery tests.

Checkpoint: `cp-108-task-priority-durable-lifecycle-flow-4-1-1-engine-0-9-0-beta-64`.
Campaign home: `/Users/deksden/.dd-eval/qualification/cp-108-zcode`;
portable config — `config`, общий новый registry — `resources`.
Receipt подготовки: `preparation-receipt.json` внутри campaign home.
Source/flow/MB/task/ответы не менялись. PostgreSQL healthy на 127.0.0.1:55433.
Подготовка закончена; baseline и verdict до фактического E2E не заявляются.
Фактический EVAL ID и ход выполнения сохраняет штатный runner в `runs/` этого home;
definition worktree после запуска не редактировать для дописывания статуса.
