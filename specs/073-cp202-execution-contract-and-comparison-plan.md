# 073 — CP-202: единый execution contract и корректное сравнение SPECIFY

Статус: реализован; проверки и границы приёмки записаны в
[implementation receipt](../runbooks/plan-073-implementation-receipt.md).
2026-10-08.

## 1. Цель и границы

Запускать заявленные профили, сохранять их на весь эксперимент и сравнивать
decision-маршруты без непреднамеренного перекрытия попыток. Применимо ко всем
упряжкам, не только Luna/Codex. Техническое завершение, соответствие профилю
эксперимента и семантическое качество — разные результаты.

Не меняем продукт, канон, threshold 0.93, допустимый provider routing,
stop_after=finished, generation fences или security/permission policy.
Не возобновляем CP-202, не переписываем его manifest/receipts, не делаем новых
платных вызовов в рамках разработки. Реальные сравнительные запуски — отдельная
операционная приёмка после реализации и разрешения пользователя.

## 2. Основание и факты

Все три CP-202 завершили SPECIFY, full_case_completed=false:

| Режим / EVAL | SPECIFY | Decision |
| --- | --- | --- |
| judge-only / EVAL-20261008044501-f352dfc6 | 183834 ms | native Judge covered |
| jev / EVAL-20261008044525-cb10e9e4 | 203289 ms | confidence .54 < .93, Judge covered |
| openai-decisions / EVAL-20261008044550-100ce11e | 132922 ms | confidence .98, fast covered |

Evidence: homes /Users/deksden/.dd-eval/qualification/cp-202-luna-{judge-only,jev,openai-decisions},
manifest, RUN timeline/controller journals, model-observations, interaction-judge
packet/result/semantic-observation, launch.log. Engine beta.125, dd-flow e61fd671,
dd-eval 69df960. Канонический ответ одинаковый, вопросы и траектории разные.

Subject фактически gpt-5.6-luna/xhigh во всех трёх: модель указана уже в исходящих
thread/start и turn/start. Repo profile объявляет gpt-6-luna; global runtime
profile с тем же ID содержит gpt-5.6-luna. Это не скрытый routing провайдера.
OpenAI Decisions отдельно действительно запросил gpt-6-luna.

Launcher /Users/deksden/.dd-eval/qualification/cp-202-candidate/launch-comparison.mjs
ждал child close, а CLI вернул accepted/pending. Все три SPECIFY пересеклись
04:49:06–04:50:31 UTC. Ошибка launcher, не нарушение EVAL-local concurrency=1.

## 3. Реестр дефектов и аудит соседних путей

| ID | Установленный факт / область | Исправление |
| --- | --- | --- |
| D1 | runner prepareRuntimeHarnessConfig/launchEvalExecution копируют ambient agent-profiles, doctor проверяет repo profile; managed RUN получает другое содержимое same-ID profile. | A: один разрешённый и замороженный contract перед dispatch. |
| D2 | attachModelAttribution показывает manifest.subject_profile, но modelAttribution сравнивает с adapter-requested profile; EVAL declaration → resolved runtime не проверяется. | B: отдельное experiment conformance, не запрет routing. |
| D3 | canonicalResume и focused restore используют тот же provisioning; canonicalResume перечитывает Subject по ID. Соседние callers уязвимы к разным authority/дрейфу. | A/C: один materializer, retained contract для continuation. |
| D4 | prepareForkedExecution повторяет prepareRuntimeHarnessConfig, который одновременно обновляет adapter paths и копирует ambient profiles. Frozen RUN может оставаться корректным, но mutable home расходится с ним и hook qualification. | C: отделить переносимую adapter config от execution settings; frozen RUN authority не заменять. |
| D5 | interaction Judge загружается по ID в interactionJudge, final Judge по ID в performFinalJudge (если нет frozenProfile); существующий frozenProfile branch есть. Репозиторный профиль может измениться между admission и поздним вызовом. | A/C: freeze выбранные Judge profiles и использовать существующий frozenProfile путь. Не утверждаем, что CP-202 Judge изменился. |
| D6 | comparison launcher считает async acknowledgment завершением EVAL, tests сравнивают только profile JSON. | D: ожидание durable terminal + settled cleanup, регрессия orchestration. |
| D7 | full Stage duration включает tools/HITL/dispatch; вопросы разные, попытки перекрыты. Данных недостаточно для причинного вывода об ускорении. | E: раздельные измерения, ограничения сравнения и один и тот же packet для decision-only сравнения. |
| D8 | Агент сделал неверные absolute paths/cwd и guessed Work directory; восстановился. | F: проверить выдаваемые references, учитывать agent error отдельно. Не создавать guessed folders и не патчить продукт. |
| D9 | preflight profileIds (runner:3653–3654) содержит только Subject/interaction/final Judge; reachable stage overrides и external workers не проходят doctor, хотя hooks и structural snapshot частично их проверяют. | A: admission по единому resolved inventory, не только трём верхним IDs. |
| D10 | retained Final Judge проверяется по candidate hash + profile_id (runner:2336,4167), не semantic profile hash; native fallback intent:2574 также не связывает effective Judge settings. Same-ID edit может изменить смысл reuse/recovery. | C: profile hash в intent/verdict/reuse binding; legacy отдельный unknown. |

Не дефект: JEV HTTP200 на первой попытке с .54, затем предусмотренный fallback.
Внутренняя причина неуверенности неизвестна; большой/составной контекст — гипотеза.
Не повторять до удобного confidence и не снижать threshold ради PASS.

Проверенные области dd-eval: runner loadProfile/preflight/run/provision,
canonicalResume/restoreStageSnapshot, fork preparation, managed observation,
interaction/final/supplemental Judge, qualification, model observations,
resume worker, profiles/schemas, execute-eval и соответствующие tests.
dd-flow: execution-policy loader/snapshot/resolver, controller profile resolution
и adapter session arguments. Полный аудит всех unrelated subsystems не заявляется.

## 4. A — единый разрешённый execution contract

1. Переиспользовать validators/loaders/snapshotAgentProfiles и существующую
   execution-routing policy. Один shared dd-eval preparation helper обслуживает
   preflight, fresh E2E, canonical и bootstrap/focused paths. Не создавать новый
   profile registry, generic factory или framework.
2. Subject repo profile — authority для своего ID. Явные stage/delegation IDs
   остаются полными самостоятельными профилями: если есть committed repo profile,
   использовать его; иначе разрешить runtime-only override из configured home
   один раз, провалидировать и заморозить с указанием происхождения. Не смешивать
   поля нескольких same-ID профилей и не требовать Subject-модель для всех ролей.
3. Mapping двух схем определён в разделе 11. Repo v1 не содержит все execution
   поля: не выдавать его за complete runtime profile. Harness aliases нормализует
   существующий harnessConfigKey; обратный flow key задаёт закрытая таблица.
   Нельзя дописывать notes/runtime/subagent_capacity в dd-flow profile schema.
4. Materialize только нужные complete profiles в isolated home; harness binary,
   Codex home и portable adapter config остаются configuration dependencies,
   не источником выбора модели. Секреты не входят в profile receipt.
5. Manifest/retained input хранит resolved profiles, role/stage references,
   semantic hashes и source provenance. Preflight выводит разрешённые настройки.
   Сам run независимо resolve+freeze до первого paid dispatch: предыдущий
   отдельный preflight не считается вечным разрешением на изменённые inputs.
6. Перед первым controller/native dispatch сравнить RUN frozen profile snapshot
   с retained contract, используя семантические поля, не repo-wide Git tree.
   Несоответствие = profile_contract_mismatch, без вызова Subject/Judge.
7. Ambient изменения после freeze не меняют попытку. Новый run принимает новую
   декларацию. Явные overrides отражены в contract и doctor/hook admission.
8. Inventory включает coordinator/worker profiles всех достижимых стадий до
   stop_after, внешние делегирования и включённых Judges. Каждый уникальный
   effective profile проходит существующий doctor; не вызывать модель только
   ради enumeration и не путать structural validation/hooks с admission.

## 5. B — conformance отдельно от model routing

Сохранить checkObservedProfile routing-permissive по умолчанию и existing
permission/autonomy checks. Проверять declaration → resolved/frozen → outbound
intent для каждой роли/стадии. Provider response observations остаются отдельной
атрибуцией: configured intent не доказывает реальную серверную модель.

В status/report/candidate дать conformance matched/mismatched/unknown с точным
evidence и expected/effective profiles. Unknown не превращать в matched.
Отсутствие одного optional native field не делать новым блокером для упряжки,
если authoritative intent/profile snapshot подтверждены. Неподтверждённые
asserting sources продолжать показывать как observation gaps.

Новые mismatch нельзя оценивать как корректный эксперимент; при обнаружении
после dispatch штатно завершить owned execution/cleanup и сохранить ошибку,
не повторять вызовы. Старые runs показывать как исторические данные с legacy
unknown, не переписывать их immutable receipts или объявлять новый PASS.
Schema/report validators и повторный finalize должны понимать новое поле.

## 6. C — продолжение, fork и Judges

- Resume/recovery использует retained contract, не loadProfile из текущего repo.
  Проверять snapshot integrity до continuation; менять модель в той же попытке
  через конфигурацию нельзя.
- Fork наследует contract, если explicit policy не объявляет новый эксперимент;
  разрешённый explicit override требует нового derived receipt/provenance.
  Adapter paths можно переназначить в новый home без копирования ambient моделей.
  Не делать новый snapshot resolver конкурирующим с dd-flow frozen RUN.
- Native hooks qualification получает actual effective profiles, включая
  overrides; не проверяет одно и запускает другое.
- Interaction/final Judge default profiles фиксировать в исходном experiment
  contract. Supplemental/rejudge с explicit profile — отдельный уже существующий
  operation receipt с новым замороженным профилем, не изменение старого EVAL.
- Judge qualification зависит от Judge inputs, а не изменения Subject/harness
  или всего repository tree. Сохранить существующую dependency policy.
- Judge intent, operation/result receipt и повторное использование verdict
  связывать с semantic hash полного frozen profile, а не только ID. Candidate
  hash и packet bindings сохраняются. У legacy result без этого доказательства
  нельзя объявлять reuse под сегодняшними settings; не запускать новую платную
  оценку автоматически ради заполнения неизвестного поля.
- Legacy EVAL без contract: читать retained RUN/operation profiles, если они
  однозначны; если данных недостаточно для continuation — явный compatibility
  blocker, без восстановления настроек из сегодняшнего ambient home. Read-only
  status старых EVAL обязан продолжать работать.

## 7. D — последовательный comparison без нового контроллера

Добавить небольшой стандартный script/helper на существующих CLI run/status и
terminal/cleanup projection. CLI run остаётся async; документация явно различает
accepted/pending и finished. Не вводить глобальный machine lock и не менять
concurrency.global (оно внутри EVAL).

1. Получать root/ID из структурированного run acknowledgment, не искать newest
   directory. Сохранять список variants/inputs/hash и точные IDs в campaign receipt.
2. Ждать terminal EVAL и cleanup_state=settled прежде следующего варианта.
   awaiting_provider, paused, stopped-with-unsettled-cleanup и completed worker
   без terminal EVAL не разрешают следующий paid run.
3. При blocker/ошибке/unknown liveness остановить orchestration и доложить;
   никогда автоматически не resume/restart/manual repair. При terminal failure
   по умолчанию остановить campaign, не запускать остальные молча.
4. Poll существующий status с умеренной частотой и отменой; без total wall-clock
   timeout живой работы. Использовать существующие progress/owner diagnostics,
   не считать живой PID доказательством прогресса и не считать quiet terminal hang.
5. Повторное исполнение script использует сохранённые IDs, не создаёт дубликаты.
   Сбой между run submission и записью campaign receipt — fail-closed
   reconciliation по recorded launch intent/ack, не blind retry. Одновременно
   запущенный тот же campaign блокируется existing local lock helper.
6. Test doubles без моделей: accepted exit0 → no next; terminal+cleanup pending
   → no next; settled → next; failed/owner lost/abort → stop; restart → same IDs.

## 8. E/F — измерения и восстановленные agent errors

Stage duration считать только по durable start/done; отдельно paused time,
decision HTTP/total/retries и Judge/dispatch где есть достоверные timestamps.
Не подписывать pausedMs как чистый Judge compute. Техническая completion_scope
и conformance обязательны для пригодности сравнения.

Для route-level сравнения использовать один retained packet для всех providers;
full independent SPECIFY trajectories не притворяются identical-input benchmark.
Один sample не доказывает скорость/accuracy; повторные live samples — отдельное
решение пользователя. CP-202 оставить с явно записанными ограничениями.

Проверить producer/consumer абсолютных workspace/artifact references в Stage
packet и controller prompt. Если фактический packet обещает отсутствующий путь —
исправить producer в shared месте и тест. В доказанных CP-202 неверных cwd/path
запросах агента не подменять root cause инфраструктурной догадкой. Метрики
recovered tool errors — quality evidence, а не автоматический flow failure.
Не добавлять heuristic command rewriting, filesystem aliases или repair loop.

## 9. Проверки, порядок и критерии завершения

1. Реализовать A/B в dd-eval shared boundary; dd-flow менять только если его
   существующий frozen snapshot API реально недостаточен. Сначала regression:
   repo gpt-6-luna vs ambient same-ID gpt-5.6-luna не запускает 5.6.
2. C закрыть тем же contract на всех callers; D независимо; E/F без платных API.
3. Tests: managed preflight/run mismatch, overrides, same-ID security mismatch,
   ambient drift after freeze, immutable resume/fork, legacy read-only,
   delayed Judge profile drift, supplemental isolation, negative conformance,
   same-ID verdict reuse rejection и doctor coverage overrides/workers,
   routing allowed, orchestration pending/settling/crash/idempotency.
   Параметризовать harness mappings на существующих fixtures; не делать три
   платных E2E вместо проверки общей логики.
4. Existing targeted baseline:
   `node --test test/model-observations.test.mjs test/semantic-pilot-profiles.test.mjs`
   2026-10-08: 10 PASS, 1 cross-repository parity SKIP, 0 failures. Это
   демонстрирует coverage gap, не исправление. При реализации parity включить
   через DD_FLOW_SOURCE_ROOT; добавить новые tests в existing suites либо один
   small comparison test. Прогнать managed/fork/recovery/control/semantic suites
   и обязательные repo checks, точные команды записать в implementation receipt.
5. Проверить schemas/docs и diff, commit/push по runbooks/git-workflow.md.
   Merge/release/new engine checkpoint/live attempts только по отдельному scope.

Definition of done: все перечисленные fresh/retained execution paths пользуются
одним frozen contract; wrong-profile dispatch невозможен; Judges не дрейфуют;
intent/observed attribution не смешаны; campaign не перекрывается/не дублируется;
регрессии воспроизводят CP-202 дефекты; historical data неизменны; report честен
о scope и измерениях. Этот план не объявляет ни реализации, ни live acceptance.

## 10. Проверка по ponytail

Независимый read-only аудит audit073_profiles перепроверен главным агентом:
runner:3653–3654,2327–2340,4161–4170,2566–2578. Добавлены D9/D10.
Fork nuance сохранён: recopy mutable files не доказывает изменения уже frozen
RUN Subject; план исправляет расхождение admission/authority, не выдуманный
наблюдавшийся runtime drift. При составлении плана код реализации не менялся;
последующая реализация зафиксирована отдельным receipt.

Выбран shared materialization/validation, existing dd-flow profile snapshot и
existing async status/cleanup. Не добавляем dependency, universal workflow
engine, calibration framework, global semaphore или обязательную повторную
Judge qualification после каждого Subject fix. Не переименовываем legacy ID
ради косметики и не ослабляем safety ради ускорения. JEV uncertainty не лечим
бездоказательной prompt surgery. Проверки контрактных границ не сокращаем.

## 11. Проверка готовности: принятые решения и edge cases

### 11.1. Поля и происхождение: не скрытое слияние

Текущий repo profile v1 задаёт id/harness/model/reasoning, runtime compatibility
и capacity, но обычно не provider/mode/permission. Поэтому минимальный мост:

- Для repo-backed ID взять единственный same-ID complete runtime template из
  configured home. Валидировать его schema и alias-normalized harness.
- Заменять в копии template только model/reasoning значениями repo declaration;
  id/harness должны быть согласованы, их конфликт — admission error.
- provider/mode/permission не выбирать по эвристике и не менять автоматически:
  эти три поля — явная environment execution policy, retained вместе с template
  hash и field provenance. Repo-backed профиль без template — понятный blocker
  до моделей. Для runtime-only override весь validated template authoritative.
- Runtime policy может отличаться на другой машине, поэтому effective contract
  показывается в preflight и report целиком; нельзя обещать portable идентичность
  по одному profile ID. Новый run после policy change — новый contract hash.
- Существующие repo-профили ZCode/AGY уже задают provider/mode: эти поддерживаемые
  ограничения должны совпадать с template; конфликт отклонить, не игнорировать
  и не менять policy автоматически. Permission-поля repo до введения
  поддерживаемой schema отклонять как unsupported declaration.
  Не вводить новый пользовательский config format ради данного исправления.
- Repo runtime constraints/capacity сохраняются в отдельном EVAL declaration
  рядом с execution fields; doctor/hooks проверяются с ними. Direct Judge calls
  должны передавать явные effective provider/mode/permission, где адаптер умеет,
  либо использовать доказанную existing configuration semantics. Unsupported
  setting = blocker, а не формальное conformance matched.

Это ограниченное преобразование двух существующих схем, с явными владельцами
полей, а не произвольный field merge. Новых credentials/profile defaults нет.

### 11.2. Retention и dispatch boundary

В prepared manifest добавить optional для legacy `execution_contract` с
schema_id dd-eval/execution-contract@1, profiles keyed by safe profile ID,
declarations, routing, roles, field_sources и semantic_sha256. Credential values,
absolute executable locations, notes и repository tree не входят в semantic hash.
Они при необходимости остаются отдельным provenance, не triggers Judge rerun.
Две одинаковые effective settings с разной provenance имеют одинаковый semantic
hash. Каноническую сериализацию/hashJson переиспользовать.

Manifest записывается атомарно до enqueue; queued worker получает его hash как
сейчас. RUN snapshot сравнивать через уже доступный run snapshot/status payload,
не добавлять новый публичный API, если данные доступны. Не загружать template
повторно в launch после freeze; late profile ID вне inventory отвергать до
dispatch (`execution_profile_not_frozen`), не дополнять из ambient config.

RUN profile maps могут включать ещё не исполняемые stage overrides: их нужно
заморозить для структурной валидности всего routing. Native doctor обязателен
только для достижимых dispatch profiles до target; явно неизвестный later-stage
profile всё равно нельзя пропускать через structural snapshot. Не смешивать
scope admission и scope полного frozen routing.

Новый conformance объект optional для historical schemas; для новых runs
required самим producer/checker. declaration/frozen/intent mismatch блокирует
valid experiment. Native response drift показывается отдельно и не превращается
автоматически в этот mismatch. Unknown historical evidence не инвалидирует
ретроспективно terminal receipt. Report reuse/finalize включают contract hash
в revision dependencies, не только display-поле.

### 11.3. Legacy, Judges и fork без неожиданного paid migration

Старые terminal runs — read-only status/report, без automatic rejudge/migration.
Старый активный Subject можно продолжить, если frozen RUN profile подтверждён;
Judge без immutable settings evidence при необходимости нового dispatch требует
compatibility blocker. Уже созданную native Session не recreate для изменения
настроек. Cleanup использует retained harness/session ownership, а не требует
живой qualification или полного нового contract: остановить старую сессию должно
быть возможно и при неполной model evidence.

По умолчанию fork наследует frozen execution semantics. Любой explicit rerouting
fork — отдельный derived experiment с собственным frozen contract и receipt;
не изменение original manifest. Rejudge/supplemental explicit profile фиксируется
при подготовке operation. Уже существующий result с тем же ID, но другим profile
hash не reuse; unknown legacy reuse не замещать новой оценкой без явного запроса.
Native intent сохраняет profile hash до create; unknown-outcome reconciliation
проверяет его, не issuing второго create. Адаптерные portable paths можно
обновить отдельно; executable identity/runtime constraints проверяются existing
admission, без незаметной замены pinned engine.

### 11.4. Campaign interface и потеря acknowledgment

Небольшой CLI script `scripts/run-specify-comparison.mjs` принимает ordered
profile paths, отдельный campaign directory и явный base home; каждый вариант
получает сохранённый из intent fresh home. Не вводить универсальный campaign
DSL. Все варианты должны иметь одинаковые checkpoint/Subject effective hash,
stop_after/fixture/Judge; разрешённая delta — semantic_decisions. Если goal иной,
это не данный comparison script, обычный runner остаётся доступен.

Campaign receipt schema содержит inputs hashes, effective contract hashes,
variant ordinal, home, launch intent, ack root/run_id, last observed state и
cleanup_state. Не хранить ключи/API env. До launch сохранять intent атомарно.
После ack сохранить точный ID, проверить root принадлежит указанному home.

Если процесс упал до сохранения ack: проверить только соответствующий isolated
home. Единственный manifest, совпадающий с intent inputs, может быть принят после
проверки immutable binding; 0/несколько/несоответствующий manifests или неизвестный
исход — stop и read-only reconciliation, не повтор run. При заведомом no_effect
до submission допустимо начать ещё не отправленный вариант; без доказательства
no_effect — не retry. Это bounded campaign-specific lookup, не выбор latest EVAL.

Terminal predicate брать из существующего reducer/status, а cleanup подтверждать
по authoritative report/worker settlement, не по отсутствию PID. Если runnerStatus
не выдаёт cleanup_state на верхнем уровне, минимально экспонировать существующую
projection, не строить альтернативный reducer в script. Terminal failure и
operator stop останавливают campaign; HITL/owner blocker требуют внимания без
автоматического изменения EVAL. Script cancel прекращает orchestration polling,
не убивает живой EVAL автоматически; report содержит его ID для оператора.
Lock timeout — ограничение получения campaign lock, не таймаут работы агента.

### 11.5. Закрывающие проверки и поставка

Добавить негативные сценарии missing template, alias conflict, invalid permission,
late unfrozen profile, policy field provenance, doctor failure override,
cleanup legacy without model proof, profile drift between prepare/enqueue,
unknown create outcome и lost ack (0/1/multiple manifests). Shared test doubles
переиспользовать; обязательных live probes для ветвления кода нет.

При реализации точные targeted команды:

```sh
DD_FLOW_SOURCE_ROOT=/Users/deksden/Documents/_Projects/_worktrees/dd-flow-cp198-implementation node --test test/model-observations.test.mjs test/semantic-pilot-profiles.test.mjs
node --test --test-concurrency=1 test/runner-fork.test.mjs test/runner-recovery.test.mjs test/runner-control.test.mjs test/runner-launch-observation.test.mjs test/managed-resume.test.mjs test/semantic-routing.test.mjs
```

Новые shared-contract/comparison tests добавить явно в implementation receipt и
обычный test discovery. dd-flow typecheck/build/targeted execution-policy tests
нужны при изменении flow-кода; если изменение только dd-eval, не публиковать новый
engine ради профилей. Docs обновить execute-eval (async semantics/effective
settings/sequential run) и profile contract описание. Единственный план 073
остаётся source of task scope; implementation receipt отмечает каждый D1–D10,
tests/results и remaining limitations. Решения пользователя для реализации не
остались открытыми; release/новые paid comparisons остаются отдельным действием.
