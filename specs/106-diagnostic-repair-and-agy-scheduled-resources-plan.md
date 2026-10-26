# 106 — Диагностический repair и жизненный цикл расписаний AGY

Статус: реализован, прошёл дополнительное ревью и интегрирован в main.
Отчёт: `106-implementation-report.md`; исправления ревью: `106-review-report.md`.
Release/EVAL не выполнялись.
Дата: 2026-10-26. Основание: CP256, engine 0.9.0-beta.152.

## 1. Цель и границы

Завершённая неуспешная проверка должна передаваться агенту для диагностики и
допустимого исправления независимо от распознанного класса исключения. Tooling
доказывает завершение/принадлежность проверки, агент устанавливает причину.
Успех по-прежнему доказывает независимая повторная проверка, не ответ агента.
AGY должен различать команды, сервисы и расписания, не требуя от таймера PID/exit.

Одинаковый контракт для всех упряжек. Не добавлять decision-модель, классификатор,
новую библиотеку или отдельную систему repair. Использовать существующие Work,
repair-intents, continuation, retry receipts, runtime ownership и native observer.
Не исправлять продукт вместо Subject, не менять требования/fixtures ради PASS.
Исторические EVAL и активные runtime не изменять. Реализация отдельно; этот план
не разрешает новые EVAL, модельные пробы, release или полный gate/CI.

## 2. Подтверждённые случаи и дополнительные места

| ID | Факт и системная причина | Исправление |
| --- | --- | --- |
| D1 | Luna EVAL-20261026051956-dc45bdff: web unit 17 PASS/2 FAIL; обычный Error от toHaveTextContent и Invalid Chai property: toBeSelected превращены в unknown; repair запрещён | Не требовать семантической атрибуции для диагностического Work |
| D2 | OpenCode EVAL-20261026052529-eb7b8ec1: browser 7 PASS/1 FAIL; page.evaluate/json исключение имеет браузерные frames; тот же запрет | Передавать исходную выдачу и контекст; не разрабатывать ещё одно правило stack parsing |
| D3 | assertSourceRepairEligible вызывается не только из CODE: work-registry, vnext-code-review, repair-intents, vnext-merge; lifecycle-invocations отдельно проверяет source_repair | Перевести все входы на единый технический допуск diagnostics |
| D4 | code-checks связывает пригодность retry с source_repair; снятие одного guard не завершает цикл | Допуск явного повторного запуска после diagnosis/correction отдельно от распознавания причины |
| D5 | baseline-admission EVAL требует source_repair для фиксированного набора сложных producer-probe; producer и consumer дублируют attribution rules | Убрать классификацию как условие baseline/repair; сохранить реальную baseline-проверку и доказательство исполнения |
| D6 | AGY EVAL-20261026052351-7b5afdc6: CODE done 06:54:26 UTC; native_settled=true; шесть schedule task-* остались unknown | Вести тип и native lifecycle расписания отдельно от процесса |
| D7 | agyTranscriptFacts классифицирует IsDaemon только run_command; terminal envelope понимает командный exit/часть manage_task. Таймеры 38/70/84/92 имеют delivery, но остаются unknown | Поддержать native fired/cancelled/active для schedule с точной identity |
| D8 | Таймеры 52/157 имели TimerCondition; terminal не установлен. Истечение DurationSeconds или завершение ребёнка само по себе не доказательство отмены | Read-only native task observation; при нужде техническая отмена owned task, без model Turn |
| D9 | retireNativeServices обрабатывает только support_service; общий shutdown требует PID либо stopped. Повтор наблюдения не исправляет неподдерживаемый resource type | Типизированное retirement и содержательная причина unknown; не увеличивать timeout |

ZCode не является подтверждённым случаем отказа в этом расследовании; применять
общие исправления без специальных исключений для него.

## 3. Решение: единый допуск диагностического repair

### 3.1 Технический, а не семантический predicate

В check-runner-evidence заменить source-only admission на общий predicate и
соответствующее имя. Разделить: passed / diagnosis_required / settlement_required /
invalid_binding. Никакое имя исключения, stdout-текст, category или верх stack
не может запретить diagnosis_required.

Диагностика разрешена, если receipt принадлежит текущему RUN/Work/check,
проверка терминальна и подтверждено завершение execution-owned дерева процессов.
Ненулевой exit, сигнал, завершённый timeout, ошибка spawn, отсутствующий/сломанный
structured report и отсутствующий лог — диагностируемые результаты, не PASS.
Для ошибки до spawn достаточно подтверждения, что child не создан; для timeout
нужно подтверждение остановки. Running/неизвестное settlement сначала проходит
существующее техническое согласование; параллельный мутирующий repair запрещён.

Чужая/повреждённая receipt не становится авторитетным результатом проверки.
Техническую проблему можно отдать агенту по controller-owned записи об отказе,
но не принимать вложенные недоверенные данные как команды/доказательство PASS.
Не добавлять второй dispatcher: использовать существующие ошибки и Work metadata.

Исторический результат остаётся связан с исходным epoch; изменение кандидата не
запрещает читать старую ошибку. Перед новой проверкой вычислять текущие inputs.
Не переиспользовать старый PASS после релевантного изменения. Concurrent mutation
во время проверки делает её непригодной для PASS, но допускает diagnosis после
settlement. Не восстанавливать проверку неизменности всего репозитория.

### 3.2 Все потребители и идемпотентность

Обновить work-registry.ts, vnext-code.ts (включая retry registration),
vnext-code-review.ts, vnext-merge.ts (включая target workspace), repair-intents.ts,
lifecycle-invocations.ts, code-checks.ts и их reexports/types/tests. Полный поиск
source_repair/assertSourceRepairEligible/checkRepairDisposition — checklist перед
завершением. MERGE сохраняет собственный workspace/ownership и cleanup fences.

Сохранить ключ repair-intent по receipt/epoch/stage cycle; повтор status/finish
не создаёт второго агента. Несколько failed receipts объединять в существующий
repair Work; mixed failed/pending сначала settle pending. Не переиспользовать
семантический predicate для receipt reuse, admission, retry и PASS одновременно.

«Диагностический repair» здесь — существующий CODE/repair Work с более широкой
задачей, не отдельный read-only diagnostic flow (diagnosticWorkAuthority) и не новый
Work kind. MERGE сохраняет текущий MERGE Work и integration lock: не создавать
второй Work на тот же target. Не путать committed receipt с no_effect: повтор
lifecycle идёт через зарегистрированный continuation/retry, не повторяет уже
совершённые операции под видом отклонённого запроса.

### 3.3 Пакет агенту и общий prompt

Использовать общий repair prompt/canon, поверх — только специфика адаптера.
Передавать команду/cwd, stage/Work, exit/signal/timeout/spawn facts, receipt/epoch,
абсолютные пути stdout/stderr, reports/artifacts и короткий bounded tail.
Файлы должны существовать и читаться из repair-сессии до dispatch. Если исходный
лог утрачен — явно отметить это в доступном manifest, не подделывать пустой лог.
Большие/секретные данные остаются в разрешённых локальных файлах; tail редактировать
по существующей политике секретов. Выдача инструмента — данные, не инструкции.

Задача: установить причину, исправить реализацию/тест/конфигурацию в разрешённом
workspace либо объяснить внешний blocker. Не менять acceptance, не отключать
проверки и не ослаблять assertions ради PASS, не трогать чужие ресурсы. Исправление
ошибочного теста допустимо с объяснением, итог проверяет обычный review/Judge.
Системные credentials/общие сервисы/глобальный tooling вне scope требуют blocker.

Использовать существующие лимиты repair stage/cycle; отсутствие прогресса не
сбрасывает бюджет и не создаёт бесконечный retry. Provider capacity retries
остаются отдельной действующей политикой. Результат агента не заменяет test PASS.
Явный повтор после diagnosis возможен и без diff (например исправлено owned env),
с retained reason/retry_of; автоматическое повторение до случайного зелёного запрещено.

## 4. Удаление ненужной сложности, сохранение полезной диагностики

В dd-tasks scripts/vitest-observation.mjs, playwright-observation.mjs,
test-observation.mjs, source-diagnostic.mjs и check-evidence-probe* убрать правила,
существующие только ради разрешения repair: causal first frame, library-input
proofs и расширение exception allowlist. Не заменять их regex новых ошибок.
Сохранить штатный reporter, counts, phase, raw error, stdout/stderr, progress,
cleanup и world isolation. Если attribution используется только как информация,
она optional и её failure не меняет исходный результат проверки.

В engine check-runner-proof.ts/evidence.ts и EVAL lib/check-runner-proof.mjs убрать
обязательную семантическую проверку для repair. Сохранить boundary validation
файлов, принадлежность invocation, ограничение размера, safe paths и целостность
retained артефактов, где они реально читаются. Не ослаблять критерий PASS: команда
должна завершиться успешно; обязательные counts/completion/acceptance остаются.

Baseline-admission и definition capability: больше не запускать probe, доказывающий
распознавание перечня искусственных ошибок. Обновить контракт/fixtures/pins так,
чтобы старый producer не блокировал новый engine из-за отсутствия semantic proof.
Legacy v1/v2 читаются как диагностика; исторические receipts не переписываются.
Не нужен новый schema только ради optional удаления; при реальном изменении
обязательного поля версионировать только соответствующий контракт и потребителей.

## 5. AGY: расписание не процесс

Расширить существующий resource descriptor минимальным kind для schedule,
сохраняя owner/session/task/generation/revision и native source. Корреляция только
по native identity; без FIFO сопоставления параллельных tool calls, произвольного
stdout, текста модели, одного совпадения Prompt или истечения wall clock.

Одноразовый таймер: native delivery -> fired terminal; native cancellation/status
-> cancelled terminal; recurring schedule: delivery не означает завершение;
нужны terminal/cancel либо подтверждённый конец iterations. IsDaemon semantics
читать из schedule, не только run_command. Native observer должен наблюдать
remaining task handles и учитывать сообщения во время shutdown revision fence.

Точный historical fired/cancelled не нужен для cleanup. Источник уже установлен:
inspectAgyNativeState -> StreamAgentStateUpdates (свежая подписка, полный первый
snapshot), TaskSnapshot.toolName/taskId/isDaemon, backgroundTasksUpdate и pending
messages; inspectAgyNative -> WaitForConversationFullyIdle. Проверку полных списков
и обход descendants переиспользовать из collect-agy-native-evidence.mjs, вынеся
ровно нужный helper, а не дублируя новый verifier. Отсутствующее update в полном
первом snapshot трактовать по существующему protobuf-контракту пустого списка;
delta/неподтверждённая полнота не разрешают вывод об отсутствии.

До закрытия provider проверить owner/endpoint/session/trajectory/cwd и текущую
revision, получить полные root+descendants snapshots. Известная schedule task
присутствует -> active; отсутствует во всём полном inventory, pending delivery
drained, fully-idle barrier и revision fence подтверждены -> resource retired,
reason native_task_inventory_absent. Не выдумывать exit code/command success или
точный fired/cancelled. Historical transcript terminal остаётся optional diagnostic.
Если активное owned расписание мешает завершению, использовать существующий
stopAgyNativeTree/ForceStopCascadeTree, затем свежую inventory-проверку; не запрос
модели. Partial snapshot/неполный topology/pending message/revision race остаются
blocker. Scope cancellation не отменяет чужие conversation IDs.

Сохранённое доказательство источника: qualifications/native/agy-1.4.6-f6469b21/
captures/timer.json: samples 2–7 имеют schedule task-2; samples 8–9 уже без неё;
sample 11 имеет root SUCCESS/fullyIdle=true без задач. Transcript-derived resource
при этом unknown. Это подтверждает дефект использования данных в production,
а не отсутствие нативного API. Для CP256 52/157 задним числом terminal не заявлять:
полная свежая квитанция их retirement в этом запуске не установлена.

Обновить agyTranscriptFacts/agy-terminal-envelope, retireNativeServices (или общий
existing retirement path) и daemon-operations. Выполнить owned cancel только для
подтверждённого активного принадлежащего расписания; не посылать «продолжай» ради
очистки. Общий физический shutdown завершает owned process tree независимо от
типа задачи, но не подменяет native task evidence выдуманной командной квитанцией.

Сохранить раздельные execution outcome, physical cleanup и capture/finalization.
CODE done не терять из-за cleanup failure; итог EVAL всё равно не successful до
необходимого settlement. Повторные cleanup не запускают новый native Turn.

## 6. Порядок реализации и точечная приёмка

1. Зафиксировать реальные CP256 ошибки и AGY envelopes как обезличенные fixtures.
2. Engine: единый technical admission, все stage/lifecycle/retry consumers,
   existing repair prompt; scoped unit/integration, никакого полного gate.
3. Producers/EVAL: удалить лишнее semantic capability, сохранить execution/PASS
   и artifact integrity. Проверить legacy receipts и смешанные versions.
4. AGY: typed schedule lifecycle + native technical observation для отмены;
   сначала replay fixtures, затем только немодельная native проверка при нужде.
5. Обновить canon/readme/runbooks: failed check -> agent diagnosis, unknown live
   process -> settlement; не вводить новые обязательные подготовки EVAL.
6. Согласовать cross-repo refs по git-workflow; release/pins/новые E2E только
   отдельной задачей. Не изменять definitions работающих CP256.

Минимальные runnable регрессии:

- Реальные Luna Error/matcher и OpenCode evaluate SyntaxError, произвольный новый
  exception, ненулевой exit без report -> один diagnostic repair, не terminal.
- WORK/CODE/CODE-REVIEW/MERGE и lifecycle возвращают одинаковый continuation;
  MERGE agent получает target workspace; повтор запроса идемпотентен.
- Spawn error/timeout с завершённым tree диагностируются; живой/неизвестный
  process, чужая receipt, повреждённая binding не дают мутирующий repair/PASS.
- Изменившийся кандидат не блокирует diagnosis старой ошибки; повтор связан с
  новым input epoch; старый PASS не переиспользуется; бюджеты не сбрасываются.
- Raw logs доступны из repair cwd; missing/large/malformed report не становится
  PASS и не требует нового классификатора. Explicit retry reason сохраняется.
- AGY: fired/cancelled/condition timer/recurring/IsDaemon/parallel calls,
  поддельный stdout/message, cross-session ID, revision race, неизвестный status.
- Общий shutdown сохраняет CODE done; technical retry не генерирует model Turn;
  EVAL report не маскирует primary outcome вторичной cleanup ошибкой.

## 7. Ponytail/readiness review

Отвергнут путь «расширять парсеры на каждый stack»: причина задачи агентная,
классификация для маршрута не нужна. Нет decision-вызова, нового framework,
особой ветки Luna/OpenCode или полного corpus qualification при adapter fix.
Удаление guards выполняется совместно с consumers/probes, не просто return true.
Safety settlement, ownership, независимый PASS и ограничения агента сохранены.

Решения по repair и AGY приняты; implementation-ready. Источник native inventory
существует в pinned binary и подтверждён сохранённой native пробой. Реализация
должна доказать production reconciliation точечными контрактами, а не просто
объявить весь historical transcript terminal или увеличить бюджет ожидания.

Источники: CP256 retained receipts/timeline/daemon.json/transcript; engine source
_worktrees/dd-flow-cp255, producers _worktrees/dd-tasks-cp255, EVAL _worktrees/dd-eval-cp256.
Документация: https://www.antigravity.google/docs/commands/schedule ; upstream
https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md
(таймеры и recurring jobs terminal без выдуманного exit code).

## 8. Дополнения расширенного аудита и окончательные решения

### 8.1 Дополнительные подтверждённые барьеры

| Место | Что избыточно | Принятое изменение |
| --- | --- | --- |
| verification-matrix.ts:65 | Общий prompt запрещает source repair для timeout/infrastructure, не предоставляя diagnostic continuation | Переписать один общий блок: после settlement разрешена диагностика, не предписана правка продукта |
| lifecycle-invocations.ts:788 | Retry reason заранее утверждает candidate-source correction даже при восстановленном окружении | Нейтральный reason о diagnosis/correction; фактическая причина берётся из repair результата |
| code-checks.ts:691 и retained library inputs | Чтение старой ошибки/явный retry блокируются изменением dependency bytes, собранных ради semantic attribution | Удалить library-proof gate; новую проверку связать с текущими объявленными inputs/env, не требовать восстановления старой библиотеки |
| checkReceiptEvidenceValidForMode(diagnostic) | Для разрешения чтения диагностической ошибки требует полный набор acceptance-artifacts | Разделить usable diagnostic packet и accepted check proof; отсутствие report/hash не скрывает nonzero и не блокирует diagnosis |
| work-registry.ts:1557 | Любое review finding требует changedPaths.length > 0 | Разрешить мотивированное already_satisfied/disputed, только независимое re-review закрывает finding |
| work-registry.ts:1547–1553 | Документ обязан быть listed changed и отличаться байтами от PLAN baseline | Не считать байтовый diff доказательством смысла; дать already_satisfied с evidence и независимым review |

Для последних двух случаев минимально расширить существующие result/resolutions
и document-update completion, не создавать отдельный adjudication сервис:
resolution disposition fixed / already_satisfied / disputed, summary и существующие
evidence_refs. Без disposition исторический result трактуется как fixed. Для
already_satisfied/disputed обязательны непустые rationale/evidence и независимое
решение ревьюера; агент не может самостоятельно закрыть finding. Disputed до
решения остаётся pending, отклонённое возражение возвращается в тот же bounded
repair cycle. Изменение требований — существующий вопрос/эскалация, не reinterpretation.
Для document create отсутствие требуемого файла остаётся ошибкой; already_satisfied
допустим только если файл существует и содержание проверено ревью. Для update
разрешено показать, что принятому требованию уже соответствует baseline. Пустой
diff без объяснения не считается выполнением. Fixed не доказывается одним diff:
обычные проверки и повторное ревью обязательны.

### 8.2 Что исследовано, но не объявлено лишним

- HITL exact цитаты/coverage-review относятся к достоверности канонического ответа,
  а не к маршрутизации test repair. В этом плане не удалять их. Проверить только,
  что adapter-only изменения не инвалидируют Judge qualification и не вызывают
  повторные review/model calls: изменение зависимости -> затронутые кейсы; иначе
  reuse. Нового дефекта ключа без воспроизведения не утверждать.
- Сравнение accepted bytes с опубликованным packet, ownership/revision/lease,
  MERGE accepted tree, безопасные пути, принадлежность receipts и проверка inputs
  для reuse PASS сохраняются: это подмена/гонки/ложный PASS, не semantic parsing.
- Не удалять structured reports целиком. Counts/completion и конкретные обязательные
  acceptance artifacts остаются на стороне зачёта успешной проверки.
- Не выполнять общий рефакторинг memory-init/publication custody: там другой
  предмет проверки. Обновить только общий check consumer/prompt, если он использует
  изменяемый helper; не менять семантическое accepted/needs_repair по аналогии.

### 8.3 Дополненные acceptance cases

Добавить точечные контракты: no-change из-за исправленного окружения; valid disputed
review -> независимое решение; rejected dispute -> bounded repair; уже актуальный
документ без фиктивного diff; отсутствующий обязательный create; legacy result без
disposition; MERGE продолжает того же owner; committed lifecycle не становится
no_effect; повреждённый optional diagnostic не даёт PASS и не скрывает raw error.

Стратегия удаления: сначала найти всех потребителей public proof exports и старых
fields, обновить новый путь, затем удалить недостижимые helpers и их синтетические
probe-тесты. Legacy readers оставить только для retained history, без нового
обязательного производства старых proofs. Удаление не должно ломать status/report
исторических EVAL. Изменить связанные result schemas и shared prompts одновременно.

### 8.4 Финальная проверка решений

Native retirement regression: timer present -> absent в полном inventory + drained
-> cleanup разрешён даже без terminal envelope; точный fired/cancelled неизвестен
и не публикуется. Recurring присутствует -> не retired; owned stop -> свежая
absence; incomplete/delta/revision race/queued message -> не PASS. Ноль model calls.

Тесты по зонам: engine checks/repair/lifecycle/review/merge, affected canon prompt,
producer/EVAL baseline compatibility и AGY native shutdown. Тяжёлые полные suites,
GitHub CI, Judge corpus qualification и новые E2E не требуются для этой реализации.
Проверка нового review result выполняется в существующей validation/schema зоне.

Готовность означает согласованный алгоритм и критерии, не пройденную приёмку:
реализации/релиза/нативного нового прогона ещё нет. Новая смена поведения требует
согласованного canon + engine; docs-only план хранится отдельно от frozen CP256.

## 9. Заключительный проход по аналогичным ограничениям

Охват: engine services (check admission/retry, Work results, lifecycle, review,
MERGE, diagnostic stages, memory publication/readiness), native adapters/shutdown,
EVAL baseline/qualification/case acceptance и связанные canon prompts. Это аудит
классов барьеров и их callers, не доказательство ненужности каждой проверки:
только в services имеется около 2482 throw AppError. Не заявлять «все лишние
проверки найдены» на основании поиска ключевых слов.

### 9.1 Дополнительное подтверждённое упрощение

diagnostic-stage-results.ts assertDiagnosticStageScope требует точного копирования
focus prose/coverage annotations из predecessor, assertDiagnosticReportData —
копирования reviewed details. diagnostic-stage-handlers.ts уже детерминированно
добавляет retained limitations через sealDiagnosticStageLimitations. Расширить этот
существующий подход: trusted predecessor поставляет retained focus/coverage, а для
report — reviewed details; агент пишет только новые разрешённые поля (summary,
findings/sources/limitations на соответствующих этапах). Сохранить входную binding
и принятый scope; не принимать изменение scope через агентный JSON.

Предмет проверки остаётся полезным, ручное копирование моделью — нет. Новый
контракт допускает отсутствие CLI-owned полей; legacy result с теми же значениями
принимается, конфликтующие предложения отклоняются как попытка смены принятого
scope (не молча скрываются). Materialization выполняется до полной schema validation
и sealing, из проверенного predecessor, не из произвольного пути, result или stdout.
Для report agent-added limitations объединять с retained, не стирать reviewed facts.
Обновить schema/template/prompts вместе; точечные tests: omitted retained fields,
same legacy fields, conflicting fields, forged predecessor, retained limitations,
new stage analysis и report с прежними фактами. Не менять порядок критиков и их
семантические решения в этом исправлении.

### 9.2 Уже имеющийся путь вместо нового механизма

Memory repair имеет outcome reconciled, changes:[], resolutions с evidence,
независимый selective review и запрет фиктивных изменений
(work-registry.ts, memory-repair-work-result). Для CODE no-change disposition из
§8 использовать такую же семантику «предложено согласовать, не принято самим
агентом», адаптировав текущую CODE schema. Не тащить private MB publication machinery
в CODE и не вводить третий универсальный adjudicator. Существующий memory-repair
путь не менять: он уже решает этот кейс.

### 9.3 Не подтверждено как дефект — не расширять scope

qualificationJudgeInput/qualificationTask уже исключают версии, hooks, capacity и
transport из Judge semantic identity; это соответствует adapter-only reuse.
Требования model/reasoning и неизменности реальных semantic inputs сохраняются.
Не превращать этот аудит в повторную живую квалификацию Judge.

Memory-finish readiness/tool hash, publication byte custody, accepted stage packet
binding и diagnostic critic endorsement имеют конкретный предмет: воспроизводимость
использованного инструмента, публикация принятых данных, запрет подмены/самопринятия.
В этом проходе оснований удалять их не установлено. Временную стоимость таких
проверок не измеряли, поэтому дублирование CPU/IO без профиля не объявляется багом.

Итог readiness: алгоритмы приняты; две независимые гарантии — admission diagnosis
и acceptance PASS — разнесены; no-change требует независимого решения; retained
данные формируются tooling; AGY использует существующий inventory, не новый парсер.
Реализация по затронутым зонам; общий cleanup всех guard/checks не является задачей.
