# План реализации `dd-zcode daemon`

Статус: planned, not implemented  
Дата: 2026-08-28  
Затрагиваемые проекты: `dd-eval` (`dd-zcode`), pinned fork `zcode-acp`,
`dd-flow-cli`

## 1. Цель

Сделать ZCode control plane долгоживущим на время одной eval execution, чтобы
Controller мог после завершения root turn наблюдать и отменять background
subagents в том же экземпляре `zcode app-server`.

Текущий one-shot `dd-zcode` запускает цепочку
`dd-zcode -> zcode-acp server -> zcode app-server`, выполняет одну операцию и
закрывает stdio. Native Session и история сохраняются, но runtime handle
background task не сохраняется. Следующий app-server видит записанную topology,
однако `session/cancelBackgroundTask` отвечает `background_task_not_found`.
Такую topology нельзя считать settled evidence.

Новый daemon должен:

- удерживать один ACP bridge и один app-server на протяжении execution;
- принимать короткие CLI-вызовы Controller через локальный Unix socket;
- сохранять native/adapter identity, профиль, topology и события в одном
  упорядоченном journal;
- разрешать `inspect` и `cancel` после root turn и во время долгого turn;
- завершаться только после доказанного tree cleanup;
- fail closed при потере процесса или неполной cancellation.

## 2. Выбранная минимальная архитектура

```text
Codex Controller
  -> dd-zcode CLI client
      -> Unix socket in execution state-dir
          -> dd-zcode daemon
              -> persistent stdio: zcode-acp server
                  -> persistent stdio: zcode app-server
                      -> root Session
                          -> foreground/background child Sessions
```

Daemon принадлежит одной execution/workspace. Это не launchd-служба, не
глобальный процесс пользователя и не сетевой API. Для транспорта достаточно
`node:net`; новые runtime dependencies не нужны.

`zcode-acp hub` не используется: hub выполняет discovery/auth/proxy для уже
живых bridges и по существующему контракту не продлевает lifetime primary
stdio client. Демонизировать upstream `zcode-acp` в первой версии также не
нужно: `dd-zcode` остаётся владельцем eval-specific policy, evidence и cleanup.

## 3. Границы и non-goals первой версии

В scope:

- macOS/Linux Unix socket;
- один daemon на execution state directory;
- один controlled cwd/project root на daemon;
- несколько root/fork Sessions внутри одного app-server;
- один productive prompt одновременно;
- параллельные read-only `status/inspect` и аварийный `cancel`;
- foreground и background ZCode subagents;
- локальные permission/elicitation policies, объявленные на prompt;
- deterministic shutdown и crash classification.

Не входят:

- machine-wide daemon и автоматический launchd/systemd install;
- TCP/WebSocket transport, tunnel, bearer tokens и использование remote hub;
- Windows named pipes;
- собственная session database;
- автоматическое продолжение scored attempt после daemon crash;
- параллельные productive prompts в одном app-server;
- перенос Controller или Judge из Codex;
- автоматическое создание git worktree для ZCode fork.

Эти возможности добавляются только после отдельного доказанного требования.

## 4. CLI-контракт

### 4.1 Lifecycle daemon

```text
dd-zcode daemon start \
  --state-dir <absolute> \
  --cwd <absolute> \
  --journal <absolute-jsonl> \
  --zcode-acp-bin <absolute-or-PATH-command> \
  [--dd-flow-bin <absolute>] \
  [--dd-flow-home <absolute>] \
  [--project-root <absolute>] \
  --json

dd-zcode daemon status --state-dir <absolute> --json
dd-zcode daemon stop --state-dir <absolute> [--cancel-tree] --json
```

`start`:

1. Валидирует абсолютные пути и создаёт state directory с mode `0700`.
2. Проверяет exact ZCode/zcode-acp baseline до готовности.
3. Запускает detached internal command `dd-zcode daemon serve`.
4. Ждёт bounded readiness handshake через socket.
5. Возвращает `daemon_id`, PID, socket, cwd, версии и journal epoch.
6. Повторный `start` для совпадающей живой конфигурации идемпотентен; конфликт
   cwd/version/options завершается ошибкой.

`status` подключается к socket и не доверяет одному PID-файлу. Ответ включает:

- daemon/app-server health;
- started/heartbeat timestamps;
- controlled cwd и версии;
- tracked root Sessions;
- active prompt и pending interaction;
- running/ended descendants;
- clean/unclean recovery state.

`stop` без `--cancel-tree` отказывается завершаться при активном root turn,
permission или child. `--cancel-tree` делает snapshot, отменяет каждого running
child, останавливает root, повторяет inspect до bounded settled barrier, пишет
terminal receipt и только затем закрывает ACP/app-server.

### 4.2 Session operations

Daemon-mode session-команды используют `--state-dir`; параметры запуска bridge
(`--cwd`, `--journal`, binaries, dd-flow paths) больше не повторяются:

```text
dd-zcode session create --state-dir <dir> --provider <id> --model <id> \
  --reasoning <level> --mode <mode> --prompt-file <file> --json
dd-zcode session prompt --state-dir <dir> --session-id <native> \
  --adapter-session-id <adapter> --permission allow \
  --prompt-file <file> [--answers-file <file>] --json
dd-zcode session inspect --state-dir <dir> --session-id <native> \
  --adapter-session-id <adapter> --json
dd-zcode session cancel --state-dir <dir> --session-id <native> \
  --adapter-session-id <adapter> --json
dd-zcode session fork --state-dir <dir> --session-id <native> \
  --adapter-session-id <adapter> --target-json <json> --json
```

`doctor` остаётся one-shot. Старый one-shot session path временно сохраняется
только как diagnostic compatibility mode и продолжает fail closed при живом
background child. Scored/delegated ZCode profiles обязаны использовать daemon.

## 5. Локальный IPC protocol

Unix socket: `<state-dir>/daemon.sock`. State directory `0700`, socket `0600`.
Одна JSON-строка на request и одна terminal JSON-строка на response:

```json
{"schema_id":"dd-zcode/daemon-request@1","id":"uuid","operation":"session.prompt","params":{}}
{"schema_id":"dd-zcode/daemon-response@1","id":"uuid","ok":true,"result":{}}
```

Ошибки содержат стабильные `code`, `message`, `retryable` и безопасные details.
Минимальные коды:

- `daemon_not_running`;
- `daemon_config_mismatch`;
- `daemon_protocol_mismatch`;
- `operation_busy`;
- `session_identity_mismatch`;
- `profile_mismatch`;
- `interaction_policy_missing`;
- `partial_cancellation`;
- `tree_not_settled`;
- `invalid_harness_crash`;
- `bridge_exited`.

CLI exit code ненулевой при `ok:false`; stdout содержит только terminal JSON,
диагностика идёт в daemon log/journal. Большие prompt/evidence не передаются
через shell: client читает `--prompt-file`/`--answers-file` и отправляет bytes
по socket.

## 6. Daemon state и безопасность

`<state-dir>/daemon.json` содержит только операционные метаданные:

```json
{
  "schema_id": "dd-zcode/daemon-state@1",
  "daemon_id": "uuid",
  "pid": 123,
  "socket": "/absolute/state/daemon.sock",
  "cwd": "/absolute/workspace",
  "journal": "/absolute/events.jsonl",
  "started_at": "RFC3339",
  "shutdown_state": "running|clean|unclean",
  "versions": {"zcode":"0.16.5","zcode_acp":"0.13.0"}
}
```

Session history и usage не дублируются в собственной БД. Authoritative facts
читаются из живого app-server, а append-only journal хранит receipts.

Socket bind является главным single-owner lock. При существующем socket `start`
сначала выполняет handshake. Удалять socket можно только после доказанного
`ECONNREFUSED` и проверки, что путь является socket внутри exact state-dir.
PID никогда не используется как единственное доказательство identity и не
сигналится без совпавшего `daemon_id` handshake/state.

Daemon не принимает произвольные cwd или binaries после запуска. Это исключает
перенос Session filesystem scope через последующий CLI request. Secret/token не
нужен: доступ ограничен локальным directory/socket mode.

## 7. ACP ownership и маршрутизация

Текущий `AcpBridge` нужно извлечь из one-shot wrapper в переиспользуемый объект
с явными `start`, `request`, `notify`, `flush`, `close`.

Daemon владеет:

- одним `AcpBridge` и непрерывным JSON-RPC request id sequence;
- mapping `adapterSessionId -> providerSessionId`;
- per-session active operation и permission/elicitation policy;
- root provider identity для `dd-flow` forwarding;
- одним journal writer и monotonic order;
- registry известных roots и последней authoritative topology.

ACP server requests (`session/request_permission`, `elicitation/create`)
маршрутизируются по Session активного prompt к объявленной policy. При
неоднозначности или отсутствии policy ответ fail closed (`deny/decline`) и
операция получает `interaction_policy_missing`.

Уведомления `session/update` продолжают синхронно проходить через
`dd-flow zcode event handle` до side effect. Root provider ID берётся из
daemon mapping, child identity — из `_meta.zcodeRuntime`.

## 8. Конкурентность

Первая версия использует один productive-operation lock для
`create/prompt/fork/profile mutation`. Это соответствует одному активному
Subject execution и исключает сложную маршрутизацию interactions.

`inspect/status/cancel` не ставятся за долгим prompt:

- `inspect/status` читают snapshot через тот же bridge;
- `cancel` может остановить активный root turn и descendants;
- `stop --cancel-tree` использует тот же high-priority control path;
- второй productive request получает `operation_busy`, а не молча ждёт.

После доказанной потребности lock можно сузить до Session, но не в MVP.

## 9. Background tree и cancellation

После terminal root turn daemon не закрывает bridge. Running background child
остаётся управляемым и отображается в `session inspect/status`.

Tree cancel:

1. Снять authoritative `session/subagents` snapshot.
2. Для каждого `running` вызвать `session/cancelBackgroundTask` по runtime task
   identity (`taskId`, иначе проверенный `agentId`).
3. Отправить root `session/cancel`/stop.
4. Poll `session/subagents` и root status до terminal или timeout.
5. Записать before/cancellation receipts/after в одном journal epoch.
6. Вернуть success только при пустом `running` и отсутствии pending permission.

`background_task_not_found`, `lost` или оставшийся `running` — это
`partial_cancellation`, а не success. Такой execution не проходит settled
barrier и не может быть scored.

## 10. Crash и recovery contract

Daemon пишет `shutdown_state=running` до начала работы и `clean` только после
успешного shutdown. При старте поверх state с `running` и отсутствующим живым
socket прошлый процесс считается unclean.

- Если journal доказывает, что до crash tree был settled, новый daemon может
  восстановить foreground/native Sessions и обязан заново проверить profile.
- Если последний authoritative snapshot содержал running turn/child,
  permission или неполную topology, execution получает
  `invalid_harness_crash`. Автоматический scored resume запрещён.
- Persisted ZCode status `running` после cold resume не доказывает живой task;
  его нельзя автоматически переписать в cancelled.
- Operator может открыть diagnostic daemon для inspect/export, но новый eval
  attempt должен стартовать отдельно.

## 11. Изменения по файлам

### `dd-eval`

Минимальное целевое разбиение:

- `lib/dd-zcode.mjs`: provider/session operations, работающие с переданным
  bridge; one-shot wrapper остаётся тонким.
- `lib/dd-zcode-daemon.mjs`: Unix server/client, state lifecycle, operation
  lock, recovery и shutdown.
- `bin/dd-zcode.mjs`: parsing/routing команд `daemon *` и session transport
  selection.
- `test/dd-zcode.test.mjs`: существующий one-shot contract.
- `test/dd-zcode-daemon.test.mjs`: один fake-ACP integration suite daemon.
- `runbooks/harness-backends.md`: operator flow и ограничения.
- `runbooks/dd-zcode-daemon-plan.md`: этот delivery contract.

Не создавать отдельный package, generic harness SDK, ORM или transport
framework.

### Pinned `zcode-acp`

Новых daemon primitives не требуется. Сохраняются существующие extensions:
resolve/read/subagents/usage/events/fork/cancelBackgroundTask и durable native
workspace aliases. Изменения допускаются только если live test выявит
отсутствующий authoritative status/cancel field.

### `dd-flow-cli`

Текущий `zcode event handle` остаётся lifecycle boundary. Нужно лишь:

- добавить daemon/runtime version и `daemon_id` в retained native evidence;
- считать `invalid_harness_crash`/`partial_cancellation` незавершённым barrier;
- не менять root/child identity и idempotent harness binding.

## 12. Этапы реализации

### D0. Зафиксировать protocol и docs

- Добавить planned operator flow и этот документ.
- Зафиксировать one-daemon-per-execution, Unix-only MVP и crash semantics.
- Не менять действующий one-shot CLI.

Acceptance: документация не выдаёт planned commands за доступные; non-goals и
failure states перечислены явно.

### D1. Извлечь reusable ACP bridge

- Отделить transport ownership от `withBridge`.
- Передавать notification, permission и elicitation policy на операцию.
- Сохранить byte/order semantics текущего journal.
- Оставить one-shot тесты зелёными.

Acceptance: старые create/prompt/inspect/fork/cancel работают без изменения
JSON receipt; foreground live smoke проходит.

### D2. Реализовать daemon IPC и state lifecycle

- `daemon serve/start/status/stop`.
- Unix socket modes, readiness handshake, idempotent start, stale socket guard.
- Exact version/cwd/config receipt.
- Productive-operation lock и bypass для inspect/cancel.

Acceptance: два CLI-процесса используют один daemon PID/app-server; конфликтный
start и второй productive request fail closed.

### D3. Перевести session commands на daemon transport

- Добавить `--state-dir` routing.
- Хранить adapter/provider mapping в живом daemon.
- Перенести profile application и dd-flow forwarding без изменения evidence.
- Оставить explicit one-shot diagnostic path.

Acceptance: create в одном CLI-процессе, prompt/inspect в других используют один
ACP epoch и возвращают ту же native identity/cwd/profile.

### D4. Background tree, cancellation и shutdown

- Не отменять background child после terminal root turn в daemon mode.
- Реализовать concurrent cancel и `stop --cancel-tree`.
- Добавить bounded settled polling и partial-cancellation receipt.
- Запретить fork/clean stop при running descendants.

Acceptance: live child с `sleep 60` виден после завершения root turn, отменяется
следующим CLI-вызовом, переходит в terminal, process отсутствует, daemon остаётся
здоровым и затем cleanly останавливается.

### D5. Crash classification и eval/dd-flow wiring

- Atomic daemon state updates и journal epochs.
- Обнаружение unclean predecessor.
- `invalid_harness_crash` propagation в attempt/barrier.
- Запись `daemon_id`, versions и execution scope в evidence.

Acceptance: hard-kill daemon с running child никогда не приводит к success,
settled или scoring после restart; clean idle restart повторно проверяет profile.

### D6. Conformance и rollout

- Fake-ACP unit/integration tests.
- Реальные ZCode live tests в временном workspace.
- Обновить Controller runbook на daemon path.
- Сделать daemon обязательным только для delegated ZCode profiles.
- Один diagnostic eval, затем один focused eval; E2E только после clean cleanup.

Acceptance: все project suites зелёные, live evidence сохранено, beta/main не
получают merge до ручной проверки результатов.

## 13. Обязательные тесты

Автоматические:

1. Start/status/idempotent start/clean stop.
2. Reject relative paths, mismatched cwd и unsafe stale socket.
3. Create -> prompt -> inspect из трёх CLI clients с одним bridge epoch.
4. Exact observed provider/model/reasoning/mode после cold and live resume.
5. Background child остаётся running после root turn.
6. Concurrent cancel достигает того же backend task и terminal topology.
7. Stop без flag отказывается при running tree; `--cancel-tree` завершается.
8. Partial cancel/lost task блокирует settled.
9. Permission allow/deny и elicitation answers не пересекаются между requests.
10. Lifecycle event поступает в `dd-flow` до соответствующего Bash side effect.
11. Child event сохраняет native child/parent/agent identity.
12. Journal order монотонен между несколькими CLI clients.
13. Второй productive request получает `operation_busy`.
14. Bridge exit отклоняет pending requests и помечает daemon unhealthy.
15. Unclean restart с running snapshot даёт `invalid_harness_crash`.

Живые:

1. Daemon запускает pinned ZCode/zcode-acp и проходит doctor.
2. Root Session материализуется и переживает несколько CLI-вызовов.
3. Root запускает foreground child; cwd и topology совпадают.
4. Root запускает background `sleep 60`, возвращает terminal turn.
5. Отдельный `dd-zcode session inspect` видит running child.
6. Отдельный `dd-zcode session cancel` действительно останавливает child.
7. `dd-flow session register` сохраняет `harness=zcode-acp`.
8. Clean stop не оставляет `zcode app-server`, child process или socket.
9. Fork выполняется только в dedicated workspace и с explicit safe target.
10. Hard-kill experiment приводит к invalid attempt, а не recovery success.

## 14. Definition of done

- Delegated ZCode execution всегда использует execution-scoped daemon.
- Background descendants наблюдаемы и отменяемы после root turn.
- `cancel` и `stop --cancel-tree` доказывают terminal topology.
- Crash с недоказанным running tree блокирует checkpoint/Judge/scoring.
- Native/adapter identity, cwd и exact profile не меняются между CLI clients.
- Lifecycle forwarding и root/child binding остаются trusted и ordered.
- В daemon нет новых внешних dependencies, network listener или собственной БД.
- One-shot foreground diagnostic остаётся совместимым и fail closed.
- Runbook содержит реальные команды запуска, работы, диагностики и cleanup.
- Все unit/integration/live проверки имеют retained JSONL evidence.

## 15. Порядок коммитов

1. `docs: specify persistent dd-zcode controller`.
2. `refactor: make ZCode ACP bridge reusable`.
3. `feat: add execution-scoped dd-zcode daemon`.
4. `feat: route ZCode session control through daemon`.
5. `feat: enforce persistent tree cancellation evidence`.
6. `test: validate live ZCode daemon lifecycle`.

После каждого шага feature-worktree остаётся самостоятельно тестируемым.
Merge в beta выполняется только после D6 и ручного просмотра live journals.
