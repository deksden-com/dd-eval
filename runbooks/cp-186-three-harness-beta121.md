# CP186 — beta.121: поставка и три scored E2E

Срез: 2026-09-29 17:54 UTC (19:54 Europe/Kaliningrad). Продолжает [план 056](../specs/056-cp185-three-harness-flow-repair-plan.md). Это отчёт о поставке и наблюдении, **не** подтверждение трёх полных циклов. Старые EVAL, продукт и runtime artifacts не изменялись. Отчёт ведётся в отдельном checkout, чтобы не менять definition живой Luna. Heartbeat выключен; Grok исключён до подтверждения доступности после лимита 2 октября.

## 1. Что поставлено и проверено

- dd-flow: `2e7bef9a7813bd003855d94b394e63d8aa5f6419`, `0.9.0-beta.121`, tag `v0.9.0-beta.121`. P1: Work-local checks назначаются через item verification, aggregate declarations остаются доступны; проверяются provider reachability и вклады общих AC. P2: exact terminal settlement и надёжная birth identity; observer birth снимается до registry write. Основные commits: `7a4ac0e`, `58781dc`; `2e7bef9` уточняет reused-PGID fixture.
- [Release CI](https://github.com/deksden-com/dd-flow-cli/actions/runs/36596026059) для **этого exact commit**: `success`; prepare, runtime-sensitive, все четыре integration shards, candidate и publish успешны. Прерванные исторические suites не являются этим подтверждением.
- dd-eval: P3 в `b2d5895`, CP186 pins в `d987f083194a1670fe95dd91763512157182064a`. Frozen final acceptance `task-priority@2`: изменяемый suffix протокола, точные claims/curated refs, финальные MERGE bindings/receipts/hash/containment; unknown checker отклоняется до provider Session. Локальный dd-eval suite: 344 PASS, 8 skipped.
- Package integrity: `sha512-anF3BwHLeAK3+Wj5yGkkJ/6Shm7ytSoMak538uvdtKxXDdQPH+RScFqgektlu0HKYe3DbC6G7avCHL8971IvLQ==`. Engine content checksum во всех CP186 homes: `a614d93a0821cb58064d8ff6b2a5e83414df6e540af9de07a338f85b00b4f13f`. Published-engine/engine-probe проверены против версии, commit и canon. Установленный глобальный dd-flow также beta.121.
- Checkpoint `checkpoints/cp-186-task-priority-merge-engine-0-9-0-beta-121.json`, SHA256 `bf8e4b8a01224792a0960e0a2eb48f4fe586f34457e48ba7642d3d300d8f397b`. Product source: `dd-tasks`, commit `d81cd0acd589a35789aec4c5291ffb5a6efd2d4e`, tag `eval/cp-172-source-baseline-setup`. Source не исправлялся вручную.
- Luna/ZCode definition: checkout `dd-eval-cp176-followup`, commit `d987f083194a1670fe95dd91763512157182064a`, tree `fedd6262b4390c444f8b647d633e7eee96d9878c`. AGY: отдельный `dd-eval-cp186-agy`, commit `a511d5fde160c37e7c2abc834f45386a82d1fa64`, tree `ac2374a2694f9f671780cb9f7a588fc528cabc85`; отличается только квалифицированным runtime/profile AGY. Case/checkpoint общий. После старта definition не редактировался.

## 2. Квалификация и запуски

Homes находятся под `/Users/deksden/.dd-eval/qualification/`.

| Harness | Home | EVAL | Квалифицированный профиль |
| --- | --- | --- | --- |
| Luna | `cp-186-luna` | `EVAL-20260929164326-5b90a479` | Codex CLI 0.157.0, `gpt-6-luna/xhigh`, через `cx` / `~/.codex-cpa` |
| AGY | `cp-186-agy` | `EVAL-20260929165726-d6ef470d` | AGY 1.2.13, `dd-agy-harness@1`, `gemini-3.1-pro-high` |
| ZCode | `cp-186-zcode` | `EVAL-20260929164450-ec00147c` | ZCode 0.16.9, bridge 0.46.7 (`636b1418…`), `dd-zcode-harness@2`, GLM-5.3-Flash/max |

Final/interaction Judge — `gpt-6-sol/high` во всех профилях. У каждой упряжки preflight PASS и baseline PASS (install/quality/browser/isolation). Пять interaction/HITL qualification cases PASS у каждой. Qualification keys: Luna/ZCode `c042e45c6aa09ad6ca440f7e904bd03e956d8391e231f0411bb7238e4a9b8e84`; AGY `ab45e5a0a8738a7e9e1b9b96a9f2e9cae55402a30842c28900a50ce8c3e55f61`.

Первая AGY native qualification получила location eligibility rejection. После сообщения пользователя о восстановлении доступа новая qualification прошла root/direct-child smoke. Capacity: 15 started, 0 completed, все `settled_by_root`, cleanup clean — **это settlement, не Work success**. Hooks установлены до baseline и закреплены отдельным qualification receipt. Codex hooks указывают на абсолютный актуальный launcher; `~/.codex-cpa/hooks.json` — symlink на `~/.codex/hooks.json`. Требование обновления закреплено в `runbooks/update-harnesses.md`.

Штатные команды выполнялись из соответствующего definition checkout с четырьмя явными переменными, для каждого home одинаково:

```sh
DD_EVAL_HOME=<absolute-home> \
DD_FLOW_BIN=<absolute-home>/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js \
DD_FLOW_CONFIG_HOME=<absolute-home>/engine-config \
DD_FLOW_RESOURCE_HOME=<absolute-home>/resources \
node bin/dd-eval.mjs runner eval preflight --profile <absolute-profile>
```

После PASS — `runner eval run --profile <absolute-profile>`. Наблюдение — `runner status --eval <absolute-home>/runs/<EVAL>` с тем же окружением. Actual Stage определялся по RUN timeline и Work artifacts, не manifest entry-stage.

## 3. Результаты на момент среза

| Harness | Actual Stage / outcome | Settlement | Full cycle / Final Judge |
| --- | --- | --- | --- |
| Luna | PLAN завершён; PLAN-REVIEW с 17:45:09Z, `awaiting_provider`, controller owner alive | Активный RUN, stop не запрошен | Пока не достигнут |
| AGY | PLAN, `completed_with_failures`, primary `agy_directory_mismatch` | `settled` | Не достигнут |
| ZCode | PLAN, `completed_with_failures`; первичный native admission timeout, затем `invocation_receipt_timeout` | `settled` | Не достигнут |

SPECIFY HITL и PROTOCOLIZE завершены у всех трёх. У Luna завершены reviewer Work `WRK-005` и `WRK-006`; `WRK-007` и `WRK-008` начали работу в 17:53:52Z / 17:54:13Z. Это durable прогресс, не только heartbeat. AGY report сохраняет `run_validity=valid`, ZCode — `invalid_infrastructure_flow`; report classification не менялась задним числом и не означает full-cycle PASS. Для AGY доказанный infrastructure diagnostic defect ниже требует отдельного рассмотрения attribution.

## 4. AGY: почему получился ложный cwd blocker

Controller `DRV-93e0f73d-8794-463c-afda-abd49185a2ff`; native Session `c870fb0f-4238-4300-b494-7341774d8d73`; daemon `36d7fc37-fa46-4a2c-90c8-d34bbbcb59d9`, generation 1, operation `DRV-93e0f73d-8794-463c-afda-abd49185a2ff:prompt:bb8de4e5-2eca-41fd-9bc1-3918334451ec`; PLAN начат 17:08:47Z, ошибка 17:13:18Z. В step 42 агент передал `run_command`:

```sh
node fix-plan-refs.js && "$DD_FLOW_BIN" stage finish --stage plan --json
```

PreToolUse отказал **до исполнения shell**. Фактический launch cwd — правильный PLAN feature checkout `dd-flow-home/projects/PRJ-001-project/checkouts/worktrees/RUN-RUN-001/project`, `actual_provenance=launch_bound`. Hook ожидал ошибочно стабильный `executions/e2e/project`. Retained rejection имеет `details.effect=unknown`: наблюдение pre-CLI отказа не является runtime-issued retry authority, и старый EVAL нельзя возобновлять на основании этого расследования.

Причинная цепочка в beta.121:

1. `src/services/hooks.ts:handleControlledToolEvent` получает RUN scope через `observedLifecycleInvocation` для public lifecycle call без RUN/Work options.
2. `src/services/lifecycle-invocations.ts:observedLifecycleInvocation` возвращает `null` для compound command: принимает только standalone.
3. `controlledLifecycleCwd` без RUN reference возвращает stable project root. Cwd guard отказывает **раньше** shared lifecycle syntax validation.
4. Агент действительно нарушил standalone-инструкцию. Но корректная причина отказа — shell composition, а не смена launch workspace. `observeLifecycleInvocation` мог бы выдать `invocation_command_invalid`, `phase=prepare/effect=no_effect`, однако до него не дошло.
5. `src/harness-runtime/lib/dd-agy-daemon.mjs:rejectHook` завершает active Turn при любом таком отказе. В shared handler AGY/Grok compound branch также `recoverable=false`, тогда как другие пути сохраняют `lifecycle_shell_syntax_invalid/effect=no_effect/recoverable=true`. Общий `src/harness-runtime/lib/delegation-instructions.mjs:lifecycleRetryInstruction` разрешает исправление native pre-CLI shell-form refusal, но это не соответствует завершению Turn здесь. Возможность корректировки должна согласовываться с фактическим runtime contract, а не только текстом prompt.

Минимальное системное продолжение: вынести синтаксическую диагностику перед cwd-выводом либо использовать уже распознанную lifecycle форму для точного scope без разрешения её исполнения; сохранить authority/identity/cwd validation. Отдельно определить единый no-effect correction contract для managed hooks. Разрешать только исправленный **точный issued command** без изменения scope; authority errors, неизвестный эффект и поздний timeout остаются blockers. Не принимать compound call и не ослаблять cwd guard ради этого случая.

Регрессии: standalone/compound/wrapped calls; стабильный root и feature checkout; AGY/Grok и соседние controlled entrypoints; правильный cwd + неправильный syntax не даёт directory mismatch; реально чужой cwd остаётся denied; no-effect correction не завершает Session, если контракт её допускает; stale/foreign identity остаётся fatal. Это новый defect CP186, не доказательство непоставки P1/P2.

## 5. ZCode: первый timeout находится до CLI receipt deadline

Controller `DRV-4ef72191-ccba-400f-9faa-50afd06c1d4a`; native Session `sess_ffd27d18-6175-481e-a2a8-88e100dc4a0c`; adapter Session `8ecce582-c1d2-464f-ad52-f5bfa52d911d`; daemon `3c353b4f-d2bc-46f3-9b6e-d84d5eea0c75`; tool `call_36116b1788ee46c4bade428a`; lifecycle invocation `133af7ab-b4a0-4ffc-a41e-dae7ed4e94c1`.

Агент передал корректный публичный standalone command:

```sh
"$DD_FLOW_BIN" stage finish --stage plan --json
```

Отсутствие internal invocation ID **не ошибка агента**: dd-flow намеренно убирает внутренние ID/RUN/project options из model-facing команды.

| UTC | Retained event |
| --- | --- |
| 17:30:40.696 | ACP tool_call pending, adapter journal order 990, точная команда выше |
| 17:30:55.963 | order 1000, `notification_failure`: `native_hook_timeout`, `Bounded CLI request timed out`, matching Session/tool, `delivery_stage=lifecycle_receipt`, `completeness=incomplete` |
| 17:31:30.376 | lifecycle ledger: `invocation_receipt_timeout`; нет native confirmation; `effect=no_effect`, state не изменён |
| 17:31:31.215 | Native Bash завершён exit 1, duration 50191 ms |
| 17:31:51 | Последующая controller cancellation; не первопричина |

Доказано: bridge получил native event; observer вызвал `zcode event handle` через `invokeNativeHook`, и subprocess не дал admission result за default 15000 ms. Receipt timeout через 30 секунд — следствие отсутствующего подтверждения. До этого успешные lifecycle receipts существовали; для failed finish receipt не записан. Ledger `no_effect` относится к lifecycle transition; timeout subprocess сам по себе сохраняет `effect=unknown` и не доказывает отсутствия любых ingress побочных эффектов.

**Почему admission handler превысил 15 секунд — пока не установлено.** Retained журнал не содержит фазовых времён. Нельзя объявлять причиной SQLite lock, нагрузку хоста или медленный import без корреляции. Read-only import probe exact frozen hooks module занял 520 ms и задержку не воспроизвёл. Hook-mode DB использует busy_timeout 4000 ms, без migrations/VACUUM; запись ZCode receipt SQL-only, managed native owner inspection относится к AGY/Grok, не этому пути. Высокая host load после события — контекст, не причинное доказательство.

Установленный диагностический дефект: `runBoundedCommand` сохраняет timeout `error.details` (elapsed/effect/cleanup), но `AcpBridge.receive` записывает в `notification_failure` только code/message/Session/tool, теряя эти details. Внешний observer budget 15 s, inner native input budget 25 s, CLI receipt budget 30 s: увеличивать только внешнюю цифру без общей deadline и измерения фаз недостаточно.

Минимальное системное продолжение: сохранять ограниченные безопасные timeout details в существующем journal, связать первую admission failure с ledger/controller primary error; добавить фазовые bounded diagnostics только на нужной ingress границе. На отдельном тестовом runtime воспроизвести cold start, contention и concurrent receipt writes, определить реальную задержку и согласовать budgets. Не вводить общий retry framework; timeout с неизвестным эффектом **не** разрешает повтор productive command. При позднем commit только reconciliation, не replay.

Регрессии: details/identity переживают adapter→controller→EVAL reporting; первый timeout не заменяется вторичным receipt deadline; поздний allow/commit не становится разрешением повтора; cleanup подтверждён отдельно; быстрый happy path сохраняется. До воспроизведения причина latency остаётся открытой.

## 6. Где лежит причинное evidence

Для каждого EVAL: `<home>/runs/<EVAL>/reports/report.json`, `executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/timeline.jsonl` и `controllers/<DRV>/session-3/`. У ZCode ключевые файлы — `adapter.events.jsonl`, `model-observations.jsonl`, `daemon.json`, `controller.log`, readonly `dd-flow-home/db.sqlite` (`lifecycle_invocations`, `hook_events`). Native tool timing — `/Users/deksden/.zcode/cli/log/zcode-2026-09-29.jsonl`. У AGY exact rejection сохраняется в `daemon.json:last_hook_rejection` и adapter/controller evidence. Эти файлы не изменялись расследованием.

## 7. Граница завершения

Плановая реализация P1/P2/P3, release и подготовка/запуск CP186 выполнены. **Acceptance goal трёх технически корректных полных циклов остаётся незакрытым.** Failed AGY/ZCode не возобновляются; Luna не останавливается из-за их failures. Новые fixes применяются только к новой версии и новой попытке. Продукт не исправляется вручную; Final Judge/case acceptance отсутствуют для незавершённых циклов. Проверка по ponytail исключает timeout bump без причины, provider-specific обходы cwd, повтор неизвестного эффекта и новый framework вместо исправления существующих shared boundaries.
