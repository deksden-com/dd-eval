# ZCode stop: изолированный эксперимент 2026-09-13

## Источники и версия

- ACP: https://agentclientprotocol.com/protocol/v1/prompt-turn — session/cancel и cancelled stopReason.
- Авторская документация моста: https://github.com/william0wang/zcode-acp/blob/main/docs/PROTOCOL.md — native session/stop, session/read.
- Текущий локальный мост: zcode-acp 0.13.1, git 43f654b, `/Users/deksden/Library/pnpm/zcode-acp` → локальный dist/cli.js.
- Native backend из установленного приложения: `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`, версия 0.16.5.
- В native bundle session/stop вызывает activeAbortController.abort; session/close вызывает app.close, disposeSession и удаляет resident из sessions map. Ответ stop не является подтверждением quiescence.

Ни одна существующая сессия не использовалась и не останавливалась. Каждый probe создавал новый Session и пустой временный каталог. Команда ограничена 20 секундами, без файловых изменений и subagents. Credentials использованы штатным загрузчиком, не печатались и не сохранялись в отчёт.

## A. ACP cancel

Скрипт `tools/probe-zcode-cancel.mjs cancel`.
Journal: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-cancel-O4vbe8/adapter.events.jsonl`.
ACP Session `1d14a413-9440-4bea-b207-b4072552a8e0`; native `sess_98d2cddc-8b38-49c6-ad1a-03e9aa6b21e0`.

- 16:14:51.854 UTC: Bash node с 20-секундным таймером.
- 16:14:52.855: отправлен session/cancel; debug моста подтверждает получение и разрешение native Session ID.
- 16:15:17.862: следующий Bash с DD_CANCEL_AFTER — после cancel.
- 16:15:20.895: prompt result stopReason=cancelled.
- 16:15:22.196: native projection idle; затем ещё две idle-инспекции.

Вывод: cancelled stopReason в этом запуске не доказывает, что агент прекратил действия при отмене. Проблема воспроизводится без dd-flow ledger/fatal errors.

## B. Прямой native stop

Скрипт `tools/probe-zcode-native-stop.mjs stop`.
Session `sess_2b6860b5-6d4d-4682-abb4-bd1c5bc5a29a`, backend PID 66559.
16:18:00.221: session/stop вернул успешный пустой result. Активный tool оставался running; idle появился 16:18:27.783. Из этого не следует, что остановка была эффективной; поздний idle совместим с естественным окончанием задания.

## C. Scoped close после неэффективного stop

Контрольный повтор `tools/probe-zcode-native-stop.mjs close` с явным session/setMode=yolo.
Каталог `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-native-stop-Fl1I2J`.
Session `sess_eee7365d-932c-4616-a43b-50fe1878c7e3`, backend PID 70261.

- 16:20:23.694: stop вернул result={}; активный Bash не исчез.
- 16:20:27.728: физически наблюдались shell PID 70660 и Node PID 70661 с DD_NATIVE_BEGIN/20-секундным таймером.
- 16:20:29.238: session/close вернул closed=true.
- 16:20:32.278: оба marker-процесса отсутствуют, до естественного окончания таймера.
- Повтор close: Session is not active (-32004); это ожидаемо после удаления resident.
- 16:20:32.309: изолированный backend закрыт; повторная проверка marker-процессов пуста.

Предыдущий close-прогон также завершился, но не зафиксировал физические marker-процессы до close; поэтому сильное свидетельство — контрольный повтор выше.

## Механизм к реализации

1. Fatal закрывает productive admission; RUN control адресует конкретную native root session.
2. Отправить обычный cancel/stop, затем проверить root, active tools, background/subagents. Receipt cancelled сам по себе недостаточен.
3. Если после ограниченного drain root продолжает работать, вызвать native session/close для этой сессии и проверить физические ресурсы. Добавить узкий extension в ACP bridge, поскольку в текущем dd-zcode прямого session-close пути нет; не открывать произвольный native-RPC passthrough.
4. Сохранить transcript/последнюю projection до close: subsequent read может вернуть Session is not active. Не resume для проверки остановки — это может заново материализовать resident.
5. Дочерние sessions/tasks отменять по доказанной topology. Close root с живыми subagents и capture/reattach проверить отдельно перед выпуском; текущий probe их не квалифицирует.
6. Если scoped close не завершил принадлежащие RUN процессы, штатный owned-process stop с сохранением PID/birth и force-policy. Не killall и не остановка общего пользовательского ZCode.

Исходные A–C были проектом механизма. Ниже — дополнительная проверка реализации Fix 033.

## D. Закрытие root с живым дочерним tool

`node tools/probe-zcode-close-tree.mjs`, ZCode 0.16.5. Evidence:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-close-tree-mHryGo/receipt.json`.
Root `sess_63304457-9f4d-4857-9a3d-57e9ddc673ee`, child
`sess_subagent_agent_1862803d-8479-461c-9f0f-c2d2c8657f7f`.

- 18:47:28 UTC: физически наблюдались дочерние shell 33247 / Node 33248 с уникальным marker и 45-секундным таймером; отправлен stop.
- 18:47:33.698: scoped close вернул `closed:true`.
- 18:47:35.754: marker-процессы отсутствуют до естественного конца таймера; native child read вернул -32004.
- Результат `physical_tree_passed`; изолированный backend закрыт. Чужие Sessions не затронуты.

Мост `e0600fe3c46e215695f257e65aa6f674ced998d8` добавляет узкий
`zcode/session/resident`: он читает native ID без ensure/resume и только -32004
считает отсутствием resident. Production adapter проверяет root и все известные
child IDs, сохраняет close receipt и запрещает productive resume закрытой Session.
Ошибки/неизвестная topology остаются `needs_attention`, а не превращаются в stopped.

Реальный ACP wire smoke close→resident также PASS, native
`sess_a8cb058c-aeae-49bb-ae4f-38ac2f4555df`, каталог
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-close-wire-WNmDUD`.
После close residency=false; проверка не воскресила resident.

## E. Lifecycle нового моста

Долговременные копии трёх каталогов D/E сохранены под
`/Users/deksden/.dd-eval/qualification/cp-103-luna-zcode/adapter-probes/`;
исходные временные пути внутри evidence не переписывались.

`node tools/probe-zcode-production-invocations.mjs` с bridge `e0600fe` — PASS.
Evidence: `/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-production-I5PCmn/result.json`.
Проверены root, два concurrent children, SendMessage continuation того же child,
шесть завершённых lifecycle attempts, уникальные identities и корректная ancestry.
Native nested children не поддержаны. Runtime qualification и eval profiles
обязаны закреплять именно этот commit; старая квалификация другого bridge не переносится автоматически.
