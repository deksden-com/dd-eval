# 030. Принятие общего runtime и оценивание смешанного исполнения

Статус: DRAFT, план реализации; текущие adapters/runner ещё не перенесены.
Дата: 2026-09-07.
Редакция: 0.3.0 — добавлена обязательная поставка commits/push/main integration
и adoption опубликованного CLI/canon release; реализация не запускалась.
Scope: `dd-eval`, совместно с `dd-flow-cli` и `dd-memorybank`.

## 1. Владельцы документов

Полный delivery plan с WP-00–11, verification V-01–42, worktree/merge procedure:

`dd-flow-cli:.memory-bank/plans/shared-harness-runtime-and-mixed-execution.md`.

Canonical policy:
`dd-memorybank:.memory-bank/spec/engineering/SPC-013-shared-harness-runtime-and-execution-policy.md`.

Это логические ссылки repo:path. Данный документ — локальная граница принятия
runtime и сохранения eval-инвариантов, не второй полный план.

## 2. Зачем меняется граница

Обычные flow, MERGE и внешние Work должны запускать упряжки без установки
eval-проекта. Поэтому shared harness runtime и обычное stage driving/fanout
переходят в `dd-flow-cli`; canon задаёт инструкции. Eval становится потребителем
того же runtime, которым пользуется обычный пользователь.

Это не превращает eval в пустую обёртку: воспроизводимость эксперимента,
изоляция, авторство inputs, assessment и доказательства качества остаются
самостоятельной ответственностью `dd-eval`.

## 3. Что переносится и что остаётся

| Область | Решение |
| --- | --- |
| `bin/dd-{codex,zcode,grok,opencode,agy,droid}.mjs`, provider bridges/daemons | Перенести в пакет CLI с tests/fixtures; удалить старые активные implementations после cutover |
| Managed daemon/processes, durable operations, settlement/recovery, observation primitives | Общая часть в CLI; split по фактическим callers, включая свежие 028/029 fixes |
| Общие hash/atomic-write/error helpers из eval modules | Выделить минимально необходимое; runtime не импортирует eval reducer |
| Agent profiles и runtime/capability probes | Общий контракт CLI; eval хранит ссылки/frozen snapshots и требования qualification |
| Обычное stage continuation/productive fanout | Flow execution service CLI над существующим Work graph |
| Eval run scheduling, repetitions/scopes/stop targets, experiment recovery bookkeeping | Остаётся eval; вызывает общий runtime, не дублирует физическое исполнение |
| Cases, reference answers, interaction fixtures, rubric, accepted entry packs/checkpoints | Остаются eval, не попадают в runtime/canon/Subject context |
| Manifest/candidate immutability, experiment events/reducer, scoring/reports, storage/GC | Остаются eval; GC проверяет settlement через общий runtime |

`runner.mjs` и helpers не перемещать целиком по имени файла. В частности,
`entry-pack.mjs` содержит case-specific semantic packages, а `runner-events.mjs`
содержит eval reducer наряду с общими primitives.

## 4. Инварианты принятия

### 4.1 Воспроизводимость

- Default baseline — один явно выбранный agent profile и native children.
- Mixed strategy — отдельная конфигурация эксперимента: effective profiles
  стадий/Work, explicit native/external topology, concurrency/budgets.
- Explicit external не оптимизируется в native при равных профилях.
- Run manifest сохраняет resolved profiles/hashes, actual runtime versions,
  CLI/adapter/canon commits, checkpoint/input hashes, permissions и stop target.
- Изменение operator profile после запуска не меняет frozen strategy.
- Выбор Work override фиксируется до dispatch; если решение не было частью
  declared policy, оно отражается в provenance/validity, не скрывается под
  исходной меткой «одна модель».
- Semantic entry pack не перестраивается из-за смены harness/model. Новая
  сессия получает исходный stage context и принятые результаты без передачи
  истории другого provider или canonical assessment.
- Historical manifests/results остаются read-only; schema migration не
  переписывает прежние hashes и не выдаёт новые defaults за прошлые факты.

По решению 029 штатный native quota fallback разрешён: продолжить, сохранить
transition до progress, показать mixed attribution. Это не requested profile
override и не повод для новой session/repair. Configured/applied не равны
observed use; strict model pin — только explicit experiment policy. Один
evaluator применяется в driver/hook/flow/eval, integrity violation остаётся
отдельной причиной остановки. Скрытый server routing не считается наблюдаемым.

Generic context schema переходит в CLI вместе с общей частью capture, но
`dd-eval/stage-context@1` в принятых inputs не переписывается. Boundary converter
связывает исходный source hash и новый materialized envelope hash. Зависимости
и required sources проверяются, immutable input не подменяется snapshot новой
модели. `merge_mode=same_session` с несовместимым requested profile — preflight
conflict, не молчаливый новый координатор; fresh review policy тоже сохраняется.

### 4.2 Роли и изоляция

Subject, final Judge, interaction Judge и technical qualification используют
общий low-level session runtime, но отдельные roots/homes/permissions и
context packets. Judge не становится Work оцениваемого RUN. Technical probes
не попадают в productive Work count и Subject usage.

Общий launcher не получает право читать hidden fixtures по факту shared code.
Eval передаёт только соответствующий role packet; Subject не видит rubric,
golden answers и соседние attempts. Политика запросов пользователю остаётся
eval-specific и накладывается снаружи driver. Common native/external Work
instructions приходят из engine stage/work packet.

Отсутствие Work binding не означает отсутствие resource lifecycle. При
`noFlow` Judge/probe должны сохранять process registration, owner, durable
operation, usage и cancel/cleanup независимо от Subject hooks. Это требует
разделения текущих noFlow/resourceHome defaults при переносе.

Каждый execution получает собственные operation ids, mutable provider home,
socket/ports и разрешённое окружение. Parent session/hook identity и старый
`DD_EVAL_OPERATION_ID` не наследуются внешним worker. Runtime credential
references не превращаются в credentials в manifests/logs. Hooks и prompt
ограничения не выдаются за OS sandbox; hard isolation заявляется лишь при
проверенных provider/OS controls.

### 4.3 Recovery и операторская pause

Client timeout/потеря stdout не означают завершение Subject. Eval наблюдает
durable operation handle и reconciliation общего runtime, не повторяет
prompt/create самостоятельно. Последние physical ownership исправления
026–029 обязательны и не могут быть потеряны переносом.

Operator pause не является HITL/failure. Eval фиксирует отдельный control
event и paused duration; Subject judgement не получает ложный finding об
abandonment. Resume не создаёт новую попытку/Work и не отправляет повторный
ответ на HITL. Same physical session используется только при подтверждённой
capability; replacement/replay видно в evidence и comparison validity.

### 4.4 Accounting и модель

Eval использует общий physical usage ledger/projections, не считает tokens
второй раз. Сохранить отдельно Subject RUN, Judge, interaction Judge, probes
и при необходимости all-experiment total. Physical external roots не теряются
из-за logical parent Work; native inclusive counters не дублируются.

Requested model не доказывает observed model. Fallback, unknown child model,
неполная coverage и отсутствие breakdown видны в manifest/report. Если
провайдер поменял модель, нельзя продолжать утверждать, что весь результат
получен исходным профилем. Неустранимая uncertainty оценивается отдельно от
качества работы Subject.

Cache/reasoning subsets не прибавлять повторно к total. Cumulative windows
делятся по operation/turn ownership, событие на stage boundary не входит в
обе стадии. После seal candidate late usage/model observations становятся
immutable addendum/revision с watermark, не меняют исходный hash и не
перезапускают Judge автоматически.

### 4.5 Controller и terminal arbitration

Managed flow controller владеет физическим исполнением после exit CLI-клиента;
eval владеет experiment schedule/assessment. При attached entry не создаётся
второй root. Один current RUN owner/generation допускается к dispatch; другой
клиент может наблюдать, но не takeover живого владельца по истёкшему lease.

Boundary eval/flow — typed events/operations: stage progress, Work result,
HITL-needed, stop target, control/terminal receipts. Fixture answer создаёт
eval; общий runtime не знает rubric. Eval не пишет в Flow DB напрямую и не
сохраняет альтернативный productive drive loop.

Cancel, complete и fatal могут конкурировать между процессами. Одна
authoritative projection принимает terminal/candidate revision; late reply
не переписывает результат и не обходит `candidate_revision_unauthorized`.
Malformed result/чужой generation не открывает depends_on, Work finish при
живом mutating child не доказывает готовность следующего writer.

Operator pause закрывает новый dispatch, но не status/usage/ack/разрешённый
finish ранее начатой работы. Resume до settlement не открывает admission;
ответ на HITL во время pause сохраняется без продолжения. Cancel/fatal terminal
не воскрешается; partial resume показывает inventory без повторного spawn детей.

## 5. Локальная последовательность работ

- [ ] WP-00: дождаться согласованного committed baseline текущих 028/029 fixes.
  В основном checkout они dirty, в новом worktree их ещё нет. Не копировать
  чужие незавершённые файлы и не начинать конкурирующий rewrite.
- [ ] Снять inventory driver/daemon/helper imports, schemas, binaries, tests,
  fixture paths и ручных runbook/config references на старые adapter paths.
- [ ] Перенести с CLI владельцем общие реализации/тесты; отличать deterministic
  conformance от scoring eval. Удалить runtime dependency на eval modules.
- [ ] Переключить runner Subject stage flow и MERGE на общий flow executor;
  Judges/probes — на общий low-level session API без Subject Work binding.
- [ ] Убрать из provider configs/system prompts универсальное требование
  «ждать eval runner dispatch». Eval-specific constraints передавать как
  экспериментальную политику; обычный flow работает независимо.
- [ ] Обновить run profile/manifest/candidate/report schemas под mixed strategy,
  requested/observed execution и accounting coverage; сохранить historical read.
- [ ] Согласовать Node/runtime requirements: нынешний eval допускает Node >=22,
  CLI требует >=26. Прямая зависимость/CLI invocation должны иметь явный
  проверяемый preflight, а не случайно падать на несовместимой Node версии.
- [ ] Проверить immutable entry pack/assessment hashes и role isolation на
  baseline и mixed executions, включая focused stage entry/new session.
- [ ] Перенести/обновить conformance/capacity commands и compatibility receipts;
  eval pins принимают только доказанную версию, не произвольный global adapter.
- [ ] Обновить `README`, harness backends/execution/storage/beta runbooks,
  installation/config guides и затронутые active specs. Исторические результаты
  не переписывать; новые инструкции не ссылаются на retired binaries.
- [ ] Удалить старые executable entries и implementations после cutover.
  Если оставлен временный migration bridge, у него owner, exact caller,
  removal gate и test; не сохранять две постоянные копии runtime.
- [ ] Выполнить `npm test`, `git diff --check`, V-18/19/20 и full baseline/mixed
  acceptance с packaged candidate CLI/canon, без локальных source imports.
- [ ] Проверить V-23–36: allowed fallback во всех consumers, non-Work owner,
  scoped env/homes, typed control/events, terminal arbitration, generic context
  conversion и late telemetry без мутации accepted candidate.
- [ ] Проверить migration/write fences общей DB и snapshot asset integrity;
  engine pin не разрешает old/new writers делить несовместимый mutable store.
- [ ] Получить isolated test-world prerequisite 029 для каждого invocation
  перед parallel e2e; без него не reset/seed общую DB и не расширять scope
  на правки продукта `dd-tasks` без отдельного решения.

## 6. Тесты и evidence

Принятие требует как минимум:

1. Default/native end-to-end на исходном accepted input до согласованного
   terminal stage; все фактические children имеют trusted physical identity.
2. Mixed end-to-end из того же semantic entry pack: coordinator stage switch,
   explicit external same-profile и cross-harness worker, Work override.
3. Separate MERGE acceptance, если основной suite заканчивается раньше MERGE.
4. Operator pause/resume и interruption recovery: root/children/active check,
   late replies, observation loss, duplicate dispatch protection.
5. Inclusive usage + external roots + cumulative deltas + observed fallback;
   Judge/probe overhead отдельно, unknown breakdown остаётся unknown.
6. Свежая установка CLI без eval sources успешно запускает обычный flow;
   eval install получает публичный интерфейс выбранной версии runtime.

Все шесть adapters проходят contract matrix; live claims подкреплены live
receipts. Отсутствие auth/quota — blocked verification, а не pass/unsupported.
Test-world изолируется на invocation, не только на checkout: два одновременных
check одного worktree имеют разные DB/ports/homes. Synthetic quota cases не
исчерпывают реальный аккаунт, sleep tests не усыпляют машину; interprocess races
проверяются двумя настоящими клиентами. Platform/capability support указывается
по подтверждённой OS/runtime комбинации, не экстраполируется с одной машины.
Не сравнивать mixed результат как результат одной модели. Отчёт содержит
ровно применённый revision tuple и отдельно flow/runtime validity и качество.

## 7. Worktree, merge и retirement

Подготовлен отдельный worktree:

- branch: `feature/shared-harness-runtime`;
- path: `/Users/deksden/Documents/_Projects/dd-eval.feature-shared-harness-runtime`;
- target: `dd-eval/main`;
- base: `a51787de1c4ac4bcf3c3251178a40af1fa7e5b19`.

Основной checkout содержит чужую текущую работу и не затрагивается этой
подготовкой. До реализации — обновление базы только через согласованные
commits. До merge — свежий main, resolution конфликтов, повторные gates и
review. Eval cutover следует за доступным compatible CLI foundation/canon
tuple; старые daemons/RUN не мигрируют на новый writer на лету.

При общей DB pin старого engine недостаточен: до несовместимой schema migration
нужен store-wide drain/isolation или доказанная old/new writer compatibility.
Backup учитывает SQLite WAL, migration имеет version fence и crash-safe путь;
restore не выполняется при живых writers. Tarball и immutable snapshot содержат
все adapters/hooks/.mjs assets; одинаковая версия с другим digest не считается
тем же runtime. Итоговый revision tuple фиксируется delivery receipt без
циклических требований записать будущие commits друг друга в каждый repo.

Runtime retirement ledger должен перечислить точные старые bins/modules,
schema writers, profile path resolvers и runner dispatch branches. Gate
закрывается search/caller audit, contract tests и actual packaged execution,
не одним удалением файлов. Старые immutable artifacts остаются читаемыми.

После merge в main — post-merge acceptance всего tuple; при провале сохранить
деревья и evidence, остановить activation, использовать безопасный согласованный
rollback, не reset/kill чужих процессов. По уточнённому запросу необходимые
releases и released-artifact acceptance входят в общий обязательный delivery,
а не выносятся за его завершение. Сейчас выполняется только правка плана.

## 8. Commits, push, integration и release adoption

- [ ] Подготовить scoped docs/implementation/test/pin commits в собственном
  worktree и push `feature/shared-harness-runtime` в проверенный
  `https://github.com/deksden-com/dd-eval.git`; проверить remote SHA и authority.
- [ ] Выполнить required checks/review/PR при наличии защиты, интегрировать
  в main и подтвердить фактический origin/main SHA. Чужой dirty main не трогать.
- [ ] Cutover, удаление локальных adapters и обязательные runtime pins
  интегрировать только после существования compatible опубликованных
  CLI/canon artifacts; основной eval не должен зависеть от feature checkout.
- [ ] Обновить installation/execution/beta runbooks и release adoption notes:
  exact CLI package/version/dist-tag/digest, canon version/tag/commit, eval SHA,
  schema/migration requirements и acceptance receipts.
- [ ] Проверить full candidate acceptance и контрольный default/mixed запуск
  на реально опубликованном artifact через normal engine installer.
- [ ] Подтвердить V-37–42 совместной поставки; только затем cleanup своих
  merged локальных/remote feature refs и worktree.

`dd-eval` сейчас private, npm release contour не объявлен. Его обязательная
поставка — pushed integration commit с проверенным adoption receipt; не менять
`private`, не делать искусственный npm publish/semver bump. Если фактическая
политика на момент реализации уже требует source tag/GitHub Release, выполнить
её как release target. Релизы CLI и канона в master plan обязательны.

Release/version/access gates выполняются в WP-10; post-release install и
acceptance — WP-11. Ошибка публикации prerequisites блокирует eval cutover,
не разрешает вернуть временный source path или объявить local merge завершением.
