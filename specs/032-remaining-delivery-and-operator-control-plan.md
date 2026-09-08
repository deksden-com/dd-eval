# 032 — Оставшаяся поставка и операторские pause / stop / resume

Дата: 2026-09-08. Статус: IN PROGRESS; полная готовность не объявляется.

Запрос: завершить оставшиеся системные доработки и обеспечить командную
остановку flow вместе с его агентами/сессиями с последующим возобновлением.
После согласования плана пользователь поручил полную реализацию, включая
назначение разных моделей разным этапам. Побочные продуктовые изменения
за пределами этого плана не входят в поставку.

### Текущая реализация (2026-09-08)

- R01/R02: eval commit `2b21424` отправлен в
  `fix/cross-harness-recovery-and-fallback`; полный eval suite — 261/261.
  Это доставка в topic branch, не интеграция в main и не новый CLI release.
- CLI implementation: `feature/operator-control-completion`, основана на
  `e1d723e` (beta.38). AGY hook-фильтр перенесён в bundled runtime;
  adapter regressions — 12/12. Исходный WIP integration checkout сохранён.
- R06 WIP: RUN сохраняет значения всех заявленных agent profiles; external
  Work и server MERGE используют frozen значения. Work override выбирает
  работника, не координатора. External launch проверяет RUN stage и recovery
  generation между подготовкой и productive dispatch.
- Продолжение RUN теперь проецирует требуемый профиль и session mode следующей
  стадии; same-session MERGE проверяется до старта. Это ещё не подключённый
  сквозной managed controller. Полный CLI suite продолжается; финальный gate
  нужно повторить для окончательного source/build tuple.
- Открыты: общий long-lived controller и eval cutover; физическое stage
  handoff; qualified native overrides и late-bound Work profiles;
  pause/stop/resume всего owned tree; non-Work ownership; baseline integration;
  совместимые releases и published-artifact E2E/control/recovery qualification.

Шесть adapters уже включены в CLI beta.38. R05 означает завершение переноса
controller и retirement eval copies, а не повторный перенос готовых adapters.

## 1. Место в существующих планах

Это актуальный порядок оставшихся работ, а не новый независимый runtime.
Выполненные исправления из 031 не реализуются повторно. Технические владельцы:

- [026](026-interrupted-eval-recovery.md): recovery, immutable inputs,
  interrupted segments, reconciliation и selective continuation.
- [029](029-cross-harness-defects-and-observable-fallback.md): fallback,
  control/terminal, baseline и изоляция проверок.
- [030 lifecycle](030-native-child-lifecycle-integrity.md): physical identity,
  native children, dispatch и settlement.
- [030 adoption](030-shared-runtime-adoption-and-mixed-execution.md): граница
  CLI/eval, mixed execution, роль Judge и общий контроллер.
- `dd-flow-cli:.memory-bank/plans/shared-harness-runtime-and-mixed-execution.md`:
  WP-00–11 и V-01–42; настоящий план уточняет, в частности, WP-06.
- `dd-memorybank:.memory-bank/spec/engineering/SPC-013-shared-harness-runtime-and-execution-policy.md`:
  канонический контракт. Изменения контракта синхронизируются там.

## 2. Исходный срез и незакрытые результаты

Срез предыдущего status-аудита, а не вечные сведения о ветках/версиях:

| Область | Что уже есть | Что остаётся |
| --- | --- | --- |
| Recovery | Durable evidence, frozen identity, protection от duplicate dispatch; два live восстановления с продвижением до CODE | Полный controlled recovery E2E до MERGE и Judge; матрица отказов/повторных прерываний |
| Cancel | `runner cancel`, ранний fence и owned-tree cancellation | Это terminal cancel, не recoverable operator pause/stop |
| Статус eval | Execution/report/Judge evidence доступны | После повторного failed recovery верхний status ошибочно остаётся `awaiting_provider` |
| Шесть упряжек | Native root/restart/cleanup evidence и контрактные проверки | Stop/resume всех owned children, selective capability и полный release-artifact acceptance |
| Droid | Native transport/hooks/Work binding и clean same-ID resume smoke | Full scored E2E; forced close не доказывает same-ID resumability; selective child control отдельно |
| AGY | Lifecycle/ownership исправления и наблюдаемая topology | Завершить текущий фильтр control notifications, regressions и доставку; unknown model/usage не объявлять observed |
| Shared runtime | План, canonical direction и context-envelope foundation | Перенос adapters/controller из eval, mixed execution, pause/stop и adoption |
| Интеграция | CLI beta.38 — наблюдавшийся artifact; части canon уже в main | Eval topic changes ещё не равны main; canon main не равен новому release tag; проверить baseline branch |
| Качество Subject | Normal cp-079 дошёл до MERGE/Judge; более поздний recovery-run дал неполный outcome | Разделить runtime acceptance и продуктовые findings; не заявлять успешный продукт по clean cleanup |

При подготовке этого файла `dd-eval` находился на
`fix/cross-harness-recovery-and-fallback`, HEAD `7e11914`; dirty:
`lib/dd-agy-daemon.mjs`, `test/agy-state-boundaries.test.mjs`, `test/dd-agy.test.mjs`.
Это не разрешение включить их в docs commit. Перед реализацией снять свежий
inventory всех четырёх repo, worktrees, upstream и staged/unstaged ownership.
Количество файлов и commits из старых отчётов не использовать вместо проверки.

### Доказанная ошибка верхнего статуса

`lib/runner.mjs:appendRunEventOnce` дедуплицирует событие по type/data за всю
историю. `finalizeFromResults` повторно получает одинаковый terminal payload
после нового recovery segment; новое completion событие отбрасывается как
старое. Recovery-start уже перевёл reducer в `awaiting_provider`.

Исправить ключ идемпотентности на идентичность актуального segment/generation
и принятой result revision. Не отключать дедупликацию глобально и не править
`state.json` вручную. Проверить всех callers, reducer, report/status/Judge
paths и reconciliation исторического журнала без переписывания evidence.

## 3. Операторский контракт

### 3.1 Семантика

| Действие | Поведение | Возобновление |
| --- | --- | --- |
| Pause | Сразу закрыть новый dispatch; попросить owned agents закончить текущую работу на безопасной границе и завершить turn | После доказанного quiescence; сохранить сессии, где это возможно |
| Stop | Сразу закрыть dispatch и инициировать native interrupt всего owned tree; при необходимости явно разрешённая эскалация | Тот же logical RUN/Work через reconciliation, native continuation либо разрешённый replacement |
| Resume | Снять операторскую остановку только после проверки ownership, settlement и recovery readiness | Не новый эксперимент, не повтор completed Work, не обход HITL |
| Cancel | Существующая окончательная отмена | Resume не воскрешает cancelled RUN |

Pause по умолчанию кооперативная: timeout оставляет честный pending и список
неостановленных nodes. Автоматическая эскалация разрешена лишь явно выбранной
политикой. Stop означает recoverable interruption, но не обещает сохранение
RAM, native history или отмену уже отправленного внешнего действия.

### 3.2 CLI surface — проектируемая, ещё не доступная

Предлагаемое семейство, окончательно закрепляемое в shared WP-01:

```text
dd-flow run control pause  --run <RUN> [--grace-ms <n>] [--escalate interrupt]
dd-flow run control stop   --run <RUN> [--force]
dd-flow run control resume --run <RUN> [--from <control-id>]
dd-flow run control status --run <RUN> --json

dd-eval runner control pause|stop|resume|status --eval <path> [--execution <id>]
```

Это один controller/API, eval — scope resolver и experiment bookkeeping.
Существующий `runner resume` сохраняет reconciliation-семантику;
`runner recover --from <interruption-id>` сохраняет аварийное восстановление.
Общая внутренняя resume/recovery логика не дублируется. Короткие aliases
добавлять только после проверки конфликтов help/CLI и единого routing.

Для мутаций предусмотреть idempotency request ID, bounded wait и JSON receipt.
Receipt содержит request/control ID, scope, generation, requested/applied mode,
per-node status, unsettled reasons и resumability. Timeout возвращает operation
handle и pending, не ложный успех; повтор команды наблюдает ту же операцию.
Численные deadlines/exit codes закрепить в WP-01 и проверить CLI tests.

### 3.3 Scope «все сессии»

Flow command охватывает root, native children всех уровней, external worker
roots, active checks и зарегистрированные mutating subprocesses выбранного
RUN, включая детей, обнаруженных во время drain. Не все сессии аккаунта/хоста.

Eval command с execution ID охватывает только этот execution. Без него —
все исполнения выбранного EVAL, принадлежащие ему Judges/probes и admission
новых repetitions/assessment. Каждый ресурс сохраняет свой owner/role;
Judge не получает Subject Work binding. Status показывает resolved scope.
Чужие процессы, shared services и unrelated browser tabs не останавливать.
Для ресурсов, которыми нельзя безопасно управлять, указывать pending/unknown.

## 4. Протокол физической остановки

1. Сохранить durable control intent и закрыть admission в общем ownership/
   generation arbiter до profile probes, сетевого наблюдения и agent message.
2. Снять inventory из authoritative bindings и native topology; учесть late
   launch и незавершённые durable operations. RAM dispatch fence переиспользовать
   как дополнительную защиту, не выдавать его за crash-safe storage barrier.
3. При pause доставить steer/control notification или trusted safe-point request
   всем адресуемым исполнителям. Упряжка без steer не получает выдуманный ACK:
   использовать подтверждённый hook/turn-boundary путь либо pending.
4. Agent ACK означает только получение/готовность. После ACK агент завершает
   turn, не ждёт resume в sleep loop и не начинает новую Work.
5. При stop использовать native interrupt/cancel operation. Если parent command
   доказанно останавливает subtree, не дублировать native вызовы каждому child,
   но settlement доказать для каждого node.
6. `--force` допускает native close и затем termination точно принадлежащего
   runtime process tree при поддержке платформы. Проверить PID/start identity,
   owner и scope. Нельзя `killall`, stop всех homes или SIGSTOP как основу pause.
   Локальный kill не доказывает прекращение удалённого provider job.
7. Подтвердить idle/stopped и отсутствие mutating checks по всем owned nodes.
   Живой idle daemon допустим для pause при доказанном dispatch barrier.
   Неизвестный remote side effect остаётся отдельно unresolved.
8. Сохранить stop receipt и recovery evidence существующим capture механизмом.
   Capture после quiescence либо с явными consistency limitations; ошибка capture
   не мешает emergency stop, но блокирует недоказуемое resume.

Control plane остаётся доступным при provider quota/auth/network failure,
malformed observe и недоступном profile. Ошибка одного node не отменяет попытки
остановить остальные. Не запускать provider session ради stop/status.

## 5. Состояния, гонки и возобновление

Расширение существующей control projection, не новая независимая БД:

```text
running -> pause_requested -> paused -> resuming -> running
running/pause_requested/paused -> stop_requested -> stopped -> resuming
```

`paused/stopped` — не terminal outcome Work. Пока settlement неизвестен,
сохраняется requested с per-node pending. Сбой resume оставляет fence и
понятный interrupted/control state; не теряет предыдущий receipt.

- Повтор request идемпотентен; concurrent pause/stop/resume используют один arbiter.
  Stop может усилить pause; старый resume не отменяет новый stop.
- Resume до settlement запрещён. Terminal cancel/fatal не воскрешается;
  при complete-first вернуть terminal/no-op. Late evidence допускается без
  изменения уже принятого candidate/outcome старой generation.
- Во время drain доступны status, usage, ACK и допустимый finish уже начатой
  Work. Следующая Work/стадия/MERGE не dispatch. Проверить guards после await
  и непосредственно перед native productive call во всех entrypoints.
- HITL остаётся отдельным: ответ можно сохранить, но не применить как повод
  продолжать paused RUN. Operator resume не отвечает на HITL и не снимает blocker.
- Paused time исключается из productive liveness/time budget; drain имеет
  собственный deadline. Usage остановки учитывается, не исчезает из отчёта.
- Crash после native interrupt до persist и после persist до отправки сообщения
  восстанавливается по durable intent/receipt. Lease expiry не разрешает
  takeover без проверки старого owner. Выход CLI-клиента не отменяет request.

Resume сначала reconciles dispatch/finish/check/MERGE receipts, затем выбирает
только незавершённые Work по DAG. Same-session — лишь при доказанной capability.
После forced close replacement должен быть явно разрешён policy и отражён новой
physical identity/segment, сохраняя logical RUN/Work, исходный packet и hashes.
Если policy отсутствует, вернуть `recovery_required`, не начать replay молча.
Completed Work переиспользуется; parent не respawn уже продолженного child.

Потеря ответа после внешней мутации — unknown outcome: сначала reconcile,
никакого blind retry. Hard stop во время git/check/DB операции не обещает
rollback. До productive resume проверить repository/locks/transactions и
сохранить uncertain operations. Credential refresh не подменяет frozen model,
engine, input или account policy. Секреты не входят в capture/prompt.

## 6. Очерёдность оставшихся пакетов

| Пакет | Содержание и владелец | Зависимость / критерий выхода |
| --- | --- | --- |
| R00 | Inventory четырёх repo, evidence ledger, ownership текущего WIP | Зафиксированы реальные SHA/artifacts и открытые gates, без массового reset/add |
| R01 | Eval: исправить generation-aware terminal projection | Регрессия failure → recover → тот же failure дважды; status/report/journal согласованы, Judge не дублируется |
| R02 | Eval/AGY: завершить control-notification фильтр и sibling-path аудит | Не теряются legitimate child messages/results; focused и полный suite, scoped commit/push |
| R03 | Текущий recovery: закрыть незавершённые 026/029/030 lifecycle regressions | Unknown outcome/no replay, repeat recovery, preserved Work/inputs; live gaps явно перечислены |
| R04 | Shared WP-00/01: зафиксировать API, capabilities, migration/retirement map | Утверждён один control arbiter, storage и CLI; согласованные canon/eval contracts |
| R05 | Shared WP-02/03: перенести шесть adapters и managed controller/MERGE в CLI | CLI package запускает flow без eval checkout; старые пути имеют removal gate |
| R06 | Shared WP-04/05: mixed strategy, profiles, context, ownership, usage | Default/native и explicit external не смешаны; model/usage unknown честно отражены |
| R07 | Shared WP-06: реализовать §§3–5 pause/stop/resume | Durable admission, cooperative и force paths, all-owned settlement и safe resume |
| R08 | Shared WP-07/08: canon, eval adoption, schemas/migration, docs/help | Нет второго productive drive loop; historical artifacts читаются, immutable inputs не изменены |
| R09 | dd-tasks baseline: завершить ранее scoped test-world/keyboard qualification | Изоляция двух invocation/checkout; source branch интегрирована по policy; новый baseline при необходимости |
| R10 | Интеграция, candidate tests и согласованные releases | WP-09/10, проверенные remote main SHA, tags, registry artifacts и compatibility tuple |
| R11 | Published-artifact qualification и delivery evidence | WP-11: full default/mixed/recovery/control E2E, readback, curated manifest и итоговые verdicts |

Основная цепочка: R00 → R01/R02/R03 → R04 → R05 → R06 → R07 → R08 → R10 → R11.
R09 идёт отдельным scoped пакетом и блокирует зависящие от baseline acceptance.
Документы/contract tests для R07 допустимо готовить после R04; production control
не дублировать временно внутри eval. При необходимости срочного R01/R02 release
выпустить узкий corrective tuple, явно не объявляя shared/control delivery готовым.

R03 проверяет готовые foundations до переноса; R11 повторяет критичные проверки
после cutover на published artifact. Это разные gates, не двойная реализация.

## 7. Проверки и честная capability matrix

Для Codex, ZCode, Grok, OpenCode, AGY, Droid завести evidence-строку с exact
version/digest/OS/config и verdict по каждой capability: steer, safe-point ACK,
root interrupt, full tree stop, external root stop, selective child stop,
same-ID resume после cooperative pause, resume после interrupt, forced-close
replacement, restart reconciliation, model identity и usage coverage.

PASS только с соответствующим evidence. `unsupported`, `unknown`, `blocked`
не взаимозаменяемы; отсутствие auth/quota не доказывает unsupported.
Root smoke не доказывает selective child resume; Droid clean-close same-ID
smoke не доказывает forced-close resume. Provider ограничения объяснить вместе
с безопасным доступным маршрутом, не имитировать capability prompt-ом.

Обязательные сценарии сверх existing V-01–42 и H-T matrix:

| ID | Сценарий | Проверяемый результат |
| --- | --- | --- |
| C01 | Pause: root + native grandchild + external Work + active check | Нет нового dispatch; ACK отдельно; paused только после полного safe point |
| C02 | Unresponsive/steer-unsupported child | Bounded pending; explicit stop/escalation; не ложный paused |
| C03 | Stop/force при quota, auth, socket timeout, malformed inspect | Fence сохраняется; остальные nodes остановлены; unknown remote job виден |
| C04 | Pause/stop против launch, late hook, Work finish и MERGE | Нет duplicate worker/следующего writer; допустимый результат сохранён |
| C05 | Два CLI-клиента: duplicate request и stop против resume | Один owner, request replay безопасен; stale generation не запускает turn |
| C06 | Crash на каждом intent/send/ACK/settlement/capture шаге | Reconcile без нового дерева и без потери stop intent |
| C07 | Same-session и replacement-only resume; второе прерывание | Logical Work/input сохранены, completed не повторены, lineage полная |
| C08 | Pause поверх HITL; ответ во время pause; pause при MERGE | Нет повторного ответа/снятия blocker; git state проверен до resume |
| C09 | Eval-wide stop с Judge/probe и второй соседний EVAL | Все выбранные роли остановлены, сосед не затронут, role isolation сохранена |
| C10 | Одинаковый terminal payload после двух recoveries | Новый segment финализирован; status/report согласованы; один Judge на принятую revision |
| C11 | Stop unknown-side-effect tool call; потерянный ACK | Нет автоматического replay; resume blocked до reconciliation/явного решения |
| C12 | Fresh published CLI install без eval sources, CLI client exit | Обычный flow и control работают; controller остаётся владельцем |

Сначала deterministic adapter tests и настоящие двухпроцессные race tests,
затем bounded live smoke и full E2E. Не исчерпывать реальные квоты и не усыплять
хост: quota/network/sleep boundaries инъектировать безопасно. Native live
подтверждение не заменять mocks. Полные repo gates — по 031 и project policy.

R11 включает: normal до MERGE/Judge; controlled interruption с selective
recovery до MERGE/Judge; cooperative pause/resume; forced stop/recovery; repeated
interruption; default и mixed из одного semantic entry pack. Результаты runtime
и качества Subject публикуются отдельно. Findings по архивному UI, atomic guard,
feature evidence и PLAN handoff из прежнего Judge не закрываются control tests;
продуктовое исправление требует отдельного scoped решения, если не входит в R09.

## 8. Доставка и Definition of Done

Порядок coupled release сохраняется из 031: final canon source commit → strict
CLI candidate build с exact canon SHA → candidate gates → publish/readback CLI →
compatible canon tag/release → eval integration/adoption → fresh installed
artifact и новый immutable checkpoint → qualification/evidence.

Не менять существующие immutable runs/tags и не пересобирать ту же version с
другим digest. Не продвигать beta в latest/stable автоматически. Private eval
поставляется проверенным pushed main revision; искусственный npm release не нужен.
Миграция общей DB требует writer compatibility/drain и корректного backup с WAL;
старый pinned engine сам по себе не разрешает запись в новую schema.

Для каждого R-пакета вести: owner repo, source/integration SHA, tests/evidence,
remote delivery, открытый blocker. Общий delivery manifest связывает CLI/canon/
eval/baseline/harness identities, registry integrity, installed readback,
checkpoint, E2E/control/recovery IDs и capability verdicts. Не требуется новый
dashboard или параллельная система учёта: достаточно существующего ledger.

- [ ] Верхний status корректен после повторных recovery; текущий WIP доставлен.
- [ ] Все заявленные control команды работают из обычной установки CLI и eval.
- [ ] Stop охватывает всё owned дерево; partial/unknown никогда не показывается success.
- [ ] Pause и hard stop имеют проверенные маршруты resume без duplicate Work.
- [ ] Общий runtime действительно в CLI, eval не содержит второй controller.
- [ ] Mixed/default, model/usage provenance, role isolation и migration gates пройдены.
- [ ] Controlled recovery и operator-control E2E имеют published-artifact evidence.
- [ ] Нужные commits/push/main integration/releases/readback завершены.
- [ ] Исторические результаты сохранены; runtime и product-quality verdicts разделены.
- [ ] Ограничения каждой упряжки и реальные blockers перечислены в итоговом отчёте.

До выполнения этих пунктов статус всего пакета — partial, даже при зелёных
unit tests, опубликованной beta или одном успешном normal E2E.
