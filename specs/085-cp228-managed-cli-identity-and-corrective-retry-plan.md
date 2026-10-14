# 085 — CP228: managed CLI identity и corrective retry

Дата: 2026-10-14. Статус: реализация A–E завершена и проверена.
Release, installation и новые EVAL не выполнялись.
Ponytail: full. Источник engine beta.137, source 3a1e4cb4.

## Цель и границы

Короткая публичная lifecycle-команда должна одинаково во всех упряжках
разрешаться в уже выданное назначение через доказанный native receipt.
Разрешённый повтор должен исправлять доказанный дефект, а не воспроизводить
ошибочную команду; независимые действия не должны расходовать чужой retry.

Не исправляем продукт, модель или upstream OpenCode. Не раскрываем модели
служебные invocation IDs/контекстные параметры вместо исправления доставки.
Не увеличиваем лимит повторов, не ослабляем ownership/unknown-effect fences.
Исторический OpenCode EVAL остаётся неизменным; работающий ZCode CP228 не
останавливать, не обновлять его runtime/pins/hooks/definition checkout.
Новый запуск и публикация — отдельная авторизованная операция после реализации.

## Доказательства и установленные дефекты

### D1 — OpenCode hook и shell/CLI имеют разную managed identity

EVAL-20261014064006-b05cf5e7, baseline PASS, Stage SPECIFY не начался.
06:41:31.574Z: hook_events #1, короткий stage start, назначение observed.
06:41:33.258Z: PostToolUse failed. 06:41:54.203Z: #3, выданный retry;
06:41:54.707Z failed; ошибка usage/project-root, repeated_without_progress.

Полное назначение a1409f1a-0a31-454e-8925-c37aeedce066 сохранено и observed;
контекст/RUN/project-root не потеряны в БД. publicInvocationArgs намеренно
убирает runtimeOwnedOptions и RUN target. Агент выполнил штатный публичный
вызов, а не самовольно урезал полную команду.

dd-opencode-daemon.mjs isolatedEnv:43 не устанавливает DD_FLOW_DAEMON_ID и
не закрепляет DD_FLOW_BIN. opencode-plugin.mjs shell.create.before удаляет
пароли, но не передаёт managed identity. run-cli.ts:415–450 восстанавливает
назначение только при env.DD_FLOW_DAEMON_ID; CLI пропустил этот путь и дошёл
до обычной проверки обязательного project-root. Плагин уже знает daemonId.

### D2 — общий hook-only retry копирует отклонённый argv

lifecycle-invocations.ts observeLifecycleCommand:439–454 копирует argv,
удаляя маркеры, и выдаёт его как retry_command. При потерянном runtime
контексте это не исправление. CP228 получил ту же неполную для unmanaged CLI
команду; инструкцию «исправь input и выполни exact retry» нельзя исполнить
корректно при отсутствии исполняемого исправления. Общий путь всех harness.

### D3 — тот же разрыв у Droid, загрязнение native окружения

dd-droid.mjs droidEnvironment:42–47 наследует DD_FLOW_DAEMON_ID и не заменяет
его config.daemonId, хотя native hook payload передаёт именно config.daemonId.
Это подтверждённый кодовый аналог D1, не наблюдённый живой EVAL failure.

Синтетическая проверка экспортированных builders с foreign owner/home/bin:
Droid managed оставляет foreign owner; Droid noFlow — все три foreign поля.
AGY sanitizedEnv задаёт owned daemon, но наследует HOME/BIN; Grok isolatedEnv
задаёт daemon/home, но наследует BIN. В noFlow AGY/Grok очищают daemon, но
сохраняют foreign HOME/BIN. Это дефекты pinning/isolation builders; реальные
запуски могли получать правильные пути от wrapper, поэтому не объявлять их
новыми доказанными падениями. OpenCode аналогично наследует foreign owner/bin.
Codex/ZCode устанавливают owned daemon; проверить фактическое объединение
native env и security-only режим, не объявляя их неисправными без доказательства.

### D4 — repeat guard смешивает независимые операции

Hook-only запрос repeated:444 ограничен project/run/generation/operation и
signature, но не fingerprint, Stage attempt и owner/Work scope. Два разных
Work finish с одинаковым validation/input_sha могут блокировать друг друга.
Это кодовый дефект; не причина CP228, где действительно повторён тот же вызов.

### D5 — signature различает не все причины отказа

preparationRejectionSignature:1445 хеширует code/details, не message.
argument-values.ts requiredOption/optionalOption выбрасывают usage без
parameter/reason; различающиеся отсутствующие/пустые опции могут дать одну
signature. command-inputs.ts уже передаёт parameter — использовать его
структурированный подход, а не классификацию по свободному message.

### D6 — correctable не всегда означает исполнимое продолжение

observeLifecycleCommand первоначально выставляет correctable через predicate,
но выдача retry дополнительно требует explicit effect=no_effect и другие
условия. Возможен correctable receipt без successor и без handoff. Это
подтверждённый разрыв ветвей, не наблюдённый CP228. Не путать с законным
fresh_session_required + registered handoff и pending_continuation auxiliary.

### D7 — тестовая цепь разорвана

OpenCode fixture 28/28 PASS при D1: plugin test подставляет observed=true,
не запускает настоящий CLI; admission fixtures заранее задают daemon env.
Hook retry test проверяет строку/повтор для одного WRK, но не выполняет её
и не проверяет независимые Work. Нужна интеграция существующих fixtures,
не новая тестовая платформа и не модельные вызовы для каждой регрессии.

## A. Native environment contract — engine

Файлы: dd-opencode-daemon.mjs, opencode-plugin.mjs, dd-droid.mjs;
проверенные аналогичные builders dd-agy/грок/codex/zcode и их downstream overlays.

1. Managed shell получает из доверенной launch configuration согласованные
   DD_FLOW_DAEMON_ID, DD_FLOW_HOME, DD_FLOW_BIN и заданный RESOURCE_HOME.
   Чужие значения process.env не могут менять эти поля. Не переносить tokens,
   DD_FLOW_CURRENT_INVOCATION или model-supplied IDs как новую authority.
2. OpenCode: pin в isolatedEnv для server spawn и закрепление в существующем
   shell.create.before для фактического shell после любых native overlays.
   Сохранять удаление паролей, остальные env и workdir/timeout semantics.
   writePlugin сейчас передаёт daemon/home/bin, но не resourceHome; добавить
   именно launch config.resourceHome в binding и использовать его в shell
   overlay. plugin SHA рассчитывается из новых bytes штатным writePlugin;
   не копировать прежний SHA. Не добавлять secrets в generated plugin.
3. Droid: owned daemon из config.daemonId в droidEnvironment; тот же pinning
   HOME/BIN. AGY/Grok: добавить отсутствующее pinning уже имеющимися builders.
4. noFlow/security-only: tombstones для inherited managed owner/home/bin и
   managed scope/attempt/runtime-owner keys, учитывая downstream overlay.
   RESOURCE_HOME: сохранить explicit config.resourceHome, иначе tombstone
   унаследованный путь в security-only. Не менять авторизацию native provider.
5. Codex/ZCode: подтвердить managed overwrite/noFlow policy по конечному
   spawn env; изменять только доказанные пробелы. Не создавать универсальный
   env framework ради небольших локальных overlays.
6. Проверить aliases и реальные spawn/restart/reconnect/shell.create пути.
   Server auth env остаётся server-only; owner identity не является секретом,
   но сама по себе без физического binding/native receipt не даёт права мутации.
7. В managed native shell tombstone унаследованные DD_FLOW_INVOCATION_SCOPE,
   DD_FLOW_CURRENT_INVOCATION и чужой DD_FLOW_RUNTIME_OWNER; runtime-owned
   owner допускается лишь из собственного config (как у ZCode). Не переносить
   controller/control tokens в model tools. Не удалять CODEX_HOME, provider
   login и unrelated пользовательское окружение. Путь nodeBin остаётся
   launch-bound hook launcher; не менять разрешение native provider binary.
8. Пустые/неполные managed config не исправлять process.env fallback: existing
   startup validation отклоняет неполную пару home/bin и missing daemon.
   doctor/version/noFlow без managed launch должны работать без такой пары;
   не переносить managed validation на non-generative utility вызовы.

## B. CLI admission и error/retry contract — shared engine

1. Переиспользовать cliManagedInvocationScope → observedLifecycleNativeEvent
   → observedLifecycleInvocation → resolveObservedLifecycleArgs. Не угадывать
   назначение по «последней записи», cwd, одному run_id или произвольному UUID.
2. Когда есть exact observed managed assignment, но shell потерял required
   runtime binding, сохранять explicit transport/context tooling cause,
   no_effect, recoverable=false и без retry. Не делать новый successor из
   hook-only наблюдателя и не потреблять observed assignment как выполненный.
   Correlation только из exact native event/assignment; отсутствие или
   неоднозначность proof остаётся fail-closed, не глобальный поиск по команде.
   Использовать существующий invocation_scope_unproven с safe structured
   reason=managed_shell_context_missing, не новый taxonomy/framework.
3. Обычный preparation rejection доказанно связанного назначения обслуживает
   существующий settleLifecyclePreparationRejection/successor path. Проверить
   атомарное settlement + единственный successor, стабильный private contract,
   re-delivery того же native event без нового права выполнить действие.
4. Hook-only retry сохранять только когда input действительно исправим без
   изменения командной authority: например содержимое указанного файла.
   Для missing/invalid literal CLI arguments без retained assignment не
   объявлять старый argv исправляющим retry. Возвращать честный отказ с
   parameter/reason; не придумывать отсутствующие значения. Совместимость
   legacy объясняется диагностикой, а не bypass managed admission.
5. correctable публиковать только при существующем executable successor или
   доказанном registered handoff/repair continuation. effect=unknown и
   committed без explicit continuation никогда не дают повтор. Preserve
   pending_continuation auxiliary, repair gating и storage retry policy.
6. Проверить всех callers/issuers: observeLifecycleCommand,
   settleLifecyclePreparationRejection, settleLifecycleRejection,
   retryLifecycleInvocationCommand, managedLifecycleCommand;
   vnext-plan-review capacity retry требует сначала capacity record и не
   является немедленным corrective replay. Не менять его семантику без дефекта.

### Точное решение для потерянного контекста и legacy

- Место enforcement — существующий CLI early-error settlement /
  observeLifecycleCommand: там уже переданы exact nativeEvent и anchor.
  По event_key проверить единственный привязанный observed invocation и его
  identity/scope. Это read-only диагностика, не право исполнить команду.
- Только если эта запись доказывает managed assignment, а CLI не получил
  согласованный daemon binding, заменить наружную/retained primary ошибку на
  invocation_scope_unproven / managed_shell_context_missing. Исходный usage
  оставить safe cause (code/parameter/reason), zero effects, fatal disposition,
  no retry. Не помечать observed assignment успешным/consumed и не менять
  historical receipts. Controller прекращает RUN штатной stop/cleanup логикой.
- Отсутствует exact marker/receipt — нельзя разыскивать похожее назначение
  во всей БД ради восстановления или обвинения transport. Оставить исходную
  structural/input ошибку без выдуманного successor. Существующие native
  correlation ограничения не расширять; одинаковые команды не выбирать latest.
- Полностью потерянный DD_FLOW_HOME тоже нельзя восстановить по cwd или
  сканированию homes. Он предотвращается A и диагностируется adapter smoke;
  ошибку без доступного owned store не превращать в доказанный managed failure.
- Legacy hook-only вызов с доказанным owner, но без issued assignment может
  исправить лишь явно external input (result-file/schema/etc). Bare usage,
  missing literal value и structural argument mismatch не получают exact
  retry старого argv. Сохранить native pre-CLI shell-form correction отдельно:
  это исправление формы запуска до effect, не lifecycle successor.
- Все retained successor/receipt mutations остаются в existing writeTransaction:
  crash до commit не публикует successor, crash после commit возвращает тот же
  successor; double hook delivery не создаёт второй. Persistence failure имеет
  собственную диагностическую ветвь и никогда не обещает recovery без receipt.

## C. Repetition identity и структурированные причины — shared engine

1. Hook-only repeat key: project/RUN/generation + operation/public fingerprint
   + native owner Session/Work binding + Stage attempt. Одинаковый дефект того
   же действия/attempt прекращает повтор; независимый WRK/Stage attempt нет.
   Не добавлять event ID в ключ — каждый повтор имеет новый native event.
2. Existing lifecycle_invocations scope+fingerprint используется как основа;
   не создавать второй retry registry. При отсутствии attempt/owner proof не
   считать случайные historical errors свидетельством повторения этого caller.
3. В shared argument-values и equivalent requiredScope/alias validators
   добавить safe details.parameter и стабильный reason (missing/value/empty,
   invalid-number/enum/duplicate). Сохранить текст/exit code для compatibility.
   Не писать сырые значения, credentials и полный argv в error details.
4. Signature строить из стабильной структурированной причины и evidenced
   input revision; volatile IDs, generated retry, время и формат message не
   должны превращать одинаковую ошибку в «прогресс». Разные parameter/reason
   не сливаются. Existing canonical normalizer переиспользовать.

### Конкретный repeat key и compatibility

- Hook-only: сравнивать existing JSON поля project_id/run_id/generation,
  operation/fingerprint, harness/session_id, stage/attempt; missing nullable
  stage/attempt сравнивать явно null-safe, не SQL '= NULL'. Fingerprint
  сохраняет Work target и не включает hook/event UUID; controller_turn не
  включать — неизменный повтор в следующем Turn не является прогрессом.
- Owner Session берётся из committed native anchor, не из текста модели.
  Fresh Session для registered handoff получает собственный retry budget;
  произвольный новый tool event в той же Session не сбрасывает бюджет.
- Старый receipt без этих scope fields не доказывает repetition текущего
  caller. Его исходный fatal outcome сохраняется; не мигрировать/переписывать
  receipt ради получения права повторить. Новые строки имеют полный ключ,
  отдельная SQL таблица/DB migration не нужна.
- Argument helpers: reason vocabulary missing_required_option,
  missing_option_value, empty_option_value, invalid_number, invalid_choice,
  duplicate_option; parameter — имя опции или sorted список permitted aliases
  для requiredOptionOneOf. command-inputs и equivalent run-cli helper должны
  использовать те же значения. Message не включать в signature.
- Не добавлять volatile lifecycle IDs/время/retry flags в причинную signature;
  различение input revision использовать из уже доказанного input SHA, не
  arbitrary model «revision». Failed same effect с изменённым файлом допускает
  новую проверку; два подряд одинаковых rejected inputs — остановку.

## D. Runnable verification и acceptance

Использовать существующие node:test/Vitest, без новых dependencies.

- Native env parameter table: OpenCode/Droid/AGY/Grok/Codex/ZCode, managed и
  security-only; hostile inherited daemon/home/bin/scope; correct owned values
  после конечного overlay; auth и unrelated env preserved, server passwords
  absent из OpenCode shell.
- Основная OpenCode регрессия: настоящий issued assignment, short rendered
  Stage start, настоящий hook, shell env из production builder/plugin и
  настоящий runCli. Не задавать managed fields вручную в CLI fixture. Проверить
  restored RUN/root/context/sha/response, one effect и settled receipt.
  Проверить отдельные first-call и returned retry, commandWithHookEvent
  updatedInput, actual child env (undefined tombstones не resurrect после
  merge с process.env). Тест обязан падать при удалении daemon pin, даже если
  hook mock по-прежнему возвращает observed=true.
- Droid аналог через actual droidEnvironment и общий CLI admission fixture.
- Отрицательные: foreign/stale/missing daemon, чужой Session/generation/root,
  неоднозначное назначение, changed private context, security-only; zero effects,
  no fabricated successor. Exact same native event replay — no new effect.
- Corrective retry выполнить end-to-end: неверный authored input → no_effect
  rejection → исправленный input → exact issued successor → успех; изменение
  expected input sha сохраняется; old consumed invocation не выполняется снова.
- Два независимых Work с одинаковым validation/input_sha не блокируют друг
  друга; identical unchanged same-Work retry блокируется; новый Stage attempt
  не наследует retry старого. Different missing options distinct signatures.
- correctable без successor/handoff запрещён; registered fresh-session/repair
  handoff остаётся рабочим. Unknown effect и failed persistence не дают replay.
- Обновить слабые string-only assertions, а не плодить дублирующие mock suites.
- Gates: typecheck/lint/build; targeted native-adapter/lifecycle/admission;
  release-sensitive tests и полный project gate перед release по runbook.
  Не подменять успех полного gate результатом одного fixture.
- Дополнительные edge cases: absent/empty/inline/duplicate option; пути с
  пробелами; trusted workdir не равен projectRoot; parallel WRK siblings;
  same native tool-call re-delivery vs новый call; same Stage name в новом
  attempt; changed generation; cancelled/expired owner; noFlow после managed
  процесса; daemon reconnect не усваивает owner предыдущего запуска.
- Native smoke OpenCode 2.0.28: только изолированный технический home/server,
  через documented native shell API/hook получить safe env sentinels без
  prompts/model calls; остановить лишь созданный probe tree. Если API требует
  модель, не считать mock проверкой native API: smoke пометить blocked,
  implementation gates остаются детерминированными, scored запуск не начинать.

## E. EVAL diagnostics — контроль consumer, без продуктовой правки

Проверен lib/runner.mjs isInfrastructureFailure: invocation_scope_unproven уже
классифицируется как infrastructure. Generic usage туда добавлять нельзя:
неверный authored CLI input не равен неисправности адаптера. Для нового
structured transport reason проверить retained controller.error → diagnostics
→ attribution/report/stop policy на существующем пути 083. Добавить regression
fixture только если текущие тесты не покрывают этот exact nested cause.
Не переоценивать автоматически historical CP228 и не править Judge результат.

## Порядок реализации и готовность

1. Regression D1/D3 и независимый repeat/structured signature tests падают
   на beta.137 исходниках — зафиксировать воспроизводимость.
2. A: точечные native env fixes, D1/D3 проходят без CLI bypass.
3. B/C: общие retry/diagnostic invariants, negative/continuation tests.
4. D: полный review diff и gates; docs с коротким native env contract.
5. Коммит/пуш/мерж по правилам engine; определение продукта и historical EVAL
   не меняются. Release/pins/install/new EVAL — только следующая задача.
   Изолированный native shell smoke без модельных вызовов входит в эту проверку.

Done: все D1–D7 закрыты проверками соответствующего уровня, нет новых
authority/replay paths, реальные shell env согласованы с hooks, независимые
Work не взаимно блокируются, отказ missing transport отличим от ошибки агента.

Ponytail review: использовать существующие scope/receipt/successor validators,
builders, transactions и fixtures; не добавлять framework/registry/dependency,
не дублировать полную служебную команду в промпте, не расширять retries.
План готов к реализации: решения по env precedence, noFlow, exact diagnostic
correlation, legacy retry, repeat scope, structured cause и crash/replay приняты.
Native v2 shell env smoke имеет явный критерий результата; это не скрытая
предпосылка и не повод расходовать модельные вызовы или трогать живой EVAL.

## Дополнения при реализации и независимом review

- Inline `--hook-event-id=...` сохранялся при построении hook-only retry:
  successor мог повторно использовать старый immutable native marker.
  Удаление обеих форм маркеров и regression включены в B/C.
- Exact event re-delivery после более позднего отказа пересчитывал retry budget
  и конфликтовал с первым outcome. Возвращаем первый committed receipt при
  той же доказанной причине, а не выдаём новое право выполнения.
- Persistence rollback мог сохранить recovery promise в fallback diagnostic.
  Failed persistence никогда не публикует recoverable/successor authority.
- Stale inherited DD_FLOW_HOOK_DEADLINE_AT — request-scoped contamination:
  native launch его очищает. Пустой JSON-safe shell tombstone означает absence,
  числовой истёкший deadline текущего запроса остаётся действующим отказом.
- OpenCode native shell проверен после readiness barrier: typed undefined
  overlay и существующее удаление server passwords работают. Предположение
  о native JSON resurrection не подтвердилось и усложнение удалено.
  Invocation/control keys очищаются, auth providers не меняется.
- Native shell API может ответить раньше инициализации plugins; smoke сначала
  подтверждает dd-flow/dd-flow-security active через plugin.list. Начальные
  probes без этого barrier не считаются PASS и не доказывают plugin defect.
- ZCode прежний managed PATH fallback удаляется: нужен explicit dd-flow-bin,
  как у остальных контролируемых запусков. Non-generative/noFlow не требуют
  managed пары. Работающий CP228 использует свой frozen installed runtime.
- Малый pure managedFlowEnv overlay переиспользован семью callers вместо
  семи копий списка tombstones; это не новый env framework или authority layer.
- Неверный literal numeric/enum input остаётся не retryable в hook-only пути,
  но не отбирает законный successor, уже committed issued assignment. Точное
  соответствие native event/settled outcome проверяется отдельно.
- Supported legacy semantic-file/data и другие declared file inputs сохраняют
  безопасное исправление external input; unsupported result-file для custom
  flow не выдаёт бесполезный retry. Перепроверены реальные AGY CLI fixtures.
- Branch-ready flow-status выявляет существующий project-pack 2.18.0 drift
  (missing specifications и old engine range). Named DEF-079 расширен лишь на
  source integration 085; pack не исправлен и gate не объявлен зелёным.
- Supported literal `cd <workspace> && lifecycle-command` терял каталог в
  hook-only correction после нормализации CLI argv. Exact receipt route
  сохраняется только при trusted provenance и физическом подтверждении cwd
  CLI; неподтверждённый маршрут не получает retry. Путь shell-escaped.
  Проверка ограничена explicit literal route: обычный native cwd не сравниваем
  с cwd embedded CLI и не подменяем его validation errors. Это поймано полным
  suite и проверено повтором lifecycle + PROTOCOLIZE (180/180 PASS).
- В тесте восстановления двух runtime homes preparation ожидалось отдельные
  60 секунд, хотя fixture выполняет четыре cold deny-admission probes.
  Используется уже существующий readiness envelope fixture, согласованный
  с аналогичным тестом; production timeout/ownership не меняются.
- Stale-artifact test при неожиданном возврате receipts удалял детали abort
  до расследования. Добавлены bounded identity/status/abort_reason/stderr
  diagnostics без ослабления исходного rejection assertion. Точная причина
  первоначального infrastructure abort не сохранена; production defect не
  заявляется. Повтор всего code-checks файла: 64/64 PASS.
- Retained-owner fixture ZCode требовала прежний неполный overlay без home/bin.
  Исправлен полный managed launch contract и independent owner/daemon/scope
  assertions; весь harness-runtime-assets файл: 85/85 PASS.
- Native fixture Grok также дополнена mandatory bin; schedule registry test
  учитывает новый env fixture. ZCode pre-allocation rejection исключается из
  cleanup candidates только после typed flow_context_incomplete и доказанного
  отсутствия daemon state. Неизвестные попытки и crash evidence сохраняются;
  общий cleanup guard не ослаблен. Failure-only diagnostics показывают точные
  ошибки Aggregate вместо одного непрозрачного predicate false.

## Результаты проверки реализации

- Общий engine integration прогон: 2435 cases, 2428 PASS / 7 FAIL в четырёх
  файлах. Исходный failed outcome сохранён; не объявляется единым зелёным gate.
  Все семь случаев закрыты финальными проверками: two-homes 1/1,
  code-checks 64/64, runtime-assets 85/85, lifecycle + PROTOCOLIZE 180/180.
- Полный dd-eval suite: 820 PASS, 10 optional SKIP, 0 FAIL (830 cases).
  Final consumer fixture native-failure083: 7/7 PASS.
- OpenCode 2.0.28 native managed/security-only shell smoke: PASS после plugin
  readiness, 0 model calls; собственные probes остановлены в finally.
- Final source: typecheck, lint, strict-canon build и diff-check PASS.
  Release tests: 2 node + 8 Vitest PASS; runtime-sensitive 47/47 PASS
  (с подтверждёнными native fixture summaries), CLI admission 170/170 PASS.
  В consumer chain нет CLI bypass или нового command/authority registry.
- Branch-ready project-pack status остаётся отдельно deferred по DEF-079,
  не объявлен PASS. Source integration выполняется через feature PR/squash,
  без изменения существующих diverged local main или active CP228 checkout.
