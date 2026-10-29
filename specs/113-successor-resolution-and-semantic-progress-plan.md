# 113 — Единое продолжение lifecycle и содержательный прогресс контроллера

Статус: реализован 2026-10-29; адресная приёмка завершена.
Результат: [implementation receipt](113-implementation-completion.md).
Проверен по ponytail full и независимым аудитам authority, progress, tests;
выводы перепроверены по исходному коду. Новые EVAL не запускаются.

## Цель и границы

После принятого repair и успешных checks контроллер должен выполнить уже
выданное продолжение, а не получить старый отказ и завершить RUN из-за
неизменившегося Work-графа. Исправляем engine/tooling, не продукт dd-tasks.
Общий механизм должен одинаково работать у Codex/Luna, ZCode, AGY, OpenCode,
Grok и Droid; новый отдельный обработчик для каждой упряжки не нужен.

Не меняем provider retries, capacity, таймауты, канонические ответы Judge,
продуктовые требования и критерии приёмки. Не повторяем checks, чьи результаты
уже действуют. Исторический CP263 остаётся failed; его артефакты неизменны.
Новые EVAL и native/model-пробы в рамках реализации этого плана не запускать.

## 1. Доказанный инцидент и источники

CP263: `EVAL-20261029062459-fc41adef`, engine beta.158,
source `d0da77c661fa63daf690214f177105c0c0892262`, artifact SHA-256
`670aef37797faf30eca40710462eec464f3194c3ba3deeecea8463364784e62f`.
Артефакты: `~/.dd-eval/qualification/cp263-luna-full/runs/`
`EVAL-20261029062459-fc41adef`; DB внутри `executions/e2e/dd-flow-home/db.sqlite`.

Цепочка событий UTC:

- 07:35:47 PLAN-REVIEW принят; 07:36:03 начат CODE.
- 08:21:39 aggregate quality отказал, RCP-010; зарегистрирован WRK-013.
- 08:26:11 repair принят. К 08:28:05 все семь aggregate checks PASS.
- 08:28:06 retry finish вернул штатный `verification_required` и следующий finish.
- 08:29:29 Luna записала verification `passed`, unresolved=[];
  08:29:33 вызвала выданный finish.
- 08:29:35 hook связал новый вызов со старым отказом RCP-010/WRK-013;
  08:29:57 controller завершился `fanout_stage_nonprogressing`.

Lifecycle: A=`a47a2943-b99d-4596-83d7-4a2c1242c39e`, bare finish,
settled/error → B=`98e8c817-3439-4be2-84dd-fc1ee606e0e0`, finish
с retry-check, settled/verification_required →
C=`07360be4-bf32-478d-8d99-0e1c6a5d1167`, bare finish, issued.
A и C имеют одинаковую публичную форму команды; это не цикл ID.

Read-only воспроизведение на опубликованном engine и исходной DB:
CLI lookup для свежего native call выбирает C, native observation возвращает
A/settled_read. Запись DB, исполнение lifecycle и вызовы модели были запрещены.
Четыре CODE Work приняты; доказательств outage, quota или unknown child нет.

## 2. Подтверждённые дефекты и аналогичные места

### D1. Два алгоритма выбора одной authority

`dd-flow-cli/src/services/lifecycle-invocations.ts:1455–1468` — historical
shortcut смотрит только непосредственный successor и только issued/observed.
У A непосредственный B уже settled, поэтому живой C через B игнорируется.
`lifecycleCandidates` (:1715) и CLI lookup выбирают иначе.

Аудит выявил дополнительные расхождения этого shortcut:

- обходит проверку изменения executionCwd у того же native call, которая
  присутствует в основном пути (:1537);
- учитывает inline invocation-id, но не `input.id`;
- CLI chain walker читает raw successor ID со scope/cycle guards, но не
  проверяет весь контракт связи, который уже проверяет `committedSuccessor`
  (:705): advertised command, fingerprint и допустимость successor.

Последние пункты — подтверждённые расхождения кода, не доказанные отдельные
инциденты или эксплуатация. Их исправляем в том же общем resolver.

### D2. Work-граф ошибочно равен всему прогрессу

`controller-fanout.ts:105` включает только stage/parent/state/graph,
даже action отсутствует. `vnext-fanout.ts:297` строит graph revision из
work_id/status/dependencies. Checks → verification_required → verification
→ finish закономерно не меняют Work-граф. `run-controller.ts:1321–1324`
и `run-controller-state.ts:105` объявляют такой переход nonprogress.

Аналогичная общая ветка memory review (:201/:209) не различает corrections
checks/register и collection, correction wave. Отдельный инцидент там не
доказан: регистрация selective reviewers обычно меняет граф. Модель checkpoint
всё равно должна учитывать реальную фазу, не случайную мутацию графа.

### D3. Историческая repair-квитанция подменяет текущую disposition

`repair-receipt.ts:5` корректно доказывает durable-регистрацию repair, но
`continuation-outcome.ts:20` использует её для подавления отказа текущего turn
даже после завершения repair. Итоговая причина теряется за generic nonprogress.
Аналогичные исключения — `currentLifecycleFailure` (:1899/:1936).
Дополнительно его fallback (:1908+) группирует историю по fingerprint:
успешный retry с другими аргументами не является успехом старой группы.
Это некорректная модель применимости ошибки, даже если repair suppression
случайно скрывает её в данном инциденте.
Третий consumer — `assertLifecycleOutcomes` (:379–408): SQL выбирает последнюю
попытку по fingerprint, а hook-history обрабатывается отдельно. Его нельзя
оставить с прежним определением «актуальная ошибка», исправив только два
controller readers. В частности, наличие более новой issued строки само по
себе не доказывает устранение предыдущего отказа.

### D4. Отсутствует составная регрессия

`test/lifecycle-invocations.test.ts:1644` проверяет one-hop successor с admission,
:1687 — изменение fingerprint A→B. Нет A→B→C с возвращением исходной формы,
ненулевым admission_json и согласованием CLI/native/controller.
Тест одинаковой строки `run-controller.test.ts:120` не проверяет семантический
прогресс без изменения графа. Нужна композиция существующих fixtures.

## 3. Принятые решения: один resolver, без нового инфраструктурного слоя

### P1. Общий выбор и replay

1. Удалить самостоятельный алгоритм historical shortcut. Вынести общий
   read-only SQL selector и вызывать его из CLI/native paths. Быстрый возврат
   уже admitted/settled результата допустим только после этого selector и
   единых identity/route проверок; сохранить лёгкий hook ingress.
2. `input.id` и inline ID равноправны, при наличии обоих обязаны совпадать.
   Все известные ссылки — ID, hook-event-id/correlation.eventKey, сохранённая
   native identity — должны согласоваться. Известный ID=A при tool call,
   уже связанном с B, означает локальный no_effect конфликт, а не приоритет A
   и не перепривязку B. Точная native delivery сохраняет своё назначение.
   Сохранить existing compatibility для неизвестного/mistyped UUID: только
   unique exact operation/target внутри trusted root, без fuzzy matching.
   Известный foreign ID не считается typo и не заменяется локальным.
3. Свежий call без явного ID выбирает единственное подходящее текущее
   продолжение. Для исторических кандидатов пройти уже сохранённые связи
   через общий контракт `committedSuccessor`, с visited IDs, а не по времени
   создания, совпадению UUID-текста или глобальному latest row.
4. Нельзя терять промежуточный B только потому, что его fingerprint отличается
   от публичного A/C: command matching применяется к целевому действию,
   а история переходов загружается в точном scope.
5. Сохранить root/project/run/generation/attempt, physical route и cwd fences.
   Тот же native call с другим cwd не превращается в новый replay.
6. issued допускает admission и последующий execution claim. observed —
   ещё не claim: сохранить существующую замену pre-tool receipt новым call,
   только пока CLI не начал эффект (например, shell отверг первый call).
   Не смешивать такую замену с exact replay того же call с изменённым cwd.
   executing — наблюдение исходного эффекта, не новый executor; settled —
   чтение результата. Unknown outcome не означает permission to retry.
7. Не mint authority при чтении. Отсутствующая/истёкшая связь, цикл,
   несовместимая команда или несколько текущих authority не разрешают
   guessed execution: вернуть существующую scoped reconciliation/ambiguity.
   Не блокировать независимые Work или весь RUN только из-за этого чтения.
8. Исторический явный replay A остаётся A, но маркируется историческим и не
   становится доказательством нового отказа/нового эффекта текущего шага.
9. Deadline проверять с учётом статуса: expired issued не исполняется;
   истечение времени не превращает observed/executing в безопасный повтор
   и не запрещает read-only settled replay. Старую generation нельзя сделать
   текущей ради replay; разрешённое чтение истории не даёт mutation authority.
10. Selection не равен claim. Сохранить existing observation transaction,
    observed→executing CAS и атомарную settlement+successor transaction.
    Перепроверять candidate/scope/owner/status/deadline на соответствующей
    границе, после конкурентного изменения перечитывать committed state,
    не выполнять команду по устаревшему initial snapshot.

Не направлять лёгкое чтение результата через `managedNativeOwner` (:1180):
он читает daemon state с диска и обходит sessions. Общий selector работает
по сохранённым SQL assignments/receipts; уже подготовленный trusted контекст
передаётся явно. Discovery для CLI/adapter preparation остаётся вне лёгкого
replay и SQL transaction. Не переносить туда загрузку verification, checks,
сканирование root directories или process probes. Проверка — запрет таких
вызовов в тесте, не новый жёсткий wall-clock timeout.
Уточнение границы реализации: SQL-only обязателен для общего выбора и лёгкого
чтения already-admitted/settled результата. Существующий ownership preparation
перед первым admission issued команды не переписывается в рамках этого плана;
его нельзя случайно добавить в прежний лёгкий replay удалением shortcut.

Не переписывать исправные `currentStageFinishAuthority` и
`lifecycleRetryCommands`: первый уже выбирает unique current без issue-on-read,
второй находит C по записи B; отдельный транзитивный алгоритм ему не нужен.
`managedLifecycleCommand` готовит команды, не выбирает native authority;
доказанного основания менять его latest scoped lookup нет.

### P2. Содержательный checkpoint, не UUID и не весь репозиторий

Для materialize/dispatch оставить graph checkpoint, добавив action.
Для semantic_completion дополнить его:

- логической фазой: обычный finish / проверка verification / завершение repair;
  для memory — correction wave + checks/register или collect;
- разрешённой операцией и её семантическими аргументами;
- последним committed semantic outcome и относящимся к нему доказательством:
  применимый check/verification outcome либо repair disposition.

Источник checkpoint — только committed данные текущих project/run/generation/
stage/attempt, не глобальная последняя строка и не текст ответа модели.
Для checks брать уже сохранённые input_hash/status и применимость receipts;
для verification — typed outcome последнего finish, для memory — существующие
registration/collection records. Текст summary, порядок JSON keys, transport
IDs и факт переиздания той же квитанции не считаются прогрессом. Не создавать
новый consumed-input hash там, где исходное действие его не записывало:
неизвестный input не доказывает ни изменение, ни неизменность документа.

Нормализовать volatile invocation/hook/transport UUID и timestamp. UUID новой
authority сам по себе не прогресс. Использовать уже имеющиеся operation parser,
rejection signature/input key и scoped receipts; не вводить новый hash framework,
таблицу прогресса, background observer или schema migration.
Не читать произвольные файлы и не hash весь RUN/репозиторий.

При duplicate checkpoint сначала read-only reconciliation текущего действия:
если обнаружен доказанный semantic переход, сохранить новый checkpoint и
продолжить уже выданной командой. Если состояние действительно неизменно —
существующий guard не должен бесконечно снова отправлять тот же prompt.
Сохранить причину и приостановить затронутую technical dependency существующим
pause-механизмом; не объявлять принятые Work неуспешными и не делать generic
фатальный nonprogress, когда результат уже сдан. Автоматически не перезапускать
unknown/executing действие и не создавать repair только ради движения графа.
Нет дополнительного цикла модельного «продолжай» для reconciliation.

Для pause использовать существующий `pauseDependency` в `run-controller.ts:586`
с protected action `productive_continuation`, а не новый статус RUN.
Диагностика содержит stage/attempt, logical checkpoint, текущую authority,
последний outcome и требуемое действие. Техническая пауза не равна PASS;
завершение этапа по-прежнему доказывается обычным stage finish.
Состояние `last_continuation` остаётся строкой существующего controller state.
При resume старый graph-only token не считается доказательством нового шага:
сначала прочитать текущие scoped receipts и пересчитать checkpoint. Первая
смена формата не разрешает re-dispatch observed/executing команды и не
обнуляет evidence ранее выявленного повторного no-effect отказа.

`stage_entry_nonprogressing` (:954) оставить: повтор одного start_stage без
старта действительно не прогресс; ложное срабатывание там не установлено.
Не менять его отдельные полномочия и входы механически вместе с CODE finish.

### P3. Применимость ошибки отдельно от исторической регистрации

Сохранить `isRegisteredRepair` как read-only durable membership predicate.
В текущем continuation/failure selection различать:

- repair готов/выполняется — существующий dispatch/wait;
- repair принят, выдан следующий finish — продолжить им;
- successor успешно settled — предшествующий отказ исправлен в этой цепочке,
  даже при изменении fingerprint, только в пределах доказанного результата;
  история сохраняется. `ok:true/outcome:verification_required` закрывает
  прежний gate failure при PASS receipts, но оставляет verification obligation.
  `ok:true/outcome:blocked` не доказывает устранение blocker и не завершает Stage;
- repair принят, но следующая authority отсутствует/неоднозначна — scoped
  reconciliation/pause с конкретными ID/статусами, не новая repair Work;
- новый актуальный отказ — передать его полный структурный диагноз;
- merely issued successor не стирает неустранённый отказ; unrelated success,
  другая stage/attempt/turn/generation не оправдывают текущий отказ.

Применить одну семантику к `assertNoCorrelatedRejection`,
`currentLifecycleFailure`, `assertLifecycleOutcomes` и связанным lifecycle-outcome consumers. Не добавлять
классификацию прозы/regex/provider decision. Сообщение должно различать старый
RCP-010 и реальное текущее действие; generic wrapper не подменяет первопричину.
Не объединять несвязанные цепочки по одинаковой форме команды; descendants
не снимают чужие failures. Если terminal successor уже завершил Stage,
контроллер сначала читает актуальное состояние этапа и идёт дальше, не ищет
новую finish authority и не пытается снова исполнить C.

В pause diagnostic сохранить названные поля явно: нынешний `pauseDependency`
копирует лишь часть error.details. Адресно расширить его diagnostic payload
для этого случая (либо передать ограниченный структурный diagnostic_reference),
иначе checkpoint/authority/outcome потеряются, несмотря на обещание выше.
Не сериализовать всю DB/полные prompts; сохранять только scoped IDs, статусы,
logical checkpoint и ссылки на исходные receipts. Сбой публикации pause —
существующая control error с сохранением primary cause, не ложный PASS.

## 4. Порядок реализации и адресная приёмка

1. Добавить failing A→B→C regression в существующую lifecycle fixture.
2. Исправить общий selector/replay и проверить native/CLI согласованность.
3. Добавить semantic checkpoint и текущую repair/failure applicability.
4. Составить offline CODE flow: gate FAIL → принятый repair → checks PASS →
   verification_required → verification passed → finish → CODE-REVIEW.
   Использовать существующий stub adapter/DB fixture, не реальную модель.
5. Проверить direct callers и hook cold path; обновить только затронутые
   operational contracts/docs, если изменилась выдача диагностики.

Обязательные компактные регрессии, переиспользуя существующие fixtures:

- A/B имеют admission_json; свежий bare call выбирает C; CLI/native/current
  authority согласованы. Точный native replay, event replay и explicit ID
  сохраняют A/B. Duplicate delivery не исполняет операцию второй раз.
- C issued/observed/executing/settled; нет повторного исполнения неизвестного
  или текущего эффекта. Смена fingerprint в B не рвёт цепочку.
- Конфликт input.id/inline ID, изменённый cwd того же call, foreign scope,
  generation/attempt, missing/expired link, cycle, incompatible command,
  competing authorities — ни один не разрешает чужое действие.
- ID противоречит event/native binding; unknown typo восстанавливается только
  через exact unique trusted target, known foreign ID не восстанавливается.
  Observed-unclaimed receipt можно заменить; executing — нельзя. Один
  deterministic interleaving test проверяет concurrent admission/settlement
  и ровно один execution claim, без нового concurrency framework.
- Неизменный graph с verification transition проходит; новый UUID без
  содержательного изменения не снимает guard. Memory phase/wave различимы;
  повтор той же фазы ограничен. Stage-entry guard сохранён. Resume/restart
  со старым graph token и незавершённым native вызовом не повторяет эффект.
- Completed repair остаётся исторически зарегистрированным, но не маскирует
  новый актуальный отказ; успешный linked retry снимает старую актуальность;
  merely issued/unrelated successor не стирает её. Промежуточный ok/blocked
  не считается Stage PASS; settled terminal successor не исполняется снова.
- Лёгкий replay не вызывает FS/process discovery; diagnostic pause сохраняет
  primary cause, checkpoint и authority, отображается как pause, не как успех.
- По итогам composition нет новой repair, повторных aggregate checks или
  provider calls; CODE действительно принят, следующий этап доступен.

Исполнять только затронутые контракты `lifecycle-invocations`,
`controller-fanout`/`run-controller`, `repair-continuation`, существующий
stage-lifecycle composition и hook cold-path для изменённого import closure.
Малые route smoke нужны лишь при изменении перевода hook payload; шесть живых
провайдеров не заменяют тест общего resolver. Использовать действующий scoped
selector и пригодные unaffected receipts. Не запускать blanket controller-shared,
полный gate, GitHub CI, capacity/matrix/Judge qualification или EVAL preparation.
Если selector расширяет набор, проверить непосредственные зависимости и
исправить выбор адресно, а не молча помечать непройденные тесты PASS.

## 5. Полнота аудита, границы уверенности и готовность

Проверены оба вызова `lifecycleCandidates`, early native path, readers current
finish/retry/failure, recovery binding, continuation rejection, оба вызова
`retainControllerContinuation`, fanout semantic/memory branches, графовая
revision, shared hook routes и связанные тесты. В `dd-eval/lib` дубля этого
resolver/nonprogress механизма не найдено. Это аудит класса дефектов, не
утверждение отсутствия любых ошибок во всём проекте. Изменения bridge/canon/
dd-eval runtime пока не обоснованы: начать с общего engine, расширять scope
только при конкретном доказательстве и зафиксировать причину.
Дополнительно проверены `dd-eval/lib/managed-flow-client.mjs` и
`runner-health.mjs`: существующая привязанная technical dependency уже
наблюдается как waiting/pause. Сохранить `dd-flow/controller-dependency@1`,
control/request/generation binding и отсутствие ложного controller.error;
новый EVAL status или слой управления ради этого исправления не нужен.

Ponytail: удаляем второй алгоритм, используем существующие successor связи,
receipts и техническую паузу. Никаких новых зависимостей, recovery framework,
глобальных проверок неизменности или индивидуальных обходов для упряжек.
Оставшиеся проверки защищают конкретное admission/dispatch, не весь флоу.

Готовность: решения о replay, свежем вызове, ambiguous/unknown, semantic
progress, stale errors, bounded nonprogress и scoped tests приняты выше.
Критерий завершения реализации — адресная приёмка зелёная, составной CP263
сценарий доходит до CODE-REVIEW, historical replay не меняет состояние,
завершённые Work/checks не повторяются, реальный no-progress ограничен.
Публикация engine и живой E2E — отдельная последующая задача, не часть плана.

### Итог readiness-ревью

Закрыты пробелы первоначальной редакции: конфликт ID/event/identity,
совместимость unknown UUID, observed-before-claim, expiry по статусу,
конкурентное изменение authority, риск тяжёлого discovery после удаления
shortcut, intermediate success против terminal acceptance, третий consumer
ошибок `assertLifecycleOutcomes` и потеря деталей в pause projection.
Отдельный read-only аудит повторно проверил уточнения P1–P3; существенных
непринятых решений не осталось. Это готовность плана, не PASS реализации:
тесты и новые запуски при данном ревью не выполнялись.
