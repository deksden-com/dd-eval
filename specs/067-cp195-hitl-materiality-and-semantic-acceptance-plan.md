# 067 — CP195: материальность HITL и надёжная семантическая приёмка

Дата: 2026-10-06. Статус: **A–H реализованы; offline verification выполняется;
новая live acceptance G6/G7 NOT RUN**. Итог реализации — §11.
Документ фиксирует расследованные дефекты и перепроверенные находки аудита.
Design решения закреплены в §9; это не разрешение повторить Judge/E2E до PASS.
Implementation-readiness перепроверена 2026-10-06; обязательные уточнения — §10.

Исходные версии: EVAL `26709e2`, ветка `eval/cp195-luna-engine-identity`,
checkout `/Users/deksden/Documents/_Projects/_worktrees/dd-cp195-engine-identity.MXZVnb/eval`;
FLOW `ff066da12c2ebf86ed28ae76c72bd837cc57891a`, beta.125,
checkout `/Users/deksden/Documents/_Projects/_worktrees/dd-flow-051-implementation`.
Живая qualification использовала EVAL definition `6f26d0c`; следующий commit
`26709e2` добавил только отчёт. План 066 другого задания не изменяется.

## 1. Цель и неизменяемые границы

Один общий Interaction Judge корректно различает:

- обязательное принятое решение без ответа — `fixture_gap`;
- предложенное агентом расширение — `out_of_scope`;
- явно отвергнутую/заменённую каноническим ответом предпосылку — покрытое решение;
- существенную неразрешённую ссылку — `ambiguous`;
- повтор уже принятого решения без нового условия — `unnecessary_question`.

Одинаковые правила действуют для всех harnesses, qualification, рабочего HITL,
reference, recovery, повторного чтения evidence и отчётов. Не меняем продукт,
accepted task semantics, исторические EVAL/qualification/verdict, canonical
answer ради PASS. Не вводим keyword overrides, особые правила для item/harness,
majority vote, retry-until-PASS, второй Judge для исправления первого, новый
scheduler/ledger/parser/framework/dependency. Не возвращаем wall-clock cap живому
Judge и не считаем отсутствие ответа финальным доказательством fixture defect.

## 2. Уже установленная цепочка

CP195 Luna scored E2E **не создан**: отказ произошёл в definition qualification
общего Judge `gpt-6.1-sol/high` через `cx`, а не в Subject Luna.

Qualification key:
`9ba40a03b0d5bb4770d80d3fcc5c7b1ee439c03548cc148b58da5169b88b0564`.
Attempt: `operation-24b36837-3659-438c-bc88-d539043050e4`.
Evidence root: `/Users/deksden/.dd-eval/definition-qualifications/<key>/<attempt>/`.
Item: `interaction-judge/specify-e16c8108/{packet,result,cleanup}.json`,
`events.jsonl`, `model-observations.jsonl`; общий `failure.json`.

Из 17 items семь PASS, восьмой `luna-cp190-exact` FAIL, девять NOT RUN.
Native Turn completed `2026-10-05T17:28:02.786Z` (19:28:02 Калининград).
Все восемь Judge cleanup settled. Packet/receipt/fixture hashes и точные ответы
согласованы; рабочий Turn получил high после обновления настроек thread.
Журнал показывает новые reasoning/message/tool signals, не timeout/provider error.

Из 12 атомов один: `source_quote="их порядок"`, decision «Зафиксировать порядок
уровней приоритета», classification `fixture_gap`; rationale: словарь не задаёт
порядка уровней. Остальные 11 covered. Исходная задача требует поле и текстовую
подпись; context исключает новые сортировку/workflow/индикаторы. Ответ явно
отвергает дополнительные сравнения/ранжирование/сортировку и отдельный порядок
UI-контрола. Отсутствие формального порядка уровней истинно, но его необходимость
для принятой задачи не доказана. Предложение Subject не создаёт acceptance.

Предыдущая engine identity regression исправлена `ff066da` и прошла normal
consumer acceptance. Она не причина этого semantic failure и не открывается
заново в плане 067. Отчёт: `runbooks/cp-195-luna-engine-identity.md`.

## 3. Реестр подтверждённых дефектов

Метки: **F** — причина текущего live отказа; **P** — воспроизведено offline;
**C** — подтверждённая ветка/опасный паттерн, участие в live отказе не доказано.

| ID | Факт и первопричина | Общая точка исправления |
|---|---|---|
| M01 F | Judge принимает «это необходимо» из мотивации Subject за обязательный scope; наличие отдельной детали и отсутствие ответа заменяют проверку материальности | `lib/hitl-contract.mjs:interactionGroundedPrompt`, grounded atom contract |
| M02 C | Covered требует exact answer evidence, но fixture_gap требует только пустого answer_evidence и произвольного rationale; происхождение обязательности не сохраняется | shared packet/schema/validator, не regex semantic override |
| M03 P | Exact CP190 corpus item не имеет atom expectations: удаление Q002/Q003 и сохранение одного covered atom проходит structure/oracle/aggregate comparison | `lib/hitl-corpus.mjs`, corpus и qualification live/retained verification |
| M04 P | Unit test проверяет фразы prompt и заранее правильный verdict, но не применение materiality policy; текущие 16 contract/oracle tests PASS при live FAIL | различить structural unit evidence и native semantic acceptance |
| M05 C | Non-pair smoke добавляет произвольный audit-retention запрос и ожидает fixture_gap без принятого audit scope | `tools/native-interaction-judge-smoke.mjs`, явные positive/negative packets |
| M06 P/C | Judge дважды исправляет невалидные цитаты через shell; проверки с AssertionError возвращают exit 0 после cat; общие `/tmp/result*.json` создают риск коллизий | убрать обязательную shell-проверку из shared prompt; authoritative validation в коде |
| M07 C | Любой semantic mismatch qualification назван `definition_qualification_gap` / «question is not covered», в том числе ложный covered или иной неправильный класс | shared comparison/error diagnostics + CLI/runbook/tests |
| M08 P | Per-atom IDs и варианты oracle не сверяются со stage fixture и expected aggregate: `NOT_IN_FIXTURE` и противоречивый summary проходят cheap validation | oracle + known fixture/общая проекция до native create |
| M09 P | Exact cardinality и finite whole-quote matching отвергают корректное разделение на новые contiguous fragments | corpus-only finite coverage obligations без total atom count; не runtime parser |
| M10 P | Поздние Stage объявляют directory sources, materializer принимает stat(directory), HITL packet reader требует regular file; PLAN+ может отказать до Judge | manifest только явно объявленных directory sources, общий grounding builder |
| M11 P | origin.roles не сверяется с declared roles; physical alias dedup хранит только первый locator и union roles | v3 provenance contributors + checked role union; роли не semantic authority |
| M12 C | Shared Final Judge не помечает evidence/artifact content как данные, не инструкции; supplemental делает это только для claims | один common final prompt block; не перенос HITL atoms в Final Judge |
| M13 C | Smoke принимает frozen packet, но пересобирает sources из текущих paths без сравнения input grounding | до native create сверить frozen grounding либо fresh authored materialization |
| M14 P/C | `validateStageContext` и packet builder принимают object вместо string в accepted_decisions; новый indexed scope evidence не имеет однозначного строкового источника | проверка semantic fields на входной границе HITL @3, без переписывания исторического stage-context@1 |
| M15 P/C | Packet builder принимает duplicate response IDs; shared validator отвергает их только вместе с verdict, то есть caller может уже оплатить Turn | общий packet-only validator до native create; runtime fixture loader уже имеет свои guards, не приписывать этот путь CP195 |

M06 — наблюдавшаяся лишняя работа/ненадёжная вспомогательная проверка, **не**
причина финального semantic отказа. Коллизия temp файлов здесь не доказана.
M14/M15 — перепроверенные входные границы для нового consumer; их участие в
исходном CP195 отказе не установлено. M14 не объявляет нарушение прежней generic
stage-context schema: именно новый indexed evidence требует строкового источника.
Детерминированный validator не обязан и не способен доказать entailment
произвольного естественного языка. M02 исправляет accountability, не заменяет Judge.

## 4. Поверхность систематического аудита

Проверить все producers/callers/consumers и tests, а не только Luna branch:

| Поверхность | Обязательные места |
|---|---|
| Semantic SSOT | `lib/hitl-contract.mjs`, `schemas/hitl-match.v*.schema.json`, packet `required_result` |
| Native lifecycle/issuance | `lib/runner.mjs:interactionJudge`, `validateHitlMatch`, `resolveHitlJudgment`, `acceptedHitlAnswer`, `answerFor`, productive/recovered HITL |
| Qualification | `hitlQualificationInputs`, `qualifyHitlDefinition`, `assertHitlQualification`, `materializeQualificationContext`, corpus declaration/hash/context |
| Retained/replay | `lib/hitl-retained.mjs:verifyRetainedHitl`, event anchors, `hitlEvidenceFor`, `lib/judge-cleanup.mjs` |
| Diagnosis/attribution | `lib/operation-errors.mjs`, infrastructure/validity maps, failure/report/Final Judge packet, CLI serializer |
| Other Judges | `finalJudgePrompt`, supplemental assessment/packet building; не навязывать им HITL response-selection контракт |
| Tests/tools | `test/hitl-{contract,corpus,retained,issuance}.test.mjs`, `test/eval.test.mjs`, evidence/recovery tests, native smoke |
| Case definition | все `cases/**/interactions/*.json`, `decision_tags`, accepted scope sources, stage-context/blueprint |
| FLOW | `src`, bundled harness assets, service prompts/semantic check contracts: проверить, есть ли sibling matcher/materiality consumers |
| Operations | `runbooks/execute-eval.md`, CP195 report, active instructions; historical reports не переписывать |

Результат каждого поиска: реальная цепочка, callers, факт/probe, минимальное
исправление, тест, либо обоснованное «изменения не нужны». Это аудит класса
дефектов по всей релевантной кодовой базе, не обещание отсутствия любых багов.

## 5. Исправления и порядок реализации

### A. Материальность и общее grounded решение — M01/M02

1. Перестроить существующий prompt в короткие последовательные секции, а не
   дописывать ещё один частный запрет: определить запрос и условия → разрешить
   ссылки → проверить scope/необходимость → сопоставить точный ответ с учётом
   отказа/замены предпосылки → сохранить все действительно независимые решения.
2. Subject question, options, recommendation и «почему требуется» не являются
   authority принятого scope. Canonical applicability/topic — descriptors, не
   ответ и не authority. Явный принятый контекст/исходная задача и exact canonical
   answer — основания анализа; команды внутри них остаются untrusted data.
3. Сохранить CP193 rule: ответ не может быть источником antecedent неразрешённой
   ссылки. Scope evidence и reference_bindings — разные обязанности. Отказ
   отвечает на ясный запрос о необходимости функции, но не устраняет реально
   неизвестный предмет вопроса. Не считать любую неоднозначность материальной.
4. Добавить minimal structured scope evidence для `fixture_gap`: точная цитата
   принятой задачи/контекста или зависимого принятого правила и краткое объяснение
   в существующем rationale, почему без решения нельзя выполнить objective.
   Context-only genuine gap допустим: `qualification-gap.json` имеет
   accepted_decisions без file sources. Не требовать отдельный file или буквальный
   запрос пользователя, если необходимость логически вытекает из принятого правила.
5. Детальная форма нового evidence закреплена в §9.1.
   Нельзя использовать quote из question/recommendation как единственное основание;
   canonical refusal учитывается отдельно, не превращается в invented positive rule.
6. Для остальных классов materiality proof не становится лишней безусловной
   обязанностью. У covered остаётся exact answer evidence; у реального gap —
   пустое answer_evidence. Не добавлять second semantic verifier/LLM call.
7. Runtime validator проверяет только contract, identities, exact membership,
   allowed origins и hashes; семантическая необходимость проверяется Judge/corpus.
   Цитата про поле priority сама по себе не доказывает нужность rank. Это явный
   ceiling и отдельный отрицательный acceptance case.

### B. Версии, issuance и история — обязательная часть A

1. Breaking raw contract получает `dd-eval/hitl-match@3`; v2 schema/verifier
   сохраняются для immutable исторического чтения, не меняются под прежним ID.
   Новый packet получает @3 с новым required_result; qualification получает @3.
2. Единые current contract constants и явно разрешённые historical readers внутри
   существующих HITL модулей. Не оставлять literals @2 в hardcoded guards replay,
   qualification packet validation, schema/tests/tools. Не новый plugin registry.
3. Новая issuance/новая qualification требуют @3. Retained @2 читается в
   соответствующей pinned historical definition; upgrade/resume нового кода
   старого productive EVAL не разрешается. Не преобразовывать старый verdict.
4. Durable same-pause recovery сначала проверяет packet/profile/Session/prompt/
   contract binding. Старый paid Turn не повторяется из-за schema change;
   unknown outcome остаётся blocker. Existing cleanup/hash/event/pause/scope/round
   проверки сохраняются для обеих grounded версий.
5. Изменённые prompt/validator/oracle/code/corpus identities инвалидируют новый
   admission через existing qualification identity. Не вырезать definition tree
   из cache key в рамках этого плана; новая scoped-cache система не нужна.
6. Тесты raw/schema/runtime, direct issuance, retained replay, evidence delivery,
   cached receipt и recovery покрывают current и historical версии явно.
   Historical read-only flag никогда не разрешает current issuance: @2 report/
   evidence read PASS, но current resolve/answerFor/receipt reuse @2 reject до
   daemon/create/prompt/resume. Unknown paid @2 operation сохраняет outcome/identity,
   не повторяется и не преобразуется в @3 из-за новой версии prompt.

### C. Полнота semantic oracle — M03/M04

1. Не заменять точный исторический вопрос упрощённым и не менять expected class
   ради текущего результата. Добавить CP195 verdict как immutable negative fixture;
   expected justification хранить на oracle стороне, не в Judge packet.
2. Усилить compound cases с критическими независимыми решениями: Q001 dictionary/
   rejected ordering, Q002 defaults/create/update, Q003 archive/UI/API. Возможность
   объединять/разделять покрытые атомы сохраняется, точное число атомов не criterion.
3. Existing oracle и малые парные вопросы недостаточны для exact compound omission
   probe и независимого от total count split/bundle. Расширить существующий
   oracle минимальными coverage obligations (§9.2), не строить
   universal semantic parser. Presence quote — необходимая, но не достаточная
   гарантия смысла; это ограничение явно проверяется live.
4. Проверить все 17 current items: составные вопросы без targeted checks, ложный
   дополнительный gap, потеря независимого gap при unchanged aggregate, bundled/
   split/shared quotes, partial coverage, duplicate evidence. `decision_tags`
   считать метаданными, пока они не проверяются кодом, не выдавать за доказательство.
5. Scope pairs: одинаковый вопрос в принятом/непринятом scope; отказ от предложенного
   варианта versus самостоятельное необходимое unresolved решение; material
   references resolved/unresolved; implied necessary decision versus Subject claim.
6. Structural tests продолжают проверять свой контракт, но их names/report не
   называют это semantic PASS. Не подставлять expected answers в native Judge.

### D. Smoke и детерминированные проверки — M05/M06

1. Native smoke принимает явные authored positive/negative packets и expectations,
   не создаёт «independent» gap простым дописыванием audit-history предложения.
   Переиспользовать existing corpus/context/interactionJudge; новых dependencies нет.
2. Минимальная обязательная contrast группа: canonical rejection covered; genuine
   accepted unresolved gap; extra scope; resolved/unresolved reference. Сохранять
   все исходы; никаких повторов после FAIL ради PASS. Trial schedule задан заранее.
3. Убрать из shared prompt требование выполнять shell/Python substring check и
   создавать промежуточный JSON. Judge читает packet и возвращает JSON; наш
   validator уже проверяет каждую цитату. Невалидный результат fail-closed,
   без silently stitching/rewording и без автоматического semantic repair.
4. Не читать/использовать `/tmp/result*.json` как authority. Если нужны scratch
   инструменты, только unique operation-local directory через имеющийся root;
   не создавать новую sandbox систему ради prompt policy. Prompt-only restriction
   не объявлять hard filesystem isolation. Проверить sibling Judge prompts/tools.
5. Сохранить genuine tool activity в liveness; удаление лишней shell-проверки
   не отключает productive reasoning/message/tool signals и не меняет timeout policy.
6. Existing packet smoke до native create сверяет rebuild с frozen grounding и
   identity input packet; snapshot не заменяется изменившимся source. Простой
   основной режим — fresh authored corpus inputs.

### E. Диагностика — M07

1. Один comparator expected/observed для live loop и cached receipt validation;
   классификационное расхождение, response IDs и completeness mismatch различимы.
2. Новый семантический отказ qualification — `definition_qualification_mismatch`,
   message «Judge verdict differs from authored expectation», а не доказанный
   `fixture_gap`. Runtime `interaction_fixture_gap` сохраняется для собственно
   verdict gap; не объединять qualification mismatch с provider failure.
3. Existing error.details: item/stage, expected/observed classes/IDs, mismatch
   kind, missing obligation IDs/extra atoms, packet/receipt locators, qualification
   key/contract. Не печатать полный private context или reasoning.
4. Проверить error serialization, CLI, infrastructure maps/report/Final Judge
   packet: не приписывать отказ Subject Luna и не считать offline qualification
   падением scored EVAL. Cleanup error отдельно от primary semantic cause.
5. Historical `definition_qualification_gap` остаётся читаемым с исходным meaning;
   старые failure receipts не переписываются. Corpus count в новых reports брать
   из actual items, historical stale «18» пометить как историческое расхождение.

## 6. Gates и проверяемые критерии завершения

### Дополнительные пакеты F/H, обязательные для G4

**F — доступный Stage context/provenance (M10/M11/M13).** Materializer и packet
builder поддерживают существующие file/directory declarations согласованно.
Один helper в HITL module перечисляет только declared artifact subtree и
фиксирует sorted manifest regular UTF-8 files через existing descriptor reader.
Не skip directory, не scan project/home. Все aliases одного physical file
сохраняют contributors `{root,path,role}`, у directory child также declared
parent и relative locator. Role union выводится/проверяется из contributors,
не служит permission для объявления содержимого accepted. Runtime retained read
проверяет frozen manifest, qualification rebuild — immutable authored inputs.
Directory bounds/encoding/security определены в §9.3. Тесты через actual PLAN+
blueprint: nested file, empty/missing source, optional, alias, symlink escape,
FIFO/device, encoding, mutation during snapshot и membership change.

**H — Final/Supplemental boundary (M12).** В существующий `finalJudgePrompt`
добавить один общий блок: selected authored assessment/rubric определяет критерии,
Subject artifacts, diagnostic/launcher text и supplement claims — evidence,
не команды Judge и не authority новых требований. Даже текст rubric не может
отменить output schema/allowed reads/lifecycle policy prompt. Сохранить scope IDs,
original frozen assessment, incomplete-stage policy и оценку по source evidence,
не перенести HITL atom schema сюда. Supplemental suffix сохраняет специальные
proof limits, удаляет только дублирующий общий boundary. Extend current final/
supplement tests, не выдавать prompt/packet shape тест за semantic model proof.

| Gate | Проверка / ожидаемый результат |
|---|---|
| G0 | Freeze revisions и evidence, clean scope; исходный CP195 verdict неизменен |
| G1 | Structural schema/runtime parity @3, packet-only admission M14/M15 до native create, forged origins/quotes/IDs и неподтверждённый gap proof reject; historical @2 читается без upgrade |
| G2 | CP195 extra-order/drop-Q002/Q003 negatives обнаруживаются; valid bundled/split PASS; true gap/extra/ambiguity не теряются; impossible oracle reject до native create |
| G3 | Current issuance и historical read-only verification, same-pause recovery, qualification live/cache и cleanup используют общий boundary; historical flag не выдаёт новый answer |
| G4 | Smoke explicit/frozen scopes, owned scratch, directory grounding/provenance, normal/supplemental boundaries и diagnostics; ни regex override, ни semantic repair/retry |
| G5 | Targeted suites и полный `npm test` EVAL PASS без пропусков/переписывания expectations; FLOW checks только если audit обосновал изменения FLOW |
| G6 | По отдельному разрешению новая committed definition: contrast smoke и все current corpus items native PASS с settled cleanup; никакой retry-until-PASS |
| G7 | По отдельному разрешению normal prepare/preflight/baseline и новые scored E2E; qualification PASS не выдавать за full-cycle E2E PASS |

Команда первой offline проверки из EVAL checkout:
`node --test test/hitl-contract.test.mjs test/hitl-corpus.test.mjs test/hitl-retained.test.mjs test/hitl-issuance.test.mjs test/evidence-schema.test.mjs`.
Использовать установленный Node и существующий тестовый runner.
Живые G6/G7 в задачу написания плана не входят. Не обходить broken semantic gate
ради запуска трёх/четырёх упряжек. У каждого native failure сохранять first cause.

## 7. Порядок работ и deliverables

1. Завершить аудит (§4), перепроверить каждую находку, дополнить §3/§9.
2. A+B: контракт/prompt/current/historical paths и их unit/boundary checks.
3. C: oracle/corpus полнота и mutation regressions, без expected leakage.
4. F до новых live trials: directory grounding/provenance и проверки.
5. D+E+H: smoke/deterministic checks/diagnostics/common boundaries и документация.
6. G1–G5, review по каждому M ID; implementation report с actual counts/status.
7. Commits/push и live trials выполняются только в соответствующей последующей
   задаче. Не менять user-owned план 066 или параллельные worktrees.

## 8. Проверка ponytail (full)

- Reuse existing HITL module, validators, hashes, corpus, native lifecycle,
  cleanup и Node test runner. Не новый semantic service и не второй ledger.
- Удалить shell substring self-check, а не чинить каждый сгенерированный shell.
- Один общий materiality policy, без harness/item switches и ранжирования продукта.
- Не обещать больше, чем гарантируют exact quote membership и finite oracle.
- Breaking schema требует явной версии и исторического reader — это необходимая
  защита границы, не факультативная строгость.
- Живая semantic acceptance — отдельное доказательство; полный offline PASS её
  не заменяет. План не разрешает ослабить oracle или повторить до удачного ответа.

## 9. Проверенные дополнения аудита и финальные design решения

Три read-only аудитора проверили core contract/issuance/replay, corpus/smoke/oracle
и prompt/evidence boundaries. Основной агент перепроверил источники и probes.
Native вызовов, изменений runtime/product artifacts в аудите не было.

### 9.1 Минимальный materiality contract v3

В новый atom добавить ровно одно поле `scope_evidence`, всегда array.
У `fixture_gap` array непустой; у остальных классов `[]`. Existing rationale
объясняет necessity/dependency и почему canonical replacement/refusal не разрешает
данное независимое решение. Не добавлять chain-of-thought и новые explanations.

Evidence — один из строго tagged вариантов:

```json
{"kind":"context","field":"objective","quote":"exact semantic field fragment"}
{"kind":"context","field":"accepted_decisions","index":0,"quote":"exact decision fragment"}
{"kind":"source","source_id":"source-0","quote":"exact retained source fragment"}
{"kind":"response","response_id":"existing-id","quote":"exact canonical answer fragment"}
```

Context fields — только `objective` и string elements `accepted_decisions`;
не сериализованные roots, paths, reason или metadata. Source ID — только
existing frozen source-N; question/context source IDs не могут замаскироваться
под source. Response разрешён как основание принятого зависимого правила,
**никогда** как antecedent для reference_bindings или applicability-only evidence.
Quote входит в соответствующую original string; duplicate entries reject.
Неопределённый scope не даёт автоматически gap: сохранять материальную
ambiguity/out-of-scope по данным packet, не выдумывать уверенный класс.

Позитивный context без files — simultaneous updates из qualification-gap.json.
Dependency — принятое правило closed tasks может требовать минимального
сохраняемого состояния, даже если initial request не назвал его буквально.
Негативное basis — quote «добавить priority» не доказывает обязанность ranking.
Этому нужна semantic проверка, а не только наличие source ID.

Machine checks лишь отвергают отсутствие/подделку basis; они **не доказывают**
fixture defect. @3 schema mirror runtime rules. Перед новым live acceptance F
обязан корректно собрать directory/context и provenance для source evidence.

### 9.2 Finite coverage oracle без total atom-count equality

Legacy expected_atoms/expected_atomizations сохраняются для исторических definition.
Новый active corpus использует одно corpus-only поле expected_coverage:

```json
{
  "obligations": [{
    "id":"q2-create",
    "classification":"covered_by_canonical_response",
    "response_ids":["clarification-task-priority"],
    "witness_ids":["q2-bundled","q2-create"]
  }],
  "witnesses": [{
    "id":"q2-create",
    "source_quotes":["exact authored allowed question fragment"],
    "classification":"covered_by_canonical_response",
    "response_ids":["clarification-task-priority"]
  }]
}
```

Схематический пример: в actual corpus все referenced witnesses, включая bundle,
должны быть объявлены. Rules:

1. IDs уникальны; references существуют; у каждой obligation >=1 witness;
   каждый witness используется. Нельзя одновременно новое поле и expected_atoms/
   expected_atomizations. Expected fields/IDs никогда не попадают в Judge packet.
2. Каждый observed atom совпадает с одним finite witness по exact source_quote,
   classification, set response IDs. Не includes/regex слов «порядок», не guessed
   смысл decision/rationale. Каждая required obligation имеет observed witness;
   explicitly authored bundle может покрывать несколько obligations. Total count
   не сравнивается. Unexpected atom reject — не ослабление до «что-то покрыто».
   Collision одинаковых observable signatures у разных witness IDs — invalid
   corpus: source_quotes intersection + одинаковые class/response-ID set. Если
   цитата реально общая, автор объявляет один explicit bundle и связывает его с
   нужными obligations, не implicit union всех совпавших IDs.
3. Bundled/split/overlapping fragments перечислены автором oracle: это finite
   corpus qualification, не ограничение рабочего HITL и не universal parser.
   Repeated allowed quote у разных covered decisions допустим; exact duplicate
   atom/evidence отвергает shared validator. Independent negative obligations
   не объединять в broad generic witness, маскирующий пропуск.
4. Развести obligations dictionary/labels, create/default/update, archive/UI/API
   и independent negative decisions. Test legitimate split/bundle/reordering/
   UTF-8/CRLF; не ставить число expected atoms вместо проверки полноты.
5. Coherence до native create: known per-witness/per-atom/obligation IDs,
   classification ↔ response IDs; legacy alternative projections ↔ item summary.
   Shared projection helper reuse runtime precedence/union. Obligations имеют
   стабильные expected class/ID set. Witness class совпадает с class **всех**
   связанных obligations; witness response IDs — exact union их ID sets. Так
   bundle A+B допустим рядом с split A/B, без экспоненциального перебора комбинаций.
   Проекция всех obligations соответствует item expected summary; bundle с
   mixed classifications invalid, независимые uncovered причины не сливаются.
6. Все 17 active items получают authored expected_coverage; corpus вводит явный
   `coverage_required: true`, проверяемый до native create. Old expected_atoms/
   atomizations сохраняются только для legacy definition; новый active gate их
   не допускает вместо обязательного coverage. Новые
   semantic counterexamples добавляются сверх, не заменяют historical question.
   Проверить hashes fixtures/context/corpus declaration до definition commit.
7. Mutation tests убирают каждую obligation при unchanged aggregate, Q002/Q003,
   actual gap/reference, добавляют false gap, invalid ID/alternative/summary.
   Finite oracle ceiling: broad quote/full answer может маскировать неверное
   free-text decision. Он **не доказывает** произвольное semantic completeness;
   live contrast и экспертная проверка ожидаемых witnesses остаются обязательными.
   Конкретные gates: Q1-only actual mutant выдаёт missing Q2/Q3 IDs; Q2-only —
   missing Q1/Q3. Signature fragment Q1 не является witness Q2/Q3. Full valid
   bundle и split с разными answer ID sets проходят, implicit signature collision нет.

### 9.3 Directory manifest: точная граница и безопасность

Это reader existing declared artifact directories, не новый artifact service.
Directory group хранит original declaration, sorted child locators, UTF-8 hashes
и explicit excluded binary entries (locator/reason). File source сохраняет свой
single-source путь. Contents не склеиваются с provenance в одну непрозрачную строку.

- Только конкретный directory subtree, никогда namespace root/project root/home,
  `.git`, `node_modules`, `.zcode`, provider/config/auth homes. Их не читаем как
  implicit context. Scoped allowlist — source declaration, не derived host paths.
- Containment/physical identity до каждого read. Для implicit directory child
  physical containment — **canonical subtree самой declared directory**, не
  весь namespace project/workspace/run. Symlink к sibling .zcode/config не даёт
  чтение даже внутри project. Directory symlink — явный reject, не silent skip;
  escaping symlink, FIFO/device/special file reject. Regular-file aliases внутри
  declared subtree dedup с contributors; отдельно declared file имеет свой
  явный namespace boundary. Forbidden/private exclusions применяются к lexical
  locator **и** physical target. Roles выводятся из declared provenance,
  валидатор не доверяет отдельно присланному role union.
- Regular UTF-8 admission; явно declared file с invalid encoding reject. У
  directory non-text binary entries только explicit exclusion reason, не binary
  prompt bytes. Если requirement опирается на excluded artifact, его объявляют
  отдельно подходящим evidence source; нельзя считать binary grounding сохранённым.
  Не исключать неудобные textual accepted документы по размеру/содержимому.
  Text/binary правило deterministic: для directory известных text extensions
  .md/.json/.jsonl/.txt/.log/.yaml/.yml malformed UTF-8 либо NUL reject; остальные
  regular files с valid UTF-8 без NUL включаются, иначе recorded non-text exclusion.
  Перед чтением проверяется descriptor size, новый collector читает максимум
  cap+1 bytes через тот же descriptor (включая growth после stat); не allocate
  unbounded readRegularFile и только потом смотреть на размер. Size/entry bounds
  применяются и к бинарным entries; oversized unknown не silently binary-skip.
- Safety limits: <=1024 text files, <=1 MiB/file, <=8 MiB sum directory text
  per packet. Превышение — явный judge_context_invalid до Session с locator,
  не truncation/timeout. Это input guard, не work duration и не config framework.
  Actual retained fixture trees измерить при реализации; границу изменять только
  по измерениям, не для сокрытия missing context. Даже excluded entry enumeration
  ограничена <=4096 total entries, <=32 directory depth — не unbounded walk.
- Дедуп physical file и stable relative locator sort. Contributors связывают
  parent declaration, child locator и original role. Frozen manifest membership
  и hashes входят в packet/receipt identity; retained read не traversе mutable RUN.
  Drift detection: две sorted membership enumerations до/после, descriptor
  identity/size/mtime до/после чтения. Observed change — invalid, не partial success.
  Это не atomic multi-file snapshot: без existing writer barrier нельзя обещать
  согласованный момент всех файлов. Использовать retained stable Stage boundary
  где он уже доступен; новый global lock service не создавать.
- Required empty directory — empty manifest, не missing; обязательный конкретный
  artifact должен быть declared required file. Optional missing не равен encoding/
  permission/containment error. Drift во время snapshot — invalid, не unavailable.

### 9.4 Перепроверенные новые findings и non-fixes

| Проверка основного агента | Результат / дополнение |
|---|---|
| validateExpectedAtoms с NOT_IN_FIXTURE | Helper принимает: M08 validation before native |
| Item fixture_gap/[] с expected atoms covered/[a] | Helper принимает: incoherent oracle подтверждён |
| Directory lib как declared source | judge_context_invalid/input_file_not_regular; PLAN+ directory paths проверены в blueprint |
| Mutate role orientation → initial_user_request в packet | Shared validator возвращает matched; current receipt hashes не обходились; M11, не exploit claim |
| Render actual finalJudgePrompt | Нет explicit untrusted-data boundary; M12 common block |
| Temp tools из retained typed journals | Scratch есть и у PASS (/tmp/out.json); collision не доказана |
| Receipt key/rebuild/cleanup | No new stale-proof bypass; whole tree key оставлен; не cache redesign |
| FLOW classifier search | Duplicate HITL matcher не найден; per-harness patches не нужны |

Source anchors исходной версии: hitl-contract.mjs:41–71,86–121,126;
hitl-corpus.mjs:13–42; entry-pack.mjs:49–73; runner.mjs:2086–2152,
2194–2295,2809–2915; hitl-retained.mjs:22–47; smoke:24–34.
Supplement frozen rubric и attribution evaluation_infrastructure не превращать
в Subject blame: категория описывает validity, не proof виновности fixture автора.
Whole-tree qualification key — intentional conservative choice; docs-only cache
invalidation не current correctness defect. Не redesign этого механизма.

После дополнительного challenge review учтены: witness signature collisions,
bundle с union нескольких response IDs, обязательный active coverage gate,
bounded read до allocation, declared-subtree containment и предел неатомарного
multi-file snapshot. Это проверка готовности **плана**, не выполненные фиксы.

### 9.5 Выполненные проверки этой задачи

- Main read-only probes подтвердили M08/M10/M11/M12 и проверили реальные Stage
  directory declarations; subagent findings перепроверены по исходникам.
- Ранее main omission probe: Q1-only verdict для exact CP190 проходит текущие
  validator/oracle/summary checks. Это negative future regression, не новый
  принятый qualification receipt.
- `node --test test/hitl-contract.test.mjs test/hitl-corpus.test.mjs
  test/hitl-retained.test.mjs test/hitl-issuance.test.mjs
  test/evidence-schema.test.mjs`: **30/30 PASS**, zero fail/cancel/skip/todo.
  Это существующие structural/boundary tests до реализации, не semantic acceptance.
- В задаче изменён только этот plan; production code, case definition, historical
  artifacts, public package/global hooks, EVAL/runtime/config не менялись.

### 9.6 Итог ponytail challenge

Два small расширения existing data — gap basis и finite coverage — нужны, потому
что prompt phrase/aggregate equality уже показали предел. Directory manifest
нужен для **текущих** PLAN+ declarations, не speculative service. Всё прочее —
reuse guards, удаление лишних model-side checks и existing focused regressions.

Не включены second Judge, semantic parser, role authorization framework, source
cache service, зависимости, global home scans, cosmetic runner refactor, продуктовый
ordinal rank и повышение wall timeout. Exact quote checks не объявлены semantic
truth. Gates раздельны: implementation/offline, live qualification, full-cycle E2E.

## 10. Implementation-readiness: закрытые пробелы и edge cases

Эта перепроверка не меняет принятое продуктовое поведение и не добавляет новых
native запусков. Дополнения обязательны для реализации A–H, а не отдельный
параллельный проект. Повторный аудит выполнен основным агентом по callers и
read-only probes; новые субагенты в этой задаче не запускались.

### 10.1 Версии и режимы чтения: без implicit upgrade

| Артефакт / действие | Новый контракт / правило |
|---|---|
| Raw/stored match | `dd-eval/hitl-match@3`, новая v3 schema; v2 schema неизменна |
| Frozen packet | `dd-eval/interaction-judge-packet@3`, scope evidence + directory provenance |
| Active authored corpus | `dd-eval/hitl-qualification-corpus@2`, обязательный `coverage_required: true` |
| Qualification receipt/failure | `dd-eval/hitl-qualification@3`, identity связывает corpus/prompt/validator/context |
| Existing result receipt envelope | Сохранить имеющийся writer `dd-eval/interaction-judge-receipt@1`: его поля не меняются; reader не теряет ранее поддержанный @2 envelope |
| Historical grounded read | @2 match + @2 packet, все прежние event/hash/scope/cleanup anchors; без новой выдачи ответа |
| Historical @1 read | Только существующая явная legacy read ветка; не fallback при ошибке @2/@3 |
| Current issuance/recovery/admission | Только @3 match/packet/qualification; неизвестная или смешанная версия reject |

Новый corpus ID нужен, чтобы старый код не проигнорировал unknown coverage field
и не принял новую definition по старому aggregate-only правилу. Legacy corpus @1
остаётся доступным историческому reader, не current qualification/admission.
Case declaration sha256 обновляется после authored coverage; число items в отчёте
динамическое: минимум все исходные 17 плюс явно добавленные counterexamples.

Развести назначение callers, а не механически заменить все literals @2:
`hitlEvidenceFor` — read-only; productive/reference replay и answer issuance —
current. Сейчас `legacy: !data.verdict_contract` различает наличие anchors,
но **не** разрешение читать anchored @2 после перехода на @3. Historical read
должен быть явно разрешён caller-ом и не ослаблять grounded anchors. Нельзя
использовать legacy flag, чтобы скрыть неправильный contract/недостающий anchor.
Старые packet/receipt проверяются против своих frozen данных, не текущих files.

В `hitlProof` сохранять проверенный actual receipt contract, предварительно
assert current issuance; не наклеивать глобальный @3 на старый paid verdict.
При same-pause @3 recovery сохраняются exact retained prompt/profile/packet/
Session bindings. При чужой версии или изменении prompt identity остановиться
**до inspect/prompt/resume**, не выдавать новый Session как schema migration.
Published valid @3 verdict с unconfirmed cleanup допускает только existing
cleanup recovery, не повтор Judge. Unknown paid outcome остаётся blocker.
Для **published** @3 reuse prompt/Session binding проверять также по existing
`capacity-chain@2` (filename identity и retained prompt_sha256/Session), не только
в ветке missing result.json. Переиспользовать read-only validation существующей
chain; отсутствие binding — reject, не synthesize. Новый receipt envelope/ledger
для этого не нужен. Historical @2 reader не требует нового proof задним числом.

### 10.2 Валидация входа до оплаты — M14/M15

Выделить packet-only часть **существующего** shared validator; сборщик и verdict
validator используют её, без second validation framework. Проверять весь authored
corpus и все stage fixtures/contexts до **первого** native Session, не только
очередной item после семи оплаченных PASS.

- Responses: object, nonempty unique ID/answer, ожидаемые descriptors; невалидный
  fixture reject раньше. Empty responses допустимы для context-only genuine gap,
  но не covered evidence. Не требовать хотя бы один canonical answer всегда.
- HITL semantic context: optional objective, если есть — nonempty string;
  optional accepted_decisions, если есть — array строк, каждая nonempty; `[]` допустим.
  Absent/null subject context допустим по существующему API; scope_evidence не
  может ссылаться на отсутствующее поле. Индекс — safe nonnegative integer,
  строго в пределах array; `field: objective` не допускает index.
- Tagged scope evidence: exact keys каждого варианта, known IDs, exact contiguous
  quote, no extra keys; duplicates сравнивать как объекты, не по порядку JSON keys.
  Empty/whitespace-only quote, metadata/paths/reason и вопрос как gap basis reject.
- Packet version, stage, required_result и grounding declarations согласованы.
  Если required и optional указаны одновременно, они должны быть логическими
  противоположностями; conflict reject, а не выбор удобного missing поведения.
  Invalid frozen packet — input error до Session; malformed model output —
  judge_result_invalid, не «доказанный fixture_gap».

Не менять meaning публичного/исторического `stage-context@1` и его schema под
тем же ID: M14 закрывается в новом HITL consumer @3. `dynamic_roles` не становится
новым schema framework. Для source roles сохранить существующие default roles
там, где API их допускает, но проверить nonempty string и точный contributor.
Materiality source quote проверяет происхождение, не объявляет любой README,
plan recommendation или role с названием accepted доказанным accepted scope.

### 10.3 Directory pipeline целиком, а не только reader

Один collector используется `buildHitlPacket`, `qualificationContext`, snapshot
materialization и qualification rebuild. Existing `readRegularFile` не расширять
до recursive reader для всех остальных consumers. Directory entries в new
qualification binding должны хранить type/membership, а не пытаться вызвать
`sha256(readRegularFile(directory))`.

Зафиксировать минимальную внутреннюю форму @3:

- Packet field `directory_sources`: array groups с exact keys
  `{declaration:{collection,index}, root,path,role, files:[{path,source_id}],
  exclusions:[{path,reason}]}`. `files.path`/`exclusions.path` — relative child
  locators, hashes/text берутся из связанных grounding_sources, не дублируются.
  Source origin сохраняет `{root,path,roles}` и добавляет
  `contributors:[{collection,index,child_path}]`; root/path первого contributor
  соответствуют resolved file locator, roles проверяются по всем contributors.
  Arrays всегда присутствуют в @3, включая `directory_sources: []` без directories.
- Каждый directory group связывает declaration `{collection, index}` с её root,
  path и original role; collection только sources/task_input. Files имеют sorted
  relative locators + source_id; exclusions имеют locator + deterministic reason;
  empty directory имеет обе пустые arrays. Optional-missing declaration — отдельно
  unavailable, не empty manifest. Не добавлять новое поле в stage context.
- Source origin contributors связывают declaration и relative child locator
  (direct file — пустой child locator). Declared roots/paths/roles сверяются по
  packet.subject_context, normalized roles — exact deduplicated union. Source IDs
  присваиваются в deterministic declaration/child order; alias не теряет второй
  contributor, directory/file overlap не дублирует text или byte budget.
  Dedup key — canonical realpath, как в existing builder, не новый inode registry.
  Sort — deterministic JS lexical order без locale/Unicode normalization;
  directory depth root=0. Hard links с разными canonical paths не объявлять одним
  доказанным physical alias в retained evidence.
- `entry.sha256` остаётся checksum **file bytes**; directory с таким полем reject
  до Session, не переопределять его как manifest hash. Directory identity входит
  в общий packet/context hash через canonical manifest. Excluded binary bytes
  не становятся scope evidence и не требуют собственной «вечной неизменности».
- Qualified snapshot сохраняет declaration layout и empty directories. Optional
  missing остаётся missing. Existing snapshot проверяется по exact membership,
  text hashes и exclusion outcomes: неизменных файлов недостаточно, добавленный
  child не может остаться незамеченным. Для self-contained rebuild минимальный
  путь — копировать также bounded regular binary entries из **declared subtree**
  в owned snapshot через existing per-file materialization, не recursive cp
  неизвестного дерева с verbatim symlinks. Binary остаётся explicit
  exclusion в manifest и никогда не попадает в prompt или scope evidence; копия
  нужна для воспроизводимости membership/text-admission, не как acceptance input.
  Не добавлять sidecar injection/frozen-source override только ради binary.
  Guard при копировании не разрешает symlinks/special files/forbidden targets;
  каждый read bounded, handles закрываются и на ошибке. Qualification inputs
  уже immutable по definition tree; это не правило мониторить любые provider files.
- Проверять text/binary outcome при qualification rebuild относительно authored
  inputs; retained evidence read использует frozen manifest, без повторного
  обхода mutable RUN. Scope source_id относится только к text source, не manifest.

Manifest validator проверяет unique locators/IDs, safe relative child paths,
согласованность group↔source↔contributors и forbidden targets. Aliases могут быть
дедуплицированы physical path при сборке, но retained checker не пытается
доказывать физическое inode равенство через изменившийся host. Не обещать sandbox
изоляцию от враждебного concurrent writer или атомарный filesystem snapshot.
Передача mutable Stage context должна происходить на существующей стабильной
accepted границе; наблюдаемый drift — explicit invalid, не retry-until-PASS.

Measured retained REV-117, **только declared directory subtrees** текущего
blueprint, metadata walk без чтения private/provider homes:

| Stage | Directory declarations | Regular files | Bytes (включая non-text) | Largest file |
|---|---:|---:|---:|---:|
| PLAN | 1 | 51 | 225300 | 37959 |
| PLAN-REVIEW | 2 | 60 | 319604 | 37959 |
| CODE | 2 | 61 | 285785 | 37959 |
| CODE-REVIEW | 3 | 81 | 306645 | 37959 |

MERGE snapshot здесь отсутствует (ENOENT), поэтому его объём **не проверен**.
Это обоснование, что §9.3 caps не блокируют измеренные inputs, не гарантия любых
будущих logs. При реализации дополнительно измерить актуальный accepted MERGE
context, если доступен; oversized input — честный admission blocker с locator,
никогда silent omission. Budget считается по unique text bytes (UTF-8 Buffer),
не по JS string.length; entry enumeration ограничена независимо от dedup.

### 10.4 Oracle и semantic precedence: решения без противоречий

Сохранить finite oracle, но fully validate authored shape до native create:
nonempty unique IDs/quotes, exact key sets, allowed classifications, known stage
response IDs, boolean coverage_required, unique references. Не выводить expected
obligations автоматически из verdict и не хранить expected_coverage в Judge packet.
Live loop, cleanup-error retained verdict branch и cached receipt validation
используют один comparator с projection helper; не три независимых comparisons.

Expected case не может «починиться» от широкого witness: obligations имеют
содержательное авторское обоснование на oracle стороне. Для Q1/Q2/Q3 сохранить
подробные минимальные независимые обязанности, не только три общих заголовка.
У реального mixed gap присутствие covered atom не должно маскировать отсутствующий
uncovered atom даже при unchanged aggregate class/response IDs. Перестановка atoms
и response evidence допустима; byte quotes/CRLF/UTF-8 не normalize ради совпадения.

Prompt precedence зафиксировать явно: unresolved **material reference** не
разрешается ответом; после определения предмета явный exact refusal/replacement
может покрыть дополнительное предложение. Нет такого ответа + extra scope —
out_of_scope, не fixture_gap. Necessary accepted unresolved decision — gap;
sole repeated accepted decision без нового условия — unnecessary_question.
Не раскладывать обоснования/опции в новые обязательные product decisions.
Материальную неясность сохранить, а не решать по наличию похожей answer quote.

Один invalid raw verdict — invalid, а не implicit semantic repair. Удаление
обязательного shell self-check не разрешает редактировать packet/answer/source.
Native smoke получает authored expectations только в driver/oracle, не Judge;
schedule и repetitions фиксируются до first call, FAIL сохраняется и останавливает
acceptance. Existing triple reference-pair schedule не считать retry-until-PASS.

### 10.5 Ошибки, тесты и закрытие реализации

Qualification mismatch code не является Subject failure и не доказывает дефект
fixture. Добавить новый code в existing infrastructure/CLI diagnostic tests;
qualification до scored EVAL не создаёт fake scored result. При valid retained
verdict + cleanup failure comparator сохраняет semantic mismatch отдельно от
cleanup failure; receipt всё равно не admission-ready. Не терять ни одну причину
и не подменять unknown/invalid output семантической классификацией. Historical
failure codes и raw result bytes не переписывать.

Обязательные runnable regressions в существующих suites:

1. M14/M15 malformed context/duplicate IDs/unknown oracle ID/late invalid item:
   driver counters = 0 для create/prompt/resume, включая smoke и cached admission.
2. v3 raw/stored schema/runtime agreement + всех tagged scope variants; index
   bounds, source role forgery, mixed @2/@3, unknown versions. @2 historical read
   PASS с anchors; current @2 replay/issuance FAIL **без native calls**; @1 legacy
   не понижает anchors. Valid same-pause @3 reuse/recovery не повторяет paid Turn.
3. Actual PLAN blueprint + qualification materializer + retained packet rebuild:
   directory/file overlap, два alias contributors, empty/optional-missing,
   added/deleted child, binary exclusion, binary→text drift, direct file checksum,
   invalid UTF-8/NUL, cap+1 growth, boundary ровно cap, escape/special-file reject.
4. Каждый coverage obligation независимо удаляется из valid observed verdict;
   M01 false gap с superficially valid scope quote; split/bundle/coherence и
   collisions; current cached qualification проверяет тот же oracle, что live.
5. Neutral mismatch diagnostics, retained semantic+cleanup errors, common Final/
   Supplemental injection boundary, incomplete-stage policy и unchanged criterion
   IDs. Structural test names не обещают model semantic correctness.

Готовность реализации — A–H и каждый M01–M15 имеют изменение, regression и
результат либо проверенное объяснение «изменение не требуется». G1–G5 выполняются
на actual revisions без skipped tests; G6/G7 остаются отдельной живой приёмкой.
В этой readiness задаче production code/case/runtime не менялись; два новых
offline probes подтвердили M14/M15. Проверка ponytail повторена: переиспользуются
существующие modules/runner/schema/test infrastructure, не новый semantic engine,
universal directory service, context framework или configuration layer.
Повторная focused проверка пяти suites: **30/30 PASS**, zero fail/cancel/skip/todo;
whitespace check плана PASS. Это baseline текущего кода, не G1–G5 новых фиксов.

## 11. Реализация 2026-10-06

M01/M02/M06/M14/M15: общий hitl-contract@3, schema@3, typed scope evidence,
packet-only admission и prompt materiality/reference policy. Ненужный shell
self-check удалён; происхождение цитаты не выдаётся за semantic entailment.

M03/M04/M08/M09: общий finite coverage comparator и coherent current corpus@2.
Все исходные 17 вопросов, expected classes/IDs и канонические ответы сохранены;
добавлены три scope counterexamples. CP195 receipt сохранён byte-exact negative
fixture. Valid split/bundle не связан с общим количеством atoms.

M05/M13: explicit authored corpus smoke, fixed reference-pair schedule с authored
expectations, preflight всего schedule и full frozen packet comparison до Session.
Первый semantic/structural/cleanup failure прекращает dispatch, без retry-until-PASS.

M07: neutral definition_qualification_mismatch, один comparator в live/cache и
retained cleanup-error ветках; bounded diagnostics сохраняют обе причины.

M10/M11: один bounded directory collector для packet, qualification inputs,
owned materialization и cached rebuild. Checked contributors/roles, aliases,
empty/optional sources, binary exclusions, descriptor cap+1 и observed drift.
Дополнительно при интеграции исправлен общий materializer: optional:true теперь
поддерживается согласованно с required:false; тип optional проверяется.
Это не атомарный filesystem snapshot и не разрешение обходить provider homes.

M12: common Final/Supplemental untrusted-data boundary при неизменных rubric,
scope IDs, proof limits и incomplete-stage policy.

Current issuance/recovery использует @3. Anchored historical @2 и explicit legacy
@1 остаются read-only, не создают новых answers/Turns. Published reuse проверяет
retained Session/prompt binding и completed native result; unknown outcome не
порождает второй платный Turn. Новых ledger/framework/dependencies нет.

FLOW, продукт, canonical responses, models, global hooks и исторические операции
не изменены. Новые Judge/qualification/E2E не запускались. Merge main запрещён
до отдельной команды пользователя; фиксируем только рабочую ветку.

Проверка: focused core/source/corpus/smoke/materializer 61/61 PASS;
runner/retained suites 125/125 PASS; managed-resume 3/3 PASS, без skips.
Полный paired suite проводится на committed definition: до commit case edits
правильно вызывают runner_definition_drift в recovery tests. Этот guard не ослаблен.
Результат полного suite будет добавлен после проверки committed revision.

Первый полный paired suite на dae5bba: 576/576 PASS, zero fail/cancel/skip/todo,
265652 ms. Во время final read-only review дополнительно обнаружен loophole
reference-pair smoke: unrelated ambiguous/covered questions могли считаться
contrast. Исправлено до native dispatch: question/stage/canonical responses
должны совпадать; меняются только grounding/context. Добавлена offline регрессия.
Focused smoke после дополнения: 7/7 PASS. Итоговый полный прогон повторяется
на следующей committed source revision.
