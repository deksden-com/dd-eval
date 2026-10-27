# 108 — Ревью и интеграция

2026-10-27. Исходный план: [108](108-thin-hooks-progress-and-native-recovery-plan.md).
Проверены реализация, её реальные callers и merge с параллельной линией E5.
Три независимых участка ревью перепроверены родительским агентом.
Подход ponytail: существующие ledger, ObservationClock и CAS, без новой очереди,
модельного классификатора или полного gate.

## Существенные находки и исправления

| Дефект | Исправление и регрессия |
| --- | --- |
| Тяжёлый `hook.verify` всё ещё имел 5-секундный total timeout, снаружи — абсолютные 30 секунд ожидания receipt | Exact read-only verification использует существующий bound operation-progress ledger. Реальные native chunk/node/read checkpoints продлевают окно; повтор snapshot/heartbeat, чужой scope, future/expired checkpoint — нет. Никаких productive admission, semantic settlement или replay из этой проверки. Проверены реальный socket и SQL waiter. |
| AGY fast registration оставлял старое idle proof | Первый уникальный native callback инвалидирует прежние proof/revision/active-tree; duplicate не инвалидирует повторно и не продлевает окно. Creator prompt остаётся unconfirmed. |
| Graceful AGY retirement мог сначала ForceStop новое required work, затем получить idle и сохранить старый SUCCESS | Fresh active executor/child, required или unclassified task инвалидируют старое proof и блокируют stop **до control RPC**. Explicit cancel остаётся отдельным путём. Support daemon может быть остановлен; semantic result не переписывается. |
| Retirement AGY делил 10 секунд между всеми native nodes/control фазами | Существующее скользящее окно продлевается на реально завершённых reads/phases, не на polling/liveness. Многоузловая детерминированная регрессия проходит дольше исходного total budget. |
| Ordinary managed hooks всё ещё делали inventory/model-history/CLI | AGY сохраняет наблюдение и Stop hint без topology lookup/CLI; OpenCode daemon классифицирует ordinary shell, plugin проверяет exact observation ACK; Droid ordinary Execute и Read/Edit не читают metadata/CLI. Unmanaged/noFlow и participating/auxiliary/unresolved пути сохраняют нужные проверки. Callback не выдаёт receipt/creator/idle authority. |
| Bridge терял stdout/stderr progress child после ответа root | Late source-bound progress доставляется с исходными native turn/session/tool IDs. Повторный/пустой snapshot не activity; порядок start→progress→terminal сохранён; недоставленный snapshot не считается отправленным. Progress после уже увиденного terminal не оживляет tool. |
| Старая callback публичного Work start могла постоянно выигрывать выбор у нового successor | Existing exact native identity lookup оставляет старую доставку у immutable predecessor; свежий tool получает текущий issued successor. Реальная SQLite-регрессия сначала воспроизвела starvation, после исправления зелёная. |
| Слияние с E5 могло потерять новые flow routes либо shape coordinator custody | Сохранены delivery/interactive/repair/distill routes, next-question authority и plan108 assigned bypass. Общая регрессия: assigned start без fresh hook → E5 author read → assigned finish → историческое чтение при другом ambient assignment. Потерянное saved admission по-прежнему отказ. Fresh interactive child требует собственный claimed physical start. |
| EVAL fixtures путали all-role scope read с per-execution native read | Раздельные mock schemas/logs с exact EVAL scope; foreign/symlink path negatives сохранены. Physical cleanup и capture ожидания разделены. Runtime E1–E4 проверен, дополнительного substantive дефекта не найдено. |

При инвентаризации старых release-веток найдены две ещё не перенесённые ownership
строки scoped verification для `code-work-result.schema` и `review-reconciliation106`.
Они перенесены с прежней регрессией; новая классификация не запускает полный gate.
World-readiness fix старой CP253-ветки уже присутствует в интегрированном коде.

## Проверки

- Engine source: lifecycle invocation **178/178**, operation-progress/transports
  **24/24**, bootstrap/retained **17/17**, AGY native/failure **37/37**,
  streaming/AGY source **21/21**, OpenCode/Droid adapters **75/75** и последний
  Droid scope **20/20**, ZCode observer **9/9**.
- Финальный engine merge: **94/94** по assigned lifecycle, combined E5 custody,
  native bootstrap, controller result, delegation и accepted Stage packets.
  TypeScript, scoped lint, build и diff checks — PASS.
- Bridge merge: **134/134** по background/dispatch/harness/cancel/title/translator;
  после terminal-race delta — повтор затронутых background/dispatch **56/56**.
  TypeScript/build — PASS.
- EVAL merge: **105/105** cleanup/recovery/health checks; E5 callers **46 PASS**, два
  installed-source proof пропущены без `DD_FLOW_SOURCE_ROOT` и не объявлены PASS.
  Финальный cleanup/capture/health subset **34/34** — PASS.
- Scoped verification policy: все остальные тесты прошли первоначально; один
  sandbox `ps EPERM` повторён отдельно с process access и прошёл. Это не runtime
  или gate failure и не основание запускать полный набор повторно.

Числа перекрываются; это не сумма уникальных проверок. Полный gate, GitHub CI,
модельные probes и новые EVAL в этом ревью не запускались. Старые EVAL не менялись.

## Evidence и доставка

Engine fixes: `0c3944c5`; integration: `623b866a` (`main`), включая сохранённую
параллельную E5-историю. Bridge fixes: `3f970a9`, `8142f87`; integration:
`f9a3c5948ffbb0a31ec00bf8986610e17b8b9d77` (`main`). EVAL integration сохраняет
обе линии истории (`8f1abc4d` плюс данный review record).

No-model readback собранного engine подтвердил exact bridge f9a3c59/@2 и
AGY 1.4.7 P3 `qualified:true`. AGY inspector/binary tuple не менялся; его
исходные P3 captures не ретегались. Для bridge неизменённый input/turn контракт
опирается на прежний ac3e106 live proof, изменённый late-output путь — на scoped
регрессии. Это impact-based source acceptance, **не новая живая квалификация**
и не утверждение о прохождении полного E2E.

Release, installed hooks, working pins и global homes не обновлялись. Для
будущего выпуска добавлен pending Changeset; npm-публикации не было.

## Cleanup

Уникальные исторические CP253/255/257 heads сохраняются локально и удалённо
аннотированными тегами `archive/*-20261027` до удаления старых веток и чистых
неиспользуемых worktrees. Старые package release tags не меняются. Новые ветки
плана удаляются только после подтверждения их достижимости из remote main.
E5 source heads уже достижимы из интегрированного main; их работа не теряется.

Два грязных bridge checkout (`zcode-acp` и `zcode-acp-0.46.7`) сохраняются:
чужие незакоммиченные изменения не сбрасывались и не удалялись. Поэтому один
чистый checkout интегрированного bridge остаётся для доступа к актуальному main;
его generated dependencies и build принадлежат этому checkout. Worktrees,
используемые процессами, и runtime/EVAL данные не удаляются ради cleanup Git.
