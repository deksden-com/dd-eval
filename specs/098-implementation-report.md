# 098 — Implementation / native acceptance receipt

Дата: 2026-10-23. Ветки: engine `fix/098-native-tree-settlement`,
EVAL `fix/098-native-tree-consumers`. Базы: engine `6aa020e8`, EVAL `610e3ef`;
097 остаётся явной зависимостью, это не уже интегрированный или выпущенный main.
Engine implementation commit: `047a48c5` (candidate, не release-accepted).

## Реализовано

- Native child contract `@2` отвергает противоречивые terminal/live/pending facts,
  отрицательные tree observations и пропущенные узлы. Producers устанавливают
  freshness; status rank не определяет более свежую попытку. Общий tree readiness
  `native-tree-settlement@1` используется engine и pinned EVAL consumers.
- Exact stream-bound `inspection_pending` ожидается read-only до productive retry
  intent. Свежий proof не переписывает исходный ERROR; ни poll, ни cached failure
  не расходуют новый overload retry и не продлевают silence window.
- ObservationClock различает передачу живого producer snapshot и восстановление
  после настоящего restart; сохраняет явную uncertainty, включая clock skew.
- AGY: private unary gRPC client, generated protobuf slice, exact transport/runtime
  dependencies; отдельный startup log для каждого physical launch, loopback socket
  ownership/PID birth и native metadata binding. Собственный launch CSRF token
  передаётся локальному RPC, не сохраняется в config/journal/diagnostics.
- AGY: single-flight observer вне stdout drain/hook; retained observation episode
  после ERROR; late RPC fenced по connection/generation/activity/cancel. Unbound
  Stop — hint, не current-Turn authority. Fresh native admission нового процесса
  отделён от исторического stream request и прежнего clean shutdown.
- OpenCode: единый current-turn busy verdict, per-aggregate durable revision fence,
  один bounded re-read при смешанном snapshot; отсутствующий fence — unknown.
  Retained children не исчезают вместе с listing, inspect/cancel обходят одну
  ownership topology. Deleted/404 сами по себе не означают success/idle.
- Droid: shape/Task/resume coverage и nested ancestry; missing catalog допускается
  только в доказанных no-child случаях. Свежий complete catalog снимает unknown.
  Убийство процесса не синтезирует native cancelled outcome.
- EVAL: productive contract loading strict, historical read-only `@1` совместим.
  Cancellation ACK/physical stop/native settlement разделены; stable
  cancellation_unconfirmed не даёт capture/completion. Одиночная cancellation
  не завершает весь EVAL и не останавливает чужие executions.
- Общий failure diagnostic ограничен 32 KiB UTF-8; сохраняет primary cause,
  physical/native flags, capability reason и proof locators; credentials redacted
  также во вложенных check diagnostics и строковых массивах.

## Дополнительно найдено при реализации

N09: native-capacity qualification принимала stopped/settled ACK без clean.
Исправлены producer и replay. Общий `nativeShutdownConfirmed` также используется
controller, recovery, runtime scope/history и retained daemon recovery;
`clean:false` или explicit `native_settled:false` не дают grant.

При независимом review исправлены: ложный повторный restart при передаче clock;
потеря uncertainty clock-skew; stale ERROR items вместо свежего stream proof;
недостающий fresh-instance AGY metadata probe; ложная equivalence physical/native
у Droid; credentials в allowlisted diagnostic strings. Старый fanout test fixture
получил настоящую issued finish authority, не ослабление production guard.

## AGY P3 — частичная native-приёмка, НЕ qualification PASS

Проверен установленный AGY 1.4.5, SHA256:
`0c5ecd1f69c06d57178cc3e9c7be08b84f00207a6182b937243f743576798570`.

На новых disposable unscored instances подтверждены physical ownership, native
authentication, metadata/root/workspace binding и read-only idle RPC. Bootstrap
не вызывает модель. Отдельные fixture prompts создавали child/background работу;
последняя проба подтвердила root SUCCESS → fresh idle после завершения работы.
Сама inspection не посылала дополнительных сообщений модели.

Но не подтверждены все обязательные native условия P3: root terminal с живым
child, child terminal с ещё работающим native background, изолированный running
grandchild, queued completion delivery, persistent/timer work, реальные native
executor-error и late-cancel/restart. Marker-файлы не подменяют native evidence.
Root stream раскрывал direct child; наличие grandchild в owned store само по себе
не доказывает его состояние на каждом RPC boundary. Это отсутствие достаточной
приёмки, **не доказанная ошибка самого native RPC**.

Полный qualification receipt НЕ создан. Production AGY prompt требует matching
native qualification; `--no-flow` не bypass. Поддержан внешний абсолютный путь
`DD_AGY_NATIVE_QUALIFICATION`; receipt проверяет binary/client-policy/evidence
hashes и все required cases. Partial bootstrap receipt для допуска не подходит.
Следовательно, AGY whole-tree capability пока нельзя объявлять accepted/released.

Последний raw investigation receipt (qualified=false, physical_cleanup=true):
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/agy-native-inspection-edDCIg/bootstrap-receipt.json`.
Это временный investigation artifact, не переносимая production qualification.

## Проверка и границы

Локальные affected проверки по policy095, без полного release profile/GitHub CI.
Финальные повторные проверки на собранных изменениях:

- Engine: `pnpm typecheck`, `pnpm lint`, `pnpm build` — PASS;
  `node --test scripts/verify-release-build.test.mjs` — **2/2 PASS**;
  Vitest codex-capacity, native-tree-adapters-098, agy-state-boundaries,
  vnext-fanout-storage, recovery-observation-budget — **98/98 PASS**.
- EVAL: `DD_FLOW_SOURCE_ROOT=<engine checkout> node --test --test-concurrency=1`
  для judge-capacity, capacity-policy, control-plane, execution-state,
  runner-cancel, check-diagnostic086, operation-progress-recovery,
  judge-observation-cleanup, hitl-issuance, observation-clock — **113/113 PASS**,
  без skips.
- Engine Node fixtures: provider-overload-adapters, operation-observation,
  droid-adapter, agy-adapter — **55/55 PASS**, без skips.
- Дополнительно ранее: lifecycle/observation/controller capacity — 179 PASS;
  memory-init capacity/recovery/runtime-scope-stop — 48 PASS; AGY native wire
  deterministic fixture — 11 PASS. Это affected проверки, не release acceptance.
- Изолированный install упакованного engine (без source/node_modules symlink):
  native client, generated schema и Runtime импортируются успешно;
  client policy SHA256 `5e66b9778e53174b05ca5517dbb4f6e655d84b3673b9882d64500ca83aa41895`.

Исторические/работающие EVAL, их runtime artifacts/DB и установленные hooks/pins
не изменялись. Новых scored EVAL, release, npm publication и merge не выполнялось.
Текущий запрос заканчивается commit/push candidate branches; native P3 limitation
не скрывается общим зелёным количеством unit/fixture tests.
