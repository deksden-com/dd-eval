# 103 — Native evidence, provider recovery и согласованные контракты EVAL

Дата: 2026-10-25. Статус: реализация и узкая приёмка выполнены; границы native-capability ZCode и результаты зафиксированы в §12. Наличие API в другом checkout не означает допуск установленной версии. Исторические EVAL и установленные pins не изменены.

## Границы

Исправляем только выполнение flow/упряжек и окружающий EVAL tooling. Продуктовые замечания остаются результатом flow и оценки Judge; оператор продукт не чинит. Не изменяем сохранённые EVAL, snapshots, verdicts, pins или глобальные установки. Новые модельные вызовы/EVAL, release-gate и GitHub CI в рамках подготовки плана не запускаем.

Проверки будущей реализации — только затронутые зоны по плану 102. Merge/release/preparation сами по себе не являются основанием повторных тестов, Judge или полной matrix qualification.

## Уже установленные дефекты

| ID | Подтверждённый случай | Причина | Направление исправления |
| --- | --- | --- | --- |
| D1 | AGY `EVAL-20261024203316-0b402709`, после принятого CODE `native_resources_unproven` | Tasks `94a345ac…/task-121` и `3713629f…/task-130` имеют native `Status: DONE` и completion exit 0, но parser принимает только COMPLETED/FAILED/CANCELLED и непосредственный exit после заголовка; truncation wrapper теряет terminal | Единый разбор привязанного native terminal envelope отдельно от output; не ослаблять owner/Task ID/causal fences |
| D2 | OpenCode `EVAL-20261024202446-61ce7084`, MERGE завершён, Judge не запущен | Наш worker `dd-flow-worker` записан как mode и сравнен с родительским `build`; модель/provider/reasoning совпадают | Отделить execution profile от native agent role; проверять разрешённую дочернюю роль по действительному launch contract |
| D3 | OpenCode и Grok `EVAL-20261024210532-aa89c50f`, case-acceptance unavailable | Engine добавляет восемь вложенных quality step reports; EVAL реконструирует неполный required-artifact set и отвергает корректное доказательство | Проверять рекурсивный runner proof через общий версионированный producer/consumer контракт, не через произвольный subset |
| D4 | ZCode `EVAL-20261024202855-e564dbaf`, PLAN-REVIEW child failed | Terminal `model_request_failed`, network_error/stream/SSE/retryable; наша continuation eligibility допускает overload/rate limit, но не подтверждённый временный network failure | Общая ограниченная recovery policy для допустимых transient categories, продолжение той же сессии только после terminal + effects settlement; неизвестный исход не replay |
| D5 | Luna `EVAL-20261024205648-edadc59d`, CODE repair Work failed | Keyboard-only native-select assertion на Darwin/Chromium; независимый probe qualified=false, ограничение известно в baseline history, но отсутствует в исполняемом capability contract | Разделить semantic UI persistence, focus и настоящую keyboard-only proof; capability-bound selection/инфраструктурный blocker без фиктивного PASS/skip |
| D6 | Golden UI guidance противоречит issued canonical answer | assessment требует exact English labels, packet выдаёт Russian dictionary | Существующий canonical answer — единственный источник словаря; assessment ссылается на него, не заводит вторую копию; исторические ответы/оценки не переписываются |

## 1. Дополнительные результаты сквозного аудита

Подтверждение: основной агент перепроверил исходники и найденные субагентами точки; ниже статические дефекты и реальные campaign failures разделены. Перечень означает охват классов/вызовов, а не обещание отсутствия всех иных багов в репозиториях.

| ID | Дополнительный finding | Доказательство / статус |
| --- | --- | --- |
| D7 | Общий journal дедуплицирует разные requested profiles/parent topology как одно наблюдение | `dd-flow-cli/src/harness-runtime/lib/model-observations.mjs:40–42`: сравниваются observed/reason/evidence/raw model/provider, но не requested/parent. Подтверждён статически; не установлен как причина CP251 |
| D8 | Поздний requested drift не участвует в EVAL conformance | Engine `model-observations.mjs:74–76`, EVAL `lib/model-observations.mjs:32–35` сохраняют первую непустую summary.requested; `lib/runner.mjs:2029–2042` сравнивает только её. Сохранённые observations позволяют исправить consumer без новой модели |
| D9 | Перед проверкой matrix proof теряются тела артефактов; простое добавление путей не исправит D3 | `lib/case-acceptance.mjs:461–467`, `lib/engine-admission.mjs:124–127` заменяют artifact bodies на `{}`. Engine `runnerProofArtifacts` использует private WeakMap только после настоящей recursive validation, не после JSON.parse receipt |
| D10 | Регрессии/qualification не покрывают production composite success | Engine `scripts/qualify-verification-matrix.mjs:17–26` выбирает full-cycle fixture с profile@6/пустыми aliases (`test/vnext-protocolize.test.ts:660`); EVAL `test/case-acceptance.test.mjs:24–44` принимает только flat report и отвергает любой третий artifact |
| D11 | Причина D3 теряется в общей диагностике | `case-acceptance.mjs:758–765` объединяет command/runner/inputs/ports/artifacts; catch/wrappers сохраняют только общий code/message |
| D12 | ZCode имеет ещё два независимых препятствия same-child recovery | `delegation-instructions.mjs:41–49` не поддерживает ZCode/AGY followup; `vnext-fanout.ts:291` и `run-controller.ts:898–932` требуют такой capability. `dd-zcode.mjs:610–630` получает terminal/error, но не effect settlement; `native-children.mjs:170–178` не переносит agentId/taskId/parentToolCallId. Одного расширения категории D4 недостаточно |
| D13 | Rate-limit delay bridge теряется из-за единиц/имени поля | Pinned bridge cp227-9c5ca6c `dist/handlers/session.js:2159–2181` публикует retryAfterMs; shared policy читает retryAfter/retry_after/header, но не retryAfterMs. `native-children.mjs` поле сохраняет. Может дать unknown limit или слишком раннюю попытку; не причина сетевого CP251 |
| D14 | HTTP Decisions неверно называет исчерпание сетевых повторов перегрузкой | `lib/decision-transport.mjs:13–20,35–37` повторяет network/408/5xx; `semantic-decisions.mjs:303` всем ставит overload_retries_exhausted. Это дефект атрибуции, не основание менять fallback в repair |
| D15 | D6 продублирован во втором активном case | `cases/sdlc-eval-2026-summer-recovery/assessment.json:165` содержит те же exact English labels, его собственный specify packet выдаёт Russian labels. Исправлять оба case, не переносить новые product semantics между ними |
| D16 | Внешний interruption summary теряет доказанную сетевую причину дочернего отказа | `lib/runner.mjs:2350–2351` оставляет native child failure с source unknown. Не приписывать вину сети/провайдеру, но сохранять verified network/stream category и binding в диагностике, вместо одной fanout-обёртки |
| R1 | Второй AGY terminal decoder может повторить D1 | `agy-error-boundary.mjs:26–29` отдельно извлекает GENERIC/DONE/Command output; async SYSTEM/truncation path не обрабатывается. Подтверждён sibling path, но его участие в текущем отказе не доказано |

Дополнительный риск D4: pinned bridge повторяет root prompt до шести native attempts. Включить четыре outer attempts поверх этого — потенциально умножить replay до 24. Внутренние безопасные request retries и semantic Session continuation — разные уровни; их границы и владельцы должны быть явными.

## 2. Инвентаризация границ и уже правильных защит

| Область | Проверенные пути | Решение |
| --- | --- | --- |
| Native lifecycle | AGY transcript/inspection/stop; Codex events; ZCode retained-terminal/pagination; Grok task/attempt; OpenCode idle+tools; Droid typed outcome; shared native-children/daemon-operations | AGY-specific parser repair. Не распространять текстовые эвристики на typed adapters и не ослаблять общий shutdown guard |
| Profile evidence | Все шесть adapter callers observeModel; engine/EVAL modelAttribution; EVAL executionConformance; root/child profile inheritance | Исправить общий journal и сравнение всех утверждений; разрешённая role — отдельная launch-bound характеристика |
| Check proof | code-checks normal completion/reconciliation/reuse; runner recursive validator; matrix publication; case acceptance; qualification admission/rebind; baseline probe/fixture cache | Общая recursive proof validation. Baseline уже вызывает installed validator, а engine reuse заново валидирует proof — не заменять их новыми валидаторами |
| Provider recovery | Controller root/child/recovery, external Work, MERGE, Memory init, interaction/final Judge, optional Decisions, bridge native retries | Один чистый classifier/backoff/budget contract, разные ownership/effect adapters. Без общего I/O retry wrapper |
| Environment facts | baseline@3 assessment/readiness; stage context materializer; PLAN/CODE/review/worker input; browser runner diagnostics | Использовать существующие assessment и context.sources, не создавать capability-service или full prep suite |
| Canonical semantics | Task-priority/recovery specify packets, assessment/golden, context oracles, qualification positive/negative examples, case definition hashes | Issued answer — authority. References вместо второй копии exact dictionary; negative fixtures не переписывать как positive |

Сохраняем: resource owner/PID birth fences, causal task ordering, incomplete/unknown observation, SQL/snapshot/completion bindings, no replay on unknown effects, запрет product repair для доказанной tooling failure, quota/auth без бесконечных ожиданий. `settled_by_root`, physical stopped и Work success не взаимозаменяемы.

## 3. P1 — AGY terminal envelope вместо зависимости от layout вывода

Файлы: engine `dd-agy-daemon.mjs`, `agy-error-boundary.mjs`, их существующие fixtures и types при необходимости.

1. Вынести минимальный AGY-only decoder из существующих функций: lifecycle state, отдельный nullable exit/outcome, task/session ID, source locator/hash/position, optional owned output reference. Не писать универсальный transcript framework.
2. Поддержать текущие native формы: прямой SYSTEM completion, documented truncation wrapper, manage_task status DONE/COMPLETED/FAILED/CANCELLED, cancellation. DONE доказывает конец task, но не exit 0.
3. SYSTEM completion принимается только для ранее введённого task той же сессии, matching sender/Task ID, более позднего step. Разделять заголовок terminal и stdout: строка «Command exited…» в произвольном tool output/assistant prose не даёт authority.
4. Если для outcome нужен полный output, читать только reference из привязанного native envelope: regular file в соответствующей owned brain/tasks/steps области, без symlink escape, с bounded bytes и фиксированным digest. При неполном/недоступном файле outcome unknown; можно подтвердить resource termination отдельно, но нельзя lifecycle success.
5. Общий decoder использовать в resource parser и R1; recovered lifecycle всё ещё требует exact parsed issued command, current invocation/generation и durable successful receipt. Task terminal никогда сам не завершает Work/Stage.
6. Не трактовать отсутствие IsDaemon как false и не называть неизвестную task support-service по командной строке. Terminal task освобождается независимо от неизвестной classification. Не менять `mergeAgyResource` guards и `completeDaemonShutdown` ради зелёного результата.
7. Самостоятельные native child delivery/idle proof из планов 098–100 не заменять этим parser-fix.

Приёмка P1: sanitized реальные task-121/task-130 replay становятся stopped с корректным outcome, fake stdout/foreign task/ранний terminal/duplicate conflict/частичная строка остаются unknown/conflict. Cases DONE без exit, negative exit, cancel, direct/truncated completion и async recovered boundary. Один существующий AGY fixture, без новой модельной квалификации.

## 4. P2 — Semantic execution profile и native role; не терять drift

Файлы: engine `model-observations.mjs`, OpenCode adapter/delegation metadata; EVAL `lib/model-observations.mjs`, `runner.mjs`, `execution-contract.mjs`; existing parity/conformance tests.

1. Сохранить historical `mode` как readback. Добавить только необходимые optional native role/launch provenance к observation; generic execution settings не подменять именем агента.
2. Effective expected child role выводить из реального pinned launch contract и проверенного parent relation. Для нашего OpenCode native worker разрешён dd-flow-worker при родительском build, но только с теми же provider/model/reasoning и допустимыми permissions. Не wildcard-whitelist всех descendants.
3. Dedup сравнивает весь нормализованный factual tuple: requested, observed, parent, scope/attempt/turn, evidence/reason/raw fields. Идентичный event replay дедуплицируется; тот же source-event identity с противоречащим requested/parent — bounded evidence conflict, не молчаливый overwrite.
4. Summary.requested оставить для совместимости отображения; conformance проверяет все relevant requested assertions из observations в bound Session/attempt. Не «latest wins» и не «first wins».
5. Смена parent, два несовместимых parent, missing role provenance дают conflict/unknown, а не matched. Unknown native routing нельзя приравнивать к серверному доказательству модели. Запрошенный и наблюдённый профиль остаются разными видами фактов.
6. Engine/EVAL projection copy должны иметь одну семантику: механическая синхронизация existing pure projection и parity на одном небольшом корпусе. Новое хранилище не требуется.
7. Legacy observations без новых полей читаются без переписывания; role можно восстановить только по сохранённому launch evidence. Иначе unknown, а не ретроактивный PASS. Оригинальный CP251 verdict не менять; возможная новая read-only reassessment — отдельный результат.

Приёмка P2: настоящий bound worker проходит; provider/model/reasoning/permission drift, неизвестная роль и чужой parent отвергаются; later requested drift не теряется; одинаковые observed при смене requested создают запись; conflicting duplicate event не скрывается. Проверить adapter observation → attribution → conformance → Judge eligibility без платного Judge.

## 5. P3 — Полное, но ограниченное доказательство runner closure

Файлы: engine `check-runner-evidence.ts`, `code-checks.ts`, matrix technical API/qualification fixture; EVAL `case-acceptance.mjs`, `engine-admission.mjs`, bounded source readers и точечные tests.

Решение: выделить из существующего runner validator чистую bounded proof-проверку с resolver проверенных bytes; не строить второй независимый parser и не доверять сериализованным WeakMap-аннотациям receipt.

1. API pure helper: root runner contract + expected binding + `readArtifact(relative)` → validated runner outcome, exact recursive required proof paths и bounded diagnostics. Hash/binding/schema/depth/byte/node limits применяются внутри одного authoritative implementation. Filesystem wrapper остаётся у engine, portable source resolver — у EVAL.
2. Источник helper — engine `src/services/check-runner-proof.ts`; обычная сборка создаёт dependency-free ESM `dist/services/check-runner-proof.js`, его байты механически синхронизируются в EVAL `lib/check-runner-proof.mjs` с source/build digest и byte-parity regression. Только Node builtins; никаких project-relative/runtime imports в vendored файле. Не импортировать global/current engine и не требовать node_modules для чтения frozen EVAL. Это не новый npm package/framework. Legacy helper/API version определяется явно, не угадывается по semver. Helper не размещать в исключённом из technical component `harness-runtime/`: его байты и реально используемые зависимости входят в matrix component inventory.
3. Matrix source readers сохраняют проверенные bytes и дают resolver только для каталогизированных принадлежащих snapshot/packet файлов. Не parseJson всех artifact:*: binary/debug artifacts остаются opaque; JSON читается лишь по runner proof references.
4. Expected closure: declaration artifacts + runner root + engine-outcome + recursively validated step/failure proofs. Derived set должен точно совпадать с required_artifacts; arbitrary extras по-прежнему invalid. Проверять наличие/hashes всех native artifact claims отдельно.
5. Использовать helper во всех трёх producer paths normal/reconciliation/reuse и обоих portable consumers final acceptance/qualification. Existing SQL/completion/profile/input/source/accepted-tree fences остаются независимыми.
6. Для failure proof не выдавать passed status по aggregate exit 0; неполнота, unreached/failed child, неизвестное происхождение и unbounded/cyclic closure не доказывают acceptance.
7. Диагностика: receipt/binding + field + bounded expected/observed/missing/unexpected paths + cause code. Не писать raw report bodies/секреты; обёртки EVAL сохраняют эти безопасные details.
8. Не переобозначать старые receipts. Новая checker assessment явно содержит checker/helper identity. Если semantic producer изменился, нужен только затронутый offline proof; если изменился один consumer, сначала replay сохранённых producer bytes. Artifact-equivalence@4 не использовать для притворного совпадения изменившихся component bytes.

Приёмка P3: CP251 quality composite с восемью reports проходит через обе portable-reader границы; flat profile@6 и profile@7 runner@1/@2 остаются совместимы; missing/tampered/foreign binding/report/hash/step, duplicate/cycle/excess depth/bytes и forged third artifact отвергаются. Получение closure после JSON.parse без validation не допускается.

Тест D10 заменить/дополнить одним небольшим production-shaped composite producer → frozen packet → consumer contract. Старый full-cycle test не назначать обязательным заново и не запускать его при каждом native fix. Qualification coverage must name actual exercised runner contracts; старый profile@6 PASS не заявляет composite@7 proof.

## 6. P4 — Transient recovery без повторного выполнения неизвестных эффектов

### 6.1 Общая политика и обязательная safety boundary

Файлы: existing `provider-overload-policy.mjs`/types, `provider-capacity.ts`, controller/state/recovery, external Work, MERGE, memory-init; EVAL interaction/final Judge и Decisions.

- Сохранить существующий episode/backoff механизм, расширив новый contract до `provider-recovery-episode@1`; legacy `provider-overload-episode@1` читает прежние правила и counters, не получает новый бюджет задним числом.
- Совместимость API: файл `provider-overload-policy.mjs` и legacy exports остаются доступны. Новый recovery contract/export явно объявлен рядом; EVAL `capacity-policy.mjs` допускает оба известных ABI и выбирает по pinned artifact, а не по глобальному engine. Все перечисленные новые consumers используют новый API; legacy overload-only helpers не становятся внезапно transport-replay authority. Старые active/pending episodes нельзя мигрировать простым переименованием policy.
- Категории: capacity, bounded retryable rate-limit, structured transient network/transport. Не классифицировать текст prompt/tool stdout как provider error и не объявлять любой exception/HTTP5xx network transient.
- Начальный native transport allowlist: проверенный ZCode envelope `model_request_failed` + attribution source=network/reason=network_error/errorPhase=stream/exceptionKind=transport; и подтверждённые native network envelopes с ECONNRESET/EPIPE/ETIMEDOUT/EAI_AGAIN/UND_ERR_SOCKET/UND_ERR_CONNECT_TIMEOUT/UND_ERR_HEADERS_TIMEOUT/UND_ERR_BODY_TIMEOUT либо HTTP 408/502/504. Только raw native provider source, не локальный observation/lease timeout. Неизвестные формы остаются ineligible до добавления конкретного corpus-case. Auth/quota/permanent certificate/user cancellation имеют приоритет над allowlist; retryable=false veto сохраняется.
- Network recovery требует подтверждённый terminal текущего Session/Turn, native retry inactive, подтверждённые settled tool effects, текущие owner/Work/stage generation. `retryable:true` — только вход classifier, не право replay.
- Safe error projection сохраняет bounded structured source/reason/errorPhase/transport/retryable и нормализованный delay, не тела ответов/headers с секретами. Interruption report показывает подтверждённую transport-причину и native binding; физического виновника обрыва по ней не назначает.
- Неполный stream без terminal, lost observer, pending tools, неизвестный результат SendMessage → reconciliation, не новая попытка. Прекращение/отмена пользователя, auth/quota, certificate/permission/config errors не продолжаются автоматически.
- Agent continuation отправляет короткое «продолжай ту же Work с учётом durable state», не исходный большой prompt и не повтор lifecycle commands. Успех закрывает episode; следующий независимый отказ получает новый budget. Счётчик принадлежит exact child/request episode, не всему RUN.
- Native continuation: initial + максимум 3 продолжения; HTTP Decisions сохраняет явно настроенный initial + максимум 2 повтора. Это осознанные пределы разных операций, не расхождение формулы. Не менять общий cap без необходимости и не повышать его отдельно для конкретной модели.
- Backoff existing 5/15/15 секунд (первая/вторая/третья дополнительная попытка) с небольшим jitter; прежняя запись 5/15/30 исправлена по фактическому `capacityBackoff`. Retry-After действует только в пределах existing 30s cap, превышение завершает операцию/фоллбэк с retry_at, а не долгое ожидание. Не использовать общий wall-clock retry loop.
- Единая unit-aware нормализация retryAfterMs (milliseconds), retryAfter/retry_after и header (seconds/date). Invalid/contradictory metadata — явный отказ; ноль допустим; negative/NaN/overflow и invalid date отвергаются.
- Decisions после собственного исчерпания — один durable fallback на classic Judge, не repair loop. Error category и exhaustion_reason сохраняются; network exhaustion не называется overload. Explicit user cancellation никогда не запускает fallback.
- HTTP transport и native Turn имеют разные replay eligibility: HTTP Decisions не запускают agent tools. Общие classifier/metadata/backoff не делают произвольный HTTP failure разрешением native continuation. Existing allowlisted HTTP transient failures сохраняются без blanket permission для native ошибок.

### 6.2 Три независимых условия ZCode same-child continuation

1. **Адресат.** Native `SendMessage({to: agentId, summary, message})`, затем ожидание того же agent через native TaskOutput. Не вычислять agentId удалением `sess_subagent_` из Session ID. Из retained `_meta.backgroundTask` переносить verified mapping agentId ↔ childSessionId ↔ parentToolCallId ↔ parentSession/Work/lifetime через bridge, native receipt и normalizer. Сохранить messageId и delivery queued/steered/resumed_background, когда native действительно их предоставляет. Для установленного ZCode завершённый SendMessage сохраняется как formatted output с typed display.status, без этих IDs: §12 закрепляет альтернативное native causal proof, без выдуманных значений. Не повторять при неизвестном admission.
2. **Завершённость эффектов.** Read-only retained-terminal/effects inspection должен вернуть exact child lifetime/terminal Turn, pending tool inventory, native retry state и provenance. Не load/resume закрытого ребёнка ради диагностики и не выводить settled из самого слова failed. Если backend не даёт достаточных сохранённых фактов — explicit provider_recovery_unavailable с первичной причиной, без replay.
3. **Версионная capability.** В local ZCode source aac4755666d09fdcd70272fcf063c077a639015f API определён в `contracts/src/tools/send-message.ts`; `core/src/subagent/runner.ts:903–1064` возобновляет terminal agent с тем же childSessionId/resumeFromStore; current CP251 transcript объявляет SendMessage и содержит mapping. Это source+retained evidence, но не доказательство всех полей конкретного installed build. Допуск включается только для build-bound capability после узкой native приёмки; устаревший bridge без metadata — unsupported, не guessed.

Renderer followup должен принимать типизированную verified child reference/capability, а не один childId. Это общий интерфейс для Codex/OpenCode/Droid/Grok/ZCode; реализации сохраняют собственный native tool. Для AGY не изобретать неподтверждённый resume API: отсутствие capability явно блокирует child continuation, но не ломает корректный root continuation. Нативный ZCode продукт не изменяем: bridge получает существующие read-only native/store evidence через поддержанный API; capability не включается, если их не хватает.

### 6.3 Исключить умножение retry loops

Pinned ZCode bridge имеет собственные root attempts; network recovery нельзя просто обернуть дополнительным retry исходного prompt. Для managed dd-flow владение semantic continuation остаётся у controller. На ACP `session/prompt` передаётся extension `_meta.zcode.ddFlowRecovery` с schema_id=`dd-flow/managed-provider-recovery@1`, owner=`controller`, operation_id/root_operation_id. Поддержка объявляется bridge в initialize metadata и подтверждается в prompt result/error. В этом режиме bridge делает один semantic send, возвращает настоящий structured terminal failure вместо friendly end_turn после exhaust и не respawn/replay неизвестный in-flight outcome. Без extension standalone policy bridge не меняется. Safe pre-dispatch transport/setup retries допустимы, но после видимого tool/text/accepted Turn не становятся новым semantic send. Отсутствие capability не разрешает новому managed engine молча запустить старые шесть semantic попыток. Один refusal/attempt ledger различает native_request_attempt и session_continuation; бюджет outer эпизода не сбрасывается при restart observer.

Порядок отказа: structured reason сохраняется до Work-failed. Если безопасная recovery поддержана — Work остаётся running/waiting, успешное продолжение закрывает episode; окончательный отказ пишет provider_unavailable с исходным child binding. Ошибки без capability не скрываются под единственным fanout_child_failed.

Приёмка P4: root и child через все existing entrypoints, сетевой terminal vs active internal retry vs unknown stream, один и несколько siblings, один child success затем новый episode, смена network→capacity в одном episode не обнуляет budget, exhaust, owner/generation/Work-boundary change, перезапуск observer на backoff, lost SendMessage ack/no duplicate, no implicit replacement/model override. Bridge/native-turn fixture проверяет отсутствие вложенного semantic replay. HTTP classifier/backoff/fallback — fake transport deterministic checks; никаких новых модельных вызовов для этих регрессий. Уже failed CP251 Work не переводится автоматически обратно в running: исторические состояния остаются фактами, будущая policy проверяется на новой технической fixture, не ручной починкой старого RUN.

## 7. P5 — Возможности браузерного стенда как факты, а не продуктовые решения

Файлы: EVAL baseline@3 assessment, stage-context materializer/blueprint sources и tests; dd-tasks только test-world/browser tooling/helper при необходимости. Продуктовый UI/API/миграции не меняем.

1. Использовать результат существующего маленького native-select probe, а не повторять product browser suite. Хранить capability proof в existing fixture assessment: platform/arch, actual browser executable/version/hash, launch mode, probe source/hash, key sequence и наблюдённый результат. Cache invalidates только эти входы, не модель/упряжка/новый RUN.
2. False capability — корректный факт о среде, но не PASS keyboard acceptance. Проверка одного sequence не доказывает поддержку всех native keys или cross-browser accessibility; тип proof включает точную операцию.
3. Actual execution materializer создаёт до первого Subject dispatch реальный JSON artifact `environment/browser-capabilities.json` в RUN home и передаёт через context.sources с root=`run`, полным текущим путём и optional source.sha256 в SPECIFY/PLAN/PLAN-REVIEW/CODE/CODE-REVIEW и worker packet. Это исправляет прежний проектный путь `.dd-eval/...`, который мог исчезнуть из read-only review copy как untracked/ignored файл. Source.sha256 — совместимое optional дополнение existing context type/validator; для этого immutable runtime fact оно обязательно и проверяется, для прежних project docs не навязывается. Подготовительный dry-run без baseline/RUN не обещает этот файл: runtime source добавляется только в actual materialized context, сохраняя исходный blueprint hash и отдельный materialized-context hash. Контекст явно отделяет environment facts от accepted product decisions и возможностей процесса/ресурсов.
4. Перед reuse на fork/resume сверять environment binding; не брать readiness другой writable world. Immutable imported packets остаются provenance, новый context projection привязан отдельно.
5. Semantic persistence через поддерживаемый selectOption и focus/labels проходят независимо. Если обязателен реальный keyboard-only путь — выбрать доказанно поддерживаемый способ/среду либо вернуть tooling blocker; не разрешать агенту объявить semantic selection keyboard proof и не снижать accepted требования автоматически.
6. Browser runner прикладывает capability fact к failure diagnostics, но не переатрибутирует все select assertion по платформе. Tooling origin разрешён только при совпадающем capability/source/operation evidence; обычный неправильный selector, UI-value или source-test bug остаётся candidate/unclassified по фактам.
7. Документировать один короткий actionable путь для coordinator: read capability evidence, не product repair ради ограничений драйвера; проверяемое альтернативное действие не заменяет исходную обязанность молча.

Приёмка P5: capability true/false/unknown и changed browser/probe; cold proof один, затем reuse между пятью harnesses; отсутствующий promised context source отклоняется; worker/review видит тот же факт; unsupported keyboard не становится product assertion, fake platform-only attribution не принимается. Изолированный micro-probe допустим при реализации только для изменённого capability, не как новый mandatory prep gate на каждый EVAL.

## 8. P6 — Canonical response authority вместо рассинхроненных exact labels

Файлы: task-priority и recovery assessment, их source context-oracles и positive canonical fixture consumers, case validator/tests. Не копировать расширения open/closed из одного case в другой без отдельного решения.

1. Authoritative dictionary уже существует в каждом `entry-pack-source/interactions/specify.json`, response `clarification-task-priority`. Не создавать шаблонизатор/новую модель/второй конфиг словаря.
2. Заменить duplicated exact English labels в assessment на явную ссылку на issued canonical response и правило «точные code-to-label пары из этого ответа». В существующую assessment source metadata добавить проверяемую reference stage/response_id; loadCase/definition validation проверяет, что reference существует и относится к собственному case.
3. Judge получает этот authoritative response через существующий evidence source; context oracle не задаёт другой язык/словарь. Exact answer bytes сами по себе не меняются от исправления оценочного текста; Subject prompts не получают gold rubric.
4. Инвентаризировать positive copies/qualification samples и обновлять только действительно связанные expectations; intentionally negative/contradictory questions сохранять как negative с явной ролью. Не делать массовую замену English strings по всей истории.
5. Проверить hash references и semantic fingerprints только реально изменённых документов. Исправление assessment не требует новой Subject baseline, native compatibility или 20 живых Judge вопросов; сначала deterministic definition check/replay сохранённых входов, если затронут oracle.

Приёмка P6: оба активных case разрешают own response reference, dangling/foreign response отклоняется, exact dictionary не продублирован в rubric, negative qualification остаётся negative; create-form label optional и отсутствие дополнительных indicators сохраняются. Исторические golden/candidate/Judge receipts не править.

## 9. Точечная проверка, интеграция и совместимость

Последовательность реализации:

1. P1: native envelope producer + AGY sibling consumers + один fixture.
2. P2: journal/projection/role contract + EVAL conformance вместе; pinned adapters без новых полей остаются читаемыми.
3. P3: pure proof extraction + engine wrapper + frozen EVAL consumer + production composite regression. Byte-parity source и portable ABI документируются в PR.
4. P4: classifier/units/new episode reader, then ZCode metadata/effects capability + bridge retry ownership, потом включение capability по узкой приёмке. Нельзя объявить network recovery готовой после classifier-only commit.
5. P5 и P6: capability context и canonical authority/definition checks, без изменения product implementation.
6. Проверить конечный diff относительно текущего main каждого проекта; коммиты/PR/squash merge по правилам проекта только при отдельном поручении реализации. Никаких full gates, CI, автоматического release или новых campaign в текущей задаче.

| Изменённый контракт | Достаточная локальная проверка | Не запускаем вследствие этого изменения |
| --- | --- | --- |
| AGY decoder | existing AGY fixture с CP251 sanitized examples | остальные harness fixtures, model probes, SDLC suite |
| Model journal/role | existing model-observation parity + один conformance pipeline | Subject full E2E и живой Judge |
| Recursive proof | narrow composite producer/portable consumer + negative mutations | full E3/E4, полный installed SDLC fixture |
| Provider policy/bridge | pure policy + recorded typed native events + targeted child lifecycle fixture | повторы реальных RUN, полномасштабная matrix qualification |
| Browser capabilities | cached micro-probe/fixture context tests при изменении own inputs | пять quality/browser suites и native preflights |
| Assessment references | definition validators/relevant oracle replay | повтор HITL моделей и baseline |

В impact mapping плана 102 добавить новые helper owners и тонкие cross-repo consumers (model-observations, case-acceptance/proof, capability context). Не подводить их под общий regex, запускающий все adapters/все Judge tests. Unknown path требует явного owner, не zero-test PASS и не full fallback. Reused evidence перед merge/build/pack/publish проверяется, но тесты без изменения relevant inputs не исполняются повторно.

Нативная приёмка ZCode: после реализации и только при разрешённом native probe получить build-bound SendMessage admission + same childSessionId/history/model + matching delivery/new Turn + settled tools. Один изолированный targeted scenario, не scored EVAL и не полная квалификация всех упряжек. Если доступ ограничен или effect proof недоступен, честный статус «capability blocked», без выдуманного PASS; остальной код может быть интегрирован с capability disabled, но P4 целиком не считается завершённым.

## 10. Definition of done и readiness/ponytail review

- [x] D1–D16 закрыты либо явно оставлены с проверяемым блокером (§12: native Bash effects); R1 проверен обоими AGY consumers. Не смешивать статический риск и причину campaign failure.
- [x] Нормальный native terminal, semantic outcome, Work completion, physical cleanup и report finalization остаются раздельными фактами.
- [x] Реальные сохранённые AGY completions и composite quality proof принимаются; фальшивые/чужие/неполные — нет.
- [x] OpenCode bound worker не invalidates experiment; реальный поздний profile drift больше не скрывается.
- [x] ZCode продолжает тот же ребёнок по native ID mapping только при доказанных effects/capability и единственном recovery owner; непроверенная версия блокируется явно. Это не снимает ограничение Bash из §12.
- [x] Retry budget, Retry-After единицы, cancellation и fallback одинаково объяснимы во всех перечисленных entrypoints; ни один outer loop не умножает скрытый semantic replay.
- [x] Неподдерживаемая browser operation видна до обещания её доказательства и не требует product hack; ни focus, ни selectOption не выдаются за неполученное keyboard-only proof.
- [x] Golden vocabulary следует issued canonical response в обоих case; не распространяются новые продуктовые требования между case.
- [x] Только affected-zone checks; сохранены исходные FAIL/unknown и optional/непроведённые native proofs. Все изменения документированы без протоколов в operational runbooks.

Ponytail-review: используем существующие journals, episodes, snapshot sources, runner validator, baseline cache и stage-context. Новые generic retry engine, монитор, база, capability service, templating framework, npm dependency и новый qualification cache не нужны. Выделяется лишь необходимый pure validator/AGY decoder; canonical словарь не копируется ещё раз. Полный gate не нужен для доказательства исправления узкой границы.

Readiness до реализации: архитектурные решения, владельцы, fail-closed поведение, cross-repo порядок, совместимость и проверяемые критерии приняты. Результат фактической реализации и пределы полученной runtime-гарантии теперь перечислены отдельно в §12; новые EVAL не запускались.

## 11. Повторный readiness-review: закрытые проектные пробелы

Проверка выполнена по исходникам и retained evidence, без запуска тестовых suites, provider calls и EVAL. Ниже решения обязательны и уточняют более общие формулировки P1–P6.

### 11.1 AGY: terminal, outcome и восстановление команды

- Decoder возвращает `task_terminal` отдельно от nullable `exit_code`/`command_outcome`. `Status: DONE` без exit не становится success и не снимает physical process checks. `FAILED`/`CANCELLED` тоже означают окончание task, а не невозможность retirement.
- Для async lifecycle сохраняется launch map `task_id → exact parsed issued invocation + launch step/source`: последний увиденный manage_task или чужой run_command не заменяет invocation первоначальной команды. Нельзя FIFO-сопоставлять parallel tool calls без native ID. Неоднозначная связь оставляет outcome unknown.
- Completion grammar разбирает только native envelope до границы `Command output:` и известную служебную truncation wrapper. Exit-строка внутри stdout не terminal authority. Оба owner/Task ID должны совпадать, причинный порядок проверяется для исходного launch, а не последнего status poll. Поддержать LF/CRLF; неполный последний JSONL record не принимать как законченный.
- Recovered lifecycle boundary требует matching invocation/generation и durable DB outcome; успешная другая команда после ошибки не «лечит» отказ. Для отсутствующего/неоднозначного full output не запускать новую модель ради уточнения.

### 11.2 OpenCode/profile: конкретный scope проверки

- Native role — optional observation metadata `native_agent_role` с `name`, `kind=primary|subagent`, reference на зафиксированную launch/config запись и bound parent. Реальную launch/config запись создаёт адаптер при генерации isolated worker config; роль не берётся только из самого сообщения ребёнка.
- Разрешение `build → dd-flow-worker` действует лишь для children этого generated config и этой lineage. Root с `mode=dd-flow-worker`, другой agent или изменённые права не проходят по исключению. Nested ребёнок допускается только по соответствующей доказанной launch relation, не по достижимости любого предка.
- Сравниваются requested assertions, а native observed routing остаётся отдельным readback: его нельзя ни выдать за доказанный request, ни молча переписать под expected. Existing strict permission/autonomy checks не ослабляются.
- Partial/non_asserting observation не создаёт несовместимость отсутствующим полем. Новый непустой requested факт проверяется против frozen profile; изменение ранее утверждённого requested/parent не скрывается. Same-event identity с противоречием — conflict, а не append второй «истины».
- Engine/EVAL `modelAttribution` синхронизируется как pure projection; весь файл с разными I/O wrappers/strictFields API механически копировать нельзя. Совместимость старых events и journal replay проверяется отдельно от текущего writer.

### 11.3 Portable proof API, поставка и границы extraction

- Ввести `RUNNER_PROOF_CONTRACT = dd-flow/check-runner-proof@1`. API синхронный, как existing engine reader: `readArtifact(relative): Buffer` получает только bytes уже разрешённого источника. EVAL асинхронно читает/хеширует разрешённые sources, затем передаёт bounded byte-map resolver; helper не открывает filesystem сам.
- Source-of-truth extraction ограничить shape/binding/recursive report/proof validation. Candidate-source mutation, SQL receipt, process liveness и проверка соответствия файла продукта остаются в существующих wrappers. Helper не получает произвольные абсолютные пути из untrusted report.
- Сохранить existing limits: depth ≤4, reports ≤64, runner JSON ≤1 MiB, auxiliary proof ≤2 MiB, bounded diagnostics ≤64 entries/32 KiB. Ввести явный общий consumed-byte budget 128 MiB на одну проверку closure; превышение — `proof_budget_exceeded`, не product failure. Старый огромный proof остаётся retained/unassessable, а не переписывается. Resolver не загружает все opaque/binary artifacts в byte-map: их hashing/наличие проверяются отдельно.
- Engine wrapper после успешного pure validation наполняет существующие private maps для repair attribution; EVAL использует возвращённую проверенную closure. Сырой `native.runner_evidence` из receipt и новый helper result не взаимозаменяемы. Импорт/сериализация не выдаёт validation authority.
- Vendoring — обычная копия compiled pure ESM при изменении этого модуля, source/build digest фиксируется в metadata; сравнение байтов обязательно, но не отдельный полный build/qualification при каждом EVAL. Поставляемый модуль входит в build/pack inventory и технический component fingerprint; новый путь явно внесён в impact mapping.
- Production-shaped regression должна пройти обе реальные portable загрузки, а не только прямой вызов helper с вручную созданным decoded map. Отдельно проверяются declared artifacts, validated derived reports и allowed opaque debug extras: debug artifact может присутствовать в `artifacts`, но не превращается произвольно в `required_artifacts`.

### 11.4 ZCode: откуда берётся read-only effects proof

Существующий pinned bridge уже читает native `message` SQLite store через `DatabaseSync(...,{readOnly:true})` в `backend/retained-terminal.js`; значит новая inspection не должна load/resume child и не требует изменения нативного ZCode продукта.

Конкретное расширение: `zcode/session/retainedTerminal` получает optional proof contract, возвращает `zcode/retained-child-effects@1` рядом с прежними полями. Старый ответ остаётся читаемым, но не даёт новую recovery capability.

1. Читать из native home именно выбранного backend instance, не случайной глобальной установки/другого аккаунта. Проверять storage schema; отсутствующая/другая/закрытая/занятая БД → unavailable с bounded reason.
2. В одной read transaction выбрать message records exact session+terminal Turn в bound startedAt/endedAt и только принадлежащие им `part` records. Проверить полноту выбранной Turn projection, отсутствие более нового активного Turn, duplicate callID/противоречий и незавершённых tool parts. Не требовать арифметически подряд идущих assistant sequence: внутри того же Turn есть user/system records (в CP251 user sequence=14); проверяется полный native message watermark и принадлежность, не выдуманный contiguous assistant counter. Частичная/усечённая выборка не доказывает полноту.
3. Вернуть только IDs, sequence/terminal watermark, counts/status и digests; stdout, prompts, credentials и tool inputs не передавать. Ограничить выборку 4096 records и 16 MiB проверяемой metadata; превышение — unknown, не guessed settled. Сверить topology revision/lifetime до и после inspection: proof устаревшего child incarnation не используется.
4. Completed/error tool-part доказывает terminal tool invocation, но не автоматически завершение созданных им background effects. При native background/subagent/resource handle нужен его matching terminal/owner proof; неизвестный тип или неполная inventory оставляют recovery ineligible. Pending managed check/lifecycle invocation также запрещает continuation.
5. Непосредственно перед continuation повторно проверить current topology/Turn/Work/owner fence, а не давать постоянное право по старому snapshot. Same Session ID после SendMessage получает новую lifetime/Turn: старый proof не переносится на следующую попытку.

Доисследование текущего child `sess_subagent_agent_ec235656…` подтвердило в retained store 34 tool parts со state=completed и 30 assistant messages нужного Turn. Это доказывает наличие пригодных исходных данных, **не** объявляет готовую safe-recovery capability: остаются проверки фоновых handles, свежести и installed-build приёмка.

### 11.5 Продолжение ребёнка: crash windows и устаревший failure fence

- Existing controller episode ledger расширяется состояниями/полями prepare → dispatched → native_message_accepted → successor_observed → settled. Записать intent/prompt hash/child reference до dispatch. Новое хранилище и отдельная очередь не нужны.
- `SendMessage` не предоставляет caller-controlled idempotency key: при потерянном ack нельзя просто вызвать его снова. Сначала сопоставить точный parent prompt/Turn/toolCall с retained native tool result. При наличии native `messageId/delivery` и metadata `resumedFromMessageId` использовать их; когда native их не сохраняет, допускается только typed `parent_tool_admission`/`parent_tool_successor` с проверками §12. Если связать нельзя, оставить unknown admission и остановить автоматическое продолжение.
- Admission failure до send не считается новым provider refusal; accepted queued message без нового Turn — ожидание по скользящему observation window, не новый send. Retry counter растёт только от отдельного подтверждённого отказа provider request. Явный отказ самого SendMessage отражается как невозможность recovery, а не отказ модели.
- В `native-children`, `controller-child-observer.normalized`, его JSONL replay, pending child state и types переносить только allowlisted continuation reference/effects proof. Исправить не только первый normalizer, иначе повторный observer снова потеряет необходимые поля.
- В текущем `controller-child-observer.ts` старый failure снимается лишь после другого terminal Turn; generic normalizer запрещает одновременно running и failed для одной Session. Для нового ZCode continuation это существенный edge case: не смешивать predecessor failure с successor running как два текущих исхода. Пока continuation доказанно admitted, старый failure остаётся в immutable history/episode, а controller ждёт successor; снять active fence можно только по связанному successor proof, не просто по слову running. Missing/foreign successor оставляет fence, а не приводит к новому dispatch. Сам факт этого edge case не объявляется новой причиной CP251.
- Managed ACP extension задаёт bridge semantic attempts=1 и backend-lost replay=0 после admission; technical cold-start/busy polling до send не меняется. Новый engine требует capability acknowledgement до первого managed prompt. Отдельная fixture доказывает: standalone прежний, managed не повторяет исходный prompt и возвращает structured failure, observer restart не обнуляет budget.

### 11.6 Retry metadata и compatibility без скрытых новых бюджетов

- Новый ABI экспортирует отдельные recovery helpers/constant; legacy CAPACITY_POLICY/helpers сохраняют именно overload-only semantics. New callers/loader явно выбирают новые exports, legacy engine остаётся на старых. Переход — новая операция/новый RUN либо новый episode после доказанного success, не переклейка active ledger.
- Category change network→overload в одном episode не сбрасывает attempts. Первоначальная причина и последняя причина сохраняются раздельно. Технический сбой observer не потребляет provider retry и не даёт новый prompt.
- RetryAfterMs нормализуется из top-level и bounded attribution; header/seconds/date сравниваются в общей millisecond шкале. Одинаковые значения не конфликтуют; реальные расхождения/invalid metadata отклоняются. Deadline вычисляется от anchored native response observation, при restart используется прежний not_before — не полная пауза заново и не движущийся retry_at.
- Уточнение: backoff 5/15/15 + existing jitter; cap30s означает предел разрешённого ожидания, не третью ступень backoff. Старые reset_at/not_before/counters не пересчитываются от момента очередного status.

### 11.7 Browser facts: создание, hash, копии и отсутствие лишних проверок

- Добавление runtime source происходит только после actual baseline и появления RUN root, до первого Subject prompt. Подготовительный dry-run отражает deferred materialization, но не обязан запускать browser probe. Static blueprint hash и authored canonical bytes не зависят от машины/упряжки.
- Fact находится в `RUN/environment/browser-capabilities.json`, source.root=run, поэтому `renderRetainedStageContext` не переносит его в read-only workspace view. Capture/export/import/fork включают этот файл и reference; новый импорт сопоставляет путь existing relocation receipt, а не копирует абсолютный старый путь. Source.sha256 проверяется на materialization/dispatch лишь для источников, явно объявленных immutable; не вводить проверку неизменности всех project docs.
- Capability receipt различает `probe_executed=true/false`, outcome supported/unsupported/unknown и независимый assessment status. Корректно выполненный отрицательный probe можно reuse; это не PASS keyboard acceptance. Убеждение агента/старый runbook не заменяют native fact.
- Cache key включает OS release/arch, browser executable/revision, automation driver/transport version, headless/headed launch options, relevant locale и exact probe/key sequence. Source fixture@1 без новых identity fields считается legacy insufficient, а не случайно подходящим proof. Нельзя переносить Darwin факт в Linux или считать проверку ArrowDown доказательством End/typeahead.
- Fixture browser tooling получает bound capability reference через issued check environment; validation проверяет actual browser tuple. Отдельный pure rule разрешает tooling attribution только при совпадающей failed operation + independent probe; неподтверждённая рекомендация ОС не меняет candidate assertion автоматически.
- Fork/resume с теми же declared environment inputs reuse; при изменении только browser capability заново оценивается только micro-probe. БД readiness каждого world сохраняется, но quality/API/browser product suites из-за этого не повторяются.

### 11.8 Canonical references и повторная оценка

- Минимальное поле assessment: `canonical_response_refs: [{stage:"specify", response_id:"clarification-task-priority", purpose:"ui_priority_vocabulary"}]`. Reference разрешается внутри своего frozen case, response IDs уникальны; отсутствующий stage/response или foreign path недопустимы. Exact labels не копируются в это поле и rubric.
- Final Judge использует соответствующие **фактически выданные** retained answer bytes/receipt, а не последний файл из рабочего checkout. Не выданный ответ — authored expectation, не принятый пользователем факт. Assessment не поступает Subject.
- Для старых EVAL любые reader improvements/reassessment сохраняются отдельно с checker/helper identity и ссылками на прежние receipts; `state.json`, `report.json`, candidate и прежний Judge result не перезаписываются. Read-only replay не запускает новый Judge.

### 11.9 Дополнительная граница кэша baseline, обнаруженная при review

`lib/baseline-admission.mjs:62–69,95–99` включает весь technical ABI и reader source в common identity каждого quality/browser/isolation assessment. При P3 consumer-only исправлении это может снова вызвать три product suites, хотя изменились только правила чтения старых доказательств. Это не причина CP251, но прямой путь лишних проверок при реализации.

Решение в **том же** existing fixture-assessment cache: разделить `execution_identity` (реальные source/command/env/producer/executor inputs) и `validation_identity` (reader/helper ABI). Для новых `fixture-assessment@2` записывать оба manifest, исходные native reports и validator verdict; existing @1 reader сохраняется. Единственный execution pointer/lock принадлежит execution identity; отдельный immutable validation receipt ключуется парой execution evidence SHA + validation identity. Group reference связывает оба, а не подменяет hash старого execution. Consumer-only change сначала revalidate сохранённые reports. Новый FAIL/unknown не исполняет product suites автоматически и не откатывается к прошлому PASS. Если изменился producer/command/fixture/environment/physical executor, соответствующий контракт действительно исполняется заново. Whole technical-matrix fingerprint не считается physical execution identity; список execution inputs должен быть явным, без автоматического Git/import graph. Legacy@1 без достаточного manifest не повышать до reusable по догадке: нужен явно привязанный retained source tuple, иначе cold/missing evidence обозначается честно и проверяется только затронутый контракт. Не создавать cache service, универсальный migration engine или повторный mandatory baseline gate. Проверить interleaving двух EVAL: один execution, затем максимум одна validation на каждую новую reader identity, без потери прежних результатов.

### 11.10 Проверка достаточности и границы готовности

| Направление | Что было недостаточно определено | Обязательное дополнение |
| --- | --- | --- |
| AGY | Async command association и DONE≠success | Launch binding, strict envelope/output split, resource/physical/lifecycle раздельно |
| Profile | Семантика роли, partial observation и копирование разных APIs | Launch-bound role metadata, all relevant assertions, pure projection parity |
| Runner proof | Путь helper, synchronous API, component inclusion, limits | Один compiled pure module + frozen copy, два реальных source readers, bounded resolver |
| ZCode | Только название API, но не effects/read path и admission recovery | Read-only native store proof, parent tool/message binding, new lifetime/Turn, managed bridge single owner |
| Retry | Backoff описан неверно, units и clocks не закреплены | 5/15/15, anchored not_before, explicit legacy/new ABI |
| Browser | Файл мог отсутствовать на review/fork; runtime fact смешан с blueprint | RUN artifact + source.sha256, deferred actual materialization, portable reference |
| Canonical | Где хранится reference и что считать authoritative | Typed own-case ref, retained issued bytes, отдельный reassessment |
| Verification | Consumer change мог повторить product execution | Execution/validation identities в существующем cache, сначала deterministic replay |

Итог ponytail-review: не добавляем сервисов, зависимостей, новых очередей/баз и общего parser/retry framework; не исправляем AGY отключением защит и не ZCode одним regexp. Выделяем только реально общий proof-core/AGY decoder, остальные изменения — существующие schemas/ledgers/readers. Умеренно усложняющие identity/compatibility поля имеют конкретных двух consumers и regression case; это не scaffolding на будущее.

План готов **к реализации**, но не является обещанием, что непроверенный native binary уже поддерживает все capabilities. Native acceptance ZCode — обязательный конечный этап P4, а не отложенное исследование «после завершения». Если он не пройден, соответствующий пункт остаётся незавершённым с конкретной причиной; enabled-by-default обходов нет. Никакая из новых проверок не превращается в полный release-gate, запуск EVAL или живую Judge-квалификацию.

Порядок совместимого внедрения: сначала bridge capability/managed-mode + его изолированный contract; затем engine reader/normalizers/policy и additive schemas; затем EVAL, который читает legacy и новый ABI; после этого pins на согласованный tuple при отдельном поручении выпуска/запуска. Нельзя сначала включить recovery renderer в engine с bridge без acknowledgement. Partial merge с capability disabled не помечается «P4 завершён». Условие полноценного native подтверждения вынесено явно, поэтому нового пользовательского выбора об архитектуре не требуется.

### 11.11 Матрица приёмки новых границ

К ранее перечисленным узким регрессиям добавить именно следующие случаи, без создания ещё одной полной батареи:

| Проверка | Нужный результат |
| --- | --- |
| AGY DONE без exit; quoted fake completion; async manage_task между launch/terminal | Task termination отдельно; fake не принимается; exact исходная invocation не теряется |
| Late requested drift при неизменном observed; роль worker у root; partial non_asserting event | Drift найден; root role не маскируется; отсутствие сведений не превращается в ложный mismatch |
| Copied helper в frozen checkout без node_modules; изменённый helper отсутствует в component list | Reader работает автономно; component coverage regression отвергает пропуск helper |
| HTTP/numeric/date/millisecond delay, одинаковые и противоречащие дубликаты; restart observer | Единая шкала, корректный not_before, no reset/no early retry |
| SendMessage отправлен, parent ack потерян; restart на dispatched; child started новую lifetime | Reconcile existing receipt/metadata, не повтор message; predecessor proof не применяется к successor |
| Все tool parts completed, но есть unresolved background handle | Ineligible recovery, а не ложный no-effects |
| Старый failed child + доказанно admitted successor running | Ждать successor, не смешивать два разных Turn как текущее противоречие и не fail Work раньше времени |
| Consumer helper изменён при тех же raw reports; два параллельных EVAL | Только deterministic revalidation, ноль новых product execution |
| Dry-run без RUN; actual stage; read-only review; imported fork; факт изменён | Никаких обещаний отсутствующего файла; actual source существует в RUN и связан hash; tamper/foreign proof отвергается |
| Foreign/dangling canonical response ref; authored, но не issued answer | Definition error; expectation не выдаётся за принятое решение |

Изменение только данного плана проверяется чтением/согласованностью ссылок и `git diff --check`, не тестовым gate. Никаких заявлений о выполненных будущих acceptance-пунктах эта проверка не даёт.

## 12. Реализация и фактические границы приёмки

P1–P3/P5–P6 реализованы в engine/EVAL: общий AGY decoder и async launch binding; profile/role provenance и проверка всех requested assertions; один pure runner-proof core с механической frozen copy, bounded recursive loading в обоих настоящих portable consumers; раздельные execution/validation identities в existing baseline cache; RUN capability context и собственные canonical references обоих case. Продуктовые UI/API/БД не изменены.

P4 реализует новый ABI отдельно от legacy, единицы/границы Retry-After, общий ограниченный episode, managed bridge acknowledgement и отсутствие внутреннего semantic replay; typed native failure сохраняется до controller/EVAL diagnostics. Same-child admission имеет durable фазы и не повторяется после потери ack. Узкие fixtures покрывают root/child, queued/restart, смену категории, exhaustion, permanent errors и fallback без repair loop.

### Уточнения после настоящей native-приёмки

- ZCode event Turn ID находится на envelope, не в payload; managed prompt receipt сохраняет именно native ID. Native terminal status ребёнка — `success`, а не выдуманное `completed` в wire API.
- Persisted SendMessage не содержит исходный output JSON/messageId/delivery. Допустим `parent_tool_successor`: exact parent Turn и native SendMessage toolCall с typed success + тот же agent/child + child metadata с этим parentToolCallId + новая lifetime и новый native Turn. Message ID и delivery не придумываются и не извлекаются из prose. Engine дополнительно связывает parent Turn со своим durable operation/prompt receipt.
- Асинхронный промежуток до появления нового Turn имеет отдельный `parent_tool_admission`: typed success + exact parent tool/new lifetime, без выдуманного Turn. Это даёт только ожидание без повторной отправки; старый failure остаётся в observer history до доказанного successor. Чужое/unbound running состояние не получает это исключение.
- Backend restart теряет native local-agent registry. Bridge выдаёт continuation reference только при exact fresh parent→current backend identity и подтверждённой residency; cold/resumed/changed generation сохраняет diagnostic proof, но возвращает `native_registry_generation_unproven` **до** dispatch.
- **Нерешённое native ограничение, не скрытый PASS:** восемь Bash parts исходного CP251 имеют completed invocation, но не structured foreground outcome/exitCode/background inventory. Этого недостаточно для доказательства settlement эффектов. Такие дети остаются `provider_recovery_unavailable: background_effects_unproven` с первичной сетевой причиной. Поддержка безопасного Read/no-tool случая не объявляется поддержкой произвольных shell effects. Для снятия именно этого ограничения нужен достаточный native effect API/evidence; `failed`/tool completed или анализ stdout не заменяют его.

### Полученные доказательства и узкие проверки

- AGY: sanitized replay настоящих task-121/task-130 подтверждает stopped/completed без ослабления causal/owner guards; AGY capacity 27 PASS, state/model corpus 51 PASS, OpenCode profile/role fixtures PASS.
- Runner proof: engine evidence/091/097 22 PASS; оба настоящих EVAL portable entrypoint проверены на восьми вложенных reports/profile@7, с отрицательными mutations. Source/build byte parity и включение helper в component inventory проверены отдельно. Binary/debug extras не парсятся как JSON и не получают required authority.
- Browser context: stage-context 18 PASS, standalone native-select probe Darwin/Chromium 1234/Playwright 1.62.1 дал unsupported для focus→ArrowDown→Enter. Это не product/keyboard PASS. Fork с новым browser tuple публикует новый content-hashed fact, не переписывает старый; unavailable probe остаётся unknown, а не новым mandatory baseline gate.
- Provider: текущие ZCode adapter/daemon 37 PASS, shared provider corpus 11 PASS, узкие capacity/observer/child и Work/MERGE/memory контракты PASS; EVAL Judge/Decisions/native attribution проверены с настоящим selected source policy. Полные engine/EVAL gates не запускались.
- Native same-child API приёмка прошла на committed bridge `41f6c4737a7a4e50be1327ba003ced23071698c0`, fingerprint `d4e061bd1bdad01814de55ff521db10eb4ee72395faea5deb06cbc93f4b8c996`, ZCode bundle SHA-256 `97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a`: один ребёнок, новая lifetime/Turn, та же GLM-5.3-Flash, Read/no-tool effects settled, exact parent_tool_successor. Собственные parent/bridge/backend процессы остановлены. Последующая partial-admission race проверяется детерминированно: дополнительный модельный прогон не способен надёжно воспроизвести промежуток до commit Turn и не подменяет этот тест.
- Дополнительный root review закрыл safe portable-loader diagnostics, foreign canonical symlink, immutable context source bounds, queued admission без early failure и отсутствие автоматического full-cycle/all-adapter выбора для тонких shared provider изменений.

GitHub CI, новые scored EVAL, release/publish, изменение pins/установленных hooks и исторических вердиктов не выполнялись. Выпуск согласованного engine/bridge tuple — отдельная следующая операция, не часть этой реализации.

## Источники внешних ограничений

- [OpenCode agents](https://opencode.ai/docs/agents/): primary/subagent role не равна модели или permission policy.
- [Playwright select options](https://playwright.dev/docs/input#select-options): semantic selection — отдельная операция, не доказательство keyboard-only interaction.
- [Chromium/CDP native select на macOS](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/3033): смежный подтверждающий report; первичное доказательство CP251 — собственный retained micro-probe, не issue само по себе.
- [AGY background-task upstream issue](https://github.com/google-antigravity/antigravity-cli/issues/1076): смежный класс, но не причина данного parser failure. В CP251 terminal сообщения уже были сохранены.

Ни одна внешняя ссылка/версия сама по себе не даёт runtime admission. Для ZCode использованы исходники и actual retained tool metadata; installed-build qualification выделена выше отдельно.
