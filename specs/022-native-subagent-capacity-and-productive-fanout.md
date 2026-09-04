# 022. Native subagent capacity and productive fan-out

Статус: реализовано; unit/contract checks и live capacity conformance
выполнены настолько, насколько позволяют текущие provider profiles.
Дата: 2026-09-04.
Репозитории: `dd-eval`, `dd-flow-cli`, `dd-memorybank`; `dd-tasks` используется
только как изолированный проект приёмки.

## 1. Цель

Проверка concurrent capacity и продуктивное выполнение Work должны использовать
один и тот же нативный механизм субагентов выбранной упряжки.

Текущий runner нарушает это правило двумя способами:

1. capacity probe создаёт несколько независимых корневых provider Sessions и
   считает завершившиеся prompts;
2. PLAN-REVIEW, CODE и CODE-REVIEW исполняют каждый Work через отдельный daemon
   и новую корневую Session, хотя stage prompts требуют fresh child Session.

После реализации одна Subject/coordinator Session владеет плоским деревом
нативных детей. Capacity qualification считает наблюдавшиеся native child IDs,
а продуктивный fan-out передаёт этим же детям Work packets.

## 2. Неизменные границы

- `dd-flow` владеет RUN, Stage, Work, зависимостями, packets, lifecycle и
  результатами. Он не знает названий provider subagent tools.
- `dd-eval` владеет harness qualification, профилем, запуском coordinator Turn,
  наблюдением provider topology, cleanup и eval evidence.
- Subject/coordinator принимает смысловое решение, какие уже объявленные ready
  Works делегировать в очередной разрешённой волне. Runner не создаёт product
  Work и не выполняет его за модель.
- Harness adapter переводит только нативные Session/topology/status/usage facts
  в общий receipt. Он не создаёт flow сущности.
- Probe agents не являются Work, не вызывают `dd-flow`, не читают проект и не
  попадают в RUN usage.
- Judges, Interaction Judge и MERGE server worker являются независимыми ролями,
  а не детьми Subject, и не входят в subagent capacity.
- SPECIFY, PROTOCOLIZE и PLAN остаются односессионными, пока их собственный
  контракт не создаёт Work fan-out.

Новая универсальная queue, постоянный capacity monitor и прямой provider
dispatcher на каждую упряжку не нужны.

## 3. Термины

- **root/coordinator** — текущая физическая Subject Session, выполняющая Stage.
- **native child** — provider Session, которую root создал штатным subagent
  механизмом и для которой provider сообщает физического parent.
- **qualified capacity** — число уникальных прямых native child IDs, появившихся
  в одной bounded qualification попытке.
- **productive child** — native child, которому передан один объявленный Work.
- **launch accepted** — provider выдал уникальный child Session ID с физическим
  parent, равным root. Текст ответа и будущий terminal status на этот факт не
  влияют.
- **launch refused** — child ID не появился. Такой запрос не занимает slot и не
  считается запуском.

Fork/import/starter lineage не является физическим parentage и никогда не
засчитывается как subagent relation.

## 4. Универсальный native-child контракт

Для qualification и продуктивной работы используется одна схема:

```text
controlled root Session
  -> root Turn asks the harness to invoke native depth-1 children concurrently
  -> adapter observes authoritative child IDs and parent IDs
  -> children settle or are cancelled through the same live harness runtime
```

Различается только child packet:

- qualification: короткая конечная задача-маркер без project tools;
- productive fan-out: точный Work `start_command`, возвращённый `dd-flow`.

Каждый профиль использует тот же provider/model/reasoning, разрешённый native
subagent type и workspace strategy в обоих путях. Если provider выбирает child
model сам и не позволяет закрепить его, это фиксируется в observed receipt, а
не маскируется требованием root-профиля.

Начальный scored contract допускает только depth 1. Productive children и probe
children не создают grandchildren.

## 5. Матрица упряжек

| `harness` | Native launch | Авторитетный child identity | Наблюдение/cleanup | Нужная доработка |
| --- | --- | --- | --- | --- |
| `codex-desktop` | collaboration `spawn_agent` из Subject Thread | child Thread `id` + `parentThreadId` | app-server thread list/read, child turn interrupt | добавить descendants в `dd-codex` receipt и tree-aware cleanup |
| `zcode-acp` | встроенный subagent текущей ZCode Session | `childSessionId` | `zcode/session/subagents`, `session/cancelBackgroundTask` | удалить multi-root `session.probe-batch`; использовать root Turn |
| `grok-acp` | native `spawn_subagent` | ID из `SubagentSpawned`/subagent API | start/finish events, list/get/cancel | сохранять завершившиеся child IDs, а не полагаться только на `list_running` |
| `opencode-server` | native `Task` tool | child Session `id` + `parentID` | SSE `session.created`, `/session/:id/children`, abort | переиспользовать существующий child tree; проверить выбранный agent catalog |
| `antigravity-cli` | native `invoke_subagent` | child `conversation_id` | `step_update.subagent_info`, hooks, process-tree cancel | уточнить terminal status direct children; targeted cancel не обязателен для первой версии |

`codex-cli` встречается в исторических профилях, но текущий deterministic runner
его не маршрутизирует. Он не считается шестым поддержанным backend. Возврат этой
упряжки потребует обычного conformance по данному контракту, а не отдельного
fan-out дизайна.

Будущий backend подключается без изменения `dd-flow`, если умеет:

1. позволить controlled root вызвать native child;
2. вернуть авторитетные child/parent IDs;
3. определить terminal/unsettled tree;
4. отменить всё дерево, а по возможности одного ребёнка;
5. объяснить scope usage без двойного счёта.

## 6. Capacity qualification

Публичная команда принадлежит `dd-eval`, например:

```text
dd-eval harness capacity check --profile <profile-id> --max 15 \
  --project-root <isolated-project> [--write-profile true|false]
```

Алгоритм:

1. создать attempt-private workspace, harness home, journal и daemon;
2. создать одну пустую техническую root Session;
3. одним coordinator Turn попросить root одновременно вызвать не более `N`
   native leaf children штатным механизмом упряжки;
4. каждому child дать короткое конечное задание с уникальным номером;
5. считать один раз каждый уникальный direct child ID сразу после наблюдения;
6. boundedly дождаться terminal statuses; поздний failure/cancel не вычитает
   уже запущенного child;
7. не повторять, не заменять и не дополнять неуспешные запуски;
8. в `finally` отменить незавершённое дерево, остановить daemon и проверить
   отсутствие живых descendants;
9. вернуть receipt.

Минимальный receipt:

```json
{
  "schema_id": "dd-eval/subagent-capacity@1",
  "profile_id": "<profile>",
  "harness": "<harness>",
  "requested": 15,
  "started": 11,
  "completed": 8,
  "failed_after_start": 2,
  "cancelled_after_start": 1,
  "capacity": 11,
  "children": [
    {
      "session_id": "<native>",
      "parent_session_id": "<native-root>",
      "status": "completed",
      "source": "<authoritative-native-source>"
    }
  ]
}
```

`capacity = started`. Marker mismatch, malformed answer и последующий child
failure являются диагностикой, но не изменяют capacity. Child без нативного ID
не засчитывается. Root и grandchildren не засчитываются.

Qualification не создаёт Work/RUN/stage artifacts. Она не измеряет tool calls,
время удержания искусственного `sleep`, throughput или устойчивость предметной
задачи. Её число — разумный размер будущей волны, а не постоянно актуальная
гарантия свободных slots.

Активный eval profile хранит только простое проверенное значение:

```json
{
  "subagent_capacity": 11
}
```

Receipt хранится как eval evidence и копируется в resolved manifest запуска
вместе с версиями harness. Не нужен отдельный capacity registry, TTL или
автоматическая инвалидизация. После существенного изменения native subagent
механики профиль квалифицируется повторно вручную.

## 7. Productive fan-out

### 7.1 Общий launch packet

Runner больше не создаёт daemon и root Session на каждый Work. Он возвращает
текущей coordinator Session один harness-neutral packet:

```text
Launch the listed ready Works concurrently through this harness's native
depth-one subagent mechanism. Use one child per Work and no grandchildren.
Give each child its exact standalone start_command. Do not perform a child
Work in the coordinator. Wait for the launched wave with all-settled behavior,
then return control.
```

Packet содержит не более `subagent_capacity` ready Works. Конкретный tool
(`spawn_agent`, `Task`, `spawn_subagent`, `invoke_subagent` или ZCode native
subagent) выбирается самой упряжкой/моделью. Runner подтверждает результат по
provider topology и Work lifecycle, а не по словам coordinator.

### 7.2 Work binding

Productive child первым flow-действием выполняет неизменённый `start_command`.
Harness hook связывает физические `harness_id`, `session_id` и
`parent_session_id` с Work. Модель не передаёт Session ID вручную.

После claim child:

- выполняет только этот Work;
- использует authoritative Work prompt/result schema;
- не создаёт детей и другие Works;
- завершает `work finish` или `work fail`;
- не задаёт HITL пользователю: Stage interaction принадлежит coordinator.

Текстовый ответ child без принятого lifecycle finish не завершает Work.

### 7.3 Волны и частичные отказы

- Размер попытки запуска не превышает profile capacity.
- Provider refusal до child ID оставляет Work `created/ready`; после текущей
  волны этот же Work можно предложить следующей волне.
- Native child с ID, но без Work claim сначала должен стать terminal. Только
  после этого тот же ещё не начатый Work можно предложить снова, сохранив
  launch-failure evidence.
- После `work start` Work не запускается вторично. Failure проходит через
  обычный fail/recovery/repair contract с новой Session только для нового
  recovery Work.
- Ошибка одного child не отменяет здоровых siblings. Волна использует
  all-settled, сохраняет успешные результаты и разбирает каждый failed Work
  отдельно.
- Снижение реальной доступности меняет только размер следующих попыток; Work
  graph, dependencies и semantic wave не перестраиваются.

### 7.4 Workspace

Все productive children используют замороженный `workspace_root` RUN.

- CODE children могут писать в этот общий workspace; `depends_on` и
  `planned_write_areas` координируют потенциальные пересечения.
- PLAN-REVIEW и CODE-REVIEW children read-only.
- Harness-owned child worktree/isolation отключены для этого профиля.
- `project_root` остаётся lifecycle identity, `run_root` — местом технических
  artifacts; child не меняет эти роли.

## 8. Stage semantics

### PLAN-REVIEW

- Детерминированный dispatcher создаёт reviewer Works из accepted review groups.
- Каждый ready reviewer Work исполняется одним fresh native child.
- Reviewer read-only и возвращает отдельные findings/verdicts.
- Coordinator классифицирует findings и применяет принятую PLAN correction сам,
  как владелец Stage; повторное review не запускается автоматически.

### CODE

- Каждый implementation Work и каждый последующий repair Work получает fresh
  native child, включая последовательную dependency chain.
- Coordinator не реализует Work сам; он управляет волнами и делает final
  semantic verification после settled graph.
- Aggregate checks остаются в CODE fan-in, а не делегируются случайному child.

### CODE-REVIEW

- Каждый review group получает fresh read-only native child.
- Coordinator классифицирует findings.
- Принятая правка создаёт отдельный CODE repair Work и fresh write-capable
  native child; reviewer Session не превращается в repair worker.

## 9. Topology, usage and cancellation

Общий descendant receipt переиспользует контракт спецификации 014:

```json
{
  "session_id": "<native>",
  "parent_session_id": "<native-root>",
  "agent_id": "<native-or-null>",
  "subagent_type": "<native-or-null>",
  "status": "running|completed|failed|cancelled|unknown",
  "source": "<authoritative-native-source>"
}
```

Tree settlement требует terminal root Turn, terminal/idle descendants,
отсутствие pending interaction и flush provider events. Root idle сам по себе
не доказывает settled background children.

Миграция с независимых roots на native children меняет usage aggregation:

- Grok и иной tree-inclusive root не суммируется с child usage;
- physical-only providers суммируют непересекающиеся Sessions;
- `unknown` остаётся unavailable/partial до живого child experiment;
- adapter делает baseline до волны и final snapshot после settled tree;
- capacity qualification не входит в RUN totals.

Targeted child cancel используется, когда provider надёжно его поддерживает.
Если нет, healthy sibling не отменяется ради локального сбоя: runner ждёт
all-settled. Полное tree cancel разрешено для cleanup, явной остановки или
infrastructure-invalid попытки.

## 10. Изменения по репозиториям

### `dd-eval`

1. Добавить `harness capacity check` и общий подсчёт direct native IDs.
2. Расширить Codex и Grok topology receipts; переиспользовать ZCode,
   OpenCode и Agy descendants.
3. Удалить старую generic multi-root probe и ZCode `session.probe-batch`.
4. Удалить `startIsolatedWorkerDaemon`, `runFanoutWorker` и восстановление
   независимых worker roots из productive path.
5. Заменить их coordinator launch packet, topology/Work reconciliation и
   all-settled waves.
6. Валидировать `subagent_capacity` как положительное целое в Subject profile,
   записывать его в manifest и fail closed как
   `subagent_capacity_unqualified`, если Stage требует native fan-out, а
   значения нет. Обновлять только активные profiles; исторические eval inputs
   остаются неизменными.
7. Исправить устаревший usage harness key `opencode-acp` на фактический
   `opencode-server` либо удалить эту ветку вместе с external-root worker path.

### `dd-flow-cli`

1. Удалить probe constants, AGENT markers, hold/deadline и инструкции о probe
   из PLAN-REVIEW prompt.
2. Оставить только generic capacity input и packing ready Works.
3. Переименовать probe-specific response/source/error в нейтральные
   `subagent_capacity_required/configured` без описания способа измерения.
4. Сохранить Work graph, exact start command, lifecycle binding, depth-one
   policy и stage-specific result validation.
5. Обновить schemas/tests только там, где они всё ещё называют probe частью
   authored PLAN или flow semantics.

### `dd-memorybank`

1. Обновить SPC-002: capacity квалифицирует harness вне flow, а productive Work
   всегда использует тот же native-child механизм.
2. Удалить канонические требования `15 / 60s / AGENT-NN / повторить через 60s`.
3. Зафиксировать all-settled siblings, depth 1, общий workspace и разделение
   qualification/Work.

### `dd-tasks`

Код и Memory Bank продукта не меняются. Для acceptance используется свежая
изолированная копия/fixture; runtime artifacts в репозиторий не коммитятся.

## 11. Проверки и живой conformance

### Unit/contract

- direct child считается один раз после появления native ID;
- completed/failed/cancelled after start остаются в capacity;
- refusal без ID, root, duplicate ID и grandchild не считаются;
- probe не создаёт RUN/Work/stage и не вызывает `dd-flow`;
- profile без capacity отклоняет только Stage, которому нужен fan-out;
- один failed productive child не отменяет/дублирует siblings;
- child без accepted `work finish/fail` не становится завершённым Work;
- tree-inclusive usage не складывается с children.

### Harness conformance

Каждая из пяти supported упряжек проходит один и тот же двухчастный живой тест:

1. qualification доказывает, сколько прямых native children упряжка смогла
   принять в одной попытке;
2. productive smoke доказывает, что тот же native primitive действительно
   исполняет Work в PLAN-REVIEW, CODE и CODE-REVIEW.

Тесты упряжек выполняются последовательно, чтобы общий provider/account quota не
исказил результат соседней упряжки. Внутри одной упряжки используются один
активный profile, одна model/effort policy и одна workspace strategy. Нельзя
квалифицировать один subagent type, а продуктивную работу выполнять другим.

### 11.1 Общий сценарий одной упряжки

#### Preflight

1. Зафиксировать версии `dd-eval`, `dd-flow`, harness CLI/server и выбранный
   active profile.
2. Проверить auth и изолированный harness home обычным doctor/preflight данной
   упряжки.
3. Создать disposable workspace и одну техническую root Session. Чужие
   project instructions, skills и runtime state не импортируются.

#### Capacity qualification

1. Выполнить smoke `--max 3`.
2. Проверить, что `started` равен числу уникальных direct child IDs и каждый
   child ссылается на технический root через авторитетный provider source.
3. Дождаться/отменить дерево и доказать отсутствие живых descendants. Probe не
   должен создать RUN, Stage, Work или вызвать `dd-flow`.
4. Выполнить ровно одну целевую попытку с текущим qualification ceiling
   (`--max 15`, пока profile policy не задаёт иное значение).
5. Не перезапускать и не заменять отказавших/упавших детей в этой попытке.
   Последующий новый запуск после исправления adapter/prompt является новым
   attempt и сохраняется отдельно.
6. Записать `subagent_capacity = started` только после полного receipt и чистого
   cleanup. `started = 0`, потерянный parentage или незавершённое дерево оставляют
   profile неквалифицированным.

#### Productive native fan-out

Используется existing accepted portable stage-entry fixture в disposable копии
`dd-tasks`. Каноническая цепочка для этого не перестраивается. Если текущие
fixtures не дают детерминированно получить нужный граф, в `dd-eval` добавляется
одна маленькая non-scored conformance fixture: два независимых Work, один
dependency successor и один заранее ожидаемый repair case.

1. **PLAN-REVIEW:** coordinator получает launch instructions для двух ready
   read-only reviewer Works и вызывает двух direct native children одной волной.
2. **CODE:** coordinator одной волной вызывает двух implementation children для
   независимых ready Works, затем отдельной волной — одного child для dependency
   successor. Размер каждой волны ограничен квалифицированной capacity.
3. **CODE-REVIEW:** coordinator вызывает двух read-only reviewer children, а
   принятый тестовый finding превращается в отдельный repair Work и отдельного
   native child. Reviewer не переиспользуется как repair worker.
4. **All-settled negative case:** один специально назначенный child после
   принятого `work start` завершает Work через `work fail`, пока sibling штатно
   заканчивает свой Work. Успешный sibling не отменяется и не запускается заново.
5. После каждой стадии проверяются Work receipts, physical parentage, depth 1,
   общий RUN workspace, отсутствие harness-created child worktree, terminal tree,
   usage reconciliation и cleanup daemon/process tree.

Это тест транспорта и оркестрационного контракта, а не качества решения модели.
Смысловой дефект результата Work учитывается отдельно и не превращает
подтверждённый native launch в неудавшийся запуск.

### 11.2 Harness-specific evidence

| `harness` | Active test profile | Qualification evidence | Productive evidence и cleanup |
| --- | --- | --- | --- |
| `codex-desktop` | текущий supported Codex Desktop profile | child Thread ID и `parentThreadId` root | child lifecycle binding из Thread, interrupt незавершённых descendants |
| `zcode-acp` | текущий active GLM profile | `childSessionId` из `zcode/session/subagents`; нет `session/new` на каждого probe child | тот же root Turn создаёт Work children; child/background tasks settled через ACP |
| `grok-acp` | текущий active Grok profile | сохранённые `SubagentSpawned` IDs, включая уже завершившихся children | Work binding из child event/session; list/get/cancel доказывают чистое дерево |
| `opencode-server` | текущий active profile, начиная с `Hy3 Free` canary | Task child `id` + `parentID`, SSE и `/children` согласованы | тот же Task child исполняет Work; abort/children readback не оставляет descendants |
| `antigravity-cli` | текущий active Antigravity profile | `invoke_subagent` + `subagent_info.conversation_id` | child hook/stream связывает Work; process-tree cancel и terminal stream закрывают дерево |

Названия моделей в таблице намеренно не закреплены навсегда: тест берёт active
profile, который будет использовать eval. Receipt фиксирует resolved provider,
model, effort и harness version, поэтому результат воспроизводим без устаревающей
копии profile matrix в этой спецификации.

Если у Antigravity или другой упряжки child lifecycle не наблюдается trusted
каналом и Work невозможно однозначно связать с native child ID, productive
conformance считается не пройденным. Создание независимой root Session не
является допустимым fallback.

### 11.3 Assertions

Живой тест проходит только когда:

- qualification и productive run сообщают один и тот же
  `authoritative_native_source`/launch primitive;
- каждый worker имеет один физический parent — текущий Subject/coordinator;
- нет grandchildren и событий создания независимой worker root Session;
- каждый productive child принимает ровно один exact `work start`, а каждый Work
  имеет один accepted terminal `finish` или `fail`;
- intentional failed child не отменяет здоровых siblings;
- tree-inclusive usage не суммируется повторно с child usage;
- cleanup/readback показывает ноль активных descendants и процессов;
- runtime journals не попадают в Git и не содержат секретов в sanitized summary.

Успешный qualification receipt остаётся валидным, даже если часть уже запущенных
children позже завершилась `failed` или `cancelled`: это диагностика выполнения,
но не опровержение факта принятого launch. Productive conformance при этом имеет
собственный независимый результат.

### 11.4 Evidence layout и итоговый отчёт

Attempt-private evidence хранится вне Git под текущим `DD_EVAL_HOME`, например:

```text
conformance/native-subagents/<timestamp>/<profile-id>/
  preflight.json
  capacity-smoke.json
  capacity-target.json
  plan-review.json
  code.json
  code-review.json
  events.jsonl
  summary.json
```

`summary.json` содержит harness/profile versions, requested/started/capacity,
native source, root и direct-child topology, результаты трёх стадий, hook binding,
depth/workspace/usage/cleanup assertions и ссылки на локальные receipts. В Git
может попасть только очищенная сводка без auth, prompts, provider transcripts и
machine-specific absolute paths.

Рекомендуемый порядок живых запусков: OpenCode `Hy3 Free` как дешёвый canary,
затем ZCode, Codex Desktop, Grok и Antigravity. Ошибка одной упряжки не мешает
провести и зафиксировать остальные; она оставляет только соответствующий profile
неквалифицированным.

Полный E2E не нужен для первичной проверки механизма. После прохождения
focused conformance достаточно одного контрольного released-artifact E2E на
одной упряжке; остальные backend'ы проверяются теми же focused fixtures.

## 12. Порядок реализации

1. `dd-eval`: общий topology receipt и недостающие Codex/Grok observations.
2. `dd-eval`: standalone capacity qualification; удалить старый probe.
3. `dd-flow-cli`: удалить flow-owned probe semantics, оставить capacity value.
4. `dd-eval`: перевести productive fan-out на coordinator-mediated native
   children и all-settled reconciliation.
5. Прогнать unit/contract tests обоих репозиториев.
6. Провести focused conformance пяти упряжек на локальном beta engine snapshot.
7. Синхронизировать принятый контракт в canonical `dd-memorybank`.
8. Провести release impact review и только затем выбрать номера версий.

## 13. Live capacity results (2026-09-04)

| Harness/profile | Smoke | Target | Result |
| --- | --- | --- | --- |
| ZCode `GLM-5.3-Flash / max` | 3/3 | 15/15 | `subagent_capacity: 15` recorded; `zcode/session/subagents`, clean daemon. |
| Codex Desktop `gpt-5.6-sol / high` | 3/3 | 15/15 | `subagent_capacity: 15` recorded; `session_meta.parent_thread_id`, clean daemon. |
| OpenCode `big-pickle` | 3/3 | 15/15 | `subagent_capacity: 15` recorded; `/children`, clean daemon. Provider omitted terminal child state, which does not alter accepted-launch capacity. |
| Grok `grok-4.6 / high` | — | — | Clean isolated startup/cleanup; provider returned 402 quota exhaustion before a child ID, so profile remains unqualified. |
| Antigravity `gemini-3.1-pro / high` | 3/3 | — | Smoke passed through `subagent_info`; CLI auto-updated 1.1.25 → 1.1.26 before target, so pinned profile remains unqualified pending an explicit version/profile update. |
| OpenCode `hy3-free` | — | — | Provider catalog no longer contains this model; profile remains unqualified. |

All attempts are under the local `DD_EVAL_HOME` conformance evidence root and
are intentionally excluded from Git. No capacity probe created a RUN, Stage or
Work.

## 14. Commit, push and release plan

Работа выполняется в одноимённых feature branches/worktrees трёх репозиториев;
`dd-tasks` остаётся чистым.

Рекомендуемые атомарные commits:

1. `dd-eval`: `spec: define native subagent capacity and fanout`.
2. `dd-eval`: `feat: qualify and run native harness children`.
3. `dd-flow-cli`: `refactor: consume qualified subagent capacity` плюс один
   Changeset patch для следующей свободной prerelease версии.
4. `dd-memorybank`: `docs: align canonical native subagent orchestration`.
5. `dd-eval`: `test: qualify five native subagent backends` с sanitized live
   evidence references, если они предназначены для Git.

Перед push:

- `dd-eval`: `npm test`;
- `dd-flow-cli`: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`;
- `dd-memorybank`: canonical `mb-lint` и release-impact validation;
- во всех репозиториях: clean diff review, отсутствие секретов/runtime paths и
  проверка upstream branch.

Порядок доставки следует release runbooks:

1. влить и зафиксировать канонический commit, если CLI build metadata должен на
   него ссылаться;
2. применить Changeset через `pnpm version-packages`, собрать и опубликовать
   `dd-flow-cli` только после version/registry/access preflight;
3. сделать registry readback, проверить локально установленный/linked CLI,
   engine metadata и совместимость с canonical commit;
4. завершить release `dd-memorybank` только после доступности требуемого CLI
   поведения либо оформить явный publish deferral;
5. push tags/releases выполнять только по resolved operational-access binding
   и с post-mutation readback;
6. `dd-eval` не публикуется как npm package: push implementation/spec commits
   и, если политика потребует, создать репозиторный tag/release отдельно;
7. после released artifacts выполнить один короткий control eval.

Номер версии не выбирается в этой спецификации. Release impact, текущая
published baseline, pending Changesets и compatibility matrix определяют,
нужны ли следующий beta patch, stable patch/minor и Memory Bank version bump.

## 15. Acceptance

Реализация принята, когда:

1. qualification и productive Work создают детей одним native primitive;
2. каждый productive child имеет авторитетного физического parent, равного
   текущему Subject/coordinator;
3. PLAN-REVIEW, CODE и CODE-REVIEW больше не создают worker root Sessions;
4. `dd-flow` не содержит harness-specific launch/probe механики;
5. OpenCode участвует в тех же тестах и использует Task child `parentID`;
6. падение child не отменяет принятых siblings и не дублирует их Works;
7. usage не удваивается после перехода к native tree;
8. daemon cleanup доказывает settled tree для всех пяти backend'ов;
9. `dd-tasks` не получает runtime или harness-specific изменений;
10. каждая из пяти упряжек имеет отдельные сохранённые результаты qualification
    и productive live smoke, причём падение одной не скрывает результаты других;
11. commit/release evidence соответствует runbooks соответствующих репозиториев.
