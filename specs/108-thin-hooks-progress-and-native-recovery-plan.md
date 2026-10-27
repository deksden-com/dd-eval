# 108 — Тонкие hooks, полезный прогресс и восстановление исходной операции

> Продолжение реализации в `fix/plan108-thin-hooks`: поздний Grok child
> связывается с оригинальным prompt только при точном native `parent_prompt_id`
> и attempt; ZCode candidate bridge связывает ACP request с native turn по
> переданному и возвращённому `inputId`, а не по очередности событий. Отказ
> сохраняется по исходному accepted request даже после исчерпания hook budget;
> поздний отказ не должен отклонять новый prompt. OpenCode after использует
> сохранённый before binding, Droid сохраняет подтверждённый native creator.
> Проверки этих путей пока офлайн и не являются выпуском или E2E-приёмкой.
>
> Остаточная граница: native creator первого неизвестного child в AGY/OpenCode,
> а также все отсутствующие/неподтверждённые source-связи не заменяются текущим
> prompt. Такой OpenCode/AGY callback помечается `native_creator: unconfirmed`;
> его отказ остаётся отказом инструмента, не primary error чужой операции.
> Для них остаётся прежний проверяемый путь; быстрый ACK не является разрешением
> на Work без существующего CLI CAS. AGY Stop без source identity — наблюдение,
> не доказательство завершения текущего дерева. Изменение AGY inspection policy
> меняет fingerprint прежнего P3 evidence: перенос или повторное подтверждение
> требуют отдельного честного provenance, без подмены старой квитанции. Новый
> ZCode bridge и установленная версия native также не объявляются
> квалифицированными только по синтетическим тестам.
> Следовательно, план пока нельзя считать полностью закрытым: AGY/OpenCode и
> Droid ещё не имеют доказанного лёгкого bootstrap первого неизвестного child;
> их compatibility path может по-прежнему выполнять тяжёлый handler. Потеря и
> локальной записи failure, и IPC до владельца также не даёт гарантированной
> доставки; остаётся исходная ошибка в native callback/stderr, не выдуманное
> подтверждение записи.
> Read-only сверка сохранённых AGY-журналов: в CP256 у 71 `PreToolUse`
> из child в двух сессиях нет `step_update` с совпадающими conversation и
> step; у 41 root-вызова совпадение есть. В CP257 совпадение есть у четырёх
> root-вызовов. Эти наблюдения не доказывают контракт для других версий и не
> позволяют переносить подтверждение root на child. Для закрытия bootstrap
> необходимо независимо подтвердить источник конкретного child-вызова либо
> сохранить совместимый путь без предположений о владельце.

Статус: кандидат в реализации; состояние проверки и оставшиеся границы указаны выше. Новые EVAL не выполнялись.
Дата: 2026-10-26. Проверка подхода: ponytail, full.

Последняя фиксация кандидатов: engine `213a03acce02bb4018bce0ed70f20dc3c967c4a7`,
bridge `ac3e1063934fd516b7e69e900dc196eaafd3e7a9`. Локально прошли сборки и
выбранные проверки затронутых зон, включая late child/failure и offline
daemon→Work CAS. Полный gate, GitHub CI, новый EVAL, установка/promotion bridge
и повторная живая квалификация не выполнялись. Предыдущие pins и запуски не
изменены; фактическую совместимость установленного ZCode с `inputId` надо
подтверждать отдельно, прежде чем объявлять новый bridge квалифицированным.

## 1. Цель и границы

Убрать повторный admission и тяжёлую работу из hook. Команда CLI принимает решение
и выполняет действие один раз; hook сообщает только недостающий нативный факт.
Полезная активность продлевает наблюдение. Неудача наблюдения или уборки не
аннулирует результат и не доказывает неудачу исполняемой команды.

Область: Codex/Luna, ZCode, AGY, OpenCode, Grok, общие механизмы и аналоги Droid;
проекция состояния и cleanup в dd-eval. Продуктовые дефекты не исправляем.
Сохраняем реальные гарантии: собственный процесс/session, актуальное назначение и
поколение, единственный writer, проверка содержимого и обязательных результатов.

Не добавлять новую БД, очередь, брокер, сервис, систему capability-токенов,
классификатор/decision-модель ошибок или ещё один универсальный recovery framework.
Использовать assigned lifecycle, operation hook ledger/journal, ObservationClock,
существующие shutdown phases, technical notes и retirement proof.

Работающие/исторические EVAL, их pins и runtime не менять; не resume/restart.
При реализации — только проверки затронутых зон, без полного gate, живой
переквалификации Judge и GitHub CI. Release и новые прогоны — отдельное поручение.

## 2. База и факты, которые нельзя потерять

Исследован engine `6a155461637bada8baad4418432fc8cfcf1a93e5`, beta.153,
на основе main `0afc8215b78ec2840f2069421d0822dbadfa94b1`;
dd-eval CP257 `e70e636d469cd97f2358bffb49c1bb5541140961`,
main `3e64045421eb80a1bbe166dc64b12e04a4dc978a`.
План составляется отдельно от frozen campaign. Номера строк ниже относятся к
исследованной базе, при реализации искать также по именам функций.

| EVAL | Подтверждённая цепочка, время UTC | Системная причина |
| --- | --- | --- |
| Luna `EVAL-20261026160402-1bbe5eac` | CODE: hook стартовал 18:03:23, внутренний timeout около 18:03:44 на import. Codex затем запустил настоящий `stage finish`: ingress 18:03:46, imports_ready 18:04:03, отказ `run_recovery_guarded` 18:04:30 | 20-секундный hook запускает второй Node, загружает полный admission; adapter считает его отказ провалом prompt и успевает оградить RUN до настоящего finish. Последний отказ — следствие нашего fencing, не доказанный первоначальный дефект CODE |
| ZCode `EVAL-20261026160437-86e4a9ad` | PLAN-REVIEW: passive ACP observer получил `native_hook_timeout` 19:02:36; CLI уже вошёл 19:02:18, завершил import 19:02:50. Пауза запрошена 19:02:49; WRK-008 принят 19:03:09, child завершился позднее | Отказ служебного наблюдателя отравляет root prompt; позднее принятие Work не согласуется с технической паузой. Все пять Work приняты, но Stage ещё должен закончить coordinator |
| AGY `EVAL-20261026160447-1e09d119` | SPECIFY принят 16:18:41, native SUCCESS/settled 16:18:51; PROTOCOLIZE context принят 16:19:10. Stop 16:19:11 падает `agy_native_inspection_unavailable/grpc_8`; active_tree=false, execution phase не сохранена | Собственный native snapshot 1 196 719 байт больше custom 1 048 576; очистка ресурсов стоит до публикации execution-settled. Вынужденная пауза скрывает уже доказанное завершение выполнения |
| OpenCode `EVAL-20261026160455-b56a160c` | Нативная БД: assistant partial error `provider.transport/ECONNRESET`, затем synthetic «Continue…» без metadata и новый assistant; наш adapter останавливает его как `opencode_foreign_input` | Нативная роль synthetic ошибочно приравнена к чужому источнику. Это штатное продолжение самим runner OpenCode, а не ввод пользователя |

У всех четырёх baseline прошёл. У ZCode прежний поздний network error после
WRK-006 уже правильно стал technical note: WRK-007/008 продолжились. Это рабочий
путь плана 107, его не заменять новым механизмом.

AGY размер snapshot измерен прямым read-only native RPC без запроса модели;
не предположение по одному коду gRPC 8. Диагностика не должна сохранять CSRF,
Authorization, полный snapshot или командную строку с секретами.
В Luna нет доказательства SQLite lock: последняя фаза hook — import, не store.
Нельзя обосновывать исправление недоказанной блокировкой БД.

Дополнительный факт OpenCode: retained maintenance уже подтверждает физический
cleanup settled/capture ready, но верхний cleanup_state остаётся pending.
Это ошибка проекции, а не доказанный оставшийся процесс.

## 3. Инвентаризация аналогов и принятые решения

Исследованы CLI ingress, services admission/Work/controller/recovery, все native
adapter/daemon hooks, stream/process helpers и EVAL status/health/retirement.
Три независимых аудита охватили hooks, clocks/limits и native/EVAL; основные
ветви и новые находки перепроверены родительским агентом по коду. Это охват
механизмов, а не обещание отсутствия любых неизвестных ошибок во всём проекте.

| ID | Место в engine, если не указано dd-eval | Что меняем |
| --- | --- | --- |
| H1 | `src/cli/hook-ingress.ts:9,35,70–88`, `services/hooks.ts` | Удалить nested worker и RUN admission из managed hook. Статический граф hooks.ts тянет около 299 локальных модулей; это иллюстрация связанности, не измерение runtime |
| H2 | `src/cli.ts:76–90` | Все Codex hook entry, не только DD_FLOW_CODEX_STATE_DIR, направить через лёгкий ingress. Unrelated команды в обоих CODEX_HOME не должны импортировать run-cli/store |
| H3 | `assigned-lifecycle.ts:64,164`, `lifecycle-invocations.ts:1415,1924`, `work-registry.ts:604–610`, `run-cli.ts:466–493` | Не требовать fresh hook для assigned start/settlement; сохранить реальную child identity при первом Work start и native receipt non-assigned MERGE/recovery/auxiliary. Материализовать receipt/admission в CLI |
| H4 | `dd-codex.mjs:355`, `dd-zcode.mjs:260,891`, AGY `rejectHook`, Droid `fatalError`, OpenCode daemon hook error | Разделить наблюдательный отказ и настоящий policy rejection. Не прерывать prompt только из-за hook timeout/телеметрии |
| H5 | `bin/dd-agy.mjs`, `opencode-plugin.mjs:64`, `dd-opencode-daemon.mjs:428`, `dd-droid.mjs:540` | Обычный tool не должен вызывать полный CLI, childTree/inspect и admission. Native activity/Stop facts при этом не терять |
| H6 | `dd-agy-daemon.mjs:860–945` | Убрать topology lookup, captureChildTools, observeModel/reconciliation и completePendingTurn из синхронного ACK. Не переносить весь hooks.ts в daemon |
| H7 | `dd-zcode-daemon.mjs:504`, `dd-grok-daemon.mjs:453`; failure/flush wrappers ZCode/Grok/AGY | Удалить произвольный 1-секундный Promise.race вокруг своих записей: он не отменяет запись, но теряет корреляцию при позднем завершении |
| H8 | bins AGY/ZCode/Grok, OpenCode plugin failure notify | Удалить каскад записи failure через уже исчерпанный hook budget; сохранить первичную диагностическую запись у владельца |
| H9 | ZCode/Grok prompt finally, Codex activeHooks, OpenCode plugin execute.after и daemon requests, AGY observeHook | Не терять исходную correlation после завершения root prompt; late Post/Stop/child относятся к своему native turn/creator, не к новому current prompt |
| H10 | Droid create/resume и SessionStart; AGY/Grok/OpenCode native lookup внутри ACK | Не ждать внутри hook завершения task, который сам ждёт этот hook. Init/load факты имеют свой request binding и не требуют активного productive prompt |
| C1 | `native-hook-command.mjs:120–218,244`, CLI ingress и все callers | Тяжёлая CLI-работа не зависит от абсолютного hook deadline; наблюдение полезных фаз использует скользящее окно |
| C2 | `dd-agy-daemon.mjs:924` | После 1024 уникальных hook events перестаёт вызываться markActivity. Дедуп по текущим generation/step/execution, не lifetime-запрет новой активности |
| C3 | engine `driver-recovery.mjs:107–120` | recoverDriverReply не передаёт progress в clock и не имеет внутренних callers. Удалить мёртвый дубль после проверки exports/пакета; используемый recovery — существующий recoverDaemonReply |
| S1 | `agy-native-inspection.mjs:163,169,192` | Убрать custom receive ceiling у owned local gRPC snapshot; сохранить method/code и безопасные native details |
| S2 | `services/harness-adapter.ts:20,165`, `native-streams.mjs:3,23` | 1 000 000 байт ответа адаптера/8 MiB native reply не означают неуспех. Удалить искусственные fail ceilings на доверенных ответах |
| S3 | `native-hook-command.mjs` stdout; engine и dd-eval `process-json.mjs` | Не убивать собственный CLI за длинный валидный ответ. Hook ACK сделать маленьким по содержанию, а не передавать через него artifacts |
| S4 | `dd-agy-daemon.mjs:108–130`, `agy-terminal-envelope.mjs:21` | Первые 8 MiB transcript и отказ читать output >2 MiB теряют поздние terminal facts. Последовательное чтение штатными средствами вместо arbitrary cutoff |
| S5 | `dd-zcode.mjs:651,717` | Удалить fatal по >1024 страниц/Session; оставить advancing cursor, уникальность, identity/revision/count и отсутствие прогресса. Pagination уже sliding — не «чинить» несуществующий fixed timeout |
| S6 | `descriptor-stage-settlement.ts:65–68`, `stage-report-renderer.ts:35–53,91–99` | Reader-only 6/8 MiB, 1 MiB accepted bytes и >32 packet rows могут отвергнуть уже опубликованный/принятый результат. Выбирать exact attempt/hash/destination, убрать ретроспективные size/count барьеры, сохранить byte custody |
| N1 | `dd-agy-daemon.mjs:970–982,1140`, `daemon-operations.mjs:75–103` | Сохранить execution proof до retirement; использовать существующий reconcileResources callback |
| N2 | `dd-opencode.mjs:320–373` | Owned-session synthetic continuation не foreign input; сохранить реальные user/input/delivery/idle проверки |
| N3 | `run-controller.ts:342,601`, `run-control.ts:396`, `controller-result-authority.ts`, `run-controller-recovery.ts:134` | Согласовывать поздний accepted Work исходной операции и техническую паузу; не переисполнять Work и не объявлять Stage завершённым автоматически |
| N4 | `dd-zcode-daemon.mjs:614–697`, `dd-droid-daemon.mjs:74–83`, `dd-droid.mjs:593–630` | Аналог AGY: graceful stop закрывает provider/bridge до durable execution proof. Сначала сохранить доказанный quiescent execution, close/registry оставить существующим cleanup phases. Explicit cancel живого writer не ослаблять |
| E1 | dd-eval `runner.mjs:6344–6352`, report/finalization writers, `cleanup-observation.mjs`, `technical-notes.mjs` | Одна валидированная физическая проекция для cleanup_state/notes; согласовать новые writers/consumers, не расходиться с retained retirement proof |
| E2 | dd-eval `runner-health.mjs:24–29,85+`, `managed-flow-client.mjs` | Живой observer не означает работающий RUN. Показать technical waiting/dependency blocked и не крутить бессодержательный productive poll |
| E3 | dd-eval `eval-resume-worker.mjs:317,335,402,420–448`, `runnerCleanupReceipt`, `completion-scope.mjs` | Отдельно ждать capture/finalization; физический cleanup=settled не доказывает готовность оценки и не снимает оставшуюся обязанность observer |
| E4 | dd-eval `runner.mjs:2259–2267`, `cleanup-observation.mjs:18`, `judge-cleanup.mjs` | Сохранить all-role физический scope, включая Interaction/Final Judge без verdict. Нынешний execution-only cleanupObservation нельзя использовать как весь EVAL cleanup |
| D1 | dd-eval `runbooks/isolated-development.md:62–70` и аналогичные touched инструкции | Убрать старое требование full paired gate из рабочего пути: проверки по затронутым зонам по планам 102–104, не новый подготовительный gate |

## 4. Выбранное устройство hook — минимум обязанностей

### 4.1 Один admission: CLI

Managed команда с уже выданным controller/Work assignment допускается существующим
assignedLifecycleBinding → claimAssignedLifecycle и SQL CAS. Для `stage start`,
`work finish/fail`, `stage finish/pause/resume` fresh PreToolUse не prerequisite.
Hook не повторяет поиск назначения, project routing, result validation, checks,
стадии, controller logic и обход RUN. Поддельный `--invocation-id` не даёт прав:
его проверяет CLI по текущему assignment, generation и реальному содержимому.

Первый `work start` отличается: физическая свежая child session заранее неизвестна.
Здесь нужен нативный факт session/parent/tool/operation/generation/command и, где
важно, cwd. Использовать существующие hook request files/daemon journal и
verify/resolve, а не третий источник authority. CLI читает ровно запись исходной
операции и tool ID, материализует имеющийся hook_events receipt и claims start
один раз. Файловый request ID не подменяет существующий `--hook-event-id`:
consumer явно разрешает request binding в event key, формат старого ID сохраняется.

Missing identity означает ожидание/невозможность безопасного start, а не root из
env, «последнюю сессию», fabricated receipt или новый повтор Work. Late/duplicate
факт той же операции идемпотентен; другой command/parent/generation под тем же
native identity — реальный конфликт. Native факт сам не разрешает mutation.

Не сводить все оставшиеся native receipt к Work start: `merge apply/repair`,
`recovery accept`, manual recovery с managed daemon и non-assigned auxiliary
также сохраняют необходимую регистрацию. Удаляем hook prerequisite только когда
у команды действительно найден действующий assigned proof; остальные пути
получают native fact и проходят текущие scope/recovery guards в CLI.

**Стыковка факта с CLI определена явно.** В `run-cli` до ветви nativeEvent/manual
recovery (около 466), либо в `awaitLifecycleInvocation` для issued bootstrap,
разрешать `invocation-id + cliManagedInvocationScope + captured active operation`
в единственный source-bound native tool. Если CLI не получил tool ID, уникальность
должна следовать из native факта и точного issued command/назначения, не из
близости времени. Ноль записей — наблюдать исходную операцию; разные физические
исполнители/parents/generations — ambiguity без mutation, не выбирать latest.
Повтор той же issued команды тем же executor/session при том же scope/cwd не
новый владелец: tool IDs сохраняются как отдельные evidence, но запрос идёт в
существующий invocation CAS/replay. Executing наблюдаем, settled переиспользуем;
не добавлять запрет нормального повтора из-за потерянного ACK. После проверки
материализовать прежние `observeLifecycleInvocation`/`hook_events` и использовать
прежний CAS. File/journal reading и ожидания — до SQL transaction.

Для manual recovery с daemon и non-assigned auxiliary invocation-id может
намеренно отсутствовать. Второй, явно ограниченный lookup: owned operation/
generation + exact parsed command/explicit target + source-bound root/tool.
Проверить существующий manual/auxiliary scope и материализовать receipt, не
выдавать ради сопоставления фиктивный assignment или новый invocation.
Оба lookup используют один reader/нормализацию native facts, не два policy engine.

| Producer, который уже существует | Минимальное дополнение к записи, не новый транспорт |
| --- | --- |
| Codex `hook.verify` и active native delivery | Сохранить проверенный proof в существующий operation hook ledger, чтобы он переживал выход callback; daemon/root/child/parent/turn/tool/command/cwd/generation |
| ZCode `hook.resolve`/acceptNativeHookRequest и ACP observer | Использовать те же operation bindings и native tool ID; запись из PreTool и ACP одного tool дедуплицируется, а не создаёт два authority |
| Grok `hook.resolve`/operation request ledger | Сохранить точный native session/parent/tool/command текущего operation и generation; неизвестное ancestry устанавливать вне синхронного ACK |
| OpenCode plugin/daemon `hook.resolve` ledger | Сохранить plugin session/tool/command/current operation; не делать native tree inspect на каждом shell |
| AGY `hook.observe` и существующие request files/journal | Нынешних conversation/tool name недостаточно: добавить native tool args/command, conversation/parent если известен, step/execution/source event, operation/generation. Если native tool ID отсутствует, source identity — native conversation + step + execution + event, не придуманная session из env |
| Droid native hook journal | Сохранить проверенные SessionStart/child lineage и Execute correlation/command. Init/load связывать с retained create/load request/native session, а Execute — с productive turn; не требовать runtime.active для SessionStart |

Общий consumer читает минимальную нормализованную запись из уже существующего
хранилища harness, а не пытается угадать parent в каждой CLI-команде. Для managed
issued команд `--invocation-id` остаётся точкой поиска. Legacy rewriting использует
прежний event key; request ID и native source ID хранятся рядом, но не подменяют
его. Manual recovery с daemon дополнительно проверяет точный root/recovery target
существующими `manualRecoveryInvocationScope/assertManualRecoveryInvocationTarget`.

### 4.2 Синхронный callback

1. Прочитать native envelope; выделить необходимую identity/correlation/activity.
2. Если daemon managed — передать/сохранить маленький факт через существующий
   локальный канал. Дождаться существующей атомарной регистрации, проверить
   operation/generation перед публикацией ACK. Не запускать второй Node/полный CLI.
3. Ответить коротким штатным ACK. Нет stage artifacts, snapshots, model text.

Не делать native tree inventory, transcript discovery по каталогам, RUN SQLite,
model call, checks, resource stop, completion reconciliation в этом callback.
Обычные tools могут сообщать progress через уже существующий канал, но не проходят
lifecycle admission. Stop/fullyIdle и terminal child facts сохраняются: это
необходимое доказательство завершения, не опциональная «телеметрия».
Тяжёлое folding/inspection/completion делает имеющийся daemon observation loop,
последовательно с текущим dispatch journal; не запускать отдельный detached writer.

Здесь последовательность относится только к короткой записи факта в существующий
journal, не к ожиданию завершения productive promise. Hook вызывается внутри
native task и не может ждать этот task, native idle или уведомление, которое
провайдер отправит лишь после ACK. Иначе получится взаимная блокировка. Unknown
ancestry подтверждать после ACK; до этого запись не даёт mutation authority.
Особенно проверить Droid SessionStart: native initialize ещё ждёт ответа,
runtime.active отсутствует, но create request уже сохранён. Resume/load без нового
prompt остаётся observation, а не принудительно созданным модельным Turn.

Для AGY неизвестного ребёнка сначала сохранить native факт как принадлежащий
исходной операции; parent/topology устанавливает существующий observation loop.
Пока ancestry не подтверждена, факт не даёт start/settlement authority.
Перенос reconcile после ACK не должен терять событие при process exit: ACK только
после сохранения минимальной записи, повторная обработка идемпотентна.

**Поздняя доставка.** Before/after используют одно исходное binding. Post/Stop
не делают новый resolve против current prompt. Native child может впервые
вызвать work start после окончания родительского prompt: использовать retained
creator/child-turn связь из topology/journal, пока назначение и control generation
действительны. Возврат root prompt сам по себе не retirement ребёнка.
Durable факт не удаляется вместе с временным requests/activeHooks Map.
Различать RUN recovery generation, daemon control generation и native turn epoch:
это не взаимозаменяемые числа. Запись несёт исходные именованные bindings.
Late факт старого epoch не двигает clock и не завершает новый prompt; допустимое
принятие исходного Work по его ещё действующему назначению согласуется отдельно.
Если source epoch доказать нельзя — unbound diagnostic, не attach к current.

### 4.3 Legacy/manual и установка

Все Codex entry идут через лёгкий фильтр; unrelated tool возвращает `{}` без
store/router/daemon autostart. Проверить `~/.codex` и `~/.codex-cpa` через
изолированные аналоги, не редактировать глобальные homes в ходе реализации.

Legacy/manual без managed daemon сохраняет совместимость hook_events и native
command rewriting. Для participating команды допустима только узкая существующая
регистрация факта в прежнем store; выделить её низкоуровневые зависимости из
hooks.ts. Если первый legacy stage требует project registration — оставить этот
необходимый bootstrap, без импорта stage/check/controller services. Содержательный
admission выполняется командой, не регистратором. Не строить ради legacy новую
файловую очередь или фоновый daemon.

Старый установленный hook с новым CLI поддерживается через прежние handlers/ID;
они используют тот же admission, не создают вторую ветвь policy. Новый hook не
должен молча требовать новый daemon у старого engine: обновлять как единый runtime
tuple существующим installer и сообщать version mismatch до productive start.
Не расширять parser: использовать имеющееся распознавание участия команды, а
не полноценный shell firewall. Непонятный compound shell не повод ломать observer;
достигшая CLI команда проверяется по фактическим аргументам.

### 4.4 Ошибки

- Observational hook failure: technical note с исходными request/tool IDs;
  сверка реального CLI outcome. Не rejectAll и не cancel root prompt автоматически.
- Настоящий отказ CLI до mutation: прежний structured error/repair/control outcome.
  Не переводить его в warning. Если native hook действительно запрещает tool,
  использовать документированный deny-протокол, а не технический exit 1.
- Потерянный ACK не доказывает no_effect: запись/команда могут уже выполняться.
  Уточнить исход той же операции; не повторять mutation.
- Для bootstrap без доказанной identity CLI не начинает Work. Ослабления «успеть
  любой ценой» нет; ожидание находится вне host hook budget.

У Codex exit 1 handler может считаться failed, но сама команда всё равно стартует.
Это подтверждено native journal CP257 и исходниками Codex PreToolUse. Не выводить
«tool не выполнялся» из hook/completed failed. Не парсить generic текст
«hook exited with code 1» как первопричину: сохранять безопасный structured
diagnostic у владельца операции.

## 5. Время: что именно наблюдаем

| Механизм | Сигнал / решение |
| --- | --- |
| Работа агента | Новые reasoning/text/tool events, результаты tools, подтверждённый native child progress продлевают существующий ObservationClock |
| Исполняемый CLI | Новые request-bound startup/import/prepare/check/commit phases и полезный вывод активной проверки продлевают CLI observation; одинаковый poll/phase не продлевает бесконечно |
| Наблюдатель | Новый опрос/heartbeat подтверждает жизнь observer, но не работу модели. Хранить отдельно, не объявлять provider hang только по отсутствию final answer |
| Native retry/backoff | Учитывать известный native retry state/next attempt. Не посылать параллельное «продолжай», пока native owner сам продолжает |
| Read-only RPC | Конечный transport deadline завершает только попытку чтения; его отказ не доказывает смерть/провал операции |
| Владение | Lease/control generation/PID birth не продлеваются любым stdout; право mutation подтверждает committed authority heartbeat |
| Cleanup kill/close | Конечное окно остановки собственного процесса допустимо: это ожидание освобождения ресурса, не лимит продуктивного агента |
| Native hook host | Внешний конечный timeout остаётся свойством host. Выполнять в нём только тонкую регистрацию, не пытаться продлить им жизнь большого CLI |

При повторном просмотре всех callers уточнён минимальный вариант: не добавлять
режимы в runBoundedCommand на будущее. У него сейчас только два direct callers:

| Caller | Окончательное решение |
| --- | --- |
| `invokeNativeHook` | Удалить его использование для тяжёлого admission; если нужен compatibility callback — только короткая регистрация в пределах native host deadline |
| `managed-daemon.executeRuntimeProcess:278` | Сохранить finite authority/uncertainty horizon register/confirm/heartbeat/admission/finish. Новые phases двигают observation silence, но не продлевают lease/право записи; по исчерпанию — exact readback/reconciliation после физического завершения исходного transport |
| Обычная исполняемая CLI-команда | Использовать уже существующий activity-aware process-json/ObservationClock, не запускать её через hook deadline и не наследовать DD_FLOW_HOOK_DEADLINE_AT как срок жизни работы |

Таким образом, у здорового продуктивного агента нет fixed wall-clock cutoff,
но useful stdout не разрешает просроченному writer продолжать mutation. Отмена,
owner identity и безопасное освобождение своих subprocesses сохраняются.
Существующих clocks/callbacks достаточно; новый TimerManager не нужен.

Если окно тишины истекло, сначала читать durable outcome той же операции.
Неизвестный outcome означает observation/reconciliation, не автоматический
повтор и не универсальную ошибку модели. Медленная загрузка до первого полезного
сигнала может исчерпать startup observation; это не повод убивать уже начатую
другим каналом mutation или объявлять её no_effect.

Локальные await записи/flush не оборачивать в отдельный секундный Promise.race:
неотменяемый write может успешно закончиться после «отказа». Дождаться записи в
существующей последовательной цепочке; перед ACK сверить captured generation.
Если поколение сменилось — late факт остаётся старой операции, не нового prompt.
Не накладывать вымышленную гарантию отмены на Promise.race.

AGY progress dedup хранить в пределах текущих step/execution/generation; новые
события после 1024 должны учитываться. Повтор одного события не прогресс.
Дубликат здесь означает повтор той же native identity/sequence, а не одинаковый
текст: новый вывод работающей проверки (включая повторяющиеся строки/точки) остаётся
активностью её собственного процесса. Не добавлять классификацию «полезности»
текста regex/моделью; повтор poll того же cursor — не новая работа.
При reattach сохранять прежнее окно/sequence, а не начинать новый полный срок
при каждом poll. Engine мёртвый recovery helper удалить, не развивать второй путь.

Receipt TTL у ещё не принятого issued invocation — срок свежести назначения,
не таймаут исполняемого агента. Сохранить: истёкшее назначение обновляется штатно
до mutation; executing/settled не должно становиться failed из-за возраста TTL.
Не отменять полезные fencing/TTL под лозунгом «удалить все таймауты».

## 6. Размеры: не делать длину ответа условием успеха

Для owned authenticated native replies убрать произвольные semantic fail ceilings:
AGY gRPC receive `-1` (простое удаление опции оставляет default 4 MiB), adapter
stdout 1 MB, native JSON reply 8 MiB, собственный process-json/hook command stdout.
Сохранить существующие потоковые readers/backpressure; не выдумывать новую spool
систему. Где уже есть evidence-файл, возвращать его ссылку вместо дублирования
полного вывода в служебном ACK. stdout обязан содержать валидный протокольный
ответ; unlimited size не превращает malformed JSON в success.
Формат результата не менять: существующие `judgeTurnText`/JSON consumers должны
получать прежние поля полного ответа. Evidence-ссылка вместо данных допустима
лишь там, где текущий протокол уже её поддерживает; не придумывать новый формат
из-за удаления лимита и не отдавать путь там, где caller ждёт текст Judge.

AGY transcript читать последовательно штатным JSONL reader до зафиксированной
полной newline boundary. Неполную последнюю строку дочитать следующим проходом;
rotation/truncation явно сбрасывает offset с проверкой inode/session, не объединяет
разные файлы в одно доказательство. SHA/locator отражают реально прочитанный
snapshot; не выдавать byte prefix за полную историю. Terminal output >2 MiB читать
обычным потоковым способом с прежними path/owner/no-symlink и native envelope
проверками; stdout произвольной команды всё ещё не native terminal authority.

В ZCode убрать только cardinality guards 1024: repeated cursor, противоречивые
revision/count/parent, реальная тишина остаются. Большое, но корректное дерево
не следует объявлять incomplete только из-за количества узлов.

Дополнительный подтверждённый аналог из сквозного review — чтение уже принятых
пакетов стадий (S6), не установленная причина CP257. `acceptStagePacket` не
ограничивает опубликованный prompt шестью MiB, но descriptor settlement позднее
отвергает такой packet. `readAcceptedStageData` сначала отвергает >32 rows/любой
payload >8 MiB, лишь затем смотрит hash/destination; посторонний большой prompt
способен помешать чтению небольшого принятого результата. Его reader-only 1 MiB
на accepted bytes также не является проверкой входного результата.
Убрать эти ретроспективные ограничения; сузить запрос/чтение до exact project/
RUN/stage/attempt/hash/destination, проверить canonical base64 и checksum, отвергнуть
конфликтующие bytes. Одинаковые дубли не новый конфликт, чужие packets не повод
отказа. В descriptor prompt lookup также учитывать текущий attempt/hash до custody
проверки. Upfront result-input/control-input границы сохраняются отдельно; не
переписывать все Memory custody механизмы ради этого исправления.

Оставить ограниченные diagnostic tails, bounded caches с eviction и framing
внешнего неавторизованного ingress. Их усечение не должно терять authoritative
outcome или давать flow failure. Не удалять размеры всех полей проекта механически:
например, Droid settings/header и AGY qualification document — конечные control
inputs, не растущая история выполнения. Если их чтение не удалось, не выдавать
это за завершение/ошибку модели. Это не доказанные CP257 output-cap дефекты.
Реальное ENOMEM/диск переполнен не маскировать; сохранить неизвестный outcome и
primary resource error, а не ложно принять результат.

## 7. AGY: execution отдельно от native resource retirement

Выбран конкретный минимальный перенос: prepareStop проверяет native execution
settlement и возвращает receipt; retireNativeServices переносится в уже имеющийся
post-execution reconcileResources callback completeDaemonShutdown, перед
captureChildTools. Сначала durable `shutdown.phases.execution` с результатом,
потом native inventory/stop. Не строить новую shutdown state machine.

Snapshot/RPC error оставляет cleanup pending + technical note. Можно продолжать
следующую стадию по существующему controller fallback, если сохранено доказательство
execution quiescence именно текущего daemon/incarnation/generation и нет
конфликтующего writer. Один accepted Work, живой PID или старый SUCCESS этого
не доказывает. Таймер/расписание/неизвестная активная задача не объявляются просто
support service. Если такая активность может писать — сначала остановить/изолировать
свой owner штатным physical cleanup либо удерживать только небезопасный переход.

Обновить сам predicate fallback в `run-controller.retireSession`, а не только
порядок shutdown: `execution proof` разрешает successor лишь вместе с положительным
актуальным native inventory, исключающим возможных writers, либо доказанным owned
physical retirement/absence. Partial/неполученный inventory при возможных schedules
не даёт этого права, даже если phases.execution=true. Existing physical cleanup
может закрыть этот пробел без запроса модели. Accepted outcome остаётся принятым.

Сохранить native_execution_revision/control generation fences до/после reconcile;
late activity инвалидирует старое execution proof. Повтор cleanup продолжает
недостающие фазы, не вызывает prepare/model заново и не переписывает принятый Work.
Нельзя выставлять native clean/stopped, если service stop не подтверждён.

**Тот же порядок для ZCode и Droid.** В ZCode graceful prepareStop уже сохраняет
native_stop_proof, но затем вызывает bridge.close до возврата prepare; его отказ
снова скрывает shared execution phase. В Droid prepare вызывает closeTree,
который смешивает native terminal, physical close и provider registry finish.
Для штатного stop после доказанного native quiescence сохранять execution receipt
до close/registry; перенести физические действия в существующие provider/resource
phases, не дублировать stop при повторном вызове. Если prepare ещё не подтвердил
quiescence, никаких фиктивных phases.execution=true.
Explicit cancel с активной работой может нуждаться в interrupt/physical close
именно для установления execution settlement: этот путь не превращать в warning
и не объявлять graceful native success после принудительного kill.
Codex/Grok/OpenCode уже отделяют observe/wait от provider phase — сохранить этот
порядок, не переписывать исправные реализации ради одинакового кода.

gRPC диагностика сохраняет method/code/sanitized details отдельно от primary
результата. Не сериализовать в note весь snapshot/metadata/токены.

## 8. OpenCode: штатное native продолжение не чужой ввод

Доверять internal synthetic в private authenticated owned OpenCode session после
точного admission исходной операции. Нельзя определять происхождение по роли
synthetic, отсутствию metadata или тексту «Continue…». Удалить этот общий foreign
guard; поздний настоящий user/input вне нашего admission по-прежнему конфликт.

Если synthetic утверждает child/shell completion, для предоставления delivery
authority по-прежнему проверить owned ancestry/tool handle. Неизвестное/поддельное
completion не подтверждает доставку. Native idle — не достаточно при pending
inbox/forms/permissions, active tools/children/background notifications.

Повтор выполняет один владелец: native runner либо существующая engine retry
policy после его terminal refusal. При native busy/retry active engine не посылает
ещё одно «продолжай». Сохранить общую ограниченную политику отказов провайдера
на эпизод; не вводить безлимитный retry и не менять квоту/лимиты этим исправлением.

Проверено по upstream v2.0.31: runner llm.ts в ветке Continue публикует synthetic
без metadata, затем нового assistant; step.ts возвращает Continue при прерванном
чтении после начавшегося output. Это совпадает с нативной БД CP257. Upstream issue
о missing finish reason — смежный случай, не доказанная причина нашего ECONNRESET.

## 9. ZCode/Luna: настоящий outcome важнее ошибки наблюдателя

После observational failure не rejectAll исходный ACP/native prompt. Сверить
существующие lifecycle invocation, controller obligation и operation journal.
Команда может быть preparing/executing; наблюдать исходный ID, а не переисполнять.
По late acceptance продвигать существующую result-authority projection.

Для ZCode расширить существующий reconciliation текущего obligation и recovery:
Work acceptance после технической паузы — тоже допустимая точка согласования,
не только полностью завершённый Stage. Проверять action, cycle, attempt,
WorkSession, native operation и актуальную recovery/control generation.
Не снять human/operator pause, cancel, stale generation или foreign operation.
Снимать только собственный технический барьер, причина которого подтверждённо
устранена. Возобновить существующий coordinator один раз, когда исходная операция
и конфликтующие writers quiescent; использовать текущие resume/control механизмы.
Все пять review Work completed не дают автоматический PLAN-REVIEW PASS:
coordinator обязан интегрировать findings и выполнить stage finish.

Для Luna не превращать нефатальный native hook exit в ранний global stop. CLI
stage finish должен иметь возможность закончить обычную проверку/commit; если
настоящая команда отвергнута — сообщить именно её structured причину. После
accepted finish поздний PostToolUse/hook diagnostic только technical note.

Если принятия нет и исход неизвестен, не «работать дальше» с конкурирующим writer:
сохранить outcome unknown и восстановить наблюдение/физическое завершение своего
owner. Это полезная граница, не второй content/admission контроль.

## 10. EVAL: один честный status вместо противоречивых полей

Сначала получить существующее cleanupObservation с проверкой retirementProofMatches
(root/manifest/resource home/scope/current inventory/control binding), затем
использовать один физический вывод для верхнего cleanup_state и resolution
соответствующих technical notes. Не доверять отдельному saved `settled:true`.

Общий physical вывод обязательно **all-role**: Subject + Interaction/Final Judge,
включая Judge без verdict, и остальные собственные resources/provider turns.
Использовать существующий `observeScopeResources`/валидированный scope retirement
proof как источник агрегата. Нынешний cleanupObservation перебирает только
manifest.executions: его per-execution physical — детализация, не полный scope.
Subject not_applicable/settled не закрывает живой Judge. Fast-path decision HTTP
без native daemon, напротив, не создаёт фиктивный pending native cleanup.

Закрепить семантику: cleanup_state — физическая уборка owned runtime resources;
capture и assessment/finalization показываются существующими отдельными полями.
Pending assessment не делает физический cleanup pending. В aggregate settled
участвуют все применимые owned scopes; unavailable/stale/changed inventory даёт
`cleanup_state=pending` с отдельной причиной; `settled` — когда все применимые
scopes settled/not_applicable. Существующий `blocked` оставлять только для
подтверждённого отказа уборки, не неизвестности. Не вводить новое значение unknown
в верхний enum. Физическую семантику согласовать во всех новых status/report/
finalization writers и consumers, а не только runnerStatus. Не менять исторические
verdicts, primary error, report state или журналы задним числом.

Перепроверить не только status, но `judge-cleanup.mjs` и
`interactionCleanupPending`: accepted verdict, native execution settlement и
физическая остановка — разные факты. Полная физическая уборка может быть доказана
без native clean; это не превращает native failure в success и не отменяет verdict.
Не усиливать проверку содержимого Judge ради технического shutdown.

**Detached worker.** `eval-resume-worker.mjs:317,335,402,420–448` сейчас использует
cleanup_state как совмещённую готовность уборки/capture. После разделения полей
physical settled не должен позволять observer выйти с незавершённым обязательным
capture. Сохранить существующего владельца и продолжать только нужный capture/
reconciliation; отдельный finalize допускается прежними capture/assessment guards
и finalization authority, не cleanup authority. Cleanup-only intent с целью
local_retirement завершается по физической цели и не получает права запустить
Subject/Judge. Не превращать его в ожидание всех содержательных задач.
`runnerCleanupReceipt` остаётся recognizer завершённого report/capture, не просто
проверкой physical settled; его content/capture guards не ослаблять.

Health учитывает реальный bound RUN control/technical pause независимо от жизни
EVAL observer. Показать working/waiting/dependency blocked раздельно с owner
liveness; existing schema states переиспользовать, не плодить новую state machine.
Read-only status не должен включать обязательный reconcile всех RUN или запуск
модели: использовать bound snapshots; неизвестное явно показать unknown.
Managed wait при техническом ожидании ждёт существующее событие/control change
вместо productive dispatch и бессодержательного polling без изменения cursor.

## 11. Порядок реализации и конкретные поверхности

1. **Engine hook/CLI.** `src/cli.ts`, `cli/hook-ingress.ts`,
   `cli/native-hook-ingress.ts`, `services/hooks.ts`, `assigned-lifecycle.ts`,
   `lifecycle-invocations.ts`, `work-registry.ts`, `codex-hook-delivery.ts`.
   Выделить только native registration, потребление bootstrap факта в CLI,
   удалить второй admission и nested subprocess. Не переписывать parser/Work CAS.
2. **Все adapters.** bins/runtime Codex/ZCode/AGY/OpenCode/Grok/Droid,
   plugin и daemon hook operations. Удалить full CLI observer, тяжёлый sync ACK,
   fatal observational propagation и секундные write races; сохранить exact IDs.
3. **Progress/output helpers.** `native-hook-command.mjs`, `observation-clock.mjs`
   (менять только если не хватает существующего API), `native-streams.mjs`,
   `process-json.mjs`, `services/harness-adapter.ts`, AGY transcript/envelope,
   ZCode tree traversal; `stage-report-renderer.ts` и
   `descriptor-stage-settlement.ts` для reader-only packet caps. Удалить мёртвый
   recovery helper и его export/test callers.
4. **Native settlement/recovery.** AGY shutdown split и gRPC diagnostic;
   ZCode/Droid graceful shutdown phase split; OpenCode synthetic;
   controller exact late Work reconciliation для технической
   паузы. Использовать функции плана 107, не создавать параллельный путь.
5. **dd-eval.** `lib/process-json.mjs`, `runner.mjs`, `runner-health.mjs`,
   `cleanup-observation.mjs`, `technical-notes.mjs`, `managed-flow-client.mjs`,
   `eval-resume-worker.mjs`, `judge-cleanup.mjs`, `completion-scope.mjs`.
   Согласовать cleanup/health; не менять case definition, fixtures продукта/Judge.
6. **Документация/поставка.** Обновить touched runbooks: смысл hook, clocks,
   recovery, cleanup и только zone checks. При последующем выпуске обновить tuple/
   installer/pins штатно; этот план не требует нового bridge без изменения его
   protocol. Нужный fix расположен в нашем engine adapter, не в native ZCode.

Перед работой сверить main с названной базой, правила каждого репозитория и
пользовательские изменения. Отдельные worktrees; не редактировать frozen CP257.
Выполнение можно разделить на hook/CLI, native/recovery, EVAL; общие helpers
редактирует один владелец, остальные только согласуют interfaces.

## 12. Приёмка по затронутым зонам — конкретные сценарии

Расширять существующие fixtures/tests вместо нового полномасштабного стенда.
Сначала перечислить изменённые механизмы и только их callers; сохранить команды,
результат и границы непроверенного. Не запускать тесты для каждой упряжки заново
по одному и тому же общему helper. Изолированные temp roots/sockets/ports/registry,
детерминированные controlled promises/clocks вместо хрупких коротких sleep.

| Зона / существующие тестовые точки | Что обязано пройти |
| --- | --- |
| `hook-ingress`, `native-hook-ingress`, `hook-runtime-boundaries`, `codex-hook-home-routing` | Unrelated managed/global hook без router/store; оба CODEX_HOME; participating callback не импортирует stage/controller/checks, не запускает nested CLI, ACK не ждёт native inventory |
| `assigned-lifecycle`, `codex-hook-delivery`, `hook-responsibility`, `hooks-shell` | Assigned stage start/Work finish/fail/stage finish без fresh hook; first child start требует точную identity; non-assigned merge и manual recovery с daemon получают receipt; delayed/duplicate/stale/foreign/tool mismatch и ambiguous source не дают authority; реальные cwd-зависимости сохраняются, settlement не получает лишний cwd guard |
| `zcode-invocation-observer`, `controller-result-authority`, controller recovery fixtures | Timeout passive observer до commit → CLI commit позже → same operation без повторной mutation; accepted Work не Stage PASS; human pause/cancel/смена generation не снимаются; непринятый/unknown Work не игнорируется |
| Codex/AGY/Grok/OpenCode/Droid adapter fixtures | Post/observational failure не отменяет accepted outcome; настоящий CLI rejection сохраняется; старая hook/new CLI совместимость, mismatch до productive dispatch; unknown bootstrap без authority; late registration после смены операции не приклеивается к новому prompt |
| `agy-state-boundaries`, native shutdown/tree fixtures | Native settled → inventory throws → execution proof сохранён, cleanup pending; повтор cleanup без model/prepare; late revision/scheduled writer запрещает небезопасный переход; Stop/fullyIdle capture не потерян |
| AGY native inspection/envelope/transcript fixtures | Реальный serialized snapshot >1 MiB; transcript >8 MiB с terminal в конце; output >2 MiB; partial line, rotation, truncation, чужой путь/session, безопасная grpc code/method/details без токена |
| OpenCode API/adapter fixtures | Own user admission → assistant partial ECONNRESET → synthetic без metadata → assistant success → idle: один успешный dispatch; настоящий поздний user остаётся foreign; forged child/shell не даёт delivery proof; native retry active не вызывает engine continue |
| Observation/process-json/native stream/harness-adapter tests | Новые CLI phases/полезный tool output двигают окно; дубликат/heartbeat observer не имитирует model progress; длинные ответы выше старых порогов не убивают команду; invalid JSON остаётся ошибкой; silence/read timeout не создаёт no_effect; lease без authority не продлевается |
| ZCode native tree fixtures | >1024 страниц/Session с прогрессом; repeated cursor/несогласованный revision/count/parent по-прежнему не принимаются |
| Existing stage-report/descriptor custody fixtures | Большой published prompt не мешает чтению accepted result; >32 посторонних packet rows; matching packet выше прежнего reader ceiling; wrong attempt/hash/destination/conflicting bytes по-прежнему отказ; одинаковые дубли идемпотентны |
| AGY hook activity/write fixtures | >1024 новых событий продолжают progress; повтор не продлевает; atomic write длительнее секунды коррелируется; late generation не получает ACK текущей операции |
| dd-eval `cleanup-observation`, `retirement-proof-reuse`, `technical-notes107`, `runner-health`, `monitoring-status`, `operation-progress-recovery`, `process-json` | Valid maintenance proof согласует top cleanup и notes; changed scope/control/inventory не даёт settled; capture/assessment независимы; живой observer + RUN technical pause виден как ожидание; исторический verdict не меняется |
| Native late-event/init fixtures | Root reply раньше первого child work start; следующий parent prompt уже active; поздний after/Stop использует original binding; retirement/generation инвалидирует старый start; Droid SessionStart до initialize response, load без prompt; ACK не ждёт самого productive task |
| Native shutdown ZCode/Droid fixtures | Graceful quiescent execution + ошибка close/registry сохраняют execution proof и cleanup debt; retry не повторяет execution; explicit cancel живого writer не выдаёт graceful success |
| Manual/auxiliary и existing descriptor fixtures | Команда без invocation-id связывается по точному owned native source; чужой root/target/recovery/pause/graph не проходит; два tool ID того же executor попадают в один CAS/replay; произвольный non-SDLC stage start/finish и recovery ACK без SDLC allowlist |
| `eval-resume-worker`, `judge-cleanup`, `completion-scope` и cleanup fixtures | Subject settled/not_applicable + Judge live остаётся cleanup pending; decision HTTP без daemon не создаёт долг; physical settled + capture pending не теряет observer; cleanup intent не запускает Subject/Judge; retained verdict не запрашивается повторно; stop_after=specify даёт finished без следующего контекста |

Не создавать тест «все native errors всегда warning»: это неверная гарантия.
Позитивы обязательно соседствуют с ownership/generation/conflicting-writer
негативами. Для гонок проверять число mutations/dispatch и durable IDs, а не
только строку ошибки или wall-clock. Test doubles обновить под реальные native
roles/continuation и CLI ownership, не заставлять runtime поддерживать старую
искусственную строгость ради fixtures.

После zone checks — одна локальная installed проверка изменённого hook/CLI tuple
с native/daemon doubles, без модельного вызова и полного release gate. Не требовать
полную модельную квалификацию из-за hook/output/recovery fixes. Реальные E2E позже
подтверждают end-to-end результат, но не prerequisite этой реализации.
Изменение общего process-json не означает полную повторную baseline/fixture
qualification или Judge qualification. Точечно проверить изменённый consumer и
сохранить честный provenance; не подделывать старые fingerprints ради reuse.
Обычный baseline будущего EVAL остаётся частью самого EVAL, не дополнительным
подготовительным тестовым gate этой реализации.

## 13. Ponytail/readiness: решения приняты

При финальном независимом review и перепроверке по исходникам дополнительно
закрыты четыре пробела: non-assigned MERGE/manual recovery с daemon; точный
producer→CLI consumer и уникальная bootstrap correlation; запрет successor при
неизвестных scheduled writers даже после execution proof; единый enum и все новые
writers физического cleanup_state. Это уточнения реализации, не новые платформы.
Повторный сквозной review (§15) добавил H9/H10, N4, E3/E4 и S6: время жизни child/
late bindings, отсутствие циклического ожидания ACK, graceful shutdown аналогов,
capture-aware detached worker, all-role уборку Judge и reader-only packet caps.
Уточнены non-issued lookup, эквивалентные retries одного executor и реальный
authority horizon maintenance. Эти находки перепроверены родительским агентом.

- Удаляем дублирующий admission, а не наращиваем retries/таймаут вокруг него.
- Точная identity нужна только там, где она действительно добавляет полномочия;
  already assigned settlement не ждёт второй live-доставки.
- Нет новой очереди/демона/таблицы; существующий CLI/CAS, ledger и observer достаточны.
- Не повышаем магические лимиты 1→16/64 MiB; убираем бессмысленное условие провала
  доверенного результата. Внешнюю boundary и bounded diagnostics сохраняем.
- Исправляем конкретный порядок AGY shutdown через существующий callback.
- OpenCode узнаётся по owned operation/provenance, не whitelist текста ошибки.
- Не требуем нового запроса модели для native settlement или закрытия ресурсов.
- Полезный progress, observer liveness, execution authority и cleanup — разные
  факты; не превращаем любой ping в продление права записи.
- Recovery продолжает исходную операцию, не повторяет неизвестный effect и не
  снимает человеческую паузу. Принятый Work не равен принятому Stage.
- Только zone checks; не воспроизводим старый полный release gate под новым именем.

Открытых продуктовых/политических решений для начала реализации нет. Перед
удалением recovery export проверить весь package/export graph — это техническая
проверка совместимости, не выбор нового recovery подхода. При обнаружении внешнего
public caller сохранить deprecated wrapper на существующий recovery, без второго
алгоритма. Нельзя обещать успех всех моделей/провайдеров: план устраняет доказанные
tooling блокеры, не гарантирует безошибочную реализацию продукта агентом.

Definition of done: H/C/S/N/E/D пункты закрыты кодом или обоснованным сохранением
полезной границы из этого плана; точечные позитивы/негативы зелёные; нет второй
authority, повторной mutation и нового обязательного полного gate; задокументированы
исходы/непроверенные native случаи. Новые EVAL не запущены, старые не изменены.

## 14. Первичные внешние источники

- [OpenCode v2.0.31 runner: Continue и publishSynthetic](https://github.com/anomalyco/opencode/blob/v2.0.31/packages/core/src/session/runner/llm.ts#L272-L279).
- [OpenCode v2.0.31: прерванный начавшийся output](https://github.com/anomalyco/opencode/blob/v2.0.31/packages/core/src/session/runner/step.ts#L248-L256).
- [grpc-js stream decoder: отрицательный receive limit не ограничивает message](https://github.com/grpc/grpc-node/blob/master/packages/grpc-js/src/stream-decoder.ts#L59-L63).
- [Codex hooks: native protocol и ошибки handler](https://learn.chatgpt.com/docs/hooks).

Локальная проверка Codex: `codex/codex-rs/hooks/src/events/pre_tool_use.rs`,
ветка non-2 handler exit, и реальные CP257 hook/tool events. Внешние источники
поясняют контракт; фактическую причину CP257 устанавливают его journal/БД/код,
а не похожий issue в интернете.

## 15. Сквозной readiness review: стадии × упряжки

Повторный проход выполнен по source path, без native/model запусков. Матрицы
ниже фиксируют обязанности и точки проверки, а не утверждение о живом PASS всех
стадий. Установленные CP257 причины — §2; новые подтверждённые аналоги и риски
реализации — H9/H10/N4/E3/E4/S6. Продуктовую корректность агентных изменений здесь
не оцениваем.

### 15.1 Общая цепочка — одна для всех профилей упряжек

`selectControllerExecution` выбирает frozen routing/profile; controller выдаёт
stage command и `bindControllerStageAssignment` в одном общем месте
(`run-controller.ts:968–970`). Отдельный admission на каждую стадию/упряжку не нужен.

| Участок | Что делает существующий flow | Решение/edge cases плана |
| --- | --- | --- |
| Подготовка и baseline | EVAL создаёт изолированный attempt, фиксирует profile/engine/context, готовит subject, выполняет baseline; затем CLI создаёт RUN/controller | Без нового hook/gate/модельной qualification. Native mismatch до productive dispatch; baseline результат, очистка и assessment раздельны. Размерный helper не отбрасывает штатный ответ |
| SPECIFY | Controller уже имеет RUN и root Session, выдаёт assigned stage start; агент работает и завершает/ставит паузу через CLI | Не путать с legacy stage --bootstrap. Assigned entry/settlement без fresh hook; schema/canonical answer coverage остаются. Потеря hook не провоцирует новую сессию |
| HITL / decisions / Judge | EVAL определяет покрытие вопроса и сохраняет ответ; controller выдаёт exact stage resume с pause/WorkSession binding | Decision → confidence/fallback Judge без новой hook-зависимости. Потерянный resume ACK переиспользует accepted answer/outcome; сменившийся pause/control не получает старый ответ. Judge cleanup не аннулирует принятый ответ |
| PROTOCOLIZE | CLI формирует protocol/workspace и successor; controller рассчитывает следующую native route | Проверять существующую workspace route, не требовать fresh hook для assigned entry. При смене launch cwd/profile — новая Session по общей policy, не попытка починить native cwd промптом |
| PLAN | Assigned coordinator формирует план/Work graph/пакеты; CLI проверяет и принимает stage | Hook не парсит план и не делает checks. Текущие packet/attempt/graph guards остаются в CLI; старый packet не даёт полномочия новому циклу |
| PLAN-REVIEW | Assigned coordinator; свежие reviewer Work; приём отчётов; интеграция findings coordinator; stage finish | First child start может быть позже root reply. Native child или independently launched external root используют собственные physical launch bindings. Completed дети не дают автоматический Stage PASS |
| CODE | Work start → реализация → finish/checks → при необходимости зарегистрированный repair → свежий repair executor → повтор приёмки | Checks выполняет CLI вне SQLite transaction, не hook. Реальный отказ проверки возвращается агенту по существующему repair пути; сбой observer не подменяет его. Bootstrap внешнего Codex root сохранить (`external-work-launch.ts:124–125`) |
| CODE-REVIEW | Свежие review Work; CLI принимает decision, регистрирует repair; после repair coordinator повторяет finish с принятой decision | Не переоценивать/переписывать уже принятую decision ради hook. Новый repair child имеет свою identity; старый cycle не получает новый assignment. Учет позднего child одинаков с PLAN-REVIEW/CODE |
| MERGE | Assigned stage start; native-fact merge apply/repair; target lane/checks; либо accepted merge, либо source repair через CODE/review и replacement merge request | Сохранить exact source/target/lease/request. Старый merge receipt не разрешает replacement. Для same_session несовместимый cwd/profile — настоящий route conflict, не hook warning; server mode использует свой executor |
| Terminal / stop_after | Accepted stage → settlement/capture → completed либо stop_target_reached; EVAL фиксирует выбранный completion scope | stop_after=specify означает finished выбранного прогона, не full-case PASS. Не выдавать следующий context. Cleanup pending — технический долг; обязательный capture/assessment pending виден отдельно и не теряет владельца |
| Cancel / техническое восстановление | Текущая generation/control fence, согласование исходной операции, retirement own writers | Не делать blind retry, не снимать human pause. Late accepted Work согласуется по своему obligation, но не завершает Stage. Forced kill доказывает physical stop, не native success |

### 15.2 Нативные различия — только адаптация источника фактов

Все строки стадий выше применяются к каждой строке ниже. Профиль/делегирование
выбираются frozen execution, а не именем модели или hardcoded названием стадии.

| Упряжка | Init/entry и Work identity | Progress/retry/late события | Terminal/retirement |
| --- | --- | --- | --- |
| Codex/Luna | Изолированный CODEX_HOME, app-server thread/root/child. Child agent_id не подменять legacy root session_id; внешний Work root имеет собственный managed hook | Reasoning/text/tools и captured turn/generation; hook failed exit сам не доказывает tool failure. Поздний callback не переносить в новый turn | Observe-only prepare уже отделён от provider phase; не возвращать зависимость finish от PostToolUse. Обе глобальные home-конфигурации сохраняют лёгкий вход |
| ZCode | ACP allocation/native session mapping, PreTool/ACP source-bound tool; один факт с двух каналов не два владельца | Root prompt может вернуть unsettled дерево: children сохраняют creator binding; native retry owner и engine continuation не конкурируют | Убрать bridge.close из pre-publication graceful execution barrier; оставить physical close и registry debt в cleanup. Unknown actual outcome не replay |
| AGY | Native init/conversation/step/execution и daemon hook request; ancestry устанавливается вне ACK | Stop/fullyIdle обязательны как native evidence; >1024 новых событий учитываются. Unknown child fact сохраняется без ложной authority | Snapshot без искусственного receive cutoff; native execution proof до resource inventory/stop; schedules/unknown writers требуют положительного доказательства или physical retirement |
| OpenCode | Private authenticated server/own session+admission message; plugin before хранит exact tool binding | Internal synthetic — нормальное native continuation. After использует original before, а не новое hook.resolve; child/shell completion claims проверяются отдельно | Idle принимается с закрытыми pending tools/inbox/notifications; существующий wait/cleanup phase split сохранить. Physical scope включает также Judge |
| Grok | Native root/subagent и operation hook ledger, не root из arbitrary env | Сохранить creator/session binding после root reply; native retry state учитывается общей capacity policy. Повтор той же assigned команды идёт в прежний CAS | Native settlement отдельно от provider/resource stop уже имеется; hook/failure-notify не отравляет accepted result. Квота/auth errors не превращаются в success |
| Droid — общий sibling | Retained create/load request существует до SessionStart/initialize response; Execute/Task имеют свои source bindings | Не требовать productive runtime.active для init/load. Native progress сохраняется, тяжёлый Execute handler убран; reattach не создаёт новый prompt | Разделить graceful native quiescence и closeTree/registry/auth phases; explicit cancel/forced close сохраняет фактический native unknown/failure |

### 15.3 Общие не-SDLC callers

Descriptor/Memory/diagnostic flow используют тот же controller/CLI, но собственный
frozen descriptor, stage IDs и bundle custody (`controller-execution.ts:22–73`,
`run-cli.ts:1764–1790,1894–1903`, `descriptor-stage-settlement.ts:69–78`).
Consumer native facts не содержит allowlist из семи SDLC стадий и не предполагает
их названия каталогов. Достаточна одна существующая descriptor fixture с произвольным
stage ID для assigned start/finish и native recovery ACK; отдельный новый full-flow
стенд для каждой упряжки не нужен.

### 15.4 Проверка достаточности и границы уверенности

Упрощение покрывает entry, содержательные команды, native children, repair,
HITL, transition, terminal и cleanup; обходные manual/auxiliary/descriptor пути
перечислены отдельно. Часть дополнений — реальные аналоги ошибочного порядка/
сопоставления в текущем коде; EVAL worker/all-role/maintenance уточнения прежде
всего предотвращают регрессии от самого изменения семантики плана.
Проверка исходников не заменяет исполнение будущих точечных регрессий: runtime
не объявляется исправным до реализации и этих проверок. Для начала реализации
дополнительные продуктовые решения или новые модельные пробы не нужны.
