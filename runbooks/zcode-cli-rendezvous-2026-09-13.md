# ZCode: точное подтверждение вызова внутри CLI

Статус: production CLI probe PASS для root/concurrent children/child continuation; native reattach/read PASS. Beta.53 опубликована и проверена, checkpoint cp-101 подготовлен; остаются preflight Luna/ZCode. E2E-ready до их результата не подтверждено. Полный E2E не запускался. Этот документ заменяет требование получить новую сборку ZCode с child hooks из раздела 2 исходного reliability-плана.

## Ход реализации, 2026-09-13

Реализована и проверяется общая граница: persistent lifecycle_invocations в flow DB,
явная issuance, точная привязка native identity, совместный commit с existing
hook receipt, bounded async wait без удержания write transaction, один владелец
исполнения, сохранение и повторное чтение outcome. CLI принимает invocation-id;
ZCode ACP endpoint использует этот путь только для подготовленной попытки.
Native hook не создаёт второй receipt для такой команды.

Адаптер получил отдельный отслеживаемый обработчик lifecycle receipts, не
зависящий от secondary evidence queue. Parent устанавливается через владельца
native parentToolCallId; неизвестный parent отклоняется. Восстановление таблицы
владельцев читает сохранённые inbound events только выбранной ACP Session.
Локальный regression использует вложенную topology и искусственно остановленную
secondary очередь. Это синтетическая проверка, не live nested qualification.

Проверено: 36 тестов invocation storage + shell boundary; после подключения
ACP — 48 тестов invocation/native observer/runtime cutover. Typecheck, lint и
build прошли на промежуточном состоянии. Это не полный release gate.

**Проверенная реализация; release acceptance ещё открыт:**

Финальная локальная сверка: lifecycle/observer 18 PASS, runtime-cutover 40 PASS,
controller/capture/recovery 43 PASS; typecheck и lint PASS. Общий dd-eval набор
owner/reattach/HITL/events/evidence: 122 PASS, 5 optional real-CLI integrations
SKIP без DD_EVAL_TEST_FLOW_CLI. Затем все пять запущены отдельно с настоящим CLI:
5 PASS, включая client exit, killed observer, восстановление owner и изоляцию
соседнего EVAL. Итого 127 разных dd-eval проверок PASS. Provider/E2E не запускались
этими тестами. У двух detached-worker тестов поднят только
test deadline с 8 до 30 секунд: реальный цикл занимает около 5–9 секунд;
runtime retry policy не менялась. Исторический неуспешный прогон не скрыт.

Native reattach/read probe PASS:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-reattach-read-ZcMEbN`.
`tools/probe-zcode-invocation-reattach.mjs` восстановил прежний root через
session/resume, другой observer daemon принял только чтение settled ID;
полные таблицы Work/attempts/receipts до и после совпали. Это проверка текущей
сборки, не опубликованного пакета и не продуктивного RUN recovery. Первый
resume timeout сохранён в XQd4yy; второй опыт AHK9u6 использовал старый
beta.52 engine snapshot из home и закономерно не содержал нового read fix.
Для диагностического повтора явно выбран текущий build через engine mode;
старый snapshot не переписывался. Итоговый package preflight будет отдельно.

Копии успешных native evidence сохранены вне временного каталога:
`/Users/deksden/.dd-eval/conformance/lifecycle-invocations-2026-09-13/`
(`production/`, `reattach-read/`, `eval-tests.log`, `eval-real-cli-tests.log`).
Это диагностические доказательства, не candidate checkpoint продукта.

Первый полный gate на `0976f2e` (0.9.0-beta.53),
https://github.com/deksden-com/dd-flow-cli/actions/runs/34733282357,
завершился до публикации: 623 PASS, 9 FAIL. Причины — тестовый AppContext без
обязательного env (5), две проверки старого вида shell quoting, ожидание
удалённого Grok ACP writer и fake ZCode без квалификации. Production admission
не ослаблен: fake binary сначала проверяется на отказ, затем только в fixture
doctor подменяется стандартным Node module mock для проверки daemon ownership.
Точечный повтор: 10 PASS; исторический gate сохранён как неуспешный.

Новый CLI release commit: `5776e35f9dd0d7359e64cde53317aef202cdc54b`, версия
по-прежнему 0.9.0-beta.53 (публикации ещё не было). Обязательный gate на этом
коммите: https://github.com/deksden-com/dd-flow-cli/actions/runs/34733974857.
Это повтор после FAIL, не дублирование успешного gate. Используется OIDC и
фиксированный canon `ef349bf47cba1c987468e51d73a0dbadbd48dc1f`; итог ожидается.

Второй job остановился на lint до build/test: в новом test fixture пропущен
явный импорт URL из node:url. Импорт добавлен, полный локальный lint PASS.
Текущий release commit `db14065`, job
https://github.com/deksden-com/dd-flow-cli/actions/runs/34734083263.
Версия всё ещё не опубликована; исходный runtime fix не изменился.

Итог третьего job: SUCCESS, 55 файлов / 632 теста PASS. Beta.53 опубликована
из `db14065f43f320bc69dacbec425cd04eac8236ae`; annotated tag v0.9.0-beta.53
указывает на тот же commit, dist-tag beta=0.9.0-beta.53 (latest=0.8.0).
Отдельная установка публичного npm-пакета, проверка build/canon identity,
status compatibility и full-content digest PASS. Digest:
`16dad1459a0ec0e5a81e5583b3e5de391609cb0603a290e10b257219ff22305f`.
Receipt: `/Users/deksden/.dd-eval/qualification/cp-101-luna-zcode/published-package-verification.json`.
Checkpoint cp-101 сохраняет прежние source commit/tag и flow-pack commit;
меняется только опубликованный engine. Дальше — preflight двух прежних
run profiles с тем же абсолютным entrypoint из этого receipt, без provider Session.

Обновление после native qualification: повторный production probe PASS,
артефакты `/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-production-rkPvjV`.
Три Work завершены, шесть start/finish имеют успешный сохранённый outcome;
проверены разные нативные Session, физические parent IDs в receipt и SQL-связи,
ровно два child, SendMessage continuation, отсутствие running topology.
Native nested children не поддержаны текущим child toolset; этот опыт
не квалифицирует их и не подменяет их плоским деревом.
Предыдущий nested-experiment остаётся FAIL в истории, не переписан в PASS.

Doctor теперь квалифицирует cli-invocation@1 только для проверенного tuple:
ZCode sha256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`,
zcode-acp commit `43f654bccdbb1aa4f4fb4617f7315c4336dbcde0`,
`dd-zcode-harness@1`. Текущий doctor вернул compatible=true; неизвестный
native hash, bridge commit или contract остаётся unqualified. Regression
проверяет все три изменения tuple. Это capability admission, не утверждение
о завершении release qualification всей системы.

Закрыто расхождение с cooperative pause: invocation admission использует
существующие captured WorkSession/Stage settlement admissions при drain;
новое или заменённое исполнение не получает исключения. Тест на настоящей
DB проходит. Дополнен список conclusive retry rejections для schema/evidence/
document validators; registry/ownership/unknown outcome retry не получают.

Уточнение после сквозной интеграции command producers: issuance подключена к
stage/Work/HITL-командам, controller, external Work launcher и MERGE dispatcher.
Scope берётся из сохранённой managed daemon Session; дочерний внешний launcher
сбрасывает родительский scope, включая mixed-harness случай. Повторная выдача
сохраняет ID; исполняющаяся попытка может вернуть один явный successor.
Read-only ветка не создаёт таблицу/попытку. Исправимые ошибки возвращают
retry_command; ошибка подготовки retry больше не мешает сохранить первичную
ошибку. Whitelist сверён с schema/evidence/document validators; неоднозначные
исходы и ошибки authority не получают автоматического retry.

Проверки этого этапа: invocation/observer 12 PASS; затем 44 PASS и одна
регрессия SPECIFY в наборе invocation/external-launch/SPECIFY. Регрессия
исправлена: Finish снова читает specify-result.json, а не итоговый specify.json;
точечный повтор упавшего сценария PASS. Добавлен тест на настоящий RUN/Work,
короткий Work alias и отказ при чужом RUN/поколении. Typecheck PASS до последнего
исправления пути. Это не release gate и не live qualification.

Recovery acceptance теперь возвращает lifecycle_recovery отдельно от
неизменённого original_prompt. Неисполненные команды получают новый scope/ID;
executing/unknown не получают автоматического retry. При повторном recovery
выбирается последняя сохранённая попытка того же действия, а не устаревшая
issued-запись из первоначального prompt. Возвращается work ls с текущим scope.
Regression проверяет heredoc, стабильность повторного ответа, отказ чужому
root, подтверждённый retry и второе recovery после начала новой попытки.
Три прежних snapshot/recovery-сценария и новый recovery regression PASS.

Добавлена scope-проекция lifecycle_invocations в recovery snapshot вместе с
связанными receipt, включая ещё не привязанные к WorkSession события. Иначе
первый populated snapshot отказал бы с snapshot_scope_unknown. Новый eval
import сохраняет эти записи в lineage и удаляет их из исполняемой authority.
Проверка scoped export добавлена на реальную DB: соседний RUN не экспортируется,
его исходная запись не меняется. Полный ZCode acceptance/native recovery ещё
нужно проверить; синтетические helper-тесты не заменяют эту квалификацию.

- Issuance, сохранение команд, явный successor/retry и managed scope реализованы
  в controller, external launcher, merge dispatcher, stage/Work/HITL producers.
  Отдельный DB regression проверяет сохранённую daemon/root/generation identity,
  чужие RUN/Session и очистку родительского scope при mixed-harness dispatch.
- Legacy recent receipt lookup теперь разрешён только codex-desktop и
  antigravity-cli. Grok/ZCode/OpenCode/Droid и неизвестный harness не получают
  этот fallback; параметризованный regression проверяет общую границу.
- Native root/concurrent/child-continuation qualification и замена doctor
  выполнены. Отдельно сверить сквозной managed daemon/recovery путь и итоговую
  матрицу исходного reliability-плана; не считать SendMessage доказательством
  перезапуска daemon или полного E2E.
- Финальный согласованный gate, release/package verification, checkpoint и
  непроизводительный eval preflight. Ни релиз, ни новый E2E пока не выполнены.

## Что проверено

### Production CLI probe, 2026-09-13

Инструмент `tools/probe-zcode-production-invocations.mjs` использует собранный
CLI, штатный prepareHarnessFlowExecutable, настоящий временный RUN/Work store
и production zcodeInvocationObserver. Артефакты:
`/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-production-UMsGIE`.
Все четыре Work завершены, восемь start/finish попыток settled. Root и два
одновременно запущенных child прошли lifecycle без child hooks. LEFT после
первого ответа был продолжен root через SendMessage и выполнил Finish.

**Probe в целом FAIL; E2E-ready этим не подтверждено.** Запрошенный nested
запуск не состоялся: child вернул отсутствие Agent tool, после чего root
сам запустил третий child и продолжил LEFT. Физически это плоское дерево.
Нельзя объявлять nested qualification успешной по логической Work-иерархии.
Нужно скорректировать диагностический сценарий: запретить root подменять
недоступную child-операцию, отдельно проверять поддержанные root/concurrent/
child-continuation capabilities. Исторический результат не переписывать.

Первое assertion также ошибочно сравнивало provider_parent_session_id с
нативным ID. В действующем SQL-контракте это внутренний ключ Session для
ребра физического дерева (usage и run-control соединяют его с session_id).
Нативный parent отдельно сохранён в invocation identity_json. Поэтому
значение SES-* само по себе не дефект и менять формат столбца нельзя.
Предварительная гипотеза о потере native parent этим опытом не подтверждена.

Воспроизводимый инструмент: `node tools/probe-zcode-cli-rendezvous.mjs` из dd-eval. Использованы текущий установленный zcode-acp и штатный ZCode, без preload, изменения приложения или пользовательской hook-конфигурации. Две команды в пустом временном каталоге: root Bash и один foreground child Bash. Никакие dd-flow lifecycle mutations не выполнялись.

Артефакты опыта: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-zcode-rendezvous-80j9iZ`. Каталог временный; здесь сохранён основной результат. `adapter.events.jsonl` содержит полный обмен, отдельные started/receipt/result JSON — отметки времени.

| Случай | Native tool event получен, epoch ms | CLI начал ждать | Подтверждение записано | CLI продолжил |
| --- | ---: | ---: | ---: | ---: |
| root | 1789260412162 | 1789260416078 | 1789260417118 | 1789260417146 |
| child | 1789260429783 | 1789260430004 | 1789260431043 | 1789260431094 |

Обработчик специально ждал появления CLI started marker и затем ещё 1 секунду. Таким образом receipt не мог быть выдан до запуска CLI. Оба вызова завершились успешно; session/prompt вернул end_turn, topology.running пуст, один child завершён со status success.

- Root Session: `aed5a995-cfb2-4739-abc1-0781462d9dcc`.
- Child Session: `sess_subagent_agent_6a4e75ef-8d9e-4f5b-b58b-d343e0e1c57e`.
- Child native metadata: source=subagent, agentId=`agent_6a4e75ef-8d9e-4f5b-b58b-d343e0e1c57e`, parentToolCallId=`call_766508506cf54dca91e3138a`.
- Native topology независимо вернула тот же childSessionId и родительский toolCallId.
- Translator zcode-acp копирует эти поля из native payload (`zcodeRuntimeMeta`), а не получает их из текста ответа модели.

Вывод ровно в пределах опыта: tool-start notifications root и foreground child доступны, пока соответствующая команда ещё выполняется. Циклической зависимости «получить событие только после завершения CLI» в проверенном пути нет. Опыт не доказывает production SQL atomicity, crash durability, background/nested/resumed child или отсутствие любых задержек очереди. Marker использует atomic rename, не имитирует production DB commit/fsync.

## Выбранный механизм

Использовать **заранее выданный ID попытки + native tool event + ожидание внутри CLI**. И root, и child ZCode идут одним путём. Хуки и знание моделью childSessionId не требуются.

1. Flow при подготовке конкретной lifecycle-команды выдаёт уникальный `invocation-id`. Это идентификатор корреляции, не удостоверение личности и не заранее принятый receipt. Сохранить scope: project/RUN/Work/operation/recovery generation, разрешённый controller и известный владелец Session, если он уже есть. Для bootstrap Session ещё может быть неизвестна. Повторный показ уже выданной команды сохраняет тот же ID; read-only status не создаёт новые попытки.
2. Агент выполняет выданную команду с этим ID. CLI проверяет существование и scope попытки, затем ждёт подтверждения вне SQLite write transaction и lifecycle/owner locks. Help и немутирующие команды не ждут подтверждения.
3. Адаптер принимает native tool-start event и разбирает только настоящую standalone lifecycle-команду общим parser. Текст prompt инструмента Agent, stdout и tool-completion не считаются вызовом Bash. По ID связывает попытку с `(harness, daemon, physical session, tool-call)` и сохраняет receipt в существующей flow DB. Нельзя выбирать latest/recent похожую команду.
4. Родитель определяется по native parentToolCallId и сохранённому владельцу этого tool call / native topology. ACP envelope root — точка маршрутизации, не доказательство непосредственного parent. Если immediate parent для nested child неизвестен, не подставлять root: сохранить диагностику и не допускать операцию, которой эта связь необходима.
5. После commit CLI повторно проверяет актуальность Work, generation, control state и Session ownership, атомарно занимает попытку для исполнения и использует существующий lifecycle/receipt механизм. Нельзя держать транзакцию открытой во время ожидания, provider I/O или проверок Work. Existing result-intent/settlement recovery переиспользовать; не объявлять exactly-once внешних эффектов.
6. Deadline ограничивает ожидание доставки. При отсутствии/отказе подтверждения — структурированная ошибка с invocation ID, последним наблюдением и стадией доставки; lifecycle state не меняется. Просроченная или superseded попытка не оживает от позднего события. Потеря ответа после admission — другой случай: сначала выяснить сохранённый outcome, не генерировать новую попытку вслепую.

Повтор того же native event идемпотентен. Другой tool call с уже связанным ID не получает новый допуск. Для settled попытки observer не пишет новый receipt: CLI только читает сохранённый outcome, в том числе после reattach. Второй CLI с тем же ID не исполняет операцию второй раз: получает сохранённый outcome или явный in-progress/unknown. После подтверждённого неуспешного исхода, например исправляемого work_checks_failed, flow выдаёт новую команду с новым ID; предыдущая остаётся в истории. Отдельные finish/fail/pause/resume имеют отдельные попытки. Нельзя переиспользовать один Work ID в качестве ID всех вызовов.

## Минимальные изменения в коде

- `dd-flow-cli/src/services/hooks.ts`: переиспользовать receipt validation/claim и общий lifecycle parser. Добавить отдельный путь подтверждения наблюдённой команды: не выдавать ACP за PreToolUse, не смешивать `invocation-id` с native `hook-event-id`.
- `src/storage/database.ts`: связь подготовленной попытки с existing receipt, уникальные ограничения попытки и native identity. Для ожидающей попытки не заполнять выдуманную provider Session; схема должна явно различать issued и observed. Не создавать второй event store.
- `src/cli/run-cli.ts` и единый helper lifecycle admission: bounded async wait перед mutation, повторная проверка после wait; общий путь для bootstrap/session register, stage lifecycle/HITL, work start/finish/fail, recovery accept. Существующие не-ZCode hook transports сохранить.
- `src/services/work-registry.ts` и остальные generated command producers: выдавать подготовленные команды через один helper; issuance при подготовке/разрешённом retry, не новая попытка при каждом show/status. Command templates и stdin heredoc остаются прежними, добавляется один служебный флаг.
- `src/harness-runtime/lib/dd-zcode.mjs` и daemon: receipt registration не должна стоять за медленными model/evidence callbacks в общей notification chain. Небольшой отдельный обработчик только scoped lifecycle events с durable error/result; все обещания отслеживаются и дренируются при close. Не создавать брокер, не распараллеливать всю evidence очередь. Handler не ждёт завершения CLI или session/prompt.
- `zcode-acp` менять лишь если regression покажет, что native ancestry теряется при переводе. Root/foreground child нужные поля уже передаются; пока дополнительный IPC и permissions bridge не нужны.
- Doctor после qualification проверяет реальную capability выбранного механизма. Убрать требование child hooks и отказ только по версии/hash, когда production-путь подтверждён. До этого не снимать текущий fail-closed барьер и не объявлять E2E-ready.
- Отказы admission — существенные ошибки затронутой операции, а не только secondary evidence warning. CLI fail-closed остаётся последним барьером; reporter/controller явно фиксирует источник отказа. Потеря вторичной model evidence отдельно остаётся incomplete.

## Достаточная квалификация перед новым E2E

Локальные поведенческие tests на настоящей flow DB: delayed receipt до/после старта CLI; timeout/late delivery; duplicate event; другой Session/tool с тем же ID; конкурентный claim; stale recovery generation; pause/cancel во время wait; bootstrap; quoted heredoc; help; допустимый retry после checks failure; restart между receipt/claim/settlement. Проверять состояние, отсутствие повторных эффектов и отсутствие удерживаемого write lock во время ожидания. Один параметризованный набор на общей границе, не дублировать весь gate для каждой команды.

Один короткий native qualification probe после интеграции: root + два child, доступные background/resume/nested пути и точный immediate parent. Проверить события до завершения CLI и отсутствие зависания под искусственно медленным secondary evidence callback. Неподдерживаемую topology/capability обозначать явно, не обещать её по результату foreground spike.

Далее один финальный release gate, публикация/проверка пакета и checkpoint по исходному плану. Полный E2E — отдельный согласованный запуск, не часть текущего диагностического опыта.

## Почему не другие варианты

- ID от основной модели: лишняя координация и ненадёжный источник; native event уже даёт связь с child.
- Исправление закрытого ZCode bundle / preload: не нужно для проверенного обхода, не поставлять.
- Hooks только root, другой допуск child: два поведения без необходимости. Для ZCode выбрать один writer; root hook не должен параллельно создавать второй receipt.
- Permission broker: требует смены yolo-политики и расширения origin propagation; не нужен, пока native notification + CLI wait работает.
- Увеличить recent-match окно: задержки и неоднозначность остаются; exact ID устраняет сопоставление по времени, а deadline только ограничивает ожидание.

Ограничение доверия прежнее: это протокол надёжного учёта managed execution, не sandbox против произвольного локального процесса с правом менять flow DB. Один ID в argv сам по себе никогда не подтверждает native identity.
