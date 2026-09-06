# 026. Завершение с ошибкой и восстановление прерванного эвала

Дата: 2026-09-06. Статус: проект комплексной доработки; не реализовано.
Репозитории: dd-eval, dd-flow-cli, dd-memorybank. Нативные упряжки — через
существующие адаптеры. Перенос в новый монорепозиторий dd-flow не входит в пакет.

## 1. Принятое продуктовое решение

Эвал завершается с ошибкой, а не остаётся бессрочно на инфраструктурной паузе.
Ошибка должна быть понятной и сохранять фактическую причину для любой упряжки.
После исправления доступа, среды или сброса лимита пользователь может явно
восстановить прерванное выполнение. Восстановление — новая сохраняемая операция,
а не удаление ошибки, повтор старого запроса или новый эвал с нуля.

Прерванные агенты получают адресные промпты восстановления: им сообщают об
ошибке, подтверждённом состоянии и необходимости проверить частичные эффекты.
Завершённые Work не перезапускаются. Исходные результаты и оценки сохраняются.

Этот проект расширяет 014, 017–019, 022–025. После реализации он заменит запрет
на инфраструктурное продолжение terminal failed execution в текущем runbook.
Смысловые ошибки Subject, HITL и source repair не становятся инфраструктурными
повторами. Никакие приведённые ниже новые команды пока не доступны.

## 2. Проверенная исходная реализация

Срез исследования: dd-eval `3f24d68b6e874c1cd5d629a12fe8eb7b7438b4e9`,
dd-flow-cli `5624d92e8e96732db6a81f1cf86fb5342f38401f`.

| Место | Факт | Следствие |
| --- | --- | --- |
| `dd-eval/lib/runner-events.mjs`, `daemon-operations.mjs`, `driver-recovery.mjs` | Журнал, at-most-once dispatch, поздние ответы, блокировка неизвестного исхода уже есть | Расширяем эти механизмы, не создаём второй registry |
| `runner.mjs`: `runnerResume`, `runnerReconcile` | Resume отклоняет failed launch; reconcile принимает только уже достигнутую terminal stage | Нужен новый recovery attempt с отдельным ID |
| `runner.mjs`: `providerTurn`, обработчики ошибок адаптеров | Общий AGY error, частичная классификация ZCode, разные transport errors | Общая модель ошибки поверх нативных доказательств |
| `runner.mjs`: `frozenCandidate`, `finalizeRunProjection` | Единственные candidate.json / judge/result.json; иной candidate вызывает конфликт | Ревизии результатов, а не перезапись старой оценки |
| `dd-flow-cli/src/services/eval-snapshots.ts` | SQLite сохраняется через VACUUM INTO; файлы копируются последовательно | SQLite-consistent не означает согласованность всего RUN |
| Там же | Incomplete snapshot явно `restorable: false`; active children допустимы только как forensic evidence | Нельзя включить restore простым изменением флага |
| Там же: `rebaseRuntime` | При stage-entry restore running work_sessions становятся completed; bindings сбрасываются | Этот путь не подходит для прерванного Work |
| `work-registry.ts` | `work start` принимает created; retry архивирует файлы и возвращает failed Work в created | Нужен отдельный recovery binding, не подмена статусов через retry |
| `code-checks.ts`, `managed-processes.ts` | Есть receipts, completion markers, process identity/lease и reconciliation | Использовать для определения фактического исхода команд |
| `dd-eval/lib/storage.mjs` | GC выбирает terminal runs, включая completed_with_failures | Recovery retention и повторная проверка перед удалением обязательны |

Проверки исходной базы: `node --test test/runner-recovery.test.mjs` — 17/17;
`pnpm exec vitest run test/eval-snapshots.test.ts` в dd-flow-cli — 7/7.
Это не квалификация нового механизма; новых продуктивных сессий не запускалось.

## 3. Семантика состояний: не путать ошибку, остановку и снимок

Разделяем четыре независимых факта:

1. Итог попытки эвала: running / succeeded / failed / cancelled.
2. Исход provider/tool operation: not_dispatched / completed / failed / unknown.
3. Физическое исполнение: active / settled / unknown.
4. Готовность восстановления: pending_capture / ready / reconciliation_required /
   unavailable, с конкретными причинами и доступными режимами.

Это логические поля будущего контракта, не требование переименовать все
существующие enum. Старый launch имеет один terminal результат навсегда.
При потере связи можно завершить попытку эвала ошибкой наблюдения, но нельзя
записать выдуманный failed/cancelled результат исходной provider operation.
Поздний ответ присоединяется к её собственному ID, не меняя исторический verdict
попытки. Последующее reconciliation может завершиться без нового model turn.

У текущего RUN сохраняется отдельный recovery guard; бизнес-состояния стадий
и Work не объявляются completed/failed только из-за сбоя транспорта.
API/status показывает guard вместе с running Work, чтобы не изображать живую
работу после прерывания. После подтверждённой остановки старая work_session
закрывается как interrupted, а не completed. Смысловой Work сохраняет ID,
задачу, зависимости, исходный started_at и историю сегментов исполнения.

## 4. Нормализация ошибки для всех упряжек

Расширить существующий error record, сохранив cause chain:

- interruption_id, execution_id, attempt_id, stage/Work, operation_id;
- источник: provider / transport / harness / flow / environment / controller;
- category: quota, rate_limit, authentication, account_access,
  provider_unavailable, network, process_crash, storage, unknown;
- нормализованный code, понятное сообщение и нативные code/status/request ID;
- evidence: сохранённые события/receipts с контрольными суммами;
- provider_operation_outcome и observed execution/tree state отдельно;
- occurred_at, если сообщил источник, observed_at и условие восстановления;
- retry_after/reset_at с источником и признаком оценочного времени;
- secondary_errors: cleanup/capture failures не заменяют первичную ошибку.

Сначала структурированные нативные поля, затем квалифицированный fallback
парсер текста с сохранением исходного свидетельства. 401/403/429/5xx сами по
себе не доказывают ни полное прекращение работы, ни доступность той же сессии.
Неизвестная ошибка не становится recoverable только из-за regex или
retryable=true. Исправимость причины и безопасность продолжения — разные поля.

Без секретов в общем журнале и промптах. Полный диагностический материал,
если нужен, хранится отдельно с ограниченным доступом и политикой очистки;
публичная копия санитизируется. Тексты провайдера — данные, не инструкции.

## 5. Два момента фиксации вместо выдуманного мгновенного snapshot

Нельзя универсально атомарно снять SQLite, Git, произвольные файлы, процессы
и удалённую provider session в момент сетевой ошибки. Поэтому фиксируем:

- T0: ошибка обнаружена; сохраняем доступное свидетельство немедленно.
- T1: достигнут проверенный барьер записи; это точка recovery capture.

В manifest есть T0/T1, границы журналов каждого источника и результаты,
полученные между ними. Не выдаём T1 за состояние точно на T0. Если хост умер
внезапно, T0 может быть неизвестно: следующий контроллер фиксирует время
обнаружения и последние подтверждённые receipts, не сочиняет missing events.

### 5.1. Сначала закрепить прерывание

1. Под execution lock записать interruption intent и первичную ошибку.
2. Запретить новые productive dispatch для этого execution и native fanout.
3. В dd-flow установить RUN recovery guard с идентификатором поколения.
4. Сохранить минимальные ссылки на manifest, текущие операции, RUN/Work/session
   identities, source versions и последнее наблюдение. Полная копия не должна
   задерживать сообщение пользователю об ошибке.

Промежуток между записью dd-eval и guard dd-flow не считать атомарным.
Оба шага идемпотентны; после crash незавершённый intent сначала дорабатывается,
а новые dispatch запрещены. Если сама запись на диск невозможна, сообщить
`capture_failed` через доступный канал, не обещать сохранившийся recovery bundle.

### 5.2. Дойти до барьера

Нужны две фазы guard: draining запрещает новую работу, но позволяет собрать
результаты уже начатых операций; sealed запрещает старые продуктивные записи.
Read-only inspection и запись поздних наблюдений остаются доступны.

Проверять всё принадлежащее execution дерево: coordinator, native children,
shell/check executors, dev servers и фоновые писатели. DB Work=completed не
доказывает остановку агента; daemon PID dead не доказывает остановку детей.
PID проверяется вместе с start identity/ownership, не только kill(pid, 0).

Подтверждённый инфраструктурный сбой останавливает новые волны. Уже выполняемые
операции сначала наблюдаются; безопасно завершающиеся siblings могут закончить
текущую работу без новых заданий. Политика ограниченного graceful shutdown должна
быть явной частью run profile. Force stop — отдельное разрешённое действие с
нечистым итогом; оно не доказывает откат внешних эффектов. Потеря ответа сама по
себе не даёт разрешения отменять работающий provider turn.

Во время draining связываем все начатые lifecycle/check/merge операции с их
результатами. Перед sealed либо они завершены, либо точно остановлены и имеют
явный неизвестный/частичный результат, требующий проверки. Поздние старые
hooks после sealed сохраняются как свидетельства; менять текущий RUN не могут.

Защита поколения должна проверяться в той же транзакции, где принимается
Work/Stage/merge mutation, и на входе в dispatch/tool forwarding. Проверка
только в начале долгого async finish недостаточна. Все способы мутации,
включая CLI, hooks и server MERGE, используют общий guard.

Guard не запрещает старому shell напрямую писать файлы. Поэтому обязательны
подтверждение остановки писателей и контроль неизменности источников во время
копирования. Если это нельзя доказать, результат только forensic или
reconciliation_required, а не готовая точка восстановления.

Generation нельзя брать автоматически как «текущее значение RUN» при каждом
запросе: тогда старый агент получит новые полномочия. Она привязана к конкретному
подтверждённому daemon/session binding и переносится доверенным adapter hook.
Отозванный binding не обновляется по просьбе модели. Административная запись
recovery receipts — отдельный узкий путь, а не обход guard для обычных команд.

### 5.3. Согласованный capture

После settlement, flush доступных native journals и sealed guard:

1. Сверить принятые Work/results/check receipts с authoritative SQLite;
   восстановить только детерминированные проекции. Несоответствие принятого
   результата обязательному артефакту — blocker, не разрешение угадать успех.
2. Создать snapshot во временном соседнем каталоге с capture ID.
3. Получить SQLite read snapshot существующим механизмом VACUUM INTO.
4. Скопировать покрываемые файлы, Git и session archives, зафиксировать
   водоразделы журналов (sequence/byte offset/hash), перечень исключений.
5. Проверить guard/generation, отсутствие новых писателей, source/copy hashes,
   целостность SQLite и связи results/artifacts. Статус читать из той же
   согласованной DB-копии, не из более раннего status перед копированием.
6. Последним записать полный manifest, синхронизировать критичные файлы и
   каталог, атомарно опубликовать bundle. Только после этого событие ready.

Сбой между публикацией bundle и событием ready устраняется по manifest/checksum,
не повторным созданием другого snapshot. Незавершённый временный bundle не
является recovery point. Совпадение двух hashes само по себе не доказывает
отсутствие неизвестного внешнего писателя; это дополнительная проверка к barrier.

Отдельно хранить `capture_integrity` и `continuation_eligibility`: согласованный
снимок может содержать неизвестный исход внешнего действия. Он пригоден для
восстановления файлов и диагностики, но не автоматически для продуктивного
продолжения. Нельзя устранить unknown outcome одной фразой «агент перепроверит»:
сперва разрешённое наблюдение, затем явное решение о доступных действиях.

## 6. Состав recovery bundle

Новый purpose/schema для interrupted recovery, отдельно от stage_entry,
candidate и incomplete. Переиспользовать копирование/Git/SQLite helpers, но не
stage-entry restore и его rebaseRuntime целиком.

| Часть | Обязательные данные |
| --- | --- |
| Identity | eval/execution/attempt/recovery IDs; parent attempt; RUN/project; stage attempt; capture generation |
| Definition | frozen case/fixtures/prompts, engine/flow/adapter versions и hashes, model/reasoning; исходные materialized packets |
| RUN | SQLite, timeline, projections, Stage state, Work DAG, dependencies, immutable accepted results, work_sessions |
| Work | original prompt/context, write scope, result schema, session lineage, последнее подтверждённое действие, pending operations |
| Workspace | все RUN/source/target workspaces; Git refs/objects, HEAD, index и staged/unstaged/untracked файлы; modes, symlinks, deletions |
| Git in progress | MERGE_HEAD/rebase/cherry-pick/conflict/index stages при наличии; незавершённый MERGE нельзя свести к HEAD+diff |
| Проверки | receipts, completion markers, stdout/stderr, hashes входов/артефактов, environment revision |
| Harness | native root/children IDs и доказанная топология, daemon/client operation ledgers, transcript/export, cursor и checksum |
| External effects | merge request/check/process/resource references и фактические outcomes; unknown остаётся unknown |
| Capture | T0/T1, source cursors, tree settlement evidence, integrity hashes, exclusions, missing components, supported recovery modes |

Git bundle + копия дерева, как сейчас, недостаточны для точного восстановления
индекса и незавершённого merge. Не коммитить dirty изменения ради snapshot.
Не копировать host-global registry целиком: сохранять только относящиеся к RUN
наблюдения; PID/lease/порты при восстановлении не оживают и не импортируются.

Нативный session store может содержать credentials и чужие сессии. Нужен
квалифицированный export выбранного дерева либо подтверждённый локальный
store с явным ограничением same-host; не архив всего пользовательского HOME.

Секреты не являются частью переносимого bundle. .env восстанавливается из
разрешённого secret source по перечню имён/версий, без значений и hashes
низкоэнтропийных секретов. Для skipped caches/dependencies сохранить способ
детерминированного bootstrap. Текущий snapshot filter нельзя слепо считать
полным: значимые ignored files и локальные БД требуют явного покрытия.

SQLite приложения/контейнеры/удалённые БД — не SQLite dd-flow. Для значимого
внешнего состояния нужен штатный backup/restore либо доказуемое восстановление
из fixtures. Если его нет, указывать ограничение; RAM процессов и удалённые
side effects универсальный bundle не восстанавливает.

## 7. Протокол восстановления

Пользовательский интерфейс проекта:

```text
dd-eval runner recovery inspect --eval <path> --execution <id>
dd-eval runner recover --eval <path> --execution <id> --from <interruption-id>
```

Inspect по умолчанию metadata-only; расширенное наблюдение не должно незаметно
запускать provider session. Recover явно разрешает подготовку и продуктивное
продолжение в пределах сохранённого задания. Существующий resume остаётся
reconciliation после restart; оба входа используют один выбор следующего
действия, но разные основания авторизации нового Turn.

Порядок:

1. Lock + idempotency key recovery; проверить свежесть исходного interruption,
   guard, retention, manifest и всю lineage. Два recovery не создают два дерева.
2. Reconcile исходные операции во всех daemon generations, не только primary
   directory. Поздний Work finish/Stage finish/merge commit учитывается один раз.
3. Проверить доступность provider/model, native resume capability, credentials.
   Смена аккаунта обновляет изолированную авторизацию через адаптер; секреты не
   передаются в prompt. Проверки по возможности не расходуют model turns.
4. Выбрать режим: та же сессия и retained workspace; восстановление из bundle
   в изолированный каталог; replacement session из исходного Work packet.
   Если native history привязана к абсолютному cwd, relocation не обещать.
5. При in-place продолжении сверить workspace с capture. Ремонт среды фиксировать
   отдельно. Изменение исходников/задания/engine не принимать как незаметный auth
   fix: сохранить diff и явно квалифицировать изменённые условия исполнения.
6. Для restore писать только в свежие целевые каталоги; исходники и bundle не
   перезаписывать. Сохранять logical RUN/Work IDs и отдельный physical runtime ID.
   Host resources перевыделить; пути менять по явной карте, не переписывать
   исторические journal/prompt bytes поиском и заменой.
7. Проверить RUN/Work graph и замороженные inputs. Новые engine/adapter versions
   допускаются только через явный compatibility/migration record с исходным
   снимком до миграции; иначе fail closed. Не подгружать актуальный case из HEAD.
8. Создать новый execution segment и новые work_session bindings, увеличить
   generation. До выдачи доступа сохраняются packet bytes, hash и dispatch ID.
9. Агент первым штатным lifecycle вызовом принимает свой recovery binding и
   получает authoritative Work recovery packet. Потом проводит проверки и
   продолжает работу. Успех ACK не равен доказанности всех side effects.
10. Live/recovery reducer снова сверяет receipts и выбирает следующий обычный
    переход. Новый сбой создаёт следующий interruption, сохраняя всю цепочку.

Обновление generation — не способ обойти живого старого агента: физический
barrier остаётся обязательным. Последний terminal verdict каждого сегмента
неизменен; общий report указывает текущий сегмент и предыдущие failures.

Минимальные изменения хранения: расширить RUN recovery metadata и work_sessions
полями recovery ID/generation/предыдущий binding, сохранить interrupted closure;
runner interruption/recovery/capture/packet events добавить в существующий
events.jsonl. Capture manifest хранит evidence, SQLite владеет полномочиями
текущего binding. Не заводить параллельный источник истины в ещё одной БД.
Для переходов DB + файловые packets нужен сохранённый intent/commit receipt и
reconciliation crash window: rename файла внутри SQL transaction не делает
файловую систему участником SQL rollback. Переиспользовать существующие
операционные примитивы, но проверить этот разрыв отдельно.

### Решения по Work

| Достоверное состояние | Действие |
| --- | --- |
| Completed, результат принят | Reuse; не запускать агента заново |
| Created, запуск не отправлялся | Обычный start по DAG после восстановления координатора |
| Created, но native dispatch мог состояться | Reconcile dispatch/binding; не создавать второй child |
| Running, прежний исполнитель всё ещё active/unknown | Наблюдать; recovery dispatch запрещён |
| Running, исполнитель подтверждённо прерван | Новый сегмент той же Work и специальный recovery packet |
| HITL paused | Сохранить pause ID и принятые answer bytes; отдельный штатный HITL resume |
| Failed по смыслу или cancelled пользователем | Не перезапускать автоматически; обычная политика retry/repair/отдельное разрешение |
| Finish мог выполниться, ответа нет | Reconcile DB/receipt/check outcome до любого нового Finish |

Root coordinator сначала получает техническую сводку и ограниченное задание
восстановить нужные child sessions. Если harness умеет адресовать child только
через native parent, использовать этот путь и проверять наблюдаемую lineage.
Упряжка без подтверждённого child resume может создать replacement child только
с объявленным разрывом контекста и после остановки старого. Не превращать Work
в новый root в обход native fanout. Координатор не переписывает результаты детей;
семантическое продолжение стадии — после завершения положенных Work.

## 8. Промпты и машинные ограничения

dd-flow владеет original task/result contract и генерирует Work packet;
dd-eval добавляет interruption context и выбирает момент доставки; adapter
только адресует правильную сессию. Шаблоны версионируются вместе с каноном.

Три варианта: coordinator recovery, same-session Work recovery, replacement
Work recovery. Это одна общая структура с разными ролями, не три независимых
системы инструкций. В packet входят исходная задача и hash, accepted dependency
results, роль/write scope, T0/T1, нормализованная причина, confirmed/unconfirmed
operations, состояние проверок и точные разрешённые lifecycle команды.

Нормативный каркас Work recovery prompt:

```text
<recovery_identity>
RUN / Work / recovery ID / execution generation: <verified values>
Mode: <same-session | replacement-session>
Your execution was interrupted. This is an authorized recovery segment of the
same Work, not a new assignment. The original task and write scope still apply.
</recovery_identity>

<trusted_recovery_state>
Failure category and observation time: <normalized facts>
Capture boundary and confirmed accepted results: <verified facts>
Unconfirmed operations and partial effects: <bounded references>
Original task/context, dependency results and evidence: <paths and hashes>
Session continuity: <proven history | missing context explicitly declared>
</trusted_recovery_state>

<recovery_task>
First execute the exact recovery-accept command supplied by dd-flow and read
the authoritative packet it returns. Reconcile the current workspace and the
listed incomplete operations before continuing. Do not assume the last command
succeeded or failed because its reply is missing. Inspect retained receipts,
logs and partial artifacts. Preserve accepted work and valid partial changes.
Resume only this Work. Do not repeat completed Work, create undeclared Work,
change the original requirements, or modify runtime databases and evidence.
</recovery_task>

<retry_rules>
An existing running check/finish must be observed, never duplicated. Use the
exact runtime retry command for an explicitly retryable failed/aborted check.
Do not rerun every check manually. Before repeating any external mutation,
establish its actual outcome and whether replay is safe. If that cannot be
established, report the concrete unresolved operation through the supplied
runtime command; do not guess, claim rollback, or force success.
For a read-only reviewer, recovery does not grant source-write permission.
</retry_rules>

<completion>
Record a short recovery assessment with evidence references: what was verified,
what remains partial, and what will be continued or safely retried. This is not
a claim that the runtime is settled. Complete the original Work using its
unchanged result schema and exact Finish command. Recovery assessment is a
separate artifact, not extra fields silently added to the business result.
</completion>
```

В реальные packets подставляются только проверенные ID/пути/команды и
ограниченные факты. Произвольные provider errors/transcripts отделены как
недоверенные данные и не могут создавать инструкции/подменять блоки шаблона.
Результаты Final Judge никогда не входят в recovery context Subject.

До productive prompt сохранить packet и delivery intent атомарно; после
отправки сохранять receipt/ack. Потеря ответа не разрешает отправить packet
второй раз: сначала исходная operation/session history. При неизвестной доставке
recovery остаётся blocked. Packet hash идентифицирует байты, а не доказывает,
что модель их поняла; binding/guard проверяются кодом.

## 9. Квалификация адаптеров

Общие способности, подтверждаемые отдельно для точной версии каждой упряжки:
structured failure, observe original operation, inspect root/tree без скрытого
productive resume, settle tree, retained-session resume, selective child resume,
archive/import portability, auth refresh, effective profile verification.
Отсутствие способности — явный capability gap, не фиктивный успех.

- Codex: проверить native thread resume, retained isolated home и child routing.
- AGY: нормализовать ERROR/квоты; проверить resume root/children и историю в
  прежнем isolated runtime, не только наличие conversation_id.
- ZCode: сохранить ACP/provider error details, учитывать раздельные native и
  adapter IDs; child resume не заменять terminal root cancellation.
- Grok: сохранить session files и cwd contract, обновить скопированный auth.
- OpenCode: сохранить isolated DB/session export и history hashes; обновить
  copied auth, не потеряв session data при создании нового daemon directory.
- Droid: сохранить ограничения после forced teardown; replacement mode не
  выдавать за квалифицированный same-ID resume.

Не нужна универсальная «кнопка refresh token» с предположением об одинаковой
авторизации. Конкретные безопасные действия выполняет соответствующий адаптер.
Model/provider/reasoning не меняются при смене аккаунта без отдельного решения.

## 10. Candidate, Judge, отчёт, хранение

Ошибка исходного сегмента видна сразу. Доступный incomplete candidate может
быть оценён Judge как исторический частичный результат. Если snapshot только
forensic, явно указать его consistency/missing evidence; не ждать бесконечно
готовности recovery capture для сообщения об ошибке.

После восстановления — новый candidate revision с parent linkage и новый
Judge, связанный с его hash. Старые candidate/Judge не переписываются. Для
legacy layout сохранять исходные файлы на месте; новые ревизии — в отдельных
каталогах, latest report является обновляемой проекцией, не evidence authority.
Отказ Judge восстанавливается отдельно, без повторения Subject и его checks.

Отчёт разделяет reliability и semantic outcome; показывает исходные failures,
recovery count, account/profile/environment changes, same-session/replacement,
активное время/ожидание и суммарный usage всех сегментов без двойного учёта
parent-inclusive counters. Recovered результат не маркируется uninterrupted.

Recoverable terminal runs защищены от обычного GC, включая нужные native stores,
bundles и pinned dependencies. Pending capture и живые процессы тоже защищены.
GC apply повторно проверяет lock/current recovery state, даже если старый план
удаления был составлен раньше. Явное снятие retention предупреждает о потере
восстановимости; никакой автоматической очистки исходных evidence при recovery.

## 11. Существующий AGY-прогон

`EVAL-20260906011607-5a04b1eb` — проверочный исторический кейс, не объект
автоматической миграции в ходе подготовки проекта. Сбой произошёл в CODE-REVIEW;
уже есть incomplete candidate/Judge, а forensic snapshot не restorable.

Для него отдельный legacy import: read-only inventory retained RUN/workspace,
проверка identity/operation lineage и process settlement, новый recovery capture
из сохранившегося состояния с фактической датой. Не заявлять snapshot на момент
исторического сбоя. Недоказанные IDs/child topology не принимать по одному
текстовому сообщению агента. При нехватке session evidence — честный replacement
либо blocker, без ручной SQL-правки статусов. Запускать после реализации,
квалификации и явного решения о восстановлении этого прогона.

## 12. Пакет реализации и порядок

| Этап | Изменения | Gate |
| --- | --- | --- |
| P1 | Общая failure/interruption модель, reducer, revisions/retention; без auto retry | Старые journals читаются; original outcomes неизменны |
| P2 | dd-flow RUN guard/generation, общий mutation guard и Work recovery binding; crash-safe intent/receipts | Все входы, async finish и late hook races покрыты |
| P3 | Recovery capture/verify/restore, Git index/partial merge, секреты/exclusions, fresh-target validation | Доказуемый round-trip прерванного RUN, не stage-entry shortcut |
| P4 | Runner inspect/recover, общий live/recovery action reducer, durable prompt delivery, DAG/children | Два recover и repeated failures не создают дублей |
| P5 | Шесть adapters, credential refresh, capability matrix, root/child prompt templates | Контрактные тесты каждого адаптера и короткие live smoke |
| P6 | Judge revisions, metrics, GC apply races, CLI/status/help/runbooks и канон | Сквозной interrupted → recovered → judged отчёт |
| P7 | Исторический AGY recovery и controlled E2E | Отдельный фактический отчёт; не условная отметка успеха |

P1 включает форму revisions/retention до любого продуктивного recovery; P6
доводит сквозную интеграцию. P2–P5 — единый совместимый контракт, не частичное
включение новых productive callers. Новый daemon/scheduler/БД не нужны:
расширяются существующие operation ledgers, runtime SQLite и managed processes.
Понадобятся миграция схемы/версия snapshot, шаблоны канона dd-memorybank,
согласованный выпуск CLI+адаптеров и pinned profile definitions.

Auto recovery после reset — отдельный последующий opt-in над тем же recover,
с ограничениями частоты/попыток и условиями остановки. В первый пакет не входит
автоматическая смена аккаунтов, provider/model fallback, checkpoint RAM или
универсальный rollback внешних действий.

## 13. Обязательные испытания

1. Квота/401/account/5xx/network на create, prompt, child, finish и Judge;
   первичная ошибка не теряется при вторичном cleanup/capture failure.
2. Потеря ответа до dispatch, после dispatch и после durable completion;
   ни одна productive operation не отправлена повторно вслепую.
3. Crash после каждого capture/recover шага: intent, guard, DB copy, files,
   manifest publication, ready event, binding, packet dispatch, ACK.
4. Work completed одновременно с T0; поздний completed после failed attempt;
   старый finish после нового generation. Один принятый результат, вся история.
5. Root умер, child/check жив; PID reuse; daemon socket потерян, PID жив;
   поздний запуск grandchild. Никакого ложного settlement.
6. Файл меняется при capture, flush не удался, partial file, DB/projection
   disagreement, отсутствие места. Только forensic/blocked, не fake ready.
7. Dirty Git: staged/unstaged/untracked/deleted/binary/executable/symlink,
   worktree, conflict index/partial MERGE. Round-trip сохраняет все заявленные
   свойства; неподдержанные submodules/LFS/external roots дают явный gap.
8. Work DAG: completed/created/running/HITL/failed mixed; dispatch без binding;
   selective child resume и replacement сохраняют launch policy и scope.
9. Check завершился после смерти клиента, completion marker отсутствует,
   external operation unknown. Нет повторного Finish и fake pass.
10. Account refresh в isolated home, session missing, cwd mismatch, definition
    drift, engine migration, repair среды без изменения кода и code drift.
11. Два контроллера, повтор одной recovery команды, второй сбой при recovery,
    cancellation во время восстановления: корректные locks/receipts/retention.
12. Неизменность старого Judge и candidate; новая оценка своего hash; отсутствие
    Judge feedback в prompts; usage across segments учитывается ровно один раз.
13. GC plan до recovery, apply во время recovery; секреты/symlinks/path traversal
    в archive/import; незнакомые schema fail closed.
14. Prompt fixtures для coordinator/same-session/replacement/read-only reviewer:
    корректный Work ID, exact commands, no broad rerun, raw provider text не
    становится инструкцией. Live smoke доказывает доставку/поведение отдельно.

Готовность: общая модель ошибок работает для шести упряжек; каждая заявленная
resume capability подтверждена. Неподдержанное восстановление явно объясняется.
Ни один успешный recovery не требует ручной правки SQLite, удаления журнала,
подделки Work результата или повторного запуска неизвестной внешней операции.
